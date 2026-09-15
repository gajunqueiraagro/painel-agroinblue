-- PR-ESTOQUE-BALANCO-PLURIANUAL — o estoque de uma cultura ao longo das safras.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       7df70ea99aa836c9eb395907e6744224  (3.195 bytes)
--
-- O QUE ELA RESPONDE: uma linha por safra — inicial, producao, venda, barter, quebra, final — e
--   AS SACAS ENCADEIAM: o `final` de uma safra e' o `inicial` da proxima. E' o extrato do grao,
--   nao uma fotografia por safra.
--
-- ⚠⚠ O VALOR E' UM NUMERO SO' (`valor_mercado_total`), E NAO E' ESQUECIMENTO. Uma coluna de valor
--   por safra contaria o MESMO GRAO DUAS VEZES: as 3.219,64 sacas que sobraram da 23/24 entram no
--   `inicial` da 24/25 e seguem dentro do `final` dela; avaliar linha a linha e somar daria um
--   patrimonio que nao existe. As SACAS descrevem MOVIMENTO e por isso encadeiam; o VALOR descreve
--   INVENTARIO num instante — o de hoje — e por isso e' um so'.
--   REGRA PARA QUEM LER A TELA OU O PAYLOAD: nao somar as linhas em R$. Nao ha' o que somar.
--
-- ⚠⚠ E ELE NAO E' O MESMO NUMERO DO "ESTOQUE DE GRAOS", nem deveria ser. `fn_estoque_graos` e
--   `fn_estoque_graos_resumo` respondem POR SAFRA; aqui `colhido_cl` e `entregue_cl` NAO tem
--   filtro de safra — varrem a CULTURA inteira. Medido em 15/09/2026, amendoim:
--       balanco (todas as safras)   63.940,73 sc   R$ 5.191.298,60
--       estoque da 25/26            44.141,52 sc   R$ 3.694.571,40
--   Nao e' divergencia: sao duas perguntas. "Quanto sobrou da safra que estou olhando" e "quanto
--   tenho no armazem". Quem comparar os dois cartoes sem isto vai abrir um chamado.
--
-- ⚠ O `final` DO BALANCO NAO E' O `saldo` DO DETALHE, e o centavo volta por outra porta. O balanco
--   soma `sacas_boas+grao_roca_sacas` por SAFRA e subtrai as entregas da safra; o detalhe desce a
--   CLASSE e aplica `greatest(...,0)` em cada uma. Medido: a 23/24 fecha em 3.219,64 aqui e
--   3.219,65 la', porque a roca daquela safra tem 620,63 colhidos contra 620,64 entregues e o -0,01
--   entra no liquido do balanco. E' o mesmo centavo que a `20261014120000` registrou ter morrido
--   entre resumo e detalhe — ele nao morreu, mudou de vizinho.
--   ⚠ NO ACUMULADO ELE SOME: o `final` da ultima safra (63.940,73) bate EXATO com a soma por classe
--   do `valor_mercado_total` (63.940,73), porque nenhuma classe fica negativa no acumulado. A
--   diferenca so' aparece linha a linha.
--
-- ⚠ `venda` E `barter` SAO UMA LISTA BRANCA de `condicao_pagamento`, e ela so' e' segura porque o
--   BANCO fecha o dominio: `agri_operacoes_comerciais_condicao_pagamento_check` admite
--   exatamente {'dinheiro','barter'}. Um terceiro valor admitido no CHECK sem voltar aqui faria
--   aquelas entregas sumirem das DUAS colunas e o `final` subir calado — grao que saiu contado
--   como estoque. Medido hoje: so' 'barter' tem linhas (2 operacoes, 4 entregas, 17.521,99 sc);
--   'dinheiro' esta' zerado, e e' por isso que a coluna de vendas nasce toda em "—".
--
-- ⚠ `quebra` E' `0::numeric` LITERAL — a baixa por quebra e' a F2. A coluna existe para a tabela
--   nao mudar de forma quando ela chegar, e o zero de hoje e' verdade: nada foi baixado.
--
-- ⚠ A LISTA DE SAFRAS SAI DA AREA, NAO DA COLHEITA: `safras` parte de `agri_safra_area`, entao uma
--   safra com area cadastrada e nenhuma colheita APARECE, com producao zero e o estoque anterior
--   atravessando. Medido: o amendoim devolve QUATRO linhas, nao tres — a 26/27 entra com producao
--   0,00 e repete o final 63.940,73. E' resposta, nao ruido: o grao esta' la' enquanto nao sai.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: num banco novo a funcao nasce com EXECUTE para
--   PUBLIC por default-privilege global. Ela e' SECURITY DEFINER e le colheita, entrega e cotacao
--   de todo o cliente.
--   Medido no Proto em 15/09/2026: anon=false, authenticated=true, public=false.

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
      where e.cliente_id=p_cliente and o.cultura=p_cultura group by o.safra_id
    )
    select sf.codigo, round(coalesce(co.sc,0),2) producao, round(coalesce(sa.venda,0),2) venda,
      round(coalesce(sa.barter,0),2) barter, 0::numeric quebra
    from safras sf left join colhido co on co.safra_id=sf.id left join saidas sa on sa.safra_id=sf.id
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

revoke all on function public.fn_estoque_graos_balanco(uuid, text) from public;
grant execute on function public.fn_estoque_graos_balanco(uuid, text) to authenticated;
