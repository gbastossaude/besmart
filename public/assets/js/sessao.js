/* Erbe · Central — sessao.js
   Entrada no sistema, carga de dados, tempo real, tema, navegação e render.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
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
  const tela = telaInicialDaUrl();
  if(tela) S.view = tela;
  mostrarSistema();
  montarNav();
  render();
  await carregarTudo();
  ligarTempoReal();
}

const TABELAS = ["perfis","leads","clientes","contratos","vidas","tarefas","despesas","atividade"];
/** Coleções de registros (tabela com id/dono/dados) e o nome delas no estado S. */
const COLECOES = ["leads","clientes","contratos","vidas","tarefas","despesas"];
/** O PostgREST do Supabase devolve no máximo 1.000 linhas por pedido (max_rows).
    Antes, a carteira acima disso sumia em silêncio. Aqui a leitura vem em páginas
    ordenadas pela chave primária até acabar. */
const TAM_PAGINA = 1000;
async function lerTabela(tabela){
  const linhas = [];
  for(let de = 0; ; de += TAM_PAGINA){
    const { data, error } = await S.db.from(tabela).select("*").order("id",{ascending:true}).range(de, de+TAM_PAGINA-1);
    if(error) throw Object.assign(new Error(error.message), { tabela, causa:error });
    linhas.push(...(data||[]));
    if(!data || data.length < TAM_PAGINA) return linhas;
  }
}
const deLinha = x => Object.assign({ id:x.id }, clonar(x.dados||{}));
async function carregarTudo(){
  const falhas = [];
  const ler = (t, fn) => fn().catch(e=>{ falhas.push(t); registrarErro(e, { operacao:"carregar "+t }); return null; });
  const [perfis, leads, clientes, contratos, tarefas, despesas, vidas, atividade, config] = await Promise.all([
    ler("perfis",   ()=>lerTabela("perfis")),
    ler("leads",    ()=>lerTabela("leads")),
    ler("clientes", ()=>lerTabela("clientes")),
    ler("contratos",()=>lerTabela("contratos")),
    ler("tarefas",  ()=>lerTabela("tarefas")),
    // despesas são só do gestor: para os demais a RLS devolve zero linhas, sem erro
    ler("despesas", ()=>lerTabela("despesas")),
    ler("vidas",    ()=>lerTabela("vidas")),
    ler("atividade",async ()=>{ const r = await S.db.from("atividade").select("*").order("quando",{ascending:false}).limit(300);
                                if(r.error) throw new Error(r.error.message); return r.data||[]; }),
    ler("config",   async ()=>{ const r = await S.db.from("config").select("*").eq("id","app").maybeSingle();
                                if(r.error) throw new Error(r.error.message); return r.data; })
  ]);
  // Tabela que falhou mantém o que já estava na tela: nunca troca dado bom por lista vazia.
  if(config && config.dados) S.config = Object.assign(clonar(DEFAULT_CONFIG), clonar(config.dados));
  if(leads) S.leads = leads.map(deLinha);
  if(clientes) S.clientes = clientes.map(deLinha);
  if(contratos) S.contratos = contratos.map(deLinha);
  if(tarefas) S.tarefas = tarefas.map(deLinha);
  if(despesas) S.despesas = despesas.map(deLinha);
  if(vidas) S.vidas = vidas.map(deLinha);
  if(atividade) S.atividade = atividade.map(deLinha);
  if(perfis){
    S.usuarios = perfis.map(dePerfil).concat(S.config.membrosManuais||[]);
    S.usuariosCarregados = true;
  }
  COLECOES.forEach(registrarSombras);
  invalidarIndices();
  atualizarMeuPapel();
  if(falhas.length) banner(`Parte dos dados não carregou (${falhas.join(", ")}). Verifique a conexão — o sistema tenta de novo sozinho.`);
  else limparBanner();
  S.carregadoEm = Date.now();
  atualizarRodape();
  render();
}
function atualizarMeuPapel(){
  const meu = S.usuarios.find(u=>u.id===S.uid);
  if(meu){ S.mePapel = meu.papel||"corretor"; S.meNome = meu.nome||S.meNome; }
  S.souDono = !!(meu && meu.papel==="gestor");
}

/* ---------- tempo real ----------
   Antes: qualquer alteração de qualquer pessoa relia TODAS as tabelas de TODOS
   os usuários conectados. Com 10 pessoas trabalhando, cada clique virava dezenas
   de leituras completas. Agora a mudança que chega é aplicada direto no estado;
   só perfis e configuração (raros) provocam releitura. */
let canalTempoReal = null;
function aplicarMudanca(tabela, p){
  const tipo = p.eventType;
  if(COLECOES.includes(tabela)){
    if(tipo==="DELETE"){
      const id = p.old && p.old.id; if(!id) return false;
      const antes = S[tabela].length;
      S[tabela] = S[tabela].filter(x=>x.id!==id);
      SOMBRA.delete(tabela+":"+id);
      return S[tabela].length !== antes;
    }
    const linha = p.new; if(!linha || !linha.id) return false;
    const obj = deLinha(linha);
    const i = S[tabela].findIndex(x=>x.id===obj.id);
    if(i<0) S[tabela].push(obj); else S[tabela][i] = obj;
    guardarSombra(tabela, obj);
    return true;
  }
  if(tabela==="atividade" && tipo==="INSERT" && p.new && p.new.id){
    if(!S.atividade.some(x=>x.id===p.new.id)) S.atividade.unshift(deLinha(p.new));
    return true;
  }
  return null;   // não sabe aplicar: relê
}
function ligarTempoReal(){
  if(canalTempoReal) return;
  canalTempoReal = S.db.channel("erbe-central");
  TABELAS.concat(["config"]).forEach(t=>{
    canalTempoReal.on("postgres_changes", { event:"*", schema:"public", table:t }, p=>{
      let r = null;
      try{ r = aplicarMudanca(t, p); }catch(e){ registrarErro(e, { operacao:"tempo real "+t }); }
      if(r===null){ clearTimeout(S._recarga); S._recarga = setTimeout(carregarTudo, 400); return; }
      if(r){ invalidarIndices(); agendarRender(); }
    });
  });
  // Ao reconectar depois de uma queda, eventos podem ter se perdido: relê uma vez.
  let jaConectou = false;
  canalTempoReal.subscribe(status=>{
    if(status==="SUBSCRIBED"){ if(jaConectou) carregarTudo(); jaConectou = true; }
  });
}
/** Vários eventos em sequência viram um desenho só. */
function agendarRender(){
  clearTimeout(S._render);
  S._render = setTimeout(()=>render(), 120);
}
/* Aba que ficou muito tempo escondida (celular no bolso, notebook fechado) pode
   ter perdido eventos: ao voltar, relê. */
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="visible" && S.db && S.uid && S.carregadoEm && Date.now()-S.carregadoEm > 10*60*1000) carregarTudo();
});

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
  // Uma tela que quebra não derruba o sistema: mostra o aviso e registra o erro.
  try{
    v.innerHTML = ({
      dashboard:viewDashboard, leads:viewLeads, clientes:viewClientes, contratos:viewContratos,
      comissoes:viewComissoes, renovacoes:viewRenovacoes, tarefas:viewTarefas, equipe:viewEquipe, despesas:viewDespesas, vidas:viewVidas,
      relatorios:viewRelatorios, operadoras:viewOperadoras, atividade:viewAtividade, config:viewConfig
    }[S.view] || viewDashboard)();
    if(S.view==="leads") ligarKanban();
    if(S.view==="clientes" && S.modoClientes==="kanban") ligarBoardClientes();
  }catch(e){
    registrarErro(e, { operacao:"desenhar "+S.view });
    v.innerHTML = `<div class="panel" style="max-width:560px;margin:30px auto"><div class="empty" style="padding:34px 26px">
      <b style="font-size:15px">Esta tela não pôde ser exibida</b>
      Algum registro tem um dado que a tela não esperava. Seus dados estão salvos — o problema é só de exibição e já foi registrado.
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
        <button class="btn" data-act="ir" data-view="dashboard">Voltar ao painel</button>
        <button class="btn primary" data-act="recarregarPagina">Recarregar</button></div></div></div>`;
  }
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

