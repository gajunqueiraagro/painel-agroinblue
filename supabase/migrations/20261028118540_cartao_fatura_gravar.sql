-- CARTAO-FATURA-GRAVAR (CARTAO-FATURA-IMPORT-01 entrega 2; Gabriel 24/11 09:27 "tudo como recomendado": D1 a · D2 a · D3 · D4 · D5 · D6 fora).
-- "Gravar N com prévia": UMA fatura do cartão = UMA gravação, com prévia (p_simular), trilha (antes/depois de cada linha) e desfazer.
-- Molde: `fn_lancamentos_trocar_favorecido` / `_desfazer` (FORN-TROCAR-LOTE-01).
--   `fatura_cartao_gravacoes`: a fatura gravada (cliente, cartão, hash do PDF, vencimento...). Viva = uma por (cliente, cartão, hash): gravar
--     de novo a MESMA fatura (as linhas que ficaram para depois, D2) entra NA MESMA gravação; desfeita, a próxima abre outra.
--   `fatura_cartao_gravacao_itens`: uma linha por linha da fatura gravada (ordem no PDF, gesto, lançamento, antes/depois).
--   `fn_fatura_cartao_gravar(cliente, cartão, fatura, itens, simular)` — TUDO OU NADA:
--     lancar  = INSERT de saída (ou entrada, o estorno) no cartão: `programado`, vencimento = o da fatura, competência = a data da compra,
--               sem pagamento, `origem_lancamento = 'cartao_fatura'`; conta do plano e fazenda OBRIGATÓRIAS (D1/D2: a tela completa antes).
--     mover   = conta → o cartão e vencimento → o da fatura (com `valor` na linha, ajusta junto — D4).
--     ajustar = valor → o da fatura (a parcela com elo acompanha pelo gatilho de hoje).
--     mover/ajustar só NÃO realizado/conciliado/agendado, NÃO casado com extrato, sem OC viva, sem pagamento no banco, mês aberto e SEM
--     MUDANÇA desde a leitura (`lido_em` = o `updated_at` lido, ao milissegundo) — D3; o resto é "resolva no Editar".
--     Toda linha é conferida ANTES; a recusa vem POR LINHA, com frase. Recusa do banco (gatilho) também vem na linha. Uma recusa = nada grava.
--     A simulação faz tudo e desfaz (é a prévia).
--   `fn_fatura_cartao_desfazer(gravação, motivo, simular)`: cancela os criados ("fatura desfeita"), devolve conta/vencimento/valor dos
--     movidos/ajustados pelo `antes`; a linha que MUDOU depois da gravação (ou casada com extrato) FICA e é listada — nunca por cima.
-- SECURITY DEFINER com `tenant_ok` (42501); REVOKE de PUBLIC/anon; EXECUTE para `authenticated`. Tabelas: só leitura por tenant.
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.fatura_cartao_gravacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  conta_bancaria_id uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id),
  hash_arquivo text NOT NULL,
  arquivo_nome text,
  final_cartao text,
  fechamento date,
  vencimento date NOT NULL,
  total numeric(14,2),
  motivo text NOT NULL,
  feita_em timestamptz NOT NULL DEFAULT now(),
  feita_por uuid DEFAULT auth.uid(),
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text,
  CONSTRAINT fcg_desfeita_coerente CHECK ((desfeita_em IS NULL) = (desfeita_motivo IS NULL)),
  CONSTRAINT fcg_hash_preenchido CHECK (btrim(hash_arquivo) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fcg_fatura_viva ON public.fatura_cartao_gravacoes (cliente_id, conta_bancaria_id, hash_arquivo)
  WHERE desfeita_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_fcg_cliente ON public.fatura_cartao_gravacoes (cliente_id, feita_em DESC);

CREATE TABLE IF NOT EXISTS public.fatura_cartao_gravacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gravacao_id uuid NOT NULL REFERENCES public.fatura_cartao_gravacoes(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  ordem int NOT NULL,
  gesto text NOT NULL,
  lancamento_id uuid NOT NULL REFERENCES public.financeiro_lancamentos_v2(id),
  -- a linha da fatura como veio da tela (data, descrição, valor...)
  linha jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {conta_bancaria_id, data_vencimento, valor, status_transacao, forma_pagamento, vencimento_origem, editado_manual, cancelado, updated_at}
  antes jsonb,
  depois jsonb NOT NULL,
  gravado_em timestamptz NOT NULL DEFAULT now(),
  gravado_por uuid DEFAULT auth.uid(),
  desfeito_em timestamptz,
  ficou_motivo text,
  CONSTRAINT fcgi_gesto CHECK (gesto IN ('lancar', 'mover', 'ajustar')),
  CONSTRAINT fcgi_antes_coerente CHECK ((gesto = 'lancar') = (antes IS NULL)),
  CONSTRAINT fcgi_ordem_unica UNIQUE (gravacao_id, ordem)
);
CREATE INDEX IF NOT EXISTS idx_fcgi_lancamento ON public.fatura_cartao_gravacao_itens (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_fcgi_cliente ON public.fatura_cartao_gravacao_itens (cliente_id);

ALTER TABLE public.fatura_cartao_gravacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatura_cartao_gravacao_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fcg_select_tenant ON public.fatura_cartao_gravacoes;
CREATE POLICY fcg_select_tenant ON public.fatura_cartao_gravacoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
DROP POLICY IF EXISTS fcgi_select_tenant ON public.fatura_cartao_gravacao_itens;
CREATE POLICY fcgi_select_tenant ON public.fatura_cartao_gravacao_itens FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fatura_cartao_gravacoes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fatura_cartao_gravacao_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fatura_cartao_gravacoes TO authenticated;
GRANT SELECT ON public.fatura_cartao_gravacao_itens TO authenticated;
GRANT ALL ON public.fatura_cartao_gravacoes TO service_role;
GRANT ALL ON public.fatura_cartao_gravacao_itens TO service_role;

-- leitura segura do que vem da tela: texto inválido = nulo (vira recusa com frase, nunca erro cru)
CREATE OR REPLACE FUNCTION public._fn_fatura_cartao_data(p text) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $f$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  RETURN p::date;
EXCEPTION WHEN others THEN RETURN NULL;
END $f$;
CREATE OR REPLACE FUNCTION public._fn_fatura_cartao_valor(p text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $f$
BEGIN
  IF p IS NULL OR p !~ '^-?\d+(\.\d+)?$' THEN RETURN NULL; END IF;
  RETURN round(p::numeric, 2);
EXCEPTION WHEN others THEN RETURN NULL;
END $f$;
CREATE OR REPLACE FUNCTION public._fn_fatura_cartao_uuid(p text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $f$
BEGIN
  IF p IS NULL OR p !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  RETURN p::uuid;
END $f$;
CREATE OR REPLACE FUNCTION public._fn_fatura_cartao_instante(p text) RETURNS timestamptz LANGUAGE plpgsql STABLE AS $f$
BEGIN
  IF nullif(btrim(coalesce(p, '')), '') IS NULL THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN others THEN RETURN NULL;
END $f$;
-- o retrato da linha que a trilha guarda (antes/depois)
CREATE OR REPLACE FUNCTION public._fn_fatura_cartao_retrato(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT jsonb_build_object('conta_bancaria_id', l.conta_bancaria_id, 'data_vencimento', l.data_vencimento, 'valor', l.valor,
           'status_transacao', l.status_transacao, 'forma_pagamento', l.forma_pagamento, 'vencimento_origem', l.vencimento_origem,
           'editado_manual', l.editado_manual, 'cancelado', l.cancelado, 'updated_at', l.updated_at)
    FROM public.financeiro_lancamentos_v2 l WHERE l.id = p_id
$f$;

CREATE OR REPLACE FUNCTION public.fn_fatura_cartao_gravar(p_cliente uuid, p_conta uuid, p_fatura jsonb, p_itens jsonb,
  p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_conta record; v_hash text; v_venc date; v_grav record; v_rec_m text; v_rec_f text; v_motivo text;
        v_it jsonb; v_pos int; v_out jsonb := '[]'::jsonb; v_recusa jsonb; v_recusadas int := 0;
        v_ordem int; v_gesto text; v_lid uuid; v_lido timestamptz; v_valor numeric; v_data date; v_desc text; v_tipo text;
        v_plano record; v_faz record; v_forn record; v_l record; v_direcao text;
        v_ordens int[] := '{}'; v_lids uuid[] := '{}'; v_gid uuid; v_novo uuid; v_antes jsonb; v_depois jsonb;
        v_n_lancar int := 0; v_n_mover int := 0; v_n_ajustar int := 0; v_soma numeric := 0; v_ret jsonb; v_primeira jsonb;
        v_admin boolean := coalesce(public.is_admin_agroinblue(auth.uid()), false);
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  SELECT b.id, b.cliente_id, b.tipo_conta, b.ativa, coalesce(nullif(btrim(b.nome_exibicao), ''), b.nome_conta) nome
    INTO v_conta FROM public.financeiro_contas_bancarias b WHERE b.id = p_conta;
  v_hash := nullif(btrim(coalesce(p_fatura->>'hash', '')), '');
  v_venc := public._fn_fatura_cartao_data(p_fatura->>'vencimento');
  v_motivo := coalesce(nullif(btrim(coalesce(p_fatura->>'motivo', '')), ''), 'gravada pela fatura');
  SELECT * INTO v_grav FROM public.fatura_cartao_gravacoes g
   WHERE g.cliente_id = p_cliente AND g.conta_bancaria_id = p_conta AND g.hash_arquivo = v_hash AND g.desfeita_em IS NULL;

  IF v_conta.id IS NULL OR v_conta.cliente_id IS DISTINCT FROM p_cliente THEN
    v_rec_m := 'conta_invalida'; v_rec_f := 'O cartão escolhido não é deste cliente.';
  ELSIF v_conta.tipo_conta IS DISTINCT FROM 'cartao' THEN
    v_rec_m := 'nao_e_cartao'; v_rec_f := format('A conta "%s" não é um cartão.', v_conta.nome);
  ELSIF v_conta.ativa IS FALSE THEN
    v_rec_m := 'cartao_inativo'; v_rec_f := format('O cartão "%s" está inativo.', v_conta.nome);
  ELSIF v_hash IS NULL THEN
    v_rec_m := 'sem_arquivo'; v_rec_f := 'Falta a identidade do arquivo da fatura.';
  ELSIF v_venc IS NULL THEN
    v_rec_m := 'sem_vencimento'; v_rec_f := 'A fatura não tem vencimento lido: nada a gravar.';
  ELSIF v_grav.id IS NOT NULL AND v_grav.vencimento <> v_venc THEN
    v_rec_m := 'vencimento_diferente';
    v_rec_f := format('Esta fatura já foi gravada com vencimento %s.', to_char(v_grav.vencimento, 'DD/MM/YYYY'));
  ELSIF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) = 0 THEN
    v_rec_m := 'sem_linhas'; v_rec_f := 'Nenhuma linha marcada para gravar.';
  ELSIF jsonb_array_length(p_itens) > 500 THEN
    v_rec_m := 'lista_grande'; v_rec_f := format('São %s linhas: o limite de uma gravação é 500.', jsonb_array_length(p_itens));
  END IF;
  IF v_rec_m IS NOT NULL THEN
    IF p_simular THEN
      RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', v_rec_m, 'frase', v_rec_f), 'itens', '[]'::jsonb);
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_rec_f || ' Nada foi gravado.';
  END IF;

  -- 1) cada linha conferida ANTES de gravar
  FOR v_it, v_pos IN SELECT e, o::int FROM jsonb_array_elements(p_itens) WITH ORDINALITY x(e, o) LOOP
    v_recusa := NULL; v_rec_m := NULL; v_rec_f := NULL;
    v_ordem := CASE WHEN coalesce(v_it->>'ordem', '') ~ '^\d{1,6}$' THEN (v_it->>'ordem')::int END;
    v_gesto := v_it->>'gesto';
    v_lid := public._fn_fatura_cartao_uuid(v_it->>'lancamento_id');
    v_valor := public._fn_fatura_cartao_valor(v_it->>'valor');
    IF v_ordem IS NULL THEN
      v_rec_m := 'sem_ordem'; v_rec_f := 'Linha sem número de ordem.';
    ELSIF v_ordem = ANY (v_ordens) THEN
      v_rec_m := 'linha_repetida'; v_rec_f := format('A linha %s veio duas vezes.', v_ordem);
    ELSIF v_grav.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.fatura_cartao_gravacao_itens i WHERE i.gravacao_id = v_grav.id AND i.ordem = v_ordem) THEN
      v_rec_m := 'ja_gravada';
      v_rec_f := format('Esta linha já foi gravada em %s.', (SELECT to_char(i.gravado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                   FROM public.fatura_cartao_gravacao_itens i WHERE i.gravacao_id = v_grav.id AND i.ordem = v_ordem));
    ELSIF v_gesto IS NULL OR v_gesto NOT IN ('lancar', 'mover', 'ajustar') THEN
      v_rec_m := 'gesto_invalido'; v_rec_f := 'Gesto desconhecido: só lançar, mover ou ajustar.';
    ELSIF v_gesto = 'lancar' THEN
      v_data := public._fn_fatura_cartao_data(v_it->>'data_compra');
      v_desc := nullif(btrim(coalesce(v_it->>'descricao', '')), '');
      v_tipo := coalesce(v_it->>'tipo', 'saida');
      v_direcao := CASE WHEN v_tipo = 'saida' THEN '2-%' ELSE '1-%' END;
      SELECT p.id, p.cliente_id, p.ativo, p.tipo_operacao INTO v_plano FROM public.financeiro_plano_contas p
       WHERE p.id = public._fn_fatura_cartao_uuid(v_it->>'plano_conta_id');
      SELECT f.id, f.cliente_id INTO v_faz FROM public.fazendas f WHERE f.id = public._fn_fatura_cartao_uuid(v_it->>'fazenda_id');
      SELECT f.id, f.cliente_id, f.ativo, f.fundido_em_id INTO v_forn FROM public.financeiro_fornecedores f
       WHERE f.id = public._fn_fatura_cartao_uuid(v_it->>'favorecido_id');
      IF v_valor IS NULL OR v_valor <= 0 THEN
        v_rec_m := 'valor_invalido'; v_rec_f := 'Valor da linha inválido.';
      ELSIF v_data IS NULL THEN
        v_rec_m := 'sem_data'; v_rec_f := 'Linha sem data da compra.';
      ELSIF v_desc IS NULL THEN
        v_rec_m := 'sem_descricao'; v_rec_f := 'Linha sem descrição.';
      ELSIF v_tipo NOT IN ('saida', 'entrada') THEN
        v_rec_m := 'tipo_invalido'; v_rec_f := 'Tipo da linha inválido: só saída ou entrada (estorno).';
      ELSIF v_it->>'plano_conta_id' IS NULL THEN
        v_rec_m := 'sem_conta'; v_rec_f := 'Falta a conta do plano: escolha na tabela.';
      ELSIF v_it->>'fazenda_id' IS NULL THEN
        v_rec_m := 'sem_fazenda'; v_rec_f := 'Falta a fazenda: escolha na tabela.';
      ELSIF v_plano.id IS NULL OR v_plano.ativo IS NOT TRUE OR (v_plano.cliente_id IS NOT NULL AND v_plano.cliente_id <> p_cliente)
            OR v_plano.tipo_operacao NOT LIKE v_direcao THEN
        v_rec_m := 'conta_do_plano_invalida';
        v_rec_f := 'A conta do plano escolhida não serve para esta linha (inativa, de outro cliente ou de outra direção).';
      ELSIF v_faz.id IS NULL OR v_faz.cliente_id IS DISTINCT FROM p_cliente THEN
        v_rec_m := 'fazenda_invalida'; v_rec_f := 'A fazenda escolhida não é deste cliente.';
      ELSIF v_it->>'favorecido_id' IS NOT NULL AND (v_forn.id IS NULL OR v_forn.cliente_id IS DISTINCT FROM p_cliente
            OR v_forn.ativo IS FALSE OR v_forn.fundido_em_id IS NOT NULL) THEN
        v_rec_m := 'fornecedor_invalido'; v_rec_f := 'O fornecedor escolhido não é deste cliente ou está fora de uso.';
      ELSIF EXISTS (SELECT 1 FROM public.financeiro_fechamentos ff WHERE ff.cliente_id = p_cliente AND ff.fazenda_id = v_faz.id
                     AND ff.ano_mes = to_char(v_data, 'YYYY-MM') AND ff.status_fechamento = 'fechado') THEN
        v_rec_m := 'mes_fechado'; v_rec_f := format('O mês %s desta fazenda está fechado: reabra para gravar.', to_char(v_data, 'MM/YYYY'));
      END IF;
    ELSE
      v_lido := public._fn_fatura_cartao_instante(v_it->>'lido_em');
      SELECT l.* INTO v_l FROM public.financeiro_lancamentos_v2 l WHERE l.id = v_lid AND l.cliente_id = p_cliente;
      IF v_lid IS NULL THEN
        v_rec_m := 'sem_lancamento'; v_rec_f := 'Linha sem o lançamento a mudar.';
      ELSIF v_lid = ANY (v_lids) THEN
        v_rec_m := 'lancamento_repetido'; v_rec_f := 'O mesmo lançamento veio em duas linhas.';
      ELSIF v_l.id IS NULL THEN
        v_rec_m := 'lancamento_invalido'; v_rec_f := 'O lançamento não é deste cliente (ou não existe).';
      ELSIF v_l.cancelado THEN
        v_rec_m := 'cancelado'; v_rec_f := 'O lançamento foi cancelado.';
      ELSIF coalesce(v_l.tipo_operacao, '') NOT LIKE '2-%' THEN
        v_rec_m := 'nao_e_saida'; v_rec_f := 'Só saída se move ou se ajusta pela fatura.';
      ELSIF v_lido IS NULL OR date_trunc('milliseconds', v_l.updated_at) IS DISTINCT FROM date_trunc('milliseconds', v_lido) THEN
        v_rec_m := 'mudou'; v_rec_f := 'O lançamento mudou depois da leitura da fatura: leia a fatura de novo.';
      ELSIF v_l.status_transacao IN ('realizado', 'conciliado') THEN
        v_rec_m := 'realizado'; v_rec_f := format('Já está %s: resolva no Editar.', v_l.status_transacao);
      ELSIF v_l.status_transacao = 'agendado' THEN
        v_rec_m := 'agendado'; v_rec_f := 'Está agendado para pagamento: resolva no Editar.';
      ELSIF public._fin_lancamento_casado_com_extrato(v_l.id) THEN
        v_rec_m := 'casado'; v_rec_f := 'Está casado com o extrato: resolva no Editar.';
      ELSIF EXISTS (SELECT 1 FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = v_l.id AND p.cancelada IS NOT TRUE) THEN
        v_rec_m := 'oc'; v_rec_f := 'Está ligado a uma operação comercial: resolva no Editar.';
      ELSIF EXISTS (SELECT 1 FROM public.openfinance_pagamentos op WHERE op.lancamento_id = v_l.id AND op.situacao IN ('aguardando_banco', 'agendado')) THEN
        v_rec_m := 'pagamento_no_banco'; v_rec_f := 'Está agendado no banco: cancele no banco antes.';
      ELSIF v_l.origem_lancamento = 'importacao_historica' AND NOT v_admin THEN
        v_rec_m := 'historico'; v_rec_f := 'Lançamento da importação histórica: só a equipe AgroinBlue altera.';
      ELSIF EXISTS (SELECT 1 FROM public.financeiro_fechamentos ff WHERE ff.cliente_id = p_cliente AND ff.fazenda_id = v_l.fazenda_id
                     AND ff.ano_mes = v_l.ano_mes AND ff.status_fechamento = 'fechado') THEN
        v_rec_m := 'mes_fechado';
        v_rec_f := format('O mês %s desta fazenda está fechado: reabra para gravar.', to_char(to_date(v_l.ano_mes, 'YYYY-MM'), 'MM/YYYY'));
      ELSIF v_gesto = 'mover' AND v_l.conta_bancaria_id = p_conta THEN
        v_rec_m := 'ja_no_cartao'; v_rec_f := 'Já está neste cartão.';
      ELSIF v_gesto = 'ajustar' AND v_l.conta_bancaria_id IS DISTINCT FROM p_conta THEN
        v_rec_m := 'outra_conta'; v_rec_f := 'Está em outra conta: use mover (com o valor da fatura).';
      ELSIF (v_gesto = 'ajustar' OR v_it->>'valor' IS NOT NULL) AND (v_valor IS NULL OR v_valor <= 0) THEN
        v_rec_m := 'valor_invalido'; v_rec_f := 'Valor da linha inválido.';
      ELSIF v_gesto = 'ajustar' AND v_valor = round(v_l.valor, 2) THEN
        v_rec_m := 'sem_diferenca'; v_rec_f := 'O valor já é o da fatura.';
      END IF;
    END IF;
    IF v_ordem IS NOT NULL THEN v_ordens := v_ordens || v_ordem; END IF;
    IF v_lid IS NOT NULL AND v_gesto <> 'lancar' THEN v_lids := v_lids || v_lid; END IF;
    IF v_rec_m IS NOT NULL THEN
      v_recusadas := v_recusadas + 1;
      v_recusa := jsonb_build_object('motivo', v_rec_m, 'frase', v_rec_f);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('ordem', v_ordem, 'gesto', v_gesto, 'lancamento_id',
               CASE WHEN v_gesto = 'lancar' THEN NULL ELSE v_lid END, 'recusa', v_recusa));
  END LOOP;

  IF v_recusadas > 0 THEN
    SELECT e INTO v_primeira FROM jsonb_array_elements(v_out) e WHERE e->'recusa' <> 'null'::jsonb LIMIT 1;
    IF p_simular THEN
      RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusadas', v_recusadas, 'itens', v_out);
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('%s linha(s) não podem ser gravadas (linha %s: %s) Nada foi gravado.',
      v_recusadas, v_primeira->>'ordem', v_primeira->'recusa'->>'frase');
  END IF;

  -- 2) grava (na simulação, grava e desfaz: é a prévia)
  BEGIN
    PERFORM set_config('app.motivo', format('fatura do cartão (venc. %s): %s', to_char(v_venc, 'DD/MM/YYYY'), v_motivo), true);
    IF v_grav.id IS NULL THEN
      INSERT INTO public.fatura_cartao_gravacoes (cliente_id, conta_bancaria_id, hash_arquivo, arquivo_nome, final_cartao, fechamento,
                                                  vencimento, total, motivo)
      VALUES (p_cliente, p_conta, v_hash, nullif(btrim(coalesce(p_fatura->>'arquivo', '')), ''),
              nullif(btrim(coalesce(p_fatura->>'final', '')), ''), public._fn_fatura_cartao_data(p_fatura->>'fechamento'),
              v_venc, public._fn_fatura_cartao_valor(p_fatura->>'total'), v_motivo)
      RETURNING id INTO v_gid;
    ELSE
      v_gid := v_grav.id;
    END IF;
    v_out := '[]'::jsonb; v_recusadas := 0;
    FOR v_it, v_pos IN SELECT e, o::int FROM jsonb_array_elements(p_itens) WITH ORDINALITY x(e, o) LOOP
      v_ordem := (v_it->>'ordem')::int; v_gesto := v_it->>'gesto'; v_valor := public._fn_fatura_cartao_valor(v_it->>'valor');
      v_lid := public._fn_fatura_cartao_uuid(v_it->>'lancamento_id'); v_recusa := NULL; v_antes := NULL; v_depois := NULL;
      BEGIN
        IF v_gesto = 'lancar' THEN
          v_tipo := coalesce(v_it->>'tipo', 'saida');
          v_data := public._fn_fatura_cartao_data(v_it->>'data_compra');
          INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, data_competencia,
                 data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, favorecido_id,
                 ano_mes, origem_lancamento, created_by, sem_movimentacao_caixa)
          VALUES (p_cliente, (v_it->>'fazenda_id')::uuid, CASE WHEN v_tipo = 'saida' THEN p_conta END, CASE WHEN v_tipo = 'entrada' THEN p_conta END,
                  v_data, v_venc, NULL, v_valor, CASE WHEN v_tipo = 'saida' THEN '-1' ELSE '1' END,
                  CASE WHEN v_tipo = 'saida' THEN '2-Saídas' ELSE '1-Entradas' END, 'programado', btrim(v_it->>'descricao'),
                  (v_it->>'plano_conta_id')::uuid, public._fn_fatura_cartao_uuid(v_it->>'favorecido_id'),
                  to_char(v_data, 'YYYY-MM'), 'cartao_fatura', auth.uid(), false)
          RETURNING id INTO v_novo;
          v_lid := v_novo; v_n_lancar := v_n_lancar + 1;
          v_soma := v_soma + CASE WHEN v_tipo = 'saida' THEN v_valor ELSE -v_valor END;
        ELSE
          v_antes := public._fn_fatura_cartao_retrato(v_lid);
          IF v_gesto = 'mover' THEN
            UPDATE public.financeiro_lancamentos_v2
               SET conta_bancaria_id = p_conta, data_vencimento = v_venc, valor = coalesce(v_valor, valor)
             WHERE id = v_lid AND cliente_id = p_cliente;
            v_n_mover := v_n_mover + 1;
          ELSE
            UPDATE public.financeiro_lancamentos_v2 SET valor = v_valor WHERE id = v_lid AND cliente_id = p_cliente;
            v_n_ajustar := v_n_ajustar + 1;
          END IF;
          v_soma := v_soma + coalesce(v_valor, (v_antes->>'valor')::numeric);
        END IF;
      EXCEPTION WHEN others THEN
        v_recusadas := v_recusadas + 1;
        v_recusa := jsonb_build_object('motivo', 'banco_recusou', 'frase', sqlerrm);
      END;
      IF v_recusa IS NULL THEN
        v_depois := public._fn_fatura_cartao_retrato(v_lid);
        INSERT INTO public.fatura_cartao_gravacao_itens (gravacao_id, cliente_id, ordem, gesto, lancamento_id, linha, antes, depois)
        VALUES (v_gid, p_cliente, v_ordem, v_gesto, v_lid, v_it, v_antes, v_depois);
      END IF;
      v_out := v_out || jsonb_build_array(jsonb_build_object('ordem', v_ordem, 'gesto', v_gesto,
                 'lancamento_id', CASE WHEN v_gesto = 'lancar' AND p_simular THEN NULL ELSE v_lid END,
                 'recusa', v_recusa, 'antes', v_antes, 'depois', v_depois));
    END LOOP;
    IF v_recusadas > 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'FCREC', MESSAGE = jsonb_build_object('ok', false, 'simulado', p_simular, 'recusadas', v_recusadas,
        'itens', v_out)::text;
    END IF;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'gravacao_id', CASE WHEN p_simular THEN NULL ELSE v_gid END,
               'acrescentou', v_grav.id IS NOT NULL, 'lancar', v_n_lancar, 'mover', v_n_mover, 'ajustar', v_n_ajustar,
               'soma', round(v_soma, 2), 'itens', v_out);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'FCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION
    WHEN sqlstate 'FCSIM' THEN RETURN sqlerrm::jsonb;
    WHEN sqlstate 'FCREC' THEN
      IF p_simular THEN RETURN sqlerrm::jsonb; END IF;
      v_ret := sqlerrm::jsonb;
      SELECT e INTO v_primeira FROM jsonb_array_elements(v_ret->'itens') e WHERE e->'recusa' <> 'null'::jsonb LIMIT 1;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('%s linha(s) recusadas pelo banco (linha %s: %s) Nada foi gravado.',
        v_ret->>'recusadas', v_primeira->>'ordem', v_primeira->'recusa'->>'frase');
  END;
  RETURN v_ret;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_fatura_cartao_desfazer(p_gravacao uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_g record; v_i record; v_l record; v_rec_m text; v_rec_f text; v_motivo text; v_ficou text; v_frase text;
        v_voltaram int := 0; v_ficaram jsonb := '[]'::jsonb; v_ret jsonb;
BEGIN
  SELECT * INTO v_g FROM public.fatura_cartao_gravacoes WHERE id = p_gravacao;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_g.cliente_id]);
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  IF v_g.desfeita_em IS NOT NULL THEN
    v_rec_m := 'ja_desfeita';
    v_rec_f := format('Esta fatura já foi desfeita em %s.', to_char(v_g.desfeita_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'));
  ELSIF NOT p_simular AND v_motivo IS NULL THEN
    v_rec_m := 'sem_motivo'; v_rec_f := 'Informe o motivo para desfazer.';
  END IF;
  IF v_rec_m IS NOT NULL THEN
    IF p_simular THEN
      RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', v_rec_m, 'frase', v_rec_f));
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_rec_f || ' Nada foi gravado.';
  END IF;

  BEGIN
    PERFORM set_config('app.motivo', 'fatura do cartão desfeita: ' || coalesce(v_motivo, 'simulação'), true);
    FOR v_i IN SELECT * FROM public.fatura_cartao_gravacao_itens WHERE gravacao_id = p_gravacao AND desfeito_em IS NULL ORDER BY ordem LOOP
      v_ficou := NULL; v_frase := NULL;
      SELECT l.* INTO v_l FROM public.financeiro_lancamentos_v2 l WHERE l.id = v_i.lancamento_id;
      IF v_l.updated_at IS DISTINCT FROM (v_i.depois->>'updated_at')::timestamptz THEN
        v_ficou := 'mudou';
        v_frase := format('Mudou depois da gravação (em %s): ficou como está.', to_char(v_l.updated_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'));
      ELSIF public._fin_lancamento_casado_com_extrato(v_l.id) THEN
        v_ficou := 'casado'; v_frase := 'Casado com o extrato: ficou como está.';
      ELSE
        BEGIN
          IF v_i.gesto = 'lancar' THEN
            UPDATE public.financeiro_lancamentos_v2
               SET cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(),
                   cancelado_motivo = 'fatura desfeita: ' || coalesce(v_motivo, 'simulação')
             WHERE id = v_l.id;
          ELSE
            UPDATE public.financeiro_lancamentos_v2
               SET conta_bancaria_id = (v_i.antes->>'conta_bancaria_id')::uuid, data_vencimento = (v_i.antes->>'data_vencimento')::date,
                   valor = (v_i.antes->>'valor')::numeric, forma_pagamento = v_i.antes->>'forma_pagamento',
                   vencimento_origem = v_i.antes->>'vencimento_origem', editado_manual = (v_i.antes->>'editado_manual')::boolean
             WHERE id = v_l.id;
          END IF;
        EXCEPTION WHEN others THEN
          v_ficou := 'banco_recusou'; v_frase := sqlerrm;
        END;
      END IF;
      IF v_ficou IS NULL THEN
        v_voltaram := v_voltaram + 1;
        UPDATE public.fatura_cartao_gravacao_itens SET desfeito_em = now() WHERE id = v_i.id;
      ELSE
        v_ficaram := v_ficaram || jsonb_build_array(jsonb_build_object('ordem', v_i.ordem, 'gesto', v_i.gesto, 'lancamento_id', v_i.lancamento_id,
                       'motivo', v_ficou, 'frase', v_frase));
        UPDATE public.fatura_cartao_gravacao_itens SET ficou_motivo = v_ficou WHERE id = v_i.id;
      END IF;
    END LOOP;
    UPDATE public.fatura_cartao_gravacoes
       SET desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(v_motivo, 'simulação')
     WHERE id = p_gravacao;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'voltaram', v_voltaram, 'ficaram', v_ficaram);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'FCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN sqlstate 'FCSIM' THEN
    RETURN sqlerrm::jsonb;
  END;
  RETURN v_ret;
END $f$;

REVOKE ALL ON FUNCTION public._fn_fatura_cartao_data(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fatura_cartao_valor(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fatura_cartao_uuid(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fatura_cartao_instante(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fatura_cartao_retrato(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fatura_cartao_gravar(uuid, uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fatura_cartao_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fatura_cartao_gravar(uuid, uuid, jsonb, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_fatura_cartao_desfazer(uuid, text, boolean) TO authenticated, service_role;
