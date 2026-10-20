-- OC-DESFAZER-PREVISTO-01a (Gabriel, 20/10/2026) — o "Desfazer compromisso" deixa de travar em lançamento que JÁ NÃO É da OC.
--
-- O caso (proto, 20/10 18h18): OC de abate 1645ba75, compromisso 6347b5a1. Em 12/10 um lançamento REALIZADO e CONCILIADO de julho
-- (2448e772, R$ 213.150,75) foi vinculado à OC e, em 14/10, desvinculado ("vínculo errado"): a parte foi CANCELADA e o lançamento
-- segue vivo, como deve. As guardas de cancelar programação e cancelar compromisso juntavam a parte SEM olhar `cancelada` e
-- recusavam com "Existe titulo ativo…" — o `oc_desfazer_compromisso` (que estorna o título previsto no mesmo gesto) nunca chegava
-- ao fim, e o compromisso ficava sem saída.
--
--   · oc_cancelar_programacao — a guarda do título conta só PARTE VIVA (`pt.cancelada IS NOT TRUE`).
--   · oc_cancelar_compromisso — as guardas de parcela materializada/paga e de parte/título contam só PROGRAMAÇÃO ATIVA e PARTE VIVA.
--     Lançamento de parte cancelada (desvinculado) nunca trava e nunca é tocado.
--   · oc_reprogramar_compromisso_do_lote ("Atualizar compromisso") — ao cancelar os lançamentos das parcelas vivas grava
--     `cancelado_em`, `cancelado_por`, `cancelado_motivo` e `updated_by`, como o estorno da materialização já faz (era só
--     `cancelado = true`).
-- Mensagens, agendado e vencimento proposto ficam para o 01b.
--
-- PADRÃO VIGENTE: cada função só é trocada se o `prosrc` tiver o md5 de ORIGEM (o medido em 20/10); com o md5 de DESTINO, pula
-- (reaplicável); qualquer outro, ABORTA. Cada trecho tem de aparecer exatamente uma vez. Depois da troca, o md5 tem de ser o de
-- destino e a ACL a mesma.

create or replace function pg_temp._troca_md5(p_fn regprocedure, p_origem text, p_destino text, p_trocas text[][]) returns void
language plpgsql as $f$
declare v_src text; v_acl text; d text; i int; a text; n int;
begin
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = p_fn;
  if md5(v_src) = p_destino then return; end if;
  if md5(v_src) <> p_origem then raise exception 'OC-DESFAZER-PREVISTO-01a: % com origem inesperada %', p_fn, md5(v_src); end if;
  d := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_trocas, 1) loop
    a := p_trocas[i][1];
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    if n <> 1 then raise exception 'OC-DESFAZER-PREVISTO-01a: % — trecho % achado % vez(es)', p_fn, i, n; end if;
    d := replace(d, a, p_trocas[i][2]);
  end loop;
  execute d;
  select prosrc into v_src from pg_proc where oid = p_fn;
  if md5(v_src) <> p_destino then raise exception 'OC-DESFAZER-PREVISTO-01a: % com destino inesperado %', p_fn, md5(v_src); end if;
  if (select proacl::text from pg_proc where oid = p_fn) is distinct from v_acl then raise exception 'OC-DESFAZER-PREVISTO-01a: % ACL mudou', p_fn; end if;
end $f$;

select pg_temp._troca_md5('public.oc_cancelar_programacao(uuid, uuid, integer, uuid, text, uuid)'::regprocedure,
  '45bfcd3718cc52065ce3bd3baee27ab0', '595595b2495ffcf8f211543029655338', array[
  array['              WHERE pp.programacao_id = p_programacao_id AND fl.cancelado IS NOT TRUE) THEN',
        '              WHERE pp.programacao_id = p_programacao_id AND pt.cancelada IS NOT TRUE AND fl.cancelado IS NOT TRUE) THEN']
]);

select pg_temp._troca_md5('public.oc_cancelar_compromisso(uuid, uuid, integer, uuid, text, uuid)'::regprocedure,
  '3194de1ea117d19ae4344c4858d80f50', 'f10a5618546d3895a9ddf30b87c49672', array[
  array['              WHERE pr.compromisso_id = p_compromisso_id AND pp.status IN (''materializada'',''paga'')) THEN',
        '              WHERE pr.compromisso_id = p_compromisso_id AND pr.status = ''ativa'' AND pp.status IN (''materializada'',''paga'')) THEN'],
  array['              WHERE pr.compromisso_id = p_compromisso_id
                AND (pt.cancelada IS NOT TRUE OR EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 fl
                      WHERE fl.id = pt.financeiro_lancamento_id AND fl.cancelado IS NOT TRUE))) THEN',
        '              WHERE pr.compromisso_id = p_compromisso_id AND pr.status = ''ativa''
                AND pt.cancelada IS NOT TRUE) THEN']
]);

select pg_temp._troca_md5('public.oc_reprogramar_compromisso_do_lote(uuid, uuid, integer, uuid, text, boolean)'::regprocedure,
  '667603c20c1624a81e9fd7b13e28311a', '2ca786fdfaad47fdcc0e5c6bb570e5c0', array[
  array['UPDATE public.financeiro_lancamentos_v2 fl SET cancelado = true, updated_at = now()',
        'UPDATE public.financeiro_lancamentos_v2 fl SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor,
         cancelado_motivo = btrim(p_motivo), updated_at = now(), updated_by = v_actor']
]);
