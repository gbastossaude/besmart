/* Erbe · Central — views/documentos.js
   Documentos do cliente (RG, CNH, comprovantes, propostas, apólices, boletos).
   Arquivos no bucket PRIVADO "documentos" do Supabase Storage (migration 0005),
   em clientes/<id do cliente>/<arquivo>. Quem enxerga o cliente enxerga os
   documentos — regra aplicada no banco e no Storage, não só aqui. Cada arquivo
   abre por um link temporário de 60 segundos.
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";

const CATEGORIAS_DOC = ["Documento pessoal (RG/CNH)", "CPF/CNPJ", "Comprovante de endereço", "Proposta",
  "Contrato / apólice", "Boleto", "Carteirinha", "Declaração de saúde", "Outro"];
const DOC_TAMANHO_MAX = 20 * 1024 * 1024;
const DOC_TIPOS = /^(application\/pdf|image\/(jpeg|png|webp|heic)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel)|text\/plain)$/;
const DOCS = new Map();   // clienteId -> lista carregada

const tamanhoLegivel = b => b >= 1048576 ? (b/1048576).toLocaleString("pt-BR",{maximumFractionDigits:1})+" MB"
  : Math.max(1, Math.round(b/1024)).toLocaleString("pt-BR")+" KB";
/** Nome de arquivo seguro para o caminho no Storage (sem acento, espaço ou barra). */
const nomeSeguro = n => semAcento(n).replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(-80) || "arquivo";

function painelDocumentos(c){
  const contratos = contratosDoCliente(c.id).filter(x=>noEscopo(x,"corretor"));
  return `<section class="panel docs" style="box-shadow:none" aria-labelledby="docsTit">
    <div class="panel-head"><div><h3 id="docsTit">Documentos</h3>
      <div class="sub">Guardados com acesso restrito — só quem atende este cliente abre</div></div></div>
    <div class="chart-wrap">
      <div class="docs-envio">
        <div class="field"><label for="docCategoria">Tipo de documento</label>
          <select id="docCategoria">${CATEGORIAS_DOC.map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
        ${contratos.length?`<div class="field"><label for="docContrato">Contrato (opcional)</label>
          <select id="docContrato"><option value="">— do cliente —</option>${contratos.map(k=>`<option value="${esc(k.id)}">${esc((PILARES[k.pilar]||{}).curto||"")} · ${esc(k.operadora||"")}${k.numero?" · nº "+esc(k.numero):""}</option>`).join("")}</select></div>`:""}
        <div class="field"><label for="docArquivo">Arquivos</label>
          <input id="docArquivo" type="file" multiple data-cliente="${esc(c.id)}"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.txt,application/pdf,image/*">
          <span class="hint">PDF, imagem, Word ou Excel · até 20 MB cada</span></div>
      </div>
      <div id="docsLista" data-cliente="${esc(c.id)}" aria-live="polite"><div class="carregando-cx"><span class="spinner" aria-hidden="true"></span> Carregando documentos…</div></div>
    </div></section>`;
}

async function carregarDocumentos(clienteId){
  const alvo = () => document.querySelector(`#docsLista[data-cliente="${CSS.escape(clienteId)}"]`);
  try{
    const { data, error } = await S.db.from("documentos").select("*").eq("cliente_id", clienteId).order("enviado_em", { ascending:false });
    if(error) throw error;
    DOCS.set(clienteId, data||[]);
    if(alvo()) alvo().innerHTML = listaDocumentos(clienteId);
  }catch(e){
    const semTabela = /documentos/.test(String(e && e.message)) && /exist|encontr/i.test(String(e && e.message));
    if(alvo()) alvo().innerHTML = `<div class="hint">${semTabela ? "Aplique a migration 0005 no Supabase para ativar os documentos." : "Não foi possível carregar os documentos agora."}</div>`;
    if(!semTabela) registrarErro(e, { operacao:"carregar documentos" });
  }
}
function listaDocumentos(clienteId){
  const docs = DOCS.get(clienteId) || [];
  if(!docs.length) return `<div class="hint" style="padding:6px 0">Nenhum documento ainda.</div>`;
  return `<div class="tw"><table><thead><tr><th>Documento</th><th>Tipo</th><th>Enviado</th><th></th></tr></thead><tbody>
    ${docs.map(d=>{
      const k = d.contrato_id ? contratoPorId(d.contrato_id) : null;
      const podeExcluir = S.mePapel==="gestor" || d.enviado_por===S.uid;
      return `<tr>
        <td><b>${esc(d.nome)}</b><div class="hint">${d.tamanho?esc(tamanhoLegivel(d.tamanho)):""}${k?` · ${esc(k.operadora||"")}${k.numero?" nº "+esc(k.numero):""}`:""}</div></td>
        <td><span class="chip mute">${esc(d.categoria||"Outro")}</span></td>
        <td class="num">${esc(dt(String(d.enviado_em).slice(0,10)))}<div class="hint">${esc(nomeUsuario(d.enviado_por))}</div></td>
        <td class="r" style="white-space:nowrap">
          <button class="btn sm" data-act="verDocumento" data-id="${esc(d.id)}" data-cliente="${esc(clienteId)}">Abrir</button>
          ${podeExcluir?`<button class="btn sm ghost danger" data-act="excluirDocumento" data-id="${esc(d.id)}" data-cliente="${esc(clienteId)}" aria-label="Excluir ${esc(d.nome)}">×</button>`:""}
        </td></tr>`; }).join("")}
  </tbody></table></div>`;
}

async function enviarDocumentos(input){
  const clienteId = input.dataset.cliente;
  const arquivos = [...(input.files||[])];
  if(!arquivos.length) return;
  const categoria = val("docCategoria") || "Outro";
  const contratoId = val("docContrato") || null;
  const recusados = arquivos.filter(f=>f.size > DOC_TAMANHO_MAX || (f.type && !DOC_TIPOS.test(f.type)));
  if(recusados.length) toast(`${recusados.length} arquivo(s) fora do padrão (tipo ou mais de 20 MB) ficaram de fora.`);
  const validos = arquivos.filter(f=>!recusados.includes(f));
  input.disabled = true;
  let ok = 0;
  try{
    for(const f of validos){
      const caminho = `clientes/${clienteId}/${crypto.randomUUID()}-${nomeSeguro(f.name)}`;
      const up = await S.db.storage.from("documentos").upload(caminho, f, { contentType:f.type || "application/octet-stream", upsert:false });
      if(up.error){ falhaEscrita(up.error, "documentos"); continue; }
      const { error } = await S.db.from("documentos").insert({ cliente_id:clienteId, contrato_id:contratoId, nome:f.name.slice(0,200),
        categoria, caminho, tipo_mime:f.type || null, tamanho:f.size });
      if(error){
        // metadado recusado: não deixa arquivo solto no Storage
        await S.db.storage.from("documentos").remove([caminho]);
        falhaEscrita(error, "documentos"); continue;
      }
      ok++;
    }
  }finally{ input.disabled = false; input.value = ""; }
  if(ok){
    toast(`${ok} documento(s) anexado(s)`);
    const cli = clientePorId(clienteId);
    registrarAtividade("clientes", cli || { id:clienteId, nome:"" }, `Anexou ${ok} documento(s) (${categoria}) a`, false);
  }
  await carregarDocumentos(clienteId);
}

async function verDocumento(id, clienteId){
  const d = (DOCS.get(clienteId)||[]).find(x=>x.id===id); if(!d) return;
  // abre a aba já no clique (bloqueador de pop-up) e só então pede o link temporário
  const aba = window.open("", "_blank");
  const { data, error } = await S.db.storage.from("documentos").createSignedUrl(d.caminho, 60);
  if(error || !data){ if(aba) aba.close(); falhaEscrita(error || {}, "documentos"); return; }
  if(aba){ aba.opener = null; aba.location = data.signedUrl; } else location.assign(data.signedUrl);
}

async function excluirDocumento(id, clienteId){
  const d = (DOCS.get(clienteId)||[]).find(x=>x.id===id); if(!d) return;
  if(!await confirmar("Excluir documento", `${d.nome} sai do cadastro do cliente e o arquivo é apagado. Não dá para desfazer.`, "Excluir documento", true)) return;
  const { data, error } = await S.db.from("documentos").delete().eq("id", id).select("id");
  if(error || !data || !data.length){ falhaEscrita(error || { code:"42501", message:"Seu acesso não permite excluir este documento." }, "documentos"); return; }
  const rm = await S.db.storage.from("documentos").remove([d.caminho]);
  if(rm.error) registrarErro(rm.error, { operacao:"apagar arquivo do Storage" });
  toast("Documento excluído");
  await carregarDocumentos(clienteId);
}
