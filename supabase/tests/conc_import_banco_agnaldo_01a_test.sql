-- PR-CONC-IMPORT-BANCO-AGNALDO-01A — provas da restauracao e o GESTO CONTRARIO, numa transacao que TERMINA EM RAISE.
-- Ensaio: colado logo depois da migration 20261027191900 (mesma transacao). Depois de aplicada, roda sozinho:
--   `supabase db query --linked -f supabase/tests/conc_import_banco_agnaldo_01a_test.sql`
-- A mensagem traz 'R01A_JSON{...}R01A_FIM' com o resumo de ago/26 (dias e linhas_sistema), para comparar com o fixture
-- `agnaldo_bradesco_2026_08` de `src/lib/conciliacao/resumoMes.fixture.json`.
--
-- P1 resumo de ago/26, conta 186a093b: conciliado, 0 dias com diferenca, saldo do sistema 54.738,55.
-- P2 os 81 lancamentos: linha inteira = audit_log.dados_anteriores, fora updated_* (81/81).
-- P3 as 2 liquidacoes de OC (3.100 / 5.943) ativas e a parte de OC do f1b7f361 viva.
-- P4 staging do Enriquecer: linhas que apontam para os 108 lancamentos, e quantas apontam para lancamento vivo.
-- P5 setembro do Bradesco: 0 extratos ativos (os 7 de 02/09 cancelados).
-- P6 linhas escritas nesta transacao, por tabela, e nenhuma de outro cliente.
-- G  gesto contrario: os `gesto_contrario` do backfill, na ordem (lancamentos, vinculos, extratos, cabecalhos), devolvem cada
--    campo restaurado ao valor de antes, os 4 cabecalhos voltam, as 2 liquidacoes voltam a estornadas e ago/26 volta ao estado
--    de antes da restauracao (saldo do sistema −1.671.145,49).
set local statement_timeout = '120s';
set local lock_timeout = '3s';

do $t$
declare
  c_cli constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  c_conta constant uuid := '186a093b-0204-4164-95e3-0dd247457ffa';
  c_imp constant uuid := '95c641a0-7afc-443d-896b-504849c25f55';
  r record; v_n2 int; v_json jsonb; v_out text := ''; v_xid bigint := txid_current() % 4294967296; bk record; v_n int;
begin
  -- P1
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2026-08', array[c_conta]) f where f.nivel = 'conta';
  if r.status <> 'conciliado' or jsonb_array_length(r.dias_com_diferenca) <> 0 or r.saldo_sistema <> 54738.55 then
    raise exception 'P1: ago/26 % · dias com diferenca % · saldo do sistema %', r.status, r.dias_com_diferenca, r.saldo_sistema;
  end if;
  v_json := jsonb_build_object('saldo_inicial', r.saldo_inicial, 'saldo_sistema', r.saldo_sistema, 'dias', r.dias,
    'linhas_sistema', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('tipo', l->'tipo', 'data', l->'data', 'valor', l->'valor',
        'lancamento_id', l->'lancamento_id', 'extrato_id', l->'extrato_id', 'parcial', l->'parcial', 'falta', l->'falta',
        'sobre_aplicado', l->'sobre_aplicado'))) from jsonb_array_elements(r.linhas_sistema) l));
  v_out := v_out || format('P1 ago/26 %s, 0 dias com diferenca, saldo %s, %s dias, %s linhas; ', r.status, r.saldo_sistema,
    jsonb_array_length(r.dias), jsonb_array_length(r.linhas_sistema));

  -- P2
  select count(*) into v_n from conc_import_agnaldo_01a_backfill b
    join audit_log a on a.registro_id = b.registro_id and a.tabela_origem = 'financeiro_lancamentos_v2' and a.created_at = '2026-10-03 16:39:18.7553+00'
    join financeiro_lancamentos_v2 l on l.id = b.registro_id
   where b.tabela = 'financeiro_lancamentos_v2' and (to_jsonb(l) - 'updated_at' - 'updated_by') = (a.dados_anteriores - 'updated_at' - 'updated_by');
  if v_n <> 81 then raise exception 'P2: % de 81 lancamentos iguais a dados_anteriores', v_n; end if;
  v_out := v_out || format('P2 81/81 lancamentos = dados_anteriores (fora updated_*); ');

  -- P3
  v_out := v_out || 'P3 ' || (select string_agg(format('%s/%s %s estornado=%s', left(q.operacao_id::text, 8), left(q.financeiro_lancamento_id::text, 8),
      q.valor, q.estornado), ', ' order by q.valor) from zoo_operacao_liquidacoes q
      where q.origem = 'financeiro' and left(q.financeiro_lancamento_id::text, 8) in ('7f51a6cc', 'f1b7f361'))
    || ' · parte f1b7f361 viva=' || (select bool_or(not p.cancelada) from zoo_operacao_partes p where left(p.financeiro_lancamento_id::text, 8) = 'f1b7f361')
    || ' · lancamento f1b7f361 ' || (select l.status_transacao || ' cancelado=' || l.cancelado from financeiro_lancamentos_v2 l where left(l.id::text, 8) = 'f1b7f361') || '; ';
  if (select count(*) from zoo_operacao_liquidacoes q where q.origem = 'financeiro' and not q.estornado
        and left(q.financeiro_lancamento_id::text, 8) in ('7f51a6cc', 'f1b7f361')) <> 2 then
    raise exception 'P3: liquidacoes de OC nao reativadas';
  end if;

  -- P4
  select count(*), count(*) filter (where l.cancelado is not true) into v_n, v_n2
    from financeiro_classificacao_staging s join financeiro_lancamentos_v2 l on l.id = s.match_lancamento_id
   where s.match_lancamento_id in (select registro_id from conc_import_agnaldo_01a_backfill where tabela = 'financeiro_lancamentos_v2'
                                   union select (antes->>'lancamento_id')::uuid from conc_import_agnaldo_01a_backfill where tabela = 'conciliacao_bancaria_itens');
  v_out := v_out || format('P4 staging: %s linhas apontam para os 108 lancamentos, %s para lancamento vivo; ', v_n, v_n2);

  -- P5
  if exists (select 1 from extrato_bancario_v2 e where e.conta_bancaria_id = c_conta and e.cancelado_em is null and e.data_movimento >= '2026-09-01') then
    raise exception 'P5: setembro do Bradesco com extrato ativo';
  end if;
  v_out := v_out || 'P5 setembro do Bradesco: 0 ativos; ';

  -- P6 (so' no ensaio — depois de aplicada, xmin e' de outra transacao)
  v_out := v_out || 'P6 escritas nesta transacao: ' || format('extrato %s · vinculos %s · lancamentos %s · importacoes %s · liquidacoes OC %s · partes OC %s · staging %s · conciliacao_audit_log %s · audit_log %s · de outro cliente %s; ',
    (select count(*) from extrato_bancario_v2 where xmin::text::bigint = v_xid),
    (select count(*) from conciliacao_bancaria_itens where xmin::text::bigint = v_xid),
    (select count(*) from financeiro_lancamentos_v2 where xmin::text::bigint = v_xid),
    (select count(*) from financeiro_importacoes_v2 where xmin::text::bigint = v_xid),
    (select count(*) from zoo_operacao_liquidacoes where xmin::text::bigint = v_xid),
    (select count(*) from zoo_operacao_partes where xmin::text::bigint = v_xid),
    (select count(*) from financeiro_classificacao_staging where xmin::text::bigint = v_xid),
    (select count(*) from conciliacao_audit_log where xmin::text::bigint = v_xid),
    (select count(*) from audit_log where xmin::text::bigint = v_xid),
    (select count(*) from extrato_bancario_v2 where xmin::text::bigint = v_xid and cliente_id <> c_cli)
      + (select count(*) from conciliacao_bancaria_itens where xmin::text::bigint = v_xid and cliente_id <> c_cli)
      + (select count(*) from financeiro_lancamentos_v2 where xmin::text::bigint = v_xid and cliente_id <> c_cli)
      + (select count(*) from zoo_operacao_liquidacoes where xmin::text::bigint = v_xid and cliente_id <> c_cli));

  -- G — o gesto contrario, na ordem certa
  for bk in select * from conc_import_agnaldo_01a_backfill where tabela = 'financeiro_lancamentos_v2' order by id loop execute bk.gesto_contrario; end loop;
  for bk in select * from conc_import_agnaldo_01a_backfill where tabela = 'conciliacao_bancaria_itens' order by id loop execute bk.gesto_contrario; end loop;
  for bk in select * from conc_import_agnaldo_01a_backfill where tabela = 'extrato_bancario_v2' order by id loop execute bk.gesto_contrario; end loop;
  for bk in select * from conc_import_agnaldo_01a_backfill where tabela = 'financeiro_importacoes_v2' order by id loop execute bk.gesto_contrario; end loop;
  -- cada campo restaurado voltou ao valor de antes
  select count(*) into v_n from conc_import_agnaldo_01a_backfill b
   where b.campos <> array['(linha removida)']
     and exists (select 1 from unnest(b.campos) k
                  where (case b.tabela when 'financeiro_lancamentos_v2' then (select to_jsonb(x) from financeiro_lancamentos_v2 x where x.id = b.registro_id)
                                       when 'conciliacao_bancaria_itens' then (select to_jsonb(x) from conciliacao_bancaria_itens x where x.id = b.registro_id)
                                       when 'extrato_bancario_v2' then (select to_jsonb(x) from extrato_bancario_v2 x where x.id = b.registro_id)
                                       else (select to_jsonb(x) from financeiro_importacoes_v2 x where x.id = b.registro_id) end)->k
                        is distinct from b.antes->k);
  if v_n <> 0 then raise exception 'G: % linhas nao voltaram ao antes', v_n; end if;
  if (select count(*) from financeiro_importacoes_v2 i where i.id in (select registro_id from conc_import_agnaldo_01a_backfill where campos = array['(linha removida)'])) <> 4 then
    raise exception 'G: os 4 cabecalhos nao voltaram';
  end if;
  if (select count(*) from zoo_operacao_liquidacoes q where q.origem = 'financeiro' and q.estornado
        and left(q.financeiro_lancamento_id::text, 8) in ('7f51a6cc', 'f1b7f361')) <> 2 then
    raise exception 'G: as liquidacoes de OC nao voltaram a estornadas';
  end if;
  select * into r from fn_conciliacao_resumo_mes(c_cli, '2026-08', array[c_conta]) f where f.nivel = 'conta';
  if r.status <> 'nao_conciliado' or r.saldo_sistema <> -1671145.49 then
    raise exception 'G: ago/26 depois do gesto contrario % / % (esperado nao_conciliado / -1671145.49)', r.status, r.saldo_sistema;
  end if;
  v_out := v_out || format('G gesto contrario: %s linhas de volta ao antes, 4 cabecalhos de volta, liquidacoes estornadas, ago/26 %s / %s',
    (select count(*) from conc_import_agnaldo_01a_backfill), r.status, r.saldo_sistema);

  raise exception 'OK % R01A_JSON%R01A_FIM', v_out, v_json::text using errcode = 'P0001';
end $t$;
