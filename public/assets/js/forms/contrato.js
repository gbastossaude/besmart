/* Erbe · Central — forms/contrato.js
   Contrato: régua automática, campos por pilar e cronograma editável.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ---------- régua que se preenche sozinha ----------
   Escolhida a régua e informado o valor, o cronograma aparece pronto.
   Enquanto ninguém mexer à mão, mudar o valor, as datas ou a régua
   refaz tudo; depois da primeira edição manual, o que foi digitado manda. */
let editorAuto = false, assinaturaRegua = "";
function preencherPelaRegua(regraId, silencioso, forcar){
  const regra = regraPorId(regraId); if(!regra) return false;
  const ctx = ctxContrato(null);
  if(!ctx.base){
    if(!silencioso) toast("Informe o valor (mensalidade, prêmio ou crédito) e as parcelas se preenchem pela régua.");
    return false;
  }
  // nada mudou desde o último preenchimento: não redesenha (redesenhar no blur do campo
  // de valor apagava a célula que a pessoa estava clicando)
  const assinatura = [regra.id, ctx.base, ctx.inicio, val("kFim"), ctx.basePct].join("|");
  if(!forcar && editorAuto && assinatura===assinaturaRegua && editorParcelas.length) return true;
  assinaturaRegua = assinatura;
  const falso = { valorBase:ctx.base, inicio:ctx.inicio, fim: val("kFim") || addDays(addMonths(ctx.inicio,12),-1), regraId:regra.id, comissoes:[] };
  const geradas = gerarCronograma(falso).map(p=>({ tipo:p.tipo, vence:p.vence, pct:p.pct, valor:p.valor,
    status:"previsto", recebidoEm:"", valorRecebido:null, impostoPct:null }));
  const recebidas = editorParcelas.filter(p=>p.status==="recebido");
  const ocupado = new Set(recebidas.map(p=>(p.tipo||"agenciamento")+":"+String(p.vence||"").slice(0,7)));
  editorParcelas = recebidas.concat(geradas.filter(p=>!ocupado.has(p.tipo+":"+p.vence.slice(0,7))))
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
  editorAuto = true;
  renderEditor();
  return true;
}
async function trocouRegua(){
  const id = val("kRegra");
  if(!id){ editorAuto = false; return; }
  const previstas = editorParcelas.filter(p=>p.status!=="recebido").length;
  if(previstas && !editorAuto){
    const ok = await confirmar("Preencher pela régua",
      `As ${previstas} parcela(s) previstas desta tela serão trocadas pelas da régua escolhida. As já recebidas ficam como estão.`,
      "Preencher pela régua");
    if(!ok) return;
  }
  if(!preencherPelaRegua(id, false, true)) editorAuto = true;
}
/** Alíquota do contrato em edição: a do campo, senão a padrão. */
function aliquotaEditor(){
  const el = document.getElementById("kImposto");
  return el && el.value!=="" ? paraNumero(el.value) : (Number(S.config.impostoPadrao)||0);
}
/** Como o cronograma em edição entra na previsão dos próximos 12 meses. */
function impactoPrevisao(){
  const meses = proximosMeses(12);
  const v = meses.map(m=>editorParcelas.filter(p=>p.status!=="recebido" && String(p.vence||"").slice(0,7)===m)
    .reduce((a,p)=>a+(Number(p.valor)||0),0));
  const tot = v.reduce((a,b)=>a+b,0);
  if(!tot) return "";
  const max = Math.max(...v), aliq = aliquotaEditor();
  return `<div class="impacto">
    <div class="hint" style="margin-bottom:8px"><b style="color:var(--ink-2)">Como este contrato entra na previsão</b> · ${brl(tot)} nos próximos 12 meses${aliq?` · ${brl(tot*aliq/100)} de imposto (${pctR(aliq)})`:""}</div>
    <div class="impacto-barras">${meses.map((m,i)=>`<div title="${esc(mesLabel(m))}: ${esc(brl2(v[i]))}"><span style="height:${v[i]?Math.max(4, v[i]/max*46).toFixed(1):0}px"></span><em>${esc(mesLabel(m).slice(0,3))}</em></div>`).join("")}</div>
  </div>`;
}
function abrirEditor(c, alvo){
  editorAlvo = alvo || "contrato";
  editorAuto = false; assinaturaRegua = "";
  editorBasePct = (c && c.basePct) || basePadrao(c && c.pilar);
  editorParcelas = (c && c.comissoes ? c.comissoes : []).map(p=>({
    tipo:p.tipo||"agenciamento", vence:p.vence, pct:Number(p.pct)||0, valor:Number(p.valor)||0,
    status:p.status||"previsto", recebidoEm:p.recebidoEm||"", valorRecebido:p.valorRecebido??null, travado:!!p.travado,
    impostoPct: temValor(p.impostoPct) ? Number(p.impostoPct) : null
  }));
}
/** Base, split, pilar e início: do DOM quando o formulário já existe; do contrato na primeira pintura. */
/** Trocar o pilar reabastece produto, operadora e réguas — e repinta o cronograma. */
function trocarPilar(){
  const pilar = val("kPilar");
  const setOpts = (id, arr) => { const el = document.getElementById(id);
    if(el) el.innerHTML = (arr||[]).map(o=>`<option>${esc(o)}</option>`).join(""); };
  setOpts("kProduto", S.config.produtos[pilar]);
  setOpts("kOperadora", S.config.operadoras[pilar]);
  editorBasePct = basePadrao(pilar);
  const rg = document.getElementById("kRegra");
  if(rg) rg.innerHTML = [`<option value="">— nenhuma, valores digitados —</option>`]
    .concat(S.config.regras.filter(r=>r.pilar===pilar).map(r=>`<option value="${r.id}">${esc(r.nome)}</option>`)).join("");
  const cx = document.getElementById("camposDoPilar");
  if(cx) cx.innerHTML = camposPilar(null, pilar);
  // régua do novo pilar: preenche sozinha se o cronograma ainda não foi mexido à mão
  const primeira = S.config.regras.find(r=>r.pilar===pilar);
  if(editorAlvo==="contrato" && rg && primeira && (editorAuto || !editorParcelas.some(p=>p.status!=="recebido"))){
    rg.value = primeira.id;
    if(editorAuto) editorParcelas = editorParcelas.filter(p=>p.status==="recebido");
    if(preencherPelaRegua(primeira.id, true)) return;
    editorAuto = true;
  }
  renderEditor();
}
function ctxContrato(c){
  if(editorAlvo==="lead"){
    const temL = !!document.getElementById("lValor");
    return {
      base:   temL ? numv("lValor") : Number(c&&c.valorEstimado)||0,
      mensalidade: temL ? numv("lValor") : Number(c&&c.valorEstimado)||0,
      valorTotal: 0, basePct:"base",
      vidas:  temL ? numv("lVidas") : Number(c&&c.vidas)||0,
      split:  0, comSplit:false,
      pilar:  temL ? val("lPilar") : ((c&&c.pilar)||"saude"),
      inicio: temL ? (val("lPrev")||hoje()) : ((c&&c.previsaoFechamento)||addDays(hoje(),30))
    };
  }
  const temDom = !!document.getElementById("kValor");
  const splitPadrao = c && c.splitPct!=null ? Number(c.splitPct)
    : (S.usuarios.find(u=>u.id===((c&&c.corretor)||S.uid))?.splitPct ?? 50);
  const mensalidade = temDom ? numv("kValor") : Number(c&&c.valorBase)||0;
  const valorTotal  = temDom ? numv("kValorTotal") : Number(c&&c.valorTotal)||0;
  const usaTotal = editorBasePct==="total" && valorTotal>0;
  return {
    base:   usaTotal ? valorTotal : mensalidade,
    mensalidade, valorTotal, basePct: editorBasePct,
    vidas:  temDom ? numv("kVidas") : Number(c&&c.vidas)||0,
    split:  temDom ? numv("kSplit") : splitPadrao,
    pilar:  temDom ? val("kPilar")  : ((c&&c.pilar)||"saude"),
    inicio: temDom ? (val("kInicio")||hoje()) : ((c&&c.inicio)||hoje()),
    comSplit: true
  };
}
/* ---------- os campos que só existem em um pilar ---------- */
const MODALIDADES_SAUDE = ["Empresarial","Adesão","Individual/Familiar","MEI","Odontológico"];
const RAMOS_SEGURO = ["Vida","Vida em grupo","Auto","Residencial","Empresarial","Equipamentos","Responsabilidade civil","Transportes","Rural","Outro"];
const BENS_CONSORCIO = ["Imóvel","Automóvel","Caminhão / pesado","Serviços","Moto","Outro"];

/** Cada pilar tem o que a operação dele exige. Compartilhar uma ficha só
    comissiona bem e opera mal — por isso este bloco muda com o pilar. */
function camposPilar(c, pilar){
  c = c || {};
  if(pilar==="saude") return `
    <div class="frow">
      <div class="field"><label for="kModalidade">Modalidade</label><select id="kModalidade">
        <option value="">—</option>${MODALIDADES_SAUDE.map(m=>`<option ${c.modalidade===m?"selected":""}>${esc(m)}</option>`).join("")}</select></div>
      <div class="field"><label for="kAniversario">Mês de reajuste</label><select id="kAniversario">
        <option value="">—</option>${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${String(c.mesReajuste)===String(m)?"selected":""}>${MESES[m-1]}</option>`).join("")}</select>
        <span class="hint">O aniversário do contrato, quando a operadora reajusta.</span></div>
      <div class="field"><label for="kReajuste">Último reajuste (%)</label><input id="kReajuste" type="number" step="0.01" value="${c.ultimoReajuste||""}"></div>
    </div>`;
  if(pilar==="seguros") return `
    <div class="frow">
      <div class="field"><label for="kApolice">Nº da apólice</label><input id="kApolice" type="text" value="${esc(c.apolice||"")}"></div>
      <div class="field"><label for="kRamo">Ramo</label><select id="kRamo">
        <option value="">—</option>${RAMOS_SEGURO.map(r=>`<option ${c.ramo===r?"selected":""}>${esc(r)}</option>`).join("")}</select></div>
      <div class="field"><label for="kImportancia">Importância segurada (R$)</label><input id="kImportancia" type="number" step="1000" value="${c.importanciaSegurada||""}">
        <span class="hint">O capital, não o prêmio.</span></div>
    </div>`;
  if(pilar==="consorcios") return `
    <div class="frow">
      <div class="field"><label for="kGrupo">Grupo</label><input id="kGrupo" type="text" value="${esc(c.grupo||"")}"></div>
      <div class="field"><label for="kCota">Cota</label><input id="kCota" type="text" value="${esc(c.cota||"")}"></div>
      <div class="field"><label for="kBem">Bem</label><select id="kBem">
        <option value="">—</option>${BENS_CONSORCIO.map(b=>`<option ${c.bem===b?"selected":""}>${esc(b)}</option>`).join("")}</select></div>
      <div class="field"><label for="kPrazo">Prazo (meses)</label><input id="kPrazo" type="number" value="${c.prazoMeses||""}"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="kParcela">Valor da parcela (R$)</label><input id="kParcela" type="number" step="10" value="${c.valorParcela||""}"></div>
      <div class="field"><label for="kContemplado">Contemplação</label><select id="kContemplado" data-act="mudouContemplacao">
        <option value="" ${!c.contemplado?"selected":""}>Não contemplado</option>
        <option value="sorteio" ${c.contemplado==="sorteio"?"selected":""}>Sorteio</option>
        <option value="lance" ${c.contemplado==="lance"?"selected":""}>Lance</option></select></div>
      <div class="field"><label for="kContempladoEm">Data da contemplação</label><input id="kContempladoEm" type="date" value="${esc(c.contempladoEm||"")}"></div>
    </div>`;
  return "";
}
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function camposContrato(c, comEditor){
  c = c || {};
  const pilar = c.pilar || "saude";
  return `
  <div class="frow">
    <div class="field"><label for="kPilar">Pilar</label><select id="kPilar" data-act="recalcPilar">${PK.map(x=>`<option value="${x}" ${pilar===x?"selected":""}>${PILARES[x].nome}</option>`).join("")}</select></div>
    <div class="field"><label for="kProduto">Produto</label><select id="kProduto">${(S.config.produtos[pilar]||[]).map(x=>`<option ${c.produto===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
    <div class="field"><label for="kOperadora">Operadora</label><select id="kOperadora">${(S.config.operadoras[pilar]||[]).map(o=>`<option ${c.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
  </div>
  <div class="frow">
    <div class="field"><label for="kNumero">Nº da proposta</label><input id="kNumero" type="text" value="${esc(c.numero||"")}"></div>
    <div class="field"><label for="kVidas">Vidas / itens</label><input id="kVidas" type="number" value="${c.vidas||""}" data-act="recalcVidas"></div>
    <div class="field"><label for="kStatus">Situação</label><select id="kStatus" data-act="mudouStatusContrato">${Object.entries(STATUS_CONTRATO).map(([k,v])=>`<option value="${k}" ${c.status===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
    <div class="field"><label for="kTipoPlano">Tipo de plano</label><select id="kTipoPlano">
      ${(S.config.tiposPlano||[]).map(t=>`<option ${tipoPlano(c)===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
  </div>
  <div class="frow" id="campoCancelamento" ${c.status==="cancelado"?"":'style="display:none"'}>
    <div class="field"><label for="kMotivoCancel">Motivo do cancelamento</label><select id="kMotivoCancel">
      <option value="">— escolha —</option>${(S.config.motivosCancelamento||[]).map(m=>`<option ${c.motivoCancelamento===m?"selected":""}>${esc(m)}</option>`).join("")}</select>
      <span class="hint">Alimenta a retenção e o quadro de motivos nos relatórios.</span></div>
    <div class="field"><label for="kCanceladoEm">Cancelado em</label><input id="kCanceladoEm" type="date" value="${esc(c.canceladoEm||hoje())}"></div>
  </div>
  <div id="camposDoPilar">${camposPilar(c, pilar)}</div>
  <div class="frow">
    <div class="field"><label for="kValor">Mensalidade / prêmio / crédito (R$)</label><input id="kValor" type="number" step="10" value="${c.valorBase||""}" data-act="recalcBase"></div>
    <div class="field"><label for="kInicio">Início da vigência</label><input id="kInicio" type="date" value="${c.inicio||hoje()}"></div>
    <div class="field"><label for="kFim">Fim da vigência</label><input id="kFim" type="date" value="${c.fim||addDays(addMonths(c.inicio||hoje(),12),-1)}"></div>
    <div class="field"><label for="kDiaVenc">Vencimento do boleto (dia)</label>
      <input id="kDiaVenc" type="number" min="1" max="31" value="${c.diaVencimento||""}" placeholder="10">
      <span class="hint">Alimenta os lembretes de pós-venda.</span></div>
    <div class="field"><label for="kValorTotal">Valor do contrato (R$)</label>
      <div style="display:flex;gap:6px">
        <input id="kValorTotal" type="number" step="0.01" value="${c.valorTotal||""}" placeholder="0,00">
        <button type="button" class="btn sm" data-act="calcularTotal" title="Calcular pela vigência" style="flex:none">=</button>
      </div>
      <span class="hint">O tamanho do negócio. O <b>=</b> multiplica a mensalidade pelos meses de vigência.</span></div>
  </div>
  <div class="frow">
    <div class="field"><label for="kCorretor">Corretor</label><select id="kCorretor">${optUsuarios(c.corretor||S.uid)}</select></div>
    ${veCorretora()?`<div class="field"><label for="kSplit">Split do corretor (%)</label><input id="kSplit" type="number" step="5" value="${c.splitPct??(S.usuarios.find(u=>u.id===(c.corretor||S.uid))?.splitPct ?? 50)}" data-act="recalcSplit"></div>
    <div class="field"><label for="kImposto">Imposto sobre a comissão (%)</label><input id="kImposto" type="number" step="0.01" min="0" value="${temValor(c.impostoPct)?c.impostoPct:""}" placeholder="${pctR(Number(S.config.impostoPadrao)||0)} (padrão)" data-act="recalcSplit">
      <span class="hint">Vazio = usa o padrão de Configurações.</span></div>`:""}
    <div class="field"><label for="kRegra">Régua de comissão</label>
      <select id="kRegra" data-act="trocaRegua">${[`<option value="">— nenhuma, valores digitados —</option>`]
        .concat(S.config.regras.filter(r=>r.pilar===pilar).map(r=>`<option value="${r.id}" ${c.regraId===r.id?"selected":""}>${esc(r.nome)}</option>`)).join("")}</select>
      <span class="hint">${veCorretora()?"Escolha a régua e informe o valor: as parcelas se preenchem sozinhas e continuam editáveis.":"Define como a comissão deste contrato é calculada."}</span></div>
  </div>
  ${comEditor?`<div id="editorComissao">${editorHTML(ctxContrato(c))}</div>`:""}`;
}

/* ---------- cronograma editável ---------- */
/** Valor já lançado para a n-ésima comissão de agenciamento, para o campo abrir preenchido. */
function valorMontagem(i, porVida, vidas){
  const ag = editorParcelas.filter(p=>p.tipo==="agenciamento")
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
  const p = ag[i-1];
  if(!p) return "";
  if(porVida) return p.valorVida!=null ? p.valorVida : (vidas ? +(p.valor/vidas).toFixed(2) : "");
  return p.valor;
}
/** O bloco recorrente já lançado: valor por mês, mês inicial e quantidade. */
function valorDemais(porVida, vidas){
  const vi = editorParcelas.filter(p=>p.tipo==="vitalicio")
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
  if(!vi.length) return { valor:"", ini:4, meses:0 };
  const inicio = ctxContrato(null).inicio;
  const mesRef = v => Math.max(1, Math.round(diasEntre(inicio, v)/30.44));
  const p = vi[0];
  let valor;
  if(S.unidadeVit==="pct") valor = p.pct ? +Number(p.pct).toFixed(2) : "";
  else valor = porVida ? (p.valorVida!=null ? p.valorVida : (vidas ? +(p.valor/vidas).toFixed(2) : "")) : p.valor;
  return { valor, ini:mesRef(p.vence), meses:vi.length };
}
/** Traduz o que foi digitado: por vida vira total, e o total vira % da base. */
function dicaPct(valor, base, porVida, vidas, ehVitalicio){
  const v = Number(valor)||0;
  if(!v) return "&nbsp;";
  if(ehVitalicio && S.unidadeVit==="pct"){
    if(!base) return editorBasePct==="total" ? "informe o valor do contrato" : "informe a mensalidade";
    return `${pctR(v)} de ${brl(base)} = ${brl2(base*v/100)}/mês`;
  }
  if(porVida){
    if(!vidas) return "informe as vidas";
    const tot = v*vidas;
    return `× ${vidas} vidas = ${brl2(tot)}${base?` · ${pctR(tot/base*100)} da base`:""}`;
  }
  if(!base) return "&nbsp;";
  return pctR(v/base*100)+" da base";
}
function editorHTML(ctx){
  const { base, split, pilar, inicio, comSplit, vidas } = ctx || ctxContrato(null);
  const porVida = S.modoMontagem==="vida";
  const vitEmPct = S.unidadeVit==="pct";
  const basePctAtual = (ctx||ctxContrato(null)).basePct;
  const valorTotalCtx = (ctx||ctxContrato(null)).valorTotal;
  const noLead = editorAlvo==="lead";
  const total = editorParcelas.reduce((a,p)=>a+(Number(p.valor)||0),0);
  const ag = editorParcelas.filter(p=>p.tipo==="agenciamento");
  const vi = editorParcelas.filter(p=>p.tipo==="vitalicio");

  // Quem não enxerga o lado da corretora não monta cronograma: vê o que é dele, em leitura.
  if(!veCorretora()){
    const meu = v => +((Number(v)||0)*(Number(split)||0)/100).toFixed(2);
    return `<div class="panel" style="box-shadow:none">
      <div class="panel-head"><div><h3>Sua comissão</h3>
        <div class="sub">${editorParcelas.length?`${editorParcelas.length} parcela(s) previstas`:"O gestor monta o cronograma depois de registrar o contrato"}</div></div>
        <div class="right"><b class="num" style="font-size:16px">${brl2(meu(total))}</b></div></div>
      ${editorParcelas.length?`<div class="tw"><table>
        <thead><tr><th>#</th><th>Tipo</th><th>Data prevista</th><th class="r">Sua comissão</th><th>Situação</th></tr></thead>
        <tbody>${editorParcelas.map((p,i)=>`<tr>
          <td class="num">${i+1}</td>
          <td>${esc((TIPO_PARCELA[p.tipo]||TIPO_PARCELA.agenciamento).nome)}</td>
          <td class="num">${dt(p.vence||hoje())}</td>
          <td class="r num"><b>${brl2(meu(p.valor))}</b></td>
          <td>${p.status==="recebido"?`<span class="chip ok">recebida</span>`:`<span class="chip mute">prevista</span>`}</td>
        </tr>`).join("")}</tbody></table></div>`:""}
      <div class="hint" style="padding:10px 2px 0">Quem define o cronograma de comissão é o gestor. Aqui você acompanha a sua parte.</div>
    </div>`;
  }

  return `<div class="panel" style="box-shadow:none">
    <div class="panel-head"><div><h3>${noLead?"Comissionamento previsto":"Cronograma de comissão"}</h3>
      <div class="sub">${editorParcelas.length?`${ag.length} de agenciamento · ${vi.length} de vitalício${editorAuto&&!noLead?" · preenchido pela régua, edite o que precisar":""}`:(noLead?"Monte aqui o que espera receber se o negócio fechar":"Escolha a régua e informe o valor — ou digite parcela a parcela")}</div></div>
      <div class="right"><b class="num" style="font-size:16px">${brl2(total)}</b></div></div>

    <div class="chart-wrap" style="padding-bottom:14px;border-bottom:1px solid var(--line)">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:11px">
        <div class="k" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-weight:600">Montar o cronograma</div>
        <div class="seg" role="group" aria-label="Como informar os valores">
          <button type="button" data-act="modoMontagem" data-v="total" aria-pressed="${!porVida}">Valor total</button>
          <button type="button" data-act="modoMontagem" data-v="vida" aria-pressed="${porVida}">Por vida</button>
        </div>
        ${porVida?`<div class="field" style="flex:none;min-width:104px"><label for="qcVidas">Vidas</label>
          <input id="qcVidas" type="number" min="1" value="${vidas||""}" placeholder="0" data-act="pctMontagem"></div>`:""}
      </div>
      ${editorAlvo==="contrato"?`<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:11px">
        <span class="hint" style="font-weight:600">Percentuais incidem sobre</span>
        <div class="seg" role="group" aria-label="Base de cálculo dos percentuais">
          <button type="button" data-act="basePct" data-v="base" aria-pressed="${basePctAtual!=="total"}">Mensalidade / prêmio</button>
          <button type="button" data-act="basePct" data-v="total" aria-pressed="${basePctAtual==="total"}">Valor do contrato</button>
        </div>
        <span class="hint">${base?`= ${brl(base)}`:"preencha o valor correspondente"}${
          basePctAtual==="total" && !valorTotalCtx ? ` <b style="color:var(--warn)">— sem valor do contrato, usando a mensalidade</b>` : ""}</span>
      </div>`:""}
      <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(122px,1fr))">
        ${[1,2,3].map(i=>`<div class="field">
          <label for="qc${i}">${i}ª comissão (${porVida?"R$/vida":"R$"})</label>
          <input id="qc${i}" type="number" step="0.01" value="${valorMontagem(i, porVida, vidas)}" placeholder="0,00" data-act="pctMontagem">
          <span class="hint" id="qcPct${i}">${dicaPct(valorMontagem(i, porVida, vidas), base, porVida, vidas)}</span></div>`).join("")}
      </div>
      <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(122px,1fr));margin-top:10px">
        <div class="field"><label for="qcDemais">Demais meses ${vitEmPct?(basePctAtual==="total"?"(% do contrato)":"(% da mensalidade)"):(porVida?"(R$/vida/mês)":"(R$/mês)")}</label>
          <div style="display:flex;gap:5px">
            <input id="qcDemais" type="number" step="0.01" value="${valorDemais(porVida, vidas).valor||""}" placeholder="${vitEmPct?"3":"0,00"}" data-act="pctMontagem">
            <div class="seg" style="flex:none" role="group" aria-label="Unidade do vitalício">
              <button type="button" data-act="unidadeVit" data-v="pct" aria-pressed="${vitEmPct}" style="padding:4px 8px">%</button>
              <button type="button" data-act="unidadeVit" data-v="valor" aria-pressed="${!vitEmPct}" style="padding:4px 8px">R$</button>
            </div>
          </div>
          <span class="hint" id="qcPctD">${dicaPct(valorDemais(porVida, vidas).valor, base, porVida, vidas, true)}</span></div>
        <div class="field"><label for="qcIni">A partir do mês</label>
          <input id="qcIni" type="number" min="1" value="${valorDemais().ini||4}"></div>
        <div class="field"><label for="qcMeses">Por quantos meses</label>
          <input id="qcMeses" type="number" min="0" value="${valorDemais().meses||0}">
          <span class="hint">0 = até o fim da vigência</span></div>
        <div class="field"><label>&nbsp;</label>
          <button type="button" class="btn primary" data-act="montarCronograma" style="width:100%">Montar cronograma</button></div>
      </div>
      <div class="hint" style="margin-top:9px">As três primeiras vencem 1, 2 e 3 meses após ${noLead?"a previsão de fechamento":"o início da vigência"} (${dt(inicio)}). Deixe em branco o que a operadora não paga. Parcelas já conciliadas são preservadas.</div>
      <details style="margin-top:12px">
        <summary style="cursor:pointer;font-size:11.5px;color:var(--ink-3);font-weight:600">Outras formas de preencher</summary>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
          <div class="field" style="min-width:200px"><label for="kAtalho">A partir de uma régua salva</label>
            <select id="kAtalho">${S.config.regras.filter(r=>r.pilar===pilar).map(r=>`<option value="${r.id}">${esc(r.nome)}</option>`).join("")||`<option value="">nenhuma régua neste pilar</option>`}</select></div>
          <button type="button" class="btn" data-act="aplicarRegua">Preencher</button>
          <button type="button" class="btn ghost" data-act="addParcela">+ Parcela avulsa</button>
          ${editorParcelas.length?`<button type="button" class="btn ghost danger" data-act="limparParcelas">Limpar tudo</button>`:""}
        </div>
      </details>
    </div>

    ${editorParcelas.length?`<div class="tw"><table>
      <thead><tr><th>#</th><th>Tipo</th><th>Data prevista</th><th class="r">% ${basePctAtual==="total"?"do contrato":"da base"}</th><th class="r">Valor R$</th>${vidas?`<th class="r">Por vida</th>`:""}${comSplit?(veCorretora()?`<th class="r">Corretora</th><th class="r">Corretor</th>`:`<th class="r">Sua parte</th>`):""}<th></th></tr></thead>
      <tbody>${editorParcelas.map((p,i)=>`<tr>
        <td class="num">${i+1}</td>
        <td><select data-linha="${i}" data-campo="tipo" style="padding:4px 6px;font-size:12px">
          ${Object.entries(TIPO_PARCELA).map(([k,v])=>`<option value="${k}" ${p.tipo===k?"selected":""}>${v.nome}</option>`).join("")}</select></td>
        <td><input type="date" data-linha="${i}" data-campo="vence" value="${esc(p.vence||hoje())}" style="padding:4px 6px;font-size:12px;min-width:132px"></td>
        <td><input type="number" step="0.01" data-linha="${i}" data-campo="pct" value="${p.pct||""}" style="padding:4px 6px;font-size:12px;text-align:right;min-width:78px"></td>
        <td><input type="number" step="0.01" data-linha="${i}" data-campo="valor" value="${p.valor||""}" style="padding:4px 6px;font-size:12px;text-align:right;min-width:96px"></td>
        ${vidas?`<td class="r num" data-cel="pvida-${i}" style="color:var(--ink-3)">${brl2((Number(p.valor)||0)/vidas)}</td>`:""}
        ${comSplit?`${veCorretora()?`<td class="r num" data-cel="corretora-${i}">${brl2((Number(p.valor)||0)*(100-split)/100)}</td>`:""}
        <td class="r num" data-cel="corretor-${i}">${brl2((Number(p.valor)||0)*split/100)}</td>`:""}
        <td class="r">${p.status==="recebido"
          ? `<span class="chip ok" title="Já conciliada">recebida</span>`
          : `<button type="button" class="btn sm ghost danger" data-act="delParcela" data-i="${i}" aria-label="Remover parcela ${i+1}">×</button>`}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr>
        <td colspan="4" class="r"><b>Total</b></td>
        <td class="r num"><b data-cel="total">${brl2(total)}</b></td>
        ${vidas?`<td class="r num" style="color:var(--ink-3)">${brl2(total/vidas)}</td>`:""}
        ${comSplit?`${veCorretora()?`<td class="r num" data-cel="totalCorretora">${brl2(total*(100-split)/100)}</td>`:""}
        <td class="r num" data-cel="totalCorretor">${brl2(total*split/100)}</td>`:""}<td></td>
      </tr></tfoot>
    </table></div>`:`<div class="empty" style="padding:22px"><b>Nenhuma parcela</b>${editorAlvo==="contrato"&&val("kRegra")?"Informe o valor da mensalidade, prêmio ou crédito e o cronograma aparece pela régua escolhida.":"Preencha por uma régua, gere o vitalício abaixo, ou acrescente parcelas avulsas."}</div>`}
    ${noLead?"":`<div id="impactoPrev">${impactoPrevisao()}</div>`}
  </div>`;
}
function renderEditor(){
  const el = document.getElementById("editorComissao");
  if(el) el.innerHTML = editorHTML(ctxContrato(null));
}
/** Recalcula as colunas derivadas sem redesenhar a tabela (não perde o foco). */
function atualizarDerivados(){
  const ctx = ctxContrato(null);
  const split = ctx.split, vidas = ctx.vidas;
  const total = editorParcelas.reduce((a,p)=>a+(Number(p.valor)||0),0);
  editorParcelas.forEach((p,i)=>{
    const v = Number(p.valor)||0;
    const a = document.querySelector(`[data-cel="corretora-${i}"]`); if(a) a.textContent = brl2(v*(100-split)/100);
    const b = document.querySelector(`[data-cel="corretor-${i}"]`);  if(b) b.textContent = brl2(v*split/100);
    const pv = document.querySelector(`[data-cel="pvida-${i}"]`);    if(pv && vidas) pv.textContent = brl2(v/vidas);
  });
  const t = document.querySelector('[data-cel="total"]');           if(t) t.textContent = brl2(total);
  const tc = document.querySelector('[data-cel="totalCorretora"]'); if(tc) tc.textContent = brl2(total*(100-split)/100);
  const tb = document.querySelector('[data-cel="totalCorretor"]');  if(tb) tb.textContent = brl2(total*split/100);
  const ip = document.getElementById("impactoPrev"); if(ip) ip.innerHTML = impactoPrevisao();
}
/** Edição de uma célula: % e R$ se mantêm coerentes pela base do contrato. */
function editarLinha(i, campo, valor){
  const p = editorParcelas[i]; if(!p) return;
  editorAuto = false;
  const base = ctxContrato(null).base;
  if(campo==="tipo" || campo==="vence"){ p[campo] = valor; return; }
  const n = Number(String(valor).replace(",",".")) || 0;
  if(campo==="pct"){
    p.pct = n;
    p.valor = base ? +(base*n/100).toFixed(2) : p.valor;
    const outro = document.querySelector(`[data-linha="${i}"][data-campo="valor"]`);
    if(outro && base) outro.value = p.valor;
  } else {
    p.valor = n;
    p.pct = base ? +(n/base*100).toFixed(4) : 0;
    const outro = document.querySelector(`[data-linha="${i}"][data-campo="pct"]`);
    if(outro && base) outro.value = p.pct;
  }
  atualizarDerivados();
}
/** Base mudou: o % é a razão canônica, então os valores em R$ são refeitos a partir dele. */
function rebaseParcelas(){
  // cronograma que veio da régua e não foi mexido: refaz pela régua (vitalício acompanha a vigência)
  if(editorAuto && editorAlvo==="contrato" && val("kRegra") && preencherPelaRegua(val("kRegra"), true)) return;
  const base = ctxContrato(null).base;
  if(!base) return;
  editorParcelas.forEach((p,i)=>{
    if(!(p.pct>0) || p.status==="recebido") return;
    p.valor = +(base*p.pct/100).toFixed(2);
    const el = document.querySelector(`[data-linha="${i}"][data-campo="valor"]`);
    if(el) el.value = p.valor;
  });
  atualizarDerivados();
}
function lerContrato(base){
  const c = Object.assign({}, base||{}, {
    pilar:val("kPilar"), produto:val("kProduto"), operadora:val("kOperadora"),
    numero:val("kNumero"), vidas:numv("kVidas"), status:val("kStatus")||"proposta", tipoPlano:val("kTipoPlano"),
    valorBase:numv("kValor"), inicio:val("kInicio")||hoje(), fim:val("kFim"),
    diaVencimento: Math.min(31, Math.max(0, numv("kDiaVenc"))) || null,
    valorTotal: numv("kValorTotal") || null,
    // campos próprios de cada pilar — só grava os que a tela mostrou
    modalidade: document.getElementById("kModalidade") ? val("kModalidade") : (base||{}).modalidade,
    mesReajuste: document.getElementById("kAniversario") ? (numv("kAniversario")||null) : (base||{}).mesReajuste,
    ultimoReajuste: document.getElementById("kReajuste") ? (numv("kReajuste")||null) : (base||{}).ultimoReajuste,
    apolice: document.getElementById("kApolice") ? val("kApolice") : (base||{}).apolice,
    ramo: document.getElementById("kRamo") ? val("kRamo") : (base||{}).ramo,
    importanciaSegurada: document.getElementById("kImportancia") ? (numv("kImportancia")||null) : (base||{}).importanciaSegurada,
    grupo: document.getElementById("kGrupo") ? val("kGrupo") : (base||{}).grupo,
    cota: document.getElementById("kCota") ? val("kCota") : (base||{}).cota,
    bem: document.getElementById("kBem") ? val("kBem") : (base||{}).bem,
    prazoMeses: document.getElementById("kPrazo") ? (numv("kPrazo")||null) : (base||{}).prazoMeses,
    valorParcela: document.getElementById("kParcela") ? (numv("kParcela")||null) : (base||{}).valorParcela,
    contemplado: document.getElementById("kContemplado") ? val("kContemplado") : (base||{}).contemplado,
    contempladoEm: document.getElementById("kContempladoEm") ? val("kContempladoEm") : (base||{}).contempladoEm,
    motivoCancelamento: val("kStatus")==="cancelado" ? val("kMotivoCancel") : "",
    canceladoEm: val("kStatus")==="cancelado" ? (val("kCanceladoEm") || (base||{}).canceladoEm || hoje()) : "",
    regraId:val("kRegra"), corretor:val("kCorretor"),
    impostoPct: document.getElementById("kImposto") ? (val("kImposto")==="" ? null : numv("kImposto")) : ((base||{}).impostoPct ?? null),
    splitPct: document.getElementById("kSplit") ? numv("kSplit")
              : ((base||{}).splitPct ?? (S.usuarios.find(u=>u.id===((base||{}).corretor||S.uid))?.splitPct ?? 50)),
    basePct: editorBasePct
  });
  c.comissoes = editorParcelas
    .filter(p=>Number(p.valor)>0)
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""))
    .map((p,i)=>({ n:i+1, tipo:p.tipo||"agenciamento", pct:Number(p.pct)||0,
      valor:+(Number(p.valor)||0).toFixed(2), vence:p.vence||hoje(),
      status:p.status||"previsto", recebidoEm:p.recebidoEm||"",
      valorRecebido:p.valorRecebido??null, travado:!!p.travado,
      ...(temValor(p.impostoPct) ? { impostoPct:Number(p.impostoPct) } : {}) }));
  return c;
}
async function confirmarConversao(leadId){
  const l = S.leads.find(x=>x.id===leadId); if(!l) return;
  const nomeCliente = val("kNome") || l.nome;
  if(veCorretora() && !editorParcelas.some(p=>Number(p.valor)>0)){ toast("Acrescente ao menos uma parcela de comissão."); return; }
  // regra do cliente único: se o documento já está na carteira, o contrato novo
  // entra no cadastro que existe em vez de criar um segundo cliente
  const existente = clientePorDoc(val("kDoc"), null);
  if(existente && !await confirmar("Esse cliente já está na carteira",
      `${existente.nome} já usa esse documento. O contrato novo vai entrar no cadastro dele, somando-se aos produtos que ele já tem.`,
      "Adicionar ao cliente existente")) return;
  const cliente = existente || {
    id: uid("cli"), nome:nomeCliente, tipo:val("kTipo")||"PJ", doc:val("kDoc"),
    telefone:l.telefone||"", email:l.email||"", responsavel:l.responsavel||S.uid,
    origem:l.origem||"", criadoEm:hoje(), leadId:l.id, exemplo:!!l.exemplo
  };
  const contrato = lerContrato({ id:uid("ctr"), clienteId:cliente.id, clienteNome:cliente.nome, criadoEm:hoje(), exemplo:!!l.exemplo });
  l.etapa="ganho"; l.ultimoContato=hoje(); l.clienteId=cliente.id;
  l.historico=[{data:hoje(), texto:`Negócio fechado — contrato ${contrato.operadora} ${brl(contrato.valorBase)}`, autor:S.meNome}, ...(l.historico||[])];
  if(!existente) await salvar("clientes", cliente, "Criou");
  await salvar("contratos", contrato, existente ? "Novo produto para cliente da carteira —" : "Fechou negócio —");
  await salvar("leads", l, "Marcou como ganho");
  fecharModal();
  toast("Negócio fechado — cronograma de comissão gerado");
  ir("contratos");
}

/* ---------- contrato ---------- */
function formContrato(c){
  abrirEditor(c, "contrato");
  // contrato novo nasce com a primeira régua do pilar: basta digitar o valor
  if(!c){ editorAuto = true; }
  const cli = S.clientes.filter(x=>noEscopo(x) || (c && x.id===c.clienteId))
    .sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  return `
  <div class="m-head"><div><h2>${c?"Editar contrato":"Novo contrato"}</h2>
    <div class="sub">${veCorretora()?"Os valores da comissão são seus: digite linha a linha ou puxe de uma régua":"Registre o contrato — o cronograma de comissão é montado pelo gestor"}</div></div></div>
  <div class="m-body">
    <div class="field"><label for="kCliente">Cliente</label>
      <select id="kCliente">${cli.length?cli.map(x=>`<option value="${esc(x.id)}" ${c&&c.clienteId===x.id?"selected":""}>${esc(x.nome)}</option>`).join(""):`<option value="">— cadastre um cliente primeiro —</option>`}</select></div>
    ${camposContrato(c||{ regraId:(S.config.regras.find(r=>r.pilar==="saude")||{}).id }, true)}
  </div>
  <div class="m-foot">
    ${c&&podeExcluirCarteira()?`<button class="btn ghost danger left" data-act="excluirContrato" data-id="${esc(c.id)}">Excluir</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarContrato" data-id="${esc(c?c.id:"")}">Salvar contrato</button>
  </div>`;
}
async function salvarContrato(id){
  const clienteId = val("kCliente");
  if(!clienteId){ toast("Cadastre um cliente antes de registrar o contrato."); return; }
  if(veCorretora() && !editorParcelas.some(p=>Number(p.valor)>0)){ toast("Acrescente ao menos uma parcela de comissão."); return; }
  const cliente = S.clientes.find(x=>x.id===clienteId);
  const antigo = S.contratos.find(x=>x.id===id) || {};
  const c = lerContrato(Object.assign({}, antigo, {
    id: id || uid("ctr"), clienteId, clienteNome: cliente ? cliente.nome : "",
    criadoEm: antigo.criadoEm || hoje()
  }));
  await salvar("contratos", c);
  fecharModal(); toast(id?"Contrato atualizado":"Contrato registrado");
}
function abrirContrato(id){
  const c = S.contratos.find(x=>x.id===id); if(!c) return;
  if(!noEscopo(c,"corretor")){ toast("Esse contrato é de outro corretor."); return; }
  const regra = regraPorId(c.regraId);
  const parte = v => veCorretora() ? v : +(v*(Number(c.splitPct)||0)/100).toFixed(2);
  const total = parte((c.comissoes||[]).reduce((a,p)=>a+p.valor,0));
  const recebido = parte((c.comissoes||[]).filter(p=>p.status==="recebido").reduce((a,p)=>a+(p.valorRecebido??p.valor),0));
  const st = STATUS_CONTRATO[c.status]||STATUS_CONTRATO.proposta;
  abrirModal(`
  <div class="m-head"><div><h2>${esc(c.clienteNome)}</h2>
    <div class="sub">${esc(PILARES[c.pilar]?.curto||"")} · ${esc(c.produto||"")} · ${esc(c.operadora||"")} ${c.numero?"· nº "+esc(c.numero):""}</div></div>
    <span class="chip ${st.cls}" style="margin-left:auto">${st.nome}</span></div>
  <div class="m-body">
    <div class="dl">
      <div><div class="k">${esc(BASE_LABEL[regra?.base]||"Base")}</div><div class="v num" style="font-size:17px;font-weight:600">${brl(c.valorBase)}</div></div>
      <div><div class="k">Valor do contrato</div><div class="v num" style="font-size:17px;font-weight:600">${c.valorTotal?brl(c.valorTotal):"—"}</div></div>
      <div class="com"><div class="k">${veCorretora()?"Comissão total":"Sua comissão"}</div><div class="v num" style="font-size:17px;font-weight:600">${brl2(total)}${c.valorTotal?`<div class="hint">${pctR(total/c.valorTotal*100)} do contrato</div>`:""}</div></div>
      <div class="com"><div class="k">Já recebido</div><div class="v num" style="font-size:17px;font-weight:600;color:var(--ok)">${brl2(recebido)}</div></div>
      <div><div class="k">Vigência</div><div class="v num">${dt(c.inicio)} — ${dt(c.fim)}</div></div>
      <div><div class="k">Vidas / itens</div><div class="v num">${c.vidas||"—"}</div></div>
      ${veCorretora()?`<div><div class="k">Corretor</div><div class="v">${esc(nomeUsuario(c.corretor))} · split ${pct(c.splitPct||0)}</div></div>`:""}
      <div><div class="k">Última alteração</div><div class="v">${esc(c.atualizadoPorNome||"—")}<div class="hint">${esc(quandoRel(c.atualizadoEm))}</div></div></div>
    </div>
    ${contratoTemVida(c)?painelVidasContrato(c):""}
    <div class="panel com" style="box-shadow:none">
      <div class="panel-head"><div><h3>Cronograma de comissão</h3>
        <div class="sub">${(c.comissoes||[]).length} parcela(s)${veCorretora()?` · percentuais sobre ${(c.basePct||basePadrao(c.pilar))==="total"&&c.valorTotal?`o valor do contrato (${brl(c.valorTotal)})`:`a base (${brl(c.valorBase)})`}${regra?` · ${esc(regra.nome)}`:""}`:" · a coluna mostra a sua parte"}</div></div>
        ${veCorretora()?`<div class="right"><button class="btn sm" data-act="novaParcela" data-id="${esc(c.id)}">+ Comissão futura</button></div>`:""}</div>
      <div class="tw"><table>
        <thead><tr><th>#</th><th>Tipo</th><th>Data prevista</th>${veCorretora()?`<th class="r">%</th><th class="r">Valor</th><th class="r">Corretor</th>`:`<th class="r">Sua comissão</th>`}<th>Situação</th><th></th></tr></thead>
        <tbody>${(c.comissoes||[]).map(p=>{
          const venc = p.status==="previsto" && p.vence<hoje();
          const s = venc?STATUS_COM.atrasado:(STATUS_COM[p.status]||STATUS_COM.previsto);
          const v = p.status==="recebido"?(p.valorRecebido??p.valor):p.valor;
          return `<tr><td class="num">${p.n}</td>
            <td><span class="chip ${tipoP(p.tipo||"agenciamento").cls}">${tipoP(p.tipo||"agenciamento").nome}</span></td>
            <td class="num">${dt(p.vence)}</td>${veCorretora()?`<td class="r num">${pctR(p.pct)}</td>`:""}
            ${veCorretora()
              ? `<td class="r num">${brl2(v)}</td><td class="r num">${brl2(v*(Number(c.splitPct)||0)/100)}</td>`
              : `<td class="r num">${brl2(v*(Number(c.splitPct)||0)/100)}</td>`}
            <td><span class="chip ${s.cls}">${s.nome}</span></td>
            <td class="r" style="white-space:nowrap">${p.status==="recebido"
              ? (podeDesfazer()?`<button class="btn sm ghost" data-act="desconciliar" data-id="${esc(c.id)}" data-n="${p.n}">Desfazer</button>`:`<span class="hint">conciliada</span>`)
              : `<button class="btn sm" data-act="conciliar" data-id="${esc(c.id)}" data-n="${p.n}">Receber</button>`}
              ${podeDesfazer()?`<button class="btn sm ghost" data-act="editarParcela" data-id="${esc(c.id)}" data-n="${p.n}" aria-label="Editar parcela">✎</button>`:""}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>
  </div>
  <div class="m-foot">
    ${podeExcluirCarteira()?`<button class="btn ghost danger left" data-act="excluirContrato" data-id="${esc(c.id)}">Excluir</button>`:""}
    <button class="btn ghost" data-act="abrirCliente" data-id="${esc(c.clienteId)}">Ver cliente</button>
    ${S.mePapel==="gestor"?`<button class="btn ghost" data-act="historico" data-tabela="contratos" data-id="${esc(c.id)}" data-titulo="${esc(c.clienteNome)}">Histórico</button>`:""}
    <button class="btn" data-act="fechar">Fechar</button>
    <button class="btn primary" data-act="editarContrato" data-id="${esc(c.id)}">Editar</button>
  </div>`, true);
}

