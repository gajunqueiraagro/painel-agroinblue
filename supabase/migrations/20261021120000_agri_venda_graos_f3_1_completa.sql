-- F3.1 — venda de graos completa: valor total, Senar/descontos, parcelas, substituicao de lancamentos manuais
-- Aplicada no proto pelo arquiteto em 15/09/2026 (GO do Gabriel). Este arquivo e REGISTRO: nao reaplicar.
-- Conferir por md5 (left(md5(pg_get_functiondef(oid)),8)):
--   fn_estoque_graos             0eda073c
--   agri_venda_graos_registrar   59d0b2dc
--   agri_venda_avulsa_cancelar   30b00de3
--   agri_venda_avulsa_editar     1600cf6e
--   fn_vendas_graos              221ad534
--
-- Por que: a venda avulsa gravava um lancamento so, sem Senar, com preco x sacas que nao fecha no
-- centavo com o documento da cooperativa. Passa a ser operacao comercial completa, como barter e OC:
-- bruto (por preco ou por valor total), deducoes (Senar e outros), liquido em N parcelas, cada
-- parcela um lancamento de receita bruta + um de deducao com caixa, para o Espelho casar a linha
-- do banco (liquido) com o par. Cancelar/editar passam a tratar todos os lancamentos da venda.
-- fn_estoque_graos ganha 'recebido' (soma do valor das entregas por classe) e preco_ref = valor/sacas.

CREATE OR REPLACE FUNCTION public.fn_estoque_graos(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_res jsonb;
begin
  with colhido as (
    select case when c.aflatoxina_ppb>20 then 'acima_20' else 'ate_20' end classe, sum(c.sacas_boas) sc
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo group by 1
    union all
    select 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo
  ),
  colh as (select classe, sum(sc) colhido from colhido group by 1),
  entregue as (
    select e.classe_aflatoxina classe, sum(e.sacas) entregue, sum(e.valor)/nullif(sum(e.sacas),0) preco, sum(e.valor) recebido
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente and o.cultura=p_cultura and o.ativo group by 1
  ),
  mercado as (
    select distinct on (classe_aflatoxina) classe_aflatoxina classe, preco_saca, data_referencia
    from agri_cotacao_graos where cliente_id=p_cliente and cultura=p_cultura
    order by classe_aflatoxina, data_referencia desc
  ),
  quebra as (
    select classe, sum(quantidade) quebra from agri_estoque_movimentacoes
    where cliente_id=p_cliente and safra_id=p_safra_id and cultura=p_cultura and tipo='quebra' and ativo group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'classe', classe, 'colhido', round(coalesce(colhido,0),2), 'entregue', round(coalesce(entregue,0),2), 'quebra', round(coalesce(quebra,0),2), 'recebido', round(coalesce(recebido,0),2),
    'saldo', case when abs(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0))<0.5 then 0 else round(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),2) end,
    'preco_ref', round(coalesce(preco,0),2),
    'valor', round(greatest(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),0)*coalesce(preco,0),2),
    'preco_mercado', round(coalesce(m.preco_saca,0),2),
    'data_mercado', m.data_referencia,
    'valor_mercado', round(greatest(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),0)*coalesce(m.preco_saca,0),2)
  ) order by classe) into v_res from colh full outer join entregue using(classe) left join quebra qb using(classe) left join mercado m using(classe);
  return coalesce(v_res,'[]'::jsonb);
end $function$;

create or replace function public.agri_venda_graos_registrar(
  p_cliente uuid, p_safra_id uuid, p_cultura text, p_fazenda_id uuid, p_comprador_id uuid,
  p_data date, p_itens jsonb, p_valor_bruto numeric, p_senar numeric, p_descontos jsonb,
  p_parcelas jsonb, p_observacoes text, p_substituir uuid[] default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare
  v_op uuid; v_bruto numeric; v_soma_itens numeric; v_fator numeric := 1;
  v_senar numeric := round(coalesce(p_senar,0),2); v_desc numeric := 0; v_ded numeric; v_liq numeric; v_soma_parc numeric;
  v_plano_rec uuid; v_subc_rec text; v_plano_ded uuid; v_macro_ded text; v_grupo_ded text; v_centro_ded text; v_subc_ded text;
  v_n int; i int; x jsonb; v_venc date; v_pago boolean; v_pag date; v_conta uuid; v_parc numeric;
  v_ded_i numeric; v_acum_ded numeric := 0; v_rec_i numeric; v_status text; v_lanc uuid; v_lancs uuid[] := '{}';
  v_todos_pagos boolean := true; v_algum_pago boolean := false; v_sub uuid; v_ult uuid; v_dif numeric;
  v_senar_i numeric; v_acum_senar numeric := 0; v_desc_i numeric;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'VENDA_SEM_ITENS'; end if;
  if p_parcelas is null or jsonb_array_length(p_parcelas) = 0 then raise exception 'VENDA_SEM_PARCELAS'; end if;
  if p_data is null then raise exception 'DATA_OBRIGATORIA'; end if;

  select coalesce(sum(round((y->>'sacas')::numeric * coalesce((y->>'preco')::numeric,0), 2)),0) into v_soma_itens from jsonb_array_elements(p_itens) y;
  if p_valor_bruto is not null then
    if v_soma_itens = 0 then
      -- sem preco informado: rateia o valor total pelas sacas
      select coalesce(sum((y->>'sacas')::numeric),0) into v_soma_itens from jsonb_array_elements(p_itens) y;
      if v_soma_itens = 0 then raise exception 'VALOR_TOTAL_SEM_SACAS'; end if;
      v_fator := round(p_valor_bruto,2) / v_soma_itens; -- fator = preco medio
    else
      v_fator := round(p_valor_bruto,2) / v_soma_itens;
    end if;
    v_bruto := round(p_valor_bruto,2);
  else
    if v_soma_itens = 0 then raise exception 'VENDA_SEM_PRECO_NEM_VALOR'; end if;
    v_bruto := v_soma_itens;
  end if;
  select coalesce(sum(round((y->>'valor')::numeric,2)),0) into v_desc from jsonb_array_elements(coalesce(p_descontos,'[]'::jsonb)) y;
  v_ded := round(v_senar + v_desc, 2);
  v_liq := round(v_bruto - v_ded, 2);
  if v_liq < 0 then raise exception 'LIQUIDO_NEGATIVO'; end if;
  select coalesce(sum(round((y->>'valor')::numeric,2)),0) into v_soma_parc from jsonb_array_elements(p_parcelas) y;
  if abs(v_soma_parc - v_liq) > 0.01 then raise exception 'PARCELAS_NAO_FECHAM_LIQUIDO: parcelas % x liquido %', v_soma_parc, v_liq; end if;

  select id, subcentro into v_plano_rec, v_subc_rec from financeiro_plano_contas where subcentro = 'Venda de '||initcap(p_cultura) and grupo_custo = 'Receita Agrícola' and cliente_id is null limit 1;
  if v_plano_rec is null then select id, subcentro into v_plano_rec, v_subc_rec from financeiro_plano_contas where subcentro = 'Venda de Outras Culturas' and grupo_custo = 'Receita Agrícola' and cliente_id is null limit 1; end if;
  select id, macro_custo, grupo_custo, centro_custo, subcentro into v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded from financeiro_plano_contas where subcentro = 'Impostos e Despesas de Vendas Agricultura' and cliente_id is null limit 1;
  if v_plano_ded is null then raise exception 'PLANO_DEDUCAO_AGRICULTURA_NAO_ENCONTRADO'; end if;

  -- substituir lancamentos manuais/importados (cancelamento logico, nunca conciliado)
  if p_substituir is not null then
    foreach v_sub in array p_substituir loop
      perform 1 from financeiro_lancamentos_v2 l where l.id = v_sub and l.cliente_id = p_cliente;
      if not found then raise exception 'SUBSTITUIR_LANCAMENTO_NAO_ENCONTRADO: %', v_sub; end if;
      perform 1 from financeiro_lancamentos_v2 l where l.id = v_sub and (l.cancelado or l.conciliado_em is not null);
      if found then raise exception 'SUBSTITUIR_LANCAMENTO_CANCELADO_OU_CONCILIADO: %', v_sub; end if;
    end loop;
  end if;

  insert into agri_operacoes_comerciais(cliente_id, fazenda_id, contraparte_fornecedor_id, tipo_operacao, cultura, safra_id, data_operacao, tipo_precificacao, condicao_pagamento, valor_bruto, descontos, valor_liquido, status_comercial, status_financeiro, observacoes, ativo, created_by)
  values (p_cliente, p_fazenda_id, p_comprador_id, 'venda_grao', p_cultura, p_safra_id, p_data, 'fixo', 'dinheiro', v_bruto, v_ded, v_liq, 'fechado', 'pendente', p_observacoes, true, auth.uid())
  returning id into v_op;

  -- entregas: valor por item (escalado se valor total), preco derivado a 4 casas
  if p_valor_bruto is not null and (select coalesce(sum(round((y->>'sacas')::numeric * coalesce((y->>'preco')::numeric,0), 2)),0) from jsonb_array_elements(p_itens) y) = 0 then
    insert into agri_oc_entregas(cliente_id, operacao_id, classe_aflatoxina, sacas, preco_saca, valor, created_by)
    select p_cliente, v_op, y->>'classe', (y->>'sacas')::numeric, round(v_fator, 4), round((y->>'sacas')::numeric * v_fator, 2), auth.uid()
    from jsonb_array_elements(p_itens) y;
  else
    insert into agri_oc_entregas(cliente_id, operacao_id, classe_aflatoxina, sacas, preco_saca, valor, created_by)
    select p_cliente, v_op, y->>'classe', (y->>'sacas')::numeric,
           round(round((y->>'sacas')::numeric * (y->>'preco')::numeric, 2) * v_fator / nullif((y->>'sacas')::numeric,0), 4),
           round(round((y->>'sacas')::numeric * (y->>'preco')::numeric, 2) * v_fator, 2), auth.uid()
    from jsonb_array_elements(p_itens) y;
  end if;
  -- centavos do escalonamento vao para a ultima linha
  select v_bruto - coalesce(sum(valor),0) into v_dif from agri_oc_entregas where operacao_id = v_op;
  if v_dif <> 0 then
    select id into v_ult from agri_oc_entregas where operacao_id = v_op order by classe_aflatoxina desc limit 1;
    update agri_oc_entregas set valor = valor + v_dif, preco_saca = round((valor + v_dif) / nullif(sacas,0), 4) where id = v_ult;
  end if;

  -- parcelas: receita bruta proporcional + deducoes proporcionais, ultima leva o residuo
  v_n := jsonb_array_length(p_parcelas);
  for i in 0 .. v_n - 1 loop
    x := p_parcelas -> i;
    v_venc := (x->>'vencimento')::date; v_parc := round((x->>'valor')::numeric, 2);
    v_pago := coalesce((x->>'pago')::boolean, false); v_pag := (x->>'data_pagamento')::date; v_conta := nullif(x->>'conta_id','')::uuid;
    if v_venc is null then raise exception 'PARCELA_SEM_VENCIMENTO'; end if;
    if v_pago and v_pag is null then v_pag := v_venc; end if;
    if v_pago then v_algum_pago := true; else v_todos_pagos := false; end if;
    if i < v_n - 1 then
      v_senar_i := round(v_senar * v_parc / nullif(v_liq,0), 2); v_desc_i := round(v_desc * v_parc / nullif(v_liq,0), 2);
      v_acum_senar := v_acum_senar + v_senar_i; v_acum_ded := v_acum_ded + v_desc_i;
    else
      v_senar_i := round(v_senar - v_acum_senar, 2); v_desc_i := round(v_desc - v_acum_ded, 2);
    end if;
    v_rec_i := round(v_parc + v_senar_i + v_desc_i, 2);
    v_status := case when v_pago then 'realizado' else 'programado' end;

    insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, created_by)
    values (v_rec_i, '1', '1-Entradas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:receita', 'agricultura', p_cultura, p_comprador_id, v_plano_rec, 'Receita Operacional', 'Receita Agrícola', 'Venda Produção', v_subc_rec, p_safra_id, p_fazenda_id, p_cliente,
            'Venda '||p_cultura||case when v_n > 1 then ' - parcela '||(i+1)||'/'||v_n else '' end, auth.uid())
    returning id into v_lanc;
    v_lancs := v_lancs || v_lanc;
    insert into agri_oc_partes(cliente_id, operacao_id, natureza, descricao, valor, data_vencimento, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, financeiro_lancamento_id, incluso_no_total, created_by)
    values (p_cliente, v_op, 'receita_venda', 'Venda '||p_cultura||' - parcela '||(i+1)||'/'||v_n, v_rec_i, v_venc, v_plano_rec, 'Receita Operacional', 'Receita Agrícola', 'Venda Produção', v_subc_rec, v_lanc, true, auth.uid());

    if v_senar_i > 0 then
      insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, created_by)
      values (v_senar_i, '-1', '2-Saídas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:imposto', 'agricultura', p_cultura, p_comprador_id, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, p_safra_id, p_fazenda_id, p_cliente,
              'Senar s/ venda '||p_cultura||case when v_n > 1 then ' - parcela '||(i+1)||'/'||v_n else '' end, auth.uid())
      returning id into v_lanc;
      v_lancs := v_lancs || v_lanc;
      insert into agri_oc_partes(cliente_id, operacao_id, natureza, descricao, valor, data_vencimento, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, financeiro_lancamento_id, incluso_no_total, created_by)
      values (p_cliente, v_op, 'imposto', 'Senar - parcela '||(i+1)||'/'||v_n, v_senar_i, v_venc, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, v_lanc, true, auth.uid());
    end if;
    if v_desc_i > 0 then
      insert into financeiro_lancamentos_v2(valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa, status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, created_by)
      values (v_desc_i, '-1', '2-Saídas', p_data, v_venc, case when v_pago then v_pag end, to_char(p_data,'YYYY-MM'), v_conta, false, v_status, 'venda_avulsa', 'venda_avulsa:desconto', 'agricultura', p_cultura, p_comprador_id, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, p_safra_id, p_fazenda_id, p_cliente,
              'Descontos s/ venda '||p_cultura||case when v_n > 1 then ' - parcela '||(i+1)||'/'||v_n else '' end, auth.uid())
      returning id into v_lanc;
      v_lancs := v_lancs || v_lanc;
      insert into agri_oc_partes(cliente_id, operacao_id, natureza, descricao, valor, data_vencimento, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, financeiro_lancamento_id, incluso_no_total, created_by)
      values (p_cliente, v_op, 'desconto', 'Descontos - parcela '||(i+1)||'/'||v_n, v_desc_i, v_venc, v_plano_ded, v_macro_ded, v_grupo_ded, v_centro_ded, v_subc_ded, v_lanc, true, auth.uid());
    end if;
  end loop;

  update agri_operacoes_comerciais set status_financeiro = case when v_todos_pagos then 'liquidado' when v_algum_pago then 'parcial' else 'pendente' end where id = v_op;

  if p_substituir is not null then
    update financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(),
      cancelado_motivo = 'Substituido pela venda de grao registrada no Estoque (operacao '||v_op||')', updated_at = now()
    where id = any(p_substituir);
  end if;

  return jsonb_build_object('ok', true, 'operacao_id', v_op, 'bruto', v_bruto, 'senar', v_senar, 'descontos', v_desc, 'liquido', v_liq, 'lancamentos', to_jsonb(v_lancs), 'substituidos', coalesce(array_length(p_substituir,1),0));
end $fn$;
revoke all on function public.agri_venda_graos_registrar(uuid,uuid,text,uuid,uuid,date,jsonb,numeric,numeric,jsonb,jsonb,text,uuid[]) from public, anon;
grant execute on function public.agri_venda_graos_registrar(uuid,uuid,text,uuid,uuid,date,jsonb,numeric,numeric,jsonb,jsonb,text,uuid[]) to authenticated;

create or replace function public.agri_venda_avulsa_cancelar(p_op_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare v_ativo boolean; v_cond text; v_pago boolean;
begin
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'CANCELAMENTO_SEM_MOTIVO'; end if;
  select ativo, condicao_pagamento into v_ativo, v_cond from agri_operacoes_comerciais where id = p_op_id and tipo_operacao = 'venda_grao';
  if v_ativo is null then raise exception 'VENDA_NAO_ENCONTRADA'; end if;
  if v_cond <> 'dinheiro' then raise exception 'VENDA_NAO_AVULSA_CANCELE_NO_BARTER'; end if;
  if not v_ativo then raise exception 'VENDA_JA_CANCELADA'; end if;
  select coalesce(bool_or(l.conciliado_em is not null), false) into v_pago
    from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
   where p.operacao_id = p_op_id and not l.cancelado;
  if v_pago then raise exception 'VENDA_JA_PAGA_CANCELE_NO_FINANCEIRO'; end if;
  update financeiro_lancamentos_v2 l set cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo), updated_at = now()
    from agri_oc_partes p where p.financeiro_lancamento_id = l.id and p.operacao_id = p_op_id and not l.cancelado;
  update agri_operacoes_comerciais
     set ativo = false, status_comercial = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo), updated_at = now(), updated_by = auth.uid()
   where id = p_op_id;
end $fn$;

create or replace function public.agri_venda_avulsa_editar(p_op_id uuid, p_data date, p_comprador_id uuid, p_observacoes text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare v_ativo boolean; v_cond text;
begin
  if p_data is null then raise exception 'DATA_OBRIGATORIA'; end if;
  select ativo, condicao_pagamento into v_ativo, v_cond from agri_operacoes_comerciais where id = p_op_id and tipo_operacao = 'venda_grao';
  if v_ativo is null then raise exception 'VENDA_NAO_ENCONTRADA'; end if;
  if v_cond <> 'dinheiro' then raise exception 'VENDA_NAO_AVULSA_EDITE_NO_BARTER'; end if;
  if not v_ativo then raise exception 'VENDA_CANCELADA_NAO_EDITA'; end if;
  update agri_operacoes_comerciais set data_operacao = p_data, contraparte_fornecedor_id = p_comprador_id, observacoes = p_observacoes, updated_at = now(), updated_by = auth.uid() where id = p_op_id;
  update financeiro_lancamentos_v2 l set data_competencia = p_data, ano_mes = to_char(p_data,'YYYY-MM'), favorecido_id = p_comprador_id, updated_at = now()
    from agri_oc_partes p where p.financeiro_lancamento_id = l.id and p.operacao_id = p_op_id and not l.cancelado and l.conciliado_em is null;
end $fn$;

create or replace function public.fn_vendas_graos(p_cliente uuid, p_safra_id uuid, p_cultura text)
returns jsonb language sql security definer set search_path to 'pg_catalog','public' stable as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'tipo', case when o.condicao_pagamento = 'barter' then 'barter' else 'venda_avulsa' end,
      'contrato_barter_id', o.contrato_barter_id,
      'data', o.data_operacao, 'comprador_id', o.contraparte_fornecedor_id, 'comprador', f.nome,
      'ativo', o.ativo, 'status_comercial', o.status_comercial, 'status_financeiro', o.status_financeiro,
      'observacoes', o.observacoes,
      'sacas', (select round(coalesce(sum(e.sacas),0), 4) from agri_oc_entregas e where e.operacao_id = o.id),
      'valor', (select round(coalesce(sum(e.valor),0), 2) from agri_oc_entregas e where e.operacao_id = o.id),
      'bruto', round(coalesce(o.valor_bruto,0),2), 'deducoes', round(coalesce(o.descontos,0),2), 'liquido', round(coalesce(o.valor_liquido,0),2),
      'senar', (select round(coalesce(sum(p.valor),0),2) from agri_oc_partes p where p.operacao_id = o.id and p.natureza = 'imposto'),
      'itens', (select coalesce(jsonb_agg(jsonb_build_object('classe', e.classe_aflatoxina, 'sacas', round(e.sacas,4), 'preco_saca', round(e.preco_saca,4), 'valor', round(e.valor,2)) order by e.classe_aflatoxina), '[]'::jsonb) from agri_oc_entregas e where e.operacao_id = o.id),
      'lancamento', (select jsonb_build_object('id', l.id, 'status', l.status_transacao, 'data_vencimento', l.data_vencimento, 'data_pagamento', l.data_pagamento, 'cancelado', l.cancelado)
                     from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id where p.operacao_id = o.id and p.natureza = 'receita_venda' order by l.data_vencimento limit 1),
      'lancamentos', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'natureza', p.natureza, 'descricao', l.descricao, 'valor', round(l.valor,2), 'sinal', l.sinal, 'status', l.status_transacao, 'data_vencimento', l.data_vencimento, 'data_pagamento', l.data_pagamento, 'conciliado', l.conciliado_em is not null, 'cancelado', l.cancelado) order by l.data_vencimento, p.natureza), '[]'::jsonb)
                      from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id where p.operacao_id = o.id),
      'autor', coalesce(p1.nome, ''), 'criado_em', o.created_at,
      'cancelado_em', o.cancelado_em, 'cancelado_por', coalesce(p2.nome, ''), 'motivo_cancelamento', o.motivo_cancelamento
    ) order by o.data_operacao desc, o.created_at desc), '[]'::jsonb)
  from agri_operacoes_comerciais o
  left join financeiro_fornecedores f on f.id = o.contraparte_fornecedor_id
  left join profiles p1 on p1.user_id = o.created_by
  left join profiles p2 on p2.user_id = o.cancelado_por
  where o.cliente_id = p_cliente and o.safra_id = p_safra_id and o.cultura = p_cultura and o.tipo_operacao = 'venda_grao';
$fn$;

-- correcao de dado: os 2 lancamentos de imposto do barter estavam sem plano (subcentro NULL), invisiveis nas deducoes do DRE
update financeiro_lancamentos_v2 l set plano_conta_id = pc.id, macro_custo = pc.macro_custo, grupo_custo = pc.grupo_custo, centro_custo = pc.centro_custo, subcentro = pc.subcentro, updated_at = now()
from financeiro_plano_contas pc
where pc.subcentro = 'Impostos e Despesas de Vendas Agricultura' and pc.cliente_id is null
  and l.origem_tipo = 'barter:imposto' and l.plano_conta_id is null and not l.cancelado;
