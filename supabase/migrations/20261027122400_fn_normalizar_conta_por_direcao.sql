-- CONTA POR DIRECAO — camada 1 de 3: o trigger que normaliza na ESCRITA.
--
-- Entrada guarda a conta em `conta_destino_id`; saida, em `conta_bancaria_id`. A convencao
-- existia em codigo desde o PR-K (`montarPayloadConta`), e a medicao de 17/09/2026 mostrou que
-- ela nao se sustenta la: sao 52 caminhos de escrita, e 31 NAO passam pelo gargalo do front
-- (`useFinanceiroV2.buildInsertRow`, que e passthrough puro e nao decide nada) — entre eles 19
-- RPCs, que rodam inteiramente dentro do banco. Alem disso a regra ja estava reimplementada em
-- CINCO lugares independentes, dois deles com semantica diferente (`patchDaConta` nao zera a
-- outra ponta). O trigger e o unico ponto que alcanca os 52.
--
-- ⚠ O NOME COMECA COM `trg_00_` DE PROPOSITO, e nao por estetica: trigger BEFORE ... FOR EACH ROW
-- dispara em ORDEM ALFABETICA DO NOME, e `trg_financeiro_lancamento_v2_hash` usa
-- `NEW.conta_bancaria_id` no hash de deduplicacao de importacao. Rodando ANTES dele, a entrada e
-- hasheada ja normalizada (conta na coluna do destino, origem nula).
-- ⚠ E ISSO FOI MEDIDO ANTES DE ESCOLHER O NOME: das 57 entradas que tinham `conta_bancaria_id`
-- preenchido, NENHUMA tinha `lote_importacao_id` — ou seja, nenhum hash ja gravado foi calculado
-- com conta numa entrada, e normalizar antes do hash nao invalida dedup nenhum do historico.
-- O outro `trg_00_` da tabela (`trg_00_ano_mes_from_competencia`) nao toca conta: nao ha conflito.
--
-- ⚠ TRANSFERENCIA (3-) NAO E NORMALIZADA: ela tem duas pernas de verdade, origem e destino, e
-- colapsar uma delas destruiria a informacao. O CHECK da camada 3 cuida do caso degenerado
-- (as duas pernas iguais).
--
-- Aplicada no proto pelo arquiteto em 17/09/2026; esta migration e REGISTRO HISTORICO.
-- Copiada do pg_get_functiondef/pg_get_triggerdef do proto e conferida lendo este arquivo:
--   corpo (prosrc):      md5 273bc6b274a6f7ce0a94b4760bdfafcc, len 660
--   definicao completa:  md5 572bd75444cd32d42b94c529d7a16e6c, len 787
--   trigger (pg_get_triggerdef): md5 7683db47c1f2b0b969b02bdd024d8282
-- Reaplicado em BEGIN/ROLLBACK sobre o proto: o prosrc resultante tem o MESMO md5 do vivo.

CREATE OR REPLACE FUNCTION public.fn_normalizar_conta_por_direcao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Entrada: a conta mora em conta_destino_id; origem e ruido.
  IF NEW.tipo_operacao LIKE '1-%' THEN
    IF NEW.conta_destino_id IS NULL AND NEW.conta_bancaria_id IS NOT NULL THEN
      NEW.conta_destino_id := NEW.conta_bancaria_id;
    END IF;
    NEW.conta_bancaria_id := NULL;
  -- Saida: a conta mora em conta_bancaria_id.
  ELSIF NEW.tipo_operacao LIKE '2-%' THEN
    IF NEW.conta_bancaria_id IS NULL AND NEW.conta_destino_id IS NOT NULL THEN
      NEW.conta_bancaria_id := NEW.conta_destino_id;
    END IF;
    NEW.conta_destino_id := NULL;
  END IF;
  -- Transferencia (3-): tem duas pernas de verdade; nao se normaliza aqui.
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_00_conta_por_direcao ON public.financeiro_lancamentos_v2;

CREATE TRIGGER trg_00_conta_por_direcao
  BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION fn_normalizar_conta_por_direcao();
