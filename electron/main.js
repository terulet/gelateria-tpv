// ============================================================
//  POS Gelateria — Main de Electron
//  Envuelve el TPV existente (backend Express en :3001) en una
//  app de escritorio Windows. NO toca la lógica de negocio,
//  impresión ni cajón: solo arranca el backend y abre la ventana.
// ============================================================
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');

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

// ---- Ciclo de vida ---------------------------------------------------
app.whenReady().then(async () => {
  arrancarBackend();
  try {
    await esperarBackend();
  } catch (e) {
    console.error(e.message);
  }
  crearVentana();
});

app.on('window-all-closed', () => {
  app.quit();
});

