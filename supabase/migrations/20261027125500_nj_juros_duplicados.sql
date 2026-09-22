-- NJ-JUROS-DUPLICADOS-01 (22/09/2026) - financiamentos e juros em dobro no NJ
--
-- Migration de DADO, so do cliente NJ (f2d67cd4). Nenhuma RPC, nenhuma tela.
--
-- A importacao de 20/04/2026 criou tres contratos em dobro, no mesmo instante
-- (14:53:46.965611), cada lado com um credor "Banco do Brasil" diferente:
-- ac019ca9 (o cadastro principal, 14 financiamentos) e 200d8af3 (nascido na
-- importacao em dobro). Fica sempre o lado do ac019ca9.
--
-- REGRA (precedente do N33, 03/09): fica a PLANILHA (data real de caixa) e
-- cancela o MODULO (data contratual). Cancelamento logico com motivo, nunca
-- DELETE. Nenhum valor e alterado.
--
--   CASO 1 - N32 Custeio BB 2023 (C_40/04063-1)
--     Reativa a planilha de 20/08/2025 (juros 4596acbc 568.343,56 e amortizacao
--     8b0f20cd 2.070.225,00) e cancela os quatro lancamentos do modulo de 25/08.
--     A planilha estava cancelada SEM plano de contas: as 130 linhas canceladas
--     do lote ca4c92a2 nunca receberam plano, e a DRE faz join interno nele.
--     Reativar sem plano deixaria os juros invisiveis. Ganham o plano dos gemeos
--     do modulo: 7010 (juros) e 16020 (amortizacao).
--     Fica bc489a77; cancela 308e061c. A parcela do bc489a77 passa a apontar a
--     planilha.
--   CASO 2 - Sicredi C_441204330 (beaa81ec), parcela 1 de 15/09/2025
--     Vale o juros cobrado (85a3162f 128.999,98); cancela o contratual do modulo
--     (8a28cee2 100.500,00). 85a3162f passa a ser do contrato e da parcela.
--   CASO 3 - CPR 2019: fica 9636ba80, cancela 046273b4 e o par dele.
--   CASO 4 - Pessoal Florindo 1efa4bbc: cadastro vazio, cancelado com as
--     duas parcelas zeradas.
--   CASO 5 - N33 CPR BB 2023: lancamentos resolvidos em 03/09. Fica df0369c6,
--     cancela 132abffb. A parcela do df0369c6 passa a apontar a planilha de
--     21/11 (aed48c4c / b768e3a5).
--
-- A parcela guarda o valor contratual e o lancamento o valor pago; onde eles
-- diferem (Sicredi 100.500 x 128.999,98; N33 345.234,37 x 350.460,33) fica como
-- esta.
--
-- ENCAIXE: correcao de dado sobre tabelas existentes (financeiro_lancamentos_v2,
-- financiamentos, financiamento_parcelas). Nenhuma fonte, contrato, calculo ou
-- componente novo.
--
-- Guarda de saida (RAISE, nada grava):
--   - contrato vivo do NJ com 2+ juros ativos na mesma data e valor = 0
--   - contratos vivos com mesma descricao+contrato+NOME do credor+valor = 0
--   - fn_dre_pecuaria NJ jul/25-jun/26: juros entre 1.470.000 e 1.475.000
--   - amortizacoes ativas (16010/16020) do NJ caem exatamente 2.735.779,41

do $mig$
declare
  c   constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  gab constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  pl_juros constant uuid := '5d4a5c70-311d-4302-98f0-b2846d9738fc';
  pl_amort constant uuid := '0d42d354-926a-4a10-ab3a-f082adaef972';
  am_a numeric; am_d numeric; juros_d numeric; n int; pec_d jsonb;
begin
  -- -- ENTRADA: o estado e o da FASE 0 de 22/09 05:50 -----------------------
  select count(*) into n
    from (values
      ('4596acbc-20ff-459a-9485-8daa899cf01b'::uuid, true,  null::uuid,                              null::uuid, 568343.56),
      ('8b0f20cd-939c-419d-9086-2324f6a20159',       true,  null,                                    null,       2070225.00),
      ('2b79888e-dc1a-402f-bcf4-7eb98bbe6a33',       false, '308e061c-2ada-458b-8b76-162df136f9ed',  pl_juros,   568343.56),
      ('ca035ae1-bc5f-40e6-a488-8d9768195fc0',       false, '308e061c-2ada-458b-8b76-162df136f9ed',  pl_amort,   2070225.00),
      ('a608f111-771d-4b46-8f51-ffb89f3df471',       false, 'bc489a77-17e2-43d0-834a-7c9a3d8c2948',  pl_juros,   568343.56),
      ('5b259dba-7c42-4f8f-9c57-ad78bcd650ff',       false, 'bc489a77-17e2-43d0-834a-7c9a3d8c2948',  pl_amort,   2070225.00),
      ('8a28cee2-7063-4291-83ae-7c00d419b1dc',       false, 'beaa81ec-cd9c-45f9-bfe9-c062fac68f01',  pl_juros,   100500.00),
      ('85a3162f-89af-419b-a9c0-27e1ec6c4cce',       false, null,                                    pl_juros,   128999.98),
      ('1c2d7f58-8257-4052-a86b-3be25f5c112a',       false, '046273b4-fb57-4964-8bf7-dec9b190bc3d',  pl_juros,   28149.79),
      ('90939ace-e963-413f-b7ae-624b0c811277',       false, '046273b4-fb57-4964-8bf7-dec9b190bc3d',  pl_amort,   665554.41),
      ('fe1c5f41-ee79-410e-b705-d887059adc86',       false, '9636ba80-5801-4b60-ae70-033add91a9dd',  pl_juros,   28149.79),
      ('b07a3be9-ecaa-4ede-91ee-7e90344c59e2',       false, '9636ba80-5801-4b60-ae70-033add91a9dd',  pl_amort,   665554.41),
      ('aed48c4c-8518-45ef-91e0-9010060b8b39',       false, null,                                    pl_amort,   1501019.00),
      ('b768e3a5-30f4-4f16-bd88-a8ca107b259a',       false, null,                                    pl_juros,   350460.33)
    ) e(id, canc, fin, plano, valor)
    join public.financeiro_lancamentos_v2 l on l.id = e.id
   where l.cliente_id = c
     and coalesce(l.cancelado, false) = e.canc
     and l.financiamento_id is not distinct from e.fin
     and l.plano_conta_id is not distinct from e.plano
     and round(l.valor::numeric, 2) = e.valor;
  if n <> 14 then raise exception 'ENTRADA lancamentos: % de 14 no estado esperado', n; end if;

  select count(*) into n
    from (values
      ('308e061c-2ada-458b-8b76-162df136f9ed'::uuid, 'quitado', '200d8af3-cf97-4832-8720-becca01d8566'::uuid),
      ('bc489a77-17e2-43d0-834a-7c9a3d8c2948',       'quitado', 'ac019ca9-fd1f-4787-a797-edcfb2544ce4'),
      ('046273b4-fb57-4964-8bf7-dec9b190bc3d',       'quitado', '200d8af3-cf97-4832-8720-becca01d8566'),
      ('9636ba80-5801-4b60-ae70-033add91a9dd',       'quitado', 'ac019ca9-fd1f-4787-a797-edcfb2544ce4'),
      ('132abffb-3416-48f9-9285-0304715d128e',       'quitado', '200d8af3-cf97-4832-8720-becca01d8566'),
      ('df0369c6-57fc-4143-b031-641b38fdab7f',       'quitado', 'ac019ca9-fd1f-4787-a797-edcfb2544ce4'),
      ('1efa4bbc-7f77-434a-944f-ed817ed00fa2',       'quitado', 'e7e98923-3896-4c44-9d2a-be1c29c5deee'),
      ('beaa81ec-cd9c-45f9-bfe9-c062fac68f01',       'ativo',   '75e9b905-bcbc-477e-9e43-56fe1019c13b')
    ) e(id, status, credor)
    join public.financiamentos f on f.id = e.id
   where f.cliente_id = c and f.status = e.status and f.credor_id = e.credor;
  if n <> 8 then raise exception 'ENTRADA contratos: % de 8 no estado esperado', n; end if;

  select count(*) into n
    from (values
      ('a04a1aeb-45bf-4101-851b-4b74a0090b7c'::uuid, 'bc489a77-17e2-43d0-834a-7c9a3d8c2948'::uuid, '5b259dba-7c42-4f8f-9c57-ad78bcd650ff'::uuid, 'a608f111-771d-4b46-8f51-ffb89f3df471'::uuid),
      ('b7d15b36-877c-4ee4-a69d-6fd1e42b8fd5',       'df0369c6-57fc-4143-b031-641b38fdab7f',       'a49562fb-0d9b-483e-a459-73a7e019f86f',       '62036caa-8f1c-4095-a5cd-ede37273bfe2'),
      ('ca3b211c-2c2c-4780-88f4-c425a111fc23',       'beaa81ec-cd9c-45f9-bfe9-c062fac68f01',       'ae6bb807-c389-431d-aa5f-576909ecf257',       '8a28cee2-7063-4291-83ae-7c00d419b1dc'),
      ('fe62d2c6-649c-4d36-970d-f176db3f460b',       '1efa4bbc-7f77-434a-944f-ed817ed00fa2',       null,                                         null),
      ('663e3a2a-1472-4498-9ba6-9e694d7822a3',       '1efa4bbc-7f77-434a-944f-ed817ed00fa2',       null,                                         null)
    ) e(id, fin, lp, lj)
    join public.financiamento_parcelas p on p.id = e.id
   where p.financiamento_id = e.fin and p.status = 'pago'
     and p.lancamento_id is not distinct from e.lp and p.lancamento_juros_id is not distinct from e.lj;
  if n <> 5 then raise exception 'ENTRADA parcelas: % de 5 no estado esperado', n; end if;

  select round(sum(l.valor), 2) into am_a
    from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.cliente_id = c and not coalesce(l.cancelado, false) and l.cenario = 'realizado' and p.ordem_exibicao in (16010, 16020);

  -- -- CASO 1: N32 ----------------------------------------------------------
  update public.financeiro_lancamentos_v2
     set cancelado = false, cancelado_em = null, cancelado_por = null,
         plano_conta_id = case when id = '4596acbc-20ff-459a-9485-8daa899cf01b' then pl_juros else pl_amort end,
         observacao = concat_ws(' | ', nullif(btrim(observacao), ''),
           'Reativado 22/09/2026 (NJ-JUROS-DUPLICADOS-01): pagamento real de 20/08 confirmado pelo caixa; substitui o par do modulo de 25/08. '
           || 'Plano atribuido na reativacao (7010 juros / 16020 amortizacao, igual aos gemeos do modulo): cancelada, a linha nunca tinha recebido plano')
   where cliente_id = c and id in ('4596acbc-20ff-459a-9485-8daa899cf01b', '8b0f20cd-939c-419d-9086-2324f6a20159');
  get diagnostics n = row_count; if n <> 2 then raise exception 'CASO 1 reativar: % linhas', n; end if;

  update public.financeiro_lancamentos_v2
     set cancelado = true, cancelado_em = now(), cancelado_por = gab,
         cancelado_motivo = 'Cancelado 22/09/2026 (NJ-JUROS-DUPLICADOS-01): duplicado do pagamento da planilha de 20/08 (lancamento 4596acbc / 8b0f20cd)'
   where cliente_id = c and id in ('2b79888e-dc1a-402f-bcf4-7eb98bbe6a33', 'ca035ae1-bc5f-40e6-a488-8d9768195fc0',
                                   'a608f111-771d-4b46-8f51-ffb89f3df471', '5b259dba-7c42-4f8f-9c57-ad78bcd650ff');
  get diagnostics n = row_count; if n <> 4 then raise exception 'CASO 1 cancelar modulo: % linhas', n; end if;

  update public.financiamento_parcelas
     set lancamento_id = '8b0f20cd-939c-419d-9086-2324f6a20159', lancamento_juros_id = '4596acbc-20ff-459a-9485-8daa899cf01b'
   where id = 'a04a1aeb-45bf-4101-851b-4b74a0090b7c';
  get diagnostics n = row_count; if n <> 1 then raise exception 'CASO 1 parcela: % linhas', n; end if;

  -- -- CASO 2: Sicredi ------------------------------------------------------
  update public.financeiro_lancamentos_v2
     set cancelado = true, cancelado_em = now(), cancelado_por = gab,
         cancelado_motivo = 'Cancelado 22/09/2026 (NJ-JUROS-DUPLICADOS-01): duplicado: juros contratual do modulo; vale o cobrado pelo banco (85a3162f)'
   where cliente_id = c and id = '8a28cee2-7063-4291-83ae-7c00d419b1dc';
  get diagnostics n = row_count; if n <> 1 then raise exception 'CASO 2 cancelar: % linhas', n; end if;

  update public.financeiro_lancamentos_v2 set financiamento_id = 'beaa81ec-cd9c-45f9-bfe9-c062fac68f01'
   where cliente_id = c and id = '85a3162f-89af-419b-a9c0-27e1ec6c4cce';
  get diagnostics n = row_count; if n <> 1 then raise exception 'CASO 2 ligar: % linhas', n; end if;

  update public.financiamento_parcelas set lancamento_juros_id = '85a3162f-89af-419b-a9c0-27e1ec6c4cce'
   where id = 'ca3b211c-2c2c-4780-88f4-c425a111fc23';
  get diagnostics n = row_count; if n <> 1 then raise exception 'CASO 2 parcela: % linhas', n; end if;

  -- -- CASO 3: CPR 2019 -----------------------------------------------------
  update public.financeiro_lancamentos_v2
     set cancelado = true, cancelado_em = now(), cancelado_por = gab,
         cancelado_motivo = 'Cancelado 22/09/2026 (NJ-JUROS-DUPLICADOS-01): duplicado de 9636ba80 (contrato importado em dobro; fica o do credor principal)'
   where cliente_id = c and id in ('1c2d7f58-8257-4052-a86b-3be25f5c112a', '90939ace-e963-413f-b7ae-624b0c811277');
  get diagnostics n = row_count; if n <> 2 then raise exception 'CASO 3: % linhas', n; end if;

  -- -- CASO 5: N33, a parcela do que fica aponta a planilha de 21/11 --------
  update public.financiamento_parcelas
     set lancamento_id = 'aed48c4c-8518-45ef-91e0-9010060b8b39', lancamento_juros_id = 'b768e3a5-30f4-4f16-bd88-a8ca107b259a'
   where id = 'b7d15b36-877c-4ee4-a69d-6fd1e42b8fd5';
  get diagnostics n = row_count; if n <> 1 then raise exception 'CASO 5 parcela: % linhas', n; end if;

  -- -- CONTRATOS (casos 1, 3, 4 e 5) ----------------------------------------
  update public.financiamentos f
     set status = 'cancelado', updated_at = now(),
         observacao = concat_ws(' | ', nullif(btrim(f.observacao), ''), 'Cancelado 22/09/2026 (NJ-JUROS-DUPLICADOS-01): ' || m.motivo)
    from (values
      ('308e061c-2ada-458b-8b76-162df136f9ed'::uuid, 'duplicado de bc489a77, importacao em dobro 20/04/2026; fica o do credor principal'),
      ('046273b4-fb57-4964-8bf7-dec9b190bc3d',       'duplicado de 9636ba80, importacao em dobro 20/04/2026; fica o do credor principal'),
      ('132abffb-3416-48f9-9285-0304715d128e',       'duplicado de df0369c6, importacao em dobro 20/04/2026; fica o do credor principal. '
                                                     || 'O "a verdade vive em 21/11" de 03/09 migra para df0369c6, cuja parcela passa a apontar aed48c4c / b768e3a5'),
      ('1efa4bbc-7f77-434a-944f-ed817ed00fa2',       'duplicado de 3c5e0245, cadastro vazio')
    ) m(id, motivo)
   where f.id = m.id and f.cliente_id = c;
  get diagnostics n = row_count; if n <> 4 then raise exception 'CONTRATOS: % linhas', n; end if;

  update public.financiamento_parcelas set status = 'cancelado'
   where financiamento_id = '1efa4bbc-7f77-434a-944f-ed817ed00fa2';
  get diagnostics n = row_count; if n <> 2 then raise exception 'CASO 4 parcelas: % linhas', n; end if;

  -- -- GUARDAS DE SAIDA -----------------------------------------------------
  select count(*) into n from (
    select coalesce(l.financiamento_id, pa.financiamento_id) fin, l.data_pagamento, l.valor
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id and p.bloco_dre = 'juros'
      left join public.financiamento_parcelas pa on pa.lancamento_juros_id = l.id
      join public.financiamentos f on f.id = coalesce(l.financiamento_id, pa.financiamento_id) and f.status <> 'cancelado'
     where l.cliente_id = c and not coalesce(l.cancelado, false) and l.data_pagamento is not null
     group by 1, 2, 3 having count(distinct l.id) > 1) z;
  if n <> 0 then raise exception 'GUARDA juros em dobro: % contrato+data+valor', n; end if;

  select count(*) into n from (
    select f.descricao, f.numero_contrato, lower(btrim(fo.nome)), f.valor_total
      from public.financiamentos f left join public.financeiro_fornecedores fo on fo.id = f.credor_id
     where f.cliente_id = c and f.status <> 'cancelado'
     group by 1, 2, 3, 4 having count(*) > 1) z;
  if n <> 0 then raise exception 'GUARDA contratos gemeos: % assinaturas', n; end if;

  pec_d := public.fn_dre_pecuaria(c, '2025-07', '2026-06');
  juros_d := (pec_d->'total'->>'juros')::numeric;
  if juros_d is null or juros_d not between 1470000 and 1475000 then
    raise exception 'GUARDA DRE: juros jul/25-jun/26 = %', juros_d;
  end if;

  select round(sum(l.valor), 2) into am_d
    from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.cliente_id = c and not coalesce(l.cancelado, false) and l.cenario = 'realizado' and p.ordem_exibicao in (16010, 16020);
  if am_d - am_a <> -2735779.41 then
    raise exception 'GUARDA amortizacao: variou % (esperado -2735779.41)', am_d - am_a;
  end if;

  raise notice 'NJ-JUROS-DUPLICADOS-01: juros % | amortizacoes % -> %', juros_d, am_a, am_d;
  --ROLLBACK-TESTE
end $mig$;
