-- 20260821190000_pr_status_ano_filtro_ativa.sql
-- PR-HOME-REGUA-MESES-01 (ajuste) — a grade anual exclui fazenda INATIVA.
--
-- CAUSA-RAIZ (medido no proto, 2026-08-21).
-- A regra de cor da regua exige, para o VERDE, que TODAS as fazendas do cliente tenham
-- fechado o mes — decisao explicita: "se tem 1 ou 12 fazendas, tem que fechar todas todo
-- mes". Mas a grade devolvia TODAS as fazendas, inclusive as que NAO OPERAM.
--
-- Efeito medido no NJ Pecuaria, 2026: a fazenda "Administrativo" (status_operacional
-- 'inativa', 0 pastos, 0 cards) nunca fecha mes nenhum, entao impedia o verde em TODOS
-- os meses, PARA SEMPRE. Janeiro a julho tinham 4 de 4 fazendas operacionais fechadas e
-- apareciam AMBAR por causa dela.
--
-- O campo status_operacional ja distingue com precisao quem opera; nao foi preciso
-- inventar criterio. Valores existentes na tabela: 'ativa' e 'inativa', apenas — sem NULL
-- e sem terceiro estado, verificado antes de usar igualdade no filtro.
--     ativa ..... 13 fazendas
--     inativa ....  6 fazendas
-- As 6 inativas sao exatamente as 6 "Administrativo" de Agnaldo Cedenho, NJ Pecuaria,
-- Raul Juliato, RRCC, Santa Rita Agro e Vera Ligia Milani, todas com 0 pastos e 0 cards.
--
-- POR QUE NA RPC E NAO NO FRONT. E aqui que a informacao vive: Fazenda, no
-- FazendaContext, tem tem_pecuaria mas NAO tem status_operacional — filtrar na tela
-- exigiria alargar o contexto. Corrigindo na funcao, qualquer consumidor futuro herda o
-- universo certo, e a regua nao precisa aprender o que e fazenda inativa.
--
-- NENHUM CLIENTE FICA COM ZERO FAZENDAS. Medido, antes -> depois de linhas na grade:
--     NJ Pecuaria ......... 60 -> 48   (5 -> 4 fazendas)
--     Santa Rita Agro ..... 36 -> 24   (3 -> 2)
--     Vera Ligia Milani ... 36 -> 24   (3 -> 2)
--     Agnaldo Cedenho ..... 36 -> 24   (3 -> 2)
--     Raul Juliato ........ 24 -> 12   (2 -> 1)
--     RRCC ................ 24 -> 12   (2 -> 1)
--     Teste Cliente ....... 12 -> 12   (1 -> 1, a unica "Administrativo" marcada ativa)
--
-- EFEITO NA REGUA (NJ Pecuaria, 2026), medido com o filtro:
--     Jan a Jul .... VERDE      (4 de 4 fechadas; era ambar)
--     Ago .......... vermelho   (2 nao iniciadas, 0 fechadas, 2 pendentes)
--     Set a Dez .... cinza      (4 nao iniciadas)
--
-- ESCOPO. UMA linha no WHERE. A guarda RLS, a validacao de ano, o CROSS JOIN dos 12
-- meses, a chamada a get_status_pilares_fechamento e a ordenacao ficam INTOCADOS.
-- get_status_pilares_fechamento nao e tocada. Nome, assinatura, RETURNS TABLE, LANGUAGE,
-- STABLE, SECURITY DEFINER, search_path, owner e ACL preservados.
-- Base: md5 a71c96760d80789b11e72883b803a6a6.
--
-- NENHUM DADO E ALTERADO. status_operacional so e LIDO; nenhuma fazenda muda de estado.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.

CREATE OR REPLACE FUNCTION public.get_status_pilares_ano(
  p_cliente_id uuid,
  p_ano        int
) RETURNS TABLE(
  fazenda_id   uuid,
  fazenda_nome text,
  ano_mes      text,
  p1           text,
  p2           text
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;

  -- Sem isto, SECURITY DEFINER + cliente_id vindo por parametro = vazamento entre tenants.
  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id)
                WHERE t.cliente_id = p_cliente_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION USING ERRCODE='22007',
      MESSAGE='ano_invalido: esperado entre 2000 e 2100';
  END IF;

  RETURN QUERY
    SELECT f.id,
           f.nome,
           to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'),
           (public.get_status_pilares_fechamento(f.id, to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'))
             ->'p1_mapa_pastos'->>'status'),
           (public.get_status_pilares_fechamento(f.id, to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'))
             ->'p2_valor_rebanho'->>'status')
      FROM public.fazendas f
      CROSS JOIN (SELECT generate_series(1,12) mm) m
     WHERE f.cliente_id = p_cliente_id
       AND f.status_operacional = 'ativa'
     ORDER BY f.nome, 3;
END;
$function$;

-- ACL replicada de get_status_pilares_ano, medida em 2026-08-21:
--   {postgres=X/postgres, service_role=X/postgres, authenticated=X/postgres}
-- CREATE OR REPLACE preserva a ACL existente; os comandos abaixo sao idempotentes e
-- garantem o estado mesmo se a funcao vier a ser recriada do zero.
REVOKE EXECUTE ON FUNCTION public.get_status_pilares_ano(uuid, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_status_pilares_ano(uuid, int) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_status_pilares_ano(uuid, int) TO service_role;

COMMENT ON FUNCTION public.get_status_pilares_ano(uuid, int) IS
  'Grade de status de fechamento: uma linha por fazenda ATIVA do cliente x mes do ano (12 meses sempre, inclusive celulas nao_iniciado — a regua precisa dos buracos). Fazenda com status_operacional distinto de ativa fica FORA: sem esse filtro, uma fazenda que nao opera (as "Administrativo", 0 pastos e 0 cards) impede o verde de todos os meses do cliente para sempre, porque a regua so pinta verde quando TODAS as fazendas fecham. ENVOLVE get_status_pilares_fechamento em vez de duplicar a regra. NAO agrega por mes — juntar N fazendas numa cor e decisao de apresentacao e vive na tela. GUARDA DE TENANT OBRIGATORIA: e SECURITY DEFINER e recebe cliente_id por parametro. O corpo chama a funcao DUAS vezes por celula; trocar por CROSS JOIN LATERAL cortaria pela metade, medir apos aplicar.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter devolve a fazenda inativa a grade e o VERDE volta a ser impossivel para os
-- seis clientes que tem uma "Administrativo" — 7 meses do NJ Pecuaria voltam de verde
-- para ambar sem que nada tenha deixado de ser fechado.
-- Corpo capturado por pg_get_functiondef em 2026-08-21, md5 a71c96760d80789b11e72883b803a6a6.
-- ------------------------------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.get_status_pilares_ano(
--   p_cliente_id uuid,
--   p_ano        int
-- ) RETURNS TABLE(
--   fazenda_id   uuid,
--   fazenda_nome text,
--   ano_mes      text,
--   p1           text,
--   p2           text
-- )
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE v_uid uuid := auth.uid();
-- BEGIN
--   IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;
--
--   -- Sem isto, SECURITY DEFINER + cliente_id vindo por parametro = vazamento entre tenants.
--   IF NOT (public.is_admin_agroinblue(v_uid)
--     OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id)
--                 WHERE t.cliente_id = p_cliente_id)) THEN
--     RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;
--
--   IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
--     RAISE EXCEPTION USING ERRCODE='22007',
--       MESSAGE='ano_invalido: esperado entre 2000 e 2100';
--   END IF;
--
--   RETURN QUERY
--     SELECT f.id,
--            f.nome,
--            to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'),
--            (public.get_status_pilares_fechamento(f.id, to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'))
--              ->'p1_mapa_pastos'->>'status'),
--            (public.get_status_pilares_fechamento(f.id, to_char(make_date(p_ano, m.mm, 1),'YYYY-MM'))
--              ->'p2_valor_rebanho'->>'status')
--       FROM public.fazendas f
--       CROSS JOIN (SELECT generate_series(1,12) mm) m
--      WHERE f.cliente_id = p_cliente_id
--      ORDER BY f.nome, 3;
-- END;
-- $function$;
-- ================================================================================================
