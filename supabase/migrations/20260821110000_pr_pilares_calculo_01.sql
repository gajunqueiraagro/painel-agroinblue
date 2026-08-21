-- 20260821110000_pr_pilares_calculo_01.sql
-- PR-PILARES-CALCULO-01 — os cinco pilares param de mentir.
--
-- CAUSA-RAIZ (FASE 0, proto 2026-08-21).
-- public.get_status_pilares_fechamento(_fazenda_id, _ano_mes) calculava UM pilar.
-- Os outros quatro eram literais fixos no corpo da funcao:
--     _p2_status := 'pendente';                                    -- constante
--     'p3_financeiro_caixa',      jsonb_build_object('status','pendente')
--     'p4_competencia',           jsonb_build_object('status','pendente','modo_transitorio',true)
--     'p5_economico_consolidado', jsonb_build_object('status','pendente')
-- P2, P3, P4 e P5 devolviam 'pendente' para QUALQUER fazenda e QUALQUER mes, para
-- sempre, sem consultar nada. So o P1 era real.
--
-- O P2 TINHA DADO COMPLETO E ERA IGNORADO. Medido em 21/08:
--     valor_rebanho_fechamento          650 linhas, status 'fechado', 11 fazendas,
--                                       2020-01 a 2026-07
--     valor_rebanho_realizado_validado  650 linhas, status 'validado', mesma cobertura
-- O trigger guard_fechamento_pastos_snapshot ja consultava as duas para barrar
-- alteracao de pasto em mes com P2 fechado. A informacao existia; a funcao e' que nao
-- olhava.
--
-- O QUE MUDA
--   P1  intocado, byte a byte: conta fechamento_pastos do mes e compara fechados com
--       total. 'oficial' se total > 0 E fechados = total; 'pendente' caso contrario.
--   P2  passa a ser CALCULADO: 'oficial' quando existe valor_rebanho_fechamento com
--       status 'fechado' para a fazenda e o mes. ano_mes e status sao TEXT nas duas
--       pontas — sem cast, sem enum. cliente_id e' nullable e NAO entra no filtro.
--   P3, P4, P5  passam a declarar 'nao_implementado'.
--
-- POR QUE 'nao_implementado' E NAO 'pendente' NEM 'bloqueado'
--   'pendente' diz ao operador que HA algo a fazer, e nao ha: nao existe a tela.
--   'bloqueado' diz que basta destravar uma dependencia, e tambem nao e' o caso.
--   Pilar sem calculo real declara-se nao implementado. Nunca inventar, nunca
--   aproximar — aproximacao e' ruido com aparencia de informacao.
--
--   P3 tem a REGRA definida (o mes fecha quando o saldo do sistema bate com o saldo
--      real conferido no banco, na data declarada pelo operador), mas exige campos que
--      nao existem: saldo declarado, data da posicao, quem conferiu e quando. Medido:
--      zero colunas com conferido/declarado/posicao/real em
--      financeiro_saldos_bancarios_v2. Aproximar por status_mes (76 de 4.691 registros)
--      foi recusado explicitamente. Frente propria.
--   P4 competencia e' propriedade do LANCAMENTO, nao etapa de fechamento. Fica no
--      contrato para decisao futura, declarado em vez de mentir.
--   P5 e' derivado (oficial quando os anteriores sao oficiais), mas dois insumos nao
--      existem. Quando o P3 existir, o P5 vira derivado real.
--
--   'modo_transitorio' SAI do P4: afirmava transitoriedade de um valor que era
--   constante — o campo dizia "isto vai mudar" sobre algo que nunca mudava.
--
-- DRIFT DE VOCABULARIO, corrigido no front no mesmo PR. A funcao emite
-- 'oficial'|'pendente'|'nao_implementado'; src/hooks/useStatusPilares.ts aceitava
-- 'oficial'|'provisorio'|'bloqueado' e convertia o desconhecido em 'provisorio'
-- silenciosamente — a unica palavra em comum era 'oficial'.
--
-- ESCOPO. Somente o CORPO da funcao. Nome, assinatura, tipo de retorno, LANGUAGE,
-- STABLE, SECURITY DEFINER, search_path, owner e ACL ficam identicos. As SEIS chaves
-- do jsonb e seus nomes ficam identicos.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? Sim: a propria funcao, desde a criacao dos pilares.
--   (b) Reutilizar? Sim: CREATE OR REPLACE, sem funcao nova e sem tabela nova.
--   (c) Fonte soberana? valor_rebanho_fechamento para o P2 — a mesma que o trigger
--       guard_fechamento_pastos_snapshot ja trata como soberana.
--   (d) Segunda forma? Nao. Um unico ponto de verdade para o status dos pilares.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Reduz: elimina quatro constantes disfarcadas de calculo. Deixa
--       DECLARADO o que falta (P3 e P5), em vez de escondido atras de 'pendente'.
--
-- Constituicao n. 2, Art. 19 — esta funcao alimenta superficie analitica (o bloco de
-- pilares do Painel do Consultor e o heatmap de auditoria). O criterio atendido aqui e'
-- o de NAO APRESENTAR COMO ANALISE o que nao foi calculado: tres dos cinco pilares
-- passam a dizer que nao existem, em vez de ocupar a tela com um estado inventado.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.

CREATE OR REPLACE FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      _total_pastos    int;
      _pastos_fechados int;
      _p1_status       text;
      _p2_status       text;
    BEGIN
      -- P1 — INTOCADO em relacao a versao anterior.
      SELECT
        count(*),
        count(*) FILTER (WHERE status = 'fechado')
      INTO _total_pastos, _pastos_fechados
      FROM fechamento_pastos
      WHERE fazenda_id = _fazenda_id
        AND ano_mes    = _ano_mes;

      IF _total_pastos > 0 AND _pastos_fechados = _total_pastos THEN
        _p1_status := 'oficial';
      ELSE
        _p1_status := 'pendente';
      END IF;

      -- P2 — era a constante 'pendente'. Agora le a fonte que ja existia.
      IF EXISTS (
        SELECT 1 FROM valor_rebanho_fechamento
         WHERE fazenda_id = _fazenda_id
           AND ano_mes    = _ano_mes
           AND status     = 'fechado'
      ) THEN
        _p2_status := 'oficial';
      ELSE
        _p2_status := 'pendente';
      END IF;

      RETURN jsonb_build_object(
        'fazenda_id',               _fazenda_id,
        'ano_mes',                  _ano_mes,
        'p1_mapa_pastos',           jsonb_build_object('status', _p1_status),
        'p2_valor_rebanho',         jsonb_build_object('status', _p2_status),
        -- P3/P4/P5: nao ha calculo. Declarar a ausencia e' mais honesto do que
        -- ocupar a tela com 'pendente' — ver cabecalho.
        'p3_financeiro_caixa',      jsonb_build_object('status', 'nao_implementado'),
        'p4_competencia',           jsonb_build_object('status', 'nao_implementado'),
        'p5_economico_consolidado', jsonb_build_object('status', 'nao_implementado')
      );
    END;
    $function$;

COMMENT ON FUNCTION public.get_status_pilares_fechamento(uuid, text) IS
  'Status dos pilares de fechamento. CALCULADOS: P1 (fechamento_pastos: oficial quando todos os cards do mes estao fechados) e P2 (valor_rebanho_fechamento com status fechado). DECLARADOS nao_implementado: P3 (regra definida, campos de conferencia bancaria inexistentes), P4 (competencia e propriedade do lancamento, nao etapa de fechamento) e P5 (derivado, depende do P3). Vocabulario: oficial | pendente | nao_implementado. Decisao de produto de 2026-08-21 (PR-PILARES-CALCULO-01): pilar sem calculo real declara-se nao implementado; nunca inventar nem aproximar.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter REINTRODUZ o defeito: P2 volta a mentir 'pendente' com 650 fechamentos
-- gravados no banco, e P3/P4/P5 voltam a ocupar a tela com pendencia inexistente.
-- Corpo capturado por pg_get_functiondef em 2026-08-21, antes da substituicao.
-- ------------------------------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
--     DECLARE
--       _total_pastos    int;
--       _pastos_fechados int;
--       _p1_status       text;
--       _p2_status       text;
--     BEGIN
--       SELECT
--         count(*),
--         count(*) FILTER (WHERE status = 'fechado')
--       INTO _total_pastos, _pastos_fechados
--       FROM fechamento_pastos
--       WHERE fazenda_id = _fazenda_id
--         AND ano_mes    = _ano_mes;
--
--       IF _total_pastos > 0 AND _pastos_fechados = _total_pastos THEN
--         _p1_status := 'oficial';
--       ELSE
--         _p1_status := 'pendente';
--       END IF;
--
--       _p2_status := 'pendente';
--
--       RETURN jsonb_build_object(
--         'fazenda_id',               _fazenda_id,
--         'ano_mes',                  _ano_mes,
--         'p1_mapa_pastos',           jsonb_build_object('status', _p1_status),
--         'p2_valor_rebanho',         jsonb_build_object('status', _p2_status),
--         'p3_financeiro_caixa',      jsonb_build_object('status', 'pendente'),
--         'p4_competencia',           jsonb_build_object('status', 'pendente', 'modo_transitorio', true),
--         'p5_economico_consolidado', jsonb_build_object('status', 'pendente')
--       );
--     END;
--     $function$;
--
-- COMMENT ON FUNCTION public.get_status_pilares_fechamento(uuid, text) IS NULL;
-- ================================================================================================
