-- CONC-SUGESTOES-V2 · lote C (Gabriel 25/11 D-5a): VENCIMENTO DECLARADO × ESTIMADO, derivado — nunca uma 2ª fonte.
-- DECLARADO = um documento diz a data: boleto ligado (vivo) · duplicata da NF ligada (<dup> no XML) · CARTÃO (a conta é de cartão: o
--   vencimento é o da fatura — Gabriel 26/11, D-C1) · parcela de CONTRATO cadastrado (financiamento ou consórcio em `financiamentos`;
--   contrato em `financeiro_contratos`, arrendamento/parceria).
-- ESTIMADO = o resto (digitado, recorrente sem contrato, NF sem duplicata, parcelamento digitado sem boleto/duplicata — D-C1).
-- A AUTORIDADE é a função `_fn_vencimento_declarado` (lê o que existe hoje); a coluna `vencimento_origem` é só o registro da CRIAÇÃO:
--   o gatilho novo grava 'cartao' no lançamento de cartão, 'contrato' na parcela de contrato e 'sugerido' no resto (assim o gatilho do boleto, que só troca 'sugerido'/'boleto',
--   passa a valer para o lançamento novo; o digitado depois vira 'manual' pelo gatilho que já existe).
-- NADA DE BACKFILL: as 74.899 linhas de hoje ficam com a coluna nula — a função deriva para elas também.
-- A tela lê pela `fn_vencimentos_declarados(cliente, ids)` (só leitura, RLS do chamador).

SET LOCAL lock_timeout = '2s';

-- a coluna aceita 'contrato' e 'cartao'
ALTER TABLE public.financeiro_lancamentos_v2 DROP CONSTRAINT fin_lanc_v2_vencimento_origem_chk;
ALTER TABLE public.financeiro_lancamentos_v2 ADD CONSTRAINT fin_lanc_v2_vencimento_origem_chk
  CHECK (vencimento_origem IS NULL OR vencimento_origem = ANY (ARRAY['nota'::text, 'boleto'::text, 'manual'::text, 'sugerido'::text, 'contrato'::text, 'cartao'::text])) NOT VALID;
ALTER TABLE public.financeiro_lancamentos_v2 VALIDATE CONSTRAINT fin_lanc_v2_vencimento_origem_chk;

-- ── a regra: o que DECLARA o vencimento deste lançamento (NULL = estimado) ──
CREATE OR REPLACE FUNCTION public._fn_vencimento_declarado(p_lancamento_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  select case
    when exists (select 1 from public.boleto_lancamentos bl
                  where bl.lancamento_id = l.id and bl.cliente_id = l.cliente_id and bl.vivo) then 'boleto'
    when exists (select 1 from public.financeiro_lancamento_documentos d
                   join public.nota_fiscal n on n.chave_acesso = d.chave_acesso and n.cliente_id = l.cliente_id
                  where d.lancamento_id = l.id and d.cancelado is not true and d.chave_acesso is not null
                    and position('<dup>' in coalesce(n.xml_original, '')) > 0) then 'nota'
    when exists (select 1 from public.financeiro_contas_bancarias cb
                  where cb.id = l.conta_efetiva_id and cb.cliente_id = l.cliente_id and cb.tipo_conta = 'cartao') then 'cartao'
    when exists (select 1 from public.financiamentos f
                  where f.id = l.financiamento_id and f.natureza in ('financiamento', 'consorcio'))
      or exists (select 1 from public.financeiro_contratos c where c.id = l.contrato_id and c.cliente_id = l.cliente_id) then 'contrato'
  end
  from public.financeiro_lancamentos_v2 l
  where l.id = p_lancamento_id;
$function$;

COMMENT ON FUNCTION public._fn_vencimento_declarado(uuid) IS
  'CONC-SUGESTOES-V2 D-5a/D-C1: boleto | nota (duplicata) | cartao (fatura) | contrato (financiamento, consórcio, financeiro_contratos) | NULL = estimado. A autoridade; a coluna vencimento_origem é só o registro da criação.';

-- ── a leitura da tela: os ids que ela mostra ──
CREATE OR REPLACE FUNCTION public.fn_vencimentos_declarados(p_cliente uuid, p_ids uuid[])
RETURNS TABLE(lancamento_id uuid, declarado text)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  select l.id, public._fn_vencimento_declarado(l.id)
    from public.financeiro_lancamentos_v2 l
   where l.cliente_id = p_cliente and l.id = any (coalesce(p_ids, '{}'::uuid[]))
   limit 500;
$function$;

-- ── na criação: a origem do vencimento ──
CREATE OR REPLACE FUNCTION public._fn_trg_vencimento_origem_na_criacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.vencimento_origem IS NOT NULL OR NEW.data_vencimento IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias cb
              WHERE cb.id = coalesce(NEW.conta_bancaria_id, NEW.conta_destino_id) AND cb.cliente_id = NEW.cliente_id AND cb.tipo_conta = 'cartao') THEN
    NEW.vencimento_origem := 'cartao';
  ELSIF EXISTS (SELECT 1 FROM public.financiamentos f WHERE f.id = NEW.financiamento_id AND f.natureza IN ('financiamento', 'consorcio'))
     OR EXISTS (SELECT 1 FROM public.financeiro_contratos c WHERE c.id = NEW.contrato_id AND c.cliente_id = NEW.cliente_id) THEN
    NEW.vencimento_origem := 'contrato';
  ELSE
    NEW.vencimento_origem := 'sugerido';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_vencimento_origem_na_criacao ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_vencimento_origem_na_criacao
  BEFORE INSERT ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public._fn_trg_vencimento_origem_na_criacao();

REVOKE ALL ON FUNCTION public._fn_vencimento_declarado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_vencimento_declarado(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_vencimentos_declarados(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vencimentos_declarados(uuid, uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._fn_trg_vencimento_origem_na_criacao() FROM PUBLIC, anon, authenticated;
