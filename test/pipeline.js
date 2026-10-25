const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.resolve(__dirname, '../dist'), OUT = path.resolve(__dirname, 'out'), VID = path.resolve(__dirname, '../.media');
const skel = b => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${b}</body></html>`;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(skel(fs.readFileSync(path.join(DIST, 'sala.html'), 'utf8'))); }
  if (u.startsWith('/_blob/y')) { res.setHeader('content-type', 'image/jpeg'); return res.end(fs.readFileSync(path.join(__dirname, 'fixtures', 'ref_sheet.jpg'))); }
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
  const assets = { upload: async (b, o) => ({ id: (/image/.test(o?.type || b.type) ? 'y' : 'z').repeat(32) }), delete: async () => ({}) };
  window.claude = { use: async n => ({ db, sample, assets, user: { can: async () => true } })[n] || null };
};

(async () => {
  await new Promise(r => srv.listen(8769, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/404|TUNNEL/.test(m.text())) console.log('CONSOLE', m.text()); });
  await page.addInitScript(MOCK, [PROJ, LIB, KIT]);
  await page.addInitScript(() => {
    window.__nextJson = (prompt, opts) => {
      if (prompt.includes('video de REFERENCIA')) return { nombre: 'Real estate USA', resumen: 'Títulos grandes en mayúscula, sans condensada, acento dorado, cortes cada 2 s.', receta: 'Títulos en Anton mayúscula que entran con máscara; subtítulos de 2 palabras; cámara que sigue la cara con zoom 1.15.', marca: { display: 'Anton', body: 'Inter', dw: 400, upper: true, bg: '#0d0f12', fg: '#ffffff', accent: '#d8b46a', panel: 'solid', radius: 6 }, subtitulos: { on: true, style: 'impacto', pos: 'auto', maxWords: 2, size: 1.1, upper: true }, color: { preset: 'calido', mix: .8, contrast: .1 }, movimiento: 'seco', camara: { seguirCara: true, zoomBase: 1.15, punchIns: 'pocos' }, graficos: { densidad: 'media', segundosEntrePiezas: 5, pantallasCompletas: true, tipos: ['titulo', 'codigo'], estilo: 'kinetic' }, sonido: { sfx: 'minimo', musica: 'corporativa' }, reglas: ['Siempre mayúsculas en títulos'] };
      if (prompt.includes('supervisor de edición')) return { ok: false, nota: 'En la revisión achiqué el título del inicio.', ops: [{ op: 'editar', id: (prompt.match(/"id":"(m[a-z0-9]+)","type":"titulo"/) || [])[1] || 'x', cambios: { params: { size: 'M' } } }] };
      if (prompt.includes('PEDIDO NUEVO')) return { plan: 'Gancho con título, número y cierre con plantilla.', respuesta: 'Armé la edición con el estilo Real estate USA.', ops: [
        { op: 'crear', pieza: { type: 'titulo', start: 0.5, dur: 3, layout: 'overlay', pos: 'auto', tr: 'mascara', sfx: 'lib:s7da04af295c98e1', params: { title: 'Del club cerrado al parque abierto', size: 'L' } } },
        { op: 'crear', pieza: { type: 'codigo', start: 15, dur: 4, layout: 'overlay', params: { texto: 'Investigadores Startups', code: "ctx.globalAlpha*=1-p.out; ['INVESTIGADORES','STARTUPS','EMPRENDEDORES'].forEach((w,i)=>{const a=p.at(i*.4,.6,'back'); ctx.font=p.font(92); ctx.fillStyle=i==1?p.brand.accent:p.brand.fg; ctx.save(); ctx.translate(p.safe.x, 1000+i*100); ctx.scale(1, a); ctx.fillText(w,0,0); ctx.restore();});" } } },
        { op: 'crear', pieza: { type: 'plantilla', start: 34, dur: 3.5, layout: 'overlay', params: { tpl: window.__tplId, textos: { TITULO: 'Acá está el futuro' }, encaje: 'completa' } } },
        { op: 'camara', seguirCara: true, zoomBase: 1.15, zooms: [{ s: 36, e: 37.9, z: 1.1 }] },
      ] };
      return {};
    };
  });
  await page.goto('http://localhost:8769/'); await page.waitForTimeout(1500);
  await page.evaluate(id => openProject(S.projects.find(x => x.id === id)), PROJ.id);
  await page.waitForFunction(() => S.videoReady, null, { timeout: 30000 });
  // 1) estilo desde referencia (usamos el mismo video como referencia)
  const t0 = Date.now();
  const st = await page.evaluate(async () => { const b = await (await fetch('/_blob/' + S.p.video.assetId)).blob(); const f = new File([b], 'referencia.mp4', { type: 'video/mp4' }); const s = await createStyleFromRef([f], 'Real estate USA', 'copiar títulos', null); mutate(p => applyStyle(s, p)); return { id: s.id, refs: s.refs.length, src: s.src, brand: S.p.brand.display, caps: S.p.captions.style, follow: S.p.frame.follow }; });
  console.log('STYLE', (Date.now() - t0) + 'ms', JSON.stringify(st));
  console.log('calls', JSON.stringify(await page.evaluate(() => window.__calls)));
  // 2) plantilla de After Effects
  await page.evaluate(async () => { const t = await (await fetch('/_blob/' + 'z'.repeat(32))).text(); await uploadTemplate(new File([t], 'barra.json', { type: 'application/json' })); window.__tplId = S.templates[0]?.id; });
  console.log('TPL', JSON.stringify(await page.evaluate(() => S.templates.map(t => ({ id: t.id, n: t.name, textos: t.textos })))));
  // 3) pedido completo
  await page.evaluate(() => { S.p.motions = []; window.__calls = []; });
  await page.evaluate(() => runAgent('Editalo como los yankees de real estate, con el estilo de la referencia'));
  const r = await page.evaluate(() => ({ calls: window.__calls, chat: S.p.chat.slice(-1)[0], motions: sortedMotions().map(m => ({ t: m.type, s: m.start, d: m.dur, fit: m.fit, size: m.params.size, sfx: m.sfx })), frame: S.p.frame }));
  console.log('AGENT', JSON.stringify(r, null, 1).slice(0, 3000));
  const blob = await page.evaluate(async () => { const ts = [2.2, 17.5, 35.6]; const b = await framesSheet(ts, {}, 3, 360); const rd = new FileReader(); return await new Promise(res => { rd.onload = () => res(rd.result); rd.readAsDataURL(b); }); });
  fs.writeFileSync(OUT + '/p1-styled.jpg', Buffer.from(blob.split(',')[1], 'base64'));
  await page.evaluate(() => { S.tab = 'estilo'; renderLeft(); });
  await page.screenshot({ path: OUT + '/p2-estilo.png' });
  await page.evaluate(() => openStyleDialog()); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/p3-dialog.png' });
  await browser.close(); srv.close();
})();
