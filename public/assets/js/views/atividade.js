/* Erbe · Central — views/atividade.js
   Atividade da equipe.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   ATIVIDADE DA EQUIPE
   ============================================================ */
/** As mudanças de um registro que quem olha pode ver: o valor do cronograma
    de comissão é informação da corretora. */
const mudVisiveis = r => (r.mudancas||[]).filter(m=> m.campo!=="comissoes" || veCorretora());
function viewAtividade(){
  const f = S.filtros;
  // Quem não é gestor vê só o que ele mesmo fez — como na versão Supabase,
  // onde o banco já aplica essa regra. Despesa é assunto do gestor.
  const ATIV = S.mePapel==="gestor" ? S.atividade
    : S.atividade.filter(r=>r.quem===S.uid && r.colecao!=="despesas");
  let regs = ATIV.slice().sort((a,b)=>(b.quando||"").localeCompare(a.quando||""));
  if(f.quem) regs = regs.filter(r=>r.quem===f.quem);
  if(f.colecao) regs = regs.filter(r=>r.colecao===f.colecao);
  if(!S.online) return vazio("Registro indisponível fora do sistema compartilhado",
    "A trilha de atividade é gravada no banco compartilhado e só aparece quando o sistema é aberto pelo link da Central.","","");
  if(!ATIV.length) return vazio("Nenhuma movimentação registrada ainda",
    "A partir de agora, toda criação, alteração e conciliação feita por qualquer pessoa da equipe aparece aqui com autor e horário.","","");

  const pessoas = [...new Map(ATIV.map(r=>[r.quem, r.quemNome||nomeUsuario(r.quem)])).entries()];
  const hojeStr = hoje();
  const porDia = {};
  regs.slice(0,200).forEach(r=>{ const d=(r.quando||"").slice(0,10); (porDia[d]=porDia[d]||[]).push(r); });

  const ativosHoje = new Set(ATIV.filter(r=>(r.quando||"").slice(0,10)===hojeStr).map(r=>r.quem)).size;
  return `
  <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
    <div class="stat"><div class="k">Movimentações hoje</div>
      <div class="v">${ATIV.filter(r=>(r.quando||"").slice(0,10)===hojeStr).length}</div>
      <div class="d">${ativosHoje} pessoa${ativosHoje!==1?"s":""} trabalhando no sistema</div></div>
    <div class="stat"><div class="k">Últimos 7 dias</div>
      <div class="v">${ATIV.filter(r=>(r.quando||"").slice(0,10)>=addDays(hojeStr,-7)).length}</div>
      <div class="d">${ATIV.length} carregados na tela · o banco guarda o histórico inteiro</div></div>
    <div class="stat"><div class="k">Última movimentação</div>
      <div class="v" style="font-size:17px">${esc(quandoRel(regs[0]?.quando))}</div>
      <div class="d">${esc(regs[0]?.quemNome||"—")}</div></div>
  </div>
  <div class="filters">
    <div class="field"><label for="atQuem">Pessoa</label><select id="atQuem" data-act="filtro" data-k="quem">
      <option value="">Todo mundo</option>
      ${pessoas.map(([id,nome])=>`<option value="${esc(id)}" ${f.quem===id?"selected":""}>${esc(nome)}</option>`).join("")}</select></div>
    <div class="field"><label for="atTipo">Registro</label><select id="atTipo" data-act="filtro" data-k="colecao">
      <option value="">Todos</option>
      ${Object.entries(ROTULO_COL).filter(([k])=>k!=="usuarios").map(([k,v])=>`<option value="${k}" ${f.colecao===k?"selected":""}>${esc(v)}</option>`).join("")}</select></div>
  </div>
  ${Object.entries(porDia).map(([dia,rs])=>`
    <section class="panel" style="margin-bottom:14px">
      <div class="panel-head"><span class="chip ${dia===hojeStr?"ok":"mute"}">${dia===hojeStr?"Hoje":dt(dia)}</span>
        <div><h3>${rs.length} ${rs.length===1?"movimentação":"movimentações"}</h3></div></div>
      <div class="tw"><table><tbody>${rs.map(r=>`<tr class="${r.alvoId&&r.colecao!=="tarefas"?"clickable":""}"
          ${r.colecao==="leads"?`data-act="abrirLeadSeExiste" data-id="${esc(r.alvoId)}"`:""}
          ${r.colecao==="clientes"?`data-act="abrirClienteSeExiste" data-id="${esc(r.alvoId)}"`:""}
          ${r.colecao==="contratos"?`data-act="abrirContratoSeExiste" data-id="${esc(r.alvoId)}"`:""}>
        <td style="width:40px"><span class="avatar" title="${esc(r.quemNome||"")}">${esc(iniciais(r.quemNome||"?"))}</span></td>
        <td><b>${esc(r.quemNome||"Alguém")}</b> <span style="color:var(--ink-2)">${esc(minuscInicial(r.evento||"alterou"))}</span></td>
        <td><span class="chip mute">${esc(r.tipo||"")}</span> ${esc(r.alvo||"")}
          ${mudVisiveis(r).length?`<div class="mudancas">${mudVisiveis(r).map(m=>`
            <span class="mud"><b>${esc(m.rotulo)}</b>
              <s>${esc(m.de||"vazio")}</s>
              <span aria-hidden="true">→</span>
              <i>${esc(m.para||"vazio")}</i></span>`).join("")}</div>`:""}</td>
        <td class="r num" style="color:var(--ink-3);white-space:nowrap">${esc(horaDe(r.quando))} · ${esc(quandoRel(r.quando))}</td>
      </tr>`).join("")}</tbody></table></div>
    </section>`).join("")}`;
}

