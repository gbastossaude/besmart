import { test, expect, IDS } from "./fixtures.mjs";

test("carteira com mais de 1.000 clientes carrega inteira (teto do PostgREST)", async ({ page, abrir }) => {
  await abrir("gestor", { clientesExtras: 1500 });
  await page.click('#nav [data-view="clientes"]');
  await page.click('[data-act="modoClientes"][data-v="lista"]');
  await expect(page.locator("#view")).toContainText("1.503 clientes");
});

test("mudança feita por outra pessoa chega sem recarregar tudo", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.click('#nav [data-view="clientes"]');
  await page.click('[data-act="modoClientes"][data-v="lista"]');
  await expect(page.locator("#view")).toContainText("3 clientes");
  const antes = await page.evaluate(() => window.__fake.selects());
  await page.evaluate(id => window.__fake.externo("clientes", "INSERT",
    { id: "cli-novo", dono: id, dados: { id: "cli-novo", nome: "Zeta Novo Cliente", tipo: "PJ", responsavel: id } }), IDS.gestor);
  await expect(page.locator("#view")).toContainText("Zeta Novo Cliente");
  await expect(page.locator("#view")).toContainText("4 clientes");
  await page.evaluate(() => window.__fake.externo("clientes", "DELETE", { id: "cli-novo" }));
  await expect(page.locator("#view")).toContainText("3 clientes");
  const depois = await page.evaluate(() => window.__fake.selects());
  expect(depois - antes).toBe(0);   // aplicou a mudança sem reler as tabelas
});

test("falha ao salvar desfaz a alteração na tela e explica o motivo", async ({ page, abrir }) => {
  await abrir("corretorA");
  await page.evaluate(() => { window.__fake.db.falhas["leads:upsert"] = "Somente o gestor faz isso."; });
  await page.click('#nav [data-view="leads"]');
  const card = page.locator('[data-lead="lead-1"]');
  await expect(card).toBeVisible();
  await page.evaluate(() => moverLead("lead-1", "negociacao"));
  await expect(page.locator("#banner")).toBeVisible();
  await expect(page.locator('.col[data-etapa="proposta"] [data-lead="lead-1"]')).toBeVisible();
});

test("edição simultânea: a gravação em cima de versão antiga é recusada e a tela mostra a versão atual", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.evaluate(() => abrirModal(formCliente(S.clientes.find(c => c.id === "cli-gama"))));
  // enquanto o formulário está aberto, outra pessoa grava o mesmo cliente
  await page.evaluate(() => {
    const t = window.__fake.db.tables.clientes; const r = t.find(x => x.id === "cli-gama");
    r.versao = (r.versao || 1) + 1; r.dados = Object.assign({}, r.dados, { cidade: "Campinas" });
  });
  await page.fill("#xNome", "Gama Serviços Renomeada");
  await page.click('[data-act="salvarCliente"]');
  await expect(page.locator("#banner")).toContainText("Outra pessoa alterou");
  await expect(page.locator("#modal")).toBeVisible();          // o que foi digitado não se perde
  expect(await page.evaluate(() => S.clientes.find(c => c.id === "cli-gama").cidade)).toBe("Campinas");
  await page.click('[data-act="salvarCliente"]');               // salvar de novo, agora consciente
  await expect(page.locator("#toast")).toContainText("Cliente atualizado");
  const final = await page.evaluate(() => window.__fake.db.tables.clientes.find(c => c.id === "cli-gama"));
  expect(final.dados.nome).toBe("Gama Serviços Renomeada");
  expect(final.versao).toBe(3);
});
