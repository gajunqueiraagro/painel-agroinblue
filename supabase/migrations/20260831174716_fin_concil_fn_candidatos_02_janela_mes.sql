-- FIN-CONCIL-PORTAR-01 — o motor de candidatos, com a JANELA-MES do Gabriel.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831174716. VIGENTE.
-- (A 20260831174107 e' a primeira aplicacao, superada por esta; esta' versionada
-- ao lado para a lista local nao divergir da remota.)
--
-- Portado de AllinBlues/financas (20260817220000_vencido_e_candidato.sql, a
-- versao vigente la), lido via gh. TRES ADAPTACOES, todas medidas:
--
-- 1. ⚠⚠ O FILTRO DE SENTIDO — `sign(t.valor) = sign(m.valor)` do original
--    DEVOLVERIA ZERO CANDIDATOS aqui, em silencio. Medido: no Proto o `valor` do
--    lancamento e' MAGNITUDE e o sentido mora em `sinal` — 73.599 lancamentos
--    tem sinal '-1' com valor POSITIVO contra 3.928 com valor negativo; no
--    extrato o valor E' assinado (3.123 negativos, 497 positivos). Comparar
--    `sign` casaria quase todo lancamento como '+' contra quase todo movimento
--    como '-'. A regra — mesmo sentido — e' a mesma; muda de onde ela se le.
--
-- 2. A JANELA-MES, REGRA DO GABRIEL (31/08): alem de +-20 dias, o MESMO MES do
--    movimento tambem entra. "Lancado dia 01 e pago dia 31 e' caso comum", e a
--    janela de 20 dias nao alcanca as pontas do mes. A regra aparece DUAS vezes
--    e as duas tem de ser identicas — no filtro do pool e no `fora_da_janela`,
--    que decide quem disputa o topo. Divergirem faria um candidato entrar pelo
--    pool e ser tratado como forasteiro na hora de pontuar.
--
-- 3. `cb.nome_conta`, e nao `cb.nome`: `financeiro_contas_bancarias` nao tem
--    coluna `nome` (foi o 400 da primeira aplicacao). Adaptacao que escapou na
--    primeira leitura e que o erro do banco denunciou.
--
-- ⚠ OS VENCIDOS FICAM COMO ESTAO, ratificado: qualquer distancia, trio
-- previsto/agendado/programado. Vencida e nao paga e' candidata natural de
-- qualquer movimento — e `realizado` ja entra pela janela, sem filtro de status.
-- ⚠ `data_referencia` nao existe como coluna; derivada com o MESMO coalesce do
-- original (pagamento > vencimento > competencia).
-- ⚠ `favorecido` era TEXTO la; aqui e' `favorecido_id` -> LEFT join em
-- financeiro_fornecedores: favorecido ausente e' comum e nao pode sumir com o
-- candidato.
--
-- ⚠ OS COMENTARIOS-DOUTRINA DO CORPO FICARAM AQUI, e nao no `prosrc`: o corpo
-- aplicado veio enxuto, e versionar e' registrar o que esta' no banco. A razao
-- de cada regra sobrevive neste cabecalho.
--
-- ⚠ CORPO CONFERIDO PELO ORACULO — md5 3df76e6410ac60c575f1b1338aef7294,
-- 5113 caracteres, byte a byte igual ao aplicado.

drop function if exists public.fn_candidatos_conciliacao(uuid, uuid, integer);

create function public.fn_candidatos_conciliacao(
  p_cliente_id uuid, p_extrato_id uuid, p_limite integer default 10
) returns table (
  id uuid, descricao text, favorecido text, numero_documento text,
  data_referencia date, valor text, status text,
  ja_conciliado text, saldo text, delta_valor text, delta_dias integer,
  score integer, pre_marcado boolean, ambiguo boolean,
  indisponivel boolean, motivo_indisponivel text,
  transferencia_id uuid, contraparte_nome text,
  competencia date, vencimento date, pagamento date,
  vencido boolean, dias_atraso integer
)
language sql stable security invoker set search_path = ''
as $function$
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
      left join lateral (
        select sum(c.valor_aplicado) as aplicado
          from public.conciliacao_bancaria_itens c
         where c.lancamento_id = t.id and c.desfeito_em is null
      ) cob on true
     where t.cliente_id = p_cliente_id
       and t.cancelado is not true
       and coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia) is not null
       and t.conta_bancaria_id = m.conta_bancaria_id
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

revoke all on function public.fn_candidatos_conciliacao(uuid, uuid, integer) from public, anon;
grant execute on function public.fn_candidatos_conciliacao(uuid, uuid, integer) to authenticated;
