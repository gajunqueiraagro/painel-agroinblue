-- DIVIDENDO-ESCRITOR-UNICO-01 (passo 2, parte B) — O ESCRITOR UNICO DO CADASTRO DE DIVIDENDOS: PUBLICAS, UNICIDADE, TRAVA E BACKFILL (Gabriel, 09/10/2026).
-- Cadastro (`financeiro_dividendos`) e conta do plano mudam JUNTOS, numa transacao, por cinco funcoes publicas (as internas estao
-- na parte A, 20261027195300).
--   D1 nome igual ao de uma conta GERAL ativa de macro Dividendos: o dividendo USA a geral; nao nasce conta do cliente.
--   D2 nome igual ao de conta ativa FORA do macro Dividendos (geral ou do cliente): recusa.
--   D3 nome unico por cliente ENTRE OS ATIVOS (sem caixa, sem espaco nas pontas); reativar com ativo igual: recusa.
--   D4 reordenar escreve so' a ordem do cadastro.          D5 renomear dividendo que usa conta geral: recusa.
-- SIMULACAO = GRAVACAO: `p_simular` executa o MESMO caminho e desfaz (SQLSTATE 'DVSIM'). Recusa = SQLSTATE 'DVREC' no corpo; na
-- simulacao volta em `recusa {motivo, frase}`, na gravacao vira P0001 com a frase + "Nada foi gravado.".
-- Retorno: {antes, depois, recusa} (+ `lancamentos_tocados` no renomear; `conta_acao` e `lancamentos_que_seguram` no inativar).
-- A escrita no cadastro liga a chave `app.dividendo_escritor` so' em volta de cada comando (a trava, abaixo, a le^).
-- RENOMEAR: o UPDATE do subcentro da conta dispara `trg_propagar_plano_para_lancamentos`, que leva o nome aos lancamentos da
--   conta sob `app.propagando_plano` (nao marca editado manual); `lancamentos_tocados` e' a contagem desse UPDATE.
-- D3 NO BANCO: indice unico parcial `uq_fin_dividendos_cliente_nome_ativo` (cliente, lower(btrim(nome))) entre os ativos.
-- TRAVA NO DONO (`trg_guard_dividendo_escritor`): INSERT / UPDATE / DELETE direto em `financeiro_dividendos`, fora das cinco
--   funcoes, e' recusado com frase (a chave de escritor por transacao do PARC-CADEIA-01). A tela nao oferece excluir: nao ha' funcao
--   de DELETE, e o DELETE direto e' sempre recusado.
-- BACKFILL: os 4 dividendos ATIVOS sem conta (2 no Teste, 2 no RRCC; lista por ID DO CADASTRO, nenhum nome no repositorio) ganham
--   conta do cliente no molde. ESTADO ANTERIOR DECLARADO: A CONTA NAO EXISTE (a migration aborta se existir, ou se nao forem 4).
-- GESTO CONTRARIO:
--   DROP TRIGGER trg_guard_dividendo_escritor ON public.financeiro_dividendos;  DROP FUNCTION public.guard_dividendo_escritor();
--   DROP INDEX public.uq_fin_dividendos_cliente_nome_ativo;
--   DROP das cinco `fn_dividendo_*` e de `_fn_dividendo_rodar`;
--   backfill: DELETE FROM public.financeiro_plano_contas p USING public.financeiro_dividendos d
--     WHERE d.id IN (<os quatro ids abaixo>) AND p.cliente_id = d.cliente_id AND p.macro_custo = 'Dividendos'
--       AND p.subcentro = 'Dividendos ' || btrim(d.nome)
--       AND NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l WHERE l.plano_conta_id = p.id);

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- a casca: guarda de tenant, simulacao que desfaz, recusa em frase
CREATE FUNCTION public._fn_dividendo_rodar(p_op text, p_a jsonb, p_cliente uuid, p_simular boolean) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare v jsonb; v_frase text; v_motivo text; v_hint text;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  begin
    v := public._fn_dividendo_executar(p_op, p_a);
    if coalesce(p_simular, false) then raise exception using errcode = 'DVSIM', message = v::text; end if;
    return v;
  exception
    when sqlstate 'DVSIM' then
      return sqlerrm::jsonb;
    when sqlstate 'DVREC' then
      get stacked diagnostics v_frase = message_text, v_motivo = pg_exception_detail, v_hint = pg_exception_hint;
    when unique_violation then
      v_frase := 'Já existe um dividendo ou uma conta do plano com este nome.'; v_motivo := 'banco'; v_hint := 'null';
  end;
  if coalesce(p_simular, false) then
    return jsonb_build_object('antes', v_hint::jsonb, 'depois', null, 'recusa', jsonb_build_object('motivo', v_motivo, 'frase', v_frase));
  end if;
  raise exception using errcode = 'P0001', message = v_frase || ' Nada foi gravado.';
end $f$;

CREATE FUNCTION public.fn_dividendo_criar(p_cliente_id uuid, p_nome text, p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_dividendo_rodar('criar', jsonb_build_object('cliente_id', p_cliente_id, 'nome', p_nome), p_cliente_id, p_simular) $f$;
CREATE FUNCTION public.fn_dividendo_renomear(p_id uuid, p_nome text, p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_dividendo_rodar('renomear', jsonb_build_object('id', p_id, 'nome', p_nome),
           (select d.cliente_id from public.financeiro_dividendos d where d.id = p_id), p_simular) $f$;
CREATE FUNCTION public.fn_dividendo_inativar(p_id uuid, p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_dividendo_rodar('inativar', jsonb_build_object('id', p_id),
           (select d.cliente_id from public.financeiro_dividendos d where d.id = p_id), p_simular) $f$;
CREATE FUNCTION public.fn_dividendo_reativar(p_id uuid, p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_dividendo_rodar('reativar', jsonb_build_object('id', p_id),
           (select d.cliente_id from public.financeiro_dividendos d where d.id = p_id), p_simular) $f$;
CREATE FUNCTION public.fn_dividendo_reordenar(p_cliente_id uuid, p_ids uuid[], p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_dividendo_rodar('reordenar', jsonb_build_object('cliente_id', p_cliente_id, 'ids', to_jsonb(p_ids)), p_cliente_id, p_simular) $f$;

REVOKE ALL ON FUNCTION public.fn_dividendo_criar(uuid, text, boolean), public.fn_dividendo_renomear(uuid, text, boolean),
  public.fn_dividendo_inativar(uuid, boolean), public.fn_dividendo_reativar(uuid, boolean), public.fn_dividendo_reordenar(uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dividendo_criar(uuid, text, boolean), public.fn_dividendo_renomear(uuid, text, boolean),
  public.fn_dividendo_inativar(uuid, boolean), public.fn_dividendo_reativar(uuid, boolean), public.fn_dividendo_reordenar(uuid, uuid[], boolean)
  TO authenticated, service_role;

DO $acl$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f, p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname ~ '^_?fn_dividendo_' LOOP
    IF has_function_privilege('anon', r.f, 'EXECUTE')
       OR (r.proname LIKE '\_%') = has_function_privilege('authenticated', r.f, 'EXECUTE') THEN
      RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 2: ACL inesperada em %', r.f;
    END IF;
  END LOOP;
END
$acl$;

-- ── D3 no banco ──
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM public.financeiro_dividendos WHERE ativo GROUP BY cliente_id, lower(btrim(nome)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 2: ha'' nome repetido entre os ativos de um cliente.';
  END IF;
END
$g$;
CREATE UNIQUE INDEX uq_fin_dividendos_cliente_nome_ativo ON public.financeiro_dividendos
  USING btree (cliente_id, lower(btrim(nome))) WHERE (ativo = true);

-- ── a trava no dono ──
CREATE FUNCTION public.guard_dividendo_escritor() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public' AS $f$
begin
  if coalesce(current_setting('app.dividendo_escritor', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception using errcode = 'P0001',
    message = 'O cadastro de dividendos só é gravado pela tela de Dividendos, que ajusta o plano de contas junto. Nada foi gravado.';
end $f$;
CREATE TRIGGER trg_guard_dividendo_escritor
  BEFORE INSERT OR UPDATE OR DELETE ON public.financeiro_dividendos
  FOR EACH ROW EXECUTE FUNCTION public.guard_dividendo_escritor();

-- ── backfill: os quatro ativos sem conta ──
DO $b$
DECLARE
  c_ids constant uuid[] := ARRAY['8b9d8683-8f6f-4db6-b587-6545e51eca98', 'e2da331b-4708-4079-b203-fc8c2fd3027b',
                                 '1ab05544-1eed-4534-9c81-725f4b347daf', 'fbcb9e30-e4aa-4d5d-966e-7468ed8d7888']::uuid[];
  r record; v_antes int; v_n int := 0;
BEGIN
  SELECT count(*) INTO v_antes FROM public.financeiro_plano_contas;
  FOR r IN SELECT d.id, d.cliente_id, public._fn_dividendo_subcentro(d.nome) AS sub
             FROM public.financeiro_dividendos d WHERE d.id = ANY (c_ids) AND d.ativo ORDER BY d.id LOOP
    IF EXISTS (SELECT 1 FROM public.financeiro_plano_contas p
                WHERE p.macro_custo = 'Dividendos' AND p.subcentro = r.sub AND (p.cliente_id = r.cliente_id OR p.cliente_id IS NULL)) THEN
      RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 2: o dividendo % ja'' tem conta (estado anterior declarado: a conta NAO EXISTE).', r.id;
    END IF;
    PERFORM public._fn_dividendo_garantir_conta(r.cliente_id, r.sub);
    v_n := v_n + 1;
  END LOOP;
  IF v_n <> 4 OR (SELECT count(*) FROM public.financeiro_plano_contas) <> v_antes + 4 THEN
    RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 2: backfill esperava 4 contas novas, fez % (plano % -> %).',
      v_n, v_antes, (SELECT count(*) FROM public.financeiro_plano_contas);
  END IF;
  SELECT count(*) INTO v_n FROM public.financeiro_dividendos d
   WHERE d.ativo AND NOT EXISTS (SELECT 1 FROM public.financeiro_plano_contas p
                                  WHERE p.id = public._fn_dividendo_conta_atual(d.cliente_id, public._fn_dividendo_subcentro(d.nome)) AND p.ativo);
  IF v_n <> 0 THEN RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 2: sobraram % dividendos ativos sem conta ativa.', v_n; END IF;
END
$b$;

-- ── guarda de destino ──
DO $d$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.financeiro_dividendos'::regclass AND tgname = 'trg_guard_dividendo_escritor' AND tgenabled = 'O')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_fin_dividendos_cliente_nome_ativo')
     OR has_function_privilege('authenticated', 'public.guard_dividendo_escritor()', 'EXECUTE') THEN
    RAISE EXCEPTION 'DIVIDENDO-ESCRITOR-UNICO-01 passo 2: trava, indice ou ACL fora do esperado.';
  END IF;
END
$d$;
