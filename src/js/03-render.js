/* ============ dibujo: ayudas ============ */
const CAN_FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(2px)'; return c.filter === 'blur(2px)'; } catch (e) { return false; } })();
const dfont = (B, size, w) => `${w ?? B.dw ?? 700} ${Math.round(size)}px "${B.display}", "Geist", system-ui, sans-serif`;
const bfont = (B, w, size) => `${w} ${Math.round(size)}px "${B.body}", "Geist", system-ui, sans-serif`;
const up = (B, s) => B.upper ? String(s || '').toUpperCase() : String(s || '');
function setLS(ctx, v) { if ('letterSpacing' in ctx) ctx.letterSpacing = v; }
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function shadowOn(ctx, env, s = 1) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 22 * env.k * s; ctx.shadowOffsetY = 2 * env.k; }
function shadowOff(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
function maskText(ctx, text, x, y, lh, p) {
  if (p <= 0) return; ctx.save(); ctx.beginPath(); ctx.rect(0, y - lh * 1.02, W, lh * 1.32); ctx.clip();
  ctx.globalAlpha *= Math.min(1, p * 1.25); ctx.fillText(text, x, y + (1 - p) * lh * 0.85); ctx.restore();
}
function fadeText(ctx, text, x, y, p, alpha = 1, color) {
  if (p <= 0) return; ctx.save(); ctx.globalAlpha *= p * alpha; if (color) ctx.fillStyle = color; ctx.fillText(text, x, y + (1 - p) * 14); ctx.restore();
}
function drawEyebrow(ctx, env, text, x, y, p, align = 'left', color) {
  if (!text || p <= 0) return; const B = env.B;
  ctx.save(); ctx.globalAlpha *= p; ctx.font = bfont(B, 700, 25); setLS(ctx, '4px'); ctx.fillStyle = color || B.accent; ctx.textBaseline = 'alphabetic';
  const t = String(text).toUpperCase(), dx = (1 - p) * -14;
  if (align === 'left') { ctx.textAlign = 'left'; ctx.beginPath(); ctx.arc(x + 6 + dx, y - 9, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillText(t, x + 24 + dx, y); }
  else { ctx.textAlign = 'center'; ctx.fillText(t, x, y); }
  setLS(ctx, '0px'); ctx.restore();
}
function fmtNum(v, dec, pre, suf) { dec = clamp(Math.round(num(dec)), 0, 3); return (pre || '') + num(v).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (suf || ''); }

/* color del velo detrás del texto: siempre contrasta con el color del texto (texto claro → velo oscuro) */
function scrimFor(B) { const lf = lum(B.fg || '#ffffff'), lb = lum(B.bg || '#000000'); if (Math.abs(lf - lb) > 0.45) return B.bg; return lf > 0.5 ? '#0c0c0e' : '#f5f3ef'; }
/* panel según estilo de marca */
function panel(ctx, env, x, y, w, h, alpha = 1, kind) {
  const B = env.B; kind = kind || (env.inFull ? 'tint' : B.panel);
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; shadowOff(ctx);
  const r = B.radius ?? 24;
  if (kind === 'glass') {
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    if (env.base && CAN_FILTER) { ctx.filter = `blur(${Math.round(30 * env.k)}px)`; ctx.drawImage(env.base, 0, 0, W, H); ctx.filter = 'none'; }
    ctx.fillStyle = rgba(scrimFor(B), env.base && CAN_FILTER ? .52 : .82); ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore(); rr(ctx, x, y, w, h, r); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.stroke();
  } else if (kind === 'light') {
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 30 * env.k; ctx.shadowOffsetY = 8 * env.k;
    rr(ctx, x, y, w, h, r); ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fill(); shadowOff(ctx);
  } else if (kind === 'tint') {
    rr(ctx, x, y, w, h, r); ctx.fillStyle = rgba(B.fg, .06); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(B.fg, .12); ctx.stroke();
  } else {
    rr(ctx, x, y, w, h, r); ctx.fillStyle = rgba(B.bg, .93); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(B.fg, .08); ctx.stroke();
  }
  ctx.restore();
}

/* dónde va una pieza */
function area(m, env, h) {
  const x = SAFE.side, w = CW;
  if (m.layout === 'full') return { x, w, y: Math.round(SAFE.top + Math.max(0, (SAFE.bottom - SAFE.top - h) / 2)) };
  let pos = m.pos || 'auto';
  if (pos === 'auto') {
    const f = faceAt(env.P, m.start + m.dur / 2);
    if (!f) pos = h <= 460 ? 'arriba' : 'abajo';
    else { const top = SAFE.top + 24, fy0 = f[1] * H, fy1 = (f[1] + f[3]) * H, bot = Math.min(SAFE.bottom, env.capTop || SAFE.bottom) - 28;
      const upOk = top + h <= fy0 - 10, downOk = bot - h >= fy1 + 10;
      pos = upOk ? 'arriba' : downOk ? 'abajo' : ((fy0 - SAFE.top) > (bot - fy1) ? 'arriba' : 'abajo'); }
  }
  if (pos === 'arriba') return { x, w, y: SAFE.top + 24 };
  if (pos === 'centro') return { x, w, y: Math.round((SAFE.top + SAFE.bottom - h) / 2) };
  return { x, w, y: Math.max(SAFE.top + 24, Math.round(Math.min(SAFE.bottom, env.capTop || SAFE.bottom) - 28 - h)) };
}
function faceAt(P, t) { return faceBoxOut(P, t); }

/* tiempos de entrada de cada elemento (sincronizados con la voz si hay beats) */
function beatTimes(m, n) {
  const st = m.stagger ?? 0.35, res = [];
  for (let i = 0; i < n; i++) {
    const b = m.beats && m.beats[i]; let at;
    if (b != null && Number.isFinite(+b)) at = +b - m.start; else at = i === 0 ? 0.12 : res[i - 1] + st;
    res.push(clamp(at, 0, Math.max(0, m.dur - 0.45)));
  }
  return res;
}
function mkL(m, t, P) {
  const pr = PRESETS[m.type]; const ease = EASES[P.ease] || EASES.expo;
  const tl = t - m.start, inD = 0.55, outD = 0.38;
  const n = Math.max(1, (pr.labels(m.params) || []).length + 2);
  const times = beatTimes(m, n);
  const L = {
    tl, ease, times,
    a: ease(clamp(tl / inD, 0, 1)),
    o: out3(clamp((tl - (m.dur - outD)) / outD, 0, 1)),
    at: i => times[Math.min(i, times.length - 1)],
    p: (i, extra = 0, d = 0.55) => ease(clamp((tl - times[Math.min(i, times.length - 1)] - extra) / d, 0, 1)),
    pAt: (t0, d = 0.55) => ease(clamp((tl - t0) / d, 0, 1)),
  };
  return L;
}

/* ============ biblioteca de motions ============ */
const PRESETS = {};
function defP(key, o) { PRESETS[key] = Object.assign({ key }, o); }
const fgFor = (env, m, panelled) => (panelled || m.layout === 'full') ? env.B.fg : '#ffffff';

defP('titulo', {
  name: 'Título', desc: 'Titular que entra línea por línea, con antetítulo y bajada.',
  defaults: { eyebrow: '', title: 'Escribí el titular', sub: '', align: 'izq', size: 'L', panel: true },
  schema: [['eyebrow', 'text', 'Antetítulo'], ['title', 'textarea', 'Titular'], ['sub', 'textarea', 'Bajada'], ['align', 'select', 'Alineación', [['izq', 'Izquierda'], ['centro', 'Centro']]], ['size', 'select', 'Tamaño', [['M', 'Mediano'], ['L', 'Grande'], ['XL', 'Enorme']]], ['panel', 'bool', 'Con panel (sobre el video)']],
  labels: p => [p.eyebrow, p.title, p.sub],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', usePanel = !!p.panel && !full;
    const pad = usePanel ? 56 : 0, cw = CW - pad * 2;
    const size = (({ M: 70, L: 90, XL: 118 })[p.size] || 90) * (full ? 1.22 : 1);
    ctx.font = dfont(B, size); setLS(ctx, B.track + 'px');
    const lines = wrap(ctx, up(B, p.title), cw); const lh = size * 1.06; setLS(ctx, '0px');
    ctx.font = bfont(B, 500, 38); const subL = p.sub ? wrap(ctx, p.sub, cw) : [];
    const eh = p.eyebrow ? 58 : 0, sh = subL.length ? 22 + subL.length * 50 : 0;
    const h = pad * 2 + eh + lines.length * lh + sh;
    const box = area(m, env, h);
    if (usePanel) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const center = p.align === 'centro', ax = center ? box.x + box.w / 2 : box.x + pad;
    const fg = fgFor(env, m, usePanel); if (!usePanel && !full) shadowOn(ctx, env);
    let y = box.y + pad;
    if (p.eyebrow) { drawEyebrow(ctx, env, p.eyebrow, ax, y + 30, L.p(0), center ? 'center' : 'left'); y += eh; }
    ctx.fillStyle = fg; ctx.textAlign = center ? 'center' : 'left'; ctx.font = dfont(B, size); setLS(ctx, B.track + 'px');
    lines.forEach((ln, j) => { y += lh; maskText(ctx, ln, ax, y - lh * 0.2, lh, L.p(1, j * 0.12)); });
    setLS(ctx, '0px');
    if (subL.length) { y += 22; ctx.font = bfont(B, 500, 38); const pp = L.p(2); subL.forEach(s => { y += 50; fadeText(ctx, s, ax, y - 12, pp, .8, fg); }); }
    shadowOff(ctx);
  }
});

defP('contador', {
  name: 'Contador', desc: 'Cifra grande que sube hasta el número, con etiqueta.',
  defaults: { eyebrow: 'Cada año', value: 90, prefix: '', suffix: '', decimals: 0, label: 'jugadores', caption: 'pasan de la universidad a la liga' },
  schema: [['eyebrow', 'text', 'Antetítulo'], ['value', 'number', 'Número'], ['prefix', 'text', 'Prefijo (ej. $)'], ['suffix', 'text', 'Sufijo (ej. %, K)'], ['decimals', 'number', 'Decimales'], ['label', 'text', 'Etiqueta'], ['caption', 'textarea', 'Bajada']],
  labels: p => [p.eyebrow, String(p.value), p.label, p.caption],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 52, inner = CW - pad * 2;
    const ns = full ? 300 : 220; ctx.font = dfont(B, ns); setLS(ctx, (B.track * 2) + 'px');
    const fin = fmtNum(p.value, p.decimals, p.prefix, p.suffix); const nw = ctx.measureText(fin).width; setLS(ctx, '0px');
    let rw = inner - nw - 40; const side = rw >= 250; if (!side) rw = inner;
    ctx.font = dfont(B, 54); const labL = p.label ? wrap(ctx, up(B, p.label), rw) : [];
    ctx.font = bfont(B, 500, 32); const capL = p.caption ? wrap(ctx, p.caption, rw).slice(0, 4) : [];
    const labH = labL.length * 60, capH = capL.length ? 14 + capL.length * 42 : 0, rH = labH + capH;
    const numH = ns * 0.74, eh = p.eyebrow ? 62 : 0;
    const bodyH = side ? Math.max(numH, rH) : numH + 30 + rH;
    const h = pad * 2 + eh + bodyH, box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    let y = box.y + pad; const x = box.x + pad;
    if (p.eyebrow) { drawEyebrow(ctx, env, p.eyebrow, x, y + 30, L.p(0)); y += eh; }
    const k = EASES.expo(clamp((L.tl - L.at(1)) / 1.3, 0, 1));
    const shown = fmtNum(lerp(0, num(p.value), k), k < 1 ? 0 : p.decimals, p.prefix, p.suffix);
    const numTop = side ? y + (bodyH - numH) / 2 : y;
    ctx.save(); ctx.globalAlpha *= L.p(1, 0, .3); ctx.fillStyle = B.fg; ctx.font = dfont(B, ns); setLS(ctx, (B.track * 2) + 'px'); ctx.textAlign = 'left';
    ctx.fillText(shown, x, numTop + numH); setLS(ctx, '0px'); ctx.restore();
    let ry = side ? y + (bodyH - rH) / 2 : numTop + numH + 30; const rx = side ? x + nw + 40 : x;
    ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = dfont(B, 54);
    labL.forEach((l, j) => { ry += 60; maskText(ctx, l, rx, ry - 12, 60, L.p(2, j * .1)); });
    if (capL.length) { ry += 14; ctx.font = bfont(B, 500, 32); const pc = L.p(3); capL.forEach(c => { ry += 42; fadeText(ctx, c, rx, ry - 10, pc, .72, B.fg); }); }
  }
});

defP('grilla', {
  name: 'Grilla de puntos', desc: 'Muestra una cantidad con puntos y resalta una parte.',
  defaults: { eyebrow: '', label: '90 jugadores por año', total: 90, highlight: 12, cols: 10, caption: '12 salen de nuestro programa' },
  schema: [['eyebrow', 'text', 'Antetítulo'], ['label', 'textarea', 'Titular'], ['total', 'number', 'Total de puntos'], ['highlight', 'number', 'Puntos resaltados'], ['cols', 'number', 'Columnas'], ['caption', 'textarea', 'Bajada']],
  labels: p => [p.eyebrow, p.label, p.caption],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 52, inner = CW - pad * 2;
    const total = clamp(Math.round(num(p.total, 50)), 1, 400), cols = clamp(Math.round(num(p.cols, 10)), 4, 24), hl = clamp(Math.round(num(p.highlight)), 0, total);
    const rows = Math.ceil(total / cols), cell = inner / cols, r = cell * 0.31, gridH = rows * cell;
    ctx.font = dfont(B, 54); setLS(ctx, B.track + 'px'); const labL = p.label ? wrap(ctx, up(B, p.label), inner) : []; setLS(ctx, '0px');
    ctx.font = bfont(B, 500, 32); const capL = p.caption ? wrap(ctx, p.caption, inner).slice(0, 3) : [];
    const eh = p.eyebrow ? 62 : 0, labH = labL.length * 60, capH = capL.length ? 22 + capL.length * 42 : 0;
    const h = pad * 2 + eh + labH + (labH ? 26 : 0) + gridH + capH, box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const x = box.x + pad; let y = box.y + pad;
    if (p.eyebrow) { drawEyebrow(ctx, env, p.eyebrow, x, y + 30, L.p(0)); y += eh; }
    ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = dfont(B, 54); setLS(ctx, B.track + 'px');
    labL.forEach((l, j) => { y += 60; maskText(ctx, l, x, y - 12, 60, L.p(1, j * .1)); }); setLS(ctx, '0px');
    if (labH) y += 26;
    const t1 = L.at(1), t2 = L.at(2), hset = new Set();
    for (let i = 0; i < hl; i++) hset.add(Math.min(total - 1, Math.floor((i + 0.5) * total / hl)));
    let order = 0;
    for (let j = 0; j < total; j++) {
      const cx = x + (j % cols) * cell + cell / 2, cy = y + Math.floor(j / cols) * cell + cell / 2;
      const pj = out3(clamp((L.tl - t1 - 0.9 * (j / total)) / 0.25, 0, 1)); if (pj <= 0) continue;
      let col = rgba(B.fg, .26);
      if (hset.has(j)) { const ph = clamp((L.tl - t2 - (order++) * 0.035) / 0.3, 0, 1); col = ph > 0 ? (ph >= 1 ? B.accent : rgba(B.accent, .3 + .7 * ph)) : col; }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r * pj, 0, Math.PI * 2); ctx.fill();
    }
    y += gridH;
    if (capL.length) { y += 22; ctx.font = bfont(B, 500, 32); const pc = L.p(2, .2); capL.forEach(c => { y += 42; fadeText(ctx, c, x, y - 10, pc, .75, B.fg); }); }
  }
});

defP('comparacion', {
  name: 'De A a B', desc: 'Dos estados unidos por una flecha que se dibuja.',
  defaults: { eyebrow: 'El camino', from: 'Universidad', to: 'Liga profesional', caption: '' },
  schema: [['eyebrow', 'text', 'Antetítulo'], ['from', 'text', 'Desde'], ['to', 'text', 'Hasta'], ['caption', 'textarea', 'Bajada']],
  labels: p => [p.eyebrow, p.from, p.to, p.caption],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 48, inner = CW - pad * 2;
    ctx.font = bfont(B, 700, 40); const tA = up(B, p.from), tB = up(B, p.to);
    const wA = Math.min(inner, ctx.measureText(tA).width + 76), wB = Math.min(inner, ctx.measureText(tB).width + 76), ph = 100, arr = 84;
    const horiz = wA + wB + arr <= inner;
    ctx.font = bfont(B, 500, 32); const capL = p.caption ? wrap(ctx, p.caption, inner).slice(0, 3) : [];
    const eh = p.eyebrow ? 62 : 0, bodyH = horiz ? ph : ph * 2 + arr, capH = capL.length ? 24 + capL.length * 42 : 0;
    const h = pad * 2 + eh + bodyH + capH, box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const x = box.x + pad; let y = box.y + pad;
    if (p.eyebrow) { drawEyebrow(ctx, env, p.eyebrow, x, y + 30, L.p(0)); y += eh; }
    const pill = (tx, px, py, pw, filled, pr) => {
      if (pr <= 0) return; ctx.save(); ctx.globalAlpha *= pr; ctx.translate(0, (1 - pr) * 16);
      rr(ctx, px, py, pw, ph, ph / 2);
      if (filled) { ctx.fillStyle = B.accent; ctx.fill(); ctx.fillStyle = onColor(B.accent); }
      else { ctx.lineWidth = 3; ctx.strokeStyle = rgba(B.fg, .35); ctx.stroke(); ctx.fillStyle = rgba(B.fg, .78); }
      ctx.font = bfont(B, 700, 40); ctx.textAlign = 'center'; ctx.fillText(tx, px + pw / 2, py + ph / 2 + 14, pw - 40); ctx.restore();
    };
    const pa = clamp((L.tl - L.at(2) + 0.3) / 0.35, 0, 1);
    pill(tA, x, y, wA, false, L.p(1));
    ctx.strokeStyle = B.accent; ctx.fillStyle = B.accent; ctx.lineWidth = 5; ctx.lineCap = 'round';
    if (horiz) {
      const x0 = x + wA + 14, x1 = x + wA + arr - 14, cy = y + ph / 2;
      if (pa > 0) { ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(lerp(x0, x1, pa), cy); ctx.stroke(); if (pa > .9) { ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x1 - 14, cy - 12); ctx.lineTo(x1 - 14, cy + 12); ctx.closePath(); ctx.fill(); } }
      pill(tB, x + wA + arr, y, wB, true, L.p(2, .15));
    } else {
      const cx = x + 50, y0 = y + ph + 12, y1 = y + ph + arr - 12;
      if (pa > 0) { ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, lerp(y0, y1, pa)); ctx.stroke(); if (pa > .9) { ctx.beginPath(); ctx.moveTo(cx, y1); ctx.lineTo(cx - 12, y1 - 14); ctx.lineTo(cx + 12, y1 - 14); ctx.closePath(); ctx.fill(); } }
      pill(tB, x, y + ph + arr, wB, true, L.p(2, .15));
    }
    y += bodyH;
    if (capL.length) { y += 24; ctx.font = bfont(B, 500, 32); ctx.textAlign = 'left'; const pc = L.p(3); capL.forEach(c => { y += 42; fadeText(ctx, c, x, y - 10, pc, .75, B.fg); }); }
  }
});

defP('barras', {
  name: 'Barras', desc: 'Comparación de valores con barras que crecen de a una.',
  defaults: { eyebrow: '', title: 'Becas por temporada', unit: '%', items: [{ label: '2022', value: 41 }, { label: '2023', value: 58 }, { label: '2024', value: 72 }] },
  schema: [['eyebrow', 'text', 'Antetítulo'], ['title', 'textarea', 'Titular'], ['unit', 'text', 'Unidad'], ['items', 'pairs', 'Barras · etiqueta | valor', ['label', 'value']]],
  labels: p => [p.title, ...(p.items || []).map(i => i.label)],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 52, inner = CW - pad * 2;
    const items = (p.items || []).slice(0, 6); const max = Math.max(1, ...items.map(i => num(i.value)));
    ctx.font = dfont(B, 52); setLS(ctx, B.track + 'px'); const tL = p.title ? wrap(ctx, up(B, p.title), inner) : []; setLS(ctx, '0px');
    const eh = p.eyebrow ? 62 : 0, th = tL.length ? tL.length * 58 + 26 : 0, rowH = 104;
    const h = pad * 2 + eh + th + items.length * rowH - 20, box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const x = box.x + pad; let y = box.y + pad;
    if (p.eyebrow) { drawEyebrow(ctx, env, p.eyebrow, x, y + 30, L.p(0, -0.1)); y += eh; }
    ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = dfont(B, 52); setLS(ctx, B.track + 'px');
    tL.forEach((l, j) => { y += 58; maskText(ctx, l, x, y - 12, 58, L.p(0, j * .1)); }); setLS(ctx, '0px'); if (th) y += 26;
    items.forEach((it, i) => {
      const pi = L.p(i + 1, 0, .3), g = EASES.expo(clamp((L.tl - L.at(i + 1)) / 0.9, 0, 1)); if (pi <= 0) { y += rowH; return; }
      ctx.save(); ctx.globalAlpha *= pi;
      ctx.font = bfont(B, 600, 32); ctx.fillStyle = rgba(B.fg, .8); ctx.textAlign = 'left'; ctx.fillText(up(B, it.label), x, y + 32);
      ctx.font = dfont(B, 42); ctx.fillStyle = B.fg; ctx.textAlign = 'right'; ctx.fillText(fmtNum(num(it.value) * g, 0, '', p.unit || ''), x + inner, y + 34);
      rr(ctx, x, y + 50, inner, 24, 12); ctx.fillStyle = rgba(B.fg, .1); ctx.fill();
      const bw = Math.max(24, inner * (num(it.value) / max) * g); rr(ctx, x, y + 50, bw, 24, 12); ctx.fillStyle = i === items.length - 1 ? B.accent : rgba(B.accent, .55); ctx.fill();
      ctx.restore(); y += rowH;
    });
  }
});

defP('bento', {
  name: 'Tarjetas bento', desc: 'De 1 a 4 tarjetas que entran de a una (ideal pantalla completa).',
  defaults: { cards: [{ eyebrow: 'Instalaciones', title: 'Estadios y centros de entrenamiento' }, { eyebrow: 'Staff', title: 'A tiempo completo' }, { eyebrow: 'Educación', title: 'Título universitario' }] },
  schema: [['cards', 'pairs', 'Tarjetas · antetítulo | título', ['eyebrow', 'title']]],
  labels: p => (p.cards || []).map(c => c.title),
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, cards = (p.cards || []).slice(0, 4), n = cards.length; if (!n) return;
    const rows = n === 1 ? [[0]] : n === 2 ? [[0], [1]] : n === 3 ? [[0], [1, 2]] : [[0, 1], [2, 3]];
    const gap = 20, P2 = 40; const lay = [];
    let total = 0;
    rows.forEach(row => {
      const cols = row.length, cw = (CW - gap * (cols - 1)) / cols, fs = cols === 1 ? 58 : 44, lh = fs * 1.1;
      let rh = cols === 1 ? 220 : 260; const items = [];
      row.forEach(i => { ctx.font = dfont(B, fs); setLS(ctx, B.track + 'px'); const ls = wrap(ctx, up(B, cards[i].title), cw - P2 * 2); setLS(ctx, '0px'); const ch = P2 + 46 + ls.length * lh + P2; rh = Math.max(rh, ch); items.push({ i, cw, fs, lh, ls }); });
      lay.push({ rh, items }); total += rh;
    });
    total += gap * (rows.length - 1);
    const box = area(m, env, total); let y = box.y;
    lay.forEach(row => {
      let x = box.x;
      row.items.forEach(it => {
        const c = cards[it.i], pr = L.p(it.i);
        if (pr > 0) {
          ctx.save(); ctx.globalAlpha *= pr; ctx.translate(0, (1 - pr) * 36);
          panel(ctx, env, x, y, it.cw, row.rh, 1);
          drawEyebrow(ctx, env, c.eyebrow, x + P2, y + P2 + 22, 1);
          ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = dfont(B, it.fs); setLS(ctx, B.track + 'px');
          let ty = y + P2 + 46; it.ls.forEach(l => { ty += it.lh; ctx.fillText(l, x + P2, ty - it.lh * 0.22); }); setLS(ctx, '0px');
          ctx.restore();
        }
        x += it.cw + gap;
      });
      y += row.rh + gap;
    });
  }
});

defP('lowerthird', {
  name: 'Zócalo', desc: 'Nombre y cargo de quien habla.',
  defaults: { name: 'Martín Ruiz', role: 'Head coach · Club Atlas' },
  schema: [['name', 'text', 'Nombre'], ['role', 'text', 'Cargo o dato']],
  labels: p => [p.name, p.role],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, pad = 40;
    ctx.font = dfont(B, 56); setLS(ctx, B.track + 'px'); const nw = ctx.measureText(up(B, p.name)).width; setLS(ctx, '0px');
    ctx.font = bfont(B, 500, 32); const rw = ctx.measureText(p.role || '').width;
    const w = Math.min(CW, Math.max(nw, rw) + pad * 2), h = pad * 2 + 62 + (p.role ? 46 : 0);
    let x = SAFE.side, y;
    if (m.layout === 'full') { x = (W - w) / 2; y = (SAFE.top + SAFE.bottom - h) / 2; }
    else { const pos = m.pos === 'arriba' ? 'arriba' : 'abajo'; y = pos === 'arriba' ? SAFE.top + 24 : Math.min(SAFE.bottom, env.capTop || SAFE.bottom) - 28 - h; }
    panel(ctx, env, x, y, w, h, L.a);
    ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = dfont(B, 56); setLS(ctx, B.track + 'px');
    maskText(ctx, up(B, p.name), x + pad, y + pad + 50, 62, L.p(0)); setLS(ctx, '0px');
    const lw = 64 * L.p(0, .15); if (lw > 0) { ctx.fillStyle = B.accent; ctx.fillRect(x + pad, y + pad + 66, lw, 4); }
    if (p.role) { ctx.font = bfont(B, 500, 32); fadeText(ctx, p.role, x + pad, y + pad + 112, L.p(1), .75, B.fg); }
  }
});

defP('cita', {
  name: 'Cita', desc: 'Frase destacada que aparece palabra por palabra.',
  defaults: { text: 'Acá no venís a probar suerte. Venís a prepararte.', author: 'Martín Ruiz · Head coach' },
  schema: [['text', 'textarea', 'Frase'], ['author', 'text', 'Autor']],
  labels: p => [p.text, p.author],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 56, inner = CW - pad * 2;
    const fs = full ? 80 : 62, lh = fs * 1.16;
    ctx.font = dfont(B, fs); setLS(ctx, B.track + 'px');
    const words = String(up(B, p.text) || '').split(/\s+/).filter(Boolean), sp = ctx.measureText(' ').width;
    const pos = []; let lx = 0, line = 0;
    words.forEach(w => { const ww = ctx.measureText(w).width; if (lx > 0 && lx + ww > inner) { lx = 0; line++; } pos.push({ w, x: lx, line }); lx += ww + sp; });
    setLS(ctx, '0px');
    const lines = words.length ? line + 1 : 0, qh = 110, ah = p.author ? 70 : 0;
    const h = pad * 2 + qh + lines * lh + ah, box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const x = box.x + pad, y0 = box.y + pad;
    ctx.save(); ctx.globalAlpha *= L.p(0, -.1); ctx.fillStyle = B.accent; ctx.font = `400 220px "Instrument Serif", Georgia, serif`; ctx.textAlign = 'left'; ctx.fillText('“', x - 8, y0 + 170); ctx.restore();
    const step = Math.min(0.16, 1.8 / Math.max(1, words.length)), t0 = L.at(0) + 0.15;
    ctx.fillStyle = B.fg; ctx.font = dfont(B, fs); setLS(ctx, B.track + 'px'); ctx.textAlign = 'left';
    pos.forEach((q, j) => { const pr = L.pAt(t0 + j * step, .32); if (pr <= 0) return; ctx.save(); ctx.globalAlpha *= pr; ctx.fillText(q.w, x + q.x, y0 + qh + (q.line + 1) * lh - lh * .22 + (1 - pr) * 12); ctx.restore(); });
    setLS(ctx, '0px');
    if (p.author) { const ta = (m.beats && m.beats[1] != null) ? L.at(1) : t0 + words.length * step + .25; ctx.font = bfont(B, 600, 30); fadeText(ctx, p.author, x, y0 + qh + lines * lh + 52, L.pAt(ta), .72, B.fg); }
  }
});

defP('lista', {
  name: 'Lista', desc: 'Ítems que se van tildando a medida que se nombran.',
  defaults: { title: 'Tu equipo', items: ['Preparador físico', 'Analista de video', 'Nutricionista'], mark: 'check' },
  schema: [['title', 'textarea', 'Titular'], ['items', 'lines', 'Ítems (uno por línea)'], ['mark', 'select', 'Marca', [['check', 'Tilde'], ['numero', 'Número']]]],
  labels: p => [p.title, ...(p.items || [])],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 52, inner = CW - pad * 2;
    const items = (p.items || []).filter(Boolean).slice(0, 7);
    ctx.font = dfont(B, 56); setLS(ctx, B.track + 'px'); const tL = p.title ? wrap(ctx, up(B, p.title), inner) : []; setLS(ctx, '0px');
    ctx.font = bfont(B, 600, 40); const rows = items.map(it => wrap(ctx, it, inner - 84));
    const th = tL.length ? tL.length * 62 + 22 : 0, rh = rows.map(r => Math.max(78, r.length * 50 + 28));
    const h = pad * 2 + th + rh.reduce((a, b) => a + b, 0), box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const x = box.x + pad; let y = box.y + pad;
    ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = dfont(B, 56); setLS(ctx, B.track + 'px');
    tL.forEach((l, j) => { y += 62; maskText(ctx, l, x, y - 14, 62, L.p(0, j * .1)); }); setLS(ctx, '0px'); if (th) y += 22;
    rows.forEach((ls, i) => {
      const pi = L.p(i + 1); if (pi > 0) {
        const cy = y + 39, r = 25;
        ctx.save(); ctx.globalAlpha *= pi;
        ctx.beginPath(); ctx.arc(x + r, cy, r * (0.6 + 0.4 * pi), 0, Math.PI * 2); ctx.fillStyle = B.accent; ctx.fill();
        if (p.mark === 'numero') { ctx.fillStyle = onColor(B.accent); ctx.font = bfont(B, 700, 26); ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x + r, cy + 9); }
        else { const ck = clamp((L.tl - L.at(i + 1) - .12) / .3, 0, 1); if (ck > 0) { ctx.strokeStyle = onColor(B.accent); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const pts = [[x + r - 11, cy + 1], [x + r - 3, cy + 9], [x + r + 12, cy - 9]]; ctx.beginPath(); ctx.moveTo(...pts[0]); if (ck < .4) ctx.lineTo(lerp(pts[0][0], pts[1][0], ck / .4), lerp(pts[0][1], pts[1][1], ck / .4)); else { ctx.lineTo(...pts[1]); const k2 = (ck - .4) / .6; ctx.lineTo(lerp(pts[1][0], pts[2][0], k2), lerp(pts[1][1], pts[2][1], k2)); } ctx.stroke(); } }
        ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = bfont(B, 600, 40);
        ls.forEach((l, j) => ctx.fillText(l, x + 84 + (1 - pi) * -12, y + 52 + j * 50));
        ctx.restore();
      }
      y += rh[i];
    });
  }
});

defP('progreso', {
  name: 'Anillo %', desc: 'Porcentaje que se completa en un anillo.',
  defaults: { eyebrow: 'Resultados', value: 72, label: 'consigue beca', caption: 'en su primer año' },
  schema: [['eyebrow', 'text', 'Antetítulo'], ['value', 'number', 'Porcentaje (0–100)'], ['label', 'text', 'Etiqueta'], ['caption', 'textarea', 'Bajada']],
  labels: p => [p.eyebrow, String(p.value), p.label, p.caption],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 52, inner = CW - pad * 2;
    const D = full ? 330 : 250, sw = full ? 30 : 24; let rw = inner - D - 44; const side = rw >= 250; if (!side) rw = inner;
    ctx.font = dfont(B, 54); const labL = p.label ? wrap(ctx, up(B, p.label), rw) : [];
    ctx.font = bfont(B, 500, 32); const capL = p.caption ? wrap(ctx, p.caption, rw).slice(0, 4) : [];
    const rH = labL.length * 60 + (capL.length ? 14 + capL.length * 42 : 0), eh = p.eyebrow ? 62 : 0;
    const bodyH = side ? Math.max(D, rH) : D + 30 + rH, h = pad * 2 + eh + bodyH, box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const x = box.x + pad; let y = box.y + pad;
    if (p.eyebrow) { drawEyebrow(ctx, env, p.eyebrow, x, y + 30, L.p(0)); y += eh; }
    const ry = side ? y + (bodyH - D) / 2 : y, cx = x + D / 2, cy = ry + D / 2, R = D / 2 - sw / 2;
    const k = EASES.expo(clamp((L.tl - L.at(1)) / 1.4, 0, 1)), v = clamp(num(p.value), 0, 100);
    ctx.save(); ctx.globalAlpha *= L.p(1, 0, .3);
    ctx.lineWidth = sw; ctx.strokeStyle = rgba(B.fg, .12); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    if (k > 0) { ctx.strokeStyle = B.accent; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (v / 100) * k); ctx.stroke(); }
    ctx.fillStyle = B.fg; ctx.textAlign = 'center'; ctx.font = dfont(B, D * 0.3); ctx.fillText(Math.round(v * k) + '%', cx, cy + D * 0.105);
    ctx.restore();
    let ty = side ? y + (bodyH - rH) / 2 : ry + D + 30; const tx = side ? x + D + 44 : x;
    ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = dfont(B, 54);
    labL.forEach((l, j) => { ty += 60; maskText(ctx, l, tx, ty - 12, 60, L.p(2, j * .1)); });
    if (capL.length) { ty += 14; ctx.font = bfont(B, 500, 32); const pc = L.p(3); capL.forEach(c => { ty += 42; fadeText(ctx, c, tx, ty - 10, pc, .72, B.fg); }); }
  }
});

defP('linea', {
  name: 'Pasos', desc: 'Proceso vertical: cada paso se enciende cuando se nombra.',
  defaults: { title: 'El proceso', steps: [{ tag: '01', text: 'Evaluación' }, { tag: '02', text: 'Plan' }, { tag: '03', text: 'Vitrina' }, { tag: '04', text: 'Firma' }] },
  schema: [['title', 'textarea', 'Titular'], ['steps', 'pairs', 'Pasos · etiqueta | texto', ['tag', 'text']]],
  labels: p => [p.title, ...(p.steps || []).map(s => s.text)],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 52, inner = CW - pad * 2;
    const steps = (p.steps || []).slice(0, 6), fs = full ? 54 : 46;
    ctx.font = dfont(B, 60); setLS(ctx, B.track + 'px'); const tL = p.title ? wrap(ctx, up(B, p.title), inner) : []; setLS(ctx, '0px');
    const th = tL.length ? tL.length * 66 + 30 : 0, rowH = full ? 124 : 108;
    const h = pad * 2 + th + steps.length * rowH - 16, box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const x = box.x + pad; let y = box.y + pad;
    ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = dfont(B, 60); setLS(ctx, B.track + 'px');
    tL.forEach((l, j) => { y += 66; maskText(ctx, l, x, y - 14, 66, L.p(0, j * .1)); }); setLS(ctx, '0px'); if (th) y += 30;
    const dx = x + 16; let reached = -1;
    steps.forEach((s, i) => { if (L.tl >= L.at(i + 1)) reached = i; });
    steps.forEach((s, i) => {
      const cy = y + i * rowH + 30;
      if (i > 0) { const g = clamp((L.tl - (L.at(i + 1) - .3)) / .3, 0, 1), py = cy - rowH + 16; ctx.fillStyle = rgba(B.fg, .14); ctx.fillRect(dx - 2, py, 4, rowH - 32); if (g > 0) { ctx.fillStyle = B.accent; ctx.fillRect(dx - 2, py, 4, (rowH - 32) * g); } }
      const pi = L.p(i + 1, 0, .4);
      ctx.beginPath(); ctx.arc(dx, cy, 14, 0, Math.PI * 2);
      if (pi > 0) { ctx.fillStyle = B.accent; ctx.globalAlpha = .35 + .65 * pi; ctx.fill(); ctx.globalAlpha = 1; } else { ctx.lineWidth = 3; ctx.strokeStyle = rgba(B.fg, .3); ctx.stroke(); }
      if (pi > 0) {
        ctx.save(); ctx.globalAlpha *= pi * (i === reached ? 1 : .55);
        ctx.font = bfont(B, 700, 23); setLS(ctx, '3px'); ctx.fillStyle = B.accent; ctx.fillText(String(s.tag || '').toUpperCase(), dx + 44, cy - 14); setLS(ctx, '0px');
        ctx.font = dfont(B, fs); setLS(ctx, B.track + 'px'); ctx.fillStyle = B.fg; ctx.fillText(up(B, s.text), dx + 44 + (1 - pi) * -12, cy + fs * .78); setLS(ctx, '0px');
        ctx.restore();
      }
    });
  }
});

defP('cta', {
  name: 'Cierre / CTA', desc: 'Titular, botón y nota final.',
  defaults: { title: 'Tu momento es ahora', button: 'Escribinos hoy', note: 'Para jugadores de 16 a 20 años' },
  schema: [['title', 'textarea', 'Titular'], ['button', 'text', 'Botón'], ['note', 'text', 'Nota']],
  labels: p => [p.title, p.button, p.note],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 52, inner = CW - pad * 2;
    const fs = full ? 104 : 70, lh = fs * 1.05;
    ctx.font = dfont(B, fs); setLS(ctx, B.track + 'px'); const tL = wrap(ctx, up(B, p.title), inner); setLS(ctx, '0px');
    ctx.font = bfont(B, 700, 42); const bt = up(B, p.button || ''), bw = Math.min(inner, ctx.measureText(bt).width + 120), bh = 116;
    const h = pad * 2 + tL.length * lh + (p.button ? 50 + bh : 0) + (p.note ? 70 : 0), box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const cx = box.x + box.w / 2; let y = box.y + pad;
    ctx.fillStyle = B.fg; ctx.textAlign = 'center'; ctx.font = dfont(B, fs); setLS(ctx, B.track + 'px');
    tL.forEach((l, j) => { y += lh; maskText(ctx, l, cx, y - lh * .2, lh, L.p(0, j * .12)); }); setLS(ctx, '0px');
    if (p.button) {
      y += 50; const pb = L.p(1, 0, .45);
      if (pb > 0) {
        ctx.save(); ctx.globalAlpha *= pb; const s = .96 + .04 * pb; ctx.translate(cx, y + bh / 2); ctx.scale(s, s); ctx.translate(-cx, -(y + bh / 2));
        rr(ctx, cx - bw / 2, y, bw, bh, bh / 2); ctx.fillStyle = B.accent; ctx.fill();
        const sh = clamp((L.tl - L.at(1) - .45) / .8, 0, 1);
        if (sh > 0 && sh < 1) { ctx.save(); rr(ctx, cx - bw / 2, y, bw, bh, bh / 2); ctx.clip(); const sx = lerp(cx - bw / 2 - 120, cx + bw / 2 + 120, sh); const g = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(cx - bw / 2, y, bw, bh); ctx.restore(); }
        ctx.fillStyle = onColor(B.accent); ctx.font = bfont(B, 700, 42); ctx.fillText(bt, cx, y + bh / 2 + 15); ctx.restore();
      }
      y += bh;
    }
    if (p.note) { ctx.font = bfont(B, 500, 32); fadeText(ctx, p.note, cx, y + 56, L.p(2), .7, B.fg); }
  }
});

defP('monograma', {
  name: 'Monograma', desc: 'Escudo con iniciales y nombre (en lugar de logos ajenos).',
  defaults: { initials: 'CA', label: 'Club Atlas', caption: 'Academia oficial' },
  schema: [['initials', 'text', 'Iniciales'], ['label', 'text', 'Nombre'], ['caption', 'text', 'Bajada']],
  labels: p => [p.initials, p.label, p.caption],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B, full = m.layout === 'full', pad = full ? 0 : 44, D = 150;
    const h = pad * 2 + D, box = area(m, env, h);
    if (!full) panel(ctx, env, box.x, box.y, box.w, h, L.a);
    const x = box.x + pad, cy = box.y + pad + D / 2, cx = x + D / 2, pr = L.p(0, 0, .8);
    ctx.fillStyle = rgba(B.accent, .14 * pr); ctx.beginPath(); ctx.arc(cx, cy, D / 2 - 4, 0, Math.PI * 2); ctx.fill();
    if (pr > 0) { ctx.strokeStyle = B.accent; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, D / 2 - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr); ctx.stroke(); }
    ctx.save(); ctx.globalAlpha *= L.p(0, .25); ctx.fillStyle = B.fg; ctx.textAlign = 'center'; ctx.font = dfont(B, 60); ctx.fillText(String(p.initials || '').toUpperCase().slice(0, 3), cx, cy + 21); ctx.restore();
    ctx.textAlign = 'left'; ctx.fillStyle = B.fg; ctx.font = dfont(B, 52);
    maskText(ctx, up(B, p.label), x + D + 36, cy + (p.caption ? -2 : 18), 60, L.p(1));
    if (p.caption) { ctx.font = bfont(B, 500, 30); fadeText(ctx, p.caption, x + D + 36, cy + 46, L.p(2), .72, B.fg); }
  }
});

defP('etiqueta', {
  name: 'Etiqueta', desc: 'Chip chico en cualquier lugar del cuadro (ej. "En directo").',
  defaults: { text: 'En directo', x: 0.5, y: 0.2, dot: true },
  schema: [['text', 'text', 'Texto'], ['x', 'range', 'Posición horizontal'], ['y', 'range', 'Posición vertical'], ['dot', 'bool', 'Punto']],
  labels: p => [p.text],
  draw(ctx, m, L, env) {
    const p = m.params, B = env.B; ctx.font = bfont(B, 700, 28); setLS(ctx, '3px');
    const t = String(p.text || '').toUpperCase(), tw = ctx.measureText(t).width; setLS(ctx, '0px');
    const w = tw + 56 + (p.dot ? 32 : 0), h = 68;
    const cx = clamp(num(p.x, .5) * W, SAFE.side + w / 2, W - SAFE.side - w / 2), cy = clamp(num(p.y, .2) * H, SAFE.top + h / 2, SAFE.bottom - h / 2);
    const pr = L.p(0); if (pr <= 0) return;
    ctx.save(); ctx.globalAlpha *= pr; const s = .92 + .08 * pr; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = rgba(B.bg, .88); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(B.fg, .18); ctx.stroke();
    let tx = cx - w / 2 + 28;
    if (p.dot) {
      const dx = tx + 8; ctx.fillStyle = B.accent; ctx.beginPath(); ctx.arc(dx, cy, 8, 0, Math.PI * 2); ctx.fill();
      const pu = clamp((L.tl - L.at(0) - .2) / .8, 0, 1); if (pu > 0 && pu < 1) { ctx.strokeStyle = rgba(B.accent, 1 - pu); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(dx, cy, 8 + 20 * pu, 0, Math.PI * 2); ctx.stroke(); }
      tx += 32;
    }
    ctx.fillStyle = B.fg; ctx.textAlign = 'left'; ctx.font = bfont(B, 700, 28); setLS(ctx, '3px'); ctx.fillText(t, tx, cy + 10); setLS(ctx, '0px');
    ctx.restore();
  }
});

/* ============ subtítulos ============ */
const CAPS = {
  editorial: { name: 'Editorial', font: (B, s) => `700 ${Math.round(58 * s)}px "${B.body}", Geist, sans-serif`, size: 58, hl: 'color', future: .55 },
  caja: { name: 'Caja', font: (B, s) => `800 ${Math.round(58 * s)}px "${B.body}", Geist, sans-serif`, size: 58, hl: 'box', future: 1 },
  serif: { name: 'Serif', font: (B, s) => `italic 400 ${Math.round(74 * s)}px "Instrument Serif", Georgia, serif`, size: 74, hl: 'color', future: .55 },
  impacto: { name: 'Impacto', font: (B, s) => `800 ${Math.round(86 * s)}px "Barlow Condensed", "Geist", sans-serif`, size: 86, hl: 'color', future: 1, upper: true },
  limpio: { name: 'Limpio (revista)', font: (B, s) => `600 ${Math.round(80 * s)}px "${B.display}", Geist, sans-serif`, size: 80, hl: 'none', future: 1, track: -1 },
  minimo: { name: 'Mínimo', font: (B, s) => `600 ${Math.round(44 * s)}px "${B.body}", Geist, sans-serif`, size: 44, hl: 'none', future: 1 },
};
const CAP_WEAK = new Set('el la los las un una unos unas de del al a en y o e que con por para muy mas su sus mi mis tu se lo le les me te nos es son no sin sobre entre como pero ni the a an of to and in on'.split(' '));
const capCache = { key: '', groups: [] };
function capGroups(P) {
  const key = (P.words?.length || 0) + ':' + (P.words?.[0]?.s ?? '') + ':' + (P.words?.[P.words.length - 1]?.e ?? '') + ':' + P.captions.maxWords + ':' + (P._wv || 0);
  if (capCache.key === key) return capCache.groups;
  const ws = P.words || [], mw = clamp(P.captions.maxWords || 3, 1, 8), gs = []; let cur = [];
  // cortes en unidades de sentido: nunca terminar un bloque en "el", "de", "muy", "que"… si la frase sigue
  const weak = w => CAP_WEAK.has(normWord(w.w)) && !/[.,;:?!…]$/.test(w.w);
  ws.forEach((w, i) => {
    cur.push(w); const nx = ws[i + 1];
    const hardEnd = /[.,;:?!…]$/.test(w.w) || !nx || nx.s - w.e > 0.45;
    const full = cur.length >= mw && !(weak(w) && cur.length < mw + 1 && nx && nx.s - w.e < 0.3);
    if (hardEnd || full) {
      // si el bloque llenó y el siguiente arranca con una palabra que necesita a esta, mover la última al siguiente
      if (!hardEnd && cur.length > 1 && weak(cur[cur.length - 1])) { const carry = []; while (cur.length > 1 && weak(cur[cur.length - 1])) carry.unshift(cur.pop()); gs.push({ s: cur[0].s, e: cur[cur.length - 1].e, words: cur }); cur = carry; return; }
      gs.push({ s: cur[0].s, e: cur[cur.length - 1].e, words: cur }); cur = [];
    }
  });
  gs.forEach((g, i) => { g.end = Math.min(gs[i + 1] ? gs[i + 1].s : g.e + 0.6, g.e + 0.6); });
  capCache.key = key; capCache.groups = gs; return gs;
}
function capLayout(ctx, P, t, env) {
  const c = P.captions; if (!c.on || !P.words?.length) return null;
  const gs = capGroups(P); const g = gs.find(g => t >= g.s - 0.05 && t < g.end); if (!g) return null;
  const st = CAPS[c.style] || CAPS.editorial, B = env.B, s = c.size || 1;
  ctx.font = st.font(B, s); setLS(ctx, (st.track || 0) + 'px'); const upc = c.upper || st.upper;
  const items = g.words.map(w => { const tx = upc ? w.w.toUpperCase() : w.w; return { w, tx, wd: ctx.measureText(tx).width }; });
  const sp = ctx.measureText(' ').width; setLS(ctx, '0px'); const maxW = CW, lines = [[]]; let lw = 0;
  items.forEach(it => { if (lw > 0 && lw + sp + it.wd > maxW) { lines.push([]); lw = 0; } lines[lines.length - 1].push(it); lw += (lw ? sp : 0) + it.wd; });
  const lh = st.size * s * 1.2, bh = lines.length * lh;
  let pos = c.pos || 'auto', cy = (c.y ?? .6) * H;
  if (pos === 'arriba') cy = SAFE.top + 140; else if (pos === 'centro') cy = H * .5; else if (pos === 'abajo') cy = H * .6;
  else { const f = faceAt(P, t); if (f) { const fy0 = (f[1] - f[3] * 0.4) * H, fy1 = (f[1] + f[3] * 1.3) * H; /* con pelo y mentón */ if (cy + bh / 2 > fy0 && cy - bh / 2 < fy1) cy = fy1 + bh / 2 + 40 < SAFE.bottom ? fy1 + bh / 2 + 40 : Math.max(SAFE.top + bh / 2 + 20, fy0 - bh / 2 - 40); } }
  cy = clamp(cy, SAFE.top + bh / 2, SAFE.bottom - bh / 2);
  return { g, st, lines, lh, sp, bh, cy, top: cy - bh / 2 - 20 };
}
function drawCaptions(ctx, P, t, env, lay) {
  if (!lay) return; const { g, st, lines, lh, sp, bh, cy } = lay, B = env.B;
  const ga = clamp((t - g.s + 0.05) / 0.12, 0, 1), go = clamp((t - (g.end - 0.12)) / 0.12, 0, 1), a = ga * (1 - go);
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.font = st.font(B, P.captions.size || 1); setLS(ctx, (st.track || 0) + 'px'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let active = null; for (const it of g.words) if (t >= it.s - 0.02) active = it;
  lines.forEach((ln, li) => {
    const lwid = ln.reduce((a2, it, i) => a2 + it.wd + (i ? sp : 0), 0); let x = (W - lwid) / 2; const y = cy - bh / 2 + lh * (li + .5) + (1 - ga) * 8;
    ln.forEach(it => {
      const isA = it.w === active, spoken = t >= it.w.s - 0.02;
      if (st.hl === 'box' && isA) { ctx.save(); shadowOff(ctx); rr(ctx, x - 14, y - lh * .45, it.wd + 28, lh * .9, 14); ctx.fillStyle = B.accent; ctx.fill(); ctx.restore(); ctx.fillStyle = onColor(B.accent); shadowOff(ctx); }
      else { shadowOn(ctx, env, .9); ctx.fillStyle = (st.hl === 'color' && isA) ? (lum(B.accent) < .08 ? '#ffd84d' : B.accent) : '#ffffff'; }
      ctx.globalAlpha = a * (spoken || st.future === 1 ? 1 : st.future);
      ctx.fillText(it.tx, x, y);
      x += it.wd + sp;
    });
  });
  shadowOff(ctx); ctx.restore();
}

/* ============ fondo de demostración ============ */
function drawDemoBg(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#26303f'); g.addColorStop(1, '#0d1016'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, c) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); };
  glow(280 + 120 * Math.sin(t * .3), 520 + 80 * Math.cos(t * .25), 760, 'rgba(110,150,255,.28)');
  glow(820 + 90 * Math.cos(t * .2), 1250 + 60 * Math.sin(t * .33), 820, 'rgba(255,170,120,.18)');
  // silueta de presentador
  const sx = 540 + 6 * Math.sin(t * .9);
  const body = ctx.createRadialGradient(sx, 1720, 60, sx, 1720, 520); body.addColorStop(0, 'rgba(8,10,14,.85)'); body.addColorStop(1, 'rgba(8,10,14,0)');
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(sx, 1840, 440, 560, 0, Math.PI, 0); ctx.fill();
  const head = ctx.createRadialGradient(sx, 930, 20, sx, 930, 200); head.addColorStop(0, 'rgba(8,10,14,.85)'); head.addColorStop(1, 'rgba(8,10,14,0)');
  ctx.fillStyle = head; ctx.beginPath(); ctx.arc(sx, 930, 200, 0, Math.PI * 2); ctx.fill();
}

/* ============ guías ============ */
function drawGuides(ctx, P, t, env) {
  if (S.safe) {
    ctx.save(); shadowOff(ctx);
    ctx.fillStyle = 'rgba(239,107,92,.16)'; ctx.fillRect(0, 0, W, SAFE.top); ctx.fillRect(0, SAFE.bottom, W, H - SAFE.bottom);
    ctx.fillStyle = 'rgba(233,171,67,.10)'; ctx.fillRect(0, SAFE.top, SAFE.side, SAFE.bottom - SAFE.top); ctx.fillRect(W - SAFE.side, SAFE.top, SAFE.side, SAFE.bottom - SAFE.top);
    ctx.setLineDash([14, 10]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.strokeRect(SAFE.side, SAFE.top, CW, SAFE.bottom - SAFE.top);
    ctx.strokeStyle = 'rgba(122,162,255,.7)'; ctx.strokeRect(W * .06, SAFE.top, W * .88, SAFE.bottom - SAFE.top);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '600 26px Geist, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Meta: 14% arriba', 24, SAFE.top - 16); ctx.fillText('35% abajo (interfaz de Reels)', 24, SAFE.bottom + 40);
    ctx.fillText('Margen de marca 10%', SAFE.side + 12, SAFE.top + 40);
    ctx.fillStyle = 'rgba(122,162,255,.95)'; ctx.fillText('Meta 6%', W * .06 + 10, SAFE.bottom - 18);
    // botones laterales de Reels/TikTok
    ctx.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(W - 70, 1060 + i * 130, 36, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  if (S.faces && P.faces?.length) {
    const f = faceAt(P, t); if (f) { ctx.save(); ctx.strokeStyle = '#4cc48e'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.strokeRect(f[0] * W, f[1] * H, f[2] * W, f[3] * H); ctx.setLineDash([]); ctx.fillStyle = '#4cc48e'; ctx.font = '600 26px Geist, sans-serif'; ctx.fillText('cara', f[0] * W + 8, f[1] * H - 10); ctx.restore(); }
  }
}

/* ============ composición de un cuadro ============ */
const DEMO = document.createElement('canvas');
const BASEBUF = document.createElement('canvas');
function drawFullBg(ctx, m, L, env) {
  const B = env.B, p = L.a * (1 - L.o);
  ctx.save(); ctx.globalAlpha *= p;
  if (m.bg === 'solido' || !env.base) { ctx.fillStyle = scrimFor(B); ctx.fillRect(0, 0, W, H); }
  else {
    if (CAN_FILTER) { ctx.filter = `blur(${Math.round(44 * env.k)}px)`; ctx.drawImage(env.base, -60, -60, W + 120, H + 120); ctx.filter = 'none'; }
    ctx.fillStyle = rgba(scrimFor(B), CAN_FILTER ? .7 : .9); ctx.fillRect(0, 0, W, H);
  }
  const rg = ctx.createRadialGradient(W * .15, H * .12, 0, W * .15, H * .12, W * 1.1); rg.addColorStop(0, rgba(B.accent, .16)); rg.addColorStop(1, rgba(B.accent, 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
function drawMotion(ctx, m, t, env) {
  const pr = PRESETS[m.type]; if (!pr) return;
  const L = mkL(m, t, env.P);
  ctx.save();
  const fit = m.layout !== 'full' && m.fit; if (fit) { ctx.translate(fit.ox, fit.oy + (fit.dy || 0)); ctx.scale(fit.s || 1, fit.s || 1); ctx.translate(-fit.ox, -fit.oy); }
  if ((m.tr || 'subir') === 'mascara') { ctx.beginPath(); ctx.rect(0, 0, W, H * L.ease(clamp(L.tl / .6, 0, 1))); ctx.clip(); }
  if (m.layout === 'full') drawFullBg(ctx, m, L, env);
  const tr = m.tr || 'subir';
  let al = L.a;
  if (tr === 'subir') ctx.translate(0, (1 - L.a) * 50 - L.o * 20);
  else if (tr === 'escala') { const s = .95 + .05 * L.a; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); }
  else if (tr === 'mascara') al = 1;
  ctx.globalAlpha *= al * (1 - L.o);
  const prevFull = env.inFull; env.inFull = m.layout === 'full';
  ctx.textBaseline = 'alphabetic';
  try { pr.draw(ctx, m, L, env); } catch (e) { console.warn('motion', m.type, e); }
  env.inFull = prevFull; ctx.restore();
}
function activeMotions(P, t, list) {
  return (list || P.motions || []).filter(m => t >= m.start && t < m.start + m.dur).sort((a, b) => a.start - b.start);
}
/* o: {source, sw, sh, frameNo, motions, captions:false, guides:false, demo:false} */
function composeFrame(ctx, t, o = {}) {
  const P = o.P || S.p; if (!P) return;
  const pw = ctx.canvas.width, ph = ctx.canvas.height, k = pw / W;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
  const env = { k, t, P, B: P.brand, base: null, capTop: SAFE.bottom, inFull: false };
  let base = null;
  if (o.source && o.sw) base = GR.render(o.source, o.sw, o.sh, pw, ph, (P.frame?.follow || P.frame?.zooms?.length) ? Object.assign({}, P, { frame: frameAt(P, t) }) : P, o.frameNo || 0);
  if (!base) {
    if (DEMO.width !== pw || DEMO.height !== ph) { DEMO.width = pw; DEMO.height = ph; }
    const dx = DEMO.getContext('2d'); dx.setTransform(k, 0, 0, k, 0, 0); drawDemoBg(dx, t); base = DEMO;
  }
  env.base = base;
  ctx.drawImage(base, 0, 0, pw, ph);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const list = activeMotions(P, t, o.motions);
  const fullOn = list.some(m => m.layout === 'full');
  let cap = null;
  if (o.captions !== false && !captionsHiddenAt(P, t, list)) cap = capLayout(ctx, P, t, env);
  if (cap) env.capTop = cap.top;
  // capa "detrás de la persona": texto, después la persona recortada encima
  const behind = fullOn ? [] : behindList(P, list);
  let drawnBehind = new Set();
  if (behind.length && o.source && o.sw) {
    const mask = matteAt(P, t);
    if (mask) {
      if (BASEBUF.width !== pw || BASEBUF.height !== ph) { BASEBUF.width = pw; BASEBUF.height = ph; }
      const bx = BASEBUF.getContext('2d'); bx.setTransform(1, 0, 0, 1, 0, 0); bx.drawImage(base, 0, 0); env.base = BASEBUF;
      for (const m of behind) { drawMotion(ctx, m, t, env); drawnBehind.add(m); }
      const cut = GR.render(o.source, o.sw, o.sh, pw, ph, (P.frame?.follow || P.frame?.zooms?.length) ? Object.assign({}, P, { frame: frameAt(P, t) }) : P, o.frameNo || 0, mask);
      if (cut) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cut, 0, 0, pw, ph); ctx.setTransform(k, 0, 0, k, 0, 0); }
    } else if (o.strictMatte) { for (const m of behind) drawnBehind.add(m); } // exportando: sin recorte todavía, no se dibuja encima de la cara
  }
  for (const m of list.filter(m => m.layout === 'full')) drawMotion(ctx, m, t, env);
  for (const m of list.filter(m => m.layout !== 'full' && !drawnBehind.has(m))) drawMotion(ctx, m, t, env);
  if (cap) drawCaptions(ctx, P, t, env, cap);
  if (o.guides) drawGuides(ctx, P, t, env);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
