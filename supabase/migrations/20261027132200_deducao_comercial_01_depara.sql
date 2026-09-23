-- DEDUCAO-COMERCIAL-01 — o que e' da venda sai do custo variavel e vira deducao de receita
-- Aplicado no proto em 23/09/2026 (ledger: deducao_comercial_01_depara). Registro historico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Impostos e despesas de venda e abate (Iagro, Sefaz, DARE, DAEMS, Fundersul, Funrural, GTA, ICMS,
-- IR de abate, fretes de venda, comissoes de corretagem) estavam no 8010 "Despesas Comerciais
-- Pecuaria" — custo VARIAVEL. Tudo que e' da venda e' DEDUCAO DE RECEITA: com eles no custo, a
-- receita liquida e a margem % do DRE da pecuaria ficavam infladas nas duas pontas.
-- ⚠ A REGRA E' "8010 INTEIRO MENOS EXCECOES", nao uma lista de padroes, e a FASE 0 explica: a
--   sobra dos padroes valia 44% do 8010 e o maior item dela era o ICMS (~R$ 515 mil em sete
--   grafias), que nao estava na lista. Lista de padroes erra por omissao; excecao erra por
--   inclusao, e a inclusao se ve' na tela.
--
-- A ORDEM DAS REGRAS — e (c) VEM ANTES DE (a), o que INVERTE a ordem do briefing
-- ⚠ POR UM CASO MEDIDO: "Compra Opcoes" (RRCC, R$ 15.100,00) casa com 'compra' e NAO e' frete nem
--   comissao de compra — e' hedge. Com (a) na frente, ele iria para Investimento em Bovinos.
--   (c) hedge → 5025 · (a) compra → 15030 · (b) boitel → 5010 · (d) fica · (e) resto → 5030
-- ⚠ E (a) PEGA 4, NAO OS 2 DO BRIEFING. Os dois extras sao "Comisao"/"Comisão" com UM s —
--   grafias que o padrao `comiss` da FASE 0 nao casava. Sao comissao de compra e vao para 15030:
--   NJ "Comisão 1% Ref. Compra de 29 femeas" (827,88) e NJ "Comisao - Compra NF Ronilson" (1.080).
-- ⚠ O FAVORECIDO MANDA SOBRE A DESCRICAO em (d): lancamento cujo favorecido e' Sefaz, Sefaz MS,
--   DAEMS, DARE ou RS Agro vai para 5030 mesmo que a descricao diga "associacao". Os tres fiscos
--   classificam 808 lancamentos sem depender de grafia.
--
-- CONTAGENS (RAISE se divergir): 1.777 no universo →
--   5025 ...... 17 ...... R$   278.836,34   (hedge)
--   15030 ......  4 ...... R$     4.934,63   (frete/comissao/imposto de compra)
--   5010 ...... 57 ...... R$   451.532,66   (boitel/confinamento)
--   5030 .... 1.550 ...... R$ 1.726.904,67   (o resto: a deducao)
--   8010 ..... 149 ...... R$    58.100,31   (fica: mensalidade/anuidade/associacao/sindicato)
--
-- ⚠ A GUARDA NAO BARRA NADA, E ISSO FOI CONFERIDO ANTES DE ESCREVER.
--   `trg_financeiro_lancamento_v2_guard_update` → `guard_financeiro_lancamento_v2`
--   (md5 0f63e2ef779c29fbb5f1ceaa124ecf1a) recusa UPDATE quando
--   `origem_lancamento = 'importacao_historica'` E o autor nao e' admin. Numa migration
--   `auth.uid()` e' NULO e `is_admin_agroinblue(null)` = FALSE — ela dispararia. Mas ZERO dos
--   1.777 sao historicos, e a guarda do bloco abaixo aborta se algum dia forem.
-- ⚠ `updated_at` RECARIMBA pelo trigger `update_fin_lanc_v2_updated_at`, e e' honesto: a linha
--   mudou mesmo. Quem usar `updated_at` para achar o que este PR tocou tem a janela desta data.
--
-- ⚠ O LUCRO NAO FICA IDENTICO, ao contrario do que o briefing previa — ver o relatorio do PR.
--   A regra (b) manda boitel para o 5010 "Adiantamento de Boitel", cujo `bloco_dre` e' NULO: ele
--   SAI do DRE em vez de virar deducao. Os R$ 451.532,66 deixam o custo variavel e nao reaparecem,
--   e o lucro sobe por esse valor, distribuido em 9 pares (cliente, ano). As regras (a), (c) e (e)
--   sao neutras no lucro. Registrado, nao corrigido: decidir se adiantamento de boitel e' despesa
--   ou movimentacao financeira e' outra frente.

DO $mig$
DECLARE
  v_8010 uuid; v_5030 uuid; v_5025 uuid; v_5010 uuid; v_15030 uuid;
  n int; total int;
BEGIN
  SELECT id INTO v_8010  FROM financeiro_plano_contas WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=8010;
  SELECT id INTO v_5030  FROM financeiro_plano_contas WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=5030;
  SELECT id INTO v_5025  FROM financeiro_plano_contas WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=5025;
  SELECT id INTO v_5010  FROM financeiro_plano_contas WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=5010;
  SELECT id INTO v_15030 FROM financeiro_plano_contas WHERE escopo_negocio='pecuaria' AND cliente_id IS NULL AND ordem_exibicao=15030;
  IF v_8010 IS NULL OR v_5030 IS NULL OR v_5025 IS NULL OR v_5010 IS NULL OR v_15030 IS NULL THEN
    RAISE EXCEPTION 'plano de contas incompleto (8010/5030/5025/5010/15030)';
  END IF;

  SELECT count(*) INTO total FROM financeiro_lancamentos_v2 l
   WHERE l.plano_conta_id=v_8010 AND coalesce(l.cancelado,false)=false AND l.cenario='realizado';
  IF total <> 1777 THEN RAISE EXCEPTION 'universo do 8010: esperado 1777, veio %', total; END IF;

  SELECT count(*) INTO n FROM financeiro_lancamentos_v2 l
   WHERE l.plano_conta_id=v_8010 AND coalesce(l.cancelado,false)=false AND l.cenario='realizado'
     AND l.origem_lancamento='importacao_historica';
  IF n <> 0 THEN RAISE EXCEPTION 'a guarda barraria % lancamentos historicos', n; END IF;

  UPDATE financeiro_lancamentos_v2 l SET plano_conta_id=v_5025,
    subcentro='Resultado com Mercado Futuro', centro_custo='Ajustes',
    grupo_custo='Deduções Pecuária', macro_custo='Deduções de Receitas'
   WHERE l.plano_conta_id=v_8010 AND coalesce(l.cancelado,false)=false AND l.cenario='realizado'
     AND lower(unaccent(coalesce(l.descricao,''))) ~ '(bolsa|commodit|opcoes|opcao|mercado futuro|darf.*bolsa|seguro.*@|seguro da arroba)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 17 THEN RAISE EXCEPTION '5025 (hedge): esperado 17, veio %', n; END IF;

  UPDATE financeiro_lancamentos_v2 l SET plano_conta_id=v_15030,
    subcentro='Investimento Frete/Comissão Compra Bovinos', centro_custo='Compra de Bovinos',
    grupo_custo='Compra de Bovinos', macro_custo='Investimento em Bovinos'
   WHERE l.plano_conta_id=v_8010 AND coalesce(l.cancelado,false)=false AND l.cenario='realizado'
     AND lower(unaccent(coalesce(l.descricao,''))) ~ 'compra';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION '15030 (compra): esperado 4, veio %', n; END IF;

  UPDATE financeiro_lancamentos_v2 l SET plano_conta_id=v_5010,
    subcentro='Adiantamento de Boitel', centro_custo='Movimentações Financeiras',
    grupo_custo='Outras Saídas', macro_custo='Saída Financeira'
   WHERE l.plano_conta_id=v_8010 AND coalesce(l.cancelado,false)=false AND l.cenario='realizado'
     AND lower(unaccent(coalesce(l.descricao,''))) ~ '(diaria|confinamento|boitel)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 57 THEN RAISE EXCEPTION '5010 (boitel): esperado 57, veio %', n; END IF;

  UPDATE financeiro_lancamentos_v2 l SET plano_conta_id=v_5030,
    subcentro='Impostos e Despesas de Abates e Vendas', centro_custo='Impostos',
    grupo_custo='Deduções Pecuária', macro_custo='Deduções de Receitas'
   WHERE l.plano_conta_id=v_8010 AND coalesce(l.cancelado,false)=false AND l.cenario='realizado'
     AND NOT (lower(unaccent(coalesce(l.descricao,''))) ~ '(mensalidade|anuidade|associa|sindicato)'
              AND NOT lower(unaccent(coalesce((SELECT f.nome FROM financeiro_fornecedores f WHERE f.id=l.favorecido_id),'')))
                      ~ '(sefaz|daems|dare|rs agro)');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1550 THEN RAISE EXCEPTION '5030 (resto): esperado 1550, veio %', n; END IF;

  SELECT count(*) INTO n FROM financeiro_lancamentos_v2 l
   WHERE l.plano_conta_id=v_8010 AND coalesce(l.cancelado,false)=false AND l.cenario='realizado';
  IF n <> 149 THEN RAISE EXCEPTION '8010 remanescente: esperado 149, veio %', n; END IF;

  SELECT count(*) INTO n FROM financeiro_lancamentos_v2 l
   WHERE l.plano_conta_id=v_8010 AND coalesce(l.cancelado,false)=false AND l.cenario='realizado'
     AND NOT lower(unaccent(coalesce(l.descricao,''))) ~ '(mensalidade|anuidade|associa|sindicato)';
  IF n <> 0 THEN RAISE EXCEPTION 'sobrou % no 8010 fora da regra (d)', n; END IF;
END $mig$;
