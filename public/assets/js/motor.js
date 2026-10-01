/* Erbe · Central — motor.js
   Motor de comissionamento, vidas, índices em memória, escopo e visibilidade.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
/* ---------- motor de comissionamento ---------- */
function regraPorId(id){ return S.config.regras.find(r=>r.id===id); }
/** Tipo de plano do contrato: o que foi escolhido, ou deduzido do nome do produto. */
function tipoPlano(c){
  if(c.tipoPlano) return c.tipoPlano;
  const t = (c.produto||"").toLowerCase();
  if(t.includes("pme")) return "PME";
  if(t.includes("adesão")||t.includes("adesao")) return "Adesão";
  if(t.includes("individual")) return "Individual";
  if(t.includes("empresarial")) return "Empresarial";
  if(t.includes("odonto")) return "Odontológico";
  return "Outro";
}
function comissaoContratoBruta(c){ return (c.comissoes||[]).reduce((a,p)=>a+(Number(p.valor)||0),0); }
/** Comissão do contrato como quem está olhando pode ver:
    o gestor vê o total da corretora; o corretor, apenas a parte dele. */
function comissaoContrato(c){
  const t = comissaoContratoBruta(c);
  if(typeof veCorretora==="function" && !veCorretora())
    return +(c.comissoes||[]).reduce((a,p)=>a+(Number(p.valor)||0)*fatorCorretor(p,c),0).toFixed(2);
  return t;
}
const HORIZONTE_VITALICIO = 24;   // meses projetados quando não há fim de vigência
const TETO_VITALICIO = 120;       // trava de segurança no tamanho do cronograma

/** Quantos meses de comissão vitalícia projetar para este contrato. */
function mesesVitalicio(contrato, v){
  if(!v || !(v.pct>0)) return 0;
  if(Number(v.meses)>0) return Math.min(Number(v.meses), TETO_VITALICIO);
  if(contrato.fim && contrato.inicio){
    const meses = Math.max(0, Math.floor(diasEntre(contrato.inicio, contrato.fim)/30.44) - ((v.inicio||1)-1));
    if(meses>0) return Math.min(meses, TETO_VITALICIO);
  }
  return HORIZONTE_VITALICIO;
}
/** Cronograma = agenciamento (% das primeiras mensalidades) + vitalício (% recorrente). */
function gerarCronograma(contrato){
  const regra = regraPorId(contrato.regraId);
  if(!regra) return [];
  const base = Number(contrato.valorBase)||0;
  const antigas = contrato.comissoes || [];
  const linhas = [];
  (regra.parcelas||[]).forEach(p=>linhas.push({ tipo:"agenciamento", pct:p.pct, mesRef:p.n }));
  const v = regra.vitalicio;
  const nv = mesesVitalicio(contrato, v);
  for(let i=0;i<nv;i++) linhas.push({ tipo:"vitalicio", pct:v.pct, mesRef:(v.inicio||1)+i });
  linhas.sort((a,b)=> a.mesRef-b.mesRef || (a.tipo==="agenciamento"?-1:1));
  return linhas.map((l,i)=>{
    const chave = l.tipo+":"+l.mesRef;
    const prev = antigas.find(x=>(x.tipo||"agenciamento")+":"+(x.mesRef??x.n)===chave);
    return {
      n:i+1, tipo:l.tipo, mesRef:l.mesRef, pct:l.pct,
      valor:+(base*l.pct/100).toFixed(2),
      vence: prev && prev.travado ? prev.vence : addMonths(contrato.inicio, l.mesRef),
      status: prev ? prev.status : "previsto",
      recebidoEm: prev ? prev.recebidoEm||"" : "",
      valorRecebido: prev ? (prev.valorRecebido??null) : null,
      travado: prev ? !!prev.travado : false
    };
  });
}
const TIPO_PARCELA = {
  agenciamento:  { nome:"Agenciamento",         cls:"info" },
  vitalicio:     { nome:"Vitalício",            cls:"ok" },
  renovacao:     { nome:"Renovação",            cls:"seguros" },
  premio:        { nome:"Prêmio / apólice",     cls:"consorcios" },
  adesao:        { nome:"Taxa de adesão",       cls:"saude" },
  administracao: { nome:"Taxa de administração",cls:"warn" },
  bonus:         { nome:"Bônus de produção",    cls:"crit" },
  outro:         { nome:"Outro",                cls:"mute" }
};
/** Tipo desconhecido (vindo de um contrato antigo) não pode quebrar a tela. */
const tipoP = t => TIPO_PARCELA[t] || { nome: t ? String(t) : "Agenciamento", cls:"mute" };

/* ============================================================
   VIDAS
   Uma linha por pessoa coberta. É o registro que faltava: sem ele o
   sistema sabe dizer "14 vidas" mas não sabe quem, desde quando, nem
   quantas saíram no mês. Vive presa a um contrato, e por ele ao cliente.
   ============================================================ */
const STATUS_VIDA = {
  ativa:     { nome:"Ativa",     cls:"ok",   conta:true  },
  pendente:  { nome:"Pendente",  cls:"warn", conta:false },
  inativa:   { nome:"Inativa",   cls:"mute", conta:false },
  cancelada: { nome:"Cancelada", cls:"crit", conta:false }
};
const SV = k => STATUS_VIDA[k] || STATUS_VIDA.ativa;
const TIPO_VIDA = { titular:"Titular", dependente:"Dependente" };
const PARENTESCOS = ["Cônjuge","Filho(a)","Enteado(a)","Pai/Mãe","Sogro(a)","Neto(a)","Irmão/Irmã","Outro"];

/** Pilares que contam vida. Consórcio não tem vida: tem cota. */
const PILAR_TEM_VIDA = { saude:true, seguros:true, consorcios:false };
const contratoTemVida = c => !!(c && PILAR_TEM_VIDA[c.pilar]);

/** Vida que conta como ativa hoje: situação ativa E contrato vivo.
    Contrato cancelado ou apagado não sustenta vida ativa em painel nenhum. */
function vidaConta(v){
  if(!SV(v.status).conta) return false;
  const ct = contratoPorId(v.contratoId);
  return !!(ct && ct.status !== "cancelado");
}
const vidasAtivas = lista => (lista||[]).filter(vidaConta);

/** Total de vidas de um contrato: conta os registros; se ainda não houver
    nenhum, cai no número digitado no contrato, para nenhum painel zerar
    durante a migração. */
function totalVidas(contrato){
  if(!contrato) return 0;
  if(!contratoTemVida(contrato)) return 0;
  const regs = vidasDoContrato(contrato.id);
  if(regs.length) return vidasAtivas(regs).length;
  return Number(contrato.vidas)||0;
}
/** O contrato já foi detalhado vida a vida? */
const vidasDetalhadas = contrato => vidasDoContrato(contrato.id).length > 0;

/** Vidas em escopo para quem está olhando (o corretor vê só as suas). */
function vidasNoEscopo(){
  return (S.vidas||[]).filter(v=>{
    const ct = contratoPorId(v.contratoId);
    return ct ? noEscopo(ct, "corretor") : false;
  });
}
/** Apaga as vidas de um contrato que vai ser apagado: CPF e nascimento não ficam órfãos. */
async function apagarVidasDoContrato(contratoId){
  for(const v of vidasDoContrato(contratoId).slice()){
    await remover("vidas", v.id, null);
  }
}
/** Contratos que contam vida e ainda não foram detalhados — o trabalho que falta. */
function contratosSemDetalhe(){
  return S.contratos.filter(c=>c.status!=="cancelado" && contratoTemVida(c)
    && (Number(c.vidas)||0) > 0 && !vidasDetalhadas(c) && noEscopo(c,"corretor"));
}

/* ============================================================
   ÍNDICES EM MEMÓRIA
   Antes, cada cartão de cliente varria a lista inteira de contratos para
   somar a receita dele: com 5.000 clientes e 6.667 contratos isso é
   33 milhões de comparações a cada desenho de tela. Os mapas abaixo são
   montados uma vez por mudança de dados e consultados em tempo constante.
   ============================================================ */
let IDX = null;
function invalidarIndices(){ IDX = null; CACHE_PARCELAS = null; }
function indices(){
  if(IDX) return IDX;
  const porCliente = new Map();      // clienteId -> contratos
  const porContrato = new Map();     // contratoId -> contrato
  const vidasPorContrato = new Map();// contratoId -> vidas
  const vidasPorCliente = new Map(); // clienteId -> vidas
  const clientePorId = new Map();    // clienteId -> cliente
  const clientePorDoc = new Map();   // documento limpo -> cliente
  for(const c of S.clientes){
    clientePorId.set(c.id, c);
    const d = normDoc(c.doc);
    if(d) clientePorDoc.set(d, c);
  }
  for(const ct of S.contratos){
    porContrato.set(ct.id, ct);
    const arr = porCliente.get(ct.clienteId);
    if(arr) arr.push(ct); else porCliente.set(ct.clienteId, [ct]);
  }
  for(const v of (S.vidas||[])){
    const a = vidasPorContrato.get(v.contratoId);
    if(a) a.push(v); else vidasPorContrato.set(v.contratoId, [v]);
    const ct = porContrato.get(v.contratoId);
    const cid = (ct && ct.clienteId) || v.clienteId;
    if(cid){ const b = vidasPorCliente.get(cid); if(b) b.push(v); else vidasPorCliente.set(cid, [v]); }
  }
  IDX = { porCliente, porContrato, vidasPorContrato, vidasPorCliente, clientePorId, clientePorDoc };
  return IDX;
}
const contratosDoCliente = id => indices().porCliente.get(id) || [];
const contratoPorId      = id => indices().porContrato.get(id) || null;
const vidasDoContrato    = id => indices().vidasPorContrato.get(id) || [];
const vidasDoCliente     = id => indices().vidasPorCliente.get(id) || [];
const clientePorId       = id => indices().clientePorId.get(id) || null;
const soDigitos          = v => String(v||"").replace(/\D/g,"");
/** Cliente que já tem esse CPF/CNPJ — a trava de duplicidade da etapa 3. */
function clientePorDoc(doc, exceto){
  const d = normDoc(doc);
  if(!d) return null;
  const c = indices().clientePorDoc.get(d);
  return (c && c.id !== exceto) ? c : null;
}

/* Cache das parcelas: parcelas() achata todos os cronogramas e era refeito
   a cada desenho. Agora é refeito só quando os contratos mudam. */
let CACHE_PARCELAS = null, CACHE_PARCELAS_CHAVE = "";
/** Todas as parcelas de comissão, achatadas, com o contexto do contrato.
    valorCorretora é o que fica com a corretora depois do repasse e do imposto. */
function parcelas(){
  const chave = (Number(S.config && S.config.impostoPadrao)||0) + "|" + ((S.config && S.config.splitSobre)||"");
  if(CACHE_PARCELAS && CACHE_PARCELAS_CHAVE===chave) return CACHE_PARCELAS;
  CACHE_PARCELAS_CHAVE = chave;
  const out=[];
  for(const c of S.contratos){
    if(c.status==="cancelado") continue;
    for(const p of (c.comissoes||[])){
      const efetivo = Number(p.status==="recebido" ? (p.valorRecebido??p.valor) : p.valor)||0;
      const aliquota = aliquotaDe(p, c);
      const imposto = +(efetivo*aliquota/100).toFixed(2);
      const valorCorretor = +(efetivo*fatorCorretor(p, c)).toFixed(2);
      out.push({
        ...p, tipo:p.tipo||"agenciamento", contratoId:c.id, contrato:c,
        cliente:c.clienteNome, pilar:c.pilar, operadora:c.operadora,
        corretor:c.corretor, mes:p.vence.slice(0,7),
        efetivo, aliquota, imposto, liquido:+(efetivo-imposto).toFixed(2),
        valorCorretor,
        valorCorretora:+(efetivo-imposto-valorCorretor).toFixed(2),
        vencida: p.status==="previsto" && p.vence < hoje()
      });
    }
  }
  CACHE_PARCELAS = out;
  return out;
}
/** Comissão estimada de um lead: régua prevista aplicada ao valor estimado,
    projetada em 12 meses a partir da data prevista de fechamento. */
/** A estimativa do lead na medida de quem olha: o gestor vê o total; o corretor,
    a parte dele pelo split de quem responde pelo lead. */
function parteDoLead(l, E){
  const q = veCorretora() ? 1
    : ((S.usuarios.find(u=>u.id===(l.responsavel||S.uid))||{}).splitPct ?? 50) / 100;
  const linhas = (E.linhas||[]).map(x=>Object.assign({}, x, { valor:+((Number(x.valor)||0)*q).toFixed(2) }));
  const total = linhas.reduce((a,x)=>a+(Number(x.valor)||0),0);
  return Object.assign({}, E, { linhas, total, ponderado: total*E.prob });
}
function estimativaLead(l){
  const regra = regraPorId(l.regraId) || S.config.regras.find(r=>r.pilar===l.pilar) || S.config.regras[0];
  const base = Number(l.valorEstimado)||0;
  const fecha = l.previsaoFechamento || addDays(l.criadoEm||hoje(), 30);
  const etapa = S.config.etapas.find(e=>e.id===l.etapa);
  const prob = (etapa?etapa.prob:0)/100;
  // parcelas montadas à mão no lead têm precedência sobre a régua
  if((l.comissoesPrevistas||[]).length){
    return parteDoLead(l, { fecha, prob, meses:mesesAte(fecha), regra:null, linhas:l.comissoesPrevistas, manual:true });
  }
  if(!regra) return { total:0, ponderado:0, fecha, prob, meses:0, regra:null, linhas:[] };
  const falso = { valorBase:base, inicio:fecha, fim:addMonths(fecha,12), regraId:regra.id, comissoes:[] };
  const linhas = gerarCronograma(falso).filter(x=>x.vence<=addMonths(fecha,12));
  return parteDoLead(l, { fecha, prob, meses:mesesAte(fecha), regra, linhas });
}
function mesesAte(iso){ return Math.max(0, Math.round(diasEntre(hoje(), iso)/30.44)); }
/** Só o gestor enxerga o que fica com a corretora. Para os demais, os
    valores exibidos são sempre a fatia da própria pessoa. */
/** Quem enxerga o lado da corretora (valor cheio da comissão, split, percentuais):
    o gestor sempre; um corretor apenas se o gestor o liberou em “Alcance”. */
const veCorretora = () => {
  if(S.mePapel === "gestor") return true;
  if(S.mePapel !== "corretor") return false;   // assistente: nunca, mesmo com alcance total
  const u = typeof meuUsuario === "function" ? meuUsuario() : null;
  return !!(u && u.verTudo);
};
/** O assistente opera a carteira mas não vê comissão nenhuma — nem a cheia, nem "a sua". */
const ocultaComissao = () => S.mePapel === "assistente";
const fatia = (v, p) => +( (Number(v)||0) * fatorCorretor(p, p.contrato) ).toFixed(2);
/** Valor previsto da parcela como este usuário deve vê-lo. */
const valorVis   = p => veCorretora() ? p.valor   : fatia(p.valor, p);
/** Valor efetivo (recebido, ou previsto se ainda não veio). */
const efetivoVis = p => veCorretora() ? p.efetivo : p.valorCorretor;
/** Desfazer um recebimento mexe na conciliação: só o gestor. */
const podeDesfazer = () => S.mePapel === "gestor";
/** Excluir cliente ou contrato apaga histórico e comissão: só o gestor. */
const podeExcluirCarteira = () => S.mePapel === "gestor";

/** Aviso fixo para quem não é gestor: os valores de comissão na tela são a parte dele. */
const avisoSuaParte = () => (veCorretora() || ocultaComissao()) ? "" :
  `<div class="hint" style="margin:-4px 0 14px">Os valores de comissão nesta tela são <b>a sua parte</b> — o que a corretora recebe não aparece aqui.</div>`;

function noEscopo(item, campo){
  if(S.escopo==="todos" && !escopoTravado()) return true;
  return item[campo||"responsavel"]===S.uid;
}

/* ============================================================
   IMPOSTO SOBRE A COMISSÃO
   A alíquota vem da própria parcela, senão do contrato, senão do padrão
   em Configurações. O imposto sai da parte da corretora; o repasse do
   corretor é calculado sobre o bruto — ou sobre o líquido, se o gestor
   escolher assim em Configurações.
   ============================================================ */
const temValor = v => v!=null && v!=="" && !isNaN(Number(v));
function aliquotaDe(p, c){
  if(p && temValor(p.impostoPct)) return Number(p.impostoPct);
  if(c && temValor(c.impostoPct)) return Number(c.impostoPct);
  return Number(S.config && S.config.impostoPadrao)||0;
}
const splitSobreLiquido = () => !!(S.config && S.config.splitSobre==="liquido");
/** Quanto de cada real da parcela vai para o corretor. */
function fatorCorretor(p, c){
  const split = (Number(c && c.splitPct)||0)/100;
  return splitSobreLiquido() ? split*(1-aliquotaDe(p,c)/100) : split;
}
const haImposto = () => (Number(S.config && S.config.impostoPadrao)||0) > 0
  || S.contratos.some(c=>temValor(c.impostoPct) && Number(c.impostoPct)>0 || (c.comissoes||[]).some(p=>temValor(p.impostoPct) && Number(p.impostoPct)>0));

