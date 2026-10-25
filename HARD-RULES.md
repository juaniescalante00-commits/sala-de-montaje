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
5. **Plan aprobado antes de cortar.** Estrategia en castellano llano (estructura, duración, qué sale y por qué). Juani da el OK; recién ahí se corta. Subtítulos, gráficos y sonido dependen del corte: cambiar el corte después invalida todo.
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

## Qué NO va en este archivo
Movimientos de cámara (zooms, seguimiento de cara, reencuadres), estilo de subtítulos (tamaño, palabras por bloque,
posición, mayúsculas, cuándo se ocultan), pantallas completas, densidad de gráficos y música se eligen en cada edición,
en el plan que aprueba Juani. Sus reglas fijas están en `CLAUDE.md`; el oficio y los valores por defecto, en `docs/EDITOR.md`.

---
Origen: reglas 2, 6, 8–16, 19–21 y 24 adaptadas de [browser-use/video-use](https://github.com/browser-use/video-use) y
[ranahaani/i-hate-editing](https://github.com/ranahaani/i-hate-editing) (MIT, usadas como referencia, no instaladas) y del
informe "Cómo hacer que Claude edite bien". Reglas 1, 11 y 20 se ejecutan con `.claude/skills/ffmpeg-skill`
([kajisho5/ffmpeg-skill](https://github.com/kajisho5/ffmpeg-skill), MIT). Reglas 17 y 18 salen de fallas de la Sala.
