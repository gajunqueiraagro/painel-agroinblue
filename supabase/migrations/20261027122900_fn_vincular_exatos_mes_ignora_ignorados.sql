-- VINCULAR OS EXATOS — a varredura em massa passa a respeitar o IGNORADO.
--
-- O QUE ESTAVA ANTES: a CTE `mov` filtrava apenas `e.cancelado_em IS NULL`. O movimento que o
-- operador tinha IGNORADO de proposito — pelo Espelho, com motivo obrigatorio, auditoria em
-- `conciliacao_audit_log` e as colunas `ignorado_em/por/motivo` preenchidas — continuava
-- elegivel, e um clique em "Vincular os exatos" podia amarra-lo a um lancamento em massa.
-- Ignorar quer dizer "existe, mas NAO quero conciliar isto"; uma acao em lote que atropela essa
-- decisao desfaz em silencio um ato deliberado, e o operador so descobre depois.
--
-- ⚠ O NUMERO, MEDIDO EM 18/09/2026 ANTES DA CORRECAO: 15 movimentos ignorados VIVOS no proto,
-- e os 15 SEM vinculo ativo — ou seja, os 15 estavam ao alcance do botao. Nao houve estrago
-- registrado; a correcao e para que nao haja.
--
-- ⚠ A REGRA E A MESMA DAS OUTRAS LEITURAS DA CASA, copiada e nao inventada: `status <> 'ignorado'`
-- e o que o indice `idx_extrato_v2_hash_unico` usa, o que a dedupe da importacao passou a usar
-- (20261027...  PR-IMPORT-CANCELADO-01) e o que `useConciliacaoDoMes` ja fazia por `ignorado_em`.
-- ⚠ E NAO ADIANTARIA FILTRAR SO `cancelado_em`: cancelado e ignorado sao estados DIFERENTES de
-- proposito neste schema — cancelado e o movimento que nao existe, ignorado e o que existe e foi
-- desconsiderado. Ambos ficam fora da conciliacao, e agora ambos ficam fora desta varredura.
--
-- NADA MAIS MUDOU: o criterio de "exato" continua sendo mesma data e mesmo valor, unico dos dois
-- lados, sem tolerancia; o gravador continua sendo `fn_vincular_extrato_lancamento` par a par,
-- com todas as travas; a recusa de um par continua sem derrubar o lote.
--
-- Aplicada no proto pelo arquiteto em 18/09/2026; esta migration e REGISTRO HISTORICO.
-- Copiada do pg_get_functiondef do proto e conferida lendo este arquivo:
--   corpo (prosrc):     md5 aa0487544a4d70478819016078e99b6b, len 2628
--   definicao completa: md5 9fce8fa62888d552b9e6936a99452f9f, len 2890

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
      SELECT fl.id, fl.data_pagamento d, round(fl.valor,2) v
      FROM public.financeiro_lancamentos_v2 fl
      WHERE fl.cliente_id = p_cliente_id
        AND (fl.conta_bancaria_id = p_conta_bancaria_id OR fl.conta_destino_id = p_conta_bancaria_id)
        AND coalesce(fl.cancelado,false) = false AND fl.cenario = 'realizado'
        AND coalesce(fl.sem_movimentacao_caixa,false) = false
        AND fl.data_pagamento BETWEEN p_de AND p_ate
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
