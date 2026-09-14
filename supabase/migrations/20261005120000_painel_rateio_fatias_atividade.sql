-- PR-RATEIO — fn_painel_rateio_detalhe ganha `fatias_atividade`: o PRIMEIRO passo do rateio.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ MIGRATION NOVA, nao reescrita da 20261004120000: aquela ja' foi commitada e o historico de
--   migrations e' um diario, nao um rascunho. Quem ler os dois arquivos ve' a funcao evoluir.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       a0c87d07d99d9757f8089d9a5a7e255f  (4.822 bytes)
--
-- O QUE MUDOU em relacao a 20261004120000 (tres linhas, conferidas no diff):
--   1. declara `v_fat_atv jsonb`;
--   2. no ramo 'admin', agrega o custo administrativo POR ATIVIDADE — pecuaria, agricultura,
--      silvicultura — cada ano multiplicado pelo percentual daquela atividade naquele ano;
--   3. devolve `fatias_atividade` no jsonb final.
--
-- ⚠ E' O PASSO QUE FALTAVA PARA A CONTA FECHAR NA TELA. O rateio administrativo tem DOIS passos:
--   admin -> atividade (este) e atividade -> cultura (o `fatias`, por area plantada). Ate' aqui
--   o modal so' conseguia mostrar o segundo, e o primeiro era um percentual solto na frase.
--
-- ⚠ AS ATIVIDADES SOMAM O BRUTO — mas por CADASTRO, nao por construcao. Medido no Proto: os sete
--   anos de `agri_rateio_admin` fecham em 100% (2023: pecuaria 80 + agricultura 15 + silvicultura
--   5; 2024-2027: 70/25/5; 2021-2022: pecuaria 100). NADA na funcao nem na tabela obriga isso —
--   um ano cadastrado com 90% deixaria 10% do custo administrativo fora de todas as fatias, e o
--   donut do primeiro passo somaria menos que o bruto sem dizer por que.
--
-- ⚠ O JOIN AQUI E' INTERNO e o do `pool` e' `left`, e a diferenca e' deliberada: o pool precisa
--   sobreviver a um ano sem cadastro (vira zero pelo `coalesce`), enquanto a lista de atividades
--   de um ano sem cadastro simplesmente nao tem atividade nenhuma para nomear.
--
-- ⚠ `fatias_atividade` E' NULL FORA DO ADMIN, como `pct_agricultura`: nos ramos 'natureza' e
--   'investimento' nao ha' rateio em dois passos, e a pergunta nao existe.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default-privilege global. Ela e SECURITY
--   DEFINER e le lancamentos de todo o cliente.
--   Medido no Proto: anon=false, authenticated=true.

CREATE OR REPLACE FUNCTION public.fn_painel_rateio_detalhe(p_cliente uuid, p_safra_id uuid, p_cultura text, p_tipo text, p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_pool numeric:=0; v_direto numeric:=0; v_bruto numeric:=0; v_pct numeric; v_fat_atv jsonb; v_fatias jsonb; v_lanc jsonb; v_ini date; v_fim date;
begin
  select data_inicio, data_fim into v_ini, v_fim from financeiro_safras where id=p_safra_id;
  if p_tipo in ('natureza','investimento') then
    with lc as (
      select l.data_competencia dt, l.descricao ds, coalesce(f.nome_favorecido,f.nome,'-') fav, l.valor vl, (l.cultura is null) comp
      from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false
        and (l.cultura is null or l.cultura=p_cultura)
        and ((p_tipo='natureza' and l.compoe_dre and l.tipo_operacao='2-Saídas' and coalesce(l.macro_custo,'') not ilike '%investimento%' and coalesce(l.centro_custo,'(sem)')=p_chave)
          or (p_tipo='investimento' and coalesce(l.macro_custo,'') ilike '%investimento%' and coalesce(l.subcentro,'(sem)')=p_chave)))
    select coalesce(sum(vl) filter (where comp),0), coalesce(sum(vl) filter (where not comp),0),
      coalesce(jsonb_agg(jsonb_build_object('data',dt,'descricao',ds,'favorecido',fav,'valor',vl,'compartilhado',comp) order by dt),'[]'::jsonb)
      into v_pool, v_direto, v_lanc from lc;
  elsif p_tipo='admin' then
    select coalesce(sum(a.total*coalesce(r.percentual,0)/100.0),0) into v_pool
      from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total
            from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false
              and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim group by 1) a
      left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade='agricultura';
    select coalesce(sum(l.valor),0) into v_bruto from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim;
    v_pct := round(100*v_pool/nullif(v_bruto,0),1);
    select coalesce(jsonb_agg(jsonb_build_object('atividade', atividade, 'valor', round(valor,2)) order by valor desc),'[]'::jsonb) into v_fat_atv from (select r.atividade, sum(a.total*coalesce(r.percentual,0)/100.0) valor from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim group by 1) a join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano group by r.atividade) t;
    select coalesce(jsonb_agg(jsonb_build_object('data',l.data_competencia,'descricao',l.descricao,'favorecido',coalesce(f.nome_favorecido,f.nome,'-'),'valor',l.valor,'compartilhado',true) order by l.data_competencia),'[]'::jsonb)
      into v_lanc from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id
      where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim;
  end if;
  with areas as (select cultura, sum(area_plantada_ha) ha from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada' group by cultura), tot as (select coalesce(sum(ha),0) t from areas)
  select coalesce(jsonb_agg(jsonb_build_object('cultura',cultura,'area_ha',ha,
      'peso',case when (select t from tot)>0 then round(100*ha/(select t from tot),1) else 0 end,
      'valor',case when (select t from tot)>0 then round(v_pool*ha/(select t from tot),2) else 0 end,
      'atual',(cultura=p_cultura)) order by ha desc),'[]'::jsonb) into v_fatias from areas;
  return jsonb_build_object('pool',round(v_pool,2),'direto_cultura',round(v_direto,2),'fatias',v_fatias,'lancamentos',coalesce(v_lanc,'[]'::jsonb),'pct_agricultura',v_pct,'fatias_atividade',v_fat_atv);
end $function$;

revoke all on function public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text) from public;
grant execute on function public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text) to authenticated;
