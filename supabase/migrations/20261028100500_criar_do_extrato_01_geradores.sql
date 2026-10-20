-- CRIAR-DO-EXTRATO-01 (Gabriel, 20/10/2026) — PARTE B, o banco: todo lançamento nasce com vencimento.
--
-- Três geradores do banco gravavam `financeiro_lancamentos_v2` sem vencimento (FASE 0: 16 vivos sem vencimento, todos realizados):
--   · _fn_financiamento_salvar_cabecalho_exec — a CAPTAÇÃO do contrato (tela de contrato). Só a linha do vencimento:
--       vencimento = data do contrato (= o pagamento da captação), no INSERT e no UPDATE que a reativa.
--   · fn_classificacao_split_substituir (mesa_split) — copiava COALESCE(proposta, consolidado), e o consolidado podia não ter:
--       agora cai no PAGAMENTO (a data do extrato vinculado) e, sem ele, na competência.
--   · fn_promover_staging (mesa_excel) — não citava o vencimento (a staging não tem a coluna):
--       vencimento = pagamento ou, sem pagamento, competência.
--
-- COMO: cada função é reescrita a partir da PRÓPRIA definição viva (pg_get_functiondef), trocando só o trecho do vencimento.
-- Cada troca exige achar o trecho exatamente UMA vez (senão aborta e nada muda); se a troca já está lá, pula (reaplicável).
-- `CREATE OR REPLACE` mantém dono, SECURITY DEFINER, search_path e os GRANTs.

create or replace function pg_temp.trocar(p_fn regprocedure, p_trocas text[][]) returns void
language plpgsql as $f$
declare d text := pg_get_functiondef(p_fn); i int; a text; b text; n int;
begin
  for i in 1 .. array_length(p_trocas, 1) loop
    a := p_trocas[i][1]; b := p_trocas[i][2];
    if position(b in d) > 0 then continue; end if;          -- já trocado
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    if n <> 1 then
      raise exception 'CRIAR-DO-EXTRATO-01: % — trecho % achado % vez(es) (esperado 1)', p_fn, i, n;
    end if;
    d := replace(d, a, b);
  end loop;
  execute d;
end $f$;

select pg_temp.trocar('public._fn_financiamento_salvar_cabecalho_exec(uuid, jsonb)'::regprocedure, array[
  array['set data_competencia = n.data_contrato, data_pagamento = n.data_contrato,',
        'set data_competencia = n.data_contrato, data_pagamento = n.data_contrato, data_vencimento = n.data_contrato,'],
  array['data_competencia, data_pagamento, ano_mes, origem_lancamento, origem_tipo',
        'data_competencia, data_pagamento, data_vencimento, ano_mes, origem_lancamento, origem_tipo'],
  array['n.data_contrato, to_char(n.data_contrato, ''YYYY-MM''), ''financiamento''',
        'n.data_contrato, n.data_contrato, to_char(n.data_contrato, ''YYYY-MM''), ''financiamento''']
]);

select pg_temp.trocar(p.oid::regprocedure, array[
  array['COALESCE(NULLIF(v_s.update_proposto->>''data_vencimento'','''')::date, v_lan.data_vencimento),',
        'COALESCE(NULLIF(v_s.update_proposto->>''data_vencimento'','''')::date, v_lan.data_vencimento, v_ext.data_movimento, v_comp),']
])
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname = 'fn_classificacao_split_substituir';

select pg_temp.trocar(p.oid::regprocedure, array[
  array['ano_mes, data_pagamento, data_competencia,',
        'ano_mes, data_pagamento, data_competencia, data_vencimento,'],
  array['v_row.ano_mes, v_row.data_pagamento, COALESCE(v_row.data_competencia, v_row.data_pagamento),',
        'v_row.ano_mes, v_row.data_pagamento, COALESCE(v_row.data_competencia, v_row.data_pagamento), COALESCE(v_row.data_pagamento, v_row.data_competencia),']
])
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname = 'fn_promover_staging';
