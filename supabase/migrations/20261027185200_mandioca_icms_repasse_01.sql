-- MANDIOCA-ICMS-REPASSE-01 (PR B do CONC-MANDIOCA-01) — o ICMS da nota da mandioca e' REPASSE, nao deducao.
--
-- Por NF a NJ paga dois Pix a Sefaz/Governo do MS: o ICMS da nota (2.016,00; Olinda 2.470,26), que o comprador DEVOLVE,
-- e o ICMS de transporte (311,14), custo do frete que nao volta. O sistema lancava o primeiro como deducao de venda
-- (b451681a, compoe_dre) e nao tinha nem o recebivel do comprador nem o transporte das NFs ja registradas.
--
-- 1. Plano (D1): par novo de agricultura, os dois com compoe_dre = false (regra 1b do gatilho materializar_dre_lcdpr_from_plano:
--    plano com compoe_dre FALSE explicito vence a matriz). NAO reusa 10005/3025 (adiantamento a parceiro).
--      10006  2-Saidas  / Saida Financeira  / Outras Saidas  / Movimentacoes Financeiras / ICMS a Repassar - Pago
--       3026  1-Entradas / Entrada Financeira / Outras Entradas / Movimentacoes Financeiras / ICMS a Repassar - Devolvido
--    No VAO (10005..10010 e logo depois da 3025, as irmas de agricultura do mesmo grupo), sem renumerar (PLANO-ORDEM-01).
-- 2. Funcao interna UNICA que insere um papel da carga (_agri_carga_inserir_papel) e a pergunta "uma vez por NF"
--    (_agri_carga_papel_na_nf). O registrar passa a usar so' elas.
-- 3. agri_carga_mandioca_registrar (corpo integral): ICMS no plano Pago + recebivel do comprador (entrada, programado,
--    plano Devolvido, favorecido = comprador, mesmo valor, conta da carga), so' na primeira carga da NF; ICMS de transporte
--    UMA VEZ POR NF (decisao do Gabriel, 01/10). Venda, servicos, Funrural e INSS exatamente como antes.
-- 4. agri_carga_mandioca_completar (nova): acrescenta a uma NF ja' registrada so' icms_transporte e/ou icms_recebivel,
--    uma vez por NF, pela funcao interna. Recusa o papel que ja' existe. SECURITY DEFINER, guarda de tenant.
-- 5. agri_carga_mandioca_corrigir: SO' a contagem da guarda anti-destruicao — o ICMS conta 2 (icms + icms_recebivel);
--    sem isto o corrigir recusaria toda carga com ICMS ("apagaria N e recriaria N-1").
--    agri_colheita_lancamentos_papel_check ganha 'icms_recebivel' (a lista fechada de papeis; nada sai dela).
-- 6. Backfill das 14 NFs + D2 da NF 9344705, com o estado anterior em mandioca_icms_repasse_01_backfill.
--
-- GESTO CONTRARIO (linha a linha, pela tabela de backfill, na ORDEM INVERSA dos passos):
--   d_vincular      -> desfazer o vinculo novo (desfeito_em); o dono volta a programado sem data de pagamento.
--   d_cancelar_cru  -> reativar o cru (cancelado = false, cancelado_em/por/motivo nulos) e refazer o vinculo dele pelo
--                      fn_vincular_extrato_lancamento.
--   d_conta         -> voltar a conta do dono ba6db7b8 para o Sicredi.
--   c_transporte / b_recebivel -> cancelar o lancamento criado e desativar o elo em agri_colheita_lancamentos.
--   a_reclassificar -> plano_conta_id = b451681a (o gatilho recalcula compoe_dre: volta a true).
--   Plano e funcoes: o registrar anterior esta' no ledger (md5 ee110755...), o corrigir idem (3e95399a...).

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric)'::regprocedure)
     <> 'ee110755166e741402177c366b2d6d56' THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01: corpo de origem de agri_carga_mandioca_registrar divergente — abortado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric)'::regprocedure)
     <> '3e95399a50f89c0449a4b649276adea4' THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01: corpo de origem de agri_carga_mandioca_corrigir divergente — abortado';
  END IF;
  IF EXISTS (SELECT 1 FROM financeiro_plano_contas WHERE subcentro ILIKE 'ICMS a Repassar%' OR ordem_exibicao IN (3026, 10006)) THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01: plano ICMS a Repassar ou ordem 3026/10006 ja existe — abortado';
  END IF;
  IF to_regprocedure('public.agri_carga_mandioca_completar(uuid, text, numeric, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01: agri_carga_mandioca_completar ja existe — abortado';
  END IF;
END $guarda$;

-- ═══════════════════ 1. PLANO ═══════════════════
INSERT INTO public.financeiro_plano_contas (id, cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao, compoe_dre, gera_lcdpr, bloco_dre) VALUES
  ('785ba0f5-7307-44a2-a78b-6567d41f44f2', NULL, '2-Saídas',  'Saída Financeira',  'Outras Saídas',  'Movimentações Financeiras', 'ICMS a Repassar - Pago',      'agricultura', true, 10006, false, NULL, NULL),
  ('be23cc96-93b3-4d5f-adee-858210114dce', NULL, '1-Entradas', 'Entrada Financeira', 'Outras Entradas', 'Movimentações Financeiras', 'ICMS a Repassar - Devolvido', 'agricultura', true, 3026,  false, NULL, NULL);

-- O papel novo entra na lista fechada de agri_colheita_lancamentos (a mesma lista de antes + 'icms_recebivel').
ALTER TABLE public.agri_colheita_lancamentos DROP CONSTRAINT agri_colheita_lancamentos_papel_check;
ALTER TABLE public.agri_colheita_lancamentos ADD CONSTRAINT agri_colheita_lancamentos_papel_check
  CHECK (papel = ANY (ARRAY['venda'::text, 'icms'::text, 'icms_transporte'::text, 'funrural'::text, 'inss'::text, 'frete'::text, 'trator'::text, 'mao_obra'::text, 'arranquio'::text, 'carregamento'::text, 'icms_recebivel'::text]));

-- ═══════════════════ 2. INTERNAS ═══════════════════
CREATE FUNCTION public._agri_carga_papel_na_nf(p_cliente uuid, p_safra uuid, p_nf text, p_papel text, p_excluir_colheita uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- A NF ja' tem este papel numa carga ATIVA (fora a carga indicada)? E' a pergunta "uma vez por NF" do ICMS da venda,
  -- agora tambem do ICMS de transporte e do recebivel — UMA resposta, para o registrar e o completar.
  select exists (
    select 1 from agri_colheita_lancamentos cl join agri_colheita c on c.id=cl.colheita_id join agri_safra_area a on a.id=c.safra_area_id
     where cl.papel=p_papel and cl.ativo and c.ativo and c.cliente_id=p_cliente and a.safra_id=p_safra and c.nf_produtor=p_nf
       and (p_excluir_colheita is null or c.id<>p_excluir_colheita));
$function$;

CREATE FUNCTION public._agri_carga_inserir_papel(p_colheita uuid, p_papel text, p_cliente uuid, p_fazenda uuid, p_safra uuid, p_plano uuid, p_favorecido uuid, p_conta uuid, p_entrada boolean, p_valor numeric, p_data date, p_descricao text, p_nf text, p_compoe_dre boolean, p_uid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
-- MANDIOCA-ICMS-REPASSE-01: o UNICO insertor de papel da carga de mandioca. Grava o lancamento (programado, cenario
-- realizado, origem 'carga_mandioca', competencia = vencimento = data da carga) e o elo em agri_colheita_lancamentos.
-- Entrada leva a conta em conta_destino_id; saida, em conta_bancaria_id (o gatilho de direcao confirma).
-- p_compoe_dre NULO deixa o plano decidir (regra 1b); os papeis de sempre passam true, como antes.
declare v_id uuid;
begin
  if p_entrada then
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, conta_destino_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, p_fazenda, p_safra, 'mandioca', p_plano, p_favorecido, p_conta, '1-Entradas', 1, p_valor, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', p_compoe_dre, p_descricao, p_nf, p_uid, p_uid) returning id into v_id;
  else
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, conta_bancaria_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, p_fazenda, p_safra, 'mandioca', p_plano, p_favorecido, p_conta, '2-Saídas', -1, p_valor, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', p_compoe_dre, p_descricao, p_nf, p_uid, p_uid) returning id into v_id;
  end if;
  insert into agri_colheita_lancamentos values (p_colheita, v_id, p_papel);
  return v_id;
end $function$;

-- Internas: nao sao SECURITY DEFINER e NAO se executam pela API (o idioma de _fn_recorrencia_vagas). Quem as chama e' o
-- registrar/corrigir/completar, SECURITY DEFINER, que roda como dono.
REVOKE ALL ON FUNCTION public._agri_carga_papel_na_nf(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._agri_carga_inserir_papel(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, boolean, numeric, date, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._agri_carga_papel_na_nf(uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._agri_carga_inserir_papel(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, boolean, numeric, date, text, text, boolean, uuid) TO service_role;

-- ═══════════════════ 3. REGISTRAR (corpo integral) ═══════════════════
CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_registrar(p_cliente uuid, p_safra_area_id uuid, p_data date, p_industria_id uuid, p_nf text, p_ticket text, p_peso_bruto_kg numeric, p_desconto_kg numeric, p_rendimento_g integer, p_preco_g numeric, p_servicos jsonb, p_icms numeric, p_funrural numeric, p_observacao text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_inss numeric DEFAULT NULL::numeric, p_icms_transporte numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_area record; v_liq numeric; v_t numeric; v_valor numeric; v_col uuid; v_uid uuid := coalesce(auth.uid(), '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'); v_ids uuid[] := '{}'; v_id uuid; v_s jsonb; v_plano uuid; v_papel text; v_desc text; v_forn text; v_ind text; v_serv_total numeric := 0; v_icms_ja boolean; v_transp_ja boolean; v_tstr text; v_rot text;
  c_venda constant uuid := '43b81bba-4136-4d8e-aee0-a8aaf1521dc0'; c_imp constant uuid := 'b451681a-c29e-4efe-a145-30a9950c6f5c'; c_frete constant uuid := '9c350708-9717-4ab9-adf4-09b25ccb024c';
  c_trator constant uuid := '25dc0eee-c873-427d-8e54-589757bb57ab'; c_mao_obra constant uuid := '6fde19c6-524a-44da-ad64-86fff06e24a6'; c_sefaz constant uuid := '948cab3f-52e3-46bd-b4b8-3e022828125b';
  -- MANDIOCA-ICMS-REPASSE-01: o ICMS da nota e' REPASSE (o comprador devolve), fora do DRE pela regra 1b do plano
  c_icms_pago constant uuid := '785ba0f5-7307-44a2-a78b-6567d41f44f2'; c_icms_devolvido constant uuid := 'be23cc96-93b3-4d5f-adee-858210114dce';
begin
  select a.*, s.escopo_negocio, p.fazenda_id into v_area from agri_safra_area a join financeiro_safras s on s.id=a.safra_id left join pastos p on p.id=a.pasto_id where a.id=p_safra_area_id and a.cliente_id=p_cliente;
  if v_area.id is null then raise exception 'talhao/safra nao encontrado'; end if;
  if v_area.cultura <> 'mandioca' then raise exception 'esta RPC e so para mandioca (cultura %)', v_area.cultura; end if;
  if v_area.fazenda_id is null then raise exception 'talhao sem fazenda'; end if;
  if p_peso_bruto_kg is null or p_peso_bruto_kg <= 0 then raise exception 'peso bruto obrigatorio'; end if;
  if p_rendimento_g is null or p_rendimento_g <= 0 then raise exception 'rendimento obrigatorio'; end if;
  if p_preco_g is null or p_preco_g <= 0 then raise exception 'preco por grama obrigatorio'; end if;
  if p_industria_id is null then raise exception 'industria obrigatoria'; end if;
  v_liq := p_peso_bruto_kg - coalesce(p_desconto_kg,0);
  v_t := round(v_liq/1000.0, 2);
  v_valor := round(v_t * p_rendimento_g * p_preco_g, 2);
  v_tstr := to_char(v_t, 'FM999G990D00');
  select coalesce(nome_favorecido, nome) into v_ind from financeiro_fornecedores where id=p_industria_id;
  insert into agri_colheita (cliente_id, safra_area_id, data_colheita, peso_bruto_kg, peso_liquido_kg, desconto_kg, toneladas, rendimento_g, preco_g, industria_id, nf_produtor, ticket_balanca, destino, observacoes, ativo)
  values (p_cliente, p_safra_area_id, p_data, p_peso_bruto_kg, v_liq, coalesce(p_desconto_kg,0), v_t, p_rendimento_g, p_preco_g, p_industria_id, p_nf, p_ticket, 'venda', p_observacao, true) returning id into v_col;
  -- ⚠ TODO PAPEL ENTRA PELA FUNCAO INTERNA UNICA (_agri_carga_inserir_papel): lancamento + elo na carga, sem copia.
  -- venda
  v_id := public._agri_carga_inserir_papel(v_col, 'venda', p_cliente, v_area.fazenda_id, v_area.safra_id, c_venda, p_industria_id, p_conta_id, true, v_valor, p_data, format('Venda %s t Mandioca · NF %s · %s g · %s', v_tstr, coalesce(p_nf,'-'), p_rendimento_g, coalesce(v_ind,'-')), p_nf, true, v_uid);
  v_ids := v_ids || v_id;
  -- icms: uma vez por NF. E' REPASSE: sai no plano "ICMS a Repassar - Pago" e, na MESMA carga, nasce o recebivel do
  -- comprador ("ICMS a Repassar - Devolvido"), mesmo valor. compoe_dre NULO: quem decide e' o plano (regra 1b -> false).
  v_icms_ja := public._agri_carga_papel_na_nf(p_cliente, v_area.safra_id, p_nf, 'icms', v_col);
  if coalesce(p_icms,0) > 0 and not v_icms_ja then
    v_id := public._agri_carga_inserir_papel(v_col, 'icms', p_cliente, v_area.fazenda_id, v_area.safra_id, c_icms_pago, c_sefaz, p_conta_id, false, p_icms, p_data, format('ICMS Venda Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, null, v_uid);
    v_ids := v_ids || v_id;
    v_id := public._agri_carga_inserir_papel(v_col, 'icms_recebivel', p_cliente, v_area.fazenda_id, v_area.safra_id, c_icms_devolvido, p_industria_id, p_conta_id, true, p_icms, p_data, format('ICMS a Receber Mandioca · NF %s · %s', coalesce(p_nf,'-'), coalesce(v_ind,'-')), p_nf, null, v_uid);
    v_ids := v_ids || v_id;
  end if;
  if coalesce(p_funrural,0) > 0 then
    v_id := public._agri_carga_inserir_papel(v_col, 'funrural', p_cliente, v_area.fazenda_id, v_area.safra_id, c_imp, p_industria_id, p_conta_id, false, p_funrural, p_data, format('Funrural Venda Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, true, v_uid);
    v_ids := v_ids || v_id;
  end if;
  -- inss: retido da venda, igual ao funrural (deducao, c_imp)
  if coalesce(p_inss,0) > 0 then
    v_id := public._agri_carga_inserir_papel(v_col, 'inss', p_cliente, v_area.fazenda_id, v_area.safra_id, c_imp, p_industria_id, p_conta_id, false, p_inss, p_data, format('INSS Venda Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, true, v_uid);
    v_ids := v_ids || v_id;
  end if;
  -- servicos por tonelada
  for v_s in select * from jsonb_array_elements(coalesce(p_servicos,'[]'::jsonb)) loop
    v_papel := v_s->>'tipo';
    if v_papel not in ('frete','trator','mao_obra') then raise exception 'servico invalido %', v_papel; end if;
    if coalesce((v_s->>'preco_t')::numeric,0) <= 0 then continue; end if;
    v_plano := case v_papel when 'frete' then c_frete when 'trator' then c_trator else c_mao_obra end;
    v_rot := case v_papel when 'frete' then 'Frete' when 'trator' then 'Trator' else 'Mao de obra' end;
    select coalesce(nome_favorecido, nome) into v_forn from financeiro_fornecedores where id=(v_s->>'fornecedor_id')::uuid;
    if v_forn is null then raise exception 'prestador do servico % nao encontrado', v_papel; end if;
    v_desc := format('%s Mandioca %s t · NF %s', v_rot, v_tstr, coalesce(p_nf,'-'));
    v_id := public._agri_carga_inserir_papel(v_col, v_papel, p_cliente, v_area.fazenda_id, v_area.safra_id, v_plano, (v_s->>'fornecedor_id')::uuid, p_conta_id, false, round(v_t*(v_s->>'preco_t')::numeric,2), p_data, v_desc, p_nf, true, v_uid);
    v_ids := v_ids || v_id;
    v_serv_total := v_serv_total + round(v_t*(v_s->>'preco_t')::numeric,2);
  end loop;
  -- icms transporte: CUSTO sobre o frete (c_frete), nao deducao de venda (c_imp). UMA VEZ POR NF, como o ICMS da venda
  -- (MANDIOCA-ICMS-REPASSE-01: 14 Pix de 311,14 para 14 NFs).
  v_transp_ja := public._agri_carga_papel_na_nf(p_cliente, v_area.safra_id, p_nf, 'icms_transporte', v_col);
  if coalesce(p_icms_transporte,0) > 0 and not v_transp_ja then
    v_id := public._agri_carga_inserir_papel(v_col, 'icms_transporte', p_cliente, v_area.fazenda_id, v_area.safra_id, c_frete, c_sefaz, p_conta_id, false, p_icms_transporte, p_data, format('ICMS Transporte Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, true, v_uid);
    v_ids := v_ids || v_id;
  end if;
  return jsonb_build_object('colheita_id', v_col, 'lancamento_ids', to_jsonb(v_ids), 'toneladas', v_t, 'valor_bruto', v_valor, 'servicos_total', v_serv_total, 'icms_lancado', coalesce(p_icms,0) > 0 and not v_icms_ja, 'icms_transporte_lancado', coalesce(p_icms_transporte,0) > 0 and not v_transp_ja);
end$function$;

-- ═══════════════════ 5. CORRIGIR (corpo integral; so' a contagem do ICMS) ═══════════════════
CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_corrigir(p_colheita_id uuid, p_safra_area_id uuid, p_data date, p_industria_id uuid, p_nf text, p_ticket text, p_peso_bruto_kg numeric, p_desconto_kg numeric, p_rendimento_g integer, p_preco_g numeric, p_servicos jsonb, p_icms numeric, p_funrural numeric, p_observacao text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_inss numeric DEFAULT NULL::numeric, p_icms_transporte numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_cli uuid; v_r jsonb; v_nf text; v_tem_hoje int; v_vai_recriar int; v_metades int;
begin
  select cliente_id, nf_produtor into v_cli, v_nf from agri_colheita where id=p_colheita_id and ativo;
  if v_cli is null then raise exception 'carga nao encontrada'; end if;

  -- GUARDA ANTI-DESTRUICAO (21/09): corrigir e cancelar+registrar; se o formulario vier com MENOS
  -- do que a carga tem hoje, a diferenca seria APAGADA sem volta. Enquanto o modal nao edita a
  -- carga inteira com servicos/impostos preenchidos, RECUSAR quando a operacao encolheria a carga.
  -- (a) a NF nao pode ter mais de uma colheita ativa: corrigir so recria ESTA, apagando as outras metades.
  select count(*) into v_metades from agri_colheita where cliente_id=v_cli and nf_produtor=v_nf and ativo;
  if v_metades > 1 then
    return jsonb_build_object('ok', false, 'motivo',
      format('Esta carga tem %s partes (a nota foi dividida entre talhoes). Corrigir aqui apagaria as outras. Use o cadastro de carga nova ate a edicao de carga dividida ficar pronta.', v_metades));
  end if;
  -- (b) o formulario nao pode recriar MENOS lancamentos do que a carga tem hoje.
  select count(*) into v_tem_hoje
    from agri_colheita_lancamentos cl join financeiro_lancamentos_v2 l on l.id=cl.lancamento_id
    where cl.colheita_id=p_colheita_id and cl.ativo and coalesce(l.cancelado,false)=false;
  v_vai_recriar := 1  -- a venda, sempre
    + coalesce((select count(*) from jsonb_array_elements(coalesce(p_servicos,'[]'::jsonb)) s where coalesce((s->>'preco_t')::numeric,0) > 0),0)
    -- MANDIOCA-ICMS-REPASSE-01: o ICMS da nota nasce com o recebivel do comprador (icms + icms_recebivel = 2)
    + (case when coalesce(p_icms,0) > 0 then 2 else 0 end)
    + (case when coalesce(p_funrural,0) > 0 then 1 else 0 end)
    + (case when coalesce(p_inss,0) > 0 then 1 else 0 end)
    + (case when coalesce(p_icms_transporte,0) > 0 then 1 else 0 end);
  if v_vai_recriar < v_tem_hoje then
    return jsonb_build_object('ok', false, 'motivo',
      format('Esta edicao apagaria %s lancamentos e recriaria so %s: os servicos e impostos nao vieram preenchidos. Use o cadastro de carga nova ate a edicao de carga ficar pronta.', v_tem_hoje, v_vai_recriar));
  end if;

  v_r := agri_carga_mandioca_cancelar(p_colheita_id, 'corrigida em '||now()::date);
  if not (v_r->>'ok')::boolean then return v_r; end if;
  return agri_carga_mandioca_registrar(v_cli, p_safra_area_id, p_data, p_industria_id, p_nf, p_ticket, p_peso_bruto_kg, p_desconto_kg, p_rendimento_g, p_preco_g, p_servicos, p_icms, p_funrural, p_observacao, p_conta_id, p_inss, p_icms_transporte) || jsonb_build_object('substitui', p_colheita_id);
end $function$;

DO $confere$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric)'::regprocedure) <> '16df0438482d859f0770452dd9e83997' THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01: corpo de destino do registrar divergente — abortado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric)'::regprocedure) <> '978fc58c5c1720fb11d44d344bd0637c' THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01: corpo de destino do corrigir divergente — abortado';
  END IF;
END $confere$;

-- ═══════════════════ 4. COMPLETAR ═══════════════════
CREATE FUNCTION public.agri_carga_mandioca_completar(p_colheita_id uuid, p_papel text, p_valor numeric DEFAULT NULL::numeric, p_conta_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
-- MANDIOCA-ICMS-REPASSE-01: acrescenta a uma NF JA REGISTRADA so' o papel que falta — 'icms_transporte' e/ou
-- 'icms_recebivel' —, uma vez por NF, pela funcao interna unica. Recusa o papel que ja' existe na NF.
declare v_c record; v_uid uuid := auth.uid(); v_icms record; v_venda record; v_id uuid; v_data date; v_ind text; v_conta uuid; v_valor numeric;
  v_safra_lanc uuid; v_fazenda_lanc uuid;
  c_frete constant uuid := '9c350708-9717-4ab9-adf4-09b25ccb024c'; c_sefaz constant uuid := '948cab3f-52e3-46bd-b4b8-3e022828125b';
  c_icms_devolvido constant uuid := 'be23cc96-93b3-4d5f-adee-858210114dce';
begin
  select c.*, a.safra_id, a.cultura, p.fazenda_id into v_c
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id left join pastos p on p.id=a.pasto_id
   where c.id=p_colheita_id and c.ativo;
  if v_c.id is null then return jsonb_build_object('ok', false, 'motivo', 'carga_nao_encontrada', 'mensagem', 'Carga nao encontrada ou cancelada.'); end if;
  if not (public.is_admin_agroinblue(v_uid)
          or v_c.cliente_id in (select t.cliente_id from public.get_user_cliente_ids(v_uid) t(cliente_id))) then
    raise exception 'Operação não autorizada para este cliente';
  end if;
  if v_c.cultura <> 'mandioca' then return jsonb_build_object('ok', false, 'motivo', 'cultura_invalida', 'mensagem', format('So para mandioca (cultura %s).', v_c.cultura)); end if;
  if p_papel not in ('icms_transporte', 'icms_recebivel') then
    return jsonb_build_object('ok', false, 'motivo', 'papel_invalido', 'mensagem', format('Papel %s nao se completa: so icms_transporte e icms_recebivel.', coalesce(p_papel,'-')));
  end if;
  if coalesce(v_c.nf_produtor, '') = '' then return jsonb_build_object('ok', false, 'motivo', 'carga_sem_nf', 'mensagem', 'A carga nao tem NF.'); end if;
  if public._agri_carga_papel_na_nf(v_c.cliente_id, v_c.safra_id, v_c.nf_produtor, p_papel, null) then
    return jsonb_build_object('ok', false, 'motivo', 'papel_ja_existe',
      'mensagem', format('%s ja lancado na NF %s — uma vez por nota.', case p_papel when 'icms_transporte' then 'ICMS de transporte' else 'Recebivel do ICMS' end, v_c.nf_produtor));
  end if;
  -- a data e' a da CARGA DA NF (a primeira, que e' a que leva o ICMS)
  select min(c2.data_colheita) into v_data from agri_colheita c2 join agri_safra_area a2 on a2.id=c2.safra_area_id
   where c2.cliente_id=v_c.cliente_id and a2.safra_id=v_c.safra_id and c2.nf_produtor=v_c.nf_produtor and c2.ativo;
  -- conta, safra e fazenda sao as da VENDA da carga (conta_efetiva_id resolve a direcao). ⚠ A SAFRA NAO E' A DO TALHAO:
  -- a NF 9320690 teve os lancamentos movidos para a 26/27-Lav (editado_manual, 01/10) e o papel novo acompanha os irmaos
  -- dele — gravar na safra do talhao poria o custo do transporte num DRE e a venda noutro.
  select l.conta_efetiva_id, l.safra_id, l.fazenda_id into v_venda from agri_colheita_lancamentos cl join financeiro_lancamentos_v2 l on l.id=cl.lancamento_id
   where cl.colheita_id=p_colheita_id and cl.papel='venda' and cl.ativo and l.cancelado is not true limit 1;
  v_conta := coalesce(p_conta_id, v_venda.conta_efetiva_id);
  v_safra_lanc := coalesce(v_venda.safra_id, v_c.safra_id);
  v_fazenda_lanc := coalesce(v_venda.fazenda_id, v_c.fazenda_id);
  if p_papel = 'icms_transporte' then
    if coalesce(p_valor, 0) <= 0 then return jsonb_build_object('ok', false, 'motivo', 'valor_obrigatorio', 'mensagem', 'Informe o valor do ICMS de transporte.'); end if;
    v_id := public._agri_carga_inserir_papel(p_colheita_id, 'icms_transporte', v_c.cliente_id, v_fazenda_lanc, v_safra_lanc, c_frete, c_sefaz, v_conta, false, p_valor, v_data, format('ICMS Transporte Mandioca · NF %s', v_c.nf_produtor), v_c.nf_produtor, true, v_uid);
  else
    -- o recebivel espelha o ICMS da nota: sem ICMS lancado na NF nao ha' o que o comprador devolver
    select l.id, l.valor into v_icms from agri_colheita_lancamentos cl join agri_colheita c on c.id=cl.colheita_id join agri_safra_area a on a.id=c.safra_area_id
      join financeiro_lancamentos_v2 l on l.id=cl.lancamento_id
     where cl.papel='icms' and cl.ativo and c.ativo and l.cancelado is not true and c.cliente_id=v_c.cliente_id and a.safra_id=v_c.safra_id and c.nf_produtor=v_c.nf_produtor
     limit 1;
    if v_icms.id is null then return jsonb_build_object('ok', false, 'motivo', 'nf_sem_icms', 'mensagem', format('A NF %s nao tem ICMS lancado.', v_c.nf_produtor)); end if;
    v_valor := coalesce(p_valor, v_icms.valor);
    select coalesce(nome_favorecido, nome) into v_ind from financeiro_fornecedores where id=v_c.industria_id;
    v_id := public._agri_carga_inserir_papel(p_colheita_id, 'icms_recebivel', v_c.cliente_id, v_fazenda_lanc, v_safra_lanc, c_icms_devolvido, v_c.industria_id, v_conta, true, v_valor, v_data, format('ICMS a Receber Mandioca · NF %s · %s', v_c.nf_produtor, coalesce(v_ind,'-')), v_c.nf_produtor, null, v_uid);
  end if;
  return jsonb_build_object('ok', true, 'papel', p_papel, 'lancamento_id', v_id, 'colheita_id', p_colheita_id, 'nf', v_c.nf_produtor);
end $function$;


-- ═══════════════════ ACL: as tres RPCs so' para authenticated (e service_role) ═══════════════════
REVOKE ALL ON FUNCTION public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agri_carga_mandioca_completar(uuid, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agri_carga_mandioca_completar(uuid, text, numeric, uuid) TO authenticated, service_role;

-- ═══════════════════ BACKFILL (estado anterior registrado, gesto contrario linha a linha) ═══════════════════
-- O carimbo de updated_at nos lancamentos tocados vem do gatilho update_fin_lanc_v2_updated_at: esperado e honesto.
CREATE TABLE public.mandioca_icms_repasse_01_backfill (
  id              bigserial PRIMARY KEY,
  passo           text NOT NULL,          -- a_reclassificar | b_recebivel | c_transporte | d_conta | d_cancelar_cru | d_vincular
  nf              text,
  alvo_tabela     text NOT NULL,          -- financeiro_lancamentos_v2 | conciliacao_bancaria_itens
  alvo_id         uuid NOT NULL,
  campo           text NOT NULL,
  valor_anterior  text,                   -- NULO = nao existia
  valor_novo      text,
  gesto_contrario text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mandioca_icms_repasse_01_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mandioca_icms_repasse_01_backfill FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.mandioca_icms_repasse_01_backfill_id_seq FROM PUBLIC, anon, authenticated;

DO $backfill$
DECLARE
  c_nj      constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_uid     constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_sicredi constant uuid := '910e04b0-4148-4e58-885a-8937c8148581';
  c_bb      constant uuid := '3b9afa7a-0af6-4bce-8ec9-03b91484dfd8';
  c_imp     constant uuid := 'b451681a-c29e-4efe-a145-30a9950c6f5c';
  c_pago    constant uuid := '785ba0f5-7307-44a2-a78b-6567d41f44f2';
  -- D2: NF 9344705 (ICMS pago pelo BB em 08/09)
  c_dono_icms   constant uuid := 'ba6db7b8-32bb-4739-8444-0c6a2a85da8c';
  c_cru_icms    constant uuid := '840c65d5-309f-4ed7-aa34-e40a16299fe4';
  c_ext_icms    constant uuid := 'b818ffb6-344a-4e9f-9f96-19f0e78fe626';
  c_cru_transp  constant uuid := '7e6ee456-2e07-4f6e-892f-316c9c575a49';
  c_ext_transp  constant uuid := '77469a51-482c-4e54-a355-b18467890fa4';
  -- As 14 NFs do sistema e a conta onde o Pix de 311,14 do transporte saiu (13 no Sicredi, 1 no BB). As 3 NFs de
  -- 23, 24 e 25/09 NAO estao no sistema e ficam FORA (o Gabriel lanca pelo modal).
  v_nfs text[] := ARRAY['9287581','9294773','9297983','9310349','9320690','9333635','9338087','9344705',
                        '9351905','9354496','9360074','9373486','9375891','9380244'];
  r record; v_n int; v_res jsonb; v_col uuid; v_conta uuid; v_transp_9344705 uuid; v_cbi uuid; v_cbi_cru uuid;
BEGIN
  -- quem grava: o Gabriel (o mesmo uid de reserva do registrar); completar e vincular leem auth.uid()
  PERFORM set_config('request.jwt.claim.sub', c_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_uid, 'role', 'authenticated')::text, true);

  -- ── a. ICMS da nota das 14 NFs: plano b451681a (ERRADO) -> "ICMS a Repassar - Pago". Valor, data, conta e vinculo ficam.
  v_n := 0;
  FOR r IN
    SELECT l.id, l.plano_conta_id, l.compoe_dre, c.nf_produtor nf
      FROM agri_colheita_lancamentos cl JOIN agri_colheita c ON c.id=cl.colheita_id
      JOIN financeiro_lancamentos_v2 l ON l.id=cl.lancamento_id
     WHERE cl.papel='icms' AND cl.ativo AND c.ativo AND l.cancelado IS NOT TRUE
       AND c.cliente_id=c_nj AND c.nf_produtor = ANY(v_nfs)
  LOOP
    IF r.plano_conta_id IS DISTINCT FROM c_imp OR r.compoe_dre IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 a: ICMS % da NF % fora do estado anterior esperado (plano %, compoe_dre %)', r.id, r.nf, r.plano_conta_id, r.compoe_dre;
    END IF;
    INSERT INTO public.mandioca_icms_repasse_01_backfill (passo, nf, alvo_tabela, alvo_id, campo, valor_anterior, valor_novo, gesto_contrario) VALUES
      ('a_reclassificar', r.nf, 'financeiro_lancamentos_v2', r.id, 'plano_conta_id', c_imp::text, c_pago::text,
       'UPDATE plano_conta_id = valor_anterior (o gatilho recalcula compoe_dre pela matriz: volta a true)'),
      ('a_reclassificar', r.nf, 'financeiro_lancamentos_v2', r.id, 'compoe_dre', 'true', 'false', 'recalculado pelo gatilho ao voltar o plano');
    UPDATE financeiro_lancamentos_v2 SET plano_conta_id = c_pago, updated_by = c_uid
     WHERE id = r.id AND plano_conta_id IS DISTINCT FROM c_pago;
    v_n := v_n + 1;
  END LOOP;
  IF v_n <> 14 THEN RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 a: esperava 14 ICMS, achou %', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.mandioca_icms_repasse_01_backfill b JOIN financeiro_lancamentos_v2 l ON l.id=b.alvo_id
              WHERE b.passo='a_reclassificar' AND (l.compoe_dre IS DISTINCT FROM false OR l.plano_conta_id IS DISTINCT FROM c_pago)) THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 a: reclassificado sem compoe_dre = false (regra 1b)';
  END IF;

  -- ── b. recebivel do comprador e c. ICMS de transporte: VAZIO -> nascem pelo completar, na carga que leva o ICMS da NF
  FOR r IN
    SELECT c.nf_produtor nf, c.id colheita
      FROM agri_colheita_lancamentos cl JOIN agri_colheita c ON c.id=cl.colheita_id
     WHERE cl.papel='icms' AND cl.ativo AND c.ativo AND c.cliente_id=c_nj AND c.nf_produtor = ANY(v_nfs)
     ORDER BY c.data_colheita
  LOOP
    v_res := public.agri_carga_mandioca_completar(r.colheita, 'icms_recebivel', NULL, NULL);
    IF NOT (v_res->>'ok')::boolean THEN RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 b: NF % recusou o recebivel: %', r.nf, v_res; END IF;
    INSERT INTO public.mandioca_icms_repasse_01_backfill (passo, nf, alvo_tabela, alvo_id, campo, valor_anterior, valor_novo, gesto_contrario)
    VALUES ('b_recebivel', r.nf, 'financeiro_lancamentos_v2', (v_res->>'lancamento_id')::uuid, 'existencia', NULL, 'criado',
            'cancelar o lancamento e desativar o elo icms_recebivel em agri_colheita_lancamentos');

    v_conta := CASE WHEN r.nf = '9344705' THEN c_bb ELSE c_sicredi END;
    v_res := public.agri_carga_mandioca_completar(r.colheita, 'icms_transporte', 311.14, v_conta);
    IF NOT (v_res->>'ok')::boolean THEN RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 c: NF % recusou o transporte: %', r.nf, v_res; END IF;
    INSERT INTO public.mandioca_icms_repasse_01_backfill (passo, nf, alvo_tabela, alvo_id, campo, valor_anterior, valor_novo, gesto_contrario)
    VALUES ('c_transporte', r.nf, 'financeiro_lancamentos_v2', (v_res->>'lancamento_id')::uuid, 'existencia', NULL, 'criado',
            'cancelar o lancamento e desativar o elo icms_transporte em agri_colheita_lancamentos');
    IF r.nf = '9344705' THEN v_transp_9344705 := (v_res->>'lancamento_id')::uuid; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.mandioca_icms_repasse_01_backfill WHERE passo='b_recebivel') <> 14
     OR (SELECT count(*) FROM public.mandioca_icms_repasse_01_backfill WHERE passo='c_transporte') <> 14 THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 b/c: esperava 14 recebiveis e 14 transportes';
  END IF;

  -- ── d. NF 9344705 (D2): o dono e' o ICMS programado da carga; o cru do BB sai, o vinculo passa para o dono.
  -- d.1 conta do dono: Sicredi (ERRADO) -> BB
  IF (SELECT conta_bancaria_id FROM financeiro_lancamentos_v2 WHERE id=c_dono_icms) IS DISTINCT FROM c_sicredi THEN
    RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 d.1: conta do dono % fora do estado anterior (esperava Sicredi)', c_dono_icms;
  END IF;
  INSERT INTO public.mandioca_icms_repasse_01_backfill (passo, nf, alvo_tabela, alvo_id, campo, valor_anterior, valor_novo, gesto_contrario)
  VALUES ('d_conta', '9344705', 'financeiro_lancamentos_v2', c_dono_icms, 'conta_bancaria_id', c_sicredi::text, c_bb::text,
          'depois de desfazer o vinculo do dono: UPDATE conta_bancaria_id = valor_anterior (e status programado, data_pagamento nula)');
  UPDATE financeiro_lancamentos_v2 SET conta_bancaria_id = c_bb, updated_by = c_uid
   WHERE id = c_dono_icms AND conta_bancaria_id IS DISTINCT FROM c_bb;

  -- d.2 / d.3 para o ICMS e, depois, para o transporte: cancelar o cru (o gatilho desfaz o vinculo) e vincular o dono
  FOR r IN
    SELECT * FROM (VALUES
      (c_cru_icms,   c_ext_icms,   c_dono_icms,      2016.00::numeric, format('duplicado: substituido pelo ICMS da carga NF 9344705 (%s)', left(c_dono_icms::text, 8))),
      (c_cru_transp, c_ext_transp, v_transp_9344705, 311.14::numeric,  format('duplicado: substituido pelo ICMS de transporte da carga NF 9344705 (%s)', left(v_transp_9344705::text, 8)))
    ) x(cru, ext, dono, valor, motivo)
  LOOP
    SELECT id INTO v_cbi_cru FROM conciliacao_bancaria_itens
     WHERE lancamento_id = r.cru AND extrato_id = r.ext AND desfeito_em IS NULL;
    IF v_cbi_cru IS NULL OR (SELECT cancelado FROM financeiro_lancamentos_v2 WHERE id=r.cru) IS TRUE
       OR (SELECT origem_lancamento FROM financeiro_lancamentos_v2 WHERE id=r.cru) <> 'extrato' THEN
      RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 d: cru % fora do estado anterior (vivo, de extrato, vinculado a %)', r.cru, r.ext;
    END IF;
    INSERT INTO public.mandioca_icms_repasse_01_backfill (passo, nf, alvo_tabela, alvo_id, campo, valor_anterior, valor_novo, gesto_contrario) VALUES
      ('d_cancelar_cru', '9344705', 'financeiro_lancamentos_v2', r.cru, 'cancelado', 'false', 'true',
       'UPDATE cancelado = false, cancelado_em/por/motivo = NULL (depois de desfazer o vinculo do dono)'),
      ('d_cancelar_cru', '9344705', 'conciliacao_bancaria_itens', v_cbi_cru, 'desfeito_em', NULL, 'lancamento_cancelado',
       'refazer o vinculo do cru pelo fn_vincular_extrato_lancamento (o item desfeito fica como historico)');
    UPDATE financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = c_uid, cancelado_motivo = r.motivo, updated_by = c_uid
     WHERE id = r.cru AND cancelado IS NOT TRUE;
    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE extrato_id = r.ext AND desfeito_em IS NULL) THEN
      RAISE EXCEPTION 'MANDIOCA-ICMS-REPASSE-01 d: o gatilho nao desfez o vinculo do cru %', r.cru;
    END IF;
    -- o caminho NORMAL de vinculo de hoje (o da Estacao): tipo_aprovacao 'manual'; o gatilho promove o dono a realizado
    v_res := public.fn_vincular_extrato_lancamento(r.ext, r.dono, r.valor, false);
    v_cbi := (v_res->>'cbi_id')::uuid;
    INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
    VALUES ('conciliacao_criada', c_uid, c_nj, r.ext, r.dono, v_cbi, 'MANDIOCA-ICMS-REPASSE-01: ' || r.motivo, v_res);
    INSERT INTO public.mandioca_icms_repasse_01_backfill (passo, nf, alvo_tabela, alvo_id, campo, valor_anterior, valor_novo, gesto_contrario)
    VALUES ('d_vincular', '9344705', 'conciliacao_bancaria_itens', v_cbi, 'vinculo', NULL, r.dono::text || ' <- ' || r.ext::text,
            'desfazer o vinculo (desfeito_em) — o dono volta a programado pela mao, sem data de pagamento');
  END LOOP;
END $backfill$;
