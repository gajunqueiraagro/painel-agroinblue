-- =====================================================================
-- PR-OC-VIEWS-CANCELADO-01
-- Duas views chamavam de MATERIALIZADO um titulo CANCELADO: derivavam
-- materializacao a partir de `zoo_operacao_partes` sem nunca consultar
-- `financeiro_lancamentos_v2.cancelado`.
--
-- Caso concreto: OC 69115ef9 (NJ). O titulo 802deece esta `cancelado =
-- true`, e a aba Financeiro exibia Materializado R$ 88.031,00 com a
-- parcela marcada como 'materializada'.
--
-- ⚠ E' o MESMO defeito conceitual que o 2360f183 corrigiu no front: a
-- PARTE guarda o vinculo e o proprio cancelamento, mas nao sabe se o
-- LANCAMENTO foi cancelado. La a UI trancava a operacao contra um titulo
-- que nao existia; aqui as views o somam. Depois de 2360f183 o modal ja
-- sabia a verdade e a Central ainda nao — as duas telas discordavam nas
-- mesmas 4 operacoes.
--
-- ⚠ `IS NOT TRUE`, NAO `= false`. A coluna e nullable, e `= false`
-- descartaria NULL em silencio — o mesmo defeito do PR-FIX-SMC-NULL-01.
-- Com `IS NOT TRUE`, NULL conta como nao-cancelado, que e' a leitura
-- conservadora correta aqui: na duvida o titulo EXISTE.
--
-- IMPACTO MEDIDO (proto, 27/08): de 23 operacoes com materializado > 0,
-- mudam 5, TODAS indo a zero. Nenhum valor sobe — a correcao so remove o
-- que nunca deveria ter entrado.
--   Agnaldo 3e75542d  237.650 -> 0     Agnaldo 9ef56df7   27.062 -> 0
--   Agnaldo b012232d   27.062 -> 0     Agnaldo f5c27aac   27.062 -> 0
--   NJ      69115ef9   88.031 -> 0
-- ⚠ Conferido antes de escrever: as CINCO tem liquidacao ZERO, entao
-- `saldo_financeiro` (= materializado - liquidado) vai a 0 e nao a
-- negativo. Se alguma tivesse liquidacao sobre titulo cancelado, o saldo
-- ficaria negativo e isso seria outro problema, nao este.
--
-- `vw_oc_operacao_compromissos_resumo` apenas agrega a primeira: herda a
-- correcao e NAO e' tocada. `vw_oc_titulos_liquidacao` ja filtrava certo.
--
-- ⚠ `security_invoker = true` DECLARADO explicitamente nas duas, em vez de
-- confiar na preservacao pelo CREATE OR REPLACE: e' o que ambas ja tem, e
-- deixa-lo implicito faria o comportamento de RLS depender de um detalhe do
-- servidor em vez de estar escrito.
-- ⚠ CREATE OR REPLACE NAO derruba a view, entao os GRANTs sobrevivem. Nao
-- ha REVOKE/GRANT aqui de proposito — reemitir ACL num PR que nao trata de
-- ACL e' como se perde o rastro de quem concedeu o que.
--
-- Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.
-- =====================================================================

-- ── 1. vw_oc_compromissos_resumo ────────────────────────────────────────
--   MUDA APENAS o LATERAL `mat`. `total_programado`, `total_liquidado` e
--   `saldo_a_programar` ficam byte a byte como estavam.
--   ⚠ Parte com `programacao_parcela_id` NOT NULL e `financeiro_lancamento_id`
--   NULL deixa de entrar, porque o JOIN passa a exigir o titulo. E' correto:
--   sem titulo nao ha materializacao.
CREATE OR REPLACE VIEW public.vw_oc_compromissos_resumo
WITH (security_invoker = true) AS
 SELECT c.cliente_id,
    c.operacao_id,
    c.id AS compromisso_id,
    c.natureza,
    c.componente,
    c.favorecido_id,
    c.plano_conta_id,
    c.lote_id,
    c.status,
    c.valor_total AS valor_compromisso,
    prog.total_programado,
    c.valor_total - prog.total_programado AS saldo_a_programar,
    mat.total_materializado,
    prog.total_programado - mat.total_materializado AS saldo_a_materializar,
    liq.total_liquidado_monetario,
    liq.total_liquidado_nao_monetario,
    liq.total_liquidado_monetario + liq.total_liquidado_nao_monetario AS total_liquidado,
    mat.total_materializado - (liq.total_liquidado_monetario + liq.total_liquidado_nao_monetario) AS saldo_financeiro,
    pa.programacao_ativa_id,
    pa.programacao_ativa_id IS NOT NULL AS tem_programacao_ativa,
    (c.valor_total - prog.total_programado) < 0::numeric OR (prog.total_programado - mat.total_materializado) < 0::numeric OR COALESCE(div.tem_divergencia_valor, false) OR c.status = 'cancelado'::text AND (prog.total_programado <> 0::numeric OR mat.total_materializado <> 0::numeric OR (liq.total_liquidado_monetario + liq.total_liquidado_nao_monetario) <> 0::numeric) AS tem_divergencia
   FROM zoo_operacao_compromissos c
     LEFT JOIN LATERAL ( SELECT pr.id AS programacao_ativa_id
           FROM zoo_operacao_programacoes pr
          WHERE pr.compromisso_id = c.id AND pr.status = 'ativa'::text
         LIMIT 1) pa ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(pp.valor), 0::numeric) AS total_programado
           FROM zoo_operacao_parcelas_programacao pp
             JOIN zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
          WHERE pr.compromisso_id = c.id AND pr.status = 'ativa'::text AND (pp.status = ANY (ARRAY['prevista'::text, 'materializada'::text, 'paga'::text]))) prog ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(pt.valor), 0::numeric) AS total_materializado
           FROM zoo_operacao_partes pt
             JOIN zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
             JOIN zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
             JOIN financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
          WHERE pr.compromisso_id = c.id AND pt.cancelada = false AND pt.programacao_parcela_id IS NOT NULL
            AND f.cancelado IS NOT TRUE) mat ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(tl.liq_mon), 0::numeric) AS total_liquidado_monetario,
            COALESCE(sum(tl.liq_nao), 0::numeric) AS total_liquidado_nao_monetario
           FROM zoo_operacao_partes pt
             JOIN zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
             JOIN zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
             LEFT JOIN LATERAL ( SELECT COALESCE(sum(l.valor) FILTER (WHERE l.forma <> ALL (ARRAY['permuta'::text, 'compensacao'::text])), 0::numeric) AS liq_mon,
                    COALESCE(sum(l.valor) FILTER (WHERE l.forma = ANY (ARRAY['permuta'::text, 'compensacao'::text])), 0::numeric) AS liq_nao
                   FROM zoo_operacao_liquidacoes l
                  WHERE l.financeiro_lancamento_id = pt.financeiro_lancamento_id AND l.estornado = false) tl ON true
          WHERE pr.compromisso_id = c.id AND pt.cancelada = false AND pt.financeiro_lancamento_id IS NOT NULL) liq ON true
     LEFT JOIN LATERAL ( SELECT bool_or(pt.valor <> pp.valor OR f.id IS NOT NULL AND f.valor <> pt.valor) AS tem_divergencia_valor
           FROM zoo_operacao_partes pt
             JOIN zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
             JOIN zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
             LEFT JOIN financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
          WHERE pr.compromisso_id = c.id AND pt.cancelada = false) div ON true;

-- ── 2. vw_oc_parcelas_materializacao ────────────────────────────────────
--   O join com `financeiro_lancamentos_v2` JA EXISTE; nao se acrescenta join,
--   so predicado. `titulo_id`, `titulo_status_transacao` e `titulo_valor`
--   PERMANECEM: com titulo cancelado eles continuam sendo o que responde
--   "materializou e depois cancelou" contra "nunca materializou".
CREATE OR REPLACE VIEW public.vw_oc_parcelas_materializacao
WITH (security_invoker = true) AS
 SELECT pp.cliente_id,
    c.operacao_id,
    c.id AS compromisso_id,
    c.status AS compromisso_status,
    pr.id AS programacao_id,
    pr.status AS programacao_status,
    pp.id AS parcela_id,
    pp.sequencia,
    pp.valor,
    pp.vencimento,
    pp.conta_bancaria_id,
    pp.forma,
    pp.status,
    pt.id AS parte_id,
    pt.financeiro_lancamento_id AS titulo_id,
    f.status_transacao AS titulo_status_transacao,
    f.valor AS titulo_valor,
    COALESCE(tl.total_liquidado_titulo, 0::numeric) AS total_liquidado_titulo,
    COALESCE(f.valor, 0::numeric) - COALESCE(tl.total_liquidado_titulo, 0::numeric) AS saldo_titulo,
    pt.id IS NOT NULL AND f.id IS NOT NULL AND f.cancelado IS NOT TRUE AS materializada,
        CASE
            WHEN pt.id IS NOT NULL THEN pt.financeiro_lancamento_id IS NOT NULL AND f.id IS NOT NULL AND pt.financeiro_lancamento_id = f.id AND f.cancelado IS NOT TRUE
            ELSE true
        END AS vinculo_integro,
        CASE
            WHEN pt.id IS NOT NULL THEN pt.valor <> pp.valor OR f.id IS NOT NULL AND f.valor <> pt.valor OR NOT (pt.financeiro_lancamento_id IS NOT NULL AND f.id IS NOT NULL AND pt.financeiro_lancamento_id = f.id)
            ELSE false
        END AS tem_divergencia
   FROM zoo_operacao_parcelas_programacao pp
     JOIN zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
     JOIN zoo_operacao_compromissos c ON c.id = pr.compromisso_id
     LEFT JOIN zoo_operacao_partes pt ON pt.programacao_parcela_id = pp.id AND pt.cancelada = false
     LEFT JOIN financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(l.valor), 0::numeric) AS total_liquidado_titulo
           FROM zoo_operacao_liquidacoes l
          WHERE l.financeiro_lancamento_id = pt.financeiro_lancamento_id AND l.estornado = false) tl ON true;

-- ── 3. Conferencia pos-aplicacao (rodar a mao, nao faz parte do DDL) ─────
--   SELECT c.relname, c.reloptions,
--          has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relname IN ('vw_oc_compromissos_resumo','vw_oc_parcelas_materializacao');
--   Esperado nas duas: {security_invoker=true} e auth_select = true.
