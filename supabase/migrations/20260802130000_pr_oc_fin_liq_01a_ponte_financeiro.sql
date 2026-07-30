-- PR-OC-FIN-LIQ-01A — Ponte idempotente Financeiro -> Liquidacao da Operacao Comercial.
--
--   PROBLEMA: um titulo financeiro (financeiro_lancamentos_v2) vinculado a uma OC via
--   zoo_operacao_partes.financeiro_lancamento_id pode ir a 'realizado'/'conciliado' SEM produzir
--   liquidacao na OC. As views (vw_oc_operacao_liquidacao/obrigacoes/titulos) derivam saldo/status
--   SO de zoo_operacao_liquidacoes, e o unico writer dessa tabela e a RPC MANUAL oc_registrar_liquidacao.
--   Resultado: OC aparece em aberto mesmo com o titulo pago. (Auditoria PR-OC-FIN-LIQ-01.)
--
--   CORRECAO (infraestrutura, SEM backfill): elo automatico, idempotente e transacional no BANCO,
--   cobrindo TODOS os writers do Financeiro:
--     1) coluna origem em zoo_operacao_liquidacoes (manual|financeiro) + CHECK;
--     2) indices UNIQUE parciais: (i) uma liquidacao automatica estavel por titulo; (ii) no maximo
--        uma liquidacao monetaria ATIVA por titulo (anti dupla-contagem manual x automatica);
--     3) funcao-ponte oc_sincronizar_liquidacao_de_financeiro(uuid) — dona da regra da OC;
--     4) trigger fino em financeiro_lancamentos_v2 (colunas de liquidacao);
--     5) trigger complementar fino em zoo_operacao_partes (vinculo definido apos o INSERT do titulo
--        em oc_gerar_obrigacoes — ordem: parte -> financeiro -> vinculo), cobrindo "titulo ja realizado";
--     6) ajuste minimo de oc_registrar_liquidacao (bloqueio explicito de manual monetaria duplicada).
--
--   DECISOES DE PRODUTO (soberanas): SEM pagamento parcial por titulo (titulo liquida integral ou nao);
--   fonte unica = zoo_operacao_liquidacoes; um titulo => no maximo UMA liquidacao automatica; permuta
--   permanece manual/nao-monetaria/financeiro_lancamento_id NULL e NUNCA e tocada pela ponte; estorno
--   logico auditavel (nunca DELETE); liquidado := status_transacao IN ('realizado','conciliado') AND
--   cancelado IS NOT TRUE (conciliacao e confirmacao, nao 2a liquidacao).
--
--   ANTI-LOOP: a ponte le financeiro/partes/operacoes e escreve APENAS zoo_operacao_liquidacoes
--   (que nao possui triggers) — jamais escreve financeiro_lancamentos_v2 nem zoo_operacao_partes,
--   nao chama oc_gerar_obrigacoes/oc_sincronizar. Ciclo OC->Fin->OC impossivel.
--
--   SEM backfill: nenhuma linha historica e sincronizada por esta migration. Views NAO sao alteradas.
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Evolucao aditiva: origem (default 'manual' preserva callers/linhas atuais) + CHECK
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zoo_operacao_liquidacoes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

ALTER TABLE public.zoo_operacao_liquidacoes
  DROP CONSTRAINT IF EXISTS zoo_operacao_liquidacoes_origem_chk;
ALTER TABLE public.zoo_operacao_liquidacoes
  ADD CONSTRAINT zoo_operacao_liquidacoes_origem_chk CHECK (origem IN ('manual','financeiro'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Protecoes estruturais (funcionam sob concorrencia)
--    (i) uma linha automatica ESTAVEL por titulo (estornada ou nao) -> arbitro do UPSERT/reativacao
--    (ii) no maximo uma liquidacao monetaria ATIVA por titulo (qualquer origem) -> anti dupla-contagem
-- ─────────────────────────────────────────────────────────────────────────────
-- Preflight (NAO altera dados): falha explicita e diagnostica se houver duplicidade legada
-- que impeca o indice (ii) em ambientes com dados. No Proto: 0 duplicatas.
DO $preflight$
DECLARE v_dups int;
BEGIN
  SELECT count(*) INTO v_dups FROM (
    SELECT financeiro_lancamento_id FROM public.zoo_operacao_liquidacoes
     WHERE financeiro_lancamento_id IS NOT NULL AND estornado = false
     GROUP BY financeiro_lancamento_id HAVING count(*) > 1) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'PR-OC-FIN-LIQ-01A ABORTADO: % titulo(s) com >1 liquidacao ATIVA; resolver manualmente antes do indice unico (nenhum dado foi alterado)', v_dups
      USING ERRCODE = 'P0001';
  END IF;
END $preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_zoo_oc_liq_auto_por_titulo
  ON public.zoo_operacao_liquidacoes (financeiro_lancamento_id)
  WHERE origem = 'financeiro';

CREATE UNIQUE INDEX IF NOT EXISTS uq_zoo_oc_liq_ativa_por_titulo
  ON public.zoo_operacao_liquidacoes (financeiro_lancamento_id)
  WHERE financeiro_lancamento_id IS NOT NULL AND estornado = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) FUNCAO-PONTE — dona da regra da OC. Idempotente, transacional, anti-loop.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_sincronizar_liquidacao_de_financeiro(p_financeiro_lancamento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_f public.financeiro_lancamentos_v2;
  v_parte public.zoo_operacao_partes;
  v_op public.zoo_operacoes_comerciais;
  v_liquidado boolean;
  v_elegivel boolean;
  v_nat text;
  v_data date;
  v_valor numeric;
BEGIN
  IF p_financeiro_lancamento_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_f FROM public.financeiro_lancamentos_v2 WHERE id = p_financeiro_lancamento_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_liquidado := (v_f.status_transacao IN ('realizado','conciliado') AND v_f.cancelado IS NOT TRUE);

  -- Vinculo OC: titulo <-> parte e 1:1 (indice unico em partes.financeiro_lancamento_id).
  SELECT * INTO v_parte FROM public.zoo_operacao_partes
    WHERE financeiro_lancamento_id = p_financeiro_lancamento_id AND cancelada IS NOT TRUE
    LIMIT 1;

  IF NOT FOUND THEN
    -- Sem parte ativa: nunca cria. So reage a estorno financeiro da propria linha automatica.
    IF NOT v_liquidado THEN
      UPDATE public.zoo_operacao_liquidacoes
         SET estornado = true, estornado_em = now(), estornado_por = v_actor,
             estorno_motivo = 'Título financeiro deixou de estar liquidado', updated_at = now(), updated_by = v_actor
       WHERE origem = 'financeiro' AND financeiro_lancamento_id = p_financeiro_lancamento_id AND estornado IS NOT TRUE;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = v_parte.operacao_id AND cliente_id = v_parte.cliente_id FOR UPDATE;

  v_elegivel := (v_op.id IS NOT NULL AND v_op.rascunho IS NOT TRUE AND v_op.status_comercial <> 'cancelada');
  v_nat := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagamento' ELSE 'recebimento' END;

  IF v_liquidado AND v_elegivel THEN
    -- valor integral SOBERANO do titulo. financeiro.valor e ASSINADO (existem negativos/zero) e o
    -- sentido esta em natureza; zoo_operacao_liquidacoes.valor tem CHECK (>= 0) -> usar abs().
    v_valor := abs(v_f.valor);
    IF v_valor IS NULL OR v_valor <= 0 THEN
      RAISE EXCEPTION 'Titulo % com valor invalido (%) para liquidacao automatica',
        p_financeiro_lancamento_id, v_f.valor USING ERRCODE = 'P0001';
    END IF;
    v_data := COALESCE(v_f.data_pagamento, CURRENT_DATE);

    -- Anti dupla-contagem: bloqueia se ja existe liquidacao ATIVA manual no mesmo titulo.
    IF EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes l
               WHERE l.financeiro_lancamento_id = p_financeiro_lancamento_id
                 AND l.estornado IS NOT TRUE AND l.origem <> 'financeiro') THEN
      RAISE EXCEPTION 'Titulo % ja possui liquidacao manual ativa; sincronizacao automatica bloqueada',
        p_financeiro_lancamento_id USING ERRCODE = 'P0001';
    END IF;

    -- UPSERT determinístico na UNICA linha automatica (cria ou reativa a mesma linha).
    -- forma='outro': a ponte conhece o FATO (titulo liquidado no Financeiro), NAO o meio bancario
    -- efetivo (que permanece em financeiro.forma_pagamento, texto livre fora do enum de forma).
    -- 'outro' e o unico valor monetario semanticamente seguro; 'compensacao' implicaria liquidacao
    -- nao-monetaria/contabil (incorreto). Nao e permuta.
    INSERT INTO public.zoo_operacao_liquidacoes
      (cliente_id, operacao_id, data, natureza, forma, valor, descricao, financeiro_lancamento_id, origem, created_by, updated_by)
    VALUES
      (v_f.cliente_id, v_op.id, v_data, v_nat, 'outro', v_valor,
       'Liquidação automática do título financeiro', p_financeiro_lancamento_id, 'financeiro', v_actor, v_actor)
    ON CONFLICT (financeiro_lancamento_id) WHERE origem = 'financeiro'
    DO UPDATE SET
       estornado = false, estornado_em = NULL, estornado_por = NULL, estorno_motivo = NULL,
       valor = EXCLUDED.valor, data = EXCLUDED.data, natureza = EXCLUDED.natureza, forma = EXCLUDED.forma,
       cliente_id = EXCLUDED.cliente_id, operacao_id = EXCLUDED.operacao_id,
       updated_at = now(), updated_by = EXCLUDED.updated_by;

  ELSIF NOT v_liquidado THEN
    -- Estorno logico da liquidacao automatica quando o titulo deixa de estar liquidado.
    UPDATE public.zoo_operacao_liquidacoes
       SET estornado = true, estornado_em = now(), estornado_por = v_actor,
           estorno_motivo = 'Título financeiro deixou de estar liquidado', updated_at = now(), updated_by = v_actor
     WHERE origem = 'financeiro' AND financeiro_lancamento_id = p_financeiro_lancamento_id AND estornado IS NOT TRUE;

  -- ELSE: liquidado mas OC nao elegivel (cancelada/rascunho) -> no-op (nao inventa estorno; Decisao 23).
  END IF;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Trigger fino em financeiro_lancamentos_v2 (delega; sem regra de negocio)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_trg_sync_liquidacao_financeiro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  PERFORM public.oc_sincronizar_liquidacao_de_financeiro(NEW.id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_oc_sync_liquidacao_financeiro ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_oc_sync_liquidacao_financeiro
  AFTER INSERT OR UPDATE OF status_transacao, cancelado, valor, data_pagamento
  ON public.financeiro_lancamentos_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.oc_trg_sync_liquidacao_financeiro();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Trigger complementar fino em zoo_operacao_partes (cobre vinculo definido apos o
--    INSERT do titulo: em oc_gerar_obrigacoes a ordem e parte -> financeiro -> vinculo).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_trg_sync_liquidacao_parte()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.financeiro_lancamento_id IS NOT NULL THEN
    PERFORM public.oc_sincronizar_liquidacao_de_financeiro(NEW.financeiro_lancamento_id);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_oc_sync_liquidacao_parte ON public.zoo_operacao_partes;
CREATE TRIGGER trg_oc_sync_liquidacao_parte
  AFTER INSERT OR UPDATE OF financeiro_lancamento_id
  ON public.zoo_operacao_partes
  FOR EACH ROW
  EXECUTE FUNCTION public.oc_trg_sync_liquidacao_parte();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Ajuste minimo de oc_registrar_liquidacao: bloqueio explicito de liquidacao manual
--    monetaria duplicada (mesmo financeiro_lancamento_id com liquidacao ativa). Resto byte-a-byte.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_registrar_liquidacao(p_operacao_id uuid, p_cliente_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_forma text := p_payload->>'forma';
  v_nat text := p_payload->>'natureza';
  v_esperada text;
  v_valor numeric := COALESCE(NULLIF(p_payload->>'valor','')::numeric, 0);
  v_perm_val numeric := NULLIF(p_payload->>'permuta_valor_atribuido','')::numeric;
  v_id uuid;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao permite liquidacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;
  IF v_valor <= 0 THEN RAISE EXCEPTION 'Valor da liquidacao deve ser > 0' USING ERRCODE = 'P0001'; END IF;
  v_esperada := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagamento' ELSE 'recebimento' END;
  IF v_nat <> v_esperada THEN
    RAISE EXCEPTION 'Natureza % incompativel com tipo % (esperada %)', v_nat, v_op.tipo_operacao, v_esperada USING ERRCODE = 'P0001'; END IF;
  IF v_forma = 'permuta' AND (v_perm_val IS NULL OR (p_payload->>'permuta_tipo_bem') IS NULL) THEN
    RAISE EXCEPTION 'Permuta exige tipo do bem e valor atribuido' USING ERRCODE = 'P0001'; END IF;
  IF v_forma <> 'permuta' AND (v_perm_val IS NOT NULL OR (p_payload->>'permuta_tipo_bem') IS NOT NULL) THEN
    RAISE EXCEPTION 'Campos de permuta so em forma=permuta' USING ERRCODE = 'P0001'; END IF;

  -- PR-OC-LIQ-02: vinculo, quando informado, deve pertencer a operacao (titulo via partes).
  IF NULLIF(p_payload->>'financeiro_lancamento_id','') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.zoo_operacao_partes pt
        WHERE pt.operacao_id = p_operacao_id
          AND pt.financeiro_lancamento_id = NULLIF(p_payload->>'financeiro_lancamento_id','')::uuid) THEN
    RAISE EXCEPTION 'Titulo financeiro % nao pertence a operacao %', p_payload->>'financeiro_lancamento_id', p_operacao_id USING ERRCODE = 'P0001';
  END IF;

  -- PR-OC-FIN-LIQ-01A: impede dupla contagem — titulo com liquidacao monetaria ATIVA (manual ou
  -- automatica) nao pode receber outra liquidacao monetaria manual. Permuta segue livre.
  IF v_forma <> 'permuta' AND NULLIF(p_payload->>'financeiro_lancamento_id','') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes l
                 WHERE l.financeiro_lancamento_id = NULLIF(p_payload->>'financeiro_lancamento_id','')::uuid
                   AND l.estornado IS NOT TRUE) THEN
    RAISE EXCEPTION 'Titulo % ja possui liquidacao monetaria ativa; estorne antes de registrar outra', p_payload->>'financeiro_lancamento_id' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.zoo_operacao_liquidacoes (
    cliente_id, operacao_id, data, natureza, forma, valor, descricao, observacao, financeiro_lancamento_id,
    permuta_tipo_bem, permuta_descricao_bem, permuta_valor_atribuido, permuta_documento_url, created_by, updated_by)
  VALUES (
    p_cliente_id, p_operacao_id, (p_payload->>'data')::date, v_nat, v_forma, v_valor,
    p_payload->>'descricao', p_payload->>'observacao', NULLIF(p_payload->>'financeiro_lancamento_id','')::uuid,
    p_payload->>'permuta_tipo_bem', p_payload->>'permuta_descricao_bem', v_perm_val, p_payload->>'permuta_documento_url', v_actor, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'registrar_liquidacao', p_payload, v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'liquidacao_id', v_id);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Grants (compativel com o padrao das RPCs OC; ponte e triggers nao ampliam alcance a anon)
-- ─────────────────────────────────────────────────────────────────────────────
-- Ponte e trigger-functions sao SECURITY DEFINER (rodam como owner); triggers disparam sem exigir
-- EXECUTE do caller. Nao ha caller cliente direto -> nao conceder a authenticated/anon. service_role
-- cobre testes/backfill/admin autorizados.
REVOKE ALL ON FUNCTION public.oc_sincronizar_liquidacao_de_financeiro(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_sincronizar_liquidacao_de_financeiro(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.oc_trg_sync_liquidacao_financeiro() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_trg_sync_liquidacao_financeiro() TO service_role;
REVOKE ALL ON FUNCTION public.oc_trg_sync_liquidacao_parte() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_trg_sync_liquidacao_parte() TO service_role;
