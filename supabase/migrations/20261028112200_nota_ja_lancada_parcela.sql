-- NOTA-CONTAS-NA-CRIACAO-01 · C (P75, Gabriel 23/10/2026 06h06–06h12) — a nota ja' lancada EM PARCELA. Caso real (Agnaldo): NF-e
-- 000.778.618 serie 2, R$ 3.284,88 paga no cartao em 4 x R$ 821,22; existiam um lancamento de 821,22 com o documento "NF_000.778.618" e
-- outro de 3.284,88 com "778618". `fn_nota_ja_lancada` (20261028110950) ja' comparava o numero por TODOS os digitos sem zeros a' esquerda
-- ("NF_000.778.618" = "000.778.618" = "778618"); o numero da parcela grudado ("778618-2/4", "000.778.618-1") virava 7786182 e escapava.
-- Agora casa tambem um TRECHO de digitos (o ponto de milhar sai antes), sempre so' nos cadastros parecidos com o emitente (raiz do CNPJ,
-- mesclados, ou sem CNPJ com o nome parecido) — a regra do fornecedor nao muda. A fracao da nota ("parcela ? de 4") e' da tela: o
-- valor x N = a nota (`jaLancada.ts`). O resto da funcao e' o da 110950, sem mudanca.
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
  -- o NUMERO: todos os digitos (sem zeros a' esquerda) OU um trecho de digitos dele (o ponto de milhar sai antes): "NF_000.778.618",
  -- "000.778.618", "778618", "778618-2/4" e "000.778.618 parc 1" dao 778618. O `strpos` barato corta antes da expressao regular.
  cand_numero AS (
    SELECT l.id, l.favorecido_id FROM vivos l
     WHERE v_num <> '' AND strpos(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), v_num) > 0
       AND (ltrim(regexp_replace(l.numero_documento, '\D', '', 'g'), '0') = v_num
            OR EXISTS (SELECT 1 FROM regexp_matches(replace(l.numero_documento, '.', ''), '\d+', 'g') m WHERE ltrim(m[1], '0') = v_num))
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
