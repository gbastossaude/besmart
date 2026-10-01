import { test, expect } from "./fixtures.mjs";

test.use({ serviceWorkers: "allow" });

test("service worker instala e guarda o código do sistema (não os dados)", async ({ page, abrir }) => {
  await abrir("gestor");
  const r = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 50 && !(await caches.keys()).length; i++) await new Promise(ok => setTimeout(ok, 100));
    const nomes = await caches.keys();
    const urls = (await (await caches.open(nomes[0])).keys()).map(x => new URL(x.url).pathname);
    return { ativo: !!reg.active, nomes, urls };
  });
  expect(r.ativo).toBe(true);
  expect(r.nomes[0]).toMatch(/^erbe-v/);
  expect(r.urls).toContain("/assets/js/core.js");
  expect(r.urls).toContain("/vendor/supabase.js");
  expect(r.urls.some(u => /supabase\.co/.test(u))).toBe(false);
});
