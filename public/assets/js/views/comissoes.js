/* Erbe · Central — views/comissoes.js
   Comissões, imposto e previsão de comissões.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   COMISSÕES
   ============================================================ */
function viewComissoes(){
  const f = S.filtros;
  let ps = parcelas().filter(p=>noEscopo(p,"corretor"));
  if(f.status==="atrasado") ps = ps.filter(p=>p.vencida);
  else if(f.status) ps = ps.filter(p=>p.status===f.status);
  if(f.mes) ps = ps.filter(p=>p.mes===f.mes);
  if(f.corretor) ps = ps.filter(p=>p.corretor===f.corretor);
  if(f.tipo) ps = ps.filter(p=>p.tipo===f.tipo);
  if(f.pilar) ps = ps.filter(p=>p.pilar===f.pilar);
  ps.sort((a,b)=>a.vence.localeCompare(b.vence));
  const imp = veCorretora() && haImposto();

  const todas = parcelas().filter(p=>noEscopo(p,"corretor"));
  const aReceber = todas.filter(p=>p.status==="previsto").reduce((a,p)=>a+valorVis(p),0);
  const atrasado = todas.filter(p=>p.vencida).reduce((a,p)=>a+valorVis(p),0);
  const recebido12 = todas.filter(p=>p.status==="recebido" && p.mes>=ultimosMeses(12)[0]).reduce((a,p)=>a+efetivoVis(p),0);
  const repasse = todas.filter(p=>p.status==="recebido").reduce((a,p)=>a+p.valorCorretor,0);
  const meses = [...new Set(todas.map(p=>p.mes))].sort();

  if(!todas.length) return vazio("Sem comissões ainda","O cronograma de comissão nasce junto com o contrato: cadastre o primeiro e as parcelas aparecem aqui.","novoContrato","Registrar contrato");

  const selTotal = ps.reduce((a,p)=>a+(p.status==="recebido"?efetivoVis(p):valorVis(p)),0);
  // A tabela é de trabalho, não de arquivo: desenha por blocos. Os totais
  // acima continuam somando o filtro inteiro.
  const POR_PAGINA_COM = 150;
  const psFatia = ps.slice(0, (S.pagComissoes||1)*POR_PAGINA_COM);
  return `
  <div class="stat-row">
    <div class="stat hero"><div class="k">${veCorretora()?"A receber":"Você tem a receber"}</div><div class="v">${brl(aReceber)}</div><div class="d">${todas.filter(p=>p.status==="previsto").length} parcelas em aberto${imp?` · ${brl(todas.filter(p=>p.status==="previsto").reduce((a,p)=>a+p.liquido,0))} líquido de imposto`:""}</div></div>
    ${(()=>{ const cons = todas.filter(p=>p.pilar==="consorcios" && p.status==="previsto");
      return cons.length ? `<div class="stat clickable" data-act="irFiltro" data-view="comissoes" data-f='{"pilar":"consorcios"}'><div class="k">Consórcio a receber</div><div class="v">${brl(cons.reduce((a,p)=>a+valorVis(p),0))}</div><div class="d">${cons.length} parcela(s) de cotas</div></div>` : ""; })()}
    <div class="stat"><div class="k">Em atraso</div><div class="v" style="color:${atrasado?"var(--crit)":"inherit"}">${brl(atrasado)}</div><div class="d">Vencidas e não conciliadas</div></div>
    <div class="stat"><div class="k">${veCorretora()?"Recebido (12 meses)":"Você recebeu (12 meses)"}</div><div class="v">${brl(recebido12)}</div><div class="d">Valores conciliados</div></div>
    ${veCorretora()?`<div class="stat"><div class="k">Repasse a corretores</div><div class="v">${brl(repasse)}</div><div class="d">Sobre o que já entrou</div></div>`:""}
  </div>
  ${painelLembretes(todas)}
  ${painelPrevisao()}
  <div class="filters">
    <div class="field"><label for="coStatus">Situação</label><select id="coStatus" data-act="filtro" data-k="status">
      <option value="">Todas</option><option value="atrasado" ${f.status==="atrasado"?"selected":""}>Em atraso</option>
      ${Object.entries(STATUS_COM).map(([k,v])=>`<option value="${k}" ${f.status===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
    <div class="field"><label for="coMes">Vencimento</label><select id="coMes" data-act="filtro" data-k="mes">
      <option value="">Todos os meses</option>${meses.map(m=>`<option value="${m}" ${f.mes===m?"selected":""}>${mesLabel(m)}</option>`).join("")}</select></div>
    <div class="field"><label for="coCor">Corretor</label><select id="coCor" data-act="filtro" data-k="corretor">
      <option value="">Todos</option>${S.usuarios.map(u=>`<option value="${esc(u.id)}" ${f.corretor===u.id?"selected":""}>${esc(u.nome)}</option>`).join("")}</select></div>
    <div class="field"><label for="coTipo">Tipo</label><select id="coTipo" data-act="filtro" data-k="tipo">
      <option value="">Agenciamento e vitalício</option>
      ${Object.entries(TIPO_PARCELA).map(([k,v])=>`<option value="${k}" ${f.tipo===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
    <div class="field"><label for="coPilar">Pilar</label><select id="coPilar" data-act="filtro" data-k="pilar">
      <option value="">Todos</option>${PK.map(k=>`<option value="${k}" ${f.pilar===k?"selected":""}>${esc(PILARES[k].curto)}${k==="consorcios"?" (consórcio)":""}</option>`).join("")}</select></div>
  </div>
  <div class="panel">
    <div class="panel-head"><div><h3>${ps.length.toLocaleString("pt-BR")} parcela${ps.length!==1?"s":""}</h3><div class="sub">${brl(selTotal)} no filtro atual${veCorretora()?"":" · sua parte"}${psFatia.length<ps.length?` · mostrando ${psFatia.length}`:""}</div></div>
      <div class="right">
        ${veCorretora()?`<button class="btn sm primary" data-act="novaParcela">+ Comissão</button>`:""}
        ${ps.some(p=>p.status!=="recebido")?`<button class="btn sm" data-act="conciliarLote">Marcar filtro como recebido</button>`:""}
        ${ps.length&&podeDesfazer()?`<button class="btn sm ghost danger" data-act="excluirLote">Excluir filtro</button>`:""}
        <button class="btn sm" data-act="baixarRel" data-tipo="comissoes">Baixar Excel / PDF</button></div></div>
    <div class="tw"><table>
      <thead><tr><th>Data prevista</th><th>Cliente</th><th>Tipo</th><th>Parcela</th>${veCorretora()?`<th class="r">Valor bruto</th>${imp?`<th class="r">Imposto</th>`:""}<th class="r">Corretor</th><th class="r">Corretora${imp?" líquido":""}</th>`:`<th class="r">Sua comissão</th>`}<th>Situação</th><th></th></tr></thead>
      <tbody>${psFatia.map(p=>{
        const st = p.vencida ? STATUS_COM.atrasado : (STATUS_COM[p.status]||STATUS_COM.previsto);
        return `<tr>
          <td class="num">${dt(p.vence)}</td>
          <td class="clickable" data-act="abrirContrato" data-id="${esc(p.contratoId)}"><b>${esc(p.cliente)}</b>
            ${p.pilar==="consorcios"?` <span class="chip consorcios" title="Comissão de consórcio${p.contrato.grupo?` · grupo ${esc(p.contrato.grupo)}`:""}${p.contrato.cota?` · cota ${esc(p.contrato.cota)}`:""}">Consórcio</span>`:""}</td>
          <td><span class="chip ${tipoP(p.tipo).cls}">${tipoP(p.tipo).nome}</span>
              <div class="hint">${esc(PILARES[p.pilar].curto)} · ${esc(p.operadora||"")}</div></td>
          <td class="num">${p.n}/${p.contrato.comissoes.length}${veCorretora()?` <span class="hint">(${pctR(p.pct)})</span>`:""}</td>
          ${veCorretora()
            ? `<td class="r num"><b>${brl2(p.efetivo)}</b></td>
               ${imp?`<td class="r num">${p.imposto?brl2(p.imposto):"—"}${p.aliquota?`<div class="hint">${pctR(p.aliquota)}</div>`:""}</td>`:""}
               <td class="r num">${brl2(p.valorCorretor)}<div class="hint">${esc(iniciais(nomeUsuario(p.corretor)))}</div></td>
               <td class="r num">${brl2(p.valorCorretora)}</td>`
            : `<td class="r num"><b>${brl2(efetivoVis(p))}</b></td>`}
          <td><span class="chip ${st.cls}">${st.nome}</span>${p.recebidoEm?`<div class="hint num">${dt(p.recebidoEm)}</div>`:""}</td>
          <td class="r" style="white-space:nowrap">
            ${p.status==="recebido"
              ? (podeDesfazer()?`<button class="btn sm ghost" data-act="desconciliar" data-id="${esc(p.contratoId)}" data-n="${p.n}">Desfazer</button>`:`<span class="hint">conciliada</span>`)
              : `<button class="btn sm" data-act="conciliar" data-id="${esc(p.contratoId)}" data-n="${p.n}">Receber</button>`}
            ${podeDesfazer()?`<button class="btn sm ghost" data-act="editarParcela" data-id="${esc(p.contratoId)}" data-n="${p.n}" title="Editar esta parcela" aria-label="Editar parcela">✎</button>
            <button class="btn sm ghost danger" data-act="excluirParcela" data-id="${esc(p.contratoId)}" data-n="${p.n}" title="Excluir esta parcela" aria-label="Excluir parcela">×</button>`:""}
          </td>
        </tr>`;
      }).join("") || `<tr><td colspan="10" class="empty">Nenhuma parcela com esses filtros.</td></tr>`}</tbody>
    </table></div>
    ${psFatia.length < ps.length?`<div class="ta"><button class="btn" data-act="maisComissoes">Mostrar mais ${Math.min(POR_PAGINA_COM, ps.length-psFatia.length)} de ${ps.length.toLocaleString("pt-BR")}</button></div>`:""}
  </div>`;
}

/** Lembretes: o que já venceu (por faixa de atraso) e o que entra em breve. */
function painelLembretes(todas){
  const atrasadas = todas.filter(p=>p.vencida);
  const faixas = [
    { rot:"1 a 30 dias", cls:"warn", ps:atrasadas.filter(p=>diasEntre(p.vence,hoje())<=30) },
    { rot:"31 a 60 dias", cls:"crit", ps:atrasadas.filter(p=>{const d=diasEntre(p.vence,hoje()); return d>30&&d<=60;}) },
    { rot:"mais de 60 dias", cls:"crit", ps:atrasadas.filter(p=>diasEntre(p.vence,hoje())>60) }
  ].filter(f=>f.ps.length);
  const aviso = Math.max(1, Number(S.config.diasAvisoComissao)||7);
  const aReceber = todas.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),aviso))
    .sort((a,b)=>a.vence.localeCompare(b.vence));
  const prox30 = todas.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),30));
  const maisVelha = atrasadas.slice().sort((a,b)=>a.vence.localeCompare(b.vence))[0];

  if(!atrasadas.length && !prox30.length) return "";
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head">
      <span class="chip ${atrasadas.length?"crit":"ok"}">${atrasadas.length?"Cobrança":"Em dia"}</span>
      <div><h3>Lembretes de comissionamento</h3>
        <div class="sub">${atrasadas.length
          ? `${brl(atrasadas.reduce((a,p)=>a+valorVis(p),0))} vencidos e não conciliados — a mais antiga espera há ${diasEntre(maisVelha.vence,hoje())} dias`
          : "Nada vencido. Abaixo, o que entra nos próximos 30 dias."}</div></div>
      ${atrasadas.length?`<div class="right"><button class="btn sm" data-act="irFiltro" data-view="comissoes" data-f='{"status":"atrasado"}'>Ver só os atrasados</button>
        <button class="btn sm" data-act="tarefasDeCobranca">Criar tarefas de cobrança</button></div>`:""}
    </div>
    <div class="chart-wrap">
      ${faixas.length?`<div class="dl" style="margin-bottom:14px">${faixas.map(f=>`
        <div><div class="k">Atraso de ${esc(f.rot)}</div>
          <div class="v num" style="font-size:19px;font-weight:700;color:var(--${f.cls==="crit"?"crit":"warn"})">${brl(f.ps.reduce((a,p)=>a+valorVis(p),0))}</div>
          <div class="hint">${f.ps.length} parcela${f.ps.length!==1?"s":""} · ${[...new Set(f.ps.map(p=>p.operadora))].filter(Boolean).slice(0,3).join(", ")||"—"}</div></div>`).join("")}</div>`:""}
      ${atrasadas.length?`<div class="tw"><table>
        <thead><tr><th>Venceu</th><th>Atraso</th><th>Cliente</th><th>Operadora</th><th>Tipo</th><th class="r">Valor</th><th></th></tr></thead>
        <tbody>${atrasadas.slice().sort((a,b)=>a.vence.localeCompare(b.vence)).slice(0,8).map(p=>`<tr>
          <td class="num">${dt(p.vence)}</td>
          <td class="num"><span class="chip ${diasEntre(p.vence,hoje())>30?"crit":"warn"}">${diasEntre(p.vence,hoje())}d</span></td>
          <td class="clickable" data-act="abrirContrato" data-id="${esc(p.contratoId)}"><b>${esc(p.cliente)}</b></td>
          <td>${esc(p.operadora||"—")}</td>
          <td><span class="chip ${tipoP(p.tipo).cls}">${tipoP(p.tipo).nome}</span></td>
          <td class="r num"><b>${brl2(valorVis(p))}</b></td>
          <td class="r"><button class="btn sm" data-act="conciliar" data-id="${esc(p.contratoId)}" data-n="${p.n}">Recebi</button></td>
        </tr>`).join("")}</tbody></table>
        ${atrasadas.length>8?`<div class="ta">e mais ${atrasadas.length-8} parcela(s) em atraso.</div>`:""}</div>`:""}
      <div style="border-top:1px solid var(--line);margin-top:${atrasadas.length?"14px":"0"};padding-top:13px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
          <span class="chip ${aReceber.length?"info":"mute"}">A receber</span>
          <b style="font-size:13px">Próximos</b>
          <input type="number" min="1" max="120" value="${aviso}" data-act="diasAviso"
            style="width:64px;padding:3px 7px;font-size:12.5px;text-align:center" aria-label="Dias de antecedência do aviso">
          <b style="font-size:13px">dias</b>
          <span class="hint">${aReceber.length
            ? `${brl(aReceber.reduce((a,p)=>a+valorVis(p),0))} em ${aReceber.length} parcela(s)`
            : "nada vence nesse intervalo"}</span>
        </div>
        ${aReceber.length?`<div class="tw"><table>
          <thead><tr><th>Data prevista</th><th>Em</th><th>Cliente</th><th>Tipo</th><th>Vigência do contrato</th><th class="r">Valor</th><th></th></tr></thead>
          <tbody>${aReceber.slice(0,10).map(p=>{
            const d = diasEntre(hoje(), p.vence);
            const fim = p.contrato.fim;
            return `<tr>
              <td class="num">${dt(p.vence)}</td>
              <td><span class="chip ${d<=2?"warn":"info"}">${d===0?"hoje":`${d}d`}</span></td>
              <td class="clickable" data-act="abrirContrato" data-id="${esc(p.contratoId)}"><b>${esc(p.cliente)}</b>
                <div class="hint">${esc(p.operadora||"")}</div></td>
              <td><span class="chip ${tipoP(p.tipo).cls}">${tipoP(p.tipo).nome}</span></td>
              <td class="num">${dt(p.contrato.inicio)} — ${fim?dt(fim):"—"}
                ${fim && diasEntre(hoje(),fim)<=60 && diasEntre(hoje(),fim)>=0 ? `<div class="hint" style="color:var(--warn)">vence em ${diasEntre(hoje(),fim)}d</div>`:""}</td>
              <td class="r num"><b>${brl2(valorVis(p))}</b></td>
              <td class="r"><button class="btn sm" data-act="conciliar" data-id="${esc(p.contratoId)}" data-n="${p.n}">Recebi</button></td>
            </tr>`;
          }).join("")}</tbody></table>
          ${aReceber.length>10?`<div class="ta">e mais ${aReceber.length-10} parcela(s) no intervalo.</div>`:""}</div>`:""}
        ${prox30.length?`<div class="ta" style="padding-top:10px">Em 30 dias: ${brl(prox30.reduce((a,p)=>a+valorVis(p),0))} em ${prox30.length} parcela(s), a primeira em ${dt(prox30.slice().sort((a,b)=>a.vence.localeCompare(b.vence))[0].vence)}.</div>`:""}
      </div>
    </div></section>`;
}

/* ============================================================
   IMPOSTO SOBRE A COMISSÃO
   A alíquota vem da própria parcela, senão do contrato, senão do padrão
   em Configurações. O imposto sai da parte da corretora; o repasse do
   corretor é calculado sobre o bruto — ou sobre o líquido, se o gestor
   escolher assim em Configurações.
   ============================================================ */
const temValor = v => v!=null && v!=="" && !isNaN(Number(v));
function aliquotaDe(p, c){
  if(p && temValor(p.impostoPct)) return Number(p.impostoPct);
  if(c && temValor(c.impostoPct)) return Number(c.impostoPct);
  return Number(S.config && S.config.impostoPadrao)||0;
}
const splitSobreLiquido = () => !!(S.config && S.config.splitSobre==="liquido");
/** Quanto de cada real da parcela vai para o corretor. */
function fatorCorretor(p, c){
  const split = (Number(c && c.splitPct)||0)/100;
  return splitSobreLiquido() ? split*(1-aliquotaDe(p,c)/100) : split;
}
const haImposto = () => (Number(S.config && S.config.impostoPadrao)||0) > 0
  || S.contratos.some(c=>temValor(c.impostoPct) && Number(c.impostoPct)>0 || (c.comissoes||[]).some(p=>temValor(p.impostoPct) && Number(p.impostoPct)>0));

/* ============================================================
   PREVISÃO DE COMISSÕES
   Da camada mais certa para a menos certa:
   1. Contratado — parcelas que já estão no cronograma dos contratos
      (cresce sozinho conforme os contratos são lançados);
   2. Novas vendas — ou pelo funil (leads abertos, ponderados pela etapa),
      ou pelo ritmo: se a corretora continuar vendendo como nos últimos
      6 meses, quanto dessas vendas cai em cada mês, pela curva real de
      pagamento dos contratos da carteira.
   Funil e ritmo são duas estimativas da MESMA coisa (as vendas futuras):
   por isso nunca se somam.
   ============================================================ */
const difMeses = (a, b) => (Number(b.slice(0,4))-Number(a.slice(0,4)))*12 + (Number(b.slice(5,7))-Number(a.slice(5,7)));
function previsaoComissoes(o){
  o = o || {};
  const N = o.meses || 12;
  const meses = proximosMeses(N);
  const idx = new Map(meses.map((m,i)=>[m,i]));
  const passa = x => (!o.pilar || x.pilar===o.pilar) && (!o.corretor || x.corretor===o.corretor);
  const vis = p => veCorretora() ? p.valor : fatia(p.valor, p);
  const todas = parcelas().filter(p=>noEscopo(p,"corretor") && passa(p));
  const linhas = meses.map(m=>({ mes:m, real:0, firme:0, funil:0, ritmo:0, imposto:0, parcelas:0,
    porPilar:{ saude:0, seguros:0, consorcios:0 } }));
  let atrasado = 0, nAtrasado = 0;
  const mAtual = meses[0];
  for(const p of todas){
    if(p.status==="recebido"){
      if((p.recebidoEm||p.vence).slice(0,7)===mAtual) linhas[0].real += efetivoVis(p);
      continue;
    }
    if(p.status!=="previsto") continue;               // glosada não entra
    if(p.vencida){ atrasado += vis(p); nAtrasado++; continue; }   // atraso fica à parte
    const i = idx.get(p.mes); if(i==null) continue;
    const v = vis(p);
    linhas[i].firme += v; linhas[i].parcelas++;
    linhas[i].porPilar[p.pilar] = (linhas[i].porPilar[p.pilar]||0) + v;
    if(veCorretora()) linhas[i].imposto += v*(p.aliquota||0)/100;
  }
  // funil
  const leads = S.leads.filter(l=>!["ganho","perdido"].includes(l.etapa) && noEscopo(l)
    && (!o.pilar || l.pilar===o.pilar) && (!o.corretor || (l.responsavel||"")===o.corretor));
  for(const l of leads){
    const E = estimativaLead(l);
    for(const x of (E.linhas||[])){
      const i = idx.get(String(x.vence||"").slice(0,7));
      if(i!=null) linhas[i].funil += (Number(x.valor)||0)*E.prob;
    }
  }
  // ritmo
  const hist = ultimosMeses(7).slice(0,6);            // os 6 meses fechados antes do atual
  const desde = addMonths(mAtual+"-01", -24).slice(0,7);
  const porK = new Array(37).fill(0); let somaCurva = 0;
  const gerado = {}; hist.forEach(m=>gerado[m]=0);
  let nHist = 0;
  for(const c of S.contratos){
    if(c.status==="cancelado" || !c.inicio || !noEscopo(c,"corretor") || !passa(c)) continue;
    const m0 = c.inicio.slice(0,7);
    if(m0 < desde || m0 > mAtual) continue;
    let tot = 0;
    for(const p of (c.comissoes||[])){
      const v = (Number(p.valor)||0) * (veCorretora() ? 1 : fatorCorretor(p,c));
      const k = difMeses(m0, String(p.vence||"").slice(0,7));
      if(k>=0 && k<=36){ porK[k] += v; somaCurva += v; }
      tot += v;
    }
    if(m0 in gerado){ gerado[m0] += tot; nHist++; }
  }
  const curva = somaCurva ? porK.map(v=>v/somaCurva) : [];
  const mensal = hist.reduce((a,m)=>a+gerado[m],0)/hist.length;
  if(mensal>0 && curva.length){
    for(let i=0;i<N;i++){
      let v = 0;
      for(let s=1; s<=i; s++) v += mensal*(curva[i-s]||0);   // vendas a partir do mês que vem
      linhas[i].ritmo = v;
    }
  }
  const realizado = hist.map(m=>({ mes:m, valor: todas.filter(p=>p.status==="recebido" && (p.recebidoEm||p.vence).slice(0,7)===m)
    .reduce((a,p)=>a+efetivoVis(p),0) }));
  const aliqPadrao = Number(S.config.impostoPadrao)||0;
  return { meses, linhas, atrasado, nAtrasado, realizado, leads:leads.length, aliqPadrao,
    ritmo:{ mensal, contratosMes: nHist/hist.length, meses: hist.length, temHistorico: mensal>0 } };
}
/** Modo das novas vendas na previsão: "ritmo", "funil" ou "nenhum". */
function modoPrevisao(P){
  const m = S.prevModo;
  if(m==="ritmo" || m==="funil" || m==="nenhum") return m;
  return P && P.ritmo.temHistorico ? "ritmo" : "funil";
}
const NOME_MODO = { ritmo:"Ritmo de vendas", funil:"Funil ponderado", nenhum:"Só o contratado" };

/** Coluna com o topo arredondado (4px) e a base reta — a especificação das colunas. */
function colunaTopo(x, y, w, h, r){
  r = Math.min(r, h, w/2);
  return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`;
}
function chartPrevisao(P, modo){
  const W = 760, H = 262, pad = { t:26, r:10, b:34, l:54 };
  const hist = P.realizado, fut = P.linhas;
  const nova = l => modo==="nenhum" ? 0 : (modo==="funil" ? l.funil : l.ritmo);
  const colunas = hist.map(h=>({ mes:h.mes, passado:true, segs:[{k:"real", v:h.valor}] }))
    .concat(fut.map(l=>({ mes:l.mes, passado:false, segs:[{k:"real",v:l.real},{k:"firme",v:l.firme},{k:"nova",v:nova(l)}] })));
  colunas.forEach(c=>c.total = c.segs.reduce((a,s)=>a+(s.v||0),0));
  const { topo, passos } = passosEixo(Math.max(...colunas.map(c=>c.total), 1), 4);
  const ph = H-pad.t-pad.b, passo = (W-pad.l-pad.r)/colunas.length;
  const bw = Math.min(24, passo*0.62);
  const escY = v => ph*(v/topo);
  const COR = { real:"var(--prev-real)", firme:"var(--prev-firme)", nova:"var(--prev-nova)" };
  let g = "";
  passos.forEach(v=>{
    const y = (pad.t+ph-escY(v)).toFixed(1);
    g += `<line class="grid-l" x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}"/>
      <text class="val" x="${pad.l-8}" y="${(+y+3.5).toFixed(1)}" text-anchor="end">${compacto(v)}</text>`;
  });
  const xDiv = pad.l + passo*hist.length;
  g += `<line x1="${xDiv.toFixed(1)}" y1="${pad.t-14}" x2="${xDiv.toFixed(1)}" y2="${pad.t+ph}" style="stroke:var(--line-strong);stroke-width:1"/>
    <text class="lbl" x="${(xDiv-8).toFixed(1)}" y="${pad.t-16}" text-anchor="end" style="font-weight:600;letter-spacing:.06em">RECEBIDO</text>
    <text class="lbl" x="${(xDiv+8).toFixed(1)}" y="${pad.t-16}" style="font-weight:600;letter-spacing:.06em">PREVISTO</text>`;
  const maxFut = Math.max(...colunas.filter(c=>!c.passado).map(c=>c.total));
  const rotular = new Set();
  colunas.forEach((c,i)=>{ if(!c.passado && c.total>0 && (i===hist.length || i===colunas.length-1 || c.total===maxFut)) rotular.add(i); });
  colunas.forEach((c,i)=>{
    const x = pad.l + passo*i + (passo-bw)/2;
    let y = pad.t + ph;
    const vivos = c.segs.filter(s=>s.v>0);
    vivos.forEach((s,k)=>{
      const h = escY(s.v); y -= h;
      const ultimo = k===vivos.length-1;
      const alt = Math.max(h - (k>0 ? 2 : 0), 0.8);     // 2px de respiro entre as camadas
      const d = ultimo ? colunaTopo(x, y, bw, alt, 4) : `M${x},${y+alt}V${y}H${x+bw}V${y+alt}Z`;
      g += `<path class="mark" d="${d}" style="fill:${COR[s.k]}"/>`;
    });
    if(rotular.has(i)) g += `<text class="val" x="${(x+bw/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle">${compacto(c.total)}</text>`;
    g += `<text class="lbl" x="${(x+bw/2).toFixed(1)}" y="${H-pad.b+15}" text-anchor="middle"${c.mes===mesAtual()?' style="font-weight:700;fill:var(--ink)"':""}>${mesLabel(c.mes)}</text>`;
    g += `<rect class="prev-alvo" x="${(pad.l+passo*i).toFixed(1)}" y="${pad.t-4}" width="${passo.toFixed(1)}" height="${ph+4}" tabindex="0"
      data-prev-i="${i}" role="img" aria-label="${esc(mesLabel(c.mes))}: ${esc(brl(c.total))}"/>`;
  });
  g += `<line class="grid-l" x1="${pad.l}" y1="${pad.t+ph}" x2="${W-pad.r}" y2="${pad.t+ph}" style="stroke:var(--line-strong)"/>`;
  PREV_TIP = colunas.map(c=>({ mes:c.mes, passado:c.passado, total:c.total, segs:c.segs }));
  return `<div class="prev-rolagem"><div class="prev-caixa">
    <svg class="chart prev" viewBox="0 0 ${W} ${H}" role="group" aria-label="Comissões recebidas nos últimos 6 meses e previstas para os próximos 12">${g}</svg>
    <div class="prev-tip" id="prevTip" hidden></div></div></div>`;
}
let PREV_TIP = [], PREV_MODO = "ritmo";
const ROTULO_SEG = () => ({ real:"Recebido", firme:"Contratado", nova: NOME_MODO[PREV_MODO] });
function mostrarTipPrevisao(alvo){
  const tip = document.getElementById("prevTip"); if(!tip || !alvo) return;
  const c = PREV_TIP[Number(alvo.dataset.prevI)]; if(!c) return;
  tip.replaceChildren();
  const cab = document.createElement("div"); cab.className = "pt-mes";
  cab.textContent = mesLabel(c.mes) + (c.passado ? " · recebido" : c.mes===mesAtual() ? " · mês atual" : " · previsão");
  const tot = document.createElement("div"); tot.className = "pt-tot"; tot.textContent = brl(c.total);
  tip.append(cab, tot);
  const rot = ROTULO_SEG();
  const COR = { real:"var(--prev-real)", firme:"var(--prev-firme)", nova:"var(--prev-nova)" };
  const modo = PREV_MODO;
  c.segs.filter(s=> c.passado ? s.k==="real" : (s.k==="real" ? s.v>0 : s.k==="firme" || modo!=="nenhum")).forEach(s=>{
    const l = document.createElement("div"); l.className = "pt-lin";
    const k = document.createElement("i"); k.style.background = COR[s.k];
    const v = document.createElement("b"); v.textContent = brl(s.v);
    const n = document.createElement("span"); n.textContent = rot[s.k];
    l.append(k, v, n); tip.append(l);
  });
  tip.hidden = false;
  // ao lado da coluna, dentro da área do gráfico — nunca cortado pela rolagem
  const caixa = tip.parentElement, rc = caixa.getBoundingClientRect(), ra = alvo.getBoundingClientRect();
  const dir = ra.right - rc.left + 8, esq = ra.left - rc.left - tip.offsetWidth - 8;
  tip.style.left = (dir + tip.offsetWidth <= rc.width - 4 ? dir : Math.max(4, esq)) + "px";
  tip.style.top = "28px";
}
document.addEventListener("pointerover", e=>{ const a = e.target.closest && e.target.closest("[data-prev-i]"); if(a) mostrarTipPrevisao(a); });
document.addEventListener("focusin", e=>{ const a = e.target.closest && e.target.closest("[data-prev-i]"); if(a) mostrarTipPrevisao(a); });
document.addEventListener("pointerout", e=>{ const a = e.target.closest && e.target.closest("[data-prev-i]");
  if(a && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-prev-i]"))){ const t = document.getElementById("prevTip"); if(t) t.hidden = true; } });

/** O painel que substitui a antiga "Projeção de recebimento". */
function painelPrevisao(){
  const f = S.filtros;
  const P = previsaoComissoes({ pilar:f.pilar||"", corretor:f.corretor||"" });
  const modo = modoPrevisao(P); PREV_MODO = modo;
  const nova = l => modo==="nenhum" ? 0 : (modo==="funil" ? l.funil : l.ritmo);
  const tot = l => l.real + l.firme + nova(l);
  const soma = (n, fn) => P.linhas.slice(0,n).reduce((a,l)=>a+fn(l),0);
  const t3 = soma(3, tot), t12 = soma(12, tot), firme12 = soma(12, l=>l.real+l.firme);
  const pctFirme = t12 ? firme12/t12*100 : 0;
  const imp12 = veCorretora() ? soma(12, l=>l.imposto + nova(l)*P.aliqPadrao/100) : 0;
  const rec6 = P.realizado.reduce((a,r)=>a+r.valor,0)/6;
  const filtro = [f.pilar?PILARES[f.pilar].curto:"", f.corretor?nomeUsuario(f.corretor):""].filter(Boolean).join(" · ");
  const explica = modo==="ritmo"
    ? (P.ritmo.temHistorico
        ? `Ritmo: nos últimos 6 meses entraram em média ${P.ritmo.contratosMes.toLocaleString("pt-BR",{maximumFractionDigits:1})} contrato(s) por mês, gerando ${brl(P.ritmo.mensal)} de comissão cada mês. A previsão supõe que esse ritmo continue e distribui cada venda nova pela curva real de pagamento da carteira.`
        : "Ainda não há 6 meses de vendas para medir o ritmo — use o funil por enquanto.")
    : modo==="funil"
      ? `Funil: ${P.leads} lead(s) aberto(s), cada um pela régua prevista e pela chance da etapa em que está.`
      : "Só o que já está no cronograma dos contratos lançados.";
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h3>Previsão de comissões</h3>
      <div class="sub">Recebido nos últimos 6 meses e previsto para os próximos 12${filtro?` · ${esc(filtro)}`:""}${veCorretora()?"":" · sua parte"}</div></div>
      <div class="right">
        <div class="seg" role="group" aria-label="Como estimar as vendas novas">
          ${["ritmo","funil","nenhum"].map(k=>`<button type="button" data-act="prevModo" data-v="${k}" aria-pressed="${modo===k}">${k==="ritmo"?"Ritmo de vendas":k==="funil"?"Funil":"Só contratado"}</button>`).join("")}
        </div>
        <button class="btn sm ghost" data-act="baixarRel" data-tipo="previsao">Baixar</button>
      </div></div>
    <div class="prev-kpis">
      <div><div class="k">Próximos 3 meses</div><div class="v">${brl(t3)}</div><div class="d">${brl(t3/3)} por mês</div></div>
      <div><div class="k">Próximos 12 meses</div><div class="v">${brl(t12)}</div><div class="d">${rec6?`${t12/12>=rec6?"+":""}${pct((t12/12-rec6)/rec6*100)} sobre a média recebida`:"sem histórico recebido"}</div></div>
      <div><div class="k">Já contratado</div><div class="v">${pct(pctFirme)}</div><div class="d">${brl(firme12)} com parcela lançada</div></div>
      <div><div class="k">Em atraso</div><div class="v"${P.atrasado?' style="color:var(--crit)"':""}>${brl(P.atrasado)}</div><div class="d">${P.nAtrasado} parcela(s) — fora do gráfico</div></div>
      ${veCorretora() && imp12>0 ? `<div><div class="k">Líquido de impostos</div><div class="v">${brl(t12-imp12)}</div><div class="d">${brl(imp12)} de imposto em 12 meses</div></div>` : ""}
    </div>
    <div class="chart-wrap" style="padding-top:4px">${chartPrevisao(P, modo)}</div>
    <div class="legend">
      <span><i class="dot sq" style="background:var(--prev-real)"></i>Recebido</span>
      <span><i class="dot sq" style="background:var(--prev-firme)"></i>Contratado — parcelas lançadas</span>
      ${modo!=="nenhum"?`<span><i class="dot sq" style="background:var(--prev-nova)"></i>${esc(NOME_MODO[modo])} — estimativa</span>`:""}
    </div>
    <div class="hint" style="padding:0 16px 12px">${esc(explica)}</div>
    ${tabelaOculta(["Mês","Recebido","Contratado","Funil ponderado","Ritmo de vendas","Previsão"],
      P.realizado.map(r=>[mesLabel(r.mes), brl(r.valor), "—", "—", "—", brl(r.valor)])
        .concat(P.linhas.map(l=>[mesLabel(l.mes), brl(l.real), brl(l.firme), brl(l.funil), brl(l.ritmo), brl(tot(l))])))}
  </section>`;
}

