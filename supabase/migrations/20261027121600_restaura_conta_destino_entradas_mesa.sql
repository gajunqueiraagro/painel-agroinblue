-- Restaura conta_destino_id de 20 entradas (Santa Rita, ago/26, origem extrato)
-- zeradas por edicao da Mesa de Enriquecimento em 16/09/2026. Fonte: audit_log,
-- ultima edicao que levou conta_destino_id de valor para NULL. Conferido: a conta
-- restaurada bate 20/20 com a conta do OFX conciliado. Aplicada no proto em 16/09.
with orf as (
  select id, editado_manual em from financeiro_lancamentos_v2
  where tipo_operacao='1-Entradas' and not cancelado and origem_lancamento='extrato'
    and conta_bancaria_id is null and conta_destino_id is null
), fonte as (
  select distinct on (a.registro_id) a.registro_id,
         (a.dados_anteriores->>'conta_destino_id')::uuid cd
  from audit_log a join orf on orf.id=a.registro_id
  where a.tabela_origem='financeiro_lancamentos_v2'
    and a.dados_anteriores->>'conta_destino_id' is not null
    and a.dados_novos->>'conta_destino_id' is null
  order by a.registro_id, a.created_at desc
)
update financeiro_lancamentos_v2 l
   set conta_destino_id=f.cd, editado_manual=orf.em
  from fonte f join orf on orf.id=f.registro_id
 where l.id=f.registro_id;
