-- P103 item 4 — fn_vg_analise (migration 20261028111954): o GRAFICO no ACUMULADO. Como `authenticated` (admin); TERMINA EM RAISE:
-- nada fica. Periodo jan–dez/26, mes out/26, R$, todas as contas. Em TODO no' do Agnaldo e do NJ (a raiz de cada lado, todo grupo,
-- atividade, centro e SUBCENTRO):
--   A1 a coluna do mes escolhido no grafico acumulado (`serie[out/26].total`) = o valor "Acum." do no' na tabela (a da esquerda, no
--      nivel dele; o subcentro, na da direita), ao centavo; a meta da coluna = a meta acumulada da tabela;
--   A2 a coluna cresce mes a mes pelo que o mes somou: total[k] = total[k-1] + (o total do mes k no criterio mes) — a soma ao centavo
--      dos valores do mes (cada um ja' arredondado; sem lancamento no mes, igual ao anterior);
--   A3 sem a linha da media (todo `media` nulo) e os KPIs: `mes` = o acumulado, `meta` = a meta acumulada, sem media nem tendencia.
--   MUTACOES (no proprio teste): mut 1 le a coluna do criterio MES (a de antes: A1 tem de falhar); mut 2 le a coluna do MES ANTERIOR
--      (um deslocamento: A1 tem de falhar).
-- O NJ (≈ 1,3 s por chamada) roda em lotes: pg_temp.vgac(cliente, offset, limit, mut) devolve o resumo do lote.
set local statement_timeout = '900s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.vgac(k uuid, desloc int default 0, lim int default 1000, mut int default 0) returns text language plpgsql as $f$
declare
  r record; a jsonb; m jsonb; col jsonb; lin jsonb; foco text[]; e text[] := '{}'; n int := 0;
begin
  for r in
    select * from (
      select distinct x.lado, (array[x.grupo, x.atividade, x.centro, x.subcentro])[1:case x.nivel when 'grupo' then 1 when 'atividade' then 2 when 'centro' then 3 else 4 end] as no
        from public.fn_vg_serie(k, '2026-01-01', '2026-12-31', null, null, null, null, '2026-10-24', null, true) x
       where x.nivel in ('grupo', 'atividade', 'centro', 'subcentro')
      union select l, '{}'::text[] from unnest(array['entrada', 'saida']) l) z
     order by lado, cardinality(no), no offset desloc limit lim
  loop
    n := n + 1;
    foco := case when cardinality(r.no) = 4 then r.no[1:3] else r.no end;
    a := public.fn_vg_analise(k, '2026-01-01', '2026-12-31', '2026-10', r.lado, r.no[1], foco, r.no, 'acumulado', 'rs',
                              null, null, null, '2026-10-24', null, true);
    -- a linha do no' na tabela: subcentro na da direita; os outros, na da esquerda (o total do nivel ou um dos filhos)
    lin := case when cardinality(r.no) = 4
                then (select x from jsonb_array_elements(a #> '{foco,linhas}') x where x -> 'caminho' = to_jsonb(r.no))
                else (select x from jsonb_array_elements((a #> '{tabela,linhas}') || jsonb_build_array(a #> '{tabela,total}')) x
                       where x -> 'caminho' = to_jsonb(r.no) limit 1) end;
    if mut = 1 then
      m := public.fn_vg_analise(k, '2026-01-01', '2026-12-31', '2026-10', r.lado, r.no[1], foco, r.no, 'mes', 'rs', null, null, null, '2026-10-24', null, true);
      col := (select x from jsonb_array_elements(m #> '{grafico,serie}') x where x ->> 'am' = '2026-10');
    else
      col := (select x from jsonb_array_elements(a #> '{grafico,serie}') x where x ->> 'am' = case when mut = 2 then '2026-09' else '2026-10' end);
    end if;
    if lin is null then
      e := e || format('%s %s: no'' fora da tabela', r.lado, array_to_string(r.no, '>', '-'));
    elsif (col -> 'total') is distinct from (lin -> 'valor') or (col -> 'meta') is distinct from (lin -> 'meta') then
      e := e || format('%s %s: coluna %s / meta %s <> tabela %s / meta %s', r.lado, array_to_string(r.no, '>', '-'),
                       col ->> 'total', col ->> 'meta', lin ->> 'valor', lin ->> 'meta');
    end if;
    if mut = 0 then
      -- A2: o passo de cada mes = o total do mes no criterio mes
      m := public.fn_vg_analise(k, '2026-01-01', '2026-12-31', '2026-10', r.lado, r.no[1], foco, r.no, 'mes', 'rs', null, null, null, '2026-10-24', null, true);
      if exists (select 1 from jsonb_array_elements(a #> '{grafico,serie}') with ordinality s(x, o)
                   join jsonb_array_elements(m #> '{grafico,serie}') with ordinality t(y, p) on p = o
                   left join jsonb_array_elements(a #> '{grafico,serie}') with ordinality u(z, q) on q = o - 1
                  where (x ->> 'total')::numeric <> coalesce((z ->> 'total')::numeric, 0) + (y ->> 'total')::numeric
                     or (x ->> 'am') <> (y ->> 'am')) then
        e := e || format('%s %s: a coluna nao cresce pelo total do mes', r.lado, array_to_string(r.no, '>', '-'));
      end if;
      -- A3
      if exists (select 1 from jsonb_array_elements(a #> '{grafico,serie}') x where jsonb_typeof(x -> 'media') <> 'null')
         or (a #> '{grafico,kpis,mes}') is distinct from (lin -> 'valor') or (a #> '{grafico,kpis,meta}') is distinct from (lin -> 'meta')
         or jsonb_typeof(a #> '{grafico,kpis,media}') <> 'null' or jsonb_typeof(a #> '{grafico,kpis,tendencia}') <> 'null' then
        e := e || format('%s %s: media no acumulado ou KPIs errados', r.lado, array_to_string(r.no, '>', '-'));
      end if;
    end if;
  end loop;
  return format('%s nos, %s erros%s', n, cardinality(e), case when cardinality(e) > 0 then ': ' || array_to_string(e[1:3], ' | ') else '' end);
end $f$;

-- Agnaldo inteiro; o NJ em lotes (offset, limit). Rodado em 25/10/2026: Agnaldo 128 nos, 0 erros (mut 1: 127 erros; mut 2: 78);
-- NJ em 3 lotes (0, 40), (40, 80), (120, …): 40 + 80 + 114 = 234 nos, 0 erros (mut 1 no lote 0–39: 40 erros de 40).
do $$ begin raise exception 'P103 acumulado | Agnaldo: % | NJ 0–39: % | mut 1 (coluna do mes) Agnaldo: % | mut 2 (mes anterior) Agnaldo: %',
  pg_temp.vgac('a2d41cda-eb1e-4527-a6cf-a1b9663339e2'), pg_temp.vgac('f2d67cd4-24d0-456f-a079-a3281dcce7fd', 0, 40),
  pg_temp.vgac('a2d41cda-eb1e-4527-a6cf-a1b9663339e2', 0, 1000, 1), pg_temp.vgac('a2d41cda-eb1e-4527-a6cf-a1b9663339e2', 0, 1000, 2); end $$;
