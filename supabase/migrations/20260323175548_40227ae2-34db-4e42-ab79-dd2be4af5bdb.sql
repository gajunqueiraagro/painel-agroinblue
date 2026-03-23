ALTER TABLE public.fechamento_pastos
  ADD COLUMN lote_mes text,
  ADD COLUMN tipo_uso_mes text,
  ADD COLUMN qualidade_mes integer,
  ADD COLUMN observacao_mes text;