/* ============ pieza "inserto": animación renderizada afuera ============
   La hace la edición a fondo con Remotion, GSAP, three.js, Lottie o HTML (tools/html_inserto.js, tools/a_inserto.sh)
   y la sube como recurso. El clip es un MP4 "lado a lado": mitad izquierda = color, mitad derecha = alfa (blanco = opaco).
   params: clip (assetId), w × h (tamaño de UNA mitad), x, y (centro, 0 a 1), escala (ancho relativo a 1080),
           texto (lo que se lee en el clip, para la regla de doble texto), motor (remotion | gsap | three | lottie | html). */
const INS_PREV_W = 432;
const INS = { tracks: new Map(), prev: new Map(), cur: new Map(), its: new Map(), failed: new Set() };

/* compositor WebGL: lado a lado → RGBA con alfa recto */
const IX = { c: null, gl: null, ok: false, u: {} };
function ixInit() {
  if (IX.c) return IX.ok;
  IX.c = document.createElement('canvas'); IX.c.width = 4; IX.c.height = 4;
  let gl = null; try { gl = IX.c.getContext('webgl', { premultipliedAlpha: false, alpha: true, preserveDrawingBuffer: true }); } catch (e) { }
  if (!gl) return (IX.ok = false);
  const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  try {
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 v; void main(){ v = p*.5+.5; gl_Position = vec4(p,0.,1.); }'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float; uniform sampler2D T; varying vec2 v; void main(){ vec3 c = texture2D(T, vec2(v.x*.5, v.y)).rgb; float a = texture2D(T, vec2(.5+v.x*.5, v.y)).r; gl_FragColor = vec4(c, a); }'));
    gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.uniform1i(gl.getUniformLocation(pr, 'T'), 0);
    IX.gl = gl; IX.ok = true;
  } catch (e) { console.warn('inserto: sin WebGL, uso el modo lento', e); IX.ok = false; }
  return IX.ok;
}
/* src: canvas lado a lado (2w × h) → canvas nuevo w × h con alfa */
function ixCompose(src, w, h) {
  const out = document.createElement('canvas'); out.width = w; out.height = h; const ox = out.getContext('2d');
  if (ixInit()) {
    const gl = IX.gl; if (IX.c.width !== w || IX.c.height !== h) { IX.c.width = w; IX.c.height = h; }
    gl.viewport(0, 0, w, h); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ox.drawImage(IX.c, 0, 0);
  } else {
    const t = document.createElement('canvas'); t.width = w * 2; t.height = h; const tx = t.getContext('2d', { willReadFrequently: true });
    tx.drawImage(src, 0, 0, w * 2, h); const d = tx.getImageData(0, 0, w * 2, h).data, o = ox.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w * 2 + x) * 4, j = (y * w * 2 + x + w) * 4, k = (y * w + x) * 4; o.data[k] = d[i]; o.data[k + 1] = d[i + 1]; o.data[k + 2] = d[i + 2]; o.data[k + 3] = d[j]; }
    ox.putImageData(o, 0, 0);
  }
  return out;
}
async function insTrack(id) {
  if (!id || INS.failed.has(id)) return null;
  if (!INS.tracks.has(id)) INS.tracks.set(id, (async () => {
    try {
      const MB = await loadMB(); const r = await fetch('/_blob/' + id); if (!r.ok) throw new Error('inserto ' + r.status);
      const input = new MB.Input({ source: new MB.BlobSource(await r.blob()), formats: MB.ALL_FORMATS });
      return await input.getPrimaryVideoTrack();
    } catch (e) { console.warn('inserto', e); INS.failed.add(id); return null; }
  })());
  return INS.tracks.get(id);
}
function insDims(m) { const p = m.params; const w = Math.max(16, num(p.w, 1080)), h = Math.max(16, num(p.h, 1920)); return { w, h, fps: num(p.fps, 30) || 30 }; }
/* vista previa: todos los cuadros del clip a 432 px de ancho */
async function insLoadPreview(m) {
  const id = m.params.clip; if (!id) return; let e = INS.prev.get(id);
  if (e) return e.pend;
  e = { frames: new Map(), fps: insDims(m).fps, pend: null }; INS.prev.set(id, e);
  e.pend = (async () => {
    const tr = await insTrack(id); if (!tr) return;
    const MB = await loadMB(); const { w, h } = insDims(m); const pw = INS_PREV_W, ph = Math.round(pw * h / w);
    const sink = new MB.CanvasSink(tr, { width: pw * 2, height: ph, fit: 'fill', poolSize: 2 });
    for await (const wc of sink.canvases()) e.frames.set(Math.round(wc.timestamp * e.fps), ixCompose(wc.canvas, pw, ph));
  })().catch(err => console.warn('inserto', err));
  return e.pend;
}
/* cuadro del inserto en el tiempo local tl (sincrónico). Exportando: el cuadro a resolución completa preparado antes. */
function insFrameAt(m, tl) {
  if (EX.running && INS.cur.has(m.id)) return INS.cur.get(m.id);
  const id = m.params?.clip; if (!id) return null; const e = INS.prev.get(id);
  if (!e) { insLoadPreview(m); return null; }
  if (!e.frames.size) return null;
  const i = Math.max(0, Math.round(tl * e.fps)); let best = null;
  for (const d of [0, -1, 1, -2, 2, -3, 3]) { const f = e.frames.get(i + d); if (f) { best = f; break; } }
  if (!best) { let maxI = -1; for (const k of e.frames.keys()) if (k > maxI) maxI = k; if (i > maxI) best = e.frames.get(maxI); }
  return best;
}
/* antes de cada cuadro de la exportación: decodifica en orden y deja listo el cuadro de cada inserto activo */
async function insPrepareExport(P, t) {
  const act = (P.motions || []).filter(m => m.type === 'inserto' && t >= m.start && t < m.start + m.dur && m.params.clip);
  for (const m of act) {
    const tl = t - m.start; let it = INS.its.get(m.id);
    if (!it) {
      const tr = await insTrack(m.params.clip); if (!tr) continue;
      const MB = await loadMB(); const { w, h } = insDims(m);
      const sink = new MB.CanvasSink(tr, { width: w * 2, height: h, fit: 'fill', poolSize: 2 });
      it = { gen: sink.canvases()[Symbol.asyncIterator](), cur: null, nxt: null, w, h };
      const r = await it.gen.next(); it.nxt = r.done ? null : r.value; INS.its.set(m.id, it);
    }
    while (it.nxt && it.nxt.timestamp <= tl + 1e-3) { it.cur = it.nxt; const r = await it.gen.next(); it.nxt = r.done ? null : r.value; }
    const wc = it.cur || it.nxt; if (wc) INS.cur.set(m.id, ixCompose(wc.canvas, it.w, it.h));
  }
}
async function insEndExport() { for (const it of INS.its.values()) { try { await it.gen.return?.(); } catch (e) { } } INS.its.clear(); INS.cur.clear(); }
async function insWarm(P) { for (const m of (P?.motions || [])) if (m.type === 'inserto' && m.params.clip) await insLoadPreview(m); }

defP('inserto', {
  name: 'Inserto animado', desc: 'Animación hecha afuera del editor (Remotion, GSAP, three.js, Lottie, HTML) con fondo transparente, montada sobre el video. La crea la edición a fondo.',
  defaults: { clip: '', w: 1080, h: 1920, x: 0.5, y: 0.5, escala: 1, fps: 30, texto: '', motor: '' },
  schema: [['clip', 'text', 'Recurso del clip (lado a lado)'], ['x', 'range', 'Posición horizontal'], ['y', 'range', 'Posición vertical'], ['escala', 'number', 'Escala (1 = ancho del cuadro)'], ['texto', 'text', 'Texto que se lee en el clip'], ['motor', 'text', 'Hecho con']],
  labels: p => [p.texto],
  draw(ctx, m, L, env) {
    const fr = insFrameAt(m, Math.max(0, L.tl)); if (!fr) return;
    const p = m.params, { w, h } = insDims(m);
    const dw = W * clamp(num(p.escala, 1), 0.05, 3), dh = dw * h / w;
    const dx = clamp(num(p.x, 0.5), 0, 1) * W - dw / 2, dy = clamp(num(p.y, 0.5), 0, 1) * H - dh / 2;
    ctx.drawImage(fr, dx, dy, dw, dh);
  }
});
