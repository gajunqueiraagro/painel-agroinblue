-- PR-COMPROMISSO-01 — 1o writer comportamental do modelo 3-niveis: oc_criar_compromisso.
--
--   PROPOSITO: declara UM compromisso economico numa OC (o que se deve, a quem, classificacao, valor
--   total). NAO programa, NAO parcela, NAO materializa titulo. Um writer, um nivel.
--
--   FRONTEIRA: NAO cria zoo_operacao_programacoes / zoo_operacao_parcelas_programacao; NAO cria/toca
--   financeiro_lancamentos_v2; NAO toca oc_gerar_obrigacoes nem a base; nao adiciona coluna.
--
--   PADROES HERDADOS (reproduzidos literalmente): auth 3 camadas (oc_adotar_titulo_financeiro);
--   version lock + FOR UPDATE; incremento de versao com re-leitura para o retorno (oc_salvar_rascunho:
--   'versao = versao + 1, updated_at = now(), updated_by = v_actor'); evento em zoo_operacao_eventos
--   (sem CHECK em acao); resolucao de classificacao por (ativo + tenant), cardinalidade 0/1/>1
--   (oc_gerar_obrigacoes). Neste writer a resolucao e por SUBCENTRO (unico no escopo real de compra).
--
--   TETO POR NATUREZA (unico teto deste PR): principal respeita _oc_base_saldo_operacao (Sigma principais
--   <= base); obrigacao NAO tem teto de base (valor soberano). Este writer processa APENAS principal e
--   obrigacao; deducao/acrescimo -> P0001 (ainda nao suportadas), embora o CHECK estrutural aceite as 4.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

CREATE OR REPLACE FUNCTION public.oc_criar_compromisso(
  p_operacao_id uuid,
  p_versao_esperada integer,
  p_payload jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean; v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_natureza text; v_componente text; v_valor numeric; v_fav uuid; v_lote uuid; v_sub text; v_desc text;
  v_base numeric; v_ja_principal numeric;
  v_plano_cnt int; v_plano_id uuid; v_macro text; v_grupo text; v_centro text;
  v_compromisso_id uuid; v_nova_versao integer; v_row jsonb;
BEGIN
  -- 1) AUTH 3 camadas (padrao oc_adotar_titulo_financeiro).
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  v_is_admin   := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));

  -- 2) operacao FOR UPDATE; cliente DERIVADO; version lock.
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao para criar compromisso nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501';
  END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- 3) estados: rascunho (coluna booleana separada) OU cancelada -> bloqueio. programada/fechada permitem.
  IF v_op.rascunho THEN
    RAISE EXCEPTION 'Operacao em rascunho nao permite compromissos' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao permite compromissos' USING ERRCODE = 'P0001'; END IF;

  -- 4) payload.
  v_valor := NULLIF(p_payload->>'valor_total','')::numeric;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'valor_total deve ser > 0' USING ERRCODE = 'P0001'; END IF;
  v_natureza := p_payload->>'natureza';
  IF v_natureza IS NULL OR v_natureza NOT IN ('principal','obrigacao') THEN
    RAISE EXCEPTION 'A natureza informada ainda nao e suportada por este writer.' USING ERRCODE = 'P0001'; END IF;
  v_componente := p_payload->>'componente';
  IF NOT EXISTS (SELECT 1 FROM public.zoo_componentes_financeiros c WHERE c.natureza = v_natureza AND c.codigo = v_componente AND c.ativo IS TRUE) THEN
    RAISE EXCEPTION 'Componente %/% inexistente ou inativo no catalogo', v_natureza, v_componente USING ERRCODE = 'P0001'; END IF;
  v_fav := NULLIF(p_payload->>'favorecido_id','')::uuid;
  IF v_fav IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financeiro_fornecedores f WHERE f.id = v_fav AND (f.cliente_id = v_cli OR f.cliente_id IS NULL)) THEN
    RAISE EXCEPTION 'Favorecido nao pertence a este cliente ou nao existe.' USING ERRCODE = 'P0001'; END IF;
  v_lote := NULLIF(p_payload->>'lote_id','')::uuid;   -- NULL = operacao inteira
  IF v_lote IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_lotes lo WHERE lo.id = v_lote AND lo.operacao_id = p_operacao_id) THEN
    RAISE EXCEPTION 'Lote % nao pertence a operacao %', v_lote, p_operacao_id USING ERRCODE = 'P0001'; END IF;
  v_sub  := NULLIF(p_payload->>'subcentro','');
  v_desc := p_payload->>'descricao';

  -- 5) TETO POR NATUREZA (unico teto deste PR).
  IF v_natureza = 'principal' THEN
    SELECT b.base INTO v_base FROM public._oc_base_saldo_operacao(p_operacao_id) b;
    IF v_base IS NULL THEN
      RAISE EXCEPTION 'Nao e possivel criar um compromisso principal enquanto o valor da operacao estiver indefinido. Informe o valor acordado ou estimado da operacao.' USING ERRCODE = 'P0001'; END IF;
    -- Regra POSITIVA: aberto E programado consomem a base (divida viva); apenas cancelado nao conta.
    --   Positiva por design: estados futuros (estornado/arquivado) nao consumiriam teto por engano.
    SELECT COALESCE(SUM(valor_total), 0) INTO v_ja_principal
      FROM public.zoo_operacao_compromissos
     WHERE operacao_id = p_operacao_id AND natureza = 'principal' AND status IN ('aberto','programado');
    IF round(v_ja_principal + v_valor, 2) > round(v_base, 2) THEN
      RAISE EXCEPTION 'Soma dos compromissos principais excede a base da operacao (base: %, ja: %, novo: %).',
        round(v_base,2), round(v_ja_principal,2), round(v_valor,2) USING ERRCODE = 'P0001'; END IF;
  END IF;
  -- obrigacao: sem teto de base (valor_total soberano).

  -- 6) resolucao de classificacao NO SERVIDOR por SUBCENTRO (filtro ativo + tenant; cardinalidade 0/1/>1).
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Subcentro nao encontrado no plano de contas.' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO v_plano_cnt
    FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id = v_cli)
     AND pc.subcentro IS NOT DISTINCT FROM v_sub;
  IF v_plano_cnt = 0 THEN
    RAISE EXCEPTION 'Subcentro nao encontrado no plano de contas.' USING ERRCODE = 'P0001'; END IF;
  IF v_plano_cnt > 1 THEN
    RAISE EXCEPTION 'Classificacao ambigua.' USING ERRCODE = 'P0001'; END IF;
  SELECT pc.macro_custo, pc.grupo_custo, pc.centro_custo, pc.subcentro, pc.id
    INTO v_macro, v_grupo, v_centro, v_sub, v_plano_id
    FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id = v_cli)
     AND pc.subcentro IS NOT DISTINCT FROM v_sub
   LIMIT 1;

  -- 7) INSERT do compromisso (status='aberto'; cliente derivado; classificacao resolvida).
  INSERT INTO public.zoo_operacao_compromissos
    (cliente_id, operacao_id, natureza, componente, favorecido_id,
     macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id, lote_id, valor_total, descricao, status)
  VALUES
    (v_cli, p_operacao_id, v_natureza, v_componente, v_fav,
     v_macro, v_grupo, v_centro, v_sub, v_plano_id, v_lote, v_valor, v_desc, 'aberto')
  RETURNING id INTO v_compromisso_id;

  SELECT to_jsonb(c) INTO v_row FROM public.zoo_operacao_compromissos c WHERE c.id = v_compromisso_id;

  -- 8) evento auditavel (colunas reais; sem CHECK em acao).
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'criar_compromisso', v_row, v_actor, 'rpc');

  -- 9) incrementar a versao da operacao (padrao oc_salvar_rascunho) + re-ler para o retorno.
  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  SELECT versao INTO v_nova_versao FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  -- 10) retorno.
  RETURN jsonb_build_object('compromisso', v_row, 'operacao_versao', v_nova_versao);
END;
$function$;

-- Grants: writer comportamental. authenticated + service_role executam (o corpo autoriza por tenant/admin/
-- service). anon sem grant. (service_role explicito para o padrao auth 3 camadas funcionar.)
REVOKE ALL ON FUNCTION public.oc_criar_compromisso(uuid, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.oc_criar_compromisso(uuid, integer, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.oc_criar_compromisso(uuid, integer, jsonb) TO authenticated, service_role;
