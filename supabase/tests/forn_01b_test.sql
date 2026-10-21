-- FORN-01b — a lista de Fornecedores e a aba "Sem cadastro" so' com o que e' real; os consertos de dado do Gabriel (21/10).
-- Roda como `postgres`, DEPOIS da migration 20261028110000, e TERMINA EM RAISE: nada fica no banco. Sucesso = a excecao final
-- comeca com "OK". Fixtures sinteticos no cliente Teste (43f32d07); T2/T3/T5 conferem o DADO REAL do proto (so' leitura).
-- T1 Sem cadastro: entra o realizado de extrato; NAO entram a Meta, o gerado pelo sistema (origem_tipo) nem a descricao digitada (manual).
-- T2 o lancamento 792c02d0 (Meta que tinha virado previsto) esta' cancelado, com o motivo do Gabriel e a trilha "cancelou".
-- T3 a deducao de abate fa242c27 (realizada, sem fornecedor) tem o comprador daquele abate (8bc01e51) e a trilha "editou".
-- T4 Lista: "Lanç." conta so' o realizado vivo; "Último uso" e' o ultimo realizado ate' hoje (o previsto futuro e a Meta nao contam).
-- T5 deducao automatica: toda deducao viva da OC tem o comprador da OC; nenhuma deducao de abate realizada viva sem favorecido.
-- T6 editar o CPF/CNPJ de um ATIVO com um INATIVO de mesmo documento: o banco grava (nao ha trava de documento no cadastro).
-- T7 Mesclar: o mesclado como absorvido e' recusado pelo banco (por isso a tela troca pelo dono); o inativo com lancamentos e' unido a
--    um ativo (a simulacao passa).
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create function pg_temp.forn(p_nome text, p_ativo boolean default true, p_doc text default null) returns uuid language sql as $f$
  insert into financeiro_fornecedores (cliente_id, nome, ativo, cpf_cnpj) values ('43f32d07-dba8-4670-900c-bf645440c04a', p_nome, p_ativo, p_doc) returning id $f$;
create function pg_temp.lan(p_desc text, p_forn uuid default null, p_cenario text default 'realizado', p_origem text default 'extrato',
    p_origem_tipo text default null, p_venc date default '2026-09-10', p_pgto date default null) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor,
      sinal, tipo_operacao, status_transacao, descricao, favorecido_id, cenario, origem_lancamento, origem_tipo)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
      p_venc, p_venc, p_pgto, 100, '-1', '2-Saídas', case when p_pgto is null then 'programado' else 'realizado' end, p_desc, p_forn, p_cenario,
      p_origem, p_origem_tipo)
  returning id $f$;

do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  a uuid; b uuid; ina uuid; dono uuid; mesc uuid; v jsonb; r jsonb; n int; t text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);

  -- T1
  perform pg_temp.lan('SINT F1B Extrato Real');
  perform pg_temp.lan('SINT F1B Meta', null, 'meta');
  perform pg_temp.lan('SINT F1B Consumo 001 Vacas', null, 'realizado', 'movimentacao_rebanho', 'consumo_rebanho');
  perform pg_temp.lan('SINT F1B Deducao Abate', null, 'realizado', 'movimentacao_rebanho', 'abate:deducao');
  perform pg_temp.lan('SINT F1B Digitado', null, 'realizado', 'manual');
  perform pg_temp.lan('SINT F1B Importado', null, 'realizado', 'importacao_incremental');
  select string_agg(b.texto, ',' order by b.texto) into t from public._fn_sem_cadastro_base(c_cli) b where b.texto like 'SINT F1B %';
  if t is distinct from 'SINT F1B Extrato Real,SINT F1B Importado' then raise exception 'T1 base: %', t; end if;
  v := public.fn_fornecedor_sem_cadastro(c_cli);
  select count(*) into n from jsonb_array_elements(v->'textos') x where x->>'texto' like 'SINT F1B %';
  if n <> 2 then raise exception 'T1 aba: % textos', n; end if;

  -- T2
  select count(*) into n from financeiro_lancamentos_v2
   where id = '792c02d0-e683-40f1-9e68-61c836aa5e24' and cancelado and cancelado_motivo = 'Meta não gera financeiro (Gabriel 21/10)';
  if n <> 1 then raise exception 'T2 792c02d0 nao cancelado com o motivo'; end if;
  if not exists (select 1 from audit_log where registro_id = '792c02d0-e683-40f1-9e68-61c836aa5e24' and acao = 'cancelou') then
    raise exception 'T2 sem trilha'; end if;

  -- T3
  if (select favorecido_id from financeiro_lancamentos_v2 where id = 'fa242c27-ef94-4def-b67d-cf3b12920bb1')
     is distinct from '8bc01e51-ec3c-423a-8bdf-37ebcd854a5c'::uuid then raise exception 'T3 fa242c27 sem o comprador 8bc01e51'; end if;
  if (select favorecido_id from financeiro_lancamentos_v2 where id = 'fa242c27-ef94-4def-b67d-cf3b12920bb1')
     is distinct from (select m.fornecedor_id from financeiro_lancamentos_v2 l join lancamentos m on m.id = l.movimentacao_rebanho_id
                        where l.id = 'fa242c27-ef94-4def-b67d-cf3b12920bb1') then raise exception 'T3 favorecido nao e'' o comprador do abate'; end if;
  if not exists (select 1 from audit_log where registro_id = 'fa242c27-ef94-4def-b67d-cf3b12920bb1' and acao = 'editou'
                   and dados_novos->>'favorecido_id' = '8bc01e51-ec3c-423a-8bdf-37ebcd854a5c') then raise exception 'T3 sem trilha'; end if;

  -- T4
  a := pg_temp.forn('SINT F1B Uso Real');
  perform pg_temp.lan('SINT F1B u1', a, 'realizado', 'extrato', null, '2026-09-01', '2026-09-03');
  perform pg_temp.lan('SINT F1B u2', a, 'realizado', 'extrato', null, (v_hoje + 200));
  perform pg_temp.lan('SINT F1B u3', a, 'meta', 'extrato', null, (v_hoje - 5));
  v := public.fn_fornecedor_lista(c_cli, 'SINT F1B Uso Real', 'ativos');
  if (v->'itens'->0->>'lancamentos')::int <> 2 then raise exception 'T4 lancamentos: %', v->'itens'->0->>'lancamentos'; end if;
  if v->'itens'->0->>'ultimo_uso' is distinct from '2026-09-03' then raise exception 'T4 ultimo uso: %', v->'itens'->0->>'ultimo_uso'; end if;
  select count(*) into n from financeiro_fornecedores f where f.cliente_id = c_cli and exists (
    select 1 from jsonb_array_elements(public.fn_fornecedor_lista(c_cli, null, 'todos', null, 'ultimo_uso', true, 5)->'itens') i
     where (i->>'ultimo_uso')::date > v_hoje);
  if n > 0 then raise exception 'T4 data futura no Último uso'; end if;

  -- T5
  select count(*) into n from financeiro_lancamentos_v2 l
    join zoo_operacao_partes pt on pt.financeiro_lancamento_id = l.id and pt.cancelada = false
    join zoo_operacoes_comerciais o on o.id = pt.operacao_id
   where l.origem_tipo like 'oc:deducao:%' and l.cancelado is not true and l.favorecido_id is distinct from o.contraparte_id;
  if n > 0 then raise exception 'T5 % deducao(oes) da OC sem o comprador', n; end if;
  select count(*) into n from financeiro_lancamentos_v2
   where origem_tipo = 'abate:deducao' and cenario = 'realizado' and cancelado is not true and favorecido_id is null
     and descricao not like 'SINT F1B %';
  if n > 0 then raise exception 'T5 % deducao(oes) de abate realizadas sem favorecido', n; end if;

  -- T6
  ina := pg_temp.forn('SINT F1B Homonimo Inativo', false, '54.442.418/0001-88');
  b := pg_temp.forn('SINT F1B Ativo Doc');
  update financeiro_fornecedores set cpf_cnpj = '54.442.418/0001-88' where id = b;
  if (select cpf_cnpj from financeiro_fornecedores where id = b) is distinct from '54.442.418/0001-88' then raise exception 'T6 nao gravou'; end if;

  -- T7
  dono := pg_temp.forn('SINT F1B Dono');
  mesc := pg_temp.forn('SINT F1B Mesclado', false);
  update financeiro_fornecedores set fundido_em_id = dono, fundido_em = now() where id = mesc;
  r := public.fn_fornecedor_mesclar(b, array[mesc], true, '{}'::jsonb);
  if r->'recusa' is null then raise exception 'T7 o banco aceitou absorver um mesclado: %', r; end if;
  perform pg_temp.lan('SINT F1B l-ina', ina, 'realizado', 'extrato', null, '2026-08-01', '2026-08-02');
  r := public.fn_fornecedor_mesclar(b, array[ina], true, '{}'::jsonb);
  if r->'recusa' is not null and r->'recusa' <> 'null'::jsonb then raise exception 'T7 inativo com lancamentos recusado: %', r->'recusa'; end if;

  raise exception 'OK forn_01b (T1–T7)';
end $teste$;
rollback;
