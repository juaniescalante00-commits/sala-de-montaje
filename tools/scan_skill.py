"""Chequeo de seguridad estático de una skill (no ejecuta nada del repo).
Uso: python3 -I scan.py <carpeta del repo>
Busca: llamadas de red y dominios, lectura de claves y variables de entorno, comandos peligrosos,
hooks de instalación, servicios pagos, telemetría y código ofuscado."""
import os, re, sys, json, collections

ROOT = sys.argv[1]
CODE_EXT = {'.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.sh', '.bash', '.ps1', '.json', '.toml', '.yml', '.yaml', '.md', '.html'}
CHECKS = {
    'red': r"requests\.(get|post|put)|urllib\.request|http\.client|httpx|aiohttp|\bfetch\(|axios|XMLHttpRequest|\bcurl\b|\bwget\b|socket\.socket|websocket|smtplib|ftplib|Invoke-WebRequest|urlopen",
    'claves': r"os\.environ|getenv\(|process\.env|API_KEY|_TOKEN|SECRET|PASSWORD|\.env\b|keyring|credentials",
    'peligroso': r"rm -rf|\bsudo\b|chmod 777|\beval\(|\bexec\(|shell=True|os\.system\(|\|\s*(sh|bash)\b|pickle\.load|__import__\(|base64\.b64decode|atob\(|child_process|execSync|spawnSync|Remove-Item -Recurse",
    'instalacion': r"postinstall|preinstall|\"install\":|npx |pip install|uv pip|npm i(nstall)? -g|brew install|apt(-get)? install|setup\.sh",
    'pagos': r"openai|elevenlabs|replicate|assemblyai|anthropic|fal\.ai|stability|runwayml|adobe|gemini|deepgram|stripe|paypal|subscription|pricing|credits?\b|api\.heygen",
    'telemetria': r"posthog|sentry|segment\.io|mixpanel|amplitude|analytics|telemetry|track\(",
}
DOMAIN = re.compile(r"https?://([a-zA-Z0-9.-]+)")
res = collections.defaultdict(list)
domains = collections.Counter()
long_lines = []
for d, _, files in os.walk(ROOT):
    if '/.git' in d or 'node_modules' in d:
        continue
    for f in files:
        p = os.path.join(d, f)
        ext = os.path.splitext(f)[1].lower()
        if ext not in CODE_EXT and f not in ('Dockerfile', 'Makefile'):
            continue
        try:
            txt = open(p, encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        rel = os.path.relpath(p, ROOT)
        for i, line in enumerate(txt.splitlines(), 1):
            for k, rx in CHECKS.items():
                if re.search(rx, line, re.I):
                    res[k].append(f"{rel}:{i}: {line.strip()[:160]}")
            for m in DOMAIN.finditer(line):
                domains[m.group(1).lower()] += 1
            if ext in {'.py', '.js', '.mjs', '.sh'} and len(line) > 400:
                long_lines.append(f"{rel}:{i} ({len(line)} caracteres)")
            if re.search(r"[A-Za-z0-9+/=]{300,}", line) and ext != '.json':
                long_lines.append(f"{rel}:{i} posible blob base64")
out = {k: v for k, v in res.items()}
out['dominios'] = domains.most_common()
out['lineas_largas_u_ofuscadas'] = long_lines
print(json.dumps({k: (v if k == 'dominios' else v[:400]) for k, v in out.items()}, ensure_ascii=False, indent=1))
