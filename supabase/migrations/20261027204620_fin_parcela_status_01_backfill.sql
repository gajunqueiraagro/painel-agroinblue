-- FIN-PARCELA-STATUS-01, backfill (Gabriel, 20/10/2026: "OK para as 138 'coluna pendente, lançamentos pagos'") — as 138 parcelas vivas cuja
-- coluna diz 'pendente' e cujos lancamentos vivos estao TODOS realizados ou conciliados passam a 'pago', com a data de pagamento dos lancamentos
-- (a maior entre principal e juros). Por cliente: Vera 73 (parcelamento) · NJ 55 (54 parcelamento, 1 financiamento) · Agnaldo 8 (5 parcelamento,
-- 3 do consorcio 002122) · Santa Rita 1 (financiamento) · Teste 1 (financiamento). A lista e' por ID da parcela.
-- FICAM COMO ESTAO: a parcela 'pendente' com o principal pago e o juros em aberto (parcial: 'pendente' ja' e' o que a regra grava), a da Santa
-- Rita 'pago' com o lancamento em aberto (retida pelo Gabriel), as 83 sem lancamento vivo, e `ajustada` (nao e' lida nem gravada aqui).
-- QUEM GRAVA e' o escritor da regra (`_fn_parcela_status_alinhar`), parcela a parcela; nenhum lancamento e' tocado.
-- TRILHA: `fin_parcela_status_01_backfill` (o antes e o depois de cada parcela, com o motivo "status alinhado aos lançamentos —
-- FIN-PARCELA-STATUS-01"; RLS ligada, sem acesso para anon/authenticated).
--   ⚠ NAO em `financiamento_parcelas_operacoes`, como pedia o briefing: aquela tabela nao tem coluna de motivo, o CHECK do `tipo` so' aceita
--   editar | regerar | reajuste | contemplar, e a operacao viva mais nova de um contrato e' a que o "Desfazer a ultima" da tela desfaz — uma
--   operacao do backfill passaria a ser a ultima do consorcio 002122 e do 8.233.040 (os dois contratos com operacao viva hoje).
-- GUARDA: cada uma das 138 tem de estar no estado medido (viva, 'pendente', os lancamentos dizendo 'pago'); senao, aborta e nada e' gravado.
-- GESTO CONTRARIO: a coluna segue os lancamentos — devolver uma parcela a 'pendente' e' desfazer o pagamento do lancamento dela no Financeiro.
set local lock_timeout = '2s';

create table if not exists public.fin_parcela_status_01_backfill (
  parcela_id uuid primary key,
  financiamento_id uuid not null,
  cliente_id uuid,
  status_antes text, data_pagamento_antes date,
  status_depois text, data_pagamento_depois date,
  ajustada boolean,
  motivo text not null default 'status alinhado aos lançamentos — FIN-PARCELA-STATUS-01',
  feito_em timestamptz not null default clock_timestamp(),
  feito_por uuid
);
alter table public.fin_parcela_status_01_backfill enable row level security;
revoke all on table public.fin_parcela_status_01_backfill from anon, authenticated;

create temp table _ps01_ids (id uuid primary key) on commit drop;
insert into _ps01_ids (id) values
  ('031bedc2-b830-48d7-8c7d-037722b01d9e'::uuid),
  ('036b7d12-d6d5-42a9-8c63-d7fb346df14a'::uuid),
  ('0608eee2-f7b7-470b-8cdd-99c3596338e5'::uuid),
  ('0775651a-d6fc-4524-abee-4d404056becd'::uuid),
  ('0b3cee10-0dae-4eef-8f65-7c3216de3497'::uuid),
  ('0e7ae0ab-e62e-4ae2-9a59-5258eed9b53c'::uuid),
  ('0f8d1f40-86ce-437a-9c07-54220b2ffb51'::uuid),
  ('118c7afc-90a1-4ea9-b04e-29e705e6f430'::uuid),
  ('1350a0bf-5b8b-47e7-9ec4-3d04452ddc44'::uuid),
  ('14a2b8d0-1ade-4584-b16f-befe563dd6f1'::uuid),
  ('15c3cece-efd5-4f1a-a94e-af484b0096c6'::uuid),
  ('160e6860-43af-4943-9fa4-b7a77b5a27aa'::uuid),
  ('17b558a0-fc07-4c86-8957-0310e84c7b91'::uuid),
  ('17be885c-0e95-4872-9aed-bc2851030b67'::uuid),
  ('186f9aa4-3325-4ba8-9f14-b3d4f758ec2e'::uuid),
  ('1c093ead-cdab-4d82-ad9e-e20af63dd349'::uuid),
  ('1db694d8-a204-4128-a7b4-011fcf251583'::uuid),
  ('1e4a79e0-89e8-4088-8364-019ce5625009'::uuid),
  ('1e5ce5dd-d123-4ad8-baba-705b1314ba9b'::uuid),
  ('2144e837-ebb8-4414-82d1-2eca1b7d89e1'::uuid),
  ('229cd08f-4686-4f3f-abfc-b1dbd0394660'::uuid),
  ('259acd66-8134-458c-9179-aa06c1669b64'::uuid),
  ('290c31b5-d834-4cee-828d-1cf587e5f720'::uuid),
  ('2c5bb6c6-b017-4bfc-a918-1982f874edf1'::uuid),
  ('2cea65fe-80d9-4e87-b0b6-137b9b6b07b2'::uuid),
  ('309dc3f1-3b2c-4904-a245-7e858fe3ce38'::uuid),
  ('34f3b5e6-0c2e-4f59-96ef-0493d5dabd2a'::uuid),
  ('35353b22-a422-4b27-8cfd-842d1fe8c21e'::uuid),
  ('36d3d21f-19c9-4d27-b9a1-254221758952'::uuid),
  ('3f60d50b-80cf-4c17-8895-50d9ace2b1a2'::uuid),
  ('4149feff-cc32-4409-bb89-8d1164eaed6e'::uuid),
  ('463a8c7e-f8d9-44a2-94cb-8905ba1ebdba'::uuid),
  ('4751afc8-d214-415f-ade6-53c02f49849c'::uuid),
  ('4786b713-44bf-4334-97b4-e5aa099b9f78'::uuid),
  ('48c52da8-4e9e-4e5d-a320-871523c14475'::uuid),
  ('4c4a67e5-cf5a-426a-8c84-cef9d197dee1'::uuid),
  ('4e1c2ddf-b00c-47ea-975a-9317f7aa776a'::uuid),
  ('4e60a674-f5ae-4448-b89a-789420d15abd'::uuid),
  ('4ff50536-94dd-4415-af64-cefa9a833380'::uuid),
  ('50a3515a-98f9-41a1-8c88-d483099ffefa'::uuid),
  ('548e5cff-29b4-4526-ac04-49d1d75aace0'::uuid),
  ('5b5e5c9a-29dc-4ad1-b19f-7dc95ffcdde9'::uuid),
  ('5c4a128d-cc7a-4c94-8282-8434e2cb789e'::uuid),
  ('5c950a30-e166-4491-8da0-8e7f7a4cc300'::uuid),
  ('626f2844-ba60-4ddd-b5cc-f919efdd9149'::uuid),
  ('64aa41da-17c4-41a3-a262-c5bd6f3933cf'::uuid),
  ('64cc75fb-7dd2-4425-b130-b5c84d5b60cd'::uuid),
  ('655f666d-809e-4d64-bd99-2f1c8ad6c434'::uuid),
  ('6a747f66-f287-4a35-9dd6-796b6391523b'::uuid),
  ('6b7b459d-79fe-4ada-a765-7f03a984ab84'::uuid),
  ('6da09b0f-a711-4a45-8236-ea4c799da4a1'::uuid),
  ('6fc94139-577f-446e-b814-baa6a58a1d19'::uuid),
  ('711c19c8-c751-492f-8f81-1af102bf1a6b'::uuid),
  ('7211b5eb-ceeb-47ab-9367-4fc9076db8de'::uuid),
  ('737eb834-a076-48c5-8d1d-6d58374bfbc8'::uuid),
  ('73c81df5-9e3c-4001-aba2-e4e0189f87b1'::uuid),
  ('73f2e0b7-2248-4ee2-8993-8cf2c49804fd'::uuid),
  ('750b37c0-178a-4f6e-8395-6f1b6f05d1f6'::uuid),
  ('7519807f-7c66-47b2-95b2-ebce3b41c8f8'::uuid),
  ('7537b7b3-3614-49ba-be20-cd6ac00adaa7'::uuid),
  ('7621ed46-5077-4771-b5e5-53f9c5091c1d'::uuid),
  ('7689c5cd-f47d-40ad-a0b0-8f0793613300'::uuid),
  ('76ccd712-0c1f-4772-bb5d-b507fc103b48'::uuid),
  ('77a308bb-b56c-4cd7-a6ef-03e6bedebf92'::uuid),
  ('77cd1d34-03d1-4df1-9a82-573a82b39f20'::uuid),
  ('788a5e0b-7c89-47a2-8ce1-17d3a1b4b46b'::uuid),
  ('78c8af1d-67ba-4f26-b652-ced014badc39'::uuid),
  ('79c8def9-251e-4758-93b2-beb004365ed3'::uuid),
  ('7b3881a6-616d-46fe-bd67-0cef5127c8d7'::uuid),
  ('7c2dda8a-29fe-43fc-9326-fee626401a31'::uuid),
  ('7d1b749b-6c23-4828-be8a-545c6f6b5543'::uuid),
  ('80d64536-372a-4795-87db-840b2fd28dca'::uuid),
  ('8192072e-db11-4ada-b2bc-dd498a1cb86a'::uuid),
  ('83db789f-26ea-4b7d-a190-b644bb72b92c'::uuid),
  ('8c1c3a94-bbf9-437a-b685-40b202a560ae'::uuid),
  ('8e24bb10-95ad-4874-b849-e130c126723f'::uuid),
  ('8e40a37e-6938-4c3b-a86a-2fe381dd9c8f'::uuid),
  ('9210eed5-6db1-4670-aa5c-bce198791467'::uuid),
  ('93a1fb11-e22c-4153-a09e-d43114eace29'::uuid),
  ('97e04705-13ba-41aa-9623-d04fd930df54'::uuid),
  ('9a12cd96-55fe-4129-a15b-54f145a17f78'::uuid),
  ('9a743bf4-de38-4026-aff9-2317df39b12d'::uuid),
  ('9b16bc00-d05a-43f9-8643-aaacd4a15fa7'::uuid),
  ('9bfb4b9b-e383-48ef-922c-8b6d7aea9e5f'::uuid),
  ('9dda046b-c0fb-48e4-b7a8-632d4af7c262'::uuid),
  ('9efcce26-17fc-453b-b485-6b3f052d8b4b'::uuid),
  ('a085ef73-f043-4206-a9c4-e9c3a24d7577'::uuid),
  ('a09be31b-a78c-47ab-ab43-63fb426db1b4'::uuid),
  ('a0c6a1cf-dba3-4bc8-8d6d-aed798bec711'::uuid),
  ('a626529f-db82-4991-b991-acd2ac94e612'::uuid),
  ('a8a977ca-e7c0-4d06-a25b-8c3ed351084b'::uuid),
  ('a9664de7-179e-428b-96b1-cd04b89c420d'::uuid),
  ('adad674e-0f50-4903-8665-9efd0ecd522b'::uuid),
  ('af19e313-ad3b-4e84-8077-2135eeb01019'::uuid),
  ('b2069697-9154-4c5a-82e2-87557c72a53c'::uuid),
  ('b33aaf9b-05f6-4bc5-b323-42cc1548f7dc'::uuid),
  ('b55698d0-c9e9-47fd-b3be-76ffe3c1bb60'::uuid),
  ('b712d855-02b3-475e-bc34-7aa57ce19689'::uuid),
  ('b7a46bf7-abbb-4d19-bf19-9567f3257b6b'::uuid),
  ('b7ac24f0-cb40-40f1-a034-15b51bede87a'::uuid),
  ('b92e6153-b52d-4d7b-9698-ff6920a6e132'::uuid),
  ('b9ab22a0-bf6a-45fd-8dde-06960aeeb619'::uuid),
  ('bcd81a48-205f-4a6b-97c7-170381dea1f0'::uuid),
  ('bce61fdc-6641-4673-af91-de56a83c4698'::uuid),
  ('bd1318dd-9748-461a-a77d-17d9135a2716'::uuid),
  ('be9e7972-68df-4b1d-a1ca-6a3f58600388'::uuid),
  ('bec4fcf8-9b14-4d75-bb99-7894875e471a'::uuid),
  ('c2973ab0-1ef6-4ad3-ae82-a509b7e1968a'::uuid),
  ('c80e4fc6-d835-4174-b4e9-8d219d3614bc'::uuid),
  ('cac4984e-51d6-4302-b1a5-69c684a6faba'::uuid),
  ('d1a655f8-861d-43c9-b250-95f5bd1f2b13'::uuid),
  ('d50ed707-27e9-49ec-9a2e-6d6cae4d2efc'::uuid),
  ('d5746bbb-c782-4575-9487-ee09f39a13dc'::uuid),
  ('d6523819-2f35-4560-b645-bf4144ed1e1f'::uuid),
  ('d8aa0218-9db7-4735-adf5-8b85debdf19e'::uuid),
  ('dc994731-6bad-4956-af3a-58e6bb6449ef'::uuid),
  ('dd862c78-af28-4196-a5f3-9934e3831363'::uuid),
  ('e0796097-3330-4f41-b87c-5c67a2ae9feb'::uuid),
  ('e09cd23e-06b7-4e35-9cee-d377929a83f7'::uuid),
  ('e3448705-a29e-4698-9928-0bb473d8850a'::uuid),
  ('e8dc94d3-c242-46bb-982a-4894e8370156'::uuid),
  ('e8ec42f6-6fe4-40ac-adf2-5706873e46d4'::uuid),
  ('ecf59ffd-23ac-454d-854b-9ce162ba0dd5'::uuid),
  ('ed9b6b1d-0f9a-4a2f-9fa3-72dc700ac262'::uuid),
  ('f0dc274e-fc88-4cec-802d-eed96c3040c9'::uuid),
  ('f1c09f5f-4f74-4a70-a301-c2d67365b7cb'::uuid),
  ('f23c2430-9e98-4456-9057-fadc9b281b78'::uuid),
  ('f39639c4-4865-4dfc-a841-30ca35c72d5a'::uuid),
  ('f6240483-7566-4a1a-9d9d-4f8a715bc274'::uuid),
  ('f830daca-ad8a-46b3-b217-6e9312b1e7f7'::uuid),
  ('f9fe3eb9-d2e1-4c90-8d60-2bac749f3120'::uuid),
  ('fa827239-5eee-44a4-8bf1-8be00aa460a2'::uuid),
  ('fb0e8d37-cd57-4c82-b1f6-5d5693d56bfa'::uuid),
  ('fc0d2525-ac57-4b66-b89f-52465b82ac8c'::uuid),
  ('fc990f3f-679f-4b71-b06a-eb6219c270ee'::uuid),
  ('fd3bc701-633b-4ae7-9e77-5f09074122f3'::uuid),
  ('fe9ccd05-2517-42b9-9c50-34fde1693c96'::uuid),
  ('ffbf9b72-f1bd-42e7-8eab-326b51ae0213'::uuid);

do $bf$
declare v_n int; v_ok int; v_md5_antes text; v_md5_depois text; r record;
begin
  select count(*) into v_n from _ps01_ids;
  if v_n <> 138 then raise exception 'backfill: lista com % parcelas (esperado 138)', v_n; end if;
  if exists (select 1 from public.fin_parcela_status_01_backfill b join _ps01_ids i on i.id = b.parcela_id) then
    raise exception 'backfill ja aplicado'; end if;
  select count(*) into v_ok
    from _ps01_ids i
    join public.financiamento_parcelas q on q.id = i.id
    cross join lateral public._fn_parcela_status_alvo(q.lancamento_id, q.lancamento_juros_id) a
   where q.status = 'pendente' and a.alvo = 'pago';
  if v_ok <> 138 then raise exception 'backfill: so % das 138 no estado medido; nada foi gravado', v_ok; end if;

  -- o que nao pode mudar: tudo da parcela fora status, data de pagamento e updated_at
  select md5(string_agg((to_jsonb(q) - 'status' - 'data_pagamento' - 'updated_at')::text, '|' order by q.id)) into v_md5_antes
    from public.financiamento_parcelas q join _ps01_ids i on i.id = q.id;

  insert into public.fin_parcela_status_01_backfill (parcela_id, financiamento_id, cliente_id, status_antes, data_pagamento_antes, ajustada, feito_por)
  select q.id, q.financiamento_id, f.cliente_id, q.status, q.data_pagamento, q.ajustada, auth.uid()
    from public.financiamento_parcelas q join _ps01_ids i on i.id = q.id join public.financiamentos f on f.id = q.financiamento_id;

  for r in select id from _ps01_ids order by id loop
    perform public._fn_parcela_status_alinhar(r.id, null);
  end loop;

  update public.fin_parcela_status_01_backfill b set status_depois = q.status, data_pagamento_depois = q.data_pagamento
    from public.financiamento_parcelas q where q.id = b.parcela_id and b.parcela_id in (select id from _ps01_ids);

  select count(*) into v_ok from public.fin_parcela_status_01_backfill b join _ps01_ids i on i.id = b.parcela_id
   where b.status_depois = 'pago' and b.data_pagamento_depois is not null;
  if v_ok <> 138 then raise exception 'backfill: % de 138 ficaram pagas com data', v_ok; end if;
  select md5(string_agg((to_jsonb(q) - 'status' - 'data_pagamento' - 'updated_at')::text, '|' order by q.id)) into v_md5_depois
    from public.financiamento_parcelas q join _ps01_ids i on i.id = q.id;
  if v_md5_depois is distinct from v_md5_antes then raise exception 'backfill: mudou algo alem de status e data'; end if;
end $bf$;
