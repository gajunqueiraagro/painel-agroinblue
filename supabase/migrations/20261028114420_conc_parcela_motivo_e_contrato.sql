-- CONC-SUGESTOES-V2 (Gabriel 26/11): REGRA DE FINANCIAMENTO (b) 07:07 e o ajuste (2) das 07:45. Code 2, faixa 1144xx.
-- (a) O MOTIVO DO AJUSTE DA PARCELA: casar a parcela com outro valor pergunta o motivo (ajuste de juros = padrão · multa/juros de atraso ·
--     desconto/bônus). O ajuste e o bônus gravam pelo MESMO casar (`fn_espelho_casar`: os juros recebem o valor que fecha com o banco; o
--     "antes" fica para o desfazer); o que faltava era o MOTIVO ficar gravado — a coluna Ajuste/ⓘ do cronograma (FINANC-CRONO-TELA-01) lê dele.
--     `fn_casar_parcela_com_motivo` chama o dono e, no mesmo passo (casou = grava; recusou = nada), grava em `financiamento_parcela_ajustes`:
--     parcela · extrato · motivo · juros previsto → pago · quem/quando. NUNCA função paralela: a regra do casar é a do dono, inteira.
--     Desfeito o vínculo, o motivo deixa de valer sozinho (o leitor só considera o extrato ainda ligado à parcela); nada se apaga.
-- (b) PROCURAR PELO CONTRATO: `fn_conciliacao_historico_buscar` acha também os lançamentos das parcelas pelo nome do contrato, pelo credor,
--     pela natureza, pelo nº da cédula ("C54120515" acha "C54120515-0") e pelo TIPO ("juros", "amortização", "parcela"); casa como
--     'descricao' (o front já conhece) e cada achado de parcela leva parcela_id · contrato · numero_contrato · parcela_rotulo (o NF/DOC).
--     O resto da função não muda (corpo = o do 114380 + as linhas marcadas "ajuste (2)/(3)"). Guardado pelo md5 do corpo de hoje.

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.fn_conciliacao_historico_buscar(uuid,text,text[],date,date,numeric,text)'::regprocedure)) <> '729d5fc50da708023187b5e02df46ce1' THEN
    RAISE EXCEPTION 'CONC-SUGESTOES-V2 114420: o corpo de fn_conciliacao_historico_buscar mudou — nada aplicado';
  END IF;
  IF md5(pg_get_functiondef('public.fn_espelho_casar(uuid,jsonb,boolean,text)'::regprocedure)) <> 'f230e69d4b9a69e89015fb4914d38db8' THEN
    RAISE EXCEPTION 'CONC-SUGESTOES-V2 114420: o corpo de fn_espelho_casar mudou desde o ensaio — nada aplicado';
  END IF;
END $guarda$;

-- ── (a) o motivo do ajuste da parcela ──
CREATE TABLE public.financiamento_parcela_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  parcela_id uuid NOT NULL REFERENCES public.financiamento_parcelas(id),
  extrato_id uuid NOT NULL REFERENCES public.extrato_bancario_v2(id),
  motivo text NOT NULL CHECK (motivo IN ('ajuste_juros', 'juros_atraso', 'bonus')),
  juros_previsto numeric(14,2),
  juros_pago numeric(14,2),
  feita_por uuid,
  feita_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financiamento_parcela_ajustes_parcela_idx ON public.financiamento_parcela_ajustes (parcela_id, feita_em DESC);
ALTER TABLE public.financiamento_parcela_ajustes ENABLE ROW LEVEL SECURITY;
-- leitura do cliente; escrita só pela função (sem policy de escrita)
CREATE POLICY financiamento_parcela_ajustes_ler ON public.financiamento_parcela_ajustes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.financiamento_parcela_ajustes FROM PUBLIC, anon;
GRANT SELECT ON public.financiamento_parcela_ajustes TO authenticated;
GRANT ALL ON public.financiamento_parcela_ajustes TO service_role;

CREATE FUNCTION public.fn_casar_parcela_com_motivo(p_extrato_id uuid, p_itens jsonb, p_parcela_id uuid, p_motivo_ajuste text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cli uuid; v_ext_cli uuid; v_juros uuid; v_prev numeric; v_pago numeric; v jsonb;
BEGIN
  SELECT f.cliente_id, fp.lancamento_juros_id INTO v_cli, v_juros
    FROM public.financiamento_parcelas fp JOIN public.financiamentos f ON f.id = fp.financiamento_id WHERE fp.id = p_parcela_id;
  IF v_cli IS NULL OR NOT coalesce(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  SELECT e.cliente_id INTO v_ext_cli FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id;
  IF v_ext_cli IS DISTINCT FROM v_cli THEN
    RAISE EXCEPTION 'o movimento do banco não é deste cliente' USING ERRCODE = '42501';
  END IF;
  IF p_motivo_ajuste IS NULL OR p_motivo_ajuste NOT IN ('ajuste_juros', 'juros_atraso', 'bonus') THEN
    RAISE EXCEPTION 'motivo do ajuste inválido: %', p_motivo_ajuste USING ERRCODE = '22023';
  END IF;
  -- o item dos juros tem de estar entre os levados (o motivo é dos juros da parcela)
  IF v_juros IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) i WHERE (i->>'lancamento_id')::uuid = v_juros) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'juros_fora', 'frase', 'Leve os juros da parcela para gravar o motivo do ajuste.');
  END IF;
  SELECT abs(l.valor) INTO v_prev FROM public.financeiro_lancamentos_v2 l WHERE l.id = v_juros;
  -- O DONO casa (a regra inteira dele: soma, NF, troca de conta, o "antes", a trilha)
  v := public.fn_espelho_casar(p_extrato_id, p_itens, p_simular, 'casado_no_espelho');
  IF NOT p_simular AND coalesce((v->>'ok')::boolean, false) THEN
    SELECT abs(l.valor) INTO v_pago FROM public.financeiro_lancamentos_v2 l WHERE l.id = v_juros;
    INSERT INTO public.financiamento_parcela_ajustes (cliente_id, parcela_id, extrato_id, motivo, juros_previsto, juros_pago, feita_por)
    VALUES (v_cli, p_parcela_id, p_extrato_id, p_motivo_ajuste, v_prev, v_pago, auth.uid());
  END IF;
  RETURN coalesce(v, '{}'::jsonb) || jsonb_build_object('motivo_ajuste', p_motivo_ajuste);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_casar_parcela_com_motivo(uuid, jsonb, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_casar_parcela_com_motivo(uuid, jsonb, uuid, text, boolean) TO authenticated, service_role;

-- ── (b) o Procurar no histórico acha a parcela pelo contrato ──
CREATE OR REPLACE FUNCTION public.fn_conciliacao_historico_buscar(p_cliente uuid, p_termo text, p_onde text[] DEFAULT ARRAY['banco'::text, 'descricao'::text, 'fornecedor'::text], p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date, p_valor numeric DEFAULT NULL::numeric, p_documento text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_t text := coalesce(public._fn_normalizar_texto(p_termo), '');
  v_banco boolean := 'banco' = ANY (coalesce(p_onde, '{}'::text[]));
  v_desc boolean := 'descricao' = ANY (coalesce(p_onde, '{}'::text[]));
  v_forn boolean := 'fornecedor' = ANY (coalesce(p_onde, '{}'::text[]));
  -- CONC-SUGESTOES-V2: só um CPF (11) ou CNPJ (14) com dígito certo vale; o resto é ignorado
  v_doc text := public._fn_documento_do_texto(p_documento);
  -- CONC-SUGESTOES-V2 ajuste (2) 07:45: o nº da cédula sem pontuação ("C54120515" acha "C54120515-0")
  v_num text := lower(regexp_replace(coalesce(p_termo, ''), '[^a-zA-Z0-9]', '', 'g'));
  v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_onde IS NULL OR NOT (p_onde <@ ARRAY['banco', 'descricao', 'fornecedor']) THEN
    RAISE EXCEPTION 'onde invalido: %', p_onde USING ERRCODE = '22023';
  END IF;
  IF (length(v_t) < 2 AND v_doc IS NULL) OR NOT (v_banco OR v_desc OR v_forn) THEN
    RETURN jsonb_build_object('total', 0, 'achados', '[]'::jsonb, 'resumo', NULL);
  END IF;

  WITH l AS (
    -- P153b: todos os status vivos; a data de referencia e' o pagamento, ou o vencimento de quem nao foi pago
    SELECT l.id, l.data_pagamento, l.data_vencimento, l.data_competencia, l.status_transacao,
           coalesce(l.data_pagamento, l.data_vencimento) data_ref,
           l.descricao, l.favorecido_id, l.plano_conta_id, l.fazenda_id,
           CASE WHEN l.tipo_operacao LIKE '1-%' THEN coalesce(l.conta_destino_id, l.conta_bancaria_id) ELSE l.conta_bancaria_id END conta_id,
           CASE WHEN l.sinal = '-1' THEN -l.valor ELSE l.valor END va
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE
       AND (p_de IS NULL OR coalesce(l.data_pagamento, l.data_vencimento) >= p_de)
       AND (p_ate IS NULL OR coalesce(l.data_pagamento, l.data_vencimento) <= p_ate)
  ), b AS (
    -- o texto do banco casado com o lançamento: o do movimento mais recente, se houver mais de um
    SELECT DISTINCT ON (i.lancamento_id) i.lancamento_id, e.descricao banco
      FROM public.conciliacao_bancaria_itens i
      JOIN public.extrato_bancario_v2 e ON e.id = i.extrato_id AND e.cliente_id = p_cliente
     WHERE i.cliente_id = p_cliente AND i.desfeito_em IS NULL AND e.cancelado_em IS NULL AND e.status <> 'ignorado'
       AND i.lancamento_id IN (SELECT l.id FROM l)
     ORDER BY i.lancamento_id, e.data_movimento DESC, e.id
  ), fd AS (
    -- CONC-SUGESTOES-V2: os fornecedores do cliente de mesmo documento, ou (CNPJ) mesma raiz
    SELECT f.id
      FROM public.financeiro_fornecedores f
      CROSS JOIN LATERAL (SELECT regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') dig) x
     WHERE v_doc IS NOT NULL AND f.cliente_id = p_cliente
       AND (x.dig = v_doc OR (length(v_doc) = 14 AND length(x.dig) = 14 AND left(x.dig, 8) = left(v_doc, 8)))
  ), fc AS (
    -- CONC-SUGESTOES-V2 ajuste (2) 07:45: os lançamentos das parcelas (amortização e juros) dos contratos de financiamento/consórcio, com o que
    -- a busca lê deles: o nome do contrato, o credor, a natureza e o nº da cédula
    SELECT u.lancamento_id, u.papel, fp.id parcela_id, f.descricao contrato, f.numero_contrato,
           f.descricao || ' · ' || fp.numero_parcela || '/' || coalesce(f.total_parcelas, (SELECT count(*) FROM public.financiamento_parcelas p2 WHERE p2.financiamento_id = f.id))
             || ' · venc. ' || to_char(fp.data_vencimento, 'DD/MM') rotulo,
           coalesce(public._fn_normalizar_texto(concat_ws(' ', f.descricao, cr.nome, f.natureza)), '') txt,
           lower(regexp_replace(coalesce(f.numero_contrato, ''), '[^a-zA-Z0-9]', '', 'g')) num
      FROM public.financiamentos f
      JOIN public.financiamento_parcelas fp ON fp.financiamento_id = f.id
      CROSS JOIN LATERAL (VALUES (fp.lancamento_id, 'amortizacao'), (fp.lancamento_juros_id, 'juros')) u(lancamento_id, papel)
      LEFT JOIN public.financeiro_fornecedores cr ON cr.id = f.credor_id
     WHERE f.cliente_id = p_cliente AND f.natureza IN ('financiamento', 'consorcio') AND u.lancamento_id IS NOT NULL
       AND u.lancamento_id IN (SELECT l.id FROM l)
  ), c AS (
    SELECT l.*, b.banco, f.nome fornecedor,
           fc.parcela_id, fc.contrato, fc.numero_contrato, fc.rotulo parcela_rotulo,
           -- o contrato (nome · credor · natureza · nº da cédula) ou o TIPO da linha ("juros", "amortização", "parcela") casa como Descrição
           (v_desc AND fc.lancamento_id IS NOT NULL AND length(v_t) >= 2 AND (
               strpos(fc.txt, v_t) > 0
            OR (length(v_num) >= 4 AND fc.num <> '' AND strpos(fc.num, v_num) > 0)
            OR (fc.papel = 'juros' AND v_t ~ '^juros?$')
            OR (fc.papel = 'amortizacao' AND v_t ~ '^amortiza')
            OR v_t ~ '^parcelas?$')) casa_contrato,
           (v_banco AND length(v_t) >= 2 AND b.banco IS NOT NULL AND strpos(coalesce(public._fn_normalizar_texto(b.banco), ''), v_t) > 0) casa_banco,
           (v_desc AND length(v_t) >= 2 AND strpos(coalesce(public._fn_normalizar_texto(l.descricao), ''), v_t) > 0) casa_desc,
           ((v_forn AND length(v_t) >= 2 AND f.id IS NOT NULL AND strpos(coalesce(f.nome_norm, ''), v_t) > 0)
            OR l.favorecido_id IN (SELECT fd.id FROM fd)) casa_forn
      FROM l
      LEFT JOIN b ON b.lancamento_id = l.id
      LEFT JOIN public.financeiro_fornecedores f ON f.id = l.favorecido_id AND f.cliente_id = p_cliente
      LEFT JOIN fc ON fc.lancamento_id = l.id
  ), a AS (
    SELECT * FROM c WHERE casa_banco OR casa_desc OR casa_forn OR casa_contrato
  ), top AS (
    SELECT a.* FROM a
     ORDER BY CASE WHEN p_valor IS NULL THEN 0 ELSE abs(a.va - p_valor) END, a.data_ref DESC NULLS LAST, a.id
     LIMIT 50
  ), r AS (
    -- a faixa amarela: o que COSTUMA ser e' o que foi pago (como antes do P153b)
    SELECT a.favorecido_id, a.fornecedor, count(*) n, min(a.data_pagamento) desde
      FROM a WHERE a.favorecido_id IS NOT NULL AND a.status_transacao IN ('realizado', 'conciliado')
     GROUP BY a.favorecido_id, a.fornecedor
     ORDER BY count(*) DESC, min(a.data_pagamento), a.favorecido_id
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM a),
    'achados', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'lancamento_id', t.id, 'data_pagamento', t.data_pagamento, 'data_vencimento', t.data_vencimento,
               'data_competencia', t.data_competencia, 'status_transacao', t.status_transacao,
               'conciliado', EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci
                                      WHERE ci.lancamento_id = t.id AND ci.cliente_id = p_cliente AND ci.desfeito_em IS NULL),
               'banco', t.banco, 'descricao', t.descricao,
               'fornecedor_id', t.favorecido_id, 'fornecedor', t.fornecedor,
               'plano_conta_id', t.plano_conta_id, 'centro', p.centro_custo, 'subcentro', p.subcentro,
               'fazenda_id', t.fazenda_id, 'fazenda', fz.nome, 'fazenda_codigo', fz.codigo,
               'conta_bancaria_id', t.conta_id, 'conta', coalesce(cb.nome_exibicao, cb.nome_conta),
               'valor', t.va,
               -- CONC-SUGESTOES-V2 ajuste (3): a linha da parcela leva o contrato (o NF/DOC mostra o nº da cédula)
               'parcela_id', t.parcela_id, 'contrato', t.contrato, 'numero_contrato', t.numero_contrato, 'parcela_rotulo', t.parcela_rotulo,
               'onde', to_jsonb(array_remove(ARRAY[CASE WHEN t.casa_banco THEN 'banco' END, CASE WHEN t.casa_desc OR t.casa_contrato THEN 'descricao' END,
                                                   CASE WHEN t.casa_forn THEN 'fornecedor' END], NULL)))
             ORDER BY CASE WHEN p_valor IS NULL THEN 0 ELSE abs(t.va - p_valor) END, t.data_ref DESC NULLS LAST, t.id)
        FROM top t
        LEFT JOIN public.financeiro_plano_contas p ON p.id = t.plano_conta_id
        LEFT JOIN public.fazendas fz ON fz.id = t.fazenda_id AND fz.cliente_id = p_cliente
        LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = t.conta_id AND cb.cliente_id = p_cliente), '[]'::jsonb),
    'resumo', (SELECT jsonb_build_object('fornecedor_id', r.favorecido_id, 'fornecedor', r.fornecedor, 'vezes', r.n, 'desde', r.desde) FROM r)
  ) INTO v;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conciliacao_historico_buscar(uuid, text, text[], date, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_historico_buscar(uuid, text, text[], date, date, numeric, text) TO authenticated, service_role;
