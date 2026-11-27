-- ENTRADA-CENTRAL-01 F1 — A LEITURA GUARDADA (Gabriel 27/11: mock aprovado; D5 "ler no SERVIDOR, roteia na chegada, não relê").
--   O resultado do leitor da caixa (`lerDaCaixa`, o MESMO código no navegador e na Lambda do SES) fica na linha da entrada e a caixa não
--   relê o arquivo a cada abertura.
--   1. entrada_arquivos.leitura (jsonb) + leitura_em — SÓ O RESULTADO, NUNCA O TEXTO (Gabriel 18/11, lote L1 cancelado). A forma é
--      conferida por `_fn_entrada_leitura_valida` (lista fechada de chaves; folha/resumo/senha só o tipo; teto 32 KB).
--   2. _fn_entrada_registrar: guarda a leitura que a Lambda mandou com o arquivo (inválida = ignorada, o e-mail entra igual). Patch do
--      corpo de hoje, guardado pelo md5 (c1ffaf25…): mudou no banco = esta migration para.
--   3. fn_entrada_leitura_guardar(id, leitura, simular) — o navegador guarda a leitura do que chegou ANTES (ou do que a Lambda não leu).
--      SECURITY DEFINER, tenant_ok (42501), só arquivo com storage, nunca troca a leitura da MESMA versão do leitor.
-- NADA AQUI ALTERA linha de cliente ao aplicar: a coluna nasce vazia.
set lock_timeout = '2s';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'entrada_arquivos' and column_name = 'leitura') then
    raise exception 'ENTRADA-CENTRAL-F1: entrada_arquivos.leitura já existe: refazer.';
  end if;
  if md5(pg_get_functiondef('public._fn_entrada_registrar'::regproc)) <> 'c1ffaf25a13964fc819196544889f78a' then
    raise exception 'ENTRADA-CENTRAL-F1: _fn_entrada_registrar mudou desde a leitura de 27/11: refazer o patch.';
  end if;
  if to_regprocedure('public.fn_entrada_leitura_guardar(uuid, jsonb, boolean)') is not null then
    raise exception 'ENTRADA-CENTRAL-F1: fn_entrada_leitura_guardar já existe: refazer.';
  end if;
end $$;

-- ═══ 1. a forma da leitura ═══
create function public._fn_entrada_leitura_valida(p jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select p is not null and jsonb_typeof(p) = 'object' and octet_length(p::text) <= 32768
     and jsonb_typeof(p->'v') = 'string' and length(p->>'v') between 1 and 20
     and coalesce(p->>'k', '') in ('nota', 'boletos', 'folha', 'resumo', 'nada', 'senha')
     and not exists (select 1 from jsonb_object_keys(p) c
                     where c not in ('v', 'k', 'nota', 'boletos', 'beneficiario', 'pagador', 'paginaDeCada', 'totalDePaginas', 'frase'))
     and case p->>'k'
       when 'nota' then jsonb_typeof(p->'nota') = 'object'
         and (select count(*) from jsonb_object_keys(p) c) = 3
         and not exists (select 1 from jsonb_object_keys(p->'nota') c where c not in ('chave', 'numero', 'emitente', 'valor', 'vencimento'))
         and coalesce(p->'nota'->>'chave', '') ~ '^[0-9]{44}$'
         and length(coalesce(p->'nota'->>'emitente', '')) <= 300
       when 'boletos' then jsonb_typeof(p->'boletos') = 'array' and jsonb_array_length(p->'boletos') between 1 and 200
         and not exists (select 1 from jsonb_object_keys(p) c where c in ('nota', 'frase'))
         and not exists (select 1 from jsonb_array_elements(p->'boletos') b
                         where jsonb_typeof(b) <> 'object'
                            or exists (select 1 from jsonb_object_keys(b) c where c not in ('ok', 'codigo_barras', 'linha', 'tipo', 'banco', 'valor', 'vencimento'))
                            or coalesce(b->>'codigo_barras', '') !~ '^[0-9]{44}$')
         and jsonb_typeof(p->'beneficiario') = 'object' and jsonb_typeof(p->'pagador') = 'object'
         and not exists (select 1 from jsonb_object_keys(p->'beneficiario') c where c not in ('documento', 'nome', 'confira'))
         and not exists (select 1 from jsonb_object_keys(p->'pagador') c where c not in ('documento', 'nome', 'confira'))
         and length(coalesce(p->'beneficiario'->>'nome', '')) <= 300 and length(coalesce(p->'pagador'->>'nome', '')) <= 300
       when 'nada' then (select count(*) from jsonb_object_keys(p) c) = 3 and jsonb_typeof(p->'frase') = 'string' and length(p->>'frase') <= 300
       else (select count(*) from jsonb_object_keys(p) c) = 2   -- folha, resumo, senha: só o tipo (nada de salário, pessoa ou senha)
     end
$$;
revoke all on function public._fn_entrada_leitura_valida(jsonb) from public, anon;
grant execute on function public._fn_entrada_leitura_valida(jsonb) to authenticated, service_role;

alter table public.entrada_arquivos
  add column leitura    jsonb,
  add column leitura_em timestamptz,
  add constraint chk_entrada_leitura_forma check (leitura is null or public._fn_entrada_leitura_valida(leitura)),
  add constraint chk_entrada_leitura_com_arquivo check (leitura is null or md5 is not null),
  add constraint chk_entrada_leitura_em check ((leitura is null) = (leitura_em is null));

-- ═══ 2. a chegada guarda a leitura da Lambda ═══
CREATE OR REPLACE FUNCTION public._fn_entrada_registrar(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dest text := lower(btrim(coalesce(p->>'destinatario', '')));
  v_local text := split_part(v_dest, '@', 1);
  v_dom text := split_part(v_dest, '@', 2);
  v_end cliente_entrada_email;
  v_msg text := left(btrim(coalesce(p->>'mensagem_id', '')), 512);
  v_rem text := left(p->>'remetente', 320);
  v_ass text := left(p->>'assunto', 300);
  v_quando timestamptz := coalesce((p->>'recebido_em')::timestamptz, now());
  v_ver jsonb := coalesce(p->'verificacao', '{}'::jsonb);
  v_virus boolean := upper(coalesce(p->'verificacao'->>'virus', '')) = 'FAIL';
  a jsonb; r jsonb; v_id uuid; v_novo boolean;
  v_saida jsonb := '[]'::jsonb;
  v_leitura jsonb;
begin
  if v_dom <> public._fn_entrada_dominio() then return jsonb_build_object('ok', false, 'motivo', 'dominio'); end if;
  select * into v_end from cliente_entrada_email e where e.local = v_local and e.ativo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'endereco_desconhecido'); end if;
  if v_msg = '' then raise exception 'D3: mensagem sem identificador.' using errcode = '22023'; end if;
  perform set_config('app.via', 'email', true);

  for a in select * from jsonb_array_elements(coalesce(p->'arquivos', '[]'::jsonb)) loop
    if v_virus then   -- o antivírus do SES acusou: o arquivo NÃO entra na área de leitura
      insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, remetente, assunto, recebido_em, arquivo_nome, estado, motivo, verificacao)
      values (v_end.cliente_id, v_end.id, v_msg, v_rem, v_ass, v_quando, left(a->>'nome', 255), 'recusado', 'o antivírus do e-mail acusou este arquivo', v_ver)
      on conflict (cliente_id, mensagem_id, coalesce(arquivo_nome, '')) where md5 is null do nothing;
      continue;
    end if;
    if coalesce(a->>'tipo', '') not in ('pdf', 'xml') or coalesce(a->>'md5', '') !~ '^[0-9a-f]{32}$'
       or coalesce(a->>'storage_path', '') not like v_end.cliente_id::text || '/entrada/%'
       or coalesce((a->>'tamanho')::bigint, 0) not between 1 and 10485760 then
      raise exception 'D3: arquivo inválido (tipo, md5, caminho do cliente ou tamanho).' using errcode = '22023';
    end if;
    -- ENTRADA-CENTRAL-01 F1: a leitura da Lambda (fora da forma = ignorada; o arquivo entra igual e a caixa lê no navegador)
    v_leitura := case when public._fn_entrada_leitura_valida(a->'leitura') then a->'leitura' end;
    insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, remetente, assunto, recebido_em, arquivo_nome, tipo,
                                  tamanho_bytes, md5, storage_path, estado, verificacao, leitura, leitura_em)
    values (v_end.cliente_id, v_end.id, v_msg, v_rem, v_ass, v_quando, left(a->>'nome', 255), a->>'tipo', (a->>'tamanho')::integer,
            a->>'md5', a->>'storage_path', 'a_ler', v_ver, v_leitura, case when v_leitura is not null then now() end)
    on conflict (cliente_id, md5) where md5 is not null do update
      set chegou_de_novo = entrada_arquivos.chegou_de_novo + 1, ultima_chegada_em = now(),
          leitura = coalesce(entrada_arquivos.leitura, excluded.leitura), leitura_em = coalesce(entrada_arquivos.leitura_em, excluded.leitura_em)
    returning id, (xmax = 0) into v_id, v_novo;
    v_saida := v_saida || jsonb_build_object('md5', a->>'md5', 'id', v_id, 'novo', v_novo);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'recusas', '[]'::jsonb)) loop
    insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, remetente, assunto, recebido_em, arquivo_nome, estado, motivo, verificacao)
    values (v_end.cliente_id, v_end.id, v_msg, v_rem, v_ass, v_quando, left(r->>'nome', 255), 'recusado', left(r->>'motivo', 300), v_ver)
    on conflict (cliente_id, mensagem_id, coalesce(arquivo_nome, '')) where md5 is null do nothing;
  end loop;

  -- nada útil: UMA linha (sem anexo, ou a confirmação do Gmail — o código vem no ASSUNTO; o corpo não é lido)
  if jsonb_array_length(coalesce(p->'arquivos', '[]'::jsonb)) = 0 and jsonb_array_length(coalesce(p->'recusas', '[]'::jsonb)) = 0 then
    insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, remetente, assunto, recebido_em, estado, motivo, verificacao)
    values (v_end.cliente_id, v_end.id, v_msg, v_rem, v_ass, v_quando,
            case when coalesce((p->>'confirmacao_gmail')::boolean, false) then 'confirmacao_gmail' else 'sem_anexo' end,
            case when coalesce((p->>'confirmacao_gmail')::boolean, false) then null else 'chegou sem PDF nem XML' end, v_ver)
    on conflict (cliente_id, mensagem_id, coalesce(arquivo_nome, '')) where md5 is null do nothing;
  end if;

  return jsonb_build_object('ok', true, 'cliente_id', v_end.cliente_id, 'arquivos', v_saida);
end $function$;

-- ═══ 3. o navegador guarda a leitura do que chegou antes ═══
create function public.fn_entrada_leitura_guardar(p_id uuid, p_leitura jsonb, p_simular boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v entrada_arquivos;
begin
  select * into v from entrada_arquivos where id = p_id;
  if not found or not public.tenant_ok(v.cliente_id) then raise exception 'Sem acesso a este arquivo.' using errcode = '42501'; end if;
  if p_simular is null or not public._fn_entrada_leitura_valida(p_leitura) then raise exception 'Leitura inválida.' using errcode = '22023'; end if;
  if v.md5 is null then raise exception 'Esta linha não tem arquivo.' using errcode = '22023'; end if;
  -- a mesma versão do leitor já guardada: nada a fazer (o mesmo arquivo dá a mesma leitura)
  if v.leitura is not null and v.leitura->>'v' = p_leitura->>'v' then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', true);
  end if;
  if not p_simular then
    update entrada_arquivos set leitura = p_leitura, leitura_em = now() where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', false);
end $$;
revoke all on function public.fn_entrada_leitura_guardar(uuid, jsonb, boolean) from public, anon;
grant execute on function public.fn_entrada_leitura_guardar(uuid, jsonb, boolean) to authenticated;
