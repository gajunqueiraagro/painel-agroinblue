-- DRE-FECH-INVALIDADO-01 — mutacoes do teste `dre_fech_invalidado_01_test.sql` (migration 20261028115290 APLICADA).
-- Roda como postgres. A funcao de teste abaixo e' copia byte a byte da do _test.sql (gerada dele).
-- Cada mutacao desfaz UM pedaco do conserto dentro de um bloco com excecao (subtransacao): o teste roda, o bloco sempre termina em
-- excecao e desfaz a mutacao e o fixture. M0 (sem mutacao) tem de passar; M1–M7 tem de cair num teste "T… falhou". Termina em RAISE 'OK…'.
set local statement_timeout = '60s';
set local lock_timeout = '2s';

create function pg_temp.teste_dre_fech_invalidado() returns text language plpgsql as $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; f jsonb; m text;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  insert into public.valor_rebanho_fechamento_itens (fazenda_id, cliente_id, ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria)
  values (c_faz, c_cli, '2031-01', 'vacas', 100, 400, 10, 400000), (c_faz, c_cli, '2031-02', 'vacas', 100, 400, 12, 480000);
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status, valor_total, cabecas)
  values (c_faz, c_cli, '2031-01', 'validado', 400000, 100), (c_faz, c_cli, '2031-02', 'invalidado', 480000, 100);
  insert into public.zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_codigo, categoria_nome, ordem_exibicao,
                                        saldo_inicial, saldo_final, peso_medio_inicial, peso_medio_final)
  values (c_faz, c_cli, 2031, 2, '2031-02', 'realizado', 'vacas', 'Vacas', 9, 100, 100, 410, 410),
         (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'vacas', 'Vacas', 9, 100, 100, 410, 410);

  -- T1 o fechamento INVALIDADO nao e' a foto de P1: fev vem do cadastro (410 kg) ao preco de P0 (jan, R$ 10), nao do item (400 kg, R$ 12)
  r := public.fn_dre_pecuaria(c_cli, '2031-02', '2031-02', 'realizado');
  select x into f from jsonb_array_elements(r->'fazendas') x where x->>'fazenda_id' = c_faz::text;
  if f->'linhas'->>'p1_fonte' is distinct from 'cadastro' then raise exception 'T1 falhou: p1_fonte % (esperado cadastro)', f->'linhas'->>'p1_fonte'; end if;
  if (f->'linhas'->'patrimonio'->>'v_fim_p1')::numeric is distinct from 410000.00 then
    raise exception 'T1 falhou: v_fim_p1 % (esperado 410000.00)', f->'linhas'->'patrimonio'->>'v_fim_p1'; end if;
  if (f->'linhas'->>'vpb_operacional')::numeric is distinct from 10000.00 then
    raise exception 'T1 falhou: vpb % (esperado 10000.00)', f->'linhas'->>'vpb_operacional'; end if;

  -- T2 P0 sem fechamento VALIDADO (fev invalidado) = cadastro ao preco do ULTIMO validado (jan, R$ 10) — nunca zero, nunca o de fev
  r := public.fn_dre_pecuaria(c_cli, '2031-03', '2031-03', 'realizado');
  select x into f from jsonb_array_elements(r->'fazendas') x where x->>'fazenda_id' = c_faz::text;
  if f->'linhas'->>'p0_fonte' is distinct from 'cadastro' then raise exception 'T2 falhou: p0_fonte % (esperado cadastro)', f->'linhas'->>'p0_fonte'; end if;
  if (f->'linhas'->'patrimonio'->>'v_ini_p0')::numeric is distinct from 410000.00 then
    raise exception 'T2 falhou: v_ini_p0 % (esperado 410000.00 = 100 x 410 x 10)', f->'linhas'->'patrimonio'->>'v_ini_p0'; end if;

  -- T3 o modal le^ a mesma foto: fev do cadastro, mar comecando do cadastro ao preco de jan
  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-02', '2031-02');
  if r->>'p1_fonte' is distinct from 'cadastro' or (r->'total'->>'v1_p1')::numeric is distinct from 410000.00 then
    raise exception 'T3 falhou: modal fev p1_fonte % v1_p1 %', r->>'p1_fonte', r->'total'->>'v1_p1'; end if;
  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-03', '2031-03');
  if r->>'p0_fonte' is distinct from 'cadastro' or (r->'total'->>'v0')::numeric is distinct from 410000.00 then
    raise exception 'T3 falhou: modal mar p0_fonte % v0 %', r->>'p0_fonte', r->'total'->>'v0'; end if;

  -- T4 o ramo da META tambem: cab_ini de mar nao conta o fechamento invalidado de fev
  r := public.fn_dre_pecuaria(c_cli, '2031-03', '2031-03', 'meta');
  select x into f from jsonb_array_elements(r->'fazendas') x where x->>'fazenda_id' = c_faz::text;
  if f is null then raise exception 'T4 falhou: a fazenda sumiu do DRE meta'; end if;
  if (f->'linhas'->'patrimonio'->>'cab_ini')::numeric is distinct from 0 then
    raise exception 'T4 falhou: cab_ini % (esperado 0)', f->'linhas'->'patrimonio'->>'cab_ini'; end if;

  -- T5 o mes VALIDADO segue sendo a foto: P0 de fev = jan (400 kg, R$ 10)
  r := public.fn_dre_pecuaria(c_cli, '2031-02', '2031-02', 'realizado');
  select x into f from jsonb_array_elements(r->'fazendas') x where x->>'fazenda_id' = c_faz::text;
  if f->'linhas'->>'p0_fonte' is distinct from 'fechamento' or (f->'linhas'->'patrimonio'->>'v_ini_p0')::numeric is distinct from 400000.00 then
    raise exception 'T5 falhou: p0_fonte % v_ini_p0 %', f->'linhas'->>'p0_fonte', f->'linhas'->'patrimonio'->>'v_ini_p0'; end if;

  return 'T1–T5';
end $t$;

do $m$
declare
  ok_t text := $o$ and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=valor_rebanho_fechamento_itens.cliente_id and rv.fazenda_id=valor_rebanho_fechamento_itens.fazenda_id and rv.ano_mes=valor_rebanho_fechamento_itens.ano_mes and rv.status='validado')$o$;
  ok_fi text := $o$ and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=fi.cliente_id and rv.fazenda_id=fi.fazenda_id and rv.ano_mes=fi.ano_mes and rv.status='validado')$o$;
  ok_i text := $o$ and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=i.cliente_id and rv.fazenda_id=i.fazenda_id and rv.ano_mes=i.ano_mes and rv.status='validado')$o$;
  h_dre text := 'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text DEFAULT ''realizado''::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$';
  h_pat text := 'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$';
  s_dre text; s_pat text; mu record; v_msg text; res text := '';
begin
  select prosrc into s_dre from pg_proc where proname='fn_dre_pecuaria' and pronamespace='public'::regnamespace;
  select prosrc into s_pat from pg_proc where proname='fn_dre_pecuaria_patrimonio' and pronamespace='public'::regnamespace;
  if md5(s_dre) <> '1e4f59861462a95d391b985d8752cedc' or md5(s_pat) <> '1b64aee80105219a78e0f10e0e126bef' then
    raise exception 'a migration 20261028115290 nao esta aplicada (md5 % / %)', md5(s_dre), md5(s_pat); end if;
  -- M0: sem mutacao, passa
  begin
    perform pg_temp.teste_dre_fech_invalidado();
    raise exception 'M0-PASSOU';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'M0-PASSOU' then raise exception 'M0 falhou: o teste caiu sem mutacao (%)', v_msg; end if;
  end;
  for mu in select * from (values
      ('M1 dre p1f sem o filtro',          'dre', $q$ano_mes=p_ate and p_cenario='realizado'$q$||ok_t, $q$ano_mes=p_ate and p_cenario='realizado'$q$),
      ('M2 dre preco do cadastro = o de p_de', 'dre', 'ano_mes<=p_de and preco_kg', 'ano_mes=p_de and preco_kg'),
      ('M3 dre p0f sem o filtro',          'dre', $q$ano_mes=v_p0 and p_cenario='realizado'$q$||ok_t, $q$ano_mes=v_p0 and p_cenario='realizado'$q$),
      ('M4 dre meta cab_ini sem o filtro', 'dre', 'fi.ano_mes=v_p0'||ok_fi, 'fi.ano_mes=v_p0'),
      ('M5 modal p1f sem o filtro',        'pat', 'i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda)'||ok_i, 'i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda)'),
      ('M6 modal preco do cadastro = o de p_de', 'pat', 'ano_mes<=left(p_de,7) and preco_kg', 'ano_mes=left(p_de,7) and preco_kg'),
      ('M7 modal p0f sem o filtro',        'pat', 'i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda)'||ok_i, 'i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda)')
    ) x(nome, alvo, de, para) loop
    v_msg := null;
    begin
      if mu.alvo = 'dre' then
        if (length(s_dre)-length(replace(s_dre, mu.de, '')))/length(mu.de) <> 1 then raise exception 'ANCORA % nao casa 1x', mu.nome; end if;
        execute h_dre || replace(s_dre, mu.de, mu.para) || '$fn$';
      else
        if (length(s_pat)-length(replace(s_pat, mu.de, '')))/length(mu.de) <> 1 then raise exception 'ANCORA % nao casa 1x', mu.nome; end if;
        execute h_pat || replace(s_pat, mu.de, mu.para) || '$fn$';
      end if;
      perform pg_temp.teste_dre_fech_invalidado();
      raise exception 'MUTACAO-SOBREVIVEU';
    exception when raise_exception then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg like 'ANCORA%' then raise exception '%', v_msg; end if;
    if v_msg = 'MUTACAO-SOBREVIVEU' or v_msg not like 'T_ falhou%' then raise exception '% NAO caiu (%)', mu.nome, v_msg; end if;
    res := res || chr(10) || mu.nome || ' -> ' || split_part(v_msg, ':', 1);
  end loop;
  raise exception 'OK dre_fech_invalidado_01 mutacoes: M0 passa; M1–M7 caem%', res;
end $m$;
