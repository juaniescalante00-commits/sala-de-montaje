/* Sala de Montaje · renderizador sin pantalla (para Claude Code en la nube)
   Abre el editor real (sala.html) en Chromium, carga un proyecto, aplica operaciones de edición,
   corre las reglas y saca hojas de cuadros y/o el MP4 final.

   node edit.js --dist <carpeta con sala.html y librerías> --blobs <carpeta con recursos, cada archivo nombrado por su assetId>
                  --project <proyecto.json> [--ops <ops.json>] [--clear] [--settings <settings.json>]
                  [--sheet "1.2,5,11.5"] [--cols 4] [--width 360] [--export <salida.mp4>] [--doc <manual.txt> --pedido "texto"] --out <carpeta>

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
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(skel(fs.readFileSync(path.join(DIST, 'sala.html'), 'utf8'))); }
  if (u.startsWith('/_blob/')) {
    const id = u.slice(7); const f = fs.readdirSync(BLOBS).find(n => n === id || n.startsWith(id + '.'));
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
    const log = ops.length ? applyAgentOps(ops) : [];
    await prepareMotions(S.p);
    const rr = runRules(true);
    await prepareMotions(S.p);
    return { log, fixes: rr.fixes, warns: rr.warns };
  }, { ops: OPS, clear: !!A.clear });
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
