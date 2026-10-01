// Exporta cada .frame de social.html para brand/social/<id>.png
// Uso: node brand/source/render_social.js   (requer playwright)
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const out = path.join(__dirname, '..', 'social');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'social.html'));
  await page.evaluate(() => document.fonts.ready);
  const ids = await page.$$eval('.frame', (els) => els.map((e) => e.id));
  for (const id of ids) {
    await page.locator('#' + id).screenshot({ path: path.join(out, id + '.png') });
  }
  await browser.close();
  console.log(`${ids.length} peças exportadas em brand/social/`);
})();
