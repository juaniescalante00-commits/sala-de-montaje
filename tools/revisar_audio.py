#!/usr/bin/env python3
"""Sala de Montaje · revisión del audio del MP4 final (HARD-RULES 44, 48 y 49).

1. Sincronía: el codificador AAC de la página mete relleno al principio y el MP4 no lo descuenta (lista de edición
   vacía): el audio quedaba ~27 ms atrasado respecto de la imagen (v2 de Larreta: 1312 muestras). Se mide contra el
   audio del video del proyecto (correlación cruzada en varios puntos) y, si pasa de 5 ms, se corrige recortando o
   demorando el audio (el video no se toca) y se vuelve a medir.
2. Sonoridad integrada y pico verdadero (ffmpeg ebur128): −14 LUFS ±1 y pico ≤ −1 dBTP.
3. Voz/música mientras se habla (tools/separar.py): la música tiene que quedar 18 dB o más por debajo de la voz.

  python3 tools/revisar_audio.py --ref <video del proyecto> --final final.mp4 --proyecto proyecto.json [--corregir] [--json x.json]
"""
import argparse, json, os, re, subprocess, sys
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))


def pcm(path, sr=48000):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.int16).astype(np.float32)


def desfase(ref, fin, sr=48000):
    """Atraso del audio final respecto del de referencia, en muestras (positivo = el final suena tarde)."""
    from scipy.signal import correlate
    dur = min(len(ref), len(fin)) / sr; vals = []
    for t in np.linspace(1.0, max(1.0, dur - 2.0), 8):
        i = int(t * sr); x = ref[i:i + sr]
        if len(x) < sr or np.abs(x).max() < 200: continue
        y = fin[max(0, i - 4800):i + sr + 4800]
        if len(y) < len(x) + 9600: continue
        c = correlate(y, x, 'valid'); k = int(np.argmax(c)) - 4800
        vals.append(k)
    if not vals: return None, []
    return int(np.median(vals)), vals


def corregir(final, muestras, sr=48000):
    tmp = final + '.sync.mp4'; seg = muestras / sr
    af = f'atrim=start={seg:.6f},asetpts=PTS-STARTPTS' if muestras > 0 else f'adelay={-seg * 1000:.3f}:all=1'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', final, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', '-af', af,
                    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmp], check=True, capture_output=True)
    os.replace(tmp, final)


def sonoridad(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    txt = r.stderr[r.stderr.rfind('Summary:'):]
    i = re.search(r'I:\s+(-?[\d.]+) LUFS', txt); p = re.search(r'Peak:\s+(-?[\d.]+) dBFS', txt)
    return {'lufs': float(i.group(1)) if i else None, 'pico_dbtp': float(p.group(1)) if p else None}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ref', required=True); ap.add_argument('--final', required=True); ap.add_argument('--proyecto', required=True)
    ap.add_argument('--corregir', action='store_true'); ap.add_argument('--json'); ap.add_argument('--sin-musica', action='store_true')
    a = ap.parse_args()
    P = json.load(open(a.proyecto)); inf = {}
    ref = pcm(a.ref); d, vals = desfase(ref, pcm(a.final))
    inf['sincro'] = {'atraso_ms': None if d is None else round(d / 48, 1), 'mediciones': vals}
    if d is not None and abs(d) >= 240 and a.corregir:   # 5 ms
        corregir(a.final, d); d2, vals2 = desfase(ref, pcm(a.final))
        inf['sincro'].update({'corregido': True, 'despues_ms': None if d2 is None else round(d2 / 48, 1)})
    inf['sincro']['ok'] = (inf['sincro'].get('despues_ms', inf['sincro']['atraso_ms']) is not None and
                           abs(inf['sincro'].get('despues_ms', inf['sincro']['atraso_ms'])) < 5)
    so = sonoridad(a.final); so['ok'] = so['lufs'] is not None and abs(so['lufs'] + 14) <= 1 and so['pico_dbtp'] <= -1.0
    inf['sonoridad'] = so
    if not a.sin_musica and P.get('words'):
        try:
            sys.path.insert(0, AQUI); import separar
            x = separar.leer(a.final); inf['voz_musica'] = separar.medir(x, P['words'])
        except Exception as e:
            inf['voz_musica'] = {'hecho': False, 'motivo': str(e)[:200]}
    print(json.dumps(inf, ensure_ascii=False))
    if a.json: json.dump(inf, open(a.json, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
