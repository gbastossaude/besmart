import { test, expect } from "./fixtures.mjs";

test("Ctrl+K encontra cliente por CNPJ sem máscara e abre a ficha", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#bgInput")).toBeFocused();
  await page.keyboard.type("11222333");
  await expect(page.locator("#bgLista")).toContainText("Alfa Engenharia");
  await page.keyboard.press("Enter");
  await expect(page.locator("#modal")).toContainText("Alfa Engenharia");
  expect(page.__erros).toEqual([]);
});

test("busca ignora acento e acha contrato pelo número da proposta", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.click('[data-act="abrirBusca"]');
  await page.fill("#bgInput", "comercio");
  await expect(page.locator("#bgLista")).toContainText("Beta Comércio");
  await page.fill("#bgInput", "prop-7781");
  await expect(page.locator("#bgLista .bg-grupo").first()).toHaveText("Contratos");
  await page.keyboard.press("Enter");
  await expect(page.locator("#modal")).toContainText("Alfa Engenharia");
});

test("busca leva a telas e ações; Esc fecha", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.keyboard.press("/");
  await page.keyboard.type("comiss");
  await page.keyboard.press("Enter");
  await expect(page.locator("#pageTitle")).toHaveText("Comissões");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("novo cliente");
  await page.keyboard.press("Enter");
  await expect(page.locator("#modal")).toContainText("Novo cliente");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  await expect(page.locator("#buscaGlobal")).toBeHidden();
});

test("corretor não encontra cliente do colega", async ({ page, abrir }) => {
  await abrir("corretorA");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("beta");
  await expect(page.locator("#bgLista")).toContainText("Nada encontrado");
});

test("busca acha vida pelo CPF", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("123.456.789");
  await expect(page.locator("#bgLista")).toContainText("João da Silva");
});
