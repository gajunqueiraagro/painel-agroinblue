-- PR-OC-VALOR-02 — TESTE DE CONCORDANCIA entre as duas implementacoes.
--
-- A regra do valor do lote existe em DOIS lugares, e a duplicacao e deliberada:
--   1. `_oc_valor_do_lote` (banco)         — fonte para oc_salvar_lotes e a ponte
--   2. `AbaNegociacaoLotes.tsx:40-63`      — preview durante a DIGITACAO, quando
--                                            o lote ainda nao existe no banco
-- Este teste reproduz a formula do FRONT em SQL e compara com a do banco em
-- todos os lotes existentes. Ele nao prova que o front esta correto — prova que
-- os dois CONCORDAM. Se divergirem, uma das duas mudou sozinha.
--
-- Rodar depois de qualquer alteracao em `_oc_valor_do_lote` ou em `loteTotal`/
-- `resumoLote`. Esperado: as tres colunas iguais ao total de lotes.

with banco as (
  select l.id, l.criterio_valor crit, l.qtd_negociada q,
         l.peso_medio_negociado_kg pm, l.valor_informado vi,
         (public._oc_valor_do_lote(l.id) ->> 'total')::numeric      b_total,
         (public._oc_valor_do_lote(l.id) ->> 'por_cabeca')::numeric b_cab,
         (public._oc_valor_do_lote(l.id) ->> 'por_kg')::numeric     b_kg
  from public.zoo_operacao_lotes l
),
front as (
  /* AbaNegociacaoLotes.tsx:40-46 — loteTotal:
       pt = q * pm;  kg -> pt*v | cabeca -> q*v | total -> v
     :60-61 — os derivados, ambos guardados por `total > 0`. */
  select id,
         (case crit when 'kg' then (q*pm)*vi when 'cabeca' then q*vi else vi end)::numeric f_total,
         q, pm
  from banco
)
select count(*)                                                            lotes,
       count(*) filter (where round(b.b_total,2) is not distinct from round(f.f_total,2)) total_bate,
       count(*) filter (where b.b_cab is not distinct from
              (case when f.q > 0 and f.f_total > 0 then round(f.f_total/f.q, 6) end))     cab_bate,
       count(*) filter (where b.b_kg is not distinct from
              (case when f.q*f.pm > 0 and f.f_total > 0 then round(f.f_total/(f.q*f.pm), 6) end)) kg_bate
from banco b join front f using (id);
