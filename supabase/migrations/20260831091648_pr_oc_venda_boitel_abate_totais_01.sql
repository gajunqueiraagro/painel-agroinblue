-- PR-OC-VENDA-REALIZADO-02E — os tres fatos do papel do frigorifico.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831091648.
-- ⚠ O DDL FOI DERIVADO DO SCHEMA MEDIDO, e nao fornecido verbatim: as tres colunas sao
-- `nullable` e SEM default, conferido no `information_schema`. Para DDL o estado final e'
-- verificavel campo a campo; para a funcao irma (20260831091711) a prova e' o md5.
--
-- POR QUE AS TRES. A FASE 0 do 02D parou em duas paradas, e esta migration as resolve:
--
--   `qtd_abatida` — o ABATE PARCIAL precisa de um TERCEIRO numero. Havia dois: as
--   negociadas (do lote, `qtd_negociada`) e as mortes (`morte_quantidade`). Quando
--   animais doentes ficam no boitel, abatidas < negociadas − mortas, e nao havia onde
--   guardar isso. Codificar o saldo como MORTE seria dizer que morreram — e esse dado
--   propaga ao rebanho pelo `oc_revalorar_lote`. Falsificacao zootecnica, nao atalho.
--
--   `valor_total_abate` — o FATO do papel. Ele podia ser reconstruido (`arrobas x
--   preco/@`), mas o arredondamento da persistencia introduzia centavos: medido R$ 93,76
--   no papel do mockup, o que faria a conferencia acusar divergencia contra o numero que
--   o operador acabou de digitar. Decisao (a) do Gabriel: o valor e' fato, os derivados
--   e' que exibem.
--
--   `acerto_papel` — o valor que o boitel informou, para a conferencia do acerto parar de
--   ser do momento e virar registro (o 02B prometido).
--
-- ⚠ NULLABLE E SEM DEFAULT, os tres, e e' deliberado: sao fatos do REALIZADO. Um default
-- os faria existir em toda projecao, e zero ali nao e' "nao houve" — e' "ainda nao
-- aconteceu". A ausencia e' a resposta certa enquanto o abate nao ocorre.

ALTER TABLE public.zoo_operacao_boitel
  ADD COLUMN IF NOT EXISTS qtd_abatida integer,
  ADD COLUMN IF NOT EXISTS valor_total_abate numeric,
  ADD COLUMN IF NOT EXISTS acerto_papel numeric;
