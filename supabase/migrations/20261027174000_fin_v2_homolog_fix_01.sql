-- 20261027174000_fin_v2_homolog_fix_01.sql
-- FIN-V2-HOMOLOG-FIX-01, item 4 — o favorecido das despesas que FICAM no cancelar da OC conta corrente.
-- O rol (`_oc_cancelar_conta_corrente`, chave `despesas`) lia o favorecido do COMPROMISSO, e ha' compromisso sem favorecido cujo
-- titulo tem: na 1337bb2d as duas comissoes (Paulo Sergio Baruta) e o ICMS (Sefaz MS) saiam sem nome no dialogo. Agora: o do
-- compromisso; sem ele, o do titulo vivo mais antigo do compromisso. So' leitura para o rol — nada gravado, nada mais muda.
-- PATCH GUARDADO POR md5: _oc_cancelar_conta_corrente a15e583a -> 5f585988.

create function pg_temp.fix_patch(p_nome text, p_de text, p_para text, p_trincas text[])
returns void
language plpgsql
as $p$
declare v_def text; v_i int; v_n int; v_a text; v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = p_nome and md5(p.prosrc) = p_de;
  if v_def is null then raise exception 'FIN-V2-HOMOLOG-FIX-01: % fora da origem esperada (%)', p_nome, p_de; end if;
  for v_i in 1 .. array_length(p_trincas, 1) by 3 loop
    v_a := p_trincas[v_i];
    v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
    if v_n <> p_trincas[v_i + 2]::int then
      raise exception 'FIN-V2-HOMOLOG-FIX-01: %, ancora % casa % vez(es), esperado %', p_nome, (v_i + 2) / 3, v_n, p_trincas[v_i + 2];
    end if;
    v_def := replace(v_def, v_a, p_trincas[v_i + 1]);
  end loop;
  execute v_def;
  select md5(p.prosrc) into v_novo from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_nome;
  if v_novo is distinct from p_para then
    raise exception 'FIN-V2-HOMOLOG-FIX-01: % com destino inesperado (%)', p_nome, v_novo; end if;
end $p$;

select pg_temp.fix_patch('_oc_cancelar_conta_corrente', 'a15e583a93087e07f8014412fc85c234', '5f585988500b26e1fb84f73914aa2b32', array[
  $a$'favorecido', fo.nome, 'valor', c.valor_total$a$,
  $b$'favorecido', coalesce(fo.nome, (
             -- FIN-V2-HOMOLOG-FIX-01: compromisso sem favorecido -> o do titulo vivo mais antigo dele
             SELECT tf.nome FROM public.zoo_operacao_programacoes tpr
               JOIN public.zoo_operacao_parcelas_programacao tpp ON tpp.programacao_id = tpr.id
               JOIN public.zoo_operacao_partes tpt ON tpt.programacao_parcela_id = tpp.id AND tpt.cancelada = false
               JOIN public.financeiro_lancamentos_v2 tl ON tl.id = tpt.financeiro_lancamento_id AND tl.cancelado IS NOT TRUE
               JOIN public.financeiro_fornecedores tf ON tf.id = tl.favorecido_id
              WHERE tpr.compromisso_id = c.id
              ORDER BY tl.data_competencia, tl.id LIMIT 1)), 'valor', c.valor_total$b$, '1'
]);

do $acl$
begin
  if has_function_privilege('authenticated', 'public._oc_cancelar_conta_corrente(uuid, text, boolean)', 'execute') then
    raise exception 'FIN-V2-HOMOLOG-FIX-01: ACL fora do esperado'; end if;
end $acl$;
