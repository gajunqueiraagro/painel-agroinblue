-- DADO-2448E772-COMPETENCIA-01 — prova do restauro (migration 20261027198000). Roda contra o banco COM ela aplicada, numa
-- transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   R1 depois: competencia 10/06/2026, ano_mes 2026-06, movimentacao 5e92f3b2; valor, pagamento, conta, status e o vinculo
--      vivo com o extrato iguais aos de sempre
--   R2 trilha: exatamente 1 'restaurar_competencia' no audit_log, com antes (14/10, 2026-10, nulo), depois e o motivo
--   R3 rodar de novo nao altera: o UPDATE da guarda nao casa nenhuma linha, e o ramo "ja' restaurado" vale
--   R4 o efeito, medido pela RPC real: o lancamento e' devolvido ao estado de ANTES (14/10, sem movimentacao) dentro desta
--      transacao e o DRE pecuaria do NJ e' comparado — jun/26 +213.150,75 e out/26 −213.150,75 em vendas e em receita bruta,
--      jul/26 (o mes do ano_mes de antes do vinculo) identico por md5; a conciliacao da conta 7f39d18f (jun, jul, out/26)
--      identica por md5. ⚠ RECORTE: os 12 meses do DRE nao cabem nos 10 s do ensaio (24 chamadas estouraram); os outros nove
--      meses iguais foram medidos no ensaio dos leitores (14/10, antes de aplicar).
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  c_lanc constant uuid := '2448e772-0aec-44bc-b66c-4f76c9493729';
  c_mov  constant uuid := '5e92f3b2-5be0-4c03-a15b-b997210658a9';
  c_cli  constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_cta  constant uuid := '7f39d18f-d9c9-4027-9d81-78e80b87ea88';
  l public.financeiro_lancamentos_v2; a jsonb; n int; v_ok text := ''; m text;
  d_dep jsonb := '{}'::jsonb; d_ant jsonb := '{}'::jsonb; c_dep jsonb := '{}'::jsonb; c_ant jsonb := '{}'::jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  -- R1 depois
  select * into l from public.financeiro_lancamentos_v2 where id = c_lanc;
  if l.data_competencia is distinct from date '2026-06-10' or l.ano_mes is distinct from '2026-06'
     or l.movimentacao_rebanho_id is distinct from c_mov then
    raise exception 'R1 restauro: competencia %, ano_mes %, movimentacao %', l.data_competencia, l.ano_mes, l.movimentacao_rebanho_id; end if;
  if l.valor is distinct from 213150.75 or l.data_pagamento is distinct from date '2026-07-13'
     or l.conta_destino_id is distinct from c_cta or l.status_transacao is distinct from 'realizado'
     or l.cancelado is distinct from false or l.cliente_id is distinct from c_cli then
    raise exception 'R1 o resto do lancamento mudou: %', to_jsonb(l); end if;
  select count(*) into n from public.conciliacao_bancaria_itens where lancamento_id = c_lanc and desfeito_em is null;
  if n is distinct from 1 then raise exception 'R1 vinculo com o extrato: % vivos (esperado 1)', n; end if;
  v_ok := v_ok || 'R1 ok; ';

  -- R2 trilha
  select count(*) into n from public.audit_log where registro_id = c_lanc and acao = 'restaurar_competencia';
  if n is distinct from 1 then raise exception 'R2 % eventos restaurar_competencia (esperado 1)', n; end if;
  select jsonb_build_object('ant', dados_anteriores, 'nov', dados_novos) into a
    from public.audit_log where registro_id = c_lanc and acao = 'restaurar_competencia';
  if a->'ant' is distinct from jsonb_build_object('data_competencia', '2026-10-14', 'ano_mes', '2026-10', 'movimentacao_rebanho_id', null)
     or a->'nov'->>'data_competencia' is distinct from '2026-06-10' or a->'nov'->>'ano_mes' is distinct from '2026-06'
     or (a->'nov'->>'movimentacao_rebanho_id')::uuid is distinct from c_mov
     or a->'nov'->>'motivo' not like 'restauro — vínculo errado à OC 1645ba75 em 12/10%autorizado pelo Gabriel em 14/10' then
    raise exception 'R2 evento: %', a; end if;
  v_ok := v_ok || 'R2 ok; ';

  -- R3 rodar de novo: a guarda nao casa, e o ramo "ja' restaurado" vale
  update public.financeiro_lancamentos_v2 set data_competencia = date '2026-06-10'
   where id = c_lanc and data_competencia = date '2026-10-14' and valor = 213150.75 and movimentacao_rebanho_id is null;
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'R3 a guarda casou % linha(s) num segundo rodar', n; end if;
  v_ok := v_ok || 'R3 ok; ';

  -- R4 o efeito: depois (agora) x antes (o lancamento devolvido a 14/10 nesta transacao)
  for m in select unnest(array['2026-06', '2026-07', '2026-10']) loop
    d_dep := d_dep || jsonb_build_object(m, public.fn_dre_pecuaria(c_cli, m, m, 'realizado'));
  end loop;
  for m in select unnest(array['2026-06', '2026-07', '2026-10']) loop
    c_dep := c_dep || jsonb_build_object(m, md5(coalesce((select string_agg(to_jsonb(r)::text, ',')
      from public._fn_conciliacao_resumo(c_cli, m, array[c_cta], false, false) r), '')));
  end loop;
  update public.financeiro_lancamentos_v2 set data_competencia = date '2026-10-14', movimentacao_rebanho_id = null where id = c_lanc;
  for m in select unnest(array['2026-06', '2026-07', '2026-10']) loop
    d_ant := d_ant || jsonb_build_object(m, public.fn_dre_pecuaria(c_cli, m, m, 'realizado'));
  end loop;
  for m in select unnest(array['2026-06', '2026-07', '2026-10']) loop
    c_ant := c_ant || jsonb_build_object(m, md5(coalesce((select string_agg(to_jsonb(r)::text, ',')
      from public._fn_conciliacao_resumo(c_cli, m, array[c_cta], false, false) r), '')));
  end loop;
  for m in select unnest(array['2026-06', '2026-07', '2026-10']) loop
    if m = '2026-06' or m = '2026-10' then
      if ((d_dep->m->'total'->>'vendas')::numeric - (d_ant->m->'total'->>'vendas')::numeric)
           is distinct from (case m when '2026-06' then 213150.75 else -213150.75 end)
         or ((d_dep->m->'total'->>'receita_bruta')::numeric - (d_ant->m->'total'->>'receita_bruta')::numeric)
           is distinct from (case m when '2026-06' then 213150.75 else -213150.75 end) then
        raise exception 'R4 DRE % : vendas % -> %, receita bruta % -> %', m, d_ant->m->'total'->>'vendas', d_dep->m->'total'->>'vendas',
          d_ant->m->'total'->>'receita_bruta', d_dep->m->'total'->>'receita_bruta'; end if;
    elsif md5((d_dep->m)::text) is distinct from md5((d_ant->m)::text) then
      raise exception 'R4 DRE % mudou e nao devia', m; end if;
  end loop;
  if c_dep is distinct from c_ant then raise exception 'R4 conciliacao da conta mudou: % x %', c_ant, c_dep; end if;
  v_ok := v_ok || 'R4 ok (jun, jul e out do DRE e da conciliacao); ';

  raise exception 'OK dado_2448e772_competencia_01 (%)', v_ok;
end $teste$;
ROLLBACK;
