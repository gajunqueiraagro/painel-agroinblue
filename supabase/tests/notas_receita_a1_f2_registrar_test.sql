-- NOTAS-RECEITA-A1-01 · F2 — ENSAIO da 20261028113320 (roda como postgres; termina em RAISE 'OK…': NADA fica no banco, nem o segredo do
-- Vault). Antes deste bloco, na MESMA transação, roda o corpo da migration. Fixture SINTÉTICO no cliente Teste (43f32d07…); um usuário comum
-- do proto vira gestor SÓ do Teste nesta transação; CPFs de teste (válidos pelo dígito, de ninguém); nenhum certificado real.
do $$
declare
  a uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u uuid := '0e422659-9272-4ece-aee8-20e59ca75c8d';
  ta uuid; r jsonb; r2 jsonb; n int; v_seg uuid; v_sit text; v_subst uuid; v_senha text;
  meta jsonb := jsonb_build_object('documento', '529.982.247-25', 'emissor', 'AC SINTETICA', 'numero_serie', '0a1b',
    'impressao_digital', repeat('ab', 32), 'valido_de', '2026-01-01T00:00:00Z', 'valido_ate', '2027-01-01T00:00:00Z');
begin
  insert into public.fiscal_titulares (cliente_id, nome, documento) values (a, 'TITULAR SINTETICO F2', '52998224725') returning id into ta;

  -- R1 · authenticated não chama
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_fiscal_certificado_registrar(ta, u, meta, 'a/x.pfx.enc', 'senha');
    raise exception 'R1 FALHOU: authenticated registrou';
  exception when insufficient_privilege then null; end;
  begin
    perform public.fn_fiscal_certificado_recusa_registrar(ta, u, 'x');
    raise exception 'R1 FALHOU: authenticated registrou recusa';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- R2 · autor sem perfil de gestor no cliente: 42501
  begin
    perform public.fn_fiscal_certificado_registrar(ta, u, meta, 'a/x.pfx.enc', 'senha');
    raise exception 'R2 FALHOU: autor sem perfil registrou';
  exception when insufficient_privilege then null; end;
  insert into public.cliente_membros (user_id, cliente_id, perfil, ativo) values (u, a, 'gestor_cliente', true);

  -- R3 · documento de outro CPF
  begin
    perform public.fn_fiscal_certificado_registrar(ta, u, meta || '{"documento":"11144477735"}', 'a/x.pfx.enc', 'senha');
    raise exception 'R3 FALHOU: registrou certificado de outro CPF';
  exception when raise_exception then if sqlerrm not like 'O certificado é de outro CPF/CNPJ%' then raise; end if; end;

  -- R4 · subiu: ativo, cofre com o segredo, a senha no Vault, trilha 'subiu'
  r := public.fn_fiscal_certificado_registrar(ta, u, meta, 'a/1.pfx.enc', 'senha-sintetica-1');
  if r->>'acao' <> 'subiu' then raise exception 'R4 FALHOU: %', r; end if;
  select c.situacao, k.segredo_id into v_sit, v_seg from public.fiscal_certificados c join public.fiscal_certificados_cofre k on k.certificado_id = c.id
   where c.id = (r->>'certificado_id')::uuid;
  if v_sit <> 'ativo' or v_seg is null then raise exception 'R4 FALHOU: situação % segredo %', v_sit, v_seg; end if;
  select decrypted_secret into v_senha from vault.decrypted_secrets where id = v_seg;
  if v_senha is distinct from 'senha-sintetica-1' then raise exception 'R4 FALHOU: a senha não está no Vault'; end if;
  select count(*) into n from public.fiscal_certificados_trilha where certificado_id = (r->>'certificado_id')::uuid and acao = 'subiu' and autor = u;
  if n <> 1 then raise exception 'R4 FALHOU: trilha subiu = %', n; end if;
  -- a senha não fica em lugar nenhum fora do Vault
  select count(*) into n from public.fiscal_certificados_trilha where detalhe::text like '%senha-sintetica%' or coalesce(motivo, '') like '%senha-sintetica%';
  if n <> 0 then raise exception 'R4 FALHOU: a senha vazou na trilha'; end if;

  -- R5 · o mesmo certificado de novo: recusa
  begin
    perform public.fn_fiscal_certificado_registrar(ta, u, meta, 'a/1b.pfx.enc', 'senha-sintetica-1');
    raise exception 'R5 FALHOU: registrou o mesmo certificado duas vezes';
  exception when raise_exception then if sqlerrm not like 'Este certificado já é o ativo%' then raise; end if; end;

  -- R6 · trocar: o anterior vira substituído (apontando o novo), o novo ativo, trilha 'trocou'
  r2 := public.fn_fiscal_certificado_registrar(ta, u, meta || jsonb_build_object('impressao_digital', repeat('cd', 32)), 'a/2.pfx.enc', 'senha-sintetica-2');
  select situacao, substituido_por into v_sit, v_subst from public.fiscal_certificados where id = (r->>'certificado_id')::uuid;
  if r2->>'acao' <> 'trocou' or v_sit <> 'substituido' or v_subst <> (r2->>'certificado_id')::uuid then raise exception 'R6 FALHOU: % % %', r2, v_sit, v_subst; end if;
  select count(*) into n from public.fiscal_certificados where titular_id = ta and situacao = 'ativo';
  if n <> 1 then raise exception 'R6 FALHOU: % ativos', n; end if;

  -- R7 · a recusa da borda deixa trilha
  perform public.fn_fiscal_certificado_recusa_registrar(ta, u, 'nao_a1');
  select count(*) into n from public.fiscal_certificados_trilha where titular_id = ta and acao = 'recusado_upload' and motivo = 'nao_a1' and autor = u;
  if n <> 1 then raise exception 'R7 FALHOU: trilha da recusa = %', n; end if;

  raise exception 'OK NOTAS-RECEITA-A1-01 F2 113320 — R1 authenticated barrado · R2 42501 sem perfil · R3 outro CPF · R4 subiu + senha no Vault + trilha (sem a senha) · R5 mesmo certificado recusado · R6 trocou (substituído → novo) · R7 recusa na trilha (nada fica no banco)';
end $$;
