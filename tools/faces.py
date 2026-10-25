"""Detecta caras en un video (BlazeFace short range, CPU) y devuelve un seguimiento suavizado.
uso: python3 -I faces.py <video> <face_detection_short_range.tflite> <salida.json> [fps=4]
salida: {"fps":4,"w":1080,"h":1920,"faces":[{"t":0.0,"caras":[[x,y,w,h],...]}, ...]} con coordenadas normalizadas 0-1 sobre el cuadro del video.
El modelo viene en el paquete npm @mediapipe/face_detection (npm pack). Necesita: pip install ai-edge-litert numpy.
"""
import sys, json, subprocess, math
import numpy as np
from ai_edge_litert.interpreter import Interpreter

video, model, out = sys.argv[1], sys.argv[2], sys.argv[3]
FPS = float(sys.argv[4]) if len(sys.argv) > 4 else 4.0

probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration', '-of', 'json', video], capture_output=True, text=True).stdout)
st = probe['streams'][0]; vw, vh = st['width'], st['height']
rot = 0
for sd in st.get('side_data_list', []) or []:
    if 'rotation' in sd: rot = int(sd['rotation'])
if abs(rot) in (90, 270): vw, vh = vh, vw
dur = float(probe['format']['duration'])
# cuadros chicos: el lado corto a 384 px
if vw <= vh: sw, sh = 384, int(round(vh * 384 / vw / 2) * 2)
else: sh, sw = 384, int(round(vw * 384 / vh / 2) * 2)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'fps={FPS},scale={sw}:{sh}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
n = len(raw) // (sw * sh * 3)
frames = np.frombuffer(raw[:n * sw * sh * 3], np.uint8).reshape(n, sh, sw, 3)

it = Interpreter(model_path=model); it.allocate_tensors()
iin = it.get_input_details()[0]['index']; outs = {d['name']: d['index'] for d in it.get_output_details()}

# anclas SSD de BlazeFace short range: 16x16x2 + 8x8x6 = 896
anchors = []
for stride, per in ((8, 2), (16, 6)):
    g = 128 // stride
    for y in range(g):
        for x in range(g):
            for _ in range(per): anchors.append(((x + .5) / g, (y + .5) / g))
anchors = np.array(anchors, np.float32)

def detect(img):  # img: cuadrado HxWx3 uint8 -> lista de (score, x0, y0, x1, y1) normalizados al cuadrado
    s = img.shape[0]
    idx = (np.arange(128) * s / 128).astype(int)
    small = img[idx][:, idx].astype(np.float32) / 127.5 - 1.0
    it.set_tensor(iin, small[None]); it.invoke()
    reg = it.get_tensor(outs['regressors'])[0]; cls = it.get_tensor(outs['classificators'])[0, :, 0]
    sc = 1 / (1 + np.exp(-np.clip(cls, -80, 80)))
    res = []
    for i in np.where(sc > 0.72)[0]:
        cx = reg[i, 0] / 128 + anchors[i, 0]; cy = reg[i, 1] / 128 + anchors[i, 1]; w = reg[i, 2] / 128; h = reg[i, 3] / 128
        res.append((float(sc[i]), cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
    return res

def iou(a, b):
    x0, y0, x1, y1 = max(a[1], b[1]), max(a[2], b[2]), min(a[3], b[3]), min(a[4], b[4])
    inter = max(0, x1 - x0) * max(0, y1 - y0); ua = (a[3] - a[1]) * (a[4] - a[2]) + (b[3] - b[1]) * (b[4] - b[2]) - inter
    return inter / ua if ua > 0 else 0

def nms(boxes, thr=0.3):
    boxes = sorted(boxes, reverse=True); keep = []
    for b in boxes:
        if all(iou(b, k) < thr for k in keep): keep.append(b)
    return keep

track = []
short = min(sw, sh)
for fi, fr in enumerate(frames):
    found = []
    # ventanas cuadradas solapadas a lo largo del lado largo, y una más chica para caras lejanas
    long_ = max(sw, sh)
    for size in (short, int(short * 0.6)):
        steps = max(1, math.ceil((long_ - size) / (size * 0.5)) + 1)
        for k in range(steps):
            off = 0 if steps == 1 else round(k * (long_ - size) / (steps - 1))
            for off2 in ((0,) if size == short else (0, short - size, (short - size) // 2)):
                if sw <= sh: x0, y0 = off2, off
                else: x0, y0 = off, off2
                crop = fr[y0:y0 + size, x0:x0 + size]
                if crop.shape[0] != size or crop.shape[1] != size: continue
                for sc, a, b, c, d in detect(crop):
                    found.append((sc, (x0 + a * size) / sw, (y0 + b * size) / sh, (x0 + c * size) / sw, (y0 + d * size) / sh))
    faces = [f for f in nms(found) if (f[3] - f[1]) > 0.04]
    track.append({'t': round(fi / FPS, 3), 'caras': [[round(float(max(0, f[1])), 4), round(float(max(0, f[2])), 4), round(float(min(1, f[3]) - max(0, f[1])), 4), round(float(min(1, f[4]) - max(0, f[2])), 4)] for f in faces[:3]]})

# limpieza temporal: una cara cuenta si reaparece cerca en los cuadros vecinos (descarta falsos positivos sueltos)
def near(c, d):
    cx, cy = c[0] + c[2] / 2, c[1] + c[3] / 2; dx, dy = d[0] + d[2] / 2, d[1] + d[3] / 2
    return abs(cx - dx) < max(c[2], d[2]) * 0.9 and abs(cy - dy) < max(c[3], d[3]) * 0.9
raw_c = [f['caras'] for f in track]
for i, f in enumerate(track):
    keep = []
    for c in raw_c[i]:
        support = sum(1 for j in range(max(0, i - 2), min(len(raw_c), i + 3)) if j != i and any(near(c, d) for d in raw_c[j]))
        if support >= 2: keep.append(c)
    f['caras'] = keep
# suavizado de la cara principal con los vecinos que son la misma cara
for i, f in enumerate(track):
    if not f['caras']: continue
    m = max(f['caras'], key=lambda c: c[2] * c[3])
    same = [m] + [d for j in range(max(0, i - 2), min(len(track), i + 3)) if j != i for d in track[j]['caras'] if near(m, d)]
    med = [round(float(np.median([c[k] for c in same])), 4) for k in range(4)]
    f['caras'] = [med] + [c for c in f['caras'] if c is not m]
out_d = {'fps': FPS, 'w': vw, 'h': vh, 'duration': round(dur, 3), 'faces': track}
json.dump(out_d, open(out, 'w'))
hit = sum(1 for f in track if f['caras'])
print(f'{len(track)} cuadros · cara en {hit} ({hit * 100 // max(1, len(track))}%)')
