/* ============ modo revisión ============ */
function rvCurrent() { const ms = sortedMotions(); return ms.find(m => m.id === S.rvSel) || ms[0] || null; }
function rvSelect(id, autoplay = true) {
  S.rvSel = id; S.rvFollow = false; const m = rvCurrent(); renderReview();
  if (m && autoplay) { seek(Math.max(0, m.start - .25)); S.reviewStop = m.start + m.dur + .05; play(); }
}
function renderReview(skip) {
  const P = S.p; if (!P) return;
  const ms = sortedMotions(), m = rvCurrent(), idx = m ? ms.indexOf(m) : -1;
  const ap = ms.filter(x => x.status === 'aprobado').length, ch = ms.filter(x => x.status === 'cambios').length;
  $('#rvCrumb').textContent = `${P.name} · ${P.video ? 'Video' : 'Demo'} · ${mmss(P.duration)}`;
  $('#rvTitle').textContent = `Motion graphics · Revisión v${P.round || 1}`;
  const cnt = $('#rvCount'); cnt.className = 'pill ' + (ms.length && ap === ms.length ? 'ok' : ch ? 'warn' : ''); cnt.lastElementChild.textContent = `${ap} aprobado${ap === 1 ? '' : 's'} · ${ch} con cambios · ${ms.length} pieza${ms.length === 1 ? '' : 's'}`;
  const pend = ms.filter(x => x.status === 'cambios' && x.comment.trim()).length;
  const ab = $('#rvApplyAll'); ab.disabled = !S.sample || !pend || !!S.busy.apply; ab.textContent = S.busy.apply ? 'Aplicando…' : `Aplicar cambios con Claude${pend ? ` (${pend})` : ''}`;
  ab.title = S.sample ? (pend ? 'Claude aplica cada comentario y deja la pieza pendiente para revisar de nuevo' : 'Marcá piezas con "Cambios" y escribí el comentario') : 'Disponible dentro de claude.ai';
  const qb = $('#rvQC'); qb.disabled = !S.sample || !ms.length || !!S.busy.qc; qb.textContent = S.busy.qc ? 'Revisando…' : 'Control de calidad';
  // mini línea de tiempo
  $('#rvMini').innerHTML = ms.map((x, i) => `<button type="button" class="${x.id === m?.id ? 'on' : ''} ${x.status}" data-rv="${x.id}" style="left:${(x.start / P.duration) * 100}%;width:${Math.max(1.2, (x.dur / P.duration) * 100)}%" title="${pad2(i + 1)} · ${esc(headline(x))}">${i + 1}</button>`).join('');
  $('#rvTc').textContent = `Motion ${pad2(idx + 1)} / ${pad2(ms.length)} · TC ${mmss(m ? m.start : 0)}`;
  // tarjeta
  if (skip !== 'review') {
    const card = $('#rvCard');
    if (!m) card.innerHTML = `<h2>Todavía no hay piezas</h2><p class="hint">Planificalas con Claude o sumalas desde la biblioteca en el Editor.</p><div class="row"><button class="btn pri" type="button" id="rvGoEd">Ir al editor</button></div>`;
    else {
      const last = m.hist?.[m.hist.length - 1];
      card.innerHTML = `<div class="row" style="flex-wrap:wrap"><span class="chip">${LAYOUT_NAME[m.layout]}</span><span class="chip">Duración aprox. ${Math.round(m.dur)} s</span><span class="chip">${esc(PRESETS[m.type].name)}</span></div>
        <h2>${esc(headline(m))}</h2>
        <div><div class="eyebrow">Lo que dice</div><p class="rv-quote" style="margin:6px 0 0">“${esc(m.quote || quoteFor(P, m) || '—')}”</p></div>
        <div><div class="eyebrow">Qué se mueve</div><p style="margin:6px 0 0;color:#c7cdd6">${esc(m.desc || 'Sin descripción.')}</p></div>
        ${S.qc[m.id] ? `<div class="qc"><b>Control de calidad:</b> ${esc(S.qc[m.id])}</div>` : ''}
        ${last ? `<p class="hint">Último cambio de Claude: ${esc(last.resumen || last.comment || '')}</p>` : ''}
        <div><div class="eyebrow" style="margin-bottom:6px">Feedback · Motion ${pad2(idx + 1)}</div>
          <div class="seg" role="group" aria-label="Estado">${[['aprobado', 'Aprobado'], ['cambios', 'Cambios'], ['pendiente', 'Pendiente']].map(([k, n]) => `<button type="button" data-st="${k}" aria-pressed="${m.status === k}">${n}</button>`).join('')}</div></div>
        <label class="f">Comentario para Claude<textarea id="rvComment" rows="3" placeholder="Ej.: más lento al entrar, sacar la bajada, usar el logo real">${esc(m.comment)}</textarea></label>
        <div class="row" style="flex-wrap:wrap"><button class="btn" id="rvSave" type="button">Guardar</button>
          <button class="btn claude" id="rvApply" type="button" ${!S.sample || !m.comment.trim() || S.busy.apply ? 'disabled' : ''}>${S.busy.applyOne === m.id ? 'Aplicando…' : 'Aplicar con Claude'}</button>
          ${m.hist?.length ? '<button class="btn ghost" id="rvRevert" type="button">Volver a la versión anterior</button>' : ''}
          <button class="btn ghost" id="rvEdit" type="button">Abrir en el editor</button></div>`;
    }
    wireReviewCard(m);
  }
  // lista
  $('#rvList').innerHTML = ms.map((x, i) => `<button type="button" class="rv-item ${x.id === m?.id ? 'on' : ''}" data-rv="${x.id}"><span class="t">${pad2(i + 1)} · ${tc(x.start, P.fps).slice(0, 5)}</span><span style="min-width:0"><span class="n" style="display:block">${esc(headline(x))}</span><span class="k">${LAYOUT_NAME[x.layout]}${x.comment ? ' · con comentario' : ''}${S.qc[x.id] ? ' · revisar' : ''}</span></span><span class="st ${x.status}">${x.status}</span></button>`).join('');
  $$('[data-rv]').forEach(b => b.onclick = () => rvSelect(b.dataset.rv));
}
function wireReviewCard(m) {
  const on = (sel, fn, ev = 'click') => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
  on('#rvGoEd', () => setMode('editor'));
  if (!m) return;
  $$('#rvCard .seg button').forEach(b => b.addEventListener('click', () => { const st = b.dataset.st; mutate(p => { p.motions.find(x => x.id === m.id).status = st; }); if (st === 'cambios') setTimeout(() => $('#rvComment')?.focus(), 30); }));
  on('#rvComment', e => { const v = e.target.value; mutate(p => { const x = p.motions.find(y => y.id === m.id); x.comment = v; if (v.trim() && x.status === 'pendiente') x.status = 'cambios'; }, { coalesce: 'rvc:' + m.id, skip: 'review' }); const ap = $('#rvApply'); if (ap) ap.disabled = !S.sample || !v.trim(); }, 'input');
  on('#rvSave', () => { store.flush(); toast('Feedback guardado. Claude lo puede leer desde el chat.'); renderReview(); });
  on('#rvApply', () => applyCommentWithClaude([m.id]));
  on('#rvRevert', () => mutate(p => { const x = p.motions.find(y => y.id === m.id); const h = x.hist.pop(); if (h?.prev) Object.assign(x, h.prev, { hist: x.hist, id: x.id }); }));
  on('#rvEdit', () => { S.sel = m.id; setMode('editor'); seek(m.start); });
}
function wireReview() {
  $('#rvPrev').addEventListener('click', () => { const ms = sortedMotions(), i = ms.findIndex(x => x.id === rvCurrent()?.id); if (i > 0) rvSelect(ms[i - 1].id); });
  $('#rvNext').addEventListener('click', () => { const ms = sortedMotions(), i = ms.findIndex(x => x.id === rvCurrent()?.id); if (i < ms.length - 1) rvSelect(ms[i + 1].id); });
  $('#rvReplay').addEventListener('click', () => { const m = rvCurrent(); if (m) rvSelect(m.id); });
  $('#rvPlayAll').addEventListener('click', () => { S.rvFollow = true; S.reviewStop = null; seek(0); play(); });
  $('#rvApplyAll').addEventListener('click', () => applyCommentWithClaude(S.p.motions.filter(x => x.status === 'cambios' && x.comment.trim()).map(x => x.id)));
  $('#rvQC').addEventListener('click', () => qcWithClaude());
  $('#rvNewRound').addEventListener('click', () => { mutate(p => { p.round = (p.round || 1) + 1; }); toast(`Empieza la revisión v${S.p.round}. Los estados quedan como están.`); });
}
