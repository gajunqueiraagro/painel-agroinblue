-- P138 (Gabriel 27/10/2026) — A SAFRA DA COMPETENCIA E' UMA REGRA SO', A DO BANCO, E O BANCO A GRAVA.
-- Antes: a tela deduzia a safra pela temporada do CODIGO (`safraSugerida.ts`) e so' o modal/a previa a punham no payload; o "+ Da nota"
-- fora da lavoura, o parcelamento, a importacao e a recorrencia gravavam sem safra quando a tela nao mandava (23.889 lancamentos no proto).
-- Agora: lancamento CRIADO sem safra, de pecuaria ou lavoura, recebe a safra da competencia (`_fn_safra_da_competencia`: a safra ATIVA do
-- escopo cujo periodo contem a data; zero ou mais de uma -> continua sem). Todo caminho de criacao passa aqui (Da nota, parcelamento,
-- importacao, recorrencia, manual, conciliacao). Administrativo e financeiro seguem sem safra (o `trg_resolve_classificacao_plano`, que
-- roda ANTES deste pelo nome, ja' deu o escopo e limpou a safra do administrativo). Financiamento e consorcio: a mesma regra (Gabriel).
-- NA EDICAO o banco nao mexe na safra: o modal mostra a da competencia como sugestao ("Usar"), gravada so' se o operador aceitar.
-- Os antigos NAO mudam aqui (backfill proprio, com previa por cliente e origem e OK do Gabriel).
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_safra_da_competencia_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.safra_id IS NULL AND NEW.escopo_negocio IN ('pecuaria', 'agricultura') AND NEW.data_competencia IS NOT NULL THEN
    NEW.safra_id := public._fn_safra_da_competencia(NEW.cliente_id, NEW.escopo_negocio, NEW.data_competencia);
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public._fn_safra_da_competencia_trg() FROM PUBLIC, anon, authenticated;

-- o nome ordena: depois de `trg_resolve_classificacao_plano` (escopo e safra do administrativo), antes de `trg_zz_cultura_fase_coerente`
CREATE OR REPLACE TRIGGER trg_safra_da_competencia
  BEFORE INSERT ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public._fn_safra_da_competencia_trg();
