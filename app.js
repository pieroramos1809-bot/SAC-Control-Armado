/* SAC · Control de Armado de Cajas — App (PWA) v2
   Funciona sin internet: guarda lo que registras y lo envía al servidor (Apps Script) cuando vuelve la conexión. */
(function () {
'use strict';

/* ======================= UTILIDADES ======================= */
var CFG = window.SAC_CONFIG || {};
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var tx = function (h) { return String(h).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); };
var fn = function (n) { return Number(n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 }); };
var r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
var pad = function (n) { return String(n).padStart(2, '0'); };
var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
var hoy = function () { return iso(new Date()); };
var sumar = function (n) { var d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
var ahoraLocal = function () { var d = new Date(); return iso(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
var verFecha = function (s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : ''; };
var uid = function () { return 'op' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

/* Pallets completos (PH) + puchos (unidades sueltas) */
function split(c, cap) {
  c = Number(c) || 0; cap = Number(cap) || 0;
  if (cap <= 0) return { ph: 0, pu: r2(c) };
  var ph = Math.floor(c / cap + 1e-9);
  return { ph: ph, pu: r2(c - ph * cap) };
}
function ppHtml(c, cap) {
  if (!c) return '<span class="pu">0</span>';
  if (!(cap > 0)) return fn(c) + ' un.';
  var s = split(c, cap);
  return (s.ph ? '<b>' + fn(s.ph) + '</b> PH' : '') + (s.pu ? (s.ph ? ' <span class="pu">+ ' : '<span class="pu">') + fn(s.pu) + ' pucho' + (s.pu === 1 ? '' : 's') + '</span>' : '');
}
function ppTxt(c, cap) { var s = split(c, cap); return s.ph + ' PH' + (s.pu ? ' + ' + s.pu : ''); }
function cantDe(d, cap) {
  var hay = (d.ph !== undefined && d.ph !== '') || (d.puchos !== undefined && d.puchos !== '');
  if (hay) return r2(Math.max(0, Math.floor(Number(d.ph) || 0)) * (Number(cap) || 0) + Math.max(0, Number(d.puchos) || 0));
  return r2(Number(d.cantidad));
}

/* Almacenamiento local (sobrevive al cierre de la app) */
var LS = {
  get: function (k, def) { try { var v = localStorage.getItem('sac2_' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set: function (k, v) { try { localStorage.setItem('sac2_' + k, JSON.stringify(v)); } catch (e) { toast('No hay espacio para guardar datos en este equipo.', 1); } },
  del: function (k) { try { localStorage.removeItem('sac2_' + k); } catch (e) {} }
};

/* Íconos (trazos simples) */
var ICONOS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  truck: '<path d="M1 6h13v10H1zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  warehouse: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8M7 17h10"/>',
  tag: '<path d="M20 13l-7 7-9-9V4h7l9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 4a3.5 3.5 0 010 7M22 21c0-3-1.5-5-4-5.8"/>',
  refresh: '<path d="M21 12a9 9 0 11-3-6.7M21 3v6h-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  off: '<path d="M2 8.8a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 20h.01M3 3l18 18"/>',
  wifi: '<path d="M2 8.8a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 20h.01"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  moon: '<path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  alert: '<path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  building: '<path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M17 13h0M17 17h0M3 21h18"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6"/>'
};
function ic(n, c) { return '<svg class="ic ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONOS[n] || '') + '</svg>'; }

/* ======================= ESTADO ======================= */
var S = {
  api: CFG.API_URL || LS.get('api', ''), token: LS.get('token', ''), user: LS.get('user', null), plantas: LS.get('plantas', []), perm: LS.get('perm', null),
  planta: LS.get('planta', ''), d: null, v: null, pag: 'dashboard', sub: 'stock', f: { desde: sumar(-30), hasta: sumar(14) }, estado: 'todos', q: '',
  outbox: LS.get('outbox', []), sync: false, cargando: false, offlineData: false, cacheTs: '', tema: LS.get('tema', 'auto'), instalar: null, imp: null, rep: 'detalle'
};
var EXP = {};
var COLA = ['guardarLinea', 'armado', 'entrega', 'mover', 'merma', 'asignarLote'];
var PAGINAS = [
  { id: 'dashboard', t: 'Dashboard', i: 'dashboard' }, { id: 'programacion', t: 'Programación', i: 'calendar' }, { id: 'armado', t: 'Armado', i: 'box' },
  { id: 'entregas', t: 'Entregas', i: 'truck' }, { id: 'almacen', t: 'Almacén', i: 'warehouse' }, { id: 'productos', t: 'Productos', i: 'tag' },
  { id: 'importar', t: 'Importar', i: 'upload' }, { id: 'reportes', t: 'Reportes', i: 'chart' }, { id: 'usuarios', t: 'Administración', i: 'users' }
];
var ESTADOS = { pendiente: 'Pendiente', proceso: 'En proceso', completo: 'Completo', 'sin-necesidad': 'Sin necesidad', cancelada: 'Retirada' };
var online = function () { return navigator.onLine !== false; };
function ver(m) { return !!(S.perm && S.perm[m] && S.perm[m].ver); }
function ed(m) { return !!(S.perm && S.perm[m] && S.perm[m].editar) && (S.planta !== 'TODAS' || m === 'productos' || m === 'usuarios'); }
function nomPlanta(c) { var p = S.plantas.filter(function (x) { return x.codigo === c; })[0]; return c === 'TODAS' ? 'Todas mis plantas' : (p ? p.nombre : c); }
function esAdmin() { return S.user && S.user.rol === 'administrador'; }

/* ======================= COMUNICACIÓN ======================= */
function llamar(accion, datos) {
  if (!S.api) return Promise.resolve({ ok: false, error: 'Falta la URL del servidor.' });
  var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 40000);
  return fetch(S.api, { method: 'POST', body: JSON.stringify({ token: S.token, accion: accion, datos: datos || {} }), signal: ctl.signal, redirect: 'follow' })
    .then(function (r) { return r.text(); })
    .then(function (t2) { try { return JSON.parse(t2); } catch (e) { return { ok: false, red: true, error: 'El servidor no respondió como se esperaba.' }; } })
    .catch(function () { return { ok: false, red: true, error: 'Sin conexión con el servidor.' }; })
    .then(function (r) { clearTimeout(t); return r; });
}
function guardarOutbox() { LS.set('outbox', S.outbox); }
function pendientes() { return S.outbox.filter(function (o) { return o.estado === 'pendiente'; }); }
function conError() { return S.outbox.filter(function (o) { return o.estado === 'error'; }); }

/* Ejecuta una acción. Las de campo (armado, entregas, almacén, programación) se guardan primero en el equipo y se envían en cuanto hay internet. */
function ejecutar(accion, datos) {
  datos = Object.assign({ planta: S.planta }, datos);
  if (COLA.indexOf(accion) > -1) {
    if (S.planta === 'TODAS') return Promise.resolve({ ok: false, error: 'Elige una planta para registrar.' });
    datos.opId = uid(); datos.ts = ahoraLocal();
    S.outbox.push({ opId: datos.opId, accion: accion, datos: datos, estado: 'pendiente', ts: datos.ts });
    guardarOutbox(); derivar();
    return sincronizar(datos.opId);
  }
  if (!online()) return Promise.resolve({ ok: false, error: 'Esta acción necesita internet.' });
  return llamar(accion, datos).then(function (r) {
    if (r.sesion) { pedirLogin(); }
    if (r.red) r.error = 'No se pudo conectar con el servidor. Intenta de nuevo.';
    return r;
  });
}
/* Envía la cola en orden. Devuelve el resultado de la operación "inmediato". */
function sincronizar(inmediato) {
  if (S.sync) { return sleep(250).then(function () { return sincronizar(inmediato); }); }
  S.sync = true; actualizarChip();
  var res = null, huboOk = false, cola = S.outbox.filter(function (o) { return o.estado === 'pendiente'; });
  var i = 0;
  function sig() {
    if (i >= cola.length) return Promise.resolve();
    var op = cola[i++];
    return llamar(op.accion, op.datos).then(function (r) {
      if (r.red || r.sesion) { if (r.sesion) pedirLogin(true); return 'corte'; }
      if (r.ok) { S.outbox = S.outbox.filter(function (o) { return o.opId !== op.opId; }); huboOk = true; if (op.opId === inmediato) res = { ok: true, r: r }; }
      else if (op.opId === inmediato) { S.outbox = S.outbox.filter(function (o) { return o.opId !== op.opId; }); res = r; }
      else { op.estado = 'error'; op.error = r.error || 'Rechazada por el servidor.'; }
      guardarOutbox();
      return sig();
    });
  }
  return sig().then(function () {
    S.sync = false; guardarOutbox();
    if (!res && inmediato) res = { ok: true, pendiente: true };
    derivar(); actualizarChip();
    if (huboOk && !inmediato) { cargar(); }
    return res || { ok: true };
  });
}
function cargar(msg) {
  if (!S.token || !S.planta) { render(); return Promise.resolve(); }
  S.cargando = true; actualizarChip();
  var key = 'cache_' + S.planta;
  return llamar('datos', { planta: S.planta, desde: S.f.desde, hasta: S.f.hasta }).then(function (r) {
    S.cargando = false;
    if (r.ok) { S.d = r; S.offlineData = false; S.cacheTs = r.ahora; LS.set(key, { d: r, ts: r.ahora, f: S.f }); S.plantas = r.plantas; S.perm = r.permisos; LS.set('plantas', S.plantas); LS.set('perm', S.perm); }
    else if (r.sesion) { pedirLogin(true); return; }
    else if (r.red) {
      var c = LS.get(key, null);
      if (c) { S.d = c.d; S.cacheTs = c.ts; S.offlineData = true; if (c.f) S.f = c.f; } else toast('Sin conexión y aún no hay datos guardados de esta planta.', 1);
    } else toast(r.error, 1);
    derivar(); render();
    if (msg && r.ok) toast(msg);
  });
}
/* Datos mostrados = datos del servidor + lo que está pendiente de enviar */
function derivar() {
  if (!S.d) { S.v = null; return; }
  var v = JSON.parse(JSON.stringify(S.d));
  v.lineas.forEach(function (l) { l._p = 0; });
  pendientes().forEach(function (o) { if (S.planta === 'TODAS' || o.datos.planta === S.planta) aplicarOp(v, o); });
  v.lineas.forEach(enr);
  S.v = v;
}
function enr(l) {
  l.entregado = r2(l.t1 + l.t2);
  l.pendiente = l.cancelada ? 0 : Math.max(0, r2(l.porArmar - l.armado));
  l.saldo = l.cancelada ? Math.max(0, r2(l.armado - l.entregado)) : Math.max(0, r2(l.porArmar - l.entregado));
  l.avance = l.porArmar > 0 ? Math.min(100, Math.round(l.armado / l.porArmar * 100)) : (l.armado > 0 ? 100 : 0);
  l.estado = l.cancelada ? 'cancelada' : (l.porArmar <= 0 ? 'sin-necesidad' : (l.armado >= l.porArmar ? 'completo' : (l.armado > 0 ? 'proceso' : 'pendiente')));
  var s = split(l.porArmar, l.capacidad); l.ph = s.ph; l.puchos = s.pu;
}
function lineaDeOp(v, d) { return v.lineas.filter(function (l) { return l.planta === d.planta && (l.id === d.lineaId || (l.fecha === d.fecha && l.codigo === d.codigo)); })[0]; }
function aplicarOp(v, o) {
  var d = o.datos, l, p = v.productos.filter(function (x) { return x.codigo === d.codigo; })[0], cap = p ? p.capacidad : 0, c;
  if (o.accion === 'guardarLinea') {
    if (!p) return;
    var nec = Number(d.nec) || 0, ad = Number(d.adicional) || 0, st = Number(d.stock) || 0, tot = r2(nec + ad), pa = Math.max(0, r2(tot - st));
    l = v.lineas.filter(function (x) { return x.planta === d.planta && ((d.id && x.id === d.id) || (x.fecha === d.fecha && x.codigo === d.codigo)); })[0];
    var campos = { fecha: d.fecha, codigo: d.codigo, programa: Number(d.programa) || 0, nec: nec, adicional: ad, total: tot, stock: st, porArmar: pa, pallets: cap > 0 ? Math.ceil(pa / cap) : 0, nota: d.nota || '', _p: 1 };
    if (l) Object.assign(l, campos);
    else v.lineas.push(Object.assign({ id: 'tmp_' + o.opId, planta: d.planta, descripcion: p.descripcion, proveedor: p.proveedor, capacidad: cap, t1: 0, t2: 0, armado: 0 }, campos));
  } else if (o.accion === 'armado') {
    l = lineaDeOp(v, d); if (l) { l.armado = r2(l.armado + cantDe(d, l.capacidad)); l._p = 1; }
  } else if (o.accion === 'entrega') {
    l = lineaDeOp(v, d); if (l) { c = cantDe(d, l.capacidad); if (Number(d.turno) === 2) l.t2 = r2(l.t2 + c); else l.t1 = r2(l.t1 + c); l._p = 1; }
  } else if (v.stock) {
    var s = v.stock.filter(function (x) { return x.planta === d.planta && x.codigo === d.codigo; })[0]; if (!s) return;
    c = cantDe(d, cap);
    if (o.accion === 'mover' && d.tipo !== 'salida') { s.stock = r2(s.stock + c); if (d.lote) s.enLotes = r2(s.enLotes + c); else s.noAsignado = r2(s.noAsignado + c); }
    else if (o.accion === 'mover') { var dNA = Math.min(Math.max(0, s.noAsignado), c); s.stock = r2(s.stock - c); s.noAsignado = r2(s.noAsignado - dNA); s.enLotes = r2(s.enLotes - (c - dNA)); }
    else if (o.accion === 'merma') { s.stock = r2(s.stock - c); s.mermas = r2(s.mermas + c); if (d.loteId) s.enLotes = r2(s.enLotes - c); else s.noAsignado = r2(s.noAsignado - c); }
    else if (o.accion === 'asignarLote') { s.enLotes = r2(s.enLotes + c); s.noAsignado = r2(s.noAsignado - c); }
    s.bajo = s.minimo > 0 && s.stock <= s.minimo;
  }
}
/* Registrar con mensaje: usado por todos los formularios */
function reg(accion, datos, okMsg) {
  return ejecutar(accion, datos).then(function (r) {
    if (r.ok) {
      if (r.pendiente) { toast('📴 Guardado en este equipo. Se enviará cuando haya internet.'); derivar(); render(); }
      else { toast(okMsg || 'Guardado.'); cargar(); }
      return true;
    }
    toast(r.error || 'No se pudo guardar.', 1); return false;
  });
}

/* ======================= SESIÓN ======================= */
function pedirLogin(vencida) {
  S.token = ''; LS.del('token'); S.sync = false;
  vistaLogin(vencida ? 'Tu sesión venció. Ingresa otra vez: lo pendiente de enviar se conserva.' : '');
}
function salir() {
  llamar('logout', {}).then(function () {});
  S.token = ''; S.d = null; S.v = null; LS.del('token'); LS.del('user'); LS.del('perm'); LS.del('plantas');
  Object.keys(localStorage).forEach(function (k) { if (k.indexOf('sac2_cache_') === 0) localStorage.removeItem(k); });
  vistaLogin('');
}
function entrar(o) {
  return llamar('login', o).then(function (r) {
    if (!r.ok) { toast(r.red ? 'Para ingresar la primera vez necesitas internet.' : r.error, 1); return; }
    S.token = r.token; S.user = r.usuario; S.plantas = r.plantas; S.perm = r.permisos;
    LS.set('token', S.token); LS.set('user', S.user); LS.set('plantas', S.plantas); LS.set('perm', S.perm);
    var ult = LS.get('planta', '');
    S.planta = (ult === 'TODAS' && S.plantas.length > 1) || S.plantas.some(function (p) { return p.codigo === ult; }) ? ult : S.plantas[0].codigo;
    LS.set('planta', S.planta); S.pag = 'dashboard';
    return sincronizar().then(function () { return cargar(); });
  });
}

/* ======================= COMPONENTES ======================= */
function toast(m, mal) { var t = $('toast'); t.textContent = m; t.className = mal ? 'e' : ''; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.display = 'none'; }, mal ? 6500 : 3200); }
function modal(titulo, html, alEnviar, okTxt) {
  var m = $('modal');
  m.innerHTML = '<div class="box"><h3>' + esc(titulo) + '</h3><form id="mf" novalidate>' + html + '<div class="acts2"><button type="button" class="btn ghost" id="mx">' + (alEnviar ? 'Cancelar' : 'Cerrar') + '</button>' + (alEnviar ? '<button class="btn" id="mok">' + (okTxt || 'Guardar') + '</button>' : '') + '</div></form></div>';
  m.style.display = 'flex';
  $('mx').onclick = cerrar;
  $('mf').onsubmit = function (e) {
    e.preventDefault(); if (!alEnviar) return;
    if (!e.target.checkValidity()) { e.target.reportValidity(); return; }
    var o = {}; new FormData($('mf')).forEach(function (v, k) { if (o[k] === undefined) o[k] = v; else o[k] = [].concat(o[k], v); });
    var b = $('mok'); b.disabled = true;
    Promise.resolve(alEnviar(o)).then(function (r) { if (r !== false) cerrar(); else if (b) b.disabled = false; });
  };
}
function cerrar() { $('modal').style.display = 'none'; $('modal').innerHTML = ''; }
function campo(label, name, val, extra) { return '<label class="f"><span>' + label + '</span><input name="' + name + '" value="' + esc(val === undefined || val === null ? '' : val) + '" ' + (extra || '') + '></label>'; }
function sel(label, name, opts, val, extra) {
  return '<label class="f"><span>' + label + '</span><select name="' + name + '" ' + (extra || '') + '>' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>';
}
function ppCampos() {
  return '<div class="r2"><label class="f"><span>Pallets completos (PH)</span><input name="ph" type="number" min="0" step="1" inputmode="numeric" placeholder="0"></label>' +
    '<label class="f"><span>Puchos (unidades sueltas)</span><input name="puchos" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></label></div><div class="calc" id="ppcalc"></div>';
}
function bindPP(f, getCap, extra) {
  function up() {
    var cap = getCap(), c = cantDe({ ph: f.ph.value, puchos: f.puchos.value }, cap), n = Number(f.ph.value) > 0 && !(cap > 0);
    $('ppcalc').innerHTML = n ? '⚠ Este producto no tiene unidades por pallet. Escribe solo puchos (unidades).' : 'Total: <b>' + fn(c) + '</b> unidades' + (cap > 0 ? ' · 1 PH = ' + fn(cap) + ' un.' : '') + (extra ? '<br>' + extra(c) : '');
  }
  ['ph', 'puchos'].forEach(function (n) { f[n].addEventListener('input', up); }); up(); return up;
}
function chip(txt, cls) { return '<span class="chip c-' + cls + '">' + txt + '</span>'; }
function tagEstado(e) { return chip(ESTADOS[e], e); }
function barra(p, cls) { return '<div class="prog ' + (cls || '') + '"><i style="width:' + p + '%"></i></div>'; }

/* Tablas con exportación */
function C(t, key, o) { o = o || {}; return { t: t, n: o.n, f: o.f || function (r) { return o.n ? fn(r[key]) : esc(r[key]); }, v: o.v || function (r) { return r[key]; } }; }
function tabla(cols, filas, o) {
  o = o || {};
  var sc = cols.filter(function (c) { return !c.x; }), bar = '';
  if (o.exp && filas.length) {
    EXP[o.exp] = { titulo: o.titulo || o.exp, cols: cols.filter(function (c) { return !c.p; }), filas: filas };
    bar = '<div class="exp"><span>' + filas.length + ' registros</span>' + ['xlsx', 'pdf', 'csv'].map(function (t) { return '<button class="btn ghost sm" data-a="exp" data-id="' + o.exp + '" data-t="' + t + '">' + ic('download', 'sm') + ' ' + { xlsx: 'Excel', pdf: 'PDF', csv: 'CSV' }[t] + '</button>'; }).join('') + '</div>';
  }
  if (!filas.length) return bar + '<div class="tw"><div class="empty">' + (o.vacio || 'No hay registros en este rango.') + '</div></div>';
  return bar + '<div class="tw"><table><thead><tr>' + sc.map(function (c) { return '<th class="' + (c.n ? 'n' : '') + '">' + c.t + '</th>'; }).join('') + '</tr></thead><tbody>' +
    filas.map(function (r) { return '<tr class="' + (r._p ? 'pend' : '') + '">' + sc.map(function (c) { return '<td class="' + (c.n ? 'n' : '') + '">' + c.f(r) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
}

/* ======================= EXPORTAR (Excel, PDF, CSV) ======================= */
function datosExport(id) {
  var e = EXP[id];
  return { titulo: e.titulo, head: e.cols.map(function (c) { return tx(c.t); }), rows: e.filas.map(function (r) { return e.cols.map(function (c) { var v = c.v ? c.v(r) : tx(c.f(r)); return v === undefined || v === null ? '' : v; }); }) };
}
function nombreArchivo(t) { return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + (S.planta || 'planta').toLowerCase() + '_' + hoy(); }
function subtitulo() { return nomPlanta(S.planta) + ' · ' + verFecha(S.f.desde) + ' al ' + verFecha(S.f.hasta) + ' · generado ' + verFecha(hoy()) + ' ' + ahoraLocal().slice(11, 16) + (S.user ? ' · ' + S.user.nombre : ''); }
function hojaXlsx(titulo, head, rows) {
  var ws = XLSX.utils.aoa_to_sheet([[titulo], [subtitulo()], [], head].concat(rows));
  ws['!cols'] = head.map(function (h, i) { var m = String(h).length; rows.slice(0, 300).forEach(function (r) { m = Math.max(m, String(r[i] === undefined ? '' : r[i]).length); }); return { wch: Math.min(48, m + 2) }; });
  ws['!freeze'] = { xSplit: 0, ySplit: 4 };
  return ws;
}
function exportar(id, tipo) {
  if (!EXP[id]) return;
  var d = datosExport(id), nom = nombreArchivo(d.titulo);
  try {
    if (tipo === 'csv') {
      var q = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var t = [d.head].concat(d.rows).map(function (r) { return r.map(q).join(';'); }).join('\n');
      return bajar(new Blob(['\ufeff' + t], { type: 'text/csv;charset=utf-8' }), nom + '.csv');
    }
    if (tipo === 'xlsx') {
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, hojaXlsx(d.titulo, d.head, d.rows), d.titulo.slice(0, 28).replace(/[\\\/?*\[\]:]/g, ''));
      return XLSX.writeFile(wb, nom + '.xlsx');
    }
    var J = window.jspdf && window.jspdf.jsPDF; if (!J) return toast('El generador de PDF no está disponible.', 1);
    var doc = new J({ orientation: d.head.length > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    doc.setFontSize(15); doc.setTextColor(30, 58, 138); doc.text(d.titulo, 40, 42);
    doc.setFontSize(8.5); doc.setTextColor(100); doc.text(subtitulo(), 40, 58);
    doc.autoTable({ head: [d.head], body: d.rows.map(function (r) { return r.map(function (x) { return typeof x === 'number' ? fn(x) : String(x); }); }), startY: 72, styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [30, 58, 138] }, alternateRowStyles: { fillColor: [244, 247, 252] }, margin: { left: 40, right: 40 } });
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text('Página ' + i + ' de ' + n, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 22, { align: 'right' }); }
    doc.save(nom + '.pdf');
  } catch (e) { toast('No se pudo generar el archivo: ' + e.message, 1); }
}
function bajar(blob, nombre) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

/* ======================= ESTRUCTURA ======================= */
function applyTema() { document.documentElement.setAttribute('data-t', S.tema === 'auto' ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.tema); }
function chipSync() {
  var n = pendientes().length, e = conError().length, w = '';
  if (S.sync || S.cargando) w = '<button class="sync pend" data-a="pend">' + ic('refresh', 'sm spin') + ' Sincronizando…</button>';
  else if (!online()) w = '<button class="sync off" data-a="pend">' + ic('off', 'sm') + ' Sin conexión' + (n ? ' · ' + n + ' pendiente' + (n > 1 ? 's' : '') : '') + '</button>';
  else if (n || e) w = '<button class="sync pend" data-a="pend">' + ic('refresh', 'sm') + ' ' + n + ' por enviar' + (e ? ' · ' + e + ' con error' : '') + '</button>';
  else w = '<button class="sync on" data-a="pend">' + ic('wifi', 'sm') + ' En línea</button>';
  return w;
}
function actualizarChip() { var w = $('chipw'); if (w) w.innerHTML = chipSync(); }
function banners() {
  var h = '';
  if (!online()) h += '<div class="banner off">' + ic('off') + '<span>Sin conexión. Puedes seguir registrando armado, entregas y almacén: se enviarán solos cuando vuelva internet.</span></div>';
  else if (S.offlineData && S.cacheTs) h += '<div class="banner info">' + ic('alert') + '<span>Mostrando datos guardados de ' + esc(S.cacheTs.slice(0, 16)) + '. Toca ⟳ para actualizar.</span></div>';
  if (conError().length) h += '<div class="banner mal">' + ic('alert') + '<span>' + conError().length + ' registro(s) no pudieron enviarse. </span><button class="btn sm" data-a="pend">Revisar</button></div>';
  if (S.planta === 'TODAS' && ['programacion', 'armado', 'entregas', 'almacen', 'importar'].indexOf(S.pag) > -1) h += '<div class="banner info">' + ic('building') + '<span>Estás viendo todas tus plantas (solo lectura). Elige una planta arriba para registrar.</span></div>';
  return h;
}
function filtros() {
  if (['dashboard', 'programacion', 'armado', 'entregas', 'reportes'].indexOf(S.pag) < 0) return '';
  return '<div class="bar"><label class="f"><span>Desde</span><input type="date" id="fd" value="' + S.f.desde + '"></label><label class="f"><span>Hasta</span><input type="date" id="fh" value="' + S.f.hasta + '"></label><button class="btn ghost" data-a="filtrar">Aplicar rango</button></div>';
}
function selPlanta() {
  var op = S.plantas.map(function (p) { return '<option value="' + p.codigo + '"' + (p.codigo === S.planta ? ' selected' : '') + '>' + p.codigo + ' · ' + esc(p.nombre) + '</option>'; });
  if (S.plantas.length > 1) op.push('<option value="TODAS"' + (S.planta === 'TODAS' ? ' selected' : '') + '>TODAS · Mis plantas</option>');
  return '<select id="planta" style="width:auto;max-width:260px;font-weight:700" aria-label="Planta">' + op.join('') + '</select>';
}
function render() {
  if (!S.token) return vistaLogin('');
  var pags = PAGINAS.filter(function (p) { return ver(p.id); });
  if (!pags.some(function (p) { return p.id === S.pag; })) S.pag = 'dashboard';
  var cur = pags.filter(function (p) { return p.id === S.pag; })[0] || { t: '' };
  var prio = ['dashboard', 'armado', 'entregas', 'almacen', 'programacion'], orden = prio.filter(function (i) { return ver(i); }).concat(pags.map(function (p) { return p.id; }).filter(function (i) { return prio.indexOf(i) < 0; }));
  var bn = orden.slice(0, orden.length > 5 ? 4 : 5), mas = orden.length > 5;
  var scrollY = window.scrollY;
  var cont = !S.v ? '<div class="card empty">' + (S.cargando ? 'Cargando datos…' : 'Aún no hay datos en este equipo. Conéctate a internet y toca ⟳ Actualizar.') + '</div>' : (PAG[S.pag] || PAG.dashboard)();
  $('app').innerHTML =
    '<div class="shell"><aside class="side"><div class="brand"><div class="logo">' + ic('box') + '</div><div><b>SAC Armado</b><small>' + esc(CFG.EMPRESA || 'Control de cajas') + '</small></div></div><nav class="nav">' +
    pags.map(function (p) { return '<button data-p="' + p.id + '" class="' + (p.id === S.pag ? 'on' : '') + '">' + ic(p.i) + p.t + '</button>'; }).join('') +
    '</nav><div class="me"><button class="btn ghost sm" data-a="instalar">' + ic('install', 'sm') + ' Instalar app</button><div class="who" data-a="clave" style="cursor:pointer" title="Cambiar mi clave"><div class="av">' + esc((S.user ? S.user.nombre : '?').charAt(0).toUpperCase()) + '</div><div><b>' + esc(S.user ? S.user.nombre : '') + '</b><small>' + esc(S.user ? S.user.rol : '') + '</small></div></div>' +
    '<button class="btn ghost sm" data-a="salir">' + ic('logout', 'sm') + ' Salir</button></div></aside>' +
    '<div class="main"><div class="top"><h2>' + cur.t + '</h2><div class="r">' + selPlanta() + '<span id="chipw">' + chipSync() + '</span>' +
    '<button class="btn ghost icon" data-a="refrescar" title="Actualizar">' + ic('refresh') + '</button><button class="btn ghost icon" data-a="tema" title="Modo claro/oscuro">' + ic('moon') + '</button></div></div>' +
    '<div class="pg">' + banners() + filtros() + '<div id="pgc">' + cont + '</div></div></div></div>' +
    '<nav class="bnav">' + bn.map(function (i) { var p = PAGINAS.filter(function (x) { return x.id === i; })[0]; return '<button data-p="' + i + '" class="' + (i === S.pag ? 'on' : '') + '">' + ic(p.i) + p.t.replace('Administración', 'Admin') + '</button>'; }).join('') +
    (mas ? '<button data-a="mas">' + ic('more') + 'Más</button>' : '') + '</nav>';
  if (S.pag === 'importar' && S.v) bindImportar();
  window.scrollTo(0, scrollY);
}
function vistaLogin(msg) {
  $('app').innerHTML = '<div class="lg"><div class="lgc"><div class="logo">' + ic('box') + '</div><h2>SAC · Control de Armado</h2><p>Programación, armado, entregas y almacén por planta.</p>' +
    (msg ? '<div class="warn">' + esc(msg) + '</div>' : '') +
    '<form id="lf" novalidate>' + (S.api ? '' : '<label class="f"><span>URL del servidor (Apps Script, termina en /exec)</span><input name="api" placeholder="https://script.google.com/macros/s/…/exec" required></label>') +
    '<label class="f"><span>Usuario</span><input name="usuario" autocomplete="username" autocapitalize="none" required></label><label class="f"><span>Clave</span><input name="clave" type="password" autocomplete="current-password" required></label>' +
    '<button class="btn" style="width:100%;justify-content:center">Ingresar</button></form><div class="pl4"><span>PDC</span><span>PY</span><span>PCCH</span><span>PLM</span></div>' +
    (pendientes().length ? '<p style="margin-top:12px">📴 Hay ' + pendientes().length + ' registro(s) pendientes de enviar en este equipo.</p>' : '') + '</div></div>';
  $('lf').onsubmit = function (e) {
    e.preventDefault(); var f = e.target;
    if (f.api) { var u = f.api.value.trim(); if (!/^https:\/\/script\.google\.com\//.test(u)) return toast('Pega la URL completa de la implementación (https://script.google.com/…/exec).', 1); S.api = u; LS.set('api', u); }
    if (!f.usuario.value.trim() || !f.clave.value) return toast('Escribe usuario y clave.', 1);
    var b = f.querySelector('button'); b.disabled = true;
    entrar({ usuario: f.usuario.value, clave: f.clave.value }).then(function () { b.disabled = false; });
  };
}

/* ======================= PÁGINAS ======================= */
var capDe = function (c) { var p = S.v.productos.filter(function (x) { return x.codigo === c; })[0]; return p ? p.capacidad : 0; };
function grupo(L, key) { var m = {}; L.forEach(function (l) { var k = l[key] || '(sin dato)'; var o = m[k] = m[k] || { k: k, a: 0, x: 0 }; o.a += l.porArmar; o.x += Math.min(l.armado, l.porArmar); }); return Object.keys(m).sort().map(function (k) { return m[k]; }); }
function donut(p) {
  var R = 42, Cc = 2 * Math.PI * R;
  return '<svg width="104" height="104" viewBox="0 0 104 104"><circle cx="52" cy="52" r="' + R + '" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="11"/><circle cx="52" cy="52" r="' + R + '" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + (Cc * p / 100) + ' ' + Cc + '" transform="rotate(-90 52 52)"/><text x="52" y="58" text-anchor="middle" fill="#fff" font-size="21" font-weight="800">' + p + '%</text></svg>';
}
function barras(datos) {
  if (!datos.length) return '<div class="empty">Sin datos para graficar.</div>';
  var max = Math.max.apply(null, datos.map(function (d) { return d.a; }).concat([1])), W = 600, H = 190, bw = Math.min(46, (W - 20) / datos.length - 10), out = '';
  datos.forEach(function (d, i) {
    var x = 14 + i * ((W - 28) / datos.length), h1 = d.a / max * (H - 50), h2 = Math.min(d.x, d.a) / max * (H - 50);
    out += '<rect x="' + x + '" y="' + (H - 26 - h1) + '" width="' + bw + '" height="' + h1 + '" rx="6" fill="#c7d7fb"/><rect x="' + x + '" y="' + (H - 26 - h2) + '" width="' + bw + '" height="' + h2 + '" rx="6" fill="#2563eb"/><text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">' + esc(d.l) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;color:var(--mu)">' + out + '</svg><div class="lbl"><span>▇ Por armar</span><span style="color:#2563eb">▇ Armado</span></div>';
}
var PAG = {};
PAG.dashboard = function () {
  var L = S.v.lineas.filter(function (l) { return !l.cancelada; }), sm = function (k) { return L.reduce(function (s, l) { return s + (l[k] || 0); }, 0); };
  var pa = sm('porArmar'), ar = sm('armado'), pc = pa > 0 ? Math.min(100, Math.round(Math.min(ar, pa) / pa * 100)) : 0;
  var bajos = (S.v.stock || []).filter(function (s) { return s.bajo; });
  var kp = [['b-az', 'calendar', 'Líneas programadas', L.length], ['b-vi', 'box', 'Por armar (un)', fn(pa)], ['b-na', 'box', 'Pallets completos', fn(sm('ph')) + ' <span class="pu" style="font-size:13px">PH</span>'], ['b-az', 'tag', 'Puchos (un. sueltas)', fn(sm('puchos'))],
    ['b-ve', 'check', 'Armado (un)', fn(ar)], ['b-ro', 'alert', 'Pendiente (un)', fn(sm('pendiente'))], ['b-az', 'truck', 'Entregado 1° turno', fn(sm('t1'))], ['b-vi', 'truck', 'Entregado 2° turno', fn(sm('t2'))]];
  if (S.v.stock) kp.push(['b-na', 'warehouse', 'Productos con stock bajo', bajos.length]);
  var dias = {}; L.forEach(function (l) { var k = l.fecha; dias[k] = dias[k] || { l: verFecha(k).slice(0, 5), a: 0, x: 0 }; dias[k].a += l.porArmar; dias[k].x += l.armado; });
  var dd = Object.keys(dias).sort().slice(-10).map(function (k) { return dias[k]; });
  var gp = grupo(L, S.planta === 'TODAS' ? 'planta' : 'proveedor');
  var pro = gp.map(function (g) { var p = g.a > 0 ? Math.round(g.x / g.a * 100) : 0; return '<div class="lbl"><b style="color:var(--tx)">' + esc(g.k) + '</b><span>' + fn(g.x) + ' / ' + fn(g.a) + ' · ' + p + '%</span></div>' + barra(p); }).join('') || '<div class="empty">Sin datos.</div>';
  var alertas = bajos.slice(0, 6).map(function (s) { return '<div class="lbl"><span><b style="color:var(--tx)">' + esc(s.codigo) + '</b> ' + (S.planta === 'TODAS' ? esc(s.planta) : '') + '</span><span>' + ppHtml(s.stock, s.capacidad) + ' (mín. ' + fn(s.minimo) + ')</span></div>'; }).join('');
  return '<div class="card hero"><div><h3>' + esc(nomPlanta(S.planta)) + '</h3><p>' + verFecha(S.f.desde) + ' al ' + verFecha(S.f.hasta) + '</p><div style="margin-top:12px"><span class="big">' + fn(ar) + '</span> <span style="opacity:.85">de ' + fn(pa) + ' unidades armadas</span></div></div>' + donut(pc) + '</div>' +
    '<div class="grid kpis">' + kp.map(function (k) { return '<div class="card kpi"><div class="bub ' + k[0] + '">' + ic(k[1]) + '</div><div><small>' + k[2] + '</small><b>' + k[3] + '</b></div></div>'; }).join('') + '</div>' +
    '<div class="grid two" style="margin-bottom:14px"><div class="card"><h3 style="margin-bottom:8px">Armado por día</h3>' + barras(dd) + '</div><div class="card"><h3>' + (S.planta === 'TODAS' ? 'Avance por planta' : 'Avance por proveedor') + '</h3>' + pro + (alertas ? '<h3 style="margin:16px 0 4px">Stock bajo</h3>' + alertas : '') + '</div></div>' +
    '<h3 style="margin:6px 0 10px">Programación del rango</h3>' + tabla([].concat(S.planta === 'TODAS' ? [C('Planta', 'planta')] : [], [C('Fecha', 'fecha', { f: function (l) { return verFecha(l.fecha); }, v: function (l) { return verFecha(l.fecha); } }), C('Código', 'codigo'), C('Descripción', 'descripcion'),
      C('Por armar', 'porArmar', { n: 1, f: function (l) { return ppHtml(l.porArmar, l.capacidad); }, v: function (l) { return l.porArmar; } }), C('Armado (un)', 'armado', { n: 1 }), C('Avance', 'avance', { f: function (l) { return barra(l.avance); }, v: function (l) { return l.avance + '%'; } }), C('Estado', 'estado', { f: function (l) { return tagEstado(l.estado); }, v: function (l) { return ESTADOS[l.estado]; } })]), L, { exp: 'dash', titulo: 'Resumen de programación' });
};
function colsLinea() {
  var X = function (c) { c.x = 1; return c; }, P = function (c) { c.p = 1; return c; };
  return [].concat(S.planta === 'TODAS' ? [C('Planta', 'planta')] : [], [
    C('Fecha', 'fecha', { f: function (l) { return verFecha(l.fecha) + (l._p ? ' ' + chip('por enviar', 'warn') : ''); }, v: function (l) { return verFecha(l.fecha); } }), C('Código', 'codigo'), C('Descripción', 'descripcion'), C('Proveedor', 'proveedor'),
    C('Programa', 'programa', { n: 1 }), C('Nec. temporal', 'nec', { n: 1 }), C('Adicional', 'adicional', { n: 1 }), C('Total', 'total', { n: 1 }), C('Stock', 'stock', { n: 1 }),
    C('Por armar (un)', 'porArmar', { n: 1, f: function (l) { return '<b>' + fn(l.porArmar) + '</b>'; } }),
    P(C('PH + puchos', 'porArmar', { f: function (l) { return ppHtml(l.porArmar, l.capacidad); } })), X(C('PH completos', 'ph', { n: 1 })), X(C('Puchos (un)', 'puchos', { n: 1 })),
    C('Pallets (con pucho)', 'pallets', { n: 1, f: function (l) { return l.capacidad > 0 ? fn(l.pallets) : chip('sin capacidad', 'bad'); } }),
    X(C('Armado (un)', 'armado', { n: 1 })), X(C('Pendiente (un)', 'pendiente', { n: 1 })), X(C('Entregado T1', 't1', { n: 1 })), X(C('Entregado T2', 't2', { n: 1 })),
    C('Estado', 'estado', { f: function (l) { return tagEstado(l.estado); }, v: function (l) { return ESTADOS[l.estado]; } }), C('Retiro / motivo', 'motivoCancelacion', { f: function (l) { return l.cancelada ? fn(l.cantidadCancelada) + ' un. · ' + esc(l.motivoCancelacion) : '—'; } })]);
}
PAG.programacion = function () {
  var e = ed('programacion'), cols = colsLinea();
  cols.push(P({ t: '', f: function (l) {
    var acciones = '<button class="btn ghost sm" data-a="traza" data-id="' + l.id + '">Traza</button>';
    if (e && !l.cancelada) acciones += ' <button class="btn ghost sm" data-a="elinea" data-id="' + l.id + '">Editar</button>';
    if (esAdmin() && !l.cancelada && l.pendiente > 0) acciones += ' <button class="btn red sm" data-a="cancela" data-id="' + l.id + '">Retirar</button>';
    if (e && !l.cancelada && l.armado <= 0 && l.entregado <= 0) acciones += ' <button class="btn red sm" data-a="blinea" data-id="' + l.id + '">✕</button>';
    if (l.cancelada) acciones += ' <span class="chip c-cancelada">Retirada</span>';
    return acciones;
  } }));
  return '<div class="bar">' + (e ? '<button class="btn" data-a="nlinea">' + ic('plus') + ' Nueva línea</button>' : '') + '</div>' + tabla(cols, S.v.lineas, { exp: 'prog', titulo: 'Programación de armado' });
};
function listaLineas(modo) {
  var L = S.v.lineas.filter(function (l) { return !l.cancelada ? l.porArmar > 0 : (modo === 'entregas' && l.saldo > 0); }), q = S.q.toLowerCase();
  if (S.estado !== 'todos') L = L.filter(function (l) { return l.estado === S.estado; });
  if (q) L = L.filter(function (l) { return (l.codigo + ' ' + l.descripcion + ' ' + l.proveedor).toLowerCase().indexOf(q) > -1; });
  if (!L.length) return '<div class="card empty">No hay líneas con ese filtro.</div>';
  return '<div class="lines">' + L.map(function (l) {
    var e = ed(modo), tp = l.planta !== S.planta && S.planta === 'TODAS' ? ' ' + chip(esc(l.planta), 'info') : '';
    var head = '<div class="h"><div><div class="cod">' + esc(l.codigo) + tp + '</div><div class="ds">' + esc(l.descripcion) + '</div></div>' + (l._p ? chip('por enviar', 'warn') : tagEstado(l.estado)) + '</div>';
    if (modo === 'armado') return '<div class="card ln ' + (l._p ? 'pendiente' : '') + '">' + head + '<div><small class="pu">Por armar</small><div class="big">' + ppHtml(l.porArmar, l.capacidad) + '</div><div class="ds">' + fn(l.porArmar) + ' unidades · ' + verFecha(l.fecha) + ' · ' + esc(l.proveedor) + '</div></div>' + barra(l.avance, l.avance < 100 ? 'y' : '') +
      '<div class="st"><div><small>Armado</small>' + ppHtml(l.armado, l.capacidad) + '</div><div><small>Pendiente</small>' + ppHtml(l.pendiente, l.capacidad) + '</div></div><div class="acts">' + (e && l.pendiente > 0 ? '<button class="btn" data-a="armar" data-id="' + l.id + '">' + ic('plus') + ' Registrar armado</button>' : '') + '<button class="btn ghost" data-a="traza" data-id="' + l.id + '">Historial</button></div></div>';
    return '<div class="card ln ' + (l._p ? 'pendiente' : '') + '">' + head + '<div><small class="pu">' + (l.cancelada ? 'Armado disponible para entregar' : 'Autorizado (por armar)') + '</small><div class="big">' + ppHtml(l.cancelada ? l.armado : l.porArmar, l.capacidad) + '</div><div class="ds">' + verFecha(l.fecha) + ' · ' + esc(l.proveedor) + '</div></div>' + barra((l.cancelada ? l.armado : l.porArmar) > 0 ? Math.min(100, Math.round(l.entregado / (l.cancelada ? l.armado : l.porArmar) * 100)) : 0) +
      '<div class="st"><div><small>1° turno</small>' + ppHtml(l.t1, l.capacidad) + '</div><div><small>2° turno</small>' + ppHtml(l.t2, l.capacidad) + '</div><div><small>Entregado</small>' + ppHtml(l.entregado, l.capacidad) + '</div><div><small>Saldo</small>' + ppHtml(l.saldo, l.capacidad) + '</div></div>' +
      '<div class="acts">' + (e && l.saldo > 0 ? '<button class="btn" data-a="entregar" data-id="' + l.id + '" data-t="1">+ 1° turno</button><button class="btn ghost" data-a="entregar" data-id="' + l.id + '" data-t="2">+ 2° turno</button>' : '') + '</div></div>';
  }).join('') + '</div>';
}
function barraFiltro() {
  var P = [['todos', 'Todos'], ['pendiente', 'Pendientes'], ['proceso', 'En proceso'], ['completo', 'Completos']];
  return '<div class="pills">' + P.map(function (p) { return '<button data-e="' + p[0] + '" class="' + (S.estado === p[0] ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div><div class="bar"><label class="f" style="flex:1"><span>Buscar</span><input id="q" placeholder="Código, descripción o proveedor" value="' + esc(S.q) + '"></label></div><div id="lista">';
}
PAG.armado = function () { return barraFiltro() + listaLineas('armado') + '</div>'; };
PAG.entregas = function () { return barraFiltro() + listaLineas('entregas') + '</div>'; };

PAG.almacen = function () {
  var e = ed('almacen'), tabs = [['stock', 'Stock'], ['movs', 'Movimientos'], ['lotes', 'Lotes'], ['mermas', 'Mermas'], ['conc', 'Conciliación']];
  var h = '<div class="pills">' + tabs.map(function (t) { return '<button data-s="' + t[0] + '" class="' + (S.sub === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>';
  if (e) h += '<div class="bar"><button class="btn" data-a="mov" data-t="entrada">' + ic('download') + ' Entrada</button><button class="btn ghost" data-a="mov" data-t="salida">' + ic('upload') + ' Salida</button><button class="btn ghost" data-a="nmerma">Merma</button><button class="btn ghost" data-a="nlote">' + ic('tag') + ' Lote</button>' + (esAdmin() ? '<button class="btn ghost" data-a="najuste">Ajuste (admin)</button>' : '') + '</div>';
  var P = function (c) { c.p = 1; return c; }, X = function (c) { c.x = 1; return c; }, tp = S.planta === 'TODAS' ? [C('Planta', 'planta')] : [];
  var ppc = function (t, key) { return [P(C(t, key, { n: 1, f: function (s) { return ppHtml(s[key], s.capacidad); } })), X(C(t + ' (un)', key, { n: 1 })), X(C(t + ' PH', key, { n: 1, v: function (s) { return split(s[key], s.capacidad).ph; } })), X(C(t + ' puchos', key, { n: 1, v: function (s) { return split(s[key], s.capacidad).pu; } }))]; };
  if (!S.v.stock) return h + '<div class="card empty">Sin acceso a almacén.</div>';
  if (S.sub === 'stock' || S.sub === 'conc') {
    var conc = S.sub === 'conc', filas = S.v.stock.filter(function (s) { return !conc || s.descuadre || s.stock > 0; });
    return h + tabla([].concat(tp, [C('Código', 'codigo'), C('Descripción', 'descripcion')], ppc('Stock general', 'stock'), ppc('En lotes', 'enLotes'), ppc('No asignado', 'noAsignado'), [C('Mínimo', 'minimo', { n: 1 }), C('Mermas', 'mermas', { n: 1 }),
      C('Estado', 'bajo', { f: function (s) { return s.descuadre ? chip('DESCUADRE', 'bad') : (s.bajo ? chip('Stock bajo', 'warn') : chip('OK', 'ok')); }, v: function (s) { return s.descuadre ? 'DESCUADRE' : (s.bajo ? 'Stock bajo' : 'OK'); } })]), filas, { exp: 'stock', titulo: conc ? 'Conciliación de inventario' : 'Stock de almacén' });
  }
  if (S.sub === 'lotes') return h + tabla([].concat(tp, [C('Código', 'codigo'), C('Lote', 'lote'), C('Ubicación', 'ubicacion', { f: function (l) { return l.ubicacion ? chip(esc(l.ubicacion), 'info') : '—'; } }), C('Ingreso', 'ingreso', { f: function (l) { return verFecha(l.ingreso); }, v: function (l) { return verFecha(l.ingreso); } }),
    C('Vence', 'vencimiento', { f: function (l) { var d = l.vencimiento; if (!d) return '—'; var dias = Math.round((new Date(d) - new Date(hoy())) / 86400000); return verFecha(d) + (dias < 0 ? ' ' + chip('vencido', 'bad') : (dias <= 30 ? ' ' + chip(dias + ' d', 'warn') : '')); }, v: function (l) { return verFecha(l.vencimiento); } }),
    C('Inicial', 'cant_inicial', { n: 1 }), P(C('Disponible', 'cant_disp', { n: 1, f: function (l) { return ppHtml(l.cant_disp, capDe(l.codigo)); } })), X(C('Disponible (un)', 'cant_disp', { n: 1 })), C('Consumida', 'cant_inicial', { n: 1, f: function (l) { return fn(l.cant_inicial - l.cant_disp); }, v: function (l) { return l.cant_inicial - l.cant_disp; } })]), S.v.lotes || [], { exp: 'lotes', titulo: 'Lotes' });
  var movs = (S.v.movimientos || []).filter(function (m) { return S.sub !== 'mermas' || m.tipo === 'merma'; });
  return h + tabla([].concat(tp, [C('Fecha', 'fecha', { f: function (m) { return verFecha(m.fecha) + ' ' + esc(m.hora.slice(0, 5)); }, v: function (m) { return verFecha(m.fecha) + ' ' + m.hora; } }), C('Código', 'codigo'),
    C('Tipo', 'tipo', { f: function (m) { return chip(esc(m.tipo), m.tipo === 'entrada' ? 'ok' : (m.tipo === 'merma' ? 'bad' : 'info')); } }), P(C('Cantidad', 'cantidad', { n: 1, f: function (m) { return ppHtml(Math.abs(m.cantidad), capDe(m.codigo)); } })), X(C('Cantidad (un)', 'cantidad', { n: 1 })),
    C('Saldo', 'saldo', { n: 1 }), C('Ubicación', 'ubicacion'), C('Motivo', 'motivo'), C('Referencia', 'referencia'), C('Usuario', 'usuario')]), movs, { exp: S.sub === 'mermas' ? 'mermas' : 'movs', titulo: S.sub === 'mermas' ? 'Mermas' : 'Movimientos de almacén' });
};
PAG.productos = function () {
  var e = ed('productos');
  return '<div class="bar">' + (e ? '<button class="btn" data-a="nprod">' + ic('plus') + ' Nuevo producto</button>' : '') + '</div>' + tabla([C('Código', 'codigo'), C('Descripción', 'descripcion'), C('Proveedor', 'proveedor', { f: function (p) { return esc(p.proveedor) || chip('falta', 'bad'); } }),
    C('Un. por pallet', 'capacidad', { n: 1, f: function (p) { return p.capacidad > 0 ? fn(p.capacidad) : chip('falta', 'bad'); } }), C('Stock mínimo', 'minimo', { n: 1 }), C('Adicional habitual', 'adicional', { n: 1 }), C('Activo', 'activo', { f: function (p) { return p.activo ? 'Sí' : 'No'; }, v: function (p) { return p.activo ? 'Sí' : 'No'; } }),
    { t: '', p: 1, f: function (p) { return e ? '<button class="btn ghost sm" data-a="eprod" data-id="' + p.id + '">Editar</button>' : ''; } }], S.v.productos, { exp: 'prod', titulo: 'Catálogo de productos' });
};
PAG.importar = function () {
  return '<div class="card"><div class="banner info">' + ic('file') + '<span>Se importará a <b>' + esc(nomPlanta(S.planta)) + '</b>. Detecta FECHA, CÓDIGO, PROGRAMA, NECESIDAD TEMPORAL, ADICIONAL ALMACÉN, STOCK ALMACÉN y ENTREGADO 1°/2° TURNO. Si la fecha solo está en la primera fila de cada día, se repite hacia abajo.</span></div>' +
    (!ed('programacion') ? '<div class="empty">Elige una planta para importar.</div>' : '<div class="bar"><label class="f" style="flex:1"><span>Archivo Excel o CSV</span><input type="file" id="xl" accept=".xlsx,.xls,.csv"></label><label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="crear"><span>Crear productos nuevos</span></label></div><div id="prev"></div>') + '</div>';
};
function agrupar(g) {
  var L = S.v.lineas;
  if (g === 'detalle') { var c = colsLinea().filter(function (x) { return !x.p; }); return { titulo: 'Detalle de programación', cols: c, filas: L }; }
  var key = { dia: 'fecha', proveedor: 'proveedor', producto: 'codigo', planta: 'planta' }[g], m = {};
  L.forEach(function (l) { var k = l[key] || '(sin dato)'; var o = m[k] = m[k] || { k: k, d: l.descripcion, cap: l.capacidad, lineas: 0, porArmar: 0, pallets: 0, armado: 0, pendiente: 0, t1: 0, t2: 0 }; o.lineas++; ['porArmar', 'pallets', 'armado', 'pendiente', 't1', 't2'].forEach(function (f) { o[f] += l[f]; }); });
  var filas = Object.keys(m).sort().map(function (k) { return m[k]; });
  var nombre = { dia: 'Fecha', proveedor: 'Proveedor', producto: 'Código', planta: 'Planta' }[g];
  var cols = [{ t: nombre, f: function (o) { return esc(g === 'dia' ? verFecha(o.k) : o.k); }, v: function (o) { return g === 'dia' ? verFecha(o.k) : o.k; } }];
  if (g === 'producto') cols.push({ t: 'Descripción', f: function (o) { return esc(o.d); }, v: function (o) { return o.d; } });
  cols = cols.concat([C('Líneas', 'lineas', { n: 1 }), C('Por armar (un)', 'porArmar', { n: 1 })]);
  if (g === 'producto') cols.push({ t: 'PH completos', n: 1, f: function (o) { return fn(split(o.porArmar, o.cap).ph); }, v: function (o) { return split(o.porArmar, o.cap).ph; } }, { t: 'Puchos (un)', n: 1, f: function (o) { return fn(split(o.porArmar, o.cap).pu); }, v: function (o) { return split(o.porArmar, o.cap).pu; } });
  cols = cols.concat([C('Pallets (con pucho)', 'pallets', { n: 1 }), C('Armado (un)', 'armado', { n: 1 }), C('Pendiente (un)', 'pendiente', { n: 1 }), C('Entregado T1', 't1', { n: 1 }), C('Entregado T2', 't2', { n: 1 })]);
  return { titulo: 'Resumen por ' + { dia: 'día', proveedor: 'proveedor', producto: 'producto', planta: 'planta' }[g], cols: cols, filas: filas };
}
PAG.reportes = function () {
  var opt = [['detalle', 'Detalle'], ['dia', 'Por día'], ['proveedor', 'Por proveedor'], ['producto', 'Por producto']]; if (S.planta === 'TODAS') opt.push(['planta', 'Por planta']);
  if (!opt.some(function (o) { return o[0] === S.rep; })) S.rep = 'detalle';
  var a = agrupar(S.rep);
  return '<div class="bar"><label class="f"><span>Agrupar</span><select id="rg">' + opt.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === S.rep ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
    '<button class="btn" data-a="excelfull">' + ic('download') + ' Excel completo (todas las hojas)</button></div>' + tabla(a.cols, a.filas, { exp: 'rep', titulo: a.titulo });
};
function excelCompleto() {
  try {
    var wb = XLSX.utils.book_new(), gs = ['dia', 'proveedor', 'producto'].concat(S.planta === 'TODAS' ? ['planta'] : []).concat(['detalle']);
    gs.forEach(function (g) {
      var a = agrupar(g), cols = a.cols.filter(function (c) { return !c.p; });
      var head = cols.map(function (c) { return tx(c.t); }), rows = a.filas.map(function (r) { return cols.map(function (c) { var v = c.v ? c.v(r) : tx(c.f(r)); return v === undefined || v === null ? '' : v; }); });
      XLSX.utils.book_append_sheet(wb, hojaXlsx(a.titulo, head, rows), a.titulo.slice(0, 28));
    });
    XLSX.writeFile(wb, nombreArchivo('reporte_completo') + '.xlsx');
  } catch (e) { toast('No se pudo generar el Excel: ' + e.message, 1); }
}
PAG.usuarios = function () {
  var h = '';
  if (ver('usuarios')) {
    h += '<div class="bar"><button class="btn" data-a="nuser">' + ic('plus') + ' Nuevo usuario</button></div>' + tabla([C('Usuario', 'usuario'), C('Nombre', 'nombre'), C('Rol', 'rol', { f: function (u) { return chip(esc(u.rol), 'info'); } }),
      C('Plantas', 'plantas', { f: function (u) { return (u.rol === 'administrador' || u.plantas === 'TODAS') ? chip('TODAS', 'ok') : u.plantas.split(',').map(function (p) { return chip(esc(p), 'gray'); }).join(' '); } }), C('Activo', 'activo', { f: function (u) { return u.activo ? 'Sí' : 'No'; } }),
      { t: '', p: 1, f: function (u) { return '<button class="btn ghost sm" data-a="euser" data-u="' + esc(u.usuario) + '">Editar</button>'; } }], S.v.usuarios || [], { exp: 'users', titulo: 'Usuarios' });
    if (S.planta !== 'TODAS') h += '<h3 style="margin:18px 0 10px">Ubicaciones · ' + esc(nomPlanta(S.planta)) + '</h3><div class="bar"><button class="btn" data-a="nubi">' + ic('pin') + ' Nueva ubicación</button></div>' +
      tabla([C('Código', 'codigo'), C('Nombre', 'nombre'), C('Activa', 'activo', { f: function (u) { return u.activo ? 'Sí' : 'No'; } }), { t: '', p: 1, f: function (u) { return '<button class="btn ghost sm" data-a="eubi" data-id="' + u.id + '">Editar</button>'; } }], (S.v.ubicaciones || []).filter(function (u) { return u.planta === S.planta; }), { vacio: 'Aún no hay ubicaciones en esta planta.' });
  }
  if (ver('auditoria')) h += '<h3 style="margin:18px 0 10px">Auditoría (últimos 300)</h3>' + tabla([C('Cuándo', 'cuando'), C('Usuario', 'usuario'), C('Rol', 'rol'), C('Planta', 'planta'), C('Acción', 'accion'), C('Detalle', 'detalle')], S.v.auditoria || [], { exp: 'audit', titulo: 'Auditoría' });
  return h || '<div class="card empty">Sin acceso.</div>';
};

/* ======================= FORMULARIOS ======================= */
function opcProd() { return S.v.productos.filter(function (p) { return p.activo; }).map(function (p) { return [p.codigo, p.codigo + ' · ' + p.descripcion.slice(0, 46)]; }); }
function opcUbi() { return [['', '— Sin ubicación —']].concat(S.v.ubicaciones.filter(function (u) { return u.planta === S.planta && u.activo; }).map(function (u) { return [u.codigo, u.codigo + (u.nombre !== u.codigo ? ' · ' + u.nombre : '')]; })); }
function stockDe(c) { return (S.v.stock || []).filter(function (s) { return s.planta === S.planta && s.codigo === c; })[0] || { stock: 0, enLotes: 0, noAsignado: 0 }; }
function prodDe(c) { return S.v.productos.filter(function (p) { return p.codigo === String(c).trim(); })[0]; }

function formLinea(l) {
  l = l || { fecha: hoy(), codigo: '', programa: '', nec: '', adicional: '', stock: '', nota: '' };
  var dl = '<datalist id="dlp">' + S.v.productos.filter(function (p) { return p.activo; }).map(function (p) { return '<option value="' + esc(p.codigo) + '">' + esc(p.descripcion) + '</option>'; }).join('') + '</datalist>';
  modal(l.id ? 'Editar línea' : 'Nueva línea de programación · ' + S.planta, dl + '<div class="r2">' + campo('Fecha', 'fecha', l.fecha, 'type="date" required') + campo('Código', 'codigo', l.codigo, 'list="dlp" required autocomplete="off" inputmode="numeric"') + '</div>' +
    '<div class="r2">' + campo('Programa', 'programa', l.programa, 'type="number" min="0" step="any" inputmode="decimal"') + campo('Necesidad temporal', 'nec', l.nec, 'type="number" min="0" step="any" inputmode="decimal"') + '</div>' +
    '<div class="r2">' + campo('Adicional almacén', 'adicional', l.adicional, 'type="number" min="0" step="any" inputmode="decimal"') + campo('Stock almacén', 'stock', l.stock, 'type="number" min="0" step="any" inputmode="decimal"') + '</div>' +
    '<div class="calc" id="calc">—</div>' + campo('Nota', 'nota', l.nota || ''), function (o) {
      if (l.id && String(l.id).indexOf('tmp_') !== 0) o.id = l.id;
      return reg('guardarLinea', o, 'Línea guardada.');
    });
  var f = $('mf');
  function calc() {
    var p = prodDe(f.codigo.value);
    if (!p) { $('calc').textContent = f.codigo.value ? '⚠ Ese código no está en el catálogo' : '—'; return; }
    var t = (+f.nec.value || 0) + (+f.adicional.value || 0), pa = Math.max(0, t - (+f.stock.value || 0));
    $('calc').innerHTML = esc(p.descripcion) + '<br>Total <b>' + fn(t) + '</b> · Por armar <b>' + fn(pa) + '</b> = ' + ppHtml(pa, p.capacidad) + ' · Pallets (con pucho): <b>' + (p.capacidad > 0 ? Math.ceil(pa / p.capacidad) : '— falta capacidad') + '</b>';
  }
  f.codigo.addEventListener('change', function () {
    var p = prodDe(f.codigo.value);
    if (p && !f.adicional.value && p.adicional) f.adicional.value = p.adicional;
    if (p && !f.stock.value && S.v.stock) f.stock.value = stockDe(p.codigo).stock;
    calc();
  });
  ['nec', 'adicional', 'stock', 'codigo'].forEach(function (n) { f[n].addEventListener('input', calc); });
  calc();
}
function formCancelar(id) {
  var l = S.v.lineas.filter(function (x) { return x.id === id; })[0];
  if (!l || l.cancelada) return;
  if (!esAdmin()) return toast('Solo el administrador puede retirar programaciones.', 1);
  if (!online()) return toast('Retirar una programación requiere conexión a internet.', 1);
  var porCancelar = Math.max(0, r2(l.porArmar - l.armado));
  if (!(porCancelar > 0)) return toast('No hay cantidad pendiente por armar.', 1);
  var resumen = '<div class="calc"><b>' + esc(l.codigo) + '</b> · ' + esc(l.descripcion) +
    '<br>Programado por armar: <b>' + fn(l.porArmar) + '</b> un.' +
    '<br>Armado que se conservará: <b>' + fn(l.armado) + '</b> un.' +
    '<br>Entregado que se conservará: <b>' + fn(l.entregado) + '</b> un.' +
    '<br>Cantidad pendiente que se retirará: <b>' + fn(porCancelar) + '</b> un.</div>' +
    '<div class="warn">La programación y su historial no se borrarán. Se bloquearán nuevos armados y entregas para esta línea.</div>' +
    campo('Motivo del retiro (obligatorio)', 'motivo', '', 'required minlength="5"');
  modal('Retirar programación · ' + l.codigo, resumen, function (o) {
    if (String(o.motivo || '').trim().length < 5) { toast('Escribe un motivo de al menos 5 caracteres.', 1); return false; }
    return reg('cancelarLinea', { id: l.id, motivo: o.motivo }, 'Programación retirada. El armado y las entregas existentes se conservaron.');
  });
}
function traza(id) {
  var l = S.v.lineas.filter(function (x) { return x.id === id; })[0] || {};
  if (String(id).indexOf('tmp_') === 0) return toast('Esta línea aún no se envió al servidor.');
  if (!online()) return toast('El historial necesita internet.', 1);
  llamar('trazabilidad', { planta: l.planta || S.planta, id: id }).then(function (r) {
    if (!r.ok) return toast(r.error, 1);
    var cap = l.capacidad || 0;
    modal('Historial · ' + (l.codigo || ''), '<b>Armados</b>' + (r.armado.length ? '<ul>' + r.armado.map(function (a) { return '<li>' + verFecha(a.fecha) + ' ' + esc(a.hora.slice(0, 5)) + ' · ' + ppTxt(a.cantidad, cap) + ' (' + fn(a.cantidad) + ' un.)' + (a.ubicacion ? ' · ' + esc(a.ubicacion) : '') + ' · ' + esc(a.usuario) + (a.observaciones ? ' · ' + esc(a.observaciones) : '') + '</li>'; }).join('') + '</ul>' : '<p class="pu">Sin armados.</p>') +
      '<b>Entregas</b>' + (r.entregas.length ? '<ul>' + r.entregas.map(function (e) { return '<li>' + verFecha(e.fecha) + ' ' + esc(e.hora.slice(0, 5)) + ' · T' + e.turno + ' · ' + ppTxt(e.cantidad, cap) + ' (' + fn(e.cantidad) + ' un.) · ' + esc(e.responsable) + (e.forzada ? ' · ⚠ excedida' : '') + '</li>'; }).join('') + '</ul>' : '<p class="pu">Sin entregas.</p>') +
      (r.cancelacion ? '<div class="warn"><b>Programación retirada</b><br>Cantidad cancelada: ' + fn(r.cancelacion.cantidad_cancelada) + ' un.<br>Motivo: ' + esc(r.cancelacion.motivo) + '<br>Por: ' + esc(r.cancelacion.usuario) + ' · ' + esc(r.cancelacion.cuando) + '</div>' : ''));
  });
}
function formArmado(id) {
  var l = S.v.lineas.filter(function (x) { return x.id === id; })[0]; if (!l) return;
  modal('Registrar armado · ' + l.codigo, '<div class="calc">' + esc(l.descripcion) + '<br>Pendiente: ' + ppHtml(l.pendiente, l.capacidad) + ' (' + fn(l.pendiente) + ' un.)</div>' + ppCampos() + sel('Ubicación del armado', 'ubicacion', opcUbi(), '') + campo('Observaciones', 'observaciones', ''), function (o) {
    var c = cantDe(o, l.capacidad);
    if (!(c > 0)) { toast('Escribe pallets o puchos.', 1); return false; }
    if (c > l.pendiente + 0.001) { toast('Excede el pendiente (' + fn(l.pendiente) + ' un.).', 1); return false; }
    return reg('armado', { lineaId: l.id, fecha: l.fecha, codigo: l.codigo, ph: o.ph, puchos: o.puchos, ubicacion: o.ubicacion, observaciones: o.observaciones }, 'Armado registrado.');
  });
  bindPP($('mf'), function () { return l.capacidad; }, function (c) { return 'Quedaría pendiente: ' + ppHtml(Math.max(0, l.pendiente - c), l.capacidad); });
}
function formEntrega(id, turno) {
  var l = S.v.lineas.filter(function (x) { return x.id === id; })[0]; if (!l) return;
  modal('Entrega ' + turno + '° turno · ' + l.codigo, '<div class="calc">' + esc(l.descripcion) + '<br>' + (l.cancelada ? 'Armado disponible para entregar ' : 'Autorizado ') + ppHtml(l.cancelada ? l.armado : l.porArmar, l.capacidad) + ' · saldo ' + ppHtml(l.saldo, l.capacidad) + '</div>' + ppCampos() + campo('Responsable de la entrega', 'responsable', S.user.nombre, 'required'), function (o) {
    var c = cantDe(o, l.capacidad);
    if (!(c > 0)) { toast('Escribe pallets o puchos.', 1); return false; }
    if (l.cancelada && c > l.saldo + 0.001) { toast('La programación está retirada. Solo puedes entregar lo ya armado que queda disponible (' + fn(l.saldo) + ' un.).', 1); return false; }
    var forzar = false;
    if (!l.cancelada && l.entregado + c > l.porArmar + 0.001) {
      if (!confirm('La entrega supera lo autorizado (saldo ' + fn(l.saldo) + ' un.). ¿Registrar de todos modos? Quedará marcada en la auditoría.')) return false;
      forzar = true;
    }
    return reg('entrega', { lineaId: l.id, fecha: l.fecha, codigo: l.codigo, turno: turno, ph: o.ph, puchos: o.puchos, responsable: o.responsable, forzar: forzar }, 'Entrega registrada.');
  });
  bindPP($('mf'), function () { return l.capacidad; }, function (c) { return 'Saldo después: ' + ppHtml(Math.max(0, l.saldo - c), l.capacidad); });
}
function formMov(tipo) {
  var ops = opcProd(); if (!ops.length) return toast('No hay productos activos.', 1);
  modal(tipo === 'entrada' ? 'Entrada de mercadería · ' + S.planta : 'Salida de almacén · ' + S.planta, sel('Producto', 'codigo', ops, '') + '<div class="calc" id="info"></div>' + ppCampos() + sel('Ubicación', 'ubicacion', opcUbi(), '') +
    (tipo === 'entrada' ? '<div class="warn">Si indicas un lote, la entrada crea el lote. Sin lote queda como stock no asignado.</div><div class="r2">' + campo('Lote (opcional)', 'lote', '') + campo('Vence (opcional)', 'vencimiento', '', 'type="date"') + '</div>' : '<div class="warn">La salida usa primero el stock no asignado y luego los lotes que vencen antes (FEFO).</div>') + campo('Motivo', 'motivo', '') + campo('Referencia', 'referencia', ''), function (o) {
      var p = prodDe(o.codigo), c = cantDe(o, p ? p.capacidad : 0);
      if (!(c > 0)) { toast('Escribe pallets o puchos.', 1); return false; }
      if (tipo === 'salida' && c > stockDe(o.codigo).stock + 0.001) { toast('Stock insuficiente: hay ' + fn(stockDe(o.codigo).stock) + ' un.', 1); return false; }
      return reg('mover', { codigo: o.codigo, tipo: tipo, ph: o.ph, puchos: o.puchos, ubicacion: o.ubicacion, lote: o.lote, vencimiento: o.vencimiento, motivo: o.motivo, referencia: o.referencia }, 'Movimiento registrado.');
    });
  var f = $('mf'), up = bindPP(f, function () { var p = prodDe(f.codigo.value); return p ? p.capacidad : 0; });
  f.codigo.addEventListener('change', function () { var s = stockDe(f.codigo.value); $('info').innerHTML = 'Stock: ' + ppHtml(s.stock, (prodDe(f.codigo.value) || {}).capacidad) + ' · no asignado ' + fn(s.noAsignado); up(); });
  f.codigo.dispatchEvent(new Event('change'));
}
function formMerma() {
  modal('Registrar merma · ' + S.planta, sel('Producto', 'codigo', opcProd(), '') + '<label class="f"><span>Lote (opcional)</span><select name="loteId" id="mlote"></select></label><div class="calc" id="mhelp"></div>' + ppCampos() + sel('Ubicación (si no hay lote)', 'ubicacion', opcUbi(), '') +
    sel('Motivo', 'motivo', S.v.motivosMerma, '') + campo('Observaciones', 'observaciones', ''), function (o) {
      var p = prodDe(o.codigo), c = cantDe(o, p ? p.capacidad : 0), s = stockDe(o.codigo);
      if (!(c > 0)) { toast('Escribe pallets o puchos.', 1); return false; }
      if (o.loteId) { var l = (S.v.lotes || []).filter(function (x) { return x.id === o.loteId; })[0]; if (l && c > l.cant_disp + 0.001) { toast('El lote solo tiene ' + fn(l.cant_disp) + ' disponibles.', 1); return false; } }
      else if (c > s.noAsignado + 0.001) { toast('Sin lote solo puedes mermar stock no asignado (' + fn(s.noAsignado) + ').', 1); return false; }
      return reg('merma', { codigo: o.codigo, loteId: o.loteId, ph: o.ph, puchos: o.puchos, ubicacion: o.ubicacion, motivo: o.motivo, observaciones: o.observaciones }, 'Merma registrada.');
    });
  var f = $('mf'), up = bindPP(f, function () { var p = prodDe(f.codigo.value); return p ? p.capacidad : 0; });
  function act() {
    var s = stockDe(f.codigo.value), ls = (S.v.lotes || []).filter(function (l) { return l.planta === S.planta && l.codigo === f.codigo.value && l.cant_disp > 0; });
    $('mlote').innerHTML = '<option value="">Sin lote (stock no asignado)</option>' + ls.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.lote) + ' · disp. ' + fn(l.cant_disp) + '</option>'; }).join('');
    $('mhelp').innerHTML = 'Stock general ' + fn(s.stock) + ' · no asignado <b>' + fn(s.noAsignado) + '</b>'; up();
  }
  f.codigo.addEventListener('change', act); act();
}
function formLote() {
  modal('Registrar lote · ' + S.planta, sel('Producto', 'codigo', opcProd(), '') + '<div class="calc" id="lhelp"></div>' + campo('Código de lote', 'lote', '', 'required') + campo('Vencimiento (opcional)', 'vencimiento', '', 'type="date"') + ppCampos() + sel('Ubicación', 'ubicacion', opcUbi(), '') +
    '<div class="warn">Esto <b>asigna</b> stock existente a un lote (no suma stock). Para mercadería nueva con lote usa «Entrada».</div>', function (o) {
      var p = prodDe(o.codigo), c = cantDe(o, p ? p.capacidad : 0);
      if (!(c > 0)) { toast('Escribe pallets o puchos.', 1); return false; }
      if (c > stockDe(o.codigo).noAsignado + 0.001) { toast('Solo hay ' + fn(stockDe(o.codigo).noAsignado) + ' un. sin asignar.', 1); return false; }
      return reg('asignarLote', { codigo: o.codigo, lote: o.lote, vencimiento: o.vencimiento, ph: o.ph, puchos: o.puchos, ubicacion: o.ubicacion }, 'Lote registrado.');
    });
  var f = $('mf'), up = bindPP(f, function () { var p = prodDe(f.codigo.value); return p ? p.capacidad : 0; });
  f.codigo.addEventListener('change', function () { $('lhelp').innerHTML = 'Stock no asignado disponible: <b>' + fn(stockDe(f.codigo.value).noAsignado) + '</b>'; up(); }); f.codigo.dispatchEvent(new Event('change'));
}
function formAjuste() {
  modal('Ajuste de inventario · ' + S.planta, '<div class="warn">Solo administrador. Requiere internet y queda en la auditoría.</div>' + sel('Producto', 'codigo', opcProd(), '') + sel('Ámbito', 'ambito', [['stock', 'Solo stock general'], ['lote', 'Solo un lote'], ['ambos', 'Stock y lote']], 'stock') +
    '<label class="f"><span>Lote (si aplica)</span><select name="loteId" id="alote"></select></label>' + campo('Ajuste en unidades (+ suma / − resta)', 'delta', '', 'type="number" step="any" required') + campo('Motivo (obligatorio)', 'motivo', '', 'required minlength="5"'),
    function (o) { return reg('ajuste', o, 'Ajuste registrado.'); });
  var f = $('mf');
  function act() { $('alote').innerHTML = '<option value="">—</option>' + (S.v.lotes || []).filter(function (l) { return l.planta === S.planta && l.codigo === f.codigo.value; }).map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.lote) + ' · disp. ' + fn(l.cant_disp) + '</option>'; }).join(''); }
  f.codigo.addEventListener('change', act); act();
}
function formProducto(p) {
  p = p || { codigo: '', descripcion: '', proveedor: '', capacidad: '', minimo: 0, adicional: 0, activo: true };
  modal(p.id ? 'Editar producto' : 'Nuevo producto', '<datalist id="dlv">' + S.v.proveedores.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>' + campo('Código', 'codigo', p.codigo, 'required') + campo('Descripción', 'descripcion', p.descripcion, 'required') + campo('Proveedor', 'proveedor', p.proveedor, 'list="dlv"') +
    '<div class="r2">' + campo('Unidades por pallet', 'capacidad_pallet', p.capacidad, 'type="number" min="1" step="any" required') + campo('Stock mínimo', 'stock_minimo', p.minimo, 'type="number" min="0" step="any"') + '</div>' + campo('Adicional habitual', 'adicional_habitual', p.adicional, 'type="number" min="0" step="any"') + sel('Estado', 'activo', [['true', 'Activo'], ['false', 'Inactivo']], String(p.activo)),
    function (o) { if (p.id) o.id = p.id; return reg('guardarProducto', o, 'Producto guardado.'); });
}
function formUsuario(u) {
  u = u || { usuario: '', nombre: '', rol: 'operario', activo: true, plantas: '' };
  var nuevo = !u.usuario, mias = u.plantas === 'TODAS' || u.rol === 'administrador' ? ['TODAS'] : String(u.plantas).split(',');
  var ck = '<div class="f"><span>Plantas que puede usar y ver</span></div><div class="ck">' + [{ codigo: 'TODAS', nombre: 'Todas' }].concat(S.plantas).map(function (p) { return '<label><input type="checkbox" name="plantas" value="' + p.codigo + '"' + (mias.indexOf(p.codigo) > -1 ? ' checked' : '') + '> ' + p.codigo + '</label>'; }).join('') + '</div>';
  modal(nuevo ? 'Nuevo usuario' : 'Editar usuario', campo('Usuario', 'usuario', u.usuario, nuevo ? 'required autocapitalize="none"' : 'readonly') + campo('Nombre', 'nombre', u.nombre, 'required') + sel('Rol', 'rol', ['administrador', 'supervisor', 'almacenero', 'operario'], u.rol) + ck +
    sel('Estado', 'activo', [['true', 'Activo'], ['false', 'Inactivo']], String(u.activo)) + campo(nuevo ? 'Clave temporal (mín. 8)' : 'Nueva clave (vacío = no cambiar)', 'clave', '', 'type="password" autocomplete="new-password"' + (nuevo ? ' required' : '')) + '<p class="pu">El administrador siempre ve todas las plantas.</p>',
    function (o) { o.plantas = [].concat(o.plantas || []); return reg('guardarUsuario', o, 'Usuario guardado.'); });
}
function formUbi(u) {
  u = u || { codigo: '', nombre: '', activo: true };
  modal(u.id ? 'Editar ubicación' : 'Nueva ubicación · ' + S.planta, campo('Código (ej. ERI, EDU, RACK-1)', 'codigo', u.codigo, 'required maxlength="12"') + campo('Nombre', 'nombre', u.nombre) + (u.id ? sel('Estado', 'activo', [['true', 'Activa'], ['false', 'Inactiva']], String(u.activo)) : ''),
    function (o) { if (u.id) o.id = u.id; return reg('guardarUbicacion', o, 'Ubicación guardada.'); });
}
function formClave() {
  modal('Cambiar mi clave', campo('Clave actual', 'actual', '', 'type="password" required') + campo('Nueva clave (mín. 8)', 'nueva', '', 'type="password" required'), function (o) { return reg('cambiarClave', o, 'Clave actualizada.'); });
}
function descOp(o) {
  var d = o.datos, n = { armado: 'Armado', entrega: 'Entrega T' + d.turno, mover: d.tipo === 'salida' ? 'Salida' : 'Entrada', merma: 'Merma', asignarLote: 'Lote', guardarLinea: 'Programación' }[o.accion] || o.accion;
  var q = (d.ph || d.puchos) ? ((d.ph || 0) + ' PH + ' + (d.puchos || 0)) : (d.cantidad || '');
  return '<b>' + esc(n) + '</b> · ' + esc(d.planta) + ' · ' + esc(d.codigo || '') + (q !== '' ? ' · ' + esc(q) : '') + '<br><small class="pu">' + esc(o.ts) + (o.estado === 'error' ? ' · ❌ ' + esc(o.error) : ' · esperando envío') + '</small>';
}
function modalPend() {
  var L = S.outbox;
  modal('Registros pendientes de enviar', L.length ? '<div style="display:grid;gap:8px;margin-bottom:10px">' + L.map(function (o) { return '<div class="card" style="padding:10px;display:flex;justify-content:space-between;gap:10px;align-items:center"><div>' + descOp(o) + '</div><button type="button" class="btn ghost sm" data-a="desc" data-id="' + o.opId + '">Descartar</button></div>'; }).join('') + '</div>' + (online() ? '<button type="button" class="btn" data-a="sincro">' + ic('refresh') + ' Enviar ahora</button>' : '<div class="warn">Sin conexión: se enviarán solos cuando vuelva internet.</div>') : '<p class="pu">No hay nada pendiente. Todo está sincronizado. ✅</p>');
}
function modalMas() {
  var ocultos = PAGINAS.filter(function (p) { return ver(p.id); });
  modal('Menú', '<div style="display:grid;gap:8px">' + ocultos.map(function (p) { return '<button type="button" class="btn ghost" data-p="' + p.id + '" style="justify-content:flex-start">' + ic(p.i) + p.t + '</button>'; }).join('') +
    '<button type="button" class="btn ghost" data-a="clave" style="justify-content:flex-start">' + ic('users') + ' Cambiar mi clave</button><button type="button" class="btn ghost" data-a="tema" style="justify-content:flex-start">' + ic('moon') + ' Modo claro / oscuro</button>' +
    '<button type="button" class="btn ghost" data-a="instalar" style="justify-content:flex-start">' + ic('install') + ' Instalar app</button><button type="button" class="btn red" data-a="salir" style="justify-content:flex-start">' + ic('logout') + ' Salir</button></div>');
}
function modalInstalar() {
  if (S.instalar) { S.instalar.prompt(); S.instalar = null; return; }
  modal('Instalar la app', '<p>Así queda como una app más en tu equipo, con su ícono, y abre aunque no haya internet:</p><ul><li><b>Android (Chrome):</b> menú ⋮ ▸ <i>Instalar app</i> o <i>Agregar a pantalla principal</i>.</li><li><b>iPhone / iPad (Safari):</b> botón Compartir ▸ <i>Agregar a inicio</i>.</li><li><b>Computadora (Chrome o Edge):</b> ícono de instalar al final de la barra de direcciones.</li></ul><p class="pu">Debes abrir primero el enlace con internet al menos una vez.</p>');
}

/* ======================= IMPORTAR EXCEL ======================= */
function normH(s) { return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, ''); }
function aFecha(v) {
  if (v instanceof Date) return iso(v);
  if (typeof v === 'number') { var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  var m = String(v || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[2]) + '-' + pad(m[1]);
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : '';
}
function aNum(v) { if (typeof v === 'number') return v; var n = parseFloat(String(v || '').replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function leerExcel(buf) {
  var wb = XLSX.read(buf, { type: 'array', cellDates: true }), ws = wb.Sheets[wb.SheetNames[0]], M = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  var hi = -1; for (var i = 0; i < Math.min(M.length, 15); i++) { if (M[i].some(function (c) { return normH(c) === 'CODIGO'; })) { hi = i; break; } }
  if (hi < 0) throw new Error('No encontré una columna CODIGO en las primeras filas.');
  var H = M[hi].map(normH), col = function () { for (var k = 0; k < arguments.length; k++) { var ix = H.indexOf(arguments[k]); if (ix > -1) return ix; } return -1; };
  var c = { f: col('FECHA'), cod: col('CODIGO'), des: col('DESCRIPCION'), pro: col('PROGRAMA'), nec: col('NECESIDADTEMPORAL'), adi: col('ADICIONALALMACEN', 'ADICIONAL'), sto: col('STOCKALMACEN', 'STOCK'), t1: col('ENTREGADO1TURNO', 'ENTREGADO1ERTURNO', 'ENTREGADO1'), t2: col('ENTREGADO2TURNO', 'ENTREGADO2DOTURNO', 'ENTREGADO2') };
  if (c.f < 0 && H[0] === '') c.f = 0;
  var g = function (r, k) { return k > -1 ? r[k] : ''; }, fecha = '', filas = [];
  for (var j = hi + 1; j < M.length; j++) {
    var r = M[j], cod = String(g(r, c.cod)).trim(); if (!cod) continue;
    var ff = aFecha(g(r, c.f)); if (ff) fecha = ff;
    filas.push({ n: j + 1, fecha: fecha, codigo: cod, descripcion: g(r, c.des), programa: aNum(g(r, c.pro)), nec: aNum(g(r, c.nec)), adicional: aNum(g(r, c.adi)), stock: aNum(g(r, c.sto)), t1: aNum(g(r, c.t1)), t2: aNum(g(r, c.t2)) });
  }
  return filas;
}
function bindImportar() {
  var inp = $('xl'); if (!inp) return;
  inp.onchange = function (e) {
    var file = e.target.files[0]; if (!file) return;
    var rd = new FileReader();
    rd.onload = function (ev) {
      try {
        var filas = leerExcel(ev.target.result); S.imp = filas;
        var con = {}; S.v.productos.forEach(function (p) { con[p.codigo] = 1; });
        $('prev').innerHTML = '<p><b>' + filas.length + '</b> filas detectadas · ' + filas.filter(function (x) { return !con[x.codigo]; }).length + ' con código que no está en el catálogo.</p>' +
          tabla([C('Fila', 'n'), C('Fecha', 'fecha', { f: function (x) { return verFecha(x.fecha) || chip('sin fecha', 'bad'); } }), C('Código', 'codigo', { f: function (x) { return esc(x.codigo) + (con[x.codigo] ? '' : ' ' + chip('nuevo', 'warn')); } }), C('Programa', 'programa', { n: 1 }), C('Nec. temporal', 'nec', { n: 1 }), C('Adicional', 'adicional', { n: 1 }), C('Stock', 'stock', { n: 1 }), C('T1', 't1', { n: 1 }), C('T2', 't2', { n: 1 })], filas.slice(0, 300)) +
          '<div class="acts2" style="margin-top:12px"><button class="btn" data-a="confimp">Importar ' + filas.length + ' filas</button></div>';
      } catch (err) { toast(err.message, 1); }
    };
    rd.readAsArrayBuffer(file);
  };
}
function confirmarImport() {
  if (!S.imp || !S.imp.length) return;
  ejecutar('importar', { filas: S.imp, crearProductos: $('crear').checked }).then(function (r) {
    if (!r.ok) return toast(r.error, 1);
    var i = r.informe; S.imp = null;
    modal('Resultado de la importación', '<p>✅ Importadas: <b>' + i.importadas + '</b><br>↩ Ya existían (omitidas): <b>' + i.omitidas + '</b><br>🆕 Productos creados: <b>' + i.creados + '</b><br>⚠ Con error: <b>' + i.errores.length + '</b></p>' + (i.errores.length ? '<div class="warn">' + i.errores.slice(0, 30).map(esc).join('<br>') + '</div>' : ''));
    cargar();
  });
}

/* ======================= EVENTOS ======================= */
function refrescar() {
  if (!online()) return toast('Sin conexión: no se puede actualizar ahora.', 1);
  sincronizar().then(function () { return cargar('Datos actualizados'); });
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-a],[data-p],[data-s],[data-e]'); if (!b) return;
  if (b.dataset.p) { S.pag = b.dataset.p; cerrar(); render(); return; }
  if (b.dataset.s) { S.sub = b.dataset.s; render(); return; }
  if (b.dataset.e) { S.estado = b.dataset.e; render(); return; }
  var id = b.dataset.id, lin = function () { return S.v.lineas.filter(function (l) { return l.id === id; })[0]; };
  var acc = {
    salir: salir, clave: formClave, refrescar: refrescar, mas: modalMas, instalar: modalInstalar, pend: modalPend, exp: function () { exportar(id, b.dataset.t); }, excelfull: excelCompleto,
    tema: function () { S.tema = document.documentElement.getAttribute('data-t') === 'dark' ? 'light' : 'dark'; LS.set('tema', S.tema); applyTema(); },
    filtrar: function () { S.f = { desde: $('fd').value || S.f.desde, hasta: $('fh').value || S.f.hasta }; cargar(); },
    nlinea: function () { formLinea(); },
    elinea: function () { var l = lin(); if (String(l.id).indexOf('tmp_') === 0) return toast('Esa línea aún no se envió. Espera a sincronizar para editarla.'); formLinea({ id: l.id, fecha: l.fecha, codigo: l.codigo, programa: l.programa, nec: l.nec, adicional: l.adicional, stock: l.stock, nota: l.nota }); },
    blinea: function () { if (confirm('¿Eliminar esta línea de programación?')) reg('eliminarLinea', { id: id }, 'Línea eliminada.'); },
    cancela: function () { formCancelar(id); }, traza: function () { traza(id); },
    armar: function () { formArmado(id); }, entregar: function () { formEntrega(id, Number(b.dataset.t)); },
    mov: function () { formMov(b.dataset.t); }, nmerma: formMerma, nlote: formLote, najuste: formAjuste,
    nprod: function () { formProducto(); }, eprod: function () { formProducto(S.v.productos.filter(function (p) { return p.id === id; })[0]); },
    nuser: function () { formUsuario(); }, euser: function () { formUsuario(S.v.usuarios.filter(function (u) { return u.usuario === b.dataset.u; })[0]); },
    nubi: function () { formUbi(); }, eubi: function () { formUbi(S.v.ubicaciones.filter(function (u) { return u.id === id; })[0]); },
    confimp: confirmarImport,
    sincro: function () { sincronizar().then(function () { cargar('Sincronizado'); modalPend(); }); },
    desc: function () { if (confirm('¿Descartar este registro? No se enviará al servidor.')) { S.outbox = S.outbox.filter(function (o) { return o.opId !== id; }); guardarOutbox(); derivar(); render(); modalPend(); } }
  }[b.dataset.a];
  if (acc) acc();
});
document.addEventListener('input', function (e) { if (e.target.id === 'q') { S.q = e.target.value; var l = $('lista'); if (l) l.innerHTML = listaLineas(S.pag); } });
document.addEventListener('change', function (e) {
  if (e.target.id === 'rg') { S.rep = e.target.value; render(); }
  if (e.target.id === 'planta') {
    S.planta = e.target.value; LS.set('planta', S.planta); S.d = null; S.v = null;
    var c = LS.get('cache_' + S.planta, null); if (c) { S.d = c.d; S.cacheTs = c.ts; S.offlineData = false; }
    derivar(); render(); cargar();
  }
});
window.addEventListener('online', function () { actualizarChip(); render(); sincronizar().then(function () { return cargar('Conexión recuperada · datos actualizados'); }); });
window.addEventListener('offline', function () { actualizarChip(); render(); });
setInterval(function () { if (S.token && online() && pendientes().length && !S.sync) sincronizar().then(function () { cargar(); }); }, 45000);
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.instalar = e; });
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
window.__SAC = { S: S, llamar: llamar, ejecutar: ejecutar, sincronizar: sincronizar, cargar: cargar, render: render, exportar: exportar, split: split, cantDe: cantDe, EXP: EXP, agrupar: agrupar, leerExcel: leerExcel, excelCompleto: excelCompleto };

/* ======================= ARRANQUE ======================= */
applyTema();
if (S.token && S.user && S.plantas.length) {
  if (S.planta !== 'TODAS' && !S.plantas.some(function (p) { return p.codigo === S.planta; })) S.planta = S.plantas[0].codigo;
  var c0 = LS.get('cache_' + S.planta, null);
  if (c0) { S.d = c0.d; S.cacheTs = c0.ts; S.f = c0.f || S.f; S.offlineData = !online(); derivar(); }
  render();
  if (online()) sincronizar().then(function () { return cargar(); });
} else vistaLogin('');
})();
