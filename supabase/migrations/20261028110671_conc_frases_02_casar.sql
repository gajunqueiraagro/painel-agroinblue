-- CONC-FRASES-02 (parte 2) — "Casar com o banco" (`fn_espelho_casar` / `fn_espelho_casar_n1`): cada recusa `ok:false` ganha `frase`
-- pronta (`_fn_conc_frase_casar`), ao lado do codigo; a tela usa a frase. Os auxiliares de texto sao os da 20261028110670.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'CONC-FRASES-02: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'CONC-FRASES-02: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ═══════════════════ "CASAR COM O BANCO": A FRASE EM CADA RECUSA ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_conc_frase_casar(p_motivo text, p_lanc uuid, p_ext uuid, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT jsonb_build_object('frase', CASE p_motivo
    WHEN 'extrato_nao_encontrado' THEN 'O movimento do banco escolhido não existe mais (foi excluído ou reimportado). Atualize a tela e escolha de novo.'
    WHEN 'extrato_ja_conciliado' THEN public._fn_conc_ext_txt(p_ext) || ' já está conciliado. Para casar de novo, desfaça a conciliação dele na Conferência.'
    WHEN 'sem_itens' THEN 'Marque ao menos um lançamento para casar.'
    WHEN 'lancamento_nao_encontrado' THEN 'Um dos lançamentos escolhidos não existe mais. Atualize a tela e escolha de novo.'
    WHEN 'cliente_divergente' THEN CASE WHEN p_lanc IS NOT NULL
      THEN format('O lançamento %s é de outro cliente. Escolha um lançamento deste cliente.', public._fn_conc_lanc_txt(p_lanc))
      ELSE public._fn_conc_ext_txt(p_ext) || ' é de outro cliente. Desmarque-o.' END
    WHEN 'lancamento_cancelado' THEN format('O lançamento %s está cancelado. Reative-o no Financeiro ou escolha outro.', public._fn_conc_lanc_txt(p_lanc))
    WHEN 'lancamento_ja_conciliado' THEN format('O lançamento %s já está conciliado com outro movimento do banco. Desfaça aquela conciliação antes.', public._fn_conc_lanc_txt(p_lanc))
    WHEN 'parcela_pos' THEN 'Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real.'
    WHEN 'valor_invalido' THEN format('O valor informado para o lançamento %s precisa ser maior que zero.', public._fn_conc_lanc_txt(p_lanc))
    WHEN 'direcao_indefinida' THEN format('Não dá para saber se o lançamento %s é entrada ou saída: confira o tipo de operação dele no Financeiro.', public._fn_conc_lanc_txt(p_lanc))
    WHEN 'soma_nao_bate' THEN format('A soma marcada (%s) não bate com o outro lado (%s): diferença de %s. Ajuste os valores ou use "Ligar com a diferença".',
      public._fn_conc_brl(coalesce((p_extra->>'soma')::numeric, (p_extra->>'soma_extratos')::numeric)),
      public._fn_conc_brl(coalesce((p_extra->>'no_extrato')::numeric, (p_extra->>'no_lancamento')::numeric)),
      public._fn_conc_brl((p_extra->>'diferenca')::numeric))
    WHEN 'confirmar_valor_extrato' THEN coalesce(p_extra->>'pergunta', 'O movimento do banco é maior que o lançamento: confirme o valor do banco para casar.')
    WHEN 'minimo_dois_extratos' THEN 'Marque ao menos dois movimentos do banco.'
    WHEN 'contas_diferentes' THEN 'Os movimentos marcados são de contas bancárias diferentes: um lançamento só casa com movimentos de uma conta.'
    WHEN 'extrato_repetido' THEN public._fn_conc_ext_txt(p_ext) || ' foi marcado duas vezes. Desmarque o repetido.'
    ELSE 'Não foi possível casar estes itens.' END)
$$;

SELECT pg_temp._trocar('public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure, 'fbaef5a0529d87c7ef271780c227459f', ARRAY[
  $z$RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';$z$,
  $z$RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a esta conta.', DETAIL = p_extrato_id::text;$z$,
  $a$jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado')$a$,
  $a$public._fn_conc_frase_casar('extrato_nao_encontrado', NULL, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado')$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado')$a$,
  $a$public._fn_conc_frase_casar('extrato_ja_conciliado', NULL, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado')$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'sem_itens')$a$,
  $a$public._fn_conc_frase_casar('sem_itens', NULL, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'sem_itens')$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_encontrado', 'lancamento_id', v_lid)$a$,
  $a$public._fn_conc_frase_casar('lancamento_nao_encontrado', v_lid, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_encontrado', 'lancamento_id', v_lid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'lancamento_id', v_lid)$a$,
  $a$public._fn_conc_frase_casar('cliente_divergente', v_lid, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'lancamento_id', v_lid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado', 'lancamento_id', v_lid)$a$,
  $a$public._fn_conc_frase_casar('lancamento_cancelado', v_lid, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado', 'lancamento_id', v_lid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_conciliado', 'lancamento_id', v_lid)$a$,
  $a$public._fn_conc_frase_casar('lancamento_ja_conciliado', v_lid, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_conciliado', 'lancamento_id', v_lid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'valor_invalido', 'lancamento_id', v_lid)$a$,
  $a$public._fn_conc_frase_casar('valor_invalido', v_lid, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'valor_invalido', 'lancamento_id', v_lid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'direcao_indefinida', 'lancamento_id', v_lid)$a$,
  $a$public._fn_conc_frase_casar('direcao_indefinida', v_lid, p_extrato_id) || jsonb_build_object('ok', false, 'motivo', 'direcao_indefinida', 'lancamento_id', v_lid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'soma_nao_bate', 'no_extrato', v_alvo, 'soma', v_soma, 'diferenca', round(v_soma - v_alvo, 2))$a$,
  $a$public._fn_conc_frase_casar('soma_nao_bate', NULL, p_extrato_id, jsonb_build_object('no_extrato', v_alvo, 'soma', v_soma, 'diferenca', round(v_soma - v_alvo, 2)))
      || jsonb_build_object('ok', false, 'motivo', 'soma_nao_bate', 'no_extrato', v_alvo, 'soma', v_soma, 'diferenca', round(v_soma - v_alvo, 2))$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'confirmar_valor_extrato', 'pergunta', v_perg)$a$,
  $a$public._fn_conc_frase_casar('confirmar_valor_extrato', NULL, p_extrato_id, jsonb_build_object('pergunta', v_perg)) || jsonb_build_object('ok', false, 'motivo', 'confirmar_valor_extrato', 'pergunta', v_perg)$a$
]);

SELECT pg_temp._trocar('public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure, 'a299c1837e299434ac808abd40242758', ARRAY[
  $z$RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';$z$,
  $z$RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a esta conta.', DETAIL = p_lancamento_id::text;$z$,
  $a$jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_encontrado')$a$,
  $a$public._fn_conc_frase_casar('lancamento_nao_encontrado', p_lancamento_id, NULL) || jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_encontrado')$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado')$a$,
  $a$public._fn_conc_frase_casar('lancamento_cancelado', p_lancamento_id, NULL) || jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado')$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_conciliado')$a$,
  $a$public._fn_conc_frase_casar('lancamento_ja_conciliado', p_lancamento_id, NULL) || jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_conciliado')$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'minimo_dois_extratos')$a$,
  $a$public._fn_conc_frase_casar('minimo_dois_extratos', p_lancamento_id, NULL) || jsonb_build_object('ok', false, 'motivo', 'minimo_dois_extratos')$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado', 'extrato_id', v_eid)$a$,
  $a$public._fn_conc_frase_casar('extrato_nao_encontrado', p_lancamento_id, v_eid) || jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado', 'extrato_id', v_eid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'extrato_id', v_eid)$a$,
  $a$public._fn_conc_frase_casar('cliente_divergente', NULL, v_eid) || jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'extrato_id', v_eid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado', 'extrato_id', v_eid)$a$,
  $a$public._fn_conc_frase_casar('extrato_ja_conciliado', p_lancamento_id, v_eid) || jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado', 'extrato_id', v_eid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'contas_diferentes')$a$,
  $a$public._fn_conc_frase_casar('contas_diferentes', p_lancamento_id, NULL) || jsonb_build_object('ok', false, 'motivo', 'contas_diferentes')$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'extrato_repetido', 'extrato_id', v_eid)$a$,
  $a$public._fn_conc_frase_casar('extrato_repetido', p_lancamento_id, v_eid) || jsonb_build_object('ok', false, 'motivo', 'extrato_repetido', 'extrato_id', v_eid)$a$,
  $a$jsonb_build_object('ok', false, 'motivo', 'soma_nao_bate', 'no_lancamento', abs(v_lan.valor), 'soma_extratos', v_soma, 'diferenca', round(v_soma - abs(v_lan.valor), 2))$a$,
  $a$public._fn_conc_frase_casar('soma_nao_bate', p_lancamento_id, NULL, jsonb_build_object('no_lancamento', abs(v_lan.valor), 'soma_extratos', v_soma, 'diferenca', round(v_soma - abs(v_lan.valor), 2)))
      || jsonb_build_object('ok', false, 'motivo', 'soma_nao_bate', 'no_lancamento', abs(v_lan.valor), 'soma_extratos', v_soma, 'diferenca', round(v_soma - abs(v_lan.valor), 2))$a$
]);

REVOKE ALL ON FUNCTION public._fn_conc_frase_casar(text, uuid, uuid, jsonb) FROM PUBLIC, anon;

DO $confere$
BEGIN
  IF position('_fn_conc_frase_casar(''soma_nao_bate''' in pg_get_functiondef('public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure)) = 0
     OR position('Você não tem acesso a esta conta' in pg_get_functiondef('public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONC-FRASES-02: conferencia final falhou';
  END IF;
END $confere$;
