-- FOLHA-NA-CAIXA-01b item 4 (Gabriel 24/11 14:03, print: arquivo ARRASTADO e aplicado mostra "feito" e some ao fechar; Resolvidos = 0) —
-- todo arquivo aplicado (arrastado OU do e-mail) fica guardado e vai para RESOLVIDOS com tipo, arquivo, quando, quem e o que gerou.
--   1. entrada_arquivos aceita origem 'arrastado' (sem endereço de e-mail; quem arrastou em `enviado_por`). O mesmo arquivo (md5) é UMA
--      linha por cliente, venha por onde vier (o índice único de hoje).
--   2. fn_entrada_registrar_arrastado(cliente, nome, tipo, tamanho, md5, simular): registra no GESTO (aplicar/vincular/guardar), não no
--      soltar; devolve o caminho onde a tela sobe o arquivo (<cliente>/entrada/<md5>.<tipo>, o mesmo bucket e a mesma regra do e-mail).
--      Já existe (o mesmo md5) = devolve a linha de hoje (ja_existia), nada novo.
--   3. fn_entrada_resolvidos(cliente): a lista de Resolvidos com QUEM (o nome de quem resolveu; senão de quem arrastou), QUANDO e O QUE
--      GEROU — folha: tipo, competência, lançamentos e pessoas pela trilha do recibo (via 'folha-recibo:<md5 do arquivo>'; o md5 da entrada
--      É o do documento do contador); boleto: beneficiário/valor/vencimento; nota: o lançamento.
--   4. entrada_trilha ganha a ação 'arrastado'.
-- NADA AQUI ESCREVE dado de cliente: nenhuma linha muda.
set lock_timeout = '2s';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'entrada_arquivos' and column_name = 'enviado_por') then
    raise exception 'CAIXA-ARRASTADO: a coluna enviado_por já existe: refazer.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entrada_arquivos_origem_check' and conrelid = 'public.entrada_arquivos'::regclass) then
    raise exception 'CAIXA-ARRASTADO: o check de origem não é o esperado: refazer.';
  end if;
end $$;

-- ═══ 1. a origem 'arrastado' ═══
alter table public.entrada_arquivos add column enviado_por uuid;
alter table public.entrada_arquivos alter column entrada_email_id drop not null;
alter table public.entrada_arquivos drop constraint entrada_arquivos_origem_check;
alter table public.entrada_arquivos add constraint entrada_arquivos_origem_check check (origem = any (array['email', 'arrastado']));
alter table public.entrada_arquivos add constraint chk_entrada_origem_email
  check (((origem = 'email') = (entrada_email_id is not null)) and ((origem = 'arrastado') = (enviado_por is not null)));
alter table public.entrada_trilha drop constraint entrada_trilha_acao_check;
alter table public.entrada_trilha add constraint entrada_trilha_acao_check check (acao = any (array['ignorado', 'voltou', 'resolvido', 'arrastado']));

-- ═══ 2. registrar o arrastado (no gesto) ═══
create function public.fn_entrada_registrar_arrastado(p_cliente uuid, p_nome text, p_tipo text, p_tamanho integer, p_md5 text,
                                                      p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos; v_md5 text := lower(coalesce(p_md5, '')); v_nome text := left(btrim(coalesce(p_nome, '')), 255); v_path text;
begin
  if p_cliente is null or not public.tenant_ok(p_cliente) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if v_md5 !~ '^[0-9a-f]{32}$' or v_nome = '' or coalesce(p_tipo, '') not in ('pdf', 'xml') or p_tamanho is null
     or p_tamanho < 1 or p_tamanho > 10485760 or p_simular is null then
    raise exception 'Arquivo inválido.' using errcode = '22023';
  end if;
  select * into v from entrada_arquivos where cliente_id = p_cliente and md5 = v_md5;
  if found then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'id', v.id, 'storage_path', v.storage_path, 'ja_existia', true,
                              'estado', v.estado, 'origem', v.origem);
  end if;
  v_path := p_cliente::text || '/entrada/' || v_md5 || '.' || p_tipo;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', null, 'storage_path', v_path, 'ja_existia', false, 'estado', 'a_ler', 'origem', 'arrastado');
  end if;
  insert into entrada_arquivos (cliente_id, origem, entrada_email_id, mensagem_id, recebido_em, arquivo_nome, tipo, tamanho_bytes, md5,
                                storage_path, estado, enviado_por)
  values (p_cliente, 'arrastado', null, 'arrastado:' || v_md5, now(), v_nome, p_tipo, p_tamanho, v_md5, v_path, 'a_ler', auth.uid())
  returning * into v;
  insert into entrada_trilha (cliente_id, entrada_id, acao, antes, depois, motivo, por, via)
  values (p_cliente, v.id, 'arrastado', public._fn_entrada_foto(v), public._fn_entrada_foto(v), null, auth.uid(), public._fn_entrada_via());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v.id, 'storage_path', v_path, 'ja_existia', false, 'estado', v.estado, 'origem', 'arrastado');
end $$;
revoke all on function public.fn_entrada_registrar_arrastado(uuid, text, text, integer, text, boolean) from public, anon;
grant execute on function public.fn_entrada_registrar_arrastado(uuid, text, text, integer, text, boolean) to authenticated;

-- ═══ 3. Resolvidos: quem, quando, o que gerou ═══
create function public.fn_entrada_resolvidos(p_cliente uuid)
returns table (entrada_id uuid, origem text, quem text, quando timestamptz, o_que jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_cliente is null or not public.tenant_ok(p_cliente) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  return query
  select e.id, e.origem, public._fn_nome_do_usuario(coalesce(e.lido_por, e.enviado_por)), e.lido_em,
         case e.estado
           when 'folha' then (
             select jsonb_build_object('tipo', min(t.depois->>'tipo'), 'competencia', min(t.depois->>'competencia'),
                                       'lancamentos', count(distinct t.depois->>'lancamento_id'), 'pessoas', count(*))
               from folha_trilha t join folha_documentos d on d.id = t.registro_id
              where t.cliente_id = e.cliente_id and t.via = 'folha-recibo:' || e.md5 and t.tabela = 'folha_documentos'
                and t.acao = 'registrar' and d.cancelado_em is null)
           when 'boleto' then (select jsonb_build_object('beneficiario', b.beneficiario_nome, 'valor', b.valor, 'vencimento', b.vencimento)
                                 from boletos b where b.id = e.boleto_id)
           when 'nota' then (select jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao, 'valor', l.valor)
                               from financeiro_lancamentos_v2 l where l.id = e.lancamento_id)
         end
    from entrada_arquivos e
   where e.cliente_id = p_cliente and e.estado in ('boleto', 'nota', 'folha')
   order by e.lido_em desc nulls last, e.id
   limit 300;
end $$;
revoke all on function public.fn_entrada_resolvidos(uuid) from public, anon;
grant execute on function public.fn_entrada_resolvidos(uuid) to authenticated;
