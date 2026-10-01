import { test, expect } from "./fixtures.mjs";

test("celular: barra de atalhos, menu em gaveta e tabelas em cartões", async ({ page, abrir }) => {
  await abrir("gestor");
  await expect(page.locator("#tabbar")).toBeVisible();
  await expect(page.locator("#rail")).not.toBeInViewport();
  await page.click('#tabbar [data-view="clientes"]');
  await expect(page.locator("#pageTitle")).toHaveText("Clientes");
  await page.click('#tabbar [data-act="abrirMenu"]');
  await expect(page.locator("#rail")).toBeInViewport();
  await page.click('#nav [data-view="contratos"]');
  await expect(page.locator("#rail")).not.toBeInViewport();
  await expect(page.locator("#pageTitle")).toHaveText("Contratos");
  // a tabela vira cartão: cabeçalho escondido e rótulo em cada célula
  await expect(page.locator(".tw table.cardavel thead")).toBeHidden();
  await expect(page.locator('.tw table.cardavel td[data-rot="Operadora"]').first()).toBeVisible();
  // nada transborda para o lado
  const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(transborda).toBe(false);
  expect(page.__erros).toEqual([]);
});

test("celular: modal em tela cheia com salvar sempre visível", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.click('#tabbar [data-view="clientes"]');
  await page.click('[data-act="novoCliente"]');
  await expect(page.locator("#tabbar")).toBeHidden();
  await expect(page.locator('#modal [data-act="salvarCliente"]')).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.locator("#tabbar")).toBeVisible();
});
