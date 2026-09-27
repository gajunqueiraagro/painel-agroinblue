-- 20261027158000_dre_classif_copia_01.sql
-- DRE-CLASSIF-COPIA-01: a CHAVE (plano_conta_id) e' a unica fonte da classificacao.
-- macro_custo, grupo_custo, centro_custo, subcentro e escopo_negocio sao DERIVADOS da linha do plano
-- por gatilho, em todo INSERT e UPDATE; o que vier da tela nao prevalece. Decisoes do Gabriel, 27/09/2026.
--
-- POR QUE (FASE 0 / 0b, 27/09/2026, so' leitura): 647 lancamentos ativos com classificacao incoerente,
-- R$ 4.491.489,94 em modulo — 642 com o TEXTO do subcentro diferente da chave e 5 com a chave certa e
-- grupo/centro copiados velhos. Quatro caminhos: (a) o gatilho antes de 10/09 resolvia as copias pelo
-- texto e nao gravava a chave; (b) FIN-PLANO-CHAVE-01 (10/09) realinhou grupo/centro pela chave velha e
-- deixou o texto; (c) importacao do Agnaldo de 24/04 com a chave no de-para generico; (d) o plano mudou
-- (PLANO-LAVOURA-01) e o editor regravou a copia antiga — o gatilho so' agia em 6 colunas e aceitava
-- grupo/centro do cliente. Leitores pela copia e pela chave divergiam: foi isso que abriu a
-- LAVOURA-MODAL-X-GRADE-01 (7.197,49 no Amendoim do NJ 25/26).
--
-- O BACKFILL E' POR LISTA FIXA, gerada do CSV da FASE 0b (~/Downloads/dre_classif_copia_leva2.csv) e
-- escrita aqui literalmente: vence o lado decidido por ULTIMO.
--   638 TEXTO — a chave passa a apontar para a linha do plano do texto (inclui NJ 762fc7ae -> 1130 e
--               os 2 Semen ee728464/741d0757 -> 8100);
--     9 CHAVE — os 5 da Leva 1 (NJ lavoura), NJ 67ce4107 (fica em 17070) e as 3 despesas bancarias da
--               Vera 2024 (9f3a9691, 1b81e706, 3a4b38d8: ficam em Juros). Texto e copias seguem a chave.
-- ⚠ AS 3 DA VERA FICAM PELA CHAVE POR DECISAO DO GABRIEL (rollback de 27/09): pelo texto elas viravam custo
--   fixo de pecuaria na fazenda Administrativo, a fazenda entrava como coluna do DRE de 2024 e R$ 49.996,51 de
--   juros deixavam de ser rateados (jurx) para virar proprios (jurf) — R$ 3,35 movendo R$ 50 mil. Pendencia
--   DRE-JUROS-ADM-01.
-- Guardas: a lista tem de estar EXATAMENTE no estado esperado (chave e texto) e cada alvo tem de ser a
-- unica linha ativa do texto; senao, aborta com os ids. Nada e' gravado pela metade.
-- Auditoria LIGADA (ao contrario da FIN-PLANO-CHAVE-01): cada linha vai ao audit_log com o resumo
-- prefixado "DRE-CLASSIF-COPIA-01", usuario nulo (sistema) e os valores antigos em dados_anteriores.
-- So' o gatilho de editado_manual fica desligado durante o backfill: reclassificacao por migration nao e'
-- edicao humana.
--
-- EXCECAO MANTIDA (decisao do Gabriel): dividendo com texto fora do plano segue aceito sem chave (regra
-- B1). Os 376 de hoje ficam como estao. Pendencia DIVIDENDOS-PLANO-01: criar as linhas por cliente,
-- ligar os 376 e so' entao remover a excecao.
-- md5 (provado em rollback no proto, 27/09/2026; prosrc do banco = corpo deste arquivo):
--   lista canonica (id|chave|texto|chave nova|lado, ordenada por id)  12d5949514cd879e2399050f3380ab4a
--   resolve_classificacao_from_plano      2bf6f93b -> b1be54de
--   mark_financeiro_lancamento_v2_editado_manual  74a76d1a -> d71a1583 (o corpo de antes + uma guarda; sem a guarda, 74a76d1a)
--   fn_propagar_plano_para_lancamentos    novo 6ab44f9d
--   fn_plano_conta_do_texto               novo d5bce1ea
-- FORA DO ESCOPO, registrado: DRE-LEITOR-CHAVE-01 — os leitores que ainda leem a copia passam a ler a
-- chave; so' depois disso as copias podem sumir.

CREATE TEMP TABLE _dcc_lista (
  lancamento_id      uuid PRIMARY KEY,
  chave_esperada     uuid NOT NULL,
  subcentro_esperado text,
  chave_nova         uuid NOT NULL,
  lado               text NOT NULL CHECK (lado IN ('TEXTO','CHAVE'))
) ON COMMIT DROP;

-- (a) A LISTA FIXA: (lancamento, chave hoje, texto hoje, chave nova, lado). Escrita em duas partes so' para
-- nao repetir 647 vezes as mesmas 32 combinacoes; a guarda (b) confere o md5 da lista montada contra o aprovado.
CREATE TEMP TABLE _dcc_combo (n int PRIMARY KEY, chave_esperada uuid NOT NULL, subcentro_esperado text,
                              chave_nova uuid NOT NULL, lado text NOT NULL) ON COMMIT DROP;
INSERT INTO _dcc_combo VALUES
(1,'72a67ced-53de-4896-abcf-11ef22ff6ddd','Dividendos Doroteia','35a2b634-f519-4c1e-a829-ed71efafd4b4','TEXTO'),
(2,'443070d6-200f-4617-b859-cb1379d53403','Dividendos Pessoal Fazenda','95ea6c65-77a1-4926-9eb9-f30f74a13da6','TEXTO'),
(3,'af7c7754-c625-46ea-83ed-ebf71805af16','Vacinas e Vermífugos','046b52b0-a913-4404-9742-47941a598f3d','TEXTO'),
(4,'24e93a82-5e56-4961-b23a-08c4bfd43625','Dividendos Faz. Campeiro','badf8ac7-2212-4a57-b995-af498f6c0572','TEXTO'),
(5,'d7602dd8-7481-4daa-af76-f9982b9517f1','Dividendos Tributos Pessoais','e27aad4c-4fb4-4786-9142-cdb55611ca89','TEXTO'),
(6,'a505717c-4b65-4c10-bfce-908e7e6f9aef','Sêmen e IATF','fa428773-78c9-4662-91ee-4cb8a6024457','TEXTO'),
(7,'a505717c-4b65-4c10-bfce-908e7e6f9aef','Veterinário Reprodução','85335d2f-7c76-4c19-8274-dfcc1ce8bdb5','TEXTO'),
(8,'72a67ced-53de-4896-abcf-11ef22ff6ddd','Dividendos Fabio Delazari','638a756e-03d2-4368-8a6d-afc3ccae55f4','TEXTO'),
(9,'13bb42b9-b3de-466e-864a-bd8c2c61f45a','Abates de Machos','266dd760-aefe-4bb4-85f6-5dfaed8d0518','TEXTO'),
(10,'14b62f3f-7766-4b32-b50a-ae442307b107','Salários e Encargos Pecuária','3f4c35c3-177f-48f1-8b09-d3ff7e32853e','TEXTO'),
(11,'d4f2bd84-4f5f-454c-b85c-6ad99bebff0b','Manutenção Máquinas Pecuária','edc0de8a-e8e6-48de-bf81-0a8061307abb','TEXTO'),
(12,'287caabf-91ba-40e2-82b6-379f33f31ab2','Aporte Pessoal','0d957095-af4d-41d9-ae88-bbb793e8344b','TEXTO'),
(13,'5d4a5c70-311d-4302-98f0-b2846d9738fc','Despesas Financeiras Pecuária','5d4a5c70-311d-4302-98f0-b2846d9738fc','CHAVE'),
(14,'d7602dd8-7481-4daa-af76-f9982b9517f1','Dividendos Despesas Familiares','15b5c7aa-d4b1-4baf-b0fa-1cb4ce31d7c5','TEXTO'),
(15,'836239b6-890f-497c-b56d-6713ab8d91e4','Manutenção Máquinas Pecuária','edc0de8a-e8e6-48de-bf81-0a8061307abb','TEXTO'),
(16,'3f4c35c3-177f-48f1-8b09-d3ff7e32853e','Manutenção de Pasto','85fad381-cc6f-433e-88f8-cf18682c9100','TEXTO'),
(17,'b4eaa2b6-3356-4ba4-9fdc-aa4de0736c69','Manutenção Máquinas Agricultura','b4eaa2b6-3356-4ba4-9fdc-aa4de0736c69','CHAVE'),
(18,'fab50865-1fee-449c-be8e-4e99f0d2ca9c','Despesas Comerciais Pecuária','c89b7e41-346b-4379-a432-a03e2efd0229','TEXTO'),
(19,'cdf2efa2-5735-499f-8a85-5ae0b0d0123a','Ferramentas e Equipamentos Pecuária','836239b6-890f-497c-b56d-6713ab8d91e4','TEXTO'),
(20,'e183f32b-54fa-4076-a075-fe4206a32bf7','Combustível Máquinas Pecuária','d4f2bd84-4f5f-454c-b85c-6ad99bebff0b','TEXTO'),
(21,'d4f2bd84-4f5f-454c-b85c-6ad99bebff0b','Viagens e Deslocamentos Pecuária','8db07b50-2b04-4102-b619-3cb51ba30703','TEXTO'),
(22,'e8689db2-03ad-4eeb-a865-1471fe74d122','Seguro, Impostos de Máquinas Pecuária','007a91cc-8b34-4ab7-914f-93e93dc2718f','TEXTO'),
(23,'d4fe4bfa-06c3-494a-8881-7c928a9fe4d9','Dividendos/Retiradas','d4fe4bfa-06c3-494a-8881-7c928a9fe4d9','CHAVE'),
(24,'446178bd-ff5f-4fde-87ba-2ca7c0067de8','Juros de Financiamento Pecuária','5d4a5c70-311d-4302-98f0-b2846d9738fc','TEXTO'),
(25,'af7c7754-c625-46ea-83ed-ebf71805af16','Outros Serviços de Reprodução','a505717c-4b65-4c10-bfce-908e7e6f9aef','TEXTO'),
(26,'edc0de8a-e8e6-48de-bf81-0a8061307abb','Sêmen e IATF','fa428773-78c9-4662-91ee-4cb8a6024457','TEXTO'),
(27,'68346f99-4694-4429-b79c-d0630ee52954','Venda de Fêmeas Adultas','9e14ac03-674b-4d59-bdf6-db8e6f622a85','TEXTO'),
(28,'f139ca8f-2751-4f3f-8ada-aede3a875c1c','Rescisões e Acertos Pecuária','1b34656a-58a7-45f0-9dd6-4bd058cb1581','TEXTO'),
(29,'cdf2efa2-5735-499f-8a85-5ae0b0d0123a','Manutenção de Cercas Pecuária','3441770b-a482-4a7e-ab4a-70cacaf331b0','TEXTO'),
(30,'fab50865-1fee-449c-be8e-4e99f0d2ca9c','Outros Itens de Identificação','844224a8-159b-4ca8-9e82-3880f843deaa','TEXTO'),
(31,'f4fec107-569a-42a1-b413-bf133474c7fa','Investimento em Cercas Pecuária','9b10cc50-858a-4fa4-94c9-337e8258f81f','TEXTO'),
(32,'62d390b5-1f05-4375-b998-55ab32e62d43','Investimento Frete/Comissão Compra Bovinos','1fce176d-14ee-44d0-950e-dfe34aed57b7','TEXTO');

INSERT INTO _dcc_lista (lancamento_id, chave_esperada, subcentro_esperado, chave_nova, lado)
SELECT v.id::uuid, c.chave_esperada, c.subcentro_esperado, c.chave_nova, c.lado
  FROM (VALUES
('00076674-e5be-4152-8e09-5b3f462491cb',1),
('00633408-acf7-42bd-a403-8ebedaad87b9',1),
('007cfd08-b9e1-4aea-8a0f-e7dbf291ba19',1),
('00f6b5c3-1957-4be0-babe-268dfbeffb5e',2),
('02145a77-8d3a-4e4a-8872-0cc67162e52c',3),
('02c2e3ce-028a-4fbb-bb3c-ddba12a0129f',4),
('03ac0d54-4a7e-477f-9b0f-ce22e3d42c2a',1),
('03ac6bb8-f62f-4342-b2ed-aa1cc45217f0',2),
('043fb1d6-2184-469e-b6a4-3ad0b4699e3c',1),
('04965e50-b0d4-4aa3-8c53-65f81e7b09da',4),
('04e3a000-11a5-48e4-882b-87ecd47c1579',5),
('052084d4-dd32-49b2-b8af-08fb0a4c30e4',1),
('063eff1b-21ef-4fe9-bb67-db7167c34370',2),
('06e59bc8-7469-4e54-8298-c50870e6f2cf',1),
('083a0e9c-acb3-48f6-b770-7e75870a989b',1),
('08a55b1b-c785-4270-ab33-f231a36889ca',6),
('09168703-4b87-433a-9624-0e10cb68e7fc',1),
('09922380-2706-46cb-8d27-cfe803a72105',1),
('09b0149a-fd74-43a3-b066-a0aceca1b29c',2),
('09b6ddff-6778-4e20-b0f5-624d5564ccfe',1),
('0a47f156-768e-4762-970a-0dd459406ce8',1),
('0a73a3e8-29bc-4f86-b04c-869fcd84a419',2),
('0ab3499b-e309-45a5-b4de-246d3dec007d',3),
('0b5ce6b5-5e32-49ea-935a-7e4eb5a87373',7),
('0b74174a-e176-4e4f-bb7f-638daf5e99bc',5),
('0b86a7c3-678a-42ad-8504-e2dc0151187b',2),
('0ca5a90a-7368-45f3-aeac-0e41bb025a0d',1),
('0cf4ea14-c803-4b59-9645-c19a98f96be9',5),
('0e03f25a-5dad-43a5-a528-8ee66fea09e8',1),
('0e67d578-7810-40b7-9044-92dab91e898f',1),
('0e6c4a71-8ec2-4757-86b9-4fe768ecc8d6',6),
('0ef43e6a-7c45-4147-aaf2-59a2d12faef9',2),
('0f1b6e14-9e8d-4bd1-bd8e-3f21f9cbebbb',1),
('0f316c9a-c691-48c6-8d70-c074eb31aeec',1),
('1020d5f4-c186-4ab9-b188-dc7fcb2c7f80',8),
('1048fe5c-c6a7-426c-bf35-97db4a091617',5),
('10c0a6c2-97fa-48f9-a6b9-fe9842ccef9f',6),
('10ca7dc9-f8df-434b-a135-c9bd62ff32ed',2),
('11565d37-35ae-450a-997d-46f6b5e6f77d',2),
('1161c247-ec48-451c-8adb-b99180132e8c',1),
('121462f7-d90f-47e9-9612-34170d730401',6),
('12a884cf-b462-41ca-9e26-1355cd8ffb72',2),
('12bdfc9f-deba-4b33-8cfc-a8acc005d56b',5),
('134f2156-28e7-40a7-b606-53208006f87a',2),
('13cb77fa-e566-4008-be30-c92746398481',4),
('13cdd10a-94fd-4239-8a54-9b88f9b42663',2),
('14020ba9-8f60-4fbe-80c6-e41daa18d570',9),
('144056c2-088b-40a5-85ff-8b28fe1579fb',10),
('145afe74-0b50-4b34-8d87-f305d3f9f074',1),
('147e0cc6-e51c-4d4e-a9a6-5337c66ecf2e',3),
('1561d1f1-6865-4d96-a4cd-05ce6a26d380',5),
('16849c64-76d4-4fde-a5cb-cde0404c13e5',5),
('169ab37a-2195-412c-9a58-bd18305850d8',1),
('16c1944c-57a3-4094-b8cc-4c5a70e14dd4',1),
('16ef05aa-fed6-47df-bd70-f92f73182791',1),
('170bf5be-4c18-4bf6-97d9-39c3acf234b7',2),
('172f9e08-7706-4645-9b51-97876c4cc1c3',11),
('17398c4b-f694-4872-b43b-1443693b1566',1),
('17ceaadb-300d-4235-b794-3c1e7e8c761b',6),
('18fda826-395d-43a3-8747-f082199e81f1',12),
('196057a4-f0b3-4759-8067-91c03d65c86a',1),
('19fff3e6-403b-4895-87c2-0b313faffea3',1),
('1b12d3f7-db70-4649-851b-fd38ee467ed5',2),
('1b81e706-3c28-489f-9c68-fc7c7bc8f28d',13),
('1b90b2a3-93c7-47d4-884f-594772371260',1),
('1c74f4f9-0b1d-492d-8bdb-225bae921a72',1),
('1cb43afd-5c74-4ef9-9461-05808b3063f2',2),
('1cec6717-1e83-445e-aac4-7dea7a831d6d',2),
('1de79309-916a-4319-b8af-2ccd844fe2d4',1),
('1e1612eb-09f1-4f0d-96b3-fb1d263adcc0',1),
('1e56fa0e-88be-4d16-b381-b6251fba7688',5),
('1e5b6b45-c055-4570-9df6-e3647e19342f',1),
('1ec67f7c-d0aa-4c56-ae54-3f380dcb96ef',2),
('1ed28faa-5700-49f9-a523-e68c5ed9532d',3),
('1f33cd3d-664f-4496-9597-7e1d17d2b39f',1),
('1fa64ad2-12e6-4d83-9d04-71d301030b2d',2),
('2007f1b0-9799-4f72-bd9f-f7e463f267dd',2),
('204adb6c-c47b-4e3b-9b0e-822f58b0e97e',2),
('2094fb90-21b4-47ee-aaef-cbcc9bcb9234',8),
('209fac9c-24df-44c2-8a69-3b03aace088c',1),
('20f50e4b-f26c-482e-86e9-e4bd8ae3d082',1),
('216d0655-b70d-4072-be58-375e6711c325',1),
('21eaf6d5-3b45-4104-8a56-e9f939e7594a',1),
('22472242-b8d9-4a1f-944b-9e1531d7c878',1),
('22c5b761-687a-4495-bfa7-9e76eef335b3',1),
('236d0e45-29b3-411b-ae47-e033cbdd8624',2),
('23a6d803-a408-44fa-9e2f-302a4b62ca1a',5),
('2438c91b-3c75-4922-8afa-b727bef66399',1),
('24b0ff6e-1620-4f12-a90e-1e972ed730b9',5),
('2543037b-6c6a-4406-86a7-f5a130650043',14),
('25dc53c9-7527-4790-80c7-b66c2f5c8d3b',1),
('267577f0-3cfb-4f82-a592-9fe676868069',1),
('2782ff6d-eb13-4eca-b9bf-46765c6dbbcb',2),
('278ca46c-7a5a-400a-a6d7-f55dc9bc18b8',2),
('27fe1cd1-937e-4d52-83f0-a3fdf767699d',2),
('283510f7-4b03-4624-b53d-4e20d9226476',5),
('285f8c9e-def0-43de-9aa7-d0c70e57dca8',2),
('28993ea2-0aeb-4000-b1e6-87fc27203c97',2),
('28e3aa3a-9bc9-40e9-b289-c7c5c4bc65c5',1),
('2a01079e-cc70-410d-a983-d7fe39bfc0ae',12),
('2b39a1ee-2c70-413d-a200-22496b317d72',10),
('2b72e9e4-7aea-49db-9962-ff8c603b4262',1),
('2c11065d-c7e7-4a0b-ba94-969e7bfb2464',2),
('2c8489b3-51ce-4825-9036-f6d30b2136c1',2),
('2cec3cd6-4d82-4024-bd5b-8f51e4015709',1),
('2d52c7f4-b948-4321-a5cb-ba7685766c41',1),
('2dc8aaa2-d5f1-480b-bd2e-f7bda7a6b4f4',1),
('2f4da8e8-93e5-494c-9811-561ccd8fb0e4',1),
('308b5384-b3f5-4870-9171-022c1f281649',1),
('32329c79-da33-446c-9454-d9d66a5f1821',1),
('327b7b2b-c130-4c05-b45f-ad4e85ee5b97',5),
('32a41b96-fae9-4cc1-af50-713e611bf747',2),
('32cea1a8-e40a-408e-a27e-0aa7290c69ac',1),
('32e0b431-3a20-47f5-b84a-9192672a9d6f',1),
('33584ef6-159f-4f26-972c-6eb3a838670e',5),
('336af5db-f940-4142-907f-75ea7ff246a5',1),
('340f97c0-c769-44f1-8f0a-5599fe48f09c',1),
('34313850-223a-4018-89f0-935e01816c3a',5),
('34aeb64c-17be-4c34-aaf6-918005f433b9',1),
('35004366-3ee2-4257-880d-61ee48638763',1),
('363b7136-0b21-4f7a-83cd-0f25aaa88bb1',5),
('3679d6e7-c3ca-4309-9c6b-c68746929841',1),
('37554e45-b05a-4075-857b-aab4ad01457e',1),
('3842ca0e-b01d-4874-b142-9fab96b153e2',5),
('3953cc84-e362-48e9-af89-b5d9c9313bc4',1),
('39cd9871-d563-4045-96c6-40ae45b4ec61',15),
('39d5a1c0-aec8-4a8f-8379-b6c8810e4516',2),
('3a4b38d8-a839-4a65-b02a-deb232641b45',13),
('3a587b1c-8b70-450b-a84a-387500f8b1c1',16),
('3a5ab356-7d71-4d8a-943e-bdbdcb7947f6',1),
('3a74ef1f-9377-4c2d-be0d-46786466e681',2),
('3ba19ed8-74e1-4d7c-b5db-462fbeee9d54',1),
('3ba7d60d-3d59-47fc-9bb5-8fc614831083',1),
('3c5265cb-8567-45ab-a848-ef21af990371',8),
('3c7060f2-c631-4bb0-bd9f-82dd0c59142e',17),
('3ca64a98-240a-437e-95f9-9736461dddc6',2),
('3cb4f7aa-f872-46c2-ba7f-3579cabdfb37',2),
('3d1ab30e-bf81-46c6-9fbd-6b6445f55156',1),
('3d2abbe3-7118-4b62-b428-a656351cafe3',1),
('3d639988-2c4c-4a4a-a8fc-6ceb5d30559d',2),
('3d9d7e66-f2d6-4a4c-8700-3a2e71178071',1),
('3da5281f-bfef-495e-8a7a-03861ad14c5f',1),
('3da60852-9074-4eb6-944c-644e4f593e60',2),
('3e8ff20c-c917-4efd-bdde-cd2a4a702590',1),
('3ee16d31-a173-4118-a5f4-581d6387ca88',2),
('3fb90c2b-e15c-4445-876b-6ae97a011639',4),
('401a7c4b-a5e8-481c-aa7a-086eccffdf5a',8),
('409660ab-28c2-4624-8891-454a2d596edb',5),
('4227353e-f7aa-4be8-8868-3f92017dd1a0',1),
('429f4659-b8eb-42a4-bd91-ca99bbfcbfa1',2),
('4323d26b-d2d5-40ad-8b5c-d8304aab2499',2),
('440cdd26-a7f6-45e2-9fef-474b1678723f',1),
('446f14c1-76a5-4db2-abae-759a9c230be2',2),
('44b84e96-0241-448c-a753-7cfc6b2b2f05',1),
('44ff90c3-8f8a-4540-b4a3-e96b536d84c1',1),
('4579c58f-acbc-4cb6-9c5a-348ae2b7461e',8),
('457c5aa8-82c7-4ee1-b282-9d4a30d0431f',2),
('4590d7d7-b696-4167-a107-602bebd72d73',1),
('4598c96a-1d49-47c1-a041-ad3272d3d16d',2),
('45b9663d-fb6c-46b0-8fd2-93a5bae82add',6),
('46a199ad-57af-4427-a40a-6beb21ff438c',1),
('46db16a6-b06f-4adf-8ce2-c525e9edb62c',1),
('472c3eef-3d10-4823-a636-f52b66288138',1),
('4845ed8d-64f4-4ad9-a5ff-37ce7c682df0',6),
('487ba10a-ec10-4457-aae9-4ca2e0e8196e',1),
('49155da6-0004-4666-818d-1ee7da0ad9bd',1),
('49f73d3c-ab8a-449a-8ee3-6a4ba1fa7dcf',18),
('4a09b9c0-71f0-46cd-a852-999f338fe850',1),
('4ab18a8b-d72d-4a5e-8a82-7b7e87b64e9b',1),
('4ad900ac-8f60-4947-9af6-fce53e9f1f2d',2),
('4b5140c7-c07c-4879-8811-b7244d1fb0a2',2),
('4ba6fc3d-ebac-4bdf-ad96-06a61250dc65',2),
('4bdb3e5d-4be0-41d9-9164-ad32e790e297',5),
('4bf12e1d-b0b9-4836-9c0f-12452c733aad',8),
('4c166538-0455-4080-8288-c3aae6e3499f',1),
('4c6446c2-f4c4-44e2-831d-6c6e0f35165b',5),
('4c9514b9-b211-4bbd-a1d0-6d5afcb0adb4',7),
('4d0fa714-9378-4c38-8681-7e396ffa721a',2),
('4f2eaeab-c6a8-4264-9586-61479c1e2822',1),
('4f92506d-59f8-4e18-9c13-671d2c1ed058',8),
('4fe2e2cb-5f5c-4b64-a4e4-fb3dcb6f666f',3),
('503f9efd-5ea6-4480-b73b-ae5b238df9b6',2),
('505f6df8-743f-4cc2-99f8-21a18881e978',6),
('505ff382-a940-4a4c-80ad-748b051cd034',1),
('515066eb-a4e4-489b-a21d-70451446440c',1),
('5153432c-4f61-4682-910a-7fab547570c9',1),
('5163f62c-d218-4a8c-be27-9cf3de33111d',6),
('520aa82f-5f66-4663-90ed-1756c7b2464c',5),
('522326a1-8e1b-40ba-a5f3-23362d54a3c0',14),
('530868cf-7575-489b-b59d-618288f3f7c9',14),
('5325d05a-4b29-418d-945b-e69c21522749',1),
('536e660f-7fb1-468d-a1a2-af4195e0c034',2),
('53e7072d-6998-4373-943c-55c8da601dd2',4),
('53f4e150-8388-4be9-86ea-5bd867182a3b',19),
('545da574-3ba6-445e-9dc6-736579cdb1a0',1),
('54bb6bf4-3de6-485d-a7d1-27cdd7d0dcd8',1),
('557fb668-4061-474c-8250-1db610e4f135',2),
('55a342ef-2160-47c5-a5bd-0bdc76d4d3ef',1),
('575a6f80-a1fe-4d16-babb-9166d976936b',5),
('5761b858-db04-4916-a8f3-0a865fda9460',3),
('57b1edb7-da48-4b8e-a872-50b6f5170100',1),
('57bb7254-1066-4f91-9a2d-949d5dd44c5e',2),
('580fee6f-582b-42e3-b665-d87d0a624795',1),
('59077873-117f-4c56-b033-3a914465fc0f',1),
('595a4820-7f9a-43e5-a429-e4f64d01a94a',20),
('59ab65ca-8a2c-47ee-8f33-150c82fdc1d1',12),
('5a08f95b-610c-4583-aa64-03bec957655d',1),
('5a4d400e-a216-4843-a4f7-206824dca640',1),
('5a76b88e-0082-49b5-940d-207ff2cf0902',1),
('5adcd57e-579c-4486-bc34-73cbb12f827b',17),
('5af91b99-ea51-4f86-a3f0-d0a12bc9a610',2),
('5b1ec5c5-f17d-4310-b609-5a6d851a9345',2),
('5badfc5f-7ea8-4ac9-b364-4d21e6b29a13',21),
('5bf034ee-545b-4811-a49b-5e2f31497dbc',1),
('5cf40047-7baa-4f3d-817b-94b39c36930c',4),
('5dc0e22e-8ddd-4bed-ba4f-52c12075d672',1),
('5dd9ba2c-3d83-4fdd-b3e2-dac5ed0b97e1',5),
('5e07986b-75c8-4027-b0f3-8016f59e786f',2),
('5e1239f7-07ad-4ddd-842e-289e8254a82a',2),
('5ff5e943-9cfa-44e8-b1e1-6203c07c1ec5',1),
('5ffa0d2f-3f66-410c-b2d0-928c56f24d00',5),
('60c6da67-8488-41f1-98a2-9abe3805b6a4',1),
('60eec8ce-fe64-4f1d-9b9c-26c067891b90',5),
('612549ba-ad50-401e-940a-da720e7607a0',22),
('612a02d2-7ff1-4e5f-99e6-8ef3968020d3',2),
('62d6f304-64f1-44e3-ba56-b78c943a5cd6',9),
('62ec0171-419b-42b4-a903-b7ad1e22bbf7',2),
('63118086-35ec-4250-a6b6-c71bcec2355d',1),
('6321f6d6-af6e-4f97-9568-1476969e20cc',2),
('632a12f5-657d-465c-9bf7-905db2381400',1),
('63aa63b5-90d9-4370-8508-056153307d98',5),
('63d316f2-4fb1-46cc-8ea9-6f275b1e65bb',2),
('641b88d2-c1b6-4149-a1e0-e88a817c9340',1),
('64200c16-0b80-4562-a6c4-64f31ba4f652',1),
('6459d88a-8857-4317-8760-d31ecfebf1c4',6),
('64c28f8f-ee11-46da-adb9-f2c93bc4d303',2),
('652326fb-2748-40c4-8040-463145fcf920',1),
('6586f7bf-60c0-48c3-832a-d1c75d84279d',1),
('6592be3b-9b46-4f81-a60b-137db4acf8bf',1),
('65ad0cd4-c3f7-423f-92a8-16d8754dad3e',1),
('65ccbbdc-a3bb-4377-b97c-6f57b1631ef8',17),
('6654f8ed-a33a-451f-890a-f0e09abd38f6',4),
('666a35c4-f201-403f-a460-06690e9d9475',3),
('66898c2f-c5f2-47fb-99f3-2385e2bbf773',4),
('66e1de40-1116-41b1-9188-448090372f9f',10),
('66f6245c-66db-40db-8191-fd16ca45a049',2),
('6703dacc-121b-4d3e-8db7-efe926dc7fb3',1),
('679479b0-8377-4f9f-9228-43eb3a27e810',6),
('679c3c76-5c0f-4cbd-a531-b3619f4594d4',2),
('67b9ebb9-6b04-4ec7-91ce-ef4d4389c24b',6),
('67ce4107-7ec6-48ab-92e7-431255206650',23),
('68b507c2-fca1-47db-bf9c-fe7c20273739',1),
('68c900bd-50fe-488c-a74b-5d2dddb03a3e',2),
('68e1022c-2d6d-4bbe-a836-fdd32c023ff8',14),
('6973fc77-4cdc-4037-b8f6-b9ab0dd2a7a1',3),
('69b15f21-5e7e-464f-81d2-96eae1ab9440',1),
('6a041d7a-a656-4b02-832a-547ad45adb5e',1),
('6a735fcb-d44b-4ca4-8ff8-bd3765f159df',1),
('6aa5a1d0-4d6f-4ed8-8037-766e1bac0924',24),
('6aee0bbb-dbe4-457a-9b7d-9f71f7ca70b7',1),
('6b963bf8-f309-48e7-8a1d-6775658a5ad6',4),
('6c020456-e3b3-4512-9796-669b1fdc1bb7',10),
('6c3bd3ae-5908-44a4-b00c-0c9cc550c6f2',19),
('6ca3a718-b07b-4b03-8f8c-00e0c4b9ebbf',2),
('6d176029-132f-4208-ac7d-64a3b78df365',6),
('6d6bcc11-894a-4cfe-805d-2acbfe410a67',6),
('6e504b49-8801-4f23-b137-d72d76d4b5d7',1),
('6e62c2c6-42c3-46c3-a023-766a74205f87',12),
('6e766d2c-827b-43fc-8360-185b902811e4',4),
('6e9e7e34-7dae-4fcb-9d13-4257531d89d9',2),
('6ede4477-e6e9-4ef4-b304-5786ad97ee12',1),
('6f2d8f15-28eb-4d2f-9655-cb762cb76bd9',2),
('6f31feab-0563-4cf8-8793-6a351c90364a',25),
('6ff79c87-da0d-4349-9c9b-fc9aac63083b',5),
('7015ed47-f810-4aa3-b5b8-498cdf4a4517',1),
('70f277d8-70e4-47ec-b3e4-b1c9e5667127',1),
('71a5e07e-1223-46cd-a876-a4215b4805a8',1),
('71d9b43b-961a-4d97-952f-fdbb604cc718',5),
('722c50db-09db-427b-a2b7-01c1044c7344',1),
('72c1f9f5-a5bc-4575-80d7-cc97aec94405',1),
('72dfbc49-763e-40eb-87cd-068d72493523',2),
('73467126-428d-4c60-a20b-0bac035a78be',2),
('73e9ac18-34a7-48ac-bae8-3070218c3cf3',4),
('741d0757-edf6-460f-a74c-f3ec968aa8ab',26),
('7584acb0-911b-4238-b537-15277ae8650c',1),
('75922a07-96e4-4e22-a905-771f8ba7438b',5),
('7595feb4-c7bf-464f-9942-0f9e8d96ccfe',1),
('762fc7ae-06eb-4e26-ba31-2fabbbe793af',27),
('76482b0a-1658-48b2-b847-dcfb5f7bdff5',1),
('767010d8-2fdf-4b1d-bb58-d154e999b5b6',1),
('7721f972-ac9b-4125-a81e-a1212745319e',2),
('77554688-1da5-40d7-a2b4-0e55b8127306',1),
('783351ae-59f8-4bcb-908b-8a1551567cca',12),
('787cbb21-6f07-4bbd-97a4-ff333b166da1',1),
('78e83c22-18eb-42ee-9edf-e030e5192d43',28),
('78fd6541-963b-43ad-9675-b53e67ffe372',1),
('79579de5-eac3-47e5-80a4-35779583eacb',1),
('796f5978-c979-43b9-b14d-1c95e546f63b',2),
('7a8d9cb8-0a23-49e2-9897-fe918568e3d4',1),
('7abb88ee-a9b2-4c78-a9fa-b5cd73e0854f',2),
('7b1d5c74-ed7c-4778-ba0d-593193d0bbb4',5),
('7b48afd0-0eea-4842-8689-b3067d69cc4f',11),
('7b87f1fe-4282-4c60-a418-a1fa6d1a63d3',1),
('7bac4493-b769-492f-98e4-4b5ceaa4084d',1),
('7bcfc39a-c62b-40c0-bf58-faac301e04e0',1),
('7c32206b-6f19-4d9d-af7b-5f59cfd52195',1),
('7c36b82a-ef4a-46b5-a770-2a53da1cbf9d',1),
('7d293a1a-7a2a-4f60-84cf-722403196359',1),
('7d8232b6-3ba9-4f0b-beb1-00e4e17727ad',1),
('7df9caa6-10b8-450f-bfce-3eb62c9ed5d1',1),
('7ecc4b42-61cd-4b4b-b869-10140f60ea9d',2),
('80bb42dd-f385-4b09-b188-63b027d2c98a',5),
('80e5db7b-7e5c-49be-b07c-0cca927dc964',1),
('8215d46c-7403-42a4-8c4b-be848980fd49',2),
('824ad980-4ed6-434c-a0f5-b568ca3387f1',1),
('8317663a-590b-4040-bd73-edce609b0518',1),
('838da689-76f5-4eb3-ab62-b4716ec8f166',1),
('83997b6b-d3ac-4484-b9a8-30d9c2902896',1),
('839c4471-78c1-4777-92f9-234382d9e311',9),
('85194923-baca-499b-a79a-539e438a0349',3),
('85979706-4690-4529-b2ed-d4f18072faa3',2),
('85afd0a4-35cf-4a59-8ca5-e369cb161d6d',1),
('86204c0f-8b8b-4ef7-aaed-f0df4f49cd0a',2),
('869a7272-abbd-4ce6-a68a-02d8d10aa0ec',1),
('86c764d9-3a8f-4347-a63c-68ad2cef3d43',5),
('86d2a3b8-695d-407c-9ada-84b040c65c34',2),
('86fce15f-8d76-4cf4-8b31-34a7c1cbd115',14),
('876b0ac8-c757-4e73-9bd5-f0127bae9686',1),
('87da3164-21f4-4a4b-b27f-020662eaeaad',6),
('88a9e8b2-7b9e-4bf4-9473-e89a98f4d80b',12),
('89362119-89e5-4ae3-a4bb-572cafaabde8',1),
('8950300f-126f-4d9e-89f5-74d316b8eb53',1),
('896a8458-b526-474f-8faa-4566ab14a5af',1),
('89d3bdbc-18ad-46fd-8f2d-b55f7736f9b3',2),
('8b7802b1-a915-416d-b0f0-13a44faefdbe',1),
('8bb125d8-8e44-43a4-a097-5dfe4c49ce35',2),
('8bb8672f-4eba-4c93-82be-d17204d0304b',2),
('8c77d8db-bbfe-4a39-b9e5-ca05d0d15ba9',2),
('8d121f0b-f919-44a3-b57d-fc467a9a6e25',1),
('8d3d41f4-cd35-497b-ba7a-e6573d10a6e1',1),
('8d63cf2f-2daa-4673-8e2c-86b91365bb3f',1),
('8daf5e25-9b80-460a-b34c-1a2d08ee857b',1),
('8dc7fa71-6c24-440f-aa80-58e4d900564c',5),
('8dcb97a3-443f-4b94-a37a-eea32d9354a9',1),
('8e51fa8c-ed8a-432e-a4c5-d56e3a2e3dae',4),
('8eb26016-a503-46f3-86e2-bf4ff043fec6',1),
('8fa0d278-0467-4989-b541-26061416b0af',1),
('900576a8-a051-4f5b-981f-4ee7573cb35b',14),
('904c3960-b615-4d20-8c0c-0d0fa5b90ea9',14),
('90d9038d-8cb5-4185-8f9d-f577aa704938',1),
('91212d5f-8e8f-4478-908c-9be9e5cf645e',1),
('91311233-cd2e-4279-92c0-03a99d6e8318',1),
('9138fa75-0208-4907-8e42-afb3f11f8034',1),
('9144d543-f7ef-42f8-93e5-da6b2e4b4633',2),
('91bfc184-fb0d-43b6-a480-a99764683c9a',5),
('92bb83d4-439e-4d97-a3a3-4f73c7e6fb68',8),
('92f59ac3-9a2c-406c-b3c7-512213e7937a',1),
('92fad81d-ea7d-413d-8ce6-a3b5ee85e255',2),
('93c7e08d-7862-429a-9444-ee65bb459bcd',12),
('93c874df-4487-4f53-bae3-c6a16d7b350d',25),
('93d154be-0363-4fa6-852f-2f6e112befe4',9),
('9479632f-0632-4d25-bb49-d665d639f922',1),
('94a987b4-ddfb-4fab-aa90-e73451923914',1),
('94c27497-275e-48e4-8de1-f788db9e362a',4),
('95491417-4840-4483-81c9-def51f7d10e4',2),
('95514b71-16ed-413f-9992-eda35f6f8253',2),
('958dd16a-3fac-4051-862d-56c050930e7a',5),
('958eccf0-1557-4daf-820c-2516ffebc8e4',6),
('9592131d-ba0a-4165-9313-fecac6d19583',14),
('95ac2cc6-97a7-4c36-ba39-b265e9237f66',1),
('96d9447e-f9c9-4f34-bb0a-8b648d238e78',1),
('97336d14-c2ba-4230-bcfa-693d55226257',2),
('974c74d0-097c-466f-8a4b-0a0b6a441f53',5),
('975d7221-946a-4715-b434-c4f443bc32b8',1),
('97a79e19-c763-4f71-8987-666cb7b73220',1),
('97adb927-138a-44b9-9858-46d31099164e',5),
('97e89189-99ae-46e4-b4ac-c704aa9c7468',1),
('9894d1b7-a850-45c9-a086-c0d3040e0a27',1),
('98ffa061-e18d-44f2-92f3-803d903c6509',1),
('99556c2f-cca1-46d7-ab63-230635cf47e5',1),
('99751ede-2efd-418e-99b9-0532590d050c',1),
('99a0680d-a2eb-47c7-b1c7-ced8baf98877',2),
('9a21e2fd-de5e-4429-8c44-42b3757e8ac1',6),
('9b20e780-ff72-4baf-9f31-61c6882d5c05',1),
('9b3418b8-6406-48dc-bb9e-5db2ce5bfe99',2),
('9bf973b2-1016-4ad4-b6b1-4fc6e9856952',1),
('9c134ce7-fcdf-43ec-99b0-dc5ae0c448c9',1),
('9d1a8357-3d98-4498-a83f-d67237b01f00',5),
('9d58281a-7dcc-4293-8c7b-f129e0f90572',1),
('9e89fc7e-d5e7-4f1e-8074-362cc546aab4',1),
('9e8dcf5a-ed38-46e3-8e3a-8ede367d7954',1),
('9ec2038b-8bae-4ef5-8ab0-286485ec6c43',1),
('9f3a9691-67f3-406e-970b-3d103f1e8350',13),
('9f8aec2a-20ec-4ed5-8ee5-74c136ad7c81',1),
('9fc29a17-5df8-458a-a13f-f5ce553099dd',2),
('a053ef3f-c1de-4d96-b609-a3a616cfd0e3',1),
('a06c302b-1dba-4819-9183-a36026fddbc3',5),
('a12b5385-4651-41eb-a950-1d98433c7cde',1),
('a14bea07-5b7e-4124-b9ed-3fe60b121f49',1),
('a1a6c6f9-94d8-4009-bf36-30225b6da552',1),
('a1f5160e-e179-401a-b6ce-1f5662c4a668',2),
('a228f88f-71d9-4e89-b32e-b55b0291a978',1),
('a2b1a68e-8da4-470c-9789-a02593992b21',1),
('a2fd37f7-df82-4ca3-9598-7f8fbd613e26',1),
('a310a66d-3469-4b0c-9d0f-bbcd21a474ce',5),
('a39173a5-464b-4764-b319-95ad3cbb75c3',1),
('a3ad66ec-3877-4da1-b958-1212b2f2736a',1),
('a3c83a29-9252-4424-b37d-72f66ec80703',5),
('a3f067f0-416b-4902-ab31-c6185bc76021',6),
('a4248df1-4b31-469f-8499-cdf0b5bb4d5f',2),
('a431aed2-725a-4685-acd0-b053bd89b117',1),
('a4b6c3c5-9433-4fa6-977f-fa6bf81502c4',1),
('a4e2f25c-a69b-4ac9-8f19-670c65da2491',2),
('a5296658-3cfe-4daf-b299-237545fe12ce',1),
('a5515303-f61a-4b0c-a296-44304e277ece',1),
('a5c88797-9913-4c27-827d-a21213769a24',2),
('a5f4fe53-a886-4a56-8fcf-d5a81cfd9ac0',8),
('a67cbb06-e694-4f93-8160-b97de782cbef',1),
('a6840f99-04d8-410c-9167-a046ee49433a',1),
('a69d21e7-b53a-4f61-a64d-d4a76902b34e',5),
('a6ef0e50-edcf-4ba8-8b3d-2ccd3352cf7b',1),
('a71dd765-24a9-4e48-9a7e-d068cdcf8877',1),
('a7250060-174b-4d6e-acfe-939ed6f32187',1),
('a79c32a8-55c9-4dfa-ab42-d41ba96c947f',4),
('a7a8659f-6756-40c1-94ee-52e5aab320ac',5),
('a7c98dc9-fc89-47e7-945f-9dd34dd38dc4',5),
('a81dd329-943d-453c-a1a7-3b24057b23f2',1),
('a872978d-342a-4a77-86d0-f378ddf70b29',1),
('a972dc23-c991-4b87-97a8-1a229a267fbf',1),
('a9b53921-2ca7-4edd-a16d-ae6401b87740',1),
('a9e60b1e-bc79-4bbf-8891-cc58e472f13c',1),
('aa21ac62-1cf3-4e59-a514-9601561ce4fb',1),
('aa27dc1a-3352-430c-b3fe-ef9af169aa6c',2),
('aa59c570-0cf2-40d8-b55c-647a8af2e714',2),
('ab006e40-f312-4c2c-a504-c44b3c4dbf0b',1),
('ac46d6e0-411e-4339-b294-92610d4470a1',1),
('ad9a3a04-d0ec-4560-a300-e946d089669b',1),
('ae64d95d-bbad-4b6a-9065-f48fb989e26b',1),
('b0376dc6-6f14-4674-8d14-f175481c2e5d',4),
('b14d71a7-098c-4b3c-b851-729f7037f1f3',1),
('b1609eb8-00bb-4544-979b-50d7f7210b76',2),
('b180c553-2d4d-419c-a2e2-aa3ab7fdb208',1),
('b1c1818c-b9c3-47bd-b643-377d6bc9f5e8',2),
('b298a166-387e-4518-ace7-bf2d70417fde',7),
('b2bad36c-2021-41d6-8bb3-6db0550b8af3',2),
('b3947430-6dec-4b56-be82-21c6e56d02bc',1),
('b3dcd7eb-b6fe-4444-99ef-948460951dd9',1),
('b427fe1a-6d51-4a81-b435-745b59eae44f',6),
('b4757b50-e284-4f91-a838-d99de7e66653',2),
('b518ef14-ae10-45dd-831d-3001273bd959',1),
('b55429fa-e4e4-4082-bf0f-5b6c472d187e',1),
('b5bfbabe-7f34-4332-a7b0-621020eee3ef',2),
('b6a31b6f-c3df-4798-ab64-7bd5faa4c6d6',29),
('b7572663-deea-422e-baee-91f67eb52415',2),
('b7be83c7-4598-44d3-a844-dd03c0efb84d',1),
('b8140cb3-ba26-4dc4-90cb-456af6ed15ce',2),
('b87d34d4-dd31-4686-b91d-8cb5c27b986a',1),
('b910a404-ab12-4948-908a-190b47b5711f',1),
('b97ec7c3-f789-45a3-9dff-b3cc51aacbe3',4),
('b99a89d1-c870-4950-8170-6aff2fb4b4e8',10),
('ba2306f2-11eb-4f62-adbe-bbd186d22329',6),
('ba255a7c-fa9e-4615-b8a2-b494a1a7e879',5),
('ba42b223-0c79-4baa-abf7-ef523e118bf5',1),
('bb32f729-0b0f-4269-a7cd-4e38c886ff43',2),
('bb39daea-f918-44bc-b8fb-ff4b234a8f4e',1),
('bcae106a-8606-4d14-8d30-a993d7982a0a',1),
('bd277b3a-4b20-4e37-88dc-2253b8641e3b',1),
('be0a81cf-8bd9-449c-91f2-643bfadc29fa',1),
('bf98067b-b2e6-4160-99b2-8efcb36e1fd4',2),
('bfa767f2-9b6d-4e52-bf5a-4075880b0390',2),
('bfee6ed8-0027-4e92-9a10-863aa2093d1a',1),
('c004e9e3-ca12-498b-8a04-c219f38579e1',5),
('c01dabaa-d285-4a69-9a39-8b33c19f21d4',1),
('c03cc5a7-9cd5-4273-b0fd-696755404443',5),
('c04656fd-8bd2-4847-a83d-2847968a6317',4),
('c067a6d6-3f11-468d-a9f2-a7e9e3aa6c15',6),
('c12f3fbe-05b7-4562-b233-49b2403415df',1),
('c140c36b-bc85-4eaa-b260-1693227b0f0c',1),
('c1eea058-89c3-4bcb-997d-1dc492bc9253',2),
('c20ea9f4-1e66-4faa-9568-eca2430bf236',4),
('c2195c40-1bc4-44ed-b1c9-28626eb5336e',1),
('c2425901-b199-43e4-a524-19ad34bdf606',4),
('c42d8d4f-5d42-41b4-8827-f9f2ebb11911',1),
('c42edb89-ef42-44ad-88d9-fc279db0f7d0',5),
('c43c9fbd-16f9-497e-b869-78ef46e76e6a',3),
('c4648349-437e-4a41-8f36-242fbeb7e8f2',1),
('c54905d3-70cb-4c62-af94-68ef8d8336c3',30),
('c63753d5-85f9-4da8-857a-04813700af95',2),
('c65baa2e-b1ee-4f5e-9afb-301b116cb992',1),
('c686c43f-018b-44b5-99ff-d17349b4e4b6',1),
('c70e20b9-e962-486b-abae-b7424c9fd09e',1),
('c72c3c54-39e5-480e-8995-fa992a507a0f',1),
('c853841a-2635-4800-99ad-193d6586d7da',4),
('c863f37f-16fe-4987-b0a9-d489f8f957e1',5),
('c8840a34-735e-4169-9f0a-147c3c7b93d0',8),
('c88d1d05-c124-4a2f-aefe-6a291ad5b0d2',1),
('c91bce30-d1c2-442b-be01-6f8e16dc9f03',17),
('c93f41ca-f81d-4f09-b2d1-4e14643e0cc2',1),
('c95f9cd4-9d76-41c5-81cb-fa5b9307f5eb',5),
('caf018fd-6ef0-4e79-b515-79fad62b95be',1),
('caf91694-d007-4949-a703-f88103f64d60',1),
('cb46a8c1-3995-45f9-a923-92cd39406a1c',1),
('cb69d7ad-680c-44b0-8830-985fce34f663',2),
('cb9b8823-48b9-4c31-8240-522514227d86',17),
('cb9b8bf8-f989-4fdb-82db-c32b3d494df8',1),
('cba458ed-352f-4fa8-b2af-d9aeb0bc0ea4',1),
('cbd7101c-521f-4158-89f1-4a37d8284d08',1),
('cbf55626-b007-4739-bb76-e3896eb12f09',1),
('cc0e45eb-39fa-4ab6-b247-775472c9eb0b',1),
('cc1cf242-a9f8-4e3d-ace4-8d9d733c21d2',3),
('cc5fed44-b282-410e-a8c8-67302248fceb',22),
('ccd86a2c-1b34-44db-a108-8aefcdae1ce6',4),
('cd32292d-586e-4dd0-b527-7c132cb0b302',14),
('cdbb5131-c283-418a-b8ed-4e76d72f12dd',6),
('cdbc5bd0-e6e5-469a-9cba-f3cd27c8f20a',1),
('cdc55a42-4190-46fa-94e5-382841c3e0b0',1),
('cde33277-56dc-4837-8f6c-10533c8e827b',2),
('ce2beefb-99de-4582-928e-128fc5f2fa47',4),
('cf057020-a2a2-4e4e-a96a-a6c63185d561',1),
('cf5d6e4e-c80f-42b9-9b9b-be72ace4b20c',2),
('cf747c4a-aace-4523-89c8-f7fe72fa1385',1),
('cff05054-495f-412c-b8d7-7ebc716157a4',2),
('d044917a-b4c1-4aaf-a202-4c477e3845c3',16),
('d063e9ca-0f40-4f38-8b31-4a8c91626195',1),
('d066f8b9-31c3-430d-bfdd-b1a228a1b879',2),
('d0a95844-392a-4374-8294-86f93fc17120',1),
('d0c2f551-c6f6-4060-b785-0302ec24bb1d',1),
('d0d6df08-84f4-49f3-a188-e511832eb2b4',1),
('d121fce9-feda-40de-96af-55ce0f710e99',1),
('d13a2647-e709-43f5-8200-f21dacfb7725',1),
('d15d2ca6-af60-49e7-9b36-b46f8e9f2b26',1),
('d23b8339-1f26-4d84-b7cc-7ddf05b89f04',1),
('d298e5ac-d130-4d86-9815-c9522efe7f16',1),
('d2c8e1ba-2bba-4178-a715-c706cb047496',14),
('d3118add-13e0-4551-9e84-b2786f133705',1),
('d3677110-95df-43d1-b0e1-1e47ac2b8ee5',1),
('d37b1a5e-10a6-4df2-9ebc-a88a2717c8c9',1),
('d3de95ed-31f1-42a8-8c12-5c8f7d03a62f',1),
('d40ad10d-5f0e-4cdb-a9fa-db81d4ec00d7',2),
('d423ccc8-412f-4bb7-b668-5a3d8106e093',2),
('d4306f3d-f29e-4986-a531-a02f9558924c',1),
('d478aa1d-0c9b-496e-bba2-096e1b173352',7),
('d4e20610-f980-4d17-b4bc-d5273a21aba4',6),
('d542eadb-9d9c-4160-bcab-e19ee59cb3f3',1),
('d55d466c-6c56-40d0-8b21-639d9dfd00a1',1),
('d5ed1368-02a3-41f5-9df7-b308fb3f9b0b',1),
('d6222642-a8c3-48a0-805e-6c281c604a52',6),
('d633c497-a77d-4287-9418-dc324696f230',5),
('d6968cf3-623a-4f19-8dc9-14bb85dadf77',6),
('d6baf03b-8ab0-4199-a3aa-88800573d817',1),
('d6d65671-36fd-4437-896d-122ea6eaddc1',1),
('d766f4f6-8948-4e64-9a14-63eff5d8a20b',2),
('d9ce6531-1eda-4c89-8ee1-bcd4cdb6859e',2),
('da7b5482-b4f6-4417-8a70-44bfe324e235',2),
('daac1d84-5019-453d-bc42-05723693bf7b',2),
('dbf239f1-fae9-4b33-b785-f16832a109e4',5),
('dc06eb0c-903a-4d6a-b2a2-366a8d22d929',5),
('dc3c50d7-940e-4612-8fd0-3eef972df4a3',1),
('dc6352fe-95e3-4628-a902-f9efe56db9bd',2),
('dd615a01-476f-4a7f-8c35-e231ae6b8a60',1),
('ddb1c486-ca28-4cdf-90f7-c2718a046b38',1),
('dde44e48-d42f-4d4e-a4bb-6cf267b524e7',1),
('de55a214-1ec4-40e4-a1e1-10c51ec7fdaa',6),
('dee2278a-0708-48b0-8737-8cf0c3a7ef68',1),
('df1ccc25-e1bd-4418-b979-1b86e3842d4a',1),
('e02fe11f-1508-4a1f-9c21-9cf2299b19ef',1),
('e03e6358-6a25-4ad3-91e6-872d5c1aaa45',10),
('e07021c9-762d-473d-be19-bb92eb7c7da7',2),
('e08a558a-e8d6-4f21-99ad-58a2dd3544d1',6),
('e19dbd2e-8993-4446-a5e6-539d1d76ca53',2),
('e1e8df79-9412-43b6-9b96-e172bcd25b1a',30),
('e21f87f6-bba0-43a5-8567-df1ea0636d50',1),
('e239aabb-11fa-4aa0-a8f5-48463e20d0be',1),
('e2658b85-5ccf-4fc2-8958-166c1dbb6925',6),
('e2d2742d-9d80-42b8-96de-badfdb215d65',1),
('e2d3c1cc-c71d-42cf-a875-827814f697bf',2),
('e30fa489-d718-4943-860d-18383918c88e',14),
('e341501c-e280-4113-a23b-2c0b3a184776',2),
('e4b1653f-ff5d-4c2d-bc4f-a72a37d1b7f9',1),
('e4cc0d6a-7f48-44bb-8239-83abfad8ebaf',1),
('e50a8233-1c89-4328-a416-e5dd51e4b7ec',1),
('e5444490-8edc-4b79-ad89-e10bb8ae1399',1),
('e635d0db-62f1-405f-a9f9-e4d9c5ec1427',1),
('e6461bb2-57f1-4d0d-a24f-a751256d4dea',5),
('e6ec6cd6-e167-4abf-bbcc-153ec92fa95c',1),
('e725d978-2fdb-4b02-9861-2203062368c7',12),
('e7d140f5-8d36-4828-b16d-17df4d6e4a90',1),
('e7f06165-2886-479d-94b9-3d83a849bef6',1),
('e84b62a6-8922-42ad-a1ba-5a3a8f48217b',1),
('e8502ec7-0804-4923-a78b-13bbf9562caf',1),
('e87abbfb-c44a-43e4-960e-21c22183683e',14),
('e8864f40-28e6-433f-b810-5ede06068168',5),
('e8b622cf-0f73-48cc-8800-33b296fa2b0a',1),
('e8dc37b8-9d4c-4dab-935f-ad358194d3f7',5),
('e9c0de99-0b4d-40e3-9b75-0fbd3ddd288d',1),
('e9e6b05d-b12b-4d22-a1c1-034876de2f0e',1),
('e9f66d3a-090a-475a-a427-a10620f45f93',5),
('ea918a41-0d5b-44ee-be23-17a81c154a18',5),
('ebc80c4b-88d7-401d-a5fa-52c850aa4a60',4),
('ec8c7476-2186-43ee-a139-8d2cb7278b1c',2),
('ecf5bd1d-b0e4-46e3-ae3d-898c5836cd0d',1),
('eda99585-9272-4e7f-b1e8-0d5c78556415',2),
('ee083bf4-f2fe-46a9-a255-f5b4116f12ed',1),
('ee16fb20-283d-451a-a256-eb0fae9051f8',1),
('ee49736b-5d1e-4213-aa22-5894497cb656',1),
('ee6c9701-54b7-4325-b84d-f085525f97d9',4),
('ee728464-d0e3-48b8-8d5f-facf9bb38d43',26),
('eeec1572-622d-4b6b-b2a2-3260b4c360cb',6),
('eef61c5c-9688-4aca-8537-d9e298962c07',1),
('efa66cd7-d3dd-4685-a103-658edb22a3eb',1),
('f0b5b84a-d752-4088-95fc-270f191a380f',30),
('f14de4f2-160c-45c6-beb9-21f9fac9bcaa',1),
('f1dfbb04-9cb1-43cb-b2de-0e4d082ffec9',31),
('f2a49d31-c48c-404a-bf82-c68d1b60c19e',5),
('f30f4e59-f1da-45d9-bfee-84dc992adb7a',14),
('f3537737-650f-4685-a8b8-04507e687b53',32),
('f3d2b5e6-c0e8-4397-92ae-7f9a959e182a',1),
('f4172994-b297-4021-8c9d-ee32ddc016f5',2),
('f45d2671-a5fa-4bf6-98ef-e2c40a8dfda6',1),
('f4ace59c-fcfc-4bbf-aed2-4802498dfe88',1),
('f4db9f72-930f-46c4-92fc-921a3e2ec260',1),
('f5fa5776-217f-4aff-87bb-efd26447a9cc',1),
('f673cea0-e80c-4e7b-9401-54092ef48ff2',5),
('f6fd485c-f3df-42be-9081-81cb140c6abf',4),
('f76fe75a-34c2-41b2-a9be-7f243428b175',1),
('f7895742-70ce-49ee-8381-ee78da4806be',1),
('f7b95f33-4b36-4140-a93f-5aa5ca167188',5),
('f7dd1e5e-76db-4667-a672-7b4f363b56d8',14),
('f85ab20d-c499-4ec6-8302-6a985ef68723',2),
('f95faa24-3535-435c-a1ef-934b68a6f3ae',1),
('facd11f1-caa0-4514-b4f2-6c1288699dc0',1),
('faeff625-a313-46af-872e-74481a4b82e7',1),
('fb4b5397-4dad-4301-beca-a9eba497d07a',1),
('fbb60dff-8cde-4687-9ba0-1410c1dd05f3',2),
('fcaa4c67-20ba-45c6-b457-2bff7c2acc67',4),
('fd096e02-1a44-4933-81e9-0afb22b8cd6f',1),
('fd59eefa-f7c4-482b-a13d-153ea3a5938e',1),
('fdc21f5b-9ee0-4d67-8fc4-da8dbe2435e9',5),
('fe074b33-5ead-42c3-9aee-d2ec9cc82f92',1),
('fe21fb0b-01da-4fb3-86d1-14e4ad2a3df6',1),
('fe2c48f1-b5cc-42d5-9030-91e6760886fd',1),
('fe5d144b-0cf9-4c3d-b2fa-4728e7068f23',4),
('fef5b525-832d-4266-9505-6c5bac7fa1ae',5),
('ff0a5623-b140-4c0d-b503-5331564a3ca1',1),
('ff13bd73-f2eb-4dc0-97c1-415a19e76452',5),
('ff41bc5a-b51f-4665-91de-4cd7a17b53c1',6),
('ff42c7e8-b656-4570-939a-cc63ddc5328b',14)
) v(id, n) JOIN _dcc_combo c ON c.n = v.n;

-- ═════════════ (c) A REGRA TEXTO -> LINHA DO PLANO, uma so' para o backfill e para o gatilho ═════════════
-- Mesmo subcentro, mesmo tipo (as duas grafias da transferencia, '3-Transferência' legada e
-- '3-Transferências', contam como uma), ativa; a linha DO CLIENTE vence a global. Mais de uma = NULL
-- (ambiguo). O escopo nao entra no filtro: nenhum nome de subcentro se repete no plano (medido
-- 27/09/2026, exato e normalizado), entao ele nunca desempata nada.
CREATE OR REPLACE FUNCTION public.fn_plano_conta_do_texto(p_cliente uuid, p_subcentro text, p_tipo text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v_tipo text := CASE WHEN p_tipo = '3-Transferência' THEN '3-Transferências' ELSE p_tipo END;
        v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM public.financeiro_plano_contas
   WHERE ativo AND subcentro = p_subcentro AND cliente_id = p_cliente
     AND (CASE WHEN tipo_operacao = '3-Transferência' THEN '3-Transferências' ELSE tipo_operacao END) = v_tipo;
  IF coalesce(array_length(v_ids, 1), 0) = 1 THEN RETURN v_ids[1]; END IF;
  IF coalesce(array_length(v_ids, 1), 0) > 1 THEN RETURN NULL; END IF;
  SELECT array_agg(id) INTO v_ids FROM public.financeiro_plano_contas
   WHERE ativo AND subcentro = p_subcentro AND cliente_id IS NULL
     AND (CASE WHEN tipo_operacao = '3-Transferência' THEN '3-Transferências' ELSE tipo_operacao END) = v_tipo;
  IF coalesce(array_length(v_ids, 1), 0) = 1 THEN RETURN v_ids[1]; END IF;
  RETURN NULL;
END;
$function$;

-- ═════════════ (b) GUARDA DA LISTA: 647 linhas, 638 por texto, 9 por chave, e cada uma no estado esperado ═════════════
DO $$
DECLARE v_n int; v_t int; v_c int; v_div text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE lado = 'TEXTO'), count(*) FILTER (WHERE lado = 'CHAVE')
    INTO v_n, v_t, v_c FROM _dcc_lista;
  IF v_n <> 647 OR v_t <> 638 OR v_c <> 9 THEN
    RAISE EXCEPTION 'DRE-CLASSIF-COPIA-01: lista com % linhas (% texto, % chave); esperado 647 (638, 9)', v_n, v_t, v_c;
  END IF;
  -- A lista literal e' a aprovada, byte a byte: md5 canonico (id|chave|texto|chave nova|lado, uma linha por lancamento).
  SELECT md5(string_agg(concat_ws('|', lancamento_id, chave_esperada, subcentro_esperado, chave_nova, lado), E'\n'
                        ORDER BY lancamento_id::text COLLATE "C")) INTO v_div FROM _dcc_lista;
  IF v_div <> '12d5949514cd879e2399050f3380ab4a' THEN
    RAISE EXCEPTION 'DRE-CLASSIF-COPIA-01: md5 da lista % difere do aprovado 12d5949514cd879e2399050f3380ab4a', v_div;
  END IF;
  SELECT string_agg(x.lancamento_id::text, ', ' ORDER BY x.lancamento_id) INTO v_div
    FROM _dcc_lista x LEFT JOIN public.financeiro_lancamentos_v2 l ON l.id = x.lancamento_id
   WHERE l.id IS NULL OR coalesce(l.cancelado, false)
      OR l.plano_conta_id IS DISTINCT FROM x.chave_esperada
      OR l.subcentro IS DISTINCT FROM x.subcentro_esperado;
  IF v_div IS NOT NULL THEN
    RAISE EXCEPTION 'DRE-CLASSIF-COPIA-01: linhas fora do estado esperado (chave ou texto mudaram): %', v_div;
  END IF;
END $$;

-- ═════════════ (c) GUARDA DO ALVO: a chave nova existe, esta' ativa e, no lado TEXTO, e' a UNICA linha do texto ═════════════
-- Regra: mesmo subcentro, mesmo tipo (as duas grafias da transferencia contam como uma), linha do cliente antes da global.
DO $$
DECLARE v_div text;
BEGIN
  SELECT string_agg(x.lancamento_id::text, ', ') INTO v_div
    FROM _dcc_lista x
    JOIN public.financeiro_lancamentos_v2 l ON l.id = x.lancamento_id
    LEFT JOIN public.financeiro_plano_contas p ON p.id = x.chave_nova AND p.ativo
   WHERE p.id IS NULL
      OR (x.lado = 'TEXTO' AND x.chave_nova IS DISTINCT FROM public.fn_plano_conta_do_texto(l.cliente_id, l.subcentro, l.tipo_operacao))
      OR (x.lado = 'CHAVE' AND x.chave_nova IS DISTINCT FROM x.chave_esperada);
  IF v_div IS NOT NULL THEN
    RAISE EXCEPTION 'DRE-CLASSIF-COPIA-01: alvo invalido ou ambiguo para: %', v_div;
  END IF;
END $$;

-- ═════════════ (f) O GATILHO: A CHAVE E' A FONTE; AS COPIAS SAO DERIVADAS EM TODO INSERT E UPDATE ═════════════
CREATE OR REPLACE FUNCTION public.resolve_classificacao_from_plano()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
    DECLARE
      v_plano RECORD;
      v_id uuid;
      v_chave_mudou boolean;
      v_texto_mudou boolean;
      v_guard boolean;
    BEGIN
      -- DRE-CLASSIF-COPIA-01: classificacao = plano_conta_id. macro/grupo/centro/subcentro/escopo sao
      -- DERIVADOS da linha do plano em TODO INSERT e UPDATE; o que vier do cliente nao prevalece.
      v_chave_mudou := TG_OP = 'INSERT' OR NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id;
      v_texto_mudou := TG_OP = 'UPDATE' AND NEW.subcentro IS DISTINCT FROM OLD.subcentro;
      -- As regras de escopo (safra/fazenda do administrativo) seguem so' quando uma coluna soberana
      -- muda, como antes (PR-FIN-RESOLVE-SCOPE-01): mudar descricao nao move fazenda.
      v_guard := TG_OP = 'INSERT'
         OR NEW.subcentro      IS DISTINCT FROM OLD.subcentro
         OR NEW.tipo_operacao  IS DISTINCT FROM OLD.tipo_operacao
         OR NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id
         OR NEW.macro_custo    IS DISTINCT FROM OLD.macro_custo
         OR NEW.safra_id       IS DISTINCT FROM OLD.safra_id
         OR NEW.fazenda_id     IS DISTINCT FROM OLD.fazenda_id;

      <<resolve>>
      BEGIN
        -- (1) A CHAVE MANDA: ha chave e (ela mudou, ou o texto nao mudou).
        IF NEW.plano_conta_id IS NOT NULL AND (v_chave_mudou OR NOT v_texto_mudou) THEN
          SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio INTO v_plano
            FROM public.financeiro_plano_contas WHERE id = NEW.plano_conta_id AND ativo = true;
          IF FOUND THEN
            NEW.subcentro      := v_plano.subcentro;
            NEW.macro_custo    := v_plano.macro_custo;
            NEW.grupo_custo    := v_plano.grupo_custo;
            NEW.centro_custo   := v_plano.centro_custo;
            NEW.escopo_negocio := v_plano.escopo_negocio;
            EXIT resolve;
          END IF;
          -- chave inexistente/inativa: cai para o texto, como antes
        END IF;

        -- (2) SEM TEXTO: nao ha o que resolver.
        IF NEW.subcentro IS NULL OR btrim(NEW.subcentro) = '' THEN
          EXIT resolve;
        END IF;

        -- (3) SEM CHAVE, UPDATE QUE NAO MEXE EM CHAVE NEM TEXTO: nao mexe (os dividendos fora do plano).
        IF TG_OP = 'UPDATE' AND NEW.plano_conta_id IS NULL AND NOT v_chave_mudou AND NOT v_texto_mudou THEN
          EXIT resolve;
        END IF;

        -- (4) O TEXTO RESOLVE A CHAVE: INSERT sem chave, texto trocado pelo operador, ou chave ida a nulo.
        v_id := public.fn_plano_conta_do_texto(NEW.cliente_id, NEW.subcentro, NEW.tipo_operacao);
        IF v_id IS NOT NULL THEN
          SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio INTO v_plano
            FROM public.financeiro_plano_contas WHERE id = v_id;
          NEW.plano_conta_id := v_plano.id;
          NEW.subcentro      := v_plano.subcentro;
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          EXIT resolve;
        END IF;

        -- (5) TEXTO FORA DO PLANO: erro, EXCETO dividendos (B1; pendencia DIVIDENDOS-PLANO-01).
        --     O dividendo fica sem chave e com o texto e as copias que vieram, como hoje.
        IF NEW.macro_custo IS DISTINCT FROM 'Dividendos' THEN
          RAISE EXCEPTION 'Subcentro "%" nao existe no plano de contas. Selecione um subcentro canonico.', NEW.subcentro
            USING ERRCODE = 'check_violation';
        END IF;
        NEW.plano_conta_id := NULL;
      END;

      IF v_guard THEN
        -- FIN-SAFRA-ADM-03: lancamento administrativo nao tem safra (regra na fonte; o modal so avisa)
        IF NEW.escopo_negocio = 'administrativo' THEN
          NEW.safra_id := NULL;
          -- FIN-FAZENDA-ADM-01: administrativo vai para a fazenda "Administrativo" do cliente
          SELECT f.id INTO NEW.fazenda_id
            FROM fazendas f
           WHERE f.cliente_id = NEW.cliente_id AND f.nome ILIKE '%administrat%'
           ORDER BY f.nome LIMIT 1;
        END IF;

        -- FIN-ESCOPO-SAFRA-01: nao-administrativo nao pode ter safra de outra atividade
        IF NEW.escopo_negocio IS DISTINCT FROM 'administrativo' AND NEW.safra_id IS NOT NULL THEN
          DECLARE v_safra_escopo text;
          BEGIN
            SELECT escopo_negocio INTO v_safra_escopo FROM financeiro_safras WHERE id = NEW.safra_id;
            IF v_safra_escopo IS NOT NULL AND v_safra_escopo IS DISTINCT FROM NEW.escopo_negocio THEN
              RAISE EXCEPTION 'Safra e de % mas o lancamento e de %. Escolha uma safra da mesma atividade.', v_safra_escopo, NEW.escopo_negocio
                USING ERRCODE = 'check_violation';
            END IF;
          END;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $function$;

-- O gatilho passa a disparar em TODO UPDATE (antes: so' em UPDATE OF seis colunas).
DROP TRIGGER IF EXISTS trg_resolve_classificacao_plano ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_resolve_classificacao_plano
  BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public.resolve_classificacao_from_plano();

-- ═════════════ (d)+(e) O BACKFILL — auditoria LIGADA; so' o editado_manual desligado ═════════════
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;

UPDATE public.financeiro_lancamentos_v2 l
   SET plano_conta_id = p.id,
       subcentro      = p.subcentro,
       macro_custo    = p.macro_custo,
       grupo_custo    = p.grupo_custo,
       centro_custo   = p.centro_custo,
       escopo_negocio = p.escopo_negocio
  FROM _dcc_lista x
  JOIN public.financeiro_plano_contas p ON p.id = x.chave_nova
 WHERE l.id = x.lancamento_id;

ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;

-- A linha de auditoria diz de onde veio: motivo no resumo, usuario nulo (sistema). Os valores antigos
-- ja' estao em dados_anteriores (audit_trigger_financeiro_v2).
UPDATE public.audit_log a
   SET resumo = 'DRE-CLASSIF-COPIA-01 | ' || coalesce(a.resumo, ''), usuario_id = NULL
 WHERE a.tabela_origem = 'financeiro_lancamentos_v2'
   AND a.created_at = now()
   AND a.registro_id IN (SELECT lancamento_id FROM _dcc_lista);

DO $$
DECLARE v_n int; v_a int;
BEGIN
  SELECT count(*) INTO v_n FROM _dcc_lista x JOIN public.financeiro_lancamentos_v2 l ON l.id = x.lancamento_id
    JOIN public.financeiro_plano_contas p ON p.id = l.plano_conta_id
   WHERE l.plano_conta_id = x.chave_nova AND l.subcentro = p.subcentro AND l.macro_custo IS NOT DISTINCT FROM p.macro_custo
     AND l.grupo_custo IS NOT DISTINCT FROM p.grupo_custo AND l.centro_custo IS NOT DISTINCT FROM p.centro_custo
     AND l.escopo_negocio IS NOT DISTINCT FROM p.escopo_negocio;
  IF v_n <> 647 THEN
    RAISE EXCEPTION 'DRE-CLASSIF-COPIA-01: depois do backfill so % de 647 linhas coerentes com a chave', v_n;
  END IF;
  SELECT count(*) INTO v_a FROM public.audit_log a
   WHERE a.created_at = now() AND a.resumo LIKE 'DRE-CLASSIF-COPIA-01 | %'
     AND a.registro_id IN (SELECT lancamento_id FROM _dcc_lista);
  IF v_a <> 647 THEN
    RAISE EXCEPTION 'DRE-CLASSIF-COPIA-01: % linhas de auditoria, esperado 647', v_a;
  END IF;
END $$;

-- ═════════════ (g) MUDOU O PLANO, MUDAM AS COPIAS ═════════════
CREATE OR REPLACE FUNCTION public.fn_propagar_plano_para_lancamentos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  -- DRE-CLASSIF-COPIA-01: a copia no lancamento e' derivada. Quando a linha do plano muda de macro,
  -- grupo, centro, subcentro ou escopo, os lancamentos com aquela chave acompanham — antes dependia de
  -- cada migration lembrar (PLANO-LAVOURA-01 lembrou; o editor depois regravou o velho).
  -- A propagacao nao e' edicao humana: a marca local da transacao faz o gatilho de editado_manual
  -- ignorar ESTE UPDATE (e so' ele — a marca volta a 'off' logo depois).
  PERFORM set_config('app.propagando_plano', 'on', true);
  UPDATE public.financeiro_lancamentos_v2 l
     SET macro_custo = NEW.macro_custo, grupo_custo = NEW.grupo_custo, centro_custo = NEW.centro_custo,
         subcentro = NEW.subcentro, escopo_negocio = NEW.escopo_negocio
   WHERE l.plano_conta_id = NEW.id
     AND (l.macro_custo IS DISTINCT FROM NEW.macro_custo OR l.grupo_custo IS DISTINCT FROM NEW.grupo_custo
       OR l.centro_custo IS DISTINCT FROM NEW.centro_custo OR l.subcentro IS DISTINCT FROM NEW.subcentro
       OR l.escopo_negocio IS DISTINCT FROM NEW.escopo_negocio);
  PERFORM set_config('app.propagando_plano', 'off', true);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propagar_plano_para_lancamentos ON public.financeiro_plano_contas;
CREATE TRIGGER trg_propagar_plano_para_lancamentos
  AFTER UPDATE OF macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio ON public.financeiro_plano_contas
  FOR EACH ROW
  WHEN (OLD.macro_custo IS DISTINCT FROM NEW.macro_custo OR OLD.grupo_custo IS DISTINCT FROM NEW.grupo_custo
     OR OLD.centro_custo IS DISTINCT FROM NEW.centro_custo OR OLD.subcentro IS DISTINCT FROM NEW.subcentro
     OR OLD.escopo_negocio IS DISTINCT FROM NEW.escopo_negocio)
  EXECUTE FUNCTION public.fn_propagar_plano_para_lancamentos();

-- ═════════════ (g2) EDITADO_MANUAL: a propagacao do plano nao e' edicao humana ═════════════
-- Corpo de hoje (md5 74a76d1a) mais UMA guarda no inicio: com a marca 'app.propagando_plano' = 'on'
-- (so' dentro de fn_propagar_plano_para_lancamentos), nao marca.
CREATE OR REPLACE FUNCTION public.mark_financeiro_lancamento_v2_editado_manual()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- DRE-CLASSIF-COPIA-01: a copia que acompanha o plano nao e' edicao humana.
  IF coalesce(current_setting('app.propagando_plano', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.lote_importacao_id IS NOT NULL
     AND COALESCE(OLD.editado_manual, false) = false
     AND (
       NEW.fazenda_id IS DISTINCT FROM OLD.fazenda_id OR
       NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id OR
       NEW.ano_mes IS DISTINCT FROM OLD.ano_mes OR
       NEW.data_competencia IS DISTINCT FROM OLD.data_competencia OR
       NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento OR
       NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao OR
       NEW.status_transacao IS DISTINCT FROM OLD.status_transacao OR
       NEW.descricao IS DISTINCT FROM OLD.descricao OR
       NEW.documento IS DISTINCT FROM OLD.documento OR
       NEW.historico IS DISTINCT FROM OLD.historico OR
       NEW.valor IS DISTINCT FROM OLD.valor OR
       NEW.sinal IS DISTINCT FROM OLD.sinal OR
       NEW.macro_custo IS DISTINCT FROM OLD.macro_custo OR
       NEW.centro_custo IS DISTINCT FROM OLD.centro_custo OR
       NEW.subcentro IS DISTINCT FROM OLD.subcentro OR
       NEW.escopo_negocio IS DISTINCT FROM OLD.escopo_negocio OR
       NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id OR
       NEW.favorecido_id IS DISTINCT FROM OLD.favorecido_id OR
       NEW.observacao IS DISTINCT FROM OLD.observacao OR
       NEW.numero_documento IS DISTINCT FROM OLD.numero_documento OR
       NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento OR
       NEW.dados_pagamento IS DISTINCT FROM OLD.dados_pagamento OR
       NEW.contrato_id IS DISTINCT FROM OLD.contrato_id
     ) THEN
    NEW.editado_manual := true;
  END IF;

  RETURN NEW;
END;
$function$;

-- ═════════════ GUARDA DE DESTINO: os quatro corpos sao os provados no PASSO 1 ═════════════
DO $$
DECLARE v_div text;
BEGIN
  SELECT string_agg(x.f || ' ' || coalesce(md5(p.prosrc), 'ausente'), ', ') INTO v_div
    FROM (VALUES ('resolve_classificacao_from_plano', 'b1be54de'), ('mark_financeiro_lancamento_v2_editado_manual', 'd71a1583'),
                 ('fn_propagar_plano_para_lancamentos', '6ab44f9d'), ('fn_plano_conta_do_texto', 'd5bce1ea')) x(f, m)
    LEFT JOIN pg_proc p ON p.proname = x.f AND p.pronamespace = 'public'::regnamespace
   WHERE left(coalesce(md5(p.prosrc), ''), 8) <> x.m;
  IF v_div IS NOT NULL THEN
    RAISE EXCEPTION 'DRE-CLASSIF-COPIA-01: corpo diferente do provado: %', v_div;
  END IF;
END $$;

-- ═════════════ (h) ACL: funcoes de gatilho nao se chamam direto ═════════════
REVOKE ALL ON FUNCTION public.resolve_classificacao_from_plano() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_propagar_plano_para_lancamentos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_plano_conta_do_texto(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_classificacao_from_plano() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_propagar_plano_para_lancamentos() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_plano_conta_do_texto(uuid, text, text) TO service_role;
