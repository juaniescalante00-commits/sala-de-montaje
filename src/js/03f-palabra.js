/* ============ tipografía editorial: palabra gigante + palabras chicas ============
   El lenguaje de los reels de revista: "if you" chiquito y fino, "Love" enorme y pesado.
   Con el recorte de persona (behind) queda detrás de la cabeza; sin recorte se ubica arriba de la cabeza. */
const PAL_SIZES = { M: 170, L: 230, XL: 300 };
function palabraLayout(ctx, m, env) {
  const p = m.params, B = env.B, P = env.P;
  const fam = p.fuente || B.display, wgt = num(p.peso, 800);
  const word = String(p.word || '').trim(), pre = String(p.pre || '').trim();
  let fs = PAL_SIZES[p.size] || PAL_SIZES.XL;
  const maxW = W - SAFE.side * 2 + 40;
  const font = s => `${wgt} ${Math.round(s)}px "${fam}", "Geist", system-ui, sans-serif`;
  ctx.font = font(fs); setLS(ctx, Math.round(-fs * 0.045) + 'px');
  let ww = ctx.measureText(word).width; if (ww > maxW) { fs *= maxW / ww; ctx.font = font(fs); setLS(ctx, Math.round(-fs * 0.045) + 'px'); ww = ctx.measureText(word).width; }
  setLS(ctx, '0px');
  const tMid = m.start + Math.min(0.6, m.dur / 2), f = faceAt(P, tMid);
  const behind = !!m.behind && matteReady(P);
  let base;
  const ny = num(p.y, NaN);
  if (Number.isFinite(ny) && ny > 0 && ny < 1) base = ny * H;
  else if (f) {
    const fy0 = f[1] * H, fh = f[3] * H;
    base = behind ? fy0 - fh * 0.06 : fy0 - fh * 0.42 - 12; // detrás: la base de las letras cae en la frente; sin recorte: arriba del pelo
  } else base = H * 0.3;
  const cap = fs * 0.72;
  base = clamp(base, SAFE.top + cap + (pre ? fs * 0.34 : 0), SAFE.bottom - 40);
  let cx = f ? (f[0] + f[2] / 2) * W : W / 2;
  cx = clamp(cx, SAFE.side + ww / 2 - 20, W - SAFE.side - ww / 2 + 20);
  const preFs = Math.max(56, fs * 0.27);
  return { fam, wgt, word, pre, fs, ww, base, cx, cap, preFs, font, x0: cx - ww / 2 };
}
defP('palabra', {
  name: 'Palabra gigante', desc: 'Una palabra enorme con una o dos palabras chicas encima (estilo revista). Con el recorte de persona queda detrás de la cabeza.',
  defaults: { pre: '', word: 'Palabra', size: 'XL', y: 'auto', peso: 800, color: '#ffffff', fuente: '' },
  schema: [['pre', 'text', 'Palabras chicas (arriba)'], ['word', 'text', 'Palabra grande'], ['size', 'select', 'Tamaño', [['M', 'Mediana'], ['L', 'Grande'], ['XL', 'Enorme']]], ['y', 'text', 'Altura (auto o 0 a 1)'], ['peso', 'number', 'Peso de la palabra grande'], ['color', 'text', 'Color (hex)'], ['fuente', 'text', 'Fuente (vacío = la de la marca)']],
  labels: p => [p.pre, p.word],
  draw(ctx, m, L, env) {
    const p = m.params, lay = palabraLayout(ctx, m, env), col = p.color || '#ffffff';
    const aPre = L.pAt(0, 0.35), aWord = L.pAt(lay.pre ? 0.14 : 0, 0.5);
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 30 * env.k; ctx.shadowOffsetY = 3 * env.k;
    if (lay.pre && aPre > 0) {
      ctx.save(); ctx.globalAlpha *= aPre; ctx.fillStyle = col;
      ctx.font = `300 ${Math.round(lay.preFs)}px "${lay.fam}", "Geist", system-ui, sans-serif`; setLS(ctx, Math.round(-lay.preFs * 0.02) + 'px');
      ctx.fillText(lay.pre, lay.x0 + lay.fs * 0.03, lay.base - lay.cap - lay.preFs * 0.28 + (1 - aPre) * 14);
      setLS(ctx, '0px'); ctx.restore();
    }
    if (aWord > 0) {
      ctx.save(); ctx.globalAlpha *= aWord; ctx.fillStyle = col;
      const s = 1.06 - 0.06 * aWord, cy = lay.base - lay.cap / 2; ctx.translate(lay.cx, cy); ctx.scale(s, s); ctx.translate(-lay.cx, -cy);
      ctx.font = lay.font(lay.fs); setLS(ctx, Math.round(-lay.fs * 0.045) + 'px');
      ctx.fillText(lay.word, lay.x0, lay.base);
      setLS(ctx, '0px'); ctx.restore();
    }
    ctx.restore();
  }
});
