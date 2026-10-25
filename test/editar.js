// Prueba: "editar" por id cambia ESA pieza y no la primera (bug del 25/10: x.n === o.n con los dos undefined).
// Corre edit.js dos veces con el mismo proyecto de dos piezas: con la página de este repo (dist/, arreglada) y,
// si existe, con una página vieja en EDITAR_DIST (la publicada sin el arreglo: ahí la cubre el ajuste de edit.js).
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out', 'editar'); fs.mkdirSync(OUT, { recursive: true });
const base = { id: 'pedit', name: 'prueba editar', duration: 10, fps: 30, words: [], faces: [], chat: [], stage: 'editor',
  motions: [
    { id: 'mA', type: 'libre', start: 0.5, dur: 2, params: { elements: [{ kind: 'texto', text: 'uno', x: 108, y: 400, size: 60 }] } },
    { id: 'mB', type: 'libre', start: 5, dur: 2, params: { elements: [{ kind: 'texto', text: 'dos', x: 108, y: 400, size: 60 }] } },
  ] };
fs.writeFileSync(path.join(OUT, 'p.json'), JSON.stringify(base));
fs.writeFileSync(path.join(OUT, 'ops.json'), JSON.stringify([{ op: 'editar', id: 'mB', cambios: { params: { elements: [{ kind: 'texto', text: 'DOS', x: 108, y: 400, size: 60 }] } } }]));
let mal = 0;
for (const dist of [path.join(__dirname, '..', 'dist'), process.env.EDITAR_DIST].filter(Boolean)) {
  const out = path.join(OUT, path.basename(dist));
  execFileSync('node', [path.join(__dirname, '..', 'tools', 'edit.js'), '--dist', dist, '--blobs', OUT, '--project', path.join(OUT, 'p.json'),
    '--ops', path.join(OUT, 'ops.json'), '--out', out], { encoding: 'utf8', timeout: 120000 });
  const p = JSON.parse(fs.readFileSync(path.join(out, 'project.json'), 'utf8'));
  const t = id => p.motions.find(m => m.id === id).params.elements[0].text;
  const ok = t('mA') === 'uno' && t('mB') === 'DOS';
  console.log((ok ? 'ok ' : 'MAL ') + dist + `: mA=${t('mA')} mB=${t('mB')}`); if (!ok) mal++;
}
process.exit(mal ? 1 : 0);
