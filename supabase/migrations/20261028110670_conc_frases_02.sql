-- CONC-FRASES-02 (Gabriel 22/10/2026) — as recusas da conciliacao 1:1, do grupo e do "Casar com o banco" saem em frase pronta (molde da
-- 20261028100800 da OC): portugues com acento, sem nome de funcao nem codigo, valor em R$ 0.000,00, data em dd/mm/aaaa, dizendo O QUE
-- travou (data, descricao, R$) e O CAMINHO. Os ERRCODE nao mudam; o id que trava vai no DETAIL; os dados da linha (JSON) no HINT.
--   · `fn_vincular_extrato_lancamento` (1:1) e `fn_vincular_grupo_conciliacao` (grupo): cada RAISE trocado (guardado pelo md5 de origem);
--   · `fn_espelho_casar` / `fn_espelho_casar_n1` ("Casar com o banco"): devolvem `ok:false` com codigo; cada recusa ganha `frase`
--     (`_fn_conc_frase_casar`) — a tela usa a frase e cai no rotulo antigo so' se ela faltar.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'CONC-FRASES-02: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'CONC-FRASES-02: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ── auxiliares de texto ──────────────────────────────────────────────────────────────────────────────────────────────
-- '"Venda 118 Vacas - 2/2" (30/07/2026, R$ 375.000,00)'
CREATE OR REPLACE FUNCTION public._fn_conc_lanc_txt(p uuid) RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT coalesce((SELECT format('"%s" (%s, %s)', coalesce(nullif(btrim(l.descricao), ''), 'sem descrição'),
                    coalesce(to_char(coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), 'DD/MM/YYYY'), 'sem data'),
                    public._fn_conc_brl(l.valor))
                     FROM public.financeiro_lancamentos_v2 l WHERE l.id = p), 'escolhido')
$$;
-- 'O movimento do banco de 30/06/2026 (R$ 375.000,00)'
CREATE OR REPLACE FUNCTION public._fn_conc_ext_txt(p uuid) RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT coalesce((SELECT format('O movimento do banco de %s (%s)', to_char(e.data_movimento, 'DD/MM/YYYY'), public._fn_conc_brl(e.valor))
                     FROM public.extrato_bancario_v2 e WHERE e.id = p), 'O movimento do banco escolhido')
$$;
CREATE OR REPLACE FUNCTION public._fn_conc_conta_txt(p uuid) RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT coalesce((SELECT coalesce(nullif(c.nome_exibicao, ''), c.nome_conta) FROM public.financeiro_contas_bancarias c WHERE c.id = p),
                  'sem conta')
$$;
-- '2026-06' -> 'Junho/2026'
CREATE OR REPLACE FUNCTION public._fn_conc_mes_txt(p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p IS NULL OR length(p) < 7 THEN 'O mês' ELSE
    (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])
      [substring(p, 6, 2)::int] || '/' || substring(p, 1, 4) END
$$;
-- o que a tela mostra na linha do lancamento que trava (HINT)
CREATE OR REPLACE FUNCTION public._fn_conc_lanc_hint(p uuid) RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao,
           'data', coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), 'valor', abs(l.valor), 'status', l.status_transacao,
           'conta', public._fn_conc_conta_txt(coalesce(l.conta_efetiva_id, l.conta_bancaria_id)))::text
    FROM public.financeiro_lancamentos_v2 l WHERE l.id = p
$$;
CREATE OR REPLACE FUNCTION public._fn_conc_fazenda_txt(p uuid) RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT coalesce((SELECT f.nome FROM public.fazendas f WHERE f.id = p), 'esta fazenda')
$$;

-- ═══════════════════ 1:1 ═══════════════════
SELECT pg_temp._trocar('public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure, '9f8f50c1d9245f30a7ccefb604dd4128', ARRAY[
  $a$RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';$a$,
  $a$RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a esta conta.', DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION 'extrato nao encontrado: %', p_extrato_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = 'O movimento do banco escolhido não existe mais (foi excluído ou reimportado). Atualize a tela e escolha de novo.', DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION 'lancamento nao encontrado: %', p_lancamento_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = 'O lançamento escolhido não existe mais. Atualize a tela e escolha de novo.', DETAIL = p_lancamento_id::text;$a$,
  $a$RAISE EXCEPTION 'lancamento cancelado nao pode ser vinculado: %', p_lancamento_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s está cancelado e não pode ser ligado. Reative-o no Financeiro ou escolha outro.', public._fn_conc_lanc_txt(p_lancamento_id)),
      DETAIL = p_lancamento_id::text, HINT = public._fn_conc_lanc_hint(p_lancamento_id);$a$,
  $a$RAISE EXCEPTION 'cliente divergente: extrato=% lancamento=%', v_ext.cliente_id, v_lan.cliente_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s é de outro cliente. Escolha um lançamento do mesmo cliente do extrato.', public._fn_conc_lanc_txt(p_lancamento_id)),
      DETAIL = p_lancamento_id::text;$a$,
  $a$RAISE EXCEPTION 'competencia % em mes fechado: vinculo bloqueado', v_lan.ano_mes;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('%s está fechado no Financeiro para %s (competência do lançamento %s). Reabra o mês para ligar.',
        public._fn_conc_mes_txt(v_lan.ano_mes), public._fn_conc_fazenda_txt(v_lan.fazenda_id), public._fn_conc_lanc_txt(p_lancamento_id)),
      DETAIL = p_lancamento_id::text, HINT = public._fn_conc_lanc_hint(p_lancamento_id);$a$,
  $a$RAISE EXCEPTION 'extrato ja possui vinculo ativo: %', p_extrato_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('%s já está ligado a outro lançamento. Desfaça aquela ligação na linha do extrato antes, ou ligue os dois juntos num grupo.', public._fn_conc_ext_txt(p_extrato_id)),
      DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION 'lancamento ja possui vinculo ativo: %', p_lancamento_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s já está ligado a outro movimento do banco. Desfaça aquela ligação antes.', public._fn_conc_lanc_txt(p_lancamento_id)),
      DETAIL = p_lancamento_id::text, HINT = public._fn_conc_lanc_hint(p_lancamento_id);$a$,
  $a$RAISE EXCEPTION 'dupla ponta so vale para a ponta de uma transferencia: %', p_lancamento_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s não é transferência entre contas: a ligação nas duas pontas só vale para transferência.', public._fn_conc_lanc_txt(p_lancamento_id)),
      DETAIL = p_lancamento_id::text, HINT = public._fn_conc_lanc_hint(p_lancamento_id);$a$,
  $a$RAISE EXCEPTION 'vinculo ativo duplicado para o par';$a$,
  $a$RAISE EXCEPTION USING MESSAGE = 'Este movimento do banco e este lançamento já estão ligados.', DETAIL = p_lancamento_id::text;$a$,
  $a$RAISE EXCEPTION 'conta do lancamento (%) difere da conta do extrato (%): vinculo bloqueado',
      v_lan.conta_bancaria_id, v_ext.conta_bancaria_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s é da conta %s e o movimento do banco é da conta %s. Corrija a conta do lançamento no Financeiro ou escolha um movimento da conta certa.',
        public._fn_conc_lanc_txt(p_lancamento_id), public._fn_conc_conta_txt(v_lan.conta_bancaria_id), public._fn_conc_conta_txt(v_ext.conta_bancaria_id)),
      DETAIL = p_lancamento_id::text, HINT = public._fn_conc_lanc_hint(p_lancamento_id);$a$,
  $a$RAISE EXCEPTION 'sobre_aplicacao: valor (%) excede o aberto do movimento', v_valor;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O valor a ligar (%s) passa do que ainda falta ligar em %s. Ligue no máximo o que falta, ou use "Ligar com a diferença".',
        public._fn_conc_brl(v_valor), lower(left(public._fn_conc_ext_txt(p_extrato_id), 1)) || substring(public._fn_conc_ext_txt(p_extrato_id) from 2)),
      DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION '%', CASE WHEN EXISTS$a$,
  $a$RAISE EXCEPTION USING MESSAGE = CASE WHEN EXISTS$a$,
  $a$                    public._fn_oc_brl(v_valor), public._fn_oc_brl(abs(v_lan.valor) - public._fn_lancamento_aplicado_vivo(p_lancamento_id))) END
      USING ERRCODE = 'P0001', DETAIL = p_lancamento_id::text;$a$,
  $a$                    public._fn_oc_brl(v_valor), public._fn_oc_brl(abs(v_lan.valor) - public._fn_lancamento_aplicado_vivo(p_lancamento_id))) END,
      ERRCODE = 'P0001', DETAIL = p_lancamento_id::text, HINT = public._fn_conc_lanc_hint(p_lancamento_id);$a$
]);

-- ═══════════════════ GRUPO ═══════════════════
SELECT pg_temp._trocar('public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure, 'e7fa603e8aaf0e96180e6994535a9da7', ARRAY[
  $a$RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';$a$,
  $a$RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a esta conta.', DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION 'extrato_nao_encontrado: %', p_extrato_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = 'O movimento do banco escolhido não existe mais (foi excluído ou reimportado). Atualize a tela e escolha de novo.', DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION 'array_vazio: grupo exige >= 2 lancamentos (recebidos: %)', v_n;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O grupo precisa de pelo menos dois lançamentos (veio %s). Para um lançamento só, ligue direto.', coalesce(v_n, 0)),
      DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION 'valores_len_diverge: % valores para % lancamentos', array_length(p_valores, 1), v_n;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('Vieram %s valores para %s lançamentos: cada lançamento do grupo precisa do seu valor. Atualize a tela e marque de novo.',
        coalesce(array_length(p_valores, 1), 0), coalesce(v_n, 0)), DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION 'membro_repetido: lancamento_id duplicado no array';$a$,
  $a$RAISE EXCEPTION USING MESSAGE = 'O mesmo lançamento foi marcado duas vezes no grupo. Desmarque o repetido.', DETAIL = p_extrato_id::text;$a$,
  $a$RAISE EXCEPTION 'lancamento_nao_encontrado: %', v_lanc;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = 'Um dos lançamentos do grupo não existe mais. Atualize a tela e marque de novo.', DETAIL = v_lanc::text;$a$,
  $a$RAISE EXCEPTION 'lancamento_cancelado: %', v_lanc;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s está cancelado e não entra no grupo. Reative-o no Financeiro ou tire-o do grupo.', public._fn_conc_lanc_txt(v_lanc)),
      DETAIL = v_lanc::text, HINT = public._fn_conc_lanc_hint(v_lanc);$a$,
  $a$RAISE EXCEPTION 'cliente_divergente: extrato=% lancamento=%', v_ext.cliente_id, v_lan.cliente_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s é de outro cliente. Tire-o do grupo.', public._fn_conc_lanc_txt(v_lanc)),
      DETAIL = v_lanc::text;$a$,
  $a$RAISE EXCEPTION 'mes_fechado: %', v_lan.ano_mes;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('%s está fechado no Financeiro para %s (competência do lançamento %s). Reabra o mês para ligar.',
        public._fn_conc_mes_txt(v_lan.ano_mes), public._fn_conc_fazenda_txt(v_lan.fazenda_id), public._fn_conc_lanc_txt(v_lanc)),
      DETAIL = v_lanc::text, HINT = public._fn_conc_lanc_hint(v_lanc);$a$,
  $a$RAISE EXCEPTION 'lancamento_ja_vinculado: %', v_lanc;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s já está ligado a outro movimento do banco. Desfaça aquela ligação ou tire-o do grupo.', public._fn_conc_lanc_txt(v_lanc)),
      DETAIL = v_lanc::text, HINT = public._fn_conc_lanc_hint(v_lanc);$a$,
  $a$RAISE EXCEPTION 'par_duplicado: % / %', p_extrato_id, v_lanc;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s já está ligado a este movimento do banco.', public._fn_conc_lanc_txt(v_lanc)),
      DETAIL = v_lanc::text, HINT = public._fn_conc_lanc_hint(v_lanc);$a$,
  $a$RAISE EXCEPTION 'conta_incompativel: lanc=% ext=%', v_lan.conta_bancaria_id, v_ext.conta_bancaria_id;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('O lançamento %s é da conta %s e o movimento do banco é da conta %s. Corrija a conta do lançamento no Financeiro ou tire-o do grupo.',
        public._fn_conc_lanc_txt(v_lanc), public._fn_conc_conta_txt(v_lan.conta_bancaria_id), public._fn_conc_conta_txt(v_ext.conta_bancaria_id)),
      DETAIL = v_lanc::text, HINT = public._fn_conc_lanc_hint(v_lanc);$a$,
  $a$RAISE EXCEPTION 'soma_diverge: total_aplicado=% ofx=%', v_total, v_ext.valor;$a$,
  $a$RAISE EXCEPTION USING MESSAGE = format('Os lançamentos do grupo somam %s e o movimento do banco é de %s (diferença de %s). Ajuste os valores ou use "Ligar com a diferença".',
        public._fn_conc_brl(v_total), public._fn_conc_brl(v_ext.valor), public._fn_conc_brl(abs(v_ext.valor) - v_total)),
      DETAIL = p_extrato_id::text;$a$
]);

REVOKE ALL ON FUNCTION public._fn_conc_lanc_txt(uuid), public._fn_conc_ext_txt(uuid), public._fn_conc_conta_txt(uuid), public._fn_conc_lanc_hint(uuid),
  public._fn_conc_fazenda_txt(uuid) FROM PUBLIC, anon;

DO $confere$
BEGIN
  IF position('Você não tem acesso a esta conta' in pg_get_functiondef('public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure)) = 0
     OR position('O grupo precisa de pelo menos dois' in pg_get_functiondef('public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONC-FRASES-02: conferencia final falhou';
  END IF;
END $confere$;
