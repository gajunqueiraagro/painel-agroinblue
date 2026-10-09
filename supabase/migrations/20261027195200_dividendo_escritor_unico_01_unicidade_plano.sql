-- DIVIDENDO-ESCRITOR-UNICO-01 (passo 1) — A UNICIDADE DO PLANO DE CONTAS PASSA A SER POR CLIENTE (Gabriel, 09/10/2026).
--
-- ANTES: `uq_plano_contas_global` = tipo + macro + grupo + centro + subcentro entre as ATIVAS, SEM o cliente. Dois clientes nao
--   podiam ter conta ativa de mesmo nome (o que impede cada cliente de ter os seus dividendos), e — efeito colateral que virou
--   garantia — conta de cliente nao podia repetir a classificacao de uma conta global.
-- DEPOIS:
--   (1) `uq_plano_contas_cliente`  — unica DENTRO do cliente (as mesmas colunas + cliente_id), entre as ativas de cliente;
--   (2) `uq_plano_contas_global`   — unica ENTRE AS GLOBAIS (as mesmas colunas), entre as ativas sem cliente;
--   (3) a TRAVA `trg_guard_plano_cliente_x_global` (decisao do Gabriel, Opcao 1): os dois indices sozinhos deixariam de recusar o
--       par "conta do cliente + conta global de mesma classificacao", e ha' leitores que contam "global OU do cliente" e dependem
--       de dar exatamente 1 (`oc_criar_compromisso`, `oc_gerar_obrigacoes`, `fn_classificacao_resolver_subcentro`, e os do
--       "dobro" ja' registrados). A trava recusa (a) conta de CLIENTE com a hierarquia de uma GLOBAL ativa e (b) GLOBAL com a
--       hierarquia de uma conta de CLIENTE ativa — em INSERT e em UPDATE (reativar, trocar o cliente, trocar coluna da
--       hierarquia). INATIVAR NUNCA E' BARRADO. Recusa com SQLSTATE 23505 (a mesma classe do indice de antes: quem tratava
--       `unique_violation` continua tratando) e frase em portugues dizendo qual conta colide.
--       ⚠ A hierarquia e' comparada COMO O INDICE COMPARA (tipo, macro, centro crus; grupo e subcentro com COALESCE ''): espelho
--         declarado do indice — quem mexer num confere o outro.
--       ⚠ CORRIDA: dois INSERTs simultaneos (um de cliente, um global) nao se veem; a trava serializa por hierarquia com
--         `pg_advisory_xact_lock`.
--
-- MEDIDO ANTES (09/10, so' leitura): 245 contas, 239 ativas (19 de cliente, todas de macro Dividendos); 0 violacoes da unicidade
--   nova; 0 pares cliente + global ativos pela hierarquia inteira, 0 pelo subcentro + tipo e 0 so' pelo subcentro; 0 ativas com
--   tipo, macro ou centro nulo; ninguem no banco nem no front escreve em `financeiro_plano_contas` (so' migrations).
--
-- GESTO CONTRARIO (so' vale enquanto nao houver dois clientes com a mesma classificacao ativa):
--   DROP TRIGGER trg_guard_plano_cliente_x_global ON public.financeiro_plano_contas;
--   DROP FUNCTION public.guard_plano_cliente_x_global();
--   DROP INDEX public.uq_plano_contas_cliente;  DROP INDEX public.uq_plano_contas_global;
--   CREATE UNIQUE INDEX uq_plano_contas_global ON public.financeiro_plano_contas
--     (tipo_operacao, macro_custo, COALESCE(grupo_custo, ''), centro_custo, COALESCE(subcentro, '')) WHERE (ativo = true);

-- O banco e' o dos clientes: se a trava da tabela nao vier em 2 s, a migration aborta e nao espera na fila.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- ── guarda de origem: o indice de hoje e' o esperado, e nao ha' nada que a regra nova recuse ──
DO $g$
DECLARE v_def text; v_n int;
BEGIN
  SELECT indexdef INTO v_def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_plano_contas_global';
  IF v_def IS NULL OR md5(v_def) <> md5('CREATE UNIQUE INDEX uq_plano_contas_global ON public.financeiro_plano_contas USING btree (tipo_operacao, macro_custo, COALESCE(grupo_custo, ''''::text), centro_custo, COALESCE(subcentro, ''''::text)) WHERE (ativo = true)') THEN
    RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 1: uq_plano_contas_global nao e'' o indice esperado (%).', coalesce(v_def, 'ausente');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_plano_contas_cliente') THEN
    RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 1: uq_plano_contas_cliente ja'' existe.';
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.financeiro_plano_contas WHERE ativo = true
     GROUP BY cliente_id, tipo_operacao, macro_custo, COALESCE(grupo_custo, ''), centro_custo, COALESCE(subcentro, '') HAVING count(*) > 1) s;
  IF v_n <> 0 THEN RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 1: % violacoes da unicidade nova.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.financeiro_plano_contas c JOIN public.financeiro_plano_contas g
      ON g.cliente_id IS NULL AND g.ativo = true AND g.tipo_operacao = c.tipo_operacao AND g.macro_custo = c.macro_custo
     AND COALESCE(g.grupo_custo, '') = COALESCE(c.grupo_custo, '') AND g.centro_custo = c.centro_custo
     AND COALESCE(g.subcentro, '') = COALESCE(c.subcentro, '')
   WHERE c.cliente_id IS NOT NULL AND c.ativo = true;
  IF v_n <> 0 THEN RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 1: % pares cliente + global ativos.', v_n; END IF;
END
$g$;

-- ── (1) e (2): os dois indices ──
DROP INDEX public.uq_plano_contas_global;

CREATE UNIQUE INDEX uq_plano_contas_cliente ON public.financeiro_plano_contas
  USING btree (cliente_id, tipo_operacao, macro_custo, COALESCE(grupo_custo, ''::text), centro_custo, COALESCE(subcentro, ''::text))
  WHERE (ativo = true AND cliente_id IS NOT NULL);

CREATE UNIQUE INDEX uq_plano_contas_global ON public.financeiro_plano_contas
  USING btree (tipo_operacao, macro_custo, COALESCE(grupo_custo, ''::text), centro_custo, COALESCE(subcentro, ''::text))
  WHERE (ativo = true AND cliente_id IS NULL);

-- ── (3): a trava cliente x global ──
CREATE FUNCTION public.guard_plano_cliente_x_global()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_outra public.financeiro_plano_contas;
begin
  -- inativar (e gravar conta inativa) nunca e' barrado
  if new.ativo is not true then
    return new;
  end if;
  -- UPDATE que nao muda nada do que a regra olha: a linha ja' foi julgada quando entrou
  if tg_op = 'UPDATE' and old.ativo is true
     and new.cliente_id is not distinct from old.cliente_id
     and new.tipo_operacao is not distinct from old.tipo_operacao
     and new.macro_custo is not distinct from old.macro_custo
     and coalesce(new.grupo_custo, '') = coalesce(old.grupo_custo, '')
     and new.centro_custo is not distinct from old.centro_custo
     and coalesce(new.subcentro, '') = coalesce(old.subcentro, '') then
    return new;
  end if;
  -- serializa por hierarquia: dois gravadores da mesma classificacao (um de cliente, um global) nao passam um pelo outro
  perform pg_advisory_xact_lock(hashtextextended(
    'plano_hierarquia|' || coalesce(new.tipo_operacao, '') || '|' || coalesce(new.macro_custo, '') || '|' || coalesce(new.grupo_custo, '')
    || '|' || coalesce(new.centro_custo, '') || '|' || coalesce(new.subcentro, ''), 0));
  -- a mesma comparacao do indice: tipo, macro e centro crus; grupo e subcentro com COALESCE ''
  select p.* into v_outra
    from public.financeiro_plano_contas p
   where p.ativo = true and p.id <> new.id
     and (p.cliente_id is null) <> (new.cliente_id is null)
     and p.tipo_operacao = new.tipo_operacao and p.macro_custo = new.macro_custo
     and coalesce(p.grupo_custo, '') = coalesce(new.grupo_custo, '')
     and p.centro_custo = new.centro_custo
     and coalesce(p.subcentro, '') = coalesce(new.subcentro, '')
   order by p.created_at, p.id
   limit 1;
  if found then
    if new.cliente_id is not null then
      raise exception using errcode = '23505',
        message = format('O plano de contas já tem a conta geral «%s» (%s · %s · %s) com esta classificação: uma conta do cliente não pode repetir uma conta geral. Nada foi gravado.',
                         coalesce(v_outra.subcentro, ''), v_outra.tipo_operacao, v_outra.macro_custo, v_outra.centro_custo);
    else
      raise exception using errcode = '23505',
        message = format('Já existe conta de cliente «%s» (%s · %s · %s) com esta classificação (conta %s): uma conta geral não pode repetir uma conta de cliente. Nada foi gravado.',
                         coalesce(v_outra.subcentro, ''), v_outra.tipo_operacao, v_outra.macro_custo, v_outra.centro_custo, v_outra.id);
    end if;
  end if;
  return new;
end
$function$;

CREATE TRIGGER trg_guard_plano_cliente_x_global
  BEFORE INSERT OR UPDATE OF cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, ativo
  ON public.financeiro_plano_contas
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_plano_cliente_x_global();

-- ── guarda de destino: os dois indices como escritos, a trava ligada, a funcao da trava FECHADA ──
DO $d$
BEGIN
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'financeiro_plano_contas'
        AND indexname IN ('uq_plano_contas_cliente', 'uq_plano_contas_global') AND indexdef LIKE 'CREATE UNIQUE INDEX%') <> 2 THEN
    RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 1: os dois indices nao ficaram como esperado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.financeiro_plano_contas'::regclass
                    AND tgname = 'trg_guard_plano_cliente_x_global' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 1: a trava nao esta'' ligada.';
  END IF;
  IF has_function_privilege('authenticated', 'public.guard_plano_cliente_x_global()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.guard_plano_cliente_x_global()', 'EXECUTE') THEN
    RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 1: a funcao da trava ficou aberta.';
  END IF;
END
$d$;
