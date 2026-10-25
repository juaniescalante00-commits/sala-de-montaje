/* ============ estilos desde referencias, reglas propias y plantillas de After Effects ============ */
S.styles = [];
function startSettings() {
  if (!S.db) return;
  S.db.collection('styles').onSnapshot(snap => { S.styles = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })).filter(x => x.name).sort((a, b) => (b.created || 0) - (a.created || 0)); afterSettings(); }, () => { });
  S.db.collection('templates').onSnapshot(snap => { S.templates = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })).filter(x => x.assetId).sort((a, b) => String(a.name).localeCompare(b.name)); afterSettings(); }, () => { });
  S.db.collection('settings').onSnapshot(snap => {
    for (const d of snap.docs) { const v = d.data() || {}; if (d.id === 'sonidos') S.sfxKit = v.apto || null; if (d.id === 'reglas') { S.rules = { custom: Array.isArray(v.custom) ? v.custom : [], off: Array.isArray(v.off) ? v.off : [] }; S.rulesVersion = true; } }
    afterSettings();
  }, () => { });
}
function afterSettings() { if (S.p && S.mode === 'editor') { renderLeft(); if (S.sel) renderInspector(); } if (S.home) renderHome(); }
function styleOf(P) { return P?.styleId ? (S.styles || []).find(s => s.id === P.styleId) : null; }
async function saveRules(custom, off) {
  S.rules = { custom, off };
  if (S.db) { try { await S.db.doc('settings/reglas').set({ custom, off, updated: Date.now() }); } catch (e) { toast('No se pudieron guardar las reglas.'); } }
}

/* ---- aplicar un estilo al proyecto ---- */
function applyStyle(st, P) {
  const a = st?.perfil || {};
  if (a.marca) { const keep = P.brand; P.brand = Object.assign({}, BRANDS[0], keep, pickKeys(a.marca, ['display', 'body', 'dw', 'upper', 'track', 'bg', 'fg', 'accent', 'panel', 'radius'])); P.brand.key = 'estilo'; P.brand.name = st.name; fixBrandContrast(P.brand); if (!allFonts(P).includes(P.brand.display)) P.brand.display = keep.display; if (!allFonts(P).includes(P.brand.body)) P.brand.body = keep.body; }
  if (a.subtitulos) Object.assign(P.captions, pickKeys(a.subtitulos, ['on', 'style', 'pos', 'maxWords', 'size', 'upper']));
  if (!CAPS[P.captions.style]) P.captions.style = 'editorial';
  if (a.color) { Object.assign(P.grade, pickKeys(a.color, ['preset', 'mix', 'exposure', 'contrast', 'saturation', 'temperature', 'tint', 'fade', 'vignette', 'grain'])); normGrade(P.grade); if (!GRADES[P.grade.preset]) P.grade.preset = 'neutro'; }
  if (EASES[a.movimiento]) P.ease = a.movimiento;
  if (a.camara) { P.frame.follow = !!a.camara.seguirCara; if (a.camara.zoomBase) P.frame.followZoom = clamp(num(a.camara.zoomBase, 1.15), 1, 1.5); }
  P.styleId = st.id;
}
function pickKeys(o, keys) { const r = {}; for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) r[k] = o[k]; return r; }
function allFonts(P) { return FONTS.concat((P?.fonts || []).map(f => f.family)); }
function styleForAgent(P) {
  const st = styleOf(P); if (!st) return '';
  const a = st.perfil || {};
  return `ESTILO ELEGIDO: "${st.name}" (sacado de un video de referencia${st.src?.name ? ` "${st.src.name}"` : ''}). Replicalo lo más fiel posible.
Resumen: ${a.resumen || ''}
Receta: ${a.receta || ''}
Gráficos: ${JSON.stringify(a.graficos || {})}. Cámara: ${JSON.stringify(a.camara || {})}. Sonido: ${JSON.stringify(a.sonido || {})}.
${(a.reglas || []).length ? 'Reglas del estilo:\n' + a.reglas.map(r => '- ' + r).join('\n') : ''}
${st.instructions ? 'Indicaciones de quien edita sobre esta referencia: ' + st.instructions : ''}
${st.src ? `Ritmo de la referencia: ${st.src.cortes ?? '?'} cortes en ${Math.round(st.src.dur || 0)} s (plano promedio ${st.src.plano ?? '?'} s).` : ''}`;
}

/* ---- analizar una referencia ---- */
async function loadMediaEl(file) {
  const url = URL.createObjectURL(file);
  if (/^image\//.test(file.type)) { const img = new Image(); img.src = url; await img.decode(); return { kind: 'img', el: img, url, w: img.naturalWidth, h: img.naturalHeight }; }
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('No se pudo leer el video de referencia.')); setTimeout(() => rej(new Error('El video de referencia tardó demasiado en cargar.')), 30000); });
  return { kind: 'video', el: v, url, w: v.videoWidth, h: v.videoHeight, dur: v.duration };
}
function seekEl(v, t) { return new Promise(res => { if (Math.abs(v.currentTime - t) < 0.001) { res(); return; } const on = () => { v.removeEventListener('seeked', on); res(); }; v.addEventListener('seeked', on); v.currentTime = t; setTimeout(() => { v.removeEventListener('seeked', on); res(); }, 1500); }); }
function drawCover(ctx, el, w, h, x = 0, y = 0) {
  const sw = el.videoWidth || el.naturalWidth, sh = el.videoHeight || el.naturalHeight, s = Math.max(w / sw, h / sh);
  const dw = sw * s, dh = sh * s; ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
async function sheetOf(tiles, cols, tw, th) {
  const rows = Math.ceil(tiles.length / cols), c = document.createElement('canvas'); c.width = cols * tw; c.height = rows * th;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  tiles.forEach((t, i) => { x.drawImage(t.c, (i % cols) * tw, Math.floor(i / cols) * th, tw, th); if (t.label) { x.font = '600 18px Geist, sans-serif'; const lw = x.measureText(t.label).width + 12; x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect((i % cols) * tw + 6, Math.floor(i / cols) * th + 6, lw, 26); x.fillStyle = '#fff'; x.fillText(t.label, (i % cols) * tw + 12, Math.floor(i / cols) * th + 25); } });
  return await new Promise(r => c.toBlob(r, 'image/jpeg', .84));
}
function tileFrom(el, tw, th, label) { const c = document.createElement('canvas'); c.width = tw; c.height = th; drawCover(c.getContext('2d'), el, tw, th); return { c, label }; }
async function analyzeVideoRef(m, onProg) {
  const v = m.el, d = Math.min(v.duration || 0, 90), step = 1 / 4, sm = document.createElement('canvas'); sm.width = 36; sm.height = 64; const sx = sm.getContext('2d', { willReadFrequently: true });
  let prev = null; const diffs = [];
  for (let t = 0; t < d; t += step) {
    await seekEl(v, t); sx.drawImage(v, 0, 0, 36, 64); const px = sx.getImageData(0, 0, 36, 64).data; const g = new Float32Array(36 * 64);
    for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] * .3 + px[i * 4 + 1] * .59 + px[i * 4 + 2] * .11) / 255;
    if (prev) { let s = 0; for (let i = 0; i < g.length; i++) s += Math.abs(g[i] - prev[i]); diffs.push({ t, d: s / g.length }); }
    prev = g; onProg?.(t / d * 0.6);
  }
  const ds = diffs.map(x => x.d).sort((a, b) => a - b), med = ds[Math.floor(ds.length / 2)] || 0;
  const thr = Math.max(0.12, med * 4);
  const cuts = []; diffs.forEach((x, i) => { if (x.d > thr && (!cuts.length || x.t - cuts[cuts.length - 1] > 0.35)) cuts.push(x.t); });
  const shots = [0].concat(cuts).concat([d]); const lens = shots.slice(1).map((s, i) => s - shots[i]).filter(x => x > 0.05);
  const avgShot = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : d;
  // momentos con movimiento que no son cortes (gráficos animándose)
  const busy = diffs.filter(x => x.d > med * 1.8 && x.d < thr && !cuts.some(c => Math.abs(c - x.t) < 0.5)).sort((a, b) => b.d - a.d);
  const moments = []; for (const b of busy) { if (moments.every(m2 => Math.abs(m2 - b.t) > 2)) moments.push(b.t); if (moments.length >= 3) break; }
  const tw = 240, th = 427;
  const even = Array.from({ length: 12 }, (_, i) => (i + 0.5) * d / 12), tilesA = [];
  for (const t of even) { await seekEl(v, t); tilesA.push(tileFrom(v, tw, th, mmss(t) + (t % 1).toFixed(1).slice(1))); }
  onProg?.(0.7);
  let after = cuts.map(c => c + 0.25).filter(t => t < d); if (after.length > 12) after = Array.from({ length: 12 }, (_, i) => after[Math.floor(i * after.length / 12)]);
  const tilesB = []; for (const t of after) { await seekEl(v, t); tilesB.push(tileFrom(v, tw, th, 'corte ' + t.toFixed(1))); }
  const tilesC = []; for (const t0 of moments) for (let j = 0; j < 4; j++) { const t = Math.min(d - 0.05, t0 - 0.2 + j * 0.16); await seekEl(v, t); tilesC.push(tileFrom(v, tw, th, t.toFixed(2) + 's')); }
  onProg?.(0.85);
  // paleta: colores más frecuentes en los cuadros parejos
  const pal = paletteOf(tilesA.map(t => t.c));
  const sheets = [await sheetOf(tilesA, 4, tw, th)];
  if (tilesB.length >= 4) sheets.push(await sheetOf(tilesB, 4, tw, th));
  if (tilesC.length >= 4) sheets.push(await sheetOf(tilesC, 4, tw, th));
  return { sheets, stats: { dur: +d.toFixed(1), cortes: cuts.length, plano: +avgShot.toFixed(2), cortesPorMin: d ? Math.round(cuts.length / d * 60) : 0, momentosAnimados: moments.map(t => +t.toFixed(1)), paleta: pal }, w: m.w, h: m.h };
}
function paletteOf(canvases) {
  const buckets = new Map();
  for (const c of canvases) { const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4 * 37) { const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4); buckets.set(k, (buckets.get(k) || 0) + 1); } }
  return [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => '#' + [(k >> 8) & 15, (k >> 4) & 15, k & 15].map(v => (v * 16 + 8).toString(16).padStart(2, '0')).join(''));
}
function styleProfilePrompt(name, instr, stats, nImgs) {
  return `Sos director de arte y editor de video. Te paso ${nImgs} imágenes de un video de REFERENCIA que quien edita quiere copiar en sus próximos anuncios verticales 9:16${stats ? `:
- Hoja 1: 12 cuadros repartidos en todo el video, con su segundo.
- Hojas siguientes (si están): cuadros justo después de cada corte, y secuencias de 4 cuadros seguidos (0,16 s entre sí) en momentos donde hay gráficos animándose. Usá esas secuencias para deducir CÓMO entran y salen los textos y gráficos (máscara, escala, deslizamiento, tipeo, 3D, glitch, etc.).
Datos medidos: ${JSON.stringify(stats)}` : ' (son capturas o imágenes sueltas).'}
${instr ? `Indicaciones de quien edita: ${instr}` : ''}

Analizá el estilo de edición con ojo profesional (tipografía, jerarquía, colores, cajas o no, posición de textos, subtítulos, ritmo de cortes, zooms, movimiento de cámara, gráficos 2D o 3D, transiciones, color, y qué NO hace) y devolvé un perfil para replicarlo en un editor que tiene: piezas plantilla (${Object.keys(PRESETS).join(', ')}), pieza "codigo" para cualquier animación tipo After Effects, pieza "3d" con three.js, subtítulos por palabra, look de color, seguimiento de cara y zooms.
Fuentes disponibles: ${FONTS.join(', ')}. Estilos de subtítulos: ${Object.entries(CAPS).map(([k, v]) => `${k} (${v.name})`).join(', ')}. Looks: ${Object.entries(GRADES).map(([k, v]) => `${k} (${v.name})`).join(', ')}.
Respondé solo con JSON:
{"nombre":"${name || 'nombre corto del estilo'}","resumen":"2 o 3 frases","receta":"8 a 15 líneas concretas para replicarlo con este editor: qué piezas usar y cuándo, cómo entran (con tiempos y easing), tamaños y posición, colores, subtítulos, ritmo, cámara, sonido, y qué NO hacer",
"marca":{"display":"","body":"","dw":700,"upper":false,"track":0,"bg":"#hex","fg":"#hex","accent":"#hex","panel":"glass|solid|light","radius":24},
"subtitulos":{"on":true,"style":"","pos":"auto","maxWords":3,"size":1,"upper":false},
"color":{"preset":"","mix":1,"contrast":0,"saturation":0,"temperature":0,"grain":0,"vignette":0.1,"fade":0},
"movimiento":"expo|suave|seco","camara":{"seguirCara":false,"zoomBase":1,"punchIns":"ninguno|pocos|frecuentes"},
"graficos":{"densidad":"baja|media|alta","segundosEntrePiezas":6,"pantallasCompletas":true,"tipos":["..."],"estilo":"editorial|kinetic|3d|ui|minimal|..."},
"sonido":{"sfx":"ninguno|minimo|medio","musica":"qué tipo de música"},"reglas":["reglas propias de este estilo"]}
Color: preset uno de ${Object.keys(GRADES).join(', ')}. contrast, saturation y temperature van de −1 a 1 (0,08 = +8%; nunca escribas 8). mix, grain, vignette y fade van de 0 a 1. Ajustes sutiles: casi siempre entre −0,2 y 0,2.`;
}
async function createStyleFromRef(files, name, instructions, onProg) {
  if (!S.sample) throw new Error('Claude se activa al abrir el editor dentro de claude.ai.');
  const lim = await S.sample.limits().catch(() => null); if (!lim?.images) throw new Error('Esta vista no puede mandarle imágenes a Claude.');
  const maxImg = Math.min(lim.images.maxCount || 6, 6);
  const vids = files.filter(f => /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name)), imgs = files.filter(f => /^image\//.test(f.type));
  let sheets = [], stats = null, src = null;
  if (vids[0]) { const m = await loadMediaEl(vids[0]); try { const r = await analyzeVideoRef(m, onProg); sheets = r.sheets; stats = r.stats; src = Object.assign({ name: vids[0].name }, r.stats); } finally { URL.revokeObjectURL(m.url); } }
  const imgBlobs = [];
  for (const f of imgs.slice(0, Math.max(0, maxImg - sheets.length))) { const m = await loadMediaEl(f); const c = document.createElement('canvas'); const s = Math.min(1, 1280 / Math.max(m.w, m.h)); c.width = Math.round(m.w * s); c.height = Math.round(m.h * s); c.getContext('2d').drawImage(m.el, 0, 0, c.width, c.height); imgBlobs.push(await new Promise(r => c.toBlob(r, 'image/jpeg', .85))); URL.revokeObjectURL(m.url); }
  const all = sheets.concat(imgBlobs).slice(0, maxImg); if (!all.length) throw new Error('Subí un video o imágenes de referencia.');
  onProg?.(0.9);
  const perfil = await S.sample.json(styleProfilePrompt(name, instructions, stats, all.length), { images: all });
  // guardar las hojas para que Claude las vea en cada edición
  const refs = [];
  if (S.assets) for (const b of all.slice(0, 3)) { try { refs.push((await S.assets.upload(b, { type: 'image/jpeg' })).id); } catch (e) { } }
  // el video de referencia completo queda guardado: Claude Code lo estudia cuadro por cuadro en cada edición a fondo
  let video = null;
  if (S.assets && vids[0] && vids[0].size < 120e6) { try { video = (await S.assets.upload(vids[0], { type: vids[0].type || 'video/mp4' })).id; } catch (e) { console.warn('referencia', e); } }
  if (perfil?.color) normGrade(perfil.color);
  const id = 'e' + Date.now().toString(36) + uid().slice(0, 3);
  const doc = { name: String(name || perfil?.nombre || 'Estilo').slice(0, 60), created: Date.now(), instructions: String(instructions || ''), perfil, refs, src, video };
  if (S.db) await S.db.doc('styles/' + id).set(doc);
  S.styles = [Object.assign({ id }, doc)].concat(S.styles.filter(s => s.id !== id));
  onProg?.(1);
  return Object.assign({ id }, doc);
}

/* ---- diálogo "nuevo estilo desde una referencia" ---- */
function openStyleDialog() {
  const dlg = $('#styleDlg'); S.refFiles = [];
  $('#sdName').value = ''; $('#sdInstr').value = ''; $('#sdFiles').textContent = 'Ningún archivo'; $('#sdGo').disabled = false; $('#sdMsg').textContent = ''; $('#sdBar').hidden = true;
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function wireStyleDialog() {
  const dlg = $('#styleDlg');
  $('#sdPick').addEventListener('click', () => { const inp = $('#fileAny'); inp.accept = 'video/*,image/*'; inp.multiple = true; inp.value = ''; inp.onchange = () => { S.refFiles = [...inp.files].slice(0, 5); inp.multiple = false; $('#sdFiles').textContent = S.refFiles.map(f => f.name).join(', ') || 'Ningún archivo'; }; inp.click(); });
  $('#sdCancel').addEventListener('click', () => dlg.close ? dlg.close() : dlg.removeAttribute('open'));
  $('#sdGo').addEventListener('click', async () => {
    if (!S.refFiles?.length) { $('#sdMsg').textContent = 'Elegí el video (o capturas) de referencia.'; return; }
    $('#sdGo').disabled = true; $('#sdBar').hidden = false; $('#sdMsg').textContent = 'Mirando la referencia cuadro por cuadro…';
    const bar = $('#sdBar i');
    try {
      const st = await createStyleFromRef(S.refFiles, $('#sdName').value.trim(), $('#sdInstr').value.trim(), p => { bar.style.width = Math.round(p * 100) + '%'; if (p >= 0.9) $('#sdMsg').textContent = 'Claude está analizando el estilo…'; });
      if (S.p) { mutate(p => applyStyle(st, p)); applyBrandFonts(); }
      S.pendingStyle = st.id;
      dlg.close ? dlg.close() : dlg.removeAttribute('open');
      toast(`Estilo "${st.name}" guardado${S.p ? ' y aplicado a este proyecto' : ''}. Se usa en cada edición.`, 6000);
      if (S.home) renderHome(); else renderLeft();
    } catch (e) { $('#sdMsg').textContent = e?.code ? sampleErr(e) : (e.message || 'No se pudo analizar la referencia.'); $('#sdGo').disabled = false; }
  });
}

/* ---- plantillas de After Effects ---- */
async function uploadTemplate(file) {
  try {
    const text = await file.text(); const j = JSON.parse(text);
    if (!j.layers || !j.w || !j.h) throw new Error('Ese .json no es una animación Lottie de Bodymovin.');
    if (!S.assets) throw new Error('Para guardar plantillas abrí el editor dentro de claude.ai.');
    if (text.length > 14 * 1024 * 1024) throw new Error('La plantilla pesa más de 14 MB. Exportala sin imágenes incrustadas o más liviana.');
    let r; try { r = await S.assets.upload(new Blob([text], { type: 'application/json' }), { type: 'application/json' }); } catch (e) { r = await S.assets.upload(new Blob([text], { type: 'text/plain' }), { type: 'text/plain' }); }
    const id = 't' + Date.now().toString(36) + uid().slice(0, 3);
    const doc = { name: (j.nm || file.name.replace(/\.json$/i, '')).slice(0, 60), assetId: r.id, w: j.w, h: j.h, fr: j.fr, dur: +((j.op - j.ip) / (j.fr || 30)).toFixed(2), textos: lottieTexts(j).slice(0, 20), created: Date.now() };
    if (S.db) await S.db.doc('templates/' + id).set(doc);
    S.templates = (S.templates || []).concat([Object.assign({ id }, doc)]); tplData.set(id, j);
    toast(`Plantilla "${doc.name}" lista (${doc.textos.length} textos editables).`);
    renderLeft();
  } catch (e) { toast(e.message || 'No se pudo cargar la plantilla.', 6000); }
}
function templatesForAgent() {
  const ts = S.templates || []; if (!ts.length) return '(no hay plantillas cargadas)';
  return ts.map(t => `${t.id}: "${t.name}" ${t.w}×${t.h}, ${t.dur}s, textos: ${t.textos.map(x => `"${x.nm}" (ahora: ${JSON.stringify(String(x.t).slice(0, 40))})`).join(', ') || 'ninguno'}`).join('\n');
}

/* ---- pestaña Estilo ---- */
function styleTabHTML() {
  const P = S.p, st = styleOf(P), sts = S.styles || [];
  const lr = S.lastRules;
  return `<div class="sec">
    <div class="sec-head"><h3>Estilo de este video</h3>${st ? '<button class="btn sm ghost" type="button" id="stNone">Quitar</button>' : ''}</div>
    <select id="stSel" aria-label="Estilo"><option value="">Sin estilo de referencia</option>${sts.map(s => `<option value="${esc(s.id)}" ${P.styleId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    ${st ? `<p class="hint" style="color:var(--muted)">${esc(st.perfil?.resumen || '')}</p>${(st.refs || []).length ? `<div class="refthumbs">${st.refs.slice(0, 3).map(id => `<img src="/_blob/${esc(id)}" alt="Referencia">`).join('')}</div>` : ''}<button class="btn sm" type="button" id="stApply">Volver a aplicar fuentes, colores y subtítulos</button>` : '<p class="hint">Con un estilo, Claude copia el ritmo, la tipografía, los colores y el tipo de gráficos de una referencia.</p>'}
    <button class="btn claude" type="button" id="stNew">Nuevo estilo desde una referencia</button>
  </div>
  <div class="sec">
    <div class="sec-head"><h3>Reglas que nunca se rompen</h3><button class="btn sm" type="button" id="ruRun">Revisar ahora</button></div>
    <ul class="rules">${RULES.map(r => `<li><label class="chk"><input type="checkbox" data-rule="${r.id}" ${ruleOn(r.id) ? 'checked' : ''} ${r.fija ? 'disabled' : ''}> <span><b>${esc(r.t)}</b>${r.auto ? ' <span class="tag">automática</span>' : ''}<br><span class="hint">${esc(r.d)}</span></span></label></li>`).join('')}</ul>
    <label class="f">Tus reglas (una por línea; Claude las cumple siempre)<textarea id="ruCustom" rows="4" placeholder="Ej.: Nunca usar fondos blancos. Los números siempre en verde.">${esc((S.rules.custom || []).join('\n'))}</textarea></label>
    <button class="btn sm" type="button" id="ruSave">Guardar reglas</button>
    ${lr ? `<div class="rulelog"><div class="eyebrow">Última revisión · ${new Date(lr.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>${lr.fixes.length || lr.warns.length ? '' : '<p class="hint">Todo cumple.</p>'}${lr.fixes.map(f => `<p class="ok">✓ ${esc(f)}</p>`).join('')}${lr.warns.map(f => `<p class="warn">! ${esc(f)}</p>`).join('')}</div>` : ''}
  </div>
  <div class="sec">
    <div class="sec-head"><h3>Plantillas de After Effects</h3><span class="hint mono">${(S.templates || []).length}</span></div>
    <p class="hint">Animá en After Effects, exportá con el plugin gratis Bodymovin (o desde LottieFiles) como .json y subilo. Claude la usa como pieza y le cambia los textos.</p>
    ${(S.templates || []).map(t => `<div class="librow"><span class="ln">${esc(t.name)}<span class="hint">${t.w}×${t.h} · ${t.dur}s · ${t.textos.length} textos</span></span><button class="btn sm" type="button" data-tpladd="${esc(t.id)}">Usar</button></div>`).join('')}
    <button class="btn sm" type="button" id="tplUp">Subir plantilla (.json)</button>
  </div>`;
}
function wireStyleTab(body) {
  const on = (sel, fn, ev = 'click') => body.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
  on('#stSel', e => { const st = (S.styles || []).find(s => s.id === e.target.value); mutate(p => { if (st) applyStyle(st, p); else delete p.styleId; }); applyBrandFonts(); }, 'change');
  on('#stNone', () => mutate(p => { delete p.styleId; }));
  on('#stApply', () => { const st = styleOf(S.p); if (st) { mutate(p => applyStyle(st, p)); applyBrandFonts(); toast('Estilo aplicado.'); } });
  on('#stNew', openStyleDialog);
  on('#ruRun', () => { runRules(false); renderLeft(); });
  on('[data-rule]', e => { const id = e.target.dataset.rule; const off = new Set(S.rules.off || []); e.target.checked ? off.delete(id) : off.add(id); saveRules(S.rules.custom || [], [...off]); });
  on('#ruSave', () => { const lines = $('#ruCustom').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40); saveRules(lines, S.rules.off || []); toast('Reglas guardadas: valen para todos los videos.'); });
  on('#tplUp', () => pickFile('.json,application/json', f => uploadTemplate(f)));
  on('[data-tpladd]', e => { const t = tplItem(e.currentTarget.dataset.tpladd); if (!t) return; addMotion('plantilla'); mutate(p => { const m = p.motions.find(x => x.id === S.sel); if (m) { m.params.tpl = t.id; m.params.textos = Object.fromEntries(t.textos.map(x => [x.nm, x.t])); m.dur = Math.max(1.5, Math.min(t.dur || 3, p.duration - m.start)); } }); });
}
