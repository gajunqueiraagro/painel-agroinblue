-- P103 — fn_vg_gaveta (migration 20261028111953): a CONTA de cada lancamento da gaveta pelo lado. Como `authenticated` (admin);
-- TERMINA EM RAISE: nada fica. Agnaldo, NJ e Vera, out/26 (periodo jan–dez/26, criterio mes, todas as contas), toda folha dos dois lados.
--   G1 0 "Sem conta" quando o lancamento tem conta em QUALQUER dos dois lados (conta_bancaria_id ou conta_destino_id);
--   G2 a conta mostrada = a regra: saida → origem; entrada → DESTINO; transferencia (3-…) → "Origem → Destino";
--   G3 total = pago + aberto em toda folha.
--   MUTACAO (no proprio teste): a regra de antes (so' a ORIGEM) — G1 e G2 tem de falhar nas entradas.
-- Rodado em 25/10/2026: Agnaldo 35 folhas / 105 linhas (2 entradas), NJ 61 / 310 (15), Vera 28 / 81 (7) — G1 = G2 = G3 = 0;
-- a mutacao: G1 = G2 = 2, 15 e 7 (toda entrada).
set local statement_timeout = '600s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.vggc(k uuid, mut boolean default false) returns text language plpgsql as $f$
declare r record; g jsonb; n int := 0; nl int := 0; ne int := 0; e1 int := 0; e2 int := 0; e3 int := 0;
begin
  for r in
    select distinct x.lado, array[x.grupo, x.atividade, x.centro, x.subcentro] cam
      from public.fn_vg_partes(k, '2026-10-01', '2026-10-31', null, null, null, null, '2026-10-24', null, true) x
  loop
    n := n + 1;
    g := public.fn_vg_gaveta(k, '2026-01-01', '2026-12-31', '2026-10', r.lado, r.cam, 'mes', null, null, null, '2026-10-24', null, true, 1, 500);
    if (g ->> 'total')::numeric <> (g ->> 'pago')::numeric + (g ->> 'aberto')::numeric then e3 := e3 + 1; end if;
    with l as (
      select y ->> 'conta' mostrada, lv.tipo_operacao, lv.conta_bancaria_id, lv.conta_destino_id,
             coalesce(nullif(trim(co.nome_exibicao), ''), co.nome_conta) o, coalesce(nullif(trim(cd.nome_exibicao), ''), cd.nome_conta) d
        from jsonb_array_elements(g -> 'linhas') y
        join public.financeiro_lancamentos_v2 lv on lv.id = (y ->> 'lancamento_id')::uuid
        left join public.financeiro_contas_bancarias co on co.id = lv.conta_bancaria_id
        left join public.financeiro_contas_bancarias cd on cd.id = lv.conta_destino_id
    ), m as (
      select l.*, case when mut then coalesce(o, 'Sem conta') else mostrada end as conta,
             case when tipo_operacao like '3-%' then coalesce(o, 'Sem conta') || ' → ' || coalesce(d, 'Sem conta')
                  when r.lado = 'entrada' then coalesce(d, o, 'Sem conta') else coalesce(o, d, 'Sem conta') end as esperada
        from l
    )
    select nl + count(*), ne + count(*) filter (where r.lado = 'entrada'),
           e1 + count(*) filter (where conta = 'Sem conta' and (conta_bancaria_id is not null or conta_destino_id is not null)),
           e2 + count(*) filter (where conta is distinct from esperada)
      into nl, ne, e1, e2 from m;
  end loop;
  return format('%s folhas, %s linhas (%s entradas): G1 sem conta com conta=%s · G2 fora da regra=%s · G3 total<>pago+aberto=%s', n, nl, ne, e1, e2, e3);
end $f$;

do $$ begin raise exception 'P103 conta | Agnaldo: % | NJ: % | Vera: % | MUTACAO (so a origem) Agnaldo: % | NJ: % | Vera: %',
  pg_temp.vggc('a2d41cda-eb1e-4527-a6cf-a1b9663339e2'), pg_temp.vggc('f2d67cd4-24d0-456f-a079-a3281dcce7fd'),
  pg_temp.vggc('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
  pg_temp.vggc('a2d41cda-eb1e-4527-a6cf-a1b9663339e2', true), pg_temp.vggc('f2d67cd4-24d0-456f-a079-a3281dcce7fd', true),
  pg_temp.vggc('a1b2c3d4-e5f6-7890-abcd-ef1234567890', true); end $$;
