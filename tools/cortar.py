#!/usr/bin/env python3
"""Sala de Montaje · cortes del crudo (silencios, muletillas, tomas repetidas y ritmo de la referencia).

Claude decide QUÉ sale (por IDs de palabra o de frase, nunca por timecodes); este script decide DÓNDE cae cada corte
(en el silencio entre palabras, por energía del audio) y lo ejecuta con ffmpeg: corte por segmento cuantizado a
cuadros, fades de 30 ms en cada unión (sin clicks), punch-in opcional en los jump cuts del talking head, y el mismo
corte para el recorte de persona. Remapea palabras y caras al tiempo nuevo y deja controles para mirar.

Uso típico (en la carpeta de trabajo de la edición a fondo):
  python3 tools/cortar.py --proyecto proyecto.json --blobs blobs --vista            # transcript con IDs y pausas
  python3 tools/cortar.py --proyecto proyecto.json --blobs blobs --out corte \\
      [--ficha datos/referencias/1/ficha.json] [--quitar-frases 3,7] [--quitar-palabras 12-15,40] \\
      [--sin-silencios] [--sin-muletillas] [--sin-tomas] [--sin-ritmo] [--punch 1.1] [--aire 0.2] [--silencio 0.35]
  python3 tools/cortar.py --armar corte --proyecto proyecto.json --asset-video <id> [--asset-recorte <id>]
      → corte/proyecto_cortado.json: proyecto NUEVO (no pisa el original) listo para ArtifactData set.

Salidas en --out: plan.json (EDL y lo que salió, con motivo), cortado.mp4, recorte.mp4 (si hay recorte),
palabras.json y caras.json (tiempo nuevo), uniones.jpg (cuadros antes|después de cada unión: miralo), informe.txt.
Las herramientas de ffmpeg-skill se usan para el probe (dimensiones de display, fps, VFR) y para los planos de origen
(scenes.py). Solo biblioteca estándar + ffmpeg/ffprobe.
"""
import argparse, array, json, math, os, re, subprocess, sys, time, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(AQUI, '..', '.claude', 'skills', 'ffmpeg-skill', 'scripts')
FADE = 0.03            # HARD-RULES 10: 30 ms en cada unión
MARGEN_MIN, MARGEN_MAX = 0.03, 0.20   # HARD-RULES 9: 30 a 200 ms de aire en cada borde

# Muletillas: solo sonidos de duda. "este", "o sea", "bueno", "esto" son palabras reales casi siempre: "este" sale
# únicamente si está aislado entre pausas (ver es_muletilla). Nunca "esto" (ffmpeg-skill lo trae en su lista: acá no).
MULETILLAS = {'eh', 'ehh', 'eeh', 'ehm', 'em', 'emm', 'mm', 'mmm', 'hmm', 'ah', 'ahh', 'aah', 'uh', 'um', 'mmh'}
MULETILLAS_AISLADAS = {'este', 'eeste', 'esteee'}


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '', s)


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=kw.pop('text', True), **kw)


def probe(path):
    """Probe con ffmpeg-skill (HARD-RULES 1). Si la skill no está, ffprobe directo."""
    try:
        r = run([sys.executable, os.path.join(SKILL, 'probe.py'), path, '--json'])
        d = json.loads(r.stdout); v = d.get('video') or {}
        w, h = v.get('display_width') or v.get('width'), v.get('display_height') or v.get('height')
        if not v.get('display_width') and abs(int(v.get('rotation') or 0)) in (90, 270): w, h = h, w   # HARD-RULES 1: display, no stream
        fps = v.get('fps') or v.get('avg_fps') or v.get('frame_rate')
        if isinstance(fps, str) and '/' in fps: a, b = fps.split('/'); fps = float(a) / float(b)
        return {'w': int(w), 'h': int(h), 'fps': float(fps or 30), 'dur': float(d.get('duration') or 0),
                'vfr': bool(v.get('variable_frame_rate_suspected')), 'audio': bool(d.get('audio')), 'fuente': 'ffmpeg-skill'}
    except Exception:
        r = run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]); d = json.loads(r.stdout)
        v = next(s for s in d['streams'] if s['codec_type'] == 'video'); a, b = v['avg_frame_rate'].split('/')
        rot = abs(int((v.get('tags') or {}).get('rotate', 0) or 0)); w, h = v['width'], v['height']
        if rot in (90, 270): w, h = h, w
        return {'w': w, 'h': h, 'fps': float(a) / float(b or 1), 'dur': float(d['format']['duration']), 'vfr': False,
                'audio': any(s['codec_type'] == 'audio' for s in d['streams']), 'fuente': 'ffprobe'}


def planos_origen(path):
    """Cambios de plano del crudo con ffmpeg-skill scenes.py (lista de tiempos de corte)."""
    try:
        r = run([sys.executable, os.path.join(SKILL, 'scenes.py'), path, '--json'], timeout=600)
        sc = json.loads(r.stdout).get('scenes') or []
        return [round(s['start'], 3) for s in sc[1:]]
    except Exception as e:
        print('aviso: no pude medir los planos de origen (%s); sigo sin ellos' % e, file=sys.stderr); return []


def energia(path, hz=100):
    """RMS cada 10 ms del audio (mono 16 kHz) para ubicar cada borde en lo más callado del hueco."""
    raw = run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], text=False).stdout
    a = array.array('h'); a.frombytes(raw[:len(raw) // 2 * 2]); n = 16000 // hz
    return [math.sqrt(sum(x * x for x in a[i:i + n]) / max(1, len(a[i:i + n]))) for i in range(0, len(a), n)], hz


def lo_mas_callado(rms, hz, a, b, preferir):
    """Punto de menor energía en [a, b]; ante empate, el más cercano a `preferir`."""
    if b <= a: return (a + b) / 2
    i0, i1 = max(0, int(a * hz)), min(len(rms) - 1, int(b * hz))
    if i1 <= i0: return (a + b) / 2
    mejor = min(range(i0, i1 + 1), key=lambda i: (round(rms[i] / 50), abs(i / hz - preferir)))
    return max(a, min(b, (mejor + 0.5) / hz))


def silencio_sostenido(rms, hz, desde, hasta, hacia_atras=False, minimo=0.12):
    """Primer tramo de al menos `minimo` s (120 ms: más que el cierre de una p, t o k) por debajo del umbral, buscando desde `desde` hacia `hasta`.
    Las palabras terminan en consonantes con un cierre casi mudo antes de la última ráfaga ("startu|ps"): un hueco
    corto NO es el fin de la palabra. Devuelve el borde del silencio (inicio si va hacia adelante, fin si va hacia atrás)."""
    n = max(1, int(round(minimo * hz)))
    i0, i1 = int(desde * hz), int(hasta * hz)
    zona = rms[max(0, int(min(desde, hasta) * hz) - 30):int(max(desde, hasta) * hz) + 30] or [0]
    voz = sorted(zona)[int(len(zona) * 0.9)] if zona else 0
    piso = min(rms[min(i0, i1):max(i0, i1) + 1] or [0])
    umbral = max(piso * 2.5, voz * 0.12)
    paso = -1 if hacia_atras else 1
    i, corrida = i0, 0
    while (i >= i1) if hacia_atras else (i <= i1):
        if 0 <= i < len(rms) and rms[i] < umbral:
            corrida += 1
            if corrida >= n:
                inicio = i - paso * (n - 1)
                return inicio / hz if not hacia_atras else (inicio + 1) / hz
        else:
            corrida = 0
        i += paso
    return None


def frases(words, pausa=0.3):
    out, cur = [], []
    for i, w in enumerate(words):
        if cur and (w['s'] - words[cur[-1]]['e'] >= pausa or re.search(r'[.?!…]$', words[cur[-1]]['w'].strip())):
            out.append(cur); cur = []
        cur.append(i)
    if cur: out.append(cur)
    return out


def es_muletilla(words, i):
    t = norm(words[i]['w'])
    if t in MULETILLAS or re.fullmatch(r'e+h+|e+m+|m+h*|a+h+', t or 'x'): return True
    if t in MULETILLAS_AISLADAS:
        antes = words[i]['s'] - words[i - 1]['e'] if i else 9
        despues = words[i + 1]['s'] - words[i]['e'] if i + 1 < len(words) else 9
        return antes >= 0.2 and despues >= 0.2
    return False


def tomas_repetidas(words, F):
    """Falsos arranques y tomas repetidas: se queda con la ÚLTIMA. Devuelve {índice: motivo}."""
    fuera, toks = {}, [[norm(words[i]['w']) for i in f] for f in F]
    for a in range(len(F)):
        for b in (a + 1, a + 2):
            if b >= len(F) or any(i in fuera for i in F[a]): continue
            ta, tb = [t for t in toks[a] if t], [t for t in toks[b] if t]
            k = 0
            while k < min(len(ta), len(tb)) and ta[k] == tb[k]: k += 1
            prefijo = k >= 2 or (k >= 1 and len(ta) == 1)
            if prefijo and (k == len(ta) or k >= 3 or len(ta) <= len(tb)):
                # si hay una frase en el medio (b = a+2) solo vale si la del medio también es un arranque corto
                if b == a + 2 and len(toks[a + 1]) > 3: continue
                for f in F[a:b]:
                    for i in f: fuera[i] = 'toma repetida (quedó la última)'
                break
    # tartamudeo dentro de la frase: "el el parque", "lo que lo que" → sale la primera copia
    t = [norm(w['w']) for w in words]
    for i in range(len(words)):
        for k in (3, 2, 1):
            if i + 2 * k > len(words) or any(j in fuera for j in range(i, i + 2 * k)): continue
            if t[i:i + k] == t[i + k:i + 2 * k] and all(t[i:i + k]) and words[i + k]['s'] - words[i + k - 1]['e'] < 0.6:
                if k == 1 and len(t[i]) > 4: continue   # "muy muy", "nunca nunca": énfasis, se deja
                for j in range(i, i + k): fuera[j] = 'repetición'
                break
    return fuera


def rangos_ids(txt):
    out = set()
    for p in (txt or '').replace(' ', '').split(','):
        if not p: continue
        a, _, b = p.partition('-'); out.update(range(int(a), int(b or a) + 1))
    return out


def cara_en(caras, s, e):
    """Centro medio de la cara principal en [s, e] (coordenadas 0..1) y qué parte del tramo tiene cara."""
    m = [c for c in caras if s <= c['t'] <= e]
    con = [c['caras'][0] for c in m if c.get('caras')]
    if not m: return None, 0
    if not con: return None, 0
    big = lambda b: b[2] * b[3]
    cx = sum(b[0] + b[2] / 2 for b in con) / len(con); cy = sum(b[1] + b[3] / 2 for b in con) / len(con)
    return (cx, cy, max(big(b) for b in con)), len(con) / len(m)


def planear(P, info, rms, hz, cortes_origen, a):
    W = sorted([w for w in P.get('words') or [] if w.get('w', '').strip()], key=lambda w: w['s'])
    if not W: raise SystemExit('el proyecto no tiene transcripción con tiempos por palabra: no se puede cortar por palabras')
    dur = info['dur'] or P.get('duration') or W[-1]['e'] + 0.5
    F = frases(W)
    fuera = {}
    if not a.sin_muletillas:
        for i in range(len(W)):
            if es_muletilla(W, i): fuera[i] = 'muletilla'
    if not a.sin_tomas:
        for i, m in tomas_repetidas(W, F).items(): fuera.setdefault(i, m)
    for i in rangos_ids(a.quitar_palabras): fuera[i] = 'pedido'
    for fi in rangos_ids(a.quitar_frases):
        if 1 <= fi <= len(F):
            for i in F[fi - 1]: fuera[i] = 'pedido (frase F%d)' % fi
    for i in rangos_ids(a.mantener_palabras): fuera.pop(i, None)
    kept = [i for i in range(len(W)) if i not in fuera]
    if not kept: raise SystemExit('no queda ninguna palabra: revisá lo que pediste quitar')

    # tramos de palabras contiguas que se quedan; entre dos tramos (o en una pausa larga) va un corte
    segs, quitado, no_cortado = [], [], []
    inicio_w = kept[0]
    s0 = max(0.0, W[inicio_w]['s'] - (0.12 if W[inicio_w]['s'] > a.silencio else W[inicio_w]['s']))
    if s0 > 0.05: quitado.append({'s': 0.0, 'e': round(s0, 3), 'motivo': 'silencio inicial', 'texto': ''})
    cur_s, prev = s0, kept[0]
    for i in kept[1:]:
        A, B = W[prev], W[i]
        medio = [j for j in range(prev + 1, i)]
        gap = B['s'] - A['e']
        if medio or (gap > a.silencio and not a.sin_silencios):
            lim_a = W[medio[0]]['s'] if medio else B['s']; lim_b = W[medio[-1]]['e'] if medio else A['e']
            aire = a.aire / 2
            # fin real de la voz de A y comienzo real de la de B (por energía), y recién ahí el margen (HARD-RULES 8 y 9)
            # para sacar palabras alcanza un silencio más corto (la palabra que sale se lleva su propia cola)
            mini = 0.05 if medio else 0.12
            fin_a = silencio_sostenido(rms, hz, A['e'] - 0.02, (lim_a if medio else B['s']) - 0.01, minimo=mini)
            ini_b = silencio_sostenido(rms, hz, B['s'] + 0.02, (lim_b if medio else A['e']) + 0.01, hacia_atras=True, minimo=mini)
            if medio:
                if fin_a is not None and fin_a > lim_a: fin_a = None
                if ini_b is not None and ini_b < lim_b: ini_b = None
            fin_a = max(A['e'], fin_a) if fin_a is not None else None
            ini_b = min(B['s'], ini_b) if ini_b is not None else None
            if fin_a is None or ini_b is None or ini_b - fin_a < 2 * MARGEN_MIN:
                for j in medio:   # sin silencio de verdad no se corta: la palabra se queda (transcript y audio siempre iguales)
                    no_cortado.append({'id': j, 'w': W[j]['w'], 'motivo': fuera.pop(j)})
                prev = i; continue
            out_e = lo_mas_callado(rms, hz, fin_a + MARGEN_MIN, min(fin_a + max(aire, MARGEN_MIN + 0.02), ini_b - MARGEN_MIN), fin_a + aire)
            in_s = lo_mas_callado(rms, hz, max(ini_b - max(aire, MARGEN_MIN + 0.02), out_e), ini_b - MARGEN_MIN, ini_b - aire)
            if in_s - out_e >= (0.02 if medio else a.min_corte):   # un corte que saca casi nada es un salto sin ganancia
                segs.append([cur_s, out_e])
                txt = ' '.join(W[j]['w'] for j in medio)
                mot = sorted({fuera[j] for j in medio}) if medio else ['silencio']
                quitado.append({'s': round(out_e, 3), 'e': round(in_s, 3), 'motivo': ', '.join(mot), 'texto': txt})
                cur_s = in_s
        prev = i
    fin = min(dur, W[prev]['e'] + min(0.45, max(0.12, dur - W[prev]['e'])))
    segs.append([cur_s, fin])
    if dur - fin > 0.05: quitado.append({'s': round(fin, 3), 'e': round(dur, 3), 'motivo': 'cola', 'texto': ''})

    # cuantizar a cuadros: audio y video cortan exactamente en los mismos instantes (sin deriva entre segmentos)
    fps = info['fps']; q = lambda t: round(round(t * fps) / fps, 6)
    segs = [[q(s), q(e)] for s, e in segs if q(e) - q(s) >= 2 / fps]

    # ritmo: partir planos largos del talking head en jump cuts con punch-in, al ritmo de la ficha
    objetivo = None
    if a.ficha and not a.sin_ritmo:
        fi = json.load(open(a.ficha)); rp = fi.get('ritmo_planos') or {}
        objetivo = rp.get('mediana') or rp.get('media')
    caras = sorted(P.get('faces') or [], key=lambda c: c['t'])
    cortes_origen = sorted(cortes_origen)
    piezas = []   # [s, e, motivo_del_corte_de_entrada]
    for k, (s, e) in enumerate(segs):
        bordes = [s] + [c for c in cortes_origen if s + 0.2 < c < e - 0.2] + [e]
        for j in range(len(bordes) - 1):
            piezas.append([bordes[j], bordes[j + 1], 'plano' if j > 0 else ('inicio' if k == 0 else 'jump')])
    if objetivo:
        nuevas = []
        limite = max(1.6, objetivo * 1.6)
        for s, e, mot in piezas:
            cara, parte = cara_en(caras, s, e)
            if e - s <= limite or not cara or parte < 0.6:
                nuevas.append([s, e, mot]); continue
            # puntos posibles: fin de palabra seguido de pausa/coma/fin de frase dentro del tramo
            cand = []
            for i in kept:
                w = W[i]
                if s + 1.0 < w['e'] < e - 1.0:
                    nxt = next((W[j] for j in kept if W[j]['s'] >= w['e'] - 1e-6 and j > i), None)
                    pausa = (nxt['s'] - w['e']) if nxt else 0
                    peso = 2 if re.search(r'[,.;:?!]$', w['w'].strip()) else (1 if pausa > 0.12 else 0)
                    if peso: cand.append((w['e'] + min(pausa, 0.1) / 2, peso))
            cur = s
            while e - cur > limite:
                ideal = cur + objetivo * 1.15
                ops = [c for c in cand if cur + 1.0 <= c[0] <= e - 1.0]
                if not ops: break
                t, _ = min(ops, key=lambda c: abs(c[0] - ideal) - 0.35 * c[1])
                t = q(t)
                if t <= cur + 0.5: break
                nuevas.append([cur, t, mot if cur == s else 'ritmo']); cur = t; mot = 'ritmo'
            nuevas.append([cur, e, mot if cur == s else 'ritmo'])
        piezas = nuevas

    # punch-in: alterna 1.0 / punch en cada jump cut o corte de ritmo del mismo plano con cara; vuelve a 1.0 en cada plano nuevo
    out, zoom_prev, t_out = [], 1.0, 0.0
    for s, e, mot in piezas:
        cara, parte = cara_en(caras, s, e)
        if mot in ('inicio', 'plano') or not cara or parte < 0.6 or a.punch <= 1.0:
            z = 1.0
        else:
            z = a.punch if zoom_prev == 1.0 else 1.0
        cx, cy = (cara[0], cara[1] + 0.04) if cara else (0.5, 0.5)
        hw = 0.5 / z
        cx, cy = min(1 - hw, max(hw, cx)), min(1 - hw, max(hw, cy))
        out.append({'s': round(s, 6), 'e': round(e, 6), 'dur': round(e - s, 6), 'out_s': round(t_out, 6), 'zoom': z,
                    'cx': round(cx, 4), 'cy': round(cy, 4), 'entra_por': mot, 'cara': bool(cara and parte >= 0.6)})
        t_out += e - s; zoom_prev = z
    return W, F, fuera, out, quitado, objetivo, no_cortado


def remapear(W, fuera, segs, caras):
    def mapear(t):
        for g in segs:
            if g['s'] - 1e-6 <= t <= g['e'] + 1e-6: return g, t - g['s'] + g['out_s']
        return None, None
    palabras = []
    for i, w in enumerate(W):
        if i in fuera: continue
        g, ns = mapear(w['s'])
        if g is None: continue
        ne = min(w['e'], g['e']) - g['s'] + g['out_s']
        palabras.append({'w': w['w'], 's': round(ns, 3), 'e': round(max(ns + 0.05, ne), 3)})
    nuevas = []
    for g in segs:
        z, hw = g['zoom'], 0.5 / g['zoom']; x0, y0 = g['cx'] - hw, g['cy'] - hw
        tr = lambda b: [round((b[0] - x0) * z, 4), round((b[1] - y0) * z, 4), round(b[2] * z, 4), round(b[3] * z, 4)]
        dentro = [c for c in caras if g['s'] <= c['t'] < g['e']]
        if not dentro:   # una muestra al principio de cada segmento, para que la cámara no interpole a través del corte
            cerca = min(caras, key=lambda c: abs(c['t'] - g['s']), default=None)
            if cerca and abs(cerca['t'] - g['s']) < 0.6: dentro = [dict(cerca, t=g['s'])]
        for c in dentro:
            nuevas.append({'t': round(c['t'] - g['s'] + g['out_s'], 3), 'caras': [tr(b) for b in c.get('caras') or []]})
    return palabras, nuevas


def renderizar(fuente, segs, info, salida, con_audio=True, crf=19, ancho=None, alto=None):
    W_, H_ = ancho or info['w'], alto or info['h']; W_ -= W_ % 2; H_ -= H_ % 2
    partes, fc = [], []
    for k, g in enumerate(segs):
        v = f"[0:v]trim=start={g['s']:.6f}:end={g['e']:.6f},setpts=PTS-STARTPTS"
        if g['zoom'] > 1.0:
            cw, ch = W_ / g['zoom'], H_ / g['zoom']
            x, y = g['cx'] * W_ - cw / 2, g['cy'] * H_ - ch / 2
            v += f",scale={W_}:{H_},crop={cw:.2f}:{ch:.2f}:{x:.2f}:{y:.2f},scale={W_}:{H_}:flags=lanczos"
        else:
            v += f",scale={W_}:{H_}"
        fc.append(v + f",setsar=1,fps={info['fps']}[v{k}]")
        if con_audio:
            d = g['e'] - g['s']; f = min(FADE, d / 3)
            fc.append(f"[0:a]atrim=start={g['s']:.6f}:end={g['e']:.6f},asetpts=PTS-STARTPTS,aresample=48000,"
                      f"afade=t=in:st=0:d={f:.3f},afade=t=out:st={max(0, d - f):.6f}:d={f:.3f}[a{k}]")
            partes.append(f'[v{k}][a{k}]')
        else:
            partes.append(f'[v{k}]')
    fc.append(''.join(partes) + f"concat=n={len(segs)}:v=1:a={1 if con_audio else 0}" + ('[v][a]' if con_audio else '[v]'))
    fcfile = salida + '.filtro.txt'; open(fcfile, 'w').write(';\n'.join(fc))
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', fuente, '-filter_complex_script', fcfile, '-map', '[v]']
    if con_audio: cmd += ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k']
    cmd += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', salida]
    run(cmd); os.remove(fcfile)


def controles(salida, segs, out_dir, info):
    """Uniones: cuadro antes | después de cada corte (miralo con Read), saltos de audio en las uniones y duración."""
    rep = {'uniones': []}
    d = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', salida]).stdout)['streams']
    dv = next(float(s['duration']) for s in d if s['codec_type'] == 'video')
    da = next((float(s['duration']) for s in d if s['codec_type'] == 'audio'), dv)
    esperado = sum(g['dur'] for g in segs)
    rep['duracion'] = {'esperada': round(esperado, 3), 'video': round(dv, 3), 'audio': round(da, 3),
                       'ok': abs(dv - esperado) < 2 / info['fps'] and abs(da - dv) < 0.05}
    raw = run(['ffmpeg', '-v', 'error', '-i', salida, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], text=False).stdout
    a = array.array('h'); a.frombytes(raw[:len(raw) // 2 * 2])
    for g in segs[1:]:
        i = int(g['out_s'] * 48000)
        ventana = a[max(0, i - 48):i + 48]
        salto = max((abs(ventana[j + 1] - ventana[j]) for j in range(len(ventana) - 1)), default=0) / 32768
        rep['uniones'].append({'t': round(g['out_s'], 3), 'salto_audio': round(salto, 4), 'ok': salto < 0.08, 'entra_por': g['entra_por'], 'zoom': g['zoom']})
    # hoja de uniones: hasta 12, cada una cuadro antes | después
    sel = segs[1:13]
    if sel:
        tmp = os.path.join(out_dir, '_uniones'); os.makedirs(tmp, exist_ok=True); fr = []
        for k, g in enumerate(sel):
            for lado, t in (('a', max(0, g['out_s'] - 1.5 / info['fps'])), ('b', g['out_s'] + 0.5 / info['fps'])):
                f = os.path.join(tmp, f'{k:02d}{lado}.jpg')
                run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', salida, '-frames:v', '1', '-vf',
                     f"scale=200:-2,drawtext=text='{g['out_s']:.1f}s {lado}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6", f])
                fr.append(f)
        cols = 4
        lista = os.path.join(tmp, 'lista.txt'); open(lista, 'w').write(''.join(f"file '{f}'\n" for f in fr))
        filas = math.ceil(len(fr) / cols)
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-vf', f'tile={cols}x{filas}:padding=4:color=black', '-frames:v', '1', os.path.join(out_dir, 'uniones.jpg')])
        for f in fr: os.remove(f)
        os.remove(lista); os.rmdir(tmp)
    return rep


def retranscribir(salida, palabras, segs, modelo, out_dir):
    """HARD-RULES 21: vuelve a transcribir ±1,2 s alrededor de cada unión del archivo cortado y compara con lo esperado
    (las dos palabras de cada lado de la unión tienen que aparecer, en orden). Necesita faster-whisper y el modelo local."""
    try:
        from faster_whisper import WhisperModel
        import numpy as np
    except Exception:
        return {'hecho': False, 'motivo': 'falta faster-whisper (pip install --break-system-packages faster-whisper)'}
    m = WhisperModel(modelo, device='cpu', compute_type='int8')
    res = []
    for g in segs[1:]:
        t = g['out_s']; a, b = max(0, t - 1.2), t + 1.2
        # el audio va decodificado por ffmpeg como arreglo: el PyAV instalado puede no ser compatible con faster-whisper
        raw = run(['ffmpeg', '-v', 'error', '-ss', f'{a:.3f}', '-t', f'{b - a:.3f}', '-i', salida, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], text=False).stdout
        audio = np.frombuffer(raw[:len(raw) // 2 * 2], dtype=np.int16).astype(np.float32) / 32768
        segs_w, _ = m.transcribe(audio, language='es', word_timestamps=False, vad_filter=False, beam_size=3)
        oido = ' '.join(x.text.strip() for x in segs_w)
        antes = [w for w in palabras if a + 0.05 <= w['s'] and w['e'] <= t + 0.02][-2:]
        despues = [w for w in palabras if t - 0.02 <= w['s'] and w['e'] <= b - 0.05][:2]
        esperado = [norm(w['w']) for w in antes + despues]
        toks = [norm(x) for x in oido.split()]
        j, ok = 0, 0
        for e in esperado:   # en orden; una palabra que no aparece no consume el resto
            k = next((x for x in range(j, len(toks)) if toks[x] == e or (len(e) > 3 and e in toks[x])), None)
            if k is not None: ok += 1; j = k + 1
        res.append({'t': round(t, 3), 'esperado': ' '.join(w['w'] for w in antes) + ' | ' + ' '.join(w['w'] for w in despues),
                    'oido': oido, 'ok': ok >= len(esperado) - 1})
    return {'hecho': True, 'uniones': res, 'mal': [r for r in res if not r['ok']]}


def vista(W, F):
    print('# Transcript con IDs (palabra #n, frase F#). Pausas largas entre corchetes. Pedí cortes por ID, nunca por tiempo.')
    for k, f in enumerate(F, 1):
        antes = W[f[0]]['s'] - W[f[0] - 1]['e'] if f[0] else W[f[0]]['s']
        print(f"F{k:<3} {W[f[0]]['s']:6.2f}s  [{antes:.2f}]  " + ' '.join(f"{W[i]['w']}#{i}" for i in f))


def armar(a):
    P = json.load(open(a.proyecto)); plan = json.load(open(os.path.join(a.armar, 'plan.json')))
    palabras = json.load(open(os.path.join(a.armar, 'palabras.json'))); caras = json.load(open(os.path.join(a.armar, 'caras.json')))
    origen = P.get('cortes', {}).get('origen') or {'proyecto': P['id'], 'video': P.get('video')}
    base_id = origen['proyecto'] if isinstance(origen, dict) else P['id']
    nid = a.id or ('p' + base_id.lstrip('p')[:12] + 'c' + format(int(time.time()) % 46656, 'x'))
    N = json.loads(json.dumps(P))
    for k in ('deep', 'chat', 'motions', 'round', 'transcribe', '_wv', 'version', 'stage'):
        N.pop(k, None)
    dur = round(plan['duracion_nueva'], 3)
    v = dict(P['video']); v.pop('matte', None)
    v.update({'assetId': a.asset_video, 'duration': dur, 'name': (P['video'].get('name') or 'video').rsplit('.', 1)[0] + ' · cortado.mp4',
              'proxy': True, 'size': os.path.getsize(os.path.join(a.armar, 'cortado.mp4'))})
    if a.asset_recorte and P['video'].get('matte'):
        m = dict(P['video']['matte']); m['assetId'] = a.asset_recorte; v['matte'] = m
    nombre = re.sub(r'\s*·\s*cortado.*$', '', P.get('name') or 'Proyecto') + ' · cortado'
    now = int(time.time() * 1000)
    N.update({'id': nid, 'name': nombre, 'video': v, 'duration': dur, 'words': palabras, 'faces': caras, 'facesSpace': P.get('facesSpace', 'video'),
              'motions': [], 'chat': [], 'round': 1, '_wv': 1, 'transcribe': {'state': 'listo', 'at': now}, 'stage': 'editor',
              'created': now, 'updated': now,
              'cortes': {'origen': origen, 'quitado_s': plan['quitado_s'], 'segmentos': len(plan['segmentos']), 'resumen': plan['resumen'], 'at': now}})
    dst = os.path.join(a.armar, 'proyecto_cortado.json'); json.dump(N, open(dst, 'w'), ensure_ascii=False)
    print(json.dumps({'proyecto': nid, 'nombre': nombre, 'archivo': dst, 'duracion': dur}, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--proyecto', required=True, help='project.json (words, faces, video)')
    ap.add_argument('--blobs', help='carpeta con <assetId>.mp4 del video y del recorte')
    ap.add_argument('--video', help='video fuente (si no, blobs/<video.assetId>.*)')
    ap.add_argument('--recorte', help='recorte de persona (si no, blobs/<video.matte.assetId>.*)')
    ap.add_argument('--out', default='corte'); ap.add_argument('--vista', action='store_true')
    ap.add_argument('--ficha', help='ficha.json de la referencia: su duración de plano marca el ritmo de los jump cuts')
    ap.add_argument('--quitar-frases', default=''); ap.add_argument('--quitar-palabras', default=''); ap.add_argument('--mantener-palabras', default='')
    ap.add_argument('--sin-silencios', action='store_true'); ap.add_argument('--sin-muletillas', action='store_true')
    ap.add_argument('--sin-tomas', action='store_true'); ap.add_argument('--sin-ritmo', action='store_true')
    ap.add_argument('--silencio', type=float, default=0.35, help='pausa entre palabras a partir de la cual se corta (s)')
    ap.add_argument('--min-corte', type=float, default=0.15, help='un silencio se corta solo si salen al menos estos segundos')
    ap.add_argument('--aire', type=float, default=0.2, help='aire total que queda entre las dos palabras de un corte (s)')
    ap.add_argument('--punch', type=float, default=1.1, help='zoom del punch-in en los jump cuts del talking head (1 = sin punch-in)')
    ap.add_argument('--modelo', help='carpeta del modelo Whisper local: retranscribe ±1,2 s en cada unión y compara (HARD-RULES 21)')
    ap.add_argument('--solo-plan', action='store_true', help='no renderiza: solo plan.json e informe')
    ap.add_argument('--armar', help='carpeta de un corte ya hecho: arma el proyecto nuevo con los assetId subidos')
    ap.add_argument('--asset-video'); ap.add_argument('--asset-recorte'); ap.add_argument('--id')
    a = ap.parse_args()
    if a.armar:
        if not a.asset_video: raise SystemExit('--armar necesita --asset-video (el id que devolvió la subida de cortado.mp4)')
        return armar(a)

    P = json.load(open(a.proyecto))
    def buscar(aid):
        if not (aid and a.blobs): return None
        return next((os.path.join(a.blobs, f) for f in os.listdir(a.blobs) if f == aid or f.startswith(aid + '.')), None)
    fuente = a.video or buscar((P.get('video') or {}).get('assetId'))
    if a.vista:
        W = sorted([w for w in P.get('words') or [] if w.get('w', '').strip()], key=lambda w: w['s']); return vista(W, frases(W))
    if not fuente or not os.path.exists(fuente): raise SystemExit('no encuentro el video: pasá --video o --blobs con <assetId>.mp4')
    matte = a.recorte or buscar(((P.get('video') or {}).get('matte') or {}).get('assetId'))
    os.makedirs(a.out, exist_ok=True)
    info = probe(fuente)
    if info['vfr']: print('aviso: el crudo parece de cuadros variables; el corte lo pasa a %.3f fps constantes' % info['fps'], file=sys.stderr)
    rms, hz = energia(fuente)
    cortes_origen = planos_origen(fuente)
    W, F, fuera, segs, quitado, objetivo, no_cortado = planear(P, info, rms, hz, cortes_origen, a)
    palabras, caras = remapear(W, fuera, segs, sorted(P.get('faces') or [], key=lambda c: c['t']))
    dur_n = sum(g['dur'] for g in segs)
    cuenta = {}
    for q in quitado:
        for m in q['motivo'].split(', '):
            m = re.sub(r' \(.*\)', '', m); cuenta[m] = cuenta.get(m, 0) + 1
    jumps = sum(1 for g in segs if g['entra_por'] == 'jump'); ritmo = sum(1 for g in segs if g['entra_por'] == 'ritmo')
    punch = sum(1 for g in segs if g['zoom'] > 1)
    resumen = (f"Corte: de {info['dur']:.1f} s a {dur_n:.1f} s (−{info['dur'] - dur_n:.1f} s). Salieron " +
               (', '.join(f'{v} {k}' + ('s' if v > 1 and not k.endswith('s') else '') for k, v in cuenta.items()) or 'nada') +
               f". {len(segs)} tramos: {jumps} jump cuts" + (f", {ritmo} cortes de ritmo (plano objetivo {objetivo:.1f} s)" if objetivo else '') +
               (f", punch-in {a.punch:.2f} en {punch}" if punch else '') + '.')
    plan = {'fuente': os.path.basename(fuente), 'probe': info, 'planos_origen': cortes_origen, 'ficha': a.ficha, 'plano_objetivo': objetivo,
            'segmentos': segs, 'quitado': quitado, 'palabras_quitadas': [{'id': i, 'w': W[i]['w'], 'motivo': m} for i, m in sorted(fuera.items())], 'no_cortado': no_cortado,
            'duracion_original': info['dur'], 'duracion_nueva': round(dur_n, 3), 'quitado_s': round(info['dur'] - dur_n, 3), 'resumen': resumen}
    json.dump(plan, open(os.path.join(a.out, 'plan.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(palabras, open(os.path.join(a.out, 'palabras.json'), 'w'), ensure_ascii=False)
    json.dump(caras, open(os.path.join(a.out, 'caras.json'), 'w'))
    if no_cortado:
        resumen += ' No saqué (sin silencio para cortar sin comerse una palabra): ' + ', '.join(f"«{x['w']}» #{x['id']}" for x in no_cortado) + '.'
    lineas = [resumen, ''] + [f"  − {q['s']:6.2f}–{q['e']:6.2f}  {q['motivo']}" + (f"  «{q['texto']}»" if q['texto'] else '') for q in quitado]
    lineas += [''] + [f"  tramo {k + 1:2d}: {g['s']:6.2f}–{g['e']:6.2f} → {g['out_s']:6.2f}  {g['entra_por']:<6} zoom {g['zoom']:.2f}" for k, g in enumerate(segs)]
    if a.solo_plan:
        open(os.path.join(a.out, 'informe.txt'), 'w').write('\n'.join(lineas) + '\n'); print('\n'.join(lineas)); return
    t0 = time.time()
    salida = os.path.join(a.out, 'cortado.mp4')
    renderizar(fuente, segs, info, salida, con_audio=info['audio'])
    if os.path.getsize(salida) > 18.5e6:   # los recursos de la Sala tienen que pesar menos de ~19 MB
        renderizar(fuente, segs, info, salida, con_audio=info['audio'], crf=23)
    if matte:
        mi = probe(matte); mi['audio'] = False
        renderizar(matte, segs, mi, os.path.join(a.out, 'recorte.mp4'), con_audio=False, crf=20)
    rep = controles(salida, segs, a.out, info)
    malas = [u for u in rep['uniones'] if not u['ok']]
    lineas += ['', f"Controles: duración {'ok' if rep['duracion']['ok'] else 'MAL'} ({rep['duracion']}), " +
               f"{len(rep['uniones'])} uniones, {len(malas)} con salto de audio" + (f": {[u['t'] for u in malas]}" if malas else '') +
               f". Mirá uniones.jpg. Render en {time.time() - t0:.0f} s."]
    if a.modelo:
        rt = retranscribir(salida, palabras, segs, a.modelo, a.out); rep['retranscripcion'] = rt
        if rt.get('hecho'):
            lineas.append(f"Retranscripción de las uniones: {len(rt['uniones']) - len(rt['mal'])}/{len(rt['uniones'])} bien" +
                          ''.join(f"\n  ¡ojo! {r['t']:.2f}s esperaba «{r['esperado']}» y se oye «{r['oido']}»" for r in rt['mal']))
        else: lineas.append('Retranscripción no hecha: ' + rt['motivo'])
    plan['controles'] = rep; json.dump(plan, open(os.path.join(a.out, 'plan.json'), 'w'), ensure_ascii=False, indent=1)
    open(os.path.join(a.out, 'informe.txt'), 'w').write('\n'.join(lineas) + '\n')
    print('\n'.join(lineas))


if __name__ == '__main__':
    main()
