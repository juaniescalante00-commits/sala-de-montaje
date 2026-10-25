"""Cosas compartidas por los scripts locales de la Sala de Montaje (corren en la compu de Juani)."""
import hashlib, json, os, shutil, subprocess, sys

# Carpeta base del material. Se cambia con --base o con la variable de entorno SALA_BASE.
BASE_POR_DEFECTO = r'C:\Users\usr\Videos\Sala de Montaje'
# Raíz del repo: este archivo vive en <repo>/local/.
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(REPO, 'datos')

AUDIO = ('.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.aif', '.aiff', '.opus', '.wma')
VIDEO = ('.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi', '.mts')


def base_por_defecto():
    return os.environ.get('SALA_BASE') or BASE_POR_DEFECTO


def exigir_ffmpeg():
    for exe in ('ffmpeg', 'ffprobe'):
        if not shutil.which(exe):
            sys.exit(f'Falta {exe}. En Windows: winget install Gyan.FFmpeg (y abrí una terminal nueva).')


def firma(path):
    """Cambia si el archivo cambia: sirve para no reanalizar lo que ya está."""
    st = os.stat(path)
    return f'{st.st_size}-{int(st.st_mtime)}'


def doc_id(kind, folder, name):
    """Mismo id que tools/sync_library.py usa para library/<doc_id>, así el índice se cruza con la biblioteca."""
    return kind[0] + hashlib.sha1(f'{kind}|{folder}|{name}'.encode()).hexdigest()[:15]


def leer_audio(path, sr=22050, inicio=None, dur=None):
    """Decodifica cualquier audio o video a mono float32 con ffmpeg (sin depender de códecs de Python)."""
    import numpy as np
    cmd = ['ffmpeg', '-v', 'error', '-nostdin']
    if inicio is not None:
        cmd += ['-ss', str(inicio)]
    if dur is not None:
        cmd += ['-t', str(dur)]
    cmd += ['-i', path, '-vn', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        msg = res.stderr.decode('utf-8', 'replace').strip().splitlines()
        raise RuntimeError('ffmpeg no pudo leer el audio: ' + (msg[-1] if msg else f'código {res.returncode}'))
    return np.frombuffer(res.stdout, dtype=np.float32).copy()


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def guardar_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def leer_json(path, defecto=None):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def consola_utf8():
    # La consola de Windows a veces no es UTF-8 y los acentos rompen el print.
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            pass
