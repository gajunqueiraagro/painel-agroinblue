-- PR-P1-OFICIALIZACAO-P0B3 — Migração 1: selo de oficializacao em fechamento_p1
-- ALTER aditivo (colunas nullable / com default). Selo aponta o conjunto/area
--   OFICIALIZADOS (nao o vigente atual); payload = prova imutavel da area do selo.

ALTER TABLE public.fechamento_p1
  ADD COLUMN IF NOT EXISTS conjunto_oficializado_snapshot_id uuid NULL
    REFERENCES public.fechamento_p1_snapshot(id),
  ADD COLUMN IF NOT EXISTS area_oficializada_snapshot_id uuid NULL
    REFERENCES public.fechamento_area_snapshot(id),
  ADD COLUMN IF NOT EXISTS area_oficializada_payload jsonb NULL,
  ADD COLUMN IF NOT EXISTS area_oficializada_schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS oficializado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS oficializado_por uuid NULL;
COMMENT ON COLUMN public.fechamento_p1.conjunto_oficializado_snapshot_id IS
  'Conjunto (fechamento_p1_snapshot) VIGENTE e COMPLETO no ato da oficializacao. Aponta o OFICIALIZADO, nao o vigente atual.';
COMMENT ON COLUMN public.fechamento_p1.area_oficializada_snapshot_id IS
  'Linha de area usada na oficializacao (navegacao). Modelo 1 substituivel: pode ser sobrescrita; prova imutavel em area_oficializada_payload.';
COMMENT ON COLUMN public.fechamento_p1.area_oficializada_payload IS
  'PROVA IMUTAVEL da area oficializada NESTA geracao do selo (todas as categorias + metadados), construida na RPC a partir de fechamento_area_snapshot, nunca do frontend. Modelo 1: preserva o ULTIMO oficial, nao historico de todas as oficializacoes (Modelo 3).';
