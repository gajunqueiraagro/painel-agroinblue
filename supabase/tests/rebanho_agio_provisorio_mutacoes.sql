-- REBANHO-AGIO-PROVISORIO-01 — mutações do teste `rebanho_agio_provisorio_test.sql` (20261028115600 APLICADA).
-- Roda como postgres. A função de teste abaixo é cópia byte a byte da do _test.sql (gerada dele).
-- Cada mutação desfaz UM pedaço da regra dentro de um bloco com exceção (subtransação): o teste roda, o bloco sempre termina em exceção e
-- desfaz a mutação e o fixture. M0 (sem mutação) tem de passar; M1–M3 têm de cair no "T… falhou" esperado. No fim, as 4 funções conferem
-- pelo md5 de depois da 115600 (a mutação não ficou). Termina em RAISE 'OK…'.
--   M1 a produção encadeada volta a levar a troca de categoria (sem o "− ágio")           → T1
--   M2 o ágio vai na categoria de ORIGEM, não na de destino                                → T1
--   M3 o DRE volta ao meio de uma janela só (tudo ao preço do fim), sem a soma dos meses    → T3
set local statement_timeout = '60s';
set local lock_timeout = '2s';

create function pg_temp.teste_agio_prov() returns text language plpgsql as $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; g jsonb; d jsonb; l jsonb; s numeric := 0; m text;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  insert into public.valor_rebanho_fechamento_itens (fazenda_id, cliente_id, ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria)
  values (c_faz, c_cli, '2030-12', 'desmama_m', 100, 200, 14, 280000), (c_faz, c_cli, '2031-02', 'desmama_m', 100, 240, 14, 336000),
         (c_faz, c_cli, '2031-03', 'garrotes', 100, 260, 12, 312000);
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status, valor_total, cabecas)
  values (c_faz, c_cli, '2030-12', 'validado', 280000, 100), (c_faz, c_cli, '2031-02', 'validado', 336000, 100),
         (c_faz, c_cli, '2031-03', 'validado', 312000, 100);
  insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, categoria_destino, quantidade, peso_medio_kg, cenario, status_operacional)
  values (c_faz, c_cli, '2031-03-15', 'reclassificacao', 'desmama_m', 'garrotes', 100, 250, 'realizado', 'realizado');
  insert into public.zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_codigo, categoria_nome, ordem_exibicao,
                                        saldo_inicial, saldo_final, peso_medio_inicial, peso_medio_final)
  values (c_faz, c_cli, 2031, 1, '2031-01', 'realizado', 'desmama_m', 'Desmama M', 2, 100, 100, 200, 220),
         (c_faz, c_cli, 2031, 2, '2031-02', 'realizado', 'desmama_m', 'Desmama M', 2, 100, 100, 220, 240),
         (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'desmama_m', 'Desmama M', 2, 100, 0, 240, null),
         (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'garrotes', 'Garrotes', 3, 0, 100, null, 260);

  -- T1 o mês da troca (modal): o ágio no DESTINO; a produção sem ele; o mercado do mês = a troca
  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-03', '2031-03');
  select x into g from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'garrotes';
  select x into d from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'desmama_m';
  if (g->>'troca_categoria')::numeric is distinct from -50000.00 or (g->>'agio')::numeric is distinct from -50000.00
     or (d->>'troca_categoria')::numeric is distinct from 0 then
    raise exception 'T1 falhou: troca garrotes % (agio %), desmama % (esperado -50000, -50000, 0)', g->>'troca_categoria', g->>'agio', d->>'troca_categoria'; end if;
  if (r->'total'->>'vpb')::numeric is distinct from 26000.00 or (r->'total'->>'efeito')::numeric is distinct from -50000.00
     or (r->'total'->>'troca_categoria')::numeric is distinct from -50000.00 then
    raise exception 'T1 falhou: mar vpb % efeito % troca % (esperado 26000, -50000, -50000)', r->'total'->>'vpb', r->'total'->>'efeito', r->'total'->>'troca_categoria'; end if;

  -- T2 o período (modal) = a soma dos meses; o total econômico (fim − início) de sempre
  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-01', '2031-03');
  if (r->'total'->>'vpb')::numeric is distinct from 82000.00 or (r->'total'->>'efeito')::numeric is distinct from -50000.00
     or (r->'total'->>'troca_categoria')::numeric is distinct from -50000.00
     or (r->'total'->>'v1_p1')::numeric - (r->'total'->>'v0')::numeric is distinct from 32000.00 then
    raise exception 'T2 falhou: período vpb % efeito % troca % v0 % v1_p1 % (esperado 82000, -50000, -50000, total 32000)',
      r->'total'->>'vpb', r->'total'->>'efeito', r->'total'->>'troca_categoria', r->'total'->>'v0', r->'total'->>'v1_p1'; end if;

  -- T3 o DRE dá o mesmo do modal, no mês e no período; o período = Σ dos 3 meses
  foreach m in array array['2031-01','2031-02','2031-03'] loop
    select x->'linhas' into l from jsonb_array_elements(public.fn_dre_pecuaria(c_cli, m, m, 'realizado')->'fazendas') x where (x->>'fazenda_id')::uuid = c_faz;
    s := s + (l->>'vpb_operacional')::numeric;
  end loop;
  if s is distinct from 82000.00 then raise exception 'T3 falhou: Σ dos meses no DRE % (esperado 82000)', s; end if;
  select x->'linhas' into l from jsonb_array_elements(public.fn_dre_pecuaria(c_cli, '2031-01', '2031-03', 'realizado')->'fazendas') x where (x->>'fazenda_id')::uuid = c_faz;
  if (l->>'vpb_operacional')::numeric is distinct from 82000.00 or (l->>'efeito_mercado')::numeric is distinct from -50000.00
     or (l->'patrimonio'->>'troca_categoria')::numeric is distinct from -50000.00 then
    raise exception 'T3 falhou: DRE período vpb % mercado % troca % (esperado 82000, -50000, -50000)',
      l->>'vpb_operacional', l->>'efeito_mercado', l->'patrimonio'->>'troca_categoria'; end if;

  -- T4 a meta não muda: sem troca de categoria no payload
  select x->'linhas' into l from jsonb_array_elements(public.fn_dre_pecuaria(c_cli, '2031-01', '2031-03', 'meta')->'fazendas') x where (x->>'fazenda_id')::uuid = c_faz;
  if l is not null and (l->'patrimonio'->>'troca_categoria')::numeric is distinct from 0 then
    raise exception 'T4 falhou: meta com troca %', l->'patrimonio'->>'troca_categoria'; end if;

  return 'T1–T4';
end $t$;

create function pg_temp.mutar(p_fn text, p_de text, p_para text) returns void language plpgsql as $f$
declare d text := pg_get_functiondef(p_fn::regprocedure);
begin
  if (length(d) - length(replace(d, p_de, ''))) / length(p_de) <> 1 then raise exception 'mutação: âncora não casa 1 vez em %', p_fn; end if;
  execute replace(d, p_de, p_para);
end $f$;

do $$
declare res text; v text;
begin
  -- M0 sem mutação: passa
  begin v := pg_temp.teste_agio_prov(); raise exception 'PASSOU:%', v; exception when others then res := sqlerrm; end;
  if res is distinct from 'PASSOU:T1–T4' then raise exception 'M0 não passou: %', res; end if;

  -- M1 a produção leva a troca
  begin
    perform pg_temp.mutar('public._fn_rebanho_producao_encadeada(uuid,uuid,text,text)', 'sum(j.v1_p0 - j.v0 - j.agio)', 'sum(j.v1_p0 - j.v0)');
    v := pg_temp.teste_agio_prov(); raise exception 'PASSOU:%', v;
  exception when others then res := sqlerrm; end;
  if res not like 'T1 falhou%' then raise exception 'M1 não derrubou o teste: %', res; end if;

  -- M2 o ágio na origem
  begin
    perform pg_temp.mutar('public._fn_rebanho_janela_mes(uuid,uuid,text)', 'select e.fazenda_id, e.d categoria, sum(', 'select e.fazenda_id, e.o categoria, sum(');
    v := pg_temp.teste_agio_prov(); raise exception 'PASSOU:%', v;
  exception when others then res := sqlerrm; end;
  if res not like 'T1 falhou%' then raise exception 'M2 não derrubou o teste: %', res; end if;

  -- M3 o DRE de uma janela só
  begin
    perform pg_temp.mutar('public.fn_dre_pecuaria(uuid,text,text,text)',
      'round(sum(coalesce(p0.q*p0.pm*p0.pk,0)) + coalesce(max(en.prod),0),2) v_fim_p0',
      'round(sum(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,t0.pk,p1.pk)),2) v_fim_p0');
    v := pg_temp.teste_agio_prov(); raise exception 'PASSOU:%', v;
  exception when others then res := sqlerrm; end;
  if res not like 'T3 falhou%' then raise exception 'M3 não derrubou o teste: %', res; end if;

  -- as 4 funções voltaram (md5 de depois da 115600)
  if (select string_agg(p.proname || '=' || md5(pg_get_functiondef(p.oid)), ' ' order by p.proname collate "C") from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_dre_pecuaria','fn_dre_pecuaria_patrimonio','_fn_rebanho_janela_mes','_fn_rebanho_producao_encadeada'))
     is distinct from '_fn_rebanho_janela_mes=17992d3a686a1aa8a19c4a098de6923e _fn_rebanho_producao_encadeada=66ddf7d5eea57dfe79779d91c648b3c6 fn_dre_pecuaria=96738da58cebc56fad0c7faec9010526 fn_dre_pecuaria_patrimonio=09eee417a763bec8856732cfd3638928' then
    raise exception 'md5 das funções não voltou';
  end if;
  raise exception 'OK rebanho_agio_provisorio mutações: M0 passa, M1–M3 derrubam, as 4 funções intactas (nada fica no banco)';
end $$;
