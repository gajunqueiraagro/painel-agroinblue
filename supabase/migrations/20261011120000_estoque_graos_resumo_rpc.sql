-- PR-ESTOQUE-GRAOS — o resumo do estoque por CULTURA, para o filtro "Todas".
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       3335fa0c4021bd4e638f842f2e99c914  (1.265 bytes)
--
-- O QUE ELA RESPONDE: uma linha por cultura da safra — saldo em sacas e valor estimado — para a
--   tela mostrar de onde escolher antes de descer ao detalhe por classe.
--
-- ⚠ TODA CULTURA COM AREA APARECE, mesmo sem colheita: a lista parte de `agri_safra_area` e os
--   dois `left join` trazem zero em vez de sumir com a linha. Uma cultura plantada que nao
--   colheu tem estoque zero — e' resposta, nao ausencia, e ela precisa estar la' para o operador
--   saber que a tela a conhece.
--
-- ⚠⚠ ELA NAO APLICA A REGRA DO MEIO SACO, e `fn_estoque_graos` aplica — entao os dois podem
--   divergir por centavos de saca, POR CONSTRUCAO. Medido na 23/24 amendoim:
--       resumo   colhido 8.367,28 - entregue 5.147,64 = 3.219,64   (liquido de tudo)
--       detalhe  ate_20 3.219,65 + acima_20 0 + roca 0 = 3.219,65  (a roca da -0,01 e ZERA)
--   O centavo aparece porque a roca tem 620,63 colhidos contra 620,64 entregues: no detalhe a
--   tolerancia de meio saco zera aquela classe, no resumo os -0,01 entram no liquido. Clicar na
--   linha de "Todas" e cair no detalhe MUDA o numero na segunda casa. Nao e' defeito de nenhum
--   dos dois — e' o preco de arredondar por classe num lugar e no total no outro.
-- ⚠ O `greatest(...,0)` SEGURA O SALDO NEGATIVO no resumo, que e' o que impede aquele -0,01 de
--   virar um estoque negativo quando uma cultura so' tiver a roca.
--
-- ⚠ O VALOR E' ESTIMATIVA, e a tela precisa dizer isso: o preco e' a media ponderada de TODAS as
--   classes entregues daquela cultura, nao o preco da classe que sobrou. Uma cultura que entregou
--   so' roca a R$ 80 e guardou grao bom teria o saldo avaliado a R$ 80 — abaixo do que ele vale.
-- ⚠ E SEM ENTREGA NAO HA' PRECO: `coalesce(en.preco,0)` faz o valor sair ZERO, nao nulo. A tela
--   mostra "—" nesse caso, porque "R$ 0,00" ao lado de 44 mil sacas afirmaria que elas nao valem
--   nada — quando o que falta e' referencia de preco, nao valor.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default-privilege global. Ela e SECURITY
--   DEFINER e le colheita e entrega de todo o cliente.
--   Medido no Proto: anon=false, authenticated=true.

CREATE OR REPLACE FUNCTION public.fn_estoque_graos_resumo(p_cliente uuid, p_safra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_res jsonb;
begin
  with culturas as (select distinct a.cultura from agri_safra_area a where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.ativo and a.cultura is not null),
  colhido as (select a.cultura, sum(c.sacas_boas+c.grao_roca_sacas) sc from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo group by a.cultura),
  entregue as (select o.cultura, sum(e.sacas) sc, sum(e.sacas*e.preco_saca)/nullif(sum(e.sacas),0) preco from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id where o.safra_id=p_safra_id and e.cliente_id=p_cliente group by o.cultura)
  select jsonb_agg(jsonb_build_object('cultura',cu.cultura,'saldo',greatest(round(coalesce(co.sc,0)-coalesce(en.sc,0),2),0),'valor',round(greatest(coalesce(co.sc,0)-coalesce(en.sc,0),0)*coalesce(en.preco,0),2)) order by cu.cultura)
  into v_res from culturas cu left join colhido co using(cultura) left join entregue en using(cultura);
  return coalesce(v_res,'[]'::jsonb);
end $function$;

revoke all on function public.fn_estoque_graos_resumo(uuid, uuid) from public;
grant execute on function public.fn_estoque_graos_resumo(uuid, uuid) to authenticated;
