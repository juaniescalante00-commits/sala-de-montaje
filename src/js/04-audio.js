/* ============ audio ============ */
const SFX = {
  ninguno: { name: 'Sin sonido' },
  whoosh: { name: 'Whoosh suave', pre: 0.1 },
  aire: { name: 'Aire (swell)', pre: 0.5 },
  sub: { name: 'Golpe sub', pre: 0 },
  riser: { name: 'Riser sutil', pre: 0.9 },
};
const noiseCache = new WeakMap();
function noiseBuf(ac) {
  let b = noiseCache.get(ac); if (b) return b;
  b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = b.getChannelData(0);
  let seed = 1234567; for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  noiseCache.set(ac, b); return b;
}
/* programa un efecto que llega a su punto fuerte en `when` */
function playSfx(ac, type, when, dest, vol = 0.7) {
  if (!type || type === 'ninguno') return;
  if (type.startsWith('lib:')) { const it = libItem(type.slice(4)); const b = it && libReady.get(it.assetId); if (!b) return; const s = ac.createBufferSource(); s.buffer = b; const g = ac.createGain(); g.gain.value = vol * 1.2; s.connect(g).connect(dest); s.start(Math.max(0, when)); return; }
  const N = () => { const s = ac.createBufferSource(); s.buffer = noiseBuf(ac); s.loop = true; return s; };
  const G = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const t0 = Math.max(0, when - (SFX[type]?.pre || 0));
  if (type === 'whoosh') {
    const s = N(), bp = ac.createBiquadFilter(), g = G(0.0001); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(240, t0); bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.3); bp.frequency.exponentialRampToValueAtTime(600, t0 + 0.65);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.42 * vol, t0 + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    s.connect(bp).connect(g).connect(dest); s.start(t0); s.stop(t0 + 0.75);
  } else if (type === 'aire') {
    const s = N(), lp = ac.createBiquadFilter(), g = G(0.0001); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t0); lp.frequency.linearRampToValueAtTime(1400, t0 + 0.6); lp.frequency.linearRampToValueAtTime(500, t0 + 1.3);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2 * vol, t0 + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.35);
    s.connect(lp).connect(g).connect(dest); s.start(t0); s.stop(t0 + 1.4);
  } else if (type === 'sub') {
    const o = ac.createOscillator(), g = G(0.0001); o.type = 'sine'; o.frequency.setValueAtTime(72, t0); o.frequency.exponentialRampToValueAtTime(36, t0 + 0.6);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.8 * vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    o.connect(g).connect(dest); o.start(t0); o.stop(t0 + 0.95);
    const s = N(), lp = ac.createBiquadFilter(), g2 = G(0.0001); lp.type = 'lowpass'; lp.frequency.value = 180;
    g2.gain.setValueAtTime(0.0001, t0); g2.gain.exponentialRampToValueAtTime(0.35 * vol, t0 + 0.01); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    s.connect(lp).connect(g2).connect(dest); s.start(t0); s.stop(t0 + 0.2);
  } else if (type === 'riser') {
    const s = N(), bp = ac.createBiquadFilter(), g = G(0.0001); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(380, t0); bp.frequency.exponentialRampToValueAtTime(4200, t0 + 0.9);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22 * vol, t0 + 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
    s.connect(bp).connect(g).connect(dest); s.start(t0); s.stop(t0 + 1.05);
  }
}

/* decodifica el audio del video: forma de onda + envolvente de voz para el ducking */
async function decodeVoice(blob) {
  S.voiceBuf = null; S.voicePeaks = null; S.voiceEnv = null;
  if (!blob) return;
  try {
    const ab = await blob.arrayBuffer();
    const oc = new OfflineAudioContext(1, 1, 48000);
    const buf = await oc.decodeAudioData(ab);
    S.voiceBuf = buf;
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const pps = 100, step = Math.floor(sr / pps), peaks = new Float32Array(Math.ceil(d.length / step));
    for (let i = 0; i < peaks.length; i++) { let m = 0; for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 4) { const v = Math.abs(d[j]); if (v > m) m = v; } peaks[i] = m; }
    S.voicePeaks = peaks;
    const es = Math.floor(sr / 20), env = new Uint8Array(Math.ceil(d.length / es)); let mx = 0; const rms = new Float32Array(env.length);
    for (let i = 0; i < env.length; i++) { let s = 0, n = 0; for (let j = i * es, e = Math.min(d.length, j + es); j < e; j += 8) { s += d[j] * d[j]; n++; } rms[i] = Math.sqrt(s / Math.max(1, n)); if (rms[i] > mx) mx = rms[i]; }
    const th = Math.max(0.008, mx * 0.12); let hold = 0;
    for (let i = 0; i < env.length; i++) { if (rms[i] > th) hold = 6; env[i] = hold > 0 ? 1 : 0; hold--; }
    S.voiceEnv = env;
    try { checkRawMusic(); } catch (e) { console.warn(e); }
  } catch (e) { console.warn('sin audio decodificable', e); }
  drawWave(); if (S.mode === 'editor' && S.tab === 'audio') renderLeft();
}
/* ¿el crudo ya trae música? Mide el fondo en los silencios entre palabras contra el nivel de la voz.
   Un fondo fuerte y parejo (menos de 26 dB por debajo de la voz) es música o ambiente musical: no se agrega otra. */
function detectRawMusic(P) {
  const buf = S.voiceBuf, ws = P?.words || []; if (!buf || ws.length < 8) return null;
  const d = buf.getChannelData(0), sr = buf.sampleRate, n = d.length, sp = new Uint8Array(Math.ceil(n / 160));
  for (const w of ws) { const a = Math.max(0, Math.floor((w.s - .08) * sr / 160)), b = Math.min(sp.length, Math.ceil((w.e + .08) * sr / 160)); for (let i = a; i < b; i++) sp[i] = 1; }
  const rmsDb = (a, b) => { let s = 0, c = 0; for (let j = a; j < b; j += 2) { s += d[j] * d[j]; c++; } return 10 * Math.log10(s / Math.max(1, c) + 1e-12); };
  let sS = 0, sC = 0; for (let i = 0; i < sp.length; i++) if (sp[i]) { const a = i * 160, b = Math.min(n, a + 160); for (let j = a; j < b; j += 2) { sS += d[j] * d[j]; sC++; } }
  const speech = 10 * Math.log10(sS / Math.max(1, sC) + 1e-12), gaps = [];
  for (let i = 0; i < sp.length;) { if (sp[i]) { i++; continue; } let j = i; while (j < sp.length && !sp[j]) j++; if ((j - i) * 160 / sr >= 0.2) gaps.push(rmsDb(i * 160, Math.min(n, j * 160))); i = j; }
  if (gaps.length < 3) return null;
  gaps.sort((a, b) => a - b); const med = gaps[Math.floor(gaps.length / 2)];
  return { music: med - speech > -26 && med > -50, gapDb: +med.toFixed(1), speechDb: +speech.toFixed(1) };
}
function checkRawMusic() {
  const P = S.p; if (!P || P.audio.rawMusic !== undefined) return;
  const r = detectRawMusic(P); if (!r) return;
  mutate(p => { p.audio.rawMusic = r.music; p.audio.rawMusicAuto = true; if (r.music && p.music) p.music = null; }, { silent: true });
  if (r.music) toast('El video ya trae música: no voy a agregar otra.', 5000);
}
const voiceActive = t => { const e = S.voiceEnv; if (!e) return false; const i = Math.floor(t * 20); return !!e[clamp(i, 0, e.length - 1)]; };

/* ---- vista previa ---- */
let liveAC = null, liveSfx = null, lastSfxT = 0;
function liveCtx() {
  if (!liveAC) { try { liveAC = new AudioContext(); liveSfx = liveAC.createGain(); liveSfx.connect(liveAC.destination); } catch (e) { liveAC = null; } }
  if (liveAC && liveAC.state === 'suspended') liveAC.resume();
  return liveAC;
}
function previewSfx(type) { const ac = liveCtx(); if (!ac) return; playSfx(ac, type, ac.currentTime + 0.05 + (SFX[type]?.pre || 0), liveSfx, (S.p?.audio.sfx ?? .7)); }
function audioTick(t, playing) {
  const P = S.p; if (!P) return;
  const mus = $('#mus');
  if (playing) {
    if (liveAC && P.motions.length) {
      for (const m of P.motions) {
        if (!m.sfx || m.sfx === 'ninguno') continue;
        const trig = m.start - (SFX[m.sfx]?.pre || 0);
        if (trig > lastSfxT && trig <= t) playSfx(liveAC, m.sfx, liveAC.currentTime + (SFX[m.sfx]?.pre || 0), liveSfx, P.audio.sfx);
      }
    }
    lastSfxT = t;
    if (P.music && S.musicURL && mus.src) {
      const base = clamp(P.music.volume ?? .2, 0, 1), duck = P.music.duck !== false && voiceActive(t) ? .4 : 1;
      const end = P.duration - t, fadeOut = end < 1.2 ? clamp(end / 1.2, 0, 1) : 1;
      mus.volume = clamp(lerp(mus.volume, base * duck * fadeOut, 0.15), 0, 1);
    }
  } else lastSfxT = t;
}
function musicSync(play) {
  const P = S.p, mus = $('#mus'); if (!P?.music || !S.musicURL) { mus.pause(); return; }
  if (play) { try { mus.currentTime = (S.t % (mus.duration || 1e9)) || 0; } catch (e) { } mus.volume = clamp(P.music.volume ?? .2, 0, 1); mus.play().catch(() => { }); }
  else mus.pause();
}

/* ---- mezcla final ---- */
async function getMusicBuffer() {
  if (S.musicBuf) return S.musicBuf;
  const blob = await getMusicBlob(); if (!blob) return null;
  try { const oc = new OfflineAudioContext(2, 1, 48000); S.musicBuf = await oc.decodeAudioData(await blob.arrayBuffer()); } catch (e) { console.warn(e); }
  return S.musicBuf;
}
async function renderMix(dur, o) {
  const P = S.p, sr = 48000, len = Math.max(1, Math.ceil(dur * sr));
  const voice = o.voice ? S.voiceBuf : null, music = o.music && P.music ? await getMusicBuffer() : null;
  const sfx = o.sfx ? P.motions.filter(m => m.sfx && m.sfx !== 'ninguno') : [];
  if (!voice && !music && !sfx.length) return null;
  const oc = new OfflineAudioContext(2, len, sr);
  const master = oc.createGain(), comp = oc.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
  master.connect(comp).connect(oc.destination);
  if (voice) { const s = oc.createBufferSource(); s.buffer = voice; const g = oc.createGain(); g.gain.value = P.audio.voice ?? 1; s.connect(g).connect(master); s.start(0); }
  if (music) {
    const s = oc.createBufferSource(); s.buffer = music; s.loop = true; const g = oc.createGain(); const base = clamp(P.music.volume ?? .2, 0, 1);
    g.gain.setValueAtTime(base, 0);
    if (P.music.duck !== false && S.voiceEnv && voice) { let prev = -1; for (let i = 0; i < S.voiceEnv.length && i / 20 < dur; i++) { const v = S.voiceEnv[i]; if (v !== prev) { g.gain.setTargetAtTime(base * (v ? .4 : 1), i / 20, v ? .08 : .35); prev = v; } } }
    g.gain.setTargetAtTime(0.0001, Math.max(0, dur - 1.4), 0.4);
    s.connect(g).connect(master); s.start(0);
  }
  for (const m of sfx) if (m.sfx.startsWith('lib:')) { const it = libItem(m.sfx.slice(4)); if (it) { try { await getLibBuffer(it.assetId); } catch (e) { } } }
  if (sfx.length) { const g = oc.createGain(); g.gain.value = 1; g.connect(master); for (const m of sfx) playSfx(oc, m.sfx, m.start, g, P.audio.sfx ?? .7); }
  const buf = await oc.startRendering();
  if (o.normalize) await normalizeLoudness(buf, -14, -1);
  return buf;
}
/* sonoridad integrada aproximada (ponderación K + gating BS.1770) */
async function measureLufs(buf) {
  const oc = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const s = oc.createBufferSource(); s.buffer = buf;
  const hs = oc.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 1681; hs.gain.value = 4;
  const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
  s.connect(hs).connect(hp).connect(oc.destination); s.start(0);
  const k = await oc.startRendering(), sr = k.sampleRate, blk = Math.floor(sr * .4), hop = Math.floor(sr * .1), chs = [];
  for (let c = 0; c < k.numberOfChannels; c++) chs.push(k.getChannelData(c));
  const L = [];
  for (let i = 0; i + blk <= k.length; i += hop) { let ms = 0; for (const d of chs) { let a = 0; for (let j = i; j < i + blk; j += 2) a += d[j] * d[j]; ms += a / (blk / 2); } const l = -0.691 + 10 * Math.log10(ms + 1e-12); if (l > -70) L.push(ms); }
  if (!L.length) return -70;
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const g1 = -0.691 + 10 * Math.log10(avg(L)), rel = g1 - 10;
  const L2 = L.filter(ms => -0.691 + 10 * Math.log10(ms) > rel);
  return -0.691 + 10 * Math.log10(avg(L2.length ? L2 : L));
}
async function normalizeLoudness(buf, target = -14, ceilDb = -1) {
  const lufs = await measureLufs(buf); let gain = Math.pow(10, (target - lufs) / 20);
  let peak = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
  const ceil = Math.pow(10, ceilDb / 20); if (peak * gain > ceil) gain = ceil / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= gain; }
  S.lastLufs = { before: lufs, gain };
  return buf;
}
