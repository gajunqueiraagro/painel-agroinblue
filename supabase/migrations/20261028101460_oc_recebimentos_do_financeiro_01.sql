-- OC-CORRECOES-01 C3 · OC-CC-BUSCAR-01 — o "Buscar recebimento/pagamento no Financeiro" da OC (Gabriel 21/10, print 15h41 da OC
-- 0731374f: so' aparecia "Outro favorecido"; nenhum lancamento do comprador). CAUSA (FASE 0): os dois avulsos do comprador (`eabe167e`
-- R$ 215.000 e `54465071` R$ 375.000) ja' estao LIGADOS a esta OC (partes `d50e6bcf`/`16ebb14c`) e `oc_recebimentos_vinculaveis` exclui
-- todo lancamento com parte viva — calada. Regra nova: NUNCA ESCONDER EM SILENCIO o que e' do comprador.
-- `oc_recebimentos_do_financeiro(operacao)` devolve:
--   · os VINCULAVEIS de sempre (a mesma regra de `oc_recebimentos_vinculaveis`, que fica intacta), de qualquer favorecido;
--   · e, do COMPRADOR (o contraparte, os cadastros mesclados nele e as filiais da mesma raiz de CNPJ), tambem os que a regra exclui,
--     com o MOTIVO (`motivo_excluido`): ja' nesta operacao (com a parcela), ligado a outra operacao, META, sem caixa, financiamento,
--     transferencia, conta fora do mapa da OC. So' na direcao da OC (receita na venda/abate, despesa na compra) e nao cancelado.
--   As tres datas (competencia, vencimento, pagamento), o favorecido e a conta bancaria pelo nome, o status e o conciliado.
-- SECURITY INVOKER, como a de sempre: a RLS isola o cliente.

CREATE OR REPLACE FUNCTION public.oc_recebimentos_do_financeiro(p_operacao_id uuid)
 RETURNS TABLE(lancamento_id uuid, data_competencia date, data_vencimento date, data_pagamento date, valor numeric, descricao text,
   subcentro text, favorecido_id uuid, favorecido_nome text, do_comprador boolean, conta_bancaria_id uuid, conta_bancaria_nome text,
   status_transacao text, conciliado boolean, motivo_excluido text)
 LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $function$
  WITH RECURSIVE o AS (
    SELECT * FROM public.zoo_operacoes_comerciais
     WHERE id = p_operacao_id AND modelo_financeiro = 'conta_corrente' AND tipo_operacao IN ('venda', 'compra', 'abate')
  ),
  mesclados(id) AS (
    SELECT o.contraparte_id FROM o WHERE o.contraparte_id IS NOT NULL
    UNION
    SELECT f.id FROM public.financeiro_fornecedores f JOIN mesclados m ON f.fundido_em_id = m.id
  ),
  comprador AS (
    SELECT id FROM mesclados
    UNION
    SELECT f.id FROM public.financeiro_fornecedores f, public.financeiro_fornecedores c, o
     WHERE c.id = o.contraparte_id AND f.cliente_id = c.cliente_id AND f.id <> c.id
       AND length(regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g')) = 14
       AND left(regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g'), 8) = left(regexp_replace(c.cpf_cnpj, '\D', '', 'g'), 8)
  ),
  mapa AS (
    SELECT m.subcentro FROM public._oc_vinculo_mapa() m, o
     WHERE o.tipo_operacao = ANY (m.tipos_oc) AND m.tipo_operacao = public._oc_cc_direcao(o.tipo_operacao) AND m.natureza = 'principal'
  ),
  base AS (
    SELECT f.*, (f.favorecido_id IN (SELECT id FROM comprador)) AS do_comp,
      (SELECT pt.operacao_id FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = f.id AND pt.cancelada = false LIMIT 1) AS op_viva,
      (SELECT pt.sequencia_parcela || '/' || pt.quantidade_parcelas FROM public.zoo_operacao_partes pt
        WHERE pt.financeiro_lancamento_id = f.id AND pt.cancelada = false LIMIT 1) AS parcela_viva
      FROM o JOIN public.financeiro_lancamentos_v2 f ON f.cliente_id = o.cliente_id
     WHERE f.cancelado IS NOT TRUE AND f.tipo_operacao = public._oc_cc_direcao(o.tipo_operacao) AND f.valor > 0
  ),
  marcado AS (
    SELECT b.*, CASE
        WHEN b.op_viva = p_operacao_id THEN 'já está nesta operação (' || b.parcela_viva || ')'
        WHEN b.op_viva IS NOT NULL THEN 'ligado a outra operação comercial'
        WHEN coalesce(b.cenario, 'realizado') = 'meta' THEN 'é META (não é dinheiro)'
        WHEN coalesce(b.sem_movimentacao_caixa, false) THEN 'sem movimento de caixa'
        WHEN b.financiamento_id IS NOT NULL THEN 'é parcela de financiamento'
        WHEN b.transferencia_grupo_id IS NOT NULL THEN 'é transferência'
        WHEN b.subcentro IS NULL OR b.subcentro NOT IN (SELECT subcentro FROM mapa) THEN 'a conta não é de venda/compra de gado'
      END AS motivo
      FROM base b
  )
  SELECT m.id, m.data_competencia, m.data_vencimento, m.data_pagamento, round(m.valor, 2), m.descricao, m.subcentro, m.favorecido_id,
         ff.nome, m.do_comp,
         CASE WHEN m.tipo_operacao LIKE '1-%' THEN m.conta_destino_id ELSE m.conta_bancaria_id END,
         (SELECT coalesce(nullif(b.nome_exibicao, ''), b.nome_conta) FROM public.financeiro_contas_bancarias b
           WHERE b.id = CASE WHEN m.tipo_operacao LIKE '1-%' THEN m.conta_destino_id ELSE m.conta_bancaria_id END),
         m.status_transacao,
         EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = m.id AND ci.desfeito_em IS NULL),
         m.motivo
    FROM marcado m LEFT JOIN public.financeiro_fornecedores ff ON ff.id = m.favorecido_id
   WHERE m.motivo IS NULL OR m.do_comp
   ORDER BY m.do_comp DESC, (m.motivo IS NOT NULL), coalesce(m.data_pagamento, m.data_vencimento, m.data_competencia), m.id;
$function$;

REVOKE ALL ON FUNCTION public.oc_recebimentos_do_financeiro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_recebimentos_do_financeiro(uuid) TO authenticated, service_role;
