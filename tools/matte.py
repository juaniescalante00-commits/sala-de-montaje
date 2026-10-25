"""Recorte de persona cuadro por cuadro para la Sala de Montaje.

Uso: python3 -I matte.py <video> <rvm_mobilenetv3_fp32.onnx> <salida.mp4> [ancho=540]

Genera un video en escala de grises del mismo largo y fps que el original:
blanco = persona, negro = fondo. La Sala lo usa para poner texto detrás de la persona.
Modelo: Robust Video Matting (MobileNetV3), con memoria temporal entre cuadros.
"""
import json
import subprocess
import sys

import numpy as np
import onnxruntime as ort


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate:format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    st = j["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return int(st["width"]), int(st["height"]), float(num) / float(den), float(j["format"]["duration"])


def main():
    src, model, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    ow = int(sys.argv[4]) if len(sys.argv) > 4 else 540
    w, h, fps, dur = probe(src)
    oh = int(round(ow * h / w / 2)) * 2
    so = ort.SessionOptions()
    so.intra_op_num_threads = 0
    sess = ort.InferenceSession(model, so, providers=["CPUExecutionProvider"])
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", src, "-vf", f"scale={ow}:{oh}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE)
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{ow}x{oh}", "-r", f"{fps}",
         "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
         "-g", "15", "-movflags", "+faststart", dst],
        stdin=subprocess.PIPE)
    rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4
    ratio = np.array([0.375], np.float32)
    n = 0
    size = ow * oh * 3
    total = max(1, int(dur * fps))
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        img = np.frombuffer(buf, np.uint8).reshape(oh, ow, 3).astype(np.float32) / 255.0
        x = img.transpose(2, 0, 1)[None]
        fgr, pha, *rec = sess.run(None, {"src": x, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3],
                                         "downsample_ratio": ratio})
        a = np.clip(pha[0, 0], 0, 1)
        # endurecer un poco el borde: menos halo, sin perder pelo
        a = np.clip((a - 0.08) / 0.84, 0, 1)
        enc.stdin.write((a * 255 + 0.5).astype(np.uint8).tobytes())
        n += 1
        if n % 60 == 0:
            print(f"{n}/{total}", flush=True)
    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(json.dumps({"frames": n, "fps": fps, "w": ow, "h": oh}))


if __name__ == "__main__":
    main()
