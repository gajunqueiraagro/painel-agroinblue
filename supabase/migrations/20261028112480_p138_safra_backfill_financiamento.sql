-- P138 (Gabriel 27/10/2026 17:2x) — o backfill da safra passa a incluir FINANCIAMENTO/CONSORCIO (os 331 que a 20261028112470 deixou de fora
-- pela origem `parcela_financiamento`/`financiamento`): a FASE 0 provou que o DRE da Lavoura so' soma plano com `bloco_dre` (captacao e
-- amortizacao nao entram; juros na linha Juros e' o certo). Mesma regra, mesmo modelo (backup `safra_backfill_backup`, `fn_safra_backfill_desfazer`,
-- `app.via` 'p138-safra', Auditoria). REDEFINE so' a `fn_safra_backfill_aplicar` (mesma assinatura, mesmo corpo, sem o corte por origem). Os 14
-- "Amendoim 2025/2026" do NJ seguem FORA pelo `p_excluir` (o Gabriel classifica a mao).
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_safra_backfill_aplicar(p_cliente uuid, p_simular boolean DEFAULT true, p_excluir uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_ret jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: o preenchimento da safra e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.'; END IF;
  BEGIN
    PERFORM set_config('app.via', 'p138-safra', true);
    WITH alvo AS (
      SELECT l.id, l.cliente_id, public._fn_safra_da_competencia(l.cliente_id, l.escopo_negocio, l.data_competencia) nova
        FROM financeiro_lancamentos_v2 l
       WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.cenario IS DISTINCT FROM 'meta'
         AND l.safra_id IS NULL AND l.escopo_negocio IN ('pecuaria', 'agricultura')
         AND NOT (l.id = ANY (coalesce(p_excluir, '{}')))
       FOR UPDATE
    ), feito AS (
      UPDATE financeiro_lancamentos_v2 l SET safra_id = a.nova
        FROM alvo a WHERE l.id = a.id AND a.nova IS NOT NULL
      RETURNING l.id, l.cliente_id, l.safra_id
    )
    INSERT INTO safra_backfill_backup (lancamento_id, cliente_id, safra_antes, safra_nova)
    SELECT id, cliente_id, NULL, safra_id FROM feito;
    SELECT jsonb_build_object('simulado', coalesce(p_simular, true),
             'por_safra', coalesce(jsonb_agg(jsonb_build_object('safra', s.nome, 'n', x.n) ORDER BY s.nome), '[]'::jsonb),
             'total', coalesce(sum(x.n), 0))
      INTO v_ret
      FROM (SELECT b.safra_nova, count(*) n FROM safra_backfill_backup b
             WHERE b.cliente_id = p_cliente AND b.desfeito_em IS NULL AND b.feito_em >= now() GROUP BY 1) x
      JOIN financeiro_safras s ON s.id = x.safra_nova;
    IF coalesce(p_simular, true) THEN RAISE EXCEPTION USING ERRCODE = 'SBSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'SBSIM' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;
REVOKE ALL ON FUNCTION public.fn_safra_backfill_aplicar(uuid, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
