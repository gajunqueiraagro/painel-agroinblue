-- PR-ESTOQUE-VENDA-11 — as duas leituras passam a devolver o que a tela já precisava.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO.
--   Nao foi reaplicada. As duas sao SO LEITURA (`stable`), mesma assinatura, ACL preservada —
--   conferido em `pg_proc.proacl`: {postgres=X, service_role=X, authenticated=X} nas duas.
--
-- ⚠ CORPOS EXTRAIDOS DO BANCO, NAO DIGITADOS, conferidos por md5 do `pg_get_functiondef`:
--     fn_vendas_graos          9cfe959092eaa8f09067f7c508417301  (3.892 caracteres)
--     fn_estoque_graos_resumo  796012fb79f276204dfc9f74e5f59685  (2.756 caracteres)
--
-- ⚠⚠ ELAS FECHAM QUATRO BURACOS QUE O FRONT VINHA CONTORNANDO, e cada um tinha um custo
--   escrito na tela:
--
--   1. `corrigida_por` — a venda ANTIGA nao sabia que fora substituida. O `substitui_operacao_id`
--      era gravado desde o VENDA-09, mas so' na venda NOVA; ninguem conseguia ir do cancelado
--      para quem o corrigiu. Agora a antiga responde, e o historico pode dizer "Corrigida" em vez
--      de "Cancelada" — duas coisas que aconteceram por razoes diferentes.
--      ⚠ SO' CONTA SUBSTITUTA ATIVA (`x.ativo`), e a mais recente: corrigir duas vezes deixa uma
--        cadeia, e o que importa e' quem vale HOJE. Uma substituta que tambem foi cancelada nao
--        "corrige" ninguem — ela propria precisa de conserto.
--
--   2. `conta_id` por lancamento — `coalesce(conta_destino_id, conta_bancaria_id)`, que e' a
--      convencao do Financeiro (entrada grava destino, saida grava bancaria). Sem ele a correcao
--      reabria com TODAS as contas em branco e o rodape travado; o operador reescolhia de memoria,
--      e escolher errado era silencioso.
--
--   3. `numero_documento` / `tipo_documento`, no lancamento e na venda — a venda corrigida nascia
--      sem o papel da antiga. O do topo vem do PRIMEIRO lancamento de receita QUE TENHA documento
--      (`is not null`), nao do primeiro por vencimento: a parcela 1 pode nao ter e a 2 ter.
--
--   4. `entregue` e `recebido` por cultura no resumo — a visao "Todas" mostrava valor a mercado
--      onde a visao por cultura ja mostrava o vendido, e as duas telas respondiam perguntas
--      diferentes com o mesmo rotulo.
--
-- ⚠ O `recebido` DO RESUMO SOMA `agri_oc_entregas` DAS OPERACOES ATIVAS — a mesma fonte do
--   `recebido` de `fn_estoque_graos`, entao as duas telas nao podem divergir.
-- ⚠ E ELE HERDA UMA FORMA ANTIGA: `base` nasce de `colhido LEFT JOIN entregue`, entao uma classe
--   entregue que nunca foi colhida ficaria de fora da soma. Nao foi introduzido aqui e nao foi
--   mexido — e' a forma que a funcao ja tinha, registrada para quem for reduzir isso depois.

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
      'bruto', round(coalesce(o.valor_bruto,0),2), 'deducoes', round(coalesce(o.descontos,0),2), 'liquido', round(coalesce(o.valor_liquido,0),2),
      'senar', (select round(coalesce(sum(p.valor),0),2) from agri_oc_partes p where p.operacao_id = o.id and p.natureza = 'imposto'),
      'itens', (select coalesce(jsonb_agg(jsonb_build_object('classe', e.classe_aflatoxina, 'sacas', round(e.sacas,4), 'preco_saca', round(e.preco_saca,4), 'valor', round(e.valor,2)) order by e.classe_aflatoxina), '[]'::jsonb) from agri_oc_entregas e where e.operacao_id = o.id),
      'lancamento', (select jsonb_build_object('id', l.id, 'status', l.status_transacao, 'data_vencimento', l.data_vencimento, 'data_pagamento', l.data_pagamento, 'cancelado', l.cancelado)
                     from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id where p.operacao_id = o.id and p.natureza = 'receita_venda' order by l.data_vencimento limit 1),
      'lancamentos', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'natureza', p.natureza, 'descricao', l.descricao, 'valor', round(l.valor,2), 'sinal', l.sinal, 'status', l.status_transacao, 'data_vencimento', l.data_vencimento, 'data_pagamento', l.data_pagamento, 'conciliado', l.conciliado_em is not null, 'cancelado', l.cancelado, 'conta_id', coalesce(l.conta_destino_id, l.conta_bancaria_id), 'numero_documento', l.numero_documento, 'tipo_documento', l.tipo_documento) order by l.data_vencimento, p.natureza), '[]'::jsonb)
                      from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id where p.operacao_id = o.id),
      'substitui_operacao_id', o.substitui_operacao_id,
      'corrigida_por', (select x.id from agri_operacoes_comerciais x where x.substitui_operacao_id = o.id and x.ativo order by x.created_at desc limit 1),
      'numero_documento', (select l.numero_documento from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id where p.operacao_id = o.id and p.natureza = 'receita_venda' and l.numero_documento is not null order by l.data_vencimento limit 1),
      'tipo_documento', (select l.tipo_documento from agri_oc_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id where p.operacao_id = o.id and p.natureza = 'receita_venda' and l.numero_documento is not null order by l.data_vencimento limit 1),
      'autor', coalesce(p1.nome, ''), 'criado_em', o.created_at,
      'cancelado_em', o.cancelado_em, 'cancelado_por', coalesce(p2.nome, ''), 'motivo_cancelamento', o.motivo_cancelamento
    ) order by o.data_operacao desc, o.created_at desc), '[]'::jsonb)
  from agri_operacoes_comerciais o
  left join financeiro_fornecedores f on f.id = o.contraparte_fornecedor_id
  left join profiles p1 on p1.user_id = o.created_by
  left join profiles p2 on p2.user_id = o.cancelado_por
  where o.cliente_id = p_cliente and o.safra_id = p_safra_id and o.cultura = p_cultura and o.tipo_operacao = 'venda_grao';
$function$
;

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
    select o.cultura, e.classe_aflatoxina classe, sum(e.sacas) sc, sum(e.valor) recebido
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
      coalesce(en.sc,0) entregue, coalesce(en.recebido,0) recebido,
      greatest(coalesce(co.sc,0)-coalesce(en.sc,0)-coalesce(qb.sc,0),0) saldo,
      coalesce(m.preco_saca,0) preco
    from colhido co
    left join entregue en on en.cultura=co.cultura and en.classe=co.classe
    left join quebra qb on qb.cultura=co.cultura and qb.classe=co.classe
    left join mercado m on m.cultura=co.cultura and m.classe=co.classe
  ),
  por_cultura as (
    select cultura, round(sum(saldo),2) saldo, round(sum(colhido),2) colhido, round(sum(entregue),2) entregue, round(sum(recebido),2) recebido, round(sum(saldo*preco),2) valor
    from base group by cultura
  )
  select jsonb_agg(jsonb_build_object(
    'cultura', cu.cultura, 'saldo', coalesce(pc.saldo,0),
    'colhido', coalesce(pc.colhido,0), 'entregue', coalesce(pc.entregue,0), 'recebido', coalesce(pc.recebido,0), 'valor', coalesce(pc.valor,0)
  ) order by cu.cultura)
  into v_res from culturas cu left join por_cultura pc on pc.cultura=cu.cultura;
  return coalesce(v_res,'[]'::jsonb);
end $function$
;
