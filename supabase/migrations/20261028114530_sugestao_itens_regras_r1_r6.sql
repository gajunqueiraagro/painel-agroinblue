-- SUGESTAO-ITENS-03 (Gabriel 27/11: R1–R6 aprovadas; D1 = comida → Cantina, limpeza/higiene → Casa Sede) — lote 114530 · Code 2
-- A escada única da sugestão pelos itens (`fn_itens_sugerir_conta`, lote 114360) com as regras medidas contra o que o operador classificou:
--   R1 a regra do item (a correção do operador) segue em 1º;           R2 o fornecedor CONSISTENTE (>= 3 em 12 meses, >= 80% numa conta) vem logo
--   depois do "mesmo produto";  R3 o NCM no cliente só na MESMA atividade e com 3+ usos;  R4 comida no atacado/granel ou de fornecedor de
--   nutrição → nutrição do rebanho (nunca cantina);  R5 "defensivo" doméstico (aerossol, ML, desinfetante) → limpeza;  R6 gasolina/etanol →
--   veículo (Viagens e Deslocamentos / Combustível Veículos), diesel segue em máquinas;  D1 limpeza/higiene/copa → Despesas Casa Sede.
--   O detergente de ORDENHA (Gabriel 13:4x): as 5 bases/Maxbrio das notas → regra do item → "Outras Desp. Administrativas Pecuária" (o plano
--   não tem conta de ordenha); a família limpeza manda o resto do 3402 para a Casa Sede.
-- A escada passa a receber a UNIDADE e a QUANTIDADE do item (a casca da nota gravada as lê de nota_fiscal_itens).
-- Guardas: o md5 das duas funções lidas em 27/11; prefixo de outra família = recusa; contas conferidas pelo NOME.
-- DESFAZER: as funções voltam ao texto do lote 114360 (arquivo); produto_ncm_familia 271012/220710 voltam a 'combustivel'; as famílias
--   'limpeza' e 'combustivel_veiculo' ficam inativas (ativo = false); as 5 regras do item: fn_item_regra_desfazer.

select set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
select set_config('app.via', 'lote 114530', true);

do $$
begin
  if md5(pg_get_functiondef('public.fn_itens_sugerir_conta(uuid,text,text,date,jsonb,uuid,uuid)'::regprocedure)) <> '0bf00ebe78d1d6b5eee7262a14f0df3d'
     or md5(pg_get_functiondef('public.fn_nota_itens_sugerir_conta(uuid)'::regprocedure)) <> '9a92a1450942256c676f32a61567d51c' then
    raise exception 'a escada mudou desde a leitura de 27/11 (md5): reler antes de aplicar';
  end if;
end $$;

-- 1. o mapa: R6 (gasolina e etanol viram combustível de VEÍCULO) e D1 (a família limpeza/higiene/copa)
do $$
declare v_conflito text;
begin
  with ant as (select * from public.produto_ncm_familia where prefixo in ('271012', '220710') and familia = 'combustivel' for update),
  upd as (update public.produto_ncm_familia f set familia = 'combustivel_veiculo', atualizado_em = now() from ant where f.prefixo = ant.prefixo returning f.*)
  insert into public.produto_classificacao_trilha (via, objeto, chave, acao, antes, depois, motivo)
  select 'sistema:lote 114530', 'ncm_familia', upd.prefixo, 'alterar', to_jsonb(ant), to_jsonb(upd), 'R6 (Gabriel 27/11): gasolina/etanol = combustível de veículo'
    from upd join ant on ant.prefixo = upd.prefixo;
  if (select count(*) from public.produto_ncm_familia where prefixo in ('271012', '220710') and familia = 'combustivel_veiculo') <> 2 then
    raise exception 'gasolina/etanol não estão como esperado: reler antes de aplicar';
  end if;

  create temp table _limpeza(prefixo text primary key) on commit drop;
  insert into _limpeza values ('3401'), ('3402'), ('3405'), ('3809'), ('2828'), ('4818'), ('9603'), ('7323'), ('3306'), ('3605');
  select string_agg(f.prefixo || '=' || f.familia, ', ') into v_conflito from _limpeza n join public.produto_ncm_familia f on f.prefixo = n.prefixo and f.familia <> 'limpeza';
  if v_conflito is not null then raise exception 'prefixo NCM já é de outra família: %', v_conflito; end if;
  with ins as (insert into public.produto_ncm_familia (prefixo, familia, ativo, atualizado_em) select prefixo, 'limpeza', true, now() from _limpeza
               on conflict (prefixo) do nothing returning *)
  insert into public.produto_classificacao_trilha (via, objeto, chave, acao, depois, motivo)
  select 'sistema:lote 114530', 'ncm_familia', ins.prefixo, 'criar', to_jsonb(ins), 'D1 (Gabriel 27/11): limpeza/higiene/copa → Casa Sede' from ins;
end $$;

-- 2. as contas das famílias novas (o plano padrão; conferidas pelo nome)
do $$
declare v_n int;
begin
  create temp table _contas2(familia text, escopo text, plano uuid, nome text) on commit drop;
  insert into _contas2 values
    ('limpeza', 'pecuaria', '5720d583-7ab5-4cb1-92f2-66a08106f3f7', 'Despesas Casa Sede Pecuária'),
    ('combustivel_veiculo', 'pecuaria', '8db07b50-2b04-4102-b619-3cb51ba30703', 'Viagens e Deslocamentos Pecuária'),
    ('combustivel_veiculo', 'agricultura', 'b9f49b1e-84a3-4c7e-83d7-d98e9f4f0681', 'Viagens e Deslocamentos Agricultura'),
    ('combustivel_veiculo', 'administrativo', '62c6a0a4-0713-43b6-a736-f4d5f3bf0897', 'Combustível Veículos Administrativo'),
    ('combustivel_veiculo', 'silvicultura', '8ea1edb2-9b3d-4b77-8cfd-c995d59f37d8', 'Combustível Máquinas Silvicultura');
  select count(*) into v_n from _contas2 c join public.financeiro_plano_contas pc on pc.id = c.plano and pc.subcentro = c.nome and pc.cliente_id is null
    and pc.ativo and pc.tipo_operacao = '2-Saídas' and pc.escopo_negocio = c.escopo;
  if v_n <> 5 then raise exception 'contas das famílias não conferem pelo nome (% de 5)', v_n; end if;
  if exists (select 1 from public.produto_familia_conta fc join _contas2 c on c.familia = fc.familia and c.escopo = fc.escopo_negocio) then
    raise exception 'já existe conta para uma das famílias novas: reler antes de aplicar';
  end if;
  with ins as (insert into public.produto_familia_conta (familia, escopo_negocio, plano_conta_id, ativo, atualizado_em)
               select familia, escopo, plano, true, now() from _contas2 returning *)
  insert into public.produto_classificacao_trilha (via, objeto, chave, acao, depois, motivo)
  select 'sistema:lote 114530', 'familia_conta', ins.familia || '/' || ins.escopo_negocio, 'criar', to_jsonb(ins), 'SUGESTAO-ITENS-03 R6/D1 (Gabriel 27/11)' from ins;
end $$;

-- 3. a escada com R2–R5 (e a unidade/quantidade do item)
create or replace function public.fn_itens_sugerir_conta(
  p_cliente_id uuid,
  p_emitente_documento text,
  p_dest_ie text,
  p_emissao date,
  p_itens jsonb,            -- [{item_id?, n_item, codigo, descricao, ncm}]
  p_favorecido_id uuid default null,
  p_nota_id uuid default null)  -- a própria nota (gravada) sai do histórico
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_doc text := nullif(regexp_replace(coalesce(p_emitente_documento, ''), '\D', '', 'g'), '');
  v_tipo text; v_faz uuid; v_faz_n int; v_escopo text; v_parte numeric; v_escopo_fonte text;
  v_desde date := coalesce(p_emissao, current_date) - 730;
  v_forn uuid := p_favorecido_id; v_forn_n int;
  v_f_plano uuid; v_f_sub text; v_f_data date;
  v_f_top int; v_f_total int; v_f_consistente boolean := false; v_forn_nome text;
  v_itens jsonb;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.', detail = coalesce(p_cliente_id::text, '');
  end if;
  if jsonb_typeof(coalesce(p_itens, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Os itens da nota vieram num formato que não sei ler.';
  end if;
  v_tipo := public._fn_nota_tipo_operacao(p_cliente_id, v_doc);

  -- a fazenda pela IE do destinatário (uma só, senão nenhuma)
  select min(fc.fazenda_id::text)::uuid, count(distinct fc.fazenda_id) into v_faz, v_faz_n
    from public.fazenda_cadastros fc
   where fc.cliente_id = p_cliente_id
     and nullif(regexp_replace(coalesce(fc.ie, ''), '\D', '', 'g'), '') = nullif(regexp_replace(coalesce(p_dest_ie, ''), '\D', '', 'g'), '');
  if v_faz_n <> 1 then v_faz := null; end if;

  -- a atividade (como antes): fazenda administrativa = administrativo; senão a mais frequente em 24 meses
  if v_faz is not null and exists (select 1 from public.fazendas f where f.id = v_faz and f.eh_administrativa) then
    v_escopo := 'administrativo'; v_parte := 1; v_escopo_fonte := 'fazenda';
  else
    select x.e, x.parte into v_escopo, v_parte from (
      select l.escopo_negocio e, count(*)::numeric / sum(count(*)) over () parte
        from public.financeiro_lancamentos_v2 l
       where l.cliente_id = p_cliente_id and (v_faz is null or l.fazenda_id = v_faz) and l.cancelado is not true and l.cenario = 'realizado'
         and l.escopo_negocio in ('agricultura', 'pecuaria', 'silvicultura') and coalesce(l.data_competencia, l.data_pagamento) >= v_desde
       group by 1) x
     order by x.parte desc, x.e limit 1;
    v_escopo_fonte := case when v_escopo is null then null when v_faz is null then 'cliente' else 'fazenda' end;
  end if;

  -- o fornecedor: o informado; senão pelo documento (um só no cliente)
  if v_forn is null and v_doc is not null then
    select min(f.id::text)::uuid, count(*) into v_forn, v_forn_n from public.financeiro_fornecedores f
     where f.cliente_id = p_cliente_id
       and (regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') = v_doc or regexp_replace(coalesce(f.documento, ''), '\D', '', 'g') = v_doc);
    if v_forn_n <> 1 then v_forn := null; end if;
  end if;

  -- o ÚLTIMO DESTE FORNECEDOR (a regra que a tela usava, agora aqui): a conta mais usada nos 12 meses até o último lançamento do
  -- mesmo tipo; empate = a mais recente; só conta ativa e que serve para a nota
  if v_forn is not null then
    with f as (
      select l.plano_conta_id plano, l.data_competencia d,
             row_number() over (order by l.data_competencia desc, l.created_at desc) rn
        from public.financeiro_lancamentos_v2 l
        join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id and pc.ativo and pc.tipo_operacao = v_tipo
                                              and (pc.cliente_id is null or pc.cliente_id = p_cliente_id)
       where l.cliente_id = p_cliente_id and l.favorecido_id = v_forn and l.cancelado = false and l.tipo_operacao = v_tipo
         and l.subcentro is not null and l.data_competencia is not null
       order by l.data_competencia desc, l.created_at desc
       limit 200),
    u as (select max(d) ult from f),
    c as (select f.plano, count(*) n, min(f.rn) primeira from f, u where f.d >= (u.ult - interval '1 year')::date group by f.plano)
    select c.plano, u.ult, c.n, (select sum(c2.n) from c c2) into v_f_plano, v_f_data, v_f_top, v_f_total from c, u order by c.n desc, c.primeira limit 1;
    select pc.subcentro into v_f_sub from public.financeiro_plano_contas pc where pc.id = v_f_plano;
    -- R2 (27/11): o fornecedor CONSISTENTE (>= 3 lançamentos em 12 meses e >= 80% numa conta) sobe para logo depois do "mesmo produto"
    v_f_consistente := coalesce(v_f_total, 0) >= 3 and v_f_top::numeric / nullif(v_f_total, 0) >= 0.8;
    select f.nome into v_forn_nome from public.financeiro_fornecedores f where f.id = v_forn;
  end if;

  with it as (
    select nullif(x->>'item_id', '')::uuid item_id,
           coalesce(nullif(x->>'n_item', '')::int, t.ord::int) n_item,
           nullif(btrim(x->>'codigo'), '') cod,
           public._fn_normalizar_texto(x->>'descricao') dnorm,
           public._fn_produto_chave(x->>'codigo', x->>'descricao') chave,
           regexp_replace(coalesce(x->>'ncm', ''), '\D', '', 'g') ncm,
           upper(btrim(coalesce(x->>'unidade', ''))) un,
           case when coalesce(x->>'quantidade', '') ~ '^[0-9]+([.][0-9]+)?$' then (x->>'quantidade')::numeric end qtd
      from jsonb_array_elements(p_itens) with ordinality t(x, ord)
  ),
  valida as (
    select pc.id, pc.escopo_negocio esc from public.financeiro_plano_contas pc
     where pc.ativo and pc.tipo_operacao = v_tipo and (pc.cliente_id is null or pc.cliente_id = p_cliente_id)
  ),
  -- (1) regra do item (a resposta lembrada: fn_item_regra_gravar)
  a0 as (
    select distinct on (it.n_item) it.n_item, r.plano_conta_id plano
      from it
      join public.financeiro_classificacao_regras r on r.cliente_id = p_cliente_id and r.ativo and r.origem = 'item_da_nota'
                                                   and r.cond_fornecedor = v_doc and r.cond_produto = it.chave
      join valida v on v.id = r.plano_conta_id
     order by it.n_item, r.updated_at desc nulls last, r.created_at desc
  ),
  -- o histórico POR ITEM do cliente: a parte que leva o item, ou o lançamento de nota de UM item só (D1)
  hist as (
    select hn.id nota_id, hn.emitente_documento cnpj, nullif(btrim(hi.codigo), '') cod, public._fn_normalizar_texto(hi.descricao) dnorm,
           regexp_replace(coalesce(hi.ncm, ''), '\D', '', 'g') ncm, hn.emissao, coalesce(pp.plano_conta_id, l.plano_conta_id) plano
      from public.nota_fiscal hn
      join public.nota_fiscal_itens hi on hi.nota_id = hn.id
      join public.financeiro_lancamento_documentos d on d.cliente_id = hn.cliente_id and d.cancelado is not true
           and ((hn.chave_acesso is not null and d.chave_acesso = hn.chave_acesso)
                or (hn.modelo = 'nfse_municipal' and public._fn_nota_casa_documento(hn, d)))
      join public.financeiro_lancamentos_v2 l on l.id = d.lancamento_id and l.cancelado is not true and l.cenario = 'realizado'
      left join public.financeiro_lancamento_partes pp on pp.lancamento_id = l.id and pp.nota_itens @> to_jsonb(hi.n_item)
     where hn.cliente_id = p_cliente_id
       and (p_nota_id is null or hn.id <> p_nota_id)
       and (pp.id is not null
            or (not exists (select 1 from public.financeiro_lancamento_partes p2 where p2.lancamento_id = l.id)
                and (select count(*) from public.nota_fiscal_itens h2 where h2.nota_id = hn.id) = 1))
       and (nullif(btrim(hi.codigo), '') in (select cod from it)
            or public._fn_normalizar_texto(hi.descricao) in (select dnorm from it)
            or left(regexp_replace(coalesce(hi.ncm, ''), '\D', '', 'g'), 4) in (select left(ncm, 4) from it where length(ncm) >= 4))
  ),
  hist_ok as (select h.* from hist h join valida v on v.id = h.plano),
  -- (2) mesmo produto: código do MESMO fornecedor; senão a descrição. O mais RECENTE vence; empate = o mais usado
  a_cod as (
    select it.n_item, h.plano, count(distinct h.nota_id) usos, max(h.emissao) ultima
      from it join hist_ok h on it.cod is not null and h.cod = it.cod and h.cnpj = v_doc group by 1, 2
  ),
  a_desc as (
    select it.n_item, h.plano, count(distinct h.nota_id) usos, max(h.emissao) ultima
      from it join hist_ok h on it.dnorm is not null and h.dnorm = it.dnorm
     where not exists (select 1 from a_cod c where c.n_item = it.n_item) group by 1, 2
  ),
  a_cand as (select *, 'codigo'::text via from a_cod union all select *, 'descricao'::text from a_desc),
  a as (
    select distinct on (n_item) n_item, plano, usos, ultima, via, count(*) over (partition by n_item) contas
      from a_cand order by n_item, ultima desc nulls last, usos desc, plano
  ),
  -- a família NCM do item (o prefixo mais longo) e as contas dela na atividade
  fam0 as (
    select distinct on (it.n_item) it.n_item, f.familia
      from it join public.produto_ncm_familia f on f.ativo and it.ncm like f.prefixo || '%'
     order by it.n_item, length(f.prefixo) desc
  ),
  -- R4: comida comprada no ATACADO/GRANEL ou de fornecedor de nutrição animal é do rebanho, nunca cantina; R5: o "defensivo" doméstico
  -- (aerossol, ML, inseticida de casa, desinfetante) é limpeza, nunca vacina
  fam as (
    select fam0.n_item,
           case when fam0.familia = 'alimento' and (it.un in ('T', 'TON', 'TN', 'TL', 'SC', 'SACO', 'BAG') or (it.un in ('KG', 'KGS') and coalesce(it.qtd, 0) >= 25)
                       or it.dnorm like '%granel%' or coalesce(public._fn_normalizar_texto(v_forn_nome), '') ~ '(nutri|racoes|racao|cereal|armazem)') then 'nutricao_animal'
                when fam0.familia = 'defensivo' and (it.un = 'ML' or it.dnorm ~ '[0-9]+ ?ml' or it.dnorm ~ '(aerossol|baygon|raid|sbp|repelente|barata|pinho|desinfet|domestic)') then 'limpeza'
                else fam0.familia end familia
      from fam0 join it on it.n_item = fam0.n_item
  ),
  c as (
    select fam.n_item, fam.familia, fc.plano_conta_id plano, vo.id plano_obra
      from fam
      join public.produto_familia_conta fc on fc.ativo and fc.familia = fam.familia and fc.escopo_negocio = v_escopo
      join valida v on v.id = fc.plano_conta_id
      left join valida vo on vo.id = fc.plano_conta_obra_id
  ),
  -- (3) NCM no cliente: itens com o mesmo NCM (8 dígitos; senão 4, com 2 usos ou mais) já classificados por item. Família que PERGUNTA
  --     não entra aqui.
  -- R3: o NCM no cliente só na MESMA atividade da nota e com 3+ usos
  n8 as (
    select it.n_item, h.plano, count(distinct h.nota_id) usos, max(h.emissao) ultima, it.ncm chave
      from it join hist_ok h on length(it.ncm) = 8 and h.ncm = it.ncm
      join valida ve on ve.id = h.plano and (v_escopo is null or ve.esc = v_escopo)
     group by 1, 2, 5 having count(distinct h.nota_id) >= 3
  ),
  n4 as (
    select it.n_item, h.plano, count(distinct h.nota_id) usos, max(h.emissao) ultima, left(it.ncm, 4) chave
      from it join hist_ok h on length(it.ncm) >= 4 and left(h.ncm, 4) = left(it.ncm, 4)
      join valida ve on ve.id = h.plano and (v_escopo is null or ve.esc = v_escopo)
     where not exists (select 1 from n8 where n8.n_item = it.n_item) group by 1, 2, 5
    having count(distinct h.nota_id) >= 3
  ),
  n as (
    select distinct on (x.n_item) x.n_item, x.plano, x.usos, x.chave
      from (select * from n8 union all select * from n4) x
     where not exists (select 1 from c where c.n_item = x.n_item and c.plano_obra is not null)
     order by x.n_item, x.usos desc, x.ultima desc nulls last, x.plano
  ),
  res as (
    select it.item_id, it.n_item,
           case when a0.n_item is not null then 'regra'
                when a.n_item is not null then 'mesmo_produto'
                when v_f_consistente and v_f_plano is not null and not (c.n_item is not null and c.plano_obra is not null) then 'fornecedor'
                when n.n_item is not null then 'ncm_cliente'
                when c.n_item is not null and c.plano_obra is not null then 'familia_pergunta'
                when c.n_item is not null then 'familia'
                when v_f_plano is not null then 'fornecedor' end fonte,
           case when a0.n_item is not null then a0.plano
                when a.n_item is not null then a.plano
                when v_f_consistente and v_f_plano is not null and not (c.n_item is not null and c.plano_obra is not null) then v_f_plano
                when n.n_item is not null then n.plano
                when c.n_item is not null and c.plano_obra is not null then null
                when c.n_item is not null then c.plano
                else v_f_plano end plano,
           a.usos, a.contas, a.via, a.ultima, n.usos n_usos, n.chave n_chave, c.familia, c.plano c_manut, c.plano_obra c_obra
      from it
      left join a0 on a0.n_item = it.n_item
      left join a on a.n_item = it.n_item
      left join n on n.n_item = it.n_item
      left join c on c.n_item = it.n_item
  ),
  rot as (
    select r.*, case r.familia when 'nutricao_animal' then 'nutrição animal' when 'sanidade_animal' then 'sanidade animal'
                     when 'combustivel' then 'combustível' when 'construcao' then 'construção' when 'agua' then 'água'
                     when 'eletrica' then 'elétrica' when 'combustivel_veiculo' then 'combustível de veículo'
                     else replace(r.familia, '_', ' ') end fam_rot
      from res r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', r.item_id, 'n_item', r.n_item, 'plano_conta_id', r.plano, 'subcentro', pc.subcentro,
           'fonte', coalesce(r.fonte, 'sem_sugestao'),
           'pergunta', r.fonte = 'familia_pergunta',
           'opcoes', case when r.fonte = 'familia_pergunta' then jsonb_build_object(
                       'manutencao', jsonb_build_object('plano_conta_id', r.c_manut, 'subcentro', pm.subcentro),
                       'obra', jsonb_build_object('plano_conta_id', r.c_obra, 'subcentro', po.subcentro)) end,
           'confianca', case r.fonte when 'regra' then 'alta'
                          when 'mesmo_produto' then case when r.contas = 1 and r.usos >= 2 then 'alta' else 'media' end
                          when 'ncm_cliente' then case when r.n_usos >= 2 then 'media' else 'baixa' end
                          when 'familia' then case when v_escopo_fonte = 'fazenda' and v_parte >= 0.8 then 'media' else 'baixa' end
                          when 'fornecedor' then 'baixa' end,
           'origem', case r.fonte when 'regra' then 'regra sua'
                       when 'mesmo_produto' then 'mesmo produto em ' || to_char(r.ultima, case when extract(year from r.ultima) = extract(year from coalesce(p_emissao, current_date)) then 'DD/MM' else 'DD/MM/YY' end)
                       when 'ncm_cliente' then 'NCM ' || left(r.n_chave, 4) || ' · ' || r.n_usos || '× no cliente'
                       when 'familia_pergunta' then r.fam_rot || ' · obra ou manutenção?'
                       when 'familia' then 'família ' || r.fam_rot
                       when 'fornecedor' then case when v_f_consistente then 'fornecedor (sempre nesta conta)' else 'último deste fornecedor' end end,
           'porque', case r.fonte
                       when 'regra' then 'Regra sua: este produto deste fornecedor vai para esta conta.'
                       when 'mesmo_produto' then 'O mesmo produto' || case when r.via = 'descricao' then ' (pela descrição)' else '' end
                            || ' já foi classificado item a item ' || r.usos || '× neste cliente; o mais recente em ' || to_char(r.ultima, 'DD/MM/YYYY')
                            || case when r.contas > 1 then '. Já foi para outras contas — confira.' else '.' end
                       when 'ncm_cliente' then 'Itens com o mesmo NCM (' || r.n_chave || ') já foram para esta conta ' || r.n_usos || '× neste cliente.'
                       when 'familia_pergunta' then 'Material de ' || r.fam_rot || ': obra/reforma vai para o investimento (' || coalesce(po.subcentro, '?')
                            || '); manutenção vai para o custeio (' || coalesce(pm.subcentro, '?') || '). Escolha na linha do item.'
                       when 'familia' then 'Pelo NCM (' || r.fam_rot || ') e a atividade ' || case when v_escopo_fonte = 'fazenda' then 'da fazenda' else 'do cliente — confira' end || '.'
                       when 'fornecedor' then 'Nenhum item conhecido: a conta mais usada deste fornecedor nos 12 meses até o último lançamento (' || to_char(v_f_data, 'DD/MM/YYYY') || ').'
                       else 'Sem sugestão: escolha a conta.' end,
           'pede_ia', r.fonte is null
         ) order by r.n_item), '[]'::jsonb)
    into v_itens
    from rot r
    left join public.financeiro_plano_contas pc on pc.id = r.plano
    left join public.financeiro_plano_contas pm on pm.id = r.c_manut
    left join public.financeiro_plano_contas po on po.id = r.c_obra;

  return jsonb_build_object('ok', true, 'tipo_operacao', v_tipo, 'fazenda_id', v_faz, 'escopo', v_escopo, 'escopo_fonte', v_escopo_fonte,
    'fornecedor_id', v_forn,
    'fornecedor', case when v_f_plano is not null then jsonb_build_object('plano_conta_id', v_f_plano, 'subcentro', v_f_sub, 'ultimo', v_f_data) end,
    'itens', v_itens);
end $function$;


-- 4. a casca da nota gravada: a mesma escada, agora com a unidade e a quantidade do item
create or replace function public.fn_nota_itens_sugerir_conta(p_nota_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare n public.nota_fiscal%rowtype; v_itens jsonb;
begin
  select * into n from public.nota_fiscal where id = p_nota_id;
  if n.id is null or not coalesce(public.tenant_ok(n.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta nota.', detail = coalesce(p_nota_id::text, '');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'n_item', i.n_item, 'codigo', i.codigo, 'descricao', i.descricao, 'ncm', i.ncm,
                                         'unidade', i.unidade, 'quantidade', i.quantidade)
           order by i.n_item), '[]'::jsonb)
    into v_itens from public.nota_fiscal_itens i where i.nota_id = n.id;
  return public.fn_itens_sugerir_conta(n.cliente_id, n.emitente_documento, n.dest_ie, n.emissao, v_itens, null, n.id)
         || jsonb_build_object('nota_id', n.id);
end $function$;

-- 5. o detergente de ORDENHA (decisão do Gabriel 27/11): as 5 bases/Maxbrio das notas viram regra do item → Outras Desp. Administrativas Pecuária
do $$
declare v jsonb; r record; n int := 0;
begin
  if (select count(*) from public.financeiro_plano_contas where id = 'e8689db2-03ad-4eeb-a865-1471fe74d122' and subcentro = 'Outras Desp. Administrativas Pecuária' and ativo) <> 1 then
    raise exception 'a conta Outras Desp. Administrativas Pecuária não confere';
  end if;
  for r in select i.id from public.nota_fiscal_itens i
            where i.id in ('58d8ec09-8dfd-4b53-a0b8-bed5f13a799f', '160003ca-7fd4-4c20-aaf8-c4f3608192df', 'e8e14593-0eb6-45c4-a64a-a9834a953f7f',
                           'edaaa7d2-91ee-427d-adb0-0628f02cf2fa', '2381239e-3b49-42e5-adf5-275e51ec918a')
              and (i.descricao ~* '^base (acida|alcalina|neutra)' or i.descricao ~* 'maxbrio') loop
    v := public.fn_item_regra_gravar(r.id, 'e8689db2-03ad-4eeb-a865-1471fe74d122', 'Detergente de ordenha (Gabriel 27/11): custeio da ordenha, sem conta própria no plano', false);
    n := n + 1;
  end loop;
  if n <> 5 then raise exception 'os 5 itens de ordenha não conferem (% de 5)', n; end if;
end $$;
