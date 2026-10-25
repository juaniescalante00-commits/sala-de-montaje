/* ============ piezas moldeables: código (tipo After Effects), 3D (three.js) y plantillas de After Effects (Lottie) ============ */
const CODE_DOC = `PIEZA "codigo" (animación a medida, como en After Effects). params: {"texto": "el texto principal que se ve (para revisión y reglas)", "code": "<cuerpo de función JS>"}.
El código es el CUERPO de function(ctx, p) y dibuja UN cuadro en un canvas 2D de 1080×1920 (ya escalado). Tiene que ser determinista: todo sale de p.t; nada de Date, Math.random, timers, fetch ni DOM.
p.t (segundos desde que entra la pieza), p.dur, p.prog (0→1), p.out (0→1 en la salida, multiplicá el alfa por 1-p.out), p.W=1080, p.H=1920,
p.safe {x:108,y:269,w:864,h:979,right:972,bottom:1248} (todo lo importante adentro), p.brand {bg,fg,accent,display,body,dw,radius},
p.at(t0, dur=0.6, easing="expo") → progreso 0→1 que arranca en t0, p.ease.{expo,suave,seco,inOut,back,elastic}(x), p.lerp, p.clamp, p.map(v,a,b,c,d),
p.font(size, {family:"display"|"body", weight, italic}) → string para ctx.font, p.wrap(texto, anchoMax) → líneas, p.rr(x,y,w,h,r) arma un rectángulo redondeado (después ctx.fill()),
p.panel(x,y,w,h) panel con el estilo de la marca, p.typeIn(texto, t0, letrasPorSegundo) → texto escrito hasta ahora, p.rand(semilla) → 0-1 determinista, p.noise(x,y),
p.words [{w, t}] palabras dichas durante la pieza (t relativo), p.face {x,y,w,h} zona de la cara en px o null (no dibujes encima).
Usalo para tipografía cinética, máscaras, contadores, gráficos que se dibujan, partículas, transiciones, glitch sobrio, lo que haga falta. Mantené el estilo de la marca.`;
const THREE_DOC = `PIEZA "3d" (three.js r160). params: {"texto": "texto principal (para revisión)", "code": "<cuerpo de función>", "fondo": "transparente"|"marca"}.
El código es el CUERPO de function(THREE, scene, camera, p) que arma la escena UNA vez y DEVUELVE una función update(t) que pone todo según t (segundos desde que entra; determinista).
La cámara es PerspectiveCamera(35°, 9/16) en (0,0,10) mirando al origen; el cuadro visible a z=0 mide ~3.55 de ancho × 6.31 de alto. Ya hay luz ambiente y una direccional.
p.brand, p.ease, p.at, p.lerp, p.clamp, p.dur igual que en "codigo". p.textTexture(texto, {size:120, color, family:"display"|"body", weight, pad}) → CanvasTexture con su .aspect;
p.textPlane(texto, {height:0.6, ...}) → Mesh plano con el texto (con transparencia); p.color(hex) → THREE.Color. Ideal para títulos 3D, logos, gráficos que giran, objetos y cámaras que se mueven.`;
const LOTTIE_DOC = `PIEZA "plantilla" (animación de After Effects exportada con Bodymovin/Lottie). params: {"tpl": "<id de plantilla>", "textos": {"<nombre de capa>": "texto nuevo"}, "encaje": "completa"|"libre", "x":540, "y":700, "escala":1, "fuente":"marca"|"original", "velocidad": 1}.
Con encaje "completa" ocupa todo el cuadro; con "libre" se centra en (x, y) con esa escala. Las capas de texto editables están listadas en cada plantilla.`;

/* ---- compilación de código con caché ---- */
const codeFns = new Map(), codeErrs = new Map();
function compileCode(src, args) {
  const key = args.join(',') + '|' + src; if (codeFns.has(key)) return codeFns.get(key);
  let fn = null; try { fn = new Function(...args, '"use strict";\n' + String(src || '')); codeErrs.delete(key); } catch (e) { codeErrs.set(key, e.message); }
  codeFns.set(key, fn); return fn;
}
function rand01(seed) { let x = Math.sin((seed + 1) * 12.9898) * 43758.5453; return x - Math.floor(x); }
function noise2(x, y) { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, h = (a, b) => rand01(a * 157 + b * 311); const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return lerp(lerp(h(i, j), h(i + 1, j), sx), lerp(h(i, j + 1), h(i + 1, j + 1), sx), sy); }
const EXTRA_EASE = { inOut: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, back: x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }, elastic: x => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1 };
function codeApi(ctx, m, L, env) {
  const B = env.B, P = env.P, eases = Object.assign({}, EASES, EXTRA_EASE);
  const face = env.measuring ? null : (() => { const f = faceAt(P, m.start + L.tl); return f ? { x: f[0] * W, y: f[1] * H, w: f[2] * W, h: f[3] * H } : null; })();
  return {
    t: L.tl, dur: m.dur, prog: clamp(L.tl / m.dur, 0, 1), out: L.o, W, H,
    safe: { x: SAFE.side, y: SAFE.top, w: CW, h: SAFE.bottom - SAFE.top, right: W - SAFE.side, bottom: SAFE.bottom },
    brand: { bg: B.bg, fg: B.fg, accent: B.accent, accent2: B.accent2 || B.accent, display: B.display, body: B.body, dw: B.dw || 700, radius: B.radius ?? 24, upper: !!B.upper },
    ease: eases, lerp, clamp, map: (v, a, b, c, d) => c + (d - c) * clamp((v - a) / ((b - a) || 1), 0, 1),
    at: (t0, d = 0.6, e = 'expo') => (eases[e] || eases.expo)(clamp((L.tl - t0) / Math.max(0.01, d), 0, 1)),
    font: (size, o = {}) => `${o.italic ? 'italic ' : ''}${o.weight || (o.family === 'body' ? 600 : (B.dw || 700))} ${Math.round(size)}px "${o.family === 'body' ? B.body : B.display}", "Geist", system-ui, sans-serif`,
    wrap: (text, maxW) => wrap(ctx, String(text || ''), maxW),
    rr: (x, y, w, h, r) => rr(ctx, x, y, w, h, r ?? (B.radius ?? 24)),
    panel: (x, y, w, h) => panel(ctx, env, x, y, w, h, 1),
    typeIn: (text, t0 = 0, cps = 28) => String(text || '').slice(0, Math.max(0, Math.floor((L.tl - t0) * cps))),
    rand: rand01, noise: noise2,
    words: (P.words || []).filter(w => w.s >= m.start && w.s <= m.start + m.dur).map(w => ({ w: w.w, t: +(w.s - m.start).toFixed(3) })),
    face,
  };
}
function drawCodeError(ctx, msg) { if (!S.p || EX.running) return; ctx.save(); ctx.fillStyle = 'rgba(239,107,92,.85)'; ctx.font = '600 30px Geist, sans-serif'; ctx.fillText('Error en el código: ' + String(msg).slice(0, 60), SAFE.side, SAFE.top + 40); ctx.restore(); }

defP('codigo', {
  name: 'Código', desc: 'Animación a medida escrita por Claude, como en After Effects: tipografía cinética, máscaras, gráficos, partículas.',
  defaults: { texto: 'Movimiento a medida', code: `const a = p.at(0, .8), b = p.at(.35, .9, 'inOut');
ctx.globalAlpha *= 1 - p.out;
ctx.font = p.font(118); ctx.fillStyle = p.brand.fg; ctx.textBaseline = 'alphabetic';
const words = ['Movimiento', 'a medida'];
words.forEach((w, i) => { const k = p.at(i * .25, .7); ctx.save(); ctx.beginPath(); ctx.rect(p.safe.x, 380 + i * 130 - 120, p.safe.w, 140); ctx.clip(); ctx.fillText(w, p.safe.x, 380 + i * 130 + (1 - k) * 130); ctx.restore(); });
ctx.fillStyle = p.brand.accent; ctx.fillRect(p.safe.x, 560, 420 * b, 8);` },
  schema: [['texto', 'text', 'Texto principal (para revisión)'], ['code', 'code', 'Código (JS)']],
  labels: p => [p.texto || 'animación'],
  draw(ctx, m, L, env) {
    const fn = compileCode(m.params.code, ['ctx', 'p']);
    if (!fn) { drawCodeError(ctx, codeErrs.get('ctx,p|' + m.params.code) || 'no compila'); return; }
    ctx.save(); try { fn(ctx, codeApi(ctx, m, L, env)); } catch (e) { ctx.restore(); ctx.save(); drawCodeError(ctx, e.message); } ctx.restore();
  },
});

/* ---- 3D con three.js ---- */
let THREE_ = null, threeLoading = null;
function ensureThree() {
  if (THREE_) return Promise.resolve(THREE_);
  if (!threeLoading) threeLoading = import('./three.module.min.js').catch(() => import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js')).then(m => { THREE_ = m; S.dirty = true; return m; }).catch(e => { threeLoading = null; throw e; });
  return threeLoading;
}
const T3 = { renderer: null, scenes: new Map() };
function threeScene(m, env) {
  const THREE = THREE_, key = m.id + '|' + m.params.code + '|' + JSON.stringify([env.B.bg, env.B.fg, env.B.accent, env.B.display, m.params.fondo]);
  let sc = T3.scenes.get(m.id);
  if (sc && sc.key === key) return sc;
  if (sc) sc.scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(mt => { mt.map?.dispose?.(); mt.dispose?.(); }); });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 9 / 16, 0.1, 200); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(3, 5, 8); scene.add(dl);
  if (m.params.fondo === 'marca') scene.background = new THREE.Color(env.B.bg);
  const B = env.B, eases = Object.assign({}, EASES, EXTRA_EASE);
  const textTexture = (text, o = {}) => {
    const size = o.size || 120, c = document.createElement('canvas'), x = c.getContext('2d');
    const font = `${o.italic ? 'italic ' : ''}${o.weight || (o.family === 'body' ? 600 : (B.dw || 700))} ${size}px "${o.family === 'body' ? B.body : B.display}", Geist, sans-serif`;
    x.font = font; const lines = String(text || '').split('\n'), pad = o.pad ?? size * 0.2;
    const w = Math.ceil(Math.max(...lines.map(l => x.measureText(l).width)) + pad * 2), h = Math.ceil(lines.length * size * 1.15 + pad * 2);
    c.width = Math.max(2, w); c.height = Math.max(2, h); x.font = font; x.fillStyle = o.color || B.fg; x.textBaseline = 'top';
    lines.forEach((l, i) => x.fillText(l, pad, pad + i * size * 1.15));
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; tx.aspect = c.width / c.height; return tx;
  };
  const api = { brand: { bg: B.bg, fg: B.fg, accent: B.accent, display: B.display, body: B.body }, dur: m.dur, ease: eases, lerp, clamp,
    at: () => 0, color: h => new THREE.Color(h), textTexture,
    textPlane: (text, o = {}) => { const tx = textTexture(text, o), hh = o.height || 0.6; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(hh * tx.aspect, hh), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false })); return mesh; } };
  let update = null, err = null;
  try { const fn = compileCode(m.params.code, ['THREE', 'scene', 'camera', 'p']); if (!fn) throw new Error(codeErrs.get('THREE,scene,camera,p|' + m.params.code) || 'no compila'); update = fn(THREE, scene, camera, api); if (typeof update !== 'function') throw new Error('el código tiene que devolver update(t)'); } catch (e) { err = e.message; }
  sc = { key, scene, camera, update, err, api }; T3.scenes.set(m.id, sc); return sc;
}
defP('3d', {
  name: '3D', desc: 'Escena 3D (three.js) escrita por Claude: títulos y logos con volumen, objetos y cámaras que se mueven.',
  defaults: { texto: 'Título 3D', fondo: 'transparente', code: `const t1 = p.textPlane('Título 3D', { height: 0.7 });
scene.add(t1);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.03, 16, 120), new THREE.MeshStandardMaterial({ color: p.color(p.brand.accent), metalness: .3, roughness: .4 }));
ring.position.y = 0.9; scene.add(ring);
return t => {
  const a = p.ease.expo(p.clamp(t / 1.2, 0, 1));
  t1.position.set(0, 0.9, 0); t1.rotation.y = (1 - a) * 1.2; t1.material.opacity = a;
  ring.rotation.x = 1.1 + t * .4; ring.rotation.y = t * .7; ring.scale.setScalar(.6 + .4 * a);
  camera.position.set(Math.sin(t * .25) * .6, 0, 10 - a * .8); camera.lookAt(0, .4, 0);
};` },
  schema: [['texto', 'text', 'Texto principal (para revisión)'], ['fondo', 'select', 'Fondo', [['transparente', 'Transparente (sobre el video)'], ['marca', 'Color de marca']]], ['code', 'code', 'Código three.js']],
  labels: p => [p.texto || '3D'],
  draw(ctx, m, L, env) {
    if (!THREE_) { ensureThree().catch(() => { }); return; }
    const sc = threeScene(m, env); if (sc.err) { drawCodeError(ctx, sc.err); return; }
    const THREE = THREE_, pw = Math.round(ctx.canvas.width), ph = Math.round(ctx.canvas.height);
    if (!T3.renderer) { T3.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); T3.renderer.setClearColor(0x000000, 0); T3.renderer.outputColorSpace = THREE.SRGBColorSpace; }
    const r = T3.renderer; if (r.domElement.width !== pw || r.domElement.height !== ph) r.setSize(pw, ph, false);
    sc.api.at = (t0, d = 0.6, e = 'expo') => (sc.api.ease[e] || EASES.expo)(clamp((L.tl - t0) / Math.max(0.01, d), 0, 1));
    try { sc.update(L.tl); r.render(sc.scene, sc.camera); } catch (e) { drawCodeError(ctx, e.message); return; }
    ctx.drawImage(r.domElement, 0, 0, W, H);
  },
});

/* ---- plantillas de After Effects (Lottie / Bodymovin) ---- */
let lottieLoading = null;
function ensureLottie() {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (!lottieLoading) lottieLoading = new Promise((res, rej) => {
    const add = (src, next) => { const s = document.createElement('script'); s.src = src; s.onload = () => window.lottie ? res(window.lottie) : next(); s.onerror = next; document.head.appendChild(s); };
    add('./lottie_canvas.min.js', () => add('https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_canvas.min.js', () => { lottieLoading = null; rej(new Error('lottie')); }));
  }).then(l => { S.dirty = true; return l; });
  return lottieLoading;
}
S.templates = []; const tplData = new Map(), tplAnims = new Map();
function tplItem(id) { return (S.templates || []).find(t => t.id === id); }
function loadTplData(id) {
  if (tplData.has(id)) return Promise.resolve(tplData.get(id));
  const it = tplItem(id); if (!it) return Promise.reject(new Error('sin plantilla'));
  const pr = fetch('/_blob/' + it.assetId).then(r => { if (!r.ok) throw new Error('404'); return r.json(); }).then(j => { tplData.set(id, j); S.dirty = true; return j; });
  tplData.set(id, pr); pr.catch(() => tplData.delete(id)); return pr;
}
function lottieTexts(data) {
  const out = []; const walk = layers => (layers || []).forEach(l => { if (l.ty === 5 && l.t?.d?.k?.[0]?.s) out.push({ nm: l.nm, t: l.t.d.k[0].s.t }); });
  walk(data.layers); (data.assets || []).forEach(a => walk(a.layers)); return out;
}
function tplAnim(m, env) {
  const id = m.params.tpl, data = tplData.get(id); if (!data || data instanceof Promise || !window.lottie) return null;
  const key = m.id + '|' + id + '|' + JSON.stringify(m.params.textos || {}) + '|' + m.params.fuente + '|' + env.B.display;
  let a = tplAnims.get(m.id); if (a && a.key === key) return a;
  if (a) { try { a.anim.destroy(); } catch (e) { } }
  const d = JSON.parse(JSON.stringify(data)), tx = m.params.textos || {};
  /* el canvas de Lottie solo dibuja texto con glifos exportados: las capas de texto de la raíz se vuelven nulas
     (Lottie calcula su transformación) y el editor dibuja el texto encima con las fuentes de la página */
  const texts = [], fonts = {}; (d.fonts?.list || []).forEach(f => { fonts[f.fName] = f; });
  const hasGlyphs = Array.isArray(d.chars) && d.chars.length;
  (d.layers || []).forEach((l, i) => {
    if (l.ty !== 5 || !l.t?.d?.k) return;
    const kf = l.t.d.k.map(k => Object.assign({}, k, { s: Object.assign({}, k.s) }));
    if (tx[l.nm] != null) kf.forEach(k => { if (k.s) k.s.t = String(tx[l.nm]).replace(/\n/g, '\r'); });
    if (hasGlyphs && tx[l.nm] == null) return;
    texts.push({ i, kf, nm: l.nm }); delete l.t; l.ty = 3;
  });
  (d.assets || []).forEach(x => (x.layers || []).forEach(l => { if (l.ty === 5 && !hasGlyphs) { delete l.t; l.ty = 3; } }));
  const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h; const cx = cv.getContext('2d');
  const anim = window.lottie.loadAnimation({ renderer: 'canvas', loop: false, autoplay: false, animationData: d, rendererSettings: { context: cx, clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' } });
  try { anim.resize(); } catch (e) { }
  a = { key, anim, cv, d, texts, fonts, brandFont: m.params.fuente === 'marca' ? env.B.display : null }; tplAnims.set(m.id, a); return a;
}
function drawTplTexts(a, f) {
  const els = a.anim.renderer?.elements || [], cx = a.cv.getContext('2d');
  for (const t of a.texts) {
    const l = a.d.layers[t.i], el = els[t.i]; if (!el || f < (l.ip ?? 0) || f >= (l.op ?? 1e9)) continue;
    const ft = el.finalTransform; const lv = ft?.mProp?.v?.props; if (!lv) continue;
    let M = [lv[0], lv[1], lv[4], lv[5], lv[12], lv[13]];
    for (const par of el.hierarchy || []) { const q = par.finalTransform?.mProp?.v?.props; if (!q) continue; const P2 = [q[0], q[1], q[4], q[5], q[12], q[13]]; M = [M[0] * P2[0] + M[1] * P2[2], M[0] * P2[1] + M[1] * P2[3], M[2] * P2[0] + M[3] * P2[2], M[2] * P2[1] + M[3] * P2[3], M[4] * P2[0] + M[5] * P2[2] + P2[4], M[4] * P2[1] + M[5] * P2[3] + P2[5]]; }
    const p = [M[0], M[1], 0, 0, M[2], M[3], 0, 0, 0, 0, 1, 0, M[4], M[5]];
    const op = ft.mProp?.o ? ft.mProp.o.v : 1; if (op <= 0) continue;
    let k = t.kf[0]; for (const x of t.kf) if ((x.t ?? 0) <= f) k = x; const s = k.s || {};
    const fo = a.fonts[s.f] || {}, st = String(fo.fStyle || ''), w = /black|heavy/i.test(st) ? 900 : /extra ?bold/i.test(st) ? 800 : /semi ?bold/i.test(st) ? 600 : /bold/i.test(st) ? 700 : /medium/i.test(st) ? 500 : /light/i.test(st) ? 300 : 400;
    const fam = a.brandFont || fo.fFamily || 'Geist', size = num(s.s, 60), lh = num(s.lh, size * 1.2);
    cx.save(); cx.setTransform(p[0], p[1], p[4], p[5], p[12], p[13]); cx.globalAlpha = clamp(op, 0, 1);
    cx.font = `${/italic/i.test(st) ? 'italic ' : ''}${w} ${size}px "${fam}", Geist, sans-serif`; setLS(cx, (num(s.tr) * size / 1000) + 'px');
    const c = s.fc || [1, 1, 1]; cx.fillStyle = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    cx.textAlign = s.j === 1 ? 'right' : s.j === 2 ? 'center' : 'left'; cx.textBaseline = 'alphabetic';
    String(s.t || '').split(/\r|\n/).forEach((ln, i) => cx.fillText(ln, 0, i * lh));
    cx.restore();
  }
}
defP('plantilla', {
  name: 'Plantilla AE', desc: 'Animación hecha en After Effects (exportada con Bodymovin como .json) con sus textos editables.',
  defaults: { tpl: '', textos: {}, encaje: 'completa', x: 540, y: 760, escala: 1, fuente: 'original', velocidad: 1 },
  schema: [['tpl', 'select', 'Plantilla', []], ['encaje', 'select', 'Encaje', [['completa', 'Todo el cuadro'], ['libre', 'Posición libre']]], ['escala', 'number', 'Escala'], ['x', 'number', 'X'], ['y', 'number', 'Y'], ['fuente', 'select', 'Fuente', [['original', 'La de la plantilla'], ['marca', 'La de la marca']]], ['textos', 'json', 'Textos (capa: texto)']],
  labels: p => Object.values(p.textos || {}).slice(0, 4),
  draw(ctx, m, L, env) {
    if (!window.lottie) { ensureLottie().catch(() => { }); return; }
    if (!tplData.get(m.params.tpl)) { loadTplData(m.params.tpl).catch(() => { }); return; }
    const a = tplAnim(m, env); if (!a) return;
    const d = a.d, fr = d.fr || 30, ip = d.ip || 0, op = d.op || (ip + fr * 3);
    const f = clamp(ip + L.tl * fr * num(m.params.velocidad, 1), ip, op - 1);
    try { a.anim.goToAndStop(f, true); } catch (e) { return; }
    drawTplTexts(a, f);
    let w, h, x, y;
    if (m.params.encaje === 'libre') { const s = num(m.params.escala, 1); w = d.w * s; h = d.h * s; x = num(m.params.x, 540) - w / 2; y = num(m.params.y, 760) - h / 2; }
    else { const s = Math.max(W / d.w, H / d.h); w = d.w * s; h = d.h * s; x = (W - w) / 2; y = (H - h) / 2; }
    ctx.drawImage(a.cv, x, y, w, h);
  },
});
/* todo lo que una pieza necesita cargado antes de exportar o de sacar cuadros */
async function prepareMotions(P) {
  const ms = P?.motions || [];
  if (ms.some(m => m.type === '3d')) await ensureThree().catch(() => { });
  if (ms.some(m => m.type === 'plantilla')) { await ensureLottie().catch(() => { }); for (const m of ms) if (m.type === 'plantilla' && m.params.tpl) await loadTplData(m.params.tpl).catch(() => { }); }
  if (ms.some(m => m.behind)) await matteWarm(P).catch(() => { });
}
