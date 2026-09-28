-- 20261027166200_oc_venda_entregas_01a_fix.sql
-- OC-VENDA-ENTREGAS-01a, conserto (decisoes do Gabriel, 28/09/2026):
--   1. `oc_excluir_lote` RECUSA lote com saida ATIVA, igual ao `oc_salvar_lotes`, com o caminho de cada origem:
--        adotada:    "Lote <categoria> (ordem N) tem saida adotada: <data> · <cab> cab. Desvincule na aba Entrega."
--        registrada: "Lote <categoria> (ordem N) tem saida ativa: <data> · <cab> cab. Estorne a saida primeiro."
--      Entra como BLOQUEIO, o mesmo canal do titulo conciliado: a simulacao devolve `ok = false` com a frase (o dialogo a
--      mostra, sem toast) e a execucao recusa. Lote sem saida ativa segue excluindo como antes (os vinculos estornados dele
--      saem junto, como ja' saiam).
--      ⚠ MUDA O DESENHO DO [OC-EXCLUIR-LOTE] (06/09): la' o excluir DESFAZIA a saida registrada (cancelava o lancamento). Agora
--        a saida ativa se desfaz antes, pela aba Entrega (estornar/desvincular), e o excluir so' tira o lote.
--   2. `_oc_sync_abate_lancamento` (SECURITY DEFINER, reescreve lancamento) estava com EXECUTE para PUBLIC. Nenhum codigo do
--      front a chama (so' o types.ts gerado); os dois chamadores, `oc_salvar_abate` e `oc_registrar_movimentacao`, sao SECURITY
--      DEFINER e rodam como dono. REVOKE de PUBLIC, anon e authenticated.
-- PATCH GUARDADO POR md5: oc_excluir_lote f08aefe8 -> 8a61566d.
-- PROVA (rollback no proto, 28/09/2026, como o usuario do Gabriel): 232c05aa lote 1 -> simulacao `ok = false` e execucao
--   recusada, as duas com "Lote desmama_m (ordem 1) tem saida adotada: 19/03/2025 · 178 cab. Desvincule na aba Entrega.";
--   Vera b58bf556 lote 1 -> "Lote garrotes (ordem 1) tem saida ativa: 13/05/2026 · 110 cab. Estorne a saida primeiro.";
--   lote SEM saida (um 8o incluido na 232c05aa) -> simulacao so' com "exclui o lote", execucao passa, 7 lotes restantes.
--   `has_function_privilege` de anon e authenticated em `_oc_sync_abate_lancamento`: false / false.

do $g$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_excluir_lote'
                   and md5(prosrc) = 'f08aefe8ff19d5f4886ae295f0607d30') then
    raise exception 'OC-VENDA-ENTREGAS-01a-fix: oc_excluir_lote fora do corpo esperado';
  end if;
end $g$;

do $p$
declare v_oid oid; v_def text; v_a text; v_b text;
begin
  select oid into v_oid from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_excluir_lote';
  v_def := pg_get_functiondef(v_oid);

  v_a := $a$r record; v_nova int; v_acordado numeric; v_qtd_rest int;$a$;
  v_b := $b$r record; v_nova int; v_acordado numeric; v_qtd_rest int; v_adot text; v_reg text;$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01a-fix: ancora da declaracao nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  v_a := $a$  -- (1) movimentacoes zootecnicas do lote$a$;
  v_b := $b$  -- OC-VENDA-ENTREGAS-01a-fix: lote com saida ATIVA nao se exclui — a mesma regra do `oc_salvar_lotes`, com o caminho
  -- de cada origem. Entra como bloqueio: a simulacao devolve a frase, a execucao recusa.
  SELECT string_agg(to_char(l.data, 'DD/MM/YYYY') || ' · ' || l.quantidade || ' cab', ', ' ORDER BY l.data, l.id)
           FILTER (WHERE m.origem = 'adotada'),
         string_agg(to_char(l.data, 'DD/MM/YYYY') || ' · ' || l.quantidade || ' cab', ', ' ORDER BY l.data, l.id)
           FILTER (WHERE m.origem = 'registrada')
    INTO v_adot, v_reg
    FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE m.operacao_lote_id = p_lote_id AND l.cancelado IS NOT TRUE;
  IF v_adot IS NOT NULL THEN
    v_bloq := v_bloq || jsonb_build_object('tipo', 'saida_adotada', 'descricao',
      format('Lote %s (ordem %s) tem saida adotada: %s. Desvincule na aba Entrega.',
             COALESCE(v_lote.categoria_negociada, 'sem categoria'), v_lote.ordem, v_adot));
  END IF;
  IF v_reg IS NOT NULL THEN
    v_bloq := v_bloq || jsonb_build_object('tipo', 'saida_ativa', 'descricao',
      format('Lote %s (ordem %s) tem saida ativa: %s. Estorne a saida primeiro.',
             COALESCE(v_lote.categoria_negociada, 'sem categoria'), v_lote.ordem, v_reg));
  END IF;

  -- (1) movimentacoes zootecnicas do lote$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01a-fix: ancora do bloco (1) nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  execute v_def;
end $p$;

revoke execute on function public._oc_sync_abate_lancamento(uuid) from public, anon, authenticated;

do $g$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_excluir_lote'
                   and md5(prosrc) = '8a61566dec2880806215f877e3354384') then
    raise exception 'OC-VENDA-ENTREGAS-01a-fix: oc_excluir_lote com destino inesperado';
  end if;
  if has_function_privilege('anon', 'public._oc_sync_abate_lancamento(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._oc_sync_abate_lancamento(uuid)', 'execute') then
    raise exception 'OC-VENDA-ENTREGAS-01a-fix: _oc_sync_abate_lancamento ainda executavel pelo front';
  end if;
end $g$;
