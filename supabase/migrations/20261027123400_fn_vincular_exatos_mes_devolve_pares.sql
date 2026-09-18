-- VINCULAR OS EXATOS — a funcao passa a DEVOLVER os pares que vai casar.
--
-- POR QUE: a tela pedia aprovacao sem mostrar o que se aprova. A caixa dizia "Vincular 20 pares
-- exatos?" e nao listava um par sequer — o operador confirmava no escuro uma gravacao que casa
-- movimento com lancamento. E o mesmo defeito que este projeto passou o dia tirando das telas
-- (o "calculando..." eterno do Palco, o "confere" sobre um centavo, o badge que somava naturezas
-- diferentes): afirmar sem mostrar.
--
-- ⚠ E OS IDS JA PASSAVAM PELO LACO E ERAM DESCARTADOS. A simulacao percorria o `m1 JOIN l1`
-- inteiro e so' fazia `v_ok := v_ok + 1`; o retorno tinha cinco escalares (ok, vinculados,
-- recusados, motivos, simulacao) e nenhum par. Conferido no banco antes desta migration, por
-- `jsonb_object_keys` sobre o retorno da simulacao.
--
-- O QUE MUDOU, em quatro pontos:
--   1. `DECLARE` ganha `v_pares jsonb := '[]'`.
--   2. O SELECT do laco traz os DOIS lados: alem de `m1.mid`/`l1.lid`, a data e o valor do par,
--      `mv.descricao`/`mv.valor` do extrato, `lc.descricao`/`lc.sinal` do lancamento e `ff.nome`
--      por LEFT JOIN em `financeiro_fornecedores` — o favorecido, sem o qual a coluna da direita
--      ficaria so' com a descricao.
--   3. Dentro do laco, ANTES do `IF p_simular`, acumula o par em `v_pares`. Fica na SIMULACAO e
--      na GRAVACAO: na simulacao e a previa do que sera feito; na gravacao, o recibo do que foi.
--   4. O retorno ganha `'pares'`. As cinco chaves antigas continuam identicas — nenhum leitor
--      existente quebra.
--
-- ⚠ `valor_sistema` JA VEM COM O SINAL APLICADO, e isso e' decisao de contrato: o lancamento
-- guarda `valor` sempre positivo e a direcao em `sinal`. Deixar a tela multiplicar obrigaria cada
-- tela a conhecer essa convencao, e a primeira que esquecesse mostraria uma saida como entrada.
--
-- NADA MAIS MUDOU: a regua do "exato" continua mesma data, mesmo valor absoluto e unico dos dois
-- lados, sem tolerancia; o gravador continua `fn_vincular_extrato_lancamento` par a par, com
-- todas as travas; a recusa de um par continua sem derrubar o lote.
--
-- Aplicada no proto pelo arquiteto em 18/09/2026; esta migration e REGISTRO HISTORICO.
-- Conferida contra o banco (pg_proc), nao contra a mensagem que a anunciou:
--   corpo (prosrc):     md5 074ce0778c8099885db54063f57267d8, len 3667
--   definicao completa: md5 22641a5a465e8ebf0c73dc2f4e2a9ff9, len 3929
--   antes (prosrc):     md5 73bff2e4cda4708691f7883951b11a82, len 2688
-- Grants conferidos: authenticated, postgres, service_role.
-- ⚠ `len` E EM CARACTERES, como o `length()` do Postgres conta — o arquivo tem 3931 BYTES,
-- porque o travessao do comentario e' multibyte em UTF-8. Quem conferir com `wc -c` vai achar
-- dois a mais e nao e' divergencia.

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
  v_pares jsonb := '[]'::jsonb;
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
    SELECT m1.mid, l1.lid, m1.d AS pd, m1.v AS pv,
           mv.descricao AS hist_banco, mv.valor AS val_banco,
           lc.descricao AS desc_sis, lc.sinal AS sinal_sis,
           ff.nome AS favorecido
      FROM m1 JOIN l1 USING (d, v)
      JOIN public.extrato_bancario_v2 mv ON mv.id = m1.mid
      JOIN public.financeiro_lancamentos_v2 lc ON lc.id = l1.lid
      LEFT JOIN public.financeiro_fornecedores ff ON ff.id = lc.favorecido_id
  LOOP
    -- PR (b): o par vai no retorno para a tela poder MOSTRAR o que vai vincular.
    -- Aprovar sem ver os dois lados e o defeito que este projeto tirou das telas.
    v_pares := v_pares || jsonb_build_object(
      'extrato_id', p.mid, 'lancamento_id', p.lid,
      'data', p.pd, 'valor', p.pv,
      'historico_banco', p.hist_banco, 'valor_banco', p.val_banco,
      'descricao_sistema', p.desc_sis, 'favorecido', p.favorecido,
      'valor_sistema', p.pv * (CASE WHEN p.sinal_sis = '-1' THEN -1 ELSE 1 END));
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
                            'motivos', v_motivos, 'simulacao', p_simular,
                            'pares', v_pares);
END;
$function$;
