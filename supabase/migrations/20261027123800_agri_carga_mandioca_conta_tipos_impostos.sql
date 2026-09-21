-- CARGA DE MANDIOCA: conta bancaria, tres tipos de servico e dois impostos novos.
--
-- ⚠ O P0 E' A CONTA, e ele vale sozinho. Nenhum dos INSERTs gravava `conta_bancaria_id` nem
--   `conta_destino_id`. As 96 linhas que existem hoje so' tem conta porque o backfill
--   20261027122700 bloco (d) as carimbou em 17/09/2026 — um evento unico. A PROXIMA carga
--   nasceria sem conta, e `fn_extrato_conciliar_mes` escolhe candidatos por `conta_efetiva_id`:
--   o compromisso sumiria da conciliacao EM SILENCIO, sem erro nenhum.
-- ⚠ E A CONTA VAI NA COLUNA CERTA DESDE O INSERT, por direcao: entrada (a venda) em
--   `conta_destino_id`, saida (servicos e impostos) em `conta_bancaria_id`. O trigger
--   `trg_00_conta_por_direcao` faria a correcao de qualquer jeito, mas depender dele seria gravar
--   errado e contar com o conserto — e o trigger NAO INVENTA conta, so' move entre as colunas.
--
-- TRES TIPOS DE SERVICO, TRES SUBCENTROS. O loop aceitava 'arranquio|frete|carregamento' e
-- resolvia o plano com `case when 'frete' then c_frete else c_colh end` — DOIS destinos para TRES
-- servicos, entao trator e mao de obra caiam ambos em Operacoes de Colheita (13110). Agora:
--     frete    -> 13090 Transporte Agricola Agricultura      (9c350708, pos_colheita)
--     trator   -> 13160 Servicos Mecanizados Terceirizados   (25dc0eee, custeio)
--     mao_obra -> 13100 Diaristas e Empreita Lavoura         (6fde19c6, custeio)
-- ⚠ OS NOMES MUDARAM JUNTO: 'arranquio' virou 'mao_obra' e 'carregamento' virou 'trator'. Os
--   nomes antigos existem SO' nos 42 lancamentos do backfill, e a reclassificacao deles e' frente
--   propria. O unico chamador vivo dos nomes antigos era `TIPOS_SERVICO` no front, que muda no
--   mesmo PR. Ate' a reclassificacao, a PROPOSTA de preco de trator e mao de obra vem vazia (ela
--   procura por `papel`), e o operador digita — que e' o que ele ja' faz ao reabrir uma carga.
-- ⚠ `c_colh` SAIU: com o mapa de tres, o 13110 deixou de ser destino de servico novo e a constante
--   ficou sem uso. Os 42 lancamentos antigos continuam la' ate' a frente de reclassificacao.
-- ⚠ E A DESCRICAO DEIXOU DE USAR `initcap(v_papel)`: com 'mao_obra' ele escreveria "Mao_Obra".
--   Entra um rotulo por tipo (Frete / Trator / Mao de obra).
--
-- DOIS IMPOSTOS NOVOS, E ELES NAO VAO PARA O MESMO LUGAR — e' a decisao que este arquivo registra:
--     p_inss            -> papel 'inss',            plano c_imp (10030, bloco DEDUCAO), como o
--                          Funrural: retido da venda, favorecido = a industria.
--     p_icms_transporte -> papel 'icms_transporte', plano c_frete (13090, bloco POS_COLHEITA),
--                          junto do frete, porque e' CUSTO sobre o transporte e nao deducao de
--                          receita. Favorecido = Sefaz MS, o mesmo do ICMS de venda.
--   Poe-los no mesmo subcentro somaria duas naturezas na mesma linha do DRE.
-- ⚠ O ICMS DE TRANSPORTE NAO TEM A TRAVA POR NF que o ICMS de venda tem (`v_icms_ja`): a trava
--   existe porque o ICMS da venda e' um por NOTA, e a nota pode ter varias cargas. O transporte e'
--   por CARGA. Se um dia ele tambem virar por nota, a trava e' que tera' de ser escrita — nao esta
--   ausente por esquecimento.
--
-- ⚠ O DROP DA ASSINATURA ANTIGA E' OBRIGATORIO: tres parametros com DEFAULT criam SOBRECARGA em
--   vez de substituir, e com as duas funcoes vivas uma chamada de 14 argumentos fica AMBIGUA e o
--   PostgREST erra. E o DROP leva o GRANT junto — sem os comandos do rodape, `authenticated`
--   perde o EXECUTE e a tela recebe 42501. ACL conferida no proto antes de escrever:
--   {postgres=X, service_role=X, authenticated=X}, sem PUBLIC, nas tres funcoes da familia.
-- ⚠ `agri_carga_mandioca_cancelar` NAO MUDA: ela recebe so' (p_colheita_id, p_motivo).
--
-- O que NAO muda: nenhum calculo (o valor do servico segue `round(v_t * preco_t, 2)`), nenhuma
-- validacao de peso/rendimento/preco/industria, a trava do ICMS de venda por NF, e o
-- `cancelar + registrar` que o `corrigir` sempre foi.
--
-- Aplicada no proto pelo arquiteto em 21/09/2026, sob GO do Gabriel; esta migration e' REGISTRO
-- HISTORICO e NAO foi reaplicada ao ser escrita.
--
-- Corpo de ORIGEM conferido por md5 contra o proto antes de editar:
--   registrar (prosrc): md5 8e04a200a40fafd3b5b9ef313db7405a, len 6486
--   corrigir  (prosrc): md5 af8f482bdb4e6fc0a485e7dc67df48cf, len 597
-- Corpo VIGENTE conferido por md5 contra o proto depois de aplicar:
--   registrar (prosrc): md5 ee110755166e741402177c366b2d6d56, len 8509
--   corrigir  (prosrc): md5 d31d6567ba8c3a71f43f875e70eda3fc, len 636
--
-- ⚠ A PRIMEIRA APLICACAO SAIU ERRADA E VALE REGISTRAR, porque o defeito nao estava no SQL: o
--   canal usado para aplicar comeu o U+00B7. Os oito `·` das descricoes viraram ponto ASCII e
--   os cinco comentarios internos sumiram — 8300 chars em vez de 8509. A conferencia por md5
--   pegou (d1b6856d contra ee110755), e a diferenca foi provada por reconstrucao: aplicando as
--   duas transformacoes ao corpo correto, o md5 dava exatamente o da primeira aplicacao.
--   Reaplicado com `String.fromCharCode(183)`. A licao e' que conferir md5 de prosrc nao e'
--   zelo: `·` e `.` sao indistinguiveis a olho num diff de 8 mil caracteres, e a descricao
--   errada iria para dentro de cada lancamento de cada carga nova.

DROP FUNCTION IF EXISTS public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_registrar(p_cliente uuid, p_safra_area_id uuid, p_data date, p_industria_id uuid, p_nf text, p_ticket text, p_peso_bruto_kg numeric, p_desconto_kg numeric, p_rendimento_g integer, p_preco_g numeric, p_servicos jsonb, p_icms numeric, p_funrural numeric, p_observacao text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_inss numeric DEFAULT NULL::numeric, p_icms_transporte numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_area record; v_liq numeric; v_t numeric; v_valor numeric; v_col uuid; v_uid uuid := coalesce(auth.uid(), '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'); v_ids uuid[] := '{}'; v_id uuid; v_s jsonb; v_plano uuid; v_papel text; v_desc text; v_forn text; v_ind text; v_serv_total numeric := 0; v_icms_ja boolean; v_tstr text; v_rot text;
  c_venda constant uuid := '43b81bba-4136-4d8e-aee0-a8aaf1521dc0'; c_imp constant uuid := 'b451681a-c29e-4efe-a145-30a9950c6f5c'; c_frete constant uuid := '9c350708-9717-4ab9-adf4-09b25ccb024c';
  c_trator constant uuid := '25dc0eee-c873-427d-8e54-589757bb57ab'; c_mao_obra constant uuid := '6fde19c6-524a-44da-ad64-86fff06e24a6'; c_sefaz constant uuid := '948cab3f-52e3-46bd-b4b8-3e022828125b';
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
  -- venda
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, conta_destino_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
  values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', c_venda, p_industria_id, p_conta_id, '1-Entradas', 1, v_valor, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, format('Venda %s t Mandioca · NF %s · %s g · %s', v_tstr, coalesce(p_nf,'-'), p_rendimento_g, coalesce(v_ind,'-')), p_nf, v_uid, v_uid) returning id into v_id;
  insert into agri_colheita_lancamentos values (v_col, v_id, 'venda'); v_ids := v_ids || v_id;
  -- icms: uma vez por NF
  select exists (select 1 from agri_colheita_lancamentos cl join agri_colheita c on c.id=cl.colheita_id join agri_safra_area a on a.id=c.safra_area_id where cl.papel='icms' and cl.ativo and c.ativo and c.cliente_id=p_cliente and a.safra_id=v_area.safra_id and c.nf_produtor=p_nf and c.id<>v_col) into v_icms_ja;
  if coalesce(p_icms,0) > 0 and not v_icms_ja then
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, conta_bancaria_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', c_imp, c_sefaz, p_conta_id, '2-Saídas', -1, p_icms, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, format('ICMS Venda Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, v_uid, v_uid) returning id into v_id;
    insert into agri_colheita_lancamentos values (v_col, v_id, 'icms'); v_ids := v_ids || v_id;
  end if;
  if coalesce(p_funrural,0) > 0 then
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, conta_bancaria_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', c_imp, p_industria_id, p_conta_id, '2-Saídas', -1, p_funrural, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, format('Funrural Venda Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, v_uid, v_uid) returning id into v_id;
    insert into agri_colheita_lancamentos values (v_col, v_id, 'funrural'); v_ids := v_ids || v_id;
  end if;
  -- inss: retido da venda, igual ao funrural (deducao, c_imp)
  if coalesce(p_inss,0) > 0 then
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, conta_bancaria_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', c_imp, p_industria_id, p_conta_id, '2-Saídas', -1, p_inss, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, format('INSS Venda Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, v_uid, v_uid) returning id into v_id;
    insert into agri_colheita_lancamentos values (v_col, v_id, 'inss'); v_ids := v_ids || v_id;
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
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, conta_bancaria_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', v_plano, (v_s->>'fornecedor_id')::uuid, p_conta_id, '2-Saídas', -1, round(v_t*(v_s->>'preco_t')::numeric,2), p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, v_desc, p_nf, v_uid, v_uid) returning id into v_id;
    insert into agri_colheita_lancamentos values (v_col, v_id, v_papel); v_ids := v_ids || v_id;
    v_serv_total := v_serv_total + round(v_t*(v_s->>'preco_t')::numeric,2);
  end loop;
  -- icms transporte: CUSTO sobre o frete (c_frete), nao deducao de venda (c_imp)
  if coalesce(p_icms_transporte,0) > 0 then
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, safra_id, cultura, plano_conta_id, favorecido_id, conta_bancaria_id, tipo_operacao, sinal, valor, data_competencia, data_vencimento, status_transacao, cenario, origem_lancamento, compoe_dre, descricao, documento, created_by, updated_by)
    values (p_cliente, v_area.fazenda_id, v_area.safra_id, 'mandioca', c_frete, c_sefaz, p_conta_id, '2-Saídas', -1, p_icms_transporte, p_data, p_data, 'programado', 'realizado', 'carga_mandioca', true, format('ICMS Transporte Mandioca · NF %s', coalesce(p_nf,'-')), p_nf, v_uid, v_uid) returning id into v_id;
    insert into agri_colheita_lancamentos values (v_col, v_id, 'icms_transporte'); v_ids := v_ids || v_id;
  end if;
  return jsonb_build_object('colheita_id', v_col, 'lancamento_ids', to_jsonb(v_ids), 'toneladas', v_t, 'valor_bruto', v_valor, 'servicos_total', v_serv_total, 'icms_lancado', coalesce(p_icms,0) > 0 and not v_icms_ja);
end $function$;

CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_corrigir(p_colheita_id uuid, p_safra_area_id uuid, p_data date, p_industria_id uuid, p_nf text, p_ticket text, p_peso_bruto_kg numeric, p_desconto_kg numeric, p_rendimento_g integer, p_preco_g numeric, p_servicos jsonb, p_icms numeric, p_funrural numeric, p_observacao text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_inss numeric DEFAULT NULL::numeric, p_icms_transporte numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_cli uuid; v_r jsonb;
begin
  select cliente_id into v_cli from agri_colheita where id=p_colheita_id and ativo;
  if v_cli is null then raise exception 'carga nao encontrada'; end if;
  v_r := agri_carga_mandioca_cancelar(p_colheita_id, 'corrigida em '||now()::date);
  if not (v_r->>'ok')::boolean then return v_r; end if;
  return agri_carga_mandioca_registrar(v_cli, p_safra_area_id, p_data, p_industria_id, p_nf, p_ticket, p_peso_bruto_kg, p_desconto_kg, p_rendimento_g, p_preco_g, p_servicos, p_icms, p_funrural, p_observacao, p_conta_id, p_inss, p_icms_transporte) || jsonb_build_object('substitui', p_colheita_id);
end $function$;


REVOKE ALL ON FUNCTION public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agri_carga_mandioca_registrar(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) TO authenticated;
