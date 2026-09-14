-- PR-ESTOQUE-GRAOS-F3 — a venda avulsa: tirar grao do estoque fora do barter.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       1eac600fd5991a8b99eefe2ca2ad12a5  (2.786 bytes)
-- ⚠ ARQUIVO REESCRITO ANTES DE SER COMMITADO: a primeira versao fixava o plano de contas em
--   'Venda de Amendoim' para qualquer cultura, e uma venda de mandioca entraria no DRE como
--   amendoim. O achado veio do relatorio de execucao e o arquiteto corrigiu a funcao; o md5
--   anterior (eaf9ca42...) esta obsoleto e nunca chegou ao historico.
--
-- O QUE ELA FAZ, em tres escritas na mesma transacao:
--   1. `agri_operacoes_comerciais` — a venda (tipo 'venda_grao', condicao 'dinheiro',
--      `contrato_barter_id` NULO: e' o que a distingue da perna de venda do barter);
--   2. `agri_oc_entregas` — uma linha por classe, expandindo `p_itens`
--      `[{classe, sacas, preco}]`;
--   3. `financeiro_lancamentos_v2` — a receita, na conta escolhida,
--      `origem_lancamento='venda_avulsa'`.
--
-- ⚠ O ESTOQUE BAIXA SOZINHO, e e' o ponto de desenho mais importante aqui: `fn_estoque_graos`
--   soma as entregas por `operacao_id -> agri_operacoes_comerciais`, e a venda avulsa E' uma
--   operacao comercial. Nao ha' tabela de movimento de estoque, nao ha' baixa a escrever e nao ha'
--   como o saldo divergir da venda — ele E' colhido menos entregue. Uma baixa explicita criaria
--   um segundo saldo para conciliar com o primeiro.
--
-- ⚠ O PLANO DE CONTAS SEGUE A CULTURA: `'Venda de ' || initcap(p_cultura)` dentro do grupo
--   'Receita Agricola', com fallback em 'Venda de Outras Culturas'. E o `subcentro` gravado no
--   lancamento e' LIDO DE VOLTA do plano encontrado (`v_subc`), nunca escrito a mao — assim o
--   texto do lancamento e o plano nunca discordam, inclusive quando o fallback entra.
-- ⚠ CONFERIDO QUE O MAPA FECHA, cultura por cultura. As seis da lista do app contra os planos
--   cadastrados no grupo 'Receita Agricola':
--     amendoim -> Venda de Amendoim    ✓     milho -> Venda de Milho     ✓
--     mandioca -> Venda de Mandioca    ✓     cana  -> Venda de Cana      ✓
--     soja     -> Venda de Soja        ✓     outras -> (sem plano proprio) -> FALLBACK
--   'outras' e' a unica que cai no fallback, e cai onde deve: 'Venda de Outras Culturas'.
-- ⚠ E O FALLBACK NAO E' DECORACAO: uma cultura nova no app sem plano cadastrado entraria ali em
--   vez de nascer sem plano nenhum. Se nem o fallback existir, `v_plano` fica NULO e o lancamento
--   nasce sem plano de contas, sem erro — e' o unico caminho silencioso que sobra.
-- ⚠ `initcap` SOBRE UMA CULTURA ACENTUADA precisaria do plano escrito igual; hoje nenhuma das
--   seis tem acento, entao o caso nao existe — mas existiria no dia em que uma tiver.
--
-- ⚠ OS TRES CONSTRAINTS, medidos em `pg_constraint` e nao supostos:
--     tipo_operacao        CHECK (tipo_operacao = 'venda_grao')          -- valor unico
--     status_financeiro    CHECK (IN ('pendente','parcial','liquidado')) -- NAO existe 'pago'
--     condicao_pagamento   CHECK (IN ('dinheiro','barter'))
--   A vista grava 'liquidado' + `status_transacao='realizado'` + data de pagamento; a prazo grava
--   'pendente' + 'programado' + pagamento NULO — compromisso a receber, nao caixa.
--
-- ⚠ `sem_movimentacao_caixa = false`, ao contrario do barter: aqui o dinheiro entra de verdade
--   numa conta bancaria. O barter nao passa por caixa; a venda avulsa passa.
--
-- ⚠ NAO HA' CONSTRAINT DE SALDO: nada no banco impede vender mais grao do que se tem. A defesa
--   e' a tela, que trava o botao — e por isso ela esta' escrita tambem no modal, para quem mexer
--   num dos dois saber que o outro nao cobre.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default-privilege global. Ela e SECURITY
--   DEFINER e ESCREVE — operacao, entregas e lancamento — em nome do cliente.
--   Medido no Proto: anon=false, authenticated=true.

CREATE OR REPLACE FUNCTION public.agri_venda_avulsa_registrar(p_cliente uuid, p_safra_id uuid, p_cultura text, p_fazenda_id uuid, p_comprador_id uuid, p_data date, p_condicao text, p_conta_id uuid, p_vencimento date, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_op uuid; v_bruto numeric:=0; v_plano uuid; v_subc text; v_status text; v_venc date;
begin
  select coalesce(sum((it->>'sacas')::numeric*(it->>'preco')::numeric),0) into v_bruto from jsonb_array_elements(p_itens) it;
  select id into v_plano from financeiro_plano_contas where subcentro='Venda de '||initcap(p_cultura) and grupo_custo='Receita Agrícola' limit 1;
  if v_plano is null then select id into v_plano from financeiro_plano_contas where subcentro='Venda de Outras Culturas' and grupo_custo='Receita Agrícola' limit 1; end if;
  select subcentro into v_subc from financeiro_plano_contas where id=v_plano;
  v_status := case when p_condicao='avista' then 'realizado' else 'programado' end;
  v_venc := case when p_condicao='avista' then p_data else coalesce(p_vencimento,p_data) end;
  insert into agri_operacoes_comerciais(cliente_id,fazenda_id,contraparte_fornecedor_id,tipo_operacao,cultura,safra_id,data_operacao,tipo_precificacao,condicao_pagamento,valor_bruto,descontos,valor_liquido,status_comercial,status_financeiro,ativo,created_by) values(p_cliente,p_fazenda_id,p_comprador_id,'venda_grao',p_cultura,p_safra_id,p_data,'fixo','dinheiro',v_bruto,0,v_bruto,'fechado',case when p_condicao='avista' then 'liquidado' else 'pendente' end,true,auth.uid()) returning id into v_op;
  insert into agri_oc_entregas(cliente_id,operacao_id,classe_aflatoxina,sacas,preco_saca,valor,created_by) select p_cliente,v_op,it->>'classe',(it->>'sacas')::numeric,(it->>'preco')::numeric,(it->>'sacas')::numeric*(it->>'preco')::numeric,auth.uid() from jsonb_array_elements(p_itens) it;
  insert into financeiro_lancamentos_v2(valor,sinal,tipo_operacao,data_competencia,data_vencimento,data_pagamento,ano_mes,conta_bancaria_id,sem_movimentacao_caixa,status_transacao,origem_lancamento,origem_tipo,escopo_negocio,cultura,favorecido_id,plano_conta_id,macro_custo,grupo_custo,centro_custo,subcentro,safra_id,fazenda_id,cliente_id,descricao,created_by) values(v_bruto,'1','1-Entradas',p_data,v_venc,case when p_condicao='avista' then p_data else null end,to_char(p_data,'YYYY-MM'),p_conta_id,false,v_status,'venda_avulsa','venda_avulsa:receita','agricultura',p_cultura,p_comprador_id,v_plano,'Receita Operacional','Receita Agrícola','Venda Produção',v_subc,p_safra_id,p_fazenda_id,p_cliente,'Venda avulsa '||p_cultura,auth.uid());
  return jsonb_build_object('ok',true,'operacao_id',v_op,'valor',round(v_bruto,2),'status',v_status);
end $function$;

revoke all on function public.agri_venda_avulsa_registrar(uuid, uuid, text, uuid, uuid, date, text, uuid, date, jsonb) from public;
grant execute on function public.agri_venda_avulsa_registrar(uuid, uuid, text, uuid, uuid, date, text, uuid, date, jsonb) to authenticated;
