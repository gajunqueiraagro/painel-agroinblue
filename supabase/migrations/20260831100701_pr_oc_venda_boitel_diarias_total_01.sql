-- PR-OC-VENDA-REALIZADO-02F — o total das diarias como fato do papel.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831100701. DDL derivado do schema
-- medido (`numeric`, nullable, sem default); para a funcao irma a prova e' o md5.
--
-- POR QUE. A diaria era sempre TARIFA (`custo_diaria`, R$/cab/dia) e o total derivava dela
-- (`cDT = tarifa x dias x cabecas`). Isso descreve a PROJECAO — na hora de planejar, a
-- tarifa e' o que se negocia. Mas o papel do acerto traz o TOTAL, e derivar a tarifa de
-- volta e' o mesmo erro que `valor_total_abate` ja corrigiu: divisao arredondada vira
-- fantasma de centavos na conferencia.
-- Medido no papel real: 214.590,48 / (109 cab x 104 dias) = 18,93/cab/dia. A tarifa fecha
-- redonda aqui, mas nada garante que feche no proximo — e a conferencia compara com o
-- acerto do boitel, onde centavo importa.
--
-- ⚠ NULLABLE E SEM DEFAULT, como os tres do 02E: e' fato do REALIZADO. Nulo significa "o
-- acerto ainda nao chegou", e o motor cai na tarifa como sempre fez. Zero diria "as
-- diarias custaram zero", que e' outra coisa.
-- ⚠ O PROJETADO NAO MUDA: la' a tarifa digitada continua sendo a fonte certa, e esta
-- coluna fica nula.

ALTER TABLE public.zoo_operacao_boitel
  ADD COLUMN IF NOT EXISTS valor_total_diarias numeric;
