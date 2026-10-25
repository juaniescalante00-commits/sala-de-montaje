#!/bin/sh
# Arma dist/sala.html (la página del artifact) y copia las librerías que carga en tiempo de ejecución.
set -e
cd "$(dirname "$0")"
[ -d node_modules/mediabunny ] || npm install --no-audit --no-fund
mkdir -p dist
{ cat src/head.html; cat src/body.html; echo '<script>'; cat src/js/*.js; echo '</script>'; } > dist/sala.html
cp node_modules/mediabunny/dist/bundles/mediabunny.min.mjs dist/
cp node_modules/@mediabunny/aac-encoder/dist/bundles/mediabunny-aac-encoder.min.js dist/
cp node_modules/three/build/three.module.min.js dist/
cp node_modules/lottie-web/build/player/lottie_canvas.min.js dist/
for f in src/js/*.js; do node --check "$f"; done
wc -c dist/*
