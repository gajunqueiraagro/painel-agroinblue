-- FUSAO DAS DUAS METADES DE UMA CARGA DE MANDIOCA: NF 9287581. UMA carga, teste de campo.
--
-- ⚠ POR QUE SO' UMA. O backfill de 16/09/2026 gravou cada carga de mandioca como DUAS colheitas.
--   Sao 21 cargas em 42 linhas. Esta migration funde UMA, a do print, para o Gabriel conferir no
--   modal antes de a regra valer para as outras 20. Se a tela responder, as demais vao num PR
--   proprio; se nao, desfaz-se uma carga, nao vinte.
--
-- ALVO, medido no proto em 21/09/2026 e reconferido depois do teste em ROLLBACK:
--   sobrevivente  fba9937a-3eee-47a1-a974-a25243a99ca2   28.190 kg   6 elos   ativa
--   absorvida     6e039a43-6308-4ba6-9271-3032f3f9728e   12.150 kg   4 elos   ativa
--   resultado                                            40.340 kg = 40,34 t
--
-- ⚠ A NF TEM TRES COLHEITAS E A TERCEIRA NAO ENTRA:
--   adfaecd6-1984-45ea-8391-fe4214b8817a, 12.150 kg, ja' inativa, 1 elo inativo. E' o residuo da
--   correcao revertida na manha de 21/09. Fica como esta'. Depois desta migration a NF tem tres
--   linhas e UMA ativa.
--
-- OS SEIS LANCAMENTOS (nenhum conciliado — zero vinculos vivos em conciliacao_bancaria_itens):
--     venda        48c40900  R$ 20.585,50  (1-Entradas)   2 elos
--     arranquio    d45dbf38  R$  5.647,60                 2 elos
--     frete        bed3c3f6  R$  5.647,60                 2 elos
--     carregamento f8bdbbba  R$  2.017,00                 2 elos
--     icms         d688496c  R$  2.470,26                 1 elo   (so' na sobrevivente)
--     funrural     b061115f  R$    335,54                 1 elo   (so' na sobrevivente)
--                                          -----------
--                                          R$ 36.703,50
--   Os papeis sao os ANTIGOS: este backfill e' anterior ao mapa de tres servicos de
--   20261027123800. `arranquio` e' mao de obra e `carregamento` e' trator.
--
-- ⚠ AS DUAS ETAPAS DOS ELOS EXISTEM POR CAUSA DA PK `(colheita_id, lancamento_id)`. Mover um elo
--   cujo lancamento JA' esta' na sobrevivente estouraria duplicate key. Entao: primeiro APAGA o
--   que colide, depois MOVE o que sobrou — e e' a ORDEM que torna a segunda etapa segura, porque
--   depois do DELETE tudo que ainda pende da absorvida e', por construcao, exclusivo dela.
--   Aqui o DELETE pega 4 e o UPDATE pega 0. O UPDATE fica escrito porque e' a regra, nao o caso:
--   nas outras 20 cargas o icms pode estar do outro lado.
--
-- ⚠ IDEMPOTENTE PELO `AND m.ativo` DA ETAPA 1, e isso nao e' detalhe: sem ele, rodar a migration
--   duas vezes somaria os 12.150 de novo e a carga viraria 52.490 kg — silenciosamente, porque
--   nada no banco proibe. Com ele, a segunda execucao encontra a absorvida ja' inativa e nao faz
--   nada; as etapas 2 e 3 ja' sao naturalmente no-op. A guarda de entrada cobre o resto.
--
-- ⚠ AS CONFERENCIAS SAO GUARDAS, NAO RELATORIO. No teste em ROLLBACK elas eram SELECTs para
--   alguem ler. Aqui elas ABORTAM a transacao: se o peso nao fechar 40.340, se sobrar elo
--   duplicado ou orfao, ou se QUALQUER coluna dos seis lancamentos tiver mudado, a migration
--   levanta excecao e nada e' gravado. Numa escrita que ninguem vai reler depois, um SELECT que
--   imprime o errado e um RAISE que impede o errado nao sao a mesma coisa.
--   A da ETAPA E compara 13 colunas contra uma fotografia tirada ANTES das escritas: ela PROVA
--   que `financeiro_lancamentos_v2` ficou intacta, em vez de afirmar.
--
-- ⚠ `favorecido_id`, NAO `fornecedor_id`. A coluna de quem recebe chama-se `favorecido_id` em
--   `financeiro_lancamentos_v2` — conferido em information_schema. A primeira versao deste script
--   usava `fornecedor_id`, por analogia com `financeiro_fornecedores`, e abortava na fotografia.
--
-- ⚠ O MOTIVO VAI EM `observacoes` porque NAO HA' coluna `motivo` em `agri_colheita`, e em ASCII
--   puro (" - "): o separador do backfill ja' foi engolido uma vez pelo canal de aplicacao hoje,
--   e aqui ele iria para DENTRO do dado.
--
-- ⚠ NAO SE TOCA `financeiro_lancamentos_v2` NEM `safra_area_id`. Valores, contas, plano e
--   vencimentos ficam como estao; o talhao da sobrevivente e' o que ela ja' tinha. Trocar de
--   talhao e' escolha do operador no modal, depois, a mao.
--   O unico trigger das duas tabelas e' `trg_local_default`, BEFORE INSERT: nao dispara aqui.

BEGIN;

-- ---------------------------------------------------------------- GUARDA DE ENTRADA
DO $$
DECLARE v_sobrev public.agri_colheita; v_absorv public.agri_colheita;
BEGIN
  SELECT * INTO v_sobrev FROM public.agri_colheita WHERE id = 'fba9937a-3eee-47a1-a974-a25243a99ca2';
  SELECT * INTO v_absorv FROM public.agri_colheita WHERE id = '6e039a43-6308-4ba6-9271-3032f3f9728e';

  IF v_sobrev.id IS NULL OR v_absorv.id IS NULL THEN
    RAISE EXCEPTION 'Colheita alvo nao existe; a fusao nao se aplica a este banco' USING ERRCODE='P0001';
  END IF;

  IF NOT v_absorv.ativo THEN
    RAISE NOTICE 'Absorvida ja inativa: fusao ja aplicada. As etapas abaixo nao mudam nada.';
  ELSE
    IF v_sobrev.peso_bruto_kg <> 28190 OR v_absorv.peso_bruto_kg <> 12150 THEN
      RAISE EXCEPTION 'Pesos fora do medido (esperado 28190 e 12150, achado % e %); PARAR',
        v_sobrev.peso_bruto_kg, v_absorv.peso_bruto_kg USING ERRCODE='P0001';
    END IF;
    IF NOT v_sobrev.ativo THEN
      RAISE EXCEPTION 'Sobrevivente esta inativa; estado inesperado, PARAR' USING ERRCODE='P0001';
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------- fotografia do financeiro
CREATE TEMP TABLE _antes_fin AS
SELECT l.id, l.valor, l.tipo_operacao, l.status_transacao, l.cancelado,
       l.data_vencimento, l.conta_bancaria_id, l.conta_destino_id, l.plano_conta_id,
       l.subcentro, l.centro_custo, l.favorecido_id, l.descricao
  FROM public.financeiro_lancamentos_v2 l
 WHERE EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos cl
                WHERE cl.lancamento_id = l.id
                  AND cl.colheita_id IN ('fba9937a-3eee-47a1-a974-a25243a99ca2',
                                         '6e039a43-6308-4ba6-9271-3032f3f9728e'));

-- ---------------------------------------------------------------- ETAPA 1: somar o peso
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
  FROM public.agri_colheita m
 WHERE s.id = 'fba9937a-3eee-47a1-a974-a25243a99ca2'
   AND m.id = '6e039a43-6308-4ba6-9271-3032f3f9728e'
   AND m.ativo;                      -- <= o que impede a soma dobrada numa segunda execucao

-- ---------------------------------------------------------------- ETAPA 2a: apagar o que colide
DELETE FROM public.agri_colheita_lancamentos d
 WHERE d.colheita_id = '6e039a43-6308-4ba6-9271-3032f3f9728e'
   AND EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos s
                WHERE s.colheita_id = 'fba9937a-3eee-47a1-a974-a25243a99ca2'
                  AND s.lancamento_id = d.lancamento_id);

-- ---------------------------------------------------------------- ETAPA 2b: mover o que sobrou
UPDATE public.agri_colheita_lancamentos
   SET colheita_id = 'fba9937a-3eee-47a1-a974-a25243a99ca2'
 WHERE colheita_id = '6e039a43-6308-4ba6-9271-3032f3f9728e';

-- ---------------------------------------------------------------- ETAPA 3: cancelar a absorvida
UPDATE public.agri_colheita
   SET ativo = false,
       observacoes = COALESCE(observacoes,'')
                     || ' - fundida na colheita fba9937a em 2026-09-21 (PR-MANDIOCA-FUNDIR-01)',
       updated_at = now()
 WHERE id = '6e039a43-6308-4ba6-9271-3032f3f9728e'
   AND ativo;

-- ---------------------------------------------------------------- GUARDAS DE SAIDA
DO $$
DECLARE
  v_ativas int; v_peso numeric; v_ton numeric;
  v_elos int; v_dup int; v_orfaos int; v_mexidos int;
  v_antes numeric; v_depois numeric;
BEGIN
  SELECT count(*) FILTER (WHERE ativo),
         max(peso_bruto_kg) FILTER (WHERE ativo),
         max(toneladas)     FILTER (WHERE ativo)
    INTO v_ativas, v_peso, v_ton
    FROM public.agri_colheita WHERE nf_produtor = '9287581';

  IF v_ativas <> 1 THEN
    RAISE EXCEPTION 'Esperava 1 colheita ativa na NF 9287581, achei %', v_ativas USING ERRCODE='P0001';
  END IF;
  IF v_peso <> 40340 OR v_ton <> 40.34 THEN
    RAISE EXCEPTION 'Peso da carga fundida errado: % kg / % t (esperado 40340 / 40.34)',
      v_peso, v_ton USING ERRCODE='P0001';
  END IF;

  SELECT count(*) INTO v_elos
    FROM public.agri_colheita_lancamentos
   WHERE colheita_id = 'fba9937a-3eee-47a1-a974-a25243a99ca2';
  IF v_elos <> 6 THEN
    RAISE EXCEPTION 'Esperava 6 elos na sobrevivente, achei %', v_elos USING ERRCODE='P0001';
  END IF;

  SELECT count(*) INTO v_dup FROM (
    SELECT lancamento_id FROM public.agri_colheita_lancamentos
     WHERE lancamento_id IN (SELECT id FROM _antes_fin)
     GROUP BY lancamento_id HAVING count(*) > 1) z;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Sobraram % lancamentos com elo duplicado', v_dup USING ERRCODE='P0001';
  END IF;

  SELECT count(*) INTO v_orfaos FROM _antes_fin a
   WHERE NOT EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos cl
                      WHERE cl.lancamento_id = a.id);
  IF v_orfaos > 0 THEN
    RAISE EXCEPTION '% lancamentos ficaram sem elo nenhum', v_orfaos USING ERRCODE='P0001';
  END IF;

  -- A PROVA: diferenca simetrica das 13 colunas contra a fotografia do ANTES.
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

  SELECT (SELECT sum(valor) FROM _antes_fin),
         (SELECT sum(valor) FROM public.financeiro_lancamentos_v2
           WHERE id IN (SELECT id FROM _antes_fin))
    INTO v_antes, v_depois;
  IF v_antes IS DISTINCT FROM v_depois THEN
    RAISE EXCEPTION 'Dinheiro mudou: % -> %', v_antes, v_depois USING ERRCODE='P0001';
  END IF;

  RAISE NOTICE 'Fusao OK: 1 colheita ativa, % kg / % t, 6 elos, dinheiro % intacto.',
    v_peso, v_ton, v_depois;
END $$;

DROP TABLE _antes_fin;

COMMIT;
