-- NOTAS-RECEITA-A1-01 · F1 — ENSAIO (roda como postgres; termina em RAISE 'OK…': NADA fica no banco). Antes deste bloco, na MESMA
-- transação, roda o corpo de supabase/migrations/20261028113300_notas_receita_a1_f1.sql.
-- Fixture SINTÉTICO: o cliente Teste (43f32d07…) é o A; um cliente B criado aqui; um usuário comum do proto vira gestor SÓ do A nesta
-- transação. CPFs de teste (válidos pelo dígito, de ninguém): 52998224725 e 11144477735. Nenhum certificado real (só metadados falsos).
do $$
declare
  a uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  b uuid;
  u uuid := '0e422659-9272-4ece-aee8-20e59ca75c8d';
  ta uuid; tb uuid; ca uuid; cb uuid; n int; r jsonb; ok boolean;
  fp text := repeat('ab', 32);
begin
  insert into public.clientes (nome) values ('CLIENTE B SINTETICO DO ENSAIO A1') returning id into b;
  insert into public.cliente_membros (user_id, cliente_id, perfil, ativo) values (u, a, 'gestor_cliente', true);
  insert into public.fiscal_titulares (cliente_id, nome, documento) values (a, 'TITULAR A SINTETICO', '52998224725') returning id into ta;
  insert into public.fiscal_titulares (cliente_id, nome, documento) values (b, 'TITULAR B SINTETICO', '11144477735') returning id into tb;
  insert into public.fiscal_certificados (cliente_id, titular_id, documento, impressao_digital, valido_de, valido_ate)
    values (a, ta, '52998224725', fp, now() - interval '1 day', now() + interval '1 year') returning id into ca;
  insert into public.fiscal_certificados (cliente_id, titular_id, documento, impressao_digital, valido_de, valido_ate)
    values (b, tb, '11144477735', repeat('cd', 32), now() - interval '1 day', now() + interval '1 year') returning id into cb;
  insert into public.fiscal_certificados_cofre values (ca, 'a/sintetico.pfx.enc', null), (cb, 'b/sintetico.pfx.enc', null);
  insert into public.fiscal_dfe_recebidos (cliente_id, titular_id, chave) values (a, ta, repeat('1', 44)), (b, tb, repeat('2', 44));

  -- T7 · um ATIVO por titular
  begin
    insert into public.fiscal_certificados (cliente_id, titular_id, documento, impressao_digital, valido_de, valido_ate)
      values (a, ta, '52998224725', repeat('ef', 32), now(), now() + interval '1 year');
    raise exception 'T7 FALHOU: dois certificados ativos no mesmo titular';
  exception when unique_violation then null; end;
  -- T9 · a chave é única por cliente
  begin
    insert into public.fiscal_dfe_recebidos (cliente_id, titular_id, chave) values (a, ta, repeat('1', 44));
    raise exception 'T9 FALHOU: a mesma chave duas vezes no cliente';
  exception when unique_violation then null; end;
  -- T5 · a trilha não se altera
  insert into public.fiscal_certificados_trilha (cliente_id, titular_id, certificado_id, acao) values (a, ta, ca, 'subiu');
  begin
    update public.fiscal_certificados_trilha set acao = 'revogou' where certificado_id = ca;
    raise exception 'T5 FALHOU: a trilha foi alterada';
  exception when raise_exception then
    if sqlerrm not like 'A trilha do certificado não se altera%' then raise; end if;
  end;

  -- ── como o usuário U (authenticated, gestor SÓ do A) ──
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T1 · RLS: vê o do A, não vê o do B (o conjunto: 2 certificados, 2 documentos na caixa)
  select count(*) into n from public.fiscal_certificados;
  if n <> 1 then raise exception 'T1 FALHOU: U vê % certificados (esperado 1, o do A)', n; end if;
  select count(*) into n from public.fiscal_certificados where id = cb;
  if n <> 0 then raise exception 'T1 FALHOU: U vê o certificado do B'; end if;
  select count(*) into n from public.fiscal_dfe_recebidos;
  if n <> 1 then raise exception 'T1 FALHOU: U vê % documentos na caixa (esperado 1)', n; end if;
  -- T2 · o cofre: nem o do próprio cliente
  begin
    perform 1 from public.fiscal_certificados_cofre;
    raise exception 'T2 FALHOU: U leu o cofre';
  exception when insufficient_privilege then null; end;
  -- T8 · authenticated não grava em nada
  begin
    insert into public.fiscal_dfe_recebidos (cliente_id, titular_id, chave) values (a, ta, repeat('3', 44));
    raise exception 'T8 FALHOU: U gravou na caixa';
  exception when insufficient_privilege then null; end;
  begin
    update public.fiscal_certificados set situacao = 'revogado' where id = ca;
    raise exception 'T8 FALHOU: U alterou o certificado direto';
  exception when insufficient_privilege then null; end;
  -- T3 · revogar o do B: 42501 (nunca vazio)
  begin
    perform public.fn_fiscal_certificado_revogar(cb, 'teste', false);
    raise exception 'T3 FALHOU: U revogou o certificado do B';
  exception when insufficient_privilege then null; end;
  -- T4 · revogar o do A: simular dá a frase e não grava; gravar revoga e deixa trilha
  r := public.fn_fiscal_certificado_revogar(ca, 'perdi o certificado', true);
  if (r->>'gravado')::boolean or r->>'frase' not like 'Revoga o certificado de TITULAR A SINTETICO%' then raise exception 'T4 FALHOU (simular): %', r; end if;
  begin
    perform public.fn_fiscal_certificado_revogar(ca, '  ', false);
    raise exception 'T4 FALHOU: revogou sem motivo';
  exception when raise_exception then if sqlerrm <> 'Diga o motivo da revogação.' then raise; end if; end;
  r := public.fn_fiscal_certificado_revogar(ca, 'perdi o certificado', false);
  execute 'reset role';
  select situacao = 'revogado' and revogado_por = u into ok from public.fiscal_certificados where id = ca;
  if not ok then raise exception 'T4 FALHOU: não ficou revogado por U'; end if;
  select count(*) into n from public.fiscal_certificados_trilha where certificado_id = ca and acao = 'revogou' and autor = u and motivo = 'perdi o certificado';
  if n <> 1 then raise exception 'T4 FALHOU: trilha da revogação = %', n; end if;

  -- T6 · o perfil financeiro do A: lê, mas não revoga
  update public.cliente_membros set perfil = 'financeiro' where user_id = u and cliente_id = a;
  update public.fiscal_certificados set situacao = 'ativo', revogado_por = null, revogado_em = null, revogado_motivo = null where id = ca;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_fiscal_certificado_revogar(ca, 'teste', false);
    raise exception 'T6 FALHOU: o perfil financeiro revogou';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  raise exception 'OK NOTAS-RECEITA-A1-01 F1 — T1 RLS (1 de 2 certificados, 1 de 2 documentos) · T2 cofre fechado · T3 42501 no outro cliente · T4 simular/motivo/revogar + trilha · T5 trilha imutável · T6 financeiro não revoga · T7 um ativo por titular · T8 authenticated não grava · T9 chave única (nada fica no banco)';
end $$;
