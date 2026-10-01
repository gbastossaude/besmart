import { test } from "./fixtures.mjs";
const DIR = process.env.SHOTS_DIR;
test.skip(!DIR, "só quando SHOTS_DIR está definido");
for (const [nome, vp] of [["desk", { width: 1440, height: 900 }], ["mob", { width: 390, height: 844 }]]) {
  test(`telas ${nome}`, async ({ page, abrir }) => {
    await page.setViewportSize(vp);
    await abrir("gestor");
    for (const t of ["dashboard", "leads", "clientes", "contratos", "comissoes"]) {
      await page.evaluate(v => ir(v), t);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${DIR}/${nome}-${t}.png`, fullPage: false });
    }
    await page.evaluate(() => abrirCliente("cli-alfa"));
    await page.screenshot({ path: `${DIR}/${nome}-ficha.png` });
  });
}
