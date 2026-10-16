-- RESUMO-CLIENTES-01 passo a — `consultor_pendencias`: só o admin lê e escreve; o usuário de cliente e o `anon` não.
--   P1 admin insere, cobra (data + canal) e resolve; o carimbo atualizada_em/por anda
--   P2 UPDATE com cobrar_de / o_que vazio é recusado (CHECK); cobrança sem canal e resolvida sem data, também
--   P3 usuário do NJ (nj@, gestor só do NJ): lê 0 linhas, INSERT recusado, UPDATE não alcança nada
--   P4 `anon`: sem privilégio na tabela
--   P5 sem DELETE para ninguém; nenhuma linha de teste sobra (o bloco termina em RAISE e a transação é desfeita)
-- Roda como `postgres` dentro de BEGIN … ROLLBACK; o papel e o JWT são trocados dentro do bloco.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant text := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_user_nj constant text := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  v_id uuid; v_n int; v_r record; ok boolean;
begin
  /* P1 — admin */
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.consultor_pendencias (cliente_id, prazo, cobrar_de, o_que, origem_tipo, origem_ref)
    values (c_teste, current_date + 3, 'SINT Amanda', 'SINT acertos dos abates', 'conciliacao', '2026-09') returning id into v_id;
  select * into v_r from public.consultor_pendencias where id = v_id;
  if v_r.status is distinct from 'aberta' or v_r.criada_por is distinct from c_admin::uuid then raise exception 'P1 insert: %', v_r; end if;
  update public.consultor_pendencias set status = 'cobrada', ultima_cobranca_em = current_date, ultima_cobranca_canal = 'whatsapp' where id = v_id;
  select * into v_r from public.consultor_pendencias where id = v_id;
  if v_r.status is distinct from 'cobrada' or v_r.ultima_cobranca_canal is distinct from 'whatsapp' or v_r.atualizada_por is distinct from c_admin::uuid then
    raise exception 'P1 cobrar: %', v_r; end if;
  update public.consultor_pendencias set status = 'resolvida', resolvida_em = now() where id = v_id;
  select count(*) into v_n from public.consultor_pendencias where id = v_id and status = 'resolvida';
  if v_n is distinct from 1 then raise exception 'P1 resolver'; end if;

  /* P2 — o que o banco recusa */
  begin update public.consultor_pendencias set cobrar_de = '  ' where id = v_id; ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'P2 cobrar_de vazio passou'; end if;
  begin update public.consultor_pendencias set o_que = '' where id = v_id; ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'P2 o_que vazio passou'; end if;
  begin update public.consultor_pendencias set ultima_cobranca_canal = null where id = v_id; ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'P2 cobranca sem canal passou'; end if;
  begin update public.consultor_pendencias set resolvida_em = null where id = v_id; ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'P2 resolvida sem data passou'; end if;

  /* P5 — DELETE: nem o admin (sem privilégio) */
  begin delete from public.consultor_pendencias where id = v_id; ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'P5 delete passou'; end if;

  /* P3 — usuário do NJ */
  perform set_config('request.jwt.claims', json_build_object('sub', c_user_nj, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.consultor_pendencias;
  if v_n is distinct from 0 then raise exception 'P3 nj@ leu % linhas', v_n; end if;
  begin
    insert into public.consultor_pendencias (cliente_id, cobrar_de, o_que) values (c_teste, 'x', 'y'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'P3 nj@ inseriu'; end if;
  update public.consultor_pendencias set o_que = 'SINT invadido' where id = v_id;
  get diagnostics v_n = row_count;
  if v_n is distinct from 0 then raise exception 'P3 nj@ alterou % linhas', v_n; end if;

  /* P4 — anon */
  reset role;
  if has_table_privilege('anon', 'public.consultor_pendencias', 'SELECT')
     or has_table_privilege('anon', 'public.consultor_pendencias', 'INSERT')
     or has_table_privilege('anon', 'public.consultor_pendencias', 'UPDATE')
     or has_table_privilege('authenticated', 'public.consultor_pendencias', 'DELETE') then
    raise exception 'P4 privilégio a mais';
  end if;

  raise exception 'RESUMO-CLIENTES-01 pendencias: OK';
end
$teste$;
ROLLBACK;
