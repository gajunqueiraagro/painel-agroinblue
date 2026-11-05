-- FIN-FILTRO-FILIAIS-01 (Gabriel 04/11/2026: "+ filiais (N)" na linha do rótulo Fornecedor · inativos entram) — o filtro de fornecedor de
-- Lançamentos passa a aceitar o CONJUNTO de cadastros (`p_filtros.fornecedor_ids`, lista de ids): o escolhido + as filiais (mesma raiz de
-- 8 dígitos do CNPJ, do mesmo cliente; inativas entram; mesclado nunca). Quem monta o conjunto é a tela (`filiaisDoFornecedor`, a regra
-- única, sobre o leitor de fornecedores); aqui só se aplica. Sem `fornecedor_ids` (ou lista vazia), vale o `fornecedor_id` de sempre.
-- Como o `fornecedor_id`, o conjunto NÃO recorta o base: o "N lanç." de cada fornecedor (o mapa `fornecedores`) segue o recorte SEM o
-- filtro de fornecedor; a grade, os totais, as contagens e a seção sem caixa aplicam `forn_ok`.
--
-- PATCH guardado por md5 da definição viva (a da 114110): se ela mudou, NADA é aplicado. Cada trecho casa uma vez só. Só leitura.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)'::regprocedure);
  v_novo text;
  r record;
begin
  if md5(v_def) <> '62ad432f46bbce7a17d5c2bec5415ae5' then
    raise exception 'FIN-FILTRO-FILIAIS-01: fn_fin_v2_lista_pagina mudou desde a prévia';
  end if;
  v_novo := v_def;
  for r in select * from (values
    (1, 'v_prod text; v_forn uuid; v_modo text;', 'v_prod text; v_forn uuid; v_forns uuid[]; v_modo text;'),
    (2, E'  v_forn   := nullif(f->>''fornecedor_id'', '''')::uuid;\n',
        E'  v_forn   := nullif(f->>''fornecedor_id'', '''')::uuid;\n'
        || E'  -- FIN-FILTRO-FILIAIS-01: o conjunto (o escolhido + as filiais, montado pela tela) manda sobre o `fornecedor_id`\n'
        || E'  v_forns  := case when jsonb_typeof(f->''fornecedor_ids'') = ''array'' and jsonb_array_length(f->''fornecedor_ids'') > 0\n'
        || E'                   then array(select jsonb_array_elements_text(f->''fornecedor_ids'')::uuid) end;\n'),
    (3, '(v_forn is null or l.favorecido_id = v_forn) as forn_ok',
        '(case when v_forns is not null then coalesce(l.favorecido_id = any (v_forns), false) else v_forn is null or l.favorecido_id = v_forn end) as forn_ok')
  ) t(n, de, para) loop
    if (length(v_novo) - length(replace(v_novo, r.de, ''))) / length(r.de) <> 1 then
      raise exception 'FIN-FILTRO-FILIAIS-01: o trecho % nao casa uma vez so''', r.n;
    end if;
    v_novo := replace(v_novo, r.de, r.para);
  end loop;
  execute v_novo;
end $patch$;
