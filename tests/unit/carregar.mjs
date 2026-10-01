// Carrega scripts clássicos de public/assets/js num contexto isolado do Node,
// com um DOM mínimo, para testar as funções puras sem navegador.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const elemento = () => ({ addEventListener() {}, removeEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {}, removeAttribute() {}, querySelector: () => null, querySelectorAll: () => [], style: {}, dataset: {}, innerHTML: "", textContent: "", hidden: false });

export function carregar(arquivos) {
  const ctx = {
    console, structuredClone, setTimeout, clearTimeout, setInterval: () => 0, URL, Blob: globalThis.Blob, TextEncoder,
    navigator: { onLine: true, userAgent: "node" },
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }),
    location: { origin: "http://localhost", reload() {} }
  };
  ctx.window = ctx; ctx.self = ctx; ctx.addEventListener = () => {};
  ctx.document = { addEventListener() {}, querySelector: () => elemento(), querySelectorAll: () => [], getElementById: () => null,
    createElement: () => elemento(), documentElement: elemento(), body: elemento(), visibilityState: "visible" };
  vm.createContext(ctx);
  for (const a of arquivos) vm.runInContext(fs.readFileSync(path.join(raiz, "public/assets/js", a), "utf8"), ctx, { filename: a });
  return expr => vm.runInContext(expr, ctx);
}
