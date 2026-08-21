-- 20260821170000_pr_pilares_nao_iniciado.sql
-- PR-PILARES-NAO-INICIADO-01 — mes sem card ganha estado proprio.
--
-- CAUSA-RAIZ (FASE 0, proto 2026-08-21).
-- Quando a fazenda nao tem NENHUM card de fechamento no mes, os dois pilares davam
-- respostas DIFERENTES para o mesmo fato:
--     P1 -> 'pendente'       (a regra caia no ELSE de _total_pastos > 0)
--     P2 -> 'nao_aplicavel'  (a regra caia em _pastos_pecuaria = 0)
-- Medido em Administrativo e Faz. Bom Retiro, 2026-03: pendente x nao_aplicavel na mesma
-- celula. Nenhum dos dois esta certo. Nao e pendencia — ninguem abriu nada. Nao e "nao
-- se aplica" — nao se SABE se aplica, porque nao ha dado. E mes que NAO COMECOU.
--
-- URGENCIA. A regua de meses da Visao Geral vai pintar 12 meses x todas as fazendas.
-- Medido: 149 de 228 celulas de 2026 nao tem card nenhum. Todas ficariam ambar por causa
-- do P1, indistinguiveis de trabalho pendente de verdade. Na regua, "nao fizemos ainda" e
-- "nao ha o que fazer" pedem acoes diferentes e precisam de cores diferentes.
--
-- A CONTAGEM NOVA E SEM FILTRO, E ISSO E DELIBERADO.
--     SELECT count(*) FROM fechamento_pastos WHERE fazenda_id = _ AND ano_mes = _;
-- Nao contradiz 20260821140000: sao DUAS PERGUNTAS DIFERENTES.
--   "alguem abriu este mes?"  -> qualquer card serve como prova, inclusive de pasto
--                               inativo ou de divergencia. Sem filtro.
--   "o mes esta fechado?"     -> so pasto ativo e nao-divergencia conta. Com filtro.
-- Confundir as duas foi o que produziu o defeito original.
--
-- O CASO BOM RETIRO CONTINUA 'pendente', e isso e teste, nao detalhe. Os 24 meses de
-- 2022-2023 tem card (medido: 24 meses com card), mas todos de pasto hoje inativo, entao
-- _total_pastos = 0 apos o filtro. Abriram o mes: nao e 'nao_iniciado'. Se a contagem
-- nova tivesse filtro, esses 24 mudariam de estado por engano.
--
-- ANOMALIA VERIFICADA E INEXISTENTE. 'nao_iniciado' vem ANTES do ramo de fechamento
-- gravado no P2, o que em tese poderia esconder um valor_rebanho_fechamento de mes sem
-- card. Medido: ZERO registros de valor_rebanho_fechamento sem card correspondente — nem
-- fechados, nem em qualquer status. A precedencia "fechamento vence derivacao", firmada
-- em 20260821150000, segue intacta na pratica; 'nao_iniciado' passa na frente apenas
-- porque sem card nao ha mes sobre o qual afirmar coisa alguma.
--
-- IMPACTO MEDIDO — 149 celulas de 2026 mudam nos DOIS pilares:
--     P1: 'pendente'      -> 'nao_iniciado'   149
--     P2: 'nao_aplicavel' -> 'nao_iniciado'   149
-- Nenhuma celula COM card muda de estado. Nenhum mes deixa de ser 'oficial'.
--
-- ESCOPO. Um ramo novo no inicio de cada pilar. O filtro de ativo/divergencia do P1 e a
-- contagem de _pastos_pecuaria do P2 ficam INTOCADOS — so ganham uma pergunta antes.
-- P3, P4 e P5 seguem 'nao_implementado'. As seis chaves do jsonb ficam identicas. Nome,
-- assinatura, retorno, LANGUAGE, STABLE, SECURITY DEFINER, search_path e owner
-- (postgres) replicados de pg_get_functiondef. Base: md5 5afd47e8c8a8b7640ecf65e4badc9c9c.
--
-- NENHUM DADO E ALTERADO. Nenhum card criado, fechado ou apagado.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? O estado nao existia — o vocabulario tinha 'pendente' e
--       'nao_aplicavel' e nenhum dos dois descrevia "mes nao comecou".
--   (b) Reutilizar? Sim: mesma funcao, mesma tabela, um ramo a mais.
--   (c) Fonte soberana? A existencia de card em fechamento_pastos.
--   (d) Segunda forma? Nao.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Reduz: acaba com a contradicao entre P1 e P2 na mesma celula. Fica
--       aberta a coacao de useStatusPilaresLote.lerStatus, que ainda dobra
--       'nao_iniciado' em 'pendente' — PR seguinte, junto com a regua.
--
-- Constituicao n. 2, Art. 19 — a regua de meses e superficie analitica. O criterio
-- atendido e o de NAO APRESENTAR COMO PENDENCIA o que nao foi sequer iniciado: 149
-- celulas deixam de pedir acao que ninguem deve tomar.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.

CREATE OR REPLACE FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      _cards_no_mes    int;
      _total_pastos    int;
      _pastos_fechados int;
      _pastos_pecuaria int;
      _p1_status       text;
      _p2_status       text;
    BEGIN
      -- "Alguem abriu este mes?" — SEM FILTRO, de proposito. Card de pasto inativo ou de
      -- divergencia nao conta para dizer se o mes FECHOU, mas e prova de que o mes foi
      -- ABERTO. Sao perguntas diferentes; ver cabecalho.
      SELECT count(*)
        INTO _cards_no_mes
        FROM fechamento_pastos
       WHERE fazenda_id = _fazenda_id
         AND ano_mes    = _ano_mes;

      -- P1 — conta APENAS pasto ativo e nao-divergencia, espelhando
      -- FechamentoTab.tsx:188-194. Sem o JOIN, card de pasto desativado e o card
      -- sintetico de divergencia entravam na conta como pasto real do mes.
      SELECT
        count(*),
        count(*) FILTER (WHERE fp.status = 'fechado')
      INTO _total_pastos, _pastos_fechados
      FROM fechamento_pastos fp
      JOIN pastos p ON p.id = fp.pasto_id
      WHERE fp.fazenda_id = _fazenda_id
        AND fp.ano_mes    = _ano_mes
        AND p.ativo
        AND p.tipo_uso IS DISTINCT FROM 'divergencia';

      IF _cards_no_mes = 0 THEN
        _p1_status := 'nao_iniciado';
      ELSIF _total_pastos > 0 AND _pastos_fechados = _total_pastos THEN
        _p1_status := 'oficial';
      ELSE
        -- Inclui o caso "abriram o mes, mas todo card e de pasto hoje inativo":
        -- _total_pastos = 0 apos o filtro, e ainda assim NAO e 'nao_iniciado'.
        _p1_status := 'pendente';
      END IF;

      -- P2 — havia rebanho a fechar NESTE MES? Espelha SET_EXIGE_REBANHO de
      -- src/lib/pastos/tiposUso.ts: cria, recria e engorda. 'vedado' e
      -- 'reforma_pecuaria' sao pecuaria SEM GADO no mes e ficam de fora.
      SELECT count(*)
        INTO _pastos_pecuaria
        FROM fechamento_pastos fp
        JOIN pastos p ON p.id = fp.pasto_id
       WHERE fp.fazenda_id = _fazenda_id
         AND fp.ano_mes    = _ano_mes
         AND p.ativo
         AND coalesce(fp.tipo_uso_mes, p.tipo_uso) IN ('cria','recria','engorda');

      -- 'nao_iniciado' na frente porque sem card nao ha mes sobre o qual afirmar nada.
      -- Depois dele, a ORDEM DELIBERADA de 20260821150000 segue intacta: o FECHAMENTO
      -- decide antes da derivacao. Fechamento gravado e PROVA de que houve rebanho a
      -- fechar, e prova vence derivacao — _pastos_pecuaria e contado sobre p.ativo, o
      -- estado de HOJE.
      IF _cards_no_mes = 0 THEN
        _p2_status := 'nao_iniciado';
      ELSIF EXISTS (
        SELECT 1 FROM valor_rebanho_fechamento
         WHERE fazenda_id = _fazenda_id
           AND ano_mes    = _ano_mes
           AND status     = 'fechado'
      ) THEN
        _p2_status := 'oficial';
      ELSIF _pastos_pecuaria = 0 THEN
        _p2_status := 'nao_aplicavel';
      ELSE
        _p2_status := 'pendente';
      END IF;

      RETURN jsonb_build_object(
        'fazenda_id',               _fazenda_id,
        'ano_mes',                  _ano_mes,
        'p1_mapa_pastos',           jsonb_build_object('status', _p1_status),
        'p2_valor_rebanho',         jsonb_build_object('status', _p2_status),
        -- P3/P4/P5: nao ha calculo. Declarar a ausencia e' mais honesto do que
        -- ocupar a tela com 'pendente' — ver PR-PILARES-CALCULO-01.
        'p3_financeiro_caixa',      jsonb_build_object('status', 'nao_implementado'),
        'p4_competencia',           jsonb_build_object('status', 'nao_implementado'),
        'p5_economico_consolidado', jsonb_build_object('status', 'nao_implementado')
      );
    END;
    $function$;

COMMENT ON FUNCTION public.get_status_pilares_fechamento(uuid, text) IS
  'Status dos pilares de fechamento. P1 (4 estados): nao_iniciado quando nao ha NENHUM card do mes (contagem SEM filtro — qualquer card prova que o mes foi aberto); senao oficial quando todos os cards de pasto ativo e nao-divergencia estao fechados (espelha FechamentoTab.tsx:188-194); senao pendente. P2 (4 estados): nao_iniciado quando nao ha card; senao oficial se existe valor_rebanho_fechamento fechado — fechamento gravado e prova e prevalece sobre derivacao; senao nao_aplicavel quando o mes nao tem pasto de pecuaria que exija rebanho (coalesce(tipo_uso_mes, tipo_uso) em cria/recria/engorda, espelhando SET_EXIGE_REBANHO de src/lib/pastos/tiposUso.ts); senao pendente. NAO consulta fazendas.tem_pecuaria: campo manual, sem trigger, erra nos dois sentidos. P3, P4 e P5: nao_implementado. Vocabulario: oficial | pendente | nao_aplicavel | nao_iniciado | nao_implementado. Atencao: pastos.ativo e o estado de HOJE, nao o da epoca.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter devolve a CONTRADICAO: nas 149 celulas de 2026 sem card, o P1 volta a dizer
-- 'pendente' e o P2 'nao_aplicavel' — dois nomes para o mesmo fato, e a regua volta a
-- pintar de ambar mes que ninguem comecou.
-- Corpo capturado por pg_get_functiondef em 2026-08-21, md5 5afd47e8c8a8b7640ecf65e4badc9c9c.
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
--       _pastos_pecuaria int;
--       _p1_status       text;
--       _p2_status       text;
--     BEGIN
--       SELECT
--         count(*),
--         count(*) FILTER (WHERE fp.status = 'fechado')
--       INTO _total_pastos, _pastos_fechados
--       FROM fechamento_pastos fp
--       JOIN pastos p ON p.id = fp.pasto_id
--       WHERE fp.fazenda_id = _fazenda_id
--         AND fp.ano_mes    = _ano_mes
--         AND p.ativo
--         AND p.tipo_uso IS DISTINCT FROM 'divergencia';
--
--       IF _total_pastos > 0 AND _pastos_fechados = _total_pastos THEN
--         _p1_status := 'oficial';
--       ELSE
--         _p1_status := 'pendente';
--       END IF;
--
--       SELECT count(*)
--         INTO _pastos_pecuaria
--         FROM fechamento_pastos fp
--         JOIN pastos p ON p.id = fp.pasto_id
--        WHERE fp.fazenda_id = _fazenda_id
--          AND fp.ano_mes    = _ano_mes
--          AND p.ativo
--          AND coalesce(fp.tipo_uso_mes, p.tipo_uso) IN ('cria','recria','engorda');
--
--       IF EXISTS (
--         SELECT 1 FROM valor_rebanho_fechamento
--          WHERE fazenda_id = _fazenda_id
--            AND ano_mes    = _ano_mes
--            AND status     = 'fechado'
--       ) THEN
--         _p2_status := 'oficial';
--       ELSIF _pastos_pecuaria = 0 THEN
--         _p2_status := 'nao_aplicavel';
--       ELSE
--         _p2_status := 'pendente';
--       END IF;
--
--       RETURN jsonb_build_object(
--         'fazenda_id',               _fazenda_id,
--         'ano_mes',                  _ano_mes,
--         'p1_mapa_pastos',           jsonb_build_object('status', _p1_status),
--         'p2_valor_rebanho',         jsonb_build_object('status', _p2_status),
--         'p3_financeiro_caixa',      jsonb_build_object('status', 'nao_implementado'),
--         'p4_competencia',           jsonb_build_object('status', 'nao_implementado'),
--         'p5_economico_consolidado', jsonb_build_object('status', 'nao_implementado')
--       );
--     END;
--     $function$;
-- ================================================================================================
