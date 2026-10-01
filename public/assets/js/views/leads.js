/* Erbe · Central — views/leads.js
   Funil de leads (kanban).
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   FUNIL DE LEADS
   ============================================================ */
function viewLeads(){
  const etapas = S.config.etapas;
  const f = S.filtros;
  const lista = S.leads.filter(l=>noEscopo(l))
    .filter(l=>!f.pilar || l.pilar===f.pilar)
    .filter(l=>!f.origem || l.origem===f.origem)
    .filter(l=>!S.busca || (l.nome+" "+(l.empresa||"")+" "+(l.telefone||"")).toLowerCase().includes(S.busca.toLowerCase()));
  return `
  <div class="filters">
    <div class="field" style="flex:1;min-width:210px"><label for="fBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="fBusca" type="text" placeholder="Nome, empresa ou telefone" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field"><label for="fPilar">Pilar</label><select id="fPilar" data-act="filtro" data-k="pilar">
      <option value="">Todos</option>${PK.map(p=>`<option value="${p}" ${f.pilar===p?"selected":""}>${PILARES[p].curto}</option>`).join("")}</select></div>
    <div class="field"><label for="fOrigem">Origem</label><select id="fOrigem" data-act="filtro" data-k="origem">
      <option value="">Todas</option>${S.config.origens.map(o=>`<option ${f.origem===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
  </div>
  <div class="board">${etapas.map(e=>{
    const ls = lista.filter(l=>l.etapa===e.id);
    const total = ls.reduce((a,l)=>a+(Number(l.valorEstimado)||0),0);
    return `<div class="col" data-etapa="${e.id}">
      <div class="col-head"><b>${esc(e.nome)}</b><span class="cnt">${ls.length}</span><span class="val">${brl(total)}</span>
        ${ls.length && ["perdido","ganho"].includes(e.id)
          ? `<button class="btn sm ghost danger" style="padding:1px 6px" data-act="limparEtapa" data-e="${esc(e.id)}" title="Excluir todos os leads desta coluna" aria-label="Limpar coluna ${esc(e.nome)}">×</button>` : ""}</div>
      <div class="col-body">${ls.map(cardLead).join("") || `<div class="hint" style="padding:8px 4px">Arraste um lead para cá.</div>`}</div>
    </div>`;
  }).join("")}</div>`;
}
function cardLead(l){
  const dias = diasEntre(l.ultimoContato||l.criadoEm||hoje(), hoje());
  const t = { quente:"🔥", morno:"🌡️", frio:"❄️" }[l.temperatura] || "";
  return `<article class="lead ${esc(l.pilar)}" draggable="true" data-lead="${esc(l.id)}" tabindex="0" role="button">
    <button class="del" data-act="excluirLead" data-id="${esc(l.id)}" title="Excluir lead" aria-label="Excluir ${esc(l.nome)}">×</button>
    <b>${esc(l.nome)}</b>
    ${l.empresa?`<div class="org">${esc(l.empresa)}</div>`:""}
    <div class="meta">
      <span class="val">${brl(l.valorEstimado)}</span>
      ${l.previsaoFechamento&&!["ganho","perdido"].includes(l.etapa)?`<span class="chip mute" title="Previsão de fechamento">${mesLabel(l.previsaoFechamento.slice(0,7))}</span>`:""}
      ${(()=>{ const c=estimativaLead(l).total; return c?`<span class="chip ok com" title="Comissão estimada">${brl(c)}</span>`:""; })()}
      ${t?`<span class="temp" title="${esc(l.temperatura)}">${t}</span>`:""}
      ${dias>=4 && !["ganho","perdido"].includes(l.etapa) ? `<span class="chip crit">${dias}d parado</span>`:""}
      <span class="chip mute" style="margin-left:auto">${esc(iniciais(nomeUsuario(l.responsavel)))}</span>
    </div>
  </article>`;
}
function ligarKanban(){
  let arrastando=null;
  document.querySelectorAll(".lead").forEach(el=>{
    el.addEventListener("dragstart", e=>{ arrastando=el.dataset.lead; el.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; });
    el.addEventListener("dragend", ()=>{ el.classList.remove("dragging"); arrastando=null; });
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); abrirLead(el.dataset.lead); } });
  });
  document.querySelectorAll(".col").forEach(col=>{
    col.addEventListener("dragover", e=>{ e.preventDefault(); col.classList.add("dragover"); });
    col.addEventListener("dragleave", ()=>col.classList.remove("dragover"));
    col.addEventListener("drop", e=>{
      e.preventDefault(); col.classList.remove("dragover");
      if(!arrastando) return;
      moverLead(arrastando, col.dataset.etapa);
    });
  });
}
async function moverLead(id, etapa){
  const l = S.leads.find(x=>x.id===id); if(!l || l.etapa===etapa) return;
  if(etapa==="ganho"){ abrirConversao(l); return; }
  const de = etapaNome(l.etapa);
  l.etapa=etapa; l.ultimoContato=hoje();
  l.historico = [{data:hoje(), texto:`Etapa alterada de ${de} para ${etapaNome(etapa)}`, autor:S.meNome}, ...(l.historico||[])];
  if(etapa==="perdido"){ fecharModal(); abrirPerda(l); return; }
  await salvar("leads", l, `Moveu para ${etapaNome(etapa)}`);
  toast(`${l.nome} → ${etapaNome(etapa)}`);
}

