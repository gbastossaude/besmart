// Lint do front-end. Os scripts de public/assets/js são clássicos e compartilham o
// escopo global na ordem do index.html; por isso são analisados CONCATENADOS, para
// que "no-undef" pegue referência a algo que não existe em arquivo nenhum e
// "no-redeclare" pegue o mesmo nome declarado em dois arquivos.
//
//   node scripts/lint.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import globals from "globals";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(raiz, "public/index.html"), "utf8");
const arquivos = [...html.matchAll(/<script src="(assets\/js\/[^"]+)"><\/script>/g)].map(m => m[1]);

let fonte = "";
const mapa = [];   // [linhaInicial, arquivo]
for (const a of arquivos) {
  const txt = fs.readFileSync(path.join(raiz, "public", a), "utf8");
  mapa.push([fonte.split("\n").length, a]);
  fonte += txt.replace(/^"use strict";$/m, "") + "\n";
}
fonte = '"use strict";\n' + fonte;

const regras = {
  "no-undef": "error",
  "no-redeclare": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-unreachable": "error",
  "no-self-assign": "error",
  "no-const-assign": "error",
  "no-dupe-else-if": "error",
  "no-unsafe-finally": "error",
  "no-sparse-arrays": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "no-debugger": "error",
  "no-empty-pattern": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none" }]
};
const linter = new Linter();
const configs = [
  { languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: { ...globals.browser, ERBE_CONFIG: "readonly", TRIVIUM_CONFIG: "readonly" } }, rules: regras }
];

const onde = linha => {
  let atual = mapa[0];
  for (const m of mapa) if (m[0] <= linha - 1) atual = m;
  return `${atual[1]}:${linha - atual[0]}`;
};
let erros = 0, avisos = 0;
for (const m of linter.verify(fonte, configs, { filename: "bundle.js" })) {
  const tipo = m.severity === 2 ? "erro" : "aviso";
  if (m.severity === 2) erros++; else avisos++;
  console.log(`${tipo}  public/${onde(m.line)}  ${m.message}  (${m.ruleId || "sintaxe"})`);
}

// O service worker e os scripts Node são analisados separadamente.
const extras = [
  ["public/sw.js", { ...globals.serviceworker }, "script"],
  ...fs.readdirSync(path.join(raiz, "scripts")).filter(f => f.endsWith(".mjs")).map(f => [`scripts/${f}`, { ...globals.node }, "module"]),
  ...fs.readdirSync(path.join(raiz, "tests/unit")).filter(f => f.endsWith(".mjs")).map(f => [`tests/unit/${f}`, { ...globals.node }, "module"])
];
for (const [arq, gl, tipo] of extras) {
  const p = path.join(raiz, arq);
  if (!fs.existsSync(p)) continue;
  for (const m of linter.verify(fs.readFileSync(p, "utf8"), [{ languageOptions: { ecmaVersion: 2023, sourceType: tipo, globals: gl }, rules: regras }], { filename: arq })) {
    if (m.severity === 2) erros++; else avisos++;
    console.log(`${m.severity === 2 ? "erro" : "aviso"}  ${arq}:${m.line}  ${m.message}  (${m.ruleId || "sintaxe"})`);
  }
}
console.log(`\n${arquivos.length} módulos do front-end · ${erros} erro(s) · ${avisos} aviso(s)`);
process.exit(erros ? 1 : 0);
