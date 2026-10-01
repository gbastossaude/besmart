/* Erbe · Central — arquivos.js
   Exportação: CSV, Excel (.xlsx montado à mão), ZIP e PDF (jsPDF sob demanda).
   Script clássico: compartilha o escopo global com os demais (ordem em index.html). */
"use strict";
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

