-- 20261027160000_dre_cascata_modal_01.sql
-- DRE-CASCATA-MODAL-01: `fn_dre_pecuaria_patrimonio` passa a devolver o DESFRUTE POR TIPO dentro de `movimentos`,
-- para a aba Desfrute da "Leitura dos anos" (modal do grafico do DRE da pecuaria). Decisao do Gabriel, 28/09/2026.
--
--   movimentos.desfrute_por_tipo = { abate:   {cabecas, arrobas},
--                                    venda:   {cabecas, arrobas},   -- tipos 'venda' e 'venda_pe'
--                                    consumo: {cabecas, arrobas} }
--
-- ⚠ ADITIVA: so' a chave nova. As tres parcelas saem das MESMAS linhas que ja' formam `movimentos.vendas_abates`
--   (a CTE `mva`, ramo `mov = 'vendas_abates'`), com o MESMO kg (peso medio; no abate sem peso medio, a carcaca / 0,5)
--   e a MESMA conversao (kg / 30, @ viva). A soma das cabecas e' a do `vendas_abates`; a das arrobas pode diferir em
--   centavos de @ porque cada parcela e' arredondada a duas casas por conta propria.
-- ⚠ A CTE `mva` ganhou a coluna `tp` (o `lancamentos.tipo`; nulo no ramo da producao). `mvk` e `mvv` leem colunas por
--   nome e nao a veem.
--
-- PATCH GUARDADO POR md5 (a alternativa ao corpo integral aprovada em 24/09/2026): aborta se o corpo de origem nao for o
-- esperado, se alguma ancora nao casar exatamente 1x, ou se o corpo resultante nao for o provado. O cabecalho (assinatura,
-- LANGUAGE sql, STABLE, SECURITY DEFINER, search_path) e' o de hoje, byte a byte; o ACL nao muda (CREATE OR REPLACE o
-- preserva) e e' conferido no fim.
--   fn_dre_pecuaria_patrimonio  641d00379adfa1f671a60b5b1a168aff -> ab60f3887af8f2b16c2543cb6addcb3d
-- PROVA (rollback no proto, 28/09/2026, antes de aplicar): md5 de cada saida antes (funcao de hoje) x depois (esta
-- migration dentro da transacao, sem a chave nova) — 49 chamadas no Global (os 7 clientes x 2020-2026, 2026 ate ago; 38
-- com dado, 11 vazias: Vera 2020-2023, Raul 2020 e Teste Cliente) e 22 por fazenda (toda fazenda com cache x 2025 e 2026,
-- md5 do conjunto e3feab02 nos dois lados): 71 de 71 IDENTICAS. Cabecas abate+venda+consumo = vendas_abates em 71 de 71;
-- arrobas ate 0,01 @ de diferenca (arredondamento por parcela). Cabecalho (STABLE, SECURITY DEFINER, search_path) e ACL
-- iguais.

do $mig$
declare
  v_antes text; v_novo text; v_depois text; v_acl text;
  a1 text; b1 text; a2 text; b2 text; a3 text; b3 text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria_patrimonio' and n.nspname = 'public';

  if md5(v_antes) <> '641d00379adfa1f671a60b5b1a168aff' then
    raise exception 'fn_dre_pecuaria_patrimonio nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  end if;

  -- a coluna `tp` nos dois ramos do UNION da CTE `mva`
  a1 := E'end, 0) kg\n  from lancamentos l';
  b1 := E'end, 0) kg,\n    l.tipo::text tp\n  from lancamentos l';
  a2 := E'''produzidas''::text, 0, z.producao_biologica\n';
  b2 := E'''produzidas''::text, 0, z.producao_biologica, null::text\n';
  -- a chave nova, antes da ponta final de `movimentos`
  a3 := E'      ''fim'',            jsonb_build_object(''cabecas'',pt.cab1,''arrobas'',pt.at1,''valor'',pt.val1))';
  b3 := E'      ''desfrute_por_tipo'', (select jsonb_build_object(\n'
     || E'          ''abate'',   jsonb_build_object(''cabecas'',coalesce(sum(q) filter (where tp=''abate''),0),\n'
     || E'                                          ''arrobas'',round(coalesce(sum(kg) filter (where tp=''abate''),0)/30.0,2)),\n'
     || E'          ''venda'',   jsonb_build_object(''cabecas'',coalesce(sum(q) filter (where tp in (''venda'',''venda_pe'')),0),\n'
     || E'                                          ''arrobas'',round(coalesce(sum(kg) filter (where tp in (''venda'',''venda_pe'')),0)/30.0,2)),\n'
     || E'          ''consumo'', jsonb_build_object(''cabecas'',coalesce(sum(q) filter (where tp=''consumo''),0),\n'
     || E'                                          ''arrobas'',round(coalesce(sum(kg) filter (where tp=''consumo''),0)/30.0,2)))\n'
     || E'        from mva where mov=''vendas_abates''),\n'
     || a3;

  if (length(v_antes) - length(replace(v_antes, a1, ''))) / length(a1) <> 1 then raise exception 'ancora a1 nao casa exatamente 1x'; end if;
  if (length(v_antes) - length(replace(v_antes, a2, ''))) / length(a2) <> 1 then raise exception 'ancora a2 nao casa exatamente 1x'; end if;
  if (length(v_antes) - length(replace(v_antes, a3, ''))) / length(a3) <> 1 then raise exception 'ancora a3 nao casa exatamente 1x'; end if;

  v_novo := replace(replace(replace(v_antes, a1, b1), a2, b2), a3, b3);

  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text)'
       || ' RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';

  select prosrc, proacl::text into v_depois, v_acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria_patrimonio' and n.nspname = 'public';

  if md5(v_depois) <> 'ab60f3887af8f2b16c2543cb6addcb3d' then
    raise exception 'corpo resultante inesperado (md5 %). Esperado ab60f3887af8f2b16c2543cb6addcb3d.', md5(v_depois);
  end if;
  if v_acl <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' then
    raise exception 'ACL mudou: %', v_acl;
  end if;
end $mig$;
