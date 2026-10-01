import { test, expect } from "./fixtures.mjs";
import fs from "node:fs";
import { createRequire } from "node:module";

const AXE = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function auditar(page) {
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, resultTypes: ["violations"] });
    return r.violations.filter(v => ["serious", "critical"].includes(v.impact))
      .map(v => `${v.id} (${v.impact}): ${v.nodes.length}× ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`);
  });
}

for (const tela of ["dashboard", "leads", "clientes", "contratos", "comissoes", "tarefas", "config"]) {
  test(`acessibilidade WCAG A/AA sem violação grave: ${tela}`, async ({ page, abrir }) => {
    await abrir("gestor");
    await page.evaluate(v => ir(v), tela);
    expect(await auditar(page)).toEqual([]);
  });
}

test("acessibilidade: tela de entrada e ficha do cliente", async ({ page, abrir }) => {
  await abrir(null);
  expect(await auditar(page)).toEqual([]);
  await page.fill("#lgEmail", "gbastossaude@gmail.com");
  await page.fill("#lgSenha", "senha123");
  await page.click('[data-act="entrar"]');
  await expect(page.locator("#app")).toBeVisible();
  await page.evaluate(() => abrirCliente("cli-alfa"));
  expect(await auditar(page)).toEqual([]);
});

test("acessibilidade no tema escuro", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  for (const v of ["dashboard", "clientes", "comissoes", "contratos"]) {
    await page.evaluate(x => ir(x), v);
    expect(await auditar(page), v).toEqual([]);
  }
});
