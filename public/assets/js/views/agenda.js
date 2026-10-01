/* Erbe · Central — views/agenda.js
   Agenda de tarefas.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   AGENDA
   ============================================================ */
function viewTarefas(){
  const ts = S.tarefas.filter(t=>noEscopo(t)).sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
  const abertas = ts.filter(t=>t.status!=="feita");
  const feitas = ts.filter(t=>t.status==="feita").slice(-25).reverse();
  if(!ts.length) return vazio("Agenda vazia","Cada follow-up combinado com um lead ou cliente pode virar uma tarefa com data.","novaTarefa","Criar tarefa");
  const grupos = [
    { rot:"Atrasadas", cls:"crit", ts:abertas.filter(t=>t.vence<hoje()) },
    { rot:"Hoje", cls:"warn", ts:abertas.filter(t=>t.vence===hoje()) },
    { rot:"Próximos 7 dias", cls:"info", ts:abertas.filter(t=>t.vence>hoje() && t.vence<=addDays(hoje(),7)) },
    { rot:"Depois", cls:"mute", ts:abertas.filter(t=>t.vence>addDays(hoje(),7)) }
  ];
  return grupos.filter(g=>g.ts.length).map(g=>`
    <section class="panel" style="margin-bottom:14px">
      <div class="panel-head"><span class="chip ${g.cls}">${esc(g.rot)}</span><div><h3>${g.ts.length} tarefa${g.ts.length!==1?"s":""}</h3></div></div>
      <div class="tw"><table><tbody>${g.ts.map(t=>`<tr>
        <td style="width:34px"><button class="btn sm ghost" data-act="concluirTarefa" data-id="${esc(t.id)}" title="Concluir" aria-label="Concluir tarefa">○</button></td>
        <td><b>${esc(t.titulo)}</b>${t.refNome?`<div class="hint">${esc(t.refNome)}</div>`:""}${t.adiada?`<div class="hint">adiada ${t.adiada}x</div>`:""}</td>
        <td><span class="chip mute">${esc(t.tipo||"Follow-up")}</span></td>
        <td class="num">${dt(t.vence)}</td>
        <td>${esc(nomeUsuario(t.responsavel))}</td>
        <td class="r" style="white-space:nowrap">
          <button class="btn sm" data-act="adiarTarefa" data-id="${esc(t.id)}">Adiar</button>
          <button class="btn sm ghost" data-act="editarTarefa" data-id="${esc(t.id)}" title="Editar tarefa" aria-label="Editar tarefa">✎</button>
          <button class="btn sm ghost danger" data-act="excluirTarefa" data-id="${esc(t.id)}" title="Excluir tarefa" aria-label="Excluir tarefa">×</button></td>
      </tr>`).join("")}</tbody></table></div>
    </section>`).join("") + (feitas.length?`
    <section class="panel"><div class="panel-head"><div><h3>Concluídas</h3><div class="sub">Últimas ${feitas.length}</div></div></div>
      <div class="tw"><table><tbody>${feitas.map(t=>`<tr>
        <td style="width:34px;color:var(--ok)">●</td>
        <td style="color:var(--ink-3);text-decoration:line-through">${esc(t.titulo)}</td>
        <td class="num" style="color:var(--ink-3)">${dt(t.vence)}</td>
        <td class="r"><button class="btn sm ghost" data-act="reabrirTarefa" data-id="${esc(t.id)}">Reabrir</button></td>
      </tr>`).join("")}</tbody></table></div></section>`:"");
}

