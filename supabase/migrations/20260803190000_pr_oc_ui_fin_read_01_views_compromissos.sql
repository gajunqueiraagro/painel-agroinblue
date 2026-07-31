-- PR-OC-UI-FIN-READ — camada SOBERANA de leitura do modelo Compromisso -> Programacao -> Parcela ->
--   Parte (materializacao) -> Titulo -> Liquidacoes. 3 views ADITIVAS, uma por grao, com todos os
--   totais calculados NO BANCO ("React nunca soma"), e o MODO da operacao exposto pela leitura.
--
--   ADITIVO: NAO altera vw_oc_obrigacoes nem vw_oc_operacao_liquidacao (consumidor unico:
--   useOperacaoLiquidacao.ts). Sem tocar tabelas/writers/RPCs. Sem migracao de dados. Sem SECURITY DEFINER.
--
--   SEGURANCA: todas security_invoker=true -> herdam a RLS das tabelas-base OC
--   (is_admin_agroinblue(auth.uid()) OR cliente_id IN get_user_cliente_ids(auth.uid())). GRANT SELECT a
--   authenticated; REVOKE anon/PUBLIC. security_barrier NAO usado: a RLS por linha das tabelas-base ja e
--   o guard (mesmo padrao das views OC atuais); barrier bloquearia pushdown de predicado sem ganho real
--   de seguranca (nao ha funcao volatil/SECURITY DEFINER expondo linhas cross-tenant nestas views).
--
--   ANTI-DUPLICACAO: agregacoes por LATERAL independentes por grao; liquidacoes SEMPRE pre-agregadas por
--   titulo antes de qualquer JOIN (padrao das views legadas) -> titulo com N liquidacoes nao infla
--   parte/compromisso. NUNCA join achatado que repita valor_compromisso por parcela/parte/liquidacao.
--
--   NAO usa origem nem origem_tipo como chave/discriminador (proveniencia, nao modo). Discriminador de
--   PARTE nova = programacao_parcela_id IS NOT NULL; PARTE legada = programacao_parcela_id IS NULL.
--
--   Requer PROTO (binbcdfbisgscrifztia). Leitura pura.

-- =====================================================================================================
-- VIEW 1 — vw_oc_compromissos_resumo (grao COMPROMISSO; ESPELHO FIEL: inclui aberto/programado/cancelado)
-- =====================================================================================================
CREATE VIEW public.vw_oc_compromissos_resumo
WITH (security_invoker = true) AS
SELECT
  c.cliente_id,
  c.operacao_id,
  c.id                       AS compromisso_id,
  c.natureza,
  c.componente,
  c.favorecido_id,
  c.plano_conta_id,
  c.lote_id,
  c.status,
  c.valor_total             AS valor_compromisso,
  prog.total_programado,
  c.valor_total - prog.total_programado                    AS saldo_a_programar,
  mat.total_materializado,
  prog.total_programado - mat.total_materializado          AS saldo_a_materializar,
  liq.total_liquidado_monetario,
  liq.total_liquidado_nao_monetario,
  liq.total_liquidado_monetario + liq.total_liquidado_nao_monetario  AS total_liquidado,
  mat.total_materializado
    - (liq.total_liquidado_monetario + liq.total_liquidado_nao_monetario)  AS saldo_financeiro,
  pa.programacao_ativa_id,
  (pa.programacao_ativa_id IS NOT NULL)                    AS tem_programacao_ativa,
  (
       (c.valor_total - prog.total_programado) < 0                    -- (a) programado > compromisso
    OR (prog.total_programado - mat.total_materializado) < 0          -- (b) materializado > programado
    OR COALESCE(div.tem_divergencia_valor, false)                    -- (c)/(d) identidade 1:1:1
    OR ( c.status = 'cancelado' AND (                                 -- (e) cancelado com residuo financeiro
           prog.total_programado <> 0
        OR mat.total_materializado <> 0
        OR (liq.total_liquidado_monetario + liq.total_liquidado_nao_monetario) <> 0 ) )
  )                                                        AS tem_divergencia
FROM public.zoo_operacao_compromissos c
-- programacao ativa (0 ou 1, por indice parcial)
LEFT JOIN LATERAL (
  SELECT pr.id AS programacao_ativa_id
    FROM public.zoo_operacao_programacoes pr
   WHERE pr.compromisso_id = c.id AND pr.status = 'ativa'
   LIMIT 1
) pa ON true
-- total_programado: parcelas (status positivo) da programacao ATIVA
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(pp.valor), 0) AS total_programado
    FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
   WHERE pr.compromisso_id = c.id
     AND pr.status = 'ativa'
     AND pp.status IN ('prevista','materializada','paga')
) prog ON true
-- total_materializado: partes ativas ancoradas em parcela deste compromisso (1 parte ativa/parcela)
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(pt.valor), 0) AS total_materializado
    FROM public.zoo_operacao_partes pt
    JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
    JOIN public.zoo_operacao_programacoes pr         ON pr.id = pp.programacao_id
   WHERE pr.compromisso_id = c.id
     AND pt.cancelada = false
     AND pt.programacao_parcela_id IS NOT NULL
) mat ON true
-- total_liquidado: liquidacoes PRE-AGREGADAS por titulo, somadas sobre as partes do compromisso
LEFT JOIN LATERAL (
  SELECT
    COALESCE(SUM(tl.liq_mon), 0) AS total_liquidado_monetario,
    COALESCE(SUM(tl.liq_nao), 0) AS total_liquidado_nao_monetario
    FROM public.zoo_operacao_partes pt
    JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
    JOIN public.zoo_operacao_programacoes pr         ON pr.id = pp.programacao_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(l.valor) FILTER (WHERE l.forma <> ALL (ARRAY['permuta','compensacao'])), 0) AS liq_mon,
        COALESCE(SUM(l.valor) FILTER (WHERE l.forma =  ANY (ARRAY['permuta','compensacao'])), 0) AS liq_nao
        FROM public.zoo_operacao_liquidacoes l
       WHERE l.financeiro_lancamento_id = pt.financeiro_lancamento_id
         AND l.estornado = false
    ) tl ON true
   WHERE pr.compromisso_id = c.id
     AND pt.cancelada = false
     AND pt.financeiro_lancamento_id IS NOT NULL
) liq ON true
-- divergencia de identidade 1:1:1 (parte.valor vs parcela.valor; titulo.valor vs parte.valor)
LEFT JOIN LATERAL (
  SELECT bool_or( pt.valor <> pp.valor OR (f.id IS NOT NULL AND f.valor <> pt.valor) ) AS tem_divergencia_valor
    FROM public.zoo_operacao_partes pt
    JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
    JOIN public.zoo_operacao_programacoes pr         ON pr.id = pp.programacao_id
    LEFT JOIN public.financeiro_lancamentos_v2 f     ON f.id = pt.financeiro_lancamento_id
   WHERE pr.compromisso_id = c.id AND pt.cancelada = false
) div ON true;

COMMENT ON VIEW public.vw_oc_compromissos_resumo IS
  'PR-OC-UI-FIN-READ: grao COMPROMISSO (espelho fiel: aberto/programado/cancelado). Totais soberanos: programado (parcelas positivas da programacao ativa), materializado (partes ativas), liquidado (mon/nao-mon, liq pre-agregada por titulo). tem_divergencia: programado>compromisso OR materializado>programado OR quebra de identidade 1:1:1 OR cancelado com residuo financeiro (programado/materializado/liquidado <> 0).';

-- =====================================================================================================
-- VIEW 2 — vw_oc_parcelas_materializacao (grao PARCELA; LEFT JOIN parte/titulo -> prevista aparece NULL)
-- =====================================================================================================
CREATE VIEW public.vw_oc_parcelas_materializacao
WITH (security_invoker = true) AS
SELECT
  pp.cliente_id,
  c.operacao_id,
  c.id                      AS compromisso_id,
  c.status                  AS compromisso_status,
  pr.id                     AS programacao_id,
  pr.status                 AS programacao_status,
  pp.id                     AS parcela_id,
  pp.sequencia,
  pp.valor,
  pp.vencimento,
  pp.conta_bancaria_id,
  pp.forma,
  pp.status,
  pt.id                     AS parte_id,
  pt.financeiro_lancamento_id AS titulo_id,
  f.status_transacao        AS titulo_status_transacao,
  f.valor                   AS titulo_valor,
  COALESCE(tl.total_liquidado_titulo, 0)                       AS total_liquidado_titulo,
  COALESCE(f.valor, 0) - COALESCE(tl.total_liquidado_titulo, 0) AS saldo_titulo,
  (pt.id IS NOT NULL)       AS materializada,
  CASE WHEN pt.id IS NOT NULL
       THEN (pt.financeiro_lancamento_id IS NOT NULL AND f.id IS NOT NULL
             AND pt.financeiro_lancamento_id = f.id)
       ELSE true END        AS vinculo_integro,
  CASE WHEN pt.id IS NOT NULL
       THEN ( pt.valor <> pp.valor
              OR (f.id IS NOT NULL AND f.valor <> pt.valor)
              OR NOT (pt.financeiro_lancamento_id IS NOT NULL AND f.id IS NOT NULL
                      AND pt.financeiro_lancamento_id = f.id) )
       ELSE false END       AS tem_divergencia
FROM public.zoo_operacao_parcelas_programacao pp
JOIN public.zoo_operacao_programacoes pr  ON pr.id = pp.programacao_id
JOIN public.zoo_operacao_compromissos c   ON c.id = pr.compromisso_id
LEFT JOIN public.zoo_operacao_partes pt   ON pt.programacao_parcela_id = pp.id AND pt.cancelada = false
LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(l.valor), 0) AS total_liquidado_titulo
    FROM public.zoo_operacao_liquidacoes l
   WHERE l.financeiro_lancamento_id = pt.financeiro_lancamento_id
     AND l.estornado = false
) tl ON true;

COMMENT ON VIEW public.vw_oc_parcelas_materializacao IS
  'PR-OC-UI-FIN-READ: grao PARCELA. LEFT JOIN parte ativa (programacao_parcela_id) + titulo + liquidado (pre-agregado por titulo). materializada=(parte ativa existe); vinculo_integro/tem_divergencia checam identidade 1:1:1.';

-- =====================================================================================================
-- VIEW 3 — vw_oc_operacao_compromissos_resumo (grao OPERACAO; rollup + MODO por evidencia positiva)
--   Totais da operacao EXCLUEM compromissos cancelados (a "foto viva" da obrigacao). tem_divergencia =
--   rollup (bool_or) da View 1.
-- =====================================================================================================
CREATE VIEW public.vw_oc_operacao_compromissos_resumo
WITH (security_invoker = true) AS
SELECT
  o.cliente_id,
  o.id                                        AS operacao_id,
  COALESCE(cr.n_compromissos, 0)              AS n_compromissos,
  COALESCE(cr.obrigacao_total, 0)             AS obrigacao_total,
  COALESCE(cr.total_programado, 0)            AS total_programado,
  COALESCE(cr.total_materializado, 0)         AS total_materializado,
  COALESCE(cr.total_liquidado, 0)             AS total_liquidado,
  COALESCE(cr.total_materializado, 0) - COALESCE(cr.total_liquidado, 0)  AS saldo_financeiro,
  (COALESCE(cr.n_compromissos, 0) > 0)        AS tem_compromissos,
  leg.tem_partes_legadas,
  CASE
    WHEN COALESCE(cr.n_compromissos,0) = 0 AND NOT leg.tem_partes_legadas THEN 'nova_vazia'
    WHEN COALESCE(cr.n_compromissos,0) > 0 AND NOT leg.tem_partes_legadas THEN 'novo_modelo'
    WHEN COALESCE(cr.n_compromissos,0) = 0 AND leg.tem_partes_legadas     THEN 'legado'
    ELSE 'misto_inconsistente'
  END                                         AS modo,
  COALESCE(cr.tem_divergencia, false)         AS tem_divergencia
FROM public.zoo_operacoes_comerciais o
-- rollup dos compromissos NAO-cancelados (foto viva); tem_divergencia por bool_or da View 1
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                                       AS n_compromissos,
    COALESCE(SUM(r.valor_compromisso)    FILTER (WHERE r.status <> 'cancelado'), 0) AS obrigacao_total,
    COALESCE(SUM(r.total_programado)     FILTER (WHERE r.status <> 'cancelado'), 0) AS total_programado,
    COALESCE(SUM(r.total_materializado)  FILTER (WHERE r.status <> 'cancelado'), 0) AS total_materializado,
    COALESCE(SUM(r.total_liquidado)      FILTER (WHERE r.status <> 'cancelado'), 0) AS total_liquidado,
    bool_or(r.tem_divergencia)                                                     AS tem_divergencia
    FROM public.vw_oc_compromissos_resumo r
   WHERE r.operacao_id = o.id
) cr ON true
-- evidencia positiva de parte legada (programacao_parcela_id IS NULL, ativa)
LEFT JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM public.zoo_operacao_partes pt
     WHERE pt.operacao_id = o.id AND pt.cancelada = false AND pt.programacao_parcela_id IS NULL
  ) AS tem_partes_legadas
) leg ON true;

COMMENT ON VIEW public.vw_oc_operacao_compromissos_resumo IS
  'PR-OC-UI-FIN-READ: grao OPERACAO. Rollup dos compromissos NAO-cancelados; modo por evidencia positiva (nova_vazia/novo_modelo/legado/misto_inconsistente): has_novo=EXISTS compromisso, has_legado=EXISTS parte ativa com programacao_parcela_id IS NULL. Cobre TODAS as operacoes (vazias => nova_vazia).';

-- =====================================================================================================
-- Grants (todas as 3): authenticated le; anon/PUBLIC sem acesso. security_invoker aplica a RLS base.
-- =====================================================================================================
REVOKE ALL ON public.vw_oc_compromissos_resumo            FROM PUBLIC, anon;
REVOKE ALL ON public.vw_oc_parcelas_materializacao        FROM PUBLIC, anon;
REVOKE ALL ON public.vw_oc_operacao_compromissos_resumo   FROM PUBLIC, anon;
GRANT SELECT ON public.vw_oc_compromissos_resumo          TO authenticated, service_role;
GRANT SELECT ON public.vw_oc_parcelas_materializacao      TO authenticated, service_role;
GRANT SELECT ON public.vw_oc_operacao_compromissos_resumo TO authenticated, service_role;

-- ROLLBACK documentado (NAO executar aqui):
--   DROP VIEW public.vw_oc_operacao_compromissos_resumo;
--   DROP VIEW public.vw_oc_parcelas_materializacao;
--   DROP VIEW public.vw_oc_compromissos_resumo;
