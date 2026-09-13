-- 20260927120000_agri_barter_03c_abrir_contrato.sql
-- AGRI-BARTER-03C: abrir um contrato de barter — a conta de permuta e o contrato, num gesto.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. O índice e a função foram aplicados
--   pelo Chat via Management API sob GO; nao se reaplica por ele. O corpo abaixo foi EXTRAIDO
--   do banco (`pg_get_functiondef`, em base64), nao redigitado. Conferência por construção,
--   13/09/2026: md5(prosrc) = 88fc2be960bd722701a79044e7778a91 — o mesmo do banco.
--
-- O QUE FAZ: recebe o parceiro (um `financeiro_fornecedores`), o nome do contrato e,
-- opcionalmente, fazenda e descrição. Procura a conta de permuta daquele parceiro; se não
-- existe, cria — `nome_exibicao = 'Permuta · <fornecedor>'`, `tipo_conta = 'permuta'` — e em
-- seguida grava o contrato JÁ LIGADO a ela. Devolve
-- `{ok, contrato_id, conta_permuta_id, conta_criada}`.
--
-- ⚠ `conta_criada` DIZ A VERDADE, e não dizia: a primeira versão devolvia `true` sempre,
--   inclusive quando REUSAVA a conta — e a tela anunciaria "conta criada" na segunda abertura
--   com o mesmo parceiro. Agora a flag nasce `false` e só vira `true` dentro do ramo que
--   insere. Testado: 1ª abertura `true`, 2ª `false`, mesma conta.
--
-- ⚠ UMA CONTA POR PARCEIRO, AGORA COM TRAVA NO BANCO. Antes a garantia era só o caminho da
--   RPC: quem inserisse contrato direto na tabela podia criar a segunda conta. O índice parcial
--   abaixo fecha isso na origem — e é PARCIAL de propósito: ele só vale para
--   `tipo_conta = 'permuta' and ativa`, então nenhuma conta de banco é afetada, e uma permuta
--   desativada não bloqueia a criação da substituta.
--
-- ⚠ ATOMICO DE PROPOSITO: conta e contrato nascem na mesma transação. Um contrato sem conta de
--   permuta não materializa (o `agri_barter_materializar_contrato` recusa), e uma conta sem
--   contrato seria uma conta órfã no seletor de todo mundo.
-- ⚠ GUARDA DE USUARIO: sem `auth.uid()` ela recusa. E' `SECURITY DEFINER` e CRIA CONTA
--   BANCARIA — deixá-la rodar sem sessão daria a qualquer um a chave de criar contas.
--
-- ⚠ SEGURANCA, conferida por `has_function_privilege` (a régua — não a leitura da `proacl`):
--   `anon = false`, `authenticated = true`. O revoke e o grant abaixo são o que já está aplicado.

create unique index if not exists uq_conta_permuta_por_parceiro
  on public.financeiro_contas_bancarias (cliente_id, nome_exibicao)
  where tipo_conta = 'permuta' and ativa;

CREATE OR REPLACE FUNCTION public.agri_barter_abrir_contrato(p_parceiro_fornecedor_id uuid, p_nome text, p_fazenda_id uuid DEFAULT NULL::uuid, p_descricao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_cli uuid; v_forn_nome text; v_conta uuid; v_contrato uuid; v_criada boolean := false;
begin
  if v_actor is null then raise exception 'Sem usuario autenticado' using errcode='P0001'; end if;
  select cliente_id, nome into v_cli, v_forn_nome from public.financeiro_fornecedores where id = p_parceiro_fornecedor_id;
  if v_cli is null then raise exception 'Fornecedor % nao encontrado', p_parceiro_fornecedor_id using errcode='P0001'; end if;
  select id into v_conta from public.financeiro_contas_bancarias
    where cliente_id = v_cli and tipo_conta = 'permuta' and nome_exibicao = 'Permuta · '||v_forn_nome and ativa limit 1;
  if v_conta is null then
    insert into public.financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, nome_exibicao, banco, tipo_conta, ativa)
      values (v_cli, p_fazenda_id, 'Permuta · '||v_forn_nome, 'Permuta · '||v_forn_nome, 'Permuta', 'permuta', true)
      returning id into v_conta;
    v_criada := true;
  end if;
  insert into public.agri_barter_contratos (cliente_id, fazenda_id, parceiro_fornecedor_id, conta_permuta_id, nome, descricao, created_by)
    values (v_cli, p_fazenda_id, p_parceiro_fornecedor_id, v_conta, p_nome, p_descricao, v_actor)
    returning id into v_contrato;
  return jsonb_build_object('ok', true, 'contrato_id', v_contrato, 'conta_permuta_id', v_conta, 'conta_criada', v_criada);
end $function$;

revoke all on function public.agri_barter_abrir_contrato(uuid,text,uuid,text) from public;
grant execute on function public.agri_barter_abrir_contrato(uuid,text,uuid,text) to authenticated;
