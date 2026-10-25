# HARD-RULES · Sala de Montaje

Correctitud técnica, no gusto. Cada regla evita una **falla silenciosa**: un render que termina sin error y está mal.
Solo correctitud técnica: no se negocian. El gusto vive en `docs/EDITOR.md` y en las recetas; las reglas fijas de Juani, en `CLAUDE.md`.
Cada vez que Juani rechaza un render por algo técnico, se agrega acá una regla con el fallo que previene.

## A. Leer el material (Claude lee el video, no lo mira)
1. **Probe antes de tocar nada.** `ffprobe` (o `ffmpeg-skill/scripts/probe.py`): fps real (avisar si es VFR), dimensiones de *display* (no de stream: el celular guarda la rotación aparte), duración y canales de audio. Un video vertical leído como horizontal se letterboxea entero sin avisar.
2. **Transcript con tiempos por palabra, idioma fijado.** faster-whisper o WhisperX con `word_timestamps`, idioma explícito (`es`); nunca autodetectar (puede traducir en silencio) ni usar SRT por frase. Se cachea por archivo y se rehace solo si cambia el archivo.
3. **El ritmo sale del audio.** Cortes de habla: silencios (`silencedetect`, VAD) y fin de oración. Cortes musicales: beats y energía (librosa; ya medidos en `datos/audio/indice.json`). La visión no encuentra un golpe de 200 ms.
4. **Ojos a demanda.** Hoja de cuadros o tira con onda y palabras solo en puntos de decisión (pausas dudosas, tomas, cada corte). Nunca volcar todos los cuadros.

## B. Decidir (Claude decide, el código ejecuta)
5. **El corte va primero, con plan escrito.** Estrategia en castellano llano (estructura, duración, qué sale y por qué) antes de cortar; no se espera aprobación (decisión de Juani del 25/10/2026: video + pedido y edita) y el mensaje final la cuenta. Subtítulos, gráficos y sonido se ubican sobre el tiempo ya cortado: cambiar el corte después invalida todo.
6. **Claude nunca escribe un timecode ni un XML a mano.** La decisión es un JSON chico con IDs de frase, palabra o plano (`edl.json`, o las ops del editor). Un script traduce a cuadros, a comandos de ffmpeg o a OTIO/FCPXML y lo valida.
7. **Toda cita existe textual en el transcript.** Búsqueda exacta; lo que no aparece vuelve como "no encontrado". Ningún dato, nombre ni número que no se diga o que no dé Juani.

## C. Cortar y renderizar
8. **Nunca cortar dentro de una palabra.** El borde va en el silencio de alrededor; el transcript solo dice qué silencios son bordes válidos (el inicio de una palabra cae sobre la consonante y cortar ahí le come el ataque).
9. **Margen de 30 a 200 ms en cada borde** (más justo para ritmo rápido, más amplio para pausado).
10. **Fade de audio de 30 ms en cada unión.** Sin eso, cada corte hace "pop".
11. **Extraer por segmento y concatenar sin recodificar** (`-c copy`). Un solo filtergraph recodifica todo de nuevo al sumar overlays. `-ss` y `-t` van antes de `-i`.
12. **Cambios de velocidad dentro del render**, nunca sobre el video terminado (desfasa subtítulos, sonido y gráficos).
13. **Overlays con `setpts=PTS-STARTPTS+T/TB`**, para que la animación empiece en su ventana y no a la mitad.
14. **Subtítulos al final de la cadena**, encima de todo overlay, con tiempos de salida: `t_salida = palabra.inicio − segmento.inicio + segmento.offset`.
15. **Gráficos al mismo tamaño y fps que el corte**, con movimiento manejado por cuadro (nada de transiciones CSS, timers ni `requestAnimationFrame`: se renderizan quietos). El audio de un gráfico nunca va dentro del gráfico: todo sonido va a la mezcla.
16. **B-roll y paneles se componen dentro de la composición**, nunca pegados sobre el render terminado (se pierden los subtítulos de encima).

## D. Sala de Montaje (fallas técnicas ya vistas)
17. **Color en escala −1 a 1** (0,08 = +8%). Un 8 escrito como porcentaje pintó un video entero de rojo. `normGrade` lo corrige, pero se escribe bien.
18. **Texto detrás de la persona solo con recorte y con alguien en cuadro.** Sin recorte de persona, una pieza "detrás" se dibuja encima de la cara; en tomas sin persona, el recorte puede marcar edificios u objetos como si fueran gente.

29. **Un corte nunca cae en el primer hueco después de una palabra: va en un silencio sostenido de 120 ms o más.** Las consonantes oclusivas (p, t, k) tienen un cierre casi mudo de 50 a 90 ms antes de su última ráfaga, y el reconocedor marca el fin de la palabra antes de esa ráfaga: un corte de silencio en "startups" cayó en el cierre de la p y se oía "start". `tools/cortar.py` mide el silencio sostenido en el audio.
30. **Transcript y audio cortados siempre iguales.** Una palabra que sale del transcript tiene que salir del audio y al revés. Si una palabra pedida no tiene silencio alrededor ("la la gente" sin pausa), no se corta: queda y se avisa. Antes se borraba del transcript y seguía sonando.
31. **Segmentos cuantizados a cuadros antes de cortar.** Inicio y fin de cada tramo en múltiplos de 1/fps, y el audio cortado en esos mismos instantes; si no, cada unión agrega hasta un cuadro de diferencia y en 20 cortes la voz se corre más de medio segundo de la boca.
32. **El corte va a un proyecto nuevo ("… · cortado"), nunca reemplaza el video del mismo proyecto.** La página reproduce primero el video guardado en el navegador de Juani: con el video reemplazado, él seguiría viendo el crudo sin cortar con los subtítulos del tiempo nuevo.
33. **Muletillas en castellano: solo sonidos de duda** (eh, em, mm, ah) y "este" aislado entre pausas. La lista en castellano de `ffmpeg-skill` (`silence.py --filler`) trae "esto" y "este": se comería "Esto era el Tiro Federal". No usar esa lista para castellano.

## E. Verificar antes de mostrar (máximo 3 vueltas)
19. **Mirar el archivo renderizado, no el plan.** Cuadros en cada corte, al principio y al final, hoja de cuadros de todo el video; mirarlos de verdad.
20. **Medir audio.** Integrado a −14 LUFS y pico −1 dBTP. Un efecto de sonido se verifica por diferencia contra la mezcla sin efectos, no midiendo el master.
21. **Retranscribir 2 s alrededor de cada unión** y comparar con el plan: un corte a mitad de frase puede invertir el sentido.
22. **Comparar contra la referencia lado a lado** cuando hay estilo de referencia.
23. **Corregir y re-renderizar, máximo 3 vueltas.** Si después de 3 sigue mal, se entrega con el problema dicho claro.

## F. Herramientas y seguridad
24. **Nunca escribir dentro de la carpeta de una skill**: todo lo que se genera va a la carpeta del proyecto.
25. **Nada pago ni cuentas nuevas sin OK de Juani.** `motionmaxxing` trae `voice.py` (ElevenLabs) e `imagegen.py` (Codex): no se configuran claves para usarlos.
26. **Skills de terceros: solo copias auditadas** (sin red escondida, sin claves, sin comandos peligrosos). Se actualizan volviendo a auditar, nunca con el instalador de la skill.
27. **Al repo nunca suben audios ni videos** (pesan y no son nuestros): solo tablas, fichas y tiras JPG livianas. El `.gitignore` los frena; si uno aparece en un commit, se saca antes de pushear.
28. **Los cuadros de control se miran con las tipografías reales.** En la nube Google Fonts está bloqueado: `edit.js`, `html_inserto.js` y Remotion las toman de npm (`npm ci` hecho). Si `edit.js` avisa "fuentes sin cargar" o una serif sale como sans, el control no vale: arreglalo antes de juzgar el texto.

34. **GSAP: `window.seek` nunca devuelve la timeline.** Una timeline de GSAP es "thenable" (tiene `.then`): si `seek` la devuelve, el renderizador la espera, una timeline pausada nunca termina y el render se cuelga sin error. Arreglo: `window.seek = t => { tl.seek(t); }`, con llaves. En Remotion, la timeline va atada al cuadro con `useGsapTimeline` de `@remotion/gsap`.
35. **Tipografías siempre por npm (`@fontsource/*`), nunca por Google Fonts.** En la nube fonts.googleapis.com está bloqueado. `edit.js` y `html_inserto.js` responden los pedidos a Google Fonts con las fuentes locales (`tools/fuentes_locales.js`) y Remotion las carga con `remotion/fuentes.ts`. No usar `@remotion/google-fonts`. Familia nueva en el editor = su `@fontsource/<familia>` en `package.json`.
36. **Remotion en una compu nueva baja Chrome Headless Shell solo la primera vez** (gratis, desde los servidores de Chrome for Testing): necesita internet y unos 100 MB. En la nube se le pasa el Chrome que ya está: `REMOTION_CHROME=/opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell` (lo lee `remotion.config.ts`). Sin internet y sin `REMOTION_CHROME`, el primer render falla.
37. **`three` queda fijo en 0.160.0** (y `@types/three` 0.160.0). El editor copia three.js r160 a `dist/` y sus piezas 3D están escritas para esa versión; `@remotion/three` y `@react-three/fiber` funcionan con ella. Subirla rompe la página sin aviso: solo con prueba completa de la página (`npm test`) y de un render 3D en Remotion.
38. **faster-whisper con audio ya decodificado.** El PyAV que puede venir instalado no es compatible con la versión de faster-whisper que se instala (`open() got an unexpected keyword argument 'metadata_errors'`): decodificar con ffmpeg a PCM 16 kHz mono y pasarle el arreglo (como hace `cortar.py --modelo`), o instalar el PyAV que pide faster-whisper.

## Qué NO va en este archivo
Movimientos de cámara (zooms, seguimiento de cara, reencuadres), estilo de subtítulos (tamaño, palabras por bloque,
posición, mayúsculas, cuándo se ocultan), pantallas completas, densidad de gráficos y música se eligen en cada edición
(la edición decide y lo dice en su mensaje; no hay paso de aprobación). Sus reglas fijas están en `CLAUDE.md`; el oficio y los valores por defecto, en `docs/EDITOR.md`.

---
Origen: reglas 2, 6, 8–16, 19–21 y 24 adaptadas de [browser-use/video-use](https://github.com/browser-use/video-use) y
[ranahaani/i-hate-editing](https://github.com/ranahaani/i-hate-editing) (MIT, usadas como referencia, no instaladas) y del
informe "Cómo hacer que Claude edite bien". Reglas 1, 11 y 20 se ejecutan con `.claude/skills/ffmpeg-skill`
([kajisho5/ffmpeg-skill](https://github.com/kajisho5/ffmpeg-skill), MIT). Reglas 17, 18 y 28 a 38 salen de fallas de la Sala.
