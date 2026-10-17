-- FIN-FINANC-28 · FIN-LANC-DESCRICAO-CONTRATO-01 (Gabriel 17/10/2026) — a descricao dos lancamentos GERADOS pelo contrato segue o
-- cadastro do contrato: o banco monta, a tela so' mostra.
--   Captacao        "Captação · <nº> · <descricao>"
--   Amortizacao     "Amortização <i>/<N> · <nº> · <descricao>"
--   Juros           "Juros <i>/<N> · <nº> · <descricao>"
--   Consorcio       "Consórcio <grupo/cota> · Parc <i>/<N>"  (taxa: "Taxa adm. e seguro · <grupo/cota> · Parc <i>/<N>")
--   Compra parcelada NAO MUDA: "<descricao> i/N" (`_fn_parcela_descricao`, PARC-LIVRES-01 passo 5) — so' as defasadas sao refeitas.
--   Nº VALIDO = contem ao menos um digito; senao o pedaco sai (sem " ·  · ").
-- GERADO = lancamento vivo, sem lote de importacao, com a origem do motor / da captacao. O que o operador VINCULOU (o pagamento
-- do 4b, encargos, importados) nao muda.
-- Partes:
--   1. `_fn_financiamento_descricao_lancamento` (pura: so' argumentos, nao le' tabela). ⚠ DESVIO DECLARADO: tem EXECUTE para
--      `authenticated` porque o motor (`fn_reconciliar_parcela_financiamento`) e' SECURITY INVOKER e a chama; nao le' dado nenhum.
--   2. O motor passa a usar a funcao (patch guardado por md5, 1 trecho).
--   3. `_fn_financiamento_redescrever(contrato)` + gatilho `trg_zz_financiamento_redescrever` (AFTER UPDATE OF numero_contrato,
--      descricao, natureza, total_parcelas, lancamento_captacao_id): refaz os gerados vivos do contrato. Parcelamento fica fora do
--      gatilho (a renomeacao da compra tem o dialogo de escopo, `fn_parcelamento_propagar`). As duas internas: sem GRANT.
--   4. Backfill com a tabela de antes `fin_lanc_descricao_contrato_backfill` (RLS ligada, sem acesso para anon/authenticated).
--      ⚠ O UPDATE carimba `updated_at`/`updated_by` (gatilho da tabela) e grava `audit_log` 'editou' — aceito.
--   GESTO CONTRARIO (rollback do backfill):
--      update public.financeiro_lancamentos_v2 l set descricao = b.descricao_antiga
--        from public.fin_lanc_descricao_contrato_backfill b where b.lancamento_id = l.id and l.descricao = b.descricao_nova;
set local lock_timeout = '2s';

-- 1 ── a funcao unica da descricao ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._fn_financiamento_descricao_lancamento(
  p_tipo text, p_natureza text, p_numero text, p_descricao text, p_i integer, p_n integer, p_grupo_cota text default null)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $f$
declare
  v_num text := case when coalesce(p_numero, '') ~ '[0-9]' then btrim(p_numero) end;
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_parc text := coalesce(p_i::text, '?') || '/' || coalesce(p_n::text, '?');
  v_gc text := nullif(btrim(coalesce(p_grupo_cota, '')), '');
begin
  if p_tipo = 'captacao' then
    return concat_ws(' · ', 'Captação', v_num, v_desc);
  end if;
  if p_natureza = 'parcelamento' and p_tipo = 'principal' then
    return public._fn_parcela_descricao(coalesce(v_desc, ''), p_i, p_n);
  end if;
  if p_natureza = 'consorcio' then
    if p_tipo = 'juros' then return concat_ws(' · ', 'Taxa adm. e seguro', v_gc, 'Parc ' || v_parc); end if;
    return concat_ws(' · ', 'Consórcio' || coalesce(' ' || v_gc, ''), 'Parc ' || v_parc);
  end if;
  if p_tipo = 'juros' then
    return concat_ws(' · ', 'Juros ' || v_parc, v_num, v_desc);
  end if;
  return concat_ws(' · ', 'Amortização ' || v_parc, v_num, v_desc);
end $f$;
revoke all on function public._fn_financiamento_descricao_lancamento(text, text, text, text, integer, integer, text) from public, anon;
grant execute on function public._fn_financiamento_descricao_lancamento(text, text, text, text, integer, integer, text) to authenticated, service_role;

-- 2 ── o motor usa a funcao ────────────────────────────────────────────────────────────────────────────────────────────────────
do $patch$
declare
  v_src text; v_def text; v_ini int; v_fim int; v_novo text;
  c_origem constant text := 'cf810a2c63d64912bafbb7bf57342698';
  c_destino constant text := 'ca34e617bfe992d6ae101b265e18f35a';
begin
  select prosrc into v_src from pg_proc where oid = 'public.fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid)'::regprocedure;
  if md5(v_src) = c_destino then raise notice 'motor ja no destino'; return; end if;
  if md5(v_src) <> c_origem then raise exception 'motor fora da origem: %', md5(v_src); end if;
  if (select count(*) from regexp_matches(v_src, 'v_desc_p := CASE WHEN v_contrato\.natureza', 'g')) <> 1
     or (select count(*) from regexp_matches(v_src, E'\n\n  v_vt_calc :=', 'g')) <> 1 then raise exception 'ancoras do motor'; end if;
  v_ini := position('v_desc_p := CASE WHEN v_contrato.natureza' in v_src);
  v_fim := position(E'\n\n  v_vt_calc :=' in v_src);
  v_novo := substr(v_src, 1, v_ini - 1)
    || $n$v_desc_p := public._fn_financiamento_descricao_lancamento('principal', v_contrato.natureza, v_contrato.numero_contrato,
    v_contrato.descricao, v_parcela.numero_parcela, v_contrato.total_parcelas,
    (SELECT concat_ws('/', c.grupo, c.cota) FROM public.financiamento_consorcio c WHERE c.financiamento_id = v_contrato.id));
  v_desc_j := public._fn_financiamento_descricao_lancamento('juros', v_contrato.natureza, v_contrato.numero_contrato,
    v_contrato.descricao, v_parcela.numero_parcela, v_contrato.total_parcelas,
    (SELECT concat_ws('/', c.grupo, c.cota) FROM public.financiamento_consorcio c WHERE c.financiamento_id = v_contrato.id));$n$
    || substr(v_src, v_fim);
  if md5(v_novo) <> c_destino then raise exception 'motor destino: %', md5(v_novo); end if;
  select pg_get_functiondef('public.fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, v_src, v_novo);
  execute v_def;
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid)'::regprocedure) <> c_destino
    then raise exception 'motor nao gravou'; end if;
end $patch$;

-- 3 ── refazer os gerados de um contrato, e o gatilho ──────────────────────────────────────────────────────────────────────────
create or replace function public._fn_financiamento_redescrever(p_financiamento_id uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $f$
declare v_n integer;
begin
  with f as (
    select f.*, (select concat_ws('/', c.grupo, c.cota) from public.financiamento_consorcio c where c.financiamento_id = f.id) gc
      from public.financiamentos f where f.id = p_financiamento_id and f.natureza <> 'parcelamento'),
  alvo as (
    select l.id, public._fn_financiamento_descricao_lancamento('captacao', f.natureza, f.numero_contrato, f.descricao, null, f.total_parcelas, f.gc) nova
      from f join public.financeiro_lancamentos_v2 l on l.id = f.lancamento_captacao_id
     where not coalesce(l.cancelado, false) and l.lote_importacao_id is null and l.origem_tipo = 'financiamento_captacao'
    union all
    select l.id, public._fn_financiamento_descricao_lancamento('principal', f.natureza, f.numero_contrato, f.descricao, p.numero_parcela, f.total_parcelas, f.gc)
      from f join public.financiamento_parcelas p on p.financiamento_id = f.id and p.status <> 'cancelado'
      join public.financeiro_lancamentos_v2 l on l.id = p.lancamento_id
     where not coalesce(l.cancelado, false) and l.lote_importacao_id is null
       and (l.origem_lancamento = 'parcela_financiamento' or l.origem_tipo = 'parcela_principal')
    union all
    select l.id, public._fn_financiamento_descricao_lancamento('juros', f.natureza, f.numero_contrato, f.descricao, p.numero_parcela, f.total_parcelas, f.gc)
      from f join public.financiamento_parcelas p on p.financiamento_id = f.id and p.status <> 'cancelado'
      join public.financeiro_lancamentos_v2 l on l.id = p.lancamento_juros_id
     where not coalesce(l.cancelado, false) and l.lote_importacao_id is null
       and (l.origem_lancamento = 'parcela_financiamento' or l.origem_tipo = 'parcela_juros'))
  update public.financeiro_lancamentos_v2 l set descricao = a.nova
    from alvo a where l.id = a.id and l.descricao is distinct from a.nova;
  get diagnostics v_n = row_count;
  return v_n;
end $f$;
revoke all on function public._fn_financiamento_redescrever(uuid) from public, anon, authenticated;

create or replace function public._fn_financiamento_redescrever_trg()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $f$
begin
  perform public._fn_financiamento_redescrever(new.id);
  return null;
end $f$;
revoke all on function public._fn_financiamento_redescrever_trg() from public, anon, authenticated;

drop trigger if exists trg_zz_financiamento_redescrever on public.financiamentos;
create trigger trg_zz_financiamento_redescrever
  after update of numero_contrato, descricao, natureza, total_parcelas, lancamento_captacao_id on public.financiamentos
  for each row
  when (old.numero_contrato is distinct from new.numero_contrato or old.descricao is distinct from new.descricao
        or old.natureza is distinct from new.natureza or old.total_parcelas is distinct from new.total_parcelas
        or old.lancamento_captacao_id is distinct from new.lancamento_captacao_id)
  execute function public._fn_financiamento_redescrever_trg();

-- 4 ── backfill, com a tabela de antes ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_lanc_descricao_contrato_backfill (
  lancamento_id uuid primary key,
  cliente_id uuid not null,
  financiamento_id uuid not null,
  tipo text not null,
  descricao_antiga text,
  descricao_nova text not null,
  em timestamptz not null default now()
);
alter table public.fin_lanc_descricao_contrato_backfill enable row level security;
revoke all on public.fin_lanc_descricao_contrato_backfill from public, anon, authenticated;

with f as (
  select f.*, (select concat_ws('/', c.grupo, c.cota) from public.financiamento_consorcio c where c.financiamento_id = f.id) gc
    from public.financiamentos f),
alvo as (
  select l.id, l.cliente_id, f.id fin, 'captacao' tipo, l.descricao antiga,
         public._fn_financiamento_descricao_lancamento('captacao', f.natureza, f.numero_contrato, f.descricao, null, f.total_parcelas, f.gc) nova
    from f join public.financeiro_lancamentos_v2 l on l.id = f.lancamento_captacao_id
   where f.natureza <> 'parcelamento' and not coalesce(l.cancelado, false) and l.lote_importacao_id is null and l.origem_tipo = 'financiamento_captacao'
  union all
  select l.id, l.cliente_id, f.id, case when f.natureza = 'parcelamento' then 'parcelamento' else 'amortizacao' end, l.descricao,
         public._fn_financiamento_descricao_lancamento('principal', f.natureza, f.numero_contrato, f.descricao, p.numero_parcela, f.total_parcelas, f.gc)
    from f join public.financiamento_parcelas p on p.financiamento_id = f.id and p.status <> 'cancelado'
    join public.financeiro_lancamentos_v2 l on l.id = p.lancamento_id
   where not coalesce(l.cancelado, false) and l.lote_importacao_id is null
     and (l.origem_lancamento = 'parcela_financiamento' or l.origem_tipo = 'parcela_principal')
  union all
  select l.id, l.cliente_id, f.id, 'juros', l.descricao,
         public._fn_financiamento_descricao_lancamento('juros', f.natureza, f.numero_contrato, f.descricao, p.numero_parcela, f.total_parcelas, f.gc)
    from f join public.financiamento_parcelas p on p.financiamento_id = f.id and p.status <> 'cancelado'
    join public.financeiro_lancamentos_v2 l on l.id = p.lancamento_juros_id
   where f.natureza <> 'parcelamento' and not coalesce(l.cancelado, false) and l.lote_importacao_id is null
     and (l.origem_lancamento = 'parcela_financiamento' or l.origem_tipo = 'parcela_juros'))
insert into public.fin_lanc_descricao_contrato_backfill (lancamento_id, cliente_id, financiamento_id, tipo, descricao_antiga, descricao_nova)
select id, cliente_id, fin, tipo, antiga, nova from alvo where antiga is distinct from nova
on conflict (lancamento_id) do nothing;

update public.financeiro_lancamentos_v2 l set descricao = b.descricao_nova
  from public.fin_lanc_descricao_contrato_backfill b
 where b.lancamento_id = l.id and l.descricao is distinct from b.descricao_nova and l.descricao is not distinct from b.descricao_antiga;
