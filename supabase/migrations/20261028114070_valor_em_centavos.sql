-- VG-CENTAVO-ACUMULADO, a trava do banco (Gabriel 31/10/2026 08:25: OK de escrever e ensaiar; GO antes de aplicar) — o VALOR de um
-- lancamento nasce em CENTAVOS. `financeiro_lancamentos_v2.valor` e' `numeric` sem escala: o importador de planilha e o rebanho gravavam
-- fracao (FASE 0: visao-20261030-2330-VG-CENTAVO-fase0; os gravadores: visao-20261031-0809). O front ja' arredonda (`valorDoLancamento`,
-- commit 25437b88); esta trava pega o que escapar.
-- POR QUE GATILHO E NAO CHECK NOT VALID: o NOT VALID so' pula o antigo quando nasce; depois, todo UPDATE de uma linha antiga com fracao e'
-- recusado (medido 31/10: 294 das 299 vivas com fracao foram atualizadas em 60 dias — status, conciliacao, o texto do plano do P176).
-- O gatilho recusa so' quando o valor e' NOVO (insert) ou MUDA e tem fracao; o antigo segue editavel ate' o D1b (os 299, com previa).
-- O contrato (`fn_contrato_editar_e_regenerar`, que copia um `numeric` sem escala; hoje 0 com fracao): fica com esta trava pegando.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_valor_em_centavos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.valor IS DISTINCT FROM OLD.valor) AND NEW.valor <> round(NEW.valor, 2) THEN
    RAISE EXCEPTION 'O valor % tem mais de 2 casas decimais. O lançamento grava em centavos: nada foi gravado.', NEW.valor
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public._fn_valor_em_centavos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_valor_em_centavos ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_valor_em_centavos
  BEFORE INSERT OR UPDATE OF valor ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public._fn_valor_em_centavos();
