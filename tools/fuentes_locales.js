/* Fuentes del editor sin Google Fonts (en la nube fonts.googleapis.com está bloqueado).
   Las 17 familias de la Sala vienen por npm (@fontsource/*, licencia OFL, devDependencies del repo).
   - css(prefijo): un CSS con todos los @font-face (cada peso y la itálica), con las url() apuntando a `${prefijo}/<paquete>/files/...`.
   - archivo(ruta): para una ruta `/<paquete>/files/<archivo>` devuelve la ruta en disco (o null).
   - interceptar(page, base): en Playwright, responde los pedidos a Google Fonts con este CSS (base = http://localhost:<puerto>/_fonts).
   Si node_modules/@fontsource no está (no se corrió npm ci), no hace nada y el editor usa fuentes de reemplazo. */
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'node_modules', '@fontsource');
const hay = () => fs.existsSync(DIR);
let cache = null;
function css(prefijo) {
  if (!hay()) return '';
  if (cache === null) {
    cache = '';
    for (const pkg of fs.readdirSync(DIR).sort()) {
      const d = path.join(DIR, pkg); if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d).filter(n => /^\d{3}(-italic)?\.css$/.test(n)).sort())
        cache += fs.readFileSync(path.join(d, f), 'utf8').replace(/url\(\.\/files\//g, `url(@@P@@/${pkg}/files/`) + '\n';
    }
  }
  return cache.split('@@P@@').join(prefijo);
}
function archivo(ruta) {
  const m = /^\/([a-z0-9-]+)\/files\/([A-Za-z0-9._-]+)$/.exec(ruta); if (!m) return null;
  const f = path.join(DIR, m[1], 'files', m[2]); return f.startsWith(DIR) && fs.existsSync(f) ? f : null;
}
async function interceptar(page, base) {
  if (!hay()) { console.log('fuentes: sin @fontsource (corré npm ci); se usan fuentes de reemplazo'); return false; }
  await page.route(/^https:\/\/fonts\.googleapis\.com\//, r => r.fulfill({ status: 200, contentType: 'text/css', body: css(base) }));
  await page.route(/^https:\/\/fonts\.gstatic\.com\//, r => r.abort());
  return true;
}
module.exports = { css, archivo, interceptar, hay };
