-- VINCULAR OS EXATOS — o lado do sistema para de exigir a data que o proprio vinculo escreve.
--
-- O CIRCULO QUE ISTO DESFAZ, medido em 18/09/2026:
--   A CTE `lanc` filtrava `fl.data_pagamento BETWEEN p_de AND p_ate` e lia `fl.data_pagamento`
--   como data do par. So que `data_pagamento` e' preenchida PELO VINCULO — o lancamento previsto
--   tem `data_vencimento` e `data_pagamento` NULA ate' alguem concilia-lo. Ou seja: o botao
--   "Vincular os exatos" so' enxergava o que ja tinha sido vinculado, e nao vinculava nada do que
--   estava esperando. Ele era o passo 2a do fluxo e nao fazia o seu trabalho.
--
-- OS NUMEROS, na Vera Ligia · Itau Personalite · set/2026:
--   ANTES : 21 movimentos em aberto · 0 lancamentos visiveis · 0 pares · o botao vincularia ZERO
--   DEPOIS: 21 movimentos em aberto · 38 lancamentos visiveis · 20 pares
-- E o alcance, no proto inteiro (2026): dos 355 pares (conta, mes) com lancamento sem vinculo,
-- 154 — 43,4% — estavam TOTALMENTE cegos ao botao, e todos sao alcancados por esta mudanca.
-- Dos 5.748 lancamentos realizados vivos sem vinculo, 1.171 (20,4%) eram invisiveis.
--
-- ⚠ E A PREVIA JA FAZIA CERTO, e era essa a assimetria: `fn_extrato_conciliar_mes` conta os
-- candidatos com `COALESCE(l.data_pagamento, l.data_vencimento)`. Entao a tela dizia "21 tem par
-- exato" e o botao ao lado vinculava zero — duas reguas sobre o mesmo conjunto, uma prometendo o
-- que a outra nao entregava. Agora as duas olham para o mesmo lugar.
--
-- ⚠ TERCEIRA OCORRENCIA DA MESMA RAIZ, e as outras duas seguem ABERTAS: filtrar por
-- `data_pagamento` equivale, nesta base, a filtrar por "ja conciliado".
--   1. `useSaldoSistemaNaPosicao` — o "Saldo no sistema" soma so' quem tem `data_pagamento`.
--      Medido na mesma conta/mes: mostra 141.463,64 (9 linhas) onde os 47 realizados do mes dao
--      1.004,48. Diferenca de 140.459,16.
--   2. `fn_extratos_espelhados` — `sistema_completo` devolve 9 linhas para um mes de 47
--      realizados, pelo mesmo motivo.
--   3. ESTA, corrigida aqui.
-- Quem for corrigir as duas primeiras comeca por este cabecalho.
--
-- O QUE MUDOU, e nada alem disto: os DOIS pontos da CTE `lanc` — o `SELECT` da data e o
-- `BETWEEN` do periodo — passam a usar `COALESCE(fl.data_pagamento, fl.data_vencimento)`. A regua
-- do "exato" continua a mesma (mesma data, mesmo valor absoluto, unico dos dois lados, sem
-- tolerancia), o gravador continua `fn_vincular_extrato_lancamento` par a par com todas as
-- travas, e a recusa de um par continua sem derrubar o lote.
--
-- Aplicada no proto pelo arquiteto em 18/09/2026; esta migration e REGISTRO HISTORICO.
-- Conferida contra o banco (pg_proc), nao contra a mensagem que a anunciou:
--   corpo (prosrc):     md5 73bff2e4cda4708691f7883951b11a82, len 2688
--   definicao completa: md5 8ecea6baafb6e3adcecafeca9ee72df0, len 2950
--   antes (prosrc):     md5 aa0487544a4d70478819016078e99b6b, len 2628
-- Grants conferidos por has_function_privilege: authenticated, postgres, service_role.

CREATE OR REPLACE FUNCTION public.fn_vincular_exatos_mes(p_cliente_id uuid, p_conta_bancaria_id uuid, p_de date, p_ate date, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Vincula em massa os pares EXATOS E UNICOS dos dois lados (mesma conta,
-- mesmo valor absoluto, mesma data; unico entre os movimentos em aberto E
-- unico entre os lancamentos sem vinculo). E a regua do match direto sem
-- depender do motor de sugestoes (CONCIL-MOTOR-PERF-01: o motor chama
-- fn_candidatos por movimento e nao escala em mes grande).
-- Gravador unico: fn_vincular_extrato_lancamento por par — todas as travas
-- e a guarda de sobre-aplicacao valem; recusa nao derruba o lote.
DECLARE
  v_uid uuid := auth.uid();
  p record; v_ok int := 0; v_rec int := 0; v_motivos text := NULL;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_uid) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  FOR p IN
    WITH mov AS (
      SELECT e.id, e.data_movimento d, round(abs(e.valor),2) v
      FROM public.extrato_bancario_v2 e
      WHERE e.conta_bancaria_id = p_conta_bancaria_id AND e.cancelado_em IS NULL
        AND e.status <> 'ignorado'
        AND e.data_movimento BETWEEN p_de AND p_ate
        AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci
                        WHERE ci.extrato_id = e.id AND ci.desfeito_em IS NULL)
    ), lanc AS (
      SELECT fl.id, COALESCE(fl.data_pagamento, fl.data_vencimento) d, round(fl.valor,2) v
      FROM public.financeiro_lancamentos_v2 fl
      WHERE fl.cliente_id = p_cliente_id
        AND (fl.conta_bancaria_id = p_conta_bancaria_id OR fl.conta_destino_id = p_conta_bancaria_id)
        AND coalesce(fl.cancelado,false) = false AND fl.cenario = 'realizado'
        AND coalesce(fl.sem_movimentacao_caixa,false) = false
        AND COALESCE(fl.data_pagamento, fl.data_vencimento) BETWEEN p_de AND p_ate
        AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci
                        WHERE ci.lancamento_id = fl.id AND ci.desfeito_em IS NULL)
    ), m1 AS (SELECT min(id::text)::uuid mid, d, v FROM mov GROUP BY d, v HAVING count(*) = 1),
       l1 AS (SELECT min(id::text)::uuid lid, d, v FROM lanc GROUP BY d, v HAVING count(*) = 1)
    SELECT m1.mid, l1.lid FROM m1 JOIN l1 USING (d, v)
  LOOP
    IF p_simular THEN
      v_ok := v_ok + 1;
    ELSE
      BEGIN
        PERFORM public.fn_vincular_extrato_lancamento(p.mid, p.lid, NULL::numeric);
        v_ok := v_ok + 1;
      EXCEPTION WHEN OTHERS THEN
        v_rec := v_rec + 1;
        v_motivos := left(coalesce(v_motivos || ' | ', '') || SQLERRM, 300);
      END;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'vinculados', v_ok, 'recusados', v_rec,
                            'motivos', v_motivos, 'simulacao', p_simular);
END;
$function$;
