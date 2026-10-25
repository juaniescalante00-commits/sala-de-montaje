const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('console', m => console.log('C', m.text())); p.on('pageerror', e => console.log('E', e.message));
  await p.setContent('<canvas id=c width=1080 height=1920></canvas>');
  await p.addScriptTag({ content: fs.readFileSync(path.resolve(__dirname, '../dist/lottie_canvas.min.js'), 'utf8') });
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/tplbarra.json'), 'utf8'));
  const r = await p.evaluate(d => {
    const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h; const cx = cv.getContext('2d');
    const out = {};
    const count = c => { const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++; return n; };
    const a1 = lottie.loadAnimation({ renderer: 'canvas', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(d)), rendererSettings: { context: cx, clearCanvas: true } });
    a1.goToAndStop(40, true); out.ctx = count(cv); a1.resize && a1.resize(); a1.goToAndStop(41, true); out.ctxResize = count(cv);
    const div = document.createElement('div'); div.style.cssText = 'width:540px;height:960px'; document.body.appendChild(div);
    const a2 = lottie.loadAnimation({ container: div, renderer: 'canvas', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(d)) });
    a2.goToAndStop(40, true); const c2 = div.querySelector('canvas'); out.div = c2 ? [c2.width, c2.height, count(c2)] : null;
    const d3 = JSON.parse(JSON.stringify(d)); d3.layers = d3.layers.filter(l => l.ty !== 5); delete d3.fonts;
    const cv3 = document.createElement('canvas'); cv3.width = d.w; cv3.height = d.h;
    const a3 = lottie.loadAnimation({ renderer: 'canvas', loop: false, autoplay: false, animationData: d3, rendererSettings: { context: cv3.getContext('2d'), clearCanvas: true } });
    a3.goToAndStop(40, true); out.noText = count(cv3);
    return out;
  }, data);
  console.log(JSON.stringify(r)); await b.close();
})();
