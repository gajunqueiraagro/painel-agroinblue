-- P167 (NOTA-COMPRA-ERRADA-01, Gabriel 28/10/2026) — a NF 119.237 do NJ se ligou às 6 parcelas de DUAS compras do mesmo fornecedor (mesma
-- descrição, mesma soma) e ficou registrada em dobro. Três regras no banco (a tela mostra a recusa):
-- (1) `fn_nota_ja_lancada`: "esta parcela já tem esta nota" (`tem_esta_nota`) vale também pelo EMITENTE + nº (a nota antiga sem chave —
--     o 79de064e — passava por "não tem") e devolve `nota_documento_id`, para o anexar LIGAR o documento que existe em vez de criar outro;
-- (2) `fn_nota_completar`: os lançamentos de um pedido são de UMA compra — dois parcelamentos diferentes = recusa, nada gravado;
-- (3) `fin_documento_registrar`: a mesma NF (a chave, ou o emitente + o nº) com o MESMO tipo de arquivo já ativa neste lançamento ou nesta
--     compra = recusa (23505, o id da que existe no DETAIL). O par PDF + XML da mesma nota segue valendo (DOC-NOTA-XML-PDF-01: 20 pares hoje);
--     sem o tipo do arquivo no pedido (`tipo_arquivo`), a função grava como sempre.
-- ⚠ PATCH DE CORPO GUARDADO POR md5 (os corpos medidos em 28/10, depois das 113045/113050): se algum não for o medido, NADA muda. ACL igual.
SET LOCAL lock_timeout = '2s';

DO $$
DECLARE
  d text;
  v_anc constant text := $a$AND length(v_chave) = 44 AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = v_chave),$a$;
  v_novo constant text := $a$AND ((length(v_chave) = 44 AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = v_chave)
                                          OR (d.especie = 'nf' AND v_num <> '' AND ltrim(regexp_replace(coalesce(d.numero, ''), '\D', '', 'g'), '0') = v_num
                                              AND d.emitente_id IS NOT DISTINCT FROM l.favorecido_id))),
           'nota_documento_id', (SELECT d.documento_id FROM public.vw_lancamento_documentos d WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE
                                   AND ((length(v_chave) = 44 AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = v_chave)
                                        OR (d.especie = 'nf' AND v_num <> '' AND ltrim(regexp_replace(coalesce(d.numero, ''), '\D', '', 'g'), '0') = v_num
                                            AND d.emitente_id IS NOT DISTINCT FROM l.favorecido_id))
                                 ORDER BY d.uploaded_em, d.documento_id LIMIT 1),$a$;
BEGIN
  d := pg_get_functiondef('public.fn_nota_ja_lancada(uuid,jsonb,text,text,text,text[],uuid)'::regprocedure);
  IF md5(d) <> '4f9850499c3b6a6661a663184366d27b' THEN
    RAISE EXCEPTION 'P167: fn_nota_ja_lancada não é a medida (md5 %). Nada foi gravado.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_anc, ''))) / length(v_anc) <> 1 THEN
    RAISE EXCEPTION 'P167: a âncora do tem_esta_nota não casa exatamente 1 vez. Nada foi gravado.';
  END IF;
  EXECUTE replace(d, v_anc, v_novo);
END $$;

DO $$
DECLARE
  d text;
  v_anc constant text := '  /* o efeito no DRE: o valor que sai';
  v_novo constant text := $a$  /* P167 — UMA COMPRA SÓ: os lançamentos do pedido nunca são de dois parcelamentos (a NF 119.237 do NJ nas duas compras) */
  IF (SELECT count(DISTINCT x.financiamento_id) FROM public.financeiro_lancamentos_v2 x WHERE x.id = ANY (v_ids) AND x.financiamento_id IS NOT NULL) > 1 THEN
    v_recusas := v_recusas || jsonb_build_object('frase',
      'Estes lançamentos são de compras diferentes (dois parcelamentos): a nota é de uma compra só.');
  END IF;

  /* o efeito no DRE: o valor que sai$a$;
BEGIN
  d := pg_get_functiondef('public.fn_nota_completar(uuid,jsonb,boolean,text,boolean)'::regprocedure);
  IF md5(d) <> '99b035b3180a31069340baf8d04bce82' THEN
    RAISE EXCEPTION 'P167: fn_nota_completar não é a medida (md5 %). Nada foi gravado.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_anc, ''))) / length(v_anc) <> 1 THEN
    RAISE EXCEPTION 'P167: a âncora do efeito no DRE não casa exatamente 1 vez. Nada foi gravado.';
  END IF;
  EXECUTE replace(d, v_anc, v_novo);
END $$;

DO $$
DECLARE
  d text;
  v_anc1 constant text := $a$  v_nome text;
BEGIN$a$;
  v_novo1 constant text := $a$  v_nome text;
  v_rep uuid;
BEGIN$a$;
  v_anc2 constant text := $a$  v_nome := COALESCE($a$;
  v_novo2 constant text := $a$  /* P167 — a MESMA NF (a chave, ou o emitente + o nº) com o MESMO tipo de arquivo, já ativa neste lançamento ou nesta compra: não se
     registra de novo (o par PDF + XML da mesma nota segue). Sem `tipo_arquivo` no pedido, grava como sempre. */
  IF v_especie = 'nf' AND NULLIF(p_payload->>'tipo_arquivo', '') IS NOT NULL THEN
    SELECT d.documento_id INTO v_rep FROM public.vw_lancamento_documentos d
     WHERE d.cliente_id = p_cliente_id AND d.cancelado IS NOT TRUE AND d.especie = 'nf' AND d.tipo = p_payload->>'tipo_arquivo'
       AND (d.lancamento_id = p_lancamento_id
            OR (v_l.financiamento_id IS NOT NULL AND d.lancamento_id IN (SELECT x.id FROM public.financeiro_lancamentos_v2 x WHERE x.financiamento_id = v_l.financiamento_id)))
       AND ((length(regexp_replace(coalesce(p_payload->>'chave_acesso', ''), '\D', '', 'g')) = 44
             AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = regexp_replace(p_payload->>'chave_acesso', '\D', '', 'g'))
            OR (ltrim(regexp_replace(coalesce(p_payload->>'numero', ''), '\D', '', 'g'), '0') <> ''
                AND ltrim(regexp_replace(coalesce(d.numero, ''), '\D', '', 'g'), '0') = ltrim(regexp_replace(p_payload->>'numero', '\D', '', 'g'), '0')
                AND d.emitente_id IS NOT DISTINCT FROM NULLIF(p_payload->>'emitente_id', '')::uuid))
     ORDER BY d.uploaded_em LIMIT 1;
    IF v_rep IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23505', DETAIL = v_rep::text,
        MESSAGE = format('A NF %s já está registrada nesta compra (o mesmo arquivo): abra a que existe. Nada foi gravado.', coalesce(p_payload->>'numero', ''));
    END IF;
  END IF;

  v_nome := COALESCE($a$;
BEGIN
  d := pg_get_functiondef('public.fin_documento_registrar(uuid,uuid,jsonb)'::regprocedure);
  IF md5(d) <> 'cc674c8d465961df59048a465b6195ec' THEN
    RAISE EXCEPTION 'P167: fin_documento_registrar não é a medida (md5 %). Nada foi gravado.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_anc1, ''))) / length(v_anc1) <> 1 OR (length(d) - length(replace(d, v_anc2, ''))) / length(v_anc2) <> 1 THEN
    RAISE EXCEPTION 'P167: as âncoras do fin_documento_registrar não casam exatamente 1 vez. Nada foi gravado.';
  END IF;
  EXECUTE replace(replace(d, v_anc1, v_novo1), v_anc2, v_novo2);
END $$;
