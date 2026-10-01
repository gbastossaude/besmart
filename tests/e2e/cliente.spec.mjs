import { test, expect } from "./fixtures.mjs";

test("cadastro de cliente: máscara, CPF inválido e e-mail inválido explicados no campo", async ({ page, abrir }) => {
  await abrir("corretorA");
  await page.click('#nav [data-view="clientes"]');
  await page.click('[data-act="novoCliente"]');
  await page.fill("#xNome", "Fulano de Tal");
  await page.locator("#xDoc").pressSequentially("52998224724");
  await expect(page.locator("#xDoc")).toHaveValue("529.982.247-24");
  await page.click('[data-act="salvarCliente"]');
  await expect(page.locator("#xDoc-erro")).toContainText("inválido");
  await expect(page.locator("#xDoc")).toHaveAttribute("aria-invalid", "true");
  await page.fill("#xDoc", "529.982.247-25");
  await page.fill("#xEmail", "fulano@");
  await page.click('[data-act="salvarCliente"]');
  await expect(page.locator("#xEmail-erro")).toBeVisible();
  await page.fill("#xEmail", "fulano@exemplo.com");
  await page.locator("#xTel").pressSequentially("11987654321");
  await expect(page.locator("#xTel")).toHaveValue("(11) 98765-4321");
  await page.click('[data-act="salvarCliente"]');
  await expect(page.locator("#toast")).toContainText("Cliente cadastrado");
  const salvo = await page.evaluate(() => window.__fake.db.tables.clientes.find(c => c.dados.nome === "Fulano de Tal"));
  expect(salvo.dados.doc).toBe("529.982.247-25");
  expect(page.__erros).toEqual([]);
});

test("CNPJ já cadastrado na carteira de outro corretor é barrado sem expor o cliente", async ({ page, abrir }) => {
  await abrir("corretorA");
  await page.click('#nav [data-view="clientes"]');
  await page.click('[data-act="novoCliente"]');
  await page.fill("#xNome", "Tentativa Duplicada");
  await page.locator("#xDoc").pressSequentially("22333444000181");
  await expect(page.locator("#avisoDoc")).toContainText("carteira de Beto Corretor");
  await page.click('[data-act="salvarCliente"]');
  await expect(page.locator("#dialogo")).toContainText("já é cliente na carteira de Beto Corretor");
  await expect(page.locator("#dialogo")).not.toContainText("Beta Comércio");
  await page.click('#dialogo [data-resolve="ok"]');
  const n = await page.evaluate(() => window.__fake.db.tables.clientes.filter(c => c.dados.nome === "Tentativa Duplicada").length);
  expect(n).toBe(0);
});

test("clique duplo em salvar não cria dois registros", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.click('#nav [data-view="clientes"]');
  await page.click('[data-act="novoCliente"]');
  await page.fill("#xNome", "Duplo Clique Ltda");
  await page.locator('[data-act="salvarCliente"]').dblclick();
  await expect(page.locator("#toast")).toContainText("Cliente cadastrado");
  const n = await page.evaluate(() => window.__fake.db.tables.clientes.filter(c => c.dados.nome === "Duplo Clique Ltda").length);
  expect(n).toBe(1);
});
