// Gera os PNG do PWA a partir dos SVG de public/assets/icons (escudo oficial).
//   node scripts/gerar-icones.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/assets/icons");
const alvo = [["icon.svg", "icon-192.png", 192], ["icon.svg", "icon-512.png", 512], ["icon-maskable.svg", "icon-maskable-512.png", 512], ["icon.svg", "apple-touch-icon.png", 180]];
const navegador = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pagina = await navegador.newPage();
for (const [svg, png, lado] of alvo) {
  await pagina.setViewportSize({ width: lado, height: lado });
  const fonte = fs.readFileSync(path.join(dir, svg), "utf8");
  await pagina.setContent(`<html><body style="margin:0;background:transparent">${fonte.replace("<svg ", `<svg width="${lado}" height="${lado}" `)}</body></html>`);
  await pagina.screenshot({ path: path.join(dir, png), omitBackground: true });
  console.log("gerado", png);
}
await navegador.close();
