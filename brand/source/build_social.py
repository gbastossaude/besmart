"""
ERBE — kit para redes sociais.

Gera brand/source/social.html com todas as peças (cada uma é um .frame com o
tamanho exato da rede). Depois rode render_social.js para exportar os PNGs:

    python3 brand/source/build_social.py
    node brand/source/render_social.js        # requer playwright

Peças:
  · avatar (perfil Instagram / WhatsApp / LinkedIn) — Ônix e Verde
  · capas de destaque — ERBE, Seguros, Saúde, Consórcio
  · banner LinkedIn
  · carrossel "3 pilares" (5 cards 4:5)
  · stories dos 3 pilares (9:16)
"""
import json, os
from geometry import symbol, split, t_at_y, pt

HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.path.join(HERE, 'marks.json')))
SYM_D = M['symbol']['d']                     # viewBox 0 0 92 114
WORD = M['wordmark']['svg'].replace('<path ', '<path fill="currentColor" ')
HANDLE = '@erbeprotecao'

ICONS = {  # Lucide v0.468 (ISC)
    'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    'heart-pulse': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
    'key-round': '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
}


def icon(name, size, stroke=1.4, cls=''):
    return (f'<svg class="ic {cls}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>')


def sym(h, color='currentColor', style=''):
    w = h * 92 / 114
    return f'<svg class="sym" width="{w:.1f}" height="{h}" viewBox="0 0 92 114" style="{style}"><path fill="{color}" d="{SYM_D}"/></svg>'


# Faixas de cada braço do E (coordenadas do símbolo): meio das fendas como limite.
ARMS = [(0, 37), (37, 69), (69, 114)]


def sym_arm(h, arm, base, accent, style=''):
    """Símbolo com um braço destacado — o pilar da peça."""
    w = h * 92 / 114; y0, y1 = ARMS[arm]; cid = f'arm{arm}{int(h)}'
    return (f'<svg class="sym" width="{w:.1f}" height="{h}" viewBox="0 0 92 114" style="{style}">'
            f'<defs><clipPath id="{cid}"><rect x="0" y="{y0}" width="92" height="{y1 - y0}"/></clipPath></defs>'
            f'<path fill="{base}" d="{SYM_D}"/><path fill="{accent}" clip-path="url(#{cid})" d="{SYM_D}"/></svg>')


def lockup(sym_h, word_h, color, sym_color=None):
    ww = word_h * 302.06 / 73
    return (f'<span class="lockup" style="color:{color}">{sym(sym_h, sym_color or "currentColor")}'
            f'<svg width="{ww:.1f}" height="{word_h}" viewBox="0 0 302.06 73">{WORD}</svg></span>')


def anatomy(h):
    """Capa: o símbolo com cada braço ligado ao seu pilar."""
    s = h / 114
    right = ((46, 56), (46, 84), (26, 103), (0, 114))
    def curve_x(y):
        return pt(right, t_at_y(right, y))[0] + 46
    anchors = [(24, 92), (53, 74), (88, curve_x(88))]
    labels = [('01', 'Seguros', 'Vida, empresa, casa e carro'),
              ('02', 'Plano de Saúde', 'Empresas, MEI e famílias'),
              ('03', 'Consórcio', 'Imóveis e veículos')]
    W = 900
    lx = 92 * s + 90
    out = [f'<svg width="{W}" height="{h}" viewBox="0 0 {W} {h}" style="overflow:visible">',
           f'<g transform="scale({s})"><path fill="#F6F5F0" d="{SYM_D}"/></g>']
    for (y, x), (n, name, sub) in zip(anchors, labels):
        X, Y = x * s + 18, y * s
        out.append(f'<line x1="{X:.1f}" y1="{Y:.1f}" x2="{lx - 24:.1f}" y2="{Y:.1f}" stroke="#7BBB9F" stroke-width="2"/>')
        out.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="6" fill="#7BBB9F"/>')
        out.append(f'<text x="{lx}" y="{Y - 8:.1f}" class="an-n">{n}</text>')
        out.append(f'<text x="{lx + 56}" y="{Y - 8:.1f}" class="an-t">{name}</text>')
        out.append(f'<text x="{lx + 56}" y="{Y + 34:.1f}" class="an-s">{sub}</text>')
    out.append('</svg>')
    return ''.join(out)


THEMES = {
    'onix': dict(bg='#0B0F0E', fg='#F6F5F0', muted='#9AA29E', accent='#7BBB9F', line='rgba(246,245,240,.14)', sym_base='#2A3230', sym_word='#F6F5F0', chip='rgba(123,187,159,.12)'),
    'papel': dict(bg='#F6F5F0', fg='#0B0F0E', muted='#5E6863', accent='#17664D', line='rgba(11,15,14,.12)', sym_base='#E6E8E3', sym_word='#0B0F0E', chip='#E2EFE8'),
    'verde': dict(bg='#17664D', fg='#F6F5F0', muted='#C9E2D6', accent='#F6F5F0', line='rgba(246,245,240,.22)', sym_base='rgba(246,245,240,.22)', sym_word='#F6F5F0', chip='rgba(246,245,240,.12)'),
}

PILLARS = [
    dict(key='seguros', n='01', arm=0, theme='papel', icon='shield-check', name='Seguros', sub='Vida, empresa, casa e carro',
         title='Entre você e o imprevisto.',
         body='Seguro bom é o que funciona no dia em que você precisa. Por isso a gente compara coberturas e mostra o que fica de fora antes da assinatura.',
         items=['Vida', 'Empresarial', 'Residencial', 'Auto'],
         story_cta='Responda com SEGUROS e receba um estudo.'),
    dict(key='saude', n='02', arm=1, theme='verde', icon='heart-pulse', name='Plano de Saúde', sub='Empresas, MEI e famílias',
         title='A rede certa, antes de precisar.',
         body='Para empresas, MEI e famílias. Carência, coparticipação e reajuste explicados antes — nunca depois.',
         items=['Empresarial (PME)', 'Adesão', 'Individual e familiar', 'Odontológico'],
         story_cta='Responda com SAÚDE e receba um estudo.'),
    dict(key='consorcio', n='03', arm=2, theme='onix', icon='key-round', name='Consórcio', sub='Imóveis e veículos',
         title='Patrimônio se constrói com plano.',
         body='Imóvel ou veículo sem juros, com taxa de administração clara desde o início. Não é financiamento nem investimento — e a gente explica a diferença.',
         items=['Imóveis', 'Veículos', 'Estratégia de lance', 'Acompanhamento do grupo'],
         note='Administradoras autorizadas e fiscalizadas pelo Banco Central do Brasil. A ERBE atua como representante.',
         story_cta='Responda com CONSÓRCIO e receba um estudo.'),
]


def header(t, total=None, page=None):
    right = f'<span class="handle" style="color:{t["muted"]}">{HANDLE}</span>'
    return f'<div class="hd">{lockup(58, 24, t["fg"], t["accent"] if t is THEMES["papel"] else t["fg"])}{right}</div>'


def footer(t, page, total, left='A gente estuda antes de indicar.'):
    dots = ''.join(f'<i style="background:{t["fg"] if i == page else t["line"]}"></i>' for i in range(1, total + 1))
    arrow = icon('arrow-right', 34, 1.6) if page < total else ''
    return (f'<div class="ft" style="border-color:{t["line"]};color:{t["muted"]}"><span>{left}</span>'
            f'<span class="pager"><span class="dots">{dots}</span><span style="color:{t["fg"]}">{arrow}</span></span></div>')


def frame(fid, w, h, theme, inner, label):
    t = THEMES[theme]
    return (f'<figure><div class="frame" id="{fid}" style="width:{w}px;height:{h}px;background:{t["bg"]};color:{t["fg"]}">{inner}</div>'
            f'<figcaption>{label} · {w}×{h}</figcaption></figure>')


def card_cover():
    t = THEMES['onix']
    inner = f'''
      {header(t)}
      <p class="eyebrow" style="color:{t["accent"]};margin-top:96px">Proteção e Patrimônio</p>
      <h1 class="title" style="font-size:96px;margin-top:28px">Três pilares.<br><span style="color:{t["accent"]}">Uma só casa.</span></h1>
      <div style="margin-top:84px">{anatomy(470)}</div>
      {footer(t, 1, 5, 'Arraste para conhecer cada um')}'''
    return frame('feed-01-capa', 1080, 1350, 'onix', inner, 'Carrossel 1/5 · capa')


def card_pillar(p, page):
    t = THEMES[p['theme']]
    items = ''.join(f'<li style="border-color:{t["line"]}">{icon("check", 30, 2, "")}<span>{i}</span></li>' for i in p['items'])
    note = f'<p class="note" style="color:{t["muted"]}">{p["note"]}</p>' if p.get('note') else ''
    inner = f'''
      {header(t)}
      <div class="pill-head">
        <span class="chip" style="background:{t["chip"]};color:{t["accent"]}">{icon(p["icon"], 64, 1.5)}</span>
        <p class="eyebrow" style="color:{t["accent"]}">Pilar {p["n"]}<br><span style="color:{t["fg"]}">{p["name"]}</span></p>
        <span class="arm-mark">{sym_arm(150, p["arm"], t["sym_base"], t["accent"])}</span>
      </div>
      <h2 class="title" style="font-size:88px;margin-top:48px;max-width:880px">{p["title"]}</h2>
      <p class="body" style="color:{t["muted"]};margin-top:24px">{p["body"]}</p>
      <ul class="items" style="color:{t["fg"]}">{items}</ul>
      {note}
      {footer(t, page, 5)}'''
    return frame(f'feed-0{page}-{p["key"]}', 1080, 1350, p['theme'], inner, f'Carrossel {page}/5 · {p["name"]}')


def card_cta():
    t = THEMES['papel']
    rows = ''.join(
        f'<li style="border-color:{t["line"]}"><span class="rn" style="color:{t["accent"]}">{p["n"]}</span>'
        f'<span class="rt">{p["name"]}</span><span class="rs" style="color:{t["muted"]}">{p["sub"]}</span></li>'
        for p in PILLARS)
    inner = f'''
      {header(t)}
      <p class="eyebrow" style="color:{t["accent"]};margin-top:48px">Como a ERBE trabalha</p>
      <h2 class="title" style="font-size:76px;margin-top:20px">Um interlocutor<br>para os três.</h2>
      <p class="body" style="color:{t["muted"]};margin-top:24px;font-size:31px">Você recebe um estudo escrito, com as opções lado a lado, o que cada uma cobre e o motivo da recomendação. E continua falando com a gente depois de assinar.</p>
      <ul class="rows">{rows}</ul>
      <div class="cta-row"><span class="cta" style="background:#0B0F0E;color:#F6F5F0">Fale com a ERBE {icon("arrow-right", 34, 1.8)}</span><span style="color:{t["muted"]}">Link na bio</span></div>
      {footer(t, 5, 5, 'Proteger o que continua.')}'''
    return frame('feed-05-fale-com-a-erbe', 1080, 1350, 'papel', inner, 'Carrossel 5/5 · chamada')


def story(p):
    t = THEMES[p['theme']]
    items = ' <span class="sep">·</span> '.join(f'<span class="nw">{i}</span>' for i in p['items'])
    note = f'<p class="note" style="color:{t["muted"]};margin-top:32px;font-size:24px">{p["note"]}</p>' if p.get('note') else ''
    cta_bg, cta_fg = ('#0B0F0E', '#F6F5F0') if p['theme'] == 'papel' else ('#F6F5F0', '#0B0F0E')
    inner = f'''
      <div class="story">
        {header(t)}
        <div style="margin-top:96px">{sym_arm(190, p["arm"], t["sym_base"] if p["theme"] != "papel" else "#D9DDD8", t["accent"])}</div>
        <p class="eyebrow" style="color:{t["accent"]};margin-top:64px">Pilar {p["n"]} · {p["name"]}</p>
        <h2 class="title" style="font-size:104px;margin-top:24px">{p["title"]}</h2>
        <p class="body" style="color:{t["muted"]};margin-top:40px;font-size:38px">{p["body"]}</p>
        <p class="inline-items" style="color:{t["fg"]};border-color:{t["line"]}">{items}</p>
        {note}
        <div class="story-cta" style="background:{cta_bg};color:{cta_fg}">{icon("message-circle", 44, 1.8)}<span>{p["story_cta"]}</span></div>
      </div>'''
    return frame(f'story-{p["n"]}-{p["key"]}', 1080, 1920, p['theme'], inner, f'Story · {p["name"]}')


def avatar(fid, theme, label):
    t = THEMES[theme]
    inner = f'<div class="center">{sym(500, t["fg"] if theme != "papel" else "#17664D", "transform:translateY(8px)")}</div>'
    return frame(fid, 1080, 1080, theme, inner, label)


def highlight(fid, content, label):
    inner = f'<div class="center"><div class="hl">{content}</div></div>'
    return frame(fid, 1080, 1920, 'onix', inner, label)


def banner():
    t = THEMES['onix']
    inner = f'''
      <div class="banner">
        <div class="bn-ghost">{sym(620, "#141917")}</div>
        <div class="bn-text">
          {lockup(64, 26, "#F6F5F0")}
          <p class="bn-claim">Proteger o que continua.</p>
          <p class="bn-lines" style="color:{t["accent"]}">Seguros&nbsp;&nbsp;·&nbsp;&nbsp;Plano de Saúde&nbsp;&nbsp;·&nbsp;&nbsp;Consórcio</p>
        </div>
      </div>'''
    return frame('banner-linkedin', 1584, 396, 'onix', inner, 'Banner LinkedIn')


CSS = '''
@font-face { font-family: Sora; font-weight: 100 800; src: url(Sora.woff2) format("woff2"); }
@font-face { font-family: Inter; font-weight: 100 900; src: url(Inter.woff2) format("woff2"); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #2A3230; font-family: Inter, sans-serif; padding: 40px; display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start; }
figure { display: grid; gap: 10px; }
figcaption { color: #C2C8C5; font: 500 14px Inter; }
.frame { position: relative; overflow: hidden; padding: 96px; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; isolation: isolate; }
.hd { display: flex; justify-content: space-between; align-items: center; }
.lockup { display: inline-flex; align-items: center; gap: 22px; }
.handle { font: 500 26px Inter; letter-spacing: .01em; }
.eyebrow { font: 600 24px Inter; letter-spacing: .2em; text-transform: uppercase; line-height: 1.5; }
.title { font-family: Sora; font-weight: 600; letter-spacing: -.03em; line-height: 1.04; }
.body { font: 400 34px/1.5 Inter; max-width: 860px; }
.ft { margin-top: auto; padding-top: 32px; border-top: 2px solid; display: flex; justify-content: space-between; align-items: center; font: 500 24px Inter; }
.pager { display: flex; align-items: center; gap: 28px; }
.dots { display: flex; gap: 10px; } .dots i { width: 10px; height: 10px; border-radius: 50%; display: block; }
.ghost { position: absolute; z-index: -1; right: -110px; top: 170px; }
.pill-head { display: flex; align-items: center; gap: 32px; margin-top: 56px; }
.chip { width: 120px; height: 120px; border-radius: 28px; display: grid; place-items: center; }
.pill-head .eyebrow { font-size: 24px; } .pill-head .eyebrow span { font: 600 44px Sora; letter-spacing: -.02em; text-transform: none; display: block; margin-top: 6px; }
.items { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 0 40px; margin-top: auto; padding-top: 32px; }
.items + .ft, .note + .ft { margin-top: 36px; }
.arm-mark { margin-left: auto; }
.items li { display: flex; align-items: center; gap: 18px; padding: 22px 0; border-top: 2px solid; font: 500 32px/1.25 Inter; }
.items .ic { flex-shrink: 0; }
.note { font: 400 20px/1.45 Inter; margin-top: 20px; max-width: 888px; }
.rows { list-style: none; margin-top: 44px; }
.rows li { display: grid; grid-template-columns: 90px 1fr; grid-template-rows: auto auto; padding: 16px 0; border-top: 2px solid; }
.rn { font: 600 34px Sora; grid-row: span 2; padding-top: 4px; }
.rt { font: 600 44px Sora; letter-spacing: -.02em; }
.rs { font: 400 27px Inter; margin-top: 4px; }
.cta-row { display: flex; align-items: center; gap: 32px; margin-top: auto; padding-top: 32px; font: 500 28px Inter; }
.cta-row + .ft { margin-top: 48px; }
.cta { display: inline-flex; align-items: center; gap: 18px; padding: 26px 40px; border-radius: 20px; font: 600 32px Inter; }
.an-n { font: 600 30px Sora; fill: #7BBB9F; }
.an-t { font: 600 46px Sora; fill: #F6F5F0; letter-spacing: -.02em; }
.an-s { font: 400 28px Inter; fill: #9AA29E; }
.story { display: flex; flex-direction: column; height: 100%; padding-top: 60px; }
.nw { white-space: nowrap; } .sep { margin: 0 8px; opacity: .5; }
.inline-items { margin-top: 44px; padding-top: 32px; border-top: 2px solid; font: 600 30px/1.5 Inter; }
.items--story { grid-template-columns: 1fr; margin-top: 56px; }
.items--story li { font-size: 38px; padding: 26px 0; }
.story-cta { margin-top: auto; margin-bottom: 120px; display: flex; align-items: center; gap: 24px; padding: 36px 44px; border-radius: 24px; font: 600 36px/1.3 Inter; }
.center { position: absolute; inset: 0; display: grid; place-items: center; }
.hl { display: grid; place-items: center; color: #7BBB9F; }
.banner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 110px; }
.bn-ghost { position: absolute; left: 470px; top: -120px; }
.bn-text { position: relative; display: grid; justify-items: end; gap: 22px; text-align: right; }
.bn-claim { font: 600 64px Sora; letter-spacing: -.03em; color: #F6F5F0; margin-top: 18px; }
.bn-lines { font: 600 22px Inter; letter-spacing: .2em; text-transform: uppercase; }
'''


def main():
    pieces = [
        avatar('avatar-onix', 'onix', 'Perfil · Ônix (principal)'),
        avatar('avatar-verde', 'verde', 'Perfil · Verde ERBE'),
        highlight('destaque-erbe', sym(400, '#F6F5F0', 'transform:translateY(6px)'), 'Destaque · ERBE'),
        highlight('destaque-seguros', icon('shield-check', 420, 1.1), 'Destaque · Seguros'),
        highlight('destaque-saude', icon('heart-pulse', 420, 1.1), 'Destaque · Saúde'),
        highlight('destaque-consorcio', icon('key-round', 420, 1.1), 'Destaque · Consórcio'),
        banner(),
        card_cover(), card_pillar(PILLARS[0], 2), card_pillar(PILLARS[1], 3), card_pillar(PILLARS[2], 4), card_cta(),
        story(PILLARS[0]), story(PILLARS[1]), story(PILLARS[2]),
    ]
    html = f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>ERBE · Kit social</title><style>{CSS}</style></head><body>{"".join(pieces)}</body></html>'
    open(os.path.join(HERE, 'social.html'), 'w').write(html)
    print('ok — brand/source/social.html')


if __name__ == '__main__':
    main()
