import { test, expect } from "./fixtures.mjs";

const pdf = nome => ({ name: nome, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });

test("corretor anexa, abre e exclui documento do próprio cliente", async ({ page, abrir, context }) => {
  await abrir("corretorA");
  await page.evaluate(() => abrirCliente("cli-alfa"));
  await expect(page.locator("#docsLista")).toContainText("Nenhum documento");
  await page.selectOption("#docCategoria", "Proposta");
  await page.setInputFiles("#docArquivo", [pdf("Proposta Alfa.pdf"), pdf("RG sócio.pdf")]);
  await expect(page.locator("#docsLista")).toContainText("Proposta Alfa.pdf");
  await expect(page.locator("#docsLista")).toContainText("RG sócio.pdf");
  const caminhos = await page.evaluate(() => [...window.__fake.db.arquivos.keys()]);
  expect(caminhos.every(c => c.startsWith("clientes/cli-alfa/"))).toBe(true);
  expect(caminhos.some(c => /rg-socio\.pdf$/.test(c))).toBe(true);   // nome seguro, sem acento nem espaço
  const [aba] = await Promise.all([context.waitForEvent("page"), page.locator('[data-act="verDocumento"]').first().click()]);
  await aba.waitForLoadState();
  expect(aba.url()).toContain("arquivo=clientes%2Fcli-alfa%2F");
  await aba.close();
  await page.locator('[data-act="excluirDocumento"]').first().click();
  await page.click('#dialogo [data-resolve="ok"]');
  await expect(page.locator("#toast")).toContainText("Documento excluído");
  expect(await page.evaluate(() => window.__fake.db.arquivos.size)).toBe(1);
  expect(page.__erros).toEqual([]);
});

test("arquivo fora do padrão é recusado antes de subir", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.evaluate(() => abrirCliente("cli-gama"));
  await page.setInputFiles("#docArquivo", [{ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") }]);
  await expect(page.locator("#toast")).toContainText("fora do padrão");
  expect(await page.evaluate(() => window.__fake.db.arquivos.size)).toBe(0);
});
