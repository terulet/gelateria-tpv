// Comprobación obligatoria previa al build.
// Si node:sqlite / DatabaseSync no existe, abortamos: el TPV no arrancaría.
try {
  const { DatabaseSync } = require('node:sqlite');
  if (typeof DatabaseSync !== 'function') throw new Error('DatabaseSync no disponible');
  console.log('[check] node:sqlite OK — DatabaseSync disponible.');
  process.exit(0);
} catch (e) {
  console.error('[check] ERROR: node:sqlite / DatabaseSync no disponible.');
  console.error('[check] Usa Electron con Node >= 22.5.0 (Electron 42.x). Build abortado.');
  process.exit(1);
}
