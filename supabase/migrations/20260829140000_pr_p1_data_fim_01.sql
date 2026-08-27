-- PR-P1-DATA-FIM-01 — o P1 deixa de exigir pasto que ja saiu da fazenda.
--
--   O DEFEITO: `get_status_pilares_fechamento` conta os pastos do mes filtrando por
--   `p.ativo` e NUNCA olha `data_fim`. Como `ativo` responde "o cadastro existe?" e nao
--   "estava na fazenda naquele mes?", pasto encerrado seguia sendo exigido para sempre:
--   o mes nunca fechava, e nao havia como fechar pela tela, porque a tela ja nao mostra
--   esses cards. O cadastro estava CORRETO — o defeito era da funcao.
--
--   Caso medido: Faz. Pureza (NJ). IND.05 e IND.06 foram desmembrados para o Retiro com
--   transicao perfeita — fim 31/05/2025 na Pureza, inicio 01/06/2025 no Retiro, sem
--   sobreposicao. Mesmo assim continuavam na conta da Pureza, em rascunho, travando o mes.
--
--   A REGRA: o pasto conta no mes quando esteve vigente em ALGUM DIA dele —
--       (data_inicio IS NULL OR data_inicio <= ultimo dia do mes)
--   AND (data_fim    IS NULL OR data_fim    >= primeiro dia do mes)
--   NULL em qualquer ponta e' SEM LIMITE naquela direcao, nao ausencia de dado: pasto
--   sem data_fim segue vigente, e e' por isso que a esmagadora maioria nao muda.
--
--   ⚠ O `_cards_no_mes` NAO MUDA. Ele responde "alguem abriu este mes?" e e'
--   deliberadamente sem filtro: card de pasto encerrado nao serve para dizer se o mes
--   FECHOU, mas continua sendo prova de que o mes foi ABERTO. Sao perguntas diferentes,
--   e a razao registrada no corpo continua de pe.
--
--   ⚠ O P2 USA A MESMA CONTAGEM E NAO FOI ALTERADO — decisao consciente, medida:
--   `_pastos_pecuaria` tambem filtra so por `p.ativo`, entao herda o mesmo vicio. Mas
--   ele apenas escolhe entre 'nao_aplicavel' e 'pendente', e nao porteia nada: quem
--   libera o fechamento do Valor do Rebanho e' `can_close_valor_rebanho`, que le
--   EXCLUSIVAMENTE `p1_mapa_pastos`. Aplicar a regra tambem ao P2 nao mudaria UMA linha
--   sequer hoje (medido: 0 de 741 combinacoes fazenda-mes). Fica como vicio latente
--   registrado, para frente propria, em vez de mudanca sem efeito neste PR.
--
--   IMPACTO MEDIDO, varredura completa (741 combinacoes fazenda-mes): TRES mudam, todas
--   na Faz. Pureza — 2026-01, 2026-02 e 2026-03, de 'pendente' para 'oficial' (82 -> 80
--   pastos contados, 80 fechados). Nenhuma regride. Os 14 cards orfaos de cada pasto
--   permanecem gravados: sao historico, e nada aqui os apaga ou fecha.
--
--   Corpo extraido do proto vigente (pg_get_functiondef) e conferido por hash antes da
--   edicao — md5 84c189584b36258a56f67bb25915dbe9, 3630 bytes.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

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
      _mes_ini         date;
      _mes_fim         date;
    BEGIN
      -- Limites do mes, calculados uma vez. `_ano_mes` e 'YYYY-MM'.
      _mes_ini := to_date(_ano_mes || '-01', 'YYYY-MM-DD');
      _mes_fim := (_mes_ini + interval '1 month - 1 day')::date;

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
      -- PR-P1-DATA-FIM-01: e VIGENTE no mes. `ativo` diz que o cadastro existe hoje;
      -- so a vigencia diz se ele estava na fazenda NAQUELE mes. Sem isto, pasto
      -- desmembrado era exigido para sempre e o mes nunca fechava.
      SELECT
        count(*),
        count(*) FILTER (WHERE fp.status = 'fechado')
      INTO _total_pastos, _pastos_fechados
      FROM fechamento_pastos fp
      JOIN pastos p ON p.id = fp.pasto_id
      WHERE fp.fazenda_id = _fazenda_id
        AND fp.ano_mes    = _ano_mes
        AND p.ativo
        AND p.tipo_uso IS DISTINCT FROM 'divergencia'
        AND (p.data_inicio IS NULL OR p.data_inicio <= _mes_fim)
        AND (p.data_fim    IS NULL OR p.data_fim    >= _mes_ini);

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
      -- PR-P1-DATA-FIM-01: NAO ganhou o filtro de vigencia — ver cabecalho.
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

-- Grants: CREATE OR REPLACE preserva os existentes; reafirmados por simetria e para o
-- arquivo ser auto-suficiente. ACL vigente conferida no proto:
-- {postgres=X, authenticated=X, service_role=X}.
REVOKE ALL ON FUNCTION public.get_status_pilares_fechamento(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_status_pilares_fechamento(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_status_pilares_fechamento(uuid, text) TO authenticated, service_role;
