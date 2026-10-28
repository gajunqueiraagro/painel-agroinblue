-- P138 (depois da 20261028112480) — o backfill da safra, com backup e DESFAZER. Termina em RAISE 'OK'. Transacao revertida.
-- Fixture SINTETICO no cliente Teste (43f32d07): uma safra de pecuaria criada aqui e quatro lancamentos sem safra (comum, financiamento,
-- consorcio, o excluido; o cliente Teste pode ter outros sem safra: conferidos pelo total do backup) — criados com safra e depois zerados (a edicao nao repoe: o gatilho do P138 so' preenche na criacao).
--   B1 simular: devolve as contagens e NADA muda (md5 das safras do cliente igual; nenhum backup)
--   B2 aplicar (excluindo 1 id): o comum, o de financiamento e o de consorcio recebem a safra da competencia (Gabriel 17:2x: financiamento
--      tambem); o excluido segue sem; o backup tem cada um
--   B3 a Auditoria diz "sistema:p138-safra" nos eventos do backfill
--   B4 desfazer: o md5 das safras do cliente volta a ser o de antes
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '50s';
DO $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_pec uuid := gen_random_uuid(); v_plano uuid; v_molde jsonb; v_cols text; v_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_origens text[] := array['manual', 'parcela_financiamento', 'financiamento', 'manual']; i int; v_md5 text; v_r jsonb;
begin
  insert into public.financeiro_safras (id, cliente_id, nome, codigo, ativa, escopo_negocio, data_inicio, data_fim)
  values (v_pec, c_cli, 'Safra 26/27 Pecuária (P138 sintética)', '26/27-Pec', true, 'pecuaria', '2026-07-01', '2027-06-30');
  select id into v_plano from public.financeiro_plano_contas p
   where (p.cliente_id is null or p.cliente_id = c_cli) and p.escopo_negocio = 'pecuaria' and p.tipo_operacao like '2-%' and coalesce(p.ativo, true)
   order by p.cliente_id nulls last limit 1;
  select to_jsonb(l) into v_molde from public.financeiro_lancamentos_v2 l where l.cliente_id = c_cli and l.conta_bancaria_id is not null
   order by l.created_at desc limit 1;
  if v_plano is null or v_molde is null then raise exception 'fixture incompleto'; end if;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols from pg_attribute
   where attrelid = 'public.financeiro_lancamentos_v2'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  for i in 1..4 loop
    execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)', v_cols, v_cols)
      using v_molde || jsonb_build_object('id', v_ids[i], 'hash_importacao', null, 'lote_importacao_id', null, 'cultura', null, 'fase', null,
        'tipo_operacao', '2-Saídas', 'cancelado', false, 'cenario', 'realizado', 'status_transacao', 'programado', 'data_pagamento', null,
        'recorrencia_id', null, 'financiamento_id', null, 'origem_lancamento', v_origens[i], 'origem_tipo', null, 'plano_conta_id', v_plano,
        'fazenda_id', (select f.id from public.fazendas f where f.cliente_id = c_cli limit 1),
        'data_competencia', '2026-09-22', 'data_vencimento', '2026-10-22', 'descricao', 'P138 backfill ' || i);
  end loop;
  update public.financeiro_lancamentos_v2 set safra_id = null where id = any(v_ids);
  if exists (select 1 from public.financeiro_lancamentos_v2 where id = any(v_ids) and safra_id is not null) then raise exception 'fixture: safra nao zerou'; end if;
  select md5(string_agg(id::text || coalesce(safra_id::text, '∅'), '|' order by id)) into v_md5 from public.financeiro_lancamentos_v2 where cliente_id = c_cli;

  -- B1
  v_r := public.fn_safra_backfill_aplicar(c_cli, true, array[v_ids[4]]);
  if (v_r->>'total')::int < 3 or (v_r->>'simulado')::boolean is not true then raise exception 'B1 simulacao: %', v_r; end if;
  if (select md5(string_agg(id::text || coalesce(safra_id::text, '∅'), '|' order by id)) from public.financeiro_lancamentos_v2 where cliente_id = c_cli) <> v_md5
    then raise exception 'B1 a simulacao mudou safras'; end if;
  if exists (select 1 from public.safra_backfill_backup where cliente_id = c_cli) then raise exception 'B1 a simulacao deixou backup'; end if;

  -- B2
  v_r := public.fn_safra_backfill_aplicar(c_cli, false, array[v_ids[4]]);
  if (select count(*) from public.financeiro_lancamentos_v2 where id = any(v_ids[1:3]) and safra_id = v_pec) <> 3
    then raise exception 'B2 comum/financiamento/consorcio sem a safra (%)', v_r; end if;
  if (select safra_id from public.financeiro_lancamentos_v2 where id = v_ids[4]) is not null then raise exception 'B2 o excluido ganhou safra'; end if;
  if (select count(*) from public.safra_backfill_backup where lancamento_id = any(v_ids)) <> 3 then raise exception 'B2 backup dos 4 <> 3'; end if;
  if (select count(*) from public.safra_backfill_backup where cliente_id = c_cli) <> (v_r->>'total')::int then raise exception 'B2 backup <> aplicados (%)', v_r; end if;

  -- B3
  if (select count(*) from public.audit_log a where a.registro_id = any(v_ids[1:3]) and a.via = 'sistema:p138-safra') < 3
    then raise exception 'B3 a Auditoria nao diz a rotina'; end if;

  -- B4
  v_r := public.fn_safra_backfill_desfazer(c_cli);
  if (select md5(string_agg(id::text || coalesce(safra_id::text, '∅'), '|' order by id)) from public.financeiro_lancamentos_v2 where cliente_id = c_cli) <> v_md5
    then raise exception 'B4 nao voltou ao original (%)', v_r; end if;

  raise exception 'OK p138 backfill (B1 B2 B3 B4)';
end $teste$;
ROLLBACK;
