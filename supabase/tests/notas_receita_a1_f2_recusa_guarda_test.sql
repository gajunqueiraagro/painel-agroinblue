-- NOTAS-RECEITA-A1-01 · F2 — ENSAIO da 20261028113340 (roda como postgres; termina em RAISE 'OK…': NADA fica no banco). Antes deste
-- bloco, na MESMA transação, roda o corpo da migration. Fixture SINTÉTICO no cliente Teste (43f32d07…); um usuário comum do proto vira
-- gestor SÓ do Teste nesta transação.
do $$
declare
  a uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u uuid := '0e422659-9272-4ece-aee8-20e59ca75c8d';
  ta uuid; n int;
begin
  insert into public.fiscal_titulares (cliente_id, nome, documento) values (a, 'TITULAR SINTETICO 113340', '52998224725') returning id into ta;

  -- G1 · authenticated segue sem chamar
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_fiscal_certificado_recusa_registrar(ta, u, 'nao_a1');
    raise exception 'G1 FALHOU: authenticated registrou recusa';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- G2 · autor sem perfil de gestor no cliente: 42501, nada na trilha (a guarda NOVA)
  begin
    perform public.fn_fiscal_certificado_recusa_registrar(ta, u, 'nao_a1');
    raise exception 'G2 FALHOU: autor sem perfil registrou recusa';
  exception when insufficient_privilege then null; end;
  -- G3 · autor nulo: 42501
  begin
    perform public.fn_fiscal_certificado_recusa_registrar(ta, null, 'nao_a1');
    raise exception 'G3 FALHOU: autor nulo registrou recusa';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.fiscal_certificados_trilha where titular_id = ta;
  if n <> 0 then raise exception 'G2/G3 FALHOU: % linha(s) na trilha', n; end if;

  -- G4 · gestor do cliente: a recusa entra na trilha como antes (acao, via, motivo cortado em 200)
  insert into public.cliente_membros (user_id, cliente_id, perfil, ativo) values (u, a, 'gestor_cliente', true);
  perform public.fn_fiscal_certificado_recusa_registrar(ta, u, repeat('x', 250));
  select count(*) into n from public.fiscal_certificados_trilha
   where titular_id = ta and acao = 'recusado_upload' and autor = u and via = 'borda:fiscal-certificado-subir' and length(motivo) = 200;
  if n <> 1 then raise exception 'G4 FALHOU: % linha(s) da recusa do gestor', n; end if;

  -- G5 · titular que não existe: volta calado (como antes)
  perform public.fn_fiscal_certificado_recusa_registrar(gen_random_uuid(), u, 'nao_a1');

  raise exception 'OK 113340: G1–G5';
end $$;
