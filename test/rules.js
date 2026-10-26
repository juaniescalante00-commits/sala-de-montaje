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
const PROJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'larreta_proj.json'), 'utf8'));
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
  // edición "mala" parecida a la que salió
  const bad = await page.evaluate(() => {
    S.p.motions = []; S.p.captions.on = true;
    return applyAgentOps([
      { op: 'crear', pieza: { type: 'cita', start: 25.3, dur: 5.4, layout: 'overlay', pos: 'centro', params: { text: 'La innovación y el desarrollo son el futuro para la Argentina.', author: '' } } },
      { op: 'crear', pieza: { type: 'bento', start: 14.4, dur: 10, layout: 'full', sfx: 'lib:sf3b015c11dfc1bd', params: { cards: [{ eyebrow: 'Espacio', title: 'Mayores espacios verdes' }, { eyebrow: 'Ciencia', title: 'Investigadores' }] } } },
      { op: 'crear', pieza: { type: 'titulo', start: 0.6, dur: 3, layout: 'overlay', pos: 'centro', sfx: 'lib:se5f7ca3bc18bac5', params: { title: 'Esto era el Tiro Federal', size: 'L' } } },
      { op: 'crear', pieza: { type: 'libre', start: 4.8, dur: 4, layout: 'overlay', params: { elements: [{ kind: 'caja', x: 108, y: 420, w: 864, h: 330, fill: 'panel', at: 0 }, { kind: 'texto', text: 'Abierto y gratuito', x: 160, y: 560, size: 80, at: 0.2 }] } } },
      { op: 'crear', pieza: { type: 'codigo', start: 31.5, dur: 3.5, layout: 'overlay', params: { texto: 'Universidades y empresas', code: "ctx.globalAlpha*=1-p.out; ctx.font=p.font(96); ctx.fillStyle=p.brand.fg; const a=p.at(0,.7); ctx.fillText('Universidades', p.safe.x, 900+(1-a)*60); ctx.fillStyle=p.brand.accent; ctx.fillText('y empresas', p.safe.x, 1010+(1-p.at(.3,.7))*60);" } } },
      { op: 'crear', pieza: { type: '3d', start: 36.0, dur: 1.9, layout: 'full', params: { texto: 'Acá está el futuro' } } },
    ]);
  });
  console.log('ops', JSON.stringify(bad));
  await page.evaluate(() => prepareMotions(S.p)); await page.waitForTimeout(500);
  const rr = await page.evaluate(() => runRules(true));
  console.log('FIXES\n' + rr.fixes.join('\n') + '\nWARNS\n' + rr.warns.join('\n'));
  console.log(JSON.stringify(await page.evaluate(() => sortedMotions().map(m => ({ t: m.type, s: m.start, d: m.dur, lay: m.layout, fit: m.fit, noCaps: !!m.noCaps, sfx: m.sfx })))));
  // verificar: ninguna pieza toca la cara
  const check = await page.evaluate(() => sortedMotions().filter(m => m.layout !== 'full').map(m => { const b = motionExtent(m, S.p); const f = protectedBox(S.p, m.start, m.start + m.dur); return { t: m.type, hit: boxHitsFace(b, f), b: b && [b.x, b.y, b.x1, b.y1].map(Math.round), f: f && [f.x, f.y, f.x1, f.y1].map(Math.round) }; }));
  console.log('CHECK', JSON.stringify(check));
  // capturas de cada pieza
  const ms = await page.evaluate(() => sortedMotions().map(m => +(revealTime(m)).toFixed(2)));
  await page.evaluate(() => { S.faces = true; });
  const blob = await page.evaluate(async ts => { const b = await framesSheet(ts, { guides: true }, 3, 300); const r = new FileReader(); return await new Promise(res => { r.onload = () => res(r.result); r.readAsDataURL(b); }); }, ms);
  fs.writeFileSync(OUT + '/r1-sheet.jpg', Buffer.from(blob.split(',')[1], 'base64'));
  // seguir la cara
  await page.evaluate(() => mutate(p => { p.frame.follow = true; p.frame.followZoom = 1.25; }));
  const blob2 = await page.evaluate(async () => { const b = await framesSheet([1, 6, 12, 22], { motions: [], captions: true, guides: true }, 4, 300); const r = new FileReader(); return await new Promise(res => { r.onload = () => res(r.result); r.readAsDataURL(b); }); });
  fs.writeFileSync(OUT + '/r2-follow.jpg', Buffer.from(blob2.split(',')[1], 'base64'));
  await page.evaluate(() => { S.tab = 'estilo'; renderLeft(); });
  await page.screenshot({ path: OUT + '/r3-estilo.png' });
  // transiciones de corte: un flash a pantalla completa marcado "transicion" sobrevive a las reglas de piezas y va encima
  // de la persona (nunca detrás); si dura de más, queda en 1,2 s
  const tr = await page.evaluate(() => {
    const flash = "const a=Math.max(0,1-Math.abs(p.t-0.2)/0.25); ctx.fillStyle='rgba(255,252,246,'+(0.55*a).toFixed(3)+')'; ctx.fillRect(0,0,p.W,p.H);";
    S.p.motions = [];
    applyAgentOps([
      { op: 'crear', pieza: { type: 'codigo', start: 6, dur: 0.8, layout: 'overlay', tr: 'corte', sfx: 'ninguno', transicion: true, behind: true, params: { texto: '', code: flash } } },
      { op: 'crear', pieza: { type: 'codigo', start: 26, dur: 3, layout: 'overlay', tr: 'corte', sfx: 'ninguno', transicion: true, params: { texto: '', code: flash } } },
    ]);
    const rr = runRules(true);
    return { ms: sortedMotions().map(m => ({ s: m.start, d: m.dur, tr: !!m.transicion, behind: !!m.behind })), fixes: rr.fixes };
  });
  console.log('TRANSICIONES', JSON.stringify(tr));
  const t6 = tr.ms.find(m => m.s === 6), t26 = tr.ms.find(m => m.s === 26);
  if (!t6 || !t6.tr || t6.behind) throw new Error('la transición marcada no sobrevivió o quedó detrás de la persona');
  if (!t26 || t26.d > 1.25) throw new Error('una transición larga tendría que quedar en 1,2 s');
  await browser.close(); srv.close();
})();
