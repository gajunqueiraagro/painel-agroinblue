-- OC-PROGRAMADA-REABERTA-01 (Gabriel, 14/10/2026) — concluir as 5 OCs reabertas e nunca concluidas de novo, pela MESMA RPC do
-- botao "Concluir negociação" da tela (`oc_confirmar`). DADOS, nao schema. Roda pelo canal SQL com o usuario simulado (o admin),
-- porque `oc_confirmar` le' `auth.uid()` para a guarda de acesso e grava o evento 'fechar' com ele, como a tela.
-- As 5 (todas venda, conta corrente): NJ b74cfd38 e af334f9c, Agnaldo 3513d916 e e5719192, Vera 7d1f8590.
-- GUARDAS, por OC, antes de chamar: status 'programada', nao cancelada, nao rascunho, conta corrente 'quitado' com saldo 0 e nada
--   a entregar nem programado — qualquer divergencia aborta TUDO (nenhuma e' concluida). A versao vai a' RPC a lida na hora.
-- IDEMPOTENTE: OC ja' 'fechada' e' pulada (e a propria RPC devolve 'idempotente'); a contagem final exige as 5 'fechada'.
-- TRILHA: alem do evento 'fechar' da RPC (que nao leva motivo), um registro no `audit_log` por OC concluida agora, com o motivo
--   do Gabriel (modulo = o tipo da OC, tabela_origem = zoo_operacoes_comerciais, o padrao que o audit_log ja' tem para OC).
-- DECISAO DO GABRIEL (14/10): concluir mesmo com o P1 fechado — concluir so' troca o status para 'fechada' e grava o evento; nao
--   toca rebanho, financeiro nem DRE, e o P1 protege numeros.
-- ⚠ O MES DE TODAS ESTA' COM P1 OFICIAL: a TELA trava o Concluir por isso ("reabra o período"); a RPC nao olha mes fechado e
--   concluir nao toca rebanho nem financeiro (so' status, versao e o evento). Rodar isto = passar por cima da trava da tela.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $concluir$
declare
  c_ids constant text[] := array['b74cfd38-749a-4778-b6c2-02ca48fb361d', 'af334f9c-491d-4701-b3d8-27d9ccf57ce2',
    '3513d916-f677-4867-9750-7de23b6036fc', 'e5719192-e5d3-44a0-a5a2-e4481049318c', '7d1f8590-da5b-4aa4-b87a-a6b6701343e9'];
  c_motivo constant text := 'concluída após reabertura — autorizado pelo Gabriel em 14/10';
  o public.zoo_operacoes_comerciais; cc jsonb; r jsonb; v_id text; n int := 0;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  foreach v_id in array c_ids loop
    select * into o from public.zoo_operacoes_comerciais where id = v_id::uuid;
    if not found then raise exception 'OC % ausente. Abortado.', v_id; end if;
    if o.status_comercial = 'fechada' then continue; end if;
    cc := public.oc_conta_corrente(o.id);
    if o.status_comercial is distinct from 'programada' or o.cancelado_em is not null or o.rascunho
       or o.modelo_financeiro is distinct from 'conta_corrente'
       or cc->>'situacao' is distinct from 'quitado' or (cc->>'saldo')::numeric is distinct from 0
       or (cc->>'a_entregar')::numeric is distinct from 0 or (cc->>'programado')::numeric is distinct from 0 then
      raise exception 'OC % fora do estado medido (status %, situacao %, saldo %). Abortado.', v_id, o.status_comercial,
        cc->>'situacao', cc->>'saldo'; end if;
    r := public.oc_confirmar(o.id, o.cliente_id, o.versao);
    if (r->>'ok')::boolean is distinct from true or r->>'status_comercial' is distinct from 'fechada' then
      raise exception 'oc_confirmar recusou %: %. Abortado.', v_id, r; end if;
    insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                  dados_anteriores, dados_novos)
    values (o.cliente_id, o.fazenda_id, auth.uid(), o.tipo_operacao, 'concluir_apos_reabertura', 'zoo_operacoes_comerciais', o.id,
      'OC-PROGRAMADA-REABERTA-01: ' || c_motivo,
      jsonb_build_object('status_comercial', o.status_comercial, 'versao', o.versao),
      jsonb_build_object('status_comercial', r->>'status_comercial', 'versao', (r->>'versao')::int, 'motivo', c_motivo,
                         'rpc', 'oc_confirmar'));
    n := n + 1;
  end loop;
  if (select count(*) from public.zoo_operacoes_comerciais where id = any (c_ids::uuid[]) and status_comercial = 'fechada') <> 5 then
    raise exception 'Nem todas as 5 ficaram fechadas. Abortado.'; end if;
  raise notice 'OC-PROGRAMADA-REABERTA-01: % concluida(s) agora; as 5 estao fechadas.', n;
end $concluir$;
