-- INFRA-FICHAS-PATR-01 (decisões D1–D6 do Gabriel, 01/11/2026 noite) — a FICHA de cada infraestrutura e o bem do Patrimônio criado
-- a partir dela.
--
-- D1 a ficha mora na própria infraestrutura: `fazenda_infraestruturas.ficha jsonb` ({} = sem ficha), conferida POR TIPO no banco.
--    O banco confere só a FORMA de cada campo (texto, número > 0, inteiro ≥ 1, sim/não, lados 1 ou 2) e recusa campo que não é da ficha
--    daquele tipo; a lista de OPÇÕES (concreto, madeira…) é sugestão da tela e nunca trava (o operador pode digitar "Outro…").
--    O catálogo dos campos é `_fn_infra_ficha_campos(tipo)`; a tela tem o mesmo catálogo com rótulos e opções (`fichasDaInfra.ts`),
--    e o teste SQL grava uma ficha completa de cada tipo com as MESMAS chaves (src/lib/mapa/fichasDaInfra.exemplos.json).
-- D3 `fn_infra_criar_bem`: cria o bem pelo escritor do Patrimônio (`fn_patrimonio_bem_salvar`, código e trilha dele) E liga a
--    infraestrutura ao bem NUMA transação — se o vínculo recusa, o bem não nasce. A categoria vem por CÓDIGO (D2, a tela decide pelo
--    tipo): a do cliente, se houver, senão a global.
-- `fn_infra_salvar` passa a aceitar e gravar `ficha` (patch do corpo VIVO guardado por md5; o resto do corpo não muda); a trilha leva a
-- ficha em criar/alterar.
--
-- SEGURANÇA (FUNÇÃO NOVA NASCE FECHADA): `fn_infra_criar_bem` SECURITY DEFINER, search_path fixo, o cliente se resolve pela LINHA da
-- infraestrutura e passa por `tenant_ok` (42501), versão contra edição simultânea (40001), recusas P0001 com frase pronta, prévia por
-- padrão; REVOKE de PUBLIC/anon, GRANT a authenticated e service_role. As internas novas só para service_role (como as da 02f-a).
-- Nenhum dado de cliente é alterado: a coluna nasce com '{}' em todas as linhas (9 no proto em 01/11).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. A coluna --------------------------------------------------------------------------------------------------------------------
alter table public.fazenda_infraestruturas add column ficha jsonb not null default '{}'::jsonb;

-- 2. O catálogo dos campos da ficha por tipo (a FORMA de cada um) ------------------------------------------------------------------
create or replace function public._fn_infra_ficha_campos(p_tipo text)
returns jsonb language sql immutable set search_path = pg_catalog, public
as $$
  select case p_tipo
    when 'cocho' then '{"material":"texto","comprimento_m":"numero","lados":"lados","coberto":"simnao","uso":"texto"}'
    when 'bebedouro' then '{"modelo":"texto","material":"texto","capacidade_l":"numero","abastecimento":"texto"}'
    when 'saleiro' then '{"material":"texto","coberto":"simnao","comprimento_m":"numero"}'
    when 'caixa_dagua' then '{"material":"texto","capacidade_l":"numero","elevada":"simnao"}'
    when 'poco' then '{"modelo":"texto","profundidade_m":"numero","vazao_m3h":"numero","bomba":"texto"}'
    when 'represa_acude' then '{"finalidade":"texto"}'
    when 'curral' then '{"area_m2":"numero","material":"texto","divisoes":"inteiro"}'
    when 'tronco_brete' then '{"modelo":"texto","material":"texto"}'
    when 'balanca' then '{"capacidade_kg":"numero","marca_modelo":"texto","eletronica":"simnao"}'
    when 'porteira' then '{"material":"texto","largura_m":"numero"}'
    when 'cerca' then '{"modelo":"texto","fios":"inteiro","mourao":"texto"}'
    when 'sede_casa' then '{"area_construida_m2":"numero","material":"texto"}'
    when 'galpao' then '{"area_construida_m2":"numero","material":"texto"}'
    when 'energia' then '{"modelo":"texto","potencia_kva":"numero"}'
  end::jsonb
$$;

-- 3. A conferência da ficha (null = ok; senão a frase pronta) -----------------------------------------------------------------------
create or replace function public._fn_infra_ficha_erro(p_tipo text, f jsonb)
returns text language plpgsql immutable set search_path = pg_catalog, public
as $$
declare c jsonb := public._fn_infra_ficha_campos(p_tipo); k text; v jsonb; forma text; rot text := public._fn_infra_rotulo(p_tipo);
begin
  if f is null or f = '{}'::jsonb then return null; end if;
  if jsonb_typeof(f) <> 'object' then return 'A ficha da infraestrutura é inválida.'; end if;
  if c is null then return 'Tipo de infraestrutura inválido.'; end if;
  for k, v in select * from jsonb_each(f) loop
    forma := c->>k;
    if forma is null then return format('O campo "%s" não é da ficha de %s.', k, rot); end if;
    if forma = 'texto' and (jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = '' or length(v #>> '{}') > 80) then
      return format('O campo "%s" da ficha precisa de um texto (até 80 letras).', k);
    elsif forma = 'numero' and (jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <= 0) then
      return format('O campo "%s" da ficha precisa de um número maior que zero.', k);
    elsif forma = 'inteiro' and (jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 1 or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)) then
      return format('O campo "%s" da ficha precisa de um número inteiro (1 ou mais).', k);
    elsif forma = 'simnao' and jsonb_typeof(v) <> 'boolean' then
      return format('O campo "%s" da ficha é sim ou não.', k);
    elsif forma = 'lados' and (jsonb_typeof(v) <> 'number' or (v #>> '{}') not in ('1', '2')) then
      return 'Os lados de acesso do cocho são 1 ou 2.';
    end if;
  end loop;
  return null;
end $$;

alter table public.fazenda_infraestruturas add constraint fazenda_infra_ficha_chk check (public._fn_infra_ficha_erro(tipo, ficha) is null);

revoke all on function public._fn_infra_ficha_campos(text) from public, anon, authenticated;
revoke all on function public._fn_infra_ficha_erro(text, jsonb) from public, anon, authenticated;
grant execute on function public._fn_infra_ficha_campos(text) to service_role;
grant execute on function public._fn_infra_ficha_erro(text, jsonb) to service_role;

-- 4. fn_infra_salvar aceita e grava a ficha (patch do corpo vivo, guardado por md5) --------------------------------------------------
do $patch$
declare
  d text := pg_get_functiondef('public.fn_infra_salvar(jsonb, boolean, text)'::regprocedure);
  r record;
begin
  if md5(d) <> 'ed56b604221e3814570b24ce5456d500' then
    raise exception 'INFRA-FICHAS: fn_infra_salvar mudou desde a prévia (md5 %)', md5(d);
  end if;
  for r in select * from (values
    (1, $a$  if v_id is null or p_infra ? 'observacao' then n.observacao := nullif(btrim(coalesce(p_infra->>'observacao', '')), ''); end if;
$a$, $b$  if v_id is null or p_infra ? 'observacao' then n.observacao := nullif(btrim(coalesce(p_infra->>'observacao', '')), ''); end if;
  if v_id is null or p_infra ? 'ficha' then n.ficha := coalesce(nullif(p_infra->'ficha', 'null'::jsonb), '{}'::jsonb); end if;
$b$),
    (2, $a$  if v_erro is not null then raise exception using errcode = 'P0001', message = v_erro; end if;
$a$, $b$  if v_erro is not null then raise exception using errcode = 'P0001', message = v_erro; end if;
  v_erro := public._fn_infra_ficha_erro(n.tipo, n.ficha);
  if v_erro is not null then raise exception using errcode = 'P0001', message = v_erro; end if;
$b$),
    (3, $a$unnest(array['tipo', 'geometria', 'nome', 'pasto_id', 'bem_id', 'observacao'])$a$,
        $b$unnest(array['tipo', 'geometria', 'nome', 'pasto_id', 'bem_id', 'observacao', 'ficha'])$b$),
    (4, $a$'comprimento_m', n.comprimento_m, 'area_ha', n.area_ha,
$a$, $b$'comprimento_m', n.comprimento_m, 'area_ha', n.area_ha, 'ficha', n.ficha,
$b$),
    (5, $a$pasto_id, bem_id, observacao,
      comprimento_m, area_ha, versao, criado_por)$a$, $b$pasto_id, bem_id, observacao, ficha,
      comprimento_m, area_ha, versao, criado_por)$b$),
    (6, $a$n.pasto_id, n.bem_id, n.observacao,
      n.comprimento_m, n.area_ha, 1, auth.uid());$a$, $b$n.pasto_id, n.bem_id, n.observacao, n.ficha,
      n.comprimento_m, n.area_ha, 1, auth.uid());$b$),
    (7, $a$'observacao', n.observacao), nullif$a$, $b$'observacao', n.observacao, 'ficha', n.ficha), nullif$b$),
    (8, $a$observacao = n.observacao,
    comprimento_m$a$, $b$observacao = n.observacao, ficha = n.ficha,
    comprimento_m$b$)
  ) t(i, antes, depois) order by i loop
    if (length(d) - length(replace(d, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'INFRA-FICHAS: trecho % do fn_infra_salvar não casa 1 vez', r.i;
    end if;
    d := replace(d, r.antes, r.depois);
  end loop;
  execute d;
end $patch$;

-- 5. Criar o bem no Patrimônio a partir da infraestrutura e ligar, numa transação ---------------------------------------------------
create or replace function public.fn_infra_criar_bem(p_infra_id uuid, p_versao integer, p_bem jsonb, p_simular boolean default true,
  p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  o public.fazenda_infraestruturas%rowtype;
  v_cat public.patrimonio_categorias%rowtype;
  v_b jsonb; r jsonb; v_bem uuid;
begin
  select * into o from public.fazenda_infraestruturas where id = p_infra_id;
  if o.id is null or not coalesce(public.tenant_ok(o.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_versao is distinct from o.versao then
    raise exception using errcode = '40001', message = 'Esta infraestrutura foi alterada por outra pessoa. Feche e abra de novo.';
  end if;
  if not o.ativo then raise exception using errcode = 'P0001', message = 'Esta infraestrutura está desativada: não se edita.'; end if;
  if o.bem_id is not null then
    raise exception using errcode = 'P0001',
      message = 'Esta infraestrutura já está ligada a um bem do Patrimônio: troque pelo "Ligar a um bem existente".';
  end if;
  if p_bem is null or jsonb_typeof(p_bem) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Preencha o bem do Patrimônio.';
  end if;
  select * into v_cat from public.patrimonio_categorias c
   where c.codigo = p_bem->>'categoria_codigo' and c.ativo and (c.cliente_id = o.cliente_id or c.cliente_id is null)
   order by c.cliente_id is null limit 1;
  if v_cat.id is null then
    raise exception using errcode = 'P0001', message = 'A categoria do Patrimônio deste tipo não foi encontrada.';
  end if;

  -- o bem nasce na fazenda e no cliente da infraestrutura, na categoria do tipo; id/versão/cliente do p_bem nunca valem
  v_b := (p_bem - 'categoria_codigo' - 'id' - 'versao' - 'cliente_id' - 'fazenda_id' - 'categoria_id')
         || jsonb_build_object('cliente_id', o.cliente_id, 'fazenda_id', o.fazenda_id, 'categoria_id', v_cat.id,
                               'situacao', coalesce(nullif(p_bem->>'situacao', ''), 'em_uso'));

  if p_simular then
    r := public.fn_patrimonio_bem_salvar(v_b, true, p_motivo);
    return jsonb_build_object('ok', true, 'simulado', true, 'infra_id', o.id, 'rotulo', public._fn_infra_rotulo(o.tipo), 'bem', r);
  end if;

  r := public.fn_patrimonio_bem_salvar(v_b, false, p_motivo);
  v_bem := (r->>'id')::uuid;
  update public.fazenda_infraestruturas set bem_id = v_bem, versao = o.versao + 1, alterado_em = now(), alterado_por = auth.uid()
   where id = o.id and versao = o.versao;
  if not found then
    raise exception using errcode = '40001', message = 'Esta infraestrutura foi alterada por outra pessoa. Feche e abra de novo.';
  end if;
  insert into public.fazenda_infraestrutura_trilha (cliente_id, infra_id, acao, antes, depois, motivo, por)
  values (o.cliente_id, o.id, 'alterar', jsonb_build_object('bem_id', null), jsonb_build_object('bem_id', v_bem),
          coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'criou o bem ' || coalesce(r->>'codigo', '') || ' no Patrimônio'), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'infra_id', o.id, 'versao', o.versao + 1, 'bem_id', v_bem, 'codigo', r->>'codigo');
end $$;

revoke all on function public.fn_infra_criar_bem(uuid, integer, jsonb, boolean, text) from public, anon;
grant execute on function public.fn_infra_criar_bem(uuid, integer, jsonb, boolean, text) to authenticated, service_role;
