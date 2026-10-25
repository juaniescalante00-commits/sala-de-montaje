// Test harness: serves dist/ wrapped like the publish skeleton and drives it with Playwright.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.resolve(__dirname, '../dist'), OUT = path.resolve(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const skel = b => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${b}</body></html>`;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/' || u === '/index.html') { res.setHeader('content-type', 'text/html'); return res.end(skel(fs.readFileSync(path.join(DIST, 'sala.html'), 'utf8'))); }
  const f = path.join(DIST, u); if (fs.existsSync(f)) { res.setHeader('content-type', u.endsWith('js') || u.endsWith('mjs') ? 'text/javascript' : 'application/octet-stream'); return res.end(fs.readFileSync(f)); }
  res.statusCode = 404; res.end();
});
const steps = (process.argv[2] || 'all').split(',');
const has = s => steps.includes('all') || steps.includes(s);
(async () => {
  await new Promise(r => srv.listen(8765, r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = []; page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); }); page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:8765/'); await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/01-empty.png' });
  await page.click('#emExample'); await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ({ gl: GR.ok, filter: CAN_FILTER, motions: S.p.motions.length, words: S.p.words.length, storage: S.storage }));
  console.log('info', JSON.stringify(info));
  if (has('frames')) {
    const times = await page.evaluate(() => S.p.motions.map(m => +(m.start + Math.min(m.dur * .75, m.dur - .4)).toFixed(2)));
    for (const [i, t] of times.entries()) {
      const d = await page.evaluate(t => { const c = document.createElement('canvas'); c.width = 540; c.height = 960; composeFrame(c.getContext('2d'), t, {}); return c.toDataURL('image/png'); }, t);
      fs.writeFileSync(`${OUT}/f${i + 1}.png`, Buffer.from(d.split(',')[1], 'base64'));
    }
    // early frames to see entrance
    const d2 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 540; c.height = 960; composeFrame(c.getContext('2d'), 1.3, {}); return c.toDataURL('image/png'); });
    fs.writeFileSync(`${OUT}/f-early.png`, Buffer.from(d2.split(',')[1], 'base64'));
  }
  if (has('ui')) {
    await page.evaluate(() => { seek(2.6); }); await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '/02-editor.png' });
    await page.click('.blk >> nth=1'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/03-inspector.png' });
    for (const t of ['text', 'brand', 'color', 'audio']) { await page.click(`#leftTabs [data-tab=${t}]`); await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/04-tab-${t}.png` }); }
    await page.click('#tgSafe'); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/05-safe.png' }); await page.click('#tgSafe');
    await page.click('.modes [data-mode=review]'); await page.waitForTimeout(1500); await page.screenshot({ path: OUT + '/06-review.png' });
    await page.click('.modes [data-mode=export]'); await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/07-export.png' });
    await page.setViewportSize({ width: 400, height: 860 }); await page.click('.modes [data-mode=editor]'); await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + '/08-mobile.png', fullPage: false });
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    console.log('mobile overflow', JSON.stringify(ov));
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
  }
  if (has('video')) {
    await page.click('.modes [data-mode=editor]');
    await page.setInputFiles('#fileVideo', path.resolve(__dirname, 'fixtures', process.env.VIDEO || 'test916.webm'));
    await page.waitForTimeout(3000);
    const v = await page.evaluate(() => ({ ready: S.videoReady, vw: VID.videoWidth, dur: S.p.duration, voice: !!S.voiceBuf, peaks: S.voicePeaks?.length }));
    console.log('video', JSON.stringify(v));
    await page.evaluate(() => seek(5.1)); await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/09-video.png' });
  }
  if (has('export')) {
    await page.click('.modes [data-mode=export]'); await page.waitForTimeout(300);
    await page.selectOption('#exWrap select[data-bind=res]', '720');
    const t0 = Date.now(); await page.click('#exGo');
    await page.waitForFunction(() => !EX.running, null, { timeout: 600000, polling: 1000 });
    const r = await page.evaluate(() => EX.result && { size: EX.result.size, v: EX.result.vcodec, a: EX.result.acodec, secs: EX.result.secs, lufs: EX.result.lufs });
    console.log('export', JSON.stringify(r), (Date.now() - t0) / 1000 + 's');
    if (r) { const b64 = await page.evaluate(async () => { const b = EX.result.blob; const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768)); return btoa(s); }); fs.writeFileSync(OUT + '/export.mp4', Buffer.from(b64, 'base64')); }
    await page.screenshot({ path: OUT + '/10-exported.png' });
  }
  console.log('ERRORS:\n' + errs.slice(0, 40).join('\n'));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
