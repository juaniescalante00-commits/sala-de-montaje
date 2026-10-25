# Scripts locales (compu de Juani)

Dos scripts que corren en Windows, gratis y sin cuentas ni claves. Leen el material de
`C:\Users\usr\Videos\Sala de Montaje` y escriben solo datos livianos en `datos/` de este repo.

| Script | Lee | Escribe |
| --- | --- | --- |
| `indice_audio.py` | `Música` y `Sonidos` (o `SFX`) | `datos/audio/indice.csv` y `indice.json` |
| `ficha_referencia.py` | `referencias` (la crea vacía si no existe) | `datos/referencias/<nombre>/ficha.md`, `ficha.json`, `tira.jpg` e `indice.md` |

## Instalar (una sola vez)

En PowerShell:

```powershell
winget install Python.Python.3.12
winget install Gyan.FFmpeg
# cerrá y abrí PowerShell, después en la carpeta del repo:
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r local\requirements.txt
```

Si PowerShell no deja activar el entorno: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Correr

```powershell
.venv\Scripts\Activate.ps1
python local\indice_audio.py
python local\ficha_referencia.py
```

- La primera ficha baja el modelo de transcripción (`small`, unos 500 MB, gratis). Después anda sin internet.
- Lo que no cambió no se vuelve a analizar. `--forzar` rehace todo.
- Una sola referencia: `python local\ficha_referencia.py "Mi reel.mp4"`.
- Otra carpeta base: `--base "D:\Sala de Montaje"`, o una vez por sesión `$env:SALA_BASE = "D:\Sala de Montaje"`.
- Más opciones (idioma, modelo `medium` para más precisión, sensibilidad de cortes): `--help`.

## Subir

Commit y push de la carpeta `datos/` (GitHub Desktop sirve). El `.gitignore` frena audios y videos: si alguno aparece
para subir, no lo subas.
