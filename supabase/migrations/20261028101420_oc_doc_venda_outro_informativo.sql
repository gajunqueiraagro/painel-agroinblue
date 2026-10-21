-- OC-DOC-VENDA-01 (ajuste, Gabriel 21/10) — na VENDA a especie "Outro" passa a INFORMATIVA, igual ao abate: nao soma no valor da
-- operacao. Hoje: 11 documentos "outro" vivos em 5 vendas do proto deixam de somar no "Total documentado" (so' exibicao — a regra e'
-- lida pelas views de documento e pelo confronto; nada de dinheiro e' gravado a partir dela). Guardado pelo md5 do corpo de origem.
DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._oc_documento_soma_no_valor(text, text)'::regprocedure) <> '0e283ecbd93224389c22a53411ea091b' THEN
    RAISE EXCEPTION 'OC-DOC-VENDA-01 outro: corpo de origem de _oc_documento_soma_no_valor divergente';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public._oc_documento_soma_no_valor(p_tipo_operacao text, p_especie text)
 RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE
    WHEN p_tipo_operacao = 'abate' THEN p_especie IN ('nf_principal', 'nf_complementar')
    -- OC-DOC-VENDA-01: contrato, NF de entrada do comprador, comprovante e (21/10) o "outro" sao informativos
    WHEN p_tipo_operacao = 'venda' THEN p_especie NOT IN ('gta', 'guia', 'declaracao', 'contrato', 'nf_entrada', 'comprovante', 'outro')
    ELSE true END;
$function$;

DO $confere$
BEGIN
  IF public._oc_documento_soma_no_valor('venda', 'outro') OR NOT public._oc_documento_soma_no_valor('venda', 'nf_produtor')
     OR NOT public._oc_documento_soma_no_valor('venda', 'recibo') OR NOT public._oc_documento_soma_no_valor('compra', 'outro') THEN
    RAISE EXCEPTION 'OC-DOC-VENDA-01 outro: conferencia final falhou';
  END IF;
END $confere$;
