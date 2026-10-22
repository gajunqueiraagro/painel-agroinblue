-- ITENS-NOTA-01 (parte 2 de 2) — as funcoes: `fn_nota_fiscal_gravar` (a unica escrita dos itens; o XML sempre manda), `fn_nota_fiscal_operacao_abrir`
-- e `fn_nota_fiscal_desfazer` (a trilha do backfill). As tabelas e a RLS estao na 20261028110700. SECURITY DEFINER com `tenant_ok`; REVOKE de
-- PUBLIC/anon, EXECUTE para `authenticated` (a tela grava ao criar pela nota e o backfill roda na sessao de quem esta' logado).
SET LOCAL lock_timeout = '2s';

/* `p_nota` = {chave_acesso, origem, numero, serie, emissao, natureza, regime, emitente_documento, emitente_nome, totais{…_cent}, xml_original};
   `p_itens` = [{n_item, codigo, …, liquido_cent}]. O liquido de cada item e' CONFERIDO aqui (produto - desconto + frete + seguro + outras + IPI + ST
   + FCP-ST); a soma dos liquidos fica gravada ao lado do valor da nota (`soma_confere`). */
CREATE OR REPLACE FUNCTION public.fn_nota_fiscal_gravar(p_cliente uuid, p_nota jsonb, p_itens jsonb, p_simular boolean DEFAULT true, p_operacao uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare
  v_chave text := p_nota->>'chave_acesso';
  v_origem text := p_nota->>'origem';
  v_atual public.nota_fiscal%rowtype;
  v_id uuid;
  v_soma bigint;
  v_nota bigint := (p_nota->'totais'->>'nota_cent')::bigint;
  v_acao text;
  v_ret jsonb;
  v_ruim int;
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if v_chave is null or v_chave !~ '^[0-9]{44}$' then raise exception using errcode = '22023', message = 'Nota sem chave de acesso de 44 dígitos. Nada foi gravado.'; end if;
  if v_origem not in ('xml', 'pdf') then raise exception using errcode = '22023', message = 'Origem da nota inválida (xml ou pdf). Nada foi gravado.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception using errcode = '22023', message = 'Nota sem itens. Nada foi gravado.';
  end if;
  if v_nota is null then raise exception using errcode = '22023', message = 'Nota sem o valor total. Nada foi gravado.'; end if;
  select count(*) into v_ruim from jsonb_array_elements(p_itens) i
   where coalesce((i->>'liquido_cent')::bigint, -1) <> coalesce((i->>'produto_cent')::bigint, 0) - coalesce((i->>'desconto_cent')::bigint, 0)
         + coalesce((i->>'frete_cent')::bigint, 0) + coalesce((i->>'seguro_cent')::bigint, 0) + coalesce((i->>'outras_cent')::bigint, 0)
         + coalesce((i->'ipi'->>'valorCent')::bigint, 0) + coalesce((i->'icms_st'->>'valorCent')::bigint, 0) + coalesce((i->'fcp_st'->>'valorCent')::bigint, 0);
  if v_ruim > 0 then raise exception using errcode = '22023', message = format('%s item(ns) com o líquido que não fecha com produto, descontos e acréscimos. Nada foi gravado.', v_ruim); end if;
  select sum((i->>'liquido_cent')::bigint) into v_soma from jsonb_array_elements(p_itens) i;

  select * into v_atual from public.nota_fiscal where cliente_id = p_cliente and chave_acesso = v_chave for update;
  if found and v_atual.origem = 'xml' and v_origem = 'pdf' then
    return jsonb_build_object('acao', 'mantida_xml', 'nota_id', v_atual.id, 'itens', (select count(*) from public.nota_fiscal_itens where nota_id = v_atual.id), 'simulado', p_simular);
  end if;
  v_acao := case when found then 'substituida' else 'criada' end;

  begin
    if found then
      delete from public.nota_fiscal_itens where nota_id = v_atual.id;
      update public.nota_fiscal set origem = v_origem, numero = p_nota->>'numero', serie = p_nota->>'serie', emissao = nullif(p_nota->>'emissao', '')::date,
             natureza = p_nota->>'natureza', regime = p_nota->>'regime', emitente_documento = p_nota->>'emitente_documento', emitente_nome = p_nota->>'emitente_nome',
             totais = coalesce(p_nota->'totais', '{}'::jsonb), xml_original = p_nota->>'xml_original', soma_cent = v_soma, nota_cent = v_nota,
             lido_em = clock_timestamp(), lido_por = auth.uid(), operacao_id = p_operacao
       where id = v_atual.id;
      v_id := v_atual.id;
    else
      insert into public.nota_fiscal (cliente_id, chave_acesso, origem, numero, serie, emissao, natureza, regime, emitente_documento, emitente_nome,
                                      totais, xml_original, soma_cent, nota_cent, lido_por, operacao_id)
      values (p_cliente, v_chave, v_origem, p_nota->>'numero', p_nota->>'serie', nullif(p_nota->>'emissao', '')::date, p_nota->>'natureza', p_nota->>'regime',
              p_nota->>'emitente_documento', p_nota->>'emitente_nome', coalesce(p_nota->'totais', '{}'::jsonb), p_nota->>'xml_original', v_soma, v_nota,
              auth.uid(), p_operacao)
      returning id into v_id;
    end if;
    insert into public.nota_fiscal_itens (nota_id, cliente_id, n_item, codigo, ean, descricao, ncm, cest, cfop, cst, csosn,
        unidade, quantidade, unitario, unidade_trib, quantidade_trib, unitario_trib,
        produto_cent, desconto_cent, frete_cent, seguro_cent, outras_cent, rateado,
        icms, icms_st, fcp, fcp_st, ipi, pis, cofins, ibs_cbs, rastro, info_adicional, liquido_cent)
    select v_id, p_cliente, (i->>'n_item')::int, i->>'codigo', i->>'ean', coalesce(i->>'descricao', ''), i->>'ncm', i->>'cest', i->>'cfop', i->>'cst', i->>'csosn',
        i->>'unidade', nullif(i->>'quantidade', '')::numeric, nullif(i->>'unitario', '')::numeric, i->>'unidade_trib',
        nullif(i->>'quantidade_trib', '')::numeric, nullif(i->>'unitario_trib', '')::numeric,
        (i->>'produto_cent')::bigint, coalesce((i->>'desconto_cent')::bigint, 0), coalesce((i->>'frete_cent')::bigint, 0),
        coalesce((i->>'seguro_cent')::bigint, 0), coalesce((i->>'outras_cent')::bigint, 0), coalesce((i->>'rateado')::boolean, false),
        i->'icms', i->'icms_st', i->'fcp', i->'fcp_st', i->'ipi', i->'pis', i->'cofins', i->'ibs_cbs', coalesce(i->'rastro', '[]'::jsonb), i->>'info_adicional',
        (i->>'liquido_cent')::bigint
      from jsonb_array_elements(p_itens) i;
    v_ret := jsonb_build_object('acao', v_acao, 'nota_id', v_id, 'itens', jsonb_array_length(p_itens), 'soma_cent', v_soma, 'nota_cent', v_nota,
      'confere', v_soma = v_nota, 'simulado', p_simular);
    if p_simular then raise exception using errcode = 'NFSIM', message = v_ret::text; end if;
  exception when sqlstate 'NFSIM' then
    v_ret := sqlerrm::jsonb || jsonb_build_object('nota_id', null);
  end;
  return v_ret;
end
$f$;

/* A operacao de BACKFILL: abre (com o resumo do que foi simulado) e e' o `p_operacao` de cada gravacao; o desfazer tira as notas que ela
   criou e que ninguem trocou depois (a nota regravada por outra leitura tem outra operacao e fica). */
CREATE OR REPLACE FUNCTION public.fn_nota_fiscal_operacao_abrir(p_cliente uuid, p_tipo text, p_resumo jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare v_id uuid;
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  insert into public.nota_fiscal_operacoes (cliente_id, tipo, feita_por, resumo) values (p_cliente, p_tipo, auth.uid(), coalesce(p_resumo, '{}'::jsonb)) returning id into v_id;
  return v_id;
end
$f$;

CREATE OR REPLACE FUNCTION public.fn_nota_fiscal_desfazer(p_operacao uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare v_op public.nota_fiscal_operacoes%rowtype; v_n int; v_ret jsonb;
begin
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(SELECT o.cliente_id FROM public.nota_fiscal_operacoes o WHERE o.id = p_operacao)]);
  select * into v_op from public.nota_fiscal_operacoes where id = p_operacao for update;
  if not found then raise exception using errcode = 'P0001', message = 'Operação não encontrada. Nada foi gravado.'; end if;
  if v_op.desfeita_em is not null then raise exception using errcode = 'P0001', message = 'Esta operação já foi desfeita. Nada foi gravado.'; end if;
  if not p_simular and coalesce(btrim(p_motivo), '') = '' then raise exception using errcode = 'P0001', message = 'Informe o motivo. Nada foi gravado.'; end if;
  begin
    with fora as (delete from public.nota_fiscal where operacao_id = p_operacao and cliente_id = v_op.cliente_id returning id)
    select count(*) into v_n from fora;
    update public.nota_fiscal_operacoes set desfeita_em = clock_timestamp(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(nullif(btrim(p_motivo), ''), 'simulacao')
     where id = p_operacao;
    v_ret := jsonb_build_object('operacao_id', p_operacao, 'notas', v_n, 'simulado', p_simular);
    if p_simular then raise exception using errcode = 'NFSIM', message = v_ret::text; end if;
  exception when sqlstate 'NFSIM' then
    v_ret := sqlerrm::jsonb;
  end;
  return v_ret;
end
$f$;

REVOKE ALL ON FUNCTION public.fn_nota_fiscal_gravar(uuid, jsonb, jsonb, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_nota_fiscal_operacao_abrir(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_nota_fiscal_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_gravar(uuid, jsonb, jsonb, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_operacao_abrir(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_desfazer(uuid, text, boolean) TO authenticated, service_role;
