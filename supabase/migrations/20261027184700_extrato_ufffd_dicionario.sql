-- EXTRATO-UFFFD-01 — corrige o U+FFFD das linhas VIVAS de extrato_bancario_v2 por DICIONARIO, recalculando hash_movimento.
--
-- ⚠ ORIGEM: antes do PR-CONC-CRIAR-LOTE-LAYOUT-01 (ae62c361) o OFX do BB e do Bradesco (cp1252) era lido como UTF-8 e
--   todo byte acentuado virou U+FFFD ("Cart�o"). O byte original se PERDEU; o que se sabe e' a PALAVRA. GO do Gabriel
--   em 30/09: dicionario das 26 palavras medidas, so' palavra INTEIRA, so' linha VIVA; o que nao casar fica como esta'.
-- ⚠ O HASH ACOMPANHA: hash_movimento = sha256(conta|data|valor 2 casas|normalizar(descricao)|normalizar(documento)), a
--   mesma conta de `src/lib/financeiro/extratoHash.ts` (normalizar = NFD sem diacriticos, espacos colapsados, trim,
--   UPPER). A replica SQL abaixo foi conferida contra o banco: 5.213 de 5.215 hashes batem, INCLUSIVE as 326 linhas com
--   U+FFFD (as 2 que nao batem sao linhas sem U+FFFD com valor editado depois da importacao — fora daqui). E o bloco
--   exige, linha a linha, que a replica reproduza o hash GRAVADO antes de trocar: se nao reproduz, aborta.
--   Com o texto certo, o hash novo e' o que o parser corrigido produz ao reimportar o mesmo arquivo.
-- ⚠ O DOCUMENTO TAMBEM: os 6 do Bradesco tem o U+FFFD no `documento` ("Rita de C�ssia", "Jos�") — as mesmas palavras
--   do dicionario. A chave natural (`fn_extrato_chave_doc` = 4a parte do documento, o numero) NAO muda.
-- ⚠ CAIXA DO "�gua": o byte perdido podia ser A ou a; "Pgto conta �gua" fica "água" (segue o "conta" minusculo). O hash
--   nao depende disso (UPPER sem acento), so' a exibicao.
-- ⚠ FORA: linhas canceladas/ignoradas (17, so' reportadas); `snapshot_historico_banco` dos vinculos (e' fotografia do
--   momento, nao se reescreve); lancamento CLASSIFICADO com U+FFFD (so' reportado). DENTRO: lancamento CRU vivo ligado a
--   uma destas linhas (origem extrato/ofx, sem conta do plano, fora transferencia) — descricao pelo MESMO dicionario.
-- ⚠ GUARDAS: contagem de origem (309 vivas, 5 crus), replica = hash gravado em cada linha, zero colisao do hash novo com
--   linha viva do cliente (e entre si), vinculos vivos iguais antes e depois, replica = hash novo gravado. Qualquer
--   falha aborta a transacao inteira.

CREATE FUNCTION pg_temp.ufffd_norm(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT upper(btrim(regexp_replace(regexp_replace(normalize(coalesce(p, ''), NFD), '[̀-ͯ]', '', 'g'),
    '[\s   -     　﻿]+', ' ', 'g')))
$f$;

CREATE FUNCTION pg_temp.ufffd_hash(p_conta uuid, p_data date, p_valor numeric, p_desc text, p_doc text)
RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT encode(sha256(convert_to(concat_ws('|', p_conta::text, p_data::text, round(p_valor, 2)::text,
    pg_temp.ufffd_norm(p_desc), pg_temp.ufffd_norm(p_doc)), 'UTF8')), 'hex')
$f$;

CREATE TEMP TABLE ufffd_dic (de text PRIMARY KEY, para text NOT NULL) ON COMMIT DROP;
INSERT INTO ufffd_dic (de, para) VALUES
  (U&'F\FFFDcil', 'Fácil'), (U&'Cart\FFFDo', 'Cartão'), (U&'cart\FFFDo', 'cartão'), (U&'El\FFFDtrica', 'Elétrica'),
  (U&'Transfer\FFFDncia', 'Transferência'), (U&'Presta\FFFD\FFFDo', 'Prestação'), (U&'Cons\FFFDrcio', 'Consórcio'),
  (U&'CONS\FFFDRCIO', 'CONSÓRCIO'), (U&'cr\FFFDdito', 'crédito'), (U&'Cr\FFFDdito', 'Crédito'), (U&'\FFFDgua', 'água'),
  (U&'Cobran\FFFDa', 'Cobrança'), (U&'Cr\FFFDd', 'Créd'), (U&'Gon\FFFDalves', 'Gonçalves'), (U&'C\FFFDssia', 'Cássia'),
  (U&'Ped\FFFDgio', 'Pedágio'), (U&'J\FFFDnior', 'Júnior'), (U&'D\FFFDbito', 'Débito'), (U&'Empr\FFFDstimo', 'Empréstimo'),
  (U&'Dispon\FFFDv', 'Disponív'), (U&'Jos\FFFD', 'José'), (U&'Poupan\FFFDa', 'Poupança'), (U&'Jana\FFFDna', 'Janaína'),
  (U&'Esp\FFFDrito', 'Espírito'), (U&'Agropecu\FFFDrio', 'Agropecuário'), (U&'Patr\FFFDcia', 'Patrícia');

/* So' palavra INTEIRA: nem letra/digito antes, nem depois ("Cr�d" nao casa dentro de "Cr�dito"). */
CREATE FUNCTION pg_temp.ufffd_corrigir(p text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r record; v text := p;
BEGIN
  IF v IS NULL OR position(chr(65533) IN v) = 0 THEN RETURN v; END IF;
  FOR r IN SELECT de, para FROM ufffd_dic ORDER BY length(de) DESC, de LOOP
    v := regexp_replace(v, '(?<![[:alnum:]])' || r.de || '(?![[:alnum:]])', r.para, 'g');
  END LOOP;
  RETURN v;
END
$f$;

DO $ufffd$
DECLARE
  k_fffd constant text := chr(65533);
  v_vivas int; v_nao_vivas int; v_crus int; v_col int; v_vinc_antes int; v_vinc_depois int;
  v_sobras int; v_upd int; v_upd_cru int; v_resto int; v_rel text;
BEGIN
  CREATE TEMP TABLE ufffd_alvo ON COMMIT DROP AS
    SELECT e.id, e.cliente_id, e.conta_bancaria_id, e.data_movimento, e.valor, e.hash_movimento,
           e.descricao AS desc_old, e.documento AS doc_old,
           pg_temp.ufffd_corrigir(e.descricao) AS desc_new, pg_temp.ufffd_corrigir(e.documento) AS doc_new
      FROM extrato_bancario_v2 e
     WHERE e.cancelado_em IS NULL AND e.status <> 'ignorado'
       AND (e.descricao LIKE '%' || k_fffd || '%' OR e.documento LIKE '%' || k_fffd || '%');
  ALTER TABLE ufffd_alvo ADD COLUMN hash_new text;
  UPDATE ufffd_alvo SET hash_new = pg_temp.ufffd_hash(conta_bancaria_id, data_movimento, valor, desc_new, doc_new)
   WHERE id IS NOT NULL;

  -- 1. origem
  SELECT count(*) INTO v_vivas FROM ufffd_alvo;
  IF v_vivas <> 309 THEN RAISE EXCEPTION 'origem: % linhas vivas com U+FFFD (esperado 309)', v_vivas; END IF;
  SELECT count(*) INTO v_nao_vivas FROM extrato_bancario_v2
   WHERE NOT (cancelado_em IS NULL AND status <> 'ignorado')
     AND (descricao LIKE '%' || k_fffd || '%' OR documento LIKE '%' || k_fffd || '%');
  IF EXISTS (SELECT 1 FROM ufffd_alvo
              WHERE pg_temp.ufffd_hash(conta_bancaria_id, data_movimento, valor, desc_old, doc_old) <> hash_movimento) THEN
    RAISE EXCEPTION 'replica do hash nao reproduz o gravado em % linha(s)', (SELECT count(*) FROM ufffd_alvo
      WHERE pg_temp.ufffd_hash(conta_bancaria_id, data_movimento, valor, desc_old, doc_old) <> hash_movimento);
  END IF;

  -- 2. sobras (U+FFFD que o dicionario nao cobre): ficam como estao
  SELECT count(*) INTO v_sobras FROM ufffd_alvo
   WHERE desc_new LIKE '%' || k_fffd || '%' OR coalesce(doc_new, '') LIKE '%' || k_fffd || '%';
  DELETE FROM ufffd_alvo WHERE desc_new LIKE '%' || k_fffd || '%' OR coalesce(doc_new, '') LIKE '%' || k_fffd || '%';

  -- 3. colisao do hash novo
  SELECT count(*) INTO v_col FROM ufffd_alvo a JOIN extrato_bancario_v2 e
      ON e.cliente_id = a.cliente_id AND e.hash_movimento = a.hash_new AND e.id <> a.id
     AND e.cancelado_em IS NULL AND e.status <> 'ignorado';
  v_col := v_col + (SELECT count(*) - count(DISTINCT (cliente_id, hash_new)) FROM ufffd_alvo);
  IF v_col > 0 THEN RAISE EXCEPTION 'colisao de hash_movimento: %', v_col; END IF;

  -- 4. vinculos vivos antes
  SELECT count(*) INTO v_vinc_antes FROM conciliacao_bancaria_itens i JOIN ufffd_alvo a ON a.id = i.extrato_id
   WHERE i.desfeito_em IS NULL;

  -- 5. os crus ligados
  CREATE TEMP TABLE ufffd_cru ON COMMIT DROP AS
    SELECT DISTINCT l.id, l.descricao AS desc_old, pg_temp.ufffd_corrigir(l.descricao) AS desc_new
      FROM financeiro_lancamentos_v2 l
      JOIN conciliacao_bancaria_itens i ON i.lancamento_id = l.id AND i.desfeito_em IS NULL
      JOIN ufffd_alvo a ON a.id = i.extrato_id
     WHERE NOT l.cancelado AND l.descricao LIKE '%' || k_fffd || '%'
       AND l.origem_lancamento IN ('extrato', 'ofx') AND l.subcentro IS NULL AND l.plano_conta_id IS NULL
       AND coalesce(l.tipo_operacao, '') NOT LIKE '3-%';
  SELECT count(*) INTO v_crus FROM ufffd_cru;
  IF v_crus <> 5 THEN RAISE EXCEPTION 'origem: % lancamentos crus com U+FFFD (esperado 5)', v_crus; END IF;

  -- 6. aplica
  UPDATE extrato_bancario_v2 e
     SET descricao = a.desc_new, documento = a.doc_new, hash_movimento = a.hash_new
    FROM ufffd_alvo a WHERE e.id = a.id;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  UPDATE financeiro_lancamentos_v2 l SET descricao = c.desc_new
    FROM ufffd_cru c WHERE l.id = c.id AND c.desc_new IS DISTINCT FROM c.desc_old;
  GET DIAGNOSTICS v_upd_cru = ROW_COUNT;

  -- 7. conferencias
  SELECT count(*) INTO v_vinc_depois FROM conciliacao_bancaria_itens i JOIN ufffd_alvo a ON a.id = i.extrato_id
   WHERE i.desfeito_em IS NULL;
  IF v_vinc_depois <> v_vinc_antes THEN RAISE EXCEPTION 'vinculos: % antes, % depois', v_vinc_antes, v_vinc_depois; END IF;
  IF EXISTS (SELECT 1 FROM extrato_bancario_v2 e JOIN ufffd_alvo a ON a.id = e.id
              WHERE e.hash_movimento <> pg_temp.ufffd_hash(e.conta_bancaria_id, e.data_movimento, e.valor, e.descricao, e.documento)) THEN
    RAISE EXCEPTION 'hash gravado nao confere com a replica depois da troca';
  END IF;
  SELECT count(*) INTO v_resto FROM extrato_bancario_v2
   WHERE cancelado_em IS NULL AND status <> 'ignorado'
     AND (descricao LIKE '%' || k_fffd || '%' OR documento LIKE '%' || k_fffd || '%');
  IF v_resto <> v_sobras THEN RAISE EXCEPTION 'restam % vivas com U+FFFD (sobras declaradas: %)', v_resto, v_sobras; END IF;

  v_rel := format('vivas=%s atualizadas=%s sobras=%s restam=%s nao_vivas_intocadas=%s colisoes=0 vinculos=%s->%s crus=%s corrigidos=%s',
    v_vivas, v_upd, v_sobras, v_resto, v_nao_vivas, v_vinc_antes, v_vinc_depois, v_crus, v_upd_cru);
  RAISE NOTICE 'EXTRATO-UFFFD-01: %', v_rel;
END
$ufffd$;
