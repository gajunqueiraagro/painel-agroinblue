-- O BANCO GANHA UM ESCRITOR DE NASCIMENTO DE PARCELAMENTO. PAR-01.
--
-- ⚠ ANTES DELA NAO HAVIA NENHUM, e essa e a razao da frente: o parcelamento comum nascia por
-- insercao client-side, do mesmo jeito solto que o `generateParcelas` cospe — sem pai em
-- `financiamentos`, com vencimento sem escalonar e o plano de conta so na primeira parcela. Nao
-- existia um lugar onde a regra do nascimento morasse, entao cada tela que quisesse criar um
-- parcelamento reinventaria a sua.
--
-- O QUE ELA GRAVA, numa transacao so: o pai em `financiamentos` com `natureza='parcelamento'`,
-- sem juros, sem entrada e sem captacao; e, por prestacao, o PAR lancamento + parcela. O
-- vencimento escalona de `intervalo_meses` em `intervalo_meses` a partir da primeira, a
-- competencia fica FIXA (a do contrato, nao a de cada parcela), cada parcela nasce 'pendente' e
-- cada lancamento nasce 'programado' com `data_pagamento` NULA.
--
-- ⚠ A ULTIMA PARCELA ABSORVE O ARREDONDAMENTO: as n-1 primeiras sao `round(total/n, 2)` e a
-- ultima e o resto. Sem isso R$ 100,00 em 3x somaria R$ 99,99 e o parcelamento nasceria sem
-- fechar com o proprio total.
--
-- ⚠ NAO HA CONVERSAO DE SINAL POR HEURISTICA: `v_sinal` sai de `tipo_operacao = '1-Entradas'`,
-- que e o unico tipo '1-%' que existe na base (4.897 linhas, conferido). O CHECK
-- `chk_sinal_coerente_tipo` cobra exatamente isso.
--
-- Aplicada no proto pelo arquiteto em 18/09/2026; esta migration e REGISTRO HISTORICO, nao se
-- reaplica. Conferida contra o banco, nao contra a mensagem:
--   md5(prosrc)                    2d098459a4ff46c449eddaeb0ef806c8   (3.929 caracteres)
--   md5(pg_get_functiondef(oid))   6e33c303a486096794deae0673ad4f85
--   proacl                         authenticated=X/postgres  (o grant abaixo ja esta no banco)

create or replace function public.fn_parcelamento_cadastrar(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_cliente     uuid := (p_payload->>'cliente_id')::uuid;
  v_fazenda     uuid := (p_payload->>'fazenda_id')::uuid;
  v_desc        text := p_payload->>'descricao';
  v_total_val   numeric := (p_payload->>'valor_total')::numeric;
  v_n           int  := (p_payload->>'total_parcelas')::int;
  v_primeira    date := (p_payload->>'data_primeira_parcela')::date;
  v_comp        date := (p_payload->>'data_competencia')::date;
  v_intervalo   int  := coalesce((p_payload->>'intervalo_meses')::int, 1);
  v_tipo_op     text := p_payload->>'tipo_operacao';
  v_plano       uuid := (p_payload->>'plano_conta_id')::uuid;
  v_safra       uuid := nullif(p_payload->>'safra_id','')::uuid;
  v_cultura     text := nullif(p_payload->>'cultura','');
  v_fase        text := nullif(p_payload->>'fase','');
  v_favorecido  uuid := nullif(p_payload->>'favorecido_id','')::uuid;
  v_forma       text := nullif(p_payload->>'forma_pagamento','');
  v_conta       uuid := nullif(p_payload->>'conta_bancaria_id','')::uuid;
  v_tipo_fin    text := p_payload->>'tipo_financiamento';
  v_sinal       text := case when v_tipo_op = '1-Entradas' then '1' else '-1' end;
  v_fin_id      uuid;
  v_lanc_id     uuid;
  v_val_base    numeric;
  v_val_i       numeric;
  v_venc        date;
  i             int;
begin
  if not (public.is_admin_agroinblue() or v_cliente = any(public.get_user_cliente_ids())) then
    raise exception 'sem acesso ao cliente' using errcode='42501', message='Sem acesso ao cliente informado';
  end if;
  if v_n < 1 or v_total_val is null or v_total_val <= 0 then
    raise exception 'parametros invalidos' using errcode='22023', message='total_parcelas e valor_total obrigatorios';
  end if;
  if v_plano is null or v_fazenda is null or v_primeira is null or v_comp is null then
    raise exception 'parametros invalidos' using errcode='22023', message='plano, fazenda, competencia e primeira parcela obrigatorios';
  end if;

  insert into public.financiamentos
    (cliente_id, fazenda_id, natureza, status, descricao, tipo_financiamento,
     valor_total, total_parcelas, taxa_juros, taxa_juros_mensal, valor_entrada,
     gerar_lancamento_captacao, plano_conta_captacao_id, lancamento_captacao_id,
     plano_conta_parcela_id, credor_id, conta_bancaria_id,
     data_inicio, data_contrato, data_primeira_parcela, created_by)
  values
    (v_cliente, v_fazenda, 'parcelamento', 'ativo', v_desc, v_tipo_fin,
     v_total_val, v_n, 0, 0, 0,
     false, null, null,
     v_plano, v_favorecido, v_conta,
     v_comp, v_comp, v_primeira, auth.uid())
  returning id into v_fin_id;

  v_val_base := round(v_total_val / v_n, 2);

  for i in 1..v_n loop
    v_venc := v_primeira + make_interval(months => (i-1) * v_intervalo);
    v_val_i := case when i = v_n then v_total_val - v_val_base * (v_n - 1) else v_val_base end;

    insert into public.financeiro_lancamentos_v2
      (cliente_id, fazenda_id, sinal, tipo_operacao, valor,
       descricao, data_competencia, data_vencimento, data_pagamento,
       status_transacao, cenario, cancelado, orfao_definitivo,
       origem_tipo, financiamento_id,
       plano_conta_id, safra_id, cultura, fase,
       favorecido_id, forma_pagamento, conta_bancaria_id, created_by)
    values
      (v_cliente, v_fazenda, v_sinal, v_tipo_op, v_val_i,
       v_desc || ' - Parcela ' || i || '/' || v_n, v_comp, v_venc, null,
       'programado', 'realizado', false, false,
       'parcela_principal', v_fin_id,
       v_plano, v_safra, v_cultura, v_fase,
       v_favorecido, v_forma, v_conta, auth.uid())
    returning id into v_lanc_id;

    insert into public.financiamento_parcelas
      (financiamento_id, cliente_id, numero_parcela, data_vencimento, data_pagamento,
       valor_principal, valor_juros, valor_total, status, lancamento_id)
    values
      (v_fin_id, v_cliente, i, v_venc, null,
       v_val_i, 0, v_val_i, 'pendente', v_lanc_id);
  end loop;

  return v_fin_id;
end
$function$;

grant execute on function public.fn_parcelamento_cadastrar(jsonb) to authenticated;
