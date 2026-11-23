-- FOLHA-01 · F7 — NJ: cancela os previstos que sobraram de 2 recorrências de salário já desligadas.
-- Decisão do Gabriel 18/11/2026 13:25 (F7: limpar os previstos fantasmas do NJ com prévia → lote → aprovo).
-- CORREÇÃO DA FASE 0: os "63 previstos, R$ 163.443,38" contavam também os que JÁ ESTAVAM cancelados (o Gabriel limpou em 30/09,
-- 28/10 e 13/11 pela tela/P154). Vivos de verdade: 4, R$ 11.047,68 — set/26 e out/26, ANTES do corte da fn_recorrencia_fora_da_vigencia
-- (modo cancelada corta no mês em que a regra foi desligada, 11/2026), por isso a porta do P154 não os alcança.
--   Rosalino da Silva Pereira (rescisão paga 03/07/2026): 09/26 2.567,90 · 10/26 2.567,90
--   Manoel Angelo Nascimento (último pago 04/09/2026, o salário de 08/26; recorrência desligada 13/11): 09/26 2.955,94 · 10/26 2.955,94
-- O QUE FAZ: o mesmo UPDATE da fn_recorrencia_fora_da_vigencia (cancelado + quem/quando/motivo; o status fica 'previsto'), nos 4 ids,
-- autor = Gabriel (claims da transação). Nada se apaga. Recorrências não mudam (já desligadas).
-- RECUSA (nada grava) se: algum dos 4 deixou de ser previsto vivo, a recorrência voltou a ativa, está casado com extrato, o mês fechou,
-- ou a soma/contagem não é a da prévia.
-- DESFAZER: update financeiro_lancamentos_v2 set cancelado=false, cancelado_em=null, cancelado_por=null, cancelado_motivo=null
--   where id in (os 4 abaixo) and cancelado_motivo like 'FOLHA-01 F7%';

set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
select set_config('app.via', 'FOLHA-01-F7', true);

do $f7$
declare
  c_nj  constant uuid := (select id from public.clientes where nome = 'NJ Pecuária');
  c_gab constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_n int; v_soma numeric;
begin
  create temp table _f7 (id uuid primary key, rec uuid, comp date, valor numeric, motivo text) on commit drop;
  insert into _f7 values
    ('7e455ac2-aeca-43c7-b839-a41af82190ac', 'caba9373-4fd3-4251-a156-8a513c8280ea', '2026-09-01', 2567.90,
     'FOLHA-01 F7: previsto de recorrência desligada (rescisão paga em 03/07/2026)'),
    ('66088359-3f7d-4454-8d08-e89c3b893937', 'caba9373-4fd3-4251-a156-8a513c8280ea', '2026-10-01', 2567.90,
     'FOLHA-01 F7: previsto de recorrência desligada (rescisão paga em 03/07/2026)'),
    ('61f093ef-ddcd-4cb9-bbac-7b65f69afe0b', 'a46c4d7d-c2df-451f-932b-0f9d7eed1a38', '2026-09-01', 2955.94,
     'FOLHA-01 F7: previsto de recorrência desligada em 13/11/2026 (último pagamento 04/09/2026)'),
    ('8302f295-9ab6-46a6-98e4-ffb7ad42a712', 'a46c4d7d-c2df-451f-932b-0f9d7eed1a38', '2026-10-01', 2955.94,
     'FOLHA-01 F7: previsto de recorrência desligada em 13/11/2026 (último pagamento 04/09/2026)');

  -- partida: os 4 seguem exatamente como na prévia
  select count(*), sum(l.valor) into v_n, v_soma
    from _f7 x join public.financeiro_lancamentos_v2 l on l.id = x.id
    join public.financeiro_recorrencias r on r.id = l.recorrencia_id
   where l.cliente_id = c_nj and l.recorrencia_id = x.rec and l.data_competencia = x.comp and l.valor = x.valor
     and l.status_transacao = 'previsto' and coalesce(l.cancelado, false) = false
     and l.conciliado_em is null and l.financiamento_id is null and not coalesce(l.classificacao_dividida, false)
     and not r.ativo
     and not exists (select 1 from public.conciliacao_bancaria_itens ci where ci.lancamento_id = l.id and ci.desfeito_em is null)
     and not exists (select 1 from public.financeiro_fechamentos ff where ff.cliente_id = l.cliente_id
                      and ff.status_fechamento = 'fechado' and ff.ano_mes = to_char(l.data_competencia, 'YYYY-MM'));
  if v_n <> 4 or v_soma <> 11047.68 then
    raise exception 'F7: os lançamentos mudaram desde a prévia (% de 4, soma %). Nada foi gravado.', v_n, v_soma;
  end if;

  perform set_config('app.motivo', 'FOLHA-01 F7: previstos de recorrências desligadas', true);
  update public.financeiro_lancamentos_v2 l
     set cancelado = true, cancelado_em = now(), cancelado_por = c_gab, cancelado_motivo = x.motivo
    from _f7 x
   where l.id = x.id and l.status_transacao = 'previsto' and coalesce(l.cancelado, false) = false;
  get diagnostics v_n = row_count;
  if v_n <> 4 then raise exception 'F7: cancelou % de 4. Nada foi gravado.', v_n; end if;

  -- chegada: nenhum previsto vivo nas 2 recorrências
  if exists (select 1 from public.financeiro_lancamentos_v2 l
              where l.recorrencia_id in (select rec from _f7) and l.status_transacao = 'previsto' and coalesce(l.cancelado, false) = false) then
    raise exception 'F7: ainda há previsto vivo nas 2 recorrências. Nada foi gravado.';
  end if;
end $f7$;
