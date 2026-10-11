-- FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 1, parte B1 (Gabriel, 11/10/2026): OS DONOS E AS DUAS LEITURAS.
-- Depois da 20261027196100 (a tabela). A gravacao (vincular / desvincular) e' a 20261027196300 — duas porque o canal de
-- aplicacao recusa carga acima de ~10 KB.
-- DONOS, cada pergunta num lugar so' (internos, fechados):
--   _fn_financiamento_vivo(status)           contrato vivo = nao cancelado ('quitado' e' vivo);
--   _fn_numero_na_descricao(numero, digitos) o numero do contrato (4+ digitos) aparece nos digitos da descricao;
--   _fn_encargo_papel_sugerido(descricao)    SUGESTAO do papel pela descricao;
--   _fn_lancamento_elegivel_a_encargo(id)    quem pode virar encargo, com o motivo e a frase da recusa.
-- ⚠ NENHUMA FUNCAO LE^ A DESCRICAO PARA DECIDIR: ela so' MARCA (numero_na_descricao) e SUGERE (papel_sugerido).
-- As duas leituras: SECURITY DEFINER, tenant_ok + 42501 (sem usuario tambem), STABLE, GRANT a authenticated e service_role.
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public._fn_financiamento_vivo(p_status text)
 RETURNS boolean LANGUAGE sql IMMUTABLE
AS $function$ select coalesce(p_status, '') <> 'cancelado' $function$;

CREATE FUNCTION public._fn_numero_na_descricao(p_numero text, p_digitos_da_descricao text)
 RETURNS boolean LANGUAGE sql IMMUTABLE
AS $function$
  select length(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g')) >= 4
     and position(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g') in coalesce(p_digitos_da_descricao, '')) > 0
$function$;

CREATE FUNCTION public._fn_encargo_papel_sugerido(p_descricao text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $function$
  select case when p_descricao ilike '%iof%' then 'iof'
              when p_descricao ilike '%juros%' or p_descricao ilike '%encargo%' then 'juros'
              when p_descricao ilike '%tarifa%' then 'tarifa'
              when p_descricao ilike '%seguro%' then 'seguro'
              when p_descricao ilike '%multa%' or p_descricao ilike '%mora%' then 'multa'
              else 'outro' end
$function$;

-- Elegivel a encargo: vivo, de SAIDA, que nao e' parcela nem captacao de contrato, nao e' titulo de operacao comercial (parte
-- VIVA) e ainda nao e' encargo de contrato nenhum. Lancamento inexistente: nenhuma linha (quem chama ja' recusou por tenant).
-- Sem SET de search_path de proposito (tudo qualificado): com SET o planner nao embute a funcao na leitura por contrato.
CREATE FUNCTION public._fn_lancamento_elegivel_a_encargo(p_lancamento_id uuid)
 RETURNS TABLE(ok boolean, motivo text, frase text)
 LANGUAGE sql STABLE
AS $function$
  select m.motivo is null, m.motivo,
         case m.motivo
           when 'cancelado' then 'O lançamento está cancelado.'
           when 'nao_e_saida' then 'Só lançamento de saída vira encargo de contrato.'
           when 'parcela_ou_captacao' then 'Este lançamento já é parcela ou captação de um contrato.'
           when 'titulo_de_oc' then 'Este lançamento é título de operação comercial.'
           when 'ja_e_encargo' then format('Este lançamento já é encargo do contrato «%s».', coalesce(en.descricao, '—'))
         end
    from public.financeiro_lancamentos_v2 l
    left join lateral (
      select coalesce(f.descricao, f.numero_contrato) as descricao, true as tem
        from public.financiamento_encargos x join public.financiamentos f on f.id = x.financiamento_id
       where x.lancamento_id = l.id and x.desfeito_em is null limit 1) en on true
   cross join lateral (
      select case
        when coalesce(l.cancelado, false) then 'cancelado'
        when coalesce(l.tipo_operacao, '') not like '2-%' then 'nao_e_saida'
        when l.financiamento_id is not null
          or exists (select 1 from public.financiamento_parcelas p where p.lancamento_id = l.id)
          or exists (select 1 from public.financiamento_parcelas p where p.lancamento_juros_id = l.id)
          or exists (select 1 from public.financiamentos c where c.lancamento_captacao_id = l.id) then 'parcela_ou_captacao'
        when exists (select 1 from public.zoo_operacao_partes z where z.financeiro_lancamento_id = l.id and z.cancelada = false) then 'titulo_de_oc'
        when en.tem then 'ja_e_encargo'
      end as motivo) m
   where l.id = p_lancamento_id
$function$;

REVOKE ALL ON FUNCTION public._fn_financiamento_vivo(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_numero_na_descricao(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_encargo_papel_sugerido(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_lancamento_elegivel_a_encargo(uuid) FROM PUBLIC, anon, authenticated;

-- 2a — pelo LANCAMENTO: os contratos vivos do cliente dele, na ordem numero na descricao > mesmo credor > mais recente.
CREATE FUNCTION public.fn_contrato_encargo_candidatas(p_lancamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  l     public.financeiro_lancamentos_v2%rowtype;
  e     record;
  v_dig text;
begin
  select * into l from public.financeiro_lancamentos_v2 where id = p_lancamento_id;
  if not found or not coalesce(public.tenant_ok(l.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select * into e from public._fn_lancamento_elegivel_a_encargo(l.id);
  v_dig := regexp_replace(coalesce(l.descricao, ''), '\D', '', 'g');
  return jsonb_build_object(
    'lancamento', jsonb_build_object('id', l.id, 'descricao', l.descricao, 'valor', abs(l.valor),
      'data', coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), 'subcentro', l.subcentro,
      'status_transacao', l.status_transacao, 'favorecido_id', l.favorecido_id,
      'favorecido_nome', (select fo.nome from public.financeiro_fornecedores fo where fo.id = l.favorecido_id),
      'papel_sugerido', public._fn_encargo_papel_sugerido(l.descricao)),
    'elegivel', jsonb_build_object('ok', e.ok, 'motivo', e.motivo, 'frase', e.frase),
    'candidatas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.numero_na_descricao desc, c.mesmo_credor desc, c.data_contrato desc nulls last, c.financiamento_id)
        from (
          select f.id as financiamento_id, f.descricao, f.numero_contrato, f.natureza, f.status, f.credor_id,
                 fo.nome as credor_nome, f.data_contrato,
                 coalesce(f.credor_id = l.favorecido_id, false) as mesmo_credor,
                 public._fn_numero_na_descricao(f.numero_contrato, v_dig) as numero_na_descricao,
                 exists (select 1 from public.financiamento_encargos x
                          where x.financiamento_id = f.id and x.lancamento_id = l.id and x.desfeito_em is null) as ja_vinculado
            from public.financiamentos f
            left join public.financeiro_fornecedores fo on fo.id = f.credor_id
           where f.cliente_id = l.cliente_id and public._fn_financiamento_vivo(f.status)) c), '[]'::jsonb));
end
$function$;

-- 2b — pelo CONTRATO: os lancamentos elegiveis do credor dele no periodo (sem periodo: os ultimos 36 meses). `subcentro_financeiro`
-- e `numero_na_descricao` so' MARCAM e ordenam; nao filtram. Teto de 500 linhas; `total` e' a contagem inteira.
CREATE FUNCTION public.fn_contrato_encargos_vinculaveis(p_financiamento_id uuid, p_de date DEFAULT NULL, p_ate date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  f     public.financiamentos%rowtype;
  v_de  date := coalesce(p_de, (current_date - interval '36 months')::date);
  v_ate date := coalesce(p_ate, date '9999-12-31');
  v_tot int;
  v_lin jsonb;
begin
  select * into f from public.financiamentos where id = p_financiamento_id;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  with base as (
    select l.id, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) as dt, l.descricao, abs(l.valor) as valor,
           l.subcentro, l.macro_custo, l.status_transacao,
           (l.status_transacao = 'conciliado' or exists (select 1 from public.conciliacao_bancaria_itens c
                                                         where c.lancamento_id = l.id and c.desfeito_em is null)) as conciliado,
           public._fn_numero_na_descricao(f.numero_contrato, regexp_replace(coalesce(l.descricao, ''), '\D', '', 'g')) as nnd,
           (coalesce(l.macro_custo, '') ilike '%despesas financeiras%' or coalesce(l.centro_custo, '') ilike '%despesas financeiras%'
             or coalesce(l.subcentro, '') ilike '%despesas financeiras%' or coalesce(l.subcentro, '') ilike '%juros%') as sf
      from public.financeiro_lancamentos_v2 l
     cross join lateral public._fn_lancamento_elegivel_a_encargo(l.id) e
     where l.cliente_id = f.cliente_id and l.favorecido_id = f.credor_id
       and l.cancelado is not true and l.tipo_operacao like '2-%' and e.ok
       and coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) between v_de and v_ate
  ), ord as (
    select b.*, row_number() over (order by b.nnd desc, b.sf desc, b.dt desc, b.id) as rn from base b
  )
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'lancamento_id', o.id, 'data', o.dt, 'descricao', o.descricao, 'valor', o.valor, 'subcentro', o.subcentro,
           'macro_custo', o.macro_custo, 'status_transacao', o.status_transacao, 'conciliado', o.conciliado,
           'numero_na_descricao', o.nnd, 'subcentro_financeiro', o.sf,
           'papel_sugerido', public._fn_encargo_papel_sugerido(o.descricao)) order by o.rn) filter (where o.rn <= 500), '[]'::jsonb)
    into v_tot, v_lin
    from ord o;
  return jsonb_build_object(
    'contrato', jsonb_build_object('id', f.id, 'descricao', f.descricao, 'numero_contrato', f.numero_contrato, 'natureza', f.natureza,
      'status', f.status, 'vivo', public._fn_financiamento_vivo(f.status), 'credor_id', f.credor_id,
      'credor_nome', (select fo.nome from public.financeiro_fornecedores fo where fo.id = f.credor_id)),
    'de', v_de, 'ate', nullif(v_ate, date '9999-12-31'), 'total', v_tot, 'linhas', v_lin);
end
$function$;

REVOKE ALL ON FUNCTION public.fn_contrato_encargo_candidatas(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_contrato_encargos_vinculaveis(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contrato_encargo_candidatas(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_contrato_encargos_vinculaveis(uuid, date, date) TO authenticated, service_role;
