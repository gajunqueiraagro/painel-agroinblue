-- OC-STATUS-LADO-01 — o estado de liquidacao da OC olha o LADO da operacao; o outro lado vira despesa
--
-- ADR-2026-20 (docs/adr/ADR-2026-20-estado-liquidacao-pelo-lado.md), que referencia a ADR-16 (eixo 4,
-- "Liquidacao — o dinheiro/bens andaram?") e a ADR-19 (liquidacao = satisfacao de obrigacao), sem edita-las.
--
-- POR QUE
-- `vw_oc_operacao_liquidacao` comparava a base `_oc_base_divida_operacao` (principal pelo LOTE + TODAS as
-- obrigacoes, dos dois lados) com a soma de TODAS as liquidacoes. Numa venda de boitel com o adiantamento
-- pago e nada recebido do boitel (Vera b58bf556) o estado era "parcial" — e a Central dizia "Paga 14%".
-- Cinco OCs estavam "parcial" com ZERO recebido. Decisao do Gabriel (25/09/2026): o estado pergunta pelo
-- lado da operacao (venda/abate: o que entra; compra: o que sai), e as obrigacoes do outro lado ganham
-- indicador proprio (`despesas_pendentes`).
--
-- O QUE MUDA NA VIEW (mesmas colunas, na mesma ordem e tipo; tres novas no FIM):
--   OC com compromisso NO SEU LADO ("pelo lado"):
--     base                   = obrigacao do lado, pelo COMPROMISSO (`vw_oc_operacao_compromissos_resumo`,
--                              a mesma fonte do modal da OC e do Resumo da Central — decisao do Gabriel)
--     total_liquidado_valido = liquidacoes vivas com natureza = lado (compra 'pagamento', resto
--                              'recebimento'); a natureza e' confiavel desde o OC-LIQ-SINAL-01
--     saldo_operacao, estado = da base e do liquidado do lado; a regua `_oc_estado_liquidacao` INTACTA
--     base_origem            = 'compromisso_lado'
--     despesas_obrigacao / despesas_liquidado / despesas_pendentes = o outro lado
--   OC sem compromisso no seu lado: EXATAMENTE a conta de antes (lote + obrigacoes x tudo), despesas NULL.
--   ⚠ "SEM COMPROMISSO NO SEU LADO" E' A GUARDA QUE IMPEDE UM "QUITADA" FALSO: uma venda com so' o frete
--     cadastrado teria base do lado ZERO e liquidado zero — `abs(0 - 0) <= 0,01` diria liquidada.
--
-- ⚠ AS DUAS MEDIDAS DE LIQUIDADO DO LADO CONCORDAM: natureza x compromisso batem nas 78 OCs com compromisso
--   (medido). A natureza foi a escolhida porque cobre liquidacao SEM titulo (permuta manual), que o
--   compromisso nao ve'. Nenhum compromisso vivo esta' sem lado (conta do plano sem `tipo_operacao`).
--
-- ⚠ `oc_derivar_status` FICA COMO ESTA' — MORTA: zero chamadores no front e no banco. Alinha-la faria uma
--   segunda copia desta regra; ela fica registrada como morta no CLAUDE.md, para quem a achar nao a religar.
--
-- ⚠ O REPLACE LEVA `WITH (security_invoker = true)`: CREATE OR REPLACE VIEW sem ele apaga a opcao em
--   silencio (memoria "Replace de view perde reloptions"). Conferido depois em `pg_class.reloptions`.

CREATE OR REPLACE VIEW public.vw_oc_operacao_liquidacao
WITH (security_invoker = true) AS
 WITH op AS (
         SELECT o.cliente_id,
            o.id AS operacao_id,
            o.valor_total,
            CASE o.tipo_operacao WHEN 'compra'::text THEN 'pagamento'::text ELSE 'recebimento'::text END AS nat_lado,
            CASE WHEN o.tipo_operacao = 'compra'::text THEN r.saida_obrigacao ELSE r.entrada_obrigacao END AS obrig_lado,
            CASE WHEN o.tipo_operacao = 'compra'::text THEN r.entrada_obrigacao ELSE r.saida_obrigacao END AS obrig_outro
           FROM zoo_operacoes_comerciais o
             LEFT JOIN vw_oc_operacao_compromissos_resumo r ON r.operacao_id = o.id
        ), liq AS (
         SELECT l.operacao_id,
            sum(l.valor) AS total,
            sum(l.valor) FILTER (WHERE l.forma <> ALL (ARRAY['permuta'::text, 'compensacao'::text])) AS total_mon,
            sum(l.valor) FILTER (WHERE l.forma = ANY (ARRAY['permuta'::text, 'compensacao'::text])) AS total_nmon,
            sum(l.valor) FILTER (WHERE l.natureza = p.nat_lado) AS lado,
            sum(l.valor) FILTER (WHERE l.natureza = p.nat_lado AND (l.forma <> ALL (ARRAY['permuta'::text, 'compensacao'::text]))) AS lado_mon,
            sum(l.valor) FILTER (WHERE l.natureza = p.nat_lado AND (l.forma = ANY (ARRAY['permuta'::text, 'compensacao'::text]))) AS lado_nmon,
            sum(l.valor) FILTER (WHERE l.natureza IS DISTINCT FROM p.nat_lado) AS outro
           FROM zoo_operacao_liquidacoes l
             JOIN op p ON p.operacao_id = l.operacao_id
          WHERE l.estornado = false
          GROUP BY l.operacao_id
        ), t AS (
         SELECT p.cliente_id,
            p.operacao_id,
            p.valor_total,
            COALESCE(p.obrig_lado, 0::numeric) > 0::numeric AS pelo_lado,
            p.obrig_lado,
            p.obrig_outro,
            COALESCE(liq.total, 0::numeric) AS liq_total,
            COALESCE(liq.total_mon, 0::numeric) AS liq_total_mon,
            COALESCE(liq.total_nmon, 0::numeric) AS liq_total_nmon,
            COALESCE(liq.lado, 0::numeric) AS liq_lado,
            COALESCE(liq.lado_mon, 0::numeric) AS liq_lado_mon,
            COALESCE(liq.lado_nmon, 0::numeric) AS liq_lado_nmon,
            COALESCE(liq.outro, 0::numeric) AS liq_outro,
            b.base AS base_antiga,
            b.base_origem AS base_origem_antiga
           FROM op p
             LEFT JOIN liq ON liq.operacao_id = p.operacao_id
             LEFT JOIN LATERAL _oc_base_divida_operacao(p.operacao_id) b(base, base_origem) ON true
        ), f AS (
         SELECT t.*,
            CASE WHEN t.pelo_lado THEN t.obrig_lado ELSE t.base_antiga END AS base_ef,
            CASE WHEN t.pelo_lado THEN t.liq_lado ELSE t.liq_total END AS liq_ef
           FROM t
        )
 SELECT f.cliente_id,
    f.operacao_id,
    f.valor_total,
    f.liq_ef AS total_liquidado_valido,
    (f.base_ef - f.liq_ef) AS saldo_operacao,
        CASE _oc_estado_liquidacao(f.base_ef, f.liq_ef)
            WHEN 'nao_iniciada'::text THEN 'nao_liquidada'::text
            WHEN 'liquidada'::text THEN 'quitada'::text
            WHEN 'excedente'::text THEN 'excedente'::text
            WHEN 'base_indefinida'::text THEN 'base_indefinida'::text
            ELSE 'parcial'::text
        END AS estado_liquidacao,
    f.base_ef AS base,
        CASE WHEN f.pelo_lado THEN 'compromisso_lado'::text ELSE f.base_origem_antiga END AS base_origem,
        CASE WHEN f.pelo_lado THEN f.liq_lado_mon ELSE f.liq_total_mon END AS total_liquidado_monetario,
        CASE WHEN f.pelo_lado THEN f.liq_lado_nmon ELSE f.liq_total_nmon END AS total_liquidado_nao_monetario,
        CASE WHEN f.pelo_lado THEN COALESCE(f.obrig_outro, 0::numeric) END AS despesas_obrigacao,
        CASE WHEN f.pelo_lado THEN f.liq_outro END AS despesas_liquidado,
        CASE WHEN f.pelo_lado THEN round(COALESCE(f.obrig_outro, 0::numeric) - f.liq_outro, 2) END AS despesas_pendentes
   FROM f;
