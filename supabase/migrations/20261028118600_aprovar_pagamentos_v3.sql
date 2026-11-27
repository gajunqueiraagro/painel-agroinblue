-- APROVAR-PAGAMENTOS-V3 (mock aprovado, Gabriel 24/11 11:41; D1 11:50) — a tela PRÓPRIA do aprovador lê tudo numa ida, e o "pronto" passa a juntar
-- PAGAMENTO + DOCUMENTO. Regra para todo cliente. Muda:
--   1. `_fn_tem_boleto(lancamento)` — o boleto LIGADO (`boleto_lancamentos` vivo) OU o boleto ANEXADO como documento (não cancelado; do próprio
--      lançamento ou por vínculo). A guia de imposto conta no "pede guia" da lista nova (item 3).
--      FASE 0: na Vera, 18 saídas em aberto tinham o boleto anexado e 0 em `boleto_lancamentos` → todas "falta boleto". Os 4 chamadores do
--      `_fn_pronto_para_pagar` (fn_fin_v2_lista_pagina, fn_aprovacao_lista, fn_aprovacao_estados, fn_pronto_para_pagar_dos) passam a usar
--      esta função no lugar do `exists (… boleto_lancamentos …)` — troca de trecho guardada por md5 de cada corpo (a regra muda num lugar só).
--   2. `_fn_documento_pedido(subcentro, cpf_cnpj do fornecedor)` — o documento que a saída PEDE (D1):
--        nada     — pró-labore ("Dividendos …"), financiamento (juros, amortização, consórcio, entrada), transferência entre contas,
--                   despesas financeiras (tarifas);
--        holerite — "Salários e Encargos …", "Rescisões e Acertos …" (o holerite/recibo do contador; o que a Folha anexa);
--        guia     — impostos e taxas: CSLL · IRPJ · ITR · Taxas Patrimoniais · "Taxas e Impostos …" · "ICMS a Repassar …" ·
--                   "Impostos e Despesas de …" (DARF/GPS/ITR anexada como boleto ou guia);
--        recibo   — fornecedor com CPF (11 dígitos);
--        nota     — o resto (fornecedor com CNPJ ou sem documento).
--      A lista de subcentros está aqui, inteira, para o Gabriel conferir.
--   3. `fn_aprovacao_lista_v3(cliente, de, ate)` — as saídas do período (vencimento), com a ABA (aprovar · aprovados · recusados · pagos), o estado
--      e "posso decidir" (a regra do 118500), fornecedor, descrição, valor, forma efetiva, NF nº (a nota do documento; senão o nº do lançamento),
--      conta, o PRONTO (um código: pronto · falta_boleto · falta_guia · falta_chave · falta_dados_bancarios · falta_forma · falta_outro ·
--      falta_nota · falta_recibo · falta_holerite — o PRIMEIRO que falta: o pagamento antes do documento) e os dados da aba Pagamento.
-- Só leitura (fora a troca de trecho dos 4 chamadores, que é a mesma regra com o boleto anexado). Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if to_regprocedure('public.fn_aprovacao_lista_v3(uuid, date, date)') is not null or to_regprocedure('public._fn_tem_boleto(uuid)') is not null
     or to_regprocedure('public._fn_documento_pedido(text, text)') is not null then
    raise exception 'APROVAR-PAGAMENTOS-V3: as funções já existem: refazer.';
  end if;
end $$;

create function public._fn_tem_boleto(p_lancamento uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- direto nas tabelas (a view dos documentos, por linha, pesava na lista de Lançamentos): o boleto do próprio lançamento e o ligado por vínculo
  select exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = p_lancamento and bl.desligado_em is null)
      or exists (select 1 from financeiro_lancamento_documentos d where d.lancamento_id = p_lancamento and d.especie = 'boleto' and d.cancelado = false)
      or exists (select 1 from financeiro_documento_vinculos v join financeiro_lancamento_documentos d on d.id = v.documento_id
                  where v.lancamento_id = p_lancamento and d.especie = 'boleto' and d.cancelado = false)
$$;
revoke all on function public._fn_tem_boleto(uuid) from public, anon;
grant execute on function public._fn_tem_boleto(uuid) to authenticated;

-- os 4 chamadores: o mesmo `exists (… boleto_lancamentos …)` vira `public._fn_tem_boleto(<alias>.id)` (corpo guardado por md5; o trecho conta certo)
do $$
declare
  r record;
  v_def text;
  v_novo text;
  v_n int;
begin
  for r in select * from (values
      ('public.fn_aprovacao_estados(uuid, uuid[])', '59fb60bcab699df5e2b64fdec7430694',
       'exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = e.id and bl.desligado_em is null)', 'public._fn_tem_boleto(e.id)', 2),
      ('public.fn_aprovacao_lista(uuid, text[], date)', 'f31b00406c8cc6b1d70f7fce2d504b21',
       'exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null)', 'public._fn_tem_boleto(l.id)', 2),
      ('public.fn_fin_v2_lista_pagina(uuid, jsonb, jsonb, integer, integer)', 'c4ee25f2fcfe02e1c0703e3161003d4a',
       'exists (select 1 from public.boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null)', 'public._fn_tem_boleto(l.id)', 1),
      ('public.fn_pronto_para_pagar_dos(uuid[])', 'c2c06ff85b08cb9c55f31500b642d906',
       'exists (select 1 from public.boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null)', 'public._fn_tem_boleto(l.id)', 1)
    ) v(fn, md5, velho, novo, n)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if md5(v_def) <> r.md5 then raise exception 'APROVAR-PAGAMENTOS-V3: o corpo de % não é o esperado: conferir.', r.fn; end if;
    v_n := (length(v_def) - length(replace(v_def, r.velho, ''))) / length(r.velho);
    if v_n <> r.n then raise exception 'APROVAR-PAGAMENTOS-V3: % tem % trecho(s) do boleto, esperava %.', r.fn, v_n, r.n; end if;
    v_novo := replace(v_def, r.velho, r.novo);
    execute v_novo;
  end loop;
end $$;

create function public._fn_documento_pedido(p_subcentro text, p_doc_fornecedor text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_subcentro ~* '^(Dividendos |Pr[oó][- ]?labore)' then 'nada'
    when p_subcentro ~* '^(Amortização Financiamento|Juros de Financiamento|Consórcio a contemplar|Entrada de Financiamento)' then 'nada'
    when p_subcentro ~* '^(Transferência entre Contas Bancárias|Despesas Financeiras )' then 'nada'
    when p_subcentro ~* '^(Salários e Encargos |Rescisões e Acertos )' then 'holerite'
    when p_subcentro ~* '^(CSLL|IRPJ|ITR|Taxas Patrimoniais|Taxas e Impostos |ICMS a Repassar |Impostos e Despesas de )' then 'guia'
    when length(regexp_replace(coalesce(p_doc_fornecedor, ''), '\D', '', 'g')) = 11 then 'recibo'
    else 'nota' end
$$;
revoke all on function public._fn_documento_pedido(text, text) from public, anon;
grant execute on function public._fn_documento_pedido(text, text) to authenticated;

create function public.fn_aprovacao_lista_v3(p_cliente uuid, p_de date, p_ate date)
returns table(lancamento_id uuid, vencimento date, status text, aba text, fornecedor text, favorecido_id uuid, descricao text, valor numeric,
              forma text, nf text, conta text, subcentro text, financiamento_id uuid, recorrencia_id uuid,
              estado text, motivo text, posso_decidir boolean, lancado_por uuid, lancado_em timestamptz,
              documento_pedido text, pronto text, pagamento jsonb)
language plpgsql stable security definer set search_path = public set plan_cache_mode = force_custom_plan as $$
declare
  u uuid := auth.uid();
  v_aprovador boolean;
  v_admin boolean;
begin
  if p_cliente is null or p_de is null or p_ate is null or p_de > p_ate or p_ate - p_de > 400 or not public.tenant_ok(p_cliente) then
    raise exception 'BPO: sem acesso a este cliente.' using errcode = '42501';
  end if;
  v_aprovador := public._fn_eh_aprovador(p_cliente, u);
  v_admin := public.is_admin_agroinblue(u);
  return query
  with base as (
    select l.*, f.nome as fnome, f.cpf_cnpj as fdoc, f.tipo_recebimento, f.pix_chave, f.pix_tipo_chave, f.banco as fbanco, f.agencia as fagencia,
           f.conta as fconta, f.tipo_conta as ftipo_conta, f.cpf_cnpj_pagamento, f.nome_favorecido,
           pc.subcentro as sub, coalesce(cb.nome_exibicao, cb.nome_conta) as cnome,
           public._fn_aprovacao_estado(l.id) as est,
           public._fn_tem_boleto(l.id) as tem_bol,
           public._fn_forma_efetiva_pagamento(l.forma_pagamento, f.tipo_recebimento) as forma_ef
      from financeiro_lancamentos_v2 l
      left join financeiro_fornecedores f on f.id = l.favorecido_id
      left join financeiro_plano_contas pc on pc.id = l.plano_conta_id
      left join financeiro_contas_bancarias cb on cb.id = l.conta_bancaria_id
     where l.cliente_id = p_cliente and l.tipo_operacao = '2-Saídas' and l.cancelado is not true and l.sem_movimentacao_caixa is not true
       and l.data_vencimento between p_de and p_ate
       and l.status_transacao in ('previsto', 'programado', 'agendado', 'realizado', 'conciliado')
  ), docs as (
    select b.id as lid,
           bool_or(d.especie in ('nf', 'nf_principal', 'nf_complementar', 'nf_produtor')) as tem_nf,
           bool_or(d.especie in ('recibo', 'comprovante')) as tem_recibo,
           bool_or(d.especie = 'guia') as tem_guia,
           (array_agg(d.numero order by (d.especie = 'nf_principal') desc, d.uploaded_em)
              filter (where d.especie in ('nf', 'nf_principal', 'nf_complementar', 'nf_produtor') and d.numero is not null))[1] as nf_num,
           (array_agg(d.emitente_documento) filter (where d.especie in ('nf', 'nf_principal', 'nf_produtor') and d.emitente_documento is not null))[1] as nf_emit
      from base b join vw_lancamento_documentos d on d.lancamento_id = b.id and coalesce(d.cancelado, false) = false
     group by b.id
  ), folha as (
    select fd.lancamento_id as lid,
           bool_or(fd.especie in ('holerite', 'recibo_13', 'recibo_ferias', 'rescisao')) as tem_holerite,
           bool_or(fd.especie in ('guia_inss', 'guia_fgts')) as tem_guia_folha
      from folha_documentos fd where fd.cliente_id = p_cliente and fd.cancelado_em is null and fd.lancamento_id in (select id from base)
     group by fd.lancamento_id
  ), boleto as (
    select distinct on (bl.lancamento_id) bl.lancamento_id as lid, bo.linha_digitavel, bo.beneficiario_nome, bo.beneficiario_documento
      from boleto_lancamentos bl join boletos bo on bo.id = bl.boleto_id
     where bl.desligado_em is null and bl.lancamento_id in (select id from base)
     order by bl.lancamento_id, bl.ligado_em desc
  ), calc as (
    select b.*, dc.tem_nf, dc.tem_recibo, dc.tem_guia, dc.nf_num, dc.nf_emit, fo.tem_holerite, fo.tem_guia_folha, bo.linha_digitavel,
           bo.beneficiario_nome, bo.beneficiario_documento,
           public._fn_documento_pedido(b.sub, b.fdoc) as pedido,
           public._fn_pronto_para_pagar(b.tipo_operacao, b.status_transacao, (b.sem_movimentacao_caixa is true), b.forma_ef, b.dados_pagamento,
             b.tem_bol, b.pix_chave, b.fbanco, b.fagencia, b.fconta) as pag
      from base b left join docs dc on dc.lid = b.id left join folha fo on fo.lid = b.id left join boleto bo on bo.lid = b.id
  )
  select c.id, c.data_vencimento, c.status_transacao,
         case when c.status_transacao in ('realizado', 'conciliado') then 'pagos'
              when c.est = 'aguardando' then 'aprovar'
              when c.est in ('aprovado', 'aprovado_regra') then 'aprovados'
              when c.est = 'recusado' then 'recusados' end,
         c.fnome, c.favorecido_id, c.descricao, abs(c.valor), c.forma_ef,
         coalesce(c.nf_num, case when coalesce(c.tipo_documento, '') ~* 'nf|nota' then nullif(btrim(c.numero_documento), '') end),
         c.cnome, c.sub, c.financiamento_id, c.recorrencia_id,
         c.est, a.motivo,
         (c.est = 'aguardando' and (v_aprovador or v_admin) and c.created_by is distinct from u),
         c.created_by, c.created_at,
         c.pedido,
         case when c.pag is null then null
              when c.pag like 'falta%' then case when c.pag = 'falta_boleto' and c.pedido = 'guia' then 'falta_guia' else c.pag end
              when c.pedido = 'nota' and not coalesce(c.tem_nf, false) then 'falta_nota'
              when c.pedido = 'recibo' and not (coalesce(c.tem_recibo, false) or coalesce(c.tem_nf, false)) then 'falta_recibo'
              when c.pedido = 'holerite' and not (coalesce(c.tem_holerite, false) or coalesce(c.tem_recibo, false) or coalesce(c.tem_guia_folha, false)
                                                  or coalesce(c.tem_guia, false)) then 'falta_holerite'
              when c.pedido = 'guia' and not (c.tem_bol or coalesce(c.tem_guia_folha, false) or coalesce(c.tem_nf, false)) then 'falta_guia'
              else 'pronto' end,
         jsonb_strip_nulls(jsonb_build_object(
           'forma', c.forma_ef, 'dados', c.dados_pagamento,
           'chave', c.pix_chave, 'tipo_chave', c.pix_tipo_chave,
           'banco', c.fbanco, 'agencia', c.fagencia, 'conta', c.fconta, 'tipo_conta', c.ftipo_conta,
           'titular', coalesce(nullif(btrim(c.nome_favorecido), ''), c.fnome),
           'doc_pagamento', coalesce(nullif(btrim(c.cpf_cnpj_pagamento), ''), c.fdoc), 'doc_fornecedor', c.fdoc,
           'linha_digitavel', c.linha_digitavel, 'beneficiario', c.beneficiario_nome, 'beneficiario_doc', c.beneficiario_documento,
           'boleto_anexado', c.tem_bol, 'emitente_nf_doc', c.nf_emit))
    from calc c
    left join financeiro_aprovacoes a on a.lancamento_id = c.id and a.situacao in ('aprovado', 'recusado')
   where c.status_transacao in ('realizado', 'conciliado') or c.est <> 'fora'
   order by c.data_vencimento, c.id;
end $$;
revoke all on function public.fn_aprovacao_lista_v3(uuid, date, date) from public, anon;
grant execute on function public.fn_aprovacao_lista_v3(uuid, date, date) to authenticated;
