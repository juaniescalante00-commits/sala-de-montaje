/* ============ arranque ============ */
async function initCaps() {
  const use = n => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(n).catch(() => null) : Promise.resolve(null);
  const [db, sample, assets, dl, user, mcp] = await Promise.all([use('db'), use('sample'), use('assets'), use('downloads'), use('user'), use('mcp')]);
  S.db = db; S.sample = sample; S.assets = assets; S.dl = dl; S.user = user; S.mcp = mcp;
  if (user) { try { const c = await user.can('data.write'); if (c === false) S.canWrite = false; } catch (e) { } }
  updateClaudePill();
}
async function boot() {
  GR.init();
  wireGlobal(); wireHome(); wireStyleDialog(); wireTimeline(); wireReview();
  $('#home').hidden = false; renderHome();
  mountStage($('#stageWrap'));
  setSave('', 'Conectando…'); updateClaudePill();
  requestAnimationFrame(tick);
  document.fonts.ready.then(() => { S.dirty = true; renderThumbs(); });
  await initCaps();
  await store.start();
  window.addEventListener('resize', () => { if (S.p) renderTimeline(); });
}
boot();
