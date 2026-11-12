-- LOTE-ETAPAS-01 (Gabriel 11/11 08:45, D1–D4) — o lote por etapas: situação da cria fora do código, mamotes ao pé, anotação, e o código
-- novo dos lotes NOVOS = ATIV-CAT-RAÇA[-carimbo], com -02/-03 só quando repetir na fazenda. Os 126 lotes de hoje (11/11) ficam como estão
-- (codigo_regra nulo = a regra antiga ATIV-CAT-RAÇA-NN; nada é renomeado). Só colunas nulas; a fn_lote_salvar recebe as chaves novas
-- por patch guardado por md5; a fn_lotes_da_fazenda devolve as colunas novas (o tipo de retorno muda: DROP + CREATE, mesmo acesso).

set local lock_timeout = '2s';

-- 1. as colunas (nulas; os 126 lotes não mudam)
alter table public.rebanho_lotes
  add column situacao_cria text check (situacao_cria in ('PR', 'PA', 'PP', 'VZ', 'SL', 'DS')),
  add column ordem_parto text check (ordem_parto in ('PRI', 'SEC', 'MUL')),
  add column mamotes_sexo text check (mamotes_sexo in ('M', 'F', 'MF')),
  add column mamotes_cruzamento text check (mamotes_cruzamento in ('nelore', 'f1_angus', 'meio_charoles', 'meio_senepol', 'outro')),
  add column mamotes_semen text check (mamotes_semen in ('convencional', 'sexado_f', 'sexado_m', 'touro')),
  add column anotacao text check (anotacao is null or (btrim(anotacao) <> '' and length(anotacao) <= 120)),
  add column codigo_regra text check (codigo_regra = 'etapas'),
  add constraint rebanho_lotes_parida_tem_carimbo check (situacao_cria is null or situacao_cria not in ('PA', 'PP', 'VZ') or carimbo is not null);

comment on column public.rebanho_lotes.situacao_cria is 'LOTE-ETAPAS-01: situação das matrizes (PR prenha/mojada · PA parida com bezerro · PP parida prenha · VZ parida vazia · SL solteira · DS descarte); fora do código';
comment on column public.rebanho_lotes.codigo_regra is 'LOTE-ETAPAS-01: nulo = código ATIV-CAT-RAÇA-NN (lotes até 11/11); etapas = ATIV-CAT-RAÇA[-carimbo], -02/-03 só quando repetir';

-- 2. o código novo: ATIV-CAT-RAÇA[-carimbo]; repetido entre os vivos da fazenda = -02, -03 … (o próprio lote não conta)
create or replace function public._fn_lote_codigo_etapas(p_fazenda uuid, p_categoria uuid, p_raca uuid, p_atividade uuid, p_carimbo text, p_id uuid)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  v_base text; v_cod text; i integer := 1;
begin
  v_base := (select sigla from public.rebanho_lote_cadastros where id = p_atividade) || '-' ||
            (select sigla from public.rebanho_lote_cadastros where id = p_categoria) || '-' ||
            (select sigla from public.rebanho_lote_cadastros where id = p_raca) ||
            coalesce('-' || nullif(btrim(p_carimbo), ''), '');
  v_cod := v_base;
  while exists (select 1 from public.rebanho_lotes x where x.fazenda_id = p_fazenda and x.codigo = v_cod and x.situacao <> 'cancelado'
                   and x.id is distinct from p_id) loop
    i := i + 1;
    if i > 99 then raise exception using errcode = 'P0001', message = format('Já há 99 lotes %s nesta fazenda.', v_base); end if;
    v_cod := v_base || '-' || lpad(i::text, 2, '0');
  end loop;
  return v_cod;
end $$;
revoke all on function public._fn_lote_codigo_etapas(uuid, uuid, uuid, uuid, text, uuid) from public, anon, authenticated;


-- 3. fn_lote_salvar: as chaves novas, a regra da parida e o código novo — patch guardado por md5 do corpo de ANTES e de DEPOIS;
--    cada âncora casa UMA vez (senão nada muda)
do $patch$
declare
  v_oid oid := 'public.fn_lote_salvar(uuid, uuid, jsonb, integer, text, boolean)'::regprocedure;
  v_def text;
  v_n integer;
  v_par text[];
  v_pares text[] := array[
    -- A1: as chaves aceitas
    $a$'meta_peso_kg', 'meta_gmd_kg', 'meta_data', 'conferir'];$a$,
    $b$'meta_peso_kg', 'meta_gmd_kg', 'meta_data', 'conferir',
                                'situacao_cria', 'ordem_parto', 'mamotes_sexo', 'mamotes_cruzamento', 'mamotes_semen', 'anotacao'];$b$,
    -- A2: a leitura das colunas novas e a regra da parida (antes do número)
    $a$  /* o número: criar = o próximo;$a$,
    $b$  /* LOTE-ETAPAS-01 (D2/D3): situação da cria, ordem de parto, mamotes e anotação — fora do código; listas fixas */
  if p_campos ? 'situacao_cria' then n.situacao_cria := nullif(upper(btrim(coalesce(p_campos->>'situacao_cria', ''))), ''); end if;
  if n.situacao_cria is not null and n.situacao_cria not in ('PR', 'PA', 'PP', 'VZ', 'SL', 'DS') then
    raise exception using errcode = 'P0001', message = 'Situação: escolha da lista (prenha, parida com bezerro, parida prenha, parida vazia, solteira, descarte).';
  end if;
  if p_campos ? 'ordem_parto' then n.ordem_parto := nullif(upper(btrim(coalesce(p_campos->>'ordem_parto', ''))), ''); end if;
  if n.ordem_parto is not null and n.ordem_parto not in ('PRI', 'SEC', 'MUL') then
    raise exception using errcode = 'P0001', message = 'Ordem de parto: primípara, secundípara ou multípara.';
  end if;
  if p_campos ? 'mamotes_sexo' then n.mamotes_sexo := nullif(upper(btrim(coalesce(p_campos->>'mamotes_sexo', ''))), ''); end if;
  if n.mamotes_sexo is not null and n.mamotes_sexo not in ('M', 'F', 'MF') then
    raise exception using errcode = 'P0001', message = 'Mamotes: machos, fêmeas ou os dois.';
  end if;
  if p_campos ? 'mamotes_cruzamento' then n.mamotes_cruzamento := nullif(lower(btrim(coalesce(p_campos->>'mamotes_cruzamento', ''))), ''); end if;
  if n.mamotes_cruzamento is not null and n.mamotes_cruzamento not in ('nelore', 'f1_angus', 'meio_charoles', 'meio_senepol', 'outro') then
    raise exception using errcode = 'P0001', message = 'Cruzamento dos mamotes: Nelore, F1 Angus, ½ Charolês, ½ Senepol ou outro.';
  end if;
  if p_campos ? 'mamotes_semen' then n.mamotes_semen := nullif(lower(btrim(coalesce(p_campos->>'mamotes_semen', ''))), ''); end if;
  if n.mamotes_semen is not null and n.mamotes_semen not in ('convencional', 'sexado_f', 'sexado_m', 'touro') then
    raise exception using errcode = 'P0001', message = 'Sêmen: convencional, sexado F, sexado M ou touro.';
  end if;
  if p_campos ? 'anotacao' then n.anotacao := nullif(btrim(coalesce(p_campos->>'anotacao', '')), ''); end if;
  if n.anotacao is not null and length(n.anotacao) > 120 then
    raise exception using errcode = 'P0001', message = 'A anotação passa de 120 letras.';
  end if;
  /* parida (PA/PP/VZ) pede o carimbo; mojada (PR) nunca pede */
  if n.situacao_cria in ('PA', 'PP', 'VZ') and n.carimbo is null then
    raise exception using errcode = 'P0001', message = 'Parida: informe o carimbo (mês.lote, ex.: 7.1).';
  end if;

  /* o número: criar = o próximo;$b$,
    -- A3: o código — lote NOVO pela regra nova; o de antes (codigo_regra nulo) pela regra de sempre
    $a$  n.codigo := public._fn_lote_codigo(n.categoria_id, n.raca_id, n.atividade_id, n.numero);
$a$,
    $b$  /* LOTE-ETAPAS-01 (D1): lote NOVO = ATIV-CAT-RAÇA[-carimbo], -02/-03 só quando repetir; o nº continua interno (índice da combinação).
     Os lotes de antes (codigo_regra nulo) seguem ATIV-CAT-RAÇA-NN: nada é renomeado. Editar sem mudar identidade nem carimbo = o mesmo código. */
  if p_id is null then n.codigo_regra := 'etapas'; end if;
  if n.codigo_regra = 'etapas' then
    if p_id is not null and not v_ident and n.carimbo is not distinct from o.carimbo then
      n.codigo := o.codigo;
    else
      n.codigo := public._fn_lote_codigo_etapas(n.fazenda_id, n.categoria_id, n.raca_id, n.atividade_id, n.carimbo, p_id);
    end if;
  else
    n.codigo := public._fn_lote_codigo(n.categoria_id, n.raca_id, n.atividade_id, n.numero);
  end if;
$b$,
    -- A4/A5: o INSERT grava as colunas novas e a regra do código
    $a$meta_peso_kg, meta_gmd_kg, meta_data, conferir)
    values ($a$,
    $b$meta_peso_kg, meta_gmd_kg, meta_data, conferir,
      situacao_cria, ordem_parto, mamotes_sexo, mamotes_cruzamento, mamotes_semen, anotacao, codigo_regra)
    values ($b$,
    $a$n.meta_data, n.conferir)
    returning * into n;$a$,
    $b$n.meta_data, n.conferir,
      n.situacao_cria, n.ordem_parto, n.mamotes_sexo, n.mamotes_cruzamento, n.mamotes_semen, n.anotacao, n.codigo_regra)
    returning * into n;$b$,
    -- A6: o UPDATE grava as colunas novas (a regra do código nunca muda depois de criado)
    $a$conferir = n.conferir,
      versao = o.versao + 1$a$,
    $b$conferir = n.conferir,
      situacao_cria = n.situacao_cria, ordem_parto = n.ordem_parto, mamotes_sexo = n.mamotes_sexo,
      mamotes_cruzamento = n.mamotes_cruzamento, mamotes_semen = n.mamotes_semen, anotacao = n.anotacao,
      versao = o.versao + 1$b$
  ];
begin
  if (select md5(prosrc) from pg_proc where oid = v_oid) <> 'd4f0069c2f73d1077a38657e494bb5e1' then
    raise exception 'fn_lote_salvar não é a de 11/11 (md5 do corpo mudou): nada aplicado';
  end if;
  v_def := pg_get_functiondef(v_oid);
  for i in 1 .. array_length(v_pares, 1) / 2 loop
    v_par := array[v_pares[2 * i - 1], v_pares[2 * i]];
    v_n := (length(v_def) - length(replace(v_def, v_par[1], ''))) / length(v_par[1]);
    if v_n <> 1 then raise exception 'âncora A% casa % vez(es), não 1: nada aplicado', i, v_n; end if;
    v_def := replace(v_def, v_par[1], v_par[2]);
  end loop;
  execute v_def;
  if (select md5(prosrc) from pg_proc where oid = v_oid) <> '5c4736c3c9f2cb2c301505112713b152' then
    raise exception 'fn_lote_salvar depois do patch: md5 % (esperado 5c4736c3c9f2cb2c301505112713b152)', (select md5(prosrc) from pg_proc where oid = v_oid);
  end if;
end $patch$;

-- 4. fn_lotes_da_fazenda devolve as colunas novas no FIM (o tipo de retorno muda: DROP + CREATE; o mesmo acesso, a mesma configuração;
--    o corpo é o de 11/11 — md5 58f456565473d425335c5023e5615995 — com só as 7 colunas acrescentadas no select)
drop function public.fn_lotes_da_fazenda(uuid, text);
create function public.fn_lotes_da_fazenda(p_fazenda uuid, p_ano_mes text)
returns table(id uuid, codigo text, codigos_antigos text[], nome_campeiro text, situacao text, formado_em date, encerrado_em date,
  categoria_id uuid, raca_id uuid, atividade_id uuid, numero integer, sistema_id uuid, programa_id uuid, destino_id uuid, safra text,
  carimbo text, idade_media_meses integer, meta_peso_kg numeric, meta_gmd_kg numeric, meta_data date, versao integer, ano_mes_dado text,
  cabecas integer, peso_medio_kg numeric, gmd_kg numeric, pastos text[], lancamentos integer, conferir text,
  situacao_cria text, ordem_parto text, mamotes_sexo text, mamotes_cruzamento text, mamotes_semen text, anotacao text, codigo_regra text)
language plpgsql stable security definer
set search_path = pg_catalog, public
set plan_cache_mode = force_custom_plan
as $fn$
#variable_conflict use_column
begin
  perform public._fn_exigir_tenant_das_linhas(array[(select f.cliente_id from public.fazendas f where f.id = p_fazenda)]);
  if p_ano_mes is null or p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception using errcode = 'P0001', message = 'Mês: escolha o mês e o ano.';
  end if;
  return query
  with it as (
    select i.lote_id, fp.ano_mes, i.quantidade, i.peso_medio_kg, pa.nome as pasto
      from public.fechamento_pasto_itens i
      join public.fechamento_pastos fp on fp.id = i.fechamento_id
      join public.pastos pa on pa.id = fp.pasto_id
     where fp.fazenda_id = p_fazenda and i.lote_id is not null and fp.ano_mes <= p_ano_mes
  ), mes as (
    select lote_id, max(ano_mes) as ano_mes from it group by lote_id
  ), soma as (
    select it.lote_id, it.ano_mes, sum(it.quantidade)::integer as cab,
           sum(it.quantidade * it.peso_medio_kg) filter (where it.peso_medio_kg is not null)
             / nullif(sum(it.quantidade) filter (where it.peso_medio_kg is not null), 0) as peso,
           array_agg(distinct it.pasto order by it.pasto) as pastos
      from it group by it.lote_id, it.ano_mes
  )
  select l.id, l.codigo, l.codigos_antigos, l.nome_campeiro, l.situacao, l.formado_em, l.encerrado_em, l.categoria_id, l.raca_id,
         l.atividade_id, l.numero, l.sistema_id, l.programa_id, l.destino_id, l.safra, l.carimbo, l.idade_media_meses, l.meta_peso_kg,
         l.meta_gmd_kg, l.meta_data, l.versao,
         m.ano_mes, s.cab, round(s.peso, 1),
         case when s.peso is not null and a.peso is not null
              then round((s.peso - a.peso) / extract(day from (to_date(m.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day'))::numeric, 3) end,
         s.pastos,
         (select count(*)::integer from public.fechamento_pasto_itens x where x.lote_id = l.id),
         l.conferir, l.situacao_cria, l.ordem_parto, l.mamotes_sexo, l.mamotes_cruzamento, l.mamotes_semen, l.anotacao, l.codigo_regra
    from public.rebanho_lotes l
    left join mes m on m.lote_id = l.id
    left join soma s on s.lote_id = l.id and s.ano_mes = m.ano_mes
    left join soma a on a.lote_id = l.id
                    and a.ano_mes = to_char(to_date(m.ano_mes || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM')
   where l.fazenda_id = p_fazenda and l.situacao <> 'cancelado'
   order by l.codigo;
end $fn$;
revoke all on function public.fn_lotes_da_fazenda(uuid, text) from public, anon;
grant execute on function public.fn_lotes_da_fazenda(uuid, text) to authenticated, service_role;
