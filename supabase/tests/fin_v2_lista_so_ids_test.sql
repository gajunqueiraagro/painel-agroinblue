-- P73 — salvou, rele^ SO' o lancamento (`p_ordem.so_ids`, e `so_ids_totais`). Admin simulado; so' leitura; termina em RAISE 'OK'.
--   I  NJ, Vera e Agnaldo x 2026 x paginas 0 e 2 de 200: `so_ids` com 3 ids da pagina devolve SO' essas 3 linhas, na ordem da pagina,
--      IGUAIS as da completa; totais, sem_caixa, contagens, fornecedores e total_linhas vem nulos (nao recontou).
--   T  `so_ids_totais`: as mesmas 3 linhas E os totais, sem_caixa, contagens e total_linhas iguais aos da completa.
--   R  o recorte vale: um id de FORA do recorte (outro ano) nao volta.
--   D  o dividido (sintetico, 60/40 no Teste) com filtro de conta (subcentro da parte de 40%): a linha e os totais = os da completa.
--   A  auto-teste: a comparacao separa a linha 0 da linha 7.
set local statement_timeout = '300s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE c uuid; f jsonb := '{"dimensao":"financeira","modo_sem_caixa":"ocultar","anos":[2026]}'; o jsonb := '{"campo":"default","dir":"asc","nivel":"centro"}';
  rc jsonb; ri jsonb; rt jsonb; ids jsonb; p int; n int := 0; falhas text := ''; fora uuid; d record; fd jsonb; linha jsonb; outra uuid; sub text; div uuid;
BEGIN
  for c in select unnest(array['f2d67cd4-24d0-456f-a079-a3281dcce7fd', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2']::uuid[]) loop
    foreach p in array array[0, 2] loop
      rc := public.fn_fin_v2_lista_pagina(c, f, o, p, 200);
      if jsonb_array_length(rc->'linhas') < 151 then raise exception '[%] pagina % curta demais (% linhas)', c, p, jsonb_array_length(rc->'linhas'); end if;
      ids := jsonb_build_array(rc->'linhas'->150->>'id', rc->'linhas'->0->>'id', rc->'linhas'->7->>'id');
      ri := public.fn_fin_v2_lista_pagina(c, f, o || jsonb_build_object('so_ids', ids), p, 200);
      rt := public.fn_fin_v2_lista_pagina(c, f, o || jsonb_build_object('so_ids', ids, 'so_ids_totais', true), p, 200);
      if ri->'linhas' <> jsonb_build_array(rc->'linhas'->0, rc->'linhas'->7, rc->'linhas'->150) then falhas := falhas || format(' [%s p%s] I: linhas diferem;', c, p); end if;
      if jsonb_typeof(ri->'totais') <> 'null' or jsonb_typeof(ri->'sem_caixa') <> 'null' or jsonb_typeof(ri->'contagens') <> 'null'
         or jsonb_typeof(ri->'fornecedores') <> 'null' or jsonb_typeof(ri->'total_linhas') <> 'null' then falhas := falhas || format(' [%s p%s] I: recontou;', c, p); end if;
      if rt->'linhas' <> ri->'linhas' then falhas := falhas || format(' [%s p%s] T: linhas diferem;', c, p); end if;
      if rt->'totais' <> rc->'totais' or rt->'sem_caixa' <> rc->'sem_caixa' or rt->'contagens' <> rc->'contagens' or rt->'total_linhas' <> rc->'total_linhas'
        then falhas := falhas || format(' [%s p%s] T: totais diferem;', c, p); end if;
      if rc->'linhas'->0 = rc->'linhas'->7 then falhas := falhas || format(' [%s p%s] A: a comparacao nao separa as linhas;', c, p); end if;
      n := n + 1;
    end loop;
    select l.id into fora from public.financeiro_lancamentos_v2 l
     where l.cliente_id = c and not l.cancelado and l.data_pagamento < '2025-01-01' and l.data_competencia < '2025-01-01' and l.data_vencimento < '2025-01-01' limit 1;
    if fora is null then raise exception '[%] R: sem lancamento fora do recorte para provar', c; end if;
    ri := public.fn_fin_v2_lista_pagina(c, f, o || jsonb_build_object('so_ids', jsonb_build_array(fora)), 0, 200);
    if jsonb_array_length(ri->'linhas') <> 0 then falhas := falhas || format(' [%s] R: id de fora do recorte voltou;', c); end if;
  end loop;
  -- D: nao ha' dividido vivo no proto (23/10): um lancamento SINTETICO do cliente Teste e' dividido 60/40 aqui (a transacao volta no
  -- RAISE final) e filtrado pelo subcentro da parte de 40%
  for d in select l.id, l.plano_conta_id, pc.tipo_operacao from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
            where l.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' and not l.cancelado and not l.classificacao_dividida order by l.id loop
    select x.id, x.subcentro into outra, sub from public.financeiro_plano_contas x
     where (x.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' or x.cliente_id is null) and x.ativo and x.tipo_operacao = d.tipo_operacao
       and x.id <> d.plano_conta_id and x.subcentro is not null order by x.id limit 1;
    continue when outra is null;
    begin
      perform public.fn_lancamento_dividir(d.id, jsonb_build_array(jsonb_build_object('plano_conta_id', d.plano_conta_id, 'percentual', 60),
        jsonb_build_object('plano_conta_id', outra, 'percentual', 40)), 'teste P73', false);
      div := d.id; exit;
    exception when others then null;
    end;
  end loop;
  if div is null then raise exception 'D: nenhum lancamento do Teste se deixou dividir'; end if;
  fd := jsonb_build_object('dimensao', 'financeira', 'modo_sem_caixa', 'ocultar', 'subcentro', sub);
  rc := public.fn_fin_v2_lista_pagina('43f32d07-dba8-4670-900c-bf645440c04a', fd, o, 0, 500);
  select e into linha from jsonb_array_elements(rc->'linhas') e where e->>'id' = div::text;
  if linha is null then raise exception 'D: o dividido nao sai na completa com o filtro'; end if;
  ri := public.fn_fin_v2_lista_pagina('43f32d07-dba8-4670-900c-bf645440c04a', fd, o || jsonb_build_object('so_ids', jsonb_build_array(div)), 0, 500);
  if ri->'linhas' <> jsonb_build_array(linha) then falhas := falhas || ' D: a linha do dividido difere;'; end if;
  rt := public.fn_fin_v2_lista_pagina('43f32d07-dba8-4670-900c-bf645440c04a', fd, o || jsonb_build_object('so_ids', jsonb_build_array(div), 'so_ids_totais', true), 0, 500);
  if rt->'totais' <> rc->'totais' then falhas := falhas || ' D: os totais do recorte com o dividido diferem;'; end if;
  if falhas <> '' then raise exception 'I/T/R/D/A:%', falhas; end if;
  RAISE EXCEPTION 'OK (% paginas x 3 ids; R em 3 clientes; D %)', n, left(div::text, 8);
END $t$;
