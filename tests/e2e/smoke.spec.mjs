import { test, expect } from "./fixtures.mjs";

test("tela de entrada aparece sem sessão e o login funciona", async ({ page, abrir }) => {
  await abrir(null);
  await expect(page.locator("#login")).toBeVisible();
  await page.fill("#lgEmail", "gbastossaude@gmail.com");
  await page.fill("#lgSenha", "senha123");
  await page.click('[data-act="entrar"]');
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#pageTitle")).toHaveText("Painel");
  expect(page.__erros).toEqual([]);
});

test("login com senha errada mostra mensagem amigável", async ({ page, abrir }) => {
  await abrir(null);
  await page.fill("#lgEmail", "gbastossaude@gmail.com");
  await page.fill("#lgSenha", "errada");
  await page.click('[data-act="entrar"]');
  await expect(page.locator(".login-aviso.erro")).toHaveText("E-mail ou senha incorretos.");
});

test("gestor percorre todas as telas sem erro", async ({ page, abrir }) => {
  await abrir("gestor");
  const telas = ["dashboard", "leads", "tarefas", "clientes", "contratos", "vidas", "renovacoes", "comissoes", "despesas", "equipe", "operadoras", "relatorios", "atividade", "config"];
  for (const t of telas) {
    await page.click(`#nav [data-view="${t}"]`);
    await expect(page.locator(`#nav [data-view="${t}"]`)).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#view")).not.toBeEmpty();
  }
  expect(page.__erros).toEqual([]);
});

test("usuário pendente vê a tela de espera", async ({ page, abrir }) => {
  await abrir("pendente");
  await expect(page.locator("#pageTitle")).toHaveText("Aguardando liberação");
});

test("painel filtra por período e corretor", async ({ page, abrir }) => {
  await abrir("gestor");
  await expect(page.locator(".stat.hero .k")).toContainText("este mês");
  await page.selectOption("#pnPer", "t12");
  await expect(page.locator(".stat.hero .k")).toContainText("últimos 12 meses");
  await expect(page.locator(".stat.hero .d")).toContainText("3 contratos");
  await page.selectOption("#pnCor", { label: "Ana Corretora" });
  await expect(page.locator(".stat.hero .d")).toContainText("1 contrato ");
  await page.click('[data-act="limparPainel"]');
  await expect(page.locator(".stat.hero .k")).toContainText("este mês");
  expect(page.__erros).toEqual([]);
});
