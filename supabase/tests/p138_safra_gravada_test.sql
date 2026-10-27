-- P138 — a SAFRA DA COMPETENCIA e' uma regra so', a do banco (`_fn_safra_da_competencia`), gravada na CRIACAO de todo lancamento que chega
-- sem safra (`trg_safra_da_competencia`). Termina em RAISE 'OK'. Transacao revertida. Fixture SINTETICO no cliente Teste (43f32d07): duas
-- safras de pecuaria criadas aqui; roda como `authenticated` (claims de um admin real), como a tela grava. FALHA ANTES DO CONSERTO (S1 e S2).
--   S1 parcelamento como o "+ Da nota" grava (payload sem safra, pecuaria, competencia dentro da safra): as N parcelas com a safra da competencia
--   S2 lancamento avulso de pecuaria criado sem safra: grava a safra da competencia
--   S3 administrativo: segue sem safra
--   S4 safra ESCOLHIDA (outra do mesmo escopo) na criacao: fica a escolhida
--   S5 EDICAO de um gravado sem safra (mudando a competencia): o banco NAO preenche (na edicao a safra e' do operador: "Usar")
--   S6 competencia fora de qualquer safra: segue sem safra
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '50s';
DO $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_adm uuid; v_molde jsonb; v_cols text; v_pec uuid := gen_random_uuid(); v_pec_ant uuid := gen_random_uuid();
  v_plano_pec uuid; v_plano_adm uuid; v_n int; v_id uuid; v_d uuid;
begin
  select id into v_adm from auth.users u where public.is_admin_agroinblue(u.id) limit 1;
  insert into public.financeiro_safras (id, cliente_id, nome, codigo, ativa, escopo_negocio, data_inicio, data_fim)
  values (v_pec, c_cli, 'Safra 26/27 Pecuária (P138 sintética)', '26/27-Pec', true, 'pecuaria', '2026-07-01', '2027-06-30'),
         (v_pec_ant, c_cli, 'Safra 25/26 Pecuária (P138 sintética)', '25/26-Pec', true, 'pecuaria', '2025-07-01', '2026-06-30');
  select id into v_plano_pec from public.financeiro_plano_contas p
   where (p.cliente_id is null or p.cliente_id = c_cli) and p.escopo_negocio = 'pecuaria' and p.tipo_operacao like '2-%' and coalesce(p.ativo, true)
   order by p.cliente_id nulls last limit 1;
  select id into v_plano_adm from public.financeiro_plano_contas p
   where (p.cliente_id is null or p.cliente_id = c_cli) and p.escopo_negocio = 'administrativo' and p.tipo_operacao like '2-%' and coalesce(p.ativo, true)
   order by p.cliente_id nulls last limit 1;
  select to_jsonb(l) into v_molde from public.financeiro_lancamentos_v2 l where l.cliente_id = c_cli and l.conta_bancaria_id is not null
   order by l.created_at desc limit 1;
  if v_adm is null or v_plano_pec is null or v_plano_adm is null or v_molde is null then raise exception 'fixture incompleto'; end if;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols from pg_attribute
   where attrelid = 'public.financeiro_lancamentos_v2'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  v_molde := v_molde || jsonb_build_object('hash_importacao', null, 'lote_importacao_id', null, 'safra_id', null, 'cultura', null, 'fase', null,
    'tipo_operacao', '2-Saídas', 'cancelado', false, 'cenario', 'realizado', 'status_transacao', 'programado', 'data_pagamento', null,
    'recorrencia_id', null, 'financiamento_id', null, 'origem_lancamento', 'manual', 'origem_tipo', null,
    'fazenda_id', (select f.id from public.fazendas f where f.cliente_id = c_cli limit 1));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);

  -- S1
  perform public.fn_parcelamento_cadastrar(jsonb_build_object(
    'cliente_id', c_cli, 'fazenda_id', v_molde->>'fazenda_id', 'descricao', 'P138 S1 sintetico', 'valor_total', 2689.51, 'total_parcelas', 6,
    'data_primeira_parcela', '2026-10-16', 'data_competencia', '2026-09-22', 'tipo_operacao', '2-Saídas',
    'plano_conta_id', v_plano_pec, 'conta_bancaria_id', v_molde->>'conta_bancaria_id', 'tipo_financiamento', 'compra_parcelada'));
  select count(*) into v_n from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao like 'P138 S1 sintetico%' and safra_id = v_pec;
  if v_n <> 6 then raise exception 'S1 % de 6 parcelas com a safra da competencia', v_n; end if;

  -- S2
  v_id := gen_random_uuid();
  execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)', v_cols, v_cols)
    using v_molde || jsonb_build_object('id', v_id, 'plano_conta_id', v_plano_pec, 'data_competencia', '2026-09-22', 'data_vencimento', '2026-10-22', 'descricao', 'P138 S2');
  select safra_id into v_d from public.financeiro_lancamentos_v2 where id = v_id;
  if v_d is distinct from v_pec then raise exception 'S2 avulso gravou safra %', coalesce(v_d::text, 'nula'); end if;

  -- S3
  execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)', v_cols, v_cols)
    using v_molde || jsonb_build_object('id', gen_random_uuid(), 'plano_conta_id', v_plano_adm, 'data_competencia', '2026-09-22', 'data_vencimento', '2026-10-22', 'descricao', 'P138 S3');
  if exists (select 1 from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao = 'P138 S3' and safra_id is not null)
    then raise exception 'S3 administrativo ganhou safra'; end if;

  -- S4
  execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)', v_cols, v_cols)
    using v_molde || jsonb_build_object('id', gen_random_uuid(), 'plano_conta_id', v_plano_pec, 'data_competencia', '2026-09-22', 'data_vencimento', '2026-10-22',
      'descricao', 'P138 S4', 'safra_id', v_pec_ant);
  if (select safra_id from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao = 'P138 S4') is distinct from v_pec_ant
    then raise exception 'S4 a escolhida nao ficou'; end if;

  -- S5
  update public.financeiro_lancamentos_v2 set safra_id = null where id = v_id;
  update public.financeiro_lancamentos_v2 set data_competencia = '2026-09-23' where id = v_id;
  if (select safra_id from public.financeiro_lancamentos_v2 where id = v_id) is not null then raise exception 'S5 a edicao preencheu a safra'; end if;

  -- S6
  execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)', v_cols, v_cols)
    using v_molde || jsonb_build_object('id', gen_random_uuid(), 'plano_conta_id', v_plano_pec, 'data_competencia', '2024-09-22', 'data_vencimento', '2024-10-22', 'descricao', 'P138 S6');
  if exists (select 1 from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao = 'P138 S6' and safra_id is not null)
    then raise exception 'S6 ganhou safra fora do periodo'; end if;

  raise exception 'OK p138 (S1 S2 S3 S4 S5 S6)';
end $teste$;
ROLLBACK;
