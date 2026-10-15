-- FIN-LR-SYNC-01a (Gabriel 15/10/2026) — "Atualizar do Lucro Rural", passo a1: O BANCO COMPARA, SEM GRAVAR LANCAMENTO NENHUM.
-- O front le' os relatorios "contas a pagar/receber unificado" do LR (aba lucrorural) e manda as linhas CRUAS (cabecalhos do LR
-- como chave + `_arquivo`, `_tipo_arquivo`, `_ordem`); a regra mora aqui. fn_lr_sync_comparar devolve, linha a linha, o que
-- aconteceria (situacao, candidato, diferencas, acao padrao) e grava SO' a linha da sessao em lr_sync_sessoes. Aplicar e desfazer
-- sao o passo a2 (lr_vinculos nasce vazia; a comparacao ja' a le^).
-- CHAVE DA CONTA DO LR: tipo(p/r) | Numero | CPF/CNPJ so' digitos | Data Cadastro | aaaa-mm do vencimento; repetida no arquivo
--   desempata por valor (|centavos) e, persistindo, pela ordem (|n). Medido no NJ 14/10: 344 + 11 linhas, chaves unicas.
-- ORDEM DE CASAMENTO (um lancamento casa com UMA linha; desempate estavel; lancamento com PARTE VIVA DE OC nunca e' candidato):
--   1 vinculo pela chave (ignorar = 'ignorada') · 2 direcao + fornecedor + valor ao centavo + vencimento OU pagamento igual ·
--   3 o mesmo com o vencimento no mesmo mes · 3b o mesmo fornecedor no mesmo mes com diferenca de ate' R$ 1,00 (centavos: decidir) ·
--   4 fornecedor (documento, cadastro resolvido ou nome com 2+ palavras em comum fora das genericas) + ocorrencia viva de
--     recorrencia/contrato/financiamento no mes — varias linhas disputando a mesma ocorrencia: fica a de valor MAIS PROXIMO
--     (empate: ordem da chave); as outras seguem o casamento normal · 5 nada = nova (ou da_oc; ou pago_no_lr).
--   FINANCIAMENTO / EMPRESTIMO (financiamentos.natureza <> 'parcelamento') so' casa por vinculo, valor ao centavo + data ou valor
--   ao centavo + mes: fora dos centavos e do valor do mes. Compra parcelada (natureza 'parcelamento') casa como as outras.
--   Linha do LR com Tipo 'Parcela de Financiamento' (pagar ou receber) tambem so' casa por 1–3; sem par = 'decidir' /
--   'financiamento' (nunca 'nova', nunca atualiza parcela). O fornecedor ser credor de financiamento NAO decide nada.
-- Pago no LR com valor diferente do sistema: 'pago_no_lr' com a diferenca de valor preenchida e motivo
--   'pago_no_lr_com_valor_diferente' (o a2 atualiza o valor do mes). 'sem_mudanca' tem acao 'nada', sempre.
-- Classificacao, fornecedor e fazenda do sistema NUNCA viram diferenca a aplicar (vao em `informa`). Pago no LR nunca vira realizado
-- ('pago_no_lr', 'aguardar_extrato'). Fatura de cartao (fornecedor do LR com a palavra cartao/visa/master, ou conta de grupo cartao)
-- = 'decidir' com 'nao_importar_fatura'. Com vinculo, so' o que o LR mudou desde a FOTO e' proposto.
-- lr_vinculos.lancamento_id fica SEM FK, de proposito: uma FK cria gatilhos de integridade em financeiro_lancamentos_v2 (tabela
-- quente). Funcoes novas nascem fechadas; so' fn_lr_sync_comparar ganha EXECUTE para authenticated.
-- GESTO CONTRARIO (escrito, nao executado): DROP das 2 tabelas e das 5 funcoes (nenhum dado de lancamento e' tocado).
SET LOCAL lock_timeout = '2s';

CREATE TABLE public.lr_vinculos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id),
  chave         text NOT NULL,
  lancamento_id uuid,
  ignorar       boolean NOT NULL DEFAULT false,
  foto          jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lr_vinculos_cliente_chave_uq UNIQUE (cliente_id, chave)
);
COMMENT ON TABLE public.lr_vinculos IS
  'FIN-LR-SYNC-01: a conta do Lucro Rural (chave) -> o lancamento do sistema (ou ignorar), com a foto da linha da ultima atualizacao aplicada. Escrita so'' pelas funcoes do LR (passo a2).';
CREATE INDEX idx_lr_vinculos_lancamento ON public.lr_vinculos (lancamento_id);

CREATE TABLE public.lr_sync_sessoes (
  id         uuid PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  arquivos   jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo     jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  status     text NOT NULL DEFAULT 'comparada' CHECK (status IN ('comparada'))
);
COMMENT ON TABLE public.lr_sync_sessoes IS
  'FIN-LR-SYNC-01: uma comparacao com o Lucro Rural (os arquivos e o resumo). Escrita so'' por fn_lr_sync_comparar.';
CREATE INDEX idx_lr_sync_sessoes_cliente ON public.lr_sync_sessoes (cliente_id);

ALTER TABLE public.lr_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lr_sync_sessoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lr_vinculos, public.lr_sync_sessoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lr_vinculos, public.lr_sync_sessoes TO authenticated;
GRANT ALL ON public.lr_vinculos, public.lr_sync_sessoes TO service_role;
CREATE POLICY lr_vinculos_select_tenant ON public.lr_vinculos FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
CREATE POLICY lr_sync_sessoes_select_tenant ON public.lr_sync_sessoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));

-- datas do LR: dd/mm/aaaa (ou ISO); "-" e vazio = nulo
CREATE FUNCTION public._fn_lr_data(p jsonb) RETURNS date LANGUAGE sql STABLE AS $f$
  SELECT CASE
    WHEN btrim(coalesce(p #>> '{}', '')) ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(btrim(p #>> '{}'), 'DD/MM/YYYY')
    WHEN btrim(coalesce(p #>> '{}', '')) ~ '^\d{4}-\d{2}-\d{2}' THEN left(btrim(p #>> '{}'), 10)::date
  END
$f$;
-- valor do LR em centavos inteiros: numero do xlsx ou texto "1.234,56"; nunca arredonda alem do centavo
CREATE FUNCTION public._fn_lr_centavos(p jsonb) RETURNS bigint LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN jsonb_typeof(p) = 'number' THEN round((p #>> '{}')::numeric * 100)::bigint
    WHEN btrim(coalesce(p #>> '{}', '')) ~ '^-?[\d.]*,\d{1,2}$' THEN round(replace(replace(btrim(p #>> '{}'), '.', ''), ',', '.')::numeric * 100)::bigint
    WHEN btrim(coalesce(p #>> '{}', '')) ~ '^-?\d+(\.\d{1,2})?$' THEN round(btrim(p #>> '{}')::numeric * 100)::bigint
  END
$f$;
-- "mesmo fornecedor" pelo nome: 2+ palavras (3+ letras) em comum, fora as genericas
CREATE FUNCTION public._fn_lr_nomes_parecidos(a text, b text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce((SELECT count(DISTINCT w) >= 2
    FROM regexp_split_to_table(coalesce(a, ''), '[^a-z0-9]+') w
   WHERE length(w) >= 3
     AND w NOT IN ('banco', 'brasil', 'companhia', 'seguros', 'distribuidora', 'servicos', 'comercio', 'ltda')
     AND w IN (SELECT x FROM regexp_split_to_table(coalesce(b, ''), '[^a-z0-9]+') x)), false)
$f$;
REVOKE ALL ON FUNCTION public._fn_lr_data(jsonb), public._fn_lr_centavos(jsonb), public._fn_lr_nomes_parecidos(text, text)
  FROM PUBLIC, anon, authenticated;
-- conta bancaria pelo texto do LR ("Banco do Brasil - Pecuaria Ag. 8974 C/C 25367 7"): apelido, agencia + conta, nome; so' 1
CREATE FUNCTION public._fn_lr_conta(p_cliente uuid, p_texto text) RETURNS TABLE(id uuid, origem text, cartao boolean)
LANGUAGE sql STABLE AS $f$
  WITH t AS (SELECT public._fn_normalizar_texto(p_texto) n,
                    ltrim(regexp_replace(coalesce((regexp_match(p_texto, 'Ag\.?\s*([0-9-]+)', 'i'))[1], ''), '\D', '', 'g'), '0') ag,
                    ltrim(regexp_replace(coalesce((regexp_match(p_texto, 'C/?C\.?\s*([0-9 .-]+)$', 'i'))[1], ''), '\D', '', 'g'), '0') cc),
  c AS (SELECT b.id, b.tipo_conta,
               CASE WHEN jsonb_typeof(b.aliases) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(b.aliases) a
                                                                    WHERE public._fn_normalizar_texto(a) = t.n) THEN 1
                    WHEN t.ag <> '' AND t.cc <> ''
                     AND ltrim(regexp_replace(coalesce(b.agencia, ''), '\D', '', 'g'), '0') = t.ag
                     AND ltrim(regexp_replace(coalesce(b.numero_conta, '') || coalesce(b.conta_digito, ''), '\D', '', 'g'), '0') = t.cc THEN 2
                    WHEN public._fn_normalizar_texto(coalesce(b.nome_exibicao, b.nome_conta)) = t.n THEN 3 END tier
          FROM public.financeiro_contas_bancarias b, t
         WHERE b.cliente_id = p_cliente AND coalesce(b.ativa, true) AND t.n IS NOT NULL),
  m AS (SELECT min(tier) tier FROM c WHERE tier IS NOT NULL)
  SELECT c.id, CASE c.tier WHEN 1 THEN 'alias' WHEN 2 THEN 'agencia_conta' ELSE 'cadastro' END, c.tipo_conta = 'cartao'
    FROM c, m WHERE c.tier = m.tier AND (SELECT count(*) FROM c c2 WHERE c2.tier = m.tier) = 1
$f$;
REVOKE ALL ON FUNCTION public._fn_lr_conta(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_lr_sync_comparar(p_cliente uuid, p_sessao uuid, p_linhas jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public SET plan_cache_mode = force_custom_plan AS $f$
DECLARE
  r record; c_id uuid; v_nivel int; v_meses text[]; v_out jsonb; v_res jsonb; v_so jsonb; v_oc jsonb; v_min date; v_max date;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'acesso negado ao cliente' USING errcode = '42501'; END IF;
  IF p_sessao IS NULL OR jsonb_typeof(p_linhas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'sessao e linhas (array) obrigatorias' USING errcode = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.lr_sync_sessoes s WHERE s.id = p_sessao AND s.cliente_id <> p_cliente) THEN
    RAISE EXCEPTION 'acesso negado ao cliente' USING errcode = '42501'; END IF;

  DROP TABLE IF EXISTS pg_temp.lr_l; DROP TABLE IF EXISTS pg_temp.lr_c;
  CREATE TEMP TABLE lr_l ON COMMIT DROP AS
  SELECT o::int ordem, x ->> '_arquivo' arquivo, x ->> '_tipo_arquivo' tipo_arquivo,
         CASE WHEN coalesce(x ->> 'Tipo', '') ILIKE '%receber%' OR x ->> '_tipo_arquivo' = 'receber' THEN 'r' ELSE 'p' END tp,
         btrim(coalesce(x ->> 'Número', '')) numero, regexp_replace(coalesce(x ->> 'CPF/CNPJ', ''), '\D', '', 'g') doc,
         public._fn_lr_data(x -> 'Data Cadastro') cadastro, public._fn_lr_data(x -> 'Data Competência') comp,
         public._fn_lr_data(x -> 'Data Vencimento') venc, public._fn_lr_data(coalesce(x -> 'Data Pagamento', x -> 'Data Recebimento')) pag,
         coalesce(x ->> 'Está Pago?', x ->> 'Está Recebido?', '') ILIKE 'sim' AS pago_txt,
         public._fn_normalizar_texto(x ->> 'Tipo') IS NOT DISTINCT FROM 'parcela de financiamento' AS parc_fin,
         public._fn_lr_centavos(x -> 'Valor') valor_c,
         nullif(nullif(btrim(coalesce(x ->> 'Fornecedor', x ->> 'Cliente', '')), '-'), '') contraparte,
         nullif(nullif(btrim(coalesce(x ->> 'Inscrição Estadual', '')), '-'), '') fazenda_txt, nullif(nullif(btrim(coalesce(x ->> 'Tipo de Contas', '')), '-'), '') tipo_contas,
         nullif(nullif(btrim(coalesce(x ->> 'Safra', '')), '-'), '') safra_txt, nullif(nullif(btrim(coalesce(x ->> 'Conta', '')), '-'), '') conta_txt,
         x AS bruta,
         NULL::text dir, NULL::boolean generico, NULL::boolean pago, NULL::text cnorm, NULL::text chave,
         NULL::uuid forn_id, NULL::text forn_origem, NULL::uuid faz_id, NULL::text faz_origem, NULL::uuid plano_id, NULL::text subcentro,
         NULL::text sub_origem, NULL::uuid safra_id, NULL::uuid conta_id, NULL::text conta_origem, false conta_cartao, false fatura,
         NULL::uuid vinc_lanc, NULL::boolean vinc_ignorar, NULL::jsonb foto, false tem_vinculo,
         NULL::uuid lanc_id, NULL::int nivel, NULL::text situacao, NULL::text acao, NULL::text motivo
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY e(x, o);
  UPDATE lr_l SET dir = CASE tp WHEN 'r' THEN '1-Entradas' ELSE '2-Saídas' END,
         generico = (doc = '' OR doc ~ '^(\d)\1*$' OR doc = '99999999000000'), pago = (pago_txt AND pag IS NOT NULL),
         cnorm = public._fn_normalizar_texto(contraparte),
         chave = tp || '|' || numero || '|' || doc || '|' || coalesce(cadastro::text, '') || '|' || coalesce(to_char(venc, 'YYYY-MM'), '')
   WHERE true;
  UPDATE lr_l l SET chave = l.chave || '|' || l.valor_c FROM (SELECT chave FROM lr_l GROUP BY chave HAVING count(*) > 1) d WHERE d.chave = l.chave;
  UPDATE lr_l l SET chave = l.chave || '|' || d.n
    FROM (SELECT ordem, row_number() OVER (PARTITION BY chave ORDER BY ordem) n, count(*) OVER (PARTITION BY chave) q FROM lr_l) d
   WHERE d.ordem = l.ordem AND d.q > 1;

  UPDATE lr_l l SET forn_id = (SELECT f.id FROM public.financeiro_fornecedores f WHERE f.cliente_id = p_cliente AND coalesce(f.ativo, true)
                    AND regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') = l.doc ORDER BY f.created_at, f.id LIMIT 1)
   WHERE NOT l.generico;
  UPDATE lr_l SET forn_origem = 'documento' WHERE forn_id IS NOT NULL;
  UPDATE lr_l l SET forn_id = d.id, forn_origem = d.origem
    FROM (SELECT s.t, d.id, d.origem FROM (SELECT DISTINCT contraparte t FROM lr_l WHERE forn_id IS NULL AND contraparte IS NOT NULL) s
          CROSS JOIN LATERAL public._fn_classificacao_resolver_fornecedor_det(p_cliente, s.t) d) d
   WHERE l.forn_id IS NULL AND d.t = l.contraparte;
  UPDATE lr_l l SET faz_id = d.id, faz_origem = d.origem
    FROM (SELECT s.t, d.id, d.origem FROM (SELECT DISTINCT fazenda_txt t FROM lr_l WHERE fazenda_txt IS NOT NULL) s
          CROSS JOIN LATERAL public._fn_classificacao_resolver_fazenda_det(p_cliente, s.t) d) d WHERE d.t = l.fazenda_txt;
  UPDATE lr_l l SET plano_id = (d.m ->> 'plano_conta_id')::uuid, subcentro = d.m ->> 'subcentro', sub_origem = d.m ->> 'tier'
    FROM (SELECT s.t, public.fn_classificacao_resolver_contexto(p_cliente, jsonb_build_object('subcentro', s.t, 'safra_texto', NULL), true) m
            FROM (SELECT DISTINCT tipo_contas t FROM lr_l WHERE tipo_contas IS NOT NULL) s) d
   WHERE d.t = l.tipo_contas AND (d.m ->> 'ok')::boolean;
  UPDATE lr_l l SET safra_id = d.id
    FROM (SELECT s.t, d.id FROM (SELECT DISTINCT safra_txt t FROM lr_l WHERE safra_txt IS NOT NULL) s
          CROSS JOIN LATERAL public._fn_classificacao_resolver_safra_det(p_cliente, s.t) d) d WHERE d.t = l.safra_txt;
  UPDATE lr_l l SET conta_id = d.id, conta_origem = d.origem, conta_cartao = d.cartao
    FROM (SELECT s.t, d.* FROM (SELECT DISTINCT conta_txt t FROM lr_l WHERE conta_txt IS NOT NULL) s
          CROSS JOIN LATERAL public._fn_lr_conta(p_cliente, s.t) d) d WHERE d.t = l.conta_txt;
  UPDATE lr_l SET fatura = (coalesce(cnorm, '') ~ '\m(cartao|visa|master|mastercard)\M' OR conta_cartao) WHERE true;
  UPDATE lr_l l SET tem_vinculo = true, vinc_lanc = v.lancamento_id, vinc_ignorar = v.ignorar, foto = v.foto
    FROM public.lr_vinculos v WHERE v.cliente_id = p_cliente AND v.chave = l.chave;

  SELECT min(least(venc, coalesce(pag, venc))) - 40, max(greatest(venc, coalesce(pag, venc))) + 40 INTO v_min, v_max FROM lr_l;
  CREATE TEMP TABLE lr_c ON COMMIT DROP AS
  SELECT f.id, f.tipo_operacao dir, round(abs(f.valor) * 100)::bigint valor_c, f.data_vencimento venc, f.data_pagamento pag,
         f.status_transacao status, f.favorecido_id, regexp_replace(coalesce(fo.cpf_cnpj, ''), '\D', '', 'g') fav_doc,
         public._fn_normalizar_texto(fo.nome) fav_norm, f.recorrencia_id, f.financiamento_id, f.contrato_id,
         (f.recorrencia_id IS NOT NULL OR f.contrato_id IS NOT NULL OR f.financiamento_id IS NOT NULL) serie,
         EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens i WHERE i.lancamento_id = f.id AND i.desfeito_em IS NULL) conciliado,
         f.valor_do_mes_origem, f.fazenda_id, f.plano_conta_id, f.subcentro, f.descricao,
         coalesce(cb.tipo_conta = 'cartao', false) conta_cartao,
         EXISTS (SELECT 1 FROM public.zoo_operacao_partes zp WHERE zp.financeiro_lancamento_id = f.id AND zp.cancelada = false) da_oc,
         false usado
    FROM public.financeiro_lancamentos_v2 f
    LEFT JOIN public.financeiro_fornecedores fo ON fo.id = f.favorecido_id
    LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = public._fn_conta_do_lancamento(f.tipo_operacao, f.conta_bancaria_id, f.conta_destino_id)
   WHERE f.cliente_id = p_cliente AND f.cancelado IS NOT TRUE AND coalesce(f.cenario, 'realizado') <> 'meta'
     AND f.tipo_operacao IN ('1-Entradas', '2-Saídas')
     AND (f.data_vencimento BETWEEN v_min AND v_max OR f.data_pagamento BETWEEN v_min AND v_max
          OR f.id IN (SELECT vinc_lanc FROM lr_l WHERE vinc_lanc IS NOT NULL));

  UPDATE lr_l SET situacao = 'ignorada', nivel = 1, acao = 'nada', motivo = 'vinculo_ignorar' WHERE tem_vinculo AND vinc_ignorar;
  FOR v_nivel IN 1 .. 4 LOOP
    FOR r IN SELECT * FROM lr_l WHERE lanc_id IS NULL AND situacao IS NULL ORDER BY chave LOOP
      c_id := NULL;
      IF v_nivel = 1 THEN
        IF r.tem_vinculo THEN
          SELECT c.id INTO c_id FROM lr_c c WHERE c.id = r.vinc_lanc AND NOT c.usado;
          IF c_id IS NULL THEN UPDATE lr_l SET situacao = 'decidir', nivel = 1, acao = 'decidir', motivo = 'vinculo_sem_lancamento' WHERE ordem = r.ordem; END IF;
        END IF;
      ELSE
        SELECT c.id INTO c_id FROM lr_c c
         WHERE c.dir = r.dir AND NOT c.usado AND NOT c.da_oc
           AND CASE v_nivel
                 WHEN 2 THEN c.valor_c = r.valor_c AND (c.venc = r.venc OR (r.pag IS NOT NULL AND c.pag = r.pag))
                 WHEN 3 THEN c.valor_c = r.valor_c AND date_trunc('month', c.venc) = date_trunc('month', r.venc)
                 ELSE abs(c.valor_c - r.valor_c) BETWEEN 1 AND 100 AND date_trunc('month', c.venc) = date_trunc('month', r.venc)
                      AND NOT r.parc_fin AND NOT EXISTS (SELECT 1 FROM public.financiamentos fx WHERE fx.id = c.financiamento_id AND fx.natureza IS DISTINCT FROM 'parcelamento') END
           AND ((NOT r.generico AND c.fav_doc = r.doc) OR (r.forn_id IS NOT NULL AND c.favorecido_id = r.forn_id)
                OR (r.generico AND public._fn_lr_nomes_parecidos(r.cnorm, c.fav_norm)))
         ORDER BY (c.venc = r.venc) DESC, abs(c.venc - r.venc), abs(c.valor_c - r.valor_c), c.id LIMIT 1;
      END IF;
      IF c_id IS NOT NULL THEN
        UPDATE lr_c SET usado = true WHERE id = c_id;
        UPDATE lr_l SET lanc_id = c_id, nivel = v_nivel WHERE ordem = r.ordem;
      END IF;
    END LOOP;
  END LOOP;
  FOR r IN SELECT l.ordem, c.id AS cid
             FROM lr_l l JOIN lr_c c ON c.dir = l.dir AND NOT c.usado AND NOT c.da_oc AND c.serie AND NOT l.parc_fin
                                     AND NOT EXISTS (SELECT 1 FROM public.financiamentos fx WHERE fx.id = c.financiamento_id AND fx.natureza IS DISTINCT FROM 'parcelamento')
                                     AND date_trunc('month', c.venc) = date_trunc('month', l.venc)
                                     AND ((NOT l.generico AND c.fav_doc = l.doc) OR (l.forn_id IS NOT NULL AND c.favorecido_id = l.forn_id)
                                          OR public._fn_lr_nomes_parecidos(l.cnorm, c.fav_norm))
            WHERE l.lanc_id IS NULL AND l.situacao IS NULL
            ORDER BY abs(c.valor_c - l.valor_c), l.chave, (c.venc = l.venc) DESC, abs(c.venc - l.venc), c.id LOOP
    IF EXISTS (SELECT 1 FROM lr_l WHERE ordem = r.ordem AND lanc_id IS NULL)
       AND EXISTS (SELECT 1 FROM lr_c WHERE id = r.cid AND NOT usado) THEN
      UPDATE lr_c SET usado = true WHERE id = r.cid;
      UPDATE lr_l SET lanc_id = r.cid, nivel = 5 WHERE ordem = r.ordem;
    END IF;
  END LOOP;
  UPDATE lr_l l SET situacao = 'da_oc', acao = 'nada', motivo = 'lancamento_da_oc', lanc_id = NULL
   WHERE l.lanc_id IS NULL AND l.situacao IS NULL AND EXISTS (SELECT 1 FROM lr_c c WHERE c.da_oc AND c.dir = l.dir AND c.valor_c = l.valor_c
     AND date_trunc('month', c.venc) = date_trunc('month', l.venc)
     AND ((NOT l.generico AND c.fav_doc = l.doc) OR (l.forn_id IS NOT NULL AND c.favorecido_id = l.forn_id)));

  UPDATE lr_l l SET situacao = CASE
           WHEN l.fatura OR c.conta_cartao THEN 'decidir'
           WHEN abs(c.valor_c - l.valor_c) BETWEEN 1 AND 100 AND (NOT l.tem_vinculo OR l.valor_c IS DISTINCT FROM public._fn_lr_centavos(l.foto -> 'Valor')) THEN 'decidir'
           WHEN l.pago AND c.status NOT IN ('realizado', 'conciliado') AND NOT c.conciliado THEN 'pago_no_lr'
           WHEN l.tem_vinculo THEN CASE WHEN l.valor_c IS DISTINCT FROM public._fn_lr_centavos(l.foto -> 'Valor')
                                          OR l.venc IS DISTINCT FROM public._fn_lr_data(l.foto -> 'Data Vencimento') THEN 'mudou' ELSE 'sem_mudanca' END
           WHEN c.valor_c <> l.valor_c OR c.venc IS DISTINCT FROM l.venc THEN 'mudou' ELSE 'sem_mudanca' END
    FROM lr_c c WHERE c.id = l.lanc_id AND l.situacao IS NULL;
  UPDATE lr_l l SET acao = CASE
           WHEN l.situacao = 'sem_mudanca' THEN 'nada'
           WHEN l.fatura OR c.conta_cartao THEN 'nao_importar_fatura'
           WHEN abs(c.valor_c - l.valor_c) BETWEEN 1 AND 100 AND (NOT l.tem_vinculo OR l.valor_c IS DISTINCT FROM public._fn_lr_centavos(l.foto -> 'Valor')) THEN 'decidir_centavos'
           WHEN l.pago AND c.status NOT IN ('realizado', 'conciliado') AND NOT c.conciliado THEN 'aguardar_extrato'
           WHEN c.status IN ('realizado', 'conciliado') OR c.conciliado THEN 'manter'
           ELSE 'atualizar' END,
         motivo = CASE WHEN l.fatura OR c.conta_cartao THEN 'fatura_de_cartao'
                       WHEN l.situacao = 'pago_no_lr' AND c.valor_c <> l.valor_c
                        AND (NOT l.tem_vinculo OR l.valor_c IS DISTINCT FROM public._fn_lr_centavos(l.foto -> 'Valor')) THEN 'pago_no_lr_com_valor_diferente'
                       WHEN c.status IN ('realizado', 'conciliado') OR c.conciliado THEN 'ja_realizado'
                       WHEN l.nivel = 5 THEN 'valor_do_mes' WHEN l.nivel = 3 THEN 'vencimento' END
    FROM lr_c c WHERE c.id = l.lanc_id AND l.acao IS NULL;
  UPDATE lr_l SET situacao = 'decidir', acao = 'decidir', motivo = 'financiamento'
   WHERE lanc_id IS NULL AND situacao IS NULL AND parc_fin;
  UPDATE lr_l SET situacao = CASE WHEN fatura THEN 'decidir' WHEN pago THEN 'pago_no_lr' ELSE 'nova' END,
         acao = CASE WHEN fatura THEN 'nao_importar_fatura' WHEN pago THEN 'aguardar_extrato' ELSE 'criar_programada' END,
         motivo = CASE WHEN fatura THEN 'fatura_de_cartao' WHEN pago THEN 'sem_lancamento'
                       WHEN forn_id IS NULL OR faz_id IS NULL OR plano_id IS NULL THEN 'falta_classificar' END
   WHERE lanc_id IS NULL AND situacao IS NULL;

  SELECT array_agg(DISTINCT dir || to_char(venc, 'YYYY-MM')) INTO v_meses FROM lr_l WHERE venc IS NOT NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('lancamento_id', c.id, 'descricao', c.descricao, 'tipo', c.dir, 'valor_c', c.valor_c,
           'vencimento', c.venc, 'status', c.status, 'recorrencia_id', c.recorrencia_id, 'financiamento_id', c.financiamento_id,
           'contrato_id', c.contrato_id, 'valor_do_mes_origem', c.valor_do_mes_origem) ORDER BY c.venc, c.id), '[]'::jsonb) INTO v_so
    FROM lr_c c WHERE NOT c.usado AND NOT c.da_oc AND NOT c.conciliado AND c.status IN ('previsto', 'programado', 'agendado')
     AND c.dir || to_char(c.venc, 'YYYY-MM') = ANY (v_meses);
  SELECT jsonb_build_object('qtde', count(*), 'valor_c', coalesce(sum(c.valor_c), 0)) INTO v_oc
    FROM lr_c c WHERE c.da_oc AND c.status IN ('previsto', 'programado', 'agendado') AND NOT c.conciliado
     AND c.dir || to_char(c.venc, 'YYYY-MM') = ANY (v_meses);
  SELECT jsonb_object_agg(s, jsonb_build_object('qtde', q, 'valor_c', v)) INTO v_res
    FROM (SELECT situacao s, count(*) q, sum(valor_c) v FROM lr_l GROUP BY situacao
          UNION ALL SELECT 'so_no_sistema', jsonb_array_length(v_so), (SELECT coalesce(sum((x ->> 'valor_c')::bigint), 0) FROM jsonb_array_elements(v_so) x)
          UNION ALL SELECT 'da_oc_no_sistema', (v_oc ->> 'qtde')::bigint, (v_oc ->> 'valor_c')::bigint) z;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'chave', l.chave, 'ordem', l.ordem, 'arquivo', l.arquivo, 'tipo', l.tp, 'situacao', l.situacao, 'acao_padrao', l.acao,
           'motivo', l.motivo, 'nivel', l.nivel, 'lancamento_id', l.lanc_id,
           'lr', jsonb_build_object('numero', l.numero, 'valor_c', l.valor_c, 'competencia', l.comp, 'vencimento', l.venc, 'pagamento', l.pag,
                   'cadastro', l.cadastro, 'pago', l.pago, 'documento_generico', l.generico, 'contraparte', l.contraparte,
                   'fazenda', l.fazenda_txt, 'tipo_contas', l.tipo_contas, 'safra', l.safra_txt, 'conta', l.conta_txt),
           'resolvido', jsonb_build_object('fornecedor_id', l.forn_id, 'fornecedor_origem', l.forn_origem, 'fazenda_id', l.faz_id,
                   'fazenda_origem', l.faz_origem, 'plano_conta_id', l.plano_id, 'subcentro', l.subcentro, 'subcentro_origem', l.sub_origem,
                   'safra_id', l.safra_id, 'conta_id', l.conta_id, 'conta_origem', l.conta_origem, 'conta_cartao', l.conta_cartao),
           'lancamento', CASE WHEN c.id IS NOT NULL THEN jsonb_build_object('status', c.status, 'valor_c', c.valor_c, 'vencimento', c.venc,
                   'pagamento', c.pag, 'recorrencia_id', c.recorrencia_id, 'financiamento_id', c.financiamento_id, 'contrato_id', c.contrato_id,
                   'conciliado', c.conciliado, 'valor_do_mes_origem', c.valor_do_mes_origem, 'descricao', c.descricao) END,
           'diferencas', CASE WHEN c.id IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(d), '[]'::jsonb) FROM (
                SELECT jsonb_build_object('campo', 'valor', 'sistema', c.valor_c, 'lr', l.valor_c) d
                 WHERE c.valor_c <> l.valor_c AND (NOT l.tem_vinculo OR l.valor_c IS DISTINCT FROM public._fn_lr_centavos(l.foto -> 'Valor'))
                UNION ALL SELECT jsonb_build_object('campo', 'vencimento', 'sistema', c.venc, 'lr', l.venc)
                 WHERE c.venc IS DISTINCT FROM l.venc AND (NOT l.tem_vinculo OR l.venc IS DISTINCT FROM public._fn_lr_data(l.foto -> 'Data Vencimento'))) z) END,
           'informa', CASE WHEN c.id IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(d), '[]'::jsonb) FROM (
                SELECT jsonb_build_object('campo', 'fazenda', 'sistema', c.fazenda_id, 'lr', l.faz_id) d WHERE c.fazenda_id IS DISTINCT FROM l.faz_id AND l.faz_id IS NOT NULL
                UNION ALL SELECT jsonb_build_object('campo', 'classificacao', 'sistema', c.plano_conta_id, 'lr', l.plano_id) WHERE c.plano_conta_id IS DISTINCT FROM l.plano_id AND l.plano_id IS NOT NULL
                UNION ALL SELECT jsonb_build_object('campo', 'fornecedor', 'sistema', c.favorecido_id, 'lr', l.forn_id) WHERE c.favorecido_id IS DISTINCT FROM l.forn_id AND l.forn_id IS NOT NULL) z) END
         ) ORDER BY l.ordem), '[]'::jsonb) INTO v_out
    FROM lr_l l LEFT JOIN lr_c c ON c.id = l.lanc_id;

  INSERT INTO public.lr_sync_sessoes (id, cliente_id, arquivos, resumo, criado_por, status)
  VALUES (p_sessao, p_cliente,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', a, 'tipo', t, 'linhas', n)), '[]'::jsonb)
             FROM (SELECT arquivo a, tipo_arquivo t, count(*) n FROM lr_l GROUP BY 1, 2) z),
          v_res, auth.uid(), 'comparada')
  ON CONFLICT (id) DO UPDATE SET arquivos = EXCLUDED.arquivos, resumo = EXCLUDED.resumo WHERE lr_sync_sessoes.cliente_id = p_cliente;

  RETURN jsonb_build_object('sessao', p_sessao, 'resumo', coalesce(v_res, '{}'::jsonb), 'linhas', v_out, 'so_no_sistema', v_so, 'da_oc', v_oc);
END
$f$;
REVOKE ALL ON FUNCTION public.fn_lr_sync_comparar(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lr_sync_comparar(uuid, uuid, jsonb) TO authenticated, service_role;
