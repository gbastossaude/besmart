/* Erbe · Central — ui/layout.js
   Comportamento de layout que vale para todas as telas:
   - celular: barra de atalhos embaixo e menu completo em gaveta;
   - tabelas viram cartões no celular (cada célula ganha o rótulo da coluna).
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";

function abrirMenu(){
  document.body.classList.add("menu-aberto");
  document.querySelectorAll('[data-act="abrirMenu"]').forEach(b=>b.setAttribute("aria-expanded","true"));
  const atual = document.querySelector('#nav [aria-current="true"]') || document.querySelector("#nav button");
  if(atual) atual.focus();
}
function fecharMenu(){
  if(!document.body.classList.contains("menu-aberto")) return false;
  document.body.classList.remove("menu-aberto");
  document.querySelectorAll('[data-act="abrirMenu"]').forEach(b=>b.setAttribute("aria-expanded","false"));
  return true;
}
// escolher uma tela no menu fecha a gaveta
document.getElementById("nav").addEventListener("click", e=>{ if(e.target.closest("[data-view]")) fecharMenu(); });
document.getElementById("tabbar").addEventListener("click", e=>{
  const b = e.target.closest("[data-view]"); if(!b) return;
  fecharMenu(); ir(b.dataset.view);
});
document.addEventListener("keydown", e=>{ if(e.key==="Escape" && fecharMenu()) e.stopPropagation(); }, true);

/** Copia o título de cada coluna para as células (data-rot): no celular a tabela
    vira uma lista de cartões e cada valor aparece com o seu rótulo. */
function cardificarTabelas(raiz){
  (raiz || document).querySelectorAll(".tw table").forEach(t=>{
    const ths = [...t.querySelectorAll("thead th")].map(th=>th.textContent.trim());
    if(!ths.length) return;
    t.classList.add("cardavel");
    t.querySelectorAll("tbody tr").forEach(tr=>{
      let i = 0;
      for(const td of tr.children){
        if(td.colSpan > 1){ td.classList.add("td-cheia"); i += td.colSpan; continue; }
        if(ths[i]) td.dataset.rot = ths[i];
        i++;
      }
    });
  });
}
