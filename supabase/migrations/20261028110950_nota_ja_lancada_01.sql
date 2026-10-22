-- NOTA-JA-LANCADA-01 (Gabriel 22/10/2026, urgente) — o "+ Da nota" reconhece a nota JA' LANCADA antes de oferecer criar.
-- Caso real (NJ, 22/10 08h05): NF 111 serie 10 da Nova Lineagro (CNPJ 63.627.945/0015-53), 4 x 341,34; ja' existia como
-- "Medicamentos Bovinos 1/4..4/4" (3 realizados + 1 programado) no cadastro "Lineagro Produtos Agropecuarios SA" SEM CNPJ — e a previa
-- ofereceu "Criar 4 parcelas": o "Atualizar este" (FIN-NOTA-PDF-01/01b) so' procurava lancamento ABERTO do MESMO cadastro.
-- `fn_nota_ja_lancada(cliente, parcelas, numero, chave, emitente_documento, nomes)` — SO' LEITURA. Procura no cliente, em QUALQUER
-- status (cancelados e cenario meta fora), os lancamentos que batem com a nota:
--   · por VALOR E DATA: cada parcela da nota (`[{n, vencimento, valor_cent}]`) contra o valor (+-5 centavos) e o vencimento (ou o
--     pagamento, ou a competencia) (+-5 dias), SO' nos cadastros PARECIDOS com o emitente: mesma raiz de CNPJ (8 digitos), os mesclados
--     neles (e o cadastro em que eles foram mesclados) e os SEM CNPJ com o nome igual ou parecido (`_fn_fornecedor_chave_comparavel` /
--     `_fn_fornecedor_parecido`, a regra do cadastro);
--   · pelo NUMERO do documento (so' digitos, sem zeros a' esquerda) nesses mesmos cadastros;
--   · pela CHAVE de acesso num documento vivo ligado (qualquer cadastro).
-- Devolve uma linha por lancamento, com as parcelas que ele casa (diferenca em centavos e em dias): quem escolhe por parcela e' a tela.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_nota_ja_lancada(p_cliente uuid, p_parcelas jsonb, p_numero text, p_chave text,
  p_emitente_documento text, p_nomes text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET plan_cache_mode = force_custom_plan AS $f$
DECLARE v_raiz text := left(regexp_replace(coalesce(p_emitente_documento, ''), '\D', '', 'g'), 8);
        v_num text := ltrim(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), '0');
        v_chave text := regexp_replace(coalesce(p_chave, ''), '\D', '', 'g');
        v_nomes text[]; v_ret jsonb;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT c), '{}') INTO v_nomes
    FROM (SELECT public._fn_fornecedor_chave_comparavel(x) c FROM unnest(coalesce(p_nomes, '{}'::text[])) x) s WHERE c <> '';

  -- primeiro o barato (valor e data; o numero); o fornecedor so' e' testado nos poucos que sobram
  WITH p AS (SELECT (e->>'n')::int n, (e->>'vencimento')::date venc, (e->>'valor_cent')::bigint vc FROM jsonb_array_elements(coalesce(p_parcelas, '[]'::jsonb)) e),
  vivos AS (
    SELECT l.* FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND NOT l.cancelado AND coalesce(l.cenario, 'realizado') <> 'meta'
  ),
  cand_valor AS (
    SELECT l.id, l.favorecido_id, p.n, abs(round(l.valor * 100)::bigint - p.vc) dc,
           abs(coalesce(l.data_vencimento, l.data_pagamento, l.data_competencia) - p.venc) dd
      FROM vivos l JOIN p ON abs(round(l.valor * 100)::bigint - p.vc) <= 5
                         AND abs(coalesce(l.data_vencimento, l.data_pagamento, l.data_competencia) - p.venc) <= 5
  ),
  cand_numero AS (
    SELECT l.id, l.favorecido_id FROM vivos l
     WHERE v_num <> '' AND ltrim(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), '0') = v_num
  ),
  testar AS (SELECT DISTINCT favorecido_id id FROM (SELECT favorecido_id FROM cand_valor UNION ALL SELECT favorecido_id FROM cand_numero) x
              WHERE favorecido_id IS NOT NULL),
  -- o cadastro PARECIDO com o emitente: mesma raiz de CNPJ, ou sem CNPJ com o nome igual ou parecido
  parece AS (
    SELECT f.id, f.fundido_em_id,
           CASE WHEN length(v_raiz) = 8 AND length(regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g')) = 14
                     AND left(regexp_replace(f.cpf_cnpj, '\D', '', 'g'), 8) = v_raiz THEN 'cnpj'
                WHEN regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') = '' AND cardinality(v_nomes) > 0
                     AND EXISTS (SELECT 1 FROM unnest(v_nomes) n
                                  WHERE public._fn_fornecedor_chave_comparavel(f.nome) = n
                                     OR public._fn_fornecedor_parecido(public._fn_fornecedor_chave_comparavel(f.nome), n)) THEN 'nome' END por
      FROM public.financeiro_fornecedores f
     WHERE f.cliente_id = p_cliente
       AND (f.id IN (SELECT id FROM testar) OR f.fundido_em_id IN (SELECT id FROM testar)
            OR f.id IN (SELECT t2.fundido_em_id FROM public.financeiro_fornecedores t2 WHERE t2.id IN (SELECT id FROM testar)))
  ),
  alvo AS (
    SELECT DISTINCT ON (t.id) t.id, x.por FROM testar t
      JOIN LATERAL (
        SELECT pa.por, 1 prio FROM parece pa WHERE pa.id = t.id AND pa.por IS NOT NULL
        UNION ALL SELECT 'mesclado', 2 FROM parece pa WHERE pa.fundido_em_id = t.id AND pa.por IS NOT NULL
        UNION ALL SELECT 'mesclado', 2 FROM parece pa JOIN public.financeiro_fornecedores tf ON tf.id = t.id
                   WHERE pa.id = tf.fundido_em_id AND pa.por IS NOT NULL) x ON true
     ORDER BY t.id, x.prio
  ),
  por_valor AS (
    SELECT c.id, jsonb_agg(jsonb_build_object('n', c.n, 'dif_cent', c.dc, 'dif_dias', c.dd) ORDER BY c.n) parcelas
      FROM cand_valor c JOIN alvo a ON a.id = c.favorecido_id GROUP BY c.id
  ),
  por_numero AS (SELECT c.id FROM cand_numero c JOIN alvo a ON a.id = c.favorecido_id),
  por_chave AS (
    SELECT DISTINCT d.lancamento_id id FROM public.vw_lancamento_documentos d
     WHERE length(v_chave) = 44 AND d.cliente_id = p_cliente AND d.cancelado IS NOT TRUE AND d.lancamento_id IS NOT NULL
       AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = v_chave
  ),
  achados AS (
    SELECT id FROM por_valor UNION SELECT id FROM por_numero UNION SELECT id FROM por_chave
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'vencimento', l.data_vencimento, 'pagamento', l.data_pagamento, 'competencia', l.data_competencia,
           'descricao', l.descricao, 'valor_cent', round(l.valor * 100)::bigint, 'status', l.status_transacao,
           'conciliado', (l.status_transacao = 'conciliado' OR l.conciliado_em IS NOT NULL
                          OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = l.id AND ci.desfeito_em IS NULL)),
           'financiamento_id', l.financiamento_id, 'numero_documento', l.numero_documento,
           'fornecedor_id', l.favorecido_id, 'fornecedor_nome', f.nome, 'fornecedor_por', a.por,
           'parcelas', coalesce(pv.parcelas, '[]'::jsonb),
           'por', to_jsonb(array_remove(ARRAY[CASE WHEN pv.id IS NOT NULL THEN 'valor' END,
                                              CASE WHEN pn.id IS NOT NULL THEN 'numero' END,
                                              CASE WHEN pc.id IS NOT NULL THEN 'chave' END], NULL)))
         ORDER BY coalesce(l.data_vencimento, l.data_pagamento, l.data_competencia), l.id), '[]'::jsonb)
    INTO v_ret
    FROM achados x JOIN public.financeiro_lancamentos_v2 l ON l.id = x.id
    LEFT JOIN public.financeiro_fornecedores f ON f.id = l.favorecido_id
    LEFT JOIN alvo a ON a.id = l.favorecido_id
    LEFT JOIN por_valor pv ON pv.id = l.id LEFT JOIN por_numero pn ON pn.id = l.id LEFT JOIN por_chave pc ON pc.id = l.id;
  RETURN v_ret;
END $f$;

REVOKE ALL ON FUNCTION public.fn_nota_ja_lancada(uuid, jsonb, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_ja_lancada(uuid, jsonb, text, text, text, text[]) TO authenticated, service_role;
