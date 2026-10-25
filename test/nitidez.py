#!/usr/bin/env python3
"""Prueba de tools/nitidez.py (HARD-RULES 47): dos tomas, la primera nítida con cara (A-roll) y la segunda la misma
textura desenfocada (B-roll blando), en ese orden al revés. Solo la segunda recibe más enfoque, y cada toma se mide con SUS cuadros (el error
del 25/10: todas medían la última)."""
import json, os, subprocess, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(AQUI, 'out', 'nitidez'); os.makedirs(OUT, exist_ok=True)
v = os.path.join(OUT, 'v.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=720x1280:r=30:d=4',
                '-vf', "split[a][b];[b]negate,hue=h=120,gblur=sigma=2.2[bb];[a][bb]overlay=enable='lt(t,2)',format=yuv420p,drawbox=x=0:y=0:w=720:h=200:color=0x3060a0:t=fill:enable='lt(t,2)'",
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', v], check=True)
P = {'faces': [{'t': t / 4, 'caras': [[0.4, 0.3, 0.2, 0.12]] if t >= 8 else []} for t in range(16)]}   # cara en la 2.ª
json.dump(P, open(os.path.join(OUT, 'p.json'), 'w'))
r = subprocess.run([sys.executable, '-B', os.path.join(AQUI, '..', 'tools', 'nitidez.py'), '--video', v, '--proyecto', os.path.join(OUT, 'p.json')], capture_output=True, text=True)
d = json.loads(r.stdout); t = d['tomas']; print(json.dumps(t))
mal = []
if len(t) != 2: mal.append('tenía que ver 2 tomas: %s' % len(t))
else:
    b, a = t   # primero la blanda (B-roll), después la nítida con cara: así se nota si una toma mide los cuadros de otra
    if not a['aroll'] or b['aroll']: mal.append('la segunda es A-roll (cara) y la primera no')
    if b['despues'] >= a['nitidez']: mal.append('la toma blanda no puede quedar más nítida que la nítida: ¿midió los cuadros de otra toma?')
    if a['monto'] != a['base']: mal.append('la toma nítida no se toca')
    if not (b['monto'] > b['base'] and b['despues'] > b['nitidez']): mal.append('la toma blanda tenía que recibir más enfoque y mejorar')
    if b['nitidez'] >= a['nitidez']: mal.append('la toma desenfocada tenía que medir menos que la nítida')
print('MAL:\n- ' + '\n- '.join(mal) if mal else 'ok: nitidez por toma')
sys.exit(1 if mal else 0)
