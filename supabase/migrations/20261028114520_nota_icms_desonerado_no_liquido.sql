-- SUGESTAO-ITENS-03 §3 (Gabriel 27/11: "OK o conserto do ICMS desonerado") — lote 114520 · Code 2
-- A NF-e com ICMS DESONERADO e `indDeduzDeson` = 1 (ou nota antiga cujo vNF já sai sem ele) tem o valor da nota = produtos − desonerado (NF 54.388:
-- 50.508,92 − 17% = 41.922,40). O leitor do XML passa a deduzir o desonerado do líquido do item (`icms.desoneradoCent`, `icms.deduzDesonerado`);
-- a conferência do escritor ÚNICO dos itens (`fn_nota_fiscal_gravar`: "o líquido fecha com produto, descontos e acréscimos") passa a aceitar a
-- MESMA dedução. Patch guardado: o md5 da função lida em 27/11 e o trecho que muda, que aparece UMA vez. Nada mais muda na função.
-- DESFAZER: o mesmo patch ao contrário (o trecho volta a terminar no `fcp_st`).

do $$
declare
  d text;
  c_ancora constant text := '+ coalesce((i->''fcp_st''->>''valorCent'')::bigint, 0);';
  c_novo constant text := '+ coalesce((i->''fcp_st''->>''valorCent'')::bigint, 0)'
    || E'\n'
    || '      - case when coalesce((i->''icms''->>''deduzDesonerado'')::boolean, false) then coalesce((i->''icms''->>''desoneradoCent'')::bigint, 0) else 0 end;';
begin
  d := pg_get_functiondef('public.fn_nota_fiscal_gravar(uuid,jsonb,jsonb,boolean,uuid)'::regprocedure);
  if md5(d) <> 'cdea3e59cfe8c942b944770ba8a36d47' then
    raise exception 'fn_nota_fiscal_gravar mudou desde a leitura de 27/11 (md5): reler antes de aplicar';
  end if;
  if (length(d) - length(replace(d, c_ancora, ''))) / length(c_ancora) <> 1 then
    raise exception 'o trecho do líquido não aparece exatamente uma vez: reler antes de aplicar';
  end if;
  execute replace(d, c_ancora, c_novo);
  if (select count(*) from pg_proc where oid = 'public.fn_nota_fiscal_gravar(uuid,jsonb,jsonb,boolean,uuid)'::regprocedure
        and pg_get_functiondef(oid) like '%deduzDesonerado%') <> 1 then
    raise exception 'o patch não ficou na função';
  end if;
end $$;
