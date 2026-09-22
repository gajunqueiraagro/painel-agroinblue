-- ITR-POR-FAZENDA-01 (22/09/2026) - o ITR sai do administrativo e vai para a fazenda do imovel
--
-- Migration de DADO, 5 clientes. Nenhuma RPC, nenhuma tela.
--
-- O DEFEITO: 145 lancamentos no plano 19040 "ITR" (grupo Tributos, escopo administrativo), todos na
-- fazenda Administrativo, R$ 1.034.167,16 de 2017 a 2026 - inclui honorarios de declaracao,
-- certidao e multa, que ficam junto. ITR e imposto do imovel: pertence a fazenda que o paga. No
-- administrativo ele nao entrava em DRE nenhuma (Tributos esta fora do rateio e sem bloco).
--
-- REGRA: o plano muda de atividade junto com a fazenda. Fazenda de pecuaria -> 6090 Taxas e Impostos
-- Fixos Pecuaria; Bom Retiro (Santa Rita) -> 20220 Taxas e Impostos Fixos SILVICULTURA, porque e
-- eucalipto arrendado (venda de eucalipto de 4,02 mi la'; a pecuaria foi de um periodo antigo). O
-- trigger resolve_classificacao_from_plano recoloca o escopo pelo plano novo.
--
-- DE/PARA POR IMOVEL CITADO NA DESCRICAO (Gabriel, 22/09/2026):
--   Agnaldo    "Campeiro e SM" / "SM/CAMPEIRO" (5, 62.172,80) -> DESDOBRADO 50/50: metade em
--              17060 Dividendos Faz. Campeiro (Administrativo), metade em 6090 + Sta. Maria
--              "SM" (inclui "SM e ST" e o "ITR" de 2020 sem imovel)  -> 6090 + Sta. Maria
--              "ST" (inclui os honorarios da declaracao ST)          -> 6090 + Sta. Tereza
--   NJ         todos (47 sem imovel + 2 N.S. Aparecida)             -> 6090 + Pureza
--   RRCC       todos (Iganne + 1 sem imovel)                        -> 6090 + Ursa Maior
--   Santa Rita "FSR" e os 3 "ITR - Verificar"                       -> 6090 + Sta. Rita
--              "FBR"                                                -> 20220 + Bom Retiro
--   Vera       "BG" -> 6090 + Baia Grande; "3M" e "Ajuste ITR 2023"  -> 6090 + 3 Muchachas
--
-- O DESDOBRAMENTO: o sistema so' tem desdobramento pela Mesa (fn_classificacao_split_substituir,
-- que exige sessao e staging), entao aqui e o par: o original e CANCELADO com motivo e nascem dois
-- novos com a mesma data, conta, favorecido e descricao, origem 'manual', observacao apontando o
-- original. A metade do Campeiro e' round(valor/2, 2) e a da Sta. Maria e' o resto, entao cada
-- par soma exatamente o original. Nenhum dos 5 esta conciliado (medido).
--
-- ⚠ tem_pecuaria da Bom Retiro NAO e tocada (esta false). Nao existe regra automatica sobre ela:
--   nenhuma funcao escreve na coluna, e o unico trigger de `fazendas` e' on_fazenda_created.
--
-- Carimbo nos movidos: "ITR reclassificado em 22/09/2026 (ITR-POR-FAZENDA-01): era plano ITR na
-- fazenda Administrativo".
--
-- GUARDA: 0 lancamento ativo no 19040; os 10 novos somam 62.172,80 e cada par fecha no original;
-- movidos + novos == 1.034.167,16; cada movido esta no plano e na fazenda do de/para.

begin;

do $mig$
declare
  gab constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  n int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  create temp table _it_faz on commit drop as select * from (values
    ('AG_ADM', 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2'::uuid, '68f41ea0-3708-4423-b4b4-e42a3733c87a'::uuid, 'Administrativo'),
    ('AG_SM',  'a2d41cda-eb1e-4527-a6cf-a1b9663339e2',       '2ff5d506-6bba-4cd2-9a23-3d5886e01d38',       'Faz. Sta. Maria'),
    ('AG_ST',  'a2d41cda-eb1e-4527-a6cf-a1b9663339e2',       'ff90dd6e-58cd-4c3f-b7b3-25cc22b191c5',       'Faz. Sta. Tereza'),
    ('NJ_PUR', 'f2d67cd4-24d0-456f-a079-a3281dcce7fd',       'd3396cdd-7c95-4d41-bcc5-577c0563ce87',       'Faz. Pureza'),
    ('RR_UM',  '537661af-a934-4c66-b138-f8dbc378a00f',       '69e8e39b-7781-435e-8d9d-d4c2f330a0d8',       'Faz. Ursa Maior'),
    ('SR_SR',  '77d37bbf-a440-4fca-bf1a-eac60cf91bc4',       '161b905e-f14c-4a9b-965f-dd3c8f82dc74',       'Faz. Sta. Rita'),
    ('SR_BR',  '77d37bbf-a440-4fca-bf1a-eac60cf91bc4',       '682419f9-8b70-4ae4-8aa6-5320ef40db97',       'Faz. Bom Retiro'),
    ('VE_BG',  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',       'c01a1437-bc8f-458c-8c6c-d68947450cf7',       'Faz Baia Grande'),
    ('VE_3M',  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',       'ac8a596c-e458-425f-9779-3b528ce61072',       'Faz. 3 Muchachas')
  ) v(cod, cliente, id, nome);
  select count(*) into n from _it_faz z join public.fazendas f on f.id = z.id and f.cliente_id = z.cliente and f.nome = z.nome;
  if n <> 9 then raise exception 'fazendas nao conferem: % de 9', n; end if;

  create temp table _it_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo and p.ordem_exibicao in (6090, 17060, 19040, 20220);
  if (select count(*) from _it_plano) <> 4
     or not exists (select 1 from _it_plano where o = 6090  and esc = 'pecuaria')
     or not exists (select 1 from _it_plano where o = 20220 and esc = 'silvicultura')
     or not exists (select 1 from _it_plano where o = 17060 and esc = 'administrativo')
     or not exists (select 1 from _it_plano where o = 19040 and esc = 'administrativo') then
    raise exception 'planos de destino nao conferem';
  end if;

  -- -- UNIVERSO E DE/PARA -----------------------------------------------------
  create temp table _it_mapa on commit drop as
  with u as (
    select l.id, l.cliente_id, l.valor, coalesce(l.descricao, '') d, l.fazenda_id
      from public.financeiro_lancamentos_v2 l
     where l.plano_conta_id = (select id from _it_plano where o = 19040)
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado')
  select u.*,
    case
      when u.cliente_id = 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2' and u.d ~* 'campeiro'          then 'SPLIT'
      when u.cliente_id = 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2' and (u.d ~ '\mSM\M' or u.d ~* 'santa maria') then 'AG_SM'
      when u.cliente_id = 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2' and u.d ~ '\mST\M'            then 'AG_ST'
      when u.cliente_id = 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2'                               then 'AG_SM'
      when u.cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'                               then 'NJ_PUR'
      when u.cliente_id = '537661af-a934-4c66-b138-f8dbc378a00f'                               then 'RR_UM'
      when u.cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4' and u.d ~ '\mFBR\M'           then 'SR_BR'
      when u.cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'                               then 'SR_SR'
      when u.cliente_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' and u.d ~ '\mBG\M'            then 'VE_BG'
      when u.cliente_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'                               then 'VE_3M'
    end destino
  from u;

  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into n, v_s from _it_mapa;
  if n <> 145 or v_s <> 1034167.16 then raise exception 'universo ITR: % / % (esperado 145 / 1034167.16)', n, v_s; end if;
  if exists (select 1 from _it_mapa where destino is null) then raise exception 'ITR sem destino'; end if;
  select count(*) into n from _it_mapa m
   where m.fazenda_id not in (select f.id from public.fazendas f where f.nome = 'Administrativo');
  if n > 0 then raise exception '% ITR fora da fazenda Administrativo', n; end if;
  select count(*), round(sum(valor)::numeric, 2) into n, v_s from _it_mapa where destino = 'SPLIT';
  if n <> 5 or v_s <> 62172.80 then raise exception 'desdobramento: % / % (esperado 5 / 62172.80)', n, v_s; end if;
  if exists (select 1 from _it_mapa m join public.conciliacao_bancaria_itens c on c.lancamento_id = m.id and c.desfeito_em is null where m.destino = 'SPLIT') then
    raise exception 'lancamento a desdobrar esta conciliado';
  end if;

  -- -- MOVIDOS: plano e fazenda do de/para (todos mudam de fazenda) --------------
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = (select id from _it_plano where o = case when m.destino = 'SR_BR' then 20220 else 6090 end),
         fazenda_id     = z.id,
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'ITR reclassificado em 22/09/2026 (ITR-POR-FAZENDA-01): era plano ITR na fazenda Administrativo')
    from _it_mapa m join _it_faz z on z.cod = m.destino
   where m.id = l.id and m.destino <> 'SPLIT';
  get diagnostics n = row_count;
  if n <> 140 then raise exception 'movidos: % de 140', n; end if;

  -- -- DESDOBRADOS: dois novos por original, depois o original e cancelado --------
  insert into public.financeiro_lancamentos_v2
    (cliente_id, fazenda_id, data_competencia, data_pagamento, data_vencimento, valor, tipo_operacao, sinal,
     status_transacao, cenario, conta_bancaria_id, favorecido_id, plano_conta_id, descricao, observacao,
     origem_lancamento, created_by)
  select l.cliente_id,
         case h.metade when 'campeiro' then (select id from _it_faz where cod = 'AG_ADM') else (select id from _it_faz where cod = 'AG_SM') end,
         l.data_competencia, l.data_pagamento, l.data_vencimento,
         case h.metade when 'campeiro' then round(l.valor::numeric / 2, 2) else l.valor - round(l.valor::numeric / 2, 2) end,
         l.tipo_operacao, l.sinal, l.status_transacao, l.cenario, l.conta_bancaria_id, l.favorecido_id,
         (select id from _it_plano where o = case h.metade when 'campeiro' then 17060 else 6090 end),
         l.descricao,
         'Desdobrado em 22/09/2026 (ITR-POR-FAZENDA-01) do lancamento ' || l.id::text || ', ITR de ' || l.valor::text
           || ' dividido 50/50: ' || case h.metade when 'campeiro' then 'metade Faz. Campeiro (dividendo)' else 'metade Faz. Sta. Maria' end,
         'manual', gab
    from public.financeiro_lancamentos_v2 l
    join _it_mapa m on m.id = l.id and m.destino = 'SPLIT'
    cross join (values ('campeiro'), ('sm')) h(metade);
  get diagnostics n = row_count;
  if n <> 10 then raise exception 'novos do desdobramento: % de 10', n; end if;

  update public.financeiro_lancamentos_v2 l
     set cancelado = true, cancelado_em = now(), cancelado_por = gab,
         cancelado_motivo = 'Desdobrado em ITR-POR-FAZENDA-01 (22/09/2026): 50% Dividendos Faz. Campeiro + 50% ITR da Faz. Sta. Maria'
    from _it_mapa m
   where m.id = l.id and m.destino = 'SPLIT';
  get diagnostics n = row_count;
  if n <> 5 then raise exception 'originais cancelados: % de 5', n; end if;

  -- -- GUARDA DE SAIDA --------------------------------------------------------
  select count(*) into n from public.financeiro_lancamentos_v2
   where plano_conta_id = (select id from _it_plano where o = 19040) and coalesce(cancelado, false) = false;
  if n > 0 then raise exception '% lancamento(s) ativo(s) ainda no plano ITR', n; end if;

  select count(*), round(sum(valor)::numeric, 2) into n, v_s from public.financeiro_lancamentos_v2
   where observacao like 'Desdobrado em 22/09/2026 (ITR-POR-FAZENDA-01)%' and coalesce(cancelado, false) = false;
  if n <> 10 or v_s <> 62172.80 then raise exception 'novos: % / % (esperado 10 / 62172.80)', n, v_s; end if;

  select count(*) into n from _it_mapa m
   where m.destino = 'SPLIT'
     and (select round(sum(x.valor)::numeric, 2) from public.financeiro_lancamentos_v2 x
           where x.observacao like '%do lancamento ' || m.id::text || ',%' and coalesce(x.cancelado, false) = false)
         is distinct from round(m.valor::numeric, 2);
  if n > 0 then raise exception '% par(es) do desdobramento nao fecham no original', n; end if;

  select count(*) into n from public.financeiro_lancamentos_v2 l
    join _it_mapa m on m.id = l.id and m.destino <> 'SPLIT'
    join _it_faz z on z.cod = m.destino
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.fazenda_id <> z.id
      or p.ordem_exibicao <> case when m.destino = 'SR_BR' then 20220 else 6090 end
      or l.escopo_negocio is distinct from p.escopo_negocio
      or l.valor is distinct from m.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception '% movido(s) fora do destino', n; end if;

  select round(sum(l.valor)::numeric, 2) into v_s from public.financeiro_lancamentos_v2 l
   where coalesce(l.cancelado, false) = false
     and (l.id in (select id from _it_mapa where destino <> 'SPLIT')
          or l.observacao like 'Desdobrado em 22/09/2026 (ITR-POR-FAZENDA-01)%');
  if v_s <> 1034167.16 then raise exception 'o dinheiro mudou: % (esperado 1034167.16)', v_s; end if;

  raise notice 'ITR-POR-FAZENDA-01 ok: 140 movidos, 5 desdobrados em 10, 0 no plano ITR, R$ 1.034.167,16 conservados.';
end $mig$;

commit;
