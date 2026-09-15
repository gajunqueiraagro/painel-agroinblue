-- PR-ESTOQUE-POLISH — o resumo passa a devolver o COLHIDO, para o "% parado" existir em "Todas".
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       f6096b387f7bb3a8d58cabc4198a0817  (2.228 bytes)
--   Obsoletos: fdfcc460c71ee3cd4b222403ee7299d4 (versionado na `20261014120000`, que FICA) e
--   3335fa0c4021bd4e638f842f2e99c914 (na `20261011120000`, que tambem fica).
--   ⚠ O BRIEFING CITA UM QUARTO md5, `fa554206`, como obsoleto. Ele NAO consta de migration
--   nenhuma deste repo — nem como vigente nem como anterior — e nao foi o estado encontrado no
--   banco hoje. Registrado aqui porque a cadeia que este repo consegue atestar e' 3335fa0c ->
--   fdfcc460 -> f6096b38: se `fa554206` existiu no Proto, existiu entre duas medicoes e sem
--   migration. Nao inventei uma linha de historico para ele.
--
-- O QUE MUDOU: o payload por cultura ganhou `colhido` (sacas), ao lado de `saldo` e `valor`.
--   O CALCULO DE SALDO E DE VALOR NAO MUDOU — conferido linha a linha contra o corpo anterior: a
--   CTE `saldo_classe` virou `base`, a coluna `preco_mercado` virou `preco`, e `por_cultura`
--   ganhou `round(sum(colhido),2)`. Renomear e acrescentar; a aritmetica e' a mesma.
--
-- PARA QUE SERVE: o cartao "% colhido parado" exibia "—" na visao "Todas" porque faltava o
--   DENOMINADOR — o resumo dava saldo e valor, nunca o colhido. Com ele, o percentual passa a
--   existir tambem ali.
--
-- ⚠⚠ E A TELA NAO SOMA AS SACAS PARA CALCULA-LO. Duas culturas da mesma safra podem estar em
--   unidades diferentes (amendoim em saca de 25 kg, mandioca em tonelada); somar "sacas" de uma
--   com "toneladas" da outra num percentual daria um numero que nao mede nada. O front converte
--   os dois lados para QUILO antes de dividir, usando o peso de `src/lib/agri/colheita.ts`, e o
--   quilo NAO aparece em lugar nenhum da tela — so' o percentual.
--   MEDIDO EM 15/09/2026: hoje so' o amendoim tem colheita, entao a conversao nao altera
--   resultado nenhum. Ela existe para o dia em que a mandioca colher.
--       23/24  colhido 8.367,28  saldo 3.219,65  ->  38,5%
--       24/25  colhido 28.953,92 saldo 16.579,57 ->  57,3%
--       25/26  colhido 44.141,52 saldo 44.141,52 -> 100,0%
--
-- ⚠ `colhido` E' O DA SAFRA, e o `saldo` tambem — esta RPC continua POR SAFRA. O balanco
--   plurianual (`fn_estoque_graos_balanco`) e' que varre a cultura inteira, e por isso os dois
--   dao numeros diferentes de proposito. Ver o cabecalho da `20261015120000`.
--
-- ⚠ ZERO NO DENOMINADOR E' "—", NAO ZERO POR CENTO: safra sem colheita nao tem grao parado —
--   ela nao tem grao nenhum, e 0,0% afirmaria que tudo foi vendido.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: num banco novo a funcao nasce com EXECUTE para
--   PUBLIC por default-privilege global. Ela e' SECURITY DEFINER e le colheita, entrega e cotacao
--   de todo o cliente.
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
  base as (
    select co.cultura, co.classe,
      coalesce(co.sc,0) colhido,
      greatest(coalesce(co.sc,0)-coalesce(en.sc,0),0) saldo,
      coalesce(m.preco_saca,0) preco
    from colhido co
    left join entregue en on en.cultura=co.cultura and en.classe=co.classe
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

revoke all on function public.fn_estoque_graos_resumo(uuid, uuid) from public;
grant execute on function public.fn_estoque_graos_resumo(uuid, uuid) to authenticated;
