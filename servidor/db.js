// ============================================================
//  BASE DE DATOS - La Gelateria de Roses POS
//  SQLite puro, sin dependencias externas (usa node:sqlite)
// ============================================================

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const { CATEGORIAS, PRODUCTOS } = require('./productos-iniciales.js');

// Ruta de datos:
//  - En modo Electron/producción, el main pasa POS_DB_DIR (ej. userData).
//  - En desarrollo (sin POS_DB_DIR), se usa la carpeta local ../datos como antes.
const fs = require('fs');
const datosDir = process.env.POS_DB_DIR
  ? process.env.POS_DB_DIR
  : path.join(__dirname, '..', 'datos');
if (!fs.existsSync(datosDir)) fs.mkdirSync(datosDir, { recursive: true });

const DB_PATH = path.join(datosDir, 'pos.sqlite');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Migración: añadir columna 'color' si la BD es de una versión anterior
try {
  const cols = db.prepare("PRAGMA table_info(productos)").all();
  if (cols.length && !cols.some(c => c.name === 'color')) {
    db.exec('ALTER TABLE productos ADD COLUMN color TEXT');
    console.log('  (migració: columna color afegida)');
  }
} catch (e) { /* tabla aún no existe, se creará abajo */ }

// Migración: añadir columna 'fidelitat' a ventas si no existe
try {
  const cols = db.prepare("PRAGMA table_info(ventas)").all();
  if (cols.length && !cols.some(c => c.name === 'fidelitat')) {
    db.exec('ALTER TABLE ventas ADD COLUMN fidelitat INTEGER NOT NULL DEFAULT 0');
    console.log('  (migració: columna fidelitat afegida)');
  }
} catch (e) { /* tabla aún no existe */ }

// ---------- ESQUEMA ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id      TEXT PRIMARY KEY,
    nombre  TEXT NOT NULL,
    color   TEXT NOT NULL,
    orden   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ajustes (
    clave   TEXT PRIMARY KEY,
    valor   TEXT
  );

  CREATE TABLE IF NOT EXISTS productos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria  TEXT NOT NULL REFERENCES categorias(id),
    nombre     TEXT NOT NULL,
    precio     REAL NOT NULL DEFAULT 0,
    color      TEXT,
    activo     INTEGER NOT NULL DEFAULT 1,
    orden      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    rol       TEXT NOT NULL DEFAULT 'staff'  -- 'staff' | 'admin'
  );

  -- Lista de trabajadores (para el control de quién coge producto)
  CREATE TABLE IF NOT EXISTS trabajadores (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL,
    activo  INTEGER NOT NULL DEFAULT 1
  );

  -- Cada ticket / venta
  CREATE TABLE IF NOT EXISTS ventas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha         TEXT NOT NULL,            -- ISO datetime
    dia_operativo TEXT NOT NULL,            -- YYYY-MM-DD del cierre al que pertenece
    total         REAL NOT NULL,
    descuento_pct INTEGER NOT NULL DEFAULT 0,
    fidelitat     INTEGER NOT NULL DEFAULT 0, -- premio fidelitat aplicado (-3€)
    trabajador    TEXT,                     -- nombre del staff que hizo la venta
    metodo_pago   TEXT NOT NULL DEFAULT 'efectivo', -- 'efectivo' | 'tarjeta'
    cierre_id     INTEGER REFERENCES cierres(id),
    estado        TEXT NOT NULL DEFAULT 'activa'  -- 'activa' | 'anulada' | 'editada'
  );

  -- Líneas de cada venta
  CREATE TABLE IF NOT EXISTS venta_lineas (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id     INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id  INTEGER,
    nombre       TEXT NOT NULL,            -- guardamos el nombre por si cambia el producto
    precio_unit  REAL NOT NULL,
    cantidad     INTEGER NOT NULL DEFAULT 1,
    subtotal     REAL NOT NULL
  );

  -- Cierres de caja diarios
  CREATE TABLE IF NOT EXISTS cierres (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    dia_operativo  TEXT NOT NULL,
    abierto_en     TEXT NOT NULL,
    cerrado_en     TEXT,
    total_efectivo REAL NOT NULL DEFAULT 0,
    total_tarjeta  REAL NOT NULL DEFAULT 0,
    total_ventas   REAL NOT NULL DEFAULT 0,
    num_tickets    INTEGER NOT NULL DEFAULT 0,
    estado         TEXT NOT NULL DEFAULT 'abierto' -- 'abierto' | 'cerrado'
  );

  -- Registro de aperturas de cajón (el botón "Abrir Caja")
  CREATE TABLE IF NOT EXISTS aperturas_cajon (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha       TEXT NOT NULL,
    trabajador  TEXT,
    motivo      TEXT
  );

  -- Registro de anulaciones de venta (auditoría)
  CREATE TABLE IF NOT EXISTS anulaciones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha        TEXT NOT NULL,
    venta_id     INTEGER,
    total        REAL,
    trabajador   TEXT,
    anulado_por  TEXT
  );
`);

// ---------- MIGRACIONES (para BD que ya existían) ----------
try {
  const cols = db.prepare("PRAGMA table_info(ventas)").all();
  if (!cols.some(c => c.name === 'estado')) {
    db.exec("ALTER TABLE ventas ADD COLUMN estado TEXT NOT NULL DEFAULT 'activa'");
  }
} catch (e) { /* ok */ }

// Registro de modificaciones de tickets (auditoría de ediciones de línea)
db.exec(`
  CREATE TABLE IF NOT EXISTS modificaciones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha        TEXT NOT NULL,
    venta_id     INTEGER,
    accion       TEXT,      -- 'anular' | 'editar_linea' | 'quitar_linea'
    detalle      TEXT,      -- descripción legible del cambio
    total_antes  REAL,
    total_despues REAL,
    hecho_por    TEXT
  );
`);
function hashPass(pass) {
  return crypto.scryptSync(pass, 'gelateria-roses-salt', 32).toString('hex');
}

function seed() {
  const countCat = db.prepare('SELECT COUNT(*) c FROM categorias').get().c;
  if (countCat === 0) {
    const insCat = db.prepare('INSERT INTO categorias (id, nombre, color, orden) VALUES (?, ?, ?, ?)');
    for (const c of CATEGORIAS) insCat.run(c.id, c.nombre, c.color, c.orden);

    const insProd = db.prepare('INSERT INTO productos (categoria, nombre, precio, color, orden) VALUES (?, ?, ?, ?, ?)');
    PRODUCTOS.forEach((p, i) => insProd.run(p.categoria, p.nombre, p.precio || 0, p.color || null, i));
    console.log(`✅ Insertadas ${CATEGORIAS.length} categorías y ${PRODUCTOS.length} productos amb preus i colors.`);
  }

  const countUsers = db.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
  if (countUsers === 0) {
    const insU = db.prepare('INSERT INTO usuarios (username, pass_hash, rol) VALUES (?, ?, ?)');
    // Usuario ADMIN (tú) — cámbialo desde el panel luego
    insU.run('admin', hashPass('admin'), 'admin');
    // Usuario STAFF (todos)
    insU.run('staff', hashPass('staff'), 'staff');
    console.log('✅ Usuarios creados: admin/admin y staff/staff (¡cambia las contraseñas!).');
  }
}
seed();

module.exports = { db, hashPass };

