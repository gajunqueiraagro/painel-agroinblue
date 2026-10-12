-- FECH-DOCS-01 — `pecuaria_fechamento_documentos`: RLS por cliente, sem DELETE, CHECKs e o bucket `pec-documentos`.
-- Sintetico no cliente Teste + um segundo cliente criado na transacao; termina em RAISE 'OK …' (nada fica no banco).
-- Compara com `is distinct from`, nunca `<>`.
--   D0 o detector sabe achar: como dono, as duas linhas sinteticas existem
--   D1 admin do AGROinBLUE le^ as duas (a do Teste e a do segundo cliente)
--   D2 usuario comum de OUTRO cliente (gestor real, simulado por jwt) nao le^ nenhuma, nao insere no Teste e o UPDATE dele
--      nao alcanca linha nenhuma
--   D3 sem DELETE para `authenticated` (nem o admin): 42501; `anon` nao le^
--   D4 CHECKs: especie fora do vocabulario, mes invalido, nome em branco, cancelado sem motivo
--   D5 renomear sobe a versao; cancelar com motivo passa
--   D6 bucket privado de 10 MB com as quatro policies
-- ⚠ NAO PROVADO AQUI: usuario comum lendo o documento do PROPRIO cliente (o Teste so' tem o admin como membro, e este teste
--   nao escreve em `cliente_membros`).
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  k2 uuid; f2 uuid; d1 uuid; d2 uuid; g uuid; n int; v_estado text; v_n int;
begin
  insert into public.clientes (nome) values ('SINT Cliente Dois') returning id into k2;
  insert into public.fazendas (cliente_id, nome, codigo, owner_id) values (k2, 'SINT Fazenda B', 'SINTB', adm) returning id into f2;
  insert into public.pecuaria_fechamento_documentos (cliente_id, fazenda_id, ano_mes, nome) values (k, f, '2031-03', 'SINT a.pdf') returning id into d1;
  insert into public.pecuaria_fechamento_documentos (cliente_id, fazenda_id, ano_mes, nome) values (k2, f2, '2031-03', 'SINT b.pdf') returning id into d2;

  -- D0
  select count(*) into n from public.pecuaria_fechamento_documentos where id in (d1, d2);
  if n is distinct from 2 then raise exception 'D0 o detector nao acha as linhas sinteticas (%)', n; end if;
  if (select especie || '/' || versao || '/' || cancelado from public.pecuaria_fechamento_documentos where id = d1) is distinct from 'outro/1/false' then
    raise exception 'D0 a linha nao nasce outro / versao 1 / viva'; end if;

  -- um usuario comum de OUTRO cliente (nem do Teste, nem do segundo)
  select m.user_id into g from public.cliente_membros m
   where m.ativo and m.perfil <> 'admin_agroinblue' and m.cliente_id <> k and exists (select 1 from auth.users u where u.id = m.user_id)
     and not exists (select 1 from public.cliente_membros a where a.user_id = m.user_id and a.ativo and a.perfil = 'admin_agroinblue')
   order by m.user_id limit 1;
  if g is null then raise exception 'D2 nao ha usuario comum para simular'; end if;

  -- D1 admin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.pecuaria_fechamento_documentos where id in (d1, d2);
  if n is distinct from 2 then reset role; raise exception 'D1 admin le^ % de 2', n; end if;

  -- D3 sem DELETE, nem para o admin
  begin
    delete from public.pecuaria_fechamento_documentos where id = d1;
    v_estado := 'APAGOU';
  exception when others then get stacked diagnostics v_estado = returned_sqlstate; end;
  if v_estado is distinct from '42501' then reset role; raise exception 'D3 DELETE como authenticated: %', v_estado; end if;

  -- D5 renomear sobe a versao; cancelar com motivo
  update public.pecuaria_fechamento_documentos set especie = 'nascimentos', nome = 'SINT nascimentos.pdf', versao = versao + 1 where id = d1 and versao = 1;
  get diagnostics v_n = row_count;
  if v_n is distinct from 1 then reset role; raise exception 'D5 renomear nao alcancou a linha'; end if;
  update public.pecuaria_fechamento_documentos set cancelado = true, cancelado_motivo = 'SINT motivo', cancelado_em = now(), cancelado_por = adm where id = d2;
  reset role;
  if (select especie || '/' || versao from public.pecuaria_fechamento_documentos where id = d1) is distinct from 'nascimentos/2'
     or (select cancelado from public.pecuaria_fechamento_documentos where id = d2) is distinct from true then
    raise exception 'D5 renomear / cancelar nao gravaram'; end if;

  -- D2 usuario comum de outro cliente
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.pecuaria_fechamento_documentos where id in (d1, d2);
  if n is distinct from 0 then reset role; raise exception 'D2 usuario de outro cliente le^ % linha(s)', n; end if;
  begin
    insert into public.pecuaria_fechamento_documentos (cliente_id, fazenda_id, ano_mes, nome) values (k, f, '2031-03', 'SINT intruso.pdf');
    v_estado := 'INSERIU';
  exception when others then get stacked diagnostics v_estado = returned_sqlstate; end;
  if v_estado is distinct from '42501' then reset role; raise exception 'D2 INSERT em cliente alheio: %', v_estado; end if;
  update public.pecuaria_fechamento_documentos set nome = 'SINT trocado' where id = d1;
  get diagnostics v_n = row_count;
  reset role;
  if v_n is distinct from 0 or (select nome from public.pecuaria_fechamento_documentos where id = d1) is distinct from 'SINT nascimentos.pdf' then
    raise exception 'D2 UPDATE em cliente alheio alcancou % linha(s)', v_n; end if;

  -- D3 anon nao le^
  if has_table_privilege('anon', 'public.pecuaria_fechamento_documentos', 'SELECT')
     or has_table_privilege('authenticated', 'public.pecuaria_fechamento_documentos', 'DELETE') then raise exception 'D3 privilegios'; end if;

  -- D4 CHECKs (como dono)
  begin insert into public.pecuaria_fechamento_documentos (cliente_id, fazenda_id, ano_mes, nome, especie) values (k, f, '2031-03', 'x', 'boleto'); v_estado := 'PASSOU';
  exception when others then get stacked diagnostics v_estado = returned_sqlstate; end;
  if v_estado is distinct from '23514' then raise exception 'D4 especie fora do vocabulario: %', v_estado; end if;
  begin insert into public.pecuaria_fechamento_documentos (cliente_id, fazenda_id, ano_mes, nome) values (k, f, '2031-13', 'x'); v_estado := 'PASSOU';
  exception when others then get stacked diagnostics v_estado = returned_sqlstate; end;
  if v_estado is distinct from '23514' then raise exception 'D4 mes invalido: %', v_estado; end if;
  begin insert into public.pecuaria_fechamento_documentos (cliente_id, fazenda_id, ano_mes, nome) values (k, f, '2031-03', '  '); v_estado := 'PASSOU';
  exception when others then get stacked diagnostics v_estado = returned_sqlstate; end;
  if v_estado is distinct from '23514' then raise exception 'D4 nome em branco: %', v_estado; end if;
  begin update public.pecuaria_fechamento_documentos set cancelado = true where id = d1; v_estado := 'PASSOU';
  exception when others then get stacked diagnostics v_estado = returned_sqlstate; end;
  if v_estado is distinct from '23514' then raise exception 'D4 cancelado sem motivo: %', v_estado; end if;

  -- D6 bucket e policies
  if (select count(*) from storage.buckets where id = 'pec-documentos' and public = false and file_size_limit = 10485760
        and allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']) is distinct from 1
     or (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in
          ('pec_doc_admin', 'pec_doc_select', 'pec_doc_insert', 'pec_doc_update')) is distinct from 4 then
    raise exception 'D6 bucket / policies'; end if;

  raise exception 'OK pecuaria_fechamento_documentos_01 (D0-D6)';
end $teste$;
ROLLBACK;
