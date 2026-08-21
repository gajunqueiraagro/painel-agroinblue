-- 20260821180000_pr_status_ano_rpc.sql
-- PR-STATUS-ANO-RPC-01 — status de fechamento do ano inteiro numa chamada.
--
-- PARA QUE SERVE. A regua de meses da Visao Geral substitui o dropdown por 12 cards
-- coloridos, como ja existe no Fechamento de Pastos, e precisa do status de TODAS as
-- fazendas do cliente em TODOS os meses do ano. Pelo front seriam 12 x N chamadas — 60
-- so no NJ Pecuaria, a cada troca de ano.
--
-- ENVOLVE, NAO DUPLICA. A regra de "mes fechado" continua existindo em UM lugar so:
-- get_status_pilares_fechamento. Esta funcao monta a grade e a chama celula a celula.
-- Reimplementar a regra aqui criaria a segunda fonte que esta frente passou o dia
-- eliminando — e' o mesmo erro que o P1 cometia contra FechamentoTab.tsx.
-- Base: md5 99545c7e93775de0a7bbe6586daff8c7.
--
-- GUARDA DE TENANT — NAO E FORMALIDADE.
-- SECURITY DEFINER roda com os poderes do owner e ATRAVESSA a RLS. Sem a checagem de
-- cliente, qualquer authenticated leria o status de qualquer cliente passando um uuid
-- — a funcao recebe cliente_id como PARAMETRO, entao o filtro por si so nao protege
-- nada. O idioma e o mesmo de fn_natureza_patrimonial_fazenda, adaptado para receber
-- cliente em vez de fazenda: is_admin_agroinblue OU pertencer a get_user_cliente_ids.
--
-- DEVOLVE A GRADE INTEIRA, inclusive celulas 'nao_iniciado'. A regua precisa de uma
-- celula por mes; filtrar aqui obrigaria o front a reconstruir os buracos, e reconstruir
-- buraco e' como se inventa dado.
--
-- NAO AGREGA POR MES. Juntar N fazendas numa cor e' decisao de APRESENTACAO e vive na
-- tela — a mesma razao pela qual useStatusPilaresLote devolve por fazenda e a faixa e'
-- que calcula a fracao.
--
-- CUSTO MEDIDO (2026-08-21, NJ Pecuaria, 2026, 5 fazendas x 12 meses = 60 celulas):
--   O canal read-only desta sessao NAO tem EXECUTE em get_status_pilares_fechamento
--   (permission denied), entao nao foi possivel cronometrar a funcao em si. O que foi
--   medido e' o EQUIVALENTE INLINE — a mesma logica escrita como query direta:
--       Execution Time: 6,683 ms   (60 linhas)
--   Ou seja: o trabalho de DADO e' irrisorio. O 1,2 s observado no front vem do custo
--   de INVOCACAO da funcao plpgsql, repetido por celula.
--   ISSO IMPORTA PARA UMA ESCOLHA AQUI: o corpo abaixo chama a funcao DUAS VEZES por
--   celula (uma para o P1, outra para o P2) — 120 invocacoes para 60 celulas. Um
--   CROSS JOIN LATERAL chamaria uma vez e extrairia os dois campos, cortando pela
--   metade. NAO fiz a troca porque nao consegui medir as duas variantes, e otimizar sem
--   numero e' o que o briefing proibe. Fica registrado como a primeira coisa a medir
--   depois de aplicar: se a grade demorar, a mudanca sao quatro linhas.
--
-- VALIDACAO DO ANO. Fora de [2000, 2100] a funcao levanta 'ano_invalido' em vez de
-- gerar 12 celulas de trabalho inutil.
--
-- NENHUMA FUNCAO EXISTENTE E ALTERADA. Nenhum dado. STABLE, so le.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? A regra sim (get_status_pilares_fechamento); a GRADE nao.
--   (b) Reutilizar? Sim — a funcao nova nao contem regra nenhuma, so montagem.
--   (c) Fonte soberana? get_status_pilares_fechamento, sem excecao.
--   (d) Segunda forma? Nao. Se a regra mudar, muda em um lugar e a grade acompanha.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Nenhuma nova. Fica registrada a medicao pendente das duas variantes.
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
     ORDER BY f.nome, 3;
END;
$function$;

-- ACL replicada de get_status_pilares_fechamento, medida em 2026-08-21:
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- PUBLIC nao consta la, entao tambem nao consta aqui.
REVOKE EXECUTE ON FUNCTION public.get_status_pilares_ano(uuid, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_status_pilares_ano(uuid, int) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_status_pilares_ano(uuid, int) TO service_role;

COMMENT ON FUNCTION public.get_status_pilares_ano(uuid, int) IS
  'Grade de status de fechamento: uma linha por fazenda do cliente x mes do ano (12 meses sempre, inclusive celulas nao_iniciado — a regua precisa dos buracos). ENVOLVE get_status_pilares_fechamento em vez de duplicar a regra: a definicao de "mes fechado" continua existindo em um lugar so. NAO agrega por mes — juntar N fazendas numa cor e decisao de apresentacao e vive na tela. GUARDA DE TENANT OBRIGATORIA: e SECURITY DEFINER e recebe cliente_id por parametro, entao sem a checagem is_admin_agroinblue / get_user_cliente_ids qualquer authenticated leria o status de qualquer cliente. Custo: o trabalho de dado e irrisorio (6,7 ms para 60 celulas no equivalente inline); o tempo observado vem da invocacao da funcao por celula, e o corpo a chama DUAS vezes por celula — trocar por CROSS JOIN LATERAL cortaria pela metade, medir apos aplicar.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Funcao NOVA: derruba-la nao afeta nada existente, so a regua que depende dela.
-- get_status_pilares_fechamento nao e tocada em momento nenhum.
-- ------------------------------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.get_status_pilares_ano(uuid, int);
-- ================================================================================================
