"""Ficha de cada referencia: el molde para "editalo como esta referencia".

uso (Windows):  py local\\ficha_referencia.py [--base "C:\\Users\\usr\\Videos\\Sala de Montaje"] [--idioma es] [video ...]
Para cada video de <base>\\referencias (si la carpeta no existe, la crea vacía):
  1. probe: duración, fps (avisa si es variable), tamaño de pantalla real (con rotación), audio;
  2. transcribe con faster-whisper local, tiempo por palabra, idioma fijo (nunca autodetecta);
  3. detecta los cortes con PySceneDetect y mide la duración de cada plano;
  4. mide el ritmo del habla: palabras por segundo y bloques (frases separadas por pausas) con su duración;
  5. arma una tira liviana (JPG) con los momentos clave: el arranque, cada plano y el final.
Escribe datos/referencias/<nombre>/ficha.json, ficha.md y tira.jpg, más datos/referencias/indice.md.
Nunca copia el video al repo. Lo que no cambió no se vuelve a procesar (--forzar para rehacer).
"""
import argparse, datetime, os, re, subprocess, sys, time, unicodedata

import numpy as np

from comun import DATOS, VIDEO, base_por_defecto, consola_utf8, exigir_ffmpeg, firma, guardar_json, leer_audio, leer_json, probe

VERSION = 1
PAUSA_BLOQUE = 0.30   # silencio entre palabras que separa un bloque de otro (s)
PAUSA_MIN = 0.25      # silencio que cuenta como pausa en las estadísticas (s)
FIN_FRASE = re.compile(r'[.!?…]$')


def r(x, n=2):
    return None if x is None else round(float(x), n)


def slug(nombre):
    s = unicodedata.normalize('NFKD', nombre).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'referencia'


def stats(xs):
    if not xs:
        return None
    a = np.array(xs, dtype=float)
    return {'n': int(a.size), 'media': r(a.mean()), 'mediana': r(np.median(a)), 'min': r(a.min()), 'max': r(a.max())}


def fps_de(txt):
    try:
        n, d = txt.split('/')
        return float(n) / float(d) if float(d) else None
    except (ValueError, AttributeError):
        return None


def leer_formato(path):
    p = probe(path)
    v = next((s for s in p['streams'] if s.get('codec_type') == 'video'), None)
    a = next((s for s in p['streams'] if s.get('codec_type') == 'audio'), None)
    if not v:
        raise ValueError('no tiene video')
    rot = 0
    for sd in v.get('side_data_list', []) or []:
        if 'rotation' in sd:
            rot = int(float(sd['rotation']))
    rot = rot or int(float((v.get('tags') or {}).get('rotate', 0) or 0))
    w, h = int(v['width']), int(v['height'])
    if abs(rot) % 180 == 90:
        w, h = h, w  # el celular guarda la rotación aparte: el tamaño de pantalla es el girado
    fr, avg = fps_de(v.get('r_frame_rate')), fps_de(v.get('avg_frame_rate'))
    fps = avg or fr
    dur = float(p['format'].get('duration') or v.get('duration') or 0)
    return {
        'dur': r(dur), 'ancho': w, 'alto': h, 'rotacion': rot, 'fps': r(fps, 3),
        'fps_variable': bool(fr and avg and abs(fr - avg) > 0.5),
        'orientacion': 'vertical' if h > w else ('horizontal' if w > h else 'cuadrado'),
        'aspecto': f'{w // np.gcd(w, h)}:{h // np.gcd(w, h)}',
        'video_codec': v.get('codec_name'),
        'audio': {'canales': a.get('channels'), 'hz': int(a.get('sample_rate', 0) or 0), 'codec': a.get('codec_name')} if a else None,
    }


def transcribir(path, modelo, idioma, cache):
    if cache:
        return cache
    from faster_whisper import WhisperModel
    audio = leer_audio(path, 16000)
    if audio.size < 1600:
        return {'idioma': idioma, 'palabras': [], 'segmentos': []}
    m = WhisperModel(modelo, device='cpu', compute_type='int8')
    segs, info = m.transcribe(audio, language=idioma, word_timestamps=True, vad_filter=True, beam_size=5)
    palabras, segmentos = [], []
    for s in segs:
        segmentos.append({'s': r(s.start, 3), 'e': r(s.end, 3), 'texto': s.text.strip()})
        for w in s.words or []:
            t = w.word.strip()
            if t:
                palabras.append({'w': t, 's': r(w.start, 3), 'e': r(w.end, 3), 'p': r(w.probability)})
    return {'idioma': info.language, 'palabras': palabras, 'segmentos': segmentos}


def detectar_planos(path, dur, umbral, min_plano):
    from scenedetect import ContentDetector, detect
    escenas = detect(path, ContentDetector(threshold=umbral, min_scene_len=max(2, int(min_plano))), show_progress=False)
    seg = lambda tc: tc.seconds if hasattr(type(tc), 'seconds') else tc.get_seconds()
    planos = [(seg(e[0]), seg(e[1])) for e in escenas]
    if not planos:
        planos = [(0.0, dur)]
    return [{'id': i + 1, 's': r(s), 'e': r(e), 'dur': r(e - s)} for i, (s, e) in enumerate(planos)]


def bloques_de_habla(palabras):
    """Agrupa las palabras en bloques: se corta en cada pausa de PAUSA_BLOQUE o más y en cada fin de oración."""
    bloques, actual = [], []
    for i, w in enumerate(palabras):
        actual.append(w)
        sig = palabras[i + 1] if i + 1 < len(palabras) else None
        if sig is None or sig['s'] - w['e'] >= PAUSA_BLOQUE or FIN_FRASE.search(w['w']):
            bloques.append(actual)
            actual = []
    out = []
    for i, b in enumerate(bloques):
        s, e = b[0]['s'], b[-1]['e']
        out.append({'id': i + 1, 's': r(s), 'e': r(e), 'dur': r(e - s), 'palabras': len(b),
                    'pal_s': r(len(b) / (e - s), 1) if e > s else None, 'texto': ' '.join(w['w'] for w in b)})
    return out


def ritmo(palabras, bloques, dur):
    if not palabras:
        return {'palabras': 0, 'nota': 'sin habla detectada'}
    hablando = sum(b['dur'] for b in bloques)
    pausas = [palabras[i + 1]['s'] - palabras[i]['e'] for i in range(len(palabras) - 1)]
    pausas = [p for p in pausas if p >= PAUSA_MIN]
    return {
        'palabras': len(palabras),
        'primera_palabra': r(palabras[0]['s']),
        'ultima_palabra': r(palabras[-1]['e']),
        'pal_s_hablando': r(len(palabras) / hablando, 2) if hablando else None,
        'pal_s_total': r(len(palabras) / dur, 2) if dur else None,
        'tiempo_hablando': r(hablando),
        'parte_hablada': r(hablando / dur) if dur else None,
        'bloques': len(bloques),
        'palabras_por_bloque': stats([b['palabras'] for b in bloques]),
        'dur_bloque': stats([b['dur'] for b in bloques]),
        'pausas': stats(pausas) or {'n': 0},
    }


def dicho_en(palabras, t, ventana=1.2):
    return ' '.join(w['w'] for w in palabras if w['e'] >= t - ventana / 2 and w['s'] <= t + ventana / 2)


def momentos_clave(planos, dur, maximo):
    ts = [(min(0.3, dur / 2), 'arranque')]
    for p in planos:
        ts.append((p['s'] + min(p['dur'] / 2, 0.6), 'entra el plano'))
    ts.append((max(dur - 0.3, 0), 'final'))
    if len(ts) < 6:  # pocos planos: se suman cuadros parejos para ver qué pasa dentro de cada uno
        ts += [(dur * k / 7, 'medio') for k in range(1, 7)]
    ts.sort()
    limpios = []
    for t, q in ts:
        if not limpios or t - limpios[-1][0] >= 0.4:
            limpios.append((t, q))
    if len(limpios) > maximo:  # se reparte parejo, siempre con el arranque y el final
        idx = np.round(np.linspace(0, len(limpios) - 1, maximo)).astype(int)
        limpios = [limpios[i] for i in sorted(set(idx))]
    return limpios


def cuadro(path, t, alto):
    import cv2
    out = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-ss', f'{t:.3f}', '-i', path, '-frames:v', '1',
                          '-vf', f'scale=-2:{alto}', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
    if not out:
        return None
    return cv2.imdecode(np.frombuffer(out, np.uint8), cv2.IMREAD_COLOR)


def armar_tira(path, momentos, planos, destino, alto, calidad):
    import cv2
    tiles = []
    for t, que in momentos:
        img = cuadro(path, t, alto)
        if img is None:
            continue
        plano = next((p['id'] for p in planos if p['s'] <= t < p['e']), planos[-1]['id'])
        etiqueta = np.full((26, img.shape[1], 3), 18, np.uint8)
        cv2.putText(etiqueta, f'{t:.1f}s  P{plano}', (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (235, 235, 235), 1, cv2.LINE_AA)
        tiles.append(np.vstack([img, etiqueta]))
    if not tiles:
        return False
    th, tw = max(x.shape[0] for x in tiles), max(x.shape[1] for x in tiles)
    tiles = [cv2.copyMakeBorder(x, 0, th - x.shape[0], 0, tw - x.shape[1], cv2.BORDER_CONSTANT, value=(18, 18, 18)) for x in tiles]
    maxc = 8 if tw < th else 4
    cols = -(-len(tiles) // -(-len(tiles) // maxc))  # filas parejas, sin un cuadro huérfano abajo
    filas = []
    for i in range(0, len(tiles), cols):
        fila = tiles[i:i + cols]
        fila += [np.full_like(tiles[0], 18)] * (cols - len(fila))
        filas.append(np.hstack([cv2.copyMakeBorder(x, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(18, 18, 18)) for x in fila]))
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    return cv2.imwrite(destino, np.vstack(filas), [cv2.IMWRITE_JPEG_QUALITY, calidad, cv2.IMWRITE_JPEG_OPTIMIZE, 1])


def n(x, dec=1):
    """Número en castellano (coma decimal) para el markdown."""
    return '–' if x is None else f'{x:.{dec}f}'.replace('.', ',')


def escribir_md(f, destino):
    fo, pl, rt = f['formato'], f['planos'], f['ritmo_habla']
    dp = f['ritmo_planos']
    modelo = os.path.basename(f['transcripcion']['modelo'].rstrip('/\\'))
    L = [f'# Ficha de referencia · {f["nombre"]}', '',
         f'Archivo `{f["archivo"]}` · {n(fo["dur"])} s · {fo["ancho"]}×{fo["alto"]} {fo["orientacion"]} ({fo["aspecto"]}) · '
         f'{n(fo["fps"], 2)} fps{" (VARIABLE)" if fo["fps_variable"] else ""} · '
         + (f'audio {fo["audio"]["canales"]} canal(es)' if fo['audio'] else 'sin audio'), '',
         f'Generada el {f["generado"][:10]} · transcripción {modelo}, idioma `{f["transcripcion"]["idioma"]}` · '
         f'cortes con umbral {f["parametros"]["umbral"]}.', '',
         '## Ritmo en una mirada', '']
    if dp:
        L.append(f'- **Planos:** {dp["n"]}, uno cada {n(dp["media"])} s de media (mediana {n(dp["mediana"])} s, de {n(dp["min"])} a '
                 f'{n(dp["max"])} s) · {n(f["cortes_por_min"])} cortes por minuto.')
    if rt.get('palabras'):
        pb, db = rt['palabras_por_bloque'], rt['dur_bloque']
        L += [f'- **Habla:** {rt["palabras"]} palabras · {n(rt["pal_s_hablando"], 2)} palabras/s mientras habla '
              f'({n(rt["pal_s_total"], 2)} sobre el total) · habla el {round((rt["parte_hablada"] or 0) * 100)}% del video · '
              f'primera palabra a los {n(rt["primera_palabra"], 2)} s.',
              f'- **Bloques** (frases separadas por pausas de {n(PAUSA_BLOQUE, 2)} s o fin de oración): {rt["bloques"]}, '
              f'{n(pb["mediana"])} palabras y {n(db["mediana"])} s de mediana (de {n(db["min"])} a {n(db["max"])} s).',
              f'- **Pausas** de {n(PAUSA_MIN, 2)} s o más: {rt["pausas"]["n"]}'
              + (f', mediana {n(rt["pausas"]["mediana"], 2)} s, la más larga {n(rt["pausas"]["max"], 2)} s.' if rt['pausas']['n'] else '.')]
    else:
        L.append('- **Habla:** no se detectó voz.')
    L += ['', '## Planos', '', '| # | inicio | fin | dura | qué se dice |', '| --- | --- | --- | --- | --- |']
    for p in pl:
        L.append(f'| {p["id"]} | {n(p["s"], 2)} | {n(p["e"], 2)} | {n(p["dur"], 2)} | {p.get("dicho", "")} |')
    if f['bloques']:
        L += ['', '## Bloques de habla', '', '| # | inicio | dura | palabras | pal/s | texto |', '| --- | --- | --- | --- | --- | --- |']
        for b in f['bloques']:
            L.append(f'| {b["id"]} | {n(b["s"], 2)} | {n(b["dur"], 2)} | {b["palabras"]} | {n(b["pal_s"])} | {b["texto"]} |')
    L += ['', '## Tira de momentos clave', '', '![tira](tira.jpg)', '']
    for m in f['tira']['momentos']:
        L.append(f'- {n(m["t"])} s · {m["que"]} · plano {m["plano"]}' + (f' · "{m["dicho"]}"' if m['dicho'] else ''))
    L += ['', '## Cómo usarla', '',
          '- Los números son de la referencia: sirven de molde para el ritmo de cortes y de habla.',
          '- Los bloques salen del habla, no de los subtítulos quemados en el video (no se leen). Para ver cómo están '
          'puestos los subtítulos, mirá la tira.',
          '- Movimientos de cámara y estilo de subtítulos no se copian solos: se proponen en el plan que aprueba Juani.', '']
    with open(destino, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(L))


def procesar(path, a, carpeta_ref):
    nombre = os.path.splitext(os.path.basename(path))[0]
    dest = os.path.join(a.salida, slug(nombre))
    fjson = os.path.join(dest, 'ficha.json')
    ant = leer_json(fjson)
    fi = firma(path)
    params = {'umbral': a.umbral, 'frames': a.frames, 'version': VERSION}
    mismo_audio = ant and ant.get('firma') == fi and ant.get('transcripcion', {}).get('modelo') == a.modelo \
        and ant.get('transcripcion', {}).get('idioma') == a.idioma
    if mismo_audio and ant.get('parametros') == params and not a.forzar:
        print(f'  {nombre}: sin cambios')
        return ant
    t0 = time.time()
    fo = leer_formato(path)
    if fo['fps_variable']:
        print(f'  ATENCIÓN: {nombre} tiene fps variable; los tiempos son de reloj, no de cuadro.')
    cache = None
    if mismo_audio and not a.forzar:  # solo cambiaron los parámetros de cortes o tira: no se retranscribe
        cache = {'idioma': a.idioma, 'palabras': ant['palabras'], 'segmentos': ant.get('segmentos', [])}
    if not fo['audio']:
        print(f'  {nombre}: no tiene audio, se mide solo el corte')
    else:
        print(f'  {nombre}: transcribiendo…' if not cache else f'  {nombre}: reusando la transcripción')
    if not fo['audio']:
        cache = {'idioma': a.idioma, 'palabras': [], 'segmentos': []}
    tr = transcribir(path, a.modelo, a.idioma, cache)
    palabras = tr['palabras']
    print(f'  {nombre}: detectando cortes…')
    planos = detectar_planos(path, fo['dur'], a.umbral, (fo['fps'] or 30) * a.min_plano)
    for p in planos:
        p['dicho'] = ' '.join(w['w'] for w in palabras if p['s'] <= (w['s'] + w['e']) / 2 < p['e'])
    bloques = bloques_de_habla(palabras)
    momentos = momentos_clave(planos, fo['dur'], a.frames)
    ok = armar_tira(path, momentos, planos, os.path.join(dest, 'tira.jpg'), a.alto, a.calidad)
    f = {
        'nombre': nombre, 'archivo': os.path.relpath(path, a.base).replace(os.sep, '/'), 'firma': fi,
        'generado': datetime.datetime.now().isoformat(timespec='seconds'), 'parametros': params,
        'formato': fo,
        'transcripcion': {'modelo': a.modelo, 'idioma': a.idioma, 'motor': 'faster-whisper', 'tiempo_por_palabra': True},
        'ritmo_planos': stats([p['dur'] for p in planos]),
        'cortes_por_min': r((len(planos) - 1) / fo['dur'] * 60, 1) if fo['dur'] else None,
        'ritmo_habla': ritmo(palabras, bloques, fo['dur']),
        'planos': planos, 'bloques': bloques,
        'tira': {'archivo': 'tira.jpg' if ok else None, 'momentos': [
            {'t': r(t), 'que': q, 'plano': next((p['id'] for p in planos if p['s'] <= t < p['e']), planos[-1]['id']),
             'dicho': dicho_en(palabras, t)} for t, q in momentos]},
        'palabras': palabras, 'segmentos': tr['segmentos'],
    }
    guardar_json(fjson, f)
    escribir_md(f, os.path.join(dest, 'ficha.md'))
    kb = os.path.getsize(os.path.join(dest, 'tira.jpg')) / 1024 if ok else 0
    print(f'  {nombre}: {len(planos)} planos, {len(palabras)} palabras, tira {kb:.0f} KB, {time.time() - t0:.0f} s -> {dest}')
    return f


def escribir_indice(salida):
    fichas = []
    for d in sorted(os.listdir(salida)) if os.path.isdir(salida) else []:
        f = leer_json(os.path.join(salida, d, 'ficha.json'))
        if f:
            fichas.append((d, f))
    L = ['# Referencias', '', 'Una ficha por video de `referencias`. Generado por `local/ficha_referencia.py`.', '',
         '| referencia | dura | formato | planos | corte cada | pal/s hablando | palabras por bloque |', '| --- | --- | --- | --- | --- | --- | --- |']
    for d, f in fichas:
        fo, rp, rh = f['formato'], f['ritmo_planos'] or {}, f['ritmo_habla']
        L.append(f'| [{f["nombre"]}]({d}/ficha.md) | {n(fo["dur"])} s | {fo["orientacion"]} {fo["aspecto"]} | {rp.get("n", "–")} | '
                 f'{n(rp.get("media"))} s | {n(rh.get("pal_s_hablando"), 2)} | {n((rh.get("palabras_por_bloque") or {}).get("mediana"))} |')
    with open(os.path.join(salida, 'indice.md'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(L) + '\n')


def main():
    consola_utf8()
    ap = argparse.ArgumentParser(description='Fichas de referencias de la Sala de Montaje')
    ap.add_argument('videos', nargs='*', help='procesar solo estos (nombre o ruta); sin nada, todos los de referencias')
    ap.add_argument('--base', default=base_por_defecto(), help='carpeta base del material (o variable SALA_BASE)')
    ap.add_argument('--referencias', default='referencias', help='subcarpeta de referencias, relativa a la base o absoluta')
    ap.add_argument('--salida', default=os.path.join(DATOS, 'referencias'), help='carpeta donde van las fichas')
    ap.add_argument('--idioma', default='es', help='idioma fijo del habla (nunca se autodetecta)')
    ap.add_argument('--modelo', default='small', help='modelo de faster-whisper (tiny, base, small, medium, large-v3) o carpeta local')
    ap.add_argument('--umbral', type=float, default=27.0, help='sensibilidad de cortes de PySceneDetect (más bajo = más cortes)')
    ap.add_argument('--min-plano', type=float, default=0.25, help='plano más corto que se acepta (s)')
    ap.add_argument('--frames', type=int, default=16, help='cuadros como máximo en la tira')
    ap.add_argument('--alto', type=int, default=240, help='alto de cada cuadro de la tira (px)')
    ap.add_argument('--calidad', type=int, default=70, help='calidad JPG de la tira (1-100)')
    ap.add_argument('--forzar', action='store_true', help='rehace todo aunque no haya cambiado')
    a = ap.parse_args()
    exigir_ffmpeg()
    carpeta = a.referencias if os.path.isabs(a.referencias) else os.path.join(a.base, a.referencias)
    if not os.path.isdir(carpeta):
        os.makedirs(carpeta, exist_ok=True)
        print(f'Creé la carpeta {carpeta}: poné ahí los videos de referencia y volvé a correr esto.')
        return 0
    if a.videos:
        rutas = [v if os.path.isfile(v) else os.path.join(carpeta, v) for v in a.videos]
    else:
        rutas = sorted(os.path.join(dp, f) for dp, _, fs in os.walk(carpeta) for f in fs if f.lower().endswith(VIDEO))
    if not rutas:
        print(f'No hay videos en {carpeta}.')
        return 0
    print(f'{len(rutas)} referencia(s) en {carpeta}')
    errores = 0
    for p in rutas:
        try:
            procesar(p, a, carpeta)
        except Exception as e:  # una referencia rota no frena el resto
            errores += 1
            print(f'  ERROR {os.path.basename(p)}: {e}')
    os.makedirs(a.salida, exist_ok=True)
    escribir_indice(a.salida)
    print(f'Listo: {len(rutas) - errores} ficha(s), {errores} con error -> {a.salida}')
    return 1 if errores else 0


if __name__ == '__main__':
    sys.exit(main())
