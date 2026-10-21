-- FIN-NOTA-PDF-01b (Gabriel, 21/10/2026) — "Atualizar e parcelar": o lancamento a' vista que ja' existe (criado do extrato, da planilha,
-- a' mao) vira a PARCELA 1/N do parcelamento da nota, MANTENDO o id (e com ele a conciliacao, os documentos e a trilha), e nascem as
-- parcelas 2..N. As parcelas 2..N e o contrato nascem EXATAMENTE como no `fn_parcelamento_cadastrar` (mesmas colunas, mesma descricao
-- pelo `_fn_parcela_descricao`, mesmo status); a diferenca e' so' a parcela 1, que e' o lancamento existente.
--   · lancamento ABERTO: recebe o valor, o vencimento e a classificacao da parcela 1;
--   · lancamento PAGO (realizado/conciliado ou com data de pagamento): valor, vencimento, pagamento, status e conta FICAM (o principio
--     da conciliacao). Se o valor dele difere da parcela 1, recusa com a diferenca em R$ escrita — a tela ja' oferece repartir o resto
--     da nota nas demais (a lista de parcelas que chega aqui traz a parcela 1 = o valor pago). Nunca so' recusa: a frase diz o que fazer.
-- `p_payload` = o payload do `fn_parcelamento_cadastrar` COM a lista `parcelas` (sempre explicita: N >= 2). `p_simular` desfaz tudo.
-- Guarda: o cliente do LANCAMENTO (`tenant_ok`, 42501). Exposta a `authenticated` (a tela chama), REVOKE de PUBLIC/anon.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_parcelamento_a_partir_do_lancamento(p_lancamento uuid, p_payload jsonb, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare
  l             public.financeiro_lancamentos_v2%rowtype;
  v_cliente     uuid := (p_payload->>'cliente_id')::uuid;
  v_fazenda     uuid := (p_payload->>'fazenda_id')::uuid;
  v_desc        text := p_payload->>'descricao';
  v_total_val   numeric := (p_payload->>'valor_total')::numeric;
  v_comp        date := (p_payload->>'data_competencia')::date;
  v_tipo_op     text := p_payload->>'tipo_operacao';
  v_plano       uuid := (p_payload->>'plano_conta_id')::uuid;
  v_safra       uuid := nullif(p_payload->>'safra_id','')::uuid;
  v_cultura     text := nullif(p_payload->>'cultura','');
  v_fase        text := nullif(p_payload->>'fase','');
  v_favorecido  uuid := nullif(p_payload->>'favorecido_id','')::uuid;
  v_forma       text := nullif(p_payload->>'forma_pagamento','');
  v_conta       uuid := nullif(p_payload->>'conta_bancaria_id','')::uuid;
  v_tipo_fin    text := p_payload->>'tipo_financiamento';
  v_parc        jsonb := p_payload->'parcelas';
  v_n           int;
  v_soma_cent   bigint;
  v_val1        numeric;
  v_venc1       date;
  v_pago        boolean;
  v_fin_id      uuid;
  v_parc1_id    uuid;
  v_lanc_id     uuid;
  v_venc        date;
  v_val_i       numeric;
  v_ret         jsonb;
  i             int;
  br            constant text := ',.';
begin
  select * into l from public.financeiro_lancamentos_v2 where id = p_lancamento for update;
  if not found then raise exception using errcode = 'P0001', message = 'Lançamento não encontrado. Nada foi gravado.'; end if;
  if not coalesce(public.tenant_ok(l.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if v_cliente is distinct from l.cliente_id then raise exception using errcode = 'P0001', message = 'O lançamento é de outro cliente. Nada foi gravado.'; end if;
  if l.cancelado then raise exception using errcode = 'P0001', message = 'O lançamento está cancelado. Nada foi gravado.'; end if;
  if l.financiamento_id is not null then
    raise exception using errcode = 'P0001', message = 'O lançamento já é parcela de um parcelamento: use "Atualizar este" (anexa a nota às parcelas). Nada foi gravado.';
  end if;
  if l.cenario is distinct from 'realizado' then raise exception using errcode = 'P0001', message = 'Lançamento de Meta não vira parcela. Nada foi gravado.'; end if;
  if l.sinal is distinct from '-1' or v_tipo_op not like '2-%' then
    raise exception using errcode = 'P0001', message = 'Só um lançamento de saída vira parcela de compra. Nada foi gravado.';
  end if;
  if l.origem_tipo is not null then
    raise exception using errcode = 'P0001', message = format('Lançamento gerado pelo sistema (%s): não vira parcela. Nada foi gravado.', l.origem_tipo);
  end if;
  if exists (select 1 from public.zoo_operacao_partes z where z.financeiro_lancamento_id = l.id and z.cancelada = false) then
    raise exception using errcode = 'P0001', message = 'O lançamento é de uma operação comercial: parcele pela operação. Nada foi gravado.';
  end if;

  /* A LISTA, sempre explicita, com as regras do `fn_parcelamento_cadastrar` (PARC-LIVRES-01) */
  if v_parc is null or jsonb_typeof(v_parc) <> 'array' or jsonb_array_length(v_parc) < 2 then
    raise exception using errcode = '22023', message = 'Informe as parcelas da nota (duas ou mais). Nada foi gravado.';
  end if;
  v_n := jsonb_array_length(v_parc);
  if exists (select 1 from jsonb_array_elements(v_parc) e where coalesce(e->>'numero','') !~ '^[0-9]+$')
     or (select array_agg((e->>'numero')::int order by (e->>'numero')::int) from jsonb_array_elements(v_parc) e)
        is distinct from (select array_agg(g) from generate_series(1, v_n) g) then
    raise exception using errcode = '22023', message = format('A numeração das parcelas tem de ir de 1 a %s, sem repetir nem pular.', v_n);
  end if;
  if exists (select 1 from jsonb_array_elements(v_parc) e where coalesce(e->>'data_vencimento','') = '') then
    raise exception using errcode = '22023', message = 'Há parcela sem data de vencimento.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_parc) e where coalesce(e->>'valor','') = '' or (e->>'valor')::numeric <= 0
             or (e->>'valor')::numeric <> round((e->>'valor')::numeric, 2)) then
    raise exception using errcode = '22023', message = 'Há parcela com valor zero, negativo ou com mais de duas casas.';
  end if;
  select sum(round((e->>'valor')::numeric * 100))::bigint into v_soma_cent from jsonb_array_elements(v_parc) e;
  if v_total_val is null or v_soma_cent <> round(v_total_val * 100)::bigint then
    raise exception using errcode = '22023', message = format('A soma das parcelas (R$ %s) não fecha com o valor da nota (R$ %s). Nada foi gravado.',
      translate(to_char(v_soma_cent / 100.0, 'FM999,999,999,990.00'), br, '.,'), translate(to_char(coalesce(v_total_val, 0), 'FM999,999,999,990.00'), br, '.,'));
  end if;
  if v_plano is null or v_fazenda is null or v_comp is null then
    raise exception using errcode = '22023', message = 'Informe a classificação, a fazenda e a competência.';
  end if;
  select (e->>'valor')::numeric, (e->>'data_vencimento')::date into v_val1, v_venc1 from jsonb_array_elements(v_parc) e where (e->>'numero')::int = 1;

  /* O PRINCIPIO DA CONCILIACAO: o que o banco ja' pagou nao muda de valor */
  v_pago := l.status_transacao in ('realizado', 'conciliado') or l.data_pagamento is not null;
  if v_pago and l.valor <> v_val1 then
    raise exception using errcode = 'P0001',
      message = format('O lançamento já está pago com R$ %s e a parcela 1 seria R$ %s (diferença R$ %s): o valor pago não muda. Reparta o resto da nota nas demais parcelas. Nada foi gravado.',
        translate(to_char(l.valor, 'FM999,999,999,990.00'), br, '.,'), translate(to_char(v_val1, 'FM999,999,999,990.00'), br, '.,'),
        translate(to_char(abs(l.valor - v_val1), 'FM999,999,999,990.00'), br, '.,')),
      hint = jsonb_build_object('valor_lancamento', l.valor, 'valor_parcela1', v_val1, 'diferenca', l.valor - v_val1)::text;
  end if;

  begin
    insert into public.financiamentos
      (cliente_id, fazenda_id, natureza, status, descricao, tipo_financiamento,
       valor_total, total_parcelas, taxa_juros, taxa_juros_mensal, valor_entrada,
       gerar_lancamento_captacao, plano_conta_captacao_id, lancamento_captacao_id,
       plano_conta_parcela_id, credor_id, conta_bancaria_id,
       data_inicio, data_contrato, data_primeira_parcela, numero_contrato, observacao, created_by)
    values
      (v_cliente, v_fazenda, 'parcelamento', 'ativo', v_desc, v_tipo_fin,
       v_total_val, v_n, 0, 0, 0,
       false, null, null,
       v_plano, v_favorecido, v_conta,
       v_comp, v_comp, v_venc1, null, null, auth.uid())
    returning id into v_fin_id;

    /* A PARCELA 1 E' O LANCAMENTO QUE EXISTE: o id fica. Aberto recebe valor e vencimento; pago, nao (nem status, pagamento ou conta). */
    update public.financeiro_lancamentos_v2
       set valor = case when v_pago then valor else v_val1 end,
           data_vencimento = case when v_pago then data_vencimento else v_venc1 end,
           data_competencia = case when v_pago then data_competencia else v_comp end,
           descricao = public._fn_parcela_descricao(v_desc, 1, v_n),
           financiamento_id = v_fin_id, origem_tipo = 'parcela_principal',
           fazenda_id = v_fazenda, plano_conta_id = v_plano, safra_id = v_safra, cultura = v_cultura, fase = v_fase,
           favorecido_id = v_favorecido, forma_pagamento = coalesce(v_forma, forma_pagamento),
           conta_bancaria_id = case when v_pago then conta_bancaria_id else coalesce(v_conta, conta_bancaria_id) end
     where id = p_lancamento;
    insert into public.financiamento_parcelas
      (financiamento_id, cliente_id, numero_parcela, data_vencimento, data_pagamento, valor_principal, valor_juros, valor_total, status, lancamento_id)
    values (v_fin_id, v_cliente, 1, v_venc1, null, v_val1, 0, v_val1, 'pendente', p_lancamento)
    returning id into v_parc1_id;
    perform public._fn_parcela_status_alinhar(v_parc1_id, null);

    /* AS PARCELAS 2..N: como no `fn_parcelamento_cadastrar` */
    for i in 2..v_n loop
      select (e->>'data_vencimento')::date, (e->>'valor')::numeric into v_venc, v_val_i from jsonb_array_elements(v_parc) e where (e->>'numero')::int = i;
      insert into public.financeiro_lancamentos_v2
        (cliente_id, fazenda_id, sinal, tipo_operacao, valor,
         descricao, data_competencia, data_vencimento, data_pagamento,
         status_transacao, cenario, cancelado, orfao_definitivo,
         origem_tipo, financiamento_id,
         plano_conta_id, safra_id, cultura, fase,
         favorecido_id, forma_pagamento, conta_bancaria_id, created_by)
      values
        (v_cliente, v_fazenda, '-1', v_tipo_op, v_val_i,
         public._fn_parcela_descricao(v_desc, i, v_n), v_comp, v_venc, null,
         'programado', 'realizado', false, false,
         'parcela_principal', v_fin_id,
         v_plano, v_safra, v_cultura, v_fase,
         v_favorecido, v_forma, v_conta, auth.uid())
      returning id into v_lanc_id;
      insert into public.financiamento_parcelas
        (financiamento_id, cliente_id, numero_parcela, data_vencimento, data_pagamento, valor_principal, valor_juros, valor_total, status, lancamento_id)
      values (v_fin_id, v_cliente, i, v_venc, null, v_val_i, 0, v_val_i, 'pendente', v_lanc_id);
    end loop;
    perform public._fn_financiamento_status_pelas_parcelas(v_fin_id);

    v_ret := jsonb_build_object('financiamento_id', v_fin_id, 'lancamento_id', p_lancamento, 'parcelas', v_n, 'novas', v_n - 1,
      'pago', v_pago, 'simulado', p_simular);
    if p_simular then raise exception using errcode = 'PESIM', message = v_ret::text; end if;
  exception when sqlstate 'PESIM' then
    v_ret := sqlerrm::jsonb || jsonb_build_object('financiamento_id', null);
  end;
  return v_ret;
end
$f$;

REVOKE ALL ON FUNCTION public.fn_parcelamento_a_partir_do_lancamento(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_a_partir_do_lancamento(uuid, jsonb, boolean) TO authenticated, service_role;
