-- PR-ESTOQUE-VENDA-02 (F3) — historico, estorno e edicao da venda; entrega cancelada sai do saldo.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO.
--   Nao foi reaplicada.
-- ⚠ OS SETE CORPOS NAO FORAM REDIGITADOS, e vale dizer COMO cada um chegou aqui, porque metade
--   deles nao passou por transcricao nenhuma:
--     * `fn_estoque_graos`, `_resumo` e `_balanco` foram RECONSTRUIDOS a partir das versoes da F2
--       (ja verbatim no repo, migration 20261017120000) mais o unico delta desta fatia. Os tres
--       cresceram EXATAMENTE 12 bytes, e ` and o.ativo` tem 12 caracteres: a hipotese foi testada
--       aplicando o filtro na CTE `entregue`/`saidas` de cada uma e conferindo o md5. Os tres
--       bateram de primeira — entao o que esta aqui e' byte a byte o do banco, sem eu ter digitado
--       uma linha, e de quebra se sabe EXATAMENTE o que mudou.
--     * `agri_venda_avulsa_registrar` veio em DUAS METADES (1-1650 e 1651-fim), porque a
--       transcricao dele num bloco so' falhou duas vezes; o md5 julga a juncao.
--     * os outros tres vieram em base64 por funcao.
--   md5 (8 primeiros digitos) conferidos um a um:
--       ca3f3427  fn_estoque_graos             (2.556 bytes)
--       ce3b7453  fn_estoque_graos_resumo      (2.525 bytes)
--       093cbfeb  fn_estoque_graos_balanco     (3.462 bytes)
--       4a3c6940  agri_venda_avulsa_registrar  (3.271 bytes)
--       46519677  agri_venda_avulsa_cancelar   (1.693 bytes)
--       8ed32a02  agri_venda_avulsa_editar     (1.539 bytes)
--       6b150d25  fn_vendas_graos              (2.140 bytes)
--
-- ⚠⚠ O DELTA DAS TRES LEITURAS E' UMA CONDICAO SO': `and o.ativo` na juncao com
--   `agri_operacoes_comerciais`. E' o que faz uma venda CANCELADA devolver o grao ao saldo por
--   CONSTRUCAO — nao ha' estorno a escrever, ha' uma linha que deixa de ser contada. A mesma
--   forma da quebra (F2.1), onde `ativo=false` ja' bastava.
--
-- ⚠ CANCELAR A VENDA CANCELA O LANCAMENTO JUNTO, e essa e' a parte que sai do estoque e entra no
--   Financeiro: `agri_venda_avulsa_cancelar` acha o lancamento por `agri_oc_partes`
--   (natureza `receita_venda`) e o cancela logicamente. Sem isso, o grao voltaria ao estoque e a
--   receita continuaria no caixa — duas telas discordando sobre a mesma venda.
-- ⚠ E ELA RECUSA O QUE NAO PODE DESFAZER: `VENDA_JA_PAGA_CANCELE_NO_FINANCEIRO` quando o
--   lancamento esta' realizado com data de pagamento ou conciliado. Dinheiro que ja' entrou nao se
--   desfaz por aqui — quem manda nisso e' o Financeiro.
-- ⚠ E SO' A AVULSA: `VENDA_NAO_AVULSA_CANCELE_NO_BARTER` barra a operacao de condicao `barter`. O
--   barter tem contrato, insumos e conta de permuta; cancela-se la', com o que vem junto.
--
-- ⚠ A EDICAO SO' TOCA O DESCRITIVO — data, comprador e observacoes — e LEVA O LANCAMENTO JUNTO
--   (data_competencia e favorecido) SO' SE ele ainda nao foi pago. Sacas e preco nao se editam:
--   mudar a quantidade de uma venda gravada reescreveria saldo e receita do passado sem rastro.
--
-- ⚠ `agri_venda_avulsa_registrar` PASSOU A GRAVAR O ELO em `agri_oc_partes`, e e' ele que torna
--   tudo acima possivel: sem a parte, o cancelamento nao teria como achar o lancamento. Ela
--   tambem passou a devolver `{ok, operacao_id, lancamento_id, valor, status}` no lugar de so' o
--   valor.
-- ⚠ E O ARREDONDAMENTO E' POR ITEM, NAO NO TOTAL: `round(sacas*preco, 2)` linha a linha, e o
--   bruto e' a SOMA dos itens ja' arredondados. E' por isso que a tela pode mostrar o mesmo numero
--   que vai gravar — ela repete a conta, nao a aproxima.
--
-- ⚠ AS TRES COLUNAS DO ESTORNO sao nulaveis: so' existem depois do cancelamento.

-- ── AS TRES COLUNAS DO ESTORNO ───────────────────────────────────────────────────────────────
alter table public.agri_operacoes_comerciais
  add column if not exists cancelado_em timestamp with time zone,
  add column if not exists cancelado_por uuid,
  add column if not exists motivo_cancelamento text;

-- ── AS TRES LEITURAS DO ESTOQUE, agora ignorando operacao cancelada ─────────────────────────
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
    select e.classe_aflatoxina classe, sum(e.sacas) entregue, sum(e.sacas*e.preco_saca)/nullif(sum(e.sacas),0) preco
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
    'classe', classe, 'colhido', round(coalesce(colhido,0),2), 'entregue', round(coalesce(entregue,0),2), 'quebra', round(coalesce(quebra,0),2),
    'saldo', case when abs(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0))<0.5 then 0 else round(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),2) end,
    'preco_ref', round(coalesce(preco,0),2),
    'valor', round(greatest(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),0)*coalesce(preco,0),2),
    'preco_mercado', round(coalesce(m.preco_saca,0),2),
    'data_mercado', m.data_referencia,
    'valor_mercado', round(greatest(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),0)*coalesce(m.preco_saca,0),2)
  ) order by classe) into v_res from colh full outer join entregue using(classe) left join quebra qb using(classe) left join mercado m using(classe);
  return coalesce(v_res,'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_graos_resumo(p_cliente uuid, p_safra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_res jsonb;
begin
  with culturas as (
    select distinct a.cultura from agri_safra_area a
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.ativo and a.cultura is not null
  ),
  colhido as (
    select a.cultura, case when c.aflatoxina_ppb>20 then 'acima_20' else 'ate_20' end classe, sum(c.sacas_boas) sc
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo group by 1,2
    union all
    select a.cultura, 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo group by a.cultura
  ),
  entregue as (
    select o.cultura, e.classe_aflatoxina classe, sum(e.sacas) sc
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente and o.ativo group by 1,2
  ),
  mercado as (
    select distinct on (cultura, classe_aflatoxina) cultura, classe_aflatoxina classe, preco_saca
    from agri_cotacao_graos where cliente_id=p_cliente order by cultura, classe_aflatoxina, data_referencia desc
  ),
  quebra as (
    select cultura, classe, sum(quantidade) sc from agri_estoque_movimentacoes
    where cliente_id=p_cliente and safra_id=p_safra_id and tipo='quebra' and ativo group by 1,2
  ),
  base as (
    select co.cultura, co.classe,
      coalesce(co.sc,0) colhido,
      greatest(coalesce(co.sc,0)-coalesce(en.sc,0)-coalesce(qb.sc,0),0) saldo,
      coalesce(m.preco_saca,0) preco
    from colhido co
    left join entregue en on en.cultura=co.cultura and en.classe=co.classe
    left join quebra qb on qb.cultura=co.cultura and qb.classe=co.classe
    left join mercado m on m.cultura=co.cultura and m.classe=co.classe
  ),
  por_cultura as (
    select cultura, round(sum(saldo),2) saldo, round(sum(colhido),2) colhido, round(sum(saldo*preco),2) valor
    from base group by cultura
  )
  select jsonb_agg(jsonb_build_object(
    'cultura', cu.cultura, 'saldo', coalesce(pc.saldo,0),
    'colhido', coalesce(pc.colhido,0), 'valor', coalesce(pc.valor,0)
  ) order by cu.cultura)
  into v_res from culturas cu left join por_cultura pc on pc.cultura=cu.cultura;
  return coalesce(v_res,'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_graos_balanco(p_cliente uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_linhas jsonb:='[]'::jsonb; v_inicial numeric:=0; v_valor_total numeric; rec record;
begin
  for rec in
    with safras as (
      select distinct s.id, s.codigo, s.data_inicio
      from financeiro_safras s join agri_safra_area a on a.safra_id=s.id
      where s.cliente_id=p_cliente and a.cliente_id=p_cliente and a.cultura=p_cultura and a.ativo
    ),
    colhido as (
      select a.safra_id, sum(c.sacas_boas+c.grao_roca_sacas) sc
      from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
      where a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo group by a.safra_id
    ),
    saidas as (
      select o.safra_id,
        sum(e.sacas) filter (where o.condicao_pagamento='barter') barter,
        sum(e.sacas) filter (where o.condicao_pagamento='dinheiro') venda
      from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
      where e.cliente_id=p_cliente and o.cultura=p_cultura and o.ativo group by o.safra_id
    ),
    quebra as (
      select safra_id, sum(quantidade) sc from agri_estoque_movimentacoes
      where cliente_id=p_cliente and cultura=p_cultura and tipo='quebra' and ativo group by safra_id
    )
    select sf.codigo, round(coalesce(co.sc,0),2) producao, round(coalesce(sa.venda,0),2) venda,
      round(coalesce(sa.barter,0),2) barter, round(coalesce(qb.sc,0),2) quebra
    from safras sf left join colhido co on co.safra_id=sf.id left join saidas sa on sa.safra_id=sf.id left join quebra qb on qb.safra_id=sf.id
    order by sf.data_inicio, sf.codigo
  loop
    v_linhas := v_linhas || jsonb_build_object(
      'safra', rec.codigo, 'inicial', round(v_inicial,2), 'producao', rec.producao,
      'venda', rec.venda, 'barter', rec.barter, 'quebra', rec.quebra,
      'final', round(v_inicial + rec.producao - rec.venda - rec.barter - rec.quebra,2)
    );
    v_inicial := v_inicial + rec.producao - rec.venda - rec.barter - rec.quebra;
  end loop;

  with colhido_cl as (
    select case when c.aflatoxina_ppb>20 then 'acima_20' else 'ate_20' end classe, sum(c.sacas_boas) sc
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo group by 1
    union all
    select 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo
  ),
  colh as (select classe, sum(sc) sc from colhido_cl group by 1),
  entregue_cl as (
    select e.classe_aflatoxina classe, sum(e.sacas) sc from agri_oc_entregas e
    join agri_operacoes_comerciais o on o.id=e.operacao_id
    where e.cliente_id=p_cliente and o.cultura=p_cultura group by 1
  ),
  mercado as (
    select distinct on (classe_aflatoxina) classe_aflatoxina classe, preco_saca
    from agri_cotacao_graos where cliente_id=p_cliente and cultura=p_cultura
    order by classe_aflatoxina, data_referencia desc
  )
  select round(sum(greatest(coalesce(co.sc,0)-coalesce(en.sc,0),0)*coalesce(m.preco_saca,0)),2)
  into v_valor_total
  from colh co left join entregue_cl en using(classe) left join mercado m using(classe);

  return jsonb_build_object('linhas', v_linhas, 'valor_mercado_total', coalesce(v_valor_total,0));
end $function$;

-- ── A VENDA: registrar (com elo), cancelar, editar ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agri_venda_avulsa_registrar(p_cliente uuid, p_safra_id uuid, p_cultura text, p_fazenda_id uuid, p_comprador_id uuid, p_data date, p_condicao text, p_conta_id uuid, p_vencimento date, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_op uuid; v_lanc uuid; v_bruto numeric:=0; v_plano uuid; v_subc text; v_status text; v_venc date;
begin
  select coalesce(sum(round((it->>'sacas')::numeric*(it->>'preco')::numeric,2)),0) into v_bruto from jsonb_array_elements(p_itens) it;
  select id into v_plano from financeiro_plano_contas where subcentro='Venda de '||initcap(p_cultura) and grupo_custo='Receita Agrícola' limit 1;
  if v_plano is null then select id into v_plano from financeiro_plano_contas where subcentro='Venda de Outras Culturas' and grupo_custo='Receita Agrícola' limit 1; end if;
  select subcentro into v_subc from financeiro_plano_contas where id=v_plano;
  v_status := case when p_condicao='avista' then 'realizado' else 'programado' end;
  v_venc := case when p_condicao='avista' then p_data else coalesce(p_vencimento,p_data) end;
  insert into agri_operacoes_comerciais(cliente_id,fazenda_id,contraparte_fornecedor_id,tipo_operacao,cultura,safra_id,data_operacao,tipo_precificacao,condicao_pagamento,valor_bruto,descontos,valor_liquido,status_comercial,status_financeiro,ativo,created_by) values(p_cliente,p_fazenda_id,p_comprador_id,'venda_grao',p_cultura,p_safra_id,p_data,'fixo','dinheiro',v_bruto,0,v_bruto,'fechado',case when p_condicao='avista' then 'liquidado' else 'pendente' end,true,auth.uid()) returning id into v_op;
  insert into agri_oc_entregas(cliente_id,operacao_id,classe_aflatoxina,sacas,preco_saca,valor,created_by) select p_cliente,v_op,it->>'classe',(it->>'sacas')::numeric,(it->>'preco')::numeric,round((it->>'sacas')::numeric*(it->>'preco')::numeric,2),auth.uid() from jsonb_array_elements(p_itens) it;
  insert into financeiro_lancamentos_v2(valor,sinal,tipo_operacao,data_competencia,data_vencimento,data_pagamento,ano_mes,conta_bancaria_id,sem_movimentacao_caixa,status_transacao,origem_lancamento,origem_tipo,escopo_negocio,cultura,favorecido_id,plano_conta_id,macro_custo,grupo_custo,centro_custo,subcentro,safra_id,fazenda_id,cliente_id,descricao,created_by) values(v_bruto,'1','1-Entradas',p_data,v_venc,case when p_condicao='avista' then p_data else null end,to_char(p_data,'YYYY-MM'),p_conta_id,false,v_status,'venda_avulsa','venda_avulsa:receita','agricultura',p_cultura,p_comprador_id,v_plano,'Receita Operacional','Receita Agrícola','Venda Produção',v_subc,p_safra_id,p_fazenda_id,p_cliente,'Venda avulsa '||p_cultura,auth.uid()) returning id into v_lanc;
  insert into agri_oc_partes(cliente_id,operacao_id,natureza,descricao,valor,data_vencimento,plano_conta_id,macro_custo,grupo_custo,centro_custo,subcentro,financeiro_lancamento_id,incluso_no_total,created_by)
  values(p_cliente,v_op,'receita_venda','Venda avulsa '||p_cultura,round(v_bruto,2),v_venc,v_plano,'Receita Operacional','Receita Agrícola','Venda Produção',v_subc,v_lanc,true,auth.uid());
  return jsonb_build_object('ok',true,'operacao_id',v_op,'lancamento_id',v_lanc,'valor',round(v_bruto,2),'status',v_status);
end $function$;

CREATE OR REPLACE FUNCTION public.agri_venda_avulsa_cancelar(p_op_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_ativo boolean; v_cond text; v_cli uuid; v_lanc uuid; v_pago boolean;
begin
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'CANCELAMENTO_SEM_MOTIVO'; end if;
  select ativo, condicao_pagamento, cliente_id into v_ativo, v_cond, v_cli from agri_operacoes_comerciais where id = p_op_id and tipo_operacao = 'venda_grao';
  if v_ativo is null then raise exception 'VENDA_NAO_ENCONTRADA'; end if;
  if v_cond <> 'dinheiro' then raise exception 'VENDA_NAO_AVULSA_CANCELE_NO_BARTER'; end if;
  if not v_ativo then raise exception 'VENDA_JA_CANCELADA'; end if;
  select p.financeiro_lancamento_id into v_lanc from agri_oc_partes p where p.operacao_id = p_op_id and p.natureza = 'receita_venda' limit 1;
  if v_lanc is not null then
    select ((l.data_pagamento is not null and l.status_transacao = 'realizado') or l.conciliado_em is not null)
      into v_pago from financeiro_lancamentos_v2 l where l.id = v_lanc;
    if v_pago then raise exception 'VENDA_JA_PAGA_CANCELE_NO_FINANCEIRO'; end if;
    update financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo), updated_at = now()
     where id = v_lanc and not cancelado;
  end if;
  update agri_operacoes_comerciais
     set ativo = false, status_comercial = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo), updated_at = now(), updated_by = auth.uid()
   where id = p_op_id;
end $function$;

CREATE OR REPLACE FUNCTION public.agri_venda_avulsa_editar(p_op_id uuid, p_data date, p_comprador_id uuid, p_observacoes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_ativo boolean; v_cond text; v_lanc uuid; v_pago boolean;
begin
  if p_data is null then raise exception 'DATA_OBRIGATORIA'; end if;
  select ativo, condicao_pagamento into v_ativo, v_cond from agri_operacoes_comerciais where id = p_op_id and tipo_operacao = 'venda_grao';
  if v_ativo is null then raise exception 'VENDA_NAO_ENCONTRADA'; end if;
  if v_cond <> 'dinheiro' then raise exception 'VENDA_NAO_AVULSA_EDITE_NO_BARTER'; end if;
  if not v_ativo then raise exception 'VENDA_CANCELADA_NAO_EDITA'; end if;
  update agri_operacoes_comerciais set data_operacao = p_data, contraparte_fornecedor_id = p_comprador_id, observacoes = p_observacoes, updated_at = now(), updated_by = auth.uid() where id = p_op_id;
  select p.financeiro_lancamento_id into v_lanc from agri_oc_partes p where p.operacao_id = p_op_id and p.natureza = 'receita_venda' limit 1;
  if v_lanc is not null then
    select ((l.data_pagamento is not null and l.status_transacao = 'realizado') or l.conciliado_em is not null) into v_pago from financeiro_lancamentos_v2 l where l.id = v_lanc;
    if not coalesce(v_pago,false) then
      update financeiro_lancamentos_v2 set data_competencia = p_data, favorecido_id = p_comprador_id, updated_at = now() where id = v_lanc and not cancelado;
    end if;
  end if;
end $function$;

-- ── A LEITURA DO HISTORICO ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_vendas_graos(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'tipo', case when o.condicao_pagamento = 'barter' then 'barter' else 'venda_avulsa' end,
      'contrato_barter_id', o.contrato_barter_id,
      'data', o.data_operacao, 'comprador_id', o.contraparte_fornecedor_id, 'comprador', f.nome,
      'ativo', o.ativo, 'status_comercial', o.status_comercial, 'status_financeiro', o.status_financeiro,
      'observacoes', o.observacoes,
      'sacas', (select round(coalesce(sum(e.sacas),0), 4) from agri_oc_entregas e where e.operacao_id = o.id),
      'valor', (select round(coalesce(sum(e.valor),0), 2) from agri_oc_entregas e where e.operacao_id = o.id),
      'itens', (select coalesce(jsonb_agg(jsonb_build_object('classe', e.classe_aflatoxina, 'sacas', round(e.sacas,4), 'preco_saca', round(e.preco_saca,4), 'valor', round(e.valor,2)) order by e.classe_aflatoxina), '[]'::jsonb) from agri_oc_entregas e where e.operacao_id = o.id),
      'lancamento', (select jsonb_build_object('id', l.id, 'status', l.status_transacao, 'data_vencimento', l.data_vencimento, 'data_pagamento', l.data_pagamento, 'cancelado', l.cancelado)
                     from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id where p.operacao_id = o.id and p.natureza = 'receita_venda' limit 1),
      'autor', coalesce(p1.nome, ''), 'criado_em', o.created_at,
      'cancelado_em', o.cancelado_em, 'cancelado_por', coalesce(p2.nome, ''), 'motivo_cancelamento', o.motivo_cancelamento
    ) order by o.data_operacao desc, o.created_at desc), '[]'::jsonb)
  from agri_operacoes_comerciais o
  left join financeiro_fornecedores f on f.id = o.contraparte_fornecedor_id
  left join profiles p1 on p1.user_id = o.created_by
  left join profiles p2 on p2.user_id = o.cancelado_por
  where o.cliente_id = p_cliente and o.safra_id = p_safra_id and o.cultura = p_cultura and o.tipo_operacao = 'venda_grao';
$function$;

revoke all on function public.agri_venda_avulsa_cancelar(uuid, text) from public;
grant execute on function public.agri_venda_avulsa_cancelar(uuid, text) to authenticated;
revoke all on function public.agri_venda_avulsa_editar(uuid, date, uuid, text) from public;
grant execute on function public.agri_venda_avulsa_editar(uuid, date, uuid, text) to authenticated;
revoke all on function public.fn_vendas_graos(uuid, uuid, text) from public;
grant execute on function public.fn_vendas_graos(uuid, uuid, text) to authenticated;

-- ── O BACKFILL DO ELO ────────────────────────────────────────────────────────────────────────
-- ⚠ A VENDA 2c303683 NASCEU ANTES DO ELO, e sem ele o cancelamento dela nao acharia o lancamento
--   e6748297 — o grao voltaria ao estoque e a receita ficaria de pe'. O `not exists` faz a
--   insercao ser idempotente: ela ja' rodou no Proto, e num banco novo roda uma vez.
-- ⚠ OS UUIDS SAO OS LIDOS DO BANCO, nao os prefixos do briefing: a operacao e'
--   2c303683-0f5d-4181-932d-0259220e763f e o lancamento e6748297-cfb6-48fc-bcfb-630f14d21cdd.
--   A parte ja' existe no Proto (9ad2b2c0-4031-48a8-b5c7-c3fd47649897, valor 194.299,00); o
--   `not exists` e' o que faz esta linha ser registro aqui e criacao num banco novo.
insert into public.agri_oc_partes
  (cliente_id, operacao_id, natureza, descricao, valor, financeiro_lancamento_id, incluso_no_total)
select o.cliente_id, o.id, 'receita_venda', 'Venda avulsa ' || o.cultura, o.valor_bruto,
       'e6748297-cfb6-48fc-bcfb-630f14d21cdd'::uuid, true
from public.agri_operacoes_comerciais o
where o.id = '2c303683-0f5d-4181-932d-0259220e763f'::uuid
  and not exists (select 1 from public.agri_oc_partes p
                  where p.operacao_id = o.id and p.natureza = 'receita_venda');
