/* Erbe · Central — views/painel.js
   Painel inicial e gráficos.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   PAINEL
   ============================================================ */
function viewDashboard(){
  const ms = ultimosMeses(12);
  const mAtual = mesAtual();
  const ctr = S.contratos.filter(c=>noEscopo(c,"corretor"));
  const prod = ctr.filter(c=>c.status!=="cancelado" && (c.inicio||"").slice(0,7)===mAtual);
  const producaoMes = prod.reduce((a,c)=>a+comissaoContrato(c),0);

  const pcs = parcelas().filter(p=>noEscopo(p,"corretor"));
  const recebidoMes = pcs.filter(p=>p.status==="recebido" && (p.recebidoEm||p.vence).slice(0,7)===mAtual).reduce((a,p)=>a+efetivoVis(p),0);
  const previsto90 = pcs.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),90)).reduce((a,p)=>a+valorVis(p),0);
  const atrasadas = pcs.filter(p=>p.vencida);
  const leadsAtivos = S.leads.filter(l=>!["ganho","perdido"].includes(l.etapa) && noEscopo(l));
  const pipeline = leadsAtivos.reduce((a,l)=>a+(Number(l.valorEstimado)||0),0);
  const ponderado = leadsAtivos.reduce((a,l)=>{ const e=S.config.etapas.find(e=>e.id===l.etapa); return a+(Number(l.valorEstimado)||0)*((e?e.prob:0)/100); },0);
  const fechados = S.leads.filter(l=>l.etapa==="ganho" && noEscopo(l)).length;
  const perdidos = S.leads.filter(l=>l.etapa==="perdido" && noEscopo(l)).length;
  const conv = fechados+perdidos ? fechados/(fechados+perdidos)*100 : 0;
  const ativos = ctr.filter(c=>["ativo","implantado"].includes(c.status));
  const vidas = ativos.reduce((a,c)=>a+totalVidas(c),0);
  const metaMes = S.escopo==="meu"
    ? (S.usuarios.find(u=>u.id===S.uid)?.meta || 0)
    : (S.usuarios.reduce((a,u)=>a+(Number(u.meta)||0),0) || S.config.metaGlobal);

  // alertas
  const tarefasVenc = S.tarefas.filter(t=>t.status!=="feita" && t.vence<=hoje() && noEscopo(t));
  const parados = leadsAtivos.filter(l=>diasEntre(l.ultimoContato||l.criadoEm||hoje(), hoje())>=4);
  const renov = ctr.filter(c=>c.fim && ["ativo","implantado"].includes(c.status) && c.fim>=hoje() && c.fim<=addDays(hoje(),60));
  const alertas = [
    tarefasVenc.length && {cls:"crit", ic:"!", t:`${tarefasVenc.length} tarefa${tarefasVenc.length>1?"s":""} vencida${tarefasVenc.length>1?"s":""}`, s:"Agenda precisa de atenção hoje", go:"tarefas"},
    atrasadas.length && {cls:"crit", ic:"$", t:`${atrasadas.length} comissão${atrasadas.length!==1?"ões":""} em atraso`, s:brl(atrasadas.reduce((a,p)=>a+valorVis(p),0))+" a conciliar", go:"comissoes", f:{status:"atrasado"}},
    (()=>{ const dias = Math.max(1, Number(S.config.diasAvisoComissao)||7);
      const proximas = pcs.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),dias));
      return proximas.length && {cls:"ok", ic:"$", t:`${brl(proximas.reduce((a,p)=>a+valorVis(p),0))} a receber`,
        s:`${proximas.length} parcela(s) vencem nos próximos ${dias} dias`, go:"comissoes"}; })(),
    parados.length && {cls:"warn", ic:"◷", t:`${parados.length} lead${parados.length!==1?"s":""} sem contato`, s:"Mais de 4 dias parados no funil", go:"leads"},
    (()=>{ const m = mudancasDeFaixa(60);
      return m.length && {cls:"warn", ic:"↑", t:`${m.length} vida${m.length!==1?"s":""} muda${m.length!==1?"m":""} de faixa etária`,
        s:"Reajuste por idade nos próximos 60 dias — avise antes do boleto", go:"vidas"}; })(),
    (()=>{ const r = reajustesChegando(30);
      return r.length && {cls:"warn", ic:"%", t:`${r.length} reajuste${r.length!==1?"s":""} anual${r.length!==1?"is":""} em 30 dias`,
        s:"Contratos de saúde no mês de aniversário", go:"renovacoes"}; })(),
    (()=>{ const d = diasAvisoAniv(), a = aniversariantes(d);
      return a.length && {cls:"info", ic:"✦", t:`${a.length} aniversariante${a.length!==1?"s":""} ${d===0?"hoje":`em ${d} dia${d!==1?"s":""}`}`,
        s:a.slice(0,2).map(x=>x.nome).join(", ")+(a.length>2?"…":""), go:"clientes"}; })(),
    renov.length && {cls:"info", ic:"↻", t:`${renov.length} renovaç${renov.length!==1?"ões":"ão"} em 60 dias`, s:"Antecipe o reajuste com o cliente", go:"renovacoes"},
    (()=>{ const atrasados = S.clientes.filter(x=>noEscopo(x) && etapaCliente(x)!=="encerrado" && posVenda(x).atrasado).length;
      return atrasados && {cls:"warn", ic:"☎", t:`${atrasados} cliente${atrasados!==1?"s":""} sem pós-venda`, s:"Passou da cadência de contato combinada", go:"clientes"}; })(),
    (()=>{ const g = despesasDoMes(mAtual).reduce((a,d)=>a+(Number(d.valor)||0),0);
      if(!g) return null;
      const r = receitaDoMes(mAtual) - g;
      return r < 0 && {cls:"crit", ic:"−", t:`Resultado negativo em ${brl(Math.abs(r))}`,
        s:`${brl(g)} de gastos contra ${brl(receitaDoMes(mAtual))} de comissão recebida`, go:"despesas"}; })()
  ].filter(Boolean);

  // séries
  const prodPorMes = ms.map(m=>{
    const o={mes:m}; PK.forEach(p=>o[p]=0);
    ctr.filter(c=>c.status!=="cancelado" && (c.inicio||"").slice(0,7)===m).forEach(c=>{ o[c.pilar]=(o[c.pilar]||0)+comissaoContrato(c); });
    return o;
  });
  const fluxo = proximosMeses(6).map(m=>({
    mes:m,
    previsto: pcs.filter(p=>p.mes===m && p.status!=="recebido").reduce((a,p)=>a+valorVis(p),0),
    recebido: pcs.filter(p=>p.mes===m && p.status==="recebido").reduce((a,p)=>a+efetivoVis(p),0)
  }));
  const funil = S.config.etapas.filter(e=>!["ganho","perdido"].includes(e.id)).map(e=>({
    nome:e.nome,
    n:S.leads.filter(l=>l.etapa===e.id && noEscopo(l)).length,
    v:S.leads.filter(l=>l.etapa===e.id && noEscopo(l)).reduce((a,l)=>a+(Number(l.valorEstimado)||0),0)
  }));

  return `
  ${alertas.length?`<div class="alerts">${alertas.map(a=>`
    <button class="alert ${a.cls} ${a.ic==="$"?"com":""}" data-act="irFiltro" data-view="${a.go}" data-f='${esc(JSON.stringify(a.f||{}))}'>
      <span class="ai" aria-hidden="true">${a.ic}</span>
      <span><b>${esc(a.t)}</b><span>${esc(a.s)}</span></span>
    </button>`).join("")}</div>`:""}

  ${avisoSuaParte()}
  <div class="stat-row">
    <div class="stat hero com">
      <div class="k">${veCorretora()?"Comissão gerada":"Sua comissão"} em ${mesLabel(mAtual)}</div>
      <div class="v">${brl(producaoMes)}</div>
      <div class="d">${prod.length} contrato${prod.length!==1?"s":""} · meta ${brl(metaMes)} · ${metaMes?pct(producaoMes/metaMes*100):"—"} atingida</div>
    </div>
    <div class="stat com">
      <div class="k">Comissão recebida no mês</div>
      <div class="v">${brl(recebidoMes)}</div>
      <div class="d">${pcs.filter(p=>p.status==="recebido"&&(p.recebidoEm||p.vence).slice(0,7)===mAtual).length} parcelas conciliadas</div>
    </div>
    <div class="stat com">
      <div class="k">Previsto 90 dias</div>
      <div class="v">${brl(previsto90)}</div>
      <div class="d">${atrasadas.length?`<span class="delta down">${brl(atrasadas.reduce((a,p)=>a+valorVis(p),0))} em atraso</span>`:"Nenhuma parcela em atraso"}</div>
    </div>
    <div class="stat">
      <div class="k">Pipeline ponderado</div>
      <div class="v">${brl(ponderado)}</div>
      <div class="d">${leadsAtivos.length} leads · ${brl(pipeline)} bruto</div>
    </div>
    <div class="stat">
      <div class="k">Conversão</div>
      <div class="v">${pct(conv)}</div>
      <div class="d">${fechados} ganhos · ${perdidos} perdidos</div>
    </div>
    <div class="stat">
      <div class="k">Carteira ativa</div>
      <div class="v">${ativos.length.toLocaleString("pt-BR")}</div>
      <div class="d">contratos ativos e implantados</div>
    </div>
  </div>

  ${painelExecutivo(ativos, vidas)}

  ${painelCrossSell()}

  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
    <section class="panel com">
      <div class="panel-head"><div><h3>Produção por mês</h3><div class="sub">Comissão gerada pelos contratos iniciados no mês · 12 meses</div></div></div>
      ${chartBarrasEmpilhadas(prodPorMes)}
      <div class="legend">${PK.map(p=>`<span><i class="dot" style="background:${PILARES[p].cor}"></i>${PILARES[p].curto}</span>`).join("")}</div>
      ${tabelaOculta(["Mês",...PK.map(p=>PILARES[p].curto)], prodPorMes.map(r=>[mesLabel(r.mes),...PK.map(p=>brl(r[p]))]))}
    </section>

    <section class="panel com">
      <div class="panel-head"><div><h3>Fluxo de comissão</h3><div class="sub">Próximos 6 meses · previsto e já recebido</div></div></div>
      ${chartFluxo(fluxo)}
      <div class="legend">
        <span><i class="dot" style="background:var(--accent)"></i>Recebido</span>
        <span><i class="dot" style="background:var(--line-strong)"></i>Previsto</span>
      </div>
      ${tabelaOculta(["Mês","Previsto","Recebido"], fluxo.map(r=>[mesLabel(r.mes),brl(r.previsto),brl(r.recebido)]))}
    </section>

    <section class="panel">
      <div class="panel-head"><div><h3>Funil</h3><div class="sub">Leads em aberto por etapa</div></div>
        <div class="right"><button class="btn sm ghost" data-act="irFiltro" data-view="leads" data-f="{}">Abrir funil</button></div></div>
      <div class="chart-wrap">
        ${funil.every(f=>!f.n) ? `<div class="empty"><b>Funil vazio</b>Cadastre o primeiro lead para começar a medir conversão.</div>` :
        funil.map(f=>{
          const max = Math.max(...funil.map(x=>x.n),1);
          return `<div class="bar-line"><span class="nm">${esc(f.nome)}</span>
            <span class="track"><span class="fill" style="width:${larg(f.n,max)}%;background:var(--accent)"></span></span>
            <span class="n">${f.n} · ${brl(f.v)}</span></div>`;
        }).join("")}
      </div>
    </section>

    ${veCorretora()?`<section class="panel">
      <div class="panel-head"><div><h3>Ranking da equipe</h3><div class="sub">Comissão gerada no mês contra a meta</div></div></div>
      <div class="chart-wrap">${rankingEquipe(mAtual)}</div>
    </section>`:""}
  </div>`;
}

/* ---------- gráficos ---------- */
const kNum = v => v>=1000 ? Math.round(v/1000)+"k" : String(Math.round(v));
/** Ticks 0 / meio / topo, descartando rótulos repetidos em escalas pequenas. */
function ticksDe(max){
  const brutos=[0,max/2,max], vistos=new Set(), out=[];
  brutos.forEach(t=>{ const r=kNum(t); if(!vistos.has(r)){ vistos.add(r); out.push([t,r]); } });
  return out;
}
function chartBarrasEmpilhadas(dados){
  const W=560, H=190, pad={t:14,r:8,b:26,l:52};
  const max = Math.max(...dados.map(d=>PK.reduce((a,p)=>a+(d[p]||0),0)), 1);
  const passo = (W-pad.l-pad.r)/dados.length;
  const bw = Math.min(26, passo*0.6);
  const escala = v => (H-pad.t-pad.b) * (v/max);
  let g="";
  ticksDe(max).forEach(([t,rot])=>{
    const y = H-pad.b-escala(t);
    g += `<line class="grid-l" x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}"/>
          <text class="val" x="${pad.l-7}" y="${y+3}" text-anchor="end">${rot}</text>`;
  });
  dados.forEach((d,i)=>{
    const x = pad.l + passo*i + (passo-bw)/2;
    let y = H-pad.b;
    const total = PK.reduce((a,p)=>a+(d[p]||0),0);
    PK.forEach(p=>{
      const v = d[p]||0; if(!v) return;
      const h = escala(v); y -= h;
      g += `<rect class="mark" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(h-2,1).toFixed(1)}" rx="2" fill="${PILARES[p].cor}"><title>${mesLabel(d.mes)} · ${PILARES[p].curto}: ${brl(v)}</title></rect>`;
    });
    if(total) g += `<text class="val" x="${(x+bw/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle">${total>=1000?Math.round(total/1000)+"k":Math.round(total)}</text>`;
    g += `<text class="lbl" x="${(x+bw/2).toFixed(1)}" y="${H-pad.b+14}" text-anchor="middle">${mesLabel(d.mes).slice(0,3)}</text>`;
  });
  g += `<line class="grid-l" x1="${pad.l}" y1="${H-pad.b}" x2="${W-pad.r}" y2="${H-pad.b}"/>`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Produção mensal por pilar">${g}</svg></div>`;
}
function chartFluxo(dados){
  const W=560, H=190, pad={t:16,r:8,b:26,l:52};
  const max = Math.max(...dados.map(d=>d.previsto+d.recebido), 1);
  const passo = (W-pad.l-pad.r)/dados.length;
  const bw = Math.min(30, passo*0.55);
  const escala = v => (H-pad.t-pad.b)*(v/max);
  let g="";
  ticksDe(max).forEach(([t,rot])=>{
    const y = H-pad.b-escala(t);
    g += `<line class="grid-l" x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}"/>
          <text class="val" x="${pad.l-7}" y="${y+3}" text-anchor="end">${rot}</text>`;
  });
  dados.forEach((d,i)=>{
    const x = pad.l + passo*i + (passo-bw)/2;
    let y = H-pad.b;
    const hr = escala(d.recebido), hp = escala(d.previsto);
    if(d.recebido){ y-=hr; g+=`<rect class="mark" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(hr-2,1).toFixed(1)}" rx="2" fill="var(--accent)"><title>${mesLabel(d.mes)} · recebido ${brl(d.recebido)}</title></rect>`; }
    if(d.previsto){ y-=hp; g+=`<rect class="mark" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(hp-2,1).toFixed(1)}" rx="2" fill="var(--line-strong)"><title>${mesLabel(d.mes)} · previsto ${brl(d.previsto)}</title></rect>`; }
    const tot = d.previsto+d.recebido;
    if(tot) g += `<text class="val" x="${(x+bw/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle">${tot>=1000?Math.round(tot/1000)+"k":Math.round(tot)}</text>`;
    g += `<text class="lbl" x="${(x+bw/2).toFixed(1)}" y="${H-pad.b+14}" text-anchor="middle">${mesLabel(d.mes).slice(0,3)}</text>`;
  });
  g += `<line class="grid-l" x1="${pad.l}" y1="${H-pad.b}" x2="${W-pad.r}" y2="${H-pad.b}"/>`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fluxo de comissão previsto e recebido">${g}</svg></div>`;
}
function tabelaOculta(cols, linhas){
  if(!linhas.length) return "";
  return `<details class="tblview"><summary>Ver os números em tabela</summary>
    <div class="tw" style="padding:0 16px 14px"><table>
      <thead><tr>${cols.map((c,i)=>`<th class="${i?"r":""}">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${linhas.map(l=>`<tr>${l.map((c,i)=>`<td class="${i?"r":""} ${i?"num":""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div></details>`;
}
function rankingEquipe(mes){
  const base = S.usuarios.filter(u=>u.ativo!==false);
  if(!base.length) return `<div class="empty"><b>Equipe ainda não cadastrada</b>Convide corretores pelo botão de compartilhar do sistema — cada pessoa aparece aqui ao abrir pela primeira vez.</div>`;
  const linhas = base.map(u=>{
    const p = S.contratos.filter(c=>c.corretor===u.id && c.status!=="cancelado" && (c.inicio||"").slice(0,7)===mes)
                          .reduce((a,c)=>a+comissaoContrato(c),0);
    return { nome:u.nome, meta:Number(u.meta)||0, p };
  }).sort((a,b)=>b.p-a.p);
  const max = Math.max(...linhas.map(l=>Math.max(l.p,l.meta)),1);
  return linhas.map(l=>{
    const at = l.meta ? l.p/l.meta*100 : 0;
    const cor = !l.meta ? "var(--ink-3)" : at>=100 ? "var(--ok)" : at>=60 ? "var(--gold)" : "var(--crit)";
    return `<div class="bar-line">
      <span class="nm">${esc(l.nome)}</span>
      <span class="track">
        <span class="fill" style="width:${Math.min(larg(l.p,max),100)}%;background:${cor}"></span>
      </span>
      <span class="n">${brl(l.p)}${l.meta?` · ${pct(at)}`:""}</span></div>`;
  }).join("");
}

