/* Erbe · Central — views/equipe.js
   Equipe e metas.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   EQUIPE
   ============================================================ */
function viewEquipe(){
  const mes = mesAtual();
  if(!S.usuarios.length) return vazio("Equipe ainda não formada","Compartilhe o sistema com seus corretores: cada pessoa aparece aqui assim que abrir pela primeira vez.","",'');
  const gestor = S.mePapel==="gestor";
  const pendentes = S.usuarios.filter(u=>statusUsuario(u)==="pendente");
  const bloqueados = S.usuarios.filter(u=>statusUsuario(u)==="bloqueado");
  const ativos = S.usuarios.filter(u=>statusUsuario(u)==="ativo");
  return `
  ${gestor && pendentes.length ? `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip warn">Aguardando liberação</span>
      <div><h3>${pendentes.length} pessoa(s) querendo entrar</h3>
        <div class="sub">Ninguém vê a carteira antes de você liberar</div></div></div>
    <div class="tw"><table><tbody>${pendentes.map(u=>`<tr>
      <td style="width:44px"><span class="avatar">${esc(iniciais(u.nome))}</span></td>
      <td><b>${esc(u.nome)}</b><div class="hint">entrou na fila em ${dt(u.criadoEm)}</div></td>
      <td><select data-act="papelPendente" data-id="${esc(u.id)}" style="padding:5px 8px;font-size:12.5px">
        ${Object.entries(PAPEIS).map(([k,v])=>`<option value="${k}" ${(u.papel||"corretor")===k?"selected":""}>${v}</option>`).join("")}</select>
        <div class="hint">${esc(DESCR_PAPEL[u.papel||"corretor"])}</div></td>
      <td>${S.usuarios.some(x=>x.manual) ? `<select data-act="vinculo" data-id="${esc(u.id)}" style="padding:5px 8px;font-size:12.5px">
          <option value="">Novo cadastro</option>
          ${S.usuarios.filter(x=>x.manual).map(x=>`<option value="${esc(x.id)}">É ${esc(x.nome)}</option>`).join("")}
        </select><div class="hint">vincular a quem já está na equipe</div>` : ""}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn sm primary" data-act="liberarUsuario" data-id="${esc(u.id)}">Liberar</button>
        <button class="btn sm ghost danger" data-act="recusarUsuario" data-id="${esc(u.id)}">Recusar</button></td>
    </tr>`).join("")}</tbody></table></div></section>` : ""}

  ${gestor && bloqueados.length ? `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip crit">Suspensos</span>
      <div><h3>${bloqueados.length} acesso(s) suspenso(s)</h3></div></div>
    <div class="tw"><table><tbody>${bloqueados.map(u=>`<tr>
      <td><b>${esc(u.nome)}</b> <span class="hint">${esc(PAPEIS[u.papel]||"")}</span></td>
      <td class="r"><button class="btn sm" data-act="liberarUsuario" data-id="${esc(u.id)}">Reativar</button></td>
    </tr>`).join("")}</tbody></table></div></section>` : ""}

  ${veCorretora()?painelMetas(ativos, mes):""}
  <div class="hint" style="margin-bottom:14px">Cada pessoa entra na equipe ao abrir o sistema pela primeira vez, ou você inclui pelo botão “+ Membro”. O split define quanto da comissão recebida é repassado ao corretor no contrato que ele assina.</div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  ${(gestor?ativos:ativos.filter(u=>u.id===S.uid||S.mePapel==="gestor")).map(u=>{
    const cs = S.contratos.filter(c=>c.corretor===u.id && c.status!=="cancelado");
    const prodMes = cs.filter(c=>(c.inicio||"").slice(0,7)===mes).reduce((a,c)=>a+comissaoContrato(c),0);
    const prodAno = cs.filter(c=>(c.inicio||"").slice(0,4)===mes.slice(0,4)).reduce((a,c)=>a+comissaoContrato(c),0);
    const ps = parcelas().filter(p=>p.corretor===u.id);
    const ganho = ps.filter(p=>p.status==="recebido").reduce((a,p)=>a+p.valorCorretor,0);
    const aReceber = ps.filter(p=>p.status==="previsto").reduce((a,p)=>a+p.valorCorretor,0);
    const at = u.meta ? prodMes/u.meta*100 : 0;
    return `<section class="panel">
      <div class="panel-head">
        <span class="avatar">${esc(iniciais(u.nome))}</span>
        <div><h3>${esc(u.nome)}${u.id===S.uid?' <span class="chip mute">você</span>':""}</h3>
        <div class="sub"><span class="chip ${u.papel==="gestor"?"ok":u.papel==="assistente"?"info":"mute"}">${esc(PAPEIS[u.papel]||"Corretor")}</span>
          split ${pct(u.splitPct??50)}${u.papel==="corretor"&&u.verTudo?' · <span class="chip info">vê a corretora</span>':""}${u.manual?' · <span class="hint">não acessa o sistema</span>':""}</div></div>
        ${gestor?`<div class="right">
          <button class="btn sm" data-act="editarUsuario" data-id="${esc(u.id)}">Editar</button>
          ${!u.manual && u.id!==S.uid?`<button class="btn sm ghost" data-act="transferirCarteira" data-id="${esc(u.id)}" title="Passar a carteira desta pessoa para outra">Transferir carteira</button>`:""}
          ${u.manual?`<button class="btn sm ghost danger" data-act="excluirMembro" data-id="${esc(u.id)}" aria-label="Remover da equipe">×</button>`:""}</div>`:""}
      </div>
      <div class="chart-wrap">
        <div class="bar-line"><span class="nm">Meta do mês</span>
          <span class="track"><span class="fill" style="width:${Math.min(larg(at,100),100)}%;background:${at>=100?"var(--ok)":at>=60?"var(--gold)":"var(--crit)"}"></span></span>
          <span class="n">${u.meta?pct(at):"sem meta"}</span></div>
        <div class="dl" style="margin-top:12px">
          <div><div class="k">${veCorretora()?"Comissão gerada no mês":"Sua comissão no mês"}</div><div class="v num">${brl(prodMes)}</div></div>
          <div><div class="k">${veCorretora()?"Comissão gerada no ano":"Sua comissão no ano"}</div><div class="v num">${brl(prodAno)}</div></div>
          <div><div class="k">Comissão recebida</div><div class="v num">${brl(ganho)}</div></div>
          <div><div class="k">A receber</div><div class="v num">${brl(aReceber)}</div></div>
        </div>
      </div>
    </section>`;
  }).join("")}</div>`;
}

/** Metas do mês: a da corretora e a soma do que está distribuído entre as pessoas. */
function painelMetas(ativos, mes){
  const gestor = S.mePapel==="gestor";
  const metaCorretora = Number(S.config.metaGlobal)||0;
  const somaIndividual = ativos.reduce((a,u)=>a+(Number(u.meta)||0),0);
  const realizado = S.contratos.filter(c=>c.status!=="cancelado" && (c.inicio||"").slice(0,7)===mes)
    .reduce((a,c)=>a+comissaoContrato(c),0);
  const at = metaCorretora ? realizado/metaCorretora*100 : 0;
  const semMeta = ativos.filter(u=>!(Number(u.meta)>0));
  const diff = somaIndividual - metaCorretora;
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h3>Metas de ${mesLabel(mes)}</h3>
      <div class="sub">Comissão gerada pelos contratos iniciados no mês</div></div></div>
    <div class="chart-wrap">
      <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:14px">
        <div class="field"><label for="mtGlobal">Meta da corretora (R$)</label>
          ${gestor
            ? `<input id="mtGlobal" type="number" step="500" value="${metaCorretora}" data-act="salvarMetaGlobal">`
            : `<div class="v num" style="padding-top:7px;font-size:17px;font-weight:600">${brl(metaCorretora)}</div>`}</div>
        <div><div class="k">Realizado</div><div class="v num" style="font-size:20px;font-weight:600;padding-top:4px">${brl(realizado)}</div>
          <div class="hint">${metaCorretora?`${pct(at)} da meta · faltam ${brl(Math.max(0,metaCorretora-realizado))}`:"defina a meta para acompanhar"}</div></div>
        <div><div class="k">Somatório das metas individuais</div>
          <div class="v num" style="font-size:20px;font-weight:600;padding-top:4px">${brl(somaIndividual)}</div>
          <div class="hint">${!metaCorretora ? "&nbsp;" : diff===0 ? "bate com a meta da corretora"
            : diff>0 ? `<span style="color:var(--ok)">${brl(diff)} acima da meta</span>`
            : `<span style="color:var(--warn)">${brl(-diff)} a distribuir</span>`}</div></div>
      </div>
      <div class="bar-line"><span class="nm" style="width:130px">Corretora</span>
        <span class="track" style="height:13px"><span class="fill" style="width:${Math.min(larg(realizado,metaCorretora||realizado||1),100)}%;background:${at>=100?"var(--ok)":at>=60?"var(--gold)":"var(--accent)"}"></span></span>
        <span class="n" style="width:126px">${brl(realizado)}${metaCorretora?` · ${pct(at)}`:""}</span></div>
      ${semMeta.length?`<div class="ta" style="padding:10px 0 0">${semMeta.length} pessoa(s) ainda sem meta: ${semMeta.map(u=>esc(u.nome)).join(", ")}.</div>`:""}
    </div></section>`;
}

