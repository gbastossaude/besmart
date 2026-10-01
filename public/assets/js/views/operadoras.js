/* Erbe · Central — views/operadoras.js
   Análise por operadora.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   OPERADORAS
   ============================================================ */
/** Consolida cada operadora: o que produz, o que já pagou e quanto demora. */
function analiseOperadoras(){
  const ctr = S.contratos.filter(c=>c.status!=="cancelado" && c.operadora && noEscopo(c,"corretor"));
  const mapa = {};
  ctr.forEach(c=>{
    const o = mapa[c.operadora] = mapa[c.operadora] || {
      nome:c.operadora, pilares:new Set(), contratos:0, clientes:new Set(), vidas:0,
      base:0, comissao:0, recebido:0, atrasado:0, previsto:0, atrasos:[], parcelasAtraso:0
    };
    o.pilares.add(c.pilar); o.contratos++; o.clientes.add(c.clienteId);
    o.vidas += totalVidas(c); o.base += Number(c.valorBase)||0;
    // quem não vê o lado da corretora enxerga estes valores já na sua proporção
    const q = veCorretora() ? 1 : (Number(c.splitPct)||0)/100;
    (c.comissoes||[]).forEach(p=>{
      o.comissao += p.valor*q;
      if(p.status==="recebido"){
        o.recebido += (p.valorRecebido??p.valor)*q;
        if(p.recebidoEm) o.atrasos.push(diasEntre(p.vence, p.recebidoEm));
      } else if(p.vence < hoje()){ o.atrasado += p.valor*q; o.parcelasAtraso++; }
      else o.previsto += p.valor*q;
    });
  });
  const linhas = Object.values(mapa).map(o=>({
    ...o,
    pilar:[...o.pilares][0] || "saude",
    clientesN:o.clientes.size,
    ticket: o.contratos ? o.base/o.contratos : 0,
    atrasoMedio: o.atrasos.length ? o.atrasos.reduce((a,b)=>a+b,0)/o.atrasos.length : null,
    rendimento: o.base ? o.comissao/o.base*100 : 0
  })).sort((a,b)=>b.comissao-a.comissao);
  const total = linhas.reduce((a,o)=>a+o.comissao,0);
  linhas.forEach(o=>o.share = total ? o.comissao/total*100 : 0);
  return { linhas, total };
}
function viewOperadoras(){
  const { linhas, total } = analiseOperadoras();
  if(!linhas.length) return vazio("Nenhuma operadora na carteira",
    "Assim que houver contratos, esta tela mostra quanto cada operadora gera e quanto demora para pagar a comissão.","novoContrato","Registrar contrato");

  const lider = linhas[0];
  const comAtraso = linhas.filter(o=>o.atrasoMedio!=null);
  const maisLenta = comAtraso.slice().sort((a,b)=>b.atrasoMedio-a.atrasoMedio)[0];
  const maisRapida = comAtraso.slice().sort((a,b)=>a.atrasoMedio-b.atrasoMedio)[0];
  const devendo = linhas.filter(o=>o.atrasado>0).sort((a,b)=>b.atrasado-a.atrasado);
  const concentracao = lider.share;
  const top3 = linhas.slice(0,3).reduce((a,o)=>a+o.share,0);
  const max = Math.max(...linhas.map(o=>o.comissao), 1);

  const leitura = [];
  if(concentracao>=40) leitura.push({cls:"warn", t:`${esc(lider.nome)} responde por ${pct(concentracao)} da comissão`,
    s:"Concentração alta: uma mudança de régua nessa operadora move o caixa da corretora inteira."});
  else leitura.push({cls:"ok", t:"Carteira distribuída",
    s:`A maior operadora é ${pct(concentracao)} do total e as três primeiras somam ${pct(top3)}.`});
  if(maisLenta && maisLenta.atrasoMedio>10) leitura.push({cls:"crit", t:`${esc(maisLenta.nome)} paga com ${Math.round(maisLenta.atrasoMedio)} dias de atraso médio`,
    s:"Considere esse prazo ao projetar caixa e ao negociar a próxima régua."});
  if(maisRapida && maisRapida.atrasoMedio<=5) leitura.push({cls:"ok", t:`${esc(maisRapida.nome)} é a mais pontual`,
    s:`Média de ${Math.round(maisRapida.atrasoMedio)} dia(s) entre o vencimento e o crédito.`});
  if(devendo.length) leitura.push({cls:"crit", t:`${brl(devendo.reduce((a,o)=>a+o.atrasado,0))} em aberto vencido`,
    s:`Concentrado em ${esc(devendo[0].nome)} (${brl(devendo[0].atrasado)}).`});

  return `
  <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
    <div class="stat hero"><div class="k">Operadora líder</div><div class="v" style="font-size:19px">${esc(lider.nome)}</div>
      <div class="d">${brl(lider.comissao)} · ${pct(lider.share)} da comissão</div></div>
    <div class="stat"><div class="k">Operadoras ativas</div><div class="v">${linhas.length}</div>
      <div class="d">${linhas.reduce((a,o)=>a+o.contratos,0)} contratos</div></div>
    <div class="stat"><div class="k">${veCorretora()?"Comissão total gerada":"Sua comissão no período"}</div><div class="v">${brl(total)}</div>
      <div class="d">${brl(linhas.reduce((a,o)=>a+o.recebido,0))} já recebidos</div></div>
    <div class="stat"><div class="k">Atraso médio de pagamento</div>
      <div class="v">${comAtraso.length?Math.round(comAtraso.reduce((a,o)=>a+o.atrasoMedio,0)/comAtraso.length)+"d":"—"}</div>
      <div class="d">Do vencimento até o crédito</div></div>
  </div>

  <div class="alerts">${leitura.map(l=>`<div class="alert ${l.cls}" style="cursor:default">
    <span class="ai" aria-hidden="true">${l.cls==="ok"?"✓":l.cls==="warn"?"!":"×"}</span>
    <span><b>${l.t}</b><span>${l.s}</span></span></div>`).join("")}</div>

  <section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><div><h3>${veCorretora()?"Comissão gerada por operadora":"Sua comissão por operadora"}</h3>
      <div class="sub">Todas as parcelas dos contratos vivos · cor por pilar</div></div></div>
    <div class="chart-wrap">
      ${linhas.map(o=>`<div class="bar-line">
        <span class="nm" style="width:152px">${esc(o.nome)}</span>
        <span class="track" style="height:13px">
          <span class="fill" style="width:${larg(o.comissao,max)}%;background:${PILARES[o.pilar].cor}"></span></span>
        <span class="n" style="width:132px">${brl(o.comissao)} · ${pct(o.share)}</span></div>`).join("")}
    </div>
    <div class="legend">${PK.map(x=>`<span><i class="dot" style="background:${PILARES[x].cor}"></i>${PILARES[x].curto}</span>`).join("")}</div>
    ${tabelaOculta(["Operadora","Comissão","Participação"], linhas.map(o=>[o.nome,brl(o.comissao),pct(o.share)]))}
  </section>

  <section class="panel">
    <div class="panel-head"><div><h3>Quadro completo</h3>
      <div class="sub">Clique numa linha para ver os contratos da operadora</div></div></div>
    <div class="tw"><table>
      <thead><tr><th>Operadora</th><th class="r">Contratos</th><th class="r">Vidas</th><th class="r">Base</th>
        <th class="r">${veCorretora()?"Comissão":"Sua comissão"}</th><th class="r">${veCorretora()?"Comissão":"Sua parte"} ÷ base</th><th class="r">Recebido</th><th class="r">Em atraso</th>
        <th class="r">Atraso médio</th><th class="r">Ticket</th></tr></thead>
      <tbody>${linhas.map(o=>`<tr class="clickable" data-act="irFiltro" data-view="contratos" data-f='${esc(JSON.stringify({operadora:o.nome}))}'>
        <td><b>${esc(o.nome)}</b><div class="hint">${[...o.pilares].map(x=>PILARES[x].curto).join(", ")} · ${o.clientesN} cliente${o.clientesN!==1?"s":""}</div></td>
        <td class="r num">${o.contratos}</td>
        <td class="r num">${o.vidas||"—"}</td>
        <td class="r num">${brl(o.base)}</td>
        <td class="r num"><b>${brl(o.comissao)}</b></td>
        <td class="r num" style="color:var(--ink-3)">${pctR(o.rendimento)}</td>
        <td class="r num" style="color:var(--ok)">${brl(o.recebido)}</td>
        <td class="r num" ${o.atrasado?'style="color:var(--crit)"':""}>${o.atrasado?brl(o.atrasado)+` <span class="hint">(${o.parcelasAtraso})</span>`:"—"}</td>
        <td class="r num">${o.atrasoMedio==null?"—":`<span class="chip ${o.atrasoMedio>15?"crit":o.atrasoMedio>5?"warn":"ok"}">${Math.round(o.atrasoMedio)}d</span>`}</td>
        <td class="r num">${brl(o.ticket)}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <div class="ta"><b style="color:var(--ink-2)">${veCorretora()?"Comissão":"Sua parte"} ÷ base</b> só compara operadoras do mesmo pilar: em saúde a base é a mensalidade, em seguros o prêmio anual e em consórcio o valor do crédito — por isso saúde passa de 100% e consórcio fica na casa de 3%.
      <br><b style="color:var(--ink-2)">Atraso médio</b> considera apenas parcelas já conciliadas, comparando o vencimento com a data em que você marcou o recebimento; fica mais confiável conforme você concilia.</div>
  </section>`;
}

