-- FORN-MESCLAR-02a — o gatilho dos lancamentos nao revalida o que ninguem mexeu (chave numa conta INATIVA inclusive); reativar revalida.
--   C0 a mesclagem REAL do grupo Pontero (Vera), so' em simulacao: sem recusa
--   C1 mesclagem sintetica no Teste com lancamento cancelado ligado a conta inativa: sem recusa; chave e subcentro do lancamento intactos
--   C2 editar outro campo (descricao) desse lancamento: passa, sem mexer em chave nem subcentro
--   C3 trocar o subcentro para um inexistente: continua recusado (check_violation)
--   C4 reativar o lancamento ligado a conta inativa: recusado (check_violation)
-- O lancamento sintetico nasce com os gatilhos desligados SO' no INSERT (session_replication_role), porque hoje o gatilho recusa a
-- chave inativa no INSERT — e' o estado que os 58 legados tem. Termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '30s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  inativa uuid; sub_inativo text; fica uuid; sai uuid; l uuid; r jsonb; ok boolean; v record;
BEGIN
  r := public.fn_fornecedor_mesclar('23c3a168-65b2-496f-9a8f-42a0a37a045c'::uuid, array['6d64046a-feb3-4029-b31f-693fd3929b96'::uuid], true);
  if r->'recusa' is not null and r->>'recusa' <> 'null' then raise exception 'C0 Pontero recusado: %', r->'recusa'; end if;
  if (r->>'total')::int < 1 then raise exception 'C0 Pontero sem movimento: %', r; end if;

  select id, subcentro into inativa, sub_inativo from public.financeiro_plano_contas
   where ativo = false and cliente_id is null and tipo_operacao = '2-Saídas' order by subcentro limit 1;
  if inativa is null then raise exception 'C1 sem conta inativa de molde'; end if;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT 02a fica', true) returning id into fica;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT 02a sai', true) returning id into sai;
  set local session_replication_role = replica;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, status_transacao,
    favorecido_id, conta_bancaria_id, descricao, cenario, origem_lancamento, cancelado, plano_conta_id, subcentro)
  values (k, fz, '2-Saídas', 10, -1, date '2026-09-01', 'previsto', sai, cta, 'SINT 02a', 'realizado', 'manual', true, inativa, sub_inativo)
  returning id into l;
  set local session_replication_role = origin;

  r := public.fn_fornecedor_mesclar(fica, array[sai], true);
  if r->'recusa' is not null and r->>'recusa' <> 'null' then raise exception 'C1 recusado: %', r->'recusa'; end if;
  if (r->'por_modulo'->>'Financeiro')::int is distinct from 1 then raise exception 'C1 movidos: %', r; end if;
  select plano_conta_id, subcentro, favorecido_id into v from public.financeiro_lancamentos_v2 where id = l;
  if v.plano_conta_id is distinct from inativa or v.subcentro is distinct from sub_inativo or v.favorecido_id is distinct from sai
    then raise exception 'C1 a simulacao mexeu: %', row_to_json(v); end if;

  update public.financeiro_lancamentos_v2 set descricao = 'SINT 02a editado' where id = l;
  select plano_conta_id, subcentro into v from public.financeiro_lancamentos_v2 where id = l;
  if v.plano_conta_id is distinct from inativa or v.subcentro is distinct from sub_inativo then raise exception 'C2 mexeu: %', row_to_json(v); end if;

  ok := false;
  begin update public.financeiro_lancamentos_v2 set subcentro = 'SINT subcentro que nao existe', plano_conta_id = null where id = l;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'C3 aceitou subcentro inexistente'; end if;

  ok := false;
  begin update public.financeiro_lancamentos_v2 set cancelado = false where id = l;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'C4 reativou com conta inativa'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
