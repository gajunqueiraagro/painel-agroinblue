-- PR-CATALOGO-01 — natureza NOVA 'obrigacao' + 3 componentes de compromisso-a-pagar.
--
--   MOTIVO: no modelo de Compromissos, frete/comissao/taxa sao COMPROMISSOS A PAGAR (a transportadora,
--   ao corretor, ao fisco), nao DEDUCAO do preco negociado dos animais. natureza='deducao' foi pensada
--   como deducao de preco (sobretudo venda) e natureza='principal' e a base dos animais — nenhuma delas
--   deve ser reutilizada. A natureza NOVA 'obrigacao' NAO entra em nenhum filtro por 'principal', logo
--   NAO contamina a base (_oc_base_saldo_operacao / Sigma principal do writer integral permanecem intactos).
--
--   ESCOPO (minimo): estende os 2 CHECKs de natureza (catalogo + compromissos) para aceitar 'obrigacao';
--   insere 3 componentes obrigacao/*. NAO cria subcentro (o plano de contas ja tem Frete/Comissao e
--   animais). NAO reclassifica principal/deducao/acrescimo. NAO toca o CHECK de categoria (reusa valores
--   ja na lista fechada). Sem writer/trigger/RPC/comportamento/migracao de dados.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

-- 1) natureza no CATALOGO: estende o CHECK (mesmo nome), preservando principal/deducao/acrescimo.
ALTER TABLE public.zoo_componentes_financeiros
  DROP CONSTRAINT IF EXISTS zoo_componentes_financeiros_natureza_check;
ALTER TABLE public.zoo_componentes_financeiros
  ADD CONSTRAINT zoo_componentes_financeiros_natureza_check
  CHECK (natureza IN ('principal','deducao','acrescimo','obrigacao'));

-- 2) natureza em COMPROMISSOS: estende o CHECK (mesmo nome), preservando os 3 valores originais.
ALTER TABLE public.zoo_operacao_compromissos
  DROP CONSTRAINT IF EXISTS zoo_operacao_compromissos_natureza_check;
ALTER TABLE public.zoo_operacao_compromissos
  ADD CONSTRAINT zoo_operacao_compromissos_natureza_check
  CHECK (natureza IN ('principal','deducao','acrescimo','obrigacao'));

-- 3) 3 componentes obrigacao/* (categoria copiada do equivalente, todas ja na lista fechada do CHECK de
--    categoria). UNIQUE(natureza,codigo) garante nao-duplicacao. codigo ~ '^[a-z0-9_]+$' respeitado.
INSERT INTO public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ordem_exibicao, sistemico, ativo) VALUES
  ('obrigacao', 'frete',          'Frete',              'logistica', 90,  true, true),
  ('obrigacao', 'comissao',       'Comissão',           'comissao',  100, true, true),
  ('obrigacao', 'taxa_aquisicao', 'Taxa de aquisição',  'tributo',   110, true, true);

-- ROLLBACK documentado (NAO executar aqui):
--   DELETE FROM public.zoo_componentes_financeiros WHERE natureza='obrigacao' AND codigo IN ('frete','comissao','taxa_aquisicao');
--   ALTER TABLE public.zoo_operacao_compromissos DROP CONSTRAINT zoo_operacao_compromissos_natureza_check;
--   ALTER TABLE public.zoo_operacao_compromissos ADD CONSTRAINT zoo_operacao_compromissos_natureza_check CHECK (natureza IN ('principal','deducao','acrescimo'));
--   ALTER TABLE public.zoo_componentes_financeiros DROP CONSTRAINT zoo_componentes_financeiros_natureza_check;
--   ALTER TABLE public.zoo_componentes_financeiros ADD CONSTRAINT zoo_componentes_financeiros_natureza_check CHECK (natureza IN ('principal','deducao','acrescimo'));
