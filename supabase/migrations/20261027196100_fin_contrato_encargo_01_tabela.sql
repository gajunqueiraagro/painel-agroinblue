-- FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 1, parte A (Gabriel, 11/10/2026): O ENCARGO DO CONTRATO TEM TABELA PROPRIA.
-- Juros, IOF, tarifa e outros encargos que o banco cobra num contrato sao lancamentos avulsos; passam a poder ser LIGADOS ao
-- contrato sem virar parcela e sem tocar o lancamento. D1: o vinculo mora AQUI, e NAO em financeiro_lancamentos_v2.financiamento_id
-- (cinco leitores supoem "financiamento_id = parcela ou captacao"). D2: vale para as tres naturezas. D3: contrato com encargo
-- vivo nao se exclui nem se cancela. Desfazer MARCA (desfeito_em), nunca apaga — o padrao de conciliacao_bancaria_itens.
-- Contrato "vivo" = coalesce(status, '') <> 'cancelado' (o predicado de guard_parcelamento_lancamento_cancelar e de
-- fn_parcelamento_excluir; 'quitado' e' vivo). Escrita SO' pelas funcoes da parte B (nenhuma policy de escrita).
-- NENHUM DADO E' ALTERADO: a tabela nasce vazia.
SET LOCAL lock_timeout = '2s';

CREATE TABLE public.financiamento_encargos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL REFERENCES public.clientes(id),
  financiamento_id uuid NOT NULL REFERENCES public.financiamentos(id) ON DELETE RESTRICT,
  lancamento_id    uuid NOT NULL REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE RESTRICT,
  papel            text NOT NULL CHECK (papel IN ('juros', 'iof', 'tarifa', 'seguro', 'multa', 'outro')),
  vinculado_em     timestamptz NOT NULL DEFAULT now(),
  vinculado_por    uuid,
  desfeito_em      timestamptz,
  desfeito_por     uuid,
  desfeito_motivo  text,
  -- por extenso: CHECK com coluna nula da' NULL, e NULL passa (a licao do REC-PROPAGAR-VALOR-DO-MES-01)
  CONSTRAINT fin_encargo_desfeito_chk CHECK (
    (desfeito_em IS NULL AND desfeito_motivo IS NULL) OR (desfeito_em IS NOT NULL AND desfeito_motivo IS NOT NULL))
);
COMMENT ON TABLE public.financiamento_encargos IS
  'Encargo de contrato (juros, IOF, tarifa...): o UNICO lugar que diz "este lancamento e'' encargo deste contrato". Nao toca o lancamento; desfazer marca desfeito_em. Escrita so'' por fn_contrato_encargo_vincular / _desvincular.';

CREATE UNIQUE INDEX uq_fin_encargo_vivo_por_lancamento ON public.financiamento_encargos (lancamento_id) WHERE desfeito_em IS NULL;
CREATE INDEX idx_fin_encargo_contrato ON public.financiamento_encargos (financiamento_id);
CREATE INDEX idx_fin_encargo_cliente ON public.financiamento_encargos (cliente_id);

ALTER TABLE public.financiamento_encargos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financiamento_encargos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financiamento_encargos TO authenticated;
GRANT ALL ON public.financiamento_encargos TO service_role;
CREATE POLICY fin_encargos_select_tenant ON public.financiamento_encargos
  FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));

-- D3 — a trava do contrato. Dispara no DELETE (o excluir de financiamento com juros APAGA a linha: FinanciamentoDetalhe.tsx,
-- "ETAPA 3") e no UPDATE que leva o status a 'cancelado' (fn_parcelamento_excluir). Sem encargo: uma consulta por indice.
-- Decisao do Gabriel (11/10): no DELETE, QUALQUER linha de encargo do contrato (viva ou desfeita) recusa com frase propria.
CREATE FUNCTION public.guard_financiamento_com_encargo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n int;
begin
  -- DELETE: a trilha (viva OU desfeita) nao se apaga, entao o contrato que a tem tambem nao — frase, nunca o 23503 cru da FK.
  if tg_op = 'DELETE' then
    if exists (select 1 from public.financiamento_encargos e where e.financiamento_id = old.id) then
      raise exception using errcode = 'P0001',
        message = 'Este contrato tem histórico de encargos e não pode ser apagado. Cancele o contrato em vez de excluir.';
    end if;
    return old;
  end if;
  -- UPDATE: so' o que leva o status a 'cancelado', e so' encargo VIVO recusa (historico desfeito deixa cancelar).
  if not (coalesce(new.status, '') = 'cancelado' and coalesce(old.status, '') <> 'cancelado') then
    return new;
  end if;
  select count(*) into v_n from public.financiamento_encargos e
   where e.financiamento_id = old.id and e.desfeito_em is null;
  if v_n > 0 then
    raise exception using errcode = 'P0001',
      message = format('Este contrato tem %s encargo(s) vinculado(s). Desvincule-os no bloco Encargos antes de cancelar.', v_n);
  end if;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION public.guard_financiamento_com_encargo() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_financiamento_com_encargo
  BEFORE DELETE OR UPDATE OF status ON public.financiamentos
  FOR EACH ROW EXECUTE FUNCTION public.guard_financiamento_com_encargo();
