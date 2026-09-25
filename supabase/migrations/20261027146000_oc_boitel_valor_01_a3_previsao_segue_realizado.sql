-- OC-BOITEL-VALOR-01 A3 — `oc_revalorar_lote`: a previsao segue o realizado
--
-- POR QUE
-- O compromisso principal de uma venda boitel e' o "a receber" que alimenta o financeiro e o
-- fechamento do mes (o boitel paga 3-4 meses depois). Ele nascia SOLTO (`lote_id` nulo), da
-- PROJECAO, e nada o atualizava quando o realizado era aplicado. Caso real, 8b211cae (NJ):
-- compromisso 0fdec0eb com 848.713,32 enquanto o acerto do boitel dizia 882.608,62.
--
-- O QUE MUDA: depois de revalorar o lote (e o rebanho, e o `valor_acordado`), a funcao acha o
-- compromisso principal DO LOTE e o atualiza NO MESMO REGISTRO — nunca cria um segundo, nunca
-- deixa orfao:
--   1. procura por `lote_id = p_lote_id`, natureza principal, nao cancelado;
--   2. na falta, ADOTA a principal solta quando a operacao tem UM lote e UMA principal ativa
--      sem lote (a forma das previsoes de boitel gravadas antes da A3) — e a liga ao lote;
--   3. `aberto` e SEM programacao ativa: valor novo + `lote_id`, com trilha em
--      `zoo_operacao_eventos` ('ajustar_valor_compromisso', origem 'realizado aplicado', de X
--      para Y). Sem pedir motivo: o motivo e' o do proprio revalorar;
--   4. com programacao, titulo ou baixa: NAO mexe. A resposta devolve
--      `compromisso.acao = 'pendente'` — o caminho ali e' `oc_reprogramar_compromisso_do_lote`,
--      com motivo, pelo operador (decisao em aberto).
-- A resposta ganha `compromisso: {acao, id, valor_anterior, status}`; as chaves antigas ficam.
--
-- ⚠ MORA NO BANCO, NAO NA TELA: o revalorar e' o unico gesto que muda o slot com realizado, e
--   fazer o compromisso andar junto na mesma transacao e' o que garante que um nao existe sem o
--   outro. No front, uma falha entre as duas RPCs deixaria o lote no realizado e o "a receber"
--   na projecao — exatamente o estado que esta frente conserta.
--
-- ⚠ CONTAGEM DO CONCEITO: `zoo_operacao_compromissos` aparecia ZERO vezes no corpo de origem —
--   nao ha segundo bloco a esquecer. As tres ancoras casam 1x cada.
--
-- METODO: patch guardado por md5 (CLAUDE.md, "MIGRATION DE CORPO GRANDE").
--   md5(prosrc) ANTES:  96556ae072016cb78acc0347e0585d9a  (4.427 chars)
--   md5(prosrc) DEPOIS: cd372556b6a97b7e316d6a34448343c5  (7.443 chars)
--
-- ⚠ ACL: a funcao estava com EXECUTE para PUBLIC (`=X/postgres`), SECDEF que escreve — o caso
--   que a memoria do projeto registra (SECDEF com EXECUTE para PUBLIC). O rodape fecha PUBLIC e
--   anon e concede a authenticated (quem a tela usa) e service_role.

do $mig$
declare
  v_antes text; v_novo text; v_depois text;
  a1 text; b1 text; a2 text; b2 text; a3 text; b3 text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_revalorar_lote' and n.nspname = 'public';

  if md5(v_antes) <> '96556ae072016cb78acc0347e0585d9a' then
    raise exception 'oc_revalorar_lote nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  end if;

  a1 := $a1$  v_por_cab numeric; v_afetados int; v_nova int;$a1$; b1 := $b1$  v_por_cab numeric; v_afetados int; v_nova int;
  v_comp public.zoo_operacao_compromissos; v_comp_acao text := 'sem_compromisso'; v_n_orfas int;$b1$;
  a2 := $a2$GET DIAGNOSTICS v_afetados = ROW_COUNT;$a2$; b2 := $b2$GET DIAGNOSTICS v_afetados = ROW_COUNT;

  -- A PREVISAO SEGUE O REALIZADO — OC-BOITEL-VALOR-01 A3. O compromisso principal do lote
  -- (o "a receber" que alimenta financeiro e fechamento) acompanha o valor novo NO MESMO
  -- REGISTRO: nunca um segundo, nunca orfao. Achado pelo lote_id; na falta dele, adota a
  -- principal SOLTA quando a operacao tem um lote so' e uma principal ativa sem lote (a forma
  -- das previsoes de boitel gravadas antes da A3, lote_id nulo).
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
   WHERE operacao_id = p_operacao_id AND lote_id = p_lote_id AND natureza = 'principal' AND status <> 'cancelado'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND AND (SELECT count(*) FROM public.zoo_operacao_lotes WHERE operacao_id = p_operacao_id) = 1 THEN
    SELECT count(*) INTO v_n_orfas FROM public.zoo_operacao_compromissos
     WHERE operacao_id = p_operacao_id AND lote_id IS NULL AND natureza = 'principal' AND status <> 'cancelado';
    IF v_n_orfas = 1 THEN
      SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
       WHERE operacao_id = p_operacao_id AND lote_id IS NULL AND natureza = 'principal' AND status <> 'cancelado'
       FOR UPDATE;
    END IF;
  END IF;
  IF v_comp.id IS NOT NULL THEN
    -- So' o aberto SEM programacao anda sozinho. Com programacao, titulo ou baixa ha dinheiro
    -- datado ou movido por tras, e reprogramar e' `oc_reprogramar_compromisso_do_lote` (com
    -- motivo, pelo operador). Aqui ele fica como esta' e a resposta avisa: 'pendente'.
    IF v_comp.status = 'aberto' AND NOT EXISTS (
         SELECT 1 FROM public.zoo_operacao_programacoes pr
          WHERE pr.compromisso_id = v_comp.id AND pr.status <> 'cancelada') THEN
      IF round(v_comp.valor_total, 2) <> round(p_novo_valor, 2) OR v_comp.lote_id IS NULL THEN
        UPDATE public.zoo_operacao_compromissos
           SET valor_total = round(p_novo_valor, 2), lote_id = p_lote_id, updated_at = now()
         WHERE id = v_comp.id;
        INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
        VALUES (p_cliente_id, p_operacao_id, 'ajustar_valor_compromisso', to_jsonb(v_comp),
                jsonb_build_object('origem', 'realizado aplicado', 'motivo', p_motivo,
                  'compromisso_id', v_comp.id, 'lote_id', p_lote_id,
                  'ligado_ao_lote', v_comp.lote_id IS NULL,
                  'valor_anterior', v_comp.valor_total, 'valor_novo', round(p_novo_valor, 2),
                  'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
                v_actor, 'rpc');
        v_comp_acao := 'atualizado';
      ELSE
        v_comp_acao := 'ja_no_valor';
      END IF;
    ELSE
      v_comp_acao := 'pendente';
    END IF;
  END IF;$b2$;
  a3 := $a3$'lancamentos_afetados', v_afetados);$a3$; b3 := $b3$'lancamentos_afetados', v_afetados,
    'compromisso', jsonb_build_object('acao', v_comp_acao, 'id', v_comp.id,
      'valor_anterior', v_comp.valor_total, 'status', v_comp.status));$b3$;

  if (length(v_antes) - length(replace(v_antes, a1, ''))) / length(a1) <> 1 then raise exception 'ancora 1 (declare) nao casa 1x'; end if;
  if (length(v_antes) - length(replace(v_antes, a2, ''))) / length(a2) <> 1 then raise exception 'ancora 2 (GET DIAGNOSTICS) nao casa 1x'; end if;
  if (length(v_antes) - length(replace(v_antes, a3, ''))) / length(a3) <> 1 then raise exception 'ancora 3 (retorno) nao casa 1x'; end if;

  v_novo := replace(replace(replace(v_antes, a1, b1), a2, b2), a3, b3);

  execute 'CREATE OR REPLACE FUNCTION public.oc_revalorar_lote(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_lote_id uuid, p_novo_valor numeric, p_motivo text)'
       || ' RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'', ''pg_temp'' AS $fn$'
       || v_novo || '$fn$';

  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_revalorar_lote' and n.nspname = 'public';

  if md5(v_depois) <> 'cd372556b6a97b7e316d6a34448343c5' then
    raise exception 'corpo resultante inesperado (md5 %). Esperado cd372556b6a97b7e316d6a34448343c5.', md5(v_depois);
  end if;
end $mig$;

REVOKE ALL ON FUNCTION public.oc_revalorar_lote(uuid, uuid, integer, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_revalorar_lote(uuid, uuid, integer, uuid, numeric, text) TO authenticated, service_role;
