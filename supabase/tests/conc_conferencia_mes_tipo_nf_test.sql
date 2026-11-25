-- CONC-CONFERENCIA-MES-01 — teste do lote 118810. Roda como postgres + claims de admin, ANTES e DEPOIS do patch na MESMA transação
-- (o bloco lê o "antes", aplica o arquivo da migration colado no meio e lê o "depois"), e termina em RAISE 'ENSAIO OK…' (nada fica).
-- T1 identidade: tirando as 6 chaves novas, `sistema_completo` e o resto da resposta são IGUAIS ao de antes (com o tamanho do conjunto).
-- T2 as chaves novas vêm em toda linha e batem com a tabela (recorrencia_id, numero_documento, tipo_documento, financiamento_id, origem_tipo).
-- T3 eh_folha = existe ligação com a folha. T4 tempo (a Conferência abre por esta função).
-- Recortes reais: NJ conta 3b9afa7a out/26 (266 linhas, 62 de recorrência) e mai/26 (252, 242 com NF).
create or replace function pg_temp.cc_sem_novas(j jsonb) returns jsonb language sql as $$
  select jsonb_set(j, '{sistema_completo}', coalesce((select jsonb_agg(e - 'recorrencia_id' - 'numero_documento' - 'tipo_documento' - 'financiamento_id'
                                                                        - 'origem_tipo' - 'eh_folha' order by ord)
                                                     from jsonb_array_elements(j->'sistema_completo') with ordinality x(e, ord)), '[]'::jsonb))
$$;

-- ═══ ANTES (rodar antes da migration, na mesma transação) ═══
create temp table _cc_antes on commit drop as
select x.conta, x.mes, public.fn_extratos_espelhados('f2d67cd4-24d0-456f-a079-a3281dcce7fd', x.conta, x.mes) j
  from (select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true)) c,
       (values ('3b9afa7a-0af6-4bce-8ec9-03b91484dfd8'::uuid, '2026-10'), ('3b9afa7a-0af6-4bce-8ec9-03b91484dfd8'::uuid, '2026-05')) x(conta, mes);

-- ═══ (aqui entra o arquivo supabase/migrations/20261028118810_conc_conferencia_mes_tipo_nf.sql) ═══

-- ═══ DEPOIS ═══
do $t$
declare r record; d jsonb; v_ok text := ''; n int; t0 timestamptz; seg numeric; e jsonb; l record;
begin
  set local statement_timeout = '60s';
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  for r in select * from _cc_antes loop
    t0 := clock_timestamp();
    d := public.fn_extratos_espelhados('f2d67cd4-24d0-456f-a079-a3281dcce7fd', r.conta, r.mes);
    seg := round(extract(epoch from clock_timestamp() - t0)::numeric, 2);
    n := jsonb_array_length(r.j->'sistema_completo');
    if n = 0 then raise exception 'T1 conjunto vazio em % (prova inválida)', r.mes; end if;
    -- T1 identidade
    if pg_temp.cc_sem_novas(d) <> r.j then raise exception 'T1 % mudou além das 6 chaves novas', r.mes; end if;
    -- T2 as chaves novas batem com a tabela
    for e in select * from jsonb_array_elements(d->'sistema_completo') loop
      if not (e ? 'recorrencia_id' and e ? 'numero_documento' and e ? 'tipo_documento' and e ? 'financiamento_id' and e ? 'origem_tipo' and e ? 'eh_folha') then
        raise exception 'T2 linha sem as chaves novas: %', e->>'lancamento_id'; end if;
      select * into l from financeiro_lancamentos_v2 where id = (e->>'lancamento_id')::uuid;
      if (e->>'recorrencia_id') is distinct from l.recorrencia_id::text or (e->>'numero_documento') is distinct from l.numero_documento
         or (e->>'tipo_documento') is distinct from l.tipo_documento or (e->>'financiamento_id') is distinct from l.financiamento_id::text
         or (e->>'origem_tipo') is distinct from l.origem_tipo then raise exception 'T2 % difere da tabela', e->>'lancamento_id'; end if;
      -- T3 eh_folha
      if (e->>'eh_folha')::boolean is distinct from (exists (select 1 from folha_pessoas f where f.lancamento_id = l.id)
           or exists (select 1 from folha_guias f where f.lancamento_id = l.id) or exists (select 1 from folha_por_fora f where f.lancamento_id = l.id)
           or exists (select 1 from folha_documentos f where f.lancamento_id = l.id)) then raise exception 'T3 eh_folha %', l.id; end if;
    end loop;
    if seg > 2 then raise exception 'T4 % levou % s', r.mes, seg; end if;
    v_ok := v_ok || format('%s: %s linhas iguais fora as 6 chaves · recorrência %s · NF %s · folha %s · %s s | ', r.mes, n,
      (select count(*) from jsonb_array_elements(d->'sistema_completo') x where x->>'recorrencia_id' is not null),
      (select count(*) from jsonb_array_elements(d->'sistema_completo') x where coalesce(x->>'numero_documento', '') <> ''),
      (select count(*) from jsonb_array_elements(d->'sistema_completo') x where (x->>'eh_folha')::boolean), seg);
  end loop;
  raise exception 'ENSAIO OK conc conferência tipo/NF · % corpo md5 %', v_ok,
    (select md5(prosrc) from pg_proc where oid = 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure);
end $t$;
