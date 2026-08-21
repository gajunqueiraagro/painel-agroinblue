-- 20260821140000_pr_pilares_p1_filtro_01.sql
-- PR-PILARES-P1-FILTRO-01 — o P1 para de contar card de pasto INATIVO e de DIVERGENCIA.
--
-- CAUSA-RAIZ (FASE 0, proto 2026-08-21).
-- get_status_pilares_fechamento contava fechamento_pastos SEM FILTRO NENHUM:
--     FROM fechamento_pastos
--    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes;
-- Card de pasto desativado e card do pasto sintetico de divergencia entravam na conta
-- como se fossem pasto real do mes.
--
-- A TELA JA FAZIA CERTO, E AS DUAS DIVERGIAM. src/pages/FechamentoTab.tsx:188-194 monta
-- a regua de meses com
--     .select('ano_mes, status, pastos!inner(ativo, tipo_uso)')
--     .eq('pastos.ativo', true)
--     .neq('pastos.tipo_uso', 'divergencia')
-- A mesma regra escrita em dois lugares, com resultados opostos. Aqui a FUNCAO se
-- alinha a TELA, e nao o contrario: a tela e que estava certa.
--
-- CASO REPRODUZIDO. Faz. Sta. Luzia, 2026-07: 14 cards 'fechado' de pasto ativo mais 1
-- card 'rascunho' do pasto "⚠️ Divergência do Campeiro" (ativo=false E
-- tipo_uso='divergencia' — os dois criterios). A funcao contava 15/14 e dizia
-- 'pendente'; a tela dizia "Mês fechado". O modal da faixa mandava o operador para uma
-- tela que afirmava o contrario.
--
-- IMPACTO MEDIDO nos 710 meses de fechamento_pastos:
--     falsos PENDENTES ....  9   (a funcao dizia pendente; estava fechado)
--     falsos OFICIAIS  .... 24   (a funcao dizia oficial; NAO estava fechado)
--     coincidem ........... 677
--     oficiais: 699 -> 684
--
-- OS 24 FALSOS OFICIAIS SAO TODOS DA MESMA FAZENDA, e a razao NAO e um card sujo
-- perdido entre pastos bons. Faz. Bom Retiro, 2022-01 a 2023-12, um card por mes, todos
-- do pasto "Geral" — que HOJE esta ativo=false. A fazenda tem hoje um unico pasto ativo
-- ("Eucalipto"), sem card naqueles meses. Filtrados, esses 24 meses ficam com ZERO
-- pasto elegivel, e a regra `_total_pastos > 0` os torna 'pendente'.
--
-- ISSO E UMA PROPRIEDADE RETROATIVA, e esta dita aqui de proposito: `p.ativo` e o estado
-- de HOJE, nao o da epoca do fechamento. Desativar um pasto reescreve o status de todo
-- mes em que ele era o unico pasto da fazenda. A tela tem exatamente a mesma
-- propriedade — ela tambem filtra por p.ativo —, entao o efeito e CONSISTENCIA: as duas
-- passam a dizer a mesma coisa. Mas e escolha, nao detalhe.
--
-- IS DISTINCT FROM, e nao <>. tipo_uso e text NULLABLE; `<> 'divergencia'` daria NULL
-- para tipo_uso NULL e a linha sairia da conta por engano. Medido: hoje ha 0 pastos com
-- tipo_uso NULL, entao a diferenca e latente — mas a forma correta e a que sobrevive ao
-- primeiro NULL. (O .neq() do PostgREST na tela tem a mesma armadilha; nao e escopo
-- deste PR.)
--
-- ESCOPO. Somente a query do P1. A regra de decisao do P1 nao muda; P2 nao muda; P3, P4
-- e P5 seguem 'nao_implementado'. As seis chaves do jsonb e seus nomes ficam identicos.
-- Nome, assinatura, retorno, LANGUAGE, STABLE, SECURITY DEFINER, search_path e owner
-- (postgres) replicados de pg_get_functiondef.
--
-- NENHUM DADO E ALTERADO. Nenhum card e apagado, fechado ou reaberto. Esta migration
-- muda apenas como o P1 e LIDO. Os cards de pasto inativo e de divergencia continuam
-- existindo — eles tem razao de ser; o defeito era conta-los como pasto do mes.
--
-- URGENCIA. A regua de meses da Visao Geral (frente em desenho) vai colorir 12 meses x N
-- fazendas com esta funcao. Corrigir depois seria pintar o erro em escala, na tela
-- principal.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? Sim: a regra de "pasto que conta no mes" ja existe na tela.
--   (b) Reutilizar? Sim: a funcao passa a espelhar a regra da tela, em vez de manter uma
--       segunda definicao divergente.
--   (c) Fonte soberana? public.pastos para ativo/tipo_uso, como na tela.
--   (d) Segunda forma? Nao — este PR REDUZ de duas formas para uma.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Reduz. Fica aberta a duplicacao da regra em dois lugares (SQL e
--       PostgREST): unifica-la exigiria a tela chamar a funcao, que e frente propria.
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

      IF _total_pastos > 0 AND _pastos_fechados = _total_pastos THEN
        _p1_status := 'oficial';
      ELSE
        _p1_status := 'pendente';
      END IF;

      -- P2 — INTOCADO.
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
        -- ocupar a tela com 'pendente' — ver PR-PILARES-CALCULO-01.
        'p3_financeiro_caixa',      jsonb_build_object('status', 'nao_implementado'),
        'p4_competencia',           jsonb_build_object('status', 'nao_implementado'),
        'p5_economico_consolidado', jsonb_build_object('status', 'nao_implementado')
      );
    END;
    $function$;

COMMENT ON FUNCTION public.get_status_pilares_fechamento(uuid, text) IS
  'Status dos pilares de fechamento. CALCULADOS: P1 (fechamento_pastos, contando APENAS pasto ativo e tipo_uso distinto de divergencia — espelha FechamentoTab.tsx:188-194; sem esse filtro a funcao divergia da tela em 33 dos 710 meses medidos em 2026-08-21: 9 falsos pendentes e 24 falsos oficiais) e P2 (valor_rebanho_fechamento com status fechado). DECLARADOS nao_implementado: P3 (regra definida, campos de conferencia bancaria inexistentes), P4 (competencia e propriedade do lancamento, nao etapa de fechamento) e P5 (derivado, depende do P3). Vocabulario: oficial | pendente | nao_implementado. Atencao: pastos.ativo e o estado de HOJE, nao o da epoca — desativar um pasto reescreve o status dos meses em que ele era o unico da fazenda, exatamente como na tela.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter REINTRODUZ os 33 meses errados: 9 que a funcao diz pendente estando fechados,
-- e 24 que ela diz oficial sem estarem — estes ultimos afirmam fechamento sobre mes que
-- nao fechou, na tela principal.
-- Corpo capturado por pg_get_functiondef em 2026-08-21, md5 b12c883e0ce41340d8c9f255b8a0eda0.
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
--       -- P1 — INTOCADO em relacao a versao anterior.
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
--       -- P2 — era a constante 'pendente'. Agora le a fonte que ja existia.
--       IF EXISTS (
--         SELECT 1 FROM valor_rebanho_fechamento
--          WHERE fazenda_id = _fazenda_id
--            AND ano_mes    = _ano_mes
--            AND status     = 'fechado'
--       ) THEN
--         _p2_status := 'oficial';
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
