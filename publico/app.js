// ============================================================
//  POS La Gelateria de Roses — Frontend v3 (layout ràpid)
// ============================================================

let TOKEN = null, ROL = null, USER = null;
let catalogo = { categorias: [], productos: [] };
let catActiva = null;
let ticket = [];          // { producto_id, nombre, precio, cantidad, color }
let descuento = 0;
let fidelitat = false;   // premio fidelitat: resta 3€
const PREMI_FIDELITAT = 3;
let trabajadores = [];
let modoReordenar = false;   // solo admin: arrastrar para reordenar menús/productos

// Ajustes de diseño (layout Prigest, TPV 1024x768)
const AJUSTES_DEFECTO = {
  ticketH: 190,                               // alto zona ticket arriba
  catW: 320, catH: 104, catFont: 18,         // Zona 1: menús grandes (café/taxi scroll)
  prodCols: 4, prodH: 82, prodFont: 14,      // Zona 2: productos (5 filas)
  barraFont: 11, barraH: 7,                   // Zona 3: botones
  payW: 250, totalFont: 38,                   // Zona 4: total/cobrar
  prodCentrat: 1                              // texto productos centrado
};
let ajustes = { ...AJUSTES_DEFECTO };

function aplicarAjustes() {
  const r = document.documentElement.style;
  r.setProperty('--z-ticketH', ajustes.ticketH + 'px');
  r.setProperty('--z-catW', ajustes.catW + 'px');
  r.setProperty('--z-catH', ajustes.catH + 'px');
  r.setProperty('--z-catFont', ajustes.catFont + 'px');
  r.setProperty('--z-prodCols', ajustes.prodCols);
  r.setProperty('--z-prodH', ajustes.prodH + 'px');
  r.setProperty('--z-prodFont', ajustes.prodFont + 'px');
  r.setProperty('--z-barraFont', ajustes.barraFont + 'px');
  r.setProperty('--z-barraH', ajustes.barraH + 'px');
  r.setProperty('--z-payW', ajustes.payW + 'px');
  r.setProperty('--z-totalFont', ajustes.totalFont + 'px');
  if (catActiva) renderProductos();  // re-render para aplicar el centrado (solo si ya hay categoría)
}
let multiplicador = 1;
let aparcados = [];
let busqueda = '';

const $ = s => document.querySelector(s);
const euro = n => (n || 0).toFixed(2).replace('.', ',') + ' €';

async function api(ruta, opciones = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const res = await fetch('/api' + ruta, { ...opciones, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error' }));
    throw new Error(err.error || 'Error del servidor');
  }
  return res.json();
}

setInterval(() => {
  const d = new Date(), r = $('#reloj');
  if (r) r.textContent = d.toLocaleDateString('ca-ES') + '  ·  ' + d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
}, 1000);

// ---------- TECLADO QWERTY ----------
const FILAS_QWERTY = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l','ç'],
  ['z','x','c','v','b','n','m','.','-','_']
];
let loginFocus = 'user';
let loginVals = { user: '', pass: '' };

function focusLogin(campo) {
  loginFocus = campo;
  $('#f-user').classList.toggle('active', campo === 'user');
  $('#f-pass').classList.toggle('active', campo === 'pass');
}
function renderLoginTeclado() {
  const cont = $('#login-teclado'); cont.innerHTML = '';
  FILAS_QWERTY.flat().forEach(k => {
    const b = document.createElement('button'); b.className = 'tecla'; b.textContent = k;
    b.onclick = () => loginTecla(k); cont.appendChild(b);
  });
  const space = document.createElement('button'); space.className = 'tecla wide'; space.textContent = '␣';
  space.onclick = () => loginTecla(' '); cont.appendChild(space);
  const del = document.createElement('button'); del.className = 'tecla wide del2'; del.textContent = '⌫';
  del.onclick = () => loginTecla('DEL'); cont.appendChild(del);
  const ok = document.createElement('button'); ok.className = 'tecla wide ok'; ok.textContent = 'Entrar';
  ok.onclick = () => doLogin(); cont.appendChild(ok);
}
function loginTecla(k) {
  if (k === 'DEL') loginVals[loginFocus] = loginVals[loginFocus].slice(0, -1);
  else loginVals[loginFocus] += k;
  pintarLogin();
}

// ---------- TECLADO TÀCTIL UNIVERSAL ----------
// Abre un teclado en pantalla para escribir en cualquier campo.
// onOK recibe el texto escrito. tipus: 'text' | 'password' | 'numeric'
function tecladoTactil(opciones = {}) {
  const { titol = 'Escriu', valorInicial = '', tipus = 'text', onOK } = opciones;
  let valor = valorInicial;
  let mayus = tipus === 'text';  // los nombres suelen empezar en mayúscula
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const filas = tipus === 'numeric'
    ? [['1','2','3'],['4','5','6'],['7','8','9'],['.','0','DEL']]
    : FILAS_QWERTY;
  ov.innerHTML = `
    <div class="modal" style="max-width:660px">
      <h2 style="margin-bottom:12px">${titol}</h2>
      <div id="tt-display" class="tt-display"></div>
      <div id="tt-teclado" class="adm-teclado" style="grid-template-columns:repeat(${tipus==='numeric'?3:10},1fr)"></div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn-conf-cancel" style="flex:1" onclick="this.closest('.overlay').remove()">Cancel·lar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const disp = ov.querySelector('#tt-display');
  const tcont = ov.querySelector('#tt-teclado');
  function pintar() {
    if (tipus === 'password') disp.textContent = valor ? '•'.repeat(valor.length) : '';
    else disp.innerHTML = valor || '<span style="color:#9db3b6">escriu aquí…</span>';
  }
  function pintarTeclado() {
    tcont.innerHTML = '';
    // tecla mayúsculas (solo para texto)
    if (tipus !== 'numeric') {
      const shift = document.createElement('button');
      shift.className = 'tecla' + (mayus ? ' shift-on' : '');
      shift.textContent = mayus ? '⇧ ABC' : '⇧ abc';
      shift.onclick = () => { mayus = !mayus; pintarTeclado(); };
      tcont.appendChild(shift);
    }
    filas.flat().forEach(k => {
      const b = document.createElement('button');
      b.className = 'tecla' + (k==='DEL'?' del2':'');
      const car = (mayus && k.length === 1 && k.match(/[a-zç]/)) ? k.toUpperCase() : k;
      b.textContent = k === 'DEL' ? '⌫' : car;
      b.onclick = () => {
        if (k === 'DEL') valor = valor.slice(0, -1);
        else valor += car;
        pintar();
      };
      tcont.appendChild(b);
    });
    if (tipus !== 'numeric') {
      const space = document.createElement('button'); space.className = 'tecla wide'; space.textContent = '␣';
      space.onclick = () => { valor += ' '; pintar(); }; tcont.appendChild(space);
    }
    const del = document.createElement('button'); del.className = 'tecla wide del2'; del.textContent = '⌫';
    del.onclick = () => { valor = valor.slice(0, -1); pintar(); }; tcont.appendChild(del);
    const ok = document.createElement('button'); ok.className = 'tecla wide ok'; ok.textContent = '✓ OK';
    ok.onclick = () => { ov.remove(); if (onOK) onOK(valor.trim()); };
    tcont.appendChild(ok);
  }
  pintarTeclado();
  pintar();
}
function pintarLogin() {
  const u = $('#v-user'), p = $('#v-pass');
  if (loginVals.user) { u.textContent = loginVals.user; u.classList.remove('ph'); }
  else { u.textContent = 'toca aquí'; u.classList.add('ph'); }
  if (loginVals.pass) { p.textContent = '•'.repeat(loginVals.pass.length); p.classList.remove('ph'); }
  else { p.textContent = 'toca aquí'; p.classList.add('ph'); }
}

async function doLogin() {
  $('#login-err').textContent = '';
  try {
    const r = await api('/login', { method: 'POST', body: JSON.stringify({ username: loginVals.user.trim(), password: loginVals.pass }) });
    TOKEN = r.token; ROL = r.rol; USER = r.username;
    $('#login').style.display = 'none';
    $('#app').style.display = 'flex';
    { const c = $('#chip-user'); if (c) { c.textContent = USER; c.className = 'chip' + (ROL === 'admin' ? ' admin' : ''); } }
    if (ROL === 'admin') $('#btn-admin').classList.remove('hidden');
    else $('#btn-admin').classList.add('hidden');
    if (ROL === 'admin') $('#btn-reordenar').classList.remove('hidden');
    else $('#btn-reordenar').classList.add('hidden');
    await cargarCatalogo();
    await cargarTrabajadores();
  } catch (e) { $('#login-err').textContent = e.message; }
}
async function doLogout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  TOKEN = null; ROL = null; USER = null; ticket = []; descuento = 0; aparcados = [];
  loginVals = { user: '', pass: '' }; pintarLogin();
  $('#app').style.display = 'none'; $('#login').style.display = 'flex'; focusLogin('user');
}

// Minimizar la ventana (útil en modo kiosco para abrir otro programa como Prigest)
async function minimitzar() {
  try { await api('/finestra/minimitzar', { method: 'POST' }); }
  catch (e) { toast('⚠️ No s\'ha pogut minimitzar', true); }
}

// Confirmar antes de salir/cerrar
function confirmarSortir() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:420px;text-align:center">
      <h2 style="margin-bottom:10px">Tancar el programa?</h2>
      <p style="color:var(--txt-dim);margin-bottom:22px">Segur que vols sortir del TPV?</p>
      <div style="display:flex;gap:12px">
        <button class="btn-conf-cancel" style="flex:1;padding:18px;font-size:17px" onclick="this.closest('.overlay').remove()">No, tornar</button>
        <button class="btn-conf-ok" style="flex:1;padding:18px;font-size:17px;background:var(--coral)" onclick="sortirDeVeritat()">Sí, sortir</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

async function sortirDeVeritat() {
  document.querySelector('.overlay')?.remove();
  try { await api('/finestra/tancar', { method: 'POST' }); } catch {}
  // por si acaso, también intentar cerrar por JS
  setTimeout(() => { try { window.close(); } catch {} }, 400);
}

// ---------- CATÁLOGO ----------
async function cargarCatalogo() {
  catalogo = await api('/catalogo');
  // Aplicar ajustes de diseño guardados
  if (catalogo.ajustes) {
    for (const k of Object.keys(AJUSTES_DEFECTO)) {
      if (catalogo.ajustes[k] != null && catalogo.ajustes[k] !== '') ajustes[k] = Number(catalogo.ajustes[k]);
    }
  }
  aplicarAjustes();
  renderCategorias();
  if (catalogo.categorias.length) seleccionarCat(catalogo.categorias[0].id);
}
function renderCategorias() {
  const cont = $('#cats'); cont.innerHTML = '';
  for (const c of catalogo.categorias) {
    const b = document.createElement('button');
    b.className = 'cat-btn' + (c.id === catActiva && !busqueda ? ' on' : '') + (modoReordenar ? ' reord' : '');
    b.style.background = c.color;
    b.textContent = c.nombre;
    b.dataset.id = c.id;
    if (!modoReordenar) b.onclick = () => { limpiarBusqueda(true); seleccionarCat(c.id); };
    cont.appendChild(b);
  }
  if (!cont._arrastre) { habilitarArrastre(cont, guardarOrdenCategorias); cont._arrastre = true; }
}
function seleccionarCat(id) { catActiva = id; renderCategorias(); renderProductos(); }

function renderProductos() {
  const cont = $('#prods'); cont.innerHTML = '';
  let prods;
  if (busqueda) {
    const q = busqueda.toLowerCase();
    prods = catalogo.productos.filter(p => p.nombre.toLowerCase().includes(q));
  } else {
    prods = catalogo.productos.filter(p => p.categoria === catActiva);
  }
  if (!prods.length) { cont.innerHTML = '<div class="empty">Cap producte trobat</div>'; return; }
  for (const p of prods) {
    const b = document.createElement('button');
    b.className = 'prod-btn' + (p.precio === 0 ? ' sin-precio' : '') + (modoReordenar ? ' reord' : '') + (ajustes.prodCentrat ? ' centrat' : '');
    b.style.background = p.color || '#f0f0f0';
    b.innerHTML = `<span class="n">${p.nombre}</span><span class="p">${p.precio === 0 ? 'sense preu' : euro(p.precio)}</span>`;
    b.dataset.id = p.id;
    if (!modoReordenar) b.onclick = () => agregarAlTicket(p);
    cont.appendChild(b);
  }
  if (!cont._arrastre) { habilitarArrastre(cont, guardarOrdenProductos); cont._arrastre = true; }
}

// ============================================================
//  MODE REORDENAR (només admin) — arrossegar per ordenar
// ============================================================
function toggleReordenar() {
  modoReordenar = !modoReordenar;
  const btn = $('#btn-reordenar');
  if (btn) {
    btn.textContent = modoReordenar ? '✓ Fet (desar ordre)' : '↕️ Reordenar';
    btn.classList.toggle('reord-on', modoReordenar);
  }
  document.body.classList.toggle('reordenando', modoReordenar);
  renderCategorias();
  renderProductos();
  if (!modoReordenar) toast('✓ Ordre desat');
}

// Hace que un contenedor permita arrastrar sus hijos para reordenar (táctil + ratón)
function habilitarArrastre(cont, onSoltar) {
  let arrastrado = null, placeholder = null, offsetX = 0, offsetY = 0;
  let holdTimer = null, startX = 0, startY = 0, candidato = null, activo = false;

  function puntoXY(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function iniciarArrastre(el, p) {
    activo = true;
    arrastrado = el;
    const r = el.getBoundingClientRect();
    offsetX = p.x - r.left; offsetY = p.y - r.top;
    placeholder = el.cloneNode(true);
    placeholder.classList.add('placeholder-reord');
    placeholder.style.opacity = '0.25';
    el.parentNode.insertBefore(placeholder, el);
    el.classList.add('arrossegant');
    el.style.position = 'fixed';
    el.style.zIndex = '9999';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
    el.style.pointerEvents = 'none';
    moverA(p);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function moverA(p) {
    if (!arrastrado) return;
    arrastrado.style.left = (p.x - offsetX) + 'px';
    arrastrado.style.top = (p.y - offsetY) + 'px';
    // Buscar el elemento más cercano al punto (funciona aunque sueltes en un hueco)
    const items = [...cont.children].filter(el => el !== arrastrado && el !== placeholder && (el.classList.contains('cat-btn') || el.classList.contains('prod-btn')));
    if (!items.length) return;
    let masCercano = null, distMin = Infinity, ponerAntes = true;
    for (const item of items) {
      const r = item.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dist = Math.hypot(p.x - cx, p.y - cy);
      if (dist < distMin) {
        distMin = dist;
        masCercano = item;
        // poner antes si el cursor está a la izquierda o arriba del centro
        ponerAntes = (p.y < cy - 2) || (Math.abs(p.y - cy) <= r.height / 2 && p.x < cx);
      }
    }
    if (masCercano) {
      cont.insertBefore(placeholder, ponerAntes ? masCercano : masCercano.nextSibling);
    }
  }

  function soltar() {
    clearTimeout(holdTimer);
    if (activo && arrastrado && placeholder) {
      arrastrado.classList.remove('arrossegant');
      arrastrado.style.cssText = arrastrado.style.cssText.replace(/position:[^;]*;?|z-index:[^;]*;?|left:[^;]*;?|top:[^;]*;?|width:[^;]*;?|height:[^;]*;?|pointer-events:[^;]*;?/g, '');
      cont.insertBefore(arrastrado, placeholder);
      placeholder.remove();
      onSoltar();
    }
    arrastrado = null; placeholder = null; activo = false; candidato = null;
  }

  cont.addEventListener('touchstart', e => {
    if (!modoReordenar) return;
    const el = e.target.closest('.cat-btn, .prod-btn');
    if (!el) return;
    const p = puntoXY(e);
    startX = p.x; startY = p.y; candidato = el;
    holdTimer = setTimeout(() => iniciarArrastre(el, p), 350);
  }, { passive: true });

  cont.addEventListener('touchmove', e => {
    if (!modoReordenar) return;
    const p = puntoXY(e);
    if (!activo) {
      // si se mueve mucho antes de activar, cancelar (es scroll)
      if (candidato && (Math.abs(p.x - startX) > 12 || Math.abs(p.y - startY) > 12)) {
        clearTimeout(holdTimer); candidato = null;
      }
      return;
    }
    e.preventDefault();
    moverA(p);
  }, { passive: false });

  cont.addEventListener('touchend', soltar);
  cont.addEventListener('touchcancel', soltar);

  // Ratón (para probar en el MSI)
  cont.addEventListener('mousedown', e => {
    if (!modoReordenar) return;
    const el = e.target.closest('.cat-btn, .prod-btn');
    if (!el) return;
    e.preventDefault();
    const p = puntoXY(e);
    iniciarArrastre(el, p);
    const mm = ev => moverA(puntoXY(ev));
    const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); soltar(); };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  });
}

async function guardarOrdenCategorias() {
  const ids = [...$('#cats').querySelectorAll('.cat-btn')].map(b => b.dataset.id);
  // Reasignar el orden en el catálogo local según la nueva posición
  ids.forEach((id, i) => {
    const c = catalogo.categorias.find(x => x.id === id);
    if (c) c.orden = i;
  });
  catalogo.categorias.sort((a, b) => a.orden - b.orden);
  try { await api('/admin/orden-categorias', { method: 'PUT', body: JSON.stringify({ ids }) }); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}

async function guardarOrdenProductos() {
  const ids = [...$('#prods').querySelectorAll('.prod-btn')].map(b => Number(b.dataset.id));
  // Reasignar el orden en el catálogo local. Para no romper el orden global,
  // damos a los productos de esta categoría posiciones consecutivas basadas en su orden mínimo actual.
  const enCat = catalogo.productos.filter(p => p.categoria === catActiva);
  const baseOrden = Math.min(...enCat.map(p => p.orden), 0);
  ids.forEach((id, i) => {
    const p = catalogo.productos.find(x => x.id === id);
    if (p) p.orden = baseOrden + i;
  });
  catalogo.productos.sort((a, b) => a.orden - b.orden);
  try { await api('/admin/orden-productos', { method: 'PUT', body: JSON.stringify({ ids }) }); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}

// ---------- BUSCADOR ----------
function abrirBuscador() {
  let valor = busqueda;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:720px">
      <h2>Cercar producte</h2>
      <div class="msub">Escriu el nom del producte</div>
      <div style="background:var(--panel-2);display:flex;align-items:center;padding:18px 20px;border:2px solid var(--p320);border-radius:14px;margin-bottom:16px">
        <span id="busca-val" style="flex:1;font-size:22px;font-weight:700">${valor || '<span style="color:#9db3b6;font-weight:400">…</span>'}</span>
      </div>
      <div class="teclado qwerty" id="busca-teclado"></div>
      <button class="modal-close" id="busca-cerrar">Tancar</button>
    </div>`;
  document.body.appendChild(ov);
  const pintar = () => { $('#busca-val').innerHTML = valor || '<span style="color:#9db3b6;font-weight:400">…</span>'; };
  const tcont = $('#busca-teclado');
  FILAS_QWERTY.flat().forEach(k => {
    const b = document.createElement('button'); b.className = 'tecla'; b.textContent = k;
    b.onclick = () => { valor += k; busqueda = valor; pintar(); renderProductos(); actualizarBuscadorUI(); };
    tcont.appendChild(b);
  });
  const space = document.createElement('button'); space.className = 'tecla wide'; space.textContent = '␣';
  space.onclick = () => { valor += ' '; busqueda = valor; pintar(); renderProductos(); actualizarBuscadorUI(); };
  tcont.appendChild(space);
  const del = document.createElement('button'); del.className = 'tecla wide del2'; del.textContent = '⌫';
  del.onclick = () => { valor = valor.slice(0, -1); busqueda = valor; pintar(); renderProductos(); actualizarBuscadorUI(); };
  tcont.appendChild(del);
  const ok = document.createElement('button'); ok.className = 'tecla wide ok'; ok.textContent = 'Veure';
  ok.onclick = () => ov.remove(); tcont.appendChild(ok);
  $('#busca-cerrar').onclick = () => ov.remove();
}

function actualizarBuscadorUI() {
  const txt = $('#buscador-txt'), clr = $('#buscador-clear');
  if (!txt) {
    const lupa = $('#btn-lupa');
    if (lupa) lupa.classList.toggle('on', !!busqueda);
    return;
  }
  if (busqueda) { txt.textContent = '🔍 ' + busqueda; txt.classList.remove('ph'); if (clr) clr.classList.remove('hidden'); }
  else { txt.textContent = 'Cerca un producte…'; txt.classList.add('ph'); if (clr) clr.classList.add('hidden'); }
}

function limpiarBusqueda(silent) { busqueda = ''; actualizarBuscadorUI(); if (!silent) renderProductos(); }

// ---------- TICKET (arriba horizontal) ----------
function agregarAlTicket(prod) {
  const cant = multiplicador;
  const existe = ticket.find(l => l.producto_id === prod.id);
  if (existe) existe.cantidad += cant;
  else ticket.push({ producto_id: prod.id, nombre: prod.nombre, precio: prod.precio, cantidad: cant, color: prod.color });
  multiplicador = 1;
  $('#mult-badge').classList.add('hidden');
  renderTicket();
}
function cambiarCantidad(idx, delta) {
  ticket[idx].cantidad += delta;
  if (ticket[idx].cantidad <= 0) ticket.splice(idx, 1);
  renderTicket();
}
function eliminarLinea(idx) { ticket.splice(idx, 1); renderTicket(); }

function renderTicket() {
  const cont = $('#ticket-items');
  if (ticket.length === 0) {
    cont.innerHTML = '<div class="empty-t">Prem un producte per començar</div>';
    $('#total').textContent = '0,00 €';
    $('#btn-cobrar').disabled = true;
    $('#btn-cambio').disabled = true;
    return;
  }
  cont.innerHTML = '';
  let bruto = 0;
  ticket.forEach((l, idx) => {
    const sub = l.precio * l.cantidad; bruto += sub;
    const div = document.createElement('div');
    div.className = 'titem';
    div.innerHTML = `
      <button class="tdel">✕</button>
      <div class="tcol" style="background:${l.color || 'var(--line)'}"></div>
      <div class="tn">${l.nombre}</div>
      <div class="tq"><button class="menos">−</button><span class="n">${l.cantidad}</span><button class="mas">+</button></div>
      <div class="tpr">${euro(l.precio)}</div>
      <div class="ts">${euro(sub)}</div>`;
    div.querySelector('.tdel').onclick = () => eliminarLinea(idx);
    div.querySelector('.menos').onclick = () => cambiarCantidad(idx, -1);
    div.querySelector('.mas').onclick = () => cambiarCantidad(idx, +1);
    cont.appendChild(div);
  });

  // Líneas de descuento y fidelitat como filas visibles (con ✕ para quitarlas)
  let total = bruto * (1 - descuento / 100);
  if (descuento > 0) {
    const impDesc = bruto * (descuento / 100);
    const div = document.createElement('div');
    div.className = 'titem desc-line';
    div.innerHTML = `
      <button class="tdel">✕</button>
      <div class="tcol" style="background:var(--amber)"></div>
      <div class="tn" style="color:#8a6d00">Descompte -${descuento}%${descuento===50 ? ' (staff)' : ''}</div>
      <div class="tq"></div>
      <div class="tpr"></div>
      <div class="ts" style="color:#c0392b">-${euro(impDesc)}</div>`;
    div.querySelector('.tdel').onclick = () => setDesc(0);
    cont.appendChild(div);
  }
  if (fidelitat) {
    total = Math.max(0, total - PREMI_FIDELITAT);
    const div = document.createElement('div');
    div.className = 'titem desc-line';
    div.innerHTML = `
      <button class="tdel">✕</button>
      <div class="tcol" style="background:var(--gold)"></div>
      <div class="tn" style="color:#7a5a00">🎁 Premi Fidelitat</div>
      <div class="tq"></div>
      <div class="tpr"></div>
      <div class="ts" style="color:#c0392b">-3,00 €</div>`;
    div.querySelector('.tdel').onclick = () => toggleFidelitat();
    cont.appendChild(div);
  }

  // auto-scroll al último
  cont.scrollTop = cont.scrollHeight;
  $('#total').textContent = euro(total);
  $('#btn-cobrar').disabled = false;
  $('#btn-cambio').disabled = false;
}

function limpiarTicket() {
  ticket = []; setDesc(0); multiplicador = 1;
  fidelitat = false;
  $('#btn-fidelitat').classList.remove('on');
  $('#mult-badge').classList.add('hidden');
  renderTicket();
}
function setDesc(pct) {
  descuento = pct;
  document.querySelectorAll('.desc-btn').forEach(b => b.classList.toggle('on', +b.dataset.d === pct));
  renderTicket();
}
function toggleFidelitat() {
  fidelitat = !fidelitat;
  $('#btn-fidelitat').classList.toggle('on', fidelitat);
  renderTicket();
}

// ---------- CALCULADORA ----------
function abrirCalculadora() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:360px">
      <h2 style="text-align:center">🧮 Calculadora</h2>
      <div style="background:var(--panel-2);border-radius:14px;padding:18px;margin:14px 0;text-align:right;font-size:38px;font-weight:900;font-variant-numeric:tabular-nums;min-height:74px;word-break:break-all" id="calc-display">0</div>
      <div class="teclado" id="calc-teclado" style="grid-template-columns:repeat(4,1fr)"></div>
      <button class="modal-close" id="calc-cerrar">Tancar</button>
    </div>`;
  document.body.appendChild(ov);
  let expr = '';
  const disp = $('#calc-display');
  const pintar = () => { disp.textContent = expr || '0'; };
  const teclas = ['7','8','9','÷','4','5','6','×','1','2','3','−','0',',','=','+'];
  const tcont = $('#calc-teclado');
  teclas.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tecla';
    if (['÷','×','−','+','='].includes(t)) b.style.background = 'var(--p320)', b.style.color = '#fff';
    if (t === '=') b.classList.add('ok'), b.style.background = 'var(--ok)';
    b.textContent = t;
    b.onclick = () => {
      if (t === '=') {
        try {
          const js = expr.replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-').replace(/,/g,'.');
          const r = Function('"use strict";return (' + js + ')')();
          expr = String(Math.round(r * 100) / 100).replace('.', ',');
        } catch { expr = 'Error'; }
      } else expr += t;
      pintar();
    };
    tcont.appendChild(b);
  });
  // botón borrar
  const clr = document.createElement('button');
  clr.className = 'tecla del2'; clr.textContent = 'C'; clr.style.gridColumn = 'span 4';
  clr.onclick = () => { expr = ''; pintar(); };
  tcont.appendChild(clr);
  $('#calc-cerrar').onclick = () => ov.remove();
}

// ---------- MULTIPLICADOR ----------
function abrirMultiplicador() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:400px">
      <h2>Quantes unitats?</h2>
      <div class="msub">El següent producte s'afegirà amb aquesta quantitat</div>
      <div class="entregado-box"><div class="val" id="mult-val">1</div></div>
      <div class="teclado num" id="mult-teclado"></div>
      <button class="modal-close" id="mult-cerrar">Cancel·lar</button>
    </div>`;
  document.body.appendChild(ov);
  let val = '';
  const pintar = () => $('#mult-val').textContent = val || '1';
  const tcont = $('#mult-teclado');
  ['1','2','3','4','5','6','7','8','9'].forEach(n => {
    const b = document.createElement('button'); b.className = 'tecla'; b.textContent = n;
    b.onclick = () => { val += n; pintar(); }; tcont.appendChild(b);
  });
  const del = document.createElement('button'); del.className = 'tecla del2'; del.textContent = '⌫';
  del.onclick = () => { val = val.slice(0, -1); pintar(); }; tcont.appendChild(del);
  const cero = document.createElement('button'); cero.className = 'tecla'; cero.textContent = '0';
  cero.onclick = () => { val += '0'; pintar(); }; tcont.appendChild(cero);
  const ok = document.createElement('button'); ok.className = 'tecla ok'; ok.textContent = '✓';
  ok.onclick = () => {
    multiplicador = Math.max(1, parseInt(val) || 1);
    $('#mult-badge').textContent = '✖️ ' + multiplicador;
    $('#mult-badge').classList.remove('hidden');
    ov.remove(); toast('Següent producte ×' + multiplicador);
  };
  tcont.appendChild(ok);
  $('#mult-cerrar').onclick = () => ov.remove();
}

// ---------- APARCAR ----------
function aparcarTicket() {
  if (ticket.length === 0) { toast('El tiquet està buit', true); return; }
  aparcados.push({ id: Date.now(), lineas: JSON.parse(JSON.stringify(ticket)), descuento, hora: new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }) });
  ticket = []; setDesc(0); renderTicket(); actualizarAparcadosBtn();
  toast('🎫 Tiquet aparcat');
}
function actualizarAparcadosBtn() { $('#btn-recuperar').textContent = `📋 Aparcats (${aparcados.length})`; }
function verAparcados() {
  if (aparcados.length === 0) { toast('No hi ha tiquets aparcats', true); return; }
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="modal"><h2>Tiquets aparcats</h2><div class="msub">Toca un tiquet per recuperar-lo</div><div id="aparcados-list"></div><button class="modal-close" id="ap-cerrar">Tancar</button></div>`;
  document.body.appendChild(ov);
  const list = $('#aparcados-list');
  aparcados.forEach((ap, idx) => {
    let bruto = ap.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
    const total = bruto * (1 - ap.descuento / 100);
    const nItems = ap.lineas.reduce((s, l) => s + l.cantidad, 0);
    const row = document.createElement('button');
    row.className = 'worker-btn';
    row.style.cssText = 'width:100%;text-align:left;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center';
    row.innerHTML = `<span>🎫 ${ap.hora} · ${nItems} articles</span><b>${euro(total)}</b>`;
    row.onclick = () => {
      if (ticket.length > 0 && !confirm('Tens un tiquet obert. Es substituirà. Continuar?')) return;
      ticket = ap.lineas; setDesc(ap.descuento);
      aparcados.splice(idx, 1); actualizarAparcadosBtn();
      renderTicket(); ov.remove(); toast('Tiquet recuperat');
    };
    list.appendChild(row);
  });
  $('#ap-cerrar').onclick = () => ov.remove();
}

// ============================================================
//  ÚLTIMS TIQUETS (imprimir bajo demanda)
// ============================================================
async function verUltimsTiquets() {
  let data;
  try { data = await api('/ultims-tiquets'); }
  catch (e) { toast('⚠️ ' + e.message, true); return; }
  const tiquets = data.tiquets || [];
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:560px">
      <h2>🧾 Últims tiquets</h2>
      <div class="msub">Toca "Imprimir" al tiquet que et demani el client</div>
      ${tiquets.length ? `<button class="btn-conf-ok" style="width:100%;padding:18px;margin-bottom:16px" id="print-ultim">🖨️ Imprimir l'últim tiquet</button>` : ''}
      <div id="tiquets-list"></div>
      <button class="modal-close" id="ut-cerrar">Tancar</button>
    </div>`;
  document.body.appendChild(ov);
  const list = $('#tiquets-list');
  if (!tiquets.length) {
    list.innerHTML = '<div class="empty">Encara no hi ha tiquets</div>';
  } else {
    tiquets.forEach(t => {
      const hora = new Date(t.fecha).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
      const nItems = t.lineas.reduce((s, l) => s + l.cantidad, 0);
      const resumen = t.lineas.map(l => `${l.cantidad}× ${l.nombre}`).join(', ');
      const row = document.createElement('div');
      row.style.cssText = 'border:2px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:10px';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:800;font-size:15px">🕐 ${hora}${t.fidelitat ? ' · 🎁' : ''}${t.descuento_pct > 0 ? ' · -' + t.descuento_pct + '%' : ''}</span>
          <span style="font-weight:900;font-size:18px;color:var(--p320-dk)">${euro(t.total)}</span>
        </div>
        <div style="font-size:13px;color:var(--txt-dim);line-height:1.3;margin-bottom:10px">${resumen}</div>
        <button class="btn-sm" style="width:100%;padding:12px" data-id="${t.id}">🖨️ Imprimir aquest</button>`;
      row.querySelector('button').onclick = () => imprimirTiquetGuardat(t);
      list.appendChild(row);
    });
  }
  const pu = $('#print-ultim');
  if (pu) pu.onclick = () => imprimirTiquetGuardat(tiquets[0]);
  $('#ut-cerrar').onclick = () => ov.remove();
}

function imprimirTiquetGuardat(t) {
  const lineas = t.lineas.map(l => ({ nombre: l.nombre, precio: l.precio_unit, cantidad: l.cantidad }));
  imprimirTicket({
    id: t.id, lineas, descuento: t.descuento_pct, fidelitat: !!t.fidelitat,
    total: t.total, metodo: 'efectivo', trabajador: t.trabajador, fecha: t.fecha
  });
}

let cobroTrabajador = null;

function totalActual() {
  const bruto = ticket.reduce((s, l) => s + l.precio * l.cantidad, 0);
  let total = bruto * (1 - descuento / 100);
  if (fidelitat) total = Math.max(0, total - PREMI_FIDELITAT);
  return total;
}

function cobrarRapido() {
  if (ticket.length === 0) return;
  cobroTrabajador = null;
  if (descuento === 50) {
    pedirNombreTrabajador(() => confirmarRapido());
  } else {
    confirmarRapido();
  }
}

function confirmarRapido() {
  const total = totalActual();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="confirm-total">
        <div class="l">${descuento === 50 ? `Descompte -50% · ${cobroTrabajador}` : 'Total a cobrar'}</div>
        <div class="v">${euro(total)}</div>
      </div>
      <div class="confirm-btns">
        <button class="btn-conf-cancel" id="c-cancel">Tornar</button>
        <button class="btn-conf-ok" id="c-ok">✓ COBRAR</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  $('#c-cancel').onclick = () => ov.remove();
  $('#c-ok').onclick = () => { ov.remove(); confirmarVenta('efectivo'); };
}

// ---------- COBRO CON CAMBIO (botón pequeño) ----------
function cobrarConCambio() {
  if (ticket.length === 0) return;
  cobroTrabajador = null;
  if (descuento === 50) pedirNombreTrabajador(() => calculadoraCambio(totalActual()));
  else calculadoraCambio(totalActual());
}

// El -50% requiere que el treballador escriba el seu nom a mà (control)
function pedirNombreTrabajador(onOk) {
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:640px">
      <h2>Descompte -50% · només staff</h2>
      <div class="msub">Escriu el teu nom per aplicar aquest descompte (queda registrat)</div>
      <div style="background:var(--panel-2);display:flex;align-items:center;padding:18px 20px;border:2px solid var(--p320);border-radius:14px;margin-bottom:16px">
        <span id="nom-val" style="flex:1;font-size:24px;font-weight:800">${'<span style="color:#9db3b6;font-weight:400">…</span>'}</span>
      </div>
      <div class="teclado qwerty" id="nom-teclado"></div>
      <button class="modal-close" id="nom-cancelar">Cancel·lar</button>
    </div>`;
  document.body.appendChild(ov);
  let nom = '';
  const pintar = () => $('#nom-val').innerHTML = nom || '<span style="color:#9db3b6;font-weight:400">…</span>';
  const tcont = $('#nom-teclado');
  FILAS_QWERTY.flat().forEach(k => {
    const b = document.createElement('button'); b.className = 'tecla'; b.textContent = k;
    b.onclick = () => { nom += k; pintar(); }; tcont.appendChild(b);
  });
  const space = document.createElement('button'); space.className = 'tecla wide'; space.textContent = '␣';
  space.onclick = () => { nom += ' '; pintar(); }; tcont.appendChild(space);
  const del = document.createElement('button'); del.className = 'tecla wide del2'; del.textContent = '⌫';
  del.onclick = () => { nom = nom.slice(0, -1); pintar(); }; tcont.appendChild(del);
  const ok = document.createElement('button'); ok.className = 'tecla wide ok'; ok.textContent = 'Aplicar';
  ok.onclick = () => {
    const n = nom.trim();
    if (!n) { toast('Escriu el teu nom', true); return; }
    cobroTrabajador = n; ov.remove(); onOk();
  };
  tcont.appendChild(ok);
  $('#nom-cancelar').onclick = () => ov.remove();
}

function calculadoraCambio(total) {
  let entregado = 0;
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:460px">
      <h2>Cobrar amb canvi</h2>
      <div class="cambio-total">A cobrar: <b>${euro(total)}</b></div>
      <div class="entregado-box"><div class="lbl">Entregat pel client</div><div class="val" id="entregado-val">0,00 €</div></div>
      <div class="cambio-box" id="cambio-box"><div class="lbl">Canvi a tornar</div><div class="val" id="cambio-val">—</div></div>
      <div class="billetes" id="billetes"></div>
      <div class="teclado num" id="cambio-teclado" style="margin-bottom:14px"></div>
      <div class="confirm-btns">
        <button class="btn-conf-cancel" id="cambio-cancelar">Cancel·lar</button>
        <button class="btn-conf-ok" id="cambio-ok">✓ Cobrar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  let entradaManual = '';
  const actualizar = () => {
    $('#entregado-val').textContent = euro(entregado);
    const box = $('#cambio-box');
    if (entregado === 0) { $('#cambio-val').textContent = '—'; box.classList.remove('negativo'); return; }
    const cambio = entregado - total;
    if (cambio < 0) { box.classList.add('negativo'); box.querySelector('.lbl').textContent = 'Falten'; $('#cambio-val').textContent = euro(-cambio); }
    else { box.classList.remove('negativo'); box.querySelector('.lbl').textContent = 'Canvi a tornar'; $('#cambio-val').textContent = euro(cambio); }
  };
  const bcont = $('#billetes');
  [5, 10, 20, 50].forEach(b => {
    const btn = document.createElement('button'); btn.className = 'billete-btn'; btn.textContent = b + ' €';
    btn.onclick = () => { entregado += b; entradaManual = ''; actualizar(); }; bcont.appendChild(btn);
  });
  const exacto = document.createElement('button'); exacto.className = 'billete-btn exacto'; exacto.textContent = 'Import exacte';
  exacto.onclick = () => { entregado = total; entradaManual = ''; actualizar(); }; bcont.appendChild(exacto);
  const reset = document.createElement('button'); reset.className = 'billete-btn'; reset.style.cssText = 'background:#ffe9e6;color:var(--coral);grid-column:span 2'; reset.textContent = '↺ Zero';
  reset.onclick = () => { entregado = 0; entradaManual = ''; actualizar(); }; bcont.appendChild(reset);
  const tcont = $('#cambio-teclado');
  ['1','2','3','4','5','6','7','8','9'].forEach(n => {
    const b = document.createElement('button'); b.className = 'tecla'; b.textContent = n;
    b.onclick = () => { entradaManual += n; entregado = parseFloat(entradaManual) || 0; actualizar(); }; tcont.appendChild(b);
  });
  const del = document.createElement('button'); del.className = 'tecla del2'; del.textContent = '⌫';
  del.onclick = () => { entradaManual = entradaManual.slice(0, -1); entregado = parseFloat(entradaManual) || 0; actualizar(); }; tcont.appendChild(del);
  const cero = document.createElement('button'); cero.className = 'tecla'; cero.textContent = '0';
  cero.onclick = () => { entradaManual += '0'; entregado = parseFloat(entradaManual) || 0; actualizar(); }; tcont.appendChild(cero);
  const punto = document.createElement('button'); punto.className = 'tecla'; punto.textContent = ',';
  punto.onclick = () => { if (!entradaManual.includes('.')) entradaManual += '.'; }; tcont.appendChild(punto);
  $('#cambio-cancelar').onclick = () => ov.remove();
  $('#cambio-ok').onclick = () => { ov.remove(); confirmarVenta('efectivo', entregado); };
}

async function confirmarVenta(metodo, entregado) {
  try {
    const lineas = ticket.map(l => ({ producto_id: l.producto_id, cantidad: l.cantidad }));

   // 1) Abrir cajón inmediatamente para que no espere al guardado de la venta.
// Lo lanzamos en paralelo y luego comprobamos si falló.
const cajonPromise = api('/abrir-cajon', {
  method: 'POST',
  body: JSON.stringify({ trabajador: cobroTrabajador || USER, motivo: 'venda' })
}).catch(e => ({ cajon: 'error', error: e.message }));

// 2) Guardar venta. No se imprime ticket en el cobro.
const r = await api('/ventas', {
  method: 'POST',
  body: JSON.stringify({
    lineas,
    descuento_pct: descuento,
    fidelitat,
    trabajador: cobroTrabajador,
    metodo_pago: metodo
  })
});

// 3) Esperar resultado del cajón, pero la orden ya salió antes.
const cajon = await cajonPromise;

limpiarTicket();

if (cajon && cajon.cajon === 'error') {
  toast('✓ Venda guardada · ⚠️ calaix no obert', true);
} else {
  toast('✓ Cobrat ' + euro(r.total) + ' · calaix obert');
}
  } catch (e) { toast('⚠️ ' + e.message, true); }
}

// ---------- IMPRESIÓN ----------
function imprimirActivado() { return false; } // Cobrar nunca imprime ticket automáticamente
async function imprimirTicket(v) {
  const lineas = (v.lineas || []).map(l => ({
    nombre: l.nombre,
    cantidad: Number(l.cantidad || 1),
    precio: Number(l.precio != null ? l.precio : (l.precio_unit || 0)),
    subtotal: Number(l.subtotal != null ? l.subtotal : (Number(l.precio != null ? l.precio : (l.precio_unit || 0)) * Number(l.cantidad || 1)))
  }));
  const payload = {
    id: v.id,
    fecha: v.fecha,
    lineas,
    descuento: v.descuento || v.descuento_pct || 0,
    fidelitat: !!v.fidelitat,
    total: Number(v.total || 0),
    metodo: v.metodo || 'efectivo',
    entregado: v.entregado,
    trabajador: v.trabajador
  };
  try {
    await api('/imprimir-ticket', { method: 'POST', body: JSON.stringify(payload) });
    toast('🖨️ Tiquet enviat');
  } catch (e) {
    toast('⚠️ No s\'ha pogut imprimir: ' + e.message, true);
  }
}

// ---------- CAJÓN ----------
async function abrirCajon() {
  try { await api('/abrir-cajon', { method: 'POST', body: JSON.stringify({ trabajador: USER, motivo: 'obertura manual' }) }); toast('💶 Calaix obert'); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
async function cargarTrabajadores() { try { trabajadores = await api('/trabajadores'); } catch { trabajadores = []; } }

// ---------- TOAST ----------
let toastTimer;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}

// ============================================================
//  PANEL ADMIN
// ============================================================
async function mostrarCobro() {
 
  $('#cobro').style.display = 'flex';
  $('#admin').classList.remove('show');
  $('#admin').style.display = 'none';

  $('#btn-admin').classList.remove('hidden');
  $('#btn-volver').classList.add('hidden');

  // IMPORTANTE:
  // Si has entrado como admin, al volver a caja sigues siendo admin.
  // Así puedes reordenar menús/productos desde la pantalla de venta.
  if (ROL === 'admin') {
    const c = $('#chip-user');
    if (c) {
      c.textContent = USER || 'admin';
      c.className = 'chip admin';
    }

    $('#btn-reordenar').classList.remove('hidden');
  } else {
    const c = $('#chip-user');
    if (c) {
      c.textContent = 'Caixa';
      c.className = 'chip';
    }

    $('#btn-reordenar').classList.add('hidden');
    modoReordenar = false;
    document.body.classList.remove('reordenando');
  }

  renderCategorias();
  renderProductos();
}
function mostrarAdmin() {
  if (ROL === 'admin') {
    obrirAdminReal();
  } else {
    // staff: pedir credenciales de admin
    pedirLoginAdmin();
  }
}

function obrirAdminReal() {
  $('#cobro').style.display = 'none'; $('#admin').style.display = 'block'; $('#admin').classList.add('show');
  $('#btn-admin').classList.add('hidden'); $('#btn-volver').classList.remove('hidden');
  $('#btn-reordenar').classList.remove('hidden');
  adminTab('hoy');
}

// Modal de login para entrar en Admin desde el modo staff
function pedirLoginAdmin() {
  const estat = { user: '', pass: '', foco: 'user' };
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:600px">
      <h2 style="margin-bottom:6px">🔒 Entrar a Administració</h2>
      <p style="color:var(--txt-dim);font-size:14px;margin-bottom:16px">Toca un camp i escriu amb el teclat</p>
      <div style="display:flex;gap:12px;margin-bottom:6px">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--txt-dim);margin-bottom:4px">USUARI</div>
          <div id="adm-fuser" class="adm-campo active" onclick="admFoco('user')">toca aquí</div>
        </div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--txt-dim);margin-bottom:4px">CONTRASENYA</div>
          <div id="adm-fpass" class="adm-campo" onclick="admFoco('pass')">toca aquí</div>
        </div>
      </div>
      <div id="adm-err" style="color:var(--coral);font-size:14px;margin:6px 0;min-height:18px"></div>
      <div id="adm-teclado" class="adm-teclado"></div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn-conf-cancel" style="flex:1" onclick="this.closest('.overlay').remove()">Cancel·lar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  window._admLogin = estat;
  // pintar teclado
  const tcont = ov.querySelector('#adm-teclado');
  FILAS_QWERTY.flat().forEach(k => {
    const b = document.createElement('button'); b.className = 'tecla'; b.textContent = k;
    b.onclick = () => admTecla(k); tcont.appendChild(b);
  });
  const del = document.createElement('button'); del.className = 'tecla wide del2'; del.textContent = '⌫';
  del.onclick = () => admTecla('DEL'); tcont.appendChild(del);
  const ok = document.createElement('button'); ok.className = 'tecla wide ok'; ok.textContent = 'Entrar';
  ok.onclick = () => admIntentar(); tcont.appendChild(ok);
}
function admFoco(campo) {
  window._admLogin.foco = campo;
  document.getElementById('adm-fuser').classList.toggle('active', campo === 'user');
  document.getElementById('adm-fpass').classList.toggle('active', campo === 'pass');
}
function admTecla(k) {
  const e = window._admLogin;
  if (k === 'DEL') e[e.foco] = e[e.foco].slice(0, -1);
  else e[e.foco] += k;
  const u = document.getElementById('adm-fuser'), p = document.getElementById('adm-fpass');
  u.textContent = e.user || 'toca aquí'; u.classList.toggle('ph', !e.user);
  p.textContent = e.pass ? '•'.repeat(e.pass.length) : 'toca aquí'; p.classList.toggle('ph', !e.pass);
}
async function admIntentar() {
  const e = window._admLogin;
  const errEl = document.getElementById('adm-err');
  errEl.textContent = '';
  try {
    const r = await api('/login', { method: 'POST', body: JSON.stringify({ username: e.user.trim(), password: e.pass }) });
    if (r.rol !== 'admin') { errEl.textContent = 'Aquest usuari no és administrador'; return; }
    TOKEN = r.token; ROL = r.rol; USER = r.username;
    { const c = $('#chip-user'); if (c) { c.textContent = USER; c.className = 'chip admin'; } }
    document.querySelector('.overlay')?.remove();
    obrirAdminReal();
  } catch (err) { errEl.textContent = err.message || 'Usuari o contrasenya incorrectes'; }
}
async function adminTab(tab) {
  const cont = $('#admin-inner');
  cont.innerHTML = `
    <div class="admin-tabs">
      <button class="admin-tab ${tab==='hoy'?'on':''}" onclick="adminTab('hoy')">📊 Avui</button>
      <button class="admin-tab ${tab==='metriques'?'on':''}" onclick="adminTab('metriques')">📈 Mètriques</button>
      <button class="admin-tab ${tab==='disseny'?'on':''}" onclick="adminTab('disseny')">🎨 Disseny</button>
      <button class="admin-tab ${tab==='cierre'?'on':''}" onclick="adminTab('cierre')">🌙 Tancament</button>
      <button class="admin-tab ${tab==='historico'?'on':''}" onclick="adminTab('historico')">📅 Històric</button>
      <button class="admin-tab ${tab==='productos'?'on':''}" onclick="adminTab('productos')">🏷️ Preus</button>
      <button class="admin-tab ${tab==='staff'?'on':''}" onclick="adminTab('staff')">👥 Treballadors</button>
      <button class="admin-tab ${tab==='config'?'on':''}" onclick="adminTab('config')">🔒 Config</button>
    </div>
    <div id="admin-body"><div class="empty">Carregant…</div></div>`;
  if (tab === 'hoy') safeTab(renderHoy);
  else if (tab === 'metriques') safeTab(renderMetriques);
  else if (tab === 'disseny') safeTab(renderDisseny);
  else if (tab === 'cierre') safeTab(renderCierre);
  else if (tab === 'historico') safeTab(renderHistorico);
  else if (tab === 'productos') safeTab(renderProductosAdmin);
  else if (tab === 'staff') safeTab(renderStaff);
  else if (tab === 'config') safeTab(renderConfig);
}

async function safeTab(fn) {
  try { await fn(); }
  catch (e) {
    const body = $('#admin-body');
    if (body) body.innerHTML = `<div class="empty">⚠️ Error: ${e.message}<br><br>Recarrega la pàgina (Ctrl+F5).</div>`;
  }
}

async function renderMetriques(dia) {
  const q = dia ? '?dia=' + dia : '';
  const d = await api('/admin/metriques' + q);
  const maxHora = Math.max(1, ...d.porHora.map(h => h.total));
  const selDies = d.dies.length ? `<select onchange="renderMetriques(this.value)" style="padding:10px;border:2px solid var(--line);border-radius:10px;font-size:15px;font-weight:700">
    ${d.dies.map(x => `<option value="${x}" ${x===d.dia?'selected':''}>${x}</option>`).join('')}</select>` : '';
  const noms = ['Diumenge','Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte'];
  const nomsMes = ['Gen','Feb','Mar','Abr','Mai','Jun','Jul','Ago','Set','Oct','Nov','Des'];

  // comparativa
  let compHTML = '';
  if (d.comparativa) {
    const dif = d.comparativa.diff;
    const signe = dif >= 0 ? '▲' : '▼';
    const col = dif >= 0 ? 'var(--ok)' : 'var(--coral)';
    compHTML = `<span style="color:${col};font-weight:800;font-size:14px">${signe} ${euro(Math.abs(dif))} vs ${d.comparativa.dia}</span>`;
  }

  // día de la semana (media)
  const dowMedias = d.porDiaSetmana.map(x => ({ dow: +x.dow, mitja: x.dies ? x.total / x.dies : 0 })).sort((a,b)=>b.mitja-a.mitja);
  const maxMes = Math.max(1, ...d.porMes.map(m => m.total));

  $('#admin-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div style="font-size:17px;font-weight:800">📈 Mètriques · ${d.dia}</div>${selDies}
    </div>

    <!-- CLIENTES -->
    <div class="seccion-titulo" style="margin-top:0">👥 Clients (consumicions)</div>
    <div class="cards">
      <div class="card"><div class="k">Clients avui</div><div class="v p320">${d.clients.dia}</div></div>
      <div class="card"><div class="k">Clients aquest mes</div><div class="v">${d.clients.mes}</div></div>
      <div class="card"><div class="k">Clients aquest any</div><div class="v">${d.clients.any}</div></div>
    </div>

    <!-- FACTURACIÓN -->
    <div class="seccion-titulo">💰 Facturació</div>
    <div class="cards">
      <div class="card"><div class="k">Avui ${compHTML ? '· '+compHTML : ''}</div><div class="v p320">${euro(d.facturacio.dia.t)}</div></div>
      <div class="card"><div class="k">Aquest mes</div><div class="v">${euro(d.facturacio.mes.t)}</div></div>
      <div class="card"><div class="k">Aquest any</div><div class="v">${euro(d.facturacio.any.t)}</div></div>
      <div class="card"><div class="k">Ticket mig</div><div class="v">${euro(d.resumen.ticket_mig)}</div></div>
    </div>
    <div class="cards">
      <div class="card"><div class="k">Tiquets avui</div><div class="v">${d.resumen.tickets}</div></div>
      <div class="card"><div class="k">Unitats venudes</div><div class="v">${d.unidadesTotal}</div></div>
      <div class="card"><div class="k">Premis fidelitat</div><div class="v">${d.resumen.premis_fidelitat}</div></div>
      <div class="card"><div class="k">Amb descompte</div><div class="v">${d.resumen.amb_descompte}</div></div>
    </div>

    <!-- HORAS -->
    <div class="seccion-titulo">🕐 Facturació per hores</div>
    <div style="display:flex;align-items:flex-end;gap:6px;height:200px;padding:16px;background:var(--panel);border:2px solid var(--line);border-radius:14px;margin-bottom:10px">
      ${d.porHora.length ? d.porHora.map(h => {
        const alt = Math.round((h.total / maxHora) * 150);
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="font-size:11px;font-weight:700;color:var(--p320-dk)">${euro(h.total).replace(' €','')}</div>
          <div style="width:100%;max-width:44px;height:${alt}px;background:linear-gradient(var(--p320),var(--p320-dk));border-radius:6px 6px 0 0;min-height:4px"></div>
          <div style="font-size:12px;font-weight:700;color:var(--txt-dim)">${h.hora}h</div>
        </div>`;
      }).join('') : '<div class="empty" style="margin:auto">Sense vendes aquest dia</div>'}
    </div>

    <!-- CATEGORÍAS -->
    <div class="seccion-titulo">🗂️ Per categoria (avui)</div>
    <table><thead><tr><th>Categoria</th><th class="num">Unitats</th><th class="num">Facturat</th><th class="num">% del dia</th></tr></thead>
    <tbody>${d.porCategoria.map(c => {
      const pct = d.facturacio.dia.t > 0 ? Math.round(c.total / d.facturacio.dia.t * 100) : 0;
      return `<tr><td style="text-transform:uppercase;font-weight:700">${c.categoria}</td><td class="num">${c.unidades}</td><td class="num">${euro(c.total)}</td><td class="num">${pct}%</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty">Sense vendes</td></tr>'}</tbody></table>

    <!-- ESTACIONALIDAD -->
    <div class="seccion-titulo">📅 Facturació per mes (${d.any})</div>
    <div style="display:flex;align-items:flex-end;gap:8px;height:170px;padding:16px;background:var(--panel);border:2px solid var(--line);border-radius:14px;margin-bottom:10px">
      ${d.porMes.length ? d.porMes.map(m => {
        const alt = Math.round((m.total / maxMes) * 120);
        const mesNum = parseInt(m.mes.slice(5,7)) - 1;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="font-size:11px;font-weight:700;color:var(--p320-dk)">${Math.round(m.total)}</div>
          <div style="width:100%;max-width:50px;height:${alt}px;background:linear-gradient(var(--gold),#b8922f);border-radius:6px 6px 0 0;min-height:4px"></div>
          <div style="font-size:12px;font-weight:700;color:var(--txt-dim)">${nomsMes[mesNum]}</div>
        </div>`;
      }).join('') : '<div class="empty" style="margin:auto">Sense dades</div>'}
    </div>

    <!-- DÍA SEMANA -->
    <div class="seccion-titulo">📆 Dia de la setmana que més factura (mitjana ${d.any})</div>
    <table><thead><tr><th>Dia</th><th class="num">Mitjana per dia</th></tr></thead>
    <tbody>${dowMedias.map(x => `<tr><td style="font-weight:700">${noms[x.dow]}</td><td class="num">${euro(x.mitja)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Sense dades</td></tr>'}</tbody></table>

    <!-- PRODUCTOS -->
    <div class="seccion-titulo">🍦 Rànquing de productes (avui)</div>
    <table><thead><tr><th>Producte</th><th class="num">Unitats</th><th class="num">Facturat</th></tr></thead>
    <tbody>${d.porProducto.map(p => `<tr><td>${p.nombre}</td><td class="num"><b>${p.unidades}</b></td><td class="num">${euro(p.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sense vendes</td></tr>'}</tbody></table>`;
}

// ============================================================
//  DISSENY — ajustar mides de les 4 zones
// ============================================================
function sliderDisseny(label, clau, min, max) {
  return `<div class="ctrl-dis">
    <label>${label}</label>
    <div class="ctrl-dis-row">
      <input type="range" min="${min}" max="${max}" value="${ajustes[clau]}" oninput="canviAjust('${clau}', this.value)">
      <span class="ctrl-dis-val" id="dv-${clau}">${ajustes[clau]}</span>
    </div>
  </div>`;
}

function renderDisseny() {
  $('#admin-body').innerHTML = `
    <style>
      .dis-wrap { display: flex; gap: 18px; align-items: flex-start; }
      .dis-controls { flex: 1; min-width: 0; }
      .dis-preview-col { width: 420px; flex-shrink: 0; position: sticky; top: 0; }
      .dis-preview-box { background: var(--p320); border-radius: 14px; padding: 8px; box-shadow: 0 4px 16px #0004; }
      .dis-preview-title { color: #fff; font-size: 13px; font-weight: 700; margin-bottom: 6px; text-align: center; opacity: .9; }
      .dis-frame { width: 404px; height: 303px; border-radius: 8px; overflow: hidden; background: var(--p320); position: relative; }
      .dis-frame iframe { width: 1024px; height: 768px; border: 0; transform: scale(0.3945); transform-origin: top left; pointer-events: none; }
      .dis-zona { background: var(--panel); border: 2px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
      .dis-zona h3 { font-size: 15px; margin-bottom: 3px; color: var(--p320-dk); }
      .dis-zona .sub { font-size: 12px; color: var(--txt-dim); margin-bottom: 12px; }
      .ctrl-dis { margin-bottom: 10px; }
      .ctrl-dis label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; }
      .ctrl-dis-row { display: flex; align-items: center; gap: 12px; }
      .ctrl-dis-row input[type=range] { flex: 1; accent-color: var(--p320); height: 8px; }
      .ctrl-dis-val { min-width: 44px; text-align: right; font-weight: 800; color: var(--p320-dk); font-variant-numeric: tabular-nums; }
      .dis-switch { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; }
      .dis-switch .sw-label { font-size: 14px; font-weight: 600; }
      .sw-toggle { display: flex; gap: 6px; }
      .sw-toggle button { padding: 8px 18px; border-radius: 9px; font-size: 14px; font-weight: 700; background: var(--panel-2); border: 2px solid var(--line); color: var(--txt); }
      .sw-toggle button.on { background: var(--p320); color: #fff; border-color: var(--p320); }
    </style>

    <div class="msub" style="margin-bottom:14px">Mou els controls i ho veuràs a l'instant a la finestra de la dreta. Prem <b>💾 Desar</b> quan t'agradi. Cada zona és independent.</div>

    <div class="dis-wrap">
      <div class="dis-controls">
        <div class="dis-zona">
          <h3>🎫 Zona ticket (a dalt)</h3>
          <div class="sub">La llista de productes marcats</div>
          ${sliderDisseny('Alçada de la zona del ticket', 'ticketH', 140, 300)}
        </div>

        <div class="dis-zona">
          <h3>◀ Zona 1 · Menús (esquerra)</h3>
          <div class="sub">GELAT, GRANITZAT, MILKSHAKE...</div>
          ${sliderDisseny('Amplada de la columna', 'catW', 220, 460)}
          ${sliderDisseny('Alçada de cada menú', 'catH', 60, 160)}
          ${sliderDisseny('Mida de la lletra', 'catFont', 12, 28)}
        </div>

        <div class="dis-zona">
          <h3>▦ Zona 2 · Productes (centre)</h3>
          <div class="sub">1 bola cono, 2 bolas, soft...</div>
          ${sliderDisseny('Columnes de productes', 'prodCols', 3, 6)}
          ${sliderDisseny('Alçada de cada producte', 'prodH', 60, 140)}
          ${sliderDisseny('Mida de la lletra', 'prodFont', 10, 22)}
          <div class="dis-switch">
            <span class="sw-label">Text dels productes centrat</span>
            <div class="sw-toggle">
              <button id="sw-centrat-si" class="${ajustes.prodCentrat ? 'on' : ''}" onclick="setCentrat(1)">Sí</button>
              <button id="sw-centrat-no" class="${!ajustes.prodCentrat ? 'on' : ''}" onclick="setCentrat(0)">No</button>
            </div>
          </div>
        </div>

        <div class="dis-zona">
          <h3>▬ Zona 3 · Botons de dalt</h3>
          <div class="sub">Sense, -10%, FIDELITAT, Canvi, Buidar...</div>
          ${sliderDisseny('Alçada dels botons', 'barraH', 5, 20)}
          ${sliderDisseny('Mida de la lletra', 'barraFont', 9, 18)}
        </div>

        <div class="dis-zona">
          <h3>▶ Zona 4 · Total i Cobrar (dreta)</h3>
          <div class="sub">TOTAL i botó COBRAR</div>
          ${sliderDisseny('Amplada de la columna', 'payW', 200, 380)}
          ${sliderDisseny('Mida del TOTAL', 'totalFont', 26, 56)}
        </div>
      </div>

      <div class="dis-preview-col">
        <div class="dis-preview-box">
          <div class="dis-preview-title">👁️ Vista prèvia en directe</div>
          <div class="dis-frame">
            <iframe id="dis-preview" src="index.html?preview=1"></iframe>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-sm" style="flex:1;padding:15px;font-size:15px" onclick="desarDisseny()">💾 Desar</button>
          <button class="btn-sm" style="flex:1;padding:15px;font-size:15px;background:var(--panel-2);color:var(--txt)" onclick="resetDisseny()">↺ Per defecte</button>
        </div>
      </div>
    </div>`;
  // aplicar los ajustes actuales al iframe cuando cargue
  setTimeout(actualitzarPreview, 400);
}

// Aplica los ajustes actuales al iframe de vista previa
function actualitzarPreview() {
  const fr = document.getElementById('dis-preview');
  if (!fr || !fr.contentWindow) return;
  try {
    const doc = fr.contentWindow.document;
    const r = doc.documentElement.style;
    r.setProperty('--z-ticketH', ajustes.ticketH + 'px');
    r.setProperty('--z-catW', ajustes.catW + 'px');
    r.setProperty('--z-catH', ajustes.catH + 'px');
    r.setProperty('--z-catFont', ajustes.catFont + 'px');
    r.setProperty('--z-prodCols', ajustes.prodCols);
    r.setProperty('--z-prodH', ajustes.prodH + 'px');
    r.setProperty('--z-prodFont', ajustes.prodFont + 'px');
    r.setProperty('--z-barraFont', ajustes.barraFont + 'px');
    r.setProperty('--z-barraH', ajustes.barraH + 'px');
    r.setProperty('--z-payW', ajustes.payW + 'px');
    r.setProperty('--z-totalFont', ajustes.totalFont + 'px');
    // centrado de productos en la preview
    doc.querySelectorAll('.prod-btn').forEach(b => b.classList.toggle('centrat', !!ajustes.prodCentrat));
  } catch (e) { /* iframe aún cargando */ }
}

function setCentrat(v) {
  ajustes.prodCentrat = v;
  document.getElementById('sw-centrat-si').classList.toggle('on', v === 1);
  document.getElementById('sw-centrat-no').classList.toggle('on', v === 0);
  aplicarAjustes();
  actualitzarPreview();
}

function canviAjust(clau, valor) {
  ajustes[clau] = Number(valor);
  const el = document.getElementById('dv-' + clau);
  if (el) el.textContent = valor;
  aplicarAjustes();
  actualitzarPreview();
}

async function desarDisseny() {
  try {
    await api('/admin/ajustes', { method: 'PUT', body: JSON.stringify(ajustes) });
    toast('💾 Disseny desat');
  } catch (e) { toast('⚠️ ' + e.message, true); }
}

function resetDisseny() {
  if (!confirm('Tornar a la mida per defecte?')) return;
  ajustes = { ...AJUSTES_DEFECTO };
  aplicarAjustes();
  renderDisseny();
  desarDisseny();
}

async function renderHoy() {
  let d;
  try { d = await api('/admin/hoy'); }
  catch (e) { $('#admin-body').innerHTML = `<div class="empty">Error carregant: ${e.message}</div>`; return; }
  const t = d.totales || {};
  const porTrab = d.porTrabajador || [];
  const conDesc = d.conDescuento || [];
  const ultimas = d.ultimas || [];
  $('#admin-body').innerHTML = `
    <div class="cards">
      <div class="card"><div class="k">Total avui</div><div class="v p320">${euro(t.total)}</div></div>
      <div class="card"><div class="k">Tiquets</div><div class="v">${t.tickets || 0}</div></div>
      <div class="card"><div class="k">Efectiu</div><div class="v">${euro(t.efectivo)}</div></div>
      <div class="card"><div class="k">Targeta</div><div class="v">${euro(t.tarjeta)}</div></div>
    </div>
    <div class="seccion-titulo">Per treballador</div>
    <table><thead><tr><th>Treballador</th><th class="num">Tiquets</th><th class="num">Total</th></tr></thead>
    <tbody>${porTrab.map(x => `<tr><td>${x.trabajador}</td><td class="num">${x.tickets}</td><td class="num">${euro(x.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sense vendes</td></tr>'}</tbody></table>
    <div class="seccion-titulo">Vendes amb descompte ⚠️</div>
    <table><thead><tr><th>#</th><th>Hora</th><th>Treballador</th><th>Descompte</th><th class="num">Total</th></tr></thead>
    <tbody>${conDesc.map(v => `<tr><td>${v.id}</td><td>${new Date(v.fecha).toLocaleTimeString('ca-ES',{hour:'2-digit',minute:'2-digit'})}</td><td>${v.trabajador||'—'}</td><td><span class="badge-desc">-${v.descuento_pct}%</span></td><td class="num">${euro(v.total)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Cap descompte avui</td></tr>'}</tbody></table>
    <div class="seccion-titulo">Últimes vendes</div>
    <table><thead><tr><th>#</th><th>Hora</th><th>Treballador</th><th class="num">Total</th><th>Estat</th><th></th></tr></thead>
    <tbody>${ultimas.map(v => {
      const anulada = v.estado === 'anulada';
      const editada = v.estado === 'editada';
      const estatBadge = anulada
        ? '<span style="color:var(--coral);font-weight:800">ANUL·LADA</span>'
        : (editada ? '<span style="color:#c77a00;font-weight:700">editada</span>' : '<span style="color:var(--txt-dim)">—</span>');
      const accions = anulada ? '' :
        `<button class="btn-sm" style="background:var(--panel-2);margin-right:4px" onclick="editarTiquet(${v.id})">✏️ Editar</button>
         <button class="btn-sm" style="background:#ffe9e6;color:var(--coral)" onclick="anularVenta(${v.id})">Anul·lar</button>`;
      return `<tr${anulada?' style="opacity:.55;text-decoration:line-through"':''}><td>${v.id}</td><td>${new Date(v.fecha).toLocaleTimeString('ca-ES',{hour:'2-digit',minute:'2-digit'})}</td><td>${v.trabajador||'—'}</td><td class="num">${euro(v.total)}</td><td>${estatBadge}</td><td style="white-space:nowrap">${accions}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Sense vendes</td></tr>'}</tbody></table>`;
}
async function anularVenta(id) {
  if (!confirm('Anul·lar el tiquet #' + id + ' sencer?\n\nQuedarà registrat i sortirà dels totals de caixa.')) return;
  try { await api('/admin/ticket/' + id + '/anular', { method: 'POST' }); toast('✓ Tiquet anul·lat'); renderHoy(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}

// Abrir el detalle de un ticket para editar/quitar líneas
async function editarTiquet(id) {
  let t;
  try { t = await api('/admin/ticket/' + id); }
  catch (e) { toast('⚠️ ' + e.message, true); return; }
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" style="max-width:560px">
      <h2 style="margin-bottom:4px">✏️ Editar tiquet #${t.id}</h2>
      <p style="color:var(--txt-dim);font-size:13px;margin-bottom:14px">Canvia les unitats o treu productes. Tot queda registrat.</p>
      <div id="edit-lineas"></div>
      <div style="text-align:right;font-size:18px;font-weight:800;color:var(--p320-dk);margin:12px 0">TOTAL: <span id="edit-total">${euro(t.total)}</span></div>
      <div style="display:flex;gap:10px">
        <button class="btn-conf-cancel" onclick="this.closest('.overlay').remove()">Tancar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  pintarLineasEdit(t, ov);
}

function pintarLineasEdit(t, ov) {
  const cont = ov.querySelector('#edit-lineas');
  cont.innerHTML = t.lineas.map(l => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1;font-weight:600">${l.nombre}</div>
      <div style="color:var(--txt-dim);font-size:13px">${euro(l.precio_unit)} u.</div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="btn-sm" style="width:34px" onclick="editarLinea(${t.id}, ${l.id}, ${l.cantidad - 1})">−</button>
        <span style="min-width:28px;text-align:center;font-weight:800">${l.cantidad}</span>
        <button class="btn-sm" style="width:34px" onclick="editarLinea(${t.id}, ${l.id}, ${l.cantidad + 1})">+</button>
      </div>
      <button class="btn-sm" style="background:#ffe9e6;color:var(--coral)" onclick="editarLinea(${t.id}, ${l.id}, 0)">Treure</button>
    </div>`).join('') || '<div class="empty">Sense línies</div>';
}

async function editarLinea(ventaId, lineaId, nuevaCantidad) {
  try {
    const r = await api('/admin/ticket/' + ventaId + '/editar-linea', {
      method: 'POST', body: JSON.stringify({ linea_id: lineaId, nueva_cantidad: nuevaCantidad })
    });
    const ov = document.querySelector('.overlay');
    if (r.estado === 'anulada') {
      toast('Tiquet anul·lat (sense línies)');
      if (ov) ov.remove();
      renderHoy();
      return;
    }
    const t = await api('/admin/ticket/' + ventaId);
    if (ov) {
      ov.querySelector('#edit-total').textContent = euro(t.total);
      pintarLineasEdit(t, ov);
    }
    toast('✓ Canvi desat');
  } catch (e) { toast('⚠️ ' + e.message, true); }
}

async function renderCierre() {
  const est = await api('/cierre/estado');
  const b = $('#admin-body');
  if (!est.cierre) { b.innerHTML = `<div class="card"><div class="k">Estat de la caixa</div><div class="v" style="font-size:22px;margin-bottom:16px">Tancada</div><button class="btn-sm" onclick="abrirCaja()">Obrir caixa nova</button></div>`; return; }
  const c = est.cierre;
  b.innerHTML = `
    <div class="cards">
      <div class="card"><div class="k">Oberta des de</div><div class="v" style="font-size:18px">${new Date(c.abierto_en).toLocaleString('ca-ES')}</div></div>
      <div class="card"><div class="k">Total acumulat</div><div class="v p320">${euro(c.total_ventas)}</div></div>
      <div class="card"><div class="k">Efectiu</div><div class="v">${euro(c.total_efectivo)}</div></div>
      <div class="card"><div class="k">Targeta</div><div class="v">${euro(c.total_tarjeta)}</div></div>
      <div class="card"><div class="k">Tiquets</div><div class="v">${c.num_tickets}</div></div>
    </div>
    <button class="btn-cerrar-caja" onclick="cerrarCaja()">🌙 Tancar caixa i treure tiquet</button>`;
}
async function abrirCaja() { try { await api('/cierre/abrir', { method: 'POST' }); toast('Caixa oberta'); renderCierre(); } catch (e) { toast('⚠️ ' + e.message, true); } }
async function cerrarCaja() {
  if (!confirm('Tancar la caixa? Es generarà el tiquet resum del dia.')) return;
  try { const r = await api('/cierre/cerrar', { method: 'POST' }); mostrarTiquetCierre(r); toast('✓ Caixa tancada'); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
function mostrarTiquetCierre(r) {
  const c = r.resumen;
  let compHTML = '';
  if (r.comparativa) {
    const dif = r.comparativa.diff;
    const signe = dif >= 0 ? '▲' : '▼';
    const col = dif >= 0 ? '#17a67a' : '#ff5a4d';
    compHTML = `<div style="text-align:center;margin-bottom:14px;font-weight:800;color:${col}">${signe} ${euro(Math.abs(dif))} vs ${r.comparativa.dia} (${euro(r.comparativa.total)})</div>`;
  }
  const top5 = r.porProducto.slice(0, 5);
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal">
      <h2>Tancament de caixa</h2>
      <div class="msub">${c.dia_operativo} · ${new Date(c.cerrado_en || Date.now()).toLocaleString('ca-ES')}</div>
      ${compHTML}
      <div class="cards" style="grid-template-columns:1fr 1fr 1fr">
        <div class="card"><div class="k">Facturació</div><div class="v p320">${euro(c.total_ventas)}</div></div>
        <div class="card"><div class="k">Clients</div><div class="v">${r.clients}</div></div>
        <div class="card"><div class="k">Tiquets</div><div class="v">${c.num_tickets}</div></div>
        <div class="card"><div class="k">Ticket mig</div><div class="v" style="font-size:22px">${euro(r.ticket_mig)}</div></div>
        <div class="card"><div class="k">Unitats</div><div class="v" style="font-size:22px">${r.unidades}</div></div>
        <div class="card"><div class="k">Premis fidel.</div><div class="v" style="font-size:22px">${r.premis_fidelitat}</div></div>
      </div>

      <div class="seccion-titulo">🕐 Per franja horària</div>
      <table><tbody>
        <tr><td>☀️ Matí (fins 14h)</td><td class="num">${euro(r.franjas.mati)}</td></tr>
        <tr><td>🌤️ Tarda (14-19h)</td><td class="num">${euro(r.franjas.tarda)}</td></tr>
        <tr><td>🌙 Nit (des de 19h)</td><td class="num">${euro(r.franjas.nit)}</td></tr>
      </tbody></table>

      <div class="seccion-titulo">🗂️ Per categoria</div>
      <table><tbody>${r.porCategoria.map(c2 => `<tr><td style="text-transform:uppercase">${c2.categoria}</td><td class="num">${c2.unidades}×</td><td class="num">${euro(c2.total)}</td></tr>`).join('')}</tbody></table>

      <div class="seccion-titulo">🏆 Top 5 productes</div>
      <table><tbody>${top5.map((p,i) => `<tr><td>${i+1}. ${p.nombre}</td><td class="num">${p.unidades}×</td><td class="num">${euro(p.total)}</td></tr>`).join('')}</tbody></table>

      ${r.amb_descompte > 0 ? `<div class="seccion-titulo">Descomptes aplicats: ${r.amb_descompte}</div>` : ''}

      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="modal-close" style="flex:1;margin:0" onclick="this.closest('.overlay').remove();adminTab('cierre')">Tancar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}
async function renderHistorico() {
  const d = await api('/admin/historico');
  $('#admin-body').innerHTML = `
    <table><thead><tr><th>Data</th><th>Tancat</th><th class="num">Tiquets</th><th class="num">Efectiu</th><th class="num">Targeta</th><th class="num">Total</th><th></th></tr></thead>
    <tbody>${d.cierres.map(c => `<tr><td>${c.dia_operativo}</td><td>${c.cerrado_en ? new Date(c.cerrado_en).toLocaleTimeString('ca-ES',{hour:'2-digit',minute:'2-digit'}) : '—'}</td><td class="num">${c.num_tickets}</td><td class="num">${euro(c.total_efectivo)}</td><td class="num">${euro(c.total_tarjeta)}</td><td class="num">${euro(c.total_ventas)}</td><td><button class="btn-sm" onclick="verCierre(${c.id})">Veure</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Encara no hi ha tancaments</td></tr>'}</tbody></table>`;
}
async function verCierre(id) { mostrarTiquetCierre(await api('/admin/cierre/' + id)); }

async function renderProductosAdmin() {
  const d = await api('/admin/productos');
  window._catColors = {}; d.categorias.forEach(c => window._catColors[c.id] = c.color);
  let html = `
    <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap">
      <button class="btn-sm" style="padding:12px 20px" onclick="modalNouProducte()">➕ Nou producte</button>
      <button class="btn-sm" style="padding:12px 20px;background:var(--gold);color:#3a2a00" onclick="modalNovaCategoria()">🗂️ Nou menú (categoria)</button>
    </div>
    <div class="msub" style="margin-bottom:16px">Edita el preu, nom o color de cada producte. Els que estan a 0,00 surten en vermell.</div>`;
  for (const cat of d.categorias) {
    const prods = d.productos.filter(p => p.categoria === cat.id);
    html += `<div class="seccion-titulo" style="display:flex;align-items:center;gap:10px">
        <span style="width:18px;height:18px;border-radius:5px;background:${cat.color};display:inline-block"></span>
        <span style="color:${cat.color};filter:brightness(0.65)">${cat.nombre}</span>
        <button class="btn-sm" style="padding:5px 12px;font-size:12px;background:var(--panel-2);color:var(--txt-dim)" onclick="esborrarCategoria('${cat.id}','${cat.nombre}')">🗑️</button>
      </div>
      <table><tbody>${prods.length ? prods.map(p => `<tr>
        <td style="${p.activo ? '' : 'opacity:.4;text-decoration:line-through'}"><input class="precio-input" style="width:180px;text-align:left" value="${p.nombre.replace(/"/g,'&quot;')}" onchange="guardarNombre(${p.id}, this.value)"></td>
        <td class="num"><input class="precio-input" type="number" step="0.10" value="${p.precio.toFixed(2)}" onchange="guardarPrecio(${p.id}, this.value)"></td>
        <td class="num"><input type="color" value="${p.color||'#e8e4dc'}" onchange="guardarColor(${p.id}, this.value)" style="width:44px;height:34px;border:2px solid var(--line);border-radius:8px;cursor:pointer"></td>
        <td class="num"><button class="btn-sm" style="background:${p.activo?'var(--panel-2)':'var(--p320)'};color:${p.activo?'var(--txt)':'#fff'}" onclick="toggleProducto(${p.id}, ${p.activo?0:1})">${p.activo?'Ocultar':'Activar'}</button></td>
        <td class="num"><button class="btn-sm" style="background:#ffe9e6;color:var(--coral)" onclick="esborrarProducte(${p.id},'${p.nombre.replace(/'/g,"")}')">🗑️</button></td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">Cap producte en aquest menú</td></tr>'}</tbody></table>`;
  }
  $('#admin-body').innerHTML = html;
}
async function guardarPrecio(id, precio) {
  try { await api('/admin/productos/' + id, { method: 'PUT', body: JSON.stringify({ precio: parseFloat(precio) }) }); toast('✓ Preu desat'); await cargarCatalogo(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
async function guardarNombre(id, nombre) {
  try { await api('/admin/productos/' + id, { method: 'PUT', body: JSON.stringify({ nombre }) }); toast('✓ Nom desat'); await cargarCatalogo(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
async function guardarColor(id, color) {
  try { await api('/admin/productos/' + id, { method: 'PUT', body: JSON.stringify({ color }) }); toast('✓ Color desat'); await cargarCatalogo(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
async function toggleProducto(id, activo) {
  try { await api('/admin/productos/' + id, { method: 'PUT', body: JSON.stringify({ activo }) }); await cargarCatalogo(); renderProductosAdmin(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
async function esborrarProducte(id, nombre) {
  if (!confirm('Esborrar "' + nombre + '"? Les vendes antigues no es toquen.')) return;
  try { await api('/admin/productos/' + id, { method: 'DELETE' }); toast('Producte esborrat'); await cargarCatalogo(); renderProductosAdmin(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
async function esborrarCategoria(id, nombre) {
  if (!confirm('Esborrar el menú "' + nombre + '"?')) return;
  try { await api('/admin/categorias/' + id, { method: 'DELETE' }); toast('Menú esborrat'); await cargarCatalogo(); renderProductosAdmin(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
function modalNouProducte() {
  const cats = catalogo.categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="modal" style="max-width:440px">
    <h2>Nou producte</h2>
    <div class="msub">S'afegirà al menú que triïs</div>
    <label style="font-weight:700;font-size:14px">Menú</label>
    <select id="np-cat" class="precio-input" style="width:100%;text-align:left;margin:6px 0 14px">${cats}</select>
    <label style="font-weight:700;font-size:14px">Nom</label>
    <input id="np-nom" class="precio-input" style="width:100%;text-align:left;margin:6px 0 14px" placeholder="Ex: Gelat especial">
    <label style="font-weight:700;font-size:14px">Preu (€)</label>
    <input id="np-preu" type="number" step="0.10" class="precio-input" style="width:100%;text-align:left;margin:6px 0 14px" placeholder="0.00">
    <label style="font-weight:700;font-size:14px">Color</label>
    <input id="np-color" type="color" value="#8f9de8" style="width:100%;height:44px;border:2px solid var(--line);border-radius:10px;margin:6px 0 16px;cursor:pointer">
    <div class="confirm-btns"><button class="btn-conf-cancel" id="np-cancel">Cancel·lar</button><button class="btn-conf-ok" id="np-ok">Afegir</button></div>
  </div>`;
  document.body.appendChild(ov);
  $('#np-cancel').onclick = () => ov.remove();
  $('#np-ok').onclick = async () => {
    const categoria = $('#np-cat').value, nombre = $('#np-nom').value.trim(), precio = $('#np-preu').value || 0, color = $('#np-color').value;
    if (!nombre) { toast('Escriu el nom', true); return; }
    try { await api('/admin/productos', { method: 'POST', body: JSON.stringify({ categoria, nombre, precio, color }) }); toast('✓ Producte afegit'); ov.remove(); await cargarCatalogo(); renderProductosAdmin(); }
    catch (e) { toast('⚠️ ' + e.message, true); }
  };
}
function modalNovaCategoria() {
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="modal" style="max-width:440px">
    <h2>Nou menú (categoria)</h2>
    <div class="msub">Es crearà un botó de menú nou a l'esquerra</div>
    <label style="font-weight:700;font-size:14px">Nom del menú</label>
    <input id="nc-nom" class="precio-input" style="width:100%;text-align:left;margin:6px 0 14px" placeholder="Ex: GELATS ESPECIALS">
    <label style="font-weight:700;font-size:14px">Color del botó</label>
    <input id="nc-color" type="color" value="#4ECDC4" style="width:100%;height:44px;border:2px solid var(--line);border-radius:10px;margin:6px 0 16px;cursor:pointer">
    <div class="confirm-btns"><button class="btn-conf-cancel" id="nc-cancel">Cancel·lar</button><button class="btn-conf-ok" id="nc-ok">Crear menú</button></div>
  </div>`;
  document.body.appendChild(ov);
  $('#nc-cancel').onclick = () => ov.remove();
  $('#nc-ok').onclick = async () => {
    const nombre = $('#nc-nom').value.trim(), color = $('#nc-color').value;
    if (!nombre) { toast('Escriu el nom', true); return; }
    const id = nombre.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20) + '_' + Date.now().toString().slice(-4);
    try { await api('/admin/categorias', { method: 'POST', body: JSON.stringify({ id, nombre, color }) }); toast('✓ Menú creat'); ov.remove(); await cargarCatalogo(); renderProductosAdmin(); }
    catch (e) { toast('⚠️ ' + e.message, true); }
  };
}

async function renderStaff() {
  await cargarTrabajadores();
  $('#admin-body').innerHTML = `
    <div class="msub" style="margin-bottom:16px">Aquests noms surten quan s'aplica un descompte, per saber qui l'ha fet.</div>
    <div style="display:flex;gap:10px;margin-bottom:20px">
      <input id="nou-treballador" class="precio-input" style="flex:1;text-align:left" placeholder="Nom del treballador">
      <button class="btn-sm" style="padding:12px 22px" onclick="afegirTreballador()">Afegir</button>
    </div>
    <table><tbody>${trabajadores.map(t => `<tr><td>${t.nombre}</td><td class="num"><button class="btn-sm" style="background:#ffe9e6;color:var(--coral)" onclick="eliminarTreballador(${t.id})">Eliminar</button></td></tr>`).join('') || '<tr><td class="empty">Cap treballador encara</td></tr>'}</tbody></table>`;
}
async function afegirTreballador() {
  const nombre = $('#nou-treballador').value.trim();
  if (!nombre) return;
  try { await api('/trabajadores', { method: 'POST', body: JSON.stringify({ nombre }) }); toast('✓ Afegit'); renderStaff(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
async function eliminarTreballador(id) { try { await api('/trabajadores/' + id, { method: 'DELETE' }); renderStaff(); } catch (e) { toast('⚠️ ' + e.message, true); } }

function renderConfig() {
  const impr = imprimirActivado();
  $('#admin-body').innerHTML = `
    <div class="seccion-titulo" style="margin-top:0">🖨️ Impressora i calaix</div>
    <div class="msub" style="margin-bottom:12px">Posiflex PP-8803-B · El calaix s'obre a través de la impressora.</div>

    <div style="background:var(--panel);border:2px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px">
      <label style="display:block;font-weight:600;font-size:14px;margin-bottom:6px">Nom de la impressora a Windows</label>
      <div style="display:flex;gap:10px">
        <div id="impr-nombre-camp" class="camp-tactil" onclick="editarNomImpressora()">toca per escriure</div>
        <button class="btn-sm" style="padding:12px 22px" onclick="desarImpressora()">Desar</button>
      </div>
      <div class="msub" style="margin-top:8px;margin-bottom:0">Toca el camp per escriure amb el teclat. Ha de ser exactament el nom de "Dispositius i impressores" (ex: TIQUETS).</div>
    </div>

    <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <button class="btn-sm" style="padding:14px 24px;background:var(--gold);color:#3a2a00;font-weight:800" onclick="provarCalaix()">💶 Provar obrir calaix</button>
      <button class="btn-sm" style="padding:14px 24px;background:var(--panel-2);color:var(--txt)" onclick="provarImpressio()">🧾 Imprimir tiquet de prova</button>
    </div>
    <div class="msub" style="margin-bottom:26px">
      En cobrar: <b>guarda la venda + obre calaix</b>. No imprimeix tiquet. Els tiquets s'imprimeixen manualment des de <b>Últims tiquets</b>.
    </div>

    <div class="seccion-titulo">🔒 Contrasenyes</div>
    <div style="display:flex;gap:10px;margin-bottom:14px">
      <div id="pass-admin-camp" class="camp-tactil buit" onclick="editarPass('admin')">nova contrasenya admin</div>
      <button class="btn-sm" style="padding:12px 22px" onclick="canviarPass('admin')">Desar admin</button>
    </div>
    <div style="display:flex;gap:10px">
      <div id="pass-staff-camp" class="camp-tactil buit" onclick="editarPass('staff')">nova contrasenya staff</div>
      <button class="btn-sm" style="padding:12px 22px" onclick="canviarPass('staff')">Desar staff</button>
    </div>`;
  api('/impresora').then(r => { const el = $('#impr-nombre-camp'); if (el) { el.textContent = r.nombre || 'toca per escriure'; el.dataset.valor = r.nombre || ''; el.classList.toggle('buit', !r.nombre); } }).catch(() => {});
}

function editarNomImpressora() {
  const el = $('#impr-nombre-camp');
  tecladoTactil({
    titol: '🖨️ Nom de la impressora',
    valorInicial: el.dataset.valor || '',
    onOK: (v) => { el.textContent = v || 'toca per escriure'; el.dataset.valor = v; el.classList.toggle('buit', !v); }
  });
}
async function desarImpressora() {
  const nombre = ($('#impr-nombre-camp').dataset.valor || '').trim();
  try { await api('/impresora', { method: 'PUT', body: JSON.stringify({ nombre }) }); toast('✓ Impressora desada'); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
async function provarCalaix() {
  try { await api('/impresora/prova-calaix', { method: 'POST' }); toast('💶 Ordre enviada al calaix'); }
  catch (e) { toast('⚠️ No s\'ha pogut obrir: ' + e.message, true); }
}
async function provarImpressio() {
  try { await ticketPrueba(); }
  catch (e) { toast('⚠️ ' + e.message, true); }
}
function toggleImprimir() {
  const nou = imprimirActivado() ? 'no' : 'si';
  localStorage.setItem('pos_imprimir', nou);
  toast(nou === 'si' ? '🖨️ Impressió activada' : 'Impressió desactivada'); renderConfig();
}
function ticketPrueba() {
  return imprimirTicket({ id: 0, lineas: [{ nombre: '2 BOLAS CONO', precio: 4.70, cantidad: 1 }, { nombre: 'CAFÉ SOL', precio: 1.50, cantidad: 2 }], descuento: 0, total: 7.70, metodo: 'efectivo', entregado: 10, trabajador: 'PROVA', fecha: new Date().toISOString() });
}
function editarPass(username) {
  const el = $('#pass-' + username + '-camp');
  tecladoTactil({
    titol: '🔒 Nova contrasenya ' + username,
    tipus: 'password',
    valorInicial: el.dataset.valor || '',
    onOK: (v) => { el.dataset.valor = v; el.textContent = v ? '•'.repeat(v.length) : ('nova contrasenya ' + username); el.classList.toggle('buit', !v); }
  });
}
async function canviarPass(username) {
  const el = $('#pass-' + username + '-camp');
  const password = el.dataset.valor || '';
  if (!password) { toast('⚠️ Escriu una contrasenya', true); return; }
  try {
    await api('/admin/password', { method: 'PUT', body: JSON.stringify({ username, password }) });
    toast('✓ Contrasenya canviada');
    el.dataset.valor = ''; el.textContent = 'nova contrasenya ' + username; el.classList.add('buit');
  } catch (e) { toast('⚠️ ' + e.message, true); }
}

async function entrarStaffDirecte() {
  try {
    const r = await api('/login', { method: 'POST', body: JSON.stringify({ username: 'staff', password: 'staff' }) });
    TOKEN = r.token; ROL = r.rol; USER = r.username;
    $('#login').style.display = 'none';
    $('#app').style.display = 'flex';
    const chip = $('#chip-user');
    if (chip) { chip.textContent = 'Caixa'; chip.className = 'chip'; }
    $('#btn-admin')?.classList.remove('hidden');
    $('#btn-reordenar')?.classList.add('hidden');
    await cargarCatalogo();
    try { await cargarTrabajadores(); } catch (e) { /* no crítico */ }
  } catch (e) {
    console.error('entrarStaffDirecte FALLO:', e && e.message, e && e.stack);
    renderLoginTeclado(); pintarLogin(); focusLogin('user');
    $('#login').style.display = 'flex';
  }
}

async function iniciarPreview() {
  document.body.classList.add('preview-mode');
  $('#login').style.display = 'none';
  $('#app').style.display = 'flex';
  try {
    // catálogo público (el endpoint /catalogo no requiere token)
    const cat = await fetch('/api/catalogo-preview').then(r => r.json());
    catalogo = cat;
    if (catalogo.ajustes) {
      for (const k of Object.keys(AJUSTES_DEFECTO)) {
        if (catalogo.ajustes[k] != null && catalogo.ajustes[k] !== '') ajustes[k] = Number(catalogo.ajustes[k]);
      }
    }
    aplicarAjustes();
    renderCategorias();
    if (catalogo.categorias.length) seleccionarCat(catalogo.categorias[0].id);
    // meter unos productos de ejemplo en el ticket para que se vea lleno
    const ej = catalogo.productos.slice(0, 3);
    ticket = ej.map(p => ({ producto_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, color: p.color }));
    renderTicket();
  } catch (e) { /* preview best-effort */ }
}

// ---------- INIT (al final, cuando todas las funciones están definidas) ----------
if (new URLSearchParams(location.search).get('preview') === '1') {
  iniciarPreview();
} else {
  entrarStaffDirecte();
}
