-- NOTA-ENTREGA-FUTURA-01 (2) — OK do Gabriel 25/11 07:24: 5932/5933/6932/6933 (transporte iniciado em outra UF / serviço com ISS) PASSAM A
-- GERAR lançamento. Eram pegos pela regra "todo 59xx/69xx é remessa" e caíam em "não gera · remessa" — serviço que cobra (FASE 0 do Lucro
-- Rural 24/11). A regra é UMA nos dois lados: este lote (o banco, `fn_classe_da_nota`) e `src/lib/fiscal/classeDaNota.ts` (a tela).
-- Patch GUARDADO pelo md5 da definição viva; o resto da função igual, byte a byte. Só a regra; nenhum dado muda.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $patch$
DECLARE v_def text; v_novo text;
BEGIN
  v_def := pg_get_functiondef('public.fn_classe_da_nota(text[],text,text,boolean)'::regprocedure);
  IF md5(v_def) <> 'b8bbbbc307666b5a52f58400429423a7' THEN
    RAISE EXCEPTION 'CFOP-SERVICO: fn_classe_da_nota mudou (md5 %). Nada foi aplicado.', md5(v_def);
  END IF;
  v_novo := replace(v_def, $a$x NOT IN ('5922', '6922', '5929', '6929', '5949', '6949')$a$,
                           $a$x NOT IN ('5922', '6922', '5929', '6929', '5949', '6949', '5932', '5933', '6932', '6933')$a$);
  IF v_novo = v_def OR length(v_novo) - length(v_def) <> length($a$, '5932', '5933', '6932', '6933'$a$) THEN
    RAISE EXCEPTION 'CFOP-SERVICO: a âncora do patch não casou. Nada foi aplicado.';
  END IF;
  EXECUTE v_novo;
END $patch$;
