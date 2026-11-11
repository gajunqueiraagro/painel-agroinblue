-- FECH-DOCS-02 (Gabriel 05/11 17:50; D2 = a, seguido pela recomendação — confirmar de manhã): os tipos do "Documentos do mês" saem da
-- lista fechada (CHECK de 7) e vão para o catálogo do sistema (`catalogo_itens`, LISTAS-DIGITAVEIS-01 do Code 4), lista
-- `tipo_documento_mes`: 17 tipos GLOBAIS e o cliente acrescenta o dele pela `fn_catalogo_item_criar` (a porta de sempre, com trilha).
-- 1. a CHECK de `catalogo_itens.lista` ganha a lista nova — as 8 de hoje CONTINUAM (a troca recusa se a CHECK mudou no banco);
-- 2. os 17 tipos (os 7 de hoje com o MESMO rótulo da tela, para nada mudar de nome);
-- 3. `pecuaria_fechamento_documentos.tipo_id` (o tipo do documento = o item do catálogo) + o preenchimento dos que existem, pela espécie;
-- 4. a CHECK da espécie sai; `especie` vira ESPELHO legado mantido pelo gatilho (o código antigo, ou 'outro' para os tipos novos) — a tela
--    antiga, que ainda grava só a espécie, continua certa até a tela nova ir ao ar; ninguém novo lê a `especie`;
-- 5. o gatilho `trg_pec_fech_doc_tipo`: sem tipo = "Outro" (D5: o arquivo nasce Outro); tipo de OUTRA lista, de outro cliente ou inativo
--    = recusa (23514). Caminho de volta: o tipo se troca pelo lápis (UPDATE com versão + 1) e o documento se cancela com motivo.
set lock_timeout = '2s';

do $$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.catalogo_itens'::regclass and conname = 'catalogo_itens_lista_check'))
     <> $c$CHECK ((lista = ANY (ARRAY['motivo_morte'::text, 'forrageira'::text, 'relevo'::text, 'textura_solo'::text, 'drenagem'::text, 'sombra'::text, 'sistema_pasto'::text, 'motivo_ajuste_inventario'::text])))$c$ then
    raise exception 'catalogo_itens_lista_check mudou no banco: refazer com as listas de agora.';
  end if;
  if pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.pecuaria_fechamento_documentos'::regclass and conname = 'ck_pec_fech_doc_especie'))
     <> $c$CHECK (((especie IS NOT NULL) AND (especie = ANY (ARRAY['mapa_rebanho'::text, 'nascimentos'::text, 'entradas'::text, 'vendas'::text, 'transferencias'::text, 'mortes'::text, 'outro'::text]))))$c$ then
    raise exception 'ck_pec_fech_doc_especie mudou no banco: refazer.';
  end if;
  if exists (select 1 from public.catalogo_itens where lista = 'tipo_documento_mes') then
    raise exception 'a lista tipo_documento_mes já existe.';
  end if;
end $$;

alter table public.catalogo_itens drop constraint catalogo_itens_lista_check;
alter table public.catalogo_itens add constraint catalogo_itens_lista_check check (lista = any (array[
  'motivo_morte'::text, 'forrageira'::text, 'relevo'::text, 'textura_solo'::text, 'drenagem'::text, 'sombra'::text, 'sistema_pasto'::text,
  'motivo_ajuste_inventario'::text, 'tipo_documento_mes'::text]));

insert into public.catalogo_itens (lista, cliente_id, grupo, nome, nome_busca, apelidos, ordem)
select 'tipo_documento_mes', null, g, n, public._fn_normalizar_texto(n), a, o from (values
  ('Rebanho', 'Mapa de rebanho', array['mapa','mapa do rebanho','contagem'], 10),
  ('Rebanho', 'Nascimentos', array['nascimento','parto','partos'], 20),
  ('Rebanho', 'Entradas', array['entrada','compra','compras'], 30),
  ('Rebanho', 'Vendas', array['venda'], 40),
  ('Rebanho', 'Transferências', array['transferencia'], 50),
  ('Rebanho', 'Mortes', array['morte','obito','obitos'], 60),
  ('Rebanho', 'Desmama', array['desmamas','desmame'], 70),
  ('Rebanho', 'Engorda e reclassificação', array['engorda','reclassificacao'], 80),
  ('Rebanho', 'Pesagem', array['pesagens','peso','balanca'], 90),
  ('Rebanho', 'Abate e romaneio', array['abate','romaneio','abates'], 100),
  ('Manejo', 'Manejo sanitário e vacinação', array['vacina','vacinacao','sanitario','manejo sanitario'], 110),
  ('Manejo', 'Reprodução (IATF e diagnóstico)', array['iatf','reproducao','diagnostico','toque'], 120),
  ('Manejo', 'Suplementação e trato', array['suplementacao','trato','sal','racao'], 130),
  ('Campo', 'Chuvas', array['chuva','pluviometro'], 140),
  ('Campo', 'Estoque de insumos', array['estoque','insumos'], 150),
  ('Campo', 'Relatório do campeiro', array['relatorio','campeiro','caderno'], 160),
  ('Outros', 'Outro', array['outros'], 1000)
) v(g, n, a, o);

/* O código antigo de cada tipo (a espécie). Os tipos novos e os do cliente espelham 'outro'. */
create or replace function public._fn_pec_fech_doc_especie_do_tipo(p_nome_busca text)
returns text language sql immutable set search_path = public as $f$
  select case p_nome_busca
    when 'mapa de rebanho' then 'mapa_rebanho' when 'nascimentos' then 'nascimentos' when 'entradas' then 'entradas'
    when 'vendas' then 'vendas' when 'transferencias' then 'transferencias' when 'mortes' then 'mortes' else 'outro' end
$f$;
revoke all on function public._fn_pec_fech_doc_especie_do_tipo(text) from public, anon;

alter table public.pecuaria_fechamento_documentos drop constraint ck_pec_fech_doc_especie;
alter table public.pecuaria_fechamento_documentos add column tipo_id uuid references public.catalogo_itens(id);
comment on column public.pecuaria_fechamento_documentos.tipo_id is
  'FECH-DOCS-02 — o tipo do documento: item da lista tipo_documento_mes do catalogo_itens (global ou do cliente da linha). A fonte unica do tipo.';
comment on column public.pecuaria_fechamento_documentos.especie is
  'LEGADO (FECH-DOCS-02): espelho do tipo_id mantido pelo gatilho trg_pec_fech_doc_tipo (codigo antigo, ou outro). Nao ler: ler tipo_id.';

/* Os que existem: o tipo pela espécie (o mesmo nome da tela de hoje). Não mexe na versão: o documento não mudou. */
update public.pecuaria_fechamento_documentos d set tipo_id = i.id
  from public.catalogo_itens i
 where i.lista = 'tipo_documento_mes' and i.cliente_id is null
   and public._fn_pec_fech_doc_especie_do_tipo(i.nome_busca) = d.especie
   and (d.especie <> 'outro' or i.nome_busca = 'outro')
   and d.tipo_id is null;

create or replace function public._fn_pec_fech_doc_tipo()
returns trigger language plpgsql security definer set search_path = public as $f$
declare v_item record;
begin
  /* A tela antiga grava só a espécie: a espécie trocada (sem trocar o tipo) leva o tipo junto. */
  if tg_op = 'UPDATE' and new.tipo_id is not distinct from old.tipo_id and new.especie is distinct from old.especie then
    new.tipo_id := null;
  end if;
  if new.tipo_id is null then
    select i.id into new.tipo_id from public.catalogo_itens i
     where i.lista = 'tipo_documento_mes' and i.cliente_id is null and i.ativo
       and public._fn_pec_fech_doc_especie_do_tipo(i.nome_busca) = coalesce(new.especie, 'outro')
       and (coalesce(new.especie, 'outro') <> 'outro' or i.nome_busca = 'outro')
     order by i.ordem limit 1;
  end if;
  select i.lista, i.cliente_id, i.ativo, i.nome_busca into v_item from public.catalogo_itens i where i.id = new.tipo_id;
  if not found or v_item.lista <> 'tipo_documento_mes' then
    raise exception 'Tipo de documento inválido.' using errcode = '23514';
  end if;
  if v_item.cliente_id is not null and v_item.cliente_id <> new.cliente_id then
    raise exception 'Tipo de documento de outro cliente.' using errcode = '23514';
  end if;
  if not v_item.ativo and (tg_op = 'INSERT' or new.tipo_id is distinct from old.tipo_id) then
    raise exception 'Tipo de documento inativo.' using errcode = '23514';
  end if;
  new.especie := public._fn_pec_fech_doc_especie_do_tipo(v_item.nome_busca);
  return new;
end $f$;
revoke all on function public._fn_pec_fech_doc_tipo() from public, anon;

create trigger trg_pec_fech_doc_tipo before insert or update of tipo_id, especie on public.pecuaria_fechamento_documentos
  for each row execute function public._fn_pec_fech_doc_tipo();

do $$
begin
  if exists (select 1 from public.pecuaria_fechamento_documentos where tipo_id is null) then
    raise exception 'sobrou documento sem tipo.';
  end if;
end $$;
alter table public.pecuaria_fechamento_documentos alter column tipo_id set not null;
