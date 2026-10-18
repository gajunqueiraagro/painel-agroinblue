-- FIN-FINANC-28 · TELA DO CONTRATO v3 (Gabriel 18/10/2026) — UMA leitura para a tela do contrato de crédito.
-- So' leitura. Nenhuma tabela, nenhuma coluna, nenhum dado muda.
--
-- fn_contrato_tela(p_financiamento_id, p_hoje) -> jsonb
--   · guarda pelo cliente do contrato (`_fn_contrato_do_usuario`: tenant_ok + 42501, sem usuario tambem);
--   · NAO REPETE A REGRA DA SITUACAO: chama `fn_financiamento_situacao(contrato, hoje, true)` e so' remonta o que ela devolve
--     (pagas, valor pago, conta, encargos, vencidas, pendencias do saldo);
--   · condicoes: a taxa gravada com a unidade (a.m. quando `taxa_juros_mensal` > 0; senao `taxa_juros`, a.a.) e a TAXA A.A.
--     equivalente, calculada aqui ((1 + i)^12 − 1); sistema, carencia, tipo de taxa e periodicidade como gravados (nulo = nao cadastrado);
--     ⚠ DESVIO DECLARADO: o briefing pedia a taxa a.a. "na funcao de situacao"; ela mora nesta leitura, que e' a da tela, para nao
--       mexer na situacao nem no lote (as duas tem as chaves presas por md5 em teste);
--   · liberacoes vivas com o destino e, na forma 'conta': entrou = |valor do lancamento vinculado vivo| limitado ao da liberacao;
--     a_identificar = valor − entrou (o valor inteiro sem vinculo); excedente = o que o lancamento passa da liberacao. Fora da
--     forma 'conta' (fornecedor, liquidacao) nao se espera entrada: entrou nulo e a_identificar 0. Totais somados aqui;
--   · pagamentos: as parcelas pagas ou parciais (o lancamento realizado de principal e de juros, ou os valores da parcela quando ela
--     e' "paga sem lancamento") e os encargos pagos em linhas proprias; totais;
--   · historico: liberacoes (e as canceladas), pagamentos, encargos pagos, baixas (e o desfazer) e documentos (e os cancelados);
--   · a_resolver: as pendencias, cada uma com o tom (vencido | dado), o valor quando ha' e a acao que a resolve.
set local lock_timeout = '2s';

create or replace function public.fn_contrato_tela(p_financiamento_id uuid, p_hoje date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  f        public.financiamentos%rowtype;
  v_hoje   date := coalesce(p_hoje, current_date);
  v_sit    jsonb;
  v_cred   record;
  v_tm     numeric;
  v_taa    numeric;
  v_unid   text;
  v_libs   jsonb;
  v_ltot   jsonb;
  v_pags   jsonb;
  v_ptot   jsonb;
  v_hist   jsonb;
  v_res    jsonb := '[]'::jsonb;
  v_pend   jsonb;
  v_vqt    int;
  v_venc   numeric;
  v_aid    numeric;
  v_prim   jsonb;
  v_ult    jsonb;
  v_vfinal date;
  v_1venc  uuid;
begin
  f := public._fn_contrato_do_usuario(p_financiamento_id);
  v_sit := public.fn_financiamento_situacao(p_financiamento_id, v_hoje, true);

  select x.nome, nullif(btrim(coalesce(x.cpf_cnpj, '')), '') as doc into v_cred
  from public.financeiro_fornecedores x where x.id = f.credor_id;

  /* condicoes */
  if coalesce(f.taxa_juros_mensal, 0) > 0 then
    v_tm := f.taxa_juros_mensal; v_unid := 'a.m.';
    v_taa := round(((power(1 + f.taxa_juros_mensal / 100.0, 12) - 1) * 100)::numeric, 4);
  elsif coalesce(f.taxa_juros, 0) > 0 then
    v_tm := f.taxa_juros; v_unid := 'a.a.'; v_taa := f.taxa_juros;
  end if;

  select coalesce(f.vencimento_final, max(q.data_vencimento)) into v_vfinal
  from public.financiamento_parcelas q where q.financiamento_id = f.id and q.status is distinct from 'cancelado';

  /* liberacoes */
  with l as (
    select li.id, li.data, li.valor, li.forma, li.lancamento_id, li.destinacao_id, d.descricao as destino,
           case when lv.id is not null and not coalesce(lv.cancelado, false) then abs(lv.valor) end as lanc_valor
    from public.financiamento_liberacoes li
    left join public.financiamento_destinacoes d on d.id = li.destinacao_id
    left join public.financeiro_lancamentos_v2 lv on lv.id = li.lancamento_id
    where li.financiamento_id = f.id and li.cancelado_em is null
  ), c as (
    select l.*,
      case when l.forma = 'conta' then least(coalesce(l.lanc_valor, 0), l.valor) end as entrou,
      case when l.forma = 'conta' then l.valor - least(coalesce(l.lanc_valor, 0), l.valor) else 0 end as a_identificar,
      case when l.forma = 'conta' then greatest(coalesce(l.lanc_valor, 0) - l.valor, 0) else 0 end as excedente
    from l
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'data', c.data, 'forma', c.forma, 'valor', c.valor, 'destinacao_id', c.destinacao_id, 'destino', c.destino,
           'lancamento_id', case when c.lanc_valor is not null then c.lancamento_id end,
           'entrou', c.entrou, 'a_identificar', c.a_identificar, 'excedente', c.excedente) order by c.data, c.id), '[]'::jsonb),
         jsonb_build_object('qtde', count(*), 'liberado', coalesce(sum(c.valor), 0), 'entrou', coalesce(sum(c.entrou), 0),
           'a_identificar', coalesce(sum(c.a_identificar), 0), 'excedente', coalesce(sum(c.excedente), 0)),
         (select jsonb_build_object('data', c1.data, 'a_confirmar', c1.lanc_valor is null and c1.forma = 'conta') from c c1 order by c1.data, c1.id limit 1),
         (select jsonb_build_object('data', c2.data, 'a_confirmar', c2.lanc_valor is null and c2.forma = 'conta') from c c2 order by c2.data desc, c2.id desc limit 1)
    into v_libs, v_ltot, v_prim, v_ult
  from c;
  v_aid := coalesce((v_ltot ->> 'a_identificar')::numeric, 0);

  /* pagamentos: parcelas pagas / parciais pela situacao + encargos pagos */
  with p as (
    select (e ->> 'id')::uuid as parcela_id, (e ->> 'numero')::int as numero, (e ->> 'pago_em')::date as pago_em, e ->> 'situacao' as sit,
           e ->> 'fonte' as fonte, (e ->> 'valor_principal')::numeric as vp, (e ->> 'valor_juros')::numeric as vj,
           nullif(e ->> 'lancamento_id', '')::uuid as lp, nullif(e ->> 'lancamento_juros_id', '')::uuid as lj, e ->> 'conta_nome' as conta
    from jsonb_array_elements(coalesce(v_sit -> 'parcelas', '[]'::jsonb)) e
    where e ->> 'situacao' in ('paga', 'parcial')
  ), pp as (
    select p.*,
      case when p.fonte = 'parcela' then p.vp else (select abs(x.valor) from public.financeiro_lancamentos_v2 x
        where x.id = p.lp and not coalesce(x.cancelado, false) and x.status_transacao in ('realizado', 'conciliado')) end as principal,
      case when p.fonte = 'parcela' then p.vj else (select abs(x.valor) from public.financeiro_lancamentos_v2 x
        where x.id = p.lj and not coalesce(x.cancelado, false) and x.status_transacao in ('realizado', 'conciliado')) end as juros
    from p
  ), linhas as (
    select pp.pago_em as data, 'parcela' as tipo, 'Parcela ' || pp.numero || '/' || coalesce(f.total_parcelas::text, '?') as item,
           coalesce(pp.principal, 0) as principal, coalesce(pp.juros, 0) as juros, 0::numeric as encargos,
           coalesce(pp.principal, 0) + coalesce(pp.juros, 0) as total, pp.conta, coalesce(pp.lp, pp.lj) as lancamento_id, pp.numero as ordem
    from pp
    union all
    select (e ->> 'data')::date, 'encargo', 'Encargo · ' || coalesce(e ->> 'papel', 'outro'), 0, 0, (e ->> 'valor')::numeric,
           (e ->> 'valor')::numeric, e ->> 'conta_nome', nullif(e ->> 'lancamento_id', '')::uuid, 100000
    from jsonb_array_elements(coalesce(v_sit -> 'encargos', '[]'::jsonb)) e
    where coalesce((e ->> 'paga')::boolean, false)
  )
  select coalesce(jsonb_agg(jsonb_build_object('data', data, 'tipo', tipo, 'item', item, 'principal', principal, 'juros', juros,
           'encargos', encargos, 'total', total, 'conta', conta, 'lancamento_id', lancamento_id) order by data nulls last, ordem), '[]'::jsonb),
         jsonb_build_object('qtde', count(*), 'principal', coalesce(sum(principal), 0), 'juros', coalesce(sum(juros), 0),
           'encargos', coalesce(sum(encargos), 0), 'total', coalesce(sum(total), 0))
    into v_pags, v_ptot
  from linhas;

  /* historico */
  with h as (
    select li.data as data, 'Liberação · ' || li.forma as evento, li.valor as valor, li.created_at as quando
    from public.financiamento_liberacoes li where li.financiamento_id = f.id
    union all
    select li.cancelado_em::date, 'Liberação cancelada · ' || coalesce(li.cancelado_motivo, ''), li.valor, li.cancelado_em
    from public.financiamento_liberacoes li where li.financiamento_id = f.id and li.cancelado_em is not null
    union all
    select (e ->> 'data')::date, 'Pagamento · ' || (e ->> 'item'), (e ->> 'total')::numeric, null::timestamptz
    from jsonb_array_elements(v_pags) e where e ->> 'tipo' = 'parcela'
    union all
    select (e ->> 'data')::date, (e ->> 'item'), (e ->> 'total')::numeric, null::timestamptz
    from jsonb_array_elements(v_pags) e where e ->> 'tipo' = 'encargo'
    union all
    select b.data, 'Baixa · ' || b.tipo, null::numeric, b.feita_em from public.financiamento_baixas b where b.financiamento_id = f.id
    union all
    select b.desfeita_em::date, 'Baixa desfeita · ' || b.tipo, null::numeric, b.desfeita_em
    from public.financiamento_baixas b where b.financiamento_id = f.id and b.desfeita_em is not null
    union all
    select d.criado_em::date, 'Documento · ' || d.especie || ' · ' || d.nome, null::numeric, d.criado_em
    from public.financiamento_documentos d where d.financiamento_id = f.id
    union all
    select d.cancelado_em::date, 'Documento cancelado · ' || d.especie || ' · ' || d.nome, null::numeric, d.cancelado_em
    from public.financiamento_documentos d where d.financiamento_id = f.id and d.cancelado_em is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('data', data, 'evento', evento, 'valor', valor) order by data desc nulls last, quando desc nulls last), '[]'::jsonb)
    into v_hist from h;

  /* a resolver */
  v_vqt := coalesce((v_sit #>> '{cartoes,vencido_qtde}')::int, 0);
  v_venc := coalesce((v_sit #>> '{cartoes,vencido}')::numeric, 0);
  if v_vqt > 0 then
    select (e ->> 'id')::uuid into v_1venc from jsonb_array_elements(v_sit -> 'parcelas') e
    where e ->> 'situacao' = 'vencida' order by (e ->> 'data_vencimento')::date limit 1;
    v_res := v_res || jsonb_build_object('chave', 'vencidas', 'tom', 'vencido', 'valor', v_venc, 'acao', 'buscar_pagamento', 'parcela_id', v_1venc,
      'texto', v_vqt || case when v_vqt = 1 then ' parcela vencida sem pagamento' else ' parcelas vencidas sem pagamento' end);
  end if;
  v_pend := coalesce(v_sit #> '{saldo,pendencias}', '[]'::jsonb);
  if v_pend ? 'sem_liberacao' then
    v_res := v_res || jsonb_build_object('chave', 'sem_liberacao', 'tom', 'dado', 'valor', null, 'acao', 'ver_liberacoes', 'texto', 'Nenhuma liberação gravada');
  end if;
  if v_aid > 0 then
    v_res := v_res || jsonb_build_object('chave', 'a_identificar', 'tom', 'dado', 'valor', v_aid, 'acao', 'ver_liberacoes', 'texto', 'Liberação sem entrada identificada na conta');
  end if;
  if v_pend ? 'liberado_maior_que_contratado' then
    v_res := v_res || jsonb_build_object('chave', 'liberado_maior', 'tom', 'dado', 'valor', null, 'acao', 'ver_liberacoes', 'texto', 'Liberado maior que o contratado');
  end if;
  if v_pend ? 'amortizado_maior_que_liberado' then
    v_res := v_res || jsonb_build_object('chave', 'amortizado_maior', 'tom', 'dado', 'valor', null, 'acao', 'ver_liberacoes', 'texto', 'Principal pago maior que o liberado');
  end if;
  if v_pend ? 'amortizacao_sem_lancamento' then
    v_res := v_res || jsonb_build_object('chave', 'amortizacao_sem_lancamento', 'tom', 'dado', 'valor', null, 'acao', 'ver_cronograma', 'texto', 'Parcela paga sem lançamento no Financeiro');
  end if;
  if v_pend ? 'sem_documento' then
    v_res := v_res || jsonb_build_object('chave', 'sem_cedula', 'tom', 'dado', 'valor', null, 'acao', 'anexar', 'texto', 'Cédula do contrato não anexada');
  end if;
  if v_pend ? 'aditivo_a_anexar' then
    v_res := v_res || jsonb_build_object('chave', 'sem_aditivo', 'tom', 'dado', 'valor', null, 'acao', 'anexar', 'texto', 'Aditivo da prorrogação não anexado');
  end if;
  if v_pend ? 'sem_numero_contrato' then
    v_res := v_res || jsonb_build_object('chave', 'sem_numero', 'tom', 'dado', 'valor', null, 'acao', 'editar', 'texto', 'Número do contrato a preencher');
  end if;
  if f.credor_id is not null and v_cred.doc is null then
    v_res := v_res || jsonb_build_object('chave', 'credor_sem_documento', 'tom', 'dado', 'valor', null, 'acao', 'editar', 'texto', 'Credor sem CNPJ/CPF no cadastro');
  end if;
  if f.sistema_amortizacao is null or f.carencia_ate is null or f.tipo_taxa is null then
    v_res := v_res || jsonb_build_object('chave', 'condicoes', 'tom', 'dado', 'valor', null, 'acao', 'editar', 'texto', 'Condições do contrato incompletas');
  end if;

  return jsonb_build_object(
    'financiamento_id', f.id,
    'condicoes', jsonb_build_object('taxa', v_tm, 'unidade', v_unid, 'taxa_aa', v_taa, 'sistema', f.sistema_amortizacao,
      'carencia_ate', f.carencia_ate, 'tipo_taxa', f.tipo_taxa, 'periodicidade', f.periodicidade),
    'contrato', jsonb_build_object('data_contrato', f.data_contrato, 'vencimento_final', v_vfinal, 'atividade', f.tipo_financiamento,
      'credor', v_cred.nome, 'credor_documento', v_cred.doc, 'primeira_liberacao', v_prim, 'ultima_liberacao', v_ult,
      'vencidas', v_vqt),
    'liberacoes', v_libs, 'liberacoes_total', v_ltot,
    'pagamentos', v_pags, 'pagamentos_total', v_ptot,
    'historico', v_hist,
    'a_resolver', v_res);
end
$$;

revoke all on function public.fn_contrato_tela(uuid, date) from public, anon;
grant execute on function public.fn_contrato_tela(uuid, date) to authenticated, service_role;
