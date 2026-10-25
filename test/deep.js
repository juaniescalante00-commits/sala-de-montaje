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
const PROJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'larreta_proj.json'), 'utf8')); PROJ.motions = []; PROJ.chat = []; PROJ.stage = 'home';
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
  const mcp = { callTool: async (srv, tool, args) => { window.__fired = (window.__fired || []).concat([{ srv, tool, args }]); return { ok: true }; } };
  window.claude = { use: async n => ({ db, sample, assets, mcp, user: { can: async () => true } })[n] || null };
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
  console.log('deepAvailable', await page.evaluate(() => deepAvailable()));
  await page.evaluate(() => { showHome(true); });
  await page.evaluate(() => homeRun('Editalo como la referencia'));
  await page.waitForTimeout(800);
  console.log('fired', JSON.stringify(await page.evaluate(() => window.__fired)));
  console.log('deep', JSON.stringify(await page.evaluate(() => S.p.deep)), 'home', await page.evaluate(() => S.home), 'stage', await page.evaluate(() => S.p.stage));
  await page.evaluate(() => { S.tab = 'claude'; renderLeft(); });
  await page.screenshot({ path: OUT + '/d1-run.png' });
  // simular que la nube terminó
  await page.evaluate(() => { const r = JSON.parse(JSON.stringify(S.p)); r.deep.estado = 'listo'; r.deep.resumen = 'Tres palabras gigantes detrás de la cabeza y subtítulos limpios.'; r.chat.push({ role: 'claude', text: 'Hecho.', at: Date.now(), deep: true }); adoptRemote(r); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/d2-done.png' });
  console.log('toast', await page.evaluate(() => document.querySelector('.toast')?.textContent || ''));
  await browser.close(); srv.close();
})();
