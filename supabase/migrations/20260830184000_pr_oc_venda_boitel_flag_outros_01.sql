-- PR-OC-VENDA-CASCATA-BOLSO-01 (adendo A) — "Outros" tambem declara o lado.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. O arquiteto aplicou este SQL no Proto sob o
-- registro 20260830184120; este arquivo o guarda no repositorio. Reaplicar e' inofensivo.
--
-- A sexta e ultima flag da familia. `outros_custos` era a unica despesa que sobrava sem
-- escolha de lado depois de PR-OC-VENDA-REALIZADO-01A: frete, notas de envio e despesas
-- de abate ja declaravam, e ela nao — sem razao, so' porque nao tinha sido pedida.
--
-- ⚠ DEFAULT `true` = A REGRA DE HOJE. `outros_custos` sempre entrou em
-- `custoTotalBoitel` (cDT + cs + oc), isto e', sempre foi descontado do repasse. O
-- default preserva isso e nenhuma operacao existente muda um centavo — mesma disciplina
-- das cinco anteriores.
-- ⚠ E E O CONTRARIO DO `custo_notas_envio`, que nasceu `false`: aquela despesa e' nova e
-- o caso comum e' o produtor pagar por fora; esta e' antiga e ja vivia dentro do acerto.
-- O default nao e' estilo — e' o retrato da regra que estava cravada no motor.
--
-- Diaria e sanidade seguem SEM flag: sao sempre do boitel, e uma pergunta sem duas
-- respostas possiveis so' gasta a atencao de quem le'.

ALTER TABLE public.zoo_operacao_boitel
  ADD COLUMN IF NOT EXISTS outros_no_boitel boolean NOT NULL DEFAULT true;
