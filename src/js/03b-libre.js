/* ============ pieza Libre: composición a medida ============ */
function colorOf(B, c, fallback) {
  if (!c) return fallback || B.fg;
  if (c === 'fg' || c === 'texto') return B.fg; if (c === 'accent' || c === 'acento') return B.accent; if (c === 'accent2') return B.accent2 || B.accent;
  if (c === 'bg' || c === 'fondo') return B.bg; if (c === 'blanco') return '#ffffff'; if (c === 'negro') return '#000000';
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : (fallback || B.fg);
}
function fontOf(B, e) {
  const fam = e.font === 'body' || e.font === 'texto' ? B.body : (!e.font || e.font === 'display' || e.font === 'titulo') ? B.display : e.font;
  const w = e.weight || (fam === B.display ? (B.dw || 700) : 600);
  return `${e.italic ? 'italic ' : ''}${w} ${Math.round(num(e.size, 48))}px "${fam}", "Geist", system-ui, sans-serif`;
}
const LIBRE_DOC = `Elementos de la pieza "libre" (coordenadas en px sobre un cuadro de 1080×1920; zona segura x 108–972, y 269–1248):
- {"kind":"texto","text":"...","x":108,"y":420,"size":80,"font":"display"|"body","weight":800,"color":"fg"|"accent"|"#hex","align":"left"|"center"|"right","maxWidth":864,"lineHeight":1.08,"upper":false,"opacity":1} (y = línea de base de la primera línea)
- {"kind":"numero","value":90,"prefix":"","suffix":"%","decimals":0, ...mismo formato que texto; anim "contar" lo hace subir}
- {"kind":"caja","x":108,"y":300,"w":864,"h":360,"radius":28,"fill":"panel"|"accent"|"#hex","stroke":"#hex","strokeWidth":2,"opacity":1} ("panel" usa el estilo de panel de la marca: vidrio, sólido o claro)
- {"kind":"circulo","cx":540,"cy":700,"r":120,"fill":"#hex"|null,"stroke":"accent","width":20,"progress":0.72} (con anim "dibujar" el trazo se completa hasta progress)
- {"kind":"linea","x":160,"y":470,"x2":560,"y2":470,"color":"accent","width":6} (anim "dibujar" la traza)
Cada elemento lleva "at" (segundos desde el inicio de la pieza) o se sincroniza con beats[i] si no tiene "at"; "anim": "subir"|"bajar"|"izquierda"|"derecha"|"fundido"|"escala"|"mascara"|"dibujar"|"contar"|"ninguna"; "dur" (duración de la animación, 0.55 por defecto). Se dibujan en orden: primero los fondos.`;

defP('libre', {
  name: 'Libre', desc: 'Composición a medida: textos, cajas, círculos, líneas y números animados. Ideal para pedírsela a Claude.',
  defaults: { elements: [
    { kind: 'caja', x: 108, y: 330, w: 864, h: 330, radius: 28, fill: 'panel', at: 0, anim: 'fundido' },
    { kind: 'texto', text: 'Lo que imagines', x: 164, y: 450, size: 78, font: 'display', color: 'fg', at: 0.15, anim: 'mascara' },
    { kind: 'linea', x: 164, y: 492, x2: 520, y2: 492, color: 'accent', width: 6, at: 0.45, anim: 'dibujar' },
    { kind: 'texto', text: 'Pedile a Claude el diseño exacto', x: 164, y: 568, size: 36, font: 'body', weight: 500, color: 'fg', opacity: 0.75, at: 0.7, anim: 'subir' },
  ] },
  schema: [['elements', 'json', 'Elementos (JSON)']],
  labels: p => (Array.isArray(p.elements) ? p.elements : []).map(e => e.text || (e.value != null ? String(e.value) : e.kind)),
  draw(ctx, m, L, env) {
    const B = env.B, els = Array.isArray(m.params.elements) ? m.params.elements.slice(0, 40) : [];
    els.forEach((e, i) => {
      if (!e || typeof e !== 'object') return;
      const t0 = e.at != null && Number.isFinite(+e.at) ? +e.at : L.at(i), d = clamp(num(e.dur, .55), .05, 5);
      const anim = e.anim || 'fundido';
      const p = anim === 'ninguna' ? (L.tl >= t0 ? 1 : 0) : L.pAt(t0, anim === 'contar' || anim === 'dibujar' ? Math.max(d, .9) : d);
      if (p <= 0) return;
      ctx.save(); ctx.globalAlpha *= clamp(num(e.opacity, 1), 0, 1);
      const moveD = 40;
      if (anim === 'subir') ctx.translate(0, (1 - p) * moveD); else if (anim === 'bajar') ctx.translate(0, -(1 - p) * moveD);
      else if (anim === 'izquierda') ctx.translate((1 - p) * moveD, 0); else if (anim === 'derecha') ctx.translate(-(1 - p) * moveD, 0);
      if (!['dibujar', 'mascara', 'contar'].includes(anim)) ctx.globalAlpha *= p; else if (anim === 'contar') ctx.globalAlpha *= Math.min(1, p * 3);
      const k = e.kind;
      if (anim === 'escala') { const cx = num(e.cx ?? e.x, W / 2) + num(e.w) / 2, cy = num(e.cy ?? e.y, H / 2) + num(e.h) / 2, s = .92 + .08 * p; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
      if (k === 'caja') {
        const x = num(e.x), y = num(e.y), w = Math.max(1, num(e.w, 200)), h = Math.max(1, num(e.h, 100)), r = num(e.radius, B.radius ?? 20);
        if (anim === 'mascara') { ctx.beginPath(); ctx.rect(x - 4, y - 4, w + 8, (h + 8) * p); ctx.clip(); }
        if (e.fill === 'panel' || !e.fill) panel(ctx, env, x, y, w, h, 1);
        else { rr(ctx, x, y, w, h, r); ctx.fillStyle = colorOf(B, e.fill); ctx.fill(); }
        if (e.stroke) { rr(ctx, x, y, w, h, r); ctx.lineWidth = num(e.strokeWidth, 2); ctx.strokeStyle = colorOf(B, e.stroke); ctx.stroke(); }
      } else if (k === 'circulo') {
        const cx = num(e.cx, W / 2), cy = num(e.cy, H / 2), r = Math.max(1, num(e.r, 80)), prog = clamp(num(e.progress, 1), 0, 1) * (anim === 'dibujar' ? EASES.expo(p) : 1);
        if (e.fill) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = colorOf(B, e.fill); ctx.fill(); }
        if (e.stroke || !e.fill) { if (e.track !== false && prog < 1) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = num(e.width, 12); ctx.strokeStyle = rgba(colorOf(B, 'fg'), .12); ctx.stroke(); } ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.lineWidth = num(e.width, 12); ctx.lineCap = 'round'; ctx.strokeStyle = colorOf(B, e.stroke || 'accent'); ctx.stroke(); }
      } else if (k === 'linea') {
        const x1 = num(e.x), y1 = num(e.y), x2 = num(e.x2, x1 + 200), y2 = num(e.y2, y1), q = anim === 'dibujar' ? p : 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, q), lerp(y1, y2, q)); ctx.lineWidth = num(e.width, 4); ctx.lineCap = 'round'; ctx.strokeStyle = colorOf(B, e.color || 'accent'); ctx.stroke();
      } else if (k === 'texto' || k === 'numero') {
        ctx.font = fontOf(B, e); ctx.fillStyle = colorOf(B, e.color); ctx.textAlign = ['center', 'right'].includes(e.align) ? e.align : 'left'; ctx.textBaseline = 'alphabetic';
        if (e.shadow) shadowOn(ctx, env);
        const size = num(e.size, 48), lh = size * num(e.lineHeight, 1.08);
        let text;
        if (k === 'numero') { const kk = anim === 'contar' ? EASES.expo(clamp((L.tl - t0) / Math.max(d, 1.2), 0, 1)) : 1; text = fmtNum(num(e.value) * kk, kk < 1 ? 0 : e.decimals, e.prefix, e.suffix); }
        else text = e.upper || (B.upper && (e.font || 'display') === 'display') ? String(e.text || '').toUpperCase() : String(e.text || '');
        if (e.track != null) setLS(ctx, num(e.track) + 'px'); else if ((e.font || 'display') === 'display') setLS(ctx, (B.track || 0) + 'px');
        const lines = e.maxWidth ? wrap(ctx, text, num(e.maxWidth)) : String(text).split('\n');
        lines.forEach((ln, j) => { const y = num(e.y) + j * lh; if (anim === 'mascara') maskText(ctx, ln, num(e.x), y, lh, L.pAt(t0 + j * .1, d)); else ctx.fillText(ln, num(e.x), y); });
        setLS(ctx, '0px'); shadowOff(ctx);
      }
      ctx.restore();
    });
  }
});
