-- NOTA-FAZENDA-PELA-IE-01 — `fn_fazenda_gravar_ie` / `_desfazer` (como `authenticated`, o admin), no cliente Teste (uma 2a fazenda
-- sintetica nasce aqui). Termina em RAISE 'OK' (desfaz tudo).
--   T1 simular nao grava; gravar grava (com trilha em audit_log)   T2 IE gravada diferente: NUNCA sobrescreve (a frase)
--   T3 a IE de OUTRA fazenda do cliente: recusa                       T4 a mesma IE de novo: "ja' tem"   T5 IE invalida: recusa
--   T6 desfazer volta a vazio; desfazer de novo (a IE mudou/sumiu) recusa
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
declare k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f1 uuid; f2 uuid; r jsonb; t uuid; e text;
begin
  select id into f1 from fazendas where cliente_id = k order by nome limit 1;
  insert into fazendas (cliente_id, nome, codigo, owner_id) values (k, 'SINT Fazenda Dois', 'SINT2', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') returning id into f2;
  update fazenda_cadastros set ie = null where fazenda_id = f1;
  perform set_config('role', 'authenticated', true);
  -- T1
  r := fn_fazenda_gravar_ie(f1, '28.999.888-7', 'NF 1', true);
  if coalesce((select ie from fazenda_cadastros where fazenda_id = f1), '') <> '' then raise exception 'T1 simular gravou'; end if;
  r := fn_fazenda_gravar_ie(f1, '28.999.888-7', 'NF 1', false); t := (r->>'trilha_id')::uuid;
  if (select ie from fazenda_cadastros where fazenda_id = f1) <> '289998887' then raise exception 'T1 nao gravou'; end if;
  if (select resumo from audit_log where id = t) not like '% | IE vazia → 289998887 | pela nota NF 1' then raise exception 'T1 trilha'; end if;
  -- T2
  begin perform fn_fazenda_gravar_ie(f1, '281112223', 'NF 2', false); raise exception 'T2 sobrescreveu';
  exception when others then e := sqlerrm; end;
  if e not like '%já tem a IE 289998887 (a nota traz 281112223): a IE gravada não é trocada pela nota.%' then raise exception 'T2: %', e; end if;
  -- T3
  begin perform fn_fazenda_gravar_ie(f2, '289998887', 'NF 3', false); raise exception 'T3 gravou a IE de outra fazenda';
  exception when others then e := sqlerrm; end;
  if e not like 'A IE 289998887 já é de %. Nada foi gravado.' then raise exception 'T3: %', e; end if;
  -- T4
  if (fn_fazenda_gravar_ie(f1, '289998887', 'NF 4', false))->>'ja_gravada' <> 'true' then raise exception 'T4'; end if;
  -- T5
  begin perform fn_fazenda_gravar_ie(f2, 'abc', 'NF 5', true); raise exception 'T5 aceitou';
  exception when others then e := sqlerrm; end;
  if e <> '"abc" não parece uma inscrição estadual. Nada foi gravado.' then raise exception 'T5: %', e; end if;
  -- T6
  perform fn_fazenda_gravar_ie_desfazer(t, 'errei a fazenda');
  if (select ie from fazenda_cadastros where fazenda_id = f1) is not null then raise exception 'T6 nao desfez'; end if;
  begin perform fn_fazenda_gravar_ie_desfazer(t, 'de novo'); raise exception 'T6 desfez duas vezes';
  exception when others then e := sqlerrm; end;
  if e <> 'A IE da fazenda mudou depois desta gravação: nada foi desfeito.' then raise exception 'T6: %', e; end if;
  perform set_config('role', 'postgres', true);
  RAISE EXCEPTION 'OK';
END $t$;
