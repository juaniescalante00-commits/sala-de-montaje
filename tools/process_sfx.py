"""Ordena SFX descomprimidos y prepara: (1) lotes para escribir en la compu, (2) biblioteca curada para el editor.
uso: python3 -I process_sfx.py <inner_dir> <tag>
inner_dir: carpeta con subcarpetas 'SFX - <Cat> (parte N de M)/<Cat>/<Pack>/...'
Salidas en ./<tag>/: org/ (árbol ordenado), batches/*.json (para device_commit_files), lib/ (mp4 AAC), lib/manifest.json
"""
import os, sys, re, json, shutil, subprocess, hashlib
inner, tag = sys.argv[1], sys.argv[2]
OUT = os.path.abspath(tag); STAGE = f'/mnt/user-data/outputs/sdm_{tag}'
shutil.rmtree(OUT, ignore_errors=True); shutil.rmtree(STAGE, ignore_errors=True)
os.makedirs(f'{OUT}/lib'); os.makedirs(f'{OUT}/batches')
CAT = {'Ambientes cinematicos': 'Ambientes cinemáticos'}
LIBFOLDER = {'Impactos y hits': 'Impactos', 'Glitch y tech': 'Glitch', 'Ambientes cinemáticos': 'Ambientes', 'Whooshes y transiciones': 'Whooshes',
             'Risers y builds': 'Risers', 'UI y clicks': None, 'Otros': 'Otros'}
# 1) ordenar
for part in sorted(os.listdir(inner)):
    pp = os.path.join(inner, part)
    for cat in os.listdir(pp):
        cp = os.path.join(pp, cat)
        if not os.path.isdir(cp): continue
        catn = CAT.get(cat, cat)
        for dp, _, fs in os.walk(cp):
            for f in fs:
                rel = os.path.relpath(os.path.join(dp, f), cp)
                t = os.path.join(STAGE, 'Sonidos', catn, rel)
                os.makedirs(os.path.dirname(t), exist_ok=True)
                if not os.path.exists(t): shutil.copy(os.path.join(dp, f), t)
                if os.path.getsize(t) > 29.5e6 and t.lower().endswith('.wav'):
                    fl = t[:-4] + '.flac'
                    if subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', t, '-c:a', 'flac', '-compression_level', '8', fl]).returncode == 0 and os.path.getsize(fl) <= 29.5e6:
                        os.remove(t); print('FLAC:', os.path.relpath(fl, STAGE))
                    elif os.path.exists(fl): os.remove(fl)
# 2) lotes para la compu
files = sorted((os.path.relpath(os.path.join(dp, f), STAGE), os.path.getsize(os.path.join(dp, f))) for dp, _, fs in os.walk(STAGE) for f in fs)
batches, cur, size = [], [], 0
for p, s in files:
    if s > 29.5e6: print('MUY GRANDE (no entra):', p); continue
    if cur and (len(cur) >= 50 or size + s > 95e6): batches.append(cur); cur, size = [], 0
    cur.append({'stagedPath': f'{STAGE}/{p}', 'devicePath': f'~/Videos/Sala de Montaje/{p}'}); size += s
if cur: batches.append(cur)
for i, b in enumerate(batches): json.dump(b, open(f'{OUT}/batches/b{i}.json', 'w'), ensure_ascii=False)
# 3) biblioteca curada
def dur(p): return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip() or 0)
def clean(stem):
    s = re.sub(r'\s*\(Mixkit \d+\)', '', stem); s = re.sub(r'^(DSGN\w+_+|UIGlitch_|Bluezone_BC\d+_)', '', s); return s.replace('_', ' ').strip()[:60]
bad = re.compile(r'Level_Up|Teleport|Combo|Crystal|Monster|robot|Arcade|arcade|Game glitch|bleep|Bleep|Button|Popup|alert|Alien|roar|vocals|voices|Walkman|Deny Access|Terror|click|Click|notification|beep|Beep|8.?bit|cartoon|laser|gun', re.I)
glitch_ok = re.compile(r'Cinematic glitch trailer|Intro text glitch|noise whip|Digital glitch break|movie accent|bass hit|Break tech impact|Electro hit|shockwave|Rise_fall|Glitchy synth intro|Cinematic sci fi glitch|whoosh|swoosh|transition|impact|hit', re.I)
items = []
for cat in sorted(os.listdir(f'{STAGE}/Sonidos')):
    lf = LIBFOLDER.get(cat)
    if not lf: continue
    for dp, _, fs in os.walk(f'{STAGE}/Sonidos/{cat}'):
        for f in sorted(fs):
            if not f.lower().endswith(('.wav', '.flac')) or bad.search(f): continue
            if lf == 'Glitch' and not glitch_ok.search(f): continue
            src = os.path.join(dp, f); d = dur(src)
            if lf in ('Impactos', 'Whooshes') and d > 14: continue
            maxlen = 20 if lf == 'Ambientes' and d > 20 else (12 if d > 12 else None)
            name = clean(os.path.splitext(f)[0])
            doc_id = 's' + hashlib.sha1(f'sonido|{lf}|{name}'.encode()).hexdigest()[:15]
            dst = f'{OUT}/lib/{doc_id}.mp4'
            if os.path.exists(dst): continue
            cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn']
            if maxlen: cmd += ['-t', str(maxlen), '-af', f'afade=t=out:st={maxlen - 1.5}:d=1.5']
            subprocess.run(cmd + ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', dst], check=True)
            items.append({'doc_id': doc_id, 'kind': 'sonido', 'name': name, 'folder': lf, 'dur': round(dur(dst), 2), 'file': dst})
json.dump(items, open(f'{OUT}/lib/manifest.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(files), 'archivos ordenados en', len(batches), 'lotes', [len(b) for b in batches])
print(len(items), 'para la biblioteca', Counter(i['folder'] for i in items))
