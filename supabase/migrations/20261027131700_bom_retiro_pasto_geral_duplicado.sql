-- ZOOT-CACHE-DOBRO-01 — o rebanho do Bom Retiro contado duas vezes em oito meses
-- Aplicado no proto em 23/09/2026 (ledger: bom_retiro_pasto_geral_duplicado). Registro histórico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- O pasto "Geral" da importação de 14/04/2026 ficou INVISÍVEL na tela quando vigência e tipos de uso
-- entraram — ele é `ativo = false` e não tem `data_inicio` —, mas os FECHAMENTOS dele continuaram no
-- cálculo (decisão/leitura do Gabriel, 23/09 16:22). Quando o operador refez os fechamentos de
-- 2022-06..2023-01 no pasto certo ("Eucalipto", ativo, vigência desde 2022-06-01), os antigos não
-- saíram junto: os oito meses passaram a ter DOIS cabeçalhos, cada um com o rebanho inteiro.
--
--   ano_mes    Geral (importação, 14/04)     Eucalipto (refeito, 23/09)     efeito
--   2022-06..12  fechado, 8 itens             fechado, 8 itens              473 + 473 = 946
--   2023-01      fechado, 8 itens, 438 cab    ABERTO,  8 itens, 438 cab     438 + 438 = 876
--
-- ⚠ E O MOTOR NÃO FILTRA. `fn_zoot_categoria_mensal` (md5 a3e6eb6b95cdd6dd91af6ba72f6a6b76) NÃO faz
--   join com `pastos`, NÃO lê `ativo` e NÃO lê vigência — medido. Ela soma `fechamento_pasto_itens`
--   por mês, então a regra do PR-PASTO-VIGENCIA-02 ("vigência + ativo é a regra única") não alcança
--   este caminho. Enquanto for assim, REFECHAR UM MÊS NUM PASTO NOVO DOBRA O REBANHO, calado.
--   Registrado como [PASTO-VIGENCIA-MOTOR-01] no CLAUDE.md — esta migration corrige o DADO de uma
--   fazenda, não a causa.
--
-- O QUE NÃO ESTAVA EM DOBRO, e é o que tornou o estrago silencioso
-- `valor_rebanho_fechamento`, `valor_rebanho_fechamento_itens` e `valor_rebanho_realizado_validado`
-- são por FAZENDA, não por pasto: 1 cabeçalho e 9 itens por mês, com as quantidades certas
-- (jun/22 502, dez/22 473, jan/23 438). O dobro morava só no caminho por pasto — então a tela de
-- valor do rebanho mostrava o número certo enquanto a Evolução no Ano mostrava o dobro.
--
-- 2023-01 SAI TAMBÉM, e a escolha tem custo declarado (saída B, Gabriel 23/09)
-- O Eucalipto de jan/23 foi criado hoje mas ficou ABERTO. A guarda abaixo casa por EXISTÊNCIA do
-- fechamento do Eucalipto no mesmo `ano_mes`, em qualquer status — por isso 8 e não 7. Com o Geral
-- fora, jan/23 passa a ter um único cabeçalho, aberto: o mês deixa de ter P1 oficial até alguém
-- fechar o Eucalipto. É o preço de não deixar janeiro dobrado; a alternativa era um mês correto no
-- papel e dobrado na conta.
--
-- ⚠ OS MESES SÓ-GERAL FICAM. 2023-02 a 2023-12 têm apenas o fechamento do Geral, e ele é o único
--   registro que existe daqueles meses. Apagá-los não desfaria dobro nenhum — apagaria o rebanho.
--   A guarda `EXISTS (Eucalipto no mesmo ano_mes)` é exatamente o que os protege.
--
-- ⚠ A ORDEM É DELETE -> saldos_iniciais -> refresh, e NÃO a ordem natural de ler o briefing.
--   `trg_invalidate_zoot_cache_saldos_iniciais` dispara em qualquer escrita de `saldos_iniciais`:
--   um refresh feito ANTES do UPDATE seria apagado por ele, e o cache terminaria vazio.
--
-- POR QUE O SALDO DE 2023 PRECISA SER ESCRITO À MÃO (passo 4)
-- Existe mecanismo de virada — `propagar_saldo_inicial_pos_dezembro`, trigger
-- `trg_propagar_saldo_dezembro` — e ele faria isto sozinho. Mas ele é `AFTER UPDATE` com
-- `OLD.status <> 'fechado'`, e o Eucalipto de dez/22 nasceu JÁ fechado, num INSERT. Nunca disparou.
-- Por isso as 9 linhas de 2023 estavam todas em `quantidade = 0` com o `peso_medio_kg` correto de
-- dez/22 (bois 363,75 · novilhas 290,49 · vacas 450) — faltava só a quantidade.
-- ⚠ `preco_kg` FICA NULO, como o trigger faria: preço do rebanho é do fechamento de valor, não do
--   mapa de pastos. Zero ali leria como "rebanho sem valor" em vez de "preço não informado".
--
-- PROVAS (BEGIN … ROLLBACK antes de aplicar, e repetidas depois) — ver o relatório do PR.

DO $mig$
DECLARE
  v_faz  uuid := '682419f9-8b70-4ae4-8aa6-5320ef40db97';  -- Faz. Bom Retiro
  v_cli  uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';  -- Santa Rita Agro
  v_geral uuid := '0eb35373-4675-440a-8eed-eb6ecd3efdef';  -- pasto "Geral" (importação, ativo=false)
  v_euca  uuid := '58204641-f246-4bf9-b637-48765c24500b';  -- pasto "Eucalipto" (ativo, desde 2022-06-01)
  n int;
BEGIN
  -- guarda de identidade: os dois pastos são os que esta migration acredita que são
  PERFORM 1 FROM public.pastos
   WHERE id = v_geral AND fazenda_id = v_faz AND nome = 'Geral' AND ativo = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'pasto Geral nao confere (id/fazenda/nome/ativo)'; END IF;
  PERFORM 1 FROM public.pastos
   WHERE id = v_euca AND fazenda_id = v_faz AND nome = 'Eucalipto' AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'pasto Eucalipto nao confere (id/fazenda/nome/ativo)'; END IF;

  -- 1) itens do Geral nos meses em que o Eucalipto TAMBÉM tem fechamento (qualquer status)
  DELETE FROM public.fechamento_pasto_itens fpi
   USING public.fechamento_pastos fp
   WHERE fpi.fechamento_id = fp.id
     AND fp.fazenda_id = v_faz AND fp.cliente_id = v_cli AND fp.pasto_id = v_geral
     AND EXISTS (SELECT 1 FROM public.fechamento_pastos e
                  WHERE e.fazenda_id = v_faz AND e.cliente_id = v_cli
                    AND e.ano_mes = fp.ano_mes AND e.pasto_id = v_euca);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 62 THEN RAISE EXCEPTION 'fechamento_pasto_itens (Geral): esperado 62, veio %', n; END IF;

  -- 1b) e os cabeçalhos
  DELETE FROM public.fechamento_pastos fp
   WHERE fp.fazenda_id = v_faz AND fp.cliente_id = v_cli AND fp.pasto_id = v_geral
     AND EXISTS (SELECT 1 FROM public.fechamento_pastos e
                  WHERE e.fazenda_id = v_faz AND e.cliente_id = v_cli
                    AND e.ano_mes = fp.ano_mes AND e.pasto_id = v_euca);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 8 THEN RAISE EXCEPTION 'fechamento_pastos (Geral): esperado 8, veio %', n; END IF;

  -- guarda: os meses só-Geral continuam lá (2023-02 a 2023-12)
  SELECT count(*) INTO n FROM public.fechamento_pastos
   WHERE fazenda_id = v_faz AND cliente_id = v_cli AND pasto_id = v_geral;
  IF n <> 11 THEN RAISE EXCEPTION 'meses so-Geral: esperado 11 remanescentes, veio %', n; END IF;

  -- guarda: nenhum mês da fazenda ficou com mais de um cabeçalho
  SELECT count(*) INTO n FROM (
    SELECT ano_mes FROM public.fechamento_pastos
     WHERE fazenda_id = v_faz AND cliente_id = v_cli
     GROUP BY ano_mes HAVING count(*) > 1) d;
  IF n <> 0 THEN RAISE EXCEPTION 'restaram % meses com fechamento duplicado', n; END IF;

  -- 4) o rebanho de partida de 2023, a partir de dez/2022 (o que o trigger de virada faria)
  UPDATE public.saldos_iniciais si SET
    quantidade    = d.qtd,
    peso_medio_kg = d.peso_medio,
    peso_total    = d.qtd * d.peso_medio,
    preco_kg      = NULL
  FROM (
    SELECT cr.codigo AS categoria,
           SUM(fpi.quantidade) AS qtd,
           ROUND((SUM(fpi.peso_medio_kg * fpi.quantidade)
                  / NULLIF(SUM(fpi.quantidade), 0))::numeric, 2) AS peso_medio
      FROM public.fechamento_pasto_itens fpi
      JOIN public.fechamento_pastos fp    ON fp.id = fpi.fechamento_id
      JOIN public.pastos p                ON p.id  = fp.pasto_id
      JOIN public.categorias_rebanho cr   ON cr.id = fpi.categoria_id
     WHERE fp.fazenda_id = v_faz AND fp.cliente_id = v_cli
       AND fp.ano_mes = '2022-12' AND fp.status = 'fechado'
       AND p.ativo                    -- ⚠ inofensivo depois do passo 1; fica como cinto de segurança
     GROUP BY cr.codigo
    HAVING SUM(fpi.quantidade) > 0
  ) d
  WHERE si.fazenda_id = v_faz AND si.ano = 2023 AND si.mes = 1
    AND si.categoria = d.categoria;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 8 THEN RAISE EXCEPTION 'saldos_iniciais 2023: esperado 8 linhas, veio %', n; END IF;

  SELECT sum(quantidade)::int INTO n FROM public.saldos_iniciais
   WHERE fazenda_id = v_faz AND ano = 2023 AND mes = 1;
  IF n <> 473 THEN RAISE EXCEPTION 'saldos_iniciais 2023: esperado 473 cab, veio %', n; END IF;

  -- 4b) a linha `garrotes` que a tela criou hoje (19:11 UTC) com peso NULO
  -- ⚠ DELETE, não zerar: a categoria não existe em dez/22, então ela não é "zero apurado" — é uma
  --    linha que nunca devia ter nascido. `fn_completar_categorias_saldo_inicial` a recria com 0 se
  --    algum INSERT futuro precisar dela.
  DELETE FROM public.saldos_iniciais
   WHERE fazenda_id = v_faz AND ano = 2023 AND mes = 1
     AND categoria = 'garrotes' AND quantidade = 0 AND peso_medio_kg IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'saldos_iniciais garrotes: esperado 1, veio %', n; END IF;

  -- 3) o cache é derivado: reconstrói POR ÚLTIMO (ver a nota de ordem no cabeçalho)
  PERFORM public.refresh_zoot_cache(v_faz, 2022);
  PERFORM public.refresh_zoot_cache(v_faz, 2023);

  -- guarda final: dez/22 fecha em 473 e jan/23 abre em 473
  SELECT sum(saldo_final)::int INTO n FROM public.zoot_mensal_cache
   WHERE fazenda_id = v_faz AND ano_mes = '2022-12' AND cenario = 'realizado';
  IF n <> 473 THEN RAISE EXCEPTION 'cache 2022-12 saldo_final: esperado 473, veio %', n; END IF;

  SELECT sum(saldo_inicial)::int INTO n FROM public.zoot_mensal_cache
   WHERE fazenda_id = v_faz AND ano_mes = '2023-01' AND cenario = 'realizado';
  IF n <> 473 THEN RAISE EXCEPTION 'cache 2023-01 saldo_inicial: esperado 473, veio %', n; END IF;
END $mig$;
