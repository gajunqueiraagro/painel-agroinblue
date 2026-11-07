-- FECH-PASTO-UNIDADE-01 — teste do F1 banco (117450 + 117460 + 117470 + a rodada). Roda como postgres DEPOIS das 3 migrations, numa transação
-- que termina em RAISE 'ENSAIO OK…' (nada fica). Ensaio verde em 07/11/2026 (1,6 s): T1–T9.

-- ═══ ENSAIO FECH-PASTO-UNIDADE-01 (117450 + 117460 + 117470 + a rodada): tudo termina em RAISE, nada fica no banco ═══
do $t$
declare
  v_nj uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_pur uuid; v_exp uuid; v_ter uuid; v_r07 uuid; v_p7 uuid; v_m1 uuid; v_m1a uuid; v_m1b uuid; v_7a uuid; v_card uuid; v_cat uuid;
  v_previa jsonb; v_gravado jsonb; v_rodada uuid; v_x jsonb; v_n int; v_a numeric; v_b numeric; v_ok text := ''; v_erro text;
  v_md5_antes text; v_md5_depois text;
begin
  select id into v_pur from fazendas where cliente_id = v_nj and codigo = 'PUR';
  select id into v_exp from fazendas where cliente_id = v_nj and codigo = 'EXP';
  select fazenda_id into v_ter from pasto_grupos where nome = 'Modulo 01' and ativo;
  select id into v_r07 from pastos where fazenda_id = v_exp and nome = 'R_07';
  select id into v_p7 from pastos where fazenda_id = v_pur and nome = 'P7';
  select id into v_m1 from pastos where fazenda_id = v_ter and nome = 'Modulo 01';
  select id into v_m1a from pastos where fazenda_id = v_ter and nome = 'M1-A';
  select id into v_m1b from pastos where fazenda_id = v_ter and nome = 'M1-B';
  select id into v_7a from pastos where fazenda_id = v_exp and nome = '7A';

  -- o estado de antes, para provar que o desfazer volta igual
  select md5(string_agg(x::text, ',' order by x::text)) into v_md5_antes from (
    select fp.id, fp.pasto_id, i.id iid, i.quantidade, i.piquete_id from fechamento_pastos fp left join fechamento_pasto_itens i on i.fechamento_id = fp.id
     where fp.cliente_id in (select cliente_id from pasto_grupos) and fp.ano_mes = '2026-10'
    union all select p.id, null, null, null, null from pastos p where p.data_fim is not null and p.id in (select pasto_origem_id from pasto_grupos)) x;

  -- T1 quem é piquete
  if public._fn_pai_do_piquete(v_7a) is distinct from v_r07 or public._fn_pai_do_piquete(v_r07) is not null then raise exception 'T1 piquete'; end if;
  v_ok := v_ok || 'T1 ok · ';

  -- T2 a área do mês: R_07 em out/26 é a dele (piquetes só em nov); em nov, a soma de 7A–7D; P7 em out/26 = soma de 7A–7D da PUR
  v_a := fn_pasto_area_no_mes(v_r07, '2026-10'); v_b := fn_pasto_area_no_mes(v_r07, '2026-11');
  if v_a <> 100.2 or v_b <> 100.41 then raise exception 'T2 área R_07 out % nov %', v_a, v_b; end if;
  v_a := fn_pasto_area_no_mes(v_p7, '2026-10');
  if v_a <> 97.54 then raise exception 'T2 área P7 out %', v_a; end if;
  v_ok := v_ok || format('T2 ok (R_07 out %s · nov %s · P7 out %s) · ', 100.2, 100.41, v_a);

  -- T3 a prévia da rodada
  v_previa := fn_pasto_unidade_migrar(true);
  if (v_previa->'resumo'->>'pais')::int <> 38 or (v_previa->'resumo'->>'cards')::int <> 8 or (v_previa->'resumo'->>'ficam')::int <> 2
     or (v_previa->'resumo'->>'fora')::int <> 0 or (v_previa->'resumo'->>'cabecas_antes')::int <> 747 or (v_previa->'resumo'->>'cabecas_ligadas')::int <> 747 then
    raise exception 'T3 prévia %', v_previa->'resumo';
  end if;
  v_ok := v_ok || 'T3 ok · ';

  -- T4 a rodada gravada (dentro do ensaio): Módulo 01 de out/26 tem as 130 cab marcadas no M1-A; o P1 da PUR conta 80 pastos no conjunto
  v_gravado := fn_pasto_unidade_migrar(false);
  v_rodada := (v_gravado->>'rodada')::uuid;
  select fp.id into v_card from fechamento_pastos fp where fp.pasto_id = v_m1 and fp.ano_mes = '2026-10';
  select sum(quantidade), count(*) filter (where piquete_id = v_m1a) into v_n, v_a from fechamento_pasto_itens where fechamento_id = v_card;
  if v_n <> 130 or v_a <> 1 then raise exception 'T4 Módulo 01 % cab, % linha(s) no M1-A', v_n, v_a; end if;
  select count(*) into v_n from fn_pastos_aplicaveis_mes(v_pur, '2026-10');
  v_ok := v_ok || format('T4 conjunto PUR out/26 = %s pastos · ', v_n);
  if exists (select 1 from fn_pastos_aplicaveis_mes(v_pur, '2026-10') x where public._fn_pai_do_piquete(x.pasto_id) is not null) then raise exception 'T4 piquete no conjunto'; end if;
  if not exists (select 1 from fn_pastos_aplicaveis_mes(v_pur, '2026-10') x where x.pasto_id = v_p7) then raise exception 'T4 P7 fora do conjunto'; end if;
  if exists (select 1 from pastos where id = v_p7 and data_fim is not null) then raise exception 'T4 P7 ainda encerrado'; end if;
  select count(*) into v_n from fechamento_pastos where public._fn_pai_do_piquete(pasto_id) is not null;
  if v_n <> 2 then raise exception 'T4 cards de piquete que ficam = %', v_n; end if;
  v_ok := v_ok || 'T4 ok · ';

  -- T5 lotação do Módulo 01 em out/26: área = os 8 piquetes (85,40 ha)
  select l.area_ha into v_a from fn_lotacao_do_mes(v_ter, '2026-10') l where l.pasto_id = v_m1;
  v_ok := v_ok || format('T5 lotação Módulo 01 área %s · ', v_a);
  if v_a <> 85.40 then raise exception 'T5 área do Módulo 01 = %', v_a; end if;

  -- T6 as travas: card de piquete não nasce; linha com piquete de outro pasto não grava; piquete que não vale no mês não grava
  begin
    insert into fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) values (v_m1b, v_ter, (select cliente_id from fazendas where id = v_ter), '2026-11', 'aberto');
    raise exception 'T6a passou';
  exception when others then v_erro := sqlerrm; if v_erro !~ 'é piquete de' then raise exception 'T6a %', v_erro; end if; end;
  begin
    update fechamento_pasto_itens set piquete_id = v_7a where fechamento_id = v_card;
    raise exception 'T6b passou';
  exception when others then v_erro := sqlerrm; if v_erro !~ 'não é piquete deste pasto' then raise exception 'T6b %', v_erro; end if; end;
  begin
    update pastos set data_inicio = '2026-11-01' where id = v_m1b;
    insert into fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, piquete_id)
    values (v_card, (select c.id from categorias_rebanho c where c.id not in (select categoria_id from fechamento_pasto_itens where fechamento_id = v_card) limit 1), 1, v_m1b);
    raise exception 'T6c passou';
  exception when others then v_erro := sqlerrm; if v_erro !~ 'não vale em 10/2026' then raise exception 'T6c %', v_erro; end if; end;
  v_ok := v_ok || 'T6 ok · ';

  -- T7 o gravador do card como o Gabriel (authenticated): 130 → 70 no M1-A + 60 no M1-B; repetida recusa; volta a pasto inteiro = 130
  select categoria_id into v_cat from fechamento_pasto_itens where fechamento_id = v_card limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_x := fn_fechamento_pasto_salvar(v_card, '{}'::jsonb, jsonb_build_array(
    jsonb_build_object('categoria_id', v_cat, 'quantidade', 70, 'peso_medio_kg', 300, 'piquete_id', v_m1a),
    jsonb_build_object('categoria_id', v_cat, 'quantidade', 60, 'peso_medio_kg', 360, 'piquete_id', v_m1b)));
  begin
    v_x := fn_fechamento_pasto_salvar(v_card, '{}'::jsonb, jsonb_build_array(
      jsonb_build_object('categoria_id', v_cat, 'quantidade', 1, 'piquete_id', v_m1a), jsonb_build_object('categoria_id', v_cat, 'quantidade', 2, 'piquete_id', v_m1a)));
    raise exception 'T7 repetida passou';
  exception when others then v_erro := sqlerrm; if v_erro !~ 'duas vezes no mesmo piquete' then raise exception 'T7 %', v_erro; end if; end;
  v_x := fn_fechamento_pasto_inteiro(v_card, true);
  if (v_x->>'cabecas')::int <> 130 then raise exception 'T7 prévia do inteiro %', v_x; end if;
  v_x := fn_fechamento_pasto_inteiro(v_card, false);
  execute 'reset role';
  select sum(quantidade), count(*), max(peso_medio_kg), count(*) filter (where piquete_id is not null) into v_n, v_a, v_b, v_erro from fechamento_pasto_itens where fechamento_id = v_card;
  if v_n <> 130 or v_a <> 1 or v_b <> 327.69 or v_erro <> '0' then raise exception 'T7 inteiro: % cab, % linha(s), peso %, % com piquete', v_n, v_a, v_b, v_erro; end if;
  v_ok := v_ok || 'T7 ok (70@300 + 60@360 → 130@327,69) · ';

  -- T8 a divisão remendada: concluir não grava mais o fim do pai; mudar início não leva card ao 1º piquete
  if (select prosrc from pg_proc where proname = 'fn_piquetes_concluir') ~ 'SET data_fim = v_fim' then raise exception 'T8 concluir'; end if;
  if (select prosrc from pg_proc where proname = 'fn_piquetes_mudar_inicio') ~ 'set data_fim = v_mes - 1' then raise exception 'T8 mudar início'; end if;
  v_ok := v_ok || 'T8 ok · ';

  -- T9 desfazer a rodada: volta igual (mesmo md5 do antes); o Módulo 01 volta ao M1-A — mas só se ninguém mexeu; aqui o T7 mexeu
  begin
    v_x := fn_pasto_unidade_desfazer(v_rodada, 'ensaio', true);
    raise exception 'T9a passou';
  exception when others then v_erro := sqlerrm; if v_erro !~ 'as linhas do card de M1-A' then raise exception 'T9a %', v_erro; end if; end;
  -- volta as linhas do Módulo 01 às da rodada (ids novos pelo T7: refaz a partir da trilha) para provar o desfazer inteiro
  delete from fechamento_pasto_itens where fechamento_id = v_card;
  insert into fechamento_pasto_itens (id, fechamento_id, categoria_id, quantidade, piquete_id, peso_medio_kg)
  select (e->>'id')::uuid, v_card, (e->>'categoria_id')::uuid, (e->>'quantidade')::int, v_m1a, null::numeric
    from audit_log a, jsonb_array_elements(a.dados_anteriores->'itens') e
   where a.tabela_origem = 'pasto_unidade' and a.registro_id = v_rodada and a.acao = 'pasto_unidade_card' and (a.dados_anteriores->>'card_id')::uuid = v_card;
  v_x := fn_pasto_unidade_desfazer(v_rodada, 'ensaio', false);
  select md5(string_agg(x::text, ',' order by x::text)) into v_md5_depois from (
    select fp.id, fp.pasto_id, i.id iid, i.quantidade, i.piquete_id from fechamento_pastos fp left join fechamento_pasto_itens i on i.fechamento_id = fp.id
     where fp.cliente_id in (select cliente_id from pasto_grupos) and fp.ano_mes = '2026-10'
    union all select p.id, null, null, null, null from pastos p where p.data_fim is not null and p.id in (select pasto_origem_id from pasto_grupos)) x;
  if v_md5_depois <> v_md5_antes then raise exception 'T9 o desfazer não voltou igual (% × %)', v_md5_antes, v_md5_depois; end if;
  v_ok := v_ok || format('T9 ok (desfazer: %s cards, %s pais) · ', v_x->>'cards', v_x->>'pais');

  raise exception 'ENSAIO OK — % ║ PRÉVIA %', v_ok, v_previa->'resumo';
end $t$;
