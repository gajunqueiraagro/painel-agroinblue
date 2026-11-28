-- Lote 114510 · Code 2 · 27/11 — dois acertos de DADO pedidos pelo Gabriel (nenhuma estrutura muda):
-- 1. FINANC-DOC-TIPO-01: o PDF do Itaú 667001023007 que o Gabriel anexou pela tela como "Outros" passa ao tipo "Posição de operações / saldo
--    do banco" (a chave `demonstrativo_saldo`, que já existia; o rótulo novo sobe no código). Só a espécie do documento muda.
-- 2. SUGESTAO-ITENS-BUG-01 (c): a correção do Gabriel na NF 54.388 vira APRENDIZADO — a regra do item (Santa Rita + o fornecedor da nota +
--    "Quirela de Milho a Granel" → "Nutrição"), pelo escritor que já existe (`fn_item_regra_gravar`, com trilha). Vence a escada na próxima nota.
-- DESFAZER: 1. a espécie volta a 'outro'; 2. `fn_item_regra_desfazer(<regra>, motivo, false)`.

select set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
select set_config('app.via', 'lote 114510', true);

do $$
declare v jsonb;
begin
  -- 1. a espécie do documento (guarda: é o PDF anexado em 27/11 ao contrato 667001023007, ainda como 'outro', vivo)
  update public.financiamento_documentos set especie = 'demonstrativo_saldo'
   where id = 'e35e1351-3609-435a-86dc-d3cc5b4c3d25' and financiamento_id = '66700102-3007-4000-8000-000000000001'
     and especie = 'outro' and cancelado_em is null;
  if not found then raise exception 'o documento do 667001023007 não confere (ou já mudou): reler antes de aplicar'; end if;

  -- 2. a regra do item (guarda: o item é a quirela da NF 54.388 da Santa Rita; a conta é a "Nutrição" do lançamento salvo)
  if not exists (select 1 from public.nota_fiscal_itens i join public.nota_fiscal n on n.id = i.nota_id
                  where i.id = '59e33cb6-c5fa-4bbf-a428-1b69def216ac' and n.cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'
                    and ltrim(n.numero, '0') = '54388' and i.descricao ilike 'quirela de milho%')
     or not exists (select 1 from public.financeiro_plano_contas where id = 'cf26e258-b001-44a7-990d-c981f457e982' and subcentro = 'Nutrição' and ativo) then
    raise exception 'o item da quirela ou a conta Nutrição não conferem: reler antes de aplicar';
  end if;
  v := public.fn_item_regra_gravar('59e33cb6-c5fa-4bbf-a428-1b69def216ac', 'cf26e258-b001-44a7-990d-c981f457e982',
         'Correção do Gabriel na NF 54.388 (27/11): quirela de milho a granel é nutrição do rebanho, não cantina', false);
  if coalesce(v->>'acao', '') not in ('criar', 'alterar', 'nada') then raise exception 'a regra não gravou: %', v; end if;
end $$;
