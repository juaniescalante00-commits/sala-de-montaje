/* ============ exportación ============ */
const MB_VER = '1.61.2';
let MBP = null;
function loadMB() {
  if (!MBP) MBP = (async () => {
    try { return await import(`https://cdn.jsdelivr.net/npm/mediabunny@${MB_VER}/dist/bundles/mediabunny.min.mjs`); }
    catch (e) { return await import('./mediabunny.min.mjs'); }
  })().catch(e => { MBP = null; throw e; });
  return MBP;
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function ensureAac(MB) {
  try { if (await MB.canEncodeAudio('aac')) return 'aac'; } catch (e) { }
  try {
    window.Mediabunny = MB;
    if (!window.MediabunnyAacEncoder) { try { await loadScript(`https://cdn.jsdelivr.net/npm/@mediabunny/aac-encoder@${MB_VER}/dist/bundles/mediabunny-aac-encoder.min.js`); } catch (e) { await loadScript('./mediabunny-aac-encoder.min.js'); } }
    window.MediabunnyAacEncoder.registerAacEncoder();
    if (await MB.canEncodeAudio('aac')) return 'aac';
  } catch (e) { console.warn('sin AAC', e); }
  return (await MB.canEncodeAudio('opus')) ? 'opus' : null;
}
function slug(s) { return String(s || 'video').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'video'; }
async function saveFile(filename, data) {
  if (S.dl) {
    try { await S.dl.save({ filename, data }); toast('Listo: ' + filename); return true; }
    catch (e) { if (e.code === 'declined') return false; if (e.code === 'rate_limited') { toast('Ya hay una descarga esperando confirmación.'); return false; } if (e.code !== 'unavailable') { toast('No se pudo descargar: ' + (e.message || e.code)); return false; } }
  }
  try { const blob = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return true; }
  catch (e) { toast('Las descargas no están disponibles en esta vista.'); return false; }
}

const EX = { running: false, cancel: false, result: null, prog: 0, info: '', opts: null };
function exDefaults() { const P = S.p; return EX.opts || (EX.opts = { res: 1080, fps: P.fps || 30, q: 'alta', motions: true, captions: true, grade: true, music: true, sfx: true, normalize: P.audio.normalize, voice: true }); }
async function exportMP4() {
  if (EX.running || !S.p) return;
  const P = S.p, o = exDefaults(); EX.running = true; EX.cancel = false; EX.result = null; EX.prog = 0; EX.info = 'Preparando…'; pause(); renderExport();
  const t0 = performance.now();
  let input = null, it = null, cur = null, nxt = null;
  try {
    await prepareMotions(P);
    const MB = await loadMB();
    const ow = o.res === 720 ? 720 : 1080, oh = Math.round(ow * 16 / 9), fps = +o.fps || 30;
    const bitrate = o.bitrate || { alta: ow === 1080 ? 14e6 : 8e6, media: ow === 1080 ? 8e6 : 5e6, liviana: ow === 1080 ? 4e6 : 2.5e6 }[o.q] || 8e6;
    let vcodec = null; for (const c of ['avc', 'hevc', 'vp9', 'av1']) { try { if (await MB.canEncodeVideo(c, { width: ow, height: oh, bitrate })) { vcodec = c; break; } } catch (e) { } }
    if (!vcodec) throw new Error('Este navegador no puede codificar video. Probá con Chrome o Edge actualizados.');
    const can = document.createElement('canvas'); can.width = ow; can.height = oh; const ctx = can.getContext('2d', { alpha: false });
    const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
    const vs = new MB.CanvasSource(can, { codec: vcodec, bitrate, keyFrameInterval: 2 });
    output.addVideoTrack(vs, { frameRate: fps });
    EX.info = 'Mezclando audio…'; renderExportProgress();
    let mix = null, acodec = null;
    try { mix = await renderMix(P.duration, { voice: o.voice, music: o.music, sfx: o.sfx, normalize: o.normalize }); } catch (e) { console.warn('mezcla', e); }
    let as = null;
    if (mix) { acodec = await ensureAac(MB); if (acodec) { as = new MB.AudioBufferSource({ codec: acodec, bitrate: 192000 }); output.addAudioTrack(as); } }
    await output.start();
    const blob = P.video ? await getVideoBlob() : null;
    let srcCan = null, sctx = null;
    if (blob) {
      input = new MB.Input({ source: new MB.BlobSource(blob), formats: MB.ALL_FORMATS });
      const vt = await input.getPrimaryVideoTrack();
      if (vt) { const sink = new MB.VideoSampleSink(vt); it = sink.samples(0)[Symbol.asyncIterator](); nxt = (await it.next()).value || null; srcCan = document.createElement('canvas'); sctx = srcCan.getContext('2d'); }
    }
    const show = { motions: o.motions ? undefined : [], captions: o.captions };
    const savedGrade = P.grade; if (!o.grade) P.grade = Object.assign(clone(P.grade), { preset: 'neutro', exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, fade: 0, vignette: 0, grain: 0 });
    const N = Math.max(1, Math.round(P.duration * fps)); const prev = $('#exPrev'); const pctx = prev?.getContext('2d');
    try {
      for (let i = 0; i < N; i++) {
        if (EX.cancel) throw new Error('cancelado');
        const t = i / fps;
        if (it) {
          while (nxt && nxt.timestamp <= t + 1e-3) { if (cur) cur.close(); cur = nxt; const r = await it.next(); nxt = r.done ? null : r.value; }
          const smp = cur || nxt;
          if (smp) {
            let dw = smp.displayWidth, dh = smp.displayHeight; const sc = Math.min(1, 2200 / Math.max(dw, dh)); dw = Math.round(dw * sc); dh = Math.round(dh * sc);
            if (srcCan.width !== dw || srcCan.height !== dh) { srcCan.width = dw; srcCan.height = dh; }
            smp.draw(sctx, 0, 0, dw, dh);
          }
        }
        if (show.motions === undefined && matteInfo(P) && behindList(P, activeMotions(P, t)).length && !matteAt(P, t)) await matteLoad(P, t, t + 3);
        composeFrame(ctx, t, { source: srcCan && srcCan.width > 1 ? srcCan : null, sw: srcCan?.width, sh: srcCan?.height, frameNo: i, motions: show.motions, captions: show.captions, strictMatte: true });
        await vs.add(t, 1 / fps);
        if (i % 6 === 0) {
          EX.prog = (i + 1) / N; const el = (performance.now() - t0) / 1000, rate = (i + 1) / el;
          EX.info = `Cuadro ${i + 1} de ${N} · ${rate.toFixed(1)} cuadros/s · faltan ~${Math.max(0, Math.round((N - i - 1) / rate))} s`;
          renderExportProgress(); if (pctx && i % 12 === 0) pctx.drawImage(can, 0, 0, prev.width, prev.height);
        }
      }
    } finally { P.grade = savedGrade; }
    if (as && mix) { EX.info = 'Codificando audio…'; renderExportProgress(); await as.add(mix); }
    EX.info = 'Cerrando el archivo…'; renderExportProgress();
    await output.finalize();
    const out = new Blob([output.target.buffer], { type: 'video/mp4' });
    EX.result = { blob: out, url: URL.createObjectURL(out), name: `${slug(P.name)}_v${P.round || 1}.mp4`, size: out.size, vcodec, acodec, w: ow, h: oh, fps, secs: (performance.now() - t0) / 1000, lufs: S.lastLufs };
    EX.prog = 1; EX.info = '';
  } catch (e) {
    console.error(e); EX.info = ''; if (String(e.message) !== 'cancelado') toast('La exportación falló: ' + (e.message || e)); else toast('Exportación cancelada.');
  } finally {
    try { cur?.close(); nxt?.close(); await it?.return?.(); } catch (e) { }
    EX.running = false; renderExport();
  }
}
function renderExportProgress() { const b = $('#exBar i'); if (b) b.style.width = Math.round(EX.prog * 100) + '%'; const t = $('#exInfo'); if (t) t.textContent = EX.info; }

/* ---- otros formatos ---- */
function srtText() {
  const P = S.p, gs = capGroups(P); const f = t => { const ms = Math.round(t * 1000); return `${pad2(ms / 3600000)}:${pad2((ms / 60000) % 60)}:${pad2((ms / 1000) % 60)},${String(ms % 1000).padStart(3, '0')}`; };
  return gs.map((g, i) => `${i + 1}\n${f(g.s)} --> ${f(g.end)}\n${g.words.map(w => w.w).join(' ')}\n`).join('\n');
}
function reviewMd() {
  const P = S.p, ms = sortedMotions();
  return `# ${P.name} · Motion graphics · Revisión v${P.round || 1}\n\n${ms.filter(m => m.status === 'aprobado').length} aprobados · ${ms.filter(m => m.status === 'cambios').length} con cambios · ${ms.length} piezas\n\n` +
    ms.map((m, i) => `## ${pad2(i + 1)} · ${headline(m)}\n- TC: ${tc(m.start, P.fps)} → ${tc(m.start + m.dur, P.fps)} (${m.dur.toFixed(1)} s)\n- Tipo: ${PRESETS[m.type].name} · ${LAYOUT_NAME[m.layout]}\n- Estado: **${m.status}**\n- Lo que dice: “${m.quote || quoteFor(P, m)}”\n- Qué se mueve: ${m.desc || '—'}\n${m.comment ? `- Comentario: ${m.comment}\n` : ''}`).join('\n');
}
async function styleframePNG() {
  const P = S.p, c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const m = selM() || rvCurrent(); const t = (S.mode !== 'editor' && m) ? m.start + Math.min(m.dur * .7, m.dur - .4) : S.t;
  if (t !== S.t) { seek(t); await waitSeek(); }
  composeFrame(c.getContext('2d'), t, { source: S.videoReady ? VID : null, sw: VID.videoWidth, sh: VID.videoHeight, frameNo: Math.round(t * P.fps) });
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  saveFile(`${slug(P.name)}_${tc(t, P.fps).replace(/:/g, '-')}.png`, blob);
}
function waitSeek() { return new Promise(res => { if (!S.videoReady) return res(); let done = false; const f = () => { if (done) return; done = true; VID.removeEventListener('seeked', f); setTimeout(res, 30); }; VID.addEventListener('seeked', f); setTimeout(f, 1200); }); }

function renderExport() {
  const P = S.p, o = exDefaults(), wrap = $('#exWrap'); if (!P) return;
  const src = P.video ? (S.localVideo ? `Original en este navegador · ${P.video.w}×${P.video.h}` : P.video.assetId ? (P.video.proxy ? 'Copia liviana 720p del proyecto (el original no está en este navegador)' : 'Video guardado en el proyecto') : 'Falta el video: volvé a cargarlo') : 'Fondo de demostración (sin video)';
  const R = EX.result;
  wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:18px;min-width:0">
    <div><div class="eyebrow">${esc(P.name)} · revisión v${P.round || 1}</div><h1>Exportar</h1>
      <p class="hint">${mmss(P.duration)} · ${P.motions.length} piezas · subtítulos ${P.captions.on ? CAPS[P.captions.style]?.name.toLowerCase() : 'apagados'} · look ${(GRADES[P.grade.preset]?.name || P.grade.lutName || 'propio').toLowerCase()} · ${P.music ? 'con música' : 'sin música'}</p></div>
    <div class="card sec" style="border-bottom:1px solid var(--line)">
      <h3>Video final · MP4 9:16</h3>
      <div class="grid3">${selectF('Resolución', 'res', [[1080, '1080 × 1920'], [720, '720 × 1280']], o.res, 'data-type="num"')}${selectF('Cuadros por segundo', 'fps', [[24, '24'], [25, '25'], [30, '30'], [60, '60']], o.fps, 'data-type="num"')}${selectF('Calidad', 'q', [['alta', 'Alta'], ['media', 'Media'], ['liviana', 'Liviana']], o.q)}</div>
      <div class="row" style="flex-wrap:wrap;gap:14px">${checkF('Motions', 'motions', o.motions)}${checkF('Subtítulos', 'captions', o.captions)}${checkF('Color', 'grade', o.grade)}${checkF('Voz', 'voice', o.voice)}${checkF('Música', 'music', o.music)}${checkF('Efectos', 'sfx', o.sfx)}${checkF('−14 LUFS', 'normalize', o.normalize)}</div>
      <p class="hint">Fuente: ${esc(src)}. Se renderiza en este navegador, cuadro por cuadro, con H.264 y AAC.</p>
      <div class="row" style="flex-wrap:wrap">${EX.running ? '<button class="btn" id="exCancel" type="button">Cancelar</button>' : `<button class="btn pri" id="exGo" type="button">Exportar MP4</button>`}</div>
      <div ${EX.running || R ? '' : 'hidden'}><div class="bar" id="exBar"><i style="width:${Math.round(EX.prog * 100)}%"></i></div><p class="hint mono" id="exInfo" style="margin-top:6px">${esc(EX.info)}</p></div>
      ${R ? `<div class="row" style="flex-wrap:wrap"><span>Listo: <b>${esc(R.name)}</b> · ${fmtBytes(R.size)} · ${R.w}×${R.h} ${R.fps} fps · ${R.vcodec.toUpperCase()}${R.acodec ? ' + ' + R.acodec.toUpperCase() : ' · sin audio'} · ${Math.round(R.secs)} s de render${R.lufs ? ` · audio ${R.lufs.before.toFixed(1)} → −14 LUFS` : ''}</span><button class="btn pri" id="exSave" type="button">Descargar MP4</button></div>
        ${R.vcodec !== 'avc' ? '<p class="hint">Este navegador no tiene H.264: el archivo usa otro códec. Para subir a Meta conviene exportar desde Chrome o Edge.</p>' : ''}${R.acodec === 'opus' ? '<p class="hint">El audio salió en Opus porque este navegador no codifica AAC.</p>' : ''}` : ''}
    </div>
    <div class="card sec" style="border-bottom:1px solid var(--line)">
      <h3>Otros formatos</h3>
      <div class="dl-list">
        <button class="btn" type="button" data-ex="srt" ${P.words?.length ? '' : 'disabled'}>Subtítulos .srt</button>
        <button class="btn" type="button" data-ex="png">Styleframe .png</button>
        <button class="btn" type="button" data-ex="md">Hoja de revisión .md</button>
        <button class="btn" type="button" data-ex="json">Proyecto .json</button>
        <button class="btn" type="button" data-ex="txt" ${P.words?.length ? '' : 'disabled'}>Transcripción .txt</button>
      </div>
      <p class="hint">El .json tiene todo el proyecto (piezas, tiempos, marca, color y transcripción): con eso Claude puede rehacer el render en alta con FFmpeg en el chat.</p>
    </div>
    <div class="card sec">
      <h3>Control con Claude</h3>
      <p class="hint">Claude mira cuadros del video para ubicar las caras (subtítulos y paneles en "Auto" las esquivan) y revisa cada pieza contra las zonas seguras y la marca.</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn claude" id="exFaces" type="button" ${!S.sample || !P.video || S.busy.faces ? 'disabled' : ''}>${S.busy.faces ? 'Buscando caras…' : P.faces?.length ? 'Volver a detectar caras' : 'Detectar caras'}</button>
      <button class="btn claude" id="exQC" type="button" ${!S.sample || !P.motions.length || S.busy.qc ? 'disabled' : ''}>${S.busy.qc ? 'Revisando…' : 'Control de calidad'}</button></div>
      ${P.faces?.length ? `<p class="hint">${P.faces.filter(f => f.caras?.length).length} de ${P.faces.length} cuadros con cara detectada.</p>` : ''}${claudeNote()}
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:10px">
    ${R ? `<video src="${R.url}" controls playsinline style="width:100%;aspect-ratio:9/16;background:#000;border-radius:8px"></video>` : '<canvas id="exPrev" width="360" height="640"></canvas>'}
    <p class="hint">${R ? 'Resultado exportado.' : EX.running ? 'Vista del render en curso.' : 'Cuadro actual.'}</p>
  </div>`;
  wrap.querySelectorAll('[data-bind]').forEach(el => el.addEventListener('change', () => { const o2 = exDefaults(), k = el.dataset.bind; o2[k] = el.type === 'checkbox' ? el.checked : el.dataset.type === 'num' ? num(el.value) : el.value; }));
  const on = (sel, fn) => wrap.querySelector(sel)?.addEventListener('click', fn);
  on('#exGo', exportMP4); on('#exCancel', () => { EX.cancel = true; });
  on('#exSave', () => saveFile(R.name, R.blob));
  on('#exFaces', detectFacesWithClaude); on('#exQC', () => { setMode('review'); qcWithClaude(); });
  wrap.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.ex, n = slug(P.name);
    if (k === 'srt') saveFile(n + '.srt', srtText());
    else if (k === 'md') saveFile(n + '_revision_v' + (P.round || 1) + '.md', reviewMd());
    else if (k === 'json') saveFile(n + '.json', JSON.stringify(P, null, 1));
    else if (k === 'txt') saveFile(n + '_transcripcion.txt', (P.words || []).map(w => w.w).join(' '));
    else if (k === 'png') styleframePNG();
  }));
  const prev = $('#exPrev'); if (prev && !EX.running) { composeFrame(prev.getContext('2d'), S.t, { source: S.videoReady ? VID : null, sw: VID.videoWidth, sh: VID.videoHeight }); }
}
