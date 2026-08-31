-- PR-OC-VENDA-REALIZADO-02G — o peso vivo e as arrobas viram fato do papel.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831102610. DDL derivado do schema
-- medido (`numeric`, nullable, sem default, sem comentario); para a funcao irma
-- (20260831102614) a prova e' o md5.
--
-- POR QUE. Era o ultimo lugar onde o realizado ainda FALAVA POR DERIVACAO. O papel do
-- frigorifico traz dois totais na balanca — peso vivo e arrobas —, e a tela os
-- reconstruia a partir de `gmd` e `rendimento_saida_pct`:
--     pf = pi + gmd x dias        aTS = (pf x rendimento / 100) / 15 x cabecas
-- Duas contas encadeadas, cada uma com seu arredondamento, para reproduzir um numero que
-- ja' estava escrito. Medido no papel do Santa Clara: 2.251,67 @ em 109 cabecas. A media
-- e' 20,657522935779816 — uma diretiza que NENHUMA quantidade de casas decimais no `gmd`
-- reconstitui de volta. E' a mesma licao de `valor_total_abate` (02E) e
-- `valor_total_diarias` (02F): quando o fato existe no papel, guardar o fato; derivar so'
-- quando ele nao existe.
--
-- ⚠ TOTAIS, NUNCA MEDIAS. O nome das colunas e' deliberado: `_total_`. A tela oferece o
-- atalho [total | /cab] para digitar do jeito que o papel estiver escrito, mas o que
-- ATRAVESSA e' sempre o total — a media e' `total / cabecas`, calculada na hora de
-- mostrar e desfeita na hora de gravar. Guardar a media perderia a soma exata, que e'
-- justamente o que se veio buscar.
--
-- ⚠ NULLABLE E SEM DEFAULT, como os quatro que vieram antes. Nulo significa "o papel
-- ainda nao chegou" e o motor volta a derivar, exatamente como sempre fez. Zero diria
-- "pesou zero", que e' outra afirmacao.
-- ⚠ O PROJETADO NAO MUDA: la' `gmd` e `rendimento` continuam sendo a fonte certa — sao o
-- que se negocia — e estas duas colunas ficam nulas.

ALTER TABLE public.zoo_operacao_boitel
  ADD COLUMN IF NOT EXISTS peso_vivo_total_abate numeric,
  ADD COLUMN IF NOT EXISTS arrobas_totais_abate  numeric;
