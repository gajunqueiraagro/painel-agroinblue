-- P138 (OK do Gabriel 27/10/2026 17:0x) — OS ANTIGOS SEM SAFRA recebem a safra da competencia, com BACKUP e DESFAZER, cliente a cliente
-- (o modelo do P118). Previa: ~/Downloads/p138-backfill-previa.md (23.889 no proto). Depende da 20261028112460 (a regra unica).
-- Quem entra: lancamento ativo (nao cancelado, cenario nao meta), de pecuaria ou lavoura, SEM safra, cuja competencia cai em UMA safra ativa
-- do escopo (`_fn_safra_da_competencia`). FORA (Gabriel): financiamento/consorcio (`origem_lancamento` 'parcela_financiamento' ou
-- 'financiamento': 331 no proto — esperam a FASE 0 do DRE da Lavoura) e os ids passados em `p_excluir` (os 14 "Amendoim 2025/2026" do NJ,
-- que o Gabriel classifica a mao). Conciliados entram (safra e' classificacao, P93).
-- (a) `safra_backfill_backup`: cada troca (lancamento, cliente, safra antes, safra nova, quando, desfeito quando).
-- (b) `fn_safra_backfill_aplicar(cliente, simular, excluir)`: `app.via` = 'p138-safra' (Auditoria: "sistema:p138-safra"); simular = o mesmo
--     caminho, desfeito no fim (SQLSTATE 'SBSIM'), devolvendo as contagens por safra.
-- (c) `fn_safra_backfill_desfazer(cliente)`: volta a safra de antes de quem AINDA tem a nova (o que alguem mudou depois fica e e' contado).
-- So' postgres / service_role (REVOKE); usuario logado so' se for admin AgroInBlue (guarda de cliente das migrations).
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.safra_backfill_backup (
  id bigserial PRIMARY KEY,
  lancamento_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  safra_antes uuid,
  safra_nova uuid NOT NULL,
  feito_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  desfeito_em timestamptz
);
CREATE INDEX IF NOT EXISTS ix_safra_backfill_backup_cli ON public.safra_backfill_backup (cliente_id, lancamento_id);
ALTER TABLE public.safra_backfill_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.safra_backfill_backup FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_safra_backfill_aplicar(p_cliente uuid, p_simular boolean DEFAULT true, p_excluir uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_ret jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: o preenchimento da safra e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.'; END IF;
  BEGIN
    PERFORM set_config('app.via', 'p138-safra', true);
    WITH alvo AS (
      SELECT l.id, l.cliente_id, public._fn_safra_da_competencia(l.cliente_id, l.escopo_negocio, l.data_competencia) nova
        FROM financeiro_lancamentos_v2 l
       WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.cenario IS DISTINCT FROM 'meta'
         AND l.safra_id IS NULL AND l.escopo_negocio IN ('pecuaria', 'agricultura')
         AND coalesce(l.origem_lancamento, '') NOT IN ('parcela_financiamento', 'financiamento')
         AND NOT (l.id = ANY (coalesce(p_excluir, '{}')))
       FOR UPDATE
    ), feito AS (
      UPDATE financeiro_lancamentos_v2 l SET safra_id = a.nova
        FROM alvo a WHERE l.id = a.id AND a.nova IS NOT NULL
      RETURNING l.id, l.cliente_id, l.safra_id
    )
    INSERT INTO safra_backfill_backup (lancamento_id, cliente_id, safra_antes, safra_nova)
    SELECT id, cliente_id, NULL, safra_id FROM feito;
    SELECT jsonb_build_object('simulado', coalesce(p_simular, true),
             'por_safra', coalesce(jsonb_agg(jsonb_build_object('safra', s.nome, 'n', x.n) ORDER BY s.nome), '[]'::jsonb),
             'total', coalesce(sum(x.n), 0))
      INTO v_ret
      FROM (SELECT b.safra_nova, count(*) n FROM safra_backfill_backup b
             WHERE b.cliente_id = p_cliente AND b.desfeito_em IS NULL AND b.feito_em >= now() GROUP BY 1) x
      JOIN financeiro_safras s ON s.id = x.safra_nova;
    IF coalesce(p_simular, true) THEN RAISE EXCEPTION USING ERRCODE = 'SBSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'SBSIM' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;
REVOKE ALL ON FUNCTION public.fn_safra_backfill_aplicar(uuid, boolean, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_safra_backfill_desfazer(p_cliente uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_n int := 0; v_ficaram int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: o preenchimento da safra e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.via', 'p138-safra-desfazer', true);
  WITH volta AS (
    UPDATE financeiro_lancamentos_v2 l SET safra_id = b.safra_antes
      FROM safra_backfill_backup b
     WHERE b.cliente_id = p_cliente AND b.desfeito_em IS NULL AND b.lancamento_id = l.id AND l.safra_id IS NOT DISTINCT FROM b.safra_nova
    RETURNING b.id)
  UPDATE safra_backfill_backup b SET desfeito_em = clock_timestamp() FROM volta WHERE b.id = volta.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT count(*) INTO v_ficaram FROM safra_backfill_backup WHERE cliente_id = p_cliente AND desfeito_em IS NULL;
  RETURN jsonb_build_object('voltaram', v_n, 'mudados_depois_ficaram', v_ficaram);
END $f$;
REVOKE ALL ON FUNCTION public.fn_safra_backfill_desfazer(uuid) FROM PUBLIC, anon, authenticated;
