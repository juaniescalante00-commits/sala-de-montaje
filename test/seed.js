const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const html = fs.readFileSync(path.resolve(__dirname, '../dist/sala.html'), 'utf8');
  await p.setContent(`<!doctype html><html><body>${html}</body></html>`); await p.waitForTimeout(800);
  const j = await p.evaluate(() => { const x = exampleProject(); return JSON.stringify(migrate(x)); });
  fs.writeFileSync(path.resolve(__dirname, 'seed.json'), j); console.log(j.length, JSON.parse(j).id);
  await b.close();
})();
