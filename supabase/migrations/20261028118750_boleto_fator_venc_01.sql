-- BOLETO-FATOR-VENC-01 (Gabriel 25/11/2026: D1 a · D2 a · D3 a) — o FATOR DE VENCIMENTO no ciclo certo.
-- O fator reiniciou em 22/02/2025 (fator 1000); antes, a base era 07/10/1997. O mesmo fator serve aos dois ciclos (9891 = 05/11/2024 e
-- 27/06/2049) e o `_fn_boleto_normalizar` (118100) usava sempre o novo: boletos de nov/2024–fev/2025 gravaram 2049 e "nenhum
-- lançamento parecido" (a busca olha o vencimento ±5).
-- 1. `_fn_boleto_vencimento_do_fator(fator, lido_em)`: a regra FEBRABAN — o ciclo cuja data cai em [lido_em − 3000, + 5500] dias
--    (D1 a: a data da LEITURA). Janela de 8.501 dias, ciclo de 9.000: no máximo uma data; nenhuma = null (nunca inventada). A MESMA da
--    tela (`vencimentoDoFator`, linhaDigitavel.ts), pelos casos de `fatorDeVencimento.casos.json` (`supabase/tests/boleto_fator_venc_test.sql`).
-- 2. `_fn_boleto_normalizar`: remendo guardado por md5 (2 âncoras) — o vencimento pela regra, lido hoje; IMMUTABLE → STABLE (usa
--    current_date; nenhum índice nem coluna gerada a usa: conferido).
-- 3. `boleto_trilha`: a ação nova 'vencimento_corrigido'.
-- 4. Os gravados com o vencimento fora do ciclo da LEITURA (`criado_em`) passam a ter o certo, cada um com a linha na trilha
--    (antes/depois). O vínculo com lançamento NÃO muda (D3 a); ligar segue gesto da tela. Esperados: 4 (FASE 0, 25/11); outro número =
--    nada gravado.
-- D2 a: o vencimento ESCRITO no PDF fica para a 2ª fatia (leitor novo). Sem dado de cliente neste arquivo.
set local lock_timeout = '2s';

create or replace function public._fn_boleto_vencimento_do_fator(p_fator int, p_lido_em date) returns date
language sql immutable set search_path = public as $$
  select x.d
    from (select date '1997-10-07' + p_fator as d
          union all
          select date '2025-02-22' + (p_fator - 1000) + 9000 * k from generate_series(0, 3) k where p_fator >= 1000) x
   where p_fator between 1 and 9999 and p_lido_em is not null
     and x.d between p_lido_em - 3000 and p_lido_em + 5500
   order by x.d
   limit 1
$$;
revoke all on function public._fn_boleto_vencimento_do_fator(int, date) from public, anon, authenticated;
grant execute on function public._fn_boleto_vencimento_do_fator(int, date) to service_role;

do $p$
declare
  v text := pg_get_functiondef('public._fn_boleto_normalizar(text)'::regprocedure);
  a1 text := $a$v_venc := case when v_fator > 0 then date '2025-02-22' + (v_fator - 1000) end;$a$;
  b1 text := $a$v_venc := public._fn_boleto_vencimento_do_fator(v_fator, current_date); -- BOLETO-FATOR-VENC-01: o ciclo pela data da leitura$a$;
  a2 text := E'\n IMMUTABLE\n';
  b2 text := E'\n STABLE\n';
begin
  if md5(v) <> '42db976bde3f09c291be84026fb5cc3a' then
    raise exception 'BOLETO-FATOR-VENC-01: o corpo vivo do _fn_boleto_normalizar mudou (md5 %); nada foi gravado', md5(v);
  end if;
  if (length(v) - length(replace(v, a1, ''))) / length(a1) <> 1 or (length(v) - length(replace(v, a2, ''))) / length(a2) <> 1 then
    raise exception 'BOLETO-FATOR-VENC-01: âncora do _fn_boleto_normalizar não casa 1 vez; nada foi gravado';
  end if;
  execute replace(replace(v, a1, b1), a2, b2);
end $p$;

alter table public.boleto_trilha drop constraint boleto_trilha_acao_check;
alter table public.boleto_trilha add constraint boleto_trilha_acao_check check (acao = any (array['entrou', 'entrou_de_novo', 'ligado',
  'desligado', 'substituido', 'sem_par', 'descartado', 'reaberto', 'vencimento_corrigido']));

do $b$
declare r record; n int := 0;
begin
  for r in
    select b.id, b.cliente_id, b.vencimento, s.fator, s.lido_em, public._fn_boleto_vencimento_do_fator(s.fator, s.lido_em) as certo
      from public.boletos b
      cross join lateral (select substr(b.codigo_barras, 6, 4)::int as fator, (b.criado_em at time zone 'America/Sao_Paulo')::date as lido_em) s
     where b.tipo = 'bancario' and b.codigo_barras ~ '^[0-9]{44}$' and substr(b.codigo_barras, 6, 4)::int > 0
       and b.vencimento is distinct from public._fn_boleto_vencimento_do_fator(s.fator, s.lido_em)
     order by b.criado_em
     for update of b
  loop
    update public.boletos set vencimento = r.certo, alterado_em = now() where id = r.id;
    insert into public.boleto_trilha (cliente_id, boleto_id, acao, origem, antes, depois, motivo)
    values (r.cliente_id, r.id, 'vencimento_corrigido', 'lote',
            jsonb_build_object('vencimento', r.vencimento),
            jsonb_build_object('vencimento', r.certo, 'fator', r.fator, 'lido_em', r.lido_em),
            'BOLETO-FATOR-VENC-01: o fator é do ciclo de 07/10/1997 (janela FEBRABAN pela data da leitura).');
    n := n + 1;
  end loop;
  if n <> 4 then
    raise exception 'BOLETO-FATOR-VENC-01: esperava 4 boletos com o vencimento fora do ciclo, achei %; nada foi gravado', n;
  end if;
end $b$;
