-- NOTAS-RECEITA-A1-01 · F2 (desenho de segurança aprovado pelo Gabriel 13/11; D2–D6 aprovadas; Chat 10:45) — o REGISTRO do certificado
-- que a função de borda `fiscal-certificado-subir` já abriu e conferiu (`_shared/certificadoA1.ts`). Numa transação só:
--   · confere de novo, no banco, quem pode (admin AgroinBlue ou gestor DAQUELE cliente — D2), resolvendo o cliente PELO TITULAR;
--   · confere que o documento lido do certificado é o do titular;
--   · o ativo anterior do titular vira "substituído" (nunca apagado) e o novo entra ativo;
--   · a SENHA vai para o Vault (`vault.create_secret`), e só o id do segredo fica no cofre; o .pfx CIFRADO já está no bucket privado
--     (`p_objeto` é só o caminho);
--   · trilha imutável: 'subiu' ou 'trocou'; a recusa da borda também deixa trilha ('recusado_upload', `fn_fiscal_certificado_recusa_registrar`).
-- ⚠ SÓ service_role: o `authenticated` nunca chama (quem lê o .pfx e a senha é a borda). O autor vem da borda (`auth.getUser` do token de
-- quem chamou) porque, como service_role, `auth.uid()` é nulo. Bucket, segredo da chave-mestra e deploy da borda: cada um com o próprio GO.
set local lock_timeout = '2s';

create or replace function public.fn_fiscal_certificado_registrar(p_titular_id uuid, p_autor uuid, p_meta jsonb, p_objeto text, p_senha text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares;
  v_ant public.fiscal_certificados;
  v_id uuid := gen_random_uuid();
  v_seg uuid;
  v_doc text := regexp_replace(coalesce(p_meta->>'documento', ''), '\D', '', 'g');
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then raise exception using errcode = 'P0001', message = 'Produtor não encontrado. Nada foi gravado.'; end if;
  if p_autor is null or not (coalesce(public.is_admin_agroinblue(p_autor), false)
                             or coalesce(public.get_user_perfil(p_autor, t.cliente_id)::text = 'gestor_cliente', false)) then
    raise exception using errcode = '42501', message = 'Só o administrador do cliente sobe o certificado.';
  end if;
  if v_doc = '' or v_doc <> regexp_replace(coalesce(t.documento, ''), '\D', '', 'g') then
    raise exception using errcode = 'P0001', message = 'O certificado é de outro CPF/CNPJ, não deste produtor. Nada foi gravado.';
  end if;
  if coalesce(btrim(p_objeto), '') = '' or coalesce(p_senha, '') = '' then
    raise exception using errcode = 'P0001', message = 'Faltou o arquivo cifrado ou a senha. Nada foi gravado.';
  end if;
  select * into v_ant from public.fiscal_certificados where titular_id = t.id and situacao = 'ativo' for update;
  if v_ant.id is not null and v_ant.impressao_digital = p_meta->>'impressao_digital' then
    raise exception using errcode = 'P0001', message = 'Este certificado já é o ativo deste produtor. Nada foi gravado.';
  end if;

  /* o anterior sai do "ativo" ANTES de o novo entrar (um ativo por titular); a seta para o novo só depois que ele existe (FK) */
  if v_ant.id is not null then
    update public.fiscal_certificados set situacao = 'substituido' where id = v_ant.id;
  end if;
  insert into public.fiscal_certificados (id, cliente_id, titular_id, documento, emissor, numero_serie, impressao_digital, valido_de, valido_ate,
                                          situacao, enviado_por)
  values (v_id, t.cliente_id, t.id, v_doc, p_meta->>'emissor', p_meta->>'numero_serie', p_meta->>'impressao_digital',
          (p_meta->>'valido_de')::timestamptz, (p_meta->>'valido_ate')::timestamptz, 'ativo', p_autor);
  if v_ant.id is not null then
    update public.fiscal_certificados set substituido_por = v_id where id = v_ant.id;
  end if;
  v_seg := vault.create_secret(p_senha, 'fiscal_cert_' || v_id::text, 'senha do certificado A1 ' || v_id::text);
  insert into public.fiscal_certificados_cofre (certificado_id, objeto, segredo_id) values (v_id, p_objeto, v_seg);
  insert into public.fiscal_certificados_trilha (cliente_id, titular_id, certificado_id, acao, autor, via, detalhe)
  values (t.cliente_id, t.id, v_id, case when v_ant.id is null then 'subiu' else 'trocou' end, p_autor, 'borda:fiscal-certificado-subir',
          jsonb_build_object('impressao_digital', p_meta->>'impressao_digital', 'valido_ate', p_meta->>'valido_ate', 'anterior', v_ant.id));
  return jsonb_build_object('certificado_id', v_id, 'acao', case when v_ant.id is null then 'subiu' else 'trocou' end, 'anterior', v_ant.id);
end $$;
revoke all on function public.fn_fiscal_certificado_registrar(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.fn_fiscal_certificado_registrar(uuid, uuid, jsonb, text, text) to service_role;

-- a recusa da borda também fica na trilha (quem tentou, quando, por quê — nunca o arquivo nem a senha)
create or replace function public.fn_fiscal_certificado_recusa_registrar(p_titular_id uuid, p_autor uuid, p_recusa text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare t public.fiscal_titulares;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then return; end if;
  insert into public.fiscal_certificados_trilha (cliente_id, titular_id, acao, autor, via, motivo)
  values (t.cliente_id, t.id, 'recusado_upload', p_autor, 'borda:fiscal-certificado-subir', left(coalesce(p_recusa, ''), 200));
end $$;
revoke all on function public.fn_fiscal_certificado_recusa_registrar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_fiscal_certificado_recusa_registrar(uuid, uuid, text) to service_role;
