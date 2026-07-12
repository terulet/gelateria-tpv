const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'gelateria_metricas_token';
let token = localStorage.getItem(TOKEN_KEY) || '';
let timer = null;

function eur(n){ return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(n||0)); }
function hora(iso){ try { return new Date(iso).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}); } catch { return '—'; } }
function hoyISO(){ const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
function setEstado(msg, isError=false){ $('estado').textContent=msg||''; $('estado').style.color=isError?'#ffdddd':'#fff'; }
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}

async function api(path, opts={}){
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {});
  if(token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(path, Object.assign({}, opts, {headers}));
  let data = null;
  try { data = await r.json(); } catch {}
  if(!r.ok) throw new Error((data && data.error) || ('HTTP '+r.status));
  return data;
}

async function login(pin){
  const data = await api('/api/metricas/login', {method:'POST', body:JSON.stringify({pin})});
  token = data.token;
  localStorage.setItem(TOKEN_KEY, token);
  mostrarPanel();
  await cargar();
}

function mostrarLogin(){
  $('login').classList.remove('hidden');
  $('panel').classList.add('hidden');
  clearInterval(timer);
  timer = null;
}
function mostrarPanel(){
  $('login').classList.add('hidden');
  $('panel').classList.remove('hidden');
  $('fecha').value = $('fecha').value || hoyISO();
  if(!timer) timer = setInterval(cargar, 30000);
}

async function cargar(){
  const dia = $('fecha').value || hoyISO();
  setEstado('Actualitzant…');
  try{
    const [d, pro] = await Promise.all([api('/api/metricas/resumen?dia=' + encodeURIComponent(dia)), api('/api/metricas/pro?dia=' + encodeURIComponent(dia))]);
    render(d, pro);
    setEstado('');
  }catch(e){
    if(String(e.message).includes('PIN') || String(e.message).includes('caducada') || String(e.message).includes('401')){
      localStorage.removeItem(TOKEN_KEY); token=''; mostrarLogin();
      $('loginError').textContent = 'Torna a posar el PIN';
    } else {
      setEstado('Error: ' + e.message, true);
    }
  }
}

function render(d, pro){
  $('subtitulo').textContent = 'Dia ' + d.dia;
  $('total').textContent = eur(d.totales.total);
  $('tickets').textContent = d.totales.tickets || 0;
  $('ticketMedio').textContent = eur(d.totales.ticket_medio);
  $('clientes').textContent = d.clientes || 0;
  $('efectivo').textContent = eur(d.totales.efectivo);
  $('tarjeta').textContent = eur(d.totales.tarjeta);
  $('unidades').textContent = (d.unidadesTotal || 0) + ' uts · ' + ((d.porProducto||[]).length) + ' productes';
  $('lineasTotal').textContent = ((d.lineasVendidas||[]).length) + ' línies';
  $('categoriasTotal').textContent = ((d.porCategoria||[]).length) + ' categories';
  $('actualizado').textContent = 'Actualitzat ' + hora(d.actualizadoEn);
  $('mejorHora').textContent = d.mejorHora ? `${d.mejorHora.hora}:00 · ${eur(d.mejorHora.total)}` : '—';

  let acum=0;
  $('horas').innerHTML = (d.porHora||[]).length ? `<table class="data-table"><thead><tr><th>Hora</th><th>Venda hora</th><th>Acumulat</th></tr></thead><tbody>${d.porHora.map(x=>{acum+=Number(x.total||0);return `<tr><td><b>${x.hora}:00</b></td><td>${eur(x.total)}</td><td><b>${eur(acum)}</b></td></tr>`}).join('')}</tbody></table>` : '<div class="row"><b>Sense vendes encara</b><span></span></div>';

  const labels=(pro?.dias||[]).map((x,i)=>i===0?'Avui':i===1?'Ahir':new Date(x.dia+'T12:00:00').toLocaleDateString('ca-ES',{weekday:'short',day:'2-digit'}));
  const hores=[10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5];
  $('comparativa7').innerHTML = pro?.dias?.length ? `<table class="data-table compare"><thead><tr><th>Hora</th>${labels.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${hores.map(h=>`<tr><td><b>${String(h).padStart(2,'0')}:00</b></td>${pro.dias.map(x=>`<td>${eur(x.acumulados[h]||0)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="row">Sense dades</div>';
  $('historicoDiario').innerHTML = pro?.historico?.length ? `<table class="data-table"><thead><tr><th>Dia</th><th>Total</th><th>Tiquets</th><th>Tiquet mig</th><th>Efectiu</th><th>Targeta</th></tr></thead><tbody>${pro.historico.map(x=>`<tr><td><b>${new Date(x.dia+'T12:00:00').toLocaleDateString('ca-ES',{weekday:'short',day:'2-digit',month:'2-digit'})}</b></td><td><b>${eur(x.total)}</b></td><td>${x.tickets}</td><td>${eur(x.ticket_medio)}</td><td>${eur(x.efectivo)}</td><td>${eur(x.tarjeta)}</td></tr>`).join('')}</tbody></table>` : '<div class="row">Sense dades</div>';

  $('categorias').innerHTML = (d.porCategoria||[]).length ? d.porCategoria.map((c,i)=>{
    const pct = Number(d.totales.total||0) > 0 ? Math.round(Number(c.total||0)/Number(d.totales.total||1)*100) : 0;
    return `<div class="row"><div><b>${i+1}. ${escapeHtml(c.categoria || '')}</b><br><small>${c.unidades||0} unitats · ${pct}% del dia</small></div><div class="right">${eur(c.total)}</div></div>`;
  }).join('') : '<div class="row"><b>Sense categories encara</b><span></span></div>';

  $('productos').innerHTML = (d.porProducto||[]).length ? d.porProducto.map((p,i)=>
    `<div class="row"><div><b>${i+1}. ${escapeHtml(p.nombre)}</b><br><small>${escapeHtml(p.categoria || '')} · ${p.unidades||0} unitats · ${p.tickets||0} tiquets · preu mig ${eur(p.precio_medio||0)}</small></div><div class="right">${eur(p.total)}</div></div>`
  ).join('') : '<div class="row"><b>Sense productes encara</b><span></span></div>';

  $('lineas').innerHTML = (d.lineasVendidas||[]).length ? d.lineasVendidas.map(l =>
    `<div class="row"><span class="badge">#${l.ticket_id}</span><div><b>${hora(l.fecha)} · ${escapeHtml(l.nombre)}</b><br><small>${escapeHtml(l.categoria || '')} · ${escapeHtml(l.trabajador || '—')} · ${escapeHtml(l.metodo_pago || '')} · ${l.cantidad} × ${eur(l.precio_unit)}</small></div><div class="right">${eur(l.subtotal)}</div></div>`
  ).join('') : '<div class="row"><b>Sense línies encara</b><span></span></div>';

  $('ultimas').innerHTML = (d.ultimas||[]).length ? d.ultimas.map(t =>
    `<div class="row"><span class="badge">#${t.id}</span><div><b>${hora(t.fecha)}</b><br><small>${escapeHtml(t.trabajador || '—')} · ${escapeHtml(t.metodo_pago || '')}${t.estado && t.estado !== 'activa' ? ' · '+escapeHtml(t.estado) : ''}</small></div><div class="right">${eur(t.total)}</div></div>`
  ).join('') : '<div class="row"><b>Sense tiquets encara</b><span></span></div>';
}

$('pinForm').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  $('loginError').textContent='';
  try { await login($('pin').value); $('pin').value=''; }
  catch(e){ $('loginError').textContent = e.message || 'PIN incorrecte'; }
});
$('refreshBtn').addEventListener('click', cargar);
$('fecha').addEventListener('change', cargar);
$('logoutBtn').addEventListener('click', async ()=>{
  try { if(token) await api('/api/metricas/logout', {method:'POST'}); } catch {}
  localStorage.removeItem(TOKEN_KEY); token=''; mostrarLogin();
});

$('fecha').value = hoyISO();
if(token){ mostrarPanel(); cargar(); } else { mostrarLogin(); }
