# ============================================================
# RAW printer worker for POS Gelateria
# Mantiene WinSpool cargado para imprimir/abrir cajón rápido.
# Entrada: líneas JSON { id, printer, data } donde data = base64.
# Salida: líneas JSON { id, ok, error? }
# ============================================================
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static void SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter = IntPtr.Zero;
    IntPtr pUnmanagedBytes = IntPtr.Zero;
    Int32 dwWritten = 0;

    DOCINFOA di = new DOCINFOA();
    di.pDocName = "POS Gelateria RAW ESC/POS";
    di.pDataType = "RAW";

    try {
      if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero)) {
        int err = Marshal.GetLastWin32Error();
        throw new Exception("OpenPrinter ha fallat. Codi Windows: " + err + ". Impressora: " + printerName);
      }
      if (!StartDocPrinter(hPrinter, 1, di)) {
        int err = Marshal.GetLastWin32Error();
        throw new Exception("StartDocPrinter ha fallat. Codi Windows: " + err + ". Impressora: " + printerName);
      }
      if (!StartPagePrinter(hPrinter)) {
        int err = Marshal.GetLastWin32Error();
        throw new Exception("StartPagePrinter ha fallat. Codi Windows: " + err + ". Impressora: " + printerName);
      }

      pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
      Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
      bool ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
      if (!ok || dwWritten != bytes.Length) {
        int err = Marshal.GetLastWin32Error();
        throw new Exception("WritePrinter ha fallat. Codi Windows: " + err + ". Escrits: " + dwWritten + "/" + bytes.Length);
      }
    }
    finally {
      try { if (hPrinter != IntPtr.Zero) EndPagePrinter(hPrinter); } catch {}
      try { if (hPrinter != IntPtr.Zero) EndDocPrinter(hPrinter); } catch {}
      if (pUnmanagedBytes != IntPtr.Zero) Marshal.FreeCoTaskMem(pUnmanagedBytes);
      if (hPrinter != IntPtr.Zero) ClosePrinter(hPrinter);
    }
  }
}
'@

while (($line = [Console]::In.ReadLine()) -ne $null) {
  $id = $null
  try {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $job = $line | ConvertFrom-Json
    $id = $job.id
    $bytes = [Convert]::FromBase64String([string]$job.data)
    [RawPrinterHelper]::SendBytesToPrinter([string]$job.printer, $bytes)
    @{ id = $id; ok = $true } | ConvertTo-Json -Compress
    [Console]::Out.Flush()
  } catch {
    @{ id = $id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
    [Console]::Out.Flush()
  }
}
