-- SUITE — PR-FIN-DATAS-VENCIMENTO-02A (fn_contrato_criar_e_gerar)
-- Atores e dados sinteticos, tudo em transacao revertida.
BEGIN;
CREATE TEMP TABLE _r(g text, ok boolean, obs text) ON COMMIT DROP;
GRANT ALL ON TABLE _r TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reg(a text,b boolean,c text DEFAULT '') RETURNS void LANGUAGE sql AS $$ INSERT INTO _r VALUES(a,b,c) $$;
CREATE TEMP TABLE _ids(k text PRIMARY KEY, u uuid); GRANT SELECT ON TABLE _ids TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.criar(p_u uuid, p_faz uuid, p_valor numeric DEFAULT 100,
  p_ini date DEFAULT date '2026-01-31', p_fim date DEFAULT date '2027-12-31',
  p_dia int DEFAULT 31, p_status text DEFAULT 'ativo', p_conta uuid DEFAULT NULL, p_forn uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb; e text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_u IS NULL THEN '{}' ELSE json_build_object('sub',p_u::text,'role','authenticated')::text END, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT public.fn_contrato_criar_e_gerar(p_faz,p_forn,'FX02A prod',p_valor,'mensal',p_ini,p_fim,p_dia,
      NULL,NULL,p_conta,NULL,NULL,NULL,NULL,p_status) INTO r;
    EXECUTE 'SET LOCAL ROLE postgres'; RETURN 'OK|'||r::text;
  EXCEPTION WHEN others THEN e:=SQLSTATE||'|'||SQLERRM; EXECUTE 'SET LOCAL ROLE postgres'; RETURN 'ERR|'||e;
  END;
END $$;

SET LOCAL session_replication_role = replica;
INSERT INTO _ids VALUES ('cliA','aaaa02a0-0000-4000-8000-00000000000a'),('cliB','bbbb02a0-0000-4000-8000-00000000000b'),
 ('uAdm','111102a0-0000-4000-8000-000000000001'),('uA','222202a0-0000-4000-8000-000000000002'),
 ('uB','333302a0-0000-4000-8000-000000000003'),('uIna','444402a0-0000-4000-8000-000000000004'),
 ('uSem','555502a0-0000-4000-8000-000000000005'),
 ('fazA','ffff02a0-0000-4000-8000-00000000000a'),('fazB','ffff02a0-0000-4000-8000-00000000000b'),
 ('contaA','cccc02a0-0000-4000-8000-00000000000a'),('contaB','cccc02a0-0000-4000-8000-00000000000b');
INSERT INTO public.clientes(id,nome) VALUES ((SELECT u FROM _ids WHERE k='cliA'),'FX02A A'),((SELECT u FROM _ids WHERE k='cliB'),'FX02A B');
INSERT INTO public.fazendas(id,cliente_id,nome) VALUES
 ((SELECT u FROM _ids WHERE k='fazA'),(SELECT u FROM _ids WHERE k='cliA'),'FX02A FAZ A'),
 ((SELECT u FROM _ids WHERE k='fazB'),(SELECT u FROM _ids WHERE k='cliB'),'FX02A FAZ B');
INSERT INTO public.financeiro_contas_bancarias(id,cliente_id,nome_conta) VALUES
 ((SELECT u FROM _ids WHERE k='contaA'),(SELECT u FROM _ids WHERE k='cliA'),'FX02A CONTA A'),
 ((SELECT u FROM _ids WHERE k='contaB'),(SELECT u FROM _ids WHERE k='cliB'),'FX02A CONTA B');
INSERT INTO public.cliente_membros(cliente_id,user_id,perfil,ativo) VALUES
 ((SELECT u FROM _ids WHERE k='cliA'),(SELECT u FROM _ids WHERE k='uAdm'),'admin_agroinblue',true),
 ((SELECT u FROM _ids WHERE k='cliA'),(SELECT u FROM _ids WHERE k='uA'),'operador',true),
 ((SELECT u FROM _ids WHERE k='cliB'),(SELECT u FROM _ids WHERE k='uB'),'operador',true),
 ((SELECT u FROM _ids WHERE k='cliA'),(SELECT u FROM _ids WHERE k='uIna'),'operador',false);
SET LOCAL session_replication_role = origin;

-- ============ ANTI-ORACULO E AUTORIZACAO ============
DO $$ DECLARE a text;b text;c text;d text;e text;
BEGIN
  a:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),'00000000-0000-4000-8000-00000000dead');   -- fazenda inexistente
  b:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazB'));      -- fazenda alheia
  c:=pg_temp.criar((SELECT u FROM _ids WHERE k='uIna'),(SELECT u FROM _ids WHERE k='fazA'));    -- inativo
  d:=pg_temp.criar((SELECT u FROM _ids WHERE k='uSem'),(SELECT u FROM _ids WHERE k='fazA'));    -- sem membership
  e:=pg_temp.criar(NULL,(SELECT u FROM _ids WHERE k='fazA'));                                    -- auth nulo
  PERFORM pg_temp.reg('A1 fazenda inexistente recusada', a LIKE 'ERR|P0002%', left(a,45));
  PERFORM pg_temp.reg('A2 fazenda alheia identica a inexistente', b=a, left(b,45));
  PERFORM pg_temp.reg('A3 inativo identico', c=a, '');
  PERFORM pg_temp.reg('A4 sem membership identico', d=a, '');
  PERFORM pg_temp.reg('A5 auth nulo identico', e=a, '');
  PERFORM pg_temp.reg('A6 sem vazamento', a NOT ILIKE '%financeiro_%' AND a NOT ILIKE '%fazenda%' AND a NOT ILIKE '%42501%', '');
  PERFORM pg_temp.reg('A7 nenhum contrato criado nas recusas',
    (SELECT count(*) FROM public.financeiro_contratos WHERE produto='FX02A prod')=0, '');
END $$;

-- ============ VALIDACOES POS-AUTORIZACAO ============
DO $$ DECLARE r text;
BEGIN
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),100,NULL);
  PERFORM pg_temp.reg('B1 data de inicio nula recusada', r LIKE 'ERR|P0001|data de inicio%', left(r,45));
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),100,date '2026-06-01',date '2026-01-01');
  PERFORM pg_temp.reg('B2 data final anterior recusada', r LIKE 'ERR|P0001|data final anterior%', left(r,45));
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),100,date '2026-01-31',date '2027-12-31',99);
  PERFORM pg_temp.reg('B3 dia de vencimento invalido recusado', r LIKE 'ERR|P0001|dia de vencimento%', left(r,45));
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),-5);
  PERFORM pg_temp.reg('B4 valor negativo recusado', r LIKE 'ERR|P0001|valor invalido%', left(r,45));
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),100,date '2026-01-31',date '2027-12-31',31,'inventado');
  PERFORM pg_temp.reg('B5 status invalido recusado', r LIKE 'ERR|P0001|status inicial%', left(r,45));
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),100,date '2026-01-31',date '2027-12-31',31,'ativo',(SELECT u FROM _ids WHERE k='contaB'));
  PERFORM pg_temp.reg('B6 conta de outro tenant recusada', r LIKE 'ERR|P0001|conta bancaria%', left(r,45));
  PERFORM pg_temp.reg('B7 nenhuma validacao deixou residuo',
    (SELECT count(*) FROM public.financeiro_contratos WHERE produto='FX02A prod')=0, '');
END $$;

-- ============ ATOMICIDADE: falha no TERCEIRO insert ============
DO $$ DECLARE r text; n_ct int; n_ob int; alcancou int;
BEGIN
  -- Contador em SEQUENCE: nextval e nao-transacional, entao sobrevive ao
  -- rollback da RPC. Uma tabela contadora seria revertida junto e nao
  -- provaria nada — foi o que o gate C2 pegou na primeira execucao.
  CREATE TEMP SEQUENCE _seq_fx02a; GRANT ALL ON SEQUENCE _seq_fx02a TO PUBLIC;
  CREATE OR REPLACE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $b$
  DECLARE k bigint; BEGIN
    k := nextval('_seq_fx02a');
    IF k = 3 THEN RAISE EXCEPTION 'FALHA DELIBERADA NO TERCEIRO INSERT'; END IF;
    RETURN NEW; END $b$;
  CREATE TRIGGER zz_fx02a BEFORE INSERT ON public.financeiro_lancamentos_v2
    FOR EACH ROW WHEN (NEW.contrato_id IS NOT NULL) EXECUTE FUNCTION pg_temp.boom();

  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),777);
  DROP TRIGGER zz_fx02a ON public.financeiro_lancamentos_v2;

  SELECT last_value INTO alcancou FROM _seq_fx02a;
  SELECT count(*) INTO n_ct FROM public.financeiro_contratos WHERE produto='FX02A prod';
  SELECT count(*) INTO n_ob FROM public.financeiro_lancamentos_v2 WHERE valor=777;

  PERFORM pg_temp.reg('C1 erro propagado', r LIKE 'ERR|%DELIBERADA%', left(r,55));
  PERFORM pg_temp.reg('C2 o TERCEIRO insert foi alcancado', alcancou = 3, alcancou||' inserts tentados');
  PERFORM pg_temp.reg('C3 zero contrato persistido', n_ct = 0, n_ct::text);
  PERFORM pg_temp.reg('C4 zero obrigacao persistida', n_ob = 0, n_ob::text);
END $$;

-- ============ CAMINHO FELIZ ============
DO $$ DECLARE r text; j jsonb; cid uuid; n int;
BEGIN
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),321,
     date '2026-01-31',date '2027-12-31',31,'ativo',(SELECT u FROM _ids WHERE k='contaA'));
  PERFORM pg_temp.reg('D1 criacao autorizada OK', r LIKE 'OK|%', left(r,80));
  IF r LIKE 'OK|%' THEN
    j:=replace(r,'OK|','')::jsonb; cid:=(j->>'contrato_id')::uuid;
    PERFORM pg_temp.reg('D2 retorno minimo (ok/contrato_id/criadas/versao), sem id de obrigacao',
      (j?'ok') AND (j?'contrato_id') AND (j?'criadas') AND (j?'versao') AND (SELECT count(*) FROM jsonb_object_keys(j))=4, j::text);
    PERFORM pg_temp.reg('D3 exatamente um contrato criado',
      (SELECT count(*) FROM public.financeiro_contratos WHERE id=cid)=1, '');
    PERFORM pg_temp.reg('D4 cliente_id resolvido no servidor',
      (SELECT cliente_id FROM public.financeiro_contratos WHERE id=cid)=(SELECT u FROM _ids WHERE k='cliA'), '');
    SELECT count(*) INTO n FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid;
    PERFORM pg_temp.reg('D5 cronograma completo e <= 37', n>0 AND n<=37, n||' parcelas');
    PERFORM pg_temp.reg('D6 criadas do retorno = cronograma real', (j->>'criadas')::int = n, j->>'criadas');
    PERFORM pg_temp.reg('D7 vencimento preenchido em todas',
      (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid AND data_vencimento IS NULL)=0, '');
    PERFORM pg_temp.reg('D8 pagamento NULL em todas',
      (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid AND data_pagamento IS NOT NULL)=0, '');
    PERFORM pg_temp.reg('D9 status programado em todas',
      (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid AND status_transacao<>'programado')=0, '');
    PERFORM pg_temp.reg('D10 ano_mes derivado pelo 02E da competencia',
      (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid AND ano_mes IS DISTINCT FROM to_char(data_competencia,'YYYY-MM'))=0, '');
    PERFORM pg_temp.reg('D11 origem contrato e contrato_id corretos',
      (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid AND origem_lancamento='contrato')=n, '');
    PERFORM pg_temp.reg('D12 clamp fev/2027 (dia 31 -> 28)',
      EXISTS(SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid
              AND data_competencia=date '2027-02-28' AND data_vencimento=date '2027-02-28'), '');
    PERFORM pg_temp.reg('D13 multiplicidade por competencia = 1',
      (SELECT coalesce(max(c),0) FROM (SELECT data_competencia,count(*) c FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid GROUP BY data_competencia) x)=1, '');
    PERFORM pg_temp.reg('D14 zero linha defeituosa tipo-126 criada',
      (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE contrato_id=cid AND data_pagamento IS NOT NULL AND data_vencimento IS NULL)=0, '');
  END IF;
  -- admin
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uAdm'),(SELECT u FROM _ids WHERE k='fazA'),50);
  PERFORM pg_temp.reg('D15 admin autorizado', r LIKE 'OK|%', left(r,40));
  -- teto 37 com contrato longo
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),9,date '2026-01-10',date '2040-12-31',10);
  IF r LIKE 'OK|%' THEN
    PERFORM pg_temp.reg('D16 teto de 37 respeitado',
      (replace(r,'OK|','')::jsonb->>'criadas')::int = 37, (replace(r,'OK|','')::jsonb->>'criadas'));
  END IF;
  -- status nao-ativo nasce sem cronograma (paridade com o gerador antigo)
  r:=pg_temp.criar((SELECT u FROM _ids WHERE k='uA'),(SELECT u FROM _ids WHERE k='fazA'),10,date '2026-01-10',date '2026-12-31',10,'pausado');
  IF r LIKE 'OK|%' THEN
    PERFORM pg_temp.reg('D17 contrato pausado nasce sem cronograma',
      (replace(r,'OK|','')::jsonb->>'criadas')::int = 0, (replace(r,'OK|','')::jsonb->>'criadas'));
  END IF;
END $$;

-- ============ FORMA / NAO-REGRESSAO ============
SELECT pg_temp.reg('E1 ACL = authenticated + postgres',
 (SELECT coalesce(string_agg(coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type,',' ORDER BY coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC'), a.privilege_type),'x')
   FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.proname='fn_contrato_criar_e_gerar')='authenticated:EXECUTE,postgres:EXECUTE','');
SELECT pg_temp.reg('E2 anon e service_role sem EXECUTE',
 NOT has_function_privilege('anon',(SELECT oid FROM pg_proc WHERE proname='fn_contrato_criar_e_gerar'),'EXECUTE')
 AND NOT has_function_privilege('service_role',(SELECT oid FROM pg_proc WHERE proname='fn_contrato_criar_e_gerar'),'EXECUTE'),'');
SELECT pg_temp.reg('E3 SECDEF/owner/search_path',
 (SELECT prosecdef AND pg_get_userbyid(proowner)='postgres'::name AND array_to_string(proconfig,',')='search_path=public, pg_temp'
   FROM pg_proc WHERE proname='fn_contrato_criar_e_gerar'),'');
SELECT pg_temp.reg('E4 corpo sem WHEN OTHERS e sem conciliado_em',
 (SELECT position('WHEN OTHERS' in upper(prosrc))=0 AND position('conciliado_em' in prosrc)=0
   FROM pg_proc WHERE proname='fn_contrato_criar_e_gerar'),'');
SELECT pg_temp.reg('E5 RPC 01B byte-identica (md5 congelado)',
 (SELECT md5(prosrc) FROM pg_proc WHERE proname='fn_contrato_editar_e_regenerar')='0582f5631538289295cc22d8b4965d86','');
SELECT pg_temp.reg('E6 01A com 3 policies',
 (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass)=3,'');
SELECT pg_temp.reg('E7 nenhuma policy DELETE',
 (SELECT count(*) FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass AND polcmd='d')=0,'');
SELECT pg_temp.reg('E8 02E intacto',
 (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.financeiro_lancamentos_v2'::regclass AND tgname='trg_00_ano_mes_from_competencia')=1,'');
SELECT pg_temp.reg('E9 contratos seguem sem indice',
 (SELECT count(*) FROM pg_index WHERE indrelid='public.financeiro_contratos'::regclass)=0,'');

SELECT g, CASE WHEN ok THEN 'PASS' ELSE 'FALHA' END res, obs FROM _r ORDER BY g;
SELECT count(*) FILTER (WHERE ok) pass, count(*) FILTER (WHERE NOT ok) fail, count(*) total FROM _r;
ROLLBACK;
