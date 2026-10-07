-- PARC-CONTRATO-01 (item 1) — A TELA DO CONTRATO LE^ O DETALHE DO MESMO DONO DA SITUACAO (Gabriel, 07/10/2026).
--
-- `fn_financiamento_situacao` ganha o TERCEIRO parametro `p_detalhe boolean DEFAULT false`. SEM ele (o lote
-- `fn_financiamentos_situacao_lote`, os paineis, toda chamada de antes) o retorno e' o de antes, byte a byte: o corpo so' ganha
-- um bloco `if p_detalhe` antes do `return`. COM ele, cada parcela leva tambem `competencia`, `conta_id`/`conta_nome` (a conta do
-- lancamento, pela regua de direcao `_fn_conta_do_lancamento`), `tipo_documento`/`numero_documento`, `prazo` {tipo: antes | no_dia |
-- atraso | vencida | a_vencer, dias} (paga: pago em x vencimento; nao paga: o HOJE da tela x vencimento), `documentos` (os vivos do
-- lancamento: id, especie, numero, valor) e `boletos`; e os cartoes levam `a_vencer_qtde`, `vencido_qtde`, `notas_qtde`,
-- `notas_valor`, `notas_diferenca` (nota − soma das parcelas; nulo = sem nota ou nota sem valor) e `boletos`.
-- NENHUMA REGRA DE SITUACAO MUDA: o bloco novo so' le' as parcelas ja' julgadas.
-- PATCH GUARDADO POR md5 (origem a3f310c2ecc81599000b2f9faa16efb1, 1 ancora exatamente 1x, destino 7d59c9158724a1c69ce2ee90abc3d01f).
-- ⚠ A ASSINATURA GANHA UM PARAMETRO: DROP + CREATE (o `CREATE OR REPLACE` criaria uma segunda funcao e a chamada de dois
--   argumentos ficaria ambigua). O DROP perde a ACL: o GRANT a authenticated e service_role vai aqui, e a guarda confere.
--   So' leitura, SECURITY DEFINER, STABLE e search_path como antes.

DO $mig$
DECLARE
  v_src text; v_novo text; v_a text; v_b text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_financiamento_situacao(uuid, date)'::regprocedure;
  IF md5(v_src) <> 'a3f310c2ecc81599000b2f9faa16efb1' THEN
    RAISE EXCEPTION 'PARC-CONTRATO-01 1: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_a := $a1$  return jsonb_build_object('financiamento_id', f.id, 'natureza', f.natureza, 'hoje', v_hoje, 'parcelas', v_parc, 'cartoes', v_cart);
$a1$::text;
  v_b := $b1$  -- PARC-CONTRATO-01 item 1 (Gabriel, 07/10/2026): O DETALHE DA TELA DO CONTRATO, so' com p_detalhe. Sem ele o retorno e' o de
  -- antes, byte a byte (o lote e os paineis nao pagam por isto). Nada aqui decide situacao: so' acrescenta, a cada parcela ja'
  -- julgada acima, o que a tela mostra ao lado — competencia e conta do LANCAMENTO, o prazo (pago em x vencimento; nao paga, hoje
  -- x vencimento, com o "hoje" que a tela mandou), os documentos vivos do lancamento e os boletos — e, aos cartoes, as contagens.
  if coalesce(p_detalhe, false) then
    select coalesce(jsonb_agg(e.p || jsonb_build_object(
             'competencia', l.data_competencia,
             'conta_id', c.id,
             'conta_nome', coalesce(nullif(c.nome_exibicao, ''), c.nome_conta),
             'tipo_documento', l.tipo_documento,
             'numero_documento', l.numero_documento,
             'prazo', case
                 when (e.p->>'data_vencimento') is null then null
                 when e.p->>'situacao' = 'paga' and (e.p->>'pago_em') is null then null
                 when e.p->>'situacao' = 'paga' then jsonb_build_object(
                        'tipo', case when (e.p->>'pago_em')::date < (e.p->>'data_vencimento')::date then 'antes'
                                     when (e.p->>'pago_em')::date = (e.p->>'data_vencimento')::date then 'no_dia' else 'atraso' end,
                        'dias', abs((e.p->>'pago_em')::date - (e.p->>'data_vencimento')::date))
                 when (e.p->>'data_vencimento')::date < v_hoje then
                      jsonb_build_object('tipo', 'vencida', 'dias', v_hoje - (e.p->>'data_vencimento')::date)
                 else jsonb_build_object('tipo', 'a_vencer', 'dias', (e.p->>'data_vencimento')::date - v_hoje) end,
             'documentos', coalesce(dd.docs, '[]'::jsonb),
             'boletos', coalesce(dd.boletos, 0)
           ) order by e.ord), '[]'::jsonb)
      into v_parc
      from jsonb_array_elements(v_parc) with ordinality e(p, ord)
      left join public.financeiro_lancamentos_v2 l on l.id = (e.p->>'lancamento_id')::uuid
      left join public.financeiro_contas_bancarias c
             on c.id = public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id)
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', d.documento_id, 'especie', d.especie, 'numero', d.numero, 'valor', d.valor_documento)
                         order by d.uploaded_em, d.documento_id) as docs,
               count(*) filter (where d.especie = 'boleto') as boletos
          from public.vw_lancamento_documentos d
         where d.lancamento_id = l.id and not coalesce(d.cancelado, false)
      ) dd on true;

    v_cart := v_cart || (
      with p as (select e.p from jsonb_array_elements(v_parc) e(p)),
      docs as (
        select distinct on (d->>'id') d->>'id' as id, d->>'especie' as especie, (d->>'valor')::numeric as valor
          from p, jsonb_array_elements(p.p->'documentos') d
         order by d->>'id'
      ), notas as (
        select count(*) as qtde, count(valor) as com_valor, sum(valor) as valor
          from docs where especie in ('nf', 'nf_principal', 'nf_complementar')
      )
      select jsonb_build_object(
        'a_vencer_qtde', (select count(*) from p where p.p->>'situacao' <> 'paga' and (p.p->>'data_vencimento')::date >= v_hoje),
        'vencido_qtde',  (select count(*) from p where p.p->>'situacao' <> 'paga' and (p.p->>'data_vencimento')::date <  v_hoje),
        'notas_qtde', n.qtde,
        'notas_valor', case when n.qtde > 0 and n.com_valor = n.qtde then round(n.valor, 2) end,
        -- nota − soma das parcelas, em centavos: 0 = confere; nulo = nao ha' nota, ou ha' nota sem valor (nao comparavel)
        'notas_diferenca', case when n.qtde > 0 and n.com_valor = n.qtde
                                then round(n.valor, 2) - (v_cart->>'soma_total')::numeric end,
        'boletos', (select count(*) from docs where especie = 'boleto'))
      from notas n);
  end if;

  return jsonb_build_object('financiamento_id', f.id, 'natureza', f.natureza, 'hoje', v_hoje, 'parcelas', v_parc, 'cartoes', v_cart);
$b1$::text;
  IF (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 THEN
    RAISE EXCEPTION 'PARC-CONTRATO-01 1: a ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_src, v_a, v_b);
  IF md5(v_novo) <> '7d59c9158724a1c69ce2ee90abc3d01f' THEN
    RAISE EXCEPTION 'PARC-CONTRATO-01 1: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  DROP FUNCTION public.fn_financiamento_situacao(uuid, date);
  EXECUTE format($f$CREATE FUNCTION public.fn_financiamento_situacao(p_financiamento_id uuid, p_hoje date DEFAULT NULL::date, p_detalhe boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, v_novo);
  REVOKE ALL ON FUNCTION public.fn_financiamento_situacao(uuid, date, boolean) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.fn_financiamento_situacao(uuid, date, boolean) TO authenticated, service_role;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_financiamento_situacao(uuid, date, boolean)'::regprocedure) <> '7d59c9158724a1c69ce2ee90abc3d01f'
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_financiamento_situacao(uuid, date, boolean)'::regprocedure)
     OR NOT has_function_privilege('authenticated', 'public.fn_financiamento_situacao(uuid, date, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_financiamento_situacao(uuid, date, boolean)', 'EXECUTE')
     OR (SELECT count(*) FROM pg_proc WHERE proname = 'fn_financiamento_situacao') <> 1 THEN
    RAISE EXCEPTION 'PARC-CONTRATO-01 1: corpo, SECURITY DEFINER ou ACL diferentes do esperado depois do DROP + CREATE';
  END IF;
END
$mig$;
