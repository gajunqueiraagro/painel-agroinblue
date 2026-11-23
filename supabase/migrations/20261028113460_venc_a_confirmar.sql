-- VENC-A-CONFIRMAR-01 (Gabriel 22/11 07:42, regra de produto; coluna de 4 valores aprovada 22/11) — lote 31. A nota sem duplicata não
-- traz a data de pagamento: o lançamento nasce com uma data SUGERIDA (o prazo usual do fornecedor; sem histórico, emissão + 30) e fica
-- "a confirmar" até alguém confirmar à mão ou o boleto chegar. NUNCA uma data inventada passa por certa.
-- O QUE MUDA:
--   1. `financeiro_lancamentos_v2.vencimento_origem` — de onde veio a data: 'nota' (duplicata da NF) · 'boleto' · 'manual' · 'sugerido'
--      (= a confirmar). Nula = os lançamentos de antes (ninguém vira "a confirmar" por este lote).
--   2. `fn_prazo_usual_fornecedor(cliente, favorecido)` — {dias, amostras, origem}: a MEDIANA dos dias entre a emissão da NF anexada e o
--      vencimento dos lançamentos do fornecedor (≥ 3 amostras, 0 a 400 dias, não cancelados, nunca meta); senão 30 dias ('padrao').
--   3. Confirmar à mão: mudar a data de um lançamento 'sugerido' sem dizer a origem = 'manual' (gatilho BEFORE UPDATE OF data_vencimento).
--   4. O boleto ligado (`boleto_lancamentos` vivo) a um lançamento 'sugerido' ainda não pago confirma a data: vencimento = o do boleto,
--      origem 'boleto' (gatilho AFTER INSERT/UPDATE OF vivo; a ligação é do dono da Caixa — Code 5 —, este lote só ouve).
--      A1 (Code 5, 22/11 09:40): a data que já veio de boleto ('boleto') SEGUE o boleto vivo — o substituto (reemitido/prorrogado, pelo
--      `fn_boleto_substituir`) leva a data nova; 'nota' e 'manual' ficam intocados (ali a Caixa só avisa).
--   5. (do lote 30) `_fn_doc_motivo_nao_financeira` ganha a guarda do cliente (tenant_ok, 42501) — a regra de toda SECURITY DEFINER.
-- NENHUM lançamento existente muda. GESTO CONTRÁRIO: DROP dos 2 gatilhos, das 3 funções e da coluna.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- ── 1. a coluna ──
ALTER TABLE public.financeiro_lancamentos_v2 ADD COLUMN IF NOT EXISTS vencimento_origem text;
ALTER TABLE public.financeiro_lancamentos_v2 DROP CONSTRAINT IF EXISTS fin_lanc_v2_vencimento_origem_chk;
ALTER TABLE public.financeiro_lancamentos_v2 ADD CONSTRAINT fin_lanc_v2_vencimento_origem_chk
  CHECK (vencimento_origem IS NULL OR vencimento_origem IN ('nota', 'boleto', 'manual', 'sugerido'));
COMMENT ON COLUMN public.financeiro_lancamentos_v2.vencimento_origem IS
  'VENC-A-CONFIRMAR-01 — de onde veio o vencimento: nota (duplicata) · boleto · manual · sugerido (= a confirmar). Nula = antes do lote.';

-- ── 2. o prazo usual do fornecedor ──
CREATE OR REPLACE FUNCTION public.fn_prazo_usual_fornecedor(p_cliente uuid, p_favorecido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_n int; v_med numeric;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_favorecido IS NOT NULL THEN
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY h.dias) INTO v_n, v_med
      FROM (SELECT DISTINCT ON (l.id) (l.data_vencimento - d.data_emissao) AS dias
              FROM public.financeiro_lancamentos_v2 l
              JOIN public.financeiro_lancamento_documentos d ON d.lancamento_id = l.id
             WHERE l.cliente_id = p_cliente AND l.favorecido_id = p_favorecido
               AND coalesce(l.cancelado, false) = false AND coalesce(l.cenario, 'realizado') <> 'meta'
               AND d.especie = 'nf' AND d.cancelado IS NOT TRUE
               AND d.data_emissao IS NOT NULL AND l.data_vencimento IS NOT NULL
               AND l.data_vencimento - d.data_emissao BETWEEN 0 AND 400
             ORDER BY l.id, d.data_emissao) h;
  END IF;
  IF coalesce(v_n, 0) >= 3 THEN
    RETURN jsonb_build_object('dias', round(v_med)::int, 'amostras', v_n, 'origem', 'historico');
  END IF;
  RETURN jsonb_build_object('dias', 30, 'amostras', coalesce(v_n, 0), 'origem', 'padrao');
END
$function$;
REVOKE ALL ON FUNCTION public.fn_prazo_usual_fornecedor(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_prazo_usual_fornecedor(uuid, uuid) TO authenticated;

-- ── 3. confirmar à mão ──
CREATE OR REPLACE FUNCTION public._fn_trg_vencimento_confirmado_a_mao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF OLD.vencimento_origem = 'sugerido' AND NEW.vencimento_origem IS NOT DISTINCT FROM OLD.vencimento_origem
     AND NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento THEN
    NEW.vencimento_origem := 'manual';
  END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS trg_vencimento_confirmado_a_mao ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_vencimento_confirmado_a_mao BEFORE UPDATE OF data_vencimento ON public.financeiro_lancamentos_v2
  FOR EACH ROW WHEN (OLD.vencimento_origem = 'sugerido') EXECUTE FUNCTION public._fn_trg_vencimento_confirmado_a_mao();

-- ── 4. o boleto ligado confirma ──
CREATE OR REPLACE FUNCTION public._fn_trg_vencimento_pelo_boleto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_venc date;
BEGIN
  IF NOT NEW.vivo THEN RETURN NEW; END IF;
  SELECT b.vencimento INTO v_venc FROM public.boletos b WHERE b.id = NEW.boleto_id AND b.cliente_id = NEW.cliente_id;
  IF v_venc IS NULL THEN RETURN NEW; END IF;
  UPDATE public.financeiro_lancamentos_v2 l
     SET data_vencimento = v_venc, vencimento_origem = 'boleto'
   WHERE l.id = NEW.lancamento_id AND l.cliente_id = NEW.cliente_id AND l.vencimento_origem IN ('sugerido', 'boleto')
     AND l.data_pagamento IS NULL AND coalesce(l.cancelado, false) = false
     AND coalesce(l.status_transacao, '') NOT IN ('realizado', 'conciliado');
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public._fn_trg_vencimento_pelo_boleto() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_vencimento_pelo_boleto ON public.boleto_lancamentos;
CREATE TRIGGER trg_vencimento_pelo_boleto AFTER INSERT OR UPDATE OF vivo ON public.boleto_lancamentos
  FOR EACH ROW WHEN (NEW.vivo) EXECUTE FUNCTION public._fn_trg_vencimento_pelo_boleto();

-- ── 5. (lote 30) a interna do motivo da NF ganha a guarda do cliente: hoje só a chamam o confronto e `fn_documentos_motivo` (ambos já
--      guardados), mas a regra da casa é toda SECURITY DEFINER com parâmetro de cliente guardar (tenant_ok, 42501). Corpo igual + guarda.
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
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF length(v_ch) <> 44 THEN RETURN NULL; END IF;
  SELECT array(SELECT DISTINCT i.cfop FROM public.nota_fiscal_itens i WHERE i.nota_id = n.id AND i.cfop IS NOT NULL),
         n.natureza, (regexp_match(coalesce(n.xml_original, ''), '<tpNF>(\d)</tpNF>'))[1]
    INTO v_cfops, v_nat, v_tpnf
    FROM public.nota_fiscal n
   WHERE n.cliente_id = p_cliente AND n.chave_acesso = v_ch
   LIMIT 1;
  IF coalesce(array_length(v_cfops, 1), 0) = 0 THEN
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
