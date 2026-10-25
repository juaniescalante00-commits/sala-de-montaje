#!/bin/sh
# Sala de Montaje · video con alfa → inserto
# Convierte un render con transparencia (Remotion en ProRes 4444 o WebM VP9 con alfa, Blender o After en PNG/ProRes,
# o una secuencia PNG con patrón %04d) en el clip "lado a lado" (izquierda color, derecha alfa) que usa la Sala.
#   sh tools/a_inserto.sh <entrada.mov|entrada.webm|cuadros_%04d.png> <salida.mp4> [fps]
# Para WebM con alfa hace falta decodificar con libvpx (ffmpeg -c:v libvpx-vp9), si no el alfa se pierde.
set -e
IN="$1"; OUT="$2"; FPS="${3:-30}"
[ -n "$IN" ] && [ -n "$OUT" ] || { echo "uso: sh tools/a_inserto.sh <entrada> <salida.mp4> [fps]"; exit 2; }
DEC=""
case "$IN" in *.webm) DEC="-c:v libvpx-vp9";; esac
RATE=""
case "$IN" in *%*) RATE="-framerate $FPS";; esac
ffmpeg -v error -y $RATE $DEC -i "$IN" -filter_complex \
  "[0:v]format=rgba,split=3[o][p][q];[p]premultiply=inplace=1,boxblur=12:3,unpremultiply=inplace=1,format=rgba[bl];[bl][o]overlay=format=auto,format=rgb24[c];[q]alphaextract,format=rgb24[a];[c][a]hstack=inputs=2,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -preset medium -crf 14 -g "$FPS" -movflags +faststart "$OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate:format=duration -of compact "$OUT"
