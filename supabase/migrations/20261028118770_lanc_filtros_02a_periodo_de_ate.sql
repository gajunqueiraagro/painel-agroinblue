-- LANC-FILTROS-02a (Gabriel 25/11/2026, D1 (a)) — o PERÍODO da lista de Lançamentos passa a ir ao banco por DATAS: `p_filtros.de` e
-- `p_filtros.ate` ('AAAA-MM-DD', os dois inclusivos), o intervalo do seletor de período (o mesmo do DRE). "12 meses", "Esta safra" e o
-- recorte por dia não cabem no produto cartesiano anos x meses (dez/25–nov/26 viraria 24 meses).
-- · Vindo os dois, eles MANDAM sobre `anos`/`meses`: UMA faixa [de, ate + 1) na dimensão escolhida (financeira, competência, vencimento,
--   pagamento), pelo MESMO caminho das faixas de hoje (`v_faixas` + os limites `v_dmin`/`v_dmax` do índice). Nada mais muda: grade,
--   totais, contagens, Prontos/Faltando, a seção sem caixa e o "N lanç." dos fornecedores seguem o recorte, como seguiam o do ano/mês.
-- · Só um dos dois, data torta ou fim antes do início = recusa 22023 (nunca "sem período" calado). Sem nenhum dos dois = como hoje.
--
-- PATCH guardado por md5 da definição viva (a do 118600 + o que veio depois): se ela mudou, NADA é aplicado. O trecho casa uma vez só.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)'::regprocedure);
  v_novo text;
  r record;
begin
  if md5(v_def) <> '823212d86009575bc9d9cd1acfdc806e' then
    raise exception 'LANC-FILTROS-02a: fn_fin_v2_lista_pagina mudou desde a prévia';
  end if;
  v_novo := v_def;
  for r in select * from (values
    (1, E'    select min(lower(r)), max(upper(r)) into v_dmin, v_dmax from unnest(v_faixas) r;\n  end if;\n',
        E'    select min(lower(r)), max(upper(r)) into v_dmin, v_dmax from unnest(v_faixas) r;\n  end if;\n'
        || E'  -- LANC-FILTROS-02a: o PERÍODO por datas (`de`/`ate`, inclusivos) manda sobre anos x meses: UMA faixa [de, ate + 1).\n'
        || E'  -- O recorte exato é o dos limites `v_dmin`/`v_dmax` da `base`; `v_faixas` troca os anos x meses que vierem junto e `v_meses`\n'
        || E'  -- vazio desliga o "mês em qualquer ano" do `temporal`.\n'
        || E'  if nullif(f->>''de'', '''') is not null or nullif(f->>''ate'', '''') is not null then\n'
        || E'    if coalesce(f->>''de'', '''') !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' or coalesce(f->>''ate'', '''') !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' then\n'
        || E'      raise exception ''periodo invalido: % a %'', f->>''de'', f->>''ate'' using errcode = ''22023'';\n'
        || E'    end if;\n'
        || E'    if (f->>''ate'')::date < (f->>''de'')::date then\n'
        || E'      raise exception ''periodo invalido: % a %'', f->>''de'', f->>''ate'' using errcode = ''22023'';\n'
        || E'    end if;\n'
        || E'    v_dmin   := (f->>''de'')::date;\n'
        || E'    v_dmax   := (f->>''ate'')::date + 1;\n'
        || E'    v_faixas := array[daterange(v_dmin, v_dmax, ''[)'')];\n'
        || E'    v_meses  := ''{}'';\n'
        || E'  end if;\n')
  ) t(n, de, para) loop
    if (length(v_novo) - length(replace(v_novo, r.de, ''))) / length(r.de) <> 1 then
      raise exception 'LANC-FILTROS-02a: o trecho % nao casa uma vez so''', r.n;
    end if;
    v_novo := replace(v_novo, r.de, r.para);
  end loop;
  execute v_novo;
end $patch$;
