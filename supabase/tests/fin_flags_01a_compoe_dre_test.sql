-- FIN-FLAGS-01A — testes transacionais da materialização de compoe_dre (T1..T50).
--   Precedência soberana: (1) transferência 3-* → false; (2) matriz por macro; (3) plano só como
--   fallback quando a macro está fora da matriz; (4) NULL sem regra. T44..T50 cobrem conflito matriz×plano.
--   Requer aplicadas: 20260729120000 (curadoria plano), 20260729130000 (materialização
--   INSERT/UPDATE), 20260729140000 (backfill). BEGIN...ROLLBACK; NÃO persiste. Rodar SOMENTE
--   no PROTO (binbcdfbisgscrifztia). Fixtures: cliente/fazenda/conta/planos reais; lote NULL ⇒
--   hash NULL ⇒ sem colisão de unique_hash. Injeta macro direto (subcentro/plano NULL) para
--   testar a matriz sem depender de subcentro do plano; usa planos reais para reclassificação.
BEGIN;

DO $t$
DECLARE
  v_cli uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  v_faz uuid := '161b905e-f14c-4a9b-965f-dd3c8f82dc74';
  v_cd  uuid := 'a5ed9922-e476-4ec0-a19c-6481140e52eb';  -- conta destino p/ transfer singular
  v_pt  uuid := '7d638171-b59b-4bf1-a9ca-e7396f996adb';  -- plano TRUE  (Receita Operacional)
  v_pf  uuid := '0d957095-af4d-41d9-ae88-bbb793e8344b';  -- plano FALSE (Entrada Financeira → curado false)
  v_id uuid; v_d boolean; v_g boolean; v_cnt int; v_val numeric; v_desc text; v_ok boolean;
  v_oldd text; v_newd text;
  v_p44 uuid; v_p45 uuid; v_p46 uuid; v_p47 uuid;   -- planos artificiais (conflito matriz × plano)
BEGIN
  -- Sanidade das fixtures de plano (curadoria já aplicada nesta migration-set)
  SELECT compoe_dre INTO v_d FROM public.financeiro_plano_contas WHERE id=v_pt;
  IF v_d IS DISTINCT FROM true  THEN RAISE EXCEPTION 'fixture: plano TRUE não está true (curadoria)'; END IF;
  SELECT compoe_dre INTO v_d FROM public.financeiro_plano_contas WHERE id=v_pf;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'fixture: plano FALSE não está false (curadoria)'; END IF;

  -- ══════════ TRANSFERÊNCIA SOBERANA ══════════
  -- T1 3-Transferências (plural) ⇒ false
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,valor,descricao)
    VALUES (v_cli,v_faz,'3-Transferências',10,'FF01A T1') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T1 FAIL: %',v_d; END IF;

  -- T2 3-Transferência (singular, exige conta destino) ⇒ false
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,conta_destino_id,valor,descricao)
    VALUES (v_cli,v_faz,'3-Transferência',v_cd,11,'FF01A T2') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T2 FAIL: %',v_d; END IF;

  -- T3 transferência com macro NULL ⇒ false
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'3-Transferências',NULL,12,'FF01A T3') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T3 FAIL: %',v_d; END IF;

  -- T4 transferência ligada a plano compoe_dre=true ⇒ continua false (soberania sobre plano)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'3-Transferências',v_pt,13,'FF01A T4') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T4 FAIL: %',v_d; END IF;

  -- T5 transferência enviada explicitamente true ⇒ termina false (soberania sobre override)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,compoe_dre,valor,descricao)
    VALUES (v_cli,v_faz,'3-Transferências',true,14,'FF01A T5') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T5 FAIL: %',v_d; END IF;

  -- ══════════ MATRIZ TRUE ══════════
  -- T6 Receita Operacional
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',20,'FF01A T6') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T6 FAIL: %',v_d; END IF;
  -- T7 Custeio Produção
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Custeio Produção',21,'FF01A T7') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T7 FAIL: %',v_d; END IF;
  -- T8 Deduções de Receitas
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Deduções de Receitas',22,'FF01A T8') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T8 FAIL: %',v_d; END IF;
  -- T9 Investimento na Fazenda
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Investimento na Fazenda',23,'FF01A T9') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T9 FAIL: %',v_d; END IF;
  -- T10 Investimento em Bovinos
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Investimento em Bovinos',24,'FF01A T10') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T10 FAIL: %',v_d; END IF;
  -- T11..T14 Tributos (ITR/CCIR/IRPF/IRPJ) ⇒ todos true (matriz por macro)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Tributos',25,'FF01A T11 ITR') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T11 FAIL ITR: %',v_d; END IF;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Tributos',26,'FF01A T12 CCIR') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T12 FAIL CCIR: %',v_d; END IF;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Tributos',27,'FF01A T13 IRPF') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T13 FAIL IRPF: %',v_d; END IF;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Tributos',28,'FF01A T14 IRPJ') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T14 FAIL IRPJ: %',v_d; END IF;

  -- ══════════ MATRIZ FALSE ══════════
  -- T15 Dividendos
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Dividendos',30,'FF01A T15') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T15 FAIL: %',v_d; END IF;
  -- T16 Entrada Financeira
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Entrada Financeira',31,'FF01A T16') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T16 FAIL: %',v_d; END IF;
  -- T17 Saída Financeira
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Saída Financeira',32,'FF01A T17') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T17 FAIL: %',v_d; END IF;
  -- T18 Financeiro
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Financeiro',33,'FF01A T18') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T18 FAIL: %',v_d; END IF;
  -- T19 Transferências (macro, não tipo)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Transferências',34,'FF01A T19') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T19 FAIL: %',v_d; END IF;
  -- T20 Entre Contas
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','Entre Contas',35,'FF01A T20') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T20 FAIL: %',v_d; END IF;

  -- ══════════ RESIDUAL / OVERRIDE (INSERT) ══════════
  -- T21 sem regra determinística (macro NULL, sem plano/subcentro) ⇒ NULL
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas',NULL,40,'FF01A T21') RETURNING compoe_dre INTO v_d;
  IF v_d IS NOT NULL THEN RAISE EXCEPTION 'T21 FAIL (esperado NULL): %',v_d; END IF;
  -- T22 override explícito em não-transferência preserva (macro NULL ⇒ matriz daria NULL, mas explícito vence)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,compoe_dre,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas',NULL,true,41,'FF01A T22') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T22 FAIL: %',v_d; END IF;

  -- ══════════ UPDATE SEM RECLASSIFICAÇÃO (override manual) ══════════
  -- T23 true→false manual
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',50,'FF01A T23') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=false WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T23 FAIL: %',v_d; END IF;
  -- T24 false→true manual
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Dividendos',51,'FF01A T24') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=true WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T24 FAIL: %',v_d; END IF;
  -- T25 update sem alterar flag preserva
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',52,'FF01A T25') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET descricao='FF01A T25 edit' WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T25 FAIL: %',v_d; END IF;

  -- ══════════ RECLASSIFICAÇÃO ESTRUTURAL ══════════
  -- T26 plano true→plano false ⇒ false (limpa subcentro p/ reresolver pelo novo plano)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',v_pt,60,'FF01A T26') RETURNING id,compoe_dre INTO v_id,v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T26 pré FAIL: %',v_d; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET plano_conta_id=v_pf, subcentro=NULL WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T26 FAIL: %',v_d; END IF;
  -- T27 plano false→plano true ⇒ true
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',v_pf,61,'FF01A T27') RETURNING id,compoe_dre INTO v_id,v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T27 pré FAIL: %',v_d; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET plano_conta_id=v_pt, subcentro=NULL WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T27 FAIL: %',v_d; END IF;
  -- T28 macro true→macro false ⇒ false
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',62,'FF01A T28') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET macro_custo='Dividendos' WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T28 FAIL: %',v_d; END IF;
  -- T29 macro false→macro true ⇒ true
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Dividendos',63,'FF01A T29') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET macro_custo='Receita Operacional' WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T29 FAIL: %',v_d; END IF;
  -- T30 não-transfer → tipo 3-* força false
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',64,'FF01A T30') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET tipo_operacao='3-Transferências' WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T30 FAIL: %',v_d; END IF;
  -- T31 transfer → não-transfer recalcula pela nova classificação
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,valor,descricao)
    VALUES (v_cli,v_faz,'3-Transferências',65,'FF01A T31') RETURNING id,compoe_dre INTO v_id,v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T31 pré FAIL: %',v_d; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET tipo_operacao='1-Entradas', macro_custo='Receita Operacional' WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T31 FAIL: %',v_d; END IF;
  -- T32 override manual anterior NÃO sobrevive à reclassificação
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',66,'FF01A T32') RETURNING id INTO v_id;
  -- muda a flag manual (false) e reclassifica na MESMA operação (macro→Custeio, ainda true-set)
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=false, macro_custo='Custeio Produção' WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T32 FAIL (override deveria ser descartado): %',v_d; END IF;
  -- T33 residual continua NULL após UPDATE sem regra
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas',NULL,67,'FF01A T33') RETURNING id,compoe_dre INTO v_id,v_d;
  IF v_d IS NOT NULL THEN RAISE EXCEPTION 'T33 pré FAIL: %',v_d; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET descricao='FF01A T33 edit' WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS NOT NULL THEN RAISE EXCEPTION 'T33 FAIL (deveria permanecer NULL): %',v_d; END IF;

  -- ══════════ IDEMPOTÊNCIA ══════════
  -- T34 backfill idempotente: re-execução não altera nenhuma linha (migration já aplicada)
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=false
   WHERE tipo_operacao ILIKE '3-%' AND compoe_dre IS DISTINCT FROM false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T34 FAIL (transfer soberana re-run afetou %)',v_cnt; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=false
   WHERE compoe_dre IS NULL AND macro_custo IN ('Transferências','Entre Contas','Dividendos','Entrada Financeira','Saída Financeira','Financeiro');
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T34 FAIL (macro-false re-run afetou %)',v_cnt; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=true
   WHERE compoe_dre IS NULL AND macro_custo IN ('Receita Operacional','Custeio Produção','Deduções de Receitas','Investimento na Fazenda','Investimento em Bovinos','Tributos');
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T34 FAIL (macro-true re-run afetou %)',v_cnt; END IF;
  -- T35 curadoria do plano idempotente
  UPDATE public.financeiro_plano_contas SET compoe_dre=false
   WHERE macro_custo IN ('Transferências','Entre Contas','Dividendos','Entrada Financeira','Saída Financeira','Financeiro') AND compoe_dre IS DISTINCT FROM false;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T35 FAIL (curadoria false re-run afetou %)',v_cnt; END IF;
  UPDATE public.financeiro_plano_contas SET compoe_dre=true
   WHERE macro_custo IN ('Receita Operacional','Custeio Produção','Deduções de Receitas','Investimento na Fazenda','Investimento em Bovinos','Tributos') AND compoe_dre IS DISTINCT FROM true;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T35 FAIL (curadoria true re-run afetou %)',v_cnt; END IF;

  -- ══════════ AUDITORIA ══════════
  -- T36 audit registra OLD/NEW de alteração manual da flag
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',70,'FF01A T36') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=false WHERE id=v_id;
  SELECT dados_anteriores->>'compoe_dre', dados_novos->>'compoe_dre' INTO v_oldd,v_newd
    FROM public.audit_log WHERE registro_id=v_id AND tabela_origem='financeiro_lancamentos_v2' ORDER BY created_at DESC LIMIT 1;
  IF v_oldd IS DISTINCT FROM 'true' OR v_newd IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'T36 FAIL: old=% new=%',v_oldd,v_newd; END IF;
  -- T37 audit registra OLD/NEW de recomposição automática (reclassificação)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',71,'FF01A T37') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET macro_custo='Dividendos' WHERE id=v_id;
  SELECT dados_anteriores->>'compoe_dre', dados_novos->>'compoe_dre' INTO v_oldd,v_newd
    FROM public.audit_log WHERE registro_id=v_id AND tabela_origem='financeiro_lancamentos_v2' ORDER BY created_at DESC LIMIT 1;
  IF v_oldd IS DISTINCT FROM 'true' OR v_newd IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'T37 FAIL: old=% new=%',v_oldd,v_newd; END IF;
  -- T38 sem auditoria duplicada: 1 UPDATE ⇒ exatamente 1 registro de audit
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',72,'FF01A T38') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=false WHERE id=v_id;
  SELECT count(*) INTO v_cnt FROM public.audit_log WHERE registro_id=v_id AND tabela_origem='financeiro_lancamentos_v2';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T38 FAIL (audit rows=%)',v_cnt; END IF;
  -- T39 sem recursão: o UPDATE acima completou sem erro de stack e sem cascata (T38 já garante 1 audit);
  --   confirma também que a função não gerou UPDATE extra na própria tabela (updated na linha == 1 via audit).
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T39 FAIL: cascata detectada (%)',v_cnt; END IF;

  -- ══════════ NÃO-INTERFERÊNCIA ══════════
  -- T40 nenhum teste altera gera_lcdpr: UPDATE de compoe_dre preserva gera_lcdpr
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,gera_lcdpr,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',true,80,'FF01A T40') RETURNING id,gera_lcdpr INTO v_id,v_g;
  IF v_g IS DISTINCT FROM true THEN RAISE EXCEPTION 'T40 pré FAIL gera_lcdpr=%',v_g; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=false, macro_custo='Dividendos' WHERE id=v_id RETURNING gera_lcdpr INTO v_g;
  IF v_g IS DISTINCT FROM true THEN RAISE EXCEPTION 'T40 FAIL (gera_lcdpr alterado): %',v_g; END IF;
  -- T41 nenhum campo financeiro não relacionado é alterado
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',81.37,'FF01A T41') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=false WHERE id=v_id;
  SELECT valor,descricao INTO v_val,v_desc FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_val IS DISTINCT FROM 81.37 OR v_desc IS DISTINCT FROM 'FF01A T41' THEN RAISE EXCEPTION 'T41 FAIL: valor=% desc=%',v_val,v_desc; END IF;
  -- T42 trigger de cancelamento continua funcionando (audit acao=cancelou; flag preservada)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','Receita Operacional',82,'FF01A T42') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T42 FAIL (flag alterada no cancelamento): %',v_d; END IF;
  SELECT acao INTO v_desc FROM public.audit_log WHERE registro_id=v_id AND tabela_origem='financeiro_lancamentos_v2' ORDER BY created_at DESC LIMIT 1;
  IF v_desc IS DISTINCT FROM 'cancelou' THEN RAISE EXCEPTION 'T42 FAIL (audit acao=%)',v_desc; END IF;
  -- T43 guard de transferência continua funcionando (3-Transferência singular sem conta destino ⇒ erro)
  v_ok := false;
  BEGIN
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,valor,descricao)
      VALUES (v_cli,v_faz,'3-Transferência',90,'FF01A T43');
  EXCEPTION WHEN others THEN
    v_ok := (SQLERRM LIKE 'Transferência deve ter conta de destino%');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T43 FAIL: guard de transferência não disparou'; END IF;

  -- ══════════ CONFLITO MATRIZ × PLANO (matriz soberana; plano só fallback) ══════════
  -- plano_contas não tem CHECK/UNIQUE e (após mig1) compoe_dre é nullable ⇒ planos artificiais válidos.
  INSERT INTO public.financeiro_plano_contas (macro_custo,subcentro,tipo_operacao,ativo,compoe_dre)
    VALUES ('Dividendos','FF01A P44','1-Entradas',true,true) RETURNING id INTO v_p44;           -- macro FALSE, plano true
  INSERT INTO public.financeiro_plano_contas (macro_custo,subcentro,tipo_operacao,ativo,compoe_dre)
    VALUES ('Receita Operacional','FF01A P45','1-Entradas',true,false) RETURNING id INTO v_p45;  -- macro TRUE, plano false
  INSERT INTO public.financeiro_plano_contas (macro_custo,subcentro,tipo_operacao,ativo,compoe_dre)
    VALUES ('FF01A ForaMatriz','FF01A P46','1-Entradas',true,true) RETURNING id INTO v_p46;      -- fora da matriz, plano true
  INSERT INTO public.financeiro_plano_contas (macro_custo,subcentro,tipo_operacao,ativo,compoe_dre)
    VALUES ('FF01A ForaMatriz','FF01A P47','1-Entradas',true,false) RETURNING id INTO v_p47;     -- fora da matriz, plano false

  -- T44 macro FALSE canônica + plano true ⇒ false (matriz vence o plano)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',v_p44,100,'FF01A T44') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T44 FAIL: %',v_d; END IF;
  -- T45 macro TRUE canônica + plano false ⇒ true (matriz vence o plano)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',v_p45,101,'FF01A T45') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T45 FAIL: %',v_d; END IF;
  -- T46 macro fora da matriz + plano true ⇒ herda true (plano fallback)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',v_p46,102,'FF01A T46') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T46 FAIL: %',v_d; END IF;
  -- T47 macro fora da matriz + plano false ⇒ herda false (plano fallback)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',v_p47,103,'FF01A T47') RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T47 FAIL: %',v_d; END IF;
  -- T48 macro fora da matriz sem plano determinístico ⇒ permanece NULL
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas','FF01A ForaMatriz',104,'FF01A T48') RETURNING compoe_dre INTO v_d;
  IF v_d IS NOT NULL THEN RAISE EXCEPTION 'T48 FAIL (esperado NULL): %',v_d; END IF;
  -- T49 reclassificação p/ macro FALSE com plano divergente true ⇒ false
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',v_pt,105,'FF01A T49') RETURNING id,compoe_dre INTO v_id,v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T49 pré: %',v_d; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET plano_conta_id=v_p44, subcentro=NULL WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T49 FAIL: %',v_d; END IF;
  -- T50 reclassificação p/ macro TRUE com plano divergente false ⇒ true
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,plano_conta_id,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',v_pf,106,'FF01A T50') RETURNING id,compoe_dre INTO v_id,v_d;
  IF v_d IS DISTINCT FROM false THEN RAISE EXCEPTION 'T50 pré: %',v_d; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET plano_conta_id=v_p45, subcentro=NULL WHERE id=v_id RETURNING compoe_dre INTO v_d;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T50 FAIL: %',v_d; END IF;

  RAISE NOTICE '=== FIN-FLAGS-01A: T1..T50 PASS ===';
END $t$;

ROLLBACK;  -- nada persiste
SELECT 'fin_flags_01a_rolled_back' AS fim;
