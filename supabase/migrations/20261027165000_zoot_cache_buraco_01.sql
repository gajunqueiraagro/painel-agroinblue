-- 20261027165000_zoot_cache_buraco_01.sql
-- ZOOT-CACHE-BURACO-01: o `zoot_mensal_cache` deixa de ficar VAZIO depois de uma gravacao. Decisao do Gabriel (28/09/2026):
-- opcao (d) da FASE 0, sem o aviso visual no DRE (frente propria ZOOT-CACHE-AVISO-01).
--
-- O DEFEITO: os gatilhos `trg_invalidate_zoot_cache*` APAGAVAM o (fazenda, ano) inteiro e nao reconstruiam; so' o hook de tela
-- `useZootCategoriaMensal` reconstruia, quando alguem abria aquele ano. O DRE e mais ~17 leitores liam o cache sem garantir.
-- Casos de 28/09: RRCC 2021, NJ Sta. Luzia 2020/2022 (CACHE-RRCC-2021-01 — NJ 2020 com VBP 2,48 mi inflado, porque o P0 caia em
-- 'zero') e Faz. Sta. Rita 2025 (OC-VENDA-ENTREGAS-01).
--
-- O QUE MUDA:
--   1. `zoot_cache_sujo (fazenda_id, ano, marcado_em)`: a marca do que precisa reconstruir. RLS ligada SEM policy e sem grant ao
--      front — so' funcoes SECURITY DEFINER leem e escrevem.
--   2. Os quatro gatilhos de invalidacao (lancamentos, fechamento_pastos, fechamento_pasto_itens, saldos_iniciais) MARCAM os
--      MESMOS (fazenda, ano) que antes apagavam — novo e antigo. O cache antigo FICA ate' o novo entrar. A cascata do saldo de
--      dezembro (`trg_propagar_saldo_dezembro` -> saldos_iniciais do ano seguinte) segue coberta pelo gatilho de saldos_iniciais.
--   3. `trg_zoot_cache_reconstruir`: gatilho de constraint DEFERRABLE INITIALLY DEFERRED em `zoot_cache_sujo`. No fim da
--      transacao, cada evento reconstroi o seu (fazenda, ano) SE ainda estiver marcado e o desmarca; os eventos seguintes do mesmo
--      par acham a marca limpa e pulam — UMA reconstrucao por fazenda-ano, por maior que seja o lote.
--      ⚠ FALHA NA RECONSTRUCAO NAO DERRUBA A GRAVACAO: o erro e' engolido num bloco proprio, a marca FICA e o pg_cron tenta de novo.
--      Antes nada disso existia porque apagar nao falha; reconstruir pode.
--   4. `refresh_zoot_cache(fazenda, ano)`: `pg_advisory_xact_lock` por (fazenda, ano) antes de apagar e inserir. Duas chamadas ao
--      mesmo par se enfileiram, e a segunda (READ COMMITTED) ja' ve as linhas da primeira — sem erro de chave. Assinatura igual.
--      ⚠ So' a de dois argumentos (a do escopo); as sobrecargas por cenario e por mes seguem sem trava.
--   5. pg_cron `zoot_cache_sujo_reconstruir`, a cada 5 min: reconstroi o que ainda estiver marcado.
--   6. `fn_zoot_cache_buracos(cliente)`: a sentinela, so' leitura — (a) fazenda-ano com fechamento, lancamento ou saldo inicial e
--      nenhuma linha no cache; (b) mes com rebanho no fechamento sem linha no cache.
--   7. Sai o gatilho `trg_refresh_cache_reclassificacao` (tabela `reclassificacoes` parada desde 24/04; apagava o cache do CLIENTE
--      inteiro). A funcao `refresh_zoot_cache_reclassificacao` FICA, sem chamador — o banco e' do arquiteto.
--
-- PATCH GUARDADO POR md5 (origem e destino) nas funcoes que ja existiam:
--   trg_fn_invalidate_zoot_cache                   a99396a9bc46e91314a4f5b6eace3b90 -> 6cedc89f2a9ebd1945108d218a54ec34
--   trg_fn_invalidate_zoot_cache_fechamento        12fc80e48a4f39d3e75bc79482a032ff -> bfd007fc7fd853a37d92b4aaa4fc620e
--   trg_fn_invalidate_zoot_cache_fechamento_itens  0c9a2252596480f9c9285b88c11af58f -> 51f8468ffce128fc8a23f33a3b411220
--   trg_fn_invalidate_zoot_cache_saldos_iniciais   30447c9bd78e0714372151ff9556c6c7 -> a49a4e0daa1c0e256c18885343d96981
--   refresh_zoot_cache(uuid, integer)              9d2ef6330b40984331d03e80c0ec6294 -> c6a682c7b184aeaa8e817e4327d27d4f
-- PROVA (rollback no proto, 28/09/2026, antes de aplicar):
--   a. insert/update/delete de lancamento de teste (Pureza 2026): cache ficou 199 linhas com o par marcado; no fim da transacao
--      marca 0 e diferenca contra `fn_zoot_categoria_mensal` 0; saidas de set 1 -> 3 -> 0.
--   b. item de fechamento_pasto_itens (Pureza mar/26): cache 199 o tempo todo, diferenca 0. Dezembro -> janeiro (Pureza dez/24
--      reaberto, +1 cab, fechado): saldo inicial 2025 5.425 -> 5.426, marcou 2024 e 2025, cache 2025 162 linhas o tempo todo,
--      saldo inicial de jan/25 no cache 5.425 -> 5.426, diferenca 0 em 2024 e em 2025.
--   c. 500 lancamentos numa transacao (Pureza + Sto. Expedito): insert 3,2 s, reconstrucao 2,0 s, UMA por fazenda-ano.
--   d. duas sessoes: nao reproduzivel no canal MCP (serializa as chamadas; dblink nao instalado). Vale a trava no corpo.
--   e. sentinela: 0 linhas nos 7 clientes; com o cache da Sta. Rita 2025 apagado, acha o ano e os 12 meses.
--   f. fn_dre_pecuaria NJ 2020 e Santa Rita 2025: jsonb identico antes e depois da reconstrucao pelo caminho novo.

-- ── guarda de origem ──
do $g$
declare r record;
begin
  for r in select * from (values
      ('trg_fn_invalidate_zoot_cache', '', 'a99396a9bc46e91314a4f5b6eace3b90'),
      ('trg_fn_invalidate_zoot_cache_fechamento', '', '12fc80e48a4f39d3e75bc79482a032ff'),
      ('trg_fn_invalidate_zoot_cache_fechamento_itens', '', '0c9a2252596480f9c9285b88c11af58f'),
      ('trg_fn_invalidate_zoot_cache_saldos_iniciais', '', '30447c9bd78e0714372151ff9556c6c7'),
      ('refresh_zoot_cache', 'p_fazenda_id uuid, p_ano integer', '9d2ef6330b40984331d03e80c0ec6294')) v(n, a, m)
  loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.n
                     and pg_get_function_identity_arguments(p.oid) = r.a and md5(p.prosrc) = r.m) then
      raise exception 'ZOOT-CACHE-BURACO-01: % (%) fora do corpo esperado', r.n, r.a;
    end if;
  end loop;
  if to_regclass('public.zoot_cache_sujo') is not null then
    raise exception 'ZOOT-CACHE-BURACO-01: zoot_cache_sujo ja existe';
  end if;
end $g$;

-- ── 1. a marca ──
create table public.zoot_cache_sujo (
  fazenda_id uuid not null,
  ano        integer not null,
  marcado_em timestamptz not null default now(),
  primary key (fazenda_id, ano)
);
alter table public.zoot_cache_sujo enable row level security;
revoke all on table public.zoot_cache_sujo from public, anon, authenticated;

create or replace function public._zoot_cache_marcar(p_fazenda_id uuid, p_ano integer)
returns void language sql security definer set search_path to 'pg_catalog', 'public'
as $f$
  insert into public.zoot_cache_sujo (fazenda_id, ano) values (p_fazenda_id, p_ano)
  on conflict (fazenda_id, ano) do update set marcado_em = now();
$f$;
revoke all on function public._zoot_cache_marcar(uuid, integer) from public, anon, authenticated;

-- ── 2. os gatilhos marcam em vez de apagar ──
create or replace function public.trg_fn_invalidate_zoot_cache()
returns trigger language plpgsql security definer set search_path to 'public'
as $f$
DECLARE
  v_old_faz uuid; v_old_ano int;
  v_new_faz uuid; v_new_ano int;
BEGIN
  -- ZOOT-CACHE-BURACO-01: marca o (fazenda, ano); a reconstrucao e' no fim da transacao (trg_zoot_cache_reconstruir).
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_new_faz := NEW.fazenda_id;
    v_new_ano := EXTRACT(year FROM NEW.data)::int;
    IF v_new_faz IS NOT NULL AND v_new_ano IS NOT NULL THEN
      PERFORM public._zoot_cache_marcar(v_new_faz, v_new_ano);
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_old_faz := OLD.fazenda_id;
    v_old_ano := EXTRACT(year FROM OLD.data)::int;
    IF (TG_OP = 'DELETE' OR v_old_faz IS DISTINCT FROM v_new_faz OR v_old_ano IS DISTINCT FROM v_new_ano)
       AND v_old_faz IS NOT NULL AND v_old_ano IS NOT NULL THEN
      PERFORM public._zoot_cache_marcar(v_old_faz, v_old_ano);
    END IF;
  END IF;
  RETURN NULL;
END;
$f$;

create or replace function public.trg_fn_invalidate_zoot_cache_fechamento()
returns trigger language plpgsql security definer set search_path to 'public'
as $f$
BEGIN
  -- ZOOT-CACHE-BURACO-01: marca em vez de apagar.
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.ano_mes IS NOT NULL AND NEW.fazenda_id IS NOT NULL THEN
    PERFORM public._zoot_cache_marcar(NEW.fazenda_id, EXTRACT(year FROM (NEW.ano_mes || '-01')::date)::integer);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.ano_mes IS NOT NULL AND OLD.fazenda_id IS NOT NULL THEN
    PERFORM public._zoot_cache_marcar(OLD.fazenda_id, EXTRACT(year FROM (OLD.ano_mes || '-01')::date)::integer);
  END IF;
  RETURN NULL;
END;
$f$;

create or replace function public.trg_fn_invalidate_zoot_cache_fechamento_itens()
returns trigger language plpgsql security definer set search_path to 'public'
as $f$
BEGIN
  -- ZOOT-CACHE-BURACO-01: marca os (fazenda, ano) do comando inteiro, uma vez cada.
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.zoot_cache_sujo (fazenda_id, ano)
    SELECT DISTINCT fp.fazenda_id, EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer
      FROM novos n JOIN public.fechamento_pastos fp ON fp.id = n.fechamento_id
     WHERE fp.ano_mes IS NOT NULL AND fp.fazenda_id IS NOT NULL
    ON CONFLICT (fazenda_id, ano) DO UPDATE SET marcado_em = now();
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.zoot_cache_sujo (fazenda_id, ano)
    SELECT DISTINCT fp.fazenda_id, EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer
      FROM antigos a JOIN public.fechamento_pastos fp ON fp.id = a.fechamento_id
     WHERE fp.ano_mes IS NOT NULL AND fp.fazenda_id IS NOT NULL
    ON CONFLICT (fazenda_id, ano) DO UPDATE SET marcado_em = now();
  ELSE
    INSERT INTO public.zoot_cache_sujo (fazenda_id, ano)
    SELECT DISTINCT fp.fazenda_id, EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer
      FROM (SELECT fechamento_id FROM novos UNION SELECT fechamento_id FROM antigos) t
      JOIN public.fechamento_pastos fp ON fp.id = t.fechamento_id
     WHERE fp.ano_mes IS NOT NULL AND fp.fazenda_id IS NOT NULL
    ON CONFLICT (fazenda_id, ano) DO UPDATE SET marcado_em = now();
  END IF;
  RETURN NULL;
END;
$f$;

create or replace function public.trg_fn_invalidate_zoot_cache_saldos_iniciais()
returns trigger language plpgsql security definer set search_path to 'public'
as $f$
BEGIN
  -- ZOOT-CACHE-BURACO-01: marca em vez de apagar. Cobre a cascata do saldo de dezembro para o ano seguinte.
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.ano IS NOT NULL AND NEW.fazenda_id IS NOT NULL THEN
    PERFORM public._zoot_cache_marcar(NEW.fazenda_id, NEW.ano);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.ano IS NOT NULL AND OLD.fazenda_id IS NOT NULL THEN
    PERFORM public._zoot_cache_marcar(OLD.fazenda_id, OLD.ano);
  END IF;
  RETURN NULL;
END;
$f$;

-- ── 4. a trava em refresh_zoot_cache(fazenda, ano) ──
do $p$
declare v_src text; v_novo text; a text; b text;
begin
  select prosrc into v_src from pg_proc where pronamespace = 'public'::regnamespace and proname = 'refresh_zoot_cache'
     and pg_get_function_identity_arguments(oid) = 'p_fazenda_id uuid, p_ano integer';
  a := E'BEGIN\n  DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano;';
  b := E'BEGIN\n'
    || E'  -- ZOOT-CACHE-BURACO-01: duas chamadas ao mesmo (fazenda, ano) se enfileiram; a segunda ja'' ve as linhas da primeira.\n'
    || E'  PERFORM pg_advisory_xact_lock(hashtextextended(''zoot_mensal_cache:'' || p_fazenda_id::text || '':'' || p_ano::text, 0));\n'
    || E'  DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano;';
  if (length(v_src) - length(replace(v_src, a, ''))) / length(a) <> 1 then
    raise exception 'ZOOT-CACHE-BURACO-01: ancora de refresh_zoot_cache nao casa 1x'; end if;
  v_novo := replace(v_src, a, b);
  execute 'CREATE OR REPLACE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer)'
       || ' RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $f$' || v_novo || '$f$';
end $p$;

-- ── 3. a reconstrucao no fim da transacao ──
create or replace function public.trg_fn_zoot_cache_reconstruir()
returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public'
as $f$
BEGIN
  -- ⚠ UMA POR PAR: so' reconstroi se a marca ainda existe; o primeiro evento do par a apaga, os seguintes pulam.
  IF NOT EXISTS (SELECT 1 FROM public.zoot_cache_sujo WHERE fazenda_id = NEW.fazenda_id AND ano = NEW.ano) THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM public.refresh_zoot_cache(NEW.fazenda_id, NEW.ano);
    DELETE FROM public.zoot_cache_sujo WHERE fazenda_id = NEW.fazenda_id AND ano = NEW.ano;
  EXCEPTION WHEN OTHERS THEN
    -- ⚠ A GRAVACAO DE QUEM ESCREVEU NAO CAI: a marca fica, o cache antigo fica, e o pg_cron tenta de novo.
    RAISE WARNING 'ZOOT-CACHE-BURACO-01: reconstrucao de (%, %) falhou: % — fica para o pg_cron', NEW.fazenda_id, NEW.ano, SQLERRM;
  END;
  RETURN NULL;
END;
$f$;
revoke all on function public.trg_fn_zoot_cache_reconstruir() from public, anon, authenticated;

create constraint trigger trg_zoot_cache_reconstruir
  after insert or update on public.zoot_cache_sujo
  deferrable initially deferred
  for each row execute function public.trg_fn_zoot_cache_reconstruir();

-- ── 5. a varredura agendada ──
create or replace function public.fn_zoot_cache_reconstruir_sujos()
returns integer language plpgsql security definer set search_path to 'pg_catalog', 'public'
as $f$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT fazenda_id, ano FROM public.zoot_cache_sujo ORDER BY marcado_em LOOP
    BEGIN
      PERFORM public.refresh_zoot_cache(r.fazenda_id, r.ano);
      DELETE FROM public.zoot_cache_sujo WHERE fazenda_id = r.fazenda_id AND ano = r.ano;
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ZOOT-CACHE-BURACO-01: varredura nao reconstruiu (%, %): %', r.fazenda_id, r.ano, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END;
$f$;
revoke all on function public.fn_zoot_cache_reconstruir_sujos() from public, anon, authenticated;

select cron.schedule('zoot_cache_sujo_reconstruir', '*/5 * * * *', 'select public.fn_zoot_cache_reconstruir_sujos()');

-- ── 6. a sentinela ──
create or replace function public.fn_zoot_cache_buracos(p_cliente uuid)
returns table (tipo text, fazenda_id uuid, fazenda text, ano integer, meses text)
language sql stable security invoker set search_path to 'pg_catalog', 'public'
as $f$
  with faz as (select f.id, f.nome from fazendas f where f.cliente_id = p_cliente),
  fonte as (
    select i.fazenda_id, left(i.ano_mes, 4)::int ano from valor_rebanho_fechamento_itens i join faz on faz.id = i.fazenda_id group by 1, 2
    union
    select l.fazenda_id, extract(year from l.data)::int from lancamentos l join faz on faz.id = l.fazenda_id
     where coalesce(l.cancelado, false) = false and l.cenario = 'realizado' group by 1, 2
    union
    select s.fazenda_id, s.ano from saldos_iniciais s join faz on faz.id = s.fazenda_id where s.quantidade > 0 group by 1, 2
  )
  select 'ano_sem_cache'::text, fo.fazenda_id, faz.nome, fo.ano, null::text
    from fonte fo join faz on faz.id = fo.fazenda_id
   where not exists (select 1 from zoot_mensal_cache z where z.fazenda_id = fo.fazenda_id and z.ano = fo.ano and z.cenario = 'realizado')
  union all
  select 'mes_com_rebanho_sem_cache'::text, v.fazenda_id, faz.nome, left(v.ano_mes, 4)::int, string_agg(v.ano_mes, ',' order by v.ano_mes)
    from (select i.fazenda_id, i.ano_mes from valor_rebanho_fechamento_itens i join faz on faz.id = i.fazenda_id
           group by 1, 2 having sum(i.quantidade) > 0) v
    join faz on faz.id = v.fazenda_id
   where not exists (select 1 from zoot_mensal_cache z where z.fazenda_id = v.fazenda_id and z.ano_mes = v.ano_mes and z.cenario = 'realizado')
   group by 1, 2, 3, 4
   order by 1, 3, 4;
$f$;
revoke all on function public.fn_zoot_cache_buracos(uuid) from public, anon;
grant execute on function public.fn_zoot_cache_buracos(uuid) to authenticated, service_role;

-- ── 7. sai o gatilho da tabela antiga ──
drop trigger if exists trg_refresh_cache_reclassificacao on public.reclassificacoes;

-- ── guarda de destino ──
do $g$
declare r record;
begin
  for r in select * from (values
      ('trg_fn_invalidate_zoot_cache', '', '6cedc89f2a9ebd1945108d218a54ec34'),
      ('trg_fn_invalidate_zoot_cache_fechamento', '', 'bfd007fc7fd853a37d92b4aaa4fc620e'),
      ('trg_fn_invalidate_zoot_cache_fechamento_itens', '', '51f8468ffce128fc8a23f33a3b411220'),
      ('trg_fn_invalidate_zoot_cache_saldos_iniciais', '', 'a49a4e0daa1c0e256c18885343d96981'),
      ('refresh_zoot_cache', 'p_fazenda_id uuid, p_ano integer', 'c6a682c7b184aeaa8e817e4327d27d4f')) v(n, a, m)
  loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.n
                     and pg_get_function_identity_arguments(p.oid) = r.a and md5(p.prosrc) = r.m) then
      raise exception 'ZOOT-CACHE-BURACO-01: % (%) com destino inesperado', r.n, r.a;
    end if;
  end loop;
end $g$;
