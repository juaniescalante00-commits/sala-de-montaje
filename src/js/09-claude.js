/* ============ Claude dentro de la página ============ */
const BEAT_NAMES = {
  titulo: ['antetítulo', 'titular', 'bajada'], contador: ['antetítulo', 'número', 'etiqueta', 'bajada'], grilla: ['antetítulo', 'titular', 'bajada (se resaltan puntos)'],
  comparacion: ['antetítulo', 'desde', 'hasta', 'bajada'], barras: ['titular', 'barra 1', 'barra 2', 'barra n'], bento: ['tarjeta 1', 'tarjeta 2', 'tarjeta n'],
  lowerthird: ['nombre', 'cargo'], cita: ['frase', 'autor'], lista: ['titular', 'ítem 1', 'ítem 2', 'ítem n'], progreso: ['antetítulo', 'porcentaje', 'etiqueta', 'bajada'],
  linea: ['titular', 'paso 1', 'paso 2', 'paso n'], cta: ['titular', 'botón', 'nota'], monograma: ['iniciales', 'nombre', 'bajada'], etiqueta: ['texto'], libre: ['elemento 1', 'elemento 2', 'elemento n (o usá "at" en cada elemento)'], codigo: ['texto'], '3d': ['texto'], plantilla: ['textos'],
};
function catalogText() {
  return Object.values(PRESETS).map(pr => ['codigo', '3d', 'plantilla', 'inserto'].includes(pr.key) ? `- "${pr.key}" (${pr.name}): ${pr.desc} (ver abajo)` : `- "${pr.key}" (${pr.name}): ${pr.desc} params por defecto: ${JSON.stringify(pr.defaults)}. Orden de beats: ${(BEAT_NAMES[pr.key] || ['elemento 1', 'elemento n']).join(', ')}.`).join('\n');
}
function wordsText(ws) { return ws.map(w => `${w.w}@${w.s.toFixed(2)}`).join(' '); }
function sampleErr(e) {
  const c = e?.code;
  return ({
    not_granted: 'No se dio permiso para que esta página use Claude.', sampling_disabled: 'Claude no está disponible para esta cuenta.',
    rate_limited: 'Claude está ocupado o se llegó al límite de uso. Probá en un rato.', invalid_json: 'La respuesta no vino en el formato esperado. Probá de nuevo.',
    refused: 'Claude no quiso hacer este pedido. Cambiá las indicaciones.', prompt_too_large: 'El proyecto es demasiado largo para un solo pedido.',
    images_unavailable: 'Esta vista no puede mandarle imágenes a Claude.', image_rejected: 'Claude no aceptó las imágenes.', cancelled: 'Pedido cancelado.',
    session_expired: 'La sesión venció: volvé a iniciar sesión en claude.ai.',
  })[c] || 'Falló el pedido a Claude. Probá de nuevo.';
}
const STYLE_RULES = `REGLAS DE ESTILO DE LA AGENCIA
- Estética minimalista y editorial. Los elementos entran de a uno, nunca todos juntos.
- Nada de mini zooms repetidos ni efectos que rebotan.
- Sonido minimalista: "ninguno" por defecto; whoosh o aire solo al entrar una pantalla completa, un impacto grave solo cuando cae un número. Nunca sonidos sobre textos que entran sobre el video, nunca tic ni pip.
- Los textos respetan zonas seguras (eso lo resuelve el editor) y nunca tapan la cara (usá pos "auto").
- Textos cortos, en el idioma del video, sin emojis. Titulares de 2 a 7 palabras.
- No inventes datos: si un número no aparece en lo que se dice, no lo pongas.`;

function planPrompt(P) {
  return `Sos director/a de motion graphics en UGC Studio, una agencia que produce anuncios verticales 9:16 para Meta Ads, TikTok y Reels.
Tarea: diseñar los motion graphics que acompañan este video. Cada pieza ilustra lo que la persona dice en ese momento, como en una revisión profesional antes de armar la línea de tiempo.

${STYLE_RULES}
- Piezas separadas, nunca superpuestas. Aproximadamente una pieza cada 5 a 9 segundos. Duración de cada pieza entre 2.5 y 7 s.
- "layout": "overlay" (sobre el video, la persona sigue visible) o "full" (pantalla completa). Como máximo 1 de cada 3 piezas en "full".
- "beats": segundos ABSOLUTOS en que se nombra cada elemento, en el orden de beats del tipo, tomados del transcript (formato palabra@segundo). Usá null si un elemento no se nombra.
- "quote": lo que dice la persona durante la pieza, literal. "desc": qué se mueve, en 1 o 2 frases para el editor.
${P.notes ? `\nNOTAS DEL PROYECTO: ${P.notes}` : ''}${S.planHint ? `\nINDICACIONES DE QUIEN EDITA: ${S.planHint}` : ''}

TIPOS DISPONIBLES (usá solo estos y estos params):
${catalogText()}

MARCA: ${P.brand.name} · títulos en ${P.brand.display}${P.brand.upper ? ' (mayúsculas)' : ''}.
DURACIÓN DEL VIDEO: ${P.duration.toFixed(1)} s.

TRANSCRIPT (palabra@segundo):
${wordsText(P.words)}

Respondé solo con JSON con esta forma:
{"motions":[{"type":"contador","start":0.6,"dur":4,"layout":"overlay","pos":"auto","bg":"video","tr":"subir","sfx":"ninguno","params":{...},"beats":[0.6,1.8,2.1,null],"quote":"...","desc":"..."}]}`;
}
function resolveOverlaps(ms, dur) {
  ms.sort((a, b) => a.start - b.start); let end = 0;
  for (const m of ms) { if (m.start < end) { const d = end + 0.05 - m.start; m.start = +(end + 0.05).toFixed(2); m.dur = +Math.max(1, m.dur - d).toFixed(2); } m.start = clamp(m.start, 0, Math.max(0, dur - 1)); m.dur = +Math.min(m.dur, dur - m.start).toFixed(2); end = m.start + m.dur; }
  return ms.filter(m => m.dur >= 0.8);
}
async function planWithClaude() {
  const P = S.p; if (!S.sample || !P?.words?.length || S.busy.plan) return;
  S.busy.plan = true; S.planCtl = new AbortController(); renderLeft();
  try {
    const res = await S.sample.json(planPrompt(P), { signal: S.planCtl.signal, onText: ({ text }) => { const o = $('#planOut'); if (o) o.textContent = `Claude está escribiendo el plan… ${text.length} caracteres`; } });
    const arr = Array.isArray(res) ? res : res?.motions;
    if (!Array.isArray(arr) || !arr.length) throw { code: 'invalid_json' };
    let ms = arr.filter(x => x && PRESETS[x.type]).map(x => sanitizeMotion(Object.assign({}, x, { id: null, status: 'pendiente', comment: '' })));
    ms = resolveOverlaps(ms, P.duration);
    for (const m of ms) { if (!m.beats?.some(b => b != null)) syncBeats(m, false); if (!m.quote) m.quote = quoteFor(P, m); }
    if (S.p !== P) return;
    const had = P.motions.length;
    mutate(p => { p.motions = ms; p.round = had ? (p.round || 1) + 1 : 1; });
    S.qc = {}; toast(`Claude planificó ${ms.length} piezas.${had ? ' Si preferís las anteriores, usá Deshacer.' : ''} Revisalas en Revisión.`, 6000);
  } catch (e) { if (e?.code !== 'cancelled') toast(sampleErr(e), 6000); }
  S.busy.plan = false; S.planCtl = null; if (S.mode === 'editor') renderLeft();
}

function applyPrompt(P, ms) {
  const pieces = ms.map(m => { const c = clone(m); delete c.hist; delete c._quoteEdited; const ws = (P.words || []).filter(w => w.s >= m.start - 3 && w.s <= m.start + m.dur + 3); return Object.assign(c, { comentario: m.comment, transcript_del_tramo: wordsText(ws) }); });
  return `Sos motion designer en UGC Studio (anuncios verticales 9:16). Aplicá los comentarios de revisión a estas piezas de motion graphics.

- Cambiá solo lo que pide cada comentario y dejá todo lo demás igual.
- Si algo no se puede con los parámetros disponibles, hacé lo más parecido y explicalo en "cambios".
- Campos que podés cambiar: type, start, dur, layout ("overlay"|"full"), pos ("auto"|"arriba"|"centro"|"abajo"), bg ("video"|"solido"), tr ("subir"|"fundido"|"escala"|"mascara"), sfx ("ninguno"|"whoosh"|"aire"|"sub"|"riser"), stagger (segundos entre elementos cuando no hay beats), params, beats (segundos ABSOLUTOS en que entra cada elemento, en el orden de beats del tipo; null = automático), desc.
- "Más lento" o "que respire" = más separación entre beats o más stagger. "Que entre cuando dice X" = el beat va en el segundo de esa palabra en transcript_del_tramo.
- Si cambiás tipo o params, mantené el formato de params de ese tipo.
${STYLE_RULES}

TIPOS:
${catalogText()}

DURACIÓN DEL VIDEO: ${P.duration.toFixed(1)} s

PIEZAS:
${JSON.stringify(pieces)}

Respondé solo con JSON: {"piezas":[{"id":"<id>", ...solo los campos que cambian..., "desc":"qué se mueve ahora", "cambios":"resumen en una frase de lo que hiciste"}]}`;
}
async function applyCommentWithClaude(ids) {
  const P = S.p; const ms = ids.map(id => P.motions.find(m => m.id === id)).filter(m => m && m.comment.trim());
  if (!ms.length || !S.sample || S.busy.apply) return;
  S.busy.apply = true; S.busy.applyOne = ms.length === 1 ? ms[0].id : null; renderReview();
  try {
    const res = await S.sample.json(applyPrompt(P, ms));
    const arr = Array.isArray(res) ? res : res?.piezas || (res?.id ? [res] : []);
    let n = 0;
    if (S.p === P) mutate(p => {
      for (const u of arr) {
        const m = p.motions.find(x => x.id === u?.id); if (!m) continue;
        const prev = clone(m); delete prev.hist;
        const merged = Object.assign({}, m, u, { id: m.id, params: Object.assign({}, m.params, u.params || {}) });
        if (u.type && u.type !== m.type) merged.params = Object.assign({}, u.params || {});
        const nm = sanitizeMotion(merged);
        nm.hist = (m.hist || []).concat([{ at: Date.now(), comment: m.comment, resumen: String(u.cambios || u.resumen || ''), prev }]).slice(-4);
        nm.status = 'pendiente'; nm.comment = '';
        if (u.quote == null) nm.quote = m._quoteEdited && m.start === nm.start ? m.quote : quoteFor(p, nm);
        for (const k of Object.keys(m)) delete m[k]; Object.assign(m, nm); n++;
      }
      if (n && ms.length > 1) p.round = (p.round || 1) + 1;
    });
    toast(n ? `Claude aplicó ${n} cambio${n > 1 ? 's' : ''}. Quedaron como pendientes para que los revises.` : 'Claude no devolvió cambios para esas piezas.', 5000);
    if (n && ms.length === 1) { S.busy.apply = false; S.busy.applyOne = null; rvSelect(ms[0].id); return; }
  } catch (e) { toast(sampleErr(e), 6000); }
  S.busy.apply = false; S.busy.applyOne = null; if (S.mode === 'review') renderReview();
}

async function frameBlob(t, w, opts) {
  seek(t); await waitSeek();
  const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * 16 / 9);
  composeFrame(c.getContext('2d'), t, Object.assign({ source: S.videoReady ? VID : null, sw: VID.videoWidth, sh: VID.videoHeight }, opts));
  return await new Promise(r => c.toBlob(r, 'image/jpeg', .86));
}
async function qcWithClaude() {
  const P = S.p, all = sortedMotions(); if (!S.sample || !all.length || S.busy.qc) return;
  const lim = await S.sample.limits().catch(() => null);
  if (!lim?.images) { toast('Esta vista no puede mandarle imágenes a Claude.'); return; }
  const ms = all.slice(0, Math.min(lim.images.maxCount || 8, 12));
  const tBack = S.t; S.busy.qc = true; pause(); if (S.mode === 'review') renderReview(); else if (S.mode === 'export') renderExport();
  try {
    const blobs = []; for (const m of ms) blobs.push(await frameBlob(m.start + Math.min(m.dur * .72, m.dur - .4), 540));
    const prompt = `Sos el control de calidad de motion graphics de una agencia de anuncios verticales 9:16 (Meta, TikTok, Reels).
Te paso ${ms.length} imágenes en orden: cada una es un cuadro de una pieza, casi al final de su animación.
Revisá cada una: textos legibles, nada importante en el 14% superior ni en el 35% inferior, al menos 10% de margen a los costados, que los paneles o subtítulos no tapen la cara, ortografía, jerarquía y coherencia de marca, y que el texto coincida con lo que se dice.
PIEZAS:
${ms.map((m, i) => `Imagen ${i + 1} · id ${m.id} · ${PRESETS[m.type].name} · ${LAYOUT_NAME[m.layout]} · dice: "${(m.quote || quoteFor(P, m)).slice(0, 200)}" · textos: ${JSON.stringify(m.params)}`).join('\n')}
Respondé solo con JSON: {"piezas":[{"id":"...","ok":true,"notas":"si hay problemas, qué corregir en una o dos frases"}]}`;
    const res = await S.sample.json(prompt, { images: blobs });
    const arr = Array.isArray(res) ? res : res?.piezas || []; let bad = 0;
    for (const r of arr) { if (!r?.id) continue; if (r.ok === false && r.notas) { S.qc[r.id] = String(r.notas); bad++; } else delete S.qc[r.id]; }
    toast(bad ? `Control de calidad: ${bad} pieza${bad > 1 ? 's' : ''} con observaciones.` : 'Control de calidad: todo en orden.', 5000);
    if (all.length > ms.length) toast(`Revisé las primeras ${ms.length} piezas (límite de imágenes por pedido).`, 5000);
  } catch (e) { toast(sampleErr(e), 6000); }
  S.busy.qc = false; seek(tBack); if (S.mode === 'review') renderReview(); else if (S.mode === 'export') renderExport();
}
async function detectFacesWithClaude() {
  const P = S.p; if (!S.sample || !P?.video || S.busy.faces) return;
  const lim = await S.sample.limits().catch(() => null);
  if (!lim?.images) { toast('Esta vista no puede mandarle imágenes a Claude.'); return; }
  const n = clamp(Math.ceil(P.duration / 3), 2, Math.min(lim.images.maxCount || 8, 10)); const times = Array.from({ length: n }, (_, i) => +((i + .5) * P.duration / n).toFixed(2));
  const tBack = S.t; S.busy.faces = true; pause(); renderExport();
  try {
    const blobs = []; for (const t of times) blobs.push(await frameBlob(t, 360, { motions: [], captions: false }));
    const res = await S.sample.json(`Te paso ${n} cuadros de un video vertical 9:16, en orden. Para cada imagen devolvé las caras humanas visibles como rectángulos [x, y, ancho, alto] normalizados de 0 a 1 respecto de la imagen (origen arriba a la izquierda), incluyendo frente y mentón. Si no hay cara, lista vacía.
Respondé solo con JSON: {"cuadros":[{"i":1,"caras":[[0.31,0.18,0.38,0.24]]}]}`, { images: blobs });
    const arr = res?.cuadros || (Array.isArray(res) ? res : []);
    const faces = times.map((t, i) => { const r = arr.find(x => +x.i === i + 1) || arr[i] || {}; const caras = (r.caras || []).filter(b => Array.isArray(b) && b.length === 4).map(b => b.map(v => clamp(+v, 0, 1))); return { t, caras }; });
    mutate(p => { p.faces = faces; });
    S.faces = true; $('#tgFaces').setAttribute('aria-pressed', 'true');
    toast(`Caras detectadas en ${faces.filter(f => f.caras.length).length} de ${n} cuadros. Subtítulos y paneles en "Auto" las esquivan.`, 5000);
  } catch (e) { toast(sampleErr(e), 6000); }
  S.busy.faces = false; seek(tBack); renderExport();
}
async function fixWordsWithClaude() {
  const P = S.p; if (!S.sample || !P?.words?.length || S.busy.fix) return;
  S.busy.fix = true; renderLeft();
  try {
    const list = P.words.map((w, i) => `${i}:${w.w}`).join(' ');
    const res = await S.sample.json(`Corregí errores de una transcripción automática en español (nombres propios, marcas, números, palabras mal oídas). No cambies el orden, no unas ni separes palabras y mantené la puntuación pegada a cada palabra.
Contexto: proyecto "${P.name}". ${P.notes || ''}
PALABRAS (índice:palabra):
${list}
Respondé solo con JSON con las palabras que cambian: {"cambios":[{"i":12,"w":"Atlas"}]}`, { modelTier: 'quick' });
    const ch = (res?.cambios || []).filter(c => Number.isInteger(+c.i) && P.words[+c.i] && typeof c.w === 'string' && c.w.trim());
    if (ch.length) mutate(p => { for (const c of ch) p.words[+c.i].w = c.w.trim(); p._wv = (p._wv || 0) + 1; });
    toast(ch.length ? `Claude corrigió ${ch.length} palabra${ch.length > 1 ? 's' : ''}.` : 'Claude no encontró errores.');
  } catch (e) { toast(sampleErr(e)); }
  S.busy.fix = false; renderLeft();
}
