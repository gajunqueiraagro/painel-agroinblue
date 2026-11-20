-- FOLHA-01 · PR B (banco) — a ficha, os documentos e as pendências da tela Financeiro › Folha de pagamento (mock aprovado 19/11/2026
-- 07:07: D1 a · D2 a · D3 a · D4 a · D5 sim; FILA 07:10 e 07:12; Gabriel: "Documento = UM registro em folha_documentos e o lançamento aponta
-- (sem copiar)").
-- O QUE FAZ:
--   1. FICHA: folha_funcionarios ganha nascimento, PIS e CTPS. Pix/banco/agência/conta, telefone e e-mail NÃO entram aqui: já moram no
--      FORNECEDOR (o favorecido do funcionário) e a ficha os mostra de lá (sem 2ª fonte). fn_folha_funcionario_gravar: a mesma, mais os 3
--      campos — chave ausente no pedido MANTÉM o que está gravado (não apaga).
--   2. DOCUMENTOS: folha_documentos ganha data do documento, VENCIMENTO (ASO, experiência 45+45, EPI) e lancamento_id (o lançamento APONTA
--      para o documento; um registro só). Espécies novas: 'epi' e 'atestado'. fn_folha_documento_registrar: a mesma, com as espécies novas.
--      fn_folha_documento_detalhar: grava data / vencimento / lançamento de um documento vivo, com trilha.
--   3. ARQUIVO: o bucket privado 'folha-documentos' (não existia: o PR A gerava o caminho e não havia onde subir). Ler: quem tem a folha do
--      cliente (folha_ok da 1ª pasta). Subir: só o caminho de um documento JÁ registrado e vivo (registra → sobe). Sem apagar nem trocar.
--   4. PENDÊNCIAS: fn_folha_pendencias(cliente) — leitura (só com a folha): favorecido-pessoa com lançamento de folha sem funcionário
--      (com "tem rescisão" e a sugestão pelo nome), sugestão pela DESCRIÇÃO (um funcionário só pelo 1º nome; nunca liga sozinha), 13º sem
--      recibo (quando a competência já tem recibo), documento vencendo em 30 dias. "Não é" fica guardado em folha_pendencias_descartes
--      (fn_folha_pendencia_descartar, com desfazer e trilha).
--   5. LEITURAS das abas (FILA 07:20: as telas são do Code 4; contrato no relatório): fn_folha_funcionarios_lista(cliente) ·
--      fn_folha_funcionario_ficha(funcionário) · fn_folha_historico(funcionário, de, até) — o TIPO do pagamento é derivado aqui (regra única)
--      e os documentos vêm das duas origens sem repetir o mesmo arquivo.
-- NÃO FAZ: não muda nenhum lançamento nem funcionário existente; não muda a regra do recibo (118380) — ela passa a gravar o recibo em
--   folha_documentos no PR C (contrato com o Code 5).
-- DESFAZER: drop function fn_folha_historico, fn_folha_funcionario_ficha, fn_folha_funcionarios_lista, fn_folha_pendencias, fn_folha_pendencia_descartar, fn_folha_documento_detalhar; drop table folha_pendencias_descartes;
--   drop policy folha_doc_select / folha_doc_insert on storage.objects; delete from storage.buckets where id = 'folha-documentos' (vazio);
--   recriar fn_folha_documento_registrar e fn_folha_funcionario_gravar da 118370; alter table folha_documentos drop column data_documento,
--   vencimento, lancamento_id (e a espécie volta à lista antiga); alter table folha_funcionarios drop column nascimento, pis, ctps.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $pre$ begin
  if to_regclass('public.folha_funcionarios') is null then raise exception 'PR B: aplique a 118370 antes.'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'folha_funcionarios' and column_name = 'pis') then
    raise exception 'PR B: já aplicado (a coluna pis existe).';
  end if;
  if exists (select 1 from storage.buckets where id = 'folha-documentos') then raise exception 'PR B: o bucket folha-documentos já existe.'; end if;
end $pre$;

-- ═══ 1. a ficha
alter table public.folha_funcionarios
  add column nascimento date,
  add column pis text check (pis ~ '^[0-9]{11}$'),
  add column ctps text check (length(ctps) <= 40);

create or replace function public.fn_folha_funcionario_gravar(p_cliente uuid, p_dados jsonb, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_id uuid := nullif(p_dados->>'id', '')::uuid;
  v_antes public.folha_funcionarios; v_novo public.folha_funcionarios;
  v_cpf text := nullif(regexp_replace(coalesce(p_dados->>'cpf', ''), '[^0-9]', '', 'g'), '');
  v_fav uuid := nullif(p_dados->>'favorecido_id', '')::uuid;
  v_rec uuid := nullif(p_dados->>'recorrencia_origem_id', '')::uuid;
  v_pis text := nullif(regexp_replace(coalesce(p_dados->>'pis', ''), '[^0-9]', '', 'g'), '');
  v_outro text;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or p_simular is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_dados->>'nome', '')), '') is null then raise exception 'Informe o nome do funcionário.' using errcode = 'P0001'; end if;
  if v_cpf is not null and (length(v_cpf) <> 11 or not _fn_cpf_cnpj_valido(v_cpf)) then
    raise exception 'CPF inválido.' using errcode = 'P0001';
  end if;
  if p_dados ? 'pis' and v_pis is not null and length(v_pis) <> 11 then raise exception 'O PIS tem 11 dígitos.' using errcode = 'P0001'; end if;
  if v_cpf is not null then
    select nome into v_outro from folha_funcionarios where cliente_id = p_cliente and cpf = v_cpf and id is distinct from v_id;
    if found then raise exception 'Este CPF já é de %, neste cliente.', v_outro using errcode = 'P0001'; end if;
  end if;
  if v_fav is not null and not exists (select 1 from financeiro_fornecedores where id = v_fav and cliente_id = p_cliente) then
    raise exception 'O favorecido não é deste cliente.' using errcode = '42501';
  end if;
  if v_rec is not null and not exists (select 1 from financeiro_recorrencias where id = v_rec and cliente_id = p_cliente) then
    raise exception 'A recorrência não é deste cliente.' using errcode = '42501';
  end if;
  if v_id is not null then
    select * into v_antes from folha_funcionarios where id = v_id and cliente_id = p_cliente for update;
    if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  end if;
  v_novo := v_antes;
  v_novo.id := coalesce(v_id, gen_random_uuid());
  v_novo.cliente_id := p_cliente;
  v_novo.nome := btrim(p_dados->>'nome');
  v_novo.cpf := v_cpf;
  v_novo.favorecido_id := v_fav;
  v_novo.codigo_contador := nullif(btrim(coalesce(p_dados->>'codigo_contador', '')), '');
  v_novo.cargo := nullif(btrim(coalesce(p_dados->>'cargo', '')), '');
  v_novo.cbo := nullif(btrim(coalesce(p_dados->>'cbo', '')), '');
  v_novo.vinculo := coalesce(nullif(p_dados->>'vinculo', ''), 'clt');
  v_novo.empregador_registro := nullif(btrim(coalesce(p_dados->>'empregador_registro', '')), '');
  v_novo.admissao := nullif(p_dados->>'admissao', '')::date;
  v_novo.a_atualizar := coalesce(array(select jsonb_array_elements_text(p_dados->'a_atualizar')), '{}');
  v_novo.recorrencia_origem_id := v_rec;
  v_novo.observacao := nullif(btrim(coalesce(p_dados->>'observacao', '')), '');
  -- PR B: os campos da ficha; chave ausente mantém o gravado
  v_novo.nascimento := case when p_dados ? 'nascimento' then nullif(p_dados->>'nascimento', '')::date else v_antes.nascimento end;
  v_novo.pis := case when p_dados ? 'pis' then v_pis else v_antes.pis end;
  v_novo.ctps := case when p_dados ? 'ctps' then nullif(btrim(coalesce(p_dados->>'ctps', '')), '') else v_antes.ctps end;
  if v_id is null then v_novo.situacao := 'ativo'; v_novo.criado_por := auth.uid(); v_novo.criado_em := now(); end if;
  v_novo.atualizado_por := auth.uid(); v_novo.atualizado_em := now();
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'novo', v_id is null, 'antes', to_jsonb(v_antes), 'depois', to_jsonb(v_novo));
  end if;
  if v_id is null then
    insert into folha_funcionarios select v_novo.*;
  else
    update folha_funcionarios set nome = v_novo.nome, cpf = v_novo.cpf, favorecido_id = v_novo.favorecido_id,
      codigo_contador = v_novo.codigo_contador, cargo = v_novo.cargo, cbo = v_novo.cbo, vinculo = v_novo.vinculo,
      empregador_registro = v_novo.empregador_registro, admissao = v_novo.admissao, a_atualizar = v_novo.a_atualizar,
      recorrencia_origem_id = v_novo.recorrencia_origem_id, observacao = v_novo.observacao,
      nascimento = v_novo.nascimento, pis = v_novo.pis, ctps = v_novo.ctps,
      atualizado_por = v_novo.atualizado_por, atualizado_em = v_novo.atualizado_em
     where id = v_id;
  end if;
  perform _fn_folha_trilha(p_cliente, 'folha_funcionarios', v_novo.id, case when v_id is null then 'criar' else 'editar' end,
    to_jsonb(v_antes), to_jsonb(v_novo), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'novo', v_id is null, 'id', v_novo.id);
end $function$;

-- ═══ 2. os documentos
alter table public.folha_documentos
  add column data_documento date,
  add column vencimento date,
  add column lancamento_id uuid;
alter table public.folha_documentos add constraint folha_documentos_lancamento_fk
  foreign key (lancamento_id, cliente_id) references public.financeiro_lancamentos_v2(id, cliente_id) not valid;
alter table public.folha_documentos validate constraint folha_documentos_lancamento_fk;
create index ix_folha_documentos_lancamento on public.folha_documentos (lancamento_id) where lancamento_id is not null;
alter table public.folha_documentos drop constraint folha_documentos_especie_check;
alter table public.folha_documentos add constraint folha_documentos_especie_check check (especie = any (array['holerite', 'recibo_13', 'guia_inss',
  'guia_fgts', 'escala_ferias', 'recibo_ferias', 'rescisao', 'contrato', 'ctps', 'aso', 'epi', 'atestado', 'outro']));

create or replace function public.fn_folha_documento_registrar(p_cliente uuid, p_folha uuid, p_funcionario uuid, p_especie text, p_nome text, p_extensao text, p_tipo text, p_tamanho bigint, p_md5 text, p_entrada uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_id uuid := gen_random_uuid(); v_ext text; v_path text; v_comp text; v_ja text;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_especie is null or p_especie not in ('holerite', 'recibo_13', 'guia_inss', 'guia_fgts', 'escala_ferias', 'recibo_ferias', 'rescisao', 'contrato', 'ctps', 'aso', 'epi', 'atestado', 'outro') then
    raise exception 'Escolha a espécie do documento.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then raise exception 'Documento sem nome.' using errcode = 'P0001'; end if;
  if p_folha is null and p_funcionario is null then raise exception 'O documento é da folha ou de um funcionário.' using errcode = 'P0001'; end if;
  if p_folha is not null then
    select competencia into v_comp from folha_folhas where id = p_folha and cliente_id = p_cliente;
    if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  end if;
  if p_funcionario is not null and not exists (select 1 from folha_funcionarios where id = p_funcionario and cliente_id = p_cliente) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if p_entrada is not null and not exists (select 1 from entrada_arquivos where id = p_entrada and cliente_id = p_cliente) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if p_md5 is not null then
    select nome into v_ja from folha_documentos where cliente_id = p_cliente and md5 = lower(p_md5) and cancelado_em is null;
    if found then raise exception 'Este arquivo já está na folha (%).', v_ja using errcode = 'P0001'; end if;
  end if;
  v_ext := lower(regexp_replace(coalesce(p_extensao, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_ext = '' then v_ext := 'bin'; end if;
  v_path := p_cliente::text || '/folha/' || case when p_folha is not null then v_comp || '/' else 'funcionarios/' || p_funcionario::text || '/' end
            || v_id::text || '.' || v_ext;
  insert into folha_documentos (id, cliente_id, folha_id, funcionario_id, especie, nome, storage_path, tipo, tamanho_bytes, md5, entrada_arquivo_id, enviado_por)
  values (v_id, p_cliente, p_folha, p_funcionario, p_especie, btrim(p_nome), v_path, p_tipo, p_tamanho, lower(p_md5), p_entrada, auth.uid());
  perform _fn_folha_trilha(p_cliente, 'folha_documentos', v_id, 'registrar', null,
    jsonb_build_object('especie', p_especie, 'nome', btrim(p_nome), 'folha_id', p_folha, 'funcionario_id', p_funcionario, 'entrada', p_entrada), null);
  return jsonb_build_object('id', v_id, 'storage_path', v_path);
end $function$;

-- data do documento, vencimento e o lançamento que aponta para ele (chave ausente mantém; null limpa)
create function public.fn_folha_documento_detalhar(p_id uuid, p_dados jsonb, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.folha_documentos; v_novo public.folha_documentos; v_lanc uuid;
begin
  if p_id is null or p_simular is null or p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  select * into d from folha_documentos where id = p_id;
  if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  perform _fn_folha_exigir(d.cliente_id);
  if d.cancelado_em is not null then raise exception 'Este documento foi removido.' using errcode = 'P0001'; end if;
  v_novo := d;
  if p_dados ? 'data_documento' then v_novo.data_documento := nullif(p_dados->>'data_documento', '')::date; end if;
  if p_dados ? 'vencimento' then v_novo.vencimento := nullif(p_dados->>'vencimento', '')::date; end if;
  if p_dados ? 'lancamento_id' then
    v_lanc := nullif(p_dados->>'lancamento_id', '')::uuid;
    if v_lanc is not null and not exists (select 1 from financeiro_lancamentos_v2 where id = v_lanc and cliente_id = d.cliente_id) then
      raise exception 'sem acesso a este registro' using errcode = '42501';
    end if;
    v_novo.lancamento_id := v_lanc;
  end if;
  if v_novo.vencimento is not null and v_novo.data_documento is not null and v_novo.vencimento < v_novo.data_documento then
    raise exception 'O vencimento é antes da data do documento.' using errcode = 'P0001';
  end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'antes', to_jsonb(d), 'depois', to_jsonb(v_novo)); end if;
  update folha_documentos set data_documento = v_novo.data_documento, vencimento = v_novo.vencimento, lancamento_id = v_novo.lancamento_id where id = d.id;
  perform _fn_folha_trilha(d.cliente_id, 'folha_documentos', d.id, 'detalhar',
    jsonb_build_object('data_documento', d.data_documento, 'vencimento', d.vencimento, 'lancamento_id', d.lancamento_id),
    jsonb_build_object('data_documento', v_novo.data_documento, 'vencimento', v_novo.vencimento, 'lancamento_id', v_novo.lancamento_id), null);
  return jsonb_build_object('ok', true, 'simulado', false);
end $$;
revoke all on function public.fn_folha_documento_detalhar(uuid, jsonb, boolean) from public, anon;
grant execute on function public.fn_folha_documento_detalhar(uuid, jsonb, boolean) to authenticated, service_role;

-- ═══ 3. o arquivo
insert into storage.buckets (id, name, public) values ('folha-documentos', 'folha-documentos', false);
create policy folha_doc_select on storage.objects for select to authenticated
  using (bucket_id = 'folha-documentos' and public.folha_ok(substring((storage.foldername(name))[1] from '^[0-9a-f-]{36}$')::uuid));
create policy folha_doc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'folha-documentos' and public.folha_ok(substring((storage.foldername(name))[1] from '^[0-9a-f-]{36}$')::uuid)
              and exists (select 1 from public.folha_documentos d where d.storage_path = name and d.cancelado_em is null));

-- ═══ 4. as pendências
create table public.folha_pendencias_descartes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  chave text not null check (chave ~ '^(fav|desc|recibo|doc):[0-9a-f-]{36}'),
  motivo text not null check (btrim(motivo) <> '' and length(motivo) <= 300),
  descartado_por uuid, descartado_em timestamptz not null default now(),
  desfeito_por uuid, desfeito_em timestamptz
);
create unique index ux_folha_pendencias_descartes_vivo on public.folha_pendencias_descartes (cliente_id, chave) where desfeito_em is null;
alter table public.folha_pendencias_descartes enable row level security;
create policy folha_pendencias_descartes_select on public.folha_pendencias_descartes for select to authenticated using (public.folha_ok(cliente_id));
revoke all on public.folha_pendencias_descartes from anon;
revoke insert, update, delete on public.folha_pendencias_descartes from authenticated;

create function public.fn_folha_pendencia_descartar(p_cliente uuid, p_chave text, p_motivo text, p_desfazer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_chave is null or p_chave !~ '^(fav|desc|recibo|doc):[0-9a-f-]{36}' or p_desfazer is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if p_desfazer then
    update folha_pendencias_descartes set desfeito_por = auth.uid(), desfeito_em = now()
     where cliente_id = p_cliente and chave = p_chave and desfeito_em is null returning id into v_id;
    if v_id is null then raise exception 'Esta pendência não estava descartada.' using errcode = 'P0001'; end if;
    perform _fn_folha_trilha(p_cliente, 'folha_pendencias_descartes', v_id, 'desfazer', jsonb_build_object('chave', p_chave), null, p_motivo);
  else
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Diga por que não é pendência.' using errcode = 'P0001'; end if;
    if exists (select 1 from folha_pendencias_descartes where cliente_id = p_cliente and chave = p_chave and desfeito_em is null) then
      raise exception 'Esta pendência já foi descartada.' using errcode = 'P0001';
    end if;
    insert into folha_pendencias_descartes (cliente_id, chave, motivo, descartado_por) values (p_cliente, p_chave, btrim(p_motivo), auth.uid()) returning id into v_id;
    perform _fn_folha_trilha(p_cliente, 'folha_pendencias_descartes', v_id, 'descartar', null, jsonb_build_object('chave', p_chave), p_motivo);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.fn_folha_pendencia_descartar(uuid, text, text, boolean) from public, anon;
grant execute on function public.fn_folha_pendencia_descartar(uuid, text, text, boolean) to authenticated, service_role;

-- a leitura: uma lista só, por tipo; nada grava
create function public.fn_folha_pendencias(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if p_cliente is null or not folha_ok(p_cliente) then raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501'; end if;
  with pc as materialized (
    select id, subcentro from financeiro_plano_contas
     where subcentro ilike any (array['Salários e Encargos%', 'Rescisões e Acertos%', 'Benefícios e Premiações%']) or centro_custo ilike 'Mão de Obra%'),
  desc_vivo as materialized (select chave from folha_pendencias_descartes where cliente_id = p_cliente and desfeito_em is null),
  f as materialized (select id, nome, favorecido_id, situacao, split_part(_fn_normalizar_texto(nome), ' ', 1) pn from folha_funcionarios where cliente_id = p_cliente),
  l as materialized (
    select l.id, l.favorecido_id, l.descricao, l.valor, l.data_competencia, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) dt,
           pc.subcentro ilike 'Rescisões e Acertos%' resc
      from financeiro_lancamentos_v2 l join pc on pc.id = l.plano_conta_id
     where l.cliente_id = p_cliente and not coalesce(l.cancelado, false) and l.funcionario_id is null),
  forn as materialized (
    select ff.id, ff.nome,
           (length(regexp_replace(coalesce(ff.cpf_cnpj, ''), '[^0-9]', '', 'g')) = 14
            or ff.nome ~* 'receita|caixa|cont[aá]b|sindicato|inss|fgts|gps|banco|sicredi|sicoob|bradesco|ita[uú]|santander|seguro|unimed|cl[ií]n|servi[cç]|serv\.|ltda|s\.a|s/a|s/s|eireli|prefeitura|sefaz|gru |supermercado|muffato|advogad|mercado|neoenergia|elektro|transporte|oficina|faz\.|fazenda|ajuste|sem dados|cef |assessoria|cooperativa|posto|farm[aá]cia|hospital|laborat') empresa
      from financeiro_fornecedores ff where ff.id in (select distinct favorecido_id from l where favorecido_id is not null)),
  -- (1) favorecido-pessoa com lançamento de folha sem funcionário
  p_fav as (
    select jsonb_build_object('tipo', case when bool_or(l.resc) then 'rescisao_a_conferir' else 'favorecido_sem_funcionario' end,
             'chave', 'fav:' || fo.id, 'favorecido_id', fo.id, 'favorecido', fo.nome, 'n', count(*), 'total', round(sum(abs(l.valor)), 2),
             'desde', min(l.data_competencia), 'ate', max(l.dt), 'tem_rescisao', bool_or(l.resc),
             'sugestao', (select jsonb_build_object('funcionario_id', min(f.id::text), 'funcionario', min(f.nome)) from f
                           where _fn_folha_nome_casa(btrim(regexp_replace(regexp_replace(fo.nome, '^Pec\.3M-', ''), '\(.*\)', '')), f.nome) is not null
                          having count(*) = 1),
             'ids', jsonb_agg(l.id order by l.dt desc)) item, count(*) n
      from l join forn fo on fo.id = l.favorecido_id
     where not fo.empresa and not exists (select 1 from f where f.favorecido_id = fo.id)
       and ('fav:' || fo.id) not in (select chave from desc_vivo)
     group by fo.id, fo.nome),
  -- (2) sugestão pela descrição: lançamento pago a empresa/contador (ou sem favorecido) cuja descrição tem o 1º nome de UM funcionário
  tok as materialized (
    select l.id, t from l left join forn fo on fo.id = l.favorecido_id,
           unnest(string_to_array(regexp_replace(coalesce(_fn_normalizar_texto(l.descricao), ''), '[^a-z0-9 ]', ' ', 'g'), ' ')) t
     where (fo.id is null or fo.empresa) and length(t) >= 4),
  sug as materialized (
    select tok.id, min(f.id::text)::uuid fid, min(f.nome) fnome from tok join f on f.pn = tok.t group by tok.id having count(distinct f.id) = 1),
  p_desc as (
    select jsonb_build_object('tipo', 'sugestao_descricao', 'chave', 'desc:' || l.id, 'lancamento_id', l.id, 'descricao', l.descricao,
             'favorecido', fo.nome, 'valor', abs(l.valor), 'data', l.dt, 'sugestao', jsonb_build_object('funcionario_id', s.fid, 'funcionario', s.fnome)) item, l.dt
      from sug s join l on l.id = s.id left join forn fo on fo.id = l.favorecido_id
     where ('desc:' || l.id) not in (select chave from desc_vivo)
     order by l.dt desc limit 300),
  -- (3) 13º sem recibo: a competência já tem recibo e este lançamento ligado não tem
  l13 as materialized (
    select l.id, l.funcionario_id, l.descricao, l.data_competencia, l.valor,
           exists (select 1 from financeiro_lancamento_documentos d where d.lancamento_id = l.id and not d.cancelado and d.observacao like 'folha-recibo:%')
           or exists (select 1 from folha_documentos d where d.lancamento_id = l.id and d.cancelado_em is null and d.especie = 'recibo_13') tem
      from financeiro_lancamentos_v2 l
     where l.cliente_id = p_cliente and not coalesce(l.cancelado, false) and l.funcionario_id is not null and l.descricao like '13º Salário _ª Parcela%'),
  p_rec as (
    select jsonb_build_object('tipo', 'sem_recibo', 'chave', 'recibo:' || a.id, 'lancamento_id', a.id, 'funcionario_id', a.funcionario_id,
             'funcionario', f.nome, 'descricao', a.descricao, 'valor', abs(a.valor), 'data', a.data_competencia) item
      from l13 a join f on f.id = a.funcionario_id
     where not a.tem and exists (select 1 from l13 b where b.tem and b.descricao = a.descricao and b.data_competencia = a.data_competencia)
       and ('recibo:' || a.id) not in (select chave from desc_vivo)),
  -- (4) documento vencendo em 30 dias (ou vencido), de funcionário não desligado
  p_doc as (
    select jsonb_build_object('tipo', 'documento_vence', 'chave', 'doc:' || d.id, 'documento_id', d.id, 'funcionario_id', d.funcionario_id,
             'funcionario', f.nome, 'especie', d.especie, 'nome', d.nome, 'vencimento', d.vencimento, 'dias', d.vencimento - current_date) item
      from folha_documentos d left join f on f.id = d.funcionario_id
     where d.cliente_id = p_cliente and d.cancelado_em is null and d.vencimento is not null and d.vencimento <= current_date + 30
       and coalesce(f.situacao, 'ativo') <> 'desligado' and ('doc:' || d.id) not in (select chave from desc_vivo))
  select jsonb_build_object(
    'itens', coalesce((select jsonb_agg(item order by n desc) from p_fav), '[]'::jsonb)
             || coalesce((select jsonb_agg(item order by dt desc) from p_desc), '[]'::jsonb)
             || coalesce((select jsonb_agg(item) from p_rec), '[]'::jsonb)
             || coalesce((select jsonb_agg(item) from p_doc), '[]'::jsonb),
    'descartadas', (select count(*) from desc_vivo))
    into v;
  return v;
end $$;
revoke all on function public.fn_folha_pendencias(uuid) from public, anon;
grant execute on function public.fn_folha_pendencias(uuid) to authenticated, service_role;

-- ═══ 5. as leituras das abas (FILA 07:20: Code 6 = banco + leitura; as telas são do Code 4 — o contrato está no relatório)
-- Aba Funcionários: a lista com o que a linha mostra (salário vigente, atuação vigente, contagens) e os totais dos filtros
create function public.fn_folha_funcionarios_lista(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if p_cliente is null or not folha_ok(p_cliente) then raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501'; end if;
  with f as (select * from folha_funcionarios where cliente_id = p_cliente),
  sal as (select distinct on (funcionario_id) funcionario_id, salario, desde from folha_funcionario_salarios
           where cliente_id = p_cliente and desde <= current_date order by funcionario_id, desde desc),
  atu as (select a.funcionario_id, jsonb_agg(jsonb_build_object('fazenda_id', a.fazenda_id, 'fazenda', z.nome, 'atividade', a.atividade, 'pct', a.pct)
                   order by a.pct desc, z.nome) itens, max(a.desde) desde
            from folha_funcionario_atuacao a join fazendas z on z.id = a.fazenda_id
           where a.cliente_id = p_cliente
             and a.desde = (select max(b.desde) from folha_funcionario_atuacao b where b.funcionario_id = a.funcionario_id and b.desde <= current_date)
           group by a.funcionario_id),
  lan as (select funcionario_id, count(*) n, max(coalesce(data_pagamento, data_vencimento, data_competencia)) ultimo
            from financeiro_lancamentos_v2 where cliente_id = p_cliente and funcionario_id is not null and not coalesce(cancelado, false) group by 1),
  doc as (select funcionario_id, count(*) n, count(*) filter (where vencimento is not null and vencimento <= current_date + 30) vencendo
            from folha_documentos where cliente_id = p_cliente and funcionario_id is not null and cancelado_em is null group by 1)
  select jsonb_build_object(
    'funcionarios', coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'nome', f.nome, 'cpf', f.cpf, 'cargo', f.cargo, 'vinculo', f.vinculo, 'empregador_registro', f.empregador_registro,
        'codigo_contador', f.codigo_contador, 'admissao', f.admissao, 'situacao', f.situacao, 'desligamento', f.desligamento,
        'a_atualizar', to_jsonb(f.a_atualizar), 'a_confirmar', cardinality(f.a_atualizar) > 0,
        'favorecido_id', f.favorecido_id, 'favorecido', ff.nome,
        'salario', s.salario, 'salario_desde', s.desde, 'atuacao', coalesce(a.itens, '[]'::jsonb),
        'lancamentos', coalesce(l.n, 0), 'ultimo_pagamento', l.ultimo, 'documentos', coalesce(d.n, 0), 'documentos_vencendo', coalesce(d.vencendo, 0))
      order by f.nome), '[]'::jsonb),
    'contagem', jsonb_build_object('ativos', count(*) filter (where f.situacao <> 'desligado'), 'desligados', count(*) filter (where f.situacao = 'desligado'),
                                   'a_confirmar', count(*) filter (where cardinality(f.a_atualizar) > 0), 'todos', count(*)))
    into v
    from f left join financeiro_fornecedores ff on ff.id = f.favorecido_id left join sal s on s.funcionario_id = f.id
      left join atu a on a.funcionario_id = f.id left join lan l on l.funcionario_id = f.id left join doc d on d.funcionario_id = f.id;
  return v;
end $$;
revoke all on function public.fn_folha_funcionarios_lista(uuid) from public, anon;
grant execute on function public.fn_folha_funcionarios_lista(uuid) to authenticated, service_role;

-- A ficha (painel ao lado, D1 a): o cadastro, os dados para pagar (do FORNECEDOR, só leitura aqui), salários e atuações com vigência,
-- os documentos vivos (com vencimento e "vence em N dias") e os 5 últimos pagamentos ligados
create function public.fn_folha_funcionario_ficha(p_funcionario uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.folha_funcionarios; v jsonb;
begin
  select * into f from folha_funcionarios where id = p_funcionario;
  if not found or not folha_ok(f.cliente_id) then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  select jsonb_build_object(
    'funcionario', to_jsonb(f) - 'criado_por' - 'atualizado_por',
    'pagamento', (select jsonb_build_object('favorecido_id', ff.id, 'favorecido', ff.nome, 'tipo_recebimento', ff.tipo_recebimento,
                    'pix_tipo_chave', ff.pix_tipo_chave, 'pix_chave', ff.pix_chave, 'banco', ff.banco, 'agencia', ff.agencia, 'conta', ff.conta,
                    'tipo_conta', ff.tipo_conta, 'telefone', ff.telefone, 'celular', ff.celular, 'email', ff.email)
                    from financeiro_fornecedores ff where ff.id = f.favorecido_id),
    'salarios', coalesce((select jsonb_agg(jsonb_build_object('desde', s.desde, 'salario', s.salario, 'parte_pct', s.parte_pct, 'motivo', s.motivo) order by s.desde desc)
                    from folha_funcionario_salarios s where s.funcionario_id = f.id), '[]'::jsonb),
    'atuacoes', coalesce((select jsonb_agg(jsonb_build_object('desde', a.desde, 'fazenda_id', a.fazenda_id, 'fazenda', z.nome, 'atividade', a.atividade, 'pct', a.pct)
                    order by a.desde desc, a.pct desc) from folha_funcionario_atuacao a join fazendas z on z.id = a.fazenda_id where a.funcionario_id = f.id), '[]'::jsonb),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'especie', d.especie, 'nome', d.nome, 'bucket', 'folha-documentos',
                    'storage_path', d.storage_path, 'tipo', d.tipo, 'tamanho_bytes', d.tamanho_bytes, 'data_documento', d.data_documento,
                    'vencimento', d.vencimento, 'dias', d.vencimento - current_date, 'lancamento_id', d.lancamento_id, 'criado_em', d.criado_em)
                    order by coalesce(d.data_documento, d.criado_em::date) desc)
                    from folha_documentos d where d.funcionario_id = f.id and d.cancelado_em is null), '[]'::jsonb),
    'ultimos_pagamentos', coalesce((select jsonb_agg(x order by x->>'data' desc) from (
                    select jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao, 'valor', abs(l.valor), 'status', l.status_transacao,
                      'data', coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), 'competencia', l.data_competencia) x
                      from financeiro_lancamentos_v2 l where l.funcionario_id = f.id and not coalesce(l.cancelado, false)
                     order by coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) desc limit 5) y), '[]'::jsonb))
    into v;
  return v;
end $$;
revoke all on function public.fn_folha_funcionario_ficha(uuid) from public, anon;
grant execute on function public.fn_folha_funcionario_ficha(uuid) to authenticated, service_role;

-- Aba Histórico: TODOS os lançamentos ligados à pessoa (qualquer favorecido: o contador, a Caixa…), no período (de/até pela data do
-- pagamento ou, sem ela, do vencimento/competência; null = sem limite), com o TIPO derivado (uma regra só, aqui) e os documentos das
-- duas origens (folha_documentos que apontam para o lançamento + os anexos do lançamento), sem duplicar o mesmo arquivo (md5/caminho)
create function public.fn_folha_historico(p_funcionario uuid, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.folha_funcionarios; v jsonb;
begin
  select * into f from folha_funcionarios where id = p_funcionario;
  if not found or not folha_ok(f.cliente_id) then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  with l as (
    select l.*, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) dt, pc.subcentro sub
      from financeiro_lancamentos_v2 l left join financeiro_plano_contas pc on pc.id = l.plano_conta_id
     where l.funcionario_id = f.id and l.cliente_id = f.cliente_id and not coalesce(l.cancelado, false)
       and (p_de is null or coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) >= p_de)
       and (p_ate is null or coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) <= p_ate)),
  t as (
    select l.*, case
        when l.descricao ilike '13%sal%' or l.descricao ilike '%13º%' or l.descricao ilike '%décimo terceiro%' then '13º'
        when l.sub ilike 'Rescisões e Acertos%' and l.descricao ilike '%multa%' then 'Multa rescisória'
        when l.sub ilike 'Rescisões e Acertos%' then 'Rescisão'
        when l.descricao ilike '%férias%' or l.descricao ilike '%ferias%' then 'Férias'
        when l.descricao ilike '%adiant%' then 'Adiantamento'
        when l.sub ilike 'Benefícios e Premiações%' then 'Benefício'
        when l.sub ilike 'Salários e Encargos%' or l.sub is null then 'Salário'
        else 'Outro' end tipo
      from l),
  docs as (
    select x.lancamento_id, jsonb_agg(jsonb_build_object('origem', x.origem, 'id', x.id, 'nome', x.nome, 'especie', x.especie,
             'bucket', x.bucket, 'storage_path', x.caminho) order by x.nome) itens
      from (select distinct on (u.lancamento_id, coalesce(u.md5, u.caminho)) u.* from (
              select d.lancamento_id, 'folha' origem, d.id, d.nome, d.especie, 'folha-documentos' bucket, d.storage_path caminho, d.md5, 1 ordem
                from folha_documentos d where d.cliente_id = f.cliente_id and d.cancelado_em is null and d.lancamento_id in (select id from l)
              union all
              select d.lancamento_id, 'lancamento', d.id, d.nome, d.especie, 'fin-documentos', d.url, null::text, 2
                from financeiro_lancamento_documentos d where d.cliente_id = f.cliente_id and not d.cancelado and d.lancamento_id in (select id from l)) u
            order by u.lancamento_id, coalesce(u.md5, u.caminho), u.ordem) x
     group by x.lancamento_id)
  select jsonb_build_object(
    'funcionario', jsonb_build_object('id', f.id, 'nome', f.nome, 'situacao', f.situacao, 'admissao', f.admissao, 'desligamento', f.desligamento,
                                      'favorecido_id', f.favorecido_id),
    'itens', coalesce(jsonb_agg(jsonb_build_object('lancamento_id', t.id, 'competencia', t.data_competencia, 'data', t.dt, 'data_pagamento', t.data_pagamento,
                 'tipo', t.tipo, 'descricao', t.descricao, 'favorecido_id', t.favorecido_id, 'favorecido', ff.nome,
                 'pago_a_outro', t.favorecido_id is distinct from f.favorecido_id, 'valor', abs(t.valor), 'status', t.status_transacao,
                 'conciliado', t.conciliado_em is not null, 'documentos', coalesce(d.itens, '[]'::jsonb)) order by t.dt desc, t.id), '[]'::jsonb),
    'n', count(t.id), 'total', coalesce(round(sum(abs(t.valor)), 2), 0),
    'pagos_a_outro', count(t.id) filter (where t.favorecido_id is distinct from f.favorecido_id),
    'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from t group by 1) z), '{}'::jsonb))
    into v
    from t left join financeiro_fornecedores ff on ff.id = t.favorecido_id left join docs d on d.lancamento_id = t.id;
  return v;
end $$;
revoke all on function public.fn_folha_historico(uuid, date, date) from public, anon;
grant execute on function public.fn_folha_historico(uuid, date, date) to authenticated, service_role;
