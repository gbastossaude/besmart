/* Erbe · Central — views/despesas.js
   Despesas e balanço do mês.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
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
  if(!await salvar("despesas", d)) return;
  S.mesDespesas = d.data.slice(0,7);
  fecharModal(); toast(id?"Gasto atualizado":"Gasto lançado");
}

