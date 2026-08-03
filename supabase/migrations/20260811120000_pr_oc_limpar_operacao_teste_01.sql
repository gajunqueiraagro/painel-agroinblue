-- PR-OC-LIMPEZA-HOMOLOGACAO-02 — ferramenta ADMINISTRATIVA de remoção de OC de TESTE (is_teste=true).
--   Remove fisicamente, numa única transação, TODAS as linhas exclusivas de uma OC de homologação (rebanho +
--   financeiro + documentos + tabelas OC), com snapshot de auditoria ANTES. Bloqueia operações reais
--   (is_teste=false), efeitos ativos (liquidação/conciliação/título realizado) e vínculos externos.
--   NÃO altera writers/fluxo/UI. Só admin AgroinBLUE. Cache zootécnico é reconstruído em passo pós-commit
--   (a RPC retorna fazendas/anos afetados). Ordem de exclusão validada pelas FKs (folhas → raiz).
-- ─────────────────────────────────────────────────────────────────────────────

-- Trilha forense: guarda o snapshot completo ANTES de cada exclusão.
CREATE TABLE IF NOT EXISTS public.zoo_operacao_exclusoes_teste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  motivo text NOT NULL,
  usuario_executor uuid,
  data_exclusao timestamptz NOT NULL DEFAULT now(),
  contagens_por_tabela jsonb NOT NULL
);
ALTER TABLE public.zoo_operacao_exclusoes_teste ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zoo_oper_excl_teste_admin ON public.zoo_operacao_exclusoes_teste;
CREATE POLICY zoo_oper_excl_teste_admin ON public.zoo_operacao_exclusoes_teste FOR ALL
  USING (public.is_admin_agroinblue(auth.uid())) WITH CHECK (public.is_admin_agroinblue(auth.uid()));

CREATE OR REPLACE FUNCTION public.oc_limpar_operacao_teste(
  p_operacao_id uuid, p_confirmacao uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_titulos uuid[]; v_lancs uuid[];
  v_snapshot jsonb; v_cont jsonb; v_audit_id uuid; v_fazendas jsonb; v_anos jsonb;
BEGIN
  -- Guards de acesso/contrato.
  IF NOT (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor)) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.is_teste IS NOT TRUE THEN RAISE EXCEPTION 'Operacao nao esta marcada como teste.' USING ERRCODE = 'P0001'; END IF;
  IF p_confirmacao IS DISTINCT FROM p_operacao_id THEN RAISE EXCEPTION 'Confirmacao nao corresponde a operacao.' USING ERRCODE = 'P0001'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Limpeza exige motivo' USING ERRCODE = 'P0001'; END IF;

  -- Conjuntos EXCLUSIVOS desta OC.
  SELECT coalesce(array_agg(DISTINCT financeiro_lancamento_id), ARRAY[]::uuid[]) INTO v_titulos
    FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND financeiro_lancamento_id IS NOT NULL;
  SELECT coalesce(array_agg(DISTINCT movimentacao_id), ARRAY[]::uuid[]) INTO v_lancs
    FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id AND movimentacao_id IS NOT NULL;

  -- Guards de EFEITO ATIVO / VÍNCULO EXTERNO.
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes WHERE operacao_id = p_operacao_id AND estornado IS NOT TRUE) THEN
    RAISE EXCEPTION 'Operacao possui liquidacao ativa; limpeza bloqueada.' USING ERRCODE = 'P0001'; END IF;
  IF array_length(v_titulos,1) IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.conciliacao_bancaria_itens WHERE desfeito_em IS NULL AND lancamento_id = ANY(v_titulos)) THEN
    RAISE EXCEPTION 'Operacao possui conciliacao bancaria ativa; limpeza bloqueada.' USING ERRCODE = 'P0001'; END IF;
  IF array_length(v_titulos,1) IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE id = ANY(v_titulos) AND cancelado IS NOT TRUE
         AND (status_transacao IN ('realizado','conciliado') OR conciliado_em IS NOT NULL)) THEN
    RAISE EXCEPTION 'Operacao possui titulo financeiro realizado/conciliado; limpeza bloqueada.' USING ERRCODE = 'P0001'; END IF;
  IF array_length(v_titulos,1) IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id = ANY(v_titulos) AND operacao_id <> p_operacao_id)
    OR EXISTS (SELECT 1 FROM public.financiamentos WHERE lancamento_captacao_id = ANY(v_titulos))
    OR EXISTS (SELECT 1 FROM public.financiamento_parcelas WHERE lancamento_juros_id = ANY(v_titulos))
    OR EXISTS (SELECT 1 FROM public.extrato_bancario_staging_itens WHERE lancamento_sugerido_id = ANY(v_titulos))
    OR EXISTS (SELECT 1 FROM public.financeiro_classificacao_staging WHERE match_lancamento_id = ANY(v_titulos))
  ) THEN RAISE EXCEPTION 'Operacao possui titulo com vinculo externo (nao exclusivo); limpeza bloqueada.' USING ERRCODE = 'P0001'; END IF;

  -- Fazendas/anos afetados p/ cache rebuild (ANTES de apagar os lançamentos).
  SELECT jsonb_agg(DISTINCT fazenda_id), jsonb_agg(DISTINCT extract(year FROM data)::int)
    INTO v_fazendas, v_anos FROM public.lancamentos WHERE id = ANY(v_lancs);

  -- Contagens por tabela.
  v_cont := jsonb_build_object(
    'partes', (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id),
    'liquidacoes', (SELECT count(*) FROM public.zoo_operacao_liquidacoes WHERE operacao_id = p_operacao_id),
    'parcelas', (SELECT count(*) FROM public.zoo_operacao_parcelas_programacao pp JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id WHERE c.operacao_id = p_operacao_id),
    'programacoes', (SELECT count(*) FROM public.zoo_operacao_programacoes pr JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id WHERE c.operacao_id = p_operacao_id),
    'compromissos', (SELECT count(*) FROM public.zoo_operacao_compromissos WHERE operacao_id = p_operacao_id),
    'documentos', (SELECT count(*) FROM public.zoo_operacao_documentos WHERE operacao_id = p_operacao_id),
    'movimentacoes', (SELECT count(*) FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id),
    'lancamentos', coalesce(array_length(v_lancs,1),0),
    'titulos', coalesce(array_length(v_titulos,1),0),
    'lotes', (SELECT count(*) FROM public.zoo_operacao_lotes WHERE operacao_id = p_operacao_id),
    'eventos', (SELECT count(*) FROM public.zoo_operacao_eventos WHERE operacao_id = p_operacao_id),
    'operacoes', 1);

  -- Snapshot completo (op + dependências) ANTES da remoção.
  v_snapshot := jsonb_build_object(
    'operacao', to_jsonb(v_op),
    'compromissos', (SELECT jsonb_agg(to_jsonb(c)) FROM public.zoo_operacao_compromissos c WHERE c.operacao_id = p_operacao_id),
    'programacoes', (SELECT jsonb_agg(to_jsonb(pr)) FROM public.zoo_operacao_programacoes pr JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id WHERE c.operacao_id = p_operacao_id),
    'parcelas', (SELECT jsonb_agg(to_jsonb(pp)) FROM public.zoo_operacao_parcelas_programacao pp JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id WHERE c.operacao_id = p_operacao_id),
    'partes', (SELECT jsonb_agg(to_jsonb(p)) FROM public.zoo_operacao_partes p WHERE p.operacao_id = p_operacao_id),
    'movimentacoes', (SELECT jsonb_agg(to_jsonb(m)) FROM public.zoo_operacao_movimentacoes m WHERE m.operacao_id = p_operacao_id),
    'lancamentos', (SELECT jsonb_agg(to_jsonb(l)) FROM public.lancamentos l WHERE l.id = ANY(v_lancs)),
    'titulos', (SELECT jsonb_agg(to_jsonb(fl)) FROM public.financeiro_lancamentos_v2 fl WHERE fl.id = ANY(v_titulos)),
    'lotes', (SELECT jsonb_agg(to_jsonb(lo)) FROM public.zoo_operacao_lotes lo WHERE lo.operacao_id = p_operacao_id),
    'documentos', (SELECT jsonb_agg(to_jsonb(d)) FROM public.zoo_operacao_documentos d WHERE d.operacao_id = p_operacao_id),
    'liquidacoes', (SELECT jsonb_agg(to_jsonb(lq)) FROM public.zoo_operacao_liquidacoes lq WHERE lq.operacao_id = p_operacao_id),
    'eventos', (SELECT jsonb_agg(to_jsonb(e)) FROM public.zoo_operacao_eventos e WHERE e.operacao_id = p_operacao_id));

  INSERT INTO public.zoo_operacao_exclusoes_teste (operacao_id, cliente_id, snapshot, motivo, usuario_executor, contagens_por_tabela)
  VALUES (p_operacao_id, v_op.cliente_id, v_snapshot, p_motivo, v_actor, v_cont) RETURNING id INTO v_audit_id;

  -- EXCLUSÃO ordenada (folhas → raiz), atômica. Só linhas EXCLUSIVAS desta OC.
  DELETE FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id;                                          -- 1
  DELETE FROM public.zoo_operacao_liquidacoes WHERE operacao_id = p_operacao_id;                                     -- 2
  DELETE FROM public.zoo_operacao_parcelas_programacao pp USING public.zoo_operacao_programacoes pr, public.zoo_operacao_compromissos c
    WHERE pp.programacao_id = pr.id AND pr.compromisso_id = c.id AND c.operacao_id = p_operacao_id;                  -- 3
  DELETE FROM public.zoo_operacao_programacoes pr USING public.zoo_operacao_compromissos c
    WHERE pr.compromisso_id = c.id AND c.operacao_id = p_operacao_id;                                               -- 4
  DELETE FROM public.zoo_operacao_compromissos WHERE operacao_id = p_operacao_id;                                    -- 5
  DELETE FROM public.zoo_operacao_documentos WHERE operacao_id = p_operacao_id;                                      -- 6 (cascateia componentes/doc_lotes)
  DELETE FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id;                                   -- 7
  IF array_length(v_lancs,1) IS NOT NULL THEN DELETE FROM public.lancamentos WHERE id = ANY(v_lancs); END IF;        -- 8 (zoo exclusivos)
  IF array_length(v_titulos,1) IS NOT NULL THEN DELETE FROM public.financeiro_lancamentos_v2 WHERE id = ANY(v_titulos); END IF; -- 9 (títulos exclusivos; cascateia cbi)
  DELETE FROM public.zoo_operacao_lotes WHERE operacao_id = p_operacao_id;                                           -- 10
  DELETE FROM public.zoo_operacao_eventos WHERE operacao_id = p_operacao_id;                                         -- 11 (RESTRICT na raiz → antes)
  DELETE FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;                                              -- 12 (raiz)

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'auditoria_id', v_audit_id,
    'contagens_removidas_por_tabela', v_cont,
    'fazendas_afetadas', coalesce(v_fazendas, '[]'::jsonb), 'anos_afetados', coalesce(v_anos, '[]'::jsonb));
END;
$$;

-- Grants: RPC administrativa (authenticated + service_role, sem PUBLIC/anon). Controle real = guard admin interno.
REVOKE ALL ON FUNCTION public.oc_limpar_operacao_teste(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_limpar_operacao_teste(uuid,uuid,text) TO authenticated, service_role;
