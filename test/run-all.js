// Corre las pruebas del editor en Chromium sin pantalla. Necesitan dist/ (npm run build) y el video de prueba en .media/ (ver CLAUDE.md).
const { execFileSync } = require('child_process'), path = require('path'), fs = require('fs');
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
let bad = 0;
for (const t of ['home', 'rules', 'pipeline', 'lot2', 'deep']) {
  try { const o = execFileSync('node', [path.join(__dirname, t + '.js')], { encoding: 'utf8', timeout: 240000 }); const errs = o.split('\n').filter(l => /PAGEERROR|ERROR de página/.test(l)); console.log((errs.length ? '✗ ' : '✓ ') + t + (errs.length ? '\n  ' + errs.join('\n  ') : '')); if (errs.length) bad++; }
  catch (e) { console.log('✗ ' + t + '\n  ' + String(e.message).split('\n')[0]); bad++; }
}
process.exit(bad ? 1 : 0);
