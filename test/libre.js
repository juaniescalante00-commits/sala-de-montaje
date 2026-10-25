const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage();
  const html = fs.readFileSync(path.resolve(__dirname, '../dist/sala.html'), 'utf8');
  await p.setContent(`<!doctype html><html><body>${html}</body></html>`); await p.waitForTimeout(800);
  const d = await p.evaluate(() => {
    const P = exampleProject(); P.captions.on = false;
    const els = [ { kind: 'caja', x: 108, y: 300, w: 864, h: 420, fill: 'panel', at: 0 }, { kind: 'numero', value: 72, suffix: '%', x: 170, y: 520, size: 200, color: '#3ddc84', anim: 'contar', at: 0.3 }, { kind: 'texto', text: 'consigue beca en su primer año', x: 170, y: 620, size: 44, font: 'body', weight: 600, maxWidth: 520, anim: 'subir', at: 0.9 }, { kind: 'circulo', cx: 800, cy: 470, r: 90, stroke: '#3ddc84', width: 18, progress: .72, anim: 'dibujar', at: 0.3 }, { kind: 'linea', x: 170, y: 560, x2: 600, y2: 560, color: 'accent', width: 5, anim: 'dibujar', at: .6 } ];
    const m1 = sanitizeMotion({ type: 'libre', start: 0, dur: 5, params: { elements: els } }), m2 = sanitizeMotion({ type: 'libre', start: 0, dur: 5 });
    const out = []; for (const [m, t] of [[m1, 0.8], [m1, 3], [m2, 3]]) { const c = document.createElement('canvas'); c.width = 360; c.height = 640; composeFrame(c.getContext('2d'), t, { P, motions: [m], captions: false }); out.push(c.toDataURL()); }
    return out;
  });
  d.forEach((x, i) => fs.writeFileSync(`out/libre${i}.png`, Buffer.from(x.split(',')[1], 'base64')));
  await b.close();
})();
