// Servidor local que imita o Netlify: serve public/, aplica os [[headers]] e o
// redirect de SPA do netlify.toml. Usado no desenvolvimento e nos testes E2E,
// para que a Content-Security-Policy seja testada exatamente como em produção.
//
//   node scripts/serve.mjs [porta]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(raiz, "public");
const porta = Number(process.argv[2] || process.env.PORT || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".xml": "application/xml"
};

/** Lê os blocos [[headers]] do netlify.toml (formato simples usado no projeto). */
export function lerHeaders(toml) {
  const blocos = [];
  let atual = null, emValores = false;
  for (const bruta of toml.split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l || l.startsWith("#")) continue;
    if (l === "[[headers]]") { atual = { for: "", values: {} }; blocos.push(atual); emValores = false; continue; }
    if (l.startsWith("[[") || (l.startsWith("[") && l !== "[headers.values]")) { atual = null; emValores = false; continue; }
    if (!atual) continue;
    if (l === "[headers.values]") { emValores = true; continue; }
    const m = /^([\w-]+)\s*=\s*"(.*)"$/.exec(l);
    if (!m) continue;
    if (emValores) atual.values[m[1]] = m[2].replace(/\\"/g, '"');
    else if (m[1] === "for") atual.for = m[2];
  }
  return blocos;
}
const casa = (padrao, url) => {
  const re = new RegExp("^" + padrao.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  return re.test(url);
};

const headers = lerHeaders(fs.readFileSync(path.join(raiz, "netlify.toml"), "utf8"));

const servidor = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let arq = path.join(pub, url);
  if (!arq.startsWith(pub)) { res.writeHead(403).end(); return; }
  let rota = url;
  if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) { arq = path.join(arq, "index.html"); rota = url.replace(/\/?$/, "/index.html"); }
  if (!fs.existsSync(arq)) { arq = path.join(pub, "index.html"); rota = "/index.html"; }   // SPA
  const h = { "Content-Type": MIME[path.extname(arq)] || "application/octet-stream" };
  for (const b of headers) if (casa(b.for, rota) || casa(b.for, url)) Object.assign(h, b.values);
  res.writeHead(200, h);
  fs.createReadStream(arq).pipe(res);
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  servidor.listen(porta, () => console.log(`Erbe · Central em http://localhost:${porta}`));
}
export default servidor;
