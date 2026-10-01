import { test } from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const bruto = carregar(["core.js", "erros.js", "validacao.js", "dados.js", "motor.js", "datas-ans.js"]);
// valores de outro "realm" (vm) viram objetos comuns para o deepEqual
const js = expr => { const v = bruto(expr); return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v; };
js("S.config = clonar(DEFAULT_CONFIG); S.uid = 'u1'; S.mePapel = 'gestor';");

test("addMonths respeita fim de mês (30/01 + 1 = 28/02)", () => {
  assert.equal(js('addMonths("2026-01-30", 1)'), "2026-02-28");
  assert.equal(js('addMonths("2024-01-31", 1)'), "2024-02-29");
  assert.equal(js('addMonths("2026-11-15", 3)'), "2027-02-15");
});

test("régua PME 100/50/50 + 3% vitalício gera o cronograma certo", () => {
  const c = js(`gerarCronograma({ valorBase: 1000, inicio: "2026-01-10", fim: "2027-01-09", regraId: "r-saude-pme-3x", comissoes: [] })`);
  const ag = c.filter(p => p.tipo === "agenciamento");
  const vit = c.filter(p => p.tipo === "vitalicio");
  assert.deepEqual(ag.map(p => p.valor), [1000, 500, 500]);
  assert.equal(ag[0].vence, "2026-02-10");
  assert.ok(vit.length > 0 && vit.every(p => p.valor === 30));
  assert.equal(vit[0].vence, "2026-05-10");   // começa no 4º mês
});

test("regerar o cronograma preserva parcela já recebida", () => {
  const c = js(`gerarCronograma({ valorBase: 2000, inicio: "2026-01-10", regraId: "r-saude-agenc",
    comissoes: [{ tipo:"agenciamento", mesRef:1, n:1, status:"recebido", recebidoEm:"2026-02-12", valorRecebido:1000 }] })`);
  assert.equal(c[0].status, "recebido");
  assert.equal(c[0].valorRecebido, 1000);
  assert.equal(c[1].status, "previsto");
});

test("parcelas(): split do corretor, imposto e o que fica com a corretora", () => {
  js(`S.config.impostoPadrao = 10; S.config.splitSobre = "bruto";
      S.contratos = [{ id:"c1", clienteNome:"X", pilar:"saude", status:"ativo", corretor:"u2", splitPct:40,
        comissoes:[{ n:1, tipo:"agenciamento", valor:1000, vence:"2026-02-10", status:"recebido", valorRecebido:1000 }] }];
      invalidarIndices();`);
  const p = js("parcelas()[0]");
  assert.equal(p.imposto, 100);
  assert.equal(p.valorCorretor, 400);
  assert.equal(p.valorCorretora, 500);
  js(`S.config.splitSobre = "liquido"; invalidarIndices();`);
  const q = js("parcelas()[0]");
  assert.equal(q.valorCorretor, 360);          // 40% de (1000 − 10%)
  assert.equal(q.valorCorretora, 540);
  js(`S.config.impostoPadrao = 0; S.config.splitSobre = "bruto"; S.contratos = []; invalidarIndices();`);
});

test("contrato cancelado não entra nas parcelas", () => {
  js(`S.contratos = [{ id:"c2", status:"cancelado", comissoes:[{ n:1, valor:100, vence:"2026-01-01", status:"previsto" }] }]; invalidarIndices();`);
  assert.equal(js("parcelas().length"), 0);
});

test("trilha de atividade registra só o que mudou, em linguagem de gente", () => {
  const mud = js(`diferencas("contratos", { status:"proposta", valorBase:100, comissoes:[] },
                                          { status:"ativo", valorBase:100, comissoes:[{valor:50}] })`);
  assert.deepEqual(mud.map(m => m.rotulo), ["Situação", "Cronograma de comissão"]);
  assert.equal(mud[0].de, "proposta");
  assert.equal(mud[0].para, "ativo");
});

test("faixa etária da ANS (RN 63)", () => {
  assert.equal(js("faixaANS(18)"), 0);
  assert.equal(js("faixaANS(19)"), 1);
  assert.equal(js("faixaANS(59)"), 9);
  assert.equal(js("faixaANS(80)"), 9);
});

test("cliente único: documento com e sem máscara é o mesmo", () => {
  js(`S.clientes = [{ id:"k1", nome:"Alfa", doc:"11.222.333/0001-81" }, { id:"k2", nome:"Beta", doc:"12.ABC.345/01DE-35" }]; invalidarIndices();`);
  assert.equal(js(`clientePorDoc("11222333000181", null).id`), "k1");
  assert.equal(js(`clientePorDoc("12abc34501de35", null).id`), "k2");
  assert.equal(js(`clientePorDoc("11222333000181", "k1")`), null);
});
