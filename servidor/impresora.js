// ============================================================
//  Impresora térmica Posiflex (ESC/POS) + apertura de cajón
//  FINAL:
//  - Impresión directa RAW a la cola Windows "TIQUETS".
//  - Sin vista previa, sin window.print(), sin \\localhost, sin USB004.
//  - Cajón por comando Prigest real: 1B 70 00 19 A3.
//  - Worker PowerShell persistente para que abrir cajón sea mucho más rápido
//    que arrancar PowerShell en cada pulsación.
// ============================================================
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Resuelve la ruta de rawprint-worker.ps1 tanto en desarrollo como empaquetado.
// Empaquetado con Electron, este archivo vive en app.asar pero el .ps1 se
// desempaqueta con asarUnpack, así que __dirname contiene ".asar" y hay que
// apuntar a la versión ".asar.unpacked". PowerShell no puede leer dentro de un asar.
function resolverPs1() {
  const dir = __dirname.includes('app.asar')
    ? __dirname.replace('app.asar', 'app.asar.unpacked')
    : __dirname;
  return path.join(dir, 'rawprint-worker.ps1');
}

// En este TPV debe ser exactamente TIQUETS. Se puede cambiar desde Admin > Config.
let NOMBRE_IMPRESORA = process.env.POS_IMPRESORA || 'TIQUETS';
function setImpresora(nombre) { NOMBRE_IMPRESORA = String(nombre || 'TIQUETS').trim() || 'TIQUETS'; }
function getImpresora() { return NOMBRE_IMPRESORA; }

// --- Comandos ESC/POS ---
const ESC = 0x1B, GS = 0x1D;
const CMD = {
  init: Buffer.from([ESC, 0x40]),
  alignCenter: Buffer.from([ESC, 0x61, 0x01]),
  alignLeft: Buffer.from([ESC, 0x61, 0x00]),
  boldOn: Buffer.from([ESC, 0x45, 0x01]),
  boldOff: Buffer.from([ESC, 0x45, 0x00]),
  doubleOn: Buffer.from([GS, 0x21, 0x11]),
  doubleOff: Buffer.from([GS, 0x21, 0x00]),
  cut: Buffer.from([GS, 0x56, 0x42, 0x00]),
  feed: (n) => Buffer.from([ESC, 0x64, n]),

  // Pulso exacto encontrado en Prigest:
  // terminals.TERM_OBRIRCALAIX = 1B700019A3
  // TERM_CALAIXPORT = TIQUETS
  cajonPrigest: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xA3]),

  // Fallbacks por si alguna vez se cambia impresora/cajón.
  lf: Buffer.from([0x0A]),
  cajonPin2: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]),
  cajonPin2Fuerte: Buffer.from([ESC, 0x70, 0x00, 0x50, 0xFF]),
  cajonPin5: Buffer.from([ESC, 0x70, 0x01, 0x19, 0xFA]),
  cajonPin5Fuerte: Buffer.from([ESC, 0x70, 0x01, 0x50, 0xFF]),
};

function texto(s) {
  // latin1 va bien con el driver Generic/Text y evita depender de fuentes del navegador.
  return Buffer.from(String(s || '') + '\n', 'latin1');
}

function execCmd(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 15000, ...opts }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

// Si hay impresora guardada, no la validamos con Get-Printer en cada click: eso era lento.
async function obtenerNombreImpresora() {
  const nombre = (NOMBRE_IMPRESORA || '').trim();
  if (nombre) return nombre;

  // Fallback raro: si se borra el nombre, usar la predeterminada de Windows.
  const ps = `$p = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1; if ($p) { $p.Name }`;
  const { stdout } = await execCmd('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
  const predeterminada = String(stdout || '').trim().split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0];
  if (!predeterminada) throw new Error('No trobo cap impressora. Escriu TIQUETS a Config i desa.');
  return predeterminada;
}

// ============================================================
//  Worker RAW rápido
// ============================================================
let worker = null;
let workerReady = null;
let workerSeq = 1;
let workerStdout = '';
const pending = new Map();

function matarWorkerPendientes(error) {
  for (const [, job] of pending) {
    clearTimeout(job.timer);
    job.reject(error);
  }
  pending.clear();
}

function procesarLineaWorker(line) {
  const txt = String(line || '').trim();
  if (!txt || !txt.startsWith('{')) return;
  let msg;
  try { msg = JSON.parse(txt); } catch { return; }
  const job = pending.get(String(msg.id));
  if (!job) return;
  pending.delete(String(msg.id));
  clearTimeout(job.timer);
  if (msg.ok) job.resolve(true);
  else job.reject(new Error(msg.error || 'Error RAW worker'));
}

function iniciarWorkerRaw() {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('RAW worker només funciona a Windows'));
  }
  if (worker && !worker.killed && worker.exitCode == null) return Promise.resolve(worker);
  if (workerReady) return workerReady;

  workerReady = new Promise((resolve, reject) => {
    const ps1 = resolverPs1();
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    worker = child;

    let arrancado = false;
    const failStart = (err) => {
      if (!arrancado) reject(err);
      matarWorkerPendientes(err);
      worker = null;
      workerReady = null;
    };

    child.stdout.on('data', (chunk) => {
      workerStdout += chunk.toString('utf8');
      const lines = workerStdout.split(/\r?\n/);
      workerStdout = lines.pop() || '';
      for (const line of lines) procesarLineaWorker(line);
    });

    child.stderr.on('data', () => {
      // No mostramos ruido de PowerShell salvo si una petición concreta falla.
    });

    child.on('error', failStart);
    child.on('exit', () => failStart(new Error('El worker RAW de impressora s\'ha tancat')));

    // El Add-Type puede tardar un poco al arrancar. Lo calentamos al iniciar servidor.
    setTimeout(() => {
      arrancado = true;
      resolve(child);
    }, 650);
  });

  return workerReady;
}

async function enviarRawWorker(buffer, printerName) {
  const child = await iniciarWorkerRaw();
  const id = String(workerSeq++);
  const payload = JSON.stringify({
    id,
    printer: printerName,
    data: Buffer.from(buffer).toString('base64'),
  }) + '\n';

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Timeout enviant RAW a la impressora'));
    }, 9000);
    pending.set(id, { resolve, reject, timer });
    try {
      child.stdin.write(payload, 'utf8');
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(e);
    }
  });
}

// Arrancar/calentar el worker al levantar el TPV para que el primer cajón no tarde tanto.
if (process.platform === 'win32') {
  setTimeout(() => { iniciarWorkerRaw().catch(() => {}); }, 300);
}

// ============================================================
//  Fallback antiguo: PowerShell temporal con WinSpool
//  Solo se usa si el worker rápido falla.
// ============================================================
const RAW_PRINT_PS = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter = IntPtr.Zero; IntPtr pUnmanagedBytes = IntPtr.Zero; Int32 dwWritten = 0;
    DOCINFOA di = new DOCINFOA(); di.pDocName = "POS Gelateria RAW ESC/POS"; di.pDataType = "RAW";
    try {
      if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero)) return false;
      if (!StartDocPrinter(hPrinter, 1, di)) return false;
      if (!StartPagePrinter(hPrinter)) return false;
      pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
      Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
      bool ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
      EndPagePrinter(hPrinter); EndDocPrinter(hPrinter);
      return ok && dwWritten == bytes.Length;
    } finally {
      if (pUnmanagedBytes != IntPtr.Zero) Marshal.FreeCoTaskMem(pUnmanagedBytes);
      if (hPrinter != IntPtr.Zero) ClosePrinter(hPrinter);
    }
  }
}
'@
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$ok = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)
if (-not $ok) { $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error(); throw "WritePrinter ha fallat. Codi Windows: $err. Impressora: $PrinterName" }
`;

async function enviarRawWindowsLento(buffer, printerName) {
  const tmpBin = path.join(os.tmpdir(), 'pos-raw-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.bin');
  const tmpPs = path.join(os.tmpdir(), 'pos-raw-print-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.ps1');
  await fs.promises.writeFile(tmpBin, buffer);
  await fs.promises.writeFile(tmpPs, RAW_PRINT_PS, 'utf8');
  try {
    await execCmd('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs, '-PrinterName', printerName, '-FilePath', tmpBin], { timeout: 20000 });
    return true;
  } finally {
    fs.unlink(tmpBin, () => {});
    fs.unlink(tmpPs, () => {});
  }
}

async function enviarRaw(buffer) {
  const printerName = await obtenerNombreImpresora();
  try {
    return await enviarRawWorker(buffer, printerName);
  } catch (e1) {
    // Si el worker no arranca por política de Windows, usamos el método lento que ya funcionaba en v4.
    try {
      return await enviarRawWindowsLento(buffer, printerName);
    } catch (e2) {
      const d1 = e1.message || String(e1);
      const d2 = e2.stderr || e2.stdout || e2.message || String(e2);
      throw new Error('No s\'ha pogut enviar a la impressora. Worker: ' + d1 + ' / Fallback: ' + d2);
    }
  }
}

function bufferAperturaCajon() {
  return CMD.cajonPrigest;
}

function bufferAperturaCajonFallbacks() {
  return Buffer.concat([
    CMD.cajonPrigest, CMD.lf,
    CMD.cajonPin2, CMD.lf,
    CMD.cajonPin2Fuerte, CMD.lf,
    CMD.cajonPin5, CMD.lf,
    CMD.cajonPin5Fuerte, CMD.lf,
  ]);
}

// Abrir solo el cajón: se manda el pulso de 5 bytes a TIQUETS.
async function abrirCajon() {
  try {
    await enviarRaw(bufferAperturaCajon());
    return true;
  } catch (e1) {
    // Último recurso: paquete de pulsos alternativos.
    try {
      await enviarRaw(bufferAperturaCajonFallbacks());
      return true;
    } catch (e2) {
      throw new Error('No s\'ha pogut obrir el calaix. ' + (e1.message || String(e1)) + ' / ' + (e2.message || String(e2)));
    }
  }
}

// Imprimir ticket directo por ESC/POS. NO abre cajón salvo que se pida explícitamente.
async function imprimirTicket(datos, opciones = {}) {
  const L = [];
  L.push(CMD.init, CMD.alignCenter, CMD.boldOn, CMD.doubleOn);
  L.push(texto('La Gelateria'));
  L.push(texto('de Roses'));
  L.push(CMD.doubleOff, CMD.boldOff);
  L.push(texto('Maria Lluisa Garcia Navarra'));
  L.push(texto('NIF 40428475H'));
  L.push(texto('Carrer Pi i Sunyer, 6'));
  L.push(texto('17480 Roses'));
  L.push(CMD.alignLeft);
  L.push(texto('--------------------------------'));
  const f = datos.fecha ? new Date(datos.fecha) : new Date();
  L.push(texto(f.toLocaleString('ca-ES')));
  if (datos.id != null) L.push(texto('Tiquet #' + datos.id));
  L.push(texto('--------------------------------'));

  (datos.lineas || []).forEach(l => {
    const nom = (l.nombre || '').substring(0, 22).padEnd(22);
    const q = String(l.cantidad || 1).padStart(2);
    const subtotal = Number(l.subtotal != null ? l.subtotal : (Number(l.precio || l.precio_unit || 0) * Number(l.cantidad || 1)));
    const imp = (subtotal.toFixed(2) + ' E').padStart(8);
    L.push(texto(`${nom}${q}${imp}`));
  });

  L.push(texto('--------------------------------'));
if (datos.descuento) L.push(texto(`Descompte -${datos.descuento}%`));
if (datos.fidelitat) L.push(texto('Premi Fidelitat -3,00 E'));

const totalTicket = Number(datos.total || 0);
const ivaPct = Number(datos.iva_pct != null ? datos.iva_pct : 10);
const baseTicket = totalTicket / (1 + ivaPct / 100);
const ivaTicket = totalTicket - baseTicket;

L.push(CMD.alignCenter, CMD.boldOn, CMD.doubleOn);
L.push(texto(`TOTAL: ${totalTicket.toFixed(2)} E`));
L.push(CMD.doubleOff, CMD.boldOff);

L.push(CMD.alignLeft);
L.push(texto('--------------------------------'));
L.push(texto(`Base IVA ${ivaPct}%: ${baseTicket.toFixed(2)} E`));
L.push(texto(`IVA incluido: ${ivaTicket.toFixed(2)} E`));
L.push(texto(`Total IVA inc.: ${totalTicket.toFixed(2)} E`));

if (datos.entregado != null && Number(datos.entregado) > 0) {
  L.push(texto(`Entregat: ${Number(datos.entregado || 0).toFixed(2)} E`));
  L.push(texto(`Canvi: ${(Number(datos.entregado || 0) - Number(datos.total || 0)).toFixed(2)} E`));
}
  if (datos.metodo) L.push(texto(`Pagament: ${datos.metodo === 'tarjeta' ? 'Targeta' : 'Efectiu'}`));
  if (datos.trabajador) L.push(texto(`Ates per: ${datos.trabajador}`));
  L.push(CMD.feed(1));
  L.push(texto('Gracies i fins aviat!'));
  L.push(CMD.feed(3));

  if (opciones.abrirCajon) L.unshift(bufferAperturaCajon());
  L.push(CMD.cut);
  return enviarRaw(Buffer.concat(L));
}

module.exports = { abrirCajon, imprimirTicket, setImpresora, getImpresora };
