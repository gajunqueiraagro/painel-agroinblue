-- ENTREGA-FUTURA-LIGAR-01 · DOC-SOMA-SO-NOTA-QUE-PAGA (Gabriel 22/11) — lote 30. A remessa é NF de verdade e fica 'nf'; o conserto é na
-- FONTE: o confronto do lançamento (`fin_documento_confronto`) passa a somar no "Documentado" só a NF que GERA PAGAMENTO. A NF cuja classe,
-- pelo CFOP, é "não gera lançamento" (remessa de entrega futura 5116/5117/6116/6117, comodato, demonstração e o retorno dela, devolução,
-- garantia, bonificação, conserto, retorno, outra remessa 59xx/69xx) vira INFORMATIVA e volta em `nao_financeiras` com o motivo (o selo).
-- A REGRA É A MESMA de `classeDaNota` (src/lib/fiscal/classeDaNota.ts): `fn_classe_da_nota` é o espelho dela, linha a linha, conferido pela
-- MESMA tabela de casos (o teste `classeDaNota.test.ts` › "a tabela do banco" e o ensaio deste lote).
-- O QUE MUDA:
--   1. `fn_classe_da_nota(cfops, tpnf, natop, cancelada)` — a classe (pura, imutável).
--   2. `_fn_doc_motivo_nao_financeira(cliente, chave)` — o motivo da NF pela chave (nulo = gera pagamento ou não se sabe): os CFOPs dos
--      ITENS da `nota_fiscal` (+ natureza e tpNF do XML dela); sem ela, o XML que a busca guardou (`fiscal_dfe_recebidos`). Interna.
--   3. `fn_documentos_motivo(cliente, chaves[])` — o mesmo para a tela (o selo) e para o histórico da participação. Guarda tenant_ok.
--   4. `fin_documento_confronto`: o papel 'fiscal' do documento do lançamento exige motivo nulo; o motivo vai nos documentos e, na volta,
--      em `nao_financeiras` [{documento_id, motivo}]. NADA mais muda (bases, repetidas, pagamentos).
-- NENHUM dado muda. ⚠ PATCH DE CORPO GUARDADO POR md5 (o confronto medido em 22/11): corpo diferente ou âncora que não casa = nada grava.
-- GESTO CONTRÁRIO: os 4 `replace` ao contrário no confronto (volta ao md5 711d60e8e09fea295b47bdafd85461fb) e DROP das 3 funções novas.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- ── 1. a classe (espelho de classeDaNota) ──
CREATE OR REPLACE FUNCTION public.fn_classe_da_nota(p_cfops text[], p_tpnf text, p_natop text, p_cancelada boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH a AS (SELECT coalesce(p_cfops, '{}'::text[]) c, upper(coalesce(p_natop, '')) nat)
  SELECT CASE
    WHEN p_cancelada THEN jsonb_build_object('classe', 'cancelada')
    WHEN a.c && ARRAY['5908', '6908'] THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'comodato')
    WHEN a.c && ARRAY['5116', '5117', '6116', '6117'] THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'entrega_futura')
    WHEN a.c && ARRAY['5910', '6910', '5911', '6911'] THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'bonificacao')
    WHEN a.c && ARRAY['1202', '2202', '5202', '6202', '1411', '2411', '5411', '6411'] THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'devolucao')
    WHEN a.c && ARRAY['5913', '6913', '1913', '2913'] THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'retorno_demonstracao')
    WHEN a.c && ARRAY['5912', '6912'] THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'demonstracao')
    WHEN a.c && ARRAY['5915', '6915', '5916', '6916'] THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'conserto')
    WHEN a.c && ARRAY['5909', '6909', '1909', '2909'] THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'retorno')
    WHEN a.c && ARRAY['5949', '6949'] AND a.nat !~ 'DEBITO'
      THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', CASE WHEN a.nat ~ 'GARANTIA' THEN 'garantia' ELSE 'outra_remessa' END)
    WHEN EXISTS (SELECT 1 FROM unnest(a.c) x WHERE x ~ '^[56]9[0-9][0-9]$' AND x NOT IN ('5922', '6922', '5929', '6929', '5949', '6949'))
      THEN jsonb_build_object('classe', 'nao_financeira', 'motivo', 'outra_remessa')
    WHEN p_tpnf = '0' THEN jsonb_build_object('classe', 'venda_do_titular')
    ELSE jsonb_build_object('classe', 'compra')
  END FROM a
$function$;

-- ── 2. o motivo da NF pela chave (interna: o confronto e a função da tela chamam) ──
CREATE OR REPLACE FUNCTION public._fn_doc_motivo_nao_financeira(p_cliente uuid, p_chave text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_ch text := regexp_replace(coalesce(p_chave, ''), '\D', '', 'g');
  v_cfops text[]; v_tpnf text; v_nat text; v_xml text;
BEGIN
  IF length(v_ch) <> 44 THEN RETURN NULL; END IF;
  /* a nota lida no sistema: os CFOPs dos itens, a natureza e o tpNF do XML dela */
  SELECT array(SELECT DISTINCT i.cfop FROM public.nota_fiscal_itens i WHERE i.nota_id = n.id AND i.cfop IS NOT NULL),
         n.natureza, (regexp_match(coalesce(n.xml_original, ''), '<tpNF>(\d)</tpNF>'))[1]
    INTO v_cfops, v_nat, v_tpnf
    FROM public.nota_fiscal n
   WHERE n.cliente_id = p_cliente AND n.chave_acesso = v_ch
   LIMIT 1;
  IF coalesce(array_length(v_cfops, 1), 0) = 0 THEN
    /* sem ela (ou sem itens): o XML que a busca da Receita guardou */
    SELECT r.xml INTO v_xml FROM public.fiscal_dfe_recebidos r
     WHERE r.cliente_id = p_cliente AND r.chave = v_ch AND r.xml IS NOT NULL LIMIT 1;
    IF v_xml IS NULL THEN RETURN NULL; END IF;
    v_cfops := array(SELECT DISTINCT m[1] FROM regexp_matches(v_xml, '<CFOP>(\d{4})</CFOP>', 'g') m);
    v_tpnf := (regexp_match(v_xml, '<tpNF>(\d)</tpNF>'))[1];
    v_nat := (regexp_match(v_xml, '<natOp>([^<]*)</natOp>'))[1];
  END IF;
  RETURN CASE WHEN public.fn_classe_da_nota(v_cfops, v_tpnf, v_nat) ->> 'classe' = 'nao_financeira'
              THEN public.fn_classe_da_nota(v_cfops, v_tpnf, v_nat) ->> 'motivo' END;
END
$function$;
REVOKE ALL ON FUNCTION public._fn_doc_motivo_nao_financeira(uuid, text) FROM public, anon, authenticated;

-- ── 3. o mesmo para a tela: [{chave, motivo}] só das NFs que NÃO geram pagamento ──
CREATE OR REPLACE FUNCTION public.fn_documentos_motivo(p_cliente uuid, p_chaves text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_ret jsonb;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_chaves, 1), 0) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Chaves demais (até 2000).';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('chave', x.ch, 'motivo', x.motivo)), '[]'::jsonb) INTO v_ret
    FROM (SELECT DISTINCT regexp_replace(c, '\D', '', 'g') ch FROM unnest(p_chaves) c) s
    CROSS JOIN LATERAL (SELECT s.ch, public._fn_doc_motivo_nao_financeira(p_cliente, s.ch) motivo) x
   WHERE x.motivo IS NOT NULL;
  RETURN v_ret;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_documentos_motivo(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_documentos_motivo(uuid, text[]) TO authenticated;

-- ── 4. o confronto: só a NF que gera pagamento é fiscal ──
CREATE FUNCTION pg_temp._l30_trocar(d text, de text, para text, rotulo text) RETURNS text LANGUAGE plpgsql AS $f$
begin
  if (length(d) - length(replace(d, de, ''))) / length(de) <> 1 then
    raise exception 'LOTE 30: % — a âncora «%» não casa 1 vez. Nada foi gravado.', rotulo, de;
  end if;
  return replace(d, de, para);
end $f$;

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fin_documento_confronto'::regproc);
  IF md5(d) <> '711d60e8e09fea295b47bdafd85461fb' THEN
    RAISE EXCEPTION 'LOTE 30: fin_documento_confronto não é o medido em 22/11 (md5 %). Nada foi gravado.', md5(d);
  END IF;
  d := pg_temp._l30_trocar(d,
    $a$WHEN v.origem = 'lancamento' AND v.especie IN ('nf', 'recibo') THEN 'fiscal'$a$,
    $a$WHEN v.origem = 'lancamento' AND v.especie IN ('nf', 'recibo') AND public._fn_doc_motivo_nao_financeira(v.cliente_id, v.chave_acesso) IS NULL THEN 'fiscal'$a$,
    'papel');
  d := pg_temp._l30_trocar(d, 'END AS papel,',
    E'END AS papel,\n           /* LOTE 30 — a NF que não gera pagamento (a classe pelo CFOP): o motivo é o selo */ public._fn_doc_motivo_nao_financeira(v.cliente_id, v.chave_acesso) AS motivo_nota,',
    'motivo');
  d := pg_temp._l30_trocar(d, 'd.classe, d.emitente_id, d.formato, d.serie_n,', 'd.classe, d.emitente_id, d.formato, d.serie_n, d.motivo_nota,', 'd2');
  d := pg_temp._l30_trocar(d, $a$'repetidas',         v_rep)$a$,
    $a$'repetidas',         v_rep,
    'nao_financeiras',   (SELECT coalesce(jsonb_agg(jsonb_build_object('documento_id', e->>'documento_id', 'motivo', e->>'motivo_nota')), '[]'::jsonb)
                            FROM jsonb_array_elements(v_docs) e WHERE e->>'motivo_nota' IS NOT NULL))$a$,
    'volta');
  EXECUTE d;
END $$;
