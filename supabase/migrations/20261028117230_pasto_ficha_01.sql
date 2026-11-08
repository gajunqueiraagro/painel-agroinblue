-- PASTO-FICHA-01 · PR A (banco) — Gabriel 03/11 16:02: D1–D8 como recomendado; D6 = o Novo pasto pela fn_pasto_criar com prévia.
-- A ficha do pasto (mock aprovado 30/10, ~/Downloads/mock-pastos-v2.html) substitui o "Editar Pasto". Este PR é só o banco:
--   1. o catálogo (`catalogo_itens`, LISTAS-DIGITAVEIS-01) abre as listas do pasto: forrageira, relevo, textura_solo, drenagem, sombra —
--      com as globais semeadas (trilha "criar" por item). A CERCA não entra: o tipo de cerca mora na ficha da infraestrutura (D1);
--   2. `pastos` ganha os campos da ficha (posse, forrageiras, solo, sombra, manejo, implantação) + `ficha_versao`; esses campos SÓ mudam
--      pelos escritores desta migration (gatilho, como a estrutura e o grupo);
--   3. `pasto_condicoes` (vazia) vira a AVALIAÇÃO COM DATA: cercas, água, cochos, invasoras, cupins, erosão, degradação, cobertura,
--      suporte nas águas e na seca, avaliador; nada se apaga (cancelar com motivo); trilha no audit_log;
--   4. escritores com prévia: `fn_pasto_ficha_salvar` (sem a área: ela muda SÓ pela `fn_pasto_area_editar`, com o "a partir de"),
--      `fn_pasto_criar` (a área nasce com vigência desde o "em uso desde"; mês fechado recusa), `fn_pasto_avaliacao_salvar` / `_desfazer`;
--   5. leitores: `fn_pasto_ficha` (cadastro + resumo + cadastro × mapa pela `fn_pastos_area_comparar`), `fn_pasto_reformas` (Patrimônio,
--      bem de categoria com pastos), `fn_pasto_lotacao_meses` (a `fn_lotacao_do_mes` de cada mês + o suporte da avaliação da época).
-- Tudo nasce fechado: SECURITY DEFINER, search_path fixo, tenant_ok pela linha (42501), REVOKE de PUBLIC/anon.

set local lock_timeout = '2s';

-- ── 1 · catálogo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.catalogo_itens drop constraint catalogo_itens_lista_check;
alter table public.catalogo_itens add constraint catalogo_itens_lista_check
  check (lista in ('motivo_morte', 'forrageira', 'relevo', 'textura_solo', 'drenagem', 'sombra'));

with semente(lista, grupo, nome, apelidos, ordem) as (values
  ('forrageira', 'Urochloa brizantha', 'Marandu (braquiarão)', array['braquiarao', 'brizantha', 'brachiaria brizantha marandu'], 10),
  ('forrageira', 'Urochloa brizantha', 'Xaraés (MG-5)', array['xaraes', 'mg5', 'mg 5'], 20),
  ('forrageira', 'Urochloa brizantha', 'Piatã', array['piata'], 30),
  ('forrageira', 'Urochloa brizantha', 'Paiaguás', array['paiaguas'], 40),
  ('forrageira', 'Urochloa híbrida', 'BRS Ipyporã', array['ipypora'], 50),
  ('forrageira', 'Urochloa híbrida', 'Mulato II', array['mulato'], 60),
  ('forrageira', 'Urochloa decumbens', 'Decumbens (basilisk)', array['decumbens', 'braquiarinha', 'basilisk'], 70),
  ('forrageira', 'Urochloa humidicola', 'Humidícola', array['humidicola', 'quicuio da amazonia'], 80),
  ('forrageira', 'Urochloa humidicola', 'Llanero (dictyoneura)', array['llanero', 'dictyoneura'], 90),
  ('forrageira', 'Urochloa ruziziensis', 'Ruziziensis', array['ruzi', 'ruziziensis'], 100),
  ('forrageira', 'Megathyrsus maximus', 'Mombaça', array['mombaca', 'panicum mombaca'], 110),
  ('forrageira', 'Megathyrsus maximus', 'Tanzânia', array['tanzania'], 120),
  ('forrageira', 'Megathyrsus maximus', 'Zuri', array['brs zuri'], 130),
  ('forrageira', 'Megathyrsus maximus', 'Massai', array['massai'], 140),
  ('forrageira', 'Megathyrsus maximus', 'Quênia', array['quenia', 'brs quenia'], 150),
  ('forrageira', 'Megathyrsus maximus', 'Tamani', array['brs tamani'], 160),
  ('forrageira', 'Megathyrsus maximus', 'Colonião', array['coloniao'], 170),
  ('forrageira', 'Cynodon', 'Tifton 85', array['tifton'], 180),
  ('forrageira', 'Cynodon', 'Jiggs', array['jiggs'], 190),
  ('forrageira', 'Cynodon', 'Coastcross', array['coast cross'], 200),
  ('forrageira', 'Cynodon', 'Estrela-africana', array['estrela', 'estrela africana'], 210),
  ('forrageira', 'Andropogon gayanus', 'Andropogon (planaltina)', array['andropogon', 'planaltina'], 220),
  ('forrageira', 'Pennisetum purpureum', 'Capim-elefante (napier)', array['elefante', 'napier', 'capineira'], 230),
  ('forrageira', 'Pennisetum purpureum', 'BRS Capiaçu', array['capiacu'], 240),
  ('forrageira', 'Paspalum notatum', 'Grama-batatais', array['batatais', 'paspalum'], 250),
  ('forrageira', 'Leguminosa', 'Estilosantes Campo Grande', array['estilosantes', 'stylosanthes', 'campo grande'], 260),
  ('forrageira', 'Leguminosa', 'Amendoim forrageiro', array['amendoim', 'arachis pintoi'], 270),
  ('forrageira', 'Leguminosa', 'Leucena', array['leucaena'], 280),
  ('forrageira', 'Leguminosa', 'Feijão-guandu', array['guandu', 'cajanus'], 290),
  ('forrageira', 'Leguminosa', 'Calopogônio', array['calopogonio'], 300),
  ('forrageira', 'Nativa', 'Pastagem nativa', array['nativa', 'campo nativo'], 310),
  ('relevo', 'Declividade', 'Plano (0–3%)', array['plano'], 10),
  ('relevo', 'Declividade', 'Suave ondulado (3–8%)', array['suave ondulado'], 20),
  ('relevo', 'Declividade', 'Ondulado (8–20%)', array['ondulado'], 30),
  ('relevo', 'Declividade', 'Forte ondulado (20–45%)', array['forte ondulado'], 40),
  ('relevo', 'Declividade', 'Montanhoso (45–75%)', array['montanhoso'], 50),
  ('textura_solo', 'Textura', 'Arenoso', array['areia', 'arenosa'], 10),
  ('textura_solo', 'Textura', 'Médio (franco)', array['medio', 'franco', 'textura media'], 20),
  ('textura_solo', 'Textura', 'Argiloso', array['argila', 'argilosa'], 30),
  ('textura_solo', 'Textura', 'Muito argiloso', array['muito argilosa'], 40),
  ('textura_solo', 'Textura', 'Siltoso', array['silte'], 50),
  ('drenagem', 'Drenagem', 'Boa', array['bem drenado'], 10),
  ('drenagem', 'Drenagem', 'Moderada', array['moderadamente drenado'], 20),
  ('drenagem', 'Drenagem', 'Imperfeita', array['imperfeitamente drenado'], 30),
  ('drenagem', 'Drenagem', 'Má (encharca)', array['mal drenado', 'encharca', 'brejo'], 40),
  ('sombra', 'Sombra', 'Natural — árvores / capões', array['arvores', 'capao', 'natural'], 10),
  ('sombra', 'Sombra', 'Natural — mata / reserva', array['mata', 'reserva'], 20),
  ('sombra', 'Sombra', 'Silvipastoril (ILPF)', array['ilpf', 'silvipastoril', 'eucalipto'], 30),
  ('sombra', 'Sombra', 'Artificial — sombrite', array['sombrite', 'artificial'], 40),
  ('sombra', 'Sombra', 'Sem sombra', array['sem'], 50)
), novos as (
  insert into public.catalogo_itens (lista, cliente_id, grupo, nome, nome_busca, apelidos, ordem, ativo)
  select s.lista, null, s.grupo, s.nome, public._fn_normalizar_texto(s.nome),
         array(select public._fn_normalizar_texto(a) from unnest(s.apelidos) a), s.ordem, true
    from semente s
   where not exists (select 1 from public.catalogo_itens i
                      where i.lista = s.lista and i.cliente_id is null and i.ativo and i.nome_busca = public._fn_normalizar_texto(s.nome))
  returning id, lista, nome
)
insert into public.catalogo_itens_trilha (item_id, acao, depois, autor, via)
select n.id, 'criar', jsonb_build_object('nome', n.nome, 'lista', n.lista, 'cliente_id', null), null, 'sistema:PASTO-FICHA-01 (semeadura)'
  from novos n;

-- ── 2 · pastos: os campos da ficha ───────────────────────────────────────────────────────────────────────────────────────────────
alter table public.pastos
  add column posse text,
  add column forrageira_principal_id uuid references public.catalogo_itens(id),
  add column forrageira_secundaria_id uuid references public.catalogo_itens(id),
  add column forrageira_implantada_em date,
  add column relevo_id uuid references public.catalogo_itens(id),
  add column textura_id uuid references public.catalogo_itens(id),
  add column drenagem_id uuid references public.catalogo_itens(id),
  add column sombra_id uuid references public.catalogo_itens(id),
  add column sombra_cobertura text,
  add column manejo text,
  add column ficha_versao integer not null default 1;

alter table public.pastos
  add constraint pastos_posse_chk check (posse is null or posse in ('propria', 'arrendada_de_terceiro', 'cedida_a_terceiro')),
  add constraint pastos_sombra_cobertura_chk check (sombra_cobertura is null or sombra_cobertura in ('insuficiente', 'parcial', 'suficiente')),
  add constraint pastos_manejo_chk check (manejo is null or manejo in ('continuo', 'rotacionado')),
  add constraint pastos_forrageiras_distintas_chk check (forrageira_secundaria_id is null or forrageira_secundaria_id <> forrageira_principal_id),
  add constraint pastos_implantada_mes_chk check (forrageira_implantada_em is null
                                                  or forrageira_implantada_em = date_trunc('month', forrageira_implantada_em)::date);

comment on column public.pastos.posse is 'PASTO-FICHA-01: propria · arrendada_de_terceiro · cedida_a_terceiro. Muda só pela fn_pasto_ficha_salvar / fn_pasto_criar.';
comment on column public.pastos.ficha_versao is 'PASTO-FICHA-01: versão da ficha (40001 quando outra pessoa salvou antes).';

create or replace function public._fn_pastos_ficha_so_pelo_escritor()
returns trigger language plpgsql set search_path to 'pg_catalog', 'public' as $$
begin
  if coalesce(current_setting('app.pasto_ficha_escritor', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if new.posse is not null or new.forrageira_principal_id is not null or new.forrageira_secundaria_id is not null
       or new.forrageira_implantada_em is not null or new.relevo_id is not null or new.textura_id is not null or new.drenagem_id is not null
       or new.sombra_id is not null or new.sombra_cobertura is not null or new.manejo is not null or new.ficha_versao <> 1 then
      raise exception using errcode = 'P0001', message = 'Os dados da ficha do pasto gravam só pela ficha. Nada foi gravado.';
    end if;
  elsif (new.posse, new.forrageira_principal_id, new.forrageira_secundaria_id, new.forrageira_implantada_em, new.relevo_id, new.textura_id,
         new.drenagem_id, new.sombra_id, new.sombra_cobertura, new.manejo, new.ficha_versao)
        is distinct from
        (old.posse, old.forrageira_principal_id, old.forrageira_secundaria_id, old.forrageira_implantada_em, old.relevo_id, old.textura_id,
         old.drenagem_id, old.sombra_id, old.sombra_cobertura, old.manejo, old.ficha_versao) then
    raise exception using errcode = 'P0001', message = 'Os dados da ficha do pasto gravam só pela ficha. Nada foi gravado.';
  end if;
  return new;
end $$;
revoke all on function public._fn_pastos_ficha_so_pelo_escritor() from public, anon, authenticated;

create trigger trg_pastos_ficha_so_pelo_escritor
  before insert or update on public.pastos
  for each row execute function public._fn_pastos_ficha_so_pelo_escritor();

-- ── 3 · pasto_condicoes = a avaliação com data ───────────────────────────────────────────────────────────────────────────────────
alter table public.pasto_condicoes alter column condicao drop not null;
alter table public.pasto_condicoes
  add column cliente_id uuid references public.clientes(id),
  add column fazenda_id uuid references public.fazendas(id),
  add column cercas text,
  add column agua text,
  add column cochos text,
  add column invasoras text,
  add column cupins text,
  add column erosao text,
  add column degradacao text,
  add column cobertura_pct numeric,
  add column suporte_aguas_ua_ha numeric,
  add column suporte_seca_ua_ha numeric,
  add column avaliador text,
  add column criado_por uuid,
  add column alterado_em timestamptz,
  add column alterado_por uuid,
  add column cancelado boolean not null default false,
  add column cancelado_motivo text,
  add column cancelado_por uuid,
  add column cancelado_em timestamptz;

alter table public.pasto_condicoes
  add constraint pasto_condicoes_pasto_fk foreign key (pasto_id) references public.pastos(id),
  add constraint pasto_condicoes_estado_chk check (
        (cercas is null or cercas in ('bom', 'regular', 'ruim'))
    and (agua is null or agua in ('bom', 'regular', 'ruim'))
    and (cochos is null or cochos in ('bom', 'regular', 'ruim'))
    and (invasoras is null or invasoras in ('baixo', 'medio', 'alto'))
    and (cupins is null or cupins in ('baixo', 'medio', 'alto'))
    and (erosao is null or erosao in ('sem', 'baixo', 'medio', 'alto'))
    and (degradacao is null or degradacao in ('sem', 'leve', 'moderada', 'forte', 'muito_forte'))),
  add constraint pasto_condicoes_numeros_chk check (
        (cobertura_pct is null or cobertura_pct between 0 and 100)
    and (suporte_aguas_ua_ha is null or suporte_aguas_ua_ha between 0 and 20)
    and (suporte_seca_ua_ha is null or suporte_seca_ua_ha between 0 and 20)),
  add constraint pasto_condicoes_cancelado_chk check ((not cancelado) or (cancelado_motivo is not null));

create index if not exists ix_pasto_condicoes_pasto_data on public.pasto_condicoes (pasto_id, data_avaliacao desc) where not cancelado;

create trigger trg_trilha_cadastro after insert or delete or update on public.pasto_condicoes
  for each row execute function public._fn_trilha_cadastro('cadastros');
create trigger trg_leitura_nao_grava before insert or delete or update on public.pasto_condicoes
  for each statement execute function public._fn_leitura_nao_grava();

-- ── 4 · auxiliares internas ──────────────────────────────────────────────────────────────────────────────────────────────────────
/* o item do catálogo vale para o campo? (a lista certa, ativo, global ou do cliente do pasto) */
create or replace function public._fn_pasto_ficha_item_ok(p_item uuid, p_lista text, p_cliente uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public' as $$
  select p_item is null or exists (select 1 from public.catalogo_itens i
                                    where i.id = p_item and i.lista = p_lista and i.ativo and (i.cliente_id is null or i.cliente_id = p_cliente))
$$;
revoke all on function public._fn_pasto_ficha_item_ok(uuid, text, uuid) from public, anon, authenticated;

/* 'AAAA-MM' → o 1º dia do mês; vazio = null; formato errado = recusa com a frase do campo */
create or replace function public._fn_pasto_ficha_mes(p_txt text, p_rotulo text)
returns date language plpgsql immutable set search_path to 'pg_catalog', 'public' as $$
begin
  if nullif(btrim(coalesce(p_txt, '')), '') is null then return null; end if;
  if p_txt !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception using errcode = 'P0001', message = format('%s: escolha o mês e o ano.', p_rotulo);
  end if;
  return to_date(p_txt || '-01', 'YYYY-MM-DD');
end $$;
revoke all on function public._fn_pasto_ficha_mes(text, text) from public, anon, authenticated;

/* aplica os campos da ficha sobre a linha (salvar e criar usam a MESMA regra) */
create or replace function public._fn_pasto_ficha_aplicar(p public.pastos, p_campos jsonb)
returns public.pastos language plpgsql stable security definer set search_path to 'pg_catalog', 'public' as $$
declare
  k text; n public.pastos := p; v_txt text; v_mes date;
  v_mes_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_ok constant text[] := array['nome', 'tipo_uso', 'observacoes', 'mes_inicio', 'mes_fim', 'posse', 'forrageira_principal_id',
                                'forrageira_secundaria_id', 'forrageira_implantada_em', 'relevo_id', 'textura_id', 'drenagem_id', 'sombra_id',
                                'sombra_cobertura', 'manejo'];
begin
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Nada a gravar.';
  end if;
  for k in select jsonb_object_keys(p_campos) loop
    if k in ('area_produtiva_ha', 'area', 'area_ha') then
      raise exception using errcode = 'P0001', message = 'A área muda só pela área com vigência ("a partir de"), nunca junto com o cadastro. Nada foi gravado.';
    elsif k in ('estrutura', 'grupo_id') then
      raise exception using errcode = 'P0001', message = 'A estrutura e o grupo de pastejo mudam no lugar deles, não na ficha. Nada foi gravado.';
    elsif not (k = any (v_ok)) then
      raise exception using errcode = 'P0001', message = format('Campo desconhecido na ficha: %s. Nada foi gravado.', k);
    end if;
  end loop;

  if p_campos ? 'nome' then
    v_txt := btrim(coalesce(p_campos->>'nome', ''));
    if v_txt = '' then raise exception using errcode = 'P0001', message = 'Digite o nome do pasto.'; end if;
    n.nome := v_txt;
  end if;
  if p_campos ? 'tipo_uso' then
    v_txt := nullif(btrim(coalesce(p_campos->>'tipo_uso', '')), '');
    if v_txt is null then raise exception using errcode = 'P0001', message = 'Escolha o destino padrão.'; end if;
    n.tipo_uso := v_txt;
  end if;
  if p_campos ? 'observacoes' then n.observacoes := nullif(btrim(coalesce(p_campos->>'observacoes', '')), ''); end if;
  if p_campos ? 'mes_inicio' then n.data_inicio := public._fn_pasto_ficha_mes(p_campos->>'mes_inicio', 'Em uso desde'); end if;
  if p_campos ? 'mes_fim' then
    v_mes := public._fn_pasto_ficha_mes(p_campos->>'mes_fim', 'Encerrado em');
    n.data_fim := case when v_mes is null then null else (v_mes + interval '1 month' - interval '1 day')::date end;
  end if;
  if n.data_fim is not null and n.data_inicio is not null and n.data_fim < n.data_inicio then
    raise exception using errcode = 'P0001', message = 'O "encerrado em" não pode ser antes do "em uso desde".';
  end if;
  if p_campos ? 'posse' then
    n.posse := nullif(btrim(coalesce(p_campos->>'posse', '')), '');
    if n.posse is not null and n.posse not in ('propria', 'arrendada_de_terceiro', 'cedida_a_terceiro') then
      raise exception using errcode = 'P0001', message = 'Posse: própria, arrendada de terceiro ou cedida a terceiro.';
    end if;
  end if;
  if p_campos ? 'forrageira_principal_id' then n.forrageira_principal_id := nullif(p_campos->>'forrageira_principal_id', '')::uuid; end if;
  if p_campos ? 'forrageira_secundaria_id' then n.forrageira_secundaria_id := nullif(p_campos->>'forrageira_secundaria_id', '')::uuid; end if;
  if p_campos ? 'relevo_id' then n.relevo_id := nullif(p_campos->>'relevo_id', '')::uuid; end if;
  if p_campos ? 'textura_id' then n.textura_id := nullif(p_campos->>'textura_id', '')::uuid; end if;
  if p_campos ? 'drenagem_id' then n.drenagem_id := nullif(p_campos->>'drenagem_id', '')::uuid; end if;
  if p_campos ? 'sombra_id' then n.sombra_id := nullif(p_campos->>'sombra_id', '')::uuid; end if;
  if not public._fn_pasto_ficha_item_ok(n.forrageira_principal_id, 'forrageira', n.cliente_id)
     or not public._fn_pasto_ficha_item_ok(n.forrageira_secundaria_id, 'forrageira', n.cliente_id) then
    raise exception using errcode = 'P0001', message = 'A forrageira escolhida não está na lista. Escolha de novo.';
  end if;
  if not public._fn_pasto_ficha_item_ok(n.relevo_id, 'relevo', n.cliente_id)
     or not public._fn_pasto_ficha_item_ok(n.textura_id, 'textura_solo', n.cliente_id)
     or not public._fn_pasto_ficha_item_ok(n.drenagem_id, 'drenagem', n.cliente_id)
     or not public._fn_pasto_ficha_item_ok(n.sombra_id, 'sombra', n.cliente_id) then
    raise exception using errcode = 'P0001', message = 'Uma das opções escolhidas não está na lista dela. Escolha de novo.';
  end if;
  if n.forrageira_secundaria_id is not null and n.forrageira_secundaria_id = n.forrageira_principal_id then
    raise exception using errcode = 'P0001', message = 'A forrageira secundária tem de ser outra que não a principal.';
  end if;
  if p_campos ? 'forrageira_implantada_em' then
    n.forrageira_implantada_em := public._fn_pasto_ficha_mes(p_campos->>'forrageira_implantada_em', 'Implantada em');
    if n.forrageira_implantada_em > v_mes_atual then
      raise exception using errcode = 'P0001', message = 'Implantada em: o mês não pode ser depois do mês atual.';
    end if;
  end if;
  if p_campos ? 'sombra_cobertura' then
    n.sombra_cobertura := nullif(btrim(coalesce(p_campos->>'sombra_cobertura', '')), '');
    if n.sombra_cobertura is not null and n.sombra_cobertura not in ('insuficiente', 'parcial', 'suficiente') then
      raise exception using errcode = 'P0001', message = 'Cobertura da sombra: insuficiente, parcial ou suficiente.';
    end if;
  end if;
  if p_campos ? 'manejo' then
    n.manejo := nullif(btrim(coalesce(p_campos->>'manejo', '')), '');
    if n.manejo is not null and n.manejo not in ('continuo', 'rotacionado') then
      raise exception using errcode = 'P0001', message = 'Manejo: contínuo ou rotacionado.';
    end if;
  end if;
  if exists (select 1 from public.pastos o where o.fazenda_id = n.fazenda_id and o.id is distinct from p.id and o.ativo
                and public._fn_normalizar_texto(o.nome) = public._fn_normalizar_texto(n.nome)) and n.ativo then
    raise exception using errcode = 'P0001', message = format('Já existe um pasto ativo chamado "%s" nesta fazenda.', n.nome);
  end if;
  return n;
end $$;
revoke all on function public._fn_pasto_ficha_aplicar(public.pastos, jsonb) from public, anon, authenticated;

/* antes × depois da ficha, campo a campo (com o nome do item do catálogo) */
create or replace function public._fn_pasto_ficha_diferencas(a public.pastos, b public.pastos)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'campo', c.campo, 'antes', to_jsonb(a)->c.campo, 'depois', to_jsonb(b)->c.campo,
           'antes_nome', (select i.nome from public.catalogo_itens i where c.item and i.id = (to_jsonb(a)->>c.campo)::uuid),
           'depois_nome', (select i.nome from public.catalogo_itens i where c.item and i.id = (to_jsonb(b)->>c.campo)::uuid))
         order by c.ordem), '[]'::jsonb)
    from (values ('nome', false, 1), ('tipo_uso', false, 2), ('data_inicio', false, 3), ('data_fim', false, 4), ('posse', false, 5),
                 ('forrageira_principal_id', true, 6), ('forrageira_secundaria_id', true, 7), ('forrageira_implantada_em', false, 8),
                 ('relevo_id', true, 9), ('textura_id', true, 10), ('drenagem_id', true, 11), ('sombra_id', true, 12),
                 ('sombra_cobertura', false, 13), ('manejo', false, 14), ('observacoes', false, 15)) c(campo, item, ordem)
   where (to_jsonb(a)->c.campo) is distinct from (to_jsonb(b)->c.campo)
$$;
revoke all on function public._fn_pasto_ficha_diferencas(public.pastos, public.pastos) from public, anon, authenticated;

-- ── 5 · escritores ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_pasto_ficha_salvar(p_pasto uuid, p_versao integer, p_campos jsonb, p_motivo text default null,
                                                        p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare p public.pastos%rowtype; n public.pastos; v_muda jsonb;
begin
  select * into p from public.pastos where id = p_pasto for update;
  if p.id is null or not coalesce(public.tenant_ok(p.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_versao is distinct from p.ficha_versao then
    raise exception using errcode = '40001', message = 'Outra pessoa salvou este pasto antes de você. Feche e abra a ficha de novo. Nada foi gravado.';
  end if;
  n := public._fn_pasto_ficha_aplicar(p, p_campos);
  v_muda := public._fn_pasto_ficha_diferencas(p, n);
  if jsonb_array_length(v_muda) = 0 then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'sem_mudanca', true, 'muda', v_muda, 'versao', p.ficha_versao);
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'sem_mudanca', false, 'muda', v_muda, 'versao', p.ficha_versao);
  end if;
  perform set_config('app.pasto_ficha_escritor', '1', true);
  perform set_config('app.motivo', coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'ficha do pasto'), true);
  update public.pastos set
    nome = n.nome, tipo_uso = n.tipo_uso, observacoes = n.observacoes, data_inicio = n.data_inicio, data_fim = n.data_fim, posse = n.posse,
    forrageira_principal_id = n.forrageira_principal_id, forrageira_secundaria_id = n.forrageira_secundaria_id,
    forrageira_implantada_em = n.forrageira_implantada_em, relevo_id = n.relevo_id, textura_id = n.textura_id, drenagem_id = n.drenagem_id,
    sombra_id = n.sombra_id, sombra_cobertura = n.sombra_cobertura, manejo = n.manejo, ficha_versao = p.ficha_versao + 1, updated_at = now()
  where id = p.id;
  perform set_config('app.pasto_ficha_escritor', '', true);
  perform set_config('app.motivo', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'sem_mudanca', false, 'muda', v_muda, 'versao', p.ficha_versao + 1);
end $$;

create or replace function public.fn_pasto_criar(p_fazenda uuid, p_campos jsonb, p_area_ha numeric, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare f record; n public.pastos; v_desde date; v_trava text; v_id uuid; v_ordem int;
begin
  select fz.id, fz.cliente_id into f from public.fazendas fz where fz.id = p_fazenda;
  if f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_campos is null or not (p_campos ? 'nome') then raise exception using errcode = 'P0001', message = 'Digite o nome do pasto.'; end if;
  if not (p_campos ? 'tipo_uso') then raise exception using errcode = 'P0001', message = 'Escolha o destino padrão.'; end if;
  if nullif(btrim(coalesce(p_campos->>'mes_inicio', '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Em uso desde: escolha o mês e o ano.';
  end if;
  if p_area_ha is null or p_area_ha <= 0 then raise exception using errcode = 'P0001', message = 'A área do pasto tem de ser maior que zero.'; end if;
  n.id := null; n.fazenda_id := f.id; n.cliente_id := f.cliente_id; n.ativo := true; n.estrutura := 'pasto'; n.ficha_versao := 1;
  n := public._fn_pasto_ficha_aplicar(n, p_campos);
  v_desde := n.data_inicio;
  if v_desde > date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date then
    raise exception using errcode = 'P0001', message = 'Em uso desde: o mês não pode ser depois do mês atual.';
  end if;
  v_trava := public._fn_pasto_area_trava(null, f.id, v_desde);
  if v_trava is not null then
    raise exception using errcode = 'P0001', message = format('O pasto novo não pode começar em %s: %s. Escolha um mês aberto.',
                                                             to_char(v_desde, 'MM/YYYY'), v_trava);
  end if;
  select coalesce(max(o.ordem_exibicao), 0) + 1 into v_ordem from public.pastos o where o.fazenda_id = f.id;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'pasto', jsonb_build_object('nome', n.nome, 'tipo_uso', n.tipo_uso,
             'data_inicio', n.data_inicio, 'data_fim', n.data_fim, 'ordem_exibicao', v_ordem),
             'muda', public._fn_pasto_ficha_diferencas((null::public.pastos), n), 'area_ha', round(p_area_ha, 2), 'vigente_desde', v_desde);
  end if;
  perform set_config('app.pasto_ficha_escritor', '1', true);
  perform set_config('app.motivo', 'pasto novo pela ficha', true);
  insert into public.pastos (fazenda_id, cliente_id, nome, tipo_uso, observacoes, data_inicio, data_fim, ativo, area_produtiva_ha, ordem_exibicao,
                             posse, forrageira_principal_id, forrageira_secundaria_id, forrageira_implantada_em, relevo_id, textura_id,
                             drenagem_id, sombra_id, sombra_cobertura, manejo, ficha_versao)
  values (f.id, f.cliente_id, n.nome, n.tipo_uso, n.observacoes, n.data_inicio, n.data_fim, true, round(p_area_ha, 2), v_ordem,
          n.posse, n.forrageira_principal_id, n.forrageira_secundaria_id, n.forrageira_implantada_em, n.relevo_id, n.textura_id,
          n.drenagem_id, n.sombra_id, n.sombra_cobertura, n.manejo, 1)
  returning id into v_id;
  perform set_config('app.pasto_ficha_escritor', '', true);
  perform public._fn_pasto_area_gravar(v_id, p_area_ha, v_desde, 'cadastro', format('pasto novo, em uso desde %s', to_char(v_desde, 'MM/YYYY')),
                                       null, null, null);
  perform set_config('app.motivo', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'pasto_id', v_id, 'area_ha', round(p_area_ha, 2), 'vigente_desde', v_desde);
end $$;

create or replace function public.fn_pasto_avaliacao_salvar(p_pasto uuid, p_avaliacao jsonb, p_id uuid default null, p_motivo text default null,
                                                            p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  p public.pastos%rowtype; a public.pasto_condicoes%rowtype; n public.pasto_condicoes%rowtype; k text; v_txt text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ok constant text[] := array['data', 'cercas', 'agua', 'cochos', 'invasoras', 'cupins', 'erosao', 'degradacao', 'cobertura_pct',
                                'suporte_aguas_ua_ha', 'suporte_seca_ua_ha', 'avaliador', 'observacoes'];
begin
  select * into p from public.pastos where id = p_pasto;
  if p.id is null or not coalesce(public.tenant_ok(p.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_avaliacao is null or jsonb_typeof(p_avaliacao) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Nada a gravar.';
  end if;
  for k in select jsonb_object_keys(p_avaliacao) loop
    if not (k = any (v_ok)) then raise exception using errcode = 'P0001', message = format('Campo desconhecido na avaliação: %s.', k); end if;
  end loop;
  if p_id is not null then
    select * into a from public.pasto_condicoes c where c.id = p_id and c.pasto_id = p.id for update;
    if a.id is null then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
    if a.cancelado then raise exception using errcode = 'P0001', message = 'Esta avaliação foi desfeita: registre uma nova.'; end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      raise exception using errcode = 'P0001', message = 'Informe o motivo da correção.';
    end if;
    n := a;
  else
    n.id := null; n.pasto_id := p.id; n.cliente_id := p.cliente_id; n.fazenda_id := p.fazenda_id; n.cancelado := false;
  end if;

  if p_avaliacao ? 'data' then
    v_txt := p_avaliacao->>'data';
    if v_txt is null or v_txt !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode = 'P0001', message = 'Data da avaliação: dd/mm/aaaa.';
    end if;
    n.data_avaliacao := v_txt::date;
  end if;
  if n.data_avaliacao is null then raise exception using errcode = 'P0001', message = 'Data da avaliação: dd/mm/aaaa.'; end if;
  if n.data_avaliacao > v_hoje then raise exception using errcode = 'P0001', message = 'A data da avaliação não pode ser depois de hoje.'; end if;

  if p_avaliacao ? 'cercas' then n.cercas := nullif(p_avaliacao->>'cercas', ''); end if;
  if p_avaliacao ? 'agua' then n.agua := nullif(p_avaliacao->>'agua', ''); end if;
  if p_avaliacao ? 'cochos' then n.cochos := nullif(p_avaliacao->>'cochos', ''); end if;
  if coalesce(n.cercas, 'bom') not in ('bom', 'regular', 'ruim') or coalesce(n.agua, 'bom') not in ('bom', 'regular', 'ruim')
     or coalesce(n.cochos, 'bom') not in ('bom', 'regular', 'ruim') then
    raise exception using errcode = 'P0001', message = 'Cercas, água e cochos: bom, regular ou ruim.';
  end if;
  if p_avaliacao ? 'invasoras' then n.invasoras := nullif(p_avaliacao->>'invasoras', ''); end if;
  if p_avaliacao ? 'cupins' then n.cupins := nullif(p_avaliacao->>'cupins', ''); end if;
  if coalesce(n.invasoras, 'baixo') not in ('baixo', 'medio', 'alto') or coalesce(n.cupins, 'baixo') not in ('baixo', 'medio', 'alto') then
    raise exception using errcode = 'P0001', message = 'Invasoras e cupins: baixo, médio ou alto.';
  end if;
  if p_avaliacao ? 'erosao' then n.erosao := nullif(p_avaliacao->>'erosao', ''); end if;
  if coalesce(n.erosao, 'sem') not in ('sem', 'baixo', 'medio', 'alto') then
    raise exception using errcode = 'P0001', message = 'Erosão: sem, baixa, média ou alta.';
  end if;
  if p_avaliacao ? 'degradacao' then n.degradacao := nullif(p_avaliacao->>'degradacao', ''); end if;
  if coalesce(n.degradacao, 'sem') not in ('sem', 'leve', 'moderada', 'forte', 'muito_forte') then
    raise exception using errcode = 'P0001', message = 'Degradação: sem, leve, moderada, forte ou muito forte.';
  end if;
  if p_avaliacao ? 'cobertura_pct' then n.cobertura_pct := nullif(p_avaliacao->>'cobertura_pct', '')::numeric; end if;
  if n.cobertura_pct is not null and (n.cobertura_pct < 0 or n.cobertura_pct > 100) then
    raise exception using errcode = 'P0001', message = 'Cobertura do solo: de 0 a 100%.';
  end if;
  if p_avaliacao ? 'suporte_aguas_ua_ha' then n.suporte_aguas_ua_ha := nullif(p_avaliacao->>'suporte_aguas_ua_ha', '')::numeric; end if;
  if p_avaliacao ? 'suporte_seca_ua_ha' then n.suporte_seca_ua_ha := nullif(p_avaliacao->>'suporte_seca_ua_ha', '')::numeric; end if;
  if (n.suporte_aguas_ua_ha is not null and (n.suporte_aguas_ua_ha < 0 or n.suporte_aguas_ua_ha > 20))
     or (n.suporte_seca_ua_ha is not null and (n.suporte_seca_ua_ha < 0 or n.suporte_seca_ua_ha > 20)) then
    raise exception using errcode = 'P0001', message = 'Suporte: de 0 a 20 UA/ha.';
  end if;
  if p_avaliacao ? 'avaliador' then n.avaliador := nullif(btrim(coalesce(p_avaliacao->>'avaliador', '')), ''); end if;
  if p_avaliacao ? 'observacoes' then n.observacoes := nullif(btrim(coalesce(p_avaliacao->>'observacoes', '')), ''); end if;
  if n.cercas is null and n.agua is null and n.cochos is null and n.invasoras is null and n.cupins is null and n.erosao is null
     and n.degradacao is null and n.cobertura_pct is null and n.suporte_aguas_ua_ha is null and n.suporte_seca_ua_ha is null then
    raise exception using errcode = 'P0001', message = 'Preencha ao menos um item da avaliação.';
  end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'antes', case when a.id is not null then to_jsonb(a) end,
             'depois', to_jsonb(n) - array['id', 'cliente_id', 'fazenda_id', 'created_at', 'criado_por', 'alterado_em', 'alterado_por',
                                          'cancelado', 'cancelado_motivo', 'cancelado_por', 'cancelado_em', 'condicao']);
  end if;
  if a.id is not null then
    perform set_config('app.motivo', btrim(p_motivo), true);
    update public.pasto_condicoes set data_avaliacao = n.data_avaliacao, cercas = n.cercas, agua = n.agua, cochos = n.cochos,
      invasoras = n.invasoras, cupins = n.cupins, erosao = n.erosao, degradacao = n.degradacao, cobertura_pct = n.cobertura_pct,
      suporte_aguas_ua_ha = n.suporte_aguas_ua_ha, suporte_seca_ua_ha = n.suporte_seca_ua_ha, avaliador = n.avaliador,
      observacoes = n.observacoes, alterado_em = now(), alterado_por = auth.uid()
    where id = a.id;
    perform set_config('app.motivo', '', true);
    return jsonb_build_object('ok', true, 'simulado', false, 'id', a.id, 'corrigida', true);
  end if;
  perform set_config('app.motivo', coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'avaliação de campo'), true);
  insert into public.pasto_condicoes (pasto_id, cliente_id, fazenda_id, data_avaliacao, cercas, agua, cochos, invasoras, cupins, erosao,
                                      degradacao, cobertura_pct, suporte_aguas_ua_ha, suporte_seca_ua_ha, avaliador, observacoes, criado_por)
  values (p.id, p.cliente_id, p.fazenda_id, n.data_avaliacao, n.cercas, n.agua, n.cochos, n.invasoras, n.cupins, n.erosao, n.degradacao,
          n.cobertura_pct, n.suporte_aguas_ua_ha, n.suporte_seca_ua_ha, n.avaliador, n.observacoes, auth.uid())
  returning id into n.id;
  perform set_config('app.motivo', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'id', n.id, 'corrigida', false);
end $$;

create or replace function public.fn_pasto_avaliacao_desfazer(p_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare a public.pasto_condicoes%rowtype; v_cli uuid;
begin
  select * into a from public.pasto_condicoes c where c.id = p_id for update;
  select pa.cliente_id into v_cli from public.pastos pa where pa.id = a.pasto_id;
  if a.id is null or not coalesce(public.tenant_ok(v_cli), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if a.cancelado then raise exception using errcode = 'P0001', message = 'Esta avaliação já foi desfeita.'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo.'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'avaliacao', to_jsonb(a)); end if;
  perform set_config('app.motivo', btrim(p_motivo), true);
  update public.pasto_condicoes set cancelado = true, cancelado_motivo = btrim(p_motivo), cancelado_por = auth.uid(), cancelado_em = now()
   where id = a.id;
  perform set_config('app.motivo', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'id', a.id);
end $$;

-- ── 6 · leitores ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A ficha: o cadastro (com os nomes dos itens), a área oficial do mês, o cadastro × mapa (a MESMA conta da tela "Áreas"), a trava do
   mês, a avaliação mais recente e a última reforma do Patrimônio. `p_ano_mes` nulo = o mês atual. */
create or replace function public.fn_pasto_ficha(p_pasto uuid, p_ano_mes text default null)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public'
set plan_cache_mode = force_custom_plan as $$
declare
  p public.pastos%rowtype; v_am text := coalesce(p_ano_mes, to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM'));
  v_cmp record; v_aval jsonb; v_ref record;
begin
  select * into p from public.pastos where id = p_pasto;
  if p.id is null or not coalesce(public.tenant_ok(p.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select c.* into v_cmp from public.fn_pastos_area_comparar(p.fazenda_id, v_am) c where c.pasto_id = p.id;
  select to_jsonb(c) - array['cliente_id', 'fazenda_id', 'condicao'] into v_aval from public.pasto_condicoes c
   where c.pasto_id = p.id and not c.cancelado order by c.data_avaliacao desc, c.created_at desc limit 1;
  select r.* into v_ref from public.fn_pasto_reformas(p.id) r order by r.data desc nulls last limit 1;
  return jsonb_build_object(
    'pasto', to_jsonb(p) - array['area', 'entra_conciliacao', 'qualidade', 'situacao', 'referencia_rebanho', 'lote_padrao'],
    'nomes', jsonb_build_object(
      'forrageira_principal', (select i.nome from public.catalogo_itens i where i.id = p.forrageira_principal_id),
      'forrageira_principal_grupo', (select i.grupo from public.catalogo_itens i where i.id = p.forrageira_principal_id),
      'forrageira_secundaria', (select i.nome from public.catalogo_itens i where i.id = p.forrageira_secundaria_id),
      'relevo', (select i.nome from public.catalogo_itens i where i.id = p.relevo_id),
      'textura', (select i.nome from public.catalogo_itens i where i.id = p.textura_id),
      'drenagem', (select i.nome from public.catalogo_itens i where i.id = p.drenagem_id),
      'sombra', (select i.nome from public.catalogo_itens i where i.id = p.sombra_id)),
    'ano_mes', v_am,
    'area', jsonb_build_object('oficial_ha', v_cmp.area_oficial_ha, 'mapa_ha', v_cmp.area_mapa_ha, 'n_poligonos', v_cmp.n_poligonos,
              'dif_ha', v_cmp.dif_ha, 'dif_pct', v_cmp.dif_pct, 'ultima_origem', v_cmp.ultima_origem, 'ultima_desde', v_cmp.ultima_desde,
              'trava', v_cmp.trava),
    'ultima_avaliacao', v_aval,
    'ultima_reforma', case when v_ref.bem_id is not null then jsonb_build_object('bem_id', v_ref.bem_id, 'data', v_ref.data,
              'descricao', v_ref.descricao, 'idade_anos', floor(extract(year from age((now() at time zone 'America/Sao_Paulo')::date, v_ref.data))))
              end);
end $$;

/* As formações e reformas do pasto = os bens do Patrimônio de categoria "com pastos" ligados a ele (ligação viva). Custo e contábil
   do bem vêm da `fn_patrimonio_lista` (a fonte do Patrimônio); a parte do pasto é pela área ligada. */
create or replace function public.fn_pasto_reformas(p_pasto uuid)
returns table(bem_id uuid, codigo text, data date, descricao text, categoria text, situacao text, area_no_pasto_ha numeric,
              area_do_bem_ha numeric, custo_rs numeric, rs_ha numeric, contabil_rs numeric)
language plpgsql stable security definer set search_path to 'pg_catalog', 'public' as $$
declare p public.pastos%rowtype;
begin
  select * into p from public.pastos where id = p_pasto;
  if p.id is null or not coalesce(public.tenant_ok(p.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if not exists (select 1 from public.patrimonio_bem_pastos bp where bp.pasto_id = p.id and bp.desligado_em is null) then return; end if;
  return query
  select l.bem_id, l.codigo, coalesce(l.em_uso_desde, l.primeira_data), l.descricao, l.categoria_nome, l.situacao, bp.area_ha,
         l.area_pastos_ha, l.aquisicao,
         case when coalesce(l.area_pastos_ha, 0) > 0 then round(l.aquisicao / l.area_pastos_ha, 2) end,
         l.valor_contabil
    from public.patrimonio_bem_pastos bp
    join public.fn_patrimonio_lista(p.cliente_id, null, null) l on l.bem_id = bp.bem_id
   where bp.pasto_id = p.id and bp.desligado_em is null and l.tem_pastos
   order by 3 desc nulls last;
end $$;

/* Lotação × suporte, mês a mês, até `p_ate` ('AAAA-MM'): a lotação é a da `fn_lotacao_do_mes` (o Fechamento; ninguém digita); o suporte é
   o da avaliação mais recente até o fim do mês, na época do mês (águas: out–mar; seca: abr–set). */
create or replace function public.fn_pasto_lotacao_meses(p_pasto uuid, p_ate text default null, p_meses integer default 12)
returns table(ano_mes text, epoca text, area_ha numeric, cabecas numeric, ua numeric, ua_ha numeric, suporte_ua_ha numeric, acima boolean)
language plpgsql stable security definer set search_path to 'pg_catalog', 'public' as $$
declare p public.pastos%rowtype; v_ate date; v_m date; v_am text; v_sup numeric; v_ep text; v_area numeric; v_cab numeric; v_ua numeric; v_uaha numeric;
begin
  select * into p from public.pastos where id = p_pasto;
  if p.id is null or not coalesce(public.tenant_ok(p.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_meses is null or p_meses < 1 or p_meses > 24 then raise exception using errcode = 'P0001', message = 'De 1 a 24 meses.'; end if;
  v_ate := public._fn_pasto_ficha_mes(coalesce(p_ate, to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM')), 'Mês');
  for i in reverse (p_meses - 1)..0 loop
    v_m := (v_ate - make_interval(months => i))::date;
    v_am := to_char(v_m, 'YYYY-MM');
    v_ep := case when extract(month from v_m) between 4 and 9 then 'seca' else 'aguas' end;
    v_area := null; v_cab := null; v_ua := null; v_uaha := null; v_sup := null;
    select l.area_ha, l.cabecas, l.ua, l.ua_ha into v_area, v_cab, v_ua, v_uaha
      from public.fn_lotacao_do_mes(p.fazenda_id, v_am) l where l.pasto_id = p.id limit 1;
    select case when v_ep = 'seca' then c.suporte_seca_ua_ha else c.suporte_aguas_ua_ha end into v_sup
      from public.pasto_condicoes c
     where c.pasto_id = p.id and not c.cancelado and c.data_avaliacao <= (v_m + interval '1 month' - interval '1 day')::date
     order by c.data_avaliacao desc, c.created_at desc limit 1;
    ano_mes := v_am; epoca := v_ep; area_ha := v_area; cabecas := v_cab; ua := v_ua; ua_ha := v_uaha; suporte_ua_ha := v_sup;
    acima := case when v_uaha is not null and v_sup is not null then v_uaha > v_sup end;
    return next;
  end loop;
end $$;

-- ── 7 · acesso ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.fn_pasto_ficha_salvar(uuid, integer, jsonb, text, boolean) from public, anon;
revoke all on function public.fn_pasto_criar(uuid, jsonb, numeric, boolean) from public, anon;
revoke all on function public.fn_pasto_avaliacao_salvar(uuid, jsonb, uuid, text, boolean) from public, anon;
revoke all on function public.fn_pasto_avaliacao_desfazer(uuid, text, boolean) from public, anon;
revoke all on function public.fn_pasto_ficha(uuid, text) from public, anon;
revoke all on function public.fn_pasto_reformas(uuid) from public, anon;
revoke all on function public.fn_pasto_lotacao_meses(uuid, text, integer) from public, anon;
grant execute on function public.fn_pasto_ficha_salvar(uuid, integer, jsonb, text, boolean) to authenticated, service_role;
grant execute on function public.fn_pasto_criar(uuid, jsonb, numeric, boolean) to authenticated, service_role;
grant execute on function public.fn_pasto_avaliacao_salvar(uuid, jsonb, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_pasto_avaliacao_desfazer(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_pasto_ficha(uuid, text) to authenticated, service_role;
grant execute on function public.fn_pasto_reformas(uuid) to authenticated, service_role;
grant execute on function public.fn_pasto_lotacao_meses(uuid, text, integer) to authenticated, service_role;
grant execute on function public._fn_pastos_ficha_so_pelo_escritor() to service_role;
grant execute on function public._fn_pasto_ficha_item_ok(uuid, text, uuid) to service_role;
grant execute on function public._fn_pasto_ficha_mes(text, text) to service_role;
grant execute on function public._fn_pasto_ficha_aplicar(public.pastos, jsonb) to service_role;
grant execute on function public._fn_pasto_ficha_diferencas(public.pastos, public.pastos) to service_role;
