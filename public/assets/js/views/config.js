/* Erbe · Central — views/config.js
   Configurações.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
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
          <button class="btn" data-act="rodarAutomacoes" title="Cria agora os follow-ups de propostas paradas e de renovações próximas">Rodar automações agora</button>
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

