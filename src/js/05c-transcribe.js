/* ============ transcripción automática: el editor dispara una tarea de Claude ============ */
const TRANSCRIBE_TASK = 'trig_013ERanf5oCJYw1uMqif5veU';
async function requestTranscription(auto) {
  const P = S.p; if (!P?.video?.assetId) { if (!auto) toast('Primero el video tiene que estar guardado en el proyecto.'); return; }
  if (!S.mcp) { if (!auto) toast('La transcripción automática funciona dentro de claude.ai. Si no, pedímela en el chat.', 5000); return; }
  if (store.timer || store.writing) { clearTimeout(store.timer); store.timer = 0; await store.flush(); }
  else await store.flush();
  try {
    await S.mcp.callTool('Claude Code Remote', 'fire_trigger', { trigger_id: TRANSCRIBE_TASK, text: 'Proyecto: ' + P.id });
    mutate(p => { p.transcribe = { state: 'enviado', at: Date.now() }; });
    if (!S.home) toast('Claude está transcribiendo el video. Tarda 2 a 4 minutos y aparece solo.', 6000);
    if (S.home) renderHome();
  } catch (e) {
    const m = { not_granted: 'No se dio permiso para disparar la tarea.', server_not_connected: 'Falta el conector de Claude Code en tu cuenta.', approval_required: 'Hace falta aprobar la tarea.' }[e?.code];
    mutate(p => { p.transcribe = { state: 'error', msg: m || 'No se pudo enviar el pedido de transcripción.', at: Date.now() }; });
    if (S.home) renderHome(); checkPendingAsk();
  }
}
function transcribeBanner() {
  const P = S.p; if (!P || P.words?.length) return '';
  const tr = P.transcribe, mins = tr?.at ? Math.round((Date.now() - tr.at) / 60000) : 0;
  if (tr?.state === 'enviado' && mins < 12) return `<div class="qc" style="color:#cfdcff;background:var(--accent-soft);border-color:rgba(122,162,255,.35)"><span class="busy"></span> Claude está transcribiendo el video${mins ? ` (hace ${mins} min)` : ''}. Aparece solo cuando termina.</div>`;
  if (tr?.state === 'error') return `<div class="qc">No se pudo transcribir: ${esc(tr.msg || 'error')}. <button class="btn sm" type="button" data-transcribe>Reintentar</button></div>`;
  if (P.video?.assetId) return `<div class="qc">Este video todavía no tiene transcripción. <button class="btn sm" type="button" data-transcribe>Transcribir ahora</button></div>`;
  if (P.video) return '<div class="qc">Guardá el video en el proyecto (panel derecho) para que Claude lo transcriba.</div>';
  return '';
}
