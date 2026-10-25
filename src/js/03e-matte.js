/* ============ recorte de persona (matte) ============
   La tarea en la nube genera un video en escala de grises (blanco = persona) del mismo largo que el crudo
   y lo guarda como recurso: P.video.matte = {assetId, w, h, fps}.
   Acá se decodifica solo en los tramos donde hace falta (piezas "detrás de la persona") y se guarda
   cada cuadro como un canal de 270×480 para subirlo directo a WebGL. */
const MATTE_W = 270, MATTE_H = 480;
const MT = { id: null, track: null, input: null, frames: new Map(), loading: new Set(), fps: 30, failed: false, pend: null };

function matteInfo(P) { const m = P?.video?.matte; return m && m.assetId ? m : null; }
function behindList(P, list) { return (list || []).filter(m => m.behind && m.layout !== 'full'); }
function matteReady(P) { return !!matteInfo(P) && !MT.failed; }

async function matteOpen(P) {
  const info = matteInfo(P); if (!info) return null;
  if (MT.id === info.assetId && MT.track) return MT.track;
  if (MT.id === info.assetId && MT.pend) return MT.pend;
  MT.id = info.assetId; MT.frames.clear(); MT.loading.clear(); MT.track = null; MT.failed = false; MT.fps = info.fps || P.fps || 30;
  MT.pend = (async () => {
    try {
      const MB = await loadMB();
      const r = await fetch('/_blob/' + info.assetId); if (!r.ok) throw new Error('matte ' + r.status);
      const blob = await r.blob();
      MT.input = new MB.Input({ source: new MB.BlobSource(blob), formats: MB.ALL_FORMATS });
      MT.track = await MT.input.getPrimaryVideoTrack();
      if (!MT.track) throw new Error('el recorte no tiene video');
      return MT.track;
    } catch (e) { console.warn('recorte de persona', e); MT.failed = true; return null; }
    finally { MT.pend = null; }
  })();
  return MT.pend;
}
/* decodifica [t0, t1] y guarda un canal por cuadro */
async function matteLoad(P, t0, t1) {
  const tr = await matteOpen(P); if (!tr) return;
  const fps = MT.fps, i0 = Math.max(0, Math.floor(t0 * fps)), i1 = Math.ceil(t1 * fps);
  let need = false; for (let i = i0; i <= i1; i++) if (!MT.frames.has(i)) { need = true; break; }
  const key = i0 + ':' + i1; if (!need || MT.loading.has(key)) return;
  MT.loading.add(key);
  try {
    const MB = await loadMB();
    const sink = new MB.VideoSampleSink(tr);
    const c = document.createElement('canvas'); c.width = MATTE_W; c.height = MATTE_H; const x = c.getContext('2d', { willReadFrequently: true });
    for await (const smp of sink.samples(i0 / fps, (i1 + 1) / fps)) {
      const i = Math.round(smp.timestamp * fps);
      if (!MT.frames.has(i)) {
        smp.draw(x, 0, 0, MATTE_W, MATTE_H);
        const d = x.getImageData(0, 0, MATTE_W, MATTE_H).data, a = new Uint8Array(MATTE_W * MATTE_H);
        for (let j = 0, k = 0; j < a.length; j++, k += 4) a[j] = d[k];
        MT.frames.set(i, a);
      }
      smp.close();
    }
  } catch (e) { console.warn('recorte de persona', e); }
  finally { MT.loading.delete(key); }
}
/* cuadro de recorte para t (sincrónico): el exacto o el más cercano a ±2 cuadros */
function matteAt(P, t) {
  if (!matteReady(P)) return null;
  const i = Math.round(t * MT.fps);
  for (const d of [0, -1, 1, -2, 2]) { const a = MT.frames.get(i + d); if (a) return a; }
  matteLoad(P, Math.max(0, t - 0.2), t + 2.5);
  return null;
}
/* precarga todos los tramos con piezas detrás de la persona (se llama al cambiar el proyecto y antes de exportar) */
async function matteWarm(P) {
  if (!matteInfo(P)) return;
  const ms = behindList(P, P.motions || []); if (!ms.length) return;
  const keep = new Set();
  for (const m of ms) { const a = Math.floor(Math.max(0, m.start - 0.1) * (MT.fps || 30)), b = Math.ceil((m.start + m.dur + 0.1) * (MT.fps || 30)); for (let i = a; i <= b; i++) keep.add(i); }
  for (const k of [...MT.frames.keys()]) if (!keep.has(k)) MT.frames.delete(k);
  for (const m of ms) await matteLoad(P, Math.max(0, m.start - 0.1), m.start + m.dur + 0.1);
}
