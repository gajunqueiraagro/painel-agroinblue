-- PR-ESTOQUE-GRAOS — o saldo de grao em maos, por safra e classe.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       8b38e90effb0e90fd650d19d411a3e68  (1.623 bytes)
--
-- O QUE ELA RESPONDE: por classe (ate_20, acima_20, roca), quanto foi COLHIDO, quanto foi
--   ENTREGUE e o que sobrou em maos — mais o preco de referencia (media ponderada do que se
--   entregou) e o valor estimado do saldo.
--
-- ⚠ A ENTREGA LIGA NA SAFRA PELA OPERACAO, NAO PELA COLHEITA: o caminho e'
--   `agri_oc_entregas.operacao_id -> agri_operacoes_comerciais.safra_id`. Medido: a coluna
--   `colheita_id` das entregas e' SEMPRE nula, entao um join por ela devolveria zero entregue e
--   o estoque mostraria todo o colhido como saldo — o pior erro possivel numa tela de saldo,
--   porque o numero sai grande e plausivel.
--
-- ⚠ MEIO SACO DE DIFERENCA ZERA O SALDO. `abs(colhido - entregue) < 0.5` devolve 0 em vez do
--   residuo. Medido na 23/24: a roca tem 620,63 colhidos contra 620,64 entregues — a entrega
--   arredondou para cima no romaneio. Sem a regra, a tela mostraria "-0,01 sc em estoque", que
--   nao e' um saldo negativo: e' um arredondamento. E o caso oposto (sobrar 0,3 sc) tambem nao
--   e' grao em maos.
--
-- ⚠ O VALOR USA `greatest(saldo, 0)`: saldo negativo por erro de lancamento nao vira dinheiro
--   negativo no cartao.
-- ⚠ O `full outer join` E' NECESSARIO, nao zelo: uma classe pode ter entrega sem colheita (grao
--   de safra anterior entregue agora) ou colheita sem entrega. Um join comum sumiria com a linha.
--
-- ⚠⚠ ELA NAO RECEBE CULTURA — a assinatura e' `(p_cliente, p_safra_id)` e o corpo nao menciona
--   `cultura` em lugar nenhum. O estoque e' da SAFRA INTEIRA. Hoje isso nao distorce nada no
--   Proto (so o amendoim tem colheita registrada), mas numa safra com duas culturas colhidas as
--   sacas das duas se somariam na mesma classe. A tela NAO oferece filtro de cultura por causa
--   disto: filtro que nao filtra e' pior que filtro nenhum.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default-privilege global. Ela e SECURITY
--   DEFINER e le colheita e entrega de todo o cliente.
--   Medido no Proto: anon=false, authenticated=true.

CREATE OR REPLACE FUNCTION public.fn_estoque_graos(p_cliente uuid, p_safra_id uuid)
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
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo group by 1
    union all
    select 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo
  ),
  colh as (select classe, sum(sc) colhido from colhido group by 1),
  entregue as (
    select e.classe_aflatoxina classe, sum(e.sacas) entregue, sum(e.sacas*e.preco_saca)/nullif(sum(e.sacas),0) preco
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'classe', classe,
    'colhido', round(coalesce(colhido,0),2),
    'entregue', round(coalesce(entregue,0),2),
    'saldo', case when abs(coalesce(colhido,0)-coalesce(entregue,0))<0.5 then 0 else round(coalesce(colhido,0)-coalesce(entregue,0),2) end,
    'preco_ref', round(coalesce(preco,0),2),
    'valor', round(greatest(coalesce(colhido,0)-coalesce(entregue,0),0)*coalesce(preco,0),2)
  ) order by classe)
  into v_res from colh full outer join entregue using(classe);
  return coalesce(v_res,'[]'::jsonb);
end $function$;

revoke all on function public.fn_estoque_graos(uuid, uuid) from public;
grant execute on function public.fn_estoque_graos(uuid, uuid) to authenticated;
