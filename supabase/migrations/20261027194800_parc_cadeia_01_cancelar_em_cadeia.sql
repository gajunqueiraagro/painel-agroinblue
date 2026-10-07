-- PARC-CADEIA-01 (passo 1) — A PARCELA E O LANCAMENTO DELA MUDAM JUNTOS, DE QUALQUER TELA (Gabriel, 07/10/2026).
--
-- Nasce do contrato "Parcela 3 - None" do NJ: a parcela foi cancelada pela lista do Financeiro e o contrato seguiu contando
-- 4 parcelas e o total cheio, com as parcelas sem lancamento. Parcela de PARCELAMENTO e o lancamento dela passam a ter UM
-- escritor por gesto, aqui, numa transacao. Financiamento com juros, emprestimo, OC e lancamento comum: FORA.
--
-- 1a  fn_parcelamento_cancelar_parcela(p_lancamento_id, p_escopo 'so_esta'|'todas', p_motivo, p_simular, p_parcela_id)
--     'so_esta' = a retirada da grade: NAO repete a regra, chama fn_parcelamento_editar_parcelas com a lista das vivas sem
--     esta (parcela 'cancelado', lancamento cancelado pelo dono com o motivo do operador, contrato recalculado, i/N renumerado).
--     Recusa a PAGA e a ULTIMA viva. 'todas' = o 1b. SIMULACAO = GRAVACAO: a simulacao EXECUTA e desfaz (SQLSTATE 'PCSIM').
-- 1b  fn_parcelamento_excluir(p_financiamento_id, p_motivo, p_simular): cancela pelo dono os lancamentos vivos das parcelas,
--     marca parcelas e contrato 'cancelado' (nada e' apagado: fica a trilha). Recusa, dizendo QUAIS, com parcela paga.
-- 1c  TRAVA NO DONO: gatilho BEFORE UPDATE OF cancelado em financeiro_lancamentos_v2 — o lancamento de parcela VIVA de contrato
--     de PARCELAMENTO vivo so' se cancela com app.parcelamento_escritor = 'on', ligado SO' pelas RPCs do parcelamento.
-- 1d  fn_parcelamento_recriar_lancamento(p_parcela_id, p_simular): parcela viva sem lancamento vivo ganha lancamento novo pela
--     MESMA rotina da parcela acrescentada (_fn_parcelamento_lancamento_novo, o INSERT movido verbatim do 2B); o cancelado nao
--     e' reativado. Molde: a vizinha viva de maior numero; na falta dela, o proprio lancamento cancelado da parcela.
-- PATCH GUARDADO POR md5: fn_parcelamento_editar_parcelas 1fbb077a5d14d3203f9fa6fe21e721ad -> bf9a87135e140c10abb065dd46ccb836 (3 ancoras: liga a
-- chave do escritor e aceita o motivo do operador na retirada; a acrescentada passa a nascer pela rotina interna).
-- Funcoes novas nascem FECHADAS; GRANT a authenticated so' nas tres publicas.

CREATE INDEX IF NOT EXISTS idx_fin_parcelas_lancamento_id ON public.financiamento_parcelas (lancamento_id) WHERE lancamento_id IS NOT NULL;

-- ── a rotina unica do lancamento novo de uma parcela (o INSERT e a nota da compra, movidos verbatim do 2B) ──────────────
CREATE FUNCTION public._fn_parcelamento_lancamento_novo(p_financiamento_id uuid, p_molde_id uuid, p_numero integer, p_total integer, p_vencimento date, p_valor numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f          public.financiamentos%rowtype;
  t          public.financeiro_lancamentos_v2%rowtype;
  v_lanc_id  uuid;
begin
  select * into f from public.financiamentos where id = p_financiamento_id;
  select * into t from public.financeiro_lancamentos_v2 where id = p_molde_id;
  if f.id is null or t.id is null then
    raise exception using errcode = '22023', message = 'O contrato não tem parcela com lançamento para servir de molde. Nada foi gravado.';
  end if;
  insert into public.financeiro_lancamentos_v2
    (cliente_id, fazenda_id, sinal, tipo_operacao, valor,
     descricao, data_competencia, data_vencimento, data_pagamento,
     status_transacao, cenario, cancelado, orfao_definitivo,
     origem_tipo, financiamento_id,
     plano_conta_id, safra_id, cultura, fase,
     favorecido_id, forma_pagamento, conta_bancaria_id, created_by)
  values
    (f.cliente_id, t.fazenda_id, t.sinal, t.tipo_operacao, p_valor,
     public._fn_parcela_descricao(f.descricao, p_numero, p_total), t.data_competencia, p_vencimento, null,
     'programado', 'realizado', false, false,
     'parcela_principal', f.id,
     t.plano_conta_id, t.safra_id, t.cultura, t.fase,
     t.favorecido_id, t.forma_pagamento, t.conta_bancaria_id, auth.uid())
  returning id into v_lanc_id;
  -- A NOTA FISCAL DA COMPRA: o documento NF vivo de um lancamento do contrato que ja' esta' ligado a outra parcela dele
  insert into public.financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id)
  select d.id, d.lancamento_id, v_lanc_id, f.cliente_id
    from public.financeiro_lancamento_documentos d
   where d.especie = 'nf' and not coalesce(d.cancelado, false)
     and d.lancamento_id in (select lv.id from public.financeiro_lancamentos_v2 lv where lv.financiamento_id = f.id)
     and exists (select 1 from public.financeiro_documento_vinculos v
                  join public.financeiro_lancamentos_v2 lv on lv.id = v.lancamento_id
                 where v.documento_id = d.id and lv.financiamento_id = f.id)
  on conflict do nothing;
  return v_lanc_id;
end
$function$;

-- ── patch de fn_parcelamento_editar_parcelas ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE
  v_oid oid := 'public.fn_parcelamento_editar_parcelas(uuid, jsonb, numeric)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '1fbb077a5d14d3203f9fa6fe21e721ad' THEN
    RAISE EXCEPTION 'PARC-CADEIA-01 editar: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  -- ancora 1
  v_a := v_a || $a1$      perform public.fn_cancelar_lancamento_auditoria(p.lancamento_id, format('Parcela %s retirada do parcelamento "%s"', p.numero_parcela, f.descricao));
$a1$::text;
  v_b := v_b || $b1$      -- PARC-CADEIA-01: a retirada e' um dos escritores do parcelamento (a trava do cancelamento so' abre para eles), e o motivo
      -- do operador, quando o gesto vem de fn_parcelamento_cancelar_parcela, vai no lugar do texto gerado.
      perform set_config('app.parcelamento_escritor', 'on', true);
      perform public.fn_cancelar_lancamento_auditoria(p.lancamento_id,
        coalesce(nullif(btrim(current_setting('app.parcelamento_motivo', true)), ''),
                 format('Parcela %s retirada do parcelamento "%s"', p.numero_parcela, f.descricao)));
      perform set_config('app.parcelamento_escritor', 'off', true);
$b1$::text;
  -- ancora 2
  v_a := v_a || $a2$      insert into public.financeiro_lancamentos_v2
        (cliente_id, fazenda_id, sinal, tipo_operacao, valor,
         descricao, data_competencia, data_vencimento, data_pagamento,
         status_transacao, cenario, cancelado, orfao_definitivo,
         origem_tipo, financiamento_id,
         plano_conta_id, safra_id, cultura, fase,
         favorecido_id, forma_pagamento, conta_bancaria_id, created_by)
      values
        (f.cliente_id, t.fazenda_id, t.sinal, t.tipo_operacao, v_val,
         public._fn_parcela_descricao(f.descricao, v_i, v_n), t.data_competencia, v_venc, null,
         'programado', 'realizado', false, false,
         'parcela_principal', f.id,
         t.plano_conta_id, t.safra_id, t.cultura, t.fase,
         t.favorecido_id, t.forma_pagamento, t.conta_bancaria_id, auth.uid())
      returning id into v_lanc_id;
$a2$::text;
  v_b := v_b || $b2$      -- PARC-CADEIA-01: o lancamento da parcela nasce por UMA rotina (a mesma do "Recriar lancamento"), com a nota da compra
      v_lanc_id := public._fn_parcelamento_lancamento_novo(f.id, t.id, v_i, v_n, v_venc, v_val);
$b2$::text;
  -- ancora 3
  v_a := v_a || $a3$      -- A NOTA FISCAL DA COMPRA: o documento NF vivo de um lancamento do contrato que ja' esta' ligado a outra parcela dele
      insert into public.financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id)
      select d.id, d.lancamento_id, v_lanc_id, f.cliente_id
        from public.financeiro_lancamento_documentos d
       where d.especie = 'nf' and not coalesce(d.cancelado, false)
         and d.lancamento_id in (select lv.id from public.financeiro_lancamentos_v2 lv where lv.financiamento_id = f.id)
         and exists (select 1 from public.financeiro_documento_vinculos v
                      join public.financeiro_lancamentos_v2 lv on lv.id = v.lancamento_id
                     where v.documento_id = d.id and lv.financiamento_id = f.id)
      on conflict do nothing;
$a3$::text;
  v_b := v_b || $b3$$b3$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'PARC-CADEIA-01 editar: a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) <> 'bf9a87135e140c10abb065dd46ccb836' THEN
    RAISE EXCEPTION 'PARC-CADEIA-01 editar: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_parcelamento_editar_parcelas(p_financiamento_id uuid, p_parcelas jsonb, p_valor_total numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> 'bf9a87135e140c10abb065dd46ccb836' THEN
    RAISE EXCEPTION 'PARC-CADEIA-01 editar: ACL, SECURITY DEFINER, configuracao ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;

-- ── a frase do erro do dono do cancelamento, em portugues ───────────────────────────────────────────────────────────
CREATE FUNCTION public._fn_parcelamento_frase_do_erro(p_erro text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_erro ~* 'em mes fechado' then 'Há parcela com competência em mês fechado: reabra o mês antes. Nada foi gravado.'
    else p_erro end
$function$;

-- ── 1b: excluir a compra inteira ────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_parcelamento_excluir(p_financiamento_id uuid, p_motivo text, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f         public.financiamentos%rowtype;
  p         public.financiamento_parcelas%rowtype;
  v_pagas   int[];
  v_parc    int := 0;
  v_lanc    int := 0;
  v_recusa  jsonb;
  v_motivo  text := btrim(coalesce(p_motivo, ''));
begin
  select * into f from public.financiamentos where id = p_financiamento_id for update;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if f.natureza is distinct from 'parcelamento' then
    raise exception using errcode = '22023', message = 'Só a compra parcelada se cancela por aqui. Nada foi gravado.';
  end if;
  if coalesce(f.status, '') = 'cancelado' then
    raise exception using errcode = '22023', message = 'Esta compra parcelada já está cancelada.';
  end if;
  if not coalesce(p_simular, false) and v_motivo = '' then
    raise exception using errcode = '22023', message = 'Informe o motivo do cancelamento.';
  end if;

  select array_agg(q.numero_parcela order by q.numero_parcela) into v_pagas
    from public.financiamento_parcelas q
   where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
     and public._fn_parcela_de_parcelamento_paga(q.status, q.lancamento_id);
  select count(*),
         count(*) filter (where exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = q.lancamento_id and not coalesce(l.cancelado, false)))
    into v_parc, v_lanc
    from public.financiamento_parcelas q
   where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado';

  if coalesce(cardinality(v_pagas), 0) > 0 then
    v_recusa := jsonb_build_object('motivo', 'ha_paga', 'parcelas', to_jsonb(v_pagas),
      'frase', case when cardinality(v_pagas) = 1
                    then format('A parcela %s já está paga: desfaça o pagamento antes de cancelar a compra.', v_pagas[1])
                    else format('As parcelas %s já estão pagas: desfaça o pagamento delas antes de cancelar a compra.',
                                array_to_string(v_pagas[1:cardinality(v_pagas) - 1], ', ') || ' e ' || v_pagas[cardinality(v_pagas)]) end);
    if not coalesce(p_simular, false) then
      raise exception using errcode = '22023', message = (v_recusa->>'frase') || ' Nada foi gravado.';
    end if;
  else
    -- SIMULACAO = GRAVACAO: a simulacao percorre o MESMO caminho e desfaz
    begin
      perform set_config('app.parcelamento_escritor', 'on', true);
      for p in select * from public.financiamento_parcelas q
                where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' order by q.numero_parcela
      loop
        if p.lancamento_id is not null then
          perform public.fn_cancelar_lancamento_auditoria(p.lancamento_id, coalesce(nullif(v_motivo, ''), 'simulação'));
        end if;
        update public.financiamento_parcelas set status = 'cancelado', updated_at = now() where id = p.id;
      end loop;
      perform set_config('app.parcelamento_escritor', 'off', true);
      update public.financiamentos
         set status = 'cancelado', updated_at = now(),
             observacao = concat_ws(E'\n', nullif(btrim(coalesce(observacao, '')), ''),
                                    format('[cancelada em %s: %s]', to_char(now(), 'YYYY-MM-DD'), v_motivo))
       where id = f.id;
      if coalesce(p_simular, false) then
        raise exception using errcode = 'PCSIM', message = 'simulação';
      end if;
    exception
      when sqlstate 'PCSIM' then null;
      when others then
        if not coalesce(p_simular, false) then
          raise exception using errcode = sqlstate, message = public._fn_parcelamento_frase_do_erro(sqlerrm);
        end if;
        v_recusa := jsonb_build_object('motivo', 'banco', 'frase', public._fn_parcelamento_frase_do_erro(sqlerrm));
    end;
  end if;

  return jsonb_build_object('ok', v_recusa is null, 'financiamento_id', f.id, 'simulado', coalesce(p_simular, false),
    'contrato', jsonb_build_object('id', f.id, 'descricao', f.descricao),
    'lancamentos', v_lanc, 'parcelas', v_parc, 'recusa', v_recusa);
end
$function$;
REVOKE ALL ON FUNCTION public.fn_parcelamento_excluir(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_excluir(uuid, text, boolean) TO authenticated, service_role;

-- ── 1a: cancelar a parcela pelo lancamento dela (ou pelo id da parcela) ──────────────────────────────────────────────
CREATE FUNCTION public.fn_parcelamento_cancelar_parcela(p_lancamento_id uuid, p_escopo text, p_motivo text, p_simular boolean DEFAULT false, p_parcela_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f         public.financiamentos%rowtype;
  p         public.financiamento_parcelas%rowtype;
  v_n       int;
  v_paga    boolean;
  v_lista   jsonb;
  v_soma    numeric;
  v_recusa  jsonb;
  v_todas   jsonb;
  v_depois  jsonb;
  v_motivo  text := btrim(coalesce(p_motivo, ''));
begin
  if p_parcela_id is not null then
    select * into p from public.financiamento_parcelas q where q.id = p_parcela_id;
  else
    select q.* into p from public.financiamento_parcelas q
      join public.financiamentos g on g.id = q.financiamento_id
     where q.lancamento_id = p_lancamento_id and g.natureza = 'parcelamento'
     order by (coalesce(q.status, '') <> 'cancelado') desc limit 1;
  end if;
  if p.id is not null then
    select * into f from public.financiamentos where id = p.financiamento_id for update;
  end if;
  if p.id is null or f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if f.natureza is distinct from 'parcelamento' then
    raise exception using errcode = '22023', message = 'Este lançamento não é parcela de compra parcelada. Nada foi gravado.';
  end if;
  if coalesce(p.status, '') = 'cancelado' then
    raise exception using errcode = '22023', message = 'Esta parcela já foi retirada da compra.';
  end if;
  if coalesce(f.status, '') = 'cancelado' then
    raise exception using errcode = '22023', message = 'Esta compra parcelada já está cancelada.';
  end if;
  if p_escopo is null or p_escopo not in ('so_esta', 'todas') then
    raise exception using errcode = '22023', message = 'Escopo inválido: use so_esta ou todas.';
  end if;
  if not coalesce(p_simular, false) and v_motivo = '' then
    raise exception using errcode = '22023', message = 'Informe o motivo do cancelamento.';
  end if;

  v_n := (select count(*) from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado');
  v_paga := public._fn_parcela_de_parcelamento_paga(p.status, p.lancamento_id);

  if p_escopo = 'todas' then
    v_todas := public.fn_parcelamento_excluir(f.id, p_motivo, p_simular);
    v_recusa := v_todas->'recusa';
    if jsonb_typeof(v_recusa) = 'null' then v_recusa := null; end if;
    v_depois := jsonb_build_object('parcelas', 0, 'valor_total', 0);
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'data_vencimento', q.data_vencimento,
                                                 'valor', coalesce(q.valor_total, q.valor_principal)) order by q.numero_parcela), '[]'::jsonb),
           coalesce(sum(coalesce(q.valor_total, q.valor_principal)), 0)
      into v_lista, v_soma
      from public.financiamento_parcelas q
     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' and q.id <> p.id;
    v_depois := jsonb_build_object('parcelas', v_n - 1, 'valor_total', round(v_soma, 2));
    if v_paga then
      v_recusa := jsonb_build_object('motivo', 'paga',
        'frase', format('A parcela %s já está paga: desfaça o pagamento antes.', p.numero_parcela));
    elsif v_n <= 1 then
      v_recusa := jsonb_build_object('motivo', 'ultima_viva',
        'frase', 'Esta é a última parcela da compra: cancele a compra inteira.');
    end if;
    if v_recusa is not null then
      if not coalesce(p_simular, false) then
        raise exception using errcode = '22023', message = (v_recusa->>'frase') || ' Nada foi gravado.';
      end if;
    else
      -- a retirada e' a da grade (2B): a mesma funcao, com a lista das vivas sem esta. SIMULACAO = GRAVACAO (executa e desfaz).
      begin
        perform set_config('app.parcelamento_motivo', v_motivo, true);
        perform public.fn_parcelamento_editar_parcelas(f.id, v_lista, round(v_soma, 2));
        perform set_config('app.parcelamento_motivo', '', true);
        if coalesce(p_simular, false) then
          raise exception using errcode = 'PCSIM', message = 'simulação';
        end if;
      exception
        when sqlstate 'PCSIM' then null;
        when others then
          if not coalesce(p_simular, false) then
            raise exception using errcode = sqlstate, message = public._fn_parcelamento_frase_do_erro(sqlerrm);
          end if;
          v_recusa := jsonb_build_object('motivo', 'banco', 'frase', public._fn_parcelamento_frase_do_erro(sqlerrm));
      end;
    end if;
  end if;

  return jsonb_build_object('ok', v_recusa is null, 'escopo', p_escopo, 'simulado', coalesce(p_simular, false),
    'contrato', jsonb_build_object('id', f.id, 'descricao', f.descricao,
                 'credor', (select c.nome from public.financeiro_fornecedores c where c.id = f.credor_id)),
    'parcela', jsonb_build_object('id', p.id, 'numero', p.numero_parcela, 'total', v_n,
                 'valor', coalesce(p.valor_total, p.valor_principal), 'vencimento', p.data_vencimento, 'paga', v_paga,
                 'lancamento_id', p.lancamento_id),
    -- a nota da compra: o numero da NF viva ligada ao lancamento da parcela (o que o docDaLinha mostraria); nulo = sem nota
    'nota', (select d.numero from public.vw_lancamento_documentos d
              where d.lancamento_id = p.lancamento_id and d.especie in ('nf', 'nf_principal', 'nf_complementar')
                and not coalesce(d.cancelado, false) and btrim(coalesce(d.numero, '')) <> ''
              order by d.uploaded_em, d.documento_id limit 1),
    'antes', jsonb_build_object('parcelas', v_n, 'valor_total', f.valor_total),
    'depois', v_depois,
    'todas', case when p_escopo = 'todas' then jsonb_build_object('lancamentos', v_todas->'lancamentos', 'parcelas', v_todas->'parcelas') end,
    'recusa', v_recusa);
end
$function$;
REVOKE ALL ON FUNCTION public.fn_parcelamento_cancelar_parcela(uuid, text, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_cancelar_parcela(uuid, text, text, boolean, uuid) TO authenticated, service_role;

-- ── 1d: recriar o lancamento de uma parcela viva que ficou sem ele ───────────────────────────────────────────────────
CREATE FUNCTION public.fn_parcelamento_recriar_lancamento(p_parcela_id uuid, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f         public.financiamentos%rowtype;
  p         public.financiamento_parcelas%rowtype;
  v_n       int;
  v_molde   uuid;
  v_de      text;
  v_novo    uuid;
  v_recusa  jsonb;
begin
  select * into p from public.financiamento_parcelas q where q.id = p_parcela_id;
  if p.id is not null then
    select * into f from public.financiamentos where id = p.financiamento_id for update;
  end if;
  if p.id is null or f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if f.natureza is distinct from 'parcelamento' then
    raise exception using errcode = '22023', message = 'Só a parcela de compra parcelada tem o lançamento recriado por aqui. Nada foi gravado.';
  end if;
  if coalesce(p.status, '') = 'cancelado' or coalesce(f.status, '') = 'cancelado' then
    raise exception using errcode = '22023', message = 'A parcela (ou a compra) está cancelada: não há lançamento a recriar.';
  end if;

  v_n := (select count(*) from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado');
  if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = p.lancamento_id and not coalesce(l.cancelado, false)) then
    v_recusa := jsonb_build_object('motivo', 'tem_lancamento', 'frase', format('A parcela %s já tem lançamento no Financeiro.', p.numero_parcela));
  elsif coalesce(p.status, '') = 'pago' then
    v_recusa := jsonb_build_object('motivo', 'paga', 'frase', format('A parcela %s está marcada como paga: não se recria o lançamento dela por aqui.', p.numero_parcela));
  else
    -- o molde: a vizinha viva de maior numero (a regra do 2B); na falta dela, o proprio lancamento cancelado da parcela
    select lv.id into v_molde from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 lv on lv.id = q.lancamento_id
     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' and not coalesce(lv.cancelado, false)
     order by q.numero_parcela desc limit 1;
    v_de := 'vizinha';
    if v_molde is null then
      select l.id into v_molde from public.financeiro_lancamentos_v2 l where l.id = p.lancamento_id;
      v_de := 'cancelado';
    end if;
    if v_molde is null then
      v_recusa := jsonb_build_object('motivo', 'sem_molde', 'frase', 'A compra não tem lançamento que sirva de molde para esta parcela.');
    end if;
  end if;

  if v_recusa is not null then
    if not coalesce(p_simular, false) then
      raise exception using errcode = '22023', message = (v_recusa->>'frase') || ' Nada foi gravado.';
    end if;
  else
    begin
      v_novo := public._fn_parcelamento_lancamento_novo(f.id, v_molde, p.numero_parcela, v_n, p.data_vencimento,
                                                         round(coalesce(p.valor_total, p.valor_principal), 2));
      update public.financiamento_parcelas set lancamento_id = v_novo, updated_at = now() where id = p.id;
      if coalesce(p_simular, false) then
        raise exception using errcode = 'PCSIM', message = 'simulação';
      end if;
    exception
      when sqlstate 'PCSIM' then v_novo := null;
      when others then
        if not coalesce(p_simular, false) then raise; end if;
        v_recusa := jsonb_build_object('motivo', 'banco', 'frase', sqlerrm);
    end;
  end if;

  return jsonb_build_object('ok', v_recusa is null, 'simulado', coalesce(p_simular, false), 'financiamento_id', f.id,
    'parcela', jsonb_build_object('id', p.id, 'numero', p.numero_parcela, 'total', v_n,
                 'valor', coalesce(p.valor_total, p.valor_principal), 'vencimento', p.data_vencimento),
    'descricao', public._fn_parcela_descricao(f.descricao, p.numero_parcela, v_n),
    'molde', v_de, 'lancamento_id', v_novo, 'recusa', v_recusa);
end
$function$;
REVOKE ALL ON FUNCTION public.fn_parcelamento_recriar_lancamento(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_recriar_lancamento(uuid, boolean) TO authenticated, service_role;

-- ── 1c: a trava no dono ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.guard_parcelamento_lancamento_cancelar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_num  int;
  v_tot  int;
  v_desc text;
begin
  if coalesce(current_setting('app.parcelamento_escritor', true), '') = 'on' then
    return new;
  end if;
  select p.numero_parcela, f.total_parcelas, f.descricao into v_num, v_tot, v_desc
    from public.financiamento_parcelas p
    join public.financiamentos f on f.id = p.financiamento_id
   where p.lancamento_id = new.id and coalesce(p.status, '') <> 'cancelado'
     and f.natureza = 'parcelamento' and coalesce(f.status, '') <> 'cancelado'
   limit 1;
  if found then
    raise exception using errcode = 'P0001',
      message = format('Este lançamento é a parcela %s/%s da compra parcelada «%s». Cancele pela tela, que ajusta o contrato junto.',
                       v_num, v_tot, v_desc);
  end if;
  return new;
end
$function$;

-- so' dispara na passagem a cancelado de lancamento ligado a contrato (todo lancamento de parcela tem financiamento_id: medido,
-- 0 excecoes) — lancamento comum nao chega nem a chamar a funcao.
CREATE TRIGGER trg_guard_parcelamento_cancelar
  BEFORE UPDATE OF cancelado ON public.financeiro_lancamentos_v2
  FOR EACH ROW
  WHEN (NEW.cancelado IS TRUE AND OLD.cancelado IS DISTINCT FROM TRUE AND NEW.financiamento_id IS NOT NULL)
  EXECUTE FUNCTION public.guard_parcelamento_lancamento_cancelar();

-- guarda de ACL: as tres publicas para authenticated, nunca anon; as internas fechadas
DO $acl$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.fn_parcelamento_cancelar_parcela(uuid, text, text, boolean, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_parcelamento_excluir(uuid, text, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_parcelamento_recriar_lancamento(uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_parcelamento_cancelar_parcela(uuid, text, text, boolean, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_parcelamento_excluir(uuid, text, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_parcelamento_recriar_lancamento(uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_parcelamento_lancamento_novo(uuid, uuid, integer, integer, date, numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_parcelamento_frase_do_erro(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_parcelamento_lancamento_cancelar()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PARC-CADEIA-01: ACL diferente do esperado';
  END IF;
END
$acl$;
