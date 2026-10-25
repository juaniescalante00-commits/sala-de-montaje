"""Prepara la biblioteca de Sala de Montaje a partir de las carpetas Música y Sonidos.

uso: python3 -I sync_library.py <carpeta_staged_musica> <carpeta_staged_sonidos> <salida_dir>
Convierte cada audio (.mp3 .wav .m4a .aac .ogg .flac .aif .aiff) a AAC dentro de un .mp4 (el asset store
del editor acepta video/mp4) y escribe <salida_dir>/manifest.json:
[{"doc_id","kind":"musica"|"sonido","name","folder","dur","file","src"}]
doc_id es estable (hash de carpeta+nombre), así una nueva sincronización actualiza en vez de duplicar.
"""
import hashlib, json, os, subprocess, sys

AUD = ('.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.aif', '.aiff', '.opus')
mus_dir, snd_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
items = []
for kind, root in (('musica', mus_dir), ('sonido', snd_dir)):
    if not root or not os.path.isdir(root):
        continue
    for dp, _, fs in os.walk(root):
        for f in sorted(fs):
            if not f.lower().endswith(AUD):
                continue
            src = os.path.join(dp, f)
            folder = os.path.relpath(dp, root)
            folder = '' if folder == '.' else folder.replace(os.sep, ' / ')
            name = os.path.splitext(f)[0]
            doc_id = kind[0] + hashlib.sha1(f'{kind}|{folder}|{name}'.encode()).hexdigest()[:15]
            dst = os.path.join(out, doc_id + '.mp4')
            br = '160k' if kind == 'musica' else '192k'
            r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-c:a', 'aac', '-b:a', br, '-ar', '48000', '-movflags', '+faststart', dst])
            if r.returncode != 0:
                print('no se pudo convertir', src); continue
            dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], capture_output=True, text=True).stdout.strip()
            items.append({'doc_id': doc_id, 'kind': kind, 'name': name, 'folder': folder, 'dur': round(float(dur or 0), 2), 'file': dst, 'src': src, 'bytes': os.path.getsize(dst)})
json.dump(items, open(os.path.join(out, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
print(f"{sum(i['kind']=='musica' for i in items)} temas, {sum(i['kind']=='sonido' for i in items)} sonidos -> {out}/manifest.json")
for i in items:
    if i['bytes'] > 14.5e6:
        print('ATENCIÓN: supera 14.5 MB, no entra como asset:', i['name'])
