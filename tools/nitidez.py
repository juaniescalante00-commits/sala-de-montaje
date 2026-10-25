#!/usr/bin/env python3
"""Sala de Montaje · nitidez por toma (HARD-RULES 43 y 47).

La copia liviana (720p) se escala a 1080×1920 con lanczos y un enfoque leve (unsharp 0,5) para todo el video. Pero las
tomas de B-roll (aéreas, cúpulas) suelen venir más blandas que el A-roll: con el mismo enfoque siguen viéndose más
blandas. Este script mide la nitidez de CADA toma (planos de ffmpeg-skill scenes.py) con una métrica que no depende del
imagen: microcontraste ABSOLUTO en dos bandas (fina y media; la bruma y la compresión de una aérea lo bajan aunque sus
bordes midan igual de "nítidos" en relativo, y eso es lo que el ojo ve como blando) y sube el enfoque fino y una claridad
de radio medio solo en las tomas B-roll más blandas que el A-roll (las tomas con cara), hasta acercarlas, sin halos: cada valor se
prueba en cuadros de la toma y se descarta si aparecen sobreimpulsos en los bordes (halos) por encima de los del A-roll.

  python3 tools/nitidez.py --video crudo.mp4 --proyecto proyecto.json --salida hq.mp4 [--informe nitidez.json]
  python3 tools/nitidez.py --video final.mp4 --proyecto proyecto.json --medir        # revisión: nitidez por toma

Necesita numpy y ffmpeg. Solo luminancia (el color no se toca).
"""
import argparse, json, os, subprocess, sys
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(AQUI, '..', '.claude', 'skills', 'ffmpeg-skill', 'scripts')
# pasos de compensación: enfoque fino (5×5) y claridad de radio medio (13×13), los dos solo en luminancia
PASOS = [(0.5, 0.0), (0.65, 0.1), (0.8, 0.2), (0.95, 0.3), (1.1, 0.4), (1.2, 0.5), (1.3, 0.6)]


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def probe(path):
    d = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', path]).stdout)
    st = d['streams'][0]; a, b = st['r_frame_rate'].split('/')
    return {'w': st['width'], 'h': st['height'], 'fps': float(a) / float(b or 1), 'dur': float(d['format']['duration'])}


def tomas(path, dur):
    try:
        r = run([sys.executable, '-B', os.path.join(SKILL, 'scenes.py'), path, '--json'], timeout=600)
        cortes = [round(s['start'], 3) for s in (json.loads(r.stdout).get('scenes') or [])[1:]]
    except Exception as e:
        print('aviso: sin planos (%s): una sola toma' % e, file=sys.stderr); cortes = []
    b = [0.0] + [c for c in cortes if 0.3 < c < dur - 0.3] + [dur]
    return [(b[i], b[i + 1]) for i in range(len(b) - 1)]


def cuadro(path, t, W, H, vf=''):
    """Luminancia de un cuadro escalado a W×H con lanczos (+ filtro opcional), como arreglo float."""
    f = f'scale={W}:{H}:flags=lanczos' + (',' + vf if vf else '') + ',format=gray'
    raw = run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', path, '-frames:v', '1', '-vf', f, '-f', 'rawvideo', '-']).stdout
    return np.frombuffer(raw, np.uint8)[:W * H].reshape(H, W).astype(np.float32)


def detalle(y):
    """Microcontraste ABSOLUTO (niveles de luminancia, percentil 90) en dos bandas a 1080×1920: fina (0-2 px) y media
    (2-9 px). La bruma y la compresión de una toma aérea lo bajan aunque los bordes midan igual de "nítidos" en relativo:
    es lo que el ojo ve como blando. Devuelve la suma de las dos bandas."""
    from scipy.ndimage import gaussian_filter
    h, w = y.shape; y = y[h // 12:-h // 12, w // 12:-w // 12]
    g1, g2, g3 = gaussian_filter(y, 0.01), gaussian_filter(y, 2.25), gaussian_filter(y, 9.0)
    return float(np.percentile(np.abs(g1 - g2), 90) + np.percentile(np.abs(g2 - g3), 90))


def halos(orig, sh):
    """Fracción de píxeles con sobreimpulso > 14 niveles respecto del máximo/mínimo local (5×5) del original."""
    from numpy.lib.stride_tricks import sliding_window_view as sw
    p = np.pad(orig, 2, mode='edge'); win = sw(p, (5, 5))
    mx, mn = win.max(axis=(2, 3)), win.min(axis=(2, 3))
    over = np.maximum(sh - mx, mn - sh)
    return float((over > 14).mean())


def unsharp(m, c=0.0):
    f = f'unsharp=5:5:{m:.2f}:5:5:0' if m > 0 else ''
    if c > 0: f += (',' if f else '') + f'unsharp=13:13:{c:.2f}:5:5:0'
    return f


def caras_en(P, a, b):
    fs = [f for f in (P.get('faces') or []) if a <= f['t'] < b]
    return (sum(1 for f in fs if f.get('caras')) / len(fs)) if fs else 0.0


def medir_tomas(video, P, W=1080, H=1920, vf=''):
    info = probe(video); res = []
    for a, b in tomas(video, info['dur']):
        ts = [a + (b - a) * q for q in (0.25, 0.5, 0.75)]
        ys = [cuadro(video, t, W, H, vf) for t in ts]
        res.append({'s': round(a, 3), 'e': round(b, 3), 'aroll': caras_en(P, a, b) >= 0.5, 'nitidez': round(float(np.mean([detalle(y) for y in ys])), 2)})
    return res, info


def plan(video, P, base):
    """Para cada toma: el enfoque necesario para quedar tan nítida como el A-roll (con el enfoque base), sin halos."""
    info = probe(video); W, H = 1080, 1920; res = []
    for a, b in tomas(video, info['dur']):
        ts = [a + (b - a) * q for q in (0.3, 0.7)]
        orig = [cuadro(video, t, W, H) for t in ts]
        def con(m, c=0.0, ts=ts, orig=orig):   # ts y orig atados a ESTA toma (sin esto, todas medían la última)
            vf = unsharp(m, c); ys = [cuadro(video, t, W, H, vf) for t in ts] if vf else orig
            return float(np.mean([detalle(y) for y in ys])), float(np.mean([halos(o, y) for o, y in zip(orig, ys)]))
        nt, hl = con(base)
        res.append({'s': round(a, 3), 'e': round(b, 3), 'aroll': caras_en(P, a, b) >= 0.5, 'base': base, 'nitidez': round(nt, 2), 'halos': round(hl, 5), '_con': con})
    ar = [r for r in res if r['aroll']] or res
    ref = float(np.median([r['nitidez'] for r in ar])); lim_h = max(0.004, 1.5 * max(r['halos'] for r in ar))
    for r in res:
        r['monto'], r['claridad'], r['despues'] = r['base'], 0.0, r['nitidez']
        if r['aroll'] or r['nitidez'] >= ref * 0.9: continue          # solo B-roll más blando que el A-roll
        for m, c in [x for x in PASOS if x[0] > r['base']]:
            nt, hl = r['_con'](m, c)
            if hl > lim_h: break                      # halos: no se sube más
            r['monto'], r['claridad'], r['despues'], r['halos'] = m, c, round(nt, 2), round(hl, 5)
            if nt >= ref * 0.9: break
    for r in res: r.pop('_con')
    return res, {'ref_aroll': round(ref, 4), 'limite_halos': round(lim_h, 5)}, info


def renderizar(video, tomas_, salida, info):
    """Escala a 1080×1920 (lanczos) y enfoca cada toma con su monto (solo luminancia). Audio copiado."""
    fc, lbl = [], []
    for k, r in enumerate(tomas_):
        e = '' if k == len(tomas_) - 1 else f":end={r['e']:.6f}"
        f = f"[0:v]trim=start={r['s']:.6f}{e},setpts=PTS-STARTPTS,scale=1080:1920:flags=lanczos"
        vf = unsharp(r['monto'], r.get('claridad', 0.0))
        if vf: f += ',' + vf
        fc.append(f + f'[v{k}]'); lbl.append(f'[v{k}]')
    fc.append(''.join(lbl) + f'concat=n={len(tomas_)}:v=1:a=0[v]')
    fcf = salida + '.filtro.txt'; open(fcf, 'w').write(';\n'.join(fc))
    run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-filter_complex_script', fcf, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264',
         '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', f"{info['fps']:.6f}", '-c:a', 'copy', '-movflags', '+faststart', salida])
    os.remove(fcf)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--video', required=True); ap.add_argument('--proyecto', required=True)
    ap.add_argument('--salida'); ap.add_argument('--informe'); ap.add_argument('--medir', action='store_true')
    ap.add_argument('--base', type=float, help='enfoque de todo el video (por defecto 0,5 si se escala, 0 si ya es 1080×1920)')
    a = ap.parse_args()
    P = json.load(open(a.proyecto))
    if a.medir:
        res, _ = medir_tomas(a.video, P)
        ar = [r['nitidez'] for r in res if r['aroll']] or [r['nitidez'] for r in res]
        ref = float(np.median(ar)); peor = min(res, key=lambda r: r['nitidez'])
        inf = {'tomas': res, 'ref_aroll': round(ref, 4), 'peor': peor, 'relacion_peor': round(peor['nitidez'] / ref, 3) if ref else 0, 'ok': peor['nitidez'] >= ref * 0.8}
    else:
        info0 = probe(a.video); base = a.base if a.base is not None else (0.5 if info0['h'] < 1920 else 0.0)
        res, ref, info = plan(a.video, P, base)
        if a.salida: renderizar(a.video, res, a.salida, info)
        inf = dict(ref, tomas=res)
    print(json.dumps(inf, ensure_ascii=False))
    if a.informe: json.dump(inf, open(a.informe, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
