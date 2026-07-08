const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'gelateria_metricas_token';
let token = localStorage.getItem(TOKEN_KEY) || '';
let timer = null;

function eur(n){ return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(n||0)); }
function hora(iso){ try { return new Date(iso).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}); } catch { return '—'; } }
function hoyISO(){ const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
function setEstado(msg, isError=false){ $('estado').textContent=msg||''; $('estado').style.color=isError?'#ffdddd':'#fff'; }

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
    const d = await api('/api/metricas/resumen?dia=' + encodeURIComponent(dia));
    render(d);
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

function render(d){
  $('subtitulo').textContent = 'Dia ' + d.dia;
  $('total').textContent = eur(d.totales.total);
  $('tickets').textContent = d.totales.tickets || 0;
  $('ticketMedio').textContent = eur(d.totales.ticket_medio);
  $('clientes').textContent = d.clientes || 0;
  $('efectivo').textContent = eur(d.totales.efectivo);
  $('tarjeta').textContent = eur(d.totales.tarjeta);
  $('unidades').textContent = (d.unidadesTotal || 0) + ' uts';
  $('actualizado').textContent = 'Actualitzat ' + hora(d.actualizadoEn);
  $('mejorHora').textContent = d.mejorHora ? `${d.mejorHora.hora}:00 · ${eur(d.mejorHora.total)}` : '—';

  const maxHora = Math.max(1, ...((d.porHora||[]).map(x=>Number(x.total||0))));
  $('horas').innerHTML = (d.porHora||[]).length ? d.porHora.map(x => {
    const pct = Math.max(2, Math.round(Number(x.total||0) / maxHora * 100));
    return `<div class="barrow"><span>${x.hora}:00</span><div class="barbg"><div class="bar" style="width:${pct}%"></div></div><span class="money">${eur(x.total)}</span></div>`;
  }).join('') : '<div class="row"><b>Sense vendes encara</b><span></span></div>';

  $('productos').innerHTML = (d.porProducto||[]).length ?
    `<div class="table-scroll"><table>
      <thead><tr><th>Producte</th><th class="center">Unitats</th><th class="right">€</th></tr></thead>
      <tbody>
      ${d.porProducto.map((p,i)=>
        `<tr><td><b>${i+1}. ${escapeHtml(p.nombre)}</b></td><td class="center">${p.unidades||0}</td><td class="right">${eur(p.total)}</td></tr>`
      ).join('')}
      </tbody>
    </table></div>`
    : '<div class="row"><b>Sense productes encara</b><span></span></div>';

  $('ultimas').innerHTML = (d.ultimas||[]).length ? d.ultimas.map(t =>
    `<div class="row"><span class="badge">#${t.id}</span><div><b>${hora(t.fecha)}</b><br><small>${escapeHtml(t.trabajador || '—')} · ${escapeHtml(t.metodo_pago || '')}${t.estado && t.estado !== 'activa' ? ' · '+escapeHtml(t.estado) : ''}</small></div><div class="right">${eur(t.total)}</div></div>`
  ).join('') : '<div class="row"><b>Sense tiquets encara</b><span></span></div>';
}

function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));}

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
