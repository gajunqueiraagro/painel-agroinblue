-- P100 — fn_vg_analise (migrations 20261028111951 e 111952): a tabela da direita do modal (`foco.linhas`) = os SUBCENTROS do item e a da
-- ESQUERDA navega um nivel por vez (`tabela.nivel`). Como
-- `authenticated` (admin); TERMINA EM RAISE: nada fica. Periodo jan–dez/26, mes out/26, R$, todas as contas.
--   S1 em TODO no' (a raiz de cada lado, todo grupo, atividade e centro) do Agnaldo e do NJ, nos criterios mes e acumulado:
--      · toda linha e' um subcentro (caminho de 4) que desce do item;
--      · a SOMA dos valores das linhas = o valor do item (`foco.total`), ao centavo;
--      · a ordem e' do maior valor para o menor;
--      · o item do grafico (sem escolha) = o total do item.
--   S3 (111952) a ESQUERDA: `tabela.nivel` = o item (aba, grupo ou atividade) ou a ATIVIDADE dele (centro); as linhas sao os filhos
--      do nivel e a SOMA delas = o total do nivel.
--   S2 nos grupos: escolher o 1o subcentro da lista poe ele no grafico (o item = a linha), o caminho do grafico tem a cadeia inteira
--      (raiz › grupo › atividade › centro › subcentro) e as setas ‹ › andam pela ordem da lista.
--   MUTACOES (no proprio teste): mut 1 perde a ULTIMA linha da lista (um corte/LIMIT: a soma tem de falhar); mut 2 fica so' com os
--      filhos diretos do item (a regra de antes: tem de falhar). ("Sem subcentro" nao existe no Agnaldo nem no NJ com todas as contas:
--      0 de 434 e 0 de 826 linhas de subcentro em 2026 — nao serve de mutacao.)
-- O NJ (≈ 1,3 s por chamada) roda em lotes: pg_temp.vgas(cliente, offset, limit, mut) devolve o resumo do lote.
-- Rodado em 24/10/2026: ver o historico.
set local statement_timeout = '900s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.vgas(k uuid, desloc int default 0, lim int default 1000, mut int default 0) returns text language plpgsql as $f$
declare
  r record; crit text; a jsonb; ls jsonb; soma numeric; tot numeric; e text[] := '{}'; n int := 0; nl int := 0; g jsonb; prim jsonb; s2 int := 0;
begin
  for r in
    select * from (
      select distinct x.lado, (array[x.grupo, x.atividade, x.centro])[1:case x.nivel when 'grupo' then 1 when 'atividade' then 2 else 3 end] as foco
        from public.fn_vg_serie(k, '2026-01-01', '2026-12-31', null, null, null, null, '2026-10-24', null, true) x
       where x.nivel in ('grupo', 'atividade', 'centro')
      union select l, '{}'::text[] from unnest(array['entrada', 'saida']) l) z
     order by lado, cardinality(foco), foco offset desloc limit lim
  loop
    foreach crit in array array['mes', 'acumulado'] loop
      n := n + 1;
      a := public.fn_vg_analise(k, '2026-01-01', '2026-12-31', '2026-10', r.lado, r.foco[1], r.foco, null, crit, 'rs',
                                null, null, null, '2026-10-24', null, true);
      ls := coalesce(a #> '{foco,linhas}', '[]');
      if mut = 1 then ls := coalesce((select jsonb_agg(x order by o) from jsonb_array_elements(ls) with ordinality t(x, o) where o < jsonb_array_length(ls)), '[]'); end if;
      if mut = 2 then ls := coalesce((select jsonb_agg(x) from jsonb_array_elements(ls) x where jsonb_array_length(x -> 'caminho') = cardinality(r.foco) + 1), '[]'); end if;
      nl := nl + jsonb_array_length(ls);
      if exists (select 1 from jsonb_array_elements(ls) x
                  where jsonb_array_length(x -> 'caminho') <> 4
                     or coalesce((select jsonb_agg(y order by o) from jsonb_array_elements(x -> 'caminho') with ordinality t(y, o)
                                   where o <= cardinality(r.foco)), '[]') is distinct from to_jsonb(r.foco)) then
        e := e || format('%s %s %s: linha que nao e subcentro do item', r.lado, array_to_string(r.foco, '>', '-'), crit);
      end if;
      soma := (select coalesce(sum((x ->> 'valor')::numeric), 0) from jsonb_array_elements(ls) x);
      tot := coalesce((a #>> '{foco,total,valor}')::numeric, 0);
      if soma <> tot then
        e := e || format('%s %s %s: soma %s <> total %s', r.lado, array_to_string(r.foco, '>', '-'), crit, soma, tot);
      end if;
      if exists (select 1 from jsonb_array_elements(ls) with ordinality t(x, o)
                  join jsonb_array_elements(ls) with ordinality u(y, p) on p = o + 1
                 where (y ->> 'valor')::numeric > (x ->> 'valor')::numeric) then
        e := e || format('%s %s %s: fora da ordem (maior primeiro)', r.lado, array_to_string(r.foco, '>', '-'), crit);
      end if;
      -- S3: a esquerda
      if a #> '{tabela,nivel}' is distinct from to_jsonb(case when cardinality(r.foco) >= 3 then r.foco[1:2] else r.foco end)
         or exists (select 1 from jsonb_array_elements(a #> '{tabela,linhas}') x
                     where jsonb_array_length(x -> 'caminho') <> jsonb_array_length(a #> '{tabela,nivel}') + 1)
         or coalesce((select sum((x ->> 'valor')::numeric) from jsonb_array_elements(a #> '{tabela,linhas}') x), 0)
            <> coalesce((a #>> '{tabela,total,valor}')::numeric, 0) then
        e := e || format('%s %s %s: tabela da esquerda (nivel %s) errada', r.lado, array_to_string(r.foco, '>', '-'), crit, a #> '{tabela,nivel}');
      end if;
      if (a #> '{grafico,item,valor}') is distinct from (a #> '{foco,total,valor}') then
        e := e || format('%s %s %s: grafico <> total', r.lado, array_to_string(r.foco, '>', '-'), crit);
      end if;
      -- S2: nos grupos, o 1o subcentro no grafico
      if crit = 'mes' and cardinality(r.foco) = 1 and jsonb_array_length(ls) > 1 and mut = 0 then
        s2 := s2 + 1;
        prim := ls -> 0;
        g := public.fn_vg_analise(k, '2026-01-01', '2026-12-31', '2026-10', r.lado, r.foco[1], r.foco,
                                  array(select jsonb_array_elements_text(prim -> 'caminho')), 'mes', 'rs', null, null, null, '2026-10-24', null, true);
        if g #> '{grafico,item}' <> prim - 'centro'
           or jsonb_array_length(g #> '{grafico,caminho}') <> 5
           or g #> '{grafico,irmaos}' <> (select jsonb_agg(x -> 'caminho') from jsonb_array_elements(ls) x) then
          e := e || format('%s %s: subcentro no grafico (item, caminho de 5 ou setas) errado', r.lado, r.foco[1]);
        end if;
      end if;
    end loop;
  end loop;
  return format('%s chamadas, %s linhas, %s grupos com o subcentro no grafico, %s erros%s', n, nl, s2, cardinality(e),
                case when cardinality(e) > 0 then ': ' || array_to_string(e[1:4], ' | ') else '' end);
end $f$;

do $$ begin raise exception 'P100 | Agnaldo: % | NJ: % | mut 1 (sem a ultima linha) Agnaldo: % | NJ: % | mut 2 (so os filhos) Agnaldo: %',
  pg_temp.vgas('a2d41cda-eb1e-4527-a6cf-a1b9663339e2'), pg_temp.vgas('f2d67cd4-24d0-456f-a079-a3281dcce7fd'),
  pg_temp.vgas('a2d41cda-eb1e-4527-a6cf-a1b9663339e2', 0, 1000, 1), pg_temp.vgas('f2d67cd4-24d0-456f-a079-a3281dcce7fd', 0, 30, 1),
  pg_temp.vgas('a2d41cda-eb1e-4527-a6cf-a1b9663339e2', 0, 1000, 2); end $$;
