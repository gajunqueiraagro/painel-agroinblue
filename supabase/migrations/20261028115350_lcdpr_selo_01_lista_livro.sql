-- LCDPR-SELO-01 B4 (Gabriel 13/11/2026 17:25: S1 ícone ✓/○/?, S2 filtro PRÓPRIO "Livro caixa: Todos | Entra | Fora | Pendente" do banco,
-- S3 primeiro só o LADO; o imóvel numa 2ª etapa) — a lista de Lançamentos passa a dizer, por linha, de que lado do LIVRO CAIXA o lançamento
-- está, e aceita o filtro.
-- ⚠ UMA FONTE: o lado vem da `vw_fin_livro_caixa` (exceção > sem caixa > sem classificação > regra do cliente > regra global > confirmar),
--   a MESMA que a marca do modal lê; nada se calcula aqui nem se grava (sem coluna nova: medido 113 ms o NJ inteiro, ~1 ms a página).
-- · `p_filtros.livro` = 'todos' (padrão) | 'entra' | 'fora' | 'pendente' (= alguma parte no "confirmar"). Lançamento dividido com partes em
--   lados diferentes entra em cada filtro que alguma parte casa. O filtro RECORTA o `temporal` (como a data): grade, totais, contagens, a
--   seção sem caixa e o "N lanç." dos fornecedores seguem o recorte. Em 'todos' o recorte do livro nem é lido (variável = constante no plano).
-- · cada linha da página ganha `livro` = {lado: entra|fora|confirmar|misto, origem, motivo} (as partes juntas: um lado só, ou 'misto').
--
-- PATCH guardado por md5 da definição viva (a da 114120 + o que veio depois): se ela mudou, NADA é aplicado. Cada trecho casa uma vez só.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)'::regprocedure);
  v_novo text;
  r record;
begin
  if md5(v_def) <> '49b83a224030daebc562fe0847aecf43' then
    raise exception 'LCDPR-SELO-01: fn_fin_v2_lista_pagina mudou desde a prévia';
  end if;
  v_novo := v_def;
  for r in select * from (values
    (1, 'v_prod text; v_forn uuid; v_forns uuid[]; v_modo text;', 'v_prod text; v_forn uuid; v_forns uuid[]; v_modo text; v_livro text;'),
    (2, E'    raise exception ''modo_sem_caixa invalido: %'', v_modo using errcode = ''22023'';\n  end if;\n',
        E'    raise exception ''modo_sem_caixa invalido: %'', v_modo using errcode = ''22023'';\n  end if;\n'
        || E'  -- LCDPR-SELO-01: o lado do livro caixa (a `vw_fin_livro_caixa`); pendente = alguma parte no "confirmar"\n'
        || E'  v_livro  := coalesce(nullif(f->>''livro'', ''''), ''todos'');\n'
        || E'  if v_livro not in (''todos'', ''entra'', ''fora'', ''pendente'') then\n'
        || E'    raise exception ''livro invalido: %'', v_livro using errcode = ''22023'';\n'
        || E'  end if;\n'),
    (3, E'  temporal as (',
        E'  livro_sel as (   -- LCDPR-SELO-01: os lançamentos do cliente com alguma parte no lado escolhido (só lido fora do ''todos'')\n'
        || E'    select v.lancamento_id from public.vw_fin_livro_caixa v\n'
        || E'     where v_livro <> ''todos'' and v.cliente_id = p_cliente\n'
        || E'     group by v.lancamento_id\n'
        || E'    having bool_or(v.lado = case v_livro when ''pendente'' then ''confirmar'' else v_livro end)\n'
        || E'  ),\n'
        || E'  temporal as ('),
    (4, E'                else b.d is not null end\n  ),',
        E'                else b.d is not null end\n'
        || E'       and (v_livro = ''todos'' or b.id in (select ls.lancamento_id from livro_sel ls))\n  ),'),
    (5, E'jsonb_agg(to_jsonb(l) || jsonb_build_object(''conciliado'', g.conciliado)',
        E'jsonb_agg(to_jsonb(l) || jsonb_build_object(''conciliado'', g.conciliado)\n'
        || E'                   -- LCDPR-SELO-01: o lado do livro (as partes juntas; lados diferentes = ''misto'')\n'
        || E'                   || jsonb_build_object(''livro'', (select case when count(*) = 0 then null else jsonb_build_object(\n'
        || E'                        ''lado'', case when count(distinct lv.lado) = 1 then min(lv.lado) else ''misto'' end,\n'
        || E'                        ''origem'', case when count(distinct lv.origem) = 1 then min(lv.origem) else ''misto'' end,\n'
        || E'                        ''motivo'', string_agg(distinct lv.motivo, '' · '')) end\n'
        || E'                      from public.vw_fin_livro_caixa lv where lv.lancamento_id = l.id))')
  ) t(n, de, para) loop
    if (length(v_novo) - length(replace(v_novo, r.de, ''))) / length(r.de) <> 1 then
      raise exception 'LCDPR-SELO-01: o trecho % nao casa uma vez so''', r.n;
    end if;
    v_novo := replace(v_novo, r.de, r.para);
  end loop;
  execute v_novo;
end $patch$;
