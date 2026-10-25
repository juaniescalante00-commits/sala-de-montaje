const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('E', e.message));
  await p.setContent('<div></div>');
  await p.addScriptTag({ content: fs.readFileSync(path.resolve(__dirname, '../dist/lottie_canvas.min.js'), 'utf8') });
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/tplbarra.json'), 'utf8'));
  const r = await p.evaluate(d => {
    d.layers[0].ty = 3; delete d.layers[0].t;
    const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h; const cx = cv.getContext('2d');
    const a = lottie.loadAnimation({ renderer: 'canvas', loop: false, autoplay: false, animationData: d, rendererSettings: { context: cx, clearCanvas: true } });
    try { a.resize(); } catch (e) { }
    a.goToAndStop(40, true);
    const els = a.renderer.elements; const e0 = els[0];
    const px = cx.getImageData(400, 580, 1, 1).data;
    return { n: els.length, e0: e0 && e0.constructor.name, mv: e0?.finalTransform?.mProp?.v?.props ? Array.from(e0.finalTransform.mProp.v.props) : null, ft: e0?.finalTransform ? { props: Array.from(e0.finalTransform.mat.props).slice(0, 16), o: e0.finalTransform.mProp?.o?.v } : null, keys: e0 ? Object.keys(e0).slice(0, 30) : null, px: Array.from(px) };
  }, data);
  console.log(JSON.stringify(r)); await b.close();
})();
