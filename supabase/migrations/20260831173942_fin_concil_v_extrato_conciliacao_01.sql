-- FIN-CONCIL-PORTAR-01 — o estado do movimento, derivado dos vinculos.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831173942.
--
-- Portado de AllinBlues/financas (20260812020000_conciliacao.sql, secao 5), lido
-- via gh. A DOUTRINA E O MOTIVO DE ELA EXISTIR: o estado NAO E COLUNA. Grava-lo
-- seria uma segunda fonte de verdade para a mesma pergunta, e um UPDATE
-- esquecido produziria "conciliado" sem vinculo nenhum. Ele e' computado de onde
-- a resposta mora — a soma dos `valor_aplicado` ATIVOS contra o valor.
--
-- ⚠ `excluido_em` DO ORIGINAL VIRA DOIS CAMPOS AQUI: o Proto separa CANCELADO
-- (o movimento nao existe) de IGNORADO (existe e foi desconsiderado). Colapsar
-- os dois perderia a distincao que o proprio schema faz.
-- ⚠ `security_invoker` NA CLAUSULA, e nao herdado: `CREATE OR REPLACE VIEW` NAO
-- preserva reloptions quando o `WITH` e' omitido, e foi assim que a nona view da
-- familia SEC-VIEWS-TENANT-01B nasceu aberta em 31/08. Conferido apos aplicar:
-- reloptions = {security_invoker=true}.

create or replace view public.v_extrato_conciliacao
with (security_invoker = true) as
select
  e.id                        as extrato_id,
  e.cliente_id,
  e.conta_bancaria_id,
  e.data_movimento,
  e.valor,
  e.descricao,
  e.documento,
  e.cancelado_em,
  e.ignorado_em,
  coalesce(sum(c.valor_aplicado), 0)::numeric(14,2)               as valor_conciliado,
  (abs(e.valor) - coalesce(sum(c.valor_aplicado), 0))::numeric(14,2) as valor_aberto,
  case
    when coalesce(sum(c.valor_aplicado), 0) = 0             then 'nao_conciliado'
    when coalesce(sum(c.valor_aplicado), 0) >= abs(e.valor) then 'conciliado'
    else                                                         'parcial'
  end as situacao
from public.extrato_bancario_v2 e
left join public.conciliacao_bancaria_itens c
       on c.extrato_id = e.id and c.desfeito_em is null
group by e.id, e.cliente_id, e.conta_bancaria_id, e.data_movimento, e.valor,
         e.descricao, e.documento, e.cancelado_em, e.ignorado_em;

comment on view public.v_extrato_conciliacao is
  'Estado do movimento DERIVADO dos vinculos ativos: nao_conciliado | parcial | conciliado. Sem coluna correspondente — gravar o estado criaria uma segunda fonte de verdade. Portado de AllinBlues/financas (20260812020000, secao 5).';

revoke all on public.v_extrato_conciliacao from public, anon;
grant select on public.v_extrato_conciliacao to authenticated;
