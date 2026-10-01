// Testes da versão 1.1 — carregado ao final do rls.test.mjs
export default async function ({ q, exec, as, ok, expectErr, U, leads }) {
  let prod, op, gerProd, vendaExterno, op2prod;

  console.log('\n# v1.1 · Grades de comissão');
  await as(U.admin, async () => {
    const g = (await q(`select codigo from commission_grades order by ordem`)).map(x => x.codigo);
    ok(['ouro', 'prata', 'bronze', 'externo'].every(c => g.includes(c)), 'grades padrão criadas: ' + g.join(', '));
    const gc = (await q(`select grade_comissao from profiles where id = $1`, [U.c1]))[0].grade_comissao;
    ok(gc === 'bronze', 'corretor começa na grade Bronze');
    await q(`update profiles set grade_comissao = 'ouro' where id = $1`, [U.c1]);
    await q(`update profiles set grade_comissao = 'externo' where id = $1`, [U.c2]);
    op = (await q(`select id from operators where nome = 'Bradesco Saúde'`))[0].id;
    prod = (await q(`insert into products(operator_id, nome, tipo) values ($1, 'Top Nacional PME', 'pme') returning id`, [op]))[0].id;
    const n = (await q(`select salvar_grade_produto($1, $2) r`, [prod, JSON.stringify([
      { beneficiario: 'corretora', parcela: 1, percentual: 200 }, { beneficiario: 'corretora', parcela: 2, percentual: 100 },
      { beneficiario: 'ouro', parcela: 1, percentual: 120 }, { beneficiario: 'ouro', parcela: 2, percentual: 50 },
      { beneficiario: 'prata', parcela: 1, percentual: 100 }, { beneficiario: 'bronze', parcela: 1, percentual: 80 },
      { beneficiario: 'externo', parcela: 1, percentual: 150 },
      { beneficiario: 'supervisor', parcela: 1, percentual: 10 },
    ])]))[0].r;
    ok(n === 8, 'grade do produto salva (8 valores)');
    await expectErr(q(`select salvar_grade_produto($1, '[{"beneficiario":"diamante","parcela":1,"percentual":10}]')`, [prod]), 'grade inexistente é recusada');
    await expectErr(q(`select salvar_grade_produto($1, '[{"beneficiario":"ouro","parcela":1,"percentual":10}]')`, [prod]), 'grade sem o valor da corretora é recusada');
    await expectErr(q(`select salvar_grade_produto($1, '[{"beneficiario":"corretora","parcela":4,"percentual":10}]')`, [prod]), 'grade com 4ª parcela é recusada (máximo 3)');
    await expectErr(q(`select importar_grade_comissao('[{"operadora":"Bradesco Saúde","produto":"Top Nacional PME","parcela":4,"valores":{"corretora":"10"}}]'::jsonb, false)`), 'importação com 4ª parcela é recusada');
    ok((await q(`select count(*)::int n from product_commission_grid where product_id = $1`, [prod]))[0].n === 8, 'grade anterior preservada após erro');
    op2prod = (await q(`insert into products(operator_id, nome) values ($1, 'Produto Zero') returning id`, [op]))[0].id;
    const vp = (await q(`select grade_parcelas from v_products where id = $1`, [prod]))[0];
    ok(Number(vp.grade_parcelas) === 2, 'v_products mostra 2 parcelas de grade');

    const imp = (await q(`select importar_grade_comissao($1, true) r`, [JSON.stringify([
      { operadora: 'Bradesco Saúde', produto: 'Top Nacional PME', parcela: 1, valores: { corretora: '210', ouro: '125', prata: '100', bronze: '80', externo: '150', supervisor: '10' } },
      { operadora: 'Bradesco Saúde', produto: 'Top Nacional PME', parcela: 2, valores: { corretora: '100', ouro: '50' } },
      { operadora: 'Operadora Nova', produto: 'Plano Novo', parcela: 1, valores: { corretora: '150', bronze: '70,5' } },
      { operadora: 'Inexistente', produto: '', parcela: 1, valores: { corretora: '1' } },
    ])]))[0].r;
    ok(imp.produtos === 2 && imp.criados === 1 && imp.valores === 10, `importação da grade: ${imp.produtos} produtos, ${imp.criados} criado, ${imp.valores} valores`);
    const pn = (await q(`select percentual from v_commission_grid where produto_nome = 'Plano Novo' and beneficiario = 'bronze'`))[0];
    ok(pn && Number(pn.percentual) === 70.5, 'importação aceita vírgula decimal e cria operadora/produto');
    const imp2 = (await q(`select importar_grade_comissao('[{"operadora":"X","produto":"Nao existe","parcela":1,"valores":{"corretora":"1"}}]'::jsonb, false) r`))[0].r;
    ok(imp2.nao_encontrados.length === 1 && imp2.produtos === 0, 'produto não encontrado é listado sem criar');
  });

  await as(U.c1, async () => {
    await expectErr(q(`update profiles set grade_comissao = 'externo' where id = $1`, [U.c1]), 'corretor não altera a própria grade');
    const g = await q(`select beneficiario from product_commission_grid where product_id = $1`, [prod]);
    ok(g.length === 2 && g.every(x => x.beneficiario === 'ouro'), 'corretor Ouro vê só a própria grade (não vê o que a corretora recebe)');
    await expectErr(q(`select salvar_grade_produto($1, '[]')`, [prod]), 'corretor não altera grade de produto');
    await expectErr(q(`insert into commission_grades(codigo, nome) values ('diamante', 'Diamante')`), 'corretor não cria grades');
  });
  await as(U.sup1, async () => {
    const g = (await q(`select beneficiario from product_commission_grid where product_id = $1`, [prod])).map(x => x.beneficiario);
    ok(g.length === 1 && g[0] === 'supervisor', 'supervisor vê só a linha do supervisor');
  });
  await as(U.ger1, async () => {
    ok((await q(`select * from product_commission_grid where product_id = $1`, [prod])).length >= 8, 'gerente com comissoes.ver vê a grade completa');
  });

  console.log('\n# v1.1 · Comissão calculada pela grade');
  let venda;
  await as(U.c1, async () => {
    const l = (await q(`insert into leads(nome, whatsapp, operator_id, product_id) values ('Empresa Grade', '11933330001', $1, $2) returning id`, [op, prod]))[0];
    venda = (await q(`select converter_em_cliente($1, '{"valor_mensal": 1000}') r`, [l.id]))[0].r;
    const mc = await q(`select * from minhas_comissoes() where sale_id = $1 order by parcela`, [venda.sale_id]);
    ok(mc.length === 2 && Number(mc[0].minha_comissao) === 1250 && Number(mc[1].minha_comissao) === 500,
      'corretor Ouro recebe 125% e 50% da mensalidade: ' + mc.map(x => x.minha_comissao).join(' / '));
  });
  await as(U.admin, async () => {
    const c = await q(`select parcela, comissao_prevista, comissao_corretor, comissao_supervisor, comissao_empresa, grade, origem_calculo from commissions where sale_id = $1 order by parcela`, [venda.sale_id]);
    ok(Number(c[0].comissao_prevista) === 2100 && Number(c[0].comissao_supervisor) === 100 && Number(c[0].comissao_empresa) === 750,
      'parcela 1: corretora recebe 2.100, supervisor 100, margem 750');
    ok(c.every(x => x.grade === 'ouro' && x.origem_calculo === 'grade'), 'comissão registra a grade e a origem do cálculo');
    const vc = (await q(`select grade_nome, produto_nome from v_commissions where sale_id = $1 limit 1`, [venda.sale_id]))[0];
    ok(vc.grade_nome === 'Ouro' && vc.produto_nome === 'Top Nacional PME', 'v_commissions mostra grade e produto');
  });
  await as(U.c2, async () => {
    const l = (await q(`insert into leads(nome, whatsapp, operator_id, product_id) values ('Externo SA', '11933330002', $1, $2) returning id`, [op, prod]))[0];
    const v = (await q(`select converter_em_cliente($1, '{"valor_mensal": 1000}') r`, [l.id]))[0].r;
    const mc = await q(`select * from minhas_comissoes() where sale_id = $1`, [v.sale_id]);
    ok(mc.length === 1 && mc[0].parcela === 1 && Number(mc[0].minha_comissao) === 1500,
      'corretor Externo recebe 150% na 1ª; a 2ª (sem valor) não aparece no painel dele');
    vendaExterno = v.sale_id;
  });

  await as(U.admin, async () => {
    const c = await q(`select parcela, comissao_corretor, comissao_prevista from commissions where sale_id = $1 order by parcela`, [vendaExterno]);
    ok(c.length === 2 && Number(c[1].comissao_corretor) === 0 && Number(c[1].comissao_prevista) > 0, 'a gestão continua vendo a 2ª parcela que a corretora recebe');
    const n = (await q(`select salvar_grade_produto($1, '[{"beneficiario":"corretora","parcela":1,"percentual":100},{"beneficiario":"ouro","parcela":1,"percentual":0},{"beneficiario":"prata","parcela":1,"percentual":"0,0"}]') r`, [op2prod]))[0].r;
    ok(n === 1, 'percentual zero não é gravado na grade (parcela sem valor)');
  });
  await as(U.c1, async () => {
    ok((await q(`select * from product_commission_grid where product_id = $1`, [op2prod])).length === 0, 'corretor não vê parcela sem valor na sua grade');
  });

  console.log('\n# v1.1 · Grade: exclusão');
  await as(U.admin, async () => {
    await expectErr(q(`select excluir_grade('externo', null)`), 'excluir grade com corretores exige destino');
    await q(`insert into commission_grades(codigo, nome, ordem) values ('diamante', 'Diamante', 0)`);
    await q(`update profiles set grade_comissao = 'diamante' where id = $1`, [U.c2]);
    await q(`select excluir_grade('diamante', 'prata')`);
    ok((await q(`select grade_comissao from profiles where id = $1`, [U.c2]))[0].grade_comissao === 'prata', 'grade excluída move corretores para a grade escolhida');
    await expectErr(q(`insert into commission_grades(codigo, nome) values ('corretora', 'X')`), 'código reservado não pode virar grade');
  });

  console.log('\n# v1.1 · Etapas e status do CRM editáveis');
  await as(U.admin, async () => {
    await q(`insert into pipeline_stages(codigo, nome, ordem, cor, grupo) values ('visita', 'Visita agendada', 4, '#123456', 'negociacao')`);
    const st = await q(`select codigo, etapa from lead_statuses where etapa = 'visita'`);
    ok(st.length === 1, 'etapa nova ganha um status automaticamente');
    const ps = (await q(`select tipo, status_padrao from pipeline_stages where codigo = 'visita'`))[0];
    ok(ps.tipo === 'aberto' && ps.status_padrao === st[0].codigo, 'tipo derivado do grupo e status padrão definido');
    await q(`update pipeline_stages set nome = 'Visita técnica', cor = '#654321' where codigo = 'visita'`);
    await q(`update leads set etapa = 'visita' where id = $1`, [leads.leadC1.id]);
    let l = (await q(`select etapa, status, temperatura from leads where id = $1`, [leads.leadC1.id]))[0];
    ok(l.etapa === 'visita' && l.status === st[0].codigo, 'lead movido para etapa personalizada');
    await expectErr(q(`update pipeline_stages set codigo = 'x' where codigo = 'visita'`), 'código da etapa não muda');
    await expectErr(q(`update pipeline_stages set grupo = 'atendimento' where codigo = 'aprovado'`), 'etapa do sistema não muda de grupo');
    await expectErr(q(`select excluir_etapa_crm('aprovado', 'contato')`), 'etapa do sistema não pode ser excluída');
    await expectErr(q(`update pipeline_stages set ativo = false where codigo = 'visita'`), 'não desativa etapa com leads');
    await expectErr(q(`select excluir_etapa_crm('visita', null)`), 'excluir etapa exige destino');
    const n = (await q(`select excluir_etapa_crm('visita', 'negociacao') r`))[0].r;
    l = (await q(`select etapa, status from leads where id = $1`, [leads.leadC1.id]))[0];
    ok(n === 1 && l.etapa === 'negociacao' && !(await q(`select 1 from pipeline_stages where codigo = 'visita'`)).length,
      'etapa excluída: lead e status transferidos para Negociação');
    ok((await q(`select 1 from lead_statuses where codigo = $1 and etapa = 'negociacao'`, [st[0].codigo])).length === 1, 'status da etapa excluída foi para a etapa destino');
    const h = await q(`select titulo from lead_history where lead_id = $1 and titulo like 'Etapa "%excluída%'`, [leads.leadC1.id]);
    ok(h.length === 1, 'timeline registra a exclusão da etapa');

    // status
    await q(`insert into lead_statuses(codigo, nome, etapa, ordem, cor) values ('aguardando_docs', 'Aguardando documentos', 'proposta', 30, '#999999')`);
    await q(`update leads set status = 'aguardando_docs' where id = $1`, [leads.leadC1.id]);
    ok((await q(`select etapa from leads where id = $1`, [leads.leadC1.id]))[0].etapa === 'proposta', 'status novo leva o lead para a etapa dele');
    await q(`update lead_statuses set etapa = 'negociacao' where codigo = 'aguardando_docs'`);
    ok((await q(`select etapa from leads where id = $1`, [leads.leadC1.id]))[0].etapa === 'negociacao', 'ao mudar a etapa do status, os leads acompanham');
    await expectErr(q(`update lead_statuses set etapa = 'contato' where codigo = 'novo'`), 'status do sistema não muda de etapa');
    await expectErr(q(`select excluir_status_lead('novo', 'contato_realizado')`), 'status do sistema não pode ser excluído');
    await expectErr(q(`select excluir_status_lead('aguardando_docs', null)`), 'excluir status com leads exige destino');
    await expectErr(q(`select excluir_status_lead('aguardando_docs', 'sem_interesse')`), 'destino que exige motivo de perda é recusado');
    const ns = (await q(`select excluir_status_lead('aguardando_docs', 'follow_up') r`))[0].r;
    ok(ns === 1 && (await q(`select status from leads where id = $1`, [leads.leadC1.id]))[0].status === 'follow_up', 'status excluído com lead transferido');
    const d = (await q(`select dashboard_metricas(current_date - 30, current_date) r`))[0].r;
    ok(Array.isArray(d.por_equipe) && d.atencao && typeof d.atencao.sla_atrasado === 'number', 'dashboard traz vendas por equipe e SLA atrasado');
  });
  await as(U.sup1, async () => {
    await expectErr(q(`select excluir_etapa_crm('contato', 'novos')`), 'supervisor não exclui etapas');
    const upd = await q(`update pipeline_stages set nome = 'x' where codigo = 'contato' returning codigo`);
    ok(upd.length === 0, 'supervisor não edita etapas');
  });

  console.log('\n# v1.1 · Etapas da implantação editáveis');
  await as(U.admin, async () => {
    const e = (await q(`select codigo from implementation_stages order by ordem`)).map(x => x.codigo);
    ok(e.includes('venda_realizada') && e.includes('implantado'), 'etapas da implantação cadastradas');
    await q(`insert into implementation_stages(codigo, nome, ordem, cor) values ('vistoria', 'Vistoria', 5, '#abcdef')`);
    const imp = (await q(`select id from implementations where sale_id = $1`, [venda.sale_id]))[0];
    await q(`select avancar_implantacao($1, 'vistoria', 'Aguardando vistoria', null)`, [imp.id]);
    ok((await q(`select etapa from implementations where id = $1`, [imp.id]))[0].etapa === 'vistoria', 'implantação usa etapa personalizada');
    ok((await q(`select etapa_nome from v_implementations where id = $1`, [imp.id]))[0].etapa_nome === 'Vistoria', 'v_implementations mostra nome da etapa');
    await expectErr(q(`select excluir_etapa_implantacao('implantado', 'vistoria')`), 'etapa do sistema da implantação não pode ser excluída');
    await expectErr(q(`update implementation_stages set status_venda = null where codigo = 'aprovado'`), 'etapa do sistema não muda o status da venda');
    await q(`update implementation_stages set nome = 'Vistoria médica' where codigo = 'vistoria'`);
    const n = (await q(`select excluir_etapa_implantacao('vistoria', 'documentacao') r`))[0].r;
    ok(n === 1 && (await q(`select etapa from implementations where id = $1`, [imp.id]))[0].etapa === 'documentacao', 'etapa excluída move as implantações');
    await q(`update implementation_stages set inicial = true where codigo = 'documentacao'`);
    ok((await q(`select count(*)::int n from implementation_stages where inicial`))[0].n === 1, 'apenas uma etapa inicial');
    await q(`update implementation_stages set inicial = false where codigo = 'documentacao'`);
    await q(`update implementation_stages set inicial = true where codigo = 'venda_realizada'`).catch(() => {});
  });

  console.log('\n# v1.1 · Agenda com convites e lembrete');
  let ev;
  await as(U.sup1, async () => {
    ev = (await q(`insert into events(titulo, tipo, inicio, fim, local, link_reuniao, lembrete_min, responsavel_id)
                   values ('Treinamento de produto', 'treinamento', now() + interval '20 minutes', now() + interval '80 minutes', 'Sala 1', 'https://meet.example/abc', 30, $1) returning id`, [U.sup1]))[0].id;
    const n = (await q(`select convidar_evento($1, $2) r`, [ev, `{${U.c1},${U.ger1}}`]))[0].r;
    ok(n === 2, 'supervisor convida corretor da equipe e o gerente');
    await expectErr(q(`select convidar_evento($1, $2)`, [ev, `{${U.c2}}`]), 'não convida corretor de outra equipe');
    ok((await q(`select convidados from v_events where id = $1`, [ev]))[0].convidados == 2, 'v_events conta os convidados');
  });
  await as(U.c1, async () => {
    const nt = await q(`select * from notifications where tipo = 'convite_evento' and ref_id = $1`, [ev]);
    ok(nt.length === 1, 'convidado recebe notificação do convite');
    const e = await q(`select titulo, minha_resposta from v_events where id = $1`, [ev]);
    ok(e.length === 1 && e[0].minha_resposta === 'pendente', 'convidado enxerga o compromisso na agenda');
    await q(`select responder_convite($1, 'aceito')`, [ev]);
    ok((await q(`select minha_resposta from v_events where id = $1`, [ev]))[0].minha_resposta === 'aceito', 'convidado confirma presença');
    ok((await q(`select * from v_event_participants where event_id = $1`, [ev])).length === 2, 'convidado vê a lista de participantes');
    await expectErr(q(`select convidar_evento($1, $2)`, [ev, `{${U.c2}}`]), 'convidado não convida outras pessoas');
    const upd = await q(`update events set titulo = 'x' where id = $1 returning id`, [ev]);
    ok(upd.length === 0, 'convidado não edita o compromisso');
    await expectErr(q(`insert into event_participants(event_id, usuario_id) values ($1, $2)`, [ev, U.c1]), 'inserção direta em participantes é bloqueada');
  });
  await as(U.c3, async () => {
    ok((await q(`select * from v_events where id = $1`, [ev])).length === 0, 'quem não foi convidado não vê o compromisso');
    await expectErr(q(`select responder_convite($1, 'aceito')`, [ev]), 'não convidado não responde');
  });
  await as(U.sup1, async () => {
    const nt = await q(`select titulo from notifications where tipo = 'resposta_convite' and ref_id = $1`, [ev]);
    ok(nt.length === 1 && /confirmou/.test(nt[0].titulo), 'organizador é avisado da confirmação');
  });
  await as(U.ger1, async () => { await q(`select responder_convite($1, 'recusado')`, [ev]); });
  await exec(`reset role;`);
  const r1 = (await q(`select processar_alertas_rapidos() r`))[0].r;
  ok(r1.eventos === 1, 'rotina dispara o lembrete do compromisso');
  const lemb = (await q(`select usuario_id from notifications where tipo = 'evento_proximo' and ref_id = $1`, [ev])).map(x => x.usuario_id);
  ok(lemb.includes(U.sup1) && lemb.includes(U.c1) && !lemb.includes(U.ger1), 'lembrete vai para organizador e convidados (menos quem recusou)');
  const r2 = (await q(`select processar_alertas_rapidos() r`))[0].r;
  ok(r2.eventos === 0, 'lembrete não é repetido');
  await as(U.sup1, async () => {
    await q(`update events set inicio = inicio + interval '1 day' where id = $1`, [ev]);
    ok((await q(`select lembrete_enviado_em from events where id = $1`, [ev]))[0].lembrete_enviado_em === null, 'mudar horário reinicia o lembrete');
    await q(`select remover_convidado($1, $2)`, [ev, U.ger1]);
    ok((await q(`select * from v_event_participants where event_id = $1`, [ev])).length === 1, 'organizador remove convidado');
  });
  await as(U.c1, async () => {
    ok((await q(`select * from notifications where tipo = 'evento_alterado' and ref_id = $1`, [ev])).length === 1, 'convidado avisado da mudança de horário');
  });
  await as(U.ger1, async () => {
    ok((await q(`select * from notifications where tipo = 'evento_cancelado' and ref_id = $1`, [ev])).length === 1, 'removido é avisado');
  });

  console.log('\n# v1.1 · Notificações de novo lead e SLA');
  let leadSla;
  await as(U.c1, async () => {
    leadSla = (await q(`insert into leads(nome, whatsapp) values ('Lead SLA', '11933330009') returning id`))[0].id;
  });
  await as(U.sup1, async () => {
    const n = await q(`select * from notifications where tipo = 'novo_lead' and ref_id = $1`, [leadSla]);
    ok(n.length === 1, 'supervisor é avisado quando entra lead na equipe');
  });
  await as(U.ger1, async () => {
    ok((await q(`select * from notifications where tipo = 'novo_lead' and ref_id = $1`, [leadSla])).length === 0, 'gerente não é avisado por padrão (configurável)');
  });
  await exec(`reset role;`);
  await q(`update leads set assigned_at = now() - interval '7 minutes' where id = $1`, [leadSla]);
  let r = (await q(`select processar_alertas_rapidos() r`))[0].r;
  let notif = await q(`select usuario_id, titulo from notifications where tipo = 'sla_atrasado' and ref_id = $1`, [leadSla]);
  ok(r.sla >= 1 && notif.length === 1 && notif[0].usuario_id === U.c1, 'SLA meta 1: corretor avisado');
  await q(`update leads set assigned_at = now() - interval '20 minutes' where id = $1`, [leadSla]);
  await q(`select processar_alertas_rapidos()`);
  notif = await q(`select usuario_id from notifications where tipo = 'sla_atrasado' and ref_id = $1`, [leadSla]);
  ok(notif.length === 2 && notif.some(x => x.usuario_id === U.sup1), 'SLA meta 2: supervisor avisado');
  await q(`select processar_alertas_rapidos()`);
  ok((await q(`select count(*)::int n from notifications where tipo = 'sla_atrasado' and ref_id = $1`, [leadSla]))[0].n === 2, 'alerta de SLA não se repete');
  await as(U.c1, async () => {
    await expectErr(q(`select processar_alertas_rapidos()`), 'usuário comum não executa a rotina');
  });
  await as(U.admin, async () => {
    await q(`update settings set valor = valor || '{"novo_lead_gerente":true}' where chave = 'notificacoes'`);
  });
  await as(U.c1, async () => { await q(`insert into leads(nome, whatsapp) values ('Lead Ger', '11933330010')`); });
  await as(U.ger1, async () => {
    ok((await q(`select * from notifications where tipo = 'novo_lead' and titulo = 'Novo lead na estrutura'`)).length === 1, 'com o parâmetro ligado o gerente também é avisado');
  });

  console.log('\n# v1.1 · Quem está online');
  await as(U.c1, async () => { await q(`select registrar_presenca('Leads', 'Chrome')`); });
  await as(U.c3, async () => { await q(`select registrar_presenca('CRM', 'Celular')`); });
  await as(U.c4, async () => { await q(`select registrar_presenca('Agenda', null)`); await q(`select registrar_saida()`); });
  await as(U.ger1, async () => {
    const p = await q(`select id, situacao, tela from v_presence`);
    const c1 = p.find(x => x.id === U.c1), c3 = p.find(x => x.id === U.c3);
    ok(c1 && c1.situacao === 'online' && c1.tela === 'Leads' && c3 && c3.situacao === 'online', 'gerente vê os corretores online da estrutura');
    ok(!p.find(x => x.id === U.c4), 'gerente não vê presença de outra estrutura');
  });
  await as(U.sup1, async () => {
    const p = await q(`select id, situacao from v_presence where situacao = 'online'`);
    ok(p.some(x => x.id === U.c1) && !p.some(x => x.id === U.c3), 'supervisor vê só a própria equipe online');
  });
  await as(U.c1, async () => {
    const p = await q(`select usuario_id from user_presence`);
    ok(p.length === 1 && p[0].usuario_id === U.c1, 'corretor vê apenas a própria presença');
    await expectErr(q(`insert into user_presence(usuario_id) values ($1)`, [U.c2]), 'presença não pode ser forjada');
  });
  await as(U.ger2, async () => {
    const p = await q(`select id, situacao from v_presence where id = $1`, [U.c4]);
    ok(p.length === 1 && p[0].situacao === 'offline', 'saída registrada deixa o usuário offline');
  });
  await as(U.pend, async () => {
    await q(`select registrar_presenca('x', null)`);
    ok((await q(`select * from user_presence`)).length === 0, 'usuário pendente não registra presença');
  });

  console.log('\n# v1.1 · Ranking e vendas por equipe');
  await as(U.ger1, async () => {
    const d = (await q(`select desempenho_corretores(current_date - 30, current_date) r`))[0].r;
    const lista = Array.isArray(d) ? d : (d.corretores || d.lista || []);
    ok(lista.length >= 3 && lista.every(x => 'grade' in x && 'gerente' in x), 'desempenho traz grade e gerente de cada corretor');
    const m = (await q(`select dashboard_metricas(current_date - 30, current_date) r`))[0].r;
    ok(m.por_equipe.length >= 1 && m.por_equipe.every(x => 'valor' in x), 'dashboard do gerente tem vendas por equipe');
    const ic = (await q(`select inteligencia_comercial(current_date - 30, current_date) r`))[0].r;
    ok(ic && typeof ic === 'object', 'inteligência comercial executa com etapas por grupo');
  });
  await as(U.c1, async () => {
    const m = (await q(`select dashboard_metricas(current_date - 30, current_date) r`))[0].r;
    ok(m.por_equipe.every(x => x.team_id === null || x.equipe || true), 'corretor recebe o dashboard sem erro');
  });

  console.log('\n# v1.2 · Parcelas em ordem');
  await as(U.c1, async () => {
    const mc = await q(`select sale_id, parcela from minhas_comissoes()`);
    const porVenda = {}; mc.forEach((x, i) => { (porVenda[x.sale_id] = porVenda[x.sale_id] || []).push(x.parcela); });
    ok(Object.values(porVenda).every(a => a.every((v, i) => i === 0 || v > a[i - 1])), 'minhas comissões: 1ª, 2ª, 3ª parcela em ordem');
  });

  console.log('\n# v1.2 · Relacionamento (aniversário e manter contato)');
  let cli3, dep3;
  await exec(`reset role;`);
  cli3 = (await q(`select id from clients where corretor_id = $1 limit 1`, [U.c3]))[0].id;
  dep3 = (await q(`select id from dependents where client_id = $1 limit 1`, [cli3]))[0].id;
  await exec(`set session_replication_role = replica;`);   // ignora o carimbo para simular cliente antigo
  await q(`update clients set data_nascimento = (private.hoje_sp() - interval '40 years')::date, created_at = now() - interval '120 days', status = 'ativo' where id = $1`, [cli3]);
  await exec(`set session_replication_role = origin;`);
  await q(`update dependents set data_nascimento = (private.hoje_sp() - interval '9 years')::date where id = $1`, [dep3]);
  await as(U.c3, async () => {
    const r = await q(`select dias_para_aniversario, idade_no_aniversario, dias_sem_contato from v_relacionamento where id = $1`, [cli3]);
    ok(r.length === 1 && r[0].dias_para_aniversario === 0 && r[0].idade_no_aniversario === 40 && r[0].dias_sem_contato >= 100, 'v_relacionamento: aniversário hoje, 40 anos e dias sem contato');
    ok((await q(`select * from v_aniversarios_dependentes where id = $1`, [dep3])).length === 1, 'aniversário do dependente listado');
    await expectErr(q(`select executar_lembretes_relacionamento()`), 'corretor não executa a rotina de relacionamento');
  });
  await as(U.c1, async () => {
    ok((await q(`select * from v_relacionamento where id = $1`, [cli3])).length === 0, 'corretor não vê clientes de outra carteira no relacionamento');
  });
  await as(U.admin, async () => {
    const r = (await q(`select executar_lembretes_relacionamento() r`))[0].r;
    ok(r.aniversarios >= 1 && r.dependentes >= 1 && r.contato >= 1, `rotina gera lembretes: ${r.aniversarios} aniversário(s), ${r.dependentes} dependente(s), ${r.contato} contato(s)`);
    const r2 = (await q(`select executar_lembretes_relacionamento() r`))[0].r;
    ok(r2.aniversarios === 0 && r2.dependentes === 0, 'lembrete de aniversário não se repete no mesmo ano');
  });
  await as(U.c3, async () => {
    const n = await q(`select tipo, link from notifications where ref_id = $1 and tipo in ('aniversario','manter_contato')`, [cli3]);
    ok(n.some(x => x.tipo === 'aniversario' && /msg=aniversario$/.test(x.link)) && n.some(x => /msg=aniversario_dependente/.test(x.link)) && n.some(x => x.tipo === 'manter_contato'),
      'corretor responsável recebe os lembretes com link para a mensagem pronta');
    await q(`select registrar_atividade(null, 'whatsapp', true, 'mensagem_relacionamento', 'Parabéns enviado', $1)`, [cli3]);
    ok((await q(`select dias_sem_contato from v_relacionamento where id = $1`, [cli3]))[0].dias_sem_contato === 0, 'mensagem enviada registra o contato');
  });

  console.log('\n# v1.2 · Ranking e logotipo das equipes');
  await as(U.admin, async () => {
    await q(`update teams set logo = 'data:image/png;base64,AAAA', cor = '#E3B341' where nome = 'Equipe Alfa'`);
    const t = (await q(`select logo, cor from v_teams where nome = 'Equipe Alfa'`))[0];
    ok(t.logo && t.cor === '#E3B341', 'administrador define logotipo e cor da equipe');
  });
  await as(U.sup1, async () => {
    const u = await q(`update teams set logo = 'x' where nome = 'Equipe Alfa' returning id`);
    ok(u.length === 0, 'supervisor não altera o logotipo');
  });
  await as(U.c1, async () => {
    const r = (await q(`select ranking_comercial(current_date - 60, current_date) r`))[0].r;
    ok(r.length >= 4 && r.some(x => x.eu) && r.every(x => x.grade === null), 'ranking da empresa visível ao corretor, sem expor grade de comissão');
    ok(r.find(x => x.equipe === 'Equipe Alfa').equipe_logo, 'ranking traz o logotipo da equipe');
  });
  await as(U.ger1, async () => {
    const r = (await q(`select ranking_comercial(current_date - 60, current_date) r`))[0].r;
    ok(r.some(x => x.grade), 'gestor vê a grade dos corretores da estrutura no ranking');
  });
  await as(U.admin, async () => { await q(`update settings set valor = '{"visibilidade":"hierarquia"}' where chave = 'ranking'`); });
  await as(U.c1, async () => {
    const r = (await q(`select ranking_comercial(current_date - 60, current_date) r`))[0].r;
    ok(r.length === 1 && r[0].eu, 'com visibilidade "hierarquia" o corretor vê só a própria linha');
  });
  await as(U.pend, async () => {
    ok((await q(`select ranking_comercial(current_date - 60, current_date) r`))[0].r.length === 0, 'usuário pendente não vê ranking');
  });

  console.log('\n# v1.3 · CRM integrado à implantação');
  await as(U.c1, async () => {
    const l = (await q(`insert into leads(nome, whatsapp, status) values ('Fluxo Integrado', '11933339999', 'negociacao') returning id`))[0];
    const r = (await q(`select converter_em_cliente($1, '{"valor_mensal": 800, "status": "proposta_enviada"}') r`, [l.id]))[0].r;
    ok(r.implantacao_etapa === 'venda_realizada', 'lead aprovado entra na etapa inicial da implantação (Venda realizada)');
    let v = (await q(`select etapa, etapa_grupo, implantacao_id, implantacao_etapa, implantacao_etapa_nome, implantacao_sale_id from v_leads where id = $1`, [l.id]))[0];
    ok(v.etapa === 'aprovado' && v.etapa_grupo === 'ganho', 'lead vai para a etapa "Aprovado" do CRM');
    ok(v.implantacao_etapa === 'venda_realizada' && v.implantacao_etapa_nome === 'Venda realizada' && v.implantacao_sale_id === r.sale_id, 'CRM mostra a etapa da implantação do lead');
    ok((await q(`select count(*)::int n from minhas_comissoes() where sale_id = $1`, [r.sale_id]))[0].n === 0, 'comissão só nasce quando a operadora aprova');
    const dm = (await q(`select dashboard_metricas(current_date - 30, current_date, '{}') r`))[0].r;
    ok(dm.cards.vendas_em_implantacao >= 1 && typeof dm.atencao.implantacoes_paradas === 'number', 'dashboard conta vendas em implantação e implantações paradas');
    const ic = (await q(`select inteligencia_comercial(current_date - 30, current_date) r`))[0].r;
    ok(Array.isArray(ic.implantacoes_paradas), 'inteligência lista implantações sem movimentação');
    await q(`select avancar_implantacao($1, 'aprovado')`, [v.implantacao_id]);
    ok((await q(`select status from sales where id = $1`, [r.sale_id]))[0].status === 'aprovada', 'implantação "Aprovado" aprova a venda');
    ok((await q(`select count(*)::int n from minhas_comissoes() where sale_id = $1`, [r.sale_id]))[0].n >= 1, 'comissões geradas na aprovação da operadora');
    await q(`select avancar_implantacao($1, 'implantado')`, [v.implantacao_id]);
    v = (await q(`select etapa, implantacao_etapa from v_leads where id = $1`, [l.id]))[0];
    ok(v.etapa === 'implantado' && v.implantacao_etapa === 'implantado', 'implantação concluída leva o lead para "Implantado" no CRM');
    const h = await q(`select descricao from lead_history where lead_id = $1 and titulo = 'Lead convertido em cliente'`, [l.id]);
    ok(h.length === 1 && /implantação/.test(h[0].descricao), 'timeline registra o envio para a implantação');
  });
  console.log('\n# v1.4 · Fuso de São Paulo e link de reunião seguro');
  await as(U.c3, async () => {
    // contato registrado às 23h30 de São Paulo (02h30 UTC do dia seguinte) continua sendo "hoje"
    const cli = (await q(`select id from v_relacionamento where corretor_id = $1 limit 1`, [U.c3]))[0].id;
    await q(`insert into activities(client_id, tipo, efetivo, realizado_em) values ($1, 'whatsapp', true, (private.hoje_sp() + time '23:30') at time zone 'America/Sao_Paulo')`, [cli]);
    ok((await q(`select dias_sem_contato from v_relacionamento where id = $1`, [cli]))[0].dias_sem_contato === 0, 'contato às 23h30 (horário de Brasília) conta como hoje');
    await expectErr(q(`insert into events(titulo, tipo, inicio, link_reuniao) values ('Reunião', 'reuniao', now() + interval '1 day', 'javascript:alert(1)')`), 'link de reunião "javascript:" é recusado');
    const ev = (await q(`insert into events(titulo, tipo, inicio, link_reuniao) values ('Reunião', 'reuniao', now() + interval '1 day', 'https://meet.google.com/abc-defg-hij') returning id`))[0];
    ok(!!ev.id, 'link de reunião https aceito');
  });
  const dv = (await q(`select column_default d from information_schema.columns where table_name = 'sales' and column_name = 'data_venda'`))[0].d;
  ok(/hoje_sp/.test(dv), 'data da venda padrão no fuso de São Paulo');
}
