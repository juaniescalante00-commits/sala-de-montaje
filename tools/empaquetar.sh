#!/bin/sh
# Sala de Montaje · copia del repo para la edición a fondo.
# La tarea en la nube clona el repo de GitHub en cada corrida. Si no puede (sin acceso a GitHub en esa sesión), baja
# esta copia del artifact: el último commit de main empaquetado en texto (tar.gz en base64), publicado como
# tools/repo.tgz.b64.txt junto al editor. Correr después de cada push a main y publicarla con el editor:
#   sh tools/empaquetar.sh   →   dist/repo.tgz.b64.txt   (+ dist/repo.commit.txt con el commit)
# Desempaquetar:  base64 -d repo.tgz.b64.txt | tar xz -C sala-de-montaje
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
git archive --format=tar HEAD | gzip -9 | base64 -w 0 > dist/repo.tgz.b64.txt
git rev-parse HEAD > dist/repo.commit.txt
ls -la dist/repo.tgz.b64.txt
cat dist/repo.commit.txt
