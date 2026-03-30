CREATE OR REPLACE FUNCTION public.compute_financeiro_lancamento_v2_hash(
  _cliente_id uuid,
  _fazenda_id uuid,
  _data_competencia date,
  _data_pagamento date,
  _valor numeric,
  _tipo_operacao text,
  _conta_bancaria_id uuid,
  _descricao text,
  _favorecido_id uuid,
  _documento text,
  _nota_fiscal text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT md5(concat_ws('|',
    coalesce(_cliente_id::text, ''),
    coalesce(_fazenda_id::text, ''),
    coalesce(_data_pagamento::text, ''),
    round(coalesce(_valor, 0)::numeric, 2)::text,
    lower(btrim(coalesce(_tipo_operacao, ''))),
    coalesce(_conta_bancaria_id::text, '')
  ));
$function$;

CREATE OR REPLACE FUNCTION public.set_financeiro_lancamento_v2_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lote_importacao_id IS NOT NULL THEN
    NEW.hash_importacao := public.compute_financeiro_lancamento_v2_hash(
      NEW.cliente_id,
      NEW.fazenda_id,
      NEW.data_competencia,
      NEW.data_pagamento,
      NEW.valor,
      NEW.tipo_operacao,
      NEW.conta_bancaria_id,
      NEW.descricao,
      NEW.favorecido_id,
      NEW.documento,
      NEW.nota_fiscal
    );
  ELSE
    NEW.hash_importacao := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lote_importacao_id IS NOT NULL
     AND coalesce(NEW.cancelado, false) = false
     AND EXISTS (
       SELECT 1
       FROM public.financeiro_lancamentos_v2 existing
       WHERE existing.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND existing.lote_importacao_id IS NOT NULL
         AND coalesce(existing.cancelado, false) = false
         AND existing.cliente_id = NEW.cliente_id
         AND existing.fazenda_id = NEW.fazenda_id
         AND existing.data_pagamento IS NOT DISTINCT FROM NEW.data_pagamento
         AND round(existing.valor::numeric, 2) = round(NEW.valor::numeric, 2)
         AND lower(btrim(coalesce(existing.tipo_operacao, ''))) = lower(btrim(coalesce(NEW.tipo_operacao, '')))
         AND existing.conta_bancaria_id IS NOT DISTINCT FROM NEW.conta_bancaria_id
     ) THEN
    RAISE EXCEPTION 'Duplicidade detectada no V2 para este lançamento importado.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_financeiro_lancamento_v2_hash ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_financeiro_lancamento_v2_hash
BEFORE INSERT OR UPDATE OF cliente_id, fazenda_id, data_competencia, data_pagamento, valor, tipo_operacao, conta_bancaria_id, lote_importacao_id
ON public.financeiro_lancamentos_v2
FOR EACH ROW
EXECUTE FUNCTION public.set_financeiro_lancamento_v2_hash();

DROP TRIGGER IF EXISTS trg_financeiro_lancamento_v2_unique_hash ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_financeiro_lancamento_v2_unique_hash
BEFORE INSERT OR UPDATE OF cliente_id, fazenda_id, data_pagamento, valor, tipo_operacao, conta_bancaria_id, cancelado, lote_importacao_id
ON public.financeiro_lancamentos_v2
FOR EACH ROW
EXECUTE FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash();

CREATE UNIQUE INDEX IF NOT EXISTS financeiro_lancamentos_v2_import_dedup_active_uk
ON public.financeiro_lancamentos_v2 (
  cliente_id,
  fazenda_id,
  data_pagamento,
  valor,
  tipo_operacao,
  conta_bancaria_id
)
WHERE coalesce(cancelado, false) = false
  AND lote_importacao_id IS NOT NULL;