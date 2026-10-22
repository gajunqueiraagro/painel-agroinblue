-- CONC-FRASES-02 (correcao) — no "confirmar o valor do extrato" a `pergunta` do `fn_espelho_casar` e' um OBJETO
-- ({lancamento_id, frase}); a 20261028110671 lia-o como texto (a frase sairia o JSON). Agora a frase e' `pergunta.frase`.

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
    WHEN 'confirmar_valor_extrato' THEN coalesce(p_extra->'pergunta'->>'frase', 'O movimento do banco é maior que o lançamento: confirme o valor do banco para casar.')
    WHEN 'minimo_dois_extratos' THEN 'Marque ao menos dois movimentos do banco.'
    WHEN 'contas_diferentes' THEN 'Os movimentos marcados são de contas bancárias diferentes: um lançamento só casa com movimentos de uma conta.'
    WHEN 'extrato_repetido' THEN public._fn_conc_ext_txt(p_ext) || ' foi marcado duas vezes. Desmarque o repetido.'
    ELSE 'Não foi possível casar estes itens.' END)
$$;

DO $confere$
BEGIN
  IF public._fn_conc_frase_casar('confirmar_valor_extrato', NULL, NULL, jsonb_build_object('pergunta', jsonb_build_object('frase', 'X')))->>'frase' <> 'X' THEN
    RAISE EXCEPTION 'CONC-FRASES-02 correcao: conferencia falhou';
  END IF;
END $confere$;
