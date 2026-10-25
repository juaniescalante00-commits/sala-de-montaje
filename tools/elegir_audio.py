#!/usr/bin/env python3
"""Sala de Montaje · elegir música y sonidos por datos.

Cruza el índice de audio del repo (datos/audio/indice.json: BPM, energía, curva, golpes, clima, tonalidad…) con lo que
el editor tiene de verdad subido (colección library de la base) y con el kit curado de sonidos (settings/sonidos), y
devuelve candidatos ordenados. Solo sirve lo que está en la biblioteca: lo demás existe en la compu de Juani pero no se
puede usar en la Sala.

Entradas:
  --indice datos/audio/indice.json
  --biblioteca <carpeta>   la colección library bajada con ArtifactData (list, out_dir) → <carpeta>/<doc_id>.json
  --kit <sonidos.json>     settings/sonidos (opcional; sin kit no se puede usar ningún SFX: la regla "sonido" lo saca)
Filtros (todos opcionales):
  --tipo musica|sonido   --clima "épico"   --etiqueta oscuro   --carpeta Energético   --uso whoosh|impacto|riser|…
  --energia 0.5-0.9      --bpm 90-120      --dur 30-          (rangos "min-max", cualquiera de los lados vacío)
  --texto "drone"        (busca en nombre y carpeta)
  --n 10                 (cuántos devuelve)  --json (salida JSON en vez de tabla)

Ejemplo: python3 tools/elegir_audio.py --indice datos/audio/indice.json --biblioteca db/library --tipo musica \
           --energia 0.6- --bpm 95-130 --dur 40-
Salida: id de library para la op `musica`/`sonido` del editor (campo `lib`), y los datos para alinear: primer_beat,
golpes, golpe_principal (en un SFX, dónde cae el impacto), curva_energia (16 tramos)."""
import argparse, glob, json, os, re, sys, unicodedata


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def rango(txt):
    if not txt:
        return None
    a, _, b = txt.partition('-')
    return (float(a) if a.strip() else None, float(b) if b.strip() else None)


def dentro(v, r):
    if r is None:
        return True
    if v is None:
        return False
    return (r[0] is None or v >= r[0]) and (r[1] is None or v <= r[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--indice', required=True)
    ap.add_argument('--biblioteca', required=True)
    ap.add_argument('--kit')
    for k in ('tipo', 'clima', 'etiqueta', 'carpeta', 'uso', 'energia', 'bpm', 'dur', 'texto'):
        ap.add_argument('--' + k)
    ap.add_argument('--n', type=int, default=10)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()

    items = json.load(open(a.indice, encoding='utf-8'))['items']
    lib = {}
    for f in glob.glob(os.path.join(a.biblioteca, '*.json')):
        d = json.load(open(f, encoding='utf-8'))
        d = d.get('data', d)  # por si viene envuelto
        lib[os.path.basename(f)[:-5]] = d
    kit = {}
    if a.kit:
        k = json.load(open(a.kit, encoding='utf-8'))
        kit = (k.get('data', k) or {}).get('apto', {})

    # library por (tipo, nombre normalizado): el índice y la biblioteca no siempre comparten id (carpetas anidadas,
    # puntos finales en el nombre), así que se cruza primero por id y si no por nombre (+ duración para desempatar)
    por_nombre = {}
    for lid, d in lib.items():
        por_nombre.setdefault((d.get('kind'), norm(d.get('name'))), []).append(lid)

    def resolver(it):
        if it['doc_id'] in lib:
            return it['doc_id']
        c = por_nombre.get((it['tipo'], norm(it['nombre'])), [])
        if len(c) > 1:
            c.sort(key=lambda lid: abs((lib[lid].get('dur') or 0) - (it.get('dur') or 0)))
        return c[0] if c else None

    r_en, r_bpm, r_dur = rango(a.energia), rango(a.bpm), rango(a.dur)
    out, sin_subir = [], 0
    for it in items:
        if a.tipo and it['tipo'] != a.tipo:
            continue
        if a.clima and norm(a.clima) not in norm(it.get('clima')):
            continue
        if a.etiqueta and norm(a.etiqueta) not in [norm(e) for e in it.get('etiquetas') or []]:
            continue
        if a.carpeta and norm(a.carpeta) not in norm(it.get('carpeta')):
            continue
        if a.texto and norm(a.texto) not in norm(it.get('nombre')) + ' ' + norm(it.get('carpeta')):
            continue
        if not (dentro(it.get('energia'), r_en) and dentro(it.get('bpm'), r_bpm) and dentro(it.get('dur'), r_dur)):
            continue
        lid = resolver(it)
        if not lid:
            sin_subir += 1
            continue
        uso = kit.get(lid)
        if it['tipo'] == 'sonido':
            if not uso:
                continue  # fuera del kit curado: el editor lo sacaría
            if a.uso and norm(a.uso) != norm(uso):
                continue
        out.append({'lib': lid, 'tipo': it['tipo'], 'nombre': lib[lid].get('name'), 'carpeta': it.get('carpeta'),
                    'uso': uso, 'dur': it.get('dur'), 'energia': it.get('energia'), 'bpm': it.get('bpm'),
                    'primer_beat': it.get('primer_beat'), 'tonalidad': it.get('tonalidad'), 'clima': it.get('clima'),
                    'etiquetas': it.get('etiquetas'), 'golpe_principal': it.get('golpe_principal'),
                    'golpes': it.get('golpes'), 'curva_energia': it.get('curva_energia')})
    # orden: más cerca del centro del rango de energía pedido; si no hay rango, por energía
    centro = None
    if r_en:
        lo, hi = r_en[0] if r_en[0] is not None else 0, r_en[1] if r_en[1] is not None else 1
        centro = (lo + hi) / 2
    out.sort(key=lambda o: abs((o['energia'] or 0) - centro) if centro is not None else -(o['energia'] or 0))
    out = out[:a.n]
    if a.json:
        print(json.dumps({'candidatos': out, 'en_indice_pero_no_subidos': sin_subir}, ensure_ascii=False, indent=1))
        return
    for o in out:
        extra = f"bpm {o['bpm']:.0f} · 1er beat {o['primer_beat']} s" if o['bpm'] else f"golpe en {o['golpe_principal']} s"
        print(f"{o['lib']}  {o['tipo']:<6} {o['dur']:>6.1f} s  energía {o['energia']:.2f}  {extra}  · {o['clima']} · "
              f"{o['uso'] or o['carpeta']} · {o['nombre']}")
    print(f"({len(out)} candidatos; {sin_subir} del índice cumplen el filtro pero no están subidos a la Sala)", file=sys.stderr)


if __name__ == '__main__':
    main()
