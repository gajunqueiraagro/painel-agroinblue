-- PATR-CATEGORIAS-01 · 116150 — "Equipamentos e informática" se divide em duas categorias GLOBAIS (Gabriel 03/11):
--   "Equipamentos" (campo/oficina: motobomba, gerador, cortador, balança, semeadeira elétrica, compressor…) — TEM valor de mercado;
--   "Informática e mobiliário" (computador, impressora, celular/rádio, móveis, eletrodomésticos da sede) — sem valor de mercado.
-- ADITIVA: as duas nascem; a antiga NÃO se apaga — os bens passam pela `fn_patrimonio_bens_reclassificar` (trilha 'troca_categoria',
-- motivo, prévia) e a antiga só se desliga (ativo = false) quando não tiver mais nenhum bem, em qualquer cliente.
-- ⚠ O CÓDIGO DO BEM NÃO MUDA (trava `_trg_patrimonio_codigo_imutavel`): o EQP-001 segue EQP-001 em qualquer das duas. Bem novo de
--   "Equipamentos" continua a série EQP do cliente (mesmo prefixo, mesmo contador); "Informática e mobiliário" abre a série INF.
-- ⚠ A VIDA ÚTIL E O RESIDUAL DO BEM NÃO MUDAM com a troca (são do bem, com vigência); para mudar, "Mudar vida útil".
-- Decisões do Gabriel (03/11 12:21): C1 a antiga se desliga ao zerar · C2 Equipamentos 10 anos / 0 %, Informática e mobiliário
-- 5 anos / 0 % (só bem novo) · C3 contas sugeridas como abaixo, sem conta nova · C4 a balança do mapa fica como está.
-- O ensaio (proto, RAISE no fim): veja o relatório patr-…-PATR-CATEGORIAS-01-fase0.md e supabase/tests/patr_categorias_01_test.sql.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. As duas categorias novas (globais) ---------------------------------------------------------------------------------------
insert into public.patrimonio_categorias (cliente_id, codigo, nome, vida_util_anos, residual_pct, deprecia, tem_mercado, base_mercado,
                                          tem_pastos, ordem, ativo, prefixo, contas_sugeridas)
select null, v.codigo, v.nome, v.vida, v.residual, true, v.mercado, v.base, false, v.ordem, true, v.prefixo, v.contas
  from (values
    ('equipamentos', 'Equipamentos', 10.00, 0.00, true, 'bem', 40, 'EQP',
     array['cb586f4f-8373-403d-95dc-dbc43d83f176', '2ab34811-6823-4e6a-8df0-db60355ba29f', 'f74dd0f7-1e0f-4186-a5f4-ae92dd1d6c8e',
           '44391d6a-786a-4b57-b54b-e085c2c61750']::uuid[]),
    ('informatica_mobiliario', 'Informática e mobiliário', 5.00, 0.00, false, null, 41, 'INF',
     array['44391d6a-786a-4b57-b54b-e085c2c61750']::uuid[])
  ) v(codigo, nome, vida, residual, mercado, base, ordem, prefixo, contas)
 where not exists (select 1 from public.patrimonio_categorias c where c.cliente_id is null and c.codigo = v.codigo);

-- a antiga sai do topo da ordem (fica ativa até zerar)
update public.patrimonio_categorias set ordem = 42, alterado_em = now()
 where cliente_id is null and codigo = 'equipamentos_informatica' and ordem = 40;

-- 2. A trilha do bem aceita a troca de categoria ------------------------------------------------------------------------------
alter table public.patrimonio_bem_trilha drop constraint patrimonio_bem_trilha_acao_check;
alter table public.patrimonio_bem_trilha add constraint patrimonio_bem_trilha_acao_check
  check (acao = any (array['correcao_em_uso', 'correcao_cadastro', 'mudanca_estimativa', 'troca_categoria']));

-- 3. O escritor oficial da troca: lote, prévia, tudo ou nada, trilha por bem --------------------------------------------------
-- p_itens: [{ "bem_id": uuid, "categoria": "<codigo>" }] · p_motivo obrigatório · p_simular = true devolve a prévia e não grava.
-- As recusas são as MESMAS do `fn_patrimonio_bem_salvar` ao trocar a categoria (pastos, avaliações, deprecia, placa/Renavam).
create or replace function public.fn_patrimonio_bens_reclassificar(p_itens jsonb, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  it jsonb;
  b public.patrimonio_bens%rowtype;
  c_de public.patrimonio_categorias%rowtype;
  c public.patrimonio_categorias%rowtype;
  v_mes_atual date := date_trunc('month', public._fn_patrimonio_hoje())::date;
  v_ja_deprecia boolean;
  v_linhas jsonb := '[]'::jsonb;
  v_vistos uuid[] := '{}';
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo da troca de categoria.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception using errcode = 'P0001', message = 'Nenhum bem para trocar de categoria.';
  end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    b := public._fn_patrimonio_bem_do_usuario(nullif(it->>'bem_id', '')::uuid);
    if b.id = any (v_vistos) then
      raise exception using errcode = 'P0001', message = format('O bem %s aparece duas vezes no lote.', b.codigo);
    end if;
    v_vistos := v_vistos || b.id;
    select * into c_de from public.patrimonio_categorias x where x.id = b.categoria_id;
    select * into c from public.patrimonio_categorias x
     where x.codigo = it->>'categoria' and x.ativo and (x.cliente_id = b.cliente_id or x.cliente_id is null)
     order by x.cliente_id nulls last limit 1;
    if c.id is null then
      raise exception using errcode = 'P0001', message = format('%s: categoria "%s" inexistente ou desligada.', b.codigo, it->>'categoria');
    end if;
    if c.id = b.categoria_id then
      raise exception using errcode = 'P0001', message = format('%s já está em %s.', b.codigo, c.nome);
    end if;
    if c.codigo <> 'veiculos' and (b.placa is not null or b.renavam is not null) then
      raise exception using errcode = 'P0001', message = format('%s: placa e Renavam são só de Veículos.', b.codigo);
    end if;
    if not c.tem_pastos and exists (select 1 from public.patrimonio_bem_pastos bp where bp.bem_id = b.id and bp.desligado_em is null) then
      raise exception using errcode = 'P0001', message = format('%s: %s não tem pastos; desmarque os pastos do bem antes.', b.codigo, c.nome);
    end if;
    if not c.tem_mercado and exists (select 1 from public.patrimonio_avaliacoes a where a.bem_id = b.id and a.cancelado_em is null) then
      raise exception using errcode = 'P0001', message = format('%s: %s não tem valor de mercado; cancele as avaliações antes.', b.codigo, c.nome);
    end if;
    v_ja_deprecia := b.situacao <> 'em_formacao' and date_trunc('month', b.em_uso_desde)::date < v_mes_atual;
    if v_ja_deprecia and c_de.deprecia <> c.deprecia then
      raise exception using errcode = 'P0001', message = format('%s já deprecia: não troca para uma categoria que deprecia de outro jeito.', b.codigo);
    end if;
    v_linhas := v_linhas || jsonb_build_object('bem_id', b.id, 'codigo', b.codigo, 'numero_proprio', b.numero_proprio,
      'descricao', b.descricao, 'de', c_de.nome, 'para', c.nome);
    if not p_simular then
      update public.patrimonio_bens set categoria_id = c.id, versao = versao + 1, alterado_em = now(), alterado_por = auth.uid()
       where id = b.id and versao = b.versao;
      if not found then
        raise exception using errcode = 'P0001', message = format('%s foi alterado por outra pessoa. Refaça a prévia.', b.codigo);
      end if;
      insert into public.patrimonio_bem_trilha (cliente_id, bem_id, acao, antes, depois, motivo, por)
      values (b.cliente_id, b.id, 'troca_categoria',
              jsonb_build_object('categoria', c_de.codigo, 'nome', c_de.nome),
              jsonb_build_object('categoria', c.codigo, 'nome', c.nome), btrim(p_motivo), auth.uid());
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'n', jsonb_array_length(v_linhas), 'linhas', v_linhas);
end $$;

revoke all on function public.fn_patrimonio_bens_reclassificar(jsonb, text, boolean) from public, anon;
grant execute on function public.fn_patrimonio_bens_reclassificar(jsonb, text, boolean) to authenticated, service_role;
