-- PR-ESTOQUE-GRAOS — o saldo de grao em maos, por safra, CULTURA e classe.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       47ccff6bbc29b37959c1ff761dab7a08  (1.701 bytes)
--
-- ⚠⚠ ESTE ARQUIVO FOI REESCRITO, e a excecao merece explicacao porque o repo trata migration
--   como diario. A primeira versao criava `fn_estoque_graos(uuid, uuid)`, sem cultura. Essa
--   assinatura foi DROPADA no banco — nao existe mais. Manter o arquivo antigo faria um replay
--   criar uma funcao morta para dropa-la em seguida; e criar uma migration NOVA por cima
--   deixaria a de dois parametros viva no meio do caminho, com a tela nova apontando para uma
--   assinatura que aquele ponto do historico nao tem. Aqui o certo e' o arquivo dizer a unica
--   assinatura que existe.
-- ⚠ O `drop ... if exists` FICA MESMO ASSIM: um banco que ja' aplicou a versao de dois
--   parametros — o Proto — precisa dela removida, e `create or replace` NAO substitui funcao de
--   assinatura diferente: criaria uma sobrecarga, e as duas conviveriam. Chamar
--   `fn_estoque_graos` com tres argumentos acharia a certa, mas a de dois ficaria la', respondendo
--   o estoque da safra inteira para quem a chamasse.
--
-- O QUE ELA RESPONDE: por classe (ate_20, acima_20, roca), quanto foi COLHIDO, quanto foi
--   ENTREGUE e o que sobrou em maos — mais o preco de referencia (media ponderada do que se
--   entregou) e o valor estimado do saldo.
--
-- ⚠ A CULTURA FILTRA DOS DOIS LADOS, e sao colunas DIFERENTES: o colhido por
--   `agri_safra_area.cultura` (a area e' que sabe o que foi plantado) e o entregue por
--   `agri_operacoes_comerciais.cultura` (a venda e' que sabe o que foi negociado). Filtrar so' um
--   lado daria saldo negativo numa cultura e inflado na outra.
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
--   nao e' um saldo negativo: e' um arredondamento.
--
-- ⚠ O VALOR USA `greatest(saldo, 0)`: saldo negativo por erro de lancamento nao vira dinheiro
--   negativo no cartao.
-- ⚠ O `full outer join` E' NECESSARIO, nao zelo: uma classe pode ter entrega sem colheita (grao
--   de safra anterior entregue agora) ou colheita sem entrega. Um join comum sumiria com a linha.
--
-- ⚠ A ACL VEM JUNTO, e na assinatura NOVA: o revoke/grant da antiga foi embora com ela no drop.
--   `create` numa assinatura nova nasce com EXECUTE para PUBLIC por default-privilege global, e a
--   funcao e' SECURITY DEFINER sobre colheita e entrega de todo o cliente.
--   Medido no Proto: anon=false, authenticated=true.

-- ⚠ O DROP VEM ANTES: a assinatura mudou, entao nao ha' "replace" possivel.
drop function if exists public.fn_estoque_graos(uuid, uuid);

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
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente and o.cultura=p_cultura group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'classe', classe, 'colhido', round(coalesce(colhido,0),2), 'entregue', round(coalesce(entregue,0),2),
    'saldo', case when abs(coalesce(colhido,0)-coalesce(entregue,0))<0.5 then 0 else round(coalesce(colhido,0)-coalesce(entregue,0),2) end,
    'preco_ref', round(coalesce(preco,0),2),
    'valor', round(greatest(coalesce(colhido,0)-coalesce(entregue,0),0)*coalesce(preco,0),2)
  ) order by classe) into v_res from colh full outer join entregue using(classe);
  return coalesce(v_res,'[]'::jsonb);
end $function$;

revoke all on function public.fn_estoque_graos(uuid, uuid, text) from public;
grant execute on function public.fn_estoque_graos(uuid, uuid, text) to authenticated;
