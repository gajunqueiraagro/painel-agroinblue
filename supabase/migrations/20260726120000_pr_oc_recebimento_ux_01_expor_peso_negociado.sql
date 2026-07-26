-- PR-OC-RECEBIMENTO-UX-01 (Opção B): expor peso_medio_negociado_kg no contrato oficial do Recebimento.
--   Objetivo ÚNICO: disponibilizar o peso médio negociado (JÁ persistido em zoo_operacao_lotes)
--   para INICIALIZAR o input "Peso méd." na aba Recebimento, vinculado pelo lote_id oficial.
--   Nada mais muda: mesma lógica de qtd_recebida / diferenca / estado_recebimento; security_invoker e
--   grants preservados. Coluna adicionada ao FINAL do SELECT (CREATE OR REPLACE VIEW compatível com
--   os consumidores atuais — leitura por nome de coluna / select('*')).

CREATE OR REPLACE VIEW public.vw_oc_lotes_recebimento WITH (security_invoker = true) AS
WITH rec AS (
  SELECT m.operacao_lote_id, sum(l.quantidade) AS recebida
    FROM public.zoo_operacao_movimentacoes m
    JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE l.cancelado IS NOT TRUE
   GROUP BY m.operacao_lote_id
)
SELECT
  lo.cliente_id, lo.operacao_id, lo.id AS lote_id, lo.ordem,
  lo.categoria_negociada, lo.qtd_negociada,
  COALESCE(rec.recebida, 0) AS qtd_recebida,
  COALESCE(lo.qtd_negociada, 0) - COALESCE(rec.recebida, 0) AS diferenca,
  CASE
    WHEN COALESCE(rec.recebida,0) = 0                                   THEN 'nao_iniciado'
    WHEN lo.qtd_negociada IS NOT NULL AND rec.recebida > lo.qtd_negociada THEN 'excedente'
    WHEN lo.qtd_negociada IS NOT NULL AND rec.recebida = lo.qtd_negociada THEN 'completo'
    ELSE 'parcial'
  END AS estado_recebimento,
  lo.peso_medio_negociado_kg
FROM public.zoo_operacao_lotes lo
LEFT JOIN rec ON rec.operacao_lote_id = lo.id;

COMMENT ON VIEW public.vw_oc_lotes_recebimento IS
  'PR-OC-RECEB-01: recebimento por lote. qtd_recebida = Σ lancamentos válidos (cancelado IS NOT TRUE) vinculados ao lote; diferenca = negociada − recebida; estado nao_iniciado|parcial|completo|excedente. Tenant-safe (security_invoker). PR-OC-RECEBIMENTO-UX-01: + peso_medio_negociado_kg (referência para inicializar o input Peso méd.; não altera o recebimento).';

REVOKE ALL ON TABLE public.vw_oc_lotes_recebimento FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.vw_oc_lotes_recebimento TO authenticated;
