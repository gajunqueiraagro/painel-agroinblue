-- FAZ-ATIVIDADE-01c — Bom Retiro volta a declarar que tem pecuária
-- Aplicado no proto em 23/09/2026 (ledger: bom_retiro_tem_pecuaria). Registro histórico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- O `20261027131500_bom_retiro_semente_2022` apagou a semente de 2022 e, junto, devolveu
-- `tem_pecuaria = NULL` à Faz. Bom Retiro. A leitura daquele PR era "não se sabe, não 'não tem'" —
-- e estava certa PARA AQUELES CINCO MESES, em que a terra estava arrendada a terceiro.
-- ⚠ MAS O FATO É CONHECIDO HOJE: o rebanho real entra em 2022-06 por transferência (5 lançamentos,
--   469 cabeças) e a fazenda nunca mais parou de ter gado. "Não se sabe" descreve o jan–mai/2022
--   que deixou de existir, não a fazenda. A decisão do 01a é revista aqui.
--
-- O QUE ISSO CONSERTA NA TELA — e é o defeito que motivou o 01c
-- Os OITO seletores de fazenda dos modais zootécnicos (Nascimento, Morte, Compra OC, Compra Meta,
-- Venda OC, Venda Meta, Abate e Consumo) leem uma lista só, `fazendasOC`, que é
-- `fazendas.filter(isFazendaPecuaria)` — e `isFazendaPecuaria` exige `tem_pecuaria === true`
-- (src/contexts/FazendaContext.tsx:36). Com NULL, o Bom Retiro SUMIU dos oito de uma vez: o
-- operador não conseguia lançar nada nela, sem mensagem nenhuma explicando por quê.
-- ⚠ A CORREÇÃO É NO DADO, NÃO NO CRITÉRIO. O `=== true` é contrato declarado do
--   PR-NAV-CONTEXTO-FAZENDA-01A, escrito em comentário no próprio contexto, e diz para NÃO o
--   confundir com `fazendasComPecuaria` (`!== false`), que serve a dashboards e fechamento.
--   Afrouxar a polaridade consertaria esta fazenda e mudaria a semântica das outras sete telas.
--   Decisão do Gabriel em 23/09 (saída 2 da FASE 0): o critério fica, o dado muda.
--
-- ALCANCE — UMA linha, medida antes de escrever
-- Das 19 fazendas do banco, o Bom Retiro é a ÚNICA com `tem_pecuaria IS NULL`. As outras 18 são
-- 11 `true` (todas `status_operacional = 'ativa'`) e 7 `false` (6 `Administrativo` inativos mais
-- o `Retiro Agricultura` do NJ, ativo e sem pecuária por fato). Nenhuma delas é tocada — a guarda
-- leva `id`, `cliente_id` E `tem_pecuaria IS NULL`, e aborta se o ROW_COUNT não for exatamente 1.

DO $mig$
DECLARE
  v_faz uuid := '682419f9-8b70-4ae4-8aa6-5320ef40db97';  -- Faz. Bom Retiro
  v_cli uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';  -- Santa Rita Agro
  n int;
BEGIN
  -- ⚠ `tem_pecuaria IS NULL` na guarda NÃO é redundante: ele torna a migration idempotente no
  --    sentido certo — rodar duas vezes ABORTA (0 linhas) em vez de sobrescrever em silêncio um
  --    `false` que alguém tenha declarado de propósito depois.
  UPDATE public.fazendas SET tem_pecuaria = true
   WHERE id = v_faz AND cliente_id = v_cli AND tem_pecuaria IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'fazendas.tem_pecuaria (Bom Retiro): esperado 1, veio %', n; END IF;

  -- guarda final: nenhuma outra fazenda ficou com a flag indefinida
  SELECT count(*) INTO n FROM public.fazendas WHERE tem_pecuaria IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'restaram % fazendas com tem_pecuaria NULL', n; END IF;
END $mig$;
