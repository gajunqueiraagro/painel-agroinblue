-- FIN-PRONTO-PAGAR-01 · CPR (Gabriel 24/11: opção (a)) — o "pronto para pagar" POR IDS, só leitura, para a tela que não lê a lista
-- (`fn_fin_v2_lista_pagina`): a Contas a Pagar e Receber lê os lançamentos direto da tabela e pede aqui o código dos que mostra.
-- · NENHUMA REGRA NOVA: o código é o da `_fn_pronto_para_pagar` com os MESMOS argumentos da lista e da `fn_aprovacao_lista` (118450):
--   a forma efetiva (`_fn_forma_efetiva_pagamento`: a do lançamento; sem ela, a padrão do cadastro), os dados próprios do lançamento,
--   o boleto ligado (`boleto_lancamentos.desligado_em is null`) e a chave PIX / banco / agência / conta do cadastro do fornecedor.
-- · Independente do BPO: não lê `financeiro_aprovacoes`.
-- · Devolve uma linha por id ENCONTRADO (cancelado incluído: a regra o põe sem ponto pelo status); id que não existe não volta.
-- · SEGURANÇA (SEG-TENANT-VARREDURA-01C): SECURITY DEFINER porque as internas da regra são fechadas a `authenticated`; recebe ids de
--   linha, então resolve o cliente de CADA uma e recusa com 42501 se algum não passa no `tenant_ok` (nunca devolve vazio no lugar).
--   Mais de 5.000 ids = 22023 (a tela pede o que mostra). Nasce fechada: só `authenticated` e `service_role`.

set local lock_timeout = '2s';
set local statement_timeout = '30s';

create or replace function public.fn_pronto_para_pagar_dos(p_ids uuid[])
returns table(lancamento_id uuid, pronto_pagar text, forma_efetiva text)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  if cardinality(p_ids) > 5000 then
    raise exception 'Pronto para pagar: no máximo 5.000 lançamentos por pedido.' using errcode = '22023';
  end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 l
              where l.id = any(p_ids) and not public.tenant_ok(l.cliente_id)) then
    raise exception 'Pronto para pagar: sem acesso a um dos lançamentos.' using errcode = '42501';
  end if;
  return query
  select l.id,
         public._fn_pronto_para_pagar(l.tipo_operacao, l.status_transacao, (l.sem_movimentacao_caixa is true),
           public._fn_forma_efetiva_pagamento(l.forma_pagamento, f.tipo_recebimento), l.dados_pagamento,
           exists (select 1 from public.boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null),
           f.pix_chave, f.banco, f.agencia, f.conta),
         public._fn_forma_efetiva_pagamento(l.forma_pagamento, f.tipo_recebimento)
    from public.financeiro_lancamentos_v2 l
    left join public.financeiro_fornecedores f on f.id = l.favorecido_id
   where l.id = any(p_ids);
end $fn$;

revoke all on function public.fn_pronto_para_pagar_dos(uuid[]) from public, anon;
grant execute on function public.fn_pronto_para_pagar_dos(uuid[]) to authenticated, service_role;
