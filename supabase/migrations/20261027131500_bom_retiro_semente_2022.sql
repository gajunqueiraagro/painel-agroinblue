-- FAZ-ATIVIDADE-01a — a semente de 2022 do Bom Retiro sai; a terra estava arrendada
-- Aplicado no proto em 23/09/2026 (ledger: bom_retiro_semente_2022). Registro histórico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- A Faz. Bom Retiro (Santa Rita) aparecia com 32 cabeças e R$ 92.200,00 CONGELADOS em jan–mai/2022:
-- cinco meses com exatamente o mesmo número, porque não havia movimento nenhum — o primeiro
-- lançamento zootécnico da fazenda é de JUNHO/2022. O rebanho real entra em 2022-06, por
-- TRANSFERÊNCIA (5 lançamentos, 469 cabeças), não por compra.
-- ⚠ NAQUELES CINCO MESES A TERRA ESTAVA ARRENDADA A TERCEIRO — a receita está no financeiro. Não
--   havia rebanho e não havia operação própria: o mês não é "fechado com pouco gado", é um mês que
--   não existe no fechamento de pecuária. Por isso o cabeçalho sai junto (decisão do Gabriel,
--   23/09, saída 3), e não apenas os itens.
-- ⚠ TUDO ISSO É SEMENTE DA IMPORTAÇÃO DE 14/04/2026 — `created_at` idêntico em todas as tabelas,
--   pesos e preços redondos (300/450/650 kg a R$ 8,00). Não foi fechamento que alguém fez.
--
-- A FONTE QUE QUASE PASSOU DESPERCEBIDA
-- Apagar `saldos_iniciais` + `valor_rebanho_fechamento*` NÃO zerava o cache: sobravam 24 cabeças em
-- jan–mai. A origem é `fechamento_pasto_itens`, lida por `fn_zoot_categoria_mensal` num LEFT JOIN
-- LATERAL (linhas 223-231 do prosrc) que vira `fonte_oficial_mes = 'fechamento'`. Sem ela na lista,
-- a estreia de jun/22 partiria de R$ 70.600,00 em vez de zero.
--
-- O QUE MUDA NO DRE — e é efeito CORRETO, não regressão
-- O total do cliente NÃO muda em período nenhum. O que muda é a REPARTIÇÃO entre as duas fazendas,
-- porque `fn_dre_pecuaria` rateia administrativo e juros por `cab_media`, e o `cab_media` do Bom
-- Retiro cai ao perder as 24 fantasmas:
--
--   período         fazenda          lucro líquido antes      depois          Δ
--   SR 22/23        Bom Retiro           −94.214,87      −168.982,69    −74.767,82
--   SR 22/23        Sta. Rita         −1.594.080,93    −1.519.313,11    +74.767,82
--   SR civil 2023   Bom Retiro        −1.192.798,41    −1.197.065,86     −4.267,45
--   SR civil 2023   Sta. Rita           −585.873,78      −581.606,33     +4.267,45
--
-- As diferenças se cancelam par a par. Nenhuma outra chave muda — nem `vpb_operacional`, nem `vbp`,
-- nem `efeito_mercado`, nem `ha_medio`. SR 23/24, SR 25/26 e META 25/26 ficam IDÊNTICOS.
--
-- PROVAS (BEGIN … ROLLBACK antes de aplicar, e repetidas depois)
--   cache 2022-01..05 .................. 0 linhas
--   cache 2022-06 ...................... saldo_inicial 0 · entradas 471 (469 por transferência)
--   estreia 2022-06→2023-05 (Bom Retiro) p0_origem 'estoque_inicial' · cab_ini 0 · VPB 1.264.060,41
--   fechamento 2022-06 ................. intacto, 502 cabeças
--   fechamento_area_snapshot 2022 ...... intacto, 5 linhas (área é fato da fazenda)
--   pilares 2022-03 .................... p2 'oficial'→'nao_iniciado', p1 'pendente'→'nao_iniciado'
--                                        (o mês deixa de existir; NÃO fica bloqueado/vermelho)
--   Sta. Rita .......................... intacta na estreia (3.597 cab · −480.716,58)
--
-- DÍVIDAS REGISTRADAS (não tratadas aqui, ver CLAUDE.md)
--   ZOOT-CACHE-CATEGORIA-01 — `fn_zoot_categoria_mensal` não traz ao cache a categoria que existe
--     SÓ no LATERAL de `fechamento_pasto_itens`: os 8 `bois` de jan/22 estavam lá e nunca
--     apareceram no cache (as outras 6 categorias, sim). Inconsistência pré-existente.
--   USO-TERRA-ARRENDADO-01 — não há tipo de uso "arrendado a terceiro" no fechamento de área. Os
--     cinco meses tinham `tipo_uso_mes = 'recria'`, que é falso; a saída foi apagar o mês, quando o
--     certo seria poder declarar o arrendamento.
--
-- ⚠ ESTA MIGRATION É DADO, NÃO ESQUEMA, e é de UMA fazenda: todas as guardas levam `fazenda_id` e
--   `cliente_id` explícitos. Outras 8 fazendas têm `fechamento_pasto_itens` no mesmo período
--   (Pureza 36, Sta. Rita 45, Sta. Tereza 32, Sta. Luzia 32, Monterrey 30, Sta. Maria 29,
--   Sto. Expedito 28, Ursa Maior 24) e nenhuma é tocada. As contagens abaixo abortam a migration se
--   qualquer número divergir — ela não roda "no que encontrar".

DO $mig$
DECLARE
  v_faz  uuid := '682419f9-8b70-4ae4-8aa6-5320ef40db97';  -- Faz. Bom Retiro
  v_cli  uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';  -- Santa Rita Agro
  v_mes  text[] := ARRAY['2022-01','2022-02','2022-03','2022-04','2022-05'];
  n int;
BEGIN
  -- 1) itens de rebanho por pasto (a fonte que alimentava o cache)
  DELETE FROM public.fechamento_pasto_itens fpi USING public.fechamento_pastos fp
   WHERE fpi.fechamento_id = fp.id AND fp.fazenda_id = v_faz AND fp.cliente_id = v_cli
     AND fp.ano_mes = ANY(v_mes);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 35 THEN RAISE EXCEPTION 'fechamento_pasto_itens: esperado 35, veio %', n; END IF;

  -- 2) cabecalhos do fechamento de pastos (o mes deixa de existir)
  DELETE FROM public.fechamento_pastos
   WHERE fazenda_id = v_faz AND cliente_id = v_cli AND ano_mes = ANY(v_mes);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'fechamento_pastos: esperado 6, veio %', n; END IF;

  -- 3) validacao do valor do rebanho (espelho da semente; alimenta o P0 de meta)
  DELETE FROM public.valor_rebanho_realizado_validado
   WHERE fazenda_id = v_faz AND ano_mes = ANY(v_mes) AND status = 'validado';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'valor_rebanho_realizado_validado: esperado 5, veio %', n; END IF;

  -- 4) fechamento de valor do rebanho: itens e cabecalhos
  DELETE FROM public.valor_rebanho_fechamento_itens
   WHERE fazenda_id = v_faz AND ano_mes = ANY(v_mes);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 45 THEN RAISE EXCEPTION 'valor_rebanho_fechamento_itens: esperado 45, veio %', n; END IF;

  DELETE FROM public.valor_rebanho_fechamento
   WHERE fazenda_id = v_faz AND ano_mes = ANY(v_mes);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'valor_rebanho_fechamento: esperado 5, veio %', n; END IF;

  -- 5) o rebanho de partida que nunca existiu
  DELETE FROM public.saldos_iniciais
   WHERE fazenda_id = v_faz AND cliente_id = v_cli AND ano = 2022;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN RAISE EXCEPTION 'saldos_iniciais: esperado 7, veio %', n; END IF;

  -- 6) a flag volta a ser "nao se sabe", nao "nao tem"
  UPDATE public.fazendas SET tem_pecuaria = NULL
   WHERE id = v_faz AND tem_pecuaria = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'fazendas.tem_pecuaria: esperado 1, veio %', n; END IF;

  -- 7) o cache e derivado: reconstroi
  PERFORM public.refresh_zoot_cache(v_faz, 2022);
  PERFORM public.refresh_zoot_cache(v_faz, 2023);

  -- guarda final: nada de 2022-01..05 sobrou, e 2022-06 ficou intacto
  SELECT count(*) INTO n FROM public.zoot_mensal_cache
   WHERE fazenda_id = v_faz AND ano_mes = ANY(v_mes) AND cenario = 'realizado';
  IF n <> 0 THEN RAISE EXCEPTION 'cache 2022-01..05: esperado 0, veio %', n; END IF;

  SELECT sum(quantidade)::int INTO n FROM public.valor_rebanho_fechamento_itens
   WHERE fazenda_id = v_faz AND ano_mes = '2022-06';
  IF n <> 502 THEN RAISE EXCEPTION 'fechamento 2022-06 (intacto): esperado 502 cab, veio %', n; END IF;
END $mig$;
