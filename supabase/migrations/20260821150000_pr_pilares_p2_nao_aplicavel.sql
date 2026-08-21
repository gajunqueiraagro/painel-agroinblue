-- 20260821150000_pr_pilares_p2_nao_aplicavel.sql
-- PR-PILARES-P2-NAO-APLICAVEL-01 — o P2 deixa de cobrar rebanho de mes sem pecuaria.
--
-- CAUSA-RAIZ (FASE 0, proto 2026-08-21).
-- O P2 era binario: existe valor_rebanho_fechamento 'fechado'? oficial : pendente.
-- Nunca perguntava se HAVIA rebanho a fechar. Fazenda que deixou de ter pecuaria passa
-- a ser cobrada por "valor do rebanho pendente" todo mes, para sempre.
--
-- MEDIDO — tres fazendas sem UM pasto de pecuaria ativo:
--     Faz. Sta. Luzia      tem_pecuaria=true    0 pecuaria, 12 eucalipto, 2 ambiental
--     Retiro Agricultura   tem_pecuaria=false   0 pecuaria,  2 agricultura, 3 ambiental
--     Faz. Bom Retiro      tem_pecuaria=false   0 pecuaria,  1 eucalipto
-- A Sta. Luzia teve gado (42 meses de valor_rebanho_fechamento no historico), virou
-- eucalipto arrendado a terceiro, e a cobranca ficou.
--
-- tem_pecuaria NAO E O CRITERIO, e esta funcao NAO a consulta. E campo MANUAL: nao ha
-- trigger em fazendas, e a unica funcao que o menciona e provisionar_cliente, que so
-- define o valor na criacao. Erra nos DOIS sentidos — Sta. Luzia e true sem pecuaria,
-- Retiro Agricultura e false com 70 cards de fechamento. Flag de cadastro nao sabe o
-- que aconteceu no mes.
--
-- A REGRA CERTA JA EXISTE E E SOBERANA, em src/lib/pastos/tiposUso.ts:
--     const SET_EXIGE_REBANHO = new Set<string>(['cria','recria','engorda']);
-- Esta migration a ESPELHA no banco, sem alterar a fonte. Sao TRES tipos, nao cinco:
-- 'vedado' e 'reforma_pecuaria' tambem sao pecuaria, mas sao pecuaria SEM GADO naquele
-- mes — cobrar valor de rebanho de pasto vedado seria o mesmo defeito, com outra roupa.
--
-- coalesce(fp.tipo_uso_mes, p.tipo_uso): o tipo EFETIVO do mes e o do snapshot mensal
-- quando existe, e o cadastral quando nao. Importa aqui porque um pasto pode ter sido
-- pecuaria naquele mes e ter virado eucalipto depois — ler so o cadastro reescreveria o
-- passado.
--
-- O BANCO CONTINUA DEVOLVENDO O P2, com status 'nao_aplicavel'. Quem esconde e a TELA.
-- Se a funcao simplesmente omitisse a chave, o front nao teria como distinguir "nao se
-- aplica" de "nao consegui ler" — e a regra firmada nesta frente e que silencio nunca
-- vira "fechado". Com o dado presente e explicito, a ausencia na tela e decisao, nao
-- acidente.
--
-- A ORDEM DOS RAMOS: O FECHAMENTO DECIDE PRIMEIRO.
-- _pastos_pecuaria e contado sobre p.ativo, que e o estado de HOJE — nao o da epoca do
-- fechamento. Decidir 'nao_aplicavel' ANTES de olhar valor_rebanho_fechamento faria o
-- sistema APAGAR uma afirmacao que o operador de fato produziu, so porque um pasto foi
-- desativado anos depois. Fechamento gravado e PROVA de que havia rebanho a fechar
-- naquele mes, e prova vence derivacao a partir do cadastro atual.
--
-- O caso que obrigou a inversao: nos 18 meses da Faz. Bom Retiro com
-- valor_rebanho_fechamento 'fechado', o filtro de hoje conta 0 pasto de pecuaria — mas
-- SEM o filtro de ativo conta 1. O pasto unico ("Geral", recria) foi desativado depois.
-- Com o fechamento decidindo primeiro, esses 18 seguem 'oficial'.
--
-- IMPACTO MEDIDO — 57 meses mudam de estado, todos de 'pendente' para 'nao_aplicavel':
--     Faz. Sta. Luzia ...... 37   (seguem 42 'oficial' e 1 'pendente')
--     Retiro Agricultura ... 14   (nenhum oficial, nenhum pendente restante)
--     Faz. Bom Retiro ......  6   (seguem 18 'oficial')
-- Nenhum mes perde a condicao de 'oficial'.
--
-- ESCOPO. Somente o ramo do P2. O P1 fica INTOCADO, inclusive o JOIN e o filtro de
-- ativo/divergencia aplicados em 20260821140000. P3, P4 e P5 seguem 'nao_implementado'.
-- As seis chaves do jsonb e seus nomes ficam identicos. Nome, assinatura, retorno,
-- LANGUAGE, STABLE, SECURITY DEFINER, search_path e owner (postgres) replicados de
-- pg_get_functiondef. Base: md5 7ea09db4f89c7b83ae0affc6070a0046.
--
-- NENHUM DADO E ALTERADO. Nenhum card fechado, aberto ou apagado. Muda apenas como o P2
-- e LIDO.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? Sim: exigeRebanhoNoFechamento em tiposUso.ts.
--   (b) Reutilizar? Sim: a lista de tipos e a mesma, espelhada.
--   (c) Fonte soberana? O tipo de uso DO MES (fechamento_pastos.tipo_uso_mes com
--       fallback no cadastro), e nao a flag fazendas.tem_pecuaria.
--   (d) Segunda forma? A regra passa a existir em TS e em SQL. E duplicacao consciente:
--       unifica-la exigiria a tela chamar a funcao — frente propria, ja registrada no
--       PR anterior.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Reduz uma cobranca permanentemente falsa. Fica aberta a frente de
--       fn_natureza_patrimonial_fazenda, que nao conhece 'eucalipto' e o joga no
--       ELSE NULL — defeito proprio, NAO corrigido aqui.
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
      _pastos_pecuaria int;
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

      -- ORDEM DELIBERADA: o FECHAMENTO decide primeiro. Fechamento gravado e PROVA de
      -- que houve rebanho a fechar naquele mes, e prova vence derivacao — _pastos_pecuaria
      -- e contado sobre p.ativo, o estado de HOJE. Na outra ordem, desativar um pasto anos
      -- depois APAGARIA da tela uma afirmacao que o operador de fato produziu.
      IF EXISTS (
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
  'Status dos pilares de fechamento. P1: fechamento_pastos, contando APENAS pasto ativo e tipo_uso distinto de divergencia (espelha FechamentoTab.tsx:188-194). P2, nesta ordem: oficial se existe valor_rebanho_fechamento fechado — fechamento gravado e prova de que havia rebanho, e prevalece sobre derivacao do cadastro atual; senao nao_aplicavel quando o mes nao tem pasto de pecuaria que exija rebanho (coalesce(tipo_uso_mes, tipo_uso) em cria/recria/engorda, espelhando SET_EXIGE_REBANHO de src/lib/pastos/tiposUso.ts); senao pendente. NAO consulta fazendas.tem_pecuaria: e campo manual, sem trigger, e erra nos dois sentidos (Sta. Luzia true sem pecuaria; Retiro Agricultura false com 70 cards). P3, P4 e P5: nao_implementado. Vocabulario: oficial | pendente | nao_aplicavel | nao_implementado. Atencao: pastos.ativo e o estado de HOJE, nao o da epoca.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter REINTRODUZ a cobranca falsa: 57 meses de tres fazendas sem pecuaria voltam a
-- ser cobrados por "valor do rebanho" como pendencia que ninguem pode resolver.
-- Corpo capturado por pg_get_functiondef em 2026-08-21, md5 7ea09db4f89c7b83ae0affc6070a0046.
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
--       -- P1 — conta APENAS pasto ativo e nao-divergencia, espelhando
--       -- FechamentoTab.tsx:188-194. Sem o JOIN, card de pasto desativado e o card
--       -- sintetico de divergencia entravam na conta como pasto real do mes.
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
--       -- P2 — INTOCADO.
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
