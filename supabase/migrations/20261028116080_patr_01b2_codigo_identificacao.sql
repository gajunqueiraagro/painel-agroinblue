-- PATR-01 · PR B2 · 116080 — o CODIGO do bem e a identificacao em campos separados (Gabriel 31/10/2026, FASE 0 aprovada 09:00).
-- D1/D2: todo bem tem um codigo automatico, unico POR CLIENTE: prefixo da categoria + 3 digitos (MAQ-001). O banco gera ao salvar
-- (`_fn_patrimonio_proximo_codigo`, contador por cliente + prefixo travado pela linha — nunca max()+1); ninguem digita, nao muda
-- (nem trocando a categoria: gatilho `trg_patrimonio_codigo_imutavel`), nao se repete (unique) e nao se reaproveita (o contador so'
-- sobe; bem baixado guarda o dele). A previa do salvar NAO consome numero. No 1000o bem o numero cresce (MAQ-1000), nao corta.
-- Categoria do cliente herda o prefixo da global de mesmo `codigo`; sem global, BEM.
-- D3: os bens que ja' existem recebem o codigo pela data de aquisicao = o 1o lancamento ligado (a `primeira_data` da lista) → o
-- "em uso desde" → a criacao; empate: criado_em, id.
-- D4/D5: Nº proprio (livre, nao unico), Placa, Chassi, Nº de serie, Renavam (Placa e Renavam so' em Veiculos). O campo antigo
-- `identificacao` FICA (so' sai depois da conferencia do Gabriel, em migration futura); a tela nova nao o edita (o salvar so' o muda
-- quando ele vem no pedido, para a tela de antes do B2 nao perder o que se digita ate' a nova publicar). A separacao automatica
-- so' quando TODOS os pedacos (cortados em , / ;) casam: placa AAA9A99/AAA9999 (so' em Veiculos), chassi 17 [A-HJ-NPR-Z0-9];
-- "Sem" = vazio. O resto fica como "Identificacao antiga" na tela, para separar a' mao.
-- `fn_patrimonio_lista` muda o RETURNS TABLE (ganha as 6 colunas): DROP + CREATE, com a mesma guarda e os mesmos grants.
-- `fn_patrimonio_bem_salvar`: mesmo corpo da 116060 com os acrescimos (guardado por md5 do corpo atual).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 0. os corpos de hoje sao os da 116060 (senao, parar)
do $guarda$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_patrimonio_bem_salvar(jsonb, boolean, text)'::regprocedure)
     is distinct from '5b1a52bc93162ee12e13653fb7d1a567' then raise exception '116080: o corpo da fn_patrimonio_bem_salvar nao e'' o da 116060'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_patrimonio_lista(uuid, uuid, date)'::regprocedure)
     is distinct from '111dcec23c1d2d800fdccd61082ce6ed' then raise exception '116080: o corpo da fn_patrimonio_lista nao e'' o da 116060'; end if;
end $guarda$;

-- 1. o prefixo da categoria (catalogo; nenhum dado de cliente)
alter table public.patrimonio_categorias add column if not exists prefixo text
  constraint patrimonio_categoria_prefixo_chk check (prefixo is null or prefixo ~ '^[A-Z]{3}$');
update public.patrimonio_categorias c set prefixo = v.p
  from (values ('maquinas', 'MAQ'), ('implementos', 'IMP'), ('veiculos', 'VEI'), ('equipamentos_informatica', 'EQP'),
               ('benfeitorias', 'BEN'), ('instalacoes', 'INS'), ('rede_agua', 'AGU'), ('cercas', 'CER'), ('estradas_aceiros', 'EST'),
               ('pastagens', 'PAS'), ('formacao_area', 'FOR'), ('correcao_solo', 'COR'), ('terra', 'TER')) v(codigo, p)
 where c.cliente_id is null and c.codigo = v.codigo;

-- 2. as colunas do bem
alter table public.patrimonio_bens
  add column if not exists codigo text,
  add column if not exists numero_proprio text,
  add column if not exists placa text,
  add column if not exists chassi text,
  add column if not exists numero_serie text,
  add column if not exists renavam text;

-- 3. o contador (so' o banco usa)
create table if not exists public.patrimonio_codigo_contador (
  cliente_id uuid not null references public.clientes(id),
  prefixo text not null check (prefixo ~ '^[A-Z]{3}$'),
  ultimo integer not null check (ultimo >= 1),
  primary key (cliente_id, prefixo)
);
alter table public.patrimonio_codigo_contador enable row level security;
revoke all on public.patrimonio_codigo_contador from public, anon, authenticated;
grant all on public.patrimonio_codigo_contador to service_role;

-- 4. o prefixo e o proximo codigo (internas, sem usuario: INVOKER, ninguem de fora executa)
create or replace function public._fn_patrimonio_prefixo(p_categoria uuid)
returns text
language sql stable security invoker set search_path = pg_catalog, public
as $$
  select coalesce(c.prefixo, g.prefixo, 'BEM')
    from public.patrimonio_categorias c
    left join public.patrimonio_categorias g on g.cliente_id is null and g.codigo = c.codigo
   where c.id = p_categoria
$$;

create or replace function public._fn_patrimonio_proximo_codigo(p_cliente uuid, p_categoria uuid)
returns text
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare v_pre text := public._fn_patrimonio_prefixo(p_categoria); v_n integer;
begin
  if p_cliente is null or v_pre is null then raise exception 'proximo codigo: cliente ou categoria inexistente'; end if;
  -- a linha do contador fica travada ate' o fim da transacao: dois salvamentos ao mesmo tempo esperam um pelo outro
  insert into public.patrimonio_codigo_contador as k (cliente_id, prefixo, ultimo) values (p_cliente, v_pre, 1)
  on conflict (cliente_id, prefixo) do update set ultimo = k.ultimo + 1
  returning k.ultimo into v_n;
  return v_pre || '-' || case when v_n < 1000 then lpad(v_n::text, 3, '0') else v_n::text end;
end $$;

-- 5. D3: o codigo dos bens que ja' existem (pela data de aquisicao) e o contador semeado com o ultimo de cada cliente + prefixo
with d as (
  select b.id, b.cliente_id, public._fn_patrimonio_prefixo(b.categoria_id) pre,
         coalesce(k.prim, b.em_uso_desde, b.criado_em::date) dt, b.criado_em
    from public.patrimonio_bens b
    left join lateral (select min(v.data) prim from public._fn_patrimonio_vinculos(b.cliente_id, b.id, null) v
                        where v.estado <> 'a_conferir') k on true
   where b.codigo is null
), n as (
  select d.id, d.pre, row_number() over (partition by d.cliente_id, d.pre order by d.dt, d.criado_em, d.id) rn from d
)
update public.patrimonio_bens b
   set codigo = n.pre || '-' || case when n.rn < 1000 then lpad(n.rn::text, 3, '0') else n.rn::text end
  from n where b.id = n.id;
insert into public.patrimonio_codigo_contador (cliente_id, prefixo, ultimo)
select b.cliente_id, split_part(b.codigo, '-', 1), max(split_part(b.codigo, '-', 2)::int)
  from public.patrimonio_bens b group by 1, 2
on conflict (cliente_id, prefixo) do update set ultimo = greatest(public.patrimonio_codigo_contador.ultimo, excluded.ultimo);

alter table public.patrimonio_bens alter column codigo set not null;
create unique index if not exists patrimonio_bens_codigo_uq on public.patrimonio_bens (cliente_id, codigo);

-- 6. o codigo nao muda
create or replace function public._trg_patrimonio_codigo_imutavel()
returns trigger
language plpgsql security invoker set search_path = pg_catalog, public
as $$
begin
  if old.codigo is not null and new.codigo is distinct from old.codigo then
    raise exception using errcode = 'P0001', message = 'O código do bem não muda.';
  end if;
  return new;
end $$;
drop trigger if exists trg_patrimonio_codigo_imutavel on public.patrimonio_bens;
create trigger trg_patrimonio_codigo_imutavel before update of codigo on public.patrimonio_bens
  for each row execute function public._trg_patrimonio_codigo_imutavel();

-- 7. D5: a separacao do campo antigo — so' quando TODOS os pedacos casam (o campo antigo fica igual); "Sem" = vazio
with p as (
  select b.id, c.codigo = 'veiculos' veic,
         array(select upper(regexp_replace(x, '\s', '', 'g')) from regexp_split_to_table(b.identificacao, '[,/;]') x) pecas
    from public.patrimonio_bens b
    join public.patrimonio_categorias c on c.id = b.categoria_id
   where b.identificacao is not null and b.placa is null and b.chassi is null and b.numero_serie is null and b.renavam is null
), q as (
  select p.id,
         (select max(x) from unnest(p.pecas) x where p.veic and x ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$') placa,
         (select max(x) from unnest(p.pecas) x where x ~ '^[A-HJ-NPR-Z0-9]{17}$') chassi,
         (select count(*) from unnest(p.pecas) x where p.veic and x ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$') n_placa,
         (select count(*) from unnest(p.pecas) x where x ~ '^[A-HJ-NPR-Z0-9]{17}$') n_chassi,
         cardinality(p.pecas) n
    from p
)
update public.patrimonio_bens b set placa = q.placa, chassi = q.chassi
  from q
 where b.id = q.id and q.n_placa <= 1 and q.n_chassi <= 1 and q.n_placa + q.n_chassi = q.n and q.n >= 1;
update public.patrimonio_bens set identificacao = null where lower(btrim(identificacao)) = 'sem';

-- 8. a gravacao (corpo da 116060 + o codigo e os campos separados)
create or replace function public.fn_patrimonio_bem_salvar(p_bem jsonb, p_simular boolean default true, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_bem->>'id', '')::uuid;
  o public.patrimonio_bens%rowtype;
  n public.patrimonio_bens%rowtype;
  c public.patrimonio_categorias%rowtype;
  v_hoje date := public._fn_patrimonio_hoje();
  v_mes_atual date := date_trunc('month', public._fn_patrimonio_hoje())::date;
  v_vida integer; v_res numeric; v_ini public.patrimonio_bem_parametros%rowtype; v_ult public.patrimonio_bem_parametros%rowtype;
  v_ja_deprecia boolean := false; v_corrige boolean := false; v_acum_antes numeric; v_acum_depois numeric; v_ok boolean := false;
  v_avisos jsonb := '[]'::jsonb;
begin
  if v_id is not null then
    o := public._fn_patrimonio_bem_do_usuario(v_id);
    if nullif(p_bem->>'versao', '')::int is distinct from o.versao then
      raise exception using errcode = '40001', message = 'Este bem foi alterado por outra pessoa. Feche e abra de novo.';
    end if;
    n := o;
    v_ja_deprecia := o.situacao <> 'em_formacao' and date_trunc('month', o.em_uso_desde)::date < v_mes_atual;
  else
    n.id := gen_random_uuid();
    n.cliente_id := nullif(p_bem->>'cliente_id', '')::uuid;
    if n.cliente_id is null or not coalesce(public.tenant_ok(n.cliente_id), false) then
      raise exception using errcode = '42501', message = 'sem acesso a este registro';
    end if;
    n.versao := 0;
  end if;

  n.fazenda_id := nullif(p_bem->>'fazenda_id', '')::uuid;
  n.categoria_id := nullif(p_bem->>'categoria_id', '')::uuid;
  n.descricao := nullif(btrim(coalesce(p_bem->>'descricao', '')), '');
  n.marca := nullif(btrim(coalesce(p_bem->>'marca', '')), '');
  n.modelo := nullif(btrim(coalesce(p_bem->>'modelo', '')), '');
  n.ano_fabricacao := nullif(p_bem->>'ano_fabricacao', '')::int;
  -- B2 (116080): o campo antigo `identificacao` so' muda se vier no pedido (a tela de antes do B2 ainda o manda); a tela nova nao o
  -- manda, e ele se mantem ate' a conferencia do Gabriel. Os campos separados:
  n.identificacao := case when p_bem ? 'identificacao' then nullif(btrim(coalesce(p_bem->>'identificacao', '')), '') else o.identificacao end;
  -- (tambem so' mudam quando vem no pedido: a tela de antes do B2 nao os manda e nao pode apaga-los)
  n.numero_proprio := case when p_bem ? 'numero_proprio' then nullif(btrim(coalesce(p_bem->>'numero_proprio', '')), '') else o.numero_proprio end;
  n.placa := case when p_bem ? 'placa' then nullif(upper(regexp_replace(coalesce(p_bem->>'placa', ''), '\s', '', 'g')), '') else o.placa end;
  n.chassi := case when p_bem ? 'chassi' then nullif(upper(regexp_replace(coalesce(p_bem->>'chassi', ''), '\s', '', 'g')), '') else o.chassi end;
  n.numero_serie := case when p_bem ? 'numero_serie' then nullif(btrim(coalesce(p_bem->>'numero_serie', '')), '') else o.numero_serie end;
  n.renavam := case when p_bem ? 'renavam' then nullif(regexp_replace(coalesce(p_bem->>'renavam', ''), '\s', '', 'g'), '') else o.renavam end;
  n.observacao := nullif(btrim(coalesce(p_bem->>'observacao', '')), '');
  n.situacao := coalesce(nullif(p_bem->>'situacao', ''), 'em_formacao');
  n.em_uso_desde := nullif(p_bem->>'em_uso_desde', '')::date;
  n.atividade := nullif(p_bem->>'atividade', '');
  n.financiamento_id := nullif(p_bem->>'financiamento_id', '')::uuid;
  n.origem_valor := coalesce(nullif(p_bem->>'origem_valor', ''), 'lancamentos');
  n.valor_sem_lancamento := case when n.origem_valor = 'sem_lancamento' then nullif(p_bem->>'valor_sem_lancamento', '')::numeric end;
  n.estimativa_rs_ha := case when n.origem_valor = 'estimativa' then nullif(p_bem->>'estimativa_rs_ha', '')::numeric end;
  n.estimativa_area_ha := case when n.origem_valor = 'estimativa' then nullif(p_bem->>'estimativa_area_ha', '')::numeric end;
  n.area_ha := nullif(p_bem->>'area_ha', '')::numeric;
  n.matricula := nullif(btrim(coalesce(p_bem->>'matricula', '')), '');
  n.nirf := nullif(btrim(coalesce(p_bem->>'nirf', '')), '');
  n.seguradora := nullif(btrim(coalesce(p_bem->>'seguradora', '')), '');
  n.apolice := nullif(btrim(coalesce(p_bem->>'apolice', '')), '');
  n.seguro_vence_em := nullif(p_bem->>'seguro_vence_em', '')::date;

  -- recusas (frase pronta, nada gravado)
  if n.fazenda_id is null or not exists (select 1 from public.fazendas f where f.id = n.fazenda_id and f.cliente_id = n.cliente_id) then
    raise exception using errcode = 'P0001', message = 'Escolha a fazenda do bem.';
  end if;
  select * into c from public.patrimonio_categorias x
   where x.id = n.categoria_id and x.ativo and (x.cliente_id is null or x.cliente_id = n.cliente_id);
  if c.id is null then raise exception using errcode = 'P0001', message = 'Escolha a categoria do bem.'; end if;
  if n.descricao is null then raise exception using errcode = 'P0001', message = 'Informe a descrição do bem.'; end if;
  if c.codigo <> 'veiculos' and (n.placa is not null or n.renavam is not null) then
    raise exception using errcode = 'P0001', message = 'Placa e Renavam são só de Veículos: apague-os antes de trocar a categoria.';
  end if;
  if n.atividade is null or n.atividade not in ('pecuaria', 'lavoura', 'compartilhado') then
    raise exception using errcode = 'P0001', message = 'Escolha a atividade que usa o bem (Pecuária, Lavoura ou Compartilhado).';
  end if;
  if n.situacao = 'baixado' or (o.id is not null and o.situacao = 'baixado') then
    raise exception using errcode = 'P0001', message = 'A baixa do bem ainda não se faz por aqui.';
  end if;
  if n.situacao not in ('em_formacao', 'em_uso') then raise exception using errcode = 'P0001', message = 'Situação inválida.'; end if;
  if n.situacao = 'em_uso' and n.em_uso_desde is null then
    raise exception using errcode = 'P0001', message = 'Informe desde quando o bem está em uso.';
  end if;
  if n.em_uso_desde is not null and n.em_uso_desde > v_hoje then
    raise exception using errcode = 'P0001', message = 'A data de "em uso desde" não pode ser no futuro.';
  end if;
  if n.situacao = 'em_formacao' then n.em_uso_desde := null; end if;
  -- CORRECAO (3.5): com motivo, a previa mostra a acumulada antes x depois e a gravacao vai a' trilha
  v_corrige := v_ja_deprecia and (n.situacao <> o.situacao
                 or date_trunc('month', n.em_uso_desde) is distinct from date_trunc('month', o.em_uso_desde));
  if v_corrige and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = format(
      'O bem já deprecia desde %s: para corrigir a situação ou o "em uso desde", informe o motivo.', to_char(o.em_uso_desde, 'MM/YYYY'));
  end if;
  if n.origem_valor not in ('lancamentos', 'sem_lancamento', 'estimativa') then
    raise exception using errcode = 'P0001', message = 'Origem do valor inválida.';
  end if;
  if n.origem_valor = 'sem_lancamento' and coalesce(n.valor_sem_lancamento, 0) <= 0 then
    raise exception using errcode = 'P0001', message = 'Informe o valor do bem sem lançamento.';
  end if;
  if n.origem_valor = 'estimativa' and (coalesce(n.estimativa_rs_ha, 0) <= 0 or coalesce(n.estimativa_area_ha, 0) <= 0) then
    raise exception using errcode = 'P0001', message = 'Informe o R$/ha e a área da estimativa.';
  end if;
  if n.financiamento_id is not null
     and not exists (select 1 from public.financiamentos f where f.id = n.financiamento_id and f.cliente_id = n.cliente_id) then
    raise exception using errcode = 'P0001', message = 'O financiamento escolhido não é deste cliente.';
  end if;
  if o.id is not null and o.categoria_id <> n.categoria_id then
    if not c.tem_pastos and exists (select 1 from public.patrimonio_bem_pastos bp where bp.bem_id = o.id and bp.desligado_em is null) then
      raise exception using errcode = 'P0001', message = 'Esta categoria não tem pastos: desmarque os pastos do bem antes.';
    end if;
    if not c.tem_mercado and exists (select 1 from public.patrimonio_avaliacoes a where a.bem_id = o.id and a.cancelado_em is null) then
      raise exception using errcode = 'P0001', message = 'Esta categoria não tem valor de mercado: cancele as avaliações do bem antes.';
    end if;
    if v_ja_deprecia and (select x.deprecia from public.patrimonio_categorias x where x.id = o.categoria_id) <> c.deprecia then
      raise exception using errcode = 'P0001', message = 'O bem já deprecia: não troca para uma categoria que deprecia de outro jeito.';
    end if;
  end if;

  -- vida / residual: antes de depreciar num mes passado, a linha inicial acompanha o formulario; depois, so' pela mudanca com vigencia
  v_vida := case when p_bem ? 'vida_util_meses' then nullif(p_bem->>'vida_util_meses', '')::int end;
  v_res := case when p_bem ? 'residual_pct' then nullif(p_bem->>'residual_pct', '')::numeric end;
  if o.id is not null then
    select * into v_ini from public.patrimonio_bem_parametros q where q.bem_id = o.id order by q.vigente_desde limit 1;
    select * into v_ult from public.patrimonio_bem_parametros q where q.bem_id = o.id order by q.vigente_desde desc limit 1;
  end if;
  if v_ja_deprecia then
    if (p_bem ? 'vida_util_meses' and v_vida is distinct from v_ult.vida_util_meses)
       or (p_bem ? 'residual_pct' and v_res is distinct from v_ult.residual_pct) then
      raise exception using errcode = 'P0001', message = 'O bem já deprecia: mude a vida útil ou o residual por "Mudar vida útil" (vale deste mês em diante).';
    end if;
    v_vida := v_ult.vida_util_meses; v_res := v_ult.residual_pct;
  elsif not c.deprecia then
    v_vida := null; v_res := 0;
  else
    v_vida := coalesce(v_vida, v_ini.vida_util_meses, round(c.vida_util_anos * 12)::int);
    v_res := coalesce(v_res, v_ini.residual_pct, c.residual_pct);
    if v_vida is null or v_vida <= 0 then raise exception using errcode = 'P0001', message = 'Informe a vida útil em meses.'; end if;
  end if;
  if v_res < 0 or v_res >= 100 then raise exception using errcode = 'P0001', message = 'O residual vai de 0 a 99,99 %.'; end if;

  if c.tem_pastos is false and n.origem_valor = 'estimativa' then
    v_avisos := v_avisos || jsonb_build_array('Estimativa por hectare é o caso do pasto antigo; confira se é isso mesmo.');
  end if;

  if v_corrige then
    v_acum_antes := coalesce((select s.acumulada from public._fn_patrimonio_serie(o.cliente_id, o.id, v_hoje) s order by s.mes desc limit 1), 0);
  end if;
  if p_simular then
    if v_corrige then
      begin
        update public.patrimonio_bens set situacao = n.situacao, em_uso_desde = n.em_uso_desde where id = o.id;
        v_acum_depois := coalesce((select s.acumulada from public._fn_patrimonio_serie(o.cliente_id, o.id, v_hoje) s order by s.mes desc limit 1), 0);
        v_ok := true;
        raise exception using errcode = 'P0001', message = 'desfaz a previa';
      exception when others then
        if not v_ok then raise; end if;
      end;
    end if;
    return jsonb_build_object('ok', true, 'simulado', true, 'id', v_id, 'novo', v_id is null, 'codigo', o.codigo, 'avisos', v_avisos,
      'correcao', case when v_corrige then jsonb_build_object(
        'de', jsonb_build_object('situacao', o.situacao, 'em_uso_desde', o.em_uso_desde),
        'para', jsonb_build_object('situacao', n.situacao, 'em_uso_desde', n.em_uso_desde),
        'acumulada_antes', v_acum_antes, 'acumulada_depois', v_acum_depois) end,
      'categoria', jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome, 'deprecia', c.deprecia),
      'vida_util_meses', v_vida, 'residual_pct', v_res);
  end if;

  if v_id is null then
    -- o codigo nasce aqui (B2): o contador do cliente + prefixo fica travado ate' o fim da transacao
    n.codigo := public._fn_patrimonio_proximo_codigo(n.cliente_id, n.categoria_id);
    insert into public.patrimonio_bens (id, cliente_id, fazenda_id, categoria_id, descricao, marca, modelo, ano_fabricacao, identificacao,
      observacao, situacao, em_uso_desde, atividade, financiamento_id, origem_valor, valor_sem_lancamento, estimativa_rs_ha,
      estimativa_area_ha, area_ha, matricula, nirf, seguradora, apolice, seguro_vence_em, versao, criado_por,
      codigo, numero_proprio, placa, chassi, numero_serie, renavam)
    values (n.id, n.cliente_id, n.fazenda_id, n.categoria_id, n.descricao, n.marca, n.modelo, n.ano_fabricacao, n.identificacao,
      n.observacao, n.situacao, n.em_uso_desde, n.atividade, n.financiamento_id, n.origem_valor, n.valor_sem_lancamento,
      n.estimativa_rs_ha, n.estimativa_area_ha, n.area_ha, n.matricula, n.nirf, n.seguradora, n.apolice, n.seguro_vence_em, 1, auth.uid(),
      n.codigo, n.numero_proprio, n.placa, n.chassi, n.numero_serie, n.renavam);
    insert into public.patrimonio_bem_parametros (cliente_id, bem_id, vigente_desde, vida_util_meses, residual_pct, motivo, criado_por)
    values (n.cliente_id, n.id, date_trunc('month', coalesce(n.em_uso_desde, v_hoje))::date, v_vida, v_res, 'inicial (categoria)', auth.uid());
    return jsonb_build_object('ok', true, 'simulado', false, 'id', n.id, 'versao', 1, 'codigo', n.codigo);
  end if;

  update public.patrimonio_bens set
    fazenda_id = n.fazenda_id, categoria_id = n.categoria_id, descricao = n.descricao, marca = n.marca, modelo = n.modelo,
    ano_fabricacao = n.ano_fabricacao, identificacao = n.identificacao, observacao = n.observacao, situacao = n.situacao,
    em_uso_desde = n.em_uso_desde, atividade = n.atividade, financiamento_id = n.financiamento_id, origem_valor = n.origem_valor,
    valor_sem_lancamento = n.valor_sem_lancamento, estimativa_rs_ha = n.estimativa_rs_ha, estimativa_area_ha = n.estimativa_area_ha,
    area_ha = n.area_ha, matricula = n.matricula, nirf = n.nirf, seguradora = n.seguradora, apolice = n.apolice,
    seguro_vence_em = n.seguro_vence_em, numero_proprio = n.numero_proprio, placa = n.placa, chassi = n.chassi,
    numero_serie = n.numero_serie, renavam = n.renavam, versao = o.versao + 1, alterado_em = now(), alterado_por = auth.uid()
   where id = o.id and versao = o.versao;
  if not found then raise exception using errcode = '40001', message = 'Este bem foi alterado por outra pessoa. Feche e abra de novo.'; end if;
  if v_corrige then
    v_acum_depois := coalesce((select s.acumulada from public._fn_patrimonio_serie(o.cliente_id, o.id, v_hoje) s order by s.mes desc limit 1), 0);
    insert into public.patrimonio_bem_trilha (cliente_id, bem_id, acao, antes, depois, motivo, por)
    values (o.cliente_id, o.id, 'correcao_em_uso',
            jsonb_build_object('situacao', o.situacao, 'em_uso_desde', o.em_uso_desde, 'acumulada', v_acum_antes),
            jsonb_build_object('situacao', n.situacao, 'em_uso_desde', n.em_uso_desde, 'acumulada', v_acum_depois),
            btrim(p_motivo), auth.uid());
  end if;
  -- antes de depreciar num mes passado, a linha inicial acompanha o formulario (nenhum mes passado muda)
  if not v_ja_deprecia then
    update public.patrimonio_bem_parametros set vida_util_meses = v_vida, residual_pct = v_res,
           vigente_desde = date_trunc('month', coalesce(n.em_uso_desde, v_hoje))::date
     where id = v_ini.id
       and not exists (select 1 from public.patrimonio_bem_parametros q2 where q2.bem_id = o.id and q2.id <> v_ini.id
                        and q2.vigente_desde = date_trunc('month', coalesce(n.em_uso_desde, v_hoje))::date);
  end if;
  return jsonb_build_object('ok', true, 'simulado', false, 'id', o.id, 'versao', o.versao + 1, 'codigo', o.codigo);
end $$;

-- 9. a lista (o RETURNS TABLE muda: DROP + CREATE)
drop function public.fn_patrimonio_lista(uuid, uuid, date);
create function public.fn_patrimonio_lista(p_cliente uuid, p_fazenda uuid default null, p_posicao date default null)
returns table (bem_id uuid, fazenda_id uuid, fazenda_codigo text, categoria_id uuid, categoria_codigo text, categoria_nome text,
               deprecia boolean, tem_mercado boolean, tem_pastos boolean, descricao text, marca text, modelo text, identificacao text,
               situacao text, em_uso_desde date, baixado_em date, atividade text, origem_valor text, valor_extra numeric,
               valor_lancamentos numeric, aquisicao numeric, a_realizar numeric, n_lancamentos integer, n_a_realizar integer, n_a_conferir integer,
               n_selo integer, n_repetidas integer, primeira_data date, vida_util_meses integer, residual_pct numeric, depreciacao_acumulada numeric,
               depreciacao_no_ano numeric, valor_contabil numeric, mercado_valor numeric, mercado_data date, mercado_base text,
               area_pastos_ha numeric, versao integer, codigo text, numero_proprio text, placa text, chassi text,
               numero_serie text, renavam text)
language plpgsql stable security definer set search_path = pg_catalog, public set plan_cache_mode = force_custom_plan
as $$
declare v_pos date := coalesce(p_posicao, public._fn_patrimonio_hoje());
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return query
  with s as (select * from public._fn_patrimonio_serie(p_cliente, null, v_pos)),
  su as (select distinct on (s.bem_id) s.bem_id, s.acumulada from s order by s.bem_id, s.mes desc),
  sa as (select s.bem_id, sum(s.quota) q from s where extract(year from s.mes) = extract(year from v_pos) group by s.bem_id),
  k as (select * from public._fn_patrimonio_vinculos(p_cliente, null, v_pos)),
  ka as (select k.bem_id,
                sum(k.valor) filter (where k.estado = 'soma') soma,
                sum(k.valor) filter (where k.estado = 'a_realizar') arealizar,
                count(*) filter (where k.estado = 'soma')::int n_soma,
                count(*) filter (where k.estado = 'a_realizar')::int n_arealizar,
                count(*) filter (where k.estado = 'a_conferir')::int n_conferir,
                count(*) filter (where k.selo is not null)::int n_selo,
                count(*) filter (where k.repetida)::int n_rep,
                min(k.data) filter (where k.estado <> 'a_conferir') primeira
           from k group by k.bem_id),
  pv as (select distinct on (q.bem_id) q.bem_id, q.vida_util_meses, q.residual_pct
           from public.patrimonio_bem_parametros q
           join public.patrimonio_bens x on x.id = q.bem_id and x.cliente_id = p_cliente
          order by q.bem_id, (q.vigente_desde <= date_trunc('month', v_pos)::date) desc,
                   case when q.vigente_desde <= date_trunc('month', v_pos)::date then q.vigente_desde end desc nulls last, q.vigente_desde),
  av as (select distinct on (a.bem_id) a.bem_id, a.valor_total, a.data, a.base
           from public.patrimonio_avaliacoes a
          where a.cliente_id = p_cliente and a.cancelado_em is null and a.data <= v_pos
          order by a.bem_id, a.data desc, a.criado_em desc),
  pa as (select bp.bem_id, sum(bp.area_ha) area from public.patrimonio_bem_pastos bp
          where bp.cliente_id = p_cliente and bp.desligado_em is null group by bp.bem_id)
  select x.id, x.fazenda_id, f.codigo, c.id, c.codigo, c.nome, c.deprecia, c.tem_mercado, c.tem_pastos,
         x.descricao, x.marca, x.modelo, x.identificacao, x.situacao, x.em_uso_desde, x.baixado_em, x.atividade, x.origem_valor,
         e.extra, coalesce(ka.soma, 0), e.extra + coalesce(ka.soma, 0), coalesce(ka.arealizar, 0),
         coalesce(ka.n_soma, 0), coalesce(ka.n_arealizar, 0), coalesce(ka.n_conferir, 0), coalesce(ka.n_selo, 0), coalesce(ka.n_rep, 0),
         ka.primeira, pv.vida_util_meses, pv.residual_pct,
         coalesce(su.acumulada, 0), coalesce(sa.q, 0), e.extra + coalesce(ka.soma, 0) - coalesce(su.acumulada, 0),
         av.valor_total, av.data, av.base, pa.area, x.versao, x.codigo, x.numero_proprio, x.placa, x.chassi,
         x.numero_serie, x.renavam
    from public.patrimonio_bens x
    join public.patrimonio_categorias c on c.id = x.categoria_id
    join public.fazendas f on f.id = x.fazenda_id
    cross join lateral (select case x.origem_valor when 'sem_lancamento' then x.valor_sem_lancamento
                                                   when 'estimativa' then round(x.estimativa_rs_ha * x.estimativa_area_ha, 2)
                                                   else 0::numeric end as extra) e
    left join ka on ka.bem_id = x.id
    left join su on su.bem_id = x.id
    left join sa on sa.bem_id = x.id
    left join pv on pv.bem_id = x.id
    left join av on av.bem_id = x.id
    left join pa on pa.bem_id = x.id
   where x.cliente_id = p_cliente and (p_fazenda is null or x.fazenda_id = p_fazenda)
   order by coalesce(x.em_uso_desde, ka.primeira, x.criado_em::date), x.descricao, x.codigo;
end $$;

-- 10. permissoes: a lista e a gravacao como antes; as internas novas, ninguem de fora
revoke all on function public.fn_patrimonio_lista(uuid, uuid, date) from public, anon;
grant execute on function public.fn_patrimonio_lista(uuid, uuid, date) to authenticated, service_role;
revoke all on function public.fn_patrimonio_bem_salvar(jsonb, boolean, text) from public, anon;
grant execute on function public.fn_patrimonio_bem_salvar(jsonb, boolean, text) to authenticated, service_role;
revoke all on function public._fn_patrimonio_prefixo(uuid) from public, anon, authenticated;
grant execute on function public._fn_patrimonio_prefixo(uuid) to service_role;
revoke all on function public._fn_patrimonio_proximo_codigo(uuid, uuid) from public, anon, authenticated;
grant execute on function public._fn_patrimonio_proximo_codigo(uuid, uuid) to service_role;
revoke all on function public._trg_patrimonio_codigo_imutavel() from public, anon, authenticated;
