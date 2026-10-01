-- CONC-CANDIDATO-ENTRADA-01 — fn_candidatos_conciliacao le' a conta do lancamento PELA DIRECAO.
--
-- O gatilho fn_normalizar_conta_por_direcao (md5 273bc6b2) zera conta_bancaria_id em toda ENTRADA e guarda a conta
-- em conta_destino_id (correto, nao muda). A funcao filtrava `t.conta_bancaria_id = m.conta_bancaria_id`, entao
-- NENHUMA entrada era candidata na Estacao (medido em 01/10: 3.925 entradas vivas, 0 com conta_bancaria_id; 136 em
-- aberto, 109 de caixa fora da meta; as 26 vendas T Cortez, 278.835,67, nunca apareciam para o recebimento de 28/08).
--
-- A conta resolvida JA' EXISTE: `conta_efetiva_id` e' coluna GERADA (ALWAYS) —
--   CASE WHEN tipo_operacao LIKE '1-%' THEN COALESCE(conta_destino_id, conta_bancaria_id) ELSE conta_bancaria_id END
-- a mesma regra do gatilho. Nenhuma segunda regra de "qual e' a conta" nasce aqui.
-- Saida (2-) e transferencia (3-): conta_efetiva_id = conta_bancaria_id em 100% dos vivos — comportamento identico.
--
-- So' troca a igualdade de conta. Janela (+-20 / mesmo mes / vencidos), pontuacao, ordenacao, sinal e limite iguais.
-- Corpo INTEGRAL (pg_get_functiondef). prosrc md5 a6808484c8ba4ceb9d022f51a3e9561b -> f5095257cc1a17936a067a5775c4d521.
-- SECURITY INVOKER e search_path='' como estavam.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_candidatos_conciliacao(uuid,uuid,integer)'::regprocedure)
     <> 'a6808484c8ba4ceb9d022f51a3e9561b' THEN
    RAISE EXCEPTION 'CONC-CANDIDATO-ENTRADA-01: corpo de origem de fn_candidatos_conciliacao divergente — abortado';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_candidatos_conciliacao(p_cliente_id uuid, p_extrato_id uuid, p_limite integer DEFAULT 10)
 RETURNS TABLE(id uuid, descricao text, favorecido text, numero_documento text, data_referencia date, valor text, status text, ja_conciliado text, saldo text, delta_valor text, delta_dias integer, score integer, pre_marcado boolean, ambiguo boolean, indisponivel boolean, motivo_indisponivel text, transferencia_id uuid, contraparte_nome text, competencia date, vencimento date, pagamento date, vencido boolean, dias_atraso integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with mov as (
    select e.id, e.conta_bancaria_id, e.data_movimento, e.valor, e.descricao
      from public.extrato_bancario_v2 e
     where e.id = p_extrato_id
       and e.cliente_id = p_cliente_id
       and e.cancelado_em is null and e.ignorado_em is null
  ),
  base as (
    select
      t.id, t.descricao, f.nome as favorecido, t.numero_documento,
      coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia) as data_referencia,
      t.valor, t.status_transacao as status,
      t.data_competencia as competencia, t.data_vencimento as vencimento,
      t.data_pagamento as pagamento,
      t.transferencia_grupo_id as transferencia_id,
      coalesce(cob.aplicado, 0)                as ja_conciliado,
      abs(t.valor) - coalesce(cob.aplicado, 0) as saldo,
      abs(t.valor) - abs(m.valor)              as delta_valor,
      abs(coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia) - m.data_movimento)::int as delta_dias,
      m.descricao as mov_descricao, m.valor as mov_valor, m.data_movimento as mov_data
      from public.financeiro_lancamentos_v2 t
      left join public.financeiro_fornecedores f on f.id = t.favorecido_id
      cross join mov m
      left join (
        select c.lancamento_id, sum(c.valor_aplicado) as aplicado
          from public.conciliacao_bancaria_itens c
         where c.desfeito_em is null
         group by c.lancamento_id
      ) cob on cob.lancamento_id = t.id
     where t.cliente_id = p_cliente_id
       and t.cancelado is not true
       and coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia)
           between m.data_movimento - 60 and m.data_movimento + 60
       -- CONC-CANDIDATO-ENTRADA-01: a conta do lancamento PELA DIRECAO, na coluna gerada conta_efetiva_id
       -- (entrada: conta_destino_id; saida e transferencia: conta_bancaria_id) — a mesma regra do gatilho
       -- fn_normalizar_conta_por_direcao, que zera conta_bancaria_id em toda entrada.
       and t.conta_efetiva_id = m.conta_bancaria_id
       and ((m.valor < 0 and t.sinal = '-1') or (m.valor > 0 and t.sinal = '1'))
       and (
             coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia)
               between m.data_movimento - 20 and m.data_movimento + 20
          -- REGRA DO GABRIEL (31/08): o MESMO MES do movimento tambem entra —
          -- lancado dia 01 e pago dia 31 e caso comum, e +-20 nao alcanca.
          or date_trunc('month', coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia))
               = date_trunc('month', m.data_movimento::timestamp)
          or (t.data_vencimento is not null
              and t.data_vencimento < current_date
              and t.status_transacao in ('previsto', 'agendado', 'programado'))
           )
  ),
  pontuado as (
    select b.*,
      (case when abs(b.delta_valor) <= 0.01 then 70 else 0 end)
    + (case when b.delta_dias <= 3          then 20 else 0 end)
    + (case
         when coalesce(b.descricao, '') <> '' and coalesce(b.mov_descricao, '') <> ''
          and (position(lower(b.descricao) in lower(b.mov_descricao)) > 0
            or position(lower(b.mov_descricao) in lower(b.descricao)) > 0)
         then 10 else 0
       end) as score,
      (b.saldo <= 0) as indisponivel,
      (b.data_referencia not between b.mov_data - 20 and b.mov_data + 20
        and date_trunc('month', b.data_referencia) <> date_trunc('month', b.mov_data::timestamp)) as fora_da_janela,
      (b.vencimento is not null and b.vencimento < current_date
        and b.status in ('previsto', 'agendado', 'programado'))          as vencido,
      case when b.vencimento is not null and b.vencimento < current_date
           then (current_date - b.vencimento)::int end                   as dias_atraso
      from base b
  ),
  elegivel as (
    select p.*, row_number() over (order by p.score desc, p.delta_dias, p.id) as rn
      from pontuado p
     where not p.indisponivel and not p.fora_da_janela
  ),
  topo as (
    select max(score) filter (where rn = 1) as s1,
           max(score) filter (where rn = 2) as s2
      from elegivel
  ),
  guarda as (
    select (t.s1 is not null and t.s1 >= 70 and coalesce(t.s1 - t.s2, 99) <= 1) as ambiguo
      from topo t
  )
  select
    p.id, p.descricao, p.favorecido, p.numero_documento, p.data_referencia,
    round(p.valor, 2)::text, p.status,
    round(p.ja_conciliado, 2)::text, round(p.saldo, 2)::text,
    round(p.delta_valor, 2)::text, p.delta_dias, p.score,
    coalesce(e.rn = 1 and p.score >= 90 and not g.ambiguo, false) as pre_marcado,
    g.ambiguo, p.indisponivel,
    case when p.indisponivel
         then 'Lancamento ja conciliado integralmente — nada em aberto para vincular.'
    end,
    p.transferencia_id,
    (select cb.nome_conta
       from public.financeiro_lancamentos_v2 t2
       join public.financeiro_contas_bancarias cb on cb.id = t2.conta_bancaria_id
      where t2.transferencia_grupo_id = p.transferencia_id
        and t2.id <> p.id
        and t2.cancelado is not true
      limit 1),
    p.competencia, p.vencimento, p.pagamento,
    p.fora_da_janela and p.vencido,
    case when p.fora_da_janela and p.vencido then p.dias_atraso end
    from pontuado p
    left join elegivel e on e.id = p.id
    cross join guarda g
   where
     p.fora_da_janela and p.vencido
     or coalesce(e.rn, 1e9) <= p_limite
     or (p.indisponivel and not p.fora_da_janela)
   order by (p.fora_da_janela and p.vencido), p.indisponivel,
            p.score desc, p.delta_dias, p.id;
$function$;

DO $confere$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_candidatos_conciliacao(uuid,uuid,integer)'::regprocedure)
     <> 'f5095257cc1a17936a067a5775c4d521' THEN
    RAISE EXCEPTION 'CONC-CANDIDATO-ENTRADA-01: corpo de destino divergente — abortado';
  END IF;
END $confere$;

REVOKE ALL ON FUNCTION public.fn_candidatos_conciliacao(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_candidatos_conciliacao(uuid, uuid, integer) TO authenticated, service_role;
