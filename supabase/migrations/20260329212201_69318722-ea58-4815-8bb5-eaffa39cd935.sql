
ALTER TABLE public.financeiro_fornecedores
ADD COLUMN IF NOT EXISTS nome_normalizado text,
ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';

-- Create function to auto-generate nome_normalizado
CREATE OR REPLACE FUNCTION public.normalize_fornecedor_nome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.nome_normalizado = upper(
    regexp_replace(
      regexp_replace(
        regexp_replace(NEW.nome, '[^a-zA-Z0-9 ]', ' ', 'g'),
        '\s+', ' ', 'g'
      ),
      '^\s+|\s+$', '', 'g'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_fornecedor_nome
BEFORE INSERT OR UPDATE OF nome ON public.financeiro_fornecedores
FOR EACH ROW
EXECUTE FUNCTION public.normalize_fornecedor_nome();

-- Backfill existing rows
UPDATE public.financeiro_fornecedores SET nome_normalizado = upper(
  regexp_replace(
    regexp_replace(
      regexp_replace(nome, '[^a-zA-Z0-9 ]', ' ', 'g'),
      '\s+', ' ', 'g'
    ),
    '^\s+|\s+$', '', 'g'
  )
);
