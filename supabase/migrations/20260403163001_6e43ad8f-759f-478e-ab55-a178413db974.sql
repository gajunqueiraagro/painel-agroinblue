
ALTER TABLE public.boitel_operacoes
  ADD COLUMN possui_adiantamento boolean NOT NULL DEFAULT false,
  ADD COLUMN data_adiantamento date,
  ADD COLUMN pct_adiantamento_diarias numeric NOT NULL DEFAULT 0,
  ADD COLUMN valor_adiantamento_diarias numeric NOT NULL DEFAULT 0,
  ADD COLUMN valor_adiantamento_sanitario numeric NOT NULL DEFAULT 0,
  ADD COLUMN valor_adiantamento_outros numeric NOT NULL DEFAULT 0,
  ADD COLUMN valor_total_antecipado numeric NOT NULL DEFAULT 0,
  ADD COLUMN adiantamento_observacao text;
