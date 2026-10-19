-- FIN-DOC-SOMA-02a (Gabriel 19/10/2026) — separar a nota REPETIDA da mesma nota vista por dois caminhos, em `fin_documento_confronto`:
--   (C) o MESMO registro (mesmo id) que a view mostra duas vezes conta uma vez e nunca e' "repetido";
--   (B) a nota que esta' uma vez na OC e uma no lancamento (duas linhas, o mesmo documento) conta uma vez e volta em `repetidas` com
--       tipo 'oc_e_lancamento' — a tela diz "mesma nota X na OC e no lancamento", sem mandar cancelar (cancelar pelo lancamento a linha
--       da OC cancela NA OC; a licao do DOC-CANCELAR-OC-01);
--   (A) duas linhas do mesmo caminho seguem 'duplicada' ("registrada N vezes — cancele uma").
-- Nenhum dado muda. Corpo inteiro trocado, guardado por md5 (origem c2d38043…, destino 3ecc89177e987223808fd55751a44d41); assinatura, SECURITY DEFINER,
-- search_path e ACL preservados pelo pg_get_functiondef.
set local lock_timeout = '2s';

DO $patch$
declare
  c_origem  constant text := 'c2d3804354563133e3fec46df7f1913a';
  c_destino constant text := '3ecc89177e987223808fd55751a44d41';
  v_oid oid := 'public.fin_documento_confronto(uuid, uuid)'::regprocedure;
  v_src text; v_acl text; v_def boolean;
  v_novo constant text := $corpo$
DECLARE
  v_actor uuid := auth.uid();
  v_valor numeric;
  v_docs jsonb := '[]'::jsonb;
  v_fiscal_total numeric := 0; v_fiscal_n int := 0;
  v_prop_total numeric := 0; v_prop_n int := 0;
  v_comp_total numeric := 0; v_comp_n int := 0;
  v_grupo_soma numeric; v_grupo_qtd int;
  v_contrato uuid; v_contrato_soma numeric; v_contrato_qtd int;
  v_base text; v_base_valor numeric; v_base_qtd int;
  v_dif numeric; v_situacao text;
  v_pag jsonb := '[]'::jsonb; v_pag_n int := 0; v_pag_ok boolean := true;
  v_rep jsonb := '[]'::jsonb;
  v_info int := 0; v_ativos int := 0; v_recibos int := 0;
  v_tem_valor boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: sessao sem usuario' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;

  SELECT l.valor INTO v_valor FROM public.financeiro_lancamentos_v2 l
   WHERE l.id = p_lancamento_id AND l.cliente_id = p_cliente_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  /* FIN-DOC-SOMA-01 (Gabriel 19/10/2026) — UM dono do confronto, sobre as DUAS origens (a view `vw_lancamento_documentos`:
     os documentos do lancamento e os da OC; o valor da OC ja' vem pela regra da OC, `_oc_documento_soma_no_valor`).
       FISCAL (Nota fiscal, Recibo; na OC, o documento que soma no valor dela): soma e forma o "Documentado";
       PAGAMENTO (Boleto, Comprovante): nao soma; cada um e' conferido contra o valor do lancamento;
       INFORMATIVO ("Outro"; na OC, o que nao soma): nao soma e nao confere.
     A NOTA REPETIDA (mesmo numero so' com digitos, sem zeros a' esquerda, + CNPJ do emitente — ou a mesma chave) conta UMA vez e
     e' devolvida em `repetidas`. A BASE da nota: a compartilhada (ligada a outras parcelas) contra a soma dos lancamentos ATIVOS
     do grupo; a propria de um lancamento que e' parcela de contrato e NAO esta' ligada as outras parcelas, contra a soma das
     parcelas vivas do contrato (todas, pagas ou nao); senao, contra o lancamento. */
  WITH d AS (
    /* FIN-DOC-SOMA-02a — o MESMO registro (mesmo id) visto por dois caminhos da view (ex.: a OC com duas partes no lancamento) conta
       uma vez e nunca e' "repetido" */
    SELECT DISTINCT ON (v.documento_id) v.documento_id, v.origem, v.especie, v.valor_documento AS valor, v.numero, v.chave_acesso, v.emitente_id,
           CASE WHEN v.especie IN ('nf', 'nf_principal', 'nf_complementar') THEN 'nf' ELSE v.especie END AS classe,
           EXISTS (SELECT 1 FROM public.financeiro_documento_vinculos x WHERE x.documento_id = v.documento_id) AS compartilhado,
           CASE
             WHEN v.origem = 'lancamento' AND v.especie IN ('nf', 'recibo') THEN 'fiscal'
             WHEN v.origem = 'lancamento' AND v.especie IN ('boleto', 'comprovante') THEN 'pagamento'
             WHEN v.origem = 'operacao' AND coalesce(v.valor_documento, 0) <> 0 THEN 'fiscal'
             ELSE 'informativo'
           END AS papel,
           nullif(ltrim(regexp_replace(coalesce(v.numero, ''), '\D', '', 'g'), '0'), '') AS num,
           CASE WHEN length(regexp_replace(coalesce(v.chave_acesso, ''), '\D', '', 'g')) = 44
                THEN regexp_replace(v.chave_acesso, '\D', '', 'g') END AS chave,
           coalesce(nullif(regexp_replace(coalesce(v.emitente_documento, ''), '\D', '', 'g'), ''),
                    CASE WHEN length(regexp_replace(coalesce(v.chave_acesso, ''), '\D', '', 'g')) = 44
                         THEN substr(regexp_replace(v.chave_acesso, '\D', '', 'g'), 7, 14) END) AS cnpj
      FROM public.vw_lancamento_documentos v
     WHERE v.lancamento_id = p_lancamento_id AND v.cliente_id = p_cliente_id AND v.cancelado IS NOT TRUE
     ORDER BY v.documento_id
  ), d2 AS (
    /* a copia sem CNPJ herda o CNPJ das outras de MESMO numero e mesma classe (nota com nota, recibo com recibo) quando ele e'
       unico entre elas e o emitente cadastrado nao contradiz (ex.: "233089" sem chave e "000.233.089" com a chave — a mesma nota
       registrada duas vezes); emitente cadastrado diferente nao herda */
    SELECT d.documento_id, d.origem, d.especie, d.valor, d.numero, d.chave_acesso, d.compartilhado, d.papel, d.num, d.chave,
           d.classe, d.emitente_id,
           coalesce(d.cnpj, CASE WHEN min(d.cnpj) OVER w = max(d.cnpj) OVER w
                                  AND (d.emitente_id IS NULL
                                       OR coalesce(min(d.emitente_id::text) FILTER (WHERE d.cnpj IS NOT NULL) OVER w, d.emitente_id::text)
                                            = d.emitente_id::text
                                      AND coalesce(max(d.emitente_id::text) FILTER (WHERE d.cnpj IS NOT NULL) OVER w, d.emitente_id::text)
                                            = d.emitente_id::text)
                                 THEN min(d.cnpj) OVER w END) AS cnpj
      FROM d WINDOW w AS (PARTITION BY d.papel, d.classe, d.num)
  ), k AS (
    SELECT d2.*, CASE WHEN d2.num IS NOT NULL THEN 'n:' || d2.classe || ':' || d2.num || '|' || coalesce(d2.cnpj, 'e:' || d2.emitente_id::text, '')
                     WHEN d2.chave IS NOT NULL THEN 'c:' || d2.chave
                     ELSE 'i:' || d2.documento_id::text END AS chave_nota
      FROM d2
  ), r AS (
    /* conta a primeira: a que tem valor, a compartilhada, a da OC (o valor dela vem pela regra da OC) */
    SELECT k.*, row_number() OVER (PARTITION BY k.papel, k.chave_nota
                                   ORDER BY (k.valor IS NULL), k.compartilhado DESC, (k.origem = 'operacao') DESC, k.documento_id) AS ordem,
           count(*) OVER (PARTITION BY k.papel, k.chave_nota) AS vezes,
           count(*) OVER (PARTITION BY k.papel, k.chave_nota, k.origem) AS vezes_origem
      FROM k
  ), r2 AS (
    /* FIN-DOC-SOMA-02a — a repeticao so' e' DUPLICADA quando o mesmo caminho (lancamento com lancamento, OC com OC) tem a nota mais de
       uma vez; a nota que esta' uma vez na OC e uma no lancamento e' a MESMA nota vista dos dois lados ('oc_e_lancamento') */
    SELECT r.*, max(r.vezes_origem) OVER (PARTITION BY r.papel, r.chave_nota) AS maior_origem FROM r
  )
  SELECT coalesce(jsonb_agg(to_jsonb(r2)), '[]'::jsonb) INTO v_docs FROM r2;

  SELECT count(*) INTO v_ativos FROM jsonb_array_elements(v_docs);
  SELECT count(*) INTO v_info FROM jsonb_array_elements(v_docs) e WHERE e->>'papel' = 'informativo';

  /* repetidas: a nota fiscal registrada mais de uma vez — conta uma, e a faixa avisa (nunca cancela sozinha) */
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('numero', coalesce(e->>'num', e->>'chave'), 'vezes', (e->>'vezes')::int,
           'tipo', CASE WHEN (e->>'maior_origem')::int > 1 THEN 'duplicada' ELSE 'oc_e_lancamento' END)), '[]'::jsonb)
    INTO v_rep FROM jsonb_array_elements(v_docs) e WHERE e->>'papel' = 'fiscal' AND (e->>'vezes')::int > 1;

  /* fiscais contados UMA vez por nota, separados em proprios e compartilhados */
  SELECT coalesce(sum((e->>'valor')::numeric) FILTER (WHERE NOT (e->>'compartilhado')::boolean), 0),
         count(e->>'valor') FILTER (WHERE NOT (e->>'compartilhado')::boolean),
         coalesce(sum((e->>'valor')::numeric) FILTER (WHERE (e->>'compartilhado')::boolean), 0),
         count(e->>'valor') FILTER (WHERE (e->>'compartilhado')::boolean),
         count(e->>'valor') FILTER (WHERE e->>'classe' = 'recibo')
    INTO v_prop_total, v_prop_n, v_comp_total, v_comp_n, v_recibos
    FROM jsonb_array_elements(v_docs) e
   WHERE e->>'papel' = 'fiscal' AND (e->>'ordem')::int = 1;
  v_fiscal_total := v_prop_total + v_comp_total; v_fiscal_n := v_prop_n + v_comp_n;

  IF v_comp_n > 0 THEN
    SELECT coalesce(sum(l.valor), 0), count(*) INTO v_grupo_soma, v_grupo_qtd
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente_id AND coalesce(l.cancelado, false) = false
       AND l.id IN (SELECT x.lancamento_id FROM public.financeiro_lancamento_documentos x
                     WHERE x.id IN (SELECT (e->>'documento_id')::uuid FROM jsonb_array_elements(v_docs) e WHERE (e->>'compartilhado')::boolean)
                    UNION
                    SELECT v.lancamento_id FROM public.financeiro_documento_vinculos v
                     WHERE v.documento_id IN (SELECT (e->>'documento_id')::uuid FROM jsonb_array_elements(v_docs) e WHERE (e->>'compartilhado')::boolean));
  END IF;

  IF v_prop_n > 0 THEN
    SELECT fp.financiamento_id INTO v_contrato FROM public.financiamento_parcelas fp
     WHERE (fp.lancamento_id = p_lancamento_id OR fp.lancamento_juros_id = p_lancamento_id) AND fp.status <> 'cancelado'
     ORDER BY fp.numero_parcela LIMIT 1;
    IF v_contrato IS NOT NULL THEN
      SELECT coalesce(sum(fp.valor_total), 0), count(*) INTO v_contrato_soma, v_contrato_qtd
        FROM public.financiamento_parcelas fp WHERE fp.financiamento_id = v_contrato AND fp.status <> 'cancelado';
    END IF;
  END IF;

  IF v_fiscal_n = 0 THEN
    v_base := NULL; v_dif := NULL; v_situacao := NULL;
  ELSIF v_comp_n > 0 AND v_prop_n = 0 THEN
    v_base := 'grupo'; v_base_valor := v_grupo_soma; v_base_qtd := v_grupo_qtd; v_dif := v_comp_total - v_grupo_soma;
  ELSIF v_comp_n > 0 THEN
    v_base := 'grupo'; v_base_valor := v_grupo_soma; v_base_qtd := v_grupo_qtd;
    v_dif := (v_prop_total - coalesce(v_valor, 0)) + (v_comp_total - v_grupo_soma);
  ELSIF v_contrato IS NOT NULL AND abs(v_prop_total - coalesce(v_valor, 0)) > 0.01 THEN
    /* a nota que ja' fecha com o proprio lancamento e' a nota DESTA parcela (ex.: 8 x 3.006,50, uma NF de 3.006,50 por mes):
       continua contra o lancamento; so' a que nao fecha com ele e' comparada com o contrato */
    v_base := 'contrato'; v_base_valor := v_contrato_soma; v_base_qtd := v_contrato_qtd; v_dif := v_prop_total - v_contrato_soma;
  ELSE
    v_base := 'lancamento'; v_base_valor := v_valor; v_base_qtd := 1; v_dif := v_prop_total - coalesce(v_valor, 0);
  END IF;
  IF v_dif IS NOT NULL THEN
    v_dif := round(v_dif, 2);
    v_situacao := CASE WHEN abs(v_dif) <= 0.01 THEN 'fecha' WHEN v_dif < 0 THEN 'falta' ELSE 'passa' END;
  END IF;

  /* pagamentos: cada um contra o valor do lancamento */
  SELECT coalesce(jsonb_agg(jsonb_build_object('documento_id', e->>'documento_id', 'especie', e->>'especie', 'numero', e->>'numero',
           'valor', (e->>'valor')::numeric, 'diferenca', round((e->>'valor')::numeric - coalesce(v_valor, 0), 2),
           'confere', abs((e->>'valor')::numeric - coalesce(v_valor, 0)) <= 0.01) ORDER BY e->>'especie', e->>'documento_id'), '[]'::jsonb),
         count(*), coalesce(bool_and(abs((e->>'valor')::numeric - coalesce(v_valor, 0)) <= 0.01), true)
    INTO v_pag, v_pag_n, v_pag_ok
    FROM jsonb_array_elements(v_docs) e WHERE e->>'papel' = 'pagamento' AND e->>'valor' IS NOT NULL;

  v_tem_valor := (v_fiscal_n + v_pag_n) > 0;

  RETURN jsonb_build_object(
    'valor_lancamento',  v_valor,
    'valor_documentado', v_fiscal_total,
    'docs_ativos',       v_ativos,
    'docs_com_valor',    v_fiscal_n + v_pag_n,
    'diferenca',         coalesce(v_dif, 0),
    'confere',           v_tem_valor AND coalesce(v_situacao = 'fecha', true) AND v_pag_ok,
    'fiscal',            CASE WHEN v_fiscal_n = 0 THEN NULL ELSE jsonb_build_object('total', v_fiscal_total, 'qtd', v_fiscal_n, 'base', v_base,
                           'base_valor', v_base_valor, 'base_qtd', v_base_qtd, 'diferenca', v_dif, 'situacao', v_situacao,
                           'recibos', v_recibos) END,
    'pagamentos',        v_pag,
    'informativos',      v_info,
    'repetidas',         v_rep)
    || CASE WHEN v_comp_n > 0 THEN jsonb_build_object('grupo_valor_documento', v_comp_total, 'grupo_soma_lancamentos', v_grupo_soma,
                                                      'grupo_qtd', v_grupo_qtd) ELSE '{}'::jsonb END;
END 
$corpo$;
begin
  select prosrc, proacl::text, prosecdef into v_src, v_acl, v_def from pg_proc where oid = v_oid;
  if md5(v_src) is distinct from c_origem then
    raise exception 'fin_documento_confronto: origem % (esperado %)', md5(v_src), c_origem;
  end if;
  if md5(v_novo) is distinct from c_destino then raise exception 'fin_documento_confronto: corpo novo diferente do destino'; end if;
  if position(v_src in pg_get_functiondef(v_oid)) = 0 then raise exception 'corpo nao achado na definicao'; end if;
  execute replace(pg_get_functiondef(v_oid), v_src, v_novo);
  if (select md5(prosrc) from pg_proc where oid = v_oid) is distinct from c_destino
     or (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl
     or (select prosecdef from pg_proc where oid = v_oid) is distinct from v_def then
    raise exception 'fin_documento_confronto: gravado diferente do destino, ou ACL/SECURITY mudou';
  end if;
end
$patch$;
