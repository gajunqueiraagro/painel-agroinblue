-- OC-RECLASSIFICAR-ITEM-01 — a classificacao de um item da OC se corrige PELA OC (27/09/2026, decisoes do Gabriel).
--
-- `oc_reclassificar_item(p_compromisso_id, p_plano_conta_id, p_componente, p_motivo, p_simular)` — NOVA, SECURITY DEFINER.
-- Numa transacao so', o compromisso, as partes vivas e os titulos vivos passam a falar da MESMA conta:
--   compromisso : plano_conta_id + subcentro/centro/grupo/macro (+ componente, regra abaixo);
--   partes vivas: as mesmas copias (+ componente);
--   titulos vivos (parte viva, titulo nao cancelado): SO' `plano_conta_id` — o gatilho `resolve_classificacao_from_plano`
--     resolve as copias pela chave. `hash_importacao` NAO se mexe: `plano_conta_id` nao esta' na lista do gatilho de hash
--     (medido na FASE 0, 5ef570ec: hash, valor, datas, conta, favorecido, vinculos, liquidacao e rebanho identicos).
--   versao + 1; evento `reclassificar_item` com de/para (conta, componente, compoe_dre, bloco do DRE) e UM motivo.
-- NAO toca valor, datas, pagamento, conciliacao, liquidacao, rebanho nem favorecido.
--
-- DECISOES DO GABRIEL:
--   (1) vale com a OC FECHADA — so' a cancelada recusa;
--   (2) a conta nova e' QUALQUER conta ativa do plano (global ou do cliente) da MESMA direcao do item — nao so' o mapa
--       do vincular. A direcao do item e' a do plano do compromisso (`_oc_vinculo_direcao_compromisso`);
--   (3) componente: conta no mapa (`_oc_vinculo_mapa`) com UM componente -> ele; com VARIOS -> `p_componente` obrigatorio
--       e tem de ser um deles; conta fora do mapa -> o componente fica como esta'.
--       ⚠ E SE O MAPA DISSER OUTRA NATUREZA (conta de principal para um item de obrigacao, ou o contrario), o componente
--         tambem fica: `natureza` nao muda por aqui, e um `principal` com componente `frete` seria um item que nenhuma
--         tela sabe ler.
--
-- SIMULACAO = O MESMO CAMINHO, DESFEITO (SQLSTATE 'OCSIM', o idioma do vincular/desvincular): o envelope traz o efeito
-- no DRE — `compoe_dre` e `bloco_dre` de/para, o valor e a direcao — e a fazenda de/para (conta administrativa leva a
-- fazenda "Administrativo" pelo gatilho, FIN-FAZENDA-ADM-01).
--
-- ACL: REVOKE de PUBLIC e anon; EXECUTE so' authenticated e service_role.
--
-- ⚠ REGISTRADA COMO `20260927100323` (apply_migration grava o timestamp do dia, nao o do nome do arquivo).
--   md5(prosrc) = ded4a192c65491906630cb03aa5351ad (banco = arquivo); proacl {postgres, service_role, authenticated};
--   anon = false; search_path = pg_catalog, public.
--
-- PROVAS (27/09/2026, em rollback, com a funcao em pg_temp e a identidade do Gabriel):
--   frete 5ef570ec da 77d963be (RRCC, OC FECHADA), compromisso dec7e17d: 5010/adiantamento -> 5030/frete.
--     titulo: mudaram SO' plano_conta_id, subcentro, centro, grupo, macro e compoe_dre (false -> true) — valor, datas,
--       pagamento, conta, favorecido e `hash_importacao` (htq7jsd) identicos; vinculos 0 -> 0; liquidacao a6a94d31
--       (pagamento 6.000, viva) identica; rebanho do RRCC identico (418 linhas).
--     compromisso, parte 19ec59df e titulo com a MESMA conta (70d5708e) e o mesmo componente (frete); 1 evento; versao 21 -> 22.
--     DRE RRCC civil 2023: deducoes 55.384,38 -> 61.384,38; receita liquida, VBP, margem, lucro operacional, lucro
--       liquido, resultado do periodo e resultado com mercado -6.000,00 cada — o mesmo da FASE 0.
--     resto do banco identico: 178 compromissos, 198 partes e 84.684 lancamentos fora do item (7 clientes).
--   simulacao: envelope com dre de/para (fora -> deducao) e componente com as 4 opcoes; versao e titulo intactos.
--   recusas: direcao ("Venda em Boitel" e' conta de entrada, e o item e' de saida), componente faltando no 5030,
--     OC cancelada (cfdc86ae), motivo vazio.

CREATE OR REPLACE FUNCTION public.oc_reclassificar_item(
  p_compromisso_id uuid, p_plano_conta_id uuid, p_componente text DEFAULT NULL, p_motivo text DEFAULT NULL,
  p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(), '') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_comp public.zoo_operacao_compromissos;
  v_comp_depois public.zoo_operacao_compromissos;
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_plano public.financeiro_plano_contas;
  v_plano_de public.financeiro_plano_contas;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_direcao_item text;
  v_mapa_natureza text; v_mapa_comps text[];
  v_comp_novo text;
  v_partes uuid[]; v_titulos uuid[];
  v_fazenda_de jsonb; v_fazenda_para jsonb;
  v_titulos_antes jsonb; v_titulos_depois jsonb;
  v_nova int;
  v_ret jsonb;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  IF p_simular IS NOT TRUE AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da reclassificação.' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos WHERE id = p_compromisso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item % não encontrado', p_compromisso_id USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = v_comp.operacao_id FOR UPDATE;
  v_cli := v_op.cliente_id;
  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissão nesta operação (acesso ao cliente exigido)' USING ERRCODE = '42501'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operação cancelada: o item não se reclassifica.' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status = 'cancelado' THEN
    RAISE EXCEPTION 'Item cancelado: não se reclassifica.' USING ERRCODE = 'P0001'; END IF;

  -- ── a conta nova, validada ANTES de escrever ──
  SELECT * INTO v_plano FROM public.financeiro_plano_contas WHERE id = p_plano_conta_id;
  IF NOT FOUND OR v_plano.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Conta do plano inativa ou inexistente: escolha uma conta ativa.' USING ERRCODE = 'P0001'; END IF;
  IF v_plano.cliente_id IS NOT NULL AND v_plano.cliente_id <> v_cli THEN
    RAISE EXCEPTION 'Conta do plano de outro cliente.' USING ERRCODE = 'P0001'; END IF;
  v_direcao_item := public._oc_vinculo_direcao_compromisso(v_comp.plano_conta_id, v_comp.subcentro);
  IF v_direcao_item IS NULL OR v_plano.tipo_operacao IS DISTINCT FROM v_direcao_item THEN
    RAISE EXCEPTION '"%" é conta de %, e o item é de %. Escolha uma conta de %.',
      v_plano.subcentro,
      CASE v_plano.tipo_operacao WHEN '1-Entradas' THEN 'entrada' WHEN '2-Saídas' THEN 'saída' ELSE coalesce(v_plano.tipo_operacao, '—') END,
      CASE v_direcao_item WHEN '1-Entradas' THEN 'entrada' WHEN '2-Saídas' THEN 'saída' ELSE coalesce(v_direcao_item, 'direção desconhecida') END,
      CASE v_direcao_item WHEN '1-Entradas' THEN 'entrada' WHEN '2-Saídas' THEN 'saída' ELSE coalesce(v_direcao_item, '—') END
      USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_plano_de FROM public.financeiro_plano_contas WHERE id = v_comp.plano_conta_id;

  -- ── o componente (decisao 3) ──
  SELECT m.natureza, m.componentes INTO v_mapa_natureza, v_mapa_comps
    FROM public._oc_vinculo_mapa() m WHERE m.subcentro = v_plano.subcentro LIMIT 1;
  IF v_mapa_comps IS NULL OR v_mapa_natureza IS DISTINCT FROM v_comp.natureza THEN
    v_comp_novo := v_comp.componente;
  ELSIF array_length(v_mapa_comps, 1) = 1 THEN
    v_comp_novo := v_mapa_comps[1];
  ELSIF p_componente IS NULL THEN
    RAISE EXCEPTION 'Escolha o componente do item (%).', array_to_string(v_mapa_comps, ', ') USING ERRCODE = 'P0001';
  ELSIF NOT (p_componente = ANY (v_mapa_comps)) THEN
    RAISE EXCEPTION 'Componente "%" não pertence a "%" (%).', p_componente, v_plano.subcentro, array_to_string(v_mapa_comps, ', ')
      USING ERRCODE = 'P0001';
  ELSE
    v_comp_novo := p_componente;
  END IF;

  IF v_comp.plano_conta_id IS NOT DISTINCT FROM v_plano.id AND v_comp.componente IS NOT DISTINCT FROM v_comp_novo THEN
    RETURN jsonb_build_object('ok', true, 'acao', 'sem_mudanca', 'simulado', coalesce(p_simular, false),
      'operacao_id', v_op.id, 'operacao_versao', v_op.versao, 'compromisso_id', v_comp.id);
  END IF;

  SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}') INTO v_partes
    FROM public.zoo_operacao_partes p
    JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = p.programacao_parcela_id
    JOIN public.zoo_operacao_programacoes pg ON pg.id = pp.programacao_id
   WHERE pg.compromisso_id = v_comp.id AND p.cancelada = false;
  SELECT coalesce(array_agg(l.id ORDER BY l.id), '{}') INTO v_titulos
    FROM public.zoo_operacao_partes p JOIN public.financeiro_lancamentos_v2 l ON l.id = p.financeiro_lancamento_id
   WHERE p.id = ANY (v_partes) AND l.cancelado IS NOT TRUE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'fazenda_id', l.fazenda_id, 'fazenda_nome', f.nome,
           'subcentro', l.subcentro, 'compoe_dre', l.compoe_dre, 'hash', l.hash_importacao) ORDER BY l.id), '[]')
    INTO v_titulos_antes
    FROM public.financeiro_lancamentos_v2 l LEFT JOIN public.fazendas f ON f.id = l.fazenda_id WHERE l.id = ANY (v_titulos);

  -- ═══ daqui para baixo, escreve ═══

  UPDATE public.zoo_operacao_compromissos
     SET plano_conta_id = v_plano.id, subcentro = v_plano.subcentro, centro_custo = v_plano.centro_custo,
         grupo_custo = v_plano.grupo_custo, macro_custo = v_plano.macro_custo, componente = v_comp_novo, updated_at = now()
   WHERE id = v_comp.id
   RETURNING * INTO v_comp_depois;

  UPDATE public.zoo_operacao_partes
     SET plano_conta_id = v_plano.id, subcentro = v_plano.subcentro, centro_custo = v_plano.centro_custo,
         grupo_custo = v_plano.grupo_custo, macro_custo = v_plano.macro_custo, componente = v_comp_novo, updated_at = now()
   WHERE id = ANY (v_partes);

  UPDATE public.financeiro_lancamentos_v2
     SET plano_conta_id = v_plano.id, updated_at = now(), updated_by = v_actor
   WHERE id = ANY (v_titulos);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'fazenda_id', l.fazenda_id, 'fazenda_nome', f.nome,
           'subcentro', l.subcentro, 'compoe_dre', l.compoe_dre, 'hash', l.hash_importacao) ORDER BY l.id), '[]')
    INTO v_titulos_depois
    FROM public.financeiro_lancamentos_v2 l LEFT JOIN public.fazendas f ON f.id = l.fazenda_id WHERE l.id = ANY (v_titulos);

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  VALUES (v_cli, v_op.id, 'reclassificar_item',
    jsonb_build_object('compromisso', to_jsonb(v_comp), 'titulos', v_titulos_antes),
    jsonb_build_object('compromisso', to_jsonb(v_comp_depois), 'titulos', v_titulos_depois),
    jsonb_build_object('motivo', v_motivo, 'compromisso_id', v_comp.id, 'partes', to_jsonb(v_partes), 'titulos_ids', to_jsonb(v_titulos),
      'conta_de', v_comp.plano_conta_id, 'conta_para', v_plano.id,
      'subcentro_de', v_comp.subcentro, 'subcentro_para', v_plano.subcentro,
      'componente_de', v_comp.componente, 'componente_para', v_comp_novo,
      'compoe_dre_de', v_plano_de.compoe_dre, 'compoe_dre_para', v_plano.compoe_dre,
      'bloco_dre_de', v_plano_de.bloco_dre, 'bloco_dre_para', v_plano.bloco_dre,
      'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
    v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = v_op.id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = v_op.id;

  v_ret := jsonb_build_object(
    'ok', true, 'acao', CASE WHEN p_simular THEN 'simulado' ELSE 'reclassificado' END,
    'simulado', coalesce(p_simular, false),
    'operacao_id', v_op.id,
    'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END,
    'compromisso_id', v_comp.id,
    'valor', v_comp.valor_total,
    'direcao', v_direcao_item,
    'conta', jsonb_build_object(
      'de', jsonb_build_object('id', v_comp.plano_conta_id, 'subcentro', v_comp.subcentro, 'macro_custo', v_comp.macro_custo),
      'para', jsonb_build_object('id', v_plano.id, 'subcentro', v_plano.subcentro, 'macro_custo', v_plano.macro_custo)),
    'componente', jsonb_build_object('de', v_comp.componente, 'para', v_comp_novo,
      'opcoes', CASE WHEN v_mapa_natureza IS NOT DISTINCT FROM v_comp.natureza THEN to_jsonb(v_mapa_comps) END),
    'dre', jsonb_build_object(
      'de', jsonb_build_object('compoe_dre', v_plano_de.compoe_dre, 'bloco_dre', v_plano_de.bloco_dre),
      'para', jsonb_build_object('compoe_dre', v_plano.compoe_dre, 'bloco_dre', v_plano.bloco_dre)),
    'partes', to_jsonb(v_partes),
    'titulos', jsonb_build_object('de', v_titulos_antes, 'para', v_titulos_depois));

  IF p_simular THEN
    RAISE EXCEPTION 'simulacao de reclassificacao (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$function$;

REVOKE ALL ON FUNCTION public.oc_reclassificar_item(uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.oc_reclassificar_item(uuid, uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.oc_reclassificar_item(uuid, uuid, text, text, boolean) TO authenticated, service_role;
