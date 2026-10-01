import { test, expect } from "./fixtures.mjs";

test("CSP estrita: nenhuma violação ao percorrer o sistema e gerar PDF", async ({ page, abrir }) => {
  const violacoes = [];
  page.on("console", m => { if (/Content Security Policy|Refused to/i.test(m.text())) violacoes.push(m.text()); });
  await abrir("gestor");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("script-src 'self'");
  for (const t of ["dashboard", "clientes", "contratos", "comissoes", "relatorios", "config"]) await page.click(`#nav [data-view="${t}"]`);
  // o PDF carrega jsPDF da pasta vendor/ (SRI) — precisa funcionar sob a CSP
  const ok = await page.evaluate(async () => { await carregarJsPDF(); return !!(window.jspdf && window.jspdf.jsPDF.API.autoTable); });
  expect(ok).toBe(true);
  expect(violacoes).toEqual([]);
  expect(page.__erros).toEqual([]);
});

test("cabeçalhos de segurança do netlify.toml são servidos", async ({ request }) => {
  const r = await request.get("/");
  const h = r.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect((await request.get("/config.js")).headers()["cache-control"]).toBe("no-store");
  expect((await request.get("/robots.txt")).status()).toBe(200);
});

test("logo SVG com script não executa nada", async ({ page, abrir }) => {
  await abrir("gestor");
  await page.evaluate(() => { window.__xss = 0; S.config.logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="window.__xss=1"><script>window.__xss=2</script></svg>'; pintarMarca(); });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__xss)).toBe(0);
  await expect(page.locator("#marcaSimbolo img")).toHaveCount(1);
});

test("manifesto do PWA e ícones existem", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  for (const i of m.icons) expect((await request.get("/" + i.src)).status()).toBe(200);
  expect((await request.get("/sw.js")).status()).toBe(200);
});
