"""Transcribe a video/audio file to word-level JSON for the Estudio de Edición editor.

usage: python3 -I transcribe.py <media> <model_dir> <out.json> [lang]
Output: {"language":..,"duration":..,"words":[{"w":"hola","s":0.12,"e":0.40}],"segments":[...]}
"""
import json, subprocess, sys, tempfile, os

media, model_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
lang = sys.argv[4] if len(sys.argv) > 4 else "es"

from faster_whisper import WhisperModel

import numpy as np

if True:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", media, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    wav = np.frombuffer(raw, dtype=np.float32)
    model = WhisperModel(model_dir, device="cpu", compute_type="int8")
    segs, info = model.transcribe(wav, language=lang, word_timestamps=True, vad_filter=True, beam_size=5)
    words, segments = [], []
    for s in segs:
        segments.append({"s": round(s.start, 3), "e": round(s.end, 3), "text": s.text.strip()})
        for w in (s.words or []):
            t = w.word.strip()
            if t:
                words.append({"w": t, "s": round(w.start, 3), "e": round(w.end, 3)})

json.dump({"language": info.language, "duration": round(info.duration, 3), "words": words, "segments": segments},
          open(out, "w"), ensure_ascii=False, indent=1)
print(f"{len(words)} palabras, {len(segments)} segmentos -> {out}")
