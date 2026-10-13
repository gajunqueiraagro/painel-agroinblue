-- OC-CC-MODAL-FINANCEIRO-01 (Gabriel, 13/10/2026), BANCO: a OC em conta corrente lanca pelo modal do Financeiro.
-- DUAS FUNCOES NOVAS, SO' ENCADEAMENTO DOS DONOS QUE JA' EXISTEM (nenhum dono muda; nenhum DDL em tabela; nenhum dado tocado):
--
--   oc_lancar_pelo_modal(...)      "Programar recebimento / pagamento" (principal) e "Nova despesa" (obrigacao) numa chamada:
--                                  oc_criar_compromisso -> oc_programar_compromisso (N parcelas) -> oc_materializar_programacao
--                                  (uma por parcela) -> grava forma, dados de pagamento, documento e observacao nos N lancamentos.
--                                  ⚠ NENHUMA REGRA NOVA DE DRE: o principal (componente 'recebimento') sai do DRE pelo caminho de
--                                  sempre (`_oc_cc_fora_do_dre` + `trg_oc_parte_recalcula_dre`); a despesa entra pela linha do plano.
--                                  PRINCIPAL: componente 'recebimento', favorecido = a contraparte, conta = `_oc_cc_conta_principal`
--                                  (a do lote de maior valor) — o que `oc_programar_recebimento` ja' fazia, agora com N parcelas.
--                                  DESPESA: o plano vem por ID; `oc_criar_compromisso` resolve por NOME, entao o id e' convertido e o
--                                  plano que o dono resolveu e' CONFERIDO contra o id pedido.
--                                  ACIMA DA BASE: recusa do dono, como sempre. ACIMA DO SALDO (base − ja' recebido/pago − ja'
--                                  programado): AVISO `acima_do_saldo` com o excesso, nunca recusa.
--   oc_desfazer_compromisso(...)   o gesto contrario, ATOMICO: oc_estornar_materializacao (uma por parcela com titulo) ->
--                                  oc_cancelar_programacao -> oc_cancelar_compromisso, com UM motivo e UM estorno_id. Ou desfaz
--                                  tudo, ou nada: o que os donos recusam (titulo realizado, conciliado, liquidacao ativa) aborta a
--                                  chamada inteira. Substitui a cadeia de tres idas do front (`src/lib/oc/desfazerCompromisso.ts`).
--
-- SIMULACAO = GRAVACAO nas duas: `p_simular` roda o MESMO caminho e desfaz (SQLSTATE 'OCSIM'); a recusa e' a do proprio caminho.
-- `oc_programar_recebimento` NAO e' tocada (fica no banco, sem chamador no front).

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.oc_lancar_pelo_modal(
  p_operacao_id uuid, p_versao integer, p_natureza text, p_componente text, p_plano_conta_id uuid, p_favorecido_id uuid,
  p_parcelas jsonb, p_forma text, p_dados_pagamento text, p_documento text, p_observacao text, p_descricao text,
  p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_pc public.financeiro_plano_contas;
  v_sub text; v_comp_cod text; v_fav uuid; v_desc text;
  v_n int; v_total numeric; v_parc jsonb; v_item jsonb; v_i int;
  v_x jsonb; v_comp uuid; v_prog uuid; v_ver int;
  v_titulos uuid[] := '{}'; v_linhas jsonb := '[]'::jsonb;
  v_base numeric; v_cc jsonb; v_excesso numeric; v_avisos jsonb := '[]'::jsonb; v_ret jsonb;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.modelo_financeiro IS DISTINCT FROM 'conta_corrente' THEN
    RAISE EXCEPTION 'Lancar pelo modal so existe na operacao em conta corrente' USING ERRCODE = 'P0001'; END IF;
  IF v_op.tipo_operacao NOT IN ('venda', 'compra', 'abate') THEN
    RAISE EXCEPTION 'Conta corrente so existe em venda, compra e abate' USING ERRCODE = 'P0001'; END IF;
  IF p_natureza IS NULL OR p_natureza NOT IN ('principal', 'obrigacao') THEN
    RAISE EXCEPTION 'Informe se o lancamento e o principal ou uma despesa da operacao' USING ERRCODE = 'P0001'; END IF;

  -- as parcelas: ao menos uma, cada uma com valor (2 casas) e vencimento
  IF p_parcelas IS NULL OR jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma parcela' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_parcelas) e
              WHERE coalesce(NULLIF(e->>'valor', '')::numeric, 0) <= 0
                 OR NULLIF(e->>'valor', '')::numeric <> round(NULLIF(e->>'valor', '')::numeric, 2)) THEN
    RAISE EXCEPTION 'Toda parcela precisa de valor maior que zero, com ate duas casas' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_parcelas) e WHERE NULLIF(e->>'vencimento', '') IS NULL) THEN
    RAISE EXCEPTION 'Toda parcela precisa de vencimento' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*), sum((e->>'valor')::numeric) INTO v_n, v_total FROM jsonb_array_elements(p_parcelas) e;
  SELECT jsonb_agg(jsonb_build_object('sequencia', t.i, 'valor', (t.e->>'valor')::numeric, 'vencimento', t.e->>'vencimento',
                                      'conta_bancaria_id', NULLIF(t.e->>'conta_id', ''), 'forma', NULLIF(btrim(coalesce(p_forma, '')), ''))
                   ORDER BY t.i)
    INTO v_parc FROM jsonb_array_elements(p_parcelas) WITH ORDINALITY t(e, i);

  IF p_natureza = 'principal' THEN
    -- o principal da conta corrente: 'recebimento', da contraparte, na conta da OC (a do lote de maior valor)
    IF NULLIF(p_componente, '') IS NOT NULL AND p_componente <> 'recebimento' THEN
      RAISE EXCEPTION 'O principal da conta corrente e sempre o recebimento ou pagamento da operacao' USING ERRCODE = 'P0001'; END IF;
    IF p_favorecido_id IS NOT NULL AND p_favorecido_id IS DISTINCT FROM v_op.contraparte_id THEN
      RAISE EXCEPTION 'No principal o favorecido e a contraparte da operacao' USING ERRCODE = 'P0001'; END IF;
    v_comp_cod := 'recebimento';
    v_fav := v_op.contraparte_id;
    v_sub := public._oc_cc_conta_principal(p_operacao_id);
    IF v_sub IS NULL THEN
      RAISE EXCEPTION 'A operacao nao tem lote com conta para o principal' USING ERRCODE = 'P0001'; END IF;
    v_desc := coalesce(NULLIF(btrim(coalesce(p_descricao, '')), ''),
      format('%s %s cab · %s', public._oc_cc_verbo(v_op.tipo_operacao),
        lpad(coalesce((SELECT sum(lo.qtd_negociada) FROM public.zoo_operacao_lotes lo WHERE lo.operacao_id = p_operacao_id), 0)::text, 3, '0'),
        CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Pagamento' ELSE 'Recebimento' END));
  ELSE
    IF NULLIF(p_componente, '') IS NULL THEN
      RAISE EXCEPTION 'Informe o item da operacao (frete, comissao, taxas...)' USING ERRCODE = 'P0001'; END IF;
    IF p_plano_conta_id IS NULL THEN
      RAISE EXCEPTION 'Informe a classificacao da despesa' USING ERRCODE = 'P0001'; END IF;
    SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
     WHERE pc.id = p_plano_conta_id AND pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id = v_op.cliente_id);
    IF v_pc.id IS NULL THEN
      RAISE EXCEPTION 'Classificacao nao encontrada no plano de contas deste cliente' USING ERRCODE = 'P0001'; END IF;
    v_comp_cod := p_componente;
    v_fav := p_favorecido_id;
    v_sub := v_pc.subcentro;
    v_desc := NULLIF(btrim(coalesce(p_descricao, '')), '');
  END IF;

  -- (1) o compromisso, pelo dono (guarda de acesso, de versao, de base e de catalogo sao dele)
  v_x := public.oc_criar_compromisso(p_operacao_id, CASE WHEN p_simular THEN v_op.versao ELSE p_versao END,
           jsonb_build_object('natureza', p_natureza, 'componente', v_comp_cod, 'valor_total', v_total,
                              'favorecido_id', v_fav, 'subcentro', v_sub, 'descricao', v_desc));
  v_comp := (v_x->'compromisso'->>'id')::uuid; v_ver := (v_x->>'operacao_versao')::int;
  -- o dono resolve o plano pelo NOME do subcentro: confere que e' o MESMO plano pedido por id
  IF p_natureza = 'obrigacao' AND (v_x->'compromisso'->>'plano_conta_id')::uuid IS DISTINCT FROM p_plano_conta_id THEN
    RAISE EXCEPTION 'A classificacao escolhida nao e a que o plano resolve para "%"', v_sub USING ERRCODE = 'P0001'; END IF;

  -- (2) a programacao, com as N parcelas
  v_x := public.oc_programar_compromisso(p_operacao_id, v_ver, v_comp,
           jsonb_build_object('condicoes', CASE WHEN p_natureza = 'obrigacao' THEN 'despesa da operacao, lancada pelo modal do Financeiro'
                                                 WHEN v_op.tipo_operacao = 'compra' THEN 'pagamento futuro da conta corrente'
                                                 ELSE 'recebimento futuro da conta corrente' END,
                              'parcelas', v_parc));
  v_prog := (v_x->'programacao'->>'id')::uuid; v_ver := (v_x->>'operacao_versao')::int;

  -- (3) um titulo programado por parcela
  v_i := 0;
  FOR v_item IN SELECT e FROM jsonb_array_elements(v_x->'parcelas') e ORDER BY (e->>'sequencia')::int LOOP
    v_i := v_i + 1;
    v_x := public.oc_materializar_programacao(p_operacao_id, v_ver, v_prog, (v_item->>'id')::uuid);
    v_ver := (v_x->>'operacao_versao')::int;
    v_titulos := v_titulos || (v_x->'titulo'->>'id')::uuid;
    v_linhas := v_linhas || jsonb_build_object('sequencia', (v_item->>'sequencia')::int, 'parcela_id', v_item->>'id',
                  'titulo_id', v_x->'titulo'->>'id', 'valor', (v_item->>'valor')::numeric, 'vencimento', v_item->>'vencimento');
  END LOOP;
  IF v_i <> v_n THEN RAISE EXCEPTION 'Nem toda parcela virou lancamento (% de %)', v_i, v_n USING ERRCODE = 'P0001'; END IF;

  -- (4) o que os donos nao recebem: forma, dados de pagamento, documento e observacao, nos N lancamentos
  UPDATE public.financeiro_lancamentos_v2 f
     SET forma_pagamento  = coalesce(NULLIF(btrim(coalesce(p_forma, '')), ''), f.forma_pagamento),
         dados_pagamento  = coalesce(to_jsonb(NULLIF(btrim(coalesce(p_dados_pagamento, '')), '')), f.dados_pagamento),
         numero_documento = coalesce(NULLIF(btrim(coalesce(p_documento, '')), ''), f.numero_documento),
         observacao       = coalesce(NULLIF(btrim(coalesce(p_observacao, '')), ''), f.observacao),
         updated_at = now(), updated_by = auth.uid()
   WHERE f.id = ANY (v_titulos);

  -- acima do saldo (base − ja' recebido/pago − ja' programado): AVISA, nunca recusa. Acima da base o dono ja' recusou.
  IF p_natureza = 'principal' THEN
    SELECT b.base INTO v_base FROM public._oc_base_saldo_operacao(p_operacao_id) b;
    v_base := coalesce(v_base, 0) + public._oc_acertos_boitel_produtor(p_operacao_id);
    v_cc := public.oc_conta_corrente(p_operacao_id);
    v_excesso := round(coalesce((v_cc->>'recebido')::numeric, 0) + coalesce((v_cc->>'programado')::numeric, 0) - v_base, 2);
    IF v_excesso > 0 THEN
      v_avisos := v_avisos || jsonb_build_object('codigo', 'acima_do_saldo', 'excesso', v_excesso, 'base', round(v_base, 2),
                    'recebido', round(coalesce((v_cc->>'recebido')::numeric, 0), 2),
                    'programado', round(coalesce((v_cc->>'programado')::numeric, 0), 2));
    END IF;
  END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (v_op.cliente_id, p_operacao_id, 'lancar_pelo_modal',
          jsonb_build_object('natureza', p_natureza, 'componente', v_comp_cod, 'compromisso_id', v_comp, 'programacao_id', v_prog,
            'parcelas', v_linhas, 'total', v_total, 'avisos', v_avisos), auth.uid(), 'rpc');

  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'natureza', p_natureza, 'componente', v_comp_cod,
    'compromisso_id', v_comp, 'programacao_id', v_prog, 'parcelas', v_linhas, 'total', v_total, 'avisos', v_avisos,
    -- a classificacao que o compromisso recebeu: no principal e' a da OC, e o modal a mostra travada (le^ da simulacao)
    'classificacao', jsonb_build_object('subcentro', v_sub,
      'plano_conta_id', (SELECT c.plano_conta_id FROM public.zoo_operacao_compromissos c WHERE c.id = v_comp)),
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_ver END);
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao do lancamento pelo modal (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$function$;
REVOKE ALL ON FUNCTION public.oc_lancar_pelo_modal(uuid, integer, text, text, uuid, uuid, jsonb, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_lancar_pelo_modal(uuid, integer, text, text, uuid, uuid, jsonb, text, text, text, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oc_desfazer_compromisso(
  p_operacao_id uuid, p_versao integer, p_compromisso_id uuid, p_motivo text, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_comp public.zoo_operacao_compromissos;
  v_estorno uuid := gen_random_uuid();
  v_ver int; v_x jsonb; r record;
  v_titulos jsonb := '[]'::jsonb; v_progs int := 0; v_ret jsonb;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Desfazer exige motivo' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
   WHERE id = p_compromisso_id AND operacao_id = p_operacao_id AND cliente_id = v_op.cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compromisso % nao encontrado nesta operacao', p_compromisso_id USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status = 'cancelado' THEN RAISE EXCEPTION 'Compromisso ja cancelado' USING ERRCODE = 'P0001'; END IF;
  v_ver := CASE WHEN p_simular THEN v_op.versao ELSE p_versao END;

  -- (1) FOLHA: cada parcela com titulo (materializada / paga, ou com parte viva) e' estornada pelo dono — que recusa o
  --     titulo realizado, conciliado ou com liquidacao ativa; a recusa aborta a chamada inteira
  FOR r IN
    SELECT pp.id AS parcela_id, pp.programacao_id, pp.sequencia, pp.valor
      FROM public.zoo_operacao_parcelas_programacao pp
      JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
     WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa'
       AND (pp.status IN ('materializada', 'paga')
            OR EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.programacao_parcela_id = pp.id AND pt.cancelada IS NOT TRUE))
     ORDER BY pp.sequencia
  LOOP
    v_x := public.oc_estornar_materializacao(p_operacao_id, v_op.cliente_id, v_ver, r.programacao_id, r.parcela_id, p_motivo, v_estorno);
    v_ver := (v_x->>'operacao_versao')::int;
    v_titulos := v_titulos || jsonb_build_object('sequencia', r.sequencia, 'parcela_id', r.parcela_id, 'titulo_id', v_x->>'titulo_id', 'valor', r.valor);
  END LOOP;

  -- (2) a programacao ativa
  FOR r IN SELECT pr.id FROM public.zoo_operacao_programacoes pr WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa' ORDER BY pr.created_at
  LOOP
    v_x := public.oc_cancelar_programacao(p_operacao_id, v_op.cliente_id, v_ver, r.id, p_motivo, v_estorno);
    v_ver := (v_x->>'operacao_versao')::int;
    v_progs := v_progs + 1;
  END LOOP;

  -- (3) RAIZ: o compromisso
  v_x := public.oc_cancelar_compromisso(p_operacao_id, v_op.cliente_id, v_ver, p_compromisso_id, p_motivo, v_estorno);
  v_ver := (v_x->>'operacao_versao')::int;

  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'estorno_id', v_estorno,
    'compromisso_id', p_compromisso_id, 'natureza', v_comp.natureza, 'componente', v_comp.componente, 'valor_total', v_comp.valor_total,
    'titulos_estornados', v_titulos, 'programacoes_canceladas', v_progs,
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_ver END);
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao do desfazer (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$function$;
REVOKE ALL ON FUNCTION public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean) TO authenticated, service_role;

DO $confere$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('oc_lancar_pelo_modal', 'oc_desfazer_compromisso')
              and (has_function_privilege('anon', p.oid, 'EXECUTE') or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   or not p.prosecdef)) then
    raise exception 'OC-CC-MODAL-FINANCEIRO-01: ACL ou SECURITY das funcoes novas fora do esperado';
  end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('oc_lancar_pelo_modal', 'oc_desfazer_compromisso')) <> 2 then
    raise exception 'OC-CC-MODAL-FINANCEIRO-01: esperadas exatamente 2 funcoes (uma assinatura cada)';
  end if;
end
$confere$;
