/* Sala de Montaje · renderizador sin pantalla (para Claude Code en la nube)
   Abre el editor real (sala.html) en Chromium, carga un proyecto, aplica operaciones de edición,
   corre las reglas y saca hojas de cuadros y/o el MP4 final.

   node edit.js --dist <carpeta con sala.html y librerías> --blobs <carpeta con recursos, cada archivo nombrado por su assetId>
                  --project <proyecto.json> [--ops <ops.json>] [--clear] [--settings <settings.json>]
                  [--sheet "1.2,5,11.5"] [--cols 4] [--width 360] [--export <salida.mp4>] [--doc <manual.txt> --pedido "texto"] --out <carpeta>
                  [--sin-contraste] [--sin-nitidez]

   Escribe en --out: project.json (proyecto final), rules.json ({log, fixes, warns}) y sheet.jpg.
   Necesita: npm i playwright (o el Playwright preinstalado). Si chromium no tiene el códec, exporta en VP9 y
   lo pasa a H.264 con ffmpeg. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const FUENTES = require('./fuentes_locales.js'); // las tipografías de la Sala sin Google Fonts (bloqueado en la nube)

const A = {}; for (let i = 2; i < process.argv.length; i++) { const k = process.argv[i]; if (k.startsWith('--')) { const v = process.argv[i + 1]; if (!v || v.startsWith('--')) A[k.slice(2)] = true; else { A[k.slice(2)] = v; i++; } } }
for (const k of ['dist', 'blobs', 'project', 'out']) if (!A[k]) { console.error('falta --' + k); process.exit(2); }
const DIST = path.resolve(A.dist), BLOBS = path.resolve(A.blobs), OUT = path.resolve(A.out); fs.mkdirSync(OUT, { recursive: true });
const PROJ = JSON.parse(fs.readFileSync(A.project, 'utf8')); delete PROJ._wv_unused;
const OPS = A.ops ? JSON.parse(fs.readFileSync(A.ops, 'utf8')) : [];
const SETTINGS = A.settings ? JSON.parse(fs.readFileSync(A.settings, 'utf8')) : {};
const skel = b => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${b}</body></html>`;
const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4' };
const HQ = {};   // assetId → versión escalada para exportar (nitidez)
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(skel(fs.readFileSync(path.join(DIST, 'sala.html'), 'utf8'))); }
  if (u.startsWith('/_blob/')) {
    const id = u.slice(7); const f = HQ[id] ? path.relative(BLOBS, HQ[id]) : fs.readdirSync(BLOBS).find(n => n === id || n.startsWith(id + '.'));
    if (!f) { res.statusCode = 404; return res.end(); }
    const buf = fs.readFileSync(path.join(BLOBS, f)); res.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); res.setHeader('accept-ranges', 'bytes');
    const rg = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (rg) { const a = rg[1] ? +rg[1] : 0, b = rg[2] ? +rg[2] : buf.length - 1; res.statusCode = 206; res.setHeader('content-range', `bytes ${a}-${b}/${buf.length}`); return res.end(buf.subarray(a, b + 1)); }
    return res.end(buf);
  }
  if (u.startsWith('/_fonts/')) { const ff = FUENTES.archivo(u.slice(7)); if (!ff) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', ff.endsWith('.woff2') ? 'font/woff2' : 'font/woff'); return res.end(fs.readFileSync(ff)); }
  const f = path.join(DIST, u); if (f.startsWith(DIST) && fs.existsSync(f)) { res.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); return res.end(fs.readFileSync(f)); }
  res.statusCode = 404; res.end();
});
const MOCK = ([proj, settings]) => {
  const store = new Map([['projects/' + proj.id, proj]]), subs = {};
  for (const [k, v] of Object.entries(settings || {})) store.set(k, v);
  const snapOf = c => ({ docs: [...store.entries()].filter(([k]) => k.split('/')[0] === c && k.split('/').length === 2).map(([k, v]) => ({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(v)) })), metadata: { hasPendingWrites: false, fromCache: false } });
  const db = {
    collection: c => ({ onSnapshot: cb => { (subs[c] = subs[c] || []).push(cb); setTimeout(() => cb(snapOf(c)), 20); return () => { }; } }),
    doc: p => ({ set: async d => { store.set(p, JSON.parse(JSON.stringify(d))); }, delete: async () => { store.delete(p); } }),
  };
  const sample = async () => { throw Object.assign(new Error('sin Claude en el renderizador'), { code: 'unavailable' }); };
  sample.limits = async () => null; sample.json = sample;
  window.claude = { use: async n => ({ db, assets: { upload: async () => ({ id: 'x' }), delete: async () => ({}) }, user: { can: async () => true } })[n] || null };
};
(async () => {
  // Nitidez al exportar (HARD-RULES 43): si el video del proyecto es la copia liviana (720p), se escala a 1080×1920 con
  // lanczos y un enfoque leve (unsharp 5×5 0,5, solo luminancia) y el editor exporta desde esa versión. Sin tocar la
  // página: es el mismo video, mismos cuadros y tiempos. --sin-nitidez lo apaga.
  if (A.export && !A['sin-nitidez'] && PROJ.video?.assetId) {
    const id = PROJ.video.assetId, f = fs.readdirSync(BLOBS).find(n => n === id || n.startsWith(id + '.'));
    if (f) {
      const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path.join(BLOBS, f)], { encoding: 'utf8' })).streams[0];
      if (pr && pr.height < 1920) {
        const dir = path.join(OUT, '_hq'); fs.mkdirSync(dir, { recursive: true }); const dst = path.join(dir, id + '.mp4'); const t0 = Date.now();
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(BLOBS, f), '-vf', 'scale=1080:1920:flags=lanczos,unsharp=5:5:0.5:5:5:0',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', dst]);
        HQ[id] = dst; console.log(`nitidez: ${pr.width}×${pr.height} → 1080×1920 (lanczos + enfoque leve) en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
    }
  }
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', e => console.log('ERROR de página: ' + e.message));
  await page.addInitScript(MOCK, [PROJ, SETTINGS]);
  await FUENTES.interceptar(page, `http://localhost:${port}/_fonts`);
  await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(1200);
  await page.evaluate(id => { const p = S.projects.find(x => x.id === id); openProject(p); }, PROJ.id);
  // carga ya todas las tipografías (en el canvas no se piden solas): así los cuadros salen con la fuente real
  const fx = await page.evaluate(async () => { const fams = new Set(FONTS.concat(S.p.brand?.display || [], S.p.brand?.body || [])); await Promise.all([...fams].flatMap(f => ['400', '500', '600', '700', '800', 'italic 400', 'italic 600'].map(w => document.fonts.load(`${w} 40px "${f}"`).catch(() => { })))); const ok = new Set([...document.fonts].filter(x => x.status === 'loaded').map(x => x.family.replace(/["']/g, ''))); return [...fams].filter(f => !ok.has(f)); }).catch(e => ['error: ' + e.message]);
  if (fx.length) console.log('OJO: fuentes sin cargar: ' + fx.join(', '));
  if (PROJ.video) await page.waitForFunction(() => S.videoReady, null, { timeout: 60000 });
  await page.waitForFunction(() => S.voiceBuf || !S.p.video, null, { timeout: 60000 }).catch(() => { });
  await page.waitForTimeout(400);
  const res = await page.evaluate(async ({ ops, clear }) => {
    if (clear) mutate(p => { p.motions = []; });
    // la página publicada (hasta que se publique el arreglo) edita la PRIMERA pieza cuando una op trae id sin n:
    // se completa n con el orden por inicio para que el id encuentre su pieza (HARD-RULES 40)
    const orden = (S.p.motions || []).slice().sort((a, b) => a.start - b.start);
    for (const o of ops) if ((o.op === 'editar' || o.op === 'borrar') && o.id && o.n == null) { const i = orden.findIndex(m => m.id === o.id); o.n = i >= 0 ? i + 1 : -1; }
    const log = ops.length ? applyAgentOps(ops) : [];
    await prepareMotions(S.p);
    const rr = runRules(true);
    await prepareMotions(S.p);
    return { log, fixes: rr.fixes, warns: rr.warns };
  }, { ops: OPS, clear: !!A.clear });
  // Contraste de los insertos (texto del clip contra el fondo real compuesto: color, cámara y demás piezas). Si no
  // llega a 3:1 (WCAG para texto grande) lo mueve a la posición vertical más cercana que sí llegue, dentro de la zona
  // segura y sin tapar caras; si ninguna llega, avisa que el inserto necesita velo (HARD-RULES 42).
  if (!A['sin-contraste']) {
    const ct = await page.evaluate(async (umbral) => {
      const lum = (r, g, b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const K = 0.25, w = Math.round(W * K), h = Math.round(H * K), rep = [];
      for (const m of (S.p.motions || []).filter(m => m.type === 'inserto' && m.params?.clip)) {
        await insLoadPreview(m);
        const mu = [];
        for (const f of [0.35, 0.55, 0.75, 0.92]) {
          const t = m.start + m.dur * f; seek(t); await waitSeek();
          const clip = m.params.clip; m.params.clip = '';
          const cb = document.createElement('canvas'); cb.width = w; cb.height = h;
          composeFrame(cb.getContext('2d'), t, { source: S.videoReady ? VID : null, sw: VID.videoWidth, sh: VID.videoHeight });
          m.params.clip = clip;
          const fr = insFrameAt(m, t - m.start); if (!fr) continue;
          const ci = document.createElement('canvas'); ci.width = w; ci.height = h; const x = ci.getContext('2d');
          x.scale(K, K); const fit = m.layout !== 'full' && m.fit;
          if (fit) { x.translate(fit.ox, fit.oy + (fit.dy || 0)); x.scale(fit.s || 1, fit.s || 1); x.translate(-fit.ox, -fit.oy); }
          const p = m.params, d = insDims(m), dw = W * clamp(num(p.escala, 1), 0.05, 3), dh = dw * d.h / d.w;
          x.drawImage(fr, clamp(num(p.x, 0.5), 0, 1) * W - dw / 2, clamp(num(p.y, 0.5), 0, 1) * H - dh / 2, dw, dh);
          mu.push({ bg: cb.getContext('2d').getImageData(0, 0, w, h).data, ins: x.getImageData(0, 0, w, h).data });
        }
        if (!mu.length) continue;
        const cara = protectedBox(S.p, m.start, m.start + m.dur);
        // c: texto contra el fondo SIN el inserto (lo que da el video); cv: texto contra lo que lo rodea YA compuesto
        // (fondo + velo + sombra del inserto, a 3 px): lo que ve el ojo. Pasa con c >= 3 o con cv >= 4,5.
        const medir = dyp => {
          const rs = [], rv = []; let y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1;
          for (const s of mu) for (let i = 0; i < w * h; i++) {
            if (s.ins[i * 4 + 3] < 204) continue;
            const r = Math.floor(i / w), c = i % w, r2 = r + dyp; if (r2 < 0 || r2 >= h) return null;
            const j = (r2 * w + c) * 4, lt = lum(s.ins[i * 4], s.ins[i * 4 + 1], s.ins[i * 4 + 2]), lb = lum(s.bg[j], s.bg[j + 1], s.bg[j + 2]);
            rs.push((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
            let peor = null;
            for (const [dr, dc] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) {   // a ~16 px: afuera del borde suavizado de la letra
              const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
              const k = rr * w + cc; const a = s.ins[k * 4 + 3] / 255; if (a > 0.45) continue;   // solo sombra, velo o fondo
              const rb = rr + dyp; if (rb < 0 || rb >= h) continue; const kb = (rb * w + cc) * 4;
              const mix = q => s.ins[k * 4 + q] * a + s.bg[kb + q] * (1 - a);
              const ln = lum(mix(0), mix(1), mix(2)); const cr = (Math.max(lt, ln) + 0.05) / (Math.min(lt, ln) + 0.05);
              if (peor === null || cr < peor) peor = cr;
            }
            if (peor !== null) rv.push(peor);
            y0 = Math.min(y0, r2); y1 = Math.max(y1, r2); x0 = Math.min(x0, c); x1 = Math.max(x1, c);
          }
          if (!rs.length) return null;
          rs.sort((a, b) => a - b); rv.sort((a, b) => a - b);
          const c10 = rs[Math.floor(rs.length * 0.1)], v10 = rv.length ? rv[Math.floor(rv.length * 0.1)] : 0;
          // la caja para zona segura y caras es la misma que mide la regla de la página (todo lo que tiene opacidad > 24:
          // texto, sombra y velo), así nunca se propone un lugar que después la regla vuelva a mover
          let by0 = 1e9, by1 = -1, bx0 = 1e9, bx1 = -1;
          for (const s of mu) for (let i = 0; i < w * h; i++) if (s.ins[i * 4 + 3] > 24) { const r = Math.floor(i / w) + dyp, c = i % w; if (r < by0) by0 = r; if (r > by1) by1 = r; if (c < bx0) bx0 = c; if (c > bx1) bx1 = c; }
          const box = { x: bx0 / K, x1: (bx1 + 1) / K, y: by0 / K, y1: (by1 + 1) / K };
          const valido = box.y >= SAFE.top + 8 && box.y1 <= SAFE.bottom && !boxHitsFace(box, cara);
          return { c: c10, cv: v10, nota: Math.max(c10 / umbral, v10 / (umbral * 1.5)), p50: rs[Math.floor(rs.length * 0.5)], box, valido };
        };
        const ahora = medir(0); if (!ahora) continue;
        const r = { id: m.id, start: m.start, fondo: +ahora.c.toFixed(2), compuesto: +ahora.cv.toFixed(2), movido_px: 0, velo: false };
        if (ahora.nota < 1) {
          // la posición más cercana que pasa, y desde ahí hasta 80 px más la de mejor contraste (margen para la cámara que se mueve)
          let mejor = null, primero = null;
          for (let k = 1; k <= 175; k++) {
            if (primero !== null && k > primero + 20) break;
            for (const dyp of [-k, k]) {
              const v = medir(dyp); if (!v || !v.valido) continue;
              if (primero === null && v.nota >= 1) { primero = k; mejor = Object.assign({ dyp }, v); continue; }
              if (!mejor || v.nota > mejor.nota + 1e-6) mejor = Object.assign({ dyp }, v);
            }
          }
          if (mejor && mejor.nota > ahora.nota + 0.1) {
            const s = (m.layout !== 'full' && m.fit?.s) || 1;
            m.params.y = clamp(num(m.params.y, 0.5) + (mejor.dyp / K) / H / s, 0, 1); delete m.fit;
            r.movido_px = Math.round(mejor.dyp / K); r.despues = { fondo: +mejor.c.toFixed(2), compuesto: +mejor.cv.toFixed(2) };
          }
          r.velo = (mejor && mejor.nota > ahora.nota + 0.1 ? mejor.nota : ahora.nota) < 1;
        }
        rep.push(r);
      }
      return rep;
    }, 3.0);
    if (ct.some(r => r.movido_px)) {
      const rr2 = await page.evaluate(async () => { const rr = runRules(true); await prepareMotions(S.p); return rr; });
      res.fixes.push(...rr2.fixes);
    }
    for (const r of ct) {
      const mm = String(Math.floor(r.start / 60)).padStart(2, '0') + ':' + String(Math.floor(r.start % 60)).padStart(2, '0');
      const txt = x => `${x.fondo}:1 contra el video, ${x.compuesto}:1 con su sombra o velo`;
      if (r.movido_px) res.fixes.push(`Inserto de ${mm}: ${txt(r)}; lo ${r.movido_px < 0 ? 'subí' : 'bajé'} ${Math.abs(r.movido_px)} px y quedó en ${txt(r.despues)}.`);
      if (r.velo) res.warns.push(`Inserto de ${mm}: el texto no llega a 3:1 contra el video ni a 4,5:1 con su sombra en ningún lugar posible (${txt(r.despues || r)}). Rehacelo con velo (plantillas: --q "velo=1") o cambiá el color del texto.`);
    }
    res.contraste = ct;
  }
  fs.writeFileSync(path.join(OUT, 'rules.json'), JSON.stringify(res, null, 1));
  console.log(res.log.join('\n')); if (res.fixes.length) console.log('REGLAS:\n- ' + res.fixes.join('\n- ')); if (res.warns.length) console.log('OJO:\n- ' + res.warns.join('\n- '));
  const proj = await page.evaluate(() => JSON.parse(JSON.stringify(S.p)));
  fs.writeFileSync(path.join(OUT, 'project.json'), JSON.stringify(proj));
  if (A.doc) { // el manual del editor tal como lo ve el agente: reglas, piezas y parámetros, caras y transcript de ESTE proyecto
    const doc = await page.evaluate(t => agentPrompt(S.p, t, []), String(A.pedido || '(ver pedido)'));
    fs.writeFileSync(A.doc, doc); console.log('manual: ' + A.doc);
  }
  if (A.sheet) {
    const times = String(A.sheet).split(',').map(Number).filter(Number.isFinite);
    const data = await page.evaluate(async ({ times, cols, w }) => { const b = await framesSheet(times, {}, cols, w); const r = new FileReader(); return await new Promise(res => { r.onload = () => res(r.result); r.readAsDataURL(b); }); }, { times, cols: +(A.cols || 4), w: +(A.width || 360) });
    fs.writeFileSync(path.join(OUT, 'sheet.jpg'), Buffer.from(data.split(',')[1], 'base64')); console.log('hoja: ' + path.join(OUT, 'sheet.jpg'));
  }
  if (A.export) {
    const t0 = Date.now();
    const tick = setInterval(async () => { try { const i = await page.evaluate(() => EX.info); if (i) console.log('  ' + i); } catch (e) { } }, 15000);
    const r = await page.evaluate(async () => {
      const o = exDefaults(); o.q = 'alta';
      await exportMP4(); if (!EX.result) return null;
      const buf = new Uint8Array(await EX.result.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { b64: btoa(s), vcodec: EX.result.vcodec, acodec: EX.result.acodec };
    });
    clearInterval(tick);
    if (!r) { console.log('la exportación falló'); }
    else {
      const raw = path.join(OUT, 'export_raw.mp4'); fs.writeFileSync(raw, Buffer.from(r.b64, 'base64'));
      if (r.vcodec === 'avc' && r.acodec === 'aac') fs.renameSync(raw, A.export);
      else execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', A.export]);
      console.log(`video: ${A.export} (${r.vcodec}/${r.acodec}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
