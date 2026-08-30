-- PR-OC-VENDA-FIN-PREVISAO-01D (adendo) — o componente das guias de taxas e impostos.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. O arquiteto aplicou este SQL no Proto sob o
-- registro 20260830144301; este arquivo o guarda no repositorio, VERBATIM. Reaplicar e'
-- inofensivo (ON CONFLICT DO NOTHING).
--
-- POR QUE. As guias reais que a operacao paga — Fundersul e Iagro — nao tinham no
-- catalogo (`zoo_componentes_financeiros`) nenhum componente que as descrevesse. A
-- natureza `obrigacao` oferecia frete, comissao e taxa_aquisicao, e gravar uma guia de
-- Fundersul como "Taxa de aquisicao" seria REPETIR o defeito do adiantamento, que passou
-- meses gravado como `taxa_aquisicao` por ser o menos errado dos tres disponiveis —
-- ate' PR-OC-VENDA-FIN-PREVISAO-01 lhe dar codigo proprio. Componente que descreve outra
-- coisa nao e' aproximacao: e' classificacao errada que ninguem percebe depois.
--
-- ⚠ SEM O SEED A LINHA NAO NASCE. `oc_criar_compromisso` valida o par
-- (natureza, componente) contra este catalogo e recusa o que nao estiver ativo aqui.
--
-- `ordem_exibicao` 115 posiciona o item entre `taxa_aquisicao` (110) e `adiantamento`
-- (120) na lista da natureza `obrigacao`; `categoria` 'tributo' e' a mesma de funrural,
-- senar_proape, imposto e taxa_aquisicao.

INSERT INTO public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ativo, ordem_exibicao, sistemico)
VALUES ('obrigacao', 'taxas_impostos', 'Taxas e Impostos', 'tributo', true, 115, false)
ON CONFLICT DO NOTHING;
