/* Erbe · Central — views/painel.js
   Painel inicial e gráficos.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   PAINEL
   ============================================================ */
/* ---------- período e filtros do painel ----------
   O painel deixa de ser só "este mês": produção, recebimentos, conversão e
   ranking seguem o período escolhido; corretor, pilar e operadora filtram tudo. */
const PERIODOS_PAINEL = {
  hoje:   { rot:"Hoje",            int:()=>[hoje(), hoje()] },
  ontem:  { rot:"Ontem",           int:()=>[addDays(hoje(),-1), addDays(hoje(),-1)] },
  semana: { rot:"Esta semana",     int:()=>{ const d = new Date(hoje()+"T12:00:00"); const seg = addDays(hoje(), -((d.getDay()+6)%7)); return [seg, addDays(seg,6)]; } },
  mes:    { rot:"Este mês",        int:()=>[mesAtual()+"-01", addDays(addMonths(mesAtual()+"-01",1),-1)] },
  mesAnt: { rot:"Mês passado",     int:()=>[addMonths(mesAtual()+"-01",-1), addDays(mesAtual()+"-01",-1)] },
  tri:    { rot:"Este trimestre",  int:()=>{ const m = Number(hoje().slice(5,7)); const ini = `${hoje().slice(0,4)}-${String(m-((m-1)%3)).padStart(2,"0")}-01`; return [ini, addDays(addMonths(ini,3),-1)]; } },
  ano:    { rot:"Este ano",        int:()=>[hoje().slice(0,4)+"-01-01", hoje().slice(0,4)+"-12-31"] },
  t12:    { rot:"Últimos 12 meses",int:()=>[addDays(addMonths(hoje(),-12),1), hoje()] },
  custom: { rot:"Escolher datas",  int:()=>[(S.painel&&S.painel.de)||mesAtual()+"-01", (S.painel&&S.painel.ate)||hoje()] }
};
function periodoPainel(){
  S.painel = S.painel || { periodo:"mes", corretor:"", pilar:"", operadora:"" };
  const P = PERIODOS_PAINEL[S.painel.periodo] || PERIODOS_PAINEL.mes;
  const [de, ate] = P.int();
  const dias = Math.max(1, diasEntre(de, ate)+1);
  return { ...S.painel, de, ate, dias, rot: S.painel.periodo==="custom" ? `${dt(de)} a ${dt(ate)}` : P.rot,
           dentro: d => !!d && String(d).slice(0,10) >= de && String(d).slice(0,10) <= ate };
}
function filtrosPainel(F){
  const corretores = escopoTravado() ? [] : S.usuarios.filter(u=>u.ativo!==false && !u.manual);
  const operadoras = [...new Set(S.contratos.map(c=>c.operadora).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  return `<div class="filters painel-filtros" role="group" aria-label="Filtros do painel">
    <div class="field"><label for="pnPer">Período</label><select id="pnPer" data-act="filtroPainel" data-k="periodo">
      ${Object.entries(PERIODOS_PAINEL).map(([k,v])=>`<option value="${k}" ${F.periodo===k?"selected":""}>${esc(v.rot)}</option>`).join("")}</select></div>
    ${F.periodo==="custom"?`<div class="field"><label for="pnDe">De</label><input id="pnDe" type="date" value="${esc(F.de)}" data-act="filtroPainel" data-k="de"></div>
      <div class="field"><label for="pnAte">Até</label><input id="pnAte" type="date" value="${esc(F.ate)}" data-act="filtroPainel" data-k="ate"></div>`:""}
    ${corretores.length>1?`<div class="field"><label for="pnCor">Corretor</label><select id="pnCor" data-act="filtroPainel" data-k="corretor">
      <option value="">Toda a equipe</option>${corretores.map(u=>`<option value="${esc(u.id)}" ${F.corretor===u.id?"selected":""}>${esc(u.nome)}</option>`).join("")}</select></div>`:""}
    <div class="field"><label for="pnPil">Pilar</label><select id="pnPil" data-act="filtroPainel" data-k="pilar">
      <option value="">Todos</option>${PK.map(k=>`<option value="${k}" ${F.pilar===k?"selected":""}>${esc(PILARES[k].curto)}</option>`).join("")}</select></div>
    <div class="field"><label for="pnOp">Operadora</label><select id="pnOp" data-act="filtroPainel" data-k="operadora">
      <option value="">Todas</option>${operadoras.map(o=>`<option ${F.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    ${(F.corretor||F.pilar||F.operadora||F.periodo!=="mes")?`<div class="field"><label>&nbsp;</label><button class="btn ghost" data-act="limparPainel">Limpar</button></div>`:""}
  </div>`;
}
/** Produção do período agrupada (pilar, operadora, produto): mostra de onde vem o resultado. */
function blocoProducao(prod){
  if(!prod.length) return `<div class="empty"><b>Nenhum contrato iniciado no período</b>Troque o período ou os filtros acima.</div>`;
  const agrupar = chave => { const m = new Map(); for(const c of prod){ const k = chave(c)||"—"; const o = m.get(k)||{ n:0, v:0 }; o.n++; o.v += comissaoContrato(c); m.set(k,o); }
    return [...m.entries()].sort((a,b)=>b[1].v-a[1].v || b[1].n-a[1].n); };
  const lista = (titulo, linhas, cor) => { const max = Math.max(...linhas.map(([,o])=>o.v), 1);
    return `<div class="prod-bloco"><div class="prod-tit">${esc(titulo)}</div>${linhas.slice(0,5).map(([k,o])=>`<div class="bar-line">
      <span class="nm">${esc(k)}</span><span class="track"><span class="fill" style="width:${larg(o.v,max)}%;background:${cor(k)}"></span></span>
      <span class="n"><span class="com">${brl(o.v)} · </span>${o.n}</span></div>`).join("")}</div>`; };
  return `<div class="prod-grid">
    ${lista("Por pilar", agrupar(c=>PILARES[c.pilar]?PILARES[c.pilar].curto:c.pilar), k=>{ const e = Object.values(PILARES).find(x=>x.curto===k); return e?e.cor:"var(--accent)"; })}
    ${lista("Por operadora", agrupar(c=>c.operadora), ()=>"var(--accent)")}
    ${lista("Por produto", agrupar(c=>c.produto), ()=>"var(--info)")}
  </div>`;
}

function viewDashboard(){
  const F = periodoPainel();
  const ms = ultimosMeses(12);
  const mAtual = mesAtual();
  const filtraCtr = c => (!F.corretor || c.corretor===F.corretor) && (!F.pilar || c.pilar===F.pilar) && (!F.operadora || c.operadora===F.operadora);
  const ctr = S.contratos.filter(c=>noEscopo(c,"corretor") && filtraCtr(c));
  const prod = ctr.filter(c=>c.status!=="cancelado" && F.dentro(c.inicio));
  const producaoMes = prod.reduce((a,c)=>a+comissaoContrato(c),0);

  const pcs = parcelas().filter(p=>noEscopo(p,"corretor") && filtraCtr(p.contrato));
  const recebidoMes = pcs.filter(p=>p.status==="recebido" && F.dentro(p.recebidoEm||p.vence)).reduce((a,p)=>a+efetivoVis(p),0);
  const previsto90 = pcs.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),90)).reduce((a,p)=>a+valorVis(p),0);
  const atrasadas = pcs.filter(p=>p.vencida);
  const filtraLead = l => noEscopo(l) && (!F.corretor || l.responsavel===F.corretor) && (!F.pilar || l.pilar===F.pilar);
  const leadsAtivos = S.leads.filter(l=>!["ganho","perdido"].includes(l.etapa) && filtraLead(l));
  const pipeline = leadsAtivos.reduce((a,l)=>a+(Number(l.valorEstimado)||0),0);
  const ponderado = leadsAtivos.reduce((a,l)=>{ const e=S.config.etapas.find(e=>e.id===l.etapa); return a+(Number(l.valorEstimado)||0)*((e?e.prob:0)/100); },0);
  // conversão do período: leads que fecharam (ganho ou perdido) com a última movimentação dentro dele
  const fechados = S.leads.filter(l=>l.etapa==="ganho" && filtraLead(l) && F.dentro(l.ultimoContato||l.criadoEm)).length;
  const perdidos = S.leads.filter(l=>l.etapa==="perdido" && filtraLead(l) && F.dentro(l.ultimoContato||l.criadoEm)).length;
  const conv = fechados+perdidos ? fechados/(fechados+perdidos)*100 : 0;
  const novosLeads = S.leads.filter(l=>filtraLead(l) && F.dentro(l.criadoEm)).length;
  const ativos = ctr.filter(c=>["ativo","implantado"].includes(c.status));
  const vidas = ativos.reduce((a,c)=>a+totalVidas(c),0);
  const metaMensal = F.corretor
    ? (S.usuarios.find(u=>u.id===F.corretor)?.meta || 0)
    : S.escopo==="meu"
      ? (S.usuarios.find(u=>u.id===S.uid)?.meta || 0)
      : (S.usuarios.reduce((a,u)=>a+(Number(u.meta)||0),0) || S.config.metaGlobal);
  // meta é mensal: em outros períodos vira proporcional aos dias
  const ehMesCheio = ["mes","mesAnt"].includes(F.periodo);
  const metaMes = ehMesCheio ? metaMensal : Math.round(metaMensal * F.dias / 30.44);

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

  ${filtrosPainel(F)}
  ${avisoSuaParte()}
  <div class="stat-row">
    <div class="stat hero com">
      <div class="k">${veCorretora()?"Comissão gerada":"Sua comissão"} · ${esc(F.rot.toLowerCase())}</div>
      <div class="v">${brl(producaoMes)}</div>
      <div class="d">${prod.length} contrato${prod.length!==1?"s":""} · meta ${ehMesCheio?"":"proporcional "}${brl(metaMes)} · ${metaMes?pct(producaoMes/metaMes*100):"—"} atingida</div>
      ${metaMes?`<div class="meta-barra" role="progressbar" aria-label="Meta atingida" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(100,producaoMes/metaMes*100))}"><span style="width:${Math.min(100,producaoMes/metaMes*100).toFixed(1)}%"></span></div>`:""}
    </div>
    <div class="stat com">
      <div class="k">Comissão recebida · ${esc(F.rot.toLowerCase())}</div>
      <div class="v">${brl(recebidoMes)}</div>
      <div class="d">${pcs.filter(p=>p.status==="recebido"&&F.dentro(p.recebidoEm||p.vence)).length} parcelas conciliadas</div>
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
      <div class="k">Conversão · ${esc(F.rot.toLowerCase())}</div>
      <div class="v">${fechados+perdidos?pct(conv):"—"}</div>
      <div class="d">${fechados} ganhos · ${perdidos} perdidos · ${novosLeads} lead${novosLeads!==1?"s":""} novo${novosLeads!==1?"s":""}</div>
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

    <section class="panel com">
      <div class="panel-head"><div><h3>De onde veio a produção</h3><div class="sub">Contratos iniciados · ${esc(F.rot.toLowerCase())}</div></div></div>
      <div class="chart-wrap">${blocoProducao(prod)}</div>
    </section>

    ${veCorretora()?`<section class="panel">
      <div class="panel-head"><div><h3>Ranking da equipe</h3><div class="sub">Comissão gerada · ${esc(F.rot.toLowerCase())} · contra a meta${ehMesCheio?"":" proporcional"}</div></div></div>
      <div class="chart-wrap">${rankingEquipe(F, ehMesCheio)}</div>
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
function rankingEquipe(F, ehMesCheio){
  const base = S.usuarios.filter(u=>u.ativo!==false);
  if(!base.length) return `<div class="empty"><b>Equipe ainda não cadastrada</b>Convide corretores pelo botão de compartilhar do sistema — cada pessoa aparece aqui ao abrir pela primeira vez.</div>`;
  const linhas = base.map(u=>{
    const p = S.contratos.filter(c=>c.corretor===u.id && c.status!=="cancelado" && F.dentro(c.inicio)
                                    && (!F.pilar || c.pilar===F.pilar) && (!F.operadora || c.operadora===F.operadora))
                          .reduce((a,c)=>a+comissaoContrato(c),0);
    const meta = Number(u.meta)||0;
    return { nome:u.nome, meta: ehMesCheio ? meta : Math.round(meta*F.dias/30.44), p };
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

