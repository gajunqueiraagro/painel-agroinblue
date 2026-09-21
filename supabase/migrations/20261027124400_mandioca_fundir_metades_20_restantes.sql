-- FUSAO EM LOTE: as 20 cargas de mandioca que faltavam viram uma colheita cada.
--
-- ⚠ AS CONFERENCIAS SAO GUARDAS, NAO RELATORIO, e a diferenca importa. A versao de TESTE deste
--   script terminava em ROLLBACK e imprimia oito SELECTs para alguem ler. Aqui elas ABORTAM: se um
--   peso nao fechar, se sobrar elo duplicado ou orfao, se um vinculo de conciliacao sumir ou se
--   QUALQUER das 13 colunas dos 90 lancamentos tiver mudado, a transacao levanta excecao e nada e'
--   gravado. Numa escrita que ninguem vai reler, um SELECT que imprime o errado e um RAISE que
--   impede o errado nao sao a mesma coisa.
--   O corpo — pares, guarda de entrada, fotografias e as quatro etapas — e' byte a byte o que
--   rodou no teste em ROLLBACK e foi conferido antes do GO.
--
-- O MOLDE E' O DA 20261027124300, ja' homologada na tela com a NF 9287581. O que muda e' a escala:
--   la' os dois ids eram literais, aqui os pares saem de uma consulta. A logica e' a mesma, na
--   mesma ordem, com as mesmas guardas.
--
-- ESTADO MEDIDO NO PROTO EM 21/09/2026, depois da primeira fusao:
--   21 cargas ao todo; 1 ja' fundida (venda 48c40900, uma colheita ativa) e 20 com duas metades.
--   40 colheitas ativas a fundir, 170 elos, 90 lancamentos.
--
-- ⚠ O CRITERIO DE SOBREVIVENCIA E' O PESO, E SO' ELE: maior `peso_bruto_kg`; empate desempata pelo
--   menor id. Medido: ZERO empates nas 20, entao o segundo criterio nunca e' exercido hoje — fica
--   escrito porque e' a regra, nao porque ha' caso.
--
-- ⚠ OS DOIS ICMS CONCILIADOS NAO CORREM RISCO, e a medicao explica por que melhor do que a
--   promessa: os DEZ elos de `icms` ja' estao na colheita SOBREVIVENTE de suas cargas. A
--   sobrevivente nao sofre DELETE nem UPDATE de elo — ela recebe. Entao os dois lancamentos
--   conciliados (NFs 9294773 e 9297983) nao tem elo movido nem apagado.
--   Ainda assim a conferencia (E) checa o vinculo DEPOIS: a garantia tem de ser medida, nao
--   deduzida. E `conciliacao_bancaria_itens` nao aparece em nenhum UPDATE ou DELETE deste script.
--
-- ⚠ ZERO UPDATE DE ELO NESTAS 20, pelo mesmo motivo: 80 elos colidem e sao apagados, 90 ficam onde
--   estao. A ETAPA 2b fica escrita porque e' a regra — se um icms estivesse do lado da absorvida,
--   e' ela que o salvaria. Sem ela, esse elo morreria com a colheita.
--
-- ⚠ `funrural` NAO EXISTE NESTAS VINTE. Ele aparecia na 9287581 e em mais nenhuma. Os papeis aqui
--   sao venda, arranquio, frete, carregamento (20 cada) e icms (10). Os nomes sao os ANTIGOS: o
--   backfill e' anterior ao mapa de tres servicos de 20261027123800.
--
-- ⚠ CARGA COM 3 OU MAIS METADES ABORTA; carga com 1 e' IGNORADA. A ja' fundida tem uma colheita so'
--   e nao deve derrubar o lote — e' o estado final correto, nao anomalia. Tres ou mais e' estado
--   que ninguem previu, e ai' o script para e diz qual.
--   Isto tambem e' a idempotencia: rodado de novo, as 21 tem uma metade cada e nada acontece.
--
-- ⚠ MEDIDO E LIMPO, nos quatro eixos que poderiam complicar o lote:
--   0 empates de peso | 0 pesos nulos (bruto, liquido ou desconto) | 0 elos inativos |
--   0 lancamentos compartilhados com colheita de fora do par.
--   Os CASE de NULL da ETAPA 1 nao disparam hoje; ficam porque "—" e' ausencia e zero e' valor.
--
-- ⚠ NAO SE TOCA `financeiro_lancamentos_v2`, `conciliacao_bancaria_itens` NEM `safra_area_id`.
--   A sobrevivente fica com o talhao que ja' tinha. O unico trigger das duas tabelas escritas e'
--   `trg_local_default`, BEFORE INSERT: nao dispara em UPDATE nem em DELETE.

BEGIN;

-- ================================================================ OS PARES
CREATE TEMP TABLE _par AS
WITH venda AS (
  SELECT cl.colheita_id, cl.lancamento_id AS venda_id
    FROM public.agri_colheita_lancamentos cl
    JOIN public.agri_colheita c ON c.id = cl.colheita_id AND c.ativo
   WHERE cl.papel = 'venda' AND cl.ativo
), g AS (
  SELECT v.venda_id, count(*) AS metades,
         array_agg(c.id             ORDER BY c.peso_bruto_kg DESC, c.id) AS ids,
         array_agg(c.peso_bruto_kg  ORDER BY c.peso_bruto_kg DESC, c.id) AS pesos,
         array_agg(c.peso_liquido_kg ORDER BY c.peso_bruto_kg DESC, c.id) AS liquidos,
         array_agg(c.desconto_kg    ORDER BY c.peso_bruto_kg DESC, c.id) AS descontos,
         max(c.nf_produtor)                                              AS nf
    FROM venda v JOIN public.agri_colheita c ON c.id = v.colheita_id
   GROUP BY v.venda_id
)
SELECT venda_id, nf, metades,
       ids[1] AS sobrevivente, ids[2] AS absorvida,
       pesos[1] AS peso_sobrev, pesos[2] AS peso_absorv,
       (COALESCE(pesos[1],0) + COALESCE(pesos[2],0))          AS peso_esperado,
       CASE WHEN liquidos[1] IS NULL AND liquidos[2] IS NULL THEN NULL
            ELSE COALESCE(liquidos[1],0) + COALESCE(liquidos[2],0) END AS liq_esperado,
       CASE WHEN descontos[1] IS NULL AND descontos[2] IS NULL THEN NULL
            ELSE COALESCE(descontos[1],0) + COALESCE(descontos[2],0) END AS desc_esperado
  FROM g
 WHERE metades = 2;

-- ---------------------------------------------------------------- GUARDA DE ENTRADA
DO $$
DECLARE v_estranhas text; v_pares int;
BEGIN
  SELECT string_agg(nf || ' (' || metades || ' metades)', ', ') INTO v_estranhas
    FROM (WITH venda AS (
            SELECT cl.colheita_id, cl.lancamento_id AS venda_id
              FROM public.agri_colheita_lancamentos cl
              JOIN public.agri_colheita c ON c.id = cl.colheita_id AND c.ativo
             WHERE cl.papel = 'venda' AND cl.ativo)
          SELECT max(c.nf_produtor) AS nf, count(*) AS metades
            FROM venda v JOIN public.agri_colheita c ON c.id = v.colheita_id
           GROUP BY v.venda_id HAVING count(*) > 2) z;
  IF v_estranhas IS NOT NULL THEN
    RAISE EXCEPTION 'Carga com mais de 2 metades ativas, estado imprevisto: %', v_estranhas
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_pares FROM _par;
  RAISE NOTICE 'Pares a fundir: %', v_pares;
END $$;

-- ================================================================ FOTOGRAFIAS DO ANTES
CREATE TEMP TABLE _antes_fin AS
SELECT l.id, l.valor, l.tipo_operacao, l.status_transacao, l.cancelado,
       l.data_vencimento, l.conta_bancaria_id, l.conta_destino_id, l.plano_conta_id,
       l.subcentro, l.centro_custo, l.favorecido_id, l.descricao
  FROM public.financeiro_lancamentos_v2 l
 WHERE EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos cl JOIN _par p
                 ON cl.colheita_id IN (p.sobrevivente, p.absorvida)
                WHERE cl.lancamento_id = l.id);

CREATE TEMP TABLE _antes_concil AS
SELECT a.id AS lancamento_id,
       (SELECT count(*) FROM public.conciliacao_bancaria_itens ci
         WHERE ci.lancamento_id = a.id AND ci.desfeito_em IS NULL) AS vinculos
  FROM _antes_fin a;

SELECT 'ANTES' AS momento,
       (SELECT count(*) FROM _par)                                   AS pares,
       (SELECT count(*) FROM _antes_fin)                             AS lancamentos,
       (SELECT sum(valor) FROM _antes_fin)                           AS soma_valor,
       (SELECT count(*) FROM _antes_concil WHERE vinculos > 0)       AS conciliados;

-- ================================================================ ETAPA 1: somar o peso
UPDATE public.agri_colheita s
   SET peso_bruto_kg = COALESCE(s.peso_bruto_kg,0) + COALESCE(m.peso_bruto_kg,0),
       peso_liquido_kg = CASE WHEN s.peso_liquido_kg IS NULL AND m.peso_liquido_kg IS NULL
                              THEN NULL
                              ELSE COALESCE(s.peso_liquido_kg,0) + COALESCE(m.peso_liquido_kg,0) END,
       desconto_kg   = CASE WHEN s.desconto_kg IS NULL AND m.desconto_kg IS NULL
                            THEN NULL
                            ELSE COALESCE(s.desconto_kg,0) + COALESCE(m.desconto_kg,0) END,
       toneladas     = (COALESCE(s.peso_bruto_kg,0) + COALESCE(m.peso_bruto_kg,0)) / 1000.0,
       updated_at    = now()
  FROM _par p
  JOIN public.agri_colheita m ON m.id = p.absorvida
 WHERE s.id = p.sobrevivente
   AND m.ativo;                     -- <= o que impede a soma dobrada numa segunda execucao

-- ================================================================ ETAPA 2a: apagar o que colide
DELETE FROM public.agri_colheita_lancamentos d
 USING _par p
 WHERE d.colheita_id = p.absorvida
   AND EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos s
                WHERE s.colheita_id = p.sobrevivente
                  AND s.lancamento_id = d.lancamento_id);

-- ================================================================ ETAPA 2b: mover o que sobrou
UPDATE public.agri_colheita_lancamentos cl
   SET colheita_id = p.sobrevivente
  FROM _par p
 WHERE cl.colheita_id = p.absorvida;

-- ================================================================ ETAPA 3: cancelar as absorvidas
UPDATE public.agri_colheita c
   SET ativo = false,
       observacoes = COALESCE(c.observacoes,'')
                     || ' - fundida na colheita ' || left(p.sobrevivente::text, 8)
                     || ' em 2026-09-21 (PR-MANDIOCA-FUNDIR-RESTANTES-20)',
       updated_at = now()
  FROM _par p
 WHERE c.id = p.absorvida
   AND c.ativo;


-- ================================================================ GUARDAS DE SAIDA
DO $$
DECLARE
  v_pares int; v_peso_ok int; v_ton_ok int; v_absorv_ativas int; v_sobrev_ativas int;
  v_elos_na_absorvida int; v_lanc int; v_elos int; v_dup int; v_orfaos int;
  v_concil_quebrados int; v_mexidos int; v_antes numeric; v_depois numeric;
  v_cargas int; v_ativas int; v_max_metades int;
BEGIN
  SELECT count(*) INTO v_pares FROM _par;

  -- (A/B) peso, toneladas e o estado ativo das duas linhas de cada par
  SELECT count(*) FILTER (WHERE s.peso_bruto_kg = p.peso_esperado),
         count(*) FILTER (WHERE s.toneladas = p.peso_esperado / 1000.0),
         count(*) FILTER (WHERE a.ativo),
         count(*) FILTER (WHERE s.ativo)
    INTO v_peso_ok, v_ton_ok, v_absorv_ativas, v_sobrev_ativas
    FROM _par p
    JOIN public.agri_colheita s ON s.id = p.sobrevivente
    JOIN public.agri_colheita a ON a.id = p.absorvida;

  IF v_peso_ok <> v_pares THEN
    RAISE EXCEPTION 'Peso nao fechou em % de % cargas', v_pares - v_peso_ok, v_pares
      USING ERRCODE='P0001';
  END IF;
  IF v_ton_ok <> v_pares THEN
    RAISE EXCEPTION 'Toneladas nao batem com o peso em % de % cargas', v_pares - v_ton_ok, v_pares
      USING ERRCODE='P0001';
  END IF;
  IF v_absorv_ativas > 0 THEN
    RAISE EXCEPTION '% colheitas absorvidas continuam ativas', v_absorv_ativas USING ERRCODE='P0001';
  END IF;
  IF v_sobrev_ativas <> v_pares THEN
    RAISE EXCEPTION 'Esperava % sobreviventes ativas, achei %', v_pares, v_sobrev_ativas
      USING ERRCODE='P0001';
  END IF;

  SELECT count(*) INTO v_elos_na_absorvida
    FROM public.agri_colheita_lancamentos cl JOIN _par p ON cl.colheita_id = p.absorvida;
  IF v_elos_na_absorvida > 0 THEN
    RAISE EXCEPTION '% elos ficaram pendurados em colheita absorvida', v_elos_na_absorvida
      USING ERRCODE='P0001';
  END IF;

  -- (C) um elo por lancamento: nenhum duplicado, nenhum orfao
  SELECT count(*) INTO v_lanc FROM _antes_fin;
  SELECT count(*) INTO v_elos FROM public.agri_colheita_lancamentos
   WHERE lancamento_id IN (SELECT id FROM _antes_fin);
  SELECT count(*) INTO v_dup FROM (
    SELECT lancamento_id FROM public.agri_colheita_lancamentos
     WHERE lancamento_id IN (SELECT id FROM _antes_fin)
     GROUP BY lancamento_id HAVING count(*) > 1) z;
  SELECT count(*) INTO v_orfaos FROM _antes_fin a
   WHERE NOT EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos cl
                      WHERE cl.lancamento_id = a.id);

  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Sobraram % lancamentos com elo duplicado', v_dup USING ERRCODE='P0001';
  END IF;
  IF v_orfaos > 0 THEN
    RAISE EXCEPTION '% lancamentos ficaram sem elo nenhum', v_orfaos USING ERRCODE='P0001';
  END IF;
  IF v_elos <> v_lanc THEN
    RAISE EXCEPTION 'Esperava % elos (um por lancamento), achei %', v_lanc, v_elos
      USING ERRCODE='P0001';
  END IF;

  -- (E) os conciliados: o vinculo do lancamento nao depende do elo, e isto EXIGE que continue assim
  SELECT count(*) INTO v_concil_quebrados FROM _antes_concil b
   WHERE b.vinculos <> (SELECT count(*) FROM public.conciliacao_bancaria_itens ci
                         WHERE ci.lancamento_id = b.lancamento_id AND ci.desfeito_em IS NULL);
  IF v_concil_quebrados > 0 THEN
    RAISE EXCEPTION '% lancamentos mudaram de vinculo na conciliacao; PARAR', v_concil_quebrados
      USING ERRCODE='P0001';
  END IF;

  -- (F) A PROVA: diferenca simetrica das 13 colunas contra a fotografia do ANTES
  SELECT count(*) INTO v_mexidos FROM (
    (SELECT id, valor, tipo_operacao, status_transacao, cancelado, data_vencimento,
            conta_bancaria_id, conta_destino_id, plano_conta_id, subcentro, centro_custo,
            favorecido_id, descricao
       FROM public.financeiro_lancamentos_v2 WHERE id IN (SELECT id FROM _antes_fin)
     EXCEPT SELECT * FROM _antes_fin)
    UNION ALL
    (SELECT * FROM _antes_fin
     EXCEPT SELECT id, valor, tipo_operacao, status_transacao, cancelado, data_vencimento,
                   conta_bancaria_id, conta_destino_id, plano_conta_id, subcentro, centro_custo,
                   favorecido_id, descricao
              FROM public.financeiro_lancamentos_v2 WHERE id IN (SELECT id FROM _antes_fin))
  ) dif;
  IF v_mexidos > 0 THEN
    RAISE EXCEPTION 'financeiro_lancamentos_v2 foi alterada em % linha(s); PARAR', v_mexidos
      USING ERRCODE='P0001';
  END IF;

  -- (G) o dinheiro
  SELECT (SELECT sum(valor) FROM _antes_fin),
         (SELECT sum(valor) FROM public.financeiro_lancamentos_v2
           WHERE id IN (SELECT id FROM _antes_fin))
    INTO v_antes, v_depois;
  IF v_antes IS DISTINCT FROM v_depois THEN
    RAISE EXCEPTION 'Dinheiro mudou: % -> %', v_antes, v_depois USING ERRCODE='P0001';
  END IF;

  -- (H) a invariante final da mandioca: nenhuma carga com mais de uma colheita ativa
  SELECT count(DISTINCT venda_id), count(*), max(n) INTO v_cargas, v_ativas, v_max_metades
    FROM (SELECT cl.lancamento_id AS venda_id,
                 count(*) OVER (PARTITION BY cl.lancamento_id) AS n
            FROM public.agri_colheita_lancamentos cl
            JOIN public.agri_colheita c ON c.id = cl.colheita_id AND c.ativo
           WHERE cl.papel = 'venda' AND cl.ativo) z;
  IF v_max_metades <> 1 THEN
    RAISE EXCEPTION 'Sobrou carga com % colheitas ativas', v_max_metades USING ERRCODE='P0001';
  END IF;

  RAISE NOTICE 'Fusao OK: % pares fundidos | % cargas com % colheitas ativas | % lancamentos, dinheiro % intacto.',
    v_pares, v_cargas, v_ativas, v_lanc, v_depois;
END $$;

DROP TABLE _antes_concil;
DROP TABLE _antes_fin;
DROP TABLE _par;

COMMIT;
