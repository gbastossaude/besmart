# ERBE · Kit social — 3 pilares

Arquivos prontos para postar (PNG, tamanho exato de cada rede).

## Perfil

| Arquivo | Onde usar |
|---|---|
| `avatar-onix.png` (1080×1080) | Foto de perfil principal — Instagram, WhatsApp Business, LinkedIn, Facebook |
| `avatar-verde.png` (1080×1080) | Alternativa para campanhas ou para diferenciar uma segunda conta |
| `destaque-erbe.png`, `destaque-seguros.png`, `destaque-saude.png`, `destaque-consorcio.png` (1080×1920) | Capas dos destaques do Instagram |
| `banner-linkedin.png` (1584×396) | Capa do LinkedIn (o texto fica à direita, longe da foto de perfil) |

O símbolo fica centralizado com folga para o recorte circular. Não aplique filtro, moldura ou sombra.

## Carrossel do feed — 5 cards (1080×1350, 4:5)

Ordem: `feed-01-capa` → `feed-02-seguros` → `feed-03-saude` → `feed-04-consorcio` → `feed-05-fale-com-a-erbe`

**Legenda sugerida**

> Três pilares. Uma só casa.
>
> Seguros, plano de saúde e consórcio costumam ficar espalhados — cada um com um corretor, um contrato e ninguém olhando o conjunto.
>
> Na ERBE é um interlocutor só. A gente estuda o seu caso, compara as opções lado a lado e explica o que cada uma cobre e o que fica de fora — antes da assinatura.
>
> Arraste para conhecer cada pilar e, se fizer sentido, chama a gente no direct ou pelo link na bio.
>
> ERBE · Proteção e Patrimônio
> #seguros #planodesaude #consorcio #protecaopatrimonial #saudeempresarial #segurodevida #saopaulo

## Posts individuais

Cada card dos pilares (2, 3 e 4) também funciona sozinho no feed.

**Seguros** (`feed-02-seguros.png`)
> Seguro bom é o que funciona no dia em que você precisa. Vida, empresarial, residencial e auto: a gente compara coberturas e mostra o que fica de fora antes de você assinar.
> #seguros #segurodevida #seguroempresarial #seguroresidencial #seguroauto

**Plano de Saúde** (`feed-03-saude.png`)
> A rede certa, antes de precisar. Plano para empresas (PME), MEI, adesão e família — com carência, coparticipação e reajuste explicados antes, nunca depois.
> #planodesaude #planodesaudeempresarial #saudepme #mei #planoodontologico

**Consórcio** (`feed-04-consorcio.png`)
> Patrimônio se constrói com plano. Imóvel ou veículo sem juros, com taxa de administração clara desde o início. Consórcio não é financiamento nem investimento — e a gente explica a diferença antes de você decidir.
> Administradoras autorizadas e fiscalizadas pelo Banco Central do Brasil. A ERBE atua como representante.
> #consorcio #consorciodeimoveis #consorciodeveiculos #patrimonio

## Stories (1080×1920)

`story-01-seguros`, `story-02-saude`, `story-03-consorcio` — um por dia, na sequência.
A faixa inferior foi deixada livre para a barra de resposta do Instagram. A chamada
("Responda com SEGUROS…") convida a conversa antes de qualquer proposta: responda
sempre com uma pergunta, nunca com preço.

## Regras de publicação

- Alternar peças escuras e claras na grade (o carrossel já segue essa ordem).
- Não escrever preço, "melhor custo-benefício", "últimos dias" ou superlativos.
- Em post patrocinado de plano de saúde que cite um produto específico, incluir operadora e registro ANS.
- Para editar textos: `brand/source/build_social.py` → `python3 build_social.py` → `node render_social.js`.
