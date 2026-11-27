-- NOTA-ITENS-SUGESTAO / NOTA-ITENS-CLASSIF-02 (Gabriel 27/11) — lote 114360 · Code 2
-- A SUGESTÃO DA CONTA PELOS ITENS DA NOTA, com DONO ÚNICO para todos os caminhos que nascem de nota (Novo · do XML, Criar pelo extrato,
-- Caixa "Lançar nota", Ler a NF / Notas da Receita e o "+ Da nota" com a nota já gravada).
--   1. fn_itens_sugerir_conta(...)  — a escada; recebe os ITENS (a nota ainda NÃO gravada também serve).
--   2. fn_nota_itens_sugerir_conta(uuid) — continua com a mesma assinatura e só chama a de cima (a nota gravada).
--   3. Escada por item: regra do item > mesmo produto (classificado POR ITEM; o mais recente vence) > NCM no cliente > família NCM
--      > último deste fornecedor > nada.
--      D1: o lançamento INTEIRO de nota com vários itens deixa de valer como "mesmo produto" (foi o que contaminou a NF 15.260).
--      D2: saem "o resto desta nota" e "outros clientes".
--   4. I1: as famílias construção, cerca, água e elétrica NÃO decidem sozinhas: devolvem as DUAS contas (manutenção × obra/reforma =
--      investimento) e "pergunta": a tela pergunta e o operador escolhe. A escolha vira regra do item pelo escritor que já existe
--      (fn_item_regra_gravar), e na próxima nota o mesmo produto já vem decidido (Q3).
--   Nada é gravado em lançamento; nenhuma conta do plano muda. Leitura: STABLE.

-- 0. GUARDA — as duas funções trocadas são as que foram lidas em 27/11
do $$
begin
  if md5(pg_get_functiondef('public.fn_nota_itens_sugerir_conta(uuid)'::regprocedure)) <> '349c8a822480a1473f1cce3d03fb2778' then
    raise exception 'fn_nota_itens_sugerir_conta mudou desde a leitura de 27/11 (md5): reler antes de aplicar o lote 114360';
  end if;
  if md5(pg_get_functiondef('public._fn_produto_familia_conta_guarda()'::regprocedure)) <> 'b09ba66ddb9340199c62ea165d486d9a' then
    raise exception '_fn_produto_familia_conta_guarda mudou desde a leitura de 27/11 (md5): reler antes de aplicar o lote 114360';
  end if;
end $$;

-- 1. a conta de OBRA/REFORMA (investimento) da família que pergunta
alter table public.produto_familia_conta add column if not exists plano_conta_obra_id uuid references public.financeiro_plano_contas(id);
comment on column public.produto_familia_conta.plano_conta_obra_id is
  'I1 (Gabriel 27/11): preenchida = a família PERGUNTA "obra/reforma (esta conta, investimento) ou manutenção (plano_conta_id)?"; nula = decide sozinha.';

create or replace function public._fn_produto_familia_conta_guarda()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if not exists (select 1 from public.financeiro_plano_contas pc where pc.id = new.plano_conta_id and pc.cliente_id is null and pc.ativo
                   and pc.tipo_operacao = '2-Saídas' and pc.escopo_negocio = new.escopo_negocio) then
    raise exception using errcode = '23514', message = 'A conta da família precisa ser do plano padrão, ativa, de saída e da mesma atividade.',
      detail = new.plano_conta_id::text;
  end if;
  if new.plano_conta_obra_id is not null and not exists (
       select 1 from public.financeiro_plano_contas pc where pc.id = new.plano_conta_obra_id and pc.cliente_id is null and pc.ativo
         and pc.tipo_operacao = '2-Saídas' and pc.escopo_negocio = new.escopo_negocio) then
    raise exception using errcode = '23514', message = 'A conta de obra da família precisa ser do plano padrão, ativa, de saída e da mesma atividade.',
      detail = new.plano_conta_obra_id::text;
  end if;
  return new;
end $function$;

-- 2. as 4 famílias NCM novas (lista do PLANO-INVEST-INFRA-01 FASE 0, Code 4) — prefixo já usado por outra família = recusa
do $$
declare v_conflito text;
begin
  with novas(prefixo, familia) as (values
    ('2523','construcao'),('2505','construcao'),('2517','construcao'),('6810','construcao'),('6811','construcao'),('6901','construcao'),
    ('6904','construcao'),('6905','construcao'),('6907','construcao'),('7214','construcao'),('7308','construcao'),('7610','construcao'),
    ('4407','construcao'),('4418','construcao'),
    ('7217','cerca'),('7313','cerca'),('7314','cerca'),('4403','cerca'),('4404','cerca'),('7326','cerca'),
    ('3917','agua'),('7306','agua'),('8413','agua'),('8481','agua'),
    ('8544','eletrica'),('8536','eletrica'),('8541','eletrica'))
  select string_agg(f.prefixo || '=' || f.familia, ', ') into v_conflito
    from novas n join public.produto_ncm_familia f on f.prefixo = n.prefixo and f.familia <> n.familia;
  if v_conflito is not null then raise exception 'prefixo NCM já é de outra família: %', v_conflito; end if;

  with novas(prefixo, familia) as (values
    ('2523','construcao'),('2505','construcao'),('2517','construcao'),('6810','construcao'),('6811','construcao'),('6901','construcao'),
    ('6904','construcao'),('6905','construcao'),('6907','construcao'),('7214','construcao'),('7308','construcao'),('7610','construcao'),
    ('4407','construcao'),('4418','construcao'),
    ('7217','cerca'),('7313','cerca'),('7314','cerca'),('4403','cerca'),('4404','cerca'),('7326','cerca'),
    ('3917','agua'),('7306','agua'),('8413','agua'),('8481','agua'),
    ('8544','eletrica'),('8536','eletrica'),('8541','eletrica')),
  ins as (
    insert into public.produto_ncm_familia (prefixo, familia, ativo, atualizado_em)
    select prefixo, familia, true, now() from novas on conflict (prefixo) do nothing returning *)
  insert into public.produto_classificacao_trilha (via, objeto, chave, acao, depois, motivo)
  select 'sistema:lote 114360', 'ncm_familia', ins.prefixo, 'criar', to_jsonb(ins), 'NOTA-ITENS-SUGESTAO (Gabriel 27/11): família nova que pergunta obra × manutenção'
    from ins;
end $$;

-- 3. família × atividade → manutenção (plano_conta_id) e obra (plano_conta_obra_id). Conferido pelo NOME (id trocado = recusa).
--    Água e elétrica: a obra vai para "Investimento em Instalações" até as contas novas do PLANO-INVEST-INFRA-01 (Code 4) existirem.
--    Silvicultura e administrativo: sem conta de manutenção no plano padrão → sem sugestão por família (fica no fornecedor).
do $$
declare v_n int;
begin
  with m(familia, escopo, manut_id, manut_nome, obra_id, obra_nome) as (values
    ('construcao','pecuaria',   'cdf2efa2-5735-499f-8a85-5ae0b0d0123a'::uuid,'Manutenção de Instalações Pecuária',      'f4fec107-569a-42a1-b413-bf133474c7fa'::uuid,'Investimento em Instalações Pecuária'),
    ('construcao','agricultura','adf093ad-80b1-4f57-8aa7-cdaed6365565'::uuid,'Manutenção de Instalações Agricultura',    'eca4260f-f596-413c-93db-6c558a58ff40'::uuid,'Investimento em Instalações Agricultura'),
    ('cerca',     'pecuaria',   '3441770b-a482-4a7e-ab4a-70cacaf331b0'::uuid,'Manutenção de Cercas Pecuária',           '9b10cc50-858a-4fa4-94c9-337e8258f81f'::uuid,'Investimento em Cercas Pecuária'),
    ('cerca',     'agricultura','0b29a824-c334-4a06-a522-7ee763154f8d'::uuid,'Manutenção de Cercas Agricultura',         '3ca87aff-aad4-49bd-965c-73dced44c430'::uuid,'Investimento em Cercas Agricultura'),
    ('agua',      'pecuaria',   '0dd30c4d-c97c-4bfe-b0a2-cc5c85d30aed'::uuid,'Manutenção Rede Hidráulica Pecuária',      'f4fec107-569a-42a1-b413-bf133474c7fa'::uuid,'Investimento em Instalações Pecuária'),
    ('agua',      'agricultura','7c4056f8-41ae-47fe-87dd-9eba53fb5122'::uuid,'Manutenção Rede Hidráulica Agricultura',   'eca4260f-f596-413c-93db-6c558a58ff40'::uuid,'Investimento em Instalações Agricultura'),
    ('eletrica',  'pecuaria',   'b508934e-7b34-4987-a616-3a47aa8731c7'::uuid,'Manutenção de Rede Elétrica Pecuária',     'f4fec107-569a-42a1-b413-bf133474c7fa'::uuid,'Investimento em Instalações Pecuária'),
    ('eletrica',  'agricultura','885761c9-5b68-4c12-b801-5c7f1e1185de'::uuid,'Manutenção de Rede Elétrica Agricultura',  'eca4260f-f596-413c-93db-6c558a58ff40'::uuid,'Investimento em Instalações Agricultura'))
  select count(*) into v_n from m
    join public.financeiro_plano_contas a on a.id = m.manut_id and a.subcentro = m.manut_nome and a.cliente_id is null and a.escopo_negocio = m.escopo
    join public.financeiro_plano_contas b on b.id = m.obra_id  and b.subcentro = m.obra_nome  and b.cliente_id is null and b.escopo_negocio = m.escopo;
  if v_n <> 8 then raise exception 'contas das famílias não conferem pelo nome (% de 8)', v_n; end if;
  if exists (select 1 from public.produto_familia_conta where familia in ('construcao','cerca','agua','eletrica')) then
    raise exception 'já existe conta para as famílias novas: reler antes de aplicar';
  end if;

  with m(familia, escopo, manut_id, obra_id) as (values
    ('construcao','pecuaria',   'cdf2efa2-5735-499f-8a85-5ae0b0d0123a'::uuid,'f4fec107-569a-42a1-b413-bf133474c7fa'::uuid),
    ('construcao','agricultura','adf093ad-80b1-4f57-8aa7-cdaed6365565'::uuid,'eca4260f-f596-413c-93db-6c558a58ff40'::uuid),
    ('cerca',     'pecuaria',   '3441770b-a482-4a7e-ab4a-70cacaf331b0'::uuid,'9b10cc50-858a-4fa4-94c9-337e8258f81f'::uuid),
    ('cerca',     'agricultura','0b29a824-c334-4a06-a522-7ee763154f8d'::uuid,'3ca87aff-aad4-49bd-965c-73dced44c430'::uuid),
    ('agua',      'pecuaria',   '0dd30c4d-c97c-4bfe-b0a2-cc5c85d30aed'::uuid,'f4fec107-569a-42a1-b413-bf133474c7fa'::uuid),
    ('agua',      'agricultura','7c4056f8-41ae-47fe-87dd-9eba53fb5122'::uuid,'eca4260f-f596-413c-93db-6c558a58ff40'::uuid),
    ('eletrica',  'pecuaria',   'b508934e-7b34-4987-a616-3a47aa8731c7'::uuid,'f4fec107-569a-42a1-b413-bf133474c7fa'::uuid),
    ('eletrica',  'agricultura','885761c9-5b68-4c12-b801-5c7f1e1185de'::uuid,'eca4260f-f596-413c-93db-6c558a58ff40'::uuid)),
  ins as (
    insert into public.produto_familia_conta (familia, escopo_negocio, plano_conta_id, plano_conta_obra_id, ativo, atualizado_em)
    select familia, escopo, manut_id, obra_id, true, now() from m returning *)
  insert into public.produto_classificacao_trilha (via, objeto, chave, acao, depois, motivo)
  select 'sistema:lote 114360', 'familia_conta', ins.familia || '/' || ins.escopo_negocio, 'criar', to_jsonb(ins),
         'NOTA-ITENS-SUGESTAO (Gabriel 27/11): manutenção × obra (I1)'
    from ins;
end $$;

-- 4. A ESCADA (dono único)
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
    select c.plano, u.ult into v_f_plano, v_f_data from c, u order by c.n desc, c.primeira limit 1;
    select pc.subcentro into v_f_sub from public.financeiro_plano_contas pc where pc.id = v_f_plano;
  end if;

  with it as (
    select nullif(x->>'item_id', '')::uuid item_id,
           coalesce(nullif(x->>'n_item', '')::int, t.ord::int) n_item,
           nullif(btrim(x->>'codigo'), '') cod,
           public._fn_normalizar_texto(x->>'descricao') dnorm,
           public._fn_produto_chave(x->>'codigo', x->>'descricao') chave,
           regexp_replace(coalesce(x->>'ncm', ''), '\D', '', 'g') ncm
      from jsonb_array_elements(p_itens) with ordinality t(x, ord)
  ),
  valida as (
    select pc.id from public.financeiro_plano_contas pc
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
  fam as (
    select distinct on (it.n_item) it.n_item, f.familia
      from it join public.produto_ncm_familia f on f.ativo and it.ncm like f.prefixo || '%'
     order by it.n_item, length(f.prefixo) desc
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
  n8 as (
    select it.n_item, h.plano, count(distinct h.nota_id) usos, max(h.emissao) ultima, it.ncm chave
      from it join hist_ok h on length(it.ncm) = 8 and h.ncm = it.ncm group by 1, 2, 5
  ),
  n4 as (
    select it.n_item, h.plano, count(distinct h.nota_id) usos, max(h.emissao) ultima, left(it.ncm, 4) chave
      from it join hist_ok h on length(it.ncm) >= 4 and left(h.ncm, 4) = left(it.ncm, 4)
     where not exists (select 1 from n8 where n8.n_item = it.n_item) group by 1, 2, 5
    having count(distinct h.nota_id) >= 2   -- 4 dígitos é largo (3926 = "plástico"): 1 uso só não decide
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
                when n.n_item is not null then 'ncm_cliente'
                when c.n_item is not null and c.plano_obra is not null then 'familia_pergunta'
                when c.n_item is not null then 'familia'
                when v_f_plano is not null then 'fornecedor' end fonte,
           case when a0.n_item is not null then a0.plano
                when a.n_item is not null then a.plano
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
                     when 'eletrica' then 'elétrica' else replace(r.familia, '_', ' ') end fam_rot
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
                       when 'fornecedor' then 'último deste fornecedor' end,
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

revoke all on function public.fn_itens_sugerir_conta(uuid, text, text, date, jsonb, uuid, uuid) from public, anon;
grant execute on function public.fn_itens_sugerir_conta(uuid, text, text, date, jsonb, uuid, uuid) to authenticated;
comment on function public.fn_itens_sugerir_conta(uuid, text, text, date, jsonb, uuid, uuid) is
  'NOTA-ITENS-SUGESTAO (lote 114360): DONO ÚNICO da conta sugerida por item da nota. Escada: regra > mesmo produto > NCM no cliente > família NCM (construção/cerca/água/elétrica perguntam obra × manutenção) > último deste fornecedor > nada. Só lê.';

-- 5. a nota GRAVADA: mesma assinatura, só chama a escada
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
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'n_item', i.n_item, 'codigo', i.codigo, 'descricao', i.descricao, 'ncm', i.ncm)
           order by i.n_item), '[]'::jsonb)
    into v_itens from public.nota_fiscal_itens i where i.nota_id = n.id;
  return public.fn_itens_sugerir_conta(n.cliente_id, n.emitente_documento, n.dest_ie, n.emissao, v_itens, null, n.id)
         || jsonb_build_object('nota_id', n.id);
end $function$;
