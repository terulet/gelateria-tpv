// ============================================================
//  POS Gelateria — Main de Electron v4 + FLAMA Update
//  Envuelve el TPV existente (backend Express en :3001) en una
//  app de escritorio Windows. NO toca la lógica de negocio,
//  impresión ni cajón: solo arranca el backend y abre la ventana.
// ============================================================
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 3001;
const URL = `http://localhost:${PORT}`;

// ---- Instancia única -------------------------------------------------
// Si ya hay una copia abierta, enfocamos esa y cerramos esta.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ---- Ruta de datos escribible (userData) -----------------------------
// C:\Users\<user>\AppData\Roaming\POS Gelateria\
// db.js leerá POS_DB_DIR y guardará ahí pos.sqlite, config, etc.
// Esto es obligatorio: Program Files es de solo lectura.
const userDataDir = app.getPath('userData');
process.env.POS_DB_DIR = userDataDir;

// ---- Arrancar el backend Express en el mismo proceso -----------------
// server.js hace app.listen(3001) al ser requerido. Con require() no hay
// ventana de consola aparte ni proceso hijo que ocultar.
function arrancarBackend() {
  try {
    require(path.join(__dirname, '..', 'servidor', 'server.js'));
  } catch (err) {
    // Si el puerto ya está ocupado (EADDRINUSE), asumimos que hay otro
    // backend vivo y seguimos: la ventana cargará contra ese.
    if (err && err.code === 'EADDRINUSE') {
      console.warn('Puerto 3001 ocupado; reutilizando instancia existente.');
    } else {
      console.error('Error arrancando backend:', err);
    }
  }
}

// ---- Esperar a que el backend responda -------------------------------
function esperarBackend(timeoutMs = 60000, intervalo = 500) {
  const inicio = Date.now();
  return new Promise((resolve, reject) => {
    const probar = () => {
      const req = http.get(URL, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - inicio > timeoutMs) {
          reject(new Error('El backend no respondió en 60 s'));
        } else {
          setTimeout(probar, intervalo);
        }
      });
      req.setTimeout(1000, () => req.destroy());
    };
    probar();
  });
}

// ---- Ventana del TPV -------------------------------------------------
function crearVentana() {
  Menu.setApplicationMenu(null); // sin barra de menú

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    fullscreen: true,           // pantalla completa para el TPV
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'icono.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(URL);

  // Sin DevTools en producción. Se pueden abrir en dev con POS_DEV=1.
  if (process.env.POS_DEV === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}



// ---- Backup diario automático e invisible ----------------------------
// Se ejecuta después de abrir el TPV, sin ventanas y sin bloquear ventas.
function backupDiarioInvisible() {
  setTimeout(() => {
    try {
      const ahora = new Date();
      const yyyy = ahora.getFullYear();
      const mm = String(ahora.getMonth() + 1).padStart(2, '0');
      const dd = String(ahora.getDate()).padStart(2, '0');
      const dia = `${yyyy}-${mm}-${dd}`;
      const raiz = path.join(app.getPath('documents'), 'TPV-Gelateria-Backups');
      const destino = path.join(raiz, dia);
      const marca = path.join(destino, 'BACKUP_OK.txt');
      if (fs.existsSync(marca)) return;

      fs.mkdirSync(destino, { recursive: true });
      const datosDestino = path.join(destino, 'datos');
      fs.cpSync(userDataDir, datosDestino, { recursive: true, force: true });
      const asar = path.join(process.resourcesPath, 'app.asar');
      if (fs.existsSync(asar)) fs.copyFileSync(asar, path.join(destino, 'app.asar'));
      fs.writeFileSync(path.join(destino, 'estado.json'), JSON.stringify({
        version: 'TPV Gelateria v4.0.0 + FLAMA Update',
        fecha: ahora.toISOString(),
        datos: userDataDir,
        appAsarIncluido: fs.existsSync(path.join(destino, 'app.asar'))
      }, null, 2));
      fs.writeFileSync(marca, `Backup correcto: ${ahora.toISOString()}\n`);

      // Mantener 30 días. Nunca interrumpe el TPV si la limpieza falla.
      const limite = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const nombre of fs.readdirSync(raiz)) {
        const carpeta = path.join(raiz, nombre);
        try {
          if (fs.statSync(carpeta).isDirectory() && fs.statSync(carpeta).mtimeMs < limite) {
            fs.rmSync(carpeta, { recursive: true, force: true });
          }
        } catch (_) {}
      }
    } catch (err) {
      try {
        const logDir = path.join(app.getPath('documents'), 'TPV-Gelateria-Backups');
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(path.join(logDir, 'backup-errors.log'), `${new Date().toISOString()} ${err.stack || err.message}\n`);
      } catch (_) {}
    }
  }, 15000);
}

// ---- Ciclo de vida ---------------------------------------------------
app.whenReady().then(async () => {
  arrancarBackend();
  try {
    await esperarBackend();
  } catch (e) {
    console.error(e.message);
  }
  crearVentana();
  backupDiarioInvisible();
});

app.on('window-all-closed', () => {
  app.quit();
});

