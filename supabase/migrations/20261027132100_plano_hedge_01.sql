-- PLANO-HEDGE-01 — o mercado futuro ganha subcentro proprio, nos dois sentidos
-- Aplicado no proto em 23/09/2026 (ledger: plano_hedge_01). Registro historico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Operacoes de bolsa, opcoes e contratos de commodities estavam no 8010 "Despesas Comerciais
-- Pecuaria" — custo VARIAVEL. Hedge nao e' custo de producao: e' resultado financeiro da venda, e
-- tem dois sentidos. Sem subcentro proprio, um ganho de hedge nao teria onde ser lancado, e a
-- perda inflava o custo variavel (R$ 278.836,34 em 17 lancamentos).
--
-- ⚠ AS ORDENS SAO 5025 E 1055 — OS VAOS —, E ISSO E' DECISAO MEDIDA, NAO PREGUICA. A regra
--   PLANO-ORDEM-01 numera de 10 em 10 em `centro a-z > subcentro a-z`, e segui-la a' risca poria
--   "Resultado com Mercado Futuro" (centro Ajustes) ENTRE 5020 e 5030, e "Ganho com Mercado
--   Futuro" (centro Venda Geral) entre 1050 e 1060 — renumerando 11 subcentros.
-- ⚠ E SEIS DELES ESTAO TRAVADOS NA META. `fn_meta_calculada_pecuaria` emite `5030 as ordem` e
--   mapeia categorias para `1110`, `1120`, `1130`, `1140`, `1150` como LITERAIS; `fn_dre_pecuaria`
--   junta por `p.ordem_exibicao = c.ordem`. Renumerar faria a meta apontar para OUTRO subcentro
--   sem erro nenhum — o join acharia outra linha do plano, e o DRE de meta somaria a linha errada.
--   Decisao do Gabriel em 23/09 (saida 1): o vao. Nenhuma ordem existente muda.
--
-- O QUE ENTRA
--   5025 · Deducoes de Receitas › Deducoes Pecuaria › Ajustes › "Resultado com Mercado Futuro"
--          bloco_dre 'deducao', 2-Saidas, compoe_dre = true
--   1055 · Receita Operacional › Receita Pecuaria › Venda Geral › "Ganho com Mercado Futuro"
--          bloco_dre 'venda', 1-Entradas, compoe_dre = true
--
-- PROVAS: a ordem a-z do grupo fica correta (5020 → 5025 → 5030; 1050 → 1055 → 1060) e as 17
-- ordens existentes dos dois grupos continuam onde estavam. `docs/PLANO-DE-CONTAS.md` regenerado:
-- 228 linhas, 220 globais e 8 de cliente — conferido contra o banco.

DO $mig$
DECLARE n int;
BEGIN
  PERFORM 1 FROM financeiro_plano_contas
   WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=5020
     AND subcentro='Deduções Outras Operações Pecuária';
  IF NOT FOUND THEN RAISE EXCEPTION 'vizinho 5020 nao confere'; END IF;
  PERFORM 1 FROM financeiro_plano_contas
   WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=5030
     AND subcentro='Impostos e Despesas de Abates e Vendas';
  IF NOT FOUND THEN RAISE EXCEPTION 'vizinho 5030 nao confere'; END IF;
  PERFORM 1 FROM financeiro_plano_contas
   WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=1050
     AND subcentro='Consumo Interno e Doações';
  IF NOT FOUND THEN RAISE EXCEPTION 'vizinho 1050 nao confere'; END IF;
  PERFORM 1 FROM financeiro_plano_contas
   WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=1060
     AND subcentro='Venda de Tropa';
  IF NOT FOUND THEN RAISE EXCEPTION 'vizinho 1060 nao confere'; END IF;

  SELECT count(*) INTO n FROM financeiro_plano_contas WHERE ordem_exibicao IN (5025, 1055);
  IF n <> 0 THEN RAISE EXCEPTION 'os vaos 5025/1055 nao estao livres (% ocupados)', n; END IF;

  INSERT INTO financeiro_plano_contas
    (cliente_id, tipo_operacao, macro_custo, centro_custo, subcentro,
     escopo_negocio, ativo, ordem_exibicao, grupo_custo, compoe_dre, gera_lcdpr, bloco_dre)
  VALUES
    (NULL, '2-Saídas', 'Deduções de Receitas', 'Ajustes', 'Resultado com Mercado Futuro',
     'pecuaria', true, 5025, 'Deduções Pecuária', true, false, 'deducao'),
    (NULL, '1-Entradas', 'Receita Operacional', 'Venda Geral', 'Ganho com Mercado Futuro',
     'pecuaria', true, 1055, 'Receita Pecuária', true, false, 'venda');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'esperado 2 subcentros novos, veio %', n; END IF;

  SELECT count(*) INTO n FROM financeiro_plano_contas
   WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL
     AND ordem_exibicao IN (5020,5030,1010,1020,1030,1040,1050,1060,1070,1080,1090,1100,1110,1120,1130,1140,1150);
  IF n <> 17 THEN RAISE EXCEPTION 'ordens existentes mudaram: esperado 17, veio %', n; END IF;
END $mig$;
