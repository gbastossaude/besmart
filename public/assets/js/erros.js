/* Erbe · Central — erros.js
   Tratamento global de erros, aviso fixo (banner) e registro técnico.
   O usuário vê uma frase simples; o detalhe técnico vai para o console e,
   quando a migration 0003 está aplicada, para a tabela erros_app do Supabase
   (só o gestor lê). Nada de dado de cliente vai junto: só mensagem, pilha,
   tela, operação, versão e quem estava usando.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";

const APP_VERSAO = "2.0.0";

/** Aviso fixo no topo. Fica até a pessoa fechar ou até o problema passar. */
function banner(txt){
  const b = $("#banner"); if(!b) return;
  b.hidden = false;
  b.innerHTML = `<span aria-hidden="true">⚠</span> <span class="banner-txt">${esc(txt)}</span>
    <button class="banner-x" type="button" data-act="fecharBanner" aria-label="Fechar aviso">×</button>`;
}
function limparBanner(){ const b = $("#banner"); if(b){ b.hidden = true; b.innerHTML = ""; } }

const ERROS_ENVIADOS = new Set();
let errosNaSessao = 0;
/** Registra um erro técnico com contexto suficiente para alguém investigar depois. */
function registrarErro(e, ctx){
  const registro = {
    quando: new Date().toISOString(),
    versao: APP_VERSAO,
    pagina: (typeof S!=="undefined" && S.view) || "",
    operacao: (ctx && ctx.operacao) || "",
    usuario: (typeof S!=="undefined" && S.uid) || "",
    mensagem: String((e && (e.message || e.reason || e)) || "erro desconhecido").slice(0, 500),
    pilha: String((e && e.stack) || "").slice(0, 2000)
  };
  console.error("[erbe]", registro.operacao || "erro", registro, e);
  enviarErro(registro);
  return registro;
}
/** Manda para o banco no máximo 20 erros distintos por sessão. Falhar aqui é silencioso. */
function enviarErro(r){
  try{
    if(typeof S==="undefined" || !S.db || !S.uid) return;
    const chave = r.operacao + "|" + r.mensagem;
    if(ERROS_ENVIADOS.has(chave) || errosNaSessao >= 20) return;
    ERROS_ENVIADOS.add(chave); errosNaSessao++;
    S.db.from("erros_app").insert({ pagina:r.pagina, operacao:r.operacao, mensagem:r.mensagem, pilha:r.pilha,
      versao:r.versao, agente:String(navigator.userAgent||"").slice(0,200) }).then(()=>{}, ()=>{});
  }catch(err){ /* registro de erro nunca derruba nada */ }
}

let ultimoAvisoErro = 0;
function avisarErroInesperado(){
  if(Date.now() - ultimoAvisoErro < 8000) return;
  ultimoAvisoErro = Date.now();
  if(typeof toast==="function") toast("Algo não saiu como esperado. Se continuar, recarregue a página.");
}
window.addEventListener("error", ev=>{
  // erro de carregamento de recurso (imagem, script) não tem ev.error
  if(!ev.error && !ev.message) return;
  registrarErro(ev.error || ev.message, { operacao:"erro não tratado" });
  avisarErroInesperado();
});
window.addEventListener("unhandledrejection", ev=>{
  registrarErro(ev.reason, { operacao:"promessa não tratada" });
  avisarErroInesperado();
});

/* Conexão: avisa quando cai e quando volta. As gravações feitas sem rede falham
   e são desfeitas na tela (ver dados.js), então o aviso precisa ser claro. */
window.addEventListener("offline", ()=>banner("Sem conexão com a internet. O que você alterar agora não será salvo."));
window.addEventListener("online", ()=>{
  limparBanner();
  if(typeof toast==="function") toast("Conexão de volta");
  if(typeof S!=="undefined" && S.db && S.uid && typeof carregarTudo==="function") carregarTudo();
});
