/* Erbe · Central — views/auditoria.js
   O que a auditoria do servidor (tabela auditoria, migration 0002) oferece ao gestor:
   - histórico completo de um registro, com valor anterior e novo, gravado pelo
     próprio banco (não depende do navegador de quem alterou);
   - lixeira: o que foi excluído pode ser restaurado;
   - transferência de carteira entre pessoas da equipe.
   Só o gestor lê a auditoria (a RLS garante; a tela apenas não oferece aos demais).
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";

const ROTULO_TABELA = { clientes:"Cliente", contratos:"Contrato", leads:"Lead", vidas:"Vida", tarefas:"Tarefa",
  despesas:"Despesa", perfis:"Equipe", config:"Configurações" };
const ROTULO_ACAO = { INSERT:"Criou", UPDATE:"Alterou", DELETE:"Excluiu" };
const ROTULO_PERFIL = { nome:"Nome", papel:"Papel", status:"Situação do acesso", ver_tudo:"Alcance (vê tudo)", meta:"Meta", split_pct:"Split", email:"E-mail" };

/** Valor de auditoria em texto curto e legível. */
function textoValor(v){
  if(v===null || v===undefined || v==="") return "vazio";
  if(typeof v==="boolean") return v ? "sim" : "não";
  if(typeof v==="object") return Array.isArray(v) ? `${v.length} item(ns)` : "…";
  const s = String(v);
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return dt(s.slice(0,10));
  if(ehUuid(s)) return nomeUsuario(s);
  return s.length > 80 ? s.slice(0,77)+"…" : s;
}
/** Uma parcela que entrou/saiu do cronograma, em uma linha. */
const textoParcela = p => p && typeof p==="object"
  ? `${tipoP(p.tipo).nome} ${dt(p.vence)} · ${brl2(p.status==="recebido" ? (p.valorRecebido??p.valor) : p.valor)} · ${(STATUS_COM[p.status]||{nome:p.status||"—"}).nome}`
  : textoValor(p);

function linhasMudanca(tabela, mudancas){
  const out = [];
  for(const [campo, m] of Object.entries(mudancas||{})){
    if(campo==="_dono") { out.push({ rot:"Responsável (acesso)", de:textoValor(m.de), para:textoValor(m.para) }); continue; }
    if(campo==="comissoes" && !veCorretora()) continue;
    const rot = (tabela==="perfis" ? ROTULO_PERFIL[campo] : ROTULO_CAMPO[campo]) || campo;
    if(m && (m.saiu || m.entrou)){
      const fmt = campo==="comissoes" ? textoParcela : (x => typeof x==="object" ? (x.texto || x.nome || JSON.stringify(x).slice(0,60)) : textoValor(x));
      out.push({ rot, lista:true, saiu:(m.saiu||[]).map(fmt), entrou:(m.entrou||[]).map(fmt) });
    } else out.push({ rot, de:textoValor(m && m.de), para:textoValor(m && m.para) });
  }
  return out;
}
function htmlMudancas(tabela, mudancas){
  const ls = linhasMudanca(tabela, mudancas);
  if(!ls.length) return "";
  return `<div class="mudancas">${ls.map(l=> l.lista
    ? `<span class="mud"><b>${esc(l.rot)}</b>${l.saiu.map(x=>`<s>${esc(x)}</s>`).join(" ")}${l.saiu.length&&l.entrou.length?` <span aria-hidden="true">→</span> `:""}${l.entrou.map(x=>`<i>${esc(x)}</i>`).join(" ")}</span>`
    : `<span class="mud"><b>${esc(l.rot)}</b> <s>${esc(l.de)}</s> <span aria-hidden="true">→</span> <i>${esc(l.para)}</i></span>`).join("")}</div>`;
}

/** Histórico completo de um registro (gestor). Abre por cima da ficha. */
async function abrirHistorico(tabela, id, titulo){
  if(S.mePapel!=="gestor"){ toast("O histórico completo é do gestor."); return; }
  abrirModal(`<div class="m-head"><div><h2>Histórico · ${esc(titulo||"")}</h2>
      <div class="sub">Gravado pelo banco a cada alteração — quem, quando e o que mudou</div></div></div>
    <div class="m-body" id="histCorpo"><div class="carregando-cx"><span class="spinner" aria-hidden="true"></span> Carregando…</div></div>
    <div class="m-foot"><button class="btn primary" data-act="fechar">Fechar</button></div>`, true);
  const { data, error } = await S.db.from("auditoria").select("*")
    .eq("tabela", tabela).eq("registro_id", id).order("quando", { ascending:false }).limit(200);
  const corpo = document.getElementById("histCorpo"); if(!corpo) return;
  if(error){
    corpo.innerHTML = `<div class="empty"><b>Histórico indisponível</b>${/auditoria/.test(error.message) ? "Aplique a migration 0002 no Supabase para ativar a auditoria do servidor." : "Tente de novo em instantes."}</div>`;
    return;
  }
  if(!data.length){ corpo.innerHTML = `<div class="empty"><b>Sem registros ainda</b>A auditoria do servidor começa a contar a partir da migration 0002.</div>`; return; }
  corpo.innerHTML = `<div class="timeline">${data.map(r=>`<div class="tl"><span class="tl-d" aria-hidden="true"></span><div class="tl-c">
      <div><b>${esc(nomeUsuario(r.quem) || "Sistema")}</b> ${esc((ROTULO_ACAO[r.acao]||r.acao).toLowerCase())}
        <span class="tl-m">· ${esc(dt(r.quando.slice(0,10)))} ${esc(horaDe(r.quando))}${r.origem && r.origem!=="api" ? " · "+esc(r.origem) : ""}</span></div>
      ${htmlMudancas(tabela, r.mudancas)}</div></div>`).join("")}</div>`;
}

/* ---------- lixeira ---------- */
const TABELAS_RESTAURAVEIS = ["clientes","contratos","leads","vidas","tarefas","despesas"];
let LIXEIRA = null;
async function carregarLixeira(){
  const { data, error } = await S.db.from("auditoria").select("id,quando,quem,tabela,registro_id,registro")
    .eq("acao","DELETE").in("tabela", TABELAS_RESTAURAVEIS).order("quando",{ ascending:false }).limit(100);
  if(error) throw error;
  // some da lixeira o que já foi restaurado (o registro voltou a existir)
  LIXEIRA = (data||[]).filter(r=>!(S[r.tabela]||[]).some(x=>x.id===r.registro_id));
  return LIXEIRA;
}
function painelLixeira(){
  if(S.mePapel!=="gestor") return "";
  if(LIXEIRA===null){
    setTimeout(()=>carregarLixeira().then(()=>{ if(S.view==="atividade") render(); }, e=>{ LIXEIRA = []; registrarErro(e, { operacao:"lixeira" }); }), 0);
    return `<section class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>Lixeira</h3><span class="hint">carregando…</span></div></section>`;
  }
  if(!LIXEIRA.length) return "";
  const nome = r => { const d = r.registro||{}; return d.nome || d.titulo || d.clienteNome || d.descricao || r.registro_id; };
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip warn">Lixeira</span><div><h3>Excluídos recentemente</h3>
      <div class="sub">O banco guarda o registro inteiro quando algo é excluído — dá para trazer de volta</div></div></div>
    <div class="tw"><table><thead><tr><th>Registro</th><th>Tipo</th><th>Excluído por</th><th>Quando</th><th></th></tr></thead>
      <tbody>${LIXEIRA.slice(0,30).map(r=>`<tr>
        <td><b>${esc(nome(r))}</b></td><td>${esc(ROTULO_TABELA[r.tabela]||r.tabela)}</td>
        <td>${esc(nomeUsuario(r.quem))}</td><td class="num">${esc(quandoRel(r.quando))}</td>
        <td class="r"><button class="btn sm" data-act="restaurarExcluido" data-id="${esc(String(r.id))}">Restaurar</button></td></tr>`).join("")}</tbody></table></div>
  </section>`;
}
async function restaurarExcluido(idAuditoria){
  const r = (LIXEIRA||[]).find(x=>String(x.id)===String(idAuditoria)); if(!r) return;
  const dados = Object.assign({}, r.registro||{}); const dono = dados._dono; delete dados._dono;
  if(r.tabela==="contratos" && !S.clientes.some(c=>c.id===dados.clienteId)){
    toast("Restaure primeiro o cliente deste contrato."); return;
  }
  if(r.tabela==="vidas" && !S.contratos.some(c=>c.id===dados.contratoId)){
    toast("Restaure primeiro o contrato desta vida."); return;
  }
  if(!await confirmar("Restaurar registro", `${ROTULO_TABELA[r.tabela]} “${dados.nome||dados.titulo||dados.clienteNome||r.registro_id}” volta para o sistema como estava quando foi excluído.`, "Restaurar")) return;
  const { error } = await S.db.from(r.tabela).upsert({ id:r.registro_id, dono: dono || S.uid, dados }, { onConflict:"id" });
  if(error){ falhaEscrita(error, r.tabela); return; }
  LIXEIRA = LIXEIRA.filter(x=>x!==r);
  toast("Registro restaurado");
  await carregarTudo();
}

/* ---------- transferir carteira ---------- */
async function transferirCarteira(deId){
  const de = S.usuarios.find(u=>u.id===deId); if(!de) return;
  const destinos = S.usuarios.filter(u=>u.id!==deId && !u.manual && u.status==="ativo");
  if(!destinos.length){ toast("Não há outra pessoa ativa para receber a carteira."); return; }
  const qtd = ["leads","clientes","contratos","tarefas"].reduce((a,col)=>a+S[col].filter(x=>(x.responsavel||x.corretor)===deId).length, 0);
  const escolha = await dialogo(`<h3>Transferir a carteira de ${esc(de.nome)}</h3>
    <p>Leads, clientes, contratos, tarefas e vidas de ${esc(de.nome)} passam para a pessoa escolhida (${qtd} registro(s) visíveis aqui). Útil quando alguém sai da equipe — depois disso o acesso pode ser removido sem perder nada.</p>
    <div class="field"><label for="trDestino">Para quem</label><select id="trDestino">${destinos.map(u=>`<option value="${esc(u.id)}">${esc(u.nome)} · ${esc(PAPEIS[u.papel]||"")}</option>`).join("")}</select></div>
    <div class="acoes"><button class="btn" data-resolve="cancel">Cancelar</button><button class="btn primary" id="trOk">Transferir</button></div>`,
    (cx, encerrar)=>{ cx.querySelector("#trOk").addEventListener("click", ()=>encerrar(cx.querySelector("#trDestino").value)); });
  if(!escolha || escolha===true) return;
  const { data, error } = await S.db.rpc("transferir_carteira", { de:deId, para:escolha });
  if(error){ falhaEscrita(error, "usuarios"); return; }
  const n = data ? Object.values(data).reduce((a,b)=>a+(Number(b)||0),0) : 0;
  toast(`${n} registro(s) transferidos para ${nomeUsuario(escolha)}`);
  await carregarTudo();
}
