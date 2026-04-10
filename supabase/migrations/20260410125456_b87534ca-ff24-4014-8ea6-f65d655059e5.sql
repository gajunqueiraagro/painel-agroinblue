
-- 1. Create financeiro_duplicidade_log table
CREATE TABLE IF NOT EXISTS public.financeiro_duplicidade_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id uuid REFERENCES public.fazendas(id),
  lote_importacao_id uuid,
  hash_calculado text,
  dados_linha jsonb,
  motivo text,
  lancamento_match_id uuid,
  nivel_duplicidade text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_duplicidade_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver logs do cliente"
  ON public.financeiro_duplicidade_log FOR SELECT
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));

CREATE POLICY "Gestores podem inserir logs"
  ON public.financeiro_duplicidade_log FOR INSERT
  WITH CHECK (public.can_manage_financeiro_importacao_v2(cliente_id));

-- 2. Add nivel_duplicidade to lancamentos
ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS nivel_duplicidade text DEFAULT NULL;

-- 3. Create scoring function
CREATE OR REPLACE FUNCTION public.classificar_nivel_duplicidade(
  _new_data_pagamento date,
  _new_valor numeric,
  _new_tipo_operacao text,
  _new_conta_bancaria_id uuid,
  _new_favorecido_id uuid,
  _new_descricao text,
  _new_numero_documento text,
  _new_subcentro text,
  _existing_data_pagamento date,
  _existing_valor numeric,
  _existing_tipo_operacao text,
  _existing_conta_bancaria_id uuid,
  _existing_favorecido_id uuid,
  _existing_descricao text,
  _existing_numero_documento text,
  _existing_subcentro text
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  _nucleo_match boolean;
  _diff_count int := 0;
  _doc_diverge boolean := false;
BEGIN
  _nucleo_match := (
    _new_data_pagamento IS NOT DISTINCT FROM _existing_data_pagamento
    AND round(coalesce(_new_valor,0)::numeric,2) = round(coalesce(_existing_valor,0)::numeric,2)
    AND lower(btrim(coalesce(_new_tipo_operacao,''))) = lower(btrim(coalesce(_existing_tipo_operacao,'')))
    AND _new_conta_bancaria_id IS NOT DISTINCT FROM _existing_conta_bancaria_id
  );

  IF NOT _nucleo_match THEN
    RETURN 'LEGITIMO';
  END IF;

  IF _new_favorecido_id IS DISTINCT FROM _existing_favorecido_id THEN
    _diff_count := _diff_count + 1;
  END IF;

  IF lower(btrim(coalesce(_new_descricao,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_descricao,'')))
     AND (btrim(coalesce(_new_descricao,'')) <> '' OR btrim(coalesce(_existing_descricao,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  IF btrim(coalesce(_new_numero_documento,'')) <> '' AND btrim(coalesce(_existing_numero_documento,'')) <> '' THEN
    IF lower(btrim(_new_numero_documento)) <> lower(btrim(_existing_numero_documento)) THEN
      _doc_diverge := true;
      _diff_count := _diff_count + 1;
    END IF;
  END IF;

  IF lower(btrim(coalesce(_new_subcentro,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_subcentro,'')))
     AND (btrim(coalesce(_new_subcentro,'')) <> '' OR btrim(coalesce(_existing_subcentro,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  IF _diff_count = 0 THEN
    RETURN 'D1';
  ELSIF _diff_count = 1 AND NOT _doc_diverge THEN
    RETURN 'D2';
  ELSIF _diff_count <= 2 THEN
    RETURN 'D3';
  ELSE
    RETURN 'LEGITIMO';
  END IF;
END;
$function$;

-- 4. Update enforce trigger for multinível
CREATE OR REPLACE FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _best_nivel text := 'LEGITIMO';
  _candidate text;
  _rec record;
BEGIN
  IF NEW.lote_importacao_id IS NULL OR coalesce(NEW.cancelado, false) = true THEN
    RETURN NEW;
  END IF;

  FOR _rec IN
    SELECT favorecido_id, descricao, numero_documento, subcentro,
           data_pagamento, valor, tipo_operacao, conta_bancaria_id
    FROM public.financeiro_lancamentos_v2
    WHERE id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND lote_importacao_id IS NOT NULL
      AND coalesce(cancelado, false) = false
      AND cliente_id = NEW.cliente_id
      AND fazenda_id = NEW.fazenda_id
      AND data_pagamento IS NOT DISTINCT FROM NEW.data_pagamento
      AND round(valor::numeric, 2) = round(NEW.valor::numeric, 2)
      AND lower(btrim(coalesce(tipo_operacao, ''))) = lower(btrim(coalesce(NEW.tipo_operacao, '')))
      AND conta_bancaria_id IS NOT DISTINCT FROM NEW.conta_bancaria_id
  LOOP
    _candidate := public.classificar_nivel_duplicidade(
      NEW.data_pagamento, NEW.valor, NEW.tipo_operacao, NEW.conta_bancaria_id,
      NEW.favorecido_id, NEW.descricao, NEW.numero_documento, NEW.subcentro,
      _rec.data_pagamento, _rec.valor, _rec.tipo_operacao, _rec.conta_bancaria_id,
      _rec.favorecido_id, _rec.descricao, _rec.numero_documento, _rec.subcentro
    );

    IF _candidate = 'D1' THEN _best_nivel := 'D1'; EXIT;
    ELSIF _candidate = 'D2' AND _best_nivel NOT IN ('D1') THEN _best_nivel := 'D2';
    ELSIF _candidate = 'D3' AND _best_nivel NOT IN ('D1','D2') THEN _best_nivel := 'D3';
    END IF;
  END LOOP;

  IF _best_nivel IN ('D1','D2','D3') THEN
    NEW.importado_duplicado := true;
    NEW.nivel_duplicidade := _best_nivel;
  ELSE
    NEW.nivel_duplicidade := NULL;
  END IF;

  RETURN NEW;
END;
$function$;
