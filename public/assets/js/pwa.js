/* Erbe · Central — pwa.js
   Instalação como aplicativo (celular e computador) e registro do service worker.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";

if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js").catch(e=>registrarErro(e, { operacao:"registrar service worker" }));
  });
}

/* Botão "Instalar" aparece só quando o navegador oferece a instalação. */
let pedidoInstalacao = null;
window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault();
  pedidoInstalacao = e;
  const b = document.getElementById("instalarBtn");
  if(b) b.hidden = false;
});
window.addEventListener("appinstalled", ()=>{
  pedidoInstalacao = null;
  const b = document.getElementById("instalarBtn"); if(b) b.hidden = true;
  if(typeof toast==="function") toast("Erbe instalado — abra pelo ícone");
});
async function instalarApp(){
  if(!pedidoInstalacao) return;
  pedidoInstalacao.prompt();
  await pedidoInstalacao.userChoice;
  pedidoInstalacao = null;
  const b = document.getElementById("instalarBtn"); if(b) b.hidden = true;
}

/** Atalhos do ícone instalado (?tela=clientes) e links diretos abrem na tela certa. */
function telaInicialDaUrl(){
  try{
    const t = new URLSearchParams(location.search).get("tela");
    if(t && typeof VIEWS!=="undefined" && VIEWS.some(v=>v.id===t)) return t;
  }catch(e){ /* URL estranha: abre o painel */ }
  return null;
}
