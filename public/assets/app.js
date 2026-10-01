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

/* ---------- assinatura da marca ----------
   Escudo e assinatura horizontal extraídos em vetor do Manual da Marca
   (página "Versões do logotipo"). Não é redesenho: são os caminhos do
   arquivo original, só reescalados. Fundo claro usa a versão principal
   (escudo preto); fundo escuro, a negativa (escudo verde) — regra do manual. */
const ESCUDO = {
  contorno:"M60 4 110 20V66C110 100 88 122 60 136 32 122 10 100 10 66V20Z",
  filete:"M60 11.5 103 25.2V66C103 95.5 84 114.5 60 127.5 36 114.5 17 95.5 17 66V25.2Z",
  laterais:"M35.5 53h15v3.4h-15zM38 56.4h10V97H38zM69.5 53h15v3.4h-15zM72 56.4h10V97H72z",
  centro:"M52.5 41h15v3.4h-15zM55 44.4h10V97H55zM34 99.5h52v4.2H34z"
};
const CORES_ESCUDO = {
  principal:{ fundo:"#0E1110", lado:"#1B7F4E", ouro:"#F1E1A0" },
  negativo: { fundo:"#1B7F4E", lado:"#0E1110", ouro:"#F1E1A0" }
};
/** "principal", "negativo", ou "tema" (segue o fundo pela folha de estilo). */
function escudoOficial(v){
  const c = CORES_ESCUDO[v] || CORES_ESCUDO.principal;
  const pinta = (papel, cor) => v==="tema" ? `style="fill:var(--escudo-${papel},${cor})"` : `fill="${cor}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 2 104 136" role="img" aria-label="Erbe">`
    + `<path ${pinta("fundo",c.fundo)} d="${ESCUDO.contorno}"/>`
    + `<path fill="none" stroke="${c.ouro}" stroke-width="1.6" d="${ESCUDO.filete}"/>`
    + `<path ${pinta("lado",c.lado)} d="${ESCUDO.laterais}"/>`
    + `<path fill="${c.ouro}" d="${ESCUDO.centro}"/></svg>`;
}
/** Assinatura horizontal principal (escudo + ERBE + Proteção e Patrimônio), para os relatórios. */
const ASSINATURA_H = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1081 437"><path fill="#0E1110" d="M165 0L331 53L331 205C331 318 258 391 165 437C73 391 0 318 0 205L0 53Z"/><path fill="none" stroke="#F1E1A0" stroke-width="5.3" d="M165 25L308 70L308 205C308 303 245 366 165 409C86 366 23 303 23 205L23 70Z"/><path fill="#1B7F4E" d="M84 162L134 162L134 173L84 173Z"/><path fill="#1B7F4E" d="M93 173L126 173L126 308L93 308Z"/><path fill="#F1E1A0" d="M141 122L190 122L190 134L141 134Z"/><path fill="#F1E1A0" d="M149 134L182 134L182 308L149 308Z"/><path fill="#1B7F4E" d="M197 162L247 162L247 173L197 173Z"/><path fill="#1B7F4E" d="M205 173L238 173L238 308L205 308Z"/><path fill="#F1E1A0" d="M80 316L252 316L252 330L80 330Z"/><path fill="#0E1110" d="M467 203L467 48L492 48L492 203ZM488 203L488 181L560 181L560 203ZM488 135L488 113L554 113L554 135ZM488 70L488 48L559 48L559 70Z"/><path fill="#0E1110" d="M628 203L628 47L653 47L653 203ZM723 203L674 135L703 135L753 203ZM645 149L645 128L685 128C691 128 697 127 701 124C705 122 709 118 711 114C714 109 715 104 715 98C715 93 714 88 711 83C709 79 705 75 701 73C697 70 691 69 685 69L645 69L645 47L682 47C694 47 704 49 713 52C722 56 729 62 733 69C738 76 741 85 741 97L741 100C741 111 738 121 733 128C728 135 722 140 713 144C704 147 694 149 682 149Z"/><path fill="#0E1110" d="M832 204L832 183L873 183C881 183 887 181 891 176C895 172 898 166 898 159C898 152 895 146 891 142C887 137 881 135 873 135L832 135L832 119L871 119C881 119 890 120 898 123C906 125 912 129 916 135C921 141 923 148 923 158L923 161C923 170 921 178 917 184C913 191 908 196 900 199C892 202 882 204 871 204ZM811 204L811 47L837 47L837 204ZM832 131L832 115L868 115C876 115 882 113 885 108C889 104 891 98 891 92C891 85 889 79 885 75C882 71 876 68 868 68L832 68L832 47L864 47C882 47 895 51 904 58C912 65 917 76 917 89L917 92C917 102 914 110 910 115C906 121 899 125 892 127C884 130 875 131 864 131Z"/><path fill="#0E1110" d="M988 203L988 48L1013 48L1013 203ZM1009 203L1009 181L1081 181L1081 203ZM1009 135L1009 113L1075 113L1075 135ZM1009 70L1009 48L1079 48L1079 70Z"/><path fill="#1B7F4E" d="M447 256L537 256L537 263L447 263Z"/><path fill="#13603B" d="M452 322L452 319L458 319C459 319 460 318 461 318C462 317 463 317 463 316C464 315 464 314 464 313C464 312 464 311 463 310C463 310 462 309 461 308C460 308 459 308 458 308L452 308L452 305L458 305C460 305 461 305 463 306C464 306 465 307 466 309C467 310 467 311 467 313L467 313C467 315 467 317 466 318C465 319 464 320 463 321C461 321 460 322 458 322ZM450 331L450 305L453 305L453 331Z"/><path fill="#13603B" d="M486 331L486 305L489 305L489 331ZM501 331L493 319L497 319L506 331ZM488 321L488 318L494 318C496 318 497 318 497 318C498 317 499 317 499 316C500 315 500 314 500 313C500 312 500 311 499 310C499 310 498 309 497 308C497 308 496 308 494 308L488 308L488 305L494 305C496 305 497 305 499 306C500 306 501 307 502 308C503 309 503 311 503 313L503 313C503 315 503 317 502 318C501 319 500 320 499 321C497 321 496 321 494 321Z"/><path fill="#13603B" d="M533 331C530 331 529 331 527 330C525 329 524 328 523 327C522 325 521 324 520 322C520 321 520 320 520 318L520 317C520 316 520 314 520 313C521 311 522 310 523 308C524 307 525 306 527 305C529 305 530 304 533 304C535 304 537 305 539 305C540 306 542 307 543 308C544 310 545 311 545 313C546 314 546 316 546 317L546 318C546 320 546 321 545 322C545 324 544 325 543 327C542 328 540 329 539 330C537 331 535 331 533 331ZM533 328C534 328 536 328 537 327C538 327 539 326 540 325C541 324 541 323 542 322C542 320 542 319 542 318C542 316 542 315 542 314C541 312 541 311 540 310C539 309 538 309 537 308C536 308 534 307 533 307C531 307 530 308 529 308C528 309 526 309 526 310C525 311 524 312 524 314C523 315 523 316 523 318C523 319 523 320 524 322C524 323 525 324 526 325C526 326 528 327 529 327C530 328 531 328 533 328Z"/><path fill="#13603B" d="M570 331L570 307L573 307L573 331ZM562 308L562 305L581 305L581 308Z"/><path fill="#13603B" d="M600 331L600 305L604 305L604 331ZM603 331L603 328L616 328L616 331ZM603 319L603 316L614 316L614 319ZM603 308L603 305L615 305L615 308Z"/><path fill="#13603B" d="M647 331C645 331 643 331 641 330C640 329 638 328 637 327C636 326 635 324 635 322C634 321 634 320 634 318L634 317C634 316 634 314 635 313C636 311 636 310 637 308C638 307 640 306 641 305C643 305 645 304 647 304C649 304 651 305 653 305C655 306 656 307 657 309C658 310 658 312 659 314L655 314C655 312 654 311 654 310C653 309 652 308 651 308C650 308 648 307 647 307C646 307 644 308 643 308C642 309 641 309 640 310C639 311 639 312 638 314C638 315 638 316 638 318C638 319 638 320 638 322C639 323 639 324 640 325C641 326 642 327 643 327C644 328 646 328 647 328C649 328 651 328 653 326C654 325 655 324 656 322L659 322C659 323 658 325 657 326C656 328 655 329 653 330C652 331 650 331 647 331ZM647 339C647 339 646 339 646 339C645 339 645 339 644 339L644 337C645 337 645 337 646 337C646 337 647 337 647 337C648 337 648 337 649 337C649 336 649 336 649 336C649 335 649 335 649 335C649 335 648 335 647 335L646 335L646 330L648 330L648 334L647 332L647 332C649 332 650 333 651 333C651 334 652 335 652 336C652 337 651 338 651 338C650 339 649 339 647 339Z"/><path fill="#13603B" d="M676 331L686 305L692 305L701 331L698 331L689 307L691 308L687 308L688 307L680 331ZM682 323L683 320L694 320L696 323ZM692 302C691 302 691 302 690 302C690 302 689 301 689 301C689 301 688 301 688 301C687 300 687 300 686 300C686 300 685 300 685 301C684 301 684 301 683 302L683 300C683 299 684 299 684 298C685 298 686 298 686 298C687 298 688 298 688 298C689 298 689 298 689 299C690 299 690 299 690 299C691 299 691 300 692 300C692 300 693 299 694 299C694 299 694 298 695 298L695 300C695 301 695 301 694 301C693 302 693 302 692 302Z"/><path fill="#13603B" d="M734 331C732 331 730 331 728 330C726 329 725 328 724 327C723 325 722 324 722 322C721 321 721 320 721 318L721 317C721 316 721 314 722 313C722 311 723 310 724 308C725 307 727 306 728 305C730 305 732 304 734 304C736 304 738 305 740 305C742 306 743 307 744 308C745 310 746 311 747 313C747 314 747 316 747 317L747 318C747 320 747 321 747 322C746 324 745 325 744 327C743 328 742 329 740 330C738 331 736 331 734 331ZM734 328C736 328 737 328 738 327C739 327 740 326 741 325C742 324 743 323 743 322C744 320 744 319 744 318C744 316 744 315 743 314C743 312 742 311 741 310C740 309 739 309 738 308C737 308 736 307 734 307C733 307 731 308 730 308C729 309 728 309 727 310C726 311 726 312 725 314C725 315 724 316 724 318C724 319 725 320 725 322C726 323 726 324 727 325C728 326 729 327 730 327C731 328 733 328 734 328Z"/><path fill="#13603B" d="M787 331L787 305L790 305L790 331ZM789 331L789 328L802 328L802 331ZM789 319L789 316L801 316L801 319ZM789 308L789 305L801 305L801 308Z"/><path fill="#13603B" d="M452 367L452 364L458 364C459 364 460 363 461 363C462 362 463 362 463 361C464 360 464 359 464 358C464 357 464 356 463 355C463 355 462 354 461 353C460 353 459 353 458 353L452 353L452 350L458 350C460 350 461 350 463 351C464 351 465 352 466 353C467 355 467 356 467 358L467 358C467 360 467 362 466 363C465 364 464 365 463 366C461 366 460 367 458 367ZM450 376L450 350L453 350L453 376Z"/><path fill="#13603B" d="M483 376L492 350L498 350L507 376L504 376L495 352L497 353L493 353L494 352L486 376ZM488 368L489 365L500 365L502 368Z"/><path fill="#13603B" d="M534 376L534 352L537 352L537 376ZM526 353L526 350L545 350L545 353Z"/><path fill="#13603B" d="M564 376L564 350L568 350L568 376ZM580 376L572 364L576 364L585 376ZM567 366L567 363L574 363C575 363 576 363 576 362C577 362 578 362 578 361C579 360 579 359 579 358C579 357 579 356 578 355C578 355 577 354 576 353C576 353 575 353 574 353L567 353L567 350L573 350C575 350 576 350 578 351C579 351 580 352 581 353C582 354 582 356 582 358L582 358C582 360 582 362 581 363C580 364 579 365 578 366C576 366 575 366 573 366Z"/><path fill="#13603B" d="M600 350L604 350L604 376L600 376Z"/><path fill="#13603B" d="M621 376L621 350L626 350L633 367L634 367L641 350L646 350L646 376L643 376L643 354L643 354L636 370L631 370L624 354L624 354L624 376Z"/><path fill="#13603B" d="M676 376C674 376 672 376 670 375C668 374 667 373 666 372C665 370 664 369 663 368C663 366 663 364 663 363L663 362C663 361 663 359 663 358C664 356 665 355 666 353C667 352 668 351 670 350C672 350 674 349 676 349C678 349 680 350 682 350C683 351 685 352 686 353C687 355 688 356 688 358C689 359 689 361 689 362L689 363C689 364 689 366 688 368C688 369 687 370 686 372C685 373 684 374 682 375C680 376 678 376 676 376ZM676 373C677 373 679 373 680 372C681 372 682 371 683 370C684 369 684 368 685 367C685 365 686 364 686 363C686 361 685 360 685 359C684 357 684 356 683 355C682 354 681 354 680 353C679 353 677 352 676 352C674 352 673 353 672 353C671 354 670 354 669 355C668 356 667 357 667 359C666 360 666 361 666 363C666 364 666 365 667 367C667 368 668 369 669 370C670 371 671 372 672 372C673 373 674 373 676 373ZM669 348L674 342L678 342L683 348L679 348L676 344L676 344L672 348Z"/><path fill="#13603B" d="M708 376L708 350L713 350L726 372L728 372L727 373L727 350L730 350L730 376L724 376L711 353L710 353L711 352L711 376Z"/><path fill="#13603B" d="M751 350L754 350L754 376L751 376Z"/><path fill="#13603B" d="M783 376C781 376 779 376 777 375C776 374 774 373 773 372C772 370 771 369 771 368C770 366 770 364 770 363L770 362C770 361 770 359 771 358C771 356 772 355 773 353C774 352 776 351 777 350C779 350 781 349 783 349C785 349 787 350 789 350C791 351 792 352 793 353C794 355 795 356 796 358C796 359 796 361 796 362L796 363C796 364 796 366 796 368C795 369 794 370 793 372C792 373 791 374 789 375C788 376 786 376 783 376ZM783 373C785 373 786 373 787 372C788 372 790 371 790 370C791 369 792 368 792 367C793 365 793 364 793 363C793 361 793 360 792 359C792 357 791 356 790 355C790 354 788 354 787 353C786 353 785 352 783 352C782 352 780 353 779 353C778 354 777 354 776 355C775 356 774 357 774 359C774 360 773 361 773 363C773 364 774 365 774 367C774 368 775 369 776 370C777 371 778 372 779 372C780 373 782 373 783 373Z"/></svg>`;
function marcaSVG(){
  const bruto = (S.config && S.config.logoSvg || "").trim();
  if(/^https?:\/\//i.test(bruto)) return `<img src="${esc(bruto)}" alt="">`;
  if(/^<svg[\s>]/i.test(bruto)) return bruto;
  return escudoOficial("tema");
}
function pintarMarca(){
  const svg = marcaSVG();
  document.querySelectorAll("[data-marca]").forEach(el=>{ el.innerHTML = svg; });
}
/** Logotipo dos relatórios: um SVG trocado em Configurações vale; senão, a assinatura oficial. */
function logoDosRelatorios(){
  const bruto = (S.config && S.config.logoSvg || "").trim();
  return /^<svg[\s>]/i.test(bruto) ? bruto : ASSINATURA_H;
}

/* ---------- exportação em CSV ---------- */
/** CSV que o Excel brasileiro abre sem reclamar: ponto e vírgula, BOM e vírgula decimal. */
function baixarCSV(nome, colunas, linhas){
  const esc2 = v => {
    let s = v==null ? "" : String(v);
    // uma célula começando com = + - @ o Excel executa como fórmula
    if(/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const corpo = [colunas.map(esc2).join(";")]
    .concat(linhas.map(l=>l.map(esc2).join(";"))).join("\r\n");
  entregarArquivo(`${nome}-${hoje()}.csv`, "﻿"+corpo, "text/csv;charset=utf-8");
}
/** Entrega um arquivo ao usuário. Dentro do artifact isso passa pela permissão
    de download do próprio visualizador; no sistema publicado (Netlify) o link
    comum do navegador resolve. Tenta o primeiro e cai no segundo. */
/* ============================================================
   ARQUIVOS: entrega, Excel (.xlsx) e PDF
   O .xlsx é montado aqui mesmo (é um ZIP de XMLs), sem biblioteca.
   O PDF usa o jsPDF, carregado só quando alguém pede um PDF — primeiro
   da pasta vendor/ publicada junto com o sistema, depois da CDN.
   ============================================================ */
/** Oferece um arquivo para download. Aceita texto, Blob ou bytes. */
async function entregarArquivo(nome, dados, mime){
  try{
    const d = await window.claude?.use?.("downloads");
    if(d && d.save){
      try{ await d.save({ filename:nome, data:dados }); toast("Arquivo pronto"); return true; }
      catch(e){
        const c = e && e.code;
        if(c==="declined") return true;      // a pessoa escolheu não baixar: nada a fazer
        if(c==="rate_limited"){ toast("Já tem um download esperando a sua confirmação."); return false; }
        if(c==="rejected_extension" || c==="extension_not_enabled"){ toast("Este formato não pode ser baixado aqui."); return false; }
        if(c==="too_large"){ toast("O arquivo ficou grande demais — aplique mais filtros."); return false; }
        // qualquer outro motivo: tenta o download comum do navegador
      }
    }
  }catch(e){}
  try{
    const blob = dados instanceof Blob ? dados : new Blob([dados], {type: mime || "application/octet-stream"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast("Arquivo pronto");
    return true;
  }catch(e){ toast("Não foi possível gerar o arquivo aqui."); return false; }
}

/** Desenha um SVG num canvas e devolve o PNG (para o PDF e para o Excel). */
async function svgParaPng(svg, alturaPx){
  const m = /viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  const vw = m ? Number(m[3]) : 100, vh = m ? Number(m[4]) : 100;
  const h = Math.round(alturaPx), w = Math.max(1, Math.round(h*vw/vh));
  let fonte = String(svg).replace(/<svg\b([^>]*)>/, (t, attrs)=>{
    attrs = attrs.replace(/\s(width|height)="[^"]*"/g, "");
    if(!/xmlns=/.test(attrs)) attrs += ' xmlns="http://www.w3.org/2000/svg"';
    return `<svg${attrs} width="${w}" height="${h}">`;
  });
  // data: primeiro; se a página não permitir, tenta um blob:
  const carregar = src => new Promise((ok, erro)=>{ const im = new Image(); im.onload = ()=>ok(im); im.onerror = erro; im.src = src; });
  let img;
  try{ img = await carregar("data:image/svg+xml;charset=utf-8," + encodeURIComponent(fonte)); }
  catch(e){
    const u = URL.createObjectURL(new Blob([fonte], {type:"image/svg+xml"}));
    try{ img = await carregar(u); } finally { setTimeout(()=>URL.revokeObjectURL(u), 1000); }
  }
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  cv.getContext("2d").drawImage(img, 0, 0, w, h);
  const dataUrl = cv.toDataURL("image/png");
  const bin = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return { dataUrl, bytes, w, h };
}
let LOGO_REL = null;
async function logoRelatorio(){
  const svg = logoDosRelatorios();
  if(LOGO_REL && LOGO_REL.svg===svg) return LOGO_REL.png;
  try{ const png = await svgParaPng(svg, 132); LOGO_REL = { svg, png }; return png; }
  catch(e){ return null; }
}

/* ---------- ZIP (o contêiner do .xlsx) ---------- */
const CRC_TAB = (()=>{ const t = new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; }
  return t; })();
function crc32(b){ let c = 0xFFFFFFFF; for(let i=0;i<b.length;i++) c = CRC_TAB[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
async function comprimir(bytes){
  if(typeof CompressionStream!=="function") return null;
  try{
    const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  }catch(e){ return null; }
}
async function zipar(arquivos, mime){
  const enc = new TextEncoder();
  const partes = [], central = []; let offset = 0;
  const d = new Date();
  const hora = (d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2);
  const data = ((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  for(const a of arquivos){
    const nome = enc.encode(a.nome);
    const bruto = typeof a.dados==="string" ? enc.encode(a.dados) : a.dados;
    const crc = crc32(bruto);
    let corpo = await comprimir(bruto), metodo = 8;
    if(!corpo || corpo.length >= bruto.length){ corpo = bruto; metodo = 0; }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,metodo,true);
    lh.setUint16(10,hora,true); lh.setUint16(12,data,true); lh.setUint32(14,crc,true);
    lh.setUint32(18,corpo.length,true); lh.setUint32(22,bruto.length,true); lh.setUint16(26,nome.length,true);
    partes.push(new Uint8Array(lh.buffer), nome, corpo);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true);
    ch.setUint16(10,metodo,true); ch.setUint16(12,hora,true); ch.setUint16(14,data,true); ch.setUint32(16,crc,true);
    ch.setUint32(20,corpo.length,true); ch.setUint32(24,bruto.length,true); ch.setUint16(28,nome.length,true);
    ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer), nome);
    offset += 30 + nome.length + corpo.length;
  }
  const tam = central.reduce((a,b)=>a+b.length,0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0,0x06054b50,true); fim.setUint16(8,arquivos.length,true); fim.setUint16(10,arquivos.length,true);
  fim.setUint32(12,tam,true); fim.setUint32(16,offset,true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], {type: mime||"application/zip"});
}

/* ---------- Excel ----------
   Formatos de coluna: texto · moeda · data (AAAA-MM-DD) · int · pct (3,5 = 3,5%) · num */
const XL_ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;[Red]\\-&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="0.00&quot;%&quot;"/></numFmts>
<fonts count="7">
<font><sz val="10"/><color rgb="FF0E1110"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FF0E1110"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="9"/><color rgb="FF5A5F5B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF0E1110"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FF7E837F"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF13603B"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF13603B"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1EFE8"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF0E1110"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="hair"><color rgb="FFD3D0C6"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF0E1110"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="17">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="4" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="4" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>
<xf numFmtId="4" fontId="4" fillId="3" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
const XL_ESTILO_CORPO = { texto:4, moeda:5, data:6, int:7, pct:8, num:14 };
const XL_ESTILO_TOTAL = { texto:9, moeda:10, data:9, int:11, pct:9, num:16 };
const xmlEsc = s => String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
function colLetra(i){ let s = ""; i++; while(i>0){ const m=(i-1)%26; s = String.fromCharCode(65+m)+s; i = Math.floor((i-1)/26); } return s; }
const serialExcel = iso => { const [y,m,d] = iso.slice(0,10).split("-").map(Number); return (Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/864e5; };
const nomeDeAba = (n, usados) => {
  let s = String(n||"Planilha").replace(/[\[\]:*?\/\\]/g," ").slice(0,31).trim() || "Planilha";
  let k = s, i = 2; while(usados.has(k)){ k = s.slice(0,28)+" "+(i++); } usados.add(k); return k;
};
/** Texto como aparece na célula, para medir a largura da coluna. */
function textoCelula(v, f){
  if(v==null || v==="") return "";
  if(f==="moeda") return brl2(v);
  if(f==="data") return dt(String(v));
  if(f==="int") return (Number(v)||0).toLocaleString("pt-BR");
  if(f==="pct") return pctR(v);
  if(f==="num") return (Number(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  return String(v);
}
function celulaXl(ref, v, f, estilo){
  if(v==null || v==="") return `<c r="${ref}" s="${estilo}"/>`;
  if(f==="data"){
    if(!/^\d{4}-\d{2}-\d{2}/.test(String(v))) return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
    return `<c r="${ref}" s="${estilo}"><v>${serialExcel(String(v))}</v></c>`;
  }
  if(["moeda","int","pct","num"].includes(f) && typeof v==="number" && isFinite(v))
    return `<c r="${ref}" s="${estilo}"><v>${+v.toFixed(f==="int"?0:4)}</v></c>`;
  return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}
const linhaXl = (r, cels, alt) => `<row r="${r}"${alt?` ht="${alt}" customHeight="1"`:""}>${cels.join("")}</row>`;

async function gerarXlsx(rel){
  const logo = await logoRelatorio();
  const usados = new Set();
  const abas = rel.folhas.map(f=>({ f, nome:nomeDeAba(f.nome, usados) }));
  const arquivos = [];
  const LINHA_CAB = 6;             // linha do cabeçalho da tabela
  const sheetsXml = [], defs = [];
  abas.forEach(({f, nome}, idx)=>{
    const cols = f.colunas, nC = cols.length;
    const ult = colLetra(Math.max(nC,1)-1);
    const linhas = [];
    const iLogo = !!logo;
    linhas.push(linhaXl(1, [], iLogo ? 40 : null));
    linhas.push(linhaXl(2, [celulaXl("A2", f.titulo || rel.titulo, "texto", 1)], 22));
    linhas.push(linhaXl(3, [celulaXl("A3", rel.filtrosTexto || "", "texto", 2)]));
    linhas.push(linhaXl(4, [celulaXl("A4", `Gerado em ${rel.geradoEm}${rel.geradoPor?` por ${rel.geradoPor}`:""} · Erbe Proteção e Patrimônio`, "texto", 2)]));
    linhas.push(linhaXl(5, rel.nota && idx===0 ? [celulaXl("A5", rel.nota, "texto", 12)] : []));
    linhas.push(linhaXl(LINHA_CAB, cols.map((c,i)=>celulaXl(colLetra(i)+LINHA_CAB, c.t, "texto",
      ["moeda","int","pct","num"].includes(c.f) ? 15 : 3)), 30));
    let r = LINHA_CAB;
    f.linhas.forEach(l=>{
      r++;
      linhas.push(linhaXl(r, cols.map((c,i)=>celulaXl(colLetra(i)+r, l[i], c.f, XL_ESTILO_CORPO[c.f]||4))));
    });
    const primeiraDado = LINHA_CAB+1, ultimaDado = Math.max(r, LINHA_CAB);
    if(!f.linhas.length){
      r++; linhas.push(linhaXl(r, [celulaXl("A"+r, f.vazio || "Nenhum registro com esses filtros.", "texto", 12)]));
    } else if(f.total){
      r++;
      linhas.push(linhaXl(r, cols.map((c,i)=>{
        const ref = colLetra(i)+r, v = f.total[i], est = XL_ESTILO_TOTAL[c.f]||9;
        if(typeof v==="number" && ["moeda","int","num"].includes(c.f)){
          const rng = `${colLetra(i)}${primeiraDado}:${colLetra(i)}${ultimaDado}`;
          return `<c r="${ref}" s="${est}"><f>SUBTOTAL(109,${rng})</f><v>${+v.toFixed(4)}</v></c>`;
        }
        return celulaXl(ref, v, "texto", est);
      }), 20));
    }
    if(f.rodape){ r += 2; linhas.push(linhaXl(r, [celulaXl("A"+r, f.rodape, "texto", 12)])); }
    // larguras: o maior entre o cabeçalho (quebra em duas linhas) e o conteúdo
    const larg = cols.map((c,i)=>{
      let m = Math.ceil(String(c.t).length*0.62);
      const amostra = f.linhas.length>1500 ? f.linhas.slice(0,1500) : f.linhas;
      for(const l of amostra){ const t = textoCelula(l[i], c.f).length; if(t>m) m = t; }
      if(f.total && f.total[i]!=null) m = Math.max(m, textoCelula(f.total[i], c.f).length);
      return Math.min(c.max||46, Math.max(c.min||8, m+2));
    });
    const refFiltro = `A${LINHA_CAB}:${ult}${ultimaDado}`;
    const paisagem = rel.orientacao==="paisagem" || nC > 7;
    sheetsXml.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${ult}${Math.max(r,LINHA_CAB)}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"${idx===0?' tabSelected="1"':""}><pane ySplit="${LINHA_CAB}" topLeftCell="A${LINHA_CAB+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${LINHA_CAB+1}" sqref="A${LINHA_CAB+1}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${larg.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${linhas.join("")}</sheetData>
${f.linhas.length?`<autoFilter ref="${refFiltro}"/>`:""}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${paisagem?"landscape":"portrait"}" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;L&amp;8Erbe Proteção e Patrimônio · ${xmlEsc(rel.titulo)}&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>
${logo?`<drawing r:id="rId1"/>`:""}
</worksheet>`);
    const q = "'" + nome.replace(/'/g,"''") + "'";
    if(f.linhas.length) defs.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${idx}" hidden="1">${xmlEsc(q)}!$A$${LINHA_CAB}:$${ult}$${ultimaDado}</definedName>`);
    defs.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${idx}">${xmlEsc(q)}!$${LINHA_CAB}:$${LINHA_CAB}</definedName>`);
  });

  const n = abas.length;
  arquivos.push({ nome:"[Content_Types].xml", dados:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${abas.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
${logo?abas.map((_,i)=>`<Override PartName="/xl/drawings/drawing${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join(""):""}
</Types>` });
  arquivos.push({ nome:"_rels/.rels", dados:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>` });
  arquivos.push({ nome:"docProps/core.xml", dados:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(rel.titulo)}</dc:title><dc:creator>Erbe · Central</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0,19)}Z</dcterms:created></cp:coreProperties>` });
  arquivos.push({ nome:"xl/workbook.xml", dados:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${abas.map((a,i)=>`<sheet name="${xmlEsc(a.nome)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets>
<definedNames>${defs.join("")}</definedNames>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>` });
  arquivos.push({ nome:"xl/_rels/workbook.xml.rels", dados:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}
<Relationship Id="rId${n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` });
  arquivos.push({ nome:"xl/styles.xml", dados:XL_ESTILOS });
  sheetsXml.forEach((x,i)=>arquivos.push({ nome:`xl/worksheets/sheet${i+1}.xml`, dados:x }));
  if(logo){
    // exibido a 40 px de altura (a imagem tem o triplo, para sair nítida)
    const EMU = 9525, hPx = 44, wPx = Math.round(hPx*logo.w/logo.h);
    arquivos.push({ nome:"xl/media/image1.png", dados:logo.bytes });
    abas.forEach((_,i)=>{
      arquivos.push({ nome:`xl/worksheets/_rels/sheet${i+1}.xml.rels`, dados:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i+1}.xml"/></Relationships>` });
      arquivos.push({ nome:`xl/drawings/drawing${i+1}.xml`, dados:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>47625</xdr:rowOff></xdr:from><xdr:ext cx="${wPx*EMU}" cy="${hPx*EMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Erbe"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wPx*EMU}" cy="${hPx*EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>` });
      arquivos.push({ nome:`xl/drawings/_rels/drawing${i+1}.xml.rels`, dados:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>` });
    });
  }
  return zipar(arquivos, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/* ---------- PDF ---------- */
const VENDOR_PDF = [
  { teste:()=>window.jspdf && window.jspdf.jsPDF, local:"vendor/jspdf.umd.min.js",
    cdn:"https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js",
    sri:"sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/" },
  { teste:()=>window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable, local:"vendor/jspdf.plugin.autotable.min.js",
    cdn:"https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js",
    sri:"sha384-Xl/CUCfJbzsngMp0CFxkmF0VW/8C160IsGujqeQlIhaGxKz2+JsIGORFqtCPeldF" }
];
function carregarScript(src, sri){
  return new Promise((ok, erro)=>{
    const s = document.createElement("script");
    s.src = src; s.async = true;
    if(sri){ s.integrity = sri; s.crossOrigin = "anonymous"; }
    s.onload = ()=>ok(); s.onerror = ()=>{ s.remove(); erro(new Error("não carregou "+src)); };
    document.head.appendChild(s);
  });
}
let PDF_CARREGANDO = null;
function carregarJsPDF(){
  if(VENDOR_PDF.every(v=>v.teste())) return Promise.resolve(true);
  if(!PDF_CARREGANDO){
    PDF_CARREGANDO = (async()=>{
      for(const v of VENDOR_PDF){
        if(v.teste()) continue;
        try{ await carregarScript(v.local, v.sri); }
        catch(e){ await carregarScript(v.cdn, v.sri); }
        if(!v.teste()) throw new Error("biblioteca de PDF incompleta");
      }
      return true;
    })().catch(e=>{ PDF_CARREGANDO = null; throw e; });
  }
  return PDF_CARREGANDO;
}
/** Sora para o PDF: lida da pasta vendor/. Sem ela, o PDF sai em Helvetica. */
let FONTES_PDF = null;
async function fontesPdf(){
  if(FONTES_PDF!==null) return FONTES_PDF;
  const b64 = async u => {
    const r = await fetch(u); if(!r.ok) throw new Error(u);
    const b = new Uint8Array(await r.arrayBuffer()); let s = "";
    // um servidor que devolve a página no lugar do arquivo (rota de SPA) não pode virar "fonte"
    const sig = String.fromCharCode(b[0],b[1],b[2],b[3]);
    if(!(b[0]===0 && b[1]===1 && b[2]===0 && b[3]===0) && sig!=="true" && sig!=="OTTO") throw new Error("não é TTF: "+u);
    for(let i=0;i<b.length;i+=0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i+0x8000));
    return btoa(s);
  };
  try{ FONTES_PDF = { reg: await b64("vendor/Sora-Regular.ttf"), semi: await b64("vendor/Sora-SemiBold.ttf") }; }
  catch(e){ FONTES_PDF = false; }
  return FONTES_PDF;
}
const RGB = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
/** Escala de eixo com passos redondos (1, 2, 2,5 ou 5 × 10ⁿ). */
function passosEixo(max, n){
  if(!(max>0)) return { topo:1, passos:[0,1] };
  const bruto = max/(n||4), mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1,2,2.5,5,10].map(k=>k*mag).find(k=>k>=bruto) || 10*mag;
  const topo = Math.ceil(max/passo)*passo;
  const passos = []; for(let v=0; v<=topo+passo/2; v+=passo) passos.push(+v.toFixed(6));
  return { topo, passos };
}
const compacto = v => { const a = Math.abs(v);
  if(a>=1e6) return (v/1e6).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mi";
  if(a>=1e3) return (v/1e3).toLocaleString("pt-BR",{maximumFractionDigits:a>=1e4?0:1})+" mil";
  return Math.round(v).toLocaleString("pt-BR"); };

async function gerarPdf(rel){
  await carregarJsPDF();
  const fontes = await fontesPdf();
  const logo = await logoRelatorio();
  const { jsPDF } = window.jspdf;
  const largo = rel.orientacao==="paisagem" || rel.folhas.some(f=>f.colunas.length>7);
  const doc = new jsPDF({ orientation: largo?"landscape":"portrait", unit:"pt", format:"a4", compress:true });
  let F = "helvetica";
  if(fontes){
    doc.addFileToVFS("Sora-Regular.ttf", fontes.reg); doc.addFont("Sora-Regular.ttf","Sora","normal");
    doc.addFileToVFS("Sora-SemiBold.ttf", fontes.semi); doc.addFont("Sora-SemiBold.ttf","Sora","bold");
    F = "Sora";
  }
  // Helvetica do PDF só conhece o Latin-1: travessões e sinais especiais viram equivalentes simples
  const T = s => F==="Sora" ? String(s==null?"":s)
    : String(s==null?"":s).replace(/[—–−]/g,"-").replace(/…/g,"...").replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
  doc.setProperties({ title: rel.titulo, creator:"Erbe · Central", author: rel.geradoPor||"" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
  const TOPO = 78, PE = 44;
  let y = TOPO;

  // números-chave
  if(rel.resumo && rel.resumo.length){
    const n = Math.min(rel.resumo.length, largo?5:4), gap = 8, cw = (W-2*M-gap*(n-1))/n;
    rel.resumo.slice(0,n).forEach((r,i)=>{
      const x = M + i*(cw+gap);
      doc.setFillColor(...(i===0?RGB("#0E1110"):RGB("#F7F6F1"))); doc.roundedRect(x, y, cw, 44, 4, 4, "F");
      doc.setFont(F,"bold"); doc.setFontSize(6.6); doc.setTextColor(...(i===0?RGB("#A8AEA9"):RGB("#7E837F")));
      doc.text(T(r.k).toUpperCase(), x+10, y+14, { charSpace:.5 });
      doc.setFontSize(12.5); doc.setTextColor(...(i===0?RGB("#F7F6F1"):RGB("#0E1110")));
      doc.text(T(r.v), x+10, y+32);
      if(r.d){ doc.setFont(F,"normal"); doc.setFontSize(6.4); doc.setTextColor(...(i===0?RGB("#A8AEA9"):RGB("#7E837F")));
        doc.text(T(r.d), x+cw-10, y+32, {align:"right"}); }
    });
    y += 44 + 16;
  }

  // gráfico de colunas empilhadas (a previsão)
  if(rel.grafico && rel.grafico.rotulos.length){
    const g = rel.grafico, gh = 124, gx = M+40, gw = W-2*M-40;
    const tot = g.rotulos.map((_,i)=>g.series.reduce((a,s)=>a+(s.valores[i]||0),0));
    const { topo, passos } = passosEixo(Math.max(...tot, 1), 4);
    const base = y + gh, esc = v => gh*(v/topo);
    doc.setFont(F,"normal"); doc.setFontSize(6.6); doc.setTextColor(...RGB("#7E837F"));
    doc.setDrawColor(...RGB("#E9E7E0")); doc.setLineWidth(.5);
    passos.forEach(v=>{ const yy = base-esc(v); doc.line(gx, yy, gx+gw, yy); doc.text(compacto(v), gx-6, yy+2.2, {align:"right"}); });
    const passo = gw/g.rotulos.length, bw = Math.min(22, passo*.58);
    g.rotulos.forEach((rot,i)=>{
      const x = gx + i*passo + (passo-bw)/2; let yy = base;
      g.series.forEach(s=>{
        const v = s.valores[i]||0; if(!(v>0)) return;
        const h = esc(v); yy -= h;
        doc.setFillColor(...RGB(s.cor)); doc.rect(x, yy+ (h>2?1:0), bw, Math.max(h-(h>2?1:0), .6), "F");
      });
      doc.setTextColor(...RGB("#3B403E")); doc.setFontSize(6.4);
      doc.text(T(rot), x+bw/2, base+10, {align:"center"});
      if(tot[i]>0 && (i===0 || i===g.rotulos.length-1 || tot[i]===Math.max(...tot))){
        doc.setFont(F,"bold"); doc.text(compacto(tot[i]), x+bw/2, yy-3, {align:"center"}); doc.setFont(F,"normal");
      }
    });
    let lx = gx; const ly = base + 24;
    g.series.forEach(s=>{
      doc.setFillColor(...RGB(s.cor)); doc.rect(lx, ly-5.5, 7, 7, "F");
      doc.setTextColor(...RGB("#3B403E")); doc.setFontSize(7);
      doc.text(T(s.nome), lx+10, ly); lx += 16 + doc.getTextWidth(T(s.nome));
    });
    y = ly + 18;
  }

  const alinhar = f => ["moeda","int","pct","num"].includes(f) ? "right" : (f==="data" ? "center" : "left");
  rel.folhas.forEach((f, idx)=>{
    if(idx>0 && y > H-PE-90){ doc.addPage(); y = TOPO; }
    if(rel.folhas.length>1 || f.titulo){
      doc.setFont(F,"bold"); doc.setFontSize(10); doc.setTextColor(...RGB("#13603B"));
      doc.text(T(f.titulo || f.nome), M, y+8);
      doc.setFont(F,"normal"); doc.setFontSize(7); doc.setTextColor(...RGB("#7E837F"));
      doc.text(T(`${f.linhas.length.toLocaleString("pt-BR")} registro${f.linhas.length!==1?"s":""}`), W-M, y+8, {align:"right"});
      y += 16;
    }
    if(!f.linhas.length){
      doc.setFont(F,"normal"); doc.setFontSize(8.5); doc.setTextColor(...RGB("#7E837F"));
      doc.text(T(f.vazio || "Nenhum registro com esses filtros."), M, y+10);
      y += 30; return;
    }
    doc.autoTable({
      startY: y,
      head: [f.colunas.map(c=>T(c.t))],
      body: f.linhas.map(l=>l.map((v,i)=>T(textoCelula(v, f.colunas[i].f)))),
      foot: f.total ? [f.total.map((v,i)=>T(textoCelula(v, f.colunas[i].f)))] : undefined,
      showFoot: "lastPage", showHead: "everyPage",
      margin: { top: TOPO, bottom: PE, left: M, right: M },
      styles: { font:F, fontStyle:"normal", fontSize: f.colunas.length>11 ? 6.6 : 7.4, textColor:RGB("#0E1110"),
        cellPadding:{ top:3.4, bottom:3.4, left:4, right:4 }, lineColor:RGB("#E9E7E0"), lineWidth:{ bottom:.5 },
        overflow:"linebreak", valign:"middle" },
      headStyles: { fillColor:RGB("#13603B"), textColor:[255,255,255], fontStyle:"bold", lineWidth:0 },
      footStyles: { fillColor:RGB("#F1EFE8"), textColor:RGB("#0E1110"), fontStyle:"bold", lineWidth:{ top:.8 }, lineColor:RGB("#0E1110") },
      alternateRowStyles: { fillColor:RGB("#FBFAF7") },
      columnStyles: Object.fromEntries(f.colunas.map((c,i)=>[i, Object.assign({ halign: alinhar(c.f) },
        c.pdf ? { cellWidth:c.pdf } : {}, (c.f==="data" || c.f==="moeda") ? { minCellWidth: c.f==="data"?50:58 } : {})])),
      didParseCell: d => { if(d.section==="head" || d.section==="foot") d.cell.styles.halign = alinhar(f.colunas[d.column.index].f); }
    });
    y = doc.lastAutoTable.finalY + 12;
    if(f.rodape){
      doc.setFont(F,"normal"); doc.setFontSize(7); doc.setTextColor(...RGB("#7E837F"));
      const ls = doc.splitTextToSize(T(f.rodape), W-2*M); doc.text(ls, M, y+6); y += 10 + ls.length*9;
    }
    y += 10;
  });
  if(rel.nota){
    if(y > H-PE-30){ doc.addPage(); y = TOPO; }
    doc.setFont(F,"normal"); doc.setFontSize(7); doc.setTextColor(...RGB("#7E837F"));
    doc.text(doc.splitTextToSize(T(rel.nota), W-2*M), M, y+4);
  }

  // cabeçalho e rodapé em todas as páginas, agora que o total é conhecido
  const total = doc.getNumberOfPages();
  const filtros = doc.splitTextToSize(T(rel.filtrosTexto||""), W*0.52).slice(0,2);
  for(let i=1;i<=total;i++){
    doc.setPage(i);
    if(logo){ const lh = 30; doc.addImage(logo.dataUrl, "PNG", M, 22, lh*logo.w/logo.h, lh, "logo-erbe", "FAST"); }
    doc.setFont(F,"bold"); doc.setFontSize(12.5); doc.setTextColor(...RGB("#0E1110"));
    doc.text(T(rel.titulo), W-M, 32, {align:"right"});
    doc.setFont(F,"normal"); doc.setFontSize(7.2); doc.setTextColor(...RGB("#5A5F5B"));
    filtros.forEach((l,k)=>doc.text(l, W-M, 44+k*9, {align:"right"}));
    doc.setDrawColor(...RGB("#1B7F4E")); doc.setLineWidth(1.1); doc.line(M, 64, W-M, 64);
    doc.setDrawColor(...RGB("#E9E7E0")); doc.setLineWidth(.6); doc.line(M, H-32, W-M, H-32);
    doc.setFontSize(7); doc.setTextColor(...RGB("#7E837F"));
    doc.text(T(`Erbe Proteção e Patrimônio · gerado em ${rel.geradoEm}${rel.geradoPor?` por ${rel.geradoPor}`:""}`), M, H-20);
    doc.text(T(`Página ${i} de ${total}`), W-M, H-20, {align:"right"});
  }
  return doc.output("blob");
}
const numCSV = v => String(Number(v)||0).replace(".", ",");

function exportarCSVVidas(){
  const linhas = vidasNoEscopo().map(v=>{
    const c = contratoPorId(v.contratoId) || {};
    return [v.nome, TIPO_VIDA[v.tipo||"titular"], v.parentesco||"", SV(v.status).nome,
            v.entrada||"", v.saida||"", c.clienteNome||"", PILARES[c.pilar]?PILARES[c.pilar].curto:"",
            c.produto||"", c.operadora||"", nomeUsuario(c.corretor), v.carteirinha||""];
  });
  baixarCSV("erbe-vidas",
    ["Nome","Tipo","Parentesco","Situação","Entrada","Saída","Cliente","Pilar","Produto","Operadora","Corretor","Carteirinha"],
    linhas);
}
function exportarCSVClientes(){
  const linhas = S.clientes.filter(c=>noEscopo(c)).map(c=>{
    const cs = contratosDoCliente(c.id).filter(x=>x.status!=="cancelado");
    const vs = vidasAtivas(vidasDoCliente(c.id)).length;
    return [c.nome, c.tipo||"", S.mePapel==="gestor" ? (c.doc||"") : mascararDoc(c.doc), c.telefone||"", c.whatsapp||"", c.email||"",
            c.cidade||"", c.uf||"", c.status||"ativo", c.origem||"", nomeUsuario(c.responsavel),
            cs.length, vs, numCSV(receitaCliente(c)), c.criadoEm||""];
  });
  baixarCSV("erbe-clientes",
    ["Cliente","Tipo","Documento","Telefone","WhatsApp","E-mail","Cidade","UF","Situação","Origem","Responsável","Contratos","Vidas ativas","Comissão gerada","Entrada"],
    linhas);
}
function exportarCSVContratos(){
  const linhas = S.contratos.filter(c=>noEscopo(c,"corretor")).map(c=>[
    c.clienteNome, PILARES[c.pilar]?PILARES[c.pilar].curto:"", c.produto||"", c.operadora||"",
    c.numero||"", c.apolice||"", c.grupo||"", c.cota||"",
    numCSV(c.valorBase), numCSV(c.valorTotal||0), totalVidas(c),
    c.inicio||"", c.fim||"", (STATUS_CONTRATO[c.status]||{}).nome||c.status||"",
    nomeUsuario(c.corretor), numCSV(comissaoContrato(c))
  ]);
  baixarCSV("erbe-contratos",
    ["Cliente","Pilar","Produto","Operadora","Nº proposta","Apólice","Grupo","Cota","Base","Valor do contrato","Vidas","Início","Fim","Situação","Corretor","Comissão"],
    linhas);
}
function exportarCSVComissoes(){
  const linhas = parcelas().filter(p=>noEscopo(p,"corretor")).map(p=>[
    p.cliente, tipoP(p.tipo).nome, p.n, p.vence,
    numCSV(valorVis(p)), veCorretora()?numCSV(p.valorCorretora):"", numCSV(p.valorCorretor),
    (STATUS_COM[p.status]||{}).nome||p.status||"", p.recebidoEm||"", p.operadora||"", nomeUsuario(p.corretor)
  ]);
  baixarCSV("erbe-comissoes",
    ["Cliente","Tipo","Parcela","Vence","Valor","Corretora","Corretor","Situação","Recebido em","Operadora","Corretor responsável"],
    linhas);
}

/* ---------- lembrete de tarefas (pop-up) ---------- */
const CHAVE_SONECA = "erbe-lembrete-soneca";
let sonecaMem = "";
function soneca(){ try{ return localStorage.getItem(CHAVE_SONECA)||sonecaMem; }catch(e){ return sonecaMem; } }
function adiarAviso(minutos){
  const ate = new Date(Date.now()+minutos*60000).toISOString();
  sonecaMem = ate; try{ localStorage.setItem(CHAVE_SONECA, ate); }catch(e){}
  const el = document.getElementById("lembrete"); if(el) el.classList.remove("show");
}
/** Tarefas que merecem aviso: minhas, abertas, vencendo hoje ou já vencidas. */
function tarefasParaLembrar(){
  return (S.tarefas||[])
    .filter(t=>t.status!=="feita" && (t.vence||"") <= hoje()
               && (t.responsavel===S.uid || !t.responsavel))
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
}
function mostrarLembrete(forcar){
  const el = document.getElementById("lembrete"); if(!el) return;
  const s = soneca();
  if(!forcar && s && new Date(s) > new Date()){ el.classList.remove("show"); return; }
  const ts = tarefasParaLembrar();
  const an = S.config ? aniversariosParaLembrar() : [];
  if(!ts.length && !an.length){ el.classList.remove("show"); el.innerHTML=""; return; }
  const atrasadas = ts.filter(t=>t.vence < hoje()).length;
  const anHoje = an.filter(x=>x.dias===0).length;
  const nT = an.length ? 2 : 3;
  el.innerHTML = `
    <div class="lb-head">
      ${ts.length ? `<span class="chip ${atrasadas?"crit":"warn"}">${atrasadas?"Atrasada"+(atrasadas>1?"s":""):"Hoje"}</span>` : `<span class="chip info">Aniversário</span>`}
      <b>${ts.length ? `${ts.length} tarefa${ts.length!==1?"s":""} esperando você` : `${an.length} aniversário${an.length!==1?"s":""} ${anHoje===an.length?"hoje":"chegando"}`}</b>
      <button class="lb-x" data-act="fecharLembrete" title="Fechar" aria-label="Fechar lembrete">×</button>
    </div>
    ${ts.slice(0,nT).map(t=>`<div class="lb-item">
      <div class="t">${esc(t.titulo)}</div>
      <div class="hint">${esc(t.tipo||"Follow-up")}${t.refNome?" · "+esc(t.refNome):""} · ${t.vence<hoje()?`venceu ${dt(t.vence)}`:"vence hoje"}</div>
      <div class="lb-acoes">
        <button class="btn sm primary" data-act="concluirTarefa" data-id="${esc(t.id)}">Feita</button>
        <button class="btn sm" data-act="adiarDias" data-id="${esc(t.id)}" data-d="1">Amanhã</button>
        <button class="btn sm ghost" data-act="adiarTarefa" data-id="${esc(t.id)}">Outra data</button>
      </div></div>`).join("")}
    ${ts.length>nT?`<div class="hint" style="padding-top:8px">e mais ${ts.length-nT} na agenda.</div>`:""}
    ${an.length?`${ts.length?`<div class="lb-sec">Aniversários</div>`:""}
      ${an.slice(0,3).map(x=>`<div class="lb-item">
        <div class="t">${esc(x.quem==="contato"?x.nome:x.c.nome)}</div>
        <div class="hint">${esc(descAniv(x))} · ${x.dias===0?"<b>hoje</b>":esc(quandoAniv(x))}</div>
        <div class="lb-acoes">${botoesAniv(x)}</div></div>`).join("")}
      ${an.length>3?`<div class="hint" style="padding-top:8px">e mais ${an.length-3} — veja em Clientes.</div>`:""}`:""}
    <div class="lb-pe">
      ${ts.length?`<button class="btn sm" data-act="irAgenda">Abrir agenda</button>`:`<button class="btn sm" data-act="irFiltro" data-view="clientes" data-f="{}">Ver clientes</button>`}
      <button class="btn sm ghost" data-act="soneca" data-min="60">Lembrar em 1h</button>
      <button class="btn sm ghost" data-act="soneca" data-min="600">Hoje não</button>
    </div>`;
  el.classList.add("show");
}
function ligarLembrete(){
  mostrarLembrete();
  setInterval(()=>mostrarLembrete(), 60000);
}

function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2400); }

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
  if(!S.db || !S.canWrite) return;
  try{
    if(col==="usuarios"){
      if(obj.manual){ await salvarMembroManual(obj); }
      else {
        const { error } = await S.db.from("perfis").update(paraPerfil(obj)).eq("id", obj.id);
        if(error) throw error;
      }
    } else {
      const { error } = await S.db.from(COLS[col])
        .upsert({ id:obj.id, dono:donoDe(col,obj), dados:obj }, { onConflict:"id" });
      if(error) throw error;
    }
  }catch(e){ falhaEscrita(e); return; }
  registrarAtividade(col, obj, evento, novo, antes);
}
async function remover(col, id, evento){
  const antigo = S[col].find(x=>x.id===id);
  SOMBRA.delete(col+":"+id);
  S[col] = S[col].filter(x=>x.id!==id);
  invalidarIndices();
  render();
  if(!S.db || !S.canWrite) return;
  try{
    if(col==="usuarios"){
      if(antigo && antigo.manual) await removerMembroManual(id);
      else { const { error } = await S.db.from("perfis").delete().eq("id", id); if(error) throw error; }
    } else {
      const { error } = await S.db.from(COLS[col]).delete().eq("id", id);
      if(error) throw error;
    }
  }catch(e){ falhaEscrita(e); return; }
  if(antigo) registrarAtividade(col, antigo, evento||"Excluiu", false);
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
  }catch(e){ falhaEscrita(e); }
}
function falhaEscrita(e){
  const msg = (e && (e.message||e.hint||"")) + "";
  if(/row-level security|permission denied|violates/i.test(msg)){
    banner("Seu acesso não permite essa alteração. Fale com o gestor da corretora.");
  } else if(/JWT|expired|session/i.test(msg)){
    banner("Sua sessão expirou. Recarregue a página e entre de novo.");
  } else {
    banner("Não foi possível salvar agora. Verifique a conexão e tente de novo.");
  }
  console.error("[trivium] falha ao salvar:", e);
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
function banner(txt){ const b=$("#banner"); b.hidden=false; b.innerHTML='<span aria-hidden="true">⚠</span> '+esc(txt); }

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
/** Resumo de uma régua aplicada a uma base, para preview e para a tela de configuração. */
function resumoRegra(regra, base, contrato){
  const ag = (regra.parcelas||[]).reduce((a,p)=>a+p.pct,0);
  const v = regra.vitalicio || {pct:0};
  const meses = mesesVitalicio(contrato||{}, v);
  return {
    pctAgenciamento: ag,
    valorAgenciamento: base*ag/100,
    parcelasAgenciamento: (regra.parcelas||[]).length,
    pctVitalicio: v.pct||0,
    mesVitalicio: v.inicio||1,
    mesesVitalicio: meses,
    valorVitalicioMes: base*(v.pct||0)/100,
    valorVitalicioTotal: base*(v.pct||0)/100*meses,
    total: base*ag/100 + base*(v.pct||0)/100*meses
  };
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
    const d = soDigitos(c.doc);
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
  const d = soDigitos(doc);
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

/* ---------- carga inicial ---------- */
/* ============================================================
   ENTRADA NO SISTEMA
   ============================================================ */
function telaLogin(msg, tipo){
  esconderCarregando();
  document.getElementById("app").hidden = true;
  const el = document.getElementById("login");
  el.hidden = false;
  el.innerHTML = `
  <div class="login-cartao">
    <div class="login-marca">
      <div data-marca style="width:34px;height:40px;display:flex;align-items:center;justify-content:center"></div>
      <div><div class="login-nome">ERBE</div><div class="login-sub">Proteção e Patrimônio</div></div>
    </div>
    <div class="seg" style="width:100%;margin-bottom:16px">
      <button style="flex:1" data-act="abaLogin" data-v="entrar" aria-pressed="${S.abaLogin!=="criar"}">Entrar</button>
      <button style="flex:1" data-act="abaLogin" data-v="criar" aria-pressed="${S.abaLogin==="criar"}">Criar conta</button>
    </div>
    ${msg?`<div class="login-aviso ${tipo||"erro"}">${esc(msg)}</div>`:""}
    ${S.abaLogin==="criar"?`
      <div class="field"><label for="lgNome">Seu nome</label><input id="lgNome" type="text" placeholder="Guilherme Bastos" autocomplete="name"></div>`:""}
    <div class="field"><label for="lgEmail">E-mail</label>
      <input id="lgEmail" type="email" placeholder="voce@exemplo.com" autocomplete="email" value="${esc(S.emailLogin||"")}"></div>
    <div class="field"><label for="lgSenha">Senha</label>
      <input id="lgSenha" type="password" placeholder="mínimo 6 caracteres" autocomplete="${S.abaLogin==="criar"?"new-password":"current-password"}"></div>
    <button class="btn primary" style="width:100%;justify-content:center;margin-top:6px" data-act="${S.abaLogin==="criar"?"criarConta":"entrar"}">
      ${S.abaLogin==="criar"?"Criar conta":"Entrar"}</button>
    <button class="btn ghost" style="width:100%;justify-content:center;margin-top:8px" data-act="linkEmail">
      Receber um link de acesso por e-mail</button>
    <div class="login-rodape">Cada pessoa entra com o próprio e-mail. Novos acessos ficam aguardando a liberação do gestor.
      <div style="margin-top:14px;letter-spacing:.14em;text-transform:uppercase;font-size:9px;color:var(--ink-3)">Seu legado começa hoje</div></div>
  </div>`;
  pintarMarca();
  const f = el.querySelector("input"); if(f) setTimeout(()=>f.focus(), 60);
}
function esconderCarregando(){ const c = document.getElementById("carregando"); if(c) c.hidden = true; }
function mostrarSistema(){
  esconderCarregando();
  document.getElementById("login").hidden = true;
  document.getElementById("app").hidden = false;
}

async function boot(){
  S.config = clonar(DEFAULT_CONFIG);
  $("#themeBtn").addEventListener("click", alternarTema);
  aplicarTemaSalvo();
  ligarLembrete();

  // aceita também o nome antigo, para um config.js de versão anterior continuar valendo
  const cfg = window.ERBE_CONFIG || window.TRIVIUM_CONFIG || null;
  if(!cfg){
    telaLogin("O arquivo config.js não foi carregado. Confira se ele está na mesma pasta do index.html que você publicou no Netlify.", "erro");
    return;
  }
  if(!cfg.url || !cfg.anonKey || /SUA_URL|SUA_CHAVE/.test(cfg.url + cfg.anonKey)){
    telaLogin("O arquivo config.js ainda não tem o endereço e a chave do Supabase. Preencha os dois e recarregue.", "erro");
    return;
  }
  if(!window.supabase || !window.supabase.createClient){
    telaLogin("A biblioteca do Supabase não carregou. Verifique a internet e recarregue a página.", "erro");
    return;
  }
  S.db = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
  });

  const { data:{ session } } = await S.db.auth.getSession();
  S.db.auth.onAuthStateChange((evento, sess)=>{
    if(evento==="SIGNED_OUT"){ location.reload(); return; }
    if(sess && !S.uid) iniciarSessao(sess);
  });
  if(session) await iniciarSessao(session);
  else telaLogin(S.avisoLogin, S.avisoTipo);
}

async function iniciarSessao(session){
  S.uid = session.user.id;
  S.meuEmail = session.user.email;
  S.meNome = session.user.user_metadata?.nome || session.user.email.split("@")[0];
  S.online = true; S.canWrite = true;
  mostrarSistema();
  montarNav();
  render();
  await carregarTudo();
  ligarTempoReal();
}

const TABELAS = ["perfis","leads","clientes","contratos","vidas","tarefas","despesas","atividade"];
async function carregarTudo(){
  try{
    const [perfis, leads, clientes, contratos, tarefas, despesas, vidas, atividade, config] = await Promise.all([
      S.db.from("perfis").select("*"),
      S.db.from("leads").select("*"),
      S.db.from("clientes").select("*"),
      S.db.from("contratos").select("*"),
      S.db.from("tarefas").select("*"),
      S.db.from("despesas").select("*"),
      S.db.from("vidas").select("*"),
      S.db.from("atividade").select("*").order("quando",{ascending:false}).limit(300),
      S.db.from("config").select("*").eq("id","app").maybeSingle()
    ]);
    if(config.data && config.data.dados) S.config = Object.assign(clonar(DEFAULT_CONFIG), clonar(config.data.dados));
    const linhas = r => (r.data||[]).map(x=>Object.assign({id:x.id}, clonar(x.dados||{})));
    S.leads = linhas(leads); S.clientes = linhas(clientes); S.contratos = linhas(contratos);
    S.tarefas = linhas(tarefas); S.despesas = linhas(despesas); S.atividade = linhas(atividade);
    S.usuarios = (perfis.data||[]).map(dePerfil).concat(S.config.membrosManuais||[]);
    S.vidas = linhas(vidas);
    S.usuariosCarregados = true;
    ["leads","clientes","contratos","vidas","tarefas","despesas"].forEach(registrarSombras);
    invalidarIndices();

    const meu = S.usuarios.find(u=>u.id===S.uid);
    if(meu){ S.mePapel = meu.papel||"corretor"; S.meNome = meu.nome||S.meNome; }
    S.souDono = !!(meu && meu.papel==="gestor");
    if(perfis.error) banner("Não foi possível ler a equipe: "+perfis.error.message);
  }catch(e){
    console.error("[trivium] falha ao carregar:", e);
    banner("Não foi possível carregar os dados. Verifique a conexão e recarregue.");
  }
  atualizarRodape();
  render();
}
let canalTempoReal = null;
function ligarTempoReal(){
  if(canalTempoReal) return;
  canalTempoReal = S.db.channel("trivium");
  TABELAS.concat(["config"]).forEach(t=>{
    canalTempoReal.on("postgres_changes", { event:"*", schema:"public", table:t }, ()=>{
      clearTimeout(S._recarga);
      S._recarga = setTimeout(carregarTudo, 400);
    });
  });
  canalTempoReal.subscribe();
}

/* ---------- ações da tela de entrada ---------- */
async function entrar(){
  const email = val("lgEmail"), senha = val("lgSenha");
  if(!email || !senha){ telaLogin("Preencha o e-mail e a senha.","erro"); return; }
  S.emailLogin = email;
  telaLogin("Entrando…","ok");
  const { error } = await S.db.auth.signInWithPassword({ email, password:senha });
  if(error) telaLogin(traduzErroAuth(error.message), "erro");
}
async function criarConta(){
  const email = val("lgEmail"), senha = val("lgSenha"), nome = val("lgNome");
  if(!email || !senha){ telaLogin("Preencha o e-mail e a senha.","erro"); return; }
  if(senha.length < 6){ telaLogin("A senha precisa de pelo menos 6 caracteres.","erro"); return; }
  S.emailLogin = email;
  const { data, error } = await S.db.auth.signUp({ email, password:senha, options:{ data:{ nome: nome||email.split("@")[0] } } });
  if(error){ telaLogin(traduzErroAuth(error.message), "erro"); return; }
  if(data && data.session) return;                       // entrou direto
  S.abaLogin = "entrar";
  telaLogin("Conta criada. Confirme o e-mail que acabamos de enviar e depois entre.","ok");
}
async function linkPorEmail(){
  const email = val("lgEmail");
  if(!email){ telaLogin("Informe o e-mail para receber o link.","erro"); return; }
  S.emailLogin = email;
  const { error } = await S.db.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin } });
  telaLogin(error ? traduzErroAuth(error.message)
                  : "Link enviado. Abra o e-mail neste mesmo aparelho para entrar.", error?"erro":"ok");
}
function traduzErroAuth(m){
  const t = (m||"").toLowerCase();
  if(t.includes("invalid login")) return "E-mail ou senha incorretos.";
  if(t.includes("already registered")) return "Esse e-mail já tem conta. Use “Entrar”.";
  if(t.includes("email not confirmed")) return "Confirme o e-mail antes de entrar.";
  if(t.includes("email rate limit") || (t.includes("rate limit") && t.includes("email")))
    return "O Supabase só envia poucos e-mails por hora no servidor de teste. "
         + "Desligue “Confirm email” em Authentication → Providers → Email (e clique em Save), "
         + "ou crie a conta direto em Authentication → Users → Add user, marcando “Auto Confirm User”.";
  if(t.includes("for security purposes") || t.includes("after")&&t.includes("seconds"))
    return "Aguarde alguns segundos antes de tentar de novo.";
  if(t.includes("rate limit") || t.includes("too many"))
    return "O Supabase bloqueou temporariamente por excesso de tentativas. Se for envio de e-mail, o limite é por hora — o caminho rápido é desligar “Confirm email” em Authentication → Providers → Email.";
  if(t.includes("password")) return "Senha muito curta ou inválida.";
  return m || "Não foi possível entrar.";
}
document.addEventListener("click", async e=>{
  const el = e.target.closest("#login [data-act]"); if(!el) return;
  const a = el.dataset.act;
  if(a==="abaLogin"){ S.abaLogin = el.dataset.v; telaLogin(); }
  if(a==="entrar") await entrar();
  if(a==="criarConta") await criarConta();
  if(a==="linkEmail") await linkPorEmail();
});
document.addEventListener("keydown", e=>{
  if(e.key!=="Enter") return;
  const cx = document.getElementById("login");
  if(!cx || cx.hidden) return;
  e.preventDefault();
  (S.abaLogin==="criar" ? criarConta() : entrar());
});

function atualizarRodape(){
  $("#meAv").textContent = iniciais(S.meNome);
  $("#meName").textContent = S.meNome;
  $("#meRole").textContent = PAPEIS[S.mePapel]||"Corretor";
}

/* ---------- tema ---------- */
function aplicarTemaSalvo(){
  try{
    const ler = k => localStorage.getItem("erbe-"+k) ?? localStorage.getItem("trivium-"+k);
    const t=ler("tema"); if(t) document.documentElement.setAttribute("data-theme",t);
    const m=ler("modo-clientes"); if(m) S.modoClientes=m;
    const mm=ler("modo-montagem"); if(mm) S.modoMontagem=mm;
    const uv=ler("unidade-vit"); if(uv) S.unidadeVit=uv;
  }catch(e){}
}
function alternarTema(){
  const atual = document.documentElement.getAttribute("data-theme");
  const escuroAgora = atual ? atual==="dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const novo = escuroAgora ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", novo);
  try{ localStorage.setItem("erbe-tema", novo); }catch(e){}
  render();
}

/* ---------- navegação ---------- */
const VIEWS = [
  { sec:"Comercial" },
  { id:"dashboard",  nome:"Painel",       icone:"M3 13h4v8H3zM10 3h4v18h-4zM17 9h4v12h-4z" },
  { id:"leads",      nome:"Funil de leads", icone:"M3 4h18l-7 8v7l-4 2v-9z" },
  { id:"tarefas",    nome:"Agenda",       icone:"M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" },
  { sec:"Carteira" },
  { id:"clientes",   nome:"Clientes",     icone:"M4 20a6 6 0 0 1 12 0M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 20a5 5 0 0 0-3-4.6" },
  { id:"contratos",  nome:"Contratos",    icone:"M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6" },
  { id:"vidas",      nome:"Vidas e cotas", icone:"M9 20a5 5 0 0 1 10 0M14 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M5 20a4 4 0 0 1 5-3.9M7 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" },
  { id:"renovacoes", nome:"Renovações",   icone:"M4 12a8 8 0 0 1 13.7-5.7L20 8M20 12a8 8 0 0 1-13.7 5.7L4 16M20 4v4h-4M4 20v-4h4" },
  { sec:"Financeiro" },
  { id:"comissoes",  nome:"Comissões",    icone:"M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2 2.8 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3" },
  { id:"despesas",   nome:"Despesas",     icone:"M3 6h18v13H3zM3 10h18M7 15h4" },
  { id:"equipe",     nome:"Equipe e metas", icone:"M12 2 15 9l7 .6-5.3 4.6L18.3 21 12 17.3 5.7 21l1.6-6.8L2 9.6 9 9z" },
  { id:"operadoras", nome:"Operadoras",   icone:"M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 12h.01M15 12h.01" },
  { id:"relatorios", nome:"Relatórios",   icone:"M4 4h16v16H4zM8 16v-4M12 16V8M16 16v-6" },
  { sec:"Sistema" },
  { id:"atividade",  nome:"Atividade da equipe", icone:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2" },
  { id:"config",     nome:"Configurações", icone:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" }
];
function montarNav(){
  const nav = $("#nav");
  nav.innerHTML = VIEWS.filter(v=>v.sec || podeVer(v.id)).map(v=> v.sec
    ? `<div class="nav-sec">${esc(v.sec)}</div>`
    : `<button class="nav-btn" data-view="${v.id}" aria-current="${v.id===S.view}">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${v.icone}"/></svg>
         <span>${esc(v.nome)}</span><span class="nav-badge" data-badge="${v.id}" hidden></span>
       </button>`).join("");
}
$("#nav").addEventListener("click", e=>{
  const b = e.target.closest("[data-view]"); if(!b) return;
  ir(b.dataset.view);
});
const zerarPaginas = () => { S.pagClientes=1; S.pagVidas=1; S.pagComissoes=1; S.pagContratos=1; };
function ir(view, filtros){
  S.view=view; S.busca=""; zerarPaginas();
  S.filtros = filtros || (view==="relatorios" ? {periodo:"t12"} : {});
  document.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-current", String(b.dataset.view===view)));
  $("#main").scrollTop=0;
  render();
}
function atualizarBadges(){
  const pend = S.tarefas.filter(t=>t.status!=="feita" && noEscopo(t)).length;
  const atras = parcelas().filter(p=>p.vencida && noEscopo(p,"corretor")).length;
  const set=(id,n,alerta)=>{ const el=document.querySelector(`[data-badge="${id}"]`); if(!el) return;
    el.hidden = !n; el.textContent=n; el.classList.toggle("urgente", !!alerta); };
  set("tarefas", pend, S.tarefas.some(t=>t.status!=="feita" && t.vence<hoje() && noEscopo(t)));
  set("comissoes", atras, atras>0);
  set("leads", S.leads.filter(l=>!["ganho","perdido"].includes(l.etapa) && noEscopo(l)).length, false);
}

/* ---------- render principal ---------- */
const TITULOS = {
  dashboard:["Painel","Visão geral da corretora"],
  leads:["Funil de leads","Da captação ao fechamento"],
  clientes:["Clientes","Carteira da corretora"],
  contratos:["Contratos","Propostas, apólices e cotas"],
  vidas:["Vidas e cotas","Quem está coberto e o que está sendo construído"],
  comissoes:["Comissões","Previsão, conciliação e repasse"],
  renovacoes:["Renovações","Vencimentos e reajustes"],
  despesas:["Despesas","Gastos da corretora e balanço do mês"],
  tarefas:["Agenda","Follow-ups e compromissos"],
  equipe:["Equipe e metas","Produção e comissão por pessoa"],
  operadoras:["Operadoras","Quanto cada uma gera e quanto demora para pagar"],
  relatorios:["Relatórios","Produção, conversão e carteira"],
  atividade:["Atividade da equipe","Quem criou e alterou cada registro"],
  config:["Configurações","Réguas de comissão, operadoras e equipe"]
};
function render(){
  const meu = meuUsuario();
  const situacao = statusUsuario(meu);
  if(S.online && meu && situacao!=="ativo" && !S.souDono){ telaEspera(situacao); return; }
  if(S.online && !meu && !S.souDono && S.usuariosCarregados){ telaEspera("pendente"); return; }
  if(!podeVer(S.view)) S.view = "dashboard";
  const [t,s] = TITULOS[S.view] || ["Painel",""];
  $("#pageTitle").textContent=t; $("#pageSub").textContent=s;
  document.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-current", String(b.dataset.view===S.view)));
  atualizarRodape();
  montarNav();
  atualizarBadges();
  $("#pageActions").innerHTML = acoesTopo();
  const v = $("#view");
  v.innerHTML = ({
    dashboard:viewDashboard, leads:viewLeads, clientes:viewClientes, contratos:viewContratos,
    comissoes:viewComissoes, renovacoes:viewRenovacoes, tarefas:viewTarefas, equipe:viewEquipe, despesas:viewDespesas, vidas:viewVidas,
    relatorios:viewRelatorios, operadoras:viewOperadoras, atividade:viewAtividade, config:viewConfig
  }[S.view] || viewDashboard)();
  if(S.view==="leads") ligarKanban();
  if(S.view==="clientes" && S.modoClientes==="kanban") ligarBoardClientes();
  if(typeof mostrarLembrete==="function") mostrarLembrete();
  if(typeof pintarMarca==="function") pintarMarca();
  document.body.classList.toggle("sem-com", ocultaComissao());
}
/** Quem ainda não foi liberado pelo gestor não vê a operação. */
function telaEspera(situacao){
  document.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-current","false"));
  atualizarRodape();
  $("#pageTitle").textContent = situacao==="bloqueado" ? "Acesso suspenso" : "Aguardando liberação";
  $("#pageSub").textContent = "";
  $("#pageActions").innerHTML = "";
  document.querySelectorAll(".nav-btn").forEach(b=>{ b.disabled=true; b.style.opacity=".35"; b.style.pointerEvents="none"; });
  $("#view").innerHTML = `<div class="panel" style="max-width:520px;margin:40px auto">
    <div class="empty" style="padding:38px 28px">
      <b style="font-size:16px">${situacao==="bloqueado"?"Seu acesso foi suspenso":"Seu acesso ainda não foi liberado"}</b>
      ${situacao==="bloqueado"
        ? "Fale com o gestor da corretora para reativar."
        : `Você já está na fila. O gestor precisa liberar seu acesso e definir seu papel — corretor, assistente ou gestor — antes de você ver a carteira.`}
      <div class="hint" style="margin-top:18px">Entrou como <b>${esc(S.meNome)}</b>.</div>
      <div class="hint" style="margin-top:22px;letter-spacing:.14em;text-transform:uppercase;font-size:9.5px">Erbe · Seu legado começa hoje</div>
    </div></div>`;
}
function acoesTopo(){
  // não grava S.escopo aqui: noEscopo() já respeita a trava. Gravar prendia o
  // gestor em "Minha carteira" quando a primeira pintura acontecia antes de
  // o sistema saber quem ele era.
  const escopo = escopoTravado()
    ? `<span class="chip mute" title="O gestor define quem vê a corretora inteira">Minha carteira</span>`
    : `<div class="seg" role="group" aria-label="Escopo">
      <button data-act="escopo" data-v="todos" aria-pressed="${S.escopo==="todos"}">Corretora</button>
      <button data-act="escopo" data-v="meu" aria-pressed="${S.escopo==="meu"}">Minha carteira</button>
    </div>`;
  const novo = {
    leads:`<button class="btn primary" data-act="novoLead">+ Lead</button>`,
    clientes:`<button class="btn primary" data-act="novoCliente">+ Cliente</button>`,
    contratos:`<button class="btn primary" data-act="novoContrato">+ Contrato</button>`,
    tarefas:`<button class="btn primary" data-act="novaTarefa">+ Tarefa</button>`,
    despesas:`<button class="btn primary" data-act="novaDespesa">+ Despesa</button>`,
    equipe: S.mePapel==="gestor" ? `<button class="btn primary" data-act="novoMembro">+ Membro</button>` : "",
    dashboard:`<button class="btn" data-act="novoLead">+ Lead</button><button class="btn primary" data-act="novoContrato">+ Contrato</button>`,
    relatorios:`<button class="btn primary" data-act="baixarRel">Baixar relatório</button>`
  }[S.view] || "";
  return (["config","relatorios","atividade","operadoras","despesas","equipe"].includes(S.view) ? "" : escopo) + novo;
}

/* ============================================================
   PAINEL
   ============================================================ */
function viewDashboard(){
  const ms = ultimosMeses(12);
  const mAtual = mesAtual();
  const ctr = S.contratos.filter(c=>noEscopo(c,"corretor"));
  const prod = ctr.filter(c=>c.status!=="cancelado" && (c.inicio||"").slice(0,7)===mAtual);
  const producaoMes = prod.reduce((a,c)=>a+comissaoContrato(c),0);

  const pcs = parcelas().filter(p=>noEscopo(p,"corretor"));
  const recebidoMes = pcs.filter(p=>p.status==="recebido" && (p.recebidoEm||p.vence).slice(0,7)===mAtual).reduce((a,p)=>a+efetivoVis(p),0);
  const previsto90 = pcs.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),90)).reduce((a,p)=>a+valorVis(p),0);
  const atrasadas = pcs.filter(p=>p.vencida);
  const leadsAtivos = S.leads.filter(l=>!["ganho","perdido"].includes(l.etapa) && noEscopo(l));
  const pipeline = leadsAtivos.reduce((a,l)=>a+(Number(l.valorEstimado)||0),0);
  const ponderado = leadsAtivos.reduce((a,l)=>{ const e=S.config.etapas.find(e=>e.id===l.etapa); return a+(Number(l.valorEstimado)||0)*((e?e.prob:0)/100); },0);
  const fechados = S.leads.filter(l=>l.etapa==="ganho" && noEscopo(l)).length;
  const perdidos = S.leads.filter(l=>l.etapa==="perdido" && noEscopo(l)).length;
  const conv = fechados+perdidos ? fechados/(fechados+perdidos)*100 : 0;
  const ativos = ctr.filter(c=>["ativo","implantado"].includes(c.status));
  const vidas = ativos.reduce((a,c)=>a+totalVidas(c),0);
  const metaMes = S.escopo==="meu"
    ? (S.usuarios.find(u=>u.id===S.uid)?.meta || 0)
    : (S.usuarios.reduce((a,u)=>a+(Number(u.meta)||0),0) || S.config.metaGlobal);

  // alertas
  const tarefasVenc = S.tarefas.filter(t=>t.status!=="feita" && t.vence<=hoje() && noEscopo(t));
  const parados = leadsAtivos.filter(l=>diasEntre(l.ultimoContato||l.criadoEm||hoje(), hoje())>=4);
  const renov = ctr.filter(c=>c.fim && ["ativo","implantado"].includes(c.status) && c.fim>=hoje() && c.fim<=addDays(hoje(),60));
  const alertas = [
    tarefasVenc.length && {cls:"crit", ic:"!", t:`${tarefasVenc.length} tarefa${tarefasVenc.length>1?"s":""} vencida${tarefasVenc.length>1?"s":""}`, s:"Agenda precisa de atenção hoje", go:"tarefas"},
    atrasadas.length && {cls:"crit", ic:"$", t:`${atrasadas.length} comissão${atrasadas.length!==1?"ões":""} em atraso`, s:brl(atrasadas.reduce((a,p)=>a+valorVis(p),0))+" a conciliar", go:"comissoes", f:{status:"atrasado"}},
    (()=>{ const dias = Math.max(1, Number(S.config.diasAvisoComissao)||7);
      const proximas = pcs.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),dias));
      return proximas.length && {cls:"ok", ic:"$", t:`${brl(proximas.reduce((a,p)=>a+valorVis(p),0))} a receber`,
        s:`${proximas.length} parcela(s) vencem nos próximos ${dias} dias`, go:"comissoes"}; })(),
    parados.length && {cls:"warn", ic:"◷", t:`${parados.length} lead${parados.length!==1?"s":""} sem contato`, s:"Mais de 4 dias parados no funil", go:"leads"},
    (()=>{ const m = mudancasDeFaixa(60);
      return m.length && {cls:"warn", ic:"↑", t:`${m.length} vida${m.length!==1?"s":""} muda${m.length!==1?"m":""} de faixa etária`,
        s:"Reajuste por idade nos próximos 60 dias — avise antes do boleto", go:"vidas"}; })(),
    (()=>{ const r = reajustesChegando(30);
      return r.length && {cls:"warn", ic:"%", t:`${r.length} reajuste${r.length!==1?"s":""} anual${r.length!==1?"is":""} em 30 dias`,
        s:"Contratos de saúde no mês de aniversário", go:"renovacoes"}; })(),
    (()=>{ const d = diasAvisoAniv(), a = aniversariantes(d);
      return a.length && {cls:"info", ic:"✦", t:`${a.length} aniversariante${a.length!==1?"s":""} ${d===0?"hoje":`em ${d} dia${d!==1?"s":""}`}`,
        s:a.slice(0,2).map(x=>x.nome).join(", ")+(a.length>2?"…":""), go:"clientes"}; })(),
    renov.length && {cls:"info", ic:"↻", t:`${renov.length} renovaç${renov.length!==1?"ões":"ão"} em 60 dias`, s:"Antecipe o reajuste com o cliente", go:"renovacoes"},
    (()=>{ const atrasados = S.clientes.filter(x=>noEscopo(x) && etapaCliente(x)!=="encerrado" && posVenda(x).atrasado).length;
      return atrasados && {cls:"warn", ic:"☎", t:`${atrasados} cliente${atrasados!==1?"s":""} sem pós-venda`, s:"Passou da cadência de contato combinada", go:"clientes"}; })(),
    (()=>{ const g = despesasDoMes(mAtual).reduce((a,d)=>a+(Number(d.valor)||0),0);
      if(!g) return null;
      const r = receitaDoMes(mAtual) - g;
      return r < 0 && {cls:"crit", ic:"−", t:`Resultado negativo em ${brl(Math.abs(r))}`,
        s:`${brl(g)} de gastos contra ${brl(receitaDoMes(mAtual))} de comissão recebida`, go:"despesas"}; })()
  ].filter(Boolean);

  // séries
  const prodPorMes = ms.map(m=>{
    const o={mes:m}; PK.forEach(p=>o[p]=0);
    ctr.filter(c=>c.status!=="cancelado" && (c.inicio||"").slice(0,7)===m).forEach(c=>{ o[c.pilar]=(o[c.pilar]||0)+comissaoContrato(c); });
    return o;
  });
  const fluxo = proximosMeses(6).map(m=>({
    mes:m,
    previsto: pcs.filter(p=>p.mes===m && p.status!=="recebido").reduce((a,p)=>a+valorVis(p),0),
    recebido: pcs.filter(p=>p.mes===m && p.status==="recebido").reduce((a,p)=>a+efetivoVis(p),0)
  }));
  const funil = S.config.etapas.filter(e=>!["ganho","perdido"].includes(e.id)).map(e=>({
    nome:e.nome,
    n:S.leads.filter(l=>l.etapa===e.id && noEscopo(l)).length,
    v:S.leads.filter(l=>l.etapa===e.id && noEscopo(l)).reduce((a,l)=>a+(Number(l.valorEstimado)||0),0)
  }));

  return `
  ${alertas.length?`<div class="alerts">${alertas.map(a=>`
    <button class="alert ${a.cls} ${a.ic==="$"?"com":""}" data-act="irFiltro" data-view="${a.go}" data-f='${esc(JSON.stringify(a.f||{}))}'>
      <span class="ai" aria-hidden="true">${a.ic}</span>
      <span><b>${esc(a.t)}</b><span>${esc(a.s)}</span></span>
    </button>`).join("")}</div>`:""}

  ${avisoSuaParte()}
  <div class="stat-row">
    <div class="stat hero com">
      <div class="k">${veCorretora()?"Comissão gerada":"Sua comissão"} em ${mesLabel(mAtual)}</div>
      <div class="v">${brl(producaoMes)}</div>
      <div class="d">${prod.length} contrato${prod.length!==1?"s":""} · meta ${brl(metaMes)} · ${metaMes?pct(producaoMes/metaMes*100):"—"} atingida</div>
    </div>
    <div class="stat com">
      <div class="k">Comissão recebida no mês</div>
      <div class="v">${brl(recebidoMes)}</div>
      <div class="d">${pcs.filter(p=>p.status==="recebido"&&(p.recebidoEm||p.vence).slice(0,7)===mAtual).length} parcelas conciliadas</div>
    </div>
    <div class="stat com">
      <div class="k">Previsto 90 dias</div>
      <div class="v">${brl(previsto90)}</div>
      <div class="d">${atrasadas.length?`<span class="delta down">${brl(atrasadas.reduce((a,p)=>a+valorVis(p),0))} em atraso</span>`:"Nenhuma parcela em atraso"}</div>
    </div>
    <div class="stat">
      <div class="k">Pipeline ponderado</div>
      <div class="v">${brl(ponderado)}</div>
      <div class="d">${leadsAtivos.length} leads · ${brl(pipeline)} bruto</div>
    </div>
    <div class="stat">
      <div class="k">Conversão</div>
      <div class="v">${pct(conv)}</div>
      <div class="d">${fechados} ganhos · ${perdidos} perdidos</div>
    </div>
    <div class="stat">
      <div class="k">Carteira ativa</div>
      <div class="v">${ativos.length.toLocaleString("pt-BR")}</div>
      <div class="d">contratos ativos e implantados</div>
    </div>
  </div>

  ${painelExecutivo(ativos, vidas)}

  ${painelCrossSell()}

  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
    <section class="panel com">
      <div class="panel-head"><div><h3>Produção por mês</h3><div class="sub">Comissão gerada pelos contratos iniciados no mês · 12 meses</div></div></div>
      ${chartBarrasEmpilhadas(prodPorMes)}
      <div class="legend">${PK.map(p=>`<span><i class="dot" style="background:${PILARES[p].cor}"></i>${PILARES[p].curto}</span>`).join("")}</div>
      ${tabelaOculta(["Mês",...PK.map(p=>PILARES[p].curto)], prodPorMes.map(r=>[mesLabel(r.mes),...PK.map(p=>brl(r[p]))]))}
    </section>

    <section class="panel com">
      <div class="panel-head"><div><h3>Fluxo de comissão</h3><div class="sub">Próximos 6 meses · previsto e já recebido</div></div></div>
      ${chartFluxo(fluxo)}
      <div class="legend">
        <span><i class="dot" style="background:var(--accent)"></i>Recebido</span>
        <span><i class="dot" style="background:var(--line-strong)"></i>Previsto</span>
      </div>
      ${tabelaOculta(["Mês","Previsto","Recebido"], fluxo.map(r=>[mesLabel(r.mes),brl(r.previsto),brl(r.recebido)]))}
    </section>

    <section class="panel">
      <div class="panel-head"><div><h3>Funil</h3><div class="sub">Leads em aberto por etapa</div></div>
        <div class="right"><button class="btn sm ghost" data-act="irFiltro" data-view="leads" data-f="{}">Abrir funil</button></div></div>
      <div class="chart-wrap">
        ${funil.every(f=>!f.n) ? `<div class="empty"><b>Funil vazio</b>Cadastre o primeiro lead para começar a medir conversão.</div>` :
        funil.map(f=>{
          const max = Math.max(...funil.map(x=>x.n),1);
          return `<div class="bar-line"><span class="nm">${esc(f.nome)}</span>
            <span class="track"><span class="fill" style="width:${larg(f.n,max)}%;background:var(--accent)"></span></span>
            <span class="n">${f.n} · ${brl(f.v)}</span></div>`;
        }).join("")}
      </div>
    </section>

    ${veCorretora()?`<section class="panel">
      <div class="panel-head"><div><h3>Ranking da equipe</h3><div class="sub">Comissão gerada no mês contra a meta</div></div></div>
      <div class="chart-wrap">${rankingEquipe(mAtual)}</div>
    </section>`:""}
  </div>`;
}

/* ---------- gráficos ---------- */
const kNum = v => v>=1000 ? Math.round(v/1000)+"k" : String(Math.round(v));
/** Ticks 0 / meio / topo, descartando rótulos repetidos em escalas pequenas. */
function ticksDe(max){
  const brutos=[0,max/2,max], vistos=new Set(), out=[];
  brutos.forEach(t=>{ const r=kNum(t); if(!vistos.has(r)){ vistos.add(r); out.push([t,r]); } });
  return out;
}
function chartBarrasEmpilhadas(dados){
  const W=560, H=190, pad={t:14,r:8,b:26,l:52};
  const max = Math.max(...dados.map(d=>PK.reduce((a,p)=>a+(d[p]||0),0)), 1);
  const passo = (W-pad.l-pad.r)/dados.length;
  const bw = Math.min(26, passo*0.6);
  const escala = v => (H-pad.t-pad.b) * (v/max);
  let g="";
  ticksDe(max).forEach(([t,rot])=>{
    const y = H-pad.b-escala(t);
    g += `<line class="grid-l" x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}"/>
          <text class="val" x="${pad.l-7}" y="${y+3}" text-anchor="end">${rot}</text>`;
  });
  dados.forEach((d,i)=>{
    const x = pad.l + passo*i + (passo-bw)/2;
    let y = H-pad.b;
    const total = PK.reduce((a,p)=>a+(d[p]||0),0);
    PK.forEach(p=>{
      const v = d[p]||0; if(!v) return;
      const h = escala(v); y -= h;
      g += `<rect class="mark" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(h-2,1).toFixed(1)}" rx="2" fill="${PILARES[p].cor}"><title>${mesLabel(d.mes)} · ${PILARES[p].curto}: ${brl(v)}</title></rect>`;
    });
    if(total) g += `<text class="val" x="${(x+bw/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle">${total>=1000?Math.round(total/1000)+"k":Math.round(total)}</text>`;
    g += `<text class="lbl" x="${(x+bw/2).toFixed(1)}" y="${H-pad.b+14}" text-anchor="middle">${mesLabel(d.mes).slice(0,3)}</text>`;
  });
  g += `<line class="grid-l" x1="${pad.l}" y1="${H-pad.b}" x2="${W-pad.r}" y2="${H-pad.b}"/>`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Produção mensal por pilar">${g}</svg></div>`;
}
function chartFluxo(dados){
  const W=560, H=190, pad={t:16,r:8,b:26,l:52};
  const max = Math.max(...dados.map(d=>d.previsto+d.recebido), 1);
  const passo = (W-pad.l-pad.r)/dados.length;
  const bw = Math.min(30, passo*0.55);
  const escala = v => (H-pad.t-pad.b)*(v/max);
  let g="";
  ticksDe(max).forEach(([t,rot])=>{
    const y = H-pad.b-escala(t);
    g += `<line class="grid-l" x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}"/>
          <text class="val" x="${pad.l-7}" y="${y+3}" text-anchor="end">${rot}</text>`;
  });
  dados.forEach((d,i)=>{
    const x = pad.l + passo*i + (passo-bw)/2;
    let y = H-pad.b;
    const hr = escala(d.recebido), hp = escala(d.previsto);
    if(d.recebido){ y-=hr; g+=`<rect class="mark" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(hr-2,1).toFixed(1)}" rx="2" fill="var(--accent)"><title>${mesLabel(d.mes)} · recebido ${brl(d.recebido)}</title></rect>`; }
    if(d.previsto){ y-=hp; g+=`<rect class="mark" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(hp-2,1).toFixed(1)}" rx="2" fill="var(--line-strong)"><title>${mesLabel(d.mes)} · previsto ${brl(d.previsto)}</title></rect>`; }
    const tot = d.previsto+d.recebido;
    if(tot) g += `<text class="val" x="${(x+bw/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle">${tot>=1000?Math.round(tot/1000)+"k":Math.round(tot)}</text>`;
    g += `<text class="lbl" x="${(x+bw/2).toFixed(1)}" y="${H-pad.b+14}" text-anchor="middle">${mesLabel(d.mes).slice(0,3)}</text>`;
  });
  g += `<line class="grid-l" x1="${pad.l}" y1="${H-pad.b}" x2="${W-pad.r}" y2="${H-pad.b}"/>`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fluxo de comissão previsto e recebido">${g}</svg></div>`;
}
function tabelaOculta(cols, linhas){
  if(!linhas.length) return "";
  return `<details class="tblview"><summary>Ver os números em tabela</summary>
    <div class="tw" style="padding:0 16px 14px"><table>
      <thead><tr>${cols.map((c,i)=>`<th class="${i?"r":""}">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${linhas.map(l=>`<tr>${l.map((c,i)=>`<td class="${i?"r":""} ${i?"num":""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div></details>`;
}
function rankingEquipe(mes){
  const base = S.usuarios.filter(u=>u.ativo!==false);
  if(!base.length) return `<div class="empty"><b>Equipe ainda não cadastrada</b>Convide corretores pelo botão de compartilhar do sistema — cada pessoa aparece aqui ao abrir pela primeira vez.</div>`;
  const linhas = base.map(u=>{
    const p = S.contratos.filter(c=>c.corretor===u.id && c.status!=="cancelado" && (c.inicio||"").slice(0,7)===mes)
                          .reduce((a,c)=>a+comissaoContrato(c),0);
    return { nome:u.nome, meta:Number(u.meta)||0, p };
  }).sort((a,b)=>b.p-a.p);
  const max = Math.max(...linhas.map(l=>Math.max(l.p,l.meta)),1);
  return linhas.map(l=>{
    const at = l.meta ? l.p/l.meta*100 : 0;
    const cor = !l.meta ? "var(--ink-3)" : at>=100 ? "var(--ok)" : at>=60 ? "var(--gold)" : "var(--crit)";
    return `<div class="bar-line">
      <span class="nm">${esc(l.nome)}</span>
      <span class="track">
        <span class="fill" style="width:${Math.min(larg(l.p,max),100)}%;background:${cor}"></span>
      </span>
      <span class="n">${brl(l.p)}${l.meta?` · ${pct(at)}`:""}</span></div>`;
  }).join("");
}

/* ============================================================
   FUNIL DE LEADS
   ============================================================ */
function viewLeads(){
  const etapas = S.config.etapas;
  const f = S.filtros;
  const lista = S.leads.filter(l=>noEscopo(l))
    .filter(l=>!f.pilar || l.pilar===f.pilar)
    .filter(l=>!f.origem || l.origem===f.origem)
    .filter(l=>!S.busca || (l.nome+" "+(l.empresa||"")+" "+(l.telefone||"")).toLowerCase().includes(S.busca.toLowerCase()));
  return `
  <div class="filters">
    <div class="field" style="flex:1;min-width:210px"><label for="fBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="fBusca" type="text" placeholder="Nome, empresa ou telefone" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field"><label for="fPilar">Pilar</label><select id="fPilar" data-act="filtro" data-k="pilar">
      <option value="">Todos</option>${PK.map(p=>`<option value="${p}" ${f.pilar===p?"selected":""}>${PILARES[p].curto}</option>`).join("")}</select></div>
    <div class="field"><label for="fOrigem">Origem</label><select id="fOrigem" data-act="filtro" data-k="origem">
      <option value="">Todas</option>${S.config.origens.map(o=>`<option ${f.origem===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
  </div>
  <div class="board">${etapas.map(e=>{
    const ls = lista.filter(l=>l.etapa===e.id);
    const total = ls.reduce((a,l)=>a+(Number(l.valorEstimado)||0),0);
    return `<div class="col" data-etapa="${e.id}">
      <div class="col-head"><b>${esc(e.nome)}</b><span class="cnt">${ls.length}</span><span class="val">${brl(total)}</span>
        ${ls.length && ["perdido","ganho"].includes(e.id)
          ? `<button class="btn sm ghost danger" style="padding:1px 6px" data-act="limparEtapa" data-e="${esc(e.id)}" title="Excluir todos os leads desta coluna" aria-label="Limpar coluna ${esc(e.nome)}">×</button>` : ""}</div>
      <div class="col-body">${ls.map(cardLead).join("") || `<div class="hint" style="padding:8px 4px">Arraste um lead para cá.</div>`}</div>
    </div>`;
  }).join("")}</div>`;
}
function cardLead(l){
  const dias = diasEntre(l.ultimoContato||l.criadoEm||hoje(), hoje());
  const t = { quente:"🔥", morno:"🌡️", frio:"❄️" }[l.temperatura] || "";
  return `<article class="lead ${esc(l.pilar)}" draggable="true" data-lead="${esc(l.id)}" tabindex="0" role="button">
    <button class="del" data-act="excluirLead" data-id="${esc(l.id)}" title="Excluir lead" aria-label="Excluir ${esc(l.nome)}">×</button>
    <b>${esc(l.nome)}</b>
    ${l.empresa?`<div class="org">${esc(l.empresa)}</div>`:""}
    <div class="meta">
      <span class="val">${brl(l.valorEstimado)}</span>
      ${l.previsaoFechamento&&!["ganho","perdido"].includes(l.etapa)?`<span class="chip mute" title="Previsão de fechamento">${mesLabel(l.previsaoFechamento.slice(0,7))}</span>`:""}
      ${(()=>{ const c=estimativaLead(l).total; return c?`<span class="chip ok com" title="Comissão estimada">${brl(c)}</span>`:""; })()}
      ${t?`<span class="temp" title="${esc(l.temperatura)}">${t}</span>`:""}
      ${dias>=4 && !["ganho","perdido"].includes(l.etapa) ? `<span class="chip crit">${dias}d parado</span>`:""}
      <span class="chip mute" style="margin-left:auto">${esc(iniciais(nomeUsuario(l.responsavel)))}</span>
    </div>
  </article>`;
}
function ligarKanban(){
  let arrastando=null;
  document.querySelectorAll(".lead").forEach(el=>{
    el.addEventListener("dragstart", e=>{ arrastando=el.dataset.lead; el.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; });
    el.addEventListener("dragend", ()=>{ el.classList.remove("dragging"); arrastando=null; });
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); abrirLead(el.dataset.lead); } });
  });
  document.querySelectorAll(".col").forEach(col=>{
    col.addEventListener("dragover", e=>{ e.preventDefault(); col.classList.add("dragover"); });
    col.addEventListener("dragleave", ()=>col.classList.remove("dragover"));
    col.addEventListener("drop", e=>{
      e.preventDefault(); col.classList.remove("dragover");
      if(!arrastando) return;
      moverLead(arrastando, col.dataset.etapa);
    });
  });
}
async function moverLead(id, etapa){
  const l = S.leads.find(x=>x.id===id); if(!l || l.etapa===etapa) return;
  if(etapa==="ganho"){ abrirConversao(l); return; }
  const de = etapaNome(l.etapa);
  l.etapa=etapa; l.ultimoContato=hoje();
  l.historico = [{data:hoje(), texto:`Etapa alterada de ${de} para ${etapaNome(etapa)}`, autor:S.meNome}, ...(l.historico||[])];
  if(etapa==="perdido"){ fecharModal(); abrirPerda(l); return; }
  await salvar("leads", l, `Moveu para ${etapaNome(etapa)}`);
  toast(`${l.nome} → ${etapaNome(etapa)}`);
}

/* ============================================================
   CLIENTES
   ============================================================ */
/** Etapa de relacionamento do cliente; sem valor gravado, deduz do contrato. */
function etapaCliente(c){
  if(c.etapaCliente) return c.etapaCliente;
  const cs = contratosDoCliente(c.id);
  if(!cs.length) return "onboarding";
  if(cs.every(x=>x.status==="cancelado")) return "encerrado";
  if(cs.some(x=>["ativo","implantado"].includes(x.status))) return "ativo";
  return "onboarding";
}
function viewClientes(){
  const busca = S.busca.toLowerCase();
  const lista = S.clientes.filter(c=>noEscopo(c))
    .filter(c=>!busca || (c.nome+" "+(c.doc||"")+" "+(c.email||"")+" "+(c.telefone||"")).toLowerCase().includes(busca))
    .sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  if(!S.clientes.length) return vazio("Nenhum cliente ainda","Todo lead marcado como ganho vira cliente automaticamente. Você também pode cadastrar direto.","novoCliente","Cadastrar cliente");
  const controles = `
  <div class="filters">
    <div class="field" style="flex:1;max-width:340px"><label for="cBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="cBusca" type="text" placeholder="Nome, CNPJ/CPF, e-mail" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field" style="flex:none"><label>Visualização</label>
      <div class="seg" role="group" aria-label="Visualização da carteira">
        <button data-act="modoClientes" data-v="kanban" aria-pressed="${S.modoClientes==="kanban"}">Quadro</button>
        <button data-act="modoClientes" data-v="lista" aria-pressed="${S.modoClientes==="lista"}">Lista</button>
      </div></div>
    <div class="field" style="flex:none"><label>&nbsp;</label><button class="btn" data-act="baixarRel" data-tipo="carteira">Baixar carteira (Excel ou PDF)</button></div>
  </div>`;
  // Paginação: antes a tela desenhava todos os clientes de uma vez — 6 MB de HTML
  // e 113 mil elementos com 5.000 clientes. Agora desenha por blocos.
  const POR_PAGINA = 60;
  const pag = S.pagClientes || 1;
  const fatia = lista.slice(0, pag*POR_PAGINA);
  const maisBotao = fatia.length < lista.length
    ? `<div class="ta"><button class="btn" data-act="maisClientes">Mostrar mais ${Math.min(POR_PAGINA, lista.length-fatia.length)} de ${lista.length.toLocaleString("pt-BR")}</button></div>`
    : "";
  const contagem = `<div class="hint" style="margin:-4px 0 12px">${lista.length.toLocaleString("pt-BR")} cliente${lista.length!==1?"s":""}${fatia.length<lista.length?` · mostrando ${fatia.length}`:""}${S.busca?` para “${esc(S.busca)}”`:""}</div>`;
  if(S.modoClientes==="kanban") return painelPosVenda(lista) + controles + contagem + boardClientes(fatia) + maisBotao;
  return painelPosVenda(lista) + controles + contagem + `
  <div class="panel"><div class="tw"><table>
    <thead><tr><th>Cliente</th><th>Etapa</th><th>Contato</th><th>Contratos</th><th class="r">Vidas</th><th class="r com">${veCorretora()?"Comissão gerada":"Sua comissão"}</th><th>Responsável</th><th></th></tr></thead>
    <tbody>${fatia.map(c=>{
      const cs = contratosDoCliente(c.id).filter(x=>x.status!=="cancelado");
      const receita = receitaCliente(c);
      return `<tr class="clickable" data-act="abrirCliente" data-id="${esc(c.id)}">
        <td><b>${esc(c.nome)}</b>${c.doc?`<div class="hint num">${esc(mascararDoc(c.doc))}</div>`:""}</td>
        <td><span class="chip ${etapaCliente(c)==="risco"?"crit":etapaCliente(c)==="ativo"?"ok":"mute"}">${esc(nomeEtapaCliente(etapaCliente(c)))}</span></td>
        <td>${esc(c.telefone||"—")}${c.email?`<div class="hint">${esc(c.email)}</div>`:""}</td>
        <td>${cs.length ? cs.map(x=>`<span class="chip ${esc(x.pilar)}">${esc(PILARES[x.pilar].curto)}</span>`).join(" ") : `<span class="hint">—</span>`}</td>
        <td class="r num">${vidasAtivas(vidasDoCliente(c.id)).length || "—"}</td>
        <td class="r num com">${brl(receita)}</td>
        <td>${esc(nomeUsuario(c.responsavel))}</td>
        <td class="r"><button class="btn sm ghost" data-act="editarCliente" data-id="${esc(c.id)}" title="Editar os dados de ${esc(c.nome)}" aria-label="Editar ${esc(c.nome)}">✎ Editar</button></td>
      </tr>`;
    }).join("") || `<tr><td colspan="8" class="empty">Nenhum cliente encontrado para essa busca.</td></tr>`}</tbody>
  </table></div></div>`;
}

/** Próximo vencimento de boleto de um contrato, a partir do dia do mês. */
function proximoBoleto(c){
  const dia = Number(c.diaVencimento);
  if(!dia) return null;
  const h = hoje(), ano = +h.slice(0,4), mes = +h.slice(5,7), diaHoje = +h.slice(8,10);
  const noMes = (a,m) => { const ult = new Date(a, m, 0).getDate(); return `${a}-${String(m).padStart(2,"0")}-${String(Math.min(dia,ult)).padStart(2,"0")}`; };
  const esteMes = noMes(ano, mes);
  if(+esteMes.slice(8,10) >= diaHoje) return esteMes;
  return mes===12 ? noMes(ano+1,1) : noMes(ano,mes+1);
}
/** Situação de pós-venda de um cliente: quando foi o último contato e quando é o próximo. */
function posVenda(cli){
  const cadencia = Number(cli.posVendaCadencia) || Number(S.config.cadenciaPosVenda) || 90;
  const ultimo = cli.ultimoPosVenda || "";
  const referencia = ultimo || cli.criadoEm || hoje();
  const proximo = addDays(referencia, cadencia);
  return { cadencia, ultimo, proximo, dias: diasEntre(hoje(), proximo), atrasado: proximo < hoje() };
}
function nomeEtapaCliente(id){ const e=S.config.etapasCliente.find(e=>e.id===id); return e?e.nome:id; }
/** Lembretes de pós-venda: boleto chegando, contato vencido e aniversário de contrato. */
function painelPosVenda(lista){
  const ativos = lista.filter(c=>etapaCliente(c)!=="encerrado");
  const boletos = [];
  ativos.forEach(cli=>{
    contratosDoCliente(cli.id).filter(x=>["ativo","implantado"].includes(x.status) && x.diaVencimento)
      .forEach(x=>{ const d = proximoBoleto(x); if(d && diasEntre(hoje(),d) <= 7) boletos.push({cli, ctr:x, data:d, dias:diasEntre(hoje(),d)}); });
  });
  boletos.sort((a,b)=>a.data.localeCompare(b.data));

  const contatos = ativos.map(cli=>({cli, pv:posVenda(cli)}))
    .filter(x=>x.pv.dias <= 7)
    .sort((a,b)=>a.pv.proximo.localeCompare(b.pv.proximo));

  const aniversarios = [];
  ativos.forEach(cli=>{
    contratosDoCliente(cli.id).filter(x=>["ativo","implantado"].includes(x.status) && x.fim)
      .forEach(x=>{ const d = diasEntre(hoje(), x.fim); if(d>=0 && d<=60) aniversarios.push({cli, ctr:x, dias:d}); });
  });
  aniversarios.sort((a,b)=>a.dias-b.dias);

  const festas = aniversariantes(diasAvisoAniv(), lista);
  if(!boletos.length && !contatos.length && !aniversarios.length && !festas.length){
    const semDia = S.contratos.filter(x=>["ativo","implantado"].includes(x.status) && !x.diaVencimento).length;
    if(!semDia) return "";
    return `<section class="panel" style="margin-bottom:16px"><div class="chart-wrap">
      <div class="hint">Preencha o <b>dia de vencimento do boleto</b> nos contratos e esta área passa a avisar quando a cobrança do cliente está chegando — ${semDia} contrato(s) ativo(s) ainda sem esse dado.</div>
    </div></section>`;
  }
  // Cada bloco mostra no máximo 15 linhas: é uma lista de trabalho do dia,
  // não um relatório. Sem isso, uma carteira grande desenha milhares de linhas.
  const TETO_BLOCO = 15;
  const bloco = (titulo, cls, itens, corpo) => itens.length ? `
    <div style="margin-bottom:14px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:7px">
        <span class="chip ${cls}">${esc(titulo)}</span><span class="hint">${itens.length} ${itens.length===1?"cliente":"clientes"}</span></div>
      <div class="tw"><table><tbody>${corpo}</tbody></table></div>
      ${itens.length>TETO_BLOCO?`<div class="ta">e mais ${itens.length-TETO_BLOCO} — os mais urgentes vêm primeiro.</div>`:""}
    </div>` : "";

  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h3>Lembretes de pós-venda</h3>
      <div class="sub">Quem merece um contato seu nos próximos dias</div></div>
      <div class="right" style="display:flex;gap:6px;align-items:center">
        <span class="hint">Aniversários com</span>
        ${S.mePapel==="gestor"
          ? `<input type="number" min="0" max="60" value="${diasAvisoAniv()}" data-act="cfgNum" data-k="diasAvisoAniversario" data-min="0" data-max="60" style="width:58px;padding:3px 7px;font-size:12.5px;text-align:center" aria-label="Dias de antecedência do lembrete de aniversário">`
          : `<b>${diasAvisoAniv()}</b>`}
        <span class="hint">dias de antecedência</span></div></div>
    <div class="chart-wrap">
      ${bloco("Boleto chegando", "warn", boletos, boletos.slice(0,TETO_BLOCO).map(b=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(b.cli.id)}"><b>${esc(b.cli.nome)}</b>
          <div class="hint">${esc(b.ctr.operadora||"")} · vigência ${dt(b.ctr.inicio)} — ${b.ctr.fim?dt(b.ctr.fim):"—"}</div></td>
        <td class="num">vence ${dt(b.data)} <span class="chip ${b.dias<=2?"crit":"warn"}">${b.dias===0?"hoje":`em ${b.dias}d`}</span></td>
        <td class="r num">${brl(b.ctr.valorBase)}</td>
        <td class="r"><button class="btn sm" data-act="tarefaBoleto" data-id="${esc(b.cli.id)}" data-c="${esc(b.ctr.id)}" data-d="${esc(b.data)}">Lembrar</button></td>
      </tr>`).join(""))}

      ${bloco("Contato de pós-venda", "info", contatos, contatos.slice(0,TETO_BLOCO).map(x=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(x.cli.id)}"><b>${esc(x.cli.nome)}</b>
          <div class="hint">${x.pv.ultimo?`último contato em ${dt(x.pv.ultimo)}`:"nenhum contato registrado"} · a cada ${x.pv.cadencia} dias</div></td>
        <td class="num">${x.pv.atrasado?`<span class="chip crit">atrasado ${Math.abs(x.pv.dias)}d</span>`:`<span class="chip info">em ${x.pv.dias}d</span>`}</td>
        <td class="r"><button class="btn sm" data-act="registrarPosVenda" data-id="${esc(x.cli.id)}">Falei com ele</button>
          <button class="btn sm ghost" data-act="tarefaPosVenda" data-id="${esc(x.cli.id)}">Agendar</button></td>
      </tr>`).join(""))}

      ${bloco("Aniversário", "info", festas, festas.slice(0,TETO_BLOCO).map(x=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(x.c.id)}"><b>${esc(x.quem==="contato"?x.nome:x.c.nome)}</b>
          <div class="hint">${esc(descAniv(x))}</div></td>
        <td class="num">${dt(x.prox)} <span class="chip ${x.dias===0?"ok":"info"}">${x.dias===0?"hoje":`em ${x.dias}d`}</span>${jaParabenizado(x)?` <span class="chip mute">parabenizado</span>`:""}</td>
        <td class="r" style="white-space:nowrap">${botoesAniv(x)}</td>
      </tr>`).join(""))}

      ${bloco("Aniversário de contrato", "ok", aniversarios, aniversarios.slice(0,TETO_BLOCO).map(a=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(a.cli.id)}"><b>${esc(a.cli.nome)}</b>
          <div class="hint">${esc(a.ctr.operadora||"")} · reajuste e renovação</div></td>
        <td class="num">${dt(a.ctr.fim)} <span class="chip ${a.dias<=30?"warn":"ok"}">em ${a.dias}d</span></td>
        <td class="r"><button class="btn sm" data-act="irFiltro" data-view="renovacoes" data-f="{}">Ver renovações</button></td>
      </tr>`).join(""))}
    </div>
  </section>`;
}
function boardClientes(lista){
  return `<div class="board" data-board="clientes">${S.config.etapasCliente.map(e=>{
    const cs = lista.filter(c=>etapaCliente(c)===e.id);
    const receita = cs.reduce((a,c)=>a+receitaCliente(c),0);
    return `<div class="col" data-etapa="${esc(e.id)}">
      <div class="col-head"><b>${esc(e.nome)}</b><span class="cnt">${cs.length}</span><span class="val com">${brl(receita)}</span></div>
      <div class="col-body">${cs.map(cardCliente).join("") || `<div class="hint" style="padding:8px 4px">Arraste um cliente para cá.</div>`}</div>
    </div>`;
  }).join("")}</div>
  <div class="hint" style="margin-top:12px">Arraste o cartão para mover o cliente na esteira de pós-venda. <b>Em risco</b> marca quem sinalizou cancelamento ou está inadimplente; <b>Renovação em curso</b>, quem já entrou na negociação do reajuste.</div>`;
}
/** Valor do cliente para a corretora: comissão gerada por todos os contratos. */
function receitaCliente(c){
  return contratosDoCliente(c.id).filter(x=>x.status!=="cancelado" && noEscopo(x,"corretor"))
                    .reduce((a,x)=>a+comissaoContrato(x),0);
}
function cardCliente(c){
  const cs = contratosDoCliente(c.id).filter(x=>x.status!=="cancelado");
  const pilares = [...new Set(cs.map(x=>x.pilar))];
  const venc = cs.filter(x=>x.fim && x.fim<=addDays(hoje(),60) && x.fim>=hoje())
                 .sort((a,b)=>a.fim.localeCompare(b.fim))[0];
  const principal = pilares[0] || "saude";
  return `<article class="lead ${esc(principal)}" draggable="true" data-cliente="${esc(c.id)}" tabindex="0" role="button">
    ${podeExcluirCarteira()?`<button class="del" data-act="excluirCliente" data-id="${esc(c.id)}" title="Excluir cliente" aria-label="Excluir ${esc(c.nome)}">×</button>`:""}
    <b>${esc(c.nome)}</b>
    <div class="org">${esc(c.tipo||"PJ")} · ${cs.length} contrato${cs.length!==1?"s":""}</div>
    <div class="meta">
      <span class="val com">${brl(receitaCliente(c))}</span>
      ${pilares.map(p=>`<span class="chip ${esc(p)}">${esc(PILARES[p].curto)}</span>`).join("")}
    </div>
    ${(()=>{ const pv=posVenda(c);
      const bol = cs.filter(x=>x.diaVencimento).map(x=>proximoBoleto(x)).filter(Boolean).sort()[0];
      const marcas = [];
      if(bol && diasEntre(hoje(),bol)<=7) marcas.push(`<span class="chip warn">boleto ${dt(bol).slice(0,5)}</span>`);
      if(pv.atrasado) marcas.push(`<span class="chip crit">pós-venda atrasado</span>`);
      if(venc) marcas.push(`<span class="chip mute">vence ${dt(venc.fim)}</span>`);
      const an = aniversariantes(diasAvisoAniv(), [c])[0];
      if(an) marcas.push(`<span class="chip info">aniversário ${an.dias===0?"hoje":dt(an.prox).slice(0,5)}</span>`);
      return marcas.length?`<div class="meta">${marcas.join("")}</div>`:"";
    })()}
    <div class="meta"><span class="hint">${esc(nomeUsuario(c.responsavel))}</span>
      <span class="chip mute" style="margin-left:auto">${esc(iniciais(nomeUsuario(c.responsavel)))}</span></div>
  </article>`;
}
function ligarBoardClientes(){
  let arrastando=null;
  document.querySelectorAll("[data-cliente]").forEach(el=>{
    el.addEventListener("dragstart", e=>{ arrastando=el.dataset.cliente; el.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; });
    el.addEventListener("dragend", ()=>{ el.classList.remove("dragging"); arrastando=null; });
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); abrirCliente(el.dataset.cliente); } });
  });
  document.querySelectorAll('[data-board="clientes"] .col').forEach(col=>{
    col.addEventListener("dragover", e=>{ e.preventDefault(); col.classList.add("dragover"); });
    col.addEventListener("dragleave", ()=>col.classList.remove("dragover"));
    col.addEventListener("drop", async e=>{
      e.preventDefault(); col.classList.remove("dragover");
      if(!arrastando) return;
      await moverCliente(arrastando, col.dataset.etapa);
    });
  });
}
async function moverCliente(id, etapa){
  const c = S.clientes.find(x=>x.id===id); if(!c || etapaCliente(c)===etapa) return;
  c.etapaCliente = etapa;
  await salvar("clientes", c, `Moveu para ${nomeEtapaCliente(etapa)}`);
  toast(`${c.nome} → ${nomeEtapaCliente(etapa)}`);
}

/* ============================================================
   CONTRATOS
   ============================================================ */
function viewContratos(){
  const f=S.filtros, busca=S.busca.toLowerCase();
  const lista = S.contratos.filter(c=>noEscopo(c,"corretor"))
    .filter(c=>!f.pilar || c.pilar===f.pilar)
    .filter(c=>!f.status || c.status===f.status)
    .filter(c=>!f.operadora || c.operadora===f.operadora)
    .filter(c=>!busca || (c.clienteNome+" "+(c.numero||"")+" "+(c.operadora||"")).toLowerCase().includes(busca))
    .sort((a,b)=>(b.inicio||"").localeCompare(a.inicio||""));
  if(!S.contratos.length) return vazio("Nenhum contrato registrado","Cada contrato gera automaticamente o cronograma de comissão conforme a régua da operadora.","novoContrato","Registrar contrato");
  const operadoras = [...new Set(S.contratos.map(c=>c.operadora).filter(Boolean))].sort();
  const totalBase = lista.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const totalCom = lista.reduce((a,c)=>a+comissaoContrato(c),0);
  const POR_PAGINA_CTR = 80;
  const ctrFatia = lista.slice(0, (S.pagContratos||1)*POR_PAGINA_CTR);
  return `
  <div class="filters">
    <div class="field" style="flex:1;min-width:200px"><label for="ctBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="ctBusca" type="text" placeholder="Cliente, nº da proposta, operadora" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field"><label for="ctPilar">Pilar</label><select id="ctPilar" data-act="filtro" data-k="pilar"><option value="">Todos</option>${PK.map(p=>`<option value="${p}" ${f.pilar===p?"selected":""}>${PILARES[p].curto}</option>`).join("")}</select></div>
    <div class="field"><label for="ctStatus">Situação</label><select id="ctStatus" data-act="filtro" data-k="status"><option value="">Todas</option>${Object.entries(STATUS_CONTRATO).map(([k,v])=>`<option value="${k}" ${f.status===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
    <div class="field"><label for="ctOp">Operadora</label><select id="ctOp" data-act="filtro" data-k="operadora"><option value="">Todas</option>${operadoras.map(o=>`<option ${f.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
  </div>
  <div class="panel">
    <div class="panel-head"><div><h3>${lista.length.toLocaleString("pt-BR")} contrato${lista.length!==1?"s":""}</h3>
      <div class="sub">${brl(totalBase)} em base de cálculo · ${brl(lista.reduce((a,c)=>a+(Number(c.valorTotal)||0),0))} em valor de contrato<span class="com"> · ${brl(totalCom)} de comissão${veCorretora()?" gerada":" sua"}</span>${ctrFatia.length<lista.length?` · mostrando ${ctrFatia.length}`:""}</div></div>
      <div class="right"><button class="btn sm" data-act="baixarRel" data-tipo="contratos">Baixar Excel / PDF</button></div></div>
    <div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Produto</th><th>Operadora</th><th class="r">Base</th><th class="r">Valor do contrato</th><th class="r com">${veCorretora()?"Comissão":"Sua comissão"}</th><th>Vigência</th><th>Situação</th><th>Corretor</th><th></th></tr></thead>
      <tbody>${ctrFatia.map(c=>{
        const com = comissaoContrato(c);
        const st = STATUS_CONTRATO[c.status]||STATUS_CONTRATO.proposta;
        return `<tr class="clickable" data-act="abrirContrato" data-id="${esc(c.id)}">
          <td><b>${esc(c.clienteNome)}</b>${c.numero?`<div class="hint num">nº ${esc(c.numero)}</div>`:""}</td>
          <td><span class="chip ${esc(c.pilar)}">${esc(PILARES[c.pilar].curto)}</span> <span class="hint">${esc(c.produto||"")}</span></td>
          <td>${esc(c.operadora||"—")}</td>
          <td class="r num">${brl(c.valorBase)}${totalVidas(c)?`<div class="hint">${totalVidas(c)} vida${totalVidas(c)!==1?"s":""}${contratoTemVida(c)&&!vidasDetalhadas(c)?" (a detalhar)":""}</div>`:""}</td>
          <td class="r num">${c.valorTotal?brl(c.valorTotal):`<span class="hint">—</span>`}</td>
          <td class="r num com">${brl(com)}</td>
          <td class="num">${dt(c.inicio)}${c.fim?`<div class="hint num">até ${dt(c.fim)}</div>`:""}</td>
          <td><span class="chip ${st.cls}">${st.nome}</span></td>
          <td>${esc(iniciais(nomeUsuario(c.corretor)))}</td>
          <td class="r" style="white-space:nowrap">
            <button class="btn sm ghost" data-act="editarContrato" data-id="${esc(c.id)}" title="Editar contrato" aria-label="Editar contrato de ${esc(c.clienteNome)}">✎</button>
            ${podeExcluirCarteira()?`<button class="btn sm ghost danger" data-act="excluirContrato" data-id="${esc(c.id)}" title="Excluir contrato" aria-label="Excluir contrato de ${esc(c.clienteNome)}">×</button>`:""}
          </td>
        </tr>`;
      }).join("") || `<tr><td colspan="8" class="empty">Nenhum contrato com esses filtros.</td></tr>`}</tbody>
    </table></div>
    ${ctrFatia.length < lista.length?`<div class="ta"><button class="btn" data-act="maisContratos">Mostrar mais ${Math.min(POR_PAGINA_CTR, lista.length-ctrFatia.length)} de ${lista.length.toLocaleString("pt-BR")}</button></div>`:""}
  </div>`;
}

/* ============================================================
   COMISSÕES
   ============================================================ */
function viewComissoes(){
  const f = S.filtros;
  let ps = parcelas().filter(p=>noEscopo(p,"corretor"));
  if(f.status==="atrasado") ps = ps.filter(p=>p.vencida);
  else if(f.status) ps = ps.filter(p=>p.status===f.status);
  if(f.mes) ps = ps.filter(p=>p.mes===f.mes);
  if(f.corretor) ps = ps.filter(p=>p.corretor===f.corretor);
  if(f.tipo) ps = ps.filter(p=>p.tipo===f.tipo);
  if(f.pilar) ps = ps.filter(p=>p.pilar===f.pilar);
  ps.sort((a,b)=>a.vence.localeCompare(b.vence));
  const imp = veCorretora() && haImposto();

  const todas = parcelas().filter(p=>noEscopo(p,"corretor"));
  const aReceber = todas.filter(p=>p.status==="previsto").reduce((a,p)=>a+valorVis(p),0);
  const atrasado = todas.filter(p=>p.vencida).reduce((a,p)=>a+valorVis(p),0);
  const recebido12 = todas.filter(p=>p.status==="recebido" && p.mes>=ultimosMeses(12)[0]).reduce((a,p)=>a+efetivoVis(p),0);
  const repasse = todas.filter(p=>p.status==="recebido").reduce((a,p)=>a+p.valorCorretor,0);
  const meses = [...new Set(todas.map(p=>p.mes))].sort();

  if(!todas.length) return vazio("Sem comissões ainda","O cronograma de comissão nasce junto com o contrato: cadastre o primeiro e as parcelas aparecem aqui.","novoContrato","Registrar contrato");

  const selTotal = ps.reduce((a,p)=>a+(p.status==="recebido"?efetivoVis(p):valorVis(p)),0);
  // A tabela é de trabalho, não de arquivo: desenha por blocos. Os totais
  // acima continuam somando o filtro inteiro.
  const POR_PAGINA_COM = 150;
  const psFatia = ps.slice(0, (S.pagComissoes||1)*POR_PAGINA_COM);
  return `
  <div class="stat-row">
    <div class="stat hero"><div class="k">${veCorretora()?"A receber":"Você tem a receber"}</div><div class="v">${brl(aReceber)}</div><div class="d">${todas.filter(p=>p.status==="previsto").length} parcelas em aberto${imp?` · ${brl(todas.filter(p=>p.status==="previsto").reduce((a,p)=>a+p.liquido,0))} líquido de imposto`:""}</div></div>
    ${(()=>{ const cons = todas.filter(p=>p.pilar==="consorcios" && p.status==="previsto");
      return cons.length ? `<div class="stat clickable" data-act="irFiltro" data-view="comissoes" data-f='{"pilar":"consorcios"}'><div class="k">Consórcio a receber</div><div class="v">${brl(cons.reduce((a,p)=>a+valorVis(p),0))}</div><div class="d">${cons.length} parcela(s) de cotas</div></div>` : ""; })()}
    <div class="stat"><div class="k">Em atraso</div><div class="v" style="color:${atrasado?"var(--crit)":"inherit"}">${brl(atrasado)}</div><div class="d">Vencidas e não conciliadas</div></div>
    <div class="stat"><div class="k">${veCorretora()?"Recebido (12 meses)":"Você recebeu (12 meses)"}</div><div class="v">${brl(recebido12)}</div><div class="d">Valores conciliados</div></div>
    ${veCorretora()?`<div class="stat"><div class="k">Repasse a corretores</div><div class="v">${brl(repasse)}</div><div class="d">Sobre o que já entrou</div></div>`:""}
  </div>
  ${painelLembretes(todas)}
  ${painelPrevisao()}
  <div class="filters">
    <div class="field"><label for="coStatus">Situação</label><select id="coStatus" data-act="filtro" data-k="status">
      <option value="">Todas</option><option value="atrasado" ${f.status==="atrasado"?"selected":""}>Em atraso</option>
      ${Object.entries(STATUS_COM).map(([k,v])=>`<option value="${k}" ${f.status===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
    <div class="field"><label for="coMes">Vencimento</label><select id="coMes" data-act="filtro" data-k="mes">
      <option value="">Todos os meses</option>${meses.map(m=>`<option value="${m}" ${f.mes===m?"selected":""}>${mesLabel(m)}</option>`).join("")}</select></div>
    <div class="field"><label for="coCor">Corretor</label><select id="coCor" data-act="filtro" data-k="corretor">
      <option value="">Todos</option>${S.usuarios.map(u=>`<option value="${esc(u.id)}" ${f.corretor===u.id?"selected":""}>${esc(u.nome)}</option>`).join("")}</select></div>
    <div class="field"><label for="coTipo">Tipo</label><select id="coTipo" data-act="filtro" data-k="tipo">
      <option value="">Agenciamento e vitalício</option>
      ${Object.entries(TIPO_PARCELA).map(([k,v])=>`<option value="${k}" ${f.tipo===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
    <div class="field"><label for="coPilar">Pilar</label><select id="coPilar" data-act="filtro" data-k="pilar">
      <option value="">Todos</option>${PK.map(k=>`<option value="${k}" ${f.pilar===k?"selected":""}>${esc(PILARES[k].curto)}${k==="consorcios"?" (consórcio)":""}</option>`).join("")}</select></div>
  </div>
  <div class="panel">
    <div class="panel-head"><div><h3>${ps.length.toLocaleString("pt-BR")} parcela${ps.length!==1?"s":""}</h3><div class="sub">${brl(selTotal)} no filtro atual${veCorretora()?"":" · sua parte"}${psFatia.length<ps.length?` · mostrando ${psFatia.length}`:""}</div></div>
      <div class="right">
        ${veCorretora()?`<button class="btn sm primary" data-act="novaParcela">+ Comissão</button>`:""}
        ${ps.some(p=>p.status!=="recebido")?`<button class="btn sm" data-act="conciliarLote">Marcar filtro como recebido</button>`:""}
        ${ps.length&&podeDesfazer()?`<button class="btn sm ghost danger" data-act="excluirLote">Excluir filtro</button>`:""}
        <button class="btn sm" data-act="baixarRel" data-tipo="comissoes">Baixar Excel / PDF</button></div></div>
    <div class="tw"><table>
      <thead><tr><th>Data prevista</th><th>Cliente</th><th>Tipo</th><th>Parcela</th>${veCorretora()?`<th class="r">Valor bruto</th>${imp?`<th class="r">Imposto</th>`:""}<th class="r">Corretor</th><th class="r">Corretora${imp?" líquido":""}</th>`:`<th class="r">Sua comissão</th>`}<th>Situação</th><th></th></tr></thead>
      <tbody>${psFatia.map(p=>{
        const st = p.vencida ? STATUS_COM.atrasado : (STATUS_COM[p.status]||STATUS_COM.previsto);
        return `<tr>
          <td class="num">${dt(p.vence)}</td>
          <td class="clickable" data-act="abrirContrato" data-id="${esc(p.contratoId)}"><b>${esc(p.cliente)}</b>
            ${p.pilar==="consorcios"?` <span class="chip consorcios" title="Comissão de consórcio${p.contrato.grupo?` · grupo ${esc(p.contrato.grupo)}`:""}${p.contrato.cota?` · cota ${esc(p.contrato.cota)}`:""}">Consórcio</span>`:""}</td>
          <td><span class="chip ${tipoP(p.tipo).cls}">${tipoP(p.tipo).nome}</span>
              <div class="hint">${esc(PILARES[p.pilar].curto)} · ${esc(p.operadora||"")}</div></td>
          <td class="num">${p.n}/${p.contrato.comissoes.length}${veCorretora()?` <span class="hint">(${pctR(p.pct)})</span>`:""}</td>
          ${veCorretora()
            ? `<td class="r num"><b>${brl2(p.efetivo)}</b></td>
               ${imp?`<td class="r num">${p.imposto?brl2(p.imposto):"—"}${p.aliquota?`<div class="hint">${pctR(p.aliquota)}</div>`:""}</td>`:""}
               <td class="r num">${brl2(p.valorCorretor)}<div class="hint">${esc(iniciais(nomeUsuario(p.corretor)))}</div></td>
               <td class="r num">${brl2(p.valorCorretora)}</td>`
            : `<td class="r num"><b>${brl2(efetivoVis(p))}</b></td>`}
          <td><span class="chip ${st.cls}">${st.nome}</span>${p.recebidoEm?`<div class="hint num">${dt(p.recebidoEm)}</div>`:""}</td>
          <td class="r" style="white-space:nowrap">
            ${p.status==="recebido"
              ? (podeDesfazer()?`<button class="btn sm ghost" data-act="desconciliar" data-id="${esc(p.contratoId)}" data-n="${p.n}">Desfazer</button>`:`<span class="hint">conciliada</span>`)
              : `<button class="btn sm" data-act="conciliar" data-id="${esc(p.contratoId)}" data-n="${p.n}">Receber</button>`}
            ${podeDesfazer()?`<button class="btn sm ghost" data-act="editarParcela" data-id="${esc(p.contratoId)}" data-n="${p.n}" title="Editar esta parcela" aria-label="Editar parcela">✎</button>
            <button class="btn sm ghost danger" data-act="excluirParcela" data-id="${esc(p.contratoId)}" data-n="${p.n}" title="Excluir esta parcela" aria-label="Excluir parcela">×</button>`:""}
          </td>
        </tr>`;
      }).join("") || `<tr><td colspan="10" class="empty">Nenhuma parcela com esses filtros.</td></tr>`}</tbody>
    </table></div>
    ${psFatia.length < ps.length?`<div class="ta"><button class="btn" data-act="maisComissoes">Mostrar mais ${Math.min(POR_PAGINA_COM, ps.length-psFatia.length)} de ${ps.length.toLocaleString("pt-BR")}</button></div>`:""}
  </div>`;
}

/** Lembretes: o que já venceu (por faixa de atraso) e o que entra em breve. */
function painelLembretes(todas){
  const atrasadas = todas.filter(p=>p.vencida);
  const faixas = [
    { rot:"1 a 30 dias", cls:"warn", ps:atrasadas.filter(p=>diasEntre(p.vence,hoje())<=30) },
    { rot:"31 a 60 dias", cls:"crit", ps:atrasadas.filter(p=>{const d=diasEntre(p.vence,hoje()); return d>30&&d<=60;}) },
    { rot:"mais de 60 dias", cls:"crit", ps:atrasadas.filter(p=>diasEntre(p.vence,hoje())>60) }
  ].filter(f=>f.ps.length);
  const aviso = Math.max(1, Number(S.config.diasAvisoComissao)||7);
  const aReceber = todas.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),aviso))
    .sort((a,b)=>a.vence.localeCompare(b.vence));
  const prox30 = todas.filter(p=>p.status==="previsto" && p.vence>=hoje() && p.vence<=addDays(hoje(),30));
  const maisVelha = atrasadas.slice().sort((a,b)=>a.vence.localeCompare(b.vence))[0];

  if(!atrasadas.length && !prox30.length) return "";
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head">
      <span class="chip ${atrasadas.length?"crit":"ok"}">${atrasadas.length?"Cobrança":"Em dia"}</span>
      <div><h3>Lembretes de comissionamento</h3>
        <div class="sub">${atrasadas.length
          ? `${brl(atrasadas.reduce((a,p)=>a+valorVis(p),0))} vencidos e não conciliados — a mais antiga espera há ${diasEntre(maisVelha.vence,hoje())} dias`
          : "Nada vencido. Abaixo, o que entra nos próximos 30 dias."}</div></div>
      ${atrasadas.length?`<div class="right"><button class="btn sm" data-act="irFiltro" data-view="comissoes" data-f='{"status":"atrasado"}'>Ver só os atrasados</button>
        <button class="btn sm" data-act="tarefasDeCobranca">Criar tarefas de cobrança</button></div>`:""}
    </div>
    <div class="chart-wrap">
      ${faixas.length?`<div class="dl" style="margin-bottom:14px">${faixas.map(f=>`
        <div><div class="k">Atraso de ${esc(f.rot)}</div>
          <div class="v num" style="font-size:19px;font-weight:700;color:var(--${f.cls==="crit"?"crit":"warn"})">${brl(f.ps.reduce((a,p)=>a+valorVis(p),0))}</div>
          <div class="hint">${f.ps.length} parcela${f.ps.length!==1?"s":""} · ${[...new Set(f.ps.map(p=>p.operadora))].filter(Boolean).slice(0,3).join(", ")||"—"}</div></div>`).join("")}</div>`:""}
      ${atrasadas.length?`<div class="tw"><table>
        <thead><tr><th>Venceu</th><th>Atraso</th><th>Cliente</th><th>Operadora</th><th>Tipo</th><th class="r">Valor</th><th></th></tr></thead>
        <tbody>${atrasadas.slice().sort((a,b)=>a.vence.localeCompare(b.vence)).slice(0,8).map(p=>`<tr>
          <td class="num">${dt(p.vence)}</td>
          <td class="num"><span class="chip ${diasEntre(p.vence,hoje())>30?"crit":"warn"}">${diasEntre(p.vence,hoje())}d</span></td>
          <td class="clickable" data-act="abrirContrato" data-id="${esc(p.contratoId)}"><b>${esc(p.cliente)}</b></td>
          <td>${esc(p.operadora||"—")}</td>
          <td><span class="chip ${tipoP(p.tipo).cls}">${tipoP(p.tipo).nome}</span></td>
          <td class="r num"><b>${brl2(valorVis(p))}</b></td>
          <td class="r"><button class="btn sm" data-act="conciliar" data-id="${esc(p.contratoId)}" data-n="${p.n}">Recebi</button></td>
        </tr>`).join("")}</tbody></table>
        ${atrasadas.length>8?`<div class="ta">e mais ${atrasadas.length-8} parcela(s) em atraso.</div>`:""}</div>`:""}
      <div style="border-top:1px solid var(--line);margin-top:${atrasadas.length?"14px":"0"};padding-top:13px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
          <span class="chip ${aReceber.length?"info":"mute"}">A receber</span>
          <b style="font-size:13px">Próximos</b>
          <input type="number" min="1" max="120" value="${aviso}" data-act="diasAviso"
            style="width:64px;padding:3px 7px;font-size:12.5px;text-align:center" aria-label="Dias de antecedência do aviso">
          <b style="font-size:13px">dias</b>
          <span class="hint">${aReceber.length
            ? `${brl(aReceber.reduce((a,p)=>a+valorVis(p),0))} em ${aReceber.length} parcela(s)`
            : "nada vence nesse intervalo"}</span>
        </div>
        ${aReceber.length?`<div class="tw"><table>
          <thead><tr><th>Data prevista</th><th>Em</th><th>Cliente</th><th>Tipo</th><th>Vigência do contrato</th><th class="r">Valor</th><th></th></tr></thead>
          <tbody>${aReceber.slice(0,10).map(p=>{
            const d = diasEntre(hoje(), p.vence);
            const fim = p.contrato.fim;
            return `<tr>
              <td class="num">${dt(p.vence)}</td>
              <td><span class="chip ${d<=2?"warn":"info"}">${d===0?"hoje":`${d}d`}</span></td>
              <td class="clickable" data-act="abrirContrato" data-id="${esc(p.contratoId)}"><b>${esc(p.cliente)}</b>
                <div class="hint">${esc(p.operadora||"")}</div></td>
              <td><span class="chip ${tipoP(p.tipo).cls}">${tipoP(p.tipo).nome}</span></td>
              <td class="num">${dt(p.contrato.inicio)} — ${fim?dt(fim):"—"}
                ${fim && diasEntre(hoje(),fim)<=60 && diasEntre(hoje(),fim)>=0 ? `<div class="hint" style="color:var(--warn)">vence em ${diasEntre(hoje(),fim)}d</div>`:""}</td>
              <td class="r num"><b>${brl2(valorVis(p))}</b></td>
              <td class="r"><button class="btn sm" data-act="conciliar" data-id="${esc(p.contratoId)}" data-n="${p.n}">Recebi</button></td>
            </tr>`;
          }).join("")}</tbody></table>
          ${aReceber.length>10?`<div class="ta">e mais ${aReceber.length-10} parcela(s) no intervalo.</div>`:""}</div>`:""}
        ${prox30.length?`<div class="ta" style="padding-top:10px">Em 30 dias: ${brl(prox30.reduce((a,p)=>a+valorVis(p),0))} em ${prox30.length} parcela(s), a primeira em ${dt(prox30.slice().sort((a,b)=>a.vence.localeCompare(b.vence))[0].vence)}.</div>`:""}
      </div>
    </div></section>`;
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

/* ============================================================
   PREVISÃO DE COMISSÕES
   Da camada mais certa para a menos certa:
   1. Contratado — parcelas que já estão no cronograma dos contratos
      (cresce sozinho conforme os contratos são lançados);
   2. Novas vendas — ou pelo funil (leads abertos, ponderados pela etapa),
      ou pelo ritmo: se a corretora continuar vendendo como nos últimos
      6 meses, quanto dessas vendas cai em cada mês, pela curva real de
      pagamento dos contratos da carteira.
   Funil e ritmo são duas estimativas da MESMA coisa (as vendas futuras):
   por isso nunca se somam.
   ============================================================ */
const difMeses = (a, b) => (Number(b.slice(0,4))-Number(a.slice(0,4)))*12 + (Number(b.slice(5,7))-Number(a.slice(5,7)));
function previsaoComissoes(o){
  o = o || {};
  const N = o.meses || 12;
  const meses = proximosMeses(N);
  const idx = new Map(meses.map((m,i)=>[m,i]));
  const passa = x => (!o.pilar || x.pilar===o.pilar) && (!o.corretor || x.corretor===o.corretor);
  const vis = p => veCorretora() ? p.valor : fatia(p.valor, p);
  const todas = parcelas().filter(p=>noEscopo(p,"corretor") && passa(p));
  const linhas = meses.map(m=>({ mes:m, real:0, firme:0, funil:0, ritmo:0, imposto:0, parcelas:0,
    porPilar:{ saude:0, seguros:0, consorcios:0 } }));
  let atrasado = 0, nAtrasado = 0;
  const mAtual = meses[0];
  for(const p of todas){
    if(p.status==="recebido"){
      if((p.recebidoEm||p.vence).slice(0,7)===mAtual) linhas[0].real += efetivoVis(p);
      continue;
    }
    if(p.status!=="previsto") continue;               // glosada não entra
    if(p.vencida){ atrasado += vis(p); nAtrasado++; continue; }   // atraso fica à parte
    const i = idx.get(p.mes); if(i==null) continue;
    const v = vis(p);
    linhas[i].firme += v; linhas[i].parcelas++;
    linhas[i].porPilar[p.pilar] = (linhas[i].porPilar[p.pilar]||0) + v;
    if(veCorretora()) linhas[i].imposto += v*(p.aliquota||0)/100;
  }
  // funil
  const leads = S.leads.filter(l=>!["ganho","perdido"].includes(l.etapa) && noEscopo(l)
    && (!o.pilar || l.pilar===o.pilar) && (!o.corretor || (l.responsavel||"")===o.corretor));
  for(const l of leads){
    const E = estimativaLead(l);
    for(const x of (E.linhas||[])){
      const i = idx.get(String(x.vence||"").slice(0,7));
      if(i!=null) linhas[i].funil += (Number(x.valor)||0)*E.prob;
    }
  }
  // ritmo
  const hist = ultimosMeses(7).slice(0,6);            // os 6 meses fechados antes do atual
  const desde = addMonths(mAtual+"-01", -24).slice(0,7);
  const porK = new Array(37).fill(0); let somaCurva = 0;
  const gerado = {}; hist.forEach(m=>gerado[m]=0);
  let nHist = 0;
  for(const c of S.contratos){
    if(c.status==="cancelado" || !c.inicio || !noEscopo(c,"corretor") || !passa(c)) continue;
    const m0 = c.inicio.slice(0,7);
    if(m0 < desde || m0 > mAtual) continue;
    let tot = 0;
    for(const p of (c.comissoes||[])){
      const v = (Number(p.valor)||0) * (veCorretora() ? 1 : fatorCorretor(p,c));
      const k = difMeses(m0, String(p.vence||"").slice(0,7));
      if(k>=0 && k<=36){ porK[k] += v; somaCurva += v; }
      tot += v;
    }
    if(m0 in gerado){ gerado[m0] += tot; nHist++; }
  }
  const curva = somaCurva ? porK.map(v=>v/somaCurva) : [];
  const mensal = hist.reduce((a,m)=>a+gerado[m],0)/hist.length;
  if(mensal>0 && curva.length){
    for(let i=0;i<N;i++){
      let v = 0;
      for(let s=1; s<=i; s++) v += mensal*(curva[i-s]||0);   // vendas a partir do mês que vem
      linhas[i].ritmo = v;
    }
  }
  const realizado = hist.map(m=>({ mes:m, valor: todas.filter(p=>p.status==="recebido" && (p.recebidoEm||p.vence).slice(0,7)===m)
    .reduce((a,p)=>a+efetivoVis(p),0) }));
  const aliqPadrao = Number(S.config.impostoPadrao)||0;
  return { meses, linhas, atrasado, nAtrasado, realizado, leads:leads.length, aliqPadrao,
    ritmo:{ mensal, contratosMes: nHist/hist.length, meses: hist.length, temHistorico: mensal>0 } };
}
/** Modo das novas vendas na previsão: "ritmo", "funil" ou "nenhum". */
function modoPrevisao(P){
  const m = S.prevModo;
  if(m==="ritmo" || m==="funil" || m==="nenhum") return m;
  return P && P.ritmo.temHistorico ? "ritmo" : "funil";
}
const NOME_MODO = { ritmo:"Ritmo de vendas", funil:"Funil ponderado", nenhum:"Só o contratado" };

/** Coluna com o topo arredondado (4px) e a base reta — a especificação das colunas. */
function colunaTopo(x, y, w, h, r){
  r = Math.min(r, h, w/2);
  return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`;
}
function chartPrevisao(P, modo){
  const W = 760, H = 262, pad = { t:26, r:10, b:34, l:54 };
  const hist = P.realizado, fut = P.linhas;
  const nova = l => modo==="nenhum" ? 0 : (modo==="funil" ? l.funil : l.ritmo);
  const colunas = hist.map(h=>({ mes:h.mes, passado:true, segs:[{k:"real", v:h.valor}] }))
    .concat(fut.map(l=>({ mes:l.mes, passado:false, segs:[{k:"real",v:l.real},{k:"firme",v:l.firme},{k:"nova",v:nova(l)}] })));
  colunas.forEach(c=>c.total = c.segs.reduce((a,s)=>a+(s.v||0),0));
  const { topo, passos } = passosEixo(Math.max(...colunas.map(c=>c.total), 1), 4);
  const ph = H-pad.t-pad.b, passo = (W-pad.l-pad.r)/colunas.length;
  const bw = Math.min(24, passo*0.62);
  const escY = v => ph*(v/topo);
  const COR = { real:"var(--prev-real)", firme:"var(--prev-firme)", nova:"var(--prev-nova)" };
  let g = "";
  passos.forEach(v=>{
    const y = (pad.t+ph-escY(v)).toFixed(1);
    g += `<line class="grid-l" x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}"/>
      <text class="val" x="${pad.l-8}" y="${(+y+3.5).toFixed(1)}" text-anchor="end">${compacto(v)}</text>`;
  });
  const xDiv = pad.l + passo*hist.length;
  g += `<line x1="${xDiv.toFixed(1)}" y1="${pad.t-14}" x2="${xDiv.toFixed(1)}" y2="${pad.t+ph}" style="stroke:var(--line-strong);stroke-width:1"/>
    <text class="lbl" x="${(xDiv-8).toFixed(1)}" y="${pad.t-16}" text-anchor="end" style="font-weight:600;letter-spacing:.06em">RECEBIDO</text>
    <text class="lbl" x="${(xDiv+8).toFixed(1)}" y="${pad.t-16}" style="font-weight:600;letter-spacing:.06em">PREVISTO</text>`;
  const maxFut = Math.max(...colunas.filter(c=>!c.passado).map(c=>c.total));
  const rotular = new Set();
  colunas.forEach((c,i)=>{ if(!c.passado && c.total>0 && (i===hist.length || i===colunas.length-1 || c.total===maxFut)) rotular.add(i); });
  colunas.forEach((c,i)=>{
    const x = pad.l + passo*i + (passo-bw)/2;
    let y = pad.t + ph;
    const vivos = c.segs.filter(s=>s.v>0);
    vivos.forEach((s,k)=>{
      const h = escY(s.v); y -= h;
      const ultimo = k===vivos.length-1;
      const alt = Math.max(h - (k>0 ? 2 : 0), 0.8);     // 2px de respiro entre as camadas
      const d = ultimo ? colunaTopo(x, y, bw, alt, 4) : `M${x},${y+alt}V${y}H${x+bw}V${y+alt}Z`;
      g += `<path class="mark" d="${d}" style="fill:${COR[s.k]}"/>`;
    });
    if(rotular.has(i)) g += `<text class="val" x="${(x+bw/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle">${compacto(c.total)}</text>`;
    g += `<text class="lbl" x="${(x+bw/2).toFixed(1)}" y="${H-pad.b+15}" text-anchor="middle"${c.mes===mesAtual()?' style="font-weight:700;fill:var(--ink)"':""}>${mesLabel(c.mes)}</text>`;
    g += `<rect class="prev-alvo" x="${(pad.l+passo*i).toFixed(1)}" y="${pad.t-4}" width="${passo.toFixed(1)}" height="${ph+4}" tabindex="0"
      data-prev-i="${i}" role="img" aria-label="${esc(mesLabel(c.mes))}: ${esc(brl(c.total))}"/>`;
  });
  g += `<line class="grid-l" x1="${pad.l}" y1="${pad.t+ph}" x2="${W-pad.r}" y2="${pad.t+ph}" style="stroke:var(--line-strong)"/>`;
  PREV_TIP = colunas.map(c=>({ mes:c.mes, passado:c.passado, total:c.total, segs:c.segs }));
  return `<div class="prev-rolagem"><div class="prev-caixa">
    <svg class="chart prev" viewBox="0 0 ${W} ${H}" role="group" aria-label="Comissões recebidas nos últimos 6 meses e previstas para os próximos 12">${g}</svg>
    <div class="prev-tip" id="prevTip" hidden></div></div></div>`;
}
let PREV_TIP = [], PREV_MODO = "ritmo";
const ROTULO_SEG = () => ({ real:"Recebido", firme:"Contratado", nova: NOME_MODO[PREV_MODO] });
function mostrarTipPrevisao(alvo){
  const tip = document.getElementById("prevTip"); if(!tip || !alvo) return;
  const c = PREV_TIP[Number(alvo.dataset.prevI)]; if(!c) return;
  tip.replaceChildren();
  const cab = document.createElement("div"); cab.className = "pt-mes";
  cab.textContent = mesLabel(c.mes) + (c.passado ? " · recebido" : c.mes===mesAtual() ? " · mês atual" : " · previsão");
  const tot = document.createElement("div"); tot.className = "pt-tot"; tot.textContent = brl(c.total);
  tip.append(cab, tot);
  const rot = ROTULO_SEG();
  const COR = { real:"var(--prev-real)", firme:"var(--prev-firme)", nova:"var(--prev-nova)" };
  const modo = PREV_MODO;
  c.segs.filter(s=> c.passado ? s.k==="real" : (s.k==="real" ? s.v>0 : s.k==="firme" || modo!=="nenhum")).forEach(s=>{
    const l = document.createElement("div"); l.className = "pt-lin";
    const k = document.createElement("i"); k.style.background = COR[s.k];
    const v = document.createElement("b"); v.textContent = brl(s.v);
    const n = document.createElement("span"); n.textContent = rot[s.k];
    l.append(k, v, n); tip.append(l);
  });
  tip.hidden = false;
  // ao lado da coluna, dentro da área do gráfico — nunca cortado pela rolagem
  const caixa = tip.parentElement, rc = caixa.getBoundingClientRect(), ra = alvo.getBoundingClientRect();
  const dir = ra.right - rc.left + 8, esq = ra.left - rc.left - tip.offsetWidth - 8;
  tip.style.left = (dir + tip.offsetWidth <= rc.width - 4 ? dir : Math.max(4, esq)) + "px";
  tip.style.top = "28px";
}
document.addEventListener("pointerover", e=>{ const a = e.target.closest && e.target.closest("[data-prev-i]"); if(a) mostrarTipPrevisao(a); });
document.addEventListener("focusin", e=>{ const a = e.target.closest && e.target.closest("[data-prev-i]"); if(a) mostrarTipPrevisao(a); });
document.addEventListener("pointerout", e=>{ const a = e.target.closest && e.target.closest("[data-prev-i]");
  if(a && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-prev-i]"))){ const t = document.getElementById("prevTip"); if(t) t.hidden = true; } });

/** O painel que substitui a antiga "Projeção de recebimento". */
function painelPrevisao(){
  const f = S.filtros;
  const P = previsaoComissoes({ pilar:f.pilar||"", corretor:f.corretor||"" });
  const modo = modoPrevisao(P); PREV_MODO = modo;
  const nova = l => modo==="nenhum" ? 0 : (modo==="funil" ? l.funil : l.ritmo);
  const tot = l => l.real + l.firme + nova(l);
  const soma = (n, fn) => P.linhas.slice(0,n).reduce((a,l)=>a+fn(l),0);
  const t3 = soma(3, tot), t12 = soma(12, tot), firme12 = soma(12, l=>l.real+l.firme);
  const pctFirme = t12 ? firme12/t12*100 : 0;
  const imp12 = veCorretora() ? soma(12, l=>l.imposto + nova(l)*P.aliqPadrao/100) : 0;
  const rec6 = P.realizado.reduce((a,r)=>a+r.valor,0)/6;
  const filtro = [f.pilar?PILARES[f.pilar].curto:"", f.corretor?nomeUsuario(f.corretor):""].filter(Boolean).join(" · ");
  const explica = modo==="ritmo"
    ? (P.ritmo.temHistorico
        ? `Ritmo: nos últimos 6 meses entraram em média ${P.ritmo.contratosMes.toLocaleString("pt-BR",{maximumFractionDigits:1})} contrato(s) por mês, gerando ${brl(P.ritmo.mensal)} de comissão cada mês. A previsão supõe que esse ritmo continue e distribui cada venda nova pela curva real de pagamento da carteira.`
        : "Ainda não há 6 meses de vendas para medir o ritmo — use o funil por enquanto.")
    : modo==="funil"
      ? `Funil: ${P.leads} lead(s) aberto(s), cada um pela régua prevista e pela chance da etapa em que está.`
      : "Só o que já está no cronograma dos contratos lançados.";
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h3>Previsão de comissões</h3>
      <div class="sub">Recebido nos últimos 6 meses e previsto para os próximos 12${filtro?` · ${esc(filtro)}`:""}${veCorretora()?"":" · sua parte"}</div></div>
      <div class="right">
        <div class="seg" role="group" aria-label="Como estimar as vendas novas">
          ${["ritmo","funil","nenhum"].map(k=>`<button type="button" data-act="prevModo" data-v="${k}" aria-pressed="${modo===k}">${k==="ritmo"?"Ritmo de vendas":k==="funil"?"Funil":"Só contratado"}</button>`).join("")}
        </div>
        <button class="btn sm ghost" data-act="baixarRel" data-tipo="previsao">Baixar</button>
      </div></div>
    <div class="prev-kpis">
      <div><div class="k">Próximos 3 meses</div><div class="v">${brl(t3)}</div><div class="d">${brl(t3/3)} por mês</div></div>
      <div><div class="k">Próximos 12 meses</div><div class="v">${brl(t12)}</div><div class="d">${rec6?`${t12/12>=rec6?"+":""}${pct((t12/12-rec6)/rec6*100)} sobre a média recebida`:"sem histórico recebido"}</div></div>
      <div><div class="k">Já contratado</div><div class="v">${pct(pctFirme)}</div><div class="d">${brl(firme12)} com parcela lançada</div></div>
      <div><div class="k">Em atraso</div><div class="v"${P.atrasado?' style="color:var(--crit)"':""}>${brl(P.atrasado)}</div><div class="d">${P.nAtrasado} parcela(s) — fora do gráfico</div></div>
      ${veCorretora() && imp12>0 ? `<div><div class="k">Líquido de impostos</div><div class="v">${brl(t12-imp12)}</div><div class="d">${brl(imp12)} de imposto em 12 meses</div></div>` : ""}
    </div>
    <div class="chart-wrap" style="padding-top:4px">${chartPrevisao(P, modo)}</div>
    <div class="legend">
      <span><i class="dot sq" style="background:var(--prev-real)"></i>Recebido</span>
      <span><i class="dot sq" style="background:var(--prev-firme)"></i>Contratado — parcelas lançadas</span>
      ${modo!=="nenhum"?`<span><i class="dot sq" style="background:var(--prev-nova)"></i>${esc(NOME_MODO[modo])} — estimativa</span>`:""}
    </div>
    <div class="hint" style="padding:0 16px 12px">${esc(explica)}</div>
    ${tabelaOculta(["Mês","Recebido","Contratado","Funil ponderado","Ritmo de vendas","Previsão"],
      P.realizado.map(r=>[mesLabel(r.mes), brl(r.valor), "—", "—", "—", brl(r.valor)])
        .concat(P.linhas.map(l=>[mesLabel(l.mes), brl(l.real), brl(l.firme), brl(l.funil), brl(l.ritmo), brl(tot(l))])))}
  </section>`;
}

/* ============================================================
   RENOVAÇÕES
   ============================================================ */
/* ============================================================
   CROSS-SELL E VALOR DA CARTEIRA
   ============================================================ */
/** Pilares que o cliente já tem, e os que faltam. */
function pilaresDoCliente(clienteId){
  const tem = new Set();
  contratosDoCliente(clienteId).forEach(c=>{ if(c.status!=="cancelado") tem.add(c.pilar); });
  return { tem:[...tem], falta: PK.filter(p=>!tem.has(p)) };
}
/** Clientes com espaço para mais um produto, do mais valioso para o menos. */
function oportunidadesCrossSell(limite){
  const out = [];
  for(const c of S.clientes){
    if(!noEscopo(c)) continue;
    if(["encerrado","inativo"].includes(c.status)) continue;
    const { tem, falta } = pilaresDoCliente(c.id);
    if(!tem.length || !falta.length) continue;
    out.push({ cliente:c, tem, falta, valor: receitaCliente(c) });
  }
  out.sort((a,b)=>b.valor-a.valor || b.tem.length-a.tem.length);
  return limite ? out.slice(0, limite) : out;
}
/** Os números que a diretoria procura primeiro ao abrir o sistema. */
function painelExecutivo(ativos, vidasTotal){
  const clientesAtivos = new Set(ativos.map(c=>c.clienteId)).size;
  const vs = vidasNoEscopo();
  const detalhadas = vidasAtivas(vs).length;
  const porPilarVidas = {};
  PK.forEach(p=>porPilarVidas[p]=0);
  ativos.forEach(c=>{ if(contratoTemVida(c)) porPilarVidas[c.pilar] = (porPilarVidas[c.pilar]||0) + totalVidas(c); });
  const cotas = ativos.filter(c=>c.pilar==="consorcios").length;
  const contempladas = ativos.filter(c=>c.pilar==="consorcios" && c.contemplado).length;
  // conta pela data do cancelamento; contratos antigos, sem essa data, caem na última alteração
  const cancelados12 = S.contratos.filter(c=>noEscopo(c,"corretor") && c.status==="cancelado"
    && (c.canceladoEm || (c.atualizadoEm||"").slice(0,10)) >= addDays(hoje(),-365)).length;
  const base = ativos.length + cancelados12;
  const retencao = base ? (ativos.length/base*100) : 100;
  const multi = S.clientes.filter(c=>noEscopo(c) && pilaresDoCliente(c.id).tem.length>1).length;

  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip ok">Visão executiva</span>
      <div><h3>A Erbe hoje</h3><div class="sub">Os números da empresa inteira, num lugar só</div></div></div>
    <div class="chart-wrap"><div class="dl" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="clickable" data-act="ir" data-view="clientes">
        <div class="k">Clientes ativos</div>
        <div class="v num" style="font-size:22px;font-weight:700">${clientesAtivos.toLocaleString("pt-BR")}</div>
        <div class="hint">${multi} com mais de um produto</div></div>
      <div class="clickable" data-act="ir" data-view="vidas">
        <div class="k">Vidas</div>
        <div class="v num" style="font-size:22px;font-weight:700">${vidasTotal.toLocaleString("pt-BR")}</div>
        <div class="hint">${detalhadas} com nome${vidasTotal>detalhadas?` · ${vidasTotal-detalhadas} a detalhar`:""}</div></div>
      ${PK.filter(p=>PILAR_TEM_VIDA[p]).map(p=>`
        <div><div class="k">Vidas em ${esc(PILARES[p].curto)}</div>
          <div class="v num" style="font-size:22px;font-weight:700;color:${PILARES[p].cor}">${(porPilarVidas[p]||0).toLocaleString("pt-BR")}</div>
          <div class="hint">${ativos.filter(c=>c.pilar===p).length} contrato(s)</div></div>`).join("")}
      <div><div class="k">Cotas de consórcio</div>
        <div class="v num" style="font-size:22px;font-weight:700;color:var(--c-consorcios)">${cotas.toLocaleString("pt-BR")}</div>
        <div class="hint">${contempladas} contemplada(s)</div></div>
      <div><div class="k">Retenção 12 meses</div>
        <div class="v num" style="font-size:22px;font-weight:700;color:${retencao>=90?"var(--ok)":retencao>=75?"var(--warn)":"var(--crit)"}">${pct(retencao)}</div>
        <div class="hint">${cancelados12} cancelamento(s) no período</div></div>
    </div></div>
  </section>`;
}

function painelCrossSell(){
  const ops = oportunidadesCrossSell();
  if(!ops.length) return "";
  const porFalta = {};
  PK.forEach(p=>porFalta[p]=0);
  ops.forEach(o=>o.falta.forEach(p=>porFalta[p]++));
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip info">Oportunidade</span>
      <div><h3>${ops.length.toLocaleString("pt-BR")} cliente${ops.length!==1?"s":""} com espaço para outro produto</h3>
        <div class="sub">${PK.filter(p=>porFalta[p]).map(p=>`${porFalta[p]} sem ${PILARES[p].curto}`).join(" · ")}</div></div></div>
    <div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Já tem</th><th>Falta</th><th class="r com">${veCorretora()?"Comissão gerada":"Sua comissão"}</th><th></th></tr></thead>
      <tbody>${ops.slice(0,12).map(o=>`<tr>
        <td class="clickable" data-act="abrirCliente" data-id="${esc(o.cliente.id)}"><b>${esc(o.cliente.nome)}</b>
          ${o.cliente.telefone?`<div class="hint">${esc(o.cliente.telefone)}</div>`:""}</td>
        <td>${o.tem.map(p=>`<span class="chip ${p}">${esc(PILARES[p].curto)}</span>`).join(" ")}</td>
        <td>${o.falta.map(p=>`<span class="chip mute">${esc(PILARES[p].curto)}</span>`).join(" ")}</td>
        <td class="r num com">${brl(o.valor)}</td>
        <td class="r"><button class="btn sm" data-act="tarefaCrossSell" data-id="${esc(o.cliente.id)}" data-p="${esc(o.falta[0])}">Agendar contato</button></td>
      </tr>`).join("")}</tbody></table></div>
    ${ops.length>12?`<div class="ta">e mais ${ops.length-12} cliente(s) — os de maior comissão vêm primeiro.</div>`:""}
  </section>`;
}

/** Saúde reajusta uma vez por ano, no mês de aniversário do contrato. Avisar antes
    é o que separa "o corretor me preparou" de "o boleto veio mais caro". */
function painelReajustes(){
  const rs = reajustesChegando(60);
  const semMes = S.contratos.filter(c=>c.pilar==="saude" && ["ativo","implantado"].includes(c.status)
    && !c.mesReajuste && noEscopo(c,"corretor")).length;
  if(!rs.length && !semMes) return "";
  return `<section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><span class="chip ${rs.length?"warn":"mute"}">Reajuste anual</span>
      <div><h3>${rs.length} contrato${rs.length!==1?"s":""} de saúde reajusta${rs.length!==1?"m":""} em até 60 dias</h3>
        <div class="sub">${semMes?`${semMes} contrato(s) de saúde sem mês de reajuste preenchido`:"Todos os contratos de saúde têm mês de reajuste"}</div></div></div>
    ${rs.length?`<div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Operadora</th><th>Mês</th><th class="r">Último reajuste</th><th class="r">Vidas</th><th class="r">Base</th><th></th></tr></thead>
      <tbody>${rs.map(x=>`<tr>
        <td class="clickable" data-act="abrirContrato" data-id="${esc(x.c.id)}"><b>${esc(x.c.clienteNome)}</b></td>
        <td>${esc(x.c.operadora||"—")}</td>
        <td>${esc(MESES[Number(x.c.mesReajuste)-1])} <span class="chip ${x.dias<=30?"crit":"warn"}">${x.dias===0?"este mês":`em ${x.dias}d`}</span></td>
        <td class="r num">${x.c.ultimoReajuste!=null&&x.c.ultimoReajuste!==""?pctR(x.c.ultimoReajuste):"—"}</td>
        <td class="r num">${totalVidas(x.c)||"—"}</td>
        <td class="r num">${brl(x.c.valorBase)}</td>
        <td class="r"><button class="btn sm" data-act="avisarReajuste" data-id="${esc(x.c.id)}">Preparar cliente</button></td>
      </tr>`).join("")}</tbody></table></div>`:""}
  </section>`;
}

function viewRenovacoes(){
  const ativos = S.contratos.filter(c=>noEscopo(c,"corretor") && ["ativo","implantado"].includes(c.status) && c.fim);
  // A escada que o briefing pede: 7, 15, 30, 60 e 90 dias antes.
  const faixas = [
    { rot:"Vencidos", cls:"crit", teste:c=>c.fim<hoje() },
    { rot:"Vence em 7 dias", cls:"crit", teste:c=>c.fim>=hoje() && c.fim<=addDays(hoje(),7) },
    { rot:"8 a 15 dias", cls:"crit", teste:c=>c.fim>addDays(hoje(),7) && c.fim<=addDays(hoje(),15) },
    { rot:"16 a 30 dias", cls:"warn", teste:c=>c.fim>addDays(hoje(),15) && c.fim<=addDays(hoje(),30) },
    { rot:"31 a 60 dias", cls:"warn", teste:c=>c.fim>addDays(hoje(),30) && c.fim<=addDays(hoje(),60) },
    { rot:"61 a 90 dias", cls:"info", teste:c=>c.fim>addDays(hoje(),60) && c.fim<=addDays(hoje(),90) }
  ];
  const reaj = painelReajustes();
  if(!ativos.length && !reaj) return vazio("Nada a renovar","Contratos com data de fim preenchida entram nesta esteira 90 dias antes do vencimento.","novoContrato","Registrar contrato");
  return reaj + faixas.map(f=>{
    const cs = ativos.filter(f.teste).sort((a,b)=>a.fim.localeCompare(b.fim));
    if(!cs.length) return "";
    const total = cs.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
    return `<section class="panel" style="margin-bottom:14px">
      <div class="panel-head"><span class="chip ${f.cls}">${esc(f.rot)}</span>
        <div><h3>${cs.length} contrato${cs.length!==1?"s":""}</h3><div class="sub">${brl(total)} de base contratada em risco</div></div></div>
      <div class="tw"><table>
        <thead><tr><th>Cliente</th><th>Produto</th><th class="r">Base atual</th><th class="r">Com reajuste 12%</th><th>Fim da vigência</th><th></th></tr></thead>
        <tbody>${cs.map(c=>`<tr class="clickable" data-act="abrirContrato" data-id="${esc(c.id)}">
          <td><b>${esc(c.clienteNome)}</b></td>
          <td><span class="chip ${esc(c.pilar)}">${esc(PILARES[c.pilar].curto)}</span> <span class="hint">${esc(c.operadora||"")}</span></td>
          <td class="r num">${brl(c.valorBase)}</td>
          <td class="r num">${brl(Number(c.valorBase)*1.12)}</td>
          <td class="num">${dt(c.fim)} <span class="hint">(${diasEntre(hoje(),c.fim)}d)</span></td>
          <td class="r"><button class="btn sm" data-act="renovar" data-id="${esc(c.id)}">Renovar</button></td>
        </tr>`).join("")}</tbody>
      </table></div></section>`;
  }).join("") || vazio("Nenhuma renovação nos próximos 90 dias","A esteira volta a preencher conforme os contratos se aproximam do vencimento.","novoContrato","Registrar contrato");
}

/* ============================================================
   AGENDA
   ============================================================ */
function viewTarefas(){
  const ts = S.tarefas.filter(t=>noEscopo(t)).sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
  const abertas = ts.filter(t=>t.status!=="feita");
  const feitas = ts.filter(t=>t.status==="feita").slice(-25).reverse();
  if(!ts.length) return vazio("Agenda vazia","Cada follow-up combinado com um lead ou cliente pode virar uma tarefa com data.","novaTarefa","Criar tarefa");
  const grupos = [
    { rot:"Atrasadas", cls:"crit", ts:abertas.filter(t=>t.vence<hoje()) },
    { rot:"Hoje", cls:"warn", ts:abertas.filter(t=>t.vence===hoje()) },
    { rot:"Próximos 7 dias", cls:"info", ts:abertas.filter(t=>t.vence>hoje() && t.vence<=addDays(hoje(),7)) },
    { rot:"Depois", cls:"mute", ts:abertas.filter(t=>t.vence>addDays(hoje(),7)) }
  ];
  return grupos.filter(g=>g.ts.length).map(g=>`
    <section class="panel" style="margin-bottom:14px">
      <div class="panel-head"><span class="chip ${g.cls}">${esc(g.rot)}</span><div><h3>${g.ts.length} tarefa${g.ts.length!==1?"s":""}</h3></div></div>
      <div class="tw"><table><tbody>${g.ts.map(t=>`<tr>
        <td style="width:34px"><button class="btn sm ghost" data-act="concluirTarefa" data-id="${esc(t.id)}" title="Concluir" aria-label="Concluir tarefa">○</button></td>
        <td><b>${esc(t.titulo)}</b>${t.refNome?`<div class="hint">${esc(t.refNome)}</div>`:""}${t.adiada?`<div class="hint">adiada ${t.adiada}x</div>`:""}</td>
        <td><span class="chip mute">${esc(t.tipo||"Follow-up")}</span></td>
        <td class="num">${dt(t.vence)}</td>
        <td>${esc(nomeUsuario(t.responsavel))}</td>
        <td class="r" style="white-space:nowrap">
          <button class="btn sm" data-act="adiarTarefa" data-id="${esc(t.id)}">Adiar</button>
          <button class="btn sm ghost" data-act="editarTarefa" data-id="${esc(t.id)}" title="Editar tarefa" aria-label="Editar tarefa">✎</button>
          <button class="btn sm ghost danger" data-act="excluirTarefa" data-id="${esc(t.id)}" title="Excluir tarefa" aria-label="Excluir tarefa">×</button></td>
      </tr>`).join("")}</tbody></table></div>
    </section>`).join("") + (feitas.length?`
    <section class="panel"><div class="panel-head"><div><h3>Concluídas</h3><div class="sub">Últimas ${feitas.length}</div></div></div>
      <div class="tw"><table><tbody>${feitas.map(t=>`<tr>
        <td style="width:34px;color:var(--ok)">●</td>
        <td style="color:var(--ink-3);text-decoration:line-through">${esc(t.titulo)}</td>
        <td class="num" style="color:var(--ink-3)">${dt(t.vence)}</td>
        <td class="r"><button class="btn sm ghost" data-act="reabrirTarefa" data-id="${esc(t.id)}">Reabrir</button></td>
      </tr>`).join("")}</tbody></table></div></section>`:"");
}

/* ============================================================
   DESPESAS E BALANÇO
   ============================================================ */
const mesDespesas = () => S.mesDespesas || mesAtual();
/** Comissão efetivamente recebida no mês, pela data do crédito. */
function receitaDoMes(m){
  return parcelas().filter(p=>p.status==="recebido" && (p.recebidoEm||p.vence).slice(0,7)===m)
                   .reduce((a,p)=>a+p.efetivo,0);
}
const despesasDoMes = m => S.despesas.filter(d=>(d.data||"").slice(0,7)===m);
/** Imposto sobre as comissões que entraram no mês. */
function impostoDoMes(m){
  return parcelas().filter(p=>p.status==="recebido" && (p.recebidoEm||p.vence).slice(0,7)===m)
                   .reduce((a,p)=>a+(p.imposto||0),0);
}

/* ============================================================
   TELA DE VIDAS
   ============================================================ */
/** As vidas de um contrato, dentro da ficha dele. */
function painelVidasContrato(c){
  const vs = vidasDoContrato(c.id).slice().sort((a,b)=>
    ((a.tipo||"titular")==="titular"?0:1)-((b.tipo||"titular")==="titular"?0:1) || (a.nome||"").localeCompare(b.nome||"","pt-BR"));
  const ativas = vidasAtivas(vs).length;
  const declarado = Number(c.vidas)||0;
  const divergente = vs.length && declarado && ativas !== declarado;
  return `<div class="panel" style="box-shadow:none;margin-bottom:12px">
    <div class="panel-head"><span class="chip ${vs.length?"ok":"warn"}">${vs.length?ativas+" ativa(s)":"a detalhar"}</span>
      <div><h3>Vidas</h3>
        <div class="sub">${vs.length
          ? `${vs.length} registro(s) neste contrato`
          : `O contrato declara ${declarado} vida(s), ainda sem nome`}</div></div>
      <div class="right">
        ${vs.length?`<button class="btn sm" data-act="novaVida" data-contrato="${esc(c.id)}">+ Vida</button>`
                   :`<button class="btn sm primary" data-act="detalharVidas" data-id="${esc(c.id)}">Detalhar</button>`}</div></div>
    ${divergente?`<div class="hint" style="padding:9px 16px 0;color:var(--warn)">O contrato diz ${declarado} vida(s) e há ${ativas} ativa(s) cadastrada(s). Os painéis usam o que está cadastrado.</div>`:""}
    ${vs.length?`<div class="tw"><table>
      <thead><tr><th>Nome</th><th>Tipo</th><th class="num">Entrada</th><th class="num">Saída</th><th>Situação</th><th></th></tr></thead>
      <tbody>${vs.map(v=>`<tr>
        <td><b>${esc(v.nome)}</b>${v.doc?`<div class="hint num">${esc(mascararDoc(v.doc))}</div>`:""}</td>
        <td><span class="chip ${(v.tipo||"titular")==="titular"?"info":"mute"}">${esc(TIPO_VIDA[v.tipo||"titular"])}</span>${v.parentesco?` <span class="hint">${esc(v.parentesco)}</span>`:""}</td>
        <td class="num">${v.entrada?dt(v.entrada):"—"}</td>
        <td class="num">${v.saida?dt(v.saida):"—"}</td>
        <td><span class="chip ${SV(v.status).cls}">${esc(SV(v.status).nome)}</span></td>
        <td class="r" style="white-space:nowrap">
          <button class="btn sm ghost" data-act="editarVida" data-id="${esc(v.id)}" aria-label="Editar vida">✎</button>
          ${SV(v.status).conta?`<button class="btn sm ghost danger" data-act="excluirVidaDoPlano" data-id="${esc(v.id)}" title="Excluir do plano">−</button>`:""}
        </td></tr>`).join("")}</tbody></table></div>`:""}
  </div>`;
}

/* ============================================================
   COTAS DE CONSÓRCIO
   Consórcio não tem vida: tem cota. A aba passa a mostrar as duas
   carteiras — quem está coberto e o que está sendo construído.
   ============================================================ */
const cotasNoEscopo = () => S.contratos.filter(c=>c.pilar==="consorcios" && noEscopo(c,"corretor"));
function viewVidas(){
  const aba = S.abaVidas==="cotas" ? "cotas" : "vidas";
  const vAtivas = vidasAtivas(vidasNoEscopo()).length;
  const cAtivas = cotasNoEscopo().filter(c=>c.status!=="cancelado");
  const credito = cAtivas.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const topo = `<div class="filters" style="align-items:flex-end">
    <div class="field" style="flex:none"><label>Carteira</label>
      <div class="seg" role="group" aria-label="Vidas ou cotas">
        <button data-act="abaVidas" data-v="vidas" aria-pressed="${aba==="vidas"}">Vidas · ${vAtivas.toLocaleString("pt-BR")}</button>
        <button data-act="abaVidas" data-v="cotas" aria-pressed="${aba==="cotas"}">Cotas de consórcio · ${cAtivas.length.toLocaleString("pt-BR")}</button>
      </div></div>
    <div class="hint" style="padding-bottom:8px">${aba==="vidas"
      ? `${cAtivas.length.toLocaleString("pt-BR")} cota(s) ativa(s) somando ${brl(credito)} em crédito`
      : `${vAtivas.toLocaleString("pt-BR")} vida(s) ativa(s) em saúde e proteção`}</div>
    <button class="btn" style="margin-left:auto" data-act="baixarRel" data-tipo="vidas" data-conteudo="${aba==="cotas"?"cotas":"ambos"}">Baixar carteira (Excel ou PDF)</button>
  </div>`;
  return topo + (aba==="cotas" ? viewCotas() : viewVidasPessoas());
}
function viewCotas(){
  const f = S.filtros;
  const todas = cotasNoEscopo();
  if(!todas.length) return vazio("Nenhuma cota de consórcio",
    "As cotas aparecem aqui quando um contrato do pilar Patrimônio é registrado, com grupo, cota, bem e crédito.",
    "novoContrato","Registrar contrato");
  let lista = todas;
  const sit = f.sitCota || "ativas";
  if(sit==="ativas") lista = lista.filter(c=>c.status!=="cancelado");
  else if(sit==="canceladas") lista = lista.filter(c=>c.status==="cancelado");
  if(f.contemplacao) lista = lista.filter(c=> f.contemplacao==="nao" ? !c.contemplado : f.contemplacao==="sim" ? !!c.contemplado : c.contemplado===f.contemplacao);
  if(f.operadora) lista = lista.filter(c=>c.operadora===f.operadora);
  if(f.bem) lista = lista.filter(c=>(c.bem||c.produto)===f.bem);
  if(f.corretor) lista = lista.filter(c=>c.corretor===f.corretor);
  if(S.busca){
    const q = S.busca.toLowerCase();
    lista = lista.filter(c=>[(c.clienteNome||""), c.grupo||"", c.cota||"", c.operadora||""].join(" ").toLowerCase().includes(q));
  }
  const ativas = todas.filter(c=>c.status!=="cancelado");
  const credito = ativas.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const contempladas = ativas.filter(c=>c.contemplado);
  const credContemplado = contempladas.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const parcelaMes = ativas.reduce((a,c)=>a+(Number(c.valorParcela)||0),0);
  const semParcela = ativas.filter(c=>!Number(c.valorParcela)).length;
  const porAdm = {};
  ativas.forEach(c=>{ const k = c.operadora||"Sem administradora"; const x = porAdm[k] = porAdm[k]||{n:0,v:0}; x.n++; x.v += Number(c.valorBase)||0; });
  const adms = Object.entries(porAdm).sort((a,b)=>b[1].v-a[1].v);
  const maxAdm = Math.max(...adms.map(a=>a[1].v), 1);
  const porBem = {};
  ativas.forEach(c=>{ const k = c.bem||c.produto||"Não informado"; const x = porBem[k] = porBem[k]||{n:0,v:0}; x.n++; x.v += Number(c.valorBase)||0; });
  const bens = Object.entries(porBem).sort((a,b)=>b[1].v-a[1].v);
  const pag = S.pagVidas || 1, porPagina = 100;
  const ordenada = lista.slice().sort((a,b)=>(a.clienteNome||"").localeCompare(b.clienteNome||"","pt-BR"));
  const fatia = ordenada.slice(0, pag*porPagina);
  const operadoras = [...new Set(todas.map(c=>c.operadora).filter(Boolean))].sort();
  const bensOp = [...new Set(todas.map(c=>c.bem||c.produto).filter(Boolean))].sort();
  return `
  <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(168px,1fr))">
    <div class="stat hero"><div class="k">Cotas ativas</div><div class="v">${ativas.length.toLocaleString("pt-BR")}</div>
      <div class="d">${[...new Set(ativas.map(c=>c.clienteId))].length} cliente(s) · ${adms.length} administradora(s)</div></div>
    <div class="stat"><div class="k">Crédito na carteira</div><div class="v">${brl(credito)}</div>
      <div class="d">média de ${brl(ativas.length?credito/ativas.length:0)} por cota</div></div>
    <div class="stat clickable" data-act="irFiltro" data-view="vidas" data-f='{"contemplacao":"sim"}' data-aba="cotas"><div class="k">Contempladas</div><div class="v">${contempladas.length.toLocaleString("pt-BR")}</div>
      <div class="d">${pct(ativas.length?contempladas.length/ativas.length*100:0)} das cotas · ${brl(credContemplado)}</div></div>
    <div class="stat"><div class="k">A contemplar</div><div class="v">${brl(credito-credContemplado)}</div>
      <div class="d">${(ativas.length-contempladas.length).toLocaleString("pt-BR")} cota(s) aguardando</div></div>
    <div class="stat"><div class="k">Parcelas por mês</div><div class="v">${brl(parcelaMes)}</div>
      <div class="d">${semParcela?`${semParcela} cota(s) sem parcela informada`:"soma das parcelas das cotas"}</div></div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-bottom:14px">
    <section class="panel">
      <div class="panel-head"><div><h3>Crédito por administradora</h3><div class="sub">Só as cotas ativas</div></div></div>
      <div class="chart-wrap">${adms.slice(0,8).map(([nome,x])=>`
        <div class="bar-line"><span class="nm">${esc(nome)}</span>
          <span class="track"><span class="fill" style="width:${larg(x.v,maxAdm)}%;background:var(--c-consorcios)"></span></span>
          <span class="n" style="width:120px">${brl(x.v)} · ${x.n}</span></div>`).join("") || `<div class="hint">Nenhuma cota ativa.</div>`}</div>
      ${tabelaOculta(["Administradora","Cotas","Crédito"], adms.map(([k,x])=>[k, String(x.n), brl(x.v)]))}
    </section>
    <section class="panel">
      <div class="panel-head"><div><h3>Por bem</h3><div class="sub">O que os clientes estão construindo</div></div></div>
      <div class="chart-wrap"><div class="dl">${bens.map(([k,x])=>`
        <div class="clickable" data-act="irFiltro" data-view="vidas" data-f='${esc(JSON.stringify({bem:k}))}' data-aba="cotas">
          <div class="k">${esc(k)}</div><div class="v num" style="font-size:17px;font-weight:700">${brl(x.v)}</div>
          <div class="hint">${x.n} cota(s)</div></div>`).join("") || `<div class="hint">—</div>`}</div></div>
    </section>
  </div>
  <div class="filters">
    <div class="field" style="flex:1;min-width:190px"><label for="ctBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="ctBusca" type="text" placeholder="Cliente, grupo ou cota" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field"><label for="ctSit">Situação</label><select id="ctSit" data-act="filtro" data-k="sitCota">
      ${[["ativas","Ativas"],["canceladas","Canceladas"],["todas","Todas"]].map(([v,n])=>`<option value="${v}" ${sit===v?"selected":""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label for="ctCont">Contemplação</label><select id="ctCont" data-act="filtro" data-k="contemplacao">
      <option value="">Todas</option>${[["nao","Não contempladas"],["sim","Contempladas"],["sorteio","Por sorteio"],["lance","Por lance"]].map(([v,n])=>`<option value="${v}" ${f.contemplacao===v?"selected":""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label for="ctAdm">Administradora</label><select id="ctAdm" data-act="filtro" data-k="operadora">
      <option value="">Todas</option>${operadoras.map(o=>`<option ${f.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    <div class="field"><label for="ctBem">Bem</label><select id="ctBem" data-act="filtro" data-k="bem">
      <option value="">Todos</option>${bensOp.map(o=>`<option ${f.bem===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    ${Object.keys(f).length||S.busca?`<button class="btn ghost" data-act="limparFiltros">Limpar</button>`:""}
  </div>
  <section class="panel">
    <div class="panel-head"><div><h3>${lista.length.toLocaleString("pt-BR")} cota${lista.length!==1?"s":""}</h3>
      <div class="sub">${brl(lista.reduce((a,c)=>a+(Number(c.valorBase)||0),0))} em crédito no filtro${fatia.length<lista.length?` · mostrando ${fatia.length}`:""}</div></div></div>
    ${fatia.length?`<div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Administradora</th><th>Grupo / cota</th><th>Bem</th><th class="r">Crédito</th><th class="r">Parcela</th><th class="r">Prazo</th><th>Contemplação</th><th>Situação</th></tr></thead>
      <tbody>${fatia.map(c=>{ const st = STATUS_CONTRATO[c.status]||STATUS_CONTRATO.proposta;
        return `<tr class="clickable" data-act="abrirContrato" data-id="${esc(c.id)}">
          <td><b>${esc(c.clienteNome||"—")}</b><div class="hint">${esc(nomeUsuario(c.corretor))}</div></td>
          <td>${esc(c.operadora||"—")}</td>
          <td class="num">${c.grupo||c.cota?`${esc(c.grupo||"—")} / ${esc(c.cota||"—")}`:`<span class="hint">não informado</span>`}</td>
          <td>${esc(c.bem||c.produto||"—")}</td>
          <td class="r num"><b>${brl(c.valorBase)}</b></td>
          <td class="r num">${Number(c.valorParcela)?brl(c.valorParcela):"—"}</td>
          <td class="r num">${Number(c.prazoMeses)?c.prazoMeses+"m":"—"}</td>
          <td>${c.contemplado?`<span class="chip ok">${esc(CONTEMPLACAO[c.contemplado]||c.contemplado)}</span>${c.contempladoEm?`<div class="hint num">${dt(c.contempladoEm)}</div>`:""}`:`<span class="chip mute">aguardando</span>`}</td>
          <td><span class="chip ${st.cls}">${esc(st.nome)}</span></td></tr>`; }).join("")}</tbody></table></div>
      ${fatia.length<lista.length?`<div class="ta"><button class="btn" data-act="maisVidas">Mostrar mais ${Math.min(porPagina, lista.length-fatia.length)}</button></div>`:""}`
    : `<div class="empty" style="padding:26px"><b>Nenhuma cota com esses filtros</b>Ajuste a busca ou limpe os filtros.</div>`}
  </section>`;
}

/* ============================================================
   ANIVERSÁRIOS
   Cliente pessoa física: a data de nascimento. Empresa: a data de
   fundação e, se houver, o aniversário do contato principal — é com
   ele que a corretora fala.
   ============================================================ */
const diasAvisoAniv = () => Math.min(60, Math.max(0, Number((S.config && S.config.diasAvisoAniversario) ?? 7)));
function aniversariantes(dias, lista){
  const out = [];
  for(const c of (lista || S.clientes.filter(c=>noEscopo(c)))){
    if(["encerrado","inativo"].includes(c.status)) continue;
    const add = (data, quem, nome) => {
      if(!data) return;
      const prox = proximoAniversario(data), d = diasEntre(hoje(), prox);
      if(d>=0 && d<=dias) out.push({ c, prox, dias:d, anos:idadeEm(data, prox), quem, nome });
    };
    add(c.nascimento, c.tipo==="PF" ? "cliente" : "empresa", c.nome);
    if(c.tipo!=="PF" && c.contatoNascimento) add(c.contatoNascimento, "contato", c.contatoNome || "Contato principal");
  }
  return out.sort((a,b)=>a.dias-b.dias || (a.nome||"").localeCompare(b.nome||"","pt-BR"));
}
const jaParabenizado = x => (x.quem==="contato" ? x.c.contatoParabenizadoEm : x.c.parabenizadoEm) === x.prox;
const descAniv = x => x.quem==="empresa" ? `${x.anos} ano${x.anos!==1?"s":""} de empresa`
  : x.quem==="contato" ? `contato de ${x.c.nome} · faz ${x.anos} anos` : `faz ${x.anos} anos`;
const quandoAniv = x => x.dias===0 ? "hoje" : x.dias===1 ? "amanhã" : `em ${x.dias} dias (${dt(x.prox).slice(0,5)})`;
function linkParabens(x){
  const fone = soDigitos(x.quem==="contato" ? (x.c.contatoWhatsapp || x.c.whatsapp || x.c.telefone) : (x.c.whatsapp || x.c.telefone)).replace(/^55(?=\d{10,11}$)/,"");
  if(fone.length < 10) return "";
  const primeiro = String(x.quem==="empresa" ? x.c.nome : x.nome).trim().split(/\s+/)[0];
  const msg = x.quem==="empresa"
    ? `Olá! A equipe da Erbe Proteção e Patrimônio parabeniza a ${x.c.nome} pelos ${x.anos} anos. Obrigado pela confiança de sempre — seguimos juntos protegendo o que vocês constroem.`
    : x.dias===0
      ? `Feliz aniversário, ${primeiro}! A equipe da Erbe Proteção e Patrimônio deseja um novo ano cheio de saúde, tranquilidade e conquistas. Um abraço!`
      : `Olá, ${primeiro}! Passando para adiantar os parabéns pelo seu aniversário no dia ${dt(x.prox).slice(0,5)}. A equipe da Erbe deseja um novo ano cheio de saúde e conquistas!`;
  return `https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`;
}
/** Botões de ação de um aniversário: parabenizar pelo WhatsApp (ou marcar) e agendar. */
function botoesAniv(x){
  const link = linkParabens(x);
  const dados = `data-id="${esc(x.c.id)}" data-quem="${esc(x.quem)}" data-prox="${esc(x.prox)}"`;
  return (link
      ? `<a class="btn sm primary" href="${esc(link)}" target="_blank" rel="noopener" data-act="parabenizou" ${dados}>Parabenizar no WhatsApp</a>`
      : `<button class="btn sm" data-act="parabenizou" ${dados} title="Sem WhatsApp no cadastro">Já parabenizei</button>`)
    + ` <button class="btn sm ghost" data-act="agendarAniv" ${dados}>Agendar</button>`;
}
/** Aniversários que o pop-up lembra: os da minha carteira, dentro da antecedência, ainda não parabenizados. */
function aniversariosParaLembrar(){
  return aniversariantes(diasAvisoAniv(), S.clientes.filter(c=>noEscopo(c) && (c.responsavel===S.uid || !c.responsavel)))
    .filter(x=>!jaParabenizado(x));
}
async function marcarParabenizado(id, quem, prox){
  const c = S.clientes.find(x=>x.id===id); if(!c) return;
  const novo = Object.assign({}, c, quem==="contato" ? { contatoParabenizadoEm:prox } : { parabenizadoEm:prox, ultimoPosVenda:hoje() });
  await salvar("clientes", novo, quem==="contato" ? "Parabenizou o contato de" : "Parabenizou");
}

/* ---------- comissões dentro da ficha do cliente ---------- */
function comissoesDoCliente(c, ps){
  if(ocultaComissao() || !ps.length) return "";
  const vis = p => p.status==="recebido" ? efetivoVis(p) : valorVis(p);
  const ord = ps.slice().sort((a,b)=>a.vence.localeCompare(b.vence));
  const abertas = ord.filter(p=>p.status==="previsto");
  const recebido = ord.filter(p=>p.status==="recebido").reduce((a,p)=>a+vis(p),0);
  const aReceber = abertas.reduce((a,p)=>a+vis(p),0);
  const atraso = abertas.filter(p=>p.vencida);
  const prox = abertas.find(p=>!p.vencida);
  const linha = p => { const st = p.vencida ? STATUS_COM.atrasado : (STATUS_COM[p.status]||STATUS_COM.previsto);
    return `<tr class="clickable" data-act="abrirContrato" data-id="${esc(p.contratoId)}">
      <td class="num"><b>${dt(p.vence)}</b>${p.status==="previsto"&&!p.vencida?`<div class="hint">${diasEntre(hoje(),p.vence)===0?"hoje":`em ${diasEntre(hoje(),p.vence)} dias`}</div>`:""}</td>
      <td><span class="chip ${esc(p.pilar)}">${esc(PILARES[p.pilar].curto)}</span>${p.pilar==="consorcios"?` <span class="chip consorcios" title="Comissão de consórcio">Consórcio</span>`:""}
        <div class="hint">${esc(p.operadora||"")}${p.contrato.produto?` · ${esc(p.contrato.produto)}`:""}</div></td>
      <td>${esc(tipoP(p.tipo).nome)} <span class="hint">${p.n}/${p.contrato.comissoes.length}</span></td>
      <td class="r num"><b>${brl2(vis(p))}</b></td>
      <td><span class="chip ${st.cls}">${st.nome}</span>${p.recebidoEm?`<div class="hint num">em ${dt(p.recebidoEm)}</div>`:""}</td></tr>`; };
  const cab = `<thead><tr><th>Data prevista</th><th>Contrato</th><th>Parcela</th><th class="r">${veCorretora()?"Valor":"Sua parte"}</th><th>Situação</th></tr></thead>`;
  return `<div class="panel com" style="box-shadow:none">
    <div class="panel-head"><div><h3>Comissões do cliente</h3>
      <div class="sub">${brl(recebido)} recebidos · ${brl(aReceber)} a receber${atraso.length?` · <span style="color:var(--crit)">${atraso.length} em atraso</span>`:""}${prox?` · próxima em ${dt(prox.vence)}`:""}${veCorretora()?"":" · sua parte"}</div></div></div>
    ${abertas.length?`<div class="tw"><table>${cab}<tbody>${abertas.slice(0,12).map(linha).join("")}</tbody></table></div>
      ${abertas.length>12?`<div class="ta">e mais ${abertas.length-12} parcela(s) a receber.</div>`:""}`
      :`<div class="empty" style="padding:16px">Nenhuma parcela em aberto — tudo o que estava previsto já foi conciliado.</div>`}
    <details class="tblview"><summary>Ver todas as ${ord.length} parcelas, inclusive as recebidas</summary>
      <div class="tw" style="padding:0 16px 14px"><table>${cab}<tbody>${ord.map(linha).join("")}</tbody></table></div></details>
  </div>`;
}
function viewVidasPessoas(){
  const f = S.filtros;
  const todas = vidasNoEscopo();
  const pendentes = contratosSemDetalhe();

  if(!todas.length && !pendentes.length && !S.contratos.length)
    return vazio("Nenhuma vida cadastrada",
      "Vidas aparecem aqui assim que houver um contrato de saúde ou de proteção na carteira.",
      "novoContrato","Registrar contrato");

  // --- filtros ---
  let lista = todas;
  if(f.statusVida) lista = lista.filter(v=>v.status===f.statusVida);
  if(f.tipoVida)   lista = lista.filter(v=>(v.tipo||"titular")===f.tipoVida);
  if(f.pilar)      lista = lista.filter(v=>{const c=contratoPorId(v.contratoId); return c && c.pilar===f.pilar;});
  if(f.operadora)  lista = lista.filter(v=>{const c=contratoPorId(v.contratoId); return c && c.operadora===f.operadora;});
  if(f.corretor)   lista = lista.filter(v=>{const c=contratoPorId(v.contratoId); return c && c.corretor===f.corretor;});
  if(S.busca){
    const q = S.busca.toLowerCase();
    lista = lista.filter(v=>{
      const c = contratoPorId(v.contratoId);
      const dq = soDigitos(q);
      return (v.nome||"").toLowerCase().includes(q)
          || (c && (c.clienteNome||"").toLowerCase().includes(q))
          || (dq.length >= 3 && soDigitos(v.doc).includes(dq));
    });
  }

  // --- números do topo ---
  const ativas = vidasAtivas(todas);
  const porPilar = {};
  PK.forEach(p=>porPilar[p]=0);
  ativas.forEach(v=>{ const c=contratoPorId(v.contratoId); if(c) porPilar[c.pilar]=(porPilar[c.pilar]||0)+1; });
  const naoDetalhadas = pendentes.reduce((a,c)=>a+(Number(c.vidas)||0),0);
  const mesAtual0 = mesAtual();
  const entraram = todas.filter(v=>(v.entrada||"").slice(0,7)===mesAtual0).length;
  const sairam   = todas.filter(v=>(v.saida||"").slice(0,7)===mesAtual0).length;
  const titulares = ativas.filter(v=>(v.tipo||"titular")==="titular").length;
  const deps = ativas.length - titulares;

  // --- por operadora, ordenado ---
  const porOperadora = {};
  ativas.forEach(v=>{ const c=contratoPorId(v.contratoId); if(!c) return;
    const k=c.operadora||"Sem operadora"; porOperadora[k]=(porOperadora[k]||0)+1; });
  const opsOrd = Object.entries(porOperadora).sort((a,b)=>b[1]-a[1]);
  const maxOp = Math.max(...opsOrd.map(o=>o[1]), 1);

  const pag = S.pagVidas || 1;
  const porPagina = 100;
  const ordenada = lista.slice().sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"));
  const fatia = ordenada.slice(0, pag*porPagina);

  return `
  ${avisoSuaParte()}
  <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(168px,1fr))">
    <div class="stat hero"><div class="k">Vidas ativas</div><div class="v">${ativas.length.toLocaleString("pt-BR")}</div>
      <div class="d">${titulares} titular${titulares!==1?"es":""} · ${deps} dependente${deps!==1?"s":""}</div></div>
    ${PK.filter(p=>PILAR_TEM_VIDA[p]).map(p=>`
      <div class="stat clickable" data-act="irFiltro" data-view="vidas" data-f='{"pilar":"${p}"}'>
        <div class="k">${esc(PILARES[p].curto)}</div><div class="v">${(porPilar[p]||0).toLocaleString("pt-BR")}</div>
        <div class="d">vidas ativas</div></div>`).join("")}
    <div class="stat"><div class="k">Movimento do mês</div>
      <div class="v" style="font-size:22px"><span style="color:var(--ok)">+${entraram}</span> <span style="color:var(--ink-3)">/</span> <span style="color:var(--crit)">−${sairam}</span></div>
      <div class="d">inclusões e exclusões em ${mesLabel(mesAtual0)}</div></div>
  </div>

  ${naoDetalhadas ? `<div class="alerts"><div class="alert warn" data-act="irFiltro" data-view="vidas" data-f='{"pendentes":"1"}'>
    <span class="ai" aria-hidden="true">!</span>
    <span><b>${naoDetalhadas} vida(s) ainda sem nome</b>
    <span>${pendentes.length} contrato(s) trazem só o número de vidas. Abra cada um e detalhe quem são.</span></span></div></div>` : ""}

  ${f.pendentes ? painelPendentes(pendentes) : ""}

  ${painelFaixaEtaria(todas)}

  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-bottom:14px">
    <section class="panel">
      <div class="panel-head"><div><h3>Vidas por operadora</h3><div class="sub">Só as ativas</div></div></div>
      <div class="chart-wrap">${opsOrd.length ? opsOrd.slice(0,8).map(([nome,n])=>`
        <div class="bar-line"><span class="nm">${esc(nome)}</span>
          <span class="track"><span class="fill" style="width:${larg(n,maxOp)}%;background:var(--accent)"></span></span>
          <span class="n">${n.toLocaleString("pt-BR")}</span></div>`).join("")
        : `<div class="hint">Nenhuma vida ativa ainda.</div>`}</div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h3>Situação das vidas</h3><div class="sub">Todas, inclusive as que saíram</div></div></div>
      <div class="chart-wrap"><div class="dl">
        ${Object.entries(STATUS_VIDA).map(([k,v])=>`
          <div class="clickable" data-act="irFiltro" data-view="vidas" data-f='{"statusVida":"${k}"}'>
            <div class="k">${esc(v.nome)}</div>
            <div class="v num" style="font-size:19px;font-weight:700">${todas.filter(x=>x.status===k).length.toLocaleString("pt-BR")}</div></div>`).join("")}
      </div></div>
    </section>
  </div>

  <div class="filters">
    <div class="field" style="flex:1;min-width:190px"><label for="vdBusca">Buscar</label>
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="vdBusca" type="text" placeholder="Nome da vida ou do cliente" value="${esc(S.busca)}" data-act="busca"></div></div>
    <div class="field"><label for="vdStatus">Situação</label><select id="vdStatus" data-act="filtro" data-k="statusVida">
      <option value="">Todas</option>${Object.entries(STATUS_VIDA).map(([k,v])=>`<option value="${k}" ${f.statusVida===k?"selected":""}>${esc(v.nome)}</option>`).join("")}</select></div>
    <div class="field"><label for="vdTipo">Tipo</label><select id="vdTipo" data-act="filtro" data-k="tipoVida">
      <option value="">Todos</option>${Object.entries(TIPO_VIDA).map(([k,v])=>`<option value="${k}" ${f.tipoVida===k?"selected":""}>${esc(v)}</option>`).join("")}</select></div>
    <div class="field"><label for="vdPilar">Pilar</label><select id="vdPilar" data-act="filtro" data-k="pilar">
      <option value="">Todos</option>${PK.filter(p=>PILAR_TEM_VIDA[p]).map(p=>`<option value="${p}" ${f.pilar===p?"selected":""}>${esc(PILARES[p].curto)}</option>`).join("")}</select></div>
    <div class="field"><label for="vdOper">Operadora</label><select id="vdOper" data-act="filtro" data-k="operadora">
      <option value="">Todas</option>${[...new Set(S.contratos.map(c=>c.operadora).filter(Boolean))].sort().map(o=>`<option value="${esc(o)}" ${f.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    ${Object.keys(f).length||S.busca?`<button class="btn ghost" data-act="limparFiltros">Limpar</button>`:""}
  </div>

  <section class="panel">
    <div class="panel-head"><div><h3>${lista.length.toLocaleString("pt-BR")} vida${lista.length!==1?"s":""}</h3>
      <div class="sub">${fatia.length < lista.length ? `mostrando as ${fatia.length} primeiras` : "todas no filtro atual"}</div></div></div>
    ${fatia.length?`<div class="tw"><table>
      <thead><tr><th>Nome</th><th>Tipo</th><th>Cliente</th><th>Contrato</th><th class="num">Entrada</th><th class="num">Saída</th><th>Situação</th><th></th></tr></thead>
      <tbody>${fatia.map(v=>{
        const c = contratoPorId(v.contratoId);
        const st = SV(v.status);
        return `<tr>
          <td><b>${esc(v.nome||"—")}</b>${v.doc?`<div class="hint num">${esc(mascararDoc(v.doc))}</div>`:""}</td>
          <td><span class="chip ${(v.tipo||"titular")==="titular"?"info":"mute"}">${esc(TIPO_VIDA[v.tipo||"titular"])}</span>
            ${v.parentesco?`<div class="hint">${esc(v.parentesco)}</div>`:""}</td>
          <td class="clickable" data-act="abrirCliente" data-id="${esc(c?c.clienteId:"")}">${esc(c?c.clienteNome:"—")}</td>
          <td class="clickable" data-act="abrirContrato" data-id="${esc(v.contratoId)}">
            ${c?`<span class="chip ${esc(c.pilar)}">${esc(PILARES[c.pilar].curto)}</span> <span class="hint">${esc(c.operadora||"")}</span>`:"—"}</td>
          <td class="num">${v.entrada?dt(v.entrada):"—"}</td>
          <td class="num">${v.saida?dt(v.saida):"—"}</td>
          <td><span class="chip ${st.cls}">${esc(st.nome)}</span></td>
          <td class="r" style="white-space:nowrap">
            <button class="btn sm ghost" data-act="editarVida" data-id="${esc(v.id)}" aria-label="Editar vida">✎</button>
            ${SV(v.status).conta?`<button class="btn sm" data-act="excluirVidaDoPlano" data-id="${esc(v.id)}">Excluir do plano</button>`:""}
          </td></tr>`;
      }).join("")}</tbody></table></div>
      ${fatia.length < lista.length?`<div class="ta"><button class="btn" data-act="maisVidas">Mostrar mais ${Math.min(porPagina, lista.length-fatia.length)}</button></div>`:""}`
    : `<div class="empty" style="padding:26px"><b>Nenhuma vida com esses filtros</b>Ajuste a busca ou limpe os filtros.</div>`}
  </section>`;
}

/** Contratos que ainda trazem só o número de vidas, sem nome. */
function painelFaixaEtaria(todas){
  const saude = vidasAtivas(todas).filter(v=>{ const c=contratoPorId(v.contratoId); return c && c.pilar==="saude"; });
  const comData = saude.filter(v=>v.nascimento);
  const cont = FAIXAS_ANS.map(()=>0);
  comData.forEach(v=>{ const i = faixaANS(idadeEm(v.nascimento)); if(i>=0) cont[i]++; });
  const max = Math.max(...cont, 1);
  const mudam = mudancasDeFaixa(60);
  const semData = saude.length - comData.length;
  if(!saude.length) return "";
  return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-bottom:14px">
    <section class="panel">
      <div class="panel-head"><div><h3>Faixa etária (ANS)</h3>
        <div class="sub">Vidas ativas de saúde com data de nascimento · ${comData.length} de ${saude.length}</div></div></div>
      <div class="chart-wrap">${comData.length ? FAIXAS_ANS.map((f,i)=>`
        <div class="bar-line"><span class="nm">${esc(f.rot)}</span>
          <span class="track"><span class="fill" style="width:${larg(cont[i],max)}%;background:${i===9?"var(--warn)":"var(--c-saude)"}"></span></span>
          <span class="n">${cont[i]}</span></div>`).join("")
        : `<div class="hint">Nenhuma vida de saúde com data de nascimento ainda.</div>`}
        ${semData?`<div class="hint" style="margin-top:8px">${semData} vida(s) sem nascimento ficam fora deste quadro e dos avisos de mudança de faixa.</div>`:""}
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><span class="chip ${mudam.length?"warn":"ok"}">${mudam.length?"Reajuste por idade":"Nada em 60 dias"}</span>
        <div><h3>Mudam de faixa em 60 dias</h3><div class="sub">O boleto sobe no mês seguinte ao aniversário</div></div></div>
      ${mudam.length?`<div class="tw"><table><tbody>${mudam.slice(0,10).map(x=>`<tr>
        <td><b>${esc(x.v.nome)}</b><div class="hint">${esc(x.ct.clienteNome)} · ${esc(x.ct.operadora||"")}</div></td>
        <td class="num">${dt(x.prox)}<div class="hint">faz ${x.idade} · entra em ${esc(x.faixa.rot)}</div></td>
        <td class="r"><button class="btn sm" data-act="avisarFaixa" data-id="${esc(x.v.id)}">Avisar cliente</button></td>
      </tr>`).join("")}</tbody></table></div>
      ${mudam.length>10?`<div class="ta">e mais ${mudam.length-10}.</div>`:""}`
      : `<div class="chart-wrap"><div class="hint">Nenhuma vida muda de faixa nos próximos 60 dias${semData?" — entre as que têm data de nascimento":""}.</div></div>`}
    </section>
  </div>`;
}

function painelPendentes(pendentes){
  return `<section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><span class="chip warn">A detalhar</span>
      <div><h3>${pendentes.length} contrato(s) com vidas sem nome</h3>
        <div class="sub">O número veio do contrato; falta dizer quem são</div></div>
      <div class="right"><button class="btn sm ghost" data-act="limparFiltros">Fechar</button></div></div>
    <div class="tw"><table>
      <thead><tr><th>Cliente</th><th>Produto</th><th>Operadora</th><th class="r">Vidas</th><th></th></tr></thead>
      <tbody>${pendentes.slice(0,50).map(c=>`<tr>
        <td class="clickable" data-act="abrirContrato" data-id="${esc(c.id)}"><b>${esc(c.clienteNome)}</b></td>
        <td><span class="chip ${esc(c.pilar)}">${esc(PILARES[c.pilar].curto)}</span> <span class="hint">${esc(c.produto||"")}</span></td>
        <td>${esc(c.operadora||"—")}</td>
        <td class="r num"><b>${c.vidas}</b></td>
        <td class="r"><button class="btn sm primary" data-act="detalharVidas" data-id="${esc(c.id)}">Detalhar</button></td>
      </tr>`).join("")}</tbody></table></div>
    ${pendentes.length>50?`<div class="ta">e mais ${pendentes.length-50} contrato(s).</div>`:""}
  </section>`;
}

/** CPF aparece mascarado: a tela não precisa do número inteiro. */
function mascararDoc(v){
  const d = soDigitos(v);
  if(d.length===11) return `•••.${d.slice(3,6)}.${d.slice(6,9)}-••`;
  if(d.length===14) return `••.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-••`;
  return d ? "•••" : "";
}

function viewDespesas(){
  const m = mesDespesas();
  const ds = despesasDoMes(m).sort((a,b)=>(b.data||"").localeCompare(a.data||""));
  const total = ds.reduce((a,d)=>a+(Number(d.valor)||0),0);
  const receita = receitaDoMes(m);
  const impostoMes = impostoDoMes(m);
  const resultado = receita - impostoMes - total;
  const mAnt = addMonths(m+"-01",-1).slice(0,7);
  const totalAnt = despesasDoMes(mAnt).reduce((a,d)=>a+(Number(d.valor)||0),0);
  const variacao = totalAnt ? (total-totalAnt)/totalAnt*100 : 0;
  const diaDeHoje = m===mesAtual() ? +hoje().slice(8,10) : new Date(+m.slice(0,4), +m.slice(5,7), 0).getDate();
  const media = diaDeHoje ? total/diaDeHoje : 0;

  // por categoria
  const cats = {};
  ds.forEach(d=>{ const k=d.categoria||"Outros"; cats[k]=(cats[k]||0)+(Number(d.valor)||0); });
  const catsOrd = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const maxCat = Math.max(...catsOrd.map(c=>c[1]),1);

  // série de 6 meses
  const serie = ultimosMeses(6).map(x=>({
    mes:x, receita:receitaDoMes(x),
    despesa:despesasDoMes(x).reduce((a,d)=>a+(Number(d.valor)||0),0)
  }));

  // agrupado por dia
  const porDia = {};
  ds.forEach(d=>{ (porDia[d.data]=porDia[d.data]||[]).push(d); });

  const recorrentesAnt = despesasDoMes(mAnt).filter(d=>d.recorrente);
  const jaTem = desc => ds.some(d=>d.descricao===desc);
  const aRepetir = recorrentesAnt.filter(d=>!jaTem(d.descricao));

  return `
  <div class="filters" style="align-items:center">
    <button class="btn" data-act="mesDespesa" data-v="-1" aria-label="Mês anterior">‹</button>
    <div style="font-family:var(--serif);font-size:18px;font-weight:600;min-width:104px;text-align:center">${mesLabel(m)}</div>
    <button class="btn" data-act="mesDespesa" data-v="1" aria-label="Próximo mês">›</button>
    ${m!==mesAtual()?`<button class="btn ghost" data-act="mesDespesa" data-v="0">Voltar para ${mesLabel(mesAtual())}</button>`:""}
    ${aRepetir.length?`<button class="btn" data-act="repetirRecorrentes" style="margin-left:auto">Repetir ${aRepetir.length} gasto(s) fixo(s) de ${mesLabel(mAnt)}</button>`:""}
  </div>

  <div class="stat-row">
    <div class="stat hero">
      <div class="k">Resultado de ${mesLabel(m)}</div>
      <div class="v" style="color:${resultado>=0?"var(--c-receita)":"var(--crit)"}">${brl(resultado)}</div>
      <div class="d">${brl(receita)} de comissão recebida${impostoMes?` − ${brl(impostoMes)} de impostos`:""} − ${brl(total)} de gastos</div>
    </div>
    <div class="stat"><div class="k">Gastos do mês</div><div class="v">${brl(total)}</div>
      <div class="d">${ds.length} lançamento(s)${totalAnt?` · <span class="delta ${variacao>0?"down":"up"}">${variacao>0?"+":""}${pct(variacao)}</span> vs ${mesLabel(mAnt)}`:""}</div></div>
    <div class="stat"><div class="k">Média por dia</div><div class="v">${brl(media)}</div>
      <div class="d">Sobre ${diaDeHoje} dia(s) do mês</div></div>
    <div class="stat"><div class="k">Maior categoria</div>
      <div class="v" style="font-size:17px">${catsOrd.length?esc(catsOrd[0][0]):"—"}</div>
      <div class="d">${catsOrd.length?`${brl(catsOrd[0][1])} · ${pct(catsOrd[0][1]/total*100)} do mês`:"Nenhum gasto lançado"}</div></div>
    <div class="stat"><div class="k">Margem</div>
      <div class="v">${receita?pct(resultado/receita*100):"—"}</div>
      <div class="d">Do que entrou, quanto sobrou</div></div>
    <div class="stat"><div class="k">Gastos fixos marcados</div><div class="v">${ds.filter(d=>d.recorrente).length}</div>
      <div class="d">${brl(ds.filter(d=>d.recorrente).reduce((a,d)=>a+(Number(d.valor)||0),0))} por mês</div></div>
  </div>

  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr));margin-bottom:14px">
    <section class="panel">
      <div class="panel-head"><div><h3>Onde o dinheiro foi</h3><div class="sub">${mesLabel(m)} por categoria</div></div></div>
      <div class="chart-wrap">${catsOrd.length ? catsOrd.map(([k,v])=>`
        <div class="bar-line"><span class="nm" style="width:150px">${esc(k)}</span>
          <span class="track"><span class="fill" style="width:${larg(v,maxCat)}%;background:var(--c-despesa)"></span></span>
          <span class="n" style="width:120px">${brl(v)} · ${pct(v/total*100)}</span></div>`).join("")
        : `<div class="empty"><b>Nenhum gasto em ${mesLabel(m)}</b>Lance o primeiro pelo botão “+ Despesa”.</div>`}</div>
      ${tabelaOculta(["Categoria","Valor","Participação"], catsOrd.map(([k,v])=>[k,brl(v),pct(v/total*100)]))}
    </section>

    <section class="panel">
      <div class="panel-head"><div><h3>Entrou e saiu</h3><div class="sub">Comissão recebida contra gastos · 6 meses</div></div></div>
      ${chartReceitaDespesa(serie)}
      <div class="legend">
        <span><i class="dot" style="background:var(--c-receita)"></i>Comissão recebida</span>
        <span><i class="dot" style="background:var(--c-despesa)"></i>Gastos</span>
      </div>
      ${tabelaOculta(["Mês","Recebido","Gastos","Resultado"], serie.map(r=>[mesLabel(r.mes),brl(r.receita),brl(r.despesa),brl(r.receita-r.despesa)]))}
    </section>
  </div>

  <section class="panel">
    <div class="panel-head"><div><h3>Lançamentos de ${mesLabel(m)}</h3>
      <div class="sub">${ds.length} gasto(s) · ${brl(total)}</div></div>
      <div class="right"><button class="btn sm primary" data-act="novaDespesa">+ Despesa</button></div></div>
    ${ds.length ? Object.entries(porDia).sort((a,b)=>b[0].localeCompare(a[0])).map(([dia,itens])=>`
      <div class="tw"><table>
        <thead><tr><th style="width:130px">${dt(dia)}</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th class="r">Valor</th><th></th></tr></thead>
        <tbody>${itens.map(d=>`<tr>
          <td>${d.recorrente?`<span class="chip mute">fixo</span>`:""}</td>
          <td><b>${esc(d.descricao)}</b>${d.fornecedor?`<div class="hint">${esc(d.fornecedor)}</div>`:""}</td>
          <td><span class="chip despesa">${esc(d.categoria||"Outros")}</span></td>
          <td class="hint">${esc(d.forma||"—")}</td>
          <td class="r num"><b>${brl2(d.valor)}</b></td>
          <td class="r" style="white-space:nowrap">
            <button class="btn sm ghost" data-act="editarDespesa" data-id="${esc(d.id)}" aria-label="Editar">✎</button>
            <button class="btn sm ghost danger" data-act="excluirDespesa" data-id="${esc(d.id)}" aria-label="Excluir">×</button></td>
        </tr>`).join("")}
        <tr><td></td><td colspan="3" class="r hint">Total do dia</td>
          <td class="r num"><b>${brl2(itens.reduce((a,x)=>a+(Number(x.valor)||0),0))}</b></td><td></td></tr></tbody>
      </table></div>`).join("")
      : `<div class="empty"><b>Mês sem lançamentos</b>Registre os gastos do dia a dia para fechar o balanço do mês.
         <div style="margin-top:14px"><button class="btn primary" data-act="novaDespesa">Lançar o primeiro gasto</button></div></div>`}
  </section>`;
}
function chartReceitaDespesa(dados){
  const W=560, H=190, pad={t:16,r:8,b:26,l:52};
  const max = Math.max(...dados.flatMap(d=>[d.receita,d.despesa]), 1);
  const passo = (W-pad.l-pad.r)/dados.length;
  const bw = Math.min(15, passo*0.28);
  const escala = v => (H-pad.t-pad.b)*(v/max);
  let g="";
  ticksDe(max).forEach(([t,rot])=>{
    const y = H-pad.b-escala(t);
    g += `<line class="grid-l" x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}"/>
          <text class="val" x="${pad.l-7}" y="${y+3}" text-anchor="end">${rot}</text>`;
  });
  dados.forEach((d,i)=>{
    const cx = pad.l + passo*i + passo/2;
    [["receita","var(--c-receita)",-1],["despesa","var(--c-despesa)",1]].forEach(([k,cor,lado])=>{
      const v = d[k]; if(!v) return;
      const h = escala(v), x = cx + (lado<0 ? -bw-1 : 1);
      g += `<rect class="mark" x="${x.toFixed(1)}" y="${(H-pad.b-h).toFixed(1)}" width="${bw}" height="${Math.max(h,1).toFixed(1)}" rx="2" fill="${cor}"><title>${mesLabel(d.mes)} · ${k==="receita"?"recebido":"gastos"}: ${brl(v)}</title></rect>`;
    });
    const topo = Math.max(d.receita,d.despesa);
    if(topo) g += `<text class="val" x="${cx}" y="${(H-pad.b-escala(topo)-5).toFixed(1)}" text-anchor="middle">${kNum(topo)}</text>`;
    g += `<text class="lbl" x="${cx}" y="${H-pad.b+14}" text-anchor="middle">${mesLabel(d.mes).slice(0,3)}</text>`;
  });
  g += `<line class="grid-l" x1="${pad.l}" y1="${H-pad.b}" x2="${W-pad.r}" y2="${H-pad.b}"/>`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Comissão recebida e gastos por mês">${g}</svg></div>`;
}
/* ---------- formulários e ações de vida ---------- */
function formVida(v, contratoId){
  v = v || {};
  const ct = contratoPorId(v.contratoId || contratoId) || null;
  const atual = v.contratoId || contratoId;
  const candidatos = S.contratos.filter(c=>c.id===atual
    || (contratoTemVida(c) && c.status!=="cancelado" && noEscopo(c,"corretor")));
  const ehDep = (v.tipo||"titular")==="dependente";
  return `
  <div class="m-head"><div><h2>${v.id?"Editar vida":"Incluir vida"}</h2>
    <div class="sub">${ct?esc(ct.clienteNome+" · "+(ct.operadora||"")):"Escolha o contrato"}</div></div></div>
  <div class="m-body">
    <div class="field"><label for="viContrato">Contrato</label>
      <select id="viContrato">${candidatos.length?candidatos.map(c=>`<option value="${esc(c.id)}" ${(v.contratoId||contratoId)===c.id?"selected":""}>${esc(c.clienteNome)} · ${esc(PILARES[c.pilar].curto)} · ${esc(c.operadora||"")}</option>`).join(""):`<option value="">— nenhum contrato de saúde ou proteção —</option>`}</select>
      <span class="hint">Consórcio não tem vida: tem cota.</span></div>
    <div class="frow">
      <div class="field" style="flex:2"><label for="viNome">Nome completo</label><input id="viNome" type="text" value="${esc(v.nome||"")}" placeholder="Maria Aparecida dos Santos"></div>
      <div class="field"><label for="viTipo">Tipo</label><select id="viTipo" data-act="tipoVidaMudou">
        ${Object.entries(TIPO_VIDA).map(([k,n])=>`<option value="${k}" ${(v.tipo||"titular")===k?"selected":""}>${esc(n)}</option>`).join("")}</select></div>
      <div class="field" id="campoParentesco" ${ehDep?"":'style="display:none"'}><label for="viParentesco">Parentesco</label>
        <select id="viParentesco">${PARENTESCOS.map(p=>`<option ${v.parentesco===p?"selected":""}>${esc(p)}</option>`).join("")}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="viStatus">Situação</label><select id="viStatus">
        ${Object.entries(STATUS_VIDA).map(([k,s])=>`<option value="${k}" ${(v.status||"ativa")===k?"selected":""}>${esc(s.nome)}</option>`).join("")}</select></div>
      <div class="field"><label for="viEntrada">Entrada no plano</label><input id="viEntrada" type="date" value="${esc(v.entrada||(ct?ct.inicio:hoje()))}"></div>
      <div class="field"><label for="viSaida">Saída</label><input id="viSaida" type="date" value="${esc(v.saida||"")}">
        <span class="hint">Em branco enquanto estiver no plano.</span></div>
    </div>
    <details>
      <summary style="cursor:pointer;font-size:11.5px;color:var(--ink-3);font-weight:600">Dados pessoais (opcionais)</summary>
      <div class="frow" style="margin-top:10px">
        <div class="field"><label for="viDoc">CPF</label><input id="viDoc" type="text" value="${esc(v.doc||"")}" placeholder="só números" inputmode="numeric">
          <span class="hint">Guardado para movimentação junto à operadora. Aparece mascarado nas listas.</span></div>
        <div class="field"><label for="viNasc">Nascimento</label><input id="viNasc" type="date" value="${esc(v.nascimento||"")}"></div>
        <div class="field"><label for="viCarteirinha">Carteirinha</label><input id="viCarteirinha" type="text" value="${esc(v.carteirinha||"")}"></div>
      </div>
      <div class="hint">Preencha só o que a operadora exigir. Dado que não é necessário é dado que você não precisa proteger.</div>
    </details>
    <div class="field"><label for="viObs">Observações</label><textarea id="viObs" placeholder="Carência, portabilidade, o que combinaram">${esc(v.obs||"")}</textarea></div>
  </div>
  <div class="m-foot">
    ${v.id?`<button class="btn ghost danger left" data-act="apagarVida" data-id="${esc(v.id)}">Apagar registro</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarVida" data-id="${esc(v.id||"")}">${v.id?"Salvar":"Incluir vida"}</button>
  </div>`;
}
async function salvarVida(id){
  const contratoId = val("viContrato");
  if(!contratoId){ toast("Escolha o contrato."); return; }
  const nome = val("viNome").trim();
  if(!nome){ toast("Informe o nome da pessoa."); return; }
  const ct = contratoPorId(contratoId);
  const antiga = id ? (S.vidas||[]).find(x=>x.id===id) : null;
  const tipo = val("viTipo")||"titular";
  const v = Object.assign({}, antiga||{}, {
    id: id || uid("vid"),
    contratoId, clienteId: ct ? ct.clienteId : "",
    nome, tipo,
    parentesco: tipo==="dependente" ? val("viParentesco") : "",
    status: val("viStatus")||"ativa",
    entrada: val("viEntrada")||hoje(),
    saida: val("viSaida")||"",
    doc: soDigitos(val("viDoc")),
    nascimento: val("viNasc")||"",
    carteirinha: val("viCarteirinha")||"",
    obs: val("viObs")||"",
    criadoEm: (antiga && antiga.criadoEm) || hoje()
  });
  await salvar("vidas", v, id ? "Alterou a vida de" : "Incluiu no plano —");
  fecharModal();
  toast(id ? "Vida atualizada" : "Vida incluída");
}
/** Exclusão do plano: a vida não some do sistema, muda de situação e ganha data de saída. */
async function excluirDoPlano(id){
  const v = (S.vidas||[]).find(x=>x.id===id); if(!v) return;
  const d = await pedirTexto("Excluir do plano",
    `Informe a data de saída de ${v.nome}. O registro fica no histórico — nada é apagado.`,
    hoje(), "Confirmar exclusão", "date");
  if(!d) return;   // cancelar devolve false, não null
  await salvar("vidas", Object.assign({}, v, { status:"cancelada", saida: d }),
               "Excluiu do plano —");
  toast("Vida excluída do plano");
}
/** Detalhar em lote: cria as linhas que faltam para um contrato que só tem o número. */
function formDetalhar(contratoId){
  const c = contratoPorId(contratoId); if(!c) return "";
  const jaTem = vidasDoContrato(contratoId).length;
  const faltam = Math.max(0, (Number(c.vidas)||0) - jaTem);
  return `
  <div class="m-head"><div><h2>Detalhar vidas</h2>
    <div class="sub">${esc(c.clienteNome)} · ${esc(c.operadora||"")} · ${c.vidas} vida(s) no contrato</div></div></div>
  <div class="m-body">
    <div class="hint" style="margin-bottom:12px">Digite um nome por linha. A primeira vira titular, as demais entram como dependentes — você ajusta depois quem é quem. ${jaTem?`Já existem ${jaTem} vida(s) detalhada(s) neste contrato.`:""}</div>
    <div class="field"><label for="dtNomes">Nomes (um por linha)</label>
      <textarea id="dtNomes" rows="8" placeholder="Maria Aparecida dos Santos&#10;João Pedro dos Santos&#10;Ana Clara dos Santos"></textarea>
      <span class="hint">Faltam ${faltam} para bater com o número do contrato. Pode entrar com mais ou com menos: o contrato passa a valer pelo que estiver aqui.</span></div>
    <div class="field"><label for="dtEntrada">Entrada no plano</label><input id="dtEntrada" type="date" value="${esc(c.inicio||hoje())}"></div>
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarDetalhe" data-id="${esc(contratoId)}">Criar as vidas</button></div>`;
}
async function salvarDetalhe(contratoId){
  const c = contratoPorId(contratoId); if(!c) return;
  const nomes = (val("dtNomes")||"").split("\n").map(x=>x.trim()).filter(Boolean);
  if(!nomes.length){ toast("Digite ao menos um nome."); return; }
  const entrada = val("dtEntrada") || c.inicio || hoje();
  const jaTem = vidasDoContrato(contratoId).length;
  let i = 0;
  for(const nome of nomes){
    const ehTitular = (jaTem===0 && i===0);
    await salvar("vidas", {
      id: uid("vid"), contratoId, clienteId: c.clienteId, nome,
      tipo: ehTitular ? "titular" : "dependente",
      parentesco: ehTitular ? "" : "Outro",
      status:"ativa", entrada, saida:"", doc:"", nascimento:"", carteirinha:"", obs:"",
      criadoEm: hoje()
    }, i===0 ? `Detalhou ${nomes.length} vida(s) de` : null);
    i++;
  }
  fecharModal();
  toast(`${nomes.length} vida(s) criada(s)`);
}

function formDespesa(d){
  d = d || {};
  return `
  <div class="m-head"><div><h2>${d.id?"Editar gasto":"Novo gasto"}</h2>
    <div class="sub">Entra no balanço do mês da data escolhida</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="dsDesc">Descrição</label>
        <input id="dsDesc" type="text" value="${esc(d.descricao||"")}" placeholder="Anúncio Instagram — campanha PME"></div>
      <div class="field" style="max-width:150px"><label for="dsValor">Valor (R$)</label>
        <input id="dsValor" type="number" step="0.01" value="${d.valor||""}" placeholder="0,00"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="dsData">Data</label><input id="dsData" type="date" value="${esc(d.data||hoje())}"></div>
      <div class="field"><label for="dsCat">Categoria</label><select id="dsCat">
        ${(S.config.categoriasDespesa||[]).map(c=>`<option ${d.categoria===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div class="field"><label for="dsForma">Forma de pagamento</label><select id="dsForma">
        ${(S.config.formasPagamento||[]).map(c=>`<option ${d.forma===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="dsForn">Fornecedor</label><input id="dsForn" type="text" value="${esc(d.fornecedor||"")}" placeholder="opcional"></div>
      <div class="field"><label for="dsRec">Gasto fixo</label><select id="dsRec">
        <option value="" ${!d.recorrente?"selected":""}>Não, foi só desta vez</option>
        <option value="1" ${d.recorrente?"selected":""}>Sim, se repete todo mês</option></select>
        <span class="hint">Os fixos podem ser copiados para o mês seguinte com um clique.</span></div>
    </div>
    <div class="field"><label for="dsObs">Observação</label><textarea id="dsObs" placeholder="opcional">${esc(d.obs||"")}</textarea></div>
  </div>
  <div class="m-foot">
    ${d.id?`<button class="btn ghost danger left" data-act="excluirDespesa" data-id="${esc(d.id)}">Excluir</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarDespesa" data-id="${esc(d.id||"")}">Salvar gasto</button>
  </div>`;
}
async function salvarDespesa(id){
  const desc = val("dsDesc"); if(!desc){ toast("Descreva o gasto."); return; }
  const valor = numv("dsValor"); if(!valor){ toast("Informe o valor."); return; }
  const antigo = S.despesas.find(x=>x.id===id) || {};
  const d = Object.assign({}, antigo, {
    id: id || uid("des"), descricao:desc, valor:+valor.toFixed(2), data:val("dsData")||hoje(),
    categoria:val("dsCat"), forma:val("dsForma"), fornecedor:val("dsForn"),
    recorrente: val("dsRec")==="1", obs:val("dsObs"),
    responsavel: antigo.responsavel || S.uid || "", criadoEm: antigo.criadoEm || hoje()
  });
  await salvar("despesas", d);
  S.mesDespesas = d.data.slice(0,7);
  fecharModal(); toast(id?"Gasto atualizado":"Gasto lançado");
}

/* ============================================================
   EQUIPE
   ============================================================ */
function viewEquipe(){
  const mes = mesAtual();
  if(!S.usuarios.length) return vazio("Equipe ainda não formada","Compartilhe o sistema com seus corretores: cada pessoa aparece aqui assim que abrir pela primeira vez.","",'');
  const gestor = S.mePapel==="gestor";
  const pendentes = S.usuarios.filter(u=>statusUsuario(u)==="pendente");
  const bloqueados = S.usuarios.filter(u=>statusUsuario(u)==="bloqueado");
  const ativos = S.usuarios.filter(u=>statusUsuario(u)==="ativo");
  return `
  ${gestor && pendentes.length ? `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip warn">Aguardando liberação</span>
      <div><h3>${pendentes.length} pessoa(s) querendo entrar</h3>
        <div class="sub">Ninguém vê a carteira antes de você liberar</div></div></div>
    <div class="tw"><table><tbody>${pendentes.map(u=>`<tr>
      <td style="width:44px"><span class="avatar">${esc(iniciais(u.nome))}</span></td>
      <td><b>${esc(u.nome)}</b><div class="hint">entrou na fila em ${dt(u.criadoEm)}</div></td>
      <td><select data-act="papelPendente" data-id="${esc(u.id)}" style="padding:5px 8px;font-size:12.5px">
        ${Object.entries(PAPEIS).map(([k,v])=>`<option value="${k}" ${(u.papel||"corretor")===k?"selected":""}>${v}</option>`).join("")}</select>
        <div class="hint">${esc(DESCR_PAPEL[u.papel||"corretor"])}</div></td>
      <td>${S.usuarios.some(x=>x.manual) ? `<select data-act="vinculo" data-id="${esc(u.id)}" style="padding:5px 8px;font-size:12.5px">
          <option value="">Novo cadastro</option>
          ${S.usuarios.filter(x=>x.manual).map(x=>`<option value="${esc(x.id)}">É ${esc(x.nome)}</option>`).join("")}
        </select><div class="hint">vincular a quem já está na equipe</div>` : ""}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn sm primary" data-act="liberarUsuario" data-id="${esc(u.id)}">Liberar</button>
        <button class="btn sm ghost danger" data-act="recusarUsuario" data-id="${esc(u.id)}">Recusar</button></td>
    </tr>`).join("")}</tbody></table></div></section>` : ""}

  ${gestor && bloqueados.length ? `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><span class="chip crit">Suspensos</span>
      <div><h3>${bloqueados.length} acesso(s) suspenso(s)</h3></div></div>
    <div class="tw"><table><tbody>${bloqueados.map(u=>`<tr>
      <td><b>${esc(u.nome)}</b> <span class="hint">${esc(PAPEIS[u.papel]||"")}</span></td>
      <td class="r"><button class="btn sm" data-act="liberarUsuario" data-id="${esc(u.id)}">Reativar</button></td>
    </tr>`).join("")}</tbody></table></div></section>` : ""}

  ${veCorretora()?painelMetas(ativos, mes):""}
  <div class="hint" style="margin-bottom:14px">Cada pessoa entra na equipe ao abrir o sistema pela primeira vez, ou você inclui pelo botão “+ Membro”. O split define quanto da comissão recebida é repassado ao corretor no contrato que ele assina.</div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  ${(gestor?ativos:ativos.filter(u=>u.id===S.uid||S.mePapel==="gestor")).map(u=>{
    const cs = S.contratos.filter(c=>c.corretor===u.id && c.status!=="cancelado");
    const prodMes = cs.filter(c=>(c.inicio||"").slice(0,7)===mes).reduce((a,c)=>a+comissaoContrato(c),0);
    const prodAno = cs.filter(c=>(c.inicio||"").slice(0,4)===mes.slice(0,4)).reduce((a,c)=>a+comissaoContrato(c),0);
    const ps = parcelas().filter(p=>p.corretor===u.id);
    const ganho = ps.filter(p=>p.status==="recebido").reduce((a,p)=>a+p.valorCorretor,0);
    const aReceber = ps.filter(p=>p.status==="previsto").reduce((a,p)=>a+p.valorCorretor,0);
    const at = u.meta ? prodMes/u.meta*100 : 0;
    return `<section class="panel">
      <div class="panel-head">
        <span class="avatar">${esc(iniciais(u.nome))}</span>
        <div><h3>${esc(u.nome)}${u.id===S.uid?' <span class="chip mute">você</span>':""}</h3>
        <div class="sub"><span class="chip ${u.papel==="gestor"?"ok":u.papel==="assistente"?"info":"mute"}">${esc(PAPEIS[u.papel]||"Corretor")}</span>
          split ${pct(u.splitPct??50)}${u.papel==="corretor"&&u.verTudo?' · <span class="chip info">vê a corretora</span>':""}${u.manual?' · <span class="hint">não acessa o sistema</span>':""}</div></div>
        ${gestor?`<div class="right">
          <button class="btn sm" data-act="editarUsuario" data-id="${esc(u.id)}">Editar</button>
          ${u.manual?`<button class="btn sm ghost danger" data-act="excluirMembro" data-id="${esc(u.id)}" aria-label="Remover da equipe">×</button>`:""}</div>`:""}
      </div>
      <div class="chart-wrap">
        <div class="bar-line"><span class="nm">Meta do mês</span>
          <span class="track"><span class="fill" style="width:${Math.min(larg(at,100),100)}%;background:${at>=100?"var(--ok)":at>=60?"var(--gold)":"var(--crit)"}"></span></span>
          <span class="n">${u.meta?pct(at):"sem meta"}</span></div>
        <div class="dl" style="margin-top:12px">
          <div><div class="k">${veCorretora()?"Comissão gerada no mês":"Sua comissão no mês"}</div><div class="v num">${brl(prodMes)}</div></div>
          <div><div class="k">${veCorretora()?"Comissão gerada no ano":"Sua comissão no ano"}</div><div class="v num">${brl(prodAno)}</div></div>
          <div><div class="k">Comissão recebida</div><div class="v num">${brl(ganho)}</div></div>
          <div><div class="k">A receber</div><div class="v num">${brl(aReceber)}</div></div>
        </div>
      </div>
    </section>`;
  }).join("")}</div>`;
}

/** Metas do mês: a da corretora e a soma do que está distribuído entre as pessoas. */
function painelMetas(ativos, mes){
  const gestor = S.mePapel==="gestor";
  const metaCorretora = Number(S.config.metaGlobal)||0;
  const somaIndividual = ativos.reduce((a,u)=>a+(Number(u.meta)||0),0);
  const realizado = S.contratos.filter(c=>c.status!=="cancelado" && (c.inicio||"").slice(0,7)===mes)
    .reduce((a,c)=>a+comissaoContrato(c),0);
  const at = metaCorretora ? realizado/metaCorretora*100 : 0;
  const semMeta = ativos.filter(u=>!(Number(u.meta)>0));
  const diff = somaIndividual - metaCorretora;
  return `<section class="panel" style="margin-bottom:16px">
    <div class="panel-head"><div><h3>Metas de ${mesLabel(mes)}</h3>
      <div class="sub">Comissão gerada pelos contratos iniciados no mês</div></div></div>
    <div class="chart-wrap">
      <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:14px">
        <div class="field"><label for="mtGlobal">Meta da corretora (R$)</label>
          ${gestor
            ? `<input id="mtGlobal" type="number" step="500" value="${metaCorretora}" data-act="salvarMetaGlobal">`
            : `<div class="v num" style="padding-top:7px;font-size:17px;font-weight:600">${brl(metaCorretora)}</div>`}</div>
        <div><div class="k">Realizado</div><div class="v num" style="font-size:20px;font-weight:600;padding-top:4px">${brl(realizado)}</div>
          <div class="hint">${metaCorretora?`${pct(at)} da meta · faltam ${brl(Math.max(0,metaCorretora-realizado))}`:"defina a meta para acompanhar"}</div></div>
        <div><div class="k">Somatório das metas individuais</div>
          <div class="v num" style="font-size:20px;font-weight:600;padding-top:4px">${brl(somaIndividual)}</div>
          <div class="hint">${!metaCorretora ? "&nbsp;" : diff===0 ? "bate com a meta da corretora"
            : diff>0 ? `<span style="color:var(--ok)">${brl(diff)} acima da meta</span>`
            : `<span style="color:var(--warn)">${brl(-diff)} a distribuir</span>`}</div></div>
      </div>
      <div class="bar-line"><span class="nm" style="width:130px">Corretora</span>
        <span class="track" style="height:13px"><span class="fill" style="width:${Math.min(larg(realizado,metaCorretora||realizado||1),100)}%;background:${at>=100?"var(--ok)":at>=60?"var(--gold)":"var(--accent)"}"></span></span>
        <span class="n" style="width:126px">${brl(realizado)}${metaCorretora?` · ${pct(at)}`:""}</span></div>
      ${semMeta.length?`<div class="ta" style="padding:10px 0 0">${semMeta.length} pessoa(s) ainda sem meta: ${semMeta.map(u=>esc(u.nome)).join(", ")}.</div>`:""}
    </div></section>`;
}

/* ============================================================
   RELATÓRIOS
   ============================================================ */
const PERIODOS = {
  mes:      { rot:"Este mês",        de:()=>mesAtual()+"-01",             ate:()=>hoje() },
  mesAnt:   { rot:"Mês passado",     de:()=>addMonths(mesAtual()+"-01",-1), ate:()=>addDays(mesAtual()+"-01",-1) },
  t3:       { rot:"Últimos 3 meses", de:()=>addMonths(hoje(),-3),          ate:()=>hoje() },
  t6:       { rot:"Últimos 6 meses", de:()=>addMonths(hoje(),-6),          ate:()=>hoje() },
  t12:      { rot:"Últimos 12 meses",de:()=>addMonths(hoje(),-12),         ate:()=>hoje() },
  ano:      { rot:"Este ano",        de:()=>hoje().slice(0,4)+"-01-01",    ate:()=>hoje() },
  anoAnt:   { rot:"Ano passado",     de:()=>(+hoje().slice(0,4)-1)+"-01-01", ate:()=>(+hoje().slice(0,4)-1)+"-12-31" },
  tudo:     { rot:"Todo o período",  de:()=>"1900-01-01",                  ate:()=>"2999-12-31" },
  custom:   { rot:"Personalizado",   de:()=>S.filtros.de||"1900-01-01",    ate:()=>S.filtros.ate||"2999-12-31" }
};
/** Intervalo em vigor nos relatórios, já resolvido em datas. */
function janela(){
  const k = S.filtros.periodo || "t12";
  const P = PERIODOS[k] || PERIODOS.t12;
  return { chave:k, rot:P.rot, de:P.de(), ate:P.ate() };
}
/** Contratos que passam por todos os filtros do relatório. */
function contratosFiltrados(){
  const f = S.filtros, j = janela();
  return S.contratos.filter(c=>c.status!=="cancelado" && noEscopo(c,"corretor"))
    .filter(c=>(c.inicio||"") >= j.de && (c.inicio||"") <= j.ate)
    .filter(c=>!f.pilar     || c.pilar===f.pilar)
    .filter(c=>!f.tipoPlano || tipoPlano(c)===f.tipoPlano)
    .filter(c=>!f.operadora || c.operadora===f.operadora)
    .filter(c=>!f.corretor  || c.corretor===f.corretor);
}
function leadsFiltrados(){
  const f = S.filtros, j = janela();
  return S.leads.filter(l=>noEscopo(l))
    .filter(l=>(l.criadoEm||"") >= j.de && (l.criadoEm||"") <= j.ate)
    .filter(l=>!f.pilar    || l.pilar===f.pilar)
    .filter(l=>!f.corretor || l.responsavel===f.corretor);
}
function filtrosRelatorio(){
  const f = S.filtros, j = janela();
  const operadoras = [...new Set(S.contratos.map(c=>c.operadora).filter(Boolean))].sort();
  return `
  <div class="filters">
    <div class="field"><label for="rPeriodo">Período</label><select id="rPeriodo" data-act="filtro" data-k="periodo">
      ${Object.entries(PERIODOS).map(([k,v])=>`<option value="${k}" ${j.chave===k?"selected":""}>${esc(v.rot)}</option>`).join("")}</select></div>
    ${j.chave==="custom"?`
      <div class="field"><label for="rDe">De</label><input id="rDe" type="date" value="${esc(f.de||addMonths(hoje(),-12))}" data-act="filtro" data-k="de"></div>
      <div class="field"><label for="rAte">Até</label><input id="rAte" type="date" value="${esc(f.ate||hoje())}" data-act="filtro" data-k="ate"></div>`:""}
    <div class="field"><label for="rPilar">Pilar</label><select id="rPilar" data-act="filtro" data-k="pilar">
      <option value="">Todos</option>${PK.map(x=>`<option value="${x}" ${f.pilar===x?"selected":""}>${PILARES[x].curto}</option>`).join("")}</select></div>
    <div class="field"><label for="rTipo">Tipo de plano</label><select id="rTipo" data-act="filtro" data-k="tipoPlano">
      <option value="">Todos</option>${(S.config.tiposPlano||[]).map(t=>`<option ${f.tipoPlano===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="field"><label for="rOp">Operadora</label><select id="rOp" data-act="filtro" data-k="operadora">
      <option value="">Todas</option>${operadoras.map(o=>`<option ${f.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    <div class="field"><label for="rCor">Corretor</label><select id="rCor" data-act="filtro" data-k="corretor">
      <option value="">Todos</option>${S.usuarios.map(u=>`<option value="${esc(u.id)}" ${f.corretor===u.id?"selected":""}>${esc(u.nome)}</option>`).join("")}</select></div>
    ${Object.keys(f).length?`<button class="btn ghost" data-act="limparFiltros">Limpar filtros</button>`:""}
    <button class="btn" style="margin-left:auto" data-act="baixarRel">Baixar em Excel ou PDF</button>
  </div>`;
}
/* ============================================================
   RELATÓRIOS PARA BAIXAR (Excel e PDF)
   Cada relatório é montado uma vez, num formato neutro (colunas com
   tipo + linhas), e os dois geradores leem desse mesmo modelo. As
   regras de acesso da tela valem aqui: o corretor só vê a carteira
   dele e a parte dele da comissão; o assistente não vê comissão.
   ============================================================ */
const REL_PERIODOS = {
  tudo:   { rot:"Todo o período",    de:()=>"1900-01-01", ate:()=>"2999-12-31" },
  mes:    { rot:"Este mês",          de:()=>mesAtual()+"-01", ate:()=>addDays(addMonths(mesAtual()+"-01",1),-1) },
  mesAnt: { rot:"Mês passado",       de:()=>addMonths(mesAtual()+"-01",-1), ate:()=>addDays(mesAtual()+"-01",-1) },
  t3:     { rot:"Últimos 3 meses",   de:()=>addMonths(hoje(),-3),  ate:()=>hoje() },
  t6:     { rot:"Últimos 6 meses",   de:()=>addMonths(hoje(),-6),  ate:()=>hoje() },
  t12:    { rot:"Últimos 12 meses",  de:()=>addMonths(hoje(),-12), ate:()=>hoje() },
  ano:    { rot:"Este ano",          de:()=>hoje().slice(0,4)+"-01-01", ate:()=>hoje().slice(0,4)+"-12-31" },
  anoAnt: { rot:"Ano passado",       de:()=>(+hoje().slice(0,4)-1)+"-01-01", ate:()=>(+hoje().slice(0,4)-1)+"-12-31" },
  p3:     { rot:"Próximos 3 meses",  de:()=>hoje(), ate:()=>addMonths(hoje(),3) },
  p6:     { rot:"Próximos 6 meses",  de:()=>hoje(), ate:()=>addMonths(hoje(),6) },
  p12:    { rot:"Próximos 12 meses", de:()=>hoje(), ate:()=>addMonths(hoje(),12) },
  custom: { rot:"Escolher datas",    de:()=>(S.rel&&S.rel.de)||"1900-01-01", ate:()=>(S.rel&&S.rel.ate)||"2999-12-31" }
};
const PER_PASSADO = ["tudo","mes","mesAnt","t3","t6","t12","ano","anoAnt","custom"];
const PER_COMISSAO = ["p3","p6","p12","mes","mesAnt","t3","t6","t12","ano","anoAnt","tudo","custom"];
const REL_TIPOS = {
  carteira:     { nome:"Carteira de clientes", desc:"Cadastro, produtos, vidas e comissão de cada cliente",
                  filtros:["periodo","pilar","corretor","situacao"], periodos:PER_PASSADO, periodo:"tudo", periodoRot:"Clientes desde" },
  contratos:    { nome:"Contratos", desc:"Propostas, apólices e cotas, com vigência e valores",
                  filtros:["periodo","pilar","operadora","corretor","situacao"], periodos:PER_PASSADO, periodo:"tudo", periodoRot:"Início da vigência", situacao:"vivos" },
  vidas:        { nome:"Vidas e cotas", desc:"Quem está coberto em saúde e proteção, e as cotas de consórcio",
                  filtros:["conteudo","pilar","operadora","corretor","situacao"], situacao:"ativas", conteudo:"ambos" },
  comissoes:    { nome:"Comissões", desc:"Cada parcela com a data prevista de recebimento, imposto e situação",
                  filtros:["periodo","pilar","operadora","corretor","situacao","tipoParcela"], periodos:PER_COMISSAO, periodo:"p12", periodoRot:"Data prevista", comissao:true },
  previsao:     { nome:"Previsão de comissões", desc:"Os próximos 12 meses: contratado mais as vendas novas",
                  filtros:["pilar","corretor","modo"], comissao:true },
  cancelamentos:{ nome:"Cancelamentos", desc:"Contratos cancelados, motivo e vidas que saíram",
                  filtros:["periodo","pilar","operadora","corretor"], periodos:PER_PASSADO, periodo:"t12", periodoRot:"Data do cancelamento" },
  producao:     { nome:"Produção por corretor", desc:"Contratos, vidas, base e comissão gerada por pessoa",
                  filtros:["periodo","pilar"], periodos:PER_PASSADO, periodo:"t12", periodoRot:"Início da vigência", comissao:true }
};
const relDisponivel = k => !(REL_TIPOS[k].comissao && ocultaComissao());
function relPadrao(tipo, pre){
  const T = REL_TIPOS[tipo] || REL_TIPOS.carteira;
  return Object.assign({ tipo, periodo:T.periodo||"tudo", de:"", ate:"", pilar:"", operadora:"", corretor:"",
    situacao:T.situacao||"", tipoParcela:"", conteudo:T.conteudo||"ambos", modo:"",
    formato:(S.rel && S.rel.formato) || "xlsx" }, pre||{});
}
function relJanela(r){
  const T = REL_TIPOS[r.tipo];
  if(!T.periodos) return null;
  const P = REL_PERIODOS[r.periodo] || REL_PERIODOS.tudo;
  return { rot:P.rot, de:P.de(), ate:P.ate(), chave:r.periodo };
}
const docVisivel = d => !d ? "" : (S.mePapel==="gestor" ? d : mascararDoc(d));
const NOME_SIT_CLIENTE = { ativo:"Ativo", prospecto:"Prospecto", inativo:"Inativo", encerrado:"Encerrado" };
const CONTEMPLACAO = { "":"Não contemplada", sorteio:"Sorteio", lance:"Lance" };
function opcoesSituacao(tipo){
  if(tipo==="carteira") return [["","Todas"]].concat(Object.entries(NOME_SIT_CLIENTE));
  if(tipo==="contratos") return [["vivos","Sem os cancelados"],["","Todas, inclusive canceladas"]].concat(Object.entries(STATUS_CONTRATO).map(([k,v])=>[k,v.nome]));
  if(tipo==="vidas") return [["ativas","Só ativas"],["","Todas, inclusive as que saíram"]];
  if(tipo==="comissoes") return [["","Todas"],["abertas","A receber (previstas e atrasadas)"],["atrasado","Em atraso"]]
    .concat(Object.entries(STATUS_COM).filter(([k])=>k!=="atrasado").map(([k,v])=>[k,v.nome]));
  return [];
}
function textoFiltrosRel(r){
  const T = REL_TIPOS[r.tipo], j = relJanela(r), p = [];
  if(j) p.push(`${T.periodoRot}: ${j.chave==="tudo" ? "todo o período" : j.chave==="custom" ? `${dt(j.de)} a ${dt(j.ate)}` : `${j.rot.toLowerCase()} (${dt(j.de)} a ${dt(j.ate)})`}`);
  if(r.tipo==="vidas" && r.conteudo!=="ambos") p.push(r.conteudo==="vidas" ? "só vidas" : "só cotas");
  if(r.pilar) p.push(PILARES[r.pilar].nome);
  if(r.operadora) p.push(r.operadora);
  if(r.corretor) p.push(nomeUsuario(r.corretor));
  const sit = opcoesSituacao(r.tipo).find(o=>o[0]===r.situacao);
  if(sit && r.situacao) p.push(sit[1]);
  if(r.tipoParcela) p.push(tipoP(r.tipoParcela).nome);
  if(r.tipo==="previsao") p.push("vendas novas: " + NOME_MODO[r.modo || modoPrevisao()].toLowerCase());
  if(escopoTravado()) p.push("sua carteira");
  else if(S.escopo==="meu") p.push("minha carteira");
  return p.length ? "Filtros: " + p.join(" · ") : "Sem filtros — tudo o que você enxerga no sistema";
}
const dentro = (d, j) => !j || (!!d && d.slice(0,10) >= j.de && d.slice(0,10) <= j.ate);

/** Monta o relatório no modelo neutro. Não desenha nada. */
function montarRelatorio(r){
  const T = REL_TIPOS[r.tipo], j = relJanela(r);
  const comCom = !ocultaComissao(), gestorVe = veCorretora();
  const rotCom = gestorVe ? "Comissão" : "Sua comissão";
  const rel = { tipo:r.tipo, titulo:T.nome, filtrosTexto:textoFiltrosRel(r),
    geradoEm: new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}).replace(", "," às "),
    geradoPor: S.meNome||"", folhas:[], resumo:[] };
  if(!gestorVe && comCom && T.comissao) rel.nota = "Os valores de comissão deste relatório são a sua parte — o que fica com a corretora não aparece aqui.";
  const passaCtr = c => noEscopo(c,"corretor") && (!r.pilar || c.pilar===r.pilar) && (!r.operadora || c.operadora===r.operadora) && (!r.corretor || c.corretor===r.corretor);

  if(r.tipo==="carteira"){
    const cs = S.clientes.filter(c=>noEscopo(c))
      .filter(c=>dentro(c.criadoEm, j))
      .filter(c=>!r.corretor || c.responsavel===r.corretor)
      .filter(c=>!r.situacao || (c.status||"ativo")===r.situacao)
      .filter(c=>!r.pilar || contratosDoCliente(c.id).some(x=>x.pilar===r.pilar && x.status!=="cancelado"))
      .sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"));
    const colunas = [
      {t:"Cliente",f:"texto",max:40},{t:"Tipo",f:"texto",min:5},{t:"CPF / CNPJ",f:"texto"},{t:"Situação",f:"texto"},
      {t:"Nascimento / fundação",f:"data"},{t:"Contato principal",f:"texto",max:30},{t:"Telefone",f:"texto"},{t:"WhatsApp",f:"texto"},
      {t:"E-mail",f:"texto",max:34},{t:"Cidade / UF",f:"texto",max:26},{t:"Produtos",f:"texto",max:30},
      {t:"Contratos ativos",f:"int"},{t:"Vidas ativas",f:"int"},{t:"Base contratada",f:"moeda"}]
      .concat(comCom?[{t:rotCom,f:"moeda"}]:[])
      .concat([{t:"Responsável",f:"texto",max:24},{t:"Cliente desde",f:"data"}]);
    const linhas = cs.map(c=>{
      const vivos = contratosDoCliente(c.id).filter(x=>x.status!=="cancelado" && noEscopo(x,"corretor"));
      const vidas = vidasAtivas(vidasDoCliente(c.id)).length
        + vivos.filter(x=>contratoTemVida(x) && !vidasDetalhadas(x)).reduce((a,x)=>a+(Number(x.vidas)||0),0);
      return [c.nome, c.tipo||"", docVisivel(c.doc), NOME_SIT_CLIENTE[c.status||"ativo"]||c.status, c.nascimento||"",
        c.contatoNome ? c.contatoNome + (c.contatoNascimento?` (${dt(c.contatoNascimento).slice(0,5)})`:"") : "",
        c.telefone||"", c.whatsapp||"", c.email||"", [c.cidade,c.uf].filter(Boolean).join("/"),
        [...new Set(vivos.map(x=>PILARES[x.pilar].curto))].join(", "),
        vivos.length, vidas, vivos.reduce((a,x)=>a+(Number(x.valorBase)||0),0)]
        .concat(comCom?[receitaCliente(c)]:[])
        .concat([nomeUsuario(c.responsavel), c.criadoEm||""]);
    });
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    const total = colunas.map((c,i)=> i===0 ? `Total · ${linhas.length} cliente(s)` : (["int","moeda"].includes(c.f) ? soma(i) : ""));
    rel.folhas.push({ nome:"Clientes", colunas, linhas, total });
    rel.resumo = [{k:"Clientes", v:linhas.length.toLocaleString("pt-BR")},
      {k:"Contratos ativos", v:soma(11).toLocaleString("pt-BR")}, {k:"Vidas ativas", v:soma(12).toLocaleString("pt-BR")},
      {k:"Base contratada", v:brl(soma(13))}].concat(comCom?[{k:rotCom, v:brl(soma(14))}]:[]);
  }

  else if(r.tipo==="contratos"){
    const cs = S.contratos.filter(passaCtr)
      .filter(c=>dentro(c.inicio, j))
      .filter(c=> r.situacao==="vivos" ? c.status!=="cancelado" : (!r.situacao || c.status===r.situacao))
      .sort((a,b)=>(a.clienteNome||"").localeCompare(b.clienteNome||"","pt-BR") || (a.inicio||"").localeCompare(b.inicio||""));
    const colunas = [{t:"Cliente",f:"texto",max:36},{t:"Pilar",f:"texto"},{t:"Produto",f:"texto",max:24},{t:"Operadora",f:"texto",max:22},
      {t:"Nº proposta / apólice",f:"texto"},{t:"Situação",f:"texto"},{t:"Início",f:"data"},{t:"Fim",f:"data"},
      {t:"Mensalidade / prêmio / crédito",f:"moeda"},{t:"Valor do contrato",f:"moeda"},{t:"Vidas",f:"int"},{t:"Grupo / cota",f:"texto"},
      {t:"Corretor",f:"texto",max:22}]
      .concat(comCom?[{t:rotCom+" total",f:"moeda"},{t:"Já recebida",f:"moeda"}]:[]);
    const linhas = cs.map(c=>{
      const rec = (c.comissoes||[]).filter(p=>p.status==="recebido").reduce((a,p)=>a+(Number(p.valorRecebido??p.valor)||0)*(gestorVe?1:fatorCorretor(p,c)),0);
      return [c.clienteNome||"", PILARES[c.pilar]?.curto||"", c.produto||"", c.operadora||"",
        c.apolice||c.numero||"", (STATUS_CONTRATO[c.status]||{}).nome||c.status||"", c.inicio||"", c.fim||"",
        Number(c.valorBase)||0, Number(c.valorTotal)||null, contratoTemVida(c) ? totalVidas(c) : null,
        c.pilar==="consorcios" ? [c.grupo, c.cota].filter(Boolean).join(" / ") : "",
        nomeUsuario(c.corretor)]
        .concat(comCom?[comissaoContrato(c), +rec.toFixed(2)]:[]);
    });
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    const total = colunas.map((c,i)=> i===0 ? `Total · ${linhas.length} contrato(s)` : (["int","moeda"].includes(c.f) ? soma(i) : ""));
    rel.folhas.push({ nome:"Contratos", colunas, linhas, total });
    rel.resumo = [{k:"Contratos", v:linhas.length.toLocaleString("pt-BR")}, {k:"Vidas", v:soma(10).toLocaleString("pt-BR")},
      {k:"Base contratada", v:brl(soma(8))}].concat(comCom?[{k:rotCom, v:brl(soma(13))}]:[]);
  }

  else if(r.tipo==="vidas"){
    if(r.conteudo!=="cotas"){
      const vs = vidasNoEscopo().filter(v=>{
        const c = contratoPorId(v.contratoId); if(!c) return false;
        if(r.pilar && c.pilar!==r.pilar) return false;
        if(r.operadora && c.operadora!==r.operadora) return false;
        if(r.corretor && c.corretor!==r.corretor) return false;
        return r.situacao==="ativas" ? vidaConta(v) : true;
      }).sort((a,b)=>{ const ca=contratoPorId(a.contratoId), cb=contratoPorId(b.contratoId);
        return (ca.clienteNome||"").localeCompare(cb.clienteNome||"","pt-BR") || ((a.tipo||"titular")==="titular"?0:1)-((b.tipo||"titular")==="titular"?0:1) || (a.nome||"").localeCompare(b.nome||"","pt-BR"); });
      const colunas = [{t:"Nome",f:"texto",max:34},{t:"Tipo",f:"texto"},{t:"Parentesco",f:"texto"},{t:"CPF",f:"texto"},
        {t:"Nascimento",f:"data"},{t:"Idade",f:"int",min:6},{t:"Faixa ANS",f:"texto"},{t:"Situação",f:"texto"},
        {t:"Entrada",f:"data"},{t:"Saída",f:"data"},{t:"Cliente",f:"texto",max:32},{t:"Pilar",f:"texto"},
        {t:"Operadora",f:"texto",max:22},{t:"Produto",f:"texto",max:22},{t:"Corretor",f:"texto",max:22},{t:"Carteirinha",f:"texto"}];
      const linhas = vs.map(v=>{ const c = contratoPorId(v.contratoId);
        const idade = v.nascimento ? idadeEm(v.nascimento) : null;
        const fx = idade!=null && c.pilar==="saude" ? FAIXAS_ANS[faixaANS(idade)] : null;
        return [v.nome||"", TIPO_VIDA[v.tipo||"titular"], v.parentesco||"", docVisivel(v.doc), v.nascimento||"", idade,
          fx?fx.rot:"", SV(v.status).nome, v.entrada||"", v.saida||"", c.clienteNome||"", PILARES[c.pilar].curto,
          c.operadora||"", c.produto||"", nomeUsuario(c.corretor), v.carteirinha||""]; });
      rel.folhas.push({ nome:"Vidas", titulo:"Vidas", colunas, linhas, total:null,
        rodape: contratosSemDetalhe().length ? `${contratosSemDetalhe().length} contrato(s) ainda trazem só o número de vidas, sem os nomes — detalhe-os na aba Vidas e cotas.` : "" });
      rel.resumo.push({k:"Vidas ativas", v:vs.filter(vidaConta).length.toLocaleString("pt-BR")},
        {k:"Titulares", v:vs.filter(v=>vidaConta(v) && (v.tipo||"titular")==="titular").length.toLocaleString("pt-BR")});
    }
    if(r.conteudo!=="vidas" && (!r.pilar || r.pilar==="consorcios")){
      const cs = cotasNoEscopo().filter(c=>(!r.operadora || c.operadora===r.operadora) && (!r.corretor || c.corretor===r.corretor))
        .filter(c=> r.situacao==="ativas" ? c.status!=="cancelado" : true)
        .sort((a,b)=>(a.clienteNome||"").localeCompare(b.clienteNome||"","pt-BR"));
      const colunas = [{t:"Cliente",f:"texto",max:34},{t:"Administradora",f:"texto",max:22},{t:"Grupo",f:"texto"},{t:"Cota",f:"texto"},
        {t:"Bem",f:"texto"},{t:"Crédito",f:"moeda"},{t:"Parcela mensal",f:"moeda"},{t:"Prazo (meses)",f:"int"},{t:"Início",f:"data"},
        {t:"Contemplação",f:"texto"},{t:"Contemplada em",f:"data"},{t:"Situação",f:"texto"},{t:"Corretor",f:"texto",max:22}];
      const linhas = cs.map(c=>[c.clienteNome||"", c.operadora||"", c.grupo||"", c.cota||"", c.bem||c.produto||"",
        Number(c.valorBase)||0, Number(c.valorParcela)||null, Number(c.prazoMeses)||null, c.inicio||"",
        CONTEMPLACAO[c.contemplado||""]||c.contemplado, c.contempladoEm||"", (STATUS_CONTRATO[c.status]||{}).nome||"", nomeUsuario(c.corretor)]);
      const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
      rel.folhas.push({ nome:"Cotas de consórcio", titulo:"Cotas de consórcio", colunas, linhas,
        total: colunas.map((c,i)=> i===0 ? `Total · ${linhas.length} cota(s)` : (c.f==="moeda" ? soma(i) : "")) });
      rel.resumo.push({k:"Cotas", v:linhas.length.toLocaleString("pt-BR")}, {k:"Crédito em cotas", v:brl(soma(5))},
        {k:"Contempladas", v:cs.filter(c=>c.contemplado).length.toLocaleString("pt-BR")});
    }
    if(!rel.folhas.length) rel.folhas.push({ nome:"Vidas", colunas:[{t:"—",f:"texto"}], linhas:[], vazio:"O filtro escolhido não tem vidas nem cotas." });
    rel.titulo = r.conteudo==="vidas" ? "Carteira de vidas" : r.conteudo==="cotas" ? "Cotas de consórcio" : "Carteira de vidas e cotas";
  }

  else if(r.tipo==="comissoes"){
    let ps = parcelas().filter(p=>noEscopo(p,"corretor"))
      .filter(p=>(!r.pilar || p.pilar===r.pilar) && (!r.operadora || p.operadora===r.operadora) && (!r.corretor || p.corretor===r.corretor))
      .filter(p=>dentro(p.vence, j))
      .filter(p=>!r.tipoParcela || p.tipo===r.tipoParcela);
    if(r.situacao==="atrasado") ps = ps.filter(p=>p.vencida);
    else if(r.situacao==="abertas") ps = ps.filter(p=>p.status==="previsto");
    else if(r.situacao) ps = ps.filter(p=>p.status===r.situacao && !(r.situacao==="previsto" && p.vencida));
    ps = ps.slice().sort((a,b)=>a.vence.localeCompare(b.vence) || (a.cliente||"").localeCompare(b.cliente||"","pt-BR"));
    const sit = p => p.vencida ? "Em atraso" : (STATUS_COM[p.status]||{}).nome || p.status;
    const valor = p => p.status==="recebido" ? efetivoVis(p) : valorVis(p);
    let colunas, linhas;
    if(gestorVe){
      colunas = [{t:"Data prevista",f:"data"},{t:"Cliente",f:"texto",max:32},{t:"Pilar",f:"texto"},{t:"Consórcio",f:"texto",min:9},
        {t:"Operadora",f:"texto",max:20},{t:"Tipo",f:"texto"},{t:"Parcela",f:"texto",min:7},{t:"Valor bruto",f:"moeda"},
        {t:"Imposto %",f:"pct"},{t:"Imposto",f:"moeda"},{t:"Corretor (repasse)",f:"moeda"},{t:"Corretora líquido",f:"moeda"},
        {t:"Situação",f:"texto"},{t:"Recebida em",f:"data"},{t:"Corretor",f:"texto",max:20}];
      linhas = ps.map(p=>[p.vence, p.cliente||"", PILARES[p.pilar].curto, p.pilar==="consorcios"?"Consórcio":"",
        p.operadora||"", tipoP(p.tipo).nome, `${p.n}/${p.contrato.comissoes.length}`, p.efetivo, p.aliquota||0, p.imposto,
        p.valorCorretor, p.valorCorretora, sit(p), p.recebidoEm||"", nomeUsuario(p.corretor)]);
    } else {
      colunas = [{t:"Data prevista",f:"data"},{t:"Cliente",f:"texto",max:32},{t:"Pilar",f:"texto"},{t:"Consórcio",f:"texto",min:9},
        {t:"Operadora",f:"texto",max:20},{t:"Tipo",f:"texto"},{t:"Parcela",f:"texto",min:7},{t:"Sua comissão",f:"moeda"},
        {t:"Situação",f:"texto"},{t:"Recebida em",f:"data"}];
      linhas = ps.map(p=>[p.vence, p.cliente||"", PILARES[p.pilar].curto, p.pilar==="consorcios"?"Consórcio":"",
        p.operadora||"", tipoP(p.tipo).nome, `${p.n}/${p.contrato.comissoes.length}`, valor(p), sit(p), p.recebidoEm||""]);
    }
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    const total = colunas.map((c,i)=> i===0 ? "Total" : i===1 ? `${linhas.length} parcela(s)` : (c.f==="moeda" ? soma(i) : ""));
    rel.folhas.push({ nome:"Parcelas", titulo:"Parcelas de comissão", colunas, linhas, total });
    // resumo por mês
    const porMes = {};
    ps.forEach(p=>{ const m = porMes[p.mes] = porMes[p.mes] || { n:0, prev:0, rec:0, atr:0, imp:0, cons:0 };
      m.n++; const v = valor(p);
      if(p.status==="recebido") m.rec += v; else if(p.vencida) m.atr += v; else if(p.status==="previsto") m.prev += v;
      if(p.pilar==="consorcios") m.cons += v;
      if(gestorVe) m.imp += p.imposto; });
    const colM = [{t:"Mês",f:"texto"},{t:"Parcelas",f:"int"},{t:"A receber",f:"moeda"},{t:"Em atraso",f:"moeda"},{t:"Recebido",f:"moeda"},{t:"Dos quais consórcio",f:"moeda"}]
      .concat(gestorVe?[{t:"Imposto",f:"moeda"}]:[]);
    const linM = Object.keys(porMes).sort().map(m=>{ const x = porMes[m];
      return [mesLabel(m), x.n, x.prev, x.atr, x.rec, x.cons].concat(gestorVe?[x.imp]:[]); });
    const somaM = i => linM.reduce((a,l)=>a+(Number(l[i])||0),0);
    rel.folhas.push({ nome:"Resumo por mês", titulo:"Resumo por mês", colunas:colM, linhas:linM,
      total: colM.map((c,i)=> i===0 ? "Total" : (["int","moeda"].includes(c.f) ? somaM(i) : "")) });
    rel.resumo = [{k:gestorVe?"Total no filtro":"Sua parte no filtro", v:brl(soma(7)), d:`${linhas.length} parcela(s)`},
      {k:"A receber", v:brl(somaM(2))}, {k:"Em atraso", v:brl(somaM(3))}, {k:"Recebido", v:brl(somaM(4))}]
      .concat(gestorVe && somaM(6)>0 ? [{k:"Impostos", v:brl(somaM(6))}] : []);
    rel.orientacao = "paisagem";
  }

  else if(r.tipo==="previsao"){
    const P = previsaoComissoes({ pilar:r.pilar, corretor:r.corretor });
    const modo = r.modo || modoPrevisao(P);
    const nova = l => modo==="nenhum" ? 0 : (modo==="funil" ? l.funil : l.ritmo);
    const colunas = [{t:"Mês",f:"texto"},{t:"Já recebido",f:"moeda"},{t:"Contratado",f:"moeda"},{t:"Parcelas",f:"int"},
      {t:"Funil ponderado",f:"moeda"},{t:"Ritmo de vendas",f:"moeda"},{t:"Previsão ("+NOME_MODO[modo].toLowerCase()+")",f:"moeda"}]
      .concat(gestorVe?[{t:"Imposto estimado",f:"moeda"},{t:"Líquido estimado",f:"moeda"}]:[]);
    const linhas = P.linhas.map(l=>{ const t = l.real+l.firme+nova(l), imp = l.imposto + nova(l)*P.aliqPadrao/100;
      return [mesLabel(l.mes), l.real, l.firme, l.parcelas, l.funil, l.ritmo, t].concat(gestorVe?[imp, t-imp]:[]); });
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    rel.folhas.push({ nome:"Previsão 12 meses", titulo:"Mês a mês", colunas, linhas,
      total: colunas.map((c,i)=> i===0 ? "12 meses" : (["int","moeda"].includes(c.f) ? soma(i) : "")),
      rodape: modo==="ritmo"
        ? `Ritmo: média de ${brl(P.ritmo.mensal)} de comissão nova por mês nos últimos 6 meses (${P.ritmo.contratosMes.toLocaleString("pt-BR",{maximumFractionDigits:1})} contrato(s)/mês), distribuída pela curva de pagamento da carteira. Funil e ritmo estimam a mesma coisa — as vendas futuras — e não se somam.`
        : modo==="funil" ? `Funil: ${P.leads} lead(s) aberto(s), pela régua prevista e pela chance da etapa. Funil e ritmo estimam a mesma coisa e não se somam.`
        : "Somente parcelas já lançadas nos contratos." });
    rel.folhas.push({ nome:"Por pilar", titulo:"Contratado por pilar", colunas:[{t:"Mês",f:"texto"}].concat(PK.map(k=>({t:PILARES[k].nome,f:"moeda"}))),
      linhas: P.linhas.map(l=>[mesLabel(l.mes)].concat(PK.map(k=>l.porPilar[k]||0))),
      total: ["12 meses"].concat(PK.map(k=>P.linhas.reduce((a,l)=>a+(l.porPilar[k]||0),0))) });
    const t12 = soma(6), firme = soma(1)+soma(2);
    rel.resumo = [{k:"Próximos 12 meses", v:brl(t12)}, {k:"Próximos 3 meses", v:brl(linhas.slice(0,3).reduce((a,l)=>a+l[6],0))},
      {k:"Já contratado", v:pct(t12?firme/t12*100:0)}, {k:"Em atraso (fora)", v:brl(P.atrasado)}]
      .concat(gestorVe && soma(7)>0 ? [{k:"Líquido estimado", v:brl(soma(8))}] : []);
    rel.grafico = { rotulos: P.linhas.map(l=>mesLabel(l.mes)), series: [
      { nome:"Recebido", cor:"#A3A8A4", valores:P.linhas.map(l=>l.real) },
      { nome:"Contratado", cor:"#1B7F4E", valores:P.linhas.map(l=>l.firme) }]
      .concat(modo!=="nenhum"?[{ nome:NOME_MODO[modo]+" (estimativa)", cor:"#B8840C", valores:P.linhas.map(nova) }]:[]) };
  }

  else if(r.tipo==="cancelamentos"){
    const cs = S.contratos.filter(c=>c.status==="cancelado" && passaCtr(c))
      .map(c=>({ c, quando:c.canceladoEm || (c.atualizadoEm||"").slice(0,10) }))
      .filter(x=>dentro(x.quando, j))
      .sort((a,b)=>b.quando.localeCompare(a.quando));
    const vidasDe = c => contratoTemVida(c) ? (vidasDoContrato(c.id).length || Number(c.vidas)||0) : 0;
    const colunas = [{t:"Cancelado em",f:"data"},{t:"Cliente",f:"texto",max:34},{t:"Pilar",f:"texto"},{t:"Produto",f:"texto",max:22},
      {t:"Operadora",f:"texto",max:22},{t:"Motivo",f:"texto",max:34},{t:"Vidas",f:"int"},{t:"Mensalidade / prêmio / crédito",f:"moeda"},
      {t:"Início",f:"data"},{t:"Corretor",f:"texto",max:22}];
    const linhas = cs.map(({c,quando})=>[quando, c.clienteNome||"", PILARES[c.pilar].curto, c.produto||"", c.operadora||"",
      c.motivoCancelamento||"Não informado", vidasDe(c), Number(c.valorBase)||0, c.inicio||"", nomeUsuario(c.corretor)]);
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    rel.folhas.push({ nome:"Cancelamentos", colunas, linhas, total: colunas.map((c,i)=> i===0 ? "Total" : i===1 ? `${linhas.length} contrato(s)` : (["int","moeda"].includes(c.f)?soma(i):"")) });
    const mot = {}; linhas.forEach(l=>{ const m = mot[l[5]] = mot[l[5]] || {n:0,v:0,b:0}; m.n++; m.v+=l[6]; m.b+=l[7]; });
    const linM = Object.entries(mot).sort((a,b)=>b[1].n-a[1].n).map(([k,m])=>[k, m.n, m.v, m.b, linhas.length?m.n/linhas.length*100:0]);
    rel.folhas.push({ nome:"Por motivo", titulo:"Por motivo", colunas:[{t:"Motivo",f:"texto",max:40},{t:"Contratos",f:"int"},{t:"Vidas",f:"int"},{t:"Base perdida",f:"moeda"},{t:"Participação",f:"pct"}],
      linhas:linM, total:["Total", linhas.length, soma(6), soma(7), linhas.length?100:0] });
    rel.resumo = [{k:"Cancelamentos", v:linhas.length.toLocaleString("pt-BR")}, {k:"Vidas que saíram", v:soma(6).toLocaleString("pt-BR")},
      {k:"Base perdida", v:brl(soma(7))}, {k:"Principal motivo", v:linM.length?linM[0][0]:"—"}];
  }

  else if(r.tipo==="producao"){
    const cs = S.contratos.filter(c=>c.status!=="cancelado" && noEscopo(c,"corretor") && (!r.pilar || c.pilar===r.pilar) && dentro(c.inicio, j));
    const pessoas = {};
    cs.forEach(c=>{ const k = c.corretor||""; const x = pessoas[k] = pessoas[k] || { n:0, vidas:0, base:0, com:0, saude:0, seguros:0, consorcios:0 };
      x.n++; x.vidas += totalVidas(c); x.base += Number(c.valorBase)||0; x.com += comissaoContrato(c); x[c.pilar]++; });
    const ps = parcelas().filter(p=>noEscopo(p,"corretor") && (!r.pilar || p.pilar===r.pilar));
    const receb = {}, aRec = {};
    ps.forEach(p=>{ const k = p.corretor||"";
      if(p.status==="recebido" && dentro(p.recebidoEm||p.vence, j)) receb[k] = (receb[k]||0) + efetivoVis(p);
      if(p.status==="previsto") aRec[k] = (aRec[k]||0) + valorVis(p); });
    const chaves = [...new Set(Object.keys(pessoas).concat(Object.keys(receb)))];
    const colunas = [{t:"Corretor",f:"texto",max:28},{t:"Contratos",f:"int"},{t:"Saúde",f:"int"},{t:"Proteção",f:"int"},{t:"Patrimônio",f:"int"},
      {t:"Vidas",f:"int"},{t:"Base contratada",f:"moeda"},{t:rotCom+" gerada",f:"moeda"},{t:"Recebida no período",f:"moeda"},{t:"A receber",f:"moeda"}];
    const linhas = chaves.map(k=>{ const x = pessoas[k] || { n:0, vidas:0, base:0, com:0, saude:0, seguros:0, consorcios:0 };
      return [k ? nomeUsuario(k) : "Sem corretor", x.n, x.saude, x.seguros, x.consorcios, x.vidas, x.base, x.com, receb[k]||0, aRec[k]||0]; })
      .sort((a,b)=>b[7]-a[7]);
    const soma = i => linhas.reduce((a,l)=>a+(Number(l[i])||0),0);
    rel.folhas.push({ nome:"Produção", colunas, linhas, total: colunas.map((c,i)=> i===0 ? "Total" : soma(i)) });
    rel.resumo = [{k:"Contratos", v:soma(1).toLocaleString("pt-BR")}, {k:"Vidas", v:soma(5).toLocaleString("pt-BR")},
      {k:rotCom+" gerada", v:brl(soma(7))}, {k:"Recebida", v:brl(soma(8))}];
  }
  return rel;
}

/** Quantas linhas o relatório terá — para a prévia do diálogo, sem montar tudo duas vezes. */
function contarRelatorio(r){
  try{ const rel = montarRelatorio(r); return rel.folhas.map(f=>({ nome:f.titulo||f.nome, n:f.linhas.length })); }
  catch(e){ return []; }
}

/* ---------- o diálogo ---------- */
function formRelatorio(){
  const r = S.rel;
  const T = REL_TIPOS[r.tipo];
  const tipos = Object.keys(REL_TIPOS).filter(relDisponivel);
  const operadoras = [...new Set(PK.flatMap(p=>S.config.operadoras[p]||[]).concat(S.contratos.map(c=>c.operadora)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const campo = k => {
    if(k==="periodo") return `<div class="field"><label for="rlPer">${esc(T.periodoRot)}</label>
      <select id="rlPer" data-act="relCampo" data-k="periodo">${T.periodos.map(p=>`<option value="${p}" ${r.periodo===p?"selected":""}>${esc(REL_PERIODOS[p].rot)}</option>`).join("")}</select></div>
      ${r.periodo==="custom"?`<div class="field"><label for="rlDe">De</label><input id="rlDe" type="date" value="${esc(r.de||addMonths(hoje(),-12))}" data-act="relCampo" data-k="de"></div>
      <div class="field"><label for="rlAte">Até</label><input id="rlAte" type="date" value="${esc(r.ate||hoje())}" data-act="relCampo" data-k="ate"></div>`:""}`;
    if(k==="pilar"){
      const pil = r.tipo==="vidas" ? PK : PK;
      return `<div class="field"><label for="rlPil">Pilar</label><select id="rlPil" data-act="relCampo" data-k="pilar">
        <option value="">Todos</option>${pil.map(p=>`<option value="${p}" ${r.pilar===p?"selected":""}>${esc(PILARES[p].nome)}</option>`).join("")}</select></div>`; }
    if(k==="operadora") return `<div class="field"><label for="rlOp">Operadora / administradora</label><select id="rlOp" data-act="relCampo" data-k="operadora">
      <option value="">Todas</option>${operadoras.map(o=>`<option ${r.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>`;
    if(k==="corretor") return escopoTravado() ? "" : `<div class="field"><label for="rlCor">Corretor</label><select id="rlCor" data-act="relCampo" data-k="corretor">
      <option value="">Todos</option>${S.usuarios.map(u=>`<option value="${esc(u.id)}" ${r.corretor===u.id?"selected":""}>${esc(u.nome)}</option>`).join("")}</select></div>`;
    if(k==="situacao") return `<div class="field"><label for="rlSit">Situação</label><select id="rlSit" data-act="relCampo" data-k="situacao">
      ${opcoesSituacao(r.tipo).map(([v,n])=>`<option value="${esc(v)}" ${r.situacao===v?"selected":""}>${esc(n)}</option>`).join("")}</select></div>`;
    if(k==="tipoParcela") return `<div class="field"><label for="rlTp">Tipo de parcela</label><select id="rlTp" data-act="relCampo" data-k="tipoParcela">
      <option value="">Todos</option>${Object.entries(TIPO_PARCELA).map(([v,x])=>`<option value="${v}" ${r.tipoParcela===v?"selected":""}>${esc(x.nome)}</option>`).join("")}</select></div>`;
    if(k==="conteudo") return `<div class="field"><label for="rlCont">Incluir</label><select id="rlCont" data-act="relCampo" data-k="conteudo">
      ${[["ambos","Vidas e cotas"],["vidas","Só vidas"],["cotas","Só cotas de consórcio"]].map(([v,n])=>`<option value="${v}" ${r.conteudo===v?"selected":""}>${n}</option>`).join("")}</select></div>`;
    if(k==="modo") return `<div class="field"><label for="rlModo">Vendas novas</label><select id="rlModo" data-act="relCampo" data-k="modo">
      ${["ritmo","funil","nenhum"].map(v=>`<option value="${v}" ${(r.modo||modoPrevisao())===v?"selected":""}>${esc(NOME_MODO[v])}</option>`).join("")}</select></div>`;
    return "";
  };
  return `
  <div class="m-head"><div><h2>Baixar relatório</h2>
    <div class="sub">Escolha o relatório, filtre o que precisa e baixe em Excel ou PDF — com o logotipo da Erbe</div></div></div>
  <div class="m-body">
    <div class="rel-tipos" role="radiogroup" aria-label="Relatório">
      ${tipos.map(k=>`<button type="button" class="rel-tipo" role="radio" aria-checked="${r.tipo===k}" data-act="relTipo" data-v="${k}">
        <b>${esc(REL_TIPOS[k].nome)}</b><span>${esc(REL_TIPOS[k].desc)}</span></button>`).join("")}
    </div>
    <div class="frow rel-filtros">${T.filtros.map(campo).join("")}</div>
    <div class="rel-previa" id="relPrevia">${previaRelatorio()}</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px">
      <span class="hint" style="font-weight:600">Formato</span>
      <div class="seg" role="group" aria-label="Formato do arquivo">
        <button type="button" data-act="relFormato" data-v="xlsx" aria-pressed="${r.formato!=="pdf"}">Excel (.xlsx)</button>
        <button type="button" data-act="relFormato" data-v="pdf" aria-pressed="${r.formato==="pdf"}">PDF</button>
      </div>
      <span class="hint">${r.formato==="pdf"?"Pronto para imprimir ou mandar por e-mail":"Com filtros, totais e cabeçalho fixo — abre no Excel e no Google Planilhas"}</span>
    </div>
  </div>
  <div class="m-foot">
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="gerarRel" id="btnGerarRel">Baixar ${r.formato==="pdf"?"PDF":"Excel"}</button>
  </div>`;
}
function previaRelatorio(){
  const partes = contarRelatorio(S.rel);
  const total = partes.reduce((a,p)=>a+p.n,0);
  return `<b>${total.toLocaleString("pt-BR")} linha${total!==1?"s":""}</b>
    ${partes.length>1?` · ${partes.map(p=>`${esc(p.nome)}: ${p.n.toLocaleString("pt-BR")}`).join(" · ")}`:""}
    <div class="hint">${esc(textoFiltrosRel(S.rel))}</div>`;
}
function abrirRelatorio(tipo, pre){
  if(!tipo || !REL_TIPOS[tipo] || !relDisponivel(tipo)) tipo = (S.rel && relDisponivel(S.rel.tipo)) ? S.rel.tipo : "carteira";
  S.rel = relPadrao(tipo, pre);
  abrirModal(formRelatorio(), true);
}
const nomeArquivoRel = rel => `erbe-${rel.titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${hoje()}`;
async function gerarRelatorio(){
  const btn = document.getElementById("btnGerarRel");
  const rotulo = btn ? btn.textContent : "";
  if(btn){ btn.disabled = true; btn.textContent = S.rel.formato==="pdf" ? "Montando o PDF…" : "Montando a planilha…"; }
  try{
    const rel = montarRelatorio(S.rel);
    const nome = nomeArquivoRel(rel);
    const linhas = rel.folhas.reduce((a,f)=>a+f.linhas.length,0);
    if(S.rel.formato==="pdf" && linhas > 3000 && !await confirmar("PDF muito grande",
        `São ${linhas.toLocaleString("pt-BR")} linhas — perto de ${Math.ceil(linhas/28).toLocaleString("pt-BR")} páginas. Para esse volume o Excel é mais prático; se quiser o PDF, aplique mais filtros ou gere assim mesmo (pode levar alguns segundos).`,
        "Gerar o PDF assim mesmo")) return;
    if(S.rel.formato==="pdf"){
      const blob = await gerarPdf(rel);
      await entregarArquivo(nome+".pdf", blob, "application/pdf");
    } else {
      const blob = await gerarXlsx(rel);
      await entregarArquivo(nome+".xlsx", blob, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
  }catch(e){
    console.error(e);
    toast(S.rel.formato==="pdf" ? "Não consegui gerar o PDF — confira a internet e tente de novo, ou baixe em Excel." : "Não consegui gerar a planilha.");
  }finally{
    if(btn && document.body.contains(btn)){ btn.disabled = false; btn.textContent = rotulo; }
  }
}
function viewRelatorios(){
  const j = janela();
  const ctr = contratosFiltrados();
  const lds = leadsFiltrados();
  const parcelasCtr = ctr.flatMap(c=>(c.comissoes||[]).map(p=>({...p, contrato:c})));

  const agrupa = (chave, rotulo) => {
    const m = {};
    ctr.forEach(c=>{
      const k = typeof chave==="function"?chave(c):c[chave];
      if(!k) return;
      m[k] = m[k] || { base:0, com:0, n:0, vidas:0 };
      m[k].base += Number(c.valorBase)||0;
      m[k].com  += comissaoContrato(c);
      m[k].vidas += totalVidas(c);
      m[k].n++;
    });
    const linhas = Object.entries(m).sort((a,b)=>b[1].com-a[1].com);
    const max = Math.max(...linhas.map(l=>l[1].com),1);
    const tot = linhas.reduce((a,l)=>a+l[1].com,0);
    return `<section class="panel" style="margin-bottom:14px">
      <div class="panel-head"><div><h3>${esc(rotulo)}</h3><div class="sub">Ordenado por comissão gerada</div></div>
        <div class="right"><b class="num">${brl(tot)}</b></div></div>
      <div class="tw"><table>
        <thead><tr><th>${esc(rotulo)}</th><th class="r">Contratos</th><th class="r">Vidas</th><th class="r">Base</th><th class="r">${veCorretora()?"Comissão":"Sua comissão"}</th><th class="r">Part.</th><th style="width:120px">Peso</th></tr></thead>
        <tbody>${linhas.map(([k,v])=>`<tr>
          <td><b>${esc(k)}</b></td><td class="r num">${v.n}</td><td class="r num">${v.vidas||"—"}</td>
          <td class="r num">${brl(v.base)}</td><td class="r num"><b>${brl(v.com)}</b></td>
          <td class="r num">${pct(tot?v.com/tot*100:0)}</td>
          <td><span class="track" style="display:block;height:8px;background:var(--surface-3);border-radius:99px;overflow:hidden"><span style="display:block;height:100%;width:${larg(v.com,max)}%;background:var(--accent);border-radius:99px"></span></span></td>
        </tr>`).join("") || `<tr><td colspan="7" class="empty">Nada no período e filtros escolhidos.</td></tr>`}</tbody>
      </table></div></section>`;
  };

  const ganhos = lds.filter(l=>l.etapa==="ganho"), perdidos = lds.filter(l=>l.etapa==="perdido");
  const porOrigem = {};
  lds.forEach(l=>{ const o=l.origem||"Sem origem"; porOrigem[o]=porOrigem[o]||{t:0,g:0,v:0};
    porOrigem[o].t++; if(l.etapa==="ganho"){porOrigem[o].g++; porOrigem[o].v+=Number(l.valorEstimado)||0;} });
  const motivos = {};
  perdidos.forEach(l=>{ const m=l.motivoPerda||"Não informado"; motivos[m]=(motivos[m]||0)+1; });
  const comissaoTotal = ctr.reduce((a,c)=>a+comissaoContrato(c),0);
  const baseTotal = ctr.reduce((a,c)=>a+(Number(c.valorBase)||0),0);
  const vencidas = parcelasCtr.filter(p=>p.vence<=hoje());
  const recebidas = vencidas.filter(p=>p.status==="recebido");

  // série mensal dentro da janela
  const meses = [];
  { let m = j.de.slice(0,7), fimM = (j.ate<hoje()?j.ate:hoje()).slice(0,7);
    if(j.chave==="tudo" && ctr.length) m = ctr.map(c=>c.inicio).sort()[0].slice(0,7);
    let guarda = 0;
    while(m <= fimM && guarda++ < 36){ meses.push(m); m = addMonths(m+"-01",1).slice(0,7); } }
  const serie = meses.map(m=>{
    const o = {mes:m}; PK.forEach(x=>o[x]=0);
    ctr.filter(c=>(c.inicio||"").slice(0,7)===m).forEach(c=>{ o[c.pilar]=(o[c.pilar]||0)+comissaoContrato(c); });
    return o;
  });

  return `
  ${filtrosRelatorio()}
  ${avisoSuaParte()}
  <div class="hint" style="margin:-4px 0 14px">Mostrando <b>${ctr.length}</b> contrato(s) iniciado(s) entre ${dt(j.de)} e ${dt(j.ate)}${S.filtros.tipoPlano?` · tipo ${esc(S.filtros.tipoPlano)}`:""}${S.filtros.pilar?` · ${esc(PILARES[S.filtros.pilar].curto)}`:""}.</div>

  <div class="stat-row">
    <div class="stat hero"><div class="k">${veCorretora()?"Comissão gerada":"Sua comissão"}</div><div class="v">${brl(comissaoTotal)}</div>
      <div class="d">${ctr.length} contratos · ${esc(j.rot.toLowerCase())}</div></div>
    <div class="stat"><div class="k">Valor dos contratos</div>
      <div class="v">${brl(ctr.reduce((a,c)=>a+(Number(c.valorTotal)||0),0))}</div>
      <div class="d">Base contratada de ${brl(baseTotal)}</div></div>
    <div class="stat"><div class="k">Comissão por contrato</div><div class="v">${brl(ctr.length?comissaoTotal/ctr.length:0)}</div>
      <div class="d">Base média de ${brl(ctr.length?baseTotal/ctr.length:0)}, que mistura mensalidade, prêmio e crédito</div></div>
    <div class="stat"><div class="k">Taxa de conversão</div><div class="v">${pct(ganhos.length+perdidos.length?ganhos.length/(ganhos.length+perdidos.length)*100:0)}</div>
      <div class="d">${ganhos.length} de ${ganhos.length+perdidos.length} decididos</div></div>
    <div class="stat"><div class="k">Vidas</div><div class="v">${ctr.reduce((a,c)=>a+totalVidas(c),0).toLocaleString("pt-BR")}</div>
      <div class="d">Nos contratos do período</div></div>
    <div class="stat"><div class="k">Índice de recebimento</div><div class="v">${pct(vencidas.length?recebidas.length/vencidas.length*100:0)}</div>
      <div class="d">${recebidas.length} de ${vencidas.length} parcelas vencidas</div></div>
  </div>

  ${serie.length?`<section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><div><h3>Comissão gerada mês a mês</h3>
      <div class="sub">${esc(j.rot)} · por pilar</div></div></div>
    ${chartBarrasEmpilhadas(serie)}
    <div class="legend">${PK.map(x=>`<span><i class="dot" style="background:${PILARES[x].cor}"></i>${PILARES[x].curto}</span>`).join("")}</div>
    ${tabelaOculta(["Mês",...PK.map(x=>PILARES[x].curto)], serie.map(r=>[mesLabel(r.mes),...PK.map(x=>brl(r[x]))]))}
  </section>`:""}

  ${agrupa(c=>tipoPlano(c),"Tipo de plano")}
  ${agrupa("operadora","Operadora")}
  ${agrupa(c=>PILARES[c.pilar]?.nome,"Pilar")}
  ${agrupa("produto","Produto")}
  ${agrupa(c=>nomeUsuario(c.corretor),"Corretor")}

  <section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><div><h3>Origem dos leads</h3><div class="sub">Leads criados no período · volume e conversão</div></div></div>
    <div class="tw"><table>
      <thead><tr><th>Origem</th><th class="r">Leads</th><th class="r">Ganhos</th><th class="r">Conversão</th><th class="r">Valor ganho</th></tr></thead>
      <tbody>${Object.entries(porOrigem).sort((a,b)=>b[1].t-a[1].t).map(([k,v])=>`<tr>
        <td><b>${esc(k)}</b></td><td class="r num">${v.t}</td><td class="r num">${v.g}</td>
        <td class="r num">${pct(v.t?v.g/v.t*100:0)}</td><td class="r num">${brl(v.v)}</td></tr>`).join("")
        || `<tr><td colspan="5" class="empty">Nenhum lead criado no período.</td></tr>`}</tbody>
    </table></div></section>

  <section class="panel">
    <div class="panel-head"><div><h3>Motivos de perda</h3><div class="sub">Onde a corretora está deixando negócio na mesa</div></div></div>
    <div class="chart-wrap">${Object.entries(motivos).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
      const max=Math.max(...Object.values(motivos),1);
      return `<div class="bar-line"><span class="nm">${esc(k)}</span>
        <span class="track"><span class="fill" style="width:${larg(v,max)}%;background:var(--crit)"></span></span>
        <span class="n">${v}</span></div>`;
    }).join("") || `<div class="empty">Nenhuma perda registrada no período.</div>`}</div>
  </section>

  ${painelCancelamentos(j)}`;
}

/** Cancelamentos do período, pelo motivo — a pergunta "por que estamos perdendo cliente". */
function painelCancelamentos(j){
  const cs = S.contratos.filter(c=>c.status==="cancelado" && noEscopo(c,"corretor"))
    .map(c=>({ c, quando: c.canceladoEm || (c.atualizadoEm||"").slice(0,10) }))
    .filter(x=>x.quando >= j.de && x.quando <= j.ate);
  const motivos = {};
  cs.forEach(x=>{ const m = x.c.motivoCancelamento || "Não informado"; motivos[m]=(motivos[m]||0)+1; });
  const ord = Object.entries(motivos).sort((a,b)=>b[1]-a[1]);
  const max = Math.max(...ord.map(o=>o[1]), 1);
  const vidasPerdidas = cs.reduce((a,x)=>a+(contratoTemVida(x.c) ? (vidasDoContrato(x.c.id).length || Number(x.c.vidas)||0) : 0), 0);
  const semMotivo = motivos["Não informado"]||0;
  return `<section class="panel" style="margin-top:14px">
    <div class="panel-head"><div><h3>Cancelamentos</h3>
      <div class="sub">${cs.length} contrato(s) no período · ${vidasPerdidas} vida(s) que saíram da carteira</div></div></div>
    <div class="chart-wrap">${ord.length ? ord.map(([k,v])=>`<div class="bar-line"><span class="nm">${esc(k)}</span>
        <span class="track"><span class="fill" style="width:${larg(v,max)}%;background:${k==="Não informado"?"var(--line-strong)":"var(--crit)"}"></span></span>
        <span class="n">${v}</span></div>`).join("")
      : `<div class="empty">Nenhum cancelamento no período.</div>`}
      ${semMotivo?`<div class="hint" style="margin-top:8px">${semMotivo} cancelamento(s) sem motivo: registre ao marcar o contrato como cancelado — é o que mostra onde agir.</div>`:""}
    </div>
  </section>`;
}

/* ============================================================
   OPERADORAS
   ============================================================ */
/** Consolida cada operadora: o que produz, o que já pagou e quanto demora. */
function analiseOperadoras(){
  const ctr = S.contratos.filter(c=>c.status!=="cancelado" && c.operadora && noEscopo(c,"corretor"));
  const mapa = {};
  ctr.forEach(c=>{
    const o = mapa[c.operadora] = mapa[c.operadora] || {
      nome:c.operadora, pilares:new Set(), contratos:0, clientes:new Set(), vidas:0,
      base:0, comissao:0, recebido:0, atrasado:0, previsto:0, atrasos:[], parcelasAtraso:0
    };
    o.pilares.add(c.pilar); o.contratos++; o.clientes.add(c.clienteId);
    o.vidas += totalVidas(c); o.base += Number(c.valorBase)||0;
    // quem não vê o lado da corretora enxerga estes valores já na sua proporção
    const q = veCorretora() ? 1 : (Number(c.splitPct)||0)/100;
    (c.comissoes||[]).forEach(p=>{
      o.comissao += p.valor*q;
      if(p.status==="recebido"){
        o.recebido += (p.valorRecebido??p.valor)*q;
        if(p.recebidoEm) o.atrasos.push(diasEntre(p.vence, p.recebidoEm));
      } else if(p.vence < hoje()){ o.atrasado += p.valor*q; o.parcelasAtraso++; }
      else o.previsto += p.valor*q;
    });
  });
  const linhas = Object.values(mapa).map(o=>({
    ...o,
    pilar:[...o.pilares][0] || "saude",
    clientesN:o.clientes.size,
    ticket: o.contratos ? o.base/o.contratos : 0,
    atrasoMedio: o.atrasos.length ? o.atrasos.reduce((a,b)=>a+b,0)/o.atrasos.length : null,
    rendimento: o.base ? o.comissao/o.base*100 : 0
  })).sort((a,b)=>b.comissao-a.comissao);
  const total = linhas.reduce((a,o)=>a+o.comissao,0);
  linhas.forEach(o=>o.share = total ? o.comissao/total*100 : 0);
  return { linhas, total };
}
function viewOperadoras(){
  const { linhas, total } = analiseOperadoras();
  if(!linhas.length) return vazio("Nenhuma operadora na carteira",
    "Assim que houver contratos, esta tela mostra quanto cada operadora gera e quanto demora para pagar a comissão.","novoContrato","Registrar contrato");

  const lider = linhas[0];
  const comAtraso = linhas.filter(o=>o.atrasoMedio!=null);
  const maisLenta = comAtraso.slice().sort((a,b)=>b.atrasoMedio-a.atrasoMedio)[0];
  const maisRapida = comAtraso.slice().sort((a,b)=>a.atrasoMedio-b.atrasoMedio)[0];
  const devendo = linhas.filter(o=>o.atrasado>0).sort((a,b)=>b.atrasado-a.atrasado);
  const concentracao = lider.share;
  const top3 = linhas.slice(0,3).reduce((a,o)=>a+o.share,0);
  const max = Math.max(...linhas.map(o=>o.comissao), 1);

  const leitura = [];
  if(concentracao>=40) leitura.push({cls:"warn", t:`${esc(lider.nome)} responde por ${pct(concentracao)} da comissão`,
    s:"Concentração alta: uma mudança de régua nessa operadora move o caixa da corretora inteira."});
  else leitura.push({cls:"ok", t:"Carteira distribuída",
    s:`A maior operadora é ${pct(concentracao)} do total e as três primeiras somam ${pct(top3)}.`});
  if(maisLenta && maisLenta.atrasoMedio>10) leitura.push({cls:"crit", t:`${esc(maisLenta.nome)} paga com ${Math.round(maisLenta.atrasoMedio)} dias de atraso médio`,
    s:"Considere esse prazo ao projetar caixa e ao negociar a próxima régua."});
  if(maisRapida && maisRapida.atrasoMedio<=5) leitura.push({cls:"ok", t:`${esc(maisRapida.nome)} é a mais pontual`,
    s:`Média de ${Math.round(maisRapida.atrasoMedio)} dia(s) entre o vencimento e o crédito.`});
  if(devendo.length) leitura.push({cls:"crit", t:`${brl(devendo.reduce((a,o)=>a+o.atrasado,0))} em aberto vencido`,
    s:`Concentrado em ${esc(devendo[0].nome)} (${brl(devendo[0].atrasado)}).`});

  return `
  <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
    <div class="stat hero"><div class="k">Operadora líder</div><div class="v" style="font-size:19px">${esc(lider.nome)}</div>
      <div class="d">${brl(lider.comissao)} · ${pct(lider.share)} da comissão</div></div>
    <div class="stat"><div class="k">Operadoras ativas</div><div class="v">${linhas.length}</div>
      <div class="d">${linhas.reduce((a,o)=>a+o.contratos,0)} contratos</div></div>
    <div class="stat"><div class="k">${veCorretora()?"Comissão total gerada":"Sua comissão no período"}</div><div class="v">${brl(total)}</div>
      <div class="d">${brl(linhas.reduce((a,o)=>a+o.recebido,0))} já recebidos</div></div>
    <div class="stat"><div class="k">Atraso médio de pagamento</div>
      <div class="v">${comAtraso.length?Math.round(comAtraso.reduce((a,o)=>a+o.atrasoMedio,0)/comAtraso.length)+"d":"—"}</div>
      <div class="d">Do vencimento até o crédito</div></div>
  </div>

  <div class="alerts">${leitura.map(l=>`<div class="alert ${l.cls}" style="cursor:default">
    <span class="ai" aria-hidden="true">${l.cls==="ok"?"✓":l.cls==="warn"?"!":"×"}</span>
    <span><b>${l.t}</b><span>${l.s}</span></span></div>`).join("")}</div>

  <section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><div><h3>${veCorretora()?"Comissão gerada por operadora":"Sua comissão por operadora"}</h3>
      <div class="sub">Todas as parcelas dos contratos vivos · cor por pilar</div></div></div>
    <div class="chart-wrap">
      ${linhas.map(o=>`<div class="bar-line">
        <span class="nm" style="width:152px">${esc(o.nome)}</span>
        <span class="track" style="height:13px">
          <span class="fill" style="width:${larg(o.comissao,max)}%;background:${PILARES[o.pilar].cor}"></span></span>
        <span class="n" style="width:132px">${brl(o.comissao)} · ${pct(o.share)}</span></div>`).join("")}
    </div>
    <div class="legend">${PK.map(x=>`<span><i class="dot" style="background:${PILARES[x].cor}"></i>${PILARES[x].curto}</span>`).join("")}</div>
    ${tabelaOculta(["Operadora","Comissão","Participação"], linhas.map(o=>[o.nome,brl(o.comissao),pct(o.share)]))}
  </section>

  <section class="panel">
    <div class="panel-head"><div><h3>Quadro completo</h3>
      <div class="sub">Clique numa linha para ver os contratos da operadora</div></div></div>
    <div class="tw"><table>
      <thead><tr><th>Operadora</th><th class="r">Contratos</th><th class="r">Vidas</th><th class="r">Base</th>
        <th class="r">${veCorretora()?"Comissão":"Sua comissão"}</th><th class="r">${veCorretora()?"Comissão":"Sua parte"} ÷ base</th><th class="r">Recebido</th><th class="r">Em atraso</th>
        <th class="r">Atraso médio</th><th class="r">Ticket</th></tr></thead>
      <tbody>${linhas.map(o=>`<tr class="clickable" data-act="irFiltro" data-view="contratos" data-f='${esc(JSON.stringify({operadora:o.nome}))}'>
        <td><b>${esc(o.nome)}</b><div class="hint">${[...o.pilares].map(x=>PILARES[x].curto).join(", ")} · ${o.clientesN} cliente${o.clientesN!==1?"s":""}</div></td>
        <td class="r num">${o.contratos}</td>
        <td class="r num">${o.vidas||"—"}</td>
        <td class="r num">${brl(o.base)}</td>
        <td class="r num"><b>${brl(o.comissao)}</b></td>
        <td class="r num" style="color:var(--ink-3)">${pctR(o.rendimento)}</td>
        <td class="r num" style="color:var(--ok)">${brl(o.recebido)}</td>
        <td class="r num" ${o.atrasado?'style="color:var(--crit)"':""}>${o.atrasado?brl(o.atrasado)+` <span class="hint">(${o.parcelasAtraso})</span>`:"—"}</td>
        <td class="r num">${o.atrasoMedio==null?"—":`<span class="chip ${o.atrasoMedio>15?"crit":o.atrasoMedio>5?"warn":"ok"}">${Math.round(o.atrasoMedio)}d</span>`}</td>
        <td class="r num">${brl(o.ticket)}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <div class="ta"><b style="color:var(--ink-2)">${veCorretora()?"Comissão":"Sua parte"} ÷ base</b> só compara operadoras do mesmo pilar: em saúde a base é a mensalidade, em seguros o prêmio anual e em consórcio o valor do crédito — por isso saúde passa de 100% e consórcio fica na casa de 3%.
      <br><b style="color:var(--ink-2)">Atraso médio</b> considera apenas parcelas já conciliadas, comparando o vencimento com a data em que você marcou o recebimento; fica mais confiável conforme você concilia.</div>
  </section>`;
}

/* ============================================================
   ATIVIDADE DA EQUIPE
   ============================================================ */
/** As mudanças de um registro que quem olha pode ver: o valor do cronograma
    de comissão é informação da corretora. */
const mudVisiveis = r => (r.mudancas||[]).filter(m=> m.campo!=="comissoes" || veCorretora());
function viewAtividade(){
  const f = S.filtros;
  // Quem não é gestor vê só o que ele mesmo fez — como na versão Supabase,
  // onde o banco já aplica essa regra. Despesa é assunto do gestor.
  const ATIV = S.mePapel==="gestor" ? S.atividade
    : S.atividade.filter(r=>r.quem===S.uid && r.colecao!=="despesas");
  let regs = ATIV.slice().sort((a,b)=>(b.quando||"").localeCompare(a.quando||""));
  if(f.quem) regs = regs.filter(r=>r.quem===f.quem);
  if(f.colecao) regs = regs.filter(r=>r.colecao===f.colecao);
  if(!S.online) return vazio("Registro indisponível fora do sistema compartilhado",
    "A trilha de atividade é gravada no banco compartilhado e só aparece quando o sistema é aberto pelo link da Central.","","");
  if(!ATIV.length) return vazio("Nenhuma movimentação registrada ainda",
    "A partir de agora, toda criação, alteração e conciliação feita por qualquer pessoa da equipe aparece aqui com autor e horário.","","");

  const pessoas = [...new Map(ATIV.map(r=>[r.quem, r.quemNome||nomeUsuario(r.quem)])).entries()];
  const hojeStr = hoje();
  const porDia = {};
  regs.slice(0,200).forEach(r=>{ const d=(r.quando||"").slice(0,10); (porDia[d]=porDia[d]||[]).push(r); });

  const ativosHoje = new Set(ATIV.filter(r=>(r.quando||"").slice(0,10)===hojeStr).map(r=>r.quem)).size;
  return `
  <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
    <div class="stat"><div class="k">Movimentações hoje</div>
      <div class="v">${ATIV.filter(r=>(r.quando||"").slice(0,10)===hojeStr).length}</div>
      <div class="d">${ativosHoje} pessoa${ativosHoje!==1?"s":""} trabalhando no sistema</div></div>
    <div class="stat"><div class="k">Últimos 7 dias</div>
      <div class="v">${ATIV.filter(r=>(r.quando||"").slice(0,10)>=addDays(hojeStr,-7)).length}</div>
      <div class="d">${ATIV.length} carregados na tela · o banco guarda o histórico inteiro</div></div>
    <div class="stat"><div class="k">Última movimentação</div>
      <div class="v" style="font-size:17px">${esc(quandoRel(regs[0]?.quando))}</div>
      <div class="d">${esc(regs[0]?.quemNome||"—")}</div></div>
  </div>
  <div class="filters">
    <div class="field"><label for="atQuem">Pessoa</label><select id="atQuem" data-act="filtro" data-k="quem">
      <option value="">Todo mundo</option>
      ${pessoas.map(([id,nome])=>`<option value="${esc(id)}" ${f.quem===id?"selected":""}>${esc(nome)}</option>`).join("")}</select></div>
    <div class="field"><label for="atTipo">Registro</label><select id="atTipo" data-act="filtro" data-k="colecao">
      <option value="">Todos</option>
      ${Object.entries(ROTULO_COL).filter(([k])=>k!=="usuarios").map(([k,v])=>`<option value="${k}" ${f.colecao===k?"selected":""}>${esc(v)}</option>`).join("")}</select></div>
  </div>
  ${Object.entries(porDia).map(([dia,rs])=>`
    <section class="panel" style="margin-bottom:14px">
      <div class="panel-head"><span class="chip ${dia===hojeStr?"ok":"mute"}">${dia===hojeStr?"Hoje":dt(dia)}</span>
        <div><h3>${rs.length} ${rs.length===1?"movimentação":"movimentações"}</h3></div></div>
      <div class="tw"><table><tbody>${rs.map(r=>`<tr class="${r.alvoId&&r.colecao!=="tarefas"?"clickable":""}"
          ${r.colecao==="leads"?`data-act="abrirLeadSeExiste" data-id="${esc(r.alvoId)}"`:""}
          ${r.colecao==="clientes"?`data-act="abrirClienteSeExiste" data-id="${esc(r.alvoId)}"`:""}
          ${r.colecao==="contratos"?`data-act="abrirContratoSeExiste" data-id="${esc(r.alvoId)}"`:""}>
        <td style="width:40px"><span class="avatar" title="${esc(r.quemNome||"")}">${esc(iniciais(r.quemNome||"?"))}</span></td>
        <td><b>${esc(r.quemNome||"Alguém")}</b> <span style="color:var(--ink-2)">${esc(minuscInicial(r.evento||"alterou"))}</span></td>
        <td><span class="chip mute">${esc(r.tipo||"")}</span> ${esc(r.alvo||"")}
          ${mudVisiveis(r).length?`<div class="mudancas">${mudVisiveis(r).map(m=>`
            <span class="mud"><b>${esc(m.rotulo)}</b>
              <s>${esc(m.de||"vazio")}</s>
              <span aria-hidden="true">→</span>
              <i>${esc(m.para||"vazio")}</i></span>`).join("")}</div>`:""}</td>
        <td class="r num" style="color:var(--ink-3);white-space:nowrap">${esc(horaDe(r.quando))} · ${esc(quandoRel(r.quando))}</td>
      </tr>`).join("")}</tbody></table></div>
    </section>`).join("")}`;
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
function viewConfig(){
  const c = S.config;
  return `
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr))">
    <section class="panel" style="grid-column:1/-1">
      <div class="panel-head"><span class="chip mute">Marca</span>
        <div><h3>Identidade</h3><div class="sub">O escudo oficial da Erbe, extraído em vetor do manual da marca</div></div></div>
      <div class="chart-wrap">
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <div class="marca-amostras">
            <div class="marca-amostra claro"><div style="width:190px">${ASSINATURA_H}</div><span>Principal · fundo claro e relatórios</span></div>
            <div class="marca-amostra escuro"><div style="width:46px">${escudoOficial("negativo")}</div><span>Negativa · fundo preto</span></div>
          </div>
          <div style="flex:1;min-width:260px">
            <div class="hint" style="margin-bottom:10px">Já aplicado na barra lateral, no login e no cabeçalho dos relatórios em Excel e PDF. No fundo claro entra a versão principal; no escuro, a negativa — como pede o manual.</div>
            ${c.logoSvg?`<div class="hint" style="margin-bottom:8px;color:var(--warn)">Um arquivo próprio está no lugar do escudo oficial.</div>`:""}
            <details ${c.logoSvg?"open":""}><summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--ink-2)">Usar outro arquivo no lugar do oficial</summary>
              <div class="field" style="margin-top:8px"><label for="cfLogo">SVG ou endereço da imagem</label>
                <textarea id="cfLogo" rows="3" placeholder="Cole aqui o conteúdo do arquivo .svg, ou o endereço de uma imagem">${esc(c.logoSvg||"")}</textarea></div>
              <button class="btn primary" data-act="salvarLogo">Aplicar</button>
              ${c.logoSvg?`<button class="btn ghost danger" data-act="limparLogo">Voltar ao escudo oficial</button>`:""}
            </details>
          </div>
        </div>
      </div>
    </section>
    <section class="panel" style="grid-column:1/-1">
      <div class="panel-head"><div><h3>Réguas de comissão</h3><div class="sub">Cada contrato usa uma régua para gerar o cronograma de parcelas</div></div>
        <div class="right"><button class="btn sm primary" data-act="novaRegra">+ Nova régua</button></div></div>
      <div class="tw"><table>
        <thead><tr><th>Régua</th><th>Pilar</th><th>Base</th><th>Agenciamento</th><th>Vitalício</th><th class="r">Em 12 meses</th><th></th></tr></thead>
        <tbody>${c.regras.map(r=>{
          const ag = (r.parcelas||[]).reduce((a,p)=>a+p.pct,0);
          const v = r.vitalicio||{pct:0};
          return `<tr>
            <td><b>${esc(r.nome)}</b></td>
            <td><span class="chip ${esc(r.pilar)}">${esc(PILARES[r.pilar]?.curto||r.pilar)}</span></td>
            <td>${esc(BASE_LABEL[r.base]||r.base)}</td>
            <td class="num">${(r.parcelas||[]).length?`${pctR(ag)} <span class="hint">em ${r.parcelas.length}x (${r.parcelas.slice(0,4).map(p=>pctR(p.pct)).join("·")}${r.parcelas.length>4?"…":""})</span>`:`<span class="hint">—</span>`}</td>
            <td class="num">${v.pct>0?`${pctR(v.pct)}/mês <span class="hint">do mês ${v.inicio||1}${v.meses?` · ${v.meses}m`:" · até o fim da vigência"}</span>`:`<span class="hint">—</span>`}</td>
            <td class="r num"><b>${pctR(ag + (v.pct||0)*Math.max(0,12-((v.inicio||1)-1)))}</b></td>
            <td class="r"><button class="btn sm" data-act="editarRegra" data-id="${esc(r.id)}">Editar</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    </section>
    <section class="panel" style="grid-column:1/-1">
      <div class="panel-head"><div><h3>Comissões e avisos</h3><div class="sub">Imposto sobre as parcelas, base do repasse e antecedência dos lembretes</div></div></div>
      <div class="chart-wrap"><div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        <div class="field"><label for="cfImposto">Imposto sobre a comissão (%)</label>
          <input id="cfImposto" type="number" min="0" max="50" step="0.01" value="${Number(c.impostoPadrao)||0}" data-act="cfgNum" data-k="impostoPadrao" data-min="0" data-max="50">
          <span class="hint">Alíquota padrão descontada de cada parcela (ex.: a do Simples Nacional). Dá para mudar por contrato e por parcela. 0 = não desconta.</span></div>
        <div class="field"><label for="cfSplit">Repasse do corretor calculado sobre</label>
          <select id="cfSplit" data-act="cfgTexto" data-k="splitSobre">
            <option value="bruto" ${c.splitSobre!=="liquido"?"selected":""}>O valor bruto da parcela</option>
            <option value="liquido" ${c.splitSobre==="liquido"?"selected":""}>O valor líquido, depois do imposto</option></select>
          <span class="hint">No bruto, o imposto sai só da parte da corretora. No líquido, é dividido na proporção do split.</span></div>
        <div class="field"><label for="cfAvisoCom">Avisar parcelas de comissão com (dias)</label>
          <input id="cfAvisoCom" type="number" min="1" max="120" value="${Number(c.diasAvisoComissao)||7}" data-act="cfgNum" data-k="diasAvisoComissao" data-min="1" data-max="120"></div>
        <div class="field"><label for="cfAvisoAniv">Avisar aniversários com (dias)</label>
          <input id="cfAvisoAniv" type="number" min="0" max="60" value="${diasAvisoAniv()}" data-act="cfgNum" data-k="diasAvisoAniversario" data-min="0" data-max="60">
          <span class="hint">0 = só no dia. Vale para o pop-up, o painel e a ficha do cliente.</span></div>
        <div class="field"><label for="cfCadencia">Contato de pós-venda a cada (dias)</label>
          <input id="cfCadencia" type="number" min="7" max="365" value="${Number(c.cadenciaPosVenda)||90}" data-act="cfgNum" data-k="cadenciaPosVenda" data-min="7" data-max="365">
          <span class="hint">Padrão da carteira; cada cliente pode ter a sua.</span></div>
      </div></div>
    </section>
    ${listaEditavel("Categorias de despesa","categoriasDespesa",c.categoriasDespesa||[])}
    ${listaEditavel("Formas de pagamento","formasPagamento",c.formasPagamento||[])}
    ${listaEditavel("Origens de lead","origens",c.origens)}
    ${listaEditavel("Motivos de perda","motivosPerda",c.motivosPerda)}
    ${listaEditavel("Motivos de cancelamento","motivosCancelamento",c.motivosCancelamento||[])}
    ${PK.map(p=>listaEditavel(`Operadoras · ${PILARES[p].curto}`,`operadoras.${p}`,c.operadoras[p]||[])).join("")}
    ${PK.map(p=>listaEditavel(`Produtos · ${PILARES[p].curto}`,`produtos.${p}`,c.produtos[p]||[])).join("")}
    <section class="panel">
      <div class="panel-head"><div><h3>Dados</h3><div class="sub">${S.online?`Supabase · conectado como ${esc(S.meuEmail||S.meNome)}`:"Sem conexão com o banco"}</div></div></div>
      <div class="chart-wrap">
        <div class="dl" style="margin-bottom:14px">
          <div><div class="k">Leads</div><div class="v num">${S.leads.length}</div></div>
          <div><div class="k">Clientes</div><div class="v num">${S.clientes.length}</div></div>
          <div><div class="k">Contratos</div><div class="v num">${S.contratos.length}</div></div>
          <div><div class="k">Tarefas</div><div class="v num">${S.tarefas.length}</div></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-act="exportar">Baixar backup (JSON)</button>
          <button class="btn" data-act="importar">Importar backup</button>
          <button class="btn danger" data-act="limparExemplos">Apagar dados de exemplo</button>
        </div>
        <div class="hint" style="margin-top:10px">Os registros marcados como exemplo trazem a etiqueta <span class="chip mute">exemplo</span> e podem ser apagados de uma vez quando a operação real começar.</div>
      </div>
    </section>
  </div>`;
}
function listaEditavel(titulo, caminho, itens){
  return `<section class="panel">
    <div class="panel-head"><div><h3>${esc(titulo)}</h3><div class="sub">${itens.length} itens</div></div>
      <div class="right"><button class="btn sm" data-act="addItem" data-path="${esc(caminho)}">+ Adicionar</button></div></div>
    <div class="chart-wrap" style="display:flex;flex-wrap:wrap;gap:6px">
      ${itens.map(i=>`<span class="chip mute">${esc(i)} <button class="btn sm ghost" style="padding:0 4px" data-act="delItem" data-path="${esc(caminho)}" data-v="${esc(i)}" aria-label="Remover ${esc(i)}">×</button></span>`).join("") || `<span class="hint">Nenhum item.</span>`}
    </div></section>`;
}
function vazio(titulo, texto, acao, rotulo){
  return `<div class="panel"><div class="empty"><b>${esc(titulo)}</b>${esc(texto)}
    ${acao?`<div style="margin-top:14px"><button class="btn primary" data-act="${esc(acao)}">${esc(rotulo)}</button></div>`:""}</div></div>`;
}

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
  if(f) setTimeout(()=>f.focus(),40);
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

/* ---------- lead ---------- */
function formLead(l){
  l = l || {};
  abrirEditor({ comissoes:l.comissoesPrevistas||[] }, "lead");
  return `
  <div class="m-head"><div><h2>${l.id?"Editar lead":"Novo lead"}</h2>
    <div class="sub">${l.id?esc(etapaNome(l.etapa)):"Entra na primeira etapa do funil"}</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="lNome">Nome do contato</label><input id="lNome" type="text" value="${esc(l.nome||"")}" placeholder="Maria Souza"></div>
      <div class="field"><label for="lEmpresa">Empresa</label><input id="lEmpresa" type="text" value="${esc(l.empresa||"")}" placeholder="Souza Contabilidade ME"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="lTel">Telefone</label><input id="lTel" type="tel" value="${esc(l.telefone||"")}" placeholder="(11) 90000-0000"></div>
      <div class="field"><label for="lEmail">E-mail</label><input id="lEmail" type="email" value="${esc(l.email||"")}"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="lPilar">Pilar</label><select id="lPilar">${PK.map(p=>`<option value="${p}" ${l.pilar===p?"selected":""}>${PILARES[p].nome}</option>`).join("")}</select></div>
      <div class="field"><label for="lOrigem">Origem</label><select id="lOrigem">${S.config.origens.map(o=>`<option ${l.origem===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
      <div class="field"><label for="lTemp">Temperatura</label><select id="lTemp">
        ${["quente","morno","frio"].map(t=>`<option value="${t}" ${l.temperatura===t?"selected":""}>${t[0].toUpperCase()+t.slice(1)}</option>`).join("")}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="lValor">Valor estimado (R$/mês ou prêmio)</label><input id="lValor" type="number" step="10" value="${l.valorEstimado||""}" placeholder="1800" data-act="recalcBase"></div>
      <div class="field"><label for="lVidas">Vidas / itens</label><input id="lVidas" type="number" value="${l.vidas||""}" placeholder="12"></div>
      <div class="field"><label for="lResp">Responsável</label><select id="lResp">${optUsuarios(l.responsavel||S.uid)}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="lPrev">Previsão de fechamento</label>
        <input id="lPrev" type="date" value="${l.previsaoFechamento||addDays(hoje(),30)}">
        <span class="hint">Alimenta a projeção de receita por mês.</span></div>
      <div class="field"><label for="lRegra">Régua prevista</label>
        <select id="lRegra">${S.config.regras.filter(x=>x.pilar===(l.pilar||"saude")).map(x=>`<option value="${x.id}" ${l.regraId===x.id?"selected":""}>${esc(x.nome)}</option>`).join("")}</select>
        <span class="hint">Base da estimativa, se você não montar as parcelas.</span></div>
    </div>
    <div id="editorComissao">${editorHTML(ctxContrato(l))}</div>
    <div class="field"><label for="lObs">Observações</label><textarea id="lObs" placeholder="Contexto da conversa, operadora atual, data de renovação…">${esc(l.obs||"")}</textarea></div>
  </div>
  <div class="m-foot">
    ${l.id?`<button class="btn ghost danger left" data-act="excluirLead" data-id="${esc(l.id)}">Excluir</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarLead" data-id="${esc(l.id||"")}">Salvar lead</button>
  </div>`;
}
function optUsuarios(sel){
  const us = S.usuarios.length ? S.usuarios : [{id:S.uid||"eu", nome:S.meNome}];
  return us.map(u=>`<option value="${esc(u.id)}" ${sel===u.id?"selected":""}>${esc(u.nome)}</option>`).join("");
}
async function salvarLead(id){
  const nome = val("lNome");
  if(!nome){ toast("Informe o nome do contato."); return; }
  const antigo = S.leads.find(l=>l.id===id) || {};
  const l = Object.assign({}, antigo, {
    id: id || uid("lead"),
    nome, empresa:val("lEmpresa"), telefone:val("lTel"), email:val("lEmail"),
    pilar:val("lPilar"), origem:val("lOrigem"), temperatura:val("lTemp"),
    valorEstimado:numv("lValor"), vidas:numv("lVidas"), responsavel:val("lResp"),
    previsaoFechamento:val("lPrev")||addDays(hoje(),30), regraId:val("lRegra"),
    comissoesPrevistas: editorParcelas.filter(p=>Number(p.valor)>0)
      .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""))
      .map((p,i)=>({ n:i+1, tipo:p.tipo||"agenciamento", pct:Number(p.pct)||0,
        valor:+(Number(p.valor)||0).toFixed(2), vence:p.vence||hoje(),
        status:"previsto", recebidoEm:"", valorRecebido:null })),
    obs:val("lObs"),
    etapa: antigo.etapa || "novo",
    criadoEm: antigo.criadoEm || hoje(),
    ultimoContato: hoje(),
    historico: antigo.historico || [{data:hoje(), texto:"Lead criado", autor:S.meNome}]
  });
  await salvar("leads", l);
  fecharModal(); toast(id?"Lead atualizado":"Lead criado");
}
function abrirLead(id){
  const l = S.leads.find(x=>x.id===id); if(!l) return;
  const et = S.config.etapas;
  abrirModal(`
  <div class="m-head"><div><h2>${esc(l.nome)}</h2>
    <div class="sub">${esc(l.empresa||"Pessoa física")} · ${esc(PILARES[l.pilar]?.nome||"")} · ${esc(l.origem||"sem origem")}</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="dEtapa">Etapa</label><select id="dEtapa" data-act="mudarEtapa" data-id="${esc(l.id)}">
        ${et.map(e=>`<option value="${e.id}" ${l.etapa===e.id?"selected":""}>${esc(e.nome)}</option>`).join("")}</select></div>
      <div class="field"><label>Valor estimado</label><div class="v num" style="padding-top:7px;font-size:17px;font-weight:600">${brl(l.valorEstimado)}</div></div>
      <div class="field"><label>Responsável</label><div class="v" style="padding-top:9px">${esc(nomeUsuario(l.responsavel))}</div></div>
    </div>
    <div class="dl">
      <div><div class="k">Telefone</div><div class="v">${esc(l.telefone||"—")}</div></div>
      <div><div class="k">E-mail</div><div class="v">${esc(l.email||"—")}</div></div>
      <div><div class="k">Vidas / itens</div><div class="v num">${l.vidas||"—"}</div></div>
      <div><div class="k">Último contato</div><div class="v num">${dt(l.ultimoContato)}</div></div>
      <div><div class="k">Última alteração</div><div class="v">${esc(l.atualizadoPorNome||"—")}<div class="hint">${esc(quandoRel(l.atualizadoEm))}</div></div></div>
    </div>
    ${(()=>{ const E=estimativaLead(l); if(!E.total) return "";
      return `<div class="panel com" style="box-shadow:none;background:var(--surface-2)">
        <div class="panel-head"><div><h3>Se fechar como previsto</h3>
          <div class="sub">${E.manual?"parcelas montadas neste lead":esc(E.regra?E.regra.nome:"")} · comissão prevista</div></div></div>
        <div class="chart-wrap"><div class="dl">
          <div><div class="k">Fecha em</div><div class="v num">${dt(E.fecha)}</div>
            <div class="hint">${E.meses===0?"neste mês":`em ${E.meses} ${E.meses===1?"mês":"meses"}`}</div></div>
          <div><div class="k">Comissão estimada</div><div class="v num">${brl(E.total)}</div>
            <div class="hint">${E.linhas.length} parcelas</div></div>
          <div><div class="k">Probabilidade</div><div class="v num">${pct(E.prob*100)}</div>
            <div class="hint">pela etapa atual</div></div>
          <div><div class="k">Valor ponderado</div><div class="v num">${brl(E.ponderado)}</div>
            <div class="hint">entra na projeção</div></div>
        </div></div></div>`; })()}
    ${l.obs?`<div><div class="k" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-weight:600">Observações</div><div style="margin-top:4px">${esc(l.obs)}</div></div>`:""}
    <div class="field"><label for="dNota">Registrar interação</label>
      <div style="display:flex;gap:8px"><input id="dNota" type="text" placeholder="Ligou, pediu proposta para 12 vidas…">
      <button class="btn" data-act="addNota" data-id="${esc(l.id)}">Registrar</button></div></div>
    <div class="timeline">${(l.historico||[]).slice(0,10).map(h=>`
      <div class="tl"><span class="tl-d"></span><div class="tl-c"><div>${esc(h.texto)}</div>
        <div class="tl-m">${dt(h.data)} · ${esc(h.autor||"")}</div></div></div>`).join("") || `<div class="hint">Sem histórico ainda.</div>`}</div>
  </div>
  <div class="m-foot">
    <button class="btn ghost danger left" data-act="excluirLead" data-id="${esc(l.id)}">Excluir</button>
    <button class="btn ghost" data-act="tarefaDeLead" data-id="${esc(l.id)}">Agendar follow-up</button>
    <button class="btn" data-act="editarLead" data-id="${esc(l.id)}">Editar</button>
    <button class="btn primary" data-act="converter" data-id="${esc(l.id)}">Marcar como ganho</button>
  </div>`);
}
function abrirPerda(l){
  abrirModal(`
  <div class="m-head"><div><h2>Lead perdido</h2><div class="sub">${esc(l.nome)} — registrar o motivo ajuda a melhorar a abordagem</div></div></div>
  <div class="m-body">
    <div class="field"><label for="pMotivo">Motivo</label><select id="pMotivo">${S.config.motivosPerda.map(m=>`<option>${esc(m)}</option>`).join("")}</select></div>
    <div class="field"><label for="pDet">Detalhe</label><textarea id="pDet" placeholder="Fechou com a concorrência por R$ 180 a menos por vida."></textarea></div>
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="confirmarPerda" data-id="${esc(l.id)}">Registrar perda</button></div>`);
}

/* ---------- conversão lead → cliente + contrato ---------- */
function abrirConversao(l){
  const regras = S.config.regras.filter(r=>r.pilar===l.pilar);
  const sugerida = regraPorId(l.regraId) || regras[0];
  const inicio = hoje();
  const doLead = (l.comissoesPrevistas||[]).length;
  abrirEditor(doLead
    ? { comissoes: l.comissoesPrevistas }
    : (sugerida && Number(l.valorEstimado)>0
        ? { comissoes: gerarCronograma({ valorBase:Number(l.valorEstimado), inicio,
            fim:addDays(addMonths(inicio,12),-1), regraId:sugerida.id, comissoes:[] }) }
        : null), "contrato");
  editorAuto = !doLead && !!sugerida;
  abrirModal(`
  <div class="m-head"><div><h2>Fechar negócio</h2>
    <div class="sub">${esc(l.nome)} vira cliente${doLead?" · cronograma trazido do lead"
      :(sugerida?` · cronograma sugerido pela régua ${esc(sugerida.nome)}`:"")} — ajuste o que for diferente</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="kNome">Cliente</label><input id="kNome" type="text" value="${esc(l.empresa||l.nome)}"></div>
      <div class="field"><label for="kTipo">Tipo</label><select id="kTipo"><option value="PJ" ${l.empresa?"selected":""}>PJ</option><option value="PF" ${!l.empresa?"selected":""}>PF</option></select></div>
      <div class="field"><label for="kDoc">CNPJ / CPF</label><input id="kDoc" type="text" placeholder="00.000.000/0001-00"></div>
    </div>
    ${camposContrato({ pilar:l.pilar, valorBase:l.valorEstimado, vidas:l.vidas, corretor:l.responsavel,
        regraId:sugerida?sugerida.id:"", inicio }, true)}
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="confirmarConversao" data-id="${esc(l.id)}">Fechar negócio</button></div>`, true);
}
let editorParcelas = [];        // cronograma em edição no formulário aberto
let editorAlvo = "contrato";    // "contrato" (com split) ou "lead" (previsto)
let editorBasePct = "base";     // "base" = mensalidade/prêmio · "total" = valor do contrato

/** Sobre o que os percentuais incidem. Consórcio cobra sobre o crédito, não sobre a parcela. */
function basePadrao(pilar){ return pilar==="consorcios" ? "total" : "base"; }
/** Valor contra o qual os percentuais de um contrato são calculados. */
function baseCalculo(c){
  const modo = c && c.basePct ? c.basePct : basePadrao(c && c.pilar);
  const total = Number(c && c.valorTotal)||0;
  return modo==="total" && total ? total : (Number(c && c.valorBase)||0);
}

/* ---------- régua que se preenche sozinha ----------
   Escolhida a régua e informado o valor, o cronograma aparece pronto.
   Enquanto ninguém mexer à mão, mudar o valor, as datas ou a régua
   refaz tudo; depois da primeira edição manual, o que foi digitado manda. */
let editorAuto = false, assinaturaRegua = "";
function preencherPelaRegua(regraId, silencioso, forcar){
  const regra = regraPorId(regraId); if(!regra) return false;
  const ctx = ctxContrato(null);
  if(!ctx.base){
    if(!silencioso) toast("Informe o valor (mensalidade, prêmio ou crédito) e as parcelas se preenchem pela régua.");
    return false;
  }
  // nada mudou desde o último preenchimento: não redesenha (redesenhar no blur do campo
  // de valor apagava a célula que a pessoa estava clicando)
  const assinatura = [regra.id, ctx.base, ctx.inicio, val("kFim"), ctx.basePct].join("|");
  if(!forcar && editorAuto && assinatura===assinaturaRegua && editorParcelas.length) return true;
  assinaturaRegua = assinatura;
  const falso = { valorBase:ctx.base, inicio:ctx.inicio, fim: val("kFim") || addDays(addMonths(ctx.inicio,12),-1), regraId:regra.id, comissoes:[] };
  const geradas = gerarCronograma(falso).map(p=>({ tipo:p.tipo, vence:p.vence, pct:p.pct, valor:p.valor,
    status:"previsto", recebidoEm:"", valorRecebido:null, impostoPct:null }));
  const recebidas = editorParcelas.filter(p=>p.status==="recebido");
  const ocupado = new Set(recebidas.map(p=>(p.tipo||"agenciamento")+":"+String(p.vence||"").slice(0,7)));
  editorParcelas = recebidas.concat(geradas.filter(p=>!ocupado.has(p.tipo+":"+p.vence.slice(0,7))))
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
  editorAuto = true;
  renderEditor();
  return true;
}
async function trocouRegua(){
  const id = val("kRegra");
  if(!id){ editorAuto = false; return; }
  const previstas = editorParcelas.filter(p=>p.status!=="recebido").length;
  if(previstas && !editorAuto){
    const ok = await confirmar("Preencher pela régua",
      `As ${previstas} parcela(s) previstas desta tela serão trocadas pelas da régua escolhida. As já recebidas ficam como estão.`,
      "Preencher pela régua");
    if(!ok) return;
  }
  if(!preencherPelaRegua(id, false, true)) editorAuto = true;
}
/** Alíquota do contrato em edição: a do campo, senão a padrão. */
function aliquotaEditor(){
  const el = document.getElementById("kImposto");
  return el && el.value!=="" ? paraNumero(el.value) : (Number(S.config.impostoPadrao)||0);
}
/** Como o cronograma em edição entra na previsão dos próximos 12 meses. */
function impactoPrevisao(){
  const meses = proximosMeses(12);
  const v = meses.map(m=>editorParcelas.filter(p=>p.status!=="recebido" && String(p.vence||"").slice(0,7)===m)
    .reduce((a,p)=>a+(Number(p.valor)||0),0));
  const tot = v.reduce((a,b)=>a+b,0);
  if(!tot) return "";
  const max = Math.max(...v), aliq = aliquotaEditor();
  return `<div class="impacto">
    <div class="hint" style="margin-bottom:8px"><b style="color:var(--ink-2)">Como este contrato entra na previsão</b> · ${brl(tot)} nos próximos 12 meses${aliq?` · ${brl(tot*aliq/100)} de imposto (${pctR(aliq)})`:""}</div>
    <div class="impacto-barras">${meses.map((m,i)=>`<div title="${esc(mesLabel(m))}: ${esc(brl2(v[i]))}"><span style="height:${v[i]?Math.max(4, v[i]/max*46).toFixed(1):0}px"></span><em>${esc(mesLabel(m).slice(0,3))}</em></div>`).join("")}</div>
  </div>`;
}
function abrirEditor(c, alvo){
  editorAlvo = alvo || "contrato";
  editorAuto = false; assinaturaRegua = "";
  editorBasePct = (c && c.basePct) || basePadrao(c && c.pilar);
  editorParcelas = (c && c.comissoes ? c.comissoes : []).map(p=>({
    tipo:p.tipo||"agenciamento", vence:p.vence, pct:Number(p.pct)||0, valor:Number(p.valor)||0,
    status:p.status||"previsto", recebidoEm:p.recebidoEm||"", valorRecebido:p.valorRecebido??null, travado:!!p.travado,
    impostoPct: temValor(p.impostoPct) ? Number(p.impostoPct) : null
  }));
}
/** Base, split, pilar e início: do DOM quando o formulário já existe; do contrato na primeira pintura. */
/** Trocar o pilar reabastece produto, operadora e réguas — e repinta o cronograma. */
function trocarPilar(){
  const pilar = val("kPilar");
  const setOpts = (id, arr) => { const el = document.getElementById(id);
    if(el) el.innerHTML = (arr||[]).map(o=>`<option>${esc(o)}</option>`).join(""); };
  setOpts("kProduto", S.config.produtos[pilar]);
  setOpts("kOperadora", S.config.operadoras[pilar]);
  editorBasePct = basePadrao(pilar);
  const rg = document.getElementById("kRegra");
  if(rg) rg.innerHTML = [`<option value="">— nenhuma, valores digitados —</option>`]
    .concat(S.config.regras.filter(r=>r.pilar===pilar).map(r=>`<option value="${r.id}">${esc(r.nome)}</option>`)).join("");
  const cx = document.getElementById("camposDoPilar");
  if(cx) cx.innerHTML = camposPilar(null, pilar);
  // régua do novo pilar: preenche sozinha se o cronograma ainda não foi mexido à mão
  const primeira = S.config.regras.find(r=>r.pilar===pilar);
  if(editorAlvo==="contrato" && rg && primeira && (editorAuto || !editorParcelas.some(p=>p.status!=="recebido"))){
    rg.value = primeira.id;
    if(editorAuto) editorParcelas = editorParcelas.filter(p=>p.status==="recebido");
    if(preencherPelaRegua(primeira.id, true)) return;
    editorAuto = true;
  }
  renderEditor();
}
function ctxContrato(c){
  if(editorAlvo==="lead"){
    const temL = !!document.getElementById("lValor");
    return {
      base:   temL ? numv("lValor") : Number(c&&c.valorEstimado)||0,
      mensalidade: temL ? numv("lValor") : Number(c&&c.valorEstimado)||0,
      valorTotal: 0, basePct:"base",
      vidas:  temL ? numv("lVidas") : Number(c&&c.vidas)||0,
      split:  0, comSplit:false,
      pilar:  temL ? val("lPilar") : ((c&&c.pilar)||"saude"),
      inicio: temL ? (val("lPrev")||hoje()) : ((c&&c.previsaoFechamento)||addDays(hoje(),30))
    };
  }
  const temDom = !!document.getElementById("kValor");
  const splitPadrao = c && c.splitPct!=null ? Number(c.splitPct)
    : (S.usuarios.find(u=>u.id===((c&&c.corretor)||S.uid))?.splitPct ?? 50);
  const mensalidade = temDom ? numv("kValor") : Number(c&&c.valorBase)||0;
  const valorTotal  = temDom ? numv("kValorTotal") : Number(c&&c.valorTotal)||0;
  const usaTotal = editorBasePct==="total" && valorTotal>0;
  return {
    base:   usaTotal ? valorTotal : mensalidade,
    mensalidade, valorTotal, basePct: editorBasePct,
    vidas:  temDom ? numv("kVidas") : Number(c&&c.vidas)||0,
    split:  temDom ? numv("kSplit") : splitPadrao,
    pilar:  temDom ? val("kPilar")  : ((c&&c.pilar)||"saude"),
    inicio: temDom ? (val("kInicio")||hoje()) : ((c&&c.inicio)||hoje()),
    comSplit: true
  };
}
/* ---------- os campos que só existem em um pilar ---------- */
const MODALIDADES_SAUDE = ["Empresarial","Adesão","Individual/Familiar","MEI","Odontológico"];
const RAMOS_SEGURO = ["Vida","Vida em grupo","Auto","Residencial","Empresarial","Equipamentos","Responsabilidade civil","Transportes","Rural","Outro"];
const BENS_CONSORCIO = ["Imóvel","Automóvel","Caminhão / pesado","Serviços","Moto","Outro"];

/** Cada pilar tem o que a operação dele exige. Compartilhar uma ficha só
    comissiona bem e opera mal — por isso este bloco muda com o pilar. */
function camposPilar(c, pilar){
  c = c || {};
  if(pilar==="saude") return `
    <div class="frow">
      <div class="field"><label for="kModalidade">Modalidade</label><select id="kModalidade">
        <option value="">—</option>${MODALIDADES_SAUDE.map(m=>`<option ${c.modalidade===m?"selected":""}>${esc(m)}</option>`).join("")}</select></div>
      <div class="field"><label for="kAniversario">Mês de reajuste</label><select id="kAniversario">
        <option value="">—</option>${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${String(c.mesReajuste)===String(m)?"selected":""}>${MESES[m-1]}</option>`).join("")}</select>
        <span class="hint">O aniversário do contrato, quando a operadora reajusta.</span></div>
      <div class="field"><label for="kReajuste">Último reajuste (%)</label><input id="kReajuste" type="number" step="0.01" value="${c.ultimoReajuste||""}"></div>
    </div>`;
  if(pilar==="seguros") return `
    <div class="frow">
      <div class="field"><label for="kApolice">Nº da apólice</label><input id="kApolice" type="text" value="${esc(c.apolice||"")}"></div>
      <div class="field"><label for="kRamo">Ramo</label><select id="kRamo">
        <option value="">—</option>${RAMOS_SEGURO.map(r=>`<option ${c.ramo===r?"selected":""}>${esc(r)}</option>`).join("")}</select></div>
      <div class="field"><label for="kImportancia">Importância segurada (R$)</label><input id="kImportancia" type="number" step="1000" value="${c.importanciaSegurada||""}">
        <span class="hint">O capital, não o prêmio.</span></div>
    </div>`;
  if(pilar==="consorcios") return `
    <div class="frow">
      <div class="field"><label for="kGrupo">Grupo</label><input id="kGrupo" type="text" value="${esc(c.grupo||"")}"></div>
      <div class="field"><label for="kCota">Cota</label><input id="kCota" type="text" value="${esc(c.cota||"")}"></div>
      <div class="field"><label for="kBem">Bem</label><select id="kBem">
        <option value="">—</option>${BENS_CONSORCIO.map(b=>`<option ${c.bem===b?"selected":""}>${esc(b)}</option>`).join("")}</select></div>
      <div class="field"><label for="kPrazo">Prazo (meses)</label><input id="kPrazo" type="number" value="${c.prazoMeses||""}"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="kParcela">Valor da parcela (R$)</label><input id="kParcela" type="number" step="10" value="${c.valorParcela||""}"></div>
      <div class="field"><label for="kContemplado">Contemplação</label><select id="kContemplado" data-act="mudouContemplacao">
        <option value="" ${!c.contemplado?"selected":""}>Não contemplado</option>
        <option value="sorteio" ${c.contemplado==="sorteio"?"selected":""}>Sorteio</option>
        <option value="lance" ${c.contemplado==="lance"?"selected":""}>Lance</option></select></div>
      <div class="field"><label for="kContempladoEm">Data da contemplação</label><input id="kContempladoEm" type="date" value="${esc(c.contempladoEm||"")}"></div>
    </div>`;
  return "";
}
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function camposContrato(c, comEditor){
  c = c || {};
  const pilar = c.pilar || "saude";
  return `
  <div class="frow">
    <div class="field"><label for="kPilar">Pilar</label><select id="kPilar" data-act="recalcPilar">${PK.map(x=>`<option value="${x}" ${pilar===x?"selected":""}>${PILARES[x].nome}</option>`).join("")}</select></div>
    <div class="field"><label for="kProduto">Produto</label><select id="kProduto">${(S.config.produtos[pilar]||[]).map(x=>`<option ${c.produto===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
    <div class="field"><label for="kOperadora">Operadora</label><select id="kOperadora">${(S.config.operadoras[pilar]||[]).map(o=>`<option ${c.operadora===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
  </div>
  <div class="frow">
    <div class="field"><label for="kNumero">Nº da proposta</label><input id="kNumero" type="text" value="${esc(c.numero||"")}"></div>
    <div class="field"><label for="kVidas">Vidas / itens</label><input id="kVidas" type="number" value="${c.vidas||""}" data-act="recalcVidas"></div>
    <div class="field"><label for="kStatus">Situação</label><select id="kStatus" data-act="mudouStatusContrato">${Object.entries(STATUS_CONTRATO).map(([k,v])=>`<option value="${k}" ${c.status===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
    <div class="field"><label for="kTipoPlano">Tipo de plano</label><select id="kTipoPlano">
      ${(S.config.tiposPlano||[]).map(t=>`<option ${tipoPlano(c)===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
  </div>
  <div class="frow" id="campoCancelamento" ${c.status==="cancelado"?"":'style="display:none"'}>
    <div class="field"><label for="kMotivoCancel">Motivo do cancelamento</label><select id="kMotivoCancel">
      <option value="">— escolha —</option>${(S.config.motivosCancelamento||[]).map(m=>`<option ${c.motivoCancelamento===m?"selected":""}>${esc(m)}</option>`).join("")}</select>
      <span class="hint">Alimenta a retenção e o quadro de motivos nos relatórios.</span></div>
    <div class="field"><label for="kCanceladoEm">Cancelado em</label><input id="kCanceladoEm" type="date" value="${esc(c.canceladoEm||hoje())}"></div>
  </div>
  <div id="camposDoPilar">${camposPilar(c, pilar)}</div>
  <div class="frow">
    <div class="field"><label for="kValor">Mensalidade / prêmio / crédito (R$)</label><input id="kValor" type="number" step="10" value="${c.valorBase||""}" data-act="recalcBase"></div>
    <div class="field"><label for="kInicio">Início da vigência</label><input id="kInicio" type="date" value="${c.inicio||hoje()}"></div>
    <div class="field"><label for="kFim">Fim da vigência</label><input id="kFim" type="date" value="${c.fim||addDays(addMonths(c.inicio||hoje(),12),-1)}"></div>
    <div class="field"><label for="kDiaVenc">Vencimento do boleto (dia)</label>
      <input id="kDiaVenc" type="number" min="1" max="31" value="${c.diaVencimento||""}" placeholder="10">
      <span class="hint">Alimenta os lembretes de pós-venda.</span></div>
    <div class="field"><label for="kValorTotal">Valor do contrato (R$)</label>
      <div style="display:flex;gap:6px">
        <input id="kValorTotal" type="number" step="0.01" value="${c.valorTotal||""}" placeholder="0,00">
        <button type="button" class="btn sm" data-act="calcularTotal" title="Calcular pela vigência" style="flex:none">=</button>
      </div>
      <span class="hint">O tamanho do negócio. O <b>=</b> multiplica a mensalidade pelos meses de vigência.</span></div>
  </div>
  <div class="frow">
    <div class="field"><label for="kCorretor">Corretor</label><select id="kCorretor">${optUsuarios(c.corretor||S.uid)}</select></div>
    ${veCorretora()?`<div class="field"><label for="kSplit">Split do corretor (%)</label><input id="kSplit" type="number" step="5" value="${c.splitPct??(S.usuarios.find(u=>u.id===(c.corretor||S.uid))?.splitPct ?? 50)}" data-act="recalcSplit"></div>
    <div class="field"><label for="kImposto">Imposto sobre a comissão (%)</label><input id="kImposto" type="number" step="0.01" min="0" value="${temValor(c.impostoPct)?c.impostoPct:""}" placeholder="${pctR(Number(S.config.impostoPadrao)||0)} (padrão)" data-act="recalcSplit">
      <span class="hint">Vazio = usa o padrão de Configurações.</span></div>`:""}
    <div class="field"><label for="kRegra">Régua de comissão</label>
      <select id="kRegra" data-act="trocaRegua">${[`<option value="">— nenhuma, valores digitados —</option>`]
        .concat(S.config.regras.filter(r=>r.pilar===pilar).map(r=>`<option value="${r.id}" ${c.regraId===r.id?"selected":""}>${esc(r.nome)}</option>`)).join("")}</select>
      <span class="hint">${veCorretora()?"Escolha a régua e informe o valor: as parcelas se preenchem sozinhas e continuam editáveis.":"Define como a comissão deste contrato é calculada."}</span></div>
  </div>
  ${comEditor?`<div id="editorComissao">${editorHTML(ctxContrato(c))}</div>`:""}`;
}

/* ---------- cronograma editável ---------- */
/** Valor já lançado para a n-ésima comissão de agenciamento, para o campo abrir preenchido. */
function valorMontagem(i, porVida, vidas){
  const ag = editorParcelas.filter(p=>p.tipo==="agenciamento")
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
  const p = ag[i-1];
  if(!p) return "";
  if(porVida) return p.valorVida!=null ? p.valorVida : (vidas ? +(p.valor/vidas).toFixed(2) : "");
  return p.valor;
}
/** O bloco recorrente já lançado: valor por mês, mês inicial e quantidade. */
function valorDemais(porVida, vidas){
  const vi = editorParcelas.filter(p=>p.tipo==="vitalicio")
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
  if(!vi.length) return { valor:"", ini:4, meses:0 };
  const inicio = ctxContrato(null).inicio;
  const mesRef = v => Math.max(1, Math.round(diasEntre(inicio, v)/30.44));
  const p = vi[0];
  let valor;
  if(S.unidadeVit==="pct") valor = p.pct ? +Number(p.pct).toFixed(2) : "";
  else valor = porVida ? (p.valorVida!=null ? p.valorVida : (vidas ? +(p.valor/vidas).toFixed(2) : "")) : p.valor;
  return { valor, ini:mesRef(p.vence), meses:vi.length };
}
/** Traduz o que foi digitado: por vida vira total, e o total vira % da base. */
function dicaPct(valor, base, porVida, vidas, ehVitalicio){
  const v = Number(valor)||0;
  if(!v) return "&nbsp;";
  if(ehVitalicio && S.unidadeVit==="pct"){
    if(!base) return editorBasePct==="total" ? "informe o valor do contrato" : "informe a mensalidade";
    return `${pctR(v)} de ${brl(base)} = ${brl2(base*v/100)}/mês`;
  }
  if(porVida){
    if(!vidas) return "informe as vidas";
    const tot = v*vidas;
    return `× ${vidas} vidas = ${brl2(tot)}${base?` · ${pctR(tot/base*100)} da base`:""}`;
  }
  if(!base) return "&nbsp;";
  return pctR(v/base*100)+" da base";
}
function editorHTML(ctx){
  const { base, split, pilar, inicio, comSplit, vidas } = ctx || ctxContrato(null);
  const porVida = S.modoMontagem==="vida";
  const vitEmPct = S.unidadeVit==="pct";
  const basePctAtual = (ctx||ctxContrato(null)).basePct;
  const valorTotalCtx = (ctx||ctxContrato(null)).valorTotal;
  const noLead = editorAlvo==="lead";
  const total = editorParcelas.reduce((a,p)=>a+(Number(p.valor)||0),0);
  const ag = editorParcelas.filter(p=>p.tipo==="agenciamento");
  const vi = editorParcelas.filter(p=>p.tipo==="vitalicio");

  // Quem não enxerga o lado da corretora não monta cronograma: vê o que é dele, em leitura.
  if(!veCorretora()){
    const meu = v => +((Number(v)||0)*(Number(split)||0)/100).toFixed(2);
    return `<div class="panel" style="box-shadow:none">
      <div class="panel-head"><div><h3>Sua comissão</h3>
        <div class="sub">${editorParcelas.length?`${editorParcelas.length} parcela(s) previstas`:"O gestor monta o cronograma depois de registrar o contrato"}</div></div>
        <div class="right"><b class="num" style="font-size:16px">${brl2(meu(total))}</b></div></div>
      ${editorParcelas.length?`<div class="tw"><table>
        <thead><tr><th>#</th><th>Tipo</th><th>Data prevista</th><th class="r">Sua comissão</th><th>Situação</th></tr></thead>
        <tbody>${editorParcelas.map((p,i)=>`<tr>
          <td class="num">${i+1}</td>
          <td>${esc((TIPO_PARCELA[p.tipo]||TIPO_PARCELA.agenciamento).nome)}</td>
          <td class="num">${dt(p.vence||hoje())}</td>
          <td class="r num"><b>${brl2(meu(p.valor))}</b></td>
          <td>${p.status==="recebido"?`<span class="chip ok">recebida</span>`:`<span class="chip mute">prevista</span>`}</td>
        </tr>`).join("")}</tbody></table></div>`:""}
      <div class="hint" style="padding:10px 2px 0">Quem define o cronograma de comissão é o gestor. Aqui você acompanha a sua parte.</div>
    </div>`;
  }

  return `<div class="panel" style="box-shadow:none">
    <div class="panel-head"><div><h3>${noLead?"Comissionamento previsto":"Cronograma de comissão"}</h3>
      <div class="sub">${editorParcelas.length?`${ag.length} de agenciamento · ${vi.length} de vitalício${editorAuto&&!noLead?" · preenchido pela régua, edite o que precisar":""}`:(noLead?"Monte aqui o que espera receber se o negócio fechar":"Escolha a régua e informe o valor — ou digite parcela a parcela")}</div></div>
      <div class="right"><b class="num" style="font-size:16px">${brl2(total)}</b></div></div>

    <div class="chart-wrap" style="padding-bottom:14px;border-bottom:1px solid var(--line)">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:11px">
        <div class="k" style="font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-weight:600">Montar o cronograma</div>
        <div class="seg" role="group" aria-label="Como informar os valores">
          <button type="button" data-act="modoMontagem" data-v="total" aria-pressed="${!porVida}">Valor total</button>
          <button type="button" data-act="modoMontagem" data-v="vida" aria-pressed="${porVida}">Por vida</button>
        </div>
        ${porVida?`<div class="field" style="flex:none;min-width:104px"><label for="qcVidas">Vidas</label>
          <input id="qcVidas" type="number" min="1" value="${vidas||""}" placeholder="0" data-act="pctMontagem"></div>`:""}
      </div>
      ${editorAlvo==="contrato"?`<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:11px">
        <span class="hint" style="font-weight:600">Percentuais incidem sobre</span>
        <div class="seg" role="group" aria-label="Base de cálculo dos percentuais">
          <button type="button" data-act="basePct" data-v="base" aria-pressed="${basePctAtual!=="total"}">Mensalidade / prêmio</button>
          <button type="button" data-act="basePct" data-v="total" aria-pressed="${basePctAtual==="total"}">Valor do contrato</button>
        </div>
        <span class="hint">${base?`= ${brl(base)}`:"preencha o valor correspondente"}${
          basePctAtual==="total" && !valorTotalCtx ? ` <b style="color:var(--warn)">— sem valor do contrato, usando a mensalidade</b>` : ""}</span>
      </div>`:""}
      <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(122px,1fr))">
        ${[1,2,3].map(i=>`<div class="field">
          <label for="qc${i}">${i}ª comissão (${porVida?"R$/vida":"R$"})</label>
          <input id="qc${i}" type="number" step="0.01" value="${valorMontagem(i, porVida, vidas)}" placeholder="0,00" data-act="pctMontagem">
          <span class="hint" id="qcPct${i}">${dicaPct(valorMontagem(i, porVida, vidas), base, porVida, vidas)}</span></div>`).join("")}
      </div>
      <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(122px,1fr));margin-top:10px">
        <div class="field"><label for="qcDemais">Demais meses ${vitEmPct?(basePctAtual==="total"?"(% do contrato)":"(% da mensalidade)"):(porVida?"(R$/vida/mês)":"(R$/mês)")}</label>
          <div style="display:flex;gap:5px">
            <input id="qcDemais" type="number" step="0.01" value="${valorDemais(porVida, vidas).valor||""}" placeholder="${vitEmPct?"3":"0,00"}" data-act="pctMontagem">
            <div class="seg" style="flex:none" role="group" aria-label="Unidade do vitalício">
              <button type="button" data-act="unidadeVit" data-v="pct" aria-pressed="${vitEmPct}" style="padding:4px 8px">%</button>
              <button type="button" data-act="unidadeVit" data-v="valor" aria-pressed="${!vitEmPct}" style="padding:4px 8px">R$</button>
            </div>
          </div>
          <span class="hint" id="qcPctD">${dicaPct(valorDemais(porVida, vidas).valor, base, porVida, vidas, true)}</span></div>
        <div class="field"><label for="qcIni">A partir do mês</label>
          <input id="qcIni" type="number" min="1" value="${valorDemais().ini||4}"></div>
        <div class="field"><label for="qcMeses">Por quantos meses</label>
          <input id="qcMeses" type="number" min="0" value="${valorDemais().meses||0}">
          <span class="hint">0 = até o fim da vigência</span></div>
        <div class="field"><label>&nbsp;</label>
          <button type="button" class="btn primary" data-act="montarCronograma" style="width:100%">Montar cronograma</button></div>
      </div>
      <div class="hint" style="margin-top:9px">As três primeiras vencem 1, 2 e 3 meses após ${noLead?"a previsão de fechamento":"o início da vigência"} (${dt(inicio)}). Deixe em branco o que a operadora não paga. Parcelas já conciliadas são preservadas.</div>
      <details style="margin-top:12px">
        <summary style="cursor:pointer;font-size:11.5px;color:var(--ink-3);font-weight:600">Outras formas de preencher</summary>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
          <div class="field" style="min-width:200px"><label for="kAtalho">A partir de uma régua salva</label>
            <select id="kAtalho">${S.config.regras.filter(r=>r.pilar===pilar).map(r=>`<option value="${r.id}">${esc(r.nome)}</option>`).join("")||`<option value="">nenhuma régua neste pilar</option>`}</select></div>
          <button type="button" class="btn" data-act="aplicarRegua">Preencher</button>
          <button type="button" class="btn ghost" data-act="addParcela">+ Parcela avulsa</button>
          ${editorParcelas.length?`<button type="button" class="btn ghost danger" data-act="limparParcelas">Limpar tudo</button>`:""}
        </div>
      </details>
    </div>

    ${editorParcelas.length?`<div class="tw"><table>
      <thead><tr><th>#</th><th>Tipo</th><th>Data prevista</th><th class="r">% ${basePctAtual==="total"?"do contrato":"da base"}</th><th class="r">Valor R$</th>${vidas?`<th class="r">Por vida</th>`:""}${comSplit?(veCorretora()?`<th class="r">Corretora</th><th class="r">Corretor</th>`:`<th class="r">Sua parte</th>`):""}<th></th></tr></thead>
      <tbody>${editorParcelas.map((p,i)=>`<tr>
        <td class="num">${i+1}</td>
        <td><select data-linha="${i}" data-campo="tipo" style="padding:4px 6px;font-size:12px">
          ${Object.entries(TIPO_PARCELA).map(([k,v])=>`<option value="${k}" ${p.tipo===k?"selected":""}>${v.nome}</option>`).join("")}</select></td>
        <td><input type="date" data-linha="${i}" data-campo="vence" value="${esc(p.vence||hoje())}" style="padding:4px 6px;font-size:12px;min-width:132px"></td>
        <td><input type="number" step="0.01" data-linha="${i}" data-campo="pct" value="${p.pct||""}" style="padding:4px 6px;font-size:12px;text-align:right;min-width:78px"></td>
        <td><input type="number" step="0.01" data-linha="${i}" data-campo="valor" value="${p.valor||""}" style="padding:4px 6px;font-size:12px;text-align:right;min-width:96px"></td>
        ${vidas?`<td class="r num" data-cel="pvida-${i}" style="color:var(--ink-3)">${brl2((Number(p.valor)||0)/vidas)}</td>`:""}
        ${comSplit?`${veCorretora()?`<td class="r num" data-cel="corretora-${i}">${brl2((Number(p.valor)||0)*(100-split)/100)}</td>`:""}
        <td class="r num" data-cel="corretor-${i}">${brl2((Number(p.valor)||0)*split/100)}</td>`:""}
        <td class="r">${p.status==="recebido"
          ? `<span class="chip ok" title="Já conciliada">recebida</span>`
          : `<button type="button" class="btn sm ghost danger" data-act="delParcela" data-i="${i}" aria-label="Remover parcela ${i+1}">×</button>`}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr>
        <td colspan="4" class="r"><b>Total</b></td>
        <td class="r num"><b data-cel="total">${brl2(total)}</b></td>
        ${vidas?`<td class="r num" style="color:var(--ink-3)">${brl2(total/vidas)}</td>`:""}
        ${comSplit?`${veCorretora()?`<td class="r num" data-cel="totalCorretora">${brl2(total*(100-split)/100)}</td>`:""}
        <td class="r num" data-cel="totalCorretor">${brl2(total*split/100)}</td>`:""}<td></td>
      </tr></tfoot>
    </table></div>`:`<div class="empty" style="padding:22px"><b>Nenhuma parcela</b>${editorAlvo==="contrato"&&val("kRegra")?"Informe o valor da mensalidade, prêmio ou crédito e o cronograma aparece pela régua escolhida.":"Preencha por uma régua, gere o vitalício abaixo, ou acrescente parcelas avulsas."}</div>`}
    ${noLead?"":`<div id="impactoPrev">${impactoPrevisao()}</div>`}
  </div>`;
}
function renderEditor(){
  const el = document.getElementById("editorComissao");
  if(el) el.innerHTML = editorHTML(ctxContrato(null));
}
/** Recalcula as colunas derivadas sem redesenhar a tabela (não perde o foco). */
function atualizarDerivados(){
  const ctx = ctxContrato(null);
  const split = ctx.split, vidas = ctx.vidas;
  const total = editorParcelas.reduce((a,p)=>a+(Number(p.valor)||0),0);
  editorParcelas.forEach((p,i)=>{
    const v = Number(p.valor)||0;
    const a = document.querySelector(`[data-cel="corretora-${i}"]`); if(a) a.textContent = brl2(v*(100-split)/100);
    const b = document.querySelector(`[data-cel="corretor-${i}"]`);  if(b) b.textContent = brl2(v*split/100);
    const pv = document.querySelector(`[data-cel="pvida-${i}"]`);    if(pv && vidas) pv.textContent = brl2(v/vidas);
  });
  const t = document.querySelector('[data-cel="total"]');           if(t) t.textContent = brl2(total);
  const tc = document.querySelector('[data-cel="totalCorretora"]'); if(tc) tc.textContent = brl2(total*(100-split)/100);
  const tb = document.querySelector('[data-cel="totalCorretor"]');  if(tb) tb.textContent = brl2(total*split/100);
  const ip = document.getElementById("impactoPrev"); if(ip) ip.innerHTML = impactoPrevisao();
}
/** Edição de uma célula: % e R$ se mantêm coerentes pela base do contrato. */
function editarLinha(i, campo, valor){
  const p = editorParcelas[i]; if(!p) return;
  editorAuto = false;
  const base = ctxContrato(null).base;
  if(campo==="tipo" || campo==="vence"){ p[campo] = valor; return; }
  const n = Number(String(valor).replace(",",".")) || 0;
  if(campo==="pct"){
    p.pct = n;
    p.valor = base ? +(base*n/100).toFixed(2) : p.valor;
    const outro = document.querySelector(`[data-linha="${i}"][data-campo="valor"]`);
    if(outro && base) outro.value = p.valor;
  } else {
    p.valor = n;
    p.pct = base ? +(n/base*100).toFixed(4) : 0;
    const outro = document.querySelector(`[data-linha="${i}"][data-campo="pct"]`);
    if(outro && base) outro.value = p.pct;
  }
  atualizarDerivados();
}
/** Base mudou: o % é a razão canônica, então os valores em R$ são refeitos a partir dele. */
function rebaseParcelas(){
  // cronograma que veio da régua e não foi mexido: refaz pela régua (vitalício acompanha a vigência)
  if(editorAuto && editorAlvo==="contrato" && val("kRegra") && preencherPelaRegua(val("kRegra"), true)) return;
  const base = ctxContrato(null).base;
  if(!base) return;
  editorParcelas.forEach((p,i)=>{
    if(!(p.pct>0) || p.status==="recebido") return;
    p.valor = +(base*p.pct/100).toFixed(2);
    const el = document.querySelector(`[data-linha="${i}"][data-campo="valor"]`);
    if(el) el.value = p.valor;
  });
  atualizarDerivados();
}
function lerContrato(base){
  const c = Object.assign({}, base||{}, {
    pilar:val("kPilar"), produto:val("kProduto"), operadora:val("kOperadora"),
    numero:val("kNumero"), vidas:numv("kVidas"), status:val("kStatus")||"proposta", tipoPlano:val("kTipoPlano"),
    valorBase:numv("kValor"), inicio:val("kInicio")||hoje(), fim:val("kFim"),
    diaVencimento: Math.min(31, Math.max(0, numv("kDiaVenc"))) || null,
    valorTotal: numv("kValorTotal") || null,
    // campos próprios de cada pilar — só grava os que a tela mostrou
    modalidade: document.getElementById("kModalidade") ? val("kModalidade") : (base||{}).modalidade,
    mesReajuste: document.getElementById("kAniversario") ? (numv("kAniversario")||null) : (base||{}).mesReajuste,
    ultimoReajuste: document.getElementById("kReajuste") ? (numv("kReajuste")||null) : (base||{}).ultimoReajuste,
    apolice: document.getElementById("kApolice") ? val("kApolice") : (base||{}).apolice,
    ramo: document.getElementById("kRamo") ? val("kRamo") : (base||{}).ramo,
    importanciaSegurada: document.getElementById("kImportancia") ? (numv("kImportancia")||null) : (base||{}).importanciaSegurada,
    grupo: document.getElementById("kGrupo") ? val("kGrupo") : (base||{}).grupo,
    cota: document.getElementById("kCota") ? val("kCota") : (base||{}).cota,
    bem: document.getElementById("kBem") ? val("kBem") : (base||{}).bem,
    prazoMeses: document.getElementById("kPrazo") ? (numv("kPrazo")||null) : (base||{}).prazoMeses,
    valorParcela: document.getElementById("kParcela") ? (numv("kParcela")||null) : (base||{}).valorParcela,
    contemplado: document.getElementById("kContemplado") ? val("kContemplado") : (base||{}).contemplado,
    contempladoEm: document.getElementById("kContempladoEm") ? val("kContempladoEm") : (base||{}).contempladoEm,
    motivoCancelamento: val("kStatus")==="cancelado" ? val("kMotivoCancel") : "",
    canceladoEm: val("kStatus")==="cancelado" ? (val("kCanceladoEm") || (base||{}).canceladoEm || hoje()) : "",
    regraId:val("kRegra"), corretor:val("kCorretor"),
    impostoPct: document.getElementById("kImposto") ? (val("kImposto")==="" ? null : numv("kImposto")) : ((base||{}).impostoPct ?? null),
    splitPct: document.getElementById("kSplit") ? numv("kSplit")
              : ((base||{}).splitPct ?? (S.usuarios.find(u=>u.id===((base||{}).corretor||S.uid))?.splitPct ?? 50)),
    basePct: editorBasePct
  });
  c.comissoes = editorParcelas
    .filter(p=>Number(p.valor)>0)
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""))
    .map((p,i)=>({ n:i+1, tipo:p.tipo||"agenciamento", pct:Number(p.pct)||0,
      valor:+(Number(p.valor)||0).toFixed(2), vence:p.vence||hoje(),
      status:p.status||"previsto", recebidoEm:p.recebidoEm||"",
      valorRecebido:p.valorRecebido??null, travado:!!p.travado,
      ...(temValor(p.impostoPct) ? { impostoPct:Number(p.impostoPct) } : {}) }));
  return c;
}
async function confirmarConversao(leadId){
  const l = S.leads.find(x=>x.id===leadId); if(!l) return;
  const nomeCliente = val("kNome") || l.nome;
  if(veCorretora() && !editorParcelas.some(p=>Number(p.valor)>0)){ toast("Acrescente ao menos uma parcela de comissão."); return; }
  // regra do cliente único: se o documento já está na carteira, o contrato novo
  // entra no cadastro que existe em vez de criar um segundo cliente
  const existente = clientePorDoc(val("kDoc"), null);
  if(existente && !await confirmar("Esse cliente já está na carteira",
      `${existente.nome} já usa esse documento. O contrato novo vai entrar no cadastro dele, somando-se aos produtos que ele já tem.`,
      "Adicionar ao cliente existente")) return;
  const cliente = existente || {
    id: uid("cli"), nome:nomeCliente, tipo:val("kTipo")||"PJ", doc:val("kDoc"),
    telefone:l.telefone||"", email:l.email||"", responsavel:l.responsavel||S.uid,
    origem:l.origem||"", criadoEm:hoje(), leadId:l.id, exemplo:!!l.exemplo
  };
  const contrato = lerContrato({ id:uid("ctr"), clienteId:cliente.id, clienteNome:cliente.nome, criadoEm:hoje(), exemplo:!!l.exemplo });
  l.etapa="ganho"; l.ultimoContato=hoje(); l.clienteId=cliente.id;
  l.historico=[{data:hoje(), texto:`Negócio fechado — contrato ${contrato.operadora} ${brl(contrato.valorBase)}`, autor:S.meNome}, ...(l.historico||[])];
  if(!existente) await salvar("clientes", cliente, "Criou");
  await salvar("contratos", contrato, existente ? "Novo produto para cliente da carteira —" : "Fechou negócio —");
  await salvar("leads", l, "Marcou como ganho");
  fecharModal();
  toast("Negócio fechado — cronograma de comissão gerado");
  ir("contratos");
}

/* ---------- contrato ---------- */
function formContrato(c){
  abrirEditor(c, "contrato");
  // contrato novo nasce com a primeira régua do pilar: basta digitar o valor
  if(!c){ editorAuto = true; }
  const cli = S.clientes.filter(x=>noEscopo(x) || (c && x.id===c.clienteId))
    .sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  return `
  <div class="m-head"><div><h2>${c?"Editar contrato":"Novo contrato"}</h2>
    <div class="sub">${veCorretora()?"Os valores da comissão são seus: digite linha a linha ou puxe de uma régua":"Registre o contrato — o cronograma de comissão é montado pelo gestor"}</div></div></div>
  <div class="m-body">
    <div class="field"><label for="kCliente">Cliente</label>
      <select id="kCliente">${cli.length?cli.map(x=>`<option value="${esc(x.id)}" ${c&&c.clienteId===x.id?"selected":""}>${esc(x.nome)}</option>`).join(""):`<option value="">— cadastre um cliente primeiro —</option>`}</select></div>
    ${camposContrato(c||{ regraId:(S.config.regras.find(r=>r.pilar==="saude")||{}).id }, true)}
  </div>
  <div class="m-foot">
    ${c&&podeExcluirCarteira()?`<button class="btn ghost danger left" data-act="excluirContrato" data-id="${esc(c.id)}">Excluir</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarContrato" data-id="${esc(c?c.id:"")}">Salvar contrato</button>
  </div>`;
}
async function salvarContrato(id){
  const clienteId = val("kCliente");
  if(!clienteId){ toast("Cadastre um cliente antes de registrar o contrato."); return; }
  if(veCorretora() && !editorParcelas.some(p=>Number(p.valor)>0)){ toast("Acrescente ao menos uma parcela de comissão."); return; }
  const cliente = S.clientes.find(x=>x.id===clienteId);
  const antigo = S.contratos.find(x=>x.id===id) || {};
  const c = lerContrato(Object.assign({}, antigo, {
    id: id || uid("ctr"), clienteId, clienteNome: cliente ? cliente.nome : "",
    criadoEm: antigo.criadoEm || hoje()
  }));
  await salvar("contratos", c);
  fecharModal(); toast(id?"Contrato atualizado":"Contrato registrado");
}
function abrirContrato(id){
  const c = S.contratos.find(x=>x.id===id); if(!c) return;
  if(!noEscopo(c,"corretor")){ toast("Esse contrato é de outro corretor."); return; }
  const regra = regraPorId(c.regraId);
  const parte = v => veCorretora() ? v : +(v*(Number(c.splitPct)||0)/100).toFixed(2);
  const total = parte((c.comissoes||[]).reduce((a,p)=>a+p.valor,0));
  const recebido = parte((c.comissoes||[]).filter(p=>p.status==="recebido").reduce((a,p)=>a+(p.valorRecebido??p.valor),0));
  const st = STATUS_CONTRATO[c.status]||STATUS_CONTRATO.proposta;
  abrirModal(`
  <div class="m-head"><div><h2>${esc(c.clienteNome)}</h2>
    <div class="sub">${esc(PILARES[c.pilar]?.curto||"")} · ${esc(c.produto||"")} · ${esc(c.operadora||"")} ${c.numero?"· nº "+esc(c.numero):""}</div></div>
    <span class="chip ${st.cls}" style="margin-left:auto">${st.nome}</span></div>
  <div class="m-body">
    <div class="dl">
      <div><div class="k">${esc(BASE_LABEL[regra?.base]||"Base")}</div><div class="v num" style="font-size:17px;font-weight:600">${brl(c.valorBase)}</div></div>
      <div><div class="k">Valor do contrato</div><div class="v num" style="font-size:17px;font-weight:600">${c.valorTotal?brl(c.valorTotal):"—"}</div></div>
      <div class="com"><div class="k">${veCorretora()?"Comissão total":"Sua comissão"}</div><div class="v num" style="font-size:17px;font-weight:600">${brl2(total)}${c.valorTotal?`<div class="hint">${pctR(total/c.valorTotal*100)} do contrato</div>`:""}</div></div>
      <div class="com"><div class="k">Já recebido</div><div class="v num" style="font-size:17px;font-weight:600;color:var(--ok)">${brl2(recebido)}</div></div>
      <div><div class="k">Vigência</div><div class="v num">${dt(c.inicio)} — ${dt(c.fim)}</div></div>
      <div><div class="k">Vidas / itens</div><div class="v num">${c.vidas||"—"}</div></div>
      ${veCorretora()?`<div><div class="k">Corretor</div><div class="v">${esc(nomeUsuario(c.corretor))} · split ${pct(c.splitPct||0)}</div></div>`:""}
      <div><div class="k">Última alteração</div><div class="v">${esc(c.atualizadoPorNome||"—")}<div class="hint">${esc(quandoRel(c.atualizadoEm))}</div></div></div>
    </div>
    ${contratoTemVida(c)?painelVidasContrato(c):""}
    <div class="panel com" style="box-shadow:none">
      <div class="panel-head"><div><h3>Cronograma de comissão</h3>
        <div class="sub">${(c.comissoes||[]).length} parcela(s)${veCorretora()?` · percentuais sobre ${(c.basePct||basePadrao(c.pilar))==="total"&&c.valorTotal?`o valor do contrato (${brl(c.valorTotal)})`:`a base (${brl(c.valorBase)})`}${regra?` · ${esc(regra.nome)}`:""}`:" · a coluna mostra a sua parte"}</div></div>
        ${veCorretora()?`<div class="right"><button class="btn sm" data-act="novaParcela" data-id="${esc(c.id)}">+ Comissão futura</button></div>`:""}</div>
      <div class="tw"><table>
        <thead><tr><th>#</th><th>Tipo</th><th>Data prevista</th>${veCorretora()?`<th class="r">%</th><th class="r">Valor</th><th class="r">Corretor</th>`:`<th class="r">Sua comissão</th>`}<th>Situação</th><th></th></tr></thead>
        <tbody>${(c.comissoes||[]).map(p=>{
          const venc = p.status==="previsto" && p.vence<hoje();
          const s = venc?STATUS_COM.atrasado:(STATUS_COM[p.status]||STATUS_COM.previsto);
          const v = p.status==="recebido"?(p.valorRecebido??p.valor):p.valor;
          return `<tr><td class="num">${p.n}</td>
            <td><span class="chip ${tipoP(p.tipo||"agenciamento").cls}">${tipoP(p.tipo||"agenciamento").nome}</span></td>
            <td class="num">${dt(p.vence)}</td>${veCorretora()?`<td class="r num">${pctR(p.pct)}</td>`:""}
            ${veCorretora()
              ? `<td class="r num">${brl2(v)}</td><td class="r num">${brl2(v*(Number(c.splitPct)||0)/100)}</td>`
              : `<td class="r num">${brl2(v*(Number(c.splitPct)||0)/100)}</td>`}
            <td><span class="chip ${s.cls}">${s.nome}</span></td>
            <td class="r" style="white-space:nowrap">${p.status==="recebido"
              ? (podeDesfazer()?`<button class="btn sm ghost" data-act="desconciliar" data-id="${esc(c.id)}" data-n="${p.n}">Desfazer</button>`:`<span class="hint">conciliada</span>`)
              : `<button class="btn sm" data-act="conciliar" data-id="${esc(c.id)}" data-n="${p.n}">Receber</button>`}
              ${podeDesfazer()?`<button class="btn sm ghost" data-act="editarParcela" data-id="${esc(c.id)}" data-n="${p.n}" aria-label="Editar parcela">✎</button>`:""}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>
  </div>
  <div class="m-foot">
    ${podeExcluirCarteira()?`<button class="btn ghost danger left" data-act="excluirContrato" data-id="${esc(c.id)}">Excluir</button>`:""}
    <button class="btn ghost" data-act="abrirCliente" data-id="${esc(c.clienteId)}">Ver cliente</button>
    <button class="btn" data-act="fechar">Fechar</button>
    <button class="btn primary" data-act="editarContrato" data-id="${esc(c.id)}">Editar</button>
  </div>`, true);
}

/* ---------- cliente ---------- */
function formCliente(c){
  c = c||{};
  return `
  <div class="m-head"><div><h2>${c.id?"Editar cliente":"Novo cliente"}</h2><div class="sub">${c.id?"Corrija ou complete os dados — o histórico da alteração fica registrado":"Dados cadastrais da carteira"}</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="xNome">Nome / razão social</label><input id="xNome" type="text" value="${esc(c.nome||"")}"></div>
      <div class="field"><label for="xTipo">Tipo</label><select id="xTipo" data-act="tipoCliente"><option ${c.tipo==="PJ"?"selected":""}>PJ</option><option ${c.tipo==="PF"?"selected":""}>PF</option></select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="xDoc">CNPJ / CPF</label><input id="xDoc" type="text" value="${esc(c.doc||"")}" inputmode="numeric" data-act="conferirDoc" data-id="${esc(c.id||"")}">
        <span class="hint" id="avisoDoc"></span></div>
      <div class="field"><label for="xNasc" id="lblNasc">${c.tipo==="PF"?"Data de nascimento":"Data de fundação"}</label><input id="xNasc" type="date" value="${esc(c.nascimento||"")}">
        <span class="hint" id="dicaNasc">${c.tipo==="PF"?"Entra no lembrete de aniversário.":"Aniversário da empresa — também entra no lembrete."}</span></div>
      <div class="field"><label for="xStatus">Situação</label><select id="xStatus">
        ${["ativo","prospecto","inativo","encerrado"].map(k=>`<option value="${k}" ${(c.status||"ativo")===k?"selected":""}>${k==="ativo"?"Ativo":k==="prospecto"?"Prospecto":k==="inativo"?"Inativo":"Encerrado"}</option>`).join("")}</select></div>
    </div>
    <div class="frow" id="blocoContatoPJ" ${c.tipo==="PF"?"hidden":""}>
      <div class="field"><label for="xContato">Contato principal</label><input id="xContato" type="text" value="${esc(c.contatoNome||"")}" placeholder="Quem fala pela empresa"></div>
      <div class="field"><label for="xContatoCargo">Cargo</label><input id="xContatoCargo" type="text" value="${esc(c.contatoCargo||"")}" placeholder="Sócio, RH, financeiro…"></div>
      <div class="field"><label for="xContatoNasc">Nascimento do contato</label><input id="xContatoNasc" type="date" value="${esc(c.contatoNascimento||"")}">
        <span class="hint">Também entra no lembrete de aniversário.</span></div>
      <div class="field"><label for="xContatoZap">WhatsApp do contato</label><input id="xContatoZap" type="tel" value="${esc(c.contatoWhatsapp||"")}" placeholder="com DDD"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="xTel">Telefone</label><input id="xTel" type="tel" value="${esc(c.telefone||"")}"></div>
      <div class="field"><label for="xZap">WhatsApp</label><input id="xZap" type="tel" value="${esc(c.whatsapp||"")}" placeholder="com DDD"></div>
      <div class="field"><label for="xEmail">E-mail</label><input id="xEmail" type="email" value="${esc(c.email||"")}"></div>
    </div>
    <div class="frow">
      <div class="field" style="flex:2"><label for="xEndereco">Endereço</label><input id="xEndereco" type="text" value="${esc(c.logradouro||"")}" placeholder="Rua, número, complemento"></div>
      <div class="field"><label for="xCep">CEP</label><input id="xCep" type="text" value="${esc(c.cep||"")}" inputmode="numeric"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="xCidade">Cidade</label><input id="xCidade" type="text" value="${esc(c.cidade||"")}"></div>
      <div class="field"><label for="xUf">UF</label><input id="xUf" type="text" maxlength="2" value="${esc(c.uf||"")}"></div>
      <div class="field"><label for="xOrigem">Origem</label><select id="xOrigem">
        <option value="">—</option>${(S.config.origens||[]).map(o=>`<option ${c.origem===o?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
      <div class="field"><label for="xResp">Responsável</label><select id="xResp">${optUsuarios(c.responsavel||S.uid)}</select></div>
    </div>
    <div class="field"><label for="xObs">Observações</label><textarea id="xObs">${esc(c.obs||"")}</textarea></div>
  </div>
  <div class="m-foot">
    ${c.id&&podeExcluirCarteira()?`<button class="btn ghost danger left" data-act="excluirCliente" data-id="${esc(c.id)}">Excluir</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarCliente" data-id="${esc(c.id||"")}">Salvar cliente</button>
  </div>`;
}
async function salvarCliente(id){
  const nome = val("xNome"); if(!nome){ toast("Informe o nome do cliente."); return; }
  const doc = val("xDoc");
  // a regra do cliente único: o mesmo CPF ou CNPJ não entra duas vezes
  const repetido = clientePorDoc(doc, id||null);
  if(repetido){
    const ok = await confirmar("Esse documento já está na carteira",
      `${repetido.nome} já usa o documento ${mascararDoc(doc)}. Dois cadastros do mesmo cliente quebram a visão consolidada da carteira — o certo é acrescentar o novo produto como contrato dentro do cadastro que já existe.`,
      "Abrir o cadastro existente");
    if(ok){ fecharModal(); abrirCliente(repetido.id); }
    return;
  }
  const antigo = S.clientes.find(x=>x.id===id)||{};
  const c = Object.assign({}, antigo, {
    id:id||uid("cli"), nome, tipo:val("xTipo"), doc, telefone:val("xTel"),
    whatsapp:val("xZap"), email:val("xEmail"), nascimento:val("xNasc"),
    logradouro:val("xEndereco"), cep:val("xCep"),
    cidade:val("xCidade"), uf:val("xUf").toUpperCase(),
    status:val("xStatus")||"ativo", origem:val("xOrigem"),
    responsavel:val("xResp"), obs:val("xObs"), criadoEm:antigo.criadoEm||hoje(),
    contatoNome:val("xContato"), contatoCargo:val("xContatoCargo"),
    contatoNascimento:val("xContatoNasc"), contatoWhatsapp:val("xContatoZap")
  });
  await salvar("clientes", c);
  fecharModal(); toast(id?"Cliente atualizado":"Cliente cadastrado");
}
/** Aviso em tempo real enquanto a pessoa digita o documento. */
function conferirDoc(idAtual){
  const campo = document.getElementById("xDoc");
  const aviso = document.getElementById("avisoDoc");
  if(!campo || !aviso) return;
  const achado = clientePorDoc(campo.value, idAtual||null);
  aviso.textContent = achado ? `Já existe: ${achado.nome}` : "";
  aviso.style.color = achado ? "var(--crit)" : "";
}
/** Anos completos entre uma data e hoje. */
function idadeEm(data, ref){
  if(!data) return null;
  const n = new Date(data+"T12:00:00"), h = new Date((ref||hoje())+"T12:00:00");
  let a = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if(m < 0 || (m === 0 && h.getDate() < n.getDate())) a--;
  return a;
}

/* ============================================================
   FAIXA ETÁRIA (ANS) E DATAS QUE VIRAM CONTATO
   A RN 63/2003 fixa dez faixas etárias para os planos de saúde. O reajuste
   por mudança de faixa entra no mês seguinte ao aniversário — saber quem
   muda de faixa é saber quem vai receber um boleto mais caro, antes dele.
   ============================================================ */
const FAIXAS_ANS = [
  {de:0,ate:18,rot:"0 a 18"},  {de:19,ate:23,rot:"19 a 23"}, {de:24,ate:28,rot:"24 a 28"},
  {de:29,ate:33,rot:"29 a 33"},{de:34,ate:38,rot:"34 a 38"}, {de:39,ate:43,rot:"39 a 43"},
  {de:44,ate:48,rot:"44 a 48"},{de:49,ate:53,rot:"49 a 53"}, {de:54,ate:58,rot:"54 a 58"},
  {de:59,ate:200,rot:"59 ou mais"}];
const faixaANS = idade => FAIXAS_ANS.findIndex(f=>idade>=f.de && idade<=f.ate);

/** Próximo aniversário a partir de hoje (29/02 vira 28/02 nos anos comuns). */
function proximoAniversario(nasc, ref){
  if(!nasc) return null;
  const h = ref || hoje();
  const [, mm, dd] = nasc.split("-");
  const monta = ano => {
    let d = Number(dd);
    if(mm==="02" && dd==="29" && !((ano%4===0 && ano%100!==0) || ano%400===0)) d = 28;
    return `${ano}-${mm}-${String(d).padStart(2,"0")}`;
  };
  const ano = Number(h.slice(0,4));
  const este = monta(ano);
  return este >= h ? este : monta(ano+1);
}
/** Vidas de saúde que mudam de faixa nos próximos N dias. */
function mudancasDeFaixa(dias){
  const out = [];
  for(const v of vidasNoEscopo()){
    if(!v.nascimento || !vidaConta(v)) continue;
    const ct = contratoPorId(v.contratoId);
    if(!ct || ct.pilar!=="saude") continue;
    const prox = proximoAniversario(v.nascimento);
    const d = diasEntre(hoje(), prox);
    if(d < 0 || d > dias) continue;
    const idade = idadeEm(v.nascimento, prox);
    const antes = faixaANS(idade-1), depois = faixaANS(idade);
    if(depois !== antes && depois >= 0) out.push({ v, ct, prox, dias:d, idade, faixa:FAIXAS_ANS[depois] });
  }
  return out.sort((a,b)=>a.dias-b.dias);
}
/** Primeiro dia do próximo mês de reajuste do contrato. O mês corrente conta como "agora". */
function proximoReajuste(c){
  const m = Number(c.mesReajuste);
  if(!(m>=1 && m<=12)) return null;
  const h = hoje(), ano = Number(h.slice(0,4)), mesHoje = Number(h.slice(5,7));
  const alvoAno = m >= mesHoje ? ano : ano+1;
  return `${alvoAno}-${String(m).padStart(2,"0")}-01`;
}
function reajustesChegando(dias){
  return S.contratos.filter(c=>c.pilar==="saude" && ["ativo","implantado"].includes(c.status)
      && c.mesReajuste && noEscopo(c,"corretor"))
    .map(c=>{ const d = proximoReajuste(c); return { c, data:d, dias: Math.max(0, diasEntre(hoje(), d)) }; })
    .filter(x=>x.data && x.dias <= dias)
    .sort((a,b)=>a.dias-b.dias);
}
/** A visão única do cliente: o que ele tem, o que falta, e o que fazer agora. */
function visaoDoCliente(c, cs){
  const vivos = cs.filter(x=>x.status!=="cancelado");
  const { tem, falta } = pilaresDoCliente(c.id);
  const vidas = vidasAtivas(vidasDoCliente(c.id)).length
    + vivos.filter(x=>contratoTemVida(x) && !vidasDetalhadas(x)).reduce((a,x)=>a+(Number(x.vidas)||0),0);
  const pv = posVenda(c);
  const proxima = S.tarefas.filter(t=>t.status!=="feita" && t.refId===c.id)
    .sort((a,b)=>(a.vence||"").localeCompare(b.vence||""))[0];
  const meses = Math.max(0, Math.round(diasEntre(c.criadoEm||hoje(), hoje())/30.44));
  return `<div class="visao">
    <div>
      <div class="k">Produtos</div>
      <div class="chips">${tem.length ? tem.map(p=>`<span class="chip ${p}">${esc(PILARES[p].curto)} · ${vivos.filter(x=>x.pilar===p).length}</span>`).join(" ") : `<span class="hint">nenhum ativo</span>`}</div>
      ${falta.length && tem.length ? `<div class="hint" style="margin-top:6px">Não tem ${falta.map(p=>PILARES[p].curto).join(" nem ")}
        <button class="btn sm" style="margin-left:6px" data-act="tarefaCrossSell" data-id="${esc(c.id)}" data-p="${esc(falta[0])}">Oferecer ${esc(PILARES[falta[0]].curto)}</button></div>` : ""}
    </div>
    <div><div class="k">Vidas ativas</div><div class="v num">${vidas.toLocaleString("pt-BR")}</div>
      <div class="hint">${meses<1?"cliente novo":`${meses} ${meses===1?"mês":"meses"} de casa`}</div></div>
    <div><div class="k">Último contato</div><div class="v">${pv.ultimo?dt(pv.ultimo):"—"}</div>
      <div class="hint">${pv.atrasado?`<span style="color:var(--crit)">pós-venda atrasado ${Math.abs(pv.dias)}d</span>`:`próximo em ${dt(pv.proximo)}`}</div></div>
    <div><div class="k">Próxima ação</div><div class="v">${proxima?esc(proxima.titulo):"—"}</div>
      <div class="hint">${proxima?`${esc(proxima.tipo||"")} · ${dt(proxima.vence)}`:`<button class="btn sm ghost" style="padding:2px 7px;margin-top:2px" data-act="tarefaPosVenda" data-id="${esc(c.id)}">agendar uma</button>`}</div></div>
    <div class="com"><div class="k">${veCorretora()?"Comissão gerada":"Sua comissão"}</div><div class="v num">${brl(receitaCliente(c))}</div>
      <div class="hint">em ${vivos.length} contrato(s) ativo(s)</div></div>
  </div>`;
}
function abrirCliente(id){
  const c = S.clientes.find(x=>x.id===id); if(!c) return;
  const cs = contratosDoCliente(c.id).filter(x=>noEscopo(x,"corretor"));
  const ps = parcelas().filter(p=>p.contrato.clienteId===c.id && noEscopo(p,"corretor"));
  abrirModal(`
  <div class="m-head"><div><h2>${esc(c.nome)}</h2>
    <div class="sub">${esc(c.tipo||"PJ")}${c.doc?" · "+esc(S.mePapel==="gestor"?c.doc:mascararDoc(c.doc)):""} · cliente desde ${dt(c.criadoEm)}${c.status&&c.status!=="ativo"?` · <span class="chip mute">${esc(c.status)}</span>`:""}</div></div>
    <button class="btn sm" style="margin-left:auto;flex:none" data-act="editarCliente" data-id="${esc(c.id)}">✎ Editar dados</button></div>
  <div class="m-body">
    ${visaoDoCliente(c, cs)}
    ${fichaAniversario(c)}
    <div class="frow">
      <div class="field"><label for="ceEtapa">Etapa do relacionamento</label>
        <select id="ceEtapa" data-act="mudarEtapaCliente" data-id="${esc(c.id)}">
          ${S.config.etapasCliente.map(e=>`<option value="${e.id}" ${etapaCliente(c)===e.id?"selected":""}>${esc(e.nome)}</option>`).join("")}
        </select></div>

    </div>
    ${(()=>{ const pv = posVenda(c);
      const bols = contratosDoCliente(c.id).filter(x=>["ativo","implantado"].includes(x.status) && x.diaVencimento)
        .map(x=>({x, d:proximoBoleto(x)})).filter(x=>x.d).sort((a,b)=>a.d.localeCompare(b.d));
      return `<div class="panel" style="box-shadow:none;background:var(--surface-2)">
        <div class="panel-head"><span class="chip ${pv.atrasado?"crit":"info"}">Pós-venda</span>
          <div><h3>${pv.atrasado?`Atrasado em ${Math.abs(pv.dias)} dias`:`Próximo contato em ${dt(pv.proximo)}`}</h3>
            <div class="sub">${pv.ultimo?`Último contato em ${dt(pv.ultimo)}`:"Nenhum contato registrado ainda"} · a cada ${pv.cadencia} dias</div></div>
          <div class="right">
            <button class="btn sm" data-act="registrarPosVenda" data-id="${esc(c.id)}">Falei com ele hoje</button>
            <button class="btn sm ghost" data-act="tarefaPosVenda" data-id="${esc(c.id)}">Agendar</button></div></div>
        <div class="chart-wrap">
          <div class="frow">
            <div class="field"><label for="cvCadencia">Lembrar a cada (dias)</label>
              <input id="cvCadencia" type="number" min="7" value="${pv.cadencia}" data-act="salvarCadencia" data-id="${esc(c.id)}"></div>
            <div class="field"><label>Vencimento dos boletos</label>
              <div class="v" style="padding-top:7px">${bols.length
                ? bols.map(b=>`<div class="num">dia ${b.x.diaVencimento} · ${esc(b.x.operadora||"")} <span class="hint">próximo ${dt(b.d)}</span></div>`).join("")
                : `<span class="hint">Nenhum contrato com dia de vencimento preenchido.</span>`}</div></div>
          </div>
        </div></div>`; })()}
    <div class="dl dl-ficha">
      <div><div class="k">Telefone</div><div class="v">${esc(c.telefone||"—")}</div></div>
      <div><div class="k">WhatsApp</div><div class="v">${c.whatsapp
        ? `<a href="https://wa.me/55${esc(soDigitos(c.whatsapp).replace(/^55/,""))}" target="_blank" rel="noopener">${esc(c.whatsapp)}</a>`
        : "—"}</div></div>
      <div><div class="k">E-mail</div><div class="v">${c.email?`<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`:"—"}</div></div>
      <div><div class="k">${c.tipo==="PF"?"Data de nascimento":"Data de fundação"}</div><div class="v">${c.nascimento
        ? `${dt(c.nascimento)} <span class="hint">${idadeEm(c.nascimento)} ${c.tipo==="PF"?"anos":"anos de empresa"}</span>`
        : "—"}</div></div>
      <div><div class="k">Endereço</div><div class="v">${esc([c.logradouro, c.cep?`CEP ${c.cep}`:""].filter(Boolean).join(" · ")||"—")}</div></div>
      <div><div class="k">Cidade</div><div class="v">${esc([c.cidade,c.uf].filter(Boolean).join("/")||"—")}</div></div>
      ${c.tipo!=="PF" && c.contatoNome ? `<div><div class="k">Contato principal</div><div class="v">${esc(c.contatoNome)}${c.contatoCargo?` <span class="hint">${esc(c.contatoCargo)}</span>`:""}${c.contatoWhatsapp?`<div class="hint"><a href="https://wa.me/55${esc(soDigitos(c.contatoWhatsapp).replace(/^55(?=\d{10,11}$)/,""))}" target="_blank" rel="noopener">${esc(c.contatoWhatsapp)}</a></div>`:""}</div></div>` : ""}
      <div><div class="k">Origem</div><div class="v">${esc(c.origem||"—")}</div></div>
      <div><div class="k">Responsável</div><div class="v">${esc(nomeUsuario(c.responsavel))}</div></div>
      <div><div class="k">Base contratada</div><div class="v num">${brl(cs.filter(x=>x.status!=="cancelado").reduce((a,x)=>a+(Number(x.valorBase)||0),0))}</div></div>
    </div>
    ${c.obs?`<div class="hint">${esc(c.obs)}</div>`:""}
    <div class="panel" style="box-shadow:none">
      <div class="panel-head"><div><h3>Contratos</h3><div class="sub">${cs.length} registro${cs.length!==1?"s":""}</div></div>
        <div class="right"><button class="btn sm" data-act="contratoParaCliente" data-id="${esc(c.id)}">+ Contrato</button></div></div>
      <div class="tw"><table>
        <thead><tr><th>Produto</th><th>Operadora</th><th class="r">Base</th><th class="r">Vidas</th><th>Vigência</th><th>Boleto</th><th>Situação</th></tr></thead>
        <tbody>${cs.map(x=>{
          const st=STATUS_CONTRATO[x.status]||STATUS_CONTRATO.proposta;
          return `<tr class="clickable" data-act="abrirContrato" data-id="${esc(x.id)}">
            <td><span class="chip ${esc(x.pilar)}">${esc(PILARES[x.pilar].curto)}</span> ${esc(x.produto||"")}</td>
            <td>${esc(x.operadora||"—")}</td><td class="r num">${brl(x.valorBase)}</td>
            <td class="r num">${contratoTemVida(x)?(totalVidas(x)||"—"):`<span class="hint">cota</span>`}</td>
            <td class="num">${dt(x.inicio)} — ${x.fim?dt(x.fim):"—"}
              ${x.fim && diasEntre(hoje(),x.fim)<=60 && diasEntre(hoje(),x.fim)>=0?`<div class="hint" style="color:var(--warn)">renova em ${diasEntre(hoje(),x.fim)}d</div>`:""}</td>
            <td class="num">${x.diaVencimento?`dia ${x.diaVencimento}`:`<span class="hint">—</span>`}</td>
            <td><span class="chip ${st.cls}">${st.nome}</span></td></tr>`;
        }).join("") || `<tr><td colspan="7" class="empty">Nenhum contrato para este cliente.</td></tr>`}</tbody>
      </table></div>
    </div>
    ${comissoesDoCliente(c, ps)}
  </div>
  <div class="m-foot">
    ${podeExcluirCarteira()?`<button class="btn ghost danger left" data-act="excluirCliente" data-id="${esc(c.id)}">Excluir cliente</button>`:""}
    <button class="btn" data-act="fechar">Fechar</button>
    <button class="btn primary" data-act="editarCliente" data-id="${esc(c.id)}">Editar dados</button></div>`, true);
}

/** Faixa de aniversário na ficha: do cliente (ou da empresa) e do contato principal. */
function fichaAniversario(c){
  const itens = aniversariantes(366, [c]);
  if(!itens.length){
    if(["encerrado","inativo"].includes(c.status) || c.nascimento) return "";
    return `<div class="ficha-aniv"><span class="chip mute">Aniversário</span>
      <span class="hint">${c.tipo==="PF"?"Sem data de nascimento no cadastro":"Sem data de fundação nem aniversário do contato"} — o lembrete não tem como avisar.</span>
      <button class="btn sm ghost" style="margin-left:auto" data-act="editarCliente" data-id="${esc(c.id)}">Preencher</button></div>`;
  }
  const janela = Math.max(diasAvisoAniv(), 7);
  return itens.map(x=>`<div class="ficha-aniv">
    <span class="chip ${x.dias<=janela?"info":"mute"}">${x.quem==="empresa"?"Fundação":"Aniversário"}</span>
    <span>${x.quem==="contato"?`<b>${esc(x.nome)}</b> · `:""}${esc(x.quem==="contato"?`faz ${x.anos} anos`:descAniv(x))} ${x.dias===0?"<b>hoje</b>":esc(quandoAniv(x))}</span>
    ${jaParabenizado(x)?`<span class="chip mute">parabenizado</span>`:""}
    <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${x.dias<=janela ? botoesAniv(x)
      : `<button class="btn sm ghost" data-act="agendarAniv" data-id="${esc(c.id)}" data-quem="${esc(x.quem)}" data-prox="${esc(x.prox)}">Agendar lembrete</button>`}</span>
  </div>`).join("");
}


/* ---------- tarefa ---------- */
const ADIAMENTOS = [{d:1,rot:"amanhã"},{d:3,rot:"3 dias"},{d:7,rot:"1 semana"},{d:15,rot:"15 dias"},{d:30,rot:"1 mês"}];
function formTarefa(pre){
  pre = pre||{};
  const ed = !!pre.id;
  return `
  <div class="m-head"><div><h2>${ed?"Editar tarefa":"Nova tarefa"}</h2><div class="sub">${esc(pre.refNome||"Compromisso da agenda")}</div></div></div>
  <div class="m-body">
    <div class="field"><label for="tTitulo">O que fazer</label><input id="tTitulo" type="text" value="${esc(pre.titulo||"")}" placeholder="Ligar para confirmar a documentação"></div>
    <div class="frow">
      <div class="field"><label for="tTipo">Tipo</label><select id="tTipo">${["Ligação","WhatsApp","Reunião","E-mail","Visita","Documentação","Cobrança"].map(t=>`<option ${pre.tipo===t?"selected":""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label for="tVence">Vence em</label><input id="tVence" type="date" value="${pre.vence||addDays(hoje(),1)}"></div>
      <div class="field"><label for="tResp">Responsável</label><select id="tResp">${optUsuarios(pre.responsavel||S.uid)}</select></div>
    </div>
    <div class="field"><label>Empurrar a data</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${ADIAMENTOS.map(a=>`<button type="button" class="btn sm" data-act="empurrarData" data-d="${a.d}">+${a.d}d · ${a.rot}</button>`).join("")}
      </div>
      <span class="hint">Conta a partir da data que está no campo, ou de hoje se ela já passou.</span></div>
    <div class="field"><label for="tObs">Notas</label><textarea id="tObs" placeholder="O que foi combinado, o que falta">${esc(pre.obs||"")}</textarea></div>
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarTarefa" data-id="${esc(pre.id||"")}" data-ref='${esc(JSON.stringify({refTipo:pre.refTipo||"",refId:pre.refId||"",refNome:pre.refNome||""}))}'>${ed?"Salvar tarefa":"Criar tarefa"}</button></div>`;
}
async function salvarTarefa(refJson, id){
  const titulo = val("tTitulo"); if(!titulo){ toast("Descreva a tarefa."); return; }
  let ref={}; try{ ref=JSON.parse(refJson||"{}"); }catch(e){}
  const antiga = id ? S.tarefas.find(x=>x.id===id) : null;
  const dados = { titulo, tipo:val("tTipo"), vence:val("tVence")||hoje(),
                  responsavel:val("tResp"), obs:val("tObs") };
  if(antiga){
    await salvar("tarefas", Object.assign({}, antiga, dados), "Editou a tarefa");
    fecharModal(); toast("Tarefa atualizada"); return;
  }
  await salvar("tarefas", Object.assign({
    id:uid("tar"), status:"aberta", criadoEm:hoje()
  }, dados, ref));
  fecharModal(); toast("Tarefa criada");
}
/** Prorrogar: soma dias à data que a tarefa já tem, nunca para uma data no passado. */
async function prorrogarTarefa(id, dias){
  const t = S.tarefas.find(x=>x.id===id); if(!t) return;
  const partida = (t.vence||hoje()) > hoje() ? t.vence : hoje();
  const novo = Object.assign({}, t, { vence: addDays(partida, Number(dias)||1),
                                      status:"aberta", adiada:(Number(t.adiada)||0)+1 });
  await salvar("tarefas", novo, "Prorrogou a tarefa");
  toast(`Adiada para ${dt(novo.vence)}`);
  mostrarLembrete();
}
function formAdiar(t){
  return `
  <div class="m-head"><div><h2>Adiar tarefa</h2><div class="sub">${esc(t.titulo)} · vence ${dt(t.vence)}</div></div></div>
  <div class="m-body">
    <div class="field"><label>Empurrar para</label>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        ${ADIAMENTOS.map(a=>`<button type="button" class="btn" data-act="adiarDias" data-id="${esc(t.id)}" data-d="${a.d}">+${a.d} dia${a.d>1?"s":""} <span class="hint">· ${a.rot}</span></button>`).join("")}
      </div></div>
    <div class="frow">
      <div class="field"><label for="adData">Ou escolha a data</label><input id="adData" type="date" value="${esc(t.vence||hoje())}"></div>
      <div class="field"><label>&nbsp;</label><button type="button" class="btn primary" data-act="adiarData" data-id="${esc(t.id)}" style="width:100%">Usar esta data</button></div>
    </div>
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button></div>`;
}

/* ---------- régua de comissão ---------- */
function formRegra(r){
  r = r || { pilar:"saude", base:"mensalidade", parcelas:[{n:1,pct:100}], vitalicio:{pct:0,inicio:2,meses:0} };
  const v = r.vitalicio || {pct:0,inicio:2,meses:0};
  return `
  <div class="m-head"><div><h2>${r.id?"Editar régua":"Nova régua de comissão"}</h2>
    <div class="sub">Define o agenciamento das primeiras mensalidades e a comissão vitalícia recorrente</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="gNome">Nome da régua</label><input id="gNome" type="text" value="${esc(r.nome||"")}" placeholder="Amil PME — 100/50/50 + 3%"></div>
      <div class="field"><label for="gPilar">Pilar</label><select id="gPilar">${PK.map(x=>`<option value="${x}" ${r.pilar===x?"selected":""}>${PILARES[x].nome}</option>`).join("")}</select></div>
      <div class="field"><label for="gBase">Base de cálculo</label><select id="gBase">${Object.entries(BASE_LABEL).map(([k,b])=>`<option value="${k}" ${r.base===k?"selected":""}>${b}</option>`).join("")}</select></div>
    </div>

    <div class="panel" style="box-shadow:none">
      <div class="panel-head"><span class="chip info">Agenciamento</span>
        <div><h3>Percentual das primeiras mensalidades</h3><div class="sub">Pago uma vez, no começo do contrato</div></div></div>
      <div class="chart-wrap">
        <div class="field"><label for="gParcelas">Percentuais, na ordem das parcelas</label>
          <input id="gParcelas" type="text" value="${(r.parcelas||[]).map(x=>x.pct).join(", ")}" placeholder="100, 50, 50" data-act="recalcRegra">
          <span class="hint"><b>100, 50, 50</b> = 100% da 1ª mensalidade, 50% da 2ª e 50% da 3ª, vencendo 1, 2 e 3 meses após o início da vigência. Deixe vazio se a operadora só paga vitalício.</span></div>
      </div>
    </div>

    <div class="panel" style="box-shadow:none">
      <div class="panel-head"><span class="chip ok">Vitalício</span>
        <div><h3>Percentual recorrente</h3><div class="sub">Pago todo mês enquanto o contrato estiver ativo</div></div></div>
      <div class="chart-wrap"><div class="frow">
        <div class="field"><label for="gVitPct">% da mensalidade por mês</label>
          <input id="gVitPct" type="number" step="0.1" value="${v.pct||0}" placeholder="3" data-act="recalcRegra"></div>
        <div class="field"><label for="gVitIni">Começa no mês</label>
          <input id="gVitIni" type="number" step="1" min="1" value="${v.inicio||2}" data-act="recalcRegra"></div>
        <div class="field"><label for="gVitMeses">Meses projetados</label>
          <input id="gVitMeses" type="number" step="1" min="0" value="${v.meses||0}" data-act="recalcRegra">
          <span class="hint">0 = projeta até o fim da vigência do contrato.</span></div>
      </div></div>
    </div>

    <div id="previewRegra">${previewRegra()}</div>
  </div>
  <div class="m-foot">
    ${r.id?`<button class="btn ghost danger left" data-act="excluirRegra" data-id="${esc(r.id)}">Excluir</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarRegra" data-id="${esc(r.id||"")}">Salvar régua</button>
  </div>`;
}
/** Mostra a régua aplicada a uma mensalidade de R$ 1.000 para ficar palpável. */
function previewRegra(){
  const pcts = lerPcts("gParcelas");
  const vp = numv("gVitPct"), vi = Math.max(1, numv("gVitIni")||1), vm = numv("gVitMeses");
  const meses = vm>0 ? vm : 12;
  const ref = 1000;
  const ag = pcts.reduce((a,b)=>a+b,0);
  const totalVit = ref*vp/100*meses;
  return `<div class="panel" style="box-shadow:none;background:var(--surface-2)">
    <div class="panel-head"><div><h3>Numa mensalidade de ${brl(ref)}</h3>
      <div class="sub">Simulação para conferir a régua antes de salvar</div></div></div>
    <div class="chart-wrap"><div class="dl">
      <div><div class="k">Agenciamento</div><div class="v num">${brl2(ref*ag/100)}</div>
        <div class="hint">${pctR(ag)} em ${pcts.length} parcela${pcts.length!==1?"s":""}</div></div>
      <div><div class="k">Vitalício por mês</div><div class="v num">${brl2(ref*vp/100)}</div>
        <div class="hint">${vp>0?`${pctR(vp)} a partir do mês ${vi}`:"não se aplica"}</div></div>
      <div><div class="k">Vitalício em ${meses} meses</div><div class="v num">${brl2(totalVit)}</div>
        <div class="hint">${vm>0?"horizonte fixo da régua":"estimativa de 12 meses"}</div></div>
      <div><div class="k">Total no período</div><div class="v num" style="font-weight:700">${brl2(ref*ag/100+totalVit)}</div>
        <div class="hint">${pctR(ag+vp*meses)} da mensalidade</div></div>
    </div></div></div>`;
}
function lerPcts(id){
  return val(id).split(",").map(x=>Number(String(x).replace(",","."))).filter(n=>!isNaN(n)&&n>0);
}
async function salvarRegra(id){
  const nome = val("gNome"); if(!nome){ toast("Dê um nome à régua."); return; }
  const pcts = lerPcts("gParcelas");
  const vp = numv("gVitPct");
  if(!pcts.length && !(vp>0)){ toast("Informe o agenciamento, o vitalício, ou os dois."); return; }
  const r = { id:id||uid("reg"), nome, pilar:val("gPilar"), base:val("gBase"),
              parcelas:pcts.map((p,i)=>({n:i+1,pct:p})),
              vitalicio:{ pct:vp, inicio:Math.max(1,numv("gVitIni")||1), meses:Math.max(0,numv("gVitMeses")) } };
  const i = S.config.regras.findIndex(x=>x.id===r.id);
  if(i>=0) S.config.regras[i]=r; else S.config.regras.push(r);
  await salvarConfig();
  fecharModal(); toast("Régua salva");
}

/* ---------- membro incluído à mão ---------- */
function formMembro(){
  return `
  <div class="m-head"><div><h2>Incluir membro</h2>
    <div class="sub">Para quem ainda não abriu o sistema, ou não vai abrir</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="mbNome">Nome</label><input id="mbNome" type="text" placeholder="Ana Ribeiro"></div>
      <div class="field"><label for="mbPapel">Papel</label>
        <select id="mbPapel">${Object.entries(PAPEIS).map(([k,v])=>`<option value="${k}" ${k==="corretor"?"selected":""}>${v}</option>`).join("")}</select></div>
    </div>
    <div class="frow">
      <div class="field"><label for="mbMeta">Meta mensal de comissão (R$)</label><input id="mbMeta" type="number" step="500" placeholder="0"></div>
      <div class="field"><label for="mbSplit">Split de comissão (%)</label><input id="mbSplit" type="number" step="5" value="50"></div>
    </div>
    <div class="hint">O membro já pode ser escolhido como corretor e responsável nos leads, clientes e contratos. Quando ele abrir o sistema pela primeira vez, você vincula o acesso dele a este cadastro na fila de liberação — sem duplicar a carteira.</div>
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarMembro">Incluir na equipe</button></div>`;
}
async function salvarMembro(){
  const nome = val("mbNome"); if(!nome){ toast("Informe o nome."); return; }
  await salvar("usuarios", { id:uid("eq"), nome, manual:true, papel:val("mbPapel")||"corretor",
    status:"ativo", verTudo:false, meta:numv("mbMeta"), splitPct:numv("mbSplit")||50,
    ativo:true, criadoEm:hoje() }, "Incluiu na equipe");
  fecharModal(); toast(`${nome} entrou na equipe`);
}
/** Liga o acesso real de uma pessoa ao cadastro que já existia para ela. */
async function vincularMembro(uidReal, idManual){
  const real = S.usuarios.find(u=>u.id===uidReal);
  const manual = S.usuarios.find(u=>u.id===idManual);
  if(!real || !manual) return false;
  const troca = [["leads","responsavel"],["clientes","responsavel"],["contratos","corretor"],["tarefas","responsavel"]];
  let movidos = 0;
  for(const [col, campo] of troca){
    for(const item of S[col].filter(x=>x[campo]===idManual)){
      await salvar(col, Object.assign({}, item, {[campo]:uidReal}));
      movidos++;
    }
  }
  await salvar("usuarios", Object.assign({}, real, {
    nome: manual.nome || real.nome, papel: manual.papel || real.papel,
    meta: manual.meta, splitPct: manual.splitPct, verTudo: !!manual.verTudo,
    status:"ativo", ativo:true
  }), "Vinculou o acesso de");
  await remover("usuarios", idManual);
  toast(`Acesso vinculado${movidos?` · ${movidos} registro(s) transferidos`:""}`);
  return true;
}

/* ---------- parcela de comissão avulsa ---------- */
/** Enquanto o valor recebido não for digitado à mão, ele acompanha o valor previsto. */
function espelharRecebido(){
  const v = document.getElementById("pcValor"), r = document.getElementById("pcValorRecebido");
  if(v && r && r.dataset.tocado!=="1") r.value = v.value;
}
function formParcela(contratoId, n){
  const c = S.contratos.find(x=>x.id===contratoId);
  const p = c && n!=null ? (c.comissoes||[]).find(x=>x.n===Number(n)) : null;
  const editando = !!p;
  const contratos = S.contratos.filter(x=>noEscopo(x,"corretor") && x.status!=="cancelado")
    .sort((a,b)=>a.clienteNome.localeCompare(b.clienteNome,"pt-BR"));
  const ultima = c && (c.comissoes||[]).length
    ? (c.comissoes||[]).slice().sort((a,b)=>a.vence.localeCompare(b.vence)).pop() : null;
  return `
  <div class="m-head"><div><h2>${editando?"Editar comissão":"Nova comissão"}</h2>
    <div class="sub">${editando?`${esc(c.clienteNome)} · parcela ${p.n} de ${(c.comissoes||[]).length}`
      :"Acrescenta uma parcela ao cronograma de um contrato existente"}</div></div></div>
  <div class="m-body">
    ${editando?"":`<div class="field"><label for="pcContrato">Contrato</label>
      <select id="pcContrato" data-act="trocaContratoParcela">${contratos.map(x=>`<option value="${esc(x.id)}" ${contratoId===x.id?"selected":""}>${esc(x.clienteNome)} · ${esc(x.operadora||"")} · ${esc(x.produto||"")}</option>`).join("")}</select>
      <span class="hint" id="pcInfo">${c?`Base de ${brl(c.valorBase)} · ${(c.comissoes||[]).length} parcela(s) hoje${ultima?`, última em ${dt(ultima.vence)}`:""}`:""}</span></div>`}
    <div class="frow">
      <div class="field"><label for="pcTipo">Tipo</label><select id="pcTipo">
        ${Object.entries(TIPO_PARCELA).map(([k,v])=>`<option value="${k}" ${(p?p.tipo:"vitalicio")===k?"selected":""}>${esc(v.nome)}</option>`).join("")}</select></div>
      <div class="field"><label for="pcVence">Vencimento</label>
        <input id="pcVence" type="date" value="${esc(p?p.vence:(ultima?addMonths(ultima.vence,1):addMonths(hoje(),1)))}"></div>
      <div class="field"><label for="pcValor">Valor (R$)</label>
        <input id="pcValor" type="number" step="0.01" value="${p?p.valor:""}" placeholder="0,00" data-act="espelharRecebido"></div>
      <div class="field"><label for="pcImposto">Imposto desta parcela (%)</label>
        <input id="pcImposto" type="number" step="0.01" min="0" value="${p&&temValor(p.impostoPct)?p.impostoPct:""}" placeholder="${pctR(aliquotaDe(null, c))} (do contrato)">
        <span class="hint">Vazio = usa a alíquota do contrato ou a padrão.</span></div>
    </div>
    <div class="frow">
      <div class="field"><label for="pcStatus">Situação</label><select id="pcStatus" data-act="trocaStatusParcela">
        ${Object.entries(STATUS_COM).filter(([k])=>k!=="atrasado").map(([k,v])=>`<option value="${k}" ${(p?p.status:"previsto")===k?"selected":""}>${v.nome}</option>`).join("")}</select></div>
      <div class="field" id="campoRecebidoEm" ${(p?p.status:"previsto")==="recebido"?"":"hidden"}>
        <label for="pcRecebidoEm">Recebida em</label>
        <input id="pcRecebidoEm" type="date" value="${esc(p&&p.recebidoEm?p.recebidoEm:hoje())}"></div>
      <div class="field" id="campoValorRecebido" ${(p?p.status:"previsto")==="recebido"?"":"hidden"}>
        <label for="pcValorRecebido">Valor recebido</label>
        <input id="pcValorRecebido" type="number" step="0.01" data-act="tocarRecebido"
          data-tocado="${p&&p.valorRecebido!=null&&p.valorRecebido!==p.valor?"1":"0"}"
          value="${p&&p.valorRecebido!=null?p.valorRecebido:(p?p.valor:"")}">
        <span class="hint">Diferente do previsto? Registre aqui a glosa.</span></div>
    </div>
    <div class="hint">O percentual é recalculado sobre a base do contrato ao salvar.</div>
  </div>
  <div class="m-foot">
    ${editando?`<button class="btn ghost danger left" data-act="excluirParcela" data-id="${esc(contratoId)}" data-n="${p.n}">Excluir parcela</button>`:""}
    <button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarParcela" data-id="${esc(contratoId)}" data-n="${editando?p.n:""}">${editando?"Salvar":"Acrescentar"}</button>
  </div>`;
}
async function salvarParcela(contratoId, n){
  const id = document.getElementById("pcContrato") ? val("pcContrato") : contratoId;
  const c = S.contratos.find(x=>x.id===id);
  if(!c){ toast("Escolha um contrato."); return; }
  const valor = numv("pcValor");
  if(!valor){ toast("Informe o valor da comissão."); return; }
  const base = baseCalculo(c);
  const status = val("pcStatus")||"previsto";
  const nova = {
    tipo: val("pcTipo")||"vitalicio",
    vence: val("pcVence")||hoje(),
    valor: +valor.toFixed(2),
    pct: base ? +(valor/base*100).toFixed(4) : 0,
    status,
    recebidoEm: status==="recebido" ? (val("pcRecebidoEm")||hoje()) : "",
    valorRecebido: status==="recebido" ? (numv("pcValorRecebido")||+valor.toFixed(2)) : null,
    travado: true,
    ...(val("pcImposto")!=="" ? { impostoPct: numv("pcImposto") } : {})
  };
  const lista = (c.comissoes||[]).filter(p=>String(p.n)!==String(n));
  lista.push(nova);
  c.comissoes = lista.sort((a,b)=>(a.vence||"").localeCompare(b.vence||"")).map((p,i)=>({...p, n:i+1}));
  await salvar("contratos", c, n!=null&&n!=="" ? `Editou uma parcela de comissão de` : `Acrescentou comissão de ${brl2(valor)} em`);
  fecharModal();
  toast(n!=null&&n!==""?"Parcela atualizada":"Comissão acrescentada");
}

/* ---------- usuário ---------- */
function formUsuario(u){
  return `
  <div class="m-head"><div><h2>${esc(u.nome)}</h2><div class="sub">Papel, meta e split de comissão</div></div></div>
  <div class="m-body">
    <div class="frow">
      <div class="field"><label for="uNome">Nome</label><input id="uNome" type="text" value="${esc(u.nome)}"></div>
      <div class="field"><label for="uPapel">Papel</label>
        <select id="uPapel" data-act="descrPapel">${Object.entries(PAPEIS).map(([k,v])=>`<option value="${k}" ${u.papel===k?"selected":""}>${v}</option>`).join("")}</select>
        <span class="hint" id="uDescrPapel">${esc(DESCR_PAPEL[u.papel]||"")}</span></div>
      <div class="field"><label for="uStatus">Acesso</label>
        <select id="uStatus">
          <option value="ativo" ${statusUsuario(u)==="ativo"?"selected":""}>Liberado</option>
          <option value="pendente" ${statusUsuario(u)==="pendente"?"selected":""}>Aguardando liberação</option>
          <option value="bloqueado" ${statusUsuario(u)==="bloqueado"?"selected":""}>Suspenso</option>
        </select></div>
    </div>
    <div class="field"><label for="uVerTudo">Alcance da visão</label>
      <select id="uVerTudo">
        <option value="" ${!u.verTudo?"selected":""}>Só a própria carteira — e só a comissão dele</option>
        <option value="1" ${u.verTudo?"selected":""}>A corretora inteira — inclusive o que fica com ela</option>
      </select>
      <span class="hint">Vale para corretor. Gestor sempre vê tudo; assistente não vê valores de comissão.</span></div>
    <div class="frow">
      <div class="field"><label for="uMeta">Meta mensal de comissão (R$)</label><input id="uMeta" type="number" step="500" value="${u.meta||0}"></div>
      <div class="field"><label for="uSplit">Split de comissão (%)</label><input id="uSplit" type="number" step="5" value="${u.splitPct??50}"></div>
    </div>
    <div class="hint">O split é a fatia da comissão recebida que vai para o corretor. Ele entra como padrão em novos contratos e pode ser ajustado contrato a contrato.</div>
  </div>
  <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
    <button class="btn primary" data-act="salvarUsuario" data-id="${esc(u.id)}">Salvar</button></div>`;
}

/* ============================================================
   AÇÕES
   ============================================================ */
document.addEventListener("click", async e=>{
  const el = e.target.closest("[data-act]");
  const card = e.target.closest("[data-lead],[data-cliente]");
  if(!el && card){
    if(card.dataset.lead) abrirLead(card.dataset.lead); else abrirCliente(card.dataset.cliente);
    return;
  }
  if(!el) return;
  const a = el.dataset.act, id = el.dataset.id;

  switch(a){
    case "fechar": fecharModal(); break;
    case "escopo": S.escopo = el.dataset.v; zerarPaginas(); render(); break;
    case "limparFiltros": S.filtros = {}; S.pagClientes=1; S.pagVidas=1; S.pagComissoes=1; S.pagContratos=1; render(); break;
    case "basePct":
      editorBasePct = el.dataset.v;
      rebaseParcelas();
      renderEditor();
      break;
    case "unidadeVit":
      S.unidadeVit = el.dataset.v;
      try{ localStorage.setItem("erbe-unidade-vit", S.unidadeVit); }catch(err){}
      renderEditor(); break;
    case "modoMontagem":
      S.modoMontagem = el.dataset.v;
      try{ localStorage.setItem("erbe-modo-montagem", S.modoMontagem); }catch(err){}
      renderEditor(); break;
    case "modoClientes": S.modoClientes = el.dataset.v;
      try{ localStorage.setItem("erbe-modo-clientes", S.modoClientes); }catch(err){}
      render(); break;
    case "mudarEtapaCliente": break;
    case "irFiltro": { let f={}; try{ f=JSON.parse(el.dataset.f||"{}"); }catch(err){} if(el.dataset.aba) S.abaVidas = el.dataset.aba; ir(el.dataset.view, f); break; }

    case "novoLead": abrirModal(formLead(), true); break;
    case "editarLead": abrirModal(formLead(S.leads.find(l=>l.id===id)), true); break;
    case "salvarLead": await salvarLead(id); break;
    case "excluirLead": {
      const l = S.leads.find(x=>x.id===id);
      if(await confirmar("Excluir lead",
        `${l?l.nome:"Este lead"}${l&&l.empresa?` (${l.empresa})`:""} e todo o histórico de interações serão apagados. Não dá para desfazer.`,
        "Excluir lead", true)){
        await remover("leads", id);
        if($("#scrim").classList.contains("open")) fecharModal();
        toast("Lead excluído"); } break;
    }
    case "limparEtapa": {
      const etapa = el.dataset.e;
      const alvo = S.leads.filter(l=>l.etapa===etapa && noEscopo(l));
      if(!alvo.length) break;
      if(!await confirmar(`Limpar “${etapaNome(etapa)}”`,
        `${alvo.length} lead(s) desta coluna serão apagados, com todo o histórico. Os clientes e contratos que vieram deles não são afetados.`,
        `Excluir ${alvo.length} lead(s)`, true)) break;
      for(const l of alvo) await remover("leads", l.id, "Limpou a coluna do funil —");
      toast(`${alvo.length} lead(s) excluídos`); break;
    }
    case "converter": { const l=S.leads.find(x=>x.id===id); if(l) abrirConversao(l); break; }
    case "confirmarConversao": await confirmarConversao(id); break;
    case "mudarEtapa": break;
    case "confirmarPerda": {
      const l=S.leads.find(x=>x.id===id); if(!l) break;
      l.etapa="perdido"; l.motivoPerda=val("pMotivo"); l.ultimoContato=hoje();
      l.historico=[{data:hoje(), texto:`Perdido — ${l.motivoPerda}${val("pDet")?": "+val("pDet"):""}`, autor:S.meNome}, ...(l.historico||[])];
      await salvar("leads", l, `Registrou perda (${l.motivoPerda}) —`); fecharModal(); toast("Perda registrada"); break;
    }
    case "addNota": {
      const l=S.leads.find(x=>x.id===id); const txt=val("dNota"); if(!l||!txt) break;
      l.historico=[{data:hoje(), texto:txt, autor:S.meNome}, ...(l.historico||[])];
      l.ultimoContato=hoje();
      await salvar("leads", l, "Registrou interação com"); abrirLead(id); toast("Interação registrada"); break;
    }
    case "tarefaDeLead": { const l=S.leads.find(x=>x.id===id);
      abrirModal(formTarefa({refTipo:"lead", refId:id, refNome:l?l.nome:"", responsavel:l?l.responsavel:S.uid})); break; }

    case "novoCliente": abrirModal(formCliente()); break;
    case "editarCliente": abrirModal(formCliente(S.clientes.find(c=>c.id===id))); break;
    case "salvarCliente": await salvarCliente(id); break;
    case "abrirCliente": abrirCliente(id); break;
    case "registrarPosVenda": {
      const cli = S.clientes.find(x=>x.id===id); if(!cli) break;
      cli.ultimoPosVenda = hoje();
      await salvar("clientes", cli, "Registrou contato de pós-venda com");
      const pv = posVenda(cli);
      toast(`Contato registrado — próximo em ${dt(pv.proximo)}`); break;
    }
    case "tarefaPosVenda": {
      const cli = S.clientes.find(x=>x.id===id); if(!cli) break;
      abrirModal(formTarefa({ titulo:`Pós-venda: falar com ${cli.nome}`, tipo:"Ligação",
        refTipo:"cliente", refId:cli.id, refNome:cli.nome,
        responsavel:cli.responsavel||S.uid, vence:addDays(hoje(),1) })); break;
    }
    case "tarefaBoleto": {
      const cli = S.clientes.find(x=>x.id===id);
      const ctr = S.contratos.find(x=>x.id===el.dataset.c);
      if(!cli) break;
      abrirModal(formTarefa({ titulo:`Confirmar boleto de ${cli.nome} — vence ${dt(el.dataset.d)}`, tipo:"WhatsApp",
        refTipo:"cliente", refId:cli.id, refNome:`${cli.nome}${ctr?` · ${ctr.operadora||""}`:""}`,
        responsavel:cli.responsavel||S.uid, vence:addDays(el.dataset.d,-2) })); break;
    }
    case "abrirLeadSeExiste": S.leads.find(x=>x.id===id) ? abrirLead(id) : toast("Esse lead foi excluído."); break;
    case "abrirClienteSeExiste": S.clientes.find(x=>x.id===id) ? abrirCliente(id) : toast("Esse cliente foi excluído."); break;
    case "abrirContratoSeExiste": S.contratos.find(x=>x.id===id) ? abrirContrato(id) : toast("Esse contrato foi excluído."); break;
    case "excluirCliente": {
      if(!podeExcluirCarteira()){ toast("Só o gestor exclui clientes. Fale com ele."); break; }
      const cl = S.clientes.find(x=>x.id===id);
      const cts = contratosDoCliente(id);
      const parcelasCli = cts.flatMap(c=>c.comissoes||[]);
      const recebido = parcelasCli.filter(x=>x.status==="recebido").reduce((a,x)=>a+(x.valorRecebido??x.valor),0);
      const detalhe = cts.length
        ? `Junto saem ${cts.length} contrato(s) e ${parcelasCli.length} parcela(s) de comissão${recebido?`, incluindo ${brl(recebido)} já conciliados que somem dos relatórios`:""}.`
        : "Este cliente não tem contratos.";
      if(!await confirmar("Excluir cliente",
        `${cl?cl.nome:"Este cliente"} sai da carteira. ${detalhe} Não dá para desfazer.`,
        cts.length?`Excluir cliente e ${cts.length} contrato(s)`:"Excluir cliente", true)) break;
      for(const c of cts){ await apagarVidasDoContrato(c.id); await remover("contratos", c.id, "Excluiu junto com o cliente —"); }
      await remover("clientes", id);
      fecharModal(); toast(cts.length?`Cliente e ${cts.length} contrato(s) excluídos`:"Cliente excluído"); break;
    }

    case "addParcela": {
      editorAuto = false;
      const ult = editorParcelas[editorParcelas.length-1];
      const inicio = ctxContrato(null).inicio;
      editorParcelas.push({ tipo:"agenciamento",
        vence: ult ? addMonths(ult.vence, 1) : addMonths(inicio, 1),
        pct:0, valor:0, status:"previsto", recebidoEm:"", valorRecebido:null });
      renderEditor(); break;
    }
    case "delParcela": editorAuto = false; editorParcelas.splice(Number(el.dataset.i),1); renderEditor(); break;
    case "limparParcelas": {
      const recebidas = editorParcelas.filter(p=>p.status==="recebido").length;
      if(!await confirmar("Limpar o cronograma",
        recebidas ? `Isso apaga ${editorParcelas.length} parcela(s), sendo ${recebidas} já conciliada(s).`
                  : `Isso apaga as ${editorParcelas.length} parcela(s) desta tela.`,
        "Limpar tudo", true)) break;
      editorParcelas = []; editorAuto = false; renderEditor(); break;
    }
    case "aplicarRegua": {
      const regra = regraPorId(val("kAtalho"));
      if(!regra){ toast("Escolha uma régua."); break; }
      const ctx = ctxContrato(null);
      if(!ctx.base){ toast("Informe o valor da mensalidade ou prêmio antes de preencher pela régua."); break; }
      const falso = { valorBase:ctx.base, inicio:ctx.inicio,
        fim: val("kFim") || addDays(addMonths(ctx.inicio,12),-1), regraId:regra.id, comissoes:[] };
      const geradas = gerarCronograma(falso).map(p=>({ tipo:p.tipo, vence:p.vence, pct:p.pct, valor:p.valor,
        status:"previsto", recebidoEm:"", valorRecebido:null }));
      const recebidas = editorParcelas.filter(p=>p.status==="recebido");
      editorParcelas = recebidas.concat(geradas);
      const sel = document.getElementById("kRegra") || document.getElementById("lRegra");
      if(sel) sel.value = regra.id;
      editorAuto = true;
      renderEditor();
      toast(`${geradas.length} parcelas preenchidas${recebidas.length?" (as já conciliadas foram mantidas)":""} — edite o que precisar`);
      break;
    }
    case "calcularTotal": {
      const base = numv("kValor");
      if(!base){ toast("Informe a mensalidade, o prêmio ou o crédito primeiro."); break; }
      const ini = val("kInicio")||hoje(), fim = val("kFim");
      const meses = fim ? Math.max(1, Math.round(diasEntre(ini, fim)/30.44)) : 12;
      const pilar = val("kPilar");
      // prêmio anual e crédito de consórcio já são o valor cheio do negócio
      const total = pilar==="saude" ? base*meses : base;
      const campo = document.getElementById("kValorTotal");
      if(campo) campo.value = +total.toFixed(2);
      toast(pilar==="saude" ? `${brl(base)} × ${meses} meses = ${brl(total)}` : "Nesse pilar o valor informado já é o total do negócio");
      break;
    }
    case "montarCronograma": {
      const ctx = ctxContrato(null);
      const porVida = S.modoMontagem==="vida";
      const vidas = porVida ? (numv("qcVidas") || ctx.vidas) : 0;
      if(porVida && !vidas){ toast("Informe a quantidade de vidas."); break; }
      const fator = porVida ? vidas : 1;
      const v1 = numv("qc1")*fator, v2 = numv("qc2")*fator, v3 = numv("qc3")*fator;
      // o vitalício pode vir como % da mensalidade — aí o valor sai da base, não das vidas
      const vitEmPct = S.unidadeVit==="pct";
      const entradaVit = numv("qcDemais");
      if(vitEmPct && entradaVit && !ctx.base){ toast("Informe a mensalidade para calcular o percentual do vitalício."); break; }
      const vd = vitEmPct ? ctx.base*entradaVit/100 : entradaVit*fator;
      const di = Math.max(1, numv("qcIni")||4);
      let dm = Math.max(0, numv("qcMeses"));
      if(!v1 && !v2 && !v3 && !vd){ toast("Preencha ao menos uma comissão."); break; }
      if(vd && !dm){
        const fimVig = document.getElementById("kFim") ? val("kFim") : "";
        dm = fimVig ? Math.max(0, Math.floor(diasEntre(ctx.inicio, fimVig)/30.44) - (di-1)) : 12;
        if(!dm) dm = 12;
      }
      const recebidas = editorParcelas.filter(p=>p.status==="recebido");
      const ocupado = new Set(recebidas.map(p=>p.tipo+":"+p.vence));
      const novas = [];
      const lanca = (tipo, mes, valor) => {
        if(!(valor>0)) return;
        const vence = addMonths(ctx.inicio, mes);
        if(ocupado.has(tipo+":"+vence)) return;
        novas.push({ tipo, vence, valor:+valor.toFixed(2),
          pct: ctx.base ? +(valor/ctx.base*100).toFixed(4) : 0,
          vidas: porVida ? vidas : null,
          valorVida: porVida ? +(valor/vidas).toFixed(2) : null,
          status:"previsto", recebidoEm:"", valorRecebido:null, travado:true });
      };
      lanca("agenciamento", 1, v1);
      lanca("agenciamento", 2, v2);
      lanca("agenciamento", 3, v3);
      for(let m=0; m<dm; m++) lanca("vitalicio", di+m, vd);
      editorParcelas = recebidas.concat(novas).sort((a,b)=>(a.vence||"").localeCompare(b.vence||""));
      editorAuto = false;
      renderEditor();
      const total = editorParcelas.reduce((a,p)=>a+(Number(p.valor)||0),0);
      if(porVida && document.getElementById("kVidas") && numv("kVidas")!==vidas){
        document.getElementById("kVidas").value = vidas;
      }
      toast(`${novas.length} parcelas montadas · ${brl(total)} no total${porVida?` (${vidas} vidas)`:""}`);
      break;
    }
    case "novoContrato": abrirModal(formContrato(null), true); break;
    case "contratoParaCliente": { fecharModal(); abrirModal(formContrato({clienteId:id}), true);
      const s=document.getElementById("kCliente"); if(s) s.value=id; break; }
    case "editarContrato": abrirModal(formContrato(S.contratos.find(c=>c.id===id)), true); break;
    case "salvarContrato": await salvarContrato(id); break;
    case "abrirContrato": abrirContrato(id); break;
    case "excluirContrato": {
      if(!podeExcluirCarteira()){ toast("Só o gestor exclui contratos. Fale com ele."); break; }
      const ct = S.contratos.find(x=>x.id===id);
      const rec = ct ? (ct.comissoes||[]).filter(p=>p.status==="recebido").length : 0;
      if(await confirmar("Excluir contrato",
        `${ct?ct.clienteNome:"Este contrato"} e as ${ct?(ct.comissoes||[]).length:0} parcela(s) do cronograma serão apagados${rec?`, incluindo ${rec} já conciliada(s)`:""}. Não dá para desfazer.`,
        "Excluir contrato", true)){
        await apagarVidasDoContrato(id);
        await remover("contratos", id); fecharModal(); toast("Contrato excluído"); } break;
    }
    case "renovar": {
      const c = S.contratos.find(x=>x.id===id); if(!c) break;
      const novo = Object.assign({}, c, { id:uid("ctr"), inicio:addDays(c.fim,1), fim:addMonths(c.fim,12),
        valorBase:Math.round(Number(c.valorBase)*1.12), status:"proposta", numero:"", criadoEm:hoje() });
      novo.comissoes = (c.comissoes||[]).map((p,i)=>({ ...p, n:i+1,
        vence: addMonths(p.vence, 12),
        valor: p.pct>0 ? +(novo.valorBase*p.pct/100).toFixed(2) : p.valor,
        status:"previsto", recebidoEm:"", valorRecebido:null }));
      abrirModal(formContrato(novo), true);
      toast("Renovação pré-preenchida com reajuste de 12% — ajuste antes de salvar"); break;
    }

    case "conciliar": {
      const c = S.contratos.find(x=>x.id===id); if(!c) break;
      const p = c.comissoes.find(x=>x.n===Number(el.dataset.n)); if(!p) break;
      p.status="recebido"; p.recebidoEm=hoje(); p.valorRecebido=p.valor;
      await salvar("contratos", c, `Conciliou a parcela ${p.n} de`);
      if($("#scrim").classList.contains("open")) abrirContrato(c.id);
      toast("Parcela conciliada"); break;
    }
    case "desconciliar": {
      if(!podeDesfazer()){ toast("Só o gestor desfaz um recebimento."); break; }
      const c = S.contratos.find(x=>x.id===id); if(!c) break;
      const p = c.comissoes.find(x=>x.n===Number(el.dataset.n)); if(!p) break;
      p.status="previsto"; p.recebidoEm=""; p.valorRecebido=null;
      await salvar("contratos", c, `Desfez a conciliação da parcela ${p.n} de`);
      if($("#scrim").classList.contains("open")) abrirContrato(c.id);
      toast("Conciliação desfeita"); break;
    }
    case "conciliarLote": {
      const f=S.filtros;
      let alvo = parcelas().filter(p=>noEscopo(p,"corretor") && p.status!=="recebido");
      if(f.status==="atrasado") alvo=alvo.filter(p=>p.vencida); else if(f.status) alvo=alvo.filter(p=>p.status===f.status);
      if(f.mes) alvo=alvo.filter(p=>p.mes===f.mes);
      if(f.corretor) alvo=alvo.filter(p=>p.corretor===f.corretor);
      if(f.tipo) alvo=alvo.filter(p=>p.tipo===f.tipo);
      if(!alvo.length){ toast("Nada a conciliar neste filtro."); break; }
      if(!await confirmar("Conciliar em lote",
        `${alvo.length} parcela(s) serão marcadas como recebidas, somando ${brl(alvo.reduce((a,p)=>a+valorVis(p),0))}${veCorretora()?"":" para você"}.`,
        "Marcar como recebidas")) break;
      const porContrato = {};
      alvo.forEach(p=>{ (porContrato[p.contratoId] = porContrato[p.contratoId]||[]).push(p.n); });
      for(const [cid, ns] of Object.entries(porContrato)){
        const c = S.contratos.find(x=>x.id===cid); if(!c) continue;
        c.comissoes.forEach(p=>{ if(ns.includes(p.n)){ p.status="recebido"; p.recebidoEm=hoje(); p.valorRecebido=p.valor; } });
        await salvar("contratos", c, `Conciliou ${ns.length} parcela(s) de`);
      }
      toast(`${alvo.length} parcelas conciliadas`); break;
    }

    case "tarefasDeCobranca": {
      const atrasadas = parcelas().filter(p=>p.vencida && noEscopo(p,"corretor"));
      const porOperadora = {};
      atrasadas.forEach(p=>{ const k=p.operadora||"Sem operadora"; (porOperadora[k]=porOperadora[k]||[]).push(p); });
      const ops = Object.entries(porOperadora);
      if(!ops.length){ toast("Nada em atraso para cobrar."); break; }
      const jaExiste = t => S.tarefas.some(x=>x.status!=="feita" && x.titulo===t);
      let criadas = 0;
      for(const [op, ps2] of ops){
        const titulo = `Cobrar ${op}: ${ps2.length} parcela(s), ${brl(ps2.reduce((a,p)=>a+valorVis(p),0))}`;
        if(jaExiste(titulo)) continue;
        await salvar("tarefas", { id:uid("tar"), titulo, tipo:"Cobrança", refTipo:"comissao", refId:"",
          refNome:`${ps2.length} parcela(s) em atraso`, responsavel:S.uid||"", vence:addDays(hoje(),2),
          status:"aberta", criadoEm:hoje() }, "Abriu cobrança de comissão —");
        criadas++;
      }
      toast(criadas?`${criadas} tarefa(s) de cobrança criada(s)`:"As cobranças já estavam na agenda");
      ir("tarefas"); break;
    }
    case "excluirLote": {
      if(!podeDesfazer()){ toast("Só o gestor exclui parcelas de comissão."); break; }
      const f = S.filtros;
      let alvo = parcelas().filter(x=>noEscopo(x,"corretor"));
      if(f.status==="atrasado") alvo=alvo.filter(x=>x.vencida); else if(f.status) alvo=alvo.filter(x=>x.status===f.status);
      if(f.mes) alvo=alvo.filter(x=>x.mes===f.mes);
      if(f.corretor) alvo=alvo.filter(x=>x.corretor===f.corretor);
      if(f.tipo) alvo=alvo.filter(x=>x.tipo===f.tipo);
      if(!alvo.length){ toast("Nada para excluir neste filtro."); break; }
      const recebidas = alvo.filter(x=>x.status==="recebido");
      if(!await confirmar("Excluir comissões do filtro",
        `${alvo.length} parcela(s) somando ${brl(alvo.reduce((a,x)=>a+valorVis(x),0))} saem dos cronogramas${recebidas.length?`, incluindo ${recebidas.length} já conciliada(s)`:""}. Não dá para desfazer.`,
        `Excluir ${alvo.length} parcela(s)`, true)) break;
      const porContrato = {};
      alvo.forEach(x=>{ (porContrato[x.contratoId] = porContrato[x.contratoId]||[]).push(x.n); });
      for(const [cid, ns] of Object.entries(porContrato)){
        const ct = S.contratos.find(x=>x.id===cid); if(!ct) continue;
        ct.comissoes = (ct.comissoes||[]).filter(x=>!ns.includes(x.n)).map((x,i)=>({...x, n:i+1}));
        await salvar("contratos", ct, `Excluiu ${ns.length} parcela(s) de comissão de`);
      }
      toast(`${alvo.length} parcelas excluídas`); break;
    }
    case "novaParcela": {
      if(!veCorretora()){ toast("Quem lança comissão é o gestor."); break; }
      const alvo = id || (S.contratos.filter(x=>noEscopo(x,"corretor") && x.status!=="cancelado")[0]||{}).id;
      if(!alvo){ toast("Registre um contrato antes de lançar comissões."); break; }
      abrirModal(formParcela(alvo, null)); break;
    }
    case "editarParcela": if(!podeDesfazer()){ toast("Só o gestor altera uma parcela lançada."); break; } abrirModal(formParcela(id, el.dataset.n)); break;
    case "salvarParcela": if(!podeDesfazer()){ toast("Só o gestor altera uma parcela lançada."); break; } await salvarParcela(id, el.dataset.n); break;
    case "excluirParcela": {
      if(!podeDesfazer()){ toast("Só o gestor exclui parcelas de comissão."); break; }
      const c = S.contratos.find(x=>x.id===id); if(!c) break;
      const p = (c.comissoes||[]).find(x=>String(x.n)===String(el.dataset.n));
      if(!await confirmar("Excluir parcela",
        `A parcela de ${p?brl2(veCorretora()?p.valor:(Number(p.valor)||0)*(Number(c.splitPct)||0)/100):"comissão"} com vencimento em ${p?dt(p.vence):"—"} sai do cronograma.`,
        "Excluir parcela", true)) break;
      c.comissoes = (c.comissoes||[]).filter(x=>String(x.n)!==String(el.dataset.n)).map((x,i)=>({...x, n:i+1}));
      await salvar("contratos", c, "Removeu uma parcela de comissão de");
      if($("#scrim").classList.contains("open")){
        if(document.getElementById("pcValor")) fecharModal(); else abrirContrato(c.id);
      }
      toast("Parcela excluída"); break;
    }
    case "novaDespesa": abrirModal(formDespesa()); break;
    case "editarDespesa": abrirModal(formDespesa(S.despesas.find(x=>x.id===id))); break;
    case "salvarDespesa": await salvarDespesa(id); break;
    case "excluirDespesa": {
      const d = S.despesas.find(x=>x.id===id);
      if(!await confirmar("Excluir gasto", `${d?`${d.descricao} — ${brl2(d.valor)}`:"Este lançamento"} sai do balanço do mês.`, "Excluir gasto", true)) break;
      await remover("despesas", id);
      if($("#scrim").classList.contains("open")) fecharModal();
      toast("Gasto excluído"); break;
    }
    case "mesDespesa": {
      const v = Number(el.dataset.v);
      S.mesDespesas = v===0 ? mesAtual() : addMonths(mesDespesas()+"-01", v).slice(0,7);
      render(); break;
    }
    case "repetirRecorrentes": {
      const m = mesDespesas(), mAnt = addMonths(m+"-01",-1).slice(0,7);
      const atuais = despesasDoMes(m);
      const fixos = despesasDoMes(mAnt).filter(d=>d.recorrente && !atuais.some(x=>x.descricao===d.descricao));
      if(!fixos.length){ toast("Nada a repetir."); break; }
      if(!await confirmar("Repetir gastos fixos",
        `${fixos.length} lançamento(s) de ${mesLabel(mAnt)}, somando ${brl(fixos.reduce((a,d)=>a+d.valor,0))}, serão copiados para ${mesLabel(m)} com a mesma data do mês.`,
        `Copiar ${fixos.length} gasto(s)`)) break;
      const ultimoDia = new Date(+m.slice(0,4), +m.slice(5,7), 0).getDate();
      for(const d of fixos){
        const dia = Math.min(+d.data.slice(8,10), ultimoDia);
        await salvar("despesas", Object.assign({}, d, { id:uid("des"),
          data:`${m}-${String(dia).padStart(2,"0")}`, criadoEm:hoje() }), "Repetiu o gasto fixo");
      }
      toast(`${fixos.length} gasto(s) copiados para ${mesLabel(m)}`); break;
    }
    case "novaVida": abrirModal(formVida(null, el.dataset.contrato||"")); break;
    case "editarVida": { const v=(S.vidas||[]).find(x=>x.id===id); if(v) abrirModal(formVida(v)); break; }
    case "salvarVida": await salvarVida(id); break;
    case "excluirVidaDoPlano": await excluirDoPlano(id); break;
    case "apagarVida": {
      const v=(S.vidas||[]).find(x=>x.id===id); if(!v) break;
      if(!await confirmar("Apagar registro de vida",
        `${v.nome} sai do sistema por completo, inclusive do histórico. Para tirar do plano mantendo o registro, use "Excluir do plano".`,
        "Apagar mesmo assim", true)) break;
      await remover("vidas", id, "Apagou o registro de vida de");
      fecharModal(); toast("Registro apagado"); break; }
    case "detalharVidas": abrirModal(formDetalhar(id)); break;
    case "salvarDetalhe": await salvarDetalhe(id); break;
    case "maisClientes": S.pagClientes = (S.pagClientes||1)+1; render(); break;
    case "maisVidas": S.pagVidas = (S.pagVidas||1)+1; render(); break;
    case "maisComissoes": S.pagComissoes = (S.pagComissoes||1)+1; render(); break;
    case "maisContratos": S.pagContratos = (S.pagContratos||1)+1; render(); break;
    case "tipoVidaMudou": break;
    case "exportarVidas": exportarCSVVidas(); break;
    case "conferirDoc": conferirDoc(el.dataset.id); break;
    case "exportarClientes": exportarCSVClientes(); break;
    case "exportarContratos": exportarCSVContratos(); break;
    case "exportarComissoes": exportarCSVComissoes(); break;
    case "tarefaCrossSell": {
      const cli = S.clientes.find(x=>x.id===id); if(!cli) break;
      const pil = el.dataset.p || "seguros";
      abrirModal(formTarefa({ titulo:`Oferecer ${PILARES[pil].curto} para ${cli.nome}`, tipo:"Ligação",
        refTipo:"cliente", refId:cli.id, refNome:cli.nome, vence:addDays(hoje(),2) }));
      break; }
    case "ir": ir(el.dataset.view); break;
    case "avisarFaixa": {
      const v=(S.vidas||[]).find(x=>x.id===id); if(!v) break;
      const ct=contratoPorId(v.contratoId); const prox=proximoAniversario(v.nascimento);
      const idade=idadeEm(v.nascimento, prox);
      abrirModal(formTarefa({ titulo:`Avisar ${ct?ct.clienteNome:"o cliente"}: ${v.nome} faz ${idade} anos em ${dt(prox)} e muda de faixa etária`,
        tipo:"WhatsApp", refTipo:"cliente", refId:ct?ct.clienteId:"", refNome:ct?ct.clienteNome:"", vence:addDays(hoje(),1) }));
      break; }
    case "avisarReajuste": {
      const c=contratoPorId(id); if(!c) break;
      abrirModal(formTarefa({ titulo:`Preparar ${c.clienteNome} para o reajuste anual de ${MESES[Number(c.mesReajuste)-1]} (${c.operadora||""})`,
        tipo:"Reunião", refTipo:"cliente", refId:c.clienteId, refNome:c.clienteNome, vence:addDays(hoje(),3) }));
      break; }
    case "parabenizar": {
      const cli=S.clientes.find(x=>x.id===id); if(!cli) break;
      abrirModal(formTarefa({ titulo:`Parabenizar ${cli.nome}`, tipo:"WhatsApp",
        refTipo:"cliente", refId:cli.id, refNome:cli.nome, vence:proximoAniversario(cli.nascimento) }));
      break; }
    /* v30: relatórios, previsão, cotas, aniversários */
    case "baixarRel": {
      const f = S.filtros;
      const tipo = el.dataset.tipo || ({ comissoes:"comissoes", contratos:"contratos", clientes:"carteira", vidas:"vidas", relatorios:"contratos" }[S.view]) || "carteira";
      const pre = {};
      if(S.view==="comissoes" && tipo==="comissoes"){
        Object.assign(pre, { pilar:f.pilar||"", corretor:f.corretor||"", tipoParcela:f.tipo||"", situacao: f.status||"" });
        if(f.mes){ pre.periodo = "custom"; pre.de = f.mes+"-01"; pre.ate = addDays(addMonths(f.mes+"-01",1),-1); }
      }
      if(S.view==="comissoes" && tipo==="previsao") Object.assign(pre, { pilar:f.pilar||"", corretor:f.corretor||"", modo:modoPrevisao() });
      if(S.view==="vidas") Object.assign(pre, { conteudo: el.dataset.conteudo||"ambos", operadora:f.operadora||"", corretor:f.corretor||"",
        pilar: (S.abaVidas!=="cotas" && f.pilar) ? f.pilar : "" });
      if(S.view==="relatorios"){ const per = f.periodo || "t12";
        Object.assign(pre, { pilar:f.pilar||"", operadora:f.operadora||"", corretor:f.corretor||"",
          periodo: REL_PERIODOS[per] ? per : "t12", de:f.de||"", ate:f.ate||"" }); }
      if(!escopoTravado() && pre.corretor===undefined) pre.corretor = "";
      abrirRelatorio(tipo, pre); break; }
    case "relTipo": { const fmt = S.rel ? S.rel.formato : "xlsx"; S.rel = relPadrao(el.dataset.v, { formato:fmt }); abrirModal(formRelatorio(), true); break; }
    case "relFormato": if(S.rel){ S.rel.formato = el.dataset.v==="pdf" ? "pdf" : "xlsx"; abrirModal(formRelatorio(), true); } break;
    case "gerarRel": await gerarRelatorio(); break;
    case "prevModo": S.prevModo = el.dataset.v; render(); break;
    case "abaVidas": S.abaVidas = el.dataset.v==="cotas" ? "cotas" : "vidas"; S.filtros = {}; S.busca = ""; zerarPaginas(); render(); break;
    case "parabenizou": await marcarParabenizado(id, el.dataset.quem, el.dataset.prox); toast("Aniversário marcado como parabenizado"); mostrarLembrete(); break;
    case "agendarAniv": {
      const cli = S.clientes.find(x=>x.id===id); if(!cli) break;
      const quem = el.dataset.quem, nome = quem==="contato" ? (cli.contatoNome||"o contato principal") : cli.nome;
      abrirModal(formTarefa({ titulo: quem==="empresa" ? `Parabenizar ${cli.nome} pelo aniversário da empresa`
          : `Parabenizar ${nome}${quem==="contato"?` (${cli.nome})`:""} pelo aniversário`,
        tipo:"WhatsApp", refTipo:"cliente", refId:cli.id, refNome:cli.nome, vence: el.dataset.prox || hoje() }));
      break; }
    case "novaTarefa": abrirModal(formTarefa()); break;
    case "salvarTarefa": await salvarTarefa(el.dataset.ref, id); break;
    case "editarTarefa": { const t=S.tarefas.find(x=>x.id===id); if(t) abrirModal(formTarefa(t)); break; }
    case "concluirTarefa": { const t=S.tarefas.find(x=>x.id===id); if(t){ t.status="feita"; t.feitaEm=hoje(); await salvar("tarefas",t,"Concluiu"); toast("Tarefa concluída"); mostrarLembrete(); } break; }
    case "reabrirTarefa": { const t=S.tarefas.find(x=>x.id===id); if(t){ t.status="aberta"; await salvar("tarefas",t); mostrarLembrete(); } break; }
    case "excluirTarefa": await remover("tarefas", id); mostrarLembrete(); break;

    /* prorrogação */
    case "adiarTarefa": { const t=S.tarefas.find(x=>x.id===id); if(t) abrirModal(formAdiar(t)); break; }
    case "adiarDias": {
      await prorrogarTarefa(id, el.dataset.d);
      if($("#scrim").classList.contains("open") && document.getElementById("adData")) fecharModal();
      break; }
    case "adiarData": {
      const t = S.tarefas.find(x=>x.id===id); const d = val("adData");
      if(!t || !d){ toast("Escolha uma data."); break; }
      await salvar("tarefas", Object.assign({}, t, { vence:d, status:"aberta", adiada:(Number(t.adiada)||0)+1 }), "Prorrogou a tarefa");
      fecharModal(); toast(`Adiada para ${dt(d)}`); mostrarLembrete(); break; }
    case "empurrarData": {
      const campo = document.getElementById("tVence"); if(!campo) break;
      const partida = (campo.value||hoje()) > hoje() ? campo.value : hoje();
      campo.value = addDays(partida, Number(el.dataset.d)||1); break; }

    /* pop-up de lembrete */
    case "fecharLembrete": adiarAviso(120); break;
    case "soneca": adiarAviso(Number(el.dataset.min)||60); break;
    case "irAgenda": { const lb=document.getElementById("lembrete"); if(lb) lb.classList.remove("show"); ir("tarefas"); break; }

    case "salvarLogo": {
      const bruto = (val("cfLogo")||"").trim();
      if(bruto && !/^<svg[\s>]/i.test(bruto) && !/^https?:\/\//i.test(bruto)){
        toast("Cole o conteúdo do arquivo .svg (começa com <svg) ou um endereço http."); break; }
      S.config.logoSvg = bruto;
      await salvarConfig("Atualizou a marca do sistema");
      pintarMarca(); toast(bruto?"Escudo aplicado":"Escudo removido"); render(); break; }
    case "limparLogo": {
      S.config.logoSvg = "";
      await salvarConfig("Removeu o escudo do sistema");
      pintarMarca(); toast("Escudo removido"); render(); break; }

    case "novaRegra": abrirModal(formRegra()); break;
    case "editarRegra": abrirModal(formRegra(regraPorId(id))); break;
    case "salvarRegra": await salvarRegra(id); break;
    case "excluirRegra": {
      if(S.contratos.some(c=>c.regraId===id)){ toast("Há contratos usando esta régua — ela não pode ser excluída."); break; }
      if(!await confirmar("Excluir régua", "A régua sai das opções de preenchimento. Os contratos já criados não mudam.", "Excluir régua", true)) break;
      S.config.regras = S.config.regras.filter(r=>r.id!==id);
      await salvarConfig(); fecharModal(); toast("Régua excluída"); break;
    }
    case "novoMembro": abrirModal(formMembro()); break;
    case "salvarMembro": await salvarMembro(); break;
    case "vinculo": break;
    case "liberarUsuario": {
      const u = S.usuarios.find(x=>x.id===id); if(!u) break;
      const sel = document.querySelector(`[data-act="vinculo"][data-id="${id}"]`);
      if(sel && sel.value){
        const manual = S.usuarios.find(x=>x.id===sel.value);
        if(await confirmar("Vincular acesso",
          `${u.nome} passa a ser o acesso de ${manual?manual.nome:"—"}. A carteira, as metas e o split do cadastro existente vão junto, e o cadastro provisório é removido.`,
          "Vincular e liberar")){
          await vincularMembro(id, sel.value);
        }
        break;
      }
      const papel = u.papel || "corretor";
      await salvar("usuarios", Object.assign({}, u, {status:"ativo", papel, ativo:true}), `Liberou o acesso de`);
      toast(`${u.nome} liberado como ${PAPEIS[papel]}`); break;
    }
    case "papelPendente": break;
    case "recusarUsuario": {
      const u = S.usuarios.find(x=>x.id===id); if(!u) break;
      if(!await confirmar("Recusar acesso",
        `${u.nome} não entra na equipe e volta a ver a tela de espera ao abrir o sistema.`, "Recusar acesso", true)) break;
      await salvar("usuarios", Object.assign({}, u, {status:"bloqueado"}), "Recusou o acesso de");
      toast("Acesso recusado"); break;
    }
    case "excluirMembro": {
      const u = S.usuarios.find(x=>x.id===id); if(!u) break;
      const vinculados = ["leads","clientes","contratos","tarefas"].reduce((a,col)=>
        a + S[col].filter(x=>x.responsavel===id||x.corretor===id).length, 0);
      if(!await confirmar("Remover da equipe",
        `${u.nome} sai da lista.${vinculados?` ${vinculados} registro(s) ficam sem responsável — reatribua depois.`:""}`,
        "Remover", true)) break;
      await remover("usuarios", id); toast("Membro removido"); break;
    }
    case "editarUsuario": {
      if(S.mePapel!=="gestor"){ toast("Só o gestor altera a equipe."); break; }
      abrirModal(formUsuario(S.usuarios.find(u=>u.id===id))); break;
    }
    case "salvarUsuario": {
      const u = S.usuarios.find(x=>x.id===id); if(!u) break;
      u.nome=val("uNome")||u.nome; u.papel=val("uPapel"); u.meta=numv("uMeta"); u.splitPct=numv("uSplit");
      u.status=val("uStatus")||"ativo"; u.verTudo = val("uVerTudo")==="1";
      if(u.id===S.uid && S.souDono){ u.papel="gestor"; u.status="ativo"; }
      if(u.id===S.uid){ S.meNome=u.nome; S.mePapel=u.papel; }
      await salvar("usuarios", u); fecharModal(); toast("Equipe atualizada"); break;
    }

    case "addItem": {
      const v = await pedirTexto("Novo item", el.dataset.path.includes("operadoras")?"Nome da operadora"
        : el.dataset.path.includes("produtos")?"Nome do produto" : "Nome do item", "", "Digite e pressione Enter");
      if(!v) break;
      aplicarCaminho(el.dataset.path, arr=>arr.includes(v)?arr:arr.concat(v));
      await salvarConfig(); break;
    }
    case "delItem": {
      aplicarCaminho(el.dataset.path, arr=>arr.filter(x=>x!==el.dataset.v));
      await salvarConfig(); break;
    }
    case "sair": {
      if(!await confirmar("Sair da conta", "Você volta para a tela de entrada. Os dados ficam salvos no servidor.", "Sair")) break;
      await S.db.auth.signOut(); break;
    }
    case "importar": {
      abrirModal(`
        <div class="m-head"><div><h2>Importar backup</h2>
          <div class="sub">Cole o JSON gerado pelo botão “Baixar backup” da versão anterior</div></div></div>
        <div class="m-body">
          <div class="field"><label for="impTxt">Conteúdo do backup</label>
            <textarea id="impTxt" style="min-height:230px;font-family:var(--mono);font-size:11px" placeholder='{"config":{…},"leads":[…],"clientes":[…]}'></textarea></div>
          <div class="hint">Registros com o mesmo identificador são sobrescritos. O que já existe e não está no backup permanece.</div>
        </div>
        <div class="m-foot"><button class="btn" data-act="fechar">Cancelar</button>
          <button class="btn primary" data-act="confirmarImport">Importar</button></div>`, true);
      break;
    }
    case "confirmarImport": {
      let dados;
      try{ dados = JSON.parse(val("impTxt")); }
      catch(err){ toast("O conteúdo não é um JSON válido."); break; }
      let n = 0;
      for(const col of ["clientes","contratos","vidas","leads","tarefas","despesas"]){
        for(const item of (dados[col]||[])){
          if(!item || !item.id) continue;
          const { error } = await S.db.from(col)
            .upsert({ id:item.id, dono:donoDe(col,item), dados:item }, { onConflict:"id" });
          if(!error) n++;
        }
      }
      if(dados.config){
        const limpa = Object.assign({}, dados.config);
        delete limpa.membrosManuais;
        S.config = Object.assign(clonar(DEFAULT_CONFIG), clonar(limpa), {membrosManuais:S.config.membrosManuais||[]});
        await salvarConfig();
      }
      await carregarTudo();
      fecharModal();
      toast(`${n} registro(s) importados`);
      break;
    }
    case "exportar": {
      const dados = { exportadoEm:new Date().toISOString(), config:S.config, leads:S.leads,
                      clientes:S.clientes, contratos:S.contratos, vidas:S.vidas,
                      tarefas:S.tarefas, despesas:S.despesas, usuarios:S.usuarios };
      const texto = JSON.stringify(dados,null,2);
      try{ if(!await entregarArquivo(`erbe-backup-${hoje()}.json`, texto)) throw new Error("sem download"); }
      catch(err){ abrirModal(`<div class="m-head"><div><h2>Backup</h2><div class="sub">Copie o conteúdo abaixo</div></div></div>
        <div class="m-body"><textarea style="min-height:320px;font-family:var(--mono);font-size:11px">${esc(texto)}</textarea></div>
        <div class="m-foot"><button class="btn primary" data-act="fechar">Fechar</button></div>`, true); }
      break;
    }
    case "limparExemplos": {
      const n = ["leads","clientes","contratos","tarefas","usuarios"].reduce((a,k)=>a+S[k].filter(x=>x.exemplo).length,0);
      if(!n){ toast("Não há dados de exemplo."); break; }
      if(!await confirmar("Apagar dados de exemplo", `${n} registro(s) marcados como exemplo serão apagados. Seus dados reais permanecem.`, "Apagar exemplos", true)) break;
      for(const k of ["leads","clientes","contratos","tarefas","usuarios"]){
        for(const x of S[k].filter(x=>x.exemplo)) await remover(k, x.id);
      }
      toast("Dados de exemplo apagados"); break;
    }
  }
});
function aplicarCaminho(path, fn){
  const [a,b] = path.split(".");
  if(b) S.config[a][b] = fn(S.config[a][b]||[]);
  else S.config[a] = fn(S.config[a]||[]);
}
document.addEventListener("change", e=>{
  const cel = e.target.closest("[data-linha]");
  if(cel){ editarLinha(Number(cel.dataset.linha), cel.dataset.campo, cel.value); return; }
  if(e.target.id==="lPilar" || e.target.id==="lPrev"){ renderEditor(); return; }
  if(e.target.id==="kInicio" || e.target.id==="kFim"){
    if(editorAuto && editorAlvo==="contrato" && val("kRegra")) preencherPelaRegua(val("kRegra"), true);
    else { const ip = document.getElementById("impactoPrev"); if(ip) ip.innerHTML = impactoPrevisao(); }
    return;
  }
  const el = e.target.closest("[data-act]"); if(!el) return;
  if(el.dataset.act==="filtro"){ S.filtros[el.dataset.k] = el.value; zerarPaginas(); render(); }
  if(el.dataset.act==="recalcBase") rebaseParcelas();
  if(el.dataset.act==="recalcSplit") atualizarDerivados();
  if(el.dataset.act==="recalcVidas") renderEditor();
  if(el.dataset.act==="diasAviso"){
    S.config.diasAvisoComissao = Math.min(120, Math.max(1, Number(el.value)||7));
    salvarConfig();
  }
  if(el.dataset.act==="descrPapel"){
    const d = document.getElementById("uDescrPapel");
    if(d) d.textContent = DESCR_PAPEL[el.value] || "";
  }
  if(el.dataset.act==="salvarMetaGlobal"){
    S.config.metaGlobal = Math.max(0, Number(el.value)||0);
    salvarConfig();
  }
  if(el.dataset.act==="papelPendente"){
    const u = S.usuarios.find(x=>x.id===el.dataset.id);
    if(u) salvar("usuarios", Object.assign({}, u, {papel:el.value}));
  }
  if(el.dataset.act==="salvarCadencia"){
    const cli = S.clientes.find(x=>x.id===el.dataset.id);
    if(cli){ cli.posVendaCadencia = Math.max(7, Number(el.value)||90);
      salvar("clientes", cli, "Ajustou a cadência de pós-venda de").then(()=>abrirCliente(cli.id)); }
  }
  if(el.dataset.act==="recalcRegra"){ const el2=document.getElementById("previewRegra"); if(el2) el2.innerHTML=previewRegra(); }
  if(el.dataset.act==="recalcPilar") trocarPilar();
  if(el.dataset.act==="trocaRegua") trocouRegua();
  if(el.dataset.act==="relCampo" && S.rel){
    const k = el.dataset.k; S.rel[k] = el.value;
    if(k==="periodo" && el.value==="custom"){ S.rel.de = S.rel.de || addMonths(hoje(),-12); S.rel.ate = S.rel.ate || hoje(); }
    if(k==="periodo") abrirModal(formRelatorio(), true);
    else { const pv = document.getElementById("relPrevia"); if(pv) pv.innerHTML = previaRelatorio(); }
  }
  if(el.dataset.act==="tipoCliente"){
    const pf = el.value==="PF";
    const l = document.getElementById("lblNasc"); if(l) l.textContent = pf ? "Data de nascimento" : "Data de fundação";
    const d = document.getElementById("dicaNasc"); if(d) d.textContent = pf ? "Entra no lembrete de aniversário." : "Aniversário da empresa — também entra no lembrete.";
    const b = document.getElementById("blocoContatoPJ"); if(b) b.hidden = pf;
  }
  if(el.dataset.act==="cfgNum"){
    const k = el.dataset.k, mn = Number(el.dataset.min), mx = Number(el.dataset.max);
    S.config[k] = Math.min(mx, Math.max(mn, paraNumero(el.value)));
    salvarConfig();
  }
  if(el.dataset.act==="cfgTexto"){ S.config[el.dataset.k] = el.value; salvarConfig(); }
  if(el.dataset.act==="mudouStatusContrato"){
    const cx = document.getElementById("campoCancelamento");
    if(cx) cx.style.display = el.value==="cancelado" ? "" : "none";
  }
  if(el.dataset.act==="trocaStatusParcela"){
    const rec = el.value==="recebido";
    const a=document.getElementById("campoRecebidoEm"), b=document.getElementById("campoValorRecebido");
    if(a) a.hidden=!rec; if(b) b.hidden=!rec;
    espelharRecebido();
  }
  if(el.dataset.act==="trocaContratoParcela"){
    const c = S.contratos.find(x=>x.id===el.value);
    const info = document.getElementById("pcInfo");
    const ult = c && (c.comissoes||[]).length ? (c.comissoes||[]).slice().sort((x,y)=>x.vence.localeCompare(y.vence)).pop() : null;
    if(info && c) info.textContent = `Base de ${brl(c.valorBase)} · ${(c.comissoes||[]).length} parcela(s) hoje${ult?`, última em ${dt(ult.vence)}`:""}`;
    const v = document.getElementById("pcVence");
    if(v && ult) v.value = addMonths(ult.vence,1);
  }
  if(el.dataset.act==="mudarEtapa"){ fecharModal(); moverLead(el.dataset.id, el.value); }
  if(el.dataset.act==="mudarEtapaCliente"){ moverCliente(el.dataset.id, el.value); }
});
let tBusca, tBase;
document.addEventListener("input", e=>{
  if(e.target.id==="xDoc"){ conferirDoc(e.target.dataset.id); return; }
  const mont = e.target.closest('[data-act="pctMontagem"]');
  if(mont){
    const base = ctxContrato(null).base;
    const porVida = S.modoMontagem==="vida";
    const vidas = porVida ? (numv("qcVidas") || ctxContrato(null).vidas) : 0;
    const atualiza = (campo, alvo) => {
      const c = document.getElementById(campo), a = document.getElementById(alvo);
      if(c && a) a.innerHTML = dicaPct(c.value, base, porVida, vidas, campo==="qcDemais");
    };
    if(mont.id==="qcVidas"){ atualiza("qc1","qcPct1"); atualiza("qc2","qcPct2"); atualiza("qc3","qcPct3"); atualiza("qcDemais","qcPctD"); }
    else atualiza(mont.id, { qc1:"qcPct1", qc2:"qcPct2", qc3:"qcPct3", qcDemais:"qcPctD" }[mont.id]);
    return;
  }
  if(e.target.id==="pcValorRecebido"){ e.target.dataset.tocado="1"; return; }
  if(e.target.id==="pcValor"){ espelharRecebido(); return; }
  const cel = e.target.closest('[data-linha][data-campo="pct"],[data-linha][data-campo="valor"]');
  if(cel){ editarLinha(Number(cel.dataset.linha), cel.dataset.campo, cel.value); return; }
  const base = e.target.closest('[data-act="recalcBase"]');
  if(base){ clearTimeout(tBase); tBase=setTimeout(rebaseParcelas, 400); return; }
  const sp = e.target.closest('[data-act="recalcSplit"]');
  if(sp){ atualizarDerivados(); return; }
  const rr = e.target.closest('[data-act="recalcRegra"]');
  if(rr){ const el2=document.getElementById("previewRegra"); if(el2) el2.innerHTML=previewRegra(); return; }
  const el = e.target.closest('[data-act="busca"]'); if(!el) return;
  clearTimeout(tBusca);
  const v = el.value;
  tBusca = setTimeout(()=>{ S.busca=v; S.pagClientes=1; S.pagVidas=1; S.pagContratos=1; S.pagComissoes=1; const pos=el.selectionStart; render();
    const novo=document.getElementById(el.id); if(novo){ novo.focus(); try{novo.setSelectionRange(pos,pos);}catch(err){} } }, 250);
});

boot();
