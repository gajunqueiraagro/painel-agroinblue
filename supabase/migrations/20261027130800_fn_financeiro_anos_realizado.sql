-- PERF-PLANEJAMENTO-02b (22/09/2026): anos com movimento realizado, para o seletor de ano
-- do Planejamento Financeiro.
--
-- Aplicada no proto em 22/09/2026 (ledger 20260922174951). md5(prosrc) = 568fb005d3216cc5b26693e09447d9ad.
--
-- ⚠ O DEFEITO QUE ELA RESOLVE: `FinanceiroCaixaTab` montava a lista de anos varrendo o array
--   `lancamentos` em memoria (anosDisponiveis), e esse array so existe porque o
--   `useFinanceiro()` da tela era chamado SEM ano — 26 paginas, ~25 mil linhas de `select *`,
--   ~24 s medidos em 22/09 antes de a grade da META montar. O seletor era o unico consumidor
--   que precisava de TODOS os anos; todo o resto usa so o ano selecionado.
--
-- ⚠ POR QUE NAO REUSAR `get_anos_financeiro_v2`: ela filtra apenas
--   `status_transacao IS DISTINCT FROM 'cancelado'` e e' por CLIENTE, entao devolve tambem
--   previsto/programado. Medido na NJ: 25 anos, ate' 2040 — a cauda de parcelas de
--   financiamento do Administrativo. O seletor de hoje mostra 11 (2016..2026) porque exige
--   `status_transacao = 'realizado'`. `get_anos_lancamentos` e' outra regra ainda
--   (competencia, por `data_competencia`). Nenhuma das duas reproduz a tela; as duas ficam
--   INTOCADAS.
--
-- ⚠ AS DUAS COLUNAS, DE PROPOSITO. A tela considera ano de `data_pagamento` E de `ano_mes`
--   (FinanceiroCaixaTab:241-254). Medido em 22/09 que hoje os dois conjuntos coincidem
--   (2016..2026, zero nulos nas duas colunas nas linhas do filtro), mas a uniao preserva a
--   regra escrita na tela: um ano que so' exista numa das colunas nao some.
--
-- ⚠ `security invoker` de proposito: e' leitura, e a RLS por tenant de
--   `financeiro_lancamentos_v2` continua valendo para quem chama.
--
-- PROVA (22/09, canal de escrita): NJ + {Faz. Pureza, Administrativo} devolve
--   {2016..2026} — o MESMO conjunto que a varredura em memoria produzia.

create or replace function public.fn_financeiro_anos_realizado(
  p_cliente uuid,
  p_fazenda_ids uuid[]
)
returns int[]
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(ano order by ano), '{}'::int[])
  from (
    select distinct left(l.data_pagamento::text, 4)::int as ano
      from public.financeiro_lancamentos_v2 l
     where l.cliente_id = p_cliente
       and l.fazenda_id = any(p_fazenda_ids)
       and l.cenario = 'realizado'
       and l.status_transacao = 'realizado'
       and l.cancelado = false
       and l.sem_movimentacao_caixa = false
       and l.data_pagamento is not null
    union
    select distinct left(l.ano_mes::text, 4)::int
      from public.financeiro_lancamentos_v2 l
     where l.cliente_id = p_cliente
       and l.fazenda_id = any(p_fazenda_ids)
       and l.cenario = 'realizado'
       and l.status_transacao = 'realizado'
       and l.cancelado = false
       and l.sem_movimentacao_caixa = false
       and l.ano_mes is not null
  ) u;
$$;

revoke all on function public.fn_financeiro_anos_realizado(uuid, uuid[]) from public;
revoke all on function public.fn_financeiro_anos_realizado(uuid, uuid[]) from anon;
grant execute on function public.fn_financeiro_anos_realizado(uuid, uuid[]) to authenticated;
