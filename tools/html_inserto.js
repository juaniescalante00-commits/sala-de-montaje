/* Sala de Montaje · HTML → inserto
   Renderiza una animación HTML (GSAP, three.js, Lottie, CSS a mano) cuadro por cuadro con fondo transparente y la
   convierte en un clip "lado a lado" (izquierda color, derecha alfa) para la pieza "inserto" de la Sala.

   node tools/html_inserto.js <animacion.html> <salida.mp4> [--w 1080] [--h 1920] [--dur 3] [--fps 30] [--scale 1] [--q "texto=Hola&color=%23fff"]

   La página tiene que definir  window.seek = t => { ... }  (t en segundos; puede devolver una promesa) y dibujar ese
   instante exacto. Nada de timers, transiciones CSS ni requestAnimationFrame para avanzar: todo sale de t (HARD-RULES 15).
   Fondo transparente: no pintes el body. Opcional: window.ready (promesa) para esperar fuentes o modelos.

   Librerías disponibles en la página (rutas fijas):
     /lib/gsap.min.js            GSAP (3.15.0 del repo, o 3.12.5 de motionmaxxing; licencia "Standard No Charge", gratis también comercial)
     /lib/three.module.min.js    three.js r160 (como módulo: import * as THREE from '/lib/three.module.min.js')
     /lib/lottie.min.js          lottie-web 5.12.2 (lottie.loadAnimation con renderer 'svg' o 'canvas', y goToAndStop)
     /mm/motion.js               runtime de motionmaxxing (curvas medidas, contrato de seek; ver su SKILL.md y runtime/README.md).
                                 Toda la carpeta runtime/ se sirve bajo /mm/ (hero3d, fonts.css, native-ui).
     /fonts/InterVariable.woff2  Inter (OFL)
   Los archivos que estén junto al .html se sirven con su nombre (imágenes, JSON de Lottie, etc.).
   --q pasa parámetros a la página (new URLSearchParams(location.search)): así una plantilla sirve para muchos textos.
   Plantillas listas en tools/insertos/ (gsap-titulo, gsap-dato, three-objeto, lottie). */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');

const args = process.argv.slice(2), pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : args[i + 1]; };
const [HTML, OUT] = pos; if (!HTML || !OUT) { console.error('uso: node tools/html_inserto.js <animacion.html> <salida.mp4> [--w 1080] [--h 1920] [--dur 3] [--fps 30]'); process.exit(2); }
const Wd = +(opt('w') || 1080), Hd = +(opt('h') || 1920), DUR = +(opt('dur') || 3), FPS = +(opt('fps') || 30), SCALE = +(opt('scale') || 1);
const REPO = path.resolve(__dirname, '..'), MM = path.join(REPO, '.claude/skills/motionmaxxing/runtime');
const LIB = {
  '/lib/gsap.min.js': [path.join(REPO, 'node_modules/gsap/dist/gsap.min.js'), path.join(MM, 'vendor/gsap.min.js')],
  '/lib/three.module.min.js': [path.join(REPO, 'node_modules/three/build/three.module.min.js')],
  '/lib/lottie.min.js': [path.join(REPO, 'node_modules/lottie-web/build/player/lottie.min.js')],
  '/fonts/InterVariable.woff2': [path.join(MM, 'fonts/InterVariable.woff2')],
};
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const ROOT = path.dirname(path.resolve(HTML));
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = null;
  if (u === '/') f = path.resolve(HTML);
  else if (LIB[u]) f = LIB[u].find(p => fs.existsSync(p));
  else if (u.startsWith('/mm/')) { const p = path.join(MM, u.slice(4)); if (p.startsWith(MM) && fs.existsSync(p) && fs.statSync(p).isFile()) f = p; }
  else { const p = path.join(ROOT, u); if (p.startsWith(ROOT) && fs.existsSync(p) && fs.statSync(p).isFile()) f = p; }
  if (!f) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: Wd, height: Hd }, deviceScaleFactor: SCALE });
  page.on('pageerror', e => console.log('ERROR de página: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('consola: ' + m.text()); });
  await page.goto(`http://localhost:${srv.address().port}/` + (opt('q') ? '?' + opt('q') : ''), { waitUntil: 'networkidle' });
  await page.evaluate(async () => { if (window.ready) await window.ready; if (document.fonts) await document.fonts.ready; });
  if (!(await page.evaluate(() => typeof window.seek === 'function'))) throw new Error('la página no define window.seek(t)');
  const N = Math.max(1, Math.round(DUR * FPS)), ow = Math.round(Wd * SCALE), oh = Math.round(Hd * SCALE);
  // color con "sangrado" en las zonas transparentes (evita bordes oscuros por el submuestreo de color) + alfa al lado
  const filt = `[0:v]format=rgba,split=3[o][p][q];[p]premultiply=inplace=1,boxblur=12:3,unpremultiply=inplace=1,format=rgba[bl];` +
    `[bl][o]overlay=format=auto,format=rgb24[c];[q]alphaextract,format=rgb24[a];[c][a]hstack=inputs=2,format=yuv420p[v]`;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-filter_complex', filt, '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-g', String(FPS), '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg salió con ' + c))));
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await page.evaluate(async t => { await window.seek(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, i / FPS);
    const png = await page.screenshot({ omitBackground: true, type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 30 === 0) console.log(`  cuadro ${i + 1}/${N}`);
  }
  ff.stdin.end(); await done;
  console.log(JSON.stringify({ salida: OUT, w: ow, h: oh, fps: FPS, dur: N / FPS, segundos: Math.round((Date.now() - t0) / 1000) }));
  await browser.close(); srv.close();
})().catch(e => { console.error(e.message || e); process.exit(1); });
