// Atualização: banco v1.0 COM DADOS → atos_completo.sql (v1.1) executado duas vezes
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FALHOU:', m); } };
const q = async (s, p = []) => (await db.query(s, p)).rows;
const as = async (uid, fn) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
await db.exec(fs.readFileSync('test/00_stub_supabase.sql', 'utf8'));
await db.exec(fs.readFileSync('test/atos_v1_0.sql', 'utf8'));
console.log('v1.0 instalada');

const A = '00000000-0000-0000-0000-000000000001', S = '00000000-0000-0000-0000-000000000021', C = '00000000-0000-0000-0000-000000000031';
await q(`insert into auth.users(id, email, raw_user_meta_data) values ($1,'gbastossaude@gmail.com','{"nome":"Admin"}'), ($2,'s@x.com','{"nome":"Sup"}'), ($3,'c@x.com','{"nome":"Cor"}')`, [A, S, C]);
let venda, lead;
await as(A, async () => {
  await q(`update profiles set papel='supervisor', status='ativo' where id=$1`, [S]);
  const t = (await q(`insert into teams(nome, supervisor_id) values ('Equipe', $1) returning id`, [S]))[0].id;
  await q(`update profiles set status='ativo', team_id=$2 where id=$1`, [C, t]);
  // personalizações que o cliente pode ter feito na v1.0
  await q(`insert into pipeline_stages(codigo, nome, ordem, cor, tipo, status_padrao) values ('retorno','Retorno agendado', 6, '#111111', 'aberto', null)`);
  await q(`insert into lead_statuses(codigo, nome, etapa, ordem, cor) values ('aguardando_retorno','Aguardando retorno','retorno', 40, '#222222')`);
  await q(`update pipeline_stages set status_padrao = 'aguardando_retorno' where codigo = 'retorno'`);
  await q(`update lead_statuses set nome = 'Contato OK' where codigo = 'contato_realizado'`);
  await q(`delete from role_permissions where role = 'corretor' and permission = 'relatorios.exportar'`);
});
await as(C, async () => {
  lead = (await q(`insert into leads(nome, whatsapp) values ('Cliente Antigo', '11999990000') returning id`))[0].id;
  const l2 = (await q(`insert into leads(nome, whatsapp) values ('Em retorno', '11999990001') returning id`))[0].id;
  await q(`update leads set status = 'aguardando_retorno' where id = $1`, [l2]);
  venda = (await q(`select converter_em_cliente($1, '{"valor_mensal": 500, "status": "em_analise"}') r`, [lead]))[0].r;
  await q(`insert into events(titulo, tipo, inicio) values ('Reunião antiga', 'reuniao', now() + interval '2 days')`);
});
const antes = (await q(`select (select count(*) from leads) l, (select count(*) from sales) s, (select count(*) from commissions) c, (select count(*) from lead_history) h, (select count(*) from implementations) i`))[0];

const v11 = fs.readFileSync('sql/atos_completo.sql', 'utf8');
for (const n of [1, 2]) {
  try { await db.exec(v11); console.log(`atos_completo.sql (v1.1) executado — ${n}ª vez`); }
  catch (e) { console.error('ERRO na atualização', n, e.message, e.where); process.exit(1); }
}
const depois = (await q(`select (select count(*) from leads) l, (select count(*) from sales) s, (select count(*) from commissions) c, (select count(*) from lead_history) h, (select count(*) from implementations) i`))[0];
ok(JSON.stringify(antes) === JSON.stringify(depois), 'nenhum dado perdido: ' + JSON.stringify(depois));
const ps = await q(`select codigo, grupo, tipo, sistema from pipeline_stages order by ordem`);
ok(ps.every(x => x.grupo), 'todas as etapas receberam grupo');
ok(ps.find(x => x.codigo === 'retorno')?.grupo === 'atendimento', 'etapa personalizada preservada (grupo atendimento)');
ok((await q(`select nome from lead_statuses where codigo = 'contato_realizado'`))[0].nome === 'Contato OK', 'nome editado do status preservado');
ok((await q(`select 1 from role_permissions where role = 'corretor' and permission = 'relatorios.exportar'`)).length === 0, 'permissão removida pelo admin não volta');
ok((await q(`select 1 from role_permissions where role = 'gerente' and permission = 'presenca.ver'`)).length === 1, 'permissão nova presenca.ver concedida ao gerente');
ok((await q(`select grade_comissao from profiles where id = $1`, [C]))[0].grade_comissao === 'bronze', 'corretor existente recebe grade Bronze');
ok((await q(`select count(*)::int n from implementation_stages`))[0].n === 8, 'etapas de implantação criadas uma única vez');
ok((await q(`select count(*)::int n from commission_grades`))[0].n === 4, 'grades criadas uma única vez');
const impl = (await q(`select etapa from implementations where sale_id = $1`, [venda.sale_id]))[0];
ok(impl.etapa === 'em_analise', 'implantação existente continua válida: ' + impl.etapa);

await as(A, async () => {
  await q(`delete from lead_statuses where codigo = 'cancelado'`);   // admin remove um status padrão sem uso
});
await db.exec(v11);
ok((await q(`select 1 from lead_statuses where codigo = 'cancelado'`)).length === 0, 'status excluído não é recriado ao rodar de novo');

await as(C, async () => {
  ok((await q(`select * from v_leads`)).length === 2, 'corretor continua vendo os próprios leads');
  ok((await q(`select * from v_events`)).length === 1, 'compromisso antigo visível na agenda');
  await q(`update sales set status = 'aprovada' where id = $1`, [venda.sale_id]).catch(() => {});
});
await as(A, async () => {
  await q(`update sales set status = 'aprovada' where id = $1`, [venda.sale_id]);
  const c = await q(`select origem_calculo, grade from commissions where sale_id = $1`, [venda.sale_id]);
  ok(c.length >= 1 && c[0].origem_calculo === 'padrao' && c[0].grade === 'bronze', 'venda antiga aprovada gera comissão pela regra padrão');
  ok((await q(`select etapa from implementations where sale_id = $1`, [venda.sale_id]))[0].etapa === 'aprovado', 'implantação sincronizada');
});
console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
