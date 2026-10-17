-- FIN-FINANC-28 · FIX 4b — "Buscar pagamento" / "Buscar entradas" com parcela ou contrato ZERADO (Gabriel 17/10/2026 13:46).
-- Caso: parcela 6 (venc. 15/10/21) com principal 0 · juros 0 · total 0 — o filtro "valor ate 10% do previsto" excluia tudo.
--
-- 1. fn_financiamento_candidatas ganha p_opcoes jsonb (DROP + CREATE; a chamada de 3 argumentos segue valendo):
--      faixa  '10pct' | 'qualquer'   (padrao: '10pct' com previsto; 'qualquer' com a parcela zerada)
--      de, ate                       (padrao: vencimento ±45 dias na parcela; contrato −30/+365 na liberacao)
--      busca  texto livre            (descricao, favorecido, valor "1.142.396" ou "1142396,74", nº do contrato): procura em TODAS as
--                                     saidas/entradas do cliente, sem janela e sem exigir credor/plano
--      todas  boolean                (sem exigir credor/plano/nº/nome, na janela)
--    O credor casa tambem pelo CPF/CNPJ do cadastro e pelos apelidos. Parcela zerada: sem filtro de valor, ordenada pela data, e o
--    "por que" diz "parcela sem valor — sugestão só por credor/data". O envelope ganha `busca` (o que foi procurado).
-- 2. _fn_financiamento_parcela_vincular_exec / fn_financiamento_parcela_vincular ganham p_atualizar_valor (DEFAULT NULL): juros
--    deixa de exigir juros previsto > 0; na parcela ZERADA o valor so' vem do pagamento com o SIM do operador (principal, juros ou a
--    parcela inteira no principal); o desvincular devolve a foto (a parcela volta a zero). Patch guardado por md5.
SET LOCAL lock_timeout = '2s';

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_financiamento_candidatas(uuid,text,uuid)'::regprocedure) <> 'f191ceacc990303372076c796581a82a' THEN
    RAISE EXCEPTION 'fn_financiamento_candidatas fora do md5 de origem';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_financiamento_parcela_vincular_exec(uuid,uuid,text,boolean)'::regprocedure) <> 'e887bcb4087dc7ad1e9cf6ab16570fd4' THEN
    RAISE EXCEPTION '_fn_financiamento_parcela_vincular_exec fora do md5 de origem';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_financiamento_parcela_vincular(uuid,uuid,text,boolean,boolean)'::regprocedure) <> 'fbd43b3f20745c1df484e4265ebb4a82' THEN
    RAISE EXCEPTION 'fn_financiamento_parcela_vincular fora do md5 de origem';
  END IF;
END $guarda$;

-- ═══ 2a. o _exec: patch guardado (3 ancoras + a assinatura), conferido pelo md5 de destino ═══
DO $patch$
DECLARE
  v_def text := pg_get_functiondef('public._fn_financiamento_parcela_vincular_exec(uuid,uuid,text,boolean)'::regprocedure);
  a_args constant text := 'p_parcela_id uuid, p_lancamento_id uuid, p_papel text, p_mover boolean)';
  a_decl constant text := E'  r record;\nbegin';
  a_juros constant text := E'  if p_papel = ''juros'' and coalesce(q.valor_juros, 0) <= 0 then raise exception using errcode = ''P0001'', message = ''Esta parcela não tem juros.''; end if;\n';
  a_acomp constant text := E'  perform public._fn_parcela_acompanha_lancamento(l.id);\n';
  a_ret constant text := E'''paga'', coalesce(v_pagos, false));';
  n int;
BEGIN
  FOREACH n IN ARRAY ARRAY[
      (length(v_def) - length(replace(v_def, a_args, ''))) / length(a_args),
      (length(v_def) - length(replace(v_def, a_decl, ''))) / length(a_decl),
      (length(v_def) - length(replace(v_def, a_juros, ''))) / length(a_juros),
      (length(v_def) - length(replace(v_def, a_acomp, ''))) / length(a_acomp),
      (length(v_def) - length(replace(v_def, a_ret, ''))) / length(a_ret)] LOOP
    IF n <> 1 THEN RAISE EXCEPTION 'ancora do _exec nao casa exatamente 1x (%)', n; END IF;
  END LOOP;
  v_def := replace(v_def, a_args, 'p_parcela_id uuid, p_lancamento_id uuid, p_papel text, p_mover boolean, p_atualizar_valor boolean DEFAULT NULL::boolean)');
  v_def := replace(v_def, a_decl, E'  r record; v_zerada boolean;\nbegin');
  v_def := replace(v_def, a_juros, E'  -- FIX 4b: juros nao exige juros previsto (a parcela do legado pode estar zerada)\n');
  v_def := replace(v_def, a_acomp, E'  v_zerada := round(coalesce(q.valor_principal, 0) + coalesce(q.valor_juros, 0), 2) = 0;\n'
    || E'  if v_zerada then\n'
    || E'    -- FIX 4b: a parcela ZERADA so'' ganha o valor do pagamento com o SIM do operador (a parcela inteira vai no principal)\n'
    || E'    if coalesce(p_atualizar_valor, false) then\n'
    || E'      update public.financiamento_parcelas set\n'
    || E'        valor_principal = case when p_papel in (''principal'', ''total'') then round(abs(l.valor), 2) else valor_principal end,\n'
    || E'        valor_juros = case when p_papel = ''juros'' then round(abs(l.valor), 2) else valor_juros end,\n'
    || E'        valor_total = round(abs(l.valor), 2)\n'
    || E'       where id = q.id;\n'
    || E'    end if;\n'
    || E'  else\n'
    || E'    perform public._fn_parcela_acompanha_lancamento(l.id);\n'
    || E'  end if;\n');
  v_def := replace(v_def, a_ret, E'''paga'', coalesce(v_pagos, false), ''parcela_zerada'', v_zerada, ''valor_atualizado'', v_zerada and coalesce(p_atualizar_valor, false));');
  DROP FUNCTION public._fn_financiamento_parcela_vincular_exec(uuid, uuid, text, boolean);
  EXECUTE v_def;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_financiamento_parcela_vincular_exec(uuid,uuid,text,boolean,boolean)'::regprocedure) <> '33bcbf6a364f8b8b1e72258e502d7611' THEN
    RAISE EXCEPTION '_fn_financiamento_parcela_vincular_exec fora do md5 de destino';
  END IF;
END $patch$;
REVOKE ALL ON FUNCTION public._fn_financiamento_parcela_vincular_exec(uuid, uuid, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_financiamento_parcela_vincular_exec(uuid, uuid, text, boolean, boolean) TO service_role;

-- ═══ 2b. a publica ═══
DROP FUNCTION public.fn_financiamento_parcela_vincular(uuid, uuid, text, boolean, boolean);
CREATE FUNCTION public.fn_financiamento_parcela_vincular(p_parcela_id uuid, p_lancamento_id uuid, p_papel text, p_mover boolean DEFAULT false,
  p_simular boolean DEFAULT true, p_atualizar_valor boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
declare r jsonb;
begin
  -- a guarda pelo cliente do CONTRATO da parcela (tenant_ok + 42501; parcela inexistente tambem e' 42501)
  perform public._fn_contrato_do_usuario((select q.financiamento_id from public.financiamento_parcelas q where q.id = p_parcela_id));
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_parcela_vincular_exec(p_parcela_id, p_lancamento_id, p_papel, p_mover, p_atualizar_valor);
      raise exception using errcode = 'FPSIM', message = r::text;
    exception
      when sqlstate 'FPSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  return public._fn_financiamento_parcela_vincular_exec(p_parcela_id, p_lancamento_id, p_papel, p_mover, p_atualizar_valor) || jsonb_build_object('simulado', false);
end $function$;
REVOKE ALL ON FUNCTION public.fn_financiamento_parcela_vincular(uuid, uuid, text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financiamento_parcela_vincular(uuid, uuid, text, boolean, boolean, boolean) TO authenticated, service_role;

-- ═══ 1. as candidatas ═══
DROP FUNCTION public.fn_financiamento_candidatas(uuid, text, uuid);
CREATE FUNCTION public.fn_financiamento_candidatas(p_financiamento_id uuid, p_alvo text, p_parcela_id uuid DEFAULT NULL::uuid, p_opcoes jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  f public.financiamentos%rowtype;
  q public.financiamento_parcelas%rowtype;
  v_saldo_lib numeric; v_planos uuid[]; v_lin jsonb;
  v_op jsonb := coalesce(p_opcoes, '{}'::jsonb);
  v_busca text := nullif(btrim(coalesce(v_op->>'busca', '')), '');
  v_todas boolean := coalesce((v_op->>'todas')::boolean, false);
  v_num numeric; v_dig text; v_faixa text; v_de date; v_ate date; v_zerada boolean;
  v_doc_credor text; v_alias_credor text[];
begin
  f := public._fn_contrato_do_usuario(p_financiamento_id);
  if f.natureza = 'parcelamento' then raise exception using errcode = 'P0001', message = 'Compra parcelada não busca entradas nem pagamentos por aqui.'; end if;
  -- a busca livre: texto e, quando e' so' numero, o valor ("1.142.396" = inteiro; "1142396,74" = com centavos) e os digitos
  if v_busca is not null and v_busca ~ '^[0-9.,\s]+$' and v_busca ~ '[0-9]' then
    v_num := nullif(replace(replace(regexp_replace(v_busca, '\s', '', 'g'), '.', ''), ',', '.'), '')::numeric;
  end if;
  v_dig := nullif(regexp_replace(coalesce(v_busca, ''), '\D', '', 'g'), '');
  -- o credor tambem pelo CPF/CNPJ do cadastro e pelos apelidos (nome normalizado)
  select public._fn_fornecedor_chave_documento(fo.cpf_cnpj), coalesce(fo.aliases_norm, '{}'::text[]) || coalesce(fo.nome_norm, '')
    into v_doc_credor, v_alias_credor from public.financeiro_fornecedores fo where fo.id = f.credor_id;

  if p_alvo = 'liberacao' then
    v_saldo_lib := round(coalesce(f.valor_total, 0) - coalesce((select sum(o.valor) from public.financiamento_liberacoes o
                                                   where o.financiamento_id = f.id and o.cancelado_em is null), 0), 2);
    v_zerada := coalesce(f.valor_total, 0) = 0;
    v_faixa := coalesce(v_op->>'faixa', 'qualquer');
    v_de := coalesce((v_op->>'de')::date, coalesce(f.data_contrato, f.data_inicio, current_date) - 30);
    v_ate := coalesce((v_op->>'ate')::date, coalesce(f.data_contrato, f.data_inicio, current_date) + 365);
    select array_agg(id) into v_planos from public.financeiro_plano_contas where cliente_id is null and ordem_exibicao in (4030, 4040, 4050);
    with base as (
      select l.id, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) as dt, round(abs(l.valor), 2) as valor,
             l.descricao, l.status_transacao, l.favorecido_id, coalesce(l.conta_destino_id, l.conta_bancaria_id) as conta_id,
             (l.plano_conta_id = any(v_planos)) as m_plano,
             ((l.favorecido_id is not distinct from f.credor_id and f.credor_id is not null)
               or (fo.id is not null and v_doc_credor is not null and public._fn_fornecedor_chave_documento(fo.cpf_cnpj) = v_doc_credor)
               or (fo.nome_norm is not null and fo.nome_norm = any(v_alias_credor))) as m_credor,
             public._fn_numero_na_descricao(f.numero_contrato, regexp_replace(coalesce(l.descricao, ''), '\D', '', 'g')) as m_numero,
             public._fn_credor_na_descricao(f.credor_id, l.descricao) as m_nome,
             (v_busca is not null and (l.descricao ilike '%' || v_busca || '%' or fo.nome ilike '%' || v_busca || '%'
               or (v_num is not null and (round(abs(l.valor), 2) = v_num or trunc(abs(l.valor)) = v_num))
               or (length(coalesce(v_dig, '')) >= 4 and regexp_replace(coalesce(l.descricao, ''), '\D', '', 'g') like '%' || v_dig || '%'))) as m_busca,
             (l.status_transacao = 'conciliado' or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l.id and c.desfeito_em is null)) as extrato
        from public.financeiro_lancamentos_v2 l
        left join public.financeiro_fornecedores fo on fo.id = l.favorecido_id
       where l.cliente_id = f.cliente_id and l.cancelado is not true and coalesce(l.tipo_operacao, '') like '1-%'
         and (l.financiamento_id is null or l.financiamento_id = f.id)
         and (v_busca is not null or coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) between v_de and v_ate)
         and not exists (select 1 from public.financiamento_liberacoes o where o.lancamento_id = l.id and o.cancelado_em is null)
         and not exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and not p.cancelada)
    ), pontuada as (
      select b.*,
             abs(b.dt - coalesce(f.data_contrato, f.data_inicio, b.dt)) as dias,
             (b.valor = v_saldo_lib and v_saldo_lib > 0) as v_saldo,
             (b.valor = round(coalesce(f.valor_total, 0), 2) and coalesce(f.valor_total, 0) > 0) as v_contrato,
             (b.valor < v_saldo_lib) as v_cabe,
             (b.conta_id is not distinct from f.conta_bancaria_id and f.conta_bancaria_id is not null) as m_conta
        from base b
       where (case when v_busca is not null then b.m_busca when v_todas then true else b.m_plano or b.m_credor or b.m_numero or b.m_nome end)
         and (v_faixa = 'qualquer' or v_saldo_lib <= 0 or abs(b.valor - v_saldo_lib) <= v_saldo_lib * 0.10)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'lancamento_id', p.id, 'data', p.dt, 'valor', p.valor, 'descricao', p.descricao, 'status_transacao', p.status_transacao,
             'conta', (select coalesce(c.nome_exibicao, c.nome_conta) from public.financeiro_contas_bancarias c where c.id = p.conta_id),
             'favorecido', (select fo.nome from public.financeiro_fornecedores fo where fo.id = p.favorecido_id),
             'extrato', p.extrato, 'dias', p.dias,
             'pontos', (case when p.v_saldo then 50 when p.v_contrato then 45 when p.v_cabe then 10 else 0 end)
                       + (case when p.m_numero then 40 else 0 end) + (case when p.m_credor then 30 else 0 end)
                       + (case when p.m_plano then 20 else 0 end) + (case when p.m_nome then 15 else 0 end)
                       + (case when p.m_conta then 10 else 0 end) + (case when p.extrato then 5 else 0 end) - least(p.dias / 15, 30),
             'motivos', to_jsonb(array_remove(array[
                 case when v_zerada then 'contrato sem valor — sugestão só por credor/data'
                      when p.v_saldo then 'valor = o que falta liberar' when p.v_contrato then 'valor = o do contrato'
                      when p.v_cabe then 'cabe no que falta liberar' end,
                 case when p.m_busca then 'achado pela busca' end,
                 case when p.m_numero then 'nº do contrato na descrição' end,
                 case when p.m_credor then 'favorecido = credor' end,
                 case when p.m_plano then 'entrada de financiamento' end,
                 case when p.m_nome then 'nome do credor na descrição' end,
                 case when p.m_conta then 'conta do contrato' end,
                 case when p.extrato then 'casado com o extrato' end], null)))
           order by (case when v_zerada then 0 else
                    (case when p.v_saldo then 50 when p.v_contrato then 45 when p.v_cabe then 10 else 0 end)
                    + (case when p.m_numero then 40 else 0 end) + (case when p.m_credor then 30 else 0 end)
                    + (case when p.m_plano then 20 else 0 end) + (case when p.m_nome then 15 else 0 end)
                    + (case when p.m_conta then 10 else 0 end) + (case when p.extrato then 5 else 0 end) - least(p.dias / 15, 30) end) desc,
                    p.dias, p.id), '[]'::jsonb)
      into v_lin
      from (select * from pontuada order by dias limit 200) p;
    return jsonb_build_object('alvo', 'liberacao', 'saldo_a_liberar', v_saldo_lib, 'de', v_de, 'ate', v_ate, 'linhas', v_lin,
      'busca', jsonb_build_object('faixa', v_faixa, 'de', v_de, 'ate', v_ate, 'texto', v_busca, 'todas', v_todas, 'sem_previsto', v_zerada));

  elsif p_alvo = 'parcela' then
    select * into q from public.financiamento_parcelas where id = p_parcela_id and financiamento_id = f.id;
    if not found then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
    v_zerada := round(coalesce(q.valor_principal, 0) + coalesce(q.valor_juros, 0), 2) = 0;
    v_faixa := coalesce(v_op->>'faixa', case when v_zerada then 'qualquer' else '10pct' end);
    v_de := coalesce((v_op->>'de')::date, q.data_vencimento - 45);
    v_ate := coalesce((v_op->>'ate')::date, q.data_vencimento + 45);
    select array_agg(id) into v_planos from public.financeiro_plano_contas
     where cliente_id is null and ordem_exibicao in (16010, 16020, 16030, 7010, 12010, 20310, 6040, 21090);
    with alvos as (
      select 'principal'::text as papel, round(coalesce(q.valor_principal, 0), 2) as alvo
      union all select 'juros', round(coalesce(q.valor_juros, 0), 2)
      union all select 'total', round(coalesce(q.valor_principal, 0) + coalesce(q.valor_juros, 0), 2)
    ), base as (
      select l.id, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) as dt, round(abs(l.valor), 2) as valor,
             l.descricao, l.status_transacao, l.favorecido_id, l.conta_bancaria_id as conta_id,
             (l.plano_conta_id = any(v_planos)) as m_plano,
             ((l.favorecido_id is not distinct from f.credor_id and f.credor_id is not null)
               or (fo.id is not null and v_doc_credor is not null and public._fn_fornecedor_chave_documento(fo.cpf_cnpj) = v_doc_credor)
               or (fo.nome_norm is not null and fo.nome_norm = any(v_alias_credor))) as m_credor,
             public._fn_numero_na_descricao(f.numero_contrato, regexp_replace(coalesce(l.descricao, ''), '\D', '', 'g')) as m_numero,
             public._fn_credor_na_descricao(f.credor_id, l.descricao) as m_nome,
             (v_busca is not null and (l.descricao ilike '%' || v_busca || '%' or fo.nome ilike '%' || v_busca || '%'
               or (v_num is not null and (round(abs(l.valor), 2) = v_num or trunc(abs(l.valor)) = v_num))
               or (length(coalesce(v_dig, '')) >= 4 and regexp_replace(coalesce(l.descricao, ''), '\D', '', 'g') like '%' || v_dig || '%'))) as m_busca,
             (l.status_transacao = 'conciliado' or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l.id and c.desfeito_em is null)) as extrato,
             l.financiamento_id
        from public.financeiro_lancamentos_v2 l
        left join public.financeiro_fornecedores fo on fo.id = l.favorecido_id
       where l.cliente_id = f.cliente_id and l.cancelado is not true and coalesce(l.tipo_operacao, '') like '2-%'
         and (v_busca is not null or coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) between v_de and v_ate)
         and not exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and not p.cancelada)
         -- os lancamentos das parcelas DESTE contrato sao dele: nao sao candidatos (o da propria parcela, menos ainda)
         and not exists (select 1 from public.financiamento_parcelas x where x.financiamento_id = f.id and x.status is distinct from 'cancelado'
                           and (x.lancamento_id = l.id or x.lancamento_juros_id = l.id)
                           and not exists (select 1 from public.financiamento_parcela_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null))
         and not exists (select 1 from public.financiamento_parcela_vinculos v where v.lancamento_id = l.id and v.parcela_id = q.id and v.desfeito_em is null)
    ), perto as (
      select b.*, a.papel, a.alvo, round(b.valor - a.alvo, 2) as diferenca,
             row_number() over (partition by b.id order by case when a.alvo > 0 then abs(b.valor - a.alvo) else 1e15 end,
                                case a.papel when 'total' then 0 when 'principal' then 1 else 2 end) as rn
        from base b join alvos a on (v_faixa = 'qualquer' or (a.alvo > 0 and abs(b.valor - a.alvo) <= a.alvo * 0.10))
       where (case when v_busca is not null then b.m_busca when v_todas then true else b.m_plano or b.m_credor or b.m_numero or b.m_nome end)
    ), pontuada as (
      select p.*, abs(p.dt - q.data_vencimento) as dias,
             (case when p.alvo = 0 then 0 when p.diferenca = 0 then 50 when abs(p.diferenca) <= p.alvo * 0.01 then 30
                   when abs(p.diferenca) <= p.alvo * 0.10 then 10 else 0 end) as v_pts,
             -- onde o lancamento ja' esta' (outro contrato, outra parcela, encargo)
             (select jsonb_build_object('tipo', 'parcela_vinculada', 'vinculo_id', v.id, 'financiamento_id', v.financiamento_id,
                       'numero_contrato', f2.numero_contrato, 'descricao', f2.descricao, 'parcela', x.numero_parcela, 'movivel', true)
                from public.financiamento_parcela_vinculos v join public.financiamentos f2 on f2.id = v.financiamento_id
                join public.financiamento_parcelas x on x.id = v.parcela_id
               where v.lancamento_id = p.id and v.desfeito_em is null) as em_vinculo,
             (select jsonb_build_object('tipo', 'encargo', 'encargo_id', e.id, 'financiamento_id', e.financiamento_id,
                       'numero_contrato', f2.numero_contrato, 'descricao', f2.descricao, 'parcela', null, 'movivel', true)
                from public.financiamento_encargos e join public.financiamentos f2 on f2.id = e.financiamento_id
               where e.lancamento_id = p.id and e.desfeito_em is null) as em_encargo,
             (select jsonb_build_object('tipo', 'parcela_do_contrato', 'financiamento_id', x.financiamento_id,
                       'numero_contrato', f2.numero_contrato, 'descricao', f2.descricao, 'parcela', x.numero_parcela, 'movivel', false)
                from public.financiamento_parcelas x join public.financiamentos f2 on f2.id = x.financiamento_id
               where x.financiamento_id <> f.id and x.status is distinct from 'cancelado' and (x.lancamento_id = p.id or x.lancamento_juros_id = p.id)
               limit 1) as em_parcela
        from perto p where p.rn = 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'lancamento_id', p.id, 'data', p.dt, 'valor', p.valor, 'descricao', p.descricao, 'status_transacao', p.status_transacao,
             'conta', (select coalesce(c.nome_exibicao, c.nome_conta) from public.financeiro_contas_bancarias c where c.id = p.conta_id),
             'favorecido', (select fo.nome from public.financeiro_fornecedores fo where fo.id = p.favorecido_id),
             'extrato', p.extrato, 'dias', p.dias, 'papel_sugerido', p.papel, 'previsto', p.alvo,
             'diferenca', case when p.alvo = 0 then null else p.diferenca end,
             'outro', coalesce(p.em_vinculo, p.em_encargo, p.em_parcela,
                        case when p.financiamento_id is not null and p.financiamento_id <> f.id then
                          (select jsonb_build_object('tipo', 'outro_contrato', 'financiamento_id', f2.id, 'numero_contrato', f2.numero_contrato,
                                    'descricao', f2.descricao, 'parcela', null, 'movivel', false)
                             from public.financiamentos f2 where f2.id = p.financiamento_id) end),
             'pontos', p.v_pts + (case when p.m_numero then 40 else 0 end) + (case when p.m_credor then 30 else 0 end)
                       + (case when p.m_plano then 20 else 0 end) + (case when p.m_nome then 15 else 0 end)
                       + (case when p.extrato then 5 else 0 end) - p.dias / 3,
             'motivos', to_jsonb(array_remove(array[
                 case when v_zerada then 'parcela sem valor — sugestão só por credor/data'
                      when p.alvo = 0 then null
                      when p.diferenca = 0 then 'valor = ' || case p.papel when 'total' then 'total' when 'principal' then 'principal' else 'juros' end
                      when abs(p.diferenca) <= p.alvo * 0.10 then 'valor próximo do ' || case p.papel when 'total' then 'total' when 'principal' then 'principal' else 'juros' end
                      else 'valor fora de ±10% do previsto' end,
                 case when p.m_busca then 'achado pela busca' end,
                 case when p.m_numero then 'nº do contrato na descrição' end,
                 case when p.m_credor then 'favorecido = credor' end,
                 case when p.m_plano then 'conta de amortização / juros' end,
                 case when p.m_nome then 'nome do credor na descrição' end,
                 case when p.extrato then 'casado com o extrato' end], null)))
           order by (case when v_zerada then 0 else p.v_pts + (case when p.m_numero then 40 else 0 end) + (case when p.m_credor then 30 else 0 end)
                    + (case when p.m_plano then 20 else 0 end) + (case when p.m_nome then 15 else 0 end)
                    + (case when p.extrato then 5 else 0 end) - p.dias / 3 end) desc, p.dias, p.id), '[]'::jsonb)
      into v_lin
      from (select * from pontuada order by dias limit 200) p;
    return jsonb_build_object('alvo', 'parcela', 'parcela', jsonb_build_object('id', q.id, 'numero', q.numero_parcela,
        'vencimento', q.data_vencimento, 'principal', q.valor_principal, 'juros', q.valor_juros,
        'total', round(coalesce(q.valor_principal, 0) + coalesce(q.valor_juros, 0), 2)),
      'de', v_de, 'ate', v_ate, 'linhas', v_lin,
      'busca', jsonb_build_object('faixa', v_faixa, 'de', v_de, 'ate', v_ate, 'texto', v_busca, 'todas', v_todas, 'sem_previsto', v_zerada));
  end if;
  raise exception using errcode = 'P0001', message = 'Alvo da busca inválido (liberacao ou parcela).';
end $function$;
REVOKE ALL ON FUNCTION public.fn_financiamento_candidatas(uuid, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financiamento_candidatas(uuid, text, uuid, jsonb) TO authenticated, service_role;
