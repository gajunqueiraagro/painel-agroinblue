-- SUITE — PR-SEC-RLS-CONTRATOS-01B v2 (fn_contrato_editar_e_regenerar)
-- Atores e dados sinteticos, tudo em transacao revertida.
BEGIN;
CREATE TEMP TABLE _r(g text, ok boolean, obs text) ON COMMIT DROP;
GRANT ALL ON TABLE _r TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reg(a text,b boolean,c text DEFAULT '') RETURNS void LANGUAGE sql AS $$ INSERT INTO _r VALUES(a,b,c) $$;
CREATE TEMP TABLE _ids(k text PRIMARY KEY, u uuid); GRANT SELECT ON TABLE _ids TO PUBLIC;

-- chamada padrao: so contrato/versao/corte variam; demais campos vem do contrato atual
CREATE OR REPLACE FUNCTION pg_temp.call(p_u uuid, p_ct uuid, p_corte date, p_ver timestamptz, p_valor numeric DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE c public.financeiro_contratos%ROWTYPE; r jsonb; e text;
BEGIN
  SELECT * INTO c FROM public.financeiro_contratos WHERE id=p_ct LIMIT 1;
  PERFORM set_config('request.jwt.claims', CASE WHEN p_u IS NULL THEN '{}' ELSE json_build_object('sub',p_u::text,'role','authenticated')::text END, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT public.fn_contrato_editar_e_regenerar(p_ct,p_ver,p_corte,c.fazenda_id,c.fornecedor_id,c.produto,
      COALESCE(p_valor,c.valor,100),c.frequencia,COALESCE(c.data_inicio,CURRENT_DATE),c.data_fim,
      COALESCE(c.dia_pagamento,10),c.forma_pagamento,c.dados_pagamento,c.conta_bancaria_id,
      c.subcentro,c.centro_custo,c.macro_custo,c.observacao,'ativo') INTO r;
    EXECUTE 'SET LOCAL ROLE postgres'; RETURN 'OK|'||r::text;
  EXCEPTION WHEN others THEN e:=SQLSTATE||'|'||SQLERRM; EXECUTE 'SET LOCAL ROLE postgres'; RETURN 'ERR|'||e;
  END;
END $$;

SET LOCAL session_replication_role = replica;
INSERT INTO _ids VALUES ('cliA','aaaaaaaa-0000-4000-8000-0000000000a2'),('cliB','bbbbbbbb-0000-4000-8000-0000000000b2'),
 ('uAdm','11111111-0000-4000-8000-000000000012'),('uA','22222222-0000-4000-8000-000000000012'),
 ('uB','33333333-0000-4000-8000-000000000012'),('uIna','44444444-0000-4000-8000-000000000012'),
 ('uSem','55555555-0000-4000-8000-000000000012'),('ctA','cccccccc-0000-4000-8000-0000000000a2'),
 ('ctP','cccccccc-0000-4000-8000-00000000000f');
INSERT INTO public.clientes(id,nome) VALUES ((SELECT u FROM _ids WHERE k='cliA'),'FX01B A'),((SELECT u FROM _ids WHERE k='cliB'),'FX01B B');
INSERT INTO public.cliente_membros(cliente_id,user_id,perfil,ativo) VALUES
 ((SELECT u FROM _ids WHERE k='cliA'),(SELECT u FROM _ids WHERE k='uAdm'),'admin_agroinblue',true),
 ((SELECT u FROM _ids WHERE k='cliA'),(SELECT u FROM _ids WHERE k='uA'),'operador',true),
 ((SELECT u FROM _ids WHERE k='cliB'),(SELECT u FROM _ids WHERE k='uB'),'operador',true),
 ((SELECT u FROM _ids WHERE k='cliA'),(SELECT u FROM _ids WHERE k='uIna'),'operador',false);
INSERT INTO public.financeiro_contratos(id,cliente_id,produto,valor,data_inicio,data_fim,dia_pagamento,status) VALUES
 ((SELECT u FROM _ids WHERE k='ctA'),(SELECT u FROM _ids WHERE k='cliA'),'FX01B ctA',100,date '2026-01-31',date '2027-12-31',31,'ativo'),
 ((SELECT u FROM _ids WHERE k='ctP'),(SELECT u FROM _ids WHERE k='cliA'),'FX01B ctP',50,date '2026-01-10',date '2027-12-31',10,'ativo');
SET LOCAL session_replication_role = origin;

-- ============ ANTI-ORACULO ============
DO $$ DECLARE a text;b text;c text;d text;e text;v timestamptz;
BEGIN
  SELECT updated_at INTO v FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA');
  a:=pg_temp.call((SELECT u FROM _ids WHERE k='uA'),'00000000-0000-4000-8000-0000000dead1',CURRENT_DATE,v);
  b:=pg_temp.call((SELECT u FROM _ids WHERE k='uB'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,v);
  c:=pg_temp.call((SELECT u FROM _ids WHERE k='uIna'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,v);
  d:=pg_temp.call((SELECT u FROM _ids WHERE k='uSem'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,v);
  e:=pg_temp.call(NULL,(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,v);
  PERFORM pg_temp.reg('A1 inexistente erra', a LIKE 'ERR|P0002%', left(a,50));
  PERFORM pg_temp.reg('A2 alheio identico', b=a, left(b,50));
  PERFORM pg_temp.reg('A3 inativo identico', c=a, '');
  PERFORM pg_temp.reg('A4 sem membership identico', d=a, '');
  PERFORM pg_temp.reg('A5 auth nulo identico', e=a, '');
  PERFORM pg_temp.reg('A6 sem vazamento', a NOT ILIKE '%financeiro_%' AND a NOT ILIKE '%42501%', '');
END $$;

-- ============ ENTRADA / VERSAO / IDENTIDADE ============
DO $$ DECLARE v timestamptz;r text;n0 int;n1 int;
BEGIN
  SELECT updated_at INTO v FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA');
  SELECT count(*) INTO n0 FROM public.financeiro_lancamentos_v2 WHERE contrato_id=(SELECT u FROM _ids WHERE k='ctA');
  r:=pg_temp.call((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='ctA'),NULL,v);
  PERFORM pg_temp.reg('B1 corte nulo aborta', r LIKE 'ERR|P0001|data de corte obrigatoria%', left(r,50));
  r:=pg_temp.call((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE-1,v);
  PERFORM pg_temp.reg('B2 corte passado aborta', r LIKE 'ERR|P0001|data de corte anterior%', left(r,50));
  SELECT count(*) INTO n1 FROM public.financeiro_lancamentos_v2 WHERE contrato_id=(SELECT u FROM _ids WHERE k='ctA');
  PERFORM pg_temp.reg('B3 corte invalido nao escreveu', n0=n1, n0||'->'||n1);
  r:=pg_temp.call((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,v-interval '1 s');
  PERFORM pg_temp.reg('B4 versao divergente aborta', r LIKE 'ERR|P0001|contrato alterado%', left(r,50));
END $$;
DO $$ DECLARE v timestamptz;r text;
BEGIN
  SET LOCAL session_replication_role = replica;
  INSERT INTO public.financeiro_contratos(id,cliente_id,produto,valor,data_inicio,dia_pagamento,status)
  VALUES ((SELECT u FROM _ids WHERE k='ctA'),(SELECT u FROM _ids WHERE k='cliA'),'FX01B CLONE',9,date '2026-01-31',31,'ativo');
  SET LOCAL session_replication_role = origin;
  SELECT max(updated_at) INTO v FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA');
  r:=pg_temp.call((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,v);
  PERFORM pg_temp.reg('B5 identidade duplicada aborta', r LIKE 'ERR|P0001|identidade%', left(r,50));
  DELETE FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA') AND produto='FX01B CLONE';
END $$;

-- ============ P2 — PROTEGIDA NA JANELA ============
DO $$ DECLARE v timestamptz;r text;n_obr int;n_it int;mult int;n_tot0 int;n_tot1 int;ct_antes text;ct_depois text;
BEGIN
  SET LOCAL session_replication_role = replica;
  INSERT INTO public.financeiro_contas_bancarias(id,cliente_id,nome_conta) VALUES ('eeee0000-0000-4000-8000-0000000000c2',(SELECT u FROM _ids WHERE k='cliA'),'FX01B CONTA');
  INSERT INTO public.extrato_bancario_v2(id,cliente_id,conta_bancaria_id,data_movimento,valor,tipo_movimento,hash_movimento)
  VALUES ('eeee0000-0000-4000-8000-0000000000e2',(SELECT u FROM _ids WHERE k='cliA'),'eeee0000-0000-4000-8000-0000000000c2',CURRENT_DATE+40,10,'debito','FX01B2');
  SET LOCAL session_replication_role = origin;
  INSERT INTO public.financeiro_lancamentos_v2(id,cliente_id,contrato_id,origem_lancamento,tipo_operacao,status_transacao,valor,data_competencia,data_vencimento,descricao)
  VALUES ('ffff0000-0000-4000-8000-00000000000f',(SELECT u FROM _ids WHERE k='cliA'),(SELECT u FROM _ids WHERE k='ctP'),'contrato','2-Saídas','programado',10,CURRENT_DATE+40,CURRENT_DATE+40,'FX01B protegida');
  INSERT INTO public.conciliacao_bancaria_itens(cliente_id,extrato_id,lancamento_id,valor_aplicado)
  VALUES ((SELECT u FROM _ids WHERE k='cliA'),'eeee0000-0000-4000-8000-0000000000e2','ffff0000-0000-4000-8000-00000000000f',10);

  SELECT md5(row(c.*)::text) INTO ct_antes FROM public.financeiro_contratos c WHERE c.id=(SELECT u FROM _ids WHERE k='ctP');
  SELECT count(*) INTO n_tot0 FROM public.financeiro_lancamentos_v2 WHERE contrato_id=(SELECT u FROM _ids WHERE k='ctP');
  SELECT updated_at INTO v FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctP');

  r:=pg_temp.call((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='ctP'),CURRENT_DATE,v,777);

  SELECT md5(row(c.*)::text) INTO ct_depois FROM public.financeiro_contratos c WHERE c.id=(SELECT u FROM _ids WHERE k='ctP');
  SELECT count(*) INTO n_obr FROM public.financeiro_lancamentos_v2 WHERE id='ffff0000-0000-4000-8000-00000000000f';
  SELECT count(*) INTO n_it FROM public.conciliacao_bancaria_itens WHERE lancamento_id='ffff0000-0000-4000-8000-00000000000f';
  SELECT count(*) INTO n_tot1 FROM public.financeiro_lancamentos_v2 WHERE contrato_id=(SELECT u FROM _ids WHERE k='ctP');
  SELECT coalesce(max(n),0) INTO mult FROM (SELECT data_competencia,count(*) n FROM public.financeiro_lancamentos_v2 WHERE contrato_id=(SELECT u FROM _ids WHERE k='ctP') GROUP BY data_competencia) x;

  PERFORM pg_temp.reg('P2.1 protegida na janela aborta com P0003', r LIKE 'ERR|P0003|existem obrigacoes protegidas%', left(r,60));
  PERFORM pg_temp.reg('P2.2 contrato byte-identico', ct_antes=ct_depois, '');
  PERFORM pg_temp.reg('P2.3 obrigacao protegida preservada', n_obr=1, '');
  PERFORM pg_temp.reg('P2.4 vinculo de conciliacao preservado (sem CASCADE)', n_it=1, '');
  PERFORM pg_temp.reg('P2.5 nenhuma obrigacao irma criada', n_tot1=n_tot0, n_tot0||'->'||n_tot1);
  PERFORM pg_temp.reg('P2.6 multiplicidade por competencia = 1', mult=1, 'max='||mult);
  PERFORM pg_temp.reg('P2.7 mensagem sem detalhe', r NOT ILIKE '%financeiro_%' AND r NOT ILIKE '%conciliacao_%', '');
END $$;

-- ============ P1 — ATOMICIDADE: falha no terceiro insert ============
DO $$ DECLARE v timestamptz;r text;ct_antes text;ct_depois text;cron_antes text;cron_depois text;n0 int;n1 int;
BEGIN
  SELECT md5(row(c.*)::text) INTO ct_antes FROM public.financeiro_contratos c WHERE c.id=(SELECT u FROM _ids WHERE k='ctA');
  SELECT count(*), md5(coalesce(string_agg(md5(row(l.*)::text),'|' ORDER BY l.id),'')) INTO n0, cron_antes
    FROM public.financeiro_lancamentos_v2 l WHERE l.contrato_id=(SELECT u FROM _ids WHERE k='ctA');
  SELECT updated_at INTO v FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA');

  -- falha deliberada no TERCEIRO insert de obrigacao
  CREATE OR REPLACE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $b$
  DECLARE n int; BEGIN
    n := coalesce(current_setting('fx01b.cnt', true)::int, 0) + 1;
    PERFORM set_config('fx01b.cnt', n::text, true);
    IF n = 3 THEN RAISE EXCEPTION 'FALHA DELIBERADA NO TERCEIRO INSERT'; END IF;
    RETURN NEW; END $b$;
  CREATE TRIGGER zz_fx01b_boom BEFORE INSERT ON public.financeiro_lancamentos_v2
    FOR EACH ROW WHEN (NEW.contrato_id IS NOT NULL) EXECUTE FUNCTION pg_temp.boom();

  r:=pg_temp.call((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,v,999);
  DROP TRIGGER zz_fx01b_boom ON public.financeiro_lancamentos_v2;

  SELECT md5(row(c.*)::text) INTO ct_depois FROM public.financeiro_contratos c WHERE c.id=(SELECT u FROM _ids WHERE k='ctA');
  SELECT count(*), md5(coalesce(string_agg(md5(row(l.*)::text),'|' ORDER BY l.id),'')) INTO n1, cron_depois
    FROM public.financeiro_lancamentos_v2 l WHERE l.contrato_id=(SELECT u FROM _ids WHERE k='ctA');

  PERFORM pg_temp.reg('P1.1 falha no 3o insert propaga erro', r LIKE 'ERR|%DELIBERADA%', left(r,60));
  PERFORM pg_temp.reg('P1.2 contrato byte-identico (UPDATE revertido)', ct_antes=ct_depois, '');
  PERFORM pg_temp.reg('P1.3 cronograma byte-identico (DELETE+INSERT revertidos)', cron_antes=cron_depois, n0||'->'||n1);
  PERFORM pg_temp.reg('P1.4 valor 999 NAO persistiu',
    (SELECT valor FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA')) <> 999, '');
END $$;

-- ============ CAMINHO FELIZ ============
DO $$ DECLARE v timestamptz;r text;j jsonb;n_venc int;n_pag int;n_st int;n_am int;n_tot int;
BEGIN
  SELECT updated_at INTO v FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA');
  r:=pg_temp.call((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,v,321);
  PERFORM pg_temp.reg('C1 regeneracao autorizada OK', r LIKE 'OK|%', left(r,80));
  IF r LIKE 'OK|%' THEN j:=replace(r,'OK|','')::jsonb;
    PERFORM pg_temp.reg('C2 retorno minimo sem id', (j?'removidas') AND (j?'criadas') AND (j?'versao') AND j::text NOT ILIKE '%ffff%', j::text); END IF;
  PERFORM pg_temp.reg('C3 UPDATE do contrato persistiu na MESMA transacao',
    (SELECT valor FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA'))=321, '');
  SELECT count(*) FILTER (WHERE data_vencimento IS NULL), count(*) FILTER (WHERE data_pagamento IS NOT NULL),
         count(*) FILTER (WHERE status_transacao<>'programado'),
         count(*) FILTER (WHERE ano_mes IS DISTINCT FROM to_char(data_competencia,'YYYY-MM')), count(*)
    INTO n_venc,n_pag,n_st,n_am,n_tot
    FROM public.financeiro_lancamentos_v2 WHERE contrato_id=(SELECT u FROM _ids WHERE k='ctA');
  PERFORM pg_temp.reg('C4 vencimento preenchido', n_venc=0, n_venc::text);
  PERFORM pg_temp.reg('C5 pagamento NULL', n_pag=0, n_pag::text);
  PERFORM pg_temp.reg('C6 status programado', n_st=0, '');
  PERFORM pg_temp.reg('C7 ano_mes derivado pelo 02E', n_am=0, '');
  PERFORM pg_temp.reg('C8 teto de 37 preservado', n_tot<=37, n_tot||' parcelas');
  PERFORM pg_temp.reg('C9 clamp fev/2027 (dia 31 -> 28)',
    EXISTS(SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE contrato_id=(SELECT u FROM _ids WHERE k='ctA')
            AND data_competencia=date '2027-02-28' AND data_vencimento=date '2027-02-28'), '');
  PERFORM pg_temp.reg('C10 multiplicidade 1',
    (SELECT coalesce(max(n),0) FROM (SELECT data_competencia,count(*) n FROM public.financeiro_lancamentos_v2
      WHERE contrato_id=(SELECT u FROM _ids WHERE k='ctA') GROUP BY data_competencia) x)=1, '');
  r:=pg_temp.call((SELECT u FROM _ids WHERE k='uAdm'),(SELECT u FROM _ids WHERE k='ctA'),CURRENT_DATE,
     (SELECT updated_at FROM public.financeiro_contratos WHERE id=(SELECT u FROM _ids WHERE k='ctA')));
  PERFORM pg_temp.reg('C11 admin autorizado', r LIKE 'OK|%', left(r,40));
END $$;

-- ============ ACL / FORMA ============
SELECT pg_temp.reg('D1 ACL = authenticated + postgres',
 (SELECT coalesce(string_agg(coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type,',' ORDER BY coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC'), a.privilege_type),'x')
   FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.proname='fn_contrato_editar_e_regenerar')='authenticated:EXECUTE,postgres:EXECUTE','');
SELECT pg_temp.reg('D2 secdef/owner/search_path',
 (SELECT prosecdef AND pg_get_userbyid(proowner)='postgres'::name AND array_to_string(proconfig,',')='search_path=public, pg_temp'
   FROM pg_proc WHERE proname='fn_contrato_editar_e_regenerar'),'');
SELECT pg_temp.reg('D3 corpo sem conciliado_em e sem WHEN OTHERS',
 (SELECT position('conciliado_em' in prosrc)=0 AND position('WHEN OTHERS' in upper(prosrc))=0
   FROM pg_proc WHERE proname='fn_contrato_editar_e_regenerar'),'');
SELECT pg_temp.reg('D4 nenhuma policy DELETE',
 (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass AND polcmd='d')=0,'');
SELECT pg_temp.reg('D5 policies do 01A preservadas',
 (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass)=3,'');

SELECT g, CASE WHEN ok THEN 'PASS' ELSE 'FALHA' END res, obs FROM _r ORDER BY g;
SELECT count(*) FILTER (WHERE ok) pass, count(*) FILTER (WHERE NOT ok) fail, count(*) total FROM _r;
ROLLBACK;
