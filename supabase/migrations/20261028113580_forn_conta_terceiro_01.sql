-- FORN-CONTA-TERCEIRO-01 · lote 1 (Code 1, 26/11) — as contas para pagamento do fornecedor, inclusive de TERCEIRO autorizado, e o
-- "Pagar em" do lançamento. Mock aprovado (md5 765b3bf6cd6262f1d47c67c057c76cf6).
-- REGRA: o favorecido NUNCA muda. Livro/LCDPR/DRE/conta corrente do parceiro leem `favorecido_id` e nada aqui o toca. O lote só registra
-- QUEM RECEBEU e se a conta está autorizada no cadastro.
-- · A conta PADRÃO continua sendo o bloco de pagamento do próprio cadastro (`financeiro_fornecedores`: pix/banco + nome_favorecido +
--   cpf_cnpj_pagamento). A tabela nova guarda as OUTRAS: mais contas do favorecido e as de terceiro autorizado (vínculo + autorização).
-- · O lançamento escolhe em `dados_pagamento` (jsonb, o campo da exceção, que já existe):
--     null                                   = a padrão do cadastro (como hoje);
--     texto (string)                         = a exceção antiga, texto livre (351 linhas hoje: continuam valendo);
--     {"pagar_em":"conta","conta_id":…}      = uma conta da tabela nova, DO MESMO favorecido;
--     {"pagar_em":"outra","titular":…,"documento":…,"motivo":…,"dados":…} = "outra só desta vez".
--   Um gatilho recusa objeto fora desse formato e conta de outro favorecido/cliente.
-- · A aprovação (BPO) vê a conta escolhida: `_fn_aprovacao_destino` passa a incluir os dados dela SÓ quando há conta escolhida; para
--   todo o resto a foto sai byte a byte igual (o ensaio confere em todos os lançamentos). Mudar a chave/conta de uma conta escolhida
--   pede nova aprovação, como mudar o Pix do cadastro já pede.
-- · O arquivo da autorização vai no MESMO bucket dos documentos (`fin-documentos`, pasta `<cliente>/fornecedores/<fornecedor>/…`): as
--   políticas do bucket já valem por cliente; nada muda nelas.
-- · Nenhum dado de cliente é gravado aqui (a conta da Silvana, caso de prova, só com OK do Gabriel, pela tela).
-- DESFAZER: DROP TRIGGER trg_lancamento_pagar_em ON financeiro_lancamentos_v2; DROP FUNCTION _fn_trg_lancamento_pagar_em();
--   voltar `_fn_aprovacao_destino` ao texto anterior (sem o `|| … 'pagar_em_conta' …`); DROP TABLE financeiro_fornecedor_contas (e suas funções).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1) A tabela das contas
CREATE TABLE public.financeiro_fornecedor_contas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid NOT NULL REFERENCES public.clientes(id),
  fornecedor_id      uuid NOT NULL REFERENCES public.financeiro_fornecedores(id),
  uso                text NOT NULL CHECK (uso IN ('favorecido', 'terceiro')),
  titular_nome       text NOT NULL CHECK (length(btrim(titular_nome)) BETWEEN 3 AND 160),
  titular_documento  text CHECK (titular_documento ~ '^(\d{11}|\d{14})$'),
  forma              text NOT NULL CHECK (forma IN ('PIX', 'Transferência Bancária')),
  pix_tipo_chave     text CHECK (pix_tipo_chave IN ('CPF', 'CNPJ', 'Telefone', 'E-mail', 'Aleatória')),
  pix_chave          text CHECK (length(pix_chave) <= 140),
  banco              text CHECK (length(banco) <= 80),
  agencia            text CHECK (length(agencia) <= 20),
  conta              text CHECK (length(conta) <= 30),
  tipo_conta         text CHECK (length(tipo_conta) <= 30),
  vinculo            text NOT NULL CHECK (vinculo IN ('proprio', 'conjuge', 'filho', 'pai_mae', 'procurador',
                                                     'empresa_do_favorecido', 'funcionario_do_favorecido', 'outro')),
  autorizacao_path   text CHECK (autorizacao_path IS NULL OR split_part(autorizacao_path, '/', 1) = cliente_id::text),
  autorizacao_nome   text CHECK (length(autorizacao_nome) <= 200),
  vale_desde         date,
  situacao           text NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa', 'inativa')),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  criado_por         uuid DEFAULT auth.uid(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por     uuid DEFAULT auth.uid(),
  CONSTRAINT forn_conta_vinculo_do_uso CHECK ((uso = 'favorecido') = (vinculo = 'proprio')),
  CONSTRAINT forn_conta_dados_da_forma CHECK (
    (forma = 'PIX' AND nullif(btrim(pix_chave), '') IS NOT NULL)
    OR (forma = 'Transferência Bancária' AND nullif(btrim(banco), '') IS NOT NULL AND nullif(btrim(agencia), '') IS NOT NULL
        AND nullif(btrim(conta), '') IS NOT NULL))
);
COMMENT ON TABLE public.financeiro_fornecedor_contas IS
  'FORN-CONTA-TERCEIRO-01: contas para pagamento além da padrão do cadastro (mais contas do favorecido e de terceiro autorizado). O favorecido do lançamento nunca muda.';

CREATE INDEX financeiro_fornecedor_contas_forn_idx ON public.financeiro_fornecedor_contas (cliente_id, fornecedor_id);
-- a mesma conta ativa duas vezes no mesmo favorecido (o "Autorizar esta conta" clicado duas vezes) não entra
CREATE UNIQUE INDEX financeiro_fornecedor_contas_unica_ativa ON public.financeiro_fornecedor_contas
  (fornecedor_id, coalesce(titular_documento, ''), lower(coalesce(pix_chave, '')), coalesce(banco, ''), coalesce(agencia, ''), coalesce(conta, ''))
  WHERE situacao = 'ativa';

-- 2) Coerência: o cliente é o do favorecido; documento só dígitos; quem mudou e quando
CREATE FUNCTION public._fn_trg_fornecedor_conta_coerente()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_cli uuid;
BEGIN
  SELECT f.cliente_id INTO v_cli FROM public.financeiro_fornecedores f WHERE f.id = NEW.fornecedor_id;
  IF v_cli IS DISTINCT FROM NEW.cliente_id THEN
    RAISE EXCEPTION 'A conta é de um favorecido de outro cliente. Nada foi gravado.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.fornecedor_id IS DISTINCT FROM OLD.fornecedor_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id) THEN
    RAISE EXCEPTION 'A conta não muda de favorecido: inative esta e cadastre no outro. Nada foi gravado.' USING ERRCODE = '22023';
  END IF;
  NEW.titular_nome := btrim(regexp_replace(NEW.titular_nome, '\s+', ' ', 'g'));
  NEW.titular_documento := nullif(regexp_replace(coalesce(NEW.titular_documento, ''), '\D', '', 'g'), '');
  IF TG_OP = 'UPDATE' THEN
    NEW.criado_em := OLD.criado_em; NEW.criado_por := OLD.criado_por;
    NEW.atualizado_em := now(); NEW.atualizado_por := auth.uid();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._fn_trg_fornecedor_conta_coerente() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_fornecedor_conta_coerente BEFORE INSERT OR UPDATE ON public.financeiro_fornecedor_contas
  FOR EACH ROW EXECUTE FUNCTION public._fn_trg_fornecedor_conta_coerente();
CREATE TRIGGER trg_leitura_nao_grava BEFORE INSERT OR DELETE OR UPDATE ON public.financeiro_fornecedor_contas
  FOR EACH STATEMENT EXECUTE FUNCTION public._fn_leitura_nao_grava();
CREATE TRIGGER trg_sem_delete_direto BEFORE DELETE ON public.financeiro_fornecedor_contas
  FOR EACH ROW EXECUTE FUNCTION public._fn_sem_delete_direto();
CREATE TRIGGER trg_trilha_registro AFTER INSERT OR DELETE OR UPDATE ON public.financeiro_fornecedor_contas
  FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_registro();

-- 3) RLS: o molde do cadastro do fornecedor (lê quem é do cliente; grava com tenant_ok; não apaga: inativa)
ALTER TABLE public.financeiro_fornecedor_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY financeiro_fornecedor_contas_select_tenant ON public.financeiro_fornecedor_contas FOR SELECT
  USING ((SELECT public.is_admin_agroinblue((SELECT auth.uid()))) OR cliente_id IN (SELECT public.get_user_cliente_ids((SELECT auth.uid()))));
CREATE POLICY financeiro_fornecedor_contas_insert_tenant ON public.financeiro_fornecedor_contas FOR INSERT
  WITH CHECK (public.tenant_ok(cliente_id));
CREATE POLICY financeiro_fornecedor_contas_update_tenant ON public.financeiro_fornecedor_contas FOR UPDATE
  USING (public.tenant_ok(cliente_id)) WITH CHECK (public.tenant_ok(cliente_id));
REVOKE ALL ON public.financeiro_fornecedor_contas FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.financeiro_fornecedor_contas TO authenticated;

-- 4) O "Pagar em" do lançamento: objeto só no formato combinado; a conta é do MESMO favorecido e do mesmo cliente
CREATE FUNCTION public._fn_trg_lancamento_pagar_em()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d jsonb := NEW.dados_pagamento; v_conta record; v_id uuid;
BEGIN
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN RETURN NEW; END IF;
  -- só confere quando o "Pagar em" ou o favorecido mudam: inativar a conta depois não trava o lançamento antigo
  IF TG_OP = 'UPDATE' AND NEW.dados_pagamento IS NOT DISTINCT FROM OLD.dados_pagamento
     AND NEW.favorecido_id IS NOT DISTINCT FROM OLD.favorecido_id THEN
    RETURN NEW;
  END IF;
  IF d->>'pagar_em' = 'conta' THEN
    IF (d - 'pagar_em' - 'conta_id') <> '{}'::jsonb OR coalesce(d->>'conta_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Pagar em: a conta escolhida veio sem identificação. Nada foi gravado.' USING ERRCODE = '22023';
    END IF;
    v_id := (d->>'conta_id')::uuid;
    SELECT c.cliente_id, c.fornecedor_id, c.situacao INTO v_conta FROM public.financeiro_fornecedor_contas c WHERE c.id = v_id;
    IF v_conta.cliente_id IS NULL OR v_conta.cliente_id <> NEW.cliente_id THEN
      RAISE EXCEPTION 'Pagar em: a conta escolhida não é deste cliente. Nada foi gravado.' USING ERRCODE = '42501';
    END IF;
    IF v_conta.fornecedor_id IS DISTINCT FROM NEW.favorecido_id THEN
      RAISE EXCEPTION 'Pagar em: a conta escolhida é de outro favorecido. Escolha de novo em "Pagar em". Nada foi gravado.' USING ERRCODE = '22023';
    END IF;
    IF v_conta.situacao <> 'ativa' THEN
      RAISE EXCEPTION 'Pagar em: a conta escolhida está inativa no cadastro. Nada foi gravado.' USING ERRCODE = '22023';
    END IF;
  ELSIF d->>'pagar_em' = 'outra' THEN
    IF (d - 'pagar_em' - 'titular' - 'documento' - 'motivo' - 'dados') <> '{}'::jsonb
       OR length(btrim(coalesce(d->>'titular', ''))) < 3 OR length(btrim(coalesce(d->>'motivo', ''))) < 3
       OR length(coalesce(d->>'titular', '')) > 160 OR length(coalesce(d->>'motivo', '')) > 300 OR length(coalesce(d->>'dados', '')) > 500
       OR (d ? 'documento' AND jsonb_typeof(d->'documento') <> 'null' AND coalesce(d->>'documento', '') !~ '^(\d{11}|\d{14})$') THEN
      RAISE EXCEPTION 'Pagar em "outra só desta vez": informe o titular e o motivo (documento só com os dígitos). Nada foi gravado.' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Dados para pagamento num formato que o sistema não conhece. Nada foi gravado.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._fn_trg_lancamento_pagar_em() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_lancamento_pagar_em BEFORE INSERT OR UPDATE OF dados_pagamento, favorecido_id ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public._fn_trg_lancamento_pagar_em();

-- 5) A aprovação vê a conta escolhida. ⚠ Só ACRESCENTA a chave 'pagar_em_conta' (nome novo: 'conta' já é a do cadastro) quando há conta
--    escolhida: sem ela, o jsonb (e o md5) é o de antes.
CREATE OR REPLACE FUNCTION public._fn_aprovacao_destino(p_forma text, p_dados jsonb, p_fav uuid, p_lancamento uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select md5((jsonb_build_object(
    'forma', public._fn_forma_efetiva_pagamento(p_forma, f.tipo_recebimento),
    'dados', case when p_dados is null or jsonb_typeof(p_dados) = 'null' or p_dados in ('{}'::jsonb, '[]'::jsonb) then null else p_dados end,
    'pix', nullif(btrim(f.pix_chave), ''),
    'banco', nullif(btrim(f.banco), ''),
    'agencia', nullif(btrim(f.agencia), ''),
    'conta', nullif(btrim(f.conta), ''),
    'tipo_conta', nullif(btrim(f.tipo_conta), ''),
    'doc', nullif(regexp_replace(coalesce(nullif(btrim(f.cpf_cnpj_pagamento), ''), f.cpf_cnpj, ''), '\D', '', 'g'), ''),
    'boletos', (select jsonb_agg(bl.boleto_id order by bl.boleto_id) from public.boleto_lancamentos bl where bl.lancamento_id = p_lancamento and bl.desligado_em is null))
  || coalesce((select jsonb_build_object('pagar_em_conta', jsonb_build_object(
        'titular', c.titular_nome, 'doc', c.titular_documento, 'forma', c.forma, 'pix', nullif(btrim(c.pix_chave), ''),
        'banco', nullif(btrim(c.banco), ''), 'agencia', nullif(btrim(c.agencia), ''), 'conta', nullif(btrim(c.conta), ''),
        'tipo_conta', nullif(btrim(c.tipo_conta), ''), 'situacao', c.situacao))
      from public.financeiro_fornecedor_contas c
     where jsonb_typeof(p_dados) = 'object' and p_dados->>'pagar_em' = 'conta'
       and c.id::text = p_dados->>'conta_id'), '{}'::jsonb))::text)
  from (select 1) um left join public.financeiro_fornecedores f on f.id = p_fav
$function$;

-- 6) Mudou a chave/conta/situação de uma conta escolhida em lançamento com aprovação viva: reconfere (o molde do cadastro do fornecedor)
CREATE FUNCTION public._fn_trg_aprovacao_destino_conta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.lancamento_id FROM public.financeiro_aprovacoes a JOIN public.financeiro_lancamentos_v2 l ON l.id = a.lancamento_id
     WHERE l.cliente_id = NEW.cliente_id AND jsonb_typeof(l.dados_pagamento) = 'object'
       AND l.dados_pagamento->>'pagar_em' = 'conta' AND l.dados_pagamento->>'conta_id' = NEW.id::text
       AND a.situacao IN ('aguardando', 'aprovado')
     ORDER BY a.lancamento_id
  LOOP
    PERFORM public._fn_aprovacao_conferir_foto(r.lancamento_id);
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._fn_trg_aprovacao_destino_conta() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_zz_aprovacao_destino_conta AFTER UPDATE OF titular_nome, titular_documento, forma, pix_chave, banco, agencia, conta, tipo_conta, situacao
  ON public.financeiro_fornecedor_contas FOR EACH ROW
  WHEN (OLD.titular_nome IS DISTINCT FROM NEW.titular_nome OR OLD.titular_documento IS DISTINCT FROM NEW.titular_documento
     OR OLD.forma IS DISTINCT FROM NEW.forma OR OLD.pix_chave IS DISTINCT FROM NEW.pix_chave OR OLD.banco IS DISTINCT FROM NEW.banco
     OR OLD.agencia IS DISTINCT FROM NEW.agencia OR OLD.conta IS DISTINCT FROM NEW.conta OR OLD.tipo_conta IS DISTINCT FROM NEW.tipo_conta
     OR OLD.situacao IS DISTINCT FROM NEW.situacao)
  EXECUTE FUNCTION public._fn_trg_aprovacao_destino_conta();
