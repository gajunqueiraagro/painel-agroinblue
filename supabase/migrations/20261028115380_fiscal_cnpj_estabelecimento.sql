-- FISCAL · 20261028115380 — CNPJ DO ESTABELECIMENTO do produtor (a partir de 01/01/2027; mock aprovado pelo Gabriel 15/11 07:48:
-- D1 (a) colunas na fiscal_titular_ies · D2 (a) aposentar fiscal_titulares.cnpj_produtor · D3 (a) filial nova casa pela base de 8 dígitos).
-- Regra (Sefaz/CNA): o CNPJ é do PRODUTOR, dado de ofício a partir da IE ativa; cada fazenda com IE é um estabelecimento (matriz + filiais,
-- a mesma base de 8 dígitos); IE com vários CPFs → um CNPJ por produtor (cada um tem a sua linha de IE); o CPF continua (IR segue PF).
-- · Guarda: na IE do titular (uma linha = este produtor nesta IE = um estabelecimento): cnpj, situação (a receber / recebido), desde, fonte.
--   Matriz/filial sai do número (ordem 0001 = matriz), nunca se digita. Escrita SÓ pela fn_fiscal_ie_cnpj_gravar (prévia, trilha).
-- · O cnpj_produtor (um por produtor) vai para a IE dele antes de aposentar (sem ambiguidade; senão PARA e lista) e fica vazio para sempre.
-- · Casamento nota/boleto/certificado ↔ titular numa regra só: _fn_fiscal_titular_do_documento (CPF · CNPJ do titular · CNPJ do
--   estabelecimento · base de 8 dígitos = "filial nova"). As 3 funções que olhavam só o CPF passam a chamá-la (patch guardado por md5).
-- · Pendência "Sem CNPJ do estabelecimento": só a partir de 01/01/2027 e só para PF com IE ativa.
set local lock_timeout = '2s';

-- ── (1) as colunas na IE do titular ───────────────────────────────────────────────────────────────────────────────────────────
alter table public.fiscal_titular_ies
  add column cnpj text constraint fiscal_titular_ies_cnpj_ck check (cnpj is null or (length(cnpj) = 14 and public._fn_cpf_cnpj_valido(cnpj))),
  add column cnpj_situacao text constraint fiscal_titular_ies_cnpj_situacao_ck check (cnpj_situacao is null or cnpj_situacao in ('a_receber', 'recebido')),
  add column cnpj_desde date,
  add column cnpj_fonte text constraint fiscal_titular_ies_cnpj_fonte_ck
    check (cnpj_fonte is null or cnpj_fonte in ('cartao_cnpj', 'sefaz', 'nota', 'cadastro_anterior', 'informado')),
  add constraint fiscal_titular_ies_cnpj_recebido_ck check ((coalesce(cnpj_situacao, '') = 'recebido') = (cnpj is not null));
create unique index fiscal_titular_ies_cnpj_uq on public.fiscal_titular_ies (cliente_id, cnpj) where ativo and cnpj is not null;
comment on column public.fiscal_titular_ies.cnpj is 'CNPJ-ESTABELECIMENTO (115380): o CNPJ deste produtor NESTA IE (de ofício a partir de 2027; matriz = ordem 0001). Base de 8 dígitos única por produtor. Escrita só pela fn_fiscal_ie_cnpj_gravar.';

-- ── (2) o cnpj_produtor vai para a IE e se aposenta ───────────────────────────────────────────────────────────────────────────
do $$
declare r record; v_ie uuid; v_n int; v_nsp int; v_falta text := '';
begin
  for r in select t.id, t.cliente_id, t.nome, t.cnpj_produtor from public.fiscal_titulares t where t.cnpj_produtor is not null loop
    select count(*), count(*) filter (where i.uf = 'SP') into v_n, v_nsp from public.fiscal_titular_ies i where i.titular_id = r.id and i.ativo;
    v_ie := null;
    if v_n = 1 then
      select i.id into v_ie from public.fiscal_titular_ies i where i.titular_id = r.id and i.ativo;
    elsif v_nsp = 1 then  -- SP já dá CNPJ ao produtor PF: com várias IEs, o CNPJ anterior é o da IE paulista
      select i.id into v_ie from public.fiscal_titular_ies i where i.titular_id = r.id and i.ativo and i.uf = 'SP';
    end if;
    if v_ie is null then
      v_falta := v_falta || format(' %s (%s IEs ativas);', r.nome, v_n);
    else
      update public.fiscal_titular_ies set cnpj = r.cnpj_produtor, cnpj_situacao = 'recebido', cnpj_fonte = 'cadastro_anterior', updated_at = now()
       where id = v_ie;
      insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
      values (r.cliente_id, null, 'fiscal', 'editou', 'fiscal_titular_ies', v_ie,
              format('%s · o CNPJ do produtor passou para a inscrição estadual (CNPJ por estabelecimento)', r.nome),
              jsonb_build_object('cnpj_produtor', r.cnpj_produtor), jsonb_build_object('cnpj', r.cnpj_produtor, 'situacao', 'recebido'),
              'sistema:migration 115380');
    end if;
  end loop;
  if v_falta <> '' then
    raise exception 'CNPJ-ESTABELECIMENTO 115380: não sei em que IE fica o CNPJ do produtor de:% — acerte a IE antes (nada foi gravado).', v_falta;
  end if;
  update public.fiscal_titulares set cnpj_produtor = null where cnpj_produtor is not null;
end $$;
alter table public.fiscal_titulares add constraint fiscal_titulares_cnpj_produtor_aposentado_ck check (cnpj_produtor is null);
comment on column public.fiscal_titulares.cnpj_produtor is 'APOSENTADA (115380, D2 a): o CNPJ do produtor mora em cada IE (fiscal_titular_ies.cnpj). Fica vazia para sempre (CHECK) e sai numa migration de limpeza.';

-- ── (3) a regra única do casamento documento ↔ titular ────────────────────────────────────────────────────────────────────────
-- 'documento' = CPF/CNPJ do titular · 'estabelecimento' = o CNPJ de uma IE dele · 'base' = mesma base de 8 dígitos (filial nova: avisar).
-- INVOKER: lê só o que a RLS deixa (é chamada pela tela via o boleto e pelas portas SECURITY DEFINER).
create or replace function public._fn_fiscal_titular_do_documento(p_cliente uuid, p_documento text)
returns table (titular_id uuid, como text) language sql stable set search_path = pg_catalog, public as $$
  with d as (select public._fn_documento_normalizar(p_documento) v),
  m as (
    select t.id tid, 'documento'::text como, 1 o from public.fiscal_titulares t, d where t.cliente_id = p_cliente and t.documento = d.v
    union all
    select i.titular_id, 'estabelecimento', 2 from public.fiscal_titular_ies i, d
     where i.cliente_id = p_cliente and i.ativo and length(d.v) = 14 and i.cnpj = d.v
    union all
    select t.id, 'base', 3 from public.fiscal_titulares t, d
     where t.cliente_id = p_cliente and length(d.v) = 14 and length(t.documento) = 14 and left(t.documento, 8) = left(d.v, 8) and t.documento <> d.v
    union all
    select i.titular_id, 'base', 3 from public.fiscal_titular_ies i, d
     where i.cliente_id = p_cliente and i.ativo and length(d.v) = 14 and left(i.cnpj, 8) = left(d.v, 8) and i.cnpj <> d.v)
  select distinct on (m.tid) m.tid, m.como
    from m join public.fiscal_titulares t on t.id = m.tid and t.ativo
   where (select length(v) from d) in (11, 14)
   order by m.tid, m.o
$$;

create or replace function public.fn_fiscal_titulares_do_documento(p_cliente_id uuid, p_documento text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('titular_id', m.titular_id, 'nome', t.nome, 'como', m.como,
                                                       'aviso', case when m.como = 'base' then 'Filial nova: cadastre o CNPJ na inscrição estadual.' end)
                                    order by m.como = 'base', t.nome), '[]'::jsonb)
            from public._fn_fiscal_titular_do_documento(p_cliente_id, p_documento) m join public.fiscal_titulares t on t.id = m.titular_id);
end $$;

-- ── (4) a porta do CNPJ de uma IE (o ✎ da lista) ──────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_ie_cnpj_gravar(p_ie_id uuid, p_cnpj text, p_situacao text, p_desde date, p_fonte text,
  p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare i public.fiscal_titular_ies; t public.fiscal_titulares; v_cnpj text := nullif(public._fn_documento_normalizar(p_cnpj), '');
  v_sit text := nullif(btrim(coalesce(p_situacao, '')), ''); v_fonte text := coalesce(nullif(btrim(coalesce(p_fonte, '')), ''), 'informado');
  v_base text; v_outro text; v_antes jsonb; v_depois jsonb; v_frase text;
begin
  select * into i from public.fiscal_titular_ies where id = p_ie_id;
  if i.id is null or not coalesce(public.tenant_ok(i.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Inscrição estadual não encontrada (ou sem acesso).';
  end if;
  if not i.ativo then raise exception 'Esta inscrição estadual está inativa.'; end if;
  select * into t from public.fiscal_titulares where id = i.titular_id;
  if v_sit is null then v_sit := case when v_cnpj is null then 'a_receber' else 'recebido' end; end if;
  if v_sit not in ('a_receber', 'recebido') then raise exception 'Situação do CNPJ: a receber ou recebido.'; end if;
  if v_sit = 'recebido' and v_cnpj is null then raise exception 'Informe o CNPJ recebido.'; end if;
  if v_sit = 'a_receber' and v_cnpj is not null then raise exception 'Com o número em mãos, a situação é "recebido".'; end if;
  if v_fonte not in ('cartao_cnpj', 'sefaz', 'nota', 'cadastro_anterior', 'informado') then raise exception 'De onde veio o CNPJ: cartão CNPJ, Sefaz, nota ou informado.'; end if;
  if v_cnpj is not null then
    if length(v_cnpj) <> 14 or not public._fn_cpf_cnpj_valido(v_cnpj) then
      raise exception '%', format('O CNPJ %s não é válido: confira os dígitos.', public._fn_cpf_cnpj_formatado(v_cnpj));
    end if;
    -- uma base só por produtor (a do próprio CNPJ, se o titular é PJ; senão a das outras IEs dele)
    v_base := case when length(t.documento) = 14 then left(t.documento, 8)
                   else (select left(x.cnpj, 8) from public.fiscal_titular_ies x where x.titular_id = t.id and x.ativo and x.cnpj is not null and x.id <> i.id limit 1) end;
    if v_base is not null and left(v_cnpj, 8) <> v_base then
      raise exception '%', format('O CNPJ de um produtor tem uma base só (%s…): %s é de outra base — confira.',
                                  left(v_base, 2) || '.' || substr(v_base, 3, 3) || '.' || substr(v_base, 6, 3), public._fn_cpf_cnpj_formatado(v_cnpj));
    end if;
    select x.nome into v_outro from public.fiscal_titular_ies y join public.fiscal_titulares x on x.id = y.titular_id
     where y.cliente_id = i.cliente_id and y.ativo and y.cnpj = v_cnpj and y.id <> i.id limit 1;
    if v_outro is null then
      select x.nome into v_outro from public.fiscal_titulares x where x.cliente_id = i.cliente_id and x.documento = v_cnpj and x.id <> t.id limit 1;
    end if;
    if v_outro is not null then raise exception '%', format('O CNPJ %s já é de %s.', public._fn_cpf_cnpj_formatado(v_cnpj), v_outro); end if;
  end if;
  if p_desde is not null and p_desde > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Desde: a data não pode ser no futuro.'; end if;
  v_antes := jsonb_build_object('cnpj', i.cnpj, 'situacao', i.cnpj_situacao, 'desde', i.cnpj_desde, 'fonte', i.cnpj_fonte);
  v_depois := jsonb_build_object('cnpj', v_cnpj, 'situacao', v_sit, 'desde', case when v_cnpj is null then null else p_desde end,
                                 'fonte', case when v_cnpj is null then null else v_fonte end);
  v_frase := case when v_cnpj is null then format('%s · IE %s/%s: CNPJ a receber.', t.nome, i.ie, i.uf)
                  else format('%s · IE %s/%s: CNPJ %s (%s).', t.nome, i.ie, i.uf, public._fn_cpf_cnpj_formatado(v_cnpj),
                              case when substr(v_cnpj, 9, 4) = '0001' then 'matriz' else 'filial' end) end;
  if p_simular or v_antes = v_depois then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'antes', v_antes, 'depois', v_depois,
      'matriz', case when v_cnpj is null then null else substr(v_cnpj, 9, 4) = '0001' end,
      'frase', case when v_antes = v_depois then format('%s: nada muda.', t.nome) else v_frase end);
  end if;
  update public.fiscal_titular_ies set cnpj = v_cnpj, cnpj_situacao = v_sit, cnpj_desde = (v_depois->>'desde')::date, cnpj_fonte = v_depois->>'fonte',
         updated_at = now() where id = i.id;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (i.cliente_id, auth.uid(), 'fiscal', 'editou', 'fiscal_titular_ies', i.id, v_frase, v_antes, v_depois, public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'antes', v_antes, 'depois', v_depois, 'frase', v_frase);
end $$;

-- ── (5) a pendência nova (só a partir de 01/01/2027, só PF com IE) ────────────────────────────────────────────────────────────
create or replace function public._fn_fiscal_titular_pendencias(p jsonb)
 returns text[] language sql immutable set search_path to 'pg_catalog' as $function$
  select case when p->>'papel' = 'terceiro' then '{}'::text[] else array_remove(array[
    case when coalesce(jsonb_array_length(p->'ies'), 0) = 0 then 'Sem inscrição estadual' end,
    case when p->>'tipo' = 'PF' and p->>'nascimento' is null then 'Sem data de nascimento' end,
    case when p->>'email_fiscal' is null then 'Sem e-mail fiscal' end,
    case when p->>'endereco' is null or p->>'municipio' is null or p->>'uf' is null or p->>'cep' is null
         then 'Endereço fiscal incompleto' end,
    case when p->>'regime_ir' is null then 'Sem regime do IR' end,
    case when not coalesce((p->>'tem_fazenda')::boolean, false) then 'Sem fazenda' end,
    case when not coalesce((p->>'tem_condicao_ibs')::boolean, false) then 'Sem condição no IBS/CBS' end,
    case when p->>'tipo' = 'PF' and coalesce((p->>'cnpj_exigido')::boolean, false)
              and exists (select 1 from jsonb_array_elements(coalesce(p->'ies', '[]'::jsonb)) x where x->>'cnpj' is null)
         then 'Sem CNPJ do estabelecimento' end
  ], null) end
$function$;

-- ── (6) patches guardados por md5 (a função de hoje, a âncora casa 1 vez) ─────────────────────────────────────────────────────
create function pg_temp.patch(p_fn regprocedure, p_md5 text, p_de text, p_para text) returns void language plpgsql as $p$
declare d text := pg_get_functiondef(p_fn); n int;
begin
  if md5(d) <> p_md5 then raise exception 'CNPJ-ESTABELECIMENTO 115380: % mudou desde o ensaio (md5 %): refazer o patch.', p_fn, md5(d); end if;
  n := (length(d) - length(replace(d, p_de, ''))) / length(p_de);
  if n <> 1 then raise exception 'CNPJ-ESTABELECIMENTO 115380: a âncora casa % vezes em %.', n, p_fn; end if;
  execute replace(d, p_de, p_para);
end $p$;

-- a lista: cada IE com o seu CNPJ; e se o CNPJ já é exigido (a partir de 01/01/2027)
select pg_temp.patch('public.fn_fiscal_titulares_lista(uuid)', '137d75d6b43871574d04b02a6799e0b4',
  $A$'ies', (select coalesce(jsonb_agg(jsonb_build_object('uf', i.uf, 'ie', i.ie, 'fazenda_id', i.fazenda_id) order by i.uf, i.ie), '[]'::jsonb)$A$,
  $B$'cnpj_exigido', v_hoje >= date '2027-01-01',
            'ies', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'uf', i.uf, 'ie', i.ie, 'fazenda_id', i.fazenda_id, 'cnpj', i.cnpj,
                                                                 'cnpj_formatado', case when i.cnpj is not null then public._fn_cpf_cnpj_formatado(i.cnpj) end,
                                                                 'cnpj_situacao', i.cnpj_situacao, 'cnpj_desde', i.cnpj_desde, 'cnpj_fonte', i.cnpj_fonte,
                                                                 'matriz', case when i.cnpj is not null then substr(i.cnpj, 9, 4) = '0001' end) order by i.uf, i.ie), '[]'::jsonb)$B$);
-- os titulares sugeridos pelas notas: a nota no CNPJ do estabelecimento acha o produtor (não sugere outro)
select pg_temp.patch('public.fn_fiscal_titulares_sugeridos(uuid)', '4fb11b9aefeb34d5197827acc6d308f0',
  $A$left join public.fiscal_titulares t on t.cliente_id = p_cliente and t.documento = s.doc$A$,
  $B$left join lateral (select x.id, x.nome from public._fn_fiscal_titular_do_documento(p_cliente, s.doc) m
                         join public.fiscal_titulares x on x.id = m.titular_id order by m.como = 'base', x.nome limit 1) t on true$B$);
-- o boleto: pagador = qualquer documento do titular (CPF, CNPJ, estabelecimento, base)
select pg_temp.patch('public._fn_boleto_situacao(boletos)', '4f8a40a397458be176f52f23213a26b0',
  $A$and v_kp in (public._fn_fornecedor_chave_documento(t.documento), public._fn_fornecedor_chave_documento(t.cnpj_produtor))) then$A$,
  $B$and t.id in (select m.titular_id from public._fn_fiscal_titular_do_documento(b.cliente_id, v_kp) m)) then$B$);
-- o certificado: e-CPF ou e-CNPJ do próprio produtor (o CNPJ de um estabelecimento dele, ou a base)
select pg_temp.patch('public.fn_fiscal_certificado_registrar(uuid,uuid,jsonb,text,text)', '00060d02ff29993c8e01804f3fd32a42',
  $A$if v_doc = '' or v_doc <> regexp_replace(coalesce(t.documento, ''), '\D', '', 'g') then$A$,
  $B$if v_doc = '' or not exists (select 1 from public._fn_fiscal_titular_do_documento(t.cliente_id, v_doc) m where m.titular_id = t.id) then$B$);
-- o gravar do titular: o CNPJ do produtor não se grava mais ali (vai na IE)
select pg_temp.patch('public.fn_fiscal_titular_gravar(uuid,uuid,jsonb,boolean)', '7b6aae9261048f3cc53998744e293beb',
  $A$  if v_cnpjp is not null then
    if v_tipo <> 'CPF'$A$,
  $B$  if v_cnpjp is not null then
    raise exception 'O CNPJ agora é de cada estabelecimento: informe-o na inscrição estadual (✎ na lista de IEs).';
    if v_tipo <> 'CPF'$B$);

-- ── acesso ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._fn_fiscal_titular_do_documento(uuid, text) from public, anon;
grant execute on function public._fn_fiscal_titular_do_documento(uuid, text) to authenticated, service_role;  -- INVOKER: a RLS filtra
revoke all on function public.fn_fiscal_titulares_do_documento(uuid, text) from public, anon;
grant execute on function public.fn_fiscal_titulares_do_documento(uuid, text) to authenticated, service_role;
revoke all on function public.fn_fiscal_ie_cnpj_gravar(uuid, text, text, date, text, boolean) from public, anon;
grant execute on function public.fn_fiscal_ie_cnpj_gravar(uuid, text, text, date, text, boolean) to authenticated, service_role;
