-- LOTE-PADRAO-V3 · L2 CADASTRO (mock lote-padrao-v3.html aprovado 12/11 13:31; ordem de parto Chat 14:10; fatias Chat 15:05).
-- Só ADITIVA: colunas NULAS no lote, uma função interna e as chaves novas na fn_lote_salvar. Nenhum lote nem cadastro muda nesta migration
-- (o legado é lido como está até a L6). Listas FIXAS do AGROinBLUE, iguais para todos: o cliente só acrescenta raças e marcadores.
--  · categoria FIXA = a do rebanho (vacas, novilhas, desmama F/M, garrotes, bois, touros): a gravação manda 'categoria_rebanho' (o código) e
--    _fn_lote_categoria_fixa acha o cadastro do cliente — o de mesma sigla fixa e mesma categoria, senão o de mesmo nome e mesma categoria
--    (fica com a sigla dele: nenhum código muda), senão cria (sigla fixa VAC·NOV·DSF·DSM·GAR·BOI·TOU); sigla ou nome já usados em OUTRA
--    categoria = recusa com a frase. O cadastro fica marcado `fixo`.
--  · raça: a do cadastro + composicao_racas (raças do mesmo cliente) · nascimento de/até (a idade é calculada, nunca digitada)
--  · situação em 2 perguntas (só fêmeas): cria_ao_pe (solteira|parida) × prenhez (vazia|prenha|sem_diagnostico); prenha → de quê, raça, parto
--  · ordem de parto: SEM (Sem parto) · PRI · SEC · MUL · bezerros: carimbos (117580) + cab por carimbo + raça do pai (o sêmen/touro já existe)
--  · programa fixo (reproducao|recria|terminacao|descarte|venda) + método (reprodução) + entrada (novilhas) · sistema fixo · marcadores
set local lock_timeout = '2s';

-- 1. as colunas (nulas) e as listas fixas
alter table public.rebanho_lote_cadastros add column fixo boolean not null default false;
comment on column public.rebanho_lote_cadastros.fixo is 'LOTE-PADRAO-V3 L2: o cadastro de categoria que representa uma categoria FIXA do rebanho (o assistente v3 só mostra estas)';
alter table public.rebanho_lotes
  add column composicao_racas uuid[],
  add column nascido_de date,
  add column nascido_ate date,
  add column cria_ao_pe text check (cria_ao_pe in ('solteira', 'parida')),
  add column prenhez text check (prenhez in ('vazia', 'prenha', 'sem_diagnostico')),
  add column prenha_de text check (prenha_de in ('iatf', 'monta')),
  add column prenha_raca_id uuid,
  add column parto_previsto date,
  add column bezerros_pai_raca_id uuid,
  add column carimbos_cab integer[],
  add column programa_lote text check (programa_lote in ('reproducao', 'recria', 'terminacao', 'descarte', 'venda')),
  add column metodo_reproducao text check (metodo_reproducao in ('iatf', 'iatf_repasse', 'monta')),
  add column entrada_novilha text check (entrada_novilha in ('superprecoce', 'precoce', 'convencional')),
  add column sistema_lote text check (sistema_lote in ('pasto', 'pasto_suplemento', 'tip', 'semi', 'confinamento')),
  add column marcadores text[],
  add constraint rebanho_lotes_nascido_ok check (nascido_de is null or nascido_ate is null or nascido_ate >= nascido_de),
  add constraint rebanho_lotes_carimbos_cab_ok check (carimbos_cab is null or (carimbos is not null and cardinality(carimbos_cab) = cardinality(carimbos))),
  add constraint rebanho_lotes_prenha_ok check (prenhez = 'prenha' or (prenha_de is null and prenha_raca_id is null and parto_previsto is null)),
  add constraint rebanho_lotes_metodo_ok check (metodo_reproducao is null or programa_lote = 'reproducao'),
  add constraint rebanho_lotes_parida_tem_carimbos check (cria_ao_pe is distinct from 'parida' or carimbos is not null);
alter table public.rebanho_lotes drop constraint rebanho_lotes_ordem_parto_check;
alter table public.rebanho_lotes add constraint rebanho_lotes_ordem_parto_check check (ordem_parto in ('SEM', 'PRI', 'SEC', 'MUL'));

-- 2. a categoria fixa → o cadastro do cliente (acha ou cria; interna, fechada; quem chama é a fn_lote_salvar)
create or replace function public._fn_lote_categoria_fixa(p_cliente uuid, p_codigo text) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_reb uuid; v_sigla text; v_nome text; v_ordem int; v_id uuid; v_conf text;
begin
  /* guarda de cliente (SEG-DRE-TENANT-01): a migration (sessão postgres) ou quem é do cliente; senão 42501 */
  if not (session_user = 'postgres' or public.tenant_ok(p_cliente)) then
    raise exception using errcode = '42501', message = 'sem acesso a este cliente';
  end if;
  select f.sigla, f.nome, f.ordem into v_sigla, v_nome, v_ordem
    from (values ('vacas', 'VAC', 'Vacas', 10), ('novilhas', 'NOV', 'Novilhas', 20), ('desmama_f', 'DSF', 'Desmama fêmea', 30),
                 ('desmama_m', 'DSM', 'Desmama macho', 40), ('garrotes', 'GAR', 'Garrotes', 50), ('bois', 'BOI', 'Bois', 60),
                 ('touros', 'TOU', 'Touros', 70)) f(codigo, sigla, nome, ordem)
   where f.codigo = p_codigo;
  if v_sigla is null then
    raise exception using errcode = 'P0001', message = 'Categoria: escolha da lista (vacas, novilhas, desmama, garrotes, bois, touros).';
  end if;
  select id into v_reb from public.categorias_rebanho where codigo = p_codigo;
  /* 1. a mesma sigla fixa e a mesma categoria do rebanho · 2. o mesmo nome e a mesma categoria (fica com a sigla dele) */
  select c.id into v_id from public.rebanho_lote_cadastros c
   where c.cliente_id = p_cliente and c.tipo = 'categoria' and c.ativo and c.categorias_rebanho = array[v_reb]
   order by (c.sigla = v_sigla) desc, (lower(c.nome) = lower(v_nome)) desc, c.fixo desc, c.ordem
   limit 1;
  if v_id is not null and exists (select 1 from public.rebanho_lote_cadastros c where c.id = v_id and (c.sigla = v_sigla or lower(c.nome) = lower(v_nome) or c.fixo)) then
    if not (select fixo from public.rebanho_lote_cadastros where id = v_id) then
      perform set_config('app.lote_escritor', '1', true);
      update public.rebanho_lote_cadastros set fixo = true, atualizado_em = now() where id = v_id;
      perform set_config('app.lote_escritor', '', true);
    end if;
    return v_id;
  end if;
  /* sigla ou nome já usados em OUTRA categoria do cliente: não cria por cima */
  select string_agg(format('%s “%s”', c.sigla, c.nome), ', ') into v_conf from public.rebanho_lote_cadastros c
   where c.cliente_id = p_cliente and c.tipo = 'categoria' and c.ativo and (c.sigla = v_sigla or lower(c.nome) = lower(v_nome));
  if v_conf is not null then
    raise exception using errcode = 'P0001', message = format('A categoria %s já tem cadastro diferente (%s): ajuste nos cadastros dos lotes.', v_nome, v_conf);
  end if;
  perform set_config('app.lote_escritor', '1', true);
  insert into public.rebanho_lote_cadastros (cliente_id, tipo, sigla, nome, categorias_rebanho, ordem, fixo)
  values (p_cliente, 'categoria', v_sigla, v_nome, array[v_reb], v_ordem, true) returning id into v_id;
  perform set_config('app.lote_escritor', '', true);
  return v_id;
end $$;
revoke all on function public._fn_lote_categoria_fixa(uuid, text) from public, anon, authenticated;

-- 3. fn_lote_salvar: as chaves novas, as listas e as regras (patch guardado por md5; cada âncora casa 1x)
do $patch$
declare
  v_oid oid := 'public.fn_lote_salvar(uuid, uuid, jsonb, integer, text, boolean)'::regprocedure;
  v_def text; v_n integer; v_par text[];
  v_pares text[] := array[
    -- A1: as chaves aceitas
    $a$'mamotes_semen', 'anotacao', 'carimbos'];$a$,
    $b$'mamotes_semen', 'anotacao', 'carimbos',
                                'categoria_rebanho', 'composicao_racas', 'nascido_de', 'nascido_ate', 'cria_ao_pe', 'prenhez', 'prenha_de',
                                'prenha_raca_id', 'parto_previsto', 'bezerros_pai_raca_id', 'carimbos_cab', 'programa_lote', 'metodo_reproducao',
                                'entrada_novilha', 'sistema_lote', 'marcadores'];$b$,
    -- A1b: a categoria FIXA vira o cadastro do cliente ANTES da checagem "escolha a categoria" (acha ou cria)
    $a$  if p_campos ? 'atividade_id' then n.atividade_id := nullif(p_campos->>'atividade_id', '')::uuid; end if;$a$,
    $b$  if p_campos ? 'atividade_id' then n.atividade_id := nullif(p_campos->>'atividade_id', '')::uuid; end if;
  /* LOTE-PADRAO-V3 · L2 — a categoria FIXA do rebanho (o código: vacas, novilhas…) → o cadastro do cliente */
  if p_campos ? 'categoria_rebanho' then
    n.categoria_id := public._fn_lote_categoria_fixa(v_cli, nullif(lower(btrim(coalesce(p_campos->>'categoria_rebanho', ''))), ''));
  end if;$b$,
    -- A2: ordem de parto com "Sem parto"
    $a$  if n.ordem_parto is not null and n.ordem_parto not in ('PRI', 'SEC', 'MUL') then
    raise exception using errcode = 'P0001', message = 'Ordem de parto: primípara, secundípara ou multípara.';$a$,
    $b$  if n.ordem_parto is not null and n.ordem_parto not in ('SEM', 'PRI', 'SEC', 'MUL') then
    raise exception using errcode = 'P0001', message = 'Ordem de parto: sem parto, primípara, secundípara ou multípara.';$b$,
    -- A3: o bloco do padrão v3 (antes da regra da parida de sempre)
    $a$  /* parida (PA/PP/VZ) pede o carimbo; mojada (PR) nunca pede */$a$,
    $b$  /* LOTE-PADRAO-V3 · L2 — o cadastro padrão (listas fixas; frases para o campo) */
  if p_campos ? 'composicao_racas' then
    n.composicao_racas := (select nullif(array_agg(distinct (e)::uuid), '{}') from jsonb_array_elements_text(
                             coalesce(nullif(p_campos->'composicao_racas', 'null'::jsonb), '[]'::jsonb)) e where btrim(e) <> '');
  end if;
  if exists (select 1 from unnest(n.composicao_racas) r where not exists (
               select 1 from public.rebanho_lote_cadastros c where c.id = r and c.cliente_id = n.cliente_id and c.tipo = 'raca')) then
    raise exception using errcode = 'P0001', message = 'Composição: escolha raças do cadastro.';
  end if;
  if p_campos ? 'nascido_de' then n.nascido_de := nullif(btrim(coalesce(p_campos->>'nascido_de', '')), '')::date; end if;
  if p_campos ? 'nascido_ate' then n.nascido_ate := nullif(btrim(coalesce(p_campos->>'nascido_ate', '')), '')::date; end if;
  if n.nascido_de > current_date or n.nascido_ate > current_date then
    raise exception using errcode = 'P0001', message = 'Nascimento: a data não pode ser depois de hoje.';
  end if;
  if n.nascido_de is not null and n.nascido_ate is not null and n.nascido_ate < n.nascido_de then
    raise exception using errcode = 'P0001', message = 'Nascimento: o "até" vem depois do "de".';
  end if;
  if p_campos ? 'cria_ao_pe' then n.cria_ao_pe := nullif(lower(btrim(coalesce(p_campos->>'cria_ao_pe', ''))), ''); end if;
  if n.cria_ao_pe is not null and n.cria_ao_pe not in ('solteira', 'parida') then
    raise exception using errcode = 'P0001', message = 'Cria ao pé: solteira ou parida.';
  end if;
  if p_campos ? 'prenhez' then n.prenhez := nullif(lower(btrim(coalesce(p_campos->>'prenhez', ''))), ''); end if;
  if n.prenhez is not null and n.prenhez not in ('vazia', 'prenha', 'sem_diagnostico') then
    raise exception using errcode = 'P0001', message = 'Prenhez: vazia, prenha ou sem diagnóstico.';
  end if;
  if p_campos ? 'prenha_de' then n.prenha_de := nullif(lower(btrim(coalesce(p_campos->>'prenha_de', ''))), ''); end if;
  if n.prenha_de is not null and n.prenha_de not in ('iatf', 'monta') then
    raise exception using errcode = 'P0001', message = 'Prenha de: IATF ou monta natural.';
  end if;
  if p_campos ? 'prenha_raca_id' then n.prenha_raca_id := nullif(btrim(coalesce(p_campos->>'prenha_raca_id', '')), '')::uuid; end if;
  if p_campos ? 'parto_previsto' then n.parto_previsto := nullif(btrim(coalesce(p_campos->>'parto_previsto', '')), '')::date; end if;
  if p_campos ? 'bezerros_pai_raca_id' then n.bezerros_pai_raca_id := nullif(btrim(coalesce(p_campos->>'bezerros_pai_raca_id', '')), '')::uuid; end if;
  if exists (select 1 from unnest(array[n.prenha_raca_id, n.bezerros_pai_raca_id]) r where r is not null and not exists (
               select 1 from public.rebanho_lote_cadastros c where c.id = r and c.cliente_id = n.cliente_id and c.tipo = 'raca')) then
    raise exception using errcode = 'P0001', message = 'Raça do pai: escolha do cadastro.';
  end if;
  if n.prenhez is distinct from 'prenha' and (n.prenha_de is not null or n.prenha_raca_id is not null or n.parto_previsto is not null) then
    raise exception using errcode = 'P0001', message = 'Prenha de e parto previsto: só quando a prenhez é "prenha".';
  end if;
  if p_campos ? 'carimbos_cab' then
    n.carimbos_cab := (select array_agg(case when btrim(e) = '' then null else (e)::int end order by i) from jsonb_array_elements_text(
                         coalesce(nullif(p_campos->'carimbos_cab', 'null'::jsonb), '[]'::jsonb)) with ordinality t(e, i));
    if n.carimbos_cab is not null and (n.carimbos is null or cardinality(n.carimbos_cab) <> cardinality(n.carimbos)) then
      raise exception using errcode = 'P0001', message = 'Cabeças por carimbo: uma para cada carimbo.';
    end if;
    if exists (select 1 from unnest(n.carimbos_cab) c where c < 0) then
      raise exception using errcode = 'P0001', message = 'Cabeças por carimbo: número inteiro, zero ou mais.';
    end if;
  end if;
  if p_campos ? 'carimbos' and n.carimbos_cab is not null and (n.carimbos is null or cardinality(n.carimbos_cab) <> cardinality(n.carimbos)) then
    n.carimbos_cab := null;   -- a lista de carimbos mudou sem as cabeças: as cabeças de antes não valem mais
  end if;
  if p_campos ? 'programa_lote' then n.programa_lote := nullif(lower(btrim(coalesce(p_campos->>'programa_lote', ''))), ''); end if;
  if n.programa_lote is not null and n.programa_lote not in ('reproducao', 'recria', 'terminacao', 'descarte', 'venda') then
    raise exception using errcode = 'P0001', message = 'Programa: reprodução, recria, terminação, descarte ou venda.';
  end if;
  if p_campos ? 'metodo_reproducao' then n.metodo_reproducao := nullif(lower(btrim(coalesce(p_campos->>'metodo_reproducao', ''))), ''); end if;
  if n.metodo_reproducao is not null and (n.metodo_reproducao not in ('iatf', 'iatf_repasse', 'monta') or n.programa_lote is distinct from 'reproducao') then
    raise exception using errcode = 'P0001', message = 'Método: IATF, IATF + repasse ou monta natural — só no programa reprodução.';
  end if;
  if p_campos ? 'entrada_novilha' then n.entrada_novilha := nullif(lower(btrim(coalesce(p_campos->>'entrada_novilha', ''))), ''); end if;
  if n.entrada_novilha is not null and n.entrada_novilha not in ('superprecoce', 'precoce', 'convencional') then
    raise exception using errcode = 'P0001', message = 'Entrada das novilhas: superprecoce, precoce ou convencional.';
  end if;
  if p_campos ? 'sistema_lote' then n.sistema_lote := nullif(lower(btrim(coalesce(p_campos->>'sistema_lote', ''))), ''); end if;
  if n.sistema_lote is not null and n.sistema_lote not in ('pasto', 'pasto_suplemento', 'tip', 'semi', 'confinamento') then
    raise exception using errcode = 'P0001', message = 'Onde: pasto, pasto + suplemento, TIP, semiconfinamento ou confinamento.';
  end if;
  if p_campos ? 'marcadores' then
    n.marcadores := (select nullif(array_agg(z.m order by z.i), '{}') from (select btrim(e) as m, min(i) as i from jsonb_array_elements_text(
                       coalesce(nullif(p_campos->'marcadores', 'null'::jsonb), '[]'::jsonb)) with ordinality t(e, i) where btrim(e) <> '' group by btrim(e)) z);
  end if;
  if cardinality(n.marcadores) > 10 or exists (select 1 from unnest(n.marcadores) m where length(m) > 32) then
    raise exception using errcode = 'P0001', message = 'Marcadores: até 10, cada um com até 32 letras.';
  end if;
  if n.cria_ao_pe = 'parida' and n.carimbos is null then
    raise exception using errcode = 'P0001', message = 'Parida: informe o carimbo (mês.lote, ex.: 7.1).';
  end if;

  /* parida (PA/PP/VZ) pede o carimbo; mojada (PR) nunca pede */$b$,
    -- A4/A5: o INSERT grava as colunas novas
    $a$mamotes_semen, anotacao, codigo_regra, carimbos)$a$,
    $b$mamotes_semen, anotacao, codigo_regra, carimbos,
      composicao_racas, nascido_de, nascido_ate, cria_ao_pe, prenhez, prenha_de, prenha_raca_id, parto_previsto, bezerros_pai_raca_id,
      carimbos_cab, programa_lote, metodo_reproducao, entrada_novilha, sistema_lote, marcadores)$b$,
    $a$n.mamotes_semen, n.anotacao, n.codigo_regra, n.carimbos)$a$,
    $b$n.mamotes_semen, n.anotacao, n.codigo_regra, n.carimbos,
      n.composicao_racas, n.nascido_de, n.nascido_ate, n.cria_ao_pe, n.prenhez, n.prenha_de, n.prenha_raca_id, n.parto_previsto, n.bezerros_pai_raca_id,
      n.carimbos_cab, n.programa_lote, n.metodo_reproducao, n.entrada_novilha, n.sistema_lote, n.marcadores)$b$,
    -- A6: o UPDATE grava as colunas novas
    $a$anotacao = n.anotacao, carimbos = n.carimbos,$a$,
    $b$anotacao = n.anotacao, carimbos = n.carimbos,
      composicao_racas = n.composicao_racas, nascido_de = n.nascido_de, nascido_ate = n.nascido_ate, cria_ao_pe = n.cria_ao_pe,
      prenhez = n.prenhez, prenha_de = n.prenha_de, prenha_raca_id = n.prenha_raca_id, parto_previsto = n.parto_previsto,
      bezerros_pai_raca_id = n.bezerros_pai_raca_id, carimbos_cab = n.carimbos_cab, programa_lote = n.programa_lote,
      metodo_reproducao = n.metodo_reproducao, entrada_novilha = n.entrada_novilha, sistema_lote = n.sistema_lote, marcadores = n.marcadores,$b$
  ];
begin
  if (select md5(prosrc) from pg_proc where oid = v_oid) <> 'c76bd216df8a827ab76887c2e450b6b1' then
    raise exception 'fn_lote_salvar não é a da 117580 (md5 do corpo mudou): nada aplicado';
  end if;
  v_def := pg_get_functiondef(v_oid);
  for i in 1 .. array_length(v_pares, 1) / 2 loop
    v_par := array[v_pares[2 * i - 1], v_pares[2 * i]];
    v_n := (length(v_def) - length(replace(v_def, v_par[1], ''))) / length(v_par[1]);
    if v_n <> 1 then raise exception 'âncora A% casa % vez(es), não 1: nada aplicado', i, v_n; end if;
    v_def := replace(v_def, v_par[1], v_par[2]);
  end loop;
  execute v_def;
end $patch$;
