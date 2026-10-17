-- FIN-FINANC-28 · P3-FIX4 — QUITACAO AUTOMATICA DO CONTRATO PELO QUE O LANCAMENTO DIZ (Gabriel, 17/10/2026)
--
-- ESTADO ANTERIOR (medido em 17/10/2026, FASE 0):
--   · `fn_financiamento_sincronizar_status` (md5 c5071eba…) decidia "quitado" pela COLUNA `financiamento_parcelas.status`, e so'
--     rodava pelo gatilho `trg_parcelas_sincroniza_status_contrato` (UPDATE OF status, financiamento_id). O parcelamento NAO
--     mantem essa coluna — quem diz se a parcela foi paga e' o LANCAMENTO (`fn_financiamento_situacao`, a regra que a tela mostra
--     em "3 de 6 pagas"). Pagar pelo Financeiro nunca quitava o contrato.
--   · 11 contratos com status "ativo" e TODAS as parcelas nao canceladas pagas pela regra da situacao: NJ (f2d67cd4) 3
--     parcelamentos; a1b2c3d4 2 parcelamentos; a2d41cda 6 financiamentos (esses com a coluna da parcela ja' 'pago' — o gatilho
--     antigo nunca rodou para eles). 0 contratos "quitado" com parcela em aberto.
--
-- A REGRA (espelho DECLARADO do `base`/`der`/`sit` de `fn_financiamento_situacao`, md5 b9f3b1af…: quem mexer num confere o outro):
--   parcela VIVA = status da parcela <> 'cancelado';
--   com lancamento vivo (principal e/ou juros) => paga quando TODOS os lancamentos vivos dela estao 'realizado' ou 'conciliado';
--   sem lancamento vivo => paga quando a coluna da parcela diz 'pago';
--   contrato "ativo" com >= 1 parcela viva e todas pagas => "quitado"; "quitado" com alguma viva nao paga => "ativo" (gesto
--   contrario). SO' ativo <-> quitado: cancelado, rolado (e qualquer outro) NUNCA sao tocados. Vale para TODA natureza.
--
-- QUEM RECALCULA:
--   · `trg_parcelas_sincroniza_status_contrato` (financiamento_parcelas) passa a disparar tambem na troca de `lancamento_id` e
--     `lancamento_juros_id` (recriar o lancamento da parcela);
--   · `trg_zz_lancamento_quita_contrato` (NOVO, financeiro_lancamentos_v2, AFTER UPDATE OF status_transacao, cancelado, so'
--     quando um dos dois muda): acha a parcela pelo `lancamento_id` / `lancamento_juros_id` (indices
--     `idx_fin_parcelas_lancamento_id` / `idx_fin_parcelas_juros_id`) e recalcula o contrato dela. Sem parcela, sai na 1a linha.
--   · a pagamento pelo extrato chega aqui pelo gatilho de promocao do lancamento (status vira 'realizado').
--
-- DONOS: `_fn_financiamento_status_pelas_parcelas(uuid)` (INTERNA, fechada: postgres e service_role) faz a conta e grava;
--   `fn_financiamento_sincronizar_status(uuid)` (publica, authenticated) so' confere o cliente (`tenant_ok`, 42501) e chama a
--   interna. SECURITY DEFINER com search_path = pg_catalog, public em todas.
--   ⚠ DESVIO DECLARADO DO BRIEFING ("GRANT authenticated apos cada create"): a INTERNA nao recebe GRANT a authenticated — com ele,
--   qualquer usuario recalcularia contrato de outro cliente sem a guarda; as funcoes de gatilho recebem (inofensivo: nao se
--   chamam fora de gatilho).
--
-- BACKFILL: os 11 pela propria interna, com GUARDA (aborta se o numero de contratos que mudam nao for exatamente 11 de ativo para
--   quitado e 0 de quitado para ativo). O antes fica em `fin_financ_28_p3fix4_quitacao_backfill` (id, cliente, natureza, status
--   anterior, status novo, em). GESTO CONTRARIO:
--     update public.financiamentos f set status = b.status_anterior, updated_at = now()
--       from public.fin_financ_28_p3fix4_quitacao_backfill b where b.financiamento_id = f.id and f.status = b.status_novo;
--   (com o gatilho novo ligado, o contrato voltaria a quitar na proxima mudanca de parcela/lancamento — desfazer a regra pede
--   tambem repor o corpo antigo, md5 c5071eba…, e derrubar `trg_zz_lancamento_quita_contrato`.)
--
-- Aplicacao com `lock_timeout` 2 s: nao conseguiu a trava, aborta (o CREATE TRIGGER em financeiro_lancamentos_v2 pede trava
-- que barra escrita durante a transacao — curta).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. A interna: a conta e a gravacao -------------------------------------------------------------------------------------------
create or replace function public._fn_financiamento_status_pelas_parcelas(p_financiamento_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text; v_total int; v_pagas int; v_novo text;
begin
  select f.status into v_status from public.financiamentos f where f.id = p_financiamento_id;
  if v_status is null or v_status not in ('ativo', 'quitado') then return v_status; end if;

  select count(*), count(*) filter (where x.paga) into v_total, v_pagas
    from (
      select case
               when lp.id is null and lj.id is null then coalesce(q.status, '') = 'pago'
               else (lp.id is null or lp.status_transacao in ('realizado', 'conciliado'))
                and (lj.id is null or lj.status_transacao in ('realizado', 'conciliado'))
             end as paga
        from public.financiamento_parcelas q
        left join public.financeiro_lancamentos_v2 lp on lp.id = q.lancamento_id and not coalesce(lp.cancelado, false)
        left join public.financeiro_lancamentos_v2 lj on lj.id = q.lancamento_juros_id and not coalesce(lj.cancelado, false)
                                                      and q.lancamento_juros_id is distinct from q.lancamento_id
       where q.financiamento_id = p_financiamento_id and coalesce(q.status, '') <> 'cancelado'
    ) x;

  if v_total = 0 then return v_status; end if;
  v_novo := case when v_pagas = v_total then 'quitado' else 'ativo' end;
  if v_novo <> v_status then
    update public.financiamentos set status = v_novo, updated_at = now() where id = p_financiamento_id and status = v_status;
  end if;
  return v_novo;
end
$$;
revoke all on function public._fn_financiamento_status_pelas_parcelas(uuid) from public, anon, authenticated;
grant execute on function public._fn_financiamento_status_pelas_parcelas(uuid) to service_role;

-- 2. A publica: so' a guarda de cliente + o repasse ----------------------------------------------------------------------------
create or replace function public.fn_financiamento_sincronizar_status(p_financiamento_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_cli uuid;
begin
  select f.cliente_id into v_cli from public.financiamentos f where f.id = p_financiamento_id;
  if v_cli is null or not coalesce(public.tenant_ok(v_cli), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  perform public._fn_financiamento_status_pelas_parcelas(p_financiamento_id);
end
$$;
revoke all on function public.fn_financiamento_sincronizar_status(uuid) from public, anon;
grant execute on function public.fn_financiamento_sincronizar_status(uuid) to authenticated, service_role;

-- 3. Gatilho das parcelas: chama a interna (sem usuario, o gatilho roda como dono) ------------------------------------------------
create or replace function public.trg_financiamento_parcelas_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public._fn_financiamento_status_pelas_parcelas(old.financiamento_id);
    return old;
  end if;
  perform public._fn_financiamento_status_pelas_parcelas(new.financiamento_id);
  if tg_op = 'UPDATE' and new.financiamento_id is distinct from old.financiamento_id then
    perform public._fn_financiamento_status_pelas_parcelas(old.financiamento_id);
  end if;
  return new;
end
$$;
revoke all on function public.trg_financiamento_parcelas_status() from public, anon;
grant execute on function public.trg_financiamento_parcelas_status() to authenticated, service_role;

drop trigger if exists trg_parcelas_sincroniza_status_contrato on public.financiamento_parcelas;
create trigger trg_parcelas_sincroniza_status_contrato
  after insert or delete or update of status, financiamento_id, lancamento_id, lancamento_juros_id
  on public.financiamento_parcelas
  for each row execute function public.trg_financiamento_parcelas_status();

-- 4. Gatilho novo nos lancamentos: pagou / despagou / cancelou -> o contrato da parcela -----------------------------------------
create or replace function public.trg_fn_lancamento_quita_contrato()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r record;
begin
  for r in
    select distinct q.financiamento_id from public.financiamento_parcelas q
     where (q.lancamento_id = new.id or q.lancamento_juros_id = new.id) and q.financiamento_id is not null
  loop
    perform public._fn_financiamento_status_pelas_parcelas(r.financiamento_id);
  end loop;
  return null;
end
$$;
revoke all on function public.trg_fn_lancamento_quita_contrato() from public, anon;
grant execute on function public.trg_fn_lancamento_quita_contrato() to authenticated, service_role;

drop trigger if exists trg_zz_lancamento_quita_contrato on public.financeiro_lancamentos_v2;
create trigger trg_zz_lancamento_quita_contrato
  after update of status_transacao, cancelado on public.financeiro_lancamentos_v2
  for each row
  when (old.status_transacao is distinct from new.status_transacao or old.cancelado is distinct from new.cancelado)
  execute function public.trg_fn_lancamento_quita_contrato();

-- 5. Backfill com guarda e tabela do antes -------------------------------------------------------------------------------------
create table if not exists public.fin_financ_28_p3fix4_quitacao_backfill (
  financiamento_id uuid primary key,
  cliente_id uuid not null,
  natureza text,
  status_anterior text not null,
  status_novo text not null,
  em timestamptz not null default now()
);
alter table public.fin_financ_28_p3fix4_quitacao_backfill enable row level security;
revoke all on public.fin_financ_28_p3fix4_quitacao_backfill from public, anon, authenticated;

do $$
declare r record; v_novo text; v_quitou int := 0; v_reabriu int := 0;
begin
  for r in select f.id, f.cliente_id, f.natureza, f.status from public.financiamentos f where f.status in ('ativo', 'quitado') order by f.id loop
    v_novo := public._fn_financiamento_status_pelas_parcelas(r.id);
    if v_novo is distinct from r.status then
      insert into public.fin_financ_28_p3fix4_quitacao_backfill (financiamento_id, cliente_id, natureza, status_anterior, status_novo)
      values (r.id, r.cliente_id, r.natureza, r.status, v_novo)
      on conflict (financiamento_id) do nothing;
      if v_novo = 'quitado' then v_quitou := v_quitou + 1; else v_reabriu := v_reabriu + 1; end if;
    end if;
  end loop;
  if v_quitou <> 11 or v_reabriu <> 0 then
    raise exception 'FIN-28-P3FIX4 backfill fora do medido: % quitados (esperado 11), % reabertos (esperado 0). Nada foi gravado.', v_quitou, v_reabriu;
  end if;
  raise notice 'FIN-28-P3FIX4 backfill: % contratos ativo -> quitado', v_quitou;
end $$;

-- 6. Conferencia de ACL (aborta se algo ficou aberto a anon/PUBLIC, ou se a interna ficou aberta a authenticated) --------------
do $$
declare f text;
begin
  foreach f in array array['public._fn_financiamento_status_pelas_parcelas(uuid)', 'public.fn_financiamento_sincronizar_status(uuid)',
                           'public.trg_financiamento_parcelas_status()', 'public.trg_fn_lancamento_quita_contrato()'] loop
    if has_function_privilege('anon', f::regprocedure, 'EXECUTE') then raise exception 'anon executa %', f; end if;
  end loop;
  if has_function_privilege('authenticated', 'public._fn_financiamento_status_pelas_parcelas(uuid)'::regprocedure, 'EXECUTE') then
    raise exception 'a interna ficou aberta a authenticated';
  end if;
end $$;
