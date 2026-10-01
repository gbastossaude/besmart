"""
ERBE — conteúdos para o Instagram (lote 1).

Gera brand/source/content.html; render_social.js exporta para
brand/social/conteudos/<serie>/<nn>.png.

    python3 brand/source/build_content.py
    node brand/source/render_social.js content.html

Séries (proporção do plano de conteúdo: ensinar > método > ofertar):
  metodo, coparticipacao, carencia, consorcio-ou-financiamento,
  seguro-de-vida, frases, stories.
Textos de legenda, roteiros de Reels e calendário: brand/social/conteudos/PLANO.md
"""
import os
import build_social as B
from build_social import THEMES, AMARELO, icon, sym, sym_arm, header, footer, frame

B.ICONS.update({
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    'repeat': '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'scale': '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    'bookmark': '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
})

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1080, 1350


def gold_or(t):
    """Acento do tema: amarelo no Ônix, verde no Papel, branco no Verde (nunca amarelo sobre verde)."""
    return t.get('gold') or t['accent']


# ------------------------------------------------------------------ layouts de card
def cat_line(t, cat, ic):
    return f'<p class="cat" style="color:{gold_or(t)}">{icon(ic, 34, 1.6)}<span>{cat}</span></p>'


def cover(sid, n, total, cat, ic, title, sub, arm=None):
    t = THEMES['onix']
    mark = f'<div class="cv-mark">{sym_arm(240, arm, t["sym_base"], t["accent"])}</div>' if arm is not None else f'<div class="cv-mark">{sym(240, "#1F2624")}</div>'
    inner = f'''{header(t)}{mark}
      <div class="cv-body">{cat_line(t, cat, ic)}
        <h1 class="k-title" style="font-size:104px;margin-top:36px">{title}</h1>
        <p class="body" style="color:{t["muted"]};margin-top:36px">{sub}</p></div>
      {footer(t, n, total, 'Arraste para entender')}'''
    return frame(f'{sid}--{n:02d}', W, H, 'onix', inner, f'{sid} {n}/{total}')


def text_card(sid, n, total, theme, kicker, title, body, extra=''):
    t = THEMES[theme]
    inner = f'''{header(t)}
      <div class="mid"><p class="eyebrow" style="color:{gold_or(t)}">{kicker}</p>
      <h2 class="k-title" style="font-size:88px;margin-top:28px">{title}</h2>
      <p class="body" style="color:{t["muted"]};margin-top:36px">{body}</p>
      {extra}</div>
      {footer(t, n, total)}'''
    return frame(f'{sid}--{n:02d}', W, H, theme, inner, f'{sid} {n}/{total}')


def compare_card(sid, n, total, kicker, title, a, b, rows, note=''):
    t = THEMES['papel']
    cells = f'<div class="h"></div><div class="h" style="color:{t["accent"]}">{a}</div><div class="h" style="color:{t["fg"]}">{b}</div>'
    for label, va, vb in rows:
        cells += f'<div class="l" style="color:{t["muted"]};border-color:{t["line"]}">{label}</div><div style="border-color:{t["line"]}"><b>{va}</b></div><div style="border-color:{t["line"]}">{vb}</div>'
    note_html = f'<p class="note" style="color:{t["muted"]}">{note}</p>' if note else ''
    inner = f'''{header(t)}
      <p class="eyebrow" style="color:{t["accent"]};margin-top:88px">{kicker}</p>
      <h2 class="k-title" style="font-size:72px;margin-top:24px">{title}</h2>
      <div class="cmp">{cells}</div>{note_html}
      {footer(t, n, total)}'''
    return frame(f'{sid}--{n:02d}', W, H, 'papel', inner, f'{sid} {n}/{total}')


def values_card(sid, n, total, kicker, title, rows, note):
    t = THEMES['papel']
    li = ''.join(f'<li style="border-color:{t["line"]}"><span class="v" style="color:{t["accent"]}">{v}</span><span>{l}</span></li>' for v, l in rows)
    inner = f'''{header(t)}
      <p class="eyebrow" style="color:{t["accent"]};margin-top:88px">{kicker}</p>
      <h2 class="k-title" style="font-size:72px;margin-top:24px">{title}</h2>
      <ul class="vals">{li}</ul>
      <p class="note" style="color:{t["muted"]}">{note}</p>
      {footer(t, n, total)}'''
    return frame(f'{sid}--{n:02d}', W, H, 'papel', inner, f'{sid} {n}/{total}')


def yes_no_card(sid, n, total, kicker, title, yes, no):
    t = THEMES['papel']
    col = lambda head, items, ic, color: (
        f'<div class="yn"><p class="yn-h" style="color:{color}">{icon(ic, 30, 2)}{head}</p>'
        + ''.join(f'<p class="yn-i" style="border-color:{t["line"]}">{i}</p>' for i in items) + '</div>')
    inner = f'''{header(t)}
      <p class="eyebrow" style="color:{t["accent"]};margin-top:88px">{kicker}</p>
      <h2 class="k-title" style="font-size:76px;margin-top:24px">{title}</h2>
      <div class="yn-grid">{col("Faz sentido para quem", yes, "check", t["accent"])}{col("Pode sair caro para quem", no, "x", t["muted"])}</div>
      {footer(t, n, total)}'''
    return frame(f'{sid}--{n:02d}', W, H, 'papel', inner, f'{sid} {n}/{total}')


def checklist_card(sid, n, total, theme, kicker, title, items, body=''):
    t = THEMES[theme]
    li = ''.join(f'<li style="border-color:{t["line"]}"><span class="ck" style="border-color:{t["fg"]}">{i + 1}</span><span>{x}</span></li>' for i, x in enumerate(items))
    body_html = f'<p class="body" style="color:{t["muted"]};margin-top:28px">{body}</p>' if body else ''
    inner = f'''{header(t)}
      <p class="eyebrow" style="color:{gold_or(t)};margin-top:88px">{kicker}</p>
      <h2 class="k-title" style="font-size:80px;margin-top:24px">{title}</h2>{body_html}
      <ul class="ckl">{li}</ul>
      {footer(t, n, total)}'''
    return frame(f'{sid}--{n:02d}', W, H, theme, inner, f'{sid} {n}/{total}')


def step_card(sid, n, total, theme, step, steps, title, body, ic):
    t = THEMES[theme]
    on = gold_or(t)
    bar = ''.join(f'<i style="background:{on if i <= step else t["line"]}"></i>' for i in range(1, steps + 1))
    inner = f'''{header(t)}
      <div class="stepbar">{bar}</div>
      <div class="mid"><div class="step-row"><span class="chip" style="background:{t["chip"]};color:{t["accent"]}">{icon(ic, 64, 1.5)}</span><p class="step-n" style="color:{on}">Etapa 0{step} de 0{steps}</p></div>
      <h2 class="k-title" style="font-size:112px;margin-top:56px">{title}</h2>
      <p class="body" style="color:{t["muted"]};margin-top:36px">{body}</p></div>
      {footer(t, n, total)}'''
    return frame(f'{sid}--{n:02d}', W, H, theme, inner, f'{sid} {n}/{total}')


def cta_card(sid, n, total, title, body, note=''):
    t = THEMES['onix']
    note_html = f'<p class="note" style="color:{t["muted"]}">{note}</p>' if note else ''
    inner = f'''{header(t)}
      <div class="cv-mark">{sym(240, "#1F2624")}</div>
      <div class="cv-body">
        <h2 class="k-title" style="font-size:88px">{title}</h2>
        <p class="body" style="color:{t["muted"]};margin-top:32px">{body}</p>
        <div class="cta-row" style="margin-top:56px;padding-top:0"><span class="cta" style="background:{AMARELO};color:#0B0F0E">Fale com a ERBE {icon("arrow-right", 34, 1.8)}</span><span style="color:{t["muted"]}">Link na bio</span></div>
        {note_html}
      </div>
      {footer(t, n, total, f'{icon("bookmark", 26, 1.8)} Salve para consultar depois')}'''
    return frame(f'{sid}--{n:02d}', W, H, 'onix', inner, f'{sid} {n}/{total}')


def quote_card(sid, theme, text, sub):
    t = THEMES[theme]
    mark_color = AMARELO if theme == 'onix' else t['accent']
    inner = f'''{header(t)}
      <div class="q-wrap">
        <span class="q-mark" style="color:{mark_color}">“</span>
        <p class="k-title q-text">{text}</p>
        <p class="q-sub" style="color:{t["muted"]}">{sub}</p>
      </div>'''
    return frame(sid, W, H, theme, inner, f'{sid}')


# ------------------------------------------------------------------ stories interativos
def story_tpl(sid, theme, kicker, title, body, sticker_hint):
    t = THEMES[theme]
    inner = f'''<div class="story">{header(t)}
        <p class="eyebrow" style="color:{gold_or(t)};margin-top:150px">{kicker}</p>
        <h2 class="k-title" style="font-size:104px;margin-top:28px">{title}</h2>
        <p class="body" style="color:{t["muted"]};margin-top:36px;font-size:38px">{body}</p>
        <div class="sticker-zone" data-hint="{sticker_hint}"></div>
      </div>'''
    return frame(sid, W, 1920, theme, inner, f'{sid} · espaço livre para {sticker_hint}')


# ------------------------------------------------------------------ séries
def serie_metodo():
    s, T = 'metodo', 6
    steps = [
        ('onix', 'Entender', 'Uma conversa de 20 minutos: quem são, o que têm hoje, o que incomoda e o que não podem perder.', 'users'),
        ('papel', 'Comparar', 'Operadoras e seguradoras lado a lado: rede, carência, coparticipação, coberturas e custo projetado.', 'scale'),
        ('papel', 'Recomendar', 'Três opções, uma recomendação e o motivo dela — e uma página dizendo o que não está coberto.', 'file-text'),
        ('verde', 'Acompanhar', 'Reajuste, inclusão, reembolso, sinistro. Depois de assinar, você liga para a gente, não para o 0800.', 'repeat'),
    ]
    out = [cover(s, 1, T, 'Como a ERBE trabalha', 'search', 'Como funciona um estudo ERBE.', 'Quatro etapas. Nenhuma começa pelo preço.')]
    for i, (th, ti, bo, ic) in enumerate(steps, 1):
        out.append(step_card(s, i + 1, T, th, i, 4, ti, bo, ic))
    out.append(cta_card(s, 6, T, 'A gente estuda antes de indicar.', 'Saúde, seguros ou consórcio: o primeiro passo é uma conversa, não uma cotação.'))
    return out


def serie_copart():
    s, T = 'coparticipacao', 6
    return [
        cover(s, 1, T, 'Plano de Saúde · Entenda', 'heart-pulse', 'Coparticipação não é desconto. É troca.', 'Como funciona, e para quem faz sentido.', arm=1),
        text_card(s, 2, T, 'papel', 'Como funciona', 'Você paga menos por mês. E uma parte quando usa.',
                  'A mensalidade fica mais baixa. Em troca, a cada consulta, exame ou terapia, você participa com um valor fixo ou um percentual — que varia de operadora para operadora.'),
        compare_card(s, 3, T, 'Lado a lado', 'Com ou sem coparticipação?', 'Com', 'Sem', [
            ('Mensalidade', 'Menor', 'Maior'),
            ('Ao usar', 'Paga uma parte', 'Não paga a mais'),
            ('Custo no ano', 'Varia com o uso', 'Previsível'),
            ('Combina com', 'Quem usa pouco', 'Quem usa com frequência'),
        ]),
        yes_no_card(s, 4, T, 'Perfil', 'A escolha depende do seu uso, não do preço.',
                    ['Usa pouco o plano', 'Quer reduzir o custo fixo', 'Prefere pagar sob demanda'],
                    ['Usa o plano com frequência', 'Faz acompanhamento recorrente', 'Quer previsibilidade total']),
        text_card(s, 5, T, 'verde', 'O detalhe que muda tudo', 'Pergunte pelo teto.',
                  'Limite por evento e teto mensal de coparticipação são o que protegem o seu orçamento. Se ninguém falou deles, pergunte antes de assinar.'),
        cta_card(s, 6, T, 'Na dúvida, a gente faz a conta.', 'Comparamos os dois cenários com o seu uso real — e mostramos qual sai mais em conta no ano.'),
    ]


def serie_carencia():
    s, T = 'carencia', 5
    return [
        cover(s, 1, T, 'Plano de Saúde · Entenda', 'clock', 'Carência: quanto tempo até poder usar?', 'Os prazos mais comuns — e quando dá para reduzir.', arm=1),
        values_card(s, 2, T, 'Prazos de referência', 'O que libera e quando.', [
            ('24 h', 'Urgência e emergência'),
            ('30 dias', 'Consultas e exames simples'),
            ('180 dias', 'Internações e exames complexos'),
            ('300 dias', 'Parto'),
            ('24 meses', 'Doenças e lesões preexistentes (CPT)'),
        ], 'Prazos mais praticados pelo mercado. Os máximos são definidos pela Lei 9.656/98 e cada operadora pode reduzir.'),
        text_card(s, 3, T, 'papel', 'Dá para reduzir?', 'Muitas vezes, sim.',
                  'Quem já tem plano pode negociar redução ou usar a portabilidade de carências, conforme as regras da ANS. Em planos empresariais com 30 vidas ou mais, a carência pode não ser exigida para quem entra no prazo.'),
        checklist_card(s, 4, T, 'verde', 'Antes de trocar de plano', 'Três cuidados que evitam começar do zero.', [
            'Peça a carta de permanência do plano atual.',
            'Confirme se o novo plano aceita portabilidade.',
            'Não cancele o atual antes da nova vigência começar.',
        ]),
        cta_card(s, 5, T, 'Trocar sem perder o que já cumpriu.', 'A gente confere a sua carência atual antes de indicar qualquer plano novo.'),
    ]


def serie_consorcio():
    s, T = 'consorcio-ou-financiamento', 5
    note = 'Administradoras autorizadas e fiscalizadas pelo Banco Central do Brasil. A ERBE atua como representante.'
    return [
        cover(s, 1, T, 'Consórcio · Entenda', 'key-round', 'Consórcio ou financiamento?', 'Os dois levam ao mesmo bem. O caminho é que muda.', arm=2),
        compare_card(s, 2, T, 'Lado a lado', 'Mesmo destino, custos diferentes.', 'Consórcio', 'Financiamento', [
            ('Juros', 'Não tem — há taxa de administração', 'Tem'),
            ('Quando recebe', 'Na contemplação', 'Logo após a aprovação'),
            ('Custo total', 'Costuma ser menor', 'Costuma ser maior'),
            ('Combina com', 'Quem pode planejar', 'Quem precisa agora'),
        ], 'Comparação geral. Valores, taxas e prazos dependem de cada contrato.'),
        text_card(s, 3, T, 'papel', 'Como funciona a contemplação', 'Sorteio ou lance, todo mês.',
                  'O grupo contempla participantes por sorteio e por lance. Com o lance você oferece um valor para antecipar a carta de crédito, conforme as regras do grupo. Ninguém garante data — e a gente diz isso antes.'),
        checklist_card(s, 4, T, 'verde', 'Faz sentido se', 'Você constrói patrimônio com plano.', [
            'Não tem pressa para usar o bem.',
            'Quer disciplina para juntar sem pagar juros.',
            'Quer usar o lance de forma estratégica.',
        ]),
        cta_card(s, 5, T, 'Imóvel ou veículo, com plano.', 'A gente simula prazo, parcela e estratégia de lance antes de você decidir.', note),
    ]


def serie_vida():
    s, T = 'seguro-de-vida', 5
    myths = [
        ('“É caro.”', 'O valor depende de idade, capital e coberturas. Muitas vezes cabe no orçamento mais do que se imagina — o único jeito de saber é simular.'),
        ('“Só serve depois que eu morrer.”', 'Muitas apólices também cobrem invalidez, doenças graves e afastamento. O que entra depende do contrato — e a gente mostra antes de você assinar.'),
        ('“O da empresa já basta.”', 'O seguro em grupo costuma ter capital limitado e termina quando o vínculo termina. Vale comparar com o que a sua família precisaria.'),
    ]
    out = [cover(s, 1, T, 'Seguros · Entenda', 'shield-check', 'Seguro de vida: 3 ideias que custam caro.', 'E o que costuma ser verdade em cada uma.', arm=0)]
    for i, (ti, bo) in enumerate(myths, 1):
        out.append(text_card(s, i + 1, T, 'papel', f'Ideia 0{i}', ti, bo))
    out.append(cta_card(s, 5, T, 'Quem depende de você hoje?', 'Essa é a primeira pergunta do nosso estudo de seguro de vida. A segunda é: por quanto tempo?'))
    return out


def serie_frases():
    return [
        quote_card('frases--01', 'onix', 'Você vai saber o que não está coberto antes de assinar.', 'Padrão ERBE · Sem letra miúda'),
        quote_card('frases--02', 'papel', 'Comparar é fácil. Saber o que comparar, não.', 'A gente estuda antes de indicar.'),
        quote_card('frases--03', 'verde', 'No dia em que precisar usar, você liga para a gente — não para o 0800.', 'Acompanhamento ERBE'),
        quote_card('frases--04', 'onix', 'Proteção de verdade é alguém do seu lado quando o contrato precisa valer.', 'ERBE · Proteção e Patrimônio'),
    ]


def serie_stories():
    return [
        story_tpl('stories--01-enquete', 'onix', 'Enquete', 'Você sabe qual é a carência do seu plano?', 'Responda aqui embaixo. Amanhã a gente explica os prazos.', 'a enquete “Sei / Não sei”'),
        story_tpl('stories--02-caixinha', 'papel', 'Caixinha de perguntas', 'Qual é a sua dúvida sobre proteção?', 'Plano de saúde, seguro ou consórcio. As melhores perguntas viram post.', 'a caixinha de perguntas'),
        story_tpl('stories--03-quiz', 'verde', 'Verdadeiro ou falso?', 'Consórcio tem juros.', 'Vote antes de ver a resposta no próximo story.', 'o quiz / enquete V ou F'),
        story_tpl('stories--04-resposta', 'onix', 'Resposta', 'Falso. Consórcio não tem juros.', 'Tem taxa de administração, definida no contrato. Quer entender se faz sentido para você? Responda este story.', 'o link ou “Responder”'),
    ]


EXTRA_CSS = '''
.cat { display: inline-flex; align-items: center; gap: 16px; font: 600 24px Inter; letter-spacing: .2em; text-transform: uppercase; }
.k-title { font-family: Sora; font-weight: 600; letter-spacing: -.03em; line-height: 1.05; max-width: 888px; }
.cv-mark { position: absolute; right: 96px; top: 210px; }
.cv-body { margin-top: auto; padding-bottom: 72px; }
.cv-body + .ft { margin-top: 0; }
.mid { margin: auto 0; padding: 40px 0; }
.mid + .ft { margin-top: 0; }
.vals ~ .ft, .cmp ~ .ft { margin-top: auto; }
.step-row { display: flex; align-items: center; gap: 28px; }
.cmp { margin-top: 40px; display: grid; grid-template-columns: 220px 1fr 1fr; column-gap: 28px; }
.cmp > div { padding: 18px 0; border-top: 2px solid; font: 400 30px/1.3 Inter; }
.cmp b { font-weight: 600; }
.cmp .h { border-top: 0; padding: 0 0 14px; font: 600 24px Inter; letter-spacing: .14em; text-transform: uppercase; }
.cmp .l { font-size: 26px; padding-top: 22px; }
.vals { list-style: none; margin-top: 44px; }
.vals li { display: grid; grid-template-columns: 260px 1fr; align-items: baseline; padding: 14px 0; border-top: 2px solid; font: 400 32px/1.3 Inter; }
.vals .v { font: 600 50px Sora; letter-spacing: -.03em; }
.yn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; }
.yn-h { display: flex; align-items: center; gap: 12px; font: 600 24px Inter; letter-spacing: .1em; text-transform: uppercase; padding-bottom: 18px; }
.yn-i { padding: 24px 0; border-top: 2px solid; font: 500 32px/1.3 Inter; }
.ckl { list-style: none; margin-top: auto; }
.ckl li { display: flex; align-items: center; gap: 28px; padding: 30px 0; border-top: 2px solid; font: 500 36px/1.3 Inter; }
.ckl + .ft { margin-top: 40px; }
.ck { flex-shrink: 0; width: 64px; height: 64px; border: 2px solid; border-radius: 16px; display: grid; place-items: center; font: 600 30px Sora; }
.stepbar { display: flex; gap: 12px; margin-top: 96px; }
.stepbar i { flex: 1; height: 8px; border-radius: 4px; }
.step-n { font: 600 26px Inter; letter-spacing: .2em; text-transform: uppercase; }
.q-wrap { margin-top: auto; margin-bottom: auto; }
.q-mark { display: block; font: 600 260px/0.8 Sora; height: 150px; }
.q-text { font-size: 84px; line-height: 1.1; }
.q-sub { margin-top: 48px; font: 600 24px Inter; letter-spacing: .2em; text-transform: uppercase; }
.ft > span:first-child { display: inline-flex; align-items: center; gap: 12px; }
.sticker-zone { flex: 1; min-height: 480px; margin: 48px 0 260px; }
'''


def main():
    pieces = serie_metodo() + serie_copart() + serie_carencia() + serie_consorcio() + serie_vida() + serie_frases() + serie_stories()
    html = (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>ERBE · Conteúdos Instagram</title>'
            f'<style>{B.CSS}{EXTRA_CSS}</style></head><body>{"".join(pieces)}</body></html>')
    open(os.path.join(HERE, 'content.html'), 'w').write(html)
    print(f'ok — {len(pieces)} peças em brand/source/content.html')


if __name__ == '__main__':
    main()
