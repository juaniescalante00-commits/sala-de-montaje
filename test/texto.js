// Prueba del contraste de texto letra por letra (HARD-RULES 46): un titular blanco sobre un fondo blanco tiene que
// detectarse. (1) Mitad de arriba blanca y abajo oscura: lo baja hasta lo oscuro. (2) Todo blanco: le pone velo suave.
// En los dos casos la peor letra, medida otra vez después de las reglas, tiene que pasar.
const { execFileSync } = require('child_process'), path = require('path'), fs = require('fs');
const R = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out', 'texto'); fs.mkdirSync(OUT, { recursive: true });
let mal = 0;
for (const [nombre, vf, espera] of [['mitad', "drawbox=x=0:y=0:w=1080:h=620:color=white:t=fill", 'mover'], ['blanco', 'drawbox=x=0:y=0:w=1080:h=1920:color=0xf4f4f4:t=fill', 'velo']]) {
  const dir = path.join(OUT, nombre); fs.mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x1a2430:s=1080x1920:r=30:d=3', '-vf', vf, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(dir, 'vid.mp4')]);
  const P = { id: 'ptexto', name: 'prueba texto', duration: 3, fps: 30, words: [], faces: [], chat: [], stage: 'editor', audio: {},
    video: { assetId: 'vid', w: 1080, h: 1920, duration: 3, name: 'vid.mp4' },
    motions: [{ id: 'mt', type: 'libre', start: 0.2, dur: 2.4, layout: 'overlay', tr: 'fundido', params: { elements: [
      { kind: 'texto', text: 'Esto era el', x: 108, y: 360, size: 60, font: 'body', weight: 500, color: 'fg', shadow: true, at: 0, anim: 'mascara', dur: 0.45 },
      { kind: 'texto', text: 'Tiro Federal.', x: 104, y: 466, size: 112, font: 'display', italic: true, weight: 400, color: 'fg', shadow: true, at: 0.12, anim: 'mascara', dur: 0.55 }] } }] };
  fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify(P));
  execFileSync('node', [path.join(R, 'tools/edit.js'), '--dist', path.join(R, 'dist'), '--blobs', dir, '--project', path.join(dir, 'p.json'), '--sheet', '1.5', '--cols', '1', '--out', dir], { encoding: 'utf8', timeout: 400000 });
  const rr = JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8')), r = (rr.contraste_texto || [])[0];
  const ok = r && r.nota < 1 && r.despues && r.despues.nota >= 1 && (espera === 'mover' ? r.movido_px > 0 && !r.velo : r.velo > 0);
  console.log(`${ok ? 'ok' : 'MAL'} ${nombre}: antes ${r && r.nota}, ${r && r.movido_px ? 'movido ' + r.movido_px + ' px' : ''} ${r && r.velo ? 'velo ' + r.velo + ' capas' : ''} → ${r && r.despues && r.despues.nota}`);
  if (!ok) mal++;
}
process.exit(mal ? 1 : 0);
