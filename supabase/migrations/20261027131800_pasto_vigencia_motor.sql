-- PASTO-VIGENCIA-MOTOR-01 — o motor passa a enxergar a vigência do pasto
-- Aplicado no proto em 23/09/2026 (ledger: pasto_vigencia_motor). Registro histórico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- `fn_zoot_categoria_mensal` somava `fechamento_pasto_itens` de TODOS os pastos do mês, sem olhar
-- se o pasto ainda existia. A regra do PR-PASTO-VIGENCIA-02 ("vigência + ativo é a regra única")
-- vivia só no front. Resultado medido em 23/09/2026: o Bom Retiro contou 946 cabeças onde havia
-- 473, durante oito meses, porque o pasto "Geral" da importação ficou invisível na tela
-- (`ativo = false`) e o operador refez os meses no pasto certo. Ninguém viu, porque
-- `valor_rebanho_fechamento` é por FAZENDA e continuou mostrando o número certo.
-- A migration 20261027131700 corrigiu o DADO daquela fazenda. Esta corrige a CAUSA.
--
-- A REGRA QUE ENTRA É A DO FRONT, e a escolha foi medida (Gabriel, 23/09, saída 3)
-- `src/hooks/usePastos.ts:49-58` (`isPastoAtivoNoMes`) + `:71-77` (`pastosAtivosNoMes`):
--     ativo = true
--     AND (data_inicio IS NULL OR data_inicio <= último dia do mês)
--     AND (data_fim    IS NULL OR data_fim    >= primeiro dia do mês)
-- ⚠ SEM A CONDIÇÃO DE `tipo_uso`, e isso é deliberado. Existe uma segunda regra no repo —
--   `fn_pastos_aplicaveis_mes` (md5 d2f64f93ec3daa4fbb2f63348a3a17ee) — que o próprio comentário
--   do front declara ser o espelho dela. NÃO SÃO A MESMA REGRA: a de SQL tem
--   `tipo_uso IS DISTINCT FROM 'divergencia'` a mais. Adotá-la aqui removeria 440 cabeças de 5
--   fazendas em 4 clientes, todas no pasto `⚠️ Divergência do Campeiro` — que é `ativo = true` e
--   está DENTRO da vigência. Isso não é aplicar vigência; é decidir se o ajuste de conciliação
--   conta como rebanho, e é decisão de produto. Registrado como [PASTO-DIVERGENCIA-01] e
--   [PASTOS-APLICAVEIS-ESPELHO-01] no CLAUDE.md.
--
-- A EXCEÇÃO: "VIGENTE SE HOUVER; SENÃO O QUE EXISTE"
-- Se no mês NÃO há nenhum pasto vigente com fechamento, o fechamento do pasto morto continua
-- valendo — é a única fonte que o mês tem. Sem isso, o Bom Retiro de 2023-02 a 2023-12 (11 meses,
-- 2.108 cabeças, só o pasto "Geral") viraria ZERO, e zero num rebanho é um número que o operador
-- soma, não uma ausência que ele investiga.
--
-- EFEITO LÍQUIDO HOJE: NENHUM — e isso foi medido antes de escrever, não deduzido depois.
-- Comparação `fn_zoot_categoria_mensal` antes × depois, 19 fazendas × 2020-2026, saldo inicial,
-- saldo final e `fonte_oficial_mes` por mês: 710 linhas, ZERO divergências. As 5 fazendas com
-- fechamento em pasto não vigente têm ZERO cabeças nesses meses; o Bom Retiro cai na exceção.
-- ⚠ ELA É GUARDA, NÃO CONSERTO. O que esta migration impede é o PRÓXIMO "Geral": a prova
--   funcional abaixo mostra que, com a função antiga, refechar fev/23 do Bom Retiro no Eucalipto
--   dava 878 cabeças; com a nova, dá 439.
--
-- POR QUE UM HELPER NOVO, E NÃO O `fn_pastos_aplicaveis_mes`
-- Três funções precisam da MESMA condição. Escrevê-la três vezes é exatamente o defeito que esta
-- frente existe para corrigir — duas cópias que se declaram espelho e divergem. `fn_pasto_vigente_no_mes`
-- é um PREDICADO escalar e IMMUTABLE; `fn_pastos_aplicaveis_mes` devolve um CONJUNTO por fazenda e
-- carrega o filtro de `tipo_uso`. São ferramentas diferentes para perguntas diferentes.
--
-- ⚠ O CORPO DE `fn_zoot_categoria_mensal` NÃO FOI REDIGITADO. Ele tem ~400 linhas, e o CLAUDE.md
--   proíbe redigitar de memória código que se move. O bloco abaixo lê o `prosrc` do banco, TRAVA o
--   md5 de origem (`a3e6eb6b95cdd6dd91af6ba72f6a6b76`), troca UM fragmento por `replace()` e
--   recria a função. A transformação é byte-exata por construção e reproduzível: qualquer um pode
--   rodar o mesmo bloco e conferir que chega ao md5 de destino (`5358f87341c38385325acfda96e4db8c`).
--   O `prosrc` integral resultante sai de `pg_get_functiondef('fn_zoot_categoria_mensal'::regproc)`.
--
-- PROVAS (BEGIN … ROLLBACK antes de aplicar) — ver o relatório do PR.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) O PREDICADO — uma regra, um lugar
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pasto_vigente_no_mes(
  p_ativo boolean, p_data_inicio date, p_data_fim date, p_ano_mes text
) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $f$
  -- Espelho EXATO de isPastoAtivoNoMes + o `ativo` de pastosAtivosNoMes (usePastos.ts:49-77).
  -- Fronteiras inclusivas dos dois lados: pasto que começa em 15/07 vale em julho; pasto que
  -- fecha em 31/07 também. `ativo` nulo conta como falso — ausência não é permissão.
  SELECT coalesce(p_ativo, false)
     AND (p_data_inicio IS NULL
          OR p_data_inicio <= (date_trunc('month', to_date(p_ano_mes,'YYYY-MM')) + interval '1 month - 1 day')::date)
     AND (p_data_fim IS NULL
          OR p_data_fim >= date_trunc('month', to_date(p_ano_mes,'YYYY-MM'))::date);
$f$;

REVOKE ALL ON FUNCTION public.fn_pasto_vigente_no_mes(boolean, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pasto_vigente_no_mes(boolean, date, date, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) fn_zoot_categoria_mensal — o LATERAL do fechamento (prosrc :223-231)
-- ─────────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE v_src text; v_new text; v_o text; v_n text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'fn_zoot_categoria_mensal';
  IF md5(v_src) <> 'a3e6eb6b95cdd6dd91af6ba72f6a6b76' THEN
    RAISE EXCEPTION 'fn_zoot_categoria_mensal: md5 de origem divergente (%)', md5(v_src);
  END IF;

  v_o := '    FROM fechamento_pastos fp2 JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp2.id
    WHERE fp2.fazenda_id = acb.fazenda_id AND fp2.status = ''fechado''
      AND EXTRACT(year FROM (fp2.ano_mes||''-01'')::date)::integer = acb.ano
      AND EXTRACT(month FROM (fp2.ano_mes||''-01'')::date)::integer = m.mes
      AND fpi.categoria_id = acb.categoria_id
    GROUP BY fpi.categoria_id';
  IF position(v_o in v_src) = 0 THEN
    RAISE EXCEPTION 'fn_zoot_categoria_mensal: fragmento :223-231 nao encontrado';
  END IF;

  v_n := '    FROM fechamento_pastos fp2
    JOIN public.pastos p2 ON p2.id = fp2.pasto_id
    JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp2.id
    WHERE fp2.fazenda_id = acb.fazenda_id AND fp2.status = ''fechado''
      AND EXTRACT(year FROM (fp2.ano_mes||''-01'')::date)::integer = acb.ano
      AND EXTRACT(month FROM (fp2.ano_mes||''-01'')::date)::integer = m.mes
      AND fpi.categoria_id = acb.categoria_id
      AND (public.fn_pasto_vigente_no_mes(p2.ativo, p2.data_inicio, p2.data_fim, fp2.ano_mes)
           OR NOT EXISTS (SELECT 1 FROM fechamento_pastos fpv
                           JOIN public.pastos pv ON pv.id = fpv.pasto_id
                          WHERE fpv.fazenda_id = fp2.fazenda_id AND fpv.ano_mes = fp2.ano_mes
                            AND fpv.status = ''fechado''
                            AND public.fn_pasto_vigente_no_mes(pv.ativo, pv.data_inicio, pv.data_fim, fpv.ano_mes)))
    GROUP BY fpi.categoria_id';

  v_new := replace(v_src, v_o, v_n);
  IF v_new = v_src THEN RAISE EXCEPTION 'fn_zoot_categoria_mensal: replace inerte'; END IF;

  -- ⚠ A ASSINATURA LEVA O `DEFAULT NULL::text`: sem ele o CREATE OR REPLACE é recusado com
  --   "cannot remove parameter defaults from existing function" — medido.
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.fn_zoot_categoria_mensal(p_fazenda_id uuid, p_ano integer, p_cenario text DEFAULT NULL::text)
       RETURNS TABLE(%s) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''public'' AS $body$%s$body$',
    (SELECT substring(pg_get_function_result(oid) from 7 for length(pg_get_function_result(oid)) - 7)
       FROM pg_proc WHERE proname = 'fn_zoot_categoria_mensal'),
    v_new);

  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'fn_zoot_categoria_mensal')
     <> '5358f87341c38385325acfda96e4db8c' THEN
    RAISE EXCEPTION 'fn_zoot_categoria_mensal: md5 de destino inesperado (%)',
      (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'fn_zoot_categoria_mensal');
  END IF;
END $mig$;

REVOKE ALL ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) propagar_saldo_inicial_pos_dezembro — a virada de ano
--    Corpo transcrito INTEGRALMENTE do prosrc md5 f28dff1c9def8b65c930b9f95da6a8a0.
--    Única alteração: o JOIN com `pastos` e a condição de vigência no SELECT do INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.propagar_saldo_inicial_pos_dezembro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ano_seguinte INT;
  v_ano INT;
  v_mes INT;
BEGIN
  IF NEW.status <> 'fechado' OR OLD.status = 'fechado' THEN
    RETURN NEW;
  END IF;

  v_ano := EXTRACT(YEAR  FROM (NEW.ano_mes || '-01')::date);
  v_mes := EXTRACT(MONTH FROM (NEW.ano_mes || '-01')::date);

  IF v_mes <> 12 THEN
    RETURN NEW;
  END IF;

  v_ano_seguinte := v_ano + 1;

  IF EXISTS (
    SELECT 1 FROM fechamento_pastos
    WHERE fazenda_id = NEW.fazenda_id
      AND cliente_id = NEW.cliente_id
      AND ano_mes    = NEW.ano_mes
      AND status     <> 'fechado'
      AND id         <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.propagacao_dezembro', 'true', true);

  INSERT INTO saldos_iniciais (fazenda_id, cliente_id, ano, mes, categoria, quantidade, peso_medio_kg)
  SELECT
    fp.fazenda_id,
    fp.cliente_id,
    v_ano_seguinte,
    1,
    cr.codigo,
    SUM(fpi.quantidade),
    CASE
      WHEN SUM(fpi.quantidade) > 0
      THEN ROUND(
        (SUM(fpi.peso_medio_kg * fpi.quantidade) / SUM(fpi.quantidade))::numeric, 2
      )
      ELSE 0
    END
  FROM fechamento_pasto_itens fpi
  JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
  -- PASTO-VIGENCIA-MOTOR-01: dezembro do pasto morto não semeia o ano seguinte, a menos que
  -- seja a única fonte do mês. Mesma regra e mesma exceção de fn_zoot_categoria_mensal.
  JOIN public.pastos p ON p.id = fp.pasto_id
  JOIN categorias_rebanho cr ON cr.id = fpi.categoria_id
  WHERE fp.fazenda_id = NEW.fazenda_id
    AND fp.cliente_id = NEW.cliente_id
    AND fp.ano_mes    = NEW.ano_mes
    AND fp.status     = 'fechado'
    AND (public.fn_pasto_vigente_no_mes(p.ativo, p.data_inicio, p.data_fim, fp.ano_mes)
         OR NOT EXISTS (SELECT 1 FROM fechamento_pastos fpv
                         JOIN public.pastos pv ON pv.id = fpv.pasto_id
                        WHERE fpv.fazenda_id = fp.fazenda_id AND fpv.ano_mes = fp.ano_mes
                          AND fpv.status = 'fechado'
                          AND public.fn_pasto_vigente_no_mes(pv.ativo, pv.data_inicio, pv.data_fim, fpv.ano_mes)))
  GROUP BY fp.fazenda_id, fp.cliente_id, cr.codigo
  HAVING SUM(fpi.quantidade) > 0
  ON CONFLICT (fazenda_id, ano, mes, categoria)
  DO UPDATE SET
    quantidade    = EXCLUDED.quantidade,
    peso_medio_kg = EXCLUDED.peso_medio_kg;

  RETURN NEW;
END;
$function$;

-- ⚠ ELA NASCIA ABERTA: a ACL era `=X/postgres | postgres | anon | authenticated | service_role`,
--   ou seja PUBLIC **e** um GRANT EXPLÍCITO para `anon`. Função de trigger não é chamável de forma
--   útil por fora (o corpo depende de NEW/OLD), mas o rodapé é o padrão da casa e revogar REDUZ
--   superfície sem custo. Ver [SECDEF-EXECUTE-PUBLIC] nas notas do projeto.
-- ⚠ E O `FROM PUBLIC` SOZINHO NÃO BASTAVA — medido depois de aplicar: `has_function_privilege('anon')`
--   continuava TRUE, porque o grant de `anon` era próprio, não herdado de PUBLIC. Revogar o PUBLIC
--   tira só o PUBLIC. Quem copiar este rodapé para uma função com grant nominal precisa das duas
--   linhas; conferir com `has_function_privilege`, nunca presumir pelo REVOKE.
REVOKE ALL ON FUNCTION public.propagar_saldo_inicial_pos_dezembro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.propagar_saldo_inicial_pos_dezembro() FROM anon;
GRANT EXECUTE ON FUNCTION public.propagar_saldo_inicial_pos_dezembro() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) fn_saldo_inicial_pasto — o saldo do mês anterior
--    Corpo transcrito INTEGRALMENTE do prosrc md5 e2e4ee1c9a6f353460a6338bba18bc6f.
--    Alterações: vigência no EXISTS e no SUM. As duas, porque o EXISTS decide se há fechamento
--    oficial e o SUM decide quanto ele vale — responder com pastos diferentes seria pior que
--    não filtrar.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_saldo_inicial_pasto(
  p_fazenda_id uuid, p_ano integer, p_mes integer, p_categoria_codigo text)
RETURNS TABLE(quantidade integer, peso_medio_kg numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ano_anterior int;
  v_mes_anterior int;
  v_ano_mes_anterior text;
  v_has_fechamento boolean;
BEGIN
  -- Calcula competência anterior
  IF p_mes = 1 THEN
    v_ano_anterior := p_ano - 1;
    v_mes_anterior := 12;
  ELSE
    v_ano_anterior := p_ano;
    v_mes_anterior := p_mes - 1;
  END IF;

  v_ano_mes_anterior := v_ano_anterior::text || '-' || lpad(v_mes_anterior::text, 2, '0');

  -- Verifica se existe ALGUM pasto fechado no mês anterior
  SELECT EXISTS (
    SELECT 1
    FROM public.fechamento_pastos fp
    WHERE fp.fazenda_id = p_fazenda_id
      AND fp.ano_mes    = v_ano_mes_anterior
      AND fp.status     = 'fechado'
  ) INTO v_has_fechamento;

  -- Sem fechamento oficial → caller deve usar fallback
  IF NOT v_has_fechamento THEN
    quantidade    := 0;
    peso_medio_kg := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Soma TODOS os pastos fechados do mês anterior para a categoria
  -- PASTO-VIGENCIA-MOTOR-01: exceto os que já não existiam no mês — a menos que sejam a
  -- única fonte dele. Mesma regra e mesma exceção de fn_zoot_categoria_mensal.
  SELECT
    COALESCE(SUM(fpi.quantidade), 0)::int,
    CASE
      WHEN COALESCE(SUM(fpi.quantidade), 0) > 0
      THEN ROUND(
        (SUM(COALESCE(fpi.peso_medio_kg, 0) * fpi.quantidade)
          / NULLIF(SUM(fpi.quantidade), 0))::numeric, 2)
      ELSE 0::numeric
    END
  INTO quantidade, peso_medio_kg
  FROM public.fechamento_pasto_itens fpi
  JOIN public.fechamento_pastos     fp ON fp.id = fpi.fechamento_id
  JOIN public.pastos                p  ON p.id  = fp.pasto_id
  JOIN public.categorias_rebanho    cr ON cr.id = fpi.categoria_id
  WHERE fp.fazenda_id = p_fazenda_id
    AND fp.ano_mes    = v_ano_mes_anterior
    AND fp.status     = 'fechado'
    AND cr.codigo     = p_categoria_codigo
    AND (public.fn_pasto_vigente_no_mes(p.ativo, p.data_inicio, p.data_fim, fp.ano_mes)
         OR NOT EXISTS (SELECT 1 FROM public.fechamento_pastos fpv
                         JOIN public.pastos pv ON pv.id = fpv.pasto_id
                        WHERE fpv.fazenda_id = fp.fazenda_id AND fpv.ano_mes = fp.ano_mes
                          AND fpv.status = 'fechado'
                          AND public.fn_pasto_vigente_no_mes(pv.ativo, pv.data_inicio, pv.data_fim, fpv.ano_mes)));

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_saldo_inicial_pasto(uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_saldo_inicial_pasto(uuid, integer, integer, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) O cache é derivado: reconstrói as fazendas que têm fechamento em pasto não vigente.
--    Hoje nenhuma muda de número (efeito líquido zero, medido), mas o cache do Bom Retiro está
--    desatualizado por outra razão: o Eucalipto de jan/23 foi fechado depois do último refresh.
-- ─────────────────────────────────────────────────────────────────────────────
DO $ref$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT fp.fazenda_id, EXTRACT(year FROM (fp.ano_mes||'-01')::date)::int AS ano
    FROM fechamento_pastos fp JOIN pastos p ON p.id = fp.pasto_id
    WHERE fp.status = 'fechado'
      AND NOT public.fn_pasto_vigente_no_mes(p.ativo, p.data_inicio, p.data_fim, fp.ano_mes)
  LOOP
    PERFORM public.refresh_zoot_cache(r.fazenda_id, r.ano);
  END LOOP;
END $ref$;
