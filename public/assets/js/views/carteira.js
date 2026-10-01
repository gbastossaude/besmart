/* Erbe · Central — views/carteira.js
   Renovações, cross-sell, painel executivo e reajustes.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   RENOVAÇÕES
   ============================================================ */
/* ============================================================
   CROSS-SELL E VALOR DA CARTEIRA
   ============================================================ */
/** Pilares que o cliente já tem, e os que faltam. */
function pilaresDoCliente(clienteId){
  const tem = new Set();
  contratosDoCliente(clienteId).forEach(c=>{ if(c.status!=="cancelado") tem.add(c.pilar); });
  return { tem:[...tem], falta: PK.filter(p=>!tem.has(p)) };
}
/** Clientes com espaço para mais um produto, do mais valioso para o menos. */
function oportunidadesCrossSell(limite){
  const out = [];
  for(const c of S.clientes){
    if(!noEscopo(c)) continue;
    if(["encerrado","inativo"].includes(c.status)) continue;
    const { tem, falta } = pilaresDoCliente(c.id);
    if(!tem.length || !falta.length) continue;
    out.push({ cliente:c, tem, falta, valor: receitaCliente(c) });
  }
  out.sort((a,b)=>b.valor-a.valor || b.tem.length-a.tem.length);
  return limite ? out.slice(0, limite) : out;
}
/** Os números que a diretoria procura primeiro ao abrir o sistema. */
function painelExecutivo(ativos, vidasTotal){
  const clientesAtivos = new Set(ativos.map(c=>c.clienteId)).size;
  const vs = vidasNoEscopo();
  const detalhadas = vidasAtivas(vs).length;
  const porPilarVidas = {};
  PK.forEach(p=>porPilarVidas[p]=0);
  ativos.forEach(c=>{ if(contratoTemVida(c)) porPilarVidas[c.pilar] = (porPilarVidas[c.pilar]||0) + totalVidas(c); });
  const cotas = ativos.filter(c=>c.pilar==="consorcios").length;
  const contempladas = ativos.filter(c=>c.pilar==="consorcios" && c.contemplado).length;
  // conta pela data do cancelamento; contratos antigos, sem essa data, caem na última alteração
  const cancelados12 = S.contratos.filter(c=>noEscopo(c,"corretor") && c.status==="cancelado"
    && (c.canceladoEm || (c.atualizadoEm||"").slice(0,10)) >= addDays(hoje(),-365)).length;
  const base = ativos.length + cancelados12;
  const retencao = base ? (ativos.length/base*100) : 100;
  const multi = S.clientes.filter(c=>noEscopo(c) && pilaresDoCliente(c.id).tem.length>1).length;

  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip ok">Visão executiva</span>
      <div><h3>A Erbe hoje</h3><div class="sub">Os números da empresa inteira, num lugar só</div></div></div>
    <div class="chart-wrap"><div class="dl" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="clickable" data-act="ir" data-view="clientes">
        <div class="k">Clientes ativos</div>
        <div class="v num" style="font-size:22px;font-weight:700">${clientesAtivos.toLocaleString("pt-BR")}</div>
        <div class="hint">${multi} com mais de um produto</div></div>
      <div class="clickable" data-act="ir" data-view="vidas">
        <div class="k">Vidas</div>
        <div class="v num" style="font-size:22px;font-weight:700">${vidasTotal.toLocaleString("pt-BR")}</div>
        <div class="hint">${detalhadas} com nome${vidasTotal>detalhadas?` · ${vidasTotal-detalhadas} a detalhar`:""}</div></div>
      ${PK.filter(p=>PILAR_TEM_VIDA[p]).map(p=>`
        <div><div class="k">Vidas em ${esc(PILARES[p].curto)}</div>
          <div class="v num" style="font-size:22px;font-weight:700;color:${PILARES[p].cor}">${(porPilarVidas[p]||0).toLocaleString("pt-BR")}</div>
          <div class="hint">${ativos.filter(c=>c.pilar===p).length} contrato(s)</div></div>`).join("")}
      <div><div class="k">Cotas de consórcio</div>
        <div class="v num" style="font-size:22px;font-weight:700;color:var(--c-consorcios)">${cotas.toLocaleString("pt-BR")}</div>
        <div class="hint">${contempladas} contemplada(s)</div></div>
      <div><div class="k">Retenção 12 meses</div>
        <div class="v num" style="font-size:22px;font-weight:700;color:${retencao>=90?"var(--ok)":retencao>=75?"var(--warn)":"var(--crit)"}">${pct(retencao)}</div>
        <div class="hint">${cancelados12} cancelamento(s) no período</div></div>
    </div></div>
  </section>`;
}

function painelCrossSell(){
  const ops = oportunidadesCrossSell();
  if(!ops.length) return "";
  const porFalta = {};
  PK.forEach(p=>porFalta[p]=0);
  ops.forEach(o=>o.falta.forEach(p=>porFalta[p]++));
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip info">Oportunidade</span>
      <div><h3>${ops.length.toLocaleString("pt-BR")} cliente${ops.length!==1?"s":""} com espaço para outro produto</h3>
        <div class="sub">${PK.filter(p=>porFalta[p]).map(p=>`${porFalta[p]} sem ${PILARES[p].curto}`).join(" · ")}</div></div></div>
    <div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Já tem</th><th>Falta</th><th class="r com">${veCorretora()?"Comissão gerada":"Sua comissão"}</th><th></th></tr></thead>
      <tbody>${ops.slice(0,12).map(o=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(o.cliente.id)}"><b>${esc(o.cliente.nome)}</b>
          ${o.cliente.telefone?`<div class="hint">${esc(o.cliente.telefone)}</div>`:""}</td>
        <td>${o.tem.map(p=>`<span class="chip ${p}">${esc(PILARES[p].curto)}</span>`).join(" ")}</td>
        <td>${o.falta.map(p=>`<span class="chip mute">${esc(PILARES[p].curto)}</span>`).join(" ")}</td>
        <td class="r num com">${brl(o.valor)}</td>
        <td class="r"><button class="btn sm" data-act="tarefaCrossSell" data-id="${esc(o.cliente.id)}" data-p="${esc(o.falta[0])}">Agendar contato</button></td>
      </tr>`).join("")}</tbody></table></div>
    ${ops.length>12?`<div class="ta">e mais ${ops.length-12} cliente(s) — os de maior comissão vêm primeiro.</div>`:""}
  </section>`;
}

/** Saúde reajusta uma vez por ano, no mês de aniversário do contrato. Avisar antes
    é o que separa "o corretor me preparou" de "o boleto veio mais caro". */
function painelReajustes(){
  const rs = reajustesChegando(60);
  const semMes = S.contratos.filter(c=>c.pilar==="saude" && ["ativo","implantado"].includes(c.status)
    && !c.mesReajuste && noEscopo(c,"corretor")).length;
  if(!rs.length && !semMes) return "";
  return `<section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><span class="chip ${rs.length?"warn":"mute"}">Reajuste anual</span>
      <div><h3>${rs.length} contrato${rs.length!==1?"s":""} de saúde reajusta${rs.length!==1?"m":""} em até 60 dias</h3>
        <div class="sub">${semMes?`${semMes} contrato(s) de saúde sem mês de reajuste preenchido`:"Todos os contratos de saúde têm mês de reajuste"}</div></div></div>
    ${rs.length?`<div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Operadora</th><th>Mês</th><th class="r">Último reajuste</th><th class="r">Vidas</th><th class="r">Base</th><th></th></tr></thead>
      <tbody>${rs.map(x=>`<tr>
        <td class="clickable" data-act="abrirContrato" data-id="${esc(x.c.id)}"><b>${esc(x.c.clienteNome)}</b></td>
        <td>${esc(x.c.operadora||"—")}</td>
        <td>${esc(MESES[Number(x.c.mesReajuste)-1])} <span class="chip ${x.dias<=30?"crit":"warn"}">${x.dias===0?"este mês":`em ${x.dias}d`}</span></td>
        <td class="r num">${x.c.ultimoReajuste!=null&&x.c.ultimoReajuste!==""?pctR(x.c.ultimoReajuste):"—"}</td>
        <td class="r num">${totalVidas(x.c)||"—"}</td>
        <td class="r num">${brl(x.c.valorBase)}</td>
        <td class="r"><button class="btn sm" data-act="avisarReajuste" data-id="${esc(x.c.id)}">Preparar cliente</button></td>
      </tr>`).join("")}</tbody></table></div>`:""}
  </section>`;
}

function viewRenovacoes(){
  const ativos = S.contratos.filter(c=>noEscopo(c,"corretor") && ["ativo","implantado"].includes(c.status) && c.fim);
  // A escada que o briefing pede: 7, 15, 30, 60 e 90 dias antes.
  const faixas = [
    { rot:"Vencidos", cls:"crit", teste:c=>c.fim<hoje() },
    { rot:"Vence em 7 dias", cls:"crit", teste:c=>c.fim>=hoje() && c.fim<=addDays(hoje(),7) },
    { rot:"8 a 15 dias", cls:"crit", teste:c=>c.fim>addDays(hoje(),7) && c.fim<=addDays(hoje(),15) },
    { rot:"16 a 30 dias", cls:"warn", teste:c=>c.fim>addDays(hoje(),15) && c.fim<=addDays(hoje(),30) },
    { rot:"31 a 60 dias", cls:"warn", teste:c=>c.fim>addDays(hoje(),30) && c.fim<=addDays(hoje(),60) },
    { rot:"61 a 90 dias", cls:"info", teste:c=>c.fim>addDays(hoje(),60) && c.fim<=addDays(hoje(),90) }
  ];
  const reaj = painelReajustes();
  if(!ativos.length && !reaj) return vazio("Nada a renovar","Contratos com data de fim preenchida entram nesta esteira 90 dias antes do vencimento.","novoContrato","Registrar contrato");
  return reaj + faixas.map(f=>{
    const cs = ativos.filter(f.teste).sort((a,b)=>a.fim.localeCompare(b.fim));
    if(!cs.length) return "";
    const total = cs.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
    return `<section class="panel" style="margin-bottom:14px">
      <div class="panel-head"><span class="chip ${f.cls}">${esc(f.rot)}</span>
        <div><h3>${cs.length} contrato${cs.length!==1?"s":""}</h3><div class="sub">${brl(total)} de base contratada em risco</div></div></div>
      <div class="tw"><table>
        <thead><tr><th>Cliente</th><th>Produto</th><th class="r">Base atual</th><th class="r">Com reajuste 12%</th><th>Fim da vigência</th><th></th></tr></thead>
        <tbody>${cs.map(c=>`<tr class="clickable" data-act="abrirContrato" data-id="${esc(c.id)}">
          <td><b>${esc(c.clienteNome)}</b></td>
          <td><span class="chip ${esc(c.pilar)}">${esc(PILARES[c.pilar].curto)}</span> <span class="hint">${esc(c.operadora||"")}</span></td>
          <td class="r num">${brl(c.valorBase)}</td>
          <td class="r num">${brl(Number(c.valorBase)*1.12)}</td>
          <td class="num">${dt(c.fim)} <span class="hint">(${diasEntre(hoje(),c.fim)}d)</span></td>
          <td class="r"><button class="btn sm" data-act="renovar" data-id="${esc(c.id)}">Renovar</button></td>
        </tr>`).join("")}</tbody>
      </table></div></section>`;
  }).join("") || vazio("Nenhuma renovação nos próximos 90 dias","A esteira volta a preencher conforme os contratos se aproximam do vencimento.","novoContrato","Registrar contrato");
}

