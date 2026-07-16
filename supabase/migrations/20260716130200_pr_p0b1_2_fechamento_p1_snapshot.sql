-- PR-P1-SNAPSHOT-CONJUNTO-P0B1 — Migração 2: fechamento_p1_snapshot
-- Entidade soberana do snapshot. Vigente = UNICA linha status=vigente por
--   fechamento_p1 (indice parcial ux_fp1snap_vigente, predicado ENUM explicito NI-1).
-- Sem ponteiro em fechamento_p1 (evita dupla fonte de verdade). RLS multi-tenant.

CREATE TABLE IF NOT EXISTS public.fechamento_p1_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_p1_id uuid NOT NULL REFERENCES public.fechamento_p1(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  ano_mes text NOT NULL,
  status public.snapshot_status NOT NULL DEFAULT 'vigente',
  schema_version integer NOT NULL DEFAULT 1,
  membros_count integer NOT NULL DEFAULT 0,
  motivo_invalidacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  invalidado_em timestamptz,
  substitui_snapshot_id uuid REFERENCES public.fechamento_p1_snapshot(id),
  substituido_por      uuid REFERENCES public.fechamento_p1_snapshot(id)
);
CREATE INDEX IF NOT EXISTS ix_fp1snap_p1 ON public.fechamento_p1_snapshot(fechamento_p1_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fp1snap_vigente
  ON public.fechamento_p1_snapshot(fechamento_p1_id)
  WHERE status = 'vigente'::public.snapshot_status;   -- NI-1: predicado ENUM explícito

ALTER TABLE public.fechamento_p1_snapshot ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fechamento_p1_snapshot' AND policyname='fp1snap_tenant') THEN
    CREATE POLICY fp1snap_tenant ON public.fechamento_p1_snapshot FOR ALL
      USING (public.is_admin_agroinblue(auth.uid())
             OR cliente_id IN (SELECT t.cliente_id FROM public.get_user_cliente_ids(auth.uid()) AS t(cliente_id)))
      WITH CHECK (public.is_admin_agroinblue(auth.uid())
             OR cliente_id IN (SELECT t.cliente_id FROM public.get_user_cliente_ids(auth.uid()) AS t(cliente_id)));
  END IF;
END $$;

COMMENT ON TABLE public.fechamento_p1_snapshot IS
  'Entidade soberana do snapshot do conjunto do P1. Vigente = UNICA linha status=vigente por fechamento_p1 (ux_fp1snap_vigente). Sem ponteiro em fechamento_p1 (evita dupla fonte de verdade). Historico preservado; nunca deletado. Ligacao dupla: substitui_snapshot_id (anterior) / substituido_por (sucessor).';
COMMENT ON COLUMN public.fechamento_p1_snapshot.membros_count IS
  'CACHE de leitura rapida. Pode ser recalculado por count(*) em fechamento_pastos_membros do mesmo snapshot_id. NAO e dado soberano.';
COMMENT ON COLUMN public.fechamento_p1_snapshot.schema_version IS
  'Versao da ESTRUTURA do snapshot (nao do conjunto). Permite interpretar snapshots antigos apos evolucoes de schema. Default 1.';
