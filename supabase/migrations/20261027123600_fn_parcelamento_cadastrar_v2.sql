-- fn_parcelamento_cadastrar GANHA numero_contrato, observacao E O SINAL POR PREFIXO. PAR-01b-v2.
--
-- ⚠ ARQUIVO NOVO, e a 20261027123500 NAO SE EDITA: ela registra o que esteve no banco entre
-- 18/09 e agora. Migration e' registro historico; corrigi-la no lugar apagaria o estado que de
-- fato existiu, e o historico deixaria de responder "o que estava rodando naquele dia".
--
-- MUDA TRES COISAS, e nada mais (conferido por diff dos dois corpos):
--
-- 1. `numero_contrato` e `observacao` entram no payload e vao para o pai. A tela de
--    Parcelamentos JA MOSTRA os dois campos e o caminho client-side JA OS GRAVAVA; sem eles no
--    payload, trocar o gravador pela RPC os apagaria em silencio — o operador digitaria o numero
--    do contrato e ele simplesmente nao estaria la depois de salvar. Achado na FASE 0 do PAR-01c.
--
-- 2. O SINAL DEIXA DE TER UM LADO PADRAO. Era
--        case when v_tipo_op = '1-Entradas' then '1' else '-1' end
--    — igualdade exata com UM rotulo, e todo o resto caindo em '-1'. Hoje isso funciona porque
--    '1-Entradas' e' o unico tipo '1-%' na base (4.897 linhas, conferido); no dia em que nascer
--    outro rotulo '1-...', o `else` gravaria '-1' e o CHECK `chk_sinal_coerente_tipo` abortaria a
--    transacao inteira — o parcelamento nao nasceria e a mensagem falaria de uma constraint.
--    Agora o sinal sai do PREFIXO ('1-' -> '1', '2-' -> '-1') e um rotulo fora dos dois e'
--    RECUSADO com mensagem propria, em vez de virar um sinal incoerente com o tipo.
--
-- ⚠ FALHAR ALTO EM VEZ DE ADIVINHAR: o `else` antigo tratava "nao sei que tipo e' este" como
--    "entao e' saida". As duas respostas custam o mesmo INSERT; so' uma diz a verdade.
--
-- ⚠ O QUE ESTA VERSAO NAO RESOLVE, e fica registrado: `conta_bancaria_id` continua sendo
--    gravado sem olhar a direcao. O CHECK `chk_conta_por_direcao` exige, para `tipo_operacao`
--    '1-%', que `conta_bancaria_id` seja NULO (a conta de uma ENTRADA mora em
--    `conta_destino_id` — a regra do PR-MESA-CONTA-ENTRADA-01, medida: 4.696 das 4.897 entradas
--    da base seguem-na). Um parcelamento de ENTRADA com conta informada ainda aborta. Nao morde
--    a tela de Parcelamentos, que e' sempre saida, e por isso nao entrou aqui — mas morde quem
--    chamar a RPC com '1-Entradas'.
--
-- Aplicada no proto pelo arquiteto em 18/09/2026; esta migration e REGISTRO HISTORICO, nao se
-- reaplica. Conferida contra o banco, nao contra a mensagem:
--   md5(prosrc)                    1e414d93db0def64d4b6a85409a2b0a2   (4.286 caracteres)
--   md5(pg_get_functiondef(oid))   4dfc348e8d5c5fd333e0ad0c685b0986
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
  v_num_contr   text := nullif(p_payload->>'numero_contrato','');
  v_obs         text := nullif(p_payload->>'observacao','');
  v_sinal       text;
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
  if v_tipo_op like '1-%' then
    v_sinal := '1';
  elsif v_tipo_op like '2-%' then
    v_sinal := '-1';
  else
    raise exception 'tipo_operacao invalido' using errcode='22023', message='tipo_operacao deve comecar com 1- ou 2-';
  end if;

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
     v_comp, v_comp, v_primeira, v_num_contr, v_obs, auth.uid())
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
