-- MANDIOCA-RETENCAO-NF-01 — a retencao da NF-e do comprador (Funrural 1,63% em ago, SENAR 0,2% em set) entra como o papel
-- 'funrural' da carga, UMA VEZ POR NF; e o motor de blocos aceita, no 'exato', o lancamento de sinal oposto (a venda e a
-- retencao contra o deposito liquido — o que o caminho 1:N ja' fazia na Olinda).
--
-- Fato (NF-e de entrada do comprador, lidas pelo Chat em 01/10): o comprador retem e deposita o LIQUIDO; cada deposito da
-- T Cortez e' a soma dos liquidos de NF-e inteiras (28/08 20.998,80 = NF-e 7.194 = 21.346,75 - 347,95). O "falta 347,95" da
-- Venda 19,82 t no bloco de 28/08 NAO e' recebivel em aberto: e' o Funrural retido.
--
-- 1. Medido: o registrar grava o Funrural como papel 'funrural', plano b451681a ("Impostos e Despesas de Vendas
--    Agricultura", deducao, compoe_dre true), saida, favorecido = comprador, conta da carga — POR CARGA. Reusado tal qual.
--    O registrar passa a lancar o Funrural UMA VEZ POR NF (a mesma pergunta do ICMS, _agri_carga_papel_na_nf).
-- 2. agri_carga_mandioca_completar ganha o papel 'funrural' com valor, rotulo e NF-e ("Funrural retido 1,63% · NF <nf> ·
--    NF-e <nfe>"), uma vez por NF; recusa se a NF ja' tem retencao. Assinatura nova (p_rotulo, p_nfe) => DROP + CREATE.
-- 3. Backfill pelo completar: as 16 NFs (estado anterior VAZIO). 9392097, 9396275 e 9401261 foram registradas em 01/10,
--    depois da medicao do briefing; os valores dele conferem com as vendas (decisao do Gabriel: as 16). Estado anterior
--    em mandioca_retencao_nf_01_backfill.
-- 4. fn_conciliar_bloco: no 'exato', soma(extratos) = soma(mesma direcao) - soma(direcao oposta) (tol 0,005); o oposto
--    vincula INTEIRO ao extrato mais antigo do bloco. 'mais_antigo_primeiro' continua uma direcao so'.
-- Nao muda: venda, servicos, ICMS, ICMS de transporte, a Olinda (Funrural 335,54 ja' conciliado), os blocos ja' gravados.
-- GESTO CONTRARIO: cancelar os lancamentos de mandioca_retencao_nf_01_backfill e desativar o elo 'funrural' deles; voltar
--   os tres corpos (registrar 16df0438, completar 5c2bd8a6 com a assinatura antiga, fn_conciliar_bloco 2d9d5408 — no ledger).

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric)'::regprocedure) <> '16df0438482d859f0770452dd9e83997' THEN
    RAISE EXCEPTION 'MANDIOCA-RETENCAO-NF-01: corpo de origem do registrar divergente — abortado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.agri_carga_mandioca_completar(uuid, text, numeric, uuid)'::regprocedure) <> '5c2bd8a65649e6cd50a6bccf4a405b0a' THEN
    RAISE EXCEPTION 'MANDIOCA-RETENCAO-NF-01: corpo de origem do completar divergente — abortado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliar_bloco(uuid[], uuid[], text, boolean)'::regprocedure) <> '2d9d54084c7c40e0d7e2b0b473cf7a42' THEN
    RAISE EXCEPTION 'MANDIOCA-RETENCAO-NF-01: corpo de origem de fn_conciliar_bloco divergente — abortado';
  END IF;
END $guarda$;

-- ═══════════════════ 1. REGISTRAR (corpo integral; so' o Funrural uma vez por NF) ═══════════════════
CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_registrar(p_cliente uuid, p_safra_area_id uuid, p_data date, p_industria_id uuid, p_nf text, p_ticket text, p_peso_bruto_kg numeric, p_desconto_kg numeric, p_rendimento_g integer, p_preco_g numeric, p_servicos jsonb, p_icms numeric, p_funrural numeric, p_observacao text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_inss numeric DEFAULT NULL::numeric, p_icms_transporte numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_area record; v_liq numeric; v_t numeric; v_valor numeric; v_col uuid; v_uid uuid := coalesce(auth.uid(), '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'); v_ids uuid[] := '{}'; v_id uuid; v_s jsonb; v_plano uuid; v_papel text; v_desc text; v_forn text; v_ind text; v_serv_total numeric := 0; v_icms_ja boolean; v_transp_ja boolean; v_fun_ja boolean; v_tstr text; v_rot text;
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
  -- MANDIOCA-RETENCAO-NF-01: o Funrural/SENAR e' RETENCAO DA NOTA (o comprador retem e deposita o liquido) — UMA VEZ POR NF,
  -- a mesma pergunta do ICMS (decisao do Gabriel, 01/10). Antes era por carga.
  v_fun_ja := public._agri_carga_papel_na_nf(p_cliente, v_area.safra_id, p_nf, 'funrural', v_col);
  if coalesce(p_funrural,0) > 0 and not v_fun_ja then
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
  return jsonb_build_object('colheita_id', v_col, 'lancamento_ids', to_jsonb(v_ids), 'toneladas', v_t, 'valor_bruto', v_valor, 'servicos_total', v_serv_total, 'icms_lancado', coalesce(p_icms,0) > 0 and not v_icms_ja, 'icms_transporte_lancado', coalesce(p_icms_transporte,0) > 0 and not v_transp_ja, 'funrural_lancado', coalesce(p_funrural,0) > 0 and not v_fun_ja);
end$function$;

-- ═══════════════════ 2. COMPLETAR (assinatura nova: p_rotulo, p_nfe) ═══════════════════
DROP FUNCTION public.agri_carga_mandioca_completar(uuid, text, numeric, uuid);
CREATE FUNCTION public.agri_carga_mandioca_completar(p_colheita_id uuid, p_papel text, p_valor numeric DEFAULT NULL::numeric, p_conta_id uuid DEFAULT NULL::uuid, p_rotulo text DEFAULT NULL::text, p_nfe text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
-- MANDIOCA-ICMS-REPASSE-01: acrescenta a uma NF JA REGISTRADA so' o papel que falta — 'icms_transporte' e/ou
-- 'icms_recebivel' —, uma vez por NF, pela funcao interna unica. Recusa o papel que ja' existe na NF.
-- MANDIOCA-RETENCAO-NF-01: e 'funrural' — a RETENCAO da NF-e do comprador (Funrural 1,63% em ago, SENAR 0,2% em set),
-- com valor e rotulo informados; o mesmo papel e o mesmo plano do Funrural do registrar (deducao, b451681a).
declare v_c record; v_uid uuid := auth.uid(); v_icms record; v_venda record; v_id uuid; v_data date; v_ind text; v_conta uuid; v_valor numeric;
  v_safra_lanc uuid; v_fazenda_lanc uuid;
  c_frete constant uuid := '9c350708-9717-4ab9-adf4-09b25ccb024c'; c_sefaz constant uuid := '948cab3f-52e3-46bd-b4b8-3e022828125b';
  c_icms_devolvido constant uuid := 'be23cc96-93b3-4d5f-adee-858210114dce';
  c_imp constant uuid := 'b451681a-c29e-4efe-a145-30a9950c6f5c';
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
  if p_papel not in ('icms_transporte', 'icms_recebivel', 'funrural') then
    return jsonb_build_object('ok', false, 'motivo', 'papel_invalido', 'mensagem', format('Papel %s nao se completa: so icms_transporte, icms_recebivel e funrural.', coalesce(p_papel,'-')));
  end if;
  if coalesce(v_c.nf_produtor, '') = '' then return jsonb_build_object('ok', false, 'motivo', 'carga_sem_nf', 'mensagem', 'A carga nao tem NF.'); end if;
  if public._agri_carga_papel_na_nf(v_c.cliente_id, v_c.safra_id, v_c.nf_produtor, p_papel, null) then
    return jsonb_build_object('ok', false, 'motivo', 'papel_ja_existe',
      'mensagem', format('%s ja lancado na NF %s — uma vez por nota.', case p_papel when 'icms_transporte' then 'ICMS de transporte' when 'funrural' then 'Retencao (Funrural/SENAR)' else 'Recebivel do ICMS' end, v_c.nf_produtor));
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
  if p_papel = 'funrural' then
    if coalesce(p_valor, 0) <= 0 then return jsonb_build_object('ok', false, 'motivo', 'valor_obrigatorio', 'mensagem', 'Informe o valor retido.'); end if;
    if coalesce(btrim(p_rotulo), '') = '' then return jsonb_build_object('ok', false, 'motivo', 'rotulo_obrigatorio', 'mensagem', 'Informe o rotulo da retencao (ex.: Funrural retido 1,63%).'); end if;
    -- saida, programado, conta da venda, favorecido = comprador (quem retem), competencia = data da carga da NF
    v_id := public._agri_carga_inserir_papel(p_colheita_id, 'funrural', v_c.cliente_id, v_fazenda_lanc, v_safra_lanc, c_imp, v_c.industria_id, v_conta, false, p_valor, v_data,
      format('%s · NF %s', btrim(p_rotulo), v_c.nf_produtor) || coalesce(' · NF-e ' || nullif(btrim(p_nfe), ''), ''), v_c.nf_produtor, true, v_uid);
  elsif p_papel = 'icms_transporte' then
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

-- ═══════════════════ 4. MOTOR DE BLOCOS (corpo integral; 'exato' com sinal oposto) ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_conciliar_bloco(p_extratos uuid[], p_lancamentos uuid[], p_regra text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cli uuid; v_conta uuid; v_sinal_ext int; v_n_ext int; v_n_lan int;
  r record;
  -- extratos e lancamentos na ORDEM da alocacao
  e_id uuid[] := '{}'; e_data date[] := '{}'; e_valor numeric[] := '{}'; e_rest numeric[] := '{}';
  l_id uuid[] := '{}'; l_desc text[] := '{}'; l_saldo numeric[] := '{}'; l_rest numeric[] := '{}'; l_quitou date[] := '{}';
  l_dir int[] := '{}'; v_d int;
  i int := 1; j int := 1; m numeric;
  v_soma_ext numeric := 0; v_soma_lan numeric := 0;
  v_matriz jsonb := '[]'::jsonb; v_quitados jsonb := '[]'::jsonb; v_parcial jsonb := NULL; v_resumo jsonb; v_ret jsonb;
  v_bloco uuid; v_estado jsonb := '{}'::jsonb; v_soma numeric; v_status text;
  c_tol constant numeric := 0.005;
BEGIN
  IF p_regra IS NULL OR p_regra NOT IN ('exato', 'mais_antigo_primeiro') THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('regra_invalida: a regra %s nao existe (exato | mais_antigo_primeiro).', coalesce(p_regra, '-'));
  END IF;
  v_n_ext := coalesce(array_length(p_extratos, 1), 0);
  v_n_lan := coalesce(array_length(p_lancamentos, 1), 0);
  IF v_n_ext = 0 OR v_n_lan = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'bloco_vazio: o bloco precisa de pelo menos um extrato e um lancamento.';
  END IF;
  IF v_n_ext <> (SELECT count(DISTINCT x) FROM unnest(p_extratos) x) OR v_n_lan <> (SELECT count(DISTINCT x) FROM unnest(p_lancamentos) x) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'membro_repetido: o mesmo extrato ou lancamento aparece duas vezes no bloco.';
  END IF;

  -- ── extratos, por data (desempate id)
  FOR r IN SELECT e.* FROM extrato_bancario_v2 e WHERE e.id = ANY(p_extratos) ORDER BY e.data_movimento, e.id LOOP
    IF r.cancelado_em IS NOT NULL OR r.ignorado_em IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('extrato_inativo: o extrato de %s (%s) esta cancelado ou ignorado.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    IF v_cli IS NULL THEN v_cli := r.cliente_id; v_conta := r.conta_bancaria_id; v_sinal_ext := sign(r.valor); END IF;
    IF r.cliente_id IS DISTINCT FROM v_cli THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'cliente_divergente: os extratos do bloco sao de clientes diferentes.';
    END IF;
    IF r.conta_bancaria_id IS DISTINCT FROM v_conta THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('conta_diferente: o extrato de %s (%s) e'' de outra conta bancaria — um bloco e'' de uma conta so''.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    IF sign(r.valor) = 0 OR sign(r.valor) <> v_sinal_ext THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'direcao_mista: o bloco mistura entradas e saidas do banco.';
    END IF;
    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = r.id AND c.desfeito_em IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('extrato_ja_vinculado: o extrato de %s (%s) ja tem vinculo — desfaca antes.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    e_id := e_id || r.id; e_data := e_data || r.data_movimento; e_valor := e_valor || abs(r.valor); e_rest := e_rest || abs(r.valor);
    v_soma_ext := v_soma_ext + abs(r.valor);
  END LOOP;
  IF coalesce(array_length(e_id, 1), 0) <> v_n_ext THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'extrato_nao_encontrado: algum extrato do bloco nao existe.';
  END IF;
  IF NOT public.tenant_ok(v_cli) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;

  -- ── lancamentos, por competencia (desempate vencimento, created_at, maior valor, id), com o SALDO LIVRE (abs(valor) - aplicado vivo)
  FOR r IN
    SELECT l.*, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM conciliacao_bancaria_itens c
                                          WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS saldo_livre
      FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(p_lancamentos)
     -- CONC-BLOCOS-TELA-01 (decisao do Gabriel, 01/10): competencia -> vencimento -> created_at (a ordem real de
     -- lancamento das cargas do modal) -> MAIOR valor (as 10 NFs do backfill de 16/09 empatam no created_at) -> id.
     ORDER BY l.data_competencia NULLS LAST, l.data_vencimento NULLS LAST, l.created_at NULLS LAST, abs(l.valor) DESC, l.id
  LOOP
    IF r.cancelado IS TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_cancelado: "%s" esta cancelado.', coalesce(r.descricao, r.id::text));
    END IF;
    IF r.cliente_id IS DISTINCT FROM v_cli THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('cliente_divergente: "%s" e'' de outro cliente.', coalesce(r.descricao, r.id::text));
    END IF;
    IF coalesce(r.cenario, 'realizado') = 'meta' THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_meta: "%s" e'' do cenario meta — meta nao se concilia.', coalesce(r.descricao, r.id::text));
    END IF;
    IF r.conta_efetiva_id IS DISTINCT FROM v_conta THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('conta_diferente: "%s" e'' de outra conta bancaria (a conta dele, pela direcao, nao e'' a do extrato).', coalesce(r.descricao, r.id::text));
    END IF;
    -- MANDIOCA-RETENCAO-NF-01: na regra 'exato' o lancamento de SINAL OPOSTO entra (a retencao da NF contra o deposito
    -- liquido: venda + e Funrural - no mesmo bloco); a conta passa a ser com sinal. No 'mais_antigo_primeiro', uma direcao so'.
    v_d := CASE WHEN (v_sinal_ext < 0 AND r.sinal = '-1') OR (v_sinal_ext > 0 AND r.sinal = '1') THEN 1
                WHEN (v_sinal_ext < 0 AND r.sinal = '1') OR (v_sinal_ext > 0 AND r.sinal = '-1') THEN -1
                ELSE 0 END;
    IF v_d = 0 OR (v_d = -1 AND p_regra <> 'exato') THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('direcao_incoerente: "%s" e'' %s e o extrato e'' %s.', coalesce(r.descricao, r.id::text),
        CASE WHEN r.sinal = '1' THEN 'entrada' ELSE 'saida' END, CASE WHEN v_sinal_ext > 0 THEN 'entrada' ELSE 'saida' END);
    END IF;
    IF EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = r.cliente_id AND f.fazenda_id = r.fazenda_id
                AND f.ano_mes = r.ano_mes AND f.status_fechamento = 'fechado') THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('mes_fechado: "%s" e'' da competencia %s, mes fechado.', coalesce(r.descricao, r.id::text), r.ano_mes);
    END IF;
    IF r.saldo_livre <= c_tol THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('sem_saldo_livre: "%s" ja esta inteiro conciliado.', coalesce(r.descricao, r.id::text));
    END IF;
    l_id := l_id || r.id; l_desc := l_desc || coalesce(r.descricao, ''); l_saldo := l_saldo || r.saldo_livre;
    l_rest := l_rest || r.saldo_livre; l_quitou := l_quitou || NULL::date; l_dir := l_dir || v_d;
    v_estado := v_estado || jsonb_build_object(r.id::text, jsonb_build_object('status_transacao', r.status_transacao, 'data_pagamento', r.data_pagamento));
    v_soma_lan := v_soma_lan + v_d * r.saldo_livre;
  END LOOP;
  IF coalesce(array_length(l_id, 1), 0) <> v_n_lan THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'lancamento_nao_encontrado: algum lancamento do bloco nao existe.';
  END IF;

  -- ── a regra
  IF p_regra = 'exato' AND abs(v_soma_ext - v_soma_lan) > c_tol THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('soma_diverge: os extratos somam %s e os lancamentos (saldo livre) %s — diferenca %s. A regra exato exige soma igual.',
      v_soma_ext, v_soma_lan, v_soma_ext - v_soma_lan);
  END IF;
  IF p_regra = 'mais_antigo_primeiro' AND v_soma_ext > v_soma_lan + c_tol THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('soma_extratos_maior: os extratos somam %s e os lancamentos so'' %s — sobrariam %s do banco sem lancamento. Acrescente o lancamento que falta.',
      v_soma_ext, v_soma_lan, v_soma_ext - v_soma_lan);
  END IF;

  -- ── o sinal oposto (so' no 'exato'): cada um vincula INTEIRO ao extrato mais antigo do bloco e aumenta o que ele cobre
  --    (o deposito liquido + a retencao = o bruto das vendas). Assim a alocacao gulosa abaixo fecha com as vendas quitadas.
  FOR j IN 1..v_n_lan LOOP
    IF l_dir[j] = -1 THEN
      v_matriz := v_matriz || jsonb_build_object('extrato_id', e_id[1], 'extrato_data', e_data[1], 'extrato_valor', e_valor[1],
                                                 'lancamento_id', l_id[j], 'descricao', l_desc[j], 'valor_aplicado', round(l_rest[j], 2));
      e_rest[1] := e_rest[1] + l_rest[j]; l_rest[j] := 0; l_quitou[j] := e_data[1];
    END IF;
  END LOOP;
  j := 1;

  -- ── alocacao gulosa: extrato mais antigo no lancamento mais antigo
  WHILE i <= v_n_ext AND j <= v_n_lan LOOP
    m := least(e_rest[i], l_rest[j]);
    IF m > c_tol THEN
      v_matriz := v_matriz || jsonb_build_object('extrato_id', e_id[i], 'extrato_data', e_data[i], 'extrato_valor', e_valor[i],
                                                 'lancamento_id', l_id[j], 'descricao', l_desc[j], 'valor_aplicado', round(m, 2));
      e_rest[i] := e_rest[i] - m; l_rest[j] := l_rest[j] - m;
      IF l_rest[j] <= c_tol THEN l_quitou[j] := e_data[i]; END IF;
    END IF;
    IF e_rest[i] <= c_tol THEN i := i + 1; END IF;
    IF l_rest[j] <= c_tol THEN j := j + 1; END IF;
  END LOOP;

  FOR j IN 1..v_n_lan LOOP
    IF l_rest[j] <= c_tol THEN
      v_quitados := v_quitados || jsonb_build_object('lancamento_id', l_id[j], 'descricao', l_desc[j], 'data_pagamento', l_quitou[j]);
    ELSIF l_rest[j] >= l_saldo[j] - c_tol THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_sem_alocacao: "%s" nao recebe nada destes extratos — tire-o do bloco.', l_desc[j]);
    ELSE
      v_parcial := jsonb_build_object('lancamento_id', l_id[j], 'descricao', l_desc[j], 'aplicado', round(l_saldo[j] - l_rest[j], 2), 'falta', round(l_rest[j], 2));
    END IF;
  END LOOP;

  v_resumo := jsonb_build_object('soma_extratos', v_soma_ext, 'soma_lancamentos', v_soma_lan, 'diferenca', v_soma_ext - v_soma_lan,
                                 'quitados', v_quitados, 'parcial', v_parcial);
  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'regra', p_regra, 'conta_bancaria_id', v_conta,
                              'matriz', v_matriz, 'resumo', v_resumo);
  IF coalesce(p_simular, true) THEN RETURN v_ret; END IF;

  -- ── gravacao
  INSERT INTO conciliacao_blocos (cliente_id, conta_bancaria_id, regra, criado_por, estado_anterior, resumo)
  VALUES (v_cli, v_conta, p_regra, v_uid, v_estado, v_ret) RETURNING id INTO v_bloco;

  PERFORM set_config('app.conciliar_bloco', 'on', true);
  INSERT INTO conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, grupo_id,
                                          criado_por, tipo_aprovacao, aprovado_por, aprovado_em)
  SELECT v_cli, (x->>'extrato_id')::uuid, (x->>'lancamento_id')::uuid, (x->>'valor_aplicado')::numeric, v_bloco,
         v_uid, 'agrupamento_manual', v_uid, now()
    FROM jsonb_array_elements(v_matriz) x;
  PERFORM set_config('app.conciliar_bloco', 'off', true);

  -- promove SO' o quitado, com a data do extrato que quitou; o parcial fica como estava. O valor NUNCA muda.
  UPDATE financeiro_lancamentos_v2 l
     SET status_transacao = 'realizado', data_pagamento = (q->>'data_pagamento')::date, updated_by = v_uid, updated_at = now()
    FROM jsonb_array_elements(v_quitados) q
   WHERE l.id = (q->>'lancamento_id')::uuid AND l.status_transacao IN ('programado', 'agendado')
     AND l.cancelado IS NOT TRUE AND coalesce(l.cenario, 'realizado') <> 'meta';

  FOR i IN 1..v_n_ext LOOP
    SELECT coalesce(sum(valor_aplicado), 0) INTO v_soma FROM conciliacao_bancaria_itens WHERE extrato_id = e_id[i] AND desfeito_em IS NULL;
    v_status := CASE WHEN v_soma <= 0 THEN 'nao_conciliado' WHEN v_soma + c_tol >= e_valor[i] THEN 'conciliado' ELSE 'parcial' END;
    UPDATE extrato_bancario_v2 SET status = v_status WHERE id = e_id[i] AND status IS DISTINCT FROM v_status;
  END LOOP;

  RETURN v_ret || jsonb_build_object('bloco_id', v_bloco);
END
$function$;

DO $confere$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric)'::regprocedure) <> '5e04825cd17e6c748e59fff83ab84588' THEN
    RAISE EXCEPTION 'MANDIOCA-RETENCAO-NF-01: corpo de destino do registrar divergente — abortado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.agri_carga_mandioca_completar(uuid, text, numeric, uuid, text, text)'::regprocedure) <> 'a88191a847c2e6a29c7cfe5dc62740f0' THEN
    RAISE EXCEPTION 'MANDIOCA-RETENCAO-NF-01: corpo de destino do completar divergente — abortado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliar_bloco(uuid[], uuid[], text, boolean)'::regprocedure) <> 'bfa36381d5362caffdf752d0042ed2c3' THEN
    RAISE EXCEPTION 'MANDIOCA-RETENCAO-NF-01: corpo de destino de fn_conciliar_bloco divergente — abortado';
  END IF;
END $confere$;

REVOKE ALL ON FUNCTION public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agri_carga_mandioca_completar(uuid, text, numeric, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_conciliar_bloco(uuid[], uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agri_carga_mandioca_completar(uuid, text, numeric, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_conciliar_bloco(uuid[], uuid[], text, boolean) TO authenticated, service_role;

-- ═══════════════════ 3. BACKFILL (estado anterior: VAZIO; gesto contrario linha a linha) ═══════════════════
CREATE TABLE public.mandioca_retencao_nf_01_backfill (
  id              bigserial PRIMARY KEY,
  nf              text NOT NULL,
  nfe             text NOT NULL,
  lancamento_id   uuid NOT NULL,
  valor           numeric NOT NULL,
  rotulo          text NOT NULL,
  valor_anterior  text,                 -- NULO = nao existia
  gesto_contrario text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mandioca_retencao_nf_01_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mandioca_retencao_nf_01_backfill FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.mandioca_retencao_nf_01_backfill_id_seq FROM PUBLIC, anon, authenticated;

DO $backfill$
DECLARE
  c_nj  constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_uid constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  r record; v_col uuid; v_res jsonb; v_n int := 0;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', c_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_uid, 'role', 'authenticated')::text, true);
  FOR r IN SELECT * FROM (VALUES
      ('9294773','7.194',347.95,'Funrural retido 1,63%'),('9297983','7.213',315.98,'Funrural retido 1,63%'),('9310349','7.242',341.85,'Funrural retido 1,63%'),
      ('9320690','7.291',43.30,'SENAR retido 0,2%'),('9333635','7.338',44.11,'SENAR retido 0,2%'),('9338087','7.350',42.88,'SENAR retido 0,2%'),
      ('9344705','7.379',45.38,'SENAR retido 0,2%'),('9351905','7.416',44.54,'SENAR retido 0,2%'),('9354496','7.432',43.47,'SENAR retido 0,2%'),
      ('9360074','7.439',42.98,'SENAR retido 0,2%'),('9373486','7.473',42.21,'SENAR retido 0,2%'),('9375891','7.510',43.25,'SENAR retido 0,2%'),
      ('9380244','7.519',42.13,'SENAR retido 0,2%'),('9392097','7.570',42.13,'SENAR retido 0,2%'),('9396275','7.600',40.88,'SENAR retido 0,2%'),
      ('9401261','7.618',41.92,'SENAR retido 0,2%')) x(nf, nfe, valor, rotulo)
  LOOP
    -- a carga que leva o ICMS da NF (a primeira) — a mesma do backfill do repasse
    SELECT c.id INTO v_col FROM agri_colheita c JOIN agri_colheita_lancamentos cl ON cl.colheita_id = c.id AND cl.papel = 'icms' AND cl.ativo
     WHERE c.cliente_id = c_nj AND c.nf_produtor = r.nf AND c.ativo ORDER BY c.data_colheita LIMIT 1;
    CONTINUE WHEN v_col IS NULL;  -- NF sem carga com ICMS: a guarda abaixo reprova
    v_res := public.agri_carga_mandioca_completar(v_col, 'funrural', r.valor, NULL, r.rotulo, r.nfe);
    IF NOT (v_res->>'ok')::boolean THEN RAISE EXCEPTION 'MANDIOCA-RETENCAO-NF-01: NF % recusou a retencao: %', r.nf, v_res; END IF;
    INSERT INTO public.mandioca_retencao_nf_01_backfill (nf, nfe, lancamento_id, valor, rotulo, valor_anterior, gesto_contrario)
    VALUES (r.nf, r.nfe, (v_res->>'lancamento_id')::uuid, r.valor, r.rotulo, NULL,
            'cancelar o lancamento e desativar o elo funrural em agri_colheita_lancamentos');
    v_n := v_n + 1;
  END LOOP;
  IF v_n <> 16 THEN RAISE EXCEPTION 'MANDIOCA-RETENCAO-NF-01: esperava 16 NFs registradas, gravou %', v_n; END IF;
END $backfill$;
