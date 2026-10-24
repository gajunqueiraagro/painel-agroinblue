-- P74b (Gabriel 24/10/2026) — VOLTAR PARA À VISTA: desfazer a compra parcelada. Todo gesto tem volta: o "Parcelar este lançamento" (P74)
-- e o parcelado da nota/Novo lançamento voltam a ser UM lançamento à vista.
-- (1) `financiamentos.avista_original` (jsonb): o que o lançamento à vista era ANTES de virar a 1/N (id, valor, vencimento, competência,
--     descrição) — gravado de agora em diante pela `fn_parcelamento_a_partir_do_lancamento` (patch guardado por md5). FASE 0: ela não
--     guardava nada (sobrescrevia valor, vencimento, competência e descrição da 1/N).
-- (2) `fn_parcelamento_voltar_a_vista(p_financiamento_id, p_simular)`, UMA transação: só com NENHUMA parcela paga/realizada ou conciliada
--     (senão a recusa "A parcela k/N já foi paga em dd/mm/aaaa: desfaça o pagamento antes."); a 1/N volta a ser o lançamento — valor = a
--     soma das N, vencimento/competência/descrição = os guardados (sem o guardado — os parcelamentos antigos —, o vencimento e a competência
--     da 1/N e a descrição sem a fração); documentos e classificação ficam (a divisão se reescala na proporção pelo gatilho da casa,
--     `_fn_trg_classificacao_dividida_reescala`); as outras N−1 ficam CANCELADAS com o motivo "voltou para à vista" (nunca apagadas); o
--     cadastro fica cancelado com o mesmo motivo. ⚠ NÃO reusa `fn_parcelamento_excluir`: ela cancela também a 1/N (o lançamento original).
--     Simular = o MESMO caminho, desfeito (devolve o antes → depois para a confirmação).
CREATE OR REPLACE FUNCTION pg_temp._troca_texto(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (length(d) - length(replace(d, p_pares[3*i-2], ''))) / length(p_pares[3*i-2]);
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := replace(d, p_pares[3*i-2], p_pares[3*i-1]);
  END LOOP;
  EXECUTE d;
END $$;

SET LOCAL lock_timeout = '2s';
ALTER TABLE public.financiamentos ADD COLUMN IF NOT EXISTS avista_original jsonb;
COMMENT ON COLUMN public.financiamentos.avista_original IS
  'P74b — o lançamento à vista antes de virar a parcela 1/N (lancamento_id, valor, data_vencimento, data_competencia, descricao): a volta para à vista o restaura.';

SELECT pg_temp._troca_texto('public.fn_parcelamento_a_partir_do_lancamento(uuid,jsonb,boolean)', '193309f671b81fc2c74de361150f712b', ARRAY[
  $p$    returning id into v_fin_id;
$p$,
  $r$    returning id into v_fin_id;
    /* P74b — o que o lançamento à vista ERA, para a volta (valor, vencimento, competência, descrição) */
    update public.financiamentos
       set avista_original = jsonb_build_object('lancamento_id', l.id, 'valor', l.valor, 'data_vencimento', l.data_vencimento,
                                                'data_competencia', l.data_competencia, 'descricao', l.descricao)
     where id = v_fin_id;
$r$, '1']);

CREATE OR REPLACE FUNCTION public.fn_parcelamento_voltar_a_vista(p_financiamento_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  f        public.financiamentos%rowtype;
  v_n      int;
  v_paga   record;
  v_um     record;
  v_soma   numeric;
  v_orig   jsonb;
  v_venc   date;
  v_comp   date;
  v_desc   text;
  v_antes  jsonb;
  v_ret    jsonb;
  r        record;
  c_motivo constant text := 'voltou para à vista';
begin
  select * into f from public.financiamentos where id = p_financiamento_id for update;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if f.natureza is distinct from 'parcelamento' then
    raise exception using errcode = '22023', message = 'Só a compra parcelada volta para à vista. Nada foi gravado.';
  end if;
  if coalesce(f.status, '') = 'cancelado' then
    raise exception using errcode = '22023', message = 'Esta compra parcelada já está cancelada.';
  end if;
  select count(*) into v_n from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado';
  if v_n < 2 then
    raise exception using errcode = '22023', message = 'A compra não tem duas parcelas vivas: não há o que voltar. Nada foi gravado.';
  end if;

  select jsonb_agg(jsonb_build_object('numero', q.numero_parcela, 'lancamento_id', q.lancamento_id, 'vencimento', l.data_vencimento, 'valor', l.valor)
                   order by q.numero_parcela)
    into v_antes
    from public.financiamento_parcelas q left join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id
   where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado';

  /* NENHUMA PAGA: a primeira paga (realizado, conciliado, com pagamento ou vínculo de extrato) recusa, com a data */
  select q.numero_parcela as k, coalesce(l.data_pagamento, l.conciliado_em::date) as quando into v_paga
    from public.financiamento_parcelas q
    left join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not coalesce(l.cancelado, false)
   where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
     and (public._fn_parcela_de_parcelamento_paga(q.status, q.lancamento_id) or l.data_pagamento is not null or l.conciliado_em is not null)
   order by q.numero_parcela limit 1;
  if found then
    v_ret := jsonb_build_object('ok', false, 'simulado', p_simular, 'financiamento_id', f.id, 'antes', v_antes,
      'recusa', jsonb_build_object('motivo', 'ha_paga', 'parcela', v_paga.k,
        'frase', format('A parcela %s/%s já foi paga em %s: desfaça o pagamento antes.', v_paga.k, v_n, coalesce(to_char(v_paga.quando, 'DD/MM/YYYY'), '—'))));
    if not p_simular then
      raise exception using errcode = '22023', message = (v_ret->'recusa'->>'frase') || ' Nada foi gravado.';
    end if;
    return v_ret;
  end if;

  select q.id as parcela_id, l.id as lancamento_id, l.valor, l.data_vencimento, l.data_competencia, l.descricao into v_um
    from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not coalesce(l.cancelado, false)
   where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
   order by q.numero_parcela limit 1;
  if not found then
    raise exception using errcode = '22023', message = 'A primeira parcela não tem lançamento vivo. Nada foi gravado.';
  end if;
  select sum(l.valor) into v_soma
    from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not coalesce(l.cancelado, false)
   where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado';
  v_orig := case when f.avista_original->>'lancamento_id' = v_um.lancamento_id::text then f.avista_original end;
  v_venc := coalesce((v_orig->>'data_vencimento')::date, v_um.data_vencimento);
  v_comp := coalesce((v_orig->>'data_competencia')::date, v_um.data_competencia);
  v_desc := coalesce(v_orig->>'descricao', regexp_replace(coalesce(v_um.descricao, ''), '\s+\d+/\d+\s*$', ''));

  begin
    perform set_config('app.parcelamento_escritor', 'on', true);
    for r in select q.id, q.lancamento_id from public.financiamento_parcelas q
              where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado' and q.id <> v_um.parcela_id order by q.numero_parcela
    loop
      if r.lancamento_id is not null then perform public.fn_cancelar_lancamento_auditoria(r.lancamento_id, c_motivo); end if;
      update public.financiamento_parcelas set status = 'cancelado', updated_at = now() where id = r.id;
    end loop;
    update public.financiamento_parcelas set status = 'cancelado', updated_at = now() where id = v_um.parcela_id;
    update public.financeiro_lancamentos_v2
       set valor = v_soma, data_vencimento = v_venc, data_competencia = v_comp, descricao = v_desc, financiamento_id = null, origem_tipo = null
     where id = v_um.lancamento_id;
    perform set_config('app.parcelamento_escritor', 'off', true);
    update public.financiamentos
       set status = 'cancelado', updated_at = now(),
           observacao = concat_ws(E'\n', nullif(btrim(coalesce(observacao, '')), ''), format('[cancelada em %s: %s]', to_char(now(), 'YYYY-MM-DD'), c_motivo))
     where id = f.id;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'financiamento_id', f.id, 'lancamento_id', v_um.lancamento_id,
      'valor', v_soma, 'vencimento', v_venc, 'competencia', v_comp, 'descricao', v_desc, 'canceladas', v_n - 1,
      'original_guardado', v_orig is not null, 'antes', v_antes);
    if p_simular then raise exception using errcode = 'PVSIM', message = v_ret::text; end if;
  exception when sqlstate 'PVSIM' then
    v_ret := sqlerrm::jsonb;
  end;
  return v_ret;
end
$function$;
REVOKE ALL ON FUNCTION public.fn_parcelamento_voltar_a_vista(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_voltar_a_vista(uuid, boolean) TO authenticated;
