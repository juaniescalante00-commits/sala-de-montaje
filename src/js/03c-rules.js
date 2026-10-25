/* ============ cámara, caras y reglas que nunca se rompen ============ */
/* Las caras de la tarea en la nube vienen en coordenadas del video (facesSpace "video").
   Acá se pasan al cuadro 9:16 según el encuadre de cada instante (zoom, paneo, seguimiento). */
const camCache = { key: '', pts: [] };
function faceTrack(P) {
  const fs = P.faces || [], key = fs.length + ':' + (fs[0]?.t ?? '') + ':' + (fs[fs.length - 1]?.t ?? '') + ':' + (P.facesSpace || '');
  if (camCache.key === key) return camCache.pts;
  const raw = fs.filter(f => f.caras?.length).map(f => { const c = f.caras.reduce((a, b) => (b[2] * b[3] > a[2] * a[3] ? b : a)); return { t: f.t, x: c[0] + c[2] / 2, y: c[1] + c[3] / 2, w: c[2], h: c[3] }; });
  camCache.key = key; camCache.pts = raw; return raw;
}
/* centro de cara suavizado (gaussiano de ±0.8 s); mantiene la última posición conocida */
function smoothFace(P, t) {
  const pts = faceTrack(P); if (!pts.length) return null;
  let sw = 0, sx = 0, sy = 0, sh = 0;
  for (const p of pts) { const d = p.t - t; if (Math.abs(d) > 1.6) continue; const w = Math.exp(-(d * d) / (2 * 0.55 * 0.55)); sw += w; sx += p.x * w; sy += p.y * w; sh += p.h * w; }
  if (sw < 0.05) { let best = null, bd = 1e9; for (const p of pts) { const d = Math.abs(p.t - t); if (d < bd) { bd = d; best = p; } } return best && bd < 6 ? best : null; }
  return { x: sx / sw, y: sy / sw, h: sh / sw };
}
function zoomAt(P, t) {
  let z = 1;
  for (const k of (P.frame?.zooms || [])) {
    const s = +k.s, e = +k.e, to = clamp(num(k.z, 1.12), 1, 1.8); if (!(e > s)) continue;
    const ramp = clamp(num(k.ramp, 0.45), 0.1, 2);
    let a = 0; if (t >= s && t <= e) a = Math.min(1, (t - s) / ramp, (e - t) / Math.min(ramp, 0.3));
    if (a > 0) z = Math.max(z, 1 + (to - 1) * EASES.suave(clamp(a, 0, 1)));
  }
  return z;
}
/* encuadre en el instante t: {zoom, x, y} como P.frame */
function frameAt(P, t) {
  const fr = P.frame || { zoom: 1, x: 0, y: 0 };
  const z = clamp((fr.zoom || 1) * zoomAt(P, t) * (fr.follow ? (fr.followZoom || 1.18) : 1), 1, 2.5);
  if (!fr.follow || !P.video) return { zoom: z, x: fr.x || 0, y: fr.y || 0 };
  const f = smoothFace(P, t); if (!f || P.facesSpace !== 'video') return { zoom: z, x: fr.x || 0, y: fr.y || 0 };
  const sw = P.video.w || 1080, sh = P.video.h || 1920, ta = W / H, sa = sw / sh;
  let cw, ch; if (sa > ta) { cw = (ta / sa) / z; ch = 1 / z; } else { cw = 1 / z; ch = (sa / ta) / z; }
  const want = clamp(num(fr.followY, 0.36), 0.2, 0.5);
  const cx = f.x, cy = f.y + ch * (0.5 - want);
  const x = cw < 0.999 ? clamp((cx - 0.5) * 2 / (1 - cw), -1, 1) : 0, y = ch < 0.999 ? clamp((cy - 0.5) * 2 / (1 - ch), -1, 1) : 0;
  return { zoom: z, x, y };
}
/* caja de cara del video → cuadro de salida normalizado (0-1) */
function videoBoxToOut(c, P, t) {
  if (P.facesSpace !== 'video') return c;
  const sw = P.video?.w || S.vw || 1080, sh = P.video?.h || S.vh || 1920;
  const cr = GR.cropFor(sw, sh, frameAt(P, t)); const x0 = cr[4], y0 = cr[5], cw = cr[2], ch = cr[3];
  return [(c[0] - x0) / cw, (c[1] - y0) / ch, c[2] / cw, c[3] / ch];
}
function facesNear(P, t, maxD = 0.6) {
  const fs = P?.faces; if (!fs?.length) return null;
  let best = null, bd = 1e9; for (const f of fs) { const d = Math.abs(f.t - t); if (d < bd) { bd = d; best = f; } }
  return best && bd <= maxD ? best : null;
}
function faceBoxOut(P, t) {
  const f = facesNear(P, t, P?.facesSpace === 'video' ? 0.6 : 2.5); if (!f || !f.caras?.length) return null;
  const c = f.caras.reduce((a, b) => (b[2] * b[3] > a[2] * a[3] ? b : a));
  return videoBoxToOut(c, P, t);
}
/* zona protegida (px 1080×1920): todas las caras entre t0 y t1, con pelo, frente y mentón */
function protectedBox(P, t0, t1) {
  const fs = P?.faces || []; let box = null;
  for (const f of fs) {
    if (f.t < t0 - 0.3 || f.t > t1 + 0.3) continue;
    for (const c0 of f.caras || []) {
      const c = videoBoxToOut(c0, P, f.t); if (c[2] < 0.03) continue;
      const x = (c[0] - c[2] * 0.15) * W, y = (c[1] - c[3] * 0.35) * H, w = c[2] * 1.3 * W, h = c[3] * 1.6 * H;
      box = box ? { x: Math.min(box.x, x), y: Math.min(box.y, y), x1: Math.max(box.x1, x + w), y1: Math.max(box.y1, y + h) } : { x, y, x1: x + w, y1: y + h };
    }
  }
  return box;
}

/* parte del tramo [t0, t1] en la que se ve una cara (0-1); null si no hay caras detectadas */
function faceShare(P, t0, t1) {
  const fs = (P?.faces || []).filter(f => f.t >= t0 && f.t <= t1); if (!fs.length) return (P?.faces || []).length ? 0 : null;
  return fs.filter(f => f.caras?.length).length / fs.length;
}
/* constantes de las reglas duras */
const CAPS_HIDE_MAX = 3.5;          // s máximos que una pieza puede apagar los subtítulos
const FULL_OVER_FACE_MAX = 2.5;     // s máximos de una pantalla completa sobre alguien que habla
const BIG_TEXT = new Set(['titulo', 'cita', 'palabra', 'codigo', '3d', 'plantilla', 'libre', 'contador']);
const MAX_DUR = { etiqueta: 4, lowerthird: 5, lista: 6, titulo: 4, cita: 5, palabra: 2.6, cta: 5, contador: 4.5, progreso: 4.5, barras: 6, comparacion: 6, bento: 6, grilla: 6, linea: 6, monograma: 3, codigo: 5, '3d': 5, plantilla: 6, libre: 6 };

/* ============ medir lo que dibuja una pieza ============ */
const MEAS = document.createElement('canvas'); MEAS.width = 270; MEAS.height = 480;
const MCTX = MEAS.getContext('2d', { willReadFrequently: true });
function revealTime(m) {
  const pr = PRESETS[m.type]; const n = Math.max(1, (pr?.labels?.(m.params) || []).length + 2);
  const last = Math.max(0, ...beatTimes(m, n));
  return m.start + clamp(last + 0.7, Math.min(0.8, m.dur * 0.5), Math.max(0.3, m.dur - 0.35));
}
/* caja (px de 1080×1920) de lo que la pieza pinta en el instante t, sin su ajuste si noFit */
function motionBox(m, P, t, noFit) {
  const k = MEAS.width / W, mm = noFit ? Object.assign({}, m, { fit: null }) : m;
  MCTX.setTransform(1, 0, 0, 1, 0, 0); MCTX.clearRect(0, 0, MEAS.width, MEAS.height); MCTX.globalAlpha = 1;
  MCTX.setTransform(k, 0, 0, k, 0, 0);
  const env = { k, t, P, B: P.brand, base: null, capTop: SAFE.bottom, inFull: false, measuring: true };
  try { drawMotion(MCTX, mm, t, env); } catch (e) { return null; }
  const d = MCTX.getImageData(0, 0, MEAS.width, MEAS.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < MEAS.height; y++) for (let x = 0; x < MEAS.width; x++) if (d[(y * MEAS.width + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  return { x: x0 / k, y: y0 / k, x1: (x1 + 1) / k, y1: (y1 + 1) / k };
}
function unionBox(a, b) { if (!a) return b; if (!b) return a; return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; }
function motionExtent(m, P, noFit) {
  const ts = [revealTime(m), m.start + m.dur * 0.55]; let box = null;
  for (const t of ts) box = unionBox(box, motionBox(m, P, t, noFit));
  return box;
}
function captionTopAt(P, t) {
  if (!P.captions?.on || !P.words?.length) return SAFE.bottom;
  const env = { k: 1, t, P, B: P.brand }; const lay = capLayout(MCTX, P, t, env);
  return lay ? lay.top : SAFE.bottom;
}

/* ============ texto de una pieza y comparación con lo que se dice ============ */
const STOP = new Set('de la el los las un una unos unas y o que en por con para es son se del al lo su sus mi mis tu tus te le les me nos ya mas pero como muy este esta esto ese esa eso hay a e no si sin sobre entre tambien'.split(' '));
function tokens(s) { return String(s || '').split(/[\s/·,.;:!?¡¿()"“”'\-–—]+/).map(normWord).filter(w => w && !STOP.has(w)).flatMap(w => /^\d+$/.test(w) ? [w, normWord(numEs(+w))] : [w]); }
function motionText(m) {
  if (m.type === 'codigo' || m.type === '3d') return String(m.params?.texto || '');
  if (m.type === 'plantilla') return Object.values(m.params?.textos || {}).join(' ');
  const pr = PRESETS[m.type]; const labs = (pr?.labels?.(m.params) || []).filter(x => typeof x === 'string');
  const p = m.params || {}; return labs.concat([p.eyebrow, p.sub, p.caption, p.note].filter(Boolean)).join(' ');
}
function spokenIn(P, t0, t1) { return (P.words || []).filter(w => w.s >= t0 && w.s <= t1).map(w => w.w).join(' '); }
function redundancy(m, P) {
  const mt = [...new Set(tokens(motionText(m)))]; if (mt.length < 2) return 0;
  const sp = new Set(tokens(spokenIn(P, m.start - 0.8, m.start + m.dur + 0.8)));
  const hit = mt.filter(w => sp.has(w) || [...sp].some(s => s.length >= 5 && w.length >= 5 && s.slice(0, 5) === w.slice(0, 5))).length;
  return hit / mt.length;
}
function hasText(m) { return tokens(motionText(m)).length > 0 || ['titulo', 'cita', 'lista', 'cta', 'lowerthird', 'etiqueta', 'contador', 'progreso'].includes(m.type); }
/* ¿se ocultan los subtítulos en t? (evita el doble texto) */
function captionsHiddenAt(P, t, list) {
  const mode = P.captions?.duringText || 'auto';
  for (const m of list) {
    if (m.layout === 'full' && P.captions.hideOnFull) return true;
    if (m.noCaps) return true;
    if (mode === 'ocultar' && hasText(m)) return true;
  }
  return false;
}

/* ============ las reglas ============ */
const RULES = [
  { id: 'cara', auto: true, fija: true, t: 'Nunca tapar la cara del presentador', d: 'Mido lo que dibuja cada pieza contra la cara detectada (con pelo y mentón) durante toda la pieza. Si se pisan, la muevo, la achico o la paso a pantalla completa.' },
  { id: 'doble', auto: true, fija: true, t: 'Nunca doble texto', d: 'Si un texto grande repite lo que se está diciendo, oculto los subtítulos solo mientras está (3,5 s como máximo): nunca un título grande y abajo el mismo texto. Una etiqueta o un zócalo chico nunca apagan los subtítulos.' },
  { id: 'musicacruda', auto: true, fija: true, t: 'Nunca dos músicas', d: 'Si el video ya trae música, no se agrega otra.' },
  { id: 'sonido', auto: true, fija: true, t: 'Nunca sonidos que no tienen que ver', d: 'Solo se usan sonidos del kit curado (whooshes suaves, impactos graves, risers cortos). Uno por pieza como máximo, separados al menos 5 s, y solo donde algo visible cambia.' },
  { id: 'zonas', auto: true, t: 'Todo dentro de las zonas seguras', d: 'Nada en el 14% de arriba ni en el 35% de abajo (interfaz de Reels y TikTok) y 10% de margen a los costados.' },
  { id: 'lectura', auto: true, t: 'Tiempo para leer', d: 'Cada texto queda en pantalla lo que tarda en leerse: 0,8 s más 0,32 s por palabra.' },
  { id: 'completa', auto: true, t: 'Pantallas completas cortas', d: 'Una pantalla completa no tapa a quien habla más de 2,5 s, ni dos seguidas. Si un texto no entra sin tapar la cara, se saca: nunca se convierte en una pantalla completa larga.' },
  { id: 'duracion', auto: true, t: 'Cada pieza dura lo justo', d: 'Etiquetas hasta 4 s, títulos 4 s, zócalos y CTA 5 s, listas y gráficos 6 s. Solo una marca de agua marcada como fija puede quedarse todo el video.' },
  { id: 'encima', auto: true, t: 'Una cosa por vez', d: 'Dos piezas no se pisan en el tiempo: la anterior termina antes de que entre la siguiente. Un solo bloque de subtítulo por vez.' },
  { id: 'pips', auto: true, t: 'Nada de pips', d: 'Ningún sonido sobre textos que entran sobre el video (pip, pop, ding, click, whoosh). Los sonidos quedan para pantallas completas y para un número que cae, con un impacto grave.' },
  { id: 'minizoom', auto: true, t: 'Nada de mini zooms', d: 'Ningún punch-in rápido para "dar ritmo". Solo acercamientos lentos (1,5 s o más), sutiles y separados por al menos 10 s; el seguimiento de cara es un reencuadre suave, no un zoom.' },
  { id: 'motivo', t: 'Cada pieza tiene un motivo', d: 'Explica, prueba un dato o resetea la atención. Nada decorativo.' },
  { id: 'murch', t: 'Emoción, historia, ritmo', d: 'Prioridad de Walter Murch: primero lo que el público tiene que sentir, después que avance la historia, después el ritmo. Cada cosa dura lo que tarda en entregar su información, ni un cuadro más.' },
  { id: 'sinplantilla', t: 'Nada de efectos de plantilla', d: 'Sin stickers, emojis, giros, barridos, glitches decorativos ni rebotes. Entradas sobrias: fundido, máscara o desplazamiento corto con easing suave.' },
  { id: 'estructura', t: 'Gancho, problema, demostración, prueba y CTA', d: 'Gancho en el primer segundo (promesa, declaración o pregunta), marca o producto en los primeros 3 s, sin intro ni logo al inicio, y CTA dicho y escrito al final dentro de la zona segura.' },
  { id: 'foco', t: 'Un solo foco', d: 'No compiten texto, movimiento y sonido al mismo tiempo.' },
  { id: 'gancho', t: 'Gancho en los primeros 3 s', d: 'Si hay texto de gancho, alto contraste y 4 a 6 s en pantalla.' },
  { id: 'zooms', t: 'Zooms solo para remarcar', d: 'Solo en el gancho, frases fuertes o cambios de tema. El resto del video, quieto.' },
  { id: 'musica', t: 'La música nunca tapa la voz', d: 'Ducking siempre y volumen bajo; master a −14 LUFS.' },
  { id: 'coherencia', t: 'Un solo estilo en todo el video', d: 'Mismas fuentes, colores y animaciones de principio a fin.' },
  { id: 'subs', t: 'Subtítulos cortos y legibles', d: 'Una línea (dos como máximo), hasta 42 caracteres por línea y 17 por segundo, cortados en unidades de sentido (no separar artículo y sustantivo ni nombre y apellido), entre 5/6 de segundo y 7 s en pantalla.' },
  { id: 'datos', t: 'Sin datos inventados', d: 'Solo números y nombres que se dicen o que da quien edita.' },
];
S.rules = { custom: [], off: [] };
S.sfxKit = null; // {id: uso}
function ruleOn(id) { return !(S.rules.off || []).includes(id) || RULES.find(r => r.id === id)?.fija; }
function rulesText() {
  const on = RULES.filter(r => ruleOn(r.id));
  return `REGLAS QUE NUNCA SE ROMPEN (el editor además las controla por código y corrige lo que las viole):\n${on.map(r => `- ${r.t}: ${r.d}`).join('\n')}${(S.rules.custom || []).length ? `\nREGLAS PROPIAS DE QUIEN EDITA (obligatorias):\n${S.rules.custom.map(r => '- ' + r).join('\n')}` : ''}`;
}
function sfxAllowed(id) {
  if (!id || id === 'ninguno') return true;
  if (!/^lib:/.test(id)) return !!SFX[id];
  const k = id.slice(4); if (!S.sfxKit) return true; // sin kit cargado no se juzga
  return !!S.sfxKit[k];
}

/* encuentra un ajuste {s, dy, ox, oy} que deje la caja dentro de la zona segura y fuera de la cara */
function placeBox(b, face, top, bottom) {
  const cx = (b.x + b.x1) / 2, cy = (b.y + b.y1) / 2, w = b.x1 - b.x, h = b.y1 - b.y;
  const maxW = W - SAFE.side - 120 + 20, avail = bottom - top;
  for (const s0 of [1, 0.9, 0.8, 0.72]) {
    const s = Math.min(s0, maxW / w, avail / h); if (s < 0.7) break; // más chico deja de leerse
    const y0 = cy - h * s / 2, y1 = cy + h * s / 2, xs0 = cx - w * s / 2, xs1 = cx + w * s / 2;
    let lo = top - y0, hi = bottom - y1; if (lo > hi) continue;
    const ivs = [];
    if (face && xs0 < face.x1 && xs1 > face.x) {
      const pad = 18; const upHi = face.y - pad - y1, dnLo = face.y1 + pad - y0;
      if (Math.min(hi, upHi) >= lo) ivs.push([lo, Math.min(hi, upHi)]);
      if (hi >= Math.max(lo, dnLo)) ivs.push([Math.max(lo, dnLo), hi]);
    } else ivs.push([lo, hi]);
    if (!ivs.length) continue;
    let best = null; for (const [a, c] of ivs) { const d = clamp(0, a, c); if (best == null || Math.abs(d) < Math.abs(best)) best = d; }
    return { s: +s.toFixed(3), dy: Math.round(best), ox: Math.round(cx), oy: Math.round(cy) };
  }
  return null;
}
function boxHitsFace(b, face) { return face && b && b.x < face.x1 && b.x1 > face.x && b.y < face.y1 && b.y1 > face.y; }
function fitBox(b, fit) { if (!fit || !b) return b; const s = fit.s || 1, ox = fit.ox, oy = fit.oy, dy = fit.dy || 0; return { x: ox + (b.x - ox) * s, x1: ox + (b.x1 - ox) * s, y: oy + (b.y - oy) * s + dy, y1: oy + (b.y1 - oy) * s + dy }; }

/* corre todas las reglas automáticas sobre el proyecto (dentro de mutate). Devuelve {fixes, warns} */
function enforceRules(P) {
  const fixes = [], warns = [];
  const ms = P.motions.slice().sort((a, b) => a.start - b.start);
  const name = m => `${PRESETS[m.type]?.name || m.type} de ${mmss(m.start)}`;
  // 0) dentro del video
  for (const m of ms) { if (m.start + m.dur > P.duration + 0.01) { m.dur = Math.max(0.8, +(P.duration - m.start).toFixed(2)); } }
  // 7) una cosa por vez (solo piezas sobre el video; las completas pueden convivir con un zócalo)
  if (ruleOn('encima')) {
    for (let i = 0; i < ms.length - 1; i++) {
      const a = ms[i], b = ms[i + 1];
      if (a.start + a.dur > b.start - 0.1 && !(a.layout === 'full' && b.layout === 'full')) {
        const nd = +(b.start - 0.12 - a.start).toFixed(2);
        if (nd >= 1.2) { a.dur = nd; fixes.push(`Acorté ${name(a)} para que no se pise con la siguiente.`); }
        else { const ns = +(a.start + a.dur + 0.12).toFixed(2); if (ns + 1.2 <= P.duration) { const d = ns - b.start; b.start = ns; b.beats = (b.beats || []).map(x => x == null ? null : +(x + d).toFixed(3)); fixes.push(`Corrí ${name(b)} para que no se pise con la anterior.`); } }
      }
    }
  }
  // 6a) ninguna pieza se queda más de lo que necesita (las marcas de agua fijas son la excepción)
  for (const m of ms) {
    const mx = MAX_DUR[m.type]; if (!ruleOn('duracion') || !mx || m.params?.fija) continue;
    if (m.dur > mx + 0.05) { m.dur = mx; fixes.push(`Dejé ${name(m)} en ${String(mx).replace('.', ',')} s: estaba demasiado tiempo en pantalla.`); }
  }
  // 6b) pantallas completas: si tapan a alguien que habla, como mucho ${FULL_OVER_FACE_MAX} s; sin caras, 4,5 s
  if (ruleOn('completa')) for (const m of ms) {
    if (m.layout !== 'full') continue;
    const share = faceShare(P, m.start, m.start + m.dur), speaking = spokenIn(P, m.start, m.start + m.dur).split(/\s+/).filter(Boolean).length > 2;
    const mx = share != null && share > 0.4 && speaking ? FULL_OVER_FACE_MAX : 4.5;
    if (m.dur > mx + 0.05) { m.dur = mx; fixes.push(`Dejé ${name(m)} en ${String(mx).replace('.', ',')} s para no tapar a quien habla.`); }
  }
  // 6c) dos pantallas completas seguidas no suman más de 4 s sobre alguien que habla
  if (ruleOn('completa')) for (let i = 0; i < ms.length - 1; i++) {
    const a = ms[i], b = ms[i + 1]; if (a.layout !== 'full' || b.layout !== 'full') continue;
    if (b.start - (a.start + a.dur) < 1.5 && (faceShare(P, a.start, b.start + b.dur) ?? 0) > 0.4) { P.motions = P.motions.filter(x => x !== b); ms.splice(i + 1, 1); i--; fixes.push(`Saqué ${name(b)}: dos pantallas completas seguidas tapaban a quien habla.`); }
  }
  // 5) tiempo de lectura
  if (ruleOn('lectura')) for (let i = 0; i < ms.length; i++) {
    const m = ms[i], n = motionText(m).split(/\s+/).filter(Boolean).length;
    const need = m.type === 'palabra' ? 1.2 : clamp(0.8 + n * 0.32, 1.4, m.layout === 'full' ? 4.5 : 8); // la palabra gigante se lee de un golpe
    if (m.dur + 0.05 < need) {
      const room = (ms[i + 1] ? ms[i + 1].start - 0.12 : P.duration) - m.start;
      const nd = +Math.min(need, room).toFixed(2); if (nd > m.dur + 0.1) { fixes.push(`Alargué ${name(m)} a ${nd.toFixed(1)} s para que se llegue a leer.`); m.dur = nd; }
      else warns.push(`${name(m)} tiene mucho texto para el tiempo que dura.`);
    }
  }
  // 2) doble texto: un texto GRANDE que repite lo que se dice oculta los subtítulos, pero solo un rato corto.
  //    Una etiqueta o un zócalo chico nunca apaga los subtítulos.
  if (ruleOn('doble')) for (const m of ms) {
    if (m.layout === 'full' && P.captions?.hideOnFull) { if (!m.noCapsManual) delete m.noCaps; continue; }
    const big = BIG_TEXT.has(m.type) || m.layout === 'full';
    const r = m.type === 'cita' || m.type === 'palabra' ? 1 : redundancy(m, P);
    const want = big && r >= 0.45 && hasText(m) && P.captions?.on;
    if (want && m.dur > CAPS_HIDE_MAX + 0.05) { m.dur = CAPS_HIDE_MAX; fixes.push(`${name(m)} repetía lo que se dice durante mucho tiempo: la dejé en ${CAPS_HIDE_MAX} s para no dejar el video sin subtítulos.`); }
    if (want && !m.noCaps) { m.noCaps = true; fixes.push(`${name(m)} repite lo que se dice: oculto los subtítulos solo mientras está.`); }
    else if (!want && m.noCaps && !m.noCapsManual) { delete m.noCaps; if (!big) fixes.push(`${name(m)} es un texto chico: los subtítulos siguen visibles.`); }
  }
  // 2b) nunca más de ${CAPS_HIDE_MAX} s seguidos sin subtítulos por culpa de piezas
  if (P.captions?.on && P.words?.length) {
    const hid = ms.filter(m => m.noCaps && m.layout !== 'full').map(m => [m.start, m.start + m.dur]).sort((a, b) => a[0] - b[0]);
    let run = null; for (const [a, b] of hid) { if (run && a <= run[1] + 0.3) run[1] = Math.max(run[1], b); else { if (run && run[1] - run[0] > CAPS_HIDE_MAX + 1.5) warns.push(`Los subtítulos quedan ocultos de ${mmss(run[0])} a ${mmss(run[1])}: es demasiado.`); run = [a, b]; } }
    if (run && run[1] - run[0] > CAPS_HIDE_MAX + 1.5) warns.push(`Los subtítulos quedan ocultos de ${mmss(run[0])} a ${mmss(run[1])}: es demasiado.`);
  }
  // 1) cara y zonas seguras (solo piezas sobre el video)
  const facesKnown = (P.faces || []).some(f => f.caras?.length);
  if (P.video && !facesKnown && ms.some(m => m.layout !== 'full')) warns.push('Todavía no tengo la cara detectada: no puedo garantizar que ningún texto la tape.');
  for (const m of ms) {
    if (m.layout === 'full') { delete m.fit; continue; }
    // detrás de la persona: el recorte garantiza que nunca tapa la cara (solo mientras hay alguien en cuadro)
    if (m.behind) { if (matteInfo(P) && (faceShare(P, m.start, m.start + m.dur) ?? 0) >= 0.8) { delete m.fit; continue; } delete m.behind; fixes.push(`${name(m)} no puede ir detrás de la persona en ese momento: la traté como un texto normal.`); }
    const base = motionExtent(m, P, true); if (!base) continue;
    const face = (ruleOn('cara') && facesKnown) ? protectedBox(P, m.start, m.start + m.dur) : null;
    const capsShown = P.captions?.on && !m.noCaps && !captionsHiddenAt(P, m.start + m.dur / 2, [m]);
    const bottom = Math.min(SAFE.bottom, capsShown ? captionTopAt(P, m.start + m.dur / 2) - 16 : SAFE.bottom);
    const top = SAFE.top + 8;
    const cur = fitBox(base, m.fit);
    const okNow = !boxHitsFace(cur, face) && cur.y >= top - 2 && cur.y1 <= Math.max(bottom, top + 40) + 2 && cur.x >= SAFE.side - 30 && cur.x1 <= W - 120 + 20;
    if (okNow) continue;
    const fit = placeBox(base, face, top, Math.max(bottom, top + 40));
    if (fit && (fit.s < 0.999 || fit.dy !== 0)) {
      m.fit = fit; const why = boxHitsFace(fitBox(base, null), face) ? 'tapaba la cara' : 'se salía de la zona segura';
      fixes.push(`${name(m)} ${why}: la ${fit.dy < 0 ? 'subí' : fit.dy > 0 ? 'bajé' : 'dejé en su lugar'}${fit.s < 0.999 ? ` y la achiqué al ${Math.round(fit.s * 100)}%` : ''}.`);
    } else if (fit) { delete m.fit; }
    else if (boxHitsFace(base, face)) {
      // antes la pasaba a pantalla completa: eso terminaba tapando a quien habla. Ahora solo si es corta y no hay otra cerca.
      const nearFull = ms.some(o => o !== m && o.layout === 'full' && Math.abs(o.start - m.start) < 6);
      if (m.dur <= FULL_OVER_FACE_MAX + 0.05 && !nearFull && ['titulo', 'contador', 'comparacion', 'barras', 'bento', 'progreso', 'linea', 'grilla'].includes(m.type)) { m.layout = 'full'; m.bg = m.bg || 'video'; delete m.fit; fixes.push(`${name(m)} no entraba sin tapar la cara: la pasé a pantalla completa (es corta).`); }
      else { P.motions = P.motions.filter(x => x !== m); fixes.push(`Saqué ${name(m)}: tapaba la cara y no había lugar libre.`); }
    }
  }
  // 3) sonidos
  if (ruleOn('sonido')) {
    let last = -99, count = 0; const maxN = Math.max(1, Math.ceil(P.duration / 7));
    for (const m of ms) {
      if (!m.sfx || m.sfx === 'ninguno') continue;
      if (!sfxAllowed(m.sfx)) { m.sfx = 'ninguno'; fixes.push(`Saqué un sonido de ${name(m)} que no es del kit profesional.`); continue; }
      if (m.tr === 'fundido' && m.layout !== 'full' && /whoosh|aire/.test(m.sfx + (S.sfxKit?.[m.sfx.slice(4)] || ''))) { m.sfx = 'ninguno'; fixes.push(`Saqué el whoosh de ${name(m)}: entra con fundido, no hay movimiento que lo justifique.`); continue; }
      if (m.start - last < 5 || count >= maxN) { m.sfx = 'ninguno'; fixes.push(`Saqué el sonido de ${name(m)}: había otro muy cerca.`); continue; }
      last = m.start; count++;
    }
  }
  if (ruleOn('pips')) for (const m of ms) {
    if (!m.sfx || m.sfx === 'ninguno' || m.layout === 'full') continue;
    const uso = /^lib:/.test(m.sfx) ? (S.sfxKit?.[m.sfx.slice(4)] || '') : m.sfx;
    const numero = ['contador', 'progreso', 'barras'].includes(m.type);
    if (!(numero && /impacto|sub/.test(uso))) { m.sfx = 'ninguno'; fixes.push(`Saqué el sonido de ${name(m)}: es un texto sobre el video (nada de pips).`); }
  }
  if (ruleOn('minizoom') && P.frame?.zooms?.length) {
    const keep = []; let last = -99;
    for (const z of P.frame.zooms.slice().sort((a, b) => a.s - b.s)) {
      const len = z.e - z.s;
      if (len < 1.5 || z.s - last < 10) { fixes.push(`Saqué un zoom en ${mmss(z.s)}: era un mini zoom (corto o muy seguido).`); continue; }
      if (z.z > 1.15) { z.z = 1.15; z.ramp = Math.max(z.ramp || 0, 1); }
      z.ramp = Math.max(num(z.ramp, .45), Math.min(1.2, len * 0.6)); keep.push(z); last = z.s;
    }
    P.frame.zooms = keep;
  }
  // música: si el crudo ya trae música, nunca se agrega otra
  if (P.audio?.rawMusic && P.music) { P.music = null; fixes.push('Saqué la música agregada: el video ya trae música propia.'); }
  if (P.music && (P.music.volume ?? 0.2) > 0.3) { P.music.volume = 0.22; fixes.push('Bajé la música para que no tape la voz.'); }
  if (P.music && P.music.duck === false) { P.music.duck = true; fixes.push('Activé el ducking de la música.'); }
  return { fixes, warns };
}
/* aplica las reglas como un paso deshacible y lo cuenta */
function runRules(silent) {
  if (!S.p) return { fixes: [], warns: [] };
  let res = { fixes: [], warns: [] };
  mutate(p => { res = enforceRules(p); }, { coalesce: 'rules' });
  S.lastRules = Object.assign({ at: Date.now() }, res);
  if (!silent) toast(res.fixes.length ? `Reglas: corregí ${res.fixes.length} cosa${res.fixes.length > 1 ? 's' : ''}.` : res.warns.length ? res.warns[0] : 'Todo cumple las reglas.', 5000);
  return res;
}
