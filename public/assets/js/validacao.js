/* Erbe · Central — validacao.js
   Documentos (CPF, CNPJ numérico e o CNPJ alfanumérico da Receita, em vigor
   desde julho de 2026), telefone e e-mail: validação e máscara enquanto digita.
   Funções puras — testadas em tests/unit/validacao.test.mjs.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";

/** Documento normalizado: só letras e números, em maiúsculas. Nunca descarta
    letra — o CNPJ alfanumérico tem letras nas 12 primeiras posições. */
const normDoc = v => String(v||"").toUpperCase().replace(/[^0-9A-Z]/g, "");

function cpfValido(v){
  const d = normDoc(v);
  if(!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = n => { let s = 0; for(let i=0;i<n;i++) s += Number(d[i])*(n+1-i); const r = (s*10)%11; return r===10 ? 0 : r; };
  return dv(9)===Number(d[9]) && dv(10)===Number(d[10]);
}
/** CNPJ: 12 posições alfanuméricas + 2 dígitos verificadores numéricos.
    Cada caractere vale (código ASCII − 48): "0"–"9" valem 0–9, "A" vale 17... */
function cnpjValido(v){
  const d = normDoc(v);
  if(!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const val = c => c.charCodeAt(0) - 48;
  const dv = n => {
    const pesos = n===12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let s = 0; for(let i=0;i<n;i++) s += val(d[i])*pesos[i];
    const r = s % 11; return r < 2 ? 0 : 11 - r;
  };
  return dv(12)===Number(d[12]) && dv(13)===Number(d[13]);
}
/** "" (vazio é permitido), "cpf", "cnpj" ou null quando inválido. */
function tipoDocValido(v){
  const d = normDoc(v);
  if(!d) return "";
  if(d.length===11 && cpfValido(d)) return "cpf";
  if(d.length===14 && cnpjValido(d)) return "cnpj";
  return null;
}
/** Máscara progressiva: 000.000.000-00 até 11 caracteres, 00.000.000/0000-00 depois. */
function formatarDoc(v){
  const d = normDoc(v).slice(0, 14);
  if(d.length <= 11 && /^\d*$/.test(d)){
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d.replace(/^(\w{2})(\w)/, "$1.$2").replace(/^(\w{2})\.(\w{3})(\w)/, "$1.$2.$3")
          .replace(/^(\w{2})\.(\w{3})\.(\w{3})(\w)/, "$1.$2.$3/$4").replace(/\/(\w{4})(\d{1,2})$/, "/$1-$2");
}
/** (11) 99999-9999 · (11) 3333-4444 · aceita +55 colado. */
function formatarTelefone(v){
  let d = String(v||"").replace(/\D/g, "");
  if(d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if(d.length <= 2) return d ? `(${d}` : "";
  if(d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if(d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
const telefoneValido = v => { const d = String(v||"").replace(/\D/g,"").replace(/^55(?=\d{10,11}$)/, ""); return !d || d.length===10 || d.length===11; };
const emailValido = v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());

/* Máscara enquanto digita: qualquer campo com data-mascara="doc" ou "telefone". */
document.addEventListener("input", e=>{
  const el = e.target;
  if(!el || !el.dataset || !el.dataset.mascara) return;
  const fmt = el.dataset.mascara==="doc" ? formatarDoc : el.dataset.mascara==="telefone" ? formatarTelefone : null;
  if(!fmt) return;
  const antes = el.value, novo = fmt(antes);
  if(novo !== antes){
    const noFim = el.selectionStart === antes.length;
    el.value = novo;
    if(noFim) try{ el.setSelectionRange(novo.length, novo.length); }catch(err){ /* campo sem seleção */ }
  }
});
