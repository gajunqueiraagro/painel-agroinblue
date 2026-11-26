-- BOLETO-FATOR-VENC-01 (Gabriel 25/11/2026) — o FATOR DE VENCIMENTO vira data por UMA regra: o ciclo cuja data cai em
-- [data da LEITURA - 3000, + 5500] dias (FEBRABAN; o fator reiniciou em 1000 = 22/02/2025, antes 07/10/1997 + fator).
-- Os casos sao os de `src/lib/financeiro/fatorDeVencimento.casos.json`: aqui na `_fn_boleto_vencimento_do_fator` (migration
-- 20261028118750) e no vitest na `vencimentoDoFator` da tela (`fatorDeVencimento.test.ts` confere que a lista e este arquivo batem).
-- Roda como `postgres` e TERMINA EM RAISE: nada fica no banco. Sucesso = "OK ...". Sem dado de cliente (so' fatores e datas).
begin;
set local statement_timeout = '10s';
do $t$
declare r record; n int := 0; v date;
begin
  for r in select * from (values
    (1000, '2026-11-25', '2025-02-22'),
    (1611, '2026-11-25', '2026-10-26'),
    (9891, '2026-11-25', '2024-11-05'),
    (9921, '2026-11-25', '2024-12-05'),
    (9953, '2026-11-25', '2025-01-06'),
    (9983, '2026-11-25', '2025-02-05'),
    (9999, '2026-11-25', '2025-02-21'),
    (7700, '2026-11-25', '2018-11-06'),
    (7100, '2026-11-25', '2041-11-05'),
    (7300, '2026-11-25', null),
    (9891, '2024-10-01', '2024-11-05'),
    (1000, '2024-10-01', '2025-02-22'),
    (9891, '2049-01-01', '2049-06-27'),
    (1000, '2033-06-01', null),
    (500, '2026-11-25', null),
    (500, '1999-01-01', '1999-02-19'),
    (0, '2026-11-25', null)
  ) c(f, lido, esperado) loop
    v := public._fn_boleto_vencimento_do_fator(r.f, r.lido::date);
    if v is distinct from r.esperado::date then
      raise exception 'FATOR % lido em % -> % (esperado %)', r.f, r.lido, v, r.esperado;
    end if;
    n := n + 1;
  end loop;
  -- o normalizar usa a regra (codigo de barras SINTETICO com fator 9891, lido hoje): o ciclo de 07/10/1997, nao 2049
  if (public._fn_boleto_normalizar('34192989100000550001234567890123456789012345')->>'vencimento') is distinct from '2024-11-05' then
    raise exception 'normalizar com fator 9891 -> %', public._fn_boleto_normalizar('34192989100000550001234567890123456789012345');
  end if;
  raise exception 'OK BOLETO-FATOR-VENC: % casos iguais aos da tela + o normalizar', n;
end $t$;
rollback;
