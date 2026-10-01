/* Erbe · Central — busca.js
   Busca global (Ctrl+K, ⌘K ou "/"): encontra cliente, CPF/CNPJ, telefone, e-mail,
   contrato, nº de proposta, apólice, grupo/cota, lead, vida, tarefa e pessoa da
   equipe — e também telas e ações ("novo cliente", "comissões"...).
   Procura no que já está carregado (e que a RLS deixou chegar): é instantânea e
   não gera consulta ao banco.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";

/** Minúsculas e sem acento: "São Paulo" acha "sao paulo". */
const semAcento = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let BUSCA_IDX = null, BUSCA_IDX_REF = null;
/** Índice de busca: refeito só quando os dados mudam (mesmo ciclo dos índices em memória). */
function indiceBusca(){
  const ref = indices();
  if(BUSCA_IDX && BUSCA_IDX_REF===ref && BUSCA_IDX.n===S.tarefas.length+S.leads.length+S.usuarios.length) return BUSCA_IDX.itens;
  const itens = [];
  const add = (grupo, o, titulo, sub, campos, abrir) => {
    const texto = semAcento(campos.filter(Boolean).join(" "));
    const digitos = campos.filter(Boolean).join(" ").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    itens.push({ grupo, id:o.id, titulo, sub, texto, digitos, tituloN:semAcento(titulo), abrir });
  };
  for(const c of S.clientes) add("Clientes", c, c.nome||"(sem nome)",
    [c.tipo, c.doc ? (S.mePapel==="gestor" ? c.doc : mascararDoc(c.doc)) : "", c.cidade].filter(Boolean).join(" · "),
    [c.nome, c.doc, c.telefone, c.whatsapp, c.email, c.contatoNome, c.cidade], ()=>abrirCliente(c.id));
  for(const k of S.contratos) add("Contratos", k, `${k.clienteNome||"—"} · ${k.operadora||""}`,
    [PILARES[k.pilar] ? PILARES[k.pilar].curto : "", k.produto, k.numero ? "nº "+k.numero : "", k.apolice ? "apólice "+k.apolice : "",
     (STATUS_CONTRATO[k.status]||{}).nome].filter(Boolean).join(" · "),
    [k.clienteNome, k.numero, k.apolice, k.operadora, k.produto, k.grupo, k.cota], ()=>abrirContrato(k.id));
  for(const l of S.leads) add("Leads", l, l.nome||"(sem nome)",
    [l.empresa, etapaNome(l.etapa), l.telefone].filter(Boolean).join(" · "),
    [l.nome, l.empresa, l.telefone, l.email], ()=>abrirLead(l.id));
  for(const v of (S.vidas||[])) add("Vidas", v, v.nome||"(sem nome)",
    [TIPO_VIDA[v.tipo]||"", (contratoPorId(v.contratoId)||{}).clienteNome||"", SV(v.status).nome].filter(Boolean).join(" · "),
    [v.nome, v.doc], ()=>abrirModal(formVida(v)));
  for(const t of S.tarefas.filter(t=>t.status!=="feita")) add("Tarefas", t, t.titulo||"(sem título)",
    [t.tipo, t.refNome, t.vence ? "vence "+dt(t.vence) : ""].filter(Boolean).join(" · "),
    [t.titulo, t.refNome], ()=>abrirModal(formTarefa(t)));
  if(podeVer("equipe")) for(const u of S.usuarios) add("Equipe", u, u.nome, [PAPEIS[u.papel]||"", u.email].filter(Boolean).join(" · "),
    [u.nome, u.email], ()=>ir("equipe"));
  BUSCA_IDX_REF = ref;
  BUSCA_IDX = { itens, n:S.tarefas.length+S.leads.length+S.usuarios.length };
  return itens;
}

/** Atalhos: telas e ações, para fazer qualquer coisa sem tirar a mão do teclado. */
function comandosBusca(){
  const out = VIEWS.filter(v=>v.id && podeVer(v.id)).map(v=>({ grupo:"Ir para", id:"ir-"+v.id, titulo:v.nome,
    sub:(TITULOS[v.id]||[])[1]||"", texto:semAcento(v.nome+" "+((TITULOS[v.id]||[])[1]||"")), tituloN:semAcento(v.nome), digitos:"", abrir:()=>ir(v.id) }));
  const acao = (titulo, chave, fn) => out.push({ grupo:"Ações", id:"a-"+chave, titulo, sub:"", texto:semAcento(titulo+" "+chave), tituloN:semAcento(titulo), digitos:"", abrir:fn });
  acao("Novo cliente", "cadastrar cliente", ()=>abrirModal(formCliente()));
  acao("Novo lead", "cadastrar lead oportunidade", ()=>abrirModal(formLead(), true));
  acao("Novo contrato", "registrar contrato proposta apolice", ()=>abrirModal(formContrato(null), true));
  acao("Nova tarefa", "agendar follow-up lembrete", ()=>abrirModal(formTarefa()));
  if(S.mePapel==="gestor") acao("Nova despesa", "lancar gasto", ()=>abrirModal(formDespesa()));
  acao("Baixar relatório", "excel pdf exportar", ()=>abrirRelatorio("carteira", {}));
  return out;
}

/** Pontua um item: começo do título > palavra do título > qualquer campo > documento/telefone. */
function pontuar(item, termos, digitosQ){
  let total = 0;
  for(const t of termos){
    if(item.tituloN.startsWith(t)) total += 6;
    else if(item.tituloN.includes(" "+t)) total += 4;
    else if(item.texto.includes(t)) total += 2;
    else return 0;
  }
  return total;
}
function buscarGlobal(q){
  const qn = semAcento(q).trim();
  if(!qn) return [];
  const termos = qn.split(/\s+/).filter(Boolean);
  const digitosQ = q.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const soDoc = /\d{3,}/.test(digitosQ) && digitosQ.length >= 3 && /^[\d.\-/()\s+A-Za-z]*$/.test(q) && /\d/.test(q);
  const res = [];
  for(const it of comandosBusca().concat(indiceBusca())){
    let p = pontuar(it, termos, digitosQ);
    if(!p && soDoc && it.digitos.includes(digitosQ)) p = 3;
    if(p) res.push({ it, p });
  }
  res.sort((a,b)=>b.p-a.p || a.it.titulo.localeCompare(b.it.titulo, "pt-BR"));
  // no máximo 6 por grupo, 40 no total: é para achar, não para listar
  const porGrupo = {}, final = [];
  for(const r of res){
    porGrupo[r.it.grupo] = (porGrupo[r.it.grupo]||0) + 1;
    if(porGrupo[r.it.grupo] <= 6) final.push(r.it);
    if(final.length >= 40) break;
  }
  return final;
}

/* ---------- a janela de busca ---------- */
let buscaSel = 0, buscaRes = [], buscaFocoAntes = null, buscaTermo = null;
function abrirBusca(){
  if(document.getElementById("app").hidden) return;
  let cx = document.getElementById("buscaGlobal");
  if(!cx){
    cx = document.createElement("div");
    cx.id = "buscaGlobal";
    cx.innerHTML = `<div class="bg-caixa" role="dialog" aria-modal="true" aria-label="Busca global">
      <div class="bg-campo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="bgInput" type="search" placeholder="Buscar cliente, CPF/CNPJ, telefone, proposta, lead, vida…" autocomplete="off"
          role="combobox" aria-expanded="true" aria-controls="bgLista" aria-autocomplete="list">
        <kbd>Esc</kbd></div>
      <div id="bgLista" role="listbox"></div>
      <div class="bg-pe"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> de qualquer tela</span></div>
    </div>`;
    document.body.appendChild(cx);
    cx.addEventListener("mousedown", e=>{ if(e.target===cx) fecharBusca(); });
    const inp = cx.querySelector("#bgInput");
    let t = null;
    inp.addEventListener("input", ()=>{ clearTimeout(t); t = setTimeout(()=>{ buscaSel = 0; pintarBusca(inp.value); }, 60); });
    // quem digita rápido e já aperta Enter quer o resultado do que digitou, não o anterior
    const emDia = () => { if(buscaTermo !== inp.value){ clearTimeout(t); buscaSel = 0; pintarBusca(inp.value); } };
    inp.addEventListener("keydown", e=>{
      if(["ArrowDown","ArrowUp","Enter"].includes(e.key)) emDia();
      if(e.key==="ArrowDown"){ e.preventDefault(); buscaSel = Math.min(buscaSel+1, buscaRes.length-1); marcarSel(); }
      else if(e.key==="ArrowUp"){ e.preventDefault(); buscaSel = Math.max(buscaSel-1, 0); marcarSel(); }
      else if(e.key==="Enter"){ e.preventDefault(); escolherBusca(buscaSel); }
      else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); fecharBusca(); }
      else if(e.key==="Tab"){ e.preventDefault(); }   // o foco fica na busca enquanto ela está aberta
    });
    cx.querySelector("#bgLista").addEventListener("click", e=>{
      const b = e.target.closest("[data-i]"); if(b) escolherBusca(Number(b.dataset.i));
    });
  }
  buscaFocoAntes = document.activeElement;
  cx.classList.add("open");
  const inp = cx.querySelector("#bgInput");
  inp.value = ""; buscaSel = 0; pintarBusca("");
  inp.focus();
}
function fecharBusca(){
  const cx = document.getElementById("buscaGlobal");
  if(cx) cx.classList.remove("open");
  if(buscaFocoAntes && buscaFocoAntes.focus) try{ buscaFocoAntes.focus(); }catch(e){ /* elemento saiu da tela */ }
}
function pintarBusca(q){
  const lista = document.getElementById("bgLista"); if(!lista) return;
  buscaTermo = q;
  buscaRes = q.trim() ? buscarGlobal(q) : comandosBusca().filter(c=>c.grupo==="Ações").concat(comandosBusca().filter(c=>c.grupo==="Ir para").slice(0,6));
  if(!buscaRes.length){
    lista.innerHTML = `<div class="bg-vazio">Nada encontrado para “${esc(q)}”.<span>Tente parte do nome, os números do CPF/CNPJ ou do telefone.</span></div>`;
    return;
  }
  let grupo = "", html = "";
  buscaRes.forEach((r,i)=>{
    if(r.grupo!==grupo){ grupo = r.grupo; html += `<div class="bg-grupo" role="presentation">${esc(grupo)}</div>`; }
    html += `<button type="button" class="bg-item" role="option" id="bg-op-${i}" data-i="${i}" aria-selected="${i===buscaSel}">
      <b>${esc(r.titulo)}</b>${r.sub?`<span>${esc(r.sub)}</span>`:""}</button>`;
  });
  lista.innerHTML = html;
  marcarSel();
}
function marcarSel(){
  document.querySelectorAll("#bgLista .bg-item").forEach(b=>b.setAttribute("aria-selected", String(Number(b.dataset.i)===buscaSel)));
  const atual = document.getElementById("bg-op-"+buscaSel);
  const inp = document.getElementById("bgInput");
  if(inp) inp.setAttribute("aria-activedescendant", atual ? atual.id : "");
  if(atual) atual.scrollIntoView({ block:"nearest" });
}
function escolherBusca(i){
  const r = buscaRes[i]; if(!r) return;
  fecharBusca();
  buscaFocoAntes = null;
  try{ r.abrir(); }catch(e){ registrarErro(e, { operacao:"abrir resultado da busca" }); toast("Não foi possível abrir esse registro."); }
}
document.addEventListener("keydown", e=>{
  const aberto = document.getElementById("buscaGlobal")?.classList.contains("open");
  if((e.ctrlKey || e.metaKey) && (e.key==="k" || e.key==="K")){ e.preventDefault(); aberto ? fecharBusca() : abrirBusca(); return; }
  // "/" abre a busca quando ninguém está digitando
  if(e.key==="/" && !aberto && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement||{}).tagName||"") && !document.activeElement?.isContentEditable
     && !$("#scrim").classList.contains("open")){ e.preventDefault(); abrirBusca(); }
});
