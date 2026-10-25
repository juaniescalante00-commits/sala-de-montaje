# Datos para editar

Lo que Claude lee para decidir por datos. Lo generan los scripts de `local/` en la compu de Juani; acá no hay audios
ni videos, solo tablas, fichas y tiras livianas.

- `audio/indice.csv` y `audio/indice.json`: música y SFX con duración, BPM, energía, golpes, tonalidad y clima.
  El `doc_id` es el mismo de `library/<doc_id>` en el editor. Para elegir música: filtrar por clima, energía y BPM,
  mirar `curva_energia` (si crece o baja) y alinear cortes o entradas a `golpes`. El clima es una etiqueta automática:
  orienta, se confirma escuchando.
- `referencias/indice.md`: todas las referencias con su ritmo en una línea.
- `referencias/<nombre>/ficha.md` (resumen), `ficha.json` (completo, con cada palabra) y `tira.jpg` (momentos clave):
  el molde para "editalo como esta referencia". Cámara y estilo de subtítulos no se copian solos: se proponen en el
  plan que aprueba Juani.
