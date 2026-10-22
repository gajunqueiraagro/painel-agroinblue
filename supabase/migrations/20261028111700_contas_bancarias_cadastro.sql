-- CAD-CONTAS-BANCARIAS-01 — o cadastro da conta bancaria no padrao novo (mock aprovado 20/10 12h53).
-- So' o que nao tinha dono vira coluna. Ja' existiam e sao reaproveitados: nome_conta/nome_exibicao, codigo_conta (gerado pelo
-- trg_auto_codigo_conta), ativa, tipo_conta (cc/inv/cartao; o "Caixa fisico" e' cc com banco 'Dinheiro', o da bancos_referencia),
-- fazenda_id, banco, agencia, numero_conta/conta_digito, mes_inicio + saldo_inicial_oficial (e a linha semente do mes em
-- financeiro_saldos_bancarios_v2), aliases (os nomes de reconhecimento da importacao), consolida_em_conta_id e sem_extrato_bancario
-- (CONC-TRANSF-DUAS-PONTAS-01b). O comprovante do saldo mora em financeiro_saldo_documentos (o mes = mes_inicio).
-- Senha e acesso de internet banking: nenhuma coluna, nunca.
-- RLS: a da tabela (cb_*_tenant) vale para as colunas novas; nada muda nela.

ALTER TABLE public.financeiro_contas_bancarias
  ADD COLUMN IF NOT EXISTS titular_nome text,
  ADD COLUMN IF NOT EXISTS titular_documento text,
  ADD COLUMN IF NOT EXISTS chave_pix text,
  ADD COLUMN IF NOT EXISTS observacao text,
  ADD COLUMN IF NOT EXISTS gerente_nome text,
  ADD COLUMN IF NOT EXISTS gerente_telefone text,
  ADD COLUMN IF NOT EXISTS gerente_celular text,
  ADD COLUMN IF NOT EXISTS gerente_email text,
  ADD COLUMN IF NOT EXISTS gerente_desde date,
  ADD COLUMN IF NOT EXISTS agencia_endereco text,
  ADD COLUMN IF NOT EXISTS agencia_cidade_uf text,
  ADD COLUMN IF NOT EXISTS agencia_telefone text,
  ADD COLUMN IF NOT EXISTS agencia_outro_contato text,
  ADD COLUMN IF NOT EXISTS agencia_observacao text,
  ADD COLUMN IF NOT EXISTS formato_extrato text,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_contas_bancarias_formato_extrato') THEN
    ALTER TABLE public.financeiro_contas_bancarias
      ADD CONSTRAINT ck_contas_bancarias_formato_extrato CHECK (formato_extrato IS NULL OR formato_extrato IN ('ofx', 'planilha', 'pdf'));
  END IF;
END $$;

COMMENT ON COLUMN public.financeiro_contas_bancarias.formato_extrato IS
  'CAD-CONTAS-BANCARIAS-01: como o extrato da conta chega (ofx/planilha/pdf). "Sem extrato" NAO e'' um formato: e'' sem_extrato_bancario.';

-- Quem alterou por ultimo (o rodape do modal: "Ultima alteracao dd/mm/aaaa por Nome").
CREATE OR REPLACE FUNCTION public._fn_conta_bancaria_autor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $function$;

CREATE OR REPLACE TRIGGER trg_conta_bancaria_autor
  BEFORE INSERT OR UPDATE ON public.financeiro_contas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public._fn_conta_bancaria_autor();

-- Auditoria (audit_log, a tela Auditoria): toda criacao e alteracao da conta, com antes -> depois; o resumo diz a mudanca do saldo
-- inicial e da data quando ela acontece. Alteracao sem diferenca (so' updated_at) nao entra.
CREATE OR REPLACE FUNCTION public._fn_conta_bancaria_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text := coalesce(NEW.nome_exibicao, NEW.nome_conta);
  v_partes text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, auth.uid(), 'financeiro', 'criou', 'financeiro_contas_bancarias', NEW.id,
      concat_ws(' | ', 'Conta bancária ' || v_nome,
        'saldo inicial ' || coalesce(NEW.saldo_inicial_oficial::text, 'sem saldo') || ' em ' || coalesce(NEW.mes_inicio, 'sem início')),
      to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - 'updated_at' - 'updated_by') = (to_jsonb(NEW) - 'updated_at' - 'updated_by') THEN
    RETURN NEW;
  END IF;
  IF OLD.saldo_inicial_oficial IS DISTINCT FROM NEW.saldo_inicial_oficial THEN
    v_partes := v_partes || ('saldo inicial ' || coalesce(OLD.saldo_inicial_oficial::text, 'sem saldo') || ' → '
      || coalesce(NEW.saldo_inicial_oficial::text, 'sem saldo'));
  END IF;
  IF OLD.mes_inicio IS DISTINCT FROM NEW.mes_inicio THEN
    v_partes := v_partes || ('início ' || coalesce(OLD.mes_inicio, 'sem início') || ' → ' || coalesce(NEW.mes_inicio, 'sem início'));
  END IF;
  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (NEW.cliente_id, NEW.fazenda_id, auth.uid(), 'financeiro', 'editou', 'financeiro_contas_bancarias', NEW.id,
    concat_ws(' | ', 'Conta bancária ' || v_nome, nullif(array_to_string(v_partes, ' · '), '')),
    to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public._fn_conta_bancaria_auditoria() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conta_bancaria_autor() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_conta_bancaria_auditoria
  AFTER INSERT OR UPDATE ON public.financeiro_contas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public._fn_conta_bancaria_auditoria();
