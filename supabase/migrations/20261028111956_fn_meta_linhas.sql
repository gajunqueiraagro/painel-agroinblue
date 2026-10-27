-- P109 (FIN-META-01, Gabriel 26/10/2026) — a META passa a ter UM dono no banco: fn_meta_linhas(cliente, ano, regime).
-- Uma linha por (fazenda, conta do plano, mes) e origem. Quem le' meta le' daqui (Visao Geral, DRE, tela de meta, PC-100, Resumo
-- Executivo, Fechamento, historico de indicador); o calculo do front morre.
--   ORIGENS (a regra de juntar e' UMA: tudo SOMA no mesmo subcentro/mes — a do DRE e a do composeGridMetaConsolidado):
--   · 'digitada'            — planejamento_financeiro (cenario meta), pela plano_conta_id; e os PROJETOS de investimento
--                             (meta_projetos_investimento, nao cancelados, jan..dez), resolvidos pela MESMA regra do gatilho da meta
--                             (macro, grupo, centro e subcentro; ativo; global ou do cliente; so' casamento unico — o que nao resolve
--                             sai com plano_conta_id nulo e o detalhe dizendo, nunca some).
--   · 'calculada:nutricao' | 'calculada:comercial' | 'calculada:frete' | 'calculada:receita' | 'calculada:reposicao'
--                           — fn_meta_calculada_pecuaria(cliente, ano, regime), no subcentro do plano padrao pela ordem_exibicao.
--   · 'calculada:receita' com detalhe 'adiantamento de boitel' — so' em CAIXA, pela data do adiantamento (5010; regra do TS da tela
--                             de meta: venda boitel com possuiAdiantamento, dataAdiantamento e valorTotalAntecipado > 0).
--   · 'calculada:financiamento' — so' em CAIXA: parcelas nao canceladas pelo vencimento; principal na conta da parcela do
--                             financiamento, juros em 7010/12010 pelo tipo (regra do TS). Em competencia fica FORA: o DRE nao le^
--                             parcela de financiamento.
--   · 'espelho'             — o espelho manual da v2 (movimentacao_rebanho) so' na DEDUCAO (no DRE ele continua ali); caixa pelo
--                             vencimento, competencia pela competencia. O DRE NAO o le' daqui (ele ja' le' a v2 por conta propria).
--   Ponto de extensao: uma fonte nova (ex.: 'calculada:lavoura') entra como mais um ramo, sem mudar a assinatura.
--   `origem_id`: o id da linha na fonte (a meta digitada, o projeto, o lancamento zootecnico, a parcela, o lancamento v2); nulo na
--   calculada do rebanho. SECURITY INVOKER: a RLS vale (quem nao ve^ o cliente nao ve^ linha). meta_versoes: nenhum leitor usa hoje; nao entra.
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public.fn_meta_linhas(p_cliente uuid, p_ano integer, p_regime text)
RETURNS TABLE(fazenda_id uuid, plano_conta_id uuid, mes integer, valor numeric, origem text, origem_detalhe text, origem_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF p_cliente IS NULL OR p_ano IS NULL THEN
    RAISE EXCEPTION 'Cliente e ano são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF p_regime IS NULL OR p_regime NOT IN ('caixa', 'competencia') THEN
    RAISE EXCEPTION 'Regime inválido: use caixa ou competencia.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  -- a digitada
  SELECT pf.fazenda_id, pf.plano_conta_id, pf.mes, pf.valor_planejado::numeric, 'digitada'::text, 'meta digitada'::text, pf.id
    FROM public.planejamento_financeiro pf
   WHERE pf.cliente_id = p_cliente AND pf.cenario = 'meta' AND pf.ano = p_ano
  UNION ALL
  -- os projetos de investimento (digitados noutra tabela)
  SELECT m.fazenda_id, r.id, x.mes, abs(x.v),
         'digitada'::text,
         CASE WHEN r.id IS NULL THEN 'projeto de investimento sem conta única no plano' ELSE 'projeto de investimento' END, m.id
    FROM public.meta_projetos_investimento m
    LEFT JOIN LATERAL (SELECT min(pc.id::text)::uuid AS id FROM public.financeiro_plano_contas pc
                        WHERE pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id = m.cliente_id)
                          AND pc.macro_custo = m.macro_custo AND pc.grupo_custo = m.grupo_custo
                          AND pc.centro_custo = m.centro_custo AND pc.subcentro = m.subcentro
                       HAVING count(*) = 1) r ON true
   CROSS JOIN LATERAL (VALUES (1, m.jan), (2, m.fev), (3, m.mar), (4, m.abr), (5, m.mai), (6, m.jun),
                              (7, m.jul), (8, m.ago), (9, m."set"), (10, m."out"), (11, m.nov), (12, m.dez)) AS x(mes, v)
   WHERE m.cliente_id = p_cliente AND m.ano = p_ano AND m.status IS DISTINCT FROM 'cancelado' AND coalesce(x.v, 0) <> 0
  UNION ALL
  -- a calculada (o calculo e' o da fn_meta_calculada_pecuaria; aqui so' a conta do plano e o nome da origem)
  SELECT c.fazenda_id, pc.id, c.mes, c.valor,
         CASE WHEN c.ordem = 8045 THEN 'calculada:nutricao' WHEN c.ordem = 5030 THEN 'calculada:comercial'
              WHEN c.ordem = 8140 THEN 'calculada:frete' WHEN c.ordem BETWEEN 15000 AND 15999 THEN 'calculada:reposicao'
              ELSE 'calculada:receita' END,
         CASE WHEN c.ordem = 8045 THEN 'parâmetros de nutrição × rebanho meta'
              WHEN c.ordem = 5030 THEN 'custo comercial × cabeças abatidas e vendidas'
              WHEN c.ordem = 8140 THEN 'frete × cabeças transferidas'
              WHEN c.ordem BETWEEN 15000 AND 15999 THEN CASE WHEN p_regime = 'caixa' THEN 'compras meta, pelo pagamento' ELSE 'compras meta' END
              ELSE CASE WHEN p_regime = 'caixa' THEN 'abates e vendas meta, pelo recebimento' ELSE 'abates e vendas meta' END END,
         NULL::uuid
    FROM public.fn_meta_calculada_pecuaria(p_cliente, p_ano, p_regime) c
    JOIN public.financeiro_plano_contas pc ON pc.ordem_exibicao = c.ordem AND pc.escopo_negocio = 'pecuaria' AND pc.cliente_id IS NULL AND pc.ativo
  UNION ALL
  -- o adiantamento de boitel (so' no caixa)
  SELECT l.fazenda_id, pc.id, substr(l.detalhes_snapshot -> 'boitelSnapshot' ->> 'dataAdiantamento', 6, 2)::int,
         (l.detalhes_snapshot -> 'boitelSnapshot' ->> 'valorTotalAntecipado')::numeric,
         'calculada:receita'::text, 'adiantamento de boitel'::text, l.id
    FROM public.lancamentos l
    JOIN public.fazendas f ON f.id = l.fazenda_id AND f.cliente_id = p_cliente
    JOIN public.financeiro_plano_contas pc ON pc.ordem_exibicao = 5010 AND pc.escopo_negocio = 'pecuaria' AND pc.cliente_id IS NULL AND pc.ativo
   WHERE p_regime = 'caixa'
     AND l.cliente_id = p_cliente AND l.cenario = 'meta' AND l.cancelado = false AND l.tipo = 'venda' AND l.valor_total IS NOT NULL
     AND (l.boitel_lote_id IS NOT NULL OR jsonb_typeof(l.detalhes_snapshot -> 'boitelSnapshot') = 'object')
     AND (l.detalhes_snapshot -> 'boitelSnapshot' ->> 'possuiAdiantamento') = 'true'
     AND jsonb_typeof(l.detalhes_snapshot -> 'boitelSnapshot' -> 'valorTotalAntecipado') = 'number'
     AND (l.detalhes_snapshot -> 'boitelSnapshot' ->> 'valorTotalAntecipado')::numeric > 0
     AND jsonb_typeof(l.detalhes_snapshot -> 'boitelSnapshot' -> 'dataAdiantamento') = 'string'
     AND substr(l.detalhes_snapshot -> 'boitelSnapshot' ->> 'dataAdiantamento', 1, 7) ~ '[0-9]{4}-(0[1-9]|1[0-2])'
     AND left(l.detalhes_snapshot -> 'boitelSnapshot' ->> 'dataAdiantamento', 4) = p_ano::text
  UNION ALL
  -- o financiamento (so' no caixa): principal e juros
  SELECT fi.fazenda_id, pc.id, extract(month FROM fp.data_vencimento)::int, x.v, 'calculada:financiamento'::text, x.d, fp.id
    FROM public.financiamento_parcelas fp
    JOIN public.financiamentos fi ON fi.id = fp.financiamento_id AND fi.cliente_id = p_cliente
   CROSS JOIN LATERAL (VALUES (fi.plano_conta_parcela_id, abs(coalesce(fp.valor_principal, 0)), 'parcela do financiamento: principal'),
                              ((SELECT j.id FROM public.financeiro_plano_contas j
                                 WHERE j.cliente_id IS NULL AND j.ativo AND j.ordem_exibicao = CASE WHEN fi.tipo_financiamento = 'agricultura' THEN 12010 ELSE 7010 END),
                               abs(coalesce(fp.valor_juros, 0)), 'parcela do financiamento: juros')) AS x(conta, v, d)
    JOIN public.financeiro_plano_contas pc ON pc.id = x.conta
   WHERE p_regime = 'caixa' AND fp.status IS DISTINCT FROM 'cancelado' AND x.v > 0
     AND fp.data_vencimento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
  UNION ALL
  -- o espelho da v2 so' na deducao
  SELECT l.fazenda_id, l.plano_conta_id,
         extract(month FROM CASE WHEN p_regime = 'caixa' THEN coalesce(l.data_vencimento, l.data_competencia) ELSE l.data_competencia END)::int,
         abs(l.valor), 'espelho'::text, 'espelho da v2 (dedução)'::text, l.id
    FROM public.financeiro_lancamentos_v2 l
    JOIN public.financeiro_plano_contas pc ON pc.id = l.plano_conta_id
   WHERE l.cliente_id = p_cliente AND l.cenario = 'meta' AND coalesce(l.cancelado, false) = false
     AND l.origem_lancamento = 'movimentacao_rebanho' AND pc.bloco_dre = 'deducao'
     AND extract(year FROM CASE WHEN p_regime = 'caixa' THEN coalesce(l.data_vencimento, l.data_competencia) ELSE l.data_competencia END) = p_ano;
END $function$;

REVOKE ALL ON FUNCTION public.fn_meta_linhas(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meta_linhas(uuid, integer, text) TO authenticated;

COMMENT ON FUNCTION public.fn_meta_linhas(uuid, integer, text) IS
  'P109 FIN-META-01: a meta por (fazenda, plano_conta_id, mes) e origem, no regime pedido — o dono unico da meta (digitada, projetos, calculada do rebanho, adiantamento de boitel e financiamento no caixa, espelho da deducao).';
