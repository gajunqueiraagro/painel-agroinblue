-- NOTA-PAGA-POR-TERCEIRO-01 · Fatia A (Gabriel 23/11: "Quem paga: Nós · Terceiro") — lote 34. Regra de produto, todos os clientes.
-- O caso: a nota no nome do produtor que o EMPREITEIRO compra, paga e depois DESCONTA da empreitada (NJ: Abrego e Rodrigues; Vera também).
-- É despesa verdadeira (DRE), mas NÃO é saída de banco: não pode ficar em "a pagar", na aprovação (BPO), nos vencidos nem na procura do extrato.
-- A marca que faz isso já existe e é a de sempre: `sem_movimentacao_caixa` (o "pronto para pagar" a ignora; a Conciliação e o Livro Caixa a
-- deixam FORA, com o motivo "pago por outro lançamento"). Este lote dá o GESTO com prévia, guarda QUEM pagou (o parceiro) e por quê, e desfaz.
-- O QUE MUDA:
--   1. `financeiro_pago_por_terceiro` — a TRILHA (uma linha por gesto): o parceiro que pagou (fornecedor do cliente), o motivo, o anexo
--      opcional (um documento do lançamento), a data, o ANTES (status, pagamento, marca) e quem/quando; desfazer preenche desfeito_* (nada se
--      apaga). No máximo 1 viva por lançamento. Leitura pela RLS do cliente; escrita SÓ pelas funções.
--   2. `fn_lancamento_pago_por_terceiro(lançamento, parceiro, motivo, data, documento, simular)` — só SAÍDA viva, ainda não paga, sem
--      conciliação viva, fora da aprovação e do mês fechado (boleto ligado NÃO recusa: AVISA na prévia — Gabriel 23/11); aplica: `sem_movimentacao_caixa = true`, Realizado, pagamento = a data
--      (padrão: a competência). A conta fica (com a marca, o banco não a vê). simular = a prévia (antes × depois + o que sai de onde).
--   3. `fn_lancamento_pago_por_terceiro_desfazer(lançamento, motivo, simular)` — volta o ANTES (status, pagamento, marca), com trilha.
-- Fatia B (depois, com o FIN-BAIXA-01): o crédito do parceiro vira baixa por abatimento na conta corrente dele.
-- NENHUM lançamento existente muda. GESTO CONTRÁRIO: DROP das 2 funções e da tabela.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- ── 1. a trilha ──
CREATE TABLE IF NOT EXISTS public.financeiro_pago_por_terceiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  lancamento_id uuid NOT NULL REFERENCES public.financeiro_lancamentos_v2(id),
  parceiro_id uuid NOT NULL REFERENCES public.financeiro_fornecedores(id),
  motivo text NOT NULL CONSTRAINT financeiro_pago_por_terceiro_motivo_ck CHECK (length(btrim(motivo)) BETWEEN 3 AND 300),
  documento_id uuid REFERENCES public.financeiro_lancamento_documentos(id),
  data_pagamento date NOT NULL,
  antes jsonb NOT NULL,
  feito_por uuid,
  feito_em timestamptz NOT NULL DEFAULT now(),
  desfeito_por uuid,
  desfeito_em timestamptz,
  desfeito_motivo text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pago_por_terceiro_vivo ON public.financeiro_pago_por_terceiro (lancamento_id) WHERE desfeito_em IS NULL;
CREATE INDEX IF NOT EXISTS ix_pago_por_terceiro_parceiro ON public.financeiro_pago_por_terceiro (cliente_id, parceiro_id) WHERE desfeito_em IS NULL;
ALTER TABLE public.financeiro_pago_por_terceiro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financeiro_pago_por_terceiro_ler ON public.financeiro_pago_por_terceiro;
CREATE POLICY financeiro_pago_por_terceiro_ler ON public.financeiro_pago_por_terceiro FOR SELECT USING (tenant_ok(cliente_id));
REVOKE ALL ON public.financeiro_pago_por_terceiro FROM public, anon, authenticated;
GRANT SELECT ON public.financeiro_pago_por_terceiro TO authenticated;
COMMENT ON TABLE public.financeiro_pago_por_terceiro IS
  'NOTA-PAGA-POR-TERCEIRO-01 — quem pagou a nota em nosso nome (o parceiro), por quê, quando e o antes; desfazer preenche desfeito_*. Escrita só pelas fn_lancamento_pago_por_terceiro*.';

-- ── 2. marcar "pago por terceiro" ──
CREATE OR REPLACE FUNCTION public.fn_lancamento_pago_por_terceiro(p_lancamento uuid, p_parceiro uuid, p_motivo text, p_data date,
  p_documento uuid DEFAULT NULL, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2%ROWTYPE; v_parceiro text; v_data date; v_motivo text := btrim(coalesce(p_motivo, '')); v_previa jsonb; v_id uuid;
  v_avisos jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Lançamento não encontrado. Nada foi gravado.'; END IF;
  IF NOT coalesce(public.tenant_ok(l.cliente_id), false) THEN RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501'; END IF;
  IF coalesce(l.cancelado, false) THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Lançamento cancelado. Nada foi gravado.'; END IF;
  IF coalesce(l.tipo_operacao, '') NOT LIKE '2-%' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Só uma saída pode ser paga por terceiro. Nada foi gravado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_pago_por_terceiro t WHERE t.lancamento_id = l.id AND t.desfeito_em IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este lançamento já está como pago por terceiro. Nada foi gravado.'; END IF;
  IF coalesce(l.status_transacao, '') IN ('realizado', 'conciliado') OR l.data_pagamento IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este lançamento já está pago. Nada foi gravado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este lançamento está casado com o extrato: desfaça o casamento antes. Nada foi gravado.'; END IF;
  /* boleto ligado NÃO recusa (Gabriel 23/11): AVISA na prévia e segue — o terceiro pode ter pago esse boleto */
  IF EXISTS (SELECT 1 FROM public.boleto_lancamentos b WHERE b.lancamento_id = l.id AND b.vivo) THEN
    v_avisos := v_avisos || to_jsonb('Tem boleto ligado: confirme que o terceiro pagou esse boleto.'::text); END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_aprovacoes a WHERE a.lancamento_id = l.id AND a.situacao IN ('aguardando', 'aprovado')) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este lançamento está na aprovação de pagamentos: tire do pedido antes. Nada foi gravado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
             AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'O mês deste lançamento está fechado. Nada foi gravado.'; END IF;
  IF length(v_motivo) < 3 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Escreva o motivo (quem pagou e de onde desconta). Nada foi gravado.'; END IF;
  SELECT f.nome INTO v_parceiro FROM public.financeiro_fornecedores f WHERE f.id = p_parceiro AND f.cliente_id = l.cliente_id;
  IF v_parceiro IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Escolha quem pagou (um fornecedor deste cliente). Nada foi gravado.'; END IF;
  IF p_documento IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financeiro_lancamento_documentos d WHERE d.id = p_documento
       AND d.lancamento_id = l.id AND d.cancelado IS NOT TRUE) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'O anexo escolhido não é deste lançamento. Nada foi gravado.'; END IF;
  v_data := coalesce(p_data, l.data_competencia, l.data_vencimento);
  v_previa := jsonb_build_object('ok', true, 'simulado', p_simular, 'parceiro', v_parceiro, 'data_pagamento', v_data, 'motivo', v_motivo,
    'antes', jsonb_build_object('status', l.status_transacao, 'data_pagamento', l.data_pagamento, 'sem_caixa', coalesce(l.sem_movimentacao_caixa, false)),
    'depois', jsonb_build_object('status', 'realizado', 'data_pagamento', v_data, 'sem_caixa', true), 'avisos', v_avisos,
    'efeitos', jsonb_build_array('sai de "a pagar", da aprovação, dos vencidos e da procura no extrato',
      'a despesa continua no DRE com a mesma conta', 'Livro Caixa: fora (sem movimento de caixa) até o contador definir'));
  IF p_simular THEN RETURN v_previa; END IF;
  INSERT INTO public.financeiro_pago_por_terceiro (cliente_id, lancamento_id, parceiro_id, motivo, documento_id, data_pagamento, antes, feito_por)
  VALUES (l.cliente_id, l.id, p_parceiro, v_motivo, p_documento, v_data, v_previa->'antes', auth.uid())
  RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET sem_movimentacao_caixa = true, status_transacao = 'realizado', data_pagamento = v_data WHERE id = l.id;
  RETURN v_previa || jsonb_build_object('id', v_id);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_lancamento_pago_por_terceiro(uuid, uuid, text, date, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamento_pago_por_terceiro(uuid, uuid, text, date, uuid, boolean) TO authenticated;

-- ── 3. desfazer ──
CREATE OR REPLACE FUNCTION public.fn_lancamento_pago_por_terceiro_desfazer(p_lancamento uuid, p_motivo text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2%ROWTYPE; t public.financeiro_pago_por_terceiro%ROWTYPE; v_motivo text := btrim(coalesce(p_motivo, '')); v_previa jsonb;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Lançamento não encontrado. Nada foi gravado.'; END IF;
  IF NOT coalesce(public.tenant_ok(l.cliente_id), false) THEN RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.financeiro_pago_por_terceiro WHERE lancamento_id = l.id AND desfeito_em IS NULL FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este lançamento não está como pago por terceiro. Nada foi gravado.'; END IF;
  IF coalesce(l.status_transacao, '') = 'conciliado' OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este lançamento foi casado com o extrato depois: desfaça o casamento antes. Nada foi gravado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
             AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'O mês deste lançamento está fechado. Nada foi gravado.'; END IF;
  IF length(v_motivo) < 3 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Escreva por que desfaz. Nada foi gravado.'; END IF;
  v_previa := jsonb_build_object('ok', true, 'simulado', p_simular,
    'antes', jsonb_build_object('status', l.status_transacao, 'data_pagamento', l.data_pagamento, 'sem_caixa', coalesce(l.sem_movimentacao_caixa, false)),
    'depois', t.antes);
  IF p_simular THEN RETURN v_previa; END IF;
  UPDATE public.financeiro_lancamentos_v2
     SET status_transacao = t.antes->>'status', data_pagamento = (t.antes->>'data_pagamento')::date,
         sem_movimentacao_caixa = coalesce((t.antes->>'sem_caixa')::boolean, false)
   WHERE id = l.id;
  UPDATE public.financeiro_pago_por_terceiro SET desfeito_por = auth.uid(), desfeito_em = now(), desfeito_motivo = v_motivo WHERE id = t.id;
  RETURN v_previa;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_lancamento_pago_por_terceiro_desfazer(uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamento_pago_por_terceiro_desfazer(uuid, text, boolean) TO authenticated;
