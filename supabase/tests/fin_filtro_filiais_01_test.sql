-- FIN-FILTRO-FILIAIS-01 — `fn_fin_v2_lista_pagina` com `fornecedor_ids` (o escolhido + as filiais). Admin simulado; só leitura; RAISE 'OK'.
--   S  os 3 cadastros com a mesma raiz da cooperativa (NJ, 2021–2026, Mostrar): grade e seção sem caixa = a SOMA de cada cadastro sozinho.
--   C  nenhuma linha da página fora do conjunto.
--   I  um id só em `fornecedor_ids` = o `fornecedor_id` de sempre; lista vazia = sem filtro de fornecedor (md5 da resposta inteira).
--   T  a ida com o conjunto < 4 s.
set local statement_timeout = '50s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE c constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; esc constant text := 'f01a7cf4-b057-4a5a-bab9-acba416b19a6';
  b jsonb := '{"dimensao":"financeira","modo_sem_caixa":"mostrar","anos":[2021,2022,2023,2024,2025,2026]}';
  ids jsonb; r jsonb; um jsonb; soma int := 0; soma_sc int := 0; x record; t timestamptz; seg numeric; falhas text := '';
BEGIN
  select jsonb_agg(f.id) into ids from public.financeiro_fornecedores f
   where f.cliente_id = c and f.fundido_em_id is null and length(regexp_replace(f.cpf_cnpj, '\D', '', 'g')) = 14
     and left(regexp_replace(f.cpf_cnpj, '\D', '', 'g'), 8) = (select left(regexp_replace(cpf_cnpj, '\D', '', 'g'), 8) from public.financeiro_fornecedores where id = esc::uuid);
  if coalesce(jsonb_array_length(ids), 0) < 2 then raise exception 'conjunto sem filial (prova inválida)'; end if;
  t := clock_timestamp();
  r := public.fn_fin_v2_lista_pagina(c, b || jsonb_build_object('fornecedor_id', esc, 'fornecedor_ids', ids), '{}'::jsonb, 0, 500);
  seg := extract(epoch from clock_timestamp() - t);
  if seg >= 4 then falhas := falhas || format(' T: %s s;', round(seg, 2)); end if;
  for x in select value id from jsonb_array_elements_text(ids) loop
    um := public.fn_fin_v2_lista_pagina(c, b || jsonb_build_object('fornecedor_id', x.id), '{"so_linhas":true}'::jsonb, 0, 1);
    soma := soma + (um->>'total_linhas')::int;
    um := public.fn_fin_v2_lista_pagina(c, b || jsonb_build_object('fornecedor_id', x.id), '{}'::jsonb, 0, 1);
    soma_sc := soma_sc + (um->'sem_caixa'->>'linhas')::int;
  end loop;
  if (r->>'total_linhas')::int <> soma then falhas := falhas || format(' S: grade %s <> soma %s;', r->>'total_linhas', soma); end if;
  if (r->'sem_caixa'->>'linhas')::int <> soma_sc then falhas := falhas || format(' S: sem caixa %s <> soma %s;', r->'sem_caixa'->>'linhas', soma_sc); end if;
  if soma = 0 then raise exception 'grade vazia (prova inválida)'; end if;
  if exists (select 1 from jsonb_array_elements(r->'linhas') l where not (ids ? (l->>'favorecido_id'))) then falhas := falhas || ' C: linha fora do conjunto;'; end if;
  if md5(public.fn_fin_v2_lista_pagina(c, b || jsonb_build_object('fornecedor_ids', jsonb_build_array(esc)), '{}'::jsonb, 0, 100)::text)
     <> md5(public.fn_fin_v2_lista_pagina(c, b || jsonb_build_object('fornecedor_id', esc), '{}'::jsonb, 0, 100)::text) then falhas := falhas || ' I: um id <> fornecedor_id;'; end if;
  if md5(public.fn_fin_v2_lista_pagina(c, b || '{"fornecedor_ids":[]}', '{}'::jsonb, 0, 100)::text)
     <> md5(public.fn_fin_v2_lista_pagina(c, b, '{}'::jsonb, 0, 100)::text) then falhas := falhas || ' I: vazia <> sem filtro;'; end if;
  if falhas <> '' then raise exception 'S/C/I/T:%', falhas; end if;
  RAISE EXCEPTION 'OK (% cadastros na raiz; grade %, sem caixa %; % s)', jsonb_array_length(ids), soma, soma_sc, round(seg, 2);
END $t$;
