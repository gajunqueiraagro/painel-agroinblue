-- FIN-V2-DESEMPENHO-01c — trocar de pagina sem recontar (`p_ordem.so_linhas = true`). Admin simulado; so' leitura; termina em RAISE 'OK'.
--   L  NJ, Vera e Agnaldo x 2026 x TODAS as paginas de 200: a resposta "so' linhas" tem as MESMAS linhas (mesma ordem) e o mesmo
--      total_linhas da completa; totais, sem_caixa, contagens e fornecedores vem nulos (nao recontou).
--   C  sem a chave (ou false), a resposta e' a completa (o mapa e os totais vem).
--   A  auto-teste: a comparacao acha uma pagina trocada (pagina 1 x pagina 0).
set local statement_timeout = '300s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE c uuid; f jsonb := '{"dimensao":"financeira","modo_sem_caixa":"ocultar","anos":[2026]}'; o jsonb := '{"campo":"default","dir":"asc","nivel":"centro"}';
  rc jsonb; rs jsonb; r0 jsonb; p int; tot int; n int := 0; falhas text := ''; resumo text := '';
BEGIN
  for c in select unnest(array['f2d67cd4-24d0-456f-a079-a3281dcce7fd', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2']::uuid[]) loop
    p := 0;
    loop
      rc := public.fn_fin_v2_lista_pagina(c, f, o, p, 200);
      rs := public.fn_fin_v2_lista_pagina(c, f, o || '{"so_linhas":true}', p, 200);
      if p = 0 then
        tot := (rc->>'total_linhas')::int; r0 := rc;
        if rc->'fornecedores' is null or rc->'totais' is null or jsonb_typeof(rc->'totais') <> 'object' then falhas := falhas || format(' [%s] C: a completa sem mapa/totais;', c); end if;
        if public.fn_fin_v2_lista_pagina(c, f, o || '{"so_linhas":false}', 0, 200) <> rc then falhas := falhas || format(' [%s] C: so_linhas=false difere da completa;', c); end if;
      end if;
      if rs->'linhas' <> rc->'linhas' then falhas := falhas || format(' [%s p%s] L: linhas diferem;', c, p); end if;
      if rs->'total_linhas' <> rc->'total_linhas' then falhas := falhas || format(' [%s p%s] L: total difere;', c, p); end if;
      if jsonb_typeof(rs->'totais') <> 'null' or jsonb_typeof(rs->'sem_caixa') <> 'null' or jsonb_typeof(rs->'contagens') <> 'null'
         or jsonb_typeof(rs->'fornecedores') <> 'null' then falhas := falhas || format(' [%s p%s] L: recontou;', c, p); end if;
      if p = 1 and rs->'linhas' = r0->'linhas' then falhas := falhas || format(' [%s] A: a comparacao nao separa a pagina 1 da 0;', c); end if;
      n := n + 1;
      exit when (p + 1) * 200 >= tot;
      p := p + 1;
    end loop;
    resumo := resumo || format(' %s=%s pag/%s lanc', left(c::text, 8), p + 1, tot);
  end loop;
  if n < 30 then raise exception 'conjunto pequeno demais (% paginas)', n; end if;
  if falhas <> '' then raise exception 'L/C/A:%', falhas; end if;
  RAISE EXCEPTION 'OK (% paginas;%)', n, resumo;
END $t$;
