/* ============ persistencia ============ */
const LS_KEY = 'sala-montaje.projects.v1';
const IDB = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => { try { const r = indexedDB.open('sala-montaje', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
    return this.db;
  },
  async put(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) { console.warn('IDB put', e); } },
  async get(k) { try { const db = await this.open(); return await new Promise((res, rej) => { const tx = db.transaction('files', 'readonly'); const r = tx.objectStore('files').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); } catch (e) { return null; } },
  async del(k) { try { const db = await this.open(); await new Promise(res => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) { } },
};

function setSave(state, text) {
  const el = $('#saveState'); el.className = 'pill ' + ({ ok: 'ok', saving: 'acc', local: 'warn', err: 'warn', ro: 'warn' }[state] || '');
  el.lastElementChild.textContent = text;
}
function localList() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; } }
function localWrite(list) { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }

const store = {
  writing: false, pending: false, timer: 0, lastJSON: {}, unsub: null,
  async start() {
    if (S.db) {
      S.storage = 'db'; startLibrary();
      this.unsub = S.db.collection('projects').onSnapshot(snap => this.onSnap(snap), err => { console.warn('db', err); toast('No se pudo leer la base del proyecto. Trabajo en modo local.'); S.storage = 'local'; this.loadLocal(); });
    } else { S.storage = 'local'; this.loadLocal(); }
  },
  loadLocal() {
    S.projects = localList(); setSave('local', 'Modo local · este navegador');
    renderProjSel(); if (!S.p) bootOpen();
  },
  first: true,
  onSnap(snap) {
    const list = snap.docs.map(d => d.data()).filter(Boolean).filter(p => p.id);
    S.projects = list.sort((a, b) => (b.updated || 0) - (a.updated || 0));
    renderProjSel();
    if (S.p) {
      const remote = list.find(p => p.id === S.p.id);
      if (remote && !snap.metadata.hasPendingWrites) {
        const rj = JSON.stringify(remote);
        if (rj !== this.lastJSON[S.p.id] && !this.timer && !this.writing) { adoptRemote(remote); this.lastJSON[S.p.id] = rj; }
      }
    } else if (this.first && !snap.metadata.fromCache) {
      this.first = false; bootOpen();
    }
    if (S.home) renderHome();
    if (S.storage === 'db' && !this.timer && !this.writing) setSave('ok', S.canWrite ? 'Guardado' : 'Solo lectura');
  },
  schedule() {
    if (!S.p) return; S.p.updated = Date.now();
    if (!S.canWrite) { setSave('ro', 'Solo lectura'); return; }
    setSave('saving', 'Sin guardar'); clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = 0; this.flush(); }, 900);
  },
  async flush() {
    if (!S.p) return; if (this.writing) { this.pending = true; return; }
    this.writing = true; const P = S.p, json = JSON.stringify(P);
    setSave('saving', 'Guardando…');
    try {
      if (json.length > 250000) throw Object.assign(new Error('grande'), { code: 'too_big' });
      if (S.storage === 'db') { await S.db.doc('projects/' + P.id).set(JSON.parse(json)); this.lastJSON[P.id] = json; setSave('ok', 'Guardado'); }
      else { const l = localList().filter(x => x.id !== P.id); l.unshift(JSON.parse(json)); if (localWrite(l)) setSave('local', 'Guardado en este navegador'); else setSave('err', 'No se pudo guardar'); S.projects = l; renderProjSel(); }
    } catch (e) {
      console.warn('save', e);
      if (e.code === 'invalid_argument') { S.canWrite = false; setSave('ro', 'Solo lectura'); }
      else if (e.code === 'too_big') setSave('err', 'Proyecto demasiado grande');
      else if (e.code === 'quota_exceeded') { setSave('err', 'Base llena'); toast('La base del artifact está llena: borrá proyectos viejos.'); }
      else setSave('err', 'Error al guardar · reintento');
      if (e.code === 'unavailable') setTimeout(() => this.flush(), 1500 + Math.random() * 1000);
    }
    this.writing = false;
    if (this.pending) { this.pending = false; this.flush(); }
  },
  async remove(id) {
    if (S.storage === 'db') { try { await S.db.doc('projects/' + id).delete(); } catch (e) { toast('No se pudo borrar el proyecto.'); } }
    else { localWrite(localList().filter(x => x.id !== id)); S.projects = localList(); renderProjSel(); }
    IDB.del('v:' + id); IDB.del('m:' + id);
  },
};
function bootOpen() {
  let last = null; try { last = localStorage.getItem(LS_KEY + '.last'); } catch (e) { }
  const p = S.projects.find(x => x.id === last);
  if (p && migrate(clone(p)).stage === 'home' && p.video) openProject(p); else showHome(true);
}
function adoptRemote(remote) {
  const prevP = S.p; const hadWords = S.p?.words?.length || 0; const keepSel = S.sel; S.p = migrate(clone(remote)); if (!S.p.motions.find(m => m.id === keepSel)) S.sel = null;
  afterProjectChange(false); try { checkRawMusic(); } catch (e) { } if (S.home) renderHome(); checkPendingAsk(); if (S.home && !hadWords && S.p.words.length) return; if (deepOnRemote(prevP, S.p)) { if (S.mode === 'editor') renderLeft(); return; } toast(!hadWords && S.p.words.length ? `Transcripción lista: ${S.p.words.length} palabras. Ya podés pedirle los motions a Claude.` : 'Se actualizó el proyecto con cambios guardados desde otro lugar.', 6000);
}
function migrate(p) {
  if (p.stage === undefined) p.stage = (p.motions?.length || p.chat?.length || p.example) ? 'editor' : 'home';
  const d = newProject(p.name);
  for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = clone(d[k]);
  for (const k of ['grade', 'frame', 'captions', 'audio']) p[k] = Object.assign(clone(d[k]), p[k] || {});
  normGrade(p.grade);
  p.brand = fixBrandContrast(Object.assign(clone(BRANDS[0]), p.brand || {}));
  p.motions = (p.motions || []).filter(m => PRESETS[m.type]).map(sanitizeMotion);
  p.words = (p.words || []).filter(w => w && typeof w.w === 'string' && Number.isFinite(+w.s)).map(w => ({ w: w.w, s: +w.s, e: Number.isFinite(+w.e) ? +w.e : +w.s + .2 }));
  return p;
}
function sanitizeMotion(m) {
  const pr = PRESETS[m.type] || PRESETS.titulo;
  const o = {
    id: m.id || 'm' + uid(), type: pr.key, start: Math.max(0, num(m.start)), dur: clamp(num(m.dur, 4), 0.8, 30),
    layout: m.layout === 'full' ? 'full' : 'overlay', pos: ['auto', 'arriba', 'centro', 'abajo'].includes(m.pos) ? m.pos : 'auto',
    bg: m.bg === 'solido' ? 'solido' : 'video', tr: ['subir', 'fundido', 'escala', 'mascara'].includes(m.tr) ? m.tr : (pr.key === 'palabra' ? 'fundido' : 'subir'),
    sfx: (SFX[m.sfx] || /^lib:/.test(m.sfx || '')) ? m.sfx : 'ninguno', stagger: clamp(num(m.stagger, .35), .1, 2),
    params: Object.assign(clone(pr.defaults), m.params || {}),
    beats: Array.isArray(m.beats) ? m.beats.map(b => (b == null || !Number.isFinite(+b)) ? null : +(+b).toFixed(3)) : [],
    quote: String(m.quote || ''), desc: String(m.desc || ''),
    status: ['aprobado', 'cambios', 'pendiente'].includes(m.status) ? m.status : 'pendiente', comment: String(m.comment || ''),
  };
  if (m.hist) o.hist = m.hist.slice(-4);
  if (m._quoteEdited) o._quoteEdited = true;
  if (m.fit && typeof m.fit === 'object') o.fit = { s: clamp(num(m.fit.s, 1), 0.4, 1.2), dy: num(m.fit.dy), ox: num(m.fit.ox, 540), oy: num(m.fit.oy, 960) };
  if (m.noCaps) o.noCaps = true; if (m.noCapsManual) o.noCapsManual = true;
  if (m.behind && o.layout !== 'full') o.behind = true; // se dibuja detrás de la persona (necesita el recorte)
  for (const [k, t] of pr.schema) { if (t === 'number' || t === 'range') o.params[k] = num(o.params[k], pr.defaults[k]); if (t === 'lines' && !Array.isArray(o.params[k])) o.params[k] = String(o.params[k] || '').split('\n').filter(Boolean); if (t === 'pairs' && !Array.isArray(o.params[k])) o.params[k] = clone(pr.defaults[k]); if (t === 'bool') o.params[k] = !!o.params[k]; if (t === 'json' && (o.params[k] == null || typeof o.params[k] !== 'object' || Array.isArray(o.params[k]) !== Array.isArray(pr.defaults[k]))) o.params[k] = clone(pr.defaults[k]); if (t === 'code' && typeof o.params[k] !== 'string') o.params[k] = String(pr.defaults[k]); }
  return o;
}

/* ============ edición con deshacer ============ */
function snapshot() { return S.p ? JSON.stringify(S.p) : null; }
function mutate(fn, opts = {}) {
  if (!S.p) return;
  const now = Date.now();
  if (!(opts.coalesce && opts.coalesce === S.lastCoalesce && now - S.lastCoalesceAt < 1500)) { S.undo.push(snapshot()); if (S.undo.length > 80) S.undo.shift(); S.redo = []; }
  S.lastCoalesce = opts.coalesce || ''; S.lastCoalesceAt = now;
  fn(S.p);
  S.dirty = true; store.schedule();
  if (!opts.silent) refreshUI(opts.skip);
}
function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); S.p = JSON.parse(S.undo.pop()); S.lastCoalesce = ''; afterProjectChange(true); }
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); S.p = JSON.parse(S.redo.pop()); S.lastCoalesce = ''; afterProjectChange(true); }
function afterProjectChange(save) {
  if (S.sel && !S.p.motions.find(m => m.id === S.sel)) S.sel = null;
  applyBrandFonts(); S.dirty = true; if (save) store.schedule(); refreshUI(); drawWave();
}

/* ============ abrir / crear ============ */
async function openProject(p) {
  pause();
  S.p = migrate(clone(p)); S.sel = null; S.undo = []; S.redo = []; S.t = 0; S.qc = {}; S.wordSel = null;
  store.lastJSON[S.p.id] = JSON.stringify(p);
  try { localStorage.setItem(LS_KEY + '.last', S.p.id); } catch (e) { }
  showHome(S.p.stage === 'home');
  S.localVideo = null; S.videoReady = false; S.voiceBuf = null; S.voicePeaks = null; S.voiceEnv = null; S.musicBuf = null;
  if (S.videoURL) { URL.revokeObjectURL(S.videoURL); S.videoURL = null; }
  const v = $('#vid'); v.removeAttribute('src'); v.load();
  const mus = $('#mus'); mus.removeAttribute('src'); if (S.musicURL) { URL.revokeObjectURL(S.musicURL); S.musicURL = null; }
  applyBrandFonts(); fitTimeline(); refreshUI(); renderProjSel();
  await attachProjectMedia();
}
async function attachProjectMedia() {
  const P = S.p; if (!P) return;
  if (P.video) {
    let blob = await IDB.get('v:' + P.id);
    if (blob) { S.localVideo = blob; setVideoSrc(URL.createObjectURL(blob), true); decodeVoice(blob); }
    else if (P.video.assetId) { setVideoSrc('/_blob/' + P.video.assetId, false); fetch('/_blob/' + P.video.assetId).then(r => r.ok ? r.blob() : null).then(b => { if (b && S.p === P) decodeVoice(b); }).catch(() => { }); }
    else toast(`Falta el video "${P.video.name}" en este navegador. Volvé a cargarlo con "Cargar video".`, 6000);
  }
  if (P.music) {
    let mb = await IDB.get('m:' + P.id);
    if (!mb && P.music.assetId) { try { const r = await fetch('/_blob/' + P.music.assetId); if (r.ok) mb = await r.blob(); } catch (e) { } }
    if (mb) { S.musicURL = URL.createObjectURL(mb); $('#mus').src = S.musicURL; S.musicBlob = mb; S.musicLibId = P.music.libId; }
  }
  if (P.grade.lutAssetId) loadCubeAsset(P.grade.lutAssetId);
  preloadLibSfx();
  S.dirty = true;
}
function setVideoSrc(url, local) {
  const v = $('#vid'); S.videoReady = false; if (S.videoURL && S.videoURL !== url && S.videoURL.startsWith('blob:')) URL.revokeObjectURL(S.videoURL);
  S.videoURL = url; v.src = url; v.load();
}
function createProject(fromExample) {
  const p = fromExample ? exampleProject() : newProject('Proyecto ' + new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }));
  if (fromExample) p.stage = 'editor';
  else if (S.pendingStyle) { const st = (S.styles || []).find(s => s.id === S.pendingStyle); if (st) applyStyle(st, p); }
  S.projects.unshift(p); openProject(p); store.schedule(); store.flush();
  return p;
}

/* ============ video ============ */
async function loadVideoFile(file) {
  if (!file) return;
  if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) { toast('Ese archivo no parece un video.'); return; }
  if (!S.p || (S.home && (S.p.stage !== 'home' || (S.p.chat || []).length))) createProject(false);
  const P = S.p, url = URL.createObjectURL(file);
  S.localVideo = file; setVideoSrc(url, true);
  const meta = await new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res({ d: v.duration, w: v.videoWidth, h: v.videoHeight }); v.onerror = () => res(null); v.src = url; });
  if (!meta) { toast('El navegador no puede leer ese video. Probá exportarlo como MP4 (H.264).'); return; }
  mutate(p => { const replacing = !!p.video || p.example; p.video = { name: file.name, size: file.size, w: meta.w, h: meta.h, duration: +meta.d.toFixed(3), assetId: null, proxy: false }; p.duration = +meta.d.toFixed(3); if (replacing) { p.words = []; p._wv = (p._wv || 0) + 1; p.transcribe = null; } p.example = false; });
  await IDB.put('v:' + P.id, file);
  decodeVoice(file); fitTimeline();
  if (!S.home) toast(`Video cargado: ${file.name} · ${mmss(meta.d)} · ${meta.w}×${meta.h}`);
  if (S.home) { S.p.name = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || S.p.name; renderProjSel(); renderHome(); }
  uploadVideoAsset(file);
}
async function uploadVideoAsset(file, isProxy) {
  const P = S.p; if (!S.assets || !P) { refreshUI(); return; }
  const okType = /video\/(mp4|webm)/.test(file.type) || /\.(mp4|webm)$/i.test(file.name || '');
  if (file.size > 19.5 * 1024 * 1024 || !okType) { S.needProxy = true; refreshUI(); if (!isProxy && !S.busy.proxy) makeProxy(); return; }
  S.busy.upload = true; refreshUI();
  try {
    const r = await S.assets.upload(file, { type: /webm/.test(file.type) ? 'video/webm' : 'video/mp4' });
    if (S.p === P) { mutate(p => { p.video.assetId = r.id; p.video.proxy = !!isProxy; p.words = []; p.transcribe = null; }); S.needProxy = false; if (!S.home) toast(isProxy ? 'Copia liviana guardada en el proyecto.' : 'Video guardado en el proyecto.'); if (!P.words?.length) requestTranscription(true); }
  } catch (e) { toast(e.code === 'too_large' ? 'El video supera 20 MB.' : e.code === 'quota_or_state' ? 'No hay más espacio para archivos en este artifact.' : 'No se pudo guardar el video en el proyecto (queda en este navegador).'); }
  S.busy.upload = false; refreshUI(); if (S.home) renderHome();
}
async function makeProxy() {
  const src = S.localVideo; if (!src) { toast('Cargá el video original primero.'); return; }
  S.busy.proxy = 0.001; refreshUI();
  try {
    const MB = await loadMB(); await ensureAac(MB);
    const dur = S.p.video.duration || 30, total = (17.5 * 8 * 1024 * 1024) / dur;
    const vb = clamp(Math.floor(total - 128000), 600000, 6000000);
    const input = new MB.Input({ source: new MB.BlobSource(src), formats: MB.ALL_FORMATS });
    const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
    const conv = await MB.Conversion.init({ input, output, video: { width: 720, fit: 'contain', codec: 'avc', bitrate: vb, forceTranscode: true }, audio: { codec: 'aac', bitrate: 128000 } });
    if (!conv.isValid) throw new Error('conversión inválida');
    conv.onProgress = p => { S.busy.proxy = Math.max(0.001, p); refreshProxyBar(); if (S.home) renderHomeMedia(); };
    await conv.execute();
    const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
    S.busy.proxy = 0; await uploadVideoAsset(new File([blob], 'proxy-720p.mp4', { type: 'video/mp4' }), true);
  } catch (e) { console.warn(e); S.busy.proxy = 0; toast('No se pudo crear la copia liviana en este navegador.'); refreshUI(); }
}
async function getVideoBlob() {
  if (S.localVideo) return S.localVideo;
  const P = S.p; if (!P?.video) return null;
  const b = await IDB.get('v:' + P.id); if (b) return (S.localVideo = b);
  if (P.video.assetId) { try { const r = await fetch('/_blob/' + P.video.assetId); if (r.ok) return await r.blob(); } catch (e) { } }
  return null;
}

/* ============ música, LUT, fuentes ============ */
async function loadMusicFile(file) {
  if (!S.p) return; const P = S.p;
  S.musicBlob = file; S.musicBuf = null; if (S.musicURL) URL.revokeObjectURL(S.musicURL); S.musicURL = URL.createObjectURL(file); $('#mus').src = S.musicURL;
  mutate(p => { p.music = { name: file.name, volume: p.music?.volume ?? 0.22, duck: p.music?.duck ?? true, assetId: null }; });
  await IDB.put('m:' + P.id, file);
  if (S.assets && /audio\/mp4|video\/mp4|\.m4a$|\.mp4$/i.test(file.type + ' ' + file.name) && file.size < 19.5e6) {
    try { const r = await S.assets.upload(file, { type: 'video/mp4' }); if (S.p === P) mutate(p => { p.music.assetId = r.id; }); } catch (e) { }
  }
  toast('Música cargada: ' + file.name);
}
async function getMusicBlob() { if (S.musicBlob) return S.musicBlob; const P = S.p; if (!P?.music) return null; const b = await IDB.get('m:' + P.id); if (b) return (S.musicBlob = b); if (P.music.assetId) { try { const r = await fetch('/_blob/' + P.music.assetId); if (r.ok) return (S.musicBlob = await r.blob()); } catch (e) { } } return null; }
async function loadCubeFile(file) {
  try {
    const text = await file.text(); const l = parseCube(text);
    let id = 'local-' + uid();
    if (S.assets) { try { const r = await S.assets.upload(new Blob([text], { type: 'text/plain' }), { type: 'text/plain' }); id = r.id; } catch (e) { } }
    GR.customLuts[id] = l;
    try { localStorage.setItem('sala-montaje.lut.' + id, text); } catch (e) { }
    mutate(p => { p.grade.preset = 'custom'; p.grade.lutAssetId = id; p.grade.lutName = file.name; p.grade.mix = 1; });
    toast(`LUT cargado: ${file.name} (${l.N}³)`);
  } catch (e) { toast('No se pudo leer el LUT: ' + e.message); }
}
async function loadCubeAsset(id) {
  if (!id || GR.customLuts[id]) return;
  GR.customLuts[id] = null;
  let text = null; try { text = localStorage.getItem('sala-montaje.lut.' + id); } catch (e) { }
  if (!text && !id.startsWith('local-')) { try { const r = await fetch('/_blob/' + id); if (r.ok) text = await r.text(); } catch (e) { } }
  if (text) { try { GR.customLuts[id] = parseCube(text); GR.key = ''; S.dirty = true; } catch (e) { } }
}
const loadedFonts = new Set();
async function loadFontFile(file) {
  const fam = file.name.replace(/\.(ttf|otf|woff2?|)$/i, '').replace(/[^\w\s-]/g, '').trim() || 'Fuente propia';
  const ext = (file.name.split('.').pop() || 'ttf').toLowerCase(); const type = { woff2: 'font/woff2', woff: 'font/woff', otf: 'font/otf' }[ext] || 'font/ttf';
  try {
    const ff = new FontFace(fam, await file.arrayBuffer()); await ff.load(); document.fonts.add(ff); loadedFonts.add(fam);
    let assetId = null; if (S.assets) { try { assetId = (await S.assets.upload(file, { type })).id; } catch (e) { } }
    mutate(p => { p.fonts = (p.fonts || []).filter(f => f.family !== fam).concat([{ family: fam, assetId }]); p.brand.display = fam; });
    toast(`Fuente "${fam}" lista. Ya es la tipografía de títulos.`);
  } catch (e) { toast('No se pudo cargar la fuente.'); }
}
function applyBrandFonts() {
  const P = S.p; if (!P) return;
  for (const f of P.fonts || []) {
    if (loadedFonts.has(f.family) || !f.assetId) continue; loadedFonts.add(f.family);
    const ff = new FontFace(f.family, `url(/_blob/${f.assetId})`); ff.load().then(x => { document.fonts.add(x); S.dirty = true; }).catch(() => { });
  }
  const B = P.brand;
  Promise.all([document.fonts.load(`${B.dw || 700} 40px "${B.display}"`), document.fonts.load(`500 40px "${B.body}"`), document.fonts.load(`700 40px "${B.body}"`), document.fonts.load(`600 40px "${B.body}"`)]).then(() => { S.dirty = true; renderThumbs(); }).catch(() => { });
}
