-- P119 — a gaveta da Visao Geral ORDENA no banco (migration 20261028111960, fn_vg_gaveta_ordenada). Como `authenticated` (admin);
-- TERMINA EM RAISE. Caso do Gabriel: NJ jan–out/26 (acumulado ate' out) › Custeio › Pecuaria › Nutricao › Nutricao.
--   O1 a de 15 argumentos (fn_vg_gaveta) = a nova na ordem de sempre (p_ordem nulo), jsonb identico, em 4 nos (raiz, grupo, atividade,
--      subcentro). (No ensaio de 27/10, ANTES de aplicar x DEPOIS: md5 igual nos 4.)
--   O2 para cada coluna (8) e sentido (2): o cabecalho (total, contagem, pago/aberto, resumo por favorecido, irmaos, paginas) IGUAL ao
--      da ordem de sempre; o CONJUNTO de linhas igual; a sequencia monotona na chave escolhida (nulo no fim, texto em pt-BR);
--   O3 e as paginas de 50 encadeadas = a pagina unica de 500 (a ordem e' feita ANTES da pagina; ordenar so' a pagina quebraria isto).
--   O4 ordem invalida → 22023.
-- Rodado em 27/10/2026: o caso tem 112 lancamentos, R$ 3.369.888,84; O1 0 diferentes em 4; O2/O3 0 problemas em 16 ordens; O4 recusa.
set local statement_timeout = '28s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

do $$ declare
  k uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; cam text[] := array['Custeio','pecuaria','Nutrição','Nutrição'];
  g0 jsonb; g jsonb; o text; s text; r text := ''; ruim int := 0; mono int; pg jsonb; lin jsonb; i int; dif int := 0; c text[]; o4 text := 'nao recusou';
begin
  foreach c slice 1 in array array[array['','','',''], array['Custeio','','',''], array['Custeio','pecuaria','',''], cam] loop
    c := array_remove(c, '');
    if public.fn_vg_gaveta(k, '2026-01-01', '2026-12-31', '2026-10', 'saida', c, 'acumulado')
       is distinct from public.fn_vg_gaveta_ordenada(k, '2026-01-01', '2026-12-31', '2026-10', 'saida', c, 'acumulado', NULL, NULL, NULL, current_date, NULL, true, 1, 500, NULL, 'asc')
    then dif := dif + 1; end if;
  end loop;
  g0 := public.fn_vg_gaveta(k, '2026-01-01', '2026-12-31', '2026-10', 'saida', cam, 'acumulado');
  r := format('O1 %s diferentes em 4 | caso: %s lanc, total %s, linhas %s', dif, g0->>'qtd', g0->>'total', jsonb_array_length(g0->'linhas'));
  foreach o in array array['competencia','vencimento','pagamento','status','favorecido','descricao','conta','valor'] loop
    foreach s in array array['asc','desc'] loop
      g := public.fn_vg_gaveta_ordenada(k, '2026-01-01', '2026-12-31', '2026-10', 'saida', cam, 'acumulado', NULL, NULL, NULL, current_date, NULL, true, 1, 500, o, s);
      if g - 'linhas' is distinct from g0 - 'linhas' then ruim := ruim + 1; r := r || ' ['||o||' '||s||': cabeca mudou]'; end if;
      if (select array_agg(x->>'chave' order by x->>'chave') from jsonb_array_elements(g->'linhas') x)
         is distinct from (select array_agg(x->>'chave' order by x->>'chave') from jsonb_array_elements(g0->'linhas') x) then ruim := ruim + 1; r := r || ' ['||o||' '||s||': conjunto]'; end if;
      with l as (select ord, x from jsonb_array_elements(g->'linhas') with ordinality t(x, ord)),
           kk as (select ord, case o when 'competencia' then x->>'competencia' when 'vencimento' then x->>'vencimento'
                                     when 'pagamento' then case when (x->>'previsto')::boolean then null else x->>'pagamento' end end kd,
                              case when o = 'valor' then (x->>'valor')::numeric end kn,
                              case o when 'favorecido' then lower(x->>'favorecido') when 'descricao' then lower(nullif(trim(x->>'descricao'), '')) when 'conta' then lower(x->>'conta') end collate "pt-BR-x-icu" kt
                      from l)
      select count(*) into mono from kk a join kk b on b.ord = a.ord + 1
       where (s = 'asc' and (a.kd > b.kd or a.kn > b.kn or a.kt > b.kt or (a.kd is null and b.kd is not null) or (a.kt is null and b.kt is not null)))
          or (s = 'desc' and (a.kd < b.kd or a.kn < b.kn or a.kt < b.kt or (a.kd is null and b.kd is not null) or (a.kt is null and b.kt is not null)));
      if mono > 0 then ruim := ruim + 1; r := r || format(' [%s %s: %s fora de ordem]', o, s, mono); end if;
      lin := '[]'; i := 1;
      loop
        pg := public.fn_vg_gaveta_ordenada(k, '2026-01-01', '2026-12-31', '2026-10', 'saida', cam, 'acumulado', NULL, NULL, NULL, current_date, NULL, true, i, 50, o, s);
        exit when jsonb_array_length(pg->'linhas') = 0;
        lin := lin || (select jsonb_agg(x->'chave') from jsonb_array_elements(pg->'linhas') x); i := i + 1;
      end loop;
      if lin is distinct from (select jsonb_agg(x->'chave') from jsonb_array_elements(g->'linhas') x) then ruim := ruim + 1; r := r || ' ['||o||' '||s||': paginas]'; end if;
    end loop;
  end loop;
  begin
    perform public.fn_vg_gaveta_ordenada(k, '2026-01-01', '2026-12-31', '2026-10', 'saida', cam, 'acumulado', NULL, NULL, NULL, current_date, NULL, true, 1, 500, 'id', 'asc');
  exception when sqlstate '22023' then o4 := 'recusou (22023)';
  end;
  raise exception 'P119 % | O2/O3 16 ordens: % problemas | O4 %', r, ruim, o4;
end $$;
