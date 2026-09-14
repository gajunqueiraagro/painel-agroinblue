-- PR-PAINEL-SAFRA — fn_painel_rateio_detalhe: o detalhe de um rateio do painel.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. O arquivo e REGISTRO HISTORICO, para
--   que um banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       45f520dcc702c9c83d9a8f0747f65b5a  (4.049 bytes)
--   Redigitar de memoria e o jeito classico de versionar uma funcao que nunca esteve no banco.
--
-- O QUE ELA RESPONDE: dado um recorte do painel (`p_tipo` = 'natureza' | 'investimento' |
--   'admin' e `p_chave` = o centro de custo, o subcentro, ou nada no admin), devolve
--     { pool, direto_cultura,
--       fatias:      [{cultura, area_ha, peso, valor, atual}],
--       lancamentos: [{data, descricao, favorecido, valor, compartilhado}],
--       pct_agricultura }
--   `pool` e' o montante COMPARTILHADO (lancamento sem cultura) e `direto_cultura` o que ja' esta'
--   marcado na cultura; `fatias` mostra como o pool se reparte entre as culturas da safra por
--   peso de AREA PLANTADA, com `atual` marcando a cultura aberta na tela.
--
-- ⚠ `pct_agricultura` E' O PERCENTUAL EFETIVO, NAO O CADASTRADO — e a distincao importa. Ele e'
--   calculado como 100 * pool / bruto administrativo do periodo, nao lido de `agri_rateio_admin`.
--   O pool ja' vem somado ANO A ANO, cada ano multiplicado pelo percentual daquele ano; uma safra
--   que atravessa a virada (e elas atravessam: o periodo vem de `financeiro_safras.data_inicio`
--   ate' `data_fim`) com percentuais diferentes produz aqui a taxa MISTURADA. Quem comparar este
--   numero com o cadastro de um ano so' vai achar diferenca, e ela e' correta.
-- ⚠ E ELE E' NULL FORA DO ADMIN: os ramos 'natureza' e 'investimento' nao tocam `v_pct`, porque
--   nao ha' rateio em dois passos neles. Null ali e' ausencia declarada, nao zero.
--
-- ⚠ A AREA DA FATIA SO' CONTA `status='plantada'`: area em abertura ainda nao planta nada e nao
--   pode puxar rateio. Quem comparar o peso daqui com a area do cartao do topo — que soma TODAS
--   as areas ativas — vai achar diferenca numa safra com area em abertura, e ela e' correta.
--
-- ⚠ O RATEIO ADMINISTRATIVO ('admin') NAO LE A SAFRA, e por isso o ramo e' outro: o lancamento
--   administrativo tem `safra_id` nulo e entra por JANELA DE DATAS. Quatro macros ficam de fora
--   por nao serem custeio: Dividendos, Investimento na Fazenda, Saida Financeira e Transferencias
--   — e a MESMA lista de quatro governa o pool, o bruto e a lista de lancamentos, senao o
--   percentual efetivo sairia de duas peneiras diferentes.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant, como nas outras RPCs do painel: `create or
--   replace` preserva privilegios, mas num banco novo a funcao nasce com EXECUTE para PUBLIC por
--   default-privilege global. Ela e SECURITY DEFINER e le lancamentos de todo o cliente.
--   Medido no Proto: anon=false, authenticated=true.

CREATE OR REPLACE FUNCTION public.fn_painel_rateio_detalhe(p_cliente uuid, p_safra_id uuid, p_cultura text, p_tipo text, p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_pool numeric:=0; v_direto numeric:=0; v_bruto numeric:=0; v_pct numeric; v_fatias jsonb; v_lanc jsonb; v_ini date; v_fim date;
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
    select coalesce(jsonb_agg(jsonb_build_object('data',l.data_competencia,'descricao',l.descricao,'favorecido',coalesce(f.nome_favorecido,f.nome,'-'),'valor',l.valor,'compartilhado',true) order by l.data_competencia),'[]'::jsonb)
      into v_lanc from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id
      where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim;
  end if;
  with areas as (select cultura, sum(area_plantada_ha) ha from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada' group by cultura), tot as (select coalesce(sum(ha),0) t from areas)
  select coalesce(jsonb_agg(jsonb_build_object('cultura',cultura,'area_ha',ha,
      'peso',case when (select t from tot)>0 then round(100*ha/(select t from tot),1) else 0 end,
      'valor',case when (select t from tot)>0 then round(v_pool*ha/(select t from tot),2) else 0 end,
      'atual',(cultura=p_cultura)) order by ha desc),'[]'::jsonb) into v_fatias from areas;
  return jsonb_build_object('pool',round(v_pool,2),'direto_cultura',round(v_direto,2),'fatias',v_fatias,'lancamentos',coalesce(v_lanc,'[]'::jsonb),'pct_agricultura',v_pct);
end $function$;

revoke all on function public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text) from public;
grant execute on function public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text) to authenticated;
