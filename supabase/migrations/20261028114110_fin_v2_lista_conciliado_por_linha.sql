-- FIN-LISTA-SEM-CAIXA-FILTROS-01 (Gabriel 04/11/2026 11:50, "BUG LISTA") — a lista de Lançamentos com FILTRO DE TIPO estourava os 8 s do
-- `authenticated` (NJ, Global, 2021–2026: 9,7 s com Tipo, 0,3 s sem ele). A tela ficava com a página do recorte ANTERIOR sob os filtros
-- novos ("Saídas" mostrando entradas) e o rodapé dizia "Não foi possível carregar os lançamentos agora" — o filtro não era ignorado, a
-- resposta nunca chegava.
--
-- CAUSA: o `left join conc` (o CTE dos lançamentos com vínculo vivo de extrato). O Tipo entra duas vezes no `where` (`tipo_operacao = X`
-- para o índice e `btrim(coalesce(tipo_operacao, '')) = X`, a regra da tela); a estimativa de linhas cai para 1 (são 24.924) e o
-- planejador troca o hash por um laço aninhado contra os 3.288 conciliados: 82 milhões de comparações.
--
-- CONSERTO EQUIVALENTE (nenhuma regra muda): `conciliado` passa a ser um `exists` por linha no índice parcial
-- `idx_concil_itens_lancamento_ativo` (0,34 s no mesmo recorte), que não depende da estimativa. O CTE `conc` sai. A prova de identidade
-- (a saída inteira, md5, antes × depois, nos 3 modos do sem caixa × os filtros da barra) está no relatório do item.
--
-- PATCH guardado por md5 da definição viva (conferida em 04/11): se ela mudou, NADA é aplicado. Cada trecho trocado casa uma vez só.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)'::regprocedure);
  v_novo text;
  r record;
begin
  if md5(v_def) <> '62a73d4c897cb3b4e4dc5e00f5a657e1' then
    raise exception 'FIN-LISTA-SEM-CAIXA-FILTROS-01: fn_fin_v2_lista_pagina mudou desde a prévia';
  end if;
  v_novo := v_def;
  for r in select * from (values
    (1, E'  with conc as (   -- `useLancamentosConciliados`: vinculo vivo com extrato do cliente\n    select distinct ci.lancamento_id\n      from public.conciliacao_bancaria_itens ci\n      join public.extrato_bancario_v2 e on e.id = ci.extrato_id\n     where ci.desfeito_em is null and e.cliente_id = p_cliente and ci.lancamento_id is not null\n  ),\n  docs as (',
        E'  with docs as ('),
    (2, '(c.lancamento_id is not null) as conciliado,',
        E'-- `useLancamentosConciliados`: vinculo vivo com extrato do cliente, POR LINHA (FIN-LISTA-SEM-CAIXA-FILTROS-01: o join com o\n           -- conjunto dos conciliados virava laco aninhado quando a estimativa caia, ex. com o filtro de tipo)\n           exists (select 1 from public.conciliacao_bancaria_itens ci join public.extrato_bancario_v2 e on e.id = ci.extrato_id\n                    where ci.lancamento_id = l.id and ci.desfeito_em is null and e.cliente_id = p_cliente) as conciliado,'),
    (3, E'      left join conc c on c.lancamento_id = l.id\n', '')
  ) t(n, de, para) loop
    if (length(v_novo) - length(replace(v_novo, r.de, ''))) / length(r.de) <> 1 then
      raise exception 'FIN-LISTA-SEM-CAIXA-FILTROS-01: o trecho % nao casa uma vez so''', r.n;
    end if;
    v_novo := replace(v_novo, r.de, r.para);
  end loop;
  execute v_novo;
end $patch$;
