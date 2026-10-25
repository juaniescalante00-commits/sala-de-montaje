// Prueba de la pieza "inserto": renderiza un título GSAP con fondo transparente (tools/html_inserto.js), lo monta sobre
// el crudo de prueba con tools/edit.js y verifica que se dibuje con alfa (cuadro con texto sin tapar el video entero).
const { execFileSync } = require('child_process'), path = require('path'), fs = require('fs');
const R = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out', 'inserto'); fs.mkdirSync(OUT, { recursive: true });
const MEDIA = path.join(R, '.media'), CLIP = path.join(MEDIA, 'prueba_inserto.mp4');
execFileSync('node', [path.join(R, 'tools/html_inserto.js'), path.join(R, 'tools/insertos/gsap-titulo.html'), CLIP, '--dur', '2', '--q', 'texto=Prueba%20de%20inserto&dur=2&y=.62'], { stdio: 'pipe' });
const ops = [{ op: 'crear', pieza: { type: 'inserto', start: 1, dur: 2, tr: 'corte', params: { clip: 'prueba_inserto', w: 1080, h: 1920, x: .5, y: .5, escala: 1, fps: 30, texto: 'Prueba de inserto', motor: 'gsap' } } }];
fs.writeFileSync(path.join(OUT, 'ops.json'), JSON.stringify(ops));
const o = execFileSync('node', [path.join(R, 'tools/edit.js'), '--dist', path.join(R, 'dist'), '--blobs', MEDIA, '--project', path.join(__dirname, 'fixtures/larreta_proj.json'),
  '--ops', path.join(OUT, 'ops.json'), '--clear', '--sheet', '0.5,1.8', '--cols', '2', '--out', OUT], { encoding: 'utf8' });
console.log(o.split('\n').filter(l => /ERROR|inserto|Inserto/i.test(l)).join('\n'));
const P = JSON.parse(fs.readFileSync(path.join(OUT, 'project.json'), 'utf8'));
const m = P.motions.find(x => x.type === 'inserto');
if (!m || m.tr !== 'corte' || m.params.clip !== 'prueba_inserto') { console.log('ERROR de página: la pieza inserto no quedó en el proyecto'); process.exit(1); }
// el cuadro con el inserto (1,8 s) no puede diferir en casi todo del cuadro sin inserto (0,5 s): si el alfa falla, el fondo negro tapa el video
const py = `
from PIL import Image, ImageChops
im = Image.open(${JSON.stringify(path.join(OUT, 'sheet.jpg'))}).convert('L'); w, h = im.size
a, b = im.crop((0, 0, w//2, h)), im.crop((w//2, 0, w, h))
d = ImageChops.difference(a, b).point(lambda v: 255 if v > 60 else 0)
print(d.tobytes().count(255) / (d.size[0]*d.size[1]))`;
let frac = null; try { frac = +execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim(); } catch (e) { console.log('(sin PIL: no mido la hoja)'); }
console.log('parte del cuadro que cambia con el inserto: ' + frac);
if (frac != null && (frac < 0.002 || frac > 0.6)) { console.log('ERROR de página: el inserto no se ve o tapa todo (¿alfa mal?)'); process.exit(1); }
console.log('hoja: ' + path.join(OUT, 'sheet.jpg'));
