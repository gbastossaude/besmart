import { test, expect } from "./fixtures.mjs";

test("gestor vê o histórico do contrato com valor anterior e novo", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.evaluate(async () => { const c = S.contratos.find(x => x.id === "ctr-gama"); c.numero = "NOVO-123"; await salvar("contratos", c); });
  await page.evaluate(() => abrirContrato("ctr-gama"));
  await page.click('[data-act="historico"]');
  await expect(page.locator("#histCorpo")).toContainText("Nº da proposta");
  await expect(page.locator("#histCorpo")).toContainText("NOVO-123");
  expect(page.__erros).toEqual([]);
});

test("lixeira: contrato excluído volta com um clique", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.evaluate(() => abrirContrato("ctr-gama"));
  await page.click('#modal [data-act="excluirContrato"]');
  await page.click('#dialogo [data-resolve="ok"]');
  await expect(page.locator("#toast")).toContainText("Contrato excluído");
  await page.click('#nav [data-view="atividade"]');
  await expect(page.locator("#view")).toContainText("Excluídos recentemente");
  await page.click('[data-act="restaurarExcluido"]');
  await page.click('#dialogo [data-resolve="ok"]');
  await expect(page.locator("#toast")).toContainText("Registro restaurado");
  expect(await page.evaluate(() => S.contratos.some(c => c.id === "ctr-gama"))).toBe(true);
});

test("corretor não vê botão de histórico nem lixeira", async ({ page, abrir }) => {
  await abrir("corretorA");
  await page.evaluate(() => abrirContrato("ctr-alfa"));
  await expect(page.locator('#modal [data-act="historico"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.click('#nav [data-view="atividade"]');
  await expect(page.locator("#view")).not.toContainText("Excluídos recentemente");
});
