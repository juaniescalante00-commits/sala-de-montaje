const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.resolve(__dirname, '../dist'), OUT = path.resolve(__dirname, 'out'), VID = path.resolve(__dirname, '../.media');
const skel = b => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${b}</body></html>`;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(skel(fs.readFileSync(path.join(DIST, 'sala.html'), 'utf8'))); }
  if (u.startsWith('/_blob/')) { const id = u.slice(7); const f = fs.readdirSync(VID).find(n => n.startsWith(id)); if (f) { const buf = fs.readFileSync(path.join(VID, f)); res.setHeader('content-type', f.endsWith('.mp4') ? 'video/mp4' : 'application/json'); res.setHeader('accept-ranges', 'bytes'); const rg = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range); if (rg) { const a = rg[1] ? +rg[1] : 0, b = rg[2] ? +rg[2] : buf.length - 1; res.statusCode = 206; res.setHeader('content-range', `bytes ${a}-${b}/${buf.length}`); return res.end(buf.subarray(a, b + 1)); } return res.end(buf); } res.statusCode = 404; return res.end(); }
  const f = path.join(DIST, u); if (fs.existsSync(f)) { res.setHeader('content-type', 'text/javascript'); return res.end(fs.readFileSync(f)); }
  res.statusCode = 404; res.end();
});
const PROJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bad_grade_proj.json'), 'utf8'));
const LIB = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lib_all.json'), 'utf8'));
const KIT = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sonidos.json'), 'utf8'));
const MOCK = ([proj, lib, kit]) => {
  const store = new Map([['projects/' + proj.id, proj]]), subs = {};
  const snapOf = c => ({ docs: [...store.entries()].filter(([k]) => k.split('/')[0] === c && k.split('/').length === 2).map(([k, v]) => ({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(v)) })), metadata: { hasPendingWrites: false, fromCache: false } });
  lib.forEach(x => store.set('library/' + x.id, x)); store.set('settings/sonidos', kit);
  const db = {
    collection: c => ({ onSnapshot: cb => { (subs[c] = subs[c] || []).push(cb); setTimeout(() => cb(snapOf(c)), 30); return () => { }; } }),
    doc: p => ({ set: async d => { store.set(p, JSON.parse(JSON.stringify(d))); const c = p.split('/')[0]; setTimeout(() => (subs[c] || []).forEach(cb => cb(snapOf(c))), 10); }, delete: async () => { store.delete(p); } }),
  };
  window.__store = store;
  const sample = async () => ({ text: 'ok' });
  sample.limits = async () => ({ images: { maxCount: 6 } });
  sample.json = async (prompt, opts) => { window.__calls = (window.__calls || []).concat([{ len: prompt.length, imgs: opts?.images?.length || 0, head: prompt.slice(0, 60) }]); return window.__nextJson ? window.__nextJson(prompt, opts) : { ops: [] }; };
  const assets = { upload: async b => ({ id: 'z'.repeat(32) }), delete: async () => ({}) };
  window.claude = { use: async n => ({ db, sample, assets, user: { can: async () => true } })[n] || null };
};
(async () => {
  await new Promise(r => srv.listen(8768, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error' && !/404|TUNNEL/.test(m.text())) console.log('CONSOLE', m.text()); });
  await page.addInitScript(MOCK, [PROJ, LIB, KIT.apto ? KIT : KIT]);
  await page.goto('http://localhost:8768/'); await page.waitForTimeout(1500);
  // abrir el proyecto real
  await page.evaluate(id => { const p = S.projects.find(x => x.id === id); openProject(p); }, PROJ.id);
  await page.waitForFunction(() => S.videoReady, null, { timeout: 30000 });
  console.log('kit', await page.evaluate(() => Object.keys(S.sfxKit || {}).length), 'faces', await page.evaluate(() => S.p.faces.length));
  // 1) reglas sobre la edición mala v1
  const r1 = await page.evaluate(() => runRules(true));
  console.log('FIXES v1\n' + r1.fixes.join('\n') + '\nWARNS\n' + r1.warns.join('\n'));
  console.log('rawMusic', JSON.stringify(await page.evaluate(() => [S.p.audio.rawMusic, detectRawMusic(S.p), !!S.p.music])));
  console.log(JSON.stringify(await page.evaluate(() => sortedMotions().map(m => ({ t: m.type, s: m.start, d: m.dur, lay: m.layout, noCaps: !!m.noCaps })))));
  // 2) palabra detrás de la persona
  await page.evaluate(() => { mutate(p => { p.video.matte = { assetId: '2257ed9570b02ce4923422c04e71082d', w: 540, h: 960, fps: 30 }; p.motions = []; p.captions.style = 'limpio'; p.captions.maxWords = 2; p.captions.upper = false; p.captions.size = 1; p.captions.pos = 'auto'; p.captions.y = 0.42; });
    applyAgentOps([{ op: 'crear', pieza: { type: 'palabra', start: 0.3, dur: 2.2, behind: true, params: { pre: 'esto era el', word: 'Tiro Federal' } } },
                   { op: 'crear', pieza: { type: 'palabra', start: 10.5, dur: 2.2, behind: true, params: { pre: 'hoy es el', word: 'Parque' } } }]); });
  await page.evaluate(() => prepareMotions(S.p)); await page.waitForTimeout(300);
  const r2 = await page.evaluate(() => runRules(true)); console.log('FIXES v2', r2.fixes.join(' | '), 'WARNS', r2.warns.join(' | '));
  console.log('frames cached', await page.evaluate(() => MT.frames.size), 'failed', await page.evaluate(() => MT.failed));
  const blob = await page.evaluate(async () => { const b = await framesSheet([1.2, 2.0, 5, 11.5, 12.4, 22], { guides: false }, 6, 360); const r = new FileReader(); return await new Promise(res => { r.onload = () => res(r.result); r.readAsDataURL(b); }); });
  fs.writeFileSync(OUT + '/v2-sheet.jpg', Buffer.from(blob.split(',')[1], 'base64'));
  await browser.close(); srv.close();
})();
