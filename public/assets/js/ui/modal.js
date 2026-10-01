/* Erbe · Central — ui/modal.js
   Modais e diálogos próprios (confirmar, pedirTexto).
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   MODAIS
   ============================================================ */
/* ---------- diálogos próprios: o sandbox do sistema bloqueia confirm() e prompt() ---------- */
let fecharDialogo = null;
function dialogo(html, aoAbrir){
  return new Promise(resolve=>{
    const scrim = $("#scrim2"), cx = $("#dialogo");
    cx.innerHTML = html;
    scrim.classList.add("open");
    const encerrar = valor => { scrim.classList.remove("open"); cx.innerHTML=""; fecharDialogo=null; resolve(valor); };
    fecharDialogo = () => encerrar(null);
    cx.querySelectorAll("[data-resolve]").forEach(b=>b.addEventListener("click", ()=>encerrar(b.dataset.resolve==="ok")));
    scrim.onmousedown = e => { if(e.target.id==="scrim2") encerrar(null); };
    if(aoAbrir) aoAbrir(cx, encerrar);
  });
}
/** Substitui confirm(): resolve true só no botão de confirmação. */
async function confirmar(titulo, texto, rotulo, perigoso){
  const r = await dialogo(`
    <h3>${esc(titulo)}</h3>
    <p>${esc(texto)}</p>
    <div class="acoes">
      <button class="btn" data-resolve="cancel">Cancelar</button>
      <button class="btn ${perigoso?"danger":"primary"}" data-resolve="ok">${esc(rotulo||"Confirmar")}</button>
    </div>`, cx => { const b=cx.querySelector('[data-resolve="ok"]'); if(b) b.focus(); });
  return r===true;
}
/** Substitui prompt(): resolve o texto digitado, ou null. */
function pedirTexto(titulo, rotulo, inicial, rotuloBotao, tipo){
  return dialogo(`
    <h3>${esc(titulo)}</h3>
    <div class="field"><label for="dlgTxt">${esc(rotulo)}</label>
      <input id="dlgTxt" type="${esc(tipo||"text")}" value="${esc(inicial||"")}" placeholder="${tipo?"":esc(rotuloBotao||"")}"></div>
    <div class="acoes">
      <button class="btn" data-resolve="cancel">Cancelar</button>
      <button class="btn primary" id="dlgOk">${esc(tipo?(rotuloBotao||"Confirmar"):"Adicionar")}</button>
    </div>`, (cx, encerrar) => {
      const campo = cx.querySelector("#dlgTxt");
      const enviar = () => { const v = campo.value.trim(); encerrar(v || null); };
      cx.querySelector("#dlgOk").addEventListener("click", enviar);
      campo.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); enviar(); } });
      setTimeout(()=>campo.focus(), 40);
    });
}
function abrirModal(html, wide){
  $("#modal").className = wide?"wide":"";
  $("#modal").innerHTML = html;
  $("#scrim").classList.add("open");
  const f = $("#modal").querySelector("input,select,textarea");
  // foco imediato: com atraso, quem já começou a digitar tinha o texto jogado em outro campo
  if(f) f.focus({ preventScroll:true });
}
function fecharModal(){ $("#scrim").classList.remove("open"); $("#modal").innerHTML=""; }
$("#scrim").addEventListener("mousedown", e=>{ if(e.target.id==="scrim") fecharModal(); });
document.addEventListener("keydown", e=>{
  if(e.key!=="Escape") return;
  if(fecharDialogo) fecharDialogo(); else fecharModal();
});

const val = id => { const e=document.getElementById(id); return e?e.value.trim():""; };
/** Lê um número de um campo. Campos type="number" já devolvem "189.9";
    só quando há vírgula o ponto é separador de milhar ("1.234,56"). */
function paraNumero(v){
  const t = String(v==null?"":v).trim();
  if(!t) return 0;
  if(t.includes(",")) return Number(t.replace(/\./g,"").replace(",","."))||0;
  return Number(t)||0;
}
const numv = id => { const e=document.getElementById(id); return e?paraNumero(e.value):0; };


/* ---------- erro no próprio campo ----------
   A mensagem aparece colada ao campo (e é lida por leitor de tela), em vez de um
   aviso solto que some em dois segundos. */
function erroCampo(id, msg){
  const campo = document.getElementById(id);
  if(!campo){ toast(msg); return; }
  campo.setAttribute("aria-invalid", "true");
  const idMsg = id + "-erro";
  let el = document.getElementById(idMsg);
  if(!el){
    el = document.createElement("span");
    el.id = idMsg; el.className = "erro-campo"; el.setAttribute("role", "alert");
    (campo.closest(".field") || campo.parentElement).appendChild(el);
  }
  el.textContent = msg;
  campo.setAttribute("aria-describedby", idMsg);
  campo.focus();
  campo.addEventListener("input", function limpa(){ campo.removeAttribute("aria-invalid"); el.remove(); campo.removeEventListener("input", limpa); });
}
function limparErrosCampo(){
  document.querySelectorAll(".erro-campo").forEach(x=>x.remove());
  document.querySelectorAll('[aria-invalid="true"]').forEach(x=>x.removeAttribute("aria-invalid"));
}
