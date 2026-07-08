// ============================================================
//  SERVIDOR POS - La Gelateria de Roses
//  Node.js + Express + SQLite. Sin dependencias de vendor.
// ============================================================

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { db, hashPass } = require('./db.js');
const impresora = require('./impresora.js');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'publico'), {
  etag: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}));

// ---------- SESIONES SIMPLES (tokens en memoria) ----------
const sesiones = new Map(); // token -> { username, rol }

function nuevoToken(usuario) {
  const token = crypto.randomBytes(24).toString('hex');
  sesiones.set(token, { username: usuario.username, rol: usuario.rol });
  return token;
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = sesiones.get(token);
  if (!s) return res.status(401).json({ error: 'No autorizado' });
  req.usuario = s;
  next();
}

function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'admin')
    return res.status(403).json({ error: 'Solo el administrador puede ver esto' });
  next();
}

// Día operativo actual: el cierre "abierto" o la fecha de hoy
function diaOperativoActual() {
  const abierto = db.prepare("SELECT dia_operativo FROM cierres WHERE estado='abierto' ORDER BY id DESC LIMIT 1").get();
  if (abierto) return abierto.dia_operativo;
  return new Date().toISOString().slice(0, 10);
}

function cierreAbierto() {
  return db.prepare("SELECT * FROM cierres WHERE estado='abierto' ORDER BY id DESC LIMIT 1").get();
}

// ============================================================
//  AUTENTICACIÓN
// ============================================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);
  if (!u || u.pass_hash !== hashPass(password)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = nuevoToken(u);
  res.json({ token, rol: u.rol, username: u.username });
});

app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  sesiones.delete(token);
  res.json({ ok: true });
});

// ============================================================
//  PRODUCTOS Y CATEGORÍAS (staff y admin)
// ============================================================
app.get('/api/catalogo', auth, (req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden').all();
  const productos = db.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY orden').all();
  const ajustesRows = db.prepare('SELECT clave, valor FROM ajustes').all();
  const ajustes = {};
  ajustesRows.forEach(r => ajustes[r.clave] = r.valor);
  res.json({ categorias, productos, ajustes });
});

// Catálogo público solo-lectura (para la vista previa del diseño, sin login)
app.get('/api/catalogo-preview', (req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden').all();
  const productos = db.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY orden').all();
  const ajustesRows = db.prepare('SELECT clave, valor FROM ajustes').all();
  const ajustes = {};
  ajustesRows.forEach(r => ajustes[r.clave] = r.valor);
  res.json({ categorias, productos, ajustes });
});

// Guardar ajustes de disseny (tamaños de las 4 zonas)
app.put('/api/admin/ajustes', auth, soloAdmin, (req, res) => {
  const ajustes = req.body || {};
  const up = db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  for (const [k, v] of Object.entries(ajustes)) {
    up.run(k, String(v));
  }
  res.json({ ok: true });
});

// Guardar nuevo orden de categorías (menús)
app.put('/api/admin/orden-categorias', auth, soloAdmin, (req, res) => {
  const { ids } = req.body; // array de ids en el nuevo orden
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Falta ordre' });
  const up = db.prepare('UPDATE categorias SET orden = ? WHERE id = ?');
  ids.forEach((id, i) => up.run(i, id));
  res.json({ ok: true });
});

// Guardar nuevo orden de productos (dentro de una categoría, sin romper el orden global)
app.put('/api/admin/orden-productos', auth, soloAdmin, (req, res) => {
  const { ids } = req.body; // array de ids de producto en el nuevo orden (de UNA categoría)
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Falta ordre' });
  const primer = db.prepare('SELECT categoria FROM productos WHERE id = ?').get(ids[0]);
  if (!primer) return res.status(404).json({ error: 'Producte no trobat' });
  const categoria = primer.categoria;
  const base = db.prepare('SELECT COALESCE(MIN(orden),0) m FROM productos WHERE categoria = ?').get(categoria).m;
  const up = db.prepare('UPDATE productos SET orden = ? WHERE id = ?');
  ids.forEach((id, i) => up.run(base + i, id));
  res.json({ ok: true });
});

// ============================================================
//  TRABAJADORES (para control de quién coge producto)
// ============================================================
app.get('/api/trabajadores', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM trabajadores WHERE activo = 1 ORDER BY nombre').all());
});

app.post('/api/trabajadores', auth, soloAdmin, (req, res) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const r = db.prepare('INSERT INTO trabajadores (nombre) VALUES (?)').run(nombre.trim());
  res.json({ id: r.lastInsertRowid, nombre: nombre.trim() });
});

app.delete('/api/trabajadores/:id', auth, soloAdmin, (req, res) => {
  db.prepare('UPDATE trabajadores SET activo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
//  COBRAR (venta) — el flujo rápido del staff
// ============================================================
app.post('/api/ventas', auth, (req, res) => {
  const { lineas, descuento_pct = 0, fidelitat = false, trabajador = null, metodo_pago = 'efectivo' } = req.body;
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ error: 'El ticket está vacío' });
  }

  const descPermitidos = [0, 10, 20, 50];
  if (!descPermitidos.includes(Number(descuento_pct))) {
    return res.status(400).json({ error: 'Descuento no válido' });
  }
  // Solo el -50% requiere nombre del trabajador (control)
  if (Number(descuento_pct) === 50 && !trabajador) {
    return res.status(400).json({ error: 'El descompte -50% requereix el nom del treballador' });
  }

  // Recalcular precios SIEMPRE en el servidor
  let subtotalBruto = 0;
  const lineasCalc = lineas.map(l => {
    const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(l.producto_id);
    const precio = prod ? prod.precio : Number(l.precio_unit || 0);
    const nombre = prod ? prod.nombre : (l.nombre || 'Producto');
    const cantidad = Math.max(1, Number(l.cantidad || 1));
    const subtotal = precio * cantidad;
    subtotalBruto += subtotal;
    return { producto_id: l.producto_id || null, nombre, precio_unit: precio, cantidad, subtotal };
  });

  const PREMI_FIDELITAT = 3;
  let total = subtotalBruto * (1 - Number(descuento_pct) / 100);
  if (fidelitat) total = Math.max(0, total - PREMI_FIDELITAT);
  total = +total.toFixed(2);

  const ahora = new Date().toISOString();
  const dia = diaOperativoActual();
  const cierre = cierreAbierto();

  const insVenta = db.prepare(`
    INSERT INTO ventas (fecha, dia_operativo, total, descuento_pct, fidelitat, trabajador, metodo_pago, cierre_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const r = insVenta.run(ahora, dia, total, Number(descuento_pct), fidelitat ? 1 : 0, trabajador, metodo_pago, cierre ? cierre.id : null);
  const ventaId = r.lastInsertRowid;

  const insLinea = db.prepare(`
    INSERT INTO venta_lineas (venta_id, producto_id, nombre, precio_unit, cantidad, subtotal)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const l of lineasCalc) {
    insLinea.run(ventaId, l.producto_id, l.nombre, l.precio_unit, l.cantidad, l.subtotal);
  }

  // Actualizar totales del cierre abierto
  if (cierre) {
    const campo = metodo_pago === 'tarjeta' ? 'total_tarjeta' : 'total_efectivo';
    db.prepare(`
      UPDATE cierres SET
        ${campo} = ${campo} + ?,
        total_ventas = total_ventas + ?,
        num_tickets = num_tickets + 1
      WHERE id = ?
    `).run(total, total, cierre.id);
  }

  res.json({ id: ventaId, total, fecha: ahora });
});

// ============================================================
//  APERTURA DE CAJÓN (el botón "Abrir Caja")
// ============================================================
app.post('/api/abrir-cajon', auth, (req, res) => {
  const { trabajador = null, motivo = 'apertura manual' } = req.body;

  try {
    db.prepare('INSERT INTO aperturas_cajon (fecha, trabajador, motivo) VALUES (?, ?, ?)')
      .run(new Date().toISOString(), trabajador, motivo);
  } catch (e) {
    console.error('Error registrando apertura de cajon:', e);
  }

  // Respondemos inmediatamente para no bloquear la caja.
  res.json({ ok: true, cajon: 'enviado' });

  // Abrimos el cajón en segundo plano.
  impresora.abrirCajon().catch(e => {
    console.error('Error abriendo cajon:', e);
  });
});
// Imprimir un ticket (opcionalmente abre el cajón)
app.post('/api/imprimir-ticket', auth, async (req, res) => {
  try {
    await impresora.imprimirTicket(req.body || {}, { abrirCajon: !!(req.body && req.body.abrirCajon) });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Configurar / consultar el nombre de la impresora
app.get('/api/impresora', auth, soloAdmin, (req, res) => {
  res.json({ nombre: impresora.getImpresora() });
});
app.put('/api/impresora', auth, soloAdmin, (req, res) => {
  const nombre = (req.body && req.body.nombre) || '';
  impresora.setImpresora(nombre);
  // guardar en ajustes para que persista
  db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
    .run('impresora_nombre', nombre);
  res.json({ ok: true, nombre });
});

// Prueba de impresora: abre el cajón (para probar la conexión)
app.post('/api/impresora/prova-calaix', auth, soloAdmin, async (req, res) => {
  try { await impresora.abrirCajon(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Minimizar la ventana del navegador (modo kiosco) — usa PowerShell en Windows
app.post('/api/finestra/minimitzar', auth, (req, res) => {
  const { execFile } = require('child_process');
  // Minimiza la ventana activa (Chrome en primer plano)
  const ps = `$sig='[DllImport("user32.dll")]public static extern bool ShowWindow(int handle, int state);[DllImport("user32.dll")]public static extern int GetForegroundWindow();';Add-Type -MemberDefinition $sig -Name Win -Namespace Native;$h=[Native.Win]::GetForegroundWindow();[Native.Win]::ShowWindow($h,6)`;
  execFile('powershell', ['-NoProfile', '-Command', ps], (err) => {
    if (err) return res.json({ ok: false, error: err.message });
    res.json({ ok: true });
  });
});

// Cerrar el navegador (modo kiosco) — cierra las ventanas de Chrome
app.post('/api/finestra/tancar', auth, (req, res) => {
  const { execFile } = require('child_process');
  res.json({ ok: true }); // responder antes de cerrar
  setTimeout(() => {
    execFile('cmd', ['/c', 'taskkill /IM chrome.exe /F'], () => {});
  }, 200);
});

// ============================================================
//  CIERRE DE CAJA (solo admin)
// ============================================================
app.get('/api/cierre/estado', auth, (req, res) => {
  const cierre = cierreAbierto();
  res.json({ cierre: cierre || null });
});

app.post('/api/cierre/abrir', auth, soloAdmin, (req, res) => {
  if (cierreAbierto()) return res.status(400).json({ error: 'Ya hay una caja abierta' });
  const ahora = new Date().toISOString();
  const dia = new Date().toISOString().slice(0, 10);
  const r = db.prepare(`
    INSERT INTO cierres (dia_operativo, abierto_en, estado) VALUES (?, ?, 'abierto')
  `).run(dia, ahora);
  res.json({ id: r.lastInsertRowid, dia_operativo: dia });
});

// Calcula el resumen completo de un cierre (para el ticket de caja y el histórico)
function resumenCierreCompleto(cierre) {
  const resumen = db.prepare('SELECT * FROM cierres WHERE id = ?').get(cierre.id);

  const clients = db.prepare(`
    SELECT COALESCE(SUM(vl.cantidad),0) n
    FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
    WHERE v.cierre_id = ? AND ${SQL_ES_CLIENTE}
  `).get(cierre.id).n;

  const extra = db.prepare(`
    SELECT COALESCE(AVG(total),0) ticket_mig,
           COALESCE(SUM(fidelitat),0) premis_fidelitat,
           COALESCE(SUM(CASE WHEN descuento_pct>0 THEN 1 ELSE 0 END),0) amb_descompte
    FROM ventas WHERE cierre_id = ? AND estado != 'anulada'
  `).get(cierre.id);

  const unidades = db.prepare(`
    SELECT COALESCE(SUM(vl.cantidad),0) u FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id WHERE v.cierre_id = ? AND v.estado != 'anulada'
  `).get(cierre.id).u;

  const porProducto = db.prepare(`
    SELECT vl.nombre, SUM(vl.cantidad) unidades, SUM(vl.subtotal) total
    FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
    WHERE v.cierre_id = ? AND v.estado != 'anulada' GROUP BY vl.nombre ORDER BY unidades DESC
  `).all(cierre.id);

  const porCategoria = db.prepare(`
    SELECT COALESCE(p.categoria,'(altres)') categoria, SUM(vl.cantidad) unidades, SUM(vl.subtotal) total
    FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
    LEFT JOIN productos p ON p.id = vl.producto_id
    WHERE v.cierre_id = ? AND v.estado != 'anulada' GROUP BY p.categoria ORDER BY total DESC
  `).all(cierre.id);

  // Franjas horarias: matí (<14), tarda (14-19), nit (>=19)
  const franjas = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN CAST(strftime('%H',fecha,'localtime') AS INTEGER) < 14 THEN total ELSE 0 END),0) mati,
      COALESCE(SUM(CASE WHEN CAST(strftime('%H',fecha,'localtime') AS INTEGER) BETWEEN 14 AND 18 THEN total ELSE 0 END),0) tarda,
      COALESCE(SUM(CASE WHEN CAST(strftime('%H',fecha,'localtime') AS INTEGER) >= 19 THEN total ELSE 0 END),0) nit
    FROM ventas WHERE cierre_id = ? AND estado != 'anulada'
  `).get(cierre.id);

  const porTrabajador = db.prepare(`
    SELECT COALESCE(trabajador,'(sin nombre)') trabajador, COUNT(*) tickets, SUM(total) total
    FROM ventas WHERE cierre_id = ? AND estado != 'anulada' GROUP BY trabajador ORDER BY total DESC
  `).all(cierre.id);

  // Comparativa con el cierre anterior
  const cierreAnt = db.prepare(`
    SELECT total_ventas, num_tickets, dia_operativo FROM cierres
    WHERE estado='cerrado' AND id < ? ORDER BY id DESC LIMIT 1
  `).get(cierre.id);
  let comparativa = null;
  if (cierreAnt) {
    comparativa = { dia: cierreAnt.dia_operativo, total: cierreAnt.total_ventas, tickets: cierreAnt.num_tickets, diff: resumen.total_ventas - cierreAnt.total_ventas };
  }

  return { resumen, clients, ...extra, unidades, porProducto, porCategoria, franjas, porTrabajador, comparativa };
}

app.post('/api/cierre/cerrar', auth, soloAdmin, (req, res) => {
  const cierre = cierreAbierto();
  if (!cierre) return res.status(400).json({ error: 'No hay caja abierta' });
  db.prepare("UPDATE cierres SET estado='cerrado', cerrado_en=? WHERE id=?")
    .run(new Date().toISOString(), cierre.id);

  res.json(resumenCierreCompleto(cierre));
});

// ============================================================
//  DASHBOARD / REPORTES (solo admin)
// ============================================================


// MÉTRICAS COMPLETAS (solo admin) — por día o rango
// ÚLTIMS TIQUETS (staff pot veure els últims 10, per si el client demana el tiquet)
// NO mostra cap total de caixa, només cada tiquet desglossat amb el seu total propi
app.get('/api/ultims-tiquets', auth, (req, res) => {
  const ventas = db.prepare(`
    SELECT id, fecha, total, descuento_pct, fidelitat, trabajador
    FROM ventas ORDER BY id DESC LIMIT 10
  `).all();
  const tiquets = ventas.map(v => {
    const lineas = db.prepare(`
      SELECT nombre, precio_unit, cantidad, subtotal FROM venta_lineas WHERE venta_id = ?
    `).all(v.id);
    return { ...v, lineas };
  });
  res.json({ tiquets });
});

// RESUMEN DEL DÍA (solo admin)
app.get('/api/admin/hoy', auth, soloAdmin, (req, res) => {
  const dia = diaOperativoActual();
  const totales = db.prepare(`
    SELECT COUNT(*) tickets, COALESCE(SUM(total),0) total,
           COALESCE(SUM(CASE WHEN metodo_pago='efectivo' THEN total ELSE 0 END),0) efectivo,
           COALESCE(SUM(CASE WHEN metodo_pago='tarjeta'  THEN total ELSE 0 END),0) tarjeta
    FROM ventas WHERE dia_operativo = ? AND estado != 'anulada'
  `).get(dia);
  const ultimas = db.prepare(`
    SELECT id, fecha, total, descuento_pct, trabajador, metodo_pago, estado
    FROM ventas WHERE dia_operativo = ? ORDER BY id DESC LIMIT 20
  `).all(dia);
  const porTrabajador = db.prepare(`
    SELECT COALESCE(trabajador,'(sin nombre)') trabajador, COUNT(*) tickets, SUM(total) total
    FROM ventas WHERE dia_operativo = ? AND estado != 'anulada' GROUP BY trabajador ORDER BY total DESC
  `).all(dia);
  const conDescuento = db.prepare(`
    SELECT id, fecha, total, descuento_pct, trabajador
    FROM ventas WHERE dia_operativo = ? AND descuento_pct > 0 AND estado != 'anulada' ORDER BY id DESC
  `).all(dia);
  res.json({ dia, totales, ultimas, porTrabajador, conDescuento });
});

// ============================================================
//  CORRECCIÓN DE TICKETS (solo admin, todo queda registrado)
// ============================================================

// Ver el detalle de un ticket (con sus líneas)
app.get('/api/admin/ticket/:id', auth, soloAdmin, (req, res) => {
  const v = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Tiquet no trobat' });
  const lineas = db.prepare('SELECT * FROM venta_lineas WHERE venta_id = ?').all(v.id);
  res.json({ ...v, lineas });
});

// Anular un ticket entero (queda marcado como anulado, no se borra)
app.post('/api/admin/ticket/:id/anular', auth, soloAdmin, (req, res) => {
  const v = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Tiquet no trobat' });
  if (v.estado === 'anulada') return res.status(400).json({ error: 'Ja està anul·lat' });
  const ahora = new Date().toISOString();
  db.prepare("UPDATE ventas SET estado = 'anulada' WHERE id = ?").run(v.id);
  db.prepare('INSERT INTO anulaciones (fecha, venta_id, total, trabajador, anulado_por) VALUES (?,?,?,?,?)')
    .run(ahora, v.id, v.total, v.trabajador, req.usuario.username);
  db.prepare('INSERT INTO modificaciones (fecha, venta_id, accion, detalle, total_antes, total_despues, hecho_por) VALUES (?,?,?,?,?,?,?)')
    .run(ahora, v.id, 'anular', `Tiquet #${v.id} anul·lat sencer`, v.total, 0, req.usuario.username);
  res.json({ ok: true });
});

// Editar una línea de un ticket (cambiar cantidad o quitarla). Recalcula el total.
app.post('/api/admin/ticket/:id/editar-linea', auth, soloAdmin, (req, res) => {
  const { linea_id, nueva_cantidad } = req.body;
  const v = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Tiquet no trobat' });
  if (v.estado === 'anulada') return res.status(400).json({ error: 'El tiquet està anul·lat' });
  const linea = db.prepare('SELECT * FROM venta_lineas WHERE id = ? AND venta_id = ?').get(linea_id, v.id);
  if (!linea) return res.status(404).json({ error: 'Línia no trobada' });

  const totalAntes = v.total;
  let detalle;
  if (Number(nueva_cantidad) <= 0) {
    // quitar la línea
    db.prepare('DELETE FROM venta_lineas WHERE id = ?').run(linea_id);
    detalle = `Tret "${linea.nombre}" (x${linea.cantidad})`;
  } else {
    const nuevoSub = linea.precio_unit * Number(nueva_cantidad);
    db.prepare('UPDATE venta_lineas SET cantidad = ?, subtotal = ? WHERE id = ?')
      .run(Number(nueva_cantidad), nuevoSub, linea_id);
    detalle = `"${linea.nombre}": ${linea.cantidad} → ${nueva_cantidad} unitats`;
  }

  // recalcular total del ticket (respetando descuento y fidelitat)
  const bruto = db.prepare('SELECT COALESCE(SUM(subtotal),0) s FROM venta_lineas WHERE venta_id = ?').get(v.id).s;
  let nuevoTotal = bruto * (1 - (v.descuento_pct || 0) / 100);
  if (v.fidelitat) nuevoTotal = Math.max(0, nuevoTotal - 3);
  nuevoTotal = Math.round(nuevoTotal * 100) / 100;

  const quedanLineas = db.prepare('SELECT COUNT(*) c FROM venta_lineas WHERE venta_id = ?').get(v.id).c;
  const nuevoEstado = quedanLineas === 0 ? 'anulada' : 'editada';
  db.prepare('UPDATE ventas SET total = ?, estado = ? WHERE id = ?').run(nuevoTotal, nuevoEstado, v.id);

  const ahora = new Date().toISOString();
  db.prepare('INSERT INTO modificaciones (fecha, venta_id, accion, detalle, total_antes, total_despues, hecho_por) VALUES (?,?,?,?,?,?,?)')
    .run(ahora, v.id, 'editar_linea', detalle, totalAntes, nuevoTotal, req.usuario.username);

  res.json({ ok: true, nuevoTotal, estado: nuevoEstado });
});

// Ver el registro de modificaciones (auditoría)
app.get('/api/admin/modificaciones', auth, soloAdmin, (req, res) => {
  const mods = db.prepare('SELECT * FROM modificaciones ORDER BY id DESC LIMIT 100').all();
  res.json({ modificaciones: mods });
});

// Condición SQL: qué líneas cuentan como "cliente" (consumición principal, no extras)
const NO_CLIENTE = "('Topping','TOPPING','NATA','TRUFAS','CREPE EXTRA TOPPING','GOFRE EXTRA topping')";
const SQL_ES_CLIENTE = `vl.nombre NOT IN ${NO_CLIENTE}`;

app.get('/api/admin/metriques', auth, soloAdmin, (req, res) => {
  const dia = req.query.dia || diaOperativoActual();
  const mes = dia.slice(0, 7);   // YYYY-MM
  const any = dia.slice(0, 4);   // YYYY

  // ----- CLIENTES (consumiciones principales) -----
  const clientsDia = db.prepare(`
    SELECT COALESCE(SUM(vl.cantidad),0) n
    FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
    WHERE v.dia_operativo = ? AND v.estado != 'anulada' AND ${SQL_ES_CLIENTE}
  `).get(dia).n;
  const clientsMes = db.prepare(`
    SELECT COALESCE(SUM(vl.cantidad),0) n
    FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
    WHERE substr(v.dia_operativo,1,7) = ? AND v.estado != 'anulada' AND ${SQL_ES_CLIENTE}
  `).get(mes).n;
  const clientsAny = db.prepare(`
    SELECT COALESCE(SUM(vl.cantidad),0) n
    FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
    WHERE substr(v.dia_operativo,1,4) = ? AND v.estado != 'anulada' AND ${SQL_ES_CLIENTE}
  `).get(any).n;

  // ----- FACTURACIÓN día/mes/año -----
  const factDia = db.prepare(`SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM ventas WHERE dia_operativo = ? AND estado != 'anulada'`).get(dia);
  const factMes = db.prepare(`SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM ventas WHERE substr(dia_operativo,1,7) = ? AND estado != 'anulada'`).get(mes);
  const factAny = db.prepare(`SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM ventas WHERE substr(dia_operativo,1,4) = ? AND estado != 'anulada'`).get(any);

  // ----- Facturación por hora -----
  const porHora = db.prepare(`
    SELECT strftime('%H', fecha, 'localtime') hora, COUNT(*) tickets, COALESCE(SUM(total),0) total
    FROM ventas WHERE dia_operativo = ? GROUP BY hora ORDER BY hora
  `).all(dia);

  // ----- Ranking productos del día -----
  const porProducto = db.prepare(`
    SELECT vl.nombre, SUM(vl.cantidad) unidades, SUM(vl.subtotal) total
    FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id
    WHERE v.dia_operativo = ? GROUP BY vl.nombre ORDER BY unidades DESC
  `).all(dia);

  // ----- Facturación por categoría (del día) -----
  const porCategoria = db.prepare(`
    SELECT COALESCE(p.categoria,'(altres)') categoria, SUM(vl.cantidad) unidades, SUM(vl.subtotal) total
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    LEFT JOIN productos p ON p.id = vl.producto_id
    WHERE v.dia_operativo = ? GROUP BY p.categoria ORDER BY total DESC
  `).all(dia);

  // ----- Resumen del día -----
  const resumen = db.prepare(`
    SELECT COUNT(*) tickets, COALESCE(SUM(total),0) total, COALESCE(AVG(total),0) ticket_mig,
           COALESCE(SUM(fidelitat),0) premis_fidelitat,
           COALESCE(SUM(CASE WHEN descuento_pct>0 THEN 1 ELSE 0 END),0) amb_descompte
    FROM ventas WHERE dia_operativo = ?
  `).get(dia);
  const unidadesTotal = db.prepare(`
    SELECT COALESCE(SUM(vl.cantidad),0) u FROM venta_lineas vl JOIN ventas v ON v.id = vl.venta_id WHERE v.dia_operativo = ?
  `).get(dia).u;

  // ----- Comparativa con el día operativo anterior -----
  const diaAnterior = db.prepare(`SELECT dia_operativo FROM ventas WHERE dia_operativo < ? ORDER BY dia_operativo DESC LIMIT 1`).get(dia);
  let comparativa = null;
  if (diaAnterior) {
    const ant = db.prepare(`SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM ventas WHERE dia_operativo = ? AND estado != 'anulada'`).get(diaAnterior.dia_operativo);
    comparativa = { dia: diaAnterior.dia_operativo, total: ant.t, tickets: ant.n, diff: factDia.t - ant.t };
  }

  // ----- Estacionalidad: facturación por mes del año -----
  const porMes = db.prepare(`
    SELECT substr(dia_operativo,1,7) mes, COALESCE(SUM(total),0) total, COUNT(*) tickets
    FROM ventas WHERE substr(dia_operativo,1,4) = ? GROUP BY mes ORDER BY mes
  `).all(any);

  // ----- Día de la semana que más factura (media del año) -----
  const porDiaSetmana = db.prepare(`
    SELECT strftime('%w', dia_operativo) dow, COALESCE(SUM(total),0) total, COUNT(DISTINCT dia_operativo) dies
    FROM ventas WHERE substr(dia_operativo,1,4) = ? GROUP BY dow
  `).all(any);

  const dies = db.prepare(`SELECT DISTINCT dia_operativo FROM ventas ORDER BY dia_operativo DESC LIMIT 90`).all().map(r => r.dia_operativo);

  res.json({
    dia, mes, any,
    clients: { dia: clientsDia, mes: clientsMes, any: clientsAny },
    facturacio: { dia: factDia, mes: factMes, any: factAny },
    porHora, porProducto, porCategoria, resumen, unidadesTotal,
    comparativa, porMes, porDiaSetmana, dies
  });
});


// ============================================================
//  PANEL MÓVIL DE MÉTRICAS — acceso por PIN, solo lectura
//  No toca ventas, impresión ni cajón. Pensado para Tailscale.
//  PIN por defecto: 2026. En producción puedes cambiarlo con METRICS_PIN.
// ============================================================
const METRICS_PIN = process.env.METRICS_PIN || '2026';
const metricasSesiones = new Map(); // token -> { createdAt }
const METRICS_SESSION_MS = 12 * 60 * 60 * 1000; // 12 horas

function nuevoTokenMetricas() {
  const token = crypto.randomBytes(24).toString('hex');
  metricasSesiones.set(token, { createdAt: Date.now() });
  return token;
}

function authMetricas(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const sesion = metricasSesiones.get(token);
  if (!sesion) return res.status(401).json({ error: 'PIN requerido' });
  if (Date.now() - sesion.createdAt > METRICS_SESSION_MS) {
    metricasSesiones.delete(token);
    return res.status(401).json({ error: 'Sesión caducada' });
  }
  next();
}

app.post('/api/metricas/login', (req, res) => {
  const pin = String((req.body && req.body.pin) || '').trim();
  if (!pin || pin !== String(METRICS_PIN)) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }
  res.json({ ok: true, token: nuevoTokenMetricas() });
});

app.post('/api/metricas/logout', authMetricas, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  metricasSesiones.delete(token);
  res.json({ ok: true });
});

app.get('/api/metricas/resumen', authMetricas, (req, res) => {
  const dia = req.query.dia || diaOperativoActual();

  const totales = db.prepare(`
    SELECT COUNT(*) tickets,
           COALESCE(SUM(total),0) total,
           COALESCE(AVG(total),0) ticket_medio,
           COALESCE(SUM(CASE WHEN metodo_pago='efectivo' THEN total ELSE 0 END),0) efectivo,
           COALESCE(SUM(CASE WHEN metodo_pago='tarjeta'  THEN total ELSE 0 END),0) tarjeta
    FROM ventas
    WHERE dia_operativo = ? AND estado != 'anulada'
  `).get(dia);

  const porHora = db.prepare(`
    SELECT strftime('%H', fecha, 'localtime') hora,
           COUNT(*) tickets,
           COALESCE(SUM(total),0) total
    FROM ventas
    WHERE dia_operativo = ? AND estado != 'anulada'
    GROUP BY hora
    ORDER BY hora
  `).all(dia);

  const porProducto = db.prepare(`
    SELECT vl.nombre,
           SUM(vl.cantidad) unidades,
           COALESCE(SUM(vl.subtotal),0) total
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    WHERE v.dia_operativo = ? AND v.estado != 'anulada'
    GROUP BY vl.nombre
    ORDER BY unidades DESC, total DESC
    LIMIT 1000
  `).all(dia);

  const porCategoria = db.prepare(`
    SELECT COALESCE(p.categoria,'(altres)') categoria,
           SUM(vl.cantidad) unidades,
           COALESCE(SUM(vl.subtotal),0) total
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    LEFT JOIN productos p ON p.id = vl.producto_id
    WHERE v.dia_operativo = ? AND v.estado != 'anulada'
    GROUP BY p.categoria
    ORDER BY total DESC
  `).all(dia);

  const porTrabajador = db.prepare(`
    SELECT COALESCE(trabajador,'(sin nombre)') trabajador,
           COUNT(*) tickets,
           COALESCE(SUM(total),0) total
    FROM ventas
    WHERE dia_operativo = ? AND estado != 'anulada'
    GROUP BY trabajador
    ORDER BY total DESC
  `).all(dia);

  const ultimas = db.prepare(`
    SELECT id, fecha, total, descuento_pct, trabajador, metodo_pago, estado
    FROM ventas
    WHERE dia_operativo = ?
    ORDER BY id DESC
    LIMIT 20
  `).all(dia);

  const unidadesTotal = db.prepare(`
    SELECT COALESCE(SUM(vl.cantidad),0) unidades
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    WHERE v.dia_operativo = ? AND v.estado != 'anulada'
  `).get(dia).unidades;

  const clientes = db.prepare(`
    SELECT COALESCE(SUM(vl.cantidad),0) clientes
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id
    WHERE v.dia_operativo = ? AND v.estado != 'anulada' AND ${SQL_ES_CLIENTE}
  `).get(dia).clientes;

  const mejorHora = porHora.reduce((best, row) => {
    if (!best || Number(row.total || 0) > Number(best.total || 0)) return row;
    return best;
  }, null);

  res.json({
    ok: true,
    dia,
    actualizadoEn: new Date().toISOString(),
    totales,
    clientes,
    unidadesTotal,
    mejorHora,
    porHora,
    porProducto,
    porCategoria,
    porTrabajador,
    ultimas
  });
});

// Anular una venta (solo admin) — resta del cierre y borra
app.delete('/api/admin/ventas/:id', auth, soloAdmin, (req, res) => {
  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!venta) return res.status(404).json({ error: 'Venda no trobada' });

  // Restar del cierre si estaba asignada a uno
  if (venta.cierre_id) {
    const campo = venta.metodo_pago === 'tarjeta' ? 'total_tarjeta' : 'total_efectivo';
    db.prepare(`
      UPDATE cierres SET
        ${campo} = ${campo} - ?,
        total_ventas = total_ventas - ?,
        num_tickets = num_tickets - 1
      WHERE id = ?
    `).run(venta.total, venta.total, venta.cierre_id);
  }
  // Registrar la anulación para auditoría
  db.prepare(`INSERT INTO anulaciones (fecha, venta_id, total, trabajador, anulado_por)
    VALUES (?, ?, ?, ?, ?)`).run(new Date().toISOString(), venta.id, venta.total, venta.trabajador, req.usuario.username);
  // Borrar la venta (las líneas caen por CASCADE)
  db.prepare('DELETE FROM ventas WHERE id = ?').run(venta.id);
  res.json({ ok: true });
});

app.get('/api/admin/historico', auth, soloAdmin, (req, res) => {
  const cierres = db.prepare(`
    SELECT * FROM cierres WHERE estado='cerrado' ORDER BY id DESC LIMIT 90
  `).all();
  res.json({ cierres });
});

app.get('/api/admin/cierre/:id', auth, soloAdmin, (req, res) => {
  const cierre = db.prepare('SELECT * FROM cierres WHERE id = ?').get(req.params.id);
  if (!cierre) return res.status(404).json({ error: 'No encontrado' });
  res.json(resumenCierreCompleto(cierre));
});

// ============================================================
//  GESTIÓN DE PRODUCTOS Y PRECIOS (solo admin)
// ============================================================
app.get('/api/admin/productos', auth, soloAdmin, (req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden').all();
  const productos = db.prepare('SELECT * FROM productos ORDER BY orden').all();
  res.json({ categorias, productos });
});

app.put('/api/admin/productos/:id', auth, soloAdmin, (req, res) => {
  const { precio, nombre, activo, color, categoria } = req.body;
  const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('UPDATE productos SET precio = ?, nombre = ?, activo = ?, color = ?, categoria = ? WHERE id = ?')
    .run(
      precio != null ? Number(precio) : p.precio,
      nombre != null ? nombre : p.nombre,
      activo != null ? (activo ? 1 : 0) : p.activo,
      color != null ? color : p.color,
      categoria != null ? categoria : p.categoria,
      req.params.id
    );
  res.json({ ok: true });
});

app.post('/api/admin/productos', auth, soloAdmin, (req, res) => {
  const { categoria, nombre, precio = 0, color = null } = req.body;
  if (!categoria || !nombre) return res.status(400).json({ error: 'Faltan datos' });
  const maxOrden = db.prepare('SELECT COALESCE(MAX(orden),0) m FROM productos').get().m;
  const r = db.prepare('INSERT INTO productos (categoria, nombre, precio, color, orden) VALUES (?, ?, ?, ?, ?)')
    .run(categoria, nombre, Number(precio), color, maxOrden + 1);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/admin/productos/:id', auth, soloAdmin, (req, res) => {
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- GESTIÓN DE CATEGORÍAS (menús) ----------
app.post('/api/admin/categorias', auth, soloAdmin, (req, res) => {
  const { id, nombre, color = '#E8E4DC' } = req.body;
  if (!id || !nombre) return res.status(400).json({ error: 'Falten dades' });
  const existe = db.prepare('SELECT id FROM categorias WHERE id = ?').get(id);
  if (existe) return res.status(400).json({ error: 'Ja existeix una categoria amb aquest id' });
  const maxOrden = db.prepare('SELECT COALESCE(MAX(orden),0) m FROM categorias').get().m;
  db.prepare('INSERT INTO categorias (id, nombre, color, orden) VALUES (?, ?, ?, ?)')
    .run(id, nombre, color, maxOrden + 1);
  res.json({ ok: true });
});

app.put('/api/admin/categorias/:id', auth, soloAdmin, (req, res) => {
  const { nombre, color } = req.body;
  const c = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No trobada' });
  db.prepare('UPDATE categorias SET nombre = ?, color = ? WHERE id = ?')
    .run(nombre != null ? nombre : c.nombre, color != null ? color : c.color, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/categorias/:id', auth, soloAdmin, (req, res) => {
  const n = db.prepare('SELECT COUNT(*) c FROM productos WHERE categoria = ?').get(req.params.id).c;
  if (n > 0) return res.status(400).json({ error: `Aquesta categoria té ${n} productes. Mou-los o esborra'ls primer.` });
  db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
//  CAMBIAR CONTRASEÑA (solo admin, para admin y staff)
// ============================================================
app.put('/api/admin/password', auth, soloAdmin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  const u = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);
  if (!u) return res.status(404).json({ error: 'Usuario no existe' });
  db.prepare('UPDATE usuarios SET pass_hash = ? WHERE username = ?').run(hashPass(password), username);
  res.json({ ok: true });
});

// ---------- ARRANQUE ----------
// Cargar el nombre de la impresora guardado (si existe)
try {
  const imp = db.prepare("SELECT valor FROM ajustes WHERE clave = 'impresora_nombre'").get();
  if (imp && imp.valor) impresora.setImpresora(imp.valor);
} catch (e) { /* ok */ }

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   POS La Gelateria de Roses — EN MARCHA   ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  En este ordenador:  http://localhost:${PORT}`);
  console.log(`  Desde iPad/móvil:   http://[IP-DE-ESTE-PC]:${PORT}`);
  console.log('');
  console.log('  Usuarios por defecto:');
  console.log('    admin / admin   (tú — ve todo)');
  console.log('    staff / staff   (personal — solo cobrar)');
  console.log('');
});
