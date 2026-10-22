-- FIN-V2-FILTRO-FORNECEDOR-01 — o "N lanç." do filtro de fornecedor de Lançamentos vem da `fn_fin_v2_lista_pagina` (`fornecedores`:
-- {id: n}, o recorte SEM o filtro de fornecedor). Admin simulado; so' leitura; termina em RAISE 'OK'.
--   C  NJ, Vera e Agnaldo x 2026 (os filtros da tela): o mapa = a contagem por fornecedor da TELA DE HOJE (a mesma definicao do teste do
--      01b: o WHERE do PostgREST + a grade "Ocultar"); a soma do mapa + os sem fornecedor = total_linhas.
--   F  os 3 fornecedores mais usados de cada cliente: com `fornecedor_id` = ele, total_linhas = o N do mapa, a pagina so' tem ele, e o
--      mapa NAO muda (o filtro de fornecedor nao recorta a contagem — a lista do filtro nao encolhe ao escolher).
--   A  auto-teste: o mapa com um fornecedor a menos e' DIFERENTE (a comparacao sabe achar).
-- A igualdade das chaves antigas (linhas, totais, ordem) e' a do teste do 01b, rodado de novo sobre esta versao.
set local statement_timeout = '300s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.tela(p_cliente uuid, p_ini date, p_fim date)
returns table (id uuid, favorecido_id uuid) language sql as $f$
  select l.id, l.favorecido_id
    from public.financeiro_lancamentos_v2 l
   where l.cliente_id = p_cliente and l.cancelado = false and l.status_transacao <> 'conciliado' and l.cenario <> 'meta'
     and ((l.data_pagamento >= p_ini and l.data_pagamento < p_fim)
       or (l.data_pagamento is null and l.data_vencimento >= p_ini and l.data_vencimento < p_fim))
     and l.sem_movimentacao_caixa is not true
$f$;

DO $t$
DECLARE c uuid; f jsonb := '{"dimensao":"financeira","modo_sem_caixa":"ocultar","anos":[2026]}'; o jsonb := '{"campo":"default","dir":"asc","nivel":"centro"}';
  r jsonb; rf jsonb; esperado jsonb; sem_forn int; top record; n int := 0; nf int := 0; falhas text := ''; resumo text := '';
BEGIN
  for c in select unnest(array['f2d67cd4-24d0-456f-a079-a3281dcce7fd', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2']::uuid[]) loop
    r := public.fn_fin_v2_lista_pagina(c, f, o, 0, 200);
    select coalesce(jsonb_object_agg(x.fid, x.n), '{}'::jsonb) into esperado
      from (select t.favorecido_id::text as fid, count(*) as n from pg_temp.tela(c, date '2026-01-01', date '2027-01-01') t
             where t.favorecido_id is not null group by t.favorecido_id) x;
    select count(*) into sem_forn from pg_temp.tela(c, date '2026-01-01', date '2027-01-01') t where t.favorecido_id is null;
    if jsonb_typeof(r->'fornecedores') <> 'object' or (select count(*) from jsonb_object_keys(r->'fornecedores')) = 0 then
      falhas := falhas || format(' [%s] C: mapa vazio ou ausente;', c);
    elsif r->'fornecedores' <> esperado then
      falhas := falhas || format(' [%s] C: mapa difere da tela (%s chaves x %s);', c,
        (select count(*) from jsonb_object_keys(r->'fornecedores')), (select count(*) from jsonb_object_keys(esperado)));
    end if;
    if (select coalesce(sum(v::int), 0) from jsonb_each_text(r->'fornecedores') e(k, v)) + sem_forn <> (r->>'total_linhas')::int then
      falhas := falhas || format(' [%s] C: soma do mapa + sem fornecedor <> total_linhas;', c);
    end if;
    -- A: a comparacao sabe achar
    if (r->'fornecedores') - (select k from jsonb_object_keys(r->'fornecedores') k limit 1) = esperado then
      falhas := falhas || format(' [%s] A: a comparacao nao achou um fornecedor a menos;', c);
    end if;
    for top in select k, v::int as qt from jsonb_each_text(r->'fornecedores') e(k, v) order by v::int desc, k limit 3 loop
      rf := public.fn_fin_v2_lista_pagina(c, f || jsonb_build_object('fornecedor_id', top.k), o, 0, 200);
      if (rf->>'total_linhas')::int <> top.qt then
        falhas := falhas || format(' [%s %s] F: total %s, mapa %s;', c, top.k, rf->>'total_linhas', top.qt);
      end if;
      if exists (select 1 from jsonb_array_elements(rf->'linhas') x where x->>'favorecido_id' is distinct from top.k) then
        falhas := falhas || format(' [%s %s] F: pagina com outro fornecedor;', c, top.k);
      end if;
      if rf->'fornecedores' <> r->'fornecedores' then
        falhas := falhas || format(' [%s %s] F: o mapa encolheu com o filtro;', c, top.k);
      end if;
      nf := nf + 1;
    end loop;
    n := n + 1;
    resumo := resumo || format(' %s=%s forn/%s lanc', left(c::text, 8), (select count(*) from jsonb_object_keys(r->'fornecedores')), r->>'total_linhas');
  end loop;
  if n <> 3 or nf <> 9 then raise exception 'conjunto incompleto (% clientes, % fornecedores)', n, nf; end if;
  if falhas <> '' then raise exception 'C/F/A:%', falhas; end if;
  RAISE EXCEPTION 'OK (% clientes, % fornecedores filtrados;%)', n, nf, resumo;
END $t$;
