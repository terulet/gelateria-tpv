// ============================================================
// FLAMA Update v1 — actualizaciones OTA seguras para TPV Gelateria
// Sin dependencias externas: HTTPS, SHA-256, staging, agente externo
// y rollback automático. Los datos del TPV nunca se incluyen en el
// paquete de software ni se sustituyen durante una actualización normal.
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const APP_ID = 'com.lagelateria.tpv';
const APP_NAME = 'TPV Gelateria';
const APP_VERSION = '4.0.2';
const AGENT_VERSION = '1.0.0';
const DEFAULT_MANIFEST_URL = 'https://github.com/terulet/TPV-Gelateria-Updates/releases/latest/download/manifest.json';
const MAX_DOWNLOAD_BYTES = 150 * 1024 * 1024;
const MAX_MANUAL_UPLOAD_BYTES = 80 * 1024 * 1024;

function resolveUpdateRoot() {
  if (process.env.FLAMA_UPDATE_DIR) return process.env.FLAMA_UPDATE_DIR;
  const local = process.env.LOCALAPPDATA;
  if (local) return path.join(local, 'FLAMA Update', APP_NAME);
  const base = process.env.POS_DB_DIR || process.cwd();
  return path.join(base, 'FLAMA-Update');
}

const ROOT = resolveUpdateRoot();
const PATHS = {
  root: ROOT,
  config: path.join(ROOT, 'config.json'),
  state: path.join(ROOT, 'state.json'),
  runtime: path.join(ROOT, 'runtime-state.json'),
  pending: path.join(ROOT, 'pending.json'),
  request: path.join(ROOT, 'request.json'),
  result: path.join(ROOT, 'last-result.json'),
  log: path.join(ROOT, 'flama-update-node.log'),
  staging: path.join(ROOT, 'staging'),
  agent: path.join(ROOT, 'FLAMA-Update-Agent.ps1'),
};

const DEFAULT_CONFIG = {
  schema: 1,
  appId: APP_ID,
  appName: APP_NAME,
  installedVersion: APP_VERSION,
  manifestUrl: DEFAULT_MANIFEST_URL,
  autoCheck: true,
  autoDownload: true,
  autoInstallWhenClosed: true,
  autoInstallAtCashClose: true,
  checkEveryMinutes: 15,
  notificationWebhookUrl: '',
  agentVersion: AGENT_VERSION,
};

const DEFAULT_STATE = {
  schema: 1,
  appId: APP_ID,
  phase: 'idle',
  installedVersion: APP_VERSION,
  availableVersion: null,
  progress: 0,
  notes: '',
  lastCheckAt: null,
  lastSuccessAt: null,
  error: null,
  source: null,
};

function ensureDirs() {
  fs.mkdirSync(PATHS.root, { recursive: true });
  fs.mkdirSync(PATHS.staging, { recursive: true });
}

function appendLog(message) {
  try {
    ensureDirs();
    fs.appendFileSync(PATHS.log, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch (_) {}
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return clone(fallback);
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    appendLog(`JSON inválido ${file}: ${error.message}`);
    return clone(fallback);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function atomicWriteJson(file, value) {
  ensureDirs();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function loadConfig() {
  ensureDirs();
  const config = { ...DEFAULT_CONFIG, ...readJson(PATHS.config, {}) };
  // La versión real siempre la dicta el software que está arrancado.
  config.installedVersion = APP_VERSION;
  config.appId = APP_ID;
  config.appName = APP_NAME;
  config.agentVersion = AGENT_VERSION;
  atomicWriteJson(PATHS.config, config);
  return config;
}

function saveConfig(patch) {
  const current = loadConfig();
  const next = { ...current, ...patch, appId: APP_ID, appName: APP_NAME, installedVersion: APP_VERSION };
  next.checkEveryMinutes = Math.max(5, Math.min(1440, Number(next.checkEveryMinutes) || 15));
  if (next.manifestUrl && !/^https:\/\//i.test(next.manifestUrl)) {
    throw new Error('La URL del canal debe empezar por https://');
  }
  atomicWriteJson(PATHS.config, next);
  return next;
}

function loadState() {
  const state = { ...DEFAULT_STATE, ...readJson(PATHS.state, {}) };
  state.installedVersion = APP_VERSION;
  const result = readJson(PATHS.result, null);
  if (result && result.finishedAt && (!state.lastResultAt || result.finishedAt >= state.lastResultAt)) {
    state.lastResultAt = result.finishedAt;
    state.lastResult = result;
    if (result.ok) {
      state.lastSuccessAt = result.finishedAt;
      if (result.action === 'install' && result.version === APP_VERSION) {
        state.phase = 'success';
        state.error = null;
        state.availableVersion = null;
        state.progress = 100;
      }
    }
  }
  return state;
}

function updateState(patch) {
  const state = { ...loadState(), ...patch, installedVersion: APP_VERSION };
  atomicWriteJson(PATHS.state, state);
  return state;
}

function normalizeVersion(value) {
  const text = String(value || '').trim().replace(/^v/i, '');
  const match = text.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
  if (!match) throw new Error(`Versión no válida: ${value}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function compareVersions(a, b) {
  const aa = normalizeVersion(a).split('.').map(Number);
  const bb = normalizeVersion(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (aa[i] > bb[i]) return 1;
    if (aa[i] < bb[i]) return -1;
  }
  return 0;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function requestBuffer(url, options = {}, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); }
    catch (_) { reject(new Error('URL de actualización no válida')); return; }
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      reject(new Error('Solo se permiten canales HTTP/HTTPS'));
      return;
    }
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.get(parsed, {
      headers: {
        'User-Agent': `FLAMA-Update/${AGENT_VERSION} (${APP_NAME})`,
        Accept: options.accept || '*/*',
        ...(options.headers || {}),
      },
      timeout: options.timeoutMs || 20000,
    }, res => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Demasiadas redirecciones al descargar'));
        const next = new URL(res.headers.location, parsed).toString();
        return resolve(requestBuffer(next, options, redirectsLeft - 1));
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new Error(`El canal respondió HTTP ${status}`));
      }
      const chunks = [];
      let total = 0;
      const maxBytes = options.maxBytes || MAX_DOWNLOAD_BYTES;
      const expected = Number(res.headers['content-length'] || 0);
      res.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(new Error('La descarga supera el tamaño máximo permitido'));
          return;
        }
        chunks.push(chunk);
        if (options.onProgress && expected > 0) options.onProgress(total, expected);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado al conectar con el canal')));
    req.on('error', reject);
  });
}

function validateManifest(input) {
  if (!input || typeof input !== 'object') throw new Error('Manifest de actualización vacío');
  if (input.appId !== APP_ID) throw new Error('La actualización no pertenece a este TPV');
  const version = normalizeVersion(input.version);
  const url = String(input.url || '').trim();
  const sha256 = String(input.sha256 || '').trim().toLowerCase();
  if (!/^https:\/\//i.test(url)) throw new Error('La descarga del software debe usar HTTPS');
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('SHA-256 ausente o no válido');
  const size = input.size == null ? null : Number(input.size);
  if (size != null && (!Number.isFinite(size) || size <= 0 || size > MAX_DOWNLOAD_BYTES)) {
    throw new Error('Tamaño de actualización no válido');
  }
  return {
    schema: Number(input.schema || 1),
    appId: APP_ID,
    version,
    url,
    sha256,
    size,
    notes: String(input.notes || ''),
    publishedAt: input.publishedAt || null,
    mandatory: Boolean(input.mandatory),
  };
}

let activeCheck = null;

async function downloadAndStage(manifest, source = 'remote') {
  ensureDirs();
  const finalPath = path.join(PATHS.staging, `tpv-app-${manifest.version}.asar`);
  const partPath = `${finalPath}.part`;

  if (fs.existsSync(finalPath)) {
    const existingHash = await sha256File(finalPath);
    if (existingHash === manifest.sha256) {
      const pending = { ...manifest, packagePath: finalPath, stagedAt: new Date().toISOString(), source };
      atomicWriteJson(PATHS.pending, pending);
      return updateState({
        phase: 'ready', availableVersion: manifest.version, progress: 100,
        notes: manifest.notes, error: null, source,
      });
    }
    fs.rmSync(finalPath, { force: true });
  }

  updateState({ phase: 'downloading', availableVersion: manifest.version, progress: 0, notes: manifest.notes, error: null, source });
  const buffer = await requestBuffer(manifest.url, {
    maxBytes: MAX_DOWNLOAD_BYTES,
    onProgress: (received, total) => {
      const progress = Math.max(1, Math.min(99, Math.round((received / total) * 100)));
      const state = loadState();
      if (state.progress !== progress) updateState({ progress, phase: 'downloading' });
    },
  });
  if (manifest.size && buffer.length !== manifest.size) {
    throw new Error(`Tamaño incorrecto: esperado ${manifest.size}, recibido ${buffer.length}`);
  }
  const actualHash = sha256Buffer(buffer);
  if (actualHash !== manifest.sha256) throw new Error('La firma SHA-256 del software no coincide');
  fs.writeFileSync(partPath, buffer);
  fs.renameSync(partPath, finalPath);
  const pending = { ...manifest, packagePath: finalPath, stagedAt: new Date().toISOString(), source };
  atomicWriteJson(PATHS.pending, pending);
  return updateState({
    phase: 'ready', availableVersion: manifest.version, progress: 100,
    notes: manifest.notes, error: null, source,
  });
}

async function checkForUpdates(options = {}) {
  if (activeCheck) return activeCheck;
  activeCheck = (async () => {
    const config = loadConfig();
    const source = options.source || 'manual';
    if (!config.manifestUrl) throw new Error('El canal de actualizaciones todavía no está configurado');
    updateState({ phase: 'checking', progress: 0, error: null, lastCheckAt: new Date().toISOString(), source });
    try {
      const raw = await requestBuffer(config.manifestUrl, { maxBytes: 1024 * 1024, accept: 'application/json' });
      let parsed;
      try { parsed = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')); }
      catch (_) { throw new Error('El canal no ha devuelto un manifest JSON válido'); }
      const manifest = validateManifest(parsed);
      if (compareVersions(manifest.version, APP_VERSION) <= 0) {
        if (fs.existsSync(PATHS.pending)) fs.rmSync(PATHS.pending, { force: true });
        return updateState({
          phase: 'up-to-date', availableVersion: null, progress: 100, notes: '',
          error: null, lastCheckAt: new Date().toISOString(), source,
        });
      }
      updateState({
        phase: 'available', availableVersion: manifest.version, progress: 0,
        notes: manifest.notes, error: null, lastCheckAt: new Date().toISOString(), source,
      });
      const shouldDownload = options.download !== false && (source === 'admin' || config.autoDownload !== false);
      if (shouldDownload) return await downloadAndStage(manifest, source);
      return loadState();
    } catch (error) {
      appendLog(`Comprobación fallida: ${error.stack || error.message}`);
      updateState({ phase: 'error', error: error.message, progress: 0, lastCheckAt: new Date().toISOString(), source });
      throw error;
    }
  })().finally(() => { activeCheck = null; });
  return activeCheck;
}

async function stageManualUpload(payload) {
  const version = normalizeVersion(payload.version);
  if (compareVersions(version, APP_VERSION) <= 0) {
    throw new Error(`La versión ${version} no es superior a la instalada (${APP_VERSION})`);
  }
  const base64 = String(payload.appAsarBase64 || '').replace(/^data:.*?;base64,/, '');
  if (!base64) throw new Error('No se ha recibido el archivo app.asar');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_MANUAL_UPLOAD_BYTES) throw new Error('El archivo recibido tiene un tamaño no válido');
  const hash = sha256Buffer(buffer);
  const expected = String(payload.sha256 || '').trim().toLowerCase();
  if (expected && expected !== hash) throw new Error('El SHA-256 indicado no coincide con el archivo');
  ensureDirs();
  const finalPath = path.join(PATHS.staging, `tpv-app-${version}.asar`);
  fs.writeFileSync(finalPath, buffer);
  const pending = {
    schema: 1,
    appId: APP_ID,
    version,
    url: 'manual-upload',
    sha256: hash,
    size: buffer.length,
    notes: String(payload.notes || 'Actualización cargada manualmente'),
    publishedAt: new Date().toISOString(),
    mandatory: false,
    packagePath: finalPath,
    stagedAt: new Date().toISOString(),
    source: 'manual-upload',
  };
  atomicWriteJson(PATHS.pending, pending);
  return updateState({
    phase: 'ready', availableVersion: version, progress: 100, notes: pending.notes,
    error: null, source: 'manual-upload', lastCheckAt: new Date().toISOString(),
  });
}

async function validatePending() {
  const pending = readJson(PATHS.pending, null);
  if (!pending) throw new Error('No hay ninguna actualización descargada y preparada');
  if (pending.appId !== APP_ID) throw new Error('El paquete preparado no pertenece a este TPV');
  pending.version = normalizeVersion(pending.version);
  if (compareVersions(pending.version, APP_VERSION) <= 0) throw new Error('La actualización preparada ya no es superior a la instalada');
  if (!pending.packagePath || !fs.existsSync(pending.packagePath)) throw new Error('Falta el archivo descargado de la actualización');
  const hash = await sha256File(pending.packagePath);
  if (hash !== pending.sha256) throw new Error('La actualización preparada ha fallado la comprobación SHA-256');
  return pending;
}

function launchAgent(mode, requestPath = PATHS.request) {
  if (process.platform !== 'win32') throw new Error('La instalación automática solo puede ejecutarse en Windows');
  if (!fs.existsSync(PATHS.agent)) throw new Error('No se encuentra el agente FLAMA Update. Reinstala la v4 como administrador.');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PATHS.agent, '-Mode', mode];
  if (requestPath) args.push('-RequestPath', requestPath);
  const child = spawn('powershell.exe', args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function assertRuntimeSafe() {
  const runtime = readJson(PATHS.runtime, null);
  if (!runtime || !runtime.timestamp) {
    throw new Error('No se puede confirmar que el TPV esté en un momento seguro. Espera unos segundos y vuelve a probar.');
  }
  const ageMs = Date.now() - Date.parse(runtime.timestamp);
  if (!Number.isFinite(ageMs) || ageMs > 45000) {
    throw new Error('El estado de seguridad del TPV está desactualizado. Vuelve al TPV, espera unos segundos y repite.');
  }
  if (!runtime.safeToRestart || Number(runtime.ticketItems || 0) > 0 || runtime.overlayOpen) {
    throw new Error('Hay una venta o ventana de cobro abierta. La actualización no puede interrumpirla.');
  }
  return runtime;
}

async function requestInstall(options = {}) {
  assertRuntimeSafe();
  const pending = await validatePending();
  const request = {
    schema: 1,
    action: 'install',
    appId: APP_ID,
    currentVersion: APP_VERSION,
    targetVersion: pending.version,
    packagePath: pending.packagePath,
    sha256: pending.sha256,
    size: pending.size || null,
    notes: pending.notes || '',
    requestedAt: new Date().toISOString(),
    requestedBy: options.requestedBy || 'admin',
    source: options.source || pending.source || 'unknown',
    force: Boolean(options.force),
    launchAfter: options.launchAfter !== false,
    executablePath: process.execPath,
    resourcesDir: process.resourcesPath,
    destinationAsar: path.join(process.resourcesPath, 'app.asar'),
    dataDir: process.env.POS_DB_DIR || '',
    healthUrl: 'http://127.0.0.1:3001/api/health',
    updateRoot: PATHS.root,
  };
  atomicWriteJson(PATHS.request, request);
  updateState({ phase: 'installing', progress: 100, error: null, availableVersion: pending.version, source: request.source });
  launchAgent('Install', PATHS.request);
  return { ok: true, installing: true, version: pending.version };
}

function requestRollback(options = {}) {
  assertRuntimeSafe();
  const request = {
    schema: 1,
    action: 'rollback',
    appId: APP_ID,
    currentVersion: APP_VERSION,
    requestedAt: new Date().toISOString(),
    requestedBy: options.requestedBy || 'admin',
    launchAfter: true,
    executablePath: process.execPath,
    resourcesDir: process.resourcesPath,
    destinationAsar: path.join(process.resourcesPath, 'app.asar'),
    dataDir: process.env.POS_DB_DIR || '',
    healthUrl: 'http://127.0.0.1:3001/api/health',
    updateRoot: PATHS.root,
  };
  atomicWriteJson(PATHS.request, request);
  updateState({ phase: 'installing', error: null, source: 'rollback' });
  launchAgent('Rollback', PATHS.request);
  return { ok: true, rollback: true };
}

function writeRuntimeState(payload) {
  const ticketItems = Math.max(0, Number(payload.ticketItems) || 0);
  const overlayOpen = Boolean(payload.overlayOpen);
  const cashClosed = Boolean(payload.cashClosed);
  const state = {
    schema: 1,
    appId: APP_ID,
    timestamp: new Date().toISOString(),
    ticketItems,
    overlayOpen,
    screen: String(payload.screen || 'unknown'),
    cashClosed,
    safeToRestart: ticketItems === 0 && !overlayOpen,
    user: String(payload.user || ''),
  };
  atomicWriteJson(PATHS.runtime, state);
  return state;
}

function getPublicStatus() {
  const state = loadState();
  const config = loadConfig();
  const pending = readJson(PATHS.pending, null);
  return {
    appId: APP_ID,
    appName: APP_NAME,
    version: APP_VERSION,
    phase: state.phase,
    availableVersion: state.availableVersion,
    progress: state.progress,
    notes: state.notes,
    lastCheckAt: state.lastCheckAt,
    lastSuccessAt: state.lastSuccessAt,
    error: state.error,
    lastResult: state.lastResult || null,
    pending: pending ? { version: pending.version, stagedAt: pending.stagedAt, source: pending.source } : null,
    config: {
      manifestUrl: config.manifestUrl,
      autoCheck: config.autoCheck,
      autoDownload: config.autoDownload,
      autoInstallWhenClosed: config.autoInstallWhenClosed,
      autoInstallAtCashClose: config.autoInstallAtCashClose,
      checkEveryMinutes: config.checkEveryMinutes,
      notificationWebhookConfigured: Boolean(config.notificationWebhookUrl),
    },
    mobilePanelPath: '/update.html',
    updateRoot: PATHS.root,
    agentInstalled: fs.existsSync(PATHS.agent),
  };
}

function registerRoutes(app, dependencies) {
  const { auth, soloAdmin, getCashClosed } = dependencies;

  app.post('/api/update/heartbeat', auth, (req, res) => {
    try {
      const runtime = writeRuntimeState({
        ...req.body,
        cashClosed: getCashClosed ? Boolean(getCashClosed()) : false,
        user: req.usuario && req.usuario.username,
      });
      res.json({ ok: true, safeToRestart: runtime.safeToRestart, cashClosed: runtime.cashClosed });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/admin/update/status', auth, soloAdmin, (_req, res) => {
    try { res.json(getPublicStatus()); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/admin/update/check', auth, soloAdmin, async (_req, res) => {
    try { res.json(await checkForUpdates({ source: 'admin', download: true })); }
    catch (error) { res.status(502).json({ error: error.message }); }
  });

  app.put('/api/admin/update/config', auth, soloAdmin, (req, res) => {
    try {
      const allowed = {};
      for (const key of ['manifestUrl', 'autoCheck', 'autoDownload', 'autoInstallWhenClosed', 'autoInstallAtCashClose', 'checkEveryMinutes', 'notificationWebhookUrl']) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) allowed[key] = req.body[key];
      }
      res.json({ ok: true, config: saveConfig(allowed) });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.post('/api/admin/update/upload', auth, soloAdmin, async (req, res) => {
    try { res.json(await stageManualUpload(req.body || {})); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.post('/api/admin/update/install', auth, soloAdmin, async (req, res) => {
    try {
      res.json(await requestInstall({
        requestedBy: req.usuario.username,
        source: 'admin',
        force: Boolean(req.body && req.body.force),
        launchAfter: true,
      }));
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.post('/api/admin/update/rollback', auth, soloAdmin, (req, res) => {
    try { res.json(requestRollback({ requestedBy: req.usuario.username })); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
}

function startBackgroundChecks() {
  // El agente externo también comprueba cuando el TPV está cerrado. Esta
  // comprobación interna acelera la detección mientras el TPV está abierto.
  setTimeout(() => {
    const config = loadConfig();
    if (config.autoCheck) checkForUpdates({ source: 'background', download: true }).catch(() => {});
  }, 60 * 1000);

  setInterval(() => {
    const config = loadConfig();
    if (config.autoCheck) checkForUpdates({ source: 'background', download: true }).catch(() => {});
  }, 15 * 60 * 1000);
}

ensureDirs();
loadConfig();
updateState({ installedVersion: APP_VERSION });

module.exports = {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  AGENT_VERSION,
  PATHS,
  compareVersions,
  normalizeVersion,
  validateManifest,
  registerRoutes,
  startBackgroundChecks,
  checkForUpdates,
  stageManualUpload,
  getPublicStatus,
  writeRuntimeState,
};
