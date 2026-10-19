-- FORN-INATIVAR-TRAVA-01 (Gabriel 19/10/2026) — fornecedor com LANCAMENTO VIVO ou RECORRENCIA ATIVA nao se inativa: o caminho e'
-- mesclar no cadastro certo (Cadastros › Fornecedores › Mesclar fornecedores). Nasce dos 38 inativos nao mesclados com lancamento vivo
-- (19/10): somem de Cadastros e seguem no filtro e na grade de Lancamentos. OC e financiamento ficam de fora (decisao do Gabriel).
--
-- A TRAVA so' age na TROCA ativo -> inativo, e so' FORA da mesclagem: `_fn_fornecedor_mesclar_exec` grava `ativo = false` e
-- `fundido_em_id` no MESMO UPDATE, e o desfazer da mesclagem reativa (inativo -> ativo nao e' julgado). Os inativos que ja' existem
-- ficam como estao (a trava nao olha linha que nao muda).
--   lancamento vivo = `financeiro_lancamentos_v2.favorecido_id` com `cancelado IS NOT TRUE` (indice idx_flv2_favorecido_cliente);
--   recorrencia ativa = `financeiro_recorrencias.favorecido_id` com `ativo = true` (pausada e' `ativo = false`: nao segura).
-- A FRASE tem um dono (`_fn_fornecedor_frase_inativar`), lido pela trava e pela leitura da tela (`fn_fornecedor_pode_inativar`): a
-- tela pergunta ANTES de gravar e escreve a frase ao lado do botao.
--
-- Objetos NOVOS: a guarda de origem exige que nao existam; depois de criar, o md5 de cada corpo e a ACL sao conferidos.
-- Gesto contrario: DROP TRIGGER trg_guard_fornecedor_inativar ON public.financeiro_fornecedores; e os quatro DROP FUNCTION.
set local lock_timeout = '2s';

DO $origem$
BEGIN
  IF to_regprocedure('public._fn_fornecedor_frase_inativar(integer, integer)') IS NOT NULL
     OR to_regprocedure('public._fn_fornecedor_prende_ativo(uuid)') IS NOT NULL
     OR to_regprocedure('public.guard_fornecedor_inativar()') IS NOT NULL
     OR to_regprocedure('public.fn_fornecedor_pode_inativar(uuid)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_fornecedor_inativar') THEN
    RAISE EXCEPTION 'FORN-INATIVAR-TRAVA-01: objetos ja existem (origem inesperada)';
  END IF;
END
$origem$;

CREATE FUNCTION public._fn_fornecedor_frase_inativar(p_lancamentos integer, p_recorrencias integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $f$
DECLARE
  v_partes text[] := '{}';
BEGIN
  IF coalesce(p_lancamentos, 0) > 0 THEN
    v_partes := v_partes || format('%s %s', p_lancamentos, CASE WHEN p_lancamentos = 1 THEN 'lançamento' ELSE 'lançamentos' END);
  END IF;
  IF coalesce(p_recorrencias, 0) > 0 THEN
    v_partes := v_partes || format('%s %s', p_recorrencias, CASE WHEN p_recorrencias = 1 THEN 'recorrência ativa' ELSE 'recorrências ativas' END);
  END IF;
  IF cardinality(v_partes) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN format('Este fornecedor tem %s. Para tirá-lo de uso, mescle no cadastro certo (Cadastros › Fornecedores › Mesclar fornecedores).',
                array_to_string(v_partes, ' e '));
END
$f$;

CREATE FUNCTION public._fn_fornecedor_prende_ativo(p_fornecedor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  v_cli uuid;
  v_l int;
  v_r int;
BEGIN
  SELECT f.cliente_id INTO v_cli FROM public.financeiro_fornecedores f WHERE f.id = p_fornecedor;
  SELECT count(*) INTO v_l FROM public.financeiro_lancamentos_v2 l
   WHERE l.favorecido_id = p_fornecedor AND l.cliente_id = v_cli AND l.cancelado IS NOT TRUE;
  SELECT count(*) INTO v_r FROM public.financeiro_recorrencias r
   WHERE r.favorecido_id = p_fornecedor AND r.ativo IS TRUE;
  RETURN jsonb_build_object('lancamentos', v_l, 'recorrencias', v_r,
                            'frase', public._fn_fornecedor_frase_inativar(v_l, v_r));
END
$f$;

CREATE FUNCTION public.guard_fornecedor_inativar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  v_uso jsonb;
BEGIN
  -- FORN-INATIVAR-TRAVA-01: so' a troca para inativo FORA da mesclagem (a mesclagem grava fundido_em_id no mesmo UPDATE).
  IF NEW.ativo IS FALSE AND OLD.ativo IS DISTINCT FROM FALSE AND NEW.fundido_em_id IS NULL THEN
    v_uso := public._fn_fornecedor_prende_ativo(NEW.id);
    IF v_uso->>'frase' IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = (v_uso->>'frase') || ' Nada foi gravado.';
    END IF;
  END IF;
  RETURN NEW;
END
$f$;

CREATE FUNCTION public.fn_fornecedor_pode_inativar(p_fornecedor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  v_cli uuid;
  v_uso jsonb;
BEGIN
  SELECT f.cliente_id INTO v_cli FROM public.financeiro_fornecedores f WHERE f.id = p_fornecedor;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_cli]);
  v_uso := public._fn_fornecedor_prende_ativo(p_fornecedor);
  RETURN v_uso || jsonb_build_object('pode', v_uso->>'frase' IS NULL);
END
$f$;

CREATE TRIGGER trg_guard_fornecedor_inativar
  BEFORE UPDATE OF ativo ON public.financeiro_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.guard_fornecedor_inativar();

REVOKE ALL ON FUNCTION public._fn_fornecedor_frase_inativar(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fornecedor_prende_ativo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_fornecedor_inativar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fornecedor_pode_inativar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_frase_inativar(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_prende_ativo(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_pode_inativar(uuid) TO authenticated, service_role;

DO $destino$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public._fn_fornecedor_frase_inativar(integer, integer)', '9d339e6907fa8c963686ba79d620b60c'),
    ('public._fn_fornecedor_prende_ativo(uuid)', 'fe0e0540b2df6fee521c0d7507800036'),
    ('public.guard_fornecedor_inativar()', '9a79ea6ce6170584ba1cf53a19f9c8f0'),
    ('public.fn_fornecedor_pode_inativar(uuid)', '0dde7a5dda4e7d2bde1b3d1d871e3a76')) v(sig, esperado)
  LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = r.sig::regprocedure) IS DISTINCT FROM r.esperado THEN
      RAISE EXCEPTION 'FORN-INATIVAR-TRAVA-01: corpo de % diferente do destino', r.sig;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.fn_fornecedor_pode_inativar(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_fornecedor_prende_ativo(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_fornecedor_pode_inativar(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FORN-INATIVAR-TRAVA-01: ACL inesperada';
  END IF;
END
$destino$;
