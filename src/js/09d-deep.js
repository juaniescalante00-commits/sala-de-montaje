/* ============ edición a fondo con Claude Code en la nube ============
   La página deja el pedido en el proyecto (P.deep) y dispara la tarea en la nube. Claude Code baja el video,
   la referencia y el editor, edita, renderiza cuadros reales, los compara con la referencia, corrige y
   escribe el resultado en el mismo proyecto. La página lo adopta sola (adoptRemote). */
const DEEP_TASK = 'trig_01FSh19WcrPjb3sAq7BRPFZp';
const DEEP_STALE_START = 5 * 60e3, DEEP_STALE_RUN = 30 * 60e3;
function deepAvailable() { return !!S.mcp && !!S.db && S.storage === 'db' && !/PENDING/.test(DEEP_TASK); }
function deepState(P) {
  const d = P?.deep; if (!d || !d.id) return null;
  const age = Date.now() - (d.upd || d.at || 0);
  if (d.estado === 'pendiente' && age > DEEP_STALE_START) return Object.assign({}, d, { estado: 'trabado', paso: 'La tarea en la nube no arrancó.' });
  if (d.estado === 'en_curso' && age > DEEP_STALE_RUN) return Object.assign({}, d, { estado: 'trabado', paso: 'La tarea en la nube dejó de responder.' });
  return d;
}
function deepBusy(P) { const d = deepState(P); return !!d && (d.estado === 'pendiente' || d.estado === 'en_curso'); }
/* por defecto siempre a fondo: es la edición que lee el repo (manual, reglas, skills, índice de audio y fichas). La edición rápida queda para quien la elija. */
function deepDefault(P) { let v = null; try { v = localStorage.getItem('sala.deep.v2'); } catch (e) { } if (v === '0' || v === '1') return v === '1'; return true; }
async function runDeep(text) {
  const P = S.p; text = String(text || '').trim(); if (!P || !text) return false;
  if (!deepAvailable()) { toast('La edición a fondo funciona dentro de claude.ai. Uso la edición rápida.', 5000); return false; }
  if (deepBusy(P)) { toast('Claude Code ya está editando este proyecto.'); return false; }
  const id = 'q' + uid();
  chatPush({ role: 'user', text, at: Date.now(), deep: true });
  mutate(p => { p.deep = { id, texto: text, estado: 'pendiente', paso: 'Arrancando Claude Code en la nube…', at: Date.now(), upd: Date.now(), by: S.sid }; });
  await store.flush();
  try {
    await S.mcp.callTool('Claude Code Remote', 'fire_trigger', { trigger_id: DEEP_TASK, text: JSON.stringify({ proyecto: P.id, pedido: id }) });
    toast('Claude Code está editando a fondo (5 a 10 minutos). Podés cerrar la página: el resultado queda guardado.', 7000);
    return true;
  } catch (e) {
    console.warn('deep', e);
    mutate(p => { if (p.deep?.id === id) Object.assign(p.deep, { estado: 'error', paso: 'No pude disparar la tarea en la nube: ' + (e?.message || e?.code || 'error'), upd: Date.now() }); });
    return false;
  }
}
function deepRetry() { const d = S.p?.deep; if (!d?.texto) return; mutate(p => { delete p.deep; }); runDeep(d.texto); }
function deepBannerHTML() {
  const d = deepState(S.p); if (!d) return '';
  const mins = Math.max(0, Math.round((Date.now() - (d.at || Date.now())) / 60000));
  if (d.estado === 'pendiente' || d.estado === 'en_curso') return `<div class="deepban run"><span class="busy"></span><div><b>Claude Code está editando a fondo</b><span>${esc(d.paso || '')}${mins ? ` · ${mins} min` : ''}</span></div></div>`;
  if (d.estado === 'trabado' || d.estado === 'error') return `<div class="deepban err"><div><b>${d.estado === 'error' ? 'La edición a fondo falló' : 'La edición a fondo se trabó'}</b><span>${esc(d.paso || '')}</span></div><button class="btn sm" type="button" data-deepretry>Reintentar</button><button class="btn sm ghost" type="button" data-deepclear>Cerrar</button></div>`;
  if (d.estado === 'listo' && !d.visto) return `<div class="deepban ok"><div><b>Edición a fondo lista</b><span>${esc(d.resumen || 'Mirá el resultado.')}</span></div><button class="btn sm ghost" type="button" data-deepseen>Ok</button></div>`;
  return '';
}
function wireDeepBanner(root) {
  root.querySelectorAll('[data-deepretry]').forEach(b => b.addEventListener('click', deepRetry));
  root.querySelectorAll('[data-deepclear]').forEach(b => b.addEventListener('click', () => mutate(p => { delete p.deep; })));
  root.querySelectorAll('[data-deepseen]').forEach(b => b.addEventListener('click', () => mutate(p => { if (p.deep) p.deep.visto = true; })));
}
/* aviso cuando llega el resultado de la nube */
let deepLast = '';
function deepOnRemote(prev, now) {
  const a = prev?.deep, b = now?.deep; if (!b) return false;
  const key = b.id + ':' + b.estado; if (key === deepLast) return true; deepLast = key;
  if (b.estado === 'listo' && a?.estado !== 'listo') { toast('Claude Code terminó la edición. ' + (b.resumen || ''), 8000); if (S.home) { S.p.stage = 'editor'; showHome(false); } seek(0); }
  else if (b.estado === 'error' && a?.estado !== 'error') toast('La edición a fondo falló: ' + (b.paso || ''), 8000);
  return true;
}
setInterval(() => { if (S.p?.deep && deepBusy(S.p) && S.mode === 'editor' && S.tab === 'claude' && !S.home) { const el = document.querySelector('.deepban.run span:last-child'); if (el) { const d = deepState(S.p); const mins = Math.max(0, Math.round((Date.now() - (d.at || Date.now())) / 60000)); el.textContent = (d.paso || '') + (mins ? ` · ${mins} min` : ''); } } }, 20000);
