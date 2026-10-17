-- FIN-FINANC-28 · PASSO 4b — complemento: a GUARDA DE CLIENTE escrita nas duas publicas do vinculo de pagamento (17/10/2026).
--
-- A 20261027200300 deixou a guarda (`_fn_contrato_do_usuario`, tenant_ok + 42501) so' nas internas `_exec`; as publicas delegavam.
-- O detector `guardaDeClienteNasMigrations` (regra SEG-AGRI-TENANT-01: a SECURITY DEFINER que recebe so' o id guarda pelo cliente da
-- linha) nao aceita delegacao — e com razao: a guarda tem de estar a' vista no corpo exposto. Aqui as duas publicas passam a
-- conferir o cliente pelo CONTRATO da linha ANTES de tudo (id inexistente tambem da' 42501). O resto do corpo e' o mesmo.
-- Corpo integral (funcoes pequenas), guardado pelo md5 de ORIGEM; ACL reconferida. Nenhum dado tocado.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_financiamento_parcela_vincular(uuid,uuid,text,boolean,boolean)'::regprocedure) <> 'e2345fe16d21d5b4adc3a19759caa811'
     or (select md5(prosrc) from pg_proc where oid = 'public.fn_financiamento_parcela_desvincular(uuid,text,boolean)'::regprocedure) <> 'c216937b1f6605bbe5e123689d226904' then
    raise exception 'as publicas do passo 4b nao estao no corpo esperado';
  end if;
end $$;

create or replace function public.fn_financiamento_parcela_vincular(p_parcela_id uuid, p_lancamento_id uuid, p_papel text,
  p_mover boolean default false, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  -- a guarda pelo cliente do CONTRATO da parcela (tenant_ok + 42501; parcela inexistente tambem e' 42501)
  perform public._fn_contrato_do_usuario((select q.financiamento_id from public.financiamento_parcelas q where q.id = p_parcela_id));
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_parcela_vincular_exec(p_parcela_id, p_lancamento_id, p_papel, p_mover);
      raise exception using errcode = 'FPSIM', message = r::text;
    exception
      when sqlstate 'FPSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  return public._fn_financiamento_parcela_vincular_exec(p_parcela_id, p_lancamento_id, p_papel, p_mover) || jsonb_build_object('simulado', false);
end $$;

create or replace function public.fn_financiamento_parcela_desvincular(p_vinculo_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  -- a guarda pelo cliente do CONTRATO do vinculo (tenant_ok + 42501; vinculo inexistente tambem e' 42501)
  perform public._fn_contrato_do_usuario((select v.financiamento_id from public.financiamento_parcela_vinculos v where v.id = p_vinculo_id));
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_parcela_desvincular_exec(p_vinculo_id, coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'simulação'));
      raise exception using errcode = 'FPSIM', message = r::text;
    exception
      when sqlstate 'FPSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  return public._fn_financiamento_parcela_desvincular_exec(p_vinculo_id, p_motivo) || jsonb_build_object('simulado', false);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.fn_financiamento_parcela_vincular(uuid,uuid,text,boolean,boolean)',
    'public.fn_financiamento_parcela_desvincular(uuid,text,boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
    if has_function_privilege('anon', f::regprocedure, 'EXECUTE') then raise exception 'anon executa %', f; end if;
  end loop;
end $$;
