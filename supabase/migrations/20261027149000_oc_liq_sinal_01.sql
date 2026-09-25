-- OC-LIQ-SINAL-01 (A) — a natureza da liquidacao segue a DIRECAO do titulo
--
-- POR QUE
-- `oc_sincronizar_liquidacao_de_financeiro` gravava a natureza pelo TIPO DA OC (compra = 'pagamento',
-- resto = 'recebimento'). Saida ligada a venda/abate — imposto, frete, comissao, adiantamento do boitel,
-- devolucao ao comprador — ficava 'recebimento'. Medido em 25/09/2026: 35 liquidacoes automaticas (32
-- vivas, 3 estornadas), 14 OCs, R$ 228.258,77 vivos; 28 delas sao obrigacoes materializadas pela
-- PROPRIA OC (o "Gerar previsao"), 3 do Vincular, 1 frete manual. Nenhuma compra com entrada.
--
-- ⚠ A NATUREZA NAO ENTRA EM CONTA NENHUMA HOJE, e foi MEDIDO: nenhuma funcao, view ou tela soma ou
--   exibe por ela (`vw_oc_operacao_liquidacao` e `oc_derivar_status` somam TODAS as liquidacoes vivas,
--   pelo modelo da ADR-19; o modal da OC separa os lados pela conta do plano do compromisso). A prova
--   abaixo mostra os numeros das 14 OCs IDENTICOS antes e depois. Esta migration e' higiene de dado: ela
--   deixa a natureza confiavel para o OC-STATUS-LADO-01 dividir o estado por lado.
-- ⚠ AS DUAS FONTES DE DIRECAO CONCORDAM: a conta do plano do compromisso e o `tipo_operacao` do titulo
--   batem em 130 de 130 liquidacoes vivas. A funcao usa o titulo, que ela ja' tem na mao (`v_f`).
--
-- O ESCRITOR MANUAL ALINHA A MESMA REGRA. `oc_registrar_liquidacao` exigia a natureza "esperada pelo
-- tipo da OC", e a tela de liquidacao manual (`AbaLiquidacaoOC`) liquida QUALQUER obrigacao com titulo —
-- inclusive saida numa venda. Sem alinhar, o defeito voltaria pela porta manual. Agora: com titulo, a
-- natureza e' a direcao dele; sem titulo (permuta/compensacao), o lado da operacao. Natureza omitida
-- (NULL) e' derivada pelo servidor; natureza informada e diferente da esperada continua recusada. O front
-- passou a mandar NULL quando ha' titulo. Hoje ha' ZERO liquidacoes manuais no banco (medido).
--
-- METODO: patch guardado por md5 (regra do CLAUDE.md, aprovada em 24/09/2026), cabecalho do proprio
-- `pg_get_functiondef`. Cada ancora casa 1x; conceito contado ('v_nat :=' 1x na sincronizacao;
-- 'v_esperada' 4x no registrar — declaracao, a atribuicao patcheada, o IF e a mensagem).
--   oc_sincronizar_liquidacao_de_financeiro  538b870641cc7695f3e053e2d7b9334f -> d139826a1afbada6e4f7676c8e38b2f4
--   oc_registrar_liquidacao                  e4e7f0abfd03d33b8ea14d41e57b4d37 -> 430a34dd36bf0954605d248ca832efca
--
-- BACKFILL: so' `origem = 'financeiro'` (as automaticas), vivas e estornadas, onde a natureza difere da
-- direcao do titulo. Nao toca lancamento, conciliacao, valor, estorno nem operacao.

do $mig$
declare
  r record;
  v_def text; v_src text; v_depois text;
  n_bf int;
begin
  for r in
    select * from (values
      ('oc_sincronizar_liquidacao_de_financeiro',
       '538b870641cc7695f3e053e2d7b9334f',
       $a$v_nat := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagamento' ELSE 'recebimento' END;$a$,
       $a$v_nat := CASE WHEN v_f.tipo_operacao = '2-Saídas' THEN 'pagamento' ELSE 'recebimento' END;$a$,
       'd139826a1afbada6e4f7676c8e38b2f4'),
      ('oc_registrar_liquidacao',
       'e4e7f0abfd03d33b8ea14d41e57b4d37',
       E'  v_esperada := CASE v_op.tipo_operacao WHEN ''compra'' THEN ''pagamento'' ELSE ''recebimento'' END;\n  IF v_nat <> v_esperada THEN',
       E'  -- OC-LIQ-SINAL-01: com titulo, a natureza e'' a DIRECAO dele (entrada = recebimento, saida = pagamento),\n  -- a mesma regra da liquidacao automatica; sem titulo (permuta/compensacao), o lado da operacao.\n  v_esperada := COALESCE(\n    (SELECT CASE WHEN f.tipo_operacao = ''2-Saídas'' THEN ''pagamento'' ELSE ''recebimento'' END\n       FROM public.financeiro_lancamentos_v2 f WHERE f.id = NULLIF(p_payload->>''financeiro_lancamento_id'','''')::uuid),\n    CASE v_op.tipo_operacao WHEN ''compra'' THEN ''pagamento'' ELSE ''recebimento'' END);\n  v_nat := COALESCE(v_nat, v_esperada);\n  IF v_nat <> v_esperada THEN',
       '430a34dd36bf0954605d248ca832efca')
    ) as t(nome, md5_antes, ancora, novo, md5_depois)
  loop
    select p.prosrc, pg_get_functiondef(p.oid) into v_src, v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = r.nome and n.nspname = 'public';
    if md5(v_src) <> r.md5_antes then
      raise exception '% nao esta no corpo esperado (md5 %). Migration abortada.', r.nome, md5(v_src);
    end if;
    if (length(v_src) - length(replace(v_src, r.ancora, ''))) / length(r.ancora) <> 1 then
      raise exception 'a ancora de % nao casa exatamente 1x', r.nome;
    end if;
    execute replace(v_def, r.ancora, r.novo);
    select p.prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = r.nome and n.nspname = 'public';
    if md5(v_depois) <> r.md5_depois then
      raise exception '% ficou com corpo inesperado (md5 %). Esperado %.', r.nome, md5(v_depois), r.md5_depois;
    end if;
  end loop;

  UPDATE public.zoo_operacao_liquidacoes l
     SET natureza = CASE f.tipo_operacao WHEN '2-Saídas' THEN 'pagamento' ELSE 'recebimento' END
    FROM public.financeiro_lancamentos_v2 f
   WHERE f.id = l.financeiro_lancamento_id
     AND l.origem = 'financeiro'
     AND l.natureza IS DISTINCT FROM (CASE f.tipo_operacao WHEN '2-Saídas' THEN 'pagamento' ELSE 'recebimento' END);
  GET DIAGNOSTICS n_bf = ROW_COUNT;
  IF n_bf <> 35 THEN
    RAISE EXCEPTION 'backfill tocaria % linhas, esperado 35 (medido 25/09/2026). Migration abortada.', n_bf;
  END IF;
end $mig$;
