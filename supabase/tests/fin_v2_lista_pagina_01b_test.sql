-- FIN-V2-DESEMPENHO-01b — a tela passa a pedir SO' A PAGINA (`fn_fin_v2_lista_pagina`, 100 ou 200 por vez). Prova de igualdade: a SOMA
-- DAS PAGINAS = a lista antiga. Admin simulado; so' leitura; termina em RAISE 'OK'.
--   S  NJ, Vera e Agnaldo x (2026 inteiro; setembro/2026) x (100; 200 por pagina), com os filtros EXATOS que a tela manda
--      (`filtrosDaPaginaV2`: dimensao financeira, "Ocultar", anos/meses inteiros): as paginas juntas tem os MESMOS ids da tela de hoje
--      (o WHERE do PostgREST + a grade "Ocultar"), sem repetir nem faltar; a contagem de cada pagina e' a esperada (a ultima, o resto);
--      o total_linhas e' o da tela; a soma dos valores das paginas e' a da tela, ao centavo; os totais do topo (pedidos em QUALQUER
--      pagina) sao os da tela inteira e iguais em todas as paginas.
--   O  a ordem e' estavel entre tamanhos: as paginas de 100, em sequencia, sao as de 200 em sequencia (mesma lista, mesma ordem).
set local statement_timeout = '300s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

-- a lista em sequencia (ids na ordem), pagina a pagina do tamanho pedido; devolve tambem a soma e as falhas de forma
create function pg_temp.paginas(p_cliente uuid, f jsonb, p_por int)
returns table (ids uuid[], soma numeric, total int, totais_iguais boolean, contagens_ok boolean, totais jsonb) language plpgsql as $f$
declare r jsonb; p int := 0; acc uuid[] := '{}'; s numeric := 0; t0 jsonb; tot int; iguais boolean := true; cont boolean := true; n int;
begin
  loop
    r := public.fn_fin_v2_lista_pagina(p_cliente, f, '{"campo":"default","dir":"asc","nivel":"centro"}', p, p_por);
    if p = 0 then t0 := r->'totais'; tot := (r->>'total_linhas')::int; end if;
    if r->'totais' is distinct from t0 or (r->>'total_linhas')::int <> tot then iguais := false; end if;
    n := jsonb_array_length(r->'linhas');
    if n <> least(p_por, greatest(tot - p * p_por, 0)) then cont := false; end if;
    acc := acc || coalesce((select array_agg((x->>'id')::uuid order by o) from jsonb_array_elements(r->'linhas') with ordinality e(x, o)), '{}');
    s := s + coalesce((select sum((x->>'valor')::numeric) from jsonb_array_elements(r->'linhas') x), 0);
    exit when (p + 1) * p_por >= tot;
    p := p + 1;
  end loop;
  return query select acc, s, tot, iguais, cont, t0;
end $f$;

-- A TELA DE HOJE (a mesma do teste 01a): o WHERE do PostgREST + a grade "Ocultar" (so' caixa)
create function pg_temp.tela(p_cliente uuid, p_ini date, p_fim date)
returns table (id uuid, valor numeric, tipo_operacao text) language sql as $f$
  select l.id, l.valor, l.tipo_operacao
    from public.financeiro_lancamentos_v2 l
   where l.cliente_id = p_cliente and l.cancelado = false and l.status_transacao <> 'conciliado' and l.cenario <> 'meta'
     and ((l.data_pagamento >= p_ini and l.data_pagamento < p_fim)
       or (l.data_pagamento is null and l.data_vencimento >= p_ini and l.data_vencimento < p_fim))
     and l.sem_movimentacao_caixa is not true
$f$;

DO $t$
DECLARE c uuid; caso record; por int; pg record; pg100 uuid[]; ex jsonb; nt int; st numeric; n int := 0; falhas text := ''; resumo text := '';
BEGIN
  for c in select unnest(array['f2d67cd4-24d0-456f-a079-a3281dcce7fd', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2']::uuid[]) loop
    for caso in select * from (values
        ('2026',     '{"dimensao":"financeira","modo_sem_caixa":"ocultar","anos":[2026]}'::jsonb,              date '2026-01-01', date '2027-01-01'),
        ('set/2026', '{"dimensao":"financeira","modo_sem_caixa":"ocultar","anos":[2026],"meses":[9]}'::jsonb,  date '2026-09-01', date '2026-10-01')) v(nome, filtros, ini, fim) loop
      select count(*), coalesce(sum(t.valor), 0) into nt, st from pg_temp.tela(c, caso.ini, caso.fim) t;
      select jsonb_build_object(
          'entradas', round(coalesce(sum(abs(t.valor)) filter (where btrim(t.tipo_operacao) not in ('3-Transferências', '3-Transferência') and t.tipo_operacao like '1%'), 0), 2),
          'saidas', round(coalesce(sum(abs(t.valor)) filter (where btrim(t.tipo_operacao) not in ('3-Transferências', '3-Transferência') and t.tipo_operacao not like '1%'), 0), 2),
          'transferencias', round(coalesce(sum(abs(t.valor)) filter (where btrim(t.tipo_operacao) in ('3-Transferências', '3-Transferência')), 0), 2))
        into ex from pg_temp.tela(c, caso.ini, caso.fim) t;
      pg100 := null;
      foreach por in array array[100, 200] loop
        select * into pg from pg_temp.paginas(c, caso.filtros, por);
        if cardinality(pg.ids) <> (select count(distinct x) from unnest(pg.ids) x)
           or exists (select unnest(pg.ids) except select id from pg_temp.tela(c, caso.ini, caso.fim))
           or exists (select id from pg_temp.tela(c, caso.ini, caso.fim) except select unnest(pg.ids))
           or pg.total <> nt or cardinality(pg.ids) <> nt then
          falhas := falhas || format(' [%s %s %s] ids: paginas %s total %s tela %s;', c, caso.nome, por, cardinality(pg.ids), pg.total, nt);
        end if;
        if pg.soma <> st then falhas := falhas || format(' [%s %s %s] soma: paginas %s tela %s;', c, caso.nome, por, pg.soma, st); end if;
        if not pg.contagens_ok then falhas := falhas || format(' [%s %s %s] contagem de pagina;', c, caso.nome, por); end if;
        if not pg.totais_iguais then falhas := falhas || format(' [%s %s %s] totais mudam entre paginas;', c, caso.nome, por); end if;
        if (pg.totais->>'entradas')::numeric <> (ex->>'entradas')::numeric or (pg.totais->>'saidas')::numeric <> (ex->>'saidas')::numeric
           or (pg.totais->>'transferencias')::numeric <> (ex->>'transferencias')::numeric then
          falhas := falhas || format(' [%s %s %s] totais: rpc %s tela %s;', c, caso.nome, por, pg.totais, ex);
        end if;
        if por = 100 then pg100 := pg.ids;
        elsif pg100 is distinct from pg.ids then falhas := falhas || format(' [%s %s] O: a ordem das paginas de 100 difere da de 200;', c, caso.nome); end if;
        n := n + 1;
      end loop;
      resumo := resumo || format(' %s/%s=%s', left(c::text, 8), caso.nome, nt);
    end loop;
  end loop;
  if nt is null or n <> 12 then raise exception 'conjunto vazio ou incompleto (% casos)', n; end if;
  if falhas <> '' then raise exception 'S/O:%', falhas; end if;
  RAISE EXCEPTION 'OK (% casos;%)', n, resumo;
END $t$;
