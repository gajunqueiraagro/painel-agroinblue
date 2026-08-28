-- PR-OC-LIQUIDACAO-REGUA-01 — a regua da liquidacao passa a medir a divida inteira.
--
--   O DEFEITO. A Central marcava "Excedente" (ambar) em operacoes QUITADAS. A diferenca
--   era SEMPRE, exatamente, o valor das obrigacoes daquela operacao. Nao havia excesso:
--   havia regua medindo metade da divida.
--     `_oc_base_saldo_operacao` devolve valor_total / valor_acordado / valor_estimado —
--     SEMPRE o valor negociado dos ANIMAIS. Obrigacao (frete, comissao) nunca entrou.
--     `total_liquidado_valido` soma TODAS as liquidacoes nao estornadas, inclusive as
--     das obrigacoes. Numerador e denominador de reguas diferentes.
--   Alarme falso ensina o operador a ignorar o ambar, e "Excedente" perde o unico
--   sentido que deveria ter: pagou mais do que devia.
--
--   ⚠ POR QUE UMA FUNCAO NOVA E NAO SOMAR NA ANTIGA. `_oc_base_saldo_operacao` tem TRES
--   consumidores, e eles fazem DUAS PERGUNTAS diferentes:
--     vw_oc_operacao_liquidacao  "quanto se deve?"         -> precisa da divida inteira
--     oc_derivar_status          idem                       -> precisa da divida inteira
--     oc_criar_compromisso       "qual o TETO do principal?" -> precisa SO do principal
--   O guard de `oc_criar_compromisso` compara a soma dos compromissos PRINCIPAIS contra
--   a base. Somar obrigacoes ali afrouxaria o teto na exata medida do frete e da
--   comissao: uma OC com R$ 16.975 de obrigacoes ganharia R$ 16.975 de folga indevida
--   para compromisso principal. Esse guard esta CORRETO — nao se toca no que funciona
--   para consertar outro lugar.
--   A funcao nova CHAMA a antiga em vez de copiar a regra do principal: se a origem da
--   base mudar (final/acordado/estimado), as duas mudam juntas. Nao ha segunda
--   definicao de base — ha duas perguntas, cada uma com uma fonte.
--
--   FONTE DAS OBRIGACOES: `zoo_operacao_compromissos`, natureza='obrigacao' e
--   status <> 'cancelado'. Mesma tabela e mesmo vocabulario que o guard de
--   `oc_criar_compromisso` ja usa para os principais. `vw_oc_obrigacoes` foi descartada
--   de proposito: e' por PARCELA e somaria em duplicidade. Statuses reais em uso,
--   medidos: 'programado' e 'cancelado'.
--
--   ⚠ BASE NULA CONTINUA NULA. `NULL + obrigacoes` e' NULL em SQL, e isso e' o desejado:
--   sem o valor dos animais a divida e' indefinida, e o estado segue 'base_indefinida'.
--   Obrigacao sozinha nao define uma operacao.
--
--   ⚠ `base_origem` NAO MUDA e nao ganha valor novo. Ela responde "de onde veio o valor
--   dos ANIMAIS" e continua respondendo exatamente isso. Discriminar as obrigacoes na
--   tela, se um dia for preciso, e' coluna nova com consumidor definido — frente propria.
--
--   ⚠ `security_invoker = true` REESPECIFICADO na view de proposito. E' o que ela ja tem
--   hoje (medido). CREATE OR REPLACE VIEW sem a clausula WITH rebaixaria a view para o
--   default e ela passaria a rodar com os direitos do dono — buraco cross-tenant em
--   silencio, a mesma familia dos riscos de SEC-VIEWS-TENANT-01B.
--
--   EFEITO MEDIDO, varredura completa ANTES x DEPOIS (28/08). CINCO operacoes mudam:
--     262c9c02 Vera Ligia  base 495.000,00 obrig  4.950,00 liq 499.950,00 excedente -> quitada
--     4c5e8c86 Vera Ligia  base 380.000,00 obrig 16.975,20 liq 396.975,20 excedente -> quitada
--     1337bb2d Agnaldo     base 307.460,00 obrig  8.536,00 liq 315.996,00 excedente -> quitada
--     92ca9c06 Agnaldo     base  12.000,00 obrig    240,30 liq  12.240,30 excedente -> quitada
--     e3825547 Agnaldo     base 135.000,00 obrig  1.500,00 liq 135.000,00 quitada   -> PARCIAL
--
--   ⚠ e3825547 NAO E' REGRESSAO, e quem ler isto daqui a um ano vai achar que e'.
--   Ela tem o principal pago e UMA OBRIGACAO DE R$ 1.500 EM ABERTO. A tela dizia
--   "Liquidada", em verde, com divida viva: a regua antiga escondia a divida. Sob a
--   regua nova ela e' parcial, que e' a verdade. Se ela continuasse verde depois desta
--   correcao, seria sinal de que a regua nova TAMBEM nao enxerga obrigacao. Verde tem
--   de significar "nao devo nada".
--
--   Requer PROTO (binbcdfbisgscrifztia). NAO aplicar em producao.

-- ── 1. A BASE DA DIVIDA — pergunta nova, funcao nova ──────────────────────────
CREATE OR REPLACE FUNCTION public._oc_base_divida_operacao(p_operacao_id uuid)
RETURNS TABLE(base numeric, base_origem text)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.base + COALESCE(o.obrigacoes, 0)   AS base,
    b.base_origem
  FROM public._oc_base_saldo_operacao(p_operacao_id) b
  LEFT JOIN LATERAL (
    SELECT SUM(c.valor_total) AS obrigacoes
      FROM public.zoo_operacao_compromissos c
     WHERE c.operacao_id = p_operacao_id
       AND c.natureza    = 'obrigacao'
       AND c.status     <> 'cancelado'
  ) o ON true;
$$;

REVOKE ALL ON FUNCTION public._oc_base_divida_operacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._oc_base_divida_operacao(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public._oc_base_divida_operacao(uuid) IS
  'PR-OC-LIQUIDACAO-REGUA-01: base da DIVIDA da operacao = base do principal (_oc_base_saldo_operacao) + obrigacoes nao canceladas. Use esta para medir liquidacao. Para o TETO de compromissos principais use _oc_base_saldo_operacao, que e outra pergunta.';

-- ── 2. A VIEW passa a medir pela divida ───────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_oc_operacao_liquidacao
WITH (security_invoker = true) AS
  WITH liq AS (
    SELECT l.operacao_id,
           sum(l.valor) AS total_liquidado_valido,
           sum(l.valor) FILTER (WHERE l.forma <> ALL (ARRAY['permuta'::text, 'compensacao'::text])) AS total_liquidado_monetario,
           sum(l.valor) FILTER (WHERE l.forma =  ANY (ARRAY['permuta'::text, 'compensacao'::text])) AS total_liquidado_nao_monetario
      FROM public.zoo_operacao_liquidacoes l
     WHERE l.estornado = false
     GROUP BY l.operacao_id
  )
  SELECT o.cliente_id,
         o.id AS operacao_id,
         o.valor_total,
         COALESCE(liq.total_liquidado_valido, 0::numeric) AS total_liquidado_valido,
         b.base - COALESCE(liq.total_liquidado_valido, 0::numeric) AS saldo_operacao,
         CASE public._oc_estado_liquidacao(b.base, COALESCE(liq.total_liquidado_valido, 0::numeric))
           WHEN 'nao_iniciada'::text    THEN 'nao_liquidada'::text
           WHEN 'liquidada'::text       THEN 'quitada'::text
           WHEN 'excedente'::text       THEN 'excedente'::text
           WHEN 'base_indefinida'::text THEN 'base_indefinida'::text
           ELSE 'parcial'::text
         END AS estado_liquidacao,
         b.base,
         b.base_origem,
         COALESCE(liq.total_liquidado_monetario, 0::numeric) AS total_liquidado_monetario,
         COALESCE(liq.total_liquidado_nao_monetario, 0::numeric) AS total_liquidado_nao_monetario
    FROM public.zoo_operacoes_comerciais o
    LEFT JOIN liq ON liq.operacao_id = o.id
    LEFT JOIN LATERAL public._oc_base_divida_operacao(o.id) b(base, base_origem) ON true;

-- ── 3. oc_derivar_status — mesma troca de fonte, UMA linha ────────────────────
--   Corpo partido do vigente, conferido por md5 ANTES da edicao:
--   3b94617030c7f70524a1428429063662, 2248 chars. Mudou so a chamada da base.
CREATE OR REPLACE FUNCTION public.oc_derivar_status(
  p_operacao_id uuid,
  p_cliente_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_soma_ef numeric;
  v_dif numeric;
  v_base numeric;
  v_base_origem text;
  v_liq numeric;
  v_st_animais text;
  v_st_liq text;
BEGIN
  IF NOT (public.is_admin_agroinblue(auth.uid()) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(sum(l.quantidade), 0) INTO v_soma_ef
    FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE;
  v_dif := v_soma_ef - COALESCE(v_op.qtd_negociada, 0);

  -- ANIMAIS (excedente antes do encerramento continua 'parcial' — Decisão 6)
  IF NOT v_op.entrega_encerrada THEN
    v_st_animais := CASE WHEN v_soma_ef = 0 THEN 'nao_iniciado' ELSE 'parcial' END;
  ELSE
    v_st_animais := CASE WHEN v_op.qtd_negociada IS NOT NULL AND v_soma_ef = v_op.qtd_negociada
                         THEN 'concluido' ELSE 'concluido_com_diferenca' END;
  END IF;

  -- LIQUIDAÇÃO — base e estado pela fonte canônica (PR-OC2-SALDO).
  SELECT base, base_origem INTO v_base, v_base_origem
    FROM public._oc_base_divida_operacao(p_operacao_id);

  SELECT COALESCE(sum(valor), 0) INTO v_liq
    FROM public.zoo_operacao_liquidacoes WHERE operacao_id = p_operacao_id AND estornado IS NOT TRUE;

  v_st_liq := public._oc_estado_liquidacao(v_base, v_liq);

  RETURN jsonb_build_object(
    'comercial', v_op.status_comercial, 'rascunho', v_op.rascunho,
    'animais', jsonb_build_object(
      'status_animais', v_st_animais, 'quantidade_negociada', v_op.qtd_negociada,
      'quantidade_efetiva', v_soma_ef, 'diferenca_quantidade', v_dif, 'entrega_encerrada', v_op.entrega_encerrada),
    'liquidacao', jsonb_build_object(
      'status_liquidacao', v_st_liq, 'base', v_base, 'base_origem', v_base_origem,
      'total_liquidado', v_liq, 'saldo', CASE WHEN v_base IS NULL THEN NULL ELSE v_base - v_liq END));
END;
$$;

COMMENT ON FUNCTION public.oc_derivar_status(uuid, uuid) IS
  'PR-OC-LIQUIDACAO-REGUA-01: a liquidacao passa a ser medida contra a divida inteira (_oc_base_divida_operacao), nao mais so contra o valor dos animais. Restante do contrato inalterado.';
