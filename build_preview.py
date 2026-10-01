#!/usr/bin/env python3
"""Gera dist/atos-preview.html: um único arquivo com CSS e JS embutidos,
rodando no modo demonstração (dados de exemplo em memória)."""
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, 'web')
OUT = os.path.join(BASE, 'dist', 'atos-preview.html')

html = open(os.path.join(WEB, 'index.html'), encoding='utf-8').read()
css = open(os.path.join(WEB, 'css', 'atos.css'), encoding='utf-8').read()

ordem = re.findall(r'<script src="js/([^"?]+)(?:\?[^"]*)?"></script>', html)
# na prévia o motor de demonstração vai embutido (no site ele é baixado sob demanda)
ordem.insert(ordem.index('api.js'), 'demo.js')
partes = []
for nome in ordem:
    if nome in ('config.js', 'vendor/supabase.js'):
        continue  # a prévia não conecta ao banco
    partes.append(f'/* ---- {nome} ---- */\n' + open(os.path.join(WEB, 'js', nome), encoding='utf-8').read())
js = '\n'.join(partes)
js_safe = js.replace('</script', '<\\/script')

cabeca = ("<script>window.ATOS_CONFIG = { MODO: 'demo' }; window.ATOS_FORCE_DEMO = true; window.ATOS_PREVIEW = true;</script>\n")

html = re.sub(r'\s*<!-- Configuração[^>]*-->', '', html)
html = re.sub(r'\s*<script src="js/[^"]+"></script>', '', html)
html = re.sub(r'\s*<script>window.addEventListener\(\'DOMContentLoaded\'[^<]*</script>', '', html)
html = re.sub(r'<link rel="stylesheet" href="css/atos\.css[^"]*">', lambda m: '<style>\n' + css + '\n</style>', html)
html = html.replace('</body>', cabeca + '<script>\n' + js_safe + '\n</script>\n</body>')   # main.js inicia o App
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf-8').write(html)
print('gerado', OUT, round(len(html) / 1024), 'KB')
