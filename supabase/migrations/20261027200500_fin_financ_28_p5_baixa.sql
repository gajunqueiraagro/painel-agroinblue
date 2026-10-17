-- FIN-FINANC-28 · PASSO 5 — "DAR BAIXA ▾" NO CONTRATO DE CREDITO: quitado · rolado/renovado · prorrogado por aditivo · cancelado, e o
-- gesto contrario "Desfazer baixa" (Gabriel, 17/10/2026). So' financiamento e emprestimo (compra parcelada segue com o Excluir).
--
-- FASE 0 (medido em 17/10/2026):
--   · `chk_financiamentos_status` aceita ativo / quitado / rolado / cancelado; NAO aceita 'prorrogado' -> entra aqui.
--   · Quem le^ o status no banco: `_fn_financiamento_saldo` (cancelado/rolado = 0 e fora das somas; quitado = 0; o RESTO e' calculado —
--     'prorrogado' ja' cai no calculado, sem patch) e `_fn_financiamento_status_pelas_parcelas` (P3-FIX4: so' ativo <-> quitado; com
--     'prorrogado' ele sairia cedo e o contrato prorrogado nunca quitaria sozinho -> patch: prorrogado quita como o ativo e, com parcela
--     em aberto, fica prorrogado). Na tela, a lista trata como encerrados so' quitado/rolado/cancelado (prorrogado = vigente).
--   · O gatilho de quitacao REFAZ o status pelas parcelas a cada mudanca de parcela / lancamento: um 'quitado' posto a' mao com parcela
--     em aberto voltaria a 'ativo'. Por isso a baixa CANCELA as parcelas em aberto (pelo dono do cancelamento, com motivo) — e o
--     "Desfazer baixa" as devolve e o MOTOR recria os programados. Parcela com um lancamento ja' pago e outro em aberto: cancela-se so'
--     o lancamento em aberto (a parcela fica paga pelo que pagou; o amortizado nao muda).
--
-- TRILHA: `financiamento_baixas` (uma linha por baixa; antes = contrato e parcelas tocadas; detalhe = o que foi criado/cancelado). So'
-- a ULTIMA baixa viva se desfaz. Funcoes publicas com guarda pelo contrato (`_fn_contrato_do_usuario`, tenant_ok + 42501) e simulacao
-- (= a gravacao desfeita, SQLSTATE 'FBSIM'): fn_financiamento_baixa, fn_financiamento_baixa_desfazer. Nenhum dado de cliente e' tocado.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. Status 'prorrogado' ---------------------------------------------------------------------------------------------------------
alter table public.financiamentos drop constraint if exists chk_financiamentos_status;
alter table public.financiamentos add constraint chk_financiamentos_status
  check (status = any (array['ativo'::text, 'quitado'::text, 'rolado'::text, 'cancelado'::text, 'prorrogado'::text]));

-- 2. Trilha ----------------------------------------------------------------------------------------------------------------------
create table if not exists public.financiamento_baixas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  financiamento_id uuid not null references public.financiamentos(id) on delete restrict,
  tipo text not null check (tipo in ('quitado', 'rolado', 'prorrogado', 'cancelado')),
  data date not null,
  motivo text not null check (btrim(motivo) <> ''),
  antes jsonb not null,
  detalhe jsonb not null default '{}'::jsonb,
  feita_em timestamptz not null default now(),
  feita_por uuid,
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text,
  constraint fin_baixa_desfeita_chk check ((desfeita_em is null and desfeita_motivo is null) or (desfeita_em is not null and desfeita_motivo is not null))
);
create unique index if not exists uq_fin_baixa_viva on public.financiamento_baixas (financiamento_id) where desfeita_em is null;
alter table public.financiamento_baixas enable row level security;
drop policy if exists fin_baixas_select on public.financiamento_baixas;
create policy fin_baixas_select on public.financiamento_baixas for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financiamento_baixas from public, anon;
grant select on public.financiamento_baixas to authenticated;
grant all on public.financiamento_baixas to service_role;

-- 3. "Esta parcela esta' paga?" — o espelho declarado da regra de `_fn_financiamento_status_pelas_parcelas` (quem mexer confere a outra)
create or replace function public._fn_parcela_esta_paga(p_parcela_id uuid)
returns boolean
language sql stable set search_path = pg_catalog, public
as $$
  select case
           when lp.id is null and lj.id is null then coalesce(q.status, '') = 'pago'
           else (lp.id is null or lp.status_transacao in ('realizado', 'conciliado'))
            and (lj.id is null or lj.status_transacao in ('realizado', 'conciliado'))
         end
    from public.financiamento_parcelas q
    left join public.financeiro_lancamentos_v2 lp on lp.id = q.lancamento_id and not coalesce(lp.cancelado, false)
    left join public.financeiro_lancamentos_v2 lj on lj.id = q.lancamento_juros_id and not coalesce(lj.cancelado, false)
                                                  and q.lancamento_juros_id is distinct from q.lancamento_id
   where q.id = p_parcela_id
$$;
revoke all on function public._fn_parcela_esta_paga(uuid) from public, anon, authenticated;
grant execute on function public._fn_parcela_esta_paga(uuid) to service_role;

-- 4. Tira as parcelas em aberto do contrato (o que a baixa encerra) e devolve o que fez ---------------------------------------------
create or replace function public._fn_baixa_encerrar_em_aberto(p_fin uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  q record; v_lanc uuid; v_cancelados uuid[] := '{}'; v_parcelas jsonb := '[]'::jsonb; v_real_p boolean; v_real_j boolean;
begin
  for q in select * from public.financiamento_parcelas x where x.financiamento_id = p_fin and coalesce(x.status, '') <> 'cancelado'
             and not public._fn_parcela_esta_paga(x.id) order by x.numero_parcela loop
    if exists (select 1 from public.financiamento_parcela_vinculos v where v.parcela_id = q.id and v.desfeito_em is null) then
      raise exception using errcode = 'P0001', message = format('A parcela %s tem pagamento vinculado em aberto: desvincule antes.', q.numero_parcela);
    end if;
    v_real_p := exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = q.lancamento_id and not coalesce(l.cancelado, false) and l.status_transacao in ('realizado', 'conciliado'));
    v_real_j := exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = q.lancamento_juros_id and not coalesce(l.cancelado, false) and l.status_transacao in ('realizado', 'conciliado'));
    v_parcelas := v_parcelas || jsonb_build_object('id', q.id, 'numero', q.numero_parcela, 'status', q.status, 'data_vencimento', q.data_vencimento,
      'vencimento_original', q.vencimento_original, 'lancamento_id', q.lancamento_id, 'lancamento_juros_id', q.lancamento_juros_id,
      'parcial', v_real_p or v_real_j);
    foreach v_lanc in array array_remove(array[q.lancamento_id, q.lancamento_juros_id], null) loop
      if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = v_lanc and not coalesce(l.cancelado, false)
                   and l.status_transacao not in ('realizado', 'conciliado')) then
        if public._fin_lancamento_casado_com_extrato(v_lanc) then
          raise exception using errcode = 'P0001', message = format('A parcela %s tem lançamento casado com o extrato: desfaça a conciliação antes.', q.numero_parcela);
        end if;
        perform public.fn_cancelar_lancamento_auditoria(v_lanc, p_motivo);
        v_cancelados := v_cancelados || v_lanc;
      end if;
    end loop;
    update public.financiamento_parcelas set
      lancamento_id = case when lancamento_id = any(v_cancelados) then null else lancamento_id end,
      lancamento_juros_id = case when lancamento_juros_id = any(v_cancelados) then null else lancamento_juros_id end,
      status = case when v_real_p or v_real_j then status else 'cancelado' end
     where id = q.id;
  end loop;
  return jsonb_build_object('parcelas', v_parcelas, 'cancelados', to_jsonb(v_cancelados));
end $$;
revoke all on function public._fn_baixa_encerrar_em_aberto(uuid, text) from public, anon, authenticated;
grant execute on function public._fn_baixa_encerrar_em_aberto(uuid, text) to service_role;

-- 5. A baixa (interna: grava) ------------------------------------------------------------------------------------------------------
create or replace function public._fn_financiamento_baixa_exec(p_financiamento_id uuid, p_tipo text, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  f public.financiamentos%rowtype;
  s jsonb; v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
  v_motivo text := nullif(btrim(coalesce(p_dados->>'motivo', '')), '');
  v_data date := coalesce(nullif(p_dados->>'data', '')::date, current_date);
  v_principal numeric; v_amort numeric; v_liquidado numeric; v_dif numeric; v_valor numeric;
  v_antes jsonb; v_det jsonb := '{}'::jsonb; v_enc jsonb; v_id uuid; v_suc public.financiamentos%rowtype;
  v_lib uuid; v_enc_id uuid; v_meses int; q record; v_lanc uuid; v_canc uuid[] := '{}'; v_parc jsonb := '[]'::jsonb; v_bloq text[] := '{}';
begin
  f := public._fn_contrato_do_usuario(p_financiamento_id);
  if f.natureza = 'parcelamento' then raise exception using errcode = 'P0001', message = 'Compra parcelada não tem baixa: use Excluir.'; end if;
  if p_tipo is null or p_tipo not in ('quitado', 'rolado', 'prorrogado', 'cancelado') then
    raise exception using errcode = 'P0001', message = 'Escolha a baixa: quitado, rolado, prorrogado ou cancelado.';
  end if;
  if f.status not in ('ativo', 'prorrogado') then
    raise exception using errcode = 'P0001', message = format('O contrato já está %s: desfaça a baixa antes.', f.status);
  end if;
  if v_motivo is null then raise exception using errcode = 'P0001', message = 'Informe o motivo da baixa.'; end if;

  s := public._fn_financiamento_saldo(f.id, v_data);
  v_principal := round(coalesce((s->>'liberado')::numeric, f.valor_total, 0), 2);
  v_amort := round(coalesce((s->>'amortizado')::numeric, 0), 2);
  v_antes := jsonb_build_object('status', f.status, 'baixa_em', f.baixa_em, 'baixa_por', f.baixa_por, 'baixa_motivo', f.baixa_motivo,
    'contrato_sucessor_id', f.contrato_sucessor_id, 'vencimento_final', f.vencimento_final);

  if p_tipo = 'quitado' then
    v_liquidado := v_amort; v_dif := round(v_principal - v_liquidado, 2);
    if v_dif <> 0 and coalesce((v_dados->>'confirmar_diferenca')::boolean, false) is not true then
      raise exception using errcode = 'P0001', message = format('Principal %s e liquidado %s não fecham (diferença %s): confirme a diferença para quitar.',
        translate(to_char(v_principal, 'FM999,999,999,990.00'), ',.', '.,'), translate(to_char(v_liquidado, 'FM999,999,999,990.00'), ',.', '.,'),
        translate(to_char(v_dif, 'FM999,999,999,990.00'), ',.', '.,'));
    end if;
    v_enc := public._fn_baixa_encerrar_em_aberto(f.id, 'baixa do contrato (quitado): ' || v_motivo);
    update public.financiamentos set status = 'quitado', baixa_em = v_data, baixa_por = auth.uid(), baixa_motivo = v_motivo, updated_at = now() where id = f.id;
    v_det := jsonb_build_object('cancelados', v_enc->'cancelados', 'confirmou_diferenca', v_dif <> 0);
    v_antes := v_antes || jsonb_build_object('parcelas', v_enc->'parcelas');

  elsif p_tipo = 'rolado' then
    if nullif(v_dados->>'sucessor_id', '') is null then raise exception using errcode = 'P0001', message = 'Escolha o contrato novo (o que liquida este).'; end if;
    select * into v_suc from public.financiamentos where id = (v_dados->>'sucessor_id')::uuid;
    if not found or v_suc.cliente_id <> f.cliente_id then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
    if v_suc.id = f.id then raise exception using errcode = 'P0001', message = 'O contrato não rola para si mesmo.'; end if;
    if v_suc.natureza = 'parcelamento' or v_suc.status not in ('ativo', 'prorrogado') then
      raise exception using errcode = 'P0001', message = 'O contrato novo tem de ser um financiamento ou empréstimo vigente.';
    end if;
    v_valor := round(coalesce(nullif(v_dados->>'valor', '')::numeric, nullif(s->>'saldo', '')::numeric, v_principal - v_amort), 2);
    if v_valor is null or v_valor <= 0 then raise exception using errcode = 'P0001', message = 'Informe o valor liquidado pelo contrato novo (maior que zero).'; end if;
    update public.financiamentos set status = 'rolado', contrato_sucessor_id = v_suc.id, baixa_em = v_data, baixa_por = auth.uid(),
      baixa_motivo = v_motivo, updated_at = now() where id = f.id;
    v_lib := (public.fn_financiamento_liberacao_salvar(v_suc.id, null, v_data, v_valor, 'liquidacao', null, null, f.id, null,
      'liquidação do contrato ' || coalesce(nullif(f.numero_contrato, ''), f.descricao))->>'id')::uuid;
    v_enc := public._fn_baixa_encerrar_em_aberto(f.id, 'baixa do contrato (rolado): ' || v_motivo);
    if nullif(v_dados->>'juros_lancamento_id', '') is not null then
      perform public.fn_contrato_encargo_vincular(f.id, jsonb_build_array(jsonb_build_object('lancamento_id', v_dados->>'juros_lancamento_id', 'papel', 'juros')), false);
      select e.id into v_enc_id from public.financiamento_encargos e where e.financiamento_id = f.id
         and e.lancamento_id = (v_dados->>'juros_lancamento_id')::uuid and e.desfeito_em is null;
    end if;
    v_liquidado := round(v_amort + v_valor, 2); v_dif := round(v_principal - v_liquidado, 2);
    v_det := jsonb_build_object('sucessor_id', v_suc.id, 'liberacao_id', v_lib, 'valor', v_valor, 'encargo_id', v_enc_id, 'cancelados', v_enc->'cancelados');
    v_antes := v_antes || jsonb_build_object('parcelas', v_enc->'parcelas');

  elsif p_tipo = 'prorrogado' then
    v_meses := nullif(v_dados->>'meses', '')::int;
    if v_meses is null or v_meses < 1 or v_meses > 120 then raise exception using errcode = 'P0001', message = 'Informe quantos meses as parcelas em aberto andam (1 a 120).'; end if;
    if not exists (select 1 from public.financiamento_documentos d where d.financiamento_id = f.id and d.especie = 'aditivo' and d.cancelado_em is null)
       and coalesce((v_dados->>'aditivo_a_anexar')::boolean, false) is not true then
      raise exception using errcode = 'P0001', message = 'Anexe o aditivo em Documentos do contrato, ou marque "aditivo a anexar".';
    end if;
    for q in select * from public.financiamento_parcelas x where x.financiamento_id = f.id and coalesce(x.status, '') <> 'cancelado'
               and not public._fn_parcela_esta_paga(x.id)
               and not exists (select 1 from public.financiamento_parcela_vinculos v where v.parcela_id = x.id and v.desfeito_em is null)
             order by x.numero_parcela loop
      v_parc := v_parc || jsonb_build_object('id', q.id, 'numero', q.numero_parcela, 'status', q.status, 'data_vencimento', q.data_vencimento,
        'vencimento_original', q.vencimento_original, 'lancamento_id', q.lancamento_id, 'lancamento_juros_id', q.lancamento_juros_id,
        'para', (q.data_vencimento + make_interval(months => v_meses))::date);
      -- o programado sai pelo dono; o MOTOR recria com o vencimento novo (e a competencia do vencimento, a regra da amortizacao)
      foreach v_lanc in array array_remove(array[q.lancamento_id, q.lancamento_juros_id], null) loop
        if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = v_lanc and not coalesce(l.cancelado, false)
                     and l.status_transacao not in ('realizado', 'conciliado')) then
          if public._fin_lancamento_casado_com_extrato(v_lanc) then
            raise exception using errcode = 'P0001', message = format('A parcela %s tem lançamento casado com o extrato: desfaça a conciliação antes.', q.numero_parcela);
          end if;
          perform public.fn_cancelar_lancamento_auditoria(v_lanc, 'prorrogação por aditivo: ' || v_motivo);
          v_canc := v_canc || v_lanc;
        end if;
      end loop;
      update public.financiamento_parcelas set
        vencimento_original = coalesce(vencimento_original, data_vencimento),
        data_vencimento = (data_vencimento + make_interval(months => v_meses))::date,
        lancamento_id = case when lancamento_id = any(v_canc) then null else lancamento_id end,
        lancamento_juros_id = case when lancamento_juros_id = any(v_canc) then null else lancamento_juros_id end
       where id = q.id;
      perform public.fn_reconciliar_parcela_financiamento(q.id, false, false, null);
    end loop;
    if jsonb_array_length(v_parc) = 0 then raise exception using errcode = 'P0001', message = 'Não há parcela em aberto para prorrogar.'; end if;
    update public.financiamentos set status = 'prorrogado', updated_at = now(),
      vencimento_final = case when vencimento_final is null then null else
        (select max(x.data_vencimento) from public.financiamento_parcelas x where x.financiamento_id = f.id and coalesce(x.status, '') <> 'cancelado') end
     where id = f.id;
    v_liquidado := v_amort; v_dif := round(v_principal - v_liquidado, 2);
    v_det := jsonb_build_object('meses', v_meses, 'aditivo_a_anexar', coalesce((v_dados->>'aditivo_a_anexar')::boolean, false), 'cancelados', to_jsonb(v_canc));
    v_antes := v_antes || jsonb_build_object('parcelas', v_parc);

  else -- cancelado
    select array_agg(format('parcela %s paga', x.numero_parcela) order by x.numero_parcela) into v_bloq
      from public.financiamento_parcelas x where x.financiamento_id = f.id and coalesce(x.status, '') <> 'cancelado' and public._fn_parcela_esta_paga(x.id);
    if exists (select 1 from public.financiamento_liberacoes o where o.financiamento_id = f.id and o.cancelado_em is null) then
      v_bloq := coalesce(v_bloq, '{}') || format('%s liberação(ões) viva(s)', (select count(*) from public.financiamento_liberacoes o where o.financiamento_id = f.id and o.cancelado_em is null));
    end if;
    if coalesce(array_length(v_bloq, 1), 0) > 0 then
      raise exception using errcode = 'P0001', message = 'Não se cancela contrato com pagamento ou liberação: ' || array_to_string(v_bloq, ', ')
        || '. Use quitado ou rolado, ou remova antes.';
    end if;
    update public.financiamentos set status = 'cancelado', baixa_em = v_data, baixa_por = auth.uid(), baixa_motivo = v_motivo, updated_at = now() where id = f.id;
    v_enc := public._fn_baixa_encerrar_em_aberto(f.id, 'baixa do contrato (cancelado): ' || v_motivo);
    v_liquidado := v_amort; v_dif := round(v_principal - v_liquidado, 2);
    v_det := jsonb_build_object('cancelados', v_enc->'cancelados');
    v_antes := v_antes || jsonb_build_object('parcelas', v_enc->'parcelas');
  end if;

  insert into public.financiamento_baixas (cliente_id, financiamento_id, tipo, data, motivo, antes, detalhe, feita_por)
  values (f.cliente_id, f.id, p_tipo, v_data, v_motivo, v_antes, v_det, auth.uid()) returning id into v_id;
  return jsonb_build_object('baixa_id', v_id, 'tipo', p_tipo, 'principal', v_principal, 'liquidado', v_liquidado, 'diferenca', v_dif,
    'parcelas', coalesce(v_antes->'parcelas', '[]'::jsonb), 'lancamentos_cancelados', jsonb_array_length(coalesce(v_det->'cancelados', '[]'::jsonb)));
end $$;
revoke all on function public._fn_financiamento_baixa_exec(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public._fn_financiamento_baixa_exec(uuid, text, jsonb) to service_role;

-- 6. Desfazer a baixa (interna) ------------------------------------------------------------------------------------------------------
create or replace function public._fn_financiamento_baixa_desfazer_exec(p_baixa_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.financiamento_baixas%rowtype; f public.financiamentos%rowtype; a jsonb; p jsonb; v_canc uuid[];
  v_lanc uuid; v_novos uuid[] := '{}'; v_motor int := 0;
begin
  select * into b from public.financiamento_baixas where id = p_baixa_id;
  if not found then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  f := public._fn_contrato_do_usuario(b.financiamento_id);
  if b.desfeita_em is not null then raise exception using errcode = 'P0001', message = 'Esta baixa já foi desfeita.'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo para desfazer a baixa.'; end if;
  if f.status is distinct from b.tipo then
    raise exception using errcode = 'P0001', message = format('O contrato mudou depois da baixa (está %s): não dá para desfazer daqui.', f.status);
  end if;
  a := b.antes;
  select coalesce(array_agg(x::uuid), '{}') into v_canc from jsonb_array_elements_text(coalesce(b.detalhe->'cancelados', '[]'::jsonb)) x;

  update public.financiamento_baixas set desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo) where id = b.id;

  if b.tipo = 'rolado' then
    if nullif(b.detalhe->>'liberacao_id', '') is not null and exists (select 1 from public.financiamento_liberacoes o
         where o.id = (b.detalhe->>'liberacao_id')::uuid and o.cancelado_em is null) then
      perform public.fn_financiamento_liberacao_remover((b.detalhe->>'liberacao_id')::uuid, 'baixa desfeita: ' || btrim(p_motivo));
    end if;
    if nullif(b.detalhe->>'encargo_id', '') is not null and exists (select 1 from public.financiamento_encargos e
         where e.id = (b.detalhe->>'encargo_id')::uuid and e.desfeito_em is null) then
      perform public.fn_contrato_encargo_desvincular((b.detalhe->>'encargo_id')::uuid, 'baixa desfeita: ' || btrim(p_motivo), false);
    end if;
  end if;

  -- o contrato volta como estava (o status primeiro: o gatilho de quitacao so' age em ativo/quitado/prorrogado)
  update public.financiamentos set status = a->>'status', baixa_em = nullif(a->>'baixa_em', '')::date,
    baixa_por = nullif(a->>'baixa_por', '')::uuid, baixa_motivo = a->>'baixa_motivo',
    contrato_sucessor_id = nullif(a->>'contrato_sucessor_id', '')::uuid, vencimento_final = nullif(a->>'vencimento_final', '')::date,
    updated_at = now()
   where id = f.id;

  for p in select * from jsonb_array_elements(coalesce(a->'parcelas', '[]'::jsonb)) loop
    if b.tipo = 'prorrogado' then
      -- os programados que o motor recriou com o vencimento novo saem; o motor os recria no vencimento de antes
      foreach v_lanc in array array_remove(array[
          (select lancamento_id from public.financiamento_parcelas where id = (p->>'id')::uuid),
          (select lancamento_juros_id from public.financiamento_parcelas where id = (p->>'id')::uuid)], null) loop
        if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = v_lanc and not coalesce(l.cancelado, false)
                     and l.status_transacao not in ('realizado', 'conciliado')) and not (v_lanc = any(v_canc)) then
          perform public.fn_cancelar_lancamento_auditoria(v_lanc, 'baixa desfeita (prorrogação): ' || btrim(p_motivo));
          v_novos := v_novos || v_lanc;
        end if;
      end loop;
    end if;
    update public.financiamento_parcelas set
      status = p->>'status',
      data_vencimento = (p->>'data_vencimento')::date,
      vencimento_original = nullif(p->>'vencimento_original', '')::date,
      lancamento_id = case when lancamento_id = any(v_canc || v_novos) or nullif(p->>'lancamento_id', '')::uuid = any(v_canc) then null else lancamento_id end,
      lancamento_juros_id = case when lancamento_juros_id = any(v_canc || v_novos) or nullif(p->>'lancamento_juros_id', '')::uuid = any(v_canc) then null else lancamento_juros_id end
     where id = (p->>'id')::uuid;
    if nullif(p->>'lancamento_id', '')::uuid = any(v_canc) or nullif(p->>'lancamento_juros_id', '')::uuid = any(v_canc) or b.tipo = 'prorrogado' then
      perform public.fn_reconciliar_parcela_financiamento((p->>'id')::uuid, false, false, null);
      v_motor := v_motor + 1;
    end if;
  end loop;
  return jsonb_build_object('baixa_id', b.id, 'tipo', b.tipo, 'parcelas', jsonb_array_length(coalesce(a->'parcelas', '[]'::jsonb)), 'recriadas', v_motor);
end $$;
revoke all on function public._fn_financiamento_baixa_desfazer_exec(uuid, text) from public, anon, authenticated;
grant execute on function public._fn_financiamento_baixa_desfazer_exec(uuid, text) to service_role;

-- 7. As publicas (guarda a' vista + simulacao) ----------------------------------------------------------------------------------------
create or replace function public.fn_financiamento_baixa(p_financiamento_id uuid, p_tipo text, p_dados jsonb, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  perform public._fn_contrato_do_usuario(p_financiamento_id);
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_baixa_exec(p_financiamento_id, p_tipo,
             coalesce(p_dados, '{}'::jsonb) || jsonb_build_object('motivo', coalesce(nullif(btrim(coalesce(p_dados->>'motivo', '')), ''), 'simulação')));
      raise exception using errcode = 'FBSIM', message = r::text;
    exception
      when sqlstate 'FBSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  return public._fn_financiamento_baixa_exec(p_financiamento_id, p_tipo, p_dados) || jsonb_build_object('simulado', false);
end $$;

create or replace function public.fn_financiamento_baixa_desfazer(p_baixa_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  perform public._fn_contrato_do_usuario((select b.financiamento_id from public.financiamento_baixas b where b.id = p_baixa_id));
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_baixa_desfazer_exec(p_baixa_id, coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'simulação'));
      raise exception using errcode = 'FBSIM', message = r::text;
    exception
      when sqlstate 'FBSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  return public._fn_financiamento_baixa_desfazer_exec(p_baixa_id, p_motivo) || jsonb_build_object('simulado', false);
end $$;

-- 8. O contrato prorrogado quita sozinho como o ativo (P3-FIX4): patch guardado por md5, 2 ancoras ------------------------------------
do $$
declare
  v_src text; v_def text;
  c_antes constant text := '215e06308cb9370bfef1a6ec761a55f8';
  c_depois constant text := 'd980fbdda9841245aad04138e2bbfaea';
  c_a1 constant text := E'if v_status is null or v_status not in (''ativo'', ''quitado'') then return v_status; end if;';
  c_n1 constant text := E'if v_status is null or v_status not in (''ativo'', ''quitado'', ''prorrogado'') then return v_status; end if;';
  c_a2 constant text := E'v_novo := case when v_pagas = v_total then ''quitado'' else ''ativo'' end;';
  c_n2 constant text := E'-- FIN-FINANC-28 passo 5: o prorrogado quita como o ativo; com parcela em aberto ele continua prorrogado\n'
    || E'  v_novo := case when v_pagas = v_total then ''quitado'' when v_status = ''quitado'' then ''ativo'' else v_status end;';
begin
  select prosrc into v_src from pg_proc where oid = 'public._fn_financiamento_status_pelas_parcelas(uuid)'::regprocedure;
  if md5(v_src) <> c_antes then raise exception 'status: corpo nao e o esperado (%)', md5(v_src); end if;
  if (length(v_src) - length(replace(v_src, c_a1, ''))) / length(c_a1) <> 1 or (length(v_src) - length(replace(v_src, c_a2, ''))) / length(c_a2) <> 1 then
    raise exception 'status: ancora nao casa 1x';
  end if;
  v_def := pg_get_functiondef('public._fn_financiamento_status_pelas_parcelas(uuid)'::regprocedure);
  execute replace(replace(v_def, c_a1, c_n1), c_a2, c_n2);
  select prosrc into v_src from pg_proc where oid = 'public._fn_financiamento_status_pelas_parcelas(uuid)'::regprocedure;
  if md5(v_src) <> c_depois then raise exception 'status: destino divergente (%)', md5(v_src); end if;
end $$;

-- 9. Pendencia "aditivo a anexar" na lista (prorrogado sem aditivo vivo): patch guardado por md5, 1 ancora ---------------------------
do $$
declare
  v_src text; v_def text;
  c_antes constant text := 'aa12b36208607cfbd62296a216685d55';
  c_depois constant text := '13ce95832cbf88342b1853ea5e6a2c8a';
  c_ancora constant text := E'      v_pend := array_append(v_pend, ''sem_documento'');\n    end if;\n';
  c_novo constant text := E'      v_pend := array_append(v_pend, ''sem_documento'');\n    end if;\n'
    || E'    -- FIN-FINANC-28 passo 5: prorrogado por aditivo exige o aditivo (especie ''aditivo'', vivo)\n'
    || E'    if f.status = ''prorrogado'' and not exists (select 1 from public.financiamento_documentos d where d.financiamento_id = f.id and d.especie = ''aditivo'' and d.cancelado_em is null) then\n'
    || E'      v_pend := array_append(v_pend, ''aditivo_a_anexar'');\n    end if;\n';
begin
  select prosrc into v_src from pg_proc where oid = 'public._fn_financiamento_saldo(uuid,date)'::regprocedure;
  if md5(v_src) <> c_antes then raise exception 'saldo: corpo nao e o esperado (%)', md5(v_src); end if;
  if (length(v_src) - length(replace(v_src, c_ancora, ''))) / length(c_ancora) <> 1 then raise exception 'saldo: ancora nao casa 1x'; end if;
  v_def := pg_get_functiondef('public._fn_financiamento_saldo(uuid,date)'::regprocedure);
  execute replace(v_def, c_ancora, c_novo);
  select prosrc into v_src from pg_proc where oid = 'public._fn_financiamento_saldo(uuid,date)'::regprocedure;
  if md5(v_src) <> c_depois then raise exception 'saldo: destino divergente (%)', md5(v_src); end if;
end $$;

-- 10. ACL -----------------------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.fn_financiamento_baixa(uuid,text,jsonb,boolean)', 'public.fn_financiamento_baixa_desfazer(uuid,text,boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
    if has_function_privilege('anon', f::regprocedure, 'EXECUTE') then raise exception 'anon executa %', f; end if;
  end loop;
  if has_function_privilege('authenticated', 'public._fn_financiamento_baixa_exec(uuid,text,jsonb)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_baixa_encerrar_em_aberto(uuid,text)'::regprocedure, 'EXECUTE') then
    raise exception 'interna aberta a authenticated';
  end if;
end $$;
