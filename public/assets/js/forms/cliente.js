/* Erbe · Central — forms/cliente.js
   Cliente: formulário, ficha e comissões do cliente.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
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
      <div class="field"><label for="xDoc">CNPJ / CPF</label><input id="xDoc" type="text" value="${esc(c.doc||"")}" autocapitalize="characters" autocomplete="off" data-mascara="doc" data-act="conferirDoc" data-id="${esc(c.id||"")}">
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
      <div class="field"><label for="xContatoZap">WhatsApp do contato</label><input id="xContatoZap" type="tel" data-mascara="telefone" value="${esc(c.contatoWhatsapp||"")}" placeholder="com DDD"></div>
    </div>
    <div class="frow">
      <div class="field"><label for="xTel">Telefone</label><input id="xTel" type="tel" data-mascara="telefone" value="${esc(c.telefone||"")}"></div>
      <div class="field"><label for="xZap">WhatsApp</label><input id="xZap" type="tel" data-mascara="telefone" value="${esc(c.whatsapp||"")}" placeholder="com DDD"></div>
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
  limparErrosCampo();
  const nome = val("xNome"); if(!nome){ erroCampo("xNome", "Informe o nome do cliente."); return; }
  const doc = val("xDoc");
  if(tipoDocValido(doc)===null){ erroCampo("xDoc", "CPF ou CNPJ inválido — confira os números (CNPJ pode ter letras)."); return; }
  if(!emailValido(val("xEmail"))){ erroCampo("xEmail", "E-mail com formato inválido."); return; }
  for(const f of ["xTel","xZap","xContatoZap"]) if(!telefoneValido(val(f))){ erroCampo(f, "Telefone precisa de DDD + número (10 ou 11 dígitos)."); return; }
  // a regra do cliente único: o mesmo CPF ou CNPJ não entra duas vezes — nem em carteiras diferentes
  const repetido = await documentoEmUso(doc, id||null);
  if(repetido && !repetido.visivel){
    await confirmar("Esse documento já está cadastrado",
      `O documento ${mascararDoc(doc)} já é cliente na carteira de ${repetido.responsavel}. Para não duplicar o cadastro, peça ao gestor para incluir o novo produto no cliente existente ou transferir a carteira.`,
      "Entendi");
    return;
  }
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
  if(!await salvar("clientes", c)) return;
  fecharModal(); toast(id?"Cliente atualizado":"Cliente cadastrado");
}
/** Aviso em tempo real enquanto a pessoa digita o documento. */
let tConferirDoc = null;
function conferirDoc(idAtual){
  const campo = document.getElementById("xDoc");
  const aviso = document.getElementById("avisoDoc");
  if(!campo || !aviso) return;
  const doc = campo.value;
  const local = clientePorDoc(doc, idAtual||null);
  const mostrar = (txt, ruim) => { aviso.textContent = txt; aviso.style.color = ruim ? "var(--crit)" : ""; };
  if(local){ mostrar(`Já existe: ${local.nome}`, true); return; }
  const n = normDoc(doc).length;
  if((n===11 || n===14) && tipoDocValido(doc)===null){ mostrar("Documento inválido — confira os números.", true); return; }
  mostrar("", false);
  // não achou na carteira visível: pergunta ao banco (pode estar na carteira de um colega)
  clearTimeout(tConferirDoc);
  if(n===11 || n===14) tConferirDoc = setTimeout(async ()=>{
    const r = await documentoEmUso(doc, idAtual||null);
    if(r && document.getElementById("xDoc") && normDoc(document.getElementById("xDoc").value)===normDoc(doc))
      mostrar(r.visivel ? `Já existe: ${r.nome}` : `Já é cliente na carteira de ${r.responsavel}`, true);
  }, 350);
}
/** O documento já é de algum cliente? Procura na carteira carregada e, se não achar,
    no banco inteiro (a RLS esconde o cliente do colega; a função cliente_por_documento
    responde só se existe e de quem é). */
async function documentoEmUso(doc, exceto){
  if(!normDoc(doc)) return null;
  const local = clientePorDoc(doc, exceto);
  if(local) return { id:local.id, nome:local.nome, visivel:true, responsavel:nomeUsuario(local.responsavel) };
  if(!S.db) return null;
  try{
    const { data, error } = await S.db.rpc("cliente_por_documento", { doc, exceto });
    if(error || !data || !data.length) return null;     // função ausente (migration não aplicada): segue só com a checagem local
    return data[0];
  }catch(e){ return null; }
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
