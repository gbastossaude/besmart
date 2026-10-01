/* Erbe · Central — core.js
   Constantes de domínio, estado global (S) e utilidades.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ============================================================
   Erbe Proteção e Patrimônio — carteira, comissionamento e agenda
   ============================================================ */

/* ---------- constantes de domínio ---------- */
/* Os três pilares da marca. As chaves continuam as mesmas para não mexer
   no que já está gravado; o que muda é o nome que aparece na tela. */
const PILARES = {
  saude:      { nome:"Saúde",      curto:"Saúde",      cor:"var(--c-saude)" },
  seguros:    { nome:"Proteção",   curto:"Proteção",   cor:"var(--c-seguros)" },
  consorcios: { nome:"Patrimônio", curto:"Patrimônio", cor:"var(--c-consorcios)" }
};
const PK = Object.keys(PILARES);

const DEFAULT_CONFIG = {
  etapas: [
    { id:"novo",      nome:"Novo",            prob:10 },
    { id:"contato",   nome:"Contato feito",   prob:25 },
    { id:"qualificado",nome:"Qualificado",    prob:45 },
    { id:"proposta",  nome:"Proposta enviada",prob:65 },
    { id:"negociacao",nome:"Negociação",      prob:80 },
    { id:"ganho",     nome:"Ganho",           prob:100 },
    { id:"perdido",   nome:"Perdido",         prob:0 }
  ],
  etapasCliente: [
    { id:"onboarding",   nome:"Implantação" },
    { id:"documentacao", nome:"Documentação pendente" },
    { id:"ativo",        nome:"Ativo" },
    { id:"renovacao",    nome:"Renovação em curso" },
    { id:"risco",        nome:"Em risco" },
    { id:"encerrado",    nome:"Encerrado" }
  ],
  origens: ["Indicação","Instagram","Google","WhatsApp","Parceiro contábil","Lista fria","Site","Evento","Carteira própria"],
  operadoras: {
    saude: ["Amil","SulAmérica","Bradesco Saúde","Alice","Hapvida NotreDame","Unimed","Porto Saúde","Omint","Care Plus"],
    seguros: ["Porto Seguro","Allianz","Tokio Marine","Mapfre","Zurich","HDI","Sompo","Liberty","Bradesco Seguros"],
    consorcios: ["Porto Consórcio","Rodobens","Embracon","Itaú Consórcio","Bradesco Consórcio","Randon"]
  },
  produtos: {
    saude: ["PME 2-29 vidas","PME 30-99 vidas","Empresarial 100+","MEI","Adesão","Individual","Odontológico"],
    seguros: ["Auto","Residencial","Vida","Empresarial","Rural","Transportes","Responsabilidade civil"],
    consorcios: ["Imóvel","Automóvel","Serviços","Pesados"]
  },
  tiposPlano: ["PME","Adesão","Individual","Empresarial","Odontológico","Outro"],
  logoSvg: "",              // vazio = escudo oficial extraído do manual; preencha só para trocar
  cadenciaPosVenda: 90,     // dias entre um contato de pós-venda e o próximo
  diasAvisoComissao: 7,     // com quantos dias de antecedência avisar sobre a parcela
  diasAvisoAniversario: 7,  // com quantos dias de antecedência lembrar do aniversário do cliente
  impostoPadrao: 0,         // % de imposto sobre cada parcela de comissão (0 = não desconta)
  splitSobre: "bruto",      // repasse do corretor sobre o valor "bruto" ou "liquido" de imposto
  categoriasDespesa: ["Comissão de parceiros","Marketing e anúncios","Software e sistemas","Aluguel",
    "Contabilidade","Telefonia e internet","Combustível e deslocamento","Alimentação",
    "Material de escritório","Impostos e taxas","Pró-labore","Salários e encargos","Treinamento","Outros"],
  formasPagamento: ["Pix","Cartão de crédito","Cartão de débito","Boleto","Dinheiro","Transferência","Débito automático"],
  motivosPerda: ["Preço","Concorrente","Sem interesse","Sem contato","Fora do perfil","Adiou decisão"],
  motivosCancelamento: ["Preço / reajuste","Migrou para concorrente","Empresa fechou ou reduziu o quadro",
    "Insatisfação com a operadora","Insatisfação com o atendimento","Inadimplência","Mudança de cidade","Outro"],
  regras: [
    { id:"r-saude-pme-3x",  nome:"Saúde PME — 100/50/50 + 3% vitalício", pilar:"saude", base:"mensalidade",
      parcelas:[{n:1,pct:100},{n:2,pct:50},{n:3,pct:50}], vitalicio:{pct:3, inicio:4, meses:0} },
    { id:"r-saude-pme-1x",  nome:"Saúde PME — 1ª mensalidade + 2% vitalício", pilar:"saude", base:"mensalidade",
      parcelas:[{n:1,pct:100}], vitalicio:{pct:2, inicio:2, meses:0} },
    { id:"r-saude-agenc",   nome:"Saúde PME — só agenciamento 100/50/50", pilar:"saude", base:"mensalidade",
      parcelas:[{n:1,pct:100},{n:2,pct:50},{n:3,pct:50}], vitalicio:{pct:0, inicio:4, meses:0} },
    { id:"r-saude-adesao",  nome:"Saúde adesão — 80% 1ª + 1,5% vitalício", pilar:"saude", base:"mensalidade",
      parcelas:[{n:1,pct:80}], vitalicio:{pct:1.5, inicio:2, meses:0} },
    { id:"r-saude-recorr",  nome:"Saúde — só vitalício 3%", pilar:"saude", base:"mensalidade",
      parcelas:[], vitalicio:{pct:3, inicio:1, meses:0} },
    { id:"r-seg-20",        nome:"Proteção — 20% do prêmio", pilar:"seguros", base:"premio",
      parcelas:[{n:1,pct:20}], vitalicio:{pct:0, inicio:2, meses:0} },
    { id:"r-seg-15-2x",     nome:"Proteção — 15% em 2x", pilar:"seguros", base:"premio",
      parcelas:[{n:1,pct:7.5},{n:2,pct:7.5}], vitalicio:{pct:0, inicio:3, meses:0} },
    { id:"r-seg-empresa",   nome:"Proteção empresarial — 12%", pilar:"seguros", base:"premio",
      parcelas:[{n:1,pct:12}], vitalicio:{pct:0, inicio:2, meses:0} },
    { id:"r-cons-3",        nome:"Patrimônio — consórcio 3% em 4x", pilar:"consorcios", base:"credito",
      parcelas:[{n:1,pct:0.75},{n:2,pct:0.75},{n:3,pct:0.75},{n:4,pct:0.75}], vitalicio:{pct:0, inicio:5, meses:0} },
    { id:"r-cons-4",        nome:"Patrimônio — consórcio 4% em 6x", pilar:"consorcios", base:"credito",
      parcelas:Array.from({length:6},(_,i)=>({n:i+1,pct:0.6667})), vitalicio:{pct:0, inicio:7, meses:0} }
  ],
  metaGlobal: 120000
};
const BASE_LABEL = { mensalidade:"Mensalidade", premio:"Prêmio anual", credito:"Valor do crédito" };
const STATUS_CONTRATO = {
  proposta:   { nome:"Proposta",   cls:"info" },
  implantado: { nome:"Implantado", cls:"ok" },
  ativo:      { nome:"Ativo",      cls:"ok" },
  suspenso:   { nome:"Suspenso",   cls:"warn" },
  cancelado:  { nome:"Cancelado",  cls:"crit" }
};
const STATUS_COM = {
  previsto: { nome:"Previsto", cls:"mute" },
  recebido: { nome:"Recebido", cls:"ok" },
  atrasado: { nome:"Atrasado", cls:"crit" },
  glosado:  { nome:"Glosado",  cls:"warn" }
};
const PAPEIS = { gestor:"Gestor", corretor:"Corretor", assistente:"Assistente" };
const DESCR_PAPEL = {
  gestor:"Vê e edita tudo, libera acessos e mexe nas configurações.",
  corretor:"Trabalha a própria carteira. Não vê despesas nem configurações.",
  assistente:"Ajuda na operação toda, mas não vê comissões, despesas nem equipe."
};
/** Telas que cada papel enxerga. O gestor vê tudo. */
const TELAS_PAPEL = {
  gestor:     null,
  corretor:   ["dashboard","leads","tarefas","clientes","contratos","vidas","renovacoes","comissoes","operadoras","relatorios","equipe","atividade"],
  assistente: ["dashboard","leads","tarefas","clientes","contratos","vidas","renovacoes","atividade"]
};
const meuUsuario = () => S.usuarios.find(u=>u.id===S.uid) || null;
function podeVer(view){
  const lista = TELAS_PAPEL[S.mePapel];
  return !lista || lista.includes(view);
}
/** Corretor fica na própria carteira, salvo liberação expressa do gestor. */
function escopoTravado(){
  if(S.mePapel!=="corretor") return false;
  const u = meuUsuario();
  return !(u && u.verTudo);
}
const statusUsuario = u => u ? (u.status || "ativo") : "ativo";

/* ---------- estado ---------- */
const S = {
  db:null, userCap:null, uid:null, meNome:"Você", mePapel:"corretor", souDono:false, usuariosCarregados:false,
  canWrite:true, online:false,
  config:null,
  leads:[], clientes:[], contratos:[], tarefas:[], usuarios:[], atividade:[], despesas:[], vidas:[],
  mesDespesas:null,
  view:"dashboard", escopo:"todos", busca:"", filtros:{}, abaLogin:"entrar", emailLogin:"", meuEmail:"", modoClientes:"kanban", modoMontagem:"total", unidadeVit:"pct",
  perfis:{}
};

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = p => p+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const brl = n => (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const brl2 = n => (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2});
const pct = n => (Number(n)||0).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%";
/** Percentuais de régua de comissão precisam de 2 casas: consórcio usa 0,75%. */
const pctR = n => (Number(n)||0).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";
const hoje = () => new Date().toISOString().slice(0,10);
const mesAtual = () => hoje().slice(0,7);
function addMonths(iso, m){
  const [y,mo,d] = String(iso).slice(0,10).split("-").map(Number);
  const alvo = new Date(Date.UTC(y, mo-1+m, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth()+1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d||1, ultimo));   // 30/01 + 1 mês = 28/02, não 02/03
  return alvo.toISOString().slice(0,10);
}
function addDays(iso, n){ const d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function diasEntre(a,b){ return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/864e5); }
function dt(iso){ if(!iso) return "—"; const [y,m,d]=iso.slice(0,10).split("-"); return `${d}/${m}/${y}`; }
function mesLabel(ym){ const [y,m]=ym.split("-"); return ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][+m-1]+"/"+y.slice(2); }
function ultimosMeses(n){ const out=[]; const d=new Date(); d.setDate(1);
  for(let i=n-1;i>=0;i--){ const x=new Date(d); x.setMonth(x.getMonth()-i); out.push(x.toISOString().slice(0,7)); } return out; }
function proximosMeses(n){ const out=[]; const d=new Date(); d.setDate(1);
  for(let i=0;i<n;i++){ const x=new Date(d); x.setMonth(x.getMonth()+i); out.push(x.toISOString().slice(0,7)); } return out; }
/** Largura da barra em %: zero não desenha nada, valor pequeno ganha um mínimo visível. */
const larg = (v,max) => v<=0 ? 0 : Math.max(v/(max||1)*100, 2);
function quandoRel(iso){
  if(!iso) return "—";
  const min = Math.round((Date.now()-new Date(iso).getTime())/60000);
  if(min<1) return "agora";
  if(min<60) return `há ${min} min`;
  if(min<1440) return `há ${Math.round(min/60)}h`;
  const d = Math.round(min/1440);
  if(d<7) return `há ${d} dia${d>1?"s":""}`;
  return dt(iso.slice(0,10));
}
/** Minúscula só na primeira letra: preserva "R$", nomes de etapa e operadoras. */
const minuscInicial = t => String(t||"").charAt(0).toLowerCase()+String(t||"").slice(1);
function horaDe(iso){ try{ return new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }catch(e){ return ""; } }
const iniciais = n => String(n||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
function nomeUsuario(id){ if(!id) return "Sem responsável"; const u=S.usuarios.find(u=>u.id===id); return u?u.nome:(S.perfis[id]||"Membro da equipe"); }
function etapaNome(id){ const e=S.config.etapas.find(e=>e.id===id); return e?e.nome:id; }

/** O banco entrega snapshots congelados e compartilhados entre renders.
    Tudo que entra no estado é clonado, senão editar uma parcela lança
    "Cannot assign to read only property" e o clique não faz nada. */
function clonar(o){ try{ return structuredClone(o); }catch(e){ return JSON.parse(JSON.stringify(o)); } }

