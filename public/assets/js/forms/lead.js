/* Erbe · Central — forms/lead.js
   Formulário de lead e conversão lead → cliente + contrato.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ---------- lead ---------- */
function formLead(l){
  l = l || {};
  abrirEditor({ comissoes:l.comissoesPrevistas||[] }, "lead");
  return `
  <div class="m-head"><div><h2>${l.id?"Editar lead":"Novo lead"}</h2>
    <div class="sub">${l.id?esc(etapaNome(l.etapa)):"Entra na primeira etapa do funil"}</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="lNome">Nome do contato</label><input id="lNome" type="text" value="${esc(l.nome||"")}" placeholder="Maria Souza"></div>
      <div class="field"><label for="lEmpresa">Empresa</label><input id="lEmpresa" type="text" value="${esc(l.empresa||"")}" placeholder="Souza Contabilidade ME"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="lTel">Telefone</label><input id="lTel" type="tel" value="${esc(l.telefone||"")}" placeholder="(11) 90000-0000"></div>
      <div class="field"><label for="lEmail">E-mail</label><input id="lEmail" type="email" value="${esc(l.email||"")}"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="lPilar">Pilar</label><select id="lPilar">${PK.map(p=>`<option value="${p}" ${l.pilar===p?"selected":""}>${PILARES[p].nome}</option>`).join("")}</select></div>
      <div class="field"><label for="lOrigem">Origem</label><select id="lOrigem">${S.config.origens.map(o=>`<option ${l.origem===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
      <div class="field"><label for="lTemp">Temperatura</label><select id="lTemp">
        ${["quente","morno","frio"].map(t=>`<option value="${t}" ${l.temperatura===t?"selected":""}>${t[0].toUpperCase()+t.slice(1)}</option>`).join("")}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="lValor">Valor estimado (R$/mês ou prêmio)</label><input id="lValor" type="number" step="10" value="${l.valorEstimado||""}" placeholder="1800" data-act="recalcBase"></div>
      <div class="field"><label for="lVidas">Vidas / itens</label><input id="lVidas" type="number" value="${l.vidas||""}" placeholder="12"></div>
      <div class="field"><label for="lResp">Responsável</label><select id="lResp">${optUsuarios(l.responsavel||S.uid)}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="lPrev">Previsão de fechamento</label>
        <input id="lPrev" type="date" value="${l.previsaoFechamento||addDays(hoje(),30)}">
        <span class="hint">Alimenta a projeção de receita por mês.</span></div>
      <div class="field"><label for="lRegra">Régua prevista</label>
        <select id="lRegra">${S.config.regras.filter(x=>x.pilar===(l.pilar||"saude")).map(x=>`<option value="${x.id}" ${l.regraId===x.id?"selected":""}>${esc(x.nome)}</option>`).join("")}</select>
        <span class="hint">Base da estimativa, se você não montar as parcelas.</span></div>
    </div>
    <div id="editorComissao">${editorHTML(ctxContrato(l))}</div>
    <div class="field"><label for="lObs">Observações</label><textarea id="lObs" placeholder="Contexto da conversa, operadora atual, data de renovação…">${esc(l.obs||"")}</textarea></div>
  </div>
  <div class="m-foot">
    ${l.id?`<button class="btn ghost danger left" data-act="excluirLead" data-id="${esc(l.id)}">Excluir</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarLead" data-id="${esc(l.id||"")}">Salvar lead</button>
  </div>`;
}
function optUsuarios(sel){
  const us = S.usuarios.length ? S.usuarios : [{id:S.uid||"eu", nome:S.meNome}];
  return us.map(u=>`<option value="${esc(u.id)}" ${sel===u.id?"selected":""}>${esc(u.nome)}</option>`).join("");
}
async function salvarLead(id){
  const nome = val("lNome");
  if(!nome){ toast("Informe o nome do contato."); return; }
  const antigo = S.leads.find(l=>l.id===id) || {};
  const l = Object.assign({}, antigo, {
    id: id || uid("lead"),
    nome, empresa:val("lEmpresa"), telefone:val("lTel"), email:val("lEmail"),
    pilar:val("lPilar"), origem:val("lOrigem"), temperatura:val("lTemp"),
    valorEstimado:numv("lValor"), vidas:numv("lVidas"), responsavel:val("lResp"),
    previsaoFechamento:val("lPrev")||addDays(hoje(),30), regraId:val("lRegra"),
    comissoesPrevistas: editorParcelas.filter(p=>Number(p.valor)>0)
      .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""))
      .map((p,i)=>({ n:i+1, tipo:p.tipo||"agenciamento", pct:Number(p.pct)||0,
        valor:+(Number(p.valor)||0).toFixed(2), vence:p.vence||hoje(),
        status:"previsto", recebidoEm:"", valorRecebido:null })),
    obs:val("lObs"),
    etapa: antigo.etapa || "novo",
    criadoEm: antigo.criadoEm || hoje(),
    ultimoContato: hoje(),
    historico: antigo.historico || [{data:hoje(), texto:"Lead criado", autor:S.meNome}]
  });
  await salvar("leads", l);
  fecharModal(); toast(id?"Lead atualizado":"Lead criado");
}
function abrirLead(id){
  const l = S.leads.find(x=>x.id===id); if(!l) return;
  const et = S.config.etapas;
  abrirModal(`
  <div class="m-head"><div><h2>${esc(l.nome)}</h2>
    <div class="sub">${esc(l.empresa||"Pessoa física")} · ${esc(PILARES[l.pilar]?.nome||"")} · ${esc(l.origem||"sem origem")}</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="dEtapa">Etapa</label><select id="dEtapa" data-act="mudarEtapa" data-id="${esc(l.id)}">
        ${et.map(e=>`<option value="${e.id}" ${l.etapa===e.id?"selected":""}>${esc(e.nome)}</option>`).join("")}</select></div>
      <div class="field"><label>Valor estimado</label><div class="v num" style="padding-top:7px;font-size:17px;font-weight:600">${brl(l.valorEstimado)}</div></div>
      <div class="field"><label>Responsável</label><div class="v" style="padding-top:9px">${esc(nomeUsuario(l.responsavel))}</div></div>
    </div>
    <div class="dl">
      <div><div class="k">Telefone</div><div class="v">${esc(l.telefone||"—")}</div></div>
      <div><div class="k">E-mail</div><div class="v">${esc(l.email||"—")}</div></div>
      <div><div class="k">Vidas / itens</div><div class="v num">${l.vidas||"—"}</div></div>
      <div><div class="k">Último contato</div><div class="v num">${dt(l.ultimoContato)}</div></div>
      <div><div class="k">Última alteração</div><div class="v">${esc(l.atualizadoPorNome||"—")}<div class="hint">${esc(quandoRel(l.atualizadoEm))}</div></div></div>
    </div>
    ${(()=>{ const E=estimativaLead(l); if(!E.total) return "";
      return `<div class="panel com" style="box-shadow:none;background:var(--surface-2)">
        <div class="panel-head"><div><h3>Se fechar como previsto</h3>
          <div class="sub">${E.manual?"parcelas montadas neste lead":esc(E.regra?E.regra.nome:"")} · comissão prevista</div></div></div>
        <div class="chart-wrap"><div class="dl">
          <div><div class="k">Fecha em</div><div class="v num">${dt(E.fecha)}</div>
            <div class="hint">${E.meses===0?"neste mês":`em ${E.meses} ${E.meses===1?"mês":"meses"}`}</div></div>
          <div><div class="k">Comissão estimada</div><div class="v num">${brl(E.total)}</div>
            <div class="hint">${E.linhas.length} parcelas</div></div>
          <div><div class="k">Probabilidade</div><div class="v num">${pct(E.prob*100)}</div>
            <div class="hint">pela etapa atual</div></div>
          <div><div class="k">Valor ponderado</div><div class="v num">${brl(E.ponderado)}</div>
            <div class="hint">entra na projeção</div></div>
        </div></div></div>`; })()}
    ${l.obs?`<div><div class="k" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-weight:600">Observações</div><div style="margin-top:4px">${esc(l.obs)}</div></div>`:""}
    <div class="field"><label for="dNota">Registrar interação</label>
      <div style="display:flex;gap:8px"><input id="dNota" type="text" placeholder="Ligou, pediu proposta para 12 vidas…">
      <button class="btn" data-act="addNota" data-id="${esc(l.id)}">Registrar</button></div></div>
    <div class="timeline">${(l.historico||[]).slice(0,10).map(h=>`
      <div class="tl"><span class="tl-d"></span><div class="tl-c"><div>${esc(h.texto)}</div>
        <div class="tl-m">${dt(h.data)} · ${esc(h.autor||"")}</div></div></div>`).join("") || `<div class="hint">Sem histórico ainda.</div>`}</div>
  </div>
  <div class="m-foot">
    <button class="btn ghost danger left" data-act="excluirLead" data-id="${esc(l.id)}">Excluir</button>
    <button class="btn ghost" data-act="tarefaDeLead" data-id="${esc(l.id)}">Agendar follow-up</button>
    <button class="btn" data-act="editarLead" data-id="${esc(l.id)}">Editar</button>
    <button class="btn primary" data-act="converter" data-id="${esc(l.id)}">Marcar como ganho</button>
  </div>`);
}
function abrirPerda(l){
  abrirModal(`
  <div class="m-head"><div><h2>Lead perdido</h2><div class="sub">${esc(l.nome)} — registrar o motivo ajuda a melhorar a abordagem</div></div></div>
  <div class="m-body">
    <div class="field"><label for="pMotivo">Motivo</label><select id="pMotivo">${S.config.motivosPerda.map(m=>`<option>${esc(m)}</option>`).join("")}</select></div>
    <div class="field"><label for="pDet">Detalhe</label><textarea id="pDet" placeholder="Fechou com a concorrência por R$ 180 a menos por vida."></textarea></div>
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="confirmarPerda" data-id="${esc(l.id)}">Registrar perda</button></div>`);
}

/* ---------- conversão lead → cliente + contrato ---------- */
function abrirConversao(l){
  const regras = S.config.regras.filter(r=>r.pilar===l.pilar);
  const sugerida = regraPorId(l.regraId) || regras[0];
  const inicio = hoje();
  const doLead = (l.comissoesPrevistas||[]).length;
  abrirEditor(doLead
    ? { comissoes: l.comissoesPrevistas }
    : (sugerida && Number(l.valorEstimado)>0
        ? { comissoes: gerarCronograma({ valorBase:Number(l.valorEstimado), inicio,
            fim:addDays(addMonths(inicio,12),-1), regraId:sugerida.id, comissoes:[] }) }
        : null), "contrato");
  editorAuto = !doLead && !!sugerida;
  abrirModal(`
  <div class="m-head"><div><h2>Fechar negócio</h2>
    <div class="sub">${esc(l.nome)} vira cliente${doLead?" · cronograma trazido do lead"
      :(sugerida?` · cronograma sugerido pela régua ${esc(sugerida.nome)}`:"")} — ajuste o que for diferente</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="kNome">Cliente</label><input id="kNome" type="text" value="${esc(l.empresa||l.nome)}"></div>
      <div class="field"><label for="kTipo">Tipo</label><select id="kTipo"><option value="PJ" ${l.empresa?"selected":""}>PJ</option><option value="PF" ${!l.empresa?"selected":""}>PF</option></select></div>
      <div class="field"><label for="kDoc">CNPJ / CPF</label><input id="kDoc" type="text" placeholder="00.000.000/0001-00"></div>
    </div>
    ${camposContrato({ pilar:l.pilar, valorBase:l.valorEstimado, vidas:l.vidas, corretor:l.responsavel,
        regraId:sugerida?sugerida.id:"", inicio }, true)}
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="confirmarConversao" data-id="${esc(l.id)}">Fechar negócio</button></div>`, true);
}
let editorParcelas = [];        // cronograma em edição no formulário aberto
let editorAlvo = "contrato";    // "contrato" (com split) ou "lead" (previsto)
let editorBasePct = "base";     // "base" = mensalidade/prêmio · "total" = valor do contrato

/** Sobre o que os percentuais incidem. Consórcio cobra sobre o crédito, não sobre a parcela. */
function basePadrao(pilar){ return pilar==="consorcios" ? "total" : "base"; }
/** Valor contra o qual os percentuais de um contrato são calculados. */
function baseCalculo(c){
  const modo = c && c.basePct ? c.basePct : basePadrao(c && c.pilar);
  const total = Number(c && c.valorTotal)||0;
  return modo==="total" && total ? total : (Number(c && c.valorBase)||0);
}

