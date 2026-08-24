-- PR-ZOOT-CACHE-INVALIDAR-01 — o cache passa a ser invalidado pelo fechamento.
--
-- O DEFEITO. `trg_invalidate_zoot_cache` esta preso a `lancamentos`, lendo
-- NEW.data e NEW.fazenda_id. Fechar ou editar um pasto NAO invalida nada, e o
-- construtor do cache (`fn_zoot_categoria_mensal`) LE o fechamento — filtra
-- `fp2.status = 'fechado'` e usa `fpi.peso_total` por categoria. Ou seja: a
-- entrada muda e o cache nao percebe.
--
-- Em 24/08/2026 isso ja custou dois diagnosticos errados nesta base, porque o
-- cache e o que toda consulta SQL direta le. O app nao erra — aplica o overlay
-- desde o PR-34 —, mas a ferramenta de CONFERENCIA mentia.
--
-- POR QUE `updated_at` NAO RESOLVIA. Conferido nos CINCO gatilhos que
-- `fechamento_pastos` ja tinha: todos disparam pela propria tabela. Os dois de
-- `fechamento_pasto_itens` apenas LEEM o cabecalho (`SELECT ... INTO`), nunca
-- escrevem. Medido no dado: Faz Baia Grande tem cabecalho de 2026-03-29 e item
-- criado em 2026-08-21 — cinco meses depois. Editar item nao toca o cabecalho,
-- entao um gatilho so no cabecalho NAO cobriria.
--
-- CUSTO DA INVALIDACAO — medido, nao estimado. `fn_zoot_categoria_mensal` na
-- NJ/2026: Sta. Luzia 1.429 ms, Sto. Expedito 1.574 ms, Pureza 1.925 ms; o
-- cliente inteiro em 4,9 s. O `fn_zoot_cache_ensure` reconstroi na proxima
-- abertura de tela. (O numero de 76 s que circulava era estimativa de outra
-- sessao e foi descartado ao ser remedido.)
--
-- ESCOPO DA INVALIDACAO: `(fazenda_id, ano)` inteiro — o MESMO que
-- `trg_invalidate_zoot_cache` ja pratica. Nao inventamos granularidade nova:
-- duas regras diferentes para a mesma decisao e como divergencia vira
-- permanente.
--
-- NAO CORRIGE A REGRA DO COALESCE. O construtor mantem a cadeia biologica onde
-- a categoria falta no fechamento, enquanto o overlay do app ZERA. Sao duas
-- implementacoes da mesma regra e uma delas esta errada — decisao propria,
-- fora deste PR. Aqui so garantimos que o cache reflita o que o construtor
-- produz HOJE.

--
-- SOBRE OS `DROP TRIGGER IF EXISTS`: eles miram APENAS os nomes que esta
-- migration cria, que ainda nao existem no banco. Nenhum gatilho preexistente
-- e derrubado — `trg_invalidate_zoot_cache` (lancamentos) e os CINCO de
-- `fechamento_pastos` seguem intactos. O par DROP-IF-EXISTS + CREATE existe
-- para a migration poder reexecutar sem erro.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Cabecalho do fechamento.
--
-- Cobre a mudanca de `status`: 'aberto' -> 'fechado' altera o resultado do
-- construtor sem tocar em item nenhum, e hoje nao invalida nada. Cobre tambem
-- movimentacao de `fazenda_id` e `ano_mes`, por isso o lado OLD e apagado
-- SEMPRE em UPDATE — apagar duas vezes o mesmo par e inocuo, deixar de apagar
-- o antigo nao e.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ano integer;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.ano_mes IS NOT NULL THEN
    v_ano := EXTRACT(year FROM (NEW.ano_mes || '-01')::date)::integer;
    DELETE FROM public.zoot_mensal_cache
      WHERE fazenda_id = NEW.fazenda_id AND ano = v_ano;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.ano_mes IS NOT NULL THEN
    v_ano := EXTRACT(year FROM (OLD.ano_mes || '-01')::date)::integer;
    DELETE FROM public.zoot_mensal_cache
      WHERE fazenda_id = OLD.fazenda_id AND ano = v_ano;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_fechamento ON public.fechamento_pastos;
CREATE TRIGGER trg_invalidate_zoot_cache_fechamento
  AFTER INSERT OR UPDATE OR DELETE ON public.fechamento_pastos
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Itens do fechamento — STATEMENT, com transition table.
--
-- `fechamento_pasto_itens` nao tem `fazenda_id` nem data: so `fechamento_id`.
-- O JOIN com o cabecalho e obrigatorio para achar (fazenda, ano).
--
-- FOR EACH STATEMENT e nao ROW: fechar a Faz. 3 Muchachas mexe em 42 itens, e
-- em ROW seriam 42 lookups e 42 DELETE do MESMO par. Em STATEMENT e um
-- disparo, com DISTINCT.
--
-- TRES gatilhos e nao um: o PostgreSQL nao aceita transition table em gatilho
-- com mais de um evento. E `NEW TABLE` nao existe em DELETE, nem `OLD TABLE`
-- em INSERT — por isso o corpo ramifica por TG_OP e so referencia a tabela que
-- existe naquele evento. Referenciar a outra e erro de execucao, nao NULL.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento_itens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    DELETE FROM public.zoot_mensal_cache z
     USING (
       SELECT DISTINCT fp.fazenda_id,
              EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer AS ano
         FROM novos n
         JOIN public.fechamento_pastos fp ON fp.id = n.fechamento_id
        WHERE fp.ano_mes IS NOT NULL
     ) alvo
     WHERE z.fazenda_id = alvo.fazenda_id AND z.ano = alvo.ano;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.zoot_mensal_cache z
     USING (
       SELECT DISTINCT fp.fazenda_id,
              EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer AS ano
         FROM antigos a
         JOIN public.fechamento_pastos fp ON fp.id = a.fechamento_id
        WHERE fp.ano_mes IS NOT NULL
     ) alvo
     WHERE z.fazenda_id = alvo.fazenda_id AND z.ano = alvo.ano;

  ELSE
    -- UPDATE: item pode MUDAR de fechamento, entao os dois lados contam.
    DELETE FROM public.zoot_mensal_cache z
     USING (
       SELECT DISTINCT fp.fazenda_id,
              EXTRACT(year FROM (fp.ano_mes || '-01')::date)::integer AS ano
         FROM (SELECT fechamento_id FROM novos
               UNION
               SELECT fechamento_id FROM antigos) t
         JOIN public.fechamento_pastos fp ON fp.id = t.fechamento_id
        WHERE fp.ano_mes IS NOT NULL
     ) alvo
     WHERE z.fazenda_id = alvo.fazenda_id AND z.ano = alvo.ano;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_fpi_ins ON public.fechamento_pasto_itens;
CREATE TRIGGER trg_invalidate_zoot_cache_fpi_ins
  AFTER INSERT ON public.fechamento_pasto_itens
  REFERENCING NEW TABLE AS novos
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento_itens();

DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_fpi_upd ON public.fechamento_pasto_itens;
CREATE TRIGGER trg_invalidate_zoot_cache_fpi_upd
  AFTER UPDATE ON public.fechamento_pasto_itens
  REFERENCING NEW TABLE AS novos OLD TABLE AS antigos
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento_itens();

DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_fpi_del ON public.fechamento_pasto_itens;
CREATE TRIGGER trg_invalidate_zoot_cache_fpi_del
  AFTER DELETE ON public.fechamento_pasto_itens
  REFERENCING OLD TABLE AS antigos
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento_itens();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Saldos iniciais — a TERCEIRA porta, e a que fecha a cadeia.
--
-- POR QUE ELA EXISTE. `saldos_iniciais` e entrada DIRETA do construtor: a CTE
-- `saldo_ini_cat` de `fn_zoot_categoria_mensal` le dela. E ela nao e escrita
-- so a mao — `trg_propagar_saldo_dezembro`, que ja roda em
-- `fechamento_pastos`, INSERE nela.
--
-- A CADEIA, conferida no corpo de `propagar_saldo_inicial_pos_dezembro`:
-- fechar dezembro de N grava `v_ano_seguinte := v_ano + 1` em
-- `saldos_iniciais.ano`, com `mes = 1`. Ou seja, fechar dez/2025 invalidaria
-- 2025 pelo gatilho da secao 1 e deixaria 2026 — o ano que RECEBE o saldo
-- propagado — com cache velho.
--
-- Fechar duas portas e manter a terceira aberta e pior que nao fechar
-- nenhuma: da a impressao de que o problema acabou.
--
-- O ANO SAI CERTO POR CONSTRUCAO. O gatilho deriva `(fazenda_id, ano)` das
-- colunas da PROPRIA linha — `saldos_iniciais` tem `ano` e `mes` como colunas,
-- nao ha data para derivar. Como a propagacao grava a linha JA no ano seguinte,
-- invalidar o ano da linha escrita invalida exatamente o ano afetado.
--
-- SEM RECURSAO — verificado, nao suposto:
--   `zoot_mensal_cache` tem ZERO gatilhos, entao todo ramo TERMINA nele.
--   `fn_completar_categorias_saldo_inicial` escreve em `saldos_iniciais`
--     (re-dispara este gatilho) mas NAO escreve em `fechamento_*` nem no cache.
--   `guard_saldos_iniciais_mes_fechado` nao escreve em lugar nenhum.
--   Logo:
--     fechamento_pastos UPDATE
--       -> DELETE cache (ano N)                              -> fim
--       -> propagar_saldo_dezembro -> saldos_iniciais (N+1)
--            -> DELETE cache (ano N+1)                       -> fim
--            -> completar_categorias -> saldos_iniciais (N+1)
--                 -> DELETE cache (ano N+1)                  -> fim
--   Nenhum ramo volta a uma tabela de origem. Nao ha ciclo.
--
-- FOR EACH ROW, e nao STATEMENT como na secao 2: aqui sao no maximo nove
-- linhas por fazenda-ano (uma por categoria), e o DELETE repetido do mesmo par
-- e inocuo — depois do primeiro ele varre conjunto vazio. Nao vale a
-- complexidade de tres gatilhos com transition table para nove linhas.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_invalidate_zoot_cache_saldos_iniciais()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.ano IS NOT NULL THEN
    DELETE FROM public.zoot_mensal_cache
      WHERE fazenda_id = NEW.fazenda_id AND ano = NEW.ano;
  END IF;

  -- Em UPDATE o lado OLD tambem, pela mesma razao da secao 1: a linha pode
  -- mudar de fazenda ou de ano, e o par antigo ficaria com cache orfao.
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.ano IS NOT NULL THEN
    DELETE FROM public.zoot_mensal_cache
      WHERE fazenda_id = OLD.fazenda_id AND ano = OLD.ano;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_saldos_iniciais ON public.saldos_iniciais;
CREATE TRIGGER trg_invalidate_zoot_cache_saldos_iniciais
  AFTER INSERT OR UPDATE OR DELETE ON public.saldos_iniciais
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_invalidate_zoot_cache_saldos_iniciais();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (comentado)
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_saldos_iniciais ON public.saldos_iniciais;
-- DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_fpi_del ON public.fechamento_pasto_itens;
-- DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_fpi_upd ON public.fechamento_pasto_itens;
-- DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_fpi_ins ON public.fechamento_pasto_itens;
-- DROP TRIGGER IF EXISTS trg_invalidate_zoot_cache_fechamento ON public.fechamento_pastos;
-- DROP FUNCTION IF EXISTS public.trg_fn_invalidate_zoot_cache_saldos_iniciais();
-- DROP FUNCTION IF EXISTS public.trg_fn_invalidate_zoot_cache_fechamento_itens();
-- DROP FUNCTION IF EXISTS public.trg_fn_invalidate_zoot_cache_fechamento();
-- COMMIT;
