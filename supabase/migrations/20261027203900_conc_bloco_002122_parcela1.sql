-- CONC-BLOCO-SINAL-MISTO-01 — o caso 002122 (Agnaldo, Bradesco 186a093b, consorcio 77c502f0), com o OK do Gabriel de 20/10/2026.
--   1. Competencia = vencimento da parcela 1: os dois lancamentos (e489aac6 fundo comum e reserva, fbdb6092 taxa adm. e seguro) de
--      17/07/2026 para 17/06/2026 (a parcela foi ajustada a' mao para 17/06 antes da regra da 20261027203800). `ano_mes` pelo gatilho;
--      trilha no `audit_log` do proprio lancamento.
--   2. A parcela 1 pelo bloco (`fn_conciliar_bloco`, 'exato'): PIX 19/06 −2.893,37 -> e489aac6 2.399,35 + fbdb6092 494,02; reembolso
--      23/06 +89,71 -> e489aac6 −89,71. Os dois lancamentos ficam realizados com pagamento em 19/06; os dois extratos conciliados.
--   3. O e726069c (agendado 16/10, 2.803,66, competencia 19/06 em Investimento Maquinas) cancelado pelo dono, com o motivo
--      "duplicado pela parcela 4 do consórcio 002122". Os quatro cancelados antigos (b5310cd0, f4a66642, 63d31ec0, 7724fca7) nao mudam.
-- Guarda: tudo no estado medido em 20/10, senao aborta. O usuario do gesto e' o admin do AGROinBLUE (as funcoes conferem o cliente).
-- Gesto contrario: "Desfazer bloco" na Conferencia (o bloco); a competencia volta por UPDATE com o valor do `audit_log`; o cancelamento
-- nao se desfaz (descancelar nao tem dono).

set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

do $mig$
declare
  e1 constant uuid := '99056782-5970-438a-b3d7-473a29f85d88';
  e2 constant uuid := '892af770-aa8d-4be4-a301-400a37a562f3';
  l1 constant uuid := 'e489aac6-26cc-4bbc-a417-d9e67547f409';
  l2 constant uuid := 'fbdb6092-8823-4922-83cd-3396ef982778';
  dup constant uuid := 'e726069c-787b-488f-88a4-8a6d9fc7fe71';
  r jsonb; n int;
begin
  -- guarda
  if (select count(*) from extrato_bancario_v2 where id in (e1, e2) and status = 'nao_conciliado') <> 2
     or exists (select 1 from conciliacao_bancaria_itens where extrato_id in (e1, e2) and desfeito_em is null)
     or (select count(*) from financeiro_lancamentos_v2 where id in (l1, l2) and status_transacao = 'previsto' and cancelado is not true
           and data_competencia = date '2026-07-17' and data_vencimento = date '2026-06-17') <> 2
     or (select valor from financeiro_lancamentos_v2 where id = l1) <> 2309.64 or (select valor from financeiro_lancamentos_v2 where id = l2) <> 494.02
     or (select count(*) from financeiro_lancamentos_v2 where id = dup and status_transacao = 'agendado' and cancelado is not true and valor = 2803.66) <> 1
  then raise exception '002122: estado diferente do medido em 20/10'; end if;

  -- 1. competencia = vencimento
  update financeiro_lancamentos_v2 set data_competencia = date '2026-06-17' where id in (l1, l2) and data_competencia = date '2026-07-17';
  get diagnostics n = row_count;
  if n <> 2 then raise exception '002122: competencia em % linhas', n; end if;

  -- 2. o bloco
  r := public.fn_conciliar_bloco(array[e1, e2], array[l1, l2], 'exato', false);
  if (select count(*) from conciliacao_bancaria_itens where grupo_id = (r->>'bloco_id')::uuid and desfeito_em is null) <> 3
     or (select valor_aplicado from conciliacao_bancaria_itens where extrato_id = e2 and desfeito_em is null) <> -89.71
     or public._fn_lancamento_aplicado_vivo(l1) <> 2309.64 or public._fn_lancamento_aplicado_vivo(l2) <> 494.02
     or (select count(*) from financeiro_lancamentos_v2 where id in (l1, l2) and status_transacao = 'realizado' and data_pagamento = date '2026-06-19') <> 2
     or (select count(*) from extrato_bancario_v2 where id in (e1, e2) and status = 'conciliado') <> 2
  then raise exception '002122: bloco diferente do simulado: %', r; end if;

  -- 3. o duplicado
  perform public.fn_cancelar_lancamento_auditoria(dup, 'duplicado pela parcela 4 do consórcio 002122');
  if (select cancelado from financeiro_lancamentos_v2 where id = dup) is not true then raise exception '002122: e726069c nao cancelou'; end if;
end $mig$;
