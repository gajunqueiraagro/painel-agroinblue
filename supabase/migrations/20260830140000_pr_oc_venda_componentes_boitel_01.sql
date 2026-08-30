-- PR-OC-VENDA-FIN-PREVISAO-01 — os dois componentes financeiros do boitel.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. O arquiteto aplicou este SQL no Proto sob o
-- registro 20260830134937; este arquivo o guarda no repositorio, VERBATIM. Reaplicar e'
-- inofensivo (ON CONFLICT DO NOTHING).
--
-- ⚠ POR QUE UM SEED, E NAO UM ENUM NO FRONT. A lista de componentes e' CATALOGO
-- (`zoo_componentes_financeiros`), lido por `useComponentesFinanceiros`. O unico CHECK
-- na coluna `componente` de `zoo_operacao_compromissos` e' de FORMATO
-- (`componente ~ '^[a-z0-9_]+$'`), nao de dominio. Quem valida o dominio e' o writer:
--
--     IF NOT EXISTS (SELECT 1 FROM zoo_componentes_financeiros c
--                     WHERE c.natureza = v_natureza AND c.codigo = v_componente
--                       AND c.ativo IS TRUE)
--       THEN RAISE EXCEPTION 'Componente %/% inexistente ou inativo no catalogo';
--
-- Sem este seed a linha da previsao NAO NASCE — o `oc_criar_compromisso` a recusa antes
-- de inserir. A natureza `obrigacao` tinha exatamente tres codigos (frete, comissao,
-- taxa_aquisicao), e o adiantamento do boitel vinha sendo gravado como `taxa_aquisicao`
-- por ser o menos errado dos tres.
--
-- ⚠ `adiantamento_devolvido` E' UM RECEBIMENTO com natureza de obrigacao, e nao um
-- descuido. O gate do `oc_criar_compromisso` limita a SOMA dos compromissos
-- `principal` a base da operacao; na b58bf556 a base e' 565.217,00 e o recebimento
-- principal ja a consome inteira, entao o adiantamento devolvido (96.783,50) nao cabe
-- como segundo principal. Como o sentido do dinheiro passou a vir do PLANO DE CONTAS
-- (PR-OC-SENTIDO-POR-PLANO-01) e nao do tipo da operacao, uma obrigacao com subcentro
-- de '1-Entradas' materializa como ENTRADA. O teto do principal fica integro.

INSERT INTO public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ativo, ordem_exibicao, sistemico)
VALUES
  ('obrigacao', 'adiantamento', 'Adiantamento ao Boitel', 'ajuste', true, 120, false),
  ('obrigacao', 'adiantamento_devolvido', 'Adiantamento devolvido', 'ajuste', true, 121, false)
ON CONFLICT DO NOTHING;
