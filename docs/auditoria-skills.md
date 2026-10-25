# Auditoría de skills de terceros (25/10/2026)

Chequeo estático (sin ejecutar código del repo) de: red y dominios contactados, lectura de claves y variables de
entorno, comandos peligrosos, instaladores, servicios pagos, telemetría y código ofuscado. La skill de chequeo de
seguridad no estaba instalada en la cuenta; se usó este checklist. Script: `tools/scan_skill.py`.

| Skill | Commit | Licencia | Resultado | Decisión |
| --- | --- | --- | --- | --- |
| [kajisho5/ffmpeg-skill](https://github.com/kajisho5/ffmpeg-skill) | 88e2f42 | MIT | Limpia. Solo biblioteca estándar de Python y ffmpeg local; sus propias pruebas prohíben red y `shell=True`. La única descarga está en `tests/corpus.py` (material de prueba). Transcripción con motores locales. | Instalada en `.claude/skills/ffmpeg-skill` (sin el instalador `bin/` ni `assets/`). Probada con probe y silence sobre un crudo real. |
| [Tejashmakwana/motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) | 8c8ec0f | Apache-2.0 (+ GSAP "no charge", three.js MIT, fuentes OFL) | Núcleo limpio y local. Opcionales pagos: `voice.py` (ElevenLabs, con clave) e `imagegen.py` (login de Codex). La clave en `blind_review.py` es la respuesta oculta de una revisión a ciegas, no un secreto. `fetch_logo.mjs` y `brand.mjs` solo bajan la web de la marca que se le pida. `install.sh` borra su carpeta destino antes de copiar (no se usó). | Instalada en `.claude/skills/motionmaxxing` sin `docs/` ni `studies/`. Los opcionales pagos no se configuran. |
| [browser-use/video-use](https://github.com/browser-use/video-use) | 43cfc56 | MIT | El código es limpio, pero la transcripción **exige una clave de ElevenLabs** (Scribe, servicio pago) y la instalación pide pegarla en `.env`. | **No instalada** (pide clave y es paga). Se usan sus 12 reglas duras y su método (transcript empaquetado, EDL, timeline view) como referencia. |
| [ranahaani/i-hate-editing](https://github.com/ranahaani/i-hate-editing) | a5add74 | MIT | `adobe_enhance.mjs` saca el token de sesión de Adobe del navegador y manda el audio a una API privada de Adobe (cuenta necesaria). `gen_image.py` usa un proxy no oficial de Gemini web. `cutout_broll.py` ejecuta código de otra skill (`~/.claude/skills/virtual-bg`). `proofread.py --llm` corre comandos con `shell=True`. | **No instalada**. Su HARD-RULES.md y `rules/` se usan como referencia. |
| [krusemediallc/video-editor-agent](https://github.com/krusemediallc/video-editor-agent) | 1c9e578 | Sin licencia | No se audita para instalar: sin licencia no se puede copiar. | Solo referencia de lectura. |
| [AgriciDaniel/claude-shorts](https://github.com/AgriciDaniel/claude-shorts) | a369fad | MIT | Basada en Remotion, que cobra licencia a empresas de más de 3 personas; instala PyTorch; sin cambios desde abril. | Descartada. |
| [0xsline/OpenChatCut](https://github.com/0xsline/OpenChatCut) | 7fa4b79 | AGPL-3.0 | Es una aplicación entera (154 MB), no una skill; la AGPL obliga a publicar cambios. | Descartada. |
