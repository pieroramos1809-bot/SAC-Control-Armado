/**
 * SAC · Control de Armado de Cajas — SERVIDOR (Apps Script + Google Sheets)  v2
 * Es una API JSON: la pantalla es una app instalable (PWA) que se aloja aparte.
 * Multi-planta · pallets + puchos · ubicaciones · operaciones idempotentes (offline).
 */

/* ======================= CONFIGURACIÓN ======================= */
const TZ = 'America/Lima';
const VERSION = '2.0';
const SESION_DIAS = 7;
const PLANTAS = [
  { codigo: 'PDC', nombre: 'PLANTA DON CARLOS' },
  { codigo: 'PY', nombre: 'PLANTA YANCAY' },
  { codigo: 'PCCH', nombre: 'PLANTA CASA CHICA' },
  { codigo: 'PLM', nombre: 'PLANTA LOS MOLINOS' }
];
const CODIGOS_PLANTA = PLANTAS.map(p => p.codigo);
const MOTIVOS_MERMA = ['Producto dañado', 'Humedad o mojado', 'Rotura de embalaje', 'Vencimiento', 'Error de armado', 'Manipulación en almacén', 'Otro'];
const ROLES = ['administrador', 'supervisor', 'almacenero', 'operario'];

const TABLAS = {
  USUARIOS:     ['usuario', 'nombre', 'rol', 'activo', 'salt', 'hash', 'plantas'],
  PRODUCTOS:    ['id', 'codigo', 'descripcion', 'proveedor', 'capacidad_pallet', 'stock_minimo', 'adicional_habitual', 'activo'],
  PROVEEDORES:  ['id', 'nombre', 'activo'],
  UBICACIONES:  ['id', 'planta', 'codigo', 'nombre', 'activo'],
  PROGRAMACION: ['id', 'planta', 'fecha', 'codigo', 'programa', 'nec_temporal', 'adicional', 'total', 'stock_almacen', 'por_armar', 'pallets', 'entregado_t1', 'entregado_t2', 'nota', 'actualizado'],
  ARMADO:       ['id', 'planta', 'linea_id', 'fecha', 'hora', 'cantidad', 'pallets', 'puchos', 'ubicacion', 'observaciones', 'usuario', 'creado'],
  ENTREGAS:     ['id', 'planta', 'linea_id', 'fecha', 'hora', 'turno', 'cantidad', 'responsable', 'usuario', 'forzada'],
  INVENTARIO:   ['planta', 'codigo', 'stock'],
  MOVIMIENTOS:  ['id', 'planta', 'fecha', 'hora', 'codigo', 'tipo', 'cantidad', 'saldo', 'motivo', 'referencia', 'lote_id', 'ubicacion', 'usuario'],
  LOTES:        ['id', 'planta', 'codigo', 'lote', 'ingreso', 'vencimiento', 'cant_inicial', 'cant_disp', 'ubicacion', 'usuario'],
  AUDITORIA:    ['cuando', 'usuario', 'rol', 'planta', 'accion', 'detalle'],
  OPS:          ['op_id', 'cuando', 'resultado'],
  CANCELACIONES: ['id', 'linea_id', 'planta', 'fecha', 'codigo', 'cantidad_cancelada', 'motivo', 'usuario', 'cuando'],
  SESIONES:     ['th', 'usuario', 'expira'],
  PERSONAL:     ['id', 'planta', 'fecha', 'proveedor', 'maquina', 'cantidad', 'usuario', 'actualizado'],
  PERMISOS:     ['usuario', 'modulos']
};
const PERSONAL_MIN = 2, PERSONAL_MAX = 3;   // trabajadores del proveedor por máquina
const NUM = { cantidad_cancelada: 1, capacidad_pallet: 1, stock_minimo: 1, adicional_habitual: 1, programa: 1, nec_temporal: 1, adicional: 1, total: 1, stock_almacen: 1, por_armar: 1, pallets: 1, puchos: 1, entregado_t1: 1, entregado_t2: 1, cantidad: 1, saldo: 1, cant_inicial: 1, cant_disp: 1, stock: 1, turno: 1 };
const BOOL = { activo: 1, forzada: 1 };
const FECHAS = { fecha: 1, ingreso: 1, vencimiento: 1 };
const COLS_TEXTO = ['id', 'codigo', 'linea_id', 'lote_id', 'lote', 'fecha', 'hora', 'ingreso', 'vencimiento', 'cuando', 'creado', 'actualizado', 'usuario', 'salt', 'hash', 'op_id', 'th', 'expira', 'plantas', 'planta', 'modulos', 'maquina', 'proveedor'];

const MODULOS = {
  dashboard: ['administrador', 'supervisor', 'almacenero', 'operario'],
  programacion: ['administrador', 'supervisor'],
  productos: ['administrador', 'supervisor'],
  almacen: ['administrador', 'supervisor', 'almacenero'],
  armado: ['administrador', 'supervisor', 'operario'],
  entregas: ['administrador', 'supervisor', 'almacenero'],
  reportes: ['administrador', 'supervisor', 'almacenero'],
  importar: ['administrador', 'supervisor'],
  usuarios: ['administrador'],
  auditoria: ['administrador', 'supervisor'],
  personal: ['administrador', 'supervisor', 'operario']
};
const MOD_ELEGIBLES = Object.keys(MODULOS).filter(m => m !== 'usuarios');   // los que el administrador puede asignar por usuario
const EDICION = {
  programacion: ['administrador', 'supervisor'],
  productos: ['administrador', 'supervisor'],
  almacen: ['administrador', 'supervisor', 'almacenero'],
  armado: ['administrador', 'supervisor', 'operario'],
  entregas: ['administrador', 'supervisor', 'almacenero'],
  usuarios: ['administrador'],
  personal: ['administrador']
};

/* ======================= ENTRADA HTTP ======================= */
function doGet() { return salida_({ ok: true, app: 'SAC', version: VERSION, mensaje: 'API activa. Usa la app para ingresar.' }); }
function doPost(e) {
  let out;
  try {
    const b = JSON.parse(e.postData.contents);
    out = api(b.token, b.accion, b.datos);
  } catch (err) { out = { ok: false, error: 'Solicitud no válida.' }; }
  return salida_(out);
}
function salida_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

let CTX = { planta: '', fecha: null, hora: null };

function api(token, accion, d) {
  CTX = { planta: '', fecha: null, hora: null };
  try {
    d = d || {};
    if (accion === 'ping') return { ok: true, version: VERSION, ahora: ahora_() };
    if (accion === 'login') return login_(d);
    const ses = sesion_(token);
    if (!ses) return { ok: false, sesion: true, error: 'Tu sesión venció. Ingresa de nuevo.' };
    const a = ACCIONES[accion];
    if (!a) return { ok: false, error: 'Acción desconocida.' };
    if (a.mod && !puedeS_(ses, a.mod, a.edit)) return { ok: false, error: 'No tienes permiso para esta acción.' };
    if (a.admin && ses.rol !== 'administrador') return { ok: false, error: 'Solo el administrador puede hacer esto.' };
    if (a.planta) {
      if (CODIGOS_PLANTA.indexOf(d.planta) < 0) return err_('Planta no válida.');
      if (ses.plantas.indexOf(d.planta) < 0) return err_('No tienes acceso a la planta ' + d.planta + '.');
      CTX.planta = d.planta;
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d.ts || '')) { CTX.fecha = d.ts.slice(0, 10); CTX.hora = d.ts.slice(11); }
    if (!a.escribe) return a.fn(ses, d, token);
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      if (d.opId) { const previo = opPrevio_(d.opId); if (previo) return Object.assign(JSON.parse(previo), { repetida: true }); }
      const res = a.fn(ses, d, token);
      if (res && res.ok && d.opId) guardarOp_(d.opId, res);
      return res;
    } finally { lock.releaseLock(); }
  } catch (e) {
    return { ok: false, error: 'Error: ' + (e && e.message ? e.message : e) };
  }
}

const ACCIONES = {
  datos:            { fn: datos_ },
  trazabilidad:     { fn: trazabilidad_, planta: true },
  logout:           { fn: logout_ },
  cambiarClave:     { fn: cambiarClave_, escribe: true },
  guardarLinea:     { fn: guardarLinea_, mod: 'programacion', edit: true, escribe: true, planta: true },
  eliminarLinea:    { fn: eliminarLinea_, mod: 'programacion', edit: true, escribe: true, planta: true },
  cancelarLinea:    { fn: cancelarLinea_, mod: 'programacion', edit: true, admin: true, escribe: true, planta: true },
  importar:         { fn: importar_, mod: 'importar', escribe: true, planta: true },
  guardarProducto:  { fn: guardarProducto_, mod: 'productos', edit: true, escribe: true },
  guardarUbicacion: { fn: guardarUbicacion_, mod: 'productos', edit: true, escribe: true, planta: true },
  armado:           { fn: armado_, mod: 'armado', edit: true, escribe: true, planta: true },
  entrega:          { fn: entrega_, mod: 'entregas', edit: true, escribe: true, planta: true },
  mover:            { fn: mover_, mod: 'almacen', edit: true, escribe: true, planta: true },
  merma:            { fn: merma_, mod: 'almacen', edit: true, escribe: true, planta: true },
  asignarLote:      { fn: asignarLote_, mod: 'almacen', edit: true, escribe: true, planta: true },
  ajuste:           { fn: ajuste_, mod: 'almacen', edit: true, admin: true, escribe: true, planta: true },
  guardarUsuario:   { fn: guardarUsuario_, mod: 'usuarios', edit: true, escribe: true },
  guardarPersonal:  { fn: guardarPersonal_, mod: 'personal', edit: true, admin: true, escribe: true, planta: true },
  eliminarPersonal: { fn: eliminarPersonal_, mod: 'personal', edit: true, admin: true, escribe: true, planta: true }
};

/* ======================= IDEMPOTENCIA (operaciones hechas sin internet) ======================= */
function opPrevio_(id) {
  const s = hoja_('OPS'), last = s.getLastRow();
  if (last < 2) return null;
  const desde = Math.max(2, last - 2999);
  const v = s.getRange(desde, 1, last - desde + 1, 3).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]) === String(id)) return v[i][2];
  return null;
}
function guardarOp_(id, res) { hoja_('OPS').appendRow([String(id), ahora_(), JSON.stringify(res)]); }

/* ======================= INSTALACIÓN (solo desde el menú de la hoja) ======================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📦 SAC')
    .addItem('1) Instalar sistema', 'instalar')
    .addItem('Restablecer clave del administrador', 'restablecerAdmin')
    .addItem('Mantenimiento: limpiar sesiones y operaciones viejas', 'mantenimiento')
    .addToUi();
}
function soloMenu_() { try { SpreadsheetApp.getUi(); } catch (e) { throw new Error('Acción solo disponible desde el menú de la hoja.'); } }
function instalar() {
  soloMenu_();
  const ss = SpreadsheetApp.getActiveSpreadsheet(), ui = SpreadsheetApp.getUi();
  Object.keys(TABLAS).forEach(n => {
    const cols = TABLAS[n], s = ss.getSheetByName(n);
    if (s && s.getLastRow() > 0) {
      const enc = s.getRange(1, 1, 1, cols.length).getValues()[0].join('|');
      if (enc !== cols.join('|')) throw new Error('La hoja ' + n + ' tiene otra estructura (¿versión anterior?). Instala en una hoja de cálculo nueva.');
    }
  });
  Object.keys(TABLAS).forEach(n => {
    const cols = TABLAS[n], s = ss.getSheetByName(n) || ss.insertSheet(n);
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
      s.setFrozenRows(1);
    }
    cols.forEach((c, i) => { if (COLS_TEXTO.indexOf(c) > -1) s.getRange(2, i + 1, s.getMaxRows() - 1, 1).setNumberFormat('@'); });
  });
  if (leer_('USUARIOS').length) { ui.alert('El sistema ya estaba instalado. No se cambió nada.'); return; }
  SEMILLA_PRODUCTOS.forEach(p => {
    guardarProveedorSiNuevo_(p.proveedor);
    append_('PRODUCTOS', { id: id_('prd'), codigo: p.codigo, descripcion: p.descripcion, proveedor: p.proveedor, capacidad_pallet: p.capacidad, stock_minimo: 0, adicional_habitual: p.adicional, activo: true });
  });
  PLANTAS.forEach(pl => ['ERI', 'EDU'].forEach(u => append_('UBICACIONES', { id: id_('ubi'), planta: pl.codigo, codigo: u, nombre: u, activo: true })));
  const clave = claveAleatoria_();
  crearUsuario_('admin', 'Administrador', 'administrador', clave, 'TODAS');
  const h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (h1 && h1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h1);
  ui.alert('✅ Sistema instalado', 'Usuario: admin\nClave temporal: ' + clave + '\n\nGuárdala ahora (no se vuelve a mostrar) y cámbiala al entrar.\nSiguiente paso: Implementar ▸ Nueva implementación ▸ Aplicación web.', ui.ButtonSet.OK);
}
function restablecerAdmin() {
  soloMenu_();
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('¿Generar una nueva clave para "admin"?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const u = leer_('USUARIOS').filter(x => x.usuario === 'admin')[0];
  if (!u) { ui.alert('No existe el usuario admin.'); return; }
  const clave = claveAleatoria_();
  u.salt = Utilities.getUuid(); u.hash = hash_(u.salt, clave); u.activo = true; u.rol = 'administrador'; u.plantas = 'TODAS';
  actualizar_('USUARIOS', u._fila, u);
  ui.alert('Nueva clave de admin: ' + clave);
}
function mantenimiento() {
  soloMenu_();
  const ahora = ahora_();
  const s = hoja_('SESIONES');
  for (let r = s.getLastRow(); r >= 2; r--) { if (String(s.getRange(r, 3).getValue()) < ahora) s.deleteRow(r); }
  const o = hoja_('OPS'), n = o.getLastRow();
  if (n > 3000) o.deleteRows(2, n - 1500);
  SpreadsheetApp.getUi().alert('Listo.');
}
function claveAleatoria_() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = ''; for (let i = 0; i < 10; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}

/* ======================= ACCESO A HOJAS ======================= */
function hoja_(n) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n);
  if (!s) throw new Error('Falta la hoja ' + n + '. Ejecuta 📦 SAC ▸ Instalar sistema.');
  return s;
}
function fmt_(d, f) { return Utilities.formatDate(d, TZ, f); }
function hoy_() { return fmt_(new Date(), 'yyyy-MM-dd'); }
function hora_() { return fmt_(new Date(), 'HH:mm:ss'); }
function ahora_() { return fmt_(new Date(), 'yyyy-MM-dd HH:mm:ss'); }
function fechaOp_() { return CTX.fecha || hoy_(); }
function horaOp_() { return CTX.hora || hora_(); }
function id_(p) { return p + '_' + Utilities.getUuid().slice(0, 8); }
function r2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function err_(m) { return { ok: false, error: m }; }

function norm_(c, v) {
  if (NUM[c]) return Number(v) || 0;
  if (BOOL[c]) return v === true || String(v).toUpperCase() === 'TRUE';
  if (v instanceof Date) return FECHAS[c] ? fmt_(v, 'yyyy-MM-dd') : (c === 'hora' ? fmt_(v, 'HH:mm:ss') : fmt_(v, 'yyyy-MM-dd HH:mm:ss'));
  return v === null || v === undefined ? '' : String(v).trim();
}
function leer_(n) {
  const s = hoja_(n), cols = TABLAS[n], last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, cols.length).getValues().map((r, i) => {
    const o = { _fila: i + 2 };
    cols.forEach((c, j) => { o[c] = norm_(c, r[j]); });
    return o;
  }).filter(o => cols.some(c => o[c] !== '' && o[c] !== 0 && o[c] !== false));
}
function leerP_(n) { return leer_(n).filter(o => o.planta === CTX.planta); }
function fila_(n, o) { return TABLAS[n].map(c => (o[c] === undefined || o[c] === null) ? '' : o[c]); }
function append_(n, o) { hoja_(n).appendRow(fila_(n, o)); }
function actualizar_(n, fila, o) { hoja_(n).getRange(fila, 1, 1, TABLAS[n].length).setValues([fila_(n, o)]); }
function borrar_(n, fila) { hoja_(n).deleteRow(fila); }
function mapa_(arr, k) { const m = {}; arr.forEach(x => { m[x[k]] = x; }); return m; }
function auditar_(ses, accion, detalle) { append_('AUDITORIA', { cuando: ahora_(), usuario: ses.nombre, rol: ses.rol, planta: CTX.planta, accion: accion, detalle: detalle }); }

/* ======================= USUARIOS, PLANTAS Y SESIÓN ======================= */
function hash_(salt, clave) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + clave, Utilities.Charset.UTF_8);
  return b.map(x => ('0' + (x < 0 ? x + 256 : x).toString(16)).slice(-2)).join('');
}
function crearUsuario_(usuario, nombre, rol, clave, plantas) {
  const salt = Utilities.getUuid();
  append_('USUARIOS', { usuario: usuario, nombre: nombre, rol: rol, activo: true, salt: salt, hash: hash_(salt, clave), plantas: plantas });
}
function plantasDe_(u) {
  if (u.rol === 'administrador' || u.plantas === 'TODAS') return CODIGOS_PLANTA.slice();
  return u.plantas.split(',').map(x => x.trim()).filter(x => CODIGOS_PLANTA.indexOf(x) > -1);
}
function mapaMods_() {   // PERMISOS: módulos personalizados por usuario (si la hoja no existe, todos usan los de su rol)
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PERMISOS'), m = {};
  if (!s || s.getLastRow() < 2) return m;
  s.getRange(2, 1, s.getLastRow() - 1, 2).getValues().forEach(r => {
    const mods = String(r[1]).split(',').map(x => x.trim()).filter(x => MODULOS[x] && x !== 'usuarios');
    if (r[0] && mods.length) m[String(r[0]).trim().toLowerCase()] = mods;
  });
  return m;
}
function sesionDe_(u) {
  const mods = u.rol === 'administrador' ? null : (mapaMods_()[String(u.usuario).toLowerCase()] || null);
  return { usuario: u.usuario, nombre: u.nombre, rol: u.rol, plantas: plantasDe_(u), modulos: mods };
}
function th_(token) { return hash_('tok', String(token)); }
function login_(d) {
  const cache = CacheService.getScriptCache();
  const usuario = String(d.usuario || '').trim().toLowerCase();
  const kInt = 'int_' + usuario;
  if (Number(cache.get(kInt) || 0) >= 5) return err_('Demasiados intentos fallidos. Espera 10 minutos.');
  const u = leer_('USUARIOS').filter(x => x.usuario.toLowerCase() === usuario)[0];
  if (!u || !u.activo || hash_(u.salt, String(d.clave || '')) !== u.hash) {
    cache.put(kInt, String(Number(cache.get(kInt) || 0) + 1), 600);
    return err_('Usuario o clave incorrectos.');
  }
  cache.remove(kInt);
  const ses = sesionDe_(u);
  if (!ses.plantas.length) return err_('Tu usuario no tiene plantas asignadas. Pide acceso al administrador.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  const th = th_(token), expira = fmt_(new Date(Date.now() + SESION_DIAS * 86400000), 'yyyy-MM-dd HH:mm:ss');
  append_('SESIONES', { th: th, usuario: u.usuario, expira: expira });
  cache.put('s_' + th, u.usuario, 21600);
  CTX.planta = '';
  auditar_(ses, 'Inicio de sesión', u.usuario);
  return { ok: true, token: token, usuario: ses, plantas: PLANTAS.filter(p => ses.plantas.indexOf(p.codigo) > -1), permisos: permisos_(ses) };
}
function sesion_(token) {
  if (!token) return null;
  const th = th_(token), cache = CacheService.getScriptCache();
  let usuario = cache.get('s_' + th);
  if (!usuario) {
    const s = hoja_('SESIONES'), last = s.getLastRow();
    if (last >= 2) {
      const desde = Math.max(2, last - 399), v = s.getRange(desde, 1, last - desde + 1, 3).getValues(), ahora = ahora_();
      for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]) === th && String(v[i][2]) > ahora) { usuario = String(v[i][1]); break; }
    }
    if (usuario) cache.put('s_' + th, usuario, 21600);
  }
  if (!usuario) return null;
  const u = leer_('USUARIOS').filter(x => x.usuario === usuario)[0];
  return (u && u.activo) ? sesionDe_(u) : null;
}
function logout_(ses, d, token) {
  const th = th_(token);
  CacheService.getScriptCache().remove('s_' + th);
  const s = hoja_('SESIONES'), last = s.getLastRow();
  for (let r = last; r >= Math.max(2, last - 399); r--) { if (String(s.getRange(r, 1).getValue()) === th) { s.deleteRow(r); break; } }
  return { ok: true };
}
function puede_(rol, mod, edit) { return ((edit ? EDICION : MODULOS)[mod] || []).indexOf(rol) > -1; }
function puedeS_(ses, mod, edit) {   // con módulos personalizados: ve solo los marcados; editar sigue dependiendo del rol
  if (ses.modulos && ses.rol !== 'administrador') {
    if (mod === 'usuarios') return false;
    if (mod !== 'dashboard' && ses.modulos.indexOf(mod) < 0) return false;
    return edit ? puede_(ses.rol, mod, true) : true;
  }
  return puede_(ses.rol, mod, edit);
}
function permisos_(ses) {
  const p = {};
  Object.keys(MODULOS).forEach(m => { p[m] = { ver: puedeS_(ses, m, false), editar: puedeS_(ses, m, true) }; });
  return p;
}
function cambiarClave_(ses, d) {
  const u = leer_('USUARIOS').filter(x => x.usuario === ses.usuario)[0];
  if (!u || hash_(u.salt, String(d.actual || '')) !== u.hash) return err_('La clave actual no es correcta.');
  if (String(d.nueva || '').length < 8) return err_('La nueva clave debe tener al menos 8 caracteres.');
  u.salt = Utilities.getUuid(); u.hash = hash_(u.salt, String(d.nueva));
  actualizar_('USUARIOS', u._fila, u);
  auditar_(ses, 'Cambio de clave', ses.usuario);
  return { ok: true };
}
function guardarUsuario_(ses, d) {
  const usuario = String(d.usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return err_('Usuario: 3 a 30 caracteres (letras, números . _ -).');
  if (ROLES.indexOf(d.rol) < 0) return err_('Rol no válido.');
  let mods = (Array.isArray(d.modulos) ? d.modulos : String(d.modulos || '').split(',')).map(x => String(x).trim()).filter(x => x);
  if (mods.some(x => MOD_ELEGIBLES.indexOf(x) < 0)) return err_('Módulo no válido.');
  if (d.rol === 'administrador') mods = [];
  if (!String(d.nombre || '').trim()) return err_('Escribe el nombre.');
  let pl = Array.isArray(d.plantas) ? d.plantas : String(d.plantas || '').split(',');
  pl = pl.map(x => String(x).trim()).filter(x => x);
  const todas = pl.indexOf('TODAS') > -1 || d.rol === 'administrador';
  if (!todas && !pl.length) return err_('Asigna al menos una planta.');
  if (!todas && pl.some(x => CODIGOS_PLANTA.indexOf(x) < 0)) return err_('Planta no válida.');
  const plantas = todas ? 'TODAS' : pl.join(',');
  const todos = leer_('USUARIOS');
  const u = todos.filter(x => x.usuario.toLowerCase() === usuario)[0];
  const activo = d.activo === true || d.activo === 'true' || d.activo === 'on';
  if (!u) {
    if (String(d.clave || '').length < 8) return err_('La clave temporal debe tener al menos 8 caracteres.');
    crearUsuario_(usuario, String(d.nombre).trim(), d.rol, String(d.clave), plantas);
    guardarModulos_(usuario, mods);
    auditar_(ses, 'Usuario creado', usuario + ' · ' + d.rol + ' · ' + plantas + (mods.length ? ' · módulos: ' + mods.join(',') : ''));
    return { ok: true };
  }
  const admins = todos.filter(x => x.rol === 'administrador' && x.activo && x.usuario !== u.usuario).length;
  if (u.usuario === ses.usuario && (!activo || d.rol !== 'administrador')) return err_('No puedes desactivarte ni quitarte el rol de administrador.');
  if (u.rol === 'administrador' && (!activo || d.rol !== 'administrador') && admins < 1) return err_('Debe quedar al menos un administrador activo.');
  u.nombre = String(d.nombre).trim(); u.rol = d.rol; u.activo = activo; u.plantas = plantas;
  if (d.clave) {
    if (String(d.clave).length < 8) return err_('La clave debe tener al menos 8 caracteres.');
    u.salt = Utilities.getUuid(); u.hash = hash_(u.salt, String(d.clave));
  }
  actualizar_('USUARIOS', u._fila, u);
  guardarModulos_(usuario, mods);
  auditar_(ses, 'Usuario actualizado', usuario + ' · ' + d.rol + ' · ' + plantas + (mods.length ? ' · módulos: ' + mods.join(',') : ' · módulos según rol') + (activo ? '' : ' · inactivo'));
  return { ok: true };
}

function guardarModulos_(usuario, mods) {   // lista vacía = usa los módulos de su rol
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName('PERMISOS');
  if (!s) {
    if (!mods.length) return;
    s = ss.insertSheet('PERMISOS');
    s.getRange(1, 1, 1, 2).setValues([TABLAS.PERMISOS]).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
    s.setFrozenRows(1);
  }
  mods = mods.slice();
  if (mods.length && mods.indexOf('dashboard') < 0) mods.unshift('dashboard');
  const fila = leer_('PERMISOS').filter(x => x.usuario.toLowerCase() === usuario)[0];
  if (!mods.length) { if (fila) borrar_('PERMISOS', fila._fila); return; }
  const o = { usuario: usuario, modulos: mods.join(',') };
  if (fila) actualizar_('PERMISOS', fila._fila, o); else append_('PERMISOS', o);
}

/* ======================= PERSONAL DE PROVEEDORES POR MÁQUINA ======================= */
function asegurarHoja_(n) {   // crea la hoja con sus encabezados si aún no existe (actualizaciones sin reinstalar)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(n)) return;
  const s = ss.insertSheet(n), cols = TABLAS[n];
  s.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
  s.setFrozenRows(1);
  cols.forEach((c, i) => { if (COLS_TEXTO.indexOf(c) > -1) s.getRange(2, i + 1, s.getMaxRows() - 1, 1).setNumberFormat('@'); });
}
function guardarPersonal_(ses, d) {
  asegurarHoja_('PERSONAL');
  const fecha = String(d.fecha || '').trim(), proveedor = String(d.proveedor || '').trim(), maquina = String(d.maquina || '').trim().replace(/\s+/g, ' ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return err_('Fecha no válida.');
  if (!leer_('PROVEEDORES').some(p => p.nombre === proveedor)) return err_('Elige un proveedor de la lista.');
  if (!maquina) return err_('Escribe la máquina.');
  const cant = Number(d.cantidad);
  if (!(cant === Math.floor(cant)) || cant < PERSONAL_MIN || cant > PERSONAL_MAX) return err_('Trabajadores por máquina: mínimo ' + PERSONAL_MIN + ' y máximo ' + PERSONAL_MAX + '.');
  const todos = leerP_('PERSONAL'), actual = d.id ? todos.filter(x => x.id === d.id)[0] : null;
  if (d.id && !actual) return err_('Registro no encontrado.');
  const igual = todos.filter(x => x.fecha === fecha && x.proveedor.toLowerCase() === proveedor.toLowerCase() && x.maquina.toLowerCase() === maquina.toLowerCase())[0];
  if (igual && (!actual || igual.id !== actual.id)) return err_('Ya hay un registro de esa máquina, proveedor y fecha. Edítalo en lugar de crear otro.');
  const o = { planta: CTX.planta, fecha: fecha, proveedor: proveedor, maquina: maquina, cantidad: cant, usuario: ses.nombre, actualizado: ahora_() };
  if (actual) { actualizar_('PERSONAL', actual._fila, Object.assign({}, actual, o)); auditar_(ses, 'Personal editado', fecha + ' · ' + proveedor + ' · ' + maquina + ' · ' + actual.cantidad + ' → ' + cant); }
  else { append_('PERSONAL', Object.assign({ id: id_('per') }, o)); auditar_(ses, 'Personal registrado', fecha + ' · ' + proveedor + ' · ' + maquina + ' · ' + cant); }
  return { ok: true };
}
function eliminarPersonal_(ses, d) {
  asegurarHoja_('PERSONAL');
  const r = leerP_('PERSONAL').filter(x => x.id === d.id)[0];
  if (!r) return err_('Registro no encontrado en esta planta.');
  borrar_('PERSONAL', r._fila);
  auditar_(ses, 'Personal eliminado', r.fecha + ' · ' + r.proveedor + ' · ' + r.maquina + ' · ' + r.cantidad);
  return { ok: true };
}

/* ======================= PRODUCTOS Y UBICACIONES ======================= */
function guardarProveedorSiNuevo_(nombre) {
  nombre = String(nombre || '').trim().toUpperCase();
  if (!nombre) return '';
  if (!leer_('PROVEEDORES').some(p => p.nombre === nombre)) append_('PROVEEDORES', { id: id_('prv'), nombre: nombre, activo: true });
  return nombre;
}
function guardarProducto_(ses, d) {
  const codigo = String(d.codigo || '').trim();
  const desc = String(d.descripcion || '').trim().replace(/\s+/g, ' ');
  if (!codigo) return err_('Escribe el código.');
  if (!desc) return err_('Escribe la descripción.');
  const cap = Number(d.capacidad_pallet), min = Number(d.stock_minimo || 0), adic = Number(d.adicional_habitual || 0);
  if (!(cap > 0)) return err_('La capacidad por pallet debe ser mayor a cero.');
  if (min < 0 || adic < 0) return err_('Stock mínimo y adicional no pueden ser negativos.');
  const todos = leer_('PRODUCTOS');
  if (todos.some(p => p.codigo === codigo && p.id !== d.id)) return err_('Ya existe un producto con ese código.');
  const prov = guardarProveedorSiNuevo_(d.proveedor);
  const activo = !(d.activo === false || d.activo === 'false');
  const o = { codigo: codigo, descripcion: desc, proveedor: prov, capacidad_pallet: cap, stock_minimo: min, adicional_habitual: adic, activo: activo };
  if (d.id) {
    const p = todos.filter(x => x.id === d.id)[0];
    if (!p) return err_('Producto no encontrado.');
    if (p.codigo !== codigo && (leer_('PROGRAMACION').some(l => l.codigo === p.codigo) || leer_('MOVIMIENTOS').some(m => m.codigo === p.codigo)))
      return err_('No se puede cambiar el código: ya tiene programaciones o movimientos.');
    actualizar_('PRODUCTOS', p._fila, Object.assign({}, p, o));
    auditar_(ses, 'Producto actualizado', codigo);
  } else {
    append_('PRODUCTOS', Object.assign({ id: id_('prd') }, o));
    auditar_(ses, 'Producto creado', codigo);
  }
  return { ok: true };
}
function guardarUbicacion_(ses, d) {
  const codigo = String(d.codigo || '').trim().toUpperCase().replace(/\s+/g, '-');
  if (!/^[A-Z0-9-]{1,12}$/.test(codigo)) return err_('Código de ubicación: 1 a 12 letras, números o guiones.');
  const nombre = String(d.nombre || '').trim() || codigo;
  const todas = leerP_('UBICACIONES');
  if (todas.some(u => u.codigo === codigo && u.id !== d.id)) return err_('Esa ubicación ya existe en la planta.');
  const activo = !(d.activo === false || d.activo === 'false');
  if (d.id) {
    const u = todas.filter(x => x.id === d.id)[0];
    if (!u) return err_('Ubicación no encontrada.');
    actualizar_('UBICACIONES', u._fila, Object.assign({}, u, { codigo: codigo, nombre: nombre, activo: activo }));
  } else append_('UBICACIONES', { id: id_('ubi'), planta: CTX.planta, codigo: codigo, nombre: nombre, activo: true });
  auditar_(ses, 'Ubicación guardada', codigo);
  return { ok: true };
}
function ubicacionValida_(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!leerP_('UBICACIONES').some(x => x.codigo === u && x.activo)) throw new Error('La ubicación ' + u + ' no existe en esta planta.');
  return u;
}

/* ======================= PROGRAMACIÓN ======================= */
function calcular_(nec, adic, stock, cap) {
  const total = r2_(nec + adic), dif = r2_(total - stock), porArmar = dif > 0 ? dif : 0;
  return { total: total, porArmar: porArmar, pallets: cap > 0 ? Math.ceil(porArmar / cap) : 0 };
}
function lineasVista_(plantas, desde, hasta) {
  const prods = mapa_(leer_('PRODUCTOS'), 'codigo');
  const arm = {}; leer_('ARMADO').forEach(a => { arm[a.linea_id] = (arm[a.linea_id] || 0) + a.cantidad; });
  const canceladas = {}; leer_('CANCELACIONES').forEach(c => { canceladas[c.linea_id] = c; });
  return leer_('PROGRAMACION').filter(l => plantas.indexOf(l.planta) > -1 && l.fecha >= desde && l.fecha <= hasta).map(l => {
    const p = prods[l.codigo] || {}, ca = canceladas[l.id] || null;
    return {
      id: l.id, planta: l.planta, fecha: l.fecha, codigo: l.codigo, descripcion: p.descripcion || '(producto eliminado)', proveedor: p.proveedor || '',
      capacidad: p.capacidad_pallet || 0, programa: l.programa, nec: l.nec_temporal, adicional: l.adicional, total: l.total,
      stock: l.stock_almacen, porArmar: l.por_armar, pallets: l.pallets, t1: l.entregado_t1, t2: l.entregado_t2, nota: l.nota, armado: r2_(arm[l.id] || 0),
      cancelada: !!ca, cantidadCancelada: ca ? ca.cantidad_cancelada : 0, motivoCancelacion: ca ? ca.motivo : '',
      canceladaPor: ca ? ca.usuario : '', canceladaEn: ca ? ca.cuando : ''
    };
  }).sort((a, b) => (a.fecha + a.codigo + a.planta).localeCompare(b.fecha + b.codigo + b.planta));
}
function numNoNeg_(v, nombre) {
  const n = (v === '' || v === null || v === undefined) ? 0 : Number(v);
  if (isNaN(n) || n < 0) throw new Error(nombre + ' debe ser un número mayor o igual a cero.');
  return n;
}
function guardarLinea_(ses, d) {
  const fecha = String(d.fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return err_('Fecha no válida.');
  const p = leer_('PRODUCTOS').filter(x => x.codigo === String(d.codigo || '').trim() && x.activo)[0];
  if (!p) return err_('Producto no existe o está inactivo.');
  const programa = numNoNeg_(d.programa, 'Programa'), nec = numNoNeg_(d.nec, 'Necesidad temporal'),
        adic = numNoNeg_(d.adicional, 'Adicional almacén'), stock = numNoNeg_(d.stock, 'Stock almacén');
  const lineas = leerP_('PROGRAMACION');
  const esEdicion = d.id && lineas.some(l => l.id === d.id);
  if (esEdicion && leer_('CANCELACIONES').some(c => c.linea_id === d.id)) return err_('Esta programación está retirada y no se puede editar.');
  const mismo = lineas.filter(l => l.fecha === fecha && l.codigo === p.codigo)[0];
  if (mismo && (!esEdicion || mismo.id !== d.id)) return err_('Ese código ya está programado en esa fecha para esta planta.');
  const c = calcular_(nec, adic, stock, p.capacidad_pallet);
  if (esEdicion) {
    const yaArmado = r2_(leer_('ARMADO').filter(a => a.linea_id === d.id).reduce((s, a) => s + a.cantidad, 0));
    if (c.porArmar + 0.001 < yaArmado) return err_('Con estos valores quedaría por armar ' + c.porArmar + ', pero ya hay ' + yaArmado + ' unidades armadas. Ajusta las cantidades o usa Retirar programación.');
  }
  const o = { planta: CTX.planta, fecha: fecha, codigo: p.codigo, programa: programa, nec_temporal: nec, adicional: adic, total: c.total, stock_almacen: stock, por_armar: c.porArmar, pallets: c.pallets, nota: String(d.nota || '').trim(), actualizado: ahora_() };
  if (esEdicion) {
    const l = lineas.filter(x => x.id === d.id)[0];
    actualizar_('PROGRAMACION', l._fila, Object.assign({}, l, o));
    auditar_(ses, 'Programación editada', fecha + ' · ' + p.codigo);
  } else {
    append_('PROGRAMACION', Object.assign({ id: id_('lin'), entregado_t1: 0, entregado_t2: 0 }, o));
    auditar_(ses, 'Programación creada', fecha + ' · ' + p.codigo);
  }
  return { ok: true, calculo: c };
}
function eliminarLinea_(ses, d) {
  const l = leerP_('PROGRAMACION').filter(x => x.id === d.id)[0];
  if (!l) return err_('Línea no encontrada.');
  if (leer_('ARMADO').some(a => a.linea_id === l.id) || leer_('ENTREGAS').some(e => e.linea_id === l.id) || leer_('CANCELACIONES').some(c => c.linea_id === l.id))
    return err_('No se puede eliminar: conserva el historial de armado, entregas o cancelación. Usa Retirar programación.');
  borrar_('PROGRAMACION', l._fila);
  auditar_(ses, 'Programación eliminada', l.fecha + ' · ' + l.codigo);
  return { ok: true };
}
function cancelarLinea_(ses, d) {
  if (ses.rol !== 'administrador') return err_('Solo el administrador puede retirar programaciones.');
  const l = leerP_('PROGRAMACION').filter(x => x.id === d.id)[0];
  if (!l) return err_('Programación no encontrada en esta planta.');
  const motivo = String(d.motivo || '').trim();
  if (motivo.length < 5) return err_('Escribe un motivo de al menos 5 caracteres.');
  if (leer_('CANCELACIONES').some(c => c.linea_id === l.id)) return err_('Esta programación ya fue retirada.');
  const armados = r2_(leer_('ARMADO').filter(a => a.linea_id === l.id).reduce((s, a) => s + a.cantidad, 0));
  const entregas = r2_(leer_('ENTREGAS').filter(e => e.linea_id === l.id).reduce((s, e) => s + e.cantidad, 0));
  const pendiente = Math.max(0, r2_(l.por_armar - armados));
  if (pendiente <= 0) return err_('No hay cantidad pendiente por armar para retirar. La programación se conserva con su historial.');
  append_('CANCELACIONES', {
    id: id_('can'), linea_id: l.id, planta: l.planta, fecha: l.fecha, codigo: l.codigo,
    cantidad_cancelada: pendiente, motivo: motivo, usuario: ses.nombre, cuando: ahora_()
  });
  auditar_(ses, 'Programación retirada', l.fecha + ' · ' + l.codigo + ' · cancelado pendiente: ' + pendiente +
    ' · armado conservado: ' + armados + ' · entregado conservado: ' + entregas + ' · motivo: ' + motivo);
  return { ok: true, cantidadCancelada: pendiente, armadoConservado: armados, entregadoConservado: entregas };
}
function lineaRef_(d) {   // por id o por (fecha, código): sirve para líneas creadas sin internet
  const ls = leerP_('PROGRAMACION');
  return ls.filter(x => x.id === d.lineaId)[0] || ls.filter(x => x.fecha === d.fecha && x.codigo === String(d.codigo || '').trim())[0];
}
function trazabilidad_(ses, d) {
  return { ok: true, armado: leer_('ARMADO').filter(a => a.linea_id === d.id), entregas: leer_('ENTREGAS').filter(e => e.linea_id === d.id), cancelacion: leer_('CANCELACIONES').filter(c => c.linea_id === d.id)[0] || null };
}

/* ======================= ARMADO Y ENTREGAS (pallets + puchos) ======================= */
function cantidadDe_(d, cap) {
  const hayPP = (d.ph !== undefined && d.ph !== '') || (d.puchos !== undefined && d.puchos !== '');
  if (hayPP) {
    const ph = Math.max(0, Math.floor(Number(d.ph) || 0)), pu = Math.max(0, Number(d.puchos) || 0);
    if (ph > 0 && !(cap > 0)) throw new Error('El producto no tiene unidades por pallet definidas.');
    return r2_(ph * cap + pu);
  }
  return r2_(Number(d.cantidad));
}
function dividir_(cant, cap) {
  if (!(cap > 0)) return { ph: 0, pu: cant };
  const ph = Math.floor(cant / cap + 1e-9);
  return { ph: ph, pu: r2_(cant - ph * cap) };
}
function armado_(ses, d) {
  const l = lineaRef_(d);
  if (!l) return err_('Selecciona una programación válida.');
  if (leer_('CANCELACIONES').some(c => c.linea_id === l.id)) return err_('Esta programación fue retirada. No admite nuevos armados.');
  const p = leer_('PRODUCTOS').filter(x => x.codigo === l.codigo)[0], cap = p ? p.capacidad_pallet : 0;
  const cant = cantidadDe_(d, cap);
  if (!(cant > 0)) return err_('La cantidad armada debe ser mayor a cero.');
  const armado = leer_('ARMADO').filter(a => a.linea_id === l.id).reduce((s, a) => s + a.cantidad, 0);
  const pendiente = Math.max(0, r2_(l.por_armar - armado));
  const excede = cant > pendiente + 0.001;   // sin tope: se registra igual y queda anotado en la auditoría
  const ub = ubicacionValida_(d.ubicacion), dv = dividir_(cant, cap);
  append_('ARMADO', { id: id_('arm'), planta: CTX.planta, linea_id: l.id, fecha: fechaOp_(), hora: horaOp_(), cantidad: cant, pallets: dv.ph, puchos: dv.pu, ubicacion: ub, observaciones: String(d.observaciones || '').trim(), usuario: ses.nombre, creado: ahora_() });
  auditar_(ses, 'Armado registrado', l.codigo + ' · ' + cant + ' uds (' + dv.ph + ' PH + ' + dv.pu + ')' + (ub ? ' · ' + ub : '') + (excede ? ' · SUPERA el pendiente (' + pendiente + ')' : ''));
  return { ok: true, excedePendiente: excede };
}
function entrega_(ses, d) {
  const l = lineaRef_(d);
  if (!l) return err_('Selecciona una programación válida.');
  const p = leer_('PRODUCTOS').filter(x => x.codigo === l.codigo)[0], cap = p ? p.capacidad_pallet : 0;
  const turno = Number(d.turno) === 2 ? 2 : 1, cant = cantidadDe_(d, cap);
  if (!(cant > 0)) return err_('La cantidad entregada debe ser mayor a cero.');
  if (!String(d.responsable || '').trim()) return err_('Indica el responsable de la entrega.');
  const previas = leer_('ENTREGAS').filter(e => e.linea_id === l.id).reduce((s, e) => s + e.cantidad, 0);
  const previo = l.entregado_t1 + l.entregado_t2, aut = l.por_armar, excede = previo + cant > aut + 0.001;
  const retirada = leer_('CANCELACIONES').some(c => c.linea_id === l.id);
  if (retirada) {
    const armados = leer_('ARMADO').filter(a => a.linea_id === l.id).reduce((s, a) => s + a.cantidad, 0);
    const disponibleArmado = Math.max(0, r2_(armados - previas));
    if (cant > disponibleArmado + 0.001) return err_('Programación retirada. Solo puedes entregar unidades que ya estaban armadas y aún no se entregaron (' + disponibleArmado + ').');
  } else if (excede && !d.forzar) {
    return { ok: false, requiereConfirmacion: true, error: 'La entrega supera lo autorizado. Autorizado: ' + aut + ' · entregado: ' + previo + ' · disponible: ' + Math.max(0, aut - previo) + '.' };
  }
  append_('ENTREGAS', { id: id_('ent'), planta: CTX.planta, linea_id: l.id, fecha: fechaOp_(), hora: horaOp_(), turno: turno, cantidad: cant, responsable: String(d.responsable).trim(), usuario: ses.nombre, forzada: excede && !retirada });
  if (turno === 1) l.entregado_t1 = r2_(l.entregado_t1 + cant); else l.entregado_t2 = r2_(l.entregado_t2 + cant);
  l.actualizado = ahora_();
  actualizar_('PROGRAMACION', l._fila, l);
  auditar_(ses, 'Entrega registrada', l.codigo + ' · turno ' + turno + ' · ' + cant + ' uds' + (excede ? ' (autorización excedida)' : ''));
  return { ok: true };
}

/* ======================= ALMACÉN: STOCK, LOTES, MERMAS ======================= */
/* STOCK GENERAL = STOCK EN LOTES + STOCK NO ASIGNADO  (nunca negativo) — todo por planta */
function inv_(codigo) {
  let r = leerP_('INVENTARIO').filter(x => x.codigo === codigo)[0];
  if (!r) { append_('INVENTARIO', { planta: CTX.planta, codigo: codigo, stock: 0 }); r = leerP_('INVENTARIO').filter(x => x.codigo === codigo)[0]; }
  return r;
}
function setStock_(r, v) { r.stock = r2_(v); actualizar_('INVENTARIO', r._fila, r); }
function lotesDe_(codigo) { return leerP_('LOTES').filter(l => l.codigo === codigo); }
function enLotes_(codigo) { return r2_(lotesDe_(codigo).reduce((s, l) => s + l.cant_disp, 0)); }
function ordenConsumo_(a, b) {            // FEFO, desempate FIFO
  const va = a.vencimiento || '9999-99-99', vb = b.vencimiento || '9999-99-99';
  return va.localeCompare(vb) || a.ingreso.localeCompare(b.ingreso) || a.id.localeCompare(b.id);
}
function mov_(ses, o) {
  append_('MOVIMIENTOS', { id: id_('mov'), planta: CTX.planta, fecha: fechaOp_(), hora: horaOp_(), codigo: o.codigo, tipo: o.tipo, cantidad: o.cantidad, saldo: o.saldo, motivo: o.motivo || '', referencia: o.referencia || '', lote_id: o.lote_id || '', ubicacion: o.ubicacion || '', usuario: ses.nombre });
}
function prod_(codigo) { return leer_('PRODUCTOS').filter(p => p.codigo === String(codigo || '').trim())[0]; }
function nuevoLote_(ses, codigo, nombre, venc, cant, ub) {
  nombre = String(nombre || '').trim();
  if (!nombre) throw new Error('Escribe el código del lote.');
  if (venc && !/^\d{4}-\d{2}-\d{2}$/.test(venc)) throw new Error('Fecha de vencimiento no válida.');
  if (lotesDe_(codigo).some(l => l.lote.toLowerCase() === nombre.toLowerCase())) throw new Error('Ya existe ese lote para el producto en esta planta.');
  const id = id_('lot');
  append_('LOTES', { id: id, planta: CTX.planta, codigo: codigo, lote: nombre, ingreso: fechaOp_(), vencimiento: venc || '', cant_inicial: cant, cant_disp: cant, ubicacion: ub || '', usuario: ses.nombre });
  return id;
}
function mover_(ses, d) {
  const p = prod_(d.codigo); if (!p) return err_('Selecciona un producto válido.');
  const cant = cantidadDe_(Object.assign({}, d, { cantidad: Math.abs(Number(d.cantidad)) }), p.capacidad_pallet);
  if (!(cant > 0)) return err_('La cantidad debe ser mayor a cero.');
  const tipo = d.tipo === 'salida' ? 'salida' : 'entrada';
  const ub = ubicacionValida_(d.ubicacion), inv = inv_(p.codigo);
  if (tipo === 'entrada') {
    const nuevo = r2_(inv.stock + cant);
    let loteId = '';
    if (String(d.lote || '').trim()) loteId = nuevoLote_(ses, p.codigo, d.lote, d.vencimiento, cant, ub);
    setStock_(inv, nuevo);
    mov_(ses, { codigo: p.codigo, tipo: 'entrada', cantidad: cant, saldo: nuevo, motivo: d.motivo || 'Ingreso de mercadería', referencia: d.referencia || '', lote_id: loteId, ubicacion: ub });
    auditar_(ses, 'Entrada de inventario', p.codigo + ' · ' + cant + ' · saldo ' + nuevo);
    return { ok: true, saldo: nuevo };
  }
  if (cant > inv.stock) return err_('Stock insuficiente: disponible ' + inv.stock + ' unidades.');
  const lotes = lotesDe_(p.codigo).filter(l => l.cant_disp > 0).sort(ordenConsumo_);
  const noAsig = r2_(inv.stock - lotes.reduce((s, l) => s + l.cant_disp, 0));
  let resto = r2_(cant - Math.max(0, Math.min(noAsig, cant)));
  const plan = [];
  lotes.forEach(l => { if (resto <= 0) return; const t = r2_(Math.min(l.cant_disp, resto)); if (t > 0) { plan.push([l, t]); resto = r2_(resto - t); } });
  if (resto > 0.001) return err_('Stock insuficiente: ' + resto + ' unidades no están respaldadas por lotes ni por stock no asignado.');
  plan.forEach(x => { x[0].cant_disp = r2_(x[0].cant_disp - x[1]); actualizar_('LOTES', x[0]._fila, x[0]); });
  const nuevo = r2_(inv.stock - cant);
  setStock_(inv, nuevo);
  const ref = (d.referencia ? d.referencia + ' · ' : '') + (plan.length ? 'Lotes: ' + plan.map(x => x[0].lote + '×' + x[1]).join(', ') : '');
  mov_(ses, { codigo: p.codigo, tipo: 'salida', cantidad: cant, saldo: nuevo, motivo: d.motivo || 'Salida de almacén', referencia: ref, ubicacion: ub });
  auditar_(ses, 'Salida de inventario', p.codigo + ' · ' + cant + ' · saldo ' + nuevo);
  return { ok: true, saldo: nuevo };
}
function asignarLote_(ses, d) {
  const p = prod_(d.codigo); if (!p) return err_('Selecciona un producto válido.');
  const cant = cantidadDe_(d, p.capacidad_pallet); if (!(cant > 0)) return err_('La cantidad debe ser mayor a cero.');
  const ub = ubicacionValida_(d.ubicacion), inv = inv_(p.codigo), noAsig = r2_(inv.stock - enLotes_(p.codigo));
  if (cant > noAsig) return err_('Solo hay ' + noAsig + ' unidades sin asignar a lotes. Para ingresar mercadería nueva usa «Entrada» con lote.');
  const id = nuevoLote_(ses, p.codigo, d.lote, d.vencimiento, cant, ub);
  mov_(ses, { codigo: p.codigo, tipo: 'asignacion', cantidad: cant, saldo: inv.stock, motivo: 'Asignación a lote', referencia: d.lote, lote_id: id, ubicacion: ub });
  auditar_(ses, 'Lote asignado', p.codigo + ' · ' + d.lote + ' · ' + cant);
  return { ok: true };
}
function merma_(ses, d) {
  const p = prod_(d.codigo); if (!p) return err_('Selecciona un producto válido.');
  const cant = cantidadDe_(d, p.capacidad_pallet); if (!(cant > 0)) return err_('La cantidad debe ser mayor a cero.');
  const motivo = String(d.motivo || '').trim(); if (!motivo) return err_('Indica el motivo de la merma.');
  const inv = inv_(p.codigo);
  let loteId = '', ref = String(d.observaciones || '').trim(), ub = '';
  if (d.loteId) {
    const l = lotesDe_(p.codigo).filter(x => x.id === d.loteId)[0];
    if (!l) return err_('Lote no encontrado para ese producto.');
    if (cant > l.cant_disp) return err_('El lote solo tiene ' + l.cant_disp + ' disponibles.');
    if (cant > inv.stock) return err_('Stock general insuficiente.');
    l.cant_disp = r2_(l.cant_disp - cant); actualizar_('LOTES', l._fila, l);
    loteId = l.id; ub = l.ubicacion; ref = (ref ? ref + ' · ' : '') + 'Lote ' + l.lote;
  } else {
    const noAsig = r2_(inv.stock - enLotes_(p.codigo));
    if (cant > noAsig) return err_('Sin lote solo puedes mermar stock no asignado (' + noAsig + ').');
    ub = ubicacionValida_(d.ubicacion);
  }
  const nuevo = r2_(inv.stock - cant);
  setStock_(inv, nuevo);
  mov_(ses, { codigo: p.codigo, tipo: 'merma', cantidad: cant, saldo: nuevo, motivo: motivo, referencia: ref, lote_id: loteId, ubicacion: ub });
  auditar_(ses, 'Merma registrada', p.codigo + ' · ' + cant + ' · ' + motivo);
  return { ok: true, saldo: nuevo };
}
function ajuste_(ses, d) {     // solo administrador
  const p = prod_(d.codigo); if (!p) return err_('Selecciona un producto válido.');
  const delta = r2_(Number(d.delta)); if (!delta) return err_('El ajuste no puede ser cero.');
  const motivo = String(d.motivo || '').trim(); if (motivo.length < 5) return err_('Escribe un motivo claro para el ajuste.');
  const ambito = ['stock', 'lote', 'ambos'].indexOf(d.ambito) > -1 ? d.ambito : 'stock';
  const inv = inv_(p.codigo), lotes = lotesDe_(p.codigo);
  const l = (ambito !== 'stock') ? lotes.filter(x => x.id === d.loteId)[0] : null;
  if (ambito !== 'stock' && !l) return err_('Elige el lote a ajustar.');
  const stockNuevo = ambito === 'lote' ? inv.stock : r2_(inv.stock + delta);
  const loteNuevo = l ? r2_(l.cant_disp + delta) : null;
  if (stockNuevo < 0) return err_('El stock general no puede quedar negativo.');
  if (l && (loteNuevo < 0 || loteNuevo > l.cant_inicial)) return err_('El lote debe quedar entre 0 y su cantidad inicial (' + l.cant_inicial + ').');
  const sumaLotes = r2_(lotes.reduce((s, x) => s + (l && x.id === l.id ? loteNuevo : x.cant_disp), 0));
  if (stockNuevo < sumaLotes) return err_('El ajuste dejaría el stock no asignado en negativo.');
  if (ambito !== 'lote') setStock_(inv, stockNuevo);
  if (l) { l.cant_disp = loteNuevo; actualizar_('LOTES', l._fila, l); }
  mov_(ses, { codigo: p.codigo, tipo: 'ajuste', cantidad: delta, saldo: stockNuevo, motivo: motivo, referencia: 'Ámbito: ' + ambito + (l ? ' · lote ' + l.lote : ''), lote_id: l ? l.id : '', ubicacion: l ? l.ubicacion : '' });
  auditar_(ses, 'Ajuste de inventario', p.codigo + ' · ' + delta + ' · ' + ambito + ' · ' + motivo);
  return { ok: true };
}
function stockResumen_(plantas) {
  const prods = leer_('PRODUCTOS').filter(p => p.activo), inv = {}, lotes = leer_('LOTES').filter(l => plantas.indexOf(l.planta) > -1), mermas = {};
  leer_('INVENTARIO').forEach(i => { inv[i.planta + '|' + i.codigo] = i.stock; });
  leer_('MOVIMIENTOS').forEach(m => { if (m.tipo === 'merma') mermas[m.planta + '|' + m.codigo] = (mermas[m.planta + '|' + m.codigo] || 0) + m.cantidad; });
  const out = [];
  plantas.forEach(pl => prods.forEach(p => {
    const k = pl + '|' + p.codigo, stock = inv[k] || 0, ls = lotes.filter(l => l.planta === pl && l.codigo === p.codigo);
    const enLotes = r2_(ls.reduce((s, l) => s + l.cant_disp, 0)), noAsig = r2_(stock - enLotes);
    out.push({ planta: pl, codigo: p.codigo, descripcion: p.descripcion, proveedor: p.proveedor, capacidad: p.capacidad_pallet, stock: stock, enLotes: enLotes, noAsignado: noAsig, minimo: p.stock_minimo,
      bajo: p.stock_minimo > 0 && stock <= p.stock_minimo, mermas: r2_(mermas[k] || 0), descuadre: noAsig < 0 || ls.some(l => l.cant_disp < 0 || l.cant_disp > l.cant_inicial) });
  }));
  return out;
}

/* ======================= IMPORTAR EXCEL ======================= */
function importar_(ses, d) {
  const filas = d.filas || [], informe = { importadas: 0, omitidas: 0, creados: 0, errores: [] };
  const prods = mapa_(leer_('PRODUCTOS'), 'codigo'), existentes = {};
  leerP_('PROGRAMACION').forEach(l => { existentes[l.fecha + '|' + l.codigo] = true; });
  filas.forEach((f, i) => {
    const n = f.n || (i + 1);
    try {
      const fecha = String(f.fecha || '').trim(), codigo = String(f.codigo || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('fecha no válida');
      if (!codigo) throw new Error('falta el código');
      let p = prods[codigo];
      if (!p) {
        if (!d.crearProductos) throw new Error('el código no existe en el catálogo');
        const nuevo = { id: id_('prd'), codigo: codigo, descripcion: String(f.descripcion || codigo).trim().replace(/\s+/g, ' '), proveedor: '', capacidad_pallet: 0, stock_minimo: 0, adicional_habitual: 0, activo: true };
        append_('PRODUCTOS', nuevo);
        prods[codigo] = p = nuevo; informe.creados++;
      }
      if (existentes[fecha + '|' + codigo]) { informe.omitidas++; return; }
      const programa = numNoNeg_(f.programa, 'programa'), nec = numNoNeg_(f.nec, 'necesidad temporal'), adic = numNoNeg_(f.adicional, 'adicional'), stock = numNoNeg_(f.stock, 'stock');
      const c = calcular_(nec, adic, stock, p.capacidad_pallet);
      const t1 = numNoNeg_(f.t1, 'entregado 1° turno'), t2 = numNoNeg_(f.t2, 'entregado 2° turno');
      const id = id_('lin');
      append_('PROGRAMACION', { id: id, planta: CTX.planta, fecha: fecha, codigo: codigo, programa: programa, nec_temporal: nec, adicional: adic, total: c.total, stock_almacen: stock, por_armar: c.porArmar, pallets: c.pallets, entregado_t1: t1, entregado_t2: t2, nota: String(f.nota || '').trim(), actualizado: ahora_() });
      [[1, t1], [2, t2]].forEach(x => { if (x[1] > 0) append_('ENTREGAS', { id: id_('ent'), planta: CTX.planta, linea_id: id, fecha: fecha, hora: '00:00:00', turno: x[0], cantidad: x[1], responsable: 'Importado', usuario: ses.nombre, forzada: false }); });
      existentes[fecha + '|' + codigo] = true; informe.importadas++;
    } catch (e) { informe.errores.push('Fila ' + n + ': ' + e.message); }
  });
  auditar_(ses, 'Importación de Excel', informe.importadas + ' importadas, ' + informe.omitidas + ' duplicadas, ' + informe.errores.length + ' con error');
  return { ok: true, informe: informe };
}

/* ======================= DATOS PARA LA APP ======================= */
function datos_(ses, d) {
  const todas = d.planta === 'TODAS';
  if (!todas && ses.plantas.indexOf(d.planta) < 0) return err_('No tienes acceso a esa planta.');
  const plantas = todas ? ses.plantas : [d.planta];
  const d30 = fmt_(new Date(Date.now() - 30 * 86400000), 'yyyy-MM-dd');
  const desde = d.desde || d30, hasta = d.hasta || '9999-12-31';
  const out = { ok: true, ahora: ahora_(), hoy: hoy_(), planta: d.planta, plantas: PLANTAS.filter(p => ses.plantas.indexOf(p.codigo) > -1), usuario: ses, permisos: permisos_(ses), motivosMerma: MOTIVOS_MERMA, desde: desde, hasta: hasta };
  out.lineas = lineasVista_(plantas, desde, hasta);
  out.productos = leer_('PRODUCTOS').map(p => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, proveedor: p.proveedor, capacidad: p.capacidad_pallet, minimo: p.stock_minimo, adicional: p.adicional_habitual, activo: p.activo }));
  out.proveedores = leer_('PROVEEDORES').map(p => p.nombre);
  out.ubicaciones = leer_('UBICACIONES').filter(u => plantas.indexOf(u.planta) > -1).map(u => ({ id: u.id, planta: u.planta, codigo: u.codigo, nombre: u.nombre, activo: u.activo }));
  if (puedeS_(ses, 'almacen', false) || puedeS_(ses, 'programacion', false)) out.stock = stockResumen_(plantas);
  if (puedeS_(ses, 'almacen', false)) {
    out.lotes = leer_('LOTES').filter(l => plantas.indexOf(l.planta) > -1).sort((a, b) => b.ingreso.localeCompare(a.ingreso));
    out.movimientos = leer_('MOVIMIENTOS').filter(m => plantas.indexOf(m.planta) > -1).slice(-400).reverse();
  }
  if (puedeS_(ses, 'personal', false)) out.personal = (SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PERSONAL') ? leer_('PERSONAL') : []).filter(r => plantas.indexOf(r.planta) > -1 && r.fecha >= desde && r.fecha <= hasta).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.proveedor.localeCompare(b.proveedor) || a.maquina.localeCompare(b.maquina));
  if (puedeS_(ses, 'usuarios', false)) { const mm = mapaMods_(); out.usuarios = leer_('USUARIOS').map(u => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo, plantas: u.plantas, modulos: (mm[u.usuario.toLowerCase()] || []).join(',') })); }
  if (puedeS_(ses, 'auditoria', false)) out.auditoria = leer_('AUDITORIA').filter(a => !a.planta || plantas.indexOf(a.planta) > -1).slice(-300).reverse();
  return out;
}
