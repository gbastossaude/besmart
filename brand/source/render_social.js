// Exporta cada .frame de um HTML gerado para PNG.
//   node brand/source/render_social.js                → social.html  → brand/social/<id>.png
//   node brand/source/render_social.js content.html   → content.html → brand/social/conteudos/<serie>/<nn>.png
// Ids com "--" viram pasta/arquivo: "carencia--02" → conteudos/carencia/02.png  (requer playwright)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const file = process.argv[2] || 'social.html';
  const out = path.join(__dirname, '..', 'social', file === 'social.html' ? '' : 'conteudos');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, file));
  await page.evaluate(() => document.fonts.ready);
  const ids = await page.$$eval('.frame', (els) => els.map((e) => e.id));
  for (const id of ids) {
    const target = path.join(out, ...id.split('--')) + '.png';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await page.locator('#' + id).screenshot({ path: target });
  }
  await browser.close();
  console.log(`${ids.length} peças exportadas em ${path.relative(path.join(__dirname, '..', '..'), out) || 'brand/social'}/`);
})();
