/* Erbe · Central — lembrete.js
   Pop-up de lembrete de tarefas e aniversários.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ---------- lembrete de tarefas (pop-up) ---------- */
const CHAVE_SONECA = "erbe-lembrete-soneca";
let sonecaMem = "";
function soneca(){ try{ return localStorage.getItem(CHAVE_SONECA)||sonecaMem; }catch(e){ return sonecaMem; } }
function adiarAviso(minutos){
  const ate = new Date(Date.now()+minutos*60000).toISOString();
  sonecaMem = ate; try{ localStorage.setItem(CHAVE_SONECA, ate); }catch(e){}
  const el = document.getElementById("lembrete"); if(el) el.classList.remove("show");
}
/** Tarefas que merecem aviso: minhas, abertas, vencendo hoje ou já vencidas. */
function tarefasParaLembrar(){
  return (S.tarefas||[])
    .filter(t=>t.status!=="feita" && (t.vence||"") <= hoje()
               && (t.responsavel===S.uid || !t.responsavel))
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
}
function mostrarLembrete(forcar){
  const el = document.getElementById("lembrete"); if(!el) return;
  const s = soneca();
  if(!forcar && s && new Date(s) > new Date()){ el.classList.remove("show"); return; }
  const ts = tarefasParaLembrar();
  const an = S.config ? aniversariosParaLembrar() : [];
  if(!ts.length && !an.length){ el.classList.remove("show"); el.innerHTML=""; return; }
  const atrasadas = ts.filter(t=>t.vence < hoje()).length;
  const anHoje = an.filter(x=>x.dias===0).length;
  const nT = an.length ? 2 : 3;
  el.innerHTML = `
    <div class="lb-head">
      ${ts.length ? `<span class="chip ${atrasadas?"crit":"warn"}">${atrasadas?"Atrasada"+(atrasadas>1?"s":""):"Hoje"}</span>` : `<span class="chip info">Aniversário</span>`}
      <b>${ts.length ? `${ts.length} tarefa${ts.length!==1?"s":""} esperando você` : `${an.length} aniversário${an.length!==1?"s":""} ${anHoje===an.length?"hoje":"chegando"}`}</b>
      <button class="lb-x" data-act="fecharLembrete" title="Fechar" aria-label="Fechar lembrete">×</button>
    </div>
    ${ts.slice(0,nT).map(t=>`<div class="lb-item">
      <div class="t">${esc(t.titulo)}</div>
      <div class="hint">${esc(t.tipo||"Follow-up")}${t.refNome?" · "+esc(t.refNome):""} · ${t.vence<hoje()?`venceu ${dt(t.vence)}`:"vence hoje"}</div>
      <div class="lb-acoes">
        <button class="btn sm primary" data-act="concluirTarefa" data-id="${esc(t.id)}">Feita</button>
        <button class="btn sm" data-act="adiarDias" data-id="${esc(t.id)}" data-d="1">Amanhã</button>
        <button class="btn sm ghost" data-act="adiarTarefa" data-id="${esc(t.id)}">Outra data</button>
      </div></div>`).join("")}
    ${ts.length>nT?`<div class="hint" style="padding-top:8px">e mais ${ts.length-nT} na agenda.</div>`:""}
    ${an.length?`${ts.length?`<div class="lb-sec">Aniversários</div>`:""}
      ${an.slice(0,3).map(x=>`<div class="lb-item">
        <div class="t">${esc(x.quem==="contato"?x.nome:x.c.nome)}</div>
        <div class="hint">${esc(descAniv(x))} · ${x.dias===0?"<b>hoje</b>":esc(quandoAniv(x))}</div>
        <div class="lb-acoes">${botoesAniv(x)}</div></div>`).join("")}
      ${an.length>3?`<div class="hint" style="padding-top:8px">e mais ${an.length-3} — veja em Clientes.</div>`:""}`:""}
    <div class="lb-pe">
      ${ts.length?`<button class="btn sm" data-act="irAgenda">Abrir agenda</button>`:`<button class="btn sm" data-act="irFiltro" data-view="clientes" data-f="{}">Ver clientes</button>`}
      <button class="btn sm ghost" data-act="soneca" data-min="60">Lembrar em 1h</button>
      <button class="btn sm ghost" data-act="soneca" data-min="600">Hoje não</button>
    </div>`;
  el.classList.add("show");
}
function ligarLembrete(){
  mostrarLembrete();
  setInterval(()=>mostrarLembrete(), 60000);
}

function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2400); }

