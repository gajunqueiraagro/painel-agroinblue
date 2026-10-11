-- FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 1, parte B2 (Gabriel, 11/10/2026): VINCULAR E DESVINCULAR.
-- Depois da 20261027196100 (tabela) e da 20261027196200 (donos e leituras). Os UNICOS escritores de financiamento_encargos.
-- ⚠ NAO ESCREVEM NO LANCAMENTO: classificacao, valor, status e conciliacao ficam como estao; desvincular e' a volta exata.
-- SIMULACAO = GRAVACAO: p_simular executa o mesmo caminho e desfaz (SQLSTATE 'ENSIM'). Recusa: na simulacao volta em
-- recusa {motivo, frase}; na gravacao e' P0001 com a frase + " Nada foi gravado.". Lote: TUDO ou NADA.
-- Guarda de tenant na forma do SEG-TENANT-VARREDURA-01A: o cliente de TODA linha recebida; inexistente, misturado ou sem
-- tenant_ok = 42501 "sem acesso a este registro", antes de qualquer leitura de negocio.
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public.fn_contrato_encargo_vincular(p_financiamento_id uuid, p_itens jsonb, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f        public.financiamentos%rowtype;
  g_cli    uuid[];
  v_itens  jsonb := case when jsonb_typeof(p_itens) = 'array' then p_itens else '[]'::jsonb end;
  v_recusa jsonb;
  v_feitos jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_uid    uuid := auth.uid();
  v_sim    boolean := coalesce(p_simular, false);
  r        record;
  v_id     uuid;
begin
  select array_agg(q.c) into g_cli from (
    select (select x.cliente_id from public.financiamentos x where x.id = p_financiamento_id) as c
    union all
    select (select x.cliente_id from public.financeiro_lancamentos_v2 x where x.id = nullif(i->>'lancamento_id', '')::uuid)
      from jsonb_array_elements(v_itens) i) q;
  if g_cli is null or array_position(g_cli, null) is not null
     or (select count(distinct x) from unnest(g_cli) as x) <> 1
     or not coalesce(public.tenant_ok(g_cli[1]), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select * into f from public.financiamentos where id = p_financiamento_id;

  if jsonb_array_length(v_itens) = 0 then
    v_recusa := jsonb_build_object('motivo', 'lista_vazia', 'frase', 'Escolha ao menos um lançamento.');
  elsif not public._fn_financiamento_vivo(f.status) then
    v_recusa := jsonb_build_object('motivo', 'contrato_cancelado', 'frase', 'Este contrato está cancelado e não recebe encargo.');
  elsif exists (select 1 from jsonb_array_elements(v_itens) i
                 where coalesce(i->>'papel', '') not in ('juros', 'iof', 'tarifa', 'seguro', 'multa', 'outro')) then
    v_recusa := jsonb_build_object('motivo', 'papel_invalido', 'frase', 'Informe o tipo de cada encargo: juros, IOF, tarifa, seguro, multa ou outro.');
  elsif (select count(*) <> count(distinct i->>'lancamento_id') from jsonb_array_elements(v_itens) i) then
    v_recusa := jsonb_build_object('motivo', 'lancamento_repetido', 'frase', 'O mesmo lançamento aparece duas vezes na lista.');
  else
    select jsonb_build_object('motivo', e.motivo, 'lancamento_id', i->>'lancamento_id',
             'frase', format('%s (lançamento %s)', e.frase, i->>'lancamento_id'))
      into v_recusa
      from jsonb_array_elements(v_itens) with ordinality t(i, ord)
     cross join lateral public._fn_lancamento_elegivel_a_encargo((i->>'lancamento_id')::uuid) e
     where not e.ok order by t.ord limit 1;
  end if;

  if v_recusa is null then
    begin
      for r in select (i->>'lancamento_id')::uuid as lancamento_id, i->>'papel' as papel
                 from jsonb_array_elements(v_itens) with ordinality t(i, ord) order by t.ord
      loop
        insert into public.financiamento_encargos (cliente_id, financiamento_id, lancamento_id, papel, vinculado_por)
        values (f.cliente_id, f.id, r.lancamento_id, r.papel, v_uid) returning id into v_id;
        v_feitos := v_feitos || jsonb_build_object('lancamento_id', r.lancamento_id, 'papel', r.papel,
                                                   'encargo_id', case when v_sim then null else v_id end);
      end loop;
      if v_sim then raise exception using errcode = 'ENSIM', message = 'simulação'; end if;
    exception
      when sqlstate 'ENSIM' then null;
      when unique_violation then
        v_feitos := '[]'::jsonb;
        v_recusa := jsonb_build_object('motivo', 'ja_e_encargo', 'frase', 'Um dos lançamentos acabou de ser vinculado a um contrato por outra pessoa.');
    end;
  end if;

  if v_recusa is not null then
    if not v_sim then
      raise exception using errcode = 'P0001', message = (v_recusa->>'frase') || ' Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'financiamento_id', f.id, 'vinculados', 0,
                              'itens', '[]'::jsonb, 'avisos', '[]'::jsonb, 'recusa', v_recusa);
  end if;

  -- avisos: explicam, nao recusam
  select coalesce(jsonb_agg(a.aviso order by a.ord, a.k), '[]'::jsonb) into v_avisos
    from (
      select t.ord, 1 as k, jsonb_build_object('codigo', 'mes_fechado', 'lancamento_id', l.id, 'ano_mes', to_char(l.data_competencia, 'YYYY-MM')) as aviso
        from jsonb_array_elements(v_itens) with ordinality t(i, ord)
        join public.financeiro_lancamentos_v2 l on l.id = (t.i->>'lancamento_id')::uuid
       where exists (select 1 from public.financeiro_fechamentos ff
                      where ff.cliente_id = l.cliente_id and ff.status_fechamento = 'fechado'
                        and ff.ano_mes = to_char(l.data_competencia, 'YYYY-MM'))
      union all
      select t.ord, 2, jsonb_build_object('codigo', 'favorecido_diferente_do_credor', 'lancamento_id', l.id)
        from jsonb_array_elements(v_itens) with ordinality t(i, ord)
        join public.financeiro_lancamentos_v2 l on l.id = (t.i->>'lancamento_id')::uuid
       where l.favorecido_id is distinct from f.credor_id
      union all
      select t.ord, 3, jsonb_build_object('codigo', 'lancamento_nao_realizado', 'lancamento_id', l.id, 'status', l.status_transacao)
        from jsonb_array_elements(v_itens) with ordinality t(i, ord)
        join public.financeiro_lancamentos_v2 l on l.id = (t.i->>'lancamento_id')::uuid
       where coalesce(l.status_transacao, '') not in ('realizado', 'conciliado')
    ) a;

  return jsonb_build_object('ok', true, 'simulado', v_sim, 'financiamento_id', f.id,
                            'vinculados', jsonb_array_length(v_feitos), 'itens', v_feitos, 'avisos', v_avisos, 'recusa', null);
end
$function$;

CREATE FUNCTION public.fn_contrato_encargo_desvincular(p_encargo_id uuid, p_motivo text, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e        public.financiamento_encargos%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_sim    boolean := coalesce(p_simular, false);
  v_recusa jsonb;
  v_em     timestamptz;
begin
  select * into e from public.financiamento_encargos where id = p_encargo_id;
  if not found or not coalesce(public.tenant_ok(e.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if e.desfeito_em is not null then
    v_recusa := jsonb_build_object('motivo', 'ja_desfeito', 'frase', 'Este encargo já foi desvinculado.');
  elsif v_motivo = '' and not v_sim then
    v_recusa := jsonb_build_object('motivo', 'motivo_vazio', 'frase', 'Informe o motivo para desvincular.');
  end if;
  if v_recusa is not null then
    if not v_sim then
      raise exception using errcode = 'P0001', message = (v_recusa->>'frase') || ' Nada foi gravado.';
    end if;
  else
    begin
      update public.financiamento_encargos
         set desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = coalesce(nullif(v_motivo, ''), 'simulação')
       where id = e.id and desfeito_em is null
       returning desfeito_em into v_em;
      if v_sim then raise exception using errcode = 'ENSIM', message = 'simulação'; end if;
    exception when sqlstate 'ENSIM' then null;
    end;
  end if;
  return jsonb_build_object('ok', v_recusa is null, 'simulado', v_sim, 'encargo_id', e.id, 'lancamento_id', e.lancamento_id,
                            'financiamento_id', e.financiamento_id, 'papel', e.papel, 'desfeito_em', v_em, 'recusa', v_recusa);
end
$function$;

REVOKE ALL ON FUNCTION public.fn_contrato_encargo_vincular(uuid, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_contrato_encargo_desvincular(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contrato_encargo_vincular(uuid, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_contrato_encargo_desvincular(uuid, text, boolean) TO authenticated, service_role;
