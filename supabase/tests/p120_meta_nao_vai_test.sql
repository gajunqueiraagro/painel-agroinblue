-- P120 (depois da 20261028112400) — meta nunca vai ao financeiro. Termina em RAISE 'OK'. Transacao revertida.
--   S1 INSERT com cenario = 'meta' e' recusado com a frase
--   S2 UPDATE que PASSA um lancamento a meta e' recusado
--   S3 um dos lancamentos meta que ja' existem continua editavel e cancelavel (o cancelamento espera o P109)
--   S4 extrato igual ao meta do NJ (mesma conta, valor e data): o meta NAO e' candidato (fn_candidatos_conciliacao) nem sugestao
--      (fn_sugestoes_extrato)
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
DO $teste$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_meta constant uuid := '6203b336-7053-4c90-b3cc-5d6a5db8e24a';   -- "Abate 66 Garrotes" (meta, NJ)
  v_molde jsonb; v_novo uuid := gen_random_uuid(); v_cols text; v_ok boolean; v_msg text; v_real uuid;
  m record; v_ext uuid := gen_random_uuid(); v_n int;
begin
  select to_jsonb(l) into v_molde from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_nj and l.cancelado is not true and l.cenario = 'realizado' and l.recorrencia_id is null and l.financiamento_id is null
     and coalesce(l.origem_lancamento, '') not in ('mesa_split', 'parcela_financiamento') and coalesce(l.tipo_operacao, '') not like '3-%'
   order by l.created_at desc limit 1;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols from pg_attribute
   where attrelid = 'public.financeiro_lancamentos_v2'::regclass and attnum > 0 and not attisdropped and attgenerated = '';

  -- S1
  v_ok := false;
  begin
    execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)', v_cols, v_cols)
      using v_molde || jsonb_build_object('id', v_novo, 'hash_importacao', null, 'cenario', 'meta');
  exception when others then v_ok := sqlerrm like 'Meta não vai ao financeiro%'; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'S1 nao recusou (%)', v_msg; end if;

  -- S2
  execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)', v_cols, v_cols)
    using v_molde || jsonb_build_object('id', v_novo, 'hash_importacao', null);
  v_ok := false;
  begin
    update public.financeiro_lancamentos_v2 set cenario = 'meta' where id = v_novo;
  exception when others then v_ok := sqlerrm like 'Meta não vai ao financeiro%'; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'S2 nao recusou (%)', v_msg; end if;

  -- S3
  update public.financeiro_lancamentos_v2 set observacao = coalesce(observacao, '') || ' [p120]' where id = c_meta;
  update public.financeiro_lancamentos_v2 set cancelado = true, cancelado_motivo = 'ensaio p120' where id = c_meta;
  if not exists (select 1 from public.financeiro_lancamentos_v2 where id = c_meta and cancelado) then raise exception 'S3'; end if;
  update public.financeiro_lancamentos_v2 set cancelado = false, cancelado_motivo = null where id = c_meta;

  -- S4
  select l.conta_efetiva_id conta, l.valor, coalesce(l.data_vencimento, l.data_competencia) dia into m from public.financeiro_lancamentos_v2 l where l.id = c_meta;
  insert into public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, descricao, valor, tipo_movimento, hash_movimento)
  values (v_ext, c_nj, m.conta, m.dia, 'ABATE 66 GARROTES ensaio p120', abs(m.valor), 'credito', 'ensaio-p120-' || v_ext);
  select count(*) into v_n from public.fn_candidatos_conciliacao(c_nj, v_ext, 50) x where x.id = c_meta;
  if v_n <> 0 then raise exception 'S4 o meta ainda e candidato (%)', v_n; end if;
  select count(*) into v_n from public.fn_sugestoes_extrato(c_nj, m.conta, m.dia, m.dia + 1) s where s.sugestao_id = c_meta;
  if v_n <> 0 then raise exception 'S4 o meta ainda e sugestao (%)', v_n; end if;

  raise exception 'OK';
end $teste$;
ROLLBACK;
