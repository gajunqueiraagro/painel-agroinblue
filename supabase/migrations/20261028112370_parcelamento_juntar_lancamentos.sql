-- P96a (Gabriel 25/10/2026) — JUNTAR LANÇAMENTOS SOLTOS NUM PARCELAMENTO. A compra no cartão lançada à mão em N lançamentos "… k/N"
-- (a "Tinta … 1/6 … 6/6" da NF 46.994) vira UMA compra parcelada, sem mexer no dinheiro: os N lançamentos FICAM (os mesmos ids, valor,
-- vencimento, pagamento, status, conta, conciliação, descrição); ganham só `financiamento_id` e `origem_tipo = 'parcela_principal'`.
-- (1) `financiamentos.juncao_original` (jsonb): de onde a compra veio — os N lançamentos como eram (competência, safra, origem), para o
--     desfazer. Não nulo = a compra é uma JUNÇÃO.
-- (2) `fn_parcelamento_juntar_lancamentos(p_cliente, p_lancamentos, p_competencia, p_simular)`, UMA transação. A ordem das parcelas é a do
--     vencimento. O cadastro: valor_total = a SOMA REAL das N (a diferença para a nota a tela mostra, nunca faz bater). Recusa (pronta, com a
--     frase): menos de 2 ou mais de 72, cancelado, já parcela, Meta, entrada, gerado pelo sistema, de operação comercial, classificação
--     dividida, fornecedor/fazenda/classificação diferentes. Parcela PAGA ENTRA (nada do pagamento muda).
--     OPÇÃO da competência (`p_competencia`, nulo = não muda): as N passam para a data dada, e a safra para a da regra da casa
--     (`_fn_safra_da_competencia`; zero ou mais de uma = a safra fica); mês fechado (de onde sai ou para onde vai) recusa. A prévia devolve o
--     efeito por mês (o DRE: quanto entra e quanto sai de cada mês).
-- (3) `fn_parcelamento_desfazer_juncao(p_financiamento_id, p_simular)`: os N voltam a ser soltos (sem parcelamento; a competência e a safra
--     voltam às de antes, se a junção as mudou e ninguém as mexeu depois); parcelas e cadastro cancelados com "junção desfeita". Nenhum
--     lançamento é cancelado.
-- (4) A volta para à vista e o cancelar a compra RECUSAM a junção (patch guardado por md5): a 1/N não é um à vista, e cancelar a compra
--     cancelaria os N lançamentos de verdade — a volta da junção é o (3).
CREATE OR REPLACE FUNCTION pg_temp._troca_texto(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (length(d) - length(replace(d, p_pares[3*i-2], ''))) / length(p_pares[3*i-2]);
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := replace(d, p_pares[3*i-2], p_pares[3*i-1]);
  END LOOP;
  EXECUTE d;
END $$;

SET LOCAL lock_timeout = '2s';
ALTER TABLE public.financiamentos ADD COLUMN IF NOT EXISTS juncao_original jsonb;
COMMENT ON COLUMN public.financiamentos.juncao_original IS
  'P96a — a compra parcelada nasceu da JUNÇÃO de lançamentos soltos: {juntado_em, competencia_nova, lancamentos:[{lancamento_id, numero, data_competencia, safra_id, origem_tipo}]}; o desfazer os restaura.';

CREATE OR REPLACE FUNCTION public.fn_parcelamento_juntar_lancamentos(p_cliente uuid, p_lancamentos uuid[], p_competencia date DEFAULT NULL,
                                                                     p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_ids     uuid[] := coalesce(p_lancamentos, '{}');
  v_n       int;
  v_ls      public.financeiro_lancamentos_v2[];   -- as N, na ordem do vencimento (a posição no array = o número da parcela)
  v_recusa  jsonb;
  v_um      public.financeiro_lancamentos_v2;
  v_desc    text;
  v_soma    numeric;
  v_comp0   date;
  v_venc1   date;
  v_conta   uuid;
  v_escopo  text;
  v_safra   uuid;
  v_mes     text;
  v_fin     uuid;
  v_parc    uuid;
  v_lista   jsonb;
  v_efeito  jsonb;
  v_orig    jsonb;
  v_ret     jsonb;
  i         int;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  v_n := cardinality(v_ids);

  /* AS RECUSAS, na ordem: a primeira que vale diz a frase (simular devolve; gravar levanta) */
  if v_n < 2 or v_n > 72 or (select count(distinct x) from unnest(v_ids) x) <> v_n then
    v_recusa := jsonb_build_object('motivo', 'quantidade', 'frase', 'Escolha de 2 a 72 lançamentos diferentes para juntar.');
  else
    perform 1 from public.financeiro_lancamentos_v2 l where l.id = any (v_ids) and l.cliente_id = p_cliente for update;
    select array_agg(l order by l.data_vencimento, l.data_competencia, l.id) into v_ls
      from public.financeiro_lancamentos_v2 l where l.id = any (v_ids) and l.cliente_id = p_cliente;
    if coalesce(cardinality(v_ls), 0) <> v_n then
      v_recusa := jsonb_build_object('motivo', 'nao_achado', 'frase', 'Algum dos lançamentos não foi achado neste cliente.');
    else
      v_um := v_ls[1];
    end if;
  end if;
  if v_recusa is null then
    select case
             when u.cancelado then jsonb_build_object('motivo', 'cancelado', 'frase', format('O lançamento «%s» está cancelado.', u.descricao))
             when u.financiamento_id is not null then jsonb_build_object('motivo', 'ja_parcela', 'frase', format('O lançamento «%s» já é parcela de um parcelamento.', u.descricao))
             when u.cenario is distinct from 'realizado' then jsonb_build_object('motivo', 'meta', 'frase', format('O lançamento «%s» é de Meta: não vira parcela.', u.descricao))
             when u.sinal is distinct from '-1' or coalesce(u.tipo_operacao, '') not like '2-%' then jsonb_build_object('motivo', 'entrada', 'frase', format('O lançamento «%s» não é saída: só saída vira parcela de compra.', u.descricao))
             when u.origem_tipo is not null then jsonb_build_object('motivo', 'sistema', 'frase', format('O lançamento «%s» foi gerado pelo sistema (%s): não vira parcela.', u.descricao, u.origem_tipo))
             when exists (select 1 from public.zoo_operacao_partes z where z.financeiro_lancamento_id = u.id and z.cancelada = false) then jsonb_build_object('motivo', 'oc', 'frase', format('O lançamento «%s» é de uma operação comercial: não vira parcela.', u.descricao))
             when u.classificacao_dividida then jsonb_build_object('motivo', 'dividida', 'frase', format('O lançamento «%s» tem a classificação dividida: desfaça a divisão antes de juntar.', u.descricao))
             when u.data_vencimento is null then jsonb_build_object('motivo', 'sem_vencimento', 'frase', format('O lançamento «%s» não tem vencimento.', u.descricao))
           end into v_recusa
      from unnest(v_ls) with ordinality u
     where u.cancelado or u.financiamento_id is not null or u.cenario is distinct from 'realizado' or u.sinal is distinct from '-1'
        or coalesce(u.tipo_operacao, '') not like '2-%' or u.origem_tipo is not null or u.classificacao_dividida or u.data_vencimento is null
        or exists (select 1 from public.zoo_operacao_partes z where z.financeiro_lancamento_id = u.id and z.cancelada = false)
     order by u.ordinality limit 1;
  end if;
  if v_recusa is null then
    v_recusa := case
      when exists (select 1 from unnest(v_ls) u where u.favorecido_id is null) then jsonb_build_object('motivo', 'sem_fornecedor', 'frase', 'Há lançamento sem fornecedor: escolha o fornecedor antes de juntar.')
      when (select count(distinct u.favorecido_id) from unnest(v_ls) u) > 1 then jsonb_build_object('motivo', 'fornecedores', 'frase', 'Os lançamentos são de fornecedores diferentes: só a mesma compra se junta.')
      when (select count(distinct u.fazenda_id) from unnest(v_ls) u) > 1 then jsonb_build_object('motivo', 'fazendas', 'frase', 'Os lançamentos são de fazendas diferentes.')
      when exists (select 1 from unnest(v_ls) u where u.plano_conta_id is null)
        or (select count(distinct u.plano_conta_id) from unnest(v_ls) u) > 1 then jsonb_build_object('motivo', 'classificacoes', 'frase', 'Os lançamentos têm classificações diferentes: acerte a classificação antes de juntar.')
    end;
  end if;
  /* a opção da competência: o mês de onde cada um sai e o mês para onde vão não podem estar fechados */
  if v_recusa is null and p_competencia is not null then
    select m into v_mes from (
      select to_char(p_competencia, 'YYYY-MM') m
      union select to_char(u.data_competencia, 'YYYY-MM') from unnest(v_ls) u where date_trunc('month', u.data_competencia) <> date_trunc('month', p_competencia)
    ) x where public._fn_lr_mes_fechado(p_cliente, v_um.fazenda_id, x.m) order by m limit 1;
    if v_mes is not null then
      v_recusa := jsonb_build_object('motivo', 'mes_fechado', 'frase', format('O mês %s/%s está fechado: reabra antes de mudar a competência.', right(v_mes, 2), left(v_mes, 4)));
    end if;
  end if;
  if v_recusa is not null then
    if not coalesce(p_simular, true) then
      raise exception using errcode = '22023', message = (v_recusa->>'frase') || ' Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', v_recusa);
  end if;

  select sum(u.valor), min(u.data_competencia), min(u.data_vencimento),
         case when count(distinct u.conta_bancaria_id) = 1 and bool_and(u.conta_bancaria_id is not null) then min(u.conta_bancaria_id::text)::uuid end
    into v_soma, v_comp0, v_venc1, v_conta from unnest(v_ls) u;
  v_desc := nullif(btrim(regexp_replace(coalesce(v_um.descricao, ''), '\s*[-–]?\s*\d{1,2}\s*/\s*\d{1,2}\s*$', '')), '');
  select pc.escopo_negocio into v_escopo from public.financeiro_plano_contas pc where pc.id = v_um.plano_conta_id;
  v_safra := case when p_competencia is not null then public._fn_safra_da_competencia(p_cliente, v_escopo, p_competencia) end;

  /* a prévia: as N (antes -> depois) e o efeito por mês na competência (o DRE) */
  select jsonb_agg(jsonb_build_object('numero', u.ordinality, 'lancamento_id', u.id, 'descricao', u.descricao, 'vencimento', u.data_vencimento,
           'valor', u.valor, 'status', u.status_transacao,
           'competencia_antes', u.data_competencia, 'competencia_depois', coalesce(p_competencia, u.data_competencia),
           'safra_antes', u.safra_id, 'safra_depois', case when p_competencia is not null then coalesce(v_safra, u.safra_id) else u.safra_id end,
           'safra_antes_codigo', (select s.codigo from public.financeiro_safras s where s.id = u.safra_id),
           'safra_depois_codigo', (select s.codigo from public.financeiro_safras s where s.id = case when p_competencia is not null then coalesce(v_safra, u.safra_id) else u.safra_id end))
         order by u.ordinality)
    into v_lista from unnest(v_ls) with ordinality u;
  select coalesce(jsonb_agg(jsonb_build_object('mes', e.mes, 'valor', e.valor, 'parcelas', e.parcelas) order by e.mes), '[]'::jsonb) into v_efeito
    from (select x.mes, sum(x.valor) valor, sum(x.parcelas)::int parcelas
            from (select to_char(u.data_competencia, 'YYYY-MM') mes, -u.valor valor, -1 parcelas from unnest(v_ls) u
                   where p_competencia is not null and date_trunc('month', u.data_competencia) <> date_trunc('month', p_competencia)
                  union all
                  select to_char(p_competencia, 'YYYY-MM'), u.valor, 1 from unnest(v_ls) u
                   where p_competencia is not null and date_trunc('month', u.data_competencia) <> date_trunc('month', p_competencia)) x
           group by x.mes) e;
  select jsonb_agg(jsonb_build_object('lancamento_id', u.id, 'numero', u.ordinality, 'data_competencia', u.data_competencia,
           'safra_id', u.safra_id, 'origem_tipo', u.origem_tipo) order by u.ordinality)
    into v_orig from unnest(v_ls) with ordinality u;

  begin
    insert into public.financiamentos
      (cliente_id, fazenda_id, natureza, status, descricao, tipo_financiamento,
       valor_total, total_parcelas, taxa_juros, taxa_juros_mensal, valor_entrada,
       gerar_lancamento_captacao, plano_conta_captacao_id, lancamento_captacao_id,
       plano_conta_parcela_id, credor_id, conta_bancaria_id,
       data_inicio, data_contrato, data_primeira_parcela, numero_contrato, observacao, created_by, juncao_original)
    values
      (p_cliente, v_um.fazenda_id, 'parcelamento', 'ativo', coalesce(v_desc, 'Compra parcelada'), v_escopo,
       v_soma, v_n, 0, 0, 0,
       false, null, null,
       v_um.plano_conta_id, v_um.favorecido_id, v_conta,
       coalesce(p_competencia, v_comp0), coalesce(p_competencia, v_comp0), v_venc1, null,
       format('juntada de %s lançamentos soltos', v_n), auth.uid(),
       jsonb_build_object('juntado_em', now(), 'competencia_nova', p_competencia, 'lancamentos', v_orig))
    returning id into v_fin;

    for i in 1..v_n loop
      insert into public.financiamento_parcelas
        (financiamento_id, cliente_id, numero_parcela, data_vencimento, data_pagamento, valor_principal, valor_juros, valor_total, status, lancamento_id)
      values (v_fin, p_cliente, i, (v_ls[i]).data_vencimento, null, round(abs((v_ls[i]).valor), 2), 0, round(abs((v_ls[i]).valor), 2), 'pendente', (v_ls[i]).id)
      returning id into v_parc;
      /* OS N FICAM: só o elo com a compra (e, com a opção, a competência e a safra) */
      update public.financeiro_lancamentos_v2
         set financiamento_id = v_fin, origem_tipo = 'parcela_principal',
             data_competencia = coalesce(p_competencia, data_competencia),
             safra_id = case when p_competencia is not null then coalesce(v_safra, safra_id) else safra_id end
       where id = (v_ls[i]).id;
      perform public._fn_parcela_status_alinhar(v_parc, null);
    end loop;
    perform public._fn_financiamento_status_pelas_parcelas(v_fin);

    v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'financiamento_id', v_fin, 'parcelas', v_n,
      'soma', v_soma, 'descricao', coalesce(v_desc, 'Compra parcelada'), 'competencia', p_competencia,
      'safra_nova', v_safra, 'safra_nova_codigo', (select s.codigo from public.financeiro_safras s where s.id = v_safra),
      'lista', v_lista, 'efeito_por_mes', v_efeito);
    if coalesce(p_simular, true) then raise exception using errcode = 'PJSIM', message = v_ret::text; end if;
  exception when sqlstate 'PJSIM' then
    v_ret := sqlerrm::jsonb || jsonb_build_object('financiamento_id', null);
  end;
  return v_ret;
end
$function$;
REVOKE ALL ON FUNCTION public.fn_parcelamento_juntar_lancamentos(uuid, uuid[], date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_juntar_lancamentos(uuid, uuid[], date, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_parcelamento_desfazer_juncao(p_financiamento_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f        public.financiamentos%rowtype;
  v_nova   date;
  v_recusa jsonb;
  v_volta  int := 0;
  v_mantem int := 0;
  v_ret    jsonb;
  r        record;
  c_motivo constant text := 'junção desfeita';
begin
  select * into f from public.financiamentos where id = p_financiamento_id for update;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if f.natureza is distinct from 'parcelamento' or f.juncao_original is null then
    v_recusa := jsonb_build_object('motivo', 'nao_juncao', 'frase', 'Esta compra parcelada não veio de uma junção de lançamentos.');
  elsif coalesce(f.status, '') = 'cancelado' then
    v_recusa := jsonb_build_object('motivo', 'cancelada', 'frase', 'Esta compra parcelada já está cancelada.');
  else
    /* a compra mudou depois da junção (parcela nova, lançamento trocado): o desfazer não adivinha */
    select jsonb_build_object('motivo', 'mudou', 'frase', format('A parcela %s não é um dos lançamentos juntados: a compra mudou depois da junção.', q.numero_parcela))
      into v_recusa
      from public.financiamento_parcelas q
     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
       and not exists (select 1 from jsonb_array_elements(f.juncao_original->'lancamentos') o where (o->>'lancamento_id')::uuid = q.lancamento_id)
     order by q.numero_parcela limit 1;
  end if;
  if v_recusa is not null then
    if not coalesce(p_simular, true) then
      raise exception using errcode = '22023', message = (v_recusa->>'frase') || ' Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'financiamento_id', f.id, 'recusa', v_recusa);
  end if;

  v_nova := (f.juncao_original->>'competencia_nova')::date;
  begin
    for r in select (o->>'lancamento_id')::uuid id, (o->>'data_competencia')::date comp, nullif(o->>'safra_id', '')::uuid safra,
                    nullif(o->>'origem_tipo', '') origem
               from jsonb_array_elements(f.juncao_original->'lancamentos') o
    loop
      /* a competência e a safra voltam só se a junção as mudou e ninguém as mexeu depois */
      update public.financeiro_lancamentos_v2 l
         set financiamento_id = null, origem_tipo = r.origem,
             data_competencia = case when v_nova is not null and l.data_competencia = v_nova then r.comp else l.data_competencia end,
             safra_id = case when v_nova is not null and l.data_competencia = v_nova then r.safra else l.safra_id end
       where l.id = r.id and l.financiamento_id = f.id;
      if found then
        if v_nova is not null and (select data_competencia from public.financeiro_lancamentos_v2 where id = r.id) = r.comp then v_volta := v_volta + 1;
        elsif v_nova is not null then v_mantem := v_mantem + 1; end if;
      end if;
    end loop;
    update public.financiamento_parcelas set status = 'cancelado', updated_at = now()
     where financiamento_id = f.id and coalesce(status, '') <> 'cancelado';
    update public.financiamentos
       set status = 'cancelado', updated_at = now(),
           observacao = concat_ws(E'\n', nullif(btrim(coalesce(observacao, '')), ''), format('[cancelada em %s: %s]', to_char(now(), 'YYYY-MM-DD'), c_motivo))
     where id = f.id;
    v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'financiamento_id', f.id,
      'lancamentos', jsonb_array_length(f.juncao_original->'lancamentos'), 'competencia_volta', v_volta, 'competencia_mantida', v_mantem);
    if coalesce(p_simular, true) then raise exception using errcode = 'PDSIM', message = v_ret::text; end if;
  exception when sqlstate 'PDSIM' then
    v_ret := sqlerrm::jsonb;
  end;
  return v_ret;
end
$function$;
REVOKE ALL ON FUNCTION public.fn_parcelamento_desfazer_juncao(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_desfazer_juncao(uuid, boolean) TO authenticated;

/* (4) a volta para à vista e o cancelar a compra recusam a junção */
SELECT pg_temp._troca_texto('public.fn_parcelamento_voltar_a_vista(uuid,boolean)', 'b07c91f277020eab9d8aa0b3b0ae0982', ARRAY[
  $p$  select count(*) into v_n from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado';
$p$,
  $r$  /* P96a — a compra que nasceu da JUNÇÃO de lançamentos soltos não tem à vista: a volta dela é o "Desfazer a junção" */
  if f.juncao_original is not null then
    if not p_simular then
      raise exception using errcode = '22023', message = 'Esta compra foi juntada de lançamentos soltos: use "Desfazer a junção". Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'financiamento_id', f.id, 'antes', '[]'::jsonb,
      'recusa', jsonb_build_object('motivo', 'juncao', 'frase', 'Esta compra foi juntada de lançamentos soltos: use "Desfazer a junção".'));
  end if;
  select count(*) into v_n from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado';
$r$, '1']);

SELECT pg_temp._troca_texto('public.fn_parcelamento_excluir(uuid,text,boolean)', 'c29b90a1c2540faa1d766e534cb7726b', ARRAY[
  $p$  if not coalesce(p_simular, false) and v_motivo = '' then
$p$,
  $r$  /* P96a — cancelar a compra juntada cancelaria os N lançamentos de verdade: a volta dela é o "Desfazer a junção" */
  if f.juncao_original is not null then
    if not coalesce(p_simular, false) then
      raise exception using errcode = '22023', message = 'Esta compra foi juntada de lançamentos soltos: use "Desfazer a junção" (os lançamentos ficam). Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'financiamento_id', f.id, 'simulado', true,
      'contrato', jsonb_build_object('id', f.id, 'descricao', f.descricao), 'lancamentos', 0, 'parcelas', 0,
      'recusa', jsonb_build_object('motivo', 'juncao', 'frase', 'Esta compra foi juntada de lançamentos soltos: use "Desfazer a junção" (os lançamentos ficam).'));
  end if;
  if not coalesce(p_simular, false) and v_motivo = '' then
$r$, '1']);
