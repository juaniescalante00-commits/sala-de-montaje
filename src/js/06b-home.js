/* ============ inicio: subir el video y pedir; el editor completo aparece después ============ */
const HOME_IDEAS = [
  'Subtítulos limpios y 3 o 4 títulos sobrios en los momentos clave',
  'Armá todos los motions del video, minimalistas y sincronizados con la voz',
  'Poné música tranquila de mi biblioteca, bajita',
  'Look cálido y un cierre con el botón "Escribinos hoy"',
];
const UPLOAD_ICON = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>';
function homeProject() { return S.p && S.p.stage === 'home' ? S.p : null; }
function showHome(on) {
  const was = S.home; S.home = !!on; $('#home').hidden = !on;
  if (on) { pause(); renderHome(); setTimeout(() => { const t = $('#hmIn'); if (t && homeProject()?.video) t.focus(); }, 40); }
  else if (was && S.p) setMode('editor');
}
function renderHome() {
  if (!S.home) return;
  $('#hmBack').hidden = !(S.p && S.p.stage === 'editor');
  renderHomeMedia(); renderHomeThread(); renderHomeRecent(); updateHomeSend(); renderHomeStyle();
  const ideas = $('#hmIdeas');
  if (!ideas.dataset.done) { ideas.dataset.done = '1'; ideas.innerHTML = HOME_IDEAS.map(t => `<button type="button" class="chip" data-hmidea="${esc(t)}">${esc(t)}</button>`).join(''); }
}
function renderHomeStyle() {
  const sel = $('#hmStyle'), P = homeProject(), cur = P ? (P.styleId || '') : (S.pendingStyle || '');
  const key = (S.styles || []).map(s => s.id + s.name).join('|') + '#' + cur;
  if (sel.dataset.key !== key) { sel.dataset.key = key; sel.innerHTML = `<option value="">Sin estilo de referencia</option>${(S.styles || []).map(s => `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>Estilo: ${esc(s.name)}</option>`).join('')}`; }
  $('#hmRef').hidden = !S.sample;
}
function transcribing(P) { const tr = P.transcribe; return !P.words?.length && tr?.state === 'enviado' && Date.now() - tr.at < 12 * 60000; }
function homeStatus(P) {
  const v = P.video, tr = P.transcribe, o = {};
  if (v.assetId) { o.vs = 'ok'; o.vt = v.proxy ? 'Copia liviana guardada' : 'Video guardado'; }
  else if (S.busy.proxy) { o.vs = 'run'; o.vt = `Preparando una copia liviana · ${Math.round(S.busy.proxy * 100)}%`; }
  else if (S.busy.upload) { o.vs = 'run'; o.vt = 'Guardando el video…'; }
  else if (!S.assets) { o.vs = 'ok'; o.vt = 'Video en este navegador'; }
  else { o.vs = 'err'; o.vt = 'No se pudo guardar'; }
  if (P.words?.length) { o.ts = 'ok'; o.tt = `Transcripción lista · ${P.words.length} palabras`; }
  else if (tr?.state === 'error') { o.ts = 'err'; o.tt = 'No se pudo transcribir'; o.retry = true; }
  else if (transcribing(P)) { const m = Math.round((Date.now() - tr.at) / 60000); o.ts = 'run'; o.tt = `Transcribiendo${m ? ` · hace ${m} min` : ' · tarda 2 a 4 min'}`; }
  else if (tr?.state === 'enviado') { o.ts = 'err'; o.tt = 'La transcripción está tardando'; o.retry = true; }
  else if (!S.mcp) { o.ts = ''; o.tt = 'Transcripción: solo dentro de claude.ai'; }
  else if (v.assetId) { o.ts = ''; o.tt = 'Transcripción pendiente'; o.retry = true; }
  else { o.ts = ''; o.tt = 'Transcripción en espera'; }
  if (S.busy.agent) { o.es = 'run'; o.et = 'Claude está editando'; }
  else if (P.pendingAsk) { o.es = 'run'; o.et = 'Tu pedido está en cola'; }
  else { o.es = ''; o.et = 'Esperando tu pedido'; }
  return o;
}
function renderHomeMedia() {
  const box = $('#hmMedia'), P = homeProject();
  if (!P?.video) {
    if (box.dataset.key === 'drop') return; box.dataset.key = 'drop';
    box.innerHTML = `<button type="button" class="hm-drop" id="hmPick">${UPLOAD_ICON}<b>Soltá tu video acá</b><span>o hacé clic para elegirlo · MP4 o MOV, ideal vertical 9:16</span></button>`;
    box.querySelector('#hmPick').addEventListener('click', () => $('#fileVideo').click());
    return;
  }
  const st = homeStatus(P), v = P.video;
  const key = [P.id, S.videoURL, JSON.stringify(st), !!(P.chat || []).length].join('|');
  if (box.dataset.key === key) return;
  const sameVideo = box.dataset.vurl === S.videoURL && box.querySelector('video');
  const stepsHTML = `<div class="hm-steps"><span class="${st.vs}"><i></i>${esc(st.vt)}</span><span class="${st.ts}"><i></i>${esc(st.tt)}${st.retry && S.mcp && v.assetId ? ' <button class="btn sm ghost" type="button" data-transcribe>Reintentar</button>' : ''}</span><span class="${st.es}"><i></i>${esc(st.et)}</span></div>`;
  const infoHTML = `<div class="nm">${esc(v.name)}</div><div class="hint mono">${mmss(v.duration)} · ${v.w}×${v.h}${v.w > v.h ? ' · horizontal' : ''}</div>${stepsHTML}`;
  if (sameVideo) { box.querySelector('.info').innerHTML = infoHTML; box.querySelector('[data-hmchange]').hidden = !!(P.chat || []).length || !!S.busy.agent; }
  else {
    box.innerHTML = `<div class="hm-vid"><video muted playsinline preload="metadata" src="${esc(S.videoURL || '')}#t=0.6"></video><div class="info">${infoHTML}</div><button class="btn sm ghost" type="button" data-hmchange ${(P.chat || []).length ? 'hidden' : ''}>Cambiar</button></div>`;
    box.querySelector('[data-hmchange]').addEventListener('click', () => $('#fileVideo').click());
    box.dataset.vurl = S.videoURL || '';
  }
  box.querySelectorAll('[data-transcribe]').forEach(b => b.addEventListener('click', () => requestTranscription(false)));
  box.dataset.key = key;
}
function renderHomeThread() {
  const box = $('#hmThread'), P = homeProject(); let html = '';
  if (P) {
    const last = (P.chat || []).slice(-1)[0];
    if (S.busy.agent) {
      const u = (P.chat || []).filter(c => c.role === 'user').slice(-1)[0];
      html = `${u ? `<div class="msg me">${esc(u.text)}</div>` : ''}<div class="msg cl"><span class="busy"></span> <span id="hmLive">Claude está editando el video…</span></div>`;
    } else if (P.pendingAsk) {
      html = `<div class="msg me">${esc(P.pendingAsk.text)}</div><div class="msg cl">Lo hago apenas termine la transcripción, así sé en qué segundo se dice cada cosa. Te aviso solo.<div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn sm" type="button" data-hmnow>Hacerlo ya, sin esperar</button><button class="btn sm ghost" type="button" data-hmcancel>Cancelar</button></div></div>`;
    } else if (last?.role === 'claude' && last.err) {
      html = `<div class="msg cl err">${esc(last.text)}</div>`;
    }
  }
  if (box.dataset.html === html) return; box.dataset.html = html; box.innerHTML = html;
  box.querySelector('[data-hmnow]')?.addEventListener('click', () => { const t = S.p.pendingAsk?.text; mutate(p => { delete p.pendingAsk; }); if (t) homeRun(t); });
  box.querySelector('[data-hmcancel]')?.addEventListener('click', () => { const t = S.p.pendingAsk?.text; mutate(p => { delete p.pendingAsk; }); $('#hmIn').value = t || ''; renderHome(); });
}
function renderHomeRecent() {
  const box = $('#hmRecent'), cur = homeProject();
  const list = S.projects.filter(p => p.id !== cur?.id && (p.video || p.motions?.length || p.example)).slice(0, 6);
  const key = list.map(p => p.id + ':' + p.updated + ':' + p.name).join('|') + '|' + S.projects.some(p => p.example);
  if (box.dataset.key === key) return; box.dataset.key = key;
  const when = t => { const d = (Date.now() - (t || 0)) / 86400000; return d < 1 ? 'hoy' : d < 2 ? 'ayer' : d < 7 ? `hace ${Math.floor(d)} días` : new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); };
  box.innerHTML = (list.length ? `<div class="eyebrow">Seguir con un proyecto</div>${list.map(p => `<button type="button" class="hm-proj" data-hmopen="${esc(p.id)}"><span class="n">${esc(p.name)}</span><span class="k">${(p.motions || []).length ? `${p.motions.length} pieza${p.motions.length > 1 ? 's' : ''}` : 'sin editar'}</span><span class="k">${when(p.updated)}</span></button>`).join('')}` : '')
    + `<div class="hm-more">${S.projects.some(p => p.example) ? '' : '<button type="button" class="btn sm ghost" id="hmExample">Ver un proyecto de ejemplo</button>'}</div>`;
  box.querySelectorAll('[data-hmopen]').forEach(b => b.addEventListener('click', () => { const p = S.projects.find(x => x.id === b.dataset.hmopen); if (!p) return; store.flush(); if (S.p?.id === p.id) showHome(S.p.stage === 'home'); else openProject(p); }));
  box.querySelector('#hmExample')?.addEventListener('click', () => { createProject(true); showHome(false); });
}
function updateHomeSend() {
  const P = homeProject(), btn = $('#hmSend'), hint = $('#hmHint');
  btn.disabled = !P?.video || !!S.busy.agent || !!P?.pendingAsk;
  $('#hmIdeas').hidden = !!(S.busy.agent || P?.pendingAsk);
  hint.textContent = !S.sample ? 'Claude se activa al abrir el editor dentro de claude.ai' : !P?.video ? 'Primero subí el video' : 'Win + H para dictar · Ctrl + Enter envía';
}
function waitsForTranscript(P) {
  if (P.words?.length) return false;
  if (transcribing(P)) return true;
  if (P.transcribe?.state) return false;
  return !!S.mcp && !!(S.busy.upload || S.busy.proxy);
}
function homeSend() {
  const ta = $('#hmIn'), text = ta.value.trim(), P = homeProject();
  if (!text) { ta.focus(); return; }
  if (!P?.video) { toast('Primero subí el video.'); return; }
  if (!S.sample) { toast('Claude se activa cuando abrís el editor dentro de claude.ai.', 5000); return; }
  if (S.busy.agent || P.pendingAsk) return;
  ta.value = '';
  if (waitsForTranscript(P)) { mutate(p => { p.pendingAsk = { text, by: S.sid, at: Date.now() }; }); renderHome(); return; }
  homeRun(text);
}
async function homeRun(text) {
  const P = S.p; if (!P) return;
  if (deepAvailable()) {
    const ok = await runDeep(text);
    if (ok && S.p === P) { mutate(p => { p.stage = 'editor'; }); S.tab = 'claude'; S.sel = null; showHome(false); seek(0); return; }
  }
  const run = runAgent(text); renderHome(); await run;
  if (S.p !== P) return;
  const last = (P.chat || []).slice(-1)[0];
  if (last?.role === 'claude' && !last.err && !last.cancelled) {
    mutate(p => { p.stage = 'editor'; }); S.tab = 'claude'; S.sel = null;
    showHome(false); seek(0);
    toast('Listo. Ahora tenés el editor completo: mirá el resultado, pedí más cambios en el chat o exportá.', 6000);
  } else renderHome();
}
function checkPendingAsk() {
  const P = S.p; if (!P?.pendingAsk || S.busy.agent) return;
  if (P.pendingAsk.by !== S.sid || waitsForTranscript(P)) { if (S.home) renderHome(); return; }
  const text = P.pendingAsk.text; mutate(p => { delete p.pendingAsk; }); homeRun(text);
}
function wireHome() {
  const ta = $('#hmIn');
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); homeSend(); } });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(320, Math.max(84, ta.scrollHeight)) + 'px'; });
  $('#hmSend').addEventListener('click', homeSend);
  $('#hmBack').addEventListener('click', () => showHome(false));
  $('#hmStyle').addEventListener('change', e => { const id = e.target.value; S.pendingStyle = id; const P = homeProject(); if (P) { const st = (S.styles || []).find(s => s.id === id); mutate(p => { if (st) applyStyle(st, p); else delete p.styleId; }); applyBrandFonts(); } });
  $('#hmRef').addEventListener('click', openStyleDialog);
  $('#hmIdeas').addEventListener('click', e => { const b = e.target.closest('[data-hmidea]'); if (!b) return; ta.value = (ta.value.trim() ? ta.value.trim() + '. ' : '') + b.dataset.hmidea; ta.focus(); ta.dispatchEvent(new Event('input')); });
  $('#btnHome').addEventListener('click', () => { store.flush(); showHome(true); });
  // un pedido en cola de otra pestaña que se cerró pasa a esta
  setInterval(() => {
    const P = S.p; if (!P) return;
    if (P.pendingAsk && P.pendingAsk.by !== S.sid && S.home && homeProject() === P && Date.now() - P.pendingAsk.at > 20000 && !S.busy.agent) mutate(p => { p.pendingAsk.by = S.sid; });
    checkPendingAsk(); if (S.home) renderHome();
  }, 15000);
}
