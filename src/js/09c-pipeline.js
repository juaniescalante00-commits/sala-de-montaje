/* ============ edición con Claude: mira el video, planifica, edita, aplica reglas y se autorrevisa ============ */
/* conocimiento de edición (investigación propia + documento "Reglas de edición de video para Claude" de Juani) */
const EDIT_KNOWLEDGE = `CONOCIMIENTO DE EDICIÓN (aplicalo siempre; las reglas de Juani ganan sobre cualquier otra guía):
- Reglas textuales de Juani: "estética minimalista y editorial, nada de pips ni mini zooms, subtítulos con 10% de margen y sin tapar caras, de a uno". Tipografía sobria (una o dos familias), paleta corta, aire en el cuadro.
- Jerarquía de Murch: emoción > historia > ritmo > dirección de la mirada. Cada elemento dura lo que tarda en entregar su información o emoción, ni un cuadro más. Variá duraciones.
- Anuncio UGC/performance de 15 a 30 s: gancho 0–3 s (promesa de valor, declaración o pregunta; el primer cuadro funciona como miniatura, sin intro ni logo), problema 3–8 s, demostración 8–20 s, prueba 20–25 s (un dato por bloque), CTA en los últimos 3–5 s (dicho y escrito, dentro de la zona segura). Marca o producto en los primeros 3 s. Pensado para verse sin sonido, mezclado para escucharse.
- Gráficos: solo los que informan (dato, nombre, promesa, paso, CTA). Un mensaje por bloque. Si pasan dos frases sin cambio visual, podés sumar un gráfico, pero una buena actuación puede sostenerse sola. Nada de B-roll ni adornos decorativos.
- Movimiento: entradas sobrias (máscara, fundido o desplazamiento corto con easing suave), sin rebotes, sacudidas, giros, barridos ni glitches decorativos. Movimientos de cámara y de 3D lentos y motivados; cámaras estables.
- Subtítulos: un bloque por vez, una línea (dos como máximo), hasta 42 caracteres por línea y 17 por segundo, cortados en unidades de sentido, entre 5/6 de segundo y 7 s. Por defecto sin resaltar palabra por palabra salvo que el estilo lo pida. Zona útil en 9:16: y entre 270 y 1248, x entre 120 y 960 (la columna de íconos de TikTok queda a la derecha).
- Sonido: el diálogo manda. Música por debajo de la voz con ducking, nunca música que tape. Ningún sonido de plantilla sobre textos. Master −14 LUFS, pico −1 dBTP.
- Errores de amateur a evitar: arrancar con intro o saludo, mini zooms y pips, transiciones de plantilla, textos pegados al borde o tapando caras, dos o tres textos a la vez, música tapando la voz, exceso de texto, CTA ambiguo.`;
function libraryForAgent() {
  const lib = S.library || [], kit = S.sfxKit;
  const mus = lib.filter(x => x.kind === 'musica').map(x => `${x.id}=${String(x.name).slice(0, 48)} [${x.folder || ''}]`);
  const groups = {};
  for (const x of lib) { if (x.kind !== 'sonido') continue; const uso = kit ? kit[x.id] : (x.folder || 'varios'); if (!uso) continue; (groups[uso] = groups[uso] || []).push(`${x.id}=${String(x.name).slice(0, 40)}${x.dur ? ` (${(+x.dur).toFixed(1)}s)` : ''}`); }
  const raw = S.p?.audio?.rawMusic;
  return `${raw ? 'MÚSICA: EL VIDEO YA TRAE MÚSICA PROPIA. Prohibido agregar otra (la op "musica" se ignora).' : `MÚSICA: ${mus.join(' | ') || '(nada)'}`}\nSONIDOS DEL KIT PROFESIONAL (los únicos que podés usar, por uso):\n${Object.entries(groups).map(([k, v]) => `- ${k}: ${v.join(' | ')}`).join('\n') || '(sin sonidos)'}`;
}
/* dónde está la cara en el cuadro final, cada ~2 s, en px de 1080×1920 */
function facesForAgent(P) {
  if (!(P.faces || []).some(f => f.caras?.length)) return P.video ? 'Cara del presentador: todavía no detectada. Poné los textos arriba (y 270–560) o en pantalla completa, nunca en el centro.' : '';
  const out = []; for (let t = 0; t < P.duration; t += 2) { const f = faceBoxOut(P, t); out.push(f ? `${t.toFixed(0)}s:[x${Math.round(f[0] * W)}-${Math.round((f[0] + f[2]) * W)} y${Math.round(f[1] * H)}-${Math.round((f[1] + f[3]) * H)}]` : `${t.toFixed(0)}s:sin cara`); }
  return `CARA DEL PRESENTADOR en el cuadro final (px de 1080×1920, cada 2 s; la zona prohibida incluye pelo y mentón, sumá ~35% arriba y ~25% abajo): ${out.join(' ')}`;
}
function agentPrompt(P, text, imgNotes) {
  const hist = (P.chat || []).slice(-8).map(c => `${c.role === 'user' ? 'QUIEN EDITA' : 'VOS'}: ${c.text}`).join('\n');
  const style = styleForAgent(P);
  return `Sos un editor de video y motion designer senior que trabaja para Juani en UGC Studio (anuncios verticales 9:16 para Meta, TikTok y Reels). Trabajás dentro de "Sala de Montaje": recibís un pedido libre, escrito o dictado, y lo convertís en cambios concretos sobre el proyecto, con el nivel de un editor top de agencia.
Cómo pensás: primero entendés el mensaje del video y a quién le habla; después decidís qué momentos merecen un gráfico (datos, promesas, nombres, giros, el cierre) y cuáles no necesitan nada. Menos piezas y mejor hechas. Cada pieza tiene un motivo y entra justo cuando se dice lo que muestra.
Este editor es moldeable: si el pedido o el estilo piden algo que las plantillas no tienen (tipografía cinética, máscaras, After Effects, 3D, una animación particular), escribilo vos con una pieza "codigo" o "3d". No te limites a las plantillas. Si algo de verdad no se puede (cortar el video, generar imágenes o voces), decilo en "respuesta" y hacé lo más cercano.

${rulesText()}

${EDIT_KNOWLEDGE}

${STYLE_RULES}
- Respetá los tiempos del transcript: lo que se dice en cada segundo está en palabra@segundo.
${style ? '\n' + style + '\n' : ''}
TIPOS DE PIEZA:
${catalogText()}
${LIBRE_DOC}
${CODE_DOC}
${THREE_DOC}
${LOTTIE_DOC}
PLANTILLAS DE AFTER EFFECTS CARGADAS:
${templatesForAgent()}

UBICACIÓN: en piezas plantilla usá pos "auto" (el editor esquiva la cara). En "libre", "codigo" y "3d" ubicá todo vos dentro de la zona segura y fuera de la cara. Igual el editor mide cada pieza y la corre si tapa la cara o se sale de la zona segura.
DETRÁS DE LA PERSONA: ${matteInfo(P) ? 'hay recorte de persona para este video. Una pieza con "behind":true se dibuja detrás de quien habla (la persona queda encima): es la forma de poner una palabra gigante detrás de la cabeza sin taparle la cara. Usalo con "palabra" en momentos clave (gancho, promesa, cierre), como mucho una cada 6 a 8 s.' : 'todavía no hay recorte de persona para este video: no uses "behind".'}
CÁMARA: {"op":"camara","seguirCara":true,"zoomBase":1.15,"altoCara":0.36,"zooms":[{"s":3.2,"e":5.0,"z":1.12}]} sigue la cara del presentador con un reencuadre suave; los zooms son acercamientos puntuales (pocos, solo en frases fuertes).
ESTILOS DE SUBTÍTULOS: ${Object.entries(CAPS).map(([k, v]) => `${k} (${v.name})`).join(', ')}. Posiciones: auto, abajo, centro, arriba. Campos: on, style, pos, y (0.45–0.64), maxWords (1–6), size (0.7–1.4), upper, hideOnFull, duringText ("auto" oculta los subtítulos si una pieza repite lo dicho, "ocultar" los oculta con cualquier texto en pantalla).
LOOKS DE COLOR: ${Object.entries(GRADES).map(([k, v]) => `${k} (${v.name})`).join(', ')}. Campos: preset, mix (0–1), exposure, contrast, saturation, temperature, tint (−1 a 1; 0,08 = +8%, nunca 8), fade, vignette, grain (0–1). Ajustes sutiles, casi siempre entre −0,2 y 0,2.
MOVIMIENTO: expo, suave, seco. MARCA: display, body (fuentes: ${allFonts(P).join(', ')}), dw (peso), upper, bg, fg, accent (hex), panel (glass|solid|light), radius, track.
SONIDOS DE PIEZA: "ninguno" (lo normal), sintetizados whoosh, aire, sub, riser, o del kit como "lib:<id>". Un sonido solo cuando algo visible cambia (entra una pantalla completa, cae un número). Elegí por el uso: whoosh para algo que entra moviéndose, impacto para un dato que cae, riser antes de un reveal.
${libraryForAgent()}

${facesForAgent(P)}

PROYECTO ACTUAL:
${JSON.stringify(projectForAgent(P))}

TRANSCRIPT (palabra@segundo):
${P.words?.length ? wordsText(P.words) : '(todavía no hay transcripción)'}
${hist ? `\nCONVERSACIÓN ANTERIOR:\n${hist}\n` : ''}${imgNotes?.length ? `\nIMÁGENES ADJUNTAS:\n${imgNotes.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n` : ''}
PEDIDO NUEVO: ${text}

Respondé solo con JSON:
{"plan":"tu razonamiento de editor en 2 a 4 frases: qué momentos elegiste y por qué, y cómo aplicás el estilo","respuesta":"qué hiciste, en 1 a 3 frases, en español rioplatense","ops":[
 {"op":"crear","pieza":{"type":"...","start":0,"dur":4,"layout":"overlay","pos":"auto","bg":"video","tr":"subir","sfx":"ninguno","params":{},"beats":[],"quote":"","desc":""}},
 {"op":"editar","id":"<id de pieza>","cambios":{"...":"solo lo que cambia; params se combina"}},
 {"op":"borrar","id":"<id>"},
 {"op":"proyecto","subtitulos":{},"color":{},"audio":{},"marca":{},"movimiento":"expo"},
 {"op":"camara","seguirCara":false,"zooms":[]},
 {"op":"musica","id":"<id de la biblioteca o null para quitar>","volumen":0.18,"ducking":true},
 {"op":"palabras","cambios":[{"i":3,"w":"Atlas"}]}
]}
Usá solo las ops que hagan falta. Si el pedido es una pregunta, respondela y dejá "ops" vacío.`;
}
/* hoja de cuadros: tiempos → imagen con rótulos */
async function framesSheet(times, opts, cols = 4, tw = 240) {
  const th = Math.round(tw * 16 / 9), tiles = [];
  for (const t of times) { seek(t); await waitSeek(); const c = document.createElement('canvas'); c.width = tw; c.height = th; composeFrame(c.getContext('2d'), t, Object.assign({ source: S.videoReady ? VID : null, sw: VID.videoWidth, sh: VID.videoHeight }, opts)); tiles.push({ c, label: t.toFixed(1) + 's' }); }
  return sheetOf(tiles, Math.min(cols, tiles.length), tw, th);
}
function reviewPrompt(P, text, ms, plan) {
  return `Sos el supervisor de edición. Revisá tu propia edición antes de entregarla a Juani. La imagen 1 muestra el cuadro final (con gráficos y subtítulos) en el momento en que cada pieza está completa, en este orden: ${ms.map((m, i) => `${i + 1}) ${m.id} ${PRESETS[m.type]?.name || m.type} en ${m.start.toFixed(1)}s`).join(', ')}.${styleOf(P) ? ' Las imágenes siguientes son la REFERENCIA de estilo a igualar.' : ''}
Pedido original: ${text}
Tu plan: ${plan || ''}
${rulesText()}
Checklist final (todo tiene que dar sí): los primeros 3 s funcionan sin sonido; no hay pips, mini zooms, stickers ni transiciones de plantilla; nada a menos del 10% de cada borde ni fuera de la zona segura; nada tapa una cara; nunca hay más de un texto a la vez; el CTA es claro.\nMirá cada cuadro como un director exigente: ¿tapa la cara? ¿hay doble texto (el mismo texto en un título y en los subtítulos)? ¿el texto se lee, está bien jerarquizado y alineado, dentro de la zona segura? ¿se ve profesional y coherente con el estilo pedido? ¿algún sonido o pieza sobra?
Si todo está bien, devolvé ops vacío. Si algo falla, corregilo con ops concretas (mismas ops que antes: editar, borrar, crear, proyecto, camara).
PROYECTO: ${JSON.stringify(projectForAgent(P))}
Respondé solo con JSON: {"ok":true,"nota":"1 frase con lo que corregiste o 'Revisado, sin cambios'","ops":[]}`;
}
async function runAgent(text) {
  const P = S.p; text = String(text || '').trim(); if (!P || !text || !S.sample || S.busy.agent) return;
  S.busy.agent = true; S.agentCtl = new AbortController(); S.agentLive = '';
  chatPush({ role: 'user', text, at: Date.now() });
  const live = msg => { S.agentLive = msg; for (const el of [$('#agentLive'), $('#hmLive')]) if (el) el.textContent = msg; };
  const tBack = S.t; pause();
  try {
    await prepareMotions(P);
    const lim = await S.sample.limits().catch(() => null), canImg = !!lim?.images, maxImg = Math.min(lim?.images?.maxCount || 0, 6);
    const images = [], notes = [];
    if (canImg && P.video && (S.videoReady || S.localVideo)) {
      live('Claude está mirando el video…');
      if (!S.videoReady) await new Promise(r => { const t0 = Date.now(); const iv = setInterval(() => { if (S.videoReady || Date.now() - t0 > 8000) { clearInterval(iv); r(); } }, 150); });
      const n = 8, times = Array.from({ length: n }, (_, i) => +((i + 0.5) * P.duration / n).toFixed(2));
      images.push(await framesSheet(times, { motions: [], captions: false })); notes.push(`El video crudo, 8 cuadros repartidos (${times.map(t => t + 's').join(', ')}), sin gráficos: mirá el encuadre, dónde está la cara, el fondo y los colores.`);
    }
    const st = styleOf(P);
    if (canImg && st?.refs?.length) for (const id of st.refs.slice(0, Math.max(0, maxImg - images.length - (S.agentImg ? 1 : 0)))) { try { const r = await fetch('/_blob/' + id); if (r.ok) { images.push(await r.blob()); notes.push(`Referencia de estilo "${st.name}" (hoja de cuadros del video de referencia). Igualá su lenguaje visual.`); } } catch (e) { } }
    if (canImg && S.agentImg && images.length < maxImg) { images.push(await frameBlob(tBack, 540)); notes.push(`El cuadro actual (segundo ${tBack.toFixed(2)}) tal como se ve con los gráficos.`); }
    live('Claude está editando…');
    const res = await S.sample.json(agentPrompt(P, text, notes), Object.assign({ signal: S.agentCtl.signal, onText: ({ text: t }) => live(`Claude está editando… ${t.length} caracteres`) }, images.length ? { images } : {}));
    if (S.p !== P) { S.busy.agent = false; S.agentCtl = null; return; }
    const before = new Set(P.motions.map(m => m.id + JSON.stringify(m)));
    let log = applyAgentOps(Array.isArray(res?.ops) ? res.ops : []);
    await prepareMotions(P);
    let rr = runRules(true);
    let reply = String(res?.respuesta || (log.length ? 'Listo.' : 'No encontré nada para cambiar.'));
    // autorrevisión con cuadros renderizados
    const touched = sortedMotions().filter(m => !before.has(m.id + JSON.stringify(m)));
    if (canImg && touched.length && !S.agentCtl.signal.aborted) {
      live('Claude está revisando su edición…');
      const ms = touched.slice(0, 8), times = ms.map(m => +Math.min(revealTime(m), m.start + m.dur - 0.2).toFixed(2));
      const imgs = [await framesSheet(times, {}, 4, 270)];
      if (st?.refs?.[0]) { try { const r = await fetch('/_blob/' + st.refs[0]); if (r.ok) imgs.push(await r.blob()); } catch (e) { } }
      try {
        const qc = await S.sample.json(reviewPrompt(P, text, ms, res?.plan), { images: imgs, signal: S.agentCtl.signal });
        if (S.p === P && Array.isArray(qc?.ops) && qc.ops.length) { const l2 = applyAgentOps(qc.ops); log = log.concat(l2.map(x => x + ' (revisión)')); await prepareMotions(P); const r2 = runRules(true); rr = { fixes: rr.fixes.concat(r2.fixes), warns: r2.warns }; }
        if (qc?.nota) reply += ' ' + String(qc.nota);
      } catch (e) { if (e?.code === 'cancelled') throw e; }
    }
    if (rr.fixes.length) log = log.concat(rr.fixes.map(f => 'regla: ' + f));
    if (rr.warns.length) log = log.concat(rr.warns.map(f => '¡ojo! ' + f));
    chatPush({ role: 'claude', text: reply, log, at: Date.now() });
    S.dirty = true;
  } catch (e) {
    if (e?.code !== 'cancelled') console.warn('agente', e);
    if (S.p === P) chatPush({ role: 'claude', text: e?.code === 'cancelled' ? 'Lo detuve. Lo que ya estaba hecho se puede deshacer con Ctrl + Z.' : sampleErr(e), log: [], at: Date.now(), err: e?.code !== 'cancelled', cancelled: e?.code === 'cancelled' });
  }
  S.busy.agent = false; S.agentCtl = null; seek(tBack); renderLeft(); if (S.home) renderHome();
}
