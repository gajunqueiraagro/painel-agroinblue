-- PLANO-LEITOR-POR-CLIENTE-01 (passo 1) — QUEM PROCURA CONTA DO PLANO PELO NOME OLHA O CLIENTE (Gabriel, 09/10/2026).
--
-- REGRA: todo leitor do plano pelo nome responde pela regra de `fn_plano_conta_do_texto(cliente, subcentro, tipo)` — a conta do
-- cliente do lancamento; na falta, a global; duas do cliente = nenhuma. Conta de OUTRO cliente nunca e' lida, nem para "existe?",
-- nem para compoe_dre / gera_lcdpr. Nenhuma regra nova: os tres leitores abaixo passam a perguntar ao dono.
--
--   materializar_dre_lcdpr_from_plano (gatilho BEFORE INSERT OR UPDATE do lancamento)
--     · sem chave: as duas buscas por nome (com tipo, depois sem tipo; LIMIT 1 SEM cliente) viram duas perguntas ao dono, com o
--       cliente do lancamento — com o tipo do lancamento e, na falta, em qualquer tipo (o dono, tipo a tipo). Sem conta resolvida:
--       o de sempre (v_found falso -> compoe_dre pela matriz da macro, senao NULL; gera_lcdpr nao e' tocado).
--     · VIRA SECURITY DEFINER com search_path fixo (decisao do Gabriel, 09/10; o molde do guard_lancamento_mes_fechado_p1): o dono
--       `fn_plano_conta_do_texto` so' tem EXECUTE para postgres e service_role, e segue fechado. Como a RLS deixa de filtrar a
--       leitura PELA CHAVE, ela ganha o filtro explicito "conta global ou do cliente do lancamento" (0 lancamentos apontam hoje
--       para conta de outro cliente: o filtro nao muda resultado nenhum). O gatilho continua escrevendo SO' em NEW.
--   fn_classificacao_apply_row · fn_classificacao_split_substituir (ja' eram SECURITY DEFINER; nada muda nisso)
--     · o "este subcentro existe no plano?" (EXISTS sem cliente) pergunta ao dono, com o cliente da linha / da sessao, em
--       qualquer tipo (decisao do Gabriel: com o tipo do lancamento 6 de 384 combinacoes reais deixariam de existir; assim, 0).
--
-- ⚠ O `OFFSET 0` NA LISTA DE TIPOS E' BARREIRA DE OTIMIZACAO, NAO ENFEITE: sem ele o planner empurra a chamada do dono para BAIXO do
--   DISTINCT e a executa uma vez por LINHA do plano (239 chamadas, 17 ms por lancamento, medido no ensaio) em vez de uma por tipo.
--
-- PATCH GUARDADO POR md5 (prosrc), cada ancora exatamente 1x (o gatilho tem duas: a declaracao de `v_conta` e a busca); so' o trecho da busca muda. O cabecalho sai de
-- pg_get_functiondef (assinatura, retorno, linguagem e configuracao como estao); ACL conferida identica depois.
--   materializar_dre_lcdpr_from_plano   85a3e1018bec04eba09f8efce18e11a1 -> 9d07b4485796c1388f1ee9cbb80c9bca   (+ SECURITY DEFINER, search_path=public)
--   fn_classificacao_apply_row          85cc0df6d66ae1f9793cfc28f44f784d -> a9475cb18395ef50e21e1b8bba4d3f21
--   fn_classificacao_split_substituir   33f4da7b542784a16abf64b3ad3cbade -> 8e1e1b49df13ce48355abdc5767d6010
--
-- GESTO CONTRARIO: o mesmo patch ao contrario (ancora nova -> ancora antiga, md5 de destino = o de origem acima) e, no gatilho,
--   ALTER FUNCTION public.materializar_dre_lcdpr_from_plano() SECURITY INVOKER RESET search_path;

CREATE FUNCTION pg_temp._plc_patch(p_oid regprocedure, p_md5_de text, p_md5_para text, p_a text[], p_b text[], p_definer boolean)
RETURNS void LANGUAGE plpgsql AS $p$
DECLARE
  v_src text; v_def text; v_acl text; v_sec boolean; v_cfg text; v_vol "char";
  c_h_a CONSTANT text := E' LANGUAGE plpgsql\nAS $function$';
  c_h_b CONSTANT text := E' LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''public''\nAS $function$';
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text, provolatile INTO v_src, v_acl, v_sec, v_cfg, v_vol FROM pg_proc WHERE oid = p_oid;
  IF md5(v_src) <> p_md5_de THEN RAISE EXCEPTION 'PLANO-LEITOR-POR-CLIENTE-01: % — corpo de origem inesperado (md5 %)', p_oid, md5(v_src); END IF;
  v_def := pg_get_functiondef(p_oid);
  FOR i IN 1 .. array_length(p_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, p_a[i], ''))) / length(p_a[i]) <> 1
       OR (length(v_def) - length(replace(v_def, p_a[i], ''))) / length(p_a[i]) <> 1 THEN
      RAISE EXCEPTION 'PLANO-LEITOR-POR-CLIENTE-01: % — a ancora % nao casa exatamente 1x', p_oid, i; END IF;
    v_def := replace(v_def, p_a[i], p_b[i]);
  END LOOP;
  IF p_definer THEN
    IF v_sec OR (length(v_def) - length(replace(v_def, c_h_a, ''))) / length(c_h_a) <> 1 THEN
      RAISE EXCEPTION 'PLANO-LEITOR-POR-CLIENTE-01: % — cabecalho inesperado (ja'' e'' DEFINER, ou a ancora do cabecalho nao casa 1x)', p_oid; END IF;
    v_def := replace(v_def, c_h_a, c_h_b);
  END IF;
  EXECUTE v_def;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_oid) <> p_md5_para THEN
    RAISE EXCEPTION 'PLANO-LEITOR-POR-CLIENTE-01: % — corpo de destino inesperado (md5 %)', p_oid, (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_oid); END IF;
  IF (SELECT proacl::text FROM pg_proc WHERE oid = p_oid) IS DISTINCT FROM v_acl
     OR (SELECT provolatile FROM pg_proc WHERE oid = p_oid) IS DISTINCT FROM v_vol THEN
    RAISE EXCEPTION 'PLANO-LEITOR-POR-CLIENTE-01: % — ACL ou volatilidade mudaram', p_oid; END IF;
  IF p_definer THEN
    IF NOT (SELECT prosecdef AND proconfig::text = '{search_path=public}' FROM pg_proc WHERE oid = p_oid) THEN
      RAISE EXCEPTION 'PLANO-LEITOR-POR-CLIENTE-01: % — nao ficou SECURITY DEFINER com search_path=public', p_oid; END IF;
  ELSIF (SELECT prosecdef FROM pg_proc WHERE oid = p_oid) IS DISTINCT FROM v_sec
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = p_oid) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'PLANO-LEITOR-POR-CLIENTE-01: % — SECURITY ou configuracao mudaram', p_oid;
  END IF;
END $p$;

DO $mig$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- 0 lancamentos (vivos ou cancelados) com chave para conta de OUTRO cliente: o filtro novo da leitura pela chave nao muda nada
  IF EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l JOIN public.financeiro_plano_contas p ON p.id = l.plano_conta_id
              WHERE p.cliente_id IS NOT NULL AND p.cliente_id <> l.cliente_id) THEN
    RAISE EXCEPTION 'PLANO-LEITOR-POR-CLIENTE-01: ha'' lancamento com chave para conta de outro cliente — parar e reportar.';
  END IF;
  PERFORM pg_temp._plc_patch('public.materializar_dre_lcdpr_from_plano()'::regprocedure, '85a3e1018bec04eba09f8efce18e11a1', '9d07b4485796c1388f1ee9cbb80c9bca', ARRAY[$a00$  v_reclass boolean;
$a00$, $a01$  IF NEW.plano_conta_id IS NOT NULL THEN
    SELECT pc.compoe_dre, pc.gera_lcdpr INTO v_dre, v_lcdpr
    FROM public.financeiro_plano_contas pc
    WHERE pc.id = NEW.plano_conta_id AND pc.ativo = true
    LIMIT 1;
    v_found := FOUND;
  ELSIF NEW.subcentro IS NOT NULL THEN
    SELECT pc.compoe_dre, pc.gera_lcdpr INTO v_dre, v_lcdpr
    FROM public.financeiro_plano_contas pc
    WHERE pc.ativo = true AND pc.subcentro = NEW.subcentro AND pc.tipo_operacao = NEW.tipo_operacao
    LIMIT 1;
    v_found := FOUND;
    IF NOT v_found THEN
      SELECT pc.compoe_dre, pc.gera_lcdpr INTO v_dre, v_lcdpr
      FROM public.financeiro_plano_contas pc
      WHERE pc.ativo = true AND pc.subcentro = NEW.subcentro
      LIMIT 1;
      v_found := FOUND;
    END IF;
  END IF;
$a01$], ARRAY[$b00$  v_reclass boolean;
  v_conta uuid;      -- PLANO-LEITOR-POR-CLIENTE-01: a conta que o dono resolveu pelo nome
$b00$, $b01$  -- PLANO-LEITOR-POR-CLIENTE-01: conta de OUTRO cliente nunca e' lida. Pela CHAVE, so' a global ou a do cliente do lancamento
  -- (o gatilho e' SECURITY DEFINER: a RLS nao filtra mais esta leitura). Pelo NOME, quem responde e' o dono
  -- `fn_plano_conta_do_texto` (a do cliente; na falta, a global; duas do cliente = nenhuma) — primeiro com o tipo do lancamento,
  -- depois em qualquer tipo (a mesma funcao, tipo a tipo, no maximo uma chamada por tipo: a busca sem tipo que ja' existia). Sem conta: como sempre, v_found falso.
  IF NEW.plano_conta_id IS NOT NULL THEN
    SELECT pc.compoe_dre, pc.gera_lcdpr INTO v_dre, v_lcdpr
    FROM public.financeiro_plano_contas pc
    WHERE pc.id = NEW.plano_conta_id AND pc.ativo = true
      AND (pc.cliente_id IS NULL OR pc.cliente_id = NEW.cliente_id)
    LIMIT 1;
    v_found := FOUND;
  ELSIF NEW.subcentro IS NOT NULL THEN
    v_conta := public.fn_plano_conta_do_texto(NEW.cliente_id, NEW.subcentro, NEW.tipo_operacao);
    IF v_conta IS NULL THEN
      SELECT x.id INTO v_conta
        FROM (SELECT tp.tipo_operacao, public.fn_plano_conta_do_texto(NEW.cliente_id, NEW.subcentro, tp.tipo_operacao) AS id
                FROM (SELECT DISTINCT t.tipo_operacao FROM public.financeiro_plano_contas t WHERE t.ativo = true OFFSET 0) tp) x
       WHERE x.id IS NOT NULL
       ORDER BY x.tipo_operacao
       LIMIT 1;
    END IF;
    IF v_conta IS NOT NULL THEN
      SELECT pc.compoe_dre, pc.gera_lcdpr INTO v_dre, v_lcdpr
      FROM public.financeiro_plano_contas pc
      WHERE pc.id = v_conta;
      v_found := FOUND;
    END IF;
  END IF;
$b01$], true);
  PERFORM pg_temp._plc_patch('public.fn_classificacao_apply_row(uuid, boolean)'::regprocedure, '85cc0df6d66ae1f9793cfc28f44f784d', 'a9475cb18395ef50e21e1b8bba4d3f21', ARRAY[$a10$NOT EXISTS (SELECT 1 FROM financeiro_plano_contas pc WHERE pc.subcentro = v_proposto->>'subcentro' AND pc.ativo IS NOT FALSE)$a10$], ARRAY[$b10$NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT t.tipo_operacao FROM financeiro_plano_contas t WHERE t.ativo = true OFFSET 0) tp
       WHERE public.fn_plano_conta_do_texto(v_staging.cliente_id, v_proposto->>'subcentro', tp.tipo_operacao) IS NOT NULL)$b10$], false);
  PERFORM pg_temp._plc_patch('public.fn_classificacao_split_substituir(uuid, uuid, uuid[])'::regprocedure, '33f4da7b542784a16abf64b3ad3cbade', '8e1e1b49df13ce48355abdc5767d6010', ARRAY[$a20$       AND NOT EXISTS (
         SELECT 1 FROM public.financeiro_plano_contas
         WHERE ativo = true AND subcentro = v_s.update_proposto->>'subcentro'
       ) THEN
$a20$], ARRAY[$b20$       AND NOT EXISTS (
         -- PLANO-LEITOR-POR-CLIENTE-01: "existe?" pela regra unica, com o cliente da sessao, em qualquer tipo
         SELECT 1 FROM (SELECT DISTINCT t.tipo_operacao FROM public.financeiro_plano_contas t WHERE t.ativo = true OFFSET 0) tp
         WHERE public.fn_plano_conta_do_texto(v_cliente, v_s.update_proposto->>'subcentro', tp.tipo_operacao) IS NOT NULL
       ) THEN
$b20$], false);
END
$mig$;

DROP FUNCTION pg_temp._plc_patch(regprocedure, text, text, text[], text[], boolean);
