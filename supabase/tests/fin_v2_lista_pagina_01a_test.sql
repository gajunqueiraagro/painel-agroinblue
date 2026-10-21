-- FIN-V2-DESEMPENHO-01a — `fn_fin_v2_lista_pagina` contra a tela de HOJE (enxuto: ids e totais, ao centavo). Admin simulado; so' leitura;
-- termina em RAISE 'OK'.
--   E  IGUALDADE: NJ, Vera e Santa Rita x 3 filtros reais (2026 inteiro; setembro/2026; o fornecedor mais usado do cliente, todos os
--      anos). O oraculo e' a tela como ela e': o WHERE que o PostgREST recebe (`montarPlanoBaseV2`, relacao 'tabela': cliente, nao
--      cancelado, status <> 'conciliado', cenario <> 'meta', a faixa financeira = pago na faixa OU nao pago e vencendo na faixa, o
--      fornecedor) e a grade de memoria (`linhasDaGradePorModo` "Ocultar": so' caixa). Mesmos ids (todas as paginas, sem repetir), o
--      mesmo total de linhas e os totais do topo (`totaisDaListaV2`, sem conta em foco: entradas, saidas, transferencias) iguais.
--   G  guarda de cliente (42501) e ACL (anon sem EXECUTE; os ajudantes do documento fechados).
set local statement_timeout = '300s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

-- todos os ids da RPC, pagina a pagina (500)
create function pg_temp.rpc_ids(p_cliente uuid, f jsonb) returns uuid[] language plpgsql as $f$
declare r jsonb; p int := 0; ids uuid[] := '{}';
begin
  loop
    r := public.fn_fin_v2_lista_pagina(p_cliente, f, '{}', p, 500);
    ids := ids || coalesce((select array_agg((x->>'id')::uuid) from jsonb_array_elements(r->'linhas') x), '{}');
    exit when jsonb_array_length(r->'linhas') < 500;
    p := p + 1;
  end loop;
  return ids;
end $f$;

-- A TELA DE HOJE para estes filtros: o WHERE do PostgREST + a grade "Ocultar" (so' caixa)
create function pg_temp.tela(p_cliente uuid, p_ini date, p_fim date, p_forn uuid)
returns table (id uuid, valor numeric, tipo_operacao text) language sql as $f$
  select l.id, l.valor, l.tipo_operacao
    from public.financeiro_lancamentos_v2 l
   where l.cliente_id = p_cliente and l.cancelado = false and l.status_transacao <> 'conciliado' and l.cenario <> 'meta'
     and (case when p_ini is null then l.data_pagamento is not null or l.data_vencimento is not null
               else (l.data_pagamento >= p_ini and l.data_pagamento < p_fim)
                 or (l.data_pagamento is null and l.data_vencimento >= p_ini and l.data_vencimento < p_fim) end)
     and (p_forn is null or l.favorecido_id = p_forn)
     and l.sem_movimentacao_caixa is not true
$f$;

DO $t$
DECLARE c uuid; forn uuid; caso record; f jsonb; ids uuid[]; r jsonb; ex jsonb; n int := 0; falhas text := ''; ok boolean;
BEGIN
  for c in select unnest(array['f2d67cd4-24d0-456f-a079-a3281dcce7fd', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', '77d37bbf-a440-4fca-bf1a-eac60cf91bc4']::uuid[]) loop
    select favorecido_id into forn from public.financeiro_lancamentos_v2
     where cliente_id = c and not cancelado and favorecido_id is not null group by 1 order by count(*) desc limit 1;
    for caso in select * from (values
        ('2026',      jsonb_build_object('anos', '[2026]'::jsonb),                       date '2026-01-01', date '2027-01-01', null::uuid),
        ('set/2026',  jsonb_build_object('anos', '[2026]'::jsonb, 'meses', '[9]'::jsonb), date '2026-09-01', date '2026-10-01', null::uuid),
        ('fornecedor', jsonb_build_object('fornecedor_id', forn),                         null::date,        null::date,        forn)) v(nome, filtros, ini, fim, fo) loop
      f := caso.filtros;
      ids := pg_temp.rpc_ids(c, f);
      r := public.fn_fin_v2_lista_pagina(c, f, '{}', 0, 1);
      if cardinality(ids) <> (select count(distinct x) from unnest(ids) x)
         or exists (select unnest(ids) except select id from pg_temp.tela(c, caso.ini, caso.fim, caso.fo))
         or exists (select id from pg_temp.tela(c, caso.ini, caso.fim, caso.fo) except select unnest(ids))
         or (r->>'total_linhas')::int <> cardinality(ids) then
        falhas := falhas || format(' [%s %s] ids: rpc %s tela %s;', c, caso.nome, cardinality(ids),
                                   (select count(*) from pg_temp.tela(c, caso.ini, caso.fim, caso.fo)));
      end if;
      -- `totaisDaListaV2` sem conta em foco: transferencia (as duas grafias) a' parte; entrada pelo tipo '1…'; o resto saida
      select jsonb_build_object(
          'entradas', round(coalesce(sum(abs(t.valor)) filter (where btrim(t.tipo_operacao) not in ('3-Transferências', '3-Transferência') and t.tipo_operacao like '1%'), 0), 2),
          'saidas', round(coalesce(sum(abs(t.valor)) filter (where btrim(t.tipo_operacao) not in ('3-Transferências', '3-Transferência') and t.tipo_operacao not like '1%'), 0), 2),
          'transferencias', round(coalesce(sum(abs(t.valor)) filter (where btrim(t.tipo_operacao) in ('3-Transferências', '3-Transferência')), 0), 2))
        into ex from pg_temp.tela(c, caso.ini, caso.fim, caso.fo) t;
      if (r->'totais'->>'entradas')::numeric <> (ex->>'entradas')::numeric or (r->'totais'->>'saidas')::numeric <> (ex->>'saidas')::numeric
         or (r->'totais'->>'transferencias')::numeric <> (ex->>'transferencias')::numeric then
        falhas := falhas || format(' [%s %s] totais: rpc %s tela %s;', c, caso.nome, r->'totais', ex);
      end if;
      n := n + 1;
    end loop;
  end loop;
  if falhas <> '' then raise exception 'E igualdade:%', falhas; end if;

  -- G
  c := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  ok := false; begin perform public.fn_fin_v2_lista_pagina(c, '{"anos":[2026]}'); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'G sem tenant'; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.fn_fin_v2_lista_pagina(uuid, jsonb, jsonb, integer, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_fin_v2_lista_pagina(uuid, jsonb, jsonb, integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_fin_v2_doc_norm(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_fin_v2_doc_casa(text[], text, text, text, text, text, text)', 'EXECUTE')
    then raise exception 'G ACL'; end if;

  RAISE EXCEPTION 'OK (% casos)', n;
END $t$;
