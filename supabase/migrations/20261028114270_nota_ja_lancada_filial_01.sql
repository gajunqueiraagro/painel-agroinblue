-- NOTA-JA-LANCADA-FILIAL-01 (URGENTE, Gabriel 19/11 11:09 — NJ · NF 000.321.826 SENDAS LJ80, R$ 2.746,18, emissão 20/04/2026, sem duplicatas):
-- o "+ Da nota" não achou a compra que JÁ ESTÁ no sistema ("Compra cantina escritório", Sendas de OUTRA filial — a mesma RAIZ —, R$ 2.746,18
-- EXATO, realizada em 16/05/2026). A raiz do CNPJ a `fn_nota_ja_lancada` já usa (P128a, `forn_cnpj`); o que barrou foi a JANELA: pelo valor
-- ela só olha ±5 dias da parcela (sem duplicata, a parcela é a emissão) — a compra paga 26 dias depois ficou de fora.
-- Conserto (patch do corpo, guardado pelo md5 da definição de hoje): `cand_janela` — o VALOR EXATO (centavo igual) com a competência, o
-- vencimento OU o pagamento entre −15 e +90 dias da parcela da nota, SÓ do emitente pela RAIZ do CNPJ (nunca pelo nome); volta marcado
-- `por = 'janela'` e a tela o mostra como "talvez já lançado" (âmbar, "É esta" à mão: nunca liga sozinho). Os irmãos do parcelamento não
-- entram por ele (sem ruído). Nada mais muda na função.
set local lock_timeout = '2s';
do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_nota_ja_lancada(uuid,jsonb,text,text,text,text[],uuid)'::regprocedure);
  v_novo text;
  a text; b text; i int;
  ancoras text[] := array[
    '  -- o NUMERO: todos os digitos',
    'UNION ALL SELECT favorecido_id FROM cand_doc UNION ALL SELECT id FROM forn_cnpj) x',
    '  por_documento AS (SELECT c.id FROM cand_doc c JOIN alvo a ON a.id = c.favorecido_id),',
    '    UNION SELECT id FROM por_documento UNION SELECT id FROM por_soma UNION SELECT id FROM por_lancamento' || chr(10) || '  ),',
    'CASE WHEN pl.id IS NOT NULL THEN ''lancamento'' END,',
    'AND pd.id IS NULL AND ps.id IS NULL AND pl.id IS NULL THEN ''parcelamento'' END]',
    'LEFT JOIN por_lancamento pl ON pl.id = l.id;'];
  novas text[] := array[
    '  -- NOTA-JA-LANCADA-FILIAL-01: o VALOR EXATO numa janela LARGA (−15 a +90 dias da parcela, em competência, vencimento OU pagamento)' || chr(10) ||
    '  cand_janela AS (' || chr(10) ||
    '    SELECT DISTINCT l.id, l.favorecido_id FROM vivos l JOIN p ON round(l.valor * 100)::bigint = p.vc' || chr(10) ||
    '     WHERE (l.data_competencia BETWEEN p.venc - 15 AND p.venc + 90 OR l.data_vencimento BETWEEN p.venc - 15 AND p.venc + 90' || chr(10) ||
    '            OR l.data_pagamento BETWEEN p.venc - 15 AND p.venc + 90)' || chr(10) ||
    '       AND NOT EXISTS (SELECT 1 FROM cand_valor cv WHERE cv.id = l.id)' || chr(10) ||
    '  ),' || chr(10) ||
    '  -- o NUMERO: todos os digitos',
    'UNION ALL SELECT favorecido_id FROM cand_doc UNION ALL SELECT favorecido_id FROM cand_janela UNION ALL SELECT id FROM forn_cnpj) x',
    '  por_documento AS (SELECT c.id FROM cand_doc c JOIN alvo a ON a.id = c.favorecido_id),' || chr(10) ||
    '  -- NOTA-JA-LANCADA-FILIAL-01: a janela larga SO'' pela RAIZ do CNPJ (o nome parecido nao basta)' || chr(10) ||
    '  por_janela AS (SELECT DISTINCT c.id FROM cand_janela c JOIN alvo a ON a.id = c.favorecido_id WHERE a.por = ''cnpj''),',
    '    UNION SELECT id FROM por_documento UNION SELECT id FROM por_soma UNION SELECT id FROM por_lancamento UNION SELECT id FROM por_janela' || chr(10) || '  ),',
    'CASE WHEN pl.id IS NOT NULL THEN ''lancamento'' END,' || chr(10) ||
    '                                              CASE WHEN pj.id IS NOT NULL THEN ''janela'' END,',
    'AND pd.id IS NULL AND ps.id IS NULL AND pl.id IS NULL AND pj.id IS NULL THEN ''parcelamento'' END]',
    'LEFT JOIN por_lancamento pl ON pl.id = l.id LEFT JOIN por_janela pj ON pj.id = l.id;'];
begin
  if md5(v_def) <> '3061c0d6c83c770d80dc5c3b69188a76' then
    raise exception 'NOTA-JA-LANCADA-FILIAL-01: a fn_nota_ja_lancada mudou desde o ensaio (md5 %); nada gravado', md5(v_def);
  end if;
  v_novo := v_def;
  for i in 1 .. array_length(ancoras, 1) loop
    a := ancoras[i]; b := novas[i];
    if (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 then
      raise exception 'NOTA-JA-LANCADA-FILIAL-01: a âncora % não casa exatamente 1 vez; nada gravado', i;
    end if;
    v_novo := replace(v_novo, a, b);
  end loop;
  execute v_novo;
end $patch$;