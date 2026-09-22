-- NJ-LEGADO-ADM-01b (22/09/2026) - sobra de pecuaria/agricultura na fazenda Administrativo do NJ
--
-- Migration de DADO, so do cliente NJ (f2d67cd4). Nenhuma RPC, nenhuma tela. Nenhum valor muda:
-- so plano e/ou fazenda.
--
-- O NJ-LEGADO-ADM-01 (20261027125600) tirou o Custo Fixo Pecuaria (6010-6260) da Administrativo.
-- Sobraram 181 lancamentos de plano pecuaria/agricultura la (fora juros, amortizacao e captacao,
-- que a regra de 22/09 permite no administrativo da atividade): investimento em veiculo,
-- consorcio, maquina, escritorio, custo fixo de lavoura, adiantamento a parceiro, abate e venda.
--
-- Mesmo mecanismo: so troca plano_conta_id - o trigger resolve_classificacao_from_plano copia as
-- colunas do plano novo e, quando ele e administrativo, zera a safra e fixa a Administrativo - e,
-- para quem vai para fazenda produtiva, fazenda_id num UPDATE SEPARADO (UPDATE OF fazenda_id
-- recalcula hash_importacao e checa duplicidade; as linhas que ficam nao passam por isso).
--
-- REGRAS (a primeira que casa vence; o = ordem do plano atual):
--   B_maquina    9030/9020 trator (consorcio contemplado do Ivo Romagna - a descricao manda),
--                pa carregadeira, vagao Agross, "Maquinas - verificar", GPS, container,
--                "Lona e Cinta Catraca VW-13180" (Iccap), "Verificar" (Lineagro) -> plano mantido, Pureza
--   A_veiculo    9030 veiculo / Hilux / Amarok / Strada                          -> 22030, ADM
--   C_consorcio  9030 consorcio (todos os demais)                                -> 22030, ADM
--   D_instal     9020 Energia Solar Esc. / Construcao Escritorio                  -> 22010, ADM
--   D_equip      9020 Notebook Carlos / "Investimentos" (Rogerio); 9030 Fatura Cartao Credito -> 22020, ADM
--   E_pureza     1020, 1040, 1090, 15020, 9040-9079                               -> plano mantido, Pureza
--   E_retiro     10005, 11xxx, 14xxx                                              -> plano mantido, Retiro Agricultura
--   Linha sem regra aborta a migration.
--
-- Carimbo em `observacao` (append ' | '): "Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01b): era
-- <subcentro origem> na fazenda Administrativo"; a fatura de cartao ganha ' . fatura de cartao
-- fechada, nao aberta por item' (o ponto e chr(183)).
-- Idempotente pelo carimbo. Guardas: tocados == coletados, destino conferido, valor intacto,
-- nenhum pecuaria/agricultura sobrando na Administrativo, total do cliente igual ao centavo.

do $lote$
declare
  c   constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  adm constant uuid := '8d173d9c-4c26-4593-ae6a-8f76a5a98045';
  n int; v_col int; v_s numeric;
  tot_n0 bigint; tot_s0 numeric; tot_n1 bigint; tot_s1 numeric;
begin
  -- -- ENTRADA ----------------------------------------------------------------
  create temp table _lg_faz on commit drop as select * from (values
      ('ADM', '8d173d9c-4c26-4593-ae6a-8f76a5a98045'::uuid, 'Administrativo'),
      ('PUR', 'd3396cdd-7c95-4d41-bcc5-577c0563ce87'::uuid, 'Pureza'),
      ('RET', '65a8fd4c-8973-4697-9bf1-56f59f2bafc1'::uuid, 'Retiro Agricultura')) v(cod, id, nome_esperado);
  select count(*) into n from _lg_faz z join public.fazendas f on f.id = z.id and f.cliente_id = c
   where f.nome ilike '%' || z.nome_esperado || '%';
  if n <> 3 then raise exception 'fazendas nao conferem (% de 3)', n; end if;

  create temp table _lg_plano on commit drop as
    select p.ordem_exibicao o, p.id, p.escopo_negocio esc, p.subcentro sub from public.financeiro_plano_contas p
     where p.cliente_id is null and p.ativo and p.ordem_exibicao in (22010, 22020, 22030);
  select count(*) into n from (select o from _lg_plano group by o having count(*) = 1) z;
  if n <> 3 or (select count(*) from _lg_plano) <> 3 then raise exception 'planos de destino: % de 3', n; end if;
  if exists (select 1 from _lg_plano where esc <> 'administrativo') then raise exception 'plano de destino fora do escopo administrativo'; end if;

  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into tot_n0, tot_s0 from public.financeiro_lancamentos_v2
   where cliente_id = c and coalesce(cancelado, false) = false;

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
       and coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01b%'
  ), cl as (
    select u.*, case
      when o in (9020, 9030) and (descricao ilike '%trator%' or descricao ilike '%carregadeira%'
             or descricao ilike '%vag_o agross%' or descricao ilike '%quinas - verificar%'
             or descricao ilike '%GPS%' or descricao ilike '%container%' or descricao ilike '%lona e cinta%'
             or (btrim(descricao) = 'Verificar' and fav ilike 'Lineagro%')) then 'B_maquina'
      when o = 9030 and (descricao ilike '%ve_culo%' or descricao ilike '%hilux%' or descricao ilike '%amarok%'
             or descricao ilike '%strada%') then 'A_veiculo'
      when o = 9030 and descricao ilike '%cons_rcio%' then 'C_consorcio'
      when o = 9020 and (descricao ilike '%energia solar esc%' or descricao ilike '%constru__o escrit_rio%') then 'D_instal'
      when (o = 9020 and (descricao ilike '%notbook%' or descricao ilike '%notebook%' or btrim(descricao) = 'Investimentos'))
        or (o = 9030 and descricao ilike '%fatura cart_o%') then 'D_equip'
      when o in (1020, 1040, 1090, 15020) or o between 9040 and 9079 then 'E_pureza'
      when o = 10005 or o between 11000 and 11999 or o between 14000 and 14999 then 'E_retiro'
    end regra from u)
  select cl.*,
         case cl.regra when 'A_veiculo' then 22030 when 'C_consorcio' then 22030
                       when 'D_instal' then 22010 when 'D_equip' then 22020 end o_destino,
         case cl.regra when 'B_maquina' then 'PUR' when 'E_pureza' then 'PUR' when 'E_retiro' then 'RET'
                       else 'ADM' end faz_cod,
         (cl.regra = 'D_equip' and cl.descricao ilike '%fatura cart_o%') cartao
    from cl;
  select count(*) into n from _lg_mapa where regra is null;
  if n > 0 then raise exception '% lancamento(s) do universo sem regra', n; end if;

  create temp table _lg_lote on commit drop as
    select m.*, pd.id plano_destino, fz.id faz_destino
      from _lg_mapa m left join _lg_plano pd on pd.o = m.o_destino join _lg_faz fz on fz.cod = m.faz_cod;
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into v_col, v_s from _lg_lote;
  if v_col = 0 then raise exception 'nada a fazer (universo vazio)'; end if;
  if v_col <> 181 then raise exception 'universo com % lancamentos (esperado 181)', v_col; end if;

  -- -- UPDATE POR ID ----------------------------------------------------------
  update public.financeiro_lancamentos_v2 l
     set plano_conta_id = coalesce(t.plano_destino, l.plano_conta_id),
         observacao     = concat_ws(' | ', nullif(btrim(l.observacao), ''),
                            'Reclassificado em 22/09/2026 (NJ-LEGADO-ADM-01b): era ' || t.sub || ' na fazenda Administrativo'
                            || case when t.cartao then ' ' || chr(183) || ' fatura de cartao fechada, nao aberta por item' else '' end)
    from _lg_lote t
   where t.id = l.id;
  get diagnostics n = row_count;
  if n <> v_col then raise exception 'atualizados % de % coletados', n, v_col; end if;
  update public.financeiro_lancamentos_v2 l set fazenda_id = t.faz_destino
    from _lg_lote t where t.id = l.id and t.faz_cod <> 'ADM';
  get diagnostics n = row_count;
  if n <> (select count(*) from _lg_lote where faz_cod <> 'ADM') then raise exception 'fazenda produtiva em % linhas', n; end if;

  -- -- GUARDA DO LOTE ---------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l
    join _lg_lote t on t.id = l.id
    join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.plano_conta_id is distinct from coalesce(t.plano_destino, t.plano_origem)
      or l.fazenda_id is distinct from t.faz_destino
      or (p.escopo_negocio = 'administrativo' and l.safra_id is not null)
      or coalesce(l.observacao, '') not like '%NJ-LEGADO-ADM-01b%'
      or l.valor is distinct from t.valor
      or coalesce(l.cancelado, false);
  if n > 0 then raise exception '% lancamento(s) fora do destino', n; end if;

  -- -- GUARDA GLOBAL ----------------------------------------------------------
  select count(*) into n
    from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas p on p.id = l.plano_conta_id
   where l.cliente_id = c and l.fazenda_id = adm and p.escopo_negocio in ('pecuaria', 'agricultura')
     and coalesce(l.cancelado, false) = false and l.cenario = 'realizado'
     and p.ordem_exibicao not in (7010, 12010, 20310, 16010, 16020, 16030, 4030, 4040, 4050);
  if n > 0 then raise exception 'GLOBAL: % lancamento(s) de pecuaria/agricultura ainda na fazenda Administrativo', n; end if;
  select count(*), round(coalesce(sum(valor), 0)::numeric, 2) into tot_n1, tot_s1 from public.financeiro_lancamentos_v2
   where cliente_id = c and coalesce(cancelado, false) = false;
  if tot_n1 <> tot_n0 or tot_s1 <> tot_s0 then
    raise exception 'GLOBAL: total do cliente mudou (% / % -> % / %)', tot_n0, tot_s0, tot_n1, tot_s1;
  end if;

  raise notice 'NJ-LEGADO-ADM-01b ok: % lancamentos, R$ %', v_col, v_s;
end $lote$;
