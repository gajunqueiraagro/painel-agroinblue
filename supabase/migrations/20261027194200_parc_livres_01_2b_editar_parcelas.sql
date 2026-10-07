-- PARC-LIVRES-01 (passo 2B) — EDITAR AS PARCELAS DE UM PARCELAMENTO JA' CRIADO, NUMA TRANSACAO (Gabriel, 06/10/2026).
--
-- `fn_parcelamento_editar_parcelas(p_financiamento_id, p_parcelas, p_valor_total)` e' o UNICO escritor da edicao: recebe a lista
-- FINAL das parcelas do contrato, na ordem da tela — [{id?, data_vencimento, valor}] — e o valor total resultante, e grava
-- `financiamento_parcelas`, o lancamento de cada parcela e o contrato juntos.
--   · PARCELA PAGA NUNCA MUDA: paga = parcela 'pago', OU lancamento realizado/conciliado, OU lancamento com vinculo vivo ao
--     extrato (`_fn_parcela_de_parcelamento_paga`). A paga tem de vir na lista com a MESMA data e o MESMO valor; qualquer outra
--     coisa (mudar, tirar) e' RECUSADA com a frase, sem gravar nada.
--   · NAO PAGA: muda data e valor (parcela e lancamento, e SO' esses dois campos do lancamento); a que saiu da lista e' RETIRADA —
--     o lancamento e' cancelado pelo dono (`fn_cancelar_lancamento_auditoria`) e a parcela fica 'cancelado';
--     a que veio sem `id` e' ACRESCENTADA — o lancamento nasce copiando classificacao, safra, cultura, fase, fornecedor, forma,
--     conta, fazenda e competencia de uma parcela do contrato, e HERDA a nota fiscal da compra (o documento NF ligado a's parcelas).
--   · A SOMA EM CENTAVOS de todas as parcelas da lista tem de ser `p_valor_total`: nunca arredonda, nunca engole diferenca.
--   · O numero de cada parcela e' a posicao na lista; o "i/N" do nome do lancamento acompanha (so' quando o nome ainda e' o que o
--     sistema gerou: nome editado a' mao fica como esta'). Nas pagas so' esse trecho do texto muda.
--   · O contrato fica com `valor_total`, `total_parcelas` e `data_primeira_parcela` da lista.
-- O texto da parcela tem UM dono, `_fn_parcela_descricao` (hoje a forma do cadastro; o passo 5 troca a forma num lugar so').
-- Funcoes novas nascem fechadas: a RPC leva GRANT a `authenticated`; as internas ficam com o dono e `service_role`.

CREATE OR REPLACE FUNCTION public._fn_parcela_descricao(p_descricao text, p_numero integer, p_total integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(p_descricao, '') || ' - Parcela ' || p_numero::text || '/' || p_total::text
$function$;

CREATE OR REPLACE FUNCTION public._fn_parcela_de_parcelamento_paga(p_status text, p_lancamento_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(p_status, '') = 'pago'
      or exists (select 1 from public.financeiro_lancamentos_v2 l
                  where l.id = p_lancamento_id and not coalesce(l.cancelado, false)
                    and l.status_transacao in ('realizado', 'conciliado'))
      or exists (select 1 from public.conciliacao_bancaria_itens c
                  where c.lancamento_id = p_lancamento_id and c.desfeito_em is null)
$function$;

CREATE OR REPLACE FUNCTION public.fn_parcelamento_editar_parcelas(p_financiamento_id uuid, p_parcelas jsonb, p_valor_total numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f            public.financiamentos%rowtype;
  p            public.financiamento_parcelas%rowtype;
  l            public.financeiro_lancamentos_v2%rowtype;
  t            public.financeiro_lancamentos_v2%rowtype;   -- o molde da parcela acrescentada
  v_el         jsonb;
  v_i          int;
  v_n          int;
  v_n_antes    int;
  v_soma_cent  bigint;
  v_venc       date;
  v_val        numeric;
  v_paga       boolean;
  v_desc       text;
  v_lanc_id    uuid;
  v_alteradas  int := 0;
  v_criadas    int := 0;
  v_retiradas  int := 0;
  v_pagas      int := 0;
  v_ids        uuid[];
begin
  select * into f from public.financiamentos where id = p_financiamento_id for update;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if f.natureza is distinct from 'parcelamento' then
    raise exception using errcode = '22023', message = 'Só as parcelas de parcelamento se editam por aqui. Nada foi gravado.';
  end if;
  if p_parcelas is null or jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) < 1 then
    raise exception using errcode = '22023', message = 'Informe ao menos uma parcela.';
  end if;
  v_n := jsonb_array_length(p_parcelas);

  if exists (select 1 from jsonb_array_elements(p_parcelas) e where coalesce(e->>'data_vencimento', '') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception using errcode = '22023', message = 'Há parcela sem data de vencimento.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_parcelas) e
              where coalesce(e->>'valor', '') = '' or (e->>'valor')::numeric <= 0) then
    raise exception using errcode = '22023', message = 'Há parcela com valor zero ou negativo.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_parcelas) e where (e->>'valor')::numeric <> round((e->>'valor')::numeric, 2)) then
    raise exception using errcode = '22023', message = 'Valor de parcela com mais de duas casas decimais.';
  end if;

  select array_agg((e->>'id')::uuid) into v_ids from jsonb_array_elements(p_parcelas) e where coalesce(e->>'id', '') <> '';
  v_ids := coalesce(v_ids, '{}'::uuid[]);
  if (select count(*) from unnest(v_ids) x) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception using errcode = '22023', message = 'A mesma parcela veio duas vezes na lista. Nada foi gravado.';
  end if;
  if exists (select 1 from unnest(v_ids) x
              where not exists (select 1 from public.financiamento_parcelas q
                                 where q.id = x and q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado')) then
    raise exception using errcode = '22023', message = 'Há parcela na lista que não é deste contrato. Nada foi gravado.';
  end if;

  -- PARCELA PAGA NUNCA MUDA: tem de estar na lista, com a mesma data e o mesmo valor
  for p in select * from public.financiamento_parcelas q
            where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' order by q.numero_parcela
  loop
    if public._fn_parcela_de_parcelamento_paga(p.status, p.lancamento_id) then
      v_pagas := v_pagas + 1;
      select e into v_el from jsonb_array_elements(p_parcelas) e where e->>'id' = p.id::text;
      if v_el is null
         or (v_el->>'data_vencimento')::date is distinct from p.data_vencimento
         or round((v_el->>'valor')::numeric * 100) is distinct from round(coalesce(p.valor_total, 0) * 100) then
        raise exception using errcode = '22023',
          message = format('A parcela %s já está paga: data e valor não mudam, e ela não pode ser retirada. Nada foi gravado.', p.numero_parcela);
      end if;
    end if;
  end loop;

  select sum(round((e->>'valor')::numeric * 100))::bigint into v_soma_cent from jsonb_array_elements(p_parcelas) e;
  if p_valor_total is null or p_valor_total <= 0 or v_soma_cent <> round(p_valor_total * 100)::bigint then
    raise exception using errcode = '22023',
      message = format('A soma das parcelas (R$ %s) não fecha com o valor do contrato (R$ %s). Nada foi gravado.',
                       translate(to_char(v_soma_cent / 100.0, 'FM999,999,999,990.00'), ',.', '.,'),
                       translate(to_char(coalesce(p_valor_total, 0), 'FM999,999,999,990.00'), ',.', '.,'));
  end if;

  v_n_antes := (select count(*) from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado');

  -- o molde da acrescentada: o lancamento vivo da parcela de maior numero do contrato
  select lv.* into t from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 lv on lv.id = q.lancamento_id
   where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' and not coalesce(lv.cancelado, false)
   order by q.numero_parcela desc limit 1;

  -- RETIRADAS: nao pagas que sairam da lista
  for p in select * from public.financiamento_parcelas q
            where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' and not (q.id = any (v_ids))
  loop
    if p.lancamento_id is not null then
      perform public.fn_cancelar_lancamento_auditoria(p.lancamento_id, format('Parcela %s retirada do parcelamento "%s"', p.numero_parcela, f.descricao));
    end if;
    update public.financiamento_parcelas set status = 'cancelado', updated_at = now() where id = p.id;
    v_retiradas := v_retiradas + 1;
  end loop;

  -- A LISTA, na ordem: numero = posicao
  v_i := 0;
  for v_el in select e from jsonb_array_elements(p_parcelas) with ordinality as x(e, ord) order by ord
  loop
    v_i := v_i + 1;
    v_venc := (v_el->>'data_vencimento')::date;
    v_val := round((v_el->>'valor')::numeric, 2);
    if coalesce(v_el->>'id', '') <> '' then
      select * into p from public.financiamento_parcelas q where q.id = (v_el->>'id')::uuid;
      v_paga := public._fn_parcela_de_parcelamento_paga(p.status, p.lancamento_id);
      if p.lancamento_id is not null then
        select * into l from public.financeiro_lancamentos_v2 lv where lv.id = p.lancamento_id;
        -- o "i/N" do nome acompanha, so' quando o nome ainda e' o gerado
        v_desc := case when l.descricao = public._fn_parcela_descricao(f.descricao, p.numero_parcela, v_n_antes)
                       then public._fn_parcela_descricao(f.descricao, v_i, v_n) else l.descricao end;
        if v_paga then
          if v_desc is distinct from l.descricao then
            update public.financeiro_lancamentos_v2 set descricao = v_desc, updated_at = now() where id = l.id;
          end if;
        elsif l.valor is distinct from v_val or l.data_vencimento is distinct from v_venc or v_desc is distinct from l.descricao then
          update public.financeiro_lancamentos_v2
             set valor = v_val, data_vencimento = v_venc, descricao = v_desc, updated_at = now(), updated_by = auth.uid()
           where id = l.id;
        end if;
      end if;
      if not v_paga and (p.data_vencimento is distinct from v_venc or coalesce(p.valor_total, 0) <> v_val) then
        v_alteradas := v_alteradas + 1;
      end if;
      if v_paga then
        update public.financiamento_parcelas set numero_parcela = v_i where id = p.id and numero_parcela is distinct from v_i;
      else
        update public.financiamento_parcelas
           set numero_parcela = v_i, data_vencimento = v_venc, valor_principal = v_val, valor_juros = 0, valor_total = v_val, updated_at = now()
         where id = p.id
           and (numero_parcela is distinct from v_i or data_vencimento is distinct from v_venc or coalesce(valor_total, 0) <> v_val);
      end if;
    else
      -- ACRESCENTADA
      if t.id is null then
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
        (f.cliente_id, t.fazenda_id, t.sinal, t.tipo_operacao, v_val,
         public._fn_parcela_descricao(f.descricao, v_i, v_n), t.data_competencia, v_venc, null,
         'programado', 'realizado', false, false,
         'parcela_principal', f.id,
         t.plano_conta_id, t.safra_id, t.cultura, t.fase,
         t.favorecido_id, t.forma_pagamento, t.conta_bancaria_id, auth.uid())
      returning id into v_lanc_id;
      insert into public.financiamento_parcelas
        (financiamento_id, cliente_id, numero_parcela, data_vencimento, data_pagamento,
         valor_principal, valor_juros, valor_total, status, lancamento_id)
      values (f.id, f.cliente_id, v_i, v_venc, null, v_val, 0, v_val, 'pendente', v_lanc_id);
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
      v_criadas := v_criadas + 1;
    end if;
  end loop;

  update public.financiamentos
     set valor_total = round(p_valor_total, 2), total_parcelas = v_n,
         data_primeira_parcela = (p_parcelas->0->>'data_vencimento')::date, updated_at = now()
   where id = f.id;

  return jsonb_build_object('ok', true, 'financiamento_id', f.id, 'parcelas', v_n, 'valor_total', round(p_valor_total, 2),
    'pagas', v_pagas, 'alteradas', v_alteradas, 'acrescentadas', v_criadas, 'retiradas', v_retiradas);
end
$function$;

REVOKE ALL ON FUNCTION public._fn_parcela_descricao(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_parcela_de_parcelamento_paga(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_parcelamento_editar_parcelas(uuid, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_editar_parcelas(uuid, jsonb, numeric) TO authenticated, service_role;
