// Exercises the capability code paths (db, sample, assets, downloads) with in-page mocks.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.resolve(__dirname, '../dist'), OUT = path.resolve(__dirname, 'out');
const skel = b => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${b}</body></html>`;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(skel(fs.readFileSync(path.join(DIST, 'sala.html'), 'utf8'))); }
  const f = path.join(DIST, u); if (fs.existsSync(f)) { res.setHeader('content-type', 'text/javascript'); return res.end(fs.readFileSync(f)); }
  res.statusCode = 404; res.end();
});
const MOCK = () => {
  const store = new Map(); const subs = []; window.__push = () => setTimeout(() => subs.forEach(cb => cb(snap())), 10);
  const snap = () => ({ docs: [...store.entries()].filter(([k]) => k.startsWith('projects/')).map(([k, v]) => ({ id: k.split('/')[1], exists: true, data: () => JSON.parse(JSON.stringify(v)) })), metadata: { hasPendingWrites: false, fromCache: false } });
  const db = {
    collection: p => ({ onSnapshot: (cb) => { if (p === 'library') { setTimeout(() => cb({ docs: [...Array.from({length: 580}, (_, i) => ({ id: 's' + i, data: () => ({ kind: 'sonido', name: ['Whoosh suave', 'Impacto grave', 'Riser corto', 'Drone oscuro'][i % 4] + ' ' + i, folder: ['Whooshes', 'Impactos', 'Risers', 'Ambientes'][i % 4], assetId: 'd'.repeat(32), dur: 1.5 }) })), { id: 'mus1', data: () => ({ kind: 'musica', name: 'Calma piano', folder: 'Tranquila', assetId: 'b'.repeat(32), dur: 95 }) }, { id: 'sfx1', data: () => ({ kind: 'sonido', name: 'Whoosh grave', folder: 'Whoosh', assetId: 'c'.repeat(32), dur: 1.2 }) }], metadata: {} }), 50); return () => { }; } subs.push(cb); setTimeout(() => cb(snap()), 50); return () => { }; } }),
    doc: p => ({ set: async d => { store.set(p, d); window.__writes = (window.__writes || 0) + 1; setTimeout(() => subs.forEach(cb => cb(snap())), 20); }, delete: async () => { store.delete(p); subs.forEach(cb => cb(snap())); } }),
  };
  window.__store = store;
  const sample = async () => ({ text: 'ok' });
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 8, maxInputBytes: 5e6, mediaTypes: ['image/jpeg'] } });
  sample.json = async (prompt, opts) => {
    window.__prompts = (window.__prompts || []).concat([prompt.slice(0, 120)]);
    if (opts?.images) window.__images = opts.images.length;
    opts?.onText?.({ text: '{...', delta: '{...' });
    await new Promise(r => setTimeout(r, 200));
    if (prompt.includes('Tarea: diseñar')) return { motions: [
      { type: 'contador', start: 0.5, dur: 4, layout: 'overlay', params: { eyebrow: 'Cada año', value: 90, label: 'jugadores', caption: 'de la universidad a la liga' }, beats: [0.5, 1.2, 1.6, null], quote: 'x', desc: 'Contador.' },
      { type: 'lista', start: 3.0, dur: 5, layout: 'overlay', params: { title: 'Tu equipo', items: ['Preparador físico', 'Analista'] }, desc: 'Lista' },
      { type: 'inexistente', start: 9, dur: 3 },
      { type: 'cta', start: 29, dur: 5, layout: 'full', params: { title: 'Escribinos', button: 'Hablemos' } } ] };
    if (prompt.includes('Aplicá los comentarios')) { const id = (prompt.match(/"id":"(m[a-z0-9]+)"/) || [])[1]; return { piezas: [{ id, stagger: 0.7, beats: [10.5, 12.2], cambios: 'Separé las tarjetas y la segunda entra en "staff".' }] }; }
    if (prompt.includes('control de calidad')) { const id = (prompt.match(/id (m[a-z0-9]+)/) || [])[1]; return { piezas: [{ id, ok: false, notas: 'La bajada queda chica para mobile.' }] }; }
    if (prompt.includes('caras humanas')) return { cuadros: [{ i: 1, caras: [[0.3, 0.25, 0.4, 0.22]] }, { i: 2, caras: [] }] };
    if (prompt.includes('PEDIDO NUEVO')) { window.__agentPrompt = prompt.length; return { respuesta: 'Sumé una pieza libre con el 72% en verde, subtítulos en mayúscula y música tranquila.', ops: [
      { op: 'crear', pieza: { type: 'libre', start: 19.2, dur: 4, layout: 'overlay', params: { elements: [ { kind: 'caja', x: 108, y: 300, w: 864, h: 420, fill: 'panel', at: 0 }, { kind: 'numero', value: 72, suffix: '%', x: 170, y: 520, size: 200, color: '#3ddc84', anim: 'contar', at: 0.3 }, { kind: 'texto', text: 'consigue beca en su primer año', x: 170, y: 620, size: 44, font: 'body', weight: 600, maxWidth: 760, anim: 'subir', at: 0.9 }, { kind: 'circulo', cx: 820, cy: 450, r: 80, stroke: '#3ddc84', width: 16, progress: .72, anim: 'dibujar', at: 0.3 } ] }, sfx: 'lib:sfx1', desc: 'Número verde que cuenta' } },
      { op: 'borrar', id: (prompt.match(/"type":"progreso"[^}]*?|"id":"(m[a-z0-9]+)","type":"progreso"/) || [])[1] || 'x' },
      { op: 'proyecto', subtitulos: { upper: true, size: 1.2 }, color: { preset: 'calido', grain: .2 } },
      { op: 'musica', id: 'mus1', volumen: 0.15 } ] }; }
    if (prompt.includes('transcripción automática')) return { cambios: [{ i: 0, w: 'Cada' }, { i: 3, w: 'jugadores' }] };
    return {};
  };
  const assets = { upload: async (b) => ({ id: 'a'.repeat(32), url: URL.createObjectURL(b), sizeBytes: b.size, contentType: b.type }), list: async () => ({ assets: [], usage: {} }), delete: async () => ({ deleted: true }) };
  const dl = { save: async ({ filename, data }) => { window.__saved = (window.__saved || []).concat([filename]); return { status: 'saved' }; } };
  const user = { can: async () => true, isOwner: () => true };
  const mcp = { callTool: async (srv, tool, args) => { window.__fired = (window.__fired || []).concat([args]); return { ok: true }; } };
  window.claude = { use: async n => ({ db, sample, assets, downloads: dl, user, mcp })[n] || null };
};

(async () => {
  await new Promise(r => srv.listen(8767, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) console.log('CONSOLE', m.text()); }); page.on('pageerror', e => console.log('PAGEERROR: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  await page.addInitScript(MOCK);
  await page.goto('http://localhost:8767/'); await page.waitForTimeout(1500);
  console.log('home visible', await page.evaluate(() => !$('#home').hidden), 'send disabled', await page.evaluate(() => $('#hmSend').disabled));
  await page.screenshot({ path: OUT + '/h1-home.png' });
  await page.setInputFiles('#fileVideo', path.join(__dirname, 'fixtures', 'test916.webm'));
  await page.waitForFunction(() => S.p?.video?.assetId && window.__fired?.length, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  console.log('uploaded', JSON.stringify(await page.evaluate(() => ({ name: S.p.name, stage: S.p.stage, fired: window.__fired, tr: S.p.transcribe?.state, home: S.home }))));
  await page.screenshot({ path: OUT + '/h2-video.png' });
  await page.fill('#hmIn', 'Subtítulos en mayúscula, un número grande cuando dice el 72% y música tranquila');
  await page.click('#hmSend'); await page.waitForTimeout(400);
  console.log('queued', JSON.stringify(await page.evaluate(() => ({ pending: S.p.pendingAsk?.text?.slice(0, 20), busy: !!S.busy.agent }))));
  await page.screenshot({ path: OUT + '/h3-queued.png' });
  await page.waitForTimeout(1500);
  // la tarea de transcripción escribe las palabras en la base
  await page.evaluate(() => { const k = 'projects/' + S.p.id; const d = JSON.parse(JSON.stringify(window.__store.get(k))); d.words = 'Cada año noventa jugadores consiguen beca el setenta y dos por ciento'.split(' ').map((w, i) => ({ w, s: 0.4 + i * 0.5, e: 0.8 + i * 0.5 })); d.transcribe = { state: 'listo', at: Date.now() }; window.__store.set(k, d); window.__push(); });
  await page.waitForFunction(() => !S.home && S.p.stage === 'editor', null, { timeout: 15000 }).catch(() => console.log('NO TRANSITION'));
  await page.waitForTimeout(800);
  console.log('edited', JSON.stringify(await page.evaluate(() => ({ home: S.home, stage: S.p.stage, motions: S.p.motions.length, words: S.p.words.length, chat: S.p.chat.length, music: S.p.music?.name, pending: !!S.p.pendingAsk, tab: S.tab }))));
  await page.screenshot({ path: OUT + '/h4-editor.png' });
  await page.click('#btnHome'); await page.waitForTimeout(500);
  console.log('back home', JSON.stringify(await page.evaluate(() => ({ home: S.home, back: !$('#hmBack').hidden, recent: $$('#hmRecent [data-hmopen]').length }))));
  await page.screenshot({ path: OUT + '/h5-home-again.png' });
  await page.click('#hmBack'); await page.waitForTimeout(400);
  await page.click('#leftTabs [data-tab=audio]'); await page.waitForTimeout(300);
  console.log('lib rows', await page.evaluate(() => $$('#leftBody .librow').length));
  await page.fill('#libQ', 'riser'); await page.waitForTimeout(600);
  console.log('lib riser rows', await page.evaluate(() => $$('#leftBody .librow').length), 'focus', await page.evaluate(() => document.activeElement?.id));
  await page.click('[data-libf="Impactos"]'); await page.waitForTimeout(300);
  console.log('lib riser+impactos rows', await page.evaluate(() => $$('#leftBody .librow').length));
  await page.screenshot({ path: OUT + '/h6-lib.png' });
  console.log('agent prompt len', await page.evaluate(() => window.__agentPrompt));
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.addInitScript(MOCK); await m.goto('http://localhost:8767/'); await m.waitForTimeout(1200);
  await m.screenshot({ path: OUT + '/h7-mobile.png' });
  console.log('mobile overflow', await m.evaluate(() => document.querySelector('#home').scrollWidth > window.innerWidth));
  await browser.close(); srv.close();
})();
