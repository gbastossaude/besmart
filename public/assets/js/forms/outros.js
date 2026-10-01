/* Erbe · Central — forms/outros.js
   Tarefa, régua de comissão, membro, parcela avulsa e usuário.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
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
    if(!await salvar("tarefas", Object.assign({}, antiga, dados), "Editou a tarefa")) return;
    fecharModal(); toast("Tarefa atualizada"); return;
  }
  if(!await salvar("tarefas", Object.assign({
    id:uid("tar"), status:"aberta", criadoEm:hoje()
  }, dados, ref))) return;
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

