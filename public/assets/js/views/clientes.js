/* Erbe · Central — views/clientes.js
   Carteira de clientes, pós-venda e quadro de etapas.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   CLIENTES
   ============================================================ */
/** Etapa de relacionamento do cliente; sem valor gravado, deduz do contrato. */
function etapaCliente(c){
  if(c.etapaCliente) return c.etapaCliente;
  const cs = contratosDoCliente(c.id);
  if(!cs.length) return "onboarding";
  if(cs.every(x=>x.status==="cancelado")) return "encerrado";
  if(cs.some(x=>["ativo","implantado"].includes(x.status))) return "ativo";
  return "onboarding";
}
function viewClientes(){
  const busca = S.busca.toLowerCase();
  const lista = S.clientes.filter(c=>noEscopo(c))
    .filter(c=>!busca || (c.nome+" "+(c.doc||"")+" "+(c.email||"")+" "+(c.telefone||"")).toLowerCase().includes(busca))
    .sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  if(!S.clientes.length) return vazio("Nenhum cliente ainda","Todo lead marcado como ganho vira cliente automaticamente. Você também pode cadastrar direto.","novoCliente","Cadastrar cliente");
  const controles = `
  <div class="filters">
    <div class="field" style="flex:1;max-width:340px"><label for="cBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="cBusca" type="text" placeholder="Nome, CNPJ/CPF, e-mail" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field" style="flex:none"><label>Visualização</label>
      <div class="seg" role="group" aria-label="Visualização da carteira">
        <button data-act="modoClientes" data-v="kanban" aria-pressed="${S.modoClientes==="kanban"}">Quadro</button>
        <button data-act="modoClientes" data-v="lista" aria-pressed="${S.modoClientes==="lista"}">Lista</button>
      </div></div>
    <div class="field" style="flex:none"><label>&nbsp;</label><button class="btn" data-act="baixarRel" data-tipo="carteira">Baixar carteira (Excel ou PDF)</button></div>
  </div>`;
  // Paginação: antes a tela desenhava todos os clientes de uma vez — 6 MB de HTML
  // e 113 mil elementos com 5.000 clientes. Agora desenha por blocos.
  const POR_PAGINA = 60;
  const pag = S.pagClientes || 1;
  const fatia = lista.slice(0, pag*POR_PAGINA);
  const maisBotao = fatia.length < lista.length
    ? `<div class="ta"><button class="btn" data-act="maisClientes">Mostrar mais ${Math.min(POR_PAGINA, lista.length-fatia.length)} de ${lista.length.toLocaleString("pt-BR")}</button></div>`
    : "";
  const contagem = `<div class="hint" style="margin:-4px 0 12px">${lista.length.toLocaleString("pt-BR")} cliente${lista.length!==1?"s":""}${fatia.length<lista.length?` · mostrando ${fatia.length}`:""}${S.busca?` para “${esc(S.busca)}”`:""}</div>`;
  if(S.modoClientes==="kanban") return painelPosVenda(lista) + controles + contagem + boardClientes(fatia) + maisBotao;
  return painelPosVenda(lista) + controles + contagem + `
  <div class="panel"><div class="tw"><table>
    <thead><tr><th>Cliente</th><th>Etapa</th><th>Contato</th><th>Contratos</th><th class="r">Vidas</th><th class="r com">${veCorretora()?"Comissão gerada":"Sua comissão"}</th><th>Responsável</th><th></th></tr></thead>
    <tbody>${fatia.map(c=>{
      const cs = contratosDoCliente(c.id).filter(x=>x.status!=="cancelado");
      const receita = receitaCliente(c);
      return `<tr class="clickable" data-act="abrirCliente" data-id="${esc(c.id)}">
        <td><b>${esc(c.nome)}</b>${c.doc?`<div class="hint num">${esc(mascararDoc(c.doc))}</div>`:""}</td>
        <td><span class="chip ${etapaCliente(c)==="risco"?"crit":etapaCliente(c)==="ativo"?"ok":"mute"}">${esc(nomeEtapaCliente(etapaCliente(c)))}</span></td>
        <td>${esc(c.telefone||"—")}${c.email?`<div class="hint">${esc(c.email)}</div>`:""}</td>
        <td>${cs.length ? cs.map(x=>`<span class="chip ${esc(x.pilar)}">${esc(PILARES[x.pilar].curto)}</span>`).join(" ") : `<span class="hint">—</span>`}</td>
        <td class="r num">${vidasAtivas(vidasDoCliente(c.id)).length || "—"}</td>
        <td class="r num com">${brl(receita)}</td>
        <td>${esc(nomeUsuario(c.responsavel))}</td>
        <td class="r"><button class="btn sm ghost" data-act="editarCliente" data-id="${esc(c.id)}" title="Editar os dados de ${esc(c.nome)}" aria-label="Editar ${esc(c.nome)}">✎ Editar</button></td>
      </tr>`;
    }).join("") || `<tr><td colspan="8" class="empty">Nenhum cliente encontrado para essa busca.</td></tr>`}</tbody>
  </table></div></div>`;
}

/** Próximo vencimento de boleto de um contrato, a partir do dia do mês. */
function proximoBoleto(c){
  const dia = Number(c.diaVencimento);
  if(!dia) return null;
  const h = hoje(), ano = +h.slice(0,4), mes = +h.slice(5,7), diaHoje = +h.slice(8,10);
  const noMes = (a,m) => { const ult = new Date(a, m, 0).getDate(); return `${a}-${String(m).padStart(2,"0")}-${String(Math.min(dia,ult)).padStart(2,"0")}`; };
  const esteMes = noMes(ano, mes);
  if(+esteMes.slice(8,10) >= diaHoje) return esteMes;
  return mes===12 ? noMes(ano+1,1) : noMes(ano,mes+1);
}
/** Situação de pós-venda de um cliente: quando foi o último contato e quando é o próximo. */
function posVenda(cli){
  const cadencia = Number(cli.posVendaCadencia) || Number(S.config.cadenciaPosVenda) || 90;
  const ultimo = cli.ultimoPosVenda || "";
  const referencia = ultimo || cli.criadoEm || hoje();
  const proximo = addDays(referencia, cadencia);
  return { cadencia, ultimo, proximo, dias: diasEntre(hoje(), proximo), atrasado: proximo < hoje() };
}
function nomeEtapaCliente(id){ const e=S.config.etapasCliente.find(e=>e.id===id); return e?e.nome:id; }
/** Lembretes de pós-venda: boleto chegando, contato vencido e aniversário de contrato. */
function painelPosVenda(lista){
  const ativos = lista.filter(c=>etapaCliente(c)!=="encerrado");
  const boletos = [];
  ativos.forEach(cli=>{
    contratosDoCliente(cli.id).filter(x=>["ativo","implantado"].includes(x.status) && x.diaVencimento)
      .forEach(x=>{ const d = proximoBoleto(x); if(d && diasEntre(hoje(),d) <= 7) boletos.push({cli, ctr:x, data:d, dias:diasEntre(hoje(),d)}); });
  });
  boletos.sort((a,b)=>a.data.localeCompare(b.data));

  const contatos = ativos.map(cli=>({cli, pv:posVenda(cli)}))
    .filter(x=>x.pv.dias <= 7)
    .sort((a,b)=>a.pv.proximo.localeCompare(b.pv.proximo));

  const aniversarios = [];
  ativos.forEach(cli=>{
    contratosDoCliente(cli.id).filter(x=>["ativo","implantado"].includes(x.status) && x.fim)
      .forEach(x=>{ const d = diasEntre(hoje(), x.fim); if(d>=0 && d<=60) aniversarios.push({cli, ctr:x, dias:d}); });
  });
  aniversarios.sort((a,b)=>a.dias-b.dias);

  const festas = aniversariantes(diasAvisoAniv(), lista);
  if(!boletos.length && !contatos.length && !aniversarios.length && !festas.length){
    const semDia = S.contratos.filter(x=>["ativo","implantado"].includes(x.status) && !x.diaVencimento).length;
    if(!semDia) return "";
    return `<section class="panel" style="margin-bottom:16px"><div class="chart-wrap">
      <div class="hint">Preencha o <b>dia de vencimento do boleto</b> nos contratos e esta área passa a avisar quando a cobrança do cliente está chegando — ${semDia} contrato(s) ativo(s) ainda sem esse dado.</div>
    </div></section>`;
  }
  // Cada bloco mostra no máximo 15 linhas: é uma lista de trabalho do dia,
  // não um relatório. Sem isso, uma carteira grande desenha milhares de linhas.
  const TETO_BLOCO = 15;
  const bloco = (titulo, cls, itens, corpo) => itens.length ? `
    <div style="margin-bottom:14px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:7px">
        <span class="chip ${cls}">${esc(titulo)}</span><span class="hint">${itens.length} ${itens.length===1?"cliente":"clientes"}</span></div>
      <div class="tw"><table><tbody>${corpo}</tbody></table></div>
      ${itens.length>TETO_BLOCO?`<div class="ta">e mais ${itens.length-TETO_BLOCO} — os mais urgentes vêm primeiro.</div>`:""}
    </div>` : "";

  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h3>Lembretes de pós-venda</h3>
      <div class="sub">Quem merece um contato seu nos próximos dias</div></div>
      <div class="right" style="display:flex;gap:6px;align-items:center">
        <span class="hint">Aniversários com</span>
        ${S.mePapel==="gestor"
          ? `<input type="number" min="0" max="60" value="${diasAvisoAniv()}" data-act="cfgNum" data-k="diasAvisoAniversario" data-min="0" data-max="60" style="width:58px;padding:3px 7px;font-size:12.5px;text-align:center" aria-label="Dias de antecedência do lembrete de aniversário">`
          : `<b>${diasAvisoAniv()}</b>`}
        <span class="hint">dias de antecedência</span></div></div>
    <div class="chart-wrap">
      ${bloco("Boleto chegando", "warn", boletos, boletos.slice(0,TETO_BLOCO).map(b=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(b.cli.id)}"><b>${esc(b.cli.nome)}</b>
          <div class="hint">${esc(b.ctr.operadora||"")} · vigência ${dt(b.ctr.inicio)} — ${b.ctr.fim?dt(b.ctr.fim):"—"}</div></td>
        <td class="num">vence ${dt(b.data)} <span class="chip ${b.dias<=2?"crit":"warn"}">${b.dias===0?"hoje":`em ${b.dias}d`}</span></td>
        <td class="r num">${brl(b.ctr.valorBase)}</td>
        <td class="r"><button class="btn sm" data-act="tarefaBoleto" data-id="${esc(b.cli.id)}" data-c="${esc(b.ctr.id)}" data-d="${esc(b.data)}">Lembrar</button></td>
      </tr>`).join(""))}

      ${bloco("Contato de pós-venda", "info", contatos, contatos.slice(0,TETO_BLOCO).map(x=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(x.cli.id)}"><b>${esc(x.cli.nome)}</b>
          <div class="hint">${x.pv.ultimo?`último contato em ${dt(x.pv.ultimo)}`:"nenhum contato registrado"} · a cada ${x.pv.cadencia} dias</div></td>
        <td class="num">${x.pv.atrasado?`<span class="chip crit">atrasado ${Math.abs(x.pv.dias)}d</span>`:`<span class="chip info">em ${x.pv.dias}d</span>`}</td>
        <td class="r"><button class="btn sm" data-act="registrarPosVenda" data-id="${esc(x.cli.id)}">Falei com ele</button>
          <button class="btn sm ghost" data-act="tarefaPosVenda" data-id="${esc(x.cli.id)}">Agendar</button></td>
      </tr>`).join(""))}

      ${bloco("Aniversário", "info", festas, festas.slice(0,TETO_BLOCO).map(x=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(x.c.id)}"><b>${esc(x.quem==="contato"?x.nome:x.c.nome)}</b>
          <div class="hint">${esc(descAniv(x))}</div></td>
        <td class="num">${dt(x.prox)} <span class="chip ${x.dias===0?"ok":"info"}">${x.dias===0?"hoje":`em ${x.dias}d`}</span>${jaParabenizado(x)?` <span class="chip mute">parabenizado</span>`:""}</td>
        <td class="r" style="white-space:nowrap">${botoesAniv(x)}</td>
      </tr>`).join(""))}

      ${bloco("Aniversário de contrato", "ok", aniversarios, aniversarios.slice(0,TETO_BLOCO).map(a=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(a.cli.id)}"><b>${esc(a.cli.nome)}</b>
          <div class="hint">${esc(a.ctr.operadora||"")} · reajuste e renovação</div></td>
        <td class="num">${dt(a.ctr.fim)} <span class="chip ${a.dias<=30?"warn":"ok"}">em ${a.dias}d</span></td>
        <td class="r"><button class="btn sm" data-act="irFiltro" data-view="renovacoes" data-f="{}">Ver renovações</button></td>
      </tr>`).join(""))}
    </div>
  </section>`;
}
function boardClientes(lista){
  return `<div class="board" data-board="clientes">${S.config.etapasCliente.map(e=>{
    const cs = lista.filter(c=>etapaCliente(c)===e.id);
    const receita = cs.reduce((a,c)=>a+receitaCliente(c),0);
    return `<div class="col" data-etapa="${esc(e.id)}">
      <div class="col-head"><b>${esc(e.nome)}</b><span class="cnt">${cs.length}</span><span class="val com">${brl(receita)}</span></div>
      <div class="col-body">${cs.map(cardCliente).join("") || `<div class="hint" style="padding:8px 4px">Arraste um cliente para cá.</div>`}</div>
    </div>`;
  }).join("")}</div>
  <div class="hint" style="margin-top:12px">Arraste o cartão para mover o cliente na esteira de pós-venda. <b>Em risco</b> marca quem sinalizou cancelamento ou está inadimplente; <b>Renovação em curso</b>, quem já entrou na negociação do reajuste.</div>`;
}
/** Valor do cliente para a corretora: comissão gerada por todos os contratos. */
function receitaCliente(c){
  return contratosDoCliente(c.id).filter(x=>x.status!=="cancelado" && noEscopo(x,"corretor"))
                    .reduce((a,x)=>a+comissaoContrato(x),0);
}
function cardCliente(c){
  const cs = contratosDoCliente(c.id).filter(x=>x.status!=="cancelado");
  const pilares = [...new Set(cs.map(x=>x.pilar))];
  const venc = cs.filter(x=>x.fim && x.fim<=addDays(hoje(),60) && x.fim>=hoje())
                 .sort((a,b)=>a.fim.localeCompare(b.fim))[0];
  const principal = pilares[0] || "saude";
  return `<article class="lead ${esc(principal)}" draggable="true" data-cliente="${esc(c.id)}" tabindex="0" role="button">
    ${podeExcluirCarteira()?`<button class="del" data-act="excluirCliente" data-id="${esc(c.id)}" title="Excluir cliente" aria-label="Excluir ${esc(c.nome)}">×</button>`:""}
    <b>${esc(c.nome)}</b>
    <div class="org">${esc(c.tipo||"PJ")} · ${cs.length} contrato${cs.length!==1?"s":""}</div>
    <div class="meta">
      <span class="val com">${brl(receitaCliente(c))}</span>
      ${pilares.map(p=>`<span class="chip ${esc(p)}">${esc(PILARES[p].curto)}</span>`).join("")}
    </div>
    ${(()=>{ const pv=posVenda(c);
      const bol = cs.filter(x=>x.diaVencimento).map(x=>proximoBoleto(x)).filter(Boolean).sort()[0];
      const marcas = [];
      if(bol && diasEntre(hoje(),bol)<=7) marcas.push(`<span class="chip warn">boleto ${dt(bol).slice(0,5)}</span>`);
      if(pv.atrasado) marcas.push(`<span class="chip crit">pós-venda atrasado</span>`);
      if(venc) marcas.push(`<span class="chip mute">vence ${dt(venc.fim)}</span>`);
      const an = aniversariantes(diasAvisoAniv(), [c])[0];
      if(an) marcas.push(`<span class="chip info">aniversário ${an.dias===0?"hoje":dt(an.prox).slice(0,5)}</span>`);
      return marcas.length?`<div class="meta">${marcas.join("")}</div>`:"";
    })()}
    <div class="meta"><span class="hint">${esc(nomeUsuario(c.responsavel))}</span>
      <span class="chip mute" style="margin-left:auto">${esc(iniciais(nomeUsuario(c.responsavel)))}</span></div>
  </article>`;
}
function ligarBoardClientes(){
  let arrastando=null;
  document.querySelectorAll("[data-cliente]").forEach(el=>{
    el.addEventListener("dragstart", e=>{ arrastando=el.dataset.cliente; el.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; });
    el.addEventListener("dragend", ()=>{ el.classList.remove("dragging"); arrastando=null; });
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); abrirCliente(el.dataset.cliente); } });
  });
  document.querySelectorAll('[data-board="clientes"] .col').forEach(col=>{
    col.addEventListener("dragover", e=>{ e.preventDefault(); col.classList.add("dragover"); });
    col.addEventListener("dragleave", ()=>col.classList.remove("dragover"));
    col.addEventListener("drop", async e=>{
      e.preventDefault(); col.classList.remove("dragover");
      if(!arrastando) return;
      await moverCliente(arrastando, col.dataset.etapa);
    });
  });
}
async function moverCliente(id, etapa){
  const c = S.clientes.find(x=>x.id===id); if(!c || etapaCliente(c)===etapa) return;
  c.etapaCliente = etapa;
  await salvar("clientes", c, `Moveu para ${nomeEtapaCliente(etapa)}`);
  toast(`${c.nome} → ${nomeEtapaCliente(etapa)}`);
}

