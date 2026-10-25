// Render de un proyecto de Sala de Montaje fuera del navegador del usuario, con el mismo motor del editor.
// uso: node render.js --page <dir con sala.html|index.html y mediabunny*> --project <proyecto.json>
//        [--video <video>] [--blobs <dir con <assetId>.mp4|.cube|...>] --out <salida.mp4>
//        [--maxmb 29] [--res 1080] [--fps 30] [--no-captions] [--no-music]
// Necesita playwright (preinstalado en el contenedor). El video original da la mejor calidad;
// si no está, usa el asset del proyecto vía --blobs.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true); };
const PAGE = path.resolve(arg('page', '.')), PROJ = arg('project'), VIDEO = arg('video'), BLOBS = arg('blobs'), OUT = path.resolve(arg('out', 'render.mp4'));
const MAXMB = +arg('maxmb', 29), RES = +arg('res', 1080);
if (!PROJ) { console.error('falta --project'); process.exit(2); }
const pageFile = ['sala.html', 'index.html'].map(f => path.join(PAGE, f)).find(f => fs.existsSync(f));
let html = fs.readFileSync(pageFile, 'utf8');
if (!/^\s*<!doctype/i.test(html)) html = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${html}</body></html>`;
const types = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mjs: 'text/javascript', js: 'text/javascript', cube: 'text/plain', ttf: 'font/ttf', otf: 'font/otf', woff2: 'font/woff2' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(html); }
  if (u.startsWith('/_blob/') && BLOBS) { const id = u.slice(7); const f = fs.readdirSync(BLOBS).find(n => n.startsWith(id)); if (f) { res.setHeader('content-type', types[f.split('.').pop()] || 'application/octet-stream'); return res.end(fs.readFileSync(path.join(BLOBS, f))); } }
  if (u === '/__video' && VIDEO) { res.setHeader('content-type', types[VIDEO.split('.').pop().toLowerCase()] || 'video/mp4'); return fs.createReadStream(VIDEO).pipe(res); }
  const f = path.join(PAGE, u); if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('content-type', types[f.split('.').pop()] || 'application/octet-stream'); return res.end(fs.readFileSync(f)); }
  res.statusCode = 404; res.end();
});
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(1200);
  const proj = JSON.parse(fs.readFileSync(PROJ, 'utf8'));
  const LIB = arg('library'); // JSON con los docs de la colección library: [{id, kind, name, assetId, ...}]
  if (LIB) await page.evaluate(l => { S.library = l; }, JSON.parse(fs.readFileSync(LIB, 'utf8')));
  await page.evaluate(async p => { await openProject(p); preloadLibSfx(); }, proj);
  if (VIDEO) {
    await page.evaluate(async (name) => { const b = await (await fetch('/__video')).blob(); const keep = S.p.video; await loadVideoFile(new File([b], name, { type: b.type || 'video/mp4' })); if (keep?.assetId) S.p.video.assetId = keep.assetId; }, path.basename(VIDEO));
    await page.waitForFunction(() => S.videoReady && S.voiceBuf !== undefined, null, { timeout: 60000 }).catch(() => { });
  } else await page.waitForTimeout(1500);
  await page.waitForFunction(() => !S.p.video || S.videoReady || !S.p.video.assetId, null, { timeout: 60000 }).catch(() => { });
  await page.waitForTimeout(1000);
  const dur = await page.evaluate(() => S.p.duration);
  const bitrate = Math.min(14e6, Math.floor((MAXMB * 8 * 1024 * 1024) / dur - 256000));
  await page.evaluate(o => { EX.opts = Object.assign(exDefaults(), o); }, { res: RES, fps: +arg('fps', proj.fps || 30), bitrate, captions: !a.includes('--no-captions'), music: !a.includes('--no-music') });
  console.log(`render ${dur.toFixed(1)} s · ${RES}p · ${(bitrate / 1e6).toFixed(1)} Mbps`);
  const t0 = Date.now(); await page.evaluate(() => exportMP4());
  const r = await page.evaluate(() => EX.result && { size: EX.result.size, v: EX.result.vcodec, a: EX.result.acodec, lufs: EX.result.lufs });
  if (!r) { console.error('falló el render'); process.exit(1); }
  const b64 = await page.evaluate(async () => { const buf = new Uint8Array(await EX.result.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768)); return btoa(s); });
  fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
  console.log(`listo: ${OUT} · ${(r.size / 1048576).toFixed(1)} MB · ${r.v}+${r.a} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
