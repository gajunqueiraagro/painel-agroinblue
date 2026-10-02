-- PR-CONC-ENRIQ-SAFRA-COMPETENCIA — na PECUARIA a competencia decide a safra; na lavoura a planilha vale e a tela avisa.
--
-- POR QUE
-- A planilha traz a safra por nome ("Pecuaria 2025/2026") e frequentemente ela nao e' a safra da competencia: na 8d6efeb7
-- (NJ, set/26) a safra da proposta/planilha fica fora do periodo em 164 de 202 linhas nao aplicadas de pecuaria e 117 de 123
-- de agricultura. A lavoura atravessa o ano de proposito (colheita de mandioca 25/26 paga em set/26): ali a planilha esta'
-- certa. Decisao do Gabriel (02/10, 14:39): na pecuaria a competencia decide, mesmo quando a planilha diz outra; na lavoura a
-- planilha continua valendo e a tela so' avisa.
-- Medido em 02/10 pela definicao da VIEW (a safra que VAI SER GRAVADA: no classificado e' a do sistema): na 8d6efeb7 28 linhas
-- avisam (5 pecuaria, 23 agricultura, 3 gravadas) e o D2 troca 1 (a 214, safra "Nao se aplica" na planilha -> 26/27-Pec);
-- no proto, 642 avisam e o D2 so' troca essa 1. Os 164/117 acima olham a safra da PLANILHA.
--
-- O QUE MUDA
-- D1  `_fn_safra_da_competencia(cliente, escopo, data)`: a safra ATIVA do escopo cujo periodo (data_inicio..data_fim) contem
--     a data. Zero ou mais de uma candidata -> NULL (sem palpite). Dono UNICO de "safra da competencia" (banco e tela).
--     Medido em 02/10: 41 safras ativas de pecuaria/agricultura, codigo = periodo em todas, nenhuma sobreposicao nem buraco.
-- D2  `_fn_classificacao_precedencia_cru`, ramo do CRU: quando a atividade do topo e' PECUARIA (o escopo do plano que sobe; sem
--     plano, o da safra da planilha), a safra do topo = D1 sobre a competencia que vai ser gravada (a do topo; na falta, a do
--     lancamento). D1 NULO -> a regra de antes (planilha). A planilha continua em `_planilha`. Lavoura, administrativo, sem
--     atividade e o ramo do CLASSIFICADO: nada muda. Linha MANUAL nem entra na precedencia (D3 vem de graca).
-- D5  a view ganha NO FIM `safra_da_competencia_id` (D1 sobre a atividade e a competencia que vao ser gravadas) e
--     `safra_fora_do_periodo` (a safra que vai ser gravada nao contem essa competencia; NULO sem safra ou sem competencia).
--     A atividade da view e' a do plano que vai ser gravado; sem plano, a da safra.
--
-- METODO: patch guardado por md5 de origem (ancoras contadas, destino conferido); CREATE OR REPLACE pelo
-- `pg_get_functiondef` com o corpo trocado — atributos e ACL ficam como estao. Nenhum UPDATE em dado de cliente.
--   precedencia_cru   65bcb707b87f19e8d3f1363a99c2c0b4 -> f9db83d4d416f16b8fbf97f68b401975
--   view (definicao)  94bc36f3653cf7fec6a1f5cd64e751bd -> 5f85748a03422b8b81b711662c1e6148
--   nova: _fn_safra_da_competencia 14c43cf67eab51bfd7dc2ea940feb06a

-- ═══ 1. o dono de "safra da competencia" (D1) ════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public._fn_safra_da_competencia(p_cliente_id uuid, p_escopo text, p_data date)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  -- A safra ATIVA do escopo cujo periodo contem a data; zero ou mais de uma -> NULL (sem palpite).
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(sf.id))[1] END
    FROM public.financeiro_safras sf
   WHERE p_cliente_id IS NOT NULL AND p_escopo IS NOT NULL AND p_data IS NOT NULL
     AND sf.cliente_id = p_cliente_id AND sf.ativa AND sf.escopo_negocio = p_escopo
     AND p_data BETWEEN sf.data_inicio AND sf.data_fim
$fn$;
COMMENT ON FUNCTION public._fn_safra_da_competencia(uuid, text, date) IS
  'PR-CONC-ENRIQ-SAFRA-COMPETENCIA: a safra ATIVA do escopo cujo periodo contem a data (zero ou mais de uma -> NULL). Dono unico de "safra da competencia".';
-- a view (security_invoker) a chama como quem consulta: authenticated precisa de EXECUTE (como _fn_classificacao_linha_livre)
REVOKE ALL ON FUNCTION public._fn_safra_da_competencia(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_safra_da_competencia(uuid, text, date) TO authenticated, service_role;

-- ═══ 2. precedencia_cru — patch guardado por md5 (D2) ════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_oid oid; v_antes text; v_novo text; v_def text;
  a text; b text;
BEGIN
  v_oid := 'public._fn_classificacao_precedencia_cru(uuid)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '65bcb707b87f19e8d3f1363a99c2c0b4' THEN
    RAISE EXCEPTION 'precedencia_cru nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  -- (a) a competencia do lancamento entra na base (a reserva da competencia que vai ser gravada)
  a := $t$AND COALESCE(l.tipo_operacao, '') NOT LIKE '3-%') AS cru,$t$;
  b := $t$AND COALESCE(l.tipo_operacao, '') NOT LIKE '3-%') AS cru,
           -- PR-CONC-ENRIQ-SAFRA-COMPETENCIA (D2): a reserva da competencia que vai ser gravada
           l.data_competencia AS lanc_competencia,$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'precedencia_cru: ancora da base nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_novo, a, b);
  -- (b) o ramo do CRU: na pecuaria a safra do topo e' a da competencia (o CONCEITO "ramo do cru" aparece 1x)
  IF (length(v_novo) - length(replace(v_novo, 'c.cru THEN', ''))) / length('c.cru THEN') <> 1 THEN
    RAISE EXCEPTION 'precedencia_cru: o ramo do cru nao aparece exatamente 1x';
  END IF;
  a := $t$WHEN c.cru THEN (c.p - k_class) || c.pl_topo || c.excel || jsonb_build_object('_planilha', c.pl)$t$;
  b := $t$WHEN c.cru THEN (c.p - k_class) || c.pl_topo || c.excel
               -- PR-CONC-ENRIQ-SAFRA-COMPETENCIA (D2): na PECUARIA a competencia decide a safra (a da planilha fica em
               -- `_planilha`). A atividade e' a do plano que sobe; sem plano (ou plano que a safra derrubou), a da safra da
               -- planilha. Sem safra candidata, vale a planilha. Lavoura, administrativo e sem atividade: nada muda.
               || CASE WHEN (CASE WHEN c.pl_topo ? 'plano_conta_id' THEN c.pc_esc ELSE c.saf_esc END) = 'pecuaria'
                       THEN jsonb_strip_nulls(jsonb_build_object('safra_id', public._fn_safra_da_competencia(c.cliente_id, 'pecuaria',
                              COALESCE(NULLIF(((c.p - k_class) || c.pl_topo || c.excel) ->> 'data_competencia', '')::date,
                                       c.lanc_competencia))::text))
                       ELSE '{}'::jsonb END
               || jsonb_build_object('_planilha', c.pl)$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'precedencia_cru: ancora do ramo do cru nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_novo, a, b);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE replace(v_def, v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> 'f9db83d4d416f16b8fbf97f68b401975' THEN
    RAISE EXCEPTION 'precedencia_cru: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
END $mig$;

-- ═══ 3. a view (D5) — colunas novas NO FIM, patch guardado por md5 ═══════════════════════════════════════════════════
DO $v$
DECLARE
  d text;
  a constant text := $a$s.proposto_editado_em
   FROM ($a$;
BEGIN
  d := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(d) <> '94bc36f3653cf7fec6a1f5cd64e751bd' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview nao esta na definicao esperada (md5 %). Migration abortada.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: a ancora do fim do SELECT nao casa exatamente 1x';
  END IF;
  d := replace(d, a, $b$s.proposto_editado_em,
    public._fn_safra_da_competencia(s.cliente_id,
      COALESCE((SELECT pcg.escopo_negocio FROM financeiro_plano_contas pcg
                 WHERE pcg.id = COALESCE(NULLIF(s.update_proposto ->> 'plano_conta_id', '')::uuid, l.plano_conta_id)),
               (SELECT sfg.escopo_negocio FROM financeiro_safras sfg
                 WHERE sfg.id = COALESCE(NULLIF(s.update_proposto ->> 'safra_id', '')::uuid, l.safra_id))),
      COALESCE(NULLIF(s.update_proposto ->> 'data_competencia', '')::date, l.data_competencia, s.excel_data)) AS safra_da_competencia_id,
    (SELECT NOT (COALESCE(NULLIF(s.update_proposto ->> 'data_competencia', '')::date, l.data_competencia, s.excel_data)
                 BETWEEN sfg.data_inicio AND sfg.data_fim)
       FROM financeiro_safras sfg
      WHERE sfg.id = COALESCE(NULLIF(s.update_proposto ->> 'safra_id', '')::uuid, l.safra_id)) AS safra_fora_do_periodo
   FROM ($b$);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || d;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.vw_classificacao_staging_preview'::regclass
                 AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview perdeu security_invoker';
  END IF;
  IF md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass)) <> '5f85748a03422b8b81b711662c1e6148' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: definicao resultante inesperada (md5 %).',
      md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass));
  END IF;
END $v$;
