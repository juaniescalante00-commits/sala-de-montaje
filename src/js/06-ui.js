/* ============ interfaz: general ============ */
const VID = $('#vid');
let toastT = 0;
function toast(msg, ms = 3800) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, ms); }
function getPath(o, path) { return path.split('.').reduce((a, k) => a == null ? a : a[k], o); }
function setPath(o, path, v) { const ks = path.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }
function parsePairs(text, keys) { return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const parts = l.split('|').map(s => s.trim()); const o = {}; keys.forEach((k, i) => { o[k] = k === 'value' ? num(parts[i]) : (parts[i] ?? ''); }); return o; }); }
function pairsText(arr, keys) { return (arr || []).map(o => keys.map(k => o[k] ?? '').join(' | ')).join('\n'); }
function selM() { return S.p?.motions.find(m => m.id === S.sel) || null; }
function sortedMotions() { return (S.p?.motions || []).slice().sort((a, b) => a.start - b.start); }
function headline(m) { const p = m.params || {}; if (m.type === 'contador') return `${fmtNum(p.value, p.decimals, p.prefix, p.suffix)} ${p.label || ''}`.trim(); if (m.type === 'progreso') return `${num(p.value)}% ${p.label || ''}`.trim(); return p.title || p.label || p.text || p.name || (p.cards && p.cards[0]?.title) || (p.from ? `${p.from} → ${p.to}` : '') || p.initials || PRESETS[m.type].name; }
const LAYOUT_NAME = { overlay: 'Sobre el video', full: 'Pantalla completa' };

function bindInputs(root, getTarget, panelName) {
  root.querySelectorAll('[data-bind]').forEach(el => {
    const path = el.dataset.bind, typ = el.dataset.type || 'str';
    const read = () => typ === 'json' ? (() => { try { const v = JSON.parse(el.value); el.style.borderColor = ''; return v; } catch (e) { el.style.borderColor = 'var(--bad)'; return undefined; } })() : typ === 'num' ? num(el.value) : typ === 'bool' ? el.checked : typ === 'lines' ? el.value.split('\n').map(s => s.trim()).filter(Boolean) : typ === 'pairs' ? parsePairs(el.value, el.dataset.keys.split(',')) : el.value;
    const ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const v = read(); if (v === undefined) return; const out = el.parentElement.querySelector('output'); if (out) out.textContent = fmtOut(v, el.dataset.fmt);
      mutate(p => { const tgt = getTarget(p); if (tgt) setPath(tgt, path, v); if (el.dataset.after) AFTER[el.dataset.after]?.(p, tgt); }, { coalesce: panelName + ':' + path, skip: el.dataset.rerender ? null : panelName });
    });
  });
}
function fmtOut(v, f) { if (f === 'pct') return Math.round(v * 100) + '%'; if (f === 'x') return (+v).toFixed(2) + '×'; if (f === 's') return (+v).toFixed(2) + ' s'; if (f === 'ev') return ((v > 0 ? '+' : '') + (+v).toFixed(2)); return typeof v === 'number' ? (+v).toFixed(2) : v; }
const AFTER = {
  quote: (p, m) => { if (m && !m._quoteEdited) m.quote = quoteFor(p, m); },
  duration: p => { if (!p.video) { const end = Math.max(0, ...p.motions.map(m => m.start + m.dur), ...(p.words || []).map(w => w.e)); if (p.duration < end) p.duration = +end.toFixed(2); } fitTimeline(); },
  words: p => { p._wv = (p._wv || 0) + 1; },
};
function rangeF(label, path, min, max, step, val, fmt, extra = '') { return `<label class="f">${label}<div class="row"><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-bind="${path}" data-type="num" data-fmt="${fmt || ''}" ${extra}><output class="mono" style="min-width:52px;text-align:right">${fmtOut(val, fmt)}</output></div></label>`; }
function selectF(label, path, opts, val, extra = '') { return `<label class="f">${label}<select data-bind="${path}" ${extra}>${opts.map(([v, n]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`; }
function textF(label, path, val, extra = '') { return `<label class="f">${label}<input type="text" data-bind="${path}" value="${esc(val)}" ${extra}></label>`; }
function areaF(label, path, val, rows = 2, extra = '') { return `<label class="f">${label}<textarea rows="${rows}" data-bind="${path}" ${extra}>${esc(val)}</textarea></label>`; }
function checkF(label, path, val, extra = '') { return `<label class="chk"><input type="checkbox" data-bind="${path}" data-type="bool" ${val ? 'checked' : ''} ${extra}> ${label}</label>`; }

function refreshUI(skip) {
  if (S.home) renderHome();
  if (!S.p) return;
  updateClaudePill();
  if (S.mode === 'editor') { if (skip !== 'left') renderLeft(); if (skip !== 'inspector') renderInspector(); renderTimeline(); }
  else if (S.mode === 'review') renderReview(skip);
  else if (S.mode === 'export') { if (skip !== 'export') renderExport(); }
  $('#btnUndo').disabled = !S.undo.length; $('#btnRedo').disabled = !S.redo.length;
  S.dirty = true;
}
function renderProjSel() {
  const sel = $('#projSel'); const cur = S.p?.id;
  const list = S.projects.slice(); if (S.p && !list.find(p => p.id === S.p.id)) list.unshift(S.p);
  sel.innerHTML = list.map(p => `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.id === cur ? S.p.name : p.name)}</option>`).join('') || '<option>Sin proyectos</option>';
}
function updateClaudePill() {
  const el = $('#claudeState'); const on = !!S.sample;
  el.className = 'pill ' + (on ? 'acc' : ''); el.lastElementChild.textContent = on ? 'Claude conectado' : 'Claude: solo dentro de claude.ai';
}
function setMode(mode) {
  S.mode = mode;
  $$('.modes button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#view-editor').hidden = mode !== 'editor'; $('#view-review').hidden = mode !== 'review'; $('#view-export').hidden = mode !== 'export';
  if (mode === 'review') { pause(); mountStage($('#rvStage')); if (!S.rvSel && S.p?.motions.length) S.rvSel = sortedMotions()[0].id; const m = rvCurrent(); if (m) seek(m.start + Math.min(m.dur * .72, m.dur - .4)); }
  else if (mode === 'editor') mountStage($('#stageWrap'));
  refreshUI();
}

/* ============ escenario ============ */
const STAGE = $('#stage'), SCTX = STAGE.getContext('2d');
let stageRO = null, stageHost = null;
function mountStage(host) {
  if (stageHost === host) return; stageHost = host; host.appendChild(STAGE);
  if (stageRO) stageRO.disconnect(); stageRO = new ResizeObserver(sizeStage); stageRO.observe(host); sizeStage();
}
function sizeStage() {
  if (!stageHost) return; const r = stageHost.getBoundingClientRect(); const aw = Math.max(80, r.width - 28), ah = Math.max(120, r.height - 28);
  let ch = Math.min(ah, aw * 16 / 9), cw = ch * 9 / 16;
  STAGE.style.width = Math.round(cw) + 'px'; STAGE.style.height = Math.round(ch) + 'px';
  const dpr = window.devicePixelRatio || 1, pw = Math.min(1080, Math.round(cw * dpr / 2) * 2);
  if (STAGE.width !== pw) { STAGE.width = pw; STAGE.height = Math.round(pw * 16 / 9); }
  S.dirty = true;
}
function draw() {
  if (!S.p) { SCTX.fillStyle = '#000'; SCTX.fillRect(0, 0, STAGE.width, STAGE.height); return; }
  const src = S.videoReady ? VID : null;
  composeFrame(SCTX, S.t, { source: src, sw: VID.videoWidth, sh: VID.videoHeight, guides: true, frameNo: Math.round(S.t * (S.p.fps || 30)) });
}

/* ============ reproducción ============ */
function play() {
  if (!S.p) return; if (S.t >= S.p.duration - 0.05) seek(0);
  S.playing = true; liveCtx();
  if (S.videoReady) { try { VID.currentTime = S.t; } catch (e) { } VID.play().catch(() => { S.playing = false; updatePlayBtn(); }); }
  else S.clock0 = performance.now() - S.t * 1000;
  musicSync(true); updatePlayBtn();
}
function pause() { S.playing = false; try { VID.pause(); } catch (e) { } musicSync(false); updatePlayBtn(); }
function seek(t) { if (!S.p) return; S.t = clamp(t, 0, S.p.duration || 0); if (S.videoReady) { try { VID.currentTime = S.t; } catch (e) { } } if (!S.videoReady) S.clock0 = performance.now() - S.t * 1000; if (S.playing) musicSync(true); S.dirty = true; }
function togglePlay() { S.reviewStop = null; S.playing ? pause() : play(); }
function updatePlayBtn() { const b = $('#btnPlay'); b.textContent = S.playing ? '❚❚' : '▶'; b.setAttribute('aria-label', S.playing ? 'Pausa' : 'Reproducir'); }
let lastWordIdx = -2, lastRvMotion = null;
function tick() {
  if (S.p && S.playing) {
    if (S.videoReady) { S.t = VID.currentTime; if (VID.ended || S.t >= S.p.duration - 0.01) pause(); }
    else { S.t = (performance.now() - S.clock0) / 1000; if (S.t >= S.p.duration) { S.t = S.p.duration; pause(); } }
    const m = selM(); if (S.loop && m && S.mode === 'editor' && S.t > m.start + m.dur + 0.15) seek(Math.max(0, m.start - 0.25));
    if (S.reviewStop != null && S.t >= S.reviewStop) { pause(); S.reviewStop = null; }
    S.dirty = true;
  }
  audioTick(S.t, S.playing);
  if (S.dirty && !EX.running) { S.dirty = false; try { draw(); } catch (e) { console.error(e); } updateTimeUI(); }
  requestAnimationFrame(tick);
}
function updateTimeUI() {
  if (!S.p) return;
  $('#tcNow').innerHTML = `${tc(S.t, S.p.fps)} <span>/ ${mmss(S.p.duration)}</span>`;
  $('#playhead').style.transform = `translateX(${S.t * S.pps}px)`;
  if (S.playing) { const sc = $('#tlScroll'), x = S.t * S.pps; if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = x - 60; }
  if (S.mode === 'editor' && S.tab === 'text') {
    const ws = S.p.words || []; let lo = 0, hi = ws.length - 1, idx = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (ws[mid].s <= S.t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    if (idx !== lastWordIdx) { $$('#wordsBox span.on').forEach(e => e.classList.remove('on')); const el = $(`#wordsBox span[data-i="${idx}"]`); if (el) { el.classList.add('on'); if (S.playing) el.scrollIntoView({ block: 'nearest' }); } lastWordIdx = idx; }
  }
  if (S.mode === 'review') {
    const cur = sortedMotions().find(m => S.t >= m.start && S.t < m.start + m.dur);
    if (S.rvFollow && cur && cur.id !== S.rvSel) { S.rvSel = cur.id; renderReview(); }
    const ms = sortedMotions(), i = ms.findIndex(m => m.id === S.rvSel);
    $('#rvTc').textContent = `Motion ${pad2(i + 1)} / ${pad2(ms.length)} · TC ${mmss(ms[i]?.start || 0)}`;
  }
}

/* ============ panel izquierdo ============ */
function renderLeft() {
  const body = $('#leftBody'), P = S.p;
  $$('#leftTabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  const parts = { lib: () => JSON.stringify(P.brand) + P.ease + (S.sample ? 1 : 0) + !!S.busy.plan + (P.words?.length || 0) + P.motions.length,
    text: () => JSON.stringify(P.transcribe || null) + JSON.stringify(P.captions) + (P._wv || 0) + (P.words?.length || 0) + JSON.stringify(S.wordSel) + !!S.busy.fix + (S.sample ? 1 : 0) + P.name + !!P.video?.assetId,
    brand: () => JSON.stringify(P.brand) + P.ease + (P.fonts || []).length,
    color: () => JSON.stringify(P.grade) + JSON.stringify(P.frame),
    audio: () => JSON.stringify(P.audio) + JSON.stringify(P.music) + !!S.voiceBuf + (S.library || []).length + '|' + (S.libQ || '') + '|' + (S.libF || '') + !!S.libMore,
    estilo: () => (S.styles || []).length + '|' + (P.styleId || '') + JSON.stringify(S.rules) + (S.templates || []).length + '|' + (S.lastRules?.at || 0),
    claude: () => (P.chat || []).length + '|' + !!S.busy.agent + (S.sample ? 1 : 0) + (P.words?.length || 0) + JSON.stringify(P.transcribe || null) + !!P.video?.assetId + JSON.stringify(deepState(P) || null) };
  const key = S.tab + '|' + P.id + '|' + (parts[S.tab] ? parts[S.tab]() : '');
  if (body.dataset.key === key) return;
  body.dataset.key = key;
  if (S.tab === 'claude') body.innerHTML = agentHTML();
  else if (S.tab === 'estilo') body.innerHTML = styleTabHTML();
  else if (S.tab === 'lib') body.innerHTML = libHTML();
  else if (S.tab === 'text') body.innerHTML = textHTML();
  else if (S.tab === 'brand') body.innerHTML = brandHTML();
  else if (S.tab === 'color') body.innerHTML = colorHTML();
  else if (S.tab === 'audio') body.innerHTML = audioHTML();
  bindInputs(body, p => p, 'left');
  wireLeft(body); if (S.tab === 'claude') wireAgent(body); if (S.tab === 'estilo') wireStyleTab(body);
  if (S.tab === 'lib') renderThumbs();
  lastWordIdx = -2;
}
function claudeNote() { return S.sample ? '' : '<p class="hint">Las funciones con Claude se activan al abrir este editor dentro de claude.ai.</p>'; }
function libHTML() {
  const P = S.p, hasWords = !!P.words?.length;
  return `<div class="sec">
    <div class="sec-head"><h3>Planificar con Claude</h3>${S.busy.plan ? '<span class="busy" aria-label="Trabajando"></span>' : ''}</div>
    <p class="hint">Claude lee la transcripción con sus tiempos y arma las piezas: qué dice, qué se mueve y en qué segundo entra cada elemento.</p>
    <label class="f">Indicaciones (opcional)<textarea id="planHint" rows="2" placeholder="Ej.: máximo 6 piezas, sobrio, una pantalla completa para el cierre">${esc(S.planHint || '')}</textarea></label>
    <div class="row"><button class="btn claude" id="btnPlan" type="button" ${!S.sample || !hasWords || S.busy.plan ? 'disabled' : ''}>${S.busy.plan ? 'Planificando…' : (P.motions.length ? 'Volver a planificar' : 'Planificar motions')}</button>
    ${S.busy.plan ? '<button class="btn ghost sm" id="btnPlanStop" type="button">Detener</button>' : ''}</div>
    ${!hasWords ? '<p class="hint">Primero hace falta la transcripción (pestaña Texto).</p>' : ''}${claudeNote()}
    <p class="hint" id="planOut"></p>
  </div>
  <div class="sec"><div class="sec-head"><h3>Biblioteca</h3><span class="hint">se agrega en el cabezal</span></div>
    <div class="lib">${Object.values(PRESETS).map(pr => `<button type="button" data-add="${pr.key}" title="${esc(pr.desc)}"><canvas width="180" height="320" data-thumb="${pr.key}"></canvas><span class="n">${esc(pr.name)}</span><span class="d">${esc(pr.desc)}</span></button>`).join('')}</div>
  </div>`;
}
function renderThumbs() {
  if (!S.p) return;
  $$('canvas[data-thumb]').forEach(c => {
    const key = c.dataset.thumb, pr = PRESETS[key]; const m = sanitizeMotion({ type: key, start: 0, dur: 6, layout: ['bento', 'linea', 'cta'].includes(key) ? 'full' : 'overlay', pos: 'centro' });
    const ctx = c.getContext('2d'); const fake = Object.assign({}, S.p, { words: [], faces: [] });
    composeFrame(ctx, 5.0, { P: fake, motions: [m], captions: false });
  });
}
function textHTML() {
  const P = S.p, c = P.captions, ws = P.words || [];
  let words = ''; let lastSeg = -99;
  ws.forEach((w, i) => { if (w.s - lastSeg > 6 || (i && ws[i - 1].e < w.s - 0.9)) { words += `<span class="ts" data-seek="${w.s}">${mmss(w.s)}</span>`; lastSeg = w.s; } words += `<span data-i="${i}" class="${S.wordSel && i >= S.wordSel[0] && i <= S.wordSel[1] ? 'sel' : ''}">${esc(w.w)}</span>`; });
  const selTxt = S.wordSel ? ws.slice(S.wordSel[0], S.wordSel[1] + 1).map(w => w.w).join(' ') : '';
  return `<div class="sec">
    <div class="sec-head"><h3>Subtítulos</h3>${checkF('Activados', 'captions.on', c.on)}</div>
    <div class="chips">${Object.entries(CAPS).map(([k, v]) => `<button type="button" class="chip" data-capstyle="${k}" aria-pressed="${c.style === k}">${v.name}</button>`).join('')}</div>
    <div class="grid2">${selectF('Posición', 'captions.pos', [['auto', 'Auto (evita la cara)'], ['abajo', 'Abajo segura'], ['centro', 'Centro'], ['arriba', 'Arriba']], c.pos)}${selectF('Palabras por bloque', 'captions.maxWords', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], c.maxWords, 'data-type="num"')}</div>
    ${rangeF('Tamaño', 'captions.size', .7, 1.4, .05, c.size, 'x')}
    ${c.pos === 'auto' || c.pos === 'abajo' ? rangeF('Altura (auto)', 'captions.y', .45, .64, .01, c.y, 'pct') : ''}
    <div class="row" style="flex-wrap:wrap;gap:14px">${checkF('Mayúsculas', 'captions.upper', c.upper)}${checkF('Ocultar en pantallas completas', 'captions.hideOnFull', c.hideOnFull)}</div>
  </div>
  <div class="sec">
    <div class="sec-head"><h3>Transcripción</h3><span class="hint mono">${ws.length} palabras</span></div>
    ${transcribeBanner()}
    <div class="row" style="flex-wrap:wrap"><button class="btn sm" id="btnImportTr" type="button">Importar .srt / .vtt / .json / .txt</button>
    <button class="btn sm claude" id="btnFixWords" type="button" ${!S.sample || !ws.length || S.busy.fix ? 'disabled' : ''}>${S.busy.fix ? 'Corrigiendo…' : 'Corregir con Claude'}</button></div>
    <details><summary class="hint" style="cursor:pointer">Transcribir con Claude (en el chat)</summary>
      <p class="hint">La transcripción palabra por palabra la hace Claude en el chat con Whisper. Copiá esto y pegalo en la conversación:</p>
      <div class="copybox" id="trCmd">Sala de Montaje: transcribí el video del proyecto "${esc(P.name)}" (id ${esc(P.id)}) con tiempos por palabra y cargá las palabras en el proyecto.</div>
      <button class="btn sm" type="button" data-copy="#trCmd">Copiar</button>
      ${P.video && !P.video.assetId ? '<p class="hint">Para que Claude lo lea, el video tiene que estar guardado en el proyecto (ver panel derecho).</p>' : ''}
    </details>
    ${S.wordSel ? `<div class="card" style="padding:10px;display:flex;flex-direction:column;gap:8px"><div class="hint">Selección: “${esc(selTxt.slice(0, 120))}”</div><div class="row"><select id="selType">${Object.values(PRESETS).map(p => `<option value="${p.key}">${esc(p.name)}</option>`).join('')}</select><button class="btn sm pri" id="btnFromSel" type="button">Crear pieza</button><button class="btn sm ghost" id="btnClearSel" type="button">Quitar</button></div></div>` : ''}
    <p class="hint">Clic: ir a la palabra. Shift+clic: seleccionar un tramo. Doble clic: corregir la palabra.</p>
    <div class="words" id="wordsBox">${words || '<span class="hint">Todavía no hay transcripción.</span>'}</div>
  </div>`;
}
function brandHTML() {
  const P = S.p, B = P.brand, fonts = FONTS.concat((P.fonts || []).map(f => f.family));
  return `<div class="sec"><h3>Kits de marca</h3>
    <div class="grid2">${BRANDS.map(k => `<button type="button" class="swatch" data-brand="${k.key}" aria-pressed="${B.key === k.key}"><i style="background:linear-gradient(135deg,${k.bg} 50%,${k.accent} 50%)"></i><span><b style="font-weight:600">${esc(k.name)}</b><br><span class="hint">${esc(k.display)}</span></span></button>`).join('')}</div>
  </div>
  <div class="sec"><h3>Tipografía</h3>
    ${selectF('Títulos', 'brand.display', fonts.map(f => [f, f]), B.display, 'data-after="fonts"')}
    ${selectF('Texto', 'brand.body', fonts.map(f => [f, f]), B.body, 'data-after="fonts"')}
    <div class="grid2">${selectF('Peso títulos', 'brand.dw', [[400, 'Regular'], [500, 'Medio'], [600, 'Semi'], [700, 'Negrita'], [800, 'Extra']], B.dw, 'data-type="num" data-after="fonts"')}${selectF('Movimiento', 'ease', Object.entries(EASE_NAMES), P.ease)}</div>
    ${rangeF('Interletra títulos', 'brand.track', -4, 4, .5, B.track ?? 0, '')}
    ${checkF('Títulos en mayúsculas', 'brand.upper', B.upper)}
    <button class="btn sm" id="btnFont" type="button">Subir fuente propia (.ttf .otf .woff2)</button>
  </div>
  <div class="sec"><h3>Colores y paneles</h3>
    <div class="grid3">${[['bg', 'Fondo'], ['fg', 'Texto'], ['accent', 'Acento']].map(([k, n]) => `<label class="f">${n}<input type="color" data-bind="brand.${k}" value="${esc(B[k])}"></label>`).join('')}</div>
    ${selectF('Estilo de panel', 'brand.panel', [['glass', 'Vidrio esmerilado'], ['solid', 'Sólido'], ['light', 'Claro con sombra']], B.panel)}
    ${rangeF('Radio de esquinas', 'brand.radius', 0, 48, 1, B.radius, '')}
  </div>`;
}
function colorHTML() {
  const P = S.p, g = P.grade, fr = P.frame;
  return `<div class="sec"><h3>Look</h3>
    <div class="grid2">${Object.entries(GRADES).map(([k, v]) => `<button type="button" class="swatch" data-grade="${k}" aria-pressed="${g.preset === k}"><i style="background:linear-gradient(135deg,${v.sw[0]},${v.sw[1]})"></i><span>${esc(v.name)}</span></button>`).join('')}
    ${g.lutAssetId ? `<button type="button" class="swatch" data-grade="custom" aria-pressed="${g.preset === 'custom'}"><i style="background:conic-gradient(#e66,#6e6,#66e,#e66)"></i><span>${esc(g.lutName || 'LUT propio')}</span></button>` : ''}</div>
    ${rangeF('Intensidad del look', 'grade.mix', 0, 1, .01, g.mix, 'pct')}
    <button class="btn sm" id="btnCube" type="button">Cargar LUT .cube</button>
  </div>
  <div class="sec"><h3>Ajustes</h3>
    ${rangeF('Exposición', 'grade.exposure', -1, 1, .01, g.exposure, 'ev')}
    ${rangeF('Contraste', 'grade.contrast', -1, 1, .01, g.contrast, 'ev')}
    ${rangeF('Saturación', 'grade.saturation', -1, 1, .01, g.saturation, 'ev')}
    ${rangeF('Temperatura', 'grade.temperature', -1, 1, .01, g.temperature, 'ev')}
    ${rangeF('Tinte', 'grade.tint', -1, 1, .01, g.tint, 'ev')}
    ${rangeF('Negros levantados', 'grade.fade', 0, 1, .01, g.fade, 'pct')}
    ${rangeF('Viñeta', 'grade.vignette', 0, 1, .01, g.vignette, 'pct')}
    ${rangeF('Grano', 'grade.grain', 0, 1, .01, g.grain, 'pct')}
    <button class="btn sm ghost" id="btnResetGrade" type="button">Restablecer ajustes</button>
    ${GR.ok ? '' : '<p class="hint">Este navegador no tiene WebGL2: el color usa un modo simple sin LUTs.</p>'}
  </div>
  <div class="sec"><h3>Encuadre 9:16</h3>
    <p class="hint">Para videos horizontales o para reencuadrar: acercá y mové el cuadro.</p>
    ${rangeF('Zoom', 'frame.zoom', 1, 2.5, .01, fr.zoom, 'x')}
    ${rangeF('Horizontal', 'frame.x', -1, 1, .01, fr.x, '')}
    ${rangeF('Vertical', 'frame.y', -1, 1, .01, fr.y, '')}
  </div>`;
}
function audioHTML() {
  const P = S.p, a = P.audio, mu = P.music;
  return libraryHTML() + `<div class="sec"><h3>Voz (audio del video)</h3>
    ${rangeF('Volumen', 'audio.voice', 0, 2, .01, a.voice, 'x')}
    <p class="hint">${S.voiceBuf ? 'Audio leído: ' + mmss(S.voiceBuf.duration) + '. Se usa para la forma de onda y para bajar la música cuando hablan.' : P.video ? 'Leyendo el audio del video…' : 'Sin video cargado.'}</p>
  </div>
  <div class="sec"><h3>Música</h3>
    ${checkF('El video ya trae música (no agregar otra)', 'audio.rawMusic', !!a.rawMusic)}
    ${mu ? `<div class="row"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(mu.name)}</span><button class="btn sm ghost danger" id="btnMusicOff" type="button">Quitar</button></div>
      ${rangeF('Volumen', 'music.volume', 0, 1, .01, mu.volume, 'pct')}
      ${checkF('Bajar la música cuando hablan (ducking)', 'music.duck', mu.duck !== false)}` : '<p class="hint">Sin música. Subí un .mp3, .m4a o .wav libre de derechos.</p>'}
    <button class="btn sm" id="btnMusic" type="button">${mu ? 'Cambiar música' : 'Subir música'}</button>
  </div>
  <div class="sec"><h3>Efectos (SFX sintetizados, sin licencias)</h3>
    <p class="hint">Minimalistas: máximo uno por pieza, sin tics ni pips. Se asignan en cada pieza.</p>
    <div class="chips">${Object.entries(SFX).filter(([k]) => k !== 'ninguno').map(([k, v]) => `<button type="button" class="chip" data-sfx="${k}">▶ ${esc(v.name)}</button>`).join('')}</div>
    ${rangeF('Volumen de efectos', 'audio.sfx', 0, 1, .01, a.sfx, 'pct')}
  </div>
  <div class="sec"><h3>Master</h3>
    ${checkF('Normalizar a −14 LUFS / −1 dB pico (redes)', 'audio.normalize', a.normalize)}
    <p class="hint">Se aplica al exportar. Compresión suave incluida.</p>
  </div>`;
}
function wireLeft(body) {
  const on = (sel, fn, ev = 'click') => body.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
  on('[data-add]', e => addMotion(e.currentTarget.dataset.add));
  on('#btnPlan', () => { S.planHint = $('#planHint')?.value || ''; planWithClaude(); });
  on('#btnPlanStop', () => S.planCtl?.abort());
  on('#planHint', e => S.planHint = e.target.value, 'input');
  on('[data-capstyle]', e => mutate(p => { p.captions.style = e.currentTarget.dataset.capstyle; }));
  on('[data-brand]', e => { const k = BRANDS.find(b => b.key === e.currentTarget.dataset.brand); mutate(p => { p.brand = clone(k); }); applyBrandFonts(); });
  on('[data-grade]', e => { const k = e.currentTarget.dataset.grade; mutate(p => { p.grade.preset = k; if (k !== 'neutro' && !p.grade.mix) p.grade.mix = 1; }); });
  on('#btnResetGrade', () => mutate(p => Object.assign(p.grade, { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, fade: 0, vignette: .12, grain: 0 })));
  on('#btnCube', () => pickFile('.cube', f => loadCubeFile(f)));
  on('#btnFont', () => pickFile('.ttf,.otf,.woff,.woff2', f => loadFontFile(f)));
  on('#btnMusic', () => pickFile('audio/*,.mp3,.m4a,.wav,.aac', f => loadMusicFile(f)));
  on('#btnMusicOff', () => { mutate(p => { p.music = null; }); S.musicBlob = null; S.musicBuf = null; $('#mus').removeAttribute('src'); IDB.del('m:' + S.p.id); });
  on('[data-sfx]', e => previewSfx(e.currentTarget.dataset.sfx));
  on('[data-transcribe]', () => requestTranscription(false));
  on('[data-libprev]', e => previewLib(e.currentTarget.dataset.libprev));
  on('[data-libuse]', e => useLibMusic(e.currentTarget.dataset.libuse));
  on('[data-libf]', e => { S.libF = e.currentTarget.dataset.libf; S.libMore = false; renderLeft(); });
  on('#libMore', () => { S.libMore = true; renderLeft(); });
  const lq = body.querySelector('#libQ'); if (lq) { let tq = 0; lq.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => { S.libQ = lq.value; S.libMore = false; renderLeft(); const n = $('#libQ'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 220); }); }
  on('#btnImportTr', () => pickFile('.srt,.vtt,.json,.txt', f => importTranscript(f)));
  on('#btnFixWords', () => fixWordsWithClaude());
  on('[data-copy]', e => copyText($(e.currentTarget.dataset.copy).textContent, e.currentTarget));
  on('#btnFromSel', () => { const ws = S.p.words, [a, b] = S.wordSel; addMotion($('#selType').value, ws[a].s, Math.max(1.5, ws[b].e - ws[a].s + .3)); S.wordSel = null; });
  on('#btnClearSel', () => { S.wordSel = null; renderLeft(); });
  const wb = body.querySelector('#wordsBox');
  if (wb) {
    wb.addEventListener('click', e => {
      const sk = e.target.closest('[data-seek]'); if (sk) { seek(+sk.dataset.seek); return; }
      const sp = e.target.closest('span[data-i]'); if (!sp || sp.isContentEditable) return; const i = +sp.dataset.i;
      if (e.shiftKey) { const a = S.wordSel ? S.wordSel[0] : (S.anchorWord ?? i); S.wordSel = [Math.min(a, i), Math.max(a, i)]; renderLeft(); }
      else { S.anchorWord = i; if (S.wordSel) { S.wordSel = null; renderLeft(); } seek(S.p.words[i].s); }
    });
    wb.addEventListener('dblclick', e => {
      const sp = e.target.closest('span[data-i]'); if (!sp) return; const i = +sp.dataset.i;
      sp.contentEditable = 'true'; sp.focus(); document.getSelection()?.selectAllChildren(sp);
      const done = () => { sp.contentEditable = 'false'; const v = sp.textContent.trim(); if (v && v !== S.p.words[i].w) mutate(p => { p.words[i].w = v; p._wv = (p._wv || 0) + 1; }, { skip: 'left' }); else if (!v) sp.textContent = S.p.words[i].w; };
      sp.addEventListener('blur', done, { once: true });
      sp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); sp.blur(); } if (ev.key === 'Escape') { sp.textContent = S.p.words[i].w; sp.blur(); } });
    });
  }
}
AFTER.fonts = () => applyBrandFonts();
AFTER.sfx = () => preloadLibSfx();
function copyText(text, btn) {
  const ok = () => { if (btn) { const t = btn.textContent; btn.textContent = 'Copiado'; setTimeout(() => btn.textContent = t, 1400); } };
  try { navigator.clipboard.writeText(text).then(ok).catch(() => selectText(btn)); } catch (e) { selectText(btn); }
}
function selectText(btn) { const box = btn?.previousElementSibling; if (box) { const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Seleccioné el texto: copialo con Ctrl+C.'); } }
function pickFile(accept, cb) { const inp = $('#fileAny'); inp.accept = accept; inp.value = ''; inp.onchange = () => { const f = inp.files[0]; if (f) cb(f); }; inp.click(); }

/* ============ inspector ============ */
function renderInspector() {
  const box = $('#inspector'), P = S.p, m = selM();
  if (!m) { box.innerHTML = projectHTML(); bindInputs(box, p => p, 'inspector'); wireProject(box); return; }
  const pr = PRESETS[m.type], idx = sortedMotions().findIndex(x => x.id === m.id) + 1;
  const fields = pr.schema.map(([k, t, label, opts]) => {
    const path = 'params.' + k, v = m.params[k];
    if (t === 'text') return textF(label, path, v);
    if (t === 'textarea') return areaF(label, path, v, 2);
    if (t === 'number') return `<label class="f">${label}<input type="number" step="any" data-bind="${path}" data-type="num" value="${esc(v)}"></label>`;
    if (t === 'select') return selectF(label, path, k === 'tpl' ? [['', 'Elegí una plantilla']].concat((S.templates || []).map(x => [x.id, x.name])) : opts, v);
    if (t === 'code') return `<label class="f">${label}<textarea rows="14" data-bind="${path}" class="mono" style="font-size:11.5px;white-space:pre" spellcheck="false">${esc(v)}</textarea><span class="hint">Lo más simple: pedíselo a Claude en el chat ("hacé que el título entre como…").</span></label>`;
    if (t === 'bool') return checkF(label, path, v);
    if (t === 'range') return rangeF(label, path, 0, 1, .01, v, 'pct');
    if (t === 'lines') return `<label class="f">${label}<textarea rows="4" data-bind="${path}" data-type="lines">${esc((v || []).join('\n'))}</textarea></label>`;
    if (t === 'json') return `<label class="f">${label}<textarea rows="12" data-bind="${path}" data-type="json" class="mono" style="font-size:11.5px">${esc(JSON.stringify(v, null, 1))}</textarea><span class="hint">Coordenadas sobre 1080×1920. Lo más simple: pedíselo a Claude en la pestaña Claude.</span></label>`;
    if (t === 'pairs') return `<label class="f">${label}<textarea rows="4" data-bind="${path}" data-type="pairs" data-keys="${opts.join(',')}" class="mono">${esc(pairsText(v, opts))}</textarea></label>`;
    return '';
  }).join('');
  const nLab = (pr.labels(m.params) || []).length;
  box.innerHTML = `<div class="sec"><div class="sec-head"><div><div class="eyebrow">Pieza ${pad2(idx)} · ${esc(pr.name)}</div><h3 style="margin-top:3px">${esc(headline(m))}</h3></div>
      <div class="row"><button class="btn sm ghost" id="mDup" type="button" title="Duplicar (Ctrl+D)">Duplicar</button><button class="btn sm ghost danger" id="mDel" type="button" title="Borrar (Supr)">Borrar</button></div></div>
    <div class="row"><button class="btn sm" id="mDesel" type="button">← Proyecto</button><button class="btn sm" id="mPlay" type="button">▶ Ver pieza</button><span class="st ${m.status}">${m.status}</span></div>
  </div>
  <div class="sec"><h3>Tiempo</h3>
    <div class="grid2"><label class="f">Entrada (s)<input type="number" step="0.05" min="0" data-bind="start" data-type="num" value="${m.start.toFixed(2)}" data-after="quote"></label><label class="f">Duración (s)<input type="number" step="0.05" min="0.8" data-bind="dur" data-type="num" value="${m.dur.toFixed(2)}" data-after="quote"></label></div>
    <div class="row" style="flex-wrap:wrap"><button class="btn sm" id="mSnap" type="button" title="Ajusta entrada y salida a la frase que se dice">Ajustar a la frase</button><button class="btn sm" id="mHere" type="button">Mover al cabezal</button></div>
    <div><div class="eyebrow" style="margin-bottom:6px">Entradas sincronizadas con la voz</div>
      <div class="beats">${Array.from({ length: nLab }, (_, i) => { const b = m.beats?.[i]; return `<span title="${esc(pr.labels(m.params)[i] || '')}">${i + 1}: ${b != null ? b.toFixed(2) + 's' : 'auto'}</span>`; }).join('')}</div>
      <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn sm" id="mSync" type="button" ${S.p.words?.length ? '' : 'disabled'}>Sincronizar con la voz</button><button class="btn sm ghost" id="mUnsync" type="button">Escalonado fijo</button></div>
      ${rangeF('Separación entre entradas (sin sincronía)', 'stagger', .1, 1.5, .05, m.stagger, 's')}
    </div>
  </div>
  <div class="sec"><h3>Disposición</h3>
    <div class="grid2">${selectF('Formato', 'layout', [['overlay', 'Sobre el video'], ['full', 'Pantalla completa']], m.layout, 'data-rerender="1"')}
    ${m.layout === 'full' ? selectF('Fondo', 'bg', [['video', 'Video desenfocado'], ['solido', 'Color de marca']], m.bg) : selectF('Ubicación', 'pos', [['auto', 'Auto (evita la cara)'], ['arriba', 'Arriba'], ['centro', 'Centro'], ['abajo', 'Sobre los subtítulos']], m.pos)}</div>
    <div class="grid2">${selectF('Entrada', 'tr', [['subir', 'Sube'], ['fundido', 'Fundido'], ['escala', 'Escala sutil'], ['mascara', 'Máscara']], m.tr)}
    ${sfxSelect(m.sfx)}</div>
  </div>
  <div class="sec"><h3>Contenido</h3>${fields}</div>
  <div class="sec"><h3>Para la revisión</h3>
    ${areaF('Lo que dice', 'quote', m.quote, 2, 'data-after="quoteEdit"')}
    ${areaF('Qué se mueve', 'desc', m.desc, 2)}
  </div>`;
  bindInputs(box, p => p.motions.find(x => x.id === m.id), 'inspector');
  const on = (sel, fn) => box.querySelector(sel)?.addEventListener('click', fn);
  on('#mDel', () => deleteMotion(m.id)); on('#mDup', () => duplicateMotion(m.id)); on('#mDesel', () => { S.sel = null; refreshUI(); });
  on('#mPlay', () => { seek(Math.max(0, m.start - .2)); S.reviewStop = m.start + m.dur + .1; play(); });
  on('#mSnap', () => mutate(p => { const x = p.motions.find(y => y.id === m.id); snapToPhrase(p, x); }));
  on('#mHere', () => mutate(p => { const x = p.motions.find(y => y.id === m.id); const d = S.t - x.start; x.start = +S.t.toFixed(2); x.beats = (x.beats || []).map(b => b == null ? null : +(b + d).toFixed(3)); x.quote = quoteFor(p, x); }));
  on('#mSync', () => { const n = syncBeats(S.p.motions.find(y => y.id === m.id), true); toast(n ? `Sincronicé ${n} entrada${n > 1 ? 's' : ''} con la voz.` : 'No encontré esas palabras en el tramo: dejé el escalonado.'); });
  on('#mUnsync', () => mutate(p => { p.motions.find(y => y.id === m.id).beats = []; }));
}
AFTER.quoteEdit = (p, m) => { if (m) m._quoteEdited = true; };
function projectHTML() {
  const P = S.p, v = P.video;
  const up = S.busy.upload, px = S.busy.proxy;
  return `<div class="sec"><div class="eyebrow">Proyecto</div>${textF('Nombre', 'name', P.name, 'data-after="projname"')}
    <div class="grid2">${selectF('Cuadros por segundo', 'fps', [[24, '24'], [25, '25'], [30, '30'], [60, '60']], P.fps, 'data-type="num"')}
    <label class="f">Duración (s)<input type="number" step="0.1" min="1" data-bind="duration" data-type="num" value="${P.duration}" ${v ? 'disabled title="La define el video"' : ''}></label></div>
  </div>
  <div class="sec"><h3>Video</h3>
    ${v ? `<dl class="kv"><dt>Archivo</dt><dd>${esc(v.name)}</dd><dt>Tamaño</dt><dd>${v.w}×${v.h} · ${fmtBytes(v.size)}</dd><dt>Duración</dt><dd class="mono">${mmss(v.duration)}</dd>
      <dt>Guardado</dt><dd>${v.assetId ? (v.proxy ? 'Copia liviana 720p en el proyecto' : 'En el proyecto') : S.assets ? 'Solo en este navegador' : 'En este navegador'}</dd></dl>
      ${S.localVideo ? '' : '<p class="hint">El original no está en este navegador: se usa la copia del proyecto.</p>'}
      ${up ? '<p class="hint"><span class="busy"></span> Subiendo al proyecto…</p>' : ''}
      ${!v.assetId && S.assets && S.needProxy && !up ? `<p class="hint">El video pesa más de 20 MB o no es MP4, así que no entra entero en el proyecto. Creo una copia liviana (720p) para que tu equipo y Claude la vean; el original queda en este navegador para exportar en calidad completa.</p>
        <button class="btn sm" id="btnProxy" type="button" ${px ? 'disabled' : ''}>${px ? 'Creando copia…' : 'Crear copia liviana y guardar'}</button><div class="bar" id="proxyBar" ${px ? '' : 'hidden'}><i style="width:${Math.round((px || 0) * 100)}%"></i></div>` : ''}
      ${!v.assetId && S.assets && !S.needProxy && !up && S.localVideo ? '<button class="btn sm" id="btnUploadV" type="button">Guardar video en el proyecto</button>' : ''}`
      : '<p class="hint">Sin video. Usá el fondo de demostración o cargá uno.</p>'}
    <button class="btn sm ${v ? '' : 'pri'}" id="btnVid2" type="button">${v ? 'Reemplazar video' : 'Cargar video'}</button>
  </div>
  <div class="sec"><h3>Notas</h3>${areaF('Notas del proyecto (Claude también las lee)', 'notes', P.notes, 3)}</div>
  <div class="sec"><button class="btn sm ghost danger" id="btnDelProj" type="button">${S.confirmDel ? 'Confirmar: borrar proyecto y su video' : 'Borrar proyecto'}</button></div>`;
}
AFTER.projname = () => renderProjSel();
function refreshProxyBar() { const b = $('#proxyBar i'); if (b) b.style.width = Math.round((S.busy.proxy || 0) * 100) + '%'; }
function wireProject(box) {
  const on = (sel, fn) => box.querySelector(sel)?.addEventListener('click', fn);
  on('#btnVid2', () => $('#fileVideo').click());
  on('#btnProxy', () => makeProxy());
  on('#btnUploadV', () => uploadVideoAsset(S.localVideo));
  box.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyText($(b.dataset.copy).textContent, b)));
  on('#btnDelProj', async () => {
    if (!S.confirmDel) { S.confirmDel = true; renderInspector(); setTimeout(() => { S.confirmDel = false; if (!selM()) renderInspector(); }, 5000); return; }
    S.confirmDel = false; const P = S.p;
    if (S.assets) { for (const id of [P.video?.assetId, P.music?.assetId]) if (id) { try { await S.assets.delete(id); } catch (e) { } } }
    await store.remove(P.id); S.projects = S.projects.filter(p => p.id !== P.id); S.p = null; renderProjSel();
    showHome(true);
  });
}

/* ============ acciones sobre piezas ============ */
function addMotion(type, start, dur) {
  if (!S.p) return; const pr = PRESETS[type];
  const full = ['bento', 'linea', 'cta'].includes(type);
  const m = sanitizeMotion({ type, start: start ?? S.t, dur: dur ?? (full ? 4.5 : 4), layout: full ? 'full' : 'overlay', params: clone(pr.defaults) });
  m.start = +clamp(m.start, 0, Math.max(0, S.p.duration - 1)).toFixed(2); m.dur = +Math.min(m.dur, Math.max(1, S.p.duration - m.start)).toFixed(2);
  m.quote = quoteFor(S.p, m);
  mutate(p => { p.motions.push(m); }); S.sel = m.id; refreshUI();
  toast(`${pr.name} agregado en ${tc(m.start, S.p.fps)}.`);
}
function deleteMotion(id) { mutate(p => { p.motions = p.motions.filter(m => m.id !== id); }); if (S.sel === id) S.sel = null; refreshUI(); }
function duplicateMotion(id) { const m = S.p.motions.find(x => x.id === id); if (!m) return; const c = clone(m); c.id = 'm' + uid(); c.start = +(m.start + m.dur).toFixed(2); c.beats = (c.beats || []).map(b => b == null ? null : +(b + m.dur).toFixed(3)); c.status = 'pendiente'; c.comment = ''; mutate(p => p.motions.push(c)); S.sel = c.id; refreshUI(); }
function snapToPhrase(p, m) {
  const ws = p.words || []; if (!ws.length) return;
  let i0 = ws.findIndex(w => w.e > m.start); if (i0 < 0) return;
  while (i0 > 0 && !/[.?!…]$/.test(ws[i0 - 1].w) && ws[i0].s - ws[i0 - 1].e < .45 && m.start - ws[i0 - 1].s < 2.5) i0--;
  let i1 = i0; while (i1 < ws.length - 1 && !/[.?!…]$/.test(ws[i1].w) && ws[i1 + 1].s - ws[i1].e < .6) i1++;
  const d = ws[i0].s - m.start; m.start = +Math.max(0, ws[i0].s - .1).toFixed(2); m.dur = +clamp(ws[i1].e - m.start + .5, 1.2, 12).toFixed(2);
  m.beats = (m.beats || []).map(b => b == null ? null : +(b + d).toFixed(3)); m.quote = quoteFor(p, m);
}
/* busca cada elemento en las palabras dichas durante la pieza */
function syncBeats(m, doMutate) {
  const P = S.p, labels = PRESETS[m.type].labels(m.params) || [];
  const ws = (P.words || []).filter(w => w.s >= m.start - 0.4 && w.s <= m.start + m.dur);
  const out = []; let from = 0, hits = 0;
  labels.forEach((lab, i) => {
    if (!lab) { out.push(null); return; }
    const toks = String(lab).split(/\s+/).map(normWord).filter(t => t.length >= 3 || /^\d+$/.test(t));
    const cands = toks.flatMap(t => /^\d+$/.test(t) ? [normWord(numEs(+t)), t] : [t]);
    let found = null;
    for (let j = from; j < ws.length && !found; j++) { const w = normWord(ws[j].w); if (cands.some(c => c.length >= 3 ? (w.startsWith(c.slice(0, Math.max(4, Math.min(6, c.length)))) || c.startsWith(w.slice(0, 5)) && w.length >= 4) : w === c)) { found = ws[j]; from = j + 1; } }
    if (found) { out.push(+found.s.toFixed(3)); hits++; } else out.push(i === 0 ? +m.start.toFixed(3) : null);
  });
  if (doMutate) mutate(p => { p.motions.find(x => x.id === m.id).beats = out; });
  else m.beats = out;
  return hits;
}

/* ============ línea de tiempo ============ */
function fitTimeline() { const sc = $('#tlScroll'); if (!S.p || !sc) return; S.pps = clamp((sc.clientWidth - 30) / Math.max(1, S.p.duration), 4, 400); renderTimeline(); }
function renderTimeline() {
  const P = S.p; if (!P) return;
  const width = Math.ceil(P.duration * S.pps) + 40; $('#tlInner').style.width = width + 'px';
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60]; const major = steps.find(s => s * S.pps >= 64) || 60; const minor = major / (major >= 5 ? 5 : 2);
  let r = ''; for (let t = 0; t <= P.duration + .001; t += minor) { const isM = Math.abs(t / major - Math.round(t / major)) < 1e-6; r += `<div class="tk ${isM ? '' : 'minor'}" style="left:${t * S.pps}px">${isM ? mmss(t) : ''}</div>`; }
  $('#tlRuler').innerHTML = r;
  const ms = sortedMotions();
  $('#laneMotions').innerHTML = ms.map((m, i) => `<div class="blk ${m.layout === 'full' ? 'full' : ''} ${m.status} ${m.id === S.sel ? 'sel' : ''}" data-id="${m.id}" style="left:${m.start * S.pps}px;width:${Math.max(6, m.dur * S.pps)}px" title="${esc(PRESETS[m.type].name)} · ${esc(headline(m))}"><span class="h l"></span><b>${pad2(i + 1)}</b>${esc(headline(m))}<span class="h r"></span></div>`).join('');
  const gs = P.captions.on ? capGroups(P) : [];
  $('#laneCaps').innerHTML = gs.map(g => { const mid = (g.s + g.e) / 2, off = captionsHiddenAt(P, mid, activeMotions(P, mid)); return `<div class="cap" style="left:${g.s * S.pps}px;width:${Math.max(3, (g.e - g.s) * S.pps)}px${off ? ';opacity:.28' : ''}" ${off ? 'title="Oculto: hay un texto en pantalla"' : ''}>${esc(g.words.map(w => w.w).join(' '))}</div>`; }).join('');
  $('#laneMusic').innerHTML = P.music ? `<div class="cap" style="left:0;width:${P.duration * S.pps}px;background:#1d2a22;border-color:#2b4234;color:#a9c8b4">♪ ${esc(P.music.name)} · ${Math.round((P.music.volume ?? .2) * 100)}%${P.music.duck !== false ? ' · ducking' : ''}</div>` : '';
  drawWave(); updateTimeUI();
}
function drawWave() {
  const c = $('#waveCan'); if (!c || !S.p) return; const w = Math.ceil(S.p.duration * S.pps) + 40, h = 44;
  const dpr = window.devicePixelRatio || 1; const cw = Math.min(16000, Math.round(w * dpr)); c.width = cw; c.height = h * dpr; c.style.width = w + 'px';
  const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); const pk = S.voicePeaks; if (!pk) return;
  x.fillStyle = '#4b5d7e'; const sx = cw / w; const mid = c.height / 2;
  for (let px = 0; px < cw; px++) { const t = px / sx / S.pps; const i = Math.floor(t * 100); const v = pk[i] || 0; const hh = Math.max(1, v * (c.height * .9)); x.fillRect(px, mid - hh / 2, 1, hh); }
}
function tlTime(e) { const r = $('#tlInner').getBoundingClientRect(); return clamp((e.clientX - r.left) / S.pps, 0, S.p.duration); }
function wireTimeline() {
  const ruler = $('#tlRuler');
  ruler.addEventListener('pointerdown', e => { if (!S.p) return; ruler.setPointerCapture(e.pointerId); seek(tlTime(e)); const mv = ev => seek(tlTime(ev)); ruler.addEventListener('pointermove', mv); ruler.addEventListener('pointerup', () => ruler.removeEventListener('pointermove', mv), { once: true }); });
  $('#laneMotions').addEventListener('pointerdown', e => {
    if (!S.p) return; const b = e.target.closest('.blk');
    if (!b) { S.sel = null; seek(tlTime(e)); refreshUI(); return; }
    const id = b.dataset.id, m = S.p.motions.find(x => x.id === id); if (!m) return;
    const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
    const x0 = e.clientX, s0 = m.start, d0 = m.dur, b0 = (m.beats || []).slice(); let moved = false;
    b.setPointerCapture(e.pointerId);
    if (S.sel !== id) { S.sel = id; renderInspector(); $$('#laneMotions .blk').forEach(el => el.classList.toggle('sel', el.dataset.id === id)); }
    S.undo.push(snapshot()); S.redo = []; S.lastCoalesce = '';
    const snapT = t => { if (!$('#tlSnap').checked || e.altKey) return t; let best = t, bd = 8 / S.pps; for (const w of S.p.words || []) { for (const v of [w.s, w.e]) { const d = Math.abs(v - t); if (d < bd) { bd = d; best = v; } } } if (Math.abs(S.t - t) < bd) best = S.t; return best; };
    const mv = ev => {
      const dt = (ev.clientX - x0) / S.pps; if (Math.abs(ev.clientX - x0) > 2) moved = true; if (!moved) return;
      if (mode === 'move') { const ns = clamp(snapT(s0 + dt), 0, Math.max(0, S.p.duration - m.dur)); m.start = +ns.toFixed(3); m.beats = b0.map(x => x == null ? null : +(x + (ns - s0)).toFixed(3)); }
      else if (mode === 'l') { const ns = clamp(snapT(s0 + dt), 0, s0 + d0 - .8); m.start = +ns.toFixed(3); m.dur = +(d0 + (s0 - ns)).toFixed(3); }
      else { const ne = clamp(snapT(s0 + d0 + dt), s0 + .8, S.p.duration); m.dur = +(ne - s0).toFixed(3); }
      b.style.left = m.start * S.pps + 'px'; b.style.width = m.dur * S.pps + 'px';
      $('#tlHint').textContent = `${tc(m.start, S.p.fps)} → ${tc(m.start + m.dur, S.p.fps)} · ${m.dur.toFixed(2)} s`;
      S.dirty = true;
    };
    const upH = () => {
      b.removeEventListener('pointermove', mv);
      if (moved) { m.quote = m._quoteEdited ? m.quote : quoteFor(S.p, m); store.schedule(); refreshUI(); }
      else { S.undo.pop(); seek(Math.max(m.start, Math.min(tlTime(e), m.start + m.dur))); }
      $('#tlHint').textContent = 'Arrastrá las piezas para moverlas, los bordes para recortarlas.';
    };
    b.addEventListener('pointermove', mv); b.addEventListener('pointerup', upH, { once: true }); b.addEventListener('pointercancel', upH, { once: true });
  });
  for (const id of ['#laneCaps', '#laneVoice', '#laneMusic']) $(id).addEventListener('pointerdown', e => { if (S.p) seek(tlTime(e)); });
  $('#tlIn').addEventListener('click', () => { S.pps = clamp(S.pps * 1.5, 4, 400); renderTimeline(); });
  $('#tlOut').addEventListener('click', () => { S.pps = clamp(S.pps / 1.5, 4, 400); renderTimeline(); });
  $('#tlFit').addEventListener('click', fitTimeline);
}

/* ============ transcripciones ============ */
function parseTimecode(s) { const m = String(s).trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); if (!m) return NaN; return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]); }
function segsToWords(segs) {
  const out = []; for (const sg of segs) { const ws = sg.text.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean); const tot = ws.reduce((a, w) => a + w.length + 2, 0) || 1; let t = sg.s; for (const w of ws) { const d = (sg.e - sg.s) * (w.length + 2) / tot; out.push({ w, s: +t.toFixed(3), e: +(t + d * .92).toFixed(3) }); t += d; } }
  return out;
}
async function importTranscript(file) {
  const text = await file.text(); let words = [];
  try {
    if (/\.json$/i.test(file.name)) {
      const j = JSON.parse(text);
      if (Array.isArray(j.words)) words = j.words.map(w => ({ w: String(w.w ?? w.word ?? w.text ?? '').trim(), s: +(w.s ?? w.start), e: +(w.e ?? w.end) }));
      else if (Array.isArray(j.segments)) { for (const sg of j.segments) { if (Array.isArray(sg.words) && sg.words.length) words.push(...sg.words.map(w => ({ w: String(w.word ?? w.text ?? w.w).trim(), s: +(w.start ?? w.s), e: +(w.end ?? w.e) }))); else words.push(...segsToWords([{ s: +sg.start, e: +sg.end, text: sg.text }])); } }
      else if (Array.isArray(j)) words = j.map(w => ({ w: String(w.w ?? w.word ?? w.text).trim(), s: +(w.s ?? w.start), e: +(w.e ?? w.end) }));
    } else if (/\.(srt|vtt)$/i.test(file.name)) {
      const segs = []; const blocks = text.replace(/\r/g, '').split(/\n\n+/);
      for (const b of blocks) { const lines = b.split('\n'); const ti = lines.findIndex(l => l.includes('-->')); if (ti < 0) continue; const [a, c] = lines[ti].split('-->'); const tx = lines.slice(ti + 1).join(' ').trim(); if (tx) segs.push({ s: parseTimecode(a), e: parseTimecode(c.split(' ').filter(Boolean)[0]), text: tx }); }
      words = segsToWords(segs);
    } else {
      const d = S.p.duration || 30; words = segsToWords([{ s: 0.2, e: d - 0.2, text }]);
      toast('El .txt no tiene tiempos: los repartí de forma aproximada en todo el video.', 5000);
    }
  } catch (e) { toast('No pude leer ese archivo de transcripción.'); return; }
  words = words.filter(w => w.w && Number.isFinite(w.s) && Number.isFinite(w.e)).sort((a, b) => a.s - b.s);
  if (!words.length) { toast('El archivo no tiene palabras con tiempos.'); return; }
  mutate(p => { p.words = words; p._wv = (p._wv || 0) + 1; if (!p.video) p.duration = Math.max(p.duration, +(words[words.length - 1].e + .8).toFixed(2)); for (const m of p.motions) if (!m._quoteEdited) m.quote = quoteFor(p, m); });
  fitTimeline(); toast(`Transcripción cargada: ${words.length} palabras.`);
}

/* ============ teclado y arrastrar ============ */
function wireGlobal() {
  $$('.modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('#leftTabs button').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.tab; renderLeft(); }));
  $('#projSel').addEventListener('change', e => { const p = S.projects.find(x => x.id === e.target.value); if (p && p.id !== S.p?.id) { store.flush(); openProject(p); } });
  $('#btnNewProj').addEventListener('click', () => { store.flush(); showHome(true); });
  $('#btnUndo').addEventListener('click', undo); $('#btnRedo').addEventListener('click', redo);
  $('#btnPlay').addEventListener('click', togglePlay);
  $('#btnBack').addEventListener('click', () => { pause(); seek(S.t - 1 / (S.p?.fps || 30)); });
  $('#btnFwd').addEventListener('click', () => { pause(); seek(S.t + 1 / (S.p?.fps || 30)); });
  const tg = (id, key) => $(id).addEventListener('click', e => { S[key] = !S[key]; e.currentTarget.setAttribute('aria-pressed', String(S[key])); S.dirty = true; if (key === 'faces' && S[key] && !S.p?.faces?.length) toast(S.sample ? 'Todavía no hay caras detectadas: usá "Detectar caras" en Exportar → Control.' : 'Las caras las detecta Claude dentro de claude.ai.'); });
  tg('#tgSafe', 'safe'); tg('#tgFaces', 'faces'); tg('#tgLoop', 'loop');
  $('#btnLoadVideo').addEventListener('click', () => $('#fileVideo').click());
  $('#fileVideo').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadVideoFile(f); });
  VID.addEventListener('loadeddata', () => { S.videoReady = true; S.vw = VID.videoWidth; S.vh = VID.videoHeight; S.dirty = true; try { VID.currentTime = S.t; } catch (e) { } });
  VID.addEventListener('seeked', () => S.dirty = true);
  VID.addEventListener('error', () => { if (S.videoURL) toast('No se pudo reproducir el video en este navegador.'); S.videoReady = false; });
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (!S.p) return; const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); seek(S.t - (e.shiftKey ? 1 : 1 / S.p.fps)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); seek(S.t + (e.shiftKey ? 1 : 1 / S.p.fps)); }
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 'd' && S.sel) { e.preventDefault(); duplicateMotion(S.sel); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && S.mode === 'editor') { e.preventDefault(); deleteMotion(S.sel); }
    else if (e.key === 'Escape' && S.sel) { S.sel = null; refreshUI(); }
  });
  let dragN = 0; const hint = $('#dropHint');
  const dragUI = on => { hint.hidden = !on || S.home; $('#hmCard').classList.toggle('drag', on && S.home); };
  window.addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragN++; dragUI(true); } });
  window.addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) dragUI(false); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); dragN = 0; dragUI(false); const f = e.dataTransfer?.files?.[0]; if (!f) return;
    if (S.home) { if (/^video\//.test(f.type) || /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name)) loadVideoFile(f); else toast('En el inicio solo va el video. Lo demás lo cargás desde el editor.'); return; }
    const n = f.name.toLowerCase();
    if (/\.cube$/.test(n)) loadCubeFile(f); else if (/\.(srt|vtt|json|txt)$/.test(n)) importTranscript(f); else if (/\.(ttf|otf|woff2?)$/.test(n)) loadFontFile(f);
    else if (/^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac)$/.test(n)) loadMusicFile(f); else loadVideoFile(f);
  });
  window.addEventListener('beforeunload', () => { if (store.timer) { clearTimeout(store.timer); store.timer = 0; store.flush(); } });
}
