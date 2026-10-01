/* Erbe · Central — acoes.js
   Despachante de ações (cliques, mudanças, digitação) e boot().
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
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
  // Ações que gravam ficam travadas até terminar: clique duplo não cria registro duplicado.
  const grava = /^(salvar|confirmar|gerar|conciliar|importar|liberar|recusar)/.test(a);
  if(grava){ if(el.dataset.ocupado) return; el.dataset.ocupado = "1"; el.setAttribute("aria-busy","true"); }
  try{ await executarAcao(a, id, el, e); }
  catch(err){ registrarErro(err, { operacao:"ação "+a }); toast("Não foi possível concluir. Tente de novo."); }
  finally{ if(grava){ delete el.dataset.ocupado; el.removeAttribute("aria-busy"); } }
});
async function executarAcao(a, id, el, e){
  switch(a){
    case "recarregarPagina": location.reload(); break;
    case "abrirBusca": abrirBusca(); break;
    case "abrirMenu": abrirMenu(); break;
    case "limparPainel": S.painel = null; render(); break;
    case "historico": await abrirHistorico(el.dataset.tabela, id, el.dataset.titulo); break;
    case "restaurarExcluido": await restaurarExcluido(id); break;
    case "transferirCarteira": await transferirCarteira(id); break;
    case "verDocumento": await verDocumento(id, el.dataset.cliente); break;
    case "excluirDocumento": await excluirDocumento(id, el.dataset.cliente); break;
    case "rodarAutomacoes": {
      const { data, error } = await S.db.rpc("gerar_tarefas_automaticas");
      if(error){ if(/does not exist|não existe/i.test(error.message)) toast("Aplique a migration 0004 no Supabase para ativar as automações."); else falhaEscrita(error); break; }
      const n = (Number(data && data.propostas_paradas)||0) + (Number(data && data.renovacoes)||0);
      toast(n ? `${n} tarefa(s) automática(s) criada(s)` : "Nada novo: as automações já estavam em dia");
      if(n) await carregarTudo();
      break;
    }
    case "fecharMenu": fecharMenu(); break;
    case "instalarApp": await instalarApp(); break;
    case "fechar": fecharModal(); break;
    case "fecharBanner": limparBanner(); break;
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
      // em lotes de 500 (antes: uma requisição por registro — milhares para um backup grande)
      let n = 0, falhas = 0;
      for(const col of ["clientes","contratos","vidas","leads","tarefas","despesas"]){
        const itens = (dados[col]||[]).filter(it=>it && it.id).map(it=>({ id:it.id, dono:donoDe(col,it), dados:it }));
        for(let i=0; i<itens.length; i+=500){
          const lote = itens.slice(i, i+500);
          const { error } = await S.db.from(col).upsert(lote, { onConflict:"id" });
          if(error){ falhas += lote.length; registrarErro(error, { operacao:"importar "+col }); } else n += lote.length;
        }
      }
      if(falhas) banner(`${falhas} registro(s) do backup não puderam ser importados. Os demais entraram normalmente.`);
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
}
function aplicarCaminho(path, fn){
  const [a,b] = path.split(".");
  if(b) S.config[a][b] = fn(S.config[a][b]||[]);
  else S.config[a] = fn(S.config[a]||[]);
}
document.addEventListener("change", e=>{
  if(e.target.id==="docArquivo"){ enviarDocumentos(e.target); return; }
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
  if(el.dataset.act==="filtroPainel"){
    const F = periodoPainel();
    if(el.dataset.k==="periodo" && el.value==="custom"){ S.painel.de = F.de; S.painel.ate = F.ate; }
    S.painel[el.dataset.k] = el.value;
    render();
  }
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
