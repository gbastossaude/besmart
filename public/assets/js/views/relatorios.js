/* Erbe · Central — views/relatorios.js
   Relatórios em tela e para baixar (Excel/PDF).
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   RELATÓRIOS
   ============================================================ */
const PERIODOS = {
  mes:      { rot:"Este mês",        de:()=>mesAtual()+"-01",             ate:()=>hoje() },
  mesAnt:   { rot:"Mês passado",     de:()=>addMonths(mesAtual()+"-01",-1), ate:()=>addDays(mesAtual()+"-01",-1) },
  t3:       { rot:"Últimos 3 meses", de:()=>addMonths(hoje(),-3),          ate:()=>hoje() },
  t6:       { rot:"Últimos 6 meses", de:()=>addMonths(hoje(),-6),          ate:()=>hoje() },
  t12:      { rot:"Últimos 12 meses",de:()=>addMonths(hoje(),-12),         ate:()=>hoje() },
  ano:      { rot:"Este ano",        de:()=>hoje().slice(0,4)+"-01-01",    ate:()=>hoje() },
  anoAnt:   { rot:"Ano passado",     de:()=>(+hoje().slice(0,4)-1)+"-01-01", ate:()=>(+hoje().slice(0,4)-1)+"-12-31" },
  tudo:     { rot:"Todo o período",  de:()=>"1900-01-01",                  ate:()=>"2999-12-31" },
  custom:   { rot:"Personalizado",   de:()=>S.filtros.de||"1900-01-01",    ate:()=>S.filtros.ate||"2999-12-31" }
};
/** Intervalo em vigor nos relatórios, já resolvido em datas. */
function janela(){
  const k = S.filtros.periodo || "t12";
  const P = PERIODOS[k] || PERIODOS.t12;
  return { chave:k, rot:P.rot, de:P.de(), ate:P.ate() };
}
/** Contratos que passam por todos os filtros do relatório. */
function contratosFiltrados(){
  const f = S.filtros, j = janela();
  return S.contratos.filter(c=>c.status!=="cancelado" && noEscopo(c,"corretor"))
    .filter(c=>(c.inicio||"") >= j.de && (c.inicio||"") <= j.ate)
    .filter(c=>!f.pilar     || c.pilar===f.pilar)
    .filter(c=>!f.tipoPlano || tipoPlano(c)===f.tipoPlano)
    .filter(c=>!f.operadora || c.operadora===f.operadora)
    .filter(c=>!f.corretor  || c.corretor===f.corretor);
}
function leadsFiltrados(){
  const f = S.filtros, j = janela();
  return S.leads.filter(l=>noEscopo(l))
    .filter(l=>(l.criadoEm||"") >= j.de && (l.criadoEm||"") <= j.ate)
    .filter(l=>!f.pilar    || l.pilar===f.pilar)
    .filter(l=>!f.corretor || l.responsavel===f.corretor);
}
function filtrosRelatorio(){
  const f = S.filtros, j = janela();
  const operadoras = [...new Set(S.contratos.map(c=>c.operadora).filter(Boolean))].sort();
  return `
  <div class="filters">
    <div class="field"><label for="rPeriodo">Período</label><select id="rPeriodo" data-act="filtro" data-k="periodo">
      ${Object.entries(PERIODOS).map(([k,v])=>`<option value="${k}" ${j.chave===k?"selected":""}>${esc(v.rot)}</option>`).join("")}</select></div>
    ${j.chave==="custom"?`
      <div class="field"><label for="rDe">De</label><input id="rDe" type="date" value="${esc(f.de||addMonths(hoje(),-12))}" data-act="filtro" data-k="de"></div>
      <div class="field"><label for="rAte">Até</label><input id="rAte" type="date" value="${esc(f.ate||hoje())}" data-act="filtro" data-k="ate"></div>`:""}
    <div class="field"><label for="rPilar">Pilar</label><select id="rPilar" data-act="filtro" data-k="pilar">
      <option value="">Todos</option>${PK.map(x=>`<option value="${x}" ${f.pilar===x?"selected":""}>${PILARES[x].curto}</option>`).join("")}</select></div>
    <div class="field"><label for="rTipo">Tipo de plano</label><select id="rTipo" data-act="filtro" data-k="tipoPlano">
      <option value="">Todos</option>${(S.config.tiposPlano||[]).map(t=>`<option ${f.tipoPlano===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="field"><label for="rOp">Operadora</label><select id="rOp" data-act="filtro" data-k="operadora">
      <option value="">Todas</option>${operadoras.map(o=>`<option ${f.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    <div class="field"><label for="rCor">Corretor</label><select id="rCor" data-act="filtro" data-k="corretor">
      <option value="">Todos</option>${S.usuarios.map(u=>`<option value="${esc(u.id)}" ${f.corretor===u.id?"selected":""}>${esc(u.nome)}</option>`).join("")}</select></div>
    ${Object.keys(f).length?`<button class="btn ghost" data-act="limparFiltros">Limpar filtros</button>`:""}
    <button class="btn" style="margin-left:auto" data-act="baixarRel">Baixar em Excel ou PDF</button>
  </div>`;
}
/* ============================================================
   RELATÓRIOS PARA BAIXAR (Excel e PDF)
   Cada relatório é montado uma vez, num formato neutro (colunas com
   tipo + linhas), e os dois geradores leem desse mesmo modelo. As
   regras de acesso da tela valem aqui: o corretor só vê a carteira
   dele e a parte dele da comissão; o assistente não vê comissão.
   ============================================================ */
const REL_PERIODOS = {
  tudo:   { rot:"Todo o período",    de:()=>"1900-01-01", ate:()=>"2999-12-31" },
  mes:    { rot:"Este mês",          de:()=>mesAtual()+"-01", ate:()=>addDays(addMonths(mesAtual()+"-01",1),-1) },
  mesAnt: { rot:"Mês passado",       de:()=>addMonths(mesAtual()+"-01",-1), ate:()=>addDays(mesAtual()+"-01",-1) },
  t3:     { rot:"Últimos 3 meses",   de:()=>addMonths(hoje(),-3),  ate:()=>hoje() },
  t6:     { rot:"Últimos 6 meses",   de:()=>addMonths(hoje(),-6),  ate:()=>hoje() },
  t12:    { rot:"Últimos 12 meses",  de:()=>addMonths(hoje(),-12), ate:()=>hoje() },
  ano:    { rot:"Este ano",          de:()=>hoje().slice(0,4)+"-01-01", ate:()=>hoje().slice(0,4)+"-12-31" },
  anoAnt: { rot:"Ano passado",       de:()=>(+hoje().slice(0,4)-1)+"-01-01", ate:()=>(+hoje().slice(0,4)-1)+"-12-31" },
  p3:     { rot:"Próximos 3 meses",  de:()=>hoje(), ate:()=>addMonths(hoje(),3) },
  p6:     { rot:"Próximos 6 meses",  de:()=>hoje(), ate:()=>addMonths(hoje(),6) },
  p12:    { rot:"Próximos 12 meses", de:()=>hoje(), ate:()=>addMonths(hoje(),12) },
  custom: { rot:"Escolher datas",    de:()=>(S.rel&&S.rel.de)||"1900-01-01", ate:()=>(S.rel&&S.rel.ate)||"2999-12-31" }
};
const PER_PASSADO = ["tudo","mes","mesAnt","t3","t6","t12","ano","anoAnt","custom"];
const PER_COMISSAO = ["p3","p6","p12","mes","mesAnt","t3","t6","t12","ano","anoAnt","tudo","custom"];
const REL_TIPOS = {
  carteira:     { nome:"Carteira de clientes", desc:"Cadastro, produtos, vidas e comissão de cada cliente",
                  filtros:["periodo","pilar","corretor","situacao"], periodos:PER_PASSADO, periodo:"tudo", periodoRot:"Clientes desde" },
  contratos:    { nome:"Contratos", desc:"Propostas, apólices e cotas, com vigência e valores",
                  filtros:["periodo","pilar","operadora","corretor","situacao"], periodos:PER_PASSADO, periodo:"tudo", periodoRot:"Início da vigência", situacao:"vivos" },
  vidas:        { nome:"Vidas e cotas", desc:"Quem está coberto em saúde e proteção, e as cotas de consórcio",
                  filtros:["conteudo","pilar","operadora","corretor","situacao"], situacao:"ativas", conteudo:"ambos" },
  comissoes:    { nome:"Comissões", desc:"Cada parcela com a data prevista de recebimento, imposto e situação",
                  filtros:["periodo","pilar","operadora","corretor","situacao","tipoParcela"], periodos:PER_COMISSAO, periodo:"p12", periodoRot:"Data prevista", comissao:true },
  previsao:     { nome:"Previsão de comissões", desc:"Os próximos 12 meses: contratado mais as vendas novas",
                  filtros:["pilar","corretor","modo"], comissao:true },
  cancelamentos:{ nome:"Cancelamentos", desc:"Contratos cancelados, motivo e vidas que saíram",
                  filtros:["periodo","pilar","operadora","corretor"], periodos:PER_PASSADO, periodo:"t12", periodoRot:"Data do cancelamento" },
  producao:     { nome:"Produção por corretor", desc:"Contratos, vidas, base e comissão gerada por pessoa",
                  filtros:["periodo","pilar"], periodos:PER_PASSADO, periodo:"t12", periodoRot:"Início da vigência", comissao:true }
};
const relDisponivel = k => !(REL_TIPOS[k].comissao && ocultaComissao());
function relPadrao(tipo, pre){
  const T = REL_TIPOS[tipo] || REL_TIPOS.carteira;
  return Object.assign({ tipo, periodo:T.periodo||"tudo", de:"", ate:"", pilar:"", operadora:"", corretor:"",
    situacao:T.situacao||"", tipoParcela:"", conteudo:T.conteudo||"ambos", modo:"",
    formato:(S.rel && S.rel.formato) || "xlsx" }, pre||{});
}
function relJanela(r){
  const T = REL_TIPOS[r.tipo];
  if(!T.periodos) return null;
  const P = REL_PERIODOS[r.periodo] || REL_PERIODOS.tudo;
  return { rot:P.rot, de:P.de(), ate:P.ate(), chave:r.periodo };
}
const docVisivel = d => !d ? "" : (S.mePapel==="gestor" ? d : mascararDoc(d));
const NOME_SIT_CLIENTE = { ativo:"Ativo", prospecto:"Prospecto", inativo:"Inativo", encerrado:"Encerrado" };
const CONTEMPLACAO = { "":"Não contemplada", sorteio:"Sorteio", lance:"Lance" };
function opcoesSituacao(tipo){
  if(tipo==="carteira") return [["","Todas"]].concat(Object.entries(NOME_SIT_CLIENTE));
  if(tipo==="contratos") return [["vivos","Sem os cancelados"],["","Todas, inclusive canceladas"]].concat(Object.entries(STATUS_CONTRATO).map(([k,v])=>[k,v.nome]));
  if(tipo==="vidas") return [["ativas","Só ativas"],["","Todas, inclusive as que saíram"]];
  if(tipo==="comissoes") return [["","Todas"],["abertas","A receber (previstas e atrasadas)"],["atrasado","Em atraso"]]
    .concat(Object.entries(STATUS_COM).filter(([k])=>k!=="atrasado").map(([k,v])=>[k,v.nome]));
  return [];
}
function textoFiltrosRel(r){
  const T = REL_TIPOS[r.tipo], j = relJanela(r), p = [];
  if(j) p.push(`${T.periodoRot}: ${j.chave==="tudo" ? "todo o período" : j.chave==="custom" ? `${dt(j.de)} a ${dt(j.ate)}` : `${j.rot.toLowerCase()} (${dt(j.de)} a ${dt(j.ate)})`}`);
  if(r.tipo==="vidas" && r.conteudo!=="ambos") p.push(r.conteudo==="vidas" ? "só vidas" : "só cotas");
  if(r.pilar) p.push(PILARES[r.pilar].nome);
  if(r.operadora) p.push(r.operadora);
  if(r.corretor) p.push(nomeUsuario(r.corretor));
  const sit = opcoesSituacao(r.tipo).find(o=>o[0]===r.situacao);
  if(sit && r.situacao) p.push(sit[1]);
  if(r.tipoParcela) p.push(tipoP(r.tipoParcela).nome);
  if(r.tipo==="previsao") p.push("vendas novas: " + NOME_MODO[r.modo || modoPrevisao()].toLowerCase());
  if(escopoTravado()) p.push("sua carteira");
  else if(S.escopo==="meu") p.push("minha carteira");
  return p.length ? "Filtros: " + p.join(" · ") : "Sem filtros — tudo o que você enxerga no sistema";
}
const dentro = (d, j) => !j || (!!d && d.slice(0,10) >= j.de && d.slice(0,10) <= j.ate);

/** Monta o relatório no modelo neutro. Não desenha nada. */
function montarRelatorio(r){
  const T = REL_TIPOS[r.tipo], j = relJanela(r);
  const comCom = !ocultaComissao(), gestorVe = veCorretora();
  const rotCom = gestorVe ? "Comissão" : "Sua comissão";
  const rel = { tipo:r.tipo, titulo:T.nome, filtrosTexto:textoFiltrosRel(r),
    geradoEm: new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}).replace(", "," às "),
    geradoPor: S.meNome||"", folhas:[], resumo:[] };
  if(!gestorVe && comCom && T.comissao) rel.nota = "Os valores de comissão deste relatório são a sua parte — o que fica com a corretora não aparece aqui.";
  const passaCtr = c => noEscopo(c,"corretor") && (!r.pilar || c.pilar===r.pilar) && (!r.operadora || c.operadora===r.operadora) && (!r.corretor || c.corretor===r.corretor);

  if(r.tipo==="carteira"){
    const cs = S.clientes.filter(c=>noEscopo(c))
      .filter(c=>dentro(c.criadoEm, j))
      .filter(c=>!r.corretor || c.responsavel===r.corretor)
      .filter(c=>!r.situacao || (c.status||"ativo")===r.situacao)
      .filter(c=>!r.pilar || contratosDoCliente(c.id).some(x=>x.pilar===r.pilar && x.status!=="cancelado"))
      .sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"));
    const colunas = [
      {t:"Cliente",f:"texto",max:40},{t:"Tipo",f:"texto",min:5},{t:"CPF / CNPJ",f:"texto"},{t:"Situação",f:"texto"},
      {t:"Nascimento / fundação",f:"data"},{t:"Contato principal",f:"texto",max:30},{t:"Telefone",f:"texto"},{t:"WhatsApp",f:"texto"},
      {t:"E-mail",f:"texto",max:34},{t:"Cidade / UF",f:"texto",max:26},{t:"Produtos",f:"texto",max:30},
      {t:"Contratos ativos",f:"int"},{t:"Vidas ativas",f:"int"},{t:"Base contratada",f:"moeda"}]
      .concat(comCom?[{t:rotCom,f:"moeda"}]:[])
      .concat([{t:"Responsável",f:"texto",max:24},{t:"Cliente desde",f:"data"}]);
    const linhas = cs.map(c=>{
      const vivos = contratosDoCliente(c.id).filter(x=>x.status!=="cancelado" && noEscopo(x,"corretor"));
      const vidas = vidasAtivas(vidasDoCliente(c.id)).length
        + vivos.filter(x=>contratoTemVida(x) && !vidasDetalhadas(x)).reduce((a,x)=>a+(Number(x.vidas)||0),0);
      return [c.nome, c.tipo||"", docVisivel(c.doc), NOME_SIT_CLIENTE[c.status||"ativo"]||c.status, c.nascimento||"",
        c.contatoNome ? c.contatoNome + (c.contatoNascimento?` (${dt(c.contatoNascimento).slice(0,5)})`:"") : "",
        c.telefone||"", c.whatsapp||"", c.email||"", [c.cidade,c.uf].filter(Boolean).join("/"),
        [...new Set(vivos.map(x=>PILARES[x.pilar].curto))].join(", "),
        vivos.length, vidas, vivos.reduce((a,x)=>a+(Number(x.valorBase)||0),0)]
        .concat(comCom?[receitaCliente(c)]:[])
        .concat([nomeUsuario(c.responsavel), c.criadoEm||""]);
    });
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    const total = colunas.map((c,i)=> i===0 ? `Total · ${linhas.length} cliente(s)` : (["int","moeda"].includes(c.f) ? soma(i) : ""));
    rel.folhas.push({ nome:"Clientes", colunas, linhas, total });
    rel.resumo = [{k:"Clientes", v:linhas.length.toLocaleString("pt-BR")},
      {k:"Contratos ativos", v:soma(11).toLocaleString("pt-BR")}, {k:"Vidas ativas", v:soma(12).toLocaleString("pt-BR")},
      {k:"Base contratada", v:brl(soma(13))}].concat(comCom?[{k:rotCom, v:brl(soma(14))}]:[]);
  }

  else if(r.tipo==="contratos"){
    const cs = S.contratos.filter(passaCtr)
      .filter(c=>dentro(c.inicio, j))
      .filter(c=> r.situacao==="vivos" ? c.status!=="cancelado" : (!r.situacao || c.status===r.situacao))
      .sort((a,b)=>(a.clienteNome||"").localeCompare(b.clienteNome||"","pt-BR") || (a.inicio||"").localeCompare(b.inicio||""));
    const colunas = [{t:"Cliente",f:"texto",max:36},{t:"Pilar",f:"texto"},{t:"Produto",f:"texto",max:24},{t:"Operadora",f:"texto",max:22},
      {t:"Nº proposta / apólice",f:"texto"},{t:"Situação",f:"texto"},{t:"Início",f:"data"},{t:"Fim",f:"data"},
      {t:"Mensalidade / prêmio / crédito",f:"moeda"},{t:"Valor do contrato",f:"moeda"},{t:"Vidas",f:"int"},{t:"Grupo / cota",f:"texto"},
      {t:"Corretor",f:"texto",max:22}]
      .concat(comCom?[{t:rotCom+" total",f:"moeda"},{t:"Já recebida",f:"moeda"}]:[]);
    const linhas = cs.map(c=>{
      const rec = (c.comissoes||[]).filter(p=>p.status==="recebido").reduce((a,p)=>a+(Number(p.valorRecebido??p.valor)||0)*(gestorVe?1:fatorCorretor(p,c)),0);
      return [c.clienteNome||"", PILARES[c.pilar]?.curto||"", c.produto||"", c.operadora||"",
        c.apolice||c.numero||"", (STATUS_CONTRATO[c.status]||{}).nome||c.status||"", c.inicio||"", c.fim||"",
        Number(c.valorBase)||0, Number(c.valorTotal)||null, contratoTemVida(c) ? totalVidas(c) : null,
        c.pilar==="consorcios" ? [c.grupo, c.cota].filter(Boolean).join(" / ") : "",
        nomeUsuario(c.corretor)]
        .concat(comCom?[comissaoContrato(c), +rec.toFixed(2)]:[]);
    });
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    const total = colunas.map((c,i)=> i===0 ? `Total · ${linhas.length} contrato(s)` : (["int","moeda"].includes(c.f) ? soma(i) : ""));
    rel.folhas.push({ nome:"Contratos", colunas, linhas, total });
    rel.resumo = [{k:"Contratos", v:linhas.length.toLocaleString("pt-BR")}, {k:"Vidas", v:soma(10).toLocaleString("pt-BR")},
      {k:"Base contratada", v:brl(soma(8))}].concat(comCom?[{k:rotCom, v:brl(soma(13))}]:[]);
  }

  else if(r.tipo==="vidas"){
    if(r.conteudo!=="cotas"){
      const vs = vidasNoEscopo().filter(v=>{
        const c = contratoPorId(v.contratoId); if(!c) return false;
        if(r.pilar && c.pilar!==r.pilar) return false;
        if(r.operadora && c.operadora!==r.operadora) return false;
        if(r.corretor && c.corretor!==r.corretor) return false;
        return r.situacao==="ativas" ? vidaConta(v) : true;
      }).sort((a,b)=>{ const ca=contratoPorId(a.contratoId), cb=contratoPorId(b.contratoId);
        return (ca.clienteNome||"").localeCompare(cb.clienteNome||"","pt-BR") || ((a.tipo||"titular")==="titular"?0:1)-((b.tipo||"titular")==="titular"?0:1) || (a.nome||"").localeCompare(b.nome||"","pt-BR"); });
      const colunas = [{t:"Nome",f:"texto",max:34},{t:"Tipo",f:"texto"},{t:"Parentesco",f:"texto"},{t:"CPF",f:"texto"},
        {t:"Nascimento",f:"data"},{t:"Idade",f:"int",min:6},{t:"Faixa ANS",f:"texto"},{t:"Situação",f:"texto"},
        {t:"Entrada",f:"data"},{t:"Saída",f:"data"},{t:"Cliente",f:"texto",max:32},{t:"Pilar",f:"texto"},
        {t:"Operadora",f:"texto",max:22},{t:"Produto",f:"texto",max:22},{t:"Corretor",f:"texto",max:22},{t:"Carteirinha",f:"texto"}];
      const linhas = vs.map(v=>{ const c = contratoPorId(v.contratoId);
        const idade = v.nascimento ? idadeEm(v.nascimento) : null;
        const fx = idade!=null && c.pilar==="saude" ? FAIXAS_ANS[faixaANS(idade)] : null;
        return [v.nome||"", TIPO_VIDA[v.tipo||"titular"], v.parentesco||"", docVisivel(v.doc), v.nascimento||"", idade,
          fx?fx.rot:"", SV(v.status).nome, v.entrada||"", v.saida||"", c.clienteNome||"", PILARES[c.pilar].curto,
          c.operadora||"", c.produto||"", nomeUsuario(c.corretor), v.carteirinha||""]; });
      rel.folhas.push({ nome:"Vidas", titulo:"Vidas", colunas, linhas, total:null,
        rodape: contratosSemDetalhe().length ? `${contratosSemDetalhe().length} contrato(s) ainda trazem só o número de vidas, sem os nomes — detalhe-os na aba Vidas e cotas.` : "" });
      rel.resumo.push({k:"Vidas ativas", v:vs.filter(vidaConta).length.toLocaleString("pt-BR")},
        {k:"Titulares", v:vs.filter(v=>vidaConta(v) && (v.tipo||"titular")==="titular").length.toLocaleString("pt-BR")});
    }
    if(r.conteudo!=="vidas" && (!r.pilar || r.pilar==="consorcios")){
      const cs = cotasNoEscopo().filter(c=>(!r.operadora || c.operadora===r.operadora) && (!r.corretor || c.corretor===r.corretor))
        .filter(c=> r.situacao==="ativas" ? c.status!=="cancelado" : true)
        .sort((a,b)=>(a.clienteNome||"").localeCompare(b.clienteNome||"","pt-BR"));
      const colunas = [{t:"Cliente",f:"texto",max:34},{t:"Administradora",f:"texto",max:22},{t:"Grupo",f:"texto"},{t:"Cota",f:"texto"},
        {t:"Bem",f:"texto"},{t:"Crédito",f:"moeda"},{t:"Parcela mensal",f:"moeda"},{t:"Prazo (meses)",f:"int"},{t:"Início",f:"data"},
        {t:"Contemplação",f:"texto"},{t:"Contemplada em",f:"data"},{t:"Situação",f:"texto"},{t:"Corretor",f:"texto",max:22}];
      const linhas = cs.map(c=>[c.clienteNome||"", c.operadora||"", c.grupo||"", c.cota||"", c.bem||c.produto||"",
        Number(c.valorBase)||0, Number(c.valorParcela)||null, Number(c.prazoMeses)||null, c.inicio||"",
        CONTEMPLACAO[c.contemplado||""]||c.contemplado, c.contempladoEm||"", (STATUS_CONTRATO[c.status]||{}).nome||"", nomeUsuario(c.corretor)]);
      const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
      rel.folhas.push({ nome:"Cotas de consórcio", titulo:"Cotas de consórcio", colunas, linhas,
        total: colunas.map((c,i)=> i===0 ? `Total · ${linhas.length} cota(s)` : (c.f==="moeda" ? soma(i) : "")) });
      rel.resumo.push({k:"Cotas", v:linhas.length.toLocaleString("pt-BR")}, {k:"Crédito em cotas", v:brl(soma(5))},
        {k:"Contempladas", v:cs.filter(c=>c.contemplado).length.toLocaleString("pt-BR")});
    }
    if(!rel.folhas.length) rel.folhas.push({ nome:"Vidas", colunas:[{t:"—",f:"texto"}], linhas:[], vazio:"O filtro escolhido não tem vidas nem cotas." });
    rel.titulo = r.conteudo==="vidas" ? "Carteira de vidas" : r.conteudo==="cotas" ? "Cotas de consórcio" : "Carteira de vidas e cotas";
  }

  else if(r.tipo==="comissoes"){
    let ps = parcelas().filter(p=>noEscopo(p,"corretor"))
      .filter(p=>(!r.pilar || p.pilar===r.pilar) && (!r.operadora || p.operadora===r.operadora) && (!r.corretor || p.corretor===r.corretor))
      .filter(p=>dentro(p.vence, j))
      .filter(p=>!r.tipoParcela || p.tipo===r.tipoParcela);
    if(r.situacao==="atrasado") ps = ps.filter(p=>p.vencida);
    else if(r.situacao==="abertas") ps = ps.filter(p=>p.status==="previsto");
    else if(r.situacao) ps = ps.filter(p=>p.status===r.situacao && !(r.situacao==="previsto" && p.vencida));
    ps = ps.slice().sort((a,b)=>a.vence.localeCompare(b.vence) || (a.cliente||"").localeCompare(b.cliente||"","pt-BR"));
    const sit = p => p.vencida ? "Em atraso" : (STATUS_COM[p.status]||{}).nome || p.status;
    const valor = p => p.status==="recebido" ? efetivoVis(p) : valorVis(p);
    let colunas, linhas;
    if(gestorVe){
      colunas = [{t:"Data prevista",f:"data"},{t:"Cliente",f:"texto",max:32},{t:"Pilar",f:"texto"},{t:"Consórcio",f:"texto",min:9},
        {t:"Operadora",f:"texto",max:20},{t:"Tipo",f:"texto"},{t:"Parcela",f:"texto",min:7},{t:"Valor bruto",f:"moeda"},
        {t:"Imposto %",f:"pct"},{t:"Imposto",f:"moeda"},{t:"Corretor (repasse)",f:"moeda"},{t:"Corretora líquido",f:"moeda"},
        {t:"Situação",f:"texto"},{t:"Recebida em",f:"data"},{t:"Corretor",f:"texto",max:20}];
      linhas = ps.map(p=>[p.vence, p.cliente||"", PILARES[p.pilar].curto, p.pilar==="consorcios"?"Consórcio":"",
        p.operadora||"", tipoP(p.tipo).nome, `${p.n}/${p.contrato.comissoes.length}`, p.efetivo, p.aliquota||0, p.imposto,
        p.valorCorretor, p.valorCorretora, sit(p), p.recebidoEm||"", nomeUsuario(p.corretor)]);
    } else {
      colunas = [{t:"Data prevista",f:"data"},{t:"Cliente",f:"texto",max:32},{t:"Pilar",f:"texto"},{t:"Consórcio",f:"texto",min:9},
        {t:"Operadora",f:"texto",max:20},{t:"Tipo",f:"texto"},{t:"Parcela",f:"texto",min:7},{t:"Sua comissão",f:"moeda"},
        {t:"Situação",f:"texto"},{t:"Recebida em",f:"data"}];
      linhas = ps.map(p=>[p.vence, p.cliente||"", PILARES[p.pilar].curto, p.pilar==="consorcios"?"Consórcio":"",
        p.operadora||"", tipoP(p.tipo).nome, `${p.n}/${p.contrato.comissoes.length}`, valor(p), sit(p), p.recebidoEm||""]);
    }
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    const total = colunas.map((c,i)=> i===0 ? "Total" : i===1 ? `${linhas.length} parcela(s)` : (c.f==="moeda" ? soma(i) : ""));
    rel.folhas.push({ nome:"Parcelas", titulo:"Parcelas de comissão", colunas, linhas, total });
    // resumo por mês
    const porMes = {};
    ps.forEach(p=>{ const m = porMes[p.mes] = porMes[p.mes] || { n:0, prev:0, rec:0, atr:0, imp:0, cons:0 };
      m.n++; const v = valor(p);
      if(p.status==="recebido") m.rec += v; else if(p.vencida) m.atr += v; else if(p.status==="previsto") m.prev += v;
      if(p.pilar==="consorcios") m.cons += v;
      if(gestorVe) m.imp += p.imposto; });
    const colM = [{t:"Mês",f:"texto"},{t:"Parcelas",f:"int"},{t:"A receber",f:"moeda"},{t:"Em atraso",f:"moeda"},{t:"Recebido",f:"moeda"},{t:"Dos quais consórcio",f:"moeda"}]
      .concat(gestorVe?[{t:"Imposto",f:"moeda"}]:[]);
    const linM = Object.keys(porMes).sort().map(m=>{ const x = porMes[m];
      return [mesLabel(m), x.n, x.prev, x.atr, x.rec, x.cons].concat(gestorVe?[x.imp]:[]); });
    const somaM = i => linM.reduce((a,l)=>a+(Number(l[i])||0),0);
    rel.folhas.push({ nome:"Resumo por mês", titulo:"Resumo por mês", colunas:colM, linhas:linM,
      total: colM.map((c,i)=> i===0 ? "Total" : (["int","moeda"].includes(c.f) ? somaM(i) : "")) });
    rel.resumo = [{k:gestorVe?"Total no filtro":"Sua parte no filtro", v:brl(soma(7)), d:`${linhas.length} parcela(s)`},
      {k:"A receber", v:brl(somaM(2))}, {k:"Em atraso", v:brl(somaM(3))}, {k:"Recebido", v:brl(somaM(4))}]
      .concat(gestorVe && somaM(6)>0 ? [{k:"Impostos", v:brl(somaM(6))}] : []);
    rel.orientacao = "paisagem";
  }

  else if(r.tipo==="previsao"){
    const P = previsaoComissoes({ pilar:r.pilar, corretor:r.corretor });
    const modo = r.modo || modoPrevisao(P);
    const nova = l => modo==="nenhum" ? 0 : (modo==="funil" ? l.funil : l.ritmo);
    const colunas = [{t:"Mês",f:"texto"},{t:"Já recebido",f:"moeda"},{t:"Contratado",f:"moeda"},{t:"Parcelas",f:"int"},
      {t:"Funil ponderado",f:"moeda"},{t:"Ritmo de vendas",f:"moeda"},{t:"Previsão ("+NOME_MODO[modo].toLowerCase()+")",f:"moeda"}]
      .concat(gestorVe?[{t:"Imposto estimado",f:"moeda"},{t:"Líquido estimado",f:"moeda"}]:[]);
    const linhas = P.linhas.map(l=>{ const t = l.real+l.firme+nova(l), imp = l.imposto + nova(l)*P.aliqPadrao/100;
      return [mesLabel(l.mes), l.real, l.firme, l.parcelas, l.funil, l.ritmo, t].concat(gestorVe?[imp, t-imp]:[]); });
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    rel.folhas.push({ nome:"Previsão 12 meses", titulo:"Mês a mês", colunas, linhas,
      total: colunas.map((c,i)=> i===0 ? "12 meses" : (["int","moeda"].includes(c.f) ? soma(i) : "")),
      rodape: modo==="ritmo"
        ? `Ritmo: média de ${brl(P.ritmo.mensal)} de comissão nova por mês nos últimos 6 meses (${P.ritmo.contratosMes.toLocaleString("pt-BR",{maximumFractionDigits:1})} contrato(s)/mês), distribuída pela curva de pagamento da carteira. Funil e ritmo estimam a mesma coisa — as vendas futuras — e não se somam.`
        : modo==="funil" ? `Funil: ${P.leads} lead(s) aberto(s), pela régua prevista e pela chance da etapa. Funil e ritmo estimam a mesma coisa e não se somam.`
        : "Somente parcelas já lançadas nos contratos." });
    rel.folhas.push({ nome:"Por pilar", titulo:"Contratado por pilar", colunas:[{t:"Mês",f:"texto"}].concat(PK.map(k=>({t:PILARES[k].nome,f:"moeda"}))),
      linhas: P.linhas.map(l=>[mesLabel(l.mes)].concat(PK.map(k=>l.porPilar[k]||0))),
      total: ["12 meses"].concat(PK.map(k=>P.linhas.reduce((a,l)=>a+(l.porPilar[k]||0),0))) });
    const t12 = soma(6), firme = soma(1)+soma(2);
    rel.resumo = [{k:"Próximos 12 meses", v:brl(t12)}, {k:"Próximos 3 meses", v:brl(linhas.slice(0,3).reduce((a,l)=>a+l[6],0))},
      {k:"Já contratado", v:pct(t12?firme/t12*100:0)}, {k:"Em atraso (fora)", v:brl(P.atrasado)}]
      .concat(gestorVe && soma(7)>0 ? [{k:"Líquido estimado", v:brl(soma(8))}] : []);
    rel.grafico = { rotulos: P.linhas.map(l=>mesLabel(l.mes)), series: [
      { nome:"Recebido", cor:"#A3A8A4", valores:P.linhas.map(l=>l.real) },
      { nome:"Contratado", cor:"#1B7F4E", valores:P.linhas.map(l=>l.firme) }]
      .concat(modo!=="nenhum"?[{ nome:NOME_MODO[modo]+" (estimativa)", cor:"#B8840C", valores:P.linhas.map(nova) }]:[]) };
  }

  else if(r.tipo==="cancelamentos"){
    const cs = S.contratos.filter(c=>c.status==="cancelado" && passaCtr(c))
      .map(c=>({ c, quando:c.canceladoEm || (c.atualizadoEm||"").slice(0,10) }))
      .filter(x=>dentro(x.quando, j))
      .sort((a,b)=>b.quando.localeCompare(a.quando));
    const vidasDe = c => contratoTemVida(c) ? (vidasDoContrato(c.id).length || Number(c.vidas)||0) : 0;
    const colunas = [{t:"Cancelado em",f:"data"},{t:"Cliente",f:"texto",max:34},{t:"Pilar",f:"texto"},{t:"Produto",f:"texto",max:22},
      {t:"Operadora",f:"texto",max:22},{t:"Motivo",f:"texto",max:34},{t:"Vidas",f:"int"},{t:"Mensalidade / prêmio / crédito",f:"moeda"},
      {t:"Início",f:"data"},{t:"Corretor",f:"texto",max:22}];
    const linhas = cs.map(({c,quando})=>[quando, c.clienteNome||"", PILARES[c.pilar].curto, c.produto||"", c.operadora||"",
      c.motivoCancelamento||"Não informado", vidasDe(c), Number(c.valorBase)||0, c.inicio||"", nomeUsuario(c.corretor)]);
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    rel.folhas.push({ nome:"Cancelamentos", colunas, linhas, total: colunas.map((c,i)=> i===0 ? "Total" : i===1 ? `${linhas.length} contrato(s)` : (["int","moeda"].includes(c.f)?soma(i):"")) });
    const mot = {}; linhas.forEach(l=>{ const m = mot[l[5]] = mot[l[5]] || {n:0,v:0,b:0}; m.n++; m.v+=l[6]; m.b+=l[7]; });
    const linM = Object.entries(mot).sort((a,b)=>b[1].n-a[1].n).map(([k,m])=>[k, m.n, m.v, m.b, linhas.length?m.n/linhas.length*100:0]);
    rel.folhas.push({ nome:"Por motivo", titulo:"Por motivo", colunas:[{t:"Motivo",f:"texto",max:40},{t:"Contratos",f:"int"},{t:"Vidas",f:"int"},{t:"Base perdida",f:"moeda"},{t:"Participação",f:"pct"}],
      linhas:linM, total:["Total", linhas.length, soma(6), soma(7), linhas.length?100:0] });
    rel.resumo = [{k:"Cancelamentos", v:linhas.length.toLocaleString("pt-BR")}, {k:"Vidas que saíram", v:soma(6).toLocaleString("pt-BR")},
      {k:"Base perdida", v:brl(soma(7))}, {k:"Principal motivo", v:linM.length?linM[0][0]:"—"}];
  }

  else if(r.tipo==="producao"){
    const cs = S.contratos.filter(c=>c.status!=="cancelado" && noEscopo(c,"corretor") && (!r.pilar || c.pilar===r.pilar) && dentro(c.inicio, j));
    const pessoas = {};
    cs.forEach(c=>{ const k = c.corretor||""; const x = pessoas[k] = pessoas[k] || { n:0, vidas:0, base:0, com:0, saude:0, seguros:0, consorcios:0 };
      x.n++; x.vidas += totalVidas(c); x.base += Number(c.valorBase)||0; x.com += comissaoContrato(c); x[c.pilar]++; });
    const ps = parcelas().filter(p=>noEscopo(p,"corretor") && (!r.pilar || p.pilar===r.pilar));
    const receb = {}, aRec = {};
    ps.forEach(p=>{ const k = p.corretor||"";
      if(p.status==="recebido" && dentro(p.recebidoEm||p.vence, j)) receb[k] = (receb[k]||0) + efetivoVis(p);
      if(p.status==="previsto") aRec[k] = (aRec[k]||0) + valorVis(p); });
    const chaves = [...new Set(Object.keys(pessoas).concat(Object.keys(receb)))];
    const colunas = [{t:"Corretor",f:"texto",max:28},{t:"Contratos",f:"int"},{t:"Saúde",f:"int"},{t:"Proteção",f:"int"},{t:"Patrimônio",f:"int"},
      {t:"Vidas",f:"int"},{t:"Base contratada",f:"moeda"},{t:rotCom+" gerada",f:"moeda"},{t:"Recebida no período",f:"moeda"},{t:"A receber",f:"moeda"}];
    const linhas = chaves.map(k=>{ const x = pessoas[k] || { n:0, vidas:0, base:0, com:0, saude:0, seguros:0, consorcios:0 };
      return [k ? nomeUsuario(k) : "Sem corretor", x.n, x.saude, x.seguros, x.consorcios, x.vidas, x.base, x.com, receb[k]||0, aRec[k]||0]; })
      .sort((a,b)=>b[7]-a[7]);
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    rel.folhas.push({ nome:"Produção", colunas, linhas, total: colunas.map((c,i)=> i===0 ? "Total" : soma(i)) });
    rel.resumo = [{k:"Contratos", v:soma(1).toLocaleString("pt-BR")}, {k:"Vidas", v:soma(5).toLocaleString("pt-BR")},
      {k:rotCom+" gerada", v:brl(soma(7))}, {k:"Recebida", v:brl(soma(8))}];
  }
  return rel;
}

/** Quantas linhas o relatório terá — para a prévia do diálogo, sem montar tudo duas vezes. */
function contarRelatorio(r){
  try{ const rel = montarRelatorio(r); return rel.folhas.map(f=>({ nome:f.titulo||f.nome, n:f.linhas.length })); }
  catch(e){ return []; }
}

/* ---------- o diálogo ---------- */
function formRelatorio(){
  const r = S.rel;
  const T = REL_TIPOS[r.tipo];
  const tipos = Object.keys(REL_TIPOS).filter(relDisponivel);
  const operadoras = [...new Set(PK.flatMap(p=>S.config.operadoras[p]||[]).concat(S.contratos.map(c=>c.operadora)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const campo = k => {
    if(k==="periodo") return `<div class="field"><label for="rlPer">${esc(T.periodoRot)}</label>
      <select id="rlPer" data-act="relCampo" data-k="periodo">${T.periodos.map(p=>`<option value="${p}" ${r.periodo===p?"selected":""}>${esc(REL_PERIODOS[p].rot)}</option>`).join("")}</select></div>
      ${r.periodo==="custom"?`<div class="field"><label for="rlDe">De</label><input id="rlDe" type="date" value="${esc(r.de||addMonths(hoje(),-12))}" data-act="relCampo" data-k="de"></div>
      <div class="field"><label for="rlAte">Até</label><input id="rlAte" type="date" value="${esc(r.ate||hoje())}" data-act="relCampo" data-k="ate"></div>`:""}`;
    if(k==="pilar"){
      const pil = r.tipo==="vidas" ? PK : PK;
      return `<div class="field"><label for="rlPil">Pilar</label><select id="rlPil" data-act="relCampo" data-k="pilar">
        <option value="">Todos</option>${pil.map(p=>`<option value="${p}" ${r.pilar===p?"selected":""}>${esc(PILARES[p].nome)}</option>`).join("")}</select></div>`; }
    if(k==="operadora") return `<div class="field"><label for="rlOp">Operadora / administradora</label><select id="rlOp" data-act="relCampo" data-k="operadora">
      <option value="">Todas</option>${operadoras.map(o=>`<option ${r.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>`;
    if(k==="corretor") return escopoTravado() ? "" : `<div class="field"><label for="rlCor">Corretor</label><select id="rlCor" data-act="relCampo" data-k="corretor">
      <option value="">Todos</option>${S.usuarios.map(u=>`<option value="${esc(u.id)}" ${r.corretor===u.id?"selected":""}>${esc(u.nome)}</option>`).join("")}</select></div>`;
    if(k==="situacao") return `<div class="field"><label for="rlSit">Situação</label><select id="rlSit" data-act="relCampo" data-k="situacao">
      ${opcoesSituacao(r.tipo).map(([v,n])=>`<option value="${esc(v)}" ${r.situacao===v?"selected":""}>${esc(n)}</option>`).join("")}</select></div>`;
    if(k==="tipoParcela") return `<div class="field"><label for="rlTp">Tipo de parcela</label><select id="rlTp" data-act="relCampo" data-k="tipoParcela">
      <option value="">Todos</option>${Object.entries(TIPO_PARCELA).map(([v,x])=>`<option value="${v}" ${r.tipoParcela===v?"selected":""}>${esc(x.nome)}</option>`).join("")}</select></div>`;
    if(k==="conteudo") return `<div class="field"><label for="rlCont">Incluir</label><select id="rlCont" data-act="relCampo" data-k="conteudo">
      ${[["ambos","Vidas e cotas"],["vidas","Só vidas"],["cotas","Só cotas de consórcio"]].map(([v,n])=>`<option value="${v}" ${r.conteudo===v?"selected":""}>${n}</option>`).join("")}</select></div>`;
    if(k==="modo") return `<div class="field"><label for="rlModo">Vendas novas</label><select id="rlModo" data-act="relCampo" data-k="modo">
      ${["ritmo","funil","nenhum"].map(v=>`<option value="${v}" ${(r.modo||modoPrevisao())===v?"selected":""}>${esc(NOME_MODO[v])}</option>`).join("")}</select></div>`;
    return "";
  };
  return `
  <div class="m-head"><div><h2>Baixar relatório</h2>
    <div class="sub">Escolha o relatório, filtre o que precisa e baixe em Excel ou PDF — com o logotipo da Erbe</div></div></div>
  <div class="m-body">
    <div class="rel-tipos" role="radiogroup" aria-label="Relatório">
      ${tipos.map(k=>`<button type="button" class="rel-tipo" role="radio" aria-checked="${r.tipo===k}" data-act="relTipo" data-v="${k}">
        <b>${esc(REL_TIPOS[k].nome)}</b><span>${esc(REL_TIPOS[k].desc)}</span></button>`).join("")}
    </div>
    <div class="frow rel-filtros">${T.filtros.map(campo).join("")}</div>
    <div class="rel-previa" id="relPrevia">${previaRelatorio()}</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px">
      <span class="hint" style="font-weight:600">Formato</span>
      <div class="seg" role="group" aria-label="Formato do arquivo">
        <button type="button" data-act="relFormato" data-v="xlsx" aria-pressed="${r.formato!=="pdf"}">Excel (.xlsx)</button>
        <button type="button" data-act="relFormato" data-v="pdf" aria-pressed="${r.formato==="pdf"}">PDF</button>
      </div>
      <span class="hint">${r.formato==="pdf"?"Pronto para imprimir ou mandar por e-mail":"Com filtros, totais e cabeçalho fixo — abre no Excel e no Google Planilhas"}</span>
    </div>
  </div>
  <div class="m-foot">
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="gerarRel" id="btnGerarRel">Baixar ${r.formato==="pdf"?"PDF":"Excel"}</button>
  </div>`;
}
function previaRelatorio(){
  const partes = contarRelatorio(S.rel);
  const total = partes.reduce((a,p)=>a+p.n,0);
  return `<b>${total.toLocaleString("pt-BR")} linha${total!==1?"s":""}</b>
    ${partes.length>1?` · ${partes.map(p=>`${esc(p.nome)}: ${p.n.toLocaleString("pt-BR")}`).join(" · ")}`:""}
    <div class="hint">${esc(textoFiltrosRel(S.rel))}</div>`;
}
function abrirRelatorio(tipo, pre){
  if(!tipo || !REL_TIPOS[tipo] || !relDisponivel(tipo)) tipo = (S.rel && relDisponivel(S.rel.tipo)) ? S.rel.tipo : "carteira";
  S.rel = relPadrao(tipo, pre);
  abrirModal(formRelatorio(), true);
}
const nomeArquivoRel = rel => `erbe-${rel.titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${hoje()}`;
async function gerarRelatorio(){
  const btn = document.getElementById("btnGerarRel");
  const rotulo = btn ? btn.textContent : "";
  if(btn){ btn.disabled = true; btn.textContent = S.rel.formato==="pdf" ? "Montando o PDF…" : "Montando a planilha…"; }
  try{
    const rel = montarRelatorio(S.rel);
    const nome = nomeArquivoRel(rel);
    const linhas = rel.folhas.reduce((a,f)=>a+f.linhas.length,0);
    if(S.rel.formato==="pdf" && linhas > 3000 && !await confirmar("PDF muito grande",
        `São ${linhas.toLocaleString("pt-BR")} linhas — perto de ${Math.ceil(linhas/28).toLocaleString("pt-BR")} páginas. Para esse volume o Excel é mais prático; se quiser o PDF, aplique mais filtros ou gere assim mesmo (pode levar alguns segundos).`,
        "Gerar o PDF assim mesmo")) return;
    if(S.rel.formato==="pdf"){
      const blob = await gerarPdf(rel);
      await entregarArquivo(nome+".pdf", blob, "application/pdf");
    } else {
      const blob = await gerarXlsx(rel);
      await entregarArquivo(nome+".xlsx", blob, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
  }catch(e){
    console.error(e);
    toast(S.rel.formato==="pdf" ? "Não consegui gerar o PDF — confira a internet e tente de novo, ou baixe em Excel." : "Não consegui gerar a planilha.");
  }finally{
    if(btn && document.body.contains(btn)){ btn.disabled = false; btn.textContent = rotulo; }
  }
}
function viewRelatorios(){
  const j = janela();
  const ctr = contratosFiltrados();
  const lds = leadsFiltrados();
  const parcelasCtr = ctr.flatMap(c=>(c.comissoes||[]).map(p=>({...p, contrato:c})));

  const agrupa = (chave, rotulo) => {
    const m = {};
    ctr.forEach(c=>{
      const k = typeof chave==="function"?chave(c):c[chave];
      if(!k) return;
      m[k] = m[k] || { base:0, com:0, n:0, vidas:0 };
      m[k].base += Number(c.valorBase)||0;
      m[k].com  += comissaoContrato(c);
      m[k].vidas += totalVidas(c);
      m[k].n++;
    });
    const linhas = Object.entries(m).sort((a,b)=>b[1].com-a[1].com);
    const max = Math.max(...linhas.map(l=>l[1].com),1);
    const tot = linhas.reduce((a,l)=>a+l[1].com,0);
    return `<section class="panel" style="margin-bottom:14px">
      <div class="panel-head"><div><h3>${esc(rotulo)}</h3><div class="sub">Ordenado por comissão gerada</div></div>
        <div class="right"><b class="num">${brl(tot)}</b></div></div>
      <div class="tw"><table>
        <thead><tr><th>${esc(rotulo)}</th><th class="r">Contratos</th><th class="r">Vidas</th><th class="r">Base</th><th class="r">${veCorretora()?"Comissão":"Sua comissão"}</th><th class="r">Part.</th><th style="width:120px">Peso</th></tr></thead>
        <tbody>${linhas.map(([k,v])=>`<tr>
          <td><b>${esc(k)}</b></td><td class="r num">${v.n}</td><td class="r num">${v.vidas||"—"}</td>
          <td class="r num">${brl(v.base)}</td><td class="r num"><b>${brl(v.com)}</b></td>
          <td class="r num">${pct(tot?v.com/tot*100:0)}</td>
          <td><span class="track" style="display:block;height:8px;background:var(--surface-3);border-radius:99px;overflow:hidden"><span style="display:block;height:100%;width:${larg(v.com,max)}%;background:var(--accent);border-radius:99px"></span></span></td>
        </tr>`).join("") || `<tr><td colspan="7" class="empty">Nada no período e filtros escolhidos.</td></tr>`}</tbody>
      </table></div></section>`;
  };

  const ganhos = lds.filter(l=>l.etapa==="ganho"), perdidos = lds.filter(l=>l.etapa==="perdido");
  const porOrigem = {};
  lds.forEach(l=>{ const o=l.origem||"Sem origem"; porOrigem[o]=porOrigem[o]||{t:0,g:0,v:0};
    porOrigem[o].t++; if(l.etapa==="ganho"){porOrigem[o].g++; porOrigem[o].v+=Number(l.valorEstimado)||0;} });
  const motivos = {};
  perdidos.forEach(l=>{ const m=l.motivoPerda||"Não informado"; motivos[m]=(motivos[m]||0)+1; });
  const comissaoTotal = ctr.reduce((a,c)=>a+comissaoContrato(c),0);
  const baseTotal = ctr.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const vencidas = parcelasCtr.filter(p=>p.vence<=hoje());
  const recebidas = vencidas.filter(p=>p.status==="recebido");

  // série mensal dentro da janela
  const meses = [];
  { let m = j.de.slice(0,7), fimM = (j.ate<hoje()?j.ate:hoje()).slice(0,7);
    if(j.chave==="tudo" && ctr.length) m = ctr.map(c=>c.inicio).sort()[0].slice(0,7);
    let guarda = 0;
    while(m <= fimM && guarda++ < 36){ meses.push(m); m = addMonths(m+"-01",1).slice(0,7); } }
  const serie = meses.map(m=>{
    const o = {mes:m}; PK.forEach(x=>o[x]=0);
    ctr.filter(c=>(c.inicio||"").slice(0,7)===m).forEach(c=>{ o[c.pilar]=(o[c.pilar]||0)+comissaoContrato(c); });
    return o;
  });

  return `
  ${filtrosRelatorio()}
  ${avisoSuaParte()}
  <div class="hint" style="margin:-4px 0 14px">Mostrando <b>${ctr.length}</b> contrato(s) iniciado(s) entre ${dt(j.de)} e ${dt(j.ate)}${S.filtros.tipoPlano?` · tipo ${esc(S.filtros.tipoPlano)}`:""}${S.filtros.pilar?` · ${esc(PILARES[S.filtros.pilar].curto)}`:""}.</div>

  <div class="stat-row">
    <div class="stat hero"><div class="k">${veCorretora()?"Comissão gerada":"Sua comissão"}</div><div class="v">${brl(comissaoTotal)}</div>
      <div class="d">${ctr.length} contratos · ${esc(j.rot.toLowerCase())}</div></div>
    <div class="stat"><div class="k">Valor dos contratos</div>
      <div class="v">${brl(ctr.reduce((a,c)=>a+(Number(c.valorTotal)||0),0))}</div>
      <div class="d">Base contratada de ${brl(baseTotal)}</div></div>
    <div class="stat"><div class="k">Comissão por contrato</div><div class="v">${brl(ctr.length?comissaoTotal/ctr.length:0)}</div>
      <div class="d">Base média de ${brl(ctr.length?baseTotal/ctr.length:0)}, que mistura mensalidade, prêmio e crédito</div></div>
    <div class="stat"><div class="k">Taxa de conversão</div><div class="v">${pct(ganhos.length+perdidos.length?ganhos.length/(ganhos.length+perdidos.length)*100:0)}</div>
      <div class="d">${ganhos.length} de ${ganhos.length+perdidos.length} decididos</div></div>
    <div class="stat"><div class="k">Vidas</div><div class="v">${ctr.reduce((a,c)=>a+totalVidas(c),0).toLocaleString("pt-BR")}</div>
      <div class="d">Nos contratos do período</div></div>
    <div class="stat"><div class="k">Índice de recebimento</div><div class="v">${pct(vencidas.length?recebidas.length/vencidas.length*100:0)}</div>
      <div class="d">${recebidas.length} de ${vencidas.length} parcelas vencidas</div></div>
  </div>

  ${serie.length?`<section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><div><h3>Comissão gerada mês a mês</h3>
      <div class="sub">${esc(j.rot)} · por pilar</div></div></div>
    ${chartBarrasEmpilhadas(serie)}
    <div class="legend">${PK.map(x=>`<span><i class="dot" style="background:${PILARES[x].cor}"></i>${PILARES[x].curto}</span>`).join("")}</div>
    ${tabelaOculta(["Mês",...PK.map(x=>PILARES[x].curto)], serie.map(r=>[mesLabel(r.mes),...PK.map(x=>brl(r[x]))]))}
  </section>`:""}

  ${agrupa(c=>tipoPlano(c),"Tipo de plano")}
  ${agrupa("operadora","Operadora")}
  ${agrupa(c=>PILARES[c.pilar]?.nome,"Pilar")}
  ${agrupa("produto","Produto")}
  ${agrupa(c=>nomeUsuario(c.corretor),"Corretor")}

  <section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><div><h3>Origem dos leads</h3><div class="sub">Leads criados no período · volume e conversão</div></div></div>
    <div class="tw"><table>
      <thead><tr><th>Origem</th><th class="r">Leads</th><th class="r">Ganhos</th><th class="r">Conversão</th><th class="r">Valor ganho</th></tr></thead>
      <tbody>${Object.entries(porOrigem).sort((a,b)=>b[1].t-a[1].t).map(([k,v])=>`<tr>
        <td><b>${esc(k)}</b></td><td class="r num">${v.t}</td><td class="r num">${v.g}</td>
        <td class="r num">${pct(v.t?v.g/v.t*100:0)}</td><td class="r num">${brl(v.v)}</td></tr>`).join("")
        || `<tr><td colspan="5" class="empty">Nenhum lead criado no período.</td></tr>`}</tbody>
    </table></div></section>

  <section class="panel">
    <div class="panel-head"><div><h3>Motivos de perda</h3><div class="sub">Onde a corretora está deixando negócio na mesa</div></div></div>
    <div class="chart-wrap">${Object.entries(motivos).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
      const max=Math.max(...Object.values(motivos),1);
      return `<div class="bar-line"><span class="nm">${esc(k)}</span>
        <span class="track"><span class="fill" style="width:${larg(v,max)}%;background:var(--crit)"></span></span>
        <span class="n">${v}</span></div>`;
    }).join("") || `<div class="empty">Nenhuma perda registrada no período.</div>`}</div>
  </section>

  ${painelCancelamentos(j)}`;
}

/** Cancelamentos do período, pelo motivo — a pergunta "por que estamos perdendo cliente". */
function painelCancelamentos(j){
  const cs = S.contratos.filter(c=>c.status==="cancelado" && noEscopo(c,"corretor"))
    .map(c=>({ c, quando: c.canceladoEm || (c.atualizadoEm||"").slice(0,10) }))
    .filter(x=>x.quando >= j.de && x.quando <= j.ate);
  const motivos = {};
  cs.forEach(x=>{ const m = x.c.motivoCancelamento || "Não informado"; motivos[m]=(motivos[m]||0)+1; });
  const ord = Object.entries(motivos).sort((a,b)=>b[1]-a[1]);
  const max = Math.max(...ord.map(o=>o[1]), 1);
  const vidasPerdidas = cs.reduce((a,x)=>a+(contratoTemVida(x.c) ? (vidasDoContrato(x.c.id).length || Number(x.c.vidas)||0) : 0), 0);
  const semMotivo = motivos["Não informado"]||0;
  return `<section class="panel" style="margin-top:14px">
    <div class="panel-head"><div><h3>Cancelamentos</h3>
      <div class="sub">${cs.length} contrato(s) no período · ${vidasPerdidas} vida(s) que saíram da carteira</div></div></div>
    <div class="chart-wrap">${ord.length ? ord.map(([k,v])=>`<div class="bar-line"><span class="nm">${esc(k)}</span>
        <span class="track"><span class="fill" style="width:${larg(v,max)}%;background:${k==="Não informado"?"var(--line-strong)":"var(--crit)"}"></span></span>
        <span class="n">${v}</span></div>`).join("")
      : `<div class="empty">Nenhum cancelamento no período.</div>`}
      ${semMotivo?`<div class="hint" style="margin-top:8px">${semMotivo} cancelamento(s) sem motivo: registre ao marcar o contrato como cancelado — é o que mostra onde agir.</div>`:""}
    </div>
  </section>`;
}

