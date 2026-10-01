// Gera supabase/schema.sql = todas as migrations em ordem, num arquivo só, para
// quem prefere colar no SQL Editor do Supabase. As migrations são idempotentes,
// então o arquivo inteiro pode ser executado de novo sem estragar nada.
//   node scripts/build-schema.mjs           (gera)
//   node scripts/build-schema.mjs --check   (falha se estiver desatualizado)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(raiz, "supabase/migrations");
const migs = fs.readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const corpo = [
  "-- ============================================================",
  "--  Erbe · Central — esquema completo do banco (GERADO, não edite à mão)",
  "--  Fonte: supabase/migrations/*.sql · gerado por scripts/build-schema.mjs",
  "--  Supabase → SQL Editor → cole este arquivo inteiro → Run.",
  "--  Pode rodar mais de uma vez: não apaga nem duplica nada.",
  "-- ============================================================",
  "",
  ...migs.map(m => `-- >>>>>>>>>> ${m}\n${fs.readFileSync(path.join(dir, m), "utf8").trimEnd()}\n`)
].join("\n") + "\n";
const alvo = path.join(raiz, "supabase/schema.sql");
if (process.argv.includes("--check")) {
  const atual = fs.existsSync(alvo) ? fs.readFileSync(alvo, "utf8") : "";
  if (atual !== corpo) { console.error("supabase/schema.sql desatualizado: rode npm run schema"); process.exit(1); }
  console.log(`schema.sql em dia (${migs.length} migrations)`);
} else {
  fs.writeFileSync(alvo, corpo);
  console.log(`supabase/schema.sql gerado com ${migs.length} migrations`);
}
