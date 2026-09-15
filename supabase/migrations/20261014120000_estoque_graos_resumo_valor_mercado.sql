-- PR-ESTOQUE-RESUMO-VALOR-MERCADO — o resumo por cultura passa a valer A MERCADO.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       fdfcc460c71ee3cd4b222403ee7299d4  (2.181 bytes)
--   O md5 anterior, 3335fa0c4021bd4e638f842f2e99c914, esta' OBSOLETO. A migration que o
--   versionou — `20261011120000_estoque_graos_resumo_rpc.sql` — FICA onde esta': ela e' o
--   registro do estado anterior, e um banco novo passa por ela antes de chegar aqui.
--
-- O QUE MUDOU: o `valor` do resumo era saldo x PRECO MEDIO DE VENDA (a media ponderada do que
--   ja' se entregou daquela cultura). Passa a ser saldo POR CLASSE x COTACAO DE MERCADO mais
--   recente DAQUELA CLASSE, somado.
--
-- ⚠ O DEFEITO QUE ISSO FECHA: preco medio de venda so' existe depois da primeira entrega. Numa
--   safra colhida e ainda nao vendida — a 25/26, hoje, com 44.141,52 sacas de amendoim — o
--   divisor nao existia, `coalesce(en.preco,0)` devolvia ZERO e o resumo afirmava que o estoque
--   inteiro nao valia nada. A cotacao de mercado nao depende de ter vendido: e' justamente o
--   numero de quem ainda NAO vendeu.
--
-- ⚠⚠ RESUMO E DETALHE PASSAM A FALAR A MESMA CONTA, e esta e' a parte que importa mais que o
--   numero. O `valor_mercado` do detalhe (`fn_estoque_graos`, md5 b993c508...) sempre foi
--   `greatest(colhido-entregue,0) x cotacao mais recente da classe`; o resumo agora faz a
--   MESMA conta, com o mesmo `distinct on ... data_referencia desc`, so' que somando as classes.
--   Clicar na linha de "Todas" e cair no detalhe deixa de mudar o numero.
-- ⚠ E A DIVERGENCIA DO MEIO SACO MORREU JUNTO, sem que ninguem a perseguisse. A
--   `20261011120000` documentou o caso: 23/24 amendoim dava 3.219,64 no resumo e 3.219,65 no
--   detalhe, porque a roca tinha 620,63 colhidos contra 620,64 entregues e aquele -0,01 entrava
--   no liquido do resumo. O resumo agora aplica `greatest(...,0)` POR CLASSE, antes de somar —
--   a classe negativa zera ali, como ja' zerava no detalhe.
--   MEDIDO EM 15/09/2026 SOBRE O PROTO INTEIRO, as tres safras com colheita, resumo x soma do
--   detalhe, em saldo E em valor:
--       23/24 amendoim   3.219,65 sc   R$   273.670,25   dif 0,0000 / 0,0000
--       24/25 amendoim  16.579,57 sc   R$ 1.223.057,65   dif 0,0000 / 0,0000
--       25/26 amendoim  44.141,52 sc   R$ 3.694.571,40   dif 0,0000 / 0,0000
--   As notas da `20261011120000` sobre "o valor e' a media ponderada de TODAS as classes
--   entregues" e "sem entrega nao ha' preco" descrevem o corpo ANTIGO e nao valem mais.
--
-- ⚠ DUAS DIFERENCAS RESTAM, e nenhuma delas e' de valor:
--   1. O ARREDONDAMENTO MUDA DE LUGAR: o detalhe arredonda por classe e a tela soma; o resumo
--      soma e arredonda no fim. Diferenca possivel: centavos. Medida hoje: zero.
--   2. O SALDO AINDA NAO E' A MESMA CONTA: o detalhe zera a classe quando |colhido-entregue| <
--      0,5 (tolerancia de meio saco) e o resumo nao — ele so' impede o negativo. Para uma
--      diferenca POSITIVA de 0,3 saca o detalhe mostraria 0,00 e o resumo 0,30. Latente, nao
--      observavel: zero ocorrencias no Proto hoje. O VALOR nao e' afetado, porque os dois lados
--      multiplicam `greatest(colhido-entregue,0)` cru.
--
-- ⚠ ZERO EM `valor` CONTINUA SENDO "NAO HA' COTACAO", NAO "VALE ZERO", e o payload do resumo NAO
--   TEM SENTINELA para distinguir os dois — nao ha' `data_mercado` aqui, so' no detalhe. A tela
--   le' `valor > 0` para decidir entre o numero e o "—". Uma cotacao registrada a R$ 0,00 (o
--   CHECK admite `>= 0`) apareceria como ausencia. E' o mesmo contrato da F1, mantido.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default-privilege global. Ela e SECURITY
--   DEFINER e le colheita, entrega e cotacao de todo o cliente.
--   Medido no Proto em 15/09/2026: anon=false, authenticated=true, public=false.

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
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente group by 1,2
  ),
  mercado as (
    select distinct on (cultura, classe_aflatoxina) cultura, classe_aflatoxina classe, preco_saca
    from agri_cotacao_graos where cliente_id=p_cliente order by cultura, classe_aflatoxina, data_referencia desc
  ),
  saldo_classe as (
    select co.cultura, co.classe,
      greatest(coalesce(co.sc,0)-coalesce(en.sc,0),0) saldo,
      coalesce(m.preco_saca,0) preco_mercado
    from colhido co
    left join entregue en on en.cultura=co.cultura and en.classe=co.classe
    left join mercado m on m.cultura=co.cultura and m.classe=co.classe
  ),
  por_cultura as (
    select cultura, round(sum(saldo),2) saldo, round(sum(saldo*preco_mercado),2) valor_mercado
    from saldo_classe group by cultura
  )
  select jsonb_agg(jsonb_build_object(
    'cultura', cu.cultura,
    'saldo', coalesce(pc.saldo,0),
    'valor', coalesce(pc.valor_mercado,0)
  ) order by cu.cultura)
  into v_res from culturas cu left join por_cultura pc on pc.cultura=cu.cultura;
  return coalesce(v_res,'[]'::jsonb);
end $function$;

revoke all on function public.fn_estoque_graos_resumo(uuid, uuid) from public;
grant execute on function public.fn_estoque_graos_resumo(uuid, uuid) to authenticated;
