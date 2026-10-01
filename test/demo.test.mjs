// Testa o motor de demonstração (demo.js) — mesmas regras do banco
import fs from 'fs';
import vm from 'vm';
const ctx = { window: {}, console, setTimeout, performance, URL, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, Math, Date, JSON };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('web/js/demo.js', 'utf8'), ctx);
const t0 = Date.now();
const API = ctx.DemoBackend.create();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FALHOU:', m); } };
const as = async (id) => API.switchUser(id);
const expectErr = async (p, m) => { try { await p; ok(false, m + ' (deveria falhar)'); } catch (e) { ok(true, m + ' → ' + e.message); } };
const T = API._debug.T;
console.log(`seed em ${Date.now() - t0} ms · ${T.leads.length} leads · ${T.sales.length} vendas · ${T.commissions.length} comissões · ${T.events.length} compromissos`);

console.log('\n# Seed v1.1');
ok(T.commission_grades.length === 4, 'grades Ouro/Prata/Bronze/Externo');
ok(T.product_commission_grid.length > 50, 'grade por produto: ' + T.product_commission_grid.length + ' valores');
ok(T.commissions.some(c => c.origem_calculo === 'grade') && T.commissions.some(c => c.origem_calculo !== 'grade'), 'comissões pela grade do produto e pelas regras');
ok(T.pipeline_stages.every(s => s.grupo), 'etapas do CRM com grupo');
ok(T.implementation_stages.length === 8, 'etapas da implantação cadastradas');
ok(T.event_participants.length > 20, 'convites de agenda: ' + T.event_participants.length);
ok(T.notifications.some(n => n.tipo === 'sla_atrasado'), 'notificações de SLA atrasado geradas');
ok(T.notifications.some(n => n.tipo === 'novo_lead'), 'notificações de novo lead geradas');
ok(T.notifications.some(n => n.tipo === 'evento_proximo'), 'lembrete da reunião próxima gerado');
const ouro = T.commissions.find(c => c.grade === 'ouro' && c.origem_calculo === 'grade' && c.parcela === 1);
const g = T.product_commission_grid;
const sale = T.sales.find(s => s.id === ouro.sale_id);
const pctOuro = g.find(x => x.product_id === sale.product_id && x.beneficiario === 'ouro' && x.parcela === 1).percentual;
ok(Math.abs(ouro.comissao_corretor - Math.round(sale.valor_mensal * pctOuro) / 100) < 0.02, `comissão Ouro = ${pctOuro}% da mensalidade`);

ok(T.product_commission_grid.every(g => Number(g.percentual) > 0), 'grade não guarda parcelas com 0%');
await as('u-cor-rodrigo');
const mcx = await API.rpc('minhas_comissoes', {});
const bruto = T.commissions.filter(c => c.corretor_id === 'u-cor-rodrigo');
ok(mcx.every(c => Number(c.minha_comissao) > 0) && mcx.length === bruto.filter(c => Number(c.comissao_corretor) > 0).length,
  `corretor Externo: parcelas sem valor não aparecem (${mcx.length} de ${bruto.length})`);
const gx = await API.all('product_commission_grid');
ok(gx.every(g => g.beneficiario === 'externo' && Number(g.percentual) > 0), 'grade do Externo mostra só parcelas com valor');

console.log('\n# Corretor');
await as('u-cor-ana');
const grid = await API.all('product_commission_grid');
ok(grid.length > 0 && grid.every(x => x.beneficiario === 'ouro'), 'corretor Ouro vê só a própria linha da grade');
await expectErr(API.update('profiles', 'u-cor-ana', { grade_comissao: 'externo' }), 'corretor não altera a própria grade');
await expectErr(API.rpc('salvar_grade_produto', { p_product: sale.product_id, p_linhas: [] }), 'corretor não altera grade do produto');
const pres = await API.all('v_presence');
ok(pres.filter(x => x.situacao === 'online').every(x => x.id === 'u-cor-ana'), 'corretor não vê a presença dos outros');
const evs = await API.all('v_events');
ok(evs.some(e => e.minha_resposta), 'corretor vê compromissos para os quais foi convidado');
const conv = evs.find(e => e.minha_resposta && e.tipo === 'treinamento');
if (conv) { await API.rpc('responder_convite', { p_evento: conv.id, p_resposta: 'aceito' }); ok((await API.get('v_events', conv.id)).minha_resposta === 'aceito', 'corretor confirma presença no treinamento'); }
await expectErr(API.rpc('convidar_evento', { p_evento: conv.id, p_usuarios: ['u-cor-diego'] }), 'convidado não convida outras pessoas');
const vc = await API.list('v_commissions', { limit: 5 });
ok(vc.rows.length === 0, 'corretor não lê a tabela de comissões');
const mc = await API.rpc('minhas_comissoes', {});
ok(mc.length > 0, 'minhas_comissoes do corretor');

console.log('\n# Supervisor');
await as('u-sup-bruno');
await API.rpc('registrar_presenca', { p_tela: 'Dashboard' });
const presS = await API.all('v_presence');
ok(presS.some(x => x.id === 'u-cor-ana' && x.situacao === 'online') && !presS.some(x => x.id === 'u-cor-pedro' && x.situacao === 'online'), 'supervisor vê a própria equipe online');
const ev = await API.insert('events', { titulo: 'Teste convite', tipo: 'treinamento', inicio: new Date(Date.now() + 86400e3).toISOString(), responsavel_id: 'u-sup-bruno' });
ok((await API.rpc('convidar_evento', { p_evento: ev.id, p_usuarios: ['u-cor-ana', 'u-cor-diego'] })) === 2, 'supervisor convida a equipe');
await expectErr(API.rpc('convidar_evento', { p_evento: ev.id, p_usuarios: ['u-cor-pedro'] }), 'não convida corretor de outra equipe');
await API.update('events', ev.id, { inicio: new Date(Date.now() + 2 * 86400e3).toISOString() });
ok(T.notifications.some(n => n.usuario_id === 'u-cor-ana' && n.tipo === 'evento_alterado' && n.ref_id === ev.id), 'convidado avisado da mudança');
const vp = await API.all('v_event_participants', { eq: { event_id: ev.id } });
ok(vp.length === 2 && vp[0].usuario_nome, 'lista de convidados com nomes');
await expectErr(API.rpc('excluir_etapa_crm', { p_codigo: 'contato', p_destino: 'novos' }), 'supervisor não exclui etapa');

console.log('\n# Gerente');
await as('u-ger-carla');
const presG = await API.all('v_presence');
ok(presG.some(x => x.papel === 'corretor' && x.situacao === 'online'), 'gerente vê corretores online da estrutura');
ok(!presG.some(x => x.id === 'u-cor-pedro'), 'gerente não vê estrutura de outro gerente');
const d = await API.rpc('dashboard_metricas', { p_inicio: '2020-01-01', p_fim: new Date().toISOString().slice(0, 10), p_filtros: {} });
ok(d.por_equipe.length >= 2 && d.por_corretor.length && d.por_supervisor.length, 'vendas por equipe, corretor e supervisor');
ok(typeof d.atencao.sla_atrasado === 'number', 'dashboard com SLA atrasado');
const des = await API.rpc('desempenho_corretores', { p_inicio: '2020-01-01', p_fim: new Date().toISOString().slice(0, 10), p_filtros: {} });
ok(des.every(x => x.grade && x.gerente), 'desempenho traz grade e gerente');
const gr = await API.all('product_commission_grid');
ok(gr.some(x => x.beneficiario === 'corretora'), 'gerente com permissão vê a grade completa');

console.log('\n# Administrador');
await as('u-admin');
const n1 = await API.rpc('salvar_grade_produto', { p_product: sale.product_id, p_linhas: [{ beneficiario: 'corretora', parcela: 1, percentual: 210 }, { beneficiario: 'ouro', parcela: 1, percentual: 125 }] });
ok(n1 === 2, 'admin salva grade do produto');
await expectErr(API.rpc('salvar_grade_produto', { p_product: sale.product_id, p_linhas: [{ beneficiario: 'ouro', parcela: 1, percentual: 1 }] }), 'grade sem corretora recusada');
const imp = await API.rpc('importar_grade_comissao', { p_linhas: [{ operadora: 'Nova Op', produto: 'Plano X', parcela: 1, valores: { corretora: '150', bronze: '70,5' } }], p_criar_produtos: true });
ok(imp.criados === 1 && imp.valores === 2, 'importação cria produto e grade');
await API.insert('commission_grades', { codigo: 'diamante', nome: 'Diamante', ordem: 0, cor: '#9AE6FF' });
await API.update('profiles', 'u-cor-diego', { grade_comissao: 'diamante' });
await API.rpc('excluir_grade', { p_codigo: 'diamante', p_destino: 'prata' });
ok(T.profiles.find(p => p.id === 'u-cor-diego').grade_comissao === 'prata', 'excluir grade move corretores');
await API.insert('pipeline_stages', { codigo: 'visita', nome: 'Visita', ordem: 5, cor: '#123456', grupo: 'negociacao' });
ok(T.lead_statuses.some(s => s.etapa === 'visita'), 'etapa nova ganha status');
const l0 = T.leads.find(l => l.etapa === 'negociacao' && !l.deleted_at);
await API.rpc('mover_etapa', { p_lead: l0.id, p_etapa: 'visita' });
await expectErr(API.rpc('excluir_etapa_crm', { p_codigo: 'aprovado', p_destino: 'contato' }), 'etapa do sistema não é excluída');
const moved = await API.rpc('excluir_etapa_crm', { p_codigo: 'visita', p_destino: 'negociacao' });
ok(moved === 1 && T.leads.find(l => l.id === l0.id).etapa === 'negociacao', 'etapa excluída move os leads');
await API.insert('lead_statuses', { codigo: 'aguardando', nome: 'Aguardando', etapa: 'proposta', ordem: 40, cor: '#999' });
await API.rpc('alterar_status_lead', { p_lead: l0.id, p_status: 'aguardando' });
await API.update('lead_statuses', 'aguardando', { etapa: 'negociacao' }, 'codigo');
ok(T.leads.find(l => l.id === l0.id).etapa === 'negociacao', 'lead acompanha a etapa do status');
await expectErr(API.rpc('excluir_status_lead', { p_codigo: 'aguardando', p_destino: 'sem_interesse' }), 'destino com motivo de perda recusado');
await API.rpc('excluir_status_lead', { p_codigo: 'aguardando', p_destino: 'follow_up' });
ok(T.leads.find(l => l.id === l0.id).status === 'follow_up', 'status excluído transfere o lead');
await API.insert('implementation_stages', { codigo: 'vistoria', nome: 'Vistoria', ordem: 5, cor: '#abcdef' });
const im = T.implementations.find(i => i.etapa === 'documentacao');
if (im) { await API.rpc('avancar_implantacao', { p_impl: im.id, p_etapa: 'vistoria' }); await API.rpc('excluir_etapa_implantacao', { p_codigo: 'vistoria', p_destino: 'documentacao' }); ok(T.implementations.find(i => i.id === im.id).etapa === 'documentacao', 'etapa de implantação excluída move os registros'); }
await expectErr(API.rpc('excluir_etapa_implantacao', { p_codigo: 'implantado', p_destino: 'aprovado' }), 'etapa de implantação do sistema protegida');
const r = await API.rpc('processar_alertas_rapidos', {});
ok(typeof r.sla === 'number', 'rotina de alertas rápidos executa');

console.log('\n# v1.3 · CRM integrado à implantação');
ok(T.leads.filter(l => l.client_id && !l.deleted_at).every(l => ['aprovado', 'implantado'].includes(l.etapa) || T.sales.some(s => s.lead_id === l.id && ['cancelada', 'recusada'].includes(s.status))),
  'leads convertidos ficam nas etapas de ganho do CRM');
await as('u-cor-rodrigo');
const nl = await API.insert('leads', { nome: 'Fluxo Integrado', whatsapp: '11933339999', status: 'negociacao' });
const cv = await API.rpc('converter_em_cliente', { p_lead: nl.id, p_dados: { valor_mensal: 800, status: 'proposta_enviada' } });
const vl = (await API.all('v_leads', { eq: { id: nl.id } }))[0];
ok(cv.implantacao_etapa === 'venda_realizada' && vl.etapa === 'aprovado', 'lead aprovado vai para "Aprovado" e a venda para "Venda realizada"');
ok(vl.implantacao_etapa_nome === 'Venda realizada' && vl.implantacao_sale_id === cv.sale_id, 'CRM mostra a etapa da implantação');
await API.rpc('avancar_implantacao', { p_impl: vl.implantacao_id, p_etapa: 'implantado' });
ok(T.leads.find(l => l.id === nl.id).etapa === 'implantado', 'implantação concluída leva o lead para "Implantado"');

console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
