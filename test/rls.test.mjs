import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const load = f => fs.readFileSync(f, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FALHOU:', m); } };
async function exec(sql) { return db.exec(sql); }
async function q(sql, params = []) { return (await db.query(sql, params)).rows; }
async function as(uid, fn) {
  await exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role authenticated;`);
  try { return await fn(); } finally { await exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function expectErr(p, m) { try { await p; ok(false, m + ' (deveria falhar)'); } catch (e) { ok(true, m + ' → ' + e.message.split('\n')[0]); } }

process.on('unhandledRejection', e => { console.error('ERRO:', e.message, '\n', e.where || ''); process.exit(1); });
const SQL = process.env.SQL ? process.env.SQL.split(',') : ['sql/atos_completo.sql'];
for (const f of ['test/00_stub_supabase.sql', ...SQL]) {
  try { await exec(load(f)); console.log('carregado', f); }
  catch (e) { console.error('ERRO em', f, e.message, e.position, e.where); process.exit(1); }
}

const U = {
  admin: '00000000-0000-0000-0000-000000000001', ger1: '00000000-0000-0000-0000-000000000011', ger2: '00000000-0000-0000-0000-000000000012',
  sup1: '00000000-0000-0000-0000-000000000021', sup2: '00000000-0000-0000-0000-000000000022', sup3: '00000000-0000-0000-0000-000000000023',
  c1: '00000000-0000-0000-0000-000000000031', c2: '00000000-0000-0000-0000-000000000032', c3: '00000000-0000-0000-0000-000000000033',
  c4: '00000000-0000-0000-0000-000000000034', pend: '00000000-0000-0000-0000-000000000099',
};
const email = { admin: 'gbastossaude@gmail.com' };
for (const [k, id] of Object.entries(U)) await q(`insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email[k] || k + '@atos.test', { nome: k.toUpperCase() }]);

console.log('\n# Estrutura (admin)');
const adminP = await q(`select papel, status from profiles where id = $1`, [U.admin]);
ok(adminP[0].papel === 'admin' && adminP[0].status === 'ativo', 'e-mail master vira admin ativo');
await as(U.admin, async () => {
  for (const k of ['ger1', 'ger2']) await q(`update profiles set papel='gerente', status='ativo' where id=$1`, [U[k]]);
  await q(`update profiles set papel='supervisor', status='ativo', gerente_id=$2 where id=$1`, [U.sup1, U.ger1]);
  await q(`update profiles set papel='supervisor', status='ativo', gerente_id=$2 where id=$1`, [U.sup2, U.ger1]);
  await q(`update profiles set papel='supervisor', status='ativo', gerente_id=$2 where id=$1`, [U.sup3, U.ger2]);
  const t1 = (await q(`insert into teams(nome, supervisor_id) values ('Equipe Alfa', $1) returning id`, [U.sup1]))[0].id;
  const t2 = (await q(`insert into teams(nome, supervisor_id) values ('Equipe Beta', $1) returning id`, [U.sup2]))[0].id;
  const t3 = (await q(`insert into teams(nome, supervisor_id) values ('Equipe Gama', $1) returning id`, [U.sup3]))[0].id;
  await q(`update profiles set status='ativo', team_id=$2 where id=$1`, [U.c1, t1]);
  await q(`update profiles set status='ativo', team_id=$2 where id=$1`, [U.c2, t1]);
  await q(`update profiles set status='ativo', team_id=$2 where id=$1`, [U.c3, t2]);
  await q(`update profiles set status='ativo', team_id=$2 where id=$1`, [U.c4, t3]);
  const h = await q(`select id, supervisor_id, gerente_id from profiles where id in ($1,$2)`, [U.c3, U.c4]);
  ok(h.find(x => x.id === U.c3).gerente_id === U.ger1 && h.find(x => x.id === U.c4).gerente_id === U.ger2, 'hierarquia calculada automaticamente pela equipe');
});

console.log('\n# Corretor');
let leadC1, leadC2, leadC3, leadC4;
await as(U.c1, async () => {
  leadC1 = (await q(`insert into leads(nome, whatsapp, email, num_vidas) values ('Maria C1', '(11) 98888-1111', 'MARIA@x.com', 3) returning id, corretor_id, supervisor_id, gerente_id`))[0];
  ok(leadC1.corretor_id === U.c1 && leadC1.supervisor_id === U.sup1 && leadC1.gerente_id === U.ger1, 'lead do corretor carimbado com corretor/supervisor/gerente');
  const forj = (await q(`insert into leads(nome, corretor_id) values ('Tentativa', $1) returning corretor_id`, [U.c2]))[0];
  ok(forj.corretor_id === U.c1, 'corretor não consegue criar lead em nome de outro (forçado para ele)');
});
await as(U.c2, async () => { leadC2 = (await q(`insert into leads(nome, whatsapp, cpf) values ('João C2', '11977772222', '123.456.789-09') returning id`))[0]; });
await as(U.c3, async () => { leadC3 = (await q(`insert into leads(nome, whatsapp) values ('Ana C3', '11966663333') returning id`))[0]; });
await as(U.c4, async () => { leadC4 = (await q(`insert into leads(nome, whatsapp) values ('Pedro C4', '11955554444') returning id`))[0]; });

await as(U.c1, async () => {
  const vis = await q(`select nome from leads`);
  ok(vis.length === 2 && vis.every(r => ['Maria C1', 'Tentativa'].includes(r.nome)), 'corretor vê somente os próprios leads (tabela)');
  ok((await q(`select * from v_leads`)).length === 2, 'corretor vê somente os próprios leads (view)');
  ok((await q(`select * from leads where id = $1`, [leadC2.id])).length === 0, 'acesso direto por ID ao lead de outro corretor retorna vazio');
  const upd = await q(`update leads set nome = 'hack' where id = $1 returning id`, [leadC2.id]);
  ok(upd.length === 0, 'corretor não altera lead de outro corretor');
  await expectErr(q(`update leads set corretor_id = $1 where id = $2`, [U.c2, leadC1.id]), 'corretor não transfere o próprio lead');
  await expectErr(q(`select distribuir_lead($1, $2, 'x')`, [leadC1.id, U.c2]), 'corretor não usa distribuir_lead');
  ok((await q(`select * from lead_history where lead_id = $1`, [leadC2.id])).length === 0, 'corretor não vê timeline de lead alheio');
  await expectErr(q(`insert into followups(lead_id, agendado_para) values ($1, now())`, [leadC2.id]), 'corretor não cria follow-up em lead alheio');
  await expectErr(q(`insert into tasks(titulo, lead_id, responsavel_id) values ('x', $1, $2)`, [leadC2.id, U.c1]), 'corretor não vincula tarefa a lead alheio');
  const dup = await q(`select * from verificar_duplicidade(null, '11977772222', null)`);
  ok(dup.length === 1 && dup[0].visivel === false && dup[0].nome === null, 'duplicidade avisa sem revelar dados do outro corretor');
  const dupCpf = await q(`select * from verificar_duplicidade('12345678909', null, null)`);
  ok(dupCpf.length === 1 && dupCpf[0].nome === null, 'duplicidade por CPF normalizado');
  ok((await q(`select * from profiles`)).length === 3, 'corretor vê apenas o próprio perfil + supervisor + gerente');
  await expectErr(q(`update profiles set papel = 'admin' where id = $1`, [U.c1]), 'corretor não se promove a admin');
  ok((await q(`select * from audit_logs`)).length === 0, 'corretor não acessa auditoria');
  const busca = await q(`select busca_global('C2') r`);
  ok(busca[0].r.length === 0, 'busca global não encontra registros de outro corretor');
});

console.log('\n# Supervisor');
await as(U.sup1, async () => {
  const vis = (await q(`select nome from leads order by nome`)).map(r => r.nome);
  ok(vis.length === 3 && vis.includes('João C2') && !vis.includes('Ana C3'), 'supervisor vê apenas a própria equipe');
  await expectErr(q(`select distribuir_lead($1, $2, 'teste')`, [leadC1.id, U.c3]), 'supervisor não transfere para corretor de outra equipe');
  await expectErr(q(`select distribuir_lead($1, $2)`, [leadC1.id, U.c2]), 'transferência exige motivo');
  await q(`select distribuir_lead($1, $2, 'Férias do corretor')`, [leadC1.id, U.c2]);
  const a = await q(`select * from v_lead_assignments where lead_id = $1 order by created_at`, [leadC1.id]);
  ok(a.length === 2 && a[1].corretor_anterior === U.c1 && a[1].motivo === 'Férias do corretor', 'transferência registrada com anterior, novo, usuário e motivo');
  ok((await q(`select * from leads where id = $1`, [leadC3.id])).length === 0, 'supervisor não acessa lead de outra equipe por ID');
  const pool = (await q(`insert into leads(nome) values ('Fila Alfa') returning supervisor_id, gerente_id, corretor_id`))[0];
  ok(pool.supervisor_id === U.sup1 && pool.corretor_id === null && pool.gerente_id === U.ger1, 'lead sem corretor fica na fila da equipe');
});
await as(U.c1, async () => { ok((await q(`select * from leads where id = $1`, [leadC1.id])).length === 0, 'após transferência, o corretor anterior perde o acesso'); });
await as(U.c2, async () => {
  ok((await q(`select * from leads where id = $1`, [leadC1.id])).length === 1, 'novo corretor passa a ver o lead');
  const h = await q(`select tipo from lead_history where lead_id = $1`, [leadC1.id]);
  ok(h.some(x => x.tipo === 'responsavel') && h.some(x => x.tipo === 'criacao'), 'histórico anterior preservado na timeline');
});

console.log('\n# Gerente');
await as(U.ger1, async () => {
  const vis = (await q(`select nome from leads`)).map(r => r.nome);
  ok(vis.includes('Ana C3') && vis.includes('João C2') && !vis.includes('Pedro C4'), 'gerente vê toda a sua estrutura e nada de fora');
  await expectErr(q(`select distribuir_lead($1, $2, 'x')`, [leadC3.id, U.c4]), 'gerente não distribui para fora da estrutura');
  ok((await q(`select * from leads where id = $1`, [leadC4.id])).length === 0, 'gerente não acessa lead de outra gerência por ID');
});

console.log('\n# Fluxo comercial completo (corretor c3)');
await as(U.c3, async () => {
  await q(`select registrar_atividade($1, 'ligacao', false, 'nao_atendeu')`, [leadC3.id]);
  let l = (await q(`select status, tentativas_contato, primeiro_contato_em from leads where id = $1`, [leadC3.id]))[0];
  ok(l.status === 'tentativa_contato' && l.tentativas_contato === 1 && l.primeiro_contato_em, 'atividade atualiza status, tentativas e SLA');
  await q(`select registrar_atividade($1, 'whatsapp', true, 'respondeu')`, [leadC3.id]);
  await q(`insert into followups(lead_id, tipo, agendado_para) values ($1, 'ligacao', now() + interval '2 hours')`, [leadC3.id]);
  l = (await q(`select status, proximo_followup_em from leads where id = $1`, [leadC3.id]))[0];
  ok(l.status === 'contato_realizado' && l.proximo_followup_em, 'follow-up agendado reflete no lead');
  const op = (await q(`select id from operators where nome = 'Amil'`))[0].id;
  await q(`insert into quotes(lead_id, operator_id, num_vidas, valor_mensal, status) values ($1, $2, 2, 890.50, 'enviada')`, [leadC3.id, op]);
  l = (await q(`select status, valor_cotacao from leads where id = $1`, [leadC3.id]))[0];
  ok(l.status === 'cotacao_enviada' && Number(l.valor_cotacao) === 890.5, 'cotação enviada avança o funil');
  await expectErr(q(`select mover_etapa($1, 'perdido')`, [leadC3.id]), 'perder lead sem motivo é bloqueado');
  await q(`insert into proposals(lead_id, operator_id, numero, valor_mensal, status) values ($1, $2, 'P-001', 890.50, 'enviada')`, [leadC3.id, op]);
  const conv = (await q(`select converter_em_cliente($1, '{"valor_mensal": 890.50, "numero_proposta":"P-001", "dependentes":[{"nome":"Filho","parentesco":"filho"}]}') r`, [leadC3.id]))[0].r;
  ok(conv.client_id && conv.sale_id, 'lead convertido em cliente + venda');
  l = (await q(`select status, etapa, client_id from leads where id = $1`, [leadC3.id]))[0];
  ok(l.etapa === 'aprovado' && l.client_id === conv.client_id, 'lead vai para Aprovado');
  const impl = (await q(`select * from implementations where sale_id = $1`, [conv.sale_id]))[0];
  ok(impl && impl.etapa === 'aprovado', 'implantação criada automaticamente');
  ok((await q(`select * from commissions`)).length === 0, 'corretor não lê a tabela de comissões (margem da empresa)');
  const mc = await q(`select * from minhas_comissoes()`);
  ok(mc.length >= 1 && Number(mc[0].minha_comissao) > 0, 'minhas_comissoes devolve a comissão do corretor: R$ ' + (mc[0] && mc[0].minha_comissao));
  await q(`select avancar_implantacao($1, 'implantado', 'Carteirinhas emitidas', 'PROT-9')`, [impl.id]);
  const s = (await q(`select status from sales where id = $1`, [conv.sale_id]))[0];
  const c = (await q(`select status from clients where id = $1`, [conv.client_id]))[0];
  l = (await q(`select etapa from leads where id = $1`, [leadC3.id]))[0];
  ok(s.status === 'implantada' && c.status === 'ativo' && l.etapa === 'implantado', 'implantação concluída sincroniza venda, cliente e lead');
  ok((await q(`select * from dependents`)).length === 1, 'dependente cadastrado na conversão');
  const d = (await q(`select dashboard_metricas(current_date - 30, current_date) r`))[0].r;
  ok(d.cards.vendas_aprovadas === 1 && Number(d.cards.valor_vendido) === 890.5, 'dashboard do corretor calcula vendas próprias');
  const h = (await q(`select tipo from lead_history where lead_id = $1`, [leadC3.id])).map(x => x.tipo);
  ok(['criacao','ligacao','whatsapp','followup','cotacao','proposta','venda','aprovacao','implantacao','status'].every(t => h.includes(t)), 'timeline completa: ' + [...new Set(h)].join(', '));
});
await as(U.c1, async () => {
  const d = (await q(`select dashboard_metricas(current_date - 30, current_date) r`))[0].r;
  ok(d.cards.vendas_aprovadas === 0, 'dashboard de outro corretor não inclui a venda do c3');
  ok((await q(`select * from v_sales`)).length === 0 && (await q(`select * from v_clients`)).length === 0, 'corretor não vê vendas/clientes alheios');
});
await as(U.sup1, async () => {
  const d = (await q(`select dashboard_metricas(current_date - 30, current_date) r`))[0].r;
  ok(d.cards.vendas_aprovadas === 0, 'supervisor de outra equipe não enxerga a venda');
});
await as(U.ger1, async () => {
  const d = (await q(`select dashboard_metricas(current_date - 30, current_date) r`))[0].r;
  ok(d.cards.vendas_aprovadas === 1, 'gerente enxerga a venda da estrutura no dashboard');
  const dp = (await q(`select desempenho_corretores(current_date - 30, current_date) r`))[0].r;
  ok(dp.length === 3 && dp[0].vendas === 1, 'desempenho lista os 3 corretores da gerência');
  ok((await q(`select * from commissions`)).length >= 1, 'gerente com permissão vê comissões da estrutura');
  const ic = (await q(`select inteligencia_comercial(current_date - 30, current_date) r`))[0].r;
  ok(Array.isArray(ic.precisam_atencao), 'inteligência comercial executa');
});
await as(U.ger2, async () => {
  ok((await q(`select * from commissions`)).length === 0, 'gerente de outra estrutura não vê comissões');
  const dp = (await q(`select desempenho_corretores(current_date - 30, current_date) r`))[0].r;
  ok(dp.length === 1, 'desempenho da ger2 só lista o próprio corretor');
});

console.log('\n# Perda com motivo');
await as(U.c2, async () => {
  const mot = (await q(`select id from loss_reasons where nome = 'Preço'`))[0].id;
  await q(`select mover_etapa($1, 'perdido', $2, 'Achou caro')`, [leadC2.id, mot]);
  const l = (await q(`select status, loss_reason_id from leads where id = $1`, [leadC2.id]))[0];
  ok(l.status === 'perdido' && l.loss_reason_id === mot, 'lead perdido com motivo');
  await expectErr(q(`update leads set deleted_at = now() where id = $1`, [leadC2.id]), 'corretor não exclui lead');
});

console.log('\n# Mudança de equipe realinha a visibilidade');
await as(U.admin, async () => {
  const t2 = (await q(`select id from teams where nome = 'Equipe Beta'`))[0].id;
  await q(`update profiles set team_id = $1 where id = $2`, [t2, U.c2]);
});
await as(U.sup1, async () => { ok((await q(`select * from leads where id = $1`, [leadC2.id])).length === 0, 'supervisor antigo perde acesso aos leads do corretor transferido'); });
await as(U.sup2, async () => { ok((await q(`select * from leads where id = $1`, [leadC2.id])).length === 1, 'novo supervisor passa a ver os leads'); });

console.log('\n# Usuário pendente e auditoria');
await as(U.pend, async () => {
  ok((await q(`select * from leads`)).length === 0 && (await q(`select * from operators`)).length === 0, 'usuário pendente não vê nada');
  await expectErr(q(`insert into leads(nome) values ('x')`), 'usuário pendente não cria leads');
});
await as(U.admin, async () => {
  ok((await q(`select * from leads`)).length === 6, 'admin vê todos os leads');
  const a = await q(`select acao from audit_logs`);
  ok(a.some(x => x.acao === 'transferencia') && a.some(x => x.acao === 'hierarquia'), 'auditoria registra transferências e mudanças de hierarquia');
  const pa = (await q(`select processar_alertas() r`))[0].r;
  ok(typeof pa.followups === 'number', 'rotina de alertas executa');
  const imp = (await q(`select importar_leads('[{"nome":"Importado 1","whatsapp":"11912345678"},{"nome":"Dup","whatsapp":"11955554444"},{"nome":""}]'::jsonb, 'ignorar', $1) r`, [U.c1]))[0].r;
  ok(imp.inseridos === 1 && imp.ignorados === 1 && imp.erros.length === 1, 'importação: 1 inserido, 1 duplicado ignorado, 1 erro');
  const auto = (await q(`select distribuir_automatico((select id from leads where nome = 'Fila Alfa')) r`))[0].r;
  ok(auto.ok && [U.c1].includes(auto.corretor_id), 'distribuição automática por rodízio respeita a equipe do lead: ' + auto.corretor_nome);
});
await as(U.admin, async () => {
  const s = (await q(`select id from sales limit 1`))[0].id;
  await q(`update sales set status = 'cancelada', motivo_cancelamento = 'teste' where id = $1`, [s]);
  const cm = await q(`select status from commissions where sale_id = $1`, [s]);
  ok(cm.every(x => x.status === 'cancelada'), 'cancelamento da venda cancela comissões previstas');
});

// Testes adicionais da versão 1.1 (carregados só quando existirem)
if (fs.existsSync('test/rls_v11.mjs') && !process.env.SO_V10) {
  const mod = await import('./rls_v11.mjs');
  await mod.default({ db, q, exec, as, ok, expectErr, U, leads: { leadC1, leadC2, leadC3, leadC4 } });
}

console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
