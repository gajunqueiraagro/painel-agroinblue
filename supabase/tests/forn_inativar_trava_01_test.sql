-- FORN-INATIVAR-TRAVA-01 — fornecedor com lancamento vivo ou recorrencia ativa nao se inativa; o caminho e' o Mesclar.
--   I1 inativar com lancamento vivo: recusado, com a frase
--   I2 inativar com recorrencia ativa: recusado; pausada a recorrencia, passa
--   I3 mesclar (o absorvido com lancamento vira inativo pela mesclagem): passa
--   I4 desfazer a mesclagem (o absorvido volta a ativo): passa
--   I5 cadastro sem nada (e com lancamento so' cancelado): passa
--   I6 a leitura da tela (`fn_fornecedor_pode_inativar`) diz o mesmo que a trava
-- Sintetico no cliente Teste. Lancamento e recorrencia nascem com os gatilhos desligados SO' no INSERT (session_replication_role).
-- Termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '30s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  f1 uuid; f2 uuid; f3 uuid; f4 uuid; f5 uuid; rec uuid; r jsonb; msg text;
BEGIN
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT TRAVA com lancamento', true) returning id into f1;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT TRAVA com recorrencia', true) returning id into f2;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT TRAVA absorvido', true) returning id into f3;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT TRAVA fica', true) returning id into f4;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT TRAVA sem nada', true) returning id into f5;
  set local session_replication_role = replica;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento,
    status_transacao, favorecido_id, conta_bancaria_id, descricao, cenario, origem_lancamento, cancelado)
  values (k, fz, '2-Saídas', 10, -1, date '2026-09-01', date '2026-09-01', 'previsto', f1, cta, 'SINT TRAVA', 'realizado', 'manual', false),
         (k, fz, '2-Saídas', 10, -1, date '2026-09-01', date '2026-09-01', 'previsto', f3, cta, 'SINT TRAVA', 'realizado', 'manual', false),
         (k, fz, '2-Saídas', 10, -1, date '2026-09-01', null, 'previsto', f5, cta, 'SINT TRAVA cancelado', 'realizado', 'manual', true);
  insert into public.financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento,
    data_inicio, primeiro_vencimento, data_fim, ativo, favorecido_id)
  values (k, fz, 'SINT TRAVA rec', cta, 'SINT', 10, 10, date '2026-09-01', date '2026-09-10', date '2027-08-31', true, f2) returning id into rec;
  set local session_replication_role = origin;

  -- I1
  msg := null;
  begin update public.financeiro_fornecedores set ativo = false where id = f1; exception when others then msg := SQLERRM; end;
  if msg is distinct from 'Este fornecedor tem 1 lançamento. Para tirá-lo de uso, mescle no cadastro certo (Cadastros › Fornecedores › Mesclar fornecedores). Nada foi gravado.'
    then raise exception 'I1 frase: %', msg; end if;
  if (select ativo from public.financeiro_fornecedores where id = f1) is not true then raise exception 'I1 gravou'; end if;

  -- I2
  msg := null;
  begin update public.financeiro_fornecedores set ativo = false where id = f2; exception when others then msg := SQLERRM; end;
  if msg is distinct from 'Este fornecedor tem 1 recorrência ativa. Para tirá-lo de uso, mescle no cadastro certo (Cadastros › Fornecedores › Mesclar fornecedores). Nada foi gravado.'
    then raise exception 'I2 frase: %', msg; end if;
  update public.financeiro_recorrencias set ativo = false where id = rec;
  update public.financeiro_fornecedores set ativo = false where id = f2;
  if (select ativo from public.financeiro_fornecedores where id = f2) is not false then raise exception 'I2 pausada nao liberou'; end if;

  -- I3
  r := public.fn_fornecedor_mesclar(f4, array[f3], false);
  if coalesce(r->>'recusa', 'null') <> 'null' then raise exception 'I3 mesclar recusado: %', r; end if;
  if (select ativo from public.financeiro_fornecedores where id = f3) is not false then raise exception 'I3 absorvido ativo'; end if;

  -- I4
  r := public.fn_fornecedor_mesclagem_desfazer((r->>'mesclagem_id')::uuid, 'teste trava', false);
  if (select ativo from public.financeiro_fornecedores where id = f3) is not true then raise exception 'I4 desfazer nao reativou: %', r; end if;
  if not exists (select 1 from public.financeiro_lancamentos_v2 where favorecido_id = f3) then raise exception 'I4 lancamento nao voltou'; end if;

  -- I5
  update public.financeiro_fornecedores set ativo = false where id = f5;
  if (select ativo from public.financeiro_fornecedores where id = f5) is not false then raise exception 'I5 sem nada nao inativou'; end if;

  -- I6
  r := public.fn_fornecedor_pode_inativar(f1);
  if (r->>'pode')::boolean is not false or (r->>'lancamentos')::int <> 1 or r->>'frase' not like 'Este fornecedor tem 1 lançamento.%' then raise exception 'I6 f1: %', r; end if;
  r := public.fn_fornecedor_pode_inativar(f4);
  if (r->>'pode')::boolean is not true or r->>'frase' is not null then raise exception 'I6 f4: %', r; end if;

  RAISE EXCEPTION 'OK';
END $t$;
