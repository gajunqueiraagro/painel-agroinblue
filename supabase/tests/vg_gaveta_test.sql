-- FIN-VISAO-GERAL-01 PR 5 — prova do banco da GAVETA DE LANCAMENTOS (111944 fn_vg_partes, 111945 fn_vg_gaveta). A tela nunca soma.
-- Numa transacao que TERMINA EM RAISE (nada fica): 'VGGA OK ...' ou 'VGGA FALHOU: ...'. pg_temp.vgga(so) e' o teste — so = o recorte
-- (1..8) de G1/G3, 0 = G2 + G4, nulo = tudo, -1 = o rapido das mutacoes (recorte 4, so' saida, + G2); pg_temp.vgga_mut(k) aplica a
-- MUTACAO k num bloco que se desfaz e exige que o vgga falhe. O canal do proto corta a chamada longa: rode um recorte por chamada
-- (troque a ultima linha: `pg_temp.vgga(1)` … `pg_temp.vgga(8)`, `pg_temp.vgga(0)`, `pg_temp.vgga_mut(1)` … `pg_temp.vgga_mut(5)`). Clientes REAIS do proto (NJ, Agnaldo),
-- admin AgroinBlue, p_hoje 23/10/2026, periodo jan–dez/2026.
--   G1 A SOMA (teste soberano): descendo do topo ate' o subcentro, em TODO no' com lancamentos, nos dois lados, o total e a qtd da
--      gaveta = o valor (R$) e a qtd do no' na fn_vg_analise; os filhos da gaveta = os filhos do modal (valor e qtd), nenhum a mais
--      ou a menos; no subcentro, a SOMA das linhas de todas as paginas (7 por pagina, para paginar de verdade) = o total, e o nº de
--      linhas = total_linhas. NJ ago/set/out e Agnaldo ago/set/out (out = o mes de hoje, com VENCIDOS — exigido que haja), NJ set
--      com o CARTAO (exigido que haja compra no cartao) e NJ set so' com as contas do caixa; NJ set no criterio acumulado.
--   G2 CLASSIFICACAO DIVIDIDA: um lancamento real dividido 60/40 (so' nesta transacao) aparece no 1º subcentro com a parte 1
--      (chave = id) e no 2º com a parte 2 (chave "id#2", lancamento_id = id), cada um com o valor DA PARTE e o do lancamento ao lado;
--      e a soma segue igual ao modal nos dois nos
--   G3 REGIME DE CAIXA: toda linha realizada tem a data de pagamento dentro da janela; a prevista, o vencimento (nunca antes do mes
--      de hoje) dentro da janela; vencida = vencimento antes de hoje
-- Rodado em 23/10/2026 (proto, depois do apply da 111944/111945): recortes 1–8 = 157 · 165 · 116 · 157 · 232 · 93 · 82 · 75 nos
-- (1077) iguais ao modal; o recorte 5 (acumulado, o mais pesado) foi rodado por grupo, um vgga_no por chamada; G2, G4 OK;
-- mutacoes 5/5 mortas.
--   G4 seguranca: 42501 para o usuario sem acesso ao cliente e sem usuario; 501 por pagina e caminho de 5 niveis 22023; anon sem EXECUTE
--   G5 O AVISO DA LISTA (111947, `lista` so' na folha): pg_temp.vgga_lista(). NJ out/26 com todas as contas: a saida e' a mesma da
--      111945 fora o `lista` (comparado no ensaio: 116 nos iguais), `lista` em toda folha e so' nela, e vencidos_fora = os vencidos
--      do no' com vencimento antes da janela (contados aqui das linhas da fn_vg_partes); NJ set/26 com DUAS contas que transferem
--      entre si: no no' de transferencias transf_internas = as transferencias realizadas entre as duas no mes (contadas direto na
--      tabela) e, com so' uma das contas, 0 — e o no' passa a ter essas transferencias como saida (qtd soma)
--      Rodado em 23/10/2026: 61 folhas com `lista`, 0 fora; vencidos_fora 1–2 em 5 subcentros; transf_internas 6 = 6; qtd 5 → 11.
--      PR 5b (111948): vencidos_fora conta os DOIS sentidos — o vencido que a Visao Geral traz para a janela E o que ela leva para fora
--      (vencimento dentro da janela, no mes de hoje). Em out/26 (o mes de hoje) nada sai: a conta do G5 segue a mesma.
--   G6 GAVETA = LISTA (PR 5b): pg_temp.vgga_lista_igual(mut). NJ set/26, UMA conta (as duas do G5, uma por vez), TODO subcentro dos
--      dois lados: a `fn_fin_v2_lista_pagina` com os filtros que o "Ver na lista ›" manda (tipo do lado ou "3-Transferências" no no' de
--      transferencias, sem centro; a conta em Conta Origem na saida e em CONTA DESTINO na entrada; atividade, centro, subcentro; ano/mes;
--      status realizado + CONCILIADO + os da tela) tem o mesmo nº de lancamentos da gaveta — ou a gaveta avisa (vencidos_fora ou
--      transf_internas). Exigido: os dois subcentros de transferencia (entrada e saida) com lancamentos e iguais. mut = true poe a
--      entrada pela Conta Origem: tem de FALHAR.
--      Rodado em 23/10/2026: 65 subcentros, 63 iguais, 2 com a lista +1 e o aviso dos vencidos (vencimento 10/09, na Visao Geral em
--      out/26); transferencias: saida 11 = 11, entrada 6 = 6. Mutacao: entrada 6 x 2 — falhou como devia.
--   G7 PAGAMENTO DA FATURA (111949): pg_temp.vgga_fatura(mut). NJ out/26, conta 3b9a (o cartao fora): no no' "Transferencias para
--      outras contas" a gaveta conta 1 (a transferencia que nao e' fatura), a lista 2 e lista.faturas_cartao = 1 = a diferenca; sem
--      caso: 7f39 set/26 (11 transferencias, nenhuma para cartao) e todas as contas (o cartao no conjunto) com faturas_cartao 0.
--      mut = true ignora o faturas_cartao como aviso: tem de FALHAR (a diferenca fica sem aviso).
set local statement_timeout = '900s';

create function pg_temp.vgga_no(cli uuid, mes text, crit text, ctas uuid[], lado text, so_no text[] default null)
returns text language plpgsql as $f$
declare
  fila jsonb := jsonb_build_array(coalesce(to_jsonb(so_no), '[]'::jsonb)); c text[]; a jsonb; g jsonb; x jsonb; y jsonb; n int := 0;
  pg int; soma numeric; nl int; jd date; ja date; hoje constant date := '2026-10-23';
begin
  WHILE jsonb_array_length(fila) > 0 LOOP
    c := array(SELECT e FROM jsonb_array_elements_text(fila -> 0) WITH ORDINALITY t(e, o) ORDER BY o);
    fila := fila - 0;
    n := n + 1;
    g := fn_vg_gaveta(cli, '2026-01-01', '2026-12-31', mes, lado, c, crit, ctas, NULL, NULL, hoje, NULL, true, 1, 7);
    jd := (g #>> '{janela,de}')::date; ja := (g #>> '{janela,ate}')::date;
    IF cardinality(c) < 4 THEN
      a := fn_vg_analise(cli, '2026-01-01', '2026-12-31', mes, lado, c[1], c, NULL, crit, 'rs', ctas, NULL, NULL, hoje, NULL, true);
      IF (g ->> 'total')::numeric IS DISTINCT FROM coalesce((a #>> '{foco,total,valor}')::numeric, 0)
         OR (g ->> 'qtd')::int IS DISTINCT FROM coalesce((a #>> '{foco,total,qtd}')::int, 0) THEN
        RETURN format('G1 %s %s %s no %s: gaveta %s (%s lanc.) x modal %s (%s)', mes, crit, lado, c, g ->> 'total', g ->> 'qtd',
                      a #>> '{foco,total,valor}', a #>> '{foco,total,qtd}');
      END IF;
      FOR x IN SELECT * FROM jsonb_array_elements(g -> 'linhas') LOOP
        SELECT f INTO y FROM jsonb_array_elements(a #> '{foco,linhas}') f WHERE f -> 'caminho' = x -> 'caminho';
        IF y IS NULL OR (y ->> 'valor')::numeric IS DISTINCT FROM (x ->> 'valor')::numeric OR (y ->> 'qtd')::int IS DISTINCT FROM (x ->> 'qtd')::int THEN
          RETURN format('G1 %s %s filho %s: gaveta %s (%s) x modal %s', mes, lado, x -> 'caminho', x ->> 'valor', x ->> 'qtd', y);
        END IF;
        fila := fila || jsonb_build_array(x -> 'caminho');
      END LOOP;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(a #> '{foco,linhas}') f WHERE (f ->> 'valor')::numeric <> 0
                    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(g -> 'linhas') z WHERE z -> 'caminho' = f -> 'caminho')) THEN
        RETURN format('G1 %s %s no %s: o modal tem filho com valor que a gaveta nao lista', mes, lado, c);
      END IF;
    ELSE
      -- o subcentro: a soma das linhas de TODAS as paginas = o total; G3 a data de caixa de cada linha na janela
      pg := 1; soma := 0; nl := 0;
      LOOP
        FOR x IN SELECT * FROM jsonb_array_elements(g -> 'linhas') LOOP
          soma := soma + (x ->> 'valor')::numeric; nl := nl + 1;
          IF NOT (x ->> 'previsto')::boolean AND NOT ((x ->> 'data')::date BETWEEN jd AND ja) THEN
            RETURN format('G3 %s %s: realizado pago em %s fora da janela %s–%s', mes, c, x ->> 'data', jd, ja);
          END IF;
          IF (x ->> 'previsto')::boolean AND (NOT (greatest((x ->> 'data')::date, date_trunc('month', hoje)::date) BETWEEN jd AND ja)
                                             OR (x ->> 'vencido')::boolean IS DISTINCT FROM ((x ->> 'data')::date < hoje)) THEN
            RETURN format('G3 %s %s: previsto %s (vencido %s) fora da regra', mes, c, x ->> 'data', x ->> 'vencido');
          END IF;
        END LOOP;
        EXIT WHEN pg >= (g ->> 'paginas')::int;
        pg := pg + 1;
        g := fn_vg_gaveta(cli, '2026-01-01', '2026-12-31', mes, lado, c, crit, ctas, NULL, NULL, hoje, NULL, true, pg, 7);
      END LOOP;
      IF soma IS DISTINCT FROM (g ->> 'total')::numeric OR nl IS DISTINCT FROM (g ->> 'total_linhas')::int THEN
        RETURN format('G1 %s %s subcentro %s: soma das linhas %s (%s) x total %s (%s)', mes, lado, c, soma, nl, g ->> 'total', g ->> 'total_linhas');
      END IF;
    END IF;
  END LOOP;
  RETURN 'ok:' || n;
end $f$;

create function pg_temp.vgga(so int default null) returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_ag constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  cx uuid[]; cfg record; ld text; r text; nos int := 0; lid uuid; v numeric; s1 text[]; s2 text[]; g jsonb; e text;
  rapido boolean := so = -1;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  cx := array(SELECT c.id FROM financeiro_contas_bancarias c WHERE c.cliente_id = c_nj AND c.ativa AND lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta'));
  -- os meses provam o que prometem: out/26 tem vencidos (NJ e Agnaldo) e set/26 do NJ tem compra no cartao
  IF NOT EXISTS (SELECT 1 FROM fn_vg_partes(c_nj, '2026-10-01', '2026-10-31', NULL, NULL, NULL, NULL, '2026-10-23', NULL, true) p WHERE p.vencido)
     OR NOT EXISTS (SELECT 1 FROM fn_vg_partes(c_ag, '2026-10-01', '2026-10-31', NULL, NULL, NULL, NULL, '2026-10-23', NULL, true) p WHERE p.vencido) THEN
    RETURN 'FALHOU: out/26 sem vencidos — o teste nao prova a regra do vencido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fn_vg_partes(c_nj, '2026-09-01', '2026-09-30', NULL, NULL, NULL, NULL, '2026-10-23', NULL, true) p
                   JOIN financeiro_contas_bancarias b ON b.id = p.conta_id WHERE fn_vg_eh_cartao(b.tipo_conta)) THEN
    RETURN 'FALHOU: set/26 do NJ sem compra no cartao';
  END IF;
  -- G1 + G3
  FOR cfg IN SELECT * FROM (VALUES (1, c_nj, '2026-08', 'mes', NULL::uuid[]), (2, c_nj, '2026-09', 'mes', NULL), (3, c_nj, '2026-10', 'mes', NULL),
                                   (4, c_nj, '2026-09', 'mes', cx), (5, c_nj, '2026-09', 'acumulado', NULL),
                                   (6, c_ag, '2026-08', 'mes', NULL), (7, c_ag, '2026-09', 'mes', NULL), (8, c_ag, '2026-10', 'mes', NULL)) t(k, cli, mes, crit, ctas)
                WHERE (so IS NULL OR t.k = so) OR (rapido AND t.k = 4) LOOP
    FOREACH ld IN ARRAY CASE WHEN rapido THEN ARRAY['saida'] ELSE ARRAY['saida', 'entrada'] END LOOP
      r := pg_temp.vgga_no(cfg.cli, cfg.mes, cfg.crit, cfg.ctas, ld);
      IF r NOT LIKE 'ok:%' THEN RETURN 'FALHOU: ' || r; END IF;
      nos := nos + substr(r, 4)::int;
    END LOOP;
  END LOOP;
  -- G2 dividida: um realizado do NJ em set/26 (caixa), saida classificada, vira 60/40 com a classificacao de OUTRO subcentro — num
  -- bloco que se desfaz (P0098): a divisao nao sobrevive nem para as mutacoes
  IF so > 0 THEN RETURN format('OK — recorte %s: %s nos conferidos com o modal', so, nos); END IF;
  BEGIN
    SELECT p.lancamento_id, p.valor, ARRAY[p.grupo, p.atividade, p.centro, p.subcentro] INTO lid, v, s1
      FROM fn_vg_partes(c_nj, '2026-09-01', '2026-09-30', cx, NULL, NULL, NULL, '2026-10-23', NULL, true) p
     WHERE p.lado = 'saida' AND p.eh_real AND p.grupo = 'Custeio' AND p.subcentro IS NOT NULL AND p.valor >= 100 ORDER BY p.valor DESC, p.chave LIMIT 1;
    INSERT INTO financeiro_lancamento_partes (cliente_id, lancamento_id, ordem, valor, percentual, plano_conta_id, macro_custo, grupo_custo,
                                              centro_custo, subcentro, escopo_negocio)
    SELECT c_nj, lid, 1, round(v * 0.6, 2), 60, l.plano_conta_id, l.macro_custo, l.grupo_custo, l.centro_custo, l.subcentro, l.escopo_negocio
      FROM financeiro_lancamentos_v2 l WHERE l.id = lid
    UNION ALL
    SELECT c_nj, lid, 2, v - round(v * 0.6, 2), 40, o.plano_conta_id, o.macro_custo, o.grupo_custo, o.centro_custo, o.subcentro, o.escopo_negocio
      FROM (SELECT l2.* FROM financeiro_lancamentos_v2 l2 WHERE l2.cliente_id = c_nj AND l2.tipo_operacao = '2-Saídas' AND l2.plano_conta_id IS NOT NULL
               AND l2.subcentro IS NOT NULL AND l2.subcentro IS DISTINCT FROM s1[4] AND NOT l2.cancelado ORDER BY l2.id LIMIT 1) o;
    -- a guarda da divisao (111301) so' deixa mudar pelas RPCs dela: a mesma chave que elas ligam, so' neste bloco que se desfaz
    PERFORM set_config('app.fin_dividindo', 'on', true);
    UPDATE financeiro_lancamentos_v2 SET classificacao_dividida = true WHERE id = lid;
    PERFORM set_config('app.fin_dividindo', 'off', true);
    SELECT ARRAY[p.grupo, p.atividade, p.centro, p.subcentro] INTO s2
      FROM fn_vg_partes(c_nj, '2026-09-01', '2026-09-30', cx, NULL, NULL, NULL, '2026-10-23', NULL, true) p WHERE p.lancamento_id = lid AND p.parte_ordem = 2;
    g := fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', s1, 'mes', cx, NULL, NULL, '2026-10-23', NULL, true);
    IF s2 IS NULL THEN e := 'G2 a parte 2 nao entrou na serie';
    ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(g -> 'linhas') x WHERE x ->> 'chave' = lid::text AND (x ->> 'valor')::numeric = round(v * 0.6, 2)
                        AND (x ->> 'valor_lancamento')::numeric = v AND (x ->> 'partes_total')::int = 2) THEN
      e := format('G2 a parte 1 nao esta em %s com %s de %s', s1, round(v * 0.6, 2), v);
    ELSE
      g := fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', s2, 'mes', cx, NULL, NULL, '2026-10-23', NULL, true);
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(g -> 'linhas') x WHERE x ->> 'chave' = lid::text || '#2' AND x ->> 'lancamento_id' = lid::text
                       AND (x ->> 'valor')::numeric = v - round(v * 0.6, 2) AND (x ->> 'valor_lancamento')::numeric = v) THEN
        e := format('G2 a parte 2 ("#2") nao esta em %s', s2);
      ELSE
        r := pg_temp.vgga_no(c_nj, '2026-09', 'mes', cx, 'saida', s1);
        IF r LIKE 'ok:%' THEN r := pg_temp.vgga_no(c_nj, '2026-09', 'mes', cx, 'saida', s2); END IF;
        IF r NOT LIKE 'ok:%' THEN e := 'G2 ' || r; END IF;
      END IF;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0098', MESSAGE = 'desfaz a divisao';
  EXCEPTION WHEN SQLSTATE 'P0098' THEN NULL;
  END;
  IF e IS NOT NULL THEN RETURN 'FALHOU: ' || e; END IF;
  IF rapido THEN RETURN 'OK — rapido'; END IF;
  -- G4
  -- ux: um usuario sem acesso ao Agnaldo
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  BEGIN PERFORM fn_vg_gaveta(c_ag, '2026-01-01', '2026-12-31', '2026-09', 'saida'); RETURN 'FALHOU: G4 outro cliente abriu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  BEGIN PERFORM fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', '{}', 'mes', NULL, NULL, NULL, '2026-10-23', NULL, true, 1, 501);
    RETURN 'FALHOU: G4 501 por pagina';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN PERFORM fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', ARRAY['a', 'b', 'c', 'd', 'e']); RETURN 'FALHOU: G4 caminho de 5';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  IF has_function_privilege('anon', 'public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_vg_partes(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean)', 'EXECUTE') THEN
    RETURN 'FALHOU: G4 anon executa';
  END IF;
  perform set_config('request.jwt.claims', '', true);
  BEGIN PERFORM fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida'); RETURN 'FALHOU: G4 sem usuario abriu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  RETURN format('OK — %s nos conferidos com o modal; dividida 60/40 nos dois subcentros', nos);
end $f$;

create function pg_temp.vgga_mut(so int default null) returns text language plpgsql as $f$
declare m record; d text; r text; vivas text[] := '{}'; total int := 0;
begin
  FOR m IN SELECT * FROM (VALUES
    ('sem filtro de contas', 'public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer)',
     'p_cliente, v_jd, v_ja, p_contas,', 'p_cliente, v_jd, v_ja, NULL,', NULL, NULL),
    ('caixa por competencia', 'public.fn_vg_partes(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean)',
     'v.status_transacao = ''realizado'' AND v.data_pagamento BETWEEN', 'v.status_transacao = ''realizado'' AND v.data_competencia BETWEEN',
     'WHEN v.status_transacao = ''realizado'' THEN v.data_pagamento', 'WHEN v.status_transacao = ''realizado'' THEN v.data_competencia'),
    ('janela do mes desde o inicio', 'public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer)',
     'THEN greatest(p_de, v_ini) ELSE p_de END', 'THEN p_de ELSE p_de END', NULL, NULL),
    ('paginacao perde a ultima', 'public.fn_vg_gaveta(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer)',
     'o.i <= p_pagina * p_por_pagina', 'o.i < p_pagina * p_por_pagina', NULL, NULL),
    ('a parte vira o lancamento inteiro', 'public.fn_vg_partes(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean)',
     'abs(v.valor) AS vparte', 'abs(v.valor_lancamento) AS vparte', NULL, NULL)) t(nome, fn, de1, para1, de2, para2)
     WHERE so IS NULL OR so = (SELECT k FROM (VALUES ('sem filtro de contas', 1), ('caixa por competencia', 2), ('janela do mes desde o inicio', 3),
                                                  ('paginacao perde a ultima', 4), ('a parte vira o lancamento inteiro', 5)) z(n, k) WHERE z.n = t.nome) LOOP
    total := total + 1;
    d := pg_get_functiondef(m.fn::regprocedure);
    IF position(m.de1 in d) = 0 OR (m.de2 IS NOT NULL AND position(m.de2 in d) = 0) THEN vivas := vivas || (m.nome || ' (trecho nao achado)'); CONTINUE; END IF;
    BEGIN
      d := replace(d, m.de1, m.para1);
      IF m.de2 IS NOT NULL THEN d := replace(d, m.de2, m.para2); END IF;
      EXECUTE d;
      r := pg_temp.vgga(-1);
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = r;
    EXCEPTION WHEN SQLSTATE 'P0099' THEN
      IF SQLERRM NOT LIKE 'FALHOU%' THEN vivas := vivas || m.nome; END IF;
    END;
  END LOOP;
  RETURN format('mutacoes mortas %s/%s', total - cardinality(vivas), total)
         || CASE WHEN cardinality(vivas) > 0 THEN ' — VIVAS: ' || array_to_string(vivas, ', ') ELSE '' END;
end $f$;

create function pg_temp.vgga_lista() returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c1 constant uuid := '7f39d18f-d9c9-4027-9d81-78e80b87ea88'; c2 constant uuid := '3b9afa7a-0af6-4bce-8ec9-03b91484dfd8';
  tr constant text[] := ARRAY['Outras saídas', NULL, 'Transferências para outras contas', NULL];
  r record; g jsonb; g1 jsonb; esp int; folhas int := 0; e text[] := '{}';
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  for r in select distinct p.lado, (ARRAY[p.grupo, p.atividade, p.centro, p.subcentro])[1:k] as cam
             from public.fn_vg_partes(c_nj, '2026-10-01', '2026-10-31', NULL, NULL, NULL, NULL, '2026-10-23', NULL, true) p, generate_series(0, 4) k loop
    g := public.fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-10', r.lado, r.cam, 'mes', NULL, NULL, NULL, '2026-10-23', NULL, true, 1, 500);
    if (cardinality(r.cam) = 4) <> (jsonb_typeof(g -> 'lista') = 'object') then e := e || ('lista fora da folha: ' || array_to_string(r.cam, '>', '-')); end if;
    if cardinality(r.cam) = 4 then
      folhas := folhas + 1;
      select count(distinct p.lancamento_id) into esp
        from public.fn_vg_partes(c_nj, '2026-10-01', '2026-10-31', NULL, NULL, NULL, NULL, '2026-10-23', NULL, true) p
       where p.lado = r.lado and ARRAY[p.grupo, p.atividade, p.centro, p.subcentro] is not distinct from r.cam
         and p.vencido and coalesce(p.data_vencimento, p.data_competencia) < '2026-10-01';
      if (g -> 'lista' ->> 'vencidos_fora')::int <> esp then e := e || format('vencidos_fora %s <> %s em %s', g -> 'lista' ->> 'vencidos_fora', esp, array_to_string(r.cam, '>', '-')); end if;
    end if;
  end loop;
  g := public.fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', tr, 'mes', ARRAY[c1, c2], NULL, NULL, '2026-10-23', NULL, true, 1, 500);
  g1 := public.fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', tr, 'mes', ARRAY[c1], NULL, NULL, '2026-10-23', NULL, true, 1, 500);
  select count(*) into esp from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_nj and l.tipo_operacao like '3-%' and l.cancelado = false and l.status_transacao = 'realizado'
     and l.data_pagamento between '2026-09-01' and '2026-09-30'
     and ((l.conta_bancaria_id = c1 and l.conta_destino_id = c2) or (l.conta_bancaria_id = c2 and l.conta_destino_id = c1));
  if esp = 0 then e := e || 'sem transferencia entre as duas contas em set/26 (o caso sumiu)'::text; end if;
  if (g -> 'lista' ->> 'transf_internas')::int < esp then e := e || format('transf_internas %s < %s', g -> 'lista' ->> 'transf_internas', esp); end if;
  if (g1 -> 'lista' ->> 'transf_internas')::int <> 0 then e := e || 'com uma conta, transf_internas <> 0'::text; end if;
  if (g1 ->> 'qtd')::int < (g ->> 'qtd')::int + esp then e := e || format('uma conta: qtd %s < %s + %s', g1 ->> 'qtd', g ->> 'qtd', esp); end if;
  return case when cardinality(e) = 0 then format('G5 OK (%s folhas; transf_internas %s = %s; qtd %s -> %s)', folhas, g -> 'lista' ->> 'transf_internas', esp, g ->> 'qtd', g1 ->> 'qtd')
              else 'G5 FALHOU: ' || array_to_string(e, '; ') end;
end $f$;

create function pg_temp.vgga_lista_igual(mut boolean default false) returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  r record; tr int := 0; e text[] := '{}'; n int := 0; iguais int := 0;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  for r in
    with c(conta) as (values ('7f39d18f-d9c9-4027-9d81-78e80b87ea88'::uuid), ('3b9afa7a-0af6-4bce-8ec9-03b91484dfd8'::uuid)),
    nos as (select distinct c.conta, p.lado, ARRAY[p.grupo, p.atividade, p.centro, p.subcentro] as cam
              from c, public.fn_vg_partes(c_nj, '2026-09-01', '2026-09-30', ARRAY[c.conta], NULL, NULL, NULL, '2026-10-23', NULL, true) p),
    g as (select n.*, public.fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-09', n.lado, n.cam, 'mes', ARRAY[n.conta], NULL, NULL, '2026-10-23', NULL, true, 1, 500) as j,
                 n.cam[2] is null and n.cam[3] like 'Transferências %' as transf from nos n)
    select g.conta, g.lado, g.cam, g.transf, (g.j ->> 'qtd')::int as gav, g.j -> 'lista' as l,
      (public.fn_fin_v2_lista_pagina(c_nj,
         jsonb_strip_nulls(jsonb_build_object('dimensao', 'financeira', 'modo_sem_caixa', 'ocultar',
           'tipo_operacao', case when g.transf then '3-Transferências' when g.lado = 'saida' then '2-Saídas' else '1-Entradas' end,
           case when g.lado = 'saida' or mut then 'conta_origem' else 'conta_destino' end, g.conta,
           'atividade', g.cam[2], 'centro', case when g.transf then null else g.cam[3] end, 'subcentro', g.cam[4],
           'anos', jsonb_build_array(2026), 'meses', jsonb_build_array(9),
           'status', jsonb_build_array('realizado', 'conciliado_real', 'previsto', 'programado', 'agendado'))),
         '{"campo":"default","dir":"asc","nivel":"subcentro"}'::jsonb, 0, 5) ->> 'total_linhas')::int as lis
      from g
  loop
    n := n + 1;
    if r.gav = r.lis then iguais := iguais + 1;
    elsif (r.l ->> 'vencidos_fora')::int = 0 and (r.l ->> 'transf_internas')::int = 0 and coalesce((r.l ->> 'faturas_cartao')::int, 0) = 0 then
      e := e || format('%s %s %s: gaveta %s x lista %s sem aviso', left(r.conta::text, 4), r.lado, array_to_string(r.cam, '>', '-'), r.gav, r.lis);
    end if;
    if r.transf and r.gav > 0 then
      tr := tr + 1;
      if r.gav <> r.lis then e := e || format('transferencia %s %s: gaveta %s x lista %s', left(r.conta::text, 4), r.lado, r.gav, r.lis); end if;
    end if;
  end loop;
  if tr < 2 then e := e || 'faltou o no de transferencia de entrada ou de saida com lancamentos (o caso sumiu)'::text; end if;
  return case when cardinality(e) = 0 then format('G6 OK (%s subcentros, %s iguais, %s transferencias iguais)', n, iguais, tr)
              else 'G6 FALHOU: ' || array_to_string(e, '; ') end;
end $f$;

create function pg_temp.vgga_fatura(mut boolean default false) returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  no_tr constant text[] := ARRAY['Outras saídas', NULL, 'Transferências para outras contas', NULL];
  st constant jsonb := jsonb_build_array('realizado', 'conciliado_real', 'previsto', 'programado', 'agendado');
  r record; g jsonb; lis int; fat int; e text[] := '{}';
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  for r in select * from (values ('3b9afa7a-0af6-4bce-8ec9-03b91484dfd8'::uuid, '2026-10', 10, true),
                                 ('7f39d18f-d9c9-4027-9d81-78e80b87ea88'::uuid, '2026-09', 9, false)) t(conta, mes, m, caso) loop
    g := public.fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', r.mes, 'saida', no_tr, 'mes', ARRAY[r.conta], NULL, NULL, '2026-10-23', NULL, true, 1, 500);
    lis := (public.fn_fin_v2_lista_pagina(c_nj, jsonb_build_object('dimensao', 'financeira', 'modo_sem_caixa', 'ocultar',
              'tipo_operacao', '3-Transferências', 'conta_origem', r.conta, 'anos', jsonb_build_array(2026), 'meses', jsonb_build_array(r.m),
              'status', st), '{"campo":"default","dir":"asc","nivel":"subcentro"}'::jsonb, 0, 5) ->> 'total_linhas')::int;
    fat := case when mut then 0 else coalesce((g #>> '{lista,faturas_cartao}')::int, 0) end;
    if (g ->> 'qtd')::int = 0 then e := e || format('%s %s: no de transferencia vazio (o caso sumiu)', left(r.conta::text, 4), r.mes); end if;
    if r.caso and fat = 0 then e := e || format('%s %s: gaveta %s x lista %s sem o aviso da fatura', left(r.conta::text, 4), r.mes, g ->> 'qtd', lis); end if;
    if not r.caso and fat <> 0 then e := e || format('%s %s: faturas_cartao %s sem caso', left(r.conta::text, 4), r.mes, fat); end if;
    if (g ->> 'qtd')::int + fat <> lis then e := e || format('%s %s: gaveta %s + faturas %s <> lista %s', left(r.conta::text, 4), r.mes, g ->> 'qtd', fat, lis); end if;
  end loop;
  -- todas as contas: o cartao esta' no conjunto, o pagamento e' transferencia interna (sem no' de saida; se houver, 0)
  g := public.fn_vg_gaveta(c_nj, '2026-01-01', '2026-12-31', '2026-10', 'saida', no_tr, 'mes', NULL, NULL, NULL, '2026-10-23', NULL, true, 1, 500);
  if coalesce((g #>> '{lista,faturas_cartao}')::int, 0) <> 0 then e := e || 'todas as contas com faturas_cartao <> 0'::text; end if;
  return case when cardinality(e) = 0 then 'G7 OK (3b9a out/26: gaveta 1 + 1 fatura = lista 2; sem caso 0)' else 'G7 FALHOU: ' || array_to_string(e, '; ') end;
end $f$;

do $$ begin raise exception 'VGGA % | % | % | % | mutacao entrada pela origem: % | % | mutacao sem o aviso da fatura: %', pg_temp.vgga(), pg_temp.vgga_mut(),
  pg_temp.vgga_lista(), pg_temp.vgga_lista_igual(), pg_temp.vgga_lista_igual(true), pg_temp.vgga_fatura(), pg_temp.vgga_fatura(true); end $$;
