-- FOLHA-NA-CAIXA-01 (Gabriel 24/11 10:55, prioridade 1) — o recibo do contador que chegou POR E-MAIL e foi aplicado pela Caixa
-- (fn_folha_recibos_aplicar, Code 6) marca a linha da entrada como resolvida: o estado novo 'folha'.
--   1. entrada_arquivos aceita estado = 'folha' (e exige o arquivo, como boleto e nota). Sem lançamento: a folha liga vários (o vínculo
--      de cada pessoa está em folha_documentos.entrada_arquivo_id).
--   2. fn_entrada_resolver aceita 'folha'; fn_entrada_voltar ("Desfazer" em Resolvidos: só tira a marca) e _fn_entrada_ignorar (o
--      resolvido não se ignora) passam a conhecer 'folha'. As 3 copiadas VERBATIM da 118180; só o 'folha' entra. Assinatura, ACL e
--      retorno de hoje (CREATE OR REPLACE mantém os GRANTs).
-- NADA AQUI ESCREVE dado: nenhuma linha muda de estado.
set lock_timeout = '2s';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entrada_arquivos_estado_check' and conrelid = 'public.entrada_arquivos'::regclass) then
    raise exception 'FOLHA-NA-CAIXA-01: o check de estado não é o esperado: refazer.';
  end if;
  if exists (select 1 from public.entrada_arquivos where estado = 'folha') then raise exception 'FOLHA-NA-CAIXA-01: já há estado folha: refazer.'; end if;
end $$;

-- ═══ 1. o estado ═══
alter table public.entrada_arquivos drop constraint entrada_arquivos_estado_check;
alter table public.entrada_arquivos add constraint entrada_arquivos_estado_check
  check (estado = any (array['a_ler', 'boleto', 'nota', 'folha', 'nao_reconhecido', 'sem_anexo', 'recusado', 'confirmacao_gmail', 'dispensado']));
alter table public.entrada_arquivos drop constraint entrada_arquivos_check2;
alter table public.entrada_arquivos add constraint entrada_arquivos_check2
  check ((estado <> all (array['a_ler', 'boleto', 'nota', 'folha', 'nao_reconhecido'])) or (md5 is not null));

-- ═══ 2. as funções ═══
create or replace function public._fn_entrada_ignorar(p_ids uuid[], p_motivo text, p_detalhe text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos; v_cli uuid; v_n int := 0; v_ja int := 0; v_det text := nullif(btrim(coalesce(p_detalhe, '')), '');
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Nada escolhido para ignorar.' using errcode = '22023'; end if;
  if cardinality(p_ids) > 200 then raise exception 'No máximo 200 de uma vez.' using errcode = '22023'; end if;
  if p_motivo = 'outro' and v_det is null then raise exception 'Escreva o motivo.' using errcode = 'P0001'; end if;
  if (select count(*) from entrada_arquivos where id = any(p_ids)) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002';
  end if;
  select min(cliente_id::text)::uuid into v_cli from entrada_arquivos where id = any(p_ids);
  if exists (select 1 from entrada_arquivos where id = any(p_ids) and cliente_id <> v_cli) then
    raise exception 'Sem acesso a este cliente.' using errcode = '42501';
  end if;
  if not public.tenant_ok(v_cli) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  for v in select * from entrada_arquivos where id = any(p_ids) order by recebido_em, id for update loop
    if v.estado in ('boleto', 'nota', 'folha') then
      raise exception 'Este arquivo já foi resolvido; para tirá-lo, use "Desfazer" em Resolvidos.' using errcode = 'P0001';
    end if;
    if v.estado = 'dispensado' then v_ja := v_ja + 1; continue; end if;
    v_n := v_n + 1;
    if not p_simular then
      update entrada_arquivos set estado = 'dispensado', ignorado_motivo = p_motivo, ignorado_detalhe = left(v_det, 300),
             dispensado_em = now(), dispensado_por = auth.uid()
       where id = v.id;
      insert into entrada_trilha (cliente_id, entrada_id, acao, antes, depois, motivo, por, via)
      select v.cliente_id, v.id, 'ignorado', public._fn_entrada_foto(v), public._fn_entrada_foto(e), left(v_det, 300), auth.uid(), public._fn_entrada_via()
        from entrada_arquivos e where e.id = v.id;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'ignorados', v_n, 'ja_estavam', v_ja);
end $$;

create or replace function public.fn_entrada_voltar(p_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos;
begin
  select * into v from entrada_arquivos where id = p_id for update;
  if not found then raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002'; end if;
  if not public.tenant_ok(v.cliente_id) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if v.estado not in ('dispensado', 'boleto', 'nota', 'folha') then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', true);
  end if;
  if v.md5 is null then raise exception 'Esta linha não tem arquivo para ler.' using errcode = 'P0001'; end if;
  if not p_simular then
    update entrada_arquivos set estado = 'a_ler', ignorado_motivo = null, ignorado_detalhe = null, boleto_id = null, lancamento_id = null,
           dispensado_em = null, dispensado_por = null, lido_em = null, lido_por = null
     where id = v.id;
    insert into entrada_trilha (cliente_id, entrada_id, acao, antes, depois, motivo, por, via)
    select v.cliente_id, v.id, 'voltou', public._fn_entrada_foto(v), public._fn_entrada_foto(e), null, auth.uid(), public._fn_entrada_via()
      from entrada_arquivos e where e.id = v.id;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', false, 'era', v.estado);
end $$;

create or replace function public.fn_entrada_resolver(p_id uuid, p_estado text, p_boleto_id uuid default null, p_lancamento_id uuid default null,
                                           p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos; v_cli uuid;
begin
  if p_estado not in ('boleto', 'nota', 'folha') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  select * into v from entrada_arquivos where id = p_id for update;
  if not found then raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002'; end if;
  if not public.tenant_ok(v.cliente_id) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if v.estado in ('boleto', 'nota', 'folha', 'dispensado') then
    raise exception 'Este arquivo já foi resolvido ou ignorado.' using errcode = 'P0001';
  end if;
  if v.md5 is null then raise exception 'Esta linha não tem arquivo.' using errcode = 'P0001'; end if;
  if p_estado = 'boleto' then
    if p_boleto_id is null then raise exception 'Falta o boleto.' using errcode = '22023'; end if;
    select cliente_id into v_cli from boletos where id = p_boleto_id;
    if v_cli is distinct from v.cliente_id then raise exception 'O boleto não é deste cliente.' using errcode = '42501'; end if;
  elsif p_boleto_id is not null then raise exception 'Só o estado boleto leva o boleto.' using errcode = '22023';
  end if;
  if p_estado = 'folha' and p_lancamento_id is not null then raise exception 'A folha não leva lançamento (são vários).' using errcode = '22023'; end if;
  if p_lancamento_id is not null then
    select cliente_id into v_cli from financeiro_lancamentos_v2 where id = p_lancamento_id;
    if v_cli is distinct from v.cliente_id then raise exception 'O lançamento não é deste cliente.' using errcode = '42501'; end if;
  end if;
  if not p_simular then
    update entrada_arquivos set estado = p_estado, boleto_id = p_boleto_id, lancamento_id = p_lancamento_id, lido_em = now(), lido_por = auth.uid()
     where id = v.id;
    insert into entrada_trilha (cliente_id, entrada_id, acao, antes, depois, motivo, por, via)
    select v.cliente_id, v.id, 'resolvido', public._fn_entrada_foto(v), public._fn_entrada_foto(e), null, auth.uid(), public._fn_entrada_via()
      from entrada_arquivos e where e.id = v.id;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular);
end $$;
