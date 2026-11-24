-- CPR-D1 (Gabriel 24/11/2026, opção 2) — o DESFAZER do "Não vai acontecer" da lista dos vencidos da Contas a Pagar e Receber.
-- O "Não vai acontecer" cancela pela RPC de hoje (fn_cancelar_lancamento_auditoria) com o motivo FIXO 'CPR: vencido não vai
-- acontecer'; esta função volta SÓ esse cancelamento:
--   * guarda de cliente pelo lançamento (tenant_ok → 42501), nunca pelo chamador;
--   * só o cancelado com aquele motivo (outro cancelamento não se desfaz por aqui: P0001 com o motivo dele);
--   * só no mês aberto (a mesma regra de fechamento da RPC de cancelar);
--   * recusa se o cancelamento desfez um vínculo com o extrato (desfazer não refaz conciliação: P0001, refazer pela Conciliação);
--   * p_simular = a prévia (nada grava); a trilha é a de todo UPDATE do lançamento (trg_audit_financeiro_v2: antes × depois, autor
--     = quem está logado). Os gatilhos da tabela seguem valendo (vencimento vivo, parcela do financiamento se realinha).
-- Função nova nasce fechada: sem PUBLIC/anon; EXECUTE só para authenticated.

do $antes$
begin
  if to_regprocedure('public.fn_lancamento_descancelar(uuid, boolean)') is not null then
    raise exception 'CPR-D1: fn_lancamento_descancelar já existe — nada a fazer';
  end if;
end $antes$;

create function public.fn_lancamento_descancelar(p_lancamento_id uuid, p_simular boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  c_motivo constant text := 'CPR: vencido não vai acontecer';
  v financeiro_lancamentos_v2%rowtype;
begin
  select * into v from financeiro_lancamentos_v2 where id = p_lancamento_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lançamento não encontrado.';
  end if;
  if not public.tenant_ok(v.cliente_id) then
    raise exception using errcode = '42501', message = 'Operação não autorizada para este cliente.';
  end if;
  if v.cancelado is not true then
    return jsonb_build_object('ok', true, 'lancamento_id', v.id, 'ja_ativo', true, 'simulado', p_simular);
  end if;
  if v.cancelado_motivo is distinct from c_motivo then
    raise exception using errcode = 'P0001', message = format(
      'Este lançamento foi cancelado por outro caminho (motivo: %s): só o "Não vai acontecer" da Contas a Pagar e Receber se desfaz por aqui.',
      coalesce(v.cancelado_motivo, '—'));
  end if;
  if exists (select 1 from financeiro_fechamentos f
              where f.cliente_id = v.cliente_id and f.fazenda_id = v.fazenda_id
                and f.ano_mes = v.ano_mes and f.status_fechamento = 'fechado') then
    raise exception using errcode = 'P0001', message = format(
      'A competência %s está em mês fechado: reabra o mês antes de desfazer.', v.ano_mes);
  end if;
  if exists (select 1 from conciliacao_bancaria_itens c
              where c.lancamento_id = v.id and c.desfeito_em is not null
                and c.desfeito_em >= coalesce(v.cancelado_em, '-infinity'::timestamptz)) then
    raise exception using errcode = 'P0001', message =
      'O cancelamento desfez o vínculo com o extrato: desfazer aqui não refaz a conciliação. Refaça pela Conciliação.';
  end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'lancamento_id', v.id, 'simulado', true,
      'cancelado_em', v.cancelado_em, 'data_vencimento', v.data_vencimento);
  end if;

  update financeiro_lancamentos_v2
     set cancelado = false, cancelado_em = null, cancelado_por = null, cancelado_motivo = null
   where id = v.id;

  return jsonb_build_object('ok', true, 'lancamento_id', v.id, 'simulado', false, 'descancelado', true);
end $f$;

revoke all on function public.fn_lancamento_descancelar(uuid, boolean) from public, anon;
grant execute on function public.fn_lancamento_descancelar(uuid, boolean) to authenticated;

do $chegada$
begin
  if not (select prosecdef from pg_proc where oid = 'public.fn_lancamento_descancelar(uuid,boolean)'::regprocedure)
     or has_function_privilege('anon', 'public.fn_lancamento_descancelar(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_lancamento_descancelar(uuid,boolean)', 'execute') then
    raise exception 'CPR-D1: a função não chegou como esperado (SECDEF, sem anon, com authenticated)';
  end if;
end $chegada$;
