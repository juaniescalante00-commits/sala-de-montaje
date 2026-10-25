#!/usr/bin/env python3
"""Sala de Montaje · voz y música separadas (para el ducking cuando el crudo YA trae música, HARD-RULES 44).

Si el crudo trae la música mezclada (audio.rawMusic), no hay pista de música que bajar: hay que separarla. Este script
usa Spleeter 2 stems (Deezer, licencia MIT) convertido a ONNX por sherpa-onnx (Apache-2.0), corrido con onnxruntime.
Los pesos (2 × 19 MB) se bajan una vez de los releases de GitHub (gratis, sin cuenta) y quedan en caché; se verifica
el sha256. No instala nada ni corre código de afuera: solo lee los pesos.

  python3 tools/separar.py --entrada crudo.mp4 --palabras palabras.json --duck salida.wav [--bajo-voz 20]
      → la música baja mientras se habla hasta quedar ~20 dB (18-22) por debajo de la voz. Fuera del habla vuelve.
        salida = original − (1 − g)·música: donde g = 1 el audio es IDÉNTICO al original (la voz nunca se reconstruye).
  python3 tools/separar.py --entrada final.mp4 --palabras palabras.json --medir
      → voz/música en dB mientras se habla (mediana y peor 10 %), para la revisión.

Necesita numpy, onnxruntime y ffmpeg.
"""
import argparse, hashlib, json, os, subprocess, sys, urllib.request
import numpy as np

SR = 44100; NFFT = 4096; HOP = 1024; F = 1024; T = 512
BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/sherpa-onnx-spleeter-2stems-fp16.tar.bz2'
SHA = {'vocals.fp16.onnx': None, 'accompaniment.fp16.onnx': None}   # se completa la primera vez (ver _sha.json en la caché)
CACHE = os.environ.get('SALA_CACHE') or os.path.join(os.path.expanduser('~'), '.cache', 'sala-de-montaje', 'spleeter')


def modelos():
    d = os.path.join(CACHE, 'sherpa-onnx-spleeter-2stems-fp16')
    if not all(os.path.exists(os.path.join(d, n)) for n in SHA):
        os.makedirs(CACHE, exist_ok=True); tb = os.path.join(CACHE, 'm.tar.bz2')
        print('bajando los pesos de Spleeter (una sola vez, 39 MB, GitHub releases)…', file=sys.stderr)
        urllib.request.urlretrieve(BASE, tb)
        subprocess.run(['tar', '-xjf', tb, '-C', CACHE], check=True); os.remove(tb)
    reg = os.path.join(CACHE, '_sha.json'); vistos = json.load(open(reg)) if os.path.exists(reg) else {}
    for n in SHA:
        h = hashlib.sha256(open(os.path.join(d, n), 'rb').read()).hexdigest()
        if n in vistos and vistos[n] != h: raise SystemExit(f'el modelo {n} cambió (sha256 distinto): no lo uso')
        vistos[n] = h
    json.dump(vistos, open(reg, 'w'))
    import onnxruntime as ort
    o = ort.SessionOptions(); o.log_severity_level = 3
    return {k: ort.InferenceSession(os.path.join(d, f'{k}.fp16.onnx'), o, providers=['CPUExecutionProvider']) for k in ('vocals', 'accompaniment')}


def leer(path, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '2', '-ar', str(sr), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy()


def escribir(path, x, sr=SR):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '2', '-i', '-', '-c:a', 'pcm_s16le', path],
                   input=np.clip(x, -1, 1).T.astype(np.float32).tobytes(), check=True)


def _ventana():
    return np.hanning(NFFT + 1)[:-1].astype(np.float32)


def stft(x):
    w = _ventana(); pad = NFFT // 2
    x = np.pad(x, ((0, 0), (pad, pad + NFFT)))
    n = 1 + (x.shape[1] - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    return np.fft.rfft(x[:, idx] * w, axis=-1)          # (2, frames, 2049)


def istft(X, largo):
    w = _ventana(); pad = NFFT // 2
    fr = np.fft.irfft(X, n=NFFT, axis=-1) * w
    n = fr.shape[1]; out = np.zeros((2, HOP * (n - 1) + NFFT)); norm = np.zeros(HOP * (n - 1) + NFFT)
    for i in range(n):
        out[:, i * HOP:i * HOP + NFFT] += fr[:, i]; norm[i * HOP:i * HOP + NFFT] += w * w
    out /= np.maximum(norm, 1e-8)
    return out[:, pad:pad + largo]


def separar(x, ses=None):
    """(2, n) a 44,1 kHz → (voz, música). Máscara de Wiener con las dos estimaciones; arriba de 11 kHz se extiende la
    máscara promedio de la última octava. música = máscara·X; voz = X − música (la voz conserva todo lo demás)."""
    ses = ses or modelos()
    X = stft(x); mag = np.abs(X[:, :, :F]).astype(np.float32)
    nfr = mag.shape[1]; ns = -(-nfr // T)
    m = np.zeros((2, ns * T, F), np.float32); m[:, :nfr] = mag
    m = m.reshape(2, ns, T, F)
    est = {k: s.run(None, {'x': m})[0].reshape(2, ns * T, F)[:, :nfr] for k, s in ses.items()}
    v2, a2 = est['vocals'] ** 2, est['accompaniment'] ** 2
    ma = (a2 + 1e-10 / 2) / (v2 + a2 + 1e-10)
    alto = ma[:, :, -256:].mean(axis=2, keepdims=True)
    ma = np.concatenate([ma, np.repeat(alto, X.shape[2] - F, axis=2)], axis=2)
    musica = istft(X * ma, x.shape[1])
    return x - musica, musica


def habla(palabras, dur, hz=100, antes=0.10, despues=0.08, unir=0.6):
    """Máscara de habla (1 mientras se habla, con 100 ms antes de cada palabra y pausas cortas unidas)."""
    v = np.zeros(int(dur * hz) + 1, bool)
    for w in palabras:
        v[max(0, int((w['s'] - antes) * hz)):int((w['e'] + despues) * hz) + 1] = True
    i = 0
    while i < len(v):   # pausas cortas dentro de una frase: la música no sube y baja (sin bombeo)
        if not v[i]:
            j = i
            while j < len(v) and not v[j]: j += 1
            if 0 < i and j < len(v) and (j - i) / hz < unir: v[i:j] = True
            i = j
        else: i += 1
    return v


def nivel_db(x, hz=100):
    """RMS en dB por ventanas de 10 ms (mono)."""
    m = x.mean(0) if x.ndim == 2 else x; n = SR // hz; k = len(m) // n
    return 10 * np.log10((m[:k * n].reshape(k, n) ** 2).mean(1) + 1e-12)


def _hp(x, fc=80.0):
    """Paso alto suave (1er orden) para que el grave de la música no domine la medida."""
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); prev_x = np.zeros(x.shape[:-1]); prev_y = np.zeros(x.shape[:-1])
    from scipy.signal import lfilter
    return lfilter([(1 + a) / 2, -(1 + a) / 2], [1, -a], x, axis=-1)


def niveles(voz, musica, hab, hz=100):
    """Voz de referencia = nivel de la FRASE hablada alrededor (3 s, solo cuadros con habla); música = 400 ms.
    Así se compara como se oye: la música contra el nivel de la voz, no contra el instante flojo de una consonante."""
    lv, lm = nivel_db(_hp(voz), hz), nivel_db(_hp(musica), hz); n = min(len(lv), len(lm), len(hab)); lv, lm, h = lv[:n], lm[:n], hab[:n]
    pv = 10 ** (lv / 10) * h; cnt = np.convolve(h.astype(float), np.ones(300), 'same')
    ref = 10 * np.log10(np.convolve(pv, np.ones(300), 'same') / np.maximum(cnt, 1) + 1e-12)
    mus = 10 * np.log10(np.convolve(10 ** (lm / 10), np.ones(40) / 40, 'same') + 1e-12)
    return ref, mus, h


def relacion(voz, musica, hab, hz=100):
    """Voz (frase) − música (400 ms) en dB, cada 200 ms mientras se habla."""
    ref, mus, h = niveles(voz, musica, hab, hz)
    idx = [i for i in range(0, len(h), 20) if h[i]]
    return [float(ref[i] - mus[i]) for i in idx], [i / hz for i in idx]


def resumen(rel):
    rel = rel[0] if isinstance(rel, tuple) else rel
    if not rel: return {'ventanas': 0}
    r = np.array(rel)
    return {'ventanas': len(r), 'mediana_db': round(float(np.median(r)), 1), 'peor10_db': round(float(np.percentile(r, 10)), 1),
            'min_db': round(float(r.min()), 1)}


def duck(x, palabras, bajo_voz=20.0, ses=None, hz=100):
    """Baja la música mientras se habla para que quede `bajo_voz` dB por debajo de la voz de la frase. Ganancia suave:
    baja en 80 ms (empieza 100 ms antes de la palabra), vuelve en 350 ms. Nunca sube la música ni la baja más de 30 dB."""
    voz, musica = separar(x, ses)
    dur = x.shape[1] / SR; hab = habla(palabras, dur, hz)
    ref, mus, h = niveles(voz, musica, hab, hz); n = len(h)
    obj = np.where(h, np.maximum(np.minimum(0, (ref - bajo_voz) - mus), -30.0), 0.0)
    adel = int(0.1 * hz); obj2 = np.array([obj[i:i + adel + 1].min() for i in range(n)])
    g = np.zeros(n); cur = 0.0
    a_baja, a_sube = 1 - np.exp(-1 / (0.08 * hz)), 1 - np.exp(-1 / (0.35 * hz))
    for i in range(n):
        t = obj2[i]; cur += (t - cur) * (a_baja if t < cur else a_sube); g[i] = cur
    gs = np.interp(np.arange(x.shape[1]) / SR * hz, np.arange(n), 10 ** (g / 20))
    out = x - (1 - gs) * musica
    return out, {'antes': resumen(relacion(voz, musica, hab, hz)), 'despues': resumen(relacion(voz, musica * gs, hab, hz)),
                 'bajo_voz_objetivo': bajo_voz, 'baja_media_habla_db': round(float(g[h].mean()), 1) if h.any() else 0,
                 'baja_max_db': round(float(g.min()), 1)}


def medir(x, palabras, ses=None, objetivo=18.0):
    """Para la revisión: voz − música mientras se habla. ok si el peor 10 % queda a `objetivo` dB o más."""
    voz, mus = separar(x, ses); rel, ts = relacion(voz, mus, habla(palabras, x.shape[1] / SR))
    r = resumen(rel); r['ok'] = bool(r.get('ventanas')) and r['peor10_db'] >= objetivo
    r['peores'] = [{'t': round(t, 1), 'db': round(v, 1)} for v, t in sorted(zip(rel, ts))[:5]]
    return r


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--entrada', required=True); ap.add_argument('--palabras', required=True, help='JSON: lista de {w,s,e} o un proyecto con "words"')
    ap.add_argument('--duck', help='wav de salida con la música bajada bajo la voz'); ap.add_argument('--bajo-voz', type=float, default=20.0)
    ap.add_argument('--medir', action='store_true'); ap.add_argument('--json', help='guardar el informe acá')
    a = ap.parse_args()
    pal = json.load(open(a.palabras)); pal = pal.get('words', pal) if isinstance(pal, dict) else pal
    x = leer(a.entrada); ses = modelos()
    if a.duck:
        out, inf = duck(x, pal, a.bajo_voz, ses); escribir(a.duck, out)
    else:
        inf = {'relacion': medir(x, pal, ses)}
    print(json.dumps(inf, ensure_ascii=False))
    if a.json: json.dump(inf, open(a.json, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
