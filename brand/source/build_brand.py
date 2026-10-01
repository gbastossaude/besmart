"""
ERBE — gerador dos ativos de marca.

Toda a marca (símbolo, lettering, assinaturas e ícones) nasce deste arquivo,
a partir de parâmetros geométricos. Nada é desenhado "a olho" fora daqui.

Requisitos: python3, fontTools (pip install fonttools brotli) e o arquivo
variável da Sora (Google Fonts, licença OFL) salvo como source/Sora.woff2.

Uso:  python3 brand/source/build_brand.py
Saída: brand/logo/*.svg, brand/icons/*.svg, brand/social/*.svg e
       brand/source/marks.json (paths usados pela interface).
"""
import json, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from geometry import symbol

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ---------------------------------------------------------------- cores
ONIX = '#0B0F0E'      # primária
VERDE = '#17664D'     # secundária (Verde ERBE)
JADE = '#7BBB9F'      # destaque sobre fundo escuro
PAPEL = '#F6F5F0'     # fundo claro institucional
BRANCO = '#FFFFFF'

# ---------------------------------------------------------------- símbolo
# Escudo-E: o escudo (proteção) recortado por duas fendas forma o "E" de ERBE.
# Os três braços são as três linhas da casa — Saúde, Seguros e Patrimônio.
# O braço central é mais curto (como no E do lettering) e a base é a mais
# larga: fundação. Caixa do desenho: x -46..46, y 0..114 (92 × 114).
SYM = dict(sx=-19, slits=((33, 41), (65, 73)), notch=28)
# Versão de tamanho reduzido (≤ 24 px): fendas mais abertas para não "fechar".
SYM_SMALL = dict(sx=-20, slits=((31, 42), (64, 75)), notch=26)
SW, SH = 92, 114


def sym_d(params=SYM, x=0, y=0, h=SH):
    s = h / SH
    return f'<path transform="translate({x + 46 * s:.3f} {y:.3f}) scale({s:.5f})" d="{symbol(**params)}"/>'


# ---------------------------------------------------------------- fonte
_font = {}


def font(w):
    if w not in _font:
        f = TTFont(os.path.join(HERE, 'Sora.woff2'))
        _font[w] = instantiateVariableFont(f, {'wght': w})
    return _font[w]


def cap_ratio(w):
    f = font(w)
    return f['OS/2'].sCapHeight / f['head'].unitsPerEm


def glyph(ch, w, size, x, y):
    f = font(w); gs = f.getGlyphSet(); n = f.getBestCmap()[ord(ch)]
    pen = SVGPathPen(gs); sc = size / f['head'].unitsPerEm
    gs[n].draw(TransformPen(pen, (sc, 0, 0, -sc, x, y)))
    bp = BoundsPen(gs); gs[n].draw(bp)
    b = bp.bounds or (0, 0, 0, 0)
    return pen.getCommands(), b[0] * sc, b[2] * sc, gs[n].width * sc


def text_run(s, w, size, x, y, track_em):
    out, cx = '', x
    for i, ch in enumerate(s):
        d, x0, x1, adv = glyph(ch, w, size, cx, y)
        out += d if ch != ' ' else ''
        cx += adv + (track_em * size if i < len(s) - 1 else 0)
    return out


def text_ink_width(s, w, size, track_em):
    first = glyph(s[0], w, size, 0, 0); last = glyph(s[-1], w, size, 0, 0)
    adv = sum(glyph(c, w, size, 0, 0)[3] for c in s) + track_em * size * (len(s) - 1)
    return adv - first[1] - (last[3] - last[2]), first[1]


# ---------------------------------------------------------------- lettering
# Base: Sora SemiBold (600), redesenhada:
#  · E com braço central encurtado (84 % do superior), o mesmo gesto do símbolo;
#  · espaçamento óptico próprio (o E aberto pede menos ar, o B redondo também);
#  · tracking amplo e fixo — o nome nunca é composto em fonte, só em curva.
E_CUSTOM = 'M90 0V-730H229V0Z M209 0V-120H540V0Z M209 -311V-431H461V-311Z M209 -610V-730H532V-610Z'
WM_W = 600
WM_GAP = 0.50                 # espaço entre letras, em altura de versal
WM_OPTICAL = (0.80, 0.94, 0.90)  # E→R, R→B, B→E


def wordmark(x, baseline, cap):
    size = cap / cap_ratio(WM_W); sc = size / 1000
    out, cx = '', x
    for i, ch in enumerate('ERBE'):
        _, x0, x1, _ = glyph(ch, WM_W, size, 0, 0)
        if ch == 'E':
            out += f'<path transform="translate({cx - x0:.3f} {baseline:.3f}) scale({sc:.6f})" d="{E_CUSTOM}"/>'
        else:
            d, *_ = glyph(ch, WM_W, size, cx - x0, baseline)
            out += f'<path d="{d}"/>'
        cx += x1 - x0
        if i < 3:
            cx += WM_GAP * cap * WM_OPTICAL[i]
    return out, cx - x


DESC = 'PROTEÇÃO E PATRIMÔNIO'
DESC_W = 500
DESC_TRACK = 0.14


def descriptor(x, baseline, width):
    """Descritor ajustado à largura exata do lettering (bloco justificado)."""
    probe = 10.0
    ink, _ = text_ink_width(DESC, DESC_W, probe, DESC_TRACK)
    size = probe * width / ink
    _, lsb = text_ink_width(DESC, DESC_W, size, DESC_TRACK)
    return text_run(DESC, DESC_W, size, x - lsb, baseline, DESC_TRACK), size * cap_ratio(DESC_W)


# ---------------------------------------------------------------- assinaturas
def svg(w, h, body, pad, bg=None):
    rect = f'<rect x="{-pad}" y="{-pad}" width="{w + 2 * pad:.2f}" height="{h + 2 * pad:.2f}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad:.2f} {-pad:.2f} {w + 2 * pad:.2f} {h + 2 * pad:.2f}" '
            f'width="{w + 2 * pad:.0f}" height="{h + 2 * pad:.0f}">{rect}{body}</svg>')


def lockup_horizontal(c_sym, c_word, c_desc, h=200, with_desc=True, bg=None):
    """Símbolo à esquerda; ERBE + descritor à direita. Área de proteção = 1/2 da altura do símbolo."""
    gap = h * 0.30; tx = SW * h / SH + gap
    if with_desc:
        cap = h * 0.33
        _, ww = wordmark(0, 0, cap)
        _, dcap_probe = descriptor(0, 0, ww)
        dgap = cap * 0.42
        block = cap + dgap + dcap_probe
        top = (h - block) / 2
        wm, ww = wordmark(tx, top + cap, cap)
        ds, dcap = descriptor(tx, top + cap + dgap + dcap_probe, ww)
        body = f'<g fill="{c_sym}">{sym_d(x=0, y=0, h=h)}</g><g fill="{c_word}">{wm}</g><path fill="{c_desc}" d="{ds}"/>'
    else:
        cap = h * 0.40
        wm, ww = wordmark(tx, (h + cap) / 2, cap)
        body = f'<g fill="{c_sym}">{sym_d(x=0, y=0, h=h)}</g><g fill="{c_word}">{wm}</g>'
    return svg(tx + ww, h, body, h * 0.5, bg)


def lockup_vertical(c_sym, c_word, c_desc, h=200, bg=None):
    """Logo principal: símbolo sobre o nome, descritor justificado abaixo."""
    cap = h * 0.27
    _, ww = wordmark(0, 0, cap)
    sw = SW * h / SH
    W = max(ww, sw)
    wy = h + h * 0.20 + cap
    wm, _ = wordmark((W - ww) / 2, wy, cap)
    _, dcap = descriptor(0, 0, ww)
    dy = wy + cap * 0.42 + dcap
    ds, _ = descriptor((W - ww) / 2, dy, ww)
    body = (f'<g fill="{c_sym}">{sym_d(x=(W - sw) / 2, y=0, h=h)}</g><g fill="{c_word}">{wm}</g>'
            f'<path fill="{c_desc}" d="{ds}"/>')
    return svg(W, dy, body, h * 0.4, bg)


def symbol_svg(c, params=SYM, bg=None, pad=None):
    pad = SH * 0.18 if pad is None else pad
    return svg(SW, SH, f'<g fill="{c}">{sym_d(params)}</g>', pad, bg)


def app_icon(bg, fg, size=512, radius=None, params=SYM, scale=0.56):
    """Ícone quadrado (app, favicon, avatar). O símbolo ocupa 56 % da altura."""
    h = size * scale; w = SW * h / SH
    x = (size - w) / 2; y = (size - h) / 2 + size * 0.01
    r = f' rx="{radius}"' if radius else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
            f'<rect width="{size}" height="{size}"{r} fill="{bg}"/><g fill="{fg}">{sym_d(params, x, y, h)}</g></svg>')


def write(rel, content):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(content + '\n')


def main():
    V = {  # versão: (símbolo, nome, descritor, fundo)
        'positivo': (VERDE, ONIX, VERDE, None),
        'negativo': (PAPEL, PAPEL, JADE, None),
        'mono-preto': (ONIX, ONIX, ONIX, None),
        'mono-branco': (BRANCO, BRANCO, BRANCO, None),
        'sobre-verde': (PAPEL, PAPEL, PAPEL, None),
    }
    for k, (a, b, c, bg) in V.items():
        write(f'logo/erbe-principal-{k}.svg', lockup_vertical(a, b, c, bg=bg))
        write(f'logo/erbe-horizontal-{k}.svg', lockup_horizontal(a, b, c, bg=bg))
        write(f'logo/erbe-reduzido-{k}.svg', lockup_horizontal(a, b, c, with_desc=False, bg=bg))
        write(f'logo/erbe-simbolo-{k}.svg', symbol_svg(a))
    write('logo/erbe-simbolo-pequeno-positivo.svg', symbol_svg(VERDE, SYM_SMALL))
    write('logo/erbe-simbolo-pequeno-mono-preto.svg', symbol_svg(ONIX, SYM_SMALL))

    # ícones de aplicativo / navegador
    write('icons/favicon.svg', app_icon(ONIX, PAPEL, 64, radius=14, params=SYM_SMALL, scale=0.64))
    write('icons/app-icon.svg', app_icon(ONIX, PAPEL, 512, radius=0))
    write('icons/app-icon-maskable.svg', app_icon(ONIX, PAPEL, 512, scale=0.44))
    write('icons/app-icon-verde.svg', app_icon(VERDE, PAPEL, 512, radius=0))
    write('social/erbe-avatar.svg', app_icon(ONIX, PAPEL, 1080, scale=0.46))
    write('social/erbe-avatar-verde.svg', app_icon(VERDE, PAPEL, 1080, scale=0.46))

    # paths consumidos pela interface (sprite inline no index.html)
    cap = 73.0
    wm, ww = wordmark(0, cap, cap)
    ds, dcap = descriptor(0, cap + 0.42 * cap + 10.0, ww)
    json.dump({
        'symbol': {'viewBox': f'0 0 {SW} {SH}', 'd': symbol(**SYM, ox=46)},
        'symbolSmall': {'viewBox': f'0 0 {SW} {SH}', 'd': symbol(**SYM_SMALL, ox=46)},
        'wordmark': {'viewBox': f'0 0 {ww:.3f} {cap}', 'svg': wm},
    }, open(os.path.join(HERE, 'marks.json'), 'w'), indent=1)
    print('ok — ativos gerados em', ROOT)


if __name__ == '__main__':
    main()
