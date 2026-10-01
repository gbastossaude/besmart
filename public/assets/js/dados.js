/* Erbe · Central — dados.js
   Persistência no Supabase e trilha de atividade (diferenças campo a campo).
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ---------- persistência: Supabase ---------- */
const COLS = { leads:"leads", clientes:"clientes", contratos:"contratos", vidas:"vidas",
               tarefas:"tarefas", usuarios:"perfis", despesas:"despesas" };
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = v => typeof v==="string" && RE_UUID.test(v);

/** Quem "possui" a linha para efeito de segurança no banco.
    A atribuição comercial continua em responsavel/corretor dentro de dados. */
function donoDe(col, obj){
  // a vida herda o dono do contrato: quem enxerga o contrato enxerga quem está nele
  if(col==="vidas"){
    const ct = (S.contratos||[]).find(c=>c.id===obj.contratoId);
    const dono = ct && ct.corretor;
    return ehUuid(dono) ? dono : S.uid;
  }
  const cand = col==="contratos" ? obj.corretor : obj.responsavel;
  return ehUuid(cand) ? cand : S.uid;
}
/** O perfil da equipe vive em colunas próprias, não dentro de dados. */
function paraPerfil(u){
  return { id:u.id, nome:u.nome, papel:u.papel||"corretor", status:u.status||"ativo",
           ver_tudo: !!u.verTudo, meta: Number(u.meta)||0, split_pct: Number(u.splitPct)||0 };
}
const dePerfil = r => ({ id:r.id, nome:r.nome||r.email||"Sem nome", email:r.email,
  papel:r.papel, status:r.status, verTudo:!!r.ver_tudo, meta:Number(r.meta)||0,
  splitPct:Number(r.split_pct)||0, ativo:r.status!=="bloqueado",
  criadoEm:(r.criado_em||"").slice(0,10), manual:false });

/* Versão de cada linha como o banco a conhece (coluna versao, migration 0004).
   Enviada em toda gravação: se outra pessoa gravou no meio, o banco recusa em vez
   de a última gravação apagar a outra em silêncio. */
const VERSOES = new Map();   // "coleção:id" -> versao
function lembrarVersao(col, linha){
  if(linha && linha.id && Number.isFinite(Number(linha.versao))) VERSOES.set(col+":"+linha.id, Number(linha.versao));
}
async function salvar(col, obj, evento){
  const i = S[col].findIndex(x=>x.id===obj.id);
  const novo = i<0;
  const antes = novo ? null : (sombraDe(col, obj.id) || projecao(col, S[col][i]));
  guardarSombra(col, obj);
  obj.atualizadoEm = new Date().toISOString();
  obj.atualizadoPor = S.uid || "";
  obj.atualizadoPorNome = S.meNome;
  if(novo) S[col].push(obj); else S[col][i]=obj;
  invalidarIndices();
  render();
  if(!S.db || !S.canWrite) return true;
  try{
    if(col==="usuarios"){
      if(obj.manual){ await salvarMembroManual(obj); }
      else {
        const { error } = await S.db.from("perfis").update(paraPerfil(obj)).eq("id", obj.id);
        if(error) throw error;
      }
    } else {
      const linha = { id:obj.id, dono:donoDe(col,obj), dados:obj };
      const v = VERSOES.get(col+":"+obj.id);
      if(v!=null && !novo) linha.versao = v;
      const { data, error } = await S.db.from(COLS[col]).upsert(linha, { onConflict:"id" }).select("id,versao");
      if(error) throw error;
      if(Array.isArray(data) && data[0]) lembrarVersao(col, data[0]);
    }
  }catch(e){ falhaEscrita(e, col); await desfazerNaTela(col, obj.id); return false; }
  registrarAtividade(col, obj, evento, novo, antes);
  return true;
}
async function remover(col, id, evento){
  const antigo = S[col].find(x=>x.id===id);
  SOMBRA.delete(col+":"+id);
  S[col] = S[col].filter(x=>x.id!==id);
  invalidarIndices();
  render();
  if(!S.db || !S.canWrite) return true;
  try{
    if(col==="usuarios"){
      if(antigo && antigo.manual) await removerMembroManual(id);
      else { const { error } = await S.db.from("perfis").delete().eq("id", id); if(error) throw error; }
    } else {
      // .select() devolve o que de fato foi apagado: quando a RLS filtra a linha, o
      // banco responde "sucesso" com zero linhas — antes a tela sumia com o registro
      // que continuava no servidor.
      const { data, error } = await S.db.from(COLS[col]).delete().eq("id", id).select("id");
      if(error) throw error;
      if(Array.isArray(data) && !data.length && antigo) throw { code:"42501", message:"Seu acesso não permite excluir este registro." };
    }
  }catch(e){ falhaEscrita(e, col); await desfazerNaTela(col, id); return false; }
  if(antigo) registrarAtividade(col, antigo, evento||"Excluiu", false);
  LIXEIRA = null;   // a lixeira do gestor relê na próxima vez
  return true;
}
/** O servidor recusou: a tela volta a mostrar o que está gravado de verdade. */
async function desfazerNaTela(col, id){
  try{
    if(col==="usuarios" || !COLS[col]){ await carregarTudo(); return; }
    const { data, error } = await S.db.from(COLS[col]).select("*").eq("id", id).maybeSingle();
    if(error) throw error;
    S[col] = S[col].filter(x=>x.id!==id);
    SOMBRA.delete(col+":"+id);
    if(data){ const obj = deLinha(data); S[col].push(obj); guardarSombra(col, obj); lembrarVersao(col, data); }
    else VERSOES.delete(col+":"+id);
    invalidarIndices();
    render();
  }catch(e){ registrarErro(e, { operacao:"desfazer "+col }); carregarTudo(); }
}
/** Membros que ainda não têm login ficam guardados dentro da configuração. */
async function salvarMembroManual(u){
  const lista = (S.config.membrosManuais||[]).filter(x=>x.id!==u.id).concat([u]);
  S.config.membrosManuais = lista;
  await salvarConfig();
}
async function removerMembroManual(id){
  S.config.membrosManuais = (S.config.membrosManuais||[]).filter(x=>x.id!==id);
  await salvarConfig();
}
async function salvarConfig(){
  render();
  if(!S.db || !S.canWrite) return;
  try{
    const { error } = await S.db.from("config")
      .upsert({ id:"app", dados:S.config }, { onConflict:"id" });
    if(error) throw error;
  }catch(e){ falhaEscrita(e, "config"); carregarTudo(); }
}
/** Mensagens que o próprio banco escreve para o usuário (gatilhos da migration 0002). */
const RE_MSG_DO_BANCO = /^(Somente o gestor|O recebimento deve|Parcela recebida não confere|Seu acesso não permite|Outra pessoa alterou)/;
function falhaEscrita(e, col){
  const msg = (e && (e.message||e.hint||"")) + "";
  const codigo = e && e.code;
  if(codigo==="40001" || /^Outra pessoa alterou/.test(msg)){
    banner("Outra pessoa alterou este registro enquanto você editava. A tela foi atualizada com a versão dela — confira e salve de novo se ainda precisar.");
  } else if(RE_MSG_DO_BANCO.test(msg)){
    banner(msg + " A alteração não foi salva.");
  } else if(codigo==="42501" || /row-level security|permission denied|violates/i.test(msg)){
    banner("Seu acesso não permite essa alteração — ela não foi salva. Fale com o gestor da corretora.");
  } else if(/JWT|expired|session/i.test(msg)){
    banner("Sua sessão expirou. Recarregue a página e entre de novo — a última alteração não foi salva.");
  } else if(!navigator.onLine || /Failed to fetch|NetworkError|network/i.test(msg)){
    banner("Sem conexão: a última alteração não foi salva. Tente de novo quando a internet voltar.");
  } else {
    banner("Não foi possível salvar agora — a alteração foi desfeita na tela. Tente de novo em instantes.");
    registrarErro(e, { operacao:"salvar "+(col||"") });
  }
}

/* ---------- registro de atividade: quem mexeu em quê ---------- */
const ROTULO_COL = { leads:"Lead", clientes:"Cliente", contratos:"Contrato", vidas:"Vida", tarefas:"Tarefa", usuarios:"Equipe", despesas:"Despesa" };
function rotuloRegistro(col, o){
  if(col==="contratos") return `${o.clienteNome||"—"} · ${o.operadora||""}`.trim();
  if(col==="tarefas") return o.titulo||"—";
  if(col==="despesas") return `${o.descricao||"—"} · ${brl(o.valor)}`;
  return o.nome||"—";
}
/* ============================================================
   TRILHA DE AUDITORIA
   Guarda quem mexeu, quando, em qual registro e — desde a etapa 1 —
   o que exatamente mudou: valor anterior e valor novo, campo a campo.
   ============================================================ */

/** Campos que interessam no histórico. O resto é ruído de sistema. */
const CAMPOS_AUDITADOS = {
  contratos: ["clienteNome","pilar","produto","operadora","numero","apolice","grupo","cota",
              "valorBase","valorTotal","vidas","inicio","fim","status","corretor","splitPct",
              "tipoPlano","modalidade","diaVencimento","contemplado","contempladoEm",
              "motivoCancelamento","canceladoEm","mesReajuste","ultimoReajuste","apolice","ramo","impostoPct","regraId"],
  clientes:  ["nome","doc","tipo","telefone","whatsapp","email","nascimento","cidade","uf",
              "cep","logradouro","responsavel","status","origem","contatoNome","contatoNascimento","contatoWhatsapp","contatoCargo"],
  leads:     ["nome","empresa","etapa","valorEstimado","responsavel","pilar","previsao","temperatura"],
  vidas:     ["nome","tipo","parentesco","contratoId","status","entrada","saida","doc","nascimento"],
  tarefas:   ["titulo","tipo","vence","responsavel","status"],
  despesas:  ["data","categoria","valor","forma","descricao"]
};
const ROTULO_CAMPO = {
  clienteNome:"Cliente", pilar:"Pilar", produto:"Produto", operadora:"Operadora",
  numero:"Nº da proposta", apolice:"Apólice", grupo:"Grupo", cota:"Cota",
  valorBase:"Base", valorTotal:"Valor do contrato", vidas:"Vidas", inicio:"Início",
  fim:"Fim da vigência", status:"Situação", corretor:"Corretor", splitPct:"Split",
  tipoPlano:"Tipo de plano", modalidade:"Modalidade", diaVencimento:"Dia do boleto",
  contemplado:"Contemplado", contempladoEm:"Data da contemplação",
  motivoCancelamento:"Motivo do cancelamento", canceladoEm:"Cancelado em",
  mesReajuste:"Mês de reajuste", ultimoReajuste:"Último reajuste", ramo:"Ramo",
  nome:"Nome", doc:"CPF/CNPJ", tipo:"Tipo", telefone:"Telefone", whatsapp:"WhatsApp",
  email:"E-mail", nascimento:"Nascimento", cidade:"Cidade", uf:"UF", cep:"CEP",
  logradouro:"Endereço", responsavel:"Responsável", origem:"Origem",
  empresa:"Empresa", etapa:"Etapa", valorEstimado:"Valor estimado", previsao:"Previsão",
  temperatura:"Temperatura", parentesco:"Parentesco", contratoId:"Contrato",
  entrada:"Entrada", saida:"Saída", titulo:"Título", vence:"Vence",
  data:"Data", categoria:"Categoria", valor:"Valor", forma:"Forma de pagamento",
  descricao:"Descrição", comissoes:"Cronograma de comissão", impostoPct:"Imposto sobre a comissão (%)",
  regraId:"Régua", contatoNome:"Contato principal", contatoNascimento:"Nascimento do contato",
  contatoWhatsapp:"WhatsApp do contato", contatoCargo:"Cargo do contato"
};
/** Compara dois registros e devolve só o que mudou, em linguagem de gente. */
function diferencas(col, antes, depois){
  if(!antes) return [];
  const campos = CAMPOS_AUDITADOS[col] || [];
  const mud = [];
  for(const k of campos){
    const a = antes[k], b = depois[k];
    const va = a===undefined||a===null||a==="" ? "" : String(a);
    const vb = b===undefined||b===null||b==="" ? "" : String(b);
    if(va === vb) continue;
    mud.push({ campo:k, rotulo:ROTULO_CAMPO[k]||k, de:va, para:vb });
  }
  // o cronograma de comissão é uma lista: guarda o resumo, não parcela a parcela
  if(col==="contratos"){
    const soma = c => (c.comissoes||[]).reduce((s,p)=>s+(Number(p.valor)||0),0);
    const na = (antes.comissoes||[]).length, nb = (depois.comissoes||[]).length;
    const sa = soma(antes), sb = soma(depois);
    if(na!==nb || Math.abs(sa-sb) > 0.005){
      mud.push({ campo:"comissoes", rotulo:"Cronograma de comissão",
                 de:`${na} parcela(s) · ${brl2(sa)}`, para:`${nb} parcela(s) · ${brl2(sb)}` });
    }
  }
  return mud;
}
/* Sombra do último estado salvo, só com os campos auditados. Muitas telas
   alteram o registro no lugar antes de chamar salvar() — conciliar, excluir
   parcela, mover lead. Sem a sombra, o "antes" já chegava alterado e o
   histórico registrava zero mudanças. */
const SOMBRA = new Map();   // "coleção:id" -> projeção do que estava salvo
function projecao(col, o){
  if(!o) return null;
  const p = {};
  for(const k of (CAMPOS_AUDITADOS[col]||[])) p[k] = o[k];
  if(col==="contratos") p.comissoes = (o.comissoes||[]).map(x=>({ valor:Number(x.valor)||0 }));
  return p;
}
function guardarSombra(col, o){
  if(CAMPOS_AUDITADOS[col] && o && o.id) SOMBRA.set(col+":"+o.id, JSON.parse(JSON.stringify(projecao(col,o))));
}
const sombraDe = (col, id) => SOMBRA.get(col+":"+id) || null;
function registrarSombras(col){
  if(!CAMPOS_AUDITADOS[col]) return;
  for(const o of (S[col]||[])) guardarSombra(col, o);
}
async function registrarAtividade(col, obj, evento, novo, antes){
  if(!S.db || !S.canWrite || col==="usuarios") return;
  const id = "atv-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const mudancas = novo ? [] : diferencas(col, antes, obj);
  // alteração que não mexeu em nada auditável não vira linha de histórico
  if(!novo && !mudancas.length && !evento) return;
  const reg = { id, quando:new Date().toISOString(), quem:S.uid||"", quemNome:S.meNome,
                colecao:col, tipo:ROTULO_COL[col]||col, alvoId:obj.id, alvo:rotuloRegistro(col,obj),
                evento: evento || (novo ? "Criou" : "Atualizou"),
                mudancas: mudancas.slice(0, 20) };
  S.atividade.unshift(reg);
  try{ await S.db.from("atividade").insert({ id, quem:S.uid, quando:reg.quando, dados:reg }); }catch(e){ return; }
}
/* O PostgreSQL não tem teto de linhas: o histórico fica inteiro, para sempre.
   O que a tela carrega é limitado (as mais recentes), o que está guardado não. */

