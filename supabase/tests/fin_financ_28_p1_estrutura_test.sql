-- FIN-FINANC-28-P1 — a estrutura nova do financiamento. Termina em RAISE 'OK'; transacao revertida, sem sobra.
-- Exige a migration 20261027199900 aplicada. Sintetico no cliente Teste; compara com `is distinct from`.
--   E1 cadastro: linha de credito -> contrato ligado (sistema, finalidade, carencia, vencimento final) + destinacao + 2 liberacoes
--      (em conta; liquidacao de um contrato anterior) + parcela com vencimento_original; o contrato anterior vira 'rolado'
--      apontando o sucessor
--   E2 os CHECKs recusam: forma invalida, liquidacao sem contrato liquidado, liquidacao do proprio contrato, valor 0,
--      status de contrato invalido, status e tipo de parcela invalidos, sucessor = o proprio
--   E3 RLS: gestor de outro cliente (so' do NJ) nao le nem grava linha de credito nem liberacao do Teste; o admin le
--   E4 anon nao tem privilegio nas tabelas novas
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_admin constant text := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_user_nj constant text := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  cred uuid; lc uuid; fin uuid; antigo uuid; dest uuid; lib uuid; parc uuid; ok boolean; n int;
begin
  /* E1 */
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT CREDOR 28 P1', true) returning id into cred;
  insert into public.financiamento_linhas_credito (cliente_id, credor_id, programa, descricao, limite, vigencia_inicio, vigencia_fim)
    values (k, cred, 'SINT PRONAMP', 'SINT linha', 3000000, date '2031-01-01', date '2033-12-31') returning id into lc;
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total,
                                     data_contrato, status, credor_id)
    values (k, f, 'financiamento', 'pecuaria', 'SINT anterior', 'SINT-28-A', 500000, date '2030-07-01', 'ativo', cred)
    returning id into antigo;
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total,
                                     data_contrato, status, credor_id, linha_credito_id, sistema_amortizacao, finalidade,
                                     carencia_ate, vencimento_final)
    values (k, f, 'financiamento', 'pecuaria', 'SINT novo', 'SINT-28-B', 900000, date '2031-07-01', 'ativo', cred, lc, 'sac',
            'custeio', date '2032-06-30', date '2034-07-01')
    returning id into fin;
  insert into public.financiamento_destinacoes (financiamento_id, cliente_id, descricao, valor, valor_orcado, fornecedor_id, tipo)
    values (fin, k, 'SINT custeio do gado', 400000, 400000, cred, 'fornecedor') returning id into dest;
  insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma, destinacao_id)
    values (k, fin, date '2031-07-05', 400000, 'conta', dest) returning id into lib;
  insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma, contrato_liquidado_id)
    values (k, fin, date '2031-07-05', 500000, 'liquidacao', antigo);
  update public.financiamentos set status = 'rolado', contrato_sucessor_id = fin, baixa_em = now(), baixa_motivo = 'SINT rolagem'
   where id = antigo;
  insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, vencimento_original,
                                             valor_principal, valor_juros, valor_total, status, tipo, valor_encargos)
    values (fin, k, 1, date '2032-08-01', date '2032-07-01', 300000, 20000, 320000, 'pendente', 'mista', 150)
    returning id into parc;
  select count(*) into n from public.financiamento_liberacoes where financiamento_id = fin and cancelado_em is null;
  if n is distinct from 2 then raise exception 'E1 liberacoes: %', n; end if;
  if (select status from public.financiamentos where id = antigo) is distinct from 'rolado'
     or (select contrato_sucessor_id from public.financiamentos where id = antigo) is distinct from fin then
    raise exception 'E1 rolado';
  end if;
  if (select vencimento_original from public.financiamento_parcelas where id = parc) is distinct from date '2032-07-01' then
    raise exception 'E1 vencimento_original';
  end if;

  /* E2 */
  ok := false; begin insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma)
    values (k, fin, date '2031-08-01', 10, 'pix'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'E2 forma invalida aceita'; end if;
  ok := false; begin insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma)
    values (k, fin, date '2031-08-01', 10, 'liquidacao'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'E2 liquidacao sem contrato aceita'; end if;
  ok := false; begin insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma, contrato_liquidado_id)
    values (k, fin, date '2031-08-01', 10, 'liquidacao', fin); exception when check_violation then ok := true; end;
  if not ok then raise exception 'E2 liquidacao do proprio aceita'; end if;
  ok := false; begin insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma)
    values (k, fin, date '2031-08-01', 0, 'conta'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'E2 valor 0 aceito'; end if;
  ok := false; begin update public.financiamentos set status = 'renegociado' where id = fin;
    exception when check_violation then ok := true; end;
  if not ok then raise exception 'E2 status de contrato invalido aceito'; end if;
  ok := false; begin update public.financiamentos set contrato_sucessor_id = fin where id = fin;
    exception when check_violation then ok := true; end;
  if not ok then raise exception 'E2 sucessor = o proprio aceito'; end if;
  ok := false; begin update public.financiamento_parcelas set status = 'atrasado' where id = parc;
    exception when check_violation then ok := true; end;
  if not ok then raise exception 'E2 status de parcela invalido aceito'; end if;
  ok := false; begin update public.financiamento_parcelas set tipo = 'balao' where id = parc;
    exception when check_violation then ok := true; end;
  if not ok then raise exception 'E2 tipo de parcela invalido aceito'; end if;

  /* E3 */
  perform set_config('request.jwt.claims', json_build_object('sub', c_user_nj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.financiamento_linhas_credito where id = lc) is distinct from 0
     or (select count(*) from public.financiamento_liberacoes where financiamento_id = fin) is distinct from 0 then
    raise exception 'E3 outro cliente leu';
  end if;
  ok := false; begin insert into public.financiamento_linhas_credito (cliente_id, descricao) values (k, 'SINT intruso');
    exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'E3 outro cliente gravou linha de credito'; end if;
  ok := false; begin insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma)
    values (k, fin, date '2031-09-01', 1, 'conta'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'E3 outro cliente gravou liberacao'; end if;
  update public.financiamento_liberacoes set observacao = 'SINT intruso' where id = lib;
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'E3 outro cliente alterou liberacao'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.financiamento_liberacoes where financiamento_id = fin) is distinct from 2 then
    raise exception 'E3 admin nao leu';
  end if;
  ok := false; begin delete from public.financiamento_liberacoes where id = lib;
    exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'E3 liberacao apagada (deveria so cancelar)'; end if;
  reset role;

  /* E4 */
  set local role anon;
  ok := false; begin perform 1 from public.financiamento_linhas_credito limit 1;
    exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'E4 anon leu linha de credito'; end if;
  ok := false; begin perform 1 from public.financiamento_liberacoes limit 1;
    exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'E4 anon leu liberacao'; end if;
  reset role;

  raise exception 'FIN-FINANC-28-P1: OK';
end
$teste$;
ROLLBACK;
