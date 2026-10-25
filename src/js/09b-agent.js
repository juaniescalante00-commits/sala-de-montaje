/* ============ "Pedile a Claude": pedido libre que se convierte en cambios ============ */
function projectForAgent(P) {
  const ms = sortedMotions().map((m, i) => { const c = clone(m); delete c.hist; delete c._quoteEdited; c.n = i + 1; return c; });
  return {
    nombre: P.name, duracion: +P.duration.toFixed(2), fps: P.fps, video: P.video ? { w: P.video.w, h: P.video.h } : null,
    marca: { nombre: P.brand.name, display: P.brand.display, body: P.brand.body, dw: P.brand.dw, upper: P.brand.upper, bg: P.brand.bg, fg: P.brand.fg, accent: P.brand.accent, panel: P.brand.panel, radius: P.brand.radius, track: P.brand.track },
    movimiento: P.ease, subtitulos: P.captions, color: P.grade, encuadre: P.frame, audio: P.audio,
    musica: P.music ? { nombre: P.music.name, volumen: P.music.volume, ducking: P.music.duck !== false, libId: P.music.libId || null } : null,
    piezas: ms, notas: P.notes || '', estilo: styleOf(P)?.name || null,
  };
}
function applyAgentOps(ops) {
  const log = []; const P = S.p;
  mutate(p => {
    for (const o of ops || []) {
      if (!o || typeof o !== 'object') continue;
      try {
        if (o.op === 'crear' && o.pieza && PRESETS[o.pieza.type]) {
          const m = sanitizeMotion(Object.assign({}, o.pieza, { id: null, status: 'pendiente', comment: '' }));
          m.start = clamp(m.start, 0, Math.max(0, p.duration - .8)); m.dur = Math.min(m.dur, p.duration - m.start);
          if (!m.beats.some(b => b != null) && !['libre', 'codigo', '3d', 'plantilla', 'inserto'].includes(m.type)) syncBeats(m, false);
          if (!m.quote) m.quote = quoteFor(p, m);
          p.motions.push(m); log.push(`+ ${PRESETS[m.type].name} en ${mmss(m.start)}`);
        } else if (o.op === 'editar') {
          const m = p.motions.find(x => x.id === o.id || x.n === o.n); if (!m) continue;
          const ch = o.cambios || {}; const prev = clone(m); delete prev.hist;
          const merged = Object.assign({}, m, ch, { id: m.id, params: ch.type && ch.type !== m.type ? (ch.params || {}) : Object.assign({}, m.params, ch.params || {}) });
          if (!ch.fit) delete merged.fit; if (!ch.noCaps) delete merged.noCaps; const nm = sanitizeMotion(merged); nm.hist = (m.hist || []).concat([{ at: Date.now(), comment: 'Pedido a Claude', resumen: 'Cambio desde el pedido libre', prev }]).slice(-4);
          if (ch.start != null && !m._quoteEdited) nm.quote = quoteFor(p, nm);
          for (const k of Object.keys(m)) delete m[k]; Object.assign(m, nm); log.push(`~ ${headline(m)}`);
        } else if (o.op === 'borrar') {
          const m = p.motions.find(x => x.id === o.id); if (!m) continue; p.motions = p.motions.filter(x => x !== m); log.push(`− ${headline(m)}`);
        } else if (o.op === 'proyecto') {
          const pick = (src, dst, keys) => { if (!src || typeof src !== 'object') return 0; let n = 0; for (const k of Object.keys(src)) if (!keys || keys.includes(k)) { dst[k] = src[k]; n++; } return n; };
          if (pick(o.subtitulos, p.captions, ['on', 'style', 'pos', 'y', 'maxWords', 'size', 'upper', 'hideOnFull'])) log.push('~ subtítulos');
          if (pick(o.color, p.grade, ['preset', 'mix', 'exposure', 'contrast', 'saturation', 'temperature', 'tint', 'fade', 'vignette', 'grain'])) log.push('~ color');
          if (pick(o.encuadre, p.frame, ['zoom', 'x', 'y'])) log.push('~ encuadre');
          if (pick(o.audio, p.audio, ['voice', 'sfx', 'normalize'])) log.push('~ audio');
          if (o.marca) { const kit = o.marca.kit && BRANDS.find(b => b.key === o.marca.kit); if (kit) p.brand = clone(kit); if (pick(o.marca, p.brand, ['display', 'body', 'dw', 'upper', 'bg', 'fg', 'accent', 'accent2', 'panel', 'radius', 'track', 'name'])) log.push('~ marca'); }
          if (o.movimiento && EASES[o.movimiento]) { p.ease = o.movimiento; log.push('~ movimiento'); }
          if (Array.isArray(o.reglasOff)) { p.rulesOff = o.reglasOff.filter(id => RULES.some(r => r.id === id && !r.fija)); log.push('~ reglas de este proyecto: ' + (p.rulesOff.join(', ') || 'todas prendidas')); }
          normGrade(p.grade); if (!GRADES[p.grade.preset] && p.grade.preset !== 'custom') p.grade.preset = 'neutro';
          if (!CAPS[p.captions.style]) p.captions.style = 'editorial';
        } else if (o.op === 'musica') {
          if (p.audio?.rawMusic && o.id != null) { log.push('× música: el video ya trae música'); continue; }
          if (o.id == null) { if (p.music) { p.music = null; log.push('− música'); } continue; }
          const it = (S.library || []).find(x => x.id === o.id && x.kind === 'musica'); if (!it) continue;
          p.music = { name: it.name, volume: clamp(num(o.volumen, p.music?.volume ?? .2), 0, 1), duck: o.ducking !== false, assetId: it.assetId, libId: it.id };
          log.push('♪ ' + it.name);
        } else if (o.op === 'camara') {
          const fr = p.frame;
          if (o.seguirCara != null) fr.follow = !!o.seguirCara;
          if (o.zoomBase != null) fr.followZoom = clamp(num(o.zoomBase, 1.15), 1, 1.6);
          if (o.altoCara != null) fr.followY = clamp(num(o.altoCara, .36), .2, .5);
          if (o.zoom != null) fr.zoom = clamp(num(o.zoom, 1), 1, 2.5);
          if (o.x != null) fr.x = clamp(num(o.x), -1, 1); if (o.y != null) fr.y = clamp(num(o.y), -1, 1);
          if (Array.isArray(o.zooms)) fr.zooms = o.zooms.filter(z => z && +z.e > +z.s).slice(0, 12).map(z => ({ s: +(+z.s).toFixed(2), e: +(+z.e).toFixed(2), z: clamp(num(z.z, 1.12), 1, 1.6), ramp: clamp(num(z.ramp, .45), .1, 2) }));
          log.push(`~ cámara${fr.follow ? ' (sigue la cara)' : ''}${fr.zooms?.length ? ` · ${fr.zooms.length} zoom${fr.zooms.length > 1 ? 's' : ''}` : ''}`);
        } else if (o.op === 'palabras' && Array.isArray(o.cambios)) {
          let n = 0; for (const c of o.cambios) if (p.words[+c.i] && typeof c.w === 'string' && c.w.trim()) { p.words[+c.i].w = c.w.trim(); n++; }
          if (n) { p._wv = (p._wv || 0) + 1; log.push(`~ ${n} palabras`); }
        }
      } catch (e) { console.warn('op', o, e); }
    }
    for (const m of p.motions) delete m.n;
  });
  if (P.music?.libId && (!S.musicBlob || S.musicLibId !== P.music.libId)) loadLibMusic(P.music);
  if (!P.music) { S.musicBlob = null; S.musicBuf = null; $('#mus').removeAttribute('src'); }
  preloadLibSfx();
  applyBrandFonts(); fitTimeline();
  return log;
}
function chatPush(entry) { if (!S.p) return; S.p.chat = (S.p.chat || []).concat([entry]).slice(-16); store.schedule(); if (S.mode === 'editor') renderLeft(); if (S.home) renderHome(); }
const AGENT_IDEAS = [
  'Armá todos los motions del video, sobrios y sincronizados con la voz',
  'Subtítulos más grandes, en mayúscula, con la palabra activa en amarillo',
  'Poné música tranquila de mi biblioteca, bajita',
  'Al final, un cierre con el botón "Escribinos hoy"',
  'Hacé el look más cálido y con un poco de grano',
];
function agentHTML() {
  const P = S.p, chat = P.chat || [];
  const msgs = chat.map(c => c.role === 'user'
    ? `<div class="msg me">${esc(c.text)}</div>`
    : `<div class="msg cl ${c.err ? 'err' : ''}">${esc(c.text)}${c.log?.length ? `<ul>${c.log.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</div>`).join('');
  return `<div class="sec agent">
    <div class="sec-head"><h3>Pedile lo que necesites</h3>${chat.length ? '<button class="btn sm ghost" id="agClear" type="button">Limpiar</button>' : ''}</div>
    <p class="hint">Escribilo o dictalo como se lo dirías a un editor: piezas, textos, tiempos, subtítulos, color, música. Para dictar en Windows: <span class="mono">Win + H</span> con el cursor en la caja.</p>
    ${transcribeBanner()}
    ${deepBannerHTML()}
    <div class="chatlog" id="chatlog">${msgs || `<div class="chips">${AGENT_IDEAS.map(t => `<button type="button" class="chip" data-idea="${esc(t)}">${esc(t)}</button>`).join('')}</div>`}
      ${S.busy.agent ? `<div class="msg cl"><span class="busy"></span> <span id="agentLive">Claude está pensando…</span></div>` : ''}</div>
    <textarea id="agentIn" rows="4" placeholder="Ej.: cuando dice 'noventa jugadores' mostrá el número grande arriba, y en el segundo 20 algo que muestre que el 72% consigue beca, en verde.">${esc(S.agentDraft || '')}</textarea>
    <div class="row" style="flex-wrap:wrap">
      <button class="btn pri" id="agSend" type="button" ${(!S.sample && !deepAvailable()) || S.busy.agent || deepBusy(P) ? 'disabled' : ''}>${S.busy.agent || deepBusy(P) ? 'Trabajando…' : 'Enviar'}</button>
      ${S.busy.agent ? '<button class="btn ghost" id="agStop" type="button">Detener</button>' : ''}
      ${deepAvailable() ? `<label class="chk" style="font-size:12px" title="Claude Code en la nube: lee el manual, las reglas, las skills, la música por datos y las fichas de referencia; mira la referencia, renderiza cuadros reales, los compara y corrige. Tarda 5 a 15 minutos. Destildalo para la edición rápida."><input type="checkbox" id="agDeep" ${deepDefault(P) ? 'checked' : ''}> A fondo con Claude Code</label>` : ''}
      <label class="chk" style="font-size:12px"><input type="checkbox" id="agImg" ${S.agentImg ? 'checked' : ''}> Mostrarle el cuadro actual</label>
    </div>
    <p class="hint">Ctrl + Enter envía. Todo se puede deshacer con Ctrl + Z.${P.words?.length ? '' : ' Sin transcripción, Claude no sabe en qué segundo se dice cada cosa.'}</p>
    ${claudeNote()}
  </div>`;
}
function wireAgent(body) {
  const ta = body.querySelector('#agentIn'); if (!ta) return;
  ta.addEventListener('input', () => { S.agentDraft = ta.value; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  const send = () => { const v = ta.value; if (!v.trim()) return; S.agentDraft = ''; const deep = body.querySelector('#agDeep')?.checked; if (deep && deepAvailable()) runDeep(v).then(ok => { if (!ok) runAgent(v); }); else runAgent(v); };
  body.querySelector('#agDeep')?.addEventListener('change', e => { try { localStorage.setItem('sala.deep.v2', e.target.checked ? '1' : '0'); } catch (er) { } });
  wireDeepBanner(body);
  body.querySelector('#agSend')?.addEventListener('click', send);
  body.querySelector('#agStop')?.addEventListener('click', () => S.agentCtl?.abort());
  body.querySelector('#agImg')?.addEventListener('change', e => { S.agentImg = e.target.checked; });
  body.querySelector('#agClear')?.addEventListener('click', () => mutate(p => { p.chat = []; }));
  body.querySelectorAll('[data-idea]').forEach(b => b.addEventListener('click', () => { ta.value = b.dataset.idea; S.agentDraft = ta.value; ta.focus(); }));
  const log = body.querySelector('#chatlog'); if (log) log.scrollTop = log.scrollHeight;
}
