-- 20261027159000_dre_modal_subcentro_01.sql
-- DRE-MODAL-SUBCENTRO-01: `fn_painel_rateio_detalhe` passa a devolver o SUBCENTRO de cada linha, lido da CHAVE
-- (`financeiro_plano_contas.id = l.plano_conta_id`), para o quadro "Por subcentro" do modal de valor do DRE.
-- Decisao do Gabriel, 28/09/2026.
--
-- ⚠ ADITIVA: so' uma chave nova (`subcentro`) em cada linha de `lancamentos`, nos dois ramos — natureza /
--   investimento / pool_fixo / pool_investimento (a Lavoura) e admin (o rateio administrativo da Lavoura e da
--   Pecuaria). Nenhum numero, filtro, ordem ou outra chave muda. Os FILTROS continuam lendo as copias
--   (`l.centro_custo`, `l.macro_custo`, `l.escopo_negocio`) — pendencia DRE-LEITOR-CHAVE-01; desde o
--   DRE-CLASSIF-COPIA-01 elas estao alinhadas a' chave pelo gatilho.
-- ⚠ A LINHA DO PLANEJAMENTO (ramo admin, meta) ja' junta o plano por subcentro: devolve `p.subcentro`.
--
-- PATCH GUARDADO POR md5 (a alternativa ao corpo integral aprovada em 24/09/2026): aborta se o corpo de origem
-- nao for o esperado, se alguma ancora nao casar exatamente 1x, ou se o corpo resultante nao for o provado.
-- O cabecalho (assinatura com defaults, plpgsql, SECURITY DEFINER, search_path) e' o de hoje, byte a byte; o
-- ACL nao muda (CREATE OR REPLACE o preserva) e e' conferido no fim.
--   fn_painel_rateio_detalhe  6f69f1cc794b8d618ab71ba50abd473f -> 634705c39f0452f98ad9c09cf2daaeb8
-- PROVA (rollback no proto, 28/09/2026, antes de aplicar): 246 chamadas — admin/pecuaria 98 (7 clientes x 2020-2026 x
-- realizado/meta), natureza 69, investimento 64, admin/agricultura 5, pool_fixo 5, pool_investimento 5 (toda safra
-- agricola x cultura plantada x centro com saida). 16.323 linhas antes e depois; 0 saidas divergentes tirada a chave
-- nova; as 147 identicas cruas sao exatamente as chamadas sem linha (246 - 99). Nenhuma linha sem a chave e nenhum
-- subcentro nulo. ACL, SECURITY DEFINER e search_path iguais.

do $mig$
declare
  v_antes text; v_novo text; v_depois text; v_acl text;
  a1 text; b1 text; a2 text; b2 text; a3 text; b3 text; a4 text; b4 text; a5 text; b5 text;
  sub_chave constant text := '(select pcs.subcentro from financeiro_plano_contas pcs where pcs.id=l.plano_conta_id)';
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_painel_rateio_detalhe' and n.nspname = 'public';

  if md5(v_antes) <> '6f69f1cc794b8d618ab71ba50abd473f' then
    raise exception 'fn_painel_rateio_detalhe nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  end if;

  -- ramo natureza/investimento/pool: a coluna na CTE `lc` e a chave no json da linha
  a1 := 'l.centro_custo ctr,';
  b1 := 'l.centro_custo ctr, ' || sub_chave || ' sub,';
  a2 := '''centro'',ctr,';
  b2 := '''centro'',ctr,''subcentro'',sub,';
  -- ramo admin: a coluna nos dois lados do UNION da CTE `adml` (lancamento pela chave; planejamento pelo plano ja' juntado)
  a3 := 'coalesce(l.centro_custo,''(sem)'') grupo, ''lancamento''::text origem';
  b3 := a3 || ', ' || sub_chave || ' sub';
  a4 := 'coalesce(p.centro_custo,''(sem)''), ''planejamento''::text';
  b4 := a4 || ', p.subcentro';
  -- e a chave no json da linha do admin (a outra ocorrencia de 'grupo',grupo e' a dos grupos, que nao muda)
  a5 := '''grupo'',grupo,''pct'',pct';
  b5 := '''grupo'',grupo,''subcentro'',sub,''pct'',pct';

  if (length(v_antes) - length(replace(v_antes, a1, ''))) / length(a1) <> 1 then raise exception 'ancora a1 nao casa exatamente 1x'; end if;
  if (length(v_antes) - length(replace(v_antes, a2, ''))) / length(a2) <> 1 then raise exception 'ancora a2 nao casa exatamente 1x'; end if;
  if (length(v_antes) - length(replace(v_antes, a3, ''))) / length(a3) <> 1 then raise exception 'ancora a3 nao casa exatamente 1x'; end if;
  if (length(v_antes) - length(replace(v_antes, a4, ''))) / length(a4) <> 1 then raise exception 'ancora a4 nao casa exatamente 1x'; end if;
  if (length(v_antes) - length(replace(v_antes, a5, ''))) / length(a5) <> 1 then raise exception 'ancora a5 nao casa exatamente 1x'; end if;

  v_novo := replace(replace(replace(replace(replace(v_antes, a1, b1), a2, b2), a3, b3), a4, b4), a5, b5);

  execute 'CREATE OR REPLACE FUNCTION public.fn_painel_rateio_detalhe(p_cliente uuid, p_safra_id uuid, p_cultura text, p_tipo text, p_chave text, p_atividade text DEFAULT ''agricultura''::text, p_de text DEFAULT NULL::text, p_ate text DEFAULT NULL::text, p_cenario text DEFAULT ''realizado''::text)'
       || ' RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';

  select prosrc, proacl::text into v_depois, v_acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_painel_rateio_detalhe' and n.nspname = 'public';

  if md5(v_depois) <> '634705c39f0452f98ad9c09cf2daaeb8' then
    raise exception 'corpo resultante inesperado (md5 %). Esperado 634705c39f0452f98ad9c09cf2daaeb8.', md5(v_depois);
  end if;
  if v_acl <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' then
    raise exception 'ACL mudou: %', v_acl;
  end if;
end $mig$;
