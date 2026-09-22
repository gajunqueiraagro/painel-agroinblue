-- LEGADO-ADM-02 (22/09/2026) - legado da fazenda Administrativo do Agnaldo Cedenho sai do custo de pecuaria
--
-- Migration de DADO, so do cliente Agnaldo Cedenho (a2d41cda). Nenhuma RPC, nenhuma tela.
-- Mesmo mecanismo do NJ-LEGADO-ADM-01 (20261027125600): so troca plano_conta_id - o trigger
-- resolve_classificacao_from_plano zera a safra, fixa a fazenda Administrativo e copia as colunas
-- do plano novo - e, para quem vai para fazenda produtiva, fazenda_id num UPDATE SEPARADO (evita
-- recalcular hash de importacao nas linhas que nao mudam de fazenda).
--
-- Universo (medido em 22/09/2026 depois da ultima edicao manual, 10:55:25, com as edicoes congeladas): 2275 lancamentos,
-- R$ 3148950.74, de plano pecuaria/agricultura na fazenda Administrativo, fora juros,
-- amortizacao e captacao (que a regra de 22/09 permite no administrativo da atividade).
--
-- REGRAS (a primeira que casa vence):
--   A_valmet      id in ('eac00d5e-6fe6-4357-8f0c-db86974163f6', '0971a429-1257-4dad-bad -> plano mantido, ST
--   A_rescisao    o = 6190                                                               -> plano mantido, SM
--   A_nutricao    o = 8045                                                               -> plano mantido, ST
--   A_veiculos    o = 9030                                                               -> plano 22030, ADM
--   A_venda_maq   o = 1040                                                               -> plano mantido, ST
--   A_agroinblue  o = 6080 and fav ilike '%Agroinblue%'                                  -> plano 21130, ADM
--   B_tributos    o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or -> plano 17150, ADM
--   B_pessoal     o in (6200, 6060) and fav ilike '%Agnaldo%Cedenho%' and (descricao ili -> plano 17030, ADM
--   C_salarios    o = 6200                                                               -> plano 21130, ADM
--   C_beneficios  o = 6180                                                               -> plano 21110, ADM
--   C_rescisoes   o = 6190                                                               -> plano 21120, ADM
--   C_viagens     o = 6080                                                               -> plano 21080, ADM
--   C_combust     o = 6210                                                               -> plano 21140, ADM
--   C_manut       o = 6220                                                               -> plano 21150, ADM
--   C_seguro      o = 6230                                                               -> plano 21160, ADM
--   C_financ      o = 6040                                                               -> plano 21090, ADM
--   C_agua        o = 6020 and (descricao ilike '%_gua%' or descricao ilike '%esgoto%')  -> plano 21040, ADM
--   C_comunic     o = 6020                                                               -> plano 21020, ADM
--   C_outras      o = 6060                                                               -> plano 21060, ADM
--   C_taxas       o = 6090                                                               -> plano 21100, ADM
--   D_fazenda     o in (6100, 6110, 6120, 6130, 6140, 6150, 6160, 6170, 6240, 6250, 6260 -> plano mantido, ST
--   E: recorrencias 51da5a31 -> 21020, 8bdb5361 -> 21130 (texto do subcentro; safra zerada)
--
-- Carimbo em `observacao` (append ' | '): "Reclassificado em 22/09/2026 (LEGADO-ADM-02): era <subcentro
-- origem> na fazenda Administrativo"; C_outras que e fatura de cartao ganha ' . fatura de cartao
-- fechada, nao aberta por item' (o ponto e chr(183)).
-- Em 3 lotes, idempotente pelo carimbo; guarda de lote em cada um e guarda global no L3.

-- ============================================================================
-- LOTE L1 - A + B + E (excecoes, pessoa fisica, recorrencias)
-- ============================================================================
do $lote$
declare
  c   constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  adm constant uuid := '68f41ea0-3708-4423-b4b4-e42a3733c87a';
  v_regras constant text[] := array['A_valmet', 'A_rescisao', 'A_nutricao', 'A_veiculos', 'A_venda_maq', 'A_agroinblue', 'B_tributos', 'B_pessoal'];
  n int; v_col int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  create temp table _lg_faz on commit drop as select * from (values
      ('ADM', '68f41ea0-3708-4423-b4b4-e42a3733c87a'::uuid),
      ('SM', '2ff5d506-6bba-4cd2-9a23-3d5886e01d38'::uuid),
      ('ST', 'ff90dd6e-58cd-4c3f-b7b3-25cc22b191c5'::uuid)) v(cod, id);
  select count(*) into n from _lg_faz z join public.fazendas f on f.id = z.id and f.cliente_id = c
   where (z.cod = 'ADM') = (f.nome = 'Administrativo');
  if n <> 3 then raise exception 'L1: fazendas nao conferem (% de 3)', n; end if;

  create temp table _lg_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo and p.ordem_exibicao in (17030, 17150, 21020, 21040, 21060, 21080, 21090, 21100, 21110, 21120, 21130, 21140, 21150, 21160, 22030);
  select count(*) into n from (select o from _lg_plano group by o having count(*) = 1) z;
  if n <> 15 or (select count(*) from _lg_plano) <> 15 then raise exception 'L1: planos de destino: % de 15', n; end if;
  if exists (select 1 from _lg_plano where esc <> 'administrativo') then raise exception 'L1: plano de destino fora do escopo administrativo'; end if;

  -- -- CLASSIFICA O UNIVERSO INTEIRO -------------------------------------------
  create temp table _lg_mapa on commit drop as
  with u as (
    select l.id, l.valor, l.plano_conta_id plano_origem, coalesce(l.descricao, '') descricao,
           coalesce(l.importado_duplicado, false) dup_antes, l.hash_importacao hash_antes,
           p.ordem_exibicao o, p.subcentro sub, coalesce(f.nome_favorecido, f.nome, '') fav
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id
      left join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = c and l.fazenda_id = adm and p.escopo_negocio in ('pecuaria', 'agricultura')
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
       and p.ordem_exibicao not in (7010, 12010, 20310, 16010, 16020, 16030, 4030, 4040, 4050)
       and coalesce(l.observacao, '') not like '%LEGADO-ADM-02%'
  ), cl as (
    select u.*, case
      when id in ('eac00d5e-6fe6-4357-8f0c-db86974163f6', '0971a429-1257-4dad-bad2-d94b19eef77e') then 'A_valmet'
      when o = 6190 then 'A_rescisao'
      when o = 8045 then 'A_nutricao'
      when o = 9030 then 'A_veiculos'
      when o = 1040 then 'A_venda_maq'
      when o = 6080 and fav ilike '%Agroinblue%' then 'A_agroinblue'
      when o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or descricao ilike '%DARF IR%' or descricao ilike '%ITCD%' or descricao ilike '%bolsa%' or descricao ilike '%doa__o IR%') then 'B_tributos'
      when o in (6200, 6060) and fav ilike '%Agnaldo%Cedenho%' and (descricao ilike '%labore%' or descricao ilike '%pessoal%') then 'B_pessoal'
      when o = 6200 then 'C_salarios'
      when o = 6180 then 'C_beneficios'
      when o = 6190 then 'C_rescisoes'
      when o = 6080 then 'C_viagens'
      when o = 6210 then 'C_combust'
      when o = 6220 then 'C_manut'
      when o = 6230 then 'C_seguro'
      when o = 6040 then 'C_financ'
      when o = 6020 and (descricao ilike '%_gua%' or descricao ilike '%esgoto%') then 'C_agua'
      when o = 6020 then 'C_comunic'
      when o = 6060 then 'C_outras'
      when o = 6090 then 'C_taxas'
      when o in (6100, 6110, 6120, 6130, 6140, 6150, 6160, 6170, 6240, 6250, 6260) or (o between 8000 and 8999 or o between 9000 and 9999 or o between 1000 and 1999 or o between 5020 and 5039 or o between 15000 and 15999) then 'D_fazenda'
    end regra from u)
  select cl.*,
         case cl.regra
           when 'A_valmet' then null
           when 'A_rescisao' then null
           when 'A_nutricao' then null
           when 'A_veiculos' then 22030
           when 'A_venda_maq' then null
           when 'A_agroinblue' then 21130
           when 'B_tributos' then 17150
           when 'B_pessoal' then 17030
           when 'C_salarios' then 21130
           when 'C_beneficios' then 21110
           when 'C_rescisoes' then 21120
           when 'C_viagens' then 21080
           when 'C_combust' then 21140
           when 'C_manut' then 21150
           when 'C_seguro' then 21160
           when 'C_financ' then 21090
           when 'C_agua' then 21040
           when 'C_comunic' then 21020
           when 'C_outras' then 21060
           when 'C_taxas' then 21100
           when 'D_fazenda' then null
         end o_destino,
         case cl.regra
           when 'A_valmet' then 'ST'
           when 'A_rescisao' then 'SM'
           when 'A_nutricao' then 'ST'
           when 'A_veiculos' then 'ADM'
           when 'A_venda_maq' then 'ST'
           when 'A_agroinblue' then 'ADM'
           when 'B_tributos' then 'ADM'
           when 'B_pessoal' then 'ADM'
           when 'C_salarios' then 'ADM'
           when 'C_beneficios' then 'ADM'
           when 'C_rescisoes' then 'ADM'
           when 'C_viagens' then 'ADM'
           when 'C_combust' then 'ADM'
           when 'C_manut' then 'ADM'
           when 'C_seguro' then 'ADM'
           when 'C_financ' then 'ADM'
           when 'C_agua' then 'ADM'
           when 'C_comunic' then 'ADM'
           when 'C_outras' then 'ADM'
           when 'C_taxas' then 'ADM'
           when 'D_fazenda' then 'ST'
         end faz_cod,
         (cl.regra = 'C_outras' and cl.descricao ilike '%cart_o%') cartao
    from cl;
  select count(*) into n from _lg_mapa where regra is null;
  if n > 0 then raise exception 'L1: % lancamento(s) do universo sem regra', n; end if;

  create temp table _lg_lote on commit drop as
    select m.*, pd.id plano_destino, pd.sub sub_destino, fz.id faz_destino
      from _lg_mapa m left join _lg_plano pd on pd.o = m.o_destino join _lg_faz fz on fz.cod = m.faz_cod
     where m.regra = any(v_regras);
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _lg_lote;
  if v_col = 0 then raise exception 'L1: nada a fazer (lote vazio)'; end if;

  -- -- E: RECORRENCIAS (financeiro_recorrencias nao tem plano: troca o texto do subcentro) ----
  create temp table _lg_rec on commit drop as select * from (values
      ('51da5a31-6795-42e0-aa03-12b1cedd8528'::uuid, 21020),
      ('8bdb5361-475f-40bb-a00a-fb988df93400', 21130)) e(id, o);
  select count(*) into n from public.financeiro_recorrencias r join _lg_rec e on e.id = r.id
   where r.cliente_id = c and r.fazenda_id = adm and r.ativo
     and exists (select 1 from public.financeiro_plano_contas p where p.cliente_id is null
                   and p.escopo_negocio in ('pecuaria', 'agricultura') and p.subcentro = r.subcentro);
  if n <> 2 then raise exception 'L1: recorrencias: % de 2 no estado esperado', n; end if;
  update public.financeiro_recorrencias r
     set subcentro = pd.sub, safra_id = null, updated_at = now(),
         observacao = concat_ws(' | ', nullif(btrim(r.observacao), ''),
           'Reclassificado em 22/09/2026 (LEGADO-ADM-02): era ' || r.subcentro || ' na fazenda Administrativo')
    from _lg_rec e join _lg_plano pd on pd.o = e.o
   where r.id = e.id;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'L1: recorrencias atualizadas: % de 2', n; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  -- fazenda_id so entra no SET de quem muda de fazenda: UPDATE OF fazenda_id dispara o
  -- recalculo de hash_importacao e a checagem de duplicidade nas linhas que ficam.
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (LEGADO-ADM-02): era ' || t.sub || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _lg_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'L1: atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = t.faz_destino
    from _lg_lote t where t.id = l.id and t.faz_cod <> 'ADM';
  get diagnostics n = row_count;
  if n <> (select count(*) from _lg_lote where faz_cod <> 'ADM') then raise exception 'L1: fazenda produtiva em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _lg_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from t.faz_destino
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%LEGADO-ADM-02%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception 'L1: % lancamento(s) fora do destino', n; end if;

  raise notice 'L1 ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;

-- ============================================================================
-- LOTE L2 - C (administrativo)
-- ============================================================================
do $lote$
declare
  c   constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  adm constant uuid := '68f41ea0-3708-4423-b4b4-e42a3733c87a';
  v_regras constant text[] := array['C_salarios', 'C_beneficios', 'C_rescisoes', 'C_viagens', 'C_combust', 'C_manut', 'C_seguro', 'C_financ', 'C_agua', 'C_comunic', 'C_outras', 'C_taxas'];
  n int; v_col int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  create temp table _lg_faz on commit drop as select * from (values
      ('ADM', '68f41ea0-3708-4423-b4b4-e42a3733c87a'::uuid),
      ('SM', '2ff5d506-6bba-4cd2-9a23-3d5886e01d38'::uuid),
      ('ST', 'ff90dd6e-58cd-4c3f-b7b3-25cc22b191c5'::uuid)) v(cod, id);
  select count(*) into n from _lg_faz z join public.fazendas f on f.id = z.id and f.cliente_id = c
   where (z.cod = 'ADM') = (f.nome = 'Administrativo');
  if n <> 3 then raise exception 'L2: fazendas nao conferem (% de 3)', n; end if;

  create temp table _lg_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo and p.ordem_exibicao in (17030, 17150, 21020, 21040, 21060, 21080, 21090, 21100, 21110, 21120, 21130, 21140, 21150, 21160, 22030);
  select count(*) into n from (select o from _lg_plano group by o having count(*) = 1) z;
  if n <> 15 or (select count(*) from _lg_plano) <> 15 then raise exception 'L2: planos de destino: % de 15', n; end if;
  if exists (select 1 from _lg_plano where esc <> 'administrativo') then raise exception 'L2: plano de destino fora do escopo administrativo'; end if;

  -- -- CLASSIFICA O UNIVERSO INTEIRO -------------------------------------------
  create temp table _lg_mapa on commit drop as
  with u as (
    select l.id, l.valor, l.plano_conta_id plano_origem, coalesce(l.descricao, '') descricao,
           coalesce(l.importado_duplicado, false) dup_antes, l.hash_importacao hash_antes,
           p.ordem_exibicao o, p.subcentro sub, coalesce(f.nome_favorecido, f.nome, '') fav
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id
      left join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = c and l.fazenda_id = adm and p.escopo_negocio in ('pecuaria', 'agricultura')
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
       and p.ordem_exibicao not in (7010, 12010, 20310, 16010, 16020, 16030, 4030, 4040, 4050)
       and coalesce(l.observacao, '') not like '%LEGADO-ADM-02%'
  ), cl as (
    select u.*, case
      when id in ('eac00d5e-6fe6-4357-8f0c-db86974163f6', '0971a429-1257-4dad-bad2-d94b19eef77e') then 'A_valmet'
      when o = 6190 then 'A_rescisao'
      when o = 8045 then 'A_nutricao'
      when o = 9030 then 'A_veiculos'
      when o = 1040 then 'A_venda_maq'
      when o = 6080 and fav ilike '%Agroinblue%' then 'A_agroinblue'
      when o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or descricao ilike '%DARF IR%' or descricao ilike '%ITCD%' or descricao ilike '%bolsa%' or descricao ilike '%doa__o IR%') then 'B_tributos'
      when o in (6200, 6060) and fav ilike '%Agnaldo%Cedenho%' and (descricao ilike '%labore%' or descricao ilike '%pessoal%') then 'B_pessoal'
      when o = 6200 then 'C_salarios'
      when o = 6180 then 'C_beneficios'
      when o = 6190 then 'C_rescisoes'
      when o = 6080 then 'C_viagens'
      when o = 6210 then 'C_combust'
      when o = 6220 then 'C_manut'
      when o = 6230 then 'C_seguro'
      when o = 6040 then 'C_financ'
      when o = 6020 and (descricao ilike '%_gua%' or descricao ilike '%esgoto%') then 'C_agua'
      when o = 6020 then 'C_comunic'
      when o = 6060 then 'C_outras'
      when o = 6090 then 'C_taxas'
      when o in (6100, 6110, 6120, 6130, 6140, 6150, 6160, 6170, 6240, 6250, 6260) or (o between 8000 and 8999 or o between 9000 and 9999 or o between 1000 and 1999 or o between 5020 and 5039 or o between 15000 and 15999) then 'D_fazenda'
    end regra from u)
  select cl.*,
         case cl.regra
           when 'A_valmet' then null
           when 'A_rescisao' then null
           when 'A_nutricao' then null
           when 'A_veiculos' then 22030
           when 'A_venda_maq' then null
           when 'A_agroinblue' then 21130
           when 'B_tributos' then 17150
           when 'B_pessoal' then 17030
           when 'C_salarios' then 21130
           when 'C_beneficios' then 21110
           when 'C_rescisoes' then 21120
           when 'C_viagens' then 21080
           when 'C_combust' then 21140
           when 'C_manut' then 21150
           when 'C_seguro' then 21160
           when 'C_financ' then 21090
           when 'C_agua' then 21040
           when 'C_comunic' then 21020
           when 'C_outras' then 21060
           when 'C_taxas' then 21100
           when 'D_fazenda' then null
         end o_destino,
         case cl.regra
           when 'A_valmet' then 'ST'
           when 'A_rescisao' then 'SM'
           when 'A_nutricao' then 'ST'
           when 'A_veiculos' then 'ADM'
           when 'A_venda_maq' then 'ST'
           when 'A_agroinblue' then 'ADM'
           when 'B_tributos' then 'ADM'
           when 'B_pessoal' then 'ADM'
           when 'C_salarios' then 'ADM'
           when 'C_beneficios' then 'ADM'
           when 'C_rescisoes' then 'ADM'
           when 'C_viagens' then 'ADM'
           when 'C_combust' then 'ADM'
           when 'C_manut' then 'ADM'
           when 'C_seguro' then 'ADM'
           when 'C_financ' then 'ADM'
           when 'C_agua' then 'ADM'
           when 'C_comunic' then 'ADM'
           when 'C_outras' then 'ADM'
           when 'C_taxas' then 'ADM'
           when 'D_fazenda' then 'ST'
         end faz_cod,
         (cl.regra = 'C_outras' and cl.descricao ilike '%cart_o%') cartao
    from cl;
  select count(*) into n from _lg_mapa where regra is null;
  if n > 0 then raise exception 'L2: % lancamento(s) do universo sem regra', n; end if;

  create temp table _lg_lote on commit drop as
    select m.*, pd.id plano_destino, pd.sub sub_destino, fz.id faz_destino
      from _lg_mapa m left join _lg_plano pd on pd.o = m.o_destino join _lg_faz fz on fz.cod = m.faz_cod
     where m.regra = any(v_regras);
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _lg_lote;
  if v_col = 0 then raise exception 'L2: nada a fazer (lote vazio)'; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  -- fazenda_id so entra no SET de quem muda de fazenda: UPDATE OF fazenda_id dispara o
  -- recalculo de hash_importacao e a checagem de duplicidade nas linhas que ficam.
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (LEGADO-ADM-02): era ' || t.sub || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _lg_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'L2: atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = t.faz_destino
    from _lg_lote t where t.id = l.id and t.faz_cod <> 'ADM';
  get diagnostics n = row_count;
  if n <> (select count(*) from _lg_lote where faz_cod <> 'ADM') then raise exception 'L2: fazenda produtiva em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _lg_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from t.faz_destino
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%LEGADO-ADM-02%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception 'L2: % lancamento(s) fora do destino', n; end if;

  raise notice 'L2 ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;

-- ============================================================================
-- LOTE L3 - D (fazenda produtiva) + guarda global
-- ============================================================================
do $lote$
declare
  c   constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  adm constant uuid := '68f41ea0-3708-4423-b4b4-e42a3733c87a';
  v_regras constant text[] := array['D_fazenda'];
  n int; v_col int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  create temp table _lg_faz on commit drop as select * from (values
      ('ADM', '68f41ea0-3708-4423-b4b4-e42a3733c87a'::uuid),
      ('SM', '2ff5d506-6bba-4cd2-9a23-3d5886e01d38'::uuid),
      ('ST', 'ff90dd6e-58cd-4c3f-b7b3-25cc22b191c5'::uuid)) v(cod, id);
  select count(*) into n from _lg_faz z join public.fazendas f on f.id = z.id and f.cliente_id = c
   where (z.cod = 'ADM') = (f.nome = 'Administrativo');
  if n <> 3 then raise exception 'L3: fazendas nao conferem (% de 3)', n; end if;

  create temp table _lg_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo and p.ordem_exibicao in (17030, 17150, 21020, 21040, 21060, 21080, 21090, 21100, 21110, 21120, 21130, 21140, 21150, 21160, 22030);
  select count(*) into n from (select o from _lg_plano group by o having count(*) = 1) z;
  if n <> 15 or (select count(*) from _lg_plano) <> 15 then raise exception 'L3: planos de destino: % de 15', n; end if;
  if exists (select 1 from _lg_plano where esc <> 'administrativo') then raise exception 'L3: plano de destino fora do escopo administrativo'; end if;

  -- -- CLASSIFICA O UNIVERSO INTEIRO -------------------------------------------
  create temp table _lg_mapa on commit drop as
  with u as (
    select l.id, l.valor, l.plano_conta_id plano_origem, coalesce(l.descricao, '') descricao,
           coalesce(l.importado_duplicado, false) dup_antes, l.hash_importacao hash_antes,
           p.ordem_exibicao o, p.subcentro sub, coalesce(f.nome_favorecido, f.nome, '') fav
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id
      left join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = c and l.fazenda_id = adm and p.escopo_negocio in ('pecuaria', 'agricultura')
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
       and p.ordem_exibicao not in (7010, 12010, 20310, 16010, 16020, 16030, 4030, 4040, 4050)
       and coalesce(l.observacao, '') not like '%LEGADO-ADM-02%'
  ), cl as (
    select u.*, case
      when id in ('eac00d5e-6fe6-4357-8f0c-db86974163f6', '0971a429-1257-4dad-bad2-d94b19eef77e') then 'A_valmet'
      when o = 6190 then 'A_rescisao'
      when o = 8045 then 'A_nutricao'
      when o = 9030 then 'A_veiculos'
      when o = 1040 then 'A_venda_maq'
      when o = 6080 and fav ilike '%Agroinblue%' then 'A_agroinblue'
      when o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or descricao ilike '%DARF IR%' or descricao ilike '%ITCD%' or descricao ilike '%bolsa%' or descricao ilike '%doa__o IR%') then 'B_tributos'
      when o in (6200, 6060) and fav ilike '%Agnaldo%Cedenho%' and (descricao ilike '%labore%' or descricao ilike '%pessoal%') then 'B_pessoal'
      when o = 6200 then 'C_salarios'
      when o = 6180 then 'C_beneficios'
      when o = 6190 then 'C_rescisoes'
      when o = 6080 then 'C_viagens'
      when o = 6210 then 'C_combust'
      when o = 6220 then 'C_manut'
      when o = 6230 then 'C_seguro'
      when o = 6040 then 'C_financ'
      when o = 6020 and (descricao ilike '%_gua%' or descricao ilike '%esgoto%') then 'C_agua'
      when o = 6020 then 'C_comunic'
      when o = 6060 then 'C_outras'
      when o = 6090 then 'C_taxas'
      when o in (6100, 6110, 6120, 6130, 6140, 6150, 6160, 6170, 6240, 6250, 6260) or (o between 8000 and 8999 or o between 9000 and 9999 or o between 1000 and 1999 or o between 5020 and 5039 or o between 15000 and 15999) then 'D_fazenda'
    end regra from u)
  select cl.*,
         case cl.regra
           when 'A_valmet' then null
           when 'A_rescisao' then null
           when 'A_nutricao' then null
           when 'A_veiculos' then 22030
           when 'A_venda_maq' then null
           when 'A_agroinblue' then 21130
           when 'B_tributos' then 17150
           when 'B_pessoal' then 17030
           when 'C_salarios' then 21130
           when 'C_beneficios' then 21110
           when 'C_rescisoes' then 21120
           when 'C_viagens' then 21080
           when 'C_combust' then 21140
           when 'C_manut' then 21150
           when 'C_seguro' then 21160
           when 'C_financ' then 21090
           when 'C_agua' then 21040
           when 'C_comunic' then 21020
           when 'C_outras' then 21060
           when 'C_taxas' then 21100
           when 'D_fazenda' then null
         end o_destino,
         case cl.regra
           when 'A_valmet' then 'ST'
           when 'A_rescisao' then 'SM'
           when 'A_nutricao' then 'ST'
           when 'A_veiculos' then 'ADM'
           when 'A_venda_maq' then 'ST'
           when 'A_agroinblue' then 'ADM'
           when 'B_tributos' then 'ADM'
           when 'B_pessoal' then 'ADM'
           when 'C_salarios' then 'ADM'
           when 'C_beneficios' then 'ADM'
           when 'C_rescisoes' then 'ADM'
           when 'C_viagens' then 'ADM'
           when 'C_combust' then 'ADM'
           when 'C_manut' then 'ADM'
           when 'C_seguro' then 'ADM'
           when 'C_financ' then 'ADM'
           when 'C_agua' then 'ADM'
           when 'C_comunic' then 'ADM'
           when 'C_outras' then 'ADM'
           when 'C_taxas' then 'ADM'
           when 'D_fazenda' then 'ST'
         end faz_cod,
         (cl.regra = 'C_outras' and cl.descricao ilike '%cart_o%') cartao
    from cl;
  select count(*) into n from _lg_mapa where regra is null;
  if n > 0 then raise exception 'L3: % lancamento(s) do universo sem regra', n; end if;

  create temp table _lg_lote on commit drop as
    select m.*, pd.id plano_destino, pd.sub sub_destino, fz.id faz_destino
      from _lg_mapa m left join _lg_plano pd on pd.o = m.o_destino join _lg_faz fz on fz.cod = m.faz_cod
     where m.regra = any(v_regras);
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _lg_lote;
  if v_col = 0 then raise exception 'L3: nada a fazer (lote vazio)'; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  -- fazenda_id so entra no SET de quem muda de fazenda: UPDATE OF fazenda_id dispara o
  -- recalculo de hash_importacao e a checagem de duplicidade nas linhas que ficam.
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (LEGADO-ADM-02): era ' || t.sub || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _lg_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'L3: atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = t.faz_destino
    from _lg_lote t where t.id = l.id and t.faz_cod <> 'ADM';
  get diagnostics n = row_count;
  if n <> (select count(*) from _lg_lote where faz_cod <> 'ADM') then raise exception 'L3: fazenda produtiva em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _lg_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from t.faz_destino
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%LEGADO-ADM-02%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception 'L3: % lancamento(s) fora do destino', n; end if;

  -- -- GUARDA GLOBAL (ultimo lote) --------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.cliente_id = c and l.fazenda_id = adm and p.escopo_negocio in ('pecuaria', 'agricultura')
     and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
     and p.ordem_exibicao not in (7010, 12010, 20310, 16010, 16020, 16030, 4030, 4040, 4050);
  if n > 0 then raise exception 'GLOBAL: % lancamento(s) de pecuaria/agricultura ainda na fazenda Administrativo', n; end if;
  select count(*), round(coalesce(sum(l.valor), 0)::numeric, 2) into n, v_s from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c and l.observacao like '%LEGADO-ADM-02%';
  if n <> 2275 or v_s <> 3148950.74 then raise exception 'GLOBAL: carimbados % / % (esperado 2275 / 3148950.74)', n, v_s; end if;
  select count(*) into n from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.cliente_id = c and l.observacao like '%LEGADO-ADM-02%' and p.escopo_negocio = 'administrativo' and l.safra_id is not null;
  if n > 0 then raise exception 'GLOBAL: % administrativo(s) com safra', n; end if;
  select count(*) into n from public.financeiro_recorrencias r
   where r.cliente_id = c and r.fazenda_id = adm and r.ativo
     and exists (select 1 from public.financeiro_plano_contas p where p.cliente_id is null
                   and p.escopo_negocio in ('pecuaria', 'agricultura') and p.subcentro = r.subcentro);
  if n > 0 then raise exception 'GLOBAL: % recorrencia(s) ativa(s) na Administrativo com subcentro de pecuaria/agricultura', n; end if;

  raise notice 'L3 ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;
