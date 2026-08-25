-- PR-META-VALIDACAO-STATUS-02
-- meta_valor_rebanho_status passa de CLIENTE-mes para FAZENDA-mes.
--
-- O DEFEITO: o status era gravado por cliente+ano_mes, mas a validacao que ele
-- governa (valor_rebanho_meta_validada) e' por fazenda+ano_mes. O upsert por
-- fazenda so acontece `if (status === 'validado')`, com status do cliente
-- inteiro — entao validar UMA fazenda marcava o mes como pronto para o cliente
-- e as outras nunca recebiam upsert, sem aviso nenhum.
--
-- CASO REAL: em 05/05/2026, num intervalo de 29 segundos, seis meses da NJ
-- Pecuaria foram validados com apenas a Faz. Pureza selecionada. A Faz. Sto.
-- Expedito ficou de fora de jun e ago-nov — R$ 5,2 mi ausentes por sete meses,
-- que apareciam no DRE como 'variacao do estoque por preco' de -R$ 4,4 mi.
--
-- ⚠ A COLUNA `fazenda_id` JA EXISTE, nullable e SEM FK, com as 90 linhas em
-- NULL. A primeira versao desta migracao trazia um ADD COLUMN e falhou com
-- 42701 — o schema tinha sido inferido de src/integrations/supabase/types.ts,
-- que esta defasado (nao mostra fazenda_id nem updated_at, e marca cliente_id
-- como NOT NULL quando e' nullable). O estado abaixo veio de
-- information_schema e pg_constraint, nao daquele arquivo.
--
-- ORDEM OBRIGATORIA: snapshot -> DROP da chave antiga -> backfill -> DELETE ->
-- nova chave -> FK -> NOT NULL -> gate.
-- ⚠ O DROP VEM ANTES DO INSERT. A segunda tentativa desta migracao punha o
-- backfill primeiro e falhou com 23505: o INSERT cria UMA LINHA POR FAZENDA no
-- mesmo cliente+ano_mes, que e' exatamente o que `UNIQUE (cliente_id, ano_mes)`
-- proibe. O cabecalho daquela versao justificava a ordem dizendo que trocar a
-- chave antes deixaria "o INSERT sem chave para conflitar" — raciocinio que so
-- valeria para um INSERT ... ON CONFLICT, que este nao e'. Este INSERT nao
-- precisa de chave; precisa da AUSENCIA da velha.
-- Entre o DROP e o ADD a tabela fica sem chave de unicidade. E' seguro: tudo
-- corre na mesma transacao e o COMMIT so acontece com a nova no lugar.
-- O NOT NULL continua por ultimo — antes do backfill ele falharia.

-- 1) SNAPSHOT — backup dentro do banco, antes de qualquer alteracao.
--    Tabela em vez de CSV de proposito: o dump e' feito pelo proprio Postgres,
--    sem transcricao manual no caminho. Descartar so depois de homologado.
CREATE TABLE meta_valor_rebanho_status_bkp_20260825 AS
  SELECT * FROM meta_valor_rebanho_status;

-- 2) A CHAVE ANTIGA SAI, antes de qualquer escrita. Ver o cabecalho.
ALTER TABLE meta_valor_rebanho_status
  DROP CONSTRAINT meta_valor_rebanho_status_cliente_id_ano_mes_key;

-- 3) BACKFILL. Uma linha por (fazenda, ano_mes) que TENHA validacao real,
--    herdando status, validado_em e validado_por da linha de cliente.
--    A fazenda_id NAO e' inventada: sai de valor_rebanho_meta_validada, que
--    e' o unico lugar onde se sabe QUAIS fazendas foram de fato validadas.
--    Fazenda sem registro naquele mes NAO ganha linha — ela esta
--    genuinamente em rascunho, e e' isso que o defeito escondia.
INSERT INTO meta_valor_rebanho_status
  (cliente_id, ano_mes, fazenda_id, status, validado_em, validado_por)
SELECT DISTINCT s.cliente_id, s.ano_mes, v.fazenda_id,
       s.status, s.validado_em, s.validado_por
FROM meta_valor_rebanho_status s
JOIN valor_rebanho_meta_validada v
  ON v.cliente_id = s.cliente_id AND v.ano_mes = s.ano_mes
WHERE s.fazenda_id IS NULL;

-- 4) As linhas antigas saem. As 18 sem nenhuma validacao correspondente
--    (Vera Ligia Milani, 2024-07 a 2025-12) nao geraram substituta e somem:
--    decisao de Gabriel. Nao ha como saber quais fazendas foram validadas
--    naqueles meses, e supor que todas foram e' exatamente o erro que esta
--    migracao corrige. Os precos em meta_valor_rebanho_precos NAO sao tocados.
DELETE FROM meta_valor_rebanho_status WHERE fazenda_id IS NULL;

-- 5) A CHAVE NOVA entra (a antiga saiu no passo 2).
ALTER TABLE meta_valor_rebanho_status
  ADD CONSTRAINT meta_valor_rebanho_status_fazenda_id_ano_mes_key
  UNIQUE (fazenda_id, ano_mes);

-- 6) A FK, que a coluna nunca teve. Entra DEPOIS do backfill: antes dele as 90
--    linhas em NULL passariam (NULL nao viola FK), mas o que interessa e'
--    validar as linhas novas, e essas so existem agora.
ALTER TABLE meta_valor_rebanho_status
  ADD CONSTRAINT meta_valor_rebanho_status_fazenda_id_fkey
  FOREIGN KEY (fazenda_id) REFERENCES fazendas(id);

-- 7) NOT NULL por ultimo: e' a ultima linha de defesa se a guarda do hook
--    falhar. Gravar status sem fazenda deixa de ser possivel.
ALTER TABLE meta_valor_rebanho_status
  ALTER COLUMN fazenda_id SET NOT NULL;

-- 8) GATE. Uma linha por registro de valor_rebanho_meta_validada.
--    Qualquer outro numero aborta a transacao.
DO $$
DECLARE n int; esperado int;
BEGIN
  SELECT count(*) INTO n FROM meta_valor_rebanho_status;
  SELECT count(*) INTO esperado FROM valor_rebanho_meta_validada;
  IF n <> esperado THEN
    RAISE EXCEPTION 'BACKFILL DIVERGIU: status=% esperado=% (uma linha por validacao)', n, esperado;
  END IF;
END $$;

-- cliente_id CONTINUA na tabela: e' redundante com fazenda_id mas tem FK e
-- ainda e' lido. Remove-la e' outro PR.
