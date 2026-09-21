-- O PARCELAMENTO VOLTA A GRAVAR: a checagem de acesso deixa de estourar em toda chamada.
--
-- ⚠ ELA NUNCA GRAVOU NADA. Medido no proto em 21/09/2026: `financiamentos` e
--   `financiamento_parcelas` tem ZERO linhas criadas desde 18/09, e a ultima e' de 08/09 — anterior
--   as migrations que puseram esta RPC no ar. Os dois botoes que a chamam estavam mortos desde o
--   primeiro dia:
--     src/components/financeiro-v2/LancamentoV2Dialog.tsx  (modal, "Criar N Parcelas")
--     src/hooks/useFinanciamentoCadastro.ts                (tela de Parcelamentos)
--
-- O DEFEITO, reproduzido com os dados de uma tentativa real (R$ 5.750,00 em 2 parcelas):
--     ERROR: 42809: op ANY/ALL (array) requires array on right side
--     QUERY:  not (public.is_admin_agroinblue() or v_cliente = any(public.get_user_cliente_ids()))
--     CONTEXT: PL/pgSQL function fn_parcelamento_cadastrar(jsonb) line 30 at IF
--   `get_user_cliente_ids` devolve `SETOF uuid`, e `= ANY(...)` exige um ARRAY do lado direito. O
--   erro e' de analise da expressao, nao de valor: ele estoura ANTES de qualquer dado ser lido, e
--   nem o `OR` com admin escapa — o Postgres prepara a expressao inteira antes de avaliar o
--   primeiro operando. Falhava para todo mundo, sempre.
--
-- ⚠ E NAO ERA A ARIDADE. `is_admin_agroinblue` e `get_user_cliente_ids` tem
--   `_user_id uuid DEFAULT auth.uid()`, entao chama-las sem argumento sempre foi valido.
--   (`pg_get_function_identity_arguments` OMITE defaults por definicao — ela serve para
--   identificar a funcao em DDL. Quem mostra o default e' `pg_get_function_arguments`.)
--   O `auth.uid()` explicito entrou por clareza, nao por necessidade.
--
-- A CORRECAO, uma linha:
--   -  if not (public.is_admin_agroinblue() or v_cliente = any(public.get_user_cliente_ids())) then
--   +  if not (public.is_admin_agroinblue(auth.uid()) or v_cliente in (select public.get_user_cliente_ids(auth.uid()))) then
--   `IN (SELECT ...)` e' o idioma correto para `SETOF`, e ja' e' o usado em
--   `agri_compromisso_alterar_programacao` (migration 20261027124000).
--
-- ⚠ ESTA MIGRATION PASSA A SER A QUE DESCREVE O BANCO, e isso precisa ficar dito: o corpo que
--   estava no ar (md5 1e414d93, 4286 chars) NAO correspondia a migration nenhuma —
--     20261027123500_fn_parcelamento_cadastrar.sql     -> corpo md5 43114b4d
--     20261027123600_fn_parcelamento_cadastrar_v2.sql  -> corpo md5 496456d5
--   Eram tres versoes diferentes, e a linha defeituosa estava nas tres. O texto abaixo foi lido de
--   `pg_get_functiondef` DEPOIS da correcao, nao redigitado: md5 do def 367aa849e900bd2a977c0f70ffd51f7f
--   (4505 chars), md5 do prosrc 6bf9d80bb515574614f7460b441375a9 (4311 chars).
--
-- ⚠ OS GRANTS NO RODAPE REPETEM O QUE JA' ESTA' LA', de proposito: `CREATE OR REPLACE` preserva a
--   ACL, mas quem rodar este arquivo num banco vazio precisa dela. O `REVOKE ... FROM PUBLIC` e'
--   no-op aqui (a funcao nao tem EXECUTE para PUBLIC) e e' a rede para o dia em que tiver — duas
--   funcoes desta casa ja' amanheceram com `=X/postgres` por um CREATE sem rodape.

CREATE OR REPLACE FUNCTION public.fn_parcelamento_cadastrar(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  if not (public.is_admin_agroinblue(auth.uid()) or v_cliente in (select public.get_user_cliente_ids(auth.uid()))) then
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
$function$
;

REVOKE ALL ON FUNCTION public.fn_parcelamento_cadastrar(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_cadastrar(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_cadastrar(jsonb) TO service_role;
