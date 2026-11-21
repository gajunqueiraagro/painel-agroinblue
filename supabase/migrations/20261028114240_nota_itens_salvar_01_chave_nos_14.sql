-- NOTA-ITENS-SALVAR-01 (Gabriel 18/11, OK às 10:3x) — os 14 documentos de NF do NJ já vinculados SEM chave, cuja nota está GUARDADA (nota_fiscal
-- com itens) com o mesmo nº, a mesma emissão e o mesmo valor (1 candidata cada; fornecedor do lançamento = emitente; a chave em nenhum outro
-- documento vivo). O lançamento acha os itens pela chave dos documentos dele: sem chave, a aba Itens ficava vazia (a Selluz NF 3.240, 50 itens).
-- Este lote só grava a CHAVE em cada documento (versão + 1; a trilha do documento registra). Nada mais muda.
-- Guardas (por linha; qualquer uma falha = nada grava): documento vivo, espécie nf, sem chave; o nº da chave = o nº do documento; a chave em nenhum
-- outro documento vivo; a nota guardada com itens. Backup: bkp_nota_itens_salvar_01_20261118 (id, chave_acesso, versao).
-- DESFAZER: update financeiro_lancamento_documentos d set chave_acesso = b.chave_acesso, versao = d.versao + 1
--   from bkp_nota_itens_salvar_01_20261118 b where b.id = d.id;
create table if not exists public.bkp_nota_itens_salvar_01_20261118 as
  select id, chave_acesso, versao, now() as guardado_em from public.financeiro_lancamento_documentos
  where id in ('3633b1ae-85a7-4779-8a6d-8b78c9752022','761a7bb5-636c-4947-9669-d707647d33ae','9f4430ba-93c8-4abf-85ed-5e00e665522a',
    'b30d2850-4038-4f68-9a18-3437de6a38c9','79de064e-f5c2-4c50-b65f-2bada7cd031f','666d46af-a61b-47dc-945f-3be3dbe350f8','0d30d516-d876-47fb-bc2c-796205833ab2',
    '115cb97a-554f-4ea7-9000-2158eab21b3e','f4b13d53-2cd1-4b68-8bc1-17bdd5ddbc76','e0c8f6f7-3216-4fc1-86a0-c5654b87e1bd','64b04812-b8c4-47a4-8f92-f63e56a45cfb',
    '0584ece2-5b62-4b04-9550-8fdf7248e659','53790a07-d5b1-41de-be7f-687862599c32','5a2cd556-a6ad-4cb0-b0fe-96eb32907b2f');
revoke all on public.bkp_nota_itens_salvar_01_20261118 from public, anon, authenticated;

do $$
declare
  v_cli constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  r record; v_n int := 0;
begin
  for r in select * from (values
    ('3633b1ae-85a7-4779-8a6d-8b78c9752022'::uuid, '50261018694015000162550030000107501000230103'),
    ('761a7bb5-636c-4947-9669-d707647d33ae'::uuid, '50260763627945001553550100000001101552181609'),
    ('9f4430ba-93c8-4abf-85ed-5e00e665522a'::uuid, '50260763627945001553550100000001111681406701'),
    ('b30d2850-4038-4f68-9a18-3437de6a38c9'::uuid, '50260804402825000193550010001184811612473584'),
    ('79de064e-f5c2-4c50-b65f-2bada7cd031f'::uuid, '50260904402825000193550010001192371845712637'),
    ('666d46af-a61b-47dc-945f-3be3dbe350f8'::uuid, '50260929316596000620550010001204811048993236'),
    ('0d30d516-d876-47fb-bc2c-796205833ab2'::uuid, '35260768864982000101550010000125781107914875'),
    ('115cb97a-554f-4ea7-9000-2158eab21b3e'::uuid, '35260996654934000116550010001909491000983008'),
    ('f4b13d53-2cd1-4b68-8bc1-17bdd5ddbc76'::uuid, '50260663627945001553550020000019591989621025'),
    ('e0c8f6f7-3216-4fc1-86a0-c5654b87e1bd'::uuid, '50260763627945001553550100000002031277909067'),
    ('64b04812-b8c4-47a4-8f92-f63e56a45cfb'::uuid, '50260909020800000149550010000032401740043407'),
    ('0584ece2-5b62-4b04-9550-8fdf7248e659'::uuid, '35260755334098000105550010000394231399392498'),
    ('53790a07-d5b1-41de-be7f-687862599c32'::uuid, '50260807900768000160550010000533981001506674'),
    ('5a2cd556-a6ad-4cb0-b0fe-96eb32907b2f'::uuid, '42260956308000000108550020000732391001293973')) as t(doc, chave)
  loop
    if not exists (select 1 from public.financeiro_lancamento_documentos x
                   where x.id = r.doc and x.cliente_id = v_cli and not x.cancelado and x.especie = 'nf'
                     and nullif(regexp_replace(coalesce(x.chave_acesso, ''), '\D', '', 'g'), '') is null
                     and ltrim(regexp_replace(coalesce(x.numero, ''), '\D', '', 'g'), '0') = ltrim(substr(r.chave, 26, 9), '0')) then
      raise exception 'NOTA-ITENS-SALVAR-01: o documento % não está como na prévia; nada gravado', left(r.doc::text, 8); end if;
    if exists (select 1 from public.financeiro_lancamento_documentos o
               where o.id <> r.doc and not o.cancelado and regexp_replace(coalesce(o.chave_acesso, ''), '\D', '', 'g') = r.chave) then
      raise exception 'NOTA-ITENS-SALVAR-01: a chave do % já está noutro documento; nada gravado', left(r.doc::text, 8); end if;
    if not exists (select 1 from public.nota_fiscal n where n.cliente_id = v_cli and regexp_replace(n.chave_acesso, '\D', '', 'g') = r.chave
                   and exists (select 1 from public.nota_fiscal_itens i where i.nota_id = n.id)) then
      raise exception 'NOTA-ITENS-SALVAR-01: a nota do % não está guardada com itens; nada gravado', left(r.doc::text, 8); end if;
    update public.financeiro_lancamento_documentos set chave_acesso = r.chave, versao = versao + 1 where id = r.doc;
    v_n := v_n + 1;
  end loop;
  if v_n <> 14 then raise exception 'NOTA-ITENS-SALVAR-01: % de 14; nada gravado', v_n; end if;
end $$;
