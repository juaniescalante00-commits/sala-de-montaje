#!/usr/bin/env python3
"""Prueba de tools/cortar.py con un crudo sintético: cada palabra es un tono con un cierre mudo en el medio (como la
"p" de "startups"). Verifica muletillas, falso arranque, toma repetida (queda la última), tartamudeo, "esto"/"este"
como palabras reales, que ningún corte caiga dentro de una palabra, 80 ms antes del ataque real aunque el
reconocedor marque tarde, chasquidos suavizados en las pausas, la duración y uniones sin huecos ni pops."""
import json, os, subprocess, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(AQUI, 'out', 'cortar'); os.makedirs(OUT, exist_ok=True)
frase = [
    ('Esto', 0.0), ('era', 0.4), ('el', 0.7), ('parque.', 0.9),                       # "Esto" es palabra real: se queda
    ('Eh', 2.2),                                                                         # muletilla
    ('Nosotros', 3.0), ('lo', 3.6),                                                      # falso arranque…
    ('Nosotros', 4.6), ('lo', 5.2), ('convertimos', 5.4), ('en', 6.1), ('el', 6.4), ('el', 6.75), ('parque', 7.0), ('de', 7.55), ('innovación.', 7.8),
    ('la', 8.6), ('la', 8.8), ('gente', 8.95),                                         # tartamudeo SIN pausa: no se puede cortar, se queda
    ('Este', 9.9), ('lugar', 10.2), ('es', 10.7), ('libre.', 10.9),                        # "Este lugar": demostrativo, se queda
    ('este', 12.3), ('gratuito.', 13.1),                                                 # "este" aislado entre pausas: muletilla
]
words = [{'w': w, 's': s, 'e': round(s + (0.5 if len(w) > 6 else 0.18 if len(w) <= 2 else 0.25), 2)} for w, s in frase]
reales = [dict(w) for w in words]          # el audio de verdad
words[19]['s'] = round(words[19]['s'] + 0.1, 2)   # el reconocedor marca tarde el arranque de "Este" (pasa con vocales suaves)
CHASQUIDO = (7.37, 7.41)                   # chasquido de boca en una pausa que no se corta (entre "parque" y "de")
dur = 14.1
P = {'id': 'pprueba', 'name': 'prueba cortes', 'duration': dur, 'words': words, 'faces': [{'t': t / 4, 'caras': [[0.4, 0.2, 0.2, 0.12]]} for t in range(int(dur * 4))],
     'video': {'assetId': 'vid', 'w': 720, 'h': 1280}}
json.dump(P, open(os.path.join(OUT, 'p.json'), 'w'))
# audio: tono en cada palabra con un cierre de 80 ms en el medio; video: barra que avanza (se ven los saltos)
expr = '+'.join(f"between(t,{w['s']},{(w['s'] + w['e']) / 2 - 0.04:.3f})+between(t,{(w['s'] + w['e']) / 2 + 0.04:.3f},{w['e']})" for w in reales)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=0x223344:s=720x1280:r=30:d={dur}', '-f', 'lavfi', '-i',
                f"aevalsrc='0.5*sin(2*PI*220*t)*gt({expr},0)+0.15*sin(2*PI*900*t)*between(t,{CHASQUIDO[0]},{CHASQUIDO[1]})+0.01*sin(2*PI*50*t)':s=48000:d={dur}",
                '-vf', "drawbox=x=0:y=600:w='iw*t/14.1':h=80:color=white:t=fill", '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast',
                '-pix_fmt', 'yuv420p', '-c:a', 'aac', os.path.join(OUT, 'vid.mp4')], check=True)
r = subprocess.run([sys.executable, os.path.join(AQUI, '..', 'tools', 'cortar.py'), '--proyecto', os.path.join(OUT, 'p.json'),
                    '--video', os.path.join(OUT, 'vid.mp4'), '--out', OUT], capture_output=True, text=True)
print(r.stdout[-1500:], r.stderr[-800:])
plan = json.load(open(os.path.join(OUT, 'plan.json')))
fuera = {q['id']: q['motivo'] for q in plan['palabras_quitadas']}
pal = [w['w'] for w in json.load(open(os.path.join(OUT, 'palabras.json')))]
mal = []
def chk(cond, msg):
    if not cond: mal.append(msg)
chk(fuera.get(4) == 'muletilla', '"Eh" tenía que salir como muletilla')
chk(5 in fuera and 6 in fuera and 'toma' in fuera[5], 'el falso arranque "Nosotros lo" tenía que salir (queda la última toma)')
chk(7 not in fuera and 8 not in fuera, 'la toma buena "Nosotros lo convertimos" tenía que quedar')
chk(11 in fuera and 12 not in fuera, 'del tartamudeo "el el" tenía que salir solo la primera copia')
chk(0 not in fuera, '"Esto" es una palabra real: no puede salir')
chk(19 not in fuera, '"Este lugar" es un demostrativo: no puede salir')
chk(fuera.get(23) == 'muletilla', '"este" aislado entre pausas tenía que salir')
nc = {x['id'] for x in plan['no_cortado']}
chk(16 in nc and 16 not in fuera, '"la la" sin pausa: no se puede cortar, tiene que quedar y avisarse')
chk(pal[:4] == ['Esto', 'era', 'el', 'parque.'], 'el comienzo cambió: %s' % pal[:4])
for g in plan['segmentos']:
    for w in words:
        for borde in (g['s'], g['e']):
            chk(not (w['s'] + 0.01 < borde < w['e'] - 0.01), f"corte dentro de la palabra {w['w']} ({borde})")
# transcript y audio iguales: toda palabra que salió del transcript está dentro de un tramo quitado, y ninguna que quedó
for i, w in enumerate(words):
    adentro = any(q['s'] - 0.01 <= w['s'] and w['e'] <= q['e'] + 0.01 for q in plan['quitado'])
    chk(adentro == (i in fuera), f"#{i} {w['w']}: {'salió del transcript pero sigue en el audio' if i in fuera else 'quedó en el transcript pero se cortó del audio'}")
# ataque real: el tramo que trae "Este" arranca al menos 80 ms antes de que suene (aunque el transcript lo marque tarde)
seg_este = next((g for g in plan['segmentos'] if g['s'] <= reales[19]['s'] <= g['e']), None)
chk(seg_este and reales[19]['s'] - seg_este['s'] >= 0.075, f"\"Este\" entra con menos de 80 ms antes de su ataque: {seg_este and round(reales[19]['s'] - seg_este['s'], 3)}")
c = plan['controles']
chk(any(abs(x['s'] - (CHASQUIDO[0] - (plan['segmentos'][0]['e'] - plan['segmentos'][0]['s']) * 0)) < 9 for x in c.get('suavizados', [])) and len(c.get('suavizados', [])) >= 1,
    'el chasquido en la pausa entre "parque" y "de" tenía que suavizarse')
chk(all(u.get('saca_audio') is not None for u in c['uniones']), 'cada unión tiene que decir si saca audio')
chk(c['duracion']['ok'], 'la duración no cierra: %s' % c['duracion'])
chk(all(u['ok'] for u in c['uniones']), 'uniones con ataque o cola comidos, hueco o pop: %s' % [u for u in c['uniones'] if not u['ok']])
print('palabras que quedan:', ' '.join(pal))
print('MAL:\n- ' + '\n- '.join(mal) if mal else 'ok: cortes por palabra, muletillas, tomas y uniones')
sys.exit(1 if mal else 0)
