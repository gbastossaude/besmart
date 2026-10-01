// Monta o navegador do teste com o Supabase falso e uma carteira de exemplo.
import { test as base, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const FAKE = fs.readFileSync(path.join(aqui, "fake-supabase.js"), "utf8");

export const IDS = {
  gestor: "00000000-0000-4000-8000-000000000001",
  corretorA: "00000000-0000-4000-8000-00000000000a",
  corretorB: "00000000-0000-4000-8000-00000000000b",
  assistente: "00000000-0000-4000-8000-0000000000c1",
  pendente: "00000000-0000-4000-8000-0000000000d1"
};
const iso = d => d.toISOString().slice(0, 10);
const somaDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const somaMeses = (s, n) => { const d = new Date(s + "T12:00:00"); d.setMonth(d.getMonth() + n); return iso(d); };

export function carteira({ clientesExtras = 0 } = {}) {
  const users = [
    { id: IDS.gestor, email: "gbastossaude@gmail.com", password: "senha123", nome: "Guilherme" },
    { id: IDS.corretorA, email: "ana@erbe.com", password: "senha123", nome: "Ana Corretora" },
    { id: IDS.corretorB, email: "beto@erbe.com", password: "senha123", nome: "Beto Corretor" },
    { id: IDS.assistente, email: "caio@erbe.com", password: "senha123", nome: "Caio Assistente" },
    { id: IDS.pendente, email: "novo@erbe.com", password: "senha123", nome: "Novo" }
  ];
  const perfis = [
    { id: IDS.gestor, nome: "Guilherme", email: users[0].email, papel: "gestor", status: "ativo", ver_tudo: true, meta: 50000, split_pct: 100 },
    { id: IDS.corretorA, nome: "Ana Corretora", email: users[1].email, papel: "corretor", status: "ativo", ver_tudo: false, meta: 8000, split_pct: 40 },
    { id: IDS.corretorB, nome: "Beto Corretor", email: users[2].email, papel: "corretor", status: "ativo", ver_tudo: false, meta: 8000, split_pct: 50 },
    { id: IDS.assistente, nome: "Caio Assistente", email: users[3].email, papel: "assistente", status: "ativo", ver_tudo: false, meta: 0, split_pct: 0 },
    { id: IDS.pendente, nome: "Novo", email: users[4].email, papel: "corretor", status: "pendente", ver_tudo: false, meta: 0, split_pct: 50 }
  ];
  const hoje = iso(new Date());
  const cli = (id, nome, dono, extra = {}) => ({ id, dono, dados: { id, nome, tipo: "PJ", doc: extra.doc || "", telefone: "11999990000", email: `${id}@ex.com`, responsavel: dono, criadoEm: somaDias(-200), ...extra } });
  const parcelas = (inicio, base) => [1, 2, 3].map(n => ({ n, tipo: "agenciamento", pct: n === 1 ? 100 : 50, valor: n === 1 ? base : base / 2, vence: somaMeses(inicio, n), status: n === 1 ? "recebido" : "previsto", recebidoEm: n === 1 ? somaMeses(inicio, 1) : "", valorRecebido: n === 1 ? base : null }));
  const ctr = (id, clienteId, clienteNome, dono, extra = {}) => {
    const inicio = extra.inicio || somaDias(-40);
    const base = extra.valorBase || 1000;
    return { id, dono, dados: { id, clienteId, clienteNome, pilar: "saude", produto: "PME 2-29 vidas", operadora: extra.operadora || "Amil", numero: extra.numero || id.toUpperCase(), vidas: 3, status: "ativo", valorBase: base, inicio, fim: somaMeses(inicio, 12), corretor: dono, splitPct: 40, regraId: "r-saude-agenc", comissoes: parcelas(inicio, base), criadoEm: inicio, ...extra } };
  };
  const clientes = [
    cli("cli-alfa", "Alfa Engenharia", IDS.corretorA, { doc: "11.222.333/0001-81" }),
    cli("cli-beta", "Beta Comércio", IDS.corretorB, { doc: "22.333.444/0001-90" }),
    cli("cli-gama", "Gama Serviços", IDS.gestor)
  ];
  for (let i = 0; i < clientesExtras; i++) clientes.push(cli(`cli-x${String(i).padStart(5, "0")}`, `Cliente Extra ${String(i).padStart(5, "0")}`, IDS.gestor));
  const contratos = [
    ctr("ctr-alfa", "cli-alfa", "Alfa Engenharia", IDS.corretorA, { numero: "PROP-7781" }),
    ctr("ctr-beta", "cli-beta", "Beta Comércio", IDS.corretorB, { operadora: "SulAmérica" }),
    ctr("ctr-gama", "cli-gama", "Gama Serviços", IDS.gestor, { operadora: "Bradesco Saúde" })
  ];
  const leads = [
    { id: "lead-1", dono: IDS.corretorA, dados: { id: "lead-1", nome: "Delta Transportes", empresa: "Delta", etapa: "proposta", pilar: "saude", valorEstimado: 3000, responsavel: IDS.corretorA, origem: "Indicação", criadoEm: somaDias(-10), ultimoContato: somaDias(-1) } },
    { id: "lead-2", dono: IDS.corretorB, dados: { id: "lead-2", nome: "Épsilon Logística", etapa: "novo", pilar: "seguros", valorEstimado: 5000, responsavel: IDS.corretorB, origem: "Site", criadoEm: somaDias(-3) } }
  ];
  const tarefas = [
    { id: "tar-1", dono: IDS.corretorA, dados: { id: "tar-1", titulo: "Ligar para Alfa", tipo: "Ligação", vence: somaDias(3), status: "aberta", responsavel: IDS.corretorA, refTipo: "cliente", refId: "cli-alfa", refNome: "Alfa Engenharia" } }
  ];
  const vidas = [
    { id: "vida-1", dono: IDS.corretorA, dados: { id: "vida-1", nome: "João da Silva", tipo: "titular", contratoId: "ctr-alfa", clienteId: "cli-alfa", status: "ativa", doc: "123.456.789-09", entrada: hoje } }
  ];
  return { users, tables: { perfis, clientes, contratos, leads, tarefas, vidas, despesas: [], atividade: [], config: [] } };
}

export const test = base.extend({
  /** Abre o sistema logado como `quem` (gestor, corretorA, ...). */
  abrir: async ({ page }, use) => {
    const erros = [];
    page.on("pageerror", e => erros.push(String(e)));
    page.on("console", m => { if (m.type() === "error") erros.push(m.text()); });
    page.__erros = erros;
    await use(async (quem = "gestor", opcoes = {}) => {
      const semente = opcoes.semente || carteira(opcoes);
      if (quem) semente.sessionUserId = IDS[quem];
      await page.route("**/vendor/supabase.js", r => r.fulfill({ contentType: "text/javascript", body: FAKE }));
      await page.route(u => new URL(u).pathname === "/config.js", r => r.fulfill({ contentType: "text/javascript", body: 'window.ERBE_CONFIG={url:"https://fake.supabase.co",anonKey:"anon-fake"};' }));
      await page.addInitScript(s => { window.__FAKE_DB__ = s; try { localStorage.setItem("erbe-lembrete-soneca", new Date(Date.now() + 864e5).toISOString()); } catch (e) {} }, semente);
      await page.goto("/");
      if (quem && quem !== "pendente") await expect(page.locator("#app")).toBeVisible();
    });
  }
});
export { expect };
