-- =====================================================================
-- PR-FIN-LISTA-VENCIMENTO-03 · agregacao dos totais da lista, no servidor.
--
-- Substitui a varredura que o hook fazia: baixar `valor, sinal` de TODAS as
-- linhas do filtro, em lotes de 1000, para somar no navegador. Num tenant de
-- 29 mil linhas isso eram 30 viagens e ~29 mil objetos so para exibir dois
-- numeros no rodape.
--
-- SECURITY INVOKER, e isso e a peca central: a funcao executa com os
-- privilegios de QUEM CHAMA, entao a RLS de financeiro_lancamentos_v2 (atraves
-- da view, tambem security_invoker) continua valendo por construcao. Passar o
-- cliente_id de outro tenant nao vaza nada — a RLS filtra antes da agregacao.
-- O parametro de tenant e OBRIGATORIO e a funcao recusa NULL.
--
-- search_path fixo. Zero SQL dinamico: todo predicado e da forma
-- `(p_x IS NULL OR <condicao>)`, resolvida pelo planner, nunca concatenada.
--
-- UMA passagem: total, entradas, saidas e excluidas saem do mesmo scan via
-- agregados com FILTER, em vez de tres consultas.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_lista_v2_totais(
  p_cliente_id              uuid,
  p_fazenda_id              uuid        DEFAULT NULL,
  p_dimensao                text        DEFAULT 'financeira',
  p_faixas                  daterange[] DEFAULT NULL,
  p_meses                   smallint[]  DEFAULT NULL,
  p_exigir_data_dimensao    boolean     DEFAULT false,
  p_incluir_sem_vencimento  boolean     DEFAULT false,
  p_conta_bancaria_id       uuid        DEFAULT NULL,
  p_conta_destino_id        uuid        DEFAULT NULL,
  p_tipo_operacao           text        DEFAULT NULL,
  p_status_transacoes       text[]      DEFAULT NULL,
  p_incluir_conciliado      boolean     DEFAULT false,
  p_macro_custo             text        DEFAULT NULL,
  p_grupo_custo             text        DEFAULT NULL,
  p_centro_custo            text        DEFAULT NULL,
  p_subcentro               text        DEFAULT NULL,
  p_lista_conta_direcao     text        DEFAULT NULL,
  p_lista_produto           text        DEFAULT NULL,
  p_lista_fornecedor_id     uuid        DEFAULT NULL,
  p_lista_grupo_custo       text        DEFAULT NULL,
  p_lista_atividade         text        DEFAULT NULL,
  p_lista_documento         text        DEFAULT NULL
)
RETURNS TABLE (
  total                     bigint,
  entradas                  numeric,
  saidas                    numeric,
  excluidos_sem_vencimento  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $FN$
DECLARE
  c_transf   constant text[] := ARRAY['3-Transferências', '3-Transferência'];
  c_escopos  constant text[] := ARRAY['pecuaria', 'agricultura', 'administrativo'];
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'fn_lista_v2_totais: cliente_id e obrigatorio';
  END IF;
  IF p_dimensao IS NULL OR p_dimensao NOT IN ('financeira','competencia','vencimento','pagamento') THEN
    RAISE EXCEPTION 'fn_lista_v2_totais: dimensao invalida (%)', p_dimensao;
  END IF;
  IF p_lista_conta_direcao IS NOT NULL AND p_lista_conta_direcao NOT IN ('origem','destino') THEN
    RAISE EXCEPTION 'fn_lista_v2_totais: direcao invalida (%)', p_lista_conta_direcao;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      v.valor,
      -- `sinal` e coluna TEXT no schema ('-1' | '0' | '1' | NULL), embora o
      -- contrato TypeScript a declare como number — o cliente so funciona por
      -- coercao do JS. Aqui a conversao e explicita e NAO PODE estourar: valor
      -- fora do padrao vira 0, que e exatamente o que `Number(x) || 0` faz.
      CASE WHEN v.sinal ~ '^-?[0-9]+$' THEN v.sinal::int ELSE 0 END AS sinal_num,
      v.data_vencimento,
      -- data soberana da dimensao. 'financeira' = COALESCE(pagamento, vencimento),
      -- que e exatamente o ramo OR do caminho da lista: pago na faixa, ou nao pago
      -- e vencendo na faixa.
      CASE p_dimensao
        WHEN 'competencia' THEN v.data_competencia
        WHEN 'vencimento'  THEN v.data_vencimento
        WHEN 'pagamento'   THEN v.data_pagamento
        ELSE coalesce(v.data_pagamento, v.data_vencimento)
      END AS d,
      CASE p_dimensao
        WHEN 'competencia' THEN v.mes_competencia
        WHEN 'vencimento'  THEN v.mes_vencimento
        WHEN 'pagamento'   THEN v.mes_pagamento
        ELSE v.mes_financeira
      END AS mes_d
    FROM public.vw_financeiro_lancamentos_v2_doc v
    WHERE v.cliente_id = p_cliente_id
      -- estruturais, identicos ao caminho da lista
      AND v.cancelado = false
      AND v.status_transacao IS DISTINCT FROM 'conciliado'
      AND v.cenario IS DISTINCT FROM 'meta'
      AND (p_fazenda_id IS NULL OR v.fazenda_id = p_fazenda_id)
      -- contas: com origem E destino, vira recorte de transferencia
      AND (
        CASE
          WHEN p_conta_bancaria_id IS NOT NULL AND p_conta_destino_id IS NOT NULL THEN
            v.tipo_operacao = '3-Transferências'
            AND v.conta_bancaria_id = p_conta_bancaria_id
            AND v.conta_destino_id  = p_conta_destino_id
          ELSE
            (p_conta_bancaria_id IS NULL OR v.conta_bancaria_id = p_conta_bancaria_id)
            AND (p_conta_destino_id IS NULL OR v.conta_destino_id = p_conta_destino_id)
            AND (p_tipo_operacao IS NULL OR v.tipo_operacao = p_tipo_operacao)
        END
      )
      -- status: 'conciliado' e DERIVADO (conciliado_em), nao um status_transacao
      AND (
        (p_status_transacoes IS NULL AND NOT p_incluir_conciliado)
        OR (p_status_transacoes IS NOT NULL AND v.status_transacao = ANY (p_status_transacoes))
        OR (p_incluir_conciliado AND v.conciliado_em IS NOT NULL)
      )
      AND (p_macro_custo  IS NULL OR v.macro_custo  = p_macro_custo)
      AND (p_grupo_custo  IS NULL OR v.grupo_custo  = p_grupo_custo)
      AND (p_centro_custo IS NULL OR v.centro_custo = p_centro_custo)
      AND (p_subcentro    IS NULL OR v.subcentro    = p_subcentro)
      -- os seis filtros da lista
      AND (
        p_lista_conta_direcao IS NULL
        OR (p_lista_conta_direcao = 'origem'
            AND ((CASE WHEN v.sinal ~ '^-?[0-9]+$' THEN v.sinal::int ELSE 0 END) < 0
                 OR v.tipo_operacao = ANY (c_transf)))
        OR (p_lista_conta_direcao = 'destino'
            AND ((CASE WHEN v.sinal ~ '^-?[0-9]+$' THEN v.sinal::int ELSE 0 END) > 0
                 OR v.tipo_operacao = ANY (c_transf)))
      )
      -- strpos sobre lower(): e `String.includes` do cliente, ao pe da letra.
      -- Sem LIKE, entao nao existe curinga a escapar — %, _, \ e * sao literais
      -- por construcao, e nao por escape que alguem possa esquecer.
      AND (p_lista_produto IS NULL OR p_lista_produto = ''
           OR strpos(lower(coalesce(v.descricao, '')), lower(btrim(p_lista_produto))) > 0)
      AND (p_lista_fornecedor_id IS NULL OR v.favorecido_id = p_lista_fornecedor_id)
      AND (p_lista_grupo_custo IS NULL OR v.grupo_custo = p_lista_grupo_custo)
      AND (
        p_lista_atividade IS NULL
        OR (p_lista_atividade = ANY (c_escopos) AND v.escopo_negocio = p_lista_atividade)
        OR (p_lista_atividade = 'outros'
            AND (v.escopo_negocio IS NULL OR NOT (v.escopo_negocio = ANY (c_escopos))))
      )
      AND (p_lista_documento IS NULL OR p_lista_documento = ''
           OR strpos(lower(coalesce(v.numero_documento, '')), lower(btrim(p_lista_documento))) > 0
           OR strpos(lower(v.documento_formatado), lower(btrim(p_lista_documento))) > 0)
  ),
  marcado AS (
    SELECT b.*,
      -- recorte temporal. `p_incluir_sem_vencimento` e ADITIVO, como na lista.
      (
        (p_faixas IS NULL OR EXISTS (SELECT 1 FROM unnest(p_faixas) f WHERE b.d <@ f)
         OR (p_incluir_sem_vencimento AND b.data_vencimento IS NULL))
        AND (NOT p_exigir_data_dimensao OR b.d IS NOT NULL)
        AND (p_meses IS NULL OR b.mes_d = ANY (p_meses))
      ) AS no_recorte
    FROM base b
  )
  SELECT
    count(*) FILTER (WHERE m.no_recorte)::bigint,
    coalesce(sum(m.valor) FILTER (WHERE m.no_recorte AND m.sinal_num > 0), 0)::numeric,
    coalesce(sum(m.valor) FILTER (WHERE m.no_recorte AND m.sinal_num < 0), 0)::numeric,
    -- B menos A: o que existe sem vencimento no universo filtrado, menos o que
    -- sobreviveu ao recorte. Sem periodo, os dois sao iguais e o resultado e 0 —
    -- sem precisar de caso especial.
    (count(*) FILTER (WHERE m.data_vencimento IS NULL)
     - count(*) FILTER (WHERE m.no_recorte AND m.data_vencimento IS NULL))::bigint
  FROM marcado m;
END
$FN$;

-- ACL: DEFAULT PRIVILEGES concede EXECUTE a PUBLIC em toda funcao nova.
REVOKE ALL ON FUNCTION public.fn_lista_v2_totais(
  uuid, uuid, text, daterange[], smallint[], boolean, boolean, uuid, uuid, text,
  text[], boolean, text, text, text, text, text, text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_lista_v2_totais(
  uuid, uuid, text, daterange[], smallint[], boolean, boolean, uuid, uuid, text,
  text[], boolean, text, text, text, text, text, text, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_lista_v2_totais(
  uuid, uuid, text, daterange[], smallint[], boolean, boolean, uuid, uuid, text,
  text[], boolean, text, text, text, text, text, text, uuid, text, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_lista_v2_totais(
  uuid, uuid, text, daterange[], smallint[], boolean, boolean, uuid, uuid, text,
  text[], boolean, text, text, text, text, text, text, uuid, text, text, text) TO authenticated;

DO $$
DECLARE v_oid oid; v_n int; v_sec boolean; v_cfg text[];
BEGIN
  SELECT p.oid, p.prosecdef, p.proconfig INTO v_oid, v_sec, v_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_lista_v2_totais';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'RPC1: funcao nao criada'; END IF;

  IF v_sec IS NOT FALSE THEN
    RAISE EXCEPTION 'RPC2: funcao e SECURITY DEFINER — burlaria a RLS do chamador';
  END IF;

  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'RPC3: funcao sem search_path fixo';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p, LATERAL aclexplode(p.proacl) a
   WHERE p.oid = v_oid
     AND coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') IN ('PUBLIC', 'anon', 'service_role');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'RPC4: EXECUTE concedido a PUBLIC/anon/service_role (%)', v_n;
  END IF;

  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC5: authenticated sem EXECUTE';
  END IF;

  IF (SELECT prosrc FROM pg_proc WHERE oid = v_oid) ~* '(execute\s+format|execute\s+''|quote_ident|quote_literal)' THEN
    RAISE EXCEPTION 'RPC6: corpo contem SQL dinamico';
  END IF;

  RAISE NOTICE 'RPC: fn_lista_v2_totais criada — SECURITY INVOKER, search_path fixo, ACL contida, sem SQL dinamico.';
END $$;
