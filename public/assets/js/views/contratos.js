/* Erbe · Central — views/contratos.js
   Lista de contratos.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   CONTRATOS
   ============================================================ */
function viewContratos(){
  const f=S.filtros, busca=S.busca.toLowerCase();
  const lista = S.contratos.filter(c=>noEscopo(c,"corretor"))
    .filter(c=>!f.pilar || c.pilar===f.pilar)
    .filter(c=>!f.status || c.status===f.status)
    .filter(c=>!f.operadora || c.operadora===f.operadora)
    .filter(c=>!busca || (c.clienteNome+" "+(c.numero||"")+" "+(c.operadora||"")).toLowerCase().includes(busca))
    .sort((a,b)=>(b.inicio||"").localeCompare(a.inicio||""));
  if(!S.contratos.length) return vazio("Nenhum contrato registrado","Cada contrato gera automaticamente o cronograma de comissão conforme a régua da operadora.","novoContrato","Registrar contrato");
  const operadoras = [...new Set(S.contratos.map(c=>c.operadora).filter(Boolean))].sort();
  const totalBase = lista.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const totalCom = lista.reduce((a,c)=>a+comissaoContrato(c),0);
  const POR_PAGINA_CTR = 80;
  const ctrFatia = lista.slice(0, (S.pagContratos||1)*POR_PAGINA_CTR);
  return `
  <div class="filters">
    <div class="field" style="flex:1;min-width:200px"><label for="ctBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="ctBusca" type="text" placeholder="Cliente, nº da proposta, operadora" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field"><label for="ctPilar">Pilar</label><select id="ctPilar" data-act="filtro" data-k="pilar"><option value="">Todos</option>${PK.map(p=>`<option value="${p}" ${f.pilar===p?"selected":""}>${PILARES[p].curto}</option>`).join("")}</select></div>
    <div class="field"><label for="ctStatus">Situação</label><select id="ctStatus" data-act="filtro" data-k="status"><option value="">Todas</option>${Object.entries(STATUS_CONTRATO).map(([k,v])=>`<option value="${k}" ${f.status===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
    <div class="field"><label for="ctOp">Operadora</label><select id="ctOp" data-act="filtro" data-k="operadora"><option value="">Todas</option>${operadoras.map(o=>`<option ${f.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
  </div>
  <div class="panel">
    <div class="panel-head"><div><h3>${lista.length.toLocaleString("pt-BR")} contrato${lista.length!==1?"s":""}</h3>
      <div class="sub">${brl(totalBase)} em base de cálculo · ${brl(lista.reduce((a,c)=>a+(Number(c.valorTotal)||0),0))} em valor de contrato<span class="com"> · ${brl(totalCom)} de comissão${veCorretora()?" gerada":" sua"}</span>${ctrFatia.length<lista.length?` · mostrando ${ctrFatia.length}`:""}</div></div>
      <div class="right"><button class="btn sm" data-act="baixarRel" data-tipo="contratos">Baixar Excel / PDF</button></div></div>
    <div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Produto</th><th>Operadora</th><th class="r">Base</th><th class="r">Valor do contrato</th><th class="r com">${veCorretora()?"Comissão":"Sua comissão"}</th><th>Vigência</th><th>Situação</th><th>Corretor</th><th></th></tr></thead>
      <tbody>${ctrFatia.map(c=>{
        const com = comissaoContrato(c);
        const st = STATUS_CONTRATO[c.status]||STATUS_CONTRATO.proposta;
        return `<tr class="clickable" data-act="abrirContrato" data-id="${esc(c.id)}">
          <td><b>${esc(c.clienteNome)}</b>${c.numero?`<div class="hint num">nº ${esc(c.numero)}</div>`:""}</td>
          <td><span class="chip ${esc(c.pilar)}">${esc(PILARES[c.pilar].curto)}</span> <span class="hint">${esc(c.produto||"")}</span></td>
          <td>${esc(c.operadora||"—")}</td>
          <td class="r num">${brl(c.valorBase)}${totalVidas(c)?`<div class="hint">${totalVidas(c)} vida${totalVidas(c)!==1?"s":""}${contratoTemVida(c)&&!vidasDetalhadas(c)?" (a detalhar)":""}</div>`:""}</td>
          <td class="r num">${c.valorTotal?brl(c.valorTotal):`<span class="hint">—</span>`}</td>
          <td class="r num com">${brl(com)}</td>
          <td class="num">${dt(c.inicio)}${c.fim?`<div class="hint num">até ${dt(c.fim)}</div>`:""}</td>
          <td><span class="chip ${st.cls}">${st.nome}</span></td>
          <td>${esc(iniciais(nomeUsuario(c.corretor)))}</td>
          <td class="r" style="white-space:nowrap">
            <button class="btn sm ghost" data-act="editarContrato" data-id="${esc(c.id)}" title="Editar contrato" aria-label="Editar contrato de ${esc(c.clienteNome)}">✎</button>
            ${podeExcluirCarteira()?`<button class="btn sm ghost danger" data-act="excluirContrato" data-id="${esc(c.id)}" title="Excluir contrato" aria-label="Excluir contrato de ${esc(c.clienteNome)}">×</button>`:""}
          </td>
        </tr>`;
      }).join("") || `<tr><td colspan="8" class="empty">Nenhum contrato com esses filtros.</td></tr>`}</tbody>
    </table></div>
    ${ctrFatia.length < lista.length?`<div class="ta"><button class="btn" data-act="maisContratos">Mostrar mais ${Math.min(POR_PAGINA_CTR, lista.length-ctrFatia.length)} de ${lista.length.toLocaleString("pt-BR")}</button></div>`:""}
  </div>`;
}

