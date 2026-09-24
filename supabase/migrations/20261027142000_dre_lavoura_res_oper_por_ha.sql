-- DRE-DESTAQUE-LAVOURA-01 (parte 1) — `por_ha` no resultado operacional da lavoura
--
-- POR QUE
-- O DRE-DESTAQUE-02 deu a faixa navy ao Lucro operacional da PECUARIA, com "% do VBP" e
-- "por hectare". Espelhar isso na Lavoura esbarra na RPC: `fn_dre_lavoura` devolve `pct_receita`
-- para `resultado_operacional`, mas NAO devolve `por_ha` — so' `resultado_caixa` e `lucro_liquido`
-- o tem. Sem esta migration, a linha do Lucro operacional ficaria com o percentual e sem o
-- hectare, e as duas faixas navy da Lavoura sairiam diferentes entre si.
--
-- ⚠ E DIVIDIR NO FRONT ESTAVA FORA DE QUESTAO. O proprio arquivo da tela registra a regra, duas
-- vezes: "o numero vem pronto da RPC, nao e' dividido aqui: refazer a conta no front criaria a
-- segunda dona dela — que diverge no primeiro ajuste de area". A area que a RPC usa e' a da
-- cultura (ou a da safra, no total); o front tem outra.
--
-- O QUE MUDA: uma chave no `jsonb_build_object` de `resultado_operacional`, com a MESMA conta que
-- `resultado_caixa` ja' usa duas linhas abaixo:
--     'por_ha', CASE WHEN area_ha > 0 THEN round(resultado_operacional/area_ha,2) END
--
-- ⚠ SAO DOIS BLOCOS, NAO UM, e eles diferem por UM ESPACO depois da virgula:
--     linha 139  'resultado_operacional',jsonb_build_object(...)   <- bloco da CULTURA
--     linha 190  'resultado_operacional', jsonb_build_object(...)  <- bloco do TOTAL
--   A primeira ancora que escrevi casava 1x e teria deixado a coluna Total sem `por_ha` enquanto
--   as culturas o tinham — a assimetria que se le como defeito. O patch abaixo exige que CADA UMA
--   case exatamente uma vez, e aborta se nao casar.
--
-- METODO: patch guardado por md5, nao diff cego. A migration recusa-se a rodar se o corpo de
-- origem nao for o esperado, e confere o md5 do resultado. Reexecutar sobre um corpo ja' corrigido
-- falha na guarda de origem — que e' o comportamento certo para uma migration de corpo.
--   md5(prosrc) ANTES:  3698ef1504298a83f3bb0a2e447235c1  (14.107 chars)
--   md5(prosrc) DEPOIS: 2108094b3146b145ebdd73e24d56953d  (14.269 chars, +162 = 2 x 81)
--
-- PROVAS (BEGIN ... ROLLBACK, 24/09/2026), NJ, Safra 25/26 Lavoura, cultura amendoim:
--   area_ha                      185
--   resultado_operacional        286.691,22
--   por_ha devolvido             1.549,68   = 286.691,22 / 185, ao centavo
--   por_ha do TOTAL              225,83     (prova que o segundo bloco tambem pegou)
--   antes tinha `por_ha`?        false
--   resto do payload identico    true       (jsonb inteiro, menos as duas chaves novas)
--   corpo = original + as duas adicoes      true
--   Rollback conferido depois: md5 de volta a 3698ef15, 14.107 chars.
--
-- SEM REVOKE/GRANT: `fn_dre_lavoura` NAO e' SECURITY DEFINER (`prosecdef = false`) e `anon` ja'
-- esta' sem EXECUTE (conferido). Nao ha' superficie a fechar.

do $mig$
declare
  v_antes text; v_novo text; v_depois text;
  a1 text; b1 text; a2 text; b2 text; add_txt text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_lavoura' and n.nspname = 'public';

  if md5(v_antes) <> '3698ef1504298a83f3bb0a2e447235c1' then
    raise exception 'fn_dre_lavoura nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  end if;

  add_txt := ', ''por_ha'', CASE WHEN area_ha > 0 THEN round(resultado_operacional/area_ha,2) END';

  -- bloco da CULTURA (sem espaco depois da virgula)
  a1 := '''resultado_operacional'',jsonb_build_object(''valor'', resultado_operacional, ''pct_receita'', CASE WHEN receita_liquida <> 0 THEN round(100*resultado_operacional/receita_liquida,1) END)';
  b1 := replace(a1, 'END)', 'END' || add_txt || ')');
  -- bloco do TOTAL (com espaco)
  a2 := '''resultado_operacional'', jsonb_build_object(''valor'', resultado_operacional, ''pct_receita'', CASE WHEN receita_liquida <> 0 THEN round(100*resultado_operacional/receita_liquida,1) END)';
  b2 := replace(a2, 'END)', 'END' || add_txt || ')');

  if (length(v_antes) - length(replace(v_antes, a1, ''))) / length(a1) <> 1 then
    raise exception 'a ancora do bloco da CULTURA nao casa exatamente 1x';
  end if;
  if (length(v_antes) - length(replace(v_antes, a2, ''))) / length(a2) <> 1 then
    raise exception 'a ancora do bloco do TOTAL nao casa exatamente 1x';
  end if;

  v_novo := replace(replace(v_antes, a1, b1), a2, b2);

  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_lavoura(p_cliente_id uuid, p_safra_id uuid)'
       || ' RETURNS jsonb LANGUAGE sql STABLE AS $fn$' || v_novo || '$fn$';

  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_lavoura' and n.nspname = 'public';

  if md5(v_depois) <> '2108094b3146b145ebdd73e24d56953d' then
    raise exception 'corpo resultante inesperado (md5 %). Esperado 2108094b3146b145ebdd73e24d56953d.', md5(v_depois);
  end if;
end $mig$;
