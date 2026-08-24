-- PR-OC-VALOR-02b — os derivados exigem total > 0, nao so quantidade > 0.
--
-- O TESTE DO E4 PEGOU. Comparando os 33 lotes, `total` bateu em 33 e os
-- derivados em 32. O divergente e o lote de ajuste de saldo do Agnaldo
-- (01/03, 21 garrotes, `valor_informado` zero):
--   banco  -> por_cabeca = 0,000000   (guarda era so `qtd > 0`)
--   front  -> nao emite               (guarda e `total > 0`, AbaNegociacaoLotes:60)
--
-- O FRONT ESTA CERTO, e pelo motivo que a propria funcao ja declarava no
-- comentario: R$ 0,00/cab AFIRMA preco zero, e o que ha e ausencia de base.
-- E nao e detalhe de exibicao — com `por_cabeca = 0` a ponte gravaria
-- `valor_total = 0` no lancamento, exatamente o R$ 0,00 que o
-- PR-MOVIMENTACOES-02 tirou da tela. Com NULL, o lancamento nasce sem valor:
-- ausencia declarada.
--
-- Depois desta migration as duas implementacoes concordam nos 33 lotes.

CREATE OR REPLACE FUNCTION public._oc_valor_do_lote(p_lote_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  /* SECURITY INVOKER de proposito: le `zoo_operacao_lotes`, que tem RLS.
     Chamada de dentro das RPCs SECURITY DEFINER, roda com os direitos delas;
     chamada direta, o RLS do usuario continua valendo. */
  SELECT jsonb_build_object(
    'total',      t.total,
    /* Denominador zero OU total zero devolvem NULL, nunca zero: R$ 0,00/cab
       afirmaria preco, e o que ha e ausencia de base para calcular.
       A guarda `total > 0` espelha `AbaNegociacaoLotes.tsx:60-61`. */
    'por_cabeca', CASE WHEN COALESCE(l.qtd_negociada, 0) > 0 AND COALESCE(t.total, 0) > 0
                       THEN ROUND(t.total / l.qtd_negociada, 6) END,
    'por_kg',     CASE WHEN COALESCE(l.qtd_negociada, 0) > 0
                        AND COALESCE(l.peso_medio_negociado_kg, 0) > 0
                        AND COALESCE(t.total, 0) > 0
                       THEN ROUND(t.total / (l.qtd_negociada * l.peso_medio_negociado_kg), 6) END
  )
  FROM public.zoo_operacao_lotes l
  CROSS JOIN LATERAL (
    SELECT ROUND((CASE l.criterio_valor
      WHEN 'kg'     THEN COALESCE(l.qtd_negociada,0) * COALESCE(l.peso_medio_negociado_kg,0) * l.valor_informado
      WHEN 'cabeca' THEN COALESCE(l.qtd_negociada,0) * l.valor_informado
      WHEN 'total'  THEN l.valor_informado
    END)::numeric, 2) AS total
  ) t
  WHERE l.id = p_lote_id;
$function$;
