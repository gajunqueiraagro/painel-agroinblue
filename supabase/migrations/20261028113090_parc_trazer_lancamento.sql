-- PARC-TRAZER-01 (D5 Racaforte, Gabriel 29/10 19:4x, caminho A) — trazer um lançamento que JÁ EXISTE (inclusive pago ou casado com o extrato)
-- para dentro de uma compra parcelada como a parcela i/N, renumerando as outras. O caso: o à vista "Vacinas e Vermífugos" (20/09, pago) é a
-- 1/5 da NF 521109, e a compra "Medicamentos Bovinos" tem as 2/5–5/5. Nenhum gravador de hoje faz isso: o vincular recusa parcelamento, o
-- juntar recusa "já é parcela" e o editar só acrescenta lançamento NOVO.
--   • O lançamento trazido: só ganha o elo (financiamento_id + origem_tipo 'parcela_principal', igual ao juntar). Descrição, valor, conta,
--     vencimento, competência, situação e casamento com o extrato ficam.
--   • A posição: pelo vencimento entre as parcelas vivas (empate: depois das que já estão). As outras são renumeradas; a descrição só troca o
--     "i/N" do FIM (o dono é `_fn_parcela_renumerar`); a paga muda só o número e o nome, nunca data, valor ou situação.
--   • A compra: valor_total + o valor trazido, total_parcelas + 1, primeira parcela = o menor vencimento.
--   • As recusas são as do juntar (mesmo fornecedor = credor, mesma fazenda e classificação das parcelas; saída, Realizado, não gerado pelo
--     sistema, sem OC, sem classificação dividida, com vencimento), mais: o lançamento não pode ser parcela nem pagamento de contrato nenhum.
--   • Simular = gravar e desfazer (a prévia é o depois de verdade).
--   • A parcela que nasce leva a marca em `observacao` ("PARC-TRAZER-01: trazido …"): é ela que o gesto contrário reconhece.
-- O GESTO CONTRÁRIO (Gabriel 30/10: "aplicar SÓ com o gesto contrário na mesma migration") — `fn_parcelamento_devolver_lancamento`: tira o
-- trazido, ele volta a SOLTO (sem o elo, `origem_tipo` vazio como antes), as outras são renumeradas e a compra volta ao valor e ao total de
-- antes. Recusa o que não foi trazido por aqui (sem a marca). A parcela dele não é apagada: fica cancelada, sem o lançamento, com a marca
-- "devolvido" (a trilha).
-- ⚠ GUARDA: as funções não podem existir antes. ACL: REVOKE FROM PUBLIC; authenticated e service_role.
SET LOCAL lock_timeout = '2s';
DO $$
BEGIN
  IF to_regprocedure('public.fn_parcelamento_trazer_lancamento(uuid,uuid,boolean)') IS NOT NULL
     OR to_regprocedure('public.fn_parcelamento_devolver_lancamento(uuid,uuid,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'PARC-TRAZER-01: a função já existe. Nada foi gravado.';
  END IF;
END $$;

CREATE FUNCTION public.fn_parcelamento_trazer_lancamento(p_financiamento_id uuid, p_lancamento_id uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f        public.financiamentos%rowtype;
  l        public.financeiro_lancamentos_v2%rowtype;
  m        public.financeiro_lancamentos_v2%rowtype;   -- o lançamento de uma parcela viva: a régua de fornecedor/fazenda/classificação
  p        record;
  v_n      int;
  v_pos    int;
  v_i      int;
  v_desc   text;
  v_parc   uuid;
  v_recusa text;
  v_antes  jsonb;
  v_depois jsonb;
  v_ret    jsonb;
  q_lista  constant text := $q$
    select coalesce(jsonb_agg(jsonb_build_object('numero', q.numero_parcela, 'vencimento', q.data_vencimento, 'valor', q.valor_total,
             'situacao', q.status, 'lancamento_id', q.lancamento_id, 'descricao', x.descricao) order by q.numero_parcela), '[]')
      from public.financiamento_parcelas q left join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id
     where q.financiamento_id = $1 and coalesce(q.status, '') <> 'cancelado'$q$;
begin
  select * into f from public.financiamentos where id = p_financiamento_id for update;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select * into l from public.financeiro_lancamentos_v2 where id = p_lancamento_id and cliente_id = f.cliente_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select x.* into m from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id
   where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' and not coalesce(x.cancelado, false)
   order by q.numero_parcela limit 1;

  v_recusa := case
    when f.natureza is distinct from 'parcelamento' then 'Só compra parcelada recebe um lançamento como parcela.'
    when coalesce(f.status, '') = 'cancelado' then 'Esta compra parcelada está cancelada.'
    when m.id is null then 'A compra não tem parcela viva para comparar.'
    when coalesce(l.cancelado, false) then format('O lançamento «%s» está cancelado.', l.descricao)
    when l.financiamento_id is not null
      or exists (select 1 from public.financiamento_parcelas q where coalesce(q.status, '') <> 'cancelado' and (q.lancamento_id = l.id or q.lancamento_juros_id = l.id))
      then format('O lançamento «%s» já é parcela de um contrato.', l.descricao)
    when exists (select 1 from public.financiamento_parcela_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null)
      or exists (select 1 from public.financiamento_encargos e where e.lancamento_id = l.id and e.desfeito_em is null)
      then format('O lançamento «%s» já paga um contrato.', l.descricao)
    when l.cenario is distinct from 'realizado' then format('O lançamento «%s» é de Meta: não vira parcela.', l.descricao)
    when l.sinal is distinct from '-1' or coalesce(l.tipo_operacao, '') not like '2-%' then format('O lançamento «%s» não é saída: só saída vira parcela de compra.', l.descricao)
    when l.origem_tipo is not null then format('O lançamento «%s» foi gerado pelo sistema (%s): não vira parcela.', l.descricao, l.origem_tipo)
    when exists (select 1 from public.zoo_operacao_partes z where z.financeiro_lancamento_id = l.id and not z.cancelada) then format('O lançamento «%s» é de uma operação comercial: não vira parcela.', l.descricao)
    when l.classificacao_dividida then format('O lançamento «%s» tem a classificação dividida: desfaça a divisão antes.', l.descricao)
    when l.data_vencimento is null then format('O lançamento «%s» não tem vencimento.', l.descricao)
    when l.favorecido_id is distinct from coalesce(f.credor_id, m.favorecido_id) then 'O lançamento é de outro fornecedor: só a mesma compra entra.'
    when l.fazenda_id is distinct from m.fazenda_id then 'O lançamento é de outra fazenda.'
    when l.plano_conta_id is distinct from m.plano_conta_id then 'O lançamento tem outra classificação: acerte a classificação antes.'
  end;
  if v_recusa is not null then
    if not coalesce(p_simular, true) then
      raise exception using errcode = '22023', message = v_recusa || ' Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('frase', v_recusa));
  end if;

  v_n := (select count(*) from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado');
  v_pos := 1 + (select count(*) from public.financiamento_parcelas q
                 where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' and q.data_vencimento <= l.data_vencimento);
  execute q_lista into v_antes using f.id;

  begin
    /* as vivas, na ordem: a posição nova pula a do trazido; o nome só troca o "i/N" do fim (a paga também, só o nome) */
    v_i := 0;
    for p in select q.id, q.numero_parcela, q.lancamento_id from public.financiamento_parcelas q
              where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' order by q.numero_parcela
    loop
      v_i := v_i + 1;
      if v_i = v_pos then v_i := v_i + 1; end if;
      update public.financiamento_parcelas set numero_parcela = v_i, updated_at = now() where id = p.id and numero_parcela is distinct from v_i;
      if p.lancamento_id is not null then
        select x.descricao into v_desc from public.financeiro_lancamentos_v2 x where x.id = p.lancamento_id;
        update public.financeiro_lancamentos_v2 set descricao = public._fn_parcela_renumerar(v_desc, p.numero_parcela, v_n, v_i, v_n + 1), updated_at = now()
         where id = p.lancamento_id and descricao is distinct from public._fn_parcela_renumerar(v_desc, p.numero_parcela, v_n, v_i, v_n + 1);
      end if;
    end loop;

    /* o trazido: a parcela nova aponta para ele; ele ganha só o elo */
    insert into public.financiamento_parcelas
      (financiamento_id, cliente_id, numero_parcela, data_vencimento, data_pagamento, valor_principal, valor_juros, valor_total, status, lancamento_id, observacao)
    values (f.id, f.cliente_id, v_pos, l.data_vencimento, null, round(abs(l.valor), 2), 0, round(abs(l.valor), 2), 'pendente', l.id,
            format('PARC-TRAZER-01: trazido em %s', to_char(now(), 'DD/MM/YYYY HH24:MI')))
    returning id into v_parc;
    update public.financeiro_lancamentos_v2 set financiamento_id = f.id, origem_tipo = 'parcela_principal' where id = l.id;
    perform public._fn_parcela_status_alinhar(v_parc, null);

    update public.financiamentos
       set valor_total = round(coalesce(valor_total, 0) + abs(l.valor), 2), total_parcelas = v_n + 1,
           data_primeira_parcela = (select min(q.data_vencimento) from public.financiamento_parcelas q
                                     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'),
           updated_at = now()
     where id = f.id;
    perform public._fn_financiamento_status_pelas_parcelas(f.id);

    execute q_lista into v_depois using f.id;
    v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'financiamento_id', f.id, 'parcela_id', v_parc,
      'posicao', v_pos, 'parcelas_antes', v_n, 'parcelas_depois', v_n + 1,
      'valor_antes', f.valor_total, 'valor_depois', round(coalesce(f.valor_total, 0) + abs(l.valor), 2),
      'antes', v_antes, 'depois', v_depois, 'recusa', null);
    if coalesce(p_simular, true) then raise exception using errcode = 'PTSIM', message = v_ret::text; end if;
  exception when sqlstate 'PTSIM' then
    v_ret := sqlerrm::jsonb || jsonb_build_object('parcela_id', null);
  end;
  return v_ret;
end
$function$;

REVOKE ALL ON FUNCTION public.fn_parcelamento_trazer_lancamento(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_trazer_lancamento(uuid, uuid, boolean) TO authenticated, service_role;

CREATE FUNCTION public.fn_parcelamento_devolver_lancamento(p_financiamento_id uuid, p_lancamento_id uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f        public.financiamentos%rowtype;
  q        public.financiamento_parcelas%rowtype;
  p        record;
  v_n      int;
  v_i      int;
  v_desc   text;
  v_recusa text;
  v_antes  jsonb;
  v_depois jsonb;
  v_ret    jsonb;
  q_lista  constant text := $q$
    select coalesce(jsonb_agg(jsonb_build_object('numero', q.numero_parcela, 'vencimento', q.data_vencimento, 'valor', q.valor_total,
             'situacao', q.status, 'lancamento_id', q.lancamento_id, 'descricao', x.descricao) order by q.numero_parcela), '[]')
      from public.financiamento_parcelas q left join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id
     where q.financiamento_id = $1 and coalesce(q.status, '') <> 'cancelado'$q$;
begin
  select * into f from public.financiamentos where id = p_financiamento_id for update;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  perform 1 from public.financeiro_lancamentos_v2 where id = p_lancamento_id and cliente_id = f.cliente_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select * into q from public.financiamento_parcelas x
   where x.financiamento_id = f.id and x.lancamento_id = p_lancamento_id and coalesce(x.status, '') <> 'cancelado'
     and coalesce(x.observacao, '') like 'PARC-TRAZER-01: trazido%'
   limit 1;
  v_n := (select count(*) from public.financiamento_parcelas x where x.financiamento_id = f.id and coalesce(x.status, '') <> 'cancelado');

  v_recusa := case
    when f.natureza is distinct from 'parcelamento' then 'Só compra parcelada devolve um lançamento trazido.'
    when coalesce(f.status, '') = 'cancelado' then 'Esta compra parcelada está cancelada.'
    when q.id is null then 'Este lançamento não foi trazido para esta compra: nada a devolver.'
    when v_n <= 1 then 'É a única parcela viva da compra: não se devolve.'
  end;
  if v_recusa is not null then
    if not coalesce(p_simular, true) then
      raise exception using errcode = '22023', message = v_recusa || ' Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('frase', v_recusa));
  end if;

  execute q_lista into v_antes using f.id;

  begin
    /* a parcela dele sai (cancelada, sem o lançamento, com a trilha) ANTES de o lançamento perder o elo */
    update public.financiamento_parcelas
       set status = 'cancelado', lancamento_id = null, updated_at = now(),
           observacao = q.observacao || format(' · devolvido em %s', to_char(now(), 'DD/MM/YYYY HH24:MI'))
     where id = q.id;
    update public.financeiro_lancamentos_v2 set financiamento_id = null, origem_tipo = null where id = p_lancamento_id;

    /* as outras vivas, na ordem: o número fecha o buraco; o nome só troca o "i/N" do fim */
    v_i := 0;
    for p in select x.id, x.numero_parcela, x.lancamento_id from public.financiamento_parcelas x
              where x.financiamento_id = f.id and coalesce(x.status, '') <> 'cancelado' order by x.numero_parcela
    loop
      v_i := v_i + 1;
      update public.financiamento_parcelas set numero_parcela = v_i, updated_at = now() where id = p.id and numero_parcela is distinct from v_i;
      if p.lancamento_id is not null then
        select x.descricao into v_desc from public.financeiro_lancamentos_v2 x where x.id = p.lancamento_id;
        update public.financeiro_lancamentos_v2 set descricao = public._fn_parcela_renumerar(v_desc, p.numero_parcela, v_n, v_i, v_n - 1), updated_at = now()
         where id = p.lancamento_id and descricao is distinct from public._fn_parcela_renumerar(v_desc, p.numero_parcela, v_n, v_i, v_n - 1);
      end if;
    end loop;

    update public.financiamentos
       set valor_total = round(coalesce(valor_total, 0) - coalesce(q.valor_total, 0), 2), total_parcelas = v_n - 1,
           data_primeira_parcela = (select min(x.data_vencimento) from public.financiamento_parcelas x
                                     where x.financiamento_id = f.id and coalesce(x.status, '') <> 'cancelado'),
           updated_at = now()
     where id = f.id;
    perform public._fn_financiamento_status_pelas_parcelas(f.id);

    execute q_lista into v_depois using f.id;
    v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'financiamento_id', f.id, 'parcela_id', q.id,
      'parcelas_antes', v_n, 'parcelas_depois', v_n - 1,
      'valor_antes', f.valor_total, 'valor_depois', round(coalesce(f.valor_total, 0) - coalesce(q.valor_total, 0), 2),
      'antes', v_antes, 'depois', v_depois, 'recusa', null);
    if coalesce(p_simular, true) then raise exception using errcode = 'PDSIM', message = v_ret::text; end if;
  exception when sqlstate 'PDSIM' then
    v_ret := sqlerrm::jsonb;
  end;
  return v_ret;
end
$function$;

REVOKE ALL ON FUNCTION public.fn_parcelamento_devolver_lancamento(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_devolver_lancamento(uuid, uuid, boolean) TO authenticated, service_role;
