-- ============================================================================
-- PR-OFX-DEDUP-01 — Idempotência da importação bancária (FASE 1B).
--
-- "OFX é fonte soberana. Duplicidade se impede na entrada." [Princípio 9]
-- Causa raiz: o Bradesco RENUMERA o FITID e REABREVIA a descrição a cada export →
-- hash_movimento muda → o UNIQUE (cliente_id, hash_movimento) não pega. Identificador
-- estável = 4º segmento do FITID ("miolo"). Chave natural soberana (Gabriel):
--   cliente_id + conta_bancaria_id + data_movimento + valor + chave_doc(documento) + seq_ocorrencia
--
-- Este PR: (1) fn IMMUTABLE chave_doc; (2) coluna seq_ocorrencia; (3) SANEAMENTO
-- retroativo (base inteira) com a TRAVA do Gabriel (só cancela lançamento que é reflexo
-- PURO do OFX); (4) backfill de seq; (5) UNIQUE parcial da chave natural. O UNIQUE do
-- hash PERMANECE (2ª linha de defesa — não dropar).
--
-- RISCO DECLARADO (a testar no dry-run): guard_financeiro_mes_fechado dispara RAISE ao
-- cancelar lançamento em mês FECHADO (BEFORE UPDATE em financeiro_lancamentos_v2). Se
-- algum lançamento-cópia estiver em mês fechado (ex.: junho SR), o UPDATE cancelado=true
-- aborta a transação inteira. NÃO inventei bypass — o erro literal deve ser reportado
-- pelo dry-run para decisão humana (reabrir o mês ou tratar o grupo à parte).
--
-- Neutralização SEMPRE soft (cancelado_em / desfeito_em / status='ignorado'); nunca DELETE.
-- ============================================================================

-- ── 1) fn IMMUTABLE chave_doc — degrada com elegância entre bancos ───────────
-- 4+ segmentos ':' → 4º segmento (miolo estável do Bradesco); senão coalesce(d,'').
-- Espelhada em TS no importador (src/hooks/useImportacaoExtrato.ts — comentário lá).
CREATE OR REPLACE FUNCTION public.fn_extrato_chave_doc(p_doc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_doc IS NOT NULL AND array_length(string_to_array(p_doc, ':'), 1) >= 4
      THEN split_part(p_doc, ':', 4)
    ELSE COALESCE(p_doc, '')
  END;
$function$;

-- ── 2) coluna seq_ocorrencia ─────────────────────────────────────────────────
ALTER TABLE public.extrato_bancario_v2
  ADD COLUMN IF NOT EXISTS seq_ocorrencia int NOT NULL DEFAULT 1;

-- ── 3) SANEAMENTO retroativo (base inteira; ANTES da constraint global) ──────
DO $do$
DECLARE
  v_grp RECORD; v_esp RECORD; v_lan RECORD;
  v_grupos int := 0; v_espurios int := 0; v_cancelados int := 0; v_listados int := 0; v_ignorados int := 0;
BEGIN
  FOR v_grp IN
    SELECT cliente_id, conta_bancaria_id, data_movimento, valor,
           public.fn_extrato_chave_doc(documento) AS chave
    FROM extrato_bancario_v2
    WHERE cancelado_em IS NULL AND status <> 'ignorado'
    GROUP BY cliente_id, conta_bancaria_id, data_movimento, valor, public.fn_extrato_chave_doc(documento)
    HAVING count(*) >= 2
  LOOP
    v_grupos := v_grupos + 1;

    -- espúrios = todos menos o canônico (1º por created_at, id) → OFFSET 1
    FOR v_esp IN
      SELECT id, valor FROM extrato_bancario_v2
      WHERE cancelado_em IS NULL AND status <> 'ignorado'
        AND cliente_id = v_grp.cliente_id AND conta_bancaria_id = v_grp.conta_bancaria_id
        AND data_movimento = v_grp.data_movimento AND valor = v_grp.valor
        AND public.fn_extrato_chave_doc(documento) = v_grp.chave
      ORDER BY created_at, id
      OFFSET 1
    LOOP
      v_espurios := v_espurios + 1;

      -- para cada lançamento com cbi ATIVO no extrato espúrio
      FOR v_lan IN
        SELECT l.* FROM conciliacao_bancaria_itens c
        JOIN financeiro_lancamentos_v2 l ON l.id = c.lancamento_id
        WHERE c.extrato_id = v_esp.id AND c.desfeito_em IS NULL
      LOOP
        -- TRAVA DO GABRIEL — reflexo PURO do OFX (TODOS obrigatórios):
        -- origem='ofx' · sem classificação (subcentro/plano/favorecido) · não editado
        -- manualmente (editado_manual — campo de edição adicional encontrado no schema) ·
        -- o cbi do espúrio é o ÚNICO vínculo ativo do lançamento.
        IF v_lan.origem_lancamento = 'ofx'
           AND v_lan.subcentro IS NULL
           AND v_lan.plano_conta_id IS NULL
           AND v_lan.favorecido_id IS NULL
           AND COALESCE(v_lan.editado_manual, false) = false
           AND (SELECT count(*) FROM conciliacao_bancaria_itens c2
                WHERE c2.lancamento_id = v_lan.id AND c2.desfeito_em IS NULL) = 1
        THEN
          -- reflexo puro → cancelar (o trigger trg_cbi_desfazer_on_cancelamento desfaz o cbi).
          -- (Se o mês estiver fechado, guard_financeiro_mes_fechado dá RAISE aqui — risco declarado.)
          UPDATE financeiro_lancamentos_v2
             SET cancelado = true, cancelado_em = now(),
                 cancelado_motivo = 'duplicata de importação (DEDUP-01)'
           WHERE id = v_lan.id;
          v_cancelados := v_cancelados + 1;
        ELSE
          -- QUALQUER dúvida/edição/multi-vínculo → NÃO cancelar: só desfazer o cbi do
          -- espúrio (soft) e LISTAR o caso para decisão humana.
          UPDATE conciliacao_bancaria_itens
             SET desfeito_em = now(),
                 desfeito_motivo = 'duplicata de importação (DEDUP-01) - lancamento preservado'
           WHERE extrato_id = v_esp.id AND lancamento_id = v_lan.id AND desfeito_em IS NULL;
          v_listados := v_listados + 1;
          RAISE NOTICE 'DEDUP-01 LISTADO p/ decisao humana: extrato_espurio=% lancamento=% (edicao/classificacao/multi-vinculo)', v_esp.id, v_lan.id;
        END IF;
      END LOOP;

      -- marca o extrato espúrio como ignorado (espelha o vocabulário do fn_invalidar_origem_extrato).
      UPDATE extrato_bancario_v2
         SET status = 'ignorado', ignorado_em = now(), ignorado_por = NULL,
             ignorado_motivo = 'duplicado (DEDUP-01)', ignorado_impacto = v_esp.valor
       WHERE id = v_esp.id;
      v_ignorados := v_ignorados + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'DEDUP-01 saneamento: grupos=% canonicos=% espurios=% cancelados_reflexo_puro=% listados_humano=% extratos_ignorados=%',
    v_grupos, v_grupos, v_espurios, v_cancelados, v_listados, v_ignorados;
END $do$;

-- ── 4) backfill de seq_ocorrencia nos VIVOS (pós-saneamento) ─────────────────
-- row_number por (created_at, id) dentro de cada grupo da chave. Grupos saneados
-- ficam com 1 vivo → seq 1; idênticos legítimos históricos ganham 1,2,…
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY cliente_id, conta_bancaria_id, data_movimento, valor, public.fn_extrato_chave_doc(documento)
    ORDER BY created_at, id
  ) AS rn
  FROM extrato_bancario_v2
  WHERE cancelado_em IS NULL AND status <> 'ignorado'
)
UPDATE extrato_bancario_v2 e
   SET seq_ocorrencia = ranked.rn
  FROM ranked
 WHERE ranked.id = e.id AND e.seq_ocorrencia IS DISTINCT FROM ranked.rn;

-- ── 5) UNIQUE parcial da chave natural (só vivos). O idx do hash PERMANECE. ───
CREATE UNIQUE INDEX IF NOT EXISTS idx_extrato_v2_chave_natural
  ON public.extrato_bancario_v2
     (cliente_id, conta_bancaria_id, data_movimento, valor, public.fn_extrato_chave_doc(documento), seq_ocorrencia)
  WHERE cancelado_em IS NULL AND status <> 'ignorado';
