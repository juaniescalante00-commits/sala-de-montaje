/* ============ color: LUTs y motor WebGL2 ============ */
const LUT_N = 33;
const sCurve = (x, a) => { const s = x * x * (3 - 2 * x); return x + (s - x) * a; };
const lumaOf = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const satAdj = (r, g, b, s) => { const l = lumaOf(r, g, b); return [l + (r - l) * s, l + (g - l) * s, l + (b - l) * s]; };
const GRADES = {
  neutro: { name: 'Neutro', sw: ['#6b6f76', '#c9ccd1'], f: null },
  calido: { name: 'Cine cálido', sw: ['#5a3b2a', '#f2c9a0'], f: (r, g, b) => { r = sCurve(r * 1.03 + .012, .28); g = sCurve(g + .004, .26); b = sCurve(b * .93, .24); return satAdj(r, g, b, .94); } },
  teal: { name: 'Teal & naranja', sw: ['#1f4b55', '#f0a46a'], f: (r, g, b) => { const l = lumaOf(r, g, b), ws = (1 - l) ** 2, wh = l * l; r += -.055 * ws + .06 * wh; g += .022 * ws + .018 * wh; b += .065 * ws - .055 * wh; return satAdj(sCurve(r, .3), sCurve(g, .3), sCurve(b, .3), 1.04); } },
  frio: { name: 'Editorial frío', sw: ['#2c3440', '#d7dde6'], f: (r, g, b) => { [r, g, b] = satAdj(r, g, b, .8); r = .035 + r * .94 * .97; g = .035 + g * .94; b = .045 + b * .94 * 1.03; return [sCurve(r, .22), sCurve(g, .22), sCurve(b, .22)]; } },
  film: { name: 'Film 2383 (aprox.)', sw: ['#24332f', '#efc9a2'], f: (r, g, b) => { const l = lumaOf(r, g, b), ws = (1 - l) ** 2, wh = l * l; r = r - .02 * ws + .035 * wh; b = b + .03 * ws - .035 * wh; g = g + .006; [r, g, b] = [r, g, b].map(v => .028 + sCurve(clamp(v, 0, 1), .45) * .95); const s = .9 - .15 * wh; return satAdj(r, g, b, s); } },
  pastel: { name: 'Pastel', sw: ['#8a7f88', '#f4e3e0'], f: (r, g, b) => { [r, g, b] = satAdj(r, g, b, .78); return [.085 + r * .86 + .015, .085 + g * .86, .09 + b * .85]; } },
  byn: { name: 'B&N editorial', sw: ['#1d1d1d', '#e9e9e9'], f: (r, g, b) => { const l = sCurve(clamp(lumaOf(r, g, b) * 1.02, 0, 1), .55); return [l, l, l]; } },
  noche: { name: 'Noche azul', sw: ['#141c33', '#9fb2d9'], f: (r, g, b) => { const l = lumaOf(r, g, b); [r, g, b] = satAdj(r, g, b, .72); return [r * .93 - .015, g * .96, b * 1.0 + .055 * (1 - l)]; } },
};

/* Rangos del color. Si un valor llega en escala de porcentaje (p. ej. saturación 8 = +8%), se pasa a la escala del motor. */
const GRADE_RANGE = { mix: [0, 1], exposure: [-1, 1], contrast: [-1, 1], saturation: [-1, 1], temperature: [-1, 1], tint: [-1, 1], fade: [0, 1], vignette: [0, 1], grain: [0, 1] };
function normGrade(g) {
  if (!g || typeof g !== 'object') return g;
  for (const [k, [lo, hi]] of Object.entries(GRADE_RANGE)) {
    if (g[k] == null) continue;
    let v = +g[k]; if (!Number.isFinite(v)) { v = k === 'mix' ? 1 : 0; }
    if (Math.abs(v) > 1.0001) v = v / 100;
    g[k] = clamp(v, lo, hi);
  }
  return g;
}
function buildLut(f) {
  const N = LUT_N, d = new Float32Array(N * N * N * 3); let i = 0;
  for (let bz = 0; bz < N; bz++) for (let gy = 0; gy < N; gy++) for (let rx = 0; rx < N; rx++) {
    const r = rx / (N - 1), g = gy / (N - 1), b = bz / (N - 1);
    const o = f ? f(r, g, b) : [r, g, b];
    d[i++] = clamp(o[0], 0, 1); d[i++] = clamp(o[1], 0, 1); d[i++] = clamp(o[2], 0, 1);
  }
  return { N, data: d };
}
function parseCube(text) {
  let N = 0; const vals = []; const dmin = [0, 0, 0], dmax = [1, 1, 1];
  for (const raw of text.split(/\r?\n/)) {
    const ln = raw.trim(); if (!ln || ln[0] === '#') continue;
    if (/^LUT_3D_SIZE/i.test(ln)) { N = parseInt(ln.split(/\s+/)[1]); continue; }
    if (/^DOMAIN_MIN/i.test(ln)) { ln.split(/\s+/).slice(1).forEach((v, i) => dmin[i] = +v); continue; }
    if (/^DOMAIN_MAX/i.test(ln)) { ln.split(/\s+/).slice(1).forEach((v, i) => dmax[i] = +v); continue; }
    if (/^(TITLE|LUT_1D_SIZE|LUT_3D_INPUT_RANGE)/i.test(ln)) { if (/LUT_1D/i.test(ln)) throw new Error('Es un LUT 1D: hace falta un LUT 3D (.cube con LUT_3D_SIZE).'); continue; }
    const p = ln.split(/\s+/); if (p.length >= 3 && !isNaN(+p[0])) vals.push(+p[0], +p[1], +p[2]);
  }
  if (!N || N > 129) throw new Error('El archivo no tiene LUT_3D_SIZE válido.');
  if (vals.length < N * N * N * 3) throw new Error('El .cube está incompleto.');
  const d = new Float32Array(N * N * N * 3);
  for (let i = 0; i < d.length; i++) { const c = i % 3; d[i] = clamp((vals[i] - dmin[c]) / ((dmax[c] - dmin[c]) || 1), 0, 1); }
  return { N, data: d };
}

const GR = {
  ok: false, c: null, gl: null, key: '', lutN: 2,
  init() {
    this.c = document.createElement('canvas'); this.c.width = 8; this.c.height = 8;
    let gl = null;
    try { gl = this.c.getContext('webgl2', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true }); } catch (e) { gl = null; }
    this.fb = document.createElement('canvas'); this.fbx = this.fb.getContext('2d');
    if (!gl) return;
    const vs = `#version 300 es
in vec2 p; out vec2 v; void main(){ v=p*.5+.5; gl_Position=vec4(p,0.,1.); }`;
    const fs = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler2D T; uniform sampler3D LUT; uniform sampler2D M; uniform float lutMix, lutN, useM;
uniform vec4 crop; uniform float ex, con, sat, temp, tint, fade, vig, grain, seed; uniform vec2 res;
in vec2 v; out vec4 o;
float hash(vec2 q){ return fract(sin(dot(q, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 uv = crop.xy + v*crop.zw;
  vec3 c = texture(T, uv).rgb;
  c *= exp2(ex);
  c.r += temp*.06; c.b -= temp*.06; c.g += tint*.05;
  float l = dot(c, vec3(.2126,.7152,.0722));
  c = mix(vec3(l), c, 1.+sat);
  c = clamp(c, 0., 1.);
  vec3 sc = c*c*(3.-2.*c);
  c = con >= 0. ? mix(c, sc, con) : mix(c, vec3(.5), -con*.5);
  if (lutMix > 0.) { vec3 lc = texture(LUT, clamp(c,0.,1.)*((lutN-1.)/lutN) + .5/lutN).rgb; c = mix(c, lc, lutMix); }
  c = c*(1.-fade*.10) + fade*.07;
  float d = distance(v, vec2(.5)); c *= 1. - vig*smoothstep(.32, .82, d*1.15);
  c += (hash(floor(v*res) + seed) - .5)*grain*.09;
  float al = 1.; if (useM > .5) { al = smoothstep(.12, .88, texture(M, vec2(uv.x, 1. - uv.y)).r); }
  o = vec4(clamp(c,0.,1.), al);
}`;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    try {
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr); this.pr = pr;
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {}; for (const n of ['T', 'LUT', 'M', 'useM', 'lutMix', 'lutN', 'crop', 'ex', 'con', 'sat', 'temp', 'tint', 'fade', 'vig', 'grain', 'seed', 'res']) this.u[n] = gl.getUniformLocation(pr, n);
      this.tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      this.lut = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.lut);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
      this.mtex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.mtex);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.uniform1i(this.u.T, 0); gl.uniform1i(this.u.LUT, 1); gl.uniform1i(this.u.M, 2);
      this.gl = gl; this.ok = true;
      this.setLut(buildLut(null), 'neutro');
    } catch (e) { console.warn('WebGL2 no disponible, uso el modo simple de color', e); this.ok = false; }
  },
  setLut(l, key) {
    this.key = key; this.lutN = l.N; if (!this.ok) return;
    const gl = this.gl; gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, l.N, l.N, l.N, 0, gl.RGB, gl.FLOAT, l.data);
  },
  customLuts: {},
  ensureLut(g) {
    let key = g.preset; if (key === 'custom' && g.lutAssetId) key = 'cube:' + g.lutAssetId;
    if (key === this.key) return;
    if (key.startsWith('cube:')) { const l = this.customLuts[g.lutAssetId]; if (l) this.setLut(l, key); else { this.setLut(buildLut(null), 'neutro'); this.key = ''; loadCubeAsset(g.lutAssetId); } return; }
    this.setLut(buildLut((GRADES[key] || GRADES.neutro).f), key);
  },
  cropFor(sw, sh, fr) {
    const ta = W / H, sa = sw / sh, z = Math.max(1, fr?.zoom || 1);
    let cw, ch; if (sa > ta) { cw = (ta / sa) / z; ch = 1 / z; } else { cw = 1 / z; ch = (sa / ta) / z; }
    const cx = 0.5 + clamp(fr?.x || 0, -1, 1) * (1 - cw) / 2, cy = 0.5 + clamp(fr?.y || 0, -1, 1) * (1 - ch) / 2;
    return [cx - cw / 2, 1 - (cy + ch / 2), cw, ch, cx - cw / 2, cy - ch / 2];
  },
  /* mask: Uint8Array de MATTE_W×MATTE_H (1 = persona). Devuelve el cuadro graduado solo donde está la persona. */
  render(src, sw, sh, pw, ph, P, frameNo, mask) {
    const g = normGrade(Object.assign({}, P.grade)), fr = P.frame;
    if (!this.ok) {
      if (mask) return null;
      const c = this.fb; if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
      const x = this.fbx, cr = this.cropFor(sw, sh, fr);
      x.filter = `brightness(${Math.pow(2, g.exposure).toFixed(3)}) contrast(${(1 + g.contrast).toFixed(3)}) saturate(${(1 + g.saturation).toFixed(3)})`;
      x.drawImage(src, cr[4] * sw, cr[5] * sh, cr[2] * sw, cr[3] * sh, 0, 0, pw, ph); x.filter = 'none';
      return c;
    }
    const gl = this.gl, c = this.c;
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    gl.viewport(0, 0, pw, ph);
    this.ensureLut(g);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { return null; }
    const cr = this.cropFor(sw, sh, fr), u = this.u;
    gl.uniform4f(u.crop, cr[0], cr[1], cr[2], cr[3]);
    const lutOn = g.preset !== 'neutro' ? clamp(g.mix ?? 1, 0, 1) : 0;
    gl.uniform1f(u.lutMix, lutOn); gl.uniform1f(u.lutN, this.lutN);
    gl.uniform1f(u.ex, g.exposure || 0); gl.uniform1f(u.con, g.contrast || 0); gl.uniform1f(u.sat, g.saturation || 0);
    gl.uniform1f(u.temp, g.temperature || 0); gl.uniform1f(u.tint, g.tint || 0); gl.uniform1f(u.fade, g.fade || 0);
    gl.uniform1f(u.vig, g.vignette || 0); gl.uniform1f(u.grain, g.grain || 0); gl.uniform1f(u.seed, (frameNo || 0) % 997);
    gl.uniform2f(u.res, pw, ph);
    if (mask) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.mtex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, MATTE_W, MATTE_H, 0, gl.RED, gl.UNSIGNED_BYTE, mask); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.activeTexture(gl.TEXTURE0); }
    gl.uniform1f(u.useM, mask ? 1 : 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return c;
  },
};
