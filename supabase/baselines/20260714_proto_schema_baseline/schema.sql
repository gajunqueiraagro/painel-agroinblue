--
-- PostgreSQL database dump
--

\restrict BbwfOzQ0gRibiVIdws90sXzZY1C2G3YgjsvRkvWJpofD0gnofziTX5ZsusuhXil

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: origem_apontamento_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.origem_apontamento_enum AS ENUM (
    'excel_historico',
    'excel_operacional',
    'manual',
    'ajuste_operacional',
    'programado',
    'ofx_direto',
    'financiamento',
    'zoot'
);


--
-- Name: TYPE origem_apontamento_enum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.origem_apontamento_enum IS 'Mesa Operacional v2. Origem estrutural do apontamento financeiro.
Valores: excel_historico (carga única migração), excel_operacional (rotina mensal),
manual (operador digitou), ajuste_operacional (correção/saneamento),
programado (futuro virou realizado), ofx_direto (nasceu de extrato sem apontamento),
financiamento (módulo de financiamento), zoot (movimentação zootécnica).
Criada PR0.A em 2026-05-22.';


--
-- Name: perfil_acesso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.perfil_acesso AS ENUM (
    'admin_agroinblue',
    'gestor_cliente',
    'financeiro',
    'campo',
    'leitura'
);


--
-- Name: audit_modulo_from_lancamento_tipo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_modulo_from_lancamento_tipo(p_tipo text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN p_tipo IN ('compra') THEN 'compra'
    WHEN p_tipo IN ('abate') THEN 'abate'
    WHEN p_tipo IN ('venda', 'venda_pe') THEN 'venda'
    WHEN p_tipo IN ('transferencia_saida', 'transferencia_entrada') THEN 'transferencia'
    WHEN p_tipo IN ('consumo') THEN 'consumo'
    WHEN p_tipo IN ('morte') THEN 'morte'
    WHEN p_tipo IN ('nascimento') THEN 'nascimento'
    ELSE p_tipo
  END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lancamentos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    fazenda_id uuid,
    data date NOT NULL,
    tipo text NOT NULL,
    categoria_id uuid,
    quantidade integer DEFAULT 0 NOT NULL,
    peso_total numeric DEFAULT 0,
    valor_total numeric DEFAULT 0,
    preco_unitario numeric DEFAULT 0,
    arroba numeric,
    rendimento numeric,
    cenario text DEFAULT 'realizado'::text NOT NULL,
    origem text,
    observacao text,
    destino_final text,
    abate_frigorifico text,
    abate_fornecedor_id uuid,
    fazenda_destino text,
    fazenda_destino_id uuid,
    categoria_mae_id uuid,
    motivo text,
    numero_id text,
    created_at timestamp with time zone DEFAULT now(),
    cancelado boolean DEFAULT false NOT NULL,
    cliente_id uuid,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    updated_at timestamp with time zone DEFAULT now(),
    ano_mes text,
    categoria text,
    categoria_destino text,
    fazenda_origem text,
    comprador_fornecedor text,
    peso_medio_kg numeric,
    peso_medio_arrobas numeric,
    preco_medio_cabeca numeric,
    preco_arroba numeric,
    peso_carcaca_kg numeric,
    bonus_precoce numeric,
    bonus_qualidade numeric,
    bonus_lista_trace numeric,
    desconto_qualidade numeric,
    desconto_funrural numeric,
    outros_descontos numeric,
    acrescimos numeric,
    deducoes numeric,
    numero_documento text,
    tipo_peso text DEFAULT 'vivo'::text,
    status_operacional text,
    data_venda date,
    data_embarque date,
    data_abate date,
    tipo_venda text,
    detalhes_snapshot jsonb,
    frigorifico text,
    pedido text,
    instrucao text,
    doc_acerto text,
    anexo_nf_url text,
    anexo_acerto_url text,
    created_by uuid,
    updated_by uuid,
    origem_registro text,
    lote_importacao_id uuid,
    transferencia_par_id uuid,
    rendimento_carcaca numeric,
    peso_vivo_total numeric,
    comprador_fornecedor_id uuid,
    boitel_id uuid,
    boitel_lote_id uuid,
    tipo_abate text,
    lote text,
    sexo text,
    finalidade text,
    hash_linha text,
    fornecedor_id uuid,
    fornecedor_nome_snapshot text DEFAULT '[nao informado]'::text NOT NULL,
    CONSTRAINT lancamentos_cenario_check CHECK ((cenario = ANY (ARRAY['realizado'::text, 'programado'::text, 'meta'::text]))),
    CONSTRAINT lancamentos_tipo_check CHECK ((tipo = ANY (ARRAY['compra'::text, 'venda'::text, 'abate'::text, 'nascimento'::text, 'morte'::text, 'consumo'::text, 'transferencia_entrada'::text, 'transferencia_saida'::text, 'reclassificacao'::text, 'saldo_inicial'::text])))
);


--
-- Name: COLUMN lancamentos.comprador_fornecedor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lancamentos.comprador_fornecedor IS 'LEGADO — texto livre. Sera removido em PR futuro apos transicao completa para fornecedor_id.';


--
-- Name: COLUMN lancamentos.fornecedor_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lancamentos.fornecedor_id IS 'Fornecedor operacional soberano da movimentacao zoo. Pode divergir dos favorecidos das parcelas financeiras (barter, cessao, permuta, terceiro). FK ON DELETE RESTRICT preserva auditoria.';


--
-- Name: COLUMN lancamentos.fornecedor_nome_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lancamentos.fornecedor_nome_snapshot IS 'Snapshot imutavel do nome do fornecedor no momento do save. Preserva auditoria mesmo se fornecedor mestre renomear/desativar/mesclar. Valor "[nao informado]" indica ausencia explicita de fornecedor no original. Aplicacao garante imutabilidade.';


--
-- Name: audit_resumo_lancamento(public.lancamentos); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_resumo_lancamento(r public.lancamentos) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT concat_ws(' | ',
    initcap(replace(r.tipo, '_', ' ')),
    r.quantidade || ' cab',
    r.categoria,
    (SELECT f.nome FROM public.fazendas f WHERE f.id = r.fazenda_id LIMIT 1)
  );
$$;


--
-- Name: audit_trigger_chuvas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_trigger_chuvas() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_resumo text;
  v_fazenda_nome text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT f.nome INTO v_fazenda_nome FROM public.fazendas f WHERE f.id = NEW.fazenda_id LIMIT 1;
    v_resumo := concat_ws(' | ', 'Chuva', v_fazenda_nome, NEW.milimetros || ' mm', NEW.data);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.created_by, auth.uid()), 'chuva', 'criou', 'chuvas', NEW.id, v_resumo, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT f.nome INTO v_fazenda_nome FROM public.fazendas f WHERE f.id = NEW.fazenda_id LIMIT 1;
    v_resumo := concat_ws(' | ', 'Chuva', v_fazenda_nome, NEW.milimetros || ' mm', NEW.data);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.created_by, auth.uid()), 'chuva', 'editou', 'chuvas', NEW.id, v_resumo, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT f.nome INTO v_fazenda_nome FROM public.fazendas f WHERE f.id = OLD.fazenda_id LIMIT 1;
    v_resumo := concat_ws(' | ', 'Chuva', v_fazenda_nome, OLD.milimetros || ' mm', OLD.data);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores)
    VALUES (OLD.cliente_id, OLD.fazenda_id, auth.uid(), 'chuva', 'excluiu', 'chuvas', OLD.id, v_resumo, to_jsonb(OLD));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: audit_trigger_financeiro_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_trigger_financeiro_v2() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_acao text;
  v_resumo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_resumo := concat_ws(' | ', initcap(NEW.tipo_operacao), 'R$ ' || round(NEW.valor::numeric, 2), NEW.descricao);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.created_by, auth.uid()), 'financeiro', 'criou', 'financeiro_lancamentos_v2', NEW.id, v_resumo, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.cancelado = true AND OLD.cancelado = false THEN
      v_acao := 'cancelou';
    ELSE
      v_acao := 'editou';
    END IF;
    v_resumo := concat_ws(' | ', initcap(NEW.tipo_operacao), 'R$ ' || round(NEW.valor::numeric, 2), NEW.descricao);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.updated_by, auth.uid()), 'financeiro', v_acao, 'financeiro_lancamentos_v2', NEW.id, v_resumo, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$_$;


--
-- Name: audit_trigger_lancamentos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_trigger_lancamentos() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_acao text;
  v_resumo text;
  v_old jsonb;
  v_new jsonb;
  v_modulo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criou';
    v_modulo := audit_modulo_from_lancamento_tipo(NEW.tipo);
    v_resumo := audit_resumo_lancamento(NEW);
    v_new := to_jsonb(NEW);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.created_by, auth.uid()), v_modulo, v_acao, 'lancamentos', NEW.id, v_resumo, v_new);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Detect cancel
    IF NEW.cancelado = true AND OLD.cancelado = false THEN
      v_acao := 'cancelou';
    ELSE
      v_acao := 'editou';
    END IF;
    v_modulo := audit_modulo_from_lancamento_tipo(NEW.tipo);
    v_resumo := audit_resumo_lancamento(NEW);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.updated_by, auth.uid()), v_modulo, v_acao, 'lancamentos', NEW.id, v_resumo, v_old, v_new);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_modulo := audit_modulo_from_lancamento_tipo(OLD.tipo);
    v_resumo := audit_resumo_lancamento(OLD);
    v_old := to_jsonb(OLD);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores)
    VALUES (OLD.cliente_id, OLD.fazenda_id, auth.uid(), v_modulo, 'excluiu', 'lancamentos', OLD.id, v_resumo, v_old);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: auditar_integridade_classificacao(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auditar_integridade_classificacao(_cliente_id uuid) RETURNS TABLE(lancamento_id uuid, subcentro text, campo_divergente text, valor_lancamento text, valor_plano text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id AS lancamento_id,
    l.subcentro,
    d.campo AS campo_divergente,
    d.val_lanc AS valor_lancamento,
    d.val_plano AS valor_plano
  FROM public.financeiro_lancamentos_v2 l
  INNER JOIN public.financeiro_plano_contas p
    ON p.cliente_id = l.cliente_id
    AND p.subcentro = l.subcentro
    AND p.tipo_operacao = l.tipo_operacao
    AND p.ativo = true
  CROSS JOIN LATERAL (
    VALUES
      ('macro_custo', l.macro_custo, p.macro_custo),
      ('grupo_custo', l.grupo_custo, p.grupo_custo),
      ('centro_custo', l.centro_custo, p.centro_custo),
      ('escopo_negocio', l.escopo_negocio, p.escopo_negocio)
  ) AS d(campo, val_lanc, val_plano)
  WHERE l.cliente_id = _cliente_id
    AND l.cancelado = false
    AND l.subcentro IS NOT NULL
    AND COALESCE(d.val_lanc, '') <> COALESCE(d.val_plano, '')
  ORDER BY l.subcentro, d.campo;
END;
$$;


--
-- Name: auto_add_owner_as_membro(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_add_owner_as_membro() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.fazenda_membros (fazenda_id, user_id, papel)
  VALUES (NEW.id, NEW.owner_id, 'dono');
  RETURN NEW;
END;
$$;


--
-- Name: auto_create_transferencia_entrada(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_create_transferencia_entrada() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  dest_fazenda_id uuid;
  dest_cliente_id uuid;
  entrada_id uuid;
BEGIN
  IF NEW.tipo != 'transferencia_saida' THEN RETURN NEW; END IF;
  IF NEW.transferencia_par_id IS NOT NULL THEN RETURN NEW; END IF;

  dest_fazenda_id := public.resolve_transfer_destination_fazenda(
                       NEW.fazenda_id, NEW.fazenda_destino);
  IF dest_fazenda_id IS NULL THEN RETURN NEW; END IF;

  SELECT cliente_id INTO dest_cliente_id
    FROM public.fazendas WHERE id = dest_fazenda_id;

  INSERT INTO public.lancamentos (
    fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
    fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
    preco_medio_cabeca, observacao, transferencia_par_id, status_operacional, cenario,
    fornecedor_nome_snapshot
  ) VALUES (
    dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada',
    NEW.quantidade, NEW.categoria, NEW.categoria_destino,
    NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
    NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional, NEW.cenario,
    COALESCE(NEW.fornecedor_nome_snapshot, '[nao informado]')
  )
  RETURNING id INTO entrada_id;

  UPDATE public.lancamentos SET transferencia_par_id = entrada_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: buscar_duplicados_retroativo(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buscar_duplicados_retroativo(_cliente_id uuid, _ano_mes text DEFAULT NULL::text) RETURNS TABLE(grupo_hash text, lancamento_id uuid, data_pagamento date, ano_mes text, fazenda_id uuid, conta_bancaria_id uuid, tipo_operacao text, valor numeric, descricao text, fornecedor_nome text, numero_documento text, observacao text, subcentro text, lote_importacao_id uuid, created_at timestamp with time zone, status_duplicidade text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    l.hash_importacao AS grupo_hash,
    l.id AS lancamento_id,
    l.data_pagamento,
    l.ano_mes,
    l.fazenda_id,
    l.conta_bancaria_id,
    l.tipo_operacao,
    l.valor,
    l.descricao,
    f.nome AS fornecedor_nome,
    l.numero_documento,
    l.observacao,
    l.subcentro,
    l.lote_importacao_id,
    l.created_at,
    l.status_duplicidade
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores f ON f.id = l.favorecido_id
  WHERE l.cliente_id = _cliente_id
    AND l.cancelado = false
    AND l.hash_importacao IS NOT NULL
    AND (_ano_mes IS NULL OR l.ano_mes = _ano_mes)
    AND l.hash_importacao IN (
      SELECT h.hash_importacao
      FROM public.financeiro_lancamentos_v2 h
      WHERE h.cliente_id = _cliente_id
        AND h.cancelado = false
        AND h.hash_importacao IS NOT NULL
        AND (_ano_mes IS NULL OR h.ano_mes = _ano_mes)
      GROUP BY h.hash_importacao
      HAVING count(*) > 1
    )
  ORDER BY l.hash_importacao, l.created_at;
$$;


--
-- Name: can_close_valor_rebanho(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_close_valor_rebanho(_fazenda_id uuid, _ano_mes text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _pilares jsonb;
  _p1_status text;
BEGIN
  _pilares := public.get_status_pilares_fechamento(_fazenda_id, _ano_mes);
  _p1_status := _pilares->'p1_mapa_pastos'->>'status';
  IF _p1_status = 'oficial' THEN
    RETURN jsonb_build_object('pode_fechar', true, 'p1_status', _p1_status);
  END IF;
  RETURN jsonb_build_object(
    'pode_fechar', false,
    'p1_status', _p1_status,
    'motivo', 'P1 nao esta oficial: ' || COALESCE(_p1_status, 'null')
  );
END;
$$;


--
-- Name: can_manage_financeiro_importacao_v2(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_financeiro_importacao_v2(_cliente_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.is_admin_agroinblue(auth.uid())
    OR (
      _cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), _cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    );
$$;


--
-- Name: can_manage_financeiro_lancamento_v2(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_financeiro_lancamento_v2(_cliente_id uuid, _origem_lancamento text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.is_admin_agroinblue(auth.uid())
    OR (
      _cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), _cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    );
$$;


--
-- Name: cancel_financeiro_importacao_v2(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_financeiro_importacao_v2(_importacao_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_importacao public.financeiro_importacoes_v2%ROWTYPE;
  v_cancelados integer := 0;
  v_closed_month text;
BEGIN
  SELECT *
  INTO v_importacao
  FROM public.financeiro_importacoes_v2
  WHERE id = _importacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação V2 não encontrada.';
  END IF;

  IF NOT public.can_manage_financeiro_importacao_v2(v_importacao.cliente_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para cancelar esta importação.';
  END IF;

  IF v_importacao.status = 'cancelada' THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true, 'cancelled_rows', 0);
  END IF;

  SELECT DISTINCT l.ano_mes INTO v_closed_month
  FROM public.financeiro_lancamentos_v2 l
  JOIN public.financeiro_fechamentos f
    ON f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id AND f.ano_mes = l.ano_mes
  WHERE l.lote_importacao_id = _importacao_id
    AND COALESCE(l.cancelado, false) = false
    AND f.status_fechamento = 'fechado'
  LIMIT 1;

  IF v_closed_month IS NOT NULL THEN
    RAISE EXCEPTION 'Mês % está fechado. Reabra o período para cancelar esta importação.', v_closed_month;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND COALESCE(l.cancelado, false) = false
      AND l.editado_manual = true
  ) THEN
    RAISE EXCEPTION 'Esta importação possui lançamentos editados manualmente e não pode ser cancelada.';
  END IF;

  -- Updated: check 'realizado' instead of legacy 'conciliado'
  IF EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND COALESCE(l.cancelado, false) = false
      AND l.status_transacao = 'realizado'
  ) THEN
    RAISE EXCEPTION 'Esta importação possui lançamentos realizados e não pode ser cancelada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND l.origem_lancamento = 'importacao_historica'
      AND NOT public.is_admin_agroinblue(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Somente admin pode cancelar importações históricas no V2.';
  END IF;

  UPDATE public.financeiro_importacoes_v2
  SET status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
  WHERE id = _importacao_id;

  ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_guard_mes_fechado_lancamentos_v2;

  UPDATE public.financeiro_lancamentos_v2
  SET cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(), updated_at = now(), updated_by = auth.uid()
  WHERE lote_importacao_id = _importacao_id
    AND COALESCE(cancelado, false) = false;

  GET DIAGNOSTICS v_cancelados = ROW_COUNT;

  ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_guard_mes_fechado_lancamentos_v2;

  RETURN jsonb_build_object('ok', true, 'already_cancelled', false, 'cancelled_rows', v_cancelados);
END;
$$;


--
-- Name: cancel_zoot_importacao(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_zoot_importacao(_importacao_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_imp public.zoot_importacoes%ROWTYPE;
  v_cancelados integer := 0;
  v_closed_month text;
BEGIN
  SELECT * INTO v_imp FROM public.zoot_importacoes WHERE id = _importacao_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação zootécnica não encontrada.';
  END IF;

  IF NOT public.is_admin_agroinblue(auth.uid()) THEN
    IF NOT (
      v_imp.cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), v_imp.cliente_id) IN ('gestor_cliente'::public.perfil_acesso)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para cancelar esta importação.';
    END IF;
  END IF;

  IF v_imp.status = 'excluido' THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true, 'cancelled_rows', 0);
  END IF;

  -- CORREÇÃO: ::text para cast correto de date
  SELECT DISTINCT substring(l.data::text, 1, 7) INTO v_closed_month
  FROM public.lancamentos l
  WHERE l.lote_importacao_id = _importacao_id
    AND COALESCE(l.cancelado, false) = false
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pastos fp
      WHERE fp.fazenda_id = l.fazenda_id
        AND fp.ano_mes = substring(l.data::text, 1, 7)
        AND fp.status = 'fechado'
    )
  LIMIT 1;

  IF v_closed_month IS NOT NULL THEN
    RAISE EXCEPTION 'Mês % possui fechamento ativo. Reabra o período antes de excluir esta importação.', v_closed_month;
  END IF;

  UPDATE public.lancamentos
  SET cancelado = true,
      cancelado_em = now(),
      cancelado_por = auth.uid()
  WHERE lote_importacao_id = _importacao_id
    AND COALESCE(cancelado, false) = false;

  GET DIAGNOSTICS v_cancelados = ROW_COUNT;

  UPDATE public.zoot_importacoes
  SET status = 'excluido',
      cancelada_em = now(),
      cancelada_por = auth.uid()
  WHERE id = _importacao_id;

  RETURN jsonb_build_object('ok', true, 'already_cancelled', false, 'cancelled_rows', v_cancelados);
END;
$$;


--
-- Name: classificar_nivel_duplicidade(date, numeric, text, uuid, uuid, text, text, text, date, numeric, text, uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.classificar_nivel_duplicidade(_new_data_pagamento date, _new_valor numeric, _new_tipo_operacao text, _new_conta_bancaria_id uuid, _new_favorecido_id uuid, _new_descricao text, _new_numero_documento text, _new_subcentro text, _existing_data_pagamento date, _existing_valor numeric, _existing_tipo_operacao text, _existing_conta_bancaria_id uuid, _existing_favorecido_id uuid, _existing_descricao text, _existing_numero_documento text, _existing_subcentro text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  _diff_count int := 0;
  _doc_diverge boolean := false;
  _valor_significant boolean := false;
  _v1 numeric;
  _v2 numeric;
  _max_v numeric;
  _pct_diff numeric;
BEGIN
  -- 1. Data pagamento
  IF _new_data_pagamento IS DISTINCT FROM _existing_data_pagamento THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 2. Valor (with significant divergence detection)
  _v1 := round(coalesce(_new_valor, 0)::numeric, 2);
  _v2 := round(coalesce(_existing_valor, 0)::numeric, 2);
  IF _v1 <> _v2 THEN
    _max_v := greatest(_v1, _v2);
    IF _max_v > 0 THEN
      _pct_diff := abs(_v1 - _v2) / _max_v;
    ELSE
      _pct_diff := 0;
    END IF;
    IF _pct_diff > 0.20 THEN
      _valor_significant := true;
      _diff_count := _diff_count + 3;
    ELSE
      _diff_count := _diff_count + 1;
    END IF;
  END IF;

  -- 3. Descrição/Produto
  IF lower(btrim(coalesce(_new_descricao,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_descricao,'')))
     AND (btrim(coalesce(_new_descricao,'')) <> '' OR btrim(coalesce(_existing_descricao,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 4. Subcentro
  IF lower(btrim(coalesce(_new_subcentro,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_subcentro,'')))
     AND (btrim(coalesce(_new_subcentro,'')) <> '' OR btrim(coalesce(_existing_subcentro,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 5. Número documento (only when both present)
  IF btrim(coalesce(_new_numero_documento,'')) <> '' AND btrim(coalesce(_existing_numero_documento,'')) <> '' THEN
    IF lower(btrim(_new_numero_documento)) <> lower(btrim(_existing_numero_documento)) THEN
      _doc_diverge := true;
      _diff_count := _diff_count + 1;
    END IF;
  END IF;

  -- 6. Tipo operação
  IF lower(btrim(coalesce(_new_tipo_operacao,''))) IS DISTINCT FROM lower(btrim(coalesce(_existing_tipo_operacao,'')))
     AND (btrim(coalesce(_new_tipo_operacao,'')) <> '' OR btrim(coalesce(_existing_tipo_operacao,'')) <> '') THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- 7. Conta bancária
  IF _new_conta_bancaria_id IS DISTINCT FROM _existing_conta_bancaria_id THEN
    _diff_count := _diff_count + 1;
  END IF;

  -- Classification (aligned with frontend)
  IF _diff_count = 0 THEN
    RETURN 'D1';
  END IF;

  IF _valor_significant THEN
    RETURN 'LEGITIMO';
  END IF;

  IF _diff_count <= 2 AND NOT _doc_diverge THEN
    RETURN 'D2';
  ELSIF _diff_count <= 3 THEN
    RETURN 'D3';
  ELSE
    RETURN 'LEGITIMO';
  END IF;
END;
$$;


--
-- Name: compute_financeiro_lancamento_v2_hash(uuid, uuid, date, date, numeric, text, uuid, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_financeiro_lancamento_v2_hash(_cliente_id uuid, _fazenda_id uuid, _data_competencia date, _data_pagamento date, _valor numeric, _tipo_operacao text, _conta_bancaria_id uuid, _descricao text, _favorecido_id uuid, _documento text, _numero_documento text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT md5(concat_ws('|',
    coalesce(_cliente_id::text, ''),
    coalesce(_fazenda_id::text, ''),
    coalesce(_data_pagamento::text, ''),
    round(coalesce(_valor, 0)::numeric, 2)::text,
    lower(btrim(coalesce(_tipo_operacao, ''))),
    coalesce(_conta_bancaria_id::text, ''),
    coalesce(_favorecido_id::text, ''),
    lower(btrim(coalesce(_descricao, ''))),
    lower(btrim(coalesce(_numero_documento, '')))
  ));
$$;


--
-- Name: enforce_financeiro_lancamento_v2_unique_hash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  _best_nivel text := 'LEGITIMO';
  _candidate text;
  _rec record;
BEGIN
  IF NEW.lote_importacao_id IS NULL OR coalesce(NEW.cancelado, false) = true THEN
    RETURN NEW;
  END IF;

  FOR _rec IN
    SELECT favorecido_id, descricao, numero_documento, subcentro,
           data_pagamento, valor, tipo_operacao, conta_bancaria_id
    FROM public.financeiro_lancamentos_v2
    WHERE id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND lote_importacao_id IS NOT NULL
      AND coalesce(cancelado, false) = false
      AND cliente_id = NEW.cliente_id
      AND fazenda_id = NEW.fazenda_id
      AND data_pagamento IS NOT DISTINCT FROM NEW.data_pagamento
      AND round(valor::numeric, 2) = round(NEW.valor::numeric, 2)
      AND lower(btrim(coalesce(tipo_operacao, ''))) = lower(btrim(coalesce(NEW.tipo_operacao, '')))
      AND conta_bancaria_id IS NOT DISTINCT FROM NEW.conta_bancaria_id
  LOOP
    _candidate := public.classificar_nivel_duplicidade(
      NEW.data_pagamento, NEW.valor, NEW.tipo_operacao, NEW.conta_bancaria_id,
      NEW.favorecido_id, NEW.descricao, NEW.numero_documento, NEW.subcentro,
      _rec.data_pagamento, _rec.valor, _rec.tipo_operacao, _rec.conta_bancaria_id,
      _rec.favorecido_id, _rec.descricao, _rec.numero_documento, _rec.subcentro
    );

    IF _candidate = 'D1' THEN _best_nivel := 'D1'; EXIT;
    ELSIF _candidate = 'D2' AND _best_nivel NOT IN ('D1') THEN _best_nivel := 'D2';
    ELSIF _candidate = 'D3' AND _best_nivel NOT IN ('D1','D2') THEN _best_nivel := 'D3';
    END IF;
  END LOOP;

  IF _best_nivel IN ('D1','D2','D3') THEN
    NEW.importado_duplicado := true;
    NEW.nivel_duplicidade := _best_nivel;
  ELSE
    NEW.nivel_duplicidade := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: exec_query(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exec_query(sql text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      result jsonb;
    BEGIN
      EXECUTE 'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (' || sql || ') t' INTO result;
      RETURN result;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('_error', SQLERRM, 'sqlstate', SQLSTATE);
    END;
    $$;


--
-- Name: exec_sql(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exec_sql(sql text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  EXECUTE sql;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;


--
-- Name: fin_classif_staging_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_classif_staging_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: financeiro_saldos_v2_apply_previous_extrato(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.financeiro_saldos_v2_apply_previous_extrato() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_prev_ano_mes TEXT;
  v_prev_saldo_extrato NUMERIC;
BEGIN
  v_prev_ano_mes := to_char(
    to_date(NEW.ano_mes || '-01', 'YYYY-MM-DD') - interval '1 month',
    'YYYY-MM'
  );

  SELECT s.saldo_final
    INTO v_prev_saldo_extrato
  FROM public.financeiro_saldos_bancarios_v2 s
  WHERE s.conta_bancaria_id = NEW.conta_bancaria_id
    AND s.ano_mes = v_prev_ano_mes
    AND (TG_OP <> 'UPDATE' OR s.id <> NEW.id)
  ORDER BY s.updated_at DESC, s.created_at DESC
  LIMIT 1;

  IF v_prev_saldo_extrato IS NOT NULL THEN
    NEW.saldo_inicial := v_prev_saldo_extrato;
    NEW.origem_saldo_inicial := 'automatico';
    RETURN NEW;
  END IF;

  -- No previous month found: allow save with manual origin (no blocking)
  NEW.origem_saldo_inicial := COALESCE(NULLIF(NEW.origem_saldo_inicial, ''), 'manual');
  RETURN NEW;
END;
$$;


--
-- Name: financeiro_saldos_v2_propagate_next_initial(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.financeiro_saldos_v2_propagate_next_initial() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_next_ano_mes TEXT;
BEGIN
  v_next_ano_mes := to_char(
    to_date(NEW.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month',
    'YYYY-MM'
  );

  UPDATE public.financeiro_saldos_bancarios_v2 next
     SET saldo_inicial = NEW.saldo_final,
         origem_saldo_inicial = 'automatico',
         updated_at = now()
   WHERE next.conta_bancaria_id = NEW.conta_bancaria_id
     AND next.ano_mes = v_next_ano_mes
     AND next.id <> NEW.id
     AND abs(COALESCE(next.saldo_inicial, 0) - COALESCE(NEW.saldo_final, 0)) > 0.01;

  RETURN NULL;
END;
$$;


--
-- Name: fn_audit_conciliacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit_conciliacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_cliente_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT cliente_id INTO v_cliente_id
    FROM extrato_bancario_v2 WHERE id = NEW.extrato_id;

    INSERT INTO conciliacao_audit_log (
      acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id,
      payload_depois
    ) VALUES (
      'conciliacao_criada', NEW.aprovado_por,
      v_cliente_id,
      NEW.extrato_id, NEW.lancamento_id, NEW.id,
      to_jsonb(NEW)
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' AND OLD.desfeito_em IS NULL AND NEW.desfeito_em IS NOT NULL THEN
    SELECT cliente_id INTO v_cliente_id
    FROM extrato_bancario_v2 WHERE id = NEW.extrato_id;

    INSERT INTO conciliacao_audit_log (
      acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id,
      payload_antes, payload_depois, motivo
    ) VALUES (
      'conciliacao_desfeita', NEW.desfeito_por,
      v_cliente_id,
      NEW.extrato_id, NEW.lancamento_id, NEW.id,
      to_jsonb(OLD), to_jsonb(NEW), NEW.desfeito_motivo
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: FUNCTION fn_audit_conciliacao(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_audit_conciliacao() IS 'Mesa Operacional v2. Registra criação/desfazimento de conciliação em
conciliacao_audit_log. Sem setting — sempre executa. Criada PR0.A.';


--
-- Name: fn_auditoria_consistencia_zoot(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auditoria_consistencia_zoot(p_fazenda_id uuid DEFAULT NULL::uuid) RETURNS TABLE(fazenda_id uuid, cenario text, ano integer, mes integer, cat_saldo_final bigint, faz_saldo_final bigint, diff_saldo_final bigint, cat_peso_total_final numeric, faz_peso_total_final numeric, diff_peso_total_final numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH cat AS (
    SELECT
      c.fazenda_id,
      c.cenario,
      c.ano,
      c.mes,
      SUM(c.saldo_final)::bigint AS sf,
      SUM(c.peso_total_final)::numeric AS ptf
    FROM vw_zoot_categoria_mensal c
    WHERE (p_fazenda_id IS NULL OR c.fazenda_id = p_fazenda_id)
    GROUP BY c.fazenda_id, c.cenario, c.ano, c.mes
  ),
  faz AS (
    SELECT
      f.fazenda_id,
      f.cenario,
      f.ano,
      f.mes,
      f.cabecas_final::bigint AS sf,
      f.peso_total_final_kg::numeric AS ptf
    FROM vw_zoot_fazenda_mensal f
    WHERE (p_fazenda_id IS NULL OR f.fazenda_id = p_fazenda_id)
  )
  SELECT
    f.fazenda_id,
    f.cenario,
    f.ano,
    f.mes,
    COALESCE(c.sf, 0) AS cat_saldo_final,
    f.sf AS faz_saldo_final,
    f.sf - COALESCE(c.sf, 0) AS diff_saldo_final,
    COALESCE(c.ptf, 0) AS cat_peso_total_final,
    f.ptf AS faz_peso_total_final,
    ROUND(f.ptf - COALESCE(c.ptf, 0), 2) AS diff_peso_total_final
  FROM faz f
  LEFT JOIN cat c USING (fazenda_id, cenario, ano, mes)
  WHERE ABS(f.sf - COALESCE(c.sf, 0)) > 0
     OR ABS(f.ptf - COALESCE(c.ptf, 0)) > 1
  ORDER BY f.fazenda_id, f.cenario, f.ano, f.mes;
$$;


--
-- Name: fn_bloqueia_delete_extrato(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_bloqueia_delete_extrato() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_mode TEXT;
BEGIN
  v_mode := fn_get_mesa_v2_mode();
  IF v_mode = 'off' THEN RETURN OLD; END IF;

  IF v_mode = 'log' THEN
    INSERT INTO conciliacao_audit_log (
      acao, cliente_id, extrato_id, motivo, payload_antes
    ) VALUES (
      'warning_delete_extrato', OLD.cliente_id, OLD.id,
      'mode=log: DELETE físico em extrato_bancario_v2 — não bloqueado (use soft delete)',
      to_jsonb(OLD)
    );
    RETURN OLD;
  ELSIF v_mode = 'enforce' THEN
    RAISE EXCEPTION 'DELETE direto bloqueado em extrato_bancario_v2. Use fluxo de reversão.'
      USING ERRCODE = 'P0001',
            HINT = 'Princípio 10: banco independe do financeiro. Use cancelado_em.';
  END IF;

  RETURN OLD;
END $$;


--
-- Name: FUNCTION fn_bloqueia_delete_extrato(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_bloqueia_delete_extrato() IS 'Mesa Operacional v2. Bloqueia DELETE físico em extrato_bancario_v2.
Princípio 10 da Constituição: banco independe do financeiro.
Respeita setting app.mesa_v2_triggers_enforce. Criada PR0.A em modo log.';


--
-- Name: fn_bloqueia_mutacao_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_bloqueia_mutacao_audit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'conciliacao_audit_log é append-only. % proibido.', TG_OP
    USING ERRCODE = 'P0001',
          HINT = 'Audit trail não pode ser alterado nem deletado por design (princípio 8).';
END $$;


--
-- Name: FUNCTION fn_bloqueia_mutacao_audit(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_bloqueia_mutacao_audit() IS 'Mesa Operacional v2. Bloqueia UPDATE e DELETE em conciliacao_audit_log.
Enforcement permanente desde PR0.A (não respeita setting). Criada PR0.A.';


--
-- Name: fn_cancelar_lancamento_auditoria(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_cancelar_lancamento_auditoria(p_lancamento_id uuid, p_motivo text DEFAULT 'duplicado_auditoria'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lan financeiro_lancamentos_v2%ROWTYPE;
  v_cbi conciliacao_bancaria_itens%ROWTYPE;
  v_cbi_desfeito boolean := false;
  v_ext_id uuid := NULL;
  v_soma numeric;
  v_status text;
BEGIN
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lancamento inexistente: %', p_lancamento_id;
  END IF;

  IF COALESCE(v_lan.cancelado, false) = true THEN
    RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id,
      'ja_cancelado', true, 'cbi_desfeito', false, 'extrato_id', NULL, 'motivo', v_lan.cancelado_motivo);
  END IF;

  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f
             WHERE f.cliente_id = v_lan.cliente_id AND f.fazenda_id = v_lan.fazenda_id
               AND f.ano_mes = v_lan.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'competencia % em mes fechado: cancelamento bloqueado', v_lan.ano_mes;
  END IF;

  SELECT * INTO v_cbi FROM conciliacao_bancaria_itens
   WHERE lancamento_id = p_lancamento_id AND desfeito_em IS NULL LIMIT 1;
  IF FOUND THEN
    v_ext_id := v_cbi.extrato_id;
    UPDATE conciliacao_bancaria_itens
       SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = 'cancelamento_lancamento_auditoria'
     WHERE id = v_cbi.id;

    SELECT COALESCE(sum(valor_aplicado),0) INTO v_soma FROM conciliacao_bancaria_itens
     WHERE extrato_id = v_ext_id AND desfeito_em IS NULL;
    SELECT CASE WHEN v_soma <= 0 THEN 'nao_conciliado'
                WHEN v_soma + 0.005 >= abs(e.valor) THEN 'conciliado'
                ELSE 'parcial' END INTO v_status
      FROM extrato_bancario_v2 e WHERE e.id = v_ext_id;
    UPDATE extrato_bancario_v2 SET status = v_status WHERE id = v_ext_id;

    INSERT INTO conciliacao_audit_log
      (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
    VALUES ('conciliacao_desfeita', v_uid, v_lan.cliente_id, v_ext_id, p_lancamento_id, v_cbi.id,
            'cancelamento_lancamento_auditoria', jsonb_build_object('status', v_status));
    v_cbi_desfeito := true;
  END IF;

  UPDATE financeiro_lancamentos_v2
     SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid, cancelado_motivo = p_motivo
   WHERE id = p_lancamento_id;

  RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id,
    'cbi_desfeito', v_cbi_desfeito, 'extrato_id', v_ext_id, 'motivo', p_motivo);
END $$;


--
-- Name: fn_cbi_desfazer_on_cancelamento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_cbi_desfazer_on_cancelamento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (OLD.cancelado IS DISTINCT FROM true) AND (NEW.cancelado = true) THEN
    UPDATE conciliacao_bancaria_itens cbi
       SET desfeito_em     = COALESCE(NEW.cancelado_em, now()),
           desfeito_por    = NEW.cancelado_por,
           desfeito_motivo = 'lancamento_cancelado'
     WHERE cbi.lancamento_id = NEW.id
       AND cbi.desfeito_em IS NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_classificacao_apply(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_apply(p_sessao_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id        uuid;
  v_res       jsonb;
  v_aplicados int := 0;
  v_pulados   int := 0;
  v_erros     int := 0;
BEGIN
  IF p_sessao_id IS NULL THEN RAISE EXCEPTION 'p_sessao_id obrigatorio'; END IF;

  FOR v_id IN
    SELECT staging_id FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id
      AND match_status = 'exato' AND aplicado = false AND match_lancamento_id IS NOT NULL
    ORDER BY excel_linha_origem
  LOOP
    BEGIN
      v_res := public.fn_classificacao_apply_row(v_id, false);
      IF (v_res->>'aplicado')::boolean THEN
        v_aplicados := v_aplicados + 1;
      ELSIF v_res->>'motivo' = 'pulado_subcentro_preenchido' THEN
        v_pulados := v_pulados + 1;
      ELSE
        v_erros := v_erros + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE financeiro_classificacao_staging
        SET erro_apply = SQLERRM, aplicado = false
        WHERE staging_id = v_id;
      v_erros := v_erros + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'sessao_id', p_sessao_id,
    'aplicados', v_aplicados,
    'pulados_subcentro_preenchido', v_pulados,
    'erros', v_erros
  );
END;
$$;


--
-- Name: FUNCTION fn_classificacao_apply(p_sessao_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_classificacao_apply(p_sessao_id uuid) IS 'PR-M: aplica UPDATE em financeiro_lancamentos_v2 a partir da staging. APENAS rows match_status=exato e aplicado=false. NUNCA sobrescreve campos já preenchidos (COALESCE). Sempre grava estado_anterior para rollback. Chamada manual explícita — sem trigger/job automático.';


--
-- Name: fn_classificacao_apply_row(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_lanc financeiro_lancamentos_v2%ROWTYPE; v_proposto jsonb; v_estado jsonb; v_user_id uuid;
BEGIN
  IF p_staging_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'p_staging_id obrigatorio', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'staging_nao_encontrada', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_permissao', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL); END IF;
  IF v_staging.match_lancamento_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_lancamento_vinculado', 'lancamento_id', NULL, 'estado_anterior', NULL); END IF;
  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = v_staging.match_lancamento_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    UPDATE financeiro_classificacao_staging SET erro_apply = 'lancamento nao encontrado ou cancelado', aplicado = false WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'lancamento_inexistente_ou_cancelado', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL); END IF;
  IF NOT p_overwrite AND v_lanc.subcentro IS NOT NULL THEN
    UPDATE financeiro_classificacao_staging SET erro_apply = 'subcentro ja preenchido no banco (conservador)', aplicado = false, match_status = 'ja_classificado' WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', true, 'aplicado', false, 'motivo', 'pulado_subcentro_preenchido', 'lancamento_id', v_lanc.id, 'estado_anterior', NULL); END IF;

  v_proposto := v_staging.update_proposto;
  v_estado := COALESCE(v_staging.estado_anterior, jsonb_build_object('subcentro', v_lanc.subcentro, 'macro_custo', v_lanc.macro_custo, 'grupo_custo', v_lanc.grupo_custo,
    'centro_custo', v_lanc.centro_custo, 'plano_conta_id', v_lanc.plano_conta_id, 'favorecido_id', v_lanc.favorecido_id, 'fazenda_id', v_lanc.fazenda_id,
    'descricao', v_lanc.descricao, 'numero_documento', v_lanc.numero_documento));

  IF p_overwrite THEN
    UPDATE financeiro_lancamentos_v2 SET subcentro = COALESCE(v_proposto->>'subcentro', subcentro), macro_custo = COALESCE(v_proposto->>'macro_custo', macro_custo),
      grupo_custo = COALESCE(v_proposto->>'grupo_custo', grupo_custo), centro_custo = COALESCE(v_proposto->>'centro_custo', centro_custo),
      plano_conta_id = COALESCE(NULLIF(v_proposto->>'plano_conta_id','')::uuid, plano_conta_id), favorecido_id = COALESCE(NULLIF(v_proposto->>'favorecido_id','')::uuid, favorecido_id),
      fazenda_id = COALESCE(NULLIF(v_proposto->>'fazenda_id','')::uuid, fazenda_id),
      descricao = COALESCE(NULLIF(v_proposto->>'produto',''), descricao),
      numero_documento = COALESCE(NULLIF(v_proposto->>'numero_documento',''), numero_documento),
      updated_at = now() WHERE id = v_lanc.id;
  ELSE
    UPDATE financeiro_lancamentos_v2 SET subcentro = COALESCE(subcentro, v_proposto->>'subcentro'), macro_custo = COALESCE(macro_custo, v_proposto->>'macro_custo'),
      grupo_custo = COALESCE(grupo_custo, v_proposto->>'grupo_custo'), centro_custo = COALESCE(centro_custo, v_proposto->>'centro_custo'),
      plano_conta_id = COALESCE(plano_conta_id, NULLIF(v_proposto->>'plano_conta_id','')::uuid), favorecido_id = COALESCE(favorecido_id, NULLIF(v_proposto->>'favorecido_id','')::uuid),
      fazenda_id = COALESCE(fazenda_id, NULLIF(v_proposto->>'fazenda_id','')::uuid),
      descricao = COALESCE(descricao, NULLIF(v_proposto->>'produto','')),
      numero_documento = COALESCE(numero_documento, NULLIF(v_proposto->>'numero_documento','')),
      updated_at = now() WHERE id = v_lanc.id;
  END IF;

  UPDATE financeiro_classificacao_staging SET aplicado = true, aplicado_em = now(), aplicado_por = v_user_id, estado_anterior = v_estado, erro_apply = NULL WHERE staging_id = p_staging_id;
  RETURN jsonb_build_object('ok', true, 'aplicado', true, 'motivo', CASE WHEN p_overwrite THEN 'aplicado_overwrite' ELSE 'aplicado_conservador' END, 'lancamento_id', v_lanc.id, 'estado_anterior', v_estado);
END;
$$;


--
-- Name: fn_classificacao_candidatos_ambiguo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_candidatos_ambiguo(p_staging_id uuid) RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
  v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));
  RETURN QUERY
  SELECT l.id, l.descricao, l.observacao, l.data_pagamento, l.valor, l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo, l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id AND l.cancelado = false AND l.ano_mes = v_ano_mes AND l.data_pagamento = v_s.excel_data
    AND ABS(l.valor) BETWEEN v_s.excel_valor - 0.005 AND v_s.excel_valor + 0.005 AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND ((l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
         (l.tipo_operacao = '2-Saídas' AND l.conta_bancaria_id = v_conta_origem_id) OR
         (l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id))
  ORDER BY l.data_pagamento, l.id LIMIT 10;
END;
$$;


--
-- Name: FUNCTION fn_classificacao_candidatos_ambiguo(p_staging_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_classificacao_candidatos_ambiguo(p_staging_id uuid) IS 'PR-M4: lista candidatos de match para staging row ambigua. Reproduz criterio da fn_classificacao_populate_staging.';


--
-- Name: fn_classificacao_candidatos_grupo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_candidatos_grupo(p_staging_id uuid) RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
  v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));

  RETURN QUERY
  SELECT
    l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
    l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
    l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
    AND ABS(l.valor) <= v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
                                                ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
    )
  -- PR-GRUPO-ORDER-01: valor igual ao Excel PRIMEIRO; depois menor diferença de valor;
  -- depois menor distância de data; id no desempate determinístico.
  ORDER BY (ABS(l.valor - v_s.excel_valor) <= 0.005) DESC,
           ABS(l.valor - v_s.excel_valor) ASC,
           ABS(l.data_pagamento - v_s.excel_data),
           l.id
  LIMIT 20;
END;
$$;


--
-- Name: fn_classificacao_candidatos_proximos(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_candidatos_proximos(p_staging_id uuid) RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
  v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));

  RETURN QUERY
  SELECT
    l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
    l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
    l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
    AND ABS(l.valor) BETWEEN v_s.excel_valor - 0.005 AND v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
                                                ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
    )
  ORDER BY ABS(l.data_pagamento - v_s.excel_data), l.id
  LIMIT 10;
END;
$$;


--
-- Name: fn_classificacao_composicao_sugerida(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_composicao_sugerida(p_lancamento_id uuid, p_sessao_id uuid) RETURNS TABLE(composicao_n integer, staging_ids uuid[], linhas integer[], soma numeric, diferenca numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_cliente uuid; v_user uuid; v_lanc financeiro_lancamentos_v2%ROWTYPE;
  v_alvo numeric; v_conta_lanc uuid[];
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN; END IF;
  BEGIN v_user := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user))) THEN RETURN; END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id AND cliente_id = v_cliente;
  IF NOT FOUND OR v_lanc.cancelado = true THEN RETURN; END IF;
  v_alvo := ABS(v_lanc.valor);
  v_conta_lanc := array_remove(ARRAY[v_lanc.conta_bancaria_id, v_lanc.conta_destino_id], NULL);

  RETURN QUERY
  WITH cand AS (
    SELECT s.staging_id, s.excel_linha_origem AS linha, s.excel_valor AS valor
    FROM financeiro_classificacao_staging s
    WHERE s.sessao_id = p_sessao_id
      AND s.match_status IN ('sem_match','sem_conta_para_match','candidatos_proximos')
      AND s.match_lancamento_id IS NULL
      AND s.match_lancamento_ids IS NULL
      AND s.excel_valor IS NOT NULL
      AND s.excel_valor <= v_alvo + 0.005
      AND s.excel_data BETWEEN v_lanc.data_pagamento - 10 AND v_lanc.data_pagamento + 10
      AND s.excel_tipo_operacao = v_lanc.tipo_operacao
      AND (
        (s.conta_origem_id = ANY(v_conta_lanc) OR s.conta_destino_id = ANY(v_conta_lanc))
        OR (s.conta_origem_id IS NULL AND s.conta_destino_id IS NULL)
      )
    ORDER BY ABS(s.excel_data - v_lanc.data_pagamento), s.excel_valor
    LIMIT 40
  ),
  combos AS (
    -- PR-INVERSO-01-fix: aliases c_* NÃO podem colidir com as colunas do RETURNS TABLE
    -- (composicao_n/staging_ids/linhas/soma/diferenca) — 42702 ambiguous no RETURN QUERY.
    SELECT ARRAY[a.staging_id, b.staging_id] AS c_sids, ARRAY[a.linha, b.linha] AS c_linhas, (a.valor + b.valor) AS c_soma, 2 AS c_n
    FROM cand a JOIN cand b ON a.staging_id < b.staging_id
    WHERE ABS(a.valor + b.valor - v_alvo) <= 0.005
    UNION ALL
    SELECT ARRAY[a.staging_id, b.staging_id, c.staging_id], ARRAY[a.linha, b.linha, c.linha], (a.valor + b.valor + c.valor), 3
    FROM cand a JOIN cand b ON a.staging_id < b.staging_id JOIN cand c ON b.staging_id < c.staging_id
    WHERE ABS(a.valor + b.valor + c.valor - v_alvo) <= 0.005
    UNION ALL
    SELECT ARRAY[a.staging_id, b.staging_id, c.staging_id, d.staging_id], ARRAY[a.linha, b.linha, c.linha, d.linha], (a.valor + b.valor + c.valor + d.valor), 4
    FROM cand a JOIN cand b ON a.staging_id < b.staging_id JOIN cand c ON b.staging_id < c.staging_id JOIN cand d ON c.staging_id < d.staging_id
    WHERE ABS(a.valor + b.valor + c.valor + d.valor - v_alvo) <= 0.005
  )
  SELECT (row_number() OVER (ORDER BY c_n, ABS(c_soma - v_alvo)))::int,
         c_sids, c_linhas, c_soma, (c_soma - v_alvo)
  FROM combos
  ORDER BY c_n, ABS(c_soma - v_alvo)
  LIMIT 5;
END;
$$;


--
-- Name: fn_classificacao_desfazer_ambiguo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_desfazer_ambiguo(p_staging_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.match_status <> 'ambiguo_resolvido' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_resolvido');
  END IF;
  IF v_staging.aplicado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_aplicado_reverter_antes');
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = NULL,
      match_status        = 'ambiguo',
      match_resolvido_em  = NULL,
      match_resolvido_por = NULL,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'desfeito');
END;
$$;


--
-- Name: fn_classificacao_desfazer_grupo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_desfazer_grupo(p_staging_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid; v_origem text;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.match_status <> 'resolvido_grupo' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_resolvido_grupo');
  END IF;
  IF v_staging.aplicado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_aplicado_reverter_antes');
  END IF;

  -- origem gravada no resolver; default seguro se ausente/inesperada.
  v_origem := COALESCE(v_staging.estado_anterior #>> '{}', 'candidatos_proximos');
  IF v_origem NOT IN ('candidatos_proximos','sem_match') THEN v_origem := 'candidatos_proximos'; END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_ids = NULL,
      match_lancamento_id  = NULL,
      match_status         = v_origem,
      estado_anterior      = NULL,
      match_resolvido_em   = NULL,
      match_resolvido_por  = NULL,
      updated_at           = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'desfeito', 'match_status', v_origem);
END;
$$;


--
-- Name: fn_classificacao_desfazer_proximos(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_desfazer_proximos(p_staging_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.match_status <> 'resolvido_manual' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_resolvido');
  END IF;
  -- Se já aplicado, precisa reverter o apply antes (fn_classificacao_reverter_row).
  IF v_staging.aplicado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_aplicado_reverter_antes');
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = NULL,
      match_status        = 'candidatos_proximos',
      match_resolvido_em  = NULL,
      match_resolvido_por = NULL,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'desfeito');
END;
$$;


--
-- Name: fn_classificacao_editar_proposto(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid; v_prop jsonb; v_res jsonb; v_fav uuid; v_faz uuid; v_k text;
  v_aplicados text[] := '{}'; v_rejeitados jsonb := '{}'::jsonb;
  c_editaveis constant text[] := ARRAY['subcentro','favorecido_id','fazenda_id','produto','safra','categoria','numero_documento'];
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao'); END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'patch_invalido'); END IF;

  v_prop := COALESCE(v_staging.update_proposto, '{}'::jsonb);
  FOR v_k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_k = ANY (c_editaveis)) THEN v_rejeitados := v_rejeitados || jsonb_build_object(v_k, 'campo_nao_editavel'); END IF;
  END LOOP;

  IF p_patch ? 'subcentro' THEN
    IF jsonb_typeof(p_patch->'subcentro') = 'null' OR NULLIF(trim(p_patch->>'subcentro'), '') IS NULL THEN
      v_prop := v_prop - 'subcentro' - 'macro_custo' - 'grupo_custo' - 'centro_custo' - 'plano_conta_id';
      v_aplicados := array_append(v_aplicados, 'subcentro');
    ELSE
      v_res := public.fn_classificacao_resolver_subcentro(v_staging.cliente_id, p_patch->>'subcentro');
      IF (v_res->>'ok')::boolean THEN
        v_prop := v_prop || jsonb_build_object('subcentro', v_res->>'subcentro') || jsonb_build_object('macro_custo', v_res->>'macro_custo')
          || jsonb_build_object('grupo_custo', v_res->>'grupo_custo') || jsonb_build_object('centro_custo', v_res->>'centro_custo') || jsonb_build_object('plano_conta_id', v_res->>'plano_conta_id');
        v_aplicados := array_append(v_aplicados, 'subcentro');
      ELSE v_rejeitados := v_rejeitados || jsonb_build_object('subcentro', v_res->>'motivo'); END IF;
    END IF;
  END IF;

  IF p_patch ? 'favorecido_id' THEN
    IF jsonb_typeof(p_patch->'favorecido_id') = 'null' OR NULLIF(trim(p_patch->>'favorecido_id'), '') IS NULL THEN
      v_prop := v_prop - 'favorecido_id'; v_aplicados := array_append(v_aplicados, 'favorecido_id');
    ELSE
      SELECT id INTO v_fav FROM financeiro_fornecedores WHERE id = NULLIF(p_patch->>'favorecido_id', '')::uuid AND cliente_id = v_staging.cliente_id AND ativo = true;
      IF FOUND THEN v_prop := v_prop || jsonb_build_object('favorecido_id', v_fav::text); v_aplicados := array_append(v_aplicados, 'favorecido_id');
      ELSE v_rejeitados := v_rejeitados || jsonb_build_object('favorecido_id', 'fornecedor_invalido'); END IF;
    END IF;
  END IF;

  IF p_patch ? 'fazenda_id' THEN
    IF jsonb_typeof(p_patch->'fazenda_id') = 'null' OR NULLIF(trim(p_patch->>'fazenda_id'), '') IS NULL THEN
      v_prop := v_prop - 'fazenda_id'; v_aplicados := array_append(v_aplicados, 'fazenda_id');
    ELSE
      SELECT id INTO v_faz FROM fazendas WHERE id = NULLIF(p_patch->>'fazenda_id','')::uuid AND cliente_id = v_staging.cliente_id;
      IF FOUND THEN v_prop := v_prop || jsonb_build_object('fazenda_id', v_faz::text); v_aplicados := array_append(v_aplicados, 'fazenda_id');
      ELSE v_rejeitados := v_rejeitados || jsonb_build_object('fazenda_id', 'fazenda_invalida'); END IF;
    END IF;
  END IF;

  IF p_patch ? 'produto' THEN
    IF NULLIF(trim(p_patch->>'produto'), '') IS NULL THEN v_prop := v_prop - 'produto'; ELSE v_prop := v_prop || jsonb_build_object('produto', trim(p_patch->>'produto')); END IF;
    v_aplicados := array_append(v_aplicados, 'produto');
  END IF;
  IF p_patch ? 'safra' THEN
    IF NULLIF(trim(p_patch->>'safra'), '') IS NULL THEN v_prop := v_prop - 'safra'; ELSE v_prop := v_prop || jsonb_build_object('safra', trim(p_patch->>'safra')); END IF;
    v_aplicados := array_append(v_aplicados, 'safra');
  END IF;
  IF p_patch ? 'categoria' THEN
    IF NULLIF(trim(p_patch->>'categoria'), '') IS NULL THEN v_prop := v_prop - 'categoria'; ELSE v_prop := v_prop || jsonb_build_object('categoria', trim(p_patch->>'categoria')); END IF;
    v_aplicados := array_append(v_aplicados, 'categoria');
  END IF;
  IF p_patch ? 'numero_documento' THEN
    IF NULLIF(trim(p_patch->>'numero_documento'), '') IS NULL THEN v_prop := v_prop - 'numero_documento'; ELSE v_prop := v_prop || jsonb_build_object('numero_documento', trim(p_patch->>'numero_documento')); END IF;
    v_aplicados := array_append(v_aplicados, 'numero_documento');
  END IF;

  IF array_length(v_aplicados, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nada_aplicado', 'update_proposto', v_staging.update_proposto, 'campos_aplicados', to_jsonb(v_aplicados), 'campos_rejeitados', v_rejeitados);
  END IF;

  v_prop := v_prop || jsonb_build_object('_meta', jsonb_build_object('origem_resolucao','manual','tier','manual','motor_version',1));

  UPDATE financeiro_classificacao_staging
  SET update_proposto = v_prop, update_proposto_original = COALESCE(update_proposto_original, v_staging.update_proposto),
      proposto_editado_em = now(), proposto_editado_por = v_user_id, updated_at = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', CASE WHEN v_rejeitados <> '{}'::jsonb THEN 'aplicado_parcial' ELSE 'aplicado' END,
    'update_proposto', v_prop, 'campos_aplicados', to_jsonb(v_aplicados), 'campos_rejeitados', v_rejeitados);
END;
$$;


--
-- Name: fn_classificacao_meta(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_meta(p_motor jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'tier',             p_motor->>'tier',
    'origem_resolucao', COALESCE(p_motor->>'tier', 'orfao'),
    'regra_id',         p_motor->>'regra_id',
    'alias_id',         p_motor->>'alias_id',
    'motor_version',    COALESCE((p_motor->>'motor_version')::int, 1)
  ));
$$;


--
-- Name: fn_classificacao_populate_staging(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_row jsonb; v_linha int; v_subcentro text; v_fornecedor_txt text; v_produto text;
  v_conta_origem_txt text; v_conta_destino_txt text; v_ano_mes text; v_data date; v_valor numeric;
  v_tipo_op text; v_fazenda_codigo text; v_observacao text; v_documento text;
  v_conta_origem_id uuid; v_conta_destino_id uuid; v_fazenda_id uuid; v_favorecido_id uuid;
  v_plano_conta_id uuid; v_plano_macro text; v_plano_grupo text; v_plano_centro text;
  v_alias_id_usado uuid; v_subcentro_raw text; v_ctx jsonb; v_motor jsonb; v_meta jsonb;
  v_match_count int; v_match_lanc_id uuid; v_match_subcentro text; v_match_status text; v_update_proposto jsonb;
  -- PR-MESA-MATCH-01: memória de aplicação anterior + transparência do guard
  v_heranca_count int; v_heranca_lanc_id uuid; v_herdado boolean; v_sem_conta boolean;
  -- PR-MESA-DATA-01: candidatos próximos por data (±10d ∩ ano_mes)
  v_prox_count int;
  v_total int := 0; v_inseridos int := 0; v_counts jsonb := '{}'::jsonb;
BEGIN
  IF p_sessao_id IS NULL OR p_cliente_id IS NULL THEN RAISE EXCEPTION 'p_sessao_id e p_cliente_id obrigatorios'; END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RAISE EXCEPTION 'sem_permissao para cliente %', p_cliente_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_total := v_total + 1;
    v_linha := (v_row->>'linha')::int;
    v_subcentro := NULLIF(trim(v_row->>'subcentro'), '');
    v_fornecedor_txt := NULLIF(trim(v_row->>'fornecedor'), '');
    v_produto := NULLIF(trim(v_row->>'produto'), '');
    v_conta_origem_txt := NULLIF(trim(v_row->>'conta_origem'), '');
    v_conta_destino_txt := NULLIF(trim(v_row->>'conta_destino'), '');
    v_ano_mes := NULLIF(trim(v_row->>'ano_mes'), '');
    v_data := NULLIF(v_row->>'data', '')::date;
    v_valor := (v_row->>'valor')::numeric;
    v_tipo_op := NULLIF(trim(v_row->>'tipo_operacao'), '');
    v_fazenda_codigo := NULLIF(trim(v_row->>'fazenda_codigo'), '');
    v_observacao := NULLIF(trim(v_row->>'observacao'), '');
    v_documento := NULLIF(trim(v_row->>'documento'), '');
    IF v_tipo_op = (E'3-Transferência') THEN v_tipo_op := (E'3-Transferências'); END IF;

    v_fazenda_id := NULL;
    IF v_fazenda_codigo IS NOT NULL THEN
      SELECT id INTO v_fazenda_id FROM fazendas WHERE cliente_id = p_cliente_id AND codigo_importacao = v_fazenda_codigo LIMIT 1;
    END IF;
    v_conta_origem_id := COALESCE(NULLIF(v_row->>'conta_origem_id','')::uuid, fn_classificacao_resolver_conta(p_cliente_id, v_conta_origem_txt));
    v_conta_destino_id := COALESCE(NULLIF(v_row->>'conta_destino_id','')::uuid, fn_classificacao_resolver_conta(p_cliente_id, v_conta_destino_txt));
    v_favorecido_id := NULL;
    IF v_fornecedor_txt IS NOT NULL THEN
      SELECT id INTO v_favorecido_id FROM financeiro_fornecedores WHERE cliente_id = p_cliente_id AND ativo = true AND lower(trim(nome)) = lower(v_fornecedor_txt) LIMIT 1;
    END IF;
    v_subcentro_raw := v_subcentro;

    v_ctx := jsonb_build_object('subcentro', v_subcentro_raw, 'fornecedor', v_fornecedor_txt, 'produto', v_produto,
      'observacao', v_observacao, 'conta_origem', v_conta_origem_txt, 'conta_destino', v_conta_destino_txt,
      'fazenda_codigo', v_fazenda_codigo, 'ano_mes', v_ano_mes, 'tipo_operacao', v_tipo_op, 'data', v_data, 'valor', v_valor);
    v_motor := public.fn_classificacao_resolver_contexto(p_cliente_id, v_ctx, true);
    v_meta  := public.fn_classificacao_meta(v_motor);

    IF (v_motor->>'ok')::boolean THEN
      v_subcentro := v_motor->>'subcentro'; v_plano_macro := v_motor->>'macro_custo'; v_plano_grupo := v_motor->>'grupo_custo';
      v_plano_centro := v_motor->>'centro_custo'; v_plano_conta_id := NULLIF(v_motor->>'plano_conta_id','')::uuid; v_alias_id_usado := NULLIF(v_motor->>'alias_id','')::uuid;
    ELSE
      v_subcentro := v_subcentro_raw; v_plano_conta_id := NULL; v_plano_macro := NULL; v_plano_grupo := NULL; v_plano_centro := NULL; v_alias_id_usado := NULL;
    END IF;

    -- reset por linha (PR-MESA-MATCH-01 / PR-MESA-DATA-01)
    v_match_count := 0; v_match_lanc_id := NULL; v_match_subcentro := NULL;
    v_heranca_count := 0; v_heranca_lanc_id := NULL; v_herdado := false; v_sem_conta := false;
    v_prox_count := 0;

    -- PR-MESA-MATCH-01 · PASSO 0: MEMÓRIA DE APLICAÇÃO ANTERIOR.
    -- Se a MESMA linha (por conteúdo) já foi aplicada num populate anterior e gerou
    -- um lançamento VIVO (cancelado=false), herda esse vínculo. REGRA DE SEGURANÇA:
    -- só herda com match_lancamento_id ÚNICO (count(DISTINCT)=1); conteúdo ambíguo
    -- (2+ lançamentos distintos) ⇒ NÃO herda, segue o fluxo normal (o sistema não chuta).
    IF v_valor IS NOT NULL AND v_data IS NOT NULL AND v_tipo_op IS NOT NULL THEN
      SELECT COUNT(DISTINCT s.match_lancamento_id), (array_agg(DISTINCT s.match_lancamento_id))[1]
        INTO v_heranca_count, v_heranca_lanc_id
        FROM financeiro_classificacao_staging s
        JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
       WHERE s.cliente_id = p_cliente_id
         AND s.aplicado = true
         AND s.match_lancamento_id IS NOT NULL
         AND s.excel_valor = v_valor
         AND s.excel_data = v_data
         AND s.excel_tipo_operacao = v_tipo_op
         AND COALESCE(s.excel_fornecedor,'') = COALESCE(v_fornecedor_txt,'')
         AND l.cancelado = false;
    END IF;

    IF v_heranca_count = 1 AND v_heranca_lanc_id IS NOT NULL THEN
      -- herdou: a Mesa reconhece o próprio filho; NÃO roda o match por atributos.
      v_herdado := true;
      v_match_lanc_id := v_heranca_lanc_id;
      v_match_status := 'ja_aplicado';
    ELSE
      -- ── match por atributos (corpo PR-MATCH-ENTRADAS-1 verbatim) ──
      IF v_data IS NOT NULL AND v_valor IS NOT NULL AND v_tipo_op IS NOT NULL THEN
        -- 1-Entradas (PR-MATCH-ENTRADAS-1): conta de entrada = destino se houver, senão origem.
        IF v_tipo_op = '1-Entradas' AND COALESCE(v_conta_destino_id, v_conta_origem_id) IS NOT NULL THEN
          SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id FROM financeiro_lancamentos_v2
          WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data,'YYYY-MM')) AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor-0.005 AND v_valor+0.005 AND tipo_operacao = v_tipo_op
            AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN conta_destino_id = v_conta_destino_id
                      ELSE (conta_destino_id = v_conta_origem_id OR conta_bancaria_id = v_conta_origem_id) END);
        ELSIF v_tipo_op = (E'2-Saídas') AND v_conta_origem_id IS NOT NULL THEN
          SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id FROM financeiro_lancamentos_v2
          WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data,'YYYY-MM')) AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor-0.005 AND v_valor+0.005 AND tipo_operacao = v_tipo_op AND conta_bancaria_id = v_conta_origem_id;
        ELSIF v_tipo_op = (E'3-Transferências') AND v_conta_origem_id IS NOT NULL AND v_conta_destino_id IS NOT NULL THEN
          SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_match_count, v_match_lanc_id FROM financeiro_lancamentos_v2
          WHERE cliente_id = p_cliente_id AND cancelado = false AND ano_mes = COALESCE(v_ano_mes, to_char(v_data,'YYYY-MM')) AND data_pagamento = v_data AND ABS(valor) BETWEEN v_valor-0.005 AND v_valor+0.005 AND tipo_operacao = v_tipo_op AND conta_bancaria_id = v_conta_origem_id AND conta_destino_id = v_conta_destino_id;
        -- PR-MESA-MATCH-01 · DELTA 3 — o match por atributos foi PULADO por falta de
        -- conta resolvida (entrada sem destino/origem; saída sem origem). Marca sem_conta.
        ELSIF v_tipo_op = '1-Entradas' AND COALESCE(v_conta_destino_id, v_conta_origem_id) IS NULL THEN
          v_sem_conta := true;
        ELSIF v_tipo_op = (E'2-Saídas') AND v_conta_origem_id IS NULL THEN
          v_sem_conta := true;
        END IF;
      END IF;
      IF v_match_count = 1 AND v_match_lanc_id IS NOT NULL THEN SELECT subcentro INTO v_match_subcentro FROM financeiro_lancamentos_v2 WHERE id = v_match_lanc_id; END IF;
      IF v_tipo_op = (E'3-Transferências') THEN v_match_status := CASE WHEN v_match_count=1 THEN 'ja_classificado' WHEN v_match_count>1 THEN 'ambiguo' ELSE 'sem_match' END;
      -- PR-MESA-MATCH-01 · DELTA 3: distingue "sem conta pra procurar" de "procurou e não achou".
      ELSIF v_match_count = 0 THEN v_match_status := CASE WHEN v_sem_conta THEN 'sem_conta_para_match' ELSE 'sem_match' END;
      ELSIF v_match_count > 1 THEN v_match_status := 'ambiguo';
      ELSIF v_match_subcentro IS NULL THEN v_match_status := 'exato';
      ELSIF lower(trim(v_match_subcentro)) = lower(v_subcentro) THEN v_match_status := 'ja_classificado';
      ELSE v_match_status := 'divergente'; END IF;
    END IF;

    -- PR-MESA-DATA-01 · DELTA 1 — CANDIDATOS PRÓXIMOS (±10 dias ∩ ano_mes). Só quando a data
    -- exata zerou (v_match_count=0), a conta foi resolvida (NOT v_sem_conta) e não
    -- houve herança. count>=1 ⇒ 'candidatos_proximos'; match_lancamento_id fica NULL
    -- (NUNCA auto-escolhe — nem com candidato único). count=0 ⇒ permanece sem_match.
    -- Ramo de conta ESPELHA o match exato vigente (idêntico ao candidatos_ambiguo).
    IF NOT v_herdado AND NOT v_sem_conta AND v_match_count = 0 THEN
      SELECT COUNT(*) INTO v_prox_count FROM financeiro_lancamentos_v2
      WHERE cliente_id = p_cliente_id AND cancelado = false AND status_transacao = 'realizado'
        AND ano_mes = COALESCE(v_ano_mes, to_char(v_data,'YYYY-MM'))
        AND ABS(valor) BETWEEN v_valor-0.005 AND v_valor+0.005
        AND tipo_operacao = v_tipo_op
        AND data_pagamento BETWEEN v_data - 10 AND v_data + 10
        AND (
          (v_tipo_op = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN conta_destino_id = v_conta_destino_id
                                              ELSE (conta_destino_id = v_conta_origem_id OR conta_bancaria_id = v_conta_origem_id) END)) OR
          (v_tipo_op = (E'2-Saídas')         AND conta_bancaria_id = v_conta_origem_id) OR
          (v_tipo_op = (E'3-Transferências') AND conta_bancaria_id = v_conta_origem_id AND conta_destino_id = v_conta_destino_id)
        );
      IF v_prox_count >= 1 THEN
        v_match_status := 'candidatos_proximos';
        v_match_lanc_id := NULL;
      END IF;
    END IF;

    v_update_proposto := jsonb_strip_nulls(jsonb_build_object('subcentro', v_subcentro, 'macro_custo', v_plano_macro, 'grupo_custo', v_plano_grupo,
      'centro_custo', v_plano_centro, 'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id)) || jsonb_build_object('_meta', v_meta);

    INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, excel_subcentro, excel_fornecedor, excel_produto,
      excel_conta_origem, excel_conta_destino, conta_origem_id, conta_destino_id, excel_ano_mes, excel_data, excel_valor, excel_tipo_operacao,
      excel_fazenda_codigo, excel_observacao, excel_documento, match_lancamento_id, match_status, update_proposto, alias_id_usado
    ) VALUES (p_sessao_id, p_cliente_id, v_linha, v_subcentro_raw, v_fornecedor_txt, v_produto, v_conta_origem_txt, v_conta_destino_txt,
      v_conta_origem_id, v_conta_destino_id, v_ano_mes, v_data, v_valor, v_tipo_op, v_fazenda_codigo, v_observacao, v_documento,
      -- PR-MESA-MATCH-01 · DELTA 2: grava o id herdado (v_herdado) OU o do match exato (count=1).
      -- candidatos_proximos: v_herdado=false, v_match_count=0 ⇒ grava NULL (decisão humana).
      CASE WHEN v_herdado OR v_match_count=1 THEN v_match_lanc_id ELSE NULL END, v_match_status, v_update_proposto, v_alias_id_usado
    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;
    v_inseridos := v_inseridos + 1;
  END LOOP;

  SELECT jsonb_object_agg(match_status, qt) INTO v_counts FROM (SELECT match_status, COUNT(*) AS qt FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id GROUP BY match_status) s;
  RETURN jsonb_build_object('sessao_id', p_sessao_id, 'total_linhas', v_total, 'inseridas', v_inseridos, 'counts_por_status', COALESCE(v_counts, '{}'::jsonb));
END;
$$;


--
-- Name: FUNCTION fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) IS 'PR-Aliases-Core (26/05/2026): popula financeiro_classificacao_staging com resolução de alias (financeiro_subcentro_aliases) ANTES do lookup direto em plano_contas. (array_agg(id ORDER BY id))[1] em vez de MIN(id) (preservado de PR-M2.2). Audit trail via alias_id_usado. NAO aplica UPDATE.';


--
-- Name: fn_classificacao_reresolver_match_sessao(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_reresolver_match_sessao(p_sessao_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid; v_cliente uuid; v_row financeiro_classificacao_staging%ROWTYPE;
  v_ano_mes text; v_prop_sub text; v_mc int; v_ml uuid; v_msub text; v_status text; v_ml_final uuid;
  v_proc int:=0; v_mud int:=0; v_ex int:=0; v_amb int:=0; v_sm int:=0; v_ap int:=0; v_ar int:=0;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_vazia_ou_inexistente'); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;
  SELECT count(*) FILTER (WHERE aplicado), count(*) FILTER (WHERE match_status = 'ambiguo_resolvido')
    INTO v_ap, v_ar FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id;
  FOR v_row IN SELECT * FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id AND aplicado = false AND match_status = 'sem_match'
      AND excel_tipo_operacao = '1-Entradas'
  LOOP
    v_proc := v_proc + 1;
    v_ano_mes := COALESCE(v_row.excel_ano_mes, to_char(v_row.excel_data, 'YYYY-MM'));
    v_prop_sub := v_row.update_proposto ->> 'subcentro';
    v_mc := 0; v_ml := NULL; v_msub := NULL;
    IF v_row.excel_data IS NOT NULL AND v_row.excel_valor IS NOT NULL AND COALESCE(v_row.conta_destino_id, v_row.conta_origem_id) IS NOT NULL THEN
      SELECT COUNT(*), (array_agg(id ORDER BY id))[1] INTO v_mc, v_ml FROM financeiro_lancamentos_v2
      WHERE cliente_id = v_cliente AND cancelado = false AND ano_mes = v_ano_mes AND data_pagamento = v_row.excel_data
        AND ABS(valor) BETWEEN v_row.excel_valor-0.005 AND v_row.excel_valor+0.005 AND tipo_operacao = '1-Entradas'
        AND (CASE WHEN v_row.conta_destino_id IS NOT NULL THEN conta_destino_id = v_row.conta_destino_id
                  ELSE (conta_destino_id = v_row.conta_origem_id OR conta_bancaria_id = v_row.conta_origem_id) END);
    END IF;
    IF v_mc = 1 AND v_ml IS NOT NULL THEN SELECT subcentro INTO v_msub FROM financeiro_lancamentos_v2 WHERE id = v_ml; END IF;
    IF v_mc = 0 THEN v_status := 'sem_match';
    ELSIF v_mc > 1 THEN v_status := 'ambiguo';
    ELSIF v_msub IS NULL THEN v_status := 'exato';
    ELSIF lower(trim(v_msub)) = lower(COALESCE(v_prop_sub,'')) THEN v_status := 'ja_classificado';
    ELSE v_status := 'divergente'; END IF;
    v_ml_final := CASE WHEN v_mc = 1 THEN v_ml ELSE NULL END;
    IF v_row.match_status IS DISTINCT FROM v_status OR v_row.match_lancamento_id IS DISTINCT FROM v_ml_final THEN
      UPDATE financeiro_classificacao_staging
        SET match_status = v_status, match_lancamento_id = v_ml_final, updated_at = now()
        WHERE staging_id = v_row.staging_id;
      v_mud := v_mud + 1;
    END IF;
    IF v_status = 'exato' THEN v_ex := v_ex + 1; ELSIF v_status = 'ambiguo' THEN v_amb := v_amb + 1; ELSIF v_status = 'sem_match' THEN v_sm := v_sm + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id,
    'processadas', v_proc, 'mudadas', v_mud, 'exato', v_ex, 'ambiguo', v_amb, 'sem_match', v_sm,
    'preservadas_aplicadas', v_ap, 'preservadas_ambiguo_resolvido', v_ar);
END;
$$;


--
-- Name: fn_classificacao_reresolver_sessao(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_reresolver_sessao(p_sessao_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid; v_cliente uuid; v_row financeiro_classificacao_staging%ROWTYPE;
  v_ctx jsonb; v_motor jsonb; v_meta jsonb; v_prop jsonb; v_alias uuid;
  v_proc int := 0; v_res int := 0; v_orfa int := 0; v_ap int := 0; v_ed int := 0; v_mud int := 0;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_vazia_ou_inexistente'); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao'); END IF;
  SELECT count(*) FILTER (WHERE aplicado), count(*) FILTER (WHERE NOT aplicado AND proposto_editado_em IS NOT NULL) INTO v_ap, v_ed FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id;
  FOR v_row IN SELECT * FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND aplicado = false AND proposto_editado_em IS NULL LOOP
    v_proc := v_proc + 1;
    v_ctx := jsonb_build_object('subcentro', v_row.excel_subcentro, 'fornecedor', v_row.excel_fornecedor, 'produto', v_row.excel_produto,
      'observacao', v_row.excel_observacao, 'conta_origem', v_row.excel_conta_origem, 'conta_destino', v_row.excel_conta_destino,
      'fazenda_codigo', v_row.excel_fazenda_codigo, 'ano_mes', v_row.excel_ano_mes, 'tipo_operacao', v_row.excel_tipo_operacao, 'data', v_row.excel_data, 'valor', v_row.excel_valor);
    v_motor := public.fn_classificacao_resolver_contexto(v_cliente, v_ctx, true); v_meta := public.fn_classificacao_meta(v_motor);
    IF (v_motor->>'ok')::boolean THEN
      v_prop := jsonb_strip_nulls(jsonb_build_object('subcentro', v_motor->>'subcentro', 'macro_custo', v_motor->>'macro_custo', 'grupo_custo', v_motor->>'grupo_custo', 'centro_custo', v_motor->>'centro_custo', 'plano_conta_id', v_motor->>'plano_conta_id',
        'favorecido_id', v_row.update_proposto->>'favorecido_id', 'fazenda_id', v_row.update_proposto->>'fazenda_id', 'produto', v_row.update_proposto->>'produto', 'safra', v_row.update_proposto->>'safra', 'categoria', v_row.update_proposto->>'categoria')) || jsonb_build_object('_meta', v_meta);
      v_alias := NULLIF(v_motor->>'alias_id','')::uuid; v_res := v_res + 1;
    ELSE
      v_prop := jsonb_strip_nulls(jsonb_build_object('subcentro', NULLIF(trim(v_row.excel_subcentro), ''), 'favorecido_id', v_row.update_proposto->>'favorecido_id', 'fazenda_id', v_row.update_proposto->>'fazenda_id', 'produto', v_row.update_proposto->>'produto', 'safra', v_row.update_proposto->>'safra', 'categoria', v_row.update_proposto->>'categoria')) || jsonb_build_object('_meta', v_meta);
      v_alias := NULL; v_orfa := v_orfa + 1;
    END IF;
    IF v_prop IS DISTINCT FROM v_row.update_proposto OR v_alias IS DISTINCT FROM v_row.alias_id_usado THEN
      UPDATE financeiro_classificacao_staging SET update_proposto = v_prop, alias_id_usado = v_alias, updated_at = now() WHERE staging_id = v_row.staging_id; v_mud := v_mud + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id, 'processadas', v_proc, 'mudadas', v_mud, 'resolvidas', v_res, 'ainda_orfa', v_orfa, 'preservadas_aplicadas', v_ap, 'preservadas_editadas', v_ed);
END;
$$;


--
-- Name: fn_classificacao_resetar_proposto(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_resetar_proposto(p_staging_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.update_proposto_original IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_edicao_para_resetar', 'update_proposto', v_staging.update_proposto);
  END IF;

  UPDATE financeiro_classificacao_staging
  SET update_proposto          = v_staging.update_proposto_original,
      update_proposto_original = NULL,
      proposto_editado_em      = NULL,
      proposto_editado_por     = NULL,
      updated_at               = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resetado', 'update_proposto', v_staging.update_proposto_original);
END;
$$;


--
-- Name: fn_classificacao_resolver_ambiguo(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_resolver_ambiguo(p_staging_id uuid, p_lanc_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE;
  v_user_id uuid;
  v_is_cand boolean;
  v_lanc    financeiro_lancamentos_v2%ROWTYPE;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.match_status <> 'ambiguo' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_ambiguo', 'match_status', v_staging.match_status);
  END IF;

  IF p_lanc_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lanc_id_obrigatorio'); END IF;

  SELECT EXISTS(SELECT 1 FROM public.fn_classificacao_candidatos_ambiguo(p_staging_id) c WHERE c.lanc_id = p_lanc_id)
    INTO v_is_cand;
  IF NOT v_is_cand THEN RETURN jsonb_build_object('ok', false, 'motivo', 'candidato_invalido'); END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = p_lanc_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = p_lanc_id,
      match_status        = 'ambiguo_resolvido',
      match_resolvido_em  = now(),
      match_resolvido_por = v_user_id,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resolvido',
    'match_lancamento_id', p_lanc_id, 'match_status', 'ambiguo_resolvido');
END;
$$;


--
-- Name: fn_classificacao_resolver_conta(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_resolver_conta(p_cliente_id uuid, p_texto text) RETURNS uuid
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_pre       text;
  v_partes    text[];
  v_prefixo   text;
  v_codigo_n  int;
  v_tipo_db   text;
  v_id        uuid;
BEGIN
  IF p_texto IS NULL OR trim(p_texto) = '' THEN
    RETURN NULL;
  END IF;

  -- "cc-001 | banco do brasil pecuária" → "cc-001"
  v_pre := lower(trim(split_part(p_texto, '|', 1)));

  -- "cc-001" → ['cc', '001']
  v_partes := string_to_array(v_pre, '-');
  IF array_length(v_partes, 1) < 2 THEN
    RETURN NULL;
  END IF;

  v_prefixo := v_partes[1];

  -- Sentinela 'terceiros | . .' → não tenta match
  IF v_prefixo = 'terceiros' THEN
    RETURN NULL;
  END IF;

  -- Mapeia prefixo → tipo_conta oficial (PR-H1)
  v_tipo_db := CASE v_prefixo
    WHEN 'cc'        THEN 'cc'
    WHEN 'inv'       THEN 'inv'
    WHEN 'c.credito' THEN 'cartao'
    ELSE NULL
  END;

  IF v_tipo_db IS NULL THEN
    RETURN NULL;
  END IF;

  -- "001" → 1
  BEGIN
    v_codigo_n := (regexp_replace(v_partes[2], '^0+', '', 'g'))::int;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  -- Match no banco: tipo + parseInt(codigo)
  SELECT id INTO v_id
  FROM financeiro_contas_bancarias
  WHERE cliente_id = p_cliente_id
    AND ativa = true
    AND tipo_conta = v_tipo_db
    AND COALESCE((regexp_replace(codigo_conta, '^0+', '', 'g'))::int, -1) = v_codigo_n
  LIMIT 1;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION fn_classificacao_resolver_conta(p_cliente_id uuid, p_texto text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_classificacao_resolver_conta(p_cliente_id uuid, p_texto text) IS 'PR-M: resolve "cc-001 | xxx" → conta_bancaria_id via tipo+parseInt(codigo). NULL se sentinela ou sem match. Determinístico, sem fuzzy.';


--
-- Name: fn_classificacao_resolver_contexto(uuid, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb, p_skip_guard boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_sub text; v_forn text; v_prod text; v_obs text; v_co text; v_cd text;
  v_faz text; v_safra text; v_tipo text; v_data date; v_valor numeric; v_folha text;
  v_regra record; v_alias record; v_plano record;
  v_pc uuid; v_tier text; v_regra_id uuid; v_alias_id uuid;
  c_motor_version constant int := 1;
BEGIN
  IF NOT COALESCE(p_skip_guard, false) THEN
    BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
    IF NOT (public.is_admin_agroinblue(v_user_id)
            OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
      RETURN jsonb_build_object('ok', false, 'tier', NULL, 'motivo', 'sem_permissao', 'motor_version', c_motor_version);
    END IF;
  END IF;

  v_sub   := NULLIF(trim(p_ctx->>'subcentro'), '');
  v_forn  := NULLIF(trim(p_ctx->>'fornecedor'), '');
  v_prod  := NULLIF(trim(p_ctx->>'produto'), '');
  v_obs   := NULLIF(trim(p_ctx->>'observacao'), '');
  v_co    := NULLIF(trim(p_ctx->>'conta_origem'), '');
  v_cd    := NULLIF(trim(p_ctx->>'conta_destino'), '');
  v_faz   := NULLIF(trim(p_ctx->>'fazenda_codigo'), '');
  v_safra := NULLIF(trim(COALESCE(p_ctx->>'safra', p_ctx->>'ano_mes')), '');
  v_tipo  := NULLIF(trim(p_ctx->>'tipo_operacao'), '');
  v_data  := NULLIF(p_ctx->>'data', '')::date;
  v_valor := NULLIF(p_ctx->>'valor', '')::numeric;

  SELECT r.id AS id, r.plano_conta_id AS plano_conta_id INTO v_regra
  FROM public.financeiro_classificacao_regras r
  WHERE r.ativo = true
    AND (r.cliente_id = p_cliente_id OR r.cliente_id IS NULL)
    AND (r.cond_subcentro     IS NULL OR unaccent(lower(trim(r.cond_subcentro)))     = unaccent(lower(COALESCE(v_sub,''))))
    AND (r.cond_fornecedor    IS NULL OR (v_forn IS NOT NULL AND unaccent(lower(v_forn)) LIKE '%'||unaccent(lower(r.cond_fornecedor))||'%'))
    AND (r.cond_produto       IS NULL OR (v_prod IS NOT NULL AND unaccent(lower(v_prod)) LIKE '%'||unaccent(lower(r.cond_produto))||'%'))
    AND (r.cond_observacao    IS NULL OR (v_obs  IS NOT NULL AND unaccent(lower(v_obs))  LIKE '%'||unaccent(lower(r.cond_observacao))||'%'))
    AND (r.cond_conta_origem  IS NULL OR unaccent(lower(trim(r.cond_conta_origem)))  = unaccent(lower(COALESCE(v_co,''))))
    AND (r.cond_conta_destino IS NULL OR unaccent(lower(trim(r.cond_conta_destino))) = unaccent(lower(COALESCE(v_cd,''))))
    AND (r.cond_fazenda       IS NULL OR lower(trim(r.cond_fazenda)) = lower(COALESCE(v_faz,'')))
    AND (r.cond_safra         IS NULL OR unaccent(lower(trim(r.cond_safra))) = unaccent(lower(COALESCE(v_safra,''))))
    AND (r.cond_tipo_operacao IS NULL OR r.cond_tipo_operacao = v_tipo)
    AND (r.cond_data_de       IS NULL OR (v_data  IS NOT NULL AND v_data  >= r.cond_data_de))
    AND (r.cond_data_ate      IS NULL OR (v_data  IS NOT NULL AND v_data  <= r.cond_data_ate))
    AND (r.cond_valor_min     IS NULL OR (v_valor IS NOT NULL AND v_valor >= r.cond_valor_min))
    AND (r.cond_valor_max     IS NULL OR (v_valor IS NOT NULL AND v_valor <= r.cond_valor_max))
  ORDER BY r.prioridade DESC, r.especificidade DESC, r.created_at DESC
  LIMIT 1;
  IF FOUND THEN v_pc := v_regra.plano_conta_id; v_tier := 'regra'; v_regra_id := v_regra.id; END IF;

  IF v_pc IS NULL AND v_sub IS NOT NULL THEN
    SELECT a.id AS id, a.plano_conta_id AS plano_conta_id INTO v_alias
    FROM public.financeiro_subcentro_aliases a
    WHERE a.ativo = true AND (a.cliente_id = p_cliente_id OR a.cliente_id IS NULL)
      AND lower(trim(a.alias_text)) = lower(trim(v_sub))
    ORDER BY (a.cliente_id IS NOT NULL) DESC, a.created_at DESC LIMIT 1;
    IF FOUND THEN v_pc := v_alias.plano_conta_id; v_tier := 'alias'; v_alias_id := v_alias.id; END IF;
  END IF;

  IF v_pc IS NULL AND v_sub IS NOT NULL THEN
    SELECT id INTO v_pc FROM financeiro_plano_contas
     WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL) AND lower(trim(subcentro)) = lower(v_sub) LIMIT 1;
    IF v_pc IS NOT NULL THEN v_tier := 'plano_exato'; END IF;
    IF v_pc IS NULL THEN
      SELECT id INTO v_pc FROM financeiro_plano_contas
       WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL) AND unaccent(lower(trim(subcentro))) = unaccent(lower(v_sub)) LIMIT 1;
      IF v_pc IS NOT NULL THEN v_tier := 'plano_unaccent'; END IF;
    END IF;
    IF v_pc IS NULL THEN
      v_folha := trim(split_part(v_sub, '/', array_length(string_to_array(v_sub, '/'), 1)));
      SELECT id INTO v_pc FROM financeiro_plano_contas
       WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL) AND unaccent(lower(trim(subcentro))) = unaccent(lower(v_folha)) LIMIT 1;
      IF v_pc IS NOT NULL THEN v_tier := 'plano_folha'; END IF;
    END IF;
  END IF;

  IF v_pc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'tier', NULL, 'regra_id', NULL, 'alias_id', NULL,
      'plano_conta_id', NULL, 'subcentro', NULL, 'macro_custo', NULL, 'grupo_custo', NULL,
      'centro_custo', NULL, 'confianca', NULL, 'motor_version', c_motor_version);
  END IF;

  SELECT subcentro, macro_custo, grupo_custo, centro_custo INTO v_plano
  FROM financeiro_plano_contas WHERE id = v_pc;

  RETURN jsonb_build_object('ok', true, 'tier', v_tier, 'regra_id', v_regra_id, 'alias_id', v_alias_id,
    'plano_conta_id', v_pc, 'subcentro', v_plano.subcentro, 'macro_custo', v_plano.macro_custo,
    'grupo_custo', v_plano.grupo_custo, 'centro_custo', v_plano.centro_custo,
    'confianca', 'deterministica', 'motor_version', c_motor_version);
END;
$$;


--
-- Name: fn_classificacao_resolver_grupo(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_resolver_grupo(p_staging_id uuid, p_lancamento_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staging  financeiro_classificacao_staging%ROWTYPE;
  v_user_id  uuid;
  v_n        int;
  v_distintos int;
  v_vivos    int;
  v_cand     int;
  v_conflito_linha int;
  v_soma     numeric;
  v_dif      numeric;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  -- (a) status elegível
  IF v_staging.match_status NOT IN ('candidatos_proximos','sem_match') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'status_nao_elegivel', 'match_status', v_staging.match_status);
  END IF;

  -- (b) array não-vazio, sem duplicatas internas, length >= 2
  IF p_lancamento_ids IS NULL OR array_length(p_lancamento_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lista_vazia');
  END IF;
  v_n := array_length(p_lancamento_ids, 1);
  SELECT COUNT(DISTINCT x) INTO v_distintos FROM unnest(p_lancamento_ids) AS x;
  IF v_distintos <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ids_duplicados');
  END IF;
  IF v_n < 2 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'use_resolver_proximos');
  END IF;

  -- (c) todos existem e vivos (cancelado=false)
  SELECT COUNT(*) INTO v_vivos FROM financeiro_lancamentos_v2
   WHERE id = ANY(p_lancamento_ids) AND cancelado = false;
  IF v_vivos <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  -- (d) todos pertencem ao conjunto de candidatos_grupo(p_staging_id)
  SELECT COUNT(*) INTO v_cand
    FROM public.fn_classificacao_candidatos_grupo(p_staging_id) c
   WHERE c.lanc_id = ANY(p_lancamento_ids);
  IF v_cand <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'candidato_invalido');
  END IF;

  -- (e) GUARD ANTI-DUPLO bidirecional: nenhum id pode estar em match_lancamento_id
  -- (singular) NEM em match_lancamento_ids (array) de OUTRA linha da MESMA sessão.
  SELECT excel_linha_origem INTO v_conflito_linha
    FROM financeiro_classificacao_staging
   WHERE sessao_id = v_staging.sessao_id
     AND staging_id <> p_staging_id
     AND (match_lancamento_id = ANY(p_lancamento_ids)
          OR COALESCE(match_lancamento_ids, ARRAY[]::uuid[]) && p_lancamento_ids)
   ORDER BY excel_linha_origem
   LIMIT 1;
  IF v_conflito_linha IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_escolhido',
      'linha_conflitante', v_conflito_linha,
      'mensagem', format('Um dos lançamentos já foi escolhido pela linha %s desta sessão.', v_conflito_linha));
  END IF;

  -- (f) SUM(ABS(valor)) = excel_valor ± 0.005
  SELECT SUM(ABS(valor)) INTO v_soma FROM financeiro_lancamentos_v2 WHERE id = ANY(p_lancamento_ids);
  v_dif := v_soma - v_staging.excel_valor;
  IF ABS(v_dif) > 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'soma_divergente', 'soma', v_soma, 'diferenca', v_dif);
  END IF;

  -- (g) grava: origem em estado_anterior (jsonb), array, status resolvido_grupo, auditoria.
  UPDATE financeiro_classificacao_staging
  SET estado_anterior      = to_jsonb(v_staging.match_status),
      match_lancamento_ids = p_lancamento_ids,
      match_lancamento_id  = NULL,
      match_status         = 'resolvido_grupo',
      match_resolvido_em   = now(),
      match_resolvido_por  = v_user_id,
      updated_at           = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resolvido_grupo',
    'match_lancamento_ids', to_jsonb(p_lancamento_ids), 'soma', v_soma, 'match_status', 'resolvido_grupo');
END;
$$;


--
-- Name: fn_classificacao_resolver_proximos(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_resolver_proximos(p_staging_id uuid, p_lancamento_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE;
  v_user_id uuid;
  v_is_cand boolean;
  v_lanc    financeiro_lancamentos_v2%ROWTYPE;
  v_conflito_linha int;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  -- Só 'candidatos_proximos' é resolvível por aqui (bloqueia sem_match/exato/etc).
  IF v_staging.match_status <> 'candidatos_proximos' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_candidatos_proximos', 'match_status', v_staging.match_status);
  END IF;

  IF p_lancamento_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_id_obrigatorio'); END IF;

  -- Candidato precisa estar entre os oferecidos pela janela (não aceita id arbitrário).
  SELECT EXISTS(SELECT 1 FROM public.fn_classificacao_candidatos_proximos(p_staging_id) c WHERE c.lanc_id = p_lancamento_id)
    INTO v_is_cand;
  IF NOT v_is_cand THEN RETURN jsonb_build_object('ok', false, 'motivo', 'candidato_invalido'); END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  -- GUARD ANTI-DUPLO-MATCH (PR-MESA-GRUPO-01 delta 7: agora BIDIRECIONAL) — outra
  -- linha da MESMA sessão já usou este lançamento em match singular OU em grupo?
  SELECT excel_linha_origem INTO v_conflito_linha
    FROM financeiro_classificacao_staging
   WHERE sessao_id = v_staging.sessao_id
     AND staging_id <> p_staging_id
     AND (match_lancamento_id = p_lancamento_id
          OR p_lancamento_id = ANY(COALESCE(match_lancamento_ids, ARRAY[]::uuid[])))
   ORDER BY excel_linha_origem
   LIMIT 1;
  IF v_conflito_linha IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_escolhido',
      'linha_conflitante', v_conflito_linha,
      'mensagem', format('Lançamento já escolhido pela linha %s desta sessão.', v_conflito_linha));
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = p_lancamento_id,
      match_status        = 'resolvido_manual',
      match_resolvido_em  = now(),
      match_resolvido_por = v_user_id,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resolvido',
    'match_lancamento_id', p_lancamento_id, 'match_status', 'resolvido_manual');
END;
$$;


--
-- Name: fn_classificacao_resolver_subcentro(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_resolver_subcentro(p_cliente_id uuid, p_subcentro text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_n int; v jsonb;
BEGIN
  IF p_subcentro IS NULL OR trim(p_subcentro) = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'subcentro_vazio');
  END IF;
  SELECT count(*) INTO v_n
  FROM financeiro_plano_contas
  WHERE (cliente_id = p_cliente_id OR cliente_id IS NULL) AND ativo = true
    AND lower(trim(subcentro)) = lower(trim(p_subcentro));
  IF v_n <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo',
      CASE WHEN v_n = 0 THEN 'subcentro_inexistente_no_plano' ELSE 'subcentro_ambiguo_no_plano' END);
  END IF;
  SELECT jsonb_build_object('ok', true, 'subcentro', subcentro, 'macro_custo', macro_custo,
                            'grupo_custo', grupo_custo, 'centro_custo', centro_custo, 'plano_conta_id', id)
    INTO v
  FROM financeiro_plano_contas
  WHERE (cliente_id = p_cliente_id OR cliente_id IS NULL) AND ativo = true
    AND lower(trim(subcentro)) = lower(trim(p_subcentro))
  LIMIT 1;
  RETURN v;
END;
$$;


--
-- Name: fn_classificacao_reverter_row(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_reverter_row(p_staging_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_estado jsonb; v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id) OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao'); END IF;
  IF v_staging.aplicado = false OR v_staging.estado_anterior IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nada_a_reverter'); END IF;
  IF v_staging.match_lancamento_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_lancamento_vinculado'); END IF;

  v_estado := v_staging.estado_anterior;
  UPDATE financeiro_lancamentos_v2 SET subcentro = v_estado->>'subcentro', macro_custo = v_estado->>'macro_custo', grupo_custo = v_estado->>'grupo_custo',
    centro_custo = v_estado->>'centro_custo', plano_conta_id = NULLIF(v_estado->>'plano_conta_id','')::uuid, favorecido_id = NULLIF(v_estado->>'favorecido_id','')::uuid,
    fazenda_id = CASE WHEN v_estado ? 'fazenda_id' THEN NULLIF(v_estado->>'fazenda_id','')::uuid ELSE fazenda_id END,
    descricao = CASE WHEN v_estado ? 'descricao' THEN v_estado->>'descricao' ELSE descricao END,
    numero_documento = CASE WHEN v_estado ? 'numero_documento' THEN v_estado->>'numero_documento' ELSE numero_documento END,
    updated_at = now() WHERE id = v_staging.match_lancamento_id;

  UPDATE financeiro_classificacao_staging SET aplicado = false, aplicado_em = NULL, aplicado_por = NULL, estado_anterior = NULL, erro_apply = NULL WHERE staging_id = p_staging_id;
  RETURN jsonb_build_object('ok', true, 'motivo', 'revertido', 'lancamento_id', v_staging.match_lancamento_id, 'estado_restaurado', v_estado);
END;
$$;


--
-- Name: fn_classificacao_sistema_nao_explicado(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_sistema_nao_explicado(p_sessao_id uuid, p_conta_id uuid DEFAULT NULL::uuid) RETURNS TABLE(lanc_id uuid, data_pagamento date, valor numeric, tipo_operacao text, descricao text, favorecido_nome text, conta_nome text, documento text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_cliente uuid; v_user uuid;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN; END IF;
  BEGIN v_user := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user))) THEN RETURN; END IF;

  -- Coerência: conta informada precisa pertencer às contas da sessão; senão, escopo vazio
  -- (não inventar escopo). p_conta_id NULL = comportamento atual (todas as contas da sessão).
  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id AND (conta_origem_id = p_conta_id OR conta_destino_id = p_conta_id)
  ) THEN RETURN; END IF;

  RETURN QUERY
  WITH sess_meses AS (
    SELECT DISTINCT COALESCE(excel_ano_mes, to_char(excel_data, 'YYYY-MM')) AS ano_mes
    FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id
  ),
  sess_contas AS (
    SELECT conta_origem_id AS conta_id FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND conta_origem_id IS NOT NULL
    UNION
    SELECT conta_destino_id FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND conta_destino_id IS NOT NULL
  ),
  referenciados AS (
    SELECT match_lancamento_id AS id FROM financeiro_classificacao_staging
      WHERE sessao_id = p_sessao_id AND match_lancamento_id IS NOT NULL
    UNION
    SELECT unnest(match_lancamento_ids) FROM financeiro_classificacao_staging
      WHERE sessao_id = p_sessao_id AND match_lancamento_ids IS NOT NULL
  )
  SELECT l.id, l.data_pagamento, l.valor, l.tipo_operacao, l.descricao,
         fo.nome, COALESCE(cb.nome_exibicao, cd.nome_exibicao), l.numero_documento
  FROM financeiro_lancamentos_v2 l
  LEFT JOIN financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_cliente
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes IN (SELECT ano_mes FROM sess_meses)
    -- p_conta_id informado → filtra pela conta EXATA (mesma da toolbar); NULL → todas da sessão.
    AND (
      CASE WHEN p_conta_id IS NOT NULL
        THEN (l.conta_bancaria_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        ELSE (l.conta_bancaria_id IN (SELECT conta_id FROM sess_contas)
              OR l.conta_destino_id IN (SELECT conta_id FROM sess_contas))
      END
    )
    AND NOT EXISTS (SELECT 1 FROM referenciados r WHERE r.id = l.id)
  ORDER BY l.data_pagamento, l.id;
END;
$$;


--
-- Name: fn_classificacao_split_substituir(uuid, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_classificacao_split_substituir(p_lancamento_id uuid, p_sessao_id uuid, p_staging_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_cliente uuid; v_uid uuid;
  v_lan financeiro_lancamentos_v2%ROWTYPE;
  v_ext extrato_bancario_v2%ROWTYPE;
  v_extratos uuid[]; v_extrato_id uuid;
  v_conta_lanc uuid[];
  v_n int; v_dist int; v_ok int;
  v_soma_excel numeric; v_dif numeric;
  v_s financeiro_classificacao_staging%ROWTYPE;
  v_novo_id uuid; v_criados uuid[] := ARRAY[]::uuid[];
  v_soma numeric; v_status text;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_vazia_ou_inexistente'); END IF;

  -- (a) permissão (guard de cliente padrão).
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  -- (b) lançamento existe, vivo, realizado.
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id AND cliente_id = v_cliente;
  IF NOT FOUND OR COALESCE(v_lan.cancelado, false) = true OR v_lan.status_transacao <> 'realizado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  -- (c) lançamento é NÃO-EXPLICADO na sessão (nenhuma linha o referencia).
  IF EXISTS (
    SELECT 1 FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id
      AND (match_lancamento_id = p_lancamento_id
           OR p_lancamento_id = ANY(COALESCE(match_lancamento_ids, ARRAY[]::uuid[])))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_referenciado');
  END IF;

  -- (d) staging_ids: >=2, sem duplicatas, todos da sessão, SEM match, elegíveis, não aplicados.
  IF p_staging_ids IS NULL OR array_length(p_staging_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lista_vazia');
  END IF;
  v_n := array_length(p_staging_ids, 1);
  SELECT COUNT(DISTINCT x) INTO v_dist FROM unnest(p_staging_ids) AS x;
  IF v_dist <> v_n THEN RETURN jsonb_build_object('ok', false, 'motivo', 'ids_duplicados'); END IF;
  IF v_n < 2 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'poucos_itens'); END IF;
  SELECT COUNT(*) INTO v_ok FROM financeiro_classificacao_staging
   WHERE staging_id = ANY(p_staging_ids) AND sessao_id = p_sessao_id
     AND match_status IN ('sem_match','sem_conta_para_match','candidatos_proximos')
     AND match_lancamento_id IS NULL AND match_lancamento_ids IS NULL
     AND aplicado = false;
  IF v_ok <> v_n THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_invalido'); END IF;

  -- (e) SOMA excel_valor = ABS(valor do lançamento) ± 0,005.
  SELECT SUM(excel_valor) INTO v_soma_excel FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids);
  v_dif := v_soma_excel - ABS(v_lan.valor);
  IF ABS(v_dif) > 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'soma_divergente', 'soma', v_soma_excel, 'diferenca', v_dif);
  END IF;

  -- (f) conta compatível (MESMA expressão da composicao_sugerida).
  v_conta_lanc := array_remove(ARRAY[v_lan.conta_bancaria_id, v_lan.conta_destino_id], NULL);
  SELECT COUNT(*) INTO v_ok FROM financeiro_classificacao_staging s
   WHERE s.staging_id = ANY(p_staging_ids)
     AND ((s.conta_origem_id = ANY(v_conta_lanc) OR s.conta_destino_id = ANY(v_conta_lanc))
          OR (s.conta_origem_id IS NULL AND s.conta_destino_id IS NULL));
  IF v_ok <> v_n THEN RETURN jsonb_build_object('ok', false, 'motivo', 'conta_incompativel'); END IF;

  -- (g) vínculos cbi ATIVOS do lançamento: exatamente 1 extrato; valor casando.
  SELECT array_agg(DISTINCT extrato_id) INTO v_extratos
    FROM conciliacao_bancaria_itens WHERE lancamento_id = p_lancamento_id AND desfeito_em IS NULL;
  IF v_extratos IS NULL OR array_length(v_extratos, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_vinculo_ofx');
  END IF;
  IF array_length(v_extratos, 1) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'multi_extrato_nao_suportado');
  END IF;
  v_extrato_id := v_extratos[1];
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = v_extrato_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_vinculo_ofx'); END IF;
  IF ABS(ABS(v_ext.valor) - ABS(v_lan.valor)) > 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_divergente', 'valor_extrato', v_ext.valor, 'valor_lancamento', v_lan.valor);
  END IF;

  -- (h) subcentro CANÔNICO — validação prévia (ANTES de qualquer INSERT).
  -- Espelha EXATAMENTE a condição de RAISE do trigger resolve_classificacao_from_plano
  -- (fonte da 23514): bloqueia quando o subcentro efetivo (update_proposto->>'subcentro')
  -- NÃO é NULL, NÃO existe em financeiro_plano_contas (ativo=true, mesma consulta da
  -- "Tentativa 2" do trigger — sem filtro de cliente/tipo), e macro_custo IS DISTINCT
  -- FROM 'Dividendos' (mesma exceção do trigger). ZERO normalização: não parseia caminho,
  -- não adivinha canônico, não insere NULL silenciosamente — o operador classifica na Mesa.
  FOR v_s IN SELECT * FROM financeiro_classificacao_staging
             WHERE staging_id = ANY(p_staging_ids) ORDER BY excel_linha_origem
  LOOP
    IF (v_s.update_proposto->>'subcentro') IS NOT NULL
       AND (v_s.update_proposto->>'macro_custo') IS DISTINCT FROM 'Dividendos'
       AND NOT EXISTS (
         SELECT 1 FROM public.financeiro_plano_contas
         WHERE ativo = true AND subcentro = v_s.update_proposto->>'subcentro'
       ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'subcentro_nao_canonico',
        'linha', v_s.excel_linha_origem,
        'subcentro', v_s.update_proposto->>'subcentro',
        'mensagem', format('Classifique a linha %s com um subcentro canônico na Mesa antes de substituir.', v_s.excel_linha_origem));
    END IF;
  END LOOP;

  -- ── EXECUÇÃO (atômica) ──────────────────────────────────────────────────
  -- 1) Criar os N lançamentos (classificação do update_proposto — mesmo mapeamento
  --    do apply_row overwrite) + 2) marcar cada linha staging (espelho do apply_row:
  --    aplicado=true + auditoria + match_lancamento_id; estado_anterior=NULL pois o
  --    lançamento é NOVO — não há estado a reverter, e reverter_row recusa NULL).
  FOR v_s IN SELECT * FROM financeiro_classificacao_staging
             WHERE staging_id = ANY(p_staging_ids) ORDER BY excel_linha_origem
  LOOP
    INSERT INTO financeiro_lancamentos_v2 (
      cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id,
      ano_mes, data_competencia, data_pagamento, valor, sinal, tipo_operacao,
      status_transacao, descricao, observacao,
      subcentro, macro_custo, grupo_custo, centro_custo, plano_conta_id, favorecido_id,
      origem_lancamento, created_by, sem_movimentacao_caixa
    ) VALUES (
      v_cliente,
      COALESCE(NULLIF(v_s.update_proposto->>'fazenda_id','')::uuid, v_lan.fazenda_id),
      v_lan.conta_bancaria_id, v_lan.conta_destino_id,
      COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM')),
      v_s.excel_data, v_s.excel_data, v_s.excel_valor, v_lan.sinal, v_lan.tipo_operacao,
      'realizado',
      COALESCE(NULLIF(v_s.excel_produto, ''), NULLIF(v_s.excel_observacao, ''), 'Detalhe ' || v_s.excel_linha_origem),
      NULLIF(trim(COALESCE(v_s.excel_observacao, '') || ' ' ||
        format('[split: stg=%s consol=%s ofx=%s sessao=%s]',
          left(v_s.staging_id::text, 8), left(p_lancamento_id::text, 8),
          left(v_extrato_id::text, 8), left(p_sessao_id::text, 8))), ''),
      v_s.update_proposto->>'subcentro', v_s.update_proposto->>'macro_custo',
      v_s.update_proposto->>'grupo_custo', v_s.update_proposto->>'centro_custo',
      NULLIF(v_s.update_proposto->>'plano_conta_id', '')::uuid,
      NULLIF(v_s.update_proposto->>'favorecido_id', '')::uuid,
      'mesa_split', v_uid, false
    ) RETURNING id INTO v_novo_id;

    v_criados := array_append(v_criados, v_novo_id);

    UPDATE financeiro_classificacao_staging
       SET aplicado = true, aplicado_em = now(), aplicado_por = v_uid,
           match_lancamento_id = v_novo_id, estado_anterior = NULL, updated_at = now()
     WHERE staging_id = v_s.staging_id;
  END LOOP;

  -- 3) Cancelar o consolidado (o trigger trg_cbi_desfazer_on_cancelamento desfaz o cbi dele).
  UPDATE financeiro_lancamentos_v2
     SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
         updated_at = now(), updated_by = v_uid
   WHERE id = p_lancamento_id;

  -- 4) Religar: INSERT cbi por lançamento novo (ESPELHO do INSERT da fn_vincular).
  FOR v_s IN SELECT * FROM financeiro_classificacao_staging
             WHERE staging_id = ANY(p_staging_ids) ORDER BY excel_linha_origem
  LOOP
    INSERT INTO conciliacao_bancaria_itens (
      cliente_id, extrato_id, lancamento_id, valor_aplicado,
      criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
      snapshot_extrato_valor, snapshot_lancamento_valor,
      snapshot_extrato_data, snapshot_lancamento_data
    ) VALUES (
      v_cliente, v_extrato_id, v_s.match_lancamento_id, v_s.excel_valor,
      v_uid, 'manual', v_uid, now(),
      v_ext.valor, v_s.excel_valor,
      v_ext.data_movimento, v_s.excel_data
    );
  END LOOP;

  -- Recompute do status do extrato UMA vez ao final (regra literal do conciliacaoSync;
  -- resultado idêntico a recomputar a cada vínculo — o extrato fecha com N vínculos).
  SELECT COALESCE(sum(valor_aplicado), 0) INTO v_soma
    FROM conciliacao_bancaria_itens WHERE extrato_id = v_extrato_id AND desfeito_em IS NULL;
  IF v_soma <= 0 THEN v_status := 'nao_conciliado';
  ELSIF v_soma + 0.005 >= abs(v_ext.valor) THEN v_status := 'conciliado';
  ELSE v_status := 'parcial';
  END IF;
  UPDATE extrato_bancario_v2 SET status = v_status WHERE id = v_extrato_id;

  RETURN jsonb_build_object(
    'ok', true, 'motivo', 'substituido',
    'lancamentos_criados', to_jsonb(v_criados),
    'consolidado_cancelado', p_lancamento_id,
    'extrato_religado', v_extrato_id,
    'status_extrato_final', v_status
  );
END;
$$;


--
-- Name: fn_completar_categorias_saldo_inicial(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_completar_categorias_saldo_inicial() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    DECLARE
      v_cat RECORD;
      v_exists INT;
    BEGIN
      -- Para cada categoria do sistema, verificar se existe registro
      -- para a mesma fazenda/ano/mes/cliente que acabou de ser inserido
      FOR v_cat IN
        SELECT id AS categoria_id, codigo AS categoria
        FROM categorias_rebanho
        ORDER BY codigo
      LOOP
        SELECT COUNT(*) INTO v_exists
        FROM saldos_iniciais
        WHERE cliente_id  = NEW.cliente_id
          AND fazenda_id  = NEW.fazenda_id
          AND ano         = NEW.ano
          AND mes         = NEW.mes
          AND categoria   = v_cat.categoria;

        IF v_exists = 0 THEN
          INSERT INTO saldos_iniciais (
            id, cliente_id, fazenda_id,
            categoria, categoria_id,
            ano, mes,
            quantidade, peso_total, peso_medio_kg, preco_kg
          ) VALUES (
            gen_random_uuid(),
            NEW.cliente_id, NEW.fazenda_id,
            v_cat.categoria, v_cat.categoria_id,
            NEW.ano, NEW.mes,
            0, 0, 0, NULL
          );
        END IF;
      END LOOP;

      RETURN NEW;
    END;
    $$;


--
-- Name: fn_conciliacao_soberana(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_conciliacao_soberana(p_cliente uuid, p_conta uuid, p_mes text) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
WITH pp AS (
  SELECT p_cliente AS cli, p_conta AS conta, p_mes AS mes,
    TO_DATE(p_mes||'-01','YYYY-MM-DD') AS d1,
    (TO_DATE(p_mes||'-01','YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::date AS d2
),

ofx_base AS (
  SELECT e.id, e.data_movimento AS dt, e.valor AS v, e.tipo_movimento AS tp,
         e.descricao, e.status, e.saldo_apos
  FROM extrato_bancario_v2 e JOIN pp ON true
  WHERE e.cliente_id = pp.cli AND e.conta_bancaria_id = pp.conta
    AND e.data_movimento BETWEEN pp.d1 AND pp.d2
    AND e.cancelado_em IS NULL
),
ofx      AS (SELECT * FROM ofx_base WHERE status IS DISTINCT FROM 'ignorado'),
desc_ofx AS (SELECT * FROM ofx_base WHERE status = 'ignorado'),

lv2 AS (
  SELECT l.id, l.data_pagamento AS dt,
         (CASE
            WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id  = pp.conta THEN  l.valor
            WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = pp.conta THEN -l.valor
            WHEN l.sinal = '1' THEN l.valor ELSE -l.valor
          END) AS v,
         l.valor AS mag, l.sinal,
         COALESCE(l.descricao, l.historico) AS descricao,
         l.origem_lancamento AS origem_lancamento,
         l.status_transacao AS status_transacao
  FROM financeiro_lancamentos_v2 l JOIN pp ON true
  WHERE l.cliente_id = pp.cli AND l.ano_mes = pp.mes
    AND l.cancelado = false AND l.sem_movimentacao_caixa = false
    AND COALESCE(l.cenario,'realizado') = 'realizado'
    AND l.status_transacao = 'realizado'
    AND ((l.sinal='1'  AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta))
      OR (l.sinal='-1' AND l.conta_bancaria_id = pp.conta)
      OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta))
),

-- VINCULO GOVERNA: todo link cbi de um OFX nosso, com motivo.
-- Ordem do CASE: cancelado > sinal > conta > valor > data (data e o ultimo/mais fraco).
links_raw AS (
  SELECT cbi.id AS link_id, cbi.extrato_id, cbi.lancamento_id,
         e.dt AS ofx_dt, e.v AS ofx_v, e.tp AS ofx_tp, e.descricao AS ofx_desc, e.status AS ofx_status,
         l.data_pagamento AS lanc_dt, l.valor AS lanc_valor, l.sinal AS lanc_sinal,
         COALESCE(l.descricao, l.historico) AS lanc_desc, l.origem_lancamento AS lanc_origem,
         l.status_transacao AS lanc_status,
         CASE
           WHEN l.id IS NULL THEN 'sem_lancamento'
           WHEN l.cancelado THEN 'cancelado'
           WHEN COALESCE(l.status_transacao, '') <> 'realizado' THEN 'status_nao_realizado'
           -- Transferencia (linha unica, sinal do ponto de vista da ORIGEM):
           --   conta auditada = DESTINO  -> OFX credito e o par correto;
           --   conta auditada = ORIGEM   -> OFX debito  e o par correto.
           -- So e' sinal_cruzado quando o papel da conta NAO explica o sinal.
           WHEN l.tipo_operacao = '3-Transferências'
                AND ((e.tp='credito' AND l.conta_destino_id = pp.conta)
                  OR (e.tp='debito'  AND l.conta_bancaria_id = pp.conta)) THEN 'valido'
           WHEN (e.tp='credito' AND l.sinal <> '1')
             OR (e.tp='debito'  AND l.sinal <> '-1') THEN 'sinal_cruzado'
           WHEN e.tp='credito'
                AND COALESCE(l.conta_destino_id = pp.conta, false) = false
                AND COALESCE(l.conta_bancaria_id = pp.conta, false) = false THEN 'conta_divergente'
           WHEN e.tp='debito'
                AND l.conta_bancaria_id IS DISTINCT FROM pp.conta THEN 'conta_divergente'
           WHEN ABS(e.v) <> l.valor THEN 'valor_divergente'
           WHEN l.data_pagamento IS NULL THEN 'data_ausente'
           WHEN ABS(e.dt - l.data_pagamento) > 3 THEN 'data_divergente'
           ELSE 'valido'
         END AS motivo
  FROM conciliacao_bancaria_itens cbi
  JOIN ofx_base e ON e.id = cbi.extrato_id
  JOIN pp ON true
  LEFT JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id
  WHERE cbi.desfeito_em IS NULL
),

-- DESCONSIDERADOS: OFX ignorado + LV2 vinculado a ele (par puxado junto).
desc_lanc AS (
  SELECT DISTINCT lancamento_id AS id FROM links_raw
  WHERE ofx_status = 'ignorado' AND lancamento_id IS NOT NULL
),

-- VALIDOS (somente reconciliavel).
ofx_valid AS (
  SELECT DISTINCT extrato_id FROM links_raw WHERE motivo='valido' AND ofx_status IS DISTINCT FROM 'ignorado'
),

-- DIVERGENCIAS DE VINCULO: link existente porem invalido, do OFX reconciliavel
-- que nao tem nenhum link valido. (OFX com link valido -> Corretos; particiona o lado OFX.)
div AS (
  SELECT * FROM links_raw lr
  WHERE lr.motivo <> 'valido' AND lr.ofx_status IS DISTINCT FROM 'ignorado'
    AND lr.extrato_id NOT IN (SELECT extrato_id FROM ofx_valid)
),

-- EXTRATO SEM SISTEMA: OFX reconciliavel sem NENHUM link.
ext_sem AS (
  SELECT * FROM ofx o WHERE o.id NOT IN (SELECT extrato_id FROM links_raw)
),

-- SISTEMA SEM EXTRATO: LV2 sem NENHUM link e fora dos desconsiderados.
sis_sem AS (
  SELECT * FROM lv2 l
  WHERE l.id NOT IN (SELECT lancamento_id FROM links_raw WHERE lancamento_id IS NOT NULL)
    AND l.id NOT IN (SELECT id FROM desc_lanc)
),

-- AGRUPAMENTO (overlay/sugestao): 1 OFX-sem-sistema = 2 LV2-sem-extrato, mesma soma assinada.
agr AS (
  SELECT o.id ofx_id, o.v ofx_v, a.id l1, a.v v1, b.id l2, b.v v2
  FROM ext_sem o
  JOIN sis_sem a ON true
  JOIN sis_sem b ON b.id > a.id AND b.v = o.v - a.v
),

-- CORRETOS: somente vinculo valido.
corretos AS (
  SELECT DISTINCT extrato_id, ofx_v FROM links_raw WHERE motivo='valido' AND ofx_status IS DISTINCT FROM 'ignorado'
),

-- grupos_conciliados (v01.10): vinculos REAIS do cbi, expostos como 1xN e Nx1.
-- Overlay puro: nao muta ext_sem/sis_sem/div/corretos. Ignora OFX ignorado.
grupo_links AS (
  SELECT DISTINCT lr.extrato_id, lr.lancamento_id,
         lr.ofx_dt, lr.ofx_v, lr.ofx_desc,
         lr.lanc_dt, lr.lanc_desc,
         (CASE WHEN lr.lanc_sinal = '1' THEN lr.lanc_valor ELSE -lr.lanc_valor END) AS lanc_v
  FROM links_raw lr
  WHERE lr.lancamento_id IS NOT NULL
    AND lr.ofx_status IS DISTINCT FROM 'ignorado'
),
g1xn_keys AS (
  SELECT extrato_id FROM grupo_links GROUP BY extrato_id HAVING count(DISTINCT lancamento_id) > 1
),
gnx1_keys AS (
  SELECT lancamento_id FROM grupo_links GROUP BY lancamento_id HAVING count(DISTINCT extrato_id) > 1
),
g1xn AS (
  SELECT
    gl.extrato_id AS grp_key,
    '1xN'::text AS tipo,
    jsonb_build_object('id', gl.extrato_id, 'data', max(gl.ofx_dt), 'valor', max(gl.ofx_v), 'descricao', max(gl.ofx_desc)) AS ancora,
    jsonb_agg(jsonb_build_object('id', gl.lancamento_id, 'data', gl.lanc_dt, 'valor_assinado', gl.lanc_v, 'descricao', gl.lanc_desc)
              ORDER BY (gl.lanc_v < 0) ASC, abs(gl.lanc_v) DESC) AS membros,
    max(gl.ofx_v) AS total_ofx,
    SUM(gl.lanc_v) AS total_sistema,
    max(gl.ofx_dt) AS ord_data,
    max(gl.ofx_v) AS ord_valor
  FROM grupo_links gl
  WHERE gl.extrato_id IN (SELECT extrato_id FROM g1xn_keys)
  GROUP BY gl.extrato_id
),
gnx1 AS (
  SELECT
    gl.lancamento_id AS grp_key,
    'Nx1'::text AS tipo,
    jsonb_build_object('id', gl.lancamento_id, 'data', max(gl.lanc_dt), 'valor', max(gl.lanc_v), 'descricao', max(gl.lanc_desc)) AS ancora,
    jsonb_agg(jsonb_build_object('id', gl.extrato_id, 'data', gl.ofx_dt, 'valor_assinado', gl.ofx_v, 'descricao', gl.ofx_desc)
              ORDER BY (gl.ofx_v < 0) ASC, abs(gl.ofx_v) DESC) AS membros,
    SUM(gl.ofx_v) AS total_ofx,
    max(gl.lanc_v) AS total_sistema,
    max(gl.lanc_dt) AS ord_data,
    max(gl.lanc_v) AS ord_valor
  FROM grupo_links gl
  WHERE gl.lancamento_id IN (SELECT lancamento_id FROM gnx1_keys)
  GROUP BY gl.lancamento_id
),
grupos_all AS (
  SELECT tipo, ancora, membros, total_ofx, total_sistema, ord_data, ord_valor FROM g1xn
  UNION ALL
  SELECT tipo, ancora, membros, total_ofx, total_sistema, ord_data, ord_valor FROM gnx1
),

cnt AS (
  SELECT
    (SELECT count(*) FROM ext_sem)  AS ext_sem_n,
    (SELECT count(*) FROM sis_sem)  AS sis_sem_n,
    (SELECT count(*) FROM div)      AS div_n,
    (SELECT count(*) FROM agr)      AS agr_n,
    (SELECT count(*) FROM corretos) AS corretos_n,
    (SELECT count(*) FROM desc_ofx) AS desc_n
)

SELECT jsonb_build_object(
  'gerado_em', now(),
  'versao', 'soberana-01.10-grupos-conciliados',
  'escopo', jsonb_build_object('cliente', p_cliente, 'conta', p_conta, 'mes', p_mes),

  'resumo', jsonb_build_object(
    'ofx', jsonb_build_object(
      'movimentos', (SELECT count(*) FROM ofx),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM ofx WHERE tp='credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM ofx WHERE tp='debito'),
      'saldo_inicial', (SELECT saldo_apos FROM ofx_base ORDER BY dt ASC,  id ASC  LIMIT 1),
      'saldo_final',   (SELECT saldo_apos FROM ofx_base ORDER BY dt DESC, id DESC LIMIT 1)
    ),
    'extrato_cru', jsonb_build_object(
      'movimentos', (SELECT count(*) FROM ofx_base),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM ofx_base WHERE tp = 'credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM ofx_base WHERE tp = 'debito'),
      'liquido',    (SELECT COALESCE(SUM(v),0)  FROM ofx_base),
      'ignorados',  (SELECT count(*) FROM ofx_base WHERE status = 'ignorado'),
      -- PR-OFX-VALIDO-1: valor líquido signed dos desconsiderados (diagnóstico).
      'ignorados_valor', (SELECT COALESCE(SUM(v),0) FROM desc_ofx)
    ),
    -- PR-OFX-VALIDO-1: OFX VÁLIDO (exclui ignorados) — é o que o fechamento segue.
    'extrato_valido', jsonb_build_object(
      'movimentos', (SELECT count(*) FROM ofx),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM ofx WHERE tp='credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM ofx WHERE tp='debito'),
      'liquido',    (SELECT COALESCE(SUM(v),0)  FROM ofx)
    ),
    'lv2', jsonb_build_object(
      'lancamentos', (SELECT count(*) FROM lv2),
      'entradas',    (SELECT COALESCE(SUM(l.valor),0)
                      FROM financeiro_lancamentos_v2 l JOIN pp ON true
                      WHERE l.cliente_id = pp.cli AND l.ano_mes = pp.mes
                        AND l.cancelado = false AND l.sem_movimentacao_caixa = false
                        AND COALESCE(l.cenario,'realizado') = 'realizado'
                        AND l.status_transacao = 'realizado'
                        AND ((l.tipo_operacao LIKE '1-%' AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta))
                          OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta))),
      'saidas',      (SELECT COALESCE(SUM(mag),0) FROM lv2 WHERE v < 0)
    ),
    'corretos', jsonb_build_object(
      'qtd',   (SELECT corretos_n FROM cnt),
      'valor', (SELECT COALESCE(SUM(ofx_v),0) FROM corretos)
    ),
    'desconsiderados', jsonb_build_object(
      'movimentos', (SELECT desc_n FROM cnt),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM desc_ofx WHERE tp='credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM desc_ofx WHERE tp='debito')
    )
  ),

  'veredito', jsonb_build_object(
    'conciliado', ((SELECT ext_sem_n FROM cnt)=0 AND (SELECT sis_sem_n FROM cnt)=0 AND (SELECT div_n FROM cnt)=0),
    'bloqueios', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo',tipo,'count',n) ORDER BY ord),'[]'::jsonb)
      FROM (
        SELECT 'divergencias_vinculo' tipo, div_n     n, 1 ord FROM cnt WHERE div_n     > 0
        UNION ALL SELECT 'sistema_sem_extrato', sis_sem_n,  2 FROM cnt WHERE sis_sem_n > 0
        UNION ALL SELECT 'extrato_sem_sistema', ext_sem_n,  3 FROM cnt WHERE ext_sem_n > 0
      ) z
    )
  ),

  'conciliado_soberano', ((SELECT ext_sem_n FROM cnt)=0 AND (SELECT sis_sem_n FROM cnt)=0 AND (SELECT div_n FROM cnt)=0),

  'buckets', jsonb_build_object(
    -- Divergencias de Vinculo (renderavel: motivo + dados OFX e LV2 + dias)
    'divergencias_vinculo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'link_id', link_id, 'motivo', motivo,
        'extrato_id', extrato_id, 'data_ofx', ofx_dt, 'valor', ofx_v, 'descricao', ofx_desc,
        'lancamento_id', lancamento_id, 'data_lancamento', lanc_dt, 'valor_lancamento', lanc_valor,
        'origem_lancamento', lanc_origem, 'status_transacao', lanc_status,
        'dias', CASE WHEN lanc_dt IS NOT NULL THEN ABS(ofx_dt - lanc_dt) END
      ) ORDER BY ofx_dt ASC, (ofx_v < 0) ASC, abs(ofx_v) DESC, motivo) FROM div), '[]'::jsonb),

    -- Sistema sem Extrato (LV2 sem vinculo) -- com origem_lancamento
    'sistema_sem_extrato', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lancamento_id', id, 'data', dt, 'valor_assinado', v, 'sinal', sinal,
        'descricao', descricao, 'origem_lancamento', origem_lancamento,
        'status_transacao', status_transacao
      ) ORDER BY dt ASC, (v < 0) ASC, abs(v) DESC) FROM sis_sem), '[]'::jsonb),

    -- Extrato sem Sistema (OFX sem vinculo)
    'extrato_sem_sistema', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', id, 'data', dt, 'valor', v, 'tipo', tp, 'descricao', descricao
      ) ORDER BY dt ASC, (v < 0) ASC, abs(v) DESC) FROM ext_sem), '[]'::jsonb),

    -- Movimentos Desconsiderados (OFX ignorado + lancamento vinculado, se houver)
    'desconsiderados', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', d.id, 'data', d.dt, 'valor', d.v, 'tipo', d.tp, 'descricao', d.descricao,
        'lancamento_id', (SELECT lr.lancamento_id FROM links_raw lr WHERE lr.extrato_id = d.id LIMIT 1)
      ) ORDER BY d.dt, d.v) FROM desc_ofx d), '[]'::jsonb),

    -- Agrupamentos (overlay/sugestao -- NAO altera classificacao)
    'agrupamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', ofx_id, 'valor', ofx_v,
        'lancamentos', jsonb_build_array(
          jsonb_build_object('lancamento_id', l1, 'valor_assinado', v1),
          jsonb_build_object('lancamento_id', l2, 'valor_assinado', v2)
        )
      )) FROM agr), '[]'::jsonb),

    'grupos_conciliados', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', tipo,
        'ancora', ancora,
        'membros', membros,
        'total_ofx', total_ofx,
        'total_sistema', total_sistema,
        'diferenca', (total_ofx - total_sistema),
        'status_grupo', CASE WHEN abs(total_ofx - total_sistema) <= 0.005 THEN 'batido' ELSE 'divergente' END
      ) ORDER BY ord_data ASC, (ord_valor < 0) ASC, abs(ord_valor) DESC)
      FROM grupos_all), '[]'::jsonb)
  )
) ;
$$;


--
-- Name: fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_criar_lancamento_de_extrato(p_extrato_id uuid, p_fazenda_id uuid, p_subcentro text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_observacao text DEFAULT NULL::text, p_favorecido_id uuid DEFAULT NULL::uuid, p_numero_documento text DEFAULT NULL::text, p_data_competencia date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_ext      extrato_bancario_v2%ROWTYPE;
  v_sinal    text;
  v_tipo     text;
  v_valor    numeric;
  v_ano_mes  text;
  v_lanc_id  uuid;
  v_cbi_id   uuid;
  v_soma     numeric;
  v_status   text;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato nao encontrado: %', p_extrato_id; END IF;

  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.extrato_id = p_extrato_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'extrato ja possui vinculo ativo: %', p_extrato_id;
  END IF;

  IF p_fazenda_id IS NULL THEN
    RAISE EXCEPTION 'fazenda obrigatoria para criar lancamento';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM fazendas f WHERE f.id = p_fazenda_id AND f.cliente_id = v_ext.cliente_id
  ) THEN
    RAISE EXCEPTION 'fazenda % nao pertence ao cliente do extrato (%)', p_fazenda_id, v_ext.cliente_id;
  END IF;

  v_valor   := abs(v_ext.valor);
  v_sinal   := CASE WHEN v_ext.valor < 0 THEN '-1' ELSE '1' END;
  v_tipo    := CASE WHEN v_ext.valor < 0 THEN '2-Saídas' ELSE '1-Entradas' END;
  v_ano_mes := to_char(v_ext.data_movimento, 'YYYY-MM');

  IF EXISTS (
    SELECT 1 FROM financeiro_fechamentos f
    WHERE f.cliente_id = v_ext.cliente_id
      AND f.fazenda_id = p_fazenda_id
      AND f.ano_mes = v_ano_mes
      AND f.status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION 'competencia % em mes fechado: criacao bloqueada', v_ano_mes;
  END IF;

  INSERT INTO financeiro_lancamentos_v2 (
    id, cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id,
    ano_mes, data_pagamento, data_competencia,
    valor, sinal, tipo_operacao,
    subcentro, descricao, observacao, numero_documento, favorecido_id,
    cenario, status_transacao, sem_movimentacao_caixa, origem_lancamento,
    cancelado, created_by, updated_by
  ) VALUES (
    gen_random_uuid(), v_ext.cliente_id, p_fazenda_id,
    CASE WHEN v_tipo = '1-Entradas' THEN NULL ELSE v_ext.conta_bancaria_id END,
    CASE WHEN v_tipo = '1-Entradas' THEN v_ext.conta_bancaria_id ELSE NULL END,
    v_ano_mes, v_ext.data_movimento, COALESCE(p_data_competencia, v_ext.data_movimento),
    v_valor, v_sinal, v_tipo,
    NULLIF(btrim(p_subcentro), ''),
    COALESCE(NULLIF(btrim(p_descricao), ''), v_ext.descricao),
    NULLIF(btrim(p_observacao), ''),
    COALESCE(NULLIF(btrim(p_numero_documento), ''), v_ext.documento),
    p_favorecido_id,
    'realizado', 'realizado', false, 'extrato',
    false, v_uid, v_uid
  ) RETURNING id INTO v_lanc_id;

  INSERT INTO conciliacao_bancaria_itens (
    cliente_id, extrato_id, lancamento_id, valor_aplicado,
    criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
    snapshot_extrato_valor, snapshot_lancamento_valor,
    snapshot_extrato_data, snapshot_lancamento_data
  ) VALUES (
    v_ext.cliente_id, p_extrato_id, v_lanc_id, v_valor,
    v_uid, 'manual', v_uid, now(),
    v_ext.valor, v_valor,
    v_ext.data_movimento, v_ext.data_movimento
  ) RETURNING id INTO v_cbi_id;

  SELECT COALESCE(sum(valor_aplicado), 0) INTO v_soma
  FROM conciliacao_bancaria_itens
  WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;

  IF v_soma <= 0 THEN v_status := 'nao_conciliado';
  ELSIF v_soma + 0.005 >= abs(v_ext.valor) THEN v_status := 'conciliado';
  ELSE v_status := 'parcial';
  END IF;

  UPDATE extrato_bancario_v2 SET status = v_status WHERE id = p_extrato_id;

  RETURN jsonb_build_object(
    'ok', true,
    'lancamento_id', v_lanc_id,
    'cbi_id', v_cbi_id,
    'extrato_id', p_extrato_id,
    'valor', v_valor,
    'tipo_operacao', v_tipo,
    'novo_status_extrato', v_status
  );
END;
$$;


--
-- Name: fn_desfazer_vinculo_extrato(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_desfazer_vinculo_extrato(p_extrato_id uuid, p_motivo text DEFAULT 'desfeito_manual'::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_cbi record; v_n int; v_cli uuid; v_alvo text;
BEGIN
  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'extrato % nao possui vinculo ativo para desfazer', p_extrato_id;
  END IF;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'extrato % possui % vinculos ativos; desfazer bloqueado por seguranca', p_extrato_id, v_n;
  END IF;

  SELECT * INTO v_cbi FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;

  UPDATE conciliacao_bancaria_itens
     SET desfeito_em = now(), desfeito_por = auth.uid(),
         desfeito_motivo = COALESCE(p_motivo, 'desfeito_manual')
   WHERE id = v_cbi.id;

  v_alvo := CASE WHEN EXISTS(
              SELECT 1 FROM conciliacao_bancaria_itens
               WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL)
            THEN 'conciliado' ELSE 'nao_conciliado' END;
  UPDATE extrato_bancario_v2 SET status = v_alvo WHERE id = p_extrato_id;

  SELECT cliente_id INTO v_cli FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  INSERT INTO conciliacao_audit_log
    (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
  VALUES ('conciliacao_desfeita', auth.uid(), v_cli, p_extrato_id,
          v_cbi.lancamento_id, v_cbi.id, COALESCE(p_motivo,'desfeito_manual'),
          jsonb_build_object('status', v_alvo, 'valor_aplicado', v_cbi.valor_aplicado));
  RETURN v_alvo;
END $$;


--
-- Name: fn_diag_fechamento_sessao(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_diag_fechamento_sessao(p_sessao_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE s record; v jsonb;
BEGIN
  SELECT cliente_id, conta_bancaria_id, ano_mes INTO s FROM mesa_sessao WHERE id = p_sessao_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;

  WITH
  ofx AS (
    SELECT * FROM extrato_bancario_v2 e
    WHERE e.cliente_id = s.cliente_id AND e.conta_bancaria_id = s.conta_bancaria_id
      AND to_char(e.data_movimento, 'YYYY-MM') = s.ano_mes
      AND e.cancelado_em IS NULL AND e.status <> 'ignorado'
  ),
  sis AS (
    SELECT * FROM financeiro_lancamentos_v2 f
    WHERE f.cliente_id = s.cliente_id AND f.conta_bancaria_id = s.conta_bancaria_id AND f.ano_mes = s.ano_mes
      AND f.cancelado = false AND f.sem_movimentacao_caixa = false AND f.cenario = 'realizado'
  ),
  stg AS (
    SELECT st.* FROM mesa_lancamento_staging st
    JOIN mesa_sessao ms ON ms.id = st.sessao_id
    WHERE ms.cliente_id = s.cliente_id AND st.conta_resolvida_id = s.conta_bancaria_id AND ms.ano_mes = s.ano_mes
  )
  SELECT jsonb_build_object(
    'ano_mes', s.ano_mes,
    'cobertura', jsonb_build_object(
      'ofx_validos', (SELECT count(*) FROM ofx),
      -- "Com Excel" exige um staging NAO-descartado apontando: descartar nao cobre.
      'com_excel',   (SELECT count(*) FROM ofx e WHERE EXISTS (
                        SELECT 1 FROM mesa_lancamento_staging x
                        WHERE x.ofx_extrato_id = e.id AND x.status_promocao <> 'descartado')),
      'sem_excel',   (SELECT count(*) FROM ofx e WHERE NOT EXISTS (
                        SELECT 1 FROM mesa_lancamento_staging x
                        WHERE x.ofx_extrato_id = e.id AND x.status_promocao <> 'descartado')),
      'promovidos',  (SELECT count(*) FROM stg WHERE status_promocao = 'promovido'),
      'pendentes',   (SELECT count(*) FROM stg WHERE status_promocao = 'pendente')
    ),
    -- 'problemas': buckets de pendencia NOMEADOS (nenhum pendente fica invisivel),
    -- depois residual 'outros', e por fim ofx_sem_excel (lado OFX).
    -- INVARIANTE: soma dos buckets 1..6 === cobertura.pendentes.
    'problemas', (
      SELECT coalesce(jsonb_agg(p ORDER BY ord), '[]'::jsonb) FROM (
        SELECT 1 ord, jsonb_build_object('tipo','correcao_manual','label','Correção manual',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:correcao_manual') p
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia = 'correcao_manual' HAVING count(*) > 0
        UNION ALL
        SELECT 2, jsonb_build_object('tipo','ofx_duplicado','label','OFX duplicado',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:ofx_duplicado')
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia = 'ofx_duplicado' HAVING count(*) > 0
        UNION ALL
        SELECT 3, jsonb_build_object('tipo','ambiguo','label','Ambíguo',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:ambiguo')
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia = 'ambiguo' HAVING count(*) > 0
        UNION ALL
        SELECT 4, jsonb_build_object('tipo','divergencia','label','Divergência valor/data',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:divergencia')
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia = 'divergencia' HAVING count(*) > 0
        UNION ALL
        SELECT 5, jsonb_build_object('tipo','sem_motivo','label','Sem motivo',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:sem_motivo')
          FROM stg WHERE status_promocao = 'pendente' AND motivo_pendencia IS NULL HAVING count(*) > 0
        UNION ALL
        SELECT 6, jsonb_build_object('tipo','outros','label','Outros',
          'count',count(*),'valor',coalesce(sum(valor),0),'filtro','pendente:outros')
          FROM stg WHERE status_promocao = 'pendente'
            AND motivo_pendencia IS NOT NULL
            AND motivo_pendencia NOT IN ('correcao_manual','ofx_duplicado','ambiguo','divergencia')
          HAVING count(*) > 0
        UNION ALL
        SELECT 7, jsonb_build_object('tipo','ofx_sem_excel','label','OFX sem Excel',
          'count',count(*),'valor',coalesce(sum(abs(valor)),0),'filtro','ofx_sem_excel')
          FROM ofx e WHERE NOT EXISTS (
            SELECT 1 FROM mesa_lancamento_staging x
            WHERE x.ofx_extrato_id = e.id AND x.status_promocao <> 'descartado') HAVING count(*) > 0
        -- sistema_sem_ofx: FORA DESTA FATIA (definicao correta depende do OFX x SISTEMA)
      ) q
    ),
    'status', jsonb_build_object(
      'ofx_saidas',     (SELECT coalesce(sum(abs(valor)),0) FROM ofx WHERE tipo_movimento = 'debito'),
      'sistema_saidas', (SELECT coalesce(sum(valor),0)      FROM sis WHERE sinal = '-1'),
      'divergencia',    (SELECT coalesce(sum(valor),0) FROM sis WHERE sinal = '-1')
                      - (SELECT coalesce(sum(abs(valor)),0) FROM ofx WHERE tipo_movimento = 'debito')
    ),
    'origem', jsonb_build_object(  -- VIA VINCULO (ver INVARIANTE no topo) — nunca origem_lancamento
      'via_mesa',   (SELECT count(*) FROM sis f WHERE EXISTS (SELECT 1 FROM mesa_lancamento_staging x WHERE x.lancamento_v2_id = f.id)),
      'ofx_direto', (SELECT count(*) FROM sis f WHERE NOT EXISTS (SELECT 1 FROM mesa_lancamento_staging x WHERE x.lancamento_v2_id = f.id) AND f.origem_lancamento = 'ofx'),
      'manual',     (SELECT count(*) FROM sis WHERE origem_lancamento = 'manual'),
      'importacao', (SELECT count(*) FROM sis WHERE origem_lancamento LIKE 'importacao%'),
      'migracao',   (SELECT count(*) FROM sis WHERE origem_lancamento = 'migracao'),
      -- residual: o banco tem ~12 valores de origem_lancamento, nao 5.
      'outras',     (SELECT count(*) FROM sis
                       WHERE coalesce(origem_lancamento,'(sem)') <> 'ofx'
                         AND coalesce(origem_lancamento,'(sem)') <> 'manual'
                         AND coalesce(origem_lancamento,'(sem)') <> 'migracao'
                         AND coalesce(origem_lancamento,'(sem)') NOT LIKE 'importacao%')
    ),
    'entradas', jsonb_build_object(
      'ofx',         (SELECT coalesce(sum(valor),0) FROM ofx WHERE tipo_movimento = 'credito'),
      'sistema',     (SELECT coalesce(sum(valor),0) FROM sis WHERE sinal = '1'),
      'a_conciliar', (SELECT coalesce(sum(valor),0) FROM ofx WHERE tipo_movimento = 'credito')
                   - (SELECT coalesce(sum(valor),0) FROM sis WHERE sinal = '1')
    )
  ) INTO v;

  RETURN v;
END $$;


--
-- Name: fn_endividamento_mensal(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_endividamento_mensal(p_cliente_id uuid, p_ano integer) RETURNS TABLE(mes integer, divida_inicial_pec numeric, captacao_pec numeric, amortizacao_pec numeric, juros_pec numeric, divida_final_pec numeric, divida_inicial_agri numeric, captacao_agri numeric, amortizacao_agri numeric, juros_agri numeric, divida_final_agri numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH
    meses AS (SELECT generate_series(1, 12) AS mes),
    fin AS (
      SELECT id, tipo_financiamento, data_contrato, valor_total, valor_entrada, status
      FROM financiamentos
      WHERE cliente_id = p_cliente_id
        AND status <> 'cancelado'
    ),
    parc AS (
      SELECT p.financiamento_id, p.valor_principal, p.valor_juros,
             p.data_pagamento, p.status,
             f.tipo_financiamento, f.data_contrato
      FROM financiamento_parcelas p
      JOIN fin f ON f.id = p.financiamento_id
      WHERE p.cliente_id = p_cliente_id
    ),
    cortes AS (
      SELECT
        m.mes,
        (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date AS dia1,
        (date_trunc('month', (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date)
          + interval '1 month - 1 day')::date AS ultimo_dia,
        (date_trunc('month', (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date)
          - interval '1 day')::date AS dia_anterior
      FROM meses m
    ),
    divida_inicial AS (
      SELECT c.mes, p.tipo_financiamento, SUM(p.valor_principal) AS v
      FROM cortes c
      JOIN parc p
        ON p.data_contrato <= c.dia_anterior
       AND (p.data_pagamento IS NULL OR p.data_pagamento > c.dia_anterior)
      GROUP BY 1, 2
    ),
    divida_final AS (
      SELECT c.mes, p.tipo_financiamento, SUM(p.valor_principal) AS v
      FROM cortes c
      JOIN parc p
        ON p.data_contrato <= c.ultimo_dia
       AND (p.data_pagamento IS NULL OR p.data_pagamento > c.ultimo_dia)
      GROUP BY 1, 2
    ),
    captacao AS (
      SELECT EXTRACT(MONTH FROM f.data_contrato)::int AS mes,
             f.tipo_financiamento,
             SUM(f.valor_total - COALESCE(f.valor_entrada, 0)) AS v
      FROM fin f
      WHERE EXTRACT(YEAR FROM f.data_contrato) = p_ano
      GROUP BY 1, 2
    ),
    amortizacao AS (
      SELECT EXTRACT(MONTH FROM p.data_pagamento)::int AS mes,
             p.tipo_financiamento,
             SUM(p.valor_principal) AS v
      FROM parc p
      WHERE p.status = 'pago'
        AND EXTRACT(YEAR FROM p.data_pagamento) = p_ano
      GROUP BY 1, 2
    ),
    juros AS (
      SELECT EXTRACT(MONTH FROM p.data_pagamento)::int AS mes,
             p.tipo_financiamento,
             SUM(p.valor_juros) AS v
      FROM parc p
      WHERE p.status = 'pago'
        AND EXTRACT(YEAR FROM p.data_pagamento) = p_ano
      GROUP BY 1, 2
    )
  SELECT
    m.mes,
    COALESCE(di_p.v, 0)::numeric AS divida_inicial_pec,
    COALESCE(c_p.v,  0)::numeric AS captacao_pec,
    COALESCE(a_p.v,  0)::numeric AS amortizacao_pec,
    COALESCE(j_p.v,  0)::numeric AS juros_pec,
    COALESCE(df_p.v, 0)::numeric AS divida_final_pec,
    COALESCE(di_a.v, 0)::numeric AS divida_inicial_agri,
    COALESCE(c_a.v,  0)::numeric AS captacao_agri,
    COALESCE(a_a.v,  0)::numeric AS amortizacao_agri,
    COALESCE(j_a.v,  0)::numeric AS juros_agri,
    COALESCE(df_a.v, 0)::numeric AS divida_final_agri
  FROM meses m
  LEFT JOIN divida_inicial di_p ON di_p.mes = m.mes AND di_p.tipo_financiamento = 'pecuaria'
  LEFT JOIN divida_inicial di_a ON di_a.mes = m.mes AND di_a.tipo_financiamento = 'agricultura'
  LEFT JOIN captacao       c_p  ON c_p.mes  = m.mes AND c_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN captacao       c_a  ON c_a.mes  = m.mes AND c_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN amortizacao    a_p  ON a_p.mes  = m.mes AND a_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN amortizacao    a_a  ON a_a.mes  = m.mes AND a_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN juros          j_p  ON j_p.mes  = m.mes AND j_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN juros          j_a  ON j_a.mes  = m.mes AND j_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN divida_final   df_p ON df_p.mes = m.mes AND df_p.tipo_financiamento = 'pecuaria'
  LEFT JOIN divida_final   df_a ON df_a.mes = m.mes AND df_a.tipo_financiamento = 'agricultura'
  ORDER BY m.mes;
$$;


--
-- Name: FUNCTION fn_endividamento_mensal(p_cliente_id uuid, p_ano integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_endividamento_mensal(p_cliente_id uuid, p_ano integer) IS 'Bloco Endividamento PC-100. Fonte soberana: financiamento_parcelas JOIN financiamentos. Split Pec/Agri via tipo_financiamento. Sempre GLOBAL. Identidade contabil: divida_final = divida_inicial + captacao - amortizacao.';


--
-- Name: fn_expirar_stagings_antigos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_expirar_stagings_antigos() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE qtd INTEGER;
BEGIN
  UPDATE extrato_bancario_staging
  SET status = 'expirado', descartado_em = now()
  WHERE status = 'aberto' AND expira_em < now();
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RETURN qtd;
END $$;


--
-- Name: FUNCTION fn_expirar_stagings_antigos(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_expirar_stagings_antigos() IS 'Mesa Operacional v2. Marca como expirados os stagings abertos com expira_em
ultrapassado. Idempotente. Agendamento via pg_cron em PR0.A.
Retorna número de stagings expirados nesta execução. Criada PR0.A.';


--
-- Name: fn_extrato_chave_doc(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_extrato_chave_doc(p_doc text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_doc IS NOT NULL AND array_length(string_to_array(p_doc, ':'), 1) >= 4
      THEN split_part(p_doc, ':', 4)
    ELSE COALESCE(p_doc, '')
  END;
$$;


--
-- Name: fn_extratos_espelhados(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH pp AS (
  SELECT p_cliente AS cli, p_conta AS conta, p_mes AS mes,
    TO_DATE(p_mes||'-01','YYYY-MM-DD') AS d1,
    (TO_DATE(p_mes||'-01','YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::date AS d2
),
ofx_base AS (
  SELECT e.id, e.data_movimento AS dt, e.valor AS v, e.tipo_movimento AS tp,
         e.descricao, e.documento, e.status
  FROM extrato_bancario_v2 e JOIN pp ON true
  WHERE e.cliente_id = pp.cli AND e.conta_bancaria_id = pp.conta
    AND e.data_movimento BETWEEN pp.d1 AND pp.d2
    AND e.cancelado_em IS NULL
),
lv2 AS (
  SELECT l.id, l.data_pagamento AS dt,
         (CASE
            WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id  = pp.conta THEN  l.valor
            WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = pp.conta THEN -l.valor
            WHEN l.sinal = '1' THEN l.valor ELSE -l.valor
          END) AS v,
         l.sinal,
         COALESCE(l.descricao, l.historico) AS descricao,
         l.centro_custo, l.subcentro
  FROM financeiro_lancamentos_v2 l JOIN pp ON true
  WHERE l.cliente_id = pp.cli AND l.ano_mes = pp.mes
    AND l.cancelado = false AND l.sem_movimentacao_caixa = false
    AND COALESCE(l.cenario,'realizado') = 'realizado'
    AND l.status_transacao = 'realizado'
    AND ((l.sinal='1'  AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta))
      OR (l.sinal='-1' AND l.conta_bancaria_id = pp.conta)
      OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta))
),
ofx_status AS (
  SELECT o.*,
    CASE
      WHEN o.status = 'ignorado' THEN 'ignorado'
      WHEN EXISTS(SELECT 1 FROM conciliacao_bancaria_itens cbi
                  JOIN financeiro_lancamentos_v2 l ON l.id=cbi.lancamento_id AND l.cancelado=false
                  WHERE cbi.extrato_id=o.id AND cbi.desfeito_em IS NULL) THEN 'conciliado'
      ELSE 'sem_vinculo'
    END AS st,
    (SELECT count(*) FROM ofx_base o2 WHERE o2.v = o.v AND o2.dt = o.dt) > 1 AS flag_dup,
    (o.descricao ~* '(cdb|invest|aplic|resg)') AS flag_inv
  FROM ofx_base o
),
sis_status AS (
  SELECT s.*,
    CASE WHEN EXISTS(SELECT 1 FROM conciliacao_bancaria_itens cbi
                     WHERE cbi.lancamento_id=s.id AND cbi.desfeito_em IS NULL) THEN 'conciliado'
         ELSE 'sem_vinculo' END AS st
  FROM lv2 s
),
sb_ini AS (
  SELECT saldo_final AS v FROM financeiro_saldos_bancarios_v2
  WHERE cliente_id=p_cliente AND conta_bancaria_id=p_conta
    AND ano_mes = to_char((TO_DATE(p_mes||'-01','YYYY-MM-DD') - INTERVAL '1 month'),'YYYY-MM')
  LIMIT 1
),
sb_fim AS (
  SELECT saldo_final AS v FROM financeiro_saldos_bancarios_v2
  WHERE cliente_id=p_cliente AND conta_bancaria_id=p_conta AND ano_mes=p_mes
  LIMIT 1
),
cb AS (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id=p_conta LIMIT 1)
SELECT jsonb_build_object(
  'escopo', jsonb_build_object('cliente_id',p_cliente,'conta_id',p_conta,'ano_mes',p_mes,
            'nome_conta',(SELECT nome_exibicao FROM cb)),
  'saldos', jsonb_build_object(
            'inicial',(SELECT v FROM sb_ini),
            'final_oficial',(SELECT v FROM sb_fim),
            'periodo_ini',(SELECT d1 FROM pp),
            'periodo_fim',(SELECT d2 FROM pp),
            'extrato_ini',(SELECT min(dt) FROM ofx_base),
            'extrato_fim',(SELECT max(dt) FROM ofx_base)),
  'ofx_completo',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'extrato_id',id,'data',dt,'historico',descricao,'documento',documento,
            'valor',v,'status',st,'flag_dup',flag_dup,'flag_investimento',flag_inv) ORDER BY dt, id),'[]'::jsonb) FROM ofx_status),
  'sistema_completo',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'lancamento_id',id,'data',dt,'descricao',descricao,'centro',centro_custo,
            'subcentro',subcentro,'valor_assinado',v,'sinal',sinal,'status',st) ORDER BY dt, id),'[]'::jsonb) FROM sis_status),
  'versao','espelhados-01.1-ofx-cancelado',
  'gerado_em', now()
)
$$;


--
-- Name: fn_gerar_codigo_conta(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_gerar_codigo_conta(p_cliente_id uuid, p_tipo_conta text) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
  v_max int;
BEGIN
  IF p_cliente_id IS NULL OR p_tipo_conta IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_cliente_id::text || ':' || p_tipo_conta, 0)
  );

  SELECT COALESCE(MAX(codigo_conta::int), 0)
    INTO v_max
  FROM financeiro_contas_bancarias
  WHERE cliente_id = p_cliente_id
    AND tipo_conta = p_tipo_conta
    AND codigo_conta IS NOT NULL
    AND codigo_conta ~ '^[0-9]+$';

  RETURN to_char(v_max + 1, 'FM000');
END;
$_$;


--
-- Name: fn_get_mesa_v2_mode(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_mesa_v2_mode() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE v_mode TEXT;
BEGIN
  v_mode := current_setting('app.mesa_v2_triggers_enforce', true);
  IF v_mode IS NULL OR v_mode NOT IN ('off','log','enforce') THEN
    RETURN 'log';
  END IF;
  RETURN v_mode;
END $$;


--
-- Name: FUNCTION fn_get_mesa_v2_mode(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_get_mesa_v2_mode() IS 'Mesa Operacional v2. Lê o setting app.mesa_v2_triggers_enforce com fallback
seguro para "log". Valores válidos: off / log / enforce.
- off:     bypass total, trigger não executa lógica de defesa (emergência).
- log:     trigger registra warning em conciliacao_audit_log, NÃO bloqueia.
- enforce: trigger bloqueia operação ilegal com RAISE EXCEPTION.
Setting é por sessão. Para persistir globalmente, DBA executa
ALTER DATABASE postgres SET app.mesa_v2_triggers_enforce = ''log''
fora do fluxo de migration. Criada PR0.A.';


--
-- Name: fn_guard_conciliacao_mes_fechado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_guard_conciliacao_mes_fechado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_mode TEXT;
  v_cliente_id UUID;
  v_conta_id UUID;
  v_ano_mes TEXT;
  v_mes_fechado BOOLEAN;
BEGIN
  v_mode := fn_get_mesa_v2_mode();
  IF v_mode = 'off' THEN RETURN NEW; END IF;

  SELECT cliente_id, conta_bancaria_id, to_char(data_movimento,'YYYY-MM')
    INTO v_cliente_id, v_conta_id, v_ano_mes
  FROM extrato_bancario_v2 WHERE id = NEW.extrato_id;

  SELECT EXISTS (
    SELECT 1 FROM financeiro_saldos_bancarios_v2
    WHERE cliente_id = v_cliente_id
      AND conta_bancaria_id = v_conta_id
      AND ano_mes = v_ano_mes
      AND status_mes = 'fechado'
  ) INTO v_mes_fechado;

  IF v_mes_fechado THEN
    IF v_mode = 'log' THEN
      INSERT INTO conciliacao_audit_log (
        acao, cliente_id, extrato_id, lancamento_id, conciliacao_id, ano_mes, motivo
      ) VALUES (
        'warning_mes_fechado', v_cliente_id, NEW.extrato_id, NEW.lancamento_id,
        NEW.id, v_ano_mes,
        format('mode=log: conciliação em conta %s mês %s (FECHADO) — não bloqueado',
               v_conta_id::text, v_ano_mes)
      );
      RETURN NEW;
    ELSIF v_mode = 'enforce' THEN
      RAISE EXCEPTION 'Conciliação bloqueada: conta % mês % está fechado',
        v_conta_id, v_ano_mes
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END $$;


--
-- Name: FUNCTION fn_guard_conciliacao_mes_fechado(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_guard_conciliacao_mes_fechado() IS 'Mesa Operacional v2. Verifica se a conta+mês do extrato está fechado.
Respeita setting app.mesa_v2_triggers_enforce: off / log / enforce.
Criada PR0.A em modo log.';


--
-- Name: fn_invalidar_origem_extrato(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_invalidar_origem_extrato(p_extrato_id uuid, p_motivo text, p_decisoes jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_ext       extrato_bancario_v2%ROWTYPE;
  v_der       record;
  v_n_ativos  int;
  v_sugestao  text;
  v_tipo      text;
  v_justif    text;
  v_derivados jsonb := '[]'::jsonb;
  v_pendente  boolean := false;
  v_item      jsonb;
  v_lid       uuid;
  v_decisao   text;
  v_cancelados int := 0;
  v_promovidos int := 0;
  -- PR-A3.1 — proteção "última cópia válida".
  v_gemeas_vivas int;
  v_ultima_copia boolean;
  v_impacto      numeric;
BEGIN
  -- (a) guards — retorno estruturado, sem RAISE (extrato não tem coluna 'cancelado')
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_inexistente'); END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_ext.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao'); END IF;
  -- (motivo NÃO é guard aqui: a abertura do dialog chama a RPC sem motivo só para LISTAR
  --  os derivados; o motivo é obrigatório no front, no passo de confirmação.)

  -- (a.2) PR-A3.1 DELTA (i) — "última ocorrência válida" deste documento nesta conta.
  -- Gêmea VIVA = mesmo documento + mesma conta, não cancelada e NÃO ignorada.
  -- IS DISTINCT FROM 'ignorado' conta status NULL como cópia VIVA. documento NULL → última.
  IF v_ext.documento IS NULL THEN
    v_gemeas_vivas := 0;
  ELSE
    SELECT count(*) INTO v_gemeas_vivas FROM extrato_bancario_v2 g
      WHERE g.conta_bancaria_id = v_ext.conta_bancaria_id
        AND g.documento = v_ext.documento
        AND g.id <> v_ext.id
        AND g.cancelado_em IS NULL
        AND g.status IS DISTINCT FROM 'ignorado';
  END IF;
  v_ultima_copia := (v_gemeas_vivas = 0);
  -- impacto = o que SAI do OFX válido ao confirmar (signed).
  v_impacto := v_ext.valor * (CASE v_ext.tipo_movimento WHEN 'credito' THEN 1 ELSE -1 END) * -1;

  -- (b) DERIVADOS VIVOS + régua. Lançamentos ativos ligados ao extrato via CBI
  --     (desfeitas INCLUÍDAS — a cbi desfeita é a memória do elo).
  FOR v_der IN
    SELECT DISTINCT l.id, l.valor, l.descricao, l.origem_lancamento, l.editado_manual, l.created_at
    FROM financeiro_lancamentos_v2 l
    JOIN conciliacao_bancaria_itens cbi ON cbi.lancamento_id = l.id
    WHERE cbi.extrato_id = p_extrato_id AND l.cancelado = false
  LOOP
    SELECT count(*) INTO v_n_ativos FROM conciliacao_bancaria_itens
      WHERE lancamento_id = v_der.id AND desfeito_em IS NULL;

    -- ═══ HEURÍSTICA INICIAL REFLEXO × INDEPENDENTE (EVOLUTIVA) ═══
    -- Única casa da régua (ADR-2026-06). Bloco será extraído para
    -- função compartilhada quando a Mesa virar o 2º consumidor.
    -- Evoluções previstas: anexos/NF, aprovação, workflow.
    IF v_der.editado_manual IS TRUE THEN
      v_sugestao := 'manter_independente'; v_tipo := 'edicao_manual';
      v_justif   := 'Lançamento com edição/enriquecimento manual (origem '''||coalesce(v_der.origem_lancamento,'?')||''', criado em '||to_char(v_der.created_at,'DD/MM/YYYY')||').';
    ELSIF v_der.origem_lancamento IS NULL OR v_der.origem_lancamento NOT IN ('ofx','extrato') THEN
      v_sugestao := 'manter_independente'; v_tipo := 'origem_nao_reflexo';
      v_justif   := 'Origem '''||coalesce(v_der.origem_lancamento,'?')||''' não é reflexo de extrato.';
    ELSIF v_n_ativos > 1 THEN
      v_sugestao := 'manter_independente'; v_tipo := 'multiplos_vinculos';
      v_justif   := 'Possui '||v_n_ativos||' vínculos ativos.';
    ELSE
      v_sugestao := 'cancelar_junto'; v_tipo := 'reflexo_puro';
      v_justif   := 'Reflexo puro da origem: sem edição manual, origem '''||coalesce(v_der.origem_lancamento,'?')||''', vínculo simples.';
    END IF;
    -- ═══ fim da régua ═══

    v_derivados := v_derivados || jsonb_build_object(
      'lancamento_id', v_der.id, 'valor', v_der.valor, 'descricao', v_der.descricao,
      'origem_lancamento', v_der.origem_lancamento, 'editado_manual', v_der.editado_manual,
      'sugestao', v_sugestao, 'justificativa_tipo', v_tipo, 'justificativa', v_justif);

    IF p_decisoes IS NULL OR NOT (p_decisoes ? v_der.id::text) THEN v_pendente := true; END IF;
  END LOOP;

  -- (d) decisão pendente → devolve a lista, SEM NENHUM EFEITO (motivo é OPCIONAL na listagem)
  -- PR-A3.1 DELTA (ii): + campos de última-cópia/impacto.
  IF v_derivados <> '[]'::jsonb AND v_pendente THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'decisao_pendente', 'derivados', v_derivados,
      'ultima_copia_valida', v_ultima_copia, 'gemeas_vivas', v_gemeas_vivas,
      'impacto_valor', v_impacto, 'documento', v_ext.documento);
  END IF;

  -- (b/motivo) CONSUMAÇÃO: não é mais listagem (todas as decisões vieram, OU não há
  -- derivados = invalidação efetiva). Motivo obrigatório NO BANCO (defesa dupla, nunca só front).
  -- PR-A3.1 DELTA (ii): + campos de última-cópia/impacto (o dialog exibe o aviso ao LISTAR).
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio',
      'ultima_copia_valida', v_ultima_copia, 'gemeas_vivas', v_gemeas_vivas,
      'impacto_valor', v_impacto, 'documento', v_ext.documento);
  END IF;

  -- (d+e) aplicar tudo numa subtransação: erro de guard (mês fechado etc) → nada aplicado
  BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_derivados)
    LOOP
      v_lid     := (v_item->>'lancamento_id')::uuid;
      v_decisao := p_decisoes->>(v_lid::text);
      IF v_decisao = 'cancelar_junto' THEN
        -- o trigger trg_cbi_desfazer_on_cancelamento desfaz vínculos + audita (NÃO duplicar)
        UPDATE financeiro_lancamentos_v2
           SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
               cancelado_motivo = 'origem_ignorada:'||p_extrato_id
         WHERE id = v_lid;
        INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, motivo, payload_depois)
        VALUES ('derivado_cancelado_com_origem', v_uid, v_ext.cliente_id, p_extrato_id, v_lid, p_motivo,
                jsonb_build_object('decisao','cancelar_junto',
                  'sugestao_sistema', v_item->>'sugestao', 'justificativa_tipo', v_item->>'justificativa_tipo',
                  'justificativa_sistema', v_item->>'justificativa',
                  'seguiu_sugestao', ((v_item->>'sugestao') = 'cancelar_junto')));
        v_cancelados := v_cancelados + 1;
      ELSE  -- manter_independente
        INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, motivo, payload_depois)
        VALUES ('derivado_promovido_independente', v_uid, v_ext.cliente_id, p_extrato_id, v_lid, p_motivo,
                jsonb_build_object('decisao','manter_independente',
                  'sugestao_sistema', v_item->>'sugestao', 'justificativa_tipo', v_item->>'justificativa_tipo',
                  'justificativa_sistema', v_item->>'justificativa',
                  'seguiu_sugestao', ((v_item->>'sugestao') = 'manter_independente')));
        v_promovidos := v_promovidos + 1;
      END IF;
    END LOOP;

    -- extrato ignorado + auditoria (idempotente: já ignorado → não reescreve ignorado_em)
    -- PR-A3.1 DELTA (iii): persiste última-cópia + impacto na própria linha.
    UPDATE extrato_bancario_v2
       SET status = 'ignorado',
           ignorado_em     = COALESCE(ignorado_em, now()),
           ignorado_por    = COALESCE(ignorado_por, v_uid),
           ignorado_motivo = COALESCE(ignorado_motivo, btrim(p_motivo)),
           ignorado_ultima_copia = v_ultima_copia,
           ignorado_impacto      = v_impacto
     WHERE id = p_extrato_id;
    INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, motivo, payload_depois)
    VALUES ('extrato_ignorado', v_uid, v_ext.cliente_id, p_extrato_id, btrim(p_motivo),
            jsonb_build_object('status','ignorado'));

  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'erro_cancelamento', 'detalhe', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true, 'ignorado', true, 'cancelados', v_cancelados, 'promovidos', v_promovidos);
END $$;


--
-- Name: fn_lancamento_auto_derivar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_lancamento_auto_derivar() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- ETAPA 1: ano_mes auto-derivado de data quando NULL
  IF NEW.ano_mes IS NULL AND NEW.data IS NOT NULL THEN
    NEW.ano_mes := TO_CHAR(NEW.data, 'YYYY-MM');
  END IF;

  -- ETAPA 2: peso_carcaca_kg para abate quando NULL e (peso_medio + rendimento) presentes
  IF NEW.tipo = 'abate'
     AND NEW.peso_carcaca_kg IS NULL
     AND COALESCE(NEW.peso_medio_kg, 0) > 0
     AND COALESCE(NEW.rendimento, 0) > 0 THEN
    NEW.peso_carcaca_kg := ROUND((NEW.peso_medio_kg * NEW.rendimento / 100)::numeric, 2);
  END IF;

  -- ETAPA 3: arroba quando NULL/0
  IF (NEW.arroba IS NULL OR NEW.arroba = 0)
     AND COALESCE(NEW.quantidade, 0) > 0 THEN
    IF NEW.tipo = 'abate' AND COALESCE(NEW.peso_carcaca_kg, 0) > 0 THEN
      NEW.arroba := ROUND((NEW.quantidade * NEW.peso_carcaca_kg / 15)::numeric, 2);
    ELSIF NEW.tipo IN ('venda','consumo') AND COALESCE(NEW.peso_medio_kg, 0) > 0 THEN
      NEW.arroba := ROUND((NEW.quantidade * NEW.peso_medio_kg / 30)::numeric, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_marcar_extrato_transferencia(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_marcar_extrato_transferencia(p_extrato_id uuid, p_conta_contraparte uuid, p_motivo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ext   record;
  v_uid   uuid := auth.uid();
  v_lanc  uuid;
  v_cbi   uuid;
  v_orig  uuid;
  v_dest  uuid;
BEGIN
  -- carregar extrato
  SELECT id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, descricao
    INTO v_ext
  FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF v_ext.id IS NULL THEN
    RAISE EXCEPTION 'extrato inexistente: %', p_extrato_id;
  END IF;

  -- GUARD: valor zero
  IF COALESCE(v_ext.valor, 0) = 0 THEN
    RAISE EXCEPTION 'extrato com valor zero nao pode ser marcado como transferencia';
  END IF;

  -- GUARD: extrato sem CBI ativo
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = p_extrato_id AND c.desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'extrato ja possui vinculo ativo: %', p_extrato_id;
  END IF;

  -- GUARD: contraparte do mesmo cliente e diferente da conta do extrato
  IF NOT EXISTS (SELECT 1 FROM financeiro_contas_bancarias cb WHERE cb.id = p_conta_contraparte AND cb.cliente_id = v_ext.cliente_id) THEN
    RAISE EXCEPTION 'conta contraparte invalida ou de outro cliente: %', p_conta_contraparte;
  END IF;
  IF p_conta_contraparte = v_ext.conta_bancaria_id THEN
    RAISE EXCEPTION 'conta contraparte nao pode ser a propria conta do extrato';
  END IF;

  -- direcao pelo sinal real do extrato (nao textual)
  IF v_ext.valor > 0 THEN
    -- credito na conta do extrato (resgate): origem = contraparte, destino = conta do extrato
    v_orig := p_conta_contraparte;
    v_dest := v_ext.conta_bancaria_id;
  ELSE
    -- debito na conta do extrato (aplicacao): origem = conta do extrato, destino = contraparte
    v_orig := v_ext.conta_bancaria_id;
    v_dest := p_conta_contraparte;
  END IF;

  -- 1 lancamento de transferencia
  INSERT INTO financeiro_lancamentos_v2
    (cliente_id, fazenda_id, ano_mes, data_pagamento, data_competencia, valor, sinal,
     tipo_operacao, descricao, status_transacao, cancelado,
     conta_bancaria_id, conta_destino_id, subcentro, origem_lancamento, sem_movimentacao_caixa)
  VALUES
    (v_ext.cliente_id, NULL, to_char(v_ext.data_movimento,'YYYY-MM'), v_ext.data_movimento, v_ext.data_movimento,
     abs(v_ext.valor), -1, '3-Transferências',
     'Transferência entre contas próprias — ' || COALESCE(v_ext.descricao,''), 'realizado', false,
     v_orig, v_dest, 'Transferência entre Contas Bancárias', 'conciliacao_transferencia', false)
  RETURNING id INTO v_lanc;

  -- CBI direto (replicando campos do D1; tipo_aprovacao='manual')
  INSERT INTO conciliacao_bancaria_itens
    (cliente_id, extrato_id, lancamento_id, valor_aplicado,
     criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
     snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data)
  VALUES
    (v_ext.cliente_id, p_extrato_id, v_lanc, abs(v_ext.valor),
     v_uid, 'manual', v_uid, now(),
     v_ext.valor, abs(v_ext.valor), v_ext.data_movimento, v_ext.data_movimento)
  RETURNING id INTO v_cbi;

  RETURN jsonb_build_object('lancamento_id', v_lanc, 'cbi_id', v_cbi, 'origem', v_orig, 'destino', v_dest, 'motivo', p_motivo);
END;
$$;


--
-- Name: fn_normalizar_nome_fornecedor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_normalizar_nome_fornecedor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.nome_normalizado := UPPER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              TRANSLATE(NEW.nome, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                                  'aaaaaeeeeiiiioooooouuuucnaaaaaeeeeiiiioooooouuuucn'),
              '[^A-Za-z0-9 ]', ' ', 'g'),
            '\s+', ' ', 'g'));
        RETURN NEW;
      END;
      $$;


--
-- Name: fn_promover_lancamento_realizado_ao_conciliar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.financeiro_lancamentos_v2
  SET status_transacao = 'realizado',
      updated_at = now()
  WHERE id = NEW.lancamento_id
    AND status_transacao IN ('programado','agendado')
    AND cancelado = false
    AND COALESCE(cenario, 'realizado') <> 'meta';
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION fn_promover_lancamento_realizado_ao_conciliar(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() IS 'Promove lancamento programado/agendado -> realizado quando vinculo OFX e criado.
Estrategia: promover sem rebaixar (Opcao A). DELETE de cbi NAO rebaixa.
Filtros: cancelado=false, cenario!=meta, status IN (programado, agendado).
PR-Promover-Lanc-AoConciliar 27/05/2026.';


--
-- Name: fn_promover_staging(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_promover_staging(p_sessao_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid               uuid := auth.uid();
  v_row               mesa_lancamento_staging%ROWTYPE;
  v_lanc_id           uuid;
  v_fornecedor_id     uuid;
  v_promovidos        int := 0;
  v_enriquecidos      int := 0;
  v_ja_promovido_ofx  int := 0;
  v_protegidos_manual int := 0;
  v_ambiguos          int := 0;
  v_divergentes_merge int := 0;
  v_count_pendente    int;
  v_count_divergente  int;
  v_count_transf      int;
  v_meses_fechados    text;
  v_n_vinc            int;
  v_alvo              financeiro_lancamentos_v2%ROWTYPE;
BEGIN
  SELECT count(*) INTO v_count_pendente
  FROM mesa_lancamento_staging
  WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente';
  IF v_count_pendente = 0 THEN
    RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id,
      'promovidos', 0, 'enriquecidos', 0, 'ja_promovidos', 0,
      'protegidos_manual', 0, 'ambiguos', 0, 'divergentes_merge', 0,
      'motivo', 'sem_pendentes');
  END IF;

  SELECT count(*) INTO v_count_divergente
  FROM mesa_lancamento_staging
  WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente'
    AND conta_resolvida_id IS NOT NULL
    AND conta_bancaria_id IS DISTINCT FROM conta_resolvida_id;
  IF v_count_divergente > 0 THEN
    RAISE EXCEPTION 'Sessao tem % lancamento(s) com divergencia entre conta escolhida e conta do Excel. Corrija antes de promover.', v_count_divergente;
  END IF;

  SELECT count(*) INTO v_count_transf
  FROM mesa_lancamento_staging
  WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente'
    AND tipo_operacao = '3-Transferências';
  IF v_count_transf > 0 THEN
    RAISE EXCEPTION 'Sessao contem % transferencia(s). Transferencias nao sao promovidas pela Mesa.', v_count_transf;
  END IF;

  SELECT string_agg(DISTINCT s.ano_mes, ', ') INTO v_meses_fechados
  FROM mesa_lancamento_staging s
  WHERE s.sessao_id = p_sessao_id AND s.status_promocao = 'pendente'
    AND EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.cliente_id = s.cliente_id
        AND f.fazenda_id = s.fazenda_id
        AND f.ano_mes = s.ano_mes
        AND f.status_fechamento = 'fechado'
    );
  IF v_meses_fechados IS NOT NULL THEN
    RAISE EXCEPTION 'Sessao tem competencia(s) em mes fechado: %. Reabra o periodo ou ajuste antes de promover.', v_meses_fechados;
  END IF;

  FOR v_row IN
    SELECT * FROM mesa_lancamento_staging
    WHERE sessao_id = p_sessao_id AND status_promocao = 'pendente'
    ORDER BY data_pagamento, staging_id
  LOOP
    -- GUARD 1 — STAGING-02: 1 OFX -> 1 promovido (idempotencia).
    IF v_row.ofx_extrato_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM mesa_lancamento_staging x
      WHERE x.ofx_extrato_id = v_row.ofx_extrato_id
        AND x.status_promocao = 'promovido'
    ) THEN
      v_ja_promovido_ofx := v_ja_promovido_ofx + 1;
      CONTINUE;
    END IF;

    -- Resolve fornecedor (cria se veio nome novo sem UUID) — usado por INSERT e MERGE.
    v_fornecedor_id := v_row.favorecido_id;
    IF v_fornecedor_id IS NULL
       AND v_row.favorecido_nome_marcado_novo IS NOT NULL
       AND length(btrim(v_row.favorecido_nome_marcado_novo)) > 0 THEN
      INSERT INTO financeiro_fornecedores (id, cliente_id, nome)
      VALUES (gen_random_uuid(), v_row.cliente_id, btrim(v_row.favorecido_nome_marcado_novo))
      RETURNING id INTO v_fornecedor_id;
    END IF;

    -- GUARD 2 — ofx_extrato_id null -> INSERT direto (orfao do Excel).
    IF v_row.ofx_extrato_id IS NULL THEN
      v_alvo := NULL; v_n_vinc := 0;
    ELSE
      -- GUARD 3 — buscar alvo via cbi (lancamento nao-cancelado).
      SELECT count(*) INTO v_n_vinc
      FROM conciliacao_bancaria_itens cbi
      JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id
      WHERE cbi.extrato_id = v_row.ofx_extrato_id
        AND l.cancelado = false;

      IF v_n_vinc > 1 THEN
        v_ambiguos := v_ambiguos + 1;
        CONTINUE;
      ELSIF v_n_vinc = 1 THEN
        SELECT l.* INTO v_alvo
        FROM conciliacao_bancaria_itens cbi
        JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id
        WHERE cbi.extrato_id = v_row.ofx_extrato_id
          AND l.cancelado = false
        LIMIT 1;

        -- GUARD 4 — editado_manual: proteger correcao manual, sem update parcial.
        IF COALESCE(v_alvo.editado_manual, false) = true THEN
          v_protegidos_manual := v_protegidos_manual + 1;
          CONTINUE;
        END IF;

        -- GUARD 5 — verdade bancaria: valor/sinal/data devem bater.
        IF v_alvo.valor IS DISTINCT FROM v_row.valor
           OR v_alvo.sinal IS DISTINCT FROM v_row.sinal
           OR v_alvo.data_pagamento IS DISTINCT FROM v_row.data_pagamento THEN
          v_divergentes_merge := v_divergentes_merge + 1;
          CONTINUE;
        END IF;

        -- GUARD 6 — MERGE: UPDATE enriquecendo o lancamento existente.
        -- NAO toca: valor, sinal, data_pagamento, data_competencia, conta_*,
        -- origem_lancamento, cenario, status_transacao, conciliado_em.
        -- descricao recebe o Produto dobrado (espelha o INSERT); quando o Excel
        -- nao traz Produto nem descricao, preserva o descricao existente.
        -- observacao recebe APENAS v_row.observacao (Produto nao vai p/ observacao).
        UPDATE financeiro_lancamentos_v2
        SET fazenda_id     = COALESCE(v_row.fazenda_id, fazenda_id),
            favorecido_id  = COALESCE(v_fornecedor_id, favorecido_id),
            macro_custo    = v_row.macro_custo,
            grupo_custo    = v_row.grupo_custo,
            centro_custo   = v_row.centro_custo,
            subcentro      = v_row.subcentro,
            escopo_negocio = v_row.escopo_negocio,
            descricao      = CASE
              WHEN NULLIF(btrim(v_row.produto), '') IS NOT NULL AND NULLIF(btrim(v_row.descricao), '') IS NOT NULL THEN v_row.produto || ' — ' || v_row.descricao
              WHEN NULLIF(btrim(v_row.produto), '') IS NOT NULL THEN v_row.produto
              WHEN NULLIF(btrim(v_row.descricao), '') IS NOT NULL THEN v_row.descricao
              ELSE descricao
            END,
            observacao     = v_row.observacao,
            staging_id     = v_row.staging_id,
            updated_by     = v_uid,
            updated_at     = now()
        WHERE id = v_alvo.id;

        UPDATE mesa_lancamento_staging
        SET status_promocao = 'promovido',
            lancamento_v2_id = v_alvo.id,
            promovido_em = now(),
            promovido_por = v_uid
        WHERE staging_id = v_row.staging_id;

        v_enriquecidos := v_enriquecidos + 1;
        CONTINUE;
      END IF;
    END IF;

    -- INSERT (guard 2 orfao, ou guard 3 com 0 vinculos): lancamento novo.
    INSERT INTO financeiro_lancamentos_v2 (
      id, cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id,
      ano_mes, data_pagamento, data_competencia,
      valor, sinal, tipo_operacao,
      macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio,
      descricao, observacao, favorecido_id,
      cenario, status_transacao, sem_movimentacao_caixa, origem_lancamento,
      cancelado, staging_id, created_by, updated_by
    ) VALUES (
      gen_random_uuid(), v_row.cliente_id, v_row.fazenda_id,
      CASE WHEN v_row.tipo_operacao = '1-Entradas' THEN NULL ELSE v_row.conta_bancaria_id END,
      CASE WHEN v_row.tipo_operacao = '1-Entradas' THEN v_row.conta_bancaria_id ELSE NULL END,
      v_row.ano_mes, v_row.data_pagamento, COALESCE(v_row.data_competencia, v_row.data_pagamento),
      v_row.valor, v_row.sinal, v_row.tipo_operacao,
      v_row.macro_custo, v_row.grupo_custo, v_row.centro_custo, v_row.subcentro, v_row.escopo_negocio,
      CASE WHEN NULLIF(btrim(v_row.produto), '') IS NOT NULL AND NULLIF(btrim(v_row.descricao), '') IS NOT NULL THEN v_row.produto || ' — ' || v_row.descricao WHEN NULLIF(btrim(v_row.produto), '') IS NOT NULL THEN v_row.produto ELSE NULLIF(btrim(v_row.descricao), '') END,
      v_row.observacao, v_fornecedor_id,
      'realizado', 'realizado', false, 'mesa_excel',
      false, v_row.staging_id, v_uid, v_uid
    )
    RETURNING id INTO v_lanc_id;

    UPDATE mesa_lancamento_staging
    SET status_promocao = 'promovido',
        lancamento_v2_id = v_lanc_id,
        promovido_em = now(),
        promovido_por = v_uid
    WHERE staging_id = v_row.staging_id;

    v_promovidos := v_promovidos + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sessao_id', p_sessao_id,
    'promovidos', v_promovidos,
    'enriquecidos', v_enriquecidos,
    'ja_promovidos', v_ja_promovido_ofx,
    'protegidos_manual', v_protegidos_manual,
    'ambiguos', v_ambiguos,
    'divergentes_merge', v_divergentes_merge);
END;
$$;


--
-- Name: fn_propagar_saldo_dezembro(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_propagar_saldo_dezembro() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_fazenda_id UUID;
  v_ano INTEGER;
  v_categoria RECORD;
  v_saldo_final RECORD;
BEGIN
  -- Só executa ao fechar Dezembro (mes=12)
  IF NEW.status = 'fechado' AND OLD.status = 'aberto' THEN
    -- Busca o fechamento de pasto P1 de dezembro para calcular saldo
    -- (lógica simplificada - ajustar conforme regras do negócio)
    NULL; -- placeholder para lógica real
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_reativar_vinculo_extrato(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reativar_vinculo_extrato(p_extrato_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_cbi record; v_na int; v_nm int; v_cli uuid;
BEGIN
  SELECT count(*) INTO v_na FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;
  IF v_na > 0 THEN
    RAISE EXCEPTION 'extrato % ja possui vinculo ativo; reativar bloqueado', p_extrato_id;
  END IF;

  SELECT count(*) INTO v_nm FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NOT NULL
     AND desfeito_motivo = 'desfeito_manual';
  IF v_nm = 0 THEN
    RAISE EXCEPTION 'extrato % nao possui vinculo desfeito_manual para reativar', p_extrato_id;
  END IF;
  IF v_nm > 1 THEN
    RAISE EXCEPTION 'extrato % possui % vinculos desfeito_manual; reativar bloqueado por seguranca', p_extrato_id, v_nm;
  END IF;

  SELECT * INTO v_cbi FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NOT NULL
     AND desfeito_motivo = 'desfeito_manual';

  UPDATE conciliacao_bancaria_itens
     SET desfeito_em = NULL, desfeito_por = NULL, desfeito_motivo = NULL
   WHERE id = v_cbi.id;

  UPDATE extrato_bancario_v2 SET status = 'conciliado' WHERE id = p_extrato_id;

  SELECT cliente_id INTO v_cli FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  INSERT INTO conciliacao_audit_log
    (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
  VALUES ('conciliacao_criada', auth.uid(), v_cli, p_extrato_id,
          v_cbi.lancamento_id, v_cbi.id, 'reativacao_manual',
          jsonb_build_object('status','conciliado','valor_aplicado', v_cbi.valor_aplicado));
  RETURN 'conciliado';
END $$;


--
-- Name: fn_reconciliar_financiamento(uuid, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reconciliar_financiamento(p_financiamento_id uuid, p_dry_run boolean DEFAULT true, p_recalcula_vt boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_contrato financiamentos%ROWTYPE;
  v_parcela_id uuid;
  v_r jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_qtd_parcelas int := 0;
  v_qtd_reconc int := 0;
  v_qtd_com_acoes int := 0;
  v_qtd_com_alertas int := 0;
  v_total_acoes int := 0;
  v_total_alertas int := 0;
  v_qa int;
  v_ql int;
BEGIN
  SELECT * INTO v_contrato FROM financiamentos WHERE id = p_financiamento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro','contrato_nao_encontrado','financiamento_id',p_financiamento_id);
  END IF;

  FOR v_parcela_id IN
    SELECT id FROM financiamento_parcelas
    WHERE financiamento_id = p_financiamento_id
      AND status <> 'cancelado'
    ORDER BY numero_parcela
  LOOP
    v_r := fn_reconciliar_parcela_financiamento(v_parcela_id, p_dry_run, p_recalcula_vt);
    v_resultados := v_resultados || v_r;
    v_qtd_parcelas := v_qtd_parcelas + 1;
    
    v_qa := COALESCE((v_r->'resumo'->>'qtd_acoes')::int, 0);
    v_ql := COALESCE((v_r->'resumo'->>'qtd_alertas')::int, 0);
    
    IF COALESCE((v_r->'resumo'->>'reconciliada')::boolean, false) THEN
      v_qtd_reconc := v_qtd_reconc + 1;
    END IF;
    IF v_qa > 0 THEN v_qtd_com_acoes := v_qtd_com_acoes + 1; END IF;
    IF v_ql > 0 THEN v_qtd_com_alertas := v_qtd_com_alertas + 1; END IF;
    v_total_acoes := v_total_acoes + v_qa;
    v_total_alertas := v_total_alertas + v_ql;
  END LOOP;

  RETURN jsonb_build_object(
    'financiamento_id', p_financiamento_id,
    'numero_contrato', v_contrato.numero_contrato,
    'descricao', v_contrato.descricao,
    'cliente_id', v_contrato.cliente_id,
    'tipo', v_contrato.tipo_financiamento,
    'status_contrato', v_contrato.status,
    'dry_run', p_dry_run,
    'p_recalcula_vt', p_recalcula_vt,
    'resumo', jsonb_build_object(
      'qtd_parcelas', v_qtd_parcelas,
      'qtd_reconciliadas', v_qtd_reconc,
      'qtd_com_acoes', v_qtd_com_acoes,
      'qtd_com_alertas', v_qtd_com_alertas,
      'total_acoes', v_total_acoes,
      'total_alertas', v_total_alertas
    ),
    'resultados', v_resultados
  );
END;
$$;


--
-- Name: fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reconciliar_parcela_financiamento(p_parcela_id uuid, p_dry_run boolean DEFAULT true, p_recalcula_vt boolean DEFAULT false, p_conta_bancaria_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$




DECLARE
  v_parcela financiamento_parcelas%ROWTYPE;
  v_contrato financiamentos%ROWTYPE;
  v_lanc_p financeiro_lancamentos_v2%ROWTYPE;
  v_lanc_j financeiro_lancamentos_v2%ROWTYPE;
  v_lixo financeiro_lancamentos_v2%ROWTYPE;
  v_found_p boolean := false;
  v_found_j boolean := false;
  v_plano_p_id uuid;
  v_plano_j_id uuid;
  v_status text;
  v_data_pag date;
  v_vt_calc numeric;
  v_acoes jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_today date := CURRENT_DATE;
  v_desc_p text;
  v_desc_j text;
  v_novo_p jsonb;
  v_novo_j jsonb;
  v_lixo_acao text;
  v_lixo_motivo text;
  -- exec
  v_executado jsonb := '{}'::jsonb;
  v_acao_iter jsonb;
  v_acao_tipo text;
  v_novo jsonb;
  v_new_id uuid;
  v_alvo uuid;
  v_campo text;
  v_depois text;
  v_ids_criados jsonb := '[]'::jsonb;
  v_ids_atualizados jsonb := '[]'::jsonb;
  v_ids_cancelados jsonb := '[]'::jsonb;
  v_parcela_updates jsonb := '{}'::jsonb;
  v_acoes_executadas jsonb := '[]'::jsonb;
  v_audit_tag text;
  v_tipo_op_p text;
  v_tipo_op_j text;
  v_rc int;
  v_conta_desejada uuid;   -- PR-FIN-CPR-01: conta alvo (override do operador → fallback contrato)
BEGIN
  SELECT * INTO v_parcela FROM financiamento_parcelas WHERE id = p_parcela_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro','parcela_nao_encontrada','parcela_id',p_parcela_id);
  END IF;
  IF v_parcela.status = 'cancelado' THEN
    RETURN jsonb_build_object('skip','parcela_cancelada','parcela_id',p_parcela_id);
  END IF;

  SELECT * INTO v_contrato FROM financiamentos WHERE id = v_parcela.financiamento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro','contrato_nao_encontrado',
      'financiamento_id',v_parcela.financiamento_id,'parcela_id',p_parcela_id);
  END IF;

  -- PR-FIN-CPR-01 (1a): conta desejada = override do operador → fallback do contrato.
  v_conta_desejada := COALESCE(p_conta_bancaria_id, v_contrato.conta_bancaria_id);

  IF v_contrato.tipo_financiamento = 'pecuaria' THEN
    v_plano_p_id := '0d42d354-926a-4a10-ab3a-f082adaef972'::uuid;
    v_plano_j_id := '5d4a5c70-311d-4302-98f0-b2846d9738fc'::uuid;
  ELSIF v_contrato.tipo_financiamento = 'agricultura' THEN
    v_plano_p_id := '576eb57d-5fb6-4461-9614-a9268b9a50fb'::uuid;
    v_plano_j_id := '0c489373-7035-4b89-8fb4-42ac42796fa5'::uuid;
  ELSE
    v_alertas := v_alertas || jsonb_build_object('tipo','tipo_financiamento_invalido',
      'valor',v_contrato.tipo_financiamento);
  END IF;

  -- Le tipo_operacao oficial dos planos (UTF-8 limpo, fonte soberana)
  SELECT tipo_operacao INTO v_tipo_op_p FROM financeiro_plano_contas WHERE id = v_plano_p_id;
  SELECT tipo_operacao INTO v_tipo_op_j FROM financeiro_plano_contas WHERE id = v_plano_j_id;
  IF v_tipo_op_p IS NULL OR v_tipo_op_j IS NULL THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo','plano_conta_sem_tipo_operacao',
      'plano_p_id', v_plano_p_id, 'plano_p_tipo_op', v_tipo_op_p,
      'plano_j_id', v_plano_j_id, 'plano_j_tipo_op', v_tipo_op_j
    );
  END IF;

  v_status := CASE
    WHEN v_parcela.status = 'pago' THEN 'realizado'
    WHEN v_parcela.status = 'pendente' AND v_parcela.data_vencimento > v_today THEN 'programado'
    WHEN v_parcela.status = 'pendente' AND v_parcela.data_vencimento <= v_today THEN 'previsto'
    ELSE 'pendente'
  END;
  v_data_pag := CASE
    WHEN v_status = 'realizado' THEN v_parcela.data_pagamento
    ELSE v_parcela.data_vencimento
  END;
  v_desc_p := 'Amortiza' || chr(231) || chr(227) || 'o ' || COALESCE(v_contrato.descricao,'') || ' ' || COALESCE(v_contrato.numero_contrato,'');
  v_desc_j := 'Juros ' || COALESCE(v_contrato.descricao,'') || ' ' || COALESCE(v_contrato.numero_contrato,'');

  v_vt_calc := COALESCE(v_parcela.valor_principal,0) + COALESCE(v_parcela.valor_juros,0);
  IF ROUND(COALESCE(v_parcela.valor_total,0)::numeric, 2) <> ROUND(v_vt_calc::numeric, 2) THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','vt_divergente',
      'vt_cadastrado',v_parcela.valor_total,'vt_calculado',v_vt_calc,
      'diff', v_parcela.valor_total - v_vt_calc);
    IF p_recalcula_vt THEN
      v_acoes := v_acoes || jsonb_build_object('acao','recalcular_vt_parcela',
        'parcela_id',v_parcela.id,'vt_antes',v_parcela.valor_total,'vt_depois',v_vt_calc);
    END IF;
  END IF;

  IF v_status = 'realizado' AND v_parcela.data_pagamento IS NULL THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','pago_sem_data_pagamento');
  END IF;

  IF v_parcela.lancamento_id IS NOT NULL
     AND v_parcela.lancamento_id = v_parcela.lancamento_juros_id THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','fk_redundante',
      'lanc_compartilhado',v_parcela.lancamento_id);
  END IF;

  v_novo_p := jsonb_build_object(
    'valor', v_parcela.valor_principal,
    'descricao', v_desc_p,
    'data_pagamento', v_data_pag,
    'data_competencia', v_contrato.data_contrato,
    'status_transacao', v_status,
    'sinal','-1',
    'tipo_operacao', v_tipo_op_p,
    'plano_conta_id', v_plano_p_id,
    'favorecido_id', v_contrato.credor_id,
    'financiamento_id', v_parcela.financiamento_id,
    'origem_lancamento','parcela_financiamento',
    'origem_tipo','parcela_principal',
    'conta_bancaria_id', COALESCE(p_conta_bancaria_id, v_contrato.conta_bancaria_id),
    'cliente_id', v_contrato.cliente_id,
    'fazenda_id', v_contrato.fazenda_id,
    'cenario','realizado',
    'cancelado',false,
    'observacao', 'parcela:' || v_parcela.id::text || ':parcela_principal'
  );
  v_novo_j := jsonb_build_object(
    'valor', v_parcela.valor_juros,
    'descricao', v_desc_j,
    'data_pagamento', v_data_pag,
    'data_competencia', v_contrato.data_contrato,
    'status_transacao', v_status,
    'sinal','-1',
    'tipo_operacao', v_tipo_op_j,
    'plano_conta_id', v_plano_j_id,
    'favorecido_id', v_contrato.credor_id,
    'financiamento_id', v_parcela.financiamento_id,
    'origem_lancamento','parcela_financiamento',
    'origem_tipo','parcela_juros',
    'conta_bancaria_id', COALESCE(p_conta_bancaria_id, v_contrato.conta_bancaria_id),
    'cliente_id', v_contrato.cliente_id,
    'fazenda_id', v_contrato.fazenda_id,
    'cenario','realizado',
    'cancelado',false,
    'observacao', 'parcela:' || v_parcela.id::text || ':parcela_juros'
  );

  IF COALESCE(v_parcela.valor_principal,0) > 0 THEN
    v_found_p := false;
    IF v_parcela.lancamento_id IS NOT NULL
       AND v_parcela.lancamento_id IS DISTINCT FROM v_parcela.lancamento_juros_id THEN
      SELECT * INTO v_lanc_p FROM financeiro_lancamentos_v2
        WHERE id = v_parcela.lancamento_id AND cancelado = false;
      v_found_p := FOUND;
    END IF;

    -- C1: lookup por observacao quando FK nao apontou para registro valido (orfao oficial)
    IF NOT v_found_p THEN
      SELECT * INTO v_lanc_p FROM financeiro_lancamentos_v2
        WHERE observacao = 'parcela:' || v_parcela.id::text || ':parcela_principal'
          AND cancelado = false
          AND financiamento_id = v_contrato.id
          AND origem_lancamento = 'parcela_financiamento'
          AND origem_tipo = 'parcela_principal'
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        LIMIT 1;
      IF FOUND THEN
        v_found_p := true;
        v_acoes := v_acoes || jsonb_build_object(
          'acao','re_vincular_principal',
          'motivo','orfao_oficial_recuperado_por_observacao',
          'lanc_id', v_lanc_p.id::text
        );
      END IF;
    END IF;

    IF NOT v_found_p THEN
      v_acoes := v_acoes || jsonb_build_object('acao','criar_principal',
        'motivo', CASE
          WHEN v_parcela.lancamento_id IS NULL THEN 'lancamento_id_ausente'
          WHEN v_parcela.lancamento_id = v_parcela.lancamento_juros_id THEN 'fk_redundante_com_juros'
          ELSE 'lanc_atual_cancelado_ou_inexistente'
        END,
        'novo_lancamento', v_novo_p,
        'parcela_update', jsonb_build_object('lancamento_id','<new_id>'));
    ELSIF v_lanc_p.origem_tipo IS DISTINCT FROM 'parcela_principal'
          OR v_lanc_p.origem_lancamento IS DISTINCT FROM 'parcela_financiamento' THEN
      v_acoes := v_acoes
        || jsonb_build_object('acao','cancelar_lanc_atual','lanc_id', v_lanc_p.id,
             'valor', v_lanc_p.valor,
             'origem_lancamento_atual', v_lanc_p.origem_lancamento,
             'origem_tipo_atual', v_lanc_p.origem_tipo,
             'motivo','origem_invalida_para_principal')
        || jsonb_build_object('acao','criar_principal','motivo','substituir_lanc_invalido',
             'novo_lancamento', v_novo_p,
             'parcela_update', jsonb_build_object('lancamento_id','<new_id>'));
    ELSE
      IF ROUND(v_lanc_p.valor::numeric,2) <> ROUND(v_parcela.valor_principal::numeric,2) THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','valor',
          'antes',v_lanc_p.valor,'depois',v_parcela.valor_principal);
      END IF;
      IF v_lanc_p.favorecido_id IS DISTINCT FROM v_contrato.credor_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','favorecido_id',
          'antes',v_lanc_p.favorecido_id,'depois',v_contrato.credor_id);
      END IF;
      IF v_lanc_p.status_transacao IS DISTINCT FROM v_status THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','status_transacao',
          'antes',v_lanc_p.status_transacao,'depois',v_status);
      END IF;
      IF v_lanc_p.data_pagamento IS DISTINCT FROM v_data_pag THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','data_pagamento',
          'antes',v_lanc_p.data_pagamento,'depois',v_data_pag);
      END IF;
      IF v_lanc_p.financiamento_id IS DISTINCT FROM v_parcela.financiamento_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','financiamento_id',
          'antes',v_lanc_p.financiamento_id,'depois',v_parcela.financiamento_id);
      END IF;
      IF v_lanc_p.plano_conta_id IS DISTINCT FROM v_plano_p_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','plano_conta_id',
          'antes',v_lanc_p.plano_conta_id,'depois',v_plano_p_id);
      END IF;
      -- PR-FIN-CPR-01 (1b): propaga conta bancária no principal (nunca sobrescreve com NULL).
      IF v_conta_desejada IS NOT NULL
         AND v_lanc_p.conta_bancaria_id IS DISTINCT FROM v_conta_desejada THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id', v_lanc_p.id, 'campo','conta_bancaria_id',
          'antes', to_jsonb(v_lanc_p.conta_bancaria_id),
          'depois', to_jsonb(v_conta_desejada));
      END IF;
    END IF;
  ELSE
    IF v_parcela.lancamento_id IS NOT NULL THEN
      -- C5: cancelar lancamento atual ANTES de limpar FK (impede orfao)
      IF EXISTS (SELECT 1 FROM financeiro_lancamentos_v2
                 WHERE id = v_parcela.lancamento_id AND cancelado = false) THEN
        v_acoes := v_acoes || jsonb_build_object('acao','cancelar_lanc_atual',
          'motivo','vp_zero','lanc_id',v_parcela.lancamento_id);
      END IF;
      v_acoes := v_acoes || jsonb_build_object('acao','limpar_fk_principal',
        'motivo','vp_zero','lanc_id_atual',v_parcela.lancamento_id,
        'parcela_update', jsonb_build_object('lancamento_id', null));
    END IF;
  END IF;

  IF COALESCE(v_parcela.valor_juros,0) > 0 THEN
    v_found_j := false;
    IF v_parcela.lancamento_juros_id IS NOT NULL THEN
      SELECT * INTO v_lanc_j FROM financeiro_lancamentos_v2
        WHERE id = v_parcela.lancamento_juros_id AND cancelado = false;
      v_found_j := FOUND;
    END IF;

    -- C1: lookup por observacao quando FK nao apontou para registro valido (orfao oficial)
    IF NOT v_found_j THEN
      SELECT * INTO v_lanc_j FROM financeiro_lancamentos_v2
        WHERE observacao = 'parcela:' || v_parcela.id::text || ':parcela_juros'
          AND cancelado = false
          AND financiamento_id = v_contrato.id
          AND origem_lancamento = 'parcela_financiamento'
          AND origem_tipo = 'parcela_juros'
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        LIMIT 1;
      IF FOUND THEN
        v_found_j := true;
        v_acoes := v_acoes || jsonb_build_object(
          'acao','re_vincular_juros',
          'motivo','orfao_oficial_recuperado_por_observacao',
          'lanc_id', v_lanc_j.id::text
        );
      END IF;
    END IF;

    IF NOT v_found_j THEN
      v_acoes := v_acoes || jsonb_build_object('acao','criar_juros',
        'motivo', CASE
          WHEN v_parcela.lancamento_juros_id IS NULL THEN 'lancamento_juros_id_ausente'
          ELSE 'lanc_juros_atual_cancelado_ou_inexistente'
        END,
        'novo_lancamento', v_novo_j,
        'parcela_update', jsonb_build_object('lancamento_juros_id','<new_id>'));
    ELSIF v_lanc_j.origem_tipo IS DISTINCT FROM 'parcela_juros'
          OR v_lanc_j.origem_lancamento IS DISTINCT FROM 'parcela_financiamento' THEN
      v_acoes := v_acoes
        || jsonb_build_object('acao','cancelar_lanc_atual','lanc_id', v_lanc_j.id,
             'valor', v_lanc_j.valor,
             'origem_lancamento_atual', v_lanc_j.origem_lancamento,
             'origem_tipo_atual', v_lanc_j.origem_tipo,
             'motivo','origem_invalida_para_juros')
        || jsonb_build_object('acao','criar_juros','motivo','substituir_lanc_invalido',
             'novo_lancamento', v_novo_j,
             'parcela_update', jsonb_build_object('lancamento_juros_id','<new_id>'));
    ELSE
      IF ROUND(v_lanc_j.valor::numeric,2) <> ROUND(v_parcela.valor_juros::numeric,2) THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','valor',
          'antes',v_lanc_j.valor,'depois',v_parcela.valor_juros);
      END IF;
      IF v_lanc_j.favorecido_id IS DISTINCT FROM v_contrato.credor_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','favorecido_id',
          'antes',v_lanc_j.favorecido_id,'depois',v_contrato.credor_id);
      END IF;
      IF v_lanc_j.status_transacao IS DISTINCT FROM v_status THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','status_transacao',
          'antes',v_lanc_j.status_transacao,'depois',v_status);
      END IF;
      IF v_lanc_j.data_pagamento IS DISTINCT FROM v_data_pag THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','data_pagamento',
          'antes',v_lanc_j.data_pagamento,'depois',v_data_pag);
      END IF;
      IF v_lanc_j.financiamento_id IS DISTINCT FROM v_parcela.financiamento_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','financiamento_id',
          'antes',v_lanc_j.financiamento_id,'depois',v_parcela.financiamento_id);
      END IF;
      IF v_lanc_j.plano_conta_id IS DISTINCT FROM v_plano_j_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','plano_conta_id',
          'antes',v_lanc_j.plano_conta_id,'depois',v_plano_j_id);
      END IF;
      -- PR-FIN-CPR-01 (1c): propaga conta bancária nos juros (nunca sobrescreve com NULL).
      IF v_conta_desejada IS NOT NULL
         AND v_lanc_j.conta_bancaria_id IS DISTINCT FROM v_conta_desejada THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id', v_lanc_j.id, 'campo','conta_bancaria_id',
          'antes', to_jsonb(v_lanc_j.conta_bancaria_id),
          'depois', to_jsonb(v_conta_desejada));
      END IF;
    END IF;
  ELSE
    IF v_parcela.lancamento_juros_id IS NOT NULL THEN
      -- C5: cancelar lancamento atual ANTES de limpar FK (impede orfao)
      IF EXISTS (SELECT 1 FROM financeiro_lancamentos_v2
                 WHERE id = v_parcela.lancamento_juros_id AND cancelado = false) THEN
        v_acoes := v_acoes || jsonb_build_object('acao','cancelar_lanc_atual',
          'motivo','vj_zero','lanc_id',v_parcela.lancamento_juros_id);
      END IF;
      v_acoes := v_acoes || jsonb_build_object('acao','limpar_fk_juros',
        'motivo','vj_zero','lanc_id_atual',v_parcela.lancamento_juros_id,
        'parcela_update', jsonb_build_object('lancamento_juros_id', null));
    END IF;
  END IF;

  FOR v_lixo IN
    SELECT * FROM financeiro_lancamentos_v2 lv
    WHERE lv.cancelado = false
      AND lv.id IS DISTINCT FROM v_parcela.lancamento_id
      AND lv.id IS DISTINCT FROM v_parcela.lancamento_juros_id
      AND (
        (
          lv.financiamento_id = v_parcela.financiamento_id
          AND lv.origem_lancamento = 'financiamento'
          AND lv.origem_tipo = 'financiamento_parcela'
          AND lv.data_pagamento = COALESCE(v_parcela.data_pagamento, v_parcela.data_vencimento)
        )
        OR
        (
          lv.observacao = v_parcela.id::text
          AND lv.origem_lancamento = 'parcela_financiamento'
          AND lv.origem_tipo IN ('parcela_principal','parcela_juros')
        )
      )
  LOOP
    IF v_lixo.origem_lancamento = 'financiamento' AND v_lixo.origem_tipo = 'financiamento_parcela' THEN
      v_lixo_acao := 'cancelar_totalizado_relacionado';
      v_lixo_motivo := 'origem_financiamento_parcela_substituida';
    ELSE
      v_lixo_acao := 'cancelar_lanc_legado_observacao_parcela';
      v_lixo_motivo := 'observacao_parcela_legada_orfa';
    END IF;
    v_acoes := v_acoes || jsonb_build_object(
      'acao', v_lixo_acao,
      'lanc_id', v_lixo.id,
      'valor', v_lixo.valor,
      'origem_lancamento_atual', v_lixo.origem_lancamento,
      'origem_tipo_atual', v_lixo.origem_tipo,
      'observacao_atual', v_lixo.observacao,
      'motivo', v_lixo_motivo);
  END LOOP;

  -- BLOCO DE EXECUCAO REAL
  IF NOT p_dry_run THEN
    v_audit_tag := '[motor:' || to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS') || ':parcela:' || v_parcela.id::text || ']';
    BEGIN
      FOR v_acao_iter IN SELECT * FROM jsonb_array_elements(v_acoes)
      LOOP
        v_acao_tipo := v_acao_iter->>'acao';

        IF v_acao_tipo = 'criar_principal' THEN
          v_novo := v_acao_iter->'novo_lancamento';
          INSERT INTO financeiro_lancamentos_v2 (
            valor, descricao, data_pagamento, data_competencia, ano_mes, status_transacao,
            sinal, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro,
            escopo_negocio, plano_conta_id, favorecido_id, financiamento_id,
            origem_lancamento, origem_tipo, conta_bancaria_id, cliente_id, fazenda_id,
            cenario, cancelado, observacao, sem_movimentacao_caixa
          ) VALUES (
            (v_novo->>'valor')::numeric,
            v_novo->>'descricao',
            (v_novo->>'data_pagamento')::date,
            (v_novo->>'data_competencia')::date,
            to_char((v_novo->>'data_pagamento')::date, 'YYYY-MM'),
            v_novo->>'status_transacao',
            v_novo->>'sinal', v_novo->>'tipo_operacao',
            v_novo->>'macro_custo', v_novo->>'grupo_custo',
            v_novo->>'centro_custo', v_novo->>'subcentro',
            v_novo->>'escopo_negocio',
            NULLIF(v_novo->>'plano_conta_id','')::uuid,
            NULLIF(v_novo->>'favorecido_id','')::uuid,
            NULLIF(v_novo->>'financiamento_id','')::uuid,
            v_novo->>'origem_lancamento', v_novo->>'origem_tipo',
            NULLIF(v_novo->>'conta_bancaria_id','')::uuid,
            NULLIF(v_novo->>'cliente_id','')::uuid,
            NULLIF(v_novo->>'fazenda_id','')::uuid,
            v_novo->>'cenario',
            (v_novo->>'cancelado')::boolean,
            v_novo->>'observacao',
            false
          ) RETURNING id INTO v_new_id;
          UPDATE financiamento_parcelas SET lancamento_id = v_new_id WHERE id = p_parcela_id;
          v_ids_criados := v_ids_criados || jsonb_build_object('tipo','principal','id',v_new_id::text,'valor',(v_novo->>'valor')::numeric);
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_id', v_new_id::text);

        ELSIF v_acao_tipo = 'criar_juros' THEN
          v_novo := v_acao_iter->'novo_lancamento';
          INSERT INTO financeiro_lancamentos_v2 (
            valor, descricao, data_pagamento, data_competencia, ano_mes, status_transacao,
            sinal, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro,
            escopo_negocio, plano_conta_id, favorecido_id, financiamento_id,
            origem_lancamento, origem_tipo, conta_bancaria_id, cliente_id, fazenda_id,
            cenario, cancelado, observacao, sem_movimentacao_caixa
          ) VALUES (
            (v_novo->>'valor')::numeric,
            v_novo->>'descricao',
            (v_novo->>'data_pagamento')::date,
            (v_novo->>'data_competencia')::date,
            to_char((v_novo->>'data_pagamento')::date, 'YYYY-MM'),
            v_novo->>'status_transacao',
            v_novo->>'sinal', v_novo->>'tipo_operacao',
            v_novo->>'macro_custo', v_novo->>'grupo_custo',
            v_novo->>'centro_custo', v_novo->>'subcentro',
            v_novo->>'escopo_negocio',
            NULLIF(v_novo->>'plano_conta_id','')::uuid,
            NULLIF(v_novo->>'favorecido_id','')::uuid,
            NULLIF(v_novo->>'financiamento_id','')::uuid,
            v_novo->>'origem_lancamento', v_novo->>'origem_tipo',
            NULLIF(v_novo->>'conta_bancaria_id','')::uuid,
            NULLIF(v_novo->>'cliente_id','')::uuid,
            NULLIF(v_novo->>'fazenda_id','')::uuid,
            v_novo->>'cenario',
            (v_novo->>'cancelado')::boolean,
            v_novo->>'observacao',
            false
          ) RETURNING id INTO v_new_id;
          UPDATE financiamento_parcelas SET lancamento_juros_id = v_new_id WHERE id = p_parcela_id;
          v_ids_criados := v_ids_criados || jsonb_build_object('tipo','juros','id',v_new_id::text,'valor',(v_novo->>'valor')::numeric);
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_juros_id', v_new_id::text);

        ELSIF v_acao_tipo IN ('atualizar_principal','atualizar_juros') THEN
          v_alvo := (v_acao_iter->>'lanc_id')::uuid;
          v_campo := v_acao_iter->>'campo';
          v_depois := v_acao_iter->>'depois';
          IF v_campo = 'valor' THEN
            UPDATE financeiro_lancamentos_v2 SET valor = NULLIF(v_depois,'')::numeric WHERE id = v_alvo;
          ELSIF v_campo = 'favorecido_id' THEN
            UPDATE financeiro_lancamentos_v2 SET favorecido_id = NULLIF(v_depois,'')::uuid WHERE id = v_alvo;
          ELSIF v_campo = 'status_transacao' THEN
            UPDATE financeiro_lancamentos_v2 SET status_transacao = v_depois WHERE id = v_alvo;
          ELSIF v_campo = 'data_pagamento' THEN
            UPDATE financeiro_lancamentos_v2 SET data_pagamento = NULLIF(v_depois,'')::date, ano_mes = to_char(NULLIF(v_depois,'')::date, 'YYYY-MM') WHERE id = v_alvo;
          ELSIF v_campo = 'financiamento_id' THEN
            UPDATE financeiro_lancamentos_v2 SET financiamento_id = NULLIF(v_depois,'')::uuid WHERE id = v_alvo;
          ELSIF v_campo = 'plano_conta_id' THEN
            UPDATE financeiro_lancamentos_v2 SET plano_conta_id = NULLIF(v_depois,'')::uuid WHERE id = v_alvo;
          ELSIF v_campo = 'conta_bancaria_id' THEN
            UPDATE financeiro_lancamentos_v2 SET conta_bancaria_id = NULLIF(v_depois,'')::uuid WHERE id = v_alvo;
          END IF;
          v_ids_atualizados := v_ids_atualizados || jsonb_build_object(
            'id', v_alvo::text, 'campo', v_campo,
            'antes', v_acao_iter->'antes', 'depois', v_acao_iter->'depois');

        ELSIF v_acao_tipo IN ('cancelar_lanc_atual','cancelar_totalizado_relacionado','cancelar_lanc_legado_observacao_parcela') THEN
          v_alvo := (v_acao_iter->>'lanc_id')::uuid;
          UPDATE financeiro_lancamentos_v2
            SET cancelado = true,
                observacao = v_audit_tag || ' cancel:' || (v_acao_iter->>'motivo') || ' | ' || COALESCE(observacao,'')
            WHERE id = v_alvo AND cancelado = false;
          GET DIAGNOSTICS v_rc = ROW_COUNT;
          IF v_rc <> 1 THEN
            RAISE EXCEPTION 'cancelamento_falhou lanc_id=% rc=% acao_tipo=%', v_alvo, v_rc, v_acao_tipo
              USING HINT = 'Nao limpar FK enquanto cancelamento nao confirmado';
          END IF;
          v_ids_cancelados := v_ids_cancelados || jsonb_build_object(
            'id', v_alvo::text, 'motivo', v_acao_iter->>'motivo',
            'valor', v_acao_iter->'valor', 'acao_origem', v_acao_tipo);

        ELSIF v_acao_tipo = 're_vincular_principal' THEN
          v_alvo := (v_acao_iter->>'lanc_id')::uuid;
          UPDATE financiamento_parcelas SET lancamento_id = v_alvo WHERE id = p_parcela_id;
          GET DIAGNOSTICS v_rc = ROW_COUNT;
          IF v_rc <> 1 THEN
            RAISE EXCEPTION 're_vincular_principal_falhou parcela=% lanc=% rc=%', p_parcela_id, v_alvo, v_rc;
          END IF;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_id', v_alvo::text);

        ELSIF v_acao_tipo = 're_vincular_juros' THEN
          v_alvo := (v_acao_iter->>'lanc_id')::uuid;
          UPDATE financiamento_parcelas SET lancamento_juros_id = v_alvo WHERE id = p_parcela_id;
          GET DIAGNOSTICS v_rc = ROW_COUNT;
          IF v_rc <> 1 THEN
            RAISE EXCEPTION 're_vincular_juros_falhou parcela=% lanc=% rc=%', p_parcela_id, v_alvo, v_rc;
          END IF;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_juros_id', v_alvo::text);

        ELSIF v_acao_tipo = 'limpar_fk_principal' THEN
          UPDATE financiamento_parcelas SET lancamento_id = NULL WHERE id = p_parcela_id;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_id', null);

        ELSIF v_acao_tipo = 'limpar_fk_juros' THEN
          UPDATE financiamento_parcelas SET lancamento_juros_id = NULL WHERE id = p_parcela_id;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_juros_id', null);

        ELSIF v_acao_tipo = 'recalcular_vt_parcela' THEN
          UPDATE financiamento_parcelas
            SET valor_total = (v_acao_iter->>'vt_depois')::numeric
            WHERE id = p_parcela_id;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('valor_total', (v_acao_iter->>'vt_depois')::numeric);
        END IF;

        v_acoes_executadas := v_acoes_executadas || v_acao_iter;
      END LOOP;

      v_executado := jsonb_build_object(
        'status','sucesso',
        'audit_tag', v_audit_tag,
        'qtd_acoes_executadas', jsonb_array_length(v_acoes_executadas),
        'ids_criados', v_ids_criados,
        'ids_atualizados', v_ids_atualizados,
        'ids_cancelados', v_ids_cancelados,
        'parcela_updates', v_parcela_updates
      );

    EXCEPTION
      WHEN OTHERS THEN
        RAISE;
    END;
  END IF;

  RETURN jsonb_build_object(
    'parcela_id', p_parcela_id,
    'financiamento_id', v_parcela.financiamento_id,
    'contrato', jsonb_build_object(
      'numero_contrato', v_contrato.numero_contrato,
      'descricao', v_contrato.descricao,
      'tipo', v_contrato.tipo_financiamento,
      'credor_id', v_contrato.credor_id),
    'parcela', jsonb_build_object(
      'numero_parcela', v_parcela.numero_parcela,
      'valor_principal', v_parcela.valor_principal,
      'valor_juros', v_parcela.valor_juros,
      'valor_total_cadastrado', v_parcela.valor_total,
      'valor_total_calculado', v_vt_calc,
      'status_parcela', v_parcela.status,
      'data_vencimento', v_parcela.data_vencimento,
      'data_pagamento_parcela', v_parcela.data_pagamento),
    'inputs_resolvidos', jsonb_build_object(
      'status_transacao', v_status,
      'data_pagamento_lanc', v_data_pag,
      'plano_conta_principal', v_plano_p_id,
      'plano_conta_juros', v_plano_j_id),
    'dry_run', p_dry_run,
    'p_recalcula_vt', p_recalcula_vt,
    'alertas', v_alertas,
    'acoes', v_acoes,
    'executado', v_executado,
    'resumo', jsonb_build_object(
      'qtd_acoes', jsonb_array_length(v_acoes),
      'qtd_alertas', jsonb_array_length(v_alertas),
      'reconciliada', (jsonb_array_length(v_acoes) = 0 AND jsonb_array_length(v_alertas) = 0))
  );
END;




$$;


--
-- Name: fn_reconciliar_todos_financiamentos(uuid, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reconciliar_todos_financiamentos(p_cliente_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true, p_recalcula_vt boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_fin_id uuid;
  v_r jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_qtd_fin int := 0;
  v_qtd_parc int := 0;
  v_qtd_fin_acoes int := 0;
  v_qtd_fin_alertas int := 0;
  v_total_acoes int := 0;
  v_total_alertas int := 0;
  v_qtd_parc_reconc int := 0;
BEGIN
  FOR v_fin_id IN
    SELECT id FROM financiamentos
    WHERE status IN ('ativo','quitado')
      AND (p_cliente_id IS NULL OR cliente_id = p_cliente_id)
    ORDER BY cliente_id, data_contrato
  LOOP
    v_r := fn_reconciliar_financiamento(v_fin_id, p_dry_run, p_recalcula_vt);
    v_resultados := v_resultados || v_r;
    v_qtd_fin := v_qtd_fin + 1;
    v_qtd_parc := v_qtd_parc + COALESCE((v_r->'resumo'->>'qtd_parcelas')::int, 0);
    v_qtd_parc_reconc := v_qtd_parc_reconc + COALESCE((v_r->'resumo'->>'qtd_reconciliadas')::int, 0);
    v_total_acoes := v_total_acoes + COALESCE((v_r->'resumo'->>'total_acoes')::int, 0);
    v_total_alertas := v_total_alertas + COALESCE((v_r->'resumo'->>'total_alertas')::int, 0);
    
    IF COALESCE((v_r->'resumo'->>'total_acoes')::int, 0) > 0 THEN
      v_qtd_fin_acoes := v_qtd_fin_acoes + 1;
    END IF;
    IF COALESCE((v_r->'resumo'->>'total_alertas')::int, 0) > 0 THEN
      v_qtd_fin_alertas := v_qtd_fin_alertas + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'cliente_id_filtro', p_cliente_id,
    'dry_run', p_dry_run,
    'p_recalcula_vt', p_recalcula_vt,
    'resumo_global', jsonb_build_object(
      'qtd_financiamentos', v_qtd_fin,
      'qtd_parcelas', v_qtd_parc,
      'qtd_parcelas_reconciliadas', v_qtd_parc_reconc,
      'qtd_financiamentos_com_acoes', v_qtd_fin_acoes,
      'qtd_financiamentos_com_alertas', v_qtd_fin_alertas,
      'total_acoes', v_total_acoes,
      'total_alertas', v_total_alertas
    ),
    'resultados', v_resultados
  );
END;
$$;


--
-- Name: fn_reverter_desconsideracao_extrato(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reverter_desconsideracao_extrato(p_extrato_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ext     record;
  v_alvo    text;
  v_tem_cbi boolean;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'extrato % nao encontrado', p_extrato_id;
  END IF;

  IF v_ext.status IS DISTINCT FROM 'ignorado' THEN
    RAISE EXCEPTION 'extrato % nao esta desconsiderado (status atual: %)',
      p_extrato_id, v_ext.status;
  END IF;

  v_tem_cbi := EXISTS(
    SELECT 1 FROM conciliacao_bancaria_itens
    WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL
  );

  v_alvo := CASE WHEN v_tem_cbi THEN 'conciliado' ELSE 'nao_conciliado' END;

  UPDATE extrato_bancario_v2
     SET status = v_alvo,
         ignorado_em = NULL, ignorado_por = NULL, ignorado_motivo = NULL
   WHERE id = p_extrato_id;

  RETURN v_alvo;
END
$$;


--
-- Name: fn_saldo_inicial_pasto(uuid, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_saldo_inicial_pasto(p_fazenda_id uuid, p_ano integer, p_mes integer, p_categoria_codigo text) RETURNS TABLE(quantidade integer, peso_medio_kg numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ano_anterior int;
  v_mes_anterior int;
  v_ano_mes_anterior text;
  v_has_fechamento boolean;
BEGIN
  -- Calcula competência anterior
  IF p_mes = 1 THEN
    v_ano_anterior := p_ano - 1;
    v_mes_anterior := 12;
  ELSE
    v_ano_anterior := p_ano;
    v_mes_anterior := p_mes - 1;
  END IF;

  v_ano_mes_anterior := v_ano_anterior::text || '-' || lpad(v_mes_anterior::text, 2, '0');

  -- Verifica se existe ALGUM pasto fechado no mês anterior
  SELECT EXISTS (
    SELECT 1
    FROM public.fechamento_pastos fp
    WHERE fp.fazenda_id = p_fazenda_id
      AND fp.ano_mes    = v_ano_mes_anterior
      AND fp.status     = 'fechado'
  ) INTO v_has_fechamento;

  -- Sem fechamento oficial → caller deve usar fallback
  IF NOT v_has_fechamento THEN
    quantidade    := 0;
    peso_medio_kg := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Soma TODOS os pastos fechados do mês anterior para a categoria
  SELECT
    COALESCE(SUM(fpi.quantidade), 0)::int,
    CASE
      WHEN COALESCE(SUM(fpi.quantidade), 0) > 0
      THEN ROUND(
        (SUM(COALESCE(fpi.peso_medio_kg, 0) * fpi.quantidade)
          / NULLIF(SUM(fpi.quantidade), 0))::numeric, 2)
      ELSE 0::numeric
    END
  INTO quantidade, peso_medio_kg
  FROM public.fechamento_pasto_itens fpi
  JOIN public.fechamento_pastos     fp ON fp.id = fpi.fechamento_id
  JOIN public.categorias_rebanho    cr ON cr.id = fpi.categoria_id
  WHERE fp.fazenda_id = p_fazenda_id
    AND fp.ano_mes    = v_ano_mes_anterior
    AND fp.status     = 'fechado'
    AND cr.codigo     = p_categoria_codigo;

  RETURN NEXT;
END;
$$;


--
-- Name: fn_snapshot_conciliacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_snapshot_conciliacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ DECLARE v_extrato RECORD; v_lanc RECORD; BEGIN SELECT id, valor, data_movimento, descricao INTO v_extrato FROM extrato_bancario_v2 WHERE id = NEW.extrato_id; SELECT id, valor, data_pagamento, favorecido_id INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id; NEW.snapshot_extrato_valor := v_extrato.valor; NEW.snapshot_extrato_data := v_extrato.data_movimento; NEW.snapshot_historico_banco := v_extrato.descricao; NEW.snapshot_lancamento_valor := v_lanc.valor; NEW.snapshot_lancamento_data := v_lanc.data_pagamento; NEW.snapshot_favorecido_id := v_lanc.favorecido_id; NEW.snapshot_flags_no_momento := jsonb_build_object('extrato_suspeita_valor', COALESCE((SELECT flag_suspeita_valor FROM extrato_bancario_v2 WHERE id = NEW.extrato_id), false), 'extrato_suspeita_fornecedor', COALESCE((SELECT flag_suspeita_fornecedor FROM extrato_bancario_v2 WHERE id = NEW.extrato_id), false), 'lanc_editado_manual', COALESCE((SELECT editado_manual FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id), false), 'lanc_orfao_definitivo', COALESCE((SELECT orfao_definitivo FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id), false)); NEW.aprovado_em := COALESCE(NEW.aprovado_em, now()); RETURN NEW; END $$;


--
-- Name: FUNCTION fn_snapshot_conciliacao(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_snapshot_conciliacao() IS 'Mesa Operacional v2. Preenche snapshots e aprovado_em no INSERT de conciliacao.
Preserva contexto histórico (princípio 9). Sem setting — sempre executa. Criada PR0.A.';


--
-- Name: fn_transferir_vinculo_extrato(uuid, uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_transferir_vinculo_extrato(p_extrato_origem uuid, p_extrato_destino uuid, p_lancamento_id uuid, p_valor_aplicado numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ext_o extrato_bancario_v2%ROWTYPE; v_ext_d extrato_bancario_v2%ROWTYPE; v_lan financeiro_lancamentos_v2%ROWTYPE;
  v_n_par int; v_cbi_o uuid; v_cbi_d uuid; v_cbi_existente uuid; v_valor numeric; v_soma numeric; v_status_o text; v_status_d text;
BEGIN
  SELECT * INTO v_ext_o FROM extrato_bancario_v2 WHERE id = p_extrato_origem;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato de origem inexistente: %', p_extrato_origem; END IF;
  SELECT * INTO v_ext_d FROM extrato_bancario_v2 WHERE id = p_extrato_destino;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato de destino inexistente: %', p_extrato_destino; END IF;
  IF p_extrato_origem = p_extrato_destino THEN RAISE EXCEPTION 'extrato de origem e destino sao o mesmo: %', p_extrato_origem; END IF;
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lancamento inexistente: %', p_lancamento_id; END IF;
  IF COALESCE(v_lan.cancelado, false) = true THEN RAISE EXCEPTION 'lancamento cancelado nao pode ser transferido: %', p_lancamento_id; END IF;
  IF v_ext_o.cliente_id IS DISTINCT FROM v_lan.cliente_id OR v_ext_d.cliente_id IS DISTINCT FROM v_lan.cliente_id OR v_ext_o.cliente_id IS DISTINCT FROM v_ext_d.cliente_id THEN
    RAISE EXCEPTION 'cliente divergente entre extratos e lancamento'; END IF;
  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = v_lan.cliente_id AND f.fazenda_id = v_lan.fazenda_id AND f.ano_mes = v_lan.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'competencia % em mes fechado: transferencia bloqueada', v_lan.ano_mes; END IF;
  SELECT count(*) INTO v_n_par FROM conciliacao_bancaria_itens WHERE extrato_id = p_extrato_origem AND lancamento_id = p_lancamento_id AND desfeito_em IS NULL;
  IF v_n_par = 0 THEN RAISE EXCEPTION 'lancamento % nao esta vinculado ao extrato de origem %', p_lancamento_id, p_extrato_origem; END IF;
  SELECT id INTO v_cbi_o FROM conciliacao_bancaria_itens WHERE extrato_id = p_extrato_origem AND lancamento_id = p_lancamento_id AND desfeito_em IS NULL LIMIT 1;
  v_valor := COALESCE(p_valor_aplicado, abs(v_ext_d.valor));
  UPDATE conciliacao_bancaria_itens SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = 'transferencia_vinculo'
   WHERE extrato_id = p_extrato_origem AND lancamento_id = p_lancamento_id AND desfeito_em IS NULL;
  SELECT COALESCE(sum(valor_aplicado),0) INTO v_soma FROM conciliacao_bancaria_itens WHERE extrato_id = p_extrato_origem AND desfeito_em IS NULL;
  v_status_o := CASE WHEN v_soma <= 0 THEN 'nao_conciliado' WHEN v_soma + 0.005 >= abs(v_ext_o.valor) THEN 'conciliado' ELSE 'parcial' END;
  UPDATE extrato_bancario_v2 SET status = v_status_o WHERE id = p_extrato_origem;
  INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
  VALUES ('conciliacao_desfeita', v_uid, v_lan.cliente_id, p_extrato_origem, p_lancamento_id, v_cbi_o, 'transferencia_vinculo', jsonb_build_object('status', v_status_o));
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = p_extrato_destino AND c.desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'extrato de destino ja possui vinculo ativo: %', p_extrato_destino; END IF;
  IF v_lan.conta_bancaria_id IS NOT NULL AND v_lan.conta_bancaria_id IS DISTINCT FROM v_ext_d.conta_bancaria_id
     AND NOT (v_lan.tipo_operacao = '3-Transferências' AND ((v_ext_d.tipo_movimento = 'credito' AND v_lan.conta_destino_id = v_ext_d.conta_bancaria_id) OR (v_ext_d.tipo_movimento = 'debito' AND v_lan.conta_bancaria_id = v_ext_d.conta_bancaria_id))) THEN
    RAISE EXCEPTION 'conta do lancamento (%) difere da conta do extrato de destino (%): vinculo bloqueado', v_lan.conta_bancaria_id, v_ext_d.conta_bancaria_id; END IF;
  SELECT id INTO v_cbi_existente FROM conciliacao_bancaria_itens WHERE extrato_id = p_extrato_destino AND lancamento_id = p_lancamento_id LIMIT 1;
  IF v_cbi_existente IS NOT NULL THEN
    UPDATE conciliacao_bancaria_itens SET desfeito_em = NULL, desfeito_por = NULL, desfeito_motivo = NULL, valor_aplicado = v_valor, aprovado_por = v_uid, aprovado_em = now(), criado_por = COALESCE(criado_por, v_uid) WHERE id = v_cbi_existente;
    v_cbi_d := v_cbi_existente;
  ELSE
    INSERT INTO conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, criado_por, tipo_aprovacao, aprovado_por, aprovado_em, snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data)
    VALUES (v_lan.cliente_id, p_extrato_destino, p_lancamento_id, v_valor, v_uid, 'manual', v_uid, now(), v_ext_d.valor, v_lan.valor, v_ext_d.data_movimento, v_lan.data_pagamento) RETURNING id INTO v_cbi_d;
  END IF;
  SELECT COALESCE(sum(valor_aplicado),0) INTO v_soma FROM conciliacao_bancaria_itens WHERE extrato_id = p_extrato_destino AND desfeito_em IS NULL;
  v_status_d := CASE WHEN v_soma <= 0 THEN 'nao_conciliado' WHEN v_soma + 0.005 >= abs(v_ext_d.valor) THEN 'conciliado' ELSE 'parcial' END;
  UPDATE extrato_bancario_v2 SET status = v_status_d WHERE id = p_extrato_destino;
  INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
  VALUES ('conciliacao_criada', v_uid, v_lan.cliente_id, p_extrato_destino, p_lancamento_id, v_cbi_d, 'transferencia_vinculo', jsonb_build_object('status', v_status_d, 'valor_aplicado', v_valor));
  RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id, 'extrato_origem', p_extrato_origem, 'status_origem', v_status_o, 'extrato_destino', p_extrato_destino, 'status_destino', v_status_d, 'cbi_destino', v_cbi_d);
END $$;


--
-- Name: fn_validate_fechamento_pasto_item(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_fechamento_pasto_item() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.peso_total IS NULL THEN NEW.peso_total := 0; END IF;
  IF COALESCE(NEW.quantidade, 0) > 0
     AND COALESCE(NEW.peso_medio_kg, 0) > 0
     AND NEW.peso_total = 0
  THEN NEW.peso_total := NEW.quantidade * NEW.peso_medio_kg; END IF;
  IF NEW.quantidade IS NOT NULL AND NEW.quantidade < 0 THEN
    RAISE EXCEPTION 'fechamento_pasto_itens: quantidade não pode ser negativa (valor: %)', NEW.quantidade;
  END IF;
  IF NEW.peso_medio_kg IS NOT NULL AND NEW.peso_medio_kg < 0 THEN
    RAISE EXCEPTION 'fechamento_pasto_itens: peso_medio_kg não pode ser negativo (valor: %)', NEW.peso_medio_kg;
  END IF;
  IF NEW.peso_total < 0 THEN
    RAISE EXCEPTION 'fechamento_pasto_itens: peso_total não pode ser negativo (valor: %)', NEW.peso_total;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_vincular_extrato_lancamento(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_vincular_extrato_lancamento(p_extrato_id uuid, p_lancamento_id uuid, p_valor_aplicado numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_ext     extrato_bancario_v2%ROWTYPE;
  v_lan     financeiro_lancamentos_v2%ROWTYPE;
  v_valor   numeric;
  v_cbi_id  uuid;
  v_soma    numeric;
  v_status  text;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato nao encontrado: %', p_extrato_id; END IF;

  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lancamento nao encontrado: %', p_lancamento_id; END IF;

  IF COALESCE(v_lan.cancelado, false) = true THEN
    RAISE EXCEPTION 'lancamento cancelado nao pode ser vinculado: %', p_lancamento_id;
  END IF;

  IF v_ext.cliente_id IS DISTINCT FROM v_lan.cliente_id THEN
    RAISE EXCEPTION 'cliente divergente: extrato=% lancamento=%', v_ext.cliente_id, v_lan.cliente_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM financeiro_fechamentos f
    WHERE f.cliente_id = v_lan.cliente_id
      AND f.fazenda_id = v_lan.fazenda_id
      AND f.ano_mes = v_lan.ano_mes
      AND f.status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION 'competencia % em mes fechado: vinculo bloqueado', v_lan.ano_mes;
  END IF;

  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.extrato_id = p_extrato_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'extrato ja possui vinculo ativo: %', p_extrato_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'lancamento ja possui vinculo ativo: %', p_lancamento_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM conciliacao_bancaria_itens c
    WHERE c.extrato_id = p_extrato_id AND c.lancamento_id = p_lancamento_id
      AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'vinculo ativo duplicado para o par';
  END IF;

  IF v_lan.conta_bancaria_id IS NULL THEN
    UPDATE financeiro_lancamentos_v2
       SET conta_bancaria_id = v_ext.conta_bancaria_id,
           updated_by = v_uid, updated_at = now()
     WHERE id = p_lancamento_id;
  ELSIF v_lan.conta_bancaria_id IS DISTINCT FROM v_ext.conta_bancaria_id
        AND NOT (
          v_lan.tipo_operacao = '3-Transferências' AND (
            (v_ext.tipo_movimento = 'credito' AND v_lan.conta_destino_id  = v_ext.conta_bancaria_id) OR
            (v_ext.tipo_movimento = 'debito'  AND v_lan.conta_bancaria_id = v_ext.conta_bancaria_id)
          )
        ) THEN
    RAISE EXCEPTION 'conta do lancamento (%) difere da conta do extrato (%): vinculo bloqueado',
      v_lan.conta_bancaria_id, v_ext.conta_bancaria_id;
  END IF;

  v_valor := COALESCE(p_valor_aplicado, abs(v_ext.valor));

  INSERT INTO conciliacao_bancaria_itens (
    cliente_id, extrato_id, lancamento_id, valor_aplicado,
    criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
    snapshot_extrato_valor, snapshot_lancamento_valor,
    snapshot_extrato_data, snapshot_lancamento_data
  ) VALUES (
    v_lan.cliente_id, p_extrato_id, p_lancamento_id, v_valor,
    v_uid, 'manual', v_uid, now(),
    v_ext.valor, v_lan.valor,
    v_ext.data_movimento, v_lan.data_pagamento
  ) RETURNING id INTO v_cbi_id;

  SELECT COALESCE(sum(valor_aplicado), 0) INTO v_soma
  FROM conciliacao_bancaria_itens
  WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;

  IF v_soma <= 0 THEN v_status := 'nao_conciliado';
  ELSIF v_soma + 0.005 >= abs(v_ext.valor) THEN v_status := 'conciliado';
  ELSE v_status := 'parcial';
  END IF;

  UPDATE extrato_bancario_v2 SET status = v_status WHERE id = p_extrato_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cbi_id', v_cbi_id,
    'extrato_id', p_extrato_id,
    'lancamento_id', p_lancamento_id,
    'valor_aplicado', v_valor,
    'conta_definida_pelo_extrato', (v_lan.conta_bancaria_id IS NULL),
    'novo_status_extrato', v_status
  );
END;
$$;


--
-- Name: fn_ws_candidatos_financeiros(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_ws_candidatos_financeiros(p_extrato_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH ofx AS (
  SELECT e.id, e.cliente_id, e.valor, e.data_movimento AS data_mov,
         e.conta_bancaria_id AS conta,
         CASE WHEN e.tipo_movimento = 'credito' THEN 1 ELSE -1 END AS sinal_ofx
  FROM extrato_bancario_v2 e
  WHERE e.id = p_extrato_id
),
cand AS (
  SELECT
    l.id, l.valor, l.sinal, l.data_pagamento, l.data_competencia,
    l.tipo_operacao, l.status_transacao, l.origem_lancamento, l.descricao,
    l.conta_bancaria_id, l.conta_destino_id,
    o.conta AS ofx_conta, o.data_mov, o.sinal_ofx,
    CASE WHEN l.conta_destino_id = o.conta THEN 'destino'
         WHEN l.conta_bancaria_id = o.conta THEN 'origem' END AS lado_match,
    (l.data_pagamento = o.data_mov) AS data_pgto_exata,
    LEAST(
      abs(COALESCE(l.data_pagamento   - o.data_mov, 999)),
      abs(COALESCE(l.data_competencia - o.data_mov, 999))
    ) AS dist_dias,
    CASE
      WHEN l.data_pagamento = o.data_mov AND l.data_competencia = o.data_mov THEN 'ambas'
      WHEN l.data_pagamento BETWEEN o.data_mov-5 AND o.data_mov+5 THEN 'pagamento'
      ELSE 'competencia'
    END AS qual_data,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL
              AND c.extrato_id = p_extrato_id) AS cbi_neste,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL
              AND c.extrato_id <> p_extrato_id) AS cbi_outro,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) AS cbi_qualquer
  FROM ofx o
  JOIN financeiro_lancamentos_v2 l
    ON l.cliente_id = o.cliente_id
   AND l.cancelado = false
   AND l.sem_movimentacao_caixa = false
   AND l.status_transacao IN ('realizado','programado')
   AND abs(l.valor) = abs(o.valor)
   AND (
        (l.data_pagamento   BETWEEN o.data_mov-5 AND o.data_mov+5)
     OR (l.data_competencia BETWEEN o.data_mov-5 AND o.data_mov+5)
       )
   AND (
        ( l.tipo_operacao = '3-Transferências' AND (
            (o.sinal_ofx > 0 AND l.conta_destino_id  = o.conta)
         OR (o.sinal_ofx < 0 AND l.conta_bancaria_id = o.conta)
        ))
        OR
        ( l.tipo_operacao <> '3-Transferências'
          AND l.conta_bancaria_id = o.conta
          AND l.sinal::int = o.sinal_ofx )
       )
),
scored AS (
  SELECT cand.*,
    LEAST(100,
      40 + 30
      + GREATEST(0, 20 - 4*dist_dias)
      + CASE WHEN tipo_operacao = '3-Transferências' THEN 10 ELSE 0 END
    ) AS score,
    CASE WHEN NOT cbi_qualquer THEN 'livre'
         WHEN cbi_neste THEN 'alerta_mesmo_extrato'
         ELSE 'alerta_outro_extrato' END AS classificacao
  FROM cand
)
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'lancamento_id', s.id,
    'valor', s.valor,
    'sinal', s.sinal,
    'data_pagamento', s.data_pagamento,
    'data_competencia', s.data_competencia,
    'tipo_operacao', s.tipo_operacao,
    'status_transacao', s.status_transacao,
    'origem_lancamento', s.origem_lancamento,
    'descricao', s.descricao,
    'conta_bancaria_id', s.conta_bancaria_id,
    'conta_bancaria_nome', (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id = s.conta_bancaria_id),
    'conta_destino_id', s.conta_destino_id,
    'conta_destino_nome', (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id = s.conta_destino_id),
    'lado_match', s.lado_match,
    'qual_data', s.qual_data,
    'classificacao', s.classificacao,
    'score', s.score,
    'extrato_vinculado_id', (SELECT c.extrato_id FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = s.id AND c.desfeito_em IS NULL LIMIT 1),
    'criterios', jsonb_build_object(
      'valor_exato', true,
      'conta_lado_ok', true,
      'data_exata', s.data_pgto_exata,
      'tipo_transferencia', (s.tipo_operacao = '3-Transferências')
    )
  )
  ORDER BY (s.classificacao = 'livre') DESC, s.score DESC, s.data_pagamento ASC
), '[]'::jsonb)
FROM scored s;
$$;


--
-- Name: fn_ws_conciliacao(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_ws_conciliacao(p_tipo text, p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_sistema jsonb := NULL;
  v_ofx jsonb := NULL;
  v_sugestoes jsonb := '[]'::jsonb;
  v_contexto jsonb;
  v_cliente uuid;
  v_conta uuid;
  v_anomes text;
  v_val numeric;
  v_sinal int;
  v_data date;
  v_ancora_cancelada boolean := false;
  v_vincular boolean := false;
BEGIN
  IF p_tipo NOT IN ('sistema_sem_vinculo','extrato_sem_vinculo') THEN
    RAISE EXCEPTION 'tipo nao suportado no WS0: %', p_tipo;
  END IF;

  IF p_tipo = 'sistema_sem_vinculo' THEN
    SELECT l.cancelado INTO v_ancora_cancelada FROM financeiro_lancamentos_v2 l WHERE l.id = p_id;
    SELECT jsonb_build_object(
      'lancamento_id', l.id, 'data', l.data_pagamento, 'valor', l.valor,
      'sinal', l.sinal, 'descricao', l.descricao, 'historico', l.historico,
      'status_transacao', l.status_transacao, 'origem_lancamento', l.origem_lancamento,
      'favorecido_id', l.favorecido_id, 'favorecido_nome', f.nome,
      'centro_custo', l.centro_custo, 'subcentro', l.subcentro,
      'grupo_custo', l.grupo_custo, 'macro_custo', l.macro_custo,
      'escopo_negocio', l.escopo_negocio, 'plano_conta_id', l.plano_conta_id,
      'conta_bancaria_id', l.conta_bancaria_id, 'conta_bancaria_nome', c1.nome_exibicao,
      'conta_destino_id', l.conta_destino_id, 'conta_destino_nome', c2.nome_exibicao,
      'observacao', l.observacao, 'documento', l.documento,
      'numero_documento', l.numero_documento, 'tipo_documento', l.tipo_documento,
      'forma_pagamento', l.forma_pagamento, 'dados_pagamento', l.dados_pagamento,
      'duplicidade', jsonb_build_object(
        'status_duplicidade', l.status_duplicidade, 'nivel_duplicidade', l.nivel_duplicidade,
        'duplicado_de_id', l.duplicado_de_id),
      'relacionamentos', jsonb_build_object(
        'transferencia_grupo_id', l.transferencia_grupo_id, 'contrato_id', l.contrato_id,
        'financiamento_id', l.financiamento_id, 'movimentacao_rebanho_id', l.movimentacao_rebanho_id,
        'boitel_id', l.boitel_id)
    ), l.cliente_id, l.conta_bancaria_id, l.ano_mes, abs(l.valor), CASE WHEN l.sinal='-1' THEN -1 ELSE 1 END, l.data_pagamento
    INTO v_sistema, v_cliente, v_conta, v_anomes, v_val, v_sinal, v_data
    FROM financeiro_lancamentos_v2 l
    LEFT JOIN financeiro_fornecedores f ON f.id = l.favorecido_id
    LEFT JOIN financeiro_contas_bancarias c1 ON c1.id = l.conta_bancaria_id
    LEFT JOIN financeiro_contas_bancarias c2 ON c2.id = l.conta_destino_id
    WHERE l.id = p_id;

    IF v_sistema IS NULL THEN RAISE EXCEPTION 'lancamento nao encontrado: %', p_id; END IF;

    SELECT coalesce(jsonb_agg(s ORDER BY (s->'candidato'->>'extrato_ja_vinculado')::boolean ASC NULLS FIRST, (s->'criterios'->>'data_igual') DESC, (s->'candidato')::text ASC), '[]'::jsonb)
    INTO v_sugestoes
    FROM (
      SELECT jsonb_build_object(
        'tipo','ofx_para_sistema',
        'confianca', CASE WHEN e.data_movimento = v_data THEN 'alta' ELSE 'media' END,
        'candidato', jsonb_build_object('extrato_id', e.id, 'data', e.data_movimento,
          'valor', e.valor, 'descricao', e.descricao, 'origem', 'Extrato',
          'extrato_ja_vinculado', EXISTS(SELECT 1 FROM conciliacao_bancaria_itens cbi WHERE cbi.extrato_id = e.id AND cbi.desfeito_em IS NULL),
          'lancamento_vinculado_id', (SELECT cbi.lancamento_id FROM conciliacao_bancaria_itens cbi WHERE cbi.extrato_id = e.id AND cbi.desfeito_em IS NULL ORDER BY cbi.created_at DESC LIMIT 1)),
        'criterios', jsonb_build_object('valor_igual', true, 'mesmo_sinal', true,
          'data_igual', (e.data_movimento = v_data),
          'descricao_semelhante', NULL, 'mesmo_banco', NULL,
          'existem_outros_candidatos', false)
      ) AS s
      FROM extrato_bancario_v2 e
      WHERE e.cliente_id = v_cliente AND abs(e.valor) = v_val
        AND sign(e.valor) = v_sinal AND (v_conta IS NULL OR e.conta_bancaria_id = v_conta)
      LIMIT 20
    ) z;

  ELSE
    SELECT jsonb_build_object(
      'extrato_id', e.id, 'data', e.data_movimento, 'valor', e.valor,
      'tipo_movimento', e.tipo_movimento, 'descricao', e.descricao, 'documento', e.documento,
      'saldo_apos', e.saldo_apos, 'conta_bancaria_id', e.conta_bancaria_id,
      'conta_bancaria_nome', c.nome_exibicao, 'importacao_id', e.importacao_id,
      'arquivo_nome', imp.nome_arquivo, 'hash_movimento', e.hash_movimento,
      'suspeita', jsonb_build_object('flag_suspeita_valor', e.flag_suspeita_valor,
        'flag_suspeita_fornecedor', e.flag_suspeita_fornecedor, 'flag_suspeita_motivo', e.flag_suspeita_motivo)
    ), e.cliente_id, e.conta_bancaria_id, abs(e.valor), sign(e.valor)::int, e.data_movimento
    INTO v_ofx, v_cliente, v_conta, v_val, v_sinal, v_data
    FROM extrato_bancario_v2 e
    LEFT JOIN financeiro_contas_bancarias c ON c.id = e.conta_bancaria_id
    LEFT JOIN financeiro_importacoes_v2 imp ON imp.id = e.importacao_id
    WHERE e.id = p_id;

    IF v_ofx IS NULL THEN RAISE EXCEPTION 'extrato nao encontrado: %', p_id; END IF;

    SELECT coalesce(jsonb_agg(s ORDER BY (s->'criterios'->>'data_igual') DESC, (s->'candidato')::text ASC), '[]'::jsonb)
    INTO v_sugestoes
    FROM (
      SELECT jsonb_build_object(
        'tipo','sistema_para_ofx',
        'confianca', CASE WHEN l.data_pagamento = v_data THEN 'alta' ELSE 'media' END,
        'candidato', jsonb_build_object('lancamento_id', l.id, 'data', l.data_pagamento,
          'valor', l.valor, 'descricao', l.descricao, 'origem', l.origem_lancamento),
        'criterios', jsonb_build_object('valor_igual', true, 'mesmo_sinal', true,
          'data_igual', (l.data_pagamento = v_data),
          'descricao_semelhante', NULL, 'mesmo_banco', NULL,
          'existem_outros_candidatos', false)
      ) AS s
      FROM financeiro_lancamentos_v2 l
      WHERE l.cliente_id = v_cliente AND l.cancelado = false AND abs(l.valor) = v_val
        AND (CASE WHEN l.sinal='-1' THEN -1 ELSE 1 END) = v_sinal
        AND l.conta_bancaria_id = v_conta
      LIMIT 20
    ) z;
    SELECT to_char(data_movimento,'YYYY-MM') INTO v_anomes FROM extrato_bancario_v2 WHERE id=p_id;
  END IF;

  v_contexto := jsonb_build_object('cliente_id', v_cliente, 'conta_bancaria_id', v_conta, 'ano_mes', v_anomes);

  v_vincular := (
    jsonb_array_length(v_sugestoes) = 1
    AND (v_sugestoes->0->>'confianca') = 'alta'
    AND (v_sugestoes->0->'criterios'->>'valor_igual') = 'true'
    AND (v_sugestoes->0->'criterios'->>'mesmo_sinal') = 'true'
    AND (v_sugestoes->0->'criterios'->>'data_igual') = 'true'
    AND v_ancora_cancelada = false
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_bancaria_itens c
      WHERE c.desfeito_em IS NULL
        AND c.extrato_id = COALESCE(
          NULLIF(v_sugestoes->0->'candidato'->>'extrato_id','')::uuid,
          CASE WHEN p_tipo = 'extrato_sem_vinculo' THEN p_id ELSE NULL END
        )
    )
  );

  RETURN jsonb_build_object(
    'versao','ws-01-readonly', 'tipo', p_tipo, 'contexto', v_contexto,
    'sistema', v_sistema, 'ofx', v_ofx, 'sugestoes', v_sugestoes,
    'lacunas', jsonb_build_array(
      jsonb_build_object('campo','produto','motivo','nao_existe_na_origem'),
      jsonb_build_object('campo','fitid','motivo','nao_existe_na_origem'),
      jsonb_build_object('campo','anexo_nf','motivo','nao_existe_na_origem')),
    'acoes_disponiveis', jsonb_build_object('vincular',v_vincular,'editar',false,'criar',false,'ignorar',false),
    'candidatos_financeiros',
      CASE WHEN p_tipo = 'extrato_sem_vinculo'
           THEN COALESCE(public.fn_ws_candidatos_financeiros(p_id), '[]'::jsonb)
           ELSE '[]'::jsonb END
  );
END;
$$;


--
-- Name: fn_zoot_cache_ensure(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_zoot_cache_ensure(p_cliente_id uuid, p_ano integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF fn_zoot_cache_has_gap(p_cliente_id, p_ano) THEN
        PERFORM fn_zoot_cache_rebuild(p_cliente_id, p_ano);
      END IF;
    END;
    $$;


--
-- Name: fn_zoot_cache_has_gap(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_zoot_cache_has_gap(p_cliente_id uuid, p_ano integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
      WITH v AS (
        SELECT fazenda_id, cenario, COUNT(*) lv
        FROM vw_zoot_categoria_mensal
        WHERE cliente_id = p_cliente_id AND ano = p_ano
        GROUP BY 1, 2
      ),
      c AS (
        SELECT fazenda_id, cenario, COUNT(*) lc
        FROM zoot_mensal_cache
        WHERE cliente_id = p_cliente_id AND ano = p_ano
        GROUP BY 1, 2
      )
      SELECT EXISTS (
        SELECT 1
        FROM v
        LEFT JOIN c USING (fazenda_id, cenario)
        WHERE lv != COALESCE(lc, 0)
      );
    $$;


--
-- Name: fn_zoot_cache_rebuild(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_zoot_cache_rebuild(p_cliente_id uuid, p_ano integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DECLARE
    v_fazenda record;
  BEGIN
    FOR v_fazenda IN
      SELECT id FROM public.fazendas WHERE cliente_id = p_cliente_id
    LOOP
      PERFORM public.refresh_zoot_cache(v_fazenda.id, p_ano);
    END LOOP;
  END;
  $$;


--
-- Name: fn_zoot_categoria_mensal(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text DEFAULT NULL::text) RETURNS TABLE(fazenda_id uuid, cliente_id uuid, ano integer, mes integer, cenario text, ano_mes text, categoria_id uuid, categoria_codigo text, categoria_nome text, ordem_exibicao integer, saldo_inicial integer, entradas_externas integer, saidas_externas integer, evol_cat_entrada integer, evol_cat_saida integer, saldo_final integer, peso_total_inicial numeric, peso_total_final numeric, peso_medio_inicial numeric, peso_medio_final numeric, peso_entradas_externas numeric, peso_saidas_externas numeric, peso_evol_cat_entrada numeric, peso_evol_cat_saida numeric, dias_mes integer, gmd numeric, producao_biologica numeric, fonte_oficial_mes text, saldo_sistema integer, saldo_p1 integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
WITH RECURSIVE
categorias AS (SELECT id, codigo, nome, ordem_exibicao FROM categorias_rebanho),
saldo_ini_cat AS (
  SELECT si.fazenda_id, si.cliente_id, si.ano, cr.id AS categoria_id, cr.codigo, cr.nome AS categoria_nome, cr.ordem_exibicao,
    sum(si.quantidade)::numeric AS cab_ini, sum(si.quantidade::numeric * COALESCE(si.peso_medio_kg, 0)) AS peso_ini
  FROM saldos_iniciais si JOIN categorias cr ON cr.codigo = si.categoria
  WHERE si.fazenda_id = p_fazenda_id AND si.ano = p_ano
  GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
),
mov_real AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END)::numeric AS ent,
    sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END)::numeric AS sai,
    sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_ent,
    sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_sai
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
rcl_sai_real AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
rcl_ent_real AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
    AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
mov_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade ELSE 0 END)::numeric AS ent,
    sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade ELSE 0 END)::numeric AS sai,
    sum(CASE WHEN l.tipo = ANY(ARRAY['nascimento','compra','transferencia_entrada']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_ent,
    sum(CASE WHEN l.tipo = ANY(ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']) THEN l.quantidade::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, 0) ELSE 0 END) AS p_sai
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo <> 'reclassificacao' AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
rcl_sai_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
rcl_ent_meta AS (
  SELECT l.fazenda_id, l.cliente_id, cr.id AS categoria_id,
    EXTRACT(year FROM l.data)::integer AS ano, EXTRACT(month FROM l.data)::integer AS mes,
    sum(l.quantidade)::numeric AS qtd, sum(l.quantidade::numeric * COALESCE(l.peso_medio_kg, 0)) AS peso
  FROM lancamentos l JOIN categorias cr ON cr.codigo = l.categoria_destino
  WHERE l.fazenda_id = p_fazenda_id AND EXTRACT(year FROM l.data)::integer = p_ano
    AND l.cancelado = false AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL AND l.cenario = 'meta'
  GROUP BY l.fazenda_id, l.cliente_id, cr.id, EXTRACT(year FROM l.data)::integer, EXTRACT(month FROM l.data)::integer
),
mov_all AS (
  SELECT COALESCE(m.fazenda_id,re.fazenda_id,rs.fazenda_id) AS fazenda_id, COALESCE(m.cliente_id,re.cliente_id,rs.cliente_id) AS cliente_id,
    COALESCE(m.categoria_id,re.categoria_id,rs.categoria_id) AS categoria_id,
    COALESCE(m.ano,re.ano,rs.ano) AS ano, COALESCE(m.mes,re.mes,rs.mes) AS mes,
    COALESCE(m.ent,0) AS ent, COALESCE(m.sai,0) AS sai,
    COALESCE(re.qtd,0) AS evol_ent, COALESCE(rs.qtd,0) AS evol_sai,
    COALESCE(m.p_ent,0) AS p_ent, COALESCE(m.p_sai,0) AS p_sai,
    COALESCE(re.peso,0) AS p_evol_ent, COALESCE(rs.peso,0) AS p_evol_sai, 'realizado'::text AS cenario
  FROM mov_real m
  FULL JOIN rcl_ent_real re ON re.fazenda_id=m.fazenda_id AND re.categoria_id=m.categoria_id AND re.ano=m.ano AND re.mes=m.mes
  FULL JOIN rcl_sai_real rs ON rs.fazenda_id=COALESCE(m.fazenda_id,re.fazenda_id) AND rs.categoria_id=COALESCE(m.categoria_id,re.categoria_id) AND rs.ano=COALESCE(m.ano,re.ano) AND rs.mes=COALESCE(m.mes,re.mes)
  UNION ALL
  SELECT COALESCE(m.fazenda_id,re.fazenda_id,rs.fazenda_id), COALESCE(m.cliente_id,re.cliente_id,rs.cliente_id),
    COALESCE(m.categoria_id,re.categoria_id,rs.categoria_id),
    COALESCE(m.ano,re.ano,rs.ano), COALESCE(m.mes,re.mes,rs.mes),
    COALESCE(m.ent,0), COALESCE(m.sai,0), COALESCE(re.qtd,0), COALESCE(rs.qtd,0),
    COALESCE(m.p_ent,0), COALESCE(m.p_sai,0), COALESCE(re.peso,0), COALESCE(rs.peso,0), 'meta'::text
  FROM mov_meta m
  FULL JOIN rcl_ent_meta re ON re.fazenda_id=m.fazenda_id AND re.categoria_id=m.categoria_id AND re.ano=m.ano AND re.mes=m.mes
  FULL JOIN rcl_sai_meta rs ON rs.fazenda_id=COALESCE(m.fazenda_id,re.fazenda_id) AND rs.categoria_id=COALESCE(m.categoria_id,re.categoria_id) AND rs.ano=COALESCE(m.ano,re.ano) AND rs.mes=COALESCE(m.mes,re.mes)
),
all_cat_bases AS (
  SELECT p_fazenda_id AS fazenda_id,
    COALESCE(si.cliente_id, (SELECT f.cliente_id FROM fazendas f WHERE f.id = p_fazenda_id LIMIT 1)) AS cliente_id,
    p_ano AS ano, cr.id AS categoria_id, scen.cenario, cr.codigo, cr.nome AS categoria_nome, cr.ordem_exibicao,
    COALESCE(si.cab_ini, 0) AS cab_ini_ano, COALESCE(si.peso_ini, 0) AS peso_ini_ano
  FROM categorias cr
  CROSS JOIN (VALUES ('realizado'::text), ('meta'::text)) AS scen(cenario)
  LEFT JOIN saldo_ini_cat si ON si.categoria_id = cr.id
  WHERE cr.id IN (SELECT categoria_id FROM mov_all UNION ALL SELECT categoria_id FROM saldo_ini_cat)
),
expanded AS (
  SELECT acb.fazenda_id, acb.cliente_id, acb.categoria_id, acb.codigo, acb.categoria_nome, acb.ordem_exibicao,
    acb.ano, m.mes, m.mes AS seq, acb.cenario, acb.cab_ini_ano, acb.peso_ini_ano,
    COALESCE(ma.ent,0) AS ent, COALESCE(ma.sai,0) AS sai,
    COALESCE(ma.evol_ent,0) AS evol_ent, COALESCE(ma.evol_sai,0) AS evol_sai,
    COALESCE(ma.p_ent,0) AS p_ent, COALESCE(ma.p_sai,0) AS p_sai,
    COALESCE(ma.p_evol_ent,0) AS p_evol_ent, COALESCE(ma.p_evol_sai,0) AS p_evol_sai,
    date_part('day', date_trunc('month', make_date(acb.ano, m.mes, 1)::timestamp) + '1 mon -1 days'::interval)::integer AS dias_mes,
    CASE WHEN acb.cenario = 'realizado' THEN fp.saldo_final ELSE NULL END AS fp_saldo_final,
    CASE WHEN acb.cenario = 'realizado' THEN fp.peso_total_final ELSE NULL END AS fp_peso_total_final,
    CASE WHEN acb.cenario = 'realizado' AND fp.saldo_final IS NOT NULL THEN 'fechamento' ELSE NULL END AS fonte_mes
  FROM all_cat_bases acb
  JOIN LATERAL generate_series(1, 12) m(mes) ON true
  LEFT JOIN mov_all ma ON ma.fazenda_id=acb.fazenda_id AND ma.categoria_id=acb.categoria_id AND ma.ano=acb.ano AND ma.mes=m.mes AND ma.cenario=acb.cenario
  LEFT JOIN LATERAL (
    SELECT sum(fpi.quantidade) AS saldo_final, sum(fpi.peso_total) AS peso_total_final
    FROM fechamento_pastos fp2 JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp2.id
    WHERE fp2.fazenda_id = acb.fazenda_id AND fp2.status = 'fechado'
      AND EXTRACT(year FROM (fp2.ano_mes||'-01')::date)::integer = acb.ano
      AND EXTRACT(month FROM (fp2.ano_mes||'-01')::date)::integer = m.mes
      AND fpi.categoria_id = acb.categoria_id
    GROUP BY fpi.categoria_id
  ) fp ON acb.cenario = 'realizado'
),
chain AS (
  SELECT e.fazenda_id, e.cliente_id, e.categoria_id, e.codigo, e.categoria_nome, e.ordem_exibicao,
    e.ano, e.mes, e.seq, e.cenario, e.dias_mes, e.fonte_mes,
    e.ent, e.sai, e.evol_ent, e.evol_sai, e.p_ent, e.p_sai, e.p_evol_ent, e.p_evol_sai,
    e.cab_ini_ano, e.peso_ini_ano,
    e.cab_ini_ano AS saldo_ini_calc, e.peso_ini_ano AS peso_ini_calc,
    COALESCE(e.fp_saldo_final::numeric, e.cab_ini_ano + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_calc,
    COALESCE(e.fp_peso_total_final, e.peso_ini_ano + e.p_ent - e.p_sai + e.p_evol_ent - e.p_evol_sai) AS peso_fin_calc,
    e.cab_ini_ano AS saldo_ini_sistema,
    (e.cab_ini_ano + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_sistema,
    e.fp_saldo_final AS fp_sf
  FROM expanded e WHERE e.mes = 1
  UNION ALL
  SELECT e.fazenda_id, e.cliente_id, e.categoria_id, e.codigo, e.categoria_nome, e.ordem_exibicao,
    e.ano, e.mes, e.seq, e.cenario, e.dias_mes, e.fonte_mes,
    e.ent, e.sai, e.evol_ent, e.evol_sai, e.p_ent, e.p_sai, e.p_evol_ent, e.p_evol_sai,
    e.cab_ini_ano, e.peso_ini_ano,
    c.saldo_fin_calc AS saldo_ini_calc, c.peso_fin_calc AS peso_ini_calc,
    COALESCE(e.fp_saldo_final::numeric, c.saldo_fin_calc + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_calc,
    COALESCE(e.fp_peso_total_final, c.peso_fin_calc + e.p_ent - e.p_sai + e.p_evol_ent - e.p_evol_sai) AS peso_fin_calc,
    c.saldo_fin_sistema AS saldo_ini_sistema,
    (c.saldo_fin_sistema + e.ent - e.sai + e.evol_ent - e.evol_sai) AS saldo_fin_sistema,
    e.fp_saldo_final AS fp_sf
  FROM chain c JOIN expanded e
    ON e.fazenda_id=c.fazenda_id AND e.cenario=c.cenario
    AND e.categoria_id=c.categoria_id AND e.ano=c.ano AND e.seq=(c.seq+1)
)
SELECT fazenda_id, cliente_id, ano, mes, cenario,
  (ano::text||'-')||lpad(mes::text,2,'0') AS ano_mes,
  categoria_id, codigo AS categoria_codigo, categoria_nome, ordem_exibicao,
  saldo_ini_calc::integer AS saldo_inicial,
  ent::integer AS entradas_externas, sai::integer AS saidas_externas,
  evol_ent::integer AS evol_cat_entrada, evol_sai::integer AS evol_cat_saida,
  saldo_fin_calc::integer AS saldo_final,
  round(peso_ini_calc,2) AS peso_total_inicial, round(peso_fin_calc,2) AS peso_total_final,
  CASE WHEN saldo_ini_calc>0 THEN round(peso_ini_calc/saldo_ini_calc,2) ELSE NULL END AS peso_medio_inicial,
  CASE WHEN saldo_fin_calc>0 THEN round(peso_fin_calc/saldo_fin_calc,2) ELSE NULL END AS peso_medio_final,
  round(p_ent,2) AS peso_entradas_externas, round(p_sai,2) AS peso_saidas_externas,
  round(p_evol_ent,2) AS peso_evol_cat_entrada, round(p_evol_sai,2) AS peso_evol_cat_saida,
  dias_mes,
  CASE WHEN ((saldo_ini_calc+saldo_fin_calc)/2.0)>0 AND dias_mes>0
    THEN round((peso_fin_calc-peso_ini_calc-p_ent+p_sai-p_evol_ent+p_evol_sai)/((saldo_ini_calc+saldo_fin_calc)/2.0*dias_mes),4)
    ELSE NULL END AS gmd,
  round(peso_fin_calc-peso_ini_calc-p_ent+p_sai-p_evol_ent+p_evol_sai,2) AS producao_biologica,
  fonte_mes AS fonte_oficial_mes,
  saldo_fin_sistema::integer AS saldo_sistema,
  CASE WHEN fonte_mes = 'fechamento' THEN fp_sf::integer ELSE NULL END AS saldo_p1
FROM chain
WHERE (p_cenario IS NULL OR cenario = p_cenario)
  AND NOT (saldo_ini_calc=0 AND saldo_fin_calc=0 AND ent=0 AND sai=0 AND evol_ent=0 AND evol_sai=0)
$$;


--
-- Name: gerar_snapshot_area(uuid, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gerar_snapshot_area(p_fazenda_id uuid, p_ano_mes date, p_fechado_por uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
  -- v2 (Passo B / 10-Mai-2026): Lista oficial isOperacionalPecuaria
  --   Pecuaria: cria, recria, engorda, vedado, reforma_pecuaria
  --   Agricultura: agricultura
  DECLARE
    v_id               UUID;
    v_cliente_id       UUID;
    v_status_op        TEXT;
    v_tem_pecuaria     BOOLEAN;
    v_area_produtiva   NUMERIC(10,2);
    v_area_pec         NUMERIC(10,2);
    v_area_agric       NUMERIC(10,2);
  BEGIN
    SELECT cliente_id,
           COALESCE(status_operacional, 'ativa'),
           COALESCE(tem_pecuaria, true)
    INTO   v_cliente_id, v_status_op, v_tem_pecuaria
    FROM   fazendas
    WHERE  id = p_fazenda_id;

    IF v_cliente_id IS NULL THEN
      RAISE EXCEPTION 'Fazenda % nao encontrada.', p_fazenda_id;
    END IF;

    IF v_status_op <> 'ativa' OR v_tem_pecuaria IS NOT TRUE THEN
      RETURN NULL;
    END IF;

    SELECT area_produtiva_ha
    INTO   v_area_produtiva
    FROM   fazenda_cadastros
    WHERE  fazenda_id = p_fazenda_id
      AND  cliente_id = v_cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Fazenda % nao possui cadastro em fazenda_cadastros. Preencha o cadastro de area antes de fechar o P1.',
        p_fazenda_id;
    END IF;

    IF v_area_produtiva IS NULL OR v_area_produtiva <= 0 THEN
      RAISE EXCEPTION
        'Fazenda % nao possui area produtiva cadastrada. Preencha Configuracoes > Fazendas > Area antes de fechar o P1.',
        p_fazenda_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM   pastos p
      WHERE  p.fazenda_id = p_fazenda_id
        AND  p.ativo = true
        AND  COALESCE(p.tipo_uso, '') <> 'divergencia'
        AND  NOT EXISTS (
          SELECT 1 FROM fechamento_pastos fp
          WHERE  fp.pasto_id = p.id
            AND  fp.ano_mes = to_char(p_ano_mes, 'YYYY-MM')
            AND  fp.status   = 'fechado'
        )
    ) THEN
      RAISE EXCEPTION
        'Nem todos os pastos ativos da fazenda % foram fechados para o mes %. Complete o fechamento antes de gerar o snapshot.',
        p_fazenda_id, p_ano_mes;
    END IF;

    SELECT
      COALESCE(SUM(CASE
        WHEN LOWER(fp.tipo_uso_mes) IN ('cria','recria','engorda','vedado','reforma_pecuaria')
        THEN p.area_produtiva_ha ELSE 0 END), 0),
      COALESCE(SUM(CASE
        WHEN LOWER(fp.tipo_uso_mes) = 'agricultura'
        THEN p.area_produtiva_ha ELSE 0 END), 0)
    INTO  v_area_pec, v_area_agric
    FROM  fechamento_pastos fp
    JOIN  pastos p ON p.id = fp.pasto_id
    WHERE fp.fazenda_id       = p_fazenda_id
      AND fp.ano_mes = to_char(p_ano_mes, 'YYYY-MM')
      AND fp.status           = 'fechado'
      AND p.area_produtiva_ha IS NOT NULL;

    INSERT INTO fechamento_area_snapshot (
      cliente_id, fazenda_id, ano_mes,
      area_total_ha, area_produtiva_ha,
      area_pecuaria_ha, area_agricultura_ha,
      origem_area, fechado_por
    )
    VALUES (
      v_cliente_id, p_fazenda_id, p_ano_mes,
      v_area_pec + v_area_agric, v_area_produtiva,
      v_area_pec, v_area_agric,
      'fechamento_p1', p_fechado_por
    )
    ON CONFLICT (fazenda_id, ano_mes) DO UPDATE SET
      area_total_ha       = EXCLUDED.area_total_ha,
      area_produtiva_ha   = EXCLUDED.area_produtiva_ha,
      area_pecuaria_ha    = EXCLUDED.area_pecuaria_ha,
      area_agricultura_ha = EXCLUDED.area_agricultura_ha,
      versao              = fechamento_area_snapshot.versao + 1,
      fechado_em          = now(),
      fechado_por         = EXCLUDED.fechado_por
    RETURNING id INTO v_id;

    RETURN v_id;
  END;
  $$;


--
-- Name: get_anos_financeiro_v2(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_anos_financeiro_v2(p_cliente_id uuid) RETURNS TABLE(ano integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT CAST(substring(ano_mes from 1 for 4) AS int) AS ano
  FROM financeiro_lancamentos_v2
  WHERE cliente_id = p_cliente_id
    AND status_transacao IS DISTINCT FROM 'cancelado'
  ORDER BY ano;
$$;


--
-- Name: get_anos_lancamentos(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_anos_lancamentos(p_cliente_id uuid) RETURNS TABLE(ano integer)
    LANGUAGE sql SECURITY DEFINER
    AS $$
      SELECT DISTINCT EXTRACT(YEAR FROM data_competencia)::integer AS ano
      FROM financeiro_lancamentos_v2
      WHERE cliente_id = p_cliente_id
        AND cancelado = false
      ORDER BY ano DESC;
    $$;


--
-- Name: get_status_pilares_fechamento(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      _total_pastos    int;
      _pastos_fechados int;
      _p1_status       text;
      _p2_status       text;
    BEGIN
      SELECT
        count(*),
        count(*) FILTER (WHERE status = 'fechado')
      INTO _total_pastos, _pastos_fechados
      FROM fechamento_pastos
      WHERE fazenda_id = _fazenda_id
        AND ano_mes    = _ano_mes;

      IF _total_pastos > 0 AND _pastos_fechados = _total_pastos THEN
        _p1_status := 'oficial';
      ELSE
        _p1_status := 'pendente';
      END IF;

      _p2_status := 'pendente';

      RETURN jsonb_build_object(
        'fazenda_id',               _fazenda_id,
        'ano_mes',                  _ano_mes,
        'p1_mapa_pastos',           jsonb_build_object('status', _p1_status),
        'p2_valor_rebanho',         jsonb_build_object('status', _p2_status),
        'p3_financeiro_caixa',      jsonb_build_object('status', 'pendente'),
        'p4_competencia',           jsonb_build_object('status', 'pendente', 'modo_transitorio', true),
        'p5_economico_consolidado', jsonb_build_object('status', 'pendente')
      );
    END;
    $$;


--
-- Name: get_user_cliente_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_cliente_id(_user_id uuid DEFAULT auth.uid()) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT cliente_id FROM public.cliente_membros
  WHERE user_id = _user_id AND ativo = true
  LIMIT 1
$$;


--
-- Name: get_user_cliente_ids(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_cliente_ids(_user_id uuid DEFAULT auth.uid()) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT cliente_id FROM public.cliente_membros
  WHERE user_id = _user_id AND ativo = true
$$;


--
-- Name: get_user_perfil(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_perfil(_user_id uuid, _cliente_id uuid) RETURNS public.perfil_acesso
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT perfil::perfil_acesso FROM public.cliente_membros
  WHERE user_id = _user_id
    AND cliente_id = _cliente_id
    AND ativo = true
  LIMIT 1
$$;


--
-- Name: guard_fechamento_pastos_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_fechamento_pastos_snapshot() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Allow reopening operations (status changes to reaberto/rascunho from fechado)
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('reaberto', 'rascunho')
     AND OLD.status = 'fechado' THEN
    RETURN NEW;
  END IF;

  -- Block if validated snapshot exists OR P2 is formally closed
  IF EXISTS (
    SELECT 1 FROM valor_rebanho_realizado_validado
    WHERE fazenda_id = NEW.fazenda_id
      AND ano_mes = NEW.ano_mes
      AND status = 'validado'
  ) OR EXISTS (
    SELECT 1 FROM valor_rebanho_fechamento
    WHERE fazenda_id = NEW.fazenda_id
      AND ano_mes = NEW.ano_mes
      AND status = 'fechado'
  ) THEN
    RAISE EXCEPTION
      'Mês % possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.',
      NEW.ano_mes;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_financeiro_lancamento_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_financeiro_lancamento_v2() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Historical import records are read-only for non-admins (UPDATE only)
  IF TG_OP = 'UPDATE'
     AND OLD.origem_lancamento = 'importacao_historica'
     AND NOT public.is_admin_agroinblue(auth.uid()) THEN
    RAISE EXCEPTION 'Lançamentos históricos no V2 são somente leitura para perfis não-admin.';
  END IF;

  -- No longer block DELETE for imported records - soft delete (cancelado=true) is the standard

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: guard_financeiro_mes_fechado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_financeiro_mes_fechado() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ano_mes text;
  v_fazenda_id uuid;
  v_cliente_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ano_mes := OLD.ano_mes;
    v_fazenda_id := OLD.fazenda_id;
    v_cliente_id := OLD.cliente_id;
  ELSE
    v_ano_mes := NEW.ano_mes;
    v_fazenda_id := NEW.fazenda_id;
    v_cliente_id := NEW.cliente_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.financeiro_fechamentos
    WHERE cliente_id = v_cliente_id
      AND fazenda_id = v_fazenda_id
      AND ano_mes = v_ano_mes
      AND status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION 'Mês fechado. Reabra o período para realizar alterações.';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: guard_lancamento_mes_fechado_p1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_lancamento_mes_fechado_p1() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      _ano_mes     text;
      _fazenda_id  uuid;
      _p1_status   text;
      _status_json jsonb;
    BEGIN
      IF TG_OP = 'INSERT' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
      IF TG_OP = 'DELETE' AND OLD.cenario = 'meta' THEN RETURN OLD; END IF;

      IF TG_OP = 'DELETE' THEN
        _ano_mes    := substring(OLD.data::text, 1, 7);
        _fazenda_id := OLD.fazenda_id;
      ELSIF TG_OP = 'INSERT' THEN
        _ano_mes    := substring(NEW.data::text, 1, 7);
        _fazenda_id := NEW.fazenda_id;
      ELSE
        _ano_mes    := substring(OLD.data::text, 1, 7);
        _fazenda_id := OLD.fazenda_id;
      END IF;

      _status_json := get_status_pilares_fechamento(_fazenda_id, _ano_mes);
      _p1_status   := _status_json #>> '{p1_mapa_pastos,status}';

      IF _p1_status IS DISTINCT FROM 'oficial' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END IF;

      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para excluir lançamentos.', _ano_mes;
      END IF;

      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para inserir novos lançamentos.', _ano_mes;
      END IF;

      IF TG_OP = 'UPDATE' THEN
        IF (OLD.data              IS DISTINCT FROM NEW.data)
        OR (OLD.tipo              IS DISTINCT FROM NEW.tipo)
        OR (OLD.quantidade        IS DISTINCT FROM NEW.quantidade)
        OR (OLD.categoria         IS DISTINCT FROM NEW.categoria)
        OR (OLD.categoria_destino IS DISTINCT FROM NEW.categoria_destino)
        OR (OLD.fazenda_id        IS DISTINCT FROM NEW.fazenda_id)
        OR (OLD.fazenda_destino   IS DISTINCT FROM NEW.fazenda_destino)
        OR (OLD.fazenda_origem    IS DISTINCT FROM NEW.fazenda_origem)
        OR (OLD.cancelado         IS DISTINCT FROM NEW.cancelado)
        THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.', _ano_mes;
        END IF;

        IF substring(OLD.data::text, 1, 7) IS DISTINCT FROM substring(NEW.data::text, 1, 7)
        OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id THEN
          _status_json := get_status_pilares_fechamento(NEW.fazenda_id, substring(NEW.data::text, 1, 7));
          _p1_status   := _status_json #>> '{p1_mapa_pastos,status}';
          IF _p1_status = 'oficial' THEN
            RAISE EXCEPTION 'O mês destino % também está fechado no Mapa de Pastos (P1 oficial).', substring(NEW.data::text, 1, 7);
          END IF;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$;


--
-- Name: guard_meta_admin_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_meta_admin_only() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.cenario = 'meta' THEN
    IF NOT public.is_admin_agroinblue(auth.uid()) THEN
      RAISE EXCEPTION 'Somente consultores (admin) podem criar registros META.';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.cenario = 'meta' AND NOT public.is_admin_agroinblue(auth.uid()) THEN
      RAISE EXCEPTION 'Somente consultores (admin) podem editar registros META.';
    END IF;
    IF NEW.cenario = 'meta' AND OLD.cenario != 'meta' AND NOT public.is_admin_agroinblue(auth.uid()) THEN
      RAISE EXCEPTION 'Somente consultores (admin) podem definir registros como META.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.cenario = 'meta' THEN
    IF NOT public.is_admin_agroinblue(auth.uid()) THEN
      RAISE EXCEPTION 'Somente consultores (admin) podem excluir registros META.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: guard_pasto_itens_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_pasto_itens_snapshot() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _ano_mes text;
  _fazenda_id uuid;
BEGIN
  SELECT fp.ano_mes, fp.fazenda_id
  INTO _ano_mes, _fazenda_id
  FROM fechamento_pastos fp
  WHERE fp.id = COALESCE(NEW.fechamento_id, OLD.fechamento_id);

  IF _ano_mes IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM valor_rebanho_realizado_validado
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND status = 'validado'
    ) OR EXISTS (
      SELECT 1 FROM valor_rebanho_fechamento
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND status = 'fechado'
    )
  ) THEN
    RAISE EXCEPTION
      'Mês % possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar itens de pasto.',
      _ano_mes;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: guard_saldos_iniciais_mes_fechado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_saldos_iniciais_mes_fechado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  _ano_mes text;
  _is_closed boolean;
BEGIN
  -- Permite inserção vinda da propagação oficial de dezembro
  IF current_setting('app.propagacao_dezembro', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Permite INSERT com quantidade = 0 (categorias sem animais são válidas)
  -- Bloco removido: não bloquear mais INSERT com quantidade=0

  _ano_mes := NEW.ano || '-01';

  SELECT EXISTS (
    SELECT 1 FROM fechamento_pastos fp
    WHERE fp.fazenda_id = NEW.fazenda_id
      AND fp.ano_mes = _ano_mes AND fp.status = 'fechado'
  ) AND NOT EXISTS (
    SELECT 1 FROM pastos p
    WHERE p.fazenda_id = NEW.fazenda_id AND p.ativo = true
      AND NOT EXISTS (
        SELECT 1 FROM fechamento_pastos fp2
        WHERE fp2.fazenda_id = NEW.fazenda_id
          AND fp2.pasto_id = p.id
          AND fp2.ano_mes = _ano_mes AND fp2.status = 'fechado'
      )
  ) INTO _is_closed;

  IF NOT _is_closed THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.quantidade IS DISTINCT FROM OLD.quantidade THEN
      RAISE EXCEPTION 'Mês % está fechado. Quantidade não pode ser alterada.', _ano_mes;
    END IF;
    IF NEW.peso_medio_kg IS DISTINCT FROM OLD.peso_medio_kg THEN
      RAISE EXCEPTION 'Mês % está fechado. Peso médio não pode ser alterado.', _ano_mes;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Mês % está fechado. Não é permitido inserir novos saldos iniciais.', _ano_mes;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_staging_promovido_terminal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_staging_promovido_terminal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        IF OLD.lancamento_v2_id IS NOT NULL 
           AND OLD.status_promocao = 'promovido' THEN
          
          IF NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id
             OR NEW.fazenda_id IS DISTINCT FROM OLD.fazenda_id
             OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
             OR NEW.valor IS DISTINCT FROM OLD.valor
             OR NEW.sinal IS DISTINCT FROM OLD.sinal
             OR NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao
             OR NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento
             OR NEW.data_competencia IS DISTINCT FROM OLD.data_competencia
             OR NEW.ano_mes IS DISTINCT FROM OLD.ano_mes
             OR NEW.macro_custo IS DISTINCT FROM OLD.macro_custo
             OR NEW.grupo_custo IS DISTINCT FROM OLD.grupo_custo
             OR NEW.centro_custo IS DISTINCT FROM OLD.centro_custo
             OR NEW.subcentro IS DISTINCT FROM OLD.subcentro
             OR NEW.escopo_negocio IS DISTINCT FROM OLD.escopo_negocio
             OR NEW.favorecido_id IS DISTINCT FROM OLD.favorecido_id
             OR NEW.favorecido_nome_marcado_novo IS DISTINCT FROM OLD.favorecido_nome_marcado_novo
             OR NEW.produto IS DISTINCT FROM OLD.produto
             OR NEW.descricao IS DISTINCT FROM OLD.descricao
             OR NEW.observacao IS DISTINCT FROM OLD.observacao
             OR NEW.ofx_extrato_id IS DISTINCT FROM OLD.ofx_extrato_id
             OR NEW.conta_texto_excel IS DISTINCT FROM OLD.conta_texto_excel
             OR NEW.conta_resolvida_id IS DISTINCT FROM OLD.conta_resolvida_id
             OR NEW.conta_resolvida_score IS DISTINCT FROM OLD.conta_resolvida_score
             OR NEW.conta_resolvida_estrategia IS DISTINCT FROM OLD.conta_resolvida_estrategia
             OR NEW.origem_aprovacao IS DISTINCT FROM OLD.origem_aprovacao
             OR NEW.excel_key IS DISTINCT FROM OLD.excel_key
             OR NEW.sessao_id IS DISTINCT FROM OLD.sessao_id THEN
            RAISE EXCEPTION 
              'mesa_lancamento_staging promovido eh IMUTAVEL em campos de conteudo. Use RPC de reversao (PR6.3) para reverter promocao antes de alterar.';
          END IF;
        END IF;
        
        RETURN NEW;
      END $$;


--
-- Name: guard_transferencia_conta_destino(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_transferencia_conta_destino() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- For transfers, conta_destino_id is required
  IF NEW.tipo_operacao = '3-Transferência' AND NEW.conta_destino_id IS NULL THEN
    -- On INSERT: always block
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Transferência deve ter conta de destino obrigatoriamente.';
    END IF;
    -- On UPDATE: block only if OLD had a value (prevent removing existing destination)
    -- Allow updates to other fields on legacy records that already had NULL
    IF TG_OP = 'UPDATE' AND OLD.conta_destino_id IS NOT NULL THEN
      RAISE EXCEPTION 'Não é permitido remover a conta de destino de uma transferência.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_valor_rebanho_requer_p1_fechado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_valor_rebanho_requer_p1_fechado() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NEW.status != 'fechado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'fechado' THEN RETURN NEW; END IF;
  _result := public.can_close_valor_rebanho(NEW.fazenda_id, NEW.ano_mes);
  IF (_result->>'pode_fechar')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Nao e possivel fechar o Valor do Rebanho: %',
      COALESCE(_result->>'motivo', 'P1 nao esta oficial');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_zoo_financeiro_cancelamento_realizado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_zoo_financeiro_cancelamento_realizado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.cancelado IS TRUE
     AND OLD.cancelado IS DISTINCT FROM TRUE
     AND OLD.movimentacao_rebanho_id IS NOT NULL
     AND (
       OLD.status_transacao IN ('realizado','agendado')
       OR OLD.conciliado_em IS NOT NULL
     )
  THEN
    RAISE EXCEPTION
      'Lançamento financeiro vinculado ao Zoo está realizado/agendado e não pode ser cancelado. Altere pelo Financeiro Oficial.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$;


--
-- Name: invalidate_snapshot_on_pasto_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invalidate_snapshot_on_pasto_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _ano_mes text;
  _fazenda_id uuid;
  _cliente_id uuid;
  _invalidated_count int;
  _cascade_rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _ano_mes := OLD.ano_mes;
    _fazenda_id := OLD.fazenda_id;
  ELSE
    _ano_mes := NEW.ano_mes;
    _fazenda_id := NEW.fazenda_id;
  END IF;

  -- Camada 2: Invalidar snapshot do mês alterado
  UPDATE valor_rebanho_realizado_validado
  SET status = 'invalidado', updated_at = now()
  WHERE fazenda_id = _fazenda_id
    AND ano_mes = _ano_mes
    AND status = 'validado';

  GET DIAGNOSTICS _invalidated_count = ROW_COUNT;

  -- Se invalidou algo, aplicar cascata nos meses seguintes
  IF _invalidated_count > 0 THEN
    -- Buscar cliente_id para auditoria
    SELECT cliente_id INTO _cliente_id
    FROM fazendas WHERE id = _fazenda_id;

    -- Camada 3: Marcar meses seguintes como cadeia_quebrada
    FOR _cascade_rec IN
      UPDATE valor_rebanho_realizado_validado
      SET status = 'cadeia_quebrada', updated_at = now()
      WHERE fazenda_id = _fazenda_id
        AND ano_mes > _ano_mes
        AND status = 'validado'
      RETURNING ano_mes
    LOOP
      -- Log de auditoria para cada mês afetado em cascata
      INSERT INTO fechamento_reaberturas_log (
        fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
        pilares_invalidados, usuario_id
      ) VALUES (
        _fazenda_id, _cliente_id, _cascade_rec.ano_mes,
        'p2_valor_rebanho', 'invalidacao_cascata_snapshot',
        'Cascata automática: mês ' || _ano_mes || ' foi alterado após validação',
        ARRAY['p2_valor_rebanho', 'p5_economico_consolidado'],
        auth.uid()
      );
    END LOOP;

    -- Log do mês original invalidado
    INSERT INTO fechamento_reaberturas_log (
      fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
      pilares_invalidados, usuario_id
    ) VALUES (
      _fazenda_id, _cliente_id, _ano_mes,
      'p2_valor_rebanho', 'invalidacao_snapshot_automatica',
      'Snapshot invalidado automaticamente por alteração em fechamento de pastos',
      ARRAY['p2_valor_rebanho', 'p5_economico_consolidado'],
      auth.uid()
    );
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;


--
-- Name: is_admin_agroinblue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_agroinblue(_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cliente_membros
    WHERE user_id = _user_id
      AND perfil = 'admin_agroinblue'
      AND ativo = true
  )
$$;


--
-- Name: is_cliente_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_cliente_member(_user_id uuid, _cliente_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cliente_membros
    WHERE user_id = _user_id
      AND cliente_id = _cliente_id
      AND ativo = true
  )
$$;


--
-- Name: is_fazenda_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_fazenda_member(_user_id uuid, _fazenda_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fazenda_membros
    WHERE user_id = _user_id AND fazenda_id = _fazenda_id
  )
$$;


--
-- Name: mark_editado_manual_on_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_editado_manual_on_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only mark if it was originally imported (has importacao_id) and not already marked
  IF OLD.importacao_id IS NOT NULL AND OLD.editado_manual = false THEN
    NEW.editado_manual = true;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: mark_financeiro_lancamento_v2_editado_manual(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_financeiro_lancamento_v2_editado_manual() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.lote_importacao_id IS NOT NULL
     AND COALESCE(OLD.editado_manual, false) = false
     AND (
       NEW.fazenda_id IS DISTINCT FROM OLD.fazenda_id OR
       NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id OR
       NEW.ano_mes IS DISTINCT FROM OLD.ano_mes OR
       NEW.data_competencia IS DISTINCT FROM OLD.data_competencia OR
       NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento OR
       NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao OR
       NEW.status_transacao IS DISTINCT FROM OLD.status_transacao OR
       NEW.descricao IS DISTINCT FROM OLD.descricao OR
       NEW.documento IS DISTINCT FROM OLD.documento OR
       NEW.historico IS DISTINCT FROM OLD.historico OR
       NEW.valor IS DISTINCT FROM OLD.valor OR
       NEW.sinal IS DISTINCT FROM OLD.sinal OR
       NEW.macro_custo IS DISTINCT FROM OLD.macro_custo OR
       NEW.centro_custo IS DISTINCT FROM OLD.centro_custo OR
       NEW.subcentro IS DISTINCT FROM OLD.subcentro OR
       NEW.escopo_negocio IS DISTINCT FROM OLD.escopo_negocio OR
       NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id OR
       NEW.favorecido_id IS DISTINCT FROM OLD.favorecido_id OR
       NEW.observacao IS DISTINCT FROM OLD.observacao OR
       NEW.numero_documento IS DISTINCT FROM OLD.numero_documento OR
       NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento OR
       NEW.dados_pagamento IS DISTINCT FROM OLD.dados_pagamento OR
       NEW.contrato_id IS DISTINCT FROM OLD.contrato_id
     ) THEN
    NEW.editado_manual := true;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: mesa_trg_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mesa_trg_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: normalize_fornecedor_nome(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_fornecedor_nome() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
BEGIN
  NEW.nome_normalizado = upper(
    regexp_replace(
      regexp_replace(
        regexp_replace(NEW.nome, '[^a-zA-Z0-9 ]', ' ', 'g'),
        '\s+', ' ', 'g'
      ),
      '^\s+|\s+$', '', 'g'
    )
  );
  RETURN NEW;
END;
$_$;


--
-- Name: propagar_saldo_inicial_pos_dezembro(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.propagar_saldo_inicial_pos_dezembro() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ano_seguinte INT;
  v_ano INT;
  v_mes INT;
BEGIN
  IF NEW.status <> 'fechado' OR OLD.status = 'fechado' THEN
    RETURN NEW;
  END IF;

  v_ano := EXTRACT(YEAR  FROM (NEW.ano_mes || '-01')::date);
  v_mes := EXTRACT(MONTH FROM (NEW.ano_mes || '-01')::date);

  IF v_mes <> 12 THEN
    RETURN NEW;
  END IF;

  v_ano_seguinte := v_ano + 1;

  IF EXISTS (
    SELECT 1 FROM fechamento_pastos
    WHERE fazenda_id = NEW.fazenda_id
      AND cliente_id = NEW.cliente_id
      AND ano_mes    = NEW.ano_mes
      AND status     <> 'fechado'
      AND id         <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.propagacao_dezembro', 'true', true);

  INSERT INTO saldos_iniciais (fazenda_id, cliente_id, ano, mes, categoria, quantidade, peso_medio_kg)
  SELECT
    fp.fazenda_id,
    fp.cliente_id,
    v_ano_seguinte,
    1,
    cr.codigo,
    SUM(fpi.quantidade),
    CASE
      WHEN SUM(fpi.quantidade) > 0
      THEN ROUND(
        (SUM(fpi.peso_medio_kg * fpi.quantidade) / SUM(fpi.quantidade))::numeric, 2
      )
      ELSE 0
    END
  FROM fechamento_pasto_itens fpi
  JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
  JOIN categorias_rebanho cr ON cr.id = fpi.categoria_id
  WHERE fp.fazenda_id = NEW.fazenda_id
    AND fp.cliente_id = NEW.cliente_id
    AND fp.ano_mes    = NEW.ano_mes
    AND fp.status     = 'fechado'
  GROUP BY fp.fazenda_id, fp.cliente_id, cr.codigo
  HAVING SUM(fpi.quantidade) > 0
  ON CONFLICT (fazenda_id, ano, mes, categoria)
  DO UPDATE SET
    quantidade    = EXCLUDED.quantidade,
    peso_medio_kg = EXCLUDED.peso_medio_kg;

  RETURN NEW;
END;
$$;


--
-- Name: reabrir_pilar_fechamento(uuid, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reabrir_pilar_fechamento(_fazenda_id uuid, _ano_mes text, _pilar text, _motivo text DEFAULT NULL::text, _usuario_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _count int := 0;
  _pilares_reabertos text[] := '{}';
  _pilares_invalidados text[] := '{}';
BEGIN
  IF _pilar = 'p1_mapa_pastos' THEN
    -- Reabre todos os pastos fechados deste mes/fazenda
    UPDATE fechamento_pastos
    SET status = 'rascunho'
    WHERE fazenda_id = _fazenda_id
      AND ano_mes = _ano_mes
      AND status = 'fechado';
    GET DIAGNOSTICS _count = ROW_COUNT;
    
    IF _count > 0 THEN
      _pilares_reabertos := array_append(_pilares_reabertos, 'p1_mapa_pastos');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'pilares_reabertos', to_jsonb(_pilares_reabertos),
    'pilares_invalidados', to_jsonb(_pilares_invalidados),
    'success', true,
    'pilar', _pilar,
    'fazenda_id', _fazenda_id::text,
    'ano_mes', _ano_mes,
    'pastos_reabertos', _count,
    'motivo', _motivo
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'pilares_reabertos', '[]'::jsonb,
    'pilares_invalidados', '[]'::jsonb,
    'success', false,
    'error', SQLERRM
  );
END;
$$;


--
-- Name: refresh_zoot_cache(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano;
  INSERT INTO public.zoot_mensal_cache (
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
  )
  SELECT
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano);
END;
$$;


--
-- Name: refresh_zoot_cache(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND mes = p_mes;
  INSERT INTO public.zoot_mensal_cache (
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
  )
  SELECT
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano)
   WHERE mes = p_mes;
END;
$$;


--
-- Name: refresh_zoot_cache(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.zoot_mensal_cache WHERE fazenda_id = p_fazenda_id AND ano = p_ano AND cenario = p_cenario;
  INSERT INTO public.zoot_mensal_cache (
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, updated_at, saldo_sistema, saldo_p1
  )
  SELECT
    fazenda_id, cliente_id, ano, mes, cenario, ano_mes,
    categoria_id, categoria_codigo, categoria_nome, ordem_exibicao,
    saldo_inicial, entradas_externas, saidas_externas,
    evol_cat_entrada, evol_cat_saida, saldo_final,
    peso_total_inicial, peso_total_final,
    peso_medio_inicial, peso_medio_final,
    peso_entradas_externas, peso_saidas_externas,
    peso_evol_cat_entrada, peso_evol_cat_saida,
    dias_mes, gmd, producao_biologica,
    fonte_oficial_mes, now(), saldo_sistema, saldo_p1
  FROM public.fn_zoot_categoria_mensal(p_fazenda_id, p_ano, p_cenario);
END;
$$;


--
-- Name: refresh_zoot_cache_reclassificacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_zoot_cache_reclassificacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_cliente_id uuid;
  v_fazenda_id uuid;
BEGIN
  -- Pegar fazenda_id e cliente_id do registro afetado
  IF TG_OP = 'DELETE' THEN
    v_fazenda_id := OLD.fazenda_id;
  ELSE
    v_fazenda_id := NEW.fazenda_id;
  END IF;

  -- Buscar cliente_id via fazenda
  SELECT cliente_id INTO v_cliente_id
  FROM fazendas WHERE id = v_fazenda_id LIMIT 1;

  IF v_cliente_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Rebuild do cache para este cliente
  DELETE FROM zoot_mensal_cache WHERE cliente_id = v_cliente_id;

  INSERT INTO zoot_mensal_cache
  SELECT *, now() AS updated_at
  FROM vw_zoot_categoria_mensal
  WHERE cliente_id = v_cliente_id
  ON CONFLICT (fazenda_id, ano, mes, cenario, categoria_id) DO UPDATE
    SET updated_at = now(),
        saldo_inicial = EXCLUDED.saldo_inicial,
        saldo_final = EXCLUDED.saldo_final,
        gmd = EXCLUDED.gmd;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: resolve_classificacao_from_plano(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_classificacao_from_plano() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_plano RECORD;
    BEGIN
      -- Tentativa 1: resolver por subcentro + tipo_operacao (comportamento original)
      IF NEW.subcentro IS NOT NULL THEN
        SELECT macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
        INTO v_plano
        FROM public.financeiro_plano_contas
        WHERE ativo = true
          AND subcentro = NEW.subcentro
          AND tipo_operacao = NEW.tipo_operacao
        LIMIT 1;

        IF FOUND THEN
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          RETURN NEW;
        END IF;

        -- Tentativa 2: só por subcentro (sem tipo_operacao)
        SELECT macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
        INTO v_plano
        FROM public.financeiro_plano_contas
        WHERE ativo = true
          AND subcentro = NEW.subcentro
        LIMIT 1;

        IF FOUND THEN
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          RETURN NEW;
        END IF;

        -- B1: subcentro preenchido mas fora do plano (T1 e T2 falharam).
        -- Bloquear gravacao de subcentro cru, EXCETO dividendos (exclusivos por cliente, fora do plano global).
        IF NEW.macro_custo IS DISTINCT FROM 'Dividendos' THEN
          RAISE EXCEPTION 'Subcentro "%" nao existe no plano de contas. Selecione um subcentro canonico.', NEW.subcentro
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      -- Tentativa 3 (NOVO): fallback por plano_conta_id quando subcentro é null
      IF NEW.subcentro IS NULL AND NEW.plano_conta_id IS NOT NULL THEN
        SELECT macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
        INTO v_plano
        FROM public.financeiro_plano_contas
        WHERE id = NEW.plano_conta_id
          AND ativo = true
        LIMIT 1;

        IF FOUND THEN
          NEW.subcentro      := v_plano.subcentro;
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$;


--
-- Name: resolve_escopo_planejamento_financeiro(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_escopo_planejamento_financeiro() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_match_count INTEGER;
  v_escopo TEXT;
BEGIN
  IF NEW.escopo_negocio IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_match_count
  FROM financeiro_plano_contas
  WHERE cliente_id IS NULL
    AND ativo = true
    AND macro_custo = NEW.macro_custo
    AND grupo_custo = NEW.grupo_custo
    AND centro_custo = NEW.centro_custo
    AND subcentro    = NEW.subcentro;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION
      'planejamento_financeiro: match ambíguo no plano de contas para macro=%, grupo=%, centro=%, subcentro=% (% matches). Resolva o cadastro antes de prosseguir.',
      NEW.macro_custo, NEW.grupo_custo, NEW.centro_custo, NEW.subcentro, v_match_count
      USING ERRCODE = '23514';
  END IF;

  IF v_match_count = 0 THEN
    RAISE EXCEPTION
      'planejamento_financeiro: escopo_negocio NULL e nenhum match no plano de contas para macro=%, grupo=%, centro=%, subcentro=%. Corrija o cadastro ou informe escopo explicitamente.',
      NEW.macro_custo, NEW.grupo_custo, NEW.centro_custo, NEW.subcentro
      USING ERRCODE = '23502';
  END IF;

  SELECT escopo_negocio INTO v_escopo
  FROM financeiro_plano_contas
  WHERE cliente_id IS NULL
    AND ativo = true
    AND macro_custo = NEW.macro_custo
    AND grupo_custo = NEW.grupo_custo
    AND centro_custo = NEW.centro_custo
    AND subcentro    = NEW.subcentro;

  IF v_escopo IS NULL THEN
    RAISE EXCEPTION
      'planejamento_financeiro: plano de contas tem match único mas escopo_negocio NULL para macro=%, grupo=%, centro=%, subcentro=%. Corrija o plano.',
      NEW.macro_custo, NEW.grupo_custo, NEW.centro_custo, NEW.subcentro
      USING ERRCODE = '23502';
  END IF;

  NEW.escopo_negocio := v_escopo;
  RETURN NEW;
END;
$$;


--
-- Name: resolve_transfer_destination_fazenda(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_transfer_destination_fazenda(_origem_fazenda_id uuid, _destino_nome text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT f_dest.id
    FROM public.fazendas f_dest
    JOIN public.fazendas f_orig ON f_orig.id = _origem_fazenda_id
    WHERE trim(lower(f_dest.nome)) = trim(lower(_destino_nome))
      AND f_dest.cliente_id = f_orig.cliente_id
      AND f_dest.id <> _origem_fazenda_id
    ORDER BY f_dest.created_at ASC
    LIMIT 1
  $$;


--
-- Name: save_boitel_planejamento_historico(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_boitel_planejamento_historico() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.boitel_planejamento_historico (boitel_lote_id, versao, dados)
  VALUES (OLD.boitel_lote_id, OLD.versao, to_jsonb(OLD));
  NEW.versao := OLD.versao + 1;
  RETURN NEW;
END;
$$;


--
-- Name: set_financeiro_lancamento_v2_hash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_financeiro_lancamento_v2_hash() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.lote_importacao_id IS NOT NULL THEN
    NEW.hash_importacao := public.compute_financeiro_lancamento_v2_hash(
      NEW.cliente_id,
      NEW.fazenda_id,
      NEW.data_competencia,
      NEW.data_pagamento,
      NEW.valor,
      NEW.tipo_operacao,
      NEW.conta_bancaria_id,
      NEW.descricao,
      NEW.favorecido_id,
      NEW.documento,
      NEW.numero_documento
    );
  ELSE
    NEW.hash_importacao := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: set_lancamento_audit_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_lancamento_audit_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by = auth.uid();
    NEW.updated_by = auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by = auth.uid();
    NEW.created_by = OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: shares_fazenda(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shares_fazenda(_viewer_id uuid, _target_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fazenda_membros a
    JOIN public.fazenda_membros b ON a.fazenda_id = b.fazenda_id
    WHERE a.user_id = _viewer_id AND b.user_id = _target_user_id
  )
$$;


--
-- Name: sync_transferencia_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_transferencia_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  dest_fazenda_id uuid;
  dest_cliente_id uuid;
  entrada_id uuid;
BEGIN
  IF NEW.tipo != 'transferencia_saida' THEN RETURN NEW; END IF;

  IF NEW.transferencia_par_id IS NULL THEN
    IF NEW.fazenda_destino IS NULL THEN RETURN NEW; END IF;
    dest_fazenda_id := public.resolve_transfer_destination_fazenda(NEW.fazenda_id, NEW.fazenda_destino);
    IF dest_fazenda_id IS NULL THEN RETURN NEW; END IF;
    SELECT cliente_id INTO dest_cliente_id FROM public.fazendas WHERE id = dest_fazenda_id;

    INSERT INTO public.lancamentos (
      fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
      fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
      preco_medio_cabeca, observacao, transferencia_par_id, status_operacional, cenario
    ) VALUES (
      dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada',
      NEW.quantidade, NEW.categoria, NEW.categoria_destino,
      NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
      NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional, NEW.cenario
    )
    RETURNING id INTO entrada_id;

    UPDATE public.lancamentos SET transferencia_par_id = entrada_id WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Soft-delete propagation
  IF NEW.cancelado = true AND OLD.cancelado = false THEN
    UPDATE public.lancamentos
    SET cancelado = true, cancelado_em = NEW.cancelado_em, cancelado_por = NEW.cancelado_por
    WHERE id = NEW.transferencia_par_id AND cancelado = false;
    RETURN NEW;
  END IF;

  -- Sync update
  dest_fazenda_id := public.resolve_transfer_destination_fazenda(NEW.fazenda_id, NEW.fazenda_destino);

  UPDATE public.lancamentos
  SET fazenda_id = COALESCE(dest_fazenda_id, fazenda_id),
      data = NEW.data, quantidade = NEW.quantidade, categoria = NEW.categoria,
      categoria_destino = NEW.categoria_destino, fazenda_origem = NEW.fazenda_origem,
      fazenda_destino = NEW.fazenda_destino, peso_medio_kg = NEW.peso_medio_kg,
      peso_medio_arrobas = NEW.peso_medio_arrobas, preco_medio_cabeca = NEW.preco_medio_cabeca,
      observacao = NEW.observacao, status_operacional = NEW.status_operacional, cenario = NEW.cenario
  WHERE id = NEW.transferencia_par_id;

  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_auto_codigo_conta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_auto_codigo_conta() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- DEFESA: UPDATE não pode apagar codigo_conta existente
  IF TG_OP = 'UPDATE'
     AND OLD.codigo_conta IS NOT NULL
     AND NEW.codigo_conta IS NULL THEN
    NEW.codigo_conta := OLD.codigo_conta;
    RETURN NEW;
  END IF;

  -- GERAÇÃO: codigo NULL + ativa + tipo + cliente presentes
  IF NEW.codigo_conta IS NULL
     AND NEW.ativa = true
     AND NEW.tipo_conta IS NOT NULL
     AND NEW.cliente_id IS NOT NULL THEN
    NEW.codigo_conta := fn_gerar_codigo_conta(NEW.cliente_id, NEW.tipo_conta);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_guard_lancamento_mes_fechado_p1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_guard_lancamento_mes_fechado_p1() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  _ano_mes text;
  _fazenda_id uuid;
  _p1_status text;
  _status_json jsonb;
BEGIN
  -- Cenário meta não participa de fechamento
  IF TG_OP = 'INSERT' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' AND OLD.cenario = 'meta' THEN RETURN OLD; END IF;

  -- Derivar ano_mes e fazenda_id do registro afetado
  -- CORREÇÃO: usar ::text para cast correto de date
  IF TG_OP = 'DELETE' THEN
    _ano_mes := substring(OLD.data::text, 1, 7);
    _fazenda_id := OLD.fazenda_id;
  ELSIF TG_OP = 'INSERT' THEN
    _ano_mes := substring(NEW.data::text, 1, 7);
    _fazenda_id := NEW.fazenda_id;
  ELSE -- UPDATE
    _ano_mes := substring(OLD.data::text, 1, 7);
    _fazenda_id := OLD.fazenda_id;
  END IF;

  _status_json := get_status_pilares_fechamento(_fazenda_id, _ano_mes);
  _p1_status := _status_json->'p1_mapa_pastos'->>'status';

  IF _p1_status != 'oficial' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para excluir lançamentos.', _ano_mes;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para inserir novos lançamentos.', _ano_mes;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.data IS DISTINCT FROM NEW.data)
       OR (OLD.tipo IS DISTINCT FROM NEW.tipo)
       OR (OLD.quantidade IS DISTINCT FROM NEW.quantidade)
       OR (OLD.categoria IS DISTINCT FROM NEW.categoria)
       OR (OLD.categoria_destino IS DISTINCT FROM NEW.categoria_destino)
       OR (OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id)
       OR (OLD.fazenda_destino IS DISTINCT FROM NEW.fazenda_destino)
       OR (OLD.fazenda_origem IS DISTINCT FROM NEW.fazenda_origem)
       OR (OLD.cancelado IS DISTINCT FROM NEW.cancelado)
    THEN
      RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.', _ano_mes;
    END IF;

    -- CORREÇÃO: ::text em todos os substring de data
    IF substring(OLD.data::text, 1, 7) IS DISTINCT FROM substring(NEW.data::text, 1, 7)
       OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id THEN
      _status_json := get_status_pilares_fechamento(NEW.fazenda_id, substring(NEW.data::text, 1, 7));
      _p1_status := _status_json->'p1_mapa_pastos'->>'status';
      IF _p1_status = 'oficial' THEN
        RAISE EXCEPTION 'O mês destino % também está fechado no Mapa de Pastos (P1 oficial).', substring(NEW.data::text, 1, 7);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_invalidate_zoot_cache(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_invalidate_zoot_cache() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old_faz uuid; v_old_ano int;
  v_new_faz uuid; v_new_ano int;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_new_faz := NEW.fazenda_id;
    v_new_ano := EXTRACT(year FROM NEW.data)::int;
    DELETE FROM public.zoot_mensal_cache
      WHERE fazenda_id = v_new_faz AND ano = v_new_ano;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_old_faz := OLD.fazenda_id;
    v_old_ano := EXTRACT(year FROM OLD.data)::int;
    IF TG_OP = 'DELETE' OR v_old_faz <> v_new_faz OR v_old_ano <> v_new_ano THEN
      DELETE FROM public.zoot_mensal_cache
        WHERE fazenda_id = v_old_faz AND ano = v_old_ano;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: validate_cenario_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_cenario_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.cenario = 'meta' AND NEW.status_operacional IS NOT NULL THEN
    RAISE EXCEPTION 'Registros META (cenario=meta) não podem ter status_operacional. Valor recebido: %', NEW.status_operacional;
  END IF;
  IF NEW.cenario = 'realizado' THEN
    IF NEW.status_operacional IS NULL THEN
      RAISE EXCEPTION 'Registros operacionais (cenario=realizado) precisam de status_operacional.';
    END IF;
    IF NEW.status_operacional NOT IN ('programado', 'agendado', 'realizado') THEN
      RAISE EXCEPTION 'status_operacional inválido: %. Valores aceitos: programado, agendado, realizado', NEW.status_operacional;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_lancamento_campos_por_tipo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_lancamento_campos_por_tipo() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Skip validation for cancellations
  IF TG_OP = 'UPDATE' AND NEW.cancelado = true THEN
    RETURN NEW;
  END IF;

  -- Skip validation for meta scenario (less strict)
  IF NEW.cenario = 'meta' THEN
    RETURN NEW;
  END IF;

  -- Universal: fazenda_id, data, categoria, quantidade are already NOT NULL in schema

  -- Block manual insertion of transferencia_entrada (auto-created by pair trigger)
  IF NEW.tipo = 'transferencia_entrada' AND NEW.transferencia_par_id IS NULL THEN
    RAISE EXCEPTION 'Transferência de entrada não pode ser criada manualmente. Use transferência de saída para gerar o par automaticamente.';
  END IF;

  -- Type-specific validation
  CASE NEW.tipo
    WHEN 'saldo_inicial' THEN
      -- Minimal: just fazenda, data, categoria, quantidade (all NOT NULL already)
      -- saldo_inicial must not have financial fields
      NULL;

    WHEN 'nascimento' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Nascimento deve ter quantidade > 0.';
      END IF;

    WHEN 'compra' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Compra deve ter quantidade > 0.';
      END IF;

    WHEN 'venda', 'venda_pe' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Venda deve ter quantidade > 0.';
      END IF;

    WHEN 'abate' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Abate deve ter quantidade > 0.';
      END IF;

    WHEN 'morte' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Morte deve ter quantidade > 0.';
      END IF;

    WHEN 'consumo' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Consumo deve ter quantidade > 0.';
      END IF;

    WHEN 'transferencia_saida' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Transferência deve ter quantidade > 0.';
      END IF;
      IF NEW.fazenda_destino IS NULL THEN
        RAISE EXCEPTION 'Transferência de saída deve informar fazenda de destino.';
      END IF;

    WHEN 'transferencia_entrada' THEN
      -- Auto-created, minimal validation
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Transferência de entrada deve ter quantidade > 0.';
      END IF;

    WHEN 'reclassificacao' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Reclassificação deve ter quantidade > 0.';
      END IF;
      IF NEW.categoria_destino IS NULL THEN
        RAISE EXCEPTION 'Reclassificação deve informar categoria de destino.';
      END IF;
      IF NEW.categoria = NEW.categoria_destino THEN
        RAISE EXCEPTION 'Reclassificação: categoria de origem e destino não podem ser iguais.';
      END IF;

    ELSE
      -- Unknown type: allow but log warning via NOTICE
      RAISE NOTICE 'Tipo de lançamento desconhecido: %', NEW.tipo;
  END CASE;

  -- Auto-derive peso_vivo_total if not provided
  IF NEW.peso_vivo_total IS NULL AND NEW.peso_medio_kg IS NOT NULL AND NEW.quantidade > 0 THEN
    NEW.peso_vivo_total := NEW.quantidade::numeric * NEW.peso_medio_kg;
  END IF;

  -- Auto-derive rendimento_carcaca if both weights available
  IF NEW.rendimento_carcaca IS NULL 
     AND NEW.peso_medio_kg IS NOT NULL AND NEW.peso_medio_kg > 0
     AND NEW.peso_carcaca_kg IS NOT NULL AND NEW.peso_carcaca_kg > 0 THEN
    NEW.rendimento_carcaca := round((NEW.peso_carcaca_kg / NEW.peso_medio_kg) * 100, 2);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: _backup_rebanho_auto_escopo_null_20260515; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._backup_rebanho_auto_escopo_null_20260515 (
    id uuid,
    cliente_id uuid,
    fazenda_id uuid,
    ano integer,
    mes integer,
    macro_custo text,
    grupo_custo text,
    centro_custo text,
    subcentro text,
    escopo_antes text,
    valor_planejado numeric,
    origem text,
    cenario text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    snapshot_em timestamp with time zone
);


--
-- Name: _backup_venda_amendoim_escopo_20260515; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._backup_venda_amendoim_escopo_20260515 (
    origem_snapshot text,
    id text,
    cliente_id uuid,
    fazenda_id uuid,
    ano integer,
    mes integer,
    macro_custo text,
    grupo_custo text,
    centro_custo text,
    subcentro text,
    escopo_antes text,
    valor_planejado numeric,
    origem text,
    cenario text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    snapshot_em timestamp with time zone
);


--
-- Name: _bkp_p0h_cbi_20260630; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._bkp_p0h_cbi_20260630 (
    id uuid,
    cliente_id uuid,
    extrato_id uuid,
    lancamento_id uuid,
    valor_aplicado numeric(14,2),
    criado_por uuid,
    created_at timestamp with time zone,
    sugestao_score_aprovado numeric(5,2),
    snapshot_extrato_valor numeric(15,2),
    snapshot_lancamento_valor numeric(15,2),
    snapshot_extrato_data date,
    snapshot_lancamento_data date,
    snapshot_favorecido_id uuid,
    snapshot_historico_banco text,
    snapshot_flags_no_momento jsonb,
    tipo_aprovacao text,
    aprovado_por uuid,
    aprovado_em timestamp with time zone,
    desfeito_em timestamp with time zone,
    desfeito_por uuid,
    desfeito_motivo text
);


--
-- Name: _bkp_p0h_extrato_20260630; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._bkp_p0h_extrato_20260630 (
    id uuid,
    cliente_id uuid,
    conta_bancaria_id uuid,
    importacao_id uuid,
    data_movimento date,
    descricao text,
    documento text,
    valor numeric(14,2),
    tipo_movimento text,
    saldo_apos numeric(14,2),
    hash_movimento text,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flag_suspeita_valor boolean,
    flag_suspeita_fornecedor boolean,
    flag_suspeita_motivo text,
    orfao_definitivo boolean,
    orfao_definitivo_motivo text,
    orfao_definitivo_por uuid,
    orfao_definitivo_em timestamp with time zone,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelado_motivo text
);


--
-- Name: _bkp_p0h_lancto_20260630; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._bkp_p0h_lancto_20260630 (
    id uuid,
    cliente_id uuid,
    fazenda_id uuid,
    ano_mes text,
    data_pagamento date,
    valor numeric,
    tipo_operacao text,
    descricao text,
    status_transacao text,
    cancelado boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    conta_bancaria_id uuid,
    data_competencia date,
    documento text,
    historico text,
    sinal text,
    macro_custo text,
    centro_custo text,
    subcentro text,
    escopo_negocio text,
    plano_conta_id uuid,
    favorecido_id uuid,
    origem_lancamento text,
    lote_importacao_id uuid,
    transferencia_grupo_id uuid,
    conciliado_em timestamp with time zone,
    observacao text,
    created_by uuid,
    updated_by uuid,
    numero_documento text,
    forma_pagamento text,
    dados_pagamento jsonb,
    contrato_id uuid,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    editado_manual boolean,
    hash_importacao text,
    movimentacao_rebanho_id uuid,
    origem_tipo text,
    boitel_id uuid,
    grupo_geracao_id uuid,
    boitel_lote_id uuid,
    conta_destino_id uuid,
    tipo_documento text,
    importado_duplicado boolean,
    grupo_custo text,
    status_duplicidade text,
    duplicado_de_id uuid,
    nivel_duplicidade integer,
    sem_movimentacao_caixa boolean,
    cenario text,
    financiamento_id uuid,
    origem_apontamento public.origem_apontamento_enum,
    orfao_definitivo boolean,
    orfao_definitivo_motivo text,
    orfao_definitivo_por uuid,
    orfao_definitivo_em timestamp with time zone,
    staging_id uuid,
    safra_id uuid
);


--
-- Name: admin_agroinblue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_agroinblue (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: analise_consultor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analise_consultor (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    ano integer NOT NULL,
    mes integer NOT NULL,
    versao integer DEFAULT 1 NOT NULL,
    usuario_gerador uuid,
    data_geracao timestamp with time zone DEFAULT now() NOT NULL,
    data_fechamento timestamp with time zone,
    periodo_texto text DEFAULT ''::text NOT NULL,
    status_fechamento text DEFAULT 'rascunho'::text NOT NULL,
    observacoes_manuais text,
    json_blocos jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    usuario_id uuid,
    modulo text NOT NULL,
    acao text NOT NULL,
    tabela_origem text NOT NULL,
    registro_id uuid,
    resumo text,
    dados_anteriores jsonb,
    dados_novos jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_movimentacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_movimentacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lancamento_id uuid,
    usuario_id uuid,
    cliente_id uuid,
    fazenda_id uuid,
    acao text NOT NULL,
    dados_anteriores jsonb,
    dados_novos jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    movimentacao_id uuid,
    financeiro_ids uuid[],
    detalhes jsonb
);


--
-- Name: backup_lanc_transferencia_entrada_2020_nj_20260514; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_lanc_transferencia_entrada_2020_nj_20260514 (
    id uuid,
    fazenda_id uuid,
    data date,
    tipo text,
    categoria_id uuid,
    quantidade integer,
    peso_total numeric,
    valor_total numeric,
    preco_unitario numeric,
    arroba numeric,
    rendimento numeric,
    cenario text,
    origem text,
    observacao text,
    destino_final text,
    abate_frigorifico text,
    abate_fornecedor_id uuid,
    fazenda_destino text,
    fazenda_destino_id uuid,
    categoria_mae_id uuid,
    motivo text,
    numero_id text,
    created_at timestamp with time zone,
    cancelado boolean,
    cliente_id uuid,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    updated_at timestamp with time zone,
    ano_mes text,
    categoria text,
    categoria_destino text,
    fazenda_origem text,
    comprador_fornecedor text,
    peso_medio_kg numeric,
    peso_medio_arrobas numeric,
    preco_medio_cabeca numeric,
    preco_arroba numeric,
    peso_carcaca_kg numeric,
    bonus_precoce numeric,
    bonus_qualidade numeric,
    bonus_lista_trace numeric,
    desconto_qualidade numeric,
    desconto_funrural numeric,
    outros_descontos numeric,
    acrescimos numeric,
    deducoes numeric,
    numero_documento text,
    tipo_peso text,
    status_operacional text,
    data_venda date,
    data_embarque date,
    data_abate date,
    tipo_venda text,
    detalhes_snapshot jsonb,
    frigorifico text,
    pedido text,
    instrucao text,
    doc_acerto text,
    anexo_nf_url text,
    anexo_acerto_url text,
    created_by uuid,
    updated_by uuid,
    origem_registro text,
    lote_importacao_id uuid,
    transferencia_par_id uuid,
    rendimento_carcaca numeric,
    peso_vivo_total numeric,
    comprador_fornecedor_id uuid,
    boitel_id uuid,
    boitel_lote_id uuid,
    tipo_abate text,
    lote text,
    sexo text,
    finalidade text,
    hash_linha text
);


--
-- Name: bancos_referencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bancos_referencia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo_banco text NOT NULL,
    nome_banco text NOT NULL,
    nome_curto text NOT NULL,
    ordem_exibicao integer DEFAULT 99 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: boitel_adiantamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boitel_adiantamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lote_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    data date NOT NULL,
    valor numeric DEFAULT 0 NOT NULL,
    descricao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boitel_lotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boitel_lotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    nome text NOT NULL,
    data_entrada date,
    data_saida_prevista date,
    data_saida_real date,
    status text DEFAULT 'ativo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boitel_operacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boitel_operacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lote_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    tipo text NOT NULL,
    data date NOT NULL,
    quantidade integer DEFAULT 0 NOT NULL,
    peso_total_kg numeric DEFAULT 0 NOT NULL,
    valor numeric DEFAULT 0 NOT NULL,
    observacoes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boitel_planejamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boitel_planejamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    cabecas_previstas integer DEFAULT 0 NOT NULL,
    diaria_prevista numeric DEFAULT 0 NOT NULL,
    receita_prevista numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boitel_planejamento_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boitel_planejamento_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    planejamento_id uuid NOT NULL,
    versao integer NOT NULL,
    dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    ordem integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT categorias_tipo_check CHECK ((tipo = ANY (ARRAY['m'::text, 'f'::text])))
);


--
-- Name: categorias_rebanho; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_rebanho (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text,
    nome text,
    ordem_exibicao integer,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cfg_categoria_parametros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cfg_categoria_parametros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    categoria_id uuid NOT NULL,
    peso_medio_entrada_kg numeric,
    peso_medio_saida_kg numeric,
    gmd_meta_kg numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    categoria_codigo text NOT NULL,
    peso_min_kg numeric NOT NULL,
    peso_max_kg numeric NOT NULL,
    categoria_proxima text,
    peso_evolucao_kg numeric,
    ordem_hierarquia integer NOT NULL,
    grupo text NOT NULL,
    ativo boolean DEFAULT true,
    is_default boolean DEFAULT false
);


--
-- Name: chuvas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chuvas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    fazenda_id uuid NOT NULL,
    data date NOT NULL,
    milimetros numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    cliente_id uuid,
    created_by uuid
);


--
-- Name: chuvas_backup_20260516; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chuvas_backup_20260516 (
    id uuid,
    fazenda_id uuid,
    data date,
    milimetros numeric,
    created_at timestamp with time zone,
    cliente_id uuid
);


--
-- Name: cliente_membros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_membros (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    perfil text DEFAULT 'gestor_cliente'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nome text NOT NULL,
    email text,
    telefone text,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    ativo boolean DEFAULT true,
    slug text,
    config jsonb
);


--
-- Name: competencia_fechamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competencia_fechamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    ano_mes text NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    fechado_por uuid,
    fechado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conciliacao_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conciliacao_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    acao text NOT NULL,
    actor_user_id uuid,
    cliente_id uuid NOT NULL,
    extrato_id uuid,
    lancamento_id uuid,
    conciliacao_id uuid,
    importacao_id uuid,
    ano_mes text,
    payload_antes jsonb,
    payload_depois jsonb,
    motivo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conciliacao_audit_log_acao_check CHECK ((acao = ANY (ARRAY['conciliacao_criada'::text, 'conciliacao_desfeita'::text, 'conciliacao_substituida'::text, 'extrato_marcado_orfao'::text, 'extrato_desmarcado_orfao'::text, 'lancamento_marcado_orfao'::text, 'lancamento_desmarcado_orfao'::text, 'importacao_revertida'::text, 'mes_reaberto'::text, 'mes_fechado'::text, 'warning_mes_fechado'::text, 'warning_delete_extrato'::text, 'extrato_ignorado'::text, 'derivado_promovido_independente'::text, 'derivado_cancelado_com_origem'::text])))
);


--
-- Name: TABLE conciliacao_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.conciliacao_audit_log IS 'Mesa Operacional v2. Append-only audit log de todas as ações reversíveis.
DELETE e UPDATE proibidos via trigger (trg_audit_bloqueia_update / _delete).
Princípio 8 da Constituição: reversibilidade obrigatória. Criada PR0.A.';


--
-- Name: COLUMN conciliacao_audit_log.actor_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conciliacao_audit_log.actor_user_id IS 'Mesa Operacional v2. UUID do usuário que executou a ação.
Sem FK para auth.users (acoplamento). Criada PR0.A.';


--
-- Name: COLUMN conciliacao_audit_log.payload_antes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conciliacao_audit_log.payload_antes IS 'Mesa Operacional v2. Snapshot JSONB do estado antes da ação.
Permite reconstrução do estado anterior em caso de auditoria. Criada PR0.A.';


--
-- Name: conciliacao_bancaria_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conciliacao_bancaria_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    extrato_id uuid NOT NULL,
    lancamento_id uuid NOT NULL,
    valor_aplicado numeric(14,2) NOT NULL,
    criado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sugestao_score_aprovado numeric(5,2),
    snapshot_extrato_valor numeric(15,2),
    snapshot_lancamento_valor numeric(15,2),
    snapshot_extrato_data date,
    snapshot_lancamento_data date,
    snapshot_favorecido_id uuid,
    snapshot_historico_banco text,
    snapshot_flags_no_momento jsonb,
    tipo_aprovacao text DEFAULT 'manual'::text NOT NULL,
    aprovado_por uuid,
    aprovado_em timestamp with time zone,
    desfeito_em timestamp with time zone,
    desfeito_por uuid,
    desfeito_motivo text,
    CONSTRAINT chk_tipo_aprovacao CHECK ((tipo_aprovacao = ANY (ARRAY['manual'::text, 'sugestao_forte_aprovada'::text, 'sugestao_fraca_aprovada'::text, 'staging_auto'::text])))
);


--
-- Name: COLUMN conciliacao_bancaria_itens.snapshot_extrato_valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conciliacao_bancaria_itens.snapshot_extrato_valor IS 'Mesa Operacional v2. Valor do extrato no momento da conciliação.
Preserva contexto histórico mesmo se extrato for editado depois. Criada PR0.A.';


--
-- Name: COLUMN conciliacao_bancaria_itens.snapshot_lancamento_valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conciliacao_bancaria_itens.snapshot_lancamento_valor IS 'Mesa Operacional v2. Valor do lançamento no momento da conciliação.
Preserva contexto histórico mesmo se lançamento for editado depois. Criada PR0.A.';


--
-- Name: COLUMN conciliacao_bancaria_itens.snapshot_flags_no_momento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conciliacao_bancaria_itens.snapshot_flags_no_momento IS 'Mesa Operacional v2. JSONB com flags ortogonais ativas no momento da
conciliação (suspeita_valor, suspeita_fornecedor, etc). Permite auditoria
posterior do contexto. Criada PR0.A.';


--
-- Name: COLUMN conciliacao_bancaria_itens.tipo_aprovacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conciliacao_bancaria_itens.tipo_aprovacao IS 'Mesa Operacional v2. Como esta conciliação foi aprovada:
manual / sugestao_forte_aprovada / sugestao_fraca_aprovada / staging_auto.
Criada PR0.A.';


--
-- Name: COLUMN conciliacao_bancaria_itens.desfeito_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conciliacao_bancaria_itens.desfeito_em IS 'Mesa Operacional v2. Soft delete da conciliação. NUNCA DELETE físico.
Audit log registra desfazimento. Criada PR0.A.';


--
-- Name: excel_linhas_aux; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.excel_linhas_aux (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    conta_bancaria_id uuid,
    data_referencia date,
    valor numeric,
    fornecedor_texto text,
    fazenda_texto text,
    plano_texto text,
    centro_texto text,
    produto_texto text,
    observacao text,
    favorecido_id uuid,
    fazenda_id uuid,
    status text DEFAULT 'pendente'::text NOT NULL,
    aplicada_lancamento_id uuid,
    aplicada_extrato_id uuid,
    aplicada_em timestamp with time zone,
    payload_extra jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origem text DEFAULT 'excel'::text NOT NULL,
    CONSTRAINT excel_linhas_aux_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aplicada'::text, 'descartada'::text])))
);


--
-- Name: extrato_bancario_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extrato_bancario_staging (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    conta_bancaria_id uuid NOT NULL,
    nome_arquivo text NOT NULL,
    hash_arquivo text NOT NULL,
    tamanho_bytes integer,
    periodo_inicio date NOT NULL,
    periodo_fim date NOT NULL,
    saldo_inicial_arquivo numeric(15,2),
    saldo_final_arquivo numeric(15,2),
    status text DEFAULT 'aberto'::text NOT NULL,
    total_linhas integer DEFAULT 0 NOT NULL,
    total_ja_importadas integer DEFAULT 0 NOT NULL,
    total_novas integer DEFAULT 0 NOT NULL,
    total_aguardando integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expira_em timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    confirmado_em timestamp with time zone,
    descartado_em timestamp with time zone,
    CONSTRAINT extrato_bancario_staging_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'confirmado'::text, 'descartado'::text, 'expirado'::text])))
);


--
-- Name: TABLE extrato_bancario_staging; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.extrato_bancario_staging IS 'Mesa Operacional v2. Staging persistente da importação OFX antes da gravação
em extrato_bancario_v2. TTL 24h via fn_expirar_stagings_antigos.
Princípio 9 da Constituição: operador no controle. Criada PR0.A.';


--
-- Name: extrato_bancario_staging_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extrato_bancario_staging_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staging_id uuid NOT NULL,
    data_movimento date NOT NULL,
    valor numeric(15,2) NOT NULL,
    historico text NOT NULL,
    documento_ofx text,
    hash_movimento text NOT NULL,
    status_staging text DEFAULT 'aguardando_decisao'::text NOT NULL,
    lancamento_sugerido_id uuid,
    sugestao_score numeric(5,2),
    sugestao_calculada_em timestamp with time zone,
    extrato_final_id uuid,
    conciliacao_final_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT extrato_bancario_staging_itens_status_staging_check CHECK ((status_staging = ANY (ARRAY['ja_importado'::text, 'aguardando_decisao'::text, 'decidido_auto_conciliar'::text, 'decidido_revisar'::text, 'decidido_orfao'::text])))
);


--
-- Name: TABLE extrato_bancario_staging_itens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.extrato_bancario_staging_itens IS 'Mesa Operacional v2. Linhas em staging de uma importação OFX, cada uma com
decisão do operador (auto-conciliar / revisar / órfão) antes do confirm. Criada PR0.A.';


--
-- Name: extrato_bancario_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extrato_bancario_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    conta_bancaria_id uuid NOT NULL,
    importacao_id uuid,
    data_movimento date NOT NULL,
    descricao text,
    documento text,
    valor numeric(14,2) NOT NULL,
    tipo_movimento text NOT NULL,
    saldo_apos numeric(14,2),
    hash_movimento text NOT NULL,
    status text DEFAULT 'nao_conciliado'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    flag_suspeita_valor boolean DEFAULT false NOT NULL,
    flag_suspeita_fornecedor boolean DEFAULT false NOT NULL,
    flag_suspeita_motivo text,
    orfao_definitivo boolean DEFAULT false NOT NULL,
    orfao_definitivo_motivo text,
    orfao_definitivo_por uuid,
    orfao_definitivo_em timestamp with time zone,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelado_motivo text,
    ignorado_em timestamp with time zone,
    ignorado_por uuid,
    ignorado_motivo text,
    ignorado_ultima_copia boolean,
    ignorado_impacto numeric,
    seq_ocorrencia integer DEFAULT 1 NOT NULL,
    CONSTRAINT extrato_bancario_v2_status_check CHECK ((status = ANY (ARRAY['nao_conciliado'::text, 'parcial'::text, 'conciliado'::text, 'ignorado'::text]))),
    CONSTRAINT extrato_bancario_v2_tipo_movimento_check CHECK ((tipo_movimento = ANY (ARRAY['credito'::text, 'debito'::text])))
);


--
-- Name: COLUMN extrato_bancario_v2.flag_suspeita_valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.extrato_bancario_v2.flag_suspeita_valor IS 'Mesa Operacional v2. Valor fora de padrão histórico (calc estrutural via
desvio padrão, sem ML). Calibrado em PR6. Criada PR0.A.';


--
-- Name: COLUMN extrato_bancario_v2.flag_suspeita_fornecedor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.extrato_bancario_v2.flag_suspeita_fornecedor IS 'Mesa Operacional v2. Favorecido nunca usado antes desta movimentação.
Calc estrutural via histórico. Calibrado em PR6. Criada PR0.A.';


--
-- Name: COLUMN extrato_bancario_v2.flag_suspeita_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.extrato_bancario_v2.flag_suspeita_motivo IS 'Mesa Operacional v2. Texto livre detalhando razão das flags de suspeita. Criada PR0.A.';


--
-- Name: COLUMN extrato_bancario_v2.orfao_definitivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.extrato_bancario_v2.orfao_definitivo IS 'Mesa Operacional v2. Operador marcou que este movimento bancário permanece
sem apontamento por decisão deliberada (ex: tarifa não declarável). Criada PR0.A.';


--
-- Name: COLUMN extrato_bancario_v2.cancelado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.extrato_bancario_v2.cancelado_em IS 'Mesa Operacional v2. Soft delete. DELETE físico bloqueado por trigger.
Reversibilidade obrigatória (princípio 8 da Constituição). Criada PR0.A.';


--
-- Name: fazenda_cadastros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fazenda_cadastros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    area_total_ha numeric,
    area_produtiva_ha numeric,
    municipio text,
    estado text,
    car text,
    nirf text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    area_pecuaria_ha numeric,
    area_agricultura_ha numeric,
    area_app_ha numeric,
    area_reserva_ha numeric,
    area_benfeitorias_ha numeric,
    area_outras_ha numeric,
    ie text
);


--
-- Name: fazenda_membros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fazenda_membros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid NOT NULL,
    user_id uuid NOT NULL,
    papel text DEFAULT 'membro'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fazenda_status_mensal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fazenda_status_mensal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    ano_mes text NOT NULL,
    ativa_no_mes boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fazendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fazendas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    cliente_id uuid NOT NULL,
    nome text NOT NULL,
    cidade text,
    estado text,
    area_total numeric,
    created_at timestamp with time zone DEFAULT now(),
    codigo_importacao text,
    owner_id uuid,
    tem_pecuaria boolean DEFAULT true,
    codigo text,
    status_operacional text DEFAULT 'ativa'::text
);


--
-- Name: fechamento_area_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_area_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano_mes date NOT NULL,
    area_total_ha numeric(10,2),
    area_produtiva_ha numeric(10,2) NOT NULL,
    area_pecuaria_ha numeric(10,2),
    area_agricultura_ha numeric(10,2),
    area_reserva_ha numeric(10,2),
    area_benfeitorias_ha numeric(10,2),
    area_outras_ha numeric(10,2),
    origem_area text DEFAULT 'fechamento_p1'::text NOT NULL,
    versao integer DEFAULT 1 NOT NULL,
    fechado_em timestamp with time zone DEFAULT now() NOT NULL,
    fechado_por uuid,
    CONSTRAINT area_produtiva_positiva CHECK ((area_produtiva_ha > (0)::numeric)),
    CONSTRAINT fechamento_area_snapshot_origem_area_check CHECK ((origem_area = 'fechamento_p1'::text))
);


--
-- Name: fechamento_execucoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_execucoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano_mes text NOT NULL,
    pilar text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    executado_por uuid,
    executado_em timestamp with time zone,
    erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fechamento_id uuid NOT NULL,
    acao text NOT NULL,
    usuario_id uuid,
    detalhes jsonb
);


--
-- Name: fechamento_executivo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_executivo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    ano_mes text,
    status text DEFAULT 'rascunho'::text,
    json_data jsonb DEFAULT '{}'::jsonb,
    fechado_por uuid,
    fechado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fechamento_graficos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_graficos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano_mes text NOT NULL,
    tipo_grafico text NOT NULL,
    dados_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fechamento_id uuid NOT NULL,
    secao text NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    subtitulo text,
    ordem integer DEFAULT 0,
    json_dados jsonb DEFAULT '[]'::jsonb,
    json_config jsonb DEFAULT '{}'::jsonb
);


--
-- Name: fechamento_indicadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_indicadores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano_mes text NOT NULL,
    indicador text NOT NULL,
    valor numeric,
    valor_meta numeric,
    unidade text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fechamento_id uuid NOT NULL,
    grupo text NOT NULL,
    subgrupo text,
    chave text NOT NULL,
    label text NOT NULL,
    valor_real numeric,
    valor_ano_anterior numeric,
    formato text DEFAULT 'numero'::text,
    ordem integer DEFAULT 0,
    json_origem jsonb
);


--
-- Name: fechamento_pasto_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_pasto_itens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    fechamento_id uuid NOT NULL,
    categoria_id uuid NOT NULL,
    quantidade integer DEFAULT 0 NOT NULL,
    peso_total numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    peso_medio_kg numeric,
    origem_dado text,
    observacoes text,
    lote text,
    peso_atualizado boolean DEFAULT false NOT NULL
);


--
-- Name: fechamento_pastos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_pastos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    pasto_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ano_mes text DEFAULT ''::text NOT NULL,
    cliente_id uuid,
    updated_at timestamp with time zone DEFAULT now(),
    lote_mes text,
    observacao_mes text,
    qualidade_mes numeric,
    responsavel_nome text,
    tipo_uso_mes text,
    CONSTRAINT fechamento_pastos_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'fechado'::text, 'rascunho'::text, 'pendente'::text])))
);


--
-- Name: fechamento_reaberturas_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_reaberturas_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano_mes text NOT NULL,
    pilar text NOT NULL,
    motivo text,
    reaberto_por uuid,
    reaberto_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fechamento_textos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamento_textos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano_mes text NOT NULL,
    tipo text NOT NULL,
    conteudo text DEFAULT ''::text NOT NULL,
    gerado_por_ia boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fechamento_id uuid NOT NULL,
    secao text NOT NULL,
    texto_ia text,
    texto_editado text,
    texto_final text,
    modelo_ia text,
    prompt_usado text,
    gerado_em timestamp with time zone,
    editado_em timestamp with time zone
);


--
-- Name: fechamentos_executivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamentos_executivos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano_mes text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    periodo_texto text DEFAULT ''::text,
    versao integer DEFAULT 1,
    status_fechamento text DEFAULT 'rascunho'::text,
    usuario_gerador uuid,
    data_geracao timestamp with time zone DEFAULT now(),
    data_fechamento timestamp with time zone,
    observacoes_manuais text,
    pdf_url text
);


--
-- Name: financeiro_centros_custo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_centros_custo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    fazenda_id uuid,
    tipo_operacao text,
    macro_custo text,
    grupo_custo text,
    centro_custo text,
    subcentro text,
    escopo_negocio text,
    ativo boolean DEFAULT true,
    ordem_exibicao integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: financeiro_classificacao_regras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_classificacao_regras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    ativo boolean DEFAULT true NOT NULL,
    prioridade integer DEFAULT 100 NOT NULL,
    origem text DEFAULT 'manual'::text NOT NULL,
    cond_subcentro text,
    cond_fornecedor text,
    cond_produto text,
    cond_observacao text,
    cond_conta_origem text,
    cond_conta_destino text,
    cond_fazenda text,
    cond_safra text,
    cond_tipo_operacao text,
    cond_data_de date,
    cond_data_ate date,
    cond_valor_min numeric,
    cond_valor_max numeric,
    plano_conta_id uuid NOT NULL,
    especificidade integer GENERATED ALWAYS AS (((((((((((((cond_subcentro IS NOT NULL))::integer + ((cond_fornecedor IS NOT NULL))::integer) + ((cond_produto IS NOT NULL))::integer) + ((cond_observacao IS NOT NULL))::integer) + ((cond_conta_origem IS NOT NULL))::integer) + ((cond_conta_destino IS NOT NULL))::integer) + ((cond_fazenda IS NOT NULL))::integer) + ((cond_safra IS NOT NULL))::integer) + ((cond_tipo_operacao IS NOT NULL))::integer) + (((cond_data_de IS NOT NULL) OR (cond_data_ate IS NOT NULL)))::integer) + (((cond_valor_min IS NOT NULL) OR (cond_valor_max IS NOT NULL)))::integer)) STORED,
    observacao_regra text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_class_regra_nao_vazia CHECK (((cond_subcentro IS NOT NULL) OR (cond_fornecedor IS NOT NULL) OR (cond_produto IS NOT NULL) OR (cond_observacao IS NOT NULL) OR (cond_conta_origem IS NOT NULL) OR (cond_conta_destino IS NOT NULL) OR (cond_fazenda IS NOT NULL) OR (cond_safra IS NOT NULL) OR (cond_tipo_operacao IS NOT NULL) OR (cond_data_de IS NOT NULL) OR (cond_data_ate IS NOT NULL) OR (cond_valor_min IS NOT NULL) OR (cond_valor_max IS NOT NULL)))
);


--
-- Name: financeiro_classificacao_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_classificacao_staging (
    staging_id uuid DEFAULT gen_random_uuid() NOT NULL,
    sessao_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    excel_linha_origem integer,
    excel_subcentro text,
    excel_fornecedor text,
    excel_produto text,
    excel_conta_origem text,
    excel_conta_destino text,
    excel_ano_mes text,
    excel_data date,
    excel_valor numeric,
    excel_tipo_operacao text,
    excel_fazenda_codigo text,
    match_lancamento_id uuid,
    match_status text NOT NULL,
    update_proposto jsonb,
    estado_anterior jsonb,
    aplicado boolean DEFAULT false NOT NULL,
    aplicado_em timestamp with time zone,
    aplicado_por uuid,
    erro_apply text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    alias_id_usado uuid,
    conta_origem_id uuid,
    conta_destino_id uuid,
    update_proposto_original jsonb,
    proposto_editado_em timestamp with time zone,
    proposto_editado_por uuid,
    match_resolvido_em timestamp with time zone,
    match_resolvido_por uuid,
    excel_observacao text,
    excel_documento text,
    match_lancamento_ids uuid[],
    CONSTRAINT financeiro_classificacao_staging_match_coerencia_check CHECK ((NOT ((match_lancamento_id IS NOT NULL) AND (match_lancamento_ids IS NOT NULL)))),
    CONSTRAINT financeiro_classificacao_staging_match_status_check CHECK ((match_status = ANY (ARRAY['exato'::text, 'ambiguo'::text, 'sem_match'::text, 'ja_classificado'::text, 'divergente'::text, 'ambiguo_resolvido'::text, 'ja_aplicado'::text, 'sem_conta_para_match'::text, 'candidatos_proximos'::text, 'resolvido_manual'::text, 'resolvido_grupo'::text])))
);


--
-- Name: TABLE financeiro_classificacao_staging; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.financeiro_classificacao_staging IS 'PR-M (26/05/2026): staging Excel→UPDATE. Cada sessao_id agrupa uma importacao. Consultar antes de aplicar via fn_classificacao_apply. Rollback via estado_anterior.';


--
-- Name: COLUMN financeiro_classificacao_staging.match_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_classificacao_staging.match_status IS 'exato=UPDATE elegivel; ambiguo/sem_match/divergente=apenas relatorio; ja_classificado=no-op.';


--
-- Name: COLUMN financeiro_classificacao_staging.update_proposto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_classificacao_staging.update_proposto IS 'jsonb com subcentro/macro/grupo/centro/plano_conta_id/favorecido_id. Apply usa COALESCE para nao sobrescrever com NULL.';


--
-- Name: COLUMN financeiro_classificacao_staging.estado_anterior; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_classificacao_staging.estado_anterior IS 'Snapshot pre-UPDATE. Permite rollback cirurgico via UPDATE ... SET subcentro=estado_anterior->>''subcentro'' WHERE id=match_lancamento_id.';


--
-- Name: COLUMN financeiro_classificacao_staging.alias_id_usado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_classificacao_staging.alias_id_usado IS 'PR-Aliases-Core: FK para o alias que resolveu esta proposta para o plano canonico. NULL = lookup direto ou sem resolucao. Audit trail.';


--
-- Name: financeiro_conciliacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_conciliacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    conta_bancaria_id uuid,
    ano_mes text NOT NULL,
    saldo_extrato numeric DEFAULT 0 NOT NULL,
    saldo_sistema numeric DEFAULT 0 NOT NULL,
    diferenca numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    extrato_id uuid,
    lancamento_id uuid,
    tipo_conciliacao text DEFAULT 'automatica'::text,
    observacao text,
    created_by uuid
);


--
-- Name: financeiro_contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    nome text NOT NULL,
    tipo text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financeiro_contas_bancarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_contas_bancarias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    fazenda_id uuid,
    nome_conta text,
    banco text,
    agencia text,
    numero_conta text,
    tipo_conta text,
    ativa boolean DEFAULT true,
    ordem_exibicao integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    codigo_conta text,
    nome_exibicao text,
    conta_digito text,
    mes_inicio text,
    saldo_inicial_oficial numeric,
    aliases jsonb,
    CONSTRAINT chk_mes_inicio_formato CHECK (((mes_inicio IS NULL) OR (mes_inicio ~ '^\d{4}-\d{2}$'::text))),
    CONSTRAINT financeiro_contas_bancarias_tipo_conta_check CHECK (((tipo_conta IS NULL) OR (tipo_conta = ANY (ARRAY['cc'::text, 'inv'::text, 'cartao'::text]))))
);


--
-- Name: COLUMN financeiro_contas_bancarias.tipo_conta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_contas_bancarias.tipo_conta IS 'Classificacao oficial da conta: cc = conta corrente/caixa/dinheiro; inv = investimento; cartao = cartao.';


--
-- Name: financeiro_contratos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_contratos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    nome text,
    tipo text,
    valor_total numeric DEFAULT 0,
    data_inicio date,
    data_fim date,
    status text DEFAULT 'ativo'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fornecedor_id uuid,
    produto text,
    valor numeric DEFAULT 0,
    frequencia text DEFAULT 'mensal'::text,
    dia_pagamento integer DEFAULT 1,
    forma_pagamento text,
    dados_pagamento text,
    conta_bancaria_id uuid,
    subcentro text,
    centro_custo text,
    macro_custo text,
    observacao text,
    created_by uuid
);


--
-- Name: financeiro_dividendos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_dividendos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    fazenda_id uuid,
    nome text,
    percentual numeric,
    ativo boolean DEFAULT true,
    ordem_exibicao integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: financeiro_duplicidade_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_duplicidade_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    lancamento_id uuid,
    lancamento_duplicado_id uuid,
    score_similaridade numeric,
    resolvido boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financeiro_extrato_bancario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_extrato_bancario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    conta_bancaria_id uuid NOT NULL,
    data date NOT NULL,
    descricao text NOT NULL,
    valor numeric NOT NULL,
    tipo text NOT NULL,
    conciliado boolean DEFAULT false NOT NULL,
    lancamento_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    data_movimento date,
    hash_conciliacao text
);


--
-- Name: financeiro_fechamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_fechamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    fazenda_id uuid,
    ano_mes text,
    status_fechamento text DEFAULT 'aberto'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    fechado_por uuid,
    fechado_em timestamp with time zone,
    observacao text,
    reaberto_por uuid,
    reaberto_em timestamp with time zone
);


--
-- Name: financeiro_fornecedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_fornecedores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    nome text NOT NULL,
    nome_normalizado text,
    aliases jsonb DEFAULT '[]'::jsonb,
    tipo text DEFAULT 'frigorifico'::text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    fazenda_id uuid,
    documento text,
    email text,
    telefone text,
    observacao text,
    escopo text,
    cpf_cnpj text,
    tipo_recebimento text,
    pix_tipo_chave text,
    pix_chave text,
    banco text,
    agencia text,
    conta text,
    tipo_conta text,
    cpf_cnpj_pagamento text,
    nome_favorecido text,
    observacao_pagamento text
);


--
-- Name: financeiro_importacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_importacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    nome_arquivo text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    total_linhas integer DEFAULT 0 NOT NULL,
    total_validas integer DEFAULT 0 NOT NULL,
    total_erros integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financeiro_importacoes_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_importacoes_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    fazenda_id uuid,
    nome_arquivo text,
    data_importacao timestamp with time zone DEFAULT now(),
    status text DEFAULT 'processando'::text,
    total_linhas integer DEFAULT 0,
    total_validas integer DEFAULT 0,
    total_com_erro integer DEFAULT 0,
    erros jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cancelada_em timestamp with time zone,
    cancelado_por text,
    hash_arquivo text,
    owner_user_id uuid,
    cancelado_em timestamp with time zone,
    cancelado_motivo text
);


--
-- Name: COLUMN financeiro_importacoes_v2.hash_arquivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_importacoes_v2.hash_arquivo IS 'Mesa Operacional v2. Hash SHA-256 do conteúdo do arquivo importado.
Permite dedup por arquivo inteiro (independente do nome). Criada PR0.A.';


--
-- Name: COLUMN financeiro_importacoes_v2.owner_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_importacoes_v2.owner_user_id IS 'Mesa Operacional v2. Usuário responsável pela importação.
Sem FK para auth.users (acoplamento). Criada PR0.A.';


--
-- Name: COLUMN financeiro_importacoes_v2.cancelado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_importacoes_v2.cancelado_em IS 'Mesa Operacional v2. Soft delete da importação. Reverter importação cancela
em cascata os lançamentos derivados (via RPC futura). Criada PR0.A.';


--
-- Name: financeiro_lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_lancamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    data date NOT NULL,
    descricao text NOT NULL,
    valor numeric NOT NULL,
    tipo text NOT NULL,
    categoria text,
    subcategoria text,
    conta_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    importacao_id uuid,
    origem_dado text DEFAULT 'import_excel'::text,
    data_realizacao date NOT NULL,
    data_pagamento date,
    ano_mes text NOT NULL,
    produto text,
    fornecedor text,
    status_transacao text,
    tipo_operacao text,
    conta_origem text,
    conta_destino text,
    macro_custo text,
    grupo_custo text,
    centro_custo text,
    subcentro text,
    nota_fiscal text,
    cpf_cnpj text,
    recorrencia text,
    forma_pagamento text,
    obs text,
    escopo_negocio text DEFAULT 'pecuaria'::text,
    editado_manual boolean DEFAULT false,
    hash_importacao text,
    cancelado boolean DEFAULT false
);


--
-- Name: financeiro_lancamentos_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_lancamentos_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    fazenda_id uuid,
    ano_mes text,
    data_pagamento date,
    valor numeric DEFAULT 0 NOT NULL,
    tipo_operacao text,
    descricao text,
    status_transacao text DEFAULT 'pendente'::text,
    cancelado boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    conta_bancaria_id uuid,
    data_competencia date,
    documento text,
    historico text,
    sinal text,
    macro_custo text,
    centro_custo text,
    subcentro text,
    escopo_negocio text,
    plano_conta_id uuid,
    favorecido_id uuid,
    origem_lancamento text,
    lote_importacao_id uuid,
    transferencia_grupo_id uuid,
    conciliado_em timestamp with time zone,
    observacao text,
    created_by uuid,
    updated_by uuid,
    numero_documento text,
    forma_pagamento text,
    dados_pagamento jsonb,
    contrato_id uuid,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    editado_manual boolean,
    hash_importacao text,
    movimentacao_rebanho_id uuid,
    origem_tipo text,
    boitel_id uuid,
    grupo_geracao_id uuid,
    boitel_lote_id uuid,
    conta_destino_id uuid,
    tipo_documento text,
    importado_duplicado boolean,
    grupo_custo text,
    status_duplicidade text,
    duplicado_de_id uuid,
    nivel_duplicidade integer,
    sem_movimentacao_caixa boolean,
    cenario text DEFAULT 'realizado'::text,
    financiamento_id uuid,
    origem_apontamento public.origem_apontamento_enum,
    orfao_definitivo boolean DEFAULT false NOT NULL,
    orfao_definitivo_motivo text,
    orfao_definitivo_por uuid,
    orfao_definitivo_em timestamp with time zone,
    staging_id uuid,
    safra_id uuid,
    cancelado_motivo text
);


--
-- Name: COLUMN financeiro_lancamentos_v2.origem_apontamento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_lancamentos_v2.origem_apontamento IS 'Mesa Operacional v2. Origem estrutural do apontamento financeiro.
NULL permitido até PR0.D (selagem). Backfill em PR0.B. Criada PR0.A.';


--
-- Name: COLUMN financeiro_lancamentos_v2.orfao_definitivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_lancamentos_v2.orfao_definitivo IS 'Mesa Operacional v2. Operador marcou que este apontamento permanece sem
correspondência bancária por decisão deliberada. NÃO é erro; é estado válido.
Criada PR0.A.';


--
-- Name: COLUMN financeiro_lancamentos_v2.orfao_definitivo_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_lancamentos_v2.orfao_definitivo_motivo IS 'Mesa Operacional v2. Motivo da decisão de marcar órfão definitivo. Criada PR0.A.';


--
-- Name: COLUMN financeiro_lancamentos_v2.orfao_definitivo_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_lancamentos_v2.orfao_definitivo_por IS 'Mesa Operacional v2. UUID do usuário que marcou órfão definitivo.
Sem FK para auth.users por decisão arquitetural (acoplamento). Criada PR0.A.';


--
-- Name: COLUMN financeiro_lancamentos_v2.orfao_definitivo_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_lancamentos_v2.orfao_definitivo_em IS 'Mesa Operacional v2. Timestamp da marcação de órfão definitivo. Criada PR0.A.';


--
-- Name: financeiro_mapa_classificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_mapa_classificacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    descricao_original text NOT NULL,
    subcentro_mapeado text,
    centro_custo_mapeado text,
    confirmado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_operacao text,
    macro_custo text
);


--
-- Name: financeiro_plano_contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_plano_contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    tipo_operacao text,
    macro_custo text,
    centro_custo text,
    subcentro text,
    grupo_fluxo text,
    escopo_negocio text,
    ativo boolean DEFAULT true,
    ordem_exibicao integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    grupo_custo text
);


--
-- Name: financeiro_rateio_adm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_rateio_adm (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    ano_mes text NOT NULL,
    valor_total numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    criterio_rateio text DEFAULT 'rebanho'::text,
    valor_total_rateado numeric DEFAULT 0,
    observacao text,
    created_by uuid
);


--
-- Name: financeiro_rateio_adm_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_rateio_adm_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rateio_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    percentual numeric DEFAULT 0 NOT NULL,
    valor numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cliente_id uuid NOT NULL,
    percentual_rateio numeric DEFAULT 0,
    valor_rateado numeric DEFAULT 0,
    base_rateio text
);


--
-- Name: financeiro_resumo_caixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_resumo_caixa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano_mes text NOT NULL,
    saldo_inicial numeric DEFAULT 0 NOT NULL,
    entradas numeric DEFAULT 0 NOT NULL,
    saidas numeric DEFAULT 0 NOT NULL,
    saldo_final numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financeiro_safras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_safras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    nome text NOT NULL,
    codigo text,
    descricao text,
    observacoes text,
    ativa boolean DEFAULT true NOT NULL,
    ordem_exibicao integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financeiro_saldos_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_saldos_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    saldo_id uuid,
    cliente_id uuid,
    acao text,
    campo_alterado text,
    valor_anterior text,
    valor_novo text,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: financeiro_saldos_bancarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_saldos_bancarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid NOT NULL,
    importacao_id uuid,
    conta_banco text NOT NULL,
    ano_mes text NOT NULL,
    saldo_final numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cliente_id uuid NOT NULL
);


--
-- Name: financeiro_saldos_bancarios_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_saldos_bancarios_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    conta_bancaria_id uuid,
    ano_mes text,
    saldo_final numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    saldo_inicial numeric,
    origem_saldo text,
    observacao text,
    fechado boolean DEFAULT false,
    created_by uuid,
    status_mes text,
    origem_saldo_inicial text,
    updated_by uuid,
    fazenda_id uuid
);


--
-- Name: financeiro_subcentro_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_subcentro_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    alias_text text NOT NULL,
    plano_conta_id uuid NOT NULL,
    origem text DEFAULT 'manual'::text NOT NULL,
    observacao text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT alias_text_not_blank CHECK ((length(TRIM(BOTH FROM alias_text)) > 0)),
    CONSTRAINT origem_valida CHECK ((origem = ANY (ARRAY['manual'::text, 'importacao'::text, 'migracao'::text, 'seed'::text])))
);


--
-- Name: TABLE financeiro_subcentro_aliases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.financeiro_subcentro_aliases IS 'PR-Aliases-Core: mapeamento explicito legado para plano oficial. Curado manualmente. Match exato com lower/trim. Cliente_id NULL = global.';


--
-- Name: COLUMN financeiro_subcentro_aliases.alias_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_subcentro_aliases.alias_text IS 'String legada exata como aparece no Excel. Match case-insensitive via lower(trim()). Unicidade enforçada via indices parciais (uniq_alias_cliente + uniq_alias_global) que normalizam com lower(trim()).';


--
-- Name: COLUMN financeiro_subcentro_aliases.plano_conta_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_subcentro_aliases.plano_conta_id IS 'FK para financeiro_plano_contas. Subcentro canonico resolvido vem deste registro.';


--
-- Name: COLUMN financeiro_subcentro_aliases.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financeiro_subcentro_aliases.origem IS 'manual | importacao | migracao. Default manual (CRUD operador).';


--
-- Name: financeiros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    nome text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: financiamento_destinacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiamento_destinacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    financiamento_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    descricao text NOT NULL,
    valor numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financiamento_parcelas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiamento_parcelas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    financiamento_id uuid NOT NULL,
    numero_parcela integer,
    data_vencimento date,
    valor_principal numeric(15,2) DEFAULT 0,
    valor_juros numeric(15,2) DEFAULT 0,
    valor_total numeric(15,2) DEFAULT 0,
    status text DEFAULT 'pendente'::text,
    created_at timestamp with time zone DEFAULT now(),
    cliente_id uuid,
    data_pagamento date,
    lancamento_id uuid,
    observacao text,
    updated_at timestamp with time zone DEFAULT now(),
    lancamento_juros_id uuid
);


--
-- Name: COLUMN financiamento_parcelas.lancamento_juros_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamento_parcelas.lancamento_juros_id IS 'ID oficial do lançamento espelhado de juros em financeiro_lancamentos_v2. Nunca usar observacao para lookup.';


--
-- Name: financiamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    tipo_financiamento text DEFAULT 'pecuaria'::text,
    descricao text,
    valor_total numeric(15,2) DEFAULT 0,
    taxa_juros numeric(10,6) DEFAULT 0,
    data_inicio date,
    plano_conta_parcela_id uuid,
    status text DEFAULT 'ativo'::text,
    created_at timestamp with time zone DEFAULT now(),
    conta_bancaria_id uuid,
    credor_id uuid,
    data_contrato date,
    data_primeira_parcela date,
    gerar_lancamento_captacao boolean DEFAULT false,
    numero_contrato text,
    observacao text,
    plano_conta_captacao_id uuid,
    taxa_juros_mensal numeric DEFAULT 0,
    total_parcelas integer DEFAULT 1,
    updated_at timestamp with time zone DEFAULT now(),
    valor_entrada numeric DEFAULT 0,
    created_by uuid,
    lancamento_captacao_id uuid
);


--
-- Name: mesa_lancamento_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesa_lancamento_staging (
    staging_id uuid DEFAULT gen_random_uuid() NOT NULL,
    sessao_id uuid NOT NULL,
    excel_key text NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    conta_bancaria_id uuid,
    ano_mes text NOT NULL,
    data_pagamento date NOT NULL,
    data_competencia date,
    valor numeric NOT NULL,
    sinal text,
    tipo_operacao text,
    macro_custo text,
    grupo_custo text,
    centro_custo text,
    subcentro text,
    escopo_negocio text,
    descricao text,
    observacao text,
    favorecido_id uuid,
    favorecido_nome_marcado_novo text,
    ofx_extrato_id uuid,
    produto text,
    origem_aprovacao text NOT NULL,
    status_promocao text DEFAULT 'pendente'::text NOT NULL,
    lancamento_v2_id uuid,
    promovido_em timestamp with time zone,
    promovido_por uuid,
    erro_promocao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    conta_texto_excel text,
    conta_resolvida_id uuid,
    conta_resolvida_score integer,
    conta_resolvida_estrategia text,
    motivo_pendencia text,
    CONSTRAINT mesa_lancamento_staging_conta_resolvida_estrategia_check CHECK (((conta_resolvida_estrategia IS NULL) OR (conta_resolvida_estrategia = ANY (ARRAY['alias'::text, 'agencia_numero'::text, 'substring_exibicao'::text, 'substring_banco'::text])))),
    CONSTRAINT mesa_lancamento_staging_origem_aprovacao_check CHECK ((origem_aprovacao = ANY (ARRAY['sugestao_direta'::text, 'corrigido'::text, 'excel_orfao'::text]))),
    CONSTRAINT mesa_lancamento_staging_sinal_check CHECK ((sinal = ANY (ARRAY['1'::text, '-1'::text, '0'::text]))),
    CONSTRAINT mesa_lancamento_staging_status_promocao_check CHECK ((status_promocao = ANY (ARRAY['pendente'::text, 'promovido'::text, 'descartado'::text, 'erro'::text]))),
    CONSTRAINT mesa_lancamento_staging_tipo_operacao_check CHECK ((tipo_operacao = ANY (ARRAY['1-Entradas'::text, '2-Saídas'::text, '3-Transferências'::text]))),
    CONSTRAINT mesa_lancamento_staging_valor_check CHECK ((valor >= (0)::numeric)),
    CONSTRAINT mesa_staging_motivo_pendencia_chk CHECK (((motivo_pendencia IS NULL) OR (motivo_pendencia = ANY (ARRAY['ofx_duplicado'::text, 'ambiguo'::text, 'correcao_manual'::text, 'divergencia'::text]))))
);


--
-- Name: TABLE mesa_lancamento_staging; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mesa_lancamento_staging IS 'Staging de lancamentos pre-promocao. Gerado por PR6.1 a partir de mesa_par aprovados/excel_orfao. PR6.2 promove para financeiro_lancamentos_v2. PR6.3 reverte.';


--
-- Name: COLUMN mesa_lancamento_staging.conta_bancaria_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesa_lancamento_staging.conta_bancaria_id IS 'NULL quando origem_aprovacao=excel_orfao (lancamento sem OFX correspondente).';


--
-- Name: COLUMN mesa_lancamento_staging.favorecido_nome_marcado_novo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesa_lancamento_staging.favorecido_nome_marcado_novo IS 'Nome do fornecedor a criar em PR6.2 (quando operador marcou como novo via fornecedorMarcadoNovo na Mesa).';


--
-- Name: COLUMN mesa_lancamento_staging.ofx_extrato_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesa_lancamento_staging.ofx_extrato_id IS 'NULL quando origem_aprovacao=excel_orfao. Referencia extrato_bancario_v2.id.';


--
-- Name: mesa_ofx_validacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesa_ofx_validacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sessao_id uuid NOT NULL,
    ofx_id uuid NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mesa_ofx_validacao_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'ofx_orfao_validado'::text])))
);


--
-- Name: TABLE mesa_ofx_validacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mesa_ofx_validacao IS 'Validacao manual de OFX como orfao (sem Excel correspondente). PR3.3 persistido. PR5.';


--
-- Name: mesa_par; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesa_par (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sessao_id uuid NOT NULL,
    excel_key text NOT NULL,
    ofx_id_ativo uuid,
    ofx_id_sugerido_original uuid,
    decisao text DEFAULT 'pendente'::text NOT NULL,
    correcao_json jsonb,
    aprovacao_json jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mesa_par_decisao_check CHECK ((decisao = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text, 'excel_orfao'::text])))
);


--
-- Name: TABLE mesa_par; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mesa_par IS 'Par Excel x OFX persistido com decisao do operador. PR5.';


--
-- Name: COLUMN mesa_par.excel_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesa_par.excel_key IS 'Chave loteId:indiceLinha do par. Unica dentro da sessao.';


--
-- Name: COLUMN mesa_par.correcao_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesa_par.correcao_json IS 'ParCorrecao (PR4) serializada. Null se operador nao corrigiu.';


--
-- Name: COLUMN mesa_par.aprovacao_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesa_par.aprovacao_json IS 'AprovacaoLocal (PR4) - fotografia consolidada. Populada apenas quando decisao=aprovado.';


--
-- Name: mesa_par_backup_pr6_1b_20260524; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesa_par_backup_pr6_1b_20260524 (
    id uuid,
    sessao_id uuid,
    excel_key text,
    ofx_id_ativo uuid,
    ofx_id_sugerido_original uuid,
    decisao text,
    correcao_json jsonb,
    aprovacao_json jsonb,
    updated_at timestamp with time zone
);


--
-- Name: mesa_par_backup_pr6_1c_20260525; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesa_par_backup_pr6_1c_20260525 (
    id uuid,
    sessao_id uuid,
    excel_key text,
    ofx_id_ativo uuid,
    ofx_id_sugerido_original uuid,
    decisao text,
    correcao_json jsonb,
    aprovacao_json jsonb,
    updated_at timestamp with time zone
);


--
-- Name: mesa_sessao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mesa_sessao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    conta_bancaria_id uuid,
    ano_mes text NOT NULL,
    status text DEFAULT 'em_andamento'::text NOT NULL,
    excel_lotes_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    ofx_extratos_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    tipo text DEFAULT 'ofx'::text NOT NULL,
    CONSTRAINT chk_mesa_sessao_tipo CHECK ((tipo = ANY (ARRAY['ofx'::text, 'classificacao'::text]))),
    CONSTRAINT chk_mesa_sessao_tipo_consistencia CHECK ((((tipo = 'ofx'::text) AND (conta_bancaria_id IS NOT NULL) AND (ofx_extratos_ids IS NOT NULL)) OR (tipo = 'classificacao'::text))),
    CONSTRAINT mesa_sessao_status_check CHECK ((status = ANY (ARRAY['em_andamento'::text, 'finalizada'::text])))
);


--
-- Name: TABLE mesa_sessao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mesa_sessao IS 'Sessao persistida da Mesa de Pareamento. Unica por (cliente, conta, mes). PR5.';


--
-- Name: COLUMN mesa_sessao.excel_lotes_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesa_sessao.excel_lotes_json IS 'Snapshot do Excel parseado (array de LoteExcel). Permite reabrir sessao sem re-upload.';


--
-- Name: COLUMN mesa_sessao.ofx_extratos_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mesa_sessao.ofx_extratos_ids IS 'IDs dos extratos OFX vinculados (referencia a extratos_bancarios_v2).';


--
-- Name: meta_aprovacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_aprovacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano integer NOT NULL,
    versao_id uuid NOT NULL,
    status text DEFAULT 'em_revisao'::text NOT NULL,
    aprovado_por uuid,
    aprovado_email text,
    aprovado_em timestamp with time zone,
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT meta_aprovacoes_status_check CHECK ((status = ANY (ARRAY['em_revisao'::text, 'aprovado'::text, 'reprovado'::text, 'substituido'::text])))
);


--
-- Name: meta_gmd_mensal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_gmd_mensal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid,
    cliente_id uuid,
    ano_mes text,
    categoria text,
    gmd_previsto numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: meta_parametros_nutricao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_parametros_nutricao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid NOT NULL,
    ano integer NOT NULL,
    cria_custo_cab_mes numeric(15,4) DEFAULT 0,
    recria_custo_cab_mes numeric(15,4) DEFAULT 0,
    engorda_periodo_dias numeric(10,2) DEFAULT 0,
    engorda_consumo_kg_ms numeric(10,4) DEFAULT 0,
    engorda_custo_kg_ms numeric(15,4) DEFAULT 0,
    comercial_custo_cab numeric(15,4) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cliente_id uuid,
    versao_id uuid,
    frete_custo_cab numeric(12,4) DEFAULT 0
);


--
-- Name: meta_preco_mercado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_preco_mercado (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    ano integer NOT NULL,
    mes integer NOT NULL,
    categoria text NOT NULL,
    preco_arroba numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meta_preco_mercado_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_preco_mercado_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    ano_mes text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meta_projetos_investimento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_projetos_investimento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid,
    ano integer NOT NULL,
    nome text,
    subcentro text NOT NULL,
    centro_custo text,
    grupo_custo text,
    macro_custo text,
    responsavel text,
    status text DEFAULT 'planejado'::text,
    orcamento_total numeric(15,2) DEFAULT 0,
    jan numeric(15,2) DEFAULT 0,
    fev numeric(15,2) DEFAULT 0,
    mar numeric(15,2) DEFAULT 0,
    abr numeric(15,2) DEFAULT 0,
    mai numeric(15,2) DEFAULT 0,
    jun numeric(15,2) DEFAULT 0,
    jul numeric(15,2) DEFAULT 0,
    ago numeric(15,2) DEFAULT 0,
    set numeric(15,2) DEFAULT 0,
    "out" numeric(15,2) DEFAULT 0,
    nov numeric(15,2) DEFAULT 0,
    dez numeric(15,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    observacao text
);


--
-- Name: meta_valor_rebanho_precos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_valor_rebanho_precos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    fazenda_id uuid,
    ano_mes text NOT NULL,
    categoria text NOT NULL,
    preco_arroba numeric,
    preco_kg numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: meta_valor_rebanho_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_valor_rebanho_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid,
    fazenda_id uuid,
    ano_mes text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    validado_por uuid,
    validado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: meta_versoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_versoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    ano integer NOT NULL,
    nome text NOT NULL,
    dados jsonb,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    usuario_email text,
    fazenda_id uuid,
    status text DEFAULT 'rascunho'::text NOT NULL,
    CONSTRAINT meta_versoes_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'aprovada'::text])))
);


--
-- Name: COLUMN meta_versoes.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_versoes.status IS 'Status executivo da versão META: rascunho (default) ou aprovada. V1 do hook usePlanejamentoAprovacaoData.';


--
-- Name: meta_versoes_backup_20260516; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_versoes_backup_20260516 (
    id uuid,
    cliente_id uuid,
    ano integer,
    nome text,
    dados jsonb,
    created_at timestamp with time zone,
    user_id uuid,
    usuario_email text,
    fazenda_id uuid,
    status text
);


--
-- Name: pasto_condicoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pasto_condicoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pasto_id uuid NOT NULL,
    data_avaliacao date NOT NULL,
    condicao text NOT NULL,
    observacoes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pasto_geometrias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pasto_geometrias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pasto_id uuid NOT NULL,
    geojson jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pasto_movimentacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pasto_movimentacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pasto_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    data date NOT NULL,
    tipo text NOT NULL,
    quantidade integer DEFAULT 0 NOT NULL,
    observacoes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pasto_origem_id uuid,
    pasto_destino_id uuid,
    categoria text,
    peso_medio_kg numeric,
    referencia_rebanho text,
    registrado_por uuid,
    lote_id uuid
);


--
-- Name: pastos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pastos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    fazenda_id uuid NOT NULL,
    nome text NOT NULL,
    area numeric,
    created_at timestamp with time zone DEFAULT now(),
    ativo boolean DEFAULT true NOT NULL,
    entra_conciliacao boolean DEFAULT true NOT NULL,
    cliente_id uuid,
    data_inicio date,
    updated_at timestamp with time zone DEFAULT now(),
    area_produtiva_ha numeric,
    lote_padrao text,
    observacoes text,
    ordem_exibicao integer DEFAULT 0,
    qualidade numeric,
    referencia_rebanho text,
    situacao text DEFAULT 'ativo'::text,
    tipo_uso text DEFAULT 'pecuaria'::text
);


--
-- Name: planejamento_area_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planejamento_area_meta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    area_pecuaria_ha numeric DEFAULT 0 NOT NULL,
    area_agricultura_ha numeric DEFAULT 0 NOT NULL,
    area_ambiental_ha numeric DEFAULT 0 NOT NULL,
    area_infraestrutura_ha numeric DEFAULT 0 NOT NULL,
    area_total_ha numeric GENERATED ALWAYS AS ((((area_pecuaria_ha + area_agricultura_ha) + area_ambiental_ha) + area_infraestrutura_ha)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT planejamento_area_meta_ano_check CHECK (((ano >= 2020) AND (ano <= 2100))),
    CONSTRAINT planejamento_area_meta_area_agricultura_ha_check CHECK ((area_agricultura_ha >= (0)::numeric)),
    CONSTRAINT planejamento_area_meta_area_ambiental_ha_check CHECK ((area_ambiental_ha >= (0)::numeric)),
    CONSTRAINT planejamento_area_meta_area_infraestrutura_ha_check CHECK ((area_infraestrutura_ha >= (0)::numeric)),
    CONSTRAINT planejamento_area_meta_area_pecuaria_ha_check CHECK ((area_pecuaria_ha >= (0)::numeric)),
    CONSTRAINT planejamento_area_meta_mes_check CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: TABLE planejamento_area_meta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.planejamento_area_meta IS 'Area META oficial por fazenda/ano/mes. area_total_ha gerado pelo banco. V1 da tela edita apenas pec/agric; ambiental e infraestrutura preparados para fases futuras.';


--
-- Name: planejamento_financeiro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planejamento_financeiro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    macro_custo text,
    grupo_custo text,
    centro_custo text NOT NULL,
    subcentro text,
    escopo_negocio text,
    tipo_custo text DEFAULT 'fixo'::text NOT NULL,
    driver text,
    unidade_driver text,
    valor_base numeric(15,2) DEFAULT 0 NOT NULL,
    quantidade_driver numeric(15,4) DEFAULT 0 NOT NULL,
    valor_planejado numeric(15,2) DEFAULT 0 NOT NULL,
    origem text DEFAULT 'manual'::text NOT NULL,
    cenario text DEFAULT 'meta'::text NOT NULL,
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT planejamento_financeiro_mes_check CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: planejamento_financeiro_backup_20260516; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planejamento_financeiro_backup_20260516 (
    id uuid,
    cliente_id uuid,
    fazenda_id uuid,
    ano integer,
    mes integer,
    macro_custo text,
    grupo_custo text,
    centro_custo text,
    subcentro text,
    escopo_negocio text,
    tipo_custo text,
    driver text,
    unidade_driver text,
    valor_base numeric(15,2),
    quantidade_driver numeric(15,4),
    valor_planejado numeric(15,2),
    origem text,
    cenario text,
    observacao text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: preco_mercado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preco_mercado (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    data_referencia date NOT NULL,
    categoria text NOT NULL,
    preco_arroba numeric DEFAULT 0 NOT NULL,
    fonte text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ano_mes text NOT NULL,
    bloco text NOT NULL,
    unidade text DEFAULT 'R$/kg'::text,
    valor numeric DEFAULT 0,
    agio_perc numeric DEFAULT 0
);


--
-- Name: preco_mercado_ajuste; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preco_mercado_ajuste (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    preco_id uuid NOT NULL,
    fator_ajuste numeric DEFAULT 1 NOT NULL,
    motivo text,
    ajustado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: preco_mercado_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preco_mercado_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    ano_mes text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    fechado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    validado_por uuid,
    validado_em timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    nome text,
    email text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reclassificacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reclassificacoes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    fazenda_id uuid NOT NULL,
    mes integer NOT NULL,
    ano integer NOT NULL,
    categoria_origem_id uuid NOT NULL,
    categoria_destino_id uuid NOT NULL,
    quantidade integer DEFAULT 0 NOT NULL,
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reclassificacoes_mes_check CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: saldos_iniciais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saldos_iniciais (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    fazenda_id uuid NOT NULL,
    categoria_id uuid,
    ano integer NOT NULL,
    quantidade integer DEFAULT 0 NOT NULL,
    peso_total numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    cliente_id uuid,
    mes integer DEFAULT 1,
    peso_medio_kg numeric,
    preco_kg numeric,
    categoria text
);


--
-- Name: transferencia_ofx_pares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transferencia_ofx_pares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    ano_mes text NOT NULL,
    ofx_saida_id uuid NOT NULL,
    ofx_entrada_id uuid NOT NULL,
    conta_origem_id uuid NOT NULL,
    conta_destino_id uuid NOT NULL,
    valor numeric NOT NULL,
    data_saida date NOT NULL,
    data_entrada date NOT NULL,
    status text NOT NULL,
    confianca text NOT NULL,
    motivo_rejeicao text,
    detectado_em timestamp with time zone DEFAULT now() NOT NULL,
    decidido_em timestamp with time zone,
    decidido_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_tofx_confianca CHECK ((confianca = ANY (ARRAY['forte'::text, 'ambigua'::text]))),
    CONSTRAINT chk_tofx_contas CHECK ((conta_origem_id <> conta_destino_id)),
    CONSTRAINT chk_tofx_status CHECK ((status = ANY (ARRAY['sugerido'::text, 'confirmado'::text, 'rejeitado'::text])))
);


--
-- Name: valor_rebanho_fechamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valor_rebanho_fechamento (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    valor_total numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    ano_mes text DEFAULT ''::text NOT NULL,
    cliente_id uuid,
    status text DEFAULT 'aberto'::text NOT NULL,
    fazenda_id uuid,
    peso_total_kg numeric,
    updated_at timestamp with time zone DEFAULT now(),
    fechado_em timestamp with time zone,
    fechado_por uuid,
    reaberto_em timestamp with time zone,
    reaberto_por uuid
);


--
-- Name: valor_rebanho_fechamento_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valor_rebanho_fechamento_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid,
    cliente_id uuid,
    ano_mes text,
    categoria text,
    quantidade integer,
    peso_medio_kg numeric,
    preco_kg numeric,
    valor_total_categoria numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    fechado_em timestamp with time zone,
    fechado_por uuid
);


--
-- Name: valor_rebanho_mensal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valor_rebanho_mensal (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    fazenda_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ano_mes text DEFAULT ''::text NOT NULL,
    categoria text DEFAULT ''::text NOT NULL,
    cliente_id uuid,
    preco_kg numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: valor_rebanho_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valor_rebanho_meta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid,
    cliente_id uuid,
    ano_mes text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    valor_total numeric,
    cabecas integer,
    peso_total_kg numeric,
    peso_medio_kg numeric,
    arrobas_total numeric,
    preco_arroba_medio numeric,
    valor_cabeca_medio numeric,
    validado_por uuid,
    validado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: valor_rebanho_meta_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valor_rebanho_meta_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meta_id uuid,
    categoria text NOT NULL,
    quantidade integer,
    peso_medio_kg numeric,
    preco_arroba numeric,
    preco_kg numeric,
    valor_cabeca numeric,
    valor_total_categoria numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: valor_rebanho_meta_validada; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valor_rebanho_meta_validada (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid,
    cliente_id uuid,
    ano_mes text NOT NULL,
    valor_total numeric,
    cabecas integer,
    arrobas_total numeric,
    preco_arroba_medio numeric,
    peso_medio_kg numeric,
    valor_cabeca_medio numeric,
    status text DEFAULT 'validado'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    validado_por uuid,
    validado_em timestamp with time zone
);


--
-- Name: valor_rebanho_meta_validada_backup_20260516; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valor_rebanho_meta_validada_backup_20260516 (
    id uuid,
    fazenda_id uuid,
    cliente_id uuid,
    ano_mes text,
    valor_total numeric,
    cabecas integer,
    arrobas_total numeric,
    preco_arroba_medio numeric,
    peso_medio_kg numeric,
    valor_cabeca_medio numeric,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    validado_por uuid,
    validado_em timestamp with time zone
);


--
-- Name: valor_rebanho_realizado_validado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valor_rebanho_realizado_validado (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fazenda_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    ano_mes text NOT NULL,
    status text DEFAULT 'validado'::text NOT NULL,
    valor_total numeric DEFAULT 0 NOT NULL,
    cabecas integer DEFAULT 0 NOT NULL,
    peso_medio_kg numeric DEFAULT 0 NOT NULL,
    arrobas_total numeric DEFAULT 0 NOT NULL,
    preco_arroba_medio numeric DEFAULT 0 NOT NULL,
    valor_cabeca_medio numeric DEFAULT 0 NOT NULL,
    validado_por uuid,
    validado_em timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vw_classificacao_staging_preview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_classificacao_staging_preview AS
 SELECT s.staging_id,
    s.sessao_id,
    s.cliente_id,
    s.match_status,
    s.aplicado,
    s.aplicado_em,
    s.aplicado_por,
    s.erro_apply,
    s.created_at,
    s.updated_at,
    s.excel_linha_origem,
    s.excel_data,
    s.excel_valor,
    s.excel_tipo_operacao,
    s.excel_conta_origem,
    s.excel_conta_destino,
    s.excel_subcentro,
    s.excel_fornecedor,
    s.excel_produto,
    s.excel_fazenda_codigo,
    l.id AS lanc_id,
    l.descricao AS lanc_descricao,
    l.observacao AS lanc_observacao,
    l.data_pagamento AS lanc_data_pagamento,
    l.data_competencia AS lanc_data_competencia,
    l.valor AS lanc_valor,
    l.sinal AS lanc_sinal,
    l.tipo_operacao AS lanc_tipo_operacao,
    l.status_transacao AS lanc_status,
    l.subcentro AS lanc_subcentro_atual,
    l.macro_custo AS lanc_macro_atual,
    l.grupo_custo AS lanc_grupo_atual,
    l.centro_custo AS lanc_centro_atual,
    l.plano_conta_id AS lanc_plano_conta_id_atual,
    l.favorecido_id AS lanc_favorecido_id_atual,
    fa.nome AS lanc_favorecido_nome_atual,
    l.conta_bancaria_id AS lanc_conta_bancaria_id,
    cb.nome_exibicao AS lanc_conta_bancaria_nome,
    l.conta_destino_id AS lanc_conta_destino_id,
    cd.nome_exibicao AS lanc_conta_destino_nome,
    l.fazenda_id AS lanc_fazenda_id,
    (s.update_proposto ->> 'subcentro'::text) AS proposto_subcentro,
    (NULLIF((s.update_proposto ->> 'favorecido_id'::text), ''::text))::uuid AS proposto_favorecido_id,
    fp.nome AS proposto_favorecido_nome,
    ((l.id IS NOT NULL) AND (l.subcentro IS NULL) AND ((s.update_proposto ->> 'subcentro'::text) IS NOT NULL)) AS will_set_subcentro,
    ((l.id IS NOT NULL) AND (l.favorecido_id IS NULL) AND (NULLIF((s.update_proposto ->> 'favorecido_id'::text), ''::text) IS NOT NULL)) AS will_set_favorecido,
    (((l.id IS NOT NULL) AND (l.subcentro IS NULL) AND ((s.update_proposto ->> 'subcentro'::text) IS NOT NULL)) OR ((l.id IS NOT NULL) AND (l.favorecido_id IS NULL) AND (NULLIF((s.update_proposto ->> 'favorecido_id'::text), ''::text) IS NOT NULL))) AS will_change_anything,
    ((l.subcentro IS NOT NULL) AND ((s.update_proposto ->> 'subcentro'::text) IS NOT NULL) AND (l.subcentro <> (s.update_proposto ->> 'subcentro'::text))) AS conflito_subcentro,
    (EXISTS ( SELECT 1
           FROM public.financeiro_plano_contas pc
          WHERE ((pc.subcentro = NULLIF((s.update_proposto ->> 'subcentro'::text), ''::text)) AND pc.ativo AND ((pc.cliente_id IS NULL) OR (pc.cliente_id = s.cliente_id))))) AS proposto_subcentro_existe_no_plano,
    ((NULLIF((s.update_proposto ->> 'subcentro'::text), ''::text) IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.financeiro_plano_contas pc
          WHERE ((pc.subcentro = NULLIF((s.update_proposto ->> 'subcentro'::text), ''::text)) AND pc.ativo AND ((pc.cliente_id IS NULL) OR (pc.cliente_id = s.cliente_id))))))) AS will_create_subcentro_orfao,
    COALESCE(cb.nome_exibicao, sco.nome_exibicao, scd.nome_exibicao, NULLIF(s.excel_conta_origem, '-'::text)) AS conta_filtro_nome,
    COALESCE(l.conta_bancaria_id, s.conta_origem_id, s.conta_destino_id) AS conta_filtro_id,
    s.excel_observacao,
    s.excel_documento,
    (NULLIF((s.update_proposto ->> 'fazenda_id'::text), ''::text))::uuid AS proposto_fazenda_id,
    fzp.nome AS proposto_fazenda_nome,
    (s.update_proposto ->> 'produto'::text) AS proposto_produto,
    (s.update_proposto ->> 'safra'::text) AS proposto_safra,
    (s.update_proposto ->> 'categoria'::text) AS proposto_categoria,
    ((l.id IS NOT NULL) AND ((NULLIF((s.update_proposto ->> 'fazenda_id'::text), ''::text))::uuid IS NOT NULL) AND ((NULLIF((s.update_proposto ->> 'fazenda_id'::text), ''::text))::uuid IS DISTINCT FROM l.fazenda_id)) AS will_set_fazenda,
    ((s.update_proposto -> '_meta'::text) ->> 'tier'::text) AS proposto_tier,
    ((s.update_proposto -> '_meta'::text) ->> 'origem_resolucao'::text) AS proposto_origem_resolucao,
    ((s.update_proposto -> '_meta'::text) ->> 'regra_id'::text) AS proposto_regra_id,
    ((s.update_proposto -> '_meta'::text) ->> 'alias_id'::text) AS proposto_alias_id,
    (NULLIF(((s.update_proposto -> '_meta'::text) ->> 'motor_version'::text), ''::text))::integer AS motor_version,
    (s.update_proposto ->> 'macro_custo'::text) AS proposto_macro,
    fzl.nome AS lanc_fazenda_nome,
    l.numero_documento AS lanc_numero_documento,
    (s.update_proposto ->> 'numero_documento'::text) AS proposto_numero_documento,
    ((s.match_status = 'exato'::text) AND (s.aplicado = false) AND (l.id IS NOT NULL) AND (l.subcentro IS NULL) AND (NOT ((NULLIF((s.update_proposto ->> 'subcentro'::text), ''::text) IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.financeiro_plano_contas pc
          WHERE ((pc.subcentro = NULLIF((s.update_proposto ->> 'subcentro'::text), ''::text)) AND pc.ativo AND ((pc.cliente_id IS NULL) OR (pc.cliente_id = s.cliente_id))))))))) AS lote_aplicavel
   FROM (((((((((public.financeiro_classificacao_staging s
     LEFT JOIN public.financeiro_lancamentos_v2 l ON ((l.id = s.match_lancamento_id)))
     LEFT JOIN public.financeiro_contas_bancarias cb ON ((cb.id = l.conta_bancaria_id)))
     LEFT JOIN public.financeiro_contas_bancarias cd ON ((cd.id = l.conta_destino_id)))
     LEFT JOIN public.financeiro_contas_bancarias sco ON ((sco.id = s.conta_origem_id)))
     LEFT JOIN public.financeiro_contas_bancarias scd ON ((scd.id = s.conta_destino_id)))
     LEFT JOIN public.financeiro_fornecedores fa ON ((fa.id = l.favorecido_id)))
     LEFT JOIN public.financeiro_fornecedores fp ON ((fp.id = (NULLIF((s.update_proposto ->> 'favorecido_id'::text), ''::text))::uuid)))
     LEFT JOIN public.fazendas fzp ON ((fzp.id = (NULLIF((s.update_proposto ->> 'fazenda_id'::text), ''::text))::uuid)))
     LEFT JOIN public.fazendas fzl ON ((fzl.id = l.fazenda_id)));


--
-- Name: VIEW vw_classificacao_staging_preview; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.vw_classificacao_staging_preview IS 'PR-M5-A2: enriquecimento Excel+Sistema+Proposta + protecao anti-orfao de subcentro. SECURITY INVOKER (herda RLS da staging).';


--
-- Name: vw_financeiro_auditoria_competencia_caixa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_financeiro_auditoria_competencia_caixa AS
 SELECT cliente_id,
    fazenda_id,
    to_char((data_competencia)::timestamp with time zone, 'YYYY-MM'::text) AS mes_competencia,
        CASE
            WHEN (data_pagamento IS NOT NULL) THEN to_char((data_pagamento)::timestamp with time zone, 'YYYY-MM'::text)
            ELSE NULL::text
        END AS mes_caixa,
    tipo_operacao,
    macro_custo,
    centro_custo,
    subcentro,
    count(*) AS qtd_lancamentos,
    sum(abs(valor)) AS valor_total,
    sum(
        CASE
            WHEN (to_char((data_competencia)::timestamp with time zone, 'YYYY-MM'::text) <> COALESCE(to_char((data_pagamento)::timestamp with time zone, 'YYYY-MM'::text), ''::text)) THEN 1
            ELSE 0
        END) AS qtd_divergente
   FROM public.financeiro_lancamentos_v2 l
  WHERE ((lower(status_transacao) = ANY (ARRAY['conciliado'::text, 'confirmado'::text])) AND (tipo_operacao !~~ '3%'::text))
  GROUP BY cliente_id, fazenda_id, (to_char((data_competencia)::timestamp with time zone, 'YYYY-MM'::text)),
        CASE
            WHEN (data_pagamento IS NOT NULL) THEN to_char((data_pagamento)::timestamp with time zone, 'YYYY-MM'::text)
            ELSE NULL::text
        END, tipo_operacao, macro_custo, centro_custo, subcentro;


--
-- Name: vw_financeiro_dashboard_mensal; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_financeiro_dashboard_mensal AS
 SELECT cliente_id,
    fazenda_id,
    ano_mes,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '1%'::text) AND (lower(macro_custo) = 'receitas'::text) AND ((lower(centro_custo) ~~ '%pecuári%'::text) OR (lower(centro_custo) ~~ '%pecuaria%'::text) OR (lower(centro_custo) ~~ '%pec%'::text))) THEN abs(valor)
            ELSE (0)::numeric
        END) AS receitas_pecuaria,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '1%'::text) AND (lower(macro_custo) = 'receitas'::text) AND (lower(centro_custo) ~~ '%agri%'::text)) THEN abs(valor)
            ELSE (0)::numeric
        END) AS receitas_agricultura,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '1%'::text) AND (lower(macro_custo) = 'receitas'::text) AND (NOT ((lower(centro_custo) ~~ '%pecuári%'::text) OR (lower(centro_custo) ~~ '%pecuaria%'::text) OR (lower(centro_custo) ~~ '%pec%'::text))) AND (NOT (lower(centro_custo) ~~ '%agri%'::text))) THEN abs(valor)
            ELSE (0)::numeric
        END) AS outras_receitas,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '1%'::text) AND ((lower(macro_custo) ~~ '%aporte%'::text) OR (lower(centro_custo) ~~ '%aporte%'::text) OR (lower(subcentro) ~~ '%aporte%'::text))) THEN abs(valor)
            ELSE (0)::numeric
        END) AS aportes,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '1%'::text) AND (lower(macro_custo) <> 'receitas'::text) AND (NOT ((lower(macro_custo) ~~ '%aporte%'::text) OR (lower(centro_custo) ~~ '%aporte%'::text) OR (lower(subcentro) ~~ '%aporte%'::text)))) THEN abs(valor)
            ELSE (0)::numeric
        END) AS captacao_financeira,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '2%'::text) AND (lower(macro_custo) = ANY (ARRAY['custeio produtivo'::text, 'investimento na fazenda'::text])) AND ((lower(centro_custo) ~~ '%pecuári%'::text) OR (lower(centro_custo) ~~ '%pecuaria%'::text) OR (lower(centro_custo) ~~ '%pec%'::text) OR (NOT (lower(centro_custo) ~~ '%agri%'::text))) AND (NOT ((lower(macro_custo) ~~ '%dedu%'::text) AND (lower(macro_custo) ~~ '%receita%'::text))) AND (NOT ((lower(centro_custo) ~~ '%dedução%'::text) OR (lower(centro_custo) ~~ '%deducao%'::text)))) THEN abs(valor)
            ELSE (0)::numeric
        END) AS desembolso_produtivo_pec,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '2%'::text) AND (lower(macro_custo) = ANY (ARRAY['custeio produtivo'::text, 'investimento na fazenda'::text])) AND (lower(centro_custo) ~~ '%agri%'::text)) THEN abs(valor)
            ELSE (0)::numeric
        END) AS desembolso_produtivo_agri,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '2%'::text) AND ((lower(macro_custo) = 'investimento em bovinos'::text) OR (lower(centro_custo) ~~ '%reposição%'::text) OR (lower(centro_custo) ~~ '%reposicao%'::text))) THEN abs(valor)
            ELSE (0)::numeric
        END) AS reposicao_bovinos,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '2%'::text) AND (((lower(macro_custo) ~~ '%dedu%'::text) AND (lower(macro_custo) ~~ '%receita%'::text)) OR (lower(centro_custo) ~~ '%dedução%'::text) OR (lower(centro_custo) ~~ '%deducao%'::text))) THEN abs(valor)
            ELSE (0)::numeric
        END) AS deducao_receitas,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '2%'::text) AND (lower(macro_custo) ~~ '%amortiza%'::text)) THEN abs(valor)
            ELSE (0)::numeric
        END) AS amortizacoes,
    sum(
        CASE
            WHEN ((tipo_operacao ~~ '2%'::text) AND ((lower(macro_custo) = 'dividendos'::text) OR (lower(centro_custo) = 'dividendos'::text) OR (lower(subcentro) ~~ '%dividendo%'::text))) THEN abs(valor)
            ELSE (0)::numeric
        END) AS dividendos
   FROM public.financeiro_lancamentos_v2 l
  WHERE ((lower(status_transacao) = ANY (ARRAY['conciliado'::text, 'confirmado'::text])) AND (tipo_operacao !~~ '3%'::text))
  GROUP BY cliente_id, fazenda_id, ano_mes;


--
-- Name: vw_financeiro_desembolso_centro; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_financeiro_desembolso_centro AS
 SELECT cliente_id,
    fazenda_id,
    ano_mes,
    macro_custo,
    centro_custo,
    subcentro,
    sum(abs(valor)) AS valor_total,
    count(*) AS qtd_lancamentos,
    round(((sum(abs(valor)) * 100.0) / NULLIF(sum(sum(abs(valor))) OVER (PARTITION BY cliente_id, fazenda_id, ano_mes), (0)::numeric)), 2) AS percentual
   FROM public.financeiro_lancamentos_v2 l
  WHERE ((tipo_operacao ~~ '2%'::text) AND (lower(status_transacao) = ANY (ARRAY['conciliado'::text, 'confirmado'::text])))
  GROUP BY cliente_id, fazenda_id, ano_mes, macro_custo, centro_custo, subcentro;


--
-- Name: vw_financeiro_fluxo_caixa_mensal; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_financeiro_fluxo_caixa_mensal AS
 SELECT cliente_id,
    fazenda_id,
    ano_mes,
    sum(
        CASE
            WHEN (tipo_operacao ~~ '1%'::text) THEN abs(valor)
            ELSE (0)::numeric
        END) AS total_entradas,
    sum(
        CASE
            WHEN (tipo_operacao ~~ '2%'::text) THEN abs(valor)
            ELSE (0)::numeric
        END) AS total_saidas,
    (sum(
        CASE
            WHEN (tipo_operacao ~~ '1%'::text) THEN abs(valor)
            ELSE (0)::numeric
        END) - sum(
        CASE
            WHEN (tipo_operacao ~~ '2%'::text) THEN abs(valor)
            ELSE (0)::numeric
        END)) AS saldo_mes
   FROM public.financeiro_lancamentos_v2 l
  WHERE ((lower(status_transacao) = ANY (ARRAY['conciliado'::text, 'confirmado'::text])) AND (tipo_operacao !~~ '3%'::text))
  GROUP BY cliente_id, fazenda_id, ano_mes;


--
-- Name: vw_valor_rebanho_realizado_global_mensal; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_valor_rebanho_realizado_global_mensal AS
 SELECT cliente_id,
    ano_mes,
    sum(valor_total) AS valor_total,
    sum(cabecas) AS cabecas,
    sum(arrobas_total) AS arrobas_total,
        CASE
            WHEN (sum(cabecas) > 0) THEN round((sum(((cabecas)::numeric * peso_medio_kg)) / (sum(cabecas))::numeric), 4)
            ELSE NULL::numeric
        END AS peso_medio_kg,
        CASE
            WHEN (sum(arrobas_total) > (0)::numeric) THEN round((sum(valor_total) / sum(arrobas_total)), 4)
            ELSE NULL::numeric
        END AS preco_arroba_medio,
        CASE
            WHEN (sum(cabecas) > 0) THEN round((sum(valor_total) / (sum(cabecas))::numeric), 4)
            ELSE NULL::numeric
        END AS valor_cabeca_medio,
    count(DISTINCT fazenda_id) AS qtd_fazendas
   FROM public.valor_rebanho_realizado_validado
  WHERE (status = 'validado'::text)
  GROUP BY cliente_id, ano_mes;


--
-- Name: vw_zoot_categoria_mensal; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_zoot_categoria_mensal AS
 WITH RECURSIVE categorias AS (
         SELECT categorias_rebanho.id,
            categorias_rebanho.codigo,
            categorias_rebanho.nome,
            categorias_rebanho.ordem_exibicao
           FROM public.categorias_rebanho
        ), saldo_ini_cat AS (
         SELECT si.fazenda_id,
            si.cliente_id,
            si.ano,
            cr.id AS categoria_id,
            cr.codigo,
            cr.nome AS categoria_nome,
            cr.ordem_exibicao,
            (sum(si.quantidade))::numeric AS cab_ini,
            sum(((si.quantidade)::numeric * COALESCE(si.peso_medio_kg, (0)::numeric))) AS peso_ini
           FROM (public.saldos_iniciais si
             JOIN categorias cr ON ((cr.codigo = si.categoria)))
          GROUP BY si.fazenda_id, si.cliente_id, si.ano, cr.id, cr.codigo, cr.nome, cr.ordem_exibicao
        ), mov_real AS (
         SELECT l.fazenda_id,
            l.cliente_id,
            cr.id AS categoria_id,
            (EXTRACT(year FROM l.data))::integer AS ano,
            (EXTRACT(month FROM l.data))::integer AS mes,
            (sum(
                CASE
                    WHEN (l.tipo = ANY (ARRAY['nascimento'::text, 'compra'::text, 'transferencia_entrada'::text])) THEN l.quantidade
                    ELSE 0
                END))::numeric AS ent,
            (sum(
                CASE
                    WHEN (l.tipo = ANY (ARRAY['abate'::text, 'venda'::text, 'venda_pe'::text, 'transferencia_saida'::text, 'consumo'::text, 'morte'::text])) THEN l.quantidade
                    ELSE 0
                END))::numeric AS sai,
            sum(
                CASE
                    WHEN (l.tipo = ANY (ARRAY['nascimento'::text, 'compra'::text, 'transferencia_entrada'::text])) THEN ((l.quantidade)::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, (0)::numeric))
                    ELSE (0)::numeric
                END) AS p_ent,
            sum(
                CASE
                    WHEN (l.tipo = ANY (ARRAY['abate'::text, 'venda'::text, 'venda_pe'::text, 'transferencia_saida'::text, 'consumo'::text, 'morte'::text])) THEN ((l.quantidade)::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, (0)::numeric))
                    ELSE (0)::numeric
                END) AS p_sai
           FROM (public.lancamentos l
             JOIN categorias cr ON ((cr.codigo = l.categoria)))
          WHERE ((l.cancelado = false) AND (l.tipo <> 'reclassificacao'::text) AND (l.cenario = 'realizado'::text) AND (l.status_operacional = 'realizado'::text))
          GROUP BY l.fazenda_id, l.cliente_id, cr.id, ((EXTRACT(year FROM l.data))::integer), ((EXTRACT(month FROM l.data))::integer)
        ), rcl_sai_real AS (
         SELECT l.fazenda_id,
            l.cliente_id,
            cr.id AS categoria_id,
            (EXTRACT(year FROM l.data))::integer AS ano,
            (EXTRACT(month FROM l.data))::integer AS mes,
            (sum(l.quantidade))::numeric AS qtd,
            sum(((l.quantidade)::numeric * COALESCE(l.peso_medio_kg, (0)::numeric))) AS peso
           FROM (public.lancamentos l
             JOIN categorias cr ON ((cr.codigo = l.categoria)))
          WHERE ((l.cancelado = false) AND (l.tipo = 'reclassificacao'::text) AND (l.categoria_destino IS NOT NULL) AND (l.cenario = 'realizado'::text) AND (l.status_operacional = 'realizado'::text))
          GROUP BY l.fazenda_id, l.cliente_id, cr.id, ((EXTRACT(year FROM l.data))::integer), ((EXTRACT(month FROM l.data))::integer)
        ), rcl_ent_real AS (
         SELECT l.fazenda_id,
            l.cliente_id,
            cr.id AS categoria_id,
            (EXTRACT(year FROM l.data))::integer AS ano,
            (EXTRACT(month FROM l.data))::integer AS mes,
            (sum(l.quantidade))::numeric AS qtd,
            sum(((l.quantidade)::numeric * COALESCE(l.peso_medio_kg, (0)::numeric))) AS peso
           FROM (public.lancamentos l
             JOIN categorias cr ON ((cr.codigo = l.categoria_destino)))
          WHERE ((l.cancelado = false) AND (l.tipo = 'reclassificacao'::text) AND (l.categoria_destino IS NOT NULL) AND (l.cenario = 'realizado'::text) AND (l.status_operacional = 'realizado'::text))
          GROUP BY l.fazenda_id, l.cliente_id, cr.id, ((EXTRACT(year FROM l.data))::integer), ((EXTRACT(month FROM l.data))::integer)
        ), mov_meta AS (
         SELECT l.fazenda_id,
            l.cliente_id,
            cr.id AS categoria_id,
            (EXTRACT(year FROM l.data))::integer AS ano,
            (EXTRACT(month FROM l.data))::integer AS mes,
            (sum(
                CASE
                    WHEN (l.tipo = ANY (ARRAY['nascimento'::text, 'compra'::text, 'transferencia_entrada'::text])) THEN l.quantidade
                    ELSE 0
                END))::numeric AS ent,
            (sum(
                CASE
                    WHEN (l.tipo = ANY (ARRAY['abate'::text, 'venda'::text, 'venda_pe'::text, 'transferencia_saida'::text, 'consumo'::text, 'morte'::text])) THEN l.quantidade
                    ELSE 0
                END))::numeric AS sai,
            sum(
                CASE
                    WHEN (l.tipo = ANY (ARRAY['nascimento'::text, 'compra'::text, 'transferencia_entrada'::text])) THEN ((l.quantidade)::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, (0)::numeric))
                    ELSE (0)::numeric
                END) AS p_ent,
            sum(
                CASE
                    WHEN (l.tipo = ANY (ARRAY['abate'::text, 'venda'::text, 'venda_pe'::text, 'transferencia_saida'::text, 'consumo'::text, 'morte'::text])) THEN ((l.quantidade)::numeric * COALESCE(l.peso_medio_kg, l.peso_carcaca_kg, (0)::numeric))
                    ELSE (0)::numeric
                END) AS p_sai
           FROM (public.lancamentos l
             JOIN categorias cr ON ((cr.codigo = l.categoria)))
          WHERE ((l.cancelado = false) AND (l.tipo <> 'reclassificacao'::text) AND (l.cenario = 'meta'::text))
          GROUP BY l.fazenda_id, l.cliente_id, cr.id, ((EXTRACT(year FROM l.data))::integer), ((EXTRACT(month FROM l.data))::integer)
        ), rcl_sai_meta AS (
         SELECT l.fazenda_id,
            l.cliente_id,
            cr.id AS categoria_id,
            (EXTRACT(year FROM l.data))::integer AS ano,
            (EXTRACT(month FROM l.data))::integer AS mes,
            (sum(l.quantidade))::numeric AS qtd,
            sum(((l.quantidade)::numeric * COALESCE(l.peso_medio_kg, (0)::numeric))) AS peso
           FROM (public.lancamentos l
             JOIN categorias cr ON ((cr.codigo = l.categoria)))
          WHERE ((l.cancelado = false) AND (l.tipo = 'reclassificacao'::text) AND (l.categoria_destino IS NOT NULL) AND (l.cenario = 'meta'::text))
          GROUP BY l.fazenda_id, l.cliente_id, cr.id, ((EXTRACT(year FROM l.data))::integer), ((EXTRACT(month FROM l.data))::integer)
        ), rcl_ent_meta AS (
         SELECT l.fazenda_id,
            l.cliente_id,
            cr.id AS categoria_id,
            (EXTRACT(year FROM l.data))::integer AS ano,
            (EXTRACT(month FROM l.data))::integer AS mes,
            (sum(l.quantidade))::numeric AS qtd,
            sum(((l.quantidade)::numeric * COALESCE(l.peso_medio_kg, (0)::numeric))) AS peso
           FROM (public.lancamentos l
             JOIN categorias cr ON ((cr.codigo = l.categoria_destino)))
          WHERE ((l.cancelado = false) AND (l.tipo = 'reclassificacao'::text) AND (l.categoria_destino IS NOT NULL) AND (l.cenario = 'meta'::text))
          GROUP BY l.fazenda_id, l.cliente_id, cr.id, ((EXTRACT(year FROM l.data))::integer), ((EXTRACT(month FROM l.data))::integer)
        ), mov_all AS (
         SELECT COALESCE(m.fazenda_id, re.fazenda_id, rs.fazenda_id) AS fazenda_id,
            COALESCE(m.cliente_id, re.cliente_id, rs.cliente_id) AS cliente_id,
            COALESCE(m.categoria_id, re.categoria_id, rs.categoria_id) AS categoria_id,
            COALESCE(m.ano, re.ano, rs.ano) AS ano,
            COALESCE(m.mes, re.mes, rs.mes) AS mes,
            COALESCE(m.ent, (0)::numeric) AS ent,
            COALESCE(m.sai, (0)::numeric) AS sai,
            COALESCE(re.qtd, (0)::numeric) AS evol_ent,
            COALESCE(rs.qtd, (0)::numeric) AS evol_sai,
            COALESCE(m.p_ent, (0)::numeric) AS p_ent,
            COALESCE(m.p_sai, (0)::numeric) AS p_sai,
            COALESCE(re.peso, (0)::numeric) AS p_evol_ent,
            COALESCE(rs.peso, (0)::numeric) AS p_evol_sai,
            'realizado'::text AS cenario
           FROM ((mov_real m
             FULL JOIN rcl_ent_real re ON (((re.fazenda_id = m.fazenda_id) AND (re.categoria_id = m.categoria_id) AND (re.ano = m.ano) AND (re.mes = m.mes))))
             FULL JOIN rcl_sai_real rs ON (((rs.fazenda_id = COALESCE(m.fazenda_id, re.fazenda_id)) AND (rs.categoria_id = COALESCE(m.categoria_id, re.categoria_id)) AND (rs.ano = COALESCE(m.ano, re.ano)) AND (rs.mes = COALESCE(m.mes, re.mes)))))
        UNION ALL
         SELECT COALESCE(m.fazenda_id, re.fazenda_id, rs.fazenda_id) AS "coalesce",
            COALESCE(m.cliente_id, re.cliente_id, rs.cliente_id) AS "coalesce",
            COALESCE(m.categoria_id, re.categoria_id, rs.categoria_id) AS "coalesce",
            COALESCE(m.ano, re.ano, rs.ano) AS "coalesce",
            COALESCE(m.mes, re.mes, rs.mes) AS "coalesce",
            COALESCE(m.ent, (0)::numeric) AS "coalesce",
            COALESCE(m.sai, (0)::numeric) AS "coalesce",
            COALESCE(re.qtd, (0)::numeric) AS "coalesce",
            COALESCE(rs.qtd, (0)::numeric) AS "coalesce",
            COALESCE(m.p_ent, (0)::numeric) AS "coalesce",
            COALESCE(m.p_sai, (0)::numeric) AS "coalesce",
            COALESCE(re.peso, (0)::numeric) AS "coalesce",
            COALESCE(rs.peso, (0)::numeric) AS "coalesce",
            'meta'::text AS text
           FROM ((mov_meta m
             FULL JOIN rcl_ent_meta re ON (((re.fazenda_id = m.fazenda_id) AND (re.categoria_id = m.categoria_id) AND (re.ano = m.ano) AND (re.mes = m.mes))))
             FULL JOIN rcl_sai_meta rs ON (((rs.fazenda_id = COALESCE(m.fazenda_id, re.fazenda_id)) AND (rs.categoria_id = COALESCE(m.categoria_id, re.categoria_id)) AND (rs.ano = COALESCE(m.ano, re.ano)) AND (rs.mes = COALESCE(m.mes, re.mes)))))
        ), cat_year_bounds AS (
         SELECT src.fazenda_id,
            src.cliente_id,
            src.categoria_id,
            src.cenario,
            min(src.ano) AS min_ano,
            max(src.ano) AS max_ano
           FROM ( SELECT saldo_ini_cat.fazenda_id,
                    saldo_ini_cat.cliente_id,
                    saldo_ini_cat.categoria_id,
                    saldo_ini_cat.ano,
                    'realizado'::text AS cenario
                   FROM saldo_ini_cat
                UNION
                 SELECT mov_all.fazenda_id,
                    mov_all.cliente_id,
                    mov_all.categoria_id,
                    mov_all.ano,
                    'realizado'::text AS cenario
                   FROM mov_all
                  WHERE (mov_all.cenario = 'realizado'::text)
                UNION
                 SELECT saldo_ini_cat.fazenda_id,
                    saldo_ini_cat.cliente_id,
                    saldo_ini_cat.categoria_id,
                    saldo_ini_cat.ano,
                    'meta'::text AS cenario
                   FROM saldo_ini_cat
                UNION
                 SELECT mov_all.fazenda_id,
                    mov_all.cliente_id,
                    mov_all.categoria_id,
                    mov_all.ano,
                    'meta'::text AS cenario
                   FROM mov_all
                  WHERE (mov_all.cenario = 'meta'::text)) src
          GROUP BY src.fazenda_id, src.cliente_id, src.categoria_id, src.cenario
        ), all_cat_bases AS (
         SELECT cy.fazenda_id,
            cy.cliente_id,
            anos.ano,
            cy.categoria_id,
            cy.cenario,
            cr.codigo,
            cr.nome AS categoria_nome,
            cr.ordem_exibicao,
            COALESCE(si.cab_ini, (0)::numeric) AS cab_ini_ano,
            COALESCE(si.peso_ini, (0)::numeric) AS peso_ini_ano
           FROM (((cat_year_bounds cy
             JOIN LATERAL generate_series(cy.min_ano, cy.max_ano) anos(ano) ON (true))
             JOIN categorias cr ON ((cr.id = cy.categoria_id)))
             LEFT JOIN saldo_ini_cat si ON (((si.fazenda_id = cy.fazenda_id) AND (si.categoria_id = cy.categoria_id) AND (si.ano = anos.ano))))
        ), expanded AS (
         SELECT acb.fazenda_id,
            acb.cliente_id,
            acb.categoria_id,
            acb.codigo,
            acb.categoria_nome,
            acb.ordem_exibicao,
            acb.ano,
            m.mes,
            m.mes AS seq,
            acb.cenario,
            acb.cab_ini_ano,
            acb.peso_ini_ano,
            COALESCE(ma.ent, (0)::numeric) AS ent,
            COALESCE(ma.sai, (0)::numeric) AS sai,
            COALESCE(ma.evol_ent, (0)::numeric) AS evol_ent,
            COALESCE(ma.evol_sai, (0)::numeric) AS evol_sai,
            COALESCE(ma.p_ent, (0)::numeric) AS p_ent,
            COALESCE(ma.p_sai, (0)::numeric) AS p_sai,
            COALESCE(ma.p_evol_ent, (0)::numeric) AS p_evol_ent,
            COALESCE(ma.p_evol_sai, (0)::numeric) AS p_evol_sai,
            (date_part('day'::text, (date_trunc('month'::text, (make_date(acb.ano, m.mes, 1))::timestamp without time zone) + '1 mon -1 days'::interval)))::integer AS dias_mes,
                CASE
                    WHEN (acb.cenario = 'realizado'::text) THEN fp.saldo_final
                    ELSE NULL::bigint
                END AS fp_saldo_final,
                CASE
                    WHEN (acb.cenario = 'realizado'::text) THEN fp.peso_total_final
                    ELSE NULL::numeric
                END AS fp_peso_total_final,
                CASE
                    WHEN ((acb.cenario = 'realizado'::text) AND (fp.saldo_final IS NOT NULL)) THEN 'fechamento'::text
                    ELSE NULL::text
                END AS fonte_mes
           FROM (((all_cat_bases acb
             JOIN LATERAL generate_series(1, 12) m(mes) ON (true))
             LEFT JOIN mov_all ma ON (((ma.fazenda_id = acb.fazenda_id) AND (ma.categoria_id = acb.categoria_id) AND (ma.ano = acb.ano) AND (ma.mes = m.mes) AND (ma.cenario = acb.cenario))))
             LEFT JOIN LATERAL ( SELECT sum(fpi.quantidade) AS saldo_final,
                    sum(fpi.peso_total) AS peso_total_final
                   FROM (public.fechamento_pastos fp2
                     JOIN public.fechamento_pasto_itens fpi ON ((fpi.fechamento_id = fp2.id)))
                  WHERE ((fp2.fazenda_id = acb.fazenda_id) AND (fp2.status = 'fechado'::text) AND ((EXTRACT(year FROM ((fp2.ano_mes || '-01'::text))::date))::integer = acb.ano) AND ((EXTRACT(month FROM ((fp2.ano_mes || '-01'::text))::date))::integer = m.mes) AND (fpi.categoria_id = acb.categoria_id))
                  GROUP BY fpi.categoria_id) fp ON ((acb.cenario = 'realizado'::text)))
        ), chain AS (
         SELECT e.fazenda_id,
            e.cliente_id,
            e.categoria_id,
            e.codigo,
            e.categoria_nome,
            e.ordem_exibicao,
            e.ano,
            e.mes,
            e.seq,
            e.cenario,
            e.dias_mes,
            e.fonte_mes,
            e.ent,
            e.sai,
            e.evol_ent,
            e.evol_sai,
            e.p_ent,
            e.p_sai,
            e.p_evol_ent,
            e.p_evol_sai,
            e.cab_ini_ano,
            e.peso_ini_ano,
            e.cab_ini_ano AS saldo_ini_calc,
            e.peso_ini_ano AS peso_ini_calc,
            COALESCE((e.fp_saldo_final)::numeric, ((((e.cab_ini_ano + e.ent) - e.sai) + e.evol_ent) - e.evol_sai)) AS saldo_fin_calc,
            COALESCE(e.fp_peso_total_final, ((((e.peso_ini_ano + e.p_ent) - e.p_sai) + e.p_evol_ent) - e.p_evol_sai)) AS peso_fin_calc
           FROM expanded e
          WHERE (e.mes = 1)
        UNION ALL
         SELECT e.fazenda_id,
            e.cliente_id,
            e.categoria_id,
            e.codigo,
            e.categoria_nome,
            e.ordem_exibicao,
            e.ano,
            e.mes,
            e.seq,
            e.cenario,
            e.dias_mes,
            e.fonte_mes,
            e.ent,
            e.sai,
            e.evol_ent,
            e.evol_sai,
            e.p_ent,
            e.p_sai,
            e.p_evol_ent,
            e.p_evol_sai,
            e.cab_ini_ano,
            e.peso_ini_ano,
            c.saldo_fin_calc AS saldo_ini_calc,
            c.peso_fin_calc AS peso_ini_calc,
            COALESCE((e.fp_saldo_final)::numeric, ((((c.saldo_fin_calc + e.ent) - e.sai) + e.evol_ent) - e.evol_sai)) AS "coalesce",
            COALESCE(e.fp_peso_total_final, ((((c.peso_fin_calc + e.p_ent) - e.p_sai) + e.p_evol_ent) - e.p_evol_sai)) AS "coalesce"
           FROM (chain c
             JOIN expanded e ON (((e.fazenda_id = c.fazenda_id) AND (e.cenario = c.cenario) AND (e.categoria_id = c.categoria_id) AND (e.ano = c.ano) AND (e.seq = (c.seq + 1)))))
        )
 SELECT fazenda_id,
    cliente_id,
    ano,
    mes,
    cenario,
    (((ano)::text || '-'::text) || lpad((mes)::text, 2, '0'::text)) AS ano_mes,
    categoria_id,
    codigo AS categoria_codigo,
    categoria_nome,
    ordem_exibicao,
    (saldo_ini_calc)::integer AS saldo_inicial,
    (ent)::integer AS entradas_externas,
    (sai)::integer AS saidas_externas,
    (evol_ent)::integer AS evol_cat_entrada,
    (evol_sai)::integer AS evol_cat_saida,
    (saldo_fin_calc)::integer AS saldo_final,
    round(peso_ini_calc, 2) AS peso_total_inicial,
    round(peso_fin_calc, 2) AS peso_total_final,
        CASE
            WHEN (saldo_ini_calc > (0)::numeric) THEN round((peso_ini_calc / saldo_ini_calc), 2)
            ELSE NULL::numeric
        END AS peso_medio_inicial,
        CASE
            WHEN (saldo_fin_calc > (0)::numeric) THEN round((peso_fin_calc / saldo_fin_calc), 2)
            ELSE NULL::numeric
        END AS peso_medio_final,
    round(p_ent, 2) AS peso_entradas_externas,
    round(p_sai, 2) AS peso_saidas_externas,
    round(p_evol_ent, 2) AS peso_evol_cat_entrada,
    round(p_evol_sai, 2) AS peso_evol_cat_saida,
    dias_mes,
        CASE
            WHEN ((((saldo_ini_calc + saldo_fin_calc) / 2.0) > (0)::numeric) AND (dias_mes > 0)) THEN round(((((((peso_fin_calc - peso_ini_calc) - p_ent) + p_sai) - p_evol_ent) + p_evol_sai) / (((saldo_ini_calc + saldo_fin_calc) / 2.0) * (dias_mes)::numeric)), 4)
            ELSE NULL::numeric
        END AS gmd,
    round((((((peso_fin_calc - peso_ini_calc) - p_ent) + p_sai) - p_evol_ent) + p_evol_sai), 2) AS producao_biologica,
    fonte_mes AS fonte_oficial_mes
   FROM chain
  WHERE (NOT ((saldo_ini_calc = (0)::numeric) AND (saldo_fin_calc = (0)::numeric) AND (ent = (0)::numeric) AND (sai = (0)::numeric) AND (evol_ent = (0)::numeric) AND (evol_sai = (0)::numeric)));


--
-- Name: vw_zoot_fazenda_mensal; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_zoot_fazenda_mensal AS
 WITH cat AS (
         SELECT vw_zoot_categoria_mensal.fazenda_id,
            vw_zoot_categoria_mensal.cliente_id,
            vw_zoot_categoria_mensal.ano,
            vw_zoot_categoria_mensal.mes,
            vw_zoot_categoria_mensal.cenario,
            vw_zoot_categoria_mensal.ano_mes,
            (sum(vw_zoot_categoria_mensal.saldo_inicial))::integer AS cabecas_inicio,
            (sum(vw_zoot_categoria_mensal.saldo_final))::integer AS cabecas_final,
            (sum(vw_zoot_categoria_mensal.entradas_externas))::integer AS entradas,
            (sum(vw_zoot_categoria_mensal.saidas_externas))::integer AS saidas,
            round(sum(vw_zoot_categoria_mensal.peso_total_inicial), 2) AS peso_inicio_kg,
            round(sum(vw_zoot_categoria_mensal.peso_total_final), 2) AS peso_total_final_kg,
            round(sum(vw_zoot_categoria_mensal.peso_entradas_externas), 2) AS peso_entradas_kg,
            round(sum(vw_zoot_categoria_mensal.peso_saidas_externas), 2) AS peso_saidas_kg,
            round(sum(vw_zoot_categoria_mensal.producao_biologica), 2) AS gmd_numerador_kg,
            max(vw_zoot_categoria_mensal.dias_mes) AS dias_mes,
                CASE
                    WHEN bool_or((vw_zoot_categoria_mensal.fonte_oficial_mes = 'fechamento'::text)) THEN 'fechamento'::text
                    WHEN bool_or((vw_zoot_categoria_mensal.fonte_oficial_mes = 'fallback_movimentacao'::text)) THEN 'fallback_movimentacao'::text
                    ELSE 'projecao'::text
                END AS fonte_oficial_mes
           FROM public.vw_zoot_categoria_mensal
          GROUP BY vw_zoot_categoria_mensal.fazenda_id, vw_zoot_categoria_mensal.cliente_id, vw_zoot_categoria_mensal.ano, vw_zoot_categoria_mensal.mes, vw_zoot_categoria_mensal.cenario, vw_zoot_categoria_mensal.ano_mes
        ), area AS (
         SELECT p.fazenda_id,
            sum(
                CASE
                    WHEN (p.ativo AND p.entra_conciliacao) THEN p.area_produtiva_ha
                    ELSE (0)::numeric
                END) AS area_produtiva_ha
           FROM public.pastos p
          GROUP BY p.fazenda_id
        )
 SELECT c.fazenda_id,
    c.cliente_id,
    c.ano,
    c.mes,
    c.cenario,
    lpad((c.mes)::text, 2, '0'::text) AS mes_key,
    c.ano_mes,
    c.cabecas_inicio,
    c.cabecas_final,
    c.peso_inicio_kg,
    c.peso_total_final_kg,
        CASE
            WHEN (c.cabecas_final > 0) THEN round((c.peso_total_final_kg / (c.cabecas_final)::numeric), 2)
            ELSE NULL::numeric
        END AS peso_medio_final_kg,
    c.peso_entradas_kg,
    c.peso_saidas_kg,
    c.entradas,
    c.saidas,
    c.dias_mes,
        CASE
            WHEN ((c.dias_mes > 0) AND ((c.cabecas_inicio + c.cabecas_final) > 0)) THEN round(((c.gmd_numerador_kg / (((c.cabecas_inicio + c.cabecas_final))::numeric / 2.0)) / (c.dias_mes)::numeric), 4)
            ELSE NULL::numeric
        END AS gmd_kg_cab_dia,
        CASE
            WHEN ((c.cabecas_inicio + c.cabecas_final) > 0) THEN c.gmd_numerador_kg
            ELSE NULL::numeric
        END AS gmd_numerador_kg,
        CASE
            WHEN (c.cabecas_final > 0) THEN round((((((c.cabecas_inicio + c.cabecas_final))::numeric / 2.0) * (c.peso_total_final_kg / (c.cabecas_final)::numeric)) / 450.0), 2)
            ELSE NULL::numeric
        END AS ua_media,
    COALESCE(a.area_produtiva_ha, (0)::numeric) AS area_produtiva_ha,
        CASE
            WHEN ((COALESCE(a.area_produtiva_ha, (0)::numeric) > (0)::numeric) AND (c.cabecas_final > 0)) THEN round(((((((c.cabecas_inicio + c.cabecas_final))::numeric / 2.0) * (c.peso_total_final_kg / (c.cabecas_final)::numeric)) / 450.0) / a.area_produtiva_ha), 2)
            ELSE NULL::numeric
        END AS lotacao_ua_ha,
    c.fonte_oficial_mes
   FROM (cat c
     LEFT JOIN area a ON ((a.fazenda_id = c.fazenda_id)));


--
-- Name: zoot_importacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zoot_importacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fazenda_id uuid NOT NULL,
    nome_arquivo text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    total_linhas integer DEFAULT 0 NOT NULL,
    total_validas integer DEFAULT 0 NOT NULL,
    total_erros integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    hash_arquivo text,
    linhas_validas integer DEFAULT 0,
    linhas_erro integer DEFAULT 0,
    usuario_id uuid,
    cancelada_em timestamp with time zone,
    cancelada_por uuid
);


--
-- Name: zoot_importacoes_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zoot_importacoes_staging (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    importacao_id uuid NOT NULL,
    linha_numero integer NOT NULL,
    dados_raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    erro text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zoot_mensal_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zoot_mensal_cache (
    fazenda_id uuid,
    cliente_id uuid,
    ano integer,
    mes integer,
    cenario text,
    ano_mes text,
    categoria_id uuid,
    categoria_codigo text,
    categoria_nome text,
    ordem_exibicao integer,
    saldo_inicial integer,
    entradas_externas integer,
    saidas_externas integer,
    evol_cat_entrada integer,
    evol_cat_saida integer,
    saldo_final integer,
    peso_total_inicial numeric,
    peso_total_final numeric,
    peso_medio_inicial numeric,
    peso_medio_final numeric,
    peso_entradas_externas numeric,
    peso_saidas_externas numeric,
    peso_evol_cat_entrada numeric,
    peso_evol_cat_saida numeric,
    dias_mes integer,
    gmd numeric,
    producao_biologica numeric,
    fonte_oficial_mes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    saldo_sistema integer,
    saldo_p1 integer
);


--
-- Name: admin_agroinblue admin_agroinblue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_agroinblue
    ADD CONSTRAINT admin_agroinblue_pkey PRIMARY KEY (user_id);


--
-- Name: bancos_referencia bancos_referencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bancos_referencia
    ADD CONSTRAINT bancos_referencia_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: categorias_rebanho categorias_rebanho_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_rebanho
    ADD CONSTRAINT categorias_rebanho_codigo_key UNIQUE (codigo);


--
-- Name: categorias_rebanho categorias_rebanho_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_rebanho
    ADD CONSTRAINT categorias_rebanho_pkey PRIMARY KEY (id);


--
-- Name: chuvas chuvas_fazenda_data_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chuvas
    ADD CONSTRAINT chuvas_fazenda_data_unique UNIQUE (fazenda_id, data);


--
-- Name: chuvas chuvas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chuvas
    ADD CONSTRAINT chuvas_pkey PRIMARY KEY (id);


--
-- Name: cliente_membros cliente_membros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_membros
    ADD CONSTRAINT cliente_membros_pkey PRIMARY KEY (id);


--
-- Name: cliente_membros cliente_membros_user_id_cliente_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_membros
    ADD CONSTRAINT cliente_membros_user_id_cliente_id_key UNIQUE (user_id, cliente_id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: conciliacao_audit_log conciliacao_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacao_audit_log
    ADD CONSTRAINT conciliacao_audit_log_pkey PRIMARY KEY (id);


--
-- Name: conciliacao_bancaria_itens conciliacao_bancaria_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacao_bancaria_itens
    ADD CONSTRAINT conciliacao_bancaria_itens_pkey PRIMARY KEY (id);


--
-- Name: excel_linhas_aux excel_linhas_aux_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_linhas_aux
    ADD CONSTRAINT excel_linhas_aux_pkey PRIMARY KEY (id);


--
-- Name: extrato_bancario_staging_itens extrato_bancario_staging_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_staging_itens
    ADD CONSTRAINT extrato_bancario_staging_itens_pkey PRIMARY KEY (id);


--
-- Name: extrato_bancario_staging extrato_bancario_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_staging
    ADD CONSTRAINT extrato_bancario_staging_pkey PRIMARY KEY (id);


--
-- Name: extrato_bancario_v2 extrato_bancario_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_v2
    ADD CONSTRAINT extrato_bancario_v2_pkey PRIMARY KEY (id);


--
-- Name: fazenda_membros fazenda_membros_fazenda_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fazenda_membros
    ADD CONSTRAINT fazenda_membros_fazenda_id_user_id_key UNIQUE (fazenda_id, user_id);


--
-- Name: fazenda_membros fazenda_membros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fazenda_membros
    ADD CONSTRAINT fazenda_membros_pkey PRIMARY KEY (id);


--
-- Name: fazendas fazendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fazendas
    ADD CONSTRAINT fazendas_pkey PRIMARY KEY (id);


--
-- Name: fechamento_area_snapshot fechamento_area_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_area_snapshot
    ADD CONSTRAINT fechamento_area_snapshot_pkey PRIMARY KEY (id);


--
-- Name: fechamento_pasto_itens fechamento_pasto_itens_fechamento_pasto_id_categoria_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_pasto_itens
    ADD CONSTRAINT fechamento_pasto_itens_fechamento_pasto_id_categoria_id_key UNIQUE (fechamento_id, categoria_id);


--
-- Name: fechamento_pasto_itens fechamento_pasto_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_pasto_itens
    ADD CONSTRAINT fechamento_pasto_itens_pkey PRIMARY KEY (id);


--
-- Name: fechamento_pastos fechamento_pastos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_pastos
    ADD CONSTRAINT fechamento_pastos_pkey PRIMARY KEY (id);


--
-- Name: financeiro_centros_custo financeiro_centros_custo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_centros_custo
    ADD CONSTRAINT financeiro_centros_custo_pkey PRIMARY KEY (id);


--
-- Name: financeiro_classificacao_regras financeiro_classificacao_regras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_classificacao_regras
    ADD CONSTRAINT financeiro_classificacao_regras_pkey PRIMARY KEY (id);


--
-- Name: financeiro_classificacao_staging financeiro_classificacao_staging_chave_unica; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_classificacao_staging
    ADD CONSTRAINT financeiro_classificacao_staging_chave_unica UNIQUE (sessao_id, excel_linha_origem);


--
-- Name: financeiro_classificacao_staging financeiro_classificacao_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_classificacao_staging
    ADD CONSTRAINT financeiro_classificacao_staging_pkey PRIMARY KEY (staging_id);


--
-- Name: financeiro_contas_bancarias financeiro_contas_bancarias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_contas_bancarias
    ADD CONSTRAINT financeiro_contas_bancarias_pkey PRIMARY KEY (id);


--
-- Name: financeiro_dividendos financeiro_dividendos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_dividendos
    ADD CONSTRAINT financeiro_dividendos_pkey PRIMARY KEY (id);


--
-- Name: financeiro_fechamentos financeiro_fechamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_fechamentos
    ADD CONSTRAINT financeiro_fechamentos_pkey PRIMARY KEY (id);


--
-- Name: financeiro_fornecedores financeiro_fornecedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_fornecedores
    ADD CONSTRAINT financeiro_fornecedores_pkey PRIMARY KEY (id);


--
-- Name: financeiro_importacoes_v2 financeiro_importacoes_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_importacoes_v2
    ADD CONSTRAINT financeiro_importacoes_v2_pkey PRIMARY KEY (id);


--
-- Name: financeiro_lancamentos_v2 financeiro_lancamentos_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos_v2
    ADD CONSTRAINT financeiro_lancamentos_v2_pkey PRIMARY KEY (id);


--
-- Name: financeiro_plano_contas financeiro_plano_contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_plano_contas
    ADD CONSTRAINT financeiro_plano_contas_pkey PRIMARY KEY (id);


--
-- Name: financeiro_safras financeiro_safras_cliente_codigo_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_safras
    ADD CONSTRAINT financeiro_safras_cliente_codigo_uk UNIQUE (cliente_id, codigo);


--
-- Name: financeiro_safras financeiro_safras_cliente_nome_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_safras
    ADD CONSTRAINT financeiro_safras_cliente_nome_uk UNIQUE (cliente_id, nome);


--
-- Name: financeiro_safras financeiro_safras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_safras
    ADD CONSTRAINT financeiro_safras_pkey PRIMARY KEY (id);


--
-- Name: financeiro_saldos_audit financeiro_saldos_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_saldos_audit
    ADD CONSTRAINT financeiro_saldos_audit_pkey PRIMARY KEY (id);


--
-- Name: financeiro_saldos_bancarios financeiro_saldos_bancarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_saldos_bancarios
    ADD CONSTRAINT financeiro_saldos_bancarios_pkey PRIMARY KEY (id);


--
-- Name: financeiro_saldos_bancarios_v2 financeiro_saldos_bancarios_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_saldos_bancarios_v2
    ADD CONSTRAINT financeiro_saldos_bancarios_v2_pkey PRIMARY KEY (id);


--
-- Name: financeiro_subcentro_aliases financeiro_subcentro_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_subcentro_aliases
    ADD CONSTRAINT financeiro_subcentro_aliases_pkey PRIMARY KEY (id);


--
-- Name: financeiros financeiros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiros
    ADD CONSTRAINT financeiros_pkey PRIMARY KEY (id);


--
-- Name: financiamento_parcelas financiamento_parcelas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamento_parcelas
    ADD CONSTRAINT financiamento_parcelas_pkey PRIMARY KEY (id);


--
-- Name: financiamentos financiamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_pkey PRIMARY KEY (id);


--
-- Name: lancamentos lancamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_pkey PRIMARY KEY (id);


--
-- Name: mesa_lancamento_staging mesa_lancamento_staging_chave_unica; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_lancamento_staging
    ADD CONSTRAINT mesa_lancamento_staging_chave_unica UNIQUE (sessao_id, excel_key);


--
-- Name: mesa_lancamento_staging mesa_lancamento_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_lancamento_staging
    ADD CONSTRAINT mesa_lancamento_staging_pkey PRIMARY KEY (staging_id);


--
-- Name: mesa_ofx_validacao mesa_ofx_validacao_chave_unica; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_ofx_validacao
    ADD CONSTRAINT mesa_ofx_validacao_chave_unica UNIQUE (sessao_id, ofx_id);


--
-- Name: mesa_ofx_validacao mesa_ofx_validacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_ofx_validacao
    ADD CONSTRAINT mesa_ofx_validacao_pkey PRIMARY KEY (id);


--
-- Name: mesa_par mesa_par_chave_unica; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_par
    ADD CONSTRAINT mesa_par_chave_unica UNIQUE (sessao_id, excel_key);


--
-- Name: mesa_par mesa_par_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_par
    ADD CONSTRAINT mesa_par_pkey PRIMARY KEY (id);


--
-- Name: mesa_sessao mesa_sessao_chave_unica; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_sessao
    ADD CONSTRAINT mesa_sessao_chave_unica UNIQUE (cliente_id, conta_bancaria_id, ano_mes);


--
-- Name: mesa_sessao mesa_sessao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_sessao
    ADD CONSTRAINT mesa_sessao_pkey PRIMARY KEY (id);


--
-- Name: meta_aprovacoes meta_aprovacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_aprovacoes
    ADD CONSTRAINT meta_aprovacoes_pkey PRIMARY KEY (id);


--
-- Name: meta_gmd_mensal meta_gmd_mensal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_gmd_mensal
    ADD CONSTRAINT meta_gmd_mensal_pkey PRIMARY KEY (id);


--
-- Name: meta_gmd_mensal meta_gmd_mensal_unique_categoria_mes_fazenda; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_gmd_mensal
    ADD CONSTRAINT meta_gmd_mensal_unique_categoria_mes_fazenda UNIQUE (fazenda_id, ano_mes, categoria);


--
-- Name: meta_parametros_nutricao meta_parametros_nutricao_fazenda_id_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_parametros_nutricao
    ADD CONSTRAINT meta_parametros_nutricao_fazenda_id_ano_key UNIQUE (fazenda_id, ano);


--
-- Name: meta_parametros_nutricao meta_parametros_nutricao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_parametros_nutricao
    ADD CONSTRAINT meta_parametros_nutricao_pkey PRIMARY KEY (id);


--
-- Name: meta_projetos_investimento meta_projetos_investimento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_projetos_investimento
    ADD CONSTRAINT meta_projetos_investimento_pkey PRIMARY KEY (id);


--
-- Name: meta_valor_rebanho_precos meta_valor_rebanho_precos_cliente_id_fazenda_id_ano_mes_cat_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_valor_rebanho_precos
    ADD CONSTRAINT meta_valor_rebanho_precos_cliente_id_fazenda_id_ano_mes_cat_key UNIQUE (cliente_id, fazenda_id, ano_mes, categoria);


--
-- Name: meta_valor_rebanho_precos meta_valor_rebanho_precos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_valor_rebanho_precos
    ADD CONSTRAINT meta_valor_rebanho_precos_pkey PRIMARY KEY (id);


--
-- Name: meta_valor_rebanho_status meta_valor_rebanho_status_cliente_id_ano_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_valor_rebanho_status
    ADD CONSTRAINT meta_valor_rebanho_status_cliente_id_ano_mes_key UNIQUE (cliente_id, ano_mes);


--
-- Name: meta_valor_rebanho_status meta_valor_rebanho_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_valor_rebanho_status
    ADD CONSTRAINT meta_valor_rebanho_status_pkey PRIMARY KEY (id);


--
-- Name: meta_versoes meta_versoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_versoes
    ADD CONSTRAINT meta_versoes_pkey PRIMARY KEY (id);


--
-- Name: pastos pastos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pastos
    ADD CONSTRAINT pastos_pkey PRIMARY KEY (id);


--
-- Name: planejamento_area_meta planejamento_area_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planejamento_area_meta
    ADD CONSTRAINT planejamento_area_meta_pkey PRIMARY KEY (id);


--
-- Name: planejamento_area_meta planejamento_area_meta_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planejamento_area_meta
    ADD CONSTRAINT planejamento_area_meta_uq UNIQUE (cliente_id, fazenda_id, ano, mes);


--
-- Name: planejamento_financeiro planejamento_financeiro_fazenda_id_ano_mes_centro_custo_sub_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planejamento_financeiro
    ADD CONSTRAINT planejamento_financeiro_fazenda_id_ano_mes_centro_custo_sub_key UNIQUE (fazenda_id, ano, mes, centro_custo, subcentro, cenario);


--
-- Name: planejamento_financeiro planejamento_financeiro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planejamento_financeiro
    ADD CONSTRAINT planejamento_financeiro_pkey PRIMARY KEY (id);


--
-- Name: reclassificacoes reclassificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reclassificacoes
    ADD CONSTRAINT reclassificacoes_pkey PRIMARY KEY (id);


--
-- Name: saldos_iniciais saldos_iniciais_fazenda_id_categoria_id_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos_iniciais
    ADD CONSTRAINT saldos_iniciais_fazenda_id_categoria_id_ano_key UNIQUE (fazenda_id, categoria_id, ano);


--
-- Name: saldos_iniciais saldos_iniciais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos_iniciais
    ADD CONSTRAINT saldos_iniciais_pkey PRIMARY KEY (id);


--
-- Name: transferencia_ofx_pares transferencia_ofx_pares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencia_ofx_pares
    ADD CONSTRAINT transferencia_ofx_pares_pkey PRIMARY KEY (id);


--
-- Name: fechamento_area_snapshot unique_fazenda_mes; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_area_snapshot
    ADD CONSTRAINT unique_fazenda_mes UNIQUE (fazenda_id, ano_mes);


--
-- Name: fazenda_cadastros uq_fazenda_cadastros_fazenda_cliente; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fazenda_cadastros
    ADD CONSTRAINT uq_fazenda_cadastros_fazenda_cliente UNIQUE (cliente_id, fazenda_id);


--
-- Name: valor_rebanho_fechamento_itens valor_rebanho_fechamento_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_fechamento_itens
    ADD CONSTRAINT valor_rebanho_fechamento_itens_pkey PRIMARY KEY (id);


--
-- Name: valor_rebanho_fechamento valor_rebanho_fechamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_fechamento
    ADD CONSTRAINT valor_rebanho_fechamento_pkey PRIMARY KEY (id);


--
-- Name: valor_rebanho_mensal valor_rebanho_mensal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_mensal
    ADD CONSTRAINT valor_rebanho_mensal_pkey PRIMARY KEY (id);


--
-- Name: valor_rebanho_meta valor_rebanho_meta_fazenda_id_ano_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_meta
    ADD CONSTRAINT valor_rebanho_meta_fazenda_id_ano_mes_key UNIQUE (fazenda_id, ano_mes);


--
-- Name: valor_rebanho_meta_itens valor_rebanho_meta_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_meta_itens
    ADD CONSTRAINT valor_rebanho_meta_itens_pkey PRIMARY KEY (id);


--
-- Name: valor_rebanho_meta valor_rebanho_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_meta
    ADD CONSTRAINT valor_rebanho_meta_pkey PRIMARY KEY (id);


--
-- Name: valor_rebanho_meta_validada valor_rebanho_meta_validada_fazenda_id_ano_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_meta_validada
    ADD CONSTRAINT valor_rebanho_meta_validada_fazenda_id_ano_mes_key UNIQUE (fazenda_id, ano_mes);


--
-- Name: valor_rebanho_meta_validada valor_rebanho_meta_validada_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_meta_validada
    ADD CONSTRAINT valor_rebanho_meta_validada_pkey PRIMARY KEY (id);


--
-- Name: valor_rebanho_realizado_validado valor_rebanho_realizado_validado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_realizado_validado
    ADD CONSTRAINT valor_rebanho_realizado_validado_pkey PRIMARY KEY (id);


--
-- Name: valor_rebanho_fechamento vrf_fazenda_anomes_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_fechamento
    ADD CONSTRAINT vrf_fazenda_anomes_unique UNIQUE (fazenda_id, ano_mes);


--
-- Name: valor_rebanho_realizado_validado vrv_fazenda_anomes_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_realizado_validado
    ADD CONSTRAINT vrv_fazenda_anomes_unique UNIQUE (fazenda_id, ano_mes);


--
-- Name: fazendas_cliente_codigo_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fazendas_cliente_codigo_unique ON public.fazendas USING btree (cliente_id, codigo_importacao) WHERE (codigo_importacao IS NOT NULL);


--
-- Name: financeiro_fechamentos_uq_cliente_fazenda_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX financeiro_fechamentos_uq_cliente_fazenda_mes ON public.financeiro_fechamentos USING btree (cliente_id, fazenda_id, ano_mes);


--
-- Name: financeiro_lancamentos_v2_import_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financeiro_lancamentos_v2_import_lookup_idx ON public.financeiro_lancamentos_v2 USING btree (cliente_id, fazenda_id, data_pagamento, valor, tipo_operacao, conta_bancaria_id) WHERE ((COALESCE(cancelado, false) = false) AND (lote_importacao_id IS NOT NULL));


--
-- Name: idx_alias_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alias_lookup ON public.financeiro_subcentro_aliases USING btree (cliente_id, lower(TRIM(BOTH FROM alias_text))) WHERE (ativo = true);


--
-- Name: idx_alias_plano_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alias_plano_conta ON public.financeiro_subcentro_aliases USING btree (plano_conta_id);


--
-- Name: idx_analise_consultor_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analise_consultor_cliente ON public.analise_consultor USING btree (cliente_id);


--
-- Name: idx_analise_consultor_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analise_consultor_periodo ON public.analise_consultor USING btree (cliente_id, ano, mes);


--
-- Name: idx_audit_cliente_acao_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_cliente_acao_data ON public.conciliacao_audit_log USING btree (cliente_id, acao, created_at DESC);


--
-- Name: idx_audit_extrato_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_extrato_data ON public.conciliacao_audit_log USING btree (extrato_id, created_at DESC) WHERE (extrato_id IS NOT NULL);


--
-- Name: idx_audit_lancamento_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_lancamento_data ON public.conciliacao_audit_log USING btree (lancamento_id, created_at DESC) WHERE (lancamento_id IS NOT NULL);


--
-- Name: idx_audit_log_cliente_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_cliente_created ON public.audit_log USING btree (cliente_id, created_at DESC);


--
-- Name: idx_audit_log_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_fazenda ON public.audit_log USING btree (fazenda_id);


--
-- Name: idx_audit_log_modulo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_modulo ON public.audit_log USING btree (modulo);


--
-- Name: idx_audit_log_mov_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_mov_cliente ON public.audit_log_movimentacoes USING btree (cliente_id, created_at DESC);


--
-- Name: idx_audit_log_mov_movimentacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_mov_movimentacao ON public.audit_log_movimentacoes USING btree (movimentacao_id);


--
-- Name: idx_audit_log_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_usuario ON public.audit_log USING btree (usuario_id);


--
-- Name: idx_categorias_rebanho_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categorias_rebanho_codigo ON public.categorias_rebanho USING btree (codigo);


--
-- Name: idx_chuvas_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chuvas_cliente_id ON public.chuvas USING btree (cliente_id);


--
-- Name: idx_class_regras_cliente_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_regras_cliente_ativo ON public.financeiro_classificacao_regras USING btree (cliente_id, ativo);


--
-- Name: idx_class_regras_subcentro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_regras_subcentro ON public.financeiro_classificacao_regras USING btree (lower(cond_subcentro));


--
-- Name: idx_conciliacao_itens_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conciliacao_itens_cliente ON public.conciliacao_bancaria_itens USING btree (cliente_id);


--
-- Name: idx_conciliacao_itens_extrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conciliacao_itens_extrato ON public.conciliacao_bancaria_itens USING btree (extrato_id);


--
-- Name: idx_conciliacao_itens_lancamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conciliacao_itens_lancamento ON public.conciliacao_bancaria_itens USING btree (lancamento_id);


--
-- Name: idx_conciliacao_itens_par_unico_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_conciliacao_itens_par_unico_ativo ON public.conciliacao_bancaria_itens USING btree (extrato_id, lancamento_id) WHERE (desfeito_em IS NULL);


--
-- Name: idx_contas_mes_inicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contas_mes_inicio ON public.financeiro_contas_bancarias USING btree (cliente_id, mes_inicio) WHERE (mes_inicio IS NOT NULL);


--
-- Name: idx_excel_aux_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excel_aux_batch ON public.excel_linhas_aux USING btree (cliente_id, batch_id);


--
-- Name: idx_excel_aux_match; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excel_aux_match ON public.excel_linhas_aux USING btree (cliente_id, conta_bancaria_id, data_referencia, valor) WHERE (status = 'pendente'::text);


--
-- Name: idx_excel_aux_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excel_aux_status ON public.excel_linhas_aux USING btree (cliente_id, status);


--
-- Name: idx_extrato_descricao_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extrato_descricao_trgm ON public.extrato_bancario_v2 USING gin (descricao public.gin_trgm_ops) WHERE (cancelado_em IS NULL);


--
-- Name: idx_extrato_orfao_definitivo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extrato_orfao_definitivo ON public.extrato_bancario_v2 USING btree (cliente_id, data_movimento DESC) WHERE ((orfao_definitivo = true) AND (cancelado_em IS NULL));


--
-- Name: idx_extrato_suspeitas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extrato_suspeitas ON public.extrato_bancario_v2 USING btree (cliente_id, data_movimento DESC) WHERE ((flag_suspeita_valor OR flag_suspeita_fornecedor) AND (cancelado_em IS NULL));


--
-- Name: idx_extrato_v2_chave_natural; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_extrato_v2_chave_natural ON public.extrato_bancario_v2 USING btree (cliente_id, conta_bancaria_id, data_movimento, valor, public.fn_extrato_chave_doc(documento), seq_ocorrencia) WHERE ((cancelado_em IS NULL) AND (status <> 'ignorado'::text));


--
-- Name: idx_extrato_v2_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extrato_v2_cliente_id ON public.extrato_bancario_v2 USING btree (cliente_id);


--
-- Name: idx_extrato_v2_conta_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extrato_v2_conta_data ON public.extrato_bancario_v2 USING btree (conta_bancaria_id, data_movimento);


--
-- Name: idx_extrato_v2_hash_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_extrato_v2_hash_unico ON public.extrato_bancario_v2 USING btree (cliente_id, hash_movimento);


--
-- Name: idx_extrato_v2_importacao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extrato_v2_importacao_id ON public.extrato_bancario_v2 USING btree (importacao_id);


--
-- Name: idx_extrato_v2_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extrato_v2_status ON public.extrato_bancario_v2 USING btree (status);


--
-- Name: idx_fas_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fas_cliente ON public.fechamento_area_snapshot USING btree (cliente_id);


--
-- Name: idx_fas_fazenda_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fas_fazenda_mes ON public.fechamento_area_snapshot USING btree (fazenda_id, ano_mes);


--
-- Name: idx_fazenda_status_mensal_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fazenda_status_mensal_cliente ON public.fazenda_status_mensal USING btree (cliente_id);


--
-- Name: idx_fazenda_status_mensal_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fazenda_status_mensal_fazenda ON public.fazenda_status_mensal USING btree (fazenda_id, ano_mes);


--
-- Name: idx_fazendas_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fazendas_cliente_id ON public.fazendas USING btree (cliente_id);


--
-- Name: idx_fechamento_pasto_itens_fechamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fechamento_pasto_itens_fechamento ON public.fechamento_pasto_itens USING btree (fechamento_id);


--
-- Name: idx_fechamento_pastos_cliente_anomes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fechamento_pastos_cliente_anomes ON public.fechamento_pastos USING btree (cliente_id, ano_mes);


--
-- Name: idx_fechamento_pastos_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fechamento_pastos_cliente_id ON public.fechamento_pastos USING btree (cliente_id);


--
-- Name: idx_fex_cliente_ano_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fex_cliente_ano_mes ON public.fechamentos_executivos USING btree (cliente_id, ano, mes);


--
-- Name: idx_fex_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fex_fazenda ON public.fechamentos_executivos USING btree (fazenda_id) WHERE (fazenda_id IS NOT NULL);


--
-- Name: idx_fexec_fechamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fexec_fechamento ON public.fechamento_execucoes USING btree (fechamento_id);


--
-- Name: idx_fg_fechamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fg_fechamento ON public.fechamento_graficos USING btree (fechamento_id);


--
-- Name: idx_fi_fechamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_fechamento ON public.fechamento_indicadores USING btree (fechamento_id);


--
-- Name: idx_fi_grupo_chave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fi_grupo_chave ON public.fechamento_indicadores USING btree (fechamento_id, grupo, chave);


--
-- Name: idx_fin_classif_staging_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_classif_staging_cliente ON public.financeiro_classificacao_staging USING btree (cliente_id, aplicado);


--
-- Name: idx_fin_classif_staging_lanc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_classif_staging_lanc ON public.financeiro_classificacao_staging USING btree (match_lancamento_id) WHERE (match_lancamento_id IS NOT NULL);


--
-- Name: idx_fin_classif_staging_sessao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_classif_staging_sessao ON public.financeiro_classificacao_staging USING btree (sessao_id);


--
-- Name: idx_fin_classif_staging_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_classif_staging_status ON public.financeiro_classificacao_staging USING btree (sessao_id, match_status);


--
-- Name: idx_fin_concil_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_concil_cliente ON public.financeiro_conciliacoes USING btree (cliente_id);


--
-- Name: idx_fin_concil_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_concil_conta ON public.financeiro_conciliacoes USING btree (conta_bancaria_id);


--
-- Name: idx_fin_concil_extrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_concil_extrato ON public.financeiro_conciliacoes USING btree (extrato_id);


--
-- Name: idx_fin_concil_lanc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_concil_lanc ON public.financeiro_conciliacoes USING btree (lancamento_id);


--
-- Name: idx_fin_contas_bancarias_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_contas_bancarias_cliente ON public.financeiro_contas_bancarias USING btree (cliente_id);


--
-- Name: idx_fin_contas_bancarias_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_contas_bancarias_fazenda ON public.financeiro_contas_bancarias USING btree (fazenda_id);


--
-- Name: idx_fin_extrato_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_extrato_cliente ON public.financeiro_extrato_bancario USING btree (cliente_id);


--
-- Name: idx_fin_extrato_conciliado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_extrato_conciliado ON public.financeiro_extrato_bancario USING btree (conciliado);


--
-- Name: idx_fin_extrato_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_extrato_conta ON public.financeiro_extrato_bancario USING btree (conta_bancaria_id);


--
-- Name: idx_fin_extrato_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_extrato_data ON public.financeiro_extrato_bancario USING btree (data_movimento);


--
-- Name: idx_fin_extrato_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_extrato_hash ON public.financeiro_extrato_bancario USING btree (hash_conciliacao) WHERE (hash_conciliacao IS NOT NULL);


--
-- Name: idx_fin_fechamentos_anomes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_fechamentos_anomes ON public.financeiro_fechamentos USING btree (ano_mes);


--
-- Name: idx_fin_fechamentos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_fechamentos_cliente ON public.financeiro_fechamentos USING btree (cliente_id);


--
-- Name: idx_fin_fechamentos_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_fechamentos_fazenda ON public.financeiro_fechamentos USING btree (fazenda_id);


--
-- Name: idx_fin_fechamentos_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_fin_fechamentos_unique ON public.financeiro_fechamentos USING btree (cliente_id, fazenda_id, ano_mes);


--
-- Name: idx_fin_import_v2_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_import_v2_cliente ON public.financeiro_importacoes_v2 USING btree (cliente_id);


--
-- Name: idx_fin_import_v2_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_import_v2_fazenda ON public.financeiro_importacoes_v2 USING btree (fazenda_id);


--
-- Name: idx_fin_lanc_cancelado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_cancelado ON public.financeiro_lancamentos USING btree (cancelado) WHERE (cancelado = false);


--
-- Name: idx_fin_lanc_editado_manual; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_editado_manual ON public.financeiro_lancamentos USING btree (importacao_id) WHERE (editado_manual = true);


--
-- Name: idx_fin_lanc_hash_importacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_hash_importacao ON public.financeiro_lancamentos USING btree (cliente_id, hash_importacao) WHERE (hash_importacao IS NOT NULL);


--
-- Name: idx_fin_lanc_v2_ano_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_ano_mes ON public.financeiro_lancamentos_v2 USING btree (ano_mes);


--
-- Name: idx_fin_lanc_v2_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_cliente ON public.financeiro_lancamentos_v2 USING btree (cliente_id);


--
-- Name: idx_fin_lanc_v2_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_conta ON public.financeiro_lancamentos_v2 USING btree (conta_bancaria_id);


--
-- Name: idx_fin_lanc_v2_data_pag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_data_pag ON public.financeiro_lancamentos_v2 USING btree (data_pagamento);


--
-- Name: idx_fin_lanc_v2_duplicado_de; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_duplicado_de ON public.financeiro_lancamentos_v2 USING btree (duplicado_de_id) WHERE (duplicado_de_id IS NOT NULL);


--
-- Name: idx_fin_lanc_v2_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_fazenda ON public.financeiro_lancamentos_v2 USING btree (fazenda_id);


--
-- Name: idx_fin_lanc_v2_lote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_lote ON public.financeiro_lancamentos_v2 USING btree (lote_importacao_id);


--
-- Name: idx_fin_lanc_v2_macro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_macro ON public.financeiro_lancamentos_v2 USING btree (macro_custo);


--
-- Name: idx_fin_lanc_v2_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_status ON public.financeiro_lancamentos_v2 USING btree (status_transacao);


--
-- Name: idx_fin_lanc_v2_status_dup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_status_dup ON public.financeiro_lancamentos_v2 USING btree (status_duplicidade) WHERE (status_duplicidade <> 'pendente'::text);


--
-- Name: idx_fin_lanc_v2_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_v2_tipo ON public.financeiro_lancamentos_v2 USING btree (tipo_operacao);


--
-- Name: idx_fin_mapa_class_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_mapa_class_cliente ON public.financeiro_mapa_classificacao USING btree (cliente_id);


--
-- Name: idx_fin_mapa_class_macro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_mapa_class_macro ON public.financeiro_mapa_classificacao USING btree (macro_custo);


--
-- Name: idx_fin_mapa_class_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_mapa_class_tipo ON public.financeiro_mapa_classificacao USING btree (tipo_operacao);


--
-- Name: idx_fin_parcelas_juros_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_parcelas_juros_id ON public.financiamento_parcelas USING btree (lancamento_juros_id) WHERE (lancamento_juros_id IS NOT NULL);


--
-- Name: idx_fin_plano_contas_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_plano_contas_cliente ON public.financeiro_plano_contas USING btree (cliente_id);


--
-- Name: idx_fin_plano_contas_macro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_plano_contas_macro ON public.financeiro_plano_contas USING btree (macro_custo);


--
-- Name: idx_fin_plano_contas_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_plano_contas_tipo ON public.financeiro_plano_contas USING btree (tipo_operacao);


--
-- Name: idx_fin_rateio_anomes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_rateio_anomes ON public.financeiro_rateio_adm USING btree (ano_mes);


--
-- Name: idx_fin_rateio_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_rateio_cliente ON public.financeiro_rateio_adm USING btree (cliente_id);


--
-- Name: idx_fin_rateio_itens_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_rateio_itens_cliente ON public.financeiro_rateio_adm_itens USING btree (cliente_id);


--
-- Name: idx_fin_rateio_itens_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_rateio_itens_fazenda ON public.financeiro_rateio_adm_itens USING btree (fazenda_id);


--
-- Name: idx_fin_rateio_itens_rateio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_rateio_itens_rateio ON public.financeiro_rateio_adm_itens USING btree (rateio_id);


--
-- Name: idx_fin_saldos_v2_anomes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_saldos_v2_anomes ON public.financeiro_saldos_bancarios_v2 USING btree (ano_mes);


--
-- Name: idx_fin_saldos_v2_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_saldos_v2_cliente ON public.financeiro_saldos_bancarios_v2 USING btree (cliente_id);


--
-- Name: idx_fin_saldos_v2_conta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_saldos_v2_conta ON public.financeiro_saldos_bancarios_v2 USING btree (conta_bancaria_id);


--
-- Name: idx_fin_saldos_v2_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_saldos_v2_fazenda ON public.financeiro_saldos_bancarios_v2 USING btree (fazenda_id);


--
-- Name: idx_fin_v2_hash_importacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_v2_hash_importacao ON public.financeiro_lancamentos_v2 USING btree (hash_importacao) WHERE (hash_importacao IS NOT NULL);


--
-- Name: idx_fin_v2_mov_rebanho; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_v2_mov_rebanho ON public.financeiro_lancamentos_v2 USING btree (movimentacao_rebanho_id) WHERE (movimentacao_rebanho_id IS NOT NULL);


--
-- Name: idx_financeiro_dividendos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financeiro_dividendos_cliente ON public.financeiro_dividendos USING btree (cliente_id, ativo, ordem_exibicao);


--
-- Name: idx_financeiro_lancamentos_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financeiro_lancamentos_cliente_id ON public.financeiro_lancamentos USING btree (cliente_id);


--
-- Name: idx_financeiro_lancamentos_safra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financeiro_lancamentos_safra ON public.financeiro_lancamentos_v2 USING btree (safra_id);


--
-- Name: idx_financeiro_lancamentos_v2_hash_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financeiro_lancamentos_v2_hash_lookup ON public.financeiro_lancamentos_v2 USING btree (cliente_id, hash_importacao) WHERE (lote_importacao_id IS NOT NULL);


--
-- Name: idx_financeiro_lancamentos_v2_importacao_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financeiro_lancamentos_v2_importacao_ativo ON public.financeiro_lancamentos_v2 USING btree (lote_importacao_id, cancelado);


--
-- Name: idx_financeiro_safras_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financeiro_safras_cliente ON public.financeiro_safras USING btree (cliente_id);


--
-- Name: idx_financeiro_saldos_bancarios_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financeiro_saldos_bancarios_cliente_id ON public.financeiro_saldos_bancarios USING btree (cliente_id);


--
-- Name: idx_flv2_staging_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flv2_staging_id ON public.financeiro_lancamentos_v2 USING btree (staging_id) WHERE (staging_id IS NOT NULL);


--
-- Name: idx_fp_cliente_anomes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fp_cliente_anomes ON public.fechamento_pastos USING btree (cliente_id, ano_mes, status);


--
-- Name: idx_fp_fazenda_anomes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fp_fazenda_anomes ON public.fechamento_pastos USING btree (fazenda_id, ano_mes, status);


--
-- Name: idx_fpi_fechamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fpi_fechamento ON public.fechamento_pasto_itens USING btree (fechamento_id, categoria_id);


--
-- Name: idx_ft_fechamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_fechamento ON public.fechamento_textos USING btree (fechamento_id);


--
-- Name: idx_lanc_descricao_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lanc_descricao_trgm ON public.financeiro_lancamentos_v2 USING gin (descricao public.gin_trgm_ops) WHERE (cancelado = false);


--
-- Name: idx_lanc_historico_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lanc_historico_trgm ON public.financeiro_lancamentos_v2 USING gin (historico public.gin_trgm_ops) WHERE (cancelado = false);


--
-- Name: idx_lanc_orfao_definitivo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lanc_orfao_definitivo ON public.financeiro_lancamentos_v2 USING btree (cliente_id, data_pagamento DESC) WHERE ((orfao_definitivo = true) AND (cancelado = false));


--
-- Name: idx_lancamentos_cancelado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_cancelado ON public.lancamentos USING btree (cancelado) WHERE (cancelado = false);


--
-- Name: idx_lancamentos_cenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_cenario ON public.lancamentos USING btree (cenario);


--
-- Name: idx_lancamentos_cenario_meta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_cenario_meta ON public.lancamentos USING btree (fazenda_id, cenario) WHERE (cenario = 'meta'::text);


--
-- Name: idx_lancamentos_cli_cen_can; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_cli_cen_can ON public.lancamentos USING btree (cliente_id, cenario, cancelado);


--
-- Name: idx_lancamentos_cli_cen_can_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_cli_cen_can_data ON public.lancamentos USING btree (cliente_id, cenario, cancelado, data);


--
-- Name: idx_lancamentos_cliente_cenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_cliente_cenario ON public.lancamentos USING btree (cliente_id, cenario, cancelado);


--
-- Name: idx_lancamentos_cliente_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_cliente_data ON public.lancamentos USING btree (cliente_id, data DESC);


--
-- Name: idx_lancamentos_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_cliente_id ON public.lancamentos USING btree (cliente_id);


--
-- Name: idx_lancamentos_faz_cen_can; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_faz_cen_can ON public.lancamentos USING btree (fazenda_id, cenario, cancelado);


--
-- Name: idx_lancamentos_faz_cen_can_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_faz_cen_can_data ON public.lancamentos USING btree (fazenda_id, cenario, cancelado, data);


--
-- Name: idx_lancamentos_fazenda_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_fazenda_data ON public.lancamentos USING btree (fazenda_id, data);


--
-- Name: idx_lancamentos_fornecedor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_fornecedor_id ON public.lancamentos USING btree (fornecedor_id) WHERE (fornecedor_id IS NOT NULL);


--
-- Name: idx_lancamentos_hash_linha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_hash_linha ON public.lancamentos USING btree (fazenda_id, hash_linha) WHERE (cancelado = false);


--
-- Name: idx_lancamentos_lote_importacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_lote_importacao ON public.lancamentos USING btree (lote_importacao_id) WHERE (lote_importacao_id IS NOT NULL);


--
-- Name: idx_lancamentos_origem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_origem ON public.lancamentos USING btree (origem) WHERE (origem IS NOT NULL);


--
-- Name: idx_lancamentos_status_op; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_status_op ON public.lancamentos USING btree (fazenda_id, cenario, cancelado, status_operacional, tipo) WHERE ((cancelado = false) AND (cenario = 'realizado'::text));


--
-- Name: idx_lancamentos_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_tipo ON public.lancamentos USING btree (tipo);


--
-- Name: idx_lancamentos_v2_cenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lancamentos_v2_cenario ON public.financeiro_lancamentos_v2 USING btree (cenario);


--
-- Name: idx_mesa_ofx_validacao_sessao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_ofx_validacao_sessao ON public.mesa_ofx_validacao USING btree (sessao_id, status);


--
-- Name: idx_mesa_par_sessao_decisao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_par_sessao_decisao ON public.mesa_par USING btree (sessao_id, decisao);


--
-- Name: idx_mesa_sessao_atualizada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_sessao_atualizada ON public.mesa_sessao USING btree (updated_at DESC);


--
-- Name: idx_mesa_sessao_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_sessao_cliente ON public.mesa_sessao USING btree (cliente_id, status);


--
-- Name: idx_mesa_staging_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_staging_cliente ON public.mesa_lancamento_staging USING btree (cliente_id, status_promocao);


--
-- Name: idx_mesa_staging_lancamento_v2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_staging_lancamento_v2 ON public.mesa_lancamento_staging USING btree (lancamento_v2_id) WHERE (lancamento_v2_id IS NOT NULL);


--
-- Name: idx_mesa_staging_sessao_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mesa_staging_sessao_status ON public.mesa_lancamento_staging USING btree (sessao_id, status_promocao);


--
-- Name: idx_meta_projetos_inv_cliente_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_projetos_inv_cliente_ano ON public.meta_projetos_investimento USING btree (cliente_id, ano);


--
-- Name: idx_meta_projetos_inv_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_projetos_inv_fazenda ON public.meta_projetos_investimento USING btree (fazenda_id);


--
-- Name: idx_meta_versoes_cliente_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_versoes_cliente_ano ON public.meta_versoes USING btree (cliente_id, ano);


--
-- Name: idx_meta_versoes_cliente_ano_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_versoes_cliente_ano_status ON public.meta_versoes USING btree (cliente_id, ano, status);


--
-- Name: idx_pasto_mov_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pasto_mov_data ON public.pasto_movimentacoes USING btree (data DESC);


--
-- Name: idx_pasto_mov_destino; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pasto_mov_destino ON public.pasto_movimentacoes USING btree (pasto_destino_id);


--
-- Name: idx_pasto_mov_origem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pasto_mov_origem ON public.pasto_movimentacoes USING btree (pasto_origem_id);


--
-- Name: idx_pastos_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pastos_cliente_id ON public.pastos USING btree (cliente_id);


--
-- Name: idx_pastos_ordem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pastos_ordem ON public.pastos USING btree (fazenda_id, ordem_exibicao, nome);


--
-- Name: idx_planejamento_area_meta_cliente_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planejamento_area_meta_cliente_ano ON public.planejamento_area_meta USING btree (cliente_id, ano);


--
-- Name: idx_planejamento_area_meta_fazenda_ano_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planejamento_area_meta_fazenda_ano_mes ON public.planejamento_area_meta USING btree (fazenda_id, ano, mes);


--
-- Name: idx_planejamento_fin_fazenda_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planejamento_fin_fazenda_ano ON public.planejamento_financeiro USING btree (fazenda_id, ano, cenario);


--
-- Name: idx_plano_contas_grupo_custo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plano_contas_grupo_custo ON public.financeiro_plano_contas USING btree (cliente_id, grupo_custo);


--
-- Name: idx_reclassificacoes_faz_ano_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reclassificacoes_faz_ano_mes ON public.reclassificacoes USING btree (fazenda_id, ano, mes);


--
-- Name: idx_saldos_iniciais_cliente_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saldos_iniciais_cliente_ano ON public.saldos_iniciais USING btree (cliente_id, ano);


--
-- Name: idx_saldos_iniciais_fazenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saldos_iniciais_fazenda ON public.saldos_iniciais USING btree (fazenda_id, ano);


--
-- Name: idx_si_cliente_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_si_cliente_ano ON public.saldos_iniciais USING btree (cliente_id, ano);


--
-- Name: idx_si_fazenda_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_si_fazenda_ano ON public.saldos_iniciais USING btree (fazenda_id, ano);


--
-- Name: idx_staging_alias_id_usado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staging_alias_id_usado ON public.financeiro_classificacao_staging USING btree (alias_id_usado) WHERE (alias_id_usado IS NOT NULL);


--
-- Name: idx_staging_conta_resolvida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staging_conta_resolvida ON public.mesa_lancamento_staging USING btree (conta_resolvida_id) WHERE (conta_resolvida_id IS NOT NULL);


--
-- Name: idx_staging_expira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staging_expira ON public.extrato_bancario_staging USING btree (expira_em) WHERE (status = 'aberto'::text);


--
-- Name: idx_staging_hash_owner_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_staging_hash_owner_cliente ON public.extrato_bancario_staging USING btree (cliente_id, owner_user_id, hash_arquivo) WHERE (status = 'aberto'::text);


--
-- Name: idx_staging_itens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staging_itens_hash ON public.extrato_bancario_staging_itens USING btree (hash_movimento);


--
-- Name: idx_staging_itens_staging; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staging_itens_staging ON public.extrato_bancario_staging_itens USING btree (staging_id);


--
-- Name: idx_staging_owner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staging_owner_status ON public.extrato_bancario_staging USING btree (owner_user_id, status);


--
-- Name: idx_valor_rebanho_fechamento_itens_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_valor_rebanho_fechamento_itens_cliente ON public.valor_rebanho_fechamento_itens USING btree (cliente_id);


--
-- Name: idx_valor_rebanho_fechamento_itens_fazenda_ano_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_valor_rebanho_fechamento_itens_fazenda_ano_mes ON public.valor_rebanho_fechamento_itens USING btree (fazenda_id, ano_mes);


--
-- Name: idx_valor_rebanho_mensal_cliente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_valor_rebanho_mensal_cliente_id ON public.valor_rebanho_mensal USING btree (cliente_id);


--
-- Name: idx_valor_rebanho_meta_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_valor_rebanho_meta_cliente ON public.valor_rebanho_meta USING btree (cliente_id);


--
-- Name: idx_valor_rebanho_meta_fazenda_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_valor_rebanho_meta_fazenda_mes ON public.valor_rebanho_meta USING btree (fazenda_id, ano_mes);


--
-- Name: idx_valor_rebanho_meta_itens_meta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_valor_rebanho_meta_itens_meta ON public.valor_rebanho_meta_itens USING btree (meta_id);


--
-- Name: idx_valor_rebanho_meta_validada_fazenda_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_valor_rebanho_meta_validada_fazenda_mes ON public.valor_rebanho_meta_validada USING btree (fazenda_id, ano_mes);


--
-- Name: idx_zoot_importacoes_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zoot_importacoes_hash ON public.zoot_importacoes USING btree (cliente_id, fazenda_id, hash_arquivo) WHERE (status <> 'excluido'::text);


--
-- Name: ix_tofx_cliente_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tofx_cliente_mes ON public.transferencia_ofx_pares USING btree (cliente_id, ano_mes);


--
-- Name: mesa_staging_ofx_promovido_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mesa_staging_ofx_promovido_uniq ON public.mesa_lancamento_staging USING btree (ofx_extrato_id) WHERE ((status_promocao = 'promovido'::text) AND (ofx_extrato_id IS NOT NULL));


--
-- Name: meta_aprovacoes_idx_cfa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_aprovacoes_idx_cfa ON public.meta_aprovacoes USING btree (cliente_id, fazenda_id, ano);


--
-- Name: meta_aprovacoes_idx_versao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_aprovacoes_idx_versao ON public.meta_aprovacoes USING btree (versao_id);


--
-- Name: meta_aprovacoes_uq_aprovado_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX meta_aprovacoes_uq_aprovado_ativo ON public.meta_aprovacoes USING btree (cliente_id, fazenda_id, ano) WHERE (status = 'aprovado'::text);


--
-- Name: planejamento_fin_unique_line; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX planejamento_fin_unique_line ON public.planejamento_financeiro USING btree (fazenda_id, ano, mes, centro_custo, subcentro, cenario);


--
-- Name: saldos_iniciais_fazenda_ano_mes_cat_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX saldos_iniciais_fazenda_ano_mes_cat_uq ON public.saldos_iniciais USING btree (fazenda_id, ano, mes, categoria);


--
-- Name: uniq_alias_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_alias_cliente ON public.financeiro_subcentro_aliases USING btree (cliente_id, lower(TRIM(BOTH FROM alias_text))) WHERE (cliente_id IS NOT NULL);


--
-- Name: uniq_alias_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_alias_global ON public.financeiro_subcentro_aliases USING btree (lower(TRIM(BOTH FROM alias_text))) WHERE (cliente_id IS NULL);


--
-- Name: uq_categoria_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_categoria_cliente ON public.cfg_categoria_parametros USING btree (categoria_codigo, cliente_id);


--
-- Name: uq_fin_centro_custo_hierarquia; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_fin_centro_custo_hierarquia ON public.financeiro_centros_custo USING btree (fazenda_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, COALESCE(subcentro, ''::text));


--
-- Name: uq_plano_contas_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_plano_contas_global ON public.financeiro_plano_contas USING btree (tipo_operacao, macro_custo, COALESCE(grupo_custo, ''::text), centro_custo, COALESCE(subcentro, ''::text)) WHERE (ativo = true);


--
-- Name: uq_tofx_entrada_confirm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tofx_entrada_confirm ON public.transferencia_ofx_pares USING btree (ofx_entrada_id) WHERE (status = 'confirmado'::text);


--
-- Name: uq_tofx_par; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tofx_par ON public.transferencia_ofx_pares USING btree (ofx_saida_id, ofx_entrada_id);


--
-- Name: uq_tofx_saida_confirm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tofx_saida_confirm ON public.transferencia_ofx_pares USING btree (ofx_saida_id) WHERE (status = 'confirmado'::text);


--
-- Name: uq_valor_reb_real_validado_fazenda_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_valor_reb_real_validado_fazenda_mes ON public.valor_rebanho_realizado_validado USING btree (fazenda_id, ano_mes);


--
-- Name: valor_rebanho_fechamento_itens_unq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX valor_rebanho_fechamento_itens_unq ON public.valor_rebanho_fechamento_itens USING btree (fazenda_id, ano_mes, categoria);


--
-- Name: zoot_mensal_cache_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zoot_mensal_cache_cliente_idx ON public.zoot_mensal_cache USING btree (cliente_id, ano, cenario);


--
-- Name: zoot_mensal_cache_fazenda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zoot_mensal_cache_fazenda_idx ON public.zoot_mensal_cache USING btree (fazenda_id, ano, cenario);


--
-- Name: zoot_mensal_cache_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX zoot_mensal_cache_pk ON public.zoot_mensal_cache USING btree (fazenda_id, ano, mes, cenario, categoria_id);


--
-- Name: fazendas on_fazenda_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_fazenda_created AFTER INSERT ON public.fazendas FOR EACH ROW EXECUTE FUNCTION public.auto_add_owner_as_membro();


--
-- Name: lancamentos set_lancamento_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_lancamento_audit BEFORE INSERT OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.set_lancamento_audit_fields();


--
-- Name: financeiro_contratos set_updated_at_financeiro_contratos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_financeiro_contratos BEFORE UPDATE ON public.financeiro_contratos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: preco_mercado set_updated_at_preco_mercado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_preco_mercado BEFORE UPDATE ON public.preco_mercado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: preco_mercado_ajuste set_updated_at_preco_mercado_ajuste; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_preco_mercado_ajuste BEFORE UPDATE ON public.preco_mercado_ajuste FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: preco_mercado_status set_updated_at_preco_mercado_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_preco_mercado_status BEFORE UPDATE ON public.preco_mercado_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_saldos_bancarios_v2 tr_financeiro_saldos_v2_apply_previous_extrato; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_financeiro_saldos_v2_apply_previous_extrato BEFORE INSERT OR UPDATE OF conta_bancaria_id, ano_mes, saldo_inicial, origem_saldo_inicial ON public.financeiro_saldos_bancarios_v2 FOR EACH ROW EXECUTE FUNCTION public.financeiro_saldos_v2_apply_previous_extrato();


--
-- Name: financeiro_saldos_bancarios_v2 tr_financeiro_saldos_v2_propagate_next_initial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_financeiro_saldos_v2_propagate_next_initial AFTER INSERT OR UPDATE OF saldo_final, conta_bancaria_id, ano_mes ON public.financeiro_saldos_bancarios_v2 FOR EACH ROW EXECUTE FUNCTION public.financeiro_saldos_v2_propagate_next_initial();


--
-- Name: analise_consultor trg_analise_consultor_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_analise_consultor_updated BEFORE UPDATE ON public.analise_consultor FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conciliacao_audit_log trg_audit_bloqueia_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_bloqueia_delete BEFORE DELETE ON public.conciliacao_audit_log FOR EACH ROW EXECUTE FUNCTION public.fn_bloqueia_mutacao_audit();


--
-- Name: conciliacao_audit_log trg_audit_bloqueia_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_bloqueia_update BEFORE UPDATE ON public.conciliacao_audit_log FOR EACH ROW EXECUTE FUNCTION public.fn_bloqueia_mutacao_audit();


--
-- Name: chuvas trg_audit_chuvas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_chuvas AFTER INSERT ON public.chuvas FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_chuvas();


--
-- Name: conciliacao_bancaria_itens trg_audit_conciliacao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_conciliacao AFTER INSERT OR UPDATE ON public.conciliacao_bancaria_itens FOR EACH ROW EXECUTE FUNCTION public.fn_audit_conciliacao();


--
-- Name: financeiro_lancamentos_v2 trg_audit_financeiro_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_financeiro_v2 AFTER UPDATE ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_financeiro_v2();


--
-- Name: lancamentos trg_audit_lancamentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_lancamentos AFTER INSERT OR DELETE OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_lancamentos();


--
-- Name: financeiro_contas_bancarias trg_auto_codigo_conta; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_codigo_conta BEFORE INSERT OR UPDATE ON public.financeiro_contas_bancarias FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auto_codigo_conta();


--
-- Name: lancamentos trg_auto_transferencia_entrada; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_transferencia_entrada AFTER INSERT ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.auto_create_transferencia_entrada();


--
-- Name: extrato_bancario_v2 trg_bloqueia_delete_extrato; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bloqueia_delete_extrato BEFORE DELETE ON public.extrato_bancario_v2 FOR EACH ROW EXECUTE FUNCTION public.fn_bloqueia_delete_extrato();


--
-- Name: boitel_planejamento trg_boitel_planejamento_historico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_boitel_planejamento_historico BEFORE UPDATE ON public.boitel_planejamento FOR EACH ROW EXECUTE FUNCTION public.save_boitel_planejamento_historico();


--
-- Name: financeiro_lancamentos_v2 trg_cbi_desfazer_on_cancelamento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cbi_desfazer_on_cancelamento AFTER UPDATE OF cancelado ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.fn_cbi_desfazer_on_cancelamento();


--
-- Name: saldos_iniciais trg_completar_categorias_saldo_inicial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_completar_categorias_saldo_inicial AFTER INSERT ON public.saldos_iniciais FOR EACH ROW EXECUTE FUNCTION public.fn_completar_categorias_saldo_inicial();


--
-- Name: excel_linhas_aux trg_excel_aux_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_excel_aux_updated_at BEFORE UPDATE ON public.excel_linhas_aux FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: extrato_bancario_v2 trg_extrato_v2_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_extrato_v2_updated_at BEFORE UPDATE ON public.extrato_bancario_v2 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fechamentos_executivos trg_fex_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fex_updated_at BEFORE UPDATE ON public.fechamentos_executivos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_classificacao_staging trg_fin_classif_staging_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fin_classif_staging_updated_at BEFORE UPDATE ON public.financeiro_classificacao_staging FOR EACH ROW EXECUTE FUNCTION public.fin_classif_staging_set_updated_at();


--
-- Name: financeiro_lancamentos_v2 trg_financeiro_lancamento_v2_editado_manual; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_financeiro_lancamento_v2_editado_manual BEFORE UPDATE ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.mark_financeiro_lancamento_v2_editado_manual();


--
-- Name: financeiro_lancamentos_v2 trg_financeiro_lancamento_v2_guard_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_financeiro_lancamento_v2_guard_delete BEFORE DELETE ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.guard_financeiro_lancamento_v2();


--
-- Name: financeiro_lancamentos_v2 trg_financeiro_lancamento_v2_guard_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_financeiro_lancamento_v2_guard_update BEFORE UPDATE ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.guard_financeiro_lancamento_v2();


--
-- Name: financeiro_lancamentos_v2 trg_financeiro_lancamento_v2_hash; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_financeiro_lancamento_v2_hash BEFORE INSERT OR UPDATE OF cliente_id, fazenda_id, data_competencia, data_pagamento, valor, tipo_operacao, conta_bancaria_id, lote_importacao_id ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.set_financeiro_lancamento_v2_hash();


--
-- Name: financeiro_lancamentos_v2 trg_financeiro_lancamento_v2_unique_hash; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_financeiro_lancamento_v2_unique_hash BEFORE INSERT OR UPDATE OF cliente_id, fazenda_id, data_pagamento, valor, tipo_operacao, conta_bancaria_id, cancelado, lote_importacao_id ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash();


--
-- Name: fechamento_textos trg_ft_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ft_updated_at BEFORE UPDATE ON public.fechamento_textos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conciliacao_bancaria_itens trg_guard_conciliacao_mes_fechado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_conciliacao_mes_fechado BEFORE INSERT ON public.conciliacao_bancaria_itens FOR EACH ROW WHEN ((new.desfeito_em IS NULL)) EXECUTE FUNCTION public.fn_guard_conciliacao_mes_fechado();


--
-- Name: fechamento_pastos trg_guard_fechamento_pastos_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_fechamento_pastos_snapshot BEFORE UPDATE ON public.fechamento_pastos FOR EACH ROW EXECUTE FUNCTION public.guard_fechamento_pastos_snapshot();

ALTER TABLE public.fechamento_pastos DISABLE TRIGGER trg_guard_fechamento_pastos_snapshot;


--
-- Name: lancamentos trg_guard_lancamento_mes_fechado_p1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_lancamento_mes_fechado_p1 BEFORE INSERT OR DELETE OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.guard_lancamento_mes_fechado_p1();


--
-- Name: financeiro_lancamentos_v2 trg_guard_mes_fechado_lancamentos_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_mes_fechado_lancamentos_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.guard_financeiro_mes_fechado();


--
-- Name: lancamentos trg_guard_meta_admin_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_meta_admin_only BEFORE INSERT OR DELETE OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.guard_meta_admin_only();


--
-- Name: fechamento_pasto_itens trg_guard_pasto_itens_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_pasto_itens_snapshot BEFORE UPDATE ON public.fechamento_pasto_itens FOR EACH ROW EXECUTE FUNCTION public.guard_pasto_itens_snapshot();

ALTER TABLE public.fechamento_pasto_itens DISABLE TRIGGER trg_guard_pasto_itens_snapshot;


--
-- Name: saldos_iniciais trg_guard_saldos_iniciais_mes_fechado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_saldos_iniciais_mes_fechado BEFORE INSERT OR UPDATE ON public.saldos_iniciais FOR EACH ROW EXECUTE FUNCTION public.guard_saldos_iniciais_mes_fechado();


--
-- Name: mesa_lancamento_staging trg_guard_staging_promovido_terminal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_staging_promovido_terminal BEFORE UPDATE ON public.mesa_lancamento_staging FOR EACH ROW EXECUTE FUNCTION public.guard_staging_promovido_terminal();


--
-- Name: financeiro_lancamentos_v2 trg_guard_transferencia_destino; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_transferencia_destino BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.guard_transferencia_conta_destino();


--
-- Name: valor_rebanho_fechamento trg_guard_valor_rebanho_requer_p1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_valor_rebanho_requer_p1 BEFORE UPDATE ON public.valor_rebanho_fechamento FOR EACH ROW EXECUTE FUNCTION public.guard_valor_rebanho_requer_p1_fechado();


--
-- Name: financeiro_lancamentos_v2 trg_guard_zoo_financeiro_cancelamento_realizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_zoo_financeiro_cancelamento_realizado BEFORE UPDATE OF cancelado ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.guard_zoo_financeiro_cancelamento_realizado();


--
-- Name: fechamento_pastos trg_invalidate_snapshot_on_pasto_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invalidate_snapshot_on_pasto_change AFTER UPDATE ON public.fechamento_pastos FOR EACH ROW EXECUTE FUNCTION public.invalidate_snapshot_on_pasto_change();

ALTER TABLE public.fechamento_pastos DISABLE TRIGGER trg_invalidate_snapshot_on_pasto_change;


--
-- Name: lancamentos trg_invalidate_zoot_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invalidate_zoot_cache AFTER INSERT OR DELETE OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.trg_fn_invalidate_zoot_cache();


--
-- Name: lancamentos trg_lancamento_auto_derivar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lancamento_auto_derivar BEFORE INSERT OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.fn_lancamento_auto_derivar();


--
-- Name: financeiro_lancamentos trg_mark_editado_manual; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mark_editado_manual BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.mark_editado_manual_on_update();


--
-- Name: mesa_ofx_validacao trg_mesa_ofx_validacao_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mesa_ofx_validacao_updated_at BEFORE UPDATE ON public.mesa_ofx_validacao FOR EACH ROW EXECUTE FUNCTION public.mesa_trg_updated_at();


--
-- Name: mesa_par trg_mesa_par_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mesa_par_updated_at BEFORE UPDATE ON public.mesa_par FOR EACH ROW EXECUTE FUNCTION public.mesa_trg_updated_at();


--
-- Name: mesa_sessao trg_mesa_sessao_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mesa_sessao_updated_at BEFORE UPDATE ON public.mesa_sessao FOR EACH ROW EXECUTE FUNCTION public.mesa_trg_updated_at();


--
-- Name: mesa_lancamento_staging trg_mesa_staging_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mesa_staging_updated_at BEFORE UPDATE ON public.mesa_lancamento_staging FOR EACH ROW EXECUTE FUNCTION public.mesa_trg_updated_at();


--
-- Name: financeiro_fornecedores trg_normalizar_fornecedor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalizar_fornecedor BEFORE INSERT OR UPDATE OF nome ON public.financeiro_fornecedores FOR EACH ROW EXECUTE FUNCTION public.fn_normalizar_nome_fornecedor();


--
-- Name: financeiro_fornecedores trg_normalize_fornecedor_nome; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_fornecedor_nome BEFORE INSERT ON public.financeiro_fornecedores FOR EACH ROW EXECUTE FUNCTION public.normalize_fornecedor_nome();


--
-- Name: planejamento_financeiro trg_planejamento_resolve_escopo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_planejamento_resolve_escopo BEFORE INSERT OR UPDATE OF escopo_negocio, subcentro, centro_custo, macro_custo, grupo_custo ON public.planejamento_financeiro FOR EACH ROW EXECUTE FUNCTION public.resolve_escopo_planejamento_financeiro();


--
-- Name: conciliacao_bancaria_itens trg_promover_lancamento_realizado_ao_conciliar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promover_lancamento_realizado_ao_conciliar AFTER INSERT ON public.conciliacao_bancaria_itens FOR EACH ROW WHEN ((new.desfeito_em IS NULL)) EXECUTE FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar();


--
-- Name: fechamento_pastos trg_propagar_saldo_dezembro; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_propagar_saldo_dezembro AFTER UPDATE ON public.fechamento_pastos FOR EACH ROW EXECUTE FUNCTION public.propagar_saldo_inicial_pos_dezembro();


--
-- Name: reclassificacoes trg_refresh_cache_reclassificacao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_refresh_cache_reclassificacao AFTER INSERT OR DELETE OR UPDATE ON public.reclassificacoes FOR EACH ROW EXECUTE FUNCTION public.refresh_zoot_cache_reclassificacao();

ALTER TABLE public.reclassificacoes DISABLE TRIGGER trg_refresh_cache_reclassificacao;


--
-- Name: financeiro_lancamentos_v2 trg_resolve_classificacao_plano; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_resolve_classificacao_plano BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.resolve_classificacao_from_plano();


--
-- Name: conciliacao_bancaria_itens trg_snapshot_conciliacao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_snapshot_conciliacao BEFORE INSERT ON public.conciliacao_bancaria_itens FOR EACH ROW EXECUTE FUNCTION public.fn_snapshot_conciliacao();


--
-- Name: lancamentos trg_sync_transferencia_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_transferencia_update AFTER UPDATE ON public.lancamentos FOR EACH ROW WHEN ((old.tipo = 'transferencia_saida'::text)) EXECUTE FUNCTION public.sync_transferencia_update();


--
-- Name: lancamentos trg_validate_cenario_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_cenario_status BEFORE INSERT OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.validate_cenario_status();


--
-- Name: fechamento_pasto_itens trg_validate_fechamento_pasto_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_fechamento_pasto_item BEFORE INSERT OR UPDATE ON public.fechamento_pasto_itens FOR EACH ROW EXECUTE FUNCTION public.fn_validate_fechamento_pasto_item();


--
-- Name: lancamentos trg_validate_lancamento_campos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_lancamento_campos BEFORE INSERT OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.validate_lancamento_campos_por_tipo();


--
-- Name: boitel_lotes update_boitel_lotes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_boitel_lotes_updated_at BEFORE UPDATE ON public.boitel_lotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: boitel_operacoes update_boitel_operacoes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_boitel_operacoes_updated_at BEFORE UPDATE ON public.boitel_operacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: boitel_planejamento update_boitel_planejamento_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_boitel_planejamento_updated_at BEFORE UPDATE ON public.boitel_planejamento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cfg_categoria_parametros update_cfg_categoria_parametros_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cfg_categoria_parametros_updated_at BEFORE UPDATE ON public.cfg_categoria_parametros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fazenda_cadastros update_fazenda_cadastros_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fazenda_cadastros_updated_at BEFORE UPDATE ON public.fazenda_cadastros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fechamento_executivo update_fechamento_executivo_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fechamento_executivo_updated_at BEFORE UPDATE ON public.fechamento_executivo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fechamento_pastos update_fechamento_pastos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fechamento_pastos_updated_at BEFORE UPDATE ON public.fechamento_pastos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fechamento_pastos DISABLE TRIGGER update_fechamento_pastos_updated_at;


--
-- Name: financeiro_contas_bancarias update_fin_contas_bancarias_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fin_contas_bancarias_updated_at BEFORE UPDATE ON public.financeiro_contas_bancarias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_fechamentos update_fin_fechamentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fin_fechamentos_updated_at BEFORE UPDATE ON public.financeiro_fechamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_lancamentos_v2 update_fin_lanc_v2_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fin_lanc_v2_updated_at BEFORE UPDATE ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_lancamentos update_fin_lancamentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fin_lancamentos_updated_at BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_mapa_classificacao update_fin_mapa_class_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fin_mapa_class_updated_at BEFORE UPDATE ON public.financeiro_mapa_classificacao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_plano_contas update_fin_plano_contas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fin_plano_contas_updated_at BEFORE UPDATE ON public.financeiro_plano_contas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_rateio_adm update_fin_rateio_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fin_rateio_updated_at BEFORE UPDATE ON public.financeiro_rateio_adm FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_saldos_bancarios_v2 update_fin_saldos_v2_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fin_saldos_v2_updated_at BEFORE UPDATE ON public.financeiro_saldos_bancarios_v2 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financeiro_saldos_bancarios_v2 DISABLE TRIGGER update_fin_saldos_v2_updated_at;


--
-- Name: lancamentos update_lancamentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lancamentos_updated_at BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: meta_parametros_nutricao update_meta_parametros_nutricao_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_meta_parametros_nutricao_updated_at BEFORE UPDATE ON public.meta_parametros_nutricao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: meta_projetos_investimento update_meta_projetos_investimento_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_meta_projetos_investimento_updated_at BEFORE UPDATE ON public.meta_projetos_investimento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pastos update_pastos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pastos_updated_at BEFORE UPDATE ON public.pastos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: planejamento_area_meta update_planejamento_area_meta_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_planejamento_area_meta_updated_at BEFORE UPDATE ON public.planejamento_area_meta FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: planejamento_financeiro update_planejamento_financeiro_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_planejamento_financeiro_updated_at BEFORE UPDATE ON public.planejamento_financeiro FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: valor_rebanho_realizado_validado update_valor_reb_real_validado_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_valor_reb_real_validado_updated_at BEFORE UPDATE ON public.valor_rebanho_realizado_validado FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: valor_rebanho_fechamento_itens update_valor_rebanho_fechamento_itens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_valor_rebanho_fechamento_itens_updated_at BEFORE UPDATE ON public.valor_rebanho_fechamento_itens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: valor_rebanho_meta update_valor_rebanho_meta_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_valor_rebanho_meta_updated_at BEFORE UPDATE ON public.valor_rebanho_meta FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: valor_rebanho_meta_validada update_valor_rebanho_meta_validada_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_valor_rebanho_meta_validada_updated_at BEFORE UPDATE ON public.valor_rebanho_meta_validada FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: valor_rebanho_mensal update_valor_rebanho_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_valor_rebanho_updated_at BEFORE UPDATE ON public.valor_rebanho_mensal FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_agroinblue admin_agroinblue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_agroinblue
    ADD CONSTRAINT admin_agroinblue_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chuvas chuvas_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chuvas
    ADD CONSTRAINT chuvas_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: cliente_membros cliente_membros_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_membros
    ADD CONSTRAINT cliente_membros_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: conciliacao_audit_log conciliacao_audit_log_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacao_audit_log
    ADD CONSTRAINT conciliacao_audit_log_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: conciliacao_bancaria_itens conciliacao_bancaria_itens_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacao_bancaria_itens
    ADD CONSTRAINT conciliacao_bancaria_itens_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: conciliacao_bancaria_itens conciliacao_bancaria_itens_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacao_bancaria_itens
    ADD CONSTRAINT conciliacao_bancaria_itens_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: conciliacao_bancaria_itens conciliacao_bancaria_itens_extrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacao_bancaria_itens
    ADD CONSTRAINT conciliacao_bancaria_itens_extrato_id_fkey FOREIGN KEY (extrato_id) REFERENCES public.extrato_bancario_v2(id) ON DELETE CASCADE;


--
-- Name: conciliacao_bancaria_itens conciliacao_bancaria_itens_lancamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conciliacao_bancaria_itens
    ADD CONSTRAINT conciliacao_bancaria_itens_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE CASCADE;


--
-- Name: extrato_bancario_staging extrato_bancario_staging_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_staging
    ADD CONSTRAINT extrato_bancario_staging_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: extrato_bancario_staging extrato_bancario_staging_conta_bancaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_staging
    ADD CONSTRAINT extrato_bancario_staging_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES public.financeiro_contas_bancarias(id);


--
-- Name: extrato_bancario_staging_itens extrato_bancario_staging_itens_conciliacao_final_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_staging_itens
    ADD CONSTRAINT extrato_bancario_staging_itens_conciliacao_final_id_fkey FOREIGN KEY (conciliacao_final_id) REFERENCES public.conciliacao_bancaria_itens(id);


--
-- Name: extrato_bancario_staging_itens extrato_bancario_staging_itens_extrato_final_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_staging_itens
    ADD CONSTRAINT extrato_bancario_staging_itens_extrato_final_id_fkey FOREIGN KEY (extrato_final_id) REFERENCES public.extrato_bancario_v2(id);


--
-- Name: extrato_bancario_staging_itens extrato_bancario_staging_itens_lancamento_sugerido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_staging_itens
    ADD CONSTRAINT extrato_bancario_staging_itens_lancamento_sugerido_id_fkey FOREIGN KEY (lancamento_sugerido_id) REFERENCES public.financeiro_lancamentos_v2(id);


--
-- Name: extrato_bancario_staging_itens extrato_bancario_staging_itens_staging_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_staging_itens
    ADD CONSTRAINT extrato_bancario_staging_itens_staging_id_fkey FOREIGN KEY (staging_id) REFERENCES public.extrato_bancario_staging(id) ON DELETE CASCADE;


--
-- Name: extrato_bancario_v2 extrato_bancario_v2_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_v2
    ADD CONSTRAINT extrato_bancario_v2_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: extrato_bancario_v2 extrato_bancario_v2_conta_bancaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_v2
    ADD CONSTRAINT extrato_bancario_v2_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES public.financeiro_contas_bancarias(id) ON DELETE RESTRICT;


--
-- Name: extrato_bancario_v2 extrato_bancario_v2_importacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extrato_bancario_v2
    ADD CONSTRAINT extrato_bancario_v2_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES public.financeiro_importacoes_v2(id) ON DELETE SET NULL;


--
-- Name: fazenda_membros fazenda_membros_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fazenda_membros
    ADD CONSTRAINT fazenda_membros_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: fazenda_membros fazenda_membros_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fazenda_membros
    ADD CONSTRAINT fazenda_membros_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: fazendas fazendas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fazendas
    ADD CONSTRAINT fazendas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: fazendas fazendas_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fazendas
    ADD CONSTRAINT fazendas_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fechamento_area_snapshot fechamento_area_snapshot_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_area_snapshot
    ADD CONSTRAINT fechamento_area_snapshot_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: fechamento_area_snapshot fechamento_area_snapshot_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_area_snapshot
    ADD CONSTRAINT fechamento_area_snapshot_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: fechamento_area_snapshot fechamento_area_snapshot_fechado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_area_snapshot
    ADD CONSTRAINT fechamento_area_snapshot_fechado_por_fkey FOREIGN KEY (fechado_por) REFERENCES auth.users(id);


--
-- Name: fechamento_pasto_itens fechamento_pasto_itens_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_pasto_itens
    ADD CONSTRAINT fechamento_pasto_itens_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: fechamento_pasto_itens fechamento_pasto_itens_fechamento_pasto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_pasto_itens
    ADD CONSTRAINT fechamento_pasto_itens_fechamento_pasto_id_fkey FOREIGN KEY (fechamento_id) REFERENCES public.fechamento_pastos(id) ON DELETE CASCADE;


--
-- Name: fechamento_pastos fechamento_pastos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_pastos
    ADD CONSTRAINT fechamento_pastos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: fechamento_pastos fechamento_pastos_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_pastos
    ADD CONSTRAINT fechamento_pastos_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: fechamento_pastos fechamento_pastos_pasto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamento_pastos
    ADD CONSTRAINT fechamento_pastos_pasto_id_fkey FOREIGN KEY (pasto_id) REFERENCES public.pastos(id) ON DELETE CASCADE;


--
-- Name: financeiro_classificacao_regras financeiro_classificacao_regras_plano_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_classificacao_regras
    ADD CONSTRAINT financeiro_classificacao_regras_plano_conta_id_fkey FOREIGN KEY (plano_conta_id) REFERENCES public.financeiro_plano_contas(id);


--
-- Name: financeiro_classificacao_staging financeiro_classificacao_staging_alias_id_usado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_classificacao_staging
    ADD CONSTRAINT financeiro_classificacao_staging_alias_id_usado_fkey FOREIGN KEY (alias_id_usado) REFERENCES public.financeiro_subcentro_aliases(id) ON DELETE SET NULL;


--
-- Name: financeiro_classificacao_staging financeiro_classificacao_staging_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_classificacao_staging
    ADD CONSTRAINT financeiro_classificacao_staging_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: financeiro_classificacao_staging financeiro_classificacao_staging_match_lancamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_classificacao_staging
    ADD CONSTRAINT financeiro_classificacao_staging_match_lancamento_id_fkey FOREIGN KEY (match_lancamento_id) REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE SET NULL;


--
-- Name: financeiro_fechamentos financeiro_fechamentos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_fechamentos
    ADD CONSTRAINT financeiro_fechamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: financeiro_fechamentos financeiro_fechamentos_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_fechamentos
    ADD CONSTRAINT financeiro_fechamentos_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE SET NULL;


--
-- Name: financeiro_fornecedores financeiro_fornecedores_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_fornecedores
    ADD CONSTRAINT financeiro_fornecedores_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: financeiro_lancamentos_v2 financeiro_lancamentos_v2_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos_v2
    ADD CONSTRAINT financeiro_lancamentos_v2_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: financeiro_lancamentos_v2 financeiro_lancamentos_v2_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos_v2
    ADD CONSTRAINT financeiro_lancamentos_v2_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE SET NULL;


--
-- Name: financeiro_lancamentos_v2 financeiro_lancamentos_v2_financiamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos_v2
    ADD CONSTRAINT financeiro_lancamentos_v2_financiamento_id_fkey FOREIGN KEY (financiamento_id) REFERENCES public.financiamentos(id) ON DELETE SET NULL;


--
-- Name: financeiro_lancamentos_v2 financeiro_lancamentos_v2_safra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos_v2
    ADD CONSTRAINT financeiro_lancamentos_v2_safra_id_fkey FOREIGN KEY (safra_id) REFERENCES public.financeiro_safras(id);


--
-- Name: financeiro_lancamentos_v2 financeiro_lancamentos_v2_staging_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos_v2
    ADD CONSTRAINT financeiro_lancamentos_v2_staging_id_fkey FOREIGN KEY (staging_id) REFERENCES public.mesa_lancamento_staging(staging_id) ON DELETE SET NULL;


--
-- Name: financeiro_saldos_bancarios_v2 financeiro_saldos_bancarios_v2_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_saldos_bancarios_v2
    ADD CONSTRAINT financeiro_saldos_bancarios_v2_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: financeiro_subcentro_aliases financeiro_subcentro_aliases_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_subcentro_aliases
    ADD CONSTRAINT financeiro_subcentro_aliases_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: financeiro_subcentro_aliases financeiro_subcentro_aliases_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_subcentro_aliases
    ADD CONSTRAINT financeiro_subcentro_aliases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: financeiro_subcentro_aliases financeiro_subcentro_aliases_plano_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_subcentro_aliases
    ADD CONSTRAINT financeiro_subcentro_aliases_plano_conta_id_fkey FOREIGN KEY (plano_conta_id) REFERENCES public.financeiro_plano_contas(id) ON DELETE RESTRICT;


--
-- Name: financeiro_subcentro_aliases financeiro_subcentro_aliases_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_subcentro_aliases
    ADD CONSTRAINT financeiro_subcentro_aliases_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: financeiros financeiros_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiros
    ADD CONSTRAINT financeiros_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: financiamento_parcelas financiamento_parcelas_financiamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamento_parcelas
    ADD CONSTRAINT financiamento_parcelas_financiamento_id_fkey FOREIGN KEY (financiamento_id) REFERENCES public.financiamentos(id);


--
-- Name: financiamento_parcelas financiamento_parcelas_lancamento_juros_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamento_parcelas
    ADD CONSTRAINT financiamento_parcelas_lancamento_juros_id_fkey FOREIGN KEY (lancamento_juros_id) REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE SET NULL;


--
-- Name: financiamentos financiamentos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: financiamentos financiamentos_conta_bancaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES public.financeiro_contas_bancarias(id);


--
-- Name: financiamentos financiamentos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: financiamentos financiamentos_credor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_credor_id_fkey FOREIGN KEY (credor_id) REFERENCES public.financeiro_fornecedores(id);


--
-- Name: financiamentos financiamentos_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: financiamentos financiamentos_lancamento_captacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_lancamento_captacao_id_fkey FOREIGN KEY (lancamento_captacao_id) REFERENCES public.financeiro_lancamentos_v2(id);


--
-- Name: financiamentos financiamentos_plano_conta_captacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_plano_conta_captacao_id_fkey FOREIGN KEY (plano_conta_captacao_id) REFERENCES public.financeiro_plano_contas(id) ON DELETE SET NULL;


--
-- Name: financiamentos financiamentos_plano_conta_parcela_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_plano_conta_parcela_id_fkey FOREIGN KEY (plano_conta_parcela_id) REFERENCES public.financeiro_plano_contas(id) ON DELETE SET NULL;


--
-- Name: financeiro_lancamentos_v2 fk_flv2_lote_importacao; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos_v2
    ADD CONSTRAINT fk_flv2_lote_importacao FOREIGN KEY (lote_importacao_id) REFERENCES public.financeiro_importacoes_v2(id) ON DELETE SET NULL;


--
-- Name: CONSTRAINT fk_flv2_lote_importacao ON financeiro_lancamentos_v2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT fk_flv2_lote_importacao ON public.financeiro_lancamentos_v2 IS 'Mesa Operacional v2. Vínculo estrutural para rastreabilidade de import.
ON DELETE SET NULL — lançamento sobrevive à reversão de importação até
decisão explícita do operador. Criada PR0.A.';


--
-- Name: lancamentos lancamentos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: lancamentos lancamentos_categoria_mae_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_categoria_mae_id_fkey FOREIGN KEY (categoria_mae_id) REFERENCES public.categorias(id);


--
-- Name: lancamentos lancamentos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: lancamentos lancamentos_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: lancamentos lancamentos_fornecedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.financeiro_fornecedores(id) ON DELETE RESTRICT;


--
-- Name: mesa_lancamento_staging mesa_lancamento_staging_conta_resolvida_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_lancamento_staging
    ADD CONSTRAINT mesa_lancamento_staging_conta_resolvida_id_fkey FOREIGN KEY (conta_resolvida_id) REFERENCES public.financeiro_contas_bancarias(id) ON DELETE SET NULL;


--
-- Name: mesa_lancamento_staging mesa_lancamento_staging_sessao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_lancamento_staging
    ADD CONSTRAINT mesa_lancamento_staging_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES public.mesa_sessao(id) ON DELETE CASCADE;


--
-- Name: mesa_ofx_validacao mesa_ofx_validacao_sessao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_ofx_validacao
    ADD CONSTRAINT mesa_ofx_validacao_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES public.mesa_sessao(id) ON DELETE CASCADE;


--
-- Name: mesa_par mesa_par_sessao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mesa_par
    ADD CONSTRAINT mesa_par_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES public.mesa_sessao(id) ON DELETE CASCADE;


--
-- Name: meta_aprovacoes meta_aprovacoes_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_aprovacoes
    ADD CONSTRAINT meta_aprovacoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: meta_aprovacoes meta_aprovacoes_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_aprovacoes
    ADD CONSTRAINT meta_aprovacoes_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: meta_aprovacoes meta_aprovacoes_versao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_aprovacoes
    ADD CONSTRAINT meta_aprovacoes_versao_id_fkey FOREIGN KEY (versao_id) REFERENCES public.meta_versoes(id);


--
-- Name: meta_parametros_nutricao meta_parametros_nutricao_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_parametros_nutricao
    ADD CONSTRAINT meta_parametros_nutricao_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: meta_projetos_investimento meta_projetos_investimento_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_projetos_investimento
    ADD CONSTRAINT meta_projetos_investimento_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: meta_projetos_investimento meta_projetos_investimento_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_projetos_investimento
    ADD CONSTRAINT meta_projetos_investimento_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: meta_versoes meta_versoes_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_versoes
    ADD CONSTRAINT meta_versoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: pastos pastos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pastos
    ADD CONSTRAINT pastos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: pastos pastos_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pastos
    ADD CONSTRAINT pastos_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: planejamento_area_meta planejamento_area_meta_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planejamento_area_meta
    ADD CONSTRAINT planejamento_area_meta_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: planejamento_area_meta planejamento_area_meta_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planejamento_area_meta
    ADD CONSTRAINT planejamento_area_meta_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: planejamento_financeiro planejamento_financeiro_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planejamento_financeiro
    ADD CONSTRAINT planejamento_financeiro_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: planejamento_financeiro planejamento_financeiro_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planejamento_financeiro
    ADD CONSTRAINT planejamento_financeiro_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: reclassificacoes reclassificacoes_categoria_destino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reclassificacoes
    ADD CONSTRAINT reclassificacoes_categoria_destino_id_fkey FOREIGN KEY (categoria_destino_id) REFERENCES public.categorias(id);


--
-- Name: reclassificacoes reclassificacoes_categoria_origem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reclassificacoes
    ADD CONSTRAINT reclassificacoes_categoria_origem_id_fkey FOREIGN KEY (categoria_origem_id) REFERENCES public.categorias(id);


--
-- Name: reclassificacoes reclassificacoes_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reclassificacoes
    ADD CONSTRAINT reclassificacoes_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: saldos_iniciais saldos_iniciais_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos_iniciais
    ADD CONSTRAINT saldos_iniciais_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: saldos_iniciais saldos_iniciais_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos_iniciais
    ADD CONSTRAINT saldos_iniciais_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: saldos_iniciais saldos_iniciais_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos_iniciais
    ADD CONSTRAINT saldos_iniciais_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: transferencia_ofx_pares transferencia_ofx_pares_ofx_entrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencia_ofx_pares
    ADD CONSTRAINT transferencia_ofx_pares_ofx_entrada_id_fkey FOREIGN KEY (ofx_entrada_id) REFERENCES public.extrato_bancario_v2(id);


--
-- Name: transferencia_ofx_pares transferencia_ofx_pares_ofx_saida_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transferencia_ofx_pares
    ADD CONSTRAINT transferencia_ofx_pares_ofx_saida_id_fkey FOREIGN KEY (ofx_saida_id) REFERENCES public.extrato_bancario_v2(id);


--
-- Name: valor_rebanho_fechamento valor_rebanho_fechamento_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_fechamento
    ADD CONSTRAINT valor_rebanho_fechamento_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: valor_rebanho_fechamento valor_rebanho_fechamento_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_fechamento
    ADD CONSTRAINT valor_rebanho_fechamento_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: valor_rebanho_mensal valor_rebanho_mensal_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_mensal
    ADD CONSTRAINT valor_rebanho_mensal_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: valor_rebanho_mensal valor_rebanho_mensal_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_mensal
    ADD CONSTRAINT valor_rebanho_mensal_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE;


--
-- Name: valor_rebanho_meta valor_rebanho_meta_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_meta
    ADD CONSTRAINT valor_rebanho_meta_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: valor_rebanho_meta valor_rebanho_meta_fazenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_meta
    ADD CONSTRAINT valor_rebanho_meta_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id);


--
-- Name: valor_rebanho_meta_itens valor_rebanho_meta_itens_meta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valor_rebanho_meta_itens
    ADD CONSTRAINT valor_rebanho_meta_itens_meta_id_fkey FOREIGN KEY (meta_id) REFERENCES public.valor_rebanho_meta(id) ON DELETE CASCADE;


--
-- Name: _bkp_p0h_cbi_20260630; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._bkp_p0h_cbi_20260630 ENABLE ROW LEVEL SECURITY;

--
-- Name: _bkp_p0h_extrato_20260630; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._bkp_p0h_extrato_20260630 ENABLE ROW LEVEL SECURITY;

--
-- Name: _bkp_p0h_lancto_20260630; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._bkp_p0h_lancto_20260630 ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_agroinblue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_agroinblue ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_agroinblue admin_ver_proprio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_ver_proprio ON public.admin_agroinblue FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: financeiro_subcentro_aliases alias_all_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alias_all_service_role ON public.financeiro_subcentro_aliases TO service_role USING (true) WITH CHECK (true);


--
-- Name: financeiro_subcentro_aliases alias_insert_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alias_insert_public ON public.financeiro_subcentro_aliases FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_subcentro_aliases alias_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alias_select_authenticated ON public.financeiro_subcentro_aliases FOR SELECT TO authenticated USING (true);


--
-- Name: financeiro_subcentro_aliases alias_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alias_select_public ON public.financeiro_subcentro_aliases FOR SELECT USING (true);


--
-- Name: financeiro_subcentro_aliases alias_update_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alias_update_public ON public.financeiro_subcentro_aliases FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: analise_consultor; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analise_consultor ENABLE ROW LEVEL SECURITY;

--
-- Name: analise_consultor analise_consultor_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY analise_consultor_all ON public.analise_consultor USING (true) WITH CHECK (true);


--
-- Name: planejamento_area_meta areas_meta_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_meta_delete ON public.planejamento_area_meta FOR DELETE USING (true);


--
-- Name: planejamento_area_meta areas_meta_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_meta_insert ON public.planejamento_area_meta FOR INSERT WITH CHECK (true);


--
-- Name: planejamento_area_meta areas_meta_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_meta_select ON public.planejamento_area_meta FOR SELECT USING (true);


--
-- Name: planejamento_area_meta areas_meta_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_meta_update ON public.planejamento_area_meta FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financeiro_saldos_audit audit_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_all ON public.financeiro_saldos_audit USING (true) WITH CHECK (true);


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_all ON public.audit_log USING (true) WITH CHECK (true);


--
-- Name: audit_log_movimentacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_movimentacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_movimentacoes audit_log_movimentacoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_movimentacoes_all ON public.audit_log_movimentacoes USING (true) WITH CHECK (true);


--
-- Name: bancos_referencia bancos_leitura_publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bancos_leitura_publica ON public.bancos_referencia FOR SELECT USING (true);


--
-- Name: bancos_referencia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bancos_referencia ENABLE ROW LEVEL SECURITY;

--
-- Name: boitel_adiantamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boitel_adiantamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: boitel_adiantamentos boitel_adiantamentos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boitel_adiantamentos_all ON public.boitel_adiantamentos USING (true) WITH CHECK (true);


--
-- Name: boitel_lotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boitel_lotes ENABLE ROW LEVEL SECURITY;

--
-- Name: boitel_lotes boitel_lotes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boitel_lotes_all ON public.boitel_lotes USING (true) WITH CHECK (true);


--
-- Name: boitel_operacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boitel_operacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: boitel_operacoes boitel_operacoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boitel_operacoes_all ON public.boitel_operacoes USING (true) WITH CHECK (true);


--
-- Name: boitel_planejamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boitel_planejamento ENABLE ROW LEVEL SECURITY;

--
-- Name: boitel_planejamento boitel_planejamento_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boitel_planejamento_all ON public.boitel_planejamento USING (true) WITH CHECK (true);


--
-- Name: boitel_planejamento_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boitel_planejamento_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: boitel_planejamento_historico boitel_planejamento_historico_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boitel_planejamento_historico_all ON public.boitel_planejamento_historico USING (true) WITH CHECK (true);


--
-- Name: categorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias_rebanho; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias_rebanho ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias categorias_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categorias_select_open ON public.categorias FOR SELECT USING (true);


--
-- Name: financeiro_contas_bancarias cb_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cb_delete ON public.financeiro_contas_bancarias FOR DELETE USING (true);


--
-- Name: financeiro_contas_bancarias cb_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cb_ins ON public.financeiro_contas_bancarias FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_contas_bancarias cb_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cb_sel ON public.financeiro_contas_bancarias FOR SELECT USING (true);


--
-- Name: financeiro_contas_bancarias cb_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cb_update ON public.financeiro_contas_bancarias FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: cfg_categoria_parametros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cfg_categoria_parametros ENABLE ROW LEVEL SECURITY;

--
-- Name: cfg_categoria_parametros cfg_categoria_parametros_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cfg_categoria_parametros_all ON public.cfg_categoria_parametros USING (true) WITH CHECK (true);


--
-- Name: chuvas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chuvas ENABLE ROW LEVEL SECURITY;

--
-- Name: chuvas chuvas_delete_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chuvas_delete_open ON public.chuvas FOR DELETE USING (true);


--
-- Name: chuvas chuvas_insert_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chuvas_insert_open ON public.chuvas FOR INSERT WITH CHECK (true);


--
-- Name: chuvas chuvas_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chuvas_select_open ON public.chuvas FOR SELECT USING (true);


--
-- Name: chuvas chuvas_update_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chuvas_update_open ON public.chuvas FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: cliente_membros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cliente_membros ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_membros cliente_membros_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cliente_membros_select_open ON public.cliente_membros FOR SELECT USING (true);


--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes clientes_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clientes_select_all ON public.clientes FOR SELECT USING (true);


--
-- Name: competencia_fechamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competencia_fechamento ENABLE ROW LEVEL SECURITY;

--
-- Name: competencia_fechamento competencia_fechamento_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY competencia_fechamento_all ON public.competencia_fechamento USING (true) WITH CHECK (true);


--
-- Name: conciliacao_bancaria_itens conc_itens_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conc_itens_delete ON public.conciliacao_bancaria_itens FOR DELETE USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: conciliacao_bancaria_itens conc_itens_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conc_itens_insert ON public.conciliacao_bancaria_itens FOR INSERT WITH CHECK ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: conciliacao_bancaria_itens conc_itens_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conc_itens_select ON public.conciliacao_bancaria_itens FOR SELECT USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: conciliacao_bancaria_itens conc_itens_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conc_itens_update ON public.conciliacao_bancaria_itens FOR UPDATE USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: conciliacao_bancaria_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conciliacao_bancaria_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias_rebanho cr_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cr_sel ON public.categorias_rebanho FOR SELECT USING (true);


--
-- Name: excel_linhas_aux excel_aux_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY excel_aux_delete ON public.excel_linhas_aux FOR DELETE USING (true);


--
-- Name: excel_linhas_aux excel_aux_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY excel_aux_insert ON public.excel_linhas_aux FOR INSERT WITH CHECK (true);


--
-- Name: excel_linhas_aux excel_aux_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY excel_aux_select ON public.excel_linhas_aux FOR SELECT USING (true);


--
-- Name: excel_linhas_aux excel_aux_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY excel_aux_update ON public.excel_linhas_aux FOR UPDATE USING (true);


--
-- Name: excel_linhas_aux; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.excel_linhas_aux ENABLE ROW LEVEL SECURITY;

--
-- Name: extrato_bancario_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extrato_bancario_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: extrato_bancario_v2 extrato_v2_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extrato_v2_delete ON public.extrato_bancario_v2 FOR DELETE USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: extrato_bancario_v2 extrato_v2_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extrato_v2_insert ON public.extrato_bancario_v2 FOR INSERT WITH CHECK ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: extrato_bancario_v2 extrato_v2_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extrato_v2_select ON public.extrato_bancario_v2 FOR SELECT USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: extrato_bancario_v2 extrato_v2_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY extrato_v2_update ON public.extrato_bancario_v2 FOR UPDATE USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: fazenda_cadastros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fazenda_cadastros ENABLE ROW LEVEL SECURITY;

--
-- Name: fazenda_cadastros fazenda_cadastros_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fazenda_cadastros_all ON public.fazenda_cadastros USING (true) WITH CHECK (true);


--
-- Name: fazenda_membros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fazenda_membros ENABLE ROW LEVEL SECURITY;

--
-- Name: fazenda_status_mensal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fazenda_status_mensal ENABLE ROW LEVEL SECURITY;

--
-- Name: fazenda_status_mensal fazenda_status_mensal_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fazenda_status_mensal_all ON public.fazenda_status_mensal USING (true) WITH CHECK (true);


--
-- Name: fazendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fazendas ENABLE ROW LEVEL SECURITY;

--
-- Name: fazendas fazendas_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fazendas_select_all ON public.fazendas FOR SELECT USING (true);


--
-- Name: fazendas fazendas_update_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fazendas_update_all ON public.fazendas FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financeiro_centros_custo fcc_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fcc_ins ON public.financeiro_centros_custo FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_centros_custo fcc_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fcc_sel ON public.financeiro_centros_custo FOR SELECT USING (true);


--
-- Name: financeiro_dividendos fd_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fd_sel ON public.financeiro_dividendos FOR SELECT USING (true);


--
-- Name: fechamento_execucoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamento_execucoes ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamento_execucoes fechamento_execucoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_execucoes_all ON public.fechamento_execucoes USING (true) WITH CHECK (true);


--
-- Name: fechamento_executivo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamento_executivo ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamento_executivo fechamento_executivo_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_executivo_all ON public.fechamento_executivo USING (true) WITH CHECK (true);


--
-- Name: fechamento_graficos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamento_graficos ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamento_graficos fechamento_graficos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_graficos_all ON public.fechamento_graficos USING (true) WITH CHECK (true);


--
-- Name: fechamento_indicadores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamento_indicadores ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamento_indicadores fechamento_indicadores_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_indicadores_all ON public.fechamento_indicadores USING (true) WITH CHECK (true);


--
-- Name: fechamento_pasto_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamento_pasto_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamento_pasto_itens fechamento_pasto_itens_delete_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_pasto_itens_delete_open ON public.fechamento_pasto_itens FOR DELETE USING (true);


--
-- Name: fechamento_pasto_itens fechamento_pasto_itens_insert_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_pasto_itens_insert_open ON public.fechamento_pasto_itens FOR INSERT WITH CHECK (true);


--
-- Name: fechamento_pasto_itens fechamento_pasto_itens_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_pasto_itens_select_open ON public.fechamento_pasto_itens FOR SELECT USING (true);


--
-- Name: fechamento_pasto_itens fechamento_pasto_itens_update_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_pasto_itens_update_open ON public.fechamento_pasto_itens FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: fechamento_pastos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamento_pastos ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamento_pastos fechamento_pastos_insert_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_pastos_insert_open ON public.fechamento_pastos FOR INSERT WITH CHECK (true);


--
-- Name: fechamento_pastos fechamento_pastos_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_pastos_select_open ON public.fechamento_pastos FOR SELECT USING (true);


--
-- Name: fechamento_pastos fechamento_pastos_update_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_pastos_update_open ON public.fechamento_pastos FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: fechamento_reaberturas_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamento_reaberturas_log ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamento_reaberturas_log fechamento_reaberturas_log_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_reaberturas_log_all ON public.fechamento_reaberturas_log USING (true) WITH CHECK (true);


--
-- Name: fechamento_textos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamento_textos ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamento_textos fechamento_textos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamento_textos_all ON public.fechamento_textos USING (true) WITH CHECK (true);


--
-- Name: fechamentos_executivos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamentos_executivos ENABLE ROW LEVEL SECURITY;

--
-- Name: fechamentos_executivos fechamentos_executivos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fechamentos_executivos_all ON public.fechamentos_executivos USING (true) WITH CHECK (true);


--
-- Name: financeiro_dividendos fin_dividendos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_dividendos_delete ON public.financeiro_dividendos FOR DELETE USING (true);


--
-- Name: financeiro_dividendos fin_dividendos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_dividendos_insert ON public.financeiro_dividendos FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_dividendos fin_dividendos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_dividendos_update ON public.financeiro_dividendos FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financeiro_fechamentos fin_fech_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_fech_insert ON public.financeiro_fechamentos FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_fechamentos fin_fech_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_fech_select ON public.financeiro_fechamentos FOR SELECT USING (true);


--
-- Name: financeiro_lancamentos_v2 fin_lanc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_lanc_insert ON public.financeiro_lancamentos_v2 FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_lancamentos_v2 fin_lanc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_lanc_select ON public.financeiro_lancamentos_v2 FOR SELECT USING (true);


--
-- Name: financeiro_lancamentos_v2 fin_lanc_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_lanc_update ON public.financeiro_lancamentos_v2 FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financeiro_saldos_bancarios_v2 fin_saldos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_saldos_insert ON public.financeiro_saldos_bancarios_v2 FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_saldos_bancarios_v2 fin_saldos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_saldos_select ON public.financeiro_saldos_bancarios_v2 FOR SELECT USING (true);


--
-- Name: financeiro_saldos_bancarios_v2 fin_saldos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fin_saldos_update ON public.financeiro_saldos_bancarios_v2 FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financeiro_centros_custo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_centros_custo ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_classificacao_regras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_classificacao_regras ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_classificacao_regras financeiro_classificacao_regras_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_classificacao_regras_all ON public.financeiro_classificacao_regras USING (true) WITH CHECK (true);


--
-- Name: financeiro_classificacao_staging; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_classificacao_staging ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_classificacao_staging financeiro_classificacao_staging_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_classificacao_staging_all ON public.financeiro_classificacao_staging USING (true) WITH CHECK (true);


--
-- Name: financeiro_conciliacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_conciliacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_conciliacoes financeiro_conciliacoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_conciliacoes_all ON public.financeiro_conciliacoes USING (true) WITH CHECK (true);


--
-- Name: financeiro_contas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_contas ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_contas financeiro_contas_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_contas_all ON public.financeiro_contas USING (true) WITH CHECK (true);


--
-- Name: financeiro_contas_bancarias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_contas_bancarias ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_contratos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_contratos ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_contratos financeiro_contratos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_contratos_all ON public.financeiro_contratos USING (true) WITH CHECK (true);


--
-- Name: financeiro_dividendos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_dividendos ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_duplicidade_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_duplicidade_log ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_duplicidade_log financeiro_duplicidade_log_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_duplicidade_log_all ON public.financeiro_duplicidade_log USING (true) WITH CHECK (true);


--
-- Name: financeiro_extrato_bancario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_extrato_bancario ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_extrato_bancario financeiro_extrato_bancario_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_extrato_bancario_all ON public.financeiro_extrato_bancario USING (true) WITH CHECK (true);


--
-- Name: financeiro_fechamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_fechamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_fornecedores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_fornecedores ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_fornecedores financeiro_fornecedores_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_fornecedores_select_open ON public.financeiro_fornecedores FOR SELECT USING (true);


--
-- Name: financeiro_importacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_importacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_importacoes financeiro_importacoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_importacoes_all ON public.financeiro_importacoes USING (true) WITH CHECK (true);


--
-- Name: financeiro_importacoes_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_importacoes_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_lancamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_lancamentos financeiro_lancamentos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_lancamentos_all ON public.financeiro_lancamentos USING (true) WITH CHECK (true);


--
-- Name: financeiro_lancamentos_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_lancamentos_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_mapa_classificacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_mapa_classificacao ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_mapa_classificacao financeiro_mapa_classificacao_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_mapa_classificacao_all ON public.financeiro_mapa_classificacao USING (true) WITH CHECK (true);


--
-- Name: financeiro_plano_contas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_plano_contas ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_rateio_adm; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_rateio_adm ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_rateio_adm financeiro_rateio_adm_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_rateio_adm_all ON public.financeiro_rateio_adm USING (true) WITH CHECK (true);


--
-- Name: financeiro_rateio_adm_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_rateio_adm_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_rateio_adm_itens financeiro_rateio_adm_itens_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_rateio_adm_itens_all ON public.financeiro_rateio_adm_itens USING (true) WITH CHECK (true);


--
-- Name: financeiro_resumo_caixa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_resumo_caixa ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_resumo_caixa financeiro_resumo_caixa_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_resumo_caixa_all ON public.financeiro_resumo_caixa USING (true) WITH CHECK (true);


--
-- Name: financeiro_safras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_safras ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_saldos_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_saldos_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_saldos_bancarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_saldos_bancarios ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_saldos_bancarios financeiro_saldos_bancarios_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiro_saldos_bancarios_select_open ON public.financeiro_saldos_bancarios FOR SELECT USING (true);


--
-- Name: financeiro_saldos_bancarios_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_saldos_bancarios_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_subcentro_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_subcentro_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiros ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiros financeiros_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financeiros_select_open ON public.financeiros FOR SELECT USING (true);


--
-- Name: financiamento_destinacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financiamento_destinacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: financiamento_destinacoes financiamento_destinacoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financiamento_destinacoes_all ON public.financiamento_destinacoes USING (true) WITH CHECK (true);


--
-- Name: financiamento_parcelas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financiamento_parcelas ENABLE ROW LEVEL SECURITY;

--
-- Name: financiamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financiamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: financiamentos financiamentos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY financiamentos_all ON public.financiamentos USING (true) WITH CHECK (true);


--
-- Name: financeiro_importacoes_v2 fiv_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiv_ins ON public.financeiro_importacoes_v2 FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_importacoes_v2 fiv_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiv_sel ON public.financeiro_importacoes_v2 FOR SELECT USING (true);


--
-- Name: financeiro_importacoes_v2 fiv_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fiv_upd ON public.financeiro_importacoes_v2 FOR UPDATE USING (true);


--
-- Name: financeiro_fornecedores forn_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forn_delete ON public.financeiro_fornecedores FOR DELETE USING (true);


--
-- Name: financeiro_fornecedores forn_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forn_insert ON public.financeiro_fornecedores FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_fornecedores forn_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forn_select ON public.financeiro_fornecedores FOR SELECT USING (true);


--
-- Name: financeiro_fornecedores forn_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forn_update ON public.financeiro_fornecedores FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financeiro_fornecedores fornecedores_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fornecedores_all ON public.financeiro_fornecedores USING (true) WITH CHECK (true);


--
-- Name: financeiro_plano_contas fpc_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fpc_ins ON public.financeiro_plano_contas FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_plano_contas fpc_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fpc_sel ON public.financeiro_plano_contas FOR SELECT USING (true);


--
-- Name: financeiro_plano_contas fpc_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fpc_upd ON public.financeiro_plano_contas FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financeiro_safras fs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fs_delete ON public.financeiro_safras FOR DELETE USING (true);


--
-- Name: financeiro_safras fs_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fs_ins ON public.financeiro_safras FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_safras fs_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fs_sel ON public.financeiro_safras FOR SELECT USING (true);


--
-- Name: financeiro_safras fs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fs_update ON public.financeiro_safras FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: lancamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: lancamentos lancamentos_insert_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lancamentos_insert_open ON public.lancamentos FOR INSERT WITH CHECK (true);


--
-- Name: lancamentos lancamentos_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lancamentos_select_open ON public.lancamentos FOR SELECT USING (true);


--
-- Name: lancamentos lancamentos_update_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lancamentos_update_open ON public.lancamentos FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: fazenda_membros membros_ver_proprio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY membros_ver_proprio ON public.fazenda_membros FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: mesa_lancamento_staging; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mesa_lancamento_staging ENABLE ROW LEVEL SECURITY;

--
-- Name: mesa_lancamento_staging mesa_lancamento_staging_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mesa_lancamento_staging_all ON public.mesa_lancamento_staging USING (true) WITH CHECK (true);


--
-- Name: mesa_ofx_validacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mesa_ofx_validacao ENABLE ROW LEVEL SECURITY;

--
-- Name: mesa_ofx_validacao mesa_ofx_validacao_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mesa_ofx_validacao_all ON public.mesa_ofx_validacao USING (true) WITH CHECK (true);


--
-- Name: mesa_par; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mesa_par ENABLE ROW LEVEL SECURITY;

--
-- Name: mesa_par mesa_par_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mesa_par_all ON public.mesa_par USING (true) WITH CHECK (true);


--
-- Name: mesa_sessao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mesa_sessao ENABLE ROW LEVEL SECURITY;

--
-- Name: mesa_sessao mesa_sessao_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mesa_sessao_all ON public.mesa_sessao USING (true) WITH CHECK (true);


--
-- Name: meta_aprovacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_aprovacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_aprovacoes meta_aprovacoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_aprovacoes_all ON public.meta_aprovacoes USING (true) WITH CHECK (true);


--
-- Name: meta_gmd_mensal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_gmd_mensal ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_parametros_nutricao meta_nutricao_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_nutricao_all ON public.meta_parametros_nutricao USING (true) WITH CHECK (true);


--
-- Name: meta_parametros_nutricao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_parametros_nutricao ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_preco_mercado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_preco_mercado ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_preco_mercado meta_preco_mercado_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_preco_mercado_all ON public.meta_preco_mercado USING (true) WITH CHECK (true);


--
-- Name: meta_preco_mercado_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_preco_mercado_status ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_preco_mercado_status meta_preco_mercado_status_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_preco_mercado_status_all ON public.meta_preco_mercado_status USING (true) WITH CHECK (true);


--
-- Name: meta_projetos_investimento meta_projetos_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_projetos_all ON public.meta_projetos_investimento USING (true) WITH CHECK (true);


--
-- Name: meta_projetos_investimento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_projetos_investimento ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_valor_rebanho_precos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_valor_rebanho_precos ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_valor_rebanho_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_valor_rebanho_status ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_versoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_versoes ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_versoes meta_versoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_versoes_all ON public.meta_versoes USING (true) WITH CHECK (true);


--
-- Name: meta_gmd_mensal mgmd_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mgmd_ins ON public.meta_gmd_mensal FOR INSERT WITH CHECK (true);


--
-- Name: meta_gmd_mensal mgmd_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mgmd_sel ON public.meta_gmd_mensal FOR SELECT USING (true);


--
-- Name: meta_gmd_mensal mgmd_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mgmd_upd ON public.meta_gmd_mensal FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: meta_valor_rebanho_precos mvr_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mvr_all ON public.meta_valor_rebanho_precos USING (true) WITH CHECK (true);


--
-- Name: meta_valor_rebanho_status mvrs_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mvrs_all ON public.meta_valor_rebanho_status USING (true) WITH CHECK (true);


--
-- Name: financiamento_parcelas parcelas_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parcelas_all ON public.financiamento_parcelas USING (true) WITH CHECK (true);


--
-- Name: pasto_condicoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pasto_condicoes ENABLE ROW LEVEL SECURITY;

--
-- Name: pasto_condicoes pasto_condicoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pasto_condicoes_all ON public.pasto_condicoes USING (true) WITH CHECK (true);


--
-- Name: pasto_geometrias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pasto_geometrias ENABLE ROW LEVEL SECURITY;

--
-- Name: pasto_geometrias pasto_geometrias_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pasto_geometrias_all ON public.pasto_geometrias USING (true) WITH CHECK (true);


--
-- Name: pasto_movimentacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pasto_movimentacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: pasto_movimentacoes pasto_movimentacoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pasto_movimentacoes_all ON public.pasto_movimentacoes USING (true) WITH CHECK (true);


--
-- Name: pastos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pastos ENABLE ROW LEVEL SECURITY;

--
-- Name: pastos pastos_insert_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pastos_insert_open ON public.pastos FOR INSERT WITH CHECK (true);


--
-- Name: pastos pastos_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pastos_select_open ON public.pastos FOR SELECT USING (true);


--
-- Name: pastos pastos_update_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pastos_update_open ON public.pastos FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: planejamento_area_meta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planejamento_area_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: planejamento_financeiro planejamento_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY planejamento_delete ON public.planejamento_financeiro FOR DELETE USING (true);


--
-- Name: planejamento_financeiro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planejamento_financeiro ENABLE ROW LEVEL SECURITY;

--
-- Name: planejamento_financeiro planejamento_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY planejamento_insert ON public.planejamento_financeiro FOR INSERT WITH CHECK (true);


--
-- Name: planejamento_financeiro planejamento_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY planejamento_select ON public.planejamento_financeiro FOR SELECT USING (true);


--
-- Name: planejamento_financeiro planejamento_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY planejamento_update ON public.planejamento_financeiro FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financeiro_plano_contas plano_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plano_insert ON public.financeiro_plano_contas FOR INSERT WITH CHECK (true);


--
-- Name: financeiro_plano_contas plano_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plano_select ON public.financeiro_plano_contas FOR SELECT USING (true);


--
-- Name: preco_mercado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preco_mercado ENABLE ROW LEVEL SECURITY;

--
-- Name: preco_mercado_ajuste; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preco_mercado_ajuste ENABLE ROW LEVEL SECURITY;

--
-- Name: preco_mercado_ajuste preco_mercado_ajuste_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preco_mercado_ajuste_select_open ON public.preco_mercado_ajuste FOR SELECT USING (true);


--
-- Name: preco_mercado preco_mercado_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preco_mercado_all ON public.preco_mercado USING (true) WITH CHECK (true);


--
-- Name: preco_mercado_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preco_mercado_status ENABLE ROW LEVEL SECURITY;

--
-- Name: preco_mercado_status preco_mercado_status_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY preco_mercado_status_all ON public.preco_mercado_status USING (true) WITH CHECK (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_all ON public.profiles USING (true) WITH CHECK (true);


--
-- Name: reclassificacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reclassificacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: reclassificacoes reclassificacoes_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reclassificacoes_select_open ON public.reclassificacoes FOR SELECT USING (true);


--
-- Name: saldos_iniciais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saldos_iniciais ENABLE ROW LEVEL SECURITY;

--
-- Name: saldos_iniciais saldos_iniciais_insert_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saldos_iniciais_insert_open ON public.saldos_iniciais FOR INSERT WITH CHECK (true);


--
-- Name: saldos_iniciais saldos_iniciais_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saldos_iniciais_select_open ON public.saldos_iniciais FOR SELECT USING (true);


--
-- Name: saldos_iniciais saldos_iniciais_update_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saldos_iniciais_update_open ON public.saldos_iniciais FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: transferencia_ofx_pares tofx_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tofx_delete ON public.transferencia_ofx_pares FOR DELETE USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: transferencia_ofx_pares tofx_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tofx_insert ON public.transferencia_ofx_pares FOR INSERT WITH CHECK ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: transferencia_ofx_pares tofx_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tofx_select ON public.transferencia_ofx_pares FOR SELECT USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: transferencia_ofx_pares tofx_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tofx_update ON public.transferencia_ofx_pares FOR UPDATE USING ((public.is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT cm.cliente_id
   FROM public.cliente_membros cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.ativo = true))))));


--
-- Name: transferencia_ofx_pares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transferencia_ofx_pares ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_membros usuario_ve_seus_clientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuario_ve_seus_clientes ON public.cliente_membros FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: valor_rebanho_fechamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valor_rebanho_fechamento ENABLE ROW LEVEL SECURITY;

--
-- Name: valor_rebanho_fechamento_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valor_rebanho_fechamento_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: valor_rebanho_fechamento valor_rebanho_fechamento_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY valor_rebanho_fechamento_select_open ON public.valor_rebanho_fechamento FOR SELECT USING (true);


--
-- Name: valor_rebanho_mensal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valor_rebanho_mensal ENABLE ROW LEVEL SECURITY;

--
-- Name: valor_rebanho_mensal valor_rebanho_mensal_select_open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY valor_rebanho_mensal_select_open ON public.valor_rebanho_mensal FOR SELECT USING (true);


--
-- Name: valor_rebanho_meta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valor_rebanho_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: valor_rebanho_meta_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valor_rebanho_meta_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: valor_rebanho_meta_validada; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valor_rebanho_meta_validada ENABLE ROW LEVEL SECURITY;

--
-- Name: valor_rebanho_realizado_validado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.valor_rebanho_realizado_validado ENABLE ROW LEVEL SECURITY;

--
-- Name: valor_rebanho_fechamento vrf_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrf_del ON public.valor_rebanho_fechamento FOR DELETE USING (true);


--
-- Name: valor_rebanho_fechamento vrf_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrf_ins ON public.valor_rebanho_fechamento FOR INSERT WITH CHECK (true);


--
-- Name: valor_rebanho_fechamento vrf_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrf_sel ON public.valor_rebanho_fechamento FOR SELECT USING (true);


--
-- Name: valor_rebanho_fechamento vrf_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrf_upd ON public.valor_rebanho_fechamento FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: valor_rebanho_fechamento_itens vrfi_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrfi_del ON public.valor_rebanho_fechamento_itens FOR DELETE USING (true);


--
-- Name: valor_rebanho_fechamento_itens vrfi_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrfi_ins ON public.valor_rebanho_fechamento_itens FOR INSERT WITH CHECK (true);


--
-- Name: valor_rebanho_fechamento_itens vrfi_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrfi_sel ON public.valor_rebanho_fechamento_itens FOR SELECT USING (true);


--
-- Name: valor_rebanho_fechamento_itens vrfi_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrfi_upd ON public.valor_rebanho_fechamento_itens FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: valor_rebanho_meta vrm_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrm_all ON public.valor_rebanho_meta USING (true) WITH CHECK (true);


--
-- Name: valor_rebanho_mensal vrm_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrm_del ON public.valor_rebanho_mensal FOR DELETE USING (true);


--
-- Name: valor_rebanho_mensal vrm_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrm_ins ON public.valor_rebanho_mensal FOR INSERT WITH CHECK (true);


--
-- Name: valor_rebanho_mensal vrm_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrm_sel ON public.valor_rebanho_mensal FOR SELECT USING (true);


--
-- Name: valor_rebanho_mensal vrm_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrm_upd ON public.valor_rebanho_mensal FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: valor_rebanho_meta_itens vrmi_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrmi_all ON public.valor_rebanho_meta_itens USING (true) WITH CHECK (true);


--
-- Name: valor_rebanho_meta_validada vrmv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrmv_all ON public.valor_rebanho_meta_validada USING (true) WITH CHECK (true);


--
-- Name: valor_rebanho_realizado_validado vrv_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vrv_all ON public.valor_rebanho_realizado_validado USING (true) WITH CHECK (true);


--
-- Name: zoot_importacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zoot_importacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: zoot_importacoes zoot_importacoes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY zoot_importacoes_all ON public.zoot_importacoes USING (true) WITH CHECK (true);


--
-- Name: zoot_importacoes_staging; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zoot_importacoes_staging ENABLE ROW LEVEL SECURITY;

--
-- Name: zoot_importacoes_staging zoot_importacoes_staging_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY zoot_importacoes_staging_all ON public.zoot_importacoes_staging USING (true) WITH CHECK (true);


--
-- Name: zoot_mensal_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zoot_mensal_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: zoot_mensal_cache zoot_mensal_cache_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY zoot_mensal_cache_all ON public.zoot_mensal_cache USING (true) WITH CHECK (true);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION audit_modulo_from_lancamento_tipo(p_tipo text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_modulo_from_lancamento_tipo(p_tipo text) TO anon;
GRANT ALL ON FUNCTION public.audit_modulo_from_lancamento_tipo(p_tipo text) TO authenticated;
GRANT ALL ON FUNCTION public.audit_modulo_from_lancamento_tipo(p_tipo text) TO service_role;


--
-- Name: TABLE lancamentos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lancamentos TO anon;
GRANT ALL ON TABLE public.lancamentos TO authenticated;
GRANT ALL ON TABLE public.lancamentos TO service_role;


--
-- Name: FUNCTION audit_resumo_lancamento(r public.lancamentos); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_resumo_lancamento(r public.lancamentos) TO anon;
GRANT ALL ON FUNCTION public.audit_resumo_lancamento(r public.lancamentos) TO authenticated;
GRANT ALL ON FUNCTION public.audit_resumo_lancamento(r public.lancamentos) TO service_role;


--
-- Name: FUNCTION audit_trigger_chuvas(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_trigger_chuvas() TO anon;
GRANT ALL ON FUNCTION public.audit_trigger_chuvas() TO authenticated;
GRANT ALL ON FUNCTION public.audit_trigger_chuvas() TO service_role;


--
-- Name: FUNCTION audit_trigger_financeiro_v2(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_trigger_financeiro_v2() TO anon;
GRANT ALL ON FUNCTION public.audit_trigger_financeiro_v2() TO authenticated;
GRANT ALL ON FUNCTION public.audit_trigger_financeiro_v2() TO service_role;


--
-- Name: FUNCTION audit_trigger_lancamentos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_trigger_lancamentos() TO anon;
GRANT ALL ON FUNCTION public.audit_trigger_lancamentos() TO authenticated;
GRANT ALL ON FUNCTION public.audit_trigger_lancamentos() TO service_role;


--
-- Name: FUNCTION auditar_integridade_classificacao(_cliente_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auditar_integridade_classificacao(_cliente_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.auditar_integridade_classificacao(_cliente_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.auditar_integridade_classificacao(_cliente_id uuid) TO service_role;


--
-- Name: FUNCTION auto_add_owner_as_membro(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_add_owner_as_membro() TO anon;
GRANT ALL ON FUNCTION public.auto_add_owner_as_membro() TO authenticated;
GRANT ALL ON FUNCTION public.auto_add_owner_as_membro() TO service_role;


--
-- Name: FUNCTION auto_create_transferencia_entrada(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_create_transferencia_entrada() TO anon;
GRANT ALL ON FUNCTION public.auto_create_transferencia_entrada() TO authenticated;
GRANT ALL ON FUNCTION public.auto_create_transferencia_entrada() TO service_role;


--
-- Name: FUNCTION buscar_duplicados_retroativo(_cliente_id uuid, _ano_mes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.buscar_duplicados_retroativo(_cliente_id uuid, _ano_mes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.buscar_duplicados_retroativo(_cliente_id uuid, _ano_mes text) TO authenticated;
GRANT ALL ON FUNCTION public.buscar_duplicados_retroativo(_cliente_id uuid, _ano_mes text) TO service_role;


--
-- Name: FUNCTION can_close_valor_rebanho(_fazenda_id uuid, _ano_mes text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_close_valor_rebanho(_fazenda_id uuid, _ano_mes text) TO anon;
GRANT ALL ON FUNCTION public.can_close_valor_rebanho(_fazenda_id uuid, _ano_mes text) TO authenticated;
GRANT ALL ON FUNCTION public.can_close_valor_rebanho(_fazenda_id uuid, _ano_mes text) TO service_role;


--
-- Name: FUNCTION can_manage_financeiro_importacao_v2(_cliente_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_manage_financeiro_importacao_v2(_cliente_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_manage_financeiro_importacao_v2(_cliente_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_financeiro_importacao_v2(_cliente_id uuid) TO service_role;


--
-- Name: FUNCTION can_manage_financeiro_lancamento_v2(_cliente_id uuid, _origem_lancamento text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_manage_financeiro_lancamento_v2(_cliente_id uuid, _origem_lancamento text) TO anon;
GRANT ALL ON FUNCTION public.can_manage_financeiro_lancamento_v2(_cliente_id uuid, _origem_lancamento text) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_financeiro_lancamento_v2(_cliente_id uuid, _origem_lancamento text) TO service_role;


--
-- Name: FUNCTION cancel_financeiro_importacao_v2(_importacao_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_financeiro_importacao_v2(_importacao_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_financeiro_importacao_v2(_importacao_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_financeiro_importacao_v2(_importacao_id uuid) TO service_role;


--
-- Name: FUNCTION cancel_zoot_importacao(_importacao_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_zoot_importacao(_importacao_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_zoot_importacao(_importacao_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_zoot_importacao(_importacao_id uuid) TO service_role;


--
-- Name: FUNCTION classificar_nivel_duplicidade(_new_data_pagamento date, _new_valor numeric, _new_tipo_operacao text, _new_conta_bancaria_id uuid, _new_favorecido_id uuid, _new_descricao text, _new_numero_documento text, _new_subcentro text, _existing_data_pagamento date, _existing_valor numeric, _existing_tipo_operacao text, _existing_conta_bancaria_id uuid, _existing_favorecido_id uuid, _existing_descricao text, _existing_numero_documento text, _existing_subcentro text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.classificar_nivel_duplicidade(_new_data_pagamento date, _new_valor numeric, _new_tipo_operacao text, _new_conta_bancaria_id uuid, _new_favorecido_id uuid, _new_descricao text, _new_numero_documento text, _new_subcentro text, _existing_data_pagamento date, _existing_valor numeric, _existing_tipo_operacao text, _existing_conta_bancaria_id uuid, _existing_favorecido_id uuid, _existing_descricao text, _existing_numero_documento text, _existing_subcentro text) TO anon;
GRANT ALL ON FUNCTION public.classificar_nivel_duplicidade(_new_data_pagamento date, _new_valor numeric, _new_tipo_operacao text, _new_conta_bancaria_id uuid, _new_favorecido_id uuid, _new_descricao text, _new_numero_documento text, _new_subcentro text, _existing_data_pagamento date, _existing_valor numeric, _existing_tipo_operacao text, _existing_conta_bancaria_id uuid, _existing_favorecido_id uuid, _existing_descricao text, _existing_numero_documento text, _existing_subcentro text) TO authenticated;
GRANT ALL ON FUNCTION public.classificar_nivel_duplicidade(_new_data_pagamento date, _new_valor numeric, _new_tipo_operacao text, _new_conta_bancaria_id uuid, _new_favorecido_id uuid, _new_descricao text, _new_numero_documento text, _new_subcentro text, _existing_data_pagamento date, _existing_valor numeric, _existing_tipo_operacao text, _existing_conta_bancaria_id uuid, _existing_favorecido_id uuid, _existing_descricao text, _existing_numero_documento text, _existing_subcentro text) TO service_role;


--
-- Name: FUNCTION compute_financeiro_lancamento_v2_hash(_cliente_id uuid, _fazenda_id uuid, _data_competencia date, _data_pagamento date, _valor numeric, _tipo_operacao text, _conta_bancaria_id uuid, _descricao text, _favorecido_id uuid, _documento text, _numero_documento text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.compute_financeiro_lancamento_v2_hash(_cliente_id uuid, _fazenda_id uuid, _data_competencia date, _data_pagamento date, _valor numeric, _tipo_operacao text, _conta_bancaria_id uuid, _descricao text, _favorecido_id uuid, _documento text, _numero_documento text) TO anon;
GRANT ALL ON FUNCTION public.compute_financeiro_lancamento_v2_hash(_cliente_id uuid, _fazenda_id uuid, _data_competencia date, _data_pagamento date, _valor numeric, _tipo_operacao text, _conta_bancaria_id uuid, _descricao text, _favorecido_id uuid, _documento text, _numero_documento text) TO authenticated;
GRANT ALL ON FUNCTION public.compute_financeiro_lancamento_v2_hash(_cliente_id uuid, _fazenda_id uuid, _data_competencia date, _data_pagamento date, _valor numeric, _tipo_operacao text, _conta_bancaria_id uuid, _descricao text, _favorecido_id uuid, _documento text, _numero_documento text) TO service_role;


--
-- Name: FUNCTION enforce_financeiro_lancamento_v2_unique_hash(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash() TO anon;
GRANT ALL ON FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash() TO service_role;


--
-- Name: FUNCTION exec_query(sql text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.exec_query(sql text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.exec_query(sql text) TO service_role;


--
-- Name: FUNCTION exec_sql(sql text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.exec_sql(sql text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.exec_sql(sql text) TO service_role;


--
-- Name: FUNCTION fin_classif_staging_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fin_classif_staging_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.fin_classif_staging_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.fin_classif_staging_set_updated_at() TO service_role;


--
-- Name: FUNCTION financeiro_saldos_v2_apply_previous_extrato(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.financeiro_saldos_v2_apply_previous_extrato() TO anon;
GRANT ALL ON FUNCTION public.financeiro_saldos_v2_apply_previous_extrato() TO authenticated;
GRANT ALL ON FUNCTION public.financeiro_saldos_v2_apply_previous_extrato() TO service_role;


--
-- Name: FUNCTION financeiro_saldos_v2_propagate_next_initial(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.financeiro_saldos_v2_propagate_next_initial() TO anon;
GRANT ALL ON FUNCTION public.financeiro_saldos_v2_propagate_next_initial() TO authenticated;
GRANT ALL ON FUNCTION public.financeiro_saldos_v2_propagate_next_initial() TO service_role;


--
-- Name: FUNCTION fn_audit_conciliacao(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_audit_conciliacao() TO anon;
GRANT ALL ON FUNCTION public.fn_audit_conciliacao() TO authenticated;
GRANT ALL ON FUNCTION public.fn_audit_conciliacao() TO service_role;


--
-- Name: FUNCTION fn_auditoria_consistencia_zoot(p_fazenda_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_auditoria_consistencia_zoot(p_fazenda_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_auditoria_consistencia_zoot(p_fazenda_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_auditoria_consistencia_zoot(p_fazenda_id uuid) TO service_role;


--
-- Name: FUNCTION fn_bloqueia_delete_extrato(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_bloqueia_delete_extrato() TO anon;
GRANT ALL ON FUNCTION public.fn_bloqueia_delete_extrato() TO authenticated;
GRANT ALL ON FUNCTION public.fn_bloqueia_delete_extrato() TO service_role;


--
-- Name: FUNCTION fn_bloqueia_mutacao_audit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_bloqueia_mutacao_audit() TO anon;
GRANT ALL ON FUNCTION public.fn_bloqueia_mutacao_audit() TO authenticated;
GRANT ALL ON FUNCTION public.fn_bloqueia_mutacao_audit() TO service_role;


--
-- Name: FUNCTION fn_cancelar_lancamento_auditoria(p_lancamento_id uuid, p_motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_cancelar_lancamento_auditoria(p_lancamento_id uuid, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_cancelar_lancamento_auditoria(p_lancamento_id uuid, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_cancelar_lancamento_auditoria(p_lancamento_id uuid, p_motivo text) TO service_role;


--
-- Name: FUNCTION fn_cbi_desfazer_on_cancelamento(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_cbi_desfazer_on_cancelamento() TO anon;
GRANT ALL ON FUNCTION public.fn_cbi_desfazer_on_cancelamento() TO authenticated;
GRANT ALL ON FUNCTION public.fn_cbi_desfazer_on_cancelamento() TO service_role;


--
-- Name: FUNCTION fn_classificacao_apply(p_sessao_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_classificacao_apply(p_sessao_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_classificacao_apply(p_sessao_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_apply(p_sessao_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean) TO service_role;


--
-- Name: FUNCTION fn_classificacao_candidatos_ambiguo(p_staging_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_ambiguo(p_staging_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_ambiguo(p_staging_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_ambiguo(p_staging_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_candidatos_grupo(p_staging_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_grupo(p_staging_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_grupo(p_staging_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_grupo(p_staging_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_candidatos_proximos(p_staging_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_proximos(p_staging_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_proximos(p_staging_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_candidatos_proximos(p_staging_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_composicao_sugerida(p_lancamento_id uuid, p_sessao_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_composicao_sugerida(p_lancamento_id uuid, p_sessao_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_composicao_sugerida(p_lancamento_id uuid, p_sessao_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_composicao_sugerida(p_lancamento_id uuid, p_sessao_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_desfazer_ambiguo(p_staging_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_ambiguo(p_staging_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_ambiguo(p_staging_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_ambiguo(p_staging_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_desfazer_grupo(p_staging_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_grupo(p_staging_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_grupo(p_staging_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_grupo(p_staging_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_desfazer_proximos(p_staging_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_proximos(p_staging_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_proximos(p_staging_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_desfazer_proximos(p_staging_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb) TO service_role;


--
-- Name: FUNCTION fn_classificacao_meta(p_motor jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_meta(p_motor jsonb) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_meta(p_motor jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_meta(p_motor jsonb) TO service_role;


--
-- Name: FUNCTION fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) TO service_role;


--
-- Name: FUNCTION fn_classificacao_reresolver_match_sessao(p_sessao_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_reresolver_match_sessao(p_sessao_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_reresolver_match_sessao(p_sessao_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_reresolver_match_sessao(p_sessao_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_reresolver_sessao(p_sessao_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_reresolver_sessao(p_sessao_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_reresolver_sessao(p_sessao_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_reresolver_sessao(p_sessao_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_resetar_proposto(p_staging_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_resetar_proposto(p_staging_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_resetar_proposto(p_staging_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_resetar_proposto(p_staging_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_resolver_ambiguo(p_staging_id uuid, p_lanc_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_resolver_ambiguo(p_staging_id uuid, p_lanc_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_ambiguo(p_staging_id uuid, p_lanc_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_ambiguo(p_staging_id uuid, p_lanc_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_resolver_conta(p_cliente_id uuid, p_texto text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_resolver_conta(p_cliente_id uuid, p_texto text) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_conta(p_cliente_id uuid, p_texto text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_conta(p_cliente_id uuid, p_texto text) TO service_role;


--
-- Name: FUNCTION fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb, p_skip_guard boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb, p_skip_guard boolean) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb, p_skip_guard boolean) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb, p_skip_guard boolean) TO service_role;


--
-- Name: FUNCTION fn_classificacao_resolver_grupo(p_staging_id uuid, p_lancamento_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_resolver_grupo(p_staging_id uuid, p_lancamento_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_grupo(p_staging_id uuid, p_lancamento_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_grupo(p_staging_id uuid, p_lancamento_ids uuid[]) TO service_role;


--
-- Name: FUNCTION fn_classificacao_resolver_proximos(p_staging_id uuid, p_lancamento_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_resolver_proximos(p_staging_id uuid, p_lancamento_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_proximos(p_staging_id uuid, p_lancamento_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_proximos(p_staging_id uuid, p_lancamento_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_resolver_subcentro(p_cliente_id uuid, p_subcentro text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_resolver_subcentro(p_cliente_id uuid, p_subcentro text) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_subcentro(p_cliente_id uuid, p_subcentro text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_resolver_subcentro(p_cliente_id uuid, p_subcentro text) TO service_role;


--
-- Name: FUNCTION fn_classificacao_reverter_row(p_staging_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_reverter_row(p_staging_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_reverter_row(p_staging_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_reverter_row(p_staging_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_sistema_nao_explicado(p_sessao_id uuid, p_conta_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_classificacao_sistema_nao_explicado(p_sessao_id uuid, p_conta_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_classificacao_sistema_nao_explicado(p_sessao_id uuid, p_conta_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_sistema_nao_explicado(p_sessao_id uuid, p_conta_id uuid) TO service_role;


--
-- Name: FUNCTION fn_classificacao_split_substituir(p_lancamento_id uuid, p_sessao_id uuid, p_staging_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_classificacao_split_substituir(p_lancamento_id uuid, p_sessao_id uuid, p_staging_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_classificacao_split_substituir(p_lancamento_id uuid, p_sessao_id uuid, p_staging_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.fn_classificacao_split_substituir(p_lancamento_id uuid, p_sessao_id uuid, p_staging_ids uuid[]) TO service_role;


--
-- Name: FUNCTION fn_completar_categorias_saldo_inicial(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_completar_categorias_saldo_inicial() TO anon;
GRANT ALL ON FUNCTION public.fn_completar_categorias_saldo_inicial() TO authenticated;
GRANT ALL ON FUNCTION public.fn_completar_categorias_saldo_inicial() TO service_role;


--
-- Name: FUNCTION fn_conciliacao_soberana(p_cliente uuid, p_conta uuid, p_mes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_conciliacao_soberana(p_cliente uuid, p_conta uuid, p_mes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_conciliacao_soberana(p_cliente uuid, p_conta uuid, p_mes text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_conciliacao_soberana(p_cliente uuid, p_conta uuid, p_mes text) TO service_role;


--
-- Name: FUNCTION fn_criar_lancamento_de_extrato(p_extrato_id uuid, p_fazenda_id uuid, p_subcentro text, p_descricao text, p_observacao text, p_favorecido_id uuid, p_numero_documento text, p_data_competencia date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_criar_lancamento_de_extrato(p_extrato_id uuid, p_fazenda_id uuid, p_subcentro text, p_descricao text, p_observacao text, p_favorecido_id uuid, p_numero_documento text, p_data_competencia date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_criar_lancamento_de_extrato(p_extrato_id uuid, p_fazenda_id uuid, p_subcentro text, p_descricao text, p_observacao text, p_favorecido_id uuid, p_numero_documento text, p_data_competencia date) TO authenticated;
GRANT ALL ON FUNCTION public.fn_criar_lancamento_de_extrato(p_extrato_id uuid, p_fazenda_id uuid, p_subcentro text, p_descricao text, p_observacao text, p_favorecido_id uuid, p_numero_documento text, p_data_competencia date) TO service_role;


--
-- Name: FUNCTION fn_desfazer_vinculo_extrato(p_extrato_id uuid, p_motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_desfazer_vinculo_extrato(p_extrato_id uuid, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_desfazer_vinculo_extrato(p_extrato_id uuid, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_desfazer_vinculo_extrato(p_extrato_id uuid, p_motivo text) TO service_role;


--
-- Name: FUNCTION fn_diag_fechamento_sessao(p_sessao_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_diag_fechamento_sessao(p_sessao_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_diag_fechamento_sessao(p_sessao_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_diag_fechamento_sessao(p_sessao_id uuid) TO service_role;


--
-- Name: FUNCTION fn_endividamento_mensal(p_cliente_id uuid, p_ano integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_endividamento_mensal(p_cliente_id uuid, p_ano integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_endividamento_mensal(p_cliente_id uuid, p_ano integer) TO authenticated;
GRANT ALL ON FUNCTION public.fn_endividamento_mensal(p_cliente_id uuid, p_ano integer) TO service_role;


--
-- Name: FUNCTION fn_expirar_stagings_antigos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_expirar_stagings_antigos() TO anon;
GRANT ALL ON FUNCTION public.fn_expirar_stagings_antigos() TO authenticated;
GRANT ALL ON FUNCTION public.fn_expirar_stagings_antigos() TO service_role;


--
-- Name: FUNCTION fn_extrato_chave_doc(p_doc text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_extrato_chave_doc(p_doc text) TO anon;
GRANT ALL ON FUNCTION public.fn_extrato_chave_doc(p_doc text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_extrato_chave_doc(p_doc text) TO service_role;


--
-- Name: FUNCTION fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text) TO service_role;


--
-- Name: FUNCTION fn_gerar_codigo_conta(p_cliente_id uuid, p_tipo_conta text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_gerar_codigo_conta(p_cliente_id uuid, p_tipo_conta text) TO anon;
GRANT ALL ON FUNCTION public.fn_gerar_codigo_conta(p_cliente_id uuid, p_tipo_conta text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_gerar_codigo_conta(p_cliente_id uuid, p_tipo_conta text) TO service_role;


--
-- Name: FUNCTION fn_get_mesa_v2_mode(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_get_mesa_v2_mode() TO anon;
GRANT ALL ON FUNCTION public.fn_get_mesa_v2_mode() TO authenticated;
GRANT ALL ON FUNCTION public.fn_get_mesa_v2_mode() TO service_role;


--
-- Name: FUNCTION fn_guard_conciliacao_mes_fechado(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_guard_conciliacao_mes_fechado() TO anon;
GRANT ALL ON FUNCTION public.fn_guard_conciliacao_mes_fechado() TO authenticated;
GRANT ALL ON FUNCTION public.fn_guard_conciliacao_mes_fechado() TO service_role;


--
-- Name: FUNCTION fn_invalidar_origem_extrato(p_extrato_id uuid, p_motivo text, p_decisoes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_invalidar_origem_extrato(p_extrato_id uuid, p_motivo text, p_decisoes jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_invalidar_origem_extrato(p_extrato_id uuid, p_motivo text, p_decisoes jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fn_invalidar_origem_extrato(p_extrato_id uuid, p_motivo text, p_decisoes jsonb) TO service_role;


--
-- Name: FUNCTION fn_lancamento_auto_derivar(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_lancamento_auto_derivar() TO anon;
GRANT ALL ON FUNCTION public.fn_lancamento_auto_derivar() TO authenticated;
GRANT ALL ON FUNCTION public.fn_lancamento_auto_derivar() TO service_role;


--
-- Name: FUNCTION fn_marcar_extrato_transferencia(p_extrato_id uuid, p_conta_contraparte uuid, p_motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_marcar_extrato_transferencia(p_extrato_id uuid, p_conta_contraparte uuid, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_marcar_extrato_transferencia(p_extrato_id uuid, p_conta_contraparte uuid, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_marcar_extrato_transferencia(p_extrato_id uuid, p_conta_contraparte uuid, p_motivo text) TO service_role;


--
-- Name: FUNCTION fn_normalizar_nome_fornecedor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_normalizar_nome_fornecedor() TO anon;
GRANT ALL ON FUNCTION public.fn_normalizar_nome_fornecedor() TO authenticated;
GRANT ALL ON FUNCTION public.fn_normalizar_nome_fornecedor() TO service_role;


--
-- Name: FUNCTION fn_promover_lancamento_realizado_ao_conciliar(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() TO anon;
GRANT ALL ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() TO authenticated;
GRANT ALL ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() TO service_role;


--
-- Name: FUNCTION fn_promover_staging(p_sessao_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_promover_staging(p_sessao_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_promover_staging(p_sessao_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_promover_staging(p_sessao_id uuid) TO service_role;


--
-- Name: FUNCTION fn_propagar_saldo_dezembro(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_propagar_saldo_dezembro() TO anon;
GRANT ALL ON FUNCTION public.fn_propagar_saldo_dezembro() TO authenticated;
GRANT ALL ON FUNCTION public.fn_propagar_saldo_dezembro() TO service_role;


--
-- Name: FUNCTION fn_reativar_vinculo_extrato(p_extrato_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_reativar_vinculo_extrato(p_extrato_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_reativar_vinculo_extrato(p_extrato_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_reativar_vinculo_extrato(p_extrato_id uuid) TO service_role;


--
-- Name: FUNCTION fn_reconciliar_financiamento(p_financiamento_id uuid, p_dry_run boolean, p_recalcula_vt boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_reconciliar_financiamento(p_financiamento_id uuid, p_dry_run boolean, p_recalcula_vt boolean) TO anon;
GRANT ALL ON FUNCTION public.fn_reconciliar_financiamento(p_financiamento_id uuid, p_dry_run boolean, p_recalcula_vt boolean) TO authenticated;
GRANT ALL ON FUNCTION public.fn_reconciliar_financiamento(p_financiamento_id uuid, p_dry_run boolean, p_recalcula_vt boolean) TO service_role;


--
-- Name: FUNCTION fn_reconciliar_parcela_financiamento(p_parcela_id uuid, p_dry_run boolean, p_recalcula_vt boolean, p_conta_bancaria_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_reconciliar_parcela_financiamento(p_parcela_id uuid, p_dry_run boolean, p_recalcula_vt boolean, p_conta_bancaria_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_reconciliar_parcela_financiamento(p_parcela_id uuid, p_dry_run boolean, p_recalcula_vt boolean, p_conta_bancaria_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_reconciliar_parcela_financiamento(p_parcela_id uuid, p_dry_run boolean, p_recalcula_vt boolean, p_conta_bancaria_id uuid) TO service_role;


--
-- Name: FUNCTION fn_reconciliar_todos_financiamentos(p_cliente_id uuid, p_dry_run boolean, p_recalcula_vt boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_reconciliar_todos_financiamentos(p_cliente_id uuid, p_dry_run boolean, p_recalcula_vt boolean) TO anon;
GRANT ALL ON FUNCTION public.fn_reconciliar_todos_financiamentos(p_cliente_id uuid, p_dry_run boolean, p_recalcula_vt boolean) TO authenticated;
GRANT ALL ON FUNCTION public.fn_reconciliar_todos_financiamentos(p_cliente_id uuid, p_dry_run boolean, p_recalcula_vt boolean) TO service_role;


--
-- Name: FUNCTION fn_reverter_desconsideracao_extrato(p_extrato_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_reverter_desconsideracao_extrato(p_extrato_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_reverter_desconsideracao_extrato(p_extrato_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_reverter_desconsideracao_extrato(p_extrato_id uuid) TO service_role;


--
-- Name: FUNCTION fn_saldo_inicial_pasto(p_fazenda_id uuid, p_ano integer, p_mes integer, p_categoria_codigo text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_saldo_inicial_pasto(p_fazenda_id uuid, p_ano integer, p_mes integer, p_categoria_codigo text) TO anon;
GRANT ALL ON FUNCTION public.fn_saldo_inicial_pasto(p_fazenda_id uuid, p_ano integer, p_mes integer, p_categoria_codigo text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_saldo_inicial_pasto(p_fazenda_id uuid, p_ano integer, p_mes integer, p_categoria_codigo text) TO service_role;


--
-- Name: FUNCTION fn_snapshot_conciliacao(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_snapshot_conciliacao() TO anon;
GRANT ALL ON FUNCTION public.fn_snapshot_conciliacao() TO authenticated;
GRANT ALL ON FUNCTION public.fn_snapshot_conciliacao() TO service_role;


--
-- Name: FUNCTION fn_transferir_vinculo_extrato(p_extrato_origem uuid, p_extrato_destino uuid, p_lancamento_id uuid, p_valor_aplicado numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_transferir_vinculo_extrato(p_extrato_origem uuid, p_extrato_destino uuid, p_lancamento_id uuid, p_valor_aplicado numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_transferir_vinculo_extrato(p_extrato_origem uuid, p_extrato_destino uuid, p_lancamento_id uuid, p_valor_aplicado numeric) TO authenticated;
GRANT ALL ON FUNCTION public.fn_transferir_vinculo_extrato(p_extrato_origem uuid, p_extrato_destino uuid, p_lancamento_id uuid, p_valor_aplicado numeric) TO service_role;


--
-- Name: FUNCTION fn_validate_fechamento_pasto_item(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_validate_fechamento_pasto_item() TO anon;
GRANT ALL ON FUNCTION public.fn_validate_fechamento_pasto_item() TO authenticated;
GRANT ALL ON FUNCTION public.fn_validate_fechamento_pasto_item() TO service_role;


--
-- Name: FUNCTION fn_vincular_extrato_lancamento(p_extrato_id uuid, p_lancamento_id uuid, p_valor_aplicado numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_vincular_extrato_lancamento(p_extrato_id uuid, p_lancamento_id uuid, p_valor_aplicado numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_vincular_extrato_lancamento(p_extrato_id uuid, p_lancamento_id uuid, p_valor_aplicado numeric) TO authenticated;
GRANT ALL ON FUNCTION public.fn_vincular_extrato_lancamento(p_extrato_id uuid, p_lancamento_id uuid, p_valor_aplicado numeric) TO service_role;


--
-- Name: FUNCTION fn_ws_candidatos_financeiros(p_extrato_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_ws_candidatos_financeiros(p_extrato_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_ws_candidatos_financeiros(p_extrato_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_ws_candidatos_financeiros(p_extrato_id uuid) TO service_role;


--
-- Name: FUNCTION fn_ws_conciliacao(p_tipo text, p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_ws_conciliacao(p_tipo text, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_ws_conciliacao(p_tipo text, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_ws_conciliacao(p_tipo text, p_id uuid) TO service_role;


--
-- Name: FUNCTION fn_zoot_cache_ensure(p_cliente_id uuid, p_ano integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_zoot_cache_ensure(p_cliente_id uuid, p_ano integer) TO anon;
GRANT ALL ON FUNCTION public.fn_zoot_cache_ensure(p_cliente_id uuid, p_ano integer) TO authenticated;
GRANT ALL ON FUNCTION public.fn_zoot_cache_ensure(p_cliente_id uuid, p_ano integer) TO service_role;


--
-- Name: FUNCTION fn_zoot_cache_has_gap(p_cliente_id uuid, p_ano integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_zoot_cache_has_gap(p_cliente_id uuid, p_ano integer) TO anon;
GRANT ALL ON FUNCTION public.fn_zoot_cache_has_gap(p_cliente_id uuid, p_ano integer) TO authenticated;
GRANT ALL ON FUNCTION public.fn_zoot_cache_has_gap(p_cliente_id uuid, p_ano integer) TO service_role;


--
-- Name: FUNCTION fn_zoot_cache_rebuild(p_cliente_id uuid, p_ano integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_zoot_cache_rebuild(p_cliente_id uuid, p_ano integer) TO anon;
GRANT ALL ON FUNCTION public.fn_zoot_cache_rebuild(p_cliente_id uuid, p_ano integer) TO authenticated;
GRANT ALL ON FUNCTION public.fn_zoot_cache_rebuild(p_cliente_id uuid, p_ano integer) TO service_role;


--
-- Name: FUNCTION fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text) TO anon;
GRANT ALL ON FUNCTION public.fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text) TO authenticated;
GRANT ALL ON FUNCTION public.fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text) TO service_role;


--
-- Name: FUNCTION gerar_snapshot_area(p_fazenda_id uuid, p_ano_mes date, p_fechado_por uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gerar_snapshot_area(p_fazenda_id uuid, p_ano_mes date, p_fechado_por uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.gerar_snapshot_area(p_fazenda_id uuid, p_ano_mes date, p_fechado_por uuid) TO authenticated;
GRANT ALL ON FUNCTION public.gerar_snapshot_area(p_fazenda_id uuid, p_ano_mes date, p_fechado_por uuid) TO service_role;


--
-- Name: FUNCTION get_anos_financeiro_v2(p_cliente_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_anos_financeiro_v2(p_cliente_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_anos_financeiro_v2(p_cliente_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_anos_financeiro_v2(p_cliente_id uuid) TO service_role;


--
-- Name: FUNCTION get_anos_lancamentos(p_cliente_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_anos_lancamentos(p_cliente_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_anos_lancamentos(p_cliente_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_anos_lancamentos(p_cliente_id uuid) TO service_role;


--
-- Name: FUNCTION get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text) TO authenticated;
GRANT ALL ON FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text) TO service_role;


--
-- Name: FUNCTION get_user_cliente_id(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_cliente_id(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_cliente_id(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_cliente_id(_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_cliente_ids(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_cliente_ids(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_cliente_ids(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_cliente_ids(_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_perfil(_user_id uuid, _cliente_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_perfil(_user_id uuid, _cliente_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_perfil(_user_id uuid, _cliente_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_perfil(_user_id uuid, _cliente_id uuid) TO service_role;


--
-- Name: FUNCTION guard_fechamento_pastos_snapshot(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_fechamento_pastos_snapshot() TO anon;
GRANT ALL ON FUNCTION public.guard_fechamento_pastos_snapshot() TO authenticated;
GRANT ALL ON FUNCTION public.guard_fechamento_pastos_snapshot() TO service_role;


--
-- Name: FUNCTION guard_financeiro_lancamento_v2(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_financeiro_lancamento_v2() TO anon;
GRANT ALL ON FUNCTION public.guard_financeiro_lancamento_v2() TO authenticated;
GRANT ALL ON FUNCTION public.guard_financeiro_lancamento_v2() TO service_role;


--
-- Name: FUNCTION guard_financeiro_mes_fechado(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_financeiro_mes_fechado() TO anon;
GRANT ALL ON FUNCTION public.guard_financeiro_mes_fechado() TO authenticated;
GRANT ALL ON FUNCTION public.guard_financeiro_mes_fechado() TO service_role;


--
-- Name: FUNCTION guard_lancamento_mes_fechado_p1(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_lancamento_mes_fechado_p1() TO anon;
GRANT ALL ON FUNCTION public.guard_lancamento_mes_fechado_p1() TO authenticated;
GRANT ALL ON FUNCTION public.guard_lancamento_mes_fechado_p1() TO service_role;


--
-- Name: FUNCTION guard_meta_admin_only(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_meta_admin_only() TO anon;
GRANT ALL ON FUNCTION public.guard_meta_admin_only() TO authenticated;
GRANT ALL ON FUNCTION public.guard_meta_admin_only() TO service_role;


--
-- Name: FUNCTION guard_pasto_itens_snapshot(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_pasto_itens_snapshot() TO anon;
GRANT ALL ON FUNCTION public.guard_pasto_itens_snapshot() TO authenticated;
GRANT ALL ON FUNCTION public.guard_pasto_itens_snapshot() TO service_role;


--
-- Name: FUNCTION guard_saldos_iniciais_mes_fechado(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_saldos_iniciais_mes_fechado() TO anon;
GRANT ALL ON FUNCTION public.guard_saldos_iniciais_mes_fechado() TO authenticated;
GRANT ALL ON FUNCTION public.guard_saldos_iniciais_mes_fechado() TO service_role;


--
-- Name: FUNCTION guard_staging_promovido_terminal(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_staging_promovido_terminal() TO anon;
GRANT ALL ON FUNCTION public.guard_staging_promovido_terminal() TO authenticated;
GRANT ALL ON FUNCTION public.guard_staging_promovido_terminal() TO service_role;


--
-- Name: FUNCTION guard_transferencia_conta_destino(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_transferencia_conta_destino() TO anon;
GRANT ALL ON FUNCTION public.guard_transferencia_conta_destino() TO authenticated;
GRANT ALL ON FUNCTION public.guard_transferencia_conta_destino() TO service_role;


--
-- Name: FUNCTION guard_valor_rebanho_requer_p1_fechado(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_valor_rebanho_requer_p1_fechado() TO anon;
GRANT ALL ON FUNCTION public.guard_valor_rebanho_requer_p1_fechado() TO authenticated;
GRANT ALL ON FUNCTION public.guard_valor_rebanho_requer_p1_fechado() TO service_role;


--
-- Name: FUNCTION guard_zoo_financeiro_cancelamento_realizado(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_zoo_financeiro_cancelamento_realizado() TO anon;
GRANT ALL ON FUNCTION public.guard_zoo_financeiro_cancelamento_realizado() TO authenticated;
GRANT ALL ON FUNCTION public.guard_zoo_financeiro_cancelamento_realizado() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION invalidate_snapshot_on_pasto_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.invalidate_snapshot_on_pasto_change() TO anon;
GRANT ALL ON FUNCTION public.invalidate_snapshot_on_pasto_change() TO authenticated;
GRANT ALL ON FUNCTION public.invalidate_snapshot_on_pasto_change() TO service_role;


--
-- Name: FUNCTION is_admin_agroinblue(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin_agroinblue(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin_agroinblue(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin_agroinblue(_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_cliente_member(_user_id uuid, _cliente_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_cliente_member(_user_id uuid, _cliente_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_cliente_member(_user_id uuid, _cliente_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_cliente_member(_user_id uuid, _cliente_id uuid) TO service_role;


--
-- Name: FUNCTION is_fazenda_member(_user_id uuid, _fazenda_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_fazenda_member(_user_id uuid, _fazenda_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_fazenda_member(_user_id uuid, _fazenda_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_fazenda_member(_user_id uuid, _fazenda_id uuid) TO service_role;


--
-- Name: FUNCTION mark_editado_manual_on_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_editado_manual_on_update() TO anon;
GRANT ALL ON FUNCTION public.mark_editado_manual_on_update() TO authenticated;
GRANT ALL ON FUNCTION public.mark_editado_manual_on_update() TO service_role;


--
-- Name: FUNCTION mark_financeiro_lancamento_v2_editado_manual(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_financeiro_lancamento_v2_editado_manual() TO anon;
GRANT ALL ON FUNCTION public.mark_financeiro_lancamento_v2_editado_manual() TO authenticated;
GRANT ALL ON FUNCTION public.mark_financeiro_lancamento_v2_editado_manual() TO service_role;


--
-- Name: FUNCTION mesa_trg_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mesa_trg_updated_at() TO anon;
GRANT ALL ON FUNCTION public.mesa_trg_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.mesa_trg_updated_at() TO service_role;


--
-- Name: FUNCTION normalize_fornecedor_nome(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_fornecedor_nome() TO anon;
GRANT ALL ON FUNCTION public.normalize_fornecedor_nome() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_fornecedor_nome() TO service_role;


--
-- Name: FUNCTION propagar_saldo_inicial_pos_dezembro(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.propagar_saldo_inicial_pos_dezembro() TO anon;
GRANT ALL ON FUNCTION public.propagar_saldo_inicial_pos_dezembro() TO authenticated;
GRANT ALL ON FUNCTION public.propagar_saldo_inicial_pos_dezembro() TO service_role;


--
-- Name: FUNCTION reabrir_pilar_fechamento(_fazenda_id uuid, _ano_mes text, _pilar text, _motivo text, _usuario_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reabrir_pilar_fechamento(_fazenda_id uuid, _ano_mes text, _pilar text, _motivo text, _usuario_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reabrir_pilar_fechamento(_fazenda_id uuid, _ano_mes text, _pilar text, _motivo text, _usuario_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reabrir_pilar_fechamento(_fazenda_id uuid, _ano_mes text, _pilar text, _motivo text, _usuario_id uuid) TO service_role;


--
-- Name: FUNCTION refresh_zoot_cache(p_fazenda_id uuid, p_ano integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer) TO authenticated;
GRANT ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer) TO service_role;


--
-- Name: FUNCTION refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer) TO authenticated;
GRANT ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_mes integer) TO service_role;


--
-- Name: FUNCTION refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text) TO authenticated;
GRANT ALL ON FUNCTION public.refresh_zoot_cache(p_fazenda_id uuid, p_ano integer, p_cenario text) TO service_role;


--
-- Name: FUNCTION refresh_zoot_cache_reclassificacao(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_zoot_cache_reclassificacao() TO anon;
GRANT ALL ON FUNCTION public.refresh_zoot_cache_reclassificacao() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_zoot_cache_reclassificacao() TO service_role;


--
-- Name: FUNCTION resolve_classificacao_from_plano(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_classificacao_from_plano() TO anon;
GRANT ALL ON FUNCTION public.resolve_classificacao_from_plano() TO authenticated;
GRANT ALL ON FUNCTION public.resolve_classificacao_from_plano() TO service_role;


--
-- Name: FUNCTION resolve_escopo_planejamento_financeiro(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_escopo_planejamento_financeiro() TO anon;
GRANT ALL ON FUNCTION public.resolve_escopo_planejamento_financeiro() TO authenticated;
GRANT ALL ON FUNCTION public.resolve_escopo_planejamento_financeiro() TO service_role;


--
-- Name: FUNCTION resolve_transfer_destination_fazenda(_origem_fazenda_id uuid, _destino_nome text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_transfer_destination_fazenda(_origem_fazenda_id uuid, _destino_nome text) TO anon;
GRANT ALL ON FUNCTION public.resolve_transfer_destination_fazenda(_origem_fazenda_id uuid, _destino_nome text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_transfer_destination_fazenda(_origem_fazenda_id uuid, _destino_nome text) TO service_role;


--
-- Name: FUNCTION save_boitel_planejamento_historico(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_boitel_planejamento_historico() TO anon;
GRANT ALL ON FUNCTION public.save_boitel_planejamento_historico() TO authenticated;
GRANT ALL ON FUNCTION public.save_boitel_planejamento_historico() TO service_role;


--
-- Name: FUNCTION set_financeiro_lancamento_v2_hash(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_financeiro_lancamento_v2_hash() TO anon;
GRANT ALL ON FUNCTION public.set_financeiro_lancamento_v2_hash() TO authenticated;
GRANT ALL ON FUNCTION public.set_financeiro_lancamento_v2_hash() TO service_role;


--
-- Name: FUNCTION set_lancamento_audit_fields(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_lancamento_audit_fields() TO anon;
GRANT ALL ON FUNCTION public.set_lancamento_audit_fields() TO authenticated;
GRANT ALL ON FUNCTION public.set_lancamento_audit_fields() TO service_role;


--
-- Name: FUNCTION shares_fazenda(_viewer_id uuid, _target_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.shares_fazenda(_viewer_id uuid, _target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.shares_fazenda(_viewer_id uuid, _target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.shares_fazenda(_viewer_id uuid, _target_user_id uuid) TO service_role;


--
-- Name: FUNCTION sync_transferencia_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_transferencia_update() TO anon;
GRANT ALL ON FUNCTION public.sync_transferencia_update() TO authenticated;
GRANT ALL ON FUNCTION public.sync_transferencia_update() TO service_role;


--
-- Name: FUNCTION trg_fn_auto_codigo_conta(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_fn_auto_codigo_conta() TO anon;
GRANT ALL ON FUNCTION public.trg_fn_auto_codigo_conta() TO authenticated;
GRANT ALL ON FUNCTION public.trg_fn_auto_codigo_conta() TO service_role;


--
-- Name: FUNCTION trg_fn_guard_lancamento_mes_fechado_p1(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_fn_guard_lancamento_mes_fechado_p1() TO anon;
GRANT ALL ON FUNCTION public.trg_fn_guard_lancamento_mes_fechado_p1() TO authenticated;
GRANT ALL ON FUNCTION public.trg_fn_guard_lancamento_mes_fechado_p1() TO service_role;


--
-- Name: FUNCTION trg_fn_invalidate_zoot_cache(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_fn_invalidate_zoot_cache() TO anon;
GRANT ALL ON FUNCTION public.trg_fn_invalidate_zoot_cache() TO authenticated;
GRANT ALL ON FUNCTION public.trg_fn_invalidate_zoot_cache() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION validate_cenario_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_cenario_status() TO anon;
GRANT ALL ON FUNCTION public.validate_cenario_status() TO authenticated;
GRANT ALL ON FUNCTION public.validate_cenario_status() TO service_role;


--
-- Name: FUNCTION validate_lancamento_campos_por_tipo(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_lancamento_campos_por_tipo() TO anon;
GRANT ALL ON FUNCTION public.validate_lancamento_campos_por_tipo() TO authenticated;
GRANT ALL ON FUNCTION public.validate_lancamento_campos_por_tipo() TO service_role;


--
-- Name: TABLE _backup_rebanho_auto_escopo_null_20260515; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._backup_rebanho_auto_escopo_null_20260515 TO anon;
GRANT ALL ON TABLE public._backup_rebanho_auto_escopo_null_20260515 TO authenticated;
GRANT ALL ON TABLE public._backup_rebanho_auto_escopo_null_20260515 TO service_role;


--
-- Name: TABLE _backup_venda_amendoim_escopo_20260515; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._backup_venda_amendoim_escopo_20260515 TO anon;
GRANT ALL ON TABLE public._backup_venda_amendoim_escopo_20260515 TO authenticated;
GRANT ALL ON TABLE public._backup_venda_amendoim_escopo_20260515 TO service_role;


--
-- Name: TABLE _bkp_p0h_cbi_20260630; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._bkp_p0h_cbi_20260630 TO anon;
GRANT ALL ON TABLE public._bkp_p0h_cbi_20260630 TO authenticated;
GRANT ALL ON TABLE public._bkp_p0h_cbi_20260630 TO service_role;


--
-- Name: TABLE _bkp_p0h_extrato_20260630; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._bkp_p0h_extrato_20260630 TO anon;
GRANT ALL ON TABLE public._bkp_p0h_extrato_20260630 TO authenticated;
GRANT ALL ON TABLE public._bkp_p0h_extrato_20260630 TO service_role;


--
-- Name: TABLE _bkp_p0h_lancto_20260630; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._bkp_p0h_lancto_20260630 TO anon;
GRANT ALL ON TABLE public._bkp_p0h_lancto_20260630 TO authenticated;
GRANT ALL ON TABLE public._bkp_p0h_lancto_20260630 TO service_role;


--
-- Name: TABLE admin_agroinblue; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_agroinblue TO anon;
GRANT ALL ON TABLE public.admin_agroinblue TO authenticated;
GRANT ALL ON TABLE public.admin_agroinblue TO service_role;


--
-- Name: TABLE analise_consultor; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.analise_consultor TO anon;
GRANT ALL ON TABLE public.analise_consultor TO authenticated;
GRANT ALL ON TABLE public.analise_consultor TO service_role;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_log TO anon;
GRANT ALL ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


--
-- Name: TABLE audit_log_movimentacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_log_movimentacoes TO anon;
GRANT ALL ON TABLE public.audit_log_movimentacoes TO authenticated;
GRANT ALL ON TABLE public.audit_log_movimentacoes TO service_role;


--
-- Name: TABLE backup_lanc_transferencia_entrada_2020_nj_20260514; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.backup_lanc_transferencia_entrada_2020_nj_20260514 TO anon;
GRANT ALL ON TABLE public.backup_lanc_transferencia_entrada_2020_nj_20260514 TO authenticated;
GRANT ALL ON TABLE public.backup_lanc_transferencia_entrada_2020_nj_20260514 TO service_role;


--
-- Name: TABLE bancos_referencia; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bancos_referencia TO anon;
GRANT ALL ON TABLE public.bancos_referencia TO authenticated;
GRANT ALL ON TABLE public.bancos_referencia TO service_role;


--
-- Name: TABLE boitel_adiantamentos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boitel_adiantamentos TO anon;
GRANT ALL ON TABLE public.boitel_adiantamentos TO authenticated;
GRANT ALL ON TABLE public.boitel_adiantamentos TO service_role;


--
-- Name: TABLE boitel_lotes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boitel_lotes TO anon;
GRANT ALL ON TABLE public.boitel_lotes TO authenticated;
GRANT ALL ON TABLE public.boitel_lotes TO service_role;


--
-- Name: TABLE boitel_operacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boitel_operacoes TO anon;
GRANT ALL ON TABLE public.boitel_operacoes TO authenticated;
GRANT ALL ON TABLE public.boitel_operacoes TO service_role;


--
-- Name: TABLE boitel_planejamento; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boitel_planejamento TO anon;
GRANT ALL ON TABLE public.boitel_planejamento TO authenticated;
GRANT ALL ON TABLE public.boitel_planejamento TO service_role;


--
-- Name: TABLE boitel_planejamento_historico; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boitel_planejamento_historico TO anon;
GRANT ALL ON TABLE public.boitel_planejamento_historico TO authenticated;
GRANT ALL ON TABLE public.boitel_planejamento_historico TO service_role;


--
-- Name: TABLE categorias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categorias TO anon;
GRANT ALL ON TABLE public.categorias TO authenticated;
GRANT ALL ON TABLE public.categorias TO service_role;


--
-- Name: TABLE categorias_rebanho; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categorias_rebanho TO anon;
GRANT ALL ON TABLE public.categorias_rebanho TO authenticated;
GRANT ALL ON TABLE public.categorias_rebanho TO service_role;


--
-- Name: TABLE cfg_categoria_parametros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cfg_categoria_parametros TO anon;
GRANT ALL ON TABLE public.cfg_categoria_parametros TO authenticated;
GRANT ALL ON TABLE public.cfg_categoria_parametros TO service_role;


--
-- Name: TABLE chuvas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chuvas TO anon;
GRANT ALL ON TABLE public.chuvas TO authenticated;
GRANT ALL ON TABLE public.chuvas TO service_role;


--
-- Name: TABLE chuvas_backup_20260516; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chuvas_backup_20260516 TO anon;
GRANT ALL ON TABLE public.chuvas_backup_20260516 TO authenticated;
GRANT ALL ON TABLE public.chuvas_backup_20260516 TO service_role;


--
-- Name: TABLE cliente_membros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cliente_membros TO anon;
GRANT ALL ON TABLE public.cliente_membros TO authenticated;
GRANT ALL ON TABLE public.cliente_membros TO service_role;


--
-- Name: TABLE clientes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clientes TO anon;
GRANT ALL ON TABLE public.clientes TO authenticated;
GRANT ALL ON TABLE public.clientes TO service_role;


--
-- Name: TABLE competencia_fechamento; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.competencia_fechamento TO anon;
GRANT ALL ON TABLE public.competencia_fechamento TO authenticated;
GRANT ALL ON TABLE public.competencia_fechamento TO service_role;


--
-- Name: TABLE conciliacao_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conciliacao_audit_log TO anon;
GRANT ALL ON TABLE public.conciliacao_audit_log TO authenticated;
GRANT ALL ON TABLE public.conciliacao_audit_log TO service_role;


--
-- Name: TABLE conciliacao_bancaria_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conciliacao_bancaria_itens TO anon;
GRANT ALL ON TABLE public.conciliacao_bancaria_itens TO authenticated;
GRANT ALL ON TABLE public.conciliacao_bancaria_itens TO service_role;


--
-- Name: TABLE excel_linhas_aux; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.excel_linhas_aux TO anon;
GRANT ALL ON TABLE public.excel_linhas_aux TO authenticated;
GRANT ALL ON TABLE public.excel_linhas_aux TO service_role;


--
-- Name: TABLE extrato_bancario_staging; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.extrato_bancario_staging TO anon;
GRANT ALL ON TABLE public.extrato_bancario_staging TO authenticated;
GRANT ALL ON TABLE public.extrato_bancario_staging TO service_role;


--
-- Name: TABLE extrato_bancario_staging_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.extrato_bancario_staging_itens TO anon;
GRANT ALL ON TABLE public.extrato_bancario_staging_itens TO authenticated;
GRANT ALL ON TABLE public.extrato_bancario_staging_itens TO service_role;


--
-- Name: TABLE extrato_bancario_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.extrato_bancario_v2 TO anon;
GRANT ALL ON TABLE public.extrato_bancario_v2 TO authenticated;
GRANT ALL ON TABLE public.extrato_bancario_v2 TO service_role;


--
-- Name: TABLE fazenda_cadastros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fazenda_cadastros TO anon;
GRANT ALL ON TABLE public.fazenda_cadastros TO authenticated;
GRANT ALL ON TABLE public.fazenda_cadastros TO service_role;


--
-- Name: TABLE fazenda_membros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fazenda_membros TO anon;
GRANT ALL ON TABLE public.fazenda_membros TO authenticated;
GRANT ALL ON TABLE public.fazenda_membros TO service_role;


--
-- Name: TABLE fazenda_status_mensal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fazenda_status_mensal TO anon;
GRANT ALL ON TABLE public.fazenda_status_mensal TO authenticated;
GRANT ALL ON TABLE public.fazenda_status_mensal TO service_role;


--
-- Name: TABLE fazendas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fazendas TO anon;
GRANT ALL ON TABLE public.fazendas TO authenticated;
GRANT ALL ON TABLE public.fazendas TO service_role;


--
-- Name: TABLE fechamento_area_snapshot; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_area_snapshot TO anon;
GRANT ALL ON TABLE public.fechamento_area_snapshot TO authenticated;
GRANT ALL ON TABLE public.fechamento_area_snapshot TO service_role;


--
-- Name: TABLE fechamento_execucoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_execucoes TO anon;
GRANT ALL ON TABLE public.fechamento_execucoes TO authenticated;
GRANT ALL ON TABLE public.fechamento_execucoes TO service_role;


--
-- Name: TABLE fechamento_executivo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_executivo TO anon;
GRANT ALL ON TABLE public.fechamento_executivo TO authenticated;
GRANT ALL ON TABLE public.fechamento_executivo TO service_role;


--
-- Name: TABLE fechamento_graficos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_graficos TO anon;
GRANT ALL ON TABLE public.fechamento_graficos TO authenticated;
GRANT ALL ON TABLE public.fechamento_graficos TO service_role;


--
-- Name: TABLE fechamento_indicadores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_indicadores TO anon;
GRANT ALL ON TABLE public.fechamento_indicadores TO authenticated;
GRANT ALL ON TABLE public.fechamento_indicadores TO service_role;


--
-- Name: TABLE fechamento_pasto_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_pasto_itens TO anon;
GRANT ALL ON TABLE public.fechamento_pasto_itens TO authenticated;
GRANT ALL ON TABLE public.fechamento_pasto_itens TO service_role;


--
-- Name: TABLE fechamento_pastos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_pastos TO anon;
GRANT ALL ON TABLE public.fechamento_pastos TO authenticated;
GRANT ALL ON TABLE public.fechamento_pastos TO service_role;


--
-- Name: TABLE fechamento_reaberturas_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_reaberturas_log TO anon;
GRANT ALL ON TABLE public.fechamento_reaberturas_log TO authenticated;
GRANT ALL ON TABLE public.fechamento_reaberturas_log TO service_role;


--
-- Name: TABLE fechamento_textos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamento_textos TO anon;
GRANT ALL ON TABLE public.fechamento_textos TO authenticated;
GRANT ALL ON TABLE public.fechamento_textos TO service_role;


--
-- Name: TABLE fechamentos_executivos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamentos_executivos TO anon;
GRANT ALL ON TABLE public.fechamentos_executivos TO authenticated;
GRANT ALL ON TABLE public.fechamentos_executivos TO service_role;


--
-- Name: TABLE financeiro_centros_custo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_centros_custo TO anon;
GRANT ALL ON TABLE public.financeiro_centros_custo TO authenticated;
GRANT ALL ON TABLE public.financeiro_centros_custo TO service_role;


--
-- Name: TABLE financeiro_classificacao_regras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_classificacao_regras TO anon;
GRANT ALL ON TABLE public.financeiro_classificacao_regras TO authenticated;
GRANT ALL ON TABLE public.financeiro_classificacao_regras TO service_role;


--
-- Name: TABLE financeiro_classificacao_staging; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_classificacao_staging TO anon;
GRANT ALL ON TABLE public.financeiro_classificacao_staging TO authenticated;
GRANT ALL ON TABLE public.financeiro_classificacao_staging TO service_role;


--
-- Name: TABLE financeiro_conciliacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_conciliacoes TO anon;
GRANT ALL ON TABLE public.financeiro_conciliacoes TO authenticated;
GRANT ALL ON TABLE public.financeiro_conciliacoes TO service_role;


--
-- Name: TABLE financeiro_contas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_contas TO anon;
GRANT ALL ON TABLE public.financeiro_contas TO authenticated;
GRANT ALL ON TABLE public.financeiro_contas TO service_role;


--
-- Name: TABLE financeiro_contas_bancarias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_contas_bancarias TO anon;
GRANT ALL ON TABLE public.financeiro_contas_bancarias TO authenticated;
GRANT ALL ON TABLE public.financeiro_contas_bancarias TO service_role;


--
-- Name: TABLE financeiro_contratos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_contratos TO anon;
GRANT ALL ON TABLE public.financeiro_contratos TO authenticated;
GRANT ALL ON TABLE public.financeiro_contratos TO service_role;


--
-- Name: TABLE financeiro_dividendos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_dividendos TO anon;
GRANT ALL ON TABLE public.financeiro_dividendos TO authenticated;
GRANT ALL ON TABLE public.financeiro_dividendos TO service_role;


--
-- Name: TABLE financeiro_duplicidade_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_duplicidade_log TO anon;
GRANT ALL ON TABLE public.financeiro_duplicidade_log TO authenticated;
GRANT ALL ON TABLE public.financeiro_duplicidade_log TO service_role;


--
-- Name: TABLE financeiro_extrato_bancario; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_extrato_bancario TO anon;
GRANT ALL ON TABLE public.financeiro_extrato_bancario TO authenticated;
GRANT ALL ON TABLE public.financeiro_extrato_bancario TO service_role;


--
-- Name: TABLE financeiro_fechamentos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_fechamentos TO anon;
GRANT ALL ON TABLE public.financeiro_fechamentos TO authenticated;
GRANT ALL ON TABLE public.financeiro_fechamentos TO service_role;


--
-- Name: TABLE financeiro_fornecedores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_fornecedores TO anon;
GRANT ALL ON TABLE public.financeiro_fornecedores TO authenticated;
GRANT ALL ON TABLE public.financeiro_fornecedores TO service_role;


--
-- Name: TABLE financeiro_importacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_importacoes TO anon;
GRANT ALL ON TABLE public.financeiro_importacoes TO authenticated;
GRANT ALL ON TABLE public.financeiro_importacoes TO service_role;


--
-- Name: TABLE financeiro_importacoes_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_importacoes_v2 TO anon;
GRANT ALL ON TABLE public.financeiro_importacoes_v2 TO authenticated;
GRANT ALL ON TABLE public.financeiro_importacoes_v2 TO service_role;


--
-- Name: TABLE financeiro_lancamentos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_lancamentos TO anon;
GRANT ALL ON TABLE public.financeiro_lancamentos TO authenticated;
GRANT ALL ON TABLE public.financeiro_lancamentos TO service_role;


--
-- Name: TABLE financeiro_lancamentos_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_lancamentos_v2 TO anon;
GRANT ALL ON TABLE public.financeiro_lancamentos_v2 TO authenticated;
GRANT ALL ON TABLE public.financeiro_lancamentos_v2 TO service_role;


--
-- Name: TABLE financeiro_mapa_classificacao; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_mapa_classificacao TO anon;
GRANT ALL ON TABLE public.financeiro_mapa_classificacao TO authenticated;
GRANT ALL ON TABLE public.financeiro_mapa_classificacao TO service_role;


--
-- Name: TABLE financeiro_plano_contas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_plano_contas TO anon;
GRANT ALL ON TABLE public.financeiro_plano_contas TO authenticated;
GRANT ALL ON TABLE public.financeiro_plano_contas TO service_role;


--
-- Name: TABLE financeiro_rateio_adm; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_rateio_adm TO anon;
GRANT ALL ON TABLE public.financeiro_rateio_adm TO authenticated;
GRANT ALL ON TABLE public.financeiro_rateio_adm TO service_role;


--
-- Name: TABLE financeiro_rateio_adm_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_rateio_adm_itens TO anon;
GRANT ALL ON TABLE public.financeiro_rateio_adm_itens TO authenticated;
GRANT ALL ON TABLE public.financeiro_rateio_adm_itens TO service_role;


--
-- Name: TABLE financeiro_resumo_caixa; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_resumo_caixa TO anon;
GRANT ALL ON TABLE public.financeiro_resumo_caixa TO authenticated;
GRANT ALL ON TABLE public.financeiro_resumo_caixa TO service_role;


--
-- Name: TABLE financeiro_safras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_safras TO anon;
GRANT ALL ON TABLE public.financeiro_safras TO authenticated;
GRANT ALL ON TABLE public.financeiro_safras TO service_role;


--
-- Name: TABLE financeiro_saldos_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_saldos_audit TO anon;
GRANT ALL ON TABLE public.financeiro_saldos_audit TO authenticated;
GRANT ALL ON TABLE public.financeiro_saldos_audit TO service_role;


--
-- Name: TABLE financeiro_saldos_bancarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_saldos_bancarios TO anon;
GRANT ALL ON TABLE public.financeiro_saldos_bancarios TO authenticated;
GRANT ALL ON TABLE public.financeiro_saldos_bancarios TO service_role;


--
-- Name: TABLE financeiro_saldos_bancarios_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_saldos_bancarios_v2 TO anon;
GRANT ALL ON TABLE public.financeiro_saldos_bancarios_v2 TO authenticated;
GRANT ALL ON TABLE public.financeiro_saldos_bancarios_v2 TO service_role;


--
-- Name: TABLE financeiro_subcentro_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiro_subcentro_aliases TO anon;
GRANT ALL ON TABLE public.financeiro_subcentro_aliases TO authenticated;
GRANT ALL ON TABLE public.financeiro_subcentro_aliases TO service_role;


--
-- Name: TABLE financeiros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financeiros TO anon;
GRANT ALL ON TABLE public.financeiros TO authenticated;
GRANT ALL ON TABLE public.financeiros TO service_role;


--
-- Name: TABLE financiamento_destinacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financiamento_destinacoes TO anon;
GRANT ALL ON TABLE public.financiamento_destinacoes TO authenticated;
GRANT ALL ON TABLE public.financiamento_destinacoes TO service_role;


--
-- Name: TABLE financiamento_parcelas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financiamento_parcelas TO anon;
GRANT ALL ON TABLE public.financiamento_parcelas TO authenticated;
GRANT ALL ON TABLE public.financiamento_parcelas TO service_role;


--
-- Name: TABLE financiamentos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financiamentos TO anon;
GRANT ALL ON TABLE public.financiamentos TO authenticated;
GRANT ALL ON TABLE public.financiamentos TO service_role;


--
-- Name: TABLE mesa_lancamento_staging; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mesa_lancamento_staging TO anon;
GRANT ALL ON TABLE public.mesa_lancamento_staging TO authenticated;
GRANT ALL ON TABLE public.mesa_lancamento_staging TO service_role;


--
-- Name: TABLE mesa_ofx_validacao; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mesa_ofx_validacao TO anon;
GRANT ALL ON TABLE public.mesa_ofx_validacao TO authenticated;
GRANT ALL ON TABLE public.mesa_ofx_validacao TO service_role;


--
-- Name: TABLE mesa_par; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mesa_par TO anon;
GRANT ALL ON TABLE public.mesa_par TO authenticated;
GRANT ALL ON TABLE public.mesa_par TO service_role;


--
-- Name: TABLE mesa_par_backup_pr6_1b_20260524; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mesa_par_backup_pr6_1b_20260524 TO anon;
GRANT ALL ON TABLE public.mesa_par_backup_pr6_1b_20260524 TO authenticated;
GRANT ALL ON TABLE public.mesa_par_backup_pr6_1b_20260524 TO service_role;


--
-- Name: TABLE mesa_par_backup_pr6_1c_20260525; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mesa_par_backup_pr6_1c_20260525 TO anon;
GRANT ALL ON TABLE public.mesa_par_backup_pr6_1c_20260525 TO authenticated;
GRANT ALL ON TABLE public.mesa_par_backup_pr6_1c_20260525 TO service_role;


--
-- Name: TABLE mesa_sessao; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mesa_sessao TO anon;
GRANT ALL ON TABLE public.mesa_sessao TO authenticated;
GRANT ALL ON TABLE public.mesa_sessao TO service_role;


--
-- Name: TABLE meta_aprovacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_aprovacoes TO anon;
GRANT ALL ON TABLE public.meta_aprovacoes TO authenticated;
GRANT ALL ON TABLE public.meta_aprovacoes TO service_role;


--
-- Name: TABLE meta_gmd_mensal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_gmd_mensal TO anon;
GRANT ALL ON TABLE public.meta_gmd_mensal TO authenticated;
GRANT ALL ON TABLE public.meta_gmd_mensal TO service_role;


--
-- Name: TABLE meta_parametros_nutricao; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_parametros_nutricao TO anon;
GRANT ALL ON TABLE public.meta_parametros_nutricao TO authenticated;
GRANT ALL ON TABLE public.meta_parametros_nutricao TO service_role;


--
-- Name: TABLE meta_preco_mercado; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_preco_mercado TO anon;
GRANT ALL ON TABLE public.meta_preco_mercado TO authenticated;
GRANT ALL ON TABLE public.meta_preco_mercado TO service_role;


--
-- Name: TABLE meta_preco_mercado_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_preco_mercado_status TO anon;
GRANT ALL ON TABLE public.meta_preco_mercado_status TO authenticated;
GRANT ALL ON TABLE public.meta_preco_mercado_status TO service_role;


--
-- Name: TABLE meta_projetos_investimento; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_projetos_investimento TO anon;
GRANT ALL ON TABLE public.meta_projetos_investimento TO authenticated;
GRANT ALL ON TABLE public.meta_projetos_investimento TO service_role;


--
-- Name: TABLE meta_valor_rebanho_precos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_valor_rebanho_precos TO anon;
GRANT ALL ON TABLE public.meta_valor_rebanho_precos TO authenticated;
GRANT ALL ON TABLE public.meta_valor_rebanho_precos TO service_role;


--
-- Name: TABLE meta_valor_rebanho_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_valor_rebanho_status TO anon;
GRANT ALL ON TABLE public.meta_valor_rebanho_status TO authenticated;
GRANT ALL ON TABLE public.meta_valor_rebanho_status TO service_role;


--
-- Name: TABLE meta_versoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_versoes TO anon;
GRANT ALL ON TABLE public.meta_versoes TO authenticated;
GRANT ALL ON TABLE public.meta_versoes TO service_role;


--
-- Name: TABLE meta_versoes_backup_20260516; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_versoes_backup_20260516 TO anon;
GRANT ALL ON TABLE public.meta_versoes_backup_20260516 TO authenticated;
GRANT ALL ON TABLE public.meta_versoes_backup_20260516 TO service_role;


--
-- Name: TABLE pasto_condicoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pasto_condicoes TO anon;
GRANT ALL ON TABLE public.pasto_condicoes TO authenticated;
GRANT ALL ON TABLE public.pasto_condicoes TO service_role;


--
-- Name: TABLE pasto_geometrias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pasto_geometrias TO anon;
GRANT ALL ON TABLE public.pasto_geometrias TO authenticated;
GRANT ALL ON TABLE public.pasto_geometrias TO service_role;


--
-- Name: TABLE pasto_movimentacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pasto_movimentacoes TO anon;
GRANT ALL ON TABLE public.pasto_movimentacoes TO authenticated;
GRANT ALL ON TABLE public.pasto_movimentacoes TO service_role;


--
-- Name: TABLE pastos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pastos TO anon;
GRANT ALL ON TABLE public.pastos TO authenticated;
GRANT ALL ON TABLE public.pastos TO service_role;


--
-- Name: TABLE planejamento_area_meta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.planejamento_area_meta TO anon;
GRANT ALL ON TABLE public.planejamento_area_meta TO authenticated;
GRANT ALL ON TABLE public.planejamento_area_meta TO service_role;


--
-- Name: TABLE planejamento_financeiro; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.planejamento_financeiro TO anon;
GRANT ALL ON TABLE public.planejamento_financeiro TO authenticated;
GRANT ALL ON TABLE public.planejamento_financeiro TO service_role;


--
-- Name: TABLE planejamento_financeiro_backup_20260516; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.planejamento_financeiro_backup_20260516 TO anon;
GRANT ALL ON TABLE public.planejamento_financeiro_backup_20260516 TO authenticated;
GRANT ALL ON TABLE public.planejamento_financeiro_backup_20260516 TO service_role;


--
-- Name: TABLE preco_mercado; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preco_mercado TO anon;
GRANT ALL ON TABLE public.preco_mercado TO authenticated;
GRANT ALL ON TABLE public.preco_mercado TO service_role;


--
-- Name: TABLE preco_mercado_ajuste; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preco_mercado_ajuste TO anon;
GRANT ALL ON TABLE public.preco_mercado_ajuste TO authenticated;
GRANT ALL ON TABLE public.preco_mercado_ajuste TO service_role;


--
-- Name: TABLE preco_mercado_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preco_mercado_status TO anon;
GRANT ALL ON TABLE public.preco_mercado_status TO authenticated;
GRANT ALL ON TABLE public.preco_mercado_status TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE reclassificacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reclassificacoes TO anon;
GRANT ALL ON TABLE public.reclassificacoes TO authenticated;
GRANT ALL ON TABLE public.reclassificacoes TO service_role;


--
-- Name: TABLE saldos_iniciais; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.saldos_iniciais TO anon;
GRANT ALL ON TABLE public.saldos_iniciais TO authenticated;
GRANT ALL ON TABLE public.saldos_iniciais TO service_role;


--
-- Name: TABLE transferencia_ofx_pares; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transferencia_ofx_pares TO anon;
GRANT ALL ON TABLE public.transferencia_ofx_pares TO authenticated;
GRANT ALL ON TABLE public.transferencia_ofx_pares TO service_role;


--
-- Name: TABLE valor_rebanho_fechamento; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.valor_rebanho_fechamento TO anon;
GRANT ALL ON TABLE public.valor_rebanho_fechamento TO authenticated;
GRANT ALL ON TABLE public.valor_rebanho_fechamento TO service_role;


--
-- Name: TABLE valor_rebanho_fechamento_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.valor_rebanho_fechamento_itens TO anon;
GRANT ALL ON TABLE public.valor_rebanho_fechamento_itens TO authenticated;
GRANT ALL ON TABLE public.valor_rebanho_fechamento_itens TO service_role;


--
-- Name: TABLE valor_rebanho_mensal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.valor_rebanho_mensal TO anon;
GRANT ALL ON TABLE public.valor_rebanho_mensal TO authenticated;
GRANT ALL ON TABLE public.valor_rebanho_mensal TO service_role;


--
-- Name: TABLE valor_rebanho_meta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.valor_rebanho_meta TO anon;
GRANT ALL ON TABLE public.valor_rebanho_meta TO authenticated;
GRANT ALL ON TABLE public.valor_rebanho_meta TO service_role;


--
-- Name: TABLE valor_rebanho_meta_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.valor_rebanho_meta_itens TO anon;
GRANT ALL ON TABLE public.valor_rebanho_meta_itens TO authenticated;
GRANT ALL ON TABLE public.valor_rebanho_meta_itens TO service_role;


--
-- Name: TABLE valor_rebanho_meta_validada; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.valor_rebanho_meta_validada TO anon;
GRANT ALL ON TABLE public.valor_rebanho_meta_validada TO authenticated;
GRANT ALL ON TABLE public.valor_rebanho_meta_validada TO service_role;


--
-- Name: TABLE valor_rebanho_meta_validada_backup_20260516; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.valor_rebanho_meta_validada_backup_20260516 TO anon;
GRANT ALL ON TABLE public.valor_rebanho_meta_validada_backup_20260516 TO authenticated;
GRANT ALL ON TABLE public.valor_rebanho_meta_validada_backup_20260516 TO service_role;


--
-- Name: TABLE valor_rebanho_realizado_validado; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.valor_rebanho_realizado_validado TO anon;
GRANT ALL ON TABLE public.valor_rebanho_realizado_validado TO authenticated;
GRANT ALL ON TABLE public.valor_rebanho_realizado_validado TO service_role;


--
-- Name: TABLE vw_classificacao_staging_preview; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_classificacao_staging_preview TO anon;
GRANT ALL ON TABLE public.vw_classificacao_staging_preview TO authenticated;
GRANT ALL ON TABLE public.vw_classificacao_staging_preview TO service_role;


--
-- Name: TABLE vw_financeiro_auditoria_competencia_caixa; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_financeiro_auditoria_competencia_caixa TO anon;
GRANT ALL ON TABLE public.vw_financeiro_auditoria_competencia_caixa TO authenticated;
GRANT ALL ON TABLE public.vw_financeiro_auditoria_competencia_caixa TO service_role;


--
-- Name: TABLE vw_financeiro_dashboard_mensal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_financeiro_dashboard_mensal TO anon;
GRANT ALL ON TABLE public.vw_financeiro_dashboard_mensal TO authenticated;
GRANT ALL ON TABLE public.vw_financeiro_dashboard_mensal TO service_role;


--
-- Name: TABLE vw_financeiro_desembolso_centro; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_financeiro_desembolso_centro TO anon;
GRANT ALL ON TABLE public.vw_financeiro_desembolso_centro TO authenticated;
GRANT ALL ON TABLE public.vw_financeiro_desembolso_centro TO service_role;


--
-- Name: TABLE vw_financeiro_fluxo_caixa_mensal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_financeiro_fluxo_caixa_mensal TO anon;
GRANT ALL ON TABLE public.vw_financeiro_fluxo_caixa_mensal TO authenticated;
GRANT ALL ON TABLE public.vw_financeiro_fluxo_caixa_mensal TO service_role;


--
-- Name: TABLE vw_valor_rebanho_realizado_global_mensal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_valor_rebanho_realizado_global_mensal TO anon;
GRANT ALL ON TABLE public.vw_valor_rebanho_realizado_global_mensal TO authenticated;
GRANT ALL ON TABLE public.vw_valor_rebanho_realizado_global_mensal TO service_role;


--
-- Name: TABLE vw_zoot_categoria_mensal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_zoot_categoria_mensal TO anon;
GRANT ALL ON TABLE public.vw_zoot_categoria_mensal TO authenticated;
GRANT ALL ON TABLE public.vw_zoot_categoria_mensal TO service_role;


--
-- Name: TABLE vw_zoot_fazenda_mensal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_zoot_fazenda_mensal TO anon;
GRANT ALL ON TABLE public.vw_zoot_fazenda_mensal TO authenticated;
GRANT ALL ON TABLE public.vw_zoot_fazenda_mensal TO service_role;


--
-- Name: TABLE zoot_importacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zoot_importacoes TO anon;
GRANT ALL ON TABLE public.zoot_importacoes TO authenticated;
GRANT ALL ON TABLE public.zoot_importacoes TO service_role;


--
-- Name: TABLE zoot_importacoes_staging; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zoot_importacoes_staging TO anon;
GRANT ALL ON TABLE public.zoot_importacoes_staging TO authenticated;
GRANT ALL ON TABLE public.zoot_importacoes_staging TO service_role;


--
-- Name: TABLE zoot_mensal_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zoot_mensal_cache TO anon;
GRANT ALL ON TABLE public.zoot_mensal_cache TO authenticated;
GRANT ALL ON TABLE public.zoot_mensal_cache TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict BbwfOzQ0gRibiVIdws90sXzZY1C2G3YgjsvRkvWJpofD0gnofziTX5ZsusuhXil

