/* Erbe · Central — datas-ans.js
   Faixas etárias da ANS, reajustes e datas que viram contato.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
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
