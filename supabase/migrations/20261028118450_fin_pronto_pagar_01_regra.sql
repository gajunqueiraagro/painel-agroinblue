-- FIN-PRONTO-PAGAR-01 PR A (Gabriel 23/11/2026: mock aprovado 13:38; D1 GO, D2–D7 como recomendado) — "pronto para pagar" pela FORMA
-- DE PAGAMENTO, numa regra SÓ, no banco. As duas telas (Lançamentos e Aprovar pagamentos) só mostram o código; nenhuma calcula.
-- · A forma que vale (D2) = a do lançamento; sem ela, a padrão do cadastro do fornecedor (`tipo_recebimento`; "Transferência Bancária" do
--   cadastro = "Transferência" do lançamento). É a `formaEfetiva` do modal (dadosPagamentoDoCadastro.ts), aqui no banco. Nada se grava.
-- · Os códigos (nulo = sem ponto: não é saída, já foi paga — realizado/conciliado —, ou é sem caixa; D5):
--     boleto                → pronto_boleto (boleto ligado: `boleto_lancamentos.desligado_em is null`, o `tem_boleto` da fila do BPO) | falta_boleto
--     cartão/débito/dinheiro → nada_a_fazer (inclui "Débito Automático" e "Débito em Conta"; D3)
--     PIX / TED              → pronto_dados_lancamento (os dados próprios do lançamento, a exceção do FIN-PIX-CADASTRO-MODAL-01)
--                              | pronto_chave_cadastro (PIX com `pix_chave`) | pronto_dados_bancarios (TED com banco + agência + conta; D6)
--                              | falta_chave (PIX) | falta_dados_bancarios (TED). "PIX/Transferência Bancária" vale com a chave OU o banco (D3).
--     sem forma              → falta_forma          · "Outro" e qualquer outra grafia → falta_outro (D3)
--   QR PIX não existe no sistema (D4): o "copia e cola", se houver, mora nos dados próprios do lançamento.
-- · `fn_fin_v2_lista_pagina`: `p_filtros.pronto_pagar` = 'todos' (padrão) | 'prontos' | 'faltando'; cada linha ganha `pronto_pagar` e
--   `forma_efetiva`; a resposta ganha `pronto_pagar` = {prontos, prontos_valor, faltando, faltando_valor} do recorte SEM este filtro (o
--   seletor não encolhe ao escolher — o molde do `forn_ok`). O filtro segue a grade, os totais e as contagens (os 4 `m.forn_ok`).
--   PATCH guardado por md5 da definição viva (a da 115350, LCDPR-SELO-01): se ela mudou, NADA é aplicado. Cada trecho casa o nº medido.
-- · `fn_aprovacao_lista`: + `forma` e `pronto_pagar` no fim (RETURNS TABLE muda: DROP + CREATE, guardado por md5; o resto igual, byte a byte).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- ⚠ AS TRÊS SÃO PURAS (só os valores; sem tabela, IMMUTABLE, sem SET): quem chama traz o cadastro e o boleto. Medido no ensaio (NJ 2026,
--   5.709 linhas na lista): a 1ª versão lia fornecedor e boleto linha a linha e a troca de página foi de 113 → 580 ms; com um JOIN do
--   cadastro na base, 200 ms. Agora a lista só lê o cadastro da SAÍDA QUE AINDA SE PAGA (≈ 8% das linhas;
--   `_fn_pronto_para_pagar_se_aplica`, a mesma que abre a regra). A regra continua UMA: só a `_fn_pronto_para_pagar` decide o código.
create or replace function public._fn_pronto_para_pagar_se_aplica(p_tipo text, p_status text, p_sem_caixa boolean)
returns boolean
language sql
immutable
as $fn$
  select coalesce(p_tipo, '') like '2%' and lower(coalesce(p_status, '')) in ('previsto', 'programado', 'agendado') and not coalesce(p_sem_caixa, false)
$fn$;

create or replace function public._fn_forma_efetiva_pagamento(p_forma text, p_forma_padrao text)
returns text
language sql
immutable
as $fn$
  select coalesce(
    nullif(case when btrim(coalesce(p_forma, '')) = 'Transferência Bancária' then 'Transferência' else btrim(coalesce(p_forma, '')) end, ''),
    nullif(case when btrim(coalesce(p_forma_padrao, '')) = 'Transferência Bancária' then 'Transferência' else btrim(coalesce(p_forma_padrao, '')) end, ''))
$fn$;

-- p_forma = a forma EFETIVA (`_fn_forma_efetiva_pagamento`); p_boleto = há boleto ligado; p_chave/p_banco/p_agencia/p_conta = do cadastro
create or replace function public._fn_pronto_para_pagar(p_tipo text, p_status text, p_sem_caixa boolean, p_forma text, p_dados jsonb,
                                                        p_boleto boolean, p_chave text, p_banco text, p_agencia text, p_conta text)
returns text
language sql
immutable
as $fn$
  select case
    when not public._fn_pronto_para_pagar_se_aplica(p_tipo, p_status, p_sem_caixa) then null
    when nullif(btrim(coalesce(p_forma, '')), '') is null then 'falta_forma'
    when p_forma ~* 'boleto' then case when coalesce(p_boleto, false) then 'pronto_boleto' else 'falta_boleto' end
    when p_forma ~* 'cart|d[eé]bito|dinheiro|cr[eé]dito' then 'nada_a_fazer'
    when p_forma ~* 'pix|transf|ted' then
      case when btrim(coalesce(case when p_dados is null or jsonb_typeof(p_dados) = 'null' then ''
                                    when jsonb_typeof(p_dados) = 'string' then p_dados #>> '{}'
                                    else p_dados::text end, '')) not in ('', '{}', '[]') then 'pronto_dados_lancamento'
           when p_forma ~* 'pix' and btrim(coalesce(p_chave, '')) <> '' then 'pronto_chave_cadastro'
           when p_forma ~* 'transf|ted' and btrim(coalesce(p_banco, '')) <> '' and btrim(coalesce(p_agencia, '')) <> ''
                and btrim(coalesce(p_conta, '')) <> '' then 'pronto_dados_bancarios'
           when p_forma ~* 'pix' then 'falta_chave'
           else 'falta_dados_bancarios' end
    else 'falta_outro' end
$fn$;

-- internas: só as RPCs (SECURITY DEFINER) as chamam
revoke all on function public._fn_pronto_para_pagar_se_aplica(text, text, boolean) from public, anon, authenticated;
revoke all on function public._fn_forma_efetiva_pagamento(text, text) from public, anon, authenticated;
revoke all on function public._fn_pronto_para_pagar(text, text, boolean, text, jsonb, boolean, text, text, text, text) from public, anon, authenticated;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)'::regprocedure);
  v_novo text;
  r record;
begin
  if md5(v_def) <> 'bde3015dd4eeb10891e2f575abe1f4a5' then
    raise exception 'FIN-PRONTO-PAGAR-01: fn_fin_v2_lista_pagina mudou desde a prévia';
  end if;
  v_novo := v_def;
  for r in select * from (values
    (1, 1, 'v_prod text; v_forn uuid; v_forns uuid[]; v_modo text; v_livro text;',
           'v_prod text; v_forn uuid; v_forns uuid[]; v_modo text; v_livro text; v_pp text;'),
    (2, 1, E'    raise exception ''livro invalido: %'', v_livro using errcode = ''22023'';\n  end if;\n',
           E'    raise exception ''livro invalido: %'', v_livro using errcode = ''22023'';\n  end if;\n'
        || E'  -- FIN-PRONTO-PAGAR-01: "Pagamento: Todos · Prontos · Faltando" (a regra é a `_fn_pronto_para_pagar`)\n'
        || E'  v_pp := coalesce(nullif(f->>''pronto_pagar'', ''''), ''todos'');\n'
        || E'  if v_pp not in (''todos'', ''prontos'', ''faltando'') then\n'
        || E'    raise exception ''pronto_pagar invalido: %'', v_pp using errcode = ''22023'';\n'
        || E'  end if;\n'),
    (3, 1, E'l.macro_custo, l.centro_custo, l.subcentro,\n',
           E'l.macro_custo, l.centro_custo, l.subcentro,\n'
        || E'           -- FIN-PRONTO-PAGAR-01: o código do "pronto para pagar"; o cadastro e o boleto só se leem para a saída que ainda se paga\n'
        || E'           case when public._fn_pronto_para_pagar_se_aplica(l.tipo_operacao, l.status_transacao, (l.sem_movimentacao_caixa is true)) then\n'
        || E'             (select public._fn_pronto_para_pagar(l.tipo_operacao, l.status_transacao, (l.sem_movimentacao_caixa is true),\n'
        || E'                       public._fn_forma_efetiva_pagamento(l.forma_pagamento, ppf.tipo_recebimento), l.dados_pagamento,\n'
        || E'                       exists (select 1 from public.boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null),\n'
        || E'                       ppf.pix_chave, ppf.banco, ppf.agencia, ppf.conta)\n'
        || E'                from (select 1) u left join public.financeiro_fornecedores ppf on ppf.id = l.favorecido_id) end as pp_codigo,\n'),
    -- o filtro "Pagamento" ESCRITO nas 4 condições que já aplicam `forn_ok` (grade, sem caixa, as 2 contagens). ⚠ Medido: como coluna
    --   `pp_ok` do `marcado` ele custava +65 ms na troca de página do NJ (mesmo constante); escrito aqui, 0. Sem ponto = fora de Prontos e Faltando.
    (5, 4, 'm.forn_ok', 'm.forn_ok and (v_pp = ''todos'' or coalesce((m.pp_codigo like ''falta%'') = (v_pp = ''faltando''), false))'),
    (6, 1, E'    ''sem_caixa'', case when v_so',
           E'    -- FIN-PRONTO-PAGAR-01: Prontos / Faltando do recorte SEM o filtro "Pagamento" (o seletor não encolhe ao escolher)\n'
        || E'    ''pronto_pagar'', case when v_so or v_ids is not null and not v_ids_tot then null else (select jsonb_build_object(\n'
        || E'        ''prontos'',        count(*) filter (where m.pp_codigo not like ''falta%''),\n'
        || E'        ''prontos_valor'',  round(coalesce(sum(abs(m.valor)) filter (where m.pp_codigo not like ''falta%''), 0), 2),\n'
        || E'        ''faltando'',       count(*) filter (where m.pp_codigo like ''falta%''),\n'
        || E'        ''faltando_valor'', round(coalesce(sum(abs(m.valor)) filter (where m.pp_codigo like ''falta%''), 0), 2))\n'
        || E'      from marcado m where m.st_ok and m.na_grade and m.forn_ok and m.pp_codigo is not null) end,\n'
        || E'    ''sem_caixa'', case when v_so'),
    (7, 1, 'jsonb_build_object(''conciliado'', g.conciliado)',
           E'jsonb_build_object(''conciliado'', g.conciliado, ''pronto_pagar'', g.pp_codigo,\n'
        || E'                     ''forma_efetiva'', public._fn_forma_efetiva_pagamento(l.forma_pagamento,\n'
        || E'                       (select fo.tipo_recebimento from public.financeiro_fornecedores fo where fo.id = l.favorecido_id)))')
  ) t(n, vezes, de, para) loop
    if (length(v_novo) - length(replace(v_novo, r.de, ''))) / length(r.de) <> r.vezes then
      raise exception 'FIN-PRONTO-PAGAR-01: o trecho % nao casa % vez(es)', r.n, r.vezes;
    end if;
    v_novo := replace(v_novo, r.de, r.para);
  end loop;
  execute v_novo;
end $patch$;

do $guarda$
begin
  if md5(pg_get_functiondef('public.fn_aprovacao_lista(uuid,text[],date)'::regprocedure)) <> '1a2e872363d402b1610369296578563b' then
    raise exception 'FIN-PRONTO-PAGAR-01: fn_aprovacao_lista mudou desde a prévia';
  end if;
end $guarda$;

drop function public.fn_aprovacao_lista(uuid, text[], date);

CREATE OR REPLACE FUNCTION public.fn_aprovacao_lista(p_cliente uuid, p_situacoes text[], p_venc_ate date)
 RETURNS TABLE(lancamento_id uuid, rodada integer, situacao text, motivo text, observacao text, pedido_por uuid, pedido_em timestamp with time zone, decidido_por uuid, decidido_em timestamp with time zone, vencimento date, valor numeric, descricao text, fornecedor text, fazenda text, conta text, conta_bancaria_id uuid, status_transacao text, tem_nota boolean, tem_boleto boolean, forma text, pronto_pagar text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_cliente is null or not public.tenant_ok(p_cliente) then raise exception 'BPO: sem acesso a este cliente.' using errcode = '42501'; end if;
  return query
  select a.lancamento_id, a.rodada, a.situacao, a.motivo, a.observacao, a.pedido_por, a.pedido_em, a.decidido_por, a.decidido_em,
         l.data_vencimento, l.valor, l.descricao, f.nome, fz.nome, coalesce(cb.nome_exibicao, cb.nome_conta), l.conta_bancaria_id, l.status_transacao,
         exists (select 1 from financeiro_documento_vinculos dv where dv.lancamento_id = l.id),
         exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null),
         -- FIN-PRONTO-PAGAR-01: a forma que vale e o código do "pronto para pagar" (a mesma regra da lista de Lançamentos)
         public._fn_forma_efetiva_pagamento(l.forma_pagamento, f.tipo_recebimento),
         public._fn_pronto_para_pagar(l.tipo_operacao, l.status_transacao, (l.sem_movimentacao_caixa is true),
           public._fn_forma_efetiva_pagamento(l.forma_pagamento, f.tipo_recebimento), l.dados_pagamento,
           exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null),
           f.pix_chave, f.banco, f.agencia, f.conta)
    from financeiro_aprovacoes a
    join financeiro_lancamentos_v2 l on l.id = a.lancamento_id
    left join financeiro_fornecedores f on f.id = l.favorecido_id
    left join fazendas fz on fz.id = l.fazenda_id
    left join financeiro_contas_bancarias cb on cb.id = l.conta_bancaria_id
   where a.cliente_id = p_cliente and a.situacao <> 'substituido'
     and (p_situacoes is null or a.situacao = any(p_situacoes))
     and (p_venc_ate is null or l.data_vencimento <= p_venc_ate)
   order by l.data_vencimento, l.valor;
end $function$;

-- a ACL de antes, igual (conferida no proto 23/11: {postgres, service_role, authenticated}; anon e PUBLIC não)
revoke all on function public.fn_aprovacao_lista(uuid, text[], date) from public, anon;
grant execute on function public.fn_aprovacao_lista(uuid, text[], date) to authenticated, service_role;
