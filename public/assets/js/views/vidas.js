/* Erbe · Central — views/vidas.js
   Vidas, cotas de consórcio e aniversários.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   TELA DE VIDAS
   ============================================================ */
/** As vidas de um contrato, dentro da ficha dele. */
function painelVidasContrato(c){
  const vs = vidasDoContrato(c.id).slice().sort((a,b)=>
    ((a.tipo||"titular")==="titular"?0:1)-((b.tipo||"titular")==="titular"?0:1) || (a.nome||"").localeCompare(b.nome||"","pt-BR"));
  const ativas = vidasAtivas(vs).length;
  const declarado = Number(c.vidas)||0;
  const divergente = vs.length && declarado && ativas !== declarado;
  return `<div class="panel" style="box-shadow:none;margin-bottom:12px">
    <div class="panel-head"><span class="chip ${vs.length?"ok":"warn"}">${vs.length?ativas+" ativa(s)":"a detalhar"}</span>
      <div><h3>Vidas</h3>
        <div class="sub">${vs.length
          ? `${vs.length} registro(s) neste contrato`
          : `O contrato declara ${declarado} vida(s), ainda sem nome`}</div></div>
      <div class="right">
        ${vs.length?`<button class="btn sm" data-act="novaVida" data-contrato="${esc(c.id)}">+ Vida</button>`
                   :`<button class="btn sm primary" data-act="detalharVidas" data-id="${esc(c.id)}">Detalhar</button>`}</div></div>
    ${divergente?`<div class="hint" style="padding:9px 16px 0;color:var(--warn)">O contrato diz ${declarado} vida(s) e há ${ativas} ativa(s) cadastrada(s). Os painéis usam o que está cadastrado.</div>`:""}
    ${vs.length?`<div class="tw"><table>
      <thead><tr><th>Nome</th><th>Tipo</th><th class="num">Entrada</th><th class="num">Saída</th><th>Situação</th><th></th></tr></thead>
      <tbody>${vs.map(v=>`<tr>
        <td><b>${esc(v.nome)}</b>${v.doc?`<div class="hint num">${esc(mascararDoc(v.doc))}</div>`:""}</td>
        <td><span class="chip ${(v.tipo||"titular")==="titular"?"info":"mute"}">${esc(TIPO_VIDA[v.tipo||"titular"])}</span>${v.parentesco?` <span class="hint">${esc(v.parentesco)}</span>`:""}</td>
        <td class="num">${v.entrada?dt(v.entrada):"—"}</td>
        <td class="num">${v.saida?dt(v.saida):"—"}</td>
        <td><span class="chip ${SV(v.status).cls}">${esc(SV(v.status).nome)}</span></td>
        <td class="r" style="white-space:nowrap">
          <button class="btn sm ghost" data-act="editarVida" data-id="${esc(v.id)}" aria-label="Editar vida">✎</button>
          ${SV(v.status).conta?`<button class="btn sm ghost danger" data-act="excluirVidaDoPlano" data-id="${esc(v.id)}" title="Excluir do plano">−</button>`:""}
        </td></tr>`).join("")}</tbody></table></div>`:""}
  </div>`;
}

/* ============================================================
   COTAS DE CONSÓRCIO
   Consórcio não tem vida: tem cota. A aba passa a mostrar as duas
   carteiras — quem está coberto e o que está sendo construído.
   ============================================================ */
const cotasNoEscopo = () => S.contratos.filter(c=>c.pilar==="consorcios" && noEscopo(c,"corretor"));
function viewVidas(){
  const aba = S.abaVidas==="cotas" ? "cotas" : "vidas";
  const vAtivas = vidasAtivas(vidasNoEscopo()).length;
  const cAtivas = cotasNoEscopo().filter(c=>c.status!=="cancelado");
  const credito = cAtivas.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const topo = `<div class="filters" style="align-items:flex-end">
    <div class="field" style="flex:none"><label>Carteira</label>
      <div class="seg" role="group" aria-label="Vidas ou cotas">
        <button data-act="abaVidas" data-v="vidas" aria-pressed="${aba==="vidas"}">Vidas · ${vAtivas.toLocaleString("pt-BR")}</button>
        <button data-act="abaVidas" data-v="cotas" aria-pressed="${aba==="cotas"}">Cotas de consórcio · ${cAtivas.length.toLocaleString("pt-BR")}</button>
      </div></div>
    <div class="hint" style="padding-bottom:8px">${aba==="vidas"
      ? `${cAtivas.length.toLocaleString("pt-BR")} cota(s) ativa(s) somando ${brl(credito)} em crédito`
      : `${vAtivas.toLocaleString("pt-BR")} vida(s) ativa(s) em saúde e proteção`}</div>
    <button class="btn" style="margin-left:auto" data-act="baixarRel" data-tipo="vidas" data-conteudo="${aba==="cotas"?"cotas":"ambos"}">Baixar carteira (Excel ou PDF)</button>
  </div>`;
  return topo + (aba==="cotas" ? viewCotas() : viewVidasPessoas());
}
function viewCotas(){
  const f = S.filtros;
  const todas = cotasNoEscopo();
  if(!todas.length) return vazio("Nenhuma cota de consórcio",
    "As cotas aparecem aqui quando um contrato do pilar Patrimônio é registrado, com grupo, cota, bem e crédito.",
    "novoContrato","Registrar contrato");
  let lista = todas;
  const sit = f.sitCota || "ativas";
  if(sit==="ativas") lista = lista.filter(c=>c.status!=="cancelado");
  else if(sit==="canceladas") lista = lista.filter(c=>c.status==="cancelado");
  if(f.contemplacao) lista = lista.filter(c=> f.contemplacao==="nao" ? !c.contemplado : f.contemplacao==="sim" ? !!c.contemplado : c.contemplado===f.contemplacao);
  if(f.operadora) lista = lista.filter(c=>c.operadora===f.operadora);
  if(f.bem) lista = lista.filter(c=>(c.bem||c.produto)===f.bem);
  if(f.corretor) lista = lista.filter(c=>c.corretor===f.corretor);
  if(S.busca){
    const q = S.busca.toLowerCase();
    lista = lista.filter(c=>[(c.clienteNome||""), c.grupo||"", c.cota||"", c.operadora||""].join(" ").toLowerCase().includes(q));
  }
  const ativas = todas.filter(c=>c.status!=="cancelado");
  const credito = ativas.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const contempladas = ativas.filter(c=>c.contemplado);
  const credContemplado = contempladas.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const parcelaMes = ativas.reduce((a,c)=>a+(Number(c.valorParcela)||0),0);
  const semParcela = ativas.filter(c=>!Number(c.valorParcela)).length;
  const porAdm = {};
  ativas.forEach(c=>{ const k = c.operadora||"Sem administradora"; const x = porAdm[k] = porAdm[k]||{n:0,v:0}; x.n++; x.v += Number(c.valorBase)||0; });
  const adms = Object.entries(porAdm).sort((a,b)=>b[1].v-a[1].v);
  const maxAdm = Math.max(...adms.map(a=>a[1].v), 1);
  const porBem = {};
  ativas.forEach(c=>{ const k = c.bem||c.produto||"Não informado"; const x = porBem[k] = porBem[k]||{n:0,v:0}; x.n++; x.v += Number(c.valorBase)||0; });
  const bens = Object.entries(porBem).sort((a,b)=>b[1].v-a[1].v);
  const pag = S.pagVidas || 1, porPagina = 100;
  const ordenada = lista.slice().sort((a,b)=>(a.clienteNome||"").localeCompare(b.clienteNome||"","pt-BR"));
  const fatia = ordenada.slice(0, pag*porPagina);
  const operadoras = [...new Set(todas.map(c=>c.operadora).filter(Boolean))].sort();
  const bensOp = [...new Set(todas.map(c=>c.bem||c.produto).filter(Boolean))].sort();
  return `
  <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(168px,1fr))">
    <div class="stat hero"><div class="k">Cotas ativas</div><div class="v">${ativas.length.toLocaleString("pt-BR")}</div>
      <div class="d">${[...new Set(ativas.map(c=>c.clienteId))].length} cliente(s) · ${adms.length} administradora(s)</div></div>
    <div class="stat"><div class="k">Crédito na carteira</div><div class="v">${brl(credito)}</div>
      <div class="d">média de ${brl(ativas.length?credito/ativas.length:0)} por cota</div></div>
    <div class="stat clickable" data-act="irFiltro" data-view="vidas" data-f='{"contemplacao":"sim"}' data-aba="cotas"><div class="k">Contempladas</div><div class="v">${contempladas.length.toLocaleString("pt-BR")}</div>
      <div class="d">${pct(ativas.length?contempladas.length/ativas.length*100:0)} das cotas · ${brl(credContemplado)}</div></div>
    <div class="stat"><div class="k">A contemplar</div><div class="v">${brl(credito-credContemplado)}</div>
      <div class="d">${(ativas.length-contempladas.length).toLocaleString("pt-BR")} cota(s) aguardando</div></div>
    <div class="stat"><div class="k">Parcelas por mês</div><div class="v">${brl(parcelaMes)}</div>
      <div class="d">${semParcela?`${semParcela} cota(s) sem parcela informada`:"soma das parcelas das cotas"}</div></div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-bottom:14px">
    <section class="panel">
      <div class="panel-head"><div><h3>Crédito por administradora</h3><div class="sub">Só as cotas ativas</div></div></div>
      <div class="chart-wrap">${adms.slice(0,8).map(([nome,x])=>`
        <div class="bar-line"><span class="nm">${esc(nome)}</span>
          <span class="track"><span class="fill" style="width:${larg(x.v,maxAdm)}%;background:var(--c-consorcios)"></span></span>
          <span class="n" style="width:120px">${brl(x.v)} · ${x.n}</span></div>`).join("") || `<div class="hint">Nenhuma cota ativa.</div>`}</div>
      ${tabelaOculta(["Administradora","Cotas","Crédito"], adms.map(([k,x])=>[k, String(x.n), brl(x.v)]))}
    </section>
    <section class="panel">
      <div class="panel-head"><div><h3>Por bem</h3><div class="sub">O que os clientes estão construindo</div></div></div>
      <div class="chart-wrap"><div class="dl">${bens.map(([k,x])=>`
        <div class="clickable" data-act="irFiltro" data-view="vidas" data-f='${esc(JSON.stringify({bem:k}))}' data-aba="cotas">
          <div class="k">${esc(k)}</div><div class="v num" style="font-size:17px;font-weight:700">${brl(x.v)}</div>
          <div class="hint">${x.n} cota(s)</div></div>`).join("") || `<div class="hint">—</div>`}</div></div>
    </section>
  </div>
  <div class="filters">
    <div class="field" style="flex:1;min-width:190px"><label for="ctBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="ctBusca" type="text" placeholder="Cliente, grupo ou cota" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field"><label for="ctSit">Situação</label><select id="ctSit" data-act="filtro" data-k="sitCota">
      ${[["ativas","Ativas"],["canceladas","Canceladas"],["todas","Todas"]].map(([v,n])=>`<option value="${v}" ${sit===v?"selected":""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label for="ctCont">Contemplação</label><select id="ctCont" data-act="filtro" data-k="contemplacao">
      <option value="">Todas</option>${[["nao","Não contempladas"],["sim","Contempladas"],["sorteio","Por sorteio"],["lance","Por lance"]].map(([v,n])=>`<option value="${v}" ${f.contemplacao===v?"selected":""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label for="ctAdm">Administradora</label><select id="ctAdm" data-act="filtro" data-k="operadora">
      <option value="">Todas</option>${operadoras.map(o=>`<option ${f.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    <div class="field"><label for="ctBem">Bem</label><select id="ctBem" data-act="filtro" data-k="bem">
      <option value="">Todos</option>${bensOp.map(o=>`<option ${f.bem===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    ${Object.keys(f).length||S.busca?`<button class="btn ghost" data-act="limparFiltros">Limpar</button>`:""}
  </div>
  <section class="panel">
    <div class="panel-head"><div><h3>${lista.length.toLocaleString("pt-BR")} cota${lista.length!==1?"s":""}</h3>
      <div class="sub">${brl(lista.reduce((a,c)=>a+(Number(c.valorBase)||0),0))} em crédito no filtro${fatia.length<lista.length?` · mostrando ${fatia.length}`:""}</div></div></div>
    ${fatia.length?`<div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Administradora</th><th>Grupo / cota</th><th>Bem</th><th class="r">Crédito</th><th class="r">Parcela</th><th class="r">Prazo</th><th>Contemplação</th><th>Situação</th></tr></thead>
      <tbody>${fatia.map(c=>{ const st = STATUS_CONTRATO[c.status]||STATUS_CONTRATO.proposta;
        return `<tr class="clickable" data-act="abrirContrato" data-id="${esc(c.id)}">
          <td><b>${esc(c.clienteNome||"—")}</b><div class="hint">${esc(nomeUsuario(c.corretor))}</div></td>
          <td>${esc(c.operadora||"—")}</td>
          <td class="num">${c.grupo||c.cota?`${esc(c.grupo||"—")} / ${esc(c.cota||"—")}`:`<span class="hint">não informado</span>`}</td>
          <td>${esc(c.bem||c.produto||"—")}</td>
          <td class="r num"><b>${brl(c.valorBase)}</b></td>
          <td class="r num">${Number(c.valorParcela)?brl(c.valorParcela):"—"}</td>
          <td class="r num">${Number(c.prazoMeses)?c.prazoMeses+"m":"—"}</td>
          <td>${c.contemplado?`<span class="chip ok">${esc(CONTEMPLACAO[c.contemplado]||c.contemplado)}</span>${c.contempladoEm?`<div class="hint num">${dt(c.contempladoEm)}</div>`:""}`:`<span class="chip mute">aguardando</span>`}</td>
          <td><span class="chip ${st.cls}">${esc(st.nome)}</span></td></tr>`; }).join("")}</tbody></table></div>
      ${fatia.length<lista.length?`<div class="ta"><button class="btn" data-act="maisVidas">Mostrar mais ${Math.min(porPagina, lista.length-fatia.length)}</button></div>`:""}`
    : `<div class="empty" style="padding:26px"><b>Nenhuma cota com esses filtros</b>Ajuste a busca ou limpe os filtros.</div>`}
  </section>`;
}

/* ============================================================
   ANIVERSÁRIOS
   Cliente pessoa física: a data de nascimento. Empresa: a data de
   fundação e, se houver, o aniversário do contato principal — é com
   ele que a corretora fala.
   ============================================================ */
const diasAvisoAniv = () => Math.min(60, Math.max(0, Number((S.config && S.config.diasAvisoAniversario) ?? 7)));
function aniversariantes(dias, lista){
  const out = [];
  for(const c of (lista || S.clientes.filter(c=>noEscopo(c)))){
    if(["encerrado","inativo"].includes(c.status)) continue;
    const add = (data, quem, nome) => {
      if(!data) return;
      const prox = proximoAniversario(data), d = diasEntre(hoje(), prox);
      if(d>=0 && d<=dias) out.push({ c, prox, dias:d, anos:idadeEm(data, prox), quem, nome });
    };
    add(c.nascimento, c.tipo==="PF" ? "cliente" : "empresa", c.nome);
    if(c.tipo!=="PF" && c.contatoNascimento) add(c.contatoNascimento, "contato", c.contatoNome || "Contato principal");
  }
  return out.sort((a,b)=>a.dias-b.dias || (a.nome||"").localeCompare(b.nome||"","pt-BR"));
}
const jaParabenizado = x => (x.quem==="contato" ? x.c.contatoParabenizadoEm : x.c.parabenizadoEm) === x.prox;
const descAniv = x => x.quem==="empresa" ? `${x.anos} ano${x.anos!==1?"s":""} de empresa`
  : x.quem==="contato" ? `contato de ${x.c.nome} · faz ${x.anos} anos` : `faz ${x.anos} anos`;
const quandoAniv = x => x.dias===0 ? "hoje" : x.dias===1 ? "amanhã" : `em ${x.dias} dias (${dt(x.prox).slice(0,5)})`;
function linkParabens(x){
  const fone = soDigitos(x.quem==="contato" ? (x.c.contatoWhatsapp || x.c.whatsapp || x.c.telefone) : (x.c.whatsapp || x.c.telefone)).replace(/^55(?=\d{10,11}$)/,"");
  if(fone.length < 10) return "";
  const primeiro = String(x.quem==="empresa" ? x.c.nome : x.nome).trim().split(/\s+/)[0];
  const msg = x.quem==="empresa"
    ? `Olá! A equipe da Erbe Proteção e Patrimônio parabeniza a ${x.c.nome} pelos ${x.anos} anos. Obrigado pela confiança de sempre — seguimos juntos protegendo o que vocês constroem.`
    : x.dias===0
      ? `Feliz aniversário, ${primeiro}! A equipe da Erbe Proteção e Patrimônio deseja um novo ano cheio de saúde, tranquilidade e conquistas. Um abraço!`
      : `Olá, ${primeiro}! Passando para adiantar os parabéns pelo seu aniversário no dia ${dt(x.prox).slice(0,5)}. A equipe da Erbe deseja um novo ano cheio de saúde e conquistas!`;
  return `https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`;
}
/** Botões de ação de um aniversário: parabenizar pelo WhatsApp (ou marcar) e agendar. */
function botoesAniv(x){
  const link = linkParabens(x);
  const dados = `data-id="${esc(x.c.id)}" data-quem="${esc(x.quem)}" data-prox="${esc(x.prox)}"`;
  return (link
      ? `<a class="btn sm primary" href="${esc(link)}" target="_blank" rel="noopener" data-act="parabenizou" ${dados}>Parabenizar no WhatsApp</a>`
      : `<button class="btn sm" data-act="parabenizou" ${dados} title="Sem WhatsApp no cadastro">Já parabenizei</button>`)
    + ` <button class="btn sm ghost" data-act="agendarAniv" ${dados}>Agendar</button>`;
}
/** Aniversários que o pop-up lembra: os da minha carteira, dentro da antecedência, ainda não parabenizados. */
function aniversariosParaLembrar(){
  return aniversariantes(diasAvisoAniv(), S.clientes.filter(c=>noEscopo(c) && (c.responsavel===S.uid || !c.responsavel)))
    .filter(x=>!jaParabenizado(x));
}
async function marcarParabenizado(id, quem, prox){
  const c = S.clientes.find(x=>x.id===id); if(!c) return;
  const novo = Object.assign({}, c, quem==="contato" ? { contatoParabenizadoEm:prox } : { parabenizadoEm:prox, ultimoPosVenda:hoje() });
  await salvar("clientes", novo, quem==="contato" ? "Parabenizou o contato de" : "Parabenizou");
}

function viewVidasPessoas(){
  const f = S.filtros;
  const todas = vidasNoEscopo();
  const pendentes = contratosSemDetalhe();

  if(!todas.length && !pendentes.length && !S.contratos.length)
    return vazio("Nenhuma vida cadastrada",
      "Vidas aparecem aqui assim que houver um contrato de saúde ou de proteção na carteira.",
      "novoContrato","Registrar contrato");

  // --- filtros ---
  let lista = todas;
  if(f.statusVida) lista = lista.filter(v=>v.status===f.statusVida);
  if(f.tipoVida)   lista = lista.filter(v=>(v.tipo||"titular")===f.tipoVida);
  if(f.pilar)      lista = lista.filter(v=>{const c=contratoPorId(v.contratoId); return c && c.pilar===f.pilar;});
  if(f.operadora)  lista = lista.filter(v=>{const c=contratoPorId(v.contratoId); return c && c.operadora===f.operadora;});
  if(f.corretor)   lista = lista.filter(v=>{const c=contratoPorId(v.contratoId); return c && c.corretor===f.corretor;});
  if(S.busca){
    const q = S.busca.toLowerCase();
    lista = lista.filter(v=>{
      const c = contratoPorId(v.contratoId);
      const dq = soDigitos(q);
      return (v.nome||"").toLowerCase().includes(q)
          || (c && (c.clienteNome||"").toLowerCase().includes(q))
          || (dq.length >= 3 && soDigitos(v.doc).includes(dq));
    });
  }

  // --- números do topo ---
  const ativas = vidasAtivas(todas);
  const porPilar = {};
  PK.forEach(p=>porPilar[p]=0);
  ativas.forEach(v=>{ const c=contratoPorId(v.contratoId); if(c) porPilar[c.pilar]=(porPilar[c.pilar]||0)+1; });
  const naoDetalhadas = pendentes.reduce((a,c)=>a+(Number(c.vidas)||0),0);
  const mesAtual0 = mesAtual();
  const entraram = todas.filter(v=>(v.entrada||"").slice(0,7)===mesAtual0).length;
  const sairam   = todas.filter(v=>(v.saida||"").slice(0,7)===mesAtual0).length;
  const titulares = ativas.filter(v=>(v.tipo||"titular")==="titular").length;
  const deps = ativas.length - titulares;

  // --- por operadora, ordenado ---
  const porOperadora = {};
  ativas.forEach(v=>{ const c=contratoPorId(v.contratoId); if(!c) return;
    const k=c.operadora||"Sem operadora"; porOperadora[k]=(porOperadora[k]||0)+1; });
  const opsOrd = Object.entries(porOperadora).sort((a,b)=>b[1]-a[1]);
  const maxOp = Math.max(...opsOrd.map(o=>o[1]), 1);

  const pag = S.pagVidas || 1;
  const porPagina = 100;
  const ordenada = lista.slice().sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"));
  const fatia = ordenada.slice(0, pag*porPagina);

  return `
  ${avisoSuaParte()}
  <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(168px,1fr))">
    <div class="stat hero"><div class="k">Vidas ativas</div><div class="v">${ativas.length.toLocaleString("pt-BR")}</div>
      <div class="d">${titulares} titular${titulares!==1?"es":""} · ${deps} dependente${deps!==1?"s":""}</div></div>
    ${PK.filter(p=>PILAR_TEM_VIDA[p]).map(p=>`
      <div class="stat clickable" data-act="irFiltro" data-view="vidas" data-f='{"pilar":"${p}"}'>
        <div class="k">${esc(PILARES[p].curto)}</div><div class="v">${(porPilar[p]||0).toLocaleString("pt-BR")}</div>
        <div class="d">vidas ativas</div></div>`).join("")}
    <div class="stat"><div class="k">Movimento do mês</div>
      <div class="v" style="font-size:22px"><span style="color:var(--ok)">+${entraram}</span> <span style="color:var(--ink-3)">/</span> <span style="color:var(--crit)">−${sairam}</span></div>
      <div class="d">inclusões e exclusões em ${mesLabel(mesAtual0)}</div></div>
  </div>

  ${naoDetalhadas ? `<div class="alerts"><div class="alert warn" data-act="irFiltro" data-view="vidas" data-f='{"pendentes":"1"}'>
    <span class="ai" aria-hidden="true">!</span>
    <span><b>${naoDetalhadas} vida(s) ainda sem nome</b>
    <span>${pendentes.length} contrato(s) trazem só o número de vidas. Abra cada um e detalhe quem são.</span></span></div></div>` : ""}

  ${f.pendentes ? painelPendentes(pendentes) : ""}

  ${painelFaixaEtaria(todas)}

  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-bottom:14px">
    <section class="panel">
      <div class="panel-head"><div><h3>Vidas por operadora</h3><div class="sub">Só as ativas</div></div></div>
      <div class="chart-wrap">${opsOrd.length ? opsOrd.slice(0,8).map(([nome,n])=>`
        <div class="bar-line"><span class="nm">${esc(nome)}</span>
          <span class="track"><span class="fill" style="width:${larg(n,maxOp)}%;background:var(--accent)"></span></span>
          <span class="n">${n.toLocaleString("pt-BR")}</span></div>`).join("")
        : `<div class="hint">Nenhuma vida ativa ainda.</div>`}</div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h3>Situação das vidas</h3><div class="sub">Todas, inclusive as que saíram</div></div></div>
      <div class="chart-wrap"><div class="dl">
        ${Object.entries(STATUS_VIDA).map(([k,v])=>`
          <div class="clickable" data-act="irFiltro" data-view="vidas" data-f='{"statusVida":"${k}"}'>
            <div class="k">${esc(v.nome)}</div>
            <div class="v num" style="font-size:19px;font-weight:700">${todas.filter(x=>x.status===k).length.toLocaleString("pt-BR")}</div></div>`).join("")}
      </div></div>
    </section>
  </div>

  <div class="filters">
    <div class="field" style="flex:1;min-width:190px"><label for="vdBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="vdBusca" type="text" placeholder="Nome da vida ou do cliente" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field"><label for="vdStatus">Situação</label><select id="vdStatus" data-act="filtro" data-k="statusVida">
      <option value="">Todas</option>${Object.entries(STATUS_VIDA).map(([k,v])=>`<option value="${k}" ${f.statusVida===k?"selected":""}>${esc(v.nome)}</option>`).join("")}</select></div>
    <div class="field"><label for="vdTipo">Tipo</label><select id="vdTipo" data-act="filtro" data-k="tipoVida">
      <option value="">Todos</option>${Object.entries(TIPO_VIDA).map(([k,v])=>`<option value="${k}" ${f.tipoVida===k?"selected":""}>${esc(v)}</option>`).join("")}</select></div>
    <div class="field"><label for="vdPilar">Pilar</label><select id="vdPilar" data-act="filtro" data-k="pilar">
      <option value="">Todos</option>${PK.filter(p=>PILAR_TEM_VIDA[p]).map(p=>`<option value="${p}" ${f.pilar===p?"selected":""}>${esc(PILARES[p].curto)}</option>`).join("")}</select></div>
    <div class="field"><label for="vdOper">Operadora</label><select id="vdOper" data-act="filtro" data-k="operadora">
      <option value="">Todas</option>${[...new Set(S.contratos.map(c=>c.operadora).filter(Boolean))].sort().map(o=>`<option value="${esc(o)}" ${f.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    ${Object.keys(f).length||S.busca?`<button class="btn ghost" data-act="limparFiltros">Limpar</button>`:""}
  </div>

  <section class="panel">
    <div class="panel-head"><div><h3>${lista.length.toLocaleString("pt-BR")} vida${lista.length!==1?"s":""}</h3>
      <div class="sub">${fatia.length < lista.length ? `mostrando as ${fatia.length} primeiras` : "todas no filtro atual"}</div></div></div>
    ${fatia.length?`<div class="tw"><table>
      <thead><tr><th>Nome</th><th>Tipo</th><th>Cliente</th><th>Contrato</th><th class="num">Entrada</th><th class="num">Saída</th><th>Situação</th><th></th></tr></thead>
      <tbody>${fatia.map(v=>{
        const c = contratoPorId(v.contratoId);
        const st = SV(v.status);
        return `<tr>
          <td><b>${esc(v.nome||"—")}</b>${v.doc?`<div class="hint num">${esc(mascararDoc(v.doc))}</div>`:""}</td>
          <td><span class="chip ${(v.tipo||"titular")==="titular"?"info":"mute"}">${esc(TIPO_VIDA[v.tipo||"titular"])}</span>
            ${v.parentesco?`<div class="hint">${esc(v.parentesco)}</div>`:""}</td>
          <td class="clickable" data-act="abrirCliente" data-id="${esc(c?c.clienteId:"")}">${esc(c?c.clienteNome:"—")}</td>
          <td class="clickable" data-act="abrirContrato" data-id="${esc(v.contratoId)}">
            ${c?`<span class="chip ${esc(c.pilar)}">${esc(PILARES[c.pilar].curto)}</span> <span class="hint">${esc(c.operadora||"")}</span>`:"—"}</td>
          <td class="num">${v.entrada?dt(v.entrada):"—"}</td>
          <td class="num">${v.saida?dt(v.saida):"—"}</td>
          <td><span class="chip ${st.cls}">${esc(st.nome)}</span></td>
          <td class="r" style="white-space:nowrap">
            <button class="btn sm ghost" data-act="editarVida" data-id="${esc(v.id)}" aria-label="Editar vida">✎</button>
            ${SV(v.status).conta?`<button class="btn sm" data-act="excluirVidaDoPlano" data-id="${esc(v.id)}">Excluir do plano</button>`:""}
          </td></tr>`;
      }).join("")}</tbody></table></div>
      ${fatia.length < lista.length?`<div class="ta"><button class="btn" data-act="maisVidas">Mostrar mais ${Math.min(porPagina, lista.length-fatia.length)}</button></div>`:""}`
    : `<div class="empty" style="padding:26px"><b>Nenhuma vida com esses filtros</b>Ajuste a busca ou limpe os filtros.</div>`}
  </section>`;
}

/** Contratos que ainda trazem só o número de vidas, sem nome. */
function painelFaixaEtaria(todas){
  const saude = vidasAtivas(todas).filter(v=>{ const c=contratoPorId(v.contratoId); return c && c.pilar==="saude"; });
  const comData = saude.filter(v=>v.nascimento);
  const cont = FAIXAS_ANS.map(()=>0);
  comData.forEach(v=>{ const i = faixaANS(idadeEm(v.nascimento)); if(i>=0) cont[i]++; });
  const max = Math.max(...cont, 1);
  const mudam = mudancasDeFaixa(60);
  const semData = saude.length - comData.length;
  if(!saude.length) return "";
  return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-bottom:14px">
    <section class="panel">
      <div class="panel-head"><div><h3>Faixa etária (ANS)</h3>
        <div class="sub">Vidas ativas de saúde com data de nascimento · ${comData.length} de ${saude.length}</div></div></div>
      <div class="chart-wrap">${comData.length ? FAIXAS_ANS.map((f,i)=>`
        <div class="bar-line"><span class="nm">${esc(f.rot)}</span>
          <span class="track"><span class="fill" style="width:${larg(cont[i],max)}%;background:${i===9?"var(--warn)":"var(--c-saude)"}"></span></span>
          <span class="n">${cont[i]}</span></div>`).join("")
        : `<div class="hint">Nenhuma vida de saúde com data de nascimento ainda.</div>`}
        ${semData?`<div class="hint" style="margin-top:8px">${semData} vida(s) sem nascimento ficam fora deste quadro e dos avisos de mudança de faixa.</div>`:""}
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><span class="chip ${mudam.length?"warn":"ok"}">${mudam.length?"Reajuste por idade":"Nada em 60 dias"}</span>
        <div><h3>Mudam de faixa em 60 dias</h3><div class="sub">O boleto sobe no mês seguinte ao aniversário</div></div></div>
      ${mudam.length?`<div class="tw"><table><tbody>${mudam.slice(0,10).map(x=>`<tr>
        <td><b>${esc(x.v.nome)}</b><div class="hint">${esc(x.ct.clienteNome)} · ${esc(x.ct.operadora||"")}</div></td>
        <td class="num">${dt(x.prox)}<div class="hint">faz ${x.idade} · entra em ${esc(x.faixa.rot)}</div></td>
        <td class="r"><button class="btn sm" data-act="avisarFaixa" data-id="${esc(x.v.id)}">Avisar cliente</button></td>
      </tr>`).join("")}</tbody></table></div>
      ${mudam.length>10?`<div class="ta">e mais ${mudam.length-10}.</div>`:""}`
      : `<div class="chart-wrap"><div class="hint">Nenhuma vida muda de faixa nos próximos 60 dias${semData?" — entre as que têm data de nascimento":""}.</div></div>`}
    </section>
  </div>`;
}

function painelPendentes(pendentes){
  return `<section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><span class="chip warn">A detalhar</span>
      <div><h3>${pendentes.length} contrato(s) com vidas sem nome</h3>
        <div class="sub">O número veio do contrato; falta dizer quem são</div></div>
      <div class="right"><button class="btn sm ghost" data-act="limparFiltros">Fechar</button></div></div>
    <div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Produto</th><th>Operadora</th><th class="r">Vidas</th><th></th></tr></thead>
      <tbody>${pendentes.slice(0,50).map(c=>`<tr>
        <td class="clickable" data-act="abrirContrato" data-id="${esc(c.id)}"><b>${esc(c.clienteNome)}</b></td>
        <td><span class="chip ${esc(c.pilar)}">${esc(PILARES[c.pilar].curto)}</span> <span class="hint">${esc(c.produto||"")}</span></td>
        <td>${esc(c.operadora||"—")}</td>
        <td class="r num"><b>${c.vidas}</b></td>
        <td class="r"><button class="btn sm primary" data-act="detalharVidas" data-id="${esc(c.id)}">Detalhar</button></td>
      </tr>`).join("")}</tbody></table></div>
    ${pendentes.length>50?`<div class="ta">e mais ${pendentes.length-50} contrato(s).</div>`:""}
  </section>`;
}

/** CPF aparece mascarado: a tela não precisa do número inteiro. */
function mascararDoc(v){
  const d = normDoc(v);
  if(d.length===11) return `•••.${d.slice(3,6)}.${d.slice(6,9)}-••`;
  if(d.length===14) return `••.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-••`;
  return d ? "•••" : "";
}

function formVida(v, contratoId){
  v = v || {};
  const ct = contratoPorId(v.contratoId || contratoId) || null;
  const atual = v.contratoId || contratoId;
  const candidatos = S.contratos.filter(c=>c.id===atual
    || (contratoTemVida(c) && c.status!=="cancelado" && noEscopo(c,"corretor")));
  const ehDep = (v.tipo||"titular")==="dependente";
  return `
  <div class="m-head"><div><h2>${v.id?"Editar vida":"Incluir vida"}</h2>
    <div class="sub">${ct?esc(ct.clienteNome+" · "+(ct.operadora||"")):"Escolha o contrato"}</div></div></div>
  <div class="m-body">
    <div class="field"><label for="viContrato">Contrato</label>
      <select id="viContrato">${candidatos.length?candidatos.map(c=>`<option value="${esc(c.id)}" ${(v.contratoId||contratoId)===c.id?"selected":""}>${esc(c.clienteNome)} · ${esc(PILARES[c.pilar].curto)} · ${esc(c.operadora||"")}</option>`).join(""):`<option value="">— nenhum contrato de saúde ou proteção —</option>`}</select>
      <span class="hint">Consórcio não tem vida: tem cota.</span></div>
    <div class="frow">
      <div class="field" style="flex:2"><label for="viNome">Nome completo</label><input id="viNome" type="text" value="${esc(v.nome||"")}" placeholder="Maria Aparecida dos Santos"></div>
      <div class="field"><label for="viTipo">Tipo</label><select id="viTipo" data-act="tipoVidaMudou">
        ${Object.entries(TIPO_VIDA).map(([k,n])=>`<option value="${k}" ${(v.tipo||"titular")===k?"selected":""}>${esc(n)}</option>`).join("")}</select></div>
      <div class="field" id="campoParentesco" ${ehDep?"":'style="display:none"'}><label for="viParentesco">Parentesco</label>
        <select id="viParentesco">${PARENTESCOS.map(p=>`<option ${v.parentesco===p?"selected":""}>${esc(p)}</option>`).join("")}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="viStatus">Situação</label><select id="viStatus">
        ${Object.entries(STATUS_VIDA).map(([k,s])=>`<option value="${k}" ${(v.status||"ativa")===k?"selected":""}>${esc(s.nome)}</option>`).join("")}</select></div>
      <div class="field"><label for="viEntrada">Entrada no plano</label><input id="viEntrada" type="date" value="${esc(v.entrada||(ct?ct.inicio:hoje()))}"></div>
      <div class="field"><label for="viSaida">Saída</label><input id="viSaida" type="date" value="${esc(v.saida||"")}">
        <span class="hint">Em branco enquanto estiver no plano.</span></div>
    </div>
    <details>
      <summary style="cursor:pointer;font-size:11.5px;color:var(--ink-3);font-weight:600">Dados pessoais (opcionais)</summary>
      <div class="frow" style="margin-top:10px">
        <div class="field"><label for="viDoc">CPF</label><input id="viDoc" type="text" value="${esc(formatarDoc(v.doc||""))}" placeholder="000.000.000-00" inputmode="numeric" data-mascara="doc">
          <span class="hint">Guardado para movimentação junto à operadora. Aparece mascarado nas listas.</span></div>
        <div class="field"><label for="viNasc">Nascimento</label><input id="viNasc" type="date" value="${esc(v.nascimento||"")}"></div>
        <div class="field"><label for="viCarteirinha">Carteirinha</label><input id="viCarteirinha" type="text" value="${esc(v.carteirinha||"")}"></div>
      </div>
      <div class="hint">Preencha só o que a operadora exigir. Dado que não é necessário é dado que você não precisa proteger.</div>
    </details>
    <div class="field"><label for="viObs">Observações</label><textarea id="viObs" placeholder="Carência, portabilidade, o que combinaram">${esc(v.obs||"")}</textarea></div>
  </div>
  <div class="m-foot">
    ${v.id?`<button class="btn ghost danger left" data-act="apagarVida" data-id="${esc(v.id)}">Apagar registro</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarVida" data-id="${esc(v.id||"")}">${v.id?"Salvar":"Incluir vida"}</button>
  </div>`;
}
async function salvarVida(id){
  const contratoId = val("viContrato");
  if(!contratoId){ toast("Escolha o contrato."); return; }
  const nome = val("viNome").trim();
  if(!nome){ toast("Informe o nome da pessoa."); return; }
  const ct = contratoPorId(contratoId);
  const antiga = id ? (S.vidas||[]).find(x=>x.id===id) : null;
  const tipo = val("viTipo")||"titular";
  const v = Object.assign({}, antiga||{}, {
    id: id || uid("vid"),
    contratoId, clienteId: ct ? ct.clienteId : "",
    nome, tipo,
    parentesco: tipo==="dependente" ? val("viParentesco") : "",
    status: val("viStatus")||"ativa",
    entrada: val("viEntrada")||hoje(),
    saida: val("viSaida")||"",
    doc: soDigitos(val("viDoc")),
    nascimento: val("viNasc")||"",
    carteirinha: val("viCarteirinha")||"",
    obs: val("viObs")||"",
    criadoEm: (antiga && antiga.criadoEm) || hoje()
  });
  await salvar("vidas", v, id ? "Alterou a vida de" : "Incluiu no plano —");
  fecharModal();
  toast(id ? "Vida atualizada" : "Vida incluída");
}
/** Exclusão do plano: a vida não some do sistema, muda de situação e ganha data de saída. */
async function excluirDoPlano(id){
  const v = (S.vidas||[]).find(x=>x.id===id); if(!v) return;
  const d = await pedirTexto("Excluir do plano",
    `Informe a data de saída de ${v.nome}. O registro fica no histórico — nada é apagado.`,
    hoje(), "Confirmar exclusão", "date");
  if(!d) return;   // cancelar devolve false, não null
  await salvar("vidas", Object.assign({}, v, { status:"cancelada", saida: d }),
               "Excluiu do plano —");
  toast("Vida excluída do plano");
}
/** Detalhar em lote: cria as linhas que faltam para um contrato que só tem o número. */
function formDetalhar(contratoId){
  const c = contratoPorId(contratoId); if(!c) return "";
  const jaTem = vidasDoContrato(contratoId).length;
  const faltam = Math.max(0, (Number(c.vidas)||0) - jaTem);
  return `
  <div class="m-head"><div><h2>Detalhar vidas</h2>
    <div class="sub">${esc(c.clienteNome)} · ${esc(c.operadora||"")} · ${c.vidas} vida(s) no contrato</div></div></div>
  <div class="m-body">
    <div class="hint" style="margin-bottom:12px">Digite um nome por linha. A primeira vira titular, as demais entram como dependentes — você ajusta depois quem é quem. ${jaTem?`Já existem ${jaTem} vida(s) detalhada(s) neste contrato.`:""}</div>
    <div class="field"><label for="dtNomes">Nomes (um por linha)</label>
      <textarea id="dtNomes" rows="8" placeholder="Maria Aparecida dos Santos&#10;João Pedro dos Santos&#10;Ana Clara dos Santos"></textarea>
      <span class="hint">Faltam ${faltam} para bater com o número do contrato. Pode entrar com mais ou com menos: o contrato passa a valer pelo que estiver aqui.</span></div>
    <div class="field"><label for="dtEntrada">Entrada no plano</label><input id="dtEntrada" type="date" value="${esc(c.inicio||hoje())}"></div>
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarDetalhe" data-id="${esc(contratoId)}">Criar as vidas</button></div>`;
}
async function salvarDetalhe(contratoId){
  const c = contratoPorId(contratoId); if(!c) return;
  const nomes = (val("dtNomes")||"").split("\n").map(x=>x.trim()).filter(Boolean);
  if(!nomes.length){ toast("Digite ao menos um nome."); return; }
  const entrada = val("dtEntrada") || c.inicio || hoje();
  const jaTem = vidasDoContrato(contratoId).length;
  let i = 0;
  for(const nome of nomes){
    const ehTitular = (jaTem===0 && i===0);
    await salvar("vidas", {
      id: uid("vid"), contratoId, clienteId: c.clienteId, nome,
      tipo: ehTitular ? "titular" : "dependente",
      parentesco: ehTitular ? "" : "Outro",
      status:"ativa", entrada, saida:"", doc:"", nascimento:"", carteirinha:"", obs:"",
      criadoEm: hoje()
    }, i===0 ? `Detalhou ${nomes.length} vida(s) de` : null);
    i++;
  }
  fecharModal();
  toast(`${nomes.length} vida(s) criada(s)`);
}

