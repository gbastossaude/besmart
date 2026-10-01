# ERBE · Sistema de marca v2

ERBE Proteção e Patrimônio — Planos de saúde, seguros e consórcio.
Assinatura: **Proteger o que continua.**

Este diretório é a fonte única da marca. A página **Identidade ERBE** da Central
Comercial (`index.html#marca`) mostra tudo aplicado.

## 1. Auditoria da versão anterior

| Ponto | Problema | Decisão |
|---|---|---|
| Interface | O app usava outra marca (BE.SMART: roxo `#9D7AFF`, raio Zap, itálico em caixa alta, "Full Arsenal"). Nada conversava com a ERBE. | App inteiro migrado para a ERBE. |
| Símbolo | Escudo + filete dourado + 3 colunas com capitel + base dupla = 9 peças e 3 cores. Em 32 px o filete some e as colunas viram mancha. Leitura de "banco/tribunal". | Redesenhado: uma peça só, uma cor. |
| Cor | Verde `#1B7F4E` próximo de banco cooperativo e operadora. Amarelo `#F1E1A0` some sobre branco. | Jade profundo `#17664D` + Ônix. Champanhe só como herança. |
| Lettering | Sora 500 espaçada, sem nenhum traço próprio. | Lettering desenhado em curvas, E próprio. |
| Arquivos | PNGs com a marca presa no canto de uma área enorme (até 2400 × 2400 px); sem favicon nem ícone de app. | Gerador próprio com área de proteção correta, PNG + SVG, favicon, app icon, avatar. |
| Interface | 6 cores de destaque por tela (azul, índigo, âmbar, laranja, céu, esmeralda), raios de 56 px, sombras 2xl, emojis como ícone, nenhum token. | Design system único em `assets/css/tokens.css`. |

**Preservado:** o nome, o descritor "Proteção e Patrimônio", o escudo, a ideia de
três pilares com o central diferente, o preto como base, o verde como assinatura, a
Sora e o dourado (agora champanhe, só em detalhe).

## 2. Símbolo — escudo-E

O escudo continua dizendo *proteção*. As três colunas viraram duas fendas que desenham
o **E** de ERBE dentro dele:

- **três braços** = as três linhas da casa (Saúde, Seguros, Patrimônio);
- **braço central mais curto**, o mesmo gesto do E do lettering;
- **base mais larga** = fundação, e é o que garante a leitura em 16 px.

Geometria em `source/geometry.py` (curvas cúbicas exatas). Versão **pequena**
(fendas mais abertas) para ≤ 24 px.

## 3. Lettering

Base Sora SemiBold, redesenhada e convertida em curvas: E com braço central em 84 %,
espaçamento óptico próprio (E→R 0,80 · R→B 0,94 · B→E 0,90 de 0,5 versal). O
descritor é justificado à largura exata do nome. **Nunca compor "ERBE" em fonte.**

## 4. Arquitetura

| Versão | Arquivo | Uso |
|---|---|---|
| 1 Principal (vertical) | `logo/erbe-principal-*.svg` | capas, fachada, abertura de vídeo |
| 2 Horizontal | `logo/erbe-horizontal-*.svg` | site, documentos, e-mail (mín. 160 px) |
| 3 Símbolo | `logo/erbe-simbolo-*.svg` | avatar, selo, marca-d'água |
| 4 Reduzida | `logo/erbe-reduzido-*.svg` | símbolo + nome, sem descritor (mín. 88 px) |
| 5 Positiva | `*-positivo` | Verde ERBE + Ônix sobre fundo claro |
| 6 Negativa | `*-negativo` | Papel + Jade sobre Ônix |
| 7 Monocromática | `*-mono-preto`, `*-mono-branco`, `*-sobre-verde` | uma cor |
| 8 Favicon / app | `icons/favicon.svg`, `icons/app-icon*.svg`, PNGs 16–512, `social/erbe-avatar*` | navegador, PWA, WhatsApp, redes |

Todo SVG tem PNG equivalente em `logo/png/` (1600 px, fundo transparente).
Área de proteção: ½ da altura do símbolo.

## 5. Cores

| Nome | HEX | RGB | Papel |
|---|---|---|---|
| Ônix | `#0B0F0E` | 11 15 14 | Primária · base institucional |
| Verde ERBE | `#17664D` | 23 102 77 | Secundária · marca e ação (6,9:1 sobre branco) |
| Jade | `#7BBB9F` | 123 187 159 | Destaque · só sobre escuro (8,7:1 sobre Ônix) |
| Champanhe | `#C6AE7A` | 198 174 122 | Herança · detalhe em documentos, nunca texto em fundo claro |
| Papel | `#F6F5F0` | 246 245 240 | Fundo claro institucional |
| Grafite 900 / 600 / 50 | `#1A201E` / `#5E6863` / `#F4F4F1` | — | Superfície escura · texto secundário · fundo de interface |
| Sucesso / Aviso / Erro / Info | `#17664D` / `#8A5A0B` / `#B42318` / `#2D5A73` | — | Estados de interface |

Escalas completas (Verde 50–950, Grafite 50–950) em `assets/css/tokens.css`.
Proporção por peça: 55 Ônix/grafite · 30 Papel · 12 Verde · 3 destaque.

## 6. Tipografia

- **Sora** 600 (títulos, números, marca) com tracking −1,5 % a −2,5 %.
- **Inter** 400/500/600 (texto e interface).
- Overline: Inter 600, 11 px, +16 %, caixa alta.

## 7. Regras rápidas

Sim: muito respiro, texto à esquerda, uma ideia por peça, fotografia real com luz natural,
alternar peças claras e escuras na grade.
Não: gradientes, sombras longas, mais de duas cores por peça, ícones preenchidos,
logo sobre foto sem área de proteção, recolorir ou distorcer o símbolo.

## 8. Regenerar os ativos

```bash
pip install fonttools brotli
python3 brand/source/build_brand.py   # SVGs + source/marks.json
```

Os PNGs foram rasterizados a partir dos SVGs com Chromium (Playwright).
`source/Sora.woff2` — Sora, SIL Open Font License 1.1.
Ícones da interface: subconjunto Lucide v0.468 (ISC), embutido no `index.html`.
