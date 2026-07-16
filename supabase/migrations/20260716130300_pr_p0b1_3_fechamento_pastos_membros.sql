-- PR-P1-SNAPSHOT-CONJUNTO-P0B1 — Migração 3: fechamento_pastos_membros
-- Linhas de um snapshot: identidade operacional congelada de cada pasto APLICAVEL.
--   Um por (snapshot_id, pasto_id). fechamento_pasto_id NULL = aplicavel sem card
--   fechado (NAO e erro estrutural; oficializacao futura exigira preencher). RLS.

CREATE TABLE IF NOT EXISTS public.fechamento_pastos_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.fechamento_p1_snapshot(id) ON DELETE CASCADE,
  fechamento_p1_id uuid NOT NULL REFERENCES public.fechamento_p1(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  ano_mes text NOT NULL,
  pasto_id uuid NOT NULL,
  fechamento_pasto_id uuid NULL REFERENCES public.fechamento_pastos(id),
  nome_exibicao text NOT NULL,
  area_considerada_ha numeric,
  tipo_uso text,
  entra_conciliacao boolean NOT NULL,
  data_inicio_congelada date,
  ativo_congelado boolean NOT NULL,
  card_fechado boolean NOT NULL DEFAULT false,
  vazio_confirmado boolean NOT NULL DEFAULT false,
  quantidade_total integer NOT NULL DEFAULT 0,
  peso_total_congelado numeric NOT NULL DEFAULT 0,
  pasto_versao_id uuid NULL,
  congelado_em timestamptz NOT NULL DEFAULT now(),
  congelado_por uuid,
  UNIQUE (snapshot_id, pasto_id)
);
CREATE INDEX IF NOT EXISTS ix_fpm_snapshot ON public.fechamento_pastos_membros(snapshot_id);
CREATE INDEX IF NOT EXISTS ix_fpm_p1 ON public.fechamento_pastos_membros(fechamento_p1_id);

ALTER TABLE public.fechamento_pastos_membros ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fechamento_pastos_membros' AND policyname='fpm_tenant') THEN
    CREATE POLICY fpm_tenant ON public.fechamento_pastos_membros FOR ALL
      USING (public.is_admin_agroinblue(auth.uid())
             OR cliente_id IN (SELECT t.cliente_id FROM public.get_user_cliente_ids(auth.uid()) AS t(cliente_id)))
      WITH CHECK (public.is_admin_agroinblue(auth.uid())
             OR cliente_id IN (SELECT t.cliente_id FROM public.get_user_cliente_ids(auth.uid()) AS t(cliente_id)));
  END IF;
END $$;

COMMENT ON TABLE public.fechamento_pastos_membros IS
  'Linhas de um snapshot: identidade operacional congelada de cada pasto APLICAVEL. Um por (snapshot_id, pasto_id).';
COMMENT ON COLUMN public.fechamento_pastos_membros.fechamento_pasto_id IS
  'FK ao card. NULL = pasto APLICAVEL ainda SEM card fechado. NAO e erro estrutural — e o estado que a oficializacao (P0-B.3) vai exigir preencher. NAO tornar NOT NULL neste modelo.';
COMMENT ON COLUMN public.fechamento_pastos_membros.card_fechado IS
  'Estado do card no momento do congelamento (true se status=fechado). Nao e derivavel a posteriori pois o card pode mudar.';
