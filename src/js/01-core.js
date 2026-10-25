'use strict';
/* ============ utilidades ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const W = 1080, H = 1920;
const SAFE = { top: Math.round(H * 0.14), bottom: Math.round(H * 0.65), side: Math.round(W * 0.10) };
const CW = W - SAFE.side * 2; // ancho útil 864
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const pad2 = n => String(Math.floor(n)).padStart(2, '0');
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function tc(t, fps = 30) { t = Math.max(0, t || 0); return `${pad2(t / 60)}:${pad2(t % 60)}:${pad2((t % 1) * fps)}`; }
function mmss(t) { t = Math.max(0, t || 0); return `${pad2(t / 60)}:${pad2(t % 60)}`; }
function fmtBytes(b) { if (!b) return '0 MB'; return b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB'; }
function hexToRgb(h) { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
/* fondo y texto de la marca siempre legibles entre sí: si los dos son claros (o los dos oscuros), el fondo pasa al opuesto */
function fixBrandContrast(B) { try { const lf = lum(B.fg || '#ffffff'), lb = lum(B.bg || '#000000'); if (Math.abs(lf - lb) < 0.4) B.bg = lf > 0.5 ? '#121214' : '#f4f2ee'; } catch (e) { } return B; }
function lum(h) { const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; }
function onColor(h) { return lum(h) > 0.42 ? '#0b0d10' : '#ffffff'; }
function normWord(w) { return String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ%]/g, ''); }

const EASES = {
  expo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  suave: t => 1 - Math.pow(1 - t, 3),
  seco: t => 1 - Math.pow(1 - t, 5),
};
const EASE_NAMES = { expo: 'Expo (cine)', suave: 'Suave', seco: 'Seco' };
const out3 = t => 1 - Math.pow(1 - t, 3);
const in2 = t => t * t;

/* números a palabras (es) para sincronizar "90" con "noventa" */
function numEs(n) {
  n = Math.round(Math.abs(n));
  const u = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];
  const d = ['', '', 'veinti', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const c = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  if (n <= 20) return u[n];
  if (n < 30) return 'veinti' + u[n - 20];
  if (n < 100) return d[Math.floor(n / 10)];
  if (n === 100) return 'cien';
  if (n < 1000) return c[Math.floor(n / 100)];
  if (n < 2000) return 'mil';
  return numEs(Math.floor(n / 1000));
}

/* ============ estado ============ */
const S = {
  p: null,             // proyecto abierto
  projects: [],        // lista (id, name, updated)
  mode: 'editor', tab: 'claude',
  sel: null,           // id de motion seleccionada
  t: 0, playing: false, dirty: true,
  pps: 40,             // px por segundo en la línea de tiempo
  safe: false, faces: false, loop: false,
  undo: [], redo: [], lastCoalesce: '', lastCoalesceAt: 0,
  db: null, sample: null, assets: null, dl: null, user: null,
  canWrite: true, storage: 'cargando',
  localVideo: null, videoURL: null, videoReady: false, vw: 0, vh: 0,
  voiceBuf: null, voicePeaks: null, voiceEnv: null,
  musicBuf: null, musicURL: null,
  qc: {},              // notas de control de calidad por motion
  wordSel: null,       // [i0,i1]
  busy: {},
  home: true,          // pantalla de inicio (subir video y pedir)
  sid: Math.random().toString(36).slice(2, 10), // esta pestaña
};

/* ============ marcas ============ */
const FONTS = ['Manrope', 'Geist', 'Inter', 'Montserrat', 'Poppins', 'Space Grotesk', 'Bricolage Grotesque', 'Archivo Black', 'Anton', 'Bebas Neue', 'Oswald', 'Barlow Condensed', 'Instrument Serif', 'Fraunces', 'Playfair Display', 'DM Serif Display', 'Geist Mono'];
const BRANDS = [
  { key: 'cobalto', name: 'Cobalto', display: 'Manrope', dw: 800, body: 'Manrope', upper: false, bg: '#0a1633', fg: '#f2f5ff', accent: '#4c8dff', accent2: '#a8c6ff', panel: 'glass', radius: 30, track: -2 },
  { key: 'editorial', name: 'Editorial serif', display: 'Instrument Serif', dw: 400, body: 'Geist', upper: false, bg: '#141312', fg: '#f6f4f0', accent: '#e2c17c', accent2: '#b9b2a4', panel: 'solid', radius: 8, track: -1 },
  { key: 'negro', name: 'Negro premium', display: 'Fraunces', dw: 700, body: 'Manrope', upper: false, bg: '#0b0b0b', fg: '#fafafa', accent: '#c9a45c', accent2: '#8f7d59', panel: 'solid', radius: 18, track: -1 },
  { key: 'blanco', name: 'Blanco minimal', display: 'Geist', dw: 700, body: 'Geist', upper: false, bg: '#ffffff', fg: '#101114', accent: '#101114', accent2: '#6c6f76', panel: 'light', radius: 24, track: -2 },
  { key: 'impacto', name: 'Condensada', display: 'Barlow Condensed', dw: 800, body: 'Manrope', upper: true, bg: '#121418', fg: '#ffffff', accent: '#ff6a3d', accent2: '#ffb59c', panel: 'solid', radius: 10, track: 0 },
  { key: 'calido', name: 'Cálido suave', display: 'Bricolage Grotesque', dw: 800, body: 'Manrope', upper: false, bg: '#2a1d17', fg: '#fff6ef', accent: '#ff9d6b', accent2: '#ffd3b8', panel: 'glass', radius: 34, track: -2 },
];

/* ============ proyecto ============ */
function newProject(name) {
  return {
    id: 'p' + Date.now().toString(36) + uid().slice(0, 4), name: name || 'Proyecto sin nombre', created: Date.now(), updated: Date.now(),
    fps: 30, duration: 30, round: 1, example: false,
    video: null, music: null,
    brand: clone(BRANDS[0]), fonts: [], ease: 'expo',
    grade: { preset: 'neutro', mix: 1, exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, fade: 0, vignette: 0.12, grain: 0, lutAssetId: null, lutName: null },
    frame: { zoom: 1, x: 0, y: 0 },
    captions: { on: true, style: 'editorial', pos: 'auto', y: 0.6, maxWords: 3, size: 1, upper: false, hideOnFull: true },
    audio: { voice: 1, sfx: 0.7, normalize: true },
    words: [], faces: [], motions: [], notes: '', chat: [], stage: 'home',
  };
}

function exampleProject() {
  const p = newProject('Ejemplo · VSL Club Atlas');
  p.example = true; p.duration = 34.5;
  const segs = [
    [0.4, 4.2, 'Cada año, noventa jugadores pasan directo de la universidad a la liga profesional.'],
    [4.6, 8.8, 'Y casi ninguno sale de una academia tradicional. Salen de programas como el nuestro.'],
    [9.2, 13.5, 'Entrenás en estadios y centros de alto rendimiento, con staff a tiempo completo.'],
    [13.9, 18.6, 'Preparador físico, analista de video y nutricionista. Todo en el mismo lugar.'],
    [19.0, 23.4, 'El setenta y dos por ciento de nuestros jugadores consigue una beca en su primer año.'],
    [23.8, 28.6, 'El proceso tiene cuatro pasos: evaluación, plan, vitrina y firma.'],
    [29.0, 33.8, 'Si tenés entre dieciséis y veinte años, este es tu momento. Escribinos hoy.'],
  ];
  for (const [s, e, text] of segs) {
    const ws = text.split(/\s+/); const tot = ws.reduce((a, w) => a + w.length + 2, 0); let t = s;
    for (const w of ws) { const d = (e - s) * (w.length + 2) / tot; p.words.push({ w, s: +t.toFixed(2), e: +(t + d * 0.9).toFixed(2) }); t += d; }
  }
  const at = word => { const n = normWord(word); const f = p.words.find(x => normWord(x.w) === n); return f ? f.s : null; };
  const M = (type, start, dur, layout, params, extra = {}) => Object.assign({ id: 'm' + uid(), type, start, dur, layout, pos: 'auto', bg: 'video', tr: 'subir', sfx: 'ninguno', stagger: 0.35, params: Object.assign(clone(PRESETS[type].defaults), params), beats: [], quote: '', desc: '', status: 'pendiente', comment: '' }, extra);
  p.motions = [
    M('contador', 0.5, 3.9, 'overlay', { eyebrow: 'Cada año', value: 90, label: 'jugadores', caption: 'pasan de la universidad a la liga profesional' },
      { beats: [0.5, at('noventa'), at('jugadores'), at('universidad')], status: 'aprobado', desc: 'Panel de vidrio arriba. El contador sube de 0 a 90 justo cuando lo dice y después entra la bajada.' }),
    M('comparacion', 4.7, 4.0, 'overlay', { eyebrow: 'De dónde salen', from: 'Academia tradicional', to: 'Programa Atlas', caption: '' },
      { beats: [4.7, at('academia'), at('programas')], desc: 'Dos píldoras: la primera apagada, la flecha se dibuja y se enciende la segunda cuando nombra los programas.' }),
    M('bento', 9.2, 4.5, 'full', { cards: [{ eyebrow: 'Instalaciones', title: 'Estadios y centros de alto rendimiento' }, { eyebrow: 'Staff', title: 'A tiempo completo' }] },
      { beats: [at('estadios'), at('staff')], sfx: 'aire', status: 'cambios', comment: 'Que la segunda tarjeta entre recién cuando dice "staff" y un poco más lento.', desc: 'Pantalla completa con fondo desenfocado. Dos tarjetas que entran de a una.' }),
    M('lista', 13.9, 4.6, 'overlay', { title: 'Tu equipo', items: ['Preparador físico', 'Analista de video', 'Nutricionista'] },
      { beats: [13.9, at('preparador'), at('analista'), at('nutricionista')], desc: 'Lista que se va completando: cada rol aparece cuando lo nombra.' }),
    M('progreso', 19.0, 4.3, 'overlay', { eyebrow: 'Resultados', value: 72, label: 'consigue beca', caption: 'en su primer año' },
      { beats: [19.0, at('setenta'), at('beca'), at('primer')], desc: 'Anillo que se completa hasta 72% sincronizado con la cifra.' }),
    M('linea', 23.8, 4.8, 'full', { title: 'El proceso', steps: [{ tag: '01', text: 'Evaluación' }, { tag: '02', text: 'Plan' }, { tag: '03', text: 'Vitrina' }, { tag: '04', text: 'Firma' }] },
      { beats: [23.8, at('evaluación'), at('plan,'), at('vitrina'), at('firma.')], sfx: 'whoosh', desc: 'Línea vertical: cada paso se enciende justo cuando lo nombra.' }),
    M('cta', 29.0, 5.0, 'full', { title: 'Tu momento es ahora', button: 'Escribinos hoy', note: 'Para jugadores de 16 a 20 años' },
      { beats: [29.1, at('escribinos'), null], bg: 'solido', desc: 'Cierre en color de marca: titular, botón y nota.' }),
  ];
  for (const m of p.motions) { m.beats = (m.beats || []).map(b => b == null ? null : +b); m.quote = quoteFor(p, m); }
  return p;
}

function quoteFor(p, m) {
  return (p.words || []).filter(w => w.s >= m.start - 0.15 && w.s < m.start + m.dur).map(w => w.w).join(' ');
}
