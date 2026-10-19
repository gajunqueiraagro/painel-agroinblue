-- FORN-MESCLAR-RATEIO-01 — `fn_fornecedor_mesclar` recusa "Pec.3M-" (rateio, NF em nome do Higino) com cadastro sem o prefixo.
--   M1 mista (fica sem prefixo, absorve "Pec.3M-"): a simulacao devolve a recusa 'rateio_misto'; a gravacao levanta erro, nada gravado
--   M2 mista ao contrario (fica "Pec.3M-", absorve sem prefixo): recusa
--   M3 "Pec.3M-" com "Pec.3M-": grava
--   M4 sem prefixo com sem prefixo: grava
--   M5 desfazer as duas: continua passando
-- Sintetico no cliente Teste; termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '30s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  s1 uuid; s2 uuid; p1 uuid; p2 uuid; r jsonb; msg text; m3 uuid; m4 uuid;
BEGIN
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT RATEIO Zeta', true) returning id into s1;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT RATEIO Zeta Ltda', true) returning id into s2;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Pec.3M-SINT RATEIO Zeta', true) returning id into p1;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Pec.3M-(SINT RATEIO Zeta)', true) returning id into p2;

  -- M1
  r := public.fn_fornecedor_mesclar(s1, array[p1], true);
  if r->'recusa'->>'motivo' is distinct from 'rateio_misto' then raise exception 'M1 simulacao: %', r; end if;
  if r->'recusa'->>'frase' not like '"SINT RATEIO Zeta" e "Pec.3M-SINT RATEIO Zeta" não se mesclam:%' then raise exception 'M1 frase: %', r->'recusa'->>'frase'; end if;
  msg := null;
  begin r := public.fn_fornecedor_mesclar(s1, array[p1], false); exception when others then msg := SQLERRM; end;
  if msg is null or msg not like '%não se mesclam%' then raise exception 'M1 gravacao passou: % / %', msg, r; end if;
  if (select fundido_em_id from public.financeiro_fornecedores where id = p1) is not null then raise exception 'M1 gravou'; end if;

  -- M2
  r := public.fn_fornecedor_mesclar(p1, array[s1, s2], true);
  if r->'recusa'->>'motivo' is distinct from 'rateio_misto' then raise exception 'M2: %', r; end if;

  -- M3
  r := public.fn_fornecedor_mesclar(p1, array[p2], false);
  if coalesce(r->>'recusa', 'null') <> 'null' then raise exception 'M3 recusado: %', r; end if;
  m3 := (r->>'mesclagem_id')::uuid;

  -- M4
  r := public.fn_fornecedor_mesclar(s2, array[s1], false);
  if coalesce(r->>'recusa', 'null') <> 'null' then raise exception 'M4 recusado: %', r; end if;
  m4 := (r->>'mesclagem_id')::uuid;

  -- M5
  r := public.fn_fornecedor_mesclagem_desfazer(m3, 'teste rateio', false);
  r := public.fn_fornecedor_mesclagem_desfazer(m4, 'teste rateio', false);
  if exists (select 1 from public.financeiro_fornecedores where id in (p2, s1) and fundido_em_id is not null) then raise exception 'M5 desfazer'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
