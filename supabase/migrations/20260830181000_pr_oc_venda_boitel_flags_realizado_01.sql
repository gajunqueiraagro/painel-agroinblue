-- PR-OC-VENDA-REALIZADO-01A — as flags "de que lado do acerto mora cada despesa".
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. O arquiteto aplicou este SQL no Proto sob o
-- registro 20260830180833; este arquivo o guarda no repositorio, VERBATIM. Reaplicar e'
-- inofensivo (IF NOT EXISTS em todas).
--
-- A DECISAO DE PRODUTO (Gabriel, 30/08): cada despesa declara DE QUE LADO DO ACERTO ela
-- mora. "No boitel" desconta do repasse e nao tem caixa proprio; "do produtor" fica fora
-- do acerto e vira previsao de caixa na aba Financeiro. Ate' aqui essa regra era CRAVADA
-- no motor — frete sempre fora, despesas de abate sempre dentro — e nao havia como o
-- operador dizer o contrario num contrato que combinasse diferente.
--
-- ⚠ OS DEFAULTS SAO A REGRA DE HOJE, e essa escolha e' o que faz nada existente mudar:
--     custo_frete_no_boitel     false   (o frete ja ficava fora de `custoTotalBoitel`)
--     despesas_abate_no_boitel  true    (`cAb` ja era subtraido do liquido)
--     notas_envio_no_boitel     false   (despesa nova, nasce do lado do produtor)
--     custo_notas_envio         0       (despesa nova, nasce zerada)
-- Conferido na b58bf556: com os defaults, o liquido continua R$ 565.217,00, ao centavo.
--
-- `data_abate` e' do cenario REALIZADO — a data em que o abate de fato aconteceu. Nula
-- enquanto ele nao acontecer; nunca preenchida por default, porque data que se inventa
-- vira fato que nao houve.
--
-- ⚠ ESTA MIGRATION SOZINHA NAO BASTA. `oc_salvar_boitel` enumera as colunas uma a uma
-- (lista branca no INSERT e no ON CONFLICT), entao um payload com estas cinco chaves
-- seria ignorado EM SILENCIO — e a auditoria, que grava o payload inteiro, ainda diria
-- que gravou. A expansao da RPC vai na migration irma 20260830182000.

ALTER TABLE public.zoo_operacao_boitel
  ADD COLUMN IF NOT EXISTS custo_frete_no_boitel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS despesas_abate_no_boitel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS custo_notas_envio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas_envio_no_boitel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_abate date;
