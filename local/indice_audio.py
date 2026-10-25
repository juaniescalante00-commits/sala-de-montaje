"""Índice de música y SFX: una tabla para que Claude elija la música y los sonidos por datos, no a ciegas.

uso (Windows):  py local\\indice_audio.py [--base "C:\\Users\\usr\\Videos\\Sala de Montaje"] [--musica Música] [--sfx Sonidos]
Recorre las carpetas de música y SFX y a cada archivo le saca duración, tempo (BPM), energía, golpes, tonalidad y una
etiqueta de clima. Escribe datos/audio/indice.csv y datos/audio/indice.json en el repo (nunca copia los audios).
Lo que no cambió desde la corrida anterior no se vuelve a analizar (--forzar para rehacer todo).
El doc_id es el mismo que usa tools/sync_library.py, así cada fila se cruza con library/<doc_id> del editor.
Las etiquetas de clima salen de reglas simples sobre los números: orientan, no reemplazan escuchar.
"""
import argparse, csv, datetime, os, sys, time

import numpy as np

from comun import AUDIO, DATOS, base_por_defecto, consola_utf8, doc_id, exigir_ffmpeg, firma, guardar_json, leer_audio, leer_json

SR = 22050
HOP = 512
NOTAS = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
# Perfiles de Krumhansl-Kessler para estimar tonalidad mayor/menor.
MAYOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MENOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
COLUMNAS = ['tipo', 'carpeta', 'nombre', 'dur', 'bpm', 'energia', 'dinamica_db', 'clima', 'etiquetas', 'tonalidad',
            'golpe_principal', 'golpes', 'brillo_hz', 'archivo', 'doc_id']


def r(x, n=2):
    return round(float(x), n)


def tonalidad(y):
    import librosa
    croma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP * 4).mean(axis=1)
    if croma.sum() <= 0:
        return None, None
    mej = (-2, None, None)
    for modo, perfil in (('mayor', MAYOR), ('menor', MENOR)):
        for i in range(12):
            c = np.corrcoef(croma, np.roll(perfil, i))[0, 1]
            if c > mej[0]:
                mej = (c, i, modo)
    c, i, modo = mej
    return f'{NOTAS[i]} {modo}', r(c)


def golpes_fuertes(env, k, separacion_s):
    """Los k picos de ataque más fuertes, separados al menos separacion_s, en orden de tiempo."""
    import librosa
    picos = librosa.util.peak_pick(env, pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=float(np.std(env)) * 0.5, wait=2)
    picos = sorted(picos, key=lambda p: -env[p])
    sep = int(separacion_s * SR / HOP)
    elegidos = []
    for p in picos:
        if all(abs(p - q) >= sep for q in elegidos):
            elegidos.append(p)
        if len(elegidos) >= k:
            break
    return sorted(r(p * HOP / SR) for p in elegidos)


def clima_musica(f):
    e, bpm, menor, brillo, perc = f['energia'], f['bpm'] or 0, (f['tonalidad'] or '').endswith('menor'), f['brillo_hz'], f['_perc']
    if e < 0.35:
        clima = 'melancólico' if menor and brillo < 2000 else ('tranquilo' if bpm < 105 else 'suave con pulso')
    elif e > 0.68:
        if bpm >= 118:
            clima = 'enérgico' if not menor else 'intenso'
        else:
            clima = 'épico' if menor or brillo < 2200 else 'potente'
    else:
        if menor:
            clima = 'tenso' if brillo < 1800 or perc > 0.45 else 'emotivo'
        else:
            clima = 'alegre' if bpm >= 105 and brillo >= 2000 else 'cálido'
    tags = []
    curva = f['curva_energia']
    if len(curva) >= 6:
        a, b = np.mean(curva[:len(curva) // 3]), np.mean(curva[-len(curva) // 3:])
        if b - a > 0.25:
            tags.append('crece')
        elif a - b > 0.25:
            tags.append('baja')
    tags.append('percusivo' if perc > 0.4 else ('ambiental' if perc < 0.15 else 'mixto'))
    if brillo < 1500:
        tags.append('oscuro')
    elif brillo > 3200:
        tags.append('brillante')
    if f['dinamica_db'] < 6:
        tags.append('parejo')
    return clima, tags


def clima_sonido(f, rms_db, flat):
    dur, pico = f['dur'], f['golpe_principal'] or 0
    n = len(rms_db)
    pos = (int(np.argmax(rms_db)) / max(n - 1, 1)) if n else 0
    tono = 'grave' if f['brillo_hz'] < 1200 else ('brillante' if f['brillo_hz'] > 4000 else 'medio')
    if dur > 6 and f['dinamica_db'] < 12:
        tipo = 'ambiente'
    elif pos > 0.7 and dur > 1.2:
        tipo = 'riser'
    elif dur < 0.35:
        tipo = 'click corto'
    elif pico < 0.15 and pos < 0.3:
        tipo = 'impacto'
    elif 0.25 <= pos <= 0.75 and flat > 0.15:
        tipo = 'whoosh'
    else:
        tipo = 'efecto'
    return f'{tipo} {tono}', [tipo, tono]


def analizar(path, kind, max_seg):
    import librosa
    y = leer_audio(path, SR, dur=max_seg)
    if y.size < SR * 0.05:
        raise ValueError('audio vacío o demasiado corto')
    dur = y.size / SR
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    rms_db = 20 * np.log10(np.maximum(rms, 1e-6))
    activo = rms_db[rms_db > rms_db.max() - 45] if rms_db.size else rms_db
    media_db = float(np.mean(activo)) if activo.size else -90
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    cent = librosa.feature.spectral_centroid(y=y, sr=SR, hop_length=HOP)[0]
    flat = float(np.median(librosa.feature.spectral_flatness(y=y, hop_length=HOP)[0]))
    f = {
        'dur': r(dur),
        # 0 = casi silencio, 1 = muy fuerte y denso. RMS medio del tramo con sonido, de -38 a -8 dBFS.
        'energia': r(np.clip((media_db + 38) / 30, 0, 1)),
        'nivel_db': r(media_db, 1),
        'dinamica_db': r(np.percentile(activo, 95) - np.percentile(activo, 10), 1) if activo.size else 0.0,
        'brillo_hz': int(np.median(cent)),
        'golpe_principal': r(np.argmax(rms) * HOP / SR),
    }
    if kind == 'musica' and dur >= 8:
        tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, units='time')
        bpm = float(np.atleast_1d(tempo)[0])
        ibi = np.diff(beats)
        if len(ibi) > 8 and np.std(ibi) / np.mean(ibi) < 0.1:
            # Pulso parejo: la pendiente de la grilla de beats es más fina que el tempo cuantizado de librosa.
            bpm = 60 / float(np.polyfit(np.arange(len(beats)), beats, 1)[0])
        f['bpm'] = r(bpm, 1) if bpm > 0 else None
        # Ambigüedad típica de medio o doble tempo: se deja la alternativa para que Claude la considere.
        alt = bpm * 2 if bpm < 90 else (bpm / 2 if bpm > 150 else None)
        f['bpm_alt'] = r(alt, 1) if alt else None
        f['primer_beat'] = r(beats[0]) if len(beats) else None
        f['beat_regularidad'] = r(1 - min(1, np.std(ibi) / np.mean(ibi))) if len(ibi) > 4 else None
        f['tonalidad'], f['tonalidad_conf'] = tonalidad(y)
        h, p = librosa.effects.hpss(y)
        f['_perc'] = float(np.sum(p ** 2) / max(np.sum(h ** 2) + np.sum(p ** 2), 1e-9))
        partes = np.array_split(rms_db, 16)
        curva = np.array([np.mean(c) for c in partes if c.size])
        f['curva_energia'] = [r(x) for x in np.clip((curva + 38) / 30, 0, 1)]
        f['golpes'] = golpes_fuertes(env, 12, 2.0)
        f['clima'], f['etiquetas'] = clima_musica(f)
        f['percusion'] = r(f.pop('_perc'))
    else:
        f.update(bpm=None, bpm_alt=None, primer_beat=None, beat_regularidad=None, tonalidad=None, tonalidad_conf=None,
                 curva_energia=[], golpes=golpes_fuertes(env, 5, 0.15) if env.size > 8 else [])
        f['clima'], f['etiquetas'] = clima_sonido(f, rms_db, flat)
    return f


def resolver(base, nombre, alternativas):
    if os.path.isabs(nombre):
        return nombre
    for n in [nombre] + alternativas:
        p = os.path.join(base, n)
        if os.path.isdir(p):
            return p
    return os.path.join(base, nombre)


def main():
    consola_utf8()
    ap = argparse.ArgumentParser(description='Índice de música y SFX de la Sala de Montaje')
    ap.add_argument('--base', default=base_por_defecto(), help='carpeta base del material (o variable SALA_BASE)')
    ap.add_argument('--musica', default='Música', help='carpeta de música, relativa a la base o absoluta')
    ap.add_argument('--sfx', default='Sonidos', help='carpeta de SFX, relativa a la base o absoluta')
    ap.add_argument('--salida', default=os.path.join(DATOS, 'audio'), help='carpeta donde se escriben indice.csv y indice.json')
    ap.add_argument('--max-seg', type=float, default=900, help='analiza como mucho estos segundos de cada archivo')
    ap.add_argument('--forzar', action='store_true', help='reanaliza todo aunque no haya cambiado')
    a = ap.parse_args()
    exigir_ffmpeg()
    carpetas = [('musica', resolver(a.base, a.musica, ['Musica', 'Music'])), ('sonido', resolver(a.base, a.sfx, ['SFX', 'Sfx']))]
    previo = {} if a.forzar else {(i['tipo'], i['archivo']): i for i in (leer_json(os.path.join(a.salida, 'indice.json'), {}) or {}).get('items', [])}
    items, errores, nuevos = [], [], 0
    t0 = time.time()
    for kind, root in carpetas:
        if not os.path.isdir(root):
            print(f'No encontré la carpeta {root} (salteada).')
            continue
        archivos = []
        for dp, dns, fs in os.walk(root):
            dns.sort()
            archivos += [os.path.join(dp, f) for f in sorted(fs) if f.lower().endswith(AUDIO)]
        print(f'{kind}: {len(archivos)} archivos en {root}')
        for n, src in enumerate(archivos, 1):
            folder = os.path.relpath(os.path.dirname(src), root)
            folder = '' if folder == '.' else folder.replace(os.sep, ' / ')
            name = os.path.splitext(os.path.basename(src))[0]
            rel = os.path.relpath(src, a.base).replace(os.sep, '/')
            fi = firma(src)
            ant = previo.get((kind, rel))
            if ant and ant.get('firma') == fi:
                items.append(ant)
                continue
            try:
                f = analizar(src, kind, a.max_seg)
            except Exception as e:  # un archivo roto no frena el resto
                errores.append({'archivo': rel, 'error': str(e)[:200]})
                print(f'  [{n}/{len(archivos)}] ERROR {rel}: {e}')
                continue
            item = {'doc_id': doc_id(kind, folder, name), 'tipo': kind, 'carpeta': folder, 'nombre': name, 'archivo': rel, 'firma': fi, **f}
            items.append(item)
            nuevos += 1
            print(f'  [{n}/{len(archivos)}] {name}: {item["dur"]} s · {item["bpm"] or "-"} bpm · energía {item["energia"]} · {item["clima"]}')
    items.sort(key=lambda i: (i['tipo'], i['carpeta'], i['nombre']))
    os.makedirs(a.salida, exist_ok=True)
    guardar_json(os.path.join(a.salida, 'indice.json'), {
        'generado': datetime.datetime.now().isoformat(timespec='seconds'),
        'leyenda': {
            'energia': '0 a 1 (RMS medio del tramo con sonido: 0 = -38 dBFS, 1 = -8 dBFS)',
            'dinamica_db': 'diferencia entre partes fuertes y suaves (p95 - p10 del RMS)',
            'golpes': 'segundos de los ataques más fuertes (música: hasta 12, a 2 s o más uno de otro; SFX: hasta 5)',
            'golpe_principal': 'segundo del pico de volumen (en un SFX: dónde cae el impacto, para alinearlo)',
            'curva_energia': 'energía en 16 tramos iguales del tema, de principio a fin',
            'bpm_alt': 'medio o doble tempo cuando el BPM detectado puede estar en la otra octava',
            'percusion': '0 a 1, parte de la energía que es percusiva (batería, golpes)',
            'clima': 'etiqueta automática por reglas simples: orienta, se confirma escuchando',
        },
        'items': items, 'errores': errores})
    with open(os.path.join(a.salida, 'indice.csv'), 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.writer(fh)
        w.writerow(COLUMNAS)
        for i in items:
            w.writerow([' '.join(map(str, i.get(c) or [])) if c in ('golpes', 'etiquetas') else ('' if i.get(c) is None else i.get(c)) for c in COLUMNAS])
    print(f'{sum(i["tipo"] == "musica" for i in items)} temas y {sum(i["tipo"] == "sonido" for i in items)} sonidos '
          f'({nuevos} analizados ahora, {len(errores)} con error) en {time.time() - t0:.0f} s -> {a.salida}')


if __name__ == '__main__':
    sys.exit(main())
