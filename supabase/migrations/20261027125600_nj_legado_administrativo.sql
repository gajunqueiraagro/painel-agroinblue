-- NJ-LEGADO-ADM-01 (v2, 22/09/2026) - legado da fazenda Administrativo sai do custo de pecuaria
--
-- Migration de DADO, so do cliente NJ (f2d67cd4). Nenhuma RPC, nenhuma tela.
--
-- 4.446 lancamentos (R$ 6.474.297,36) em plano de Custo Fixo Pecuaria (6010-6260) na
-- fazenda "Administrativo". Nao sao pecuaria: escritorio, veiculo do escritorio, pessoa
-- fisica do produtor e fatura de cartao. A pecuaria carregava 100% do custo comum e a
-- lavoura nao recebia a parte dela no rateio.
--
-- COMO: so troca plano_conta_id (e fazenda_id nos grupos A1/A2a/D). O trigger
-- resolve_classificacao_from_plano faz o resto: copia grupo/centro/subcentro/escopo do
-- plano novo e, quando ele e administrativo, zera safra_id e fixa a fazenda
-- Administrativo. Nenhuma copia e escrita a mao.
--
-- DE/PARA (a primeira regra que casa vence; origem = ordem do plano atual)
--   A1  6090 '%250 bezerras%'                    -> 15010, Faz. Pureza
--   A2a 6090 '%IOF Custeio%' / '%IOF Contrato%'  -> 7010, Faz. Pureza
--   A2b 6090 '%IOF%' (resto)                     -> 21090
--   B1  6200 favorecido Natalino                 -> 17030
--   B2  6060 favorecido Natalino + '%labore%'    -> 17030
--   B3  6090 IRPF / IR PF / DARF IR / ITCD / bolsa / doacao IR -> 17150
--   C1 6200->21130  C2 6180->21110  C3 6190->21120  C4 6080->21140  C5 6210->21140
--   C6 6220->21150  C7 6230->21160  C8 6040->21090
--   C9a 6020 agua/esgoto -> 21040   C9b 6020 (resto) -> 21020
--   C10 6060 (resto) -> 21060       C11 6090 (resto) -> 21100
--   D   6140 6160 6110 6250 6100 6120 6150 6170 -> plano igual, fazenda Faz. Pureza
--   E   as 4 recorrencias ativas da fazenda Administrativo com subcentro de pecuaria
--       (financeiro_recorrencias NAO tem plano_conta_id: troca-se o texto `subcentro`, que
--       e o que o trigger do lancamento gerado usa para achar o plano; safra_id zerada)
--
-- Carimbo em TODO lancamento tocado, anexado a `observacao` com ' | ':
--   "Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01): era <subcentro origem> na fazenda
--    Administrativo" - e, no C10 que e fatura de cartao, " . fatura de cartao fechada,
--    nao aberta por item" (o ponto e chr(183), para o codigo ficar ASCII).
--
-- EM 5 LOTES. Cada linha custa ~10 ms (34 indices, dois GIN de trigrama, mais audit_log) e o
-- canal de aplicacao corta antes de 64 s. Cada bloco:
--   - reconfere fazendas e os 15 planos de destino (e, no L1, as 4 recorrencias);
--   - classifica o universo INTEIRO (nenhuma linha pode ficar sem regra) e pega so as
--     regras dele;
--   - UPDATE por id e guarda de lote (tocados == coletados, todos no destino, admin sem
--     safra, valor intacto).
-- Idempotente: quem ja tem o carimbo sai do universo. O ultimo bloco (L5) tem a guarda
-- global: universo vazio, carimbados == 4.446 / 6.474.297,36, nenhum administrativo com
-- safra, nenhuma recorrencia ativa na fazenda Administrativo com subcentro de pecuaria.

-- ============================================================================
-- LOTE L1 - A + B + E (excecoes, pessoa fisica, recorrencias)
-- ============================================================================
do $lote$
declare
  c      constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  adm    constant uuid := '8d173d9c-4c26-4593-ae6a-8f76a5a98045';
  pureza constant uuid := 'd3396cdd-7c95-4d41-bcc5-577c0563ce87';
  v_regras constant text[] := array['A1', 'A2a', 'A2b', 'B1', 'B2', 'B3'];
  v_lim    constant int := 3000;
  n int; v_col int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  select count(*) into n from public.fazendas where id = adm and cliente_id = c and nome = 'Administrativo';
  if n <> 1 then raise exception 'L1: fazenda Administrativo nao confere';  end if;
  select count(*) into n from public.fazendas where id = pureza and cliente_id = c and nome ilike '%pureza%';
  if n <> 1 then raise exception 'L1: fazenda Pureza nao confere'; end if;

  create temp table _nj_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub
      from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo
       and p.ordem_exibicao in (15010, 7010, 17030, 17150, 21020, 21040, 21060, 21090,
                                21100, 21110, 21120, 21130, 21140, 21150, 21160);
  select count(*) into n from (select o from _nj_plano group by o having count(*) = 1) z;
  if n <> 15 or (select count(*) from _nj_plano) <> 15 then raise exception 'L1: planos de destino: % ordens com 1 plano (esperado 15)', n; end if;
  if exists (select 1 from _nj_plano where (o in (15010, 7010)) <> (esc = 'pecuaria')
                                         or (o not in (15010, 7010)) <> (esc = 'administrativo')) then
    raise exception 'L1: escopo de plano de destino inesperado';
  end if;

  -- -- CLASSIFICA O UNIVERSO INTEIRO -------------------------------------------
  create temp table _nj_mapa on commit drop as
  with u as (
    select l.id, l.valor, l.plano_conta_id plano_origem, coalesce(l.descricao, '') descricao, coalesce(l.importado_duplicado, false) dup_antes, l.hash_importacao hash_antes,
           p.ordem_exibicao o, p.subcentro sub, coalesce(f.nome_favorecido, f.nome, '') fav
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id
      left join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = c and l.fazenda_id = adm
       and p.escopo_negocio = 'pecuaria' and p.ordem_exibicao between 6010 and 6260
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
       and coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
  ), cl as (
    select u.*, case
      when o = 6090 and descricao ilike '%250 bezerras%'                              then 'A1'
      when o = 6090 and (descricao ilike '%IOF Custeio%' or descricao ilike '%IOF Contrato%') then 'A2a'
      when o = 6090 and descricao ilike '%IOF%'                                       then 'A2b'
      when o = 6200 and fav ilike '%Natalino%'                                        then 'B1'
      when o = 6060 and fav ilike '%Natalino%' and descricao ilike '%labore%'         then 'B2'
      when o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or descricao ilike '%DARF IR%'
                      or descricao ilike '%ITCD%' or descricao ilike '%bolsa%' or descricao ilike '%doa__o IR%') then 'B3'
      when o = 6200 then 'C1'  when o = 6180 then 'C2'  when o = 6190 then 'C3'  when o = 6080 then 'C4'
      when o = 6210 then 'C5'  when o = 6220 then 'C6'  when o = 6230 then 'C7'  when o = 6040 then 'C8'
      when o = 6020 and (descricao ilike '%esgoto%' or descricao ilike '%_gua %' or descricao ilike '%_gua')  then 'C9a'
      when o = 6020 then 'C9b'  when o = 6060 then 'C10'  when o = 6090 then 'C11'
      when o in (6140, 6160, 6110, 6250, 6100, 6120, 6150, 6170)                     then 'D'
    end regra from u)
  select cl.id, cl.regra, cl.valor, cl.plano_origem, cl.sub sub_origem, cl.descricao, cl.dup_antes, cl.hash_antes,
         case cl.regra
           when 'A1' then 15010 when 'A2a' then 7010 when 'A2b' then 21090
           when 'B1' then 17030 when 'B2' then 17030 when 'B3' then 17150
           when 'C1' then 21130 when 'C2' then 21110 when 'C3' then 21120 when 'C4' then 21140
           when 'C5' then 21140 when 'C6' then 21150 when 'C7' then 21160 when 'C8' then 21090
           when 'C9a' then 21040 when 'C9b' then 21020 when 'C10' then 21060 when 'C11' then 21100
         end o_destino,
         cl.regra in ('A1', 'A2a', 'D') vai_pureza,
         (cl.regra = 'C10' and cl.descricao ilike '%cart_o%') cartao
    from cl;
  select count(*) into n from _nj_mapa where regra is null;
  if n > 0 then raise exception 'L1: % lancamento(s) do universo sem regra', n; end if;

  create temp table _nj_lote on commit drop as
    select m.*, pd.id plano_destino, pd.esc esc_destino
      from _nj_mapa m left join _nj_plano pd on pd.o = m.o_destino
     where m.regra = any(v_regras)
     order by m.id limit v_lim;
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _nj_lote;
  if v_col = 0 then raise exception 'L1: nada a fazer (lote vazio)'; end if;

  -- -- E: RECORRENCIAS -----------------------------------------------------------
  create temp table _nj_rec on commit drop as
    select e.id, e.o from (values
      ('5f9f99e5-63f9-4af5-9c75-4018a45a03cf'::uuid, 21040),
      ('81af67cf-8ff2-403d-9688-8d92128dbdc7',       21020),
      ('25d7c5b1-4497-4fa6-8b1e-617fdc12d264',       21130),
      ('041b340e-f705-4d9b-8200-b283fe18c01b',       21130)) e(id, o);
  select count(*) into n from public.financeiro_recorrencias r join _nj_rec e on e.id = r.id
   where r.cliente_id = c and r.fazenda_id = adm and r.ativo
     and exists (select 1 from public.financeiro_plano_contas p where p.cliente_id is null and p.escopo_negocio = 'pecuaria'
                   and p.ordem_exibicao in (6020, 6200) and p.subcentro = r.subcentro);
  if n <> 4 then raise exception 'L1: recorrencias: % de 4 no estado esperado', n; end if;
  update public.financeiro_recorrencias r
     set subcentro = pd.sub, safra_id = null, updated_at = now(),
         observacao = concat_ws(' | ', nullif(btrim(r.observacao), ''),
           'Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01): era ' || r.subcentro || ' na fazenda Administrativo')
    from _nj_rec e join _nj_plano pd on pd.o = e.o
   where r.id = e.id;
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'L1: recorrencias atualizadas: % de 4', n; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  -- fazenda_id so entra no SET de quem muda de fazenda: UPDATE OF fazenda_id dispara o
  -- recalculo de hash_importacao e a checagem de duplicidade, e nao ha por que reescrever
  -- o hash de quem fica na Administrativo.
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01): era ' || t.sub_origem || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _nj_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'L1: atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = pureza
    from _nj_lote t where t.id = l.id and t.vai_pureza;
  get diagnostics n = row_count;
  if n <> (select count(*) from _nj_lote where vai_pureza) then raise exception 'L1: fazenda Pureza em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _nj_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from (case when t.vai_pureza then pureza else adm end)
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception 'L1: % lancamento(s) fora do destino', n; end if;

  raise notice 'L1 ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;

-- ============================================================================
-- LOTE L2 - C1 C2 C3 C11 (mao de obra e taxas)
-- ============================================================================
do $lote$
declare
  c      constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  adm    constant uuid := '8d173d9c-4c26-4593-ae6a-8f76a5a98045';
  pureza constant uuid := 'd3396cdd-7c95-4d41-bcc5-577c0563ce87';
  v_regras constant text[] := array['C1', 'C2', 'C3', 'C11'];
  v_lim    constant int := 3000;
  n int; v_col int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  select count(*) into n from public.fazendas where id = adm and cliente_id = c and nome = 'Administrativo';
  if n <> 1 then raise exception 'L2: fazenda Administrativo nao confere';  end if;
  select count(*) into n from public.fazendas where id = pureza and cliente_id = c and nome ilike '%pureza%';
  if n <> 1 then raise exception 'L2: fazenda Pureza nao confere'; end if;

  create temp table _nj_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub
      from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo
       and p.ordem_exibicao in (15010, 7010, 17030, 17150, 21020, 21040, 21060, 21090,
                                21100, 21110, 21120, 21130, 21140, 21150, 21160);
  select count(*) into n from (select o from _nj_plano group by o having count(*) = 1) z;
  if n <> 15 or (select count(*) from _nj_plano) <> 15 then raise exception 'L2: planos de destino: % ordens com 1 plano (esperado 15)', n; end if;
  if exists (select 1 from _nj_plano where (o in (15010, 7010)) <> (esc = 'pecuaria')
                                         or (o not in (15010, 7010)) <> (esc = 'administrativo')) then
    raise exception 'L2: escopo de plano de destino inesperado';
  end if;

  -- -- CLASSIFICA O UNIVERSO INTEIRO -------------------------------------------
  create temp table _nj_mapa on commit drop as
  with u as (
    select l.id, l.valor, l.plano_conta_id plano_origem, coalesce(l.descricao, '') descricao, coalesce(l.importado_duplicado, false) dup_antes, l.hash_importacao hash_antes,
           p.ordem_exibicao o, p.subcentro sub, coalesce(f.nome_favorecido, f.nome, '') fav
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id
      left join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = c and l.fazenda_id = adm
       and p.escopo_negocio = 'pecuaria' and p.ordem_exibicao between 6010 and 6260
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
       and coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
  ), cl as (
    select u.*, case
      when o = 6090 and descricao ilike '%250 bezerras%'                              then 'A1'
      when o = 6090 and (descricao ilike '%IOF Custeio%' or descricao ilike '%IOF Contrato%') then 'A2a'
      when o = 6090 and descricao ilike '%IOF%'                                       then 'A2b'
      when o = 6200 and fav ilike '%Natalino%'                                        then 'B1'
      when o = 6060 and fav ilike '%Natalino%' and descricao ilike '%labore%'         then 'B2'
      when o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or descricao ilike '%DARF IR%'
                      or descricao ilike '%ITCD%' or descricao ilike '%bolsa%' or descricao ilike '%doa__o IR%') then 'B3'
      when o = 6200 then 'C1'  when o = 6180 then 'C2'  when o = 6190 then 'C3'  when o = 6080 then 'C4'
      when o = 6210 then 'C5'  when o = 6220 then 'C6'  when o = 6230 then 'C7'  when o = 6040 then 'C8'
      when o = 6020 and (descricao ilike '%esgoto%' or descricao ilike '%_gua %' or descricao ilike '%_gua')  then 'C9a'
      when o = 6020 then 'C9b'  when o = 6060 then 'C10'  when o = 6090 then 'C11'
      when o in (6140, 6160, 6110, 6250, 6100, 6120, 6150, 6170)                     then 'D'
    end regra from u)
  select cl.id, cl.regra, cl.valor, cl.plano_origem, cl.sub sub_origem, cl.descricao, cl.dup_antes, cl.hash_antes,
         case cl.regra
           when 'A1' then 15010 when 'A2a' then 7010 when 'A2b' then 21090
           when 'B1' then 17030 when 'B2' then 17030 when 'B3' then 17150
           when 'C1' then 21130 when 'C2' then 21110 when 'C3' then 21120 when 'C4' then 21140
           when 'C5' then 21140 when 'C6' then 21150 when 'C7' then 21160 when 'C8' then 21090
           when 'C9a' then 21040 when 'C9b' then 21020 when 'C10' then 21060 when 'C11' then 21100
         end o_destino,
         cl.regra in ('A1', 'A2a', 'D') vai_pureza,
         (cl.regra = 'C10' and cl.descricao ilike '%cart_o%') cartao
    from cl;
  select count(*) into n from _nj_mapa where regra is null;
  if n > 0 then raise exception 'L2: % lancamento(s) do universo sem regra', n; end if;

  create temp table _nj_lote on commit drop as
    select m.*, pd.id plano_destino, pd.esc esc_destino
      from _nj_mapa m left join _nj_plano pd on pd.o = m.o_destino
     where m.regra = any(v_regras)
     order by m.id limit v_lim;
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _nj_lote;
  if v_col = 0 then raise exception 'L2: nada a fazer (lote vazio)'; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  -- fazenda_id so entra no SET de quem muda de fazenda: UPDATE OF fazenda_id dispara o
  -- recalculo de hash_importacao e a checagem de duplicidade, e nao ha por que reescrever
  -- o hash de quem fica na Administrativo.
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01): era ' || t.sub_origem || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _nj_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'L2: atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = pureza
    from _nj_lote t where t.id = l.id and t.vai_pureza;
  get diagnostics n = row_count;
  if n <> (select count(*) from _nj_lote where vai_pureza) then raise exception 'L2: fazenda Pureza em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _nj_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from (case when t.vai_pureza then pureza else adm end)
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception 'L2: % lancamento(s) fora do destino', n; end if;

  raise notice 'L2 ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;

-- ============================================================================
-- LOTE L3 - C4 C5 C6 C7 C8 (veiculos e desp. financeiras)
-- ============================================================================
do $lote$
declare
  c      constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  adm    constant uuid := '8d173d9c-4c26-4593-ae6a-8f76a5a98045';
  pureza constant uuid := 'd3396cdd-7c95-4d41-bcc5-577c0563ce87';
  v_regras constant text[] := array['C4', 'C5', 'C6', 'C7', 'C8'];
  v_lim    constant int := 3000;
  n int; v_col int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  select count(*) into n from public.fazendas where id = adm and cliente_id = c and nome = 'Administrativo';
  if n <> 1 then raise exception 'L3: fazenda Administrativo nao confere';  end if;
  select count(*) into n from public.fazendas where id = pureza and cliente_id = c and nome ilike '%pureza%';
  if n <> 1 then raise exception 'L3: fazenda Pureza nao confere'; end if;

  create temp table _nj_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub
      from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo
       and p.ordem_exibicao in (15010, 7010, 17030, 17150, 21020, 21040, 21060, 21090,
                                21100, 21110, 21120, 21130, 21140, 21150, 21160);
  select count(*) into n from (select o from _nj_plano group by o having count(*) = 1) z;
  if n <> 15 or (select count(*) from _nj_plano) <> 15 then raise exception 'L3: planos de destino: % ordens com 1 plano (esperado 15)', n; end if;
  if exists (select 1 from _nj_plano where (o in (15010, 7010)) <> (esc = 'pecuaria')
                                         or (o not in (15010, 7010)) <> (esc = 'administrativo')) then
    raise exception 'L3: escopo de plano de destino inesperado';
  end if;

  -- -- CLASSIFICA O UNIVERSO INTEIRO -------------------------------------------
  create temp table _nj_mapa on commit drop as
  with u as (
    select l.id, l.valor, l.plano_conta_id plano_origem, coalesce(l.descricao, '') descricao, coalesce(l.importado_duplicado, false) dup_antes, l.hash_importacao hash_antes,
           p.ordem_exibicao o, p.subcentro sub, coalesce(f.nome_favorecido, f.nome, '') fav
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id
      left join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = c and l.fazenda_id = adm
       and p.escopo_negocio = 'pecuaria' and p.ordem_exibicao between 6010 and 6260
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
       and coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
  ), cl as (
    select u.*, case
      when o = 6090 and descricao ilike '%250 bezerras%'                              then 'A1'
      when o = 6090 and (descricao ilike '%IOF Custeio%' or descricao ilike '%IOF Contrato%') then 'A2a'
      when o = 6090 and descricao ilike '%IOF%'                                       then 'A2b'
      when o = 6200 and fav ilike '%Natalino%'                                        then 'B1'
      when o = 6060 and fav ilike '%Natalino%' and descricao ilike '%labore%'         then 'B2'
      when o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or descricao ilike '%DARF IR%'
                      or descricao ilike '%ITCD%' or descricao ilike '%bolsa%' or descricao ilike '%doa__o IR%') then 'B3'
      when o = 6200 then 'C1'  when o = 6180 then 'C2'  when o = 6190 then 'C3'  when o = 6080 then 'C4'
      when o = 6210 then 'C5'  when o = 6220 then 'C6'  when o = 6230 then 'C7'  when o = 6040 then 'C8'
      when o = 6020 and (descricao ilike '%esgoto%' or descricao ilike '%_gua %' or descricao ilike '%_gua')  then 'C9a'
      when o = 6020 then 'C9b'  when o = 6060 then 'C10'  when o = 6090 then 'C11'
      when o in (6140, 6160, 6110, 6250, 6100, 6120, 6150, 6170)                     then 'D'
    end regra from u)
  select cl.id, cl.regra, cl.valor, cl.plano_origem, cl.sub sub_origem, cl.descricao, cl.dup_antes, cl.hash_antes,
         case cl.regra
           when 'A1' then 15010 when 'A2a' then 7010 when 'A2b' then 21090
           when 'B1' then 17030 when 'B2' then 17030 when 'B3' then 17150
           when 'C1' then 21130 when 'C2' then 21110 when 'C3' then 21120 when 'C4' then 21140
           when 'C5' then 21140 when 'C6' then 21150 when 'C7' then 21160 when 'C8' then 21090
           when 'C9a' then 21040 when 'C9b' then 21020 when 'C10' then 21060 when 'C11' then 21100
         end o_destino,
         cl.regra in ('A1', 'A2a', 'D') vai_pureza,
         (cl.regra = 'C10' and cl.descricao ilike '%cart_o%') cartao
    from cl;
  select count(*) into n from _nj_mapa where regra is null;
  if n > 0 then raise exception 'L3: % lancamento(s) do universo sem regra', n; end if;

  create temp table _nj_lote on commit drop as
    select m.*, pd.id plano_destino, pd.esc esc_destino
      from _nj_mapa m left join _nj_plano pd on pd.o = m.o_destino
     where m.regra = any(v_regras)
     order by m.id limit v_lim;
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _nj_lote;
  if v_col = 0 then raise exception 'L3: nada a fazer (lote vazio)'; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  -- fazenda_id so entra no SET de quem muda de fazenda: UPDATE OF fazenda_id dispara o
  -- recalculo de hash_importacao e a checagem de duplicidade, e nao ha por que reescrever
  -- o hash de quem fica na Administrativo.
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01): era ' || t.sub_origem || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _nj_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'L3: atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = pureza
    from _nj_lote t where t.id = l.id and t.vai_pureza;
  get diagnostics n = row_count;
  if n <> (select count(*) from _nj_lote where vai_pureza) then raise exception 'L3: fazenda Pureza em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _nj_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from (case when t.vai_pureza then pureza else adm end)
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception 'L3: % lancamento(s) fora do destino', n; end if;

  raise notice 'L3 ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;

-- ============================================================================
-- LOTE L4 - C9a C9b C10 (comunicacao, escritorio, outras)
-- ============================================================================
do $lote$
declare
  c      constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  adm    constant uuid := '8d173d9c-4c26-4593-ae6a-8f76a5a98045';
  pureza constant uuid := 'd3396cdd-7c95-4d41-bcc5-577c0563ce87';
  v_regras constant text[] := array['C9a', 'C9b', 'C10'];
  v_lim    constant int := 3000;
  n int; v_col int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  select count(*) into n from public.fazendas where id = adm and cliente_id = c and nome = 'Administrativo';
  if n <> 1 then raise exception 'L4: fazenda Administrativo nao confere';  end if;
  select count(*) into n from public.fazendas where id = pureza and cliente_id = c and nome ilike '%pureza%';
  if n <> 1 then raise exception 'L4: fazenda Pureza nao confere'; end if;

  create temp table _nj_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub
      from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo
       and p.ordem_exibicao in (15010, 7010, 17030, 17150, 21020, 21040, 21060, 21090,
                                21100, 21110, 21120, 21130, 21140, 21150, 21160);
  select count(*) into n from (select o from _nj_plano group by o having count(*) = 1) z;
  if n <> 15 or (select count(*) from _nj_plano) <> 15 then raise exception 'L4: planos de destino: % ordens com 1 plano (esperado 15)', n; end if;
  if exists (select 1 from _nj_plano where (o in (15010, 7010)) <> (esc = 'pecuaria')
                                         or (o not in (15010, 7010)) <> (esc = 'administrativo')) then
    raise exception 'L4: escopo de plano de destino inesperado';
  end if;

  -- -- CLASSIFICA O UNIVERSO INTEIRO -------------------------------------------
  create temp table _nj_mapa on commit drop as
  with u as (
    select l.id, l.valor, l.plano_conta_id plano_origem, coalesce(l.descricao, '') descricao, coalesce(l.importado_duplicado, false) dup_antes, l.hash_importacao hash_antes,
           p.ordem_exibicao o, p.subcentro sub, coalesce(f.nome_favorecido, f.nome, '') fav
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id
      left join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = c and l.fazenda_id = adm
       and p.escopo_negocio = 'pecuaria' and p.ordem_exibicao between 6010 and 6260
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
       and coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
  ), cl as (
    select u.*, case
      when o = 6090 and descricao ilike '%250 bezerras%'                              then 'A1'
      when o = 6090 and (descricao ilike '%IOF Custeio%' or descricao ilike '%IOF Contrato%') then 'A2a'
      when o = 6090 and descricao ilike '%IOF%'                                       then 'A2b'
      when o = 6200 and fav ilike '%Natalino%'                                        then 'B1'
      when o = 6060 and fav ilike '%Natalino%' and descricao ilike '%labore%'         then 'B2'
      when o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or descricao ilike '%DARF IR%'
                      or descricao ilike '%ITCD%' or descricao ilike '%bolsa%' or descricao ilike '%doa__o IR%') then 'B3'
      when o = 6200 then 'C1'  when o = 6180 then 'C2'  when o = 6190 then 'C3'  when o = 6080 then 'C4'
      when o = 6210 then 'C5'  when o = 6220 then 'C6'  when o = 6230 then 'C7'  when o = 6040 then 'C8'
      when o = 6020 and (descricao ilike '%esgoto%' or descricao ilike '%_gua %' or descricao ilike '%_gua')  then 'C9a'
      when o = 6020 then 'C9b'  when o = 6060 then 'C10'  when o = 6090 then 'C11'
      when o in (6140, 6160, 6110, 6250, 6100, 6120, 6150, 6170)                     then 'D'
    end regra from u)
  select cl.id, cl.regra, cl.valor, cl.plano_origem, cl.sub sub_origem, cl.descricao, cl.dup_antes, cl.hash_antes,
         case cl.regra
           when 'A1' then 15010 when 'A2a' then 7010 when 'A2b' then 21090
           when 'B1' then 17030 when 'B2' then 17030 when 'B3' then 17150
           when 'C1' then 21130 when 'C2' then 21110 when 'C3' then 21120 when 'C4' then 21140
           when 'C5' then 21140 when 'C6' then 21150 when 'C7' then 21160 when 'C8' then 21090
           when 'C9a' then 21040 when 'C9b' then 21020 when 'C10' then 21060 when 'C11' then 21100
         end o_destino,
         cl.regra in ('A1', 'A2a', 'D') vai_pureza,
         (cl.regra = 'C10' and cl.descricao ilike '%cart_o%') cartao
    from cl;
  select count(*) into n from _nj_mapa where regra is null;
  if n > 0 then raise exception 'L4: % lancamento(s) do universo sem regra', n; end if;

  create temp table _nj_lote on commit drop as
    select m.*, pd.id plano_destino, pd.esc esc_destino
      from _nj_mapa m left join _nj_plano pd on pd.o = m.o_destino
     where m.regra = any(v_regras)
     order by m.id limit v_lim;
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _nj_lote;
  if v_col = 0 then raise exception 'L4: nada a fazer (lote vazio)'; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  -- fazenda_id so entra no SET de quem muda de fazenda: UPDATE OF fazenda_id dispara o
  -- recalculo de hash_importacao e a checagem de duplicidade, e nao ha por que reescrever
  -- o hash de quem fica na Administrativo.
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01): era ' || t.sub_origem || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _nj_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'L4: atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = pureza
    from _nj_lote t where t.id = l.id and t.vai_pureza;
  get diagnostics n = row_count;
  if n <> (select count(*) from _nj_lote where vai_pureza) then raise exception 'L4: fazenda Pureza em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _nj_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from (case when t.vai_pureza then pureza else adm end)
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception 'L4: % lancamento(s) fora do destino', n; end if;

  raise notice 'L4 ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;

-- ============================================================================
-- LOTE L5 - D (fazenda Pureza) + guarda global
-- ============================================================================
do $lote$
declare
  c      constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  adm    constant uuid := '8d173d9c-4c26-4593-ae6a-8f76a5a98045';
  pureza constant uuid := 'd3396cdd-7c95-4d41-bcc5-577c0563ce87';
  v_regras constant text[] := array['D'];
  v_lim    constant int := 3000;
  n int; v_col int; v_s numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  select count(*) into n from public.fazendas where id = adm and cliente_id = c and nome = 'Administrativo';
  if n <> 1 then raise exception 'L5: fazenda Administrativo nao confere';  end if;
  select count(*) into n from public.fazendas where id = pureza and cliente_id = c and nome ilike '%pureza%';
  if n <> 1 then raise exception 'L5: fazenda Pureza nao confere'; end if;

  create temp table _nj_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub
      from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo
       and p.ordem_exibicao in (15010, 7010, 17030, 17150, 21020, 21040, 21060, 21090,
                                21100, 21110, 21120, 21130, 21140, 21150, 21160);
  select count(*) into n from (select o from _nj_plano group by o having count(*) = 1) z;
  if n <> 15 or (select count(*) from _nj_plano) <> 15 then raise exception 'L5: planos de destino: % ordens com 1 plano (esperado 15)', n; end if;
  if exists (select 1 from _nj_plano where (o in (15010, 7010)) <> (esc = 'pecuaria')
                                         or (o not in (15010, 7010)) <> (esc = 'administrativo')) then
    raise exception 'L5: escopo de plano de destino inesperado';
  end if;

  -- -- CLASSIFICA O UNIVERSO INTEIRO -------------------------------------------
  create temp table _nj_mapa on commit drop as
  with u as (
    select l.id, l.valor, l.plano_conta_id plano_origem, coalesce(l.descricao, '') descricao, coalesce(l.importado_duplicado, false) dup_antes, l.hash_importacao hash_antes,
           p.ordem_exibicao o, p.subcentro sub, coalesce(f.nome_favorecido, f.nome, '') fav
      from public.financeiro_lancamentos_v2 l
      join public.financeiro_plano_contas p on p.id = l.plano_conta_id
      left join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = c and l.fazenda_id = adm
       and p.escopo_negocio = 'pecuaria' and p.ordem_exibicao between 6010 and 6260
       and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
       and coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
  ), cl as (
    select u.*, case
      when o = 6090 and descricao ilike '%250 bezerras%'                              then 'A1'
      when o = 6090 and (descricao ilike '%IOF Custeio%' or descricao ilike '%IOF Contrato%') then 'A2a'
      when o = 6090 and descricao ilike '%IOF%'                                       then 'A2b'
      when o = 6200 and fav ilike '%Natalino%'                                        then 'B1'
      when o = 6060 and fav ilike '%Natalino%' and descricao ilike '%labore%'         then 'B2'
      when o = 6090 and (descricao ilike '%IRPF%' or descricao ilike '%IR PF%' or descricao ilike '%DARF IR%'
                      or descricao ilike '%ITCD%' or descricao ilike '%bolsa%' or descricao ilike '%doa__o IR%') then 'B3'
      when o = 6200 then 'C1'  when o = 6180 then 'C2'  when o = 6190 then 'C3'  when o = 6080 then 'C4'
      when o = 6210 then 'C5'  when o = 6220 then 'C6'  when o = 6230 then 'C7'  when o = 6040 then 'C8'
      when o = 6020 and (descricao ilike '%esgoto%' or descricao ilike '%_gua %' or descricao ilike '%_gua')  then 'C9a'
      when o = 6020 then 'C9b'  when o = 6060 then 'C10'  when o = 6090 then 'C11'
      when o in (6140, 6160, 6110, 6250, 6100, 6120, 6150, 6170)                     then 'D'
    end regra from u)
  select cl.id, cl.regra, cl.valor, cl.plano_origem, cl.sub sub_origem, cl.descricao, cl.dup_antes, cl.hash_antes,
         case cl.regra
           when 'A1' then 15010 when 'A2a' then 7010 when 'A2b' then 21090
           when 'B1' then 17030 when 'B2' then 17030 when 'B3' then 17150
           when 'C1' then 21130 when 'C2' then 21110 when 'C3' then 21120 when 'C4' then 21140
           when 'C5' then 21140 when 'C6' then 21150 when 'C7' then 21160 when 'C8' then 21090
           when 'C9a' then 21040 when 'C9b' then 21020 when 'C10' then 21060 when 'C11' then 21100
         end o_destino,
         cl.regra in ('A1', 'A2a', 'D') vai_pureza,
         (cl.regra = 'C10' and cl.descricao ilike '%cart_o%') cartao
    from cl;
  select count(*) into n from _nj_mapa where regra is null;
  if n > 0 then raise exception 'L5: % lancamento(s) do universo sem regra', n; end if;

  create temp table _nj_lote on commit drop as
    select m.*, pd.id plano_destino, pd.esc esc_destino
      from _nj_mapa m left join _nj_plano pd on pd.o = m.o_destino
     where m.regra = any(v_regras)
     order by m.id limit v_lim;
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _nj_lote;
  if v_col = 0 then raise exception 'L5: nada a fazer (lote vazio)'; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  -- fazenda_id so entra no SET de quem muda de fazenda: UPDATE OF fazenda_id dispara o
  -- recalculo de hash_importacao e a checagem de duplicidade, e nao ha por que reescrever
  -- o hash de quem fica na Administrativo.
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01): era ' || t.sub_origem || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _nj_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'L5: atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = pureza
    from _nj_lote t where t.id = l.id and t.vai_pureza;
  get diagnostics n = row_count;
  if n <> (select count(*) from _nj_lote where vai_pureza) then raise exception 'L5: fazenda Pureza em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _nj_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from (case when t.vai_pureza then pureza else adm end)
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception 'L5: % lancamento(s) fora do destino', n; end if;

  -- -- GUARDA GLOBAL (ultimo lote) --------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.cliente_id = c and l.fazenda_id = adm and p.escopo_negocio = 'pecuaria' and p.ordem_exibicao between 6010 and 6260
     and coalesce(l.cancelado, false) = false and l.cenario = 'realizado';
  if n > 0 then raise exception 'GLOBAL: % lancamento(s) ainda em Custo Fixo Pecuaria na fazenda Administrativo', n; end if;
  select count(*), round(coalesce(sum(l.valor), 0)::numeric, 2) into n, v_s from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c and l.observacao like '%NJ-LEGADO-ADM-01%';
  if n <> 4446 or v_s <> 6474297.36 then raise exception 'GLOBAL: carimbados % / % (esperado 4446 / 6474297.36)', n, v_s; end if;
  select count(*) into n from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.cliente_id = c and l.observacao like '%NJ-LEGADO-ADM-01%' and p.escopo_negocio = 'administrativo' and l.safra_id is not null;
  if n > 0 then raise exception 'GLOBAL: % administrativo(s) com safra', n; end if;
  select count(*) into n from public.financeiro_recorrencias r
   where r.cliente_id = c and r.fazenda_id = adm and r.ativo
     and exists (select 1 from public.financeiro_plano_contas p where p.cliente_id is null and p.escopo_negocio = 'pecuaria'
                   and p.subcentro = r.subcentro);
  if n > 0 then raise exception 'GLOBAL: % recorrencia(s) ativa(s) na fazenda Administrativo com subcentro de pecuaria', n; end if;

  raise notice 'L5 ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;
