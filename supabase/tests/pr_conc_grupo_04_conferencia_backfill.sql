-- PR-CONC-GRUPO-FASE-1 — Conferência do backfill (READ-ONLY). Rodar/REVISAR ANTES da migration 04.
-- Mesma regra do apply: SOMENTE 1×N LEGÍTIMO (>=2 vínculos ativos no extrato; nenhum lançamento membro
-- compartilhado com outro extrato; soma(valor_aplicado) = abs(valor do extrato) na tolerância). Não altera nada.
-- N×1 e N:N NÃO entram (permanecem como dados a sanear / revisão manual).
WITH cand_ext AS (
  select extrato_id from conciliacao_bancaria_itens
  where desfeito_em is null group by extrato_id having count(*) >= 2
),
legit AS (
  select e.extrato_id
  from cand_ext e
  where not exists (
        select 1 from conciliacao_bancaria_itens c
        where c.extrato_id = e.extrato_id and c.desfeito_em is null
          and exists (select 1 from conciliacao_bancaria_itens c2
                      where c2.lancamento_id = c.lancamento_id and c2.desfeito_em is null
                        and c2.extrato_id <> e.extrato_id))
    and (select count(*) from conciliacao_bancaria_itens c
         where c.extrato_id = e.extrato_id and c.desfeito_em is null) >= 2
    and abs( (select sum(valor_aplicado) from conciliacao_bancaria_itens c
              where c.extrato_id = e.extrato_id and c.desfeito_em is null)
             - abs((select valor from extrato_bancario_v2 x where x.id = e.extrato_id)) ) <= 0.005
)
select
  -- identidade do grupo = gen_random_uuid() no apply (Migration 04); aqui o candidato é 1 extrato.
  e.id::text                       as extrato_id,
  e.cliente_id::text               as cliente,
  e.data_movimento,
  abs(e.valor)                     as valor_ofx,
  e.status,
  count(*)                         as qtd_membros,
  round(sum(c.valor_aplicado), 2)  as soma,
  jsonb_agg(jsonb_build_object('lancamento_id', c.lancamento_id, 'valor', c.valor_aplicado,
            'descr', left(coalesce(fl.descricao,''),36)) order by c.valor_aplicado desc) as membros
from legit l
join extrato_bancario_v2 e on e.id = l.extrato_id
join conciliacao_bancaria_itens c on c.extrato_id = l.extrato_id and c.desfeito_em is null
join financeiro_lancamentos_v2 fl on fl.id = c.lancamento_id
group by e.id, e.cliente_id, e.data_movimento, e.valor, e.status
order by valor_ofx desc;
