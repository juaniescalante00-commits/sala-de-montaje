/* ============ biblioteca: música y sonidos de las carpetas de Juani ============ */
S.library = [];
function startLibrary() {
  if (!S.db) return;
  startSettings();
  S.db.collection('library').onSnapshot(snap => {
    S.library = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })).filter(x => x.assetId)
      .sort((a, b) => (a.kind + (a.folder || '') + a.name).localeCompare(b.kind + (b.folder || '') + b.name));
    if (S.p && S.mode === 'editor') { if (S.tab === 'audio' || S.tab === 'claude') renderLeft(); if (S.sel) renderInspector(); }
    preloadLibSfx();
  }, () => { });
}
const libBufs = new Map(), libReady = new Map();
function libItem(id) { return (S.library || []).find(x => x.id === id); }
function getLibBuffer(assetId) {
  if (libBufs.has(assetId)) return libBufs.get(assetId);
  const pr = (async () => { const r = await fetch('/_blob/' + assetId); if (!r.ok) throw new Error('404'); const ab = await r.arrayBuffer(); const b = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(ab); libReady.set(assetId, b); return b; })();
  libBufs.set(assetId, pr); pr.catch(() => libBufs.delete(assetId)); return pr;
}
function preloadLibSfx() {
  const P = S.p; if (!P) return;
  for (const m of P.motions) if (m.sfx?.startsWith('lib:')) { const it = libItem(m.sfx.slice(4)); if (it && !libReady.has(it.assetId)) getLibBuffer(it.assetId).catch(() => { }); }
}
async function loadLibMusic(mu) {
  if (!mu?.assetId) return;
  try {
    const r = await fetch('/_blob/' + mu.assetId); if (!r.ok) throw new Error('404');
    const b = await r.blob(); S.musicBlob = b; S.musicBuf = null; S.musicLibId = mu.libId;
    if (S.musicURL) URL.revokeObjectURL(S.musicURL); S.musicURL = URL.createObjectURL(b); $('#mus').src = S.musicURL;
  } catch (e) { toast('No se pudo cargar la música de la biblioteca.'); }
}
function useLibMusic(id) {
  const it = libItem(id); if (!it) return;
  mutate(p => { p.music = { name: it.name, volume: p.music?.volume ?? .2, duck: p.music?.duck ?? true, assetId: it.assetId, libId: it.id }; });
  loadLibMusic(S.p.music); toast('Música: ' + it.name);
}
let libPrev = null;
function previewLib(id) {
  const it = libItem(id); if (!it) return;
  if (libPrev) { libPrev.pause(); const same = libPrev._id === id; libPrev = null; if (same) return; }
  if (it.kind === 'sonido' && libReady.has(it.assetId)) { const ac = liveCtx(); if (ac) { const s = ac.createBufferSource(); s.buffer = libReady.get(it.assetId); s.connect(liveSfx); s.start(); return; } }
  libPrev = new Audio('/_blob/' + it.assetId); libPrev._id = id; libPrev.volume = .85; libPrev.play().catch(() => toast('No se pudo reproducir.'));
  if (it.kind === 'musica') setTimeout(() => { if (libPrev && libPrev._id === id) { libPrev.pause(); libPrev = null; } }, 25000);
}
function sfxOptions() {
  const base = Object.entries(SFX).map(([k, v]) => [k, v.name]);
  const lib = (S.library || []).filter(x => x.kind === 'sonido').map(x => ['lib:' + x.id, '♪ ' + (x.folder ? x.folder + ' / ' : '') + x.name]);
  return base.concat(lib);
}
function sfxSelect(val) {
  const base = Object.entries(SFX).map(([k, v]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  const groups = {}; for (const x of (S.library || []).filter(x => x.kind === 'sonido')) (groups[x.folder || 'Varios'] = groups[x.folder || 'Varios'] || []).push(x);
  const libOpts = Object.entries(groups).map(([f, xs]) => `<optgroup label="${esc(f)}">${xs.map(x => `<option value="lib:${esc(x.id)}" ${val === 'lib:' + x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
  return `<label class="f">Sonido<select data-bind="sfx" data-after="sfx"><optgroup label="Sintetizados">${base}</optgroup>${libOpts}</select></label>`;
}
function libraryHTML() {
  const all = S.library || [], q = normWord(S.libQ || ''), fl = S.libF || '';
  const folders = [...new Set(all.filter(x => x.kind === 'sonido').map(x => x.folder || 'Varios'))];
  const match = x => (!q || normWord(x.name + ' ' + (x.folder || '')).includes(q));
  const mus = all.filter(x => x.kind === 'musica' && match(x) && (!fl || fl === 'Música'));
  const sndAll = all.filter(x => x.kind === 'sonido' && match(x) && (!fl || fl === (x.folder || 'Varios')));
  const snd = sndAll.slice(0, S.libMore ? 400 : 60);
  const row = x => `<div class="librow"><button class="btn sm icon ghost" type="button" data-libprev="${esc(x.id)}" aria-label="Escuchar ${esc(x.name)}">▶</button><span class="ln">${esc(x.name)}<span class="hint">${esc(x.folder || '')}${x.dur ? ' · ' + mmss(x.dur) : ''}</span></span>${x.kind === 'musica' ? `<button class="btn sm" type="button" data-libuse="${esc(x.id)}" ${S.p?.music?.libId === x.id ? 'disabled' : ''}>${S.p?.music?.libId === x.id ? 'En uso' : 'Usar'}</button>` : ''}</div>`;
  const nm = all.filter(x => x.kind === 'musica').length, ns = all.length - nm;
  return `<div class="sec"><div class="sec-head"><h3>Tu biblioteca</h3><span class="hint mono">${nm} temas · ${ns} sonidos</span></div>
    ${all.length ? `<div class="libtools"><input type="text" id="libQ" placeholder="Buscar: whoosh, impacto, riser…" value="${esc(S.libQ || '')}" aria-label="Buscar en la biblioteca">
    <div class="chips"><button type="button" class="chip" data-libf="" aria-pressed="${!fl}">Todo</button><button type="button" class="chip" data-libf="Música" aria-pressed="${fl === 'Música'}">Música</button>${folders.map(f => `<button type="button" class="chip" data-libf="${esc(f)}" aria-pressed="${fl === f}">${esc(f)}</button>`).join('')}</div></div>` : ''}
    ${(mus.length + snd.length) ? '' : `<p class="hint">Copiá tu música y tus sonidos en <span class="mono">Videos\\Sala de Montaje\\Música</span> y <span class="mono">\\Sonidos</span> de tu compu y pedile a Claude en el chat: "sincronizá la biblioteca".</p>`}
    ${mus.length ? `<div class="eyebrow">Música</div><div class="liblist">${mus.map(row).join('')}</div>` : ''}
    ${snd.length ? `<div class="eyebrow">Sonidos${sndAll.length > snd.length ? ` · ${snd.length} de ${sndAll.length}` : ''}</div><div class="liblist">${snd.map(row).join('')}</div>${sndAll.length > snd.length ? '<button class="btn sm ghost" type="button" id="libMore">Ver todos</button>' : ''}<p class="hint">Los sonidos se asignan en cada pieza (Disposición → Sonido) o pidiéndoselo a Claude.</p>` : ''}
    ${all.length && !mus.length && !snd.length ? '<p class="hint">Nada coincide con esa búsqueda.</p>' : ''}
  </div>`;
}
