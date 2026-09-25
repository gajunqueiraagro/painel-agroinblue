-- OC-BOITEL-VALOR-01 PARTE A2 — `oc_salvar_lotes`: a trava do realizado tambem no CAMINHO A
--
-- POR QUE
-- Com o realizado do boitel aplicado, o valor do lote e' o LIQUIDO DO ACERTO, gravado por
-- `oc_revalorar_lote` (chamado por `aplicarRealizadoBoitel`, LancamentosTab). `oc_salvar_lotes`
-- ja' protegia esse valor contra o re-save da tela — mas SO' no CAMINHO B (operacao com
-- movimentacao registrada). No CAMINHO A (sem saida registrada) o `valor_informado` do payload
-- entrava sem trava nenhuma.
--
-- ⚠ A TRILHA QUE ACHOU O FURO (OC 8b211cae, NJ, venda boitel, 25/09/2026):
--     09:14:08.7  revalorar_lote   848.713,32 -> 882.608,62   (o realizado chegou ao lote)
--     09:14:23.3  salvar_lotes     payload 848.713,32          (o CONFIRMAR grava antes de fechar)
--     09:14:23.7  fechar
--     09:14:53    registrar_movimentacao — o lancamento nasce com 848.713,32
--   A saida so' foi registrada 30 s DEPOIS do Confirmar, entao o `salvar_lotes` caiu no CAMINHO A
--   e desfez o realizado. O Financeiro passou a oferecer a projecao como compromisso.
--
-- O QUE MUDA: o `valor_informado` do `ON CONFLICT DO UPDATE` do CAMINHO A ganha o MESMO predicado
-- do CAMINHO B, letra por letra — boitel `realizado` com `qtd_abatida` e `valor_total_abate`
-- preenchidos preserva o valor gravado. Nada mais: quantidade, peso e categoria continuam editaveis
-- no CAMINHO A, como antes.
--
-- ⚠ CONTAGEM DO CONCEITO, nao so' da string: `EXCLUDED.valor_informado` aparece 1x no corpo (so' o
--   CAMINHO A escreve por EXCLUDED); o CAMINHO B ja' tem a trava (`valor_informado = CASE WHEN
--   EXISTS`, 1x). O INSERT de lote NOVO nao tem valor anterior a preservar.
--
-- METODO: patch guardado por md5 (CLAUDE.md, "MIGRATION DE CORPO GRANDE").
--   md5(prosrc) ANTES:  33f471017f6c72143fcfcde8748d083b  (11.414 chars)
--   md5(prosrc) DEPOIS: cc94c75d6868ca4288a8c5bcfe1ffefe  (11.737 chars)
--
-- SECURITY DEFINER: o CREATE OR REPLACE preserva a ACL, mas o rodape a reafirma
-- (postgres/service_role/authenticated, sem PUBLIC e sem anon — o estado de antes).

do $mig$
declare
  v_antes text; v_novo text; v_depois text; a text; b text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_salvar_lotes' and n.nspname = 'public';

  if md5(v_antes) <> '33f471017f6c72143fcfcde8748d083b' then
    raise exception 'oc_salvar_lotes nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  end if;

  a := $a$valor_informado         = EXCLUDED.valor_informado,$a$;
  b := $b$valor_informado         = CASE WHEN EXISTS (
                SELECT 1 FROM public.zoo_operacao_boitel b
                 WHERE b.operacao_id = p_operacao_id AND b.cenario = 'realizado'
                   AND b.qtd_abatida IS NOT NULL AND b.valor_total_abate IS NOT NULL
              ) THEN zoo_operacao_lotes.valor_informado
              ELSE EXCLUDED.valor_informado END,$b$;

  if (length(v_antes) - length(replace(v_antes, a, ''))) / length(a) <> 1 then
    raise exception 'a ancora do CAMINHO A nao casa exatamente 1x';
  end if;

  v_novo := replace(v_antes, a, b);

  execute 'CREATE OR REPLACE FUNCTION public.oc_salvar_lotes(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_lotes jsonb)'
       || ' RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'', ''pg_temp'' AS $fn$'
       || v_novo || '$fn$';

  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_salvar_lotes' and n.nspname = 'public';

  if md5(v_depois) <> 'cc94c75d6868ca4288a8c5bcfe1ffefe' then
    raise exception 'corpo resultante inesperado (md5 %). Esperado cc94c75d6868ca4288a8c5bcfe1ffefe.', md5(v_depois);
  end if;
end $mig$;

REVOKE ALL ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) TO authenticated, service_role;
