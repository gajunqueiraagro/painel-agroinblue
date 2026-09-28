-- 20261027167000_oc_venda_entregas_01b.sql
-- OC-VENDA-ENTREGAS-01b — MODELO CONTA CORRENTE DA VENDA (decisoes do Gabriel D1-D7, 28/09/2026; ADR-2026-21).
-- A ENTREGA e' a receita (competencia = data da saida, sem caixa); o RECEBIMENTO e' caixa e vira adiantamento de cliente,
-- fora do DRE. O saldo da conta corrente e' CALCULADO (entregue - recebido), nunca gravado. So' a OC 232c05aa entra no
-- modelo novo, pela migration de dado seguinte; toda OC existente continua 'titulo' e nao muda nada.
--
-- PECAS:
--   1. Plano: "Adiantamento de Clientes" (1-Entradas, 3015) e "Adiantamento a Fornecedores" (2-Saidas, 5005), no vao de
--      Movimentacoes Financeiras, sem `bloco_dre`, `compoe_dre = false` — os irmaos 3020 e 5010 sao o molde, sem renumerar.
--   2. Catalogo: principal/entrega e principal/recebimento.
--   3. `zoo_operacoes_comerciais.modelo_financeiro` ('titulo' | 'conta_corrente', padrao 'titulo').
--      `zoo_operacao_partes.entrega_movimentacao_id` (a saida zootecnica da entrega) + origem 'entrega'; uma entrega viva
--      por saida (indice parcial).
--   4. `vw_financeiro_lancamentos_v2_doc` ganha `sem_movimentacao_caixa` no fim (security_invoker conferido depois).
--   5. `fn_lista_v2_totais` (D2): "entradas"/"saidas" passam a ser SO' CAIXA e entram `entradas_sem_caixa`/`saidas_sem_caixa`.
--      A soma das quatro e' a soma de antes: nada contado duas vezes. DROP + CREATE (o tipo de retorno muda), ACL igual.
--   6. `_oc_vinculo_mapa` + 'Adiantamento de Clientes' (venda, principal, recebimento, 1-Entradas).
--   7. `oc_sincronizar_liquidacao_de_financeiro`: parte de ENTREGA nao gera liquidacao — entrega e' fato, nao pagamento.
--   8. `oc_sincronizar_entregas` (nova, idempotente): um titulo por saida ATIVA — realizado, sem conta, sem caixa,
--      competencia = pagamento = data da saida, conta do plano pela categoria do lote (espelho de `subcentroVenda.ts`, D7),
--      valor = valor do lote (por cabeca quando o lote tem mais de uma saida; a ultima leva o residuo quando o lote fecha).
--      Saida que deixou de estar ativa: entrega cancelada. Divergencia de valor/data/conta: titulo atualizado.
--   9. `oc_vincular_lancamento` (patch guardado): no modelo conta corrente, a ENTRADA de uma venda vai para
--      `_oc_vincular_recebimento` — competencia MANTIDA, conta trocada para Adiantamento de Clientes, parte 'recebimento' sem
--      compromisso, hash preservado. No modelo titulo, Adiantamento de Clientes e' recusado.
--  10. `oc_conta_corrente` (nova, INVOKER, leitura): linhas (entregas e recebimentos), saldo acumulado e situacao;
--      recebimento com status 'sem_conta_bancaria' | 'conciliado' | 'programado' | 'realizado' — D6: nada e' inventado.
--      `oc_recebimentos_vinculaveis` (nova, INVOKER): entradas do cliente que o "Vincular recebimento ja lancado" oferece.
--
-- PATCH GUARDADO POR md5 (origem -> destino):
--   oc_vincular_lancamento                   9634b63b -> 9ce51f1f
--   oc_sincronizar_liquidacao_de_financeiro  d139826a -> 8175fee1
--   _oc_vinculo_mapa                         928535c7 -> 4d830519
--   fn_lista_v2_totais                       023c7790 -> e5746a9f  (DROP + CREATE; ACL conferida igual)
--   vw_financeiro_lancamentos_v2_doc         viewdef fff1e9ce -> + sem_movimentacao_caixa (security_invoker conferido)
--
-- PROVA (rollback no proto, 28/09/2026, esta migration + a 167100, como o usuario do Gabriel):
--   DRE Santa Rita 2025, vendas por mes (fn_dre_pecuaria): mar 516.184,20 -> 1.508.322,44 (+992.138,24 das entregas de 19 e
--   20/03); abr 1.260.338,95 -> 842.244,81; mai 574.042,04 -> 567.955,59; jun 1.256.212,48 -> 920.716,72; jul 649.059,94 ->
--   417.955,94; os outros sete meses identicos. Ano: vendas 8.504.803,42 -> 8.506.161,31, VBP 7.699.400,16 -> 7.700.758,05,
--   resultado operacional 1.752.337,39 -> 1.753.695,28 — +1.357,89 nos tres, o saldo que o Helder deve.
--   Por conta: as entregas em 1120 (992.138,24 mar; 574.046,85 abr; 549.925,25 mai; 207.404,34 jun) e 1140 (18.030,34 mai;
--   25.056,24 jun), sem caixa; os 4 recebimentos em Adiantamento de Clientes, fora do DRE.
--   Caixa do cliente inteiro (sem caixa excluido, por mes, tipo e conta): md5 1e61bae9 antes e depois.
--   oc_conta_corrente: entregue 2.366.601,26 (779 cab), recebido 2.365.243,37, saldo 1.357,89 'ele_deve', 4 recebimentos
--   'sem_conta_bancaria', 0 saidas sem entrega. Entregas com liquidacao: 0. Recebimentos: 1 liquidacao automatica cada; a OC
--   fica 'parcial' com saldo 1.357,89 em vw_oc_operacao_liquidacao. Segunda chamada de oc_sincronizar_entregas: 7 mantidas.
--   Estrutura sozinha (antes do dado): DRE do ano identico.

-- ═══ guardas de origem ═══
do $g$
declare r record;
begin
  for r in select * from (values
    ('oc_vincular_lancamento', '9634b63b6ec32b1d268ccf5f6da7972f'),
    ('oc_sincronizar_liquidacao_de_financeiro', 'd139826a1afbada6e4f7676c8e38b2f4'),
    ('_oc_vinculo_mapa', '928535c7e5f786282fed637187dd0b23'),
    ('fn_lista_v2_totais', '023c77905d0c78d889cef965e1a450b9')) v(fn, h)
  loop
    if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = r.fn and md5(prosrc) = r.h) then
      raise exception 'OC-VENDA-ENTREGAS-01b: % fora do corpo esperado', r.fn;
    end if;
  end loop;
  if exists (select 1 from public.financeiro_plano_contas where ordem_exibicao in (3015, 5005)
                or subcentro in ('Adiantamento de Clientes', 'Adiantamento a Fornecedores')) then
    raise exception 'OC-VENDA-ENTREGAS-01b: ordem 3015/5005 ou subcentro de adiantamento ja existe no plano';
  end if;
  if md5(pg_get_viewdef('public.vw_financeiro_lancamentos_v2_doc'::regclass)) <> 'fff1e9ce17c58b84c70fdc51870d9686' then
    raise exception 'OC-VENDA-ENTREGAS-01b: vw_financeiro_lancamentos_v2_doc fora da definicao esperada';
  end if;
end $g$;

-- ═══ 1. plano ═══
insert into public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, grupo_fluxo, escopo_negocio, ativo,
   ordem_exibicao, compoe_dre, gera_lcdpr, bloco_dre)
values
  (null, '1-Entradas', 'Entrada Financeira', 'Outras Entradas', 'Movimentações Financeiras', 'Adiantamento de Clientes',
   null, 'pecuaria', true, 3015, false, null, null),
  (null, '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Movimentações Financeiras', 'Adiantamento a Fornecedores',
   null, 'pecuaria', true, 5005, false, null, null);

-- ═══ 2. catalogo ═══
insert into public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ativo, ordem_exibicao, sistemico)
values ('principal', 'entrega', 'Entrega (receita sem caixa)', 'principal', true, 2, true),
       ('principal', 'recebimento', 'Recebimento (adiantamento de cliente)', 'principal', true, 3, true);

-- ═══ 3. colunas ═══
alter table public.zoo_operacoes_comerciais
  add column modelo_financeiro text not null default 'titulo'
  constraint zoo_operacoes_comerciais_modelo_financeiro_check check (modelo_financeiro in ('titulo', 'conta_corrente'));
comment on column public.zoo_operacoes_comerciais.modelo_financeiro is
  'OC-VENDA-ENTREGAS-01b (ADR-2026-21): titulo = compromissos e titulos (o de sempre); conta_corrente = entrega e receita '
  'sem caixa na data da saida, recebimento como adiantamento de cliente, saldo calculado por oc_conta_corrente.';

alter table public.zoo_operacao_partes
  add column entrega_movimentacao_id uuid references public.lancamentos(id);
comment on column public.zoo_operacao_partes.entrega_movimentacao_id is
  'OC-VENDA-ENTREGAS-01b: a saida zootecnica que esta parte de ENTREGA fatura. So existe com origem = entrega.';
alter table public.zoo_operacao_partes drop constraint zoo_operacao_partes_origem_check;
alter table public.zoo_operacao_partes add constraint zoo_operacao_partes_origem_check
  check (origem = any (array['negociacao'::text, 'documento'::text, 'manual'::text, 'programacao'::text, 'entrega'::text]));
alter table public.zoo_operacao_partes add constraint zoo_operacao_partes_entrega_coerente
  check ((origem = 'entrega') = (entrega_movimentacao_id is not null));
create unique index zoo_operacao_partes_entrega_uniq on public.zoo_operacao_partes (entrega_movimentacao_id)
  where cancelada = false and entrega_movimentacao_id is not null;

-- ═══ 4. view da lista ═══
do $v$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_viewdef('public.vw_financeiro_lancamentos_v2_doc'::regclass);
  v_a := $a$    compoe_dre
   FROM financeiro_lancamentos_v2 l;$a$;
  v_b := $b$    compoe_dre,
    sem_movimentacao_caixa
   FROM financeiro_lancamentos_v2 l;$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01b: ancora da view nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);
  execute 'create or replace view public.vw_financeiro_lancamentos_v2_doc with (security_invoker = true) as ' || v_def;
end $v$;

-- ═══ 5. totais da lista (D2) ═══
do $t$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_functiondef('public.fn_lista_v2_totais'::regproc);

  v_a := $a$RETURNS TABLE(total bigint, entradas numeric, saidas numeric, excluidos_sem_vencimento bigint)$a$;
  v_b := $b$RETURNS TABLE(total bigint, entradas numeric, saidas numeric, excluidos_sem_vencimento bigint, entradas_sem_caixa numeric, saidas_sem_caixa numeric)$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01b: ancora RETURNS dos totais nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  v_a := $a$    SELECT
      v.valor,
$a$;
  v_b := $b$    SELECT
      v.valor,
      -- OC-VENDA-ENTREGAS-01b (D2): sem caixa (entrega, barter, consumo, funrural) fica FORA de entradas/saidas e
      -- ganha total proprio. NULL conta como caixa, que e' o que o campo sempre significou na lista.
      coalesce(v.sem_movimentacao_caixa, false) AS sem_caixa,
$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01b: ancora do SELECT dos totais nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  v_a := $a$    coalesce(sum(m.valor) FILTER (WHERE m.no_recorte AND m.sinal_num > 0), 0)::numeric,
    coalesce(sum(m.valor) FILTER (WHERE m.no_recorte AND m.sinal_num < 0), 0)::numeric,$a$;
  v_b := $b$    coalesce(sum(m.valor) FILTER (WHERE m.no_recorte AND m.sinal_num > 0 AND NOT m.sem_caixa), 0)::numeric,
    coalesce(sum(m.valor) FILTER (WHERE m.no_recorte AND m.sinal_num < 0 AND NOT m.sem_caixa), 0)::numeric,$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01b: ancora das somas dos totais nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  v_a := $a$     - count(*) FILTER (WHERE m.no_recorte AND m.data_vencimento IS NULL))::bigint
  FROM marcado m;$a$;
  v_b := $b$     - count(*) FILTER (WHERE m.no_recorte AND m.data_vencimento IS NULL))::bigint,
    coalesce(sum(m.valor) FILTER (WHERE m.no_recorte AND m.sinal_num > 0 AND m.sem_caixa), 0)::numeric,
    coalesce(sum(m.valor) FILTER (WHERE m.no_recorte AND m.sinal_num < 0 AND m.sem_caixa), 0)::numeric
  FROM marcado m;$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01b: ancora do FROM dos totais nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  drop function public.fn_lista_v2_totais(uuid, uuid, text, daterange[], smallint[], boolean, boolean, uuid, uuid, text,
    text[], boolean, text, text, text, text, text, text, uuid, text, text, text);
  execute v_def;
end $t$;
revoke all on function public.fn_lista_v2_totais(uuid, uuid, text, daterange[], smallint[], boolean, boolean, uuid, uuid, text,
  text[], boolean, text, text, text, text, text, text, uuid, text, text, text) from public, anon, service_role;
grant execute on function public.fn_lista_v2_totais(uuid, uuid, text, daterange[], smallint[], boolean, boolean, uuid, uuid, text,
  text[], boolean, text, text, text, text, text, text, uuid, text, text, text) to authenticated;

-- ═══ 6. mapa do vincular ═══
do $m$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_functiondef('public._oc_vinculo_mapa'::regproc);
  v_a := $a$      ('Venda em Boitel',                              ARRAY['venda'],                  'principal',       ARRAY['principal'],                                              '1-Entradas'),
$a$;
  v_b := $b$      ('Venda em Boitel',                              ARRAY['venda'],                  'principal',       ARRAY['principal'],                                              '1-Entradas'),
      ('Adiantamento de Clientes',                     ARRAY['venda'],                  'principal',       ARRAY['recebimento'],                                            '1-Entradas'),
$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01b: ancora do mapa nao casa 1x'; end if;
  execute replace(v_def, v_a, v_b);
end $m$;

-- ═══ 7. liquidacao automatica ignora entrega ═══
do $l$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_functiondef('public.oc_sincronizar_liquidacao_de_financeiro'::regproc);
  v_a := $a$  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = v_parte.operacao_id AND cliente_id = v_parte.cliente_id FOR UPDATE;$a$;
  v_b := $b$  -- OC-VENDA-ENTREGAS-01b: a ENTREGA e' receita sem caixa, nao pagamento de ninguem. Liquida-la faria a OC contar
  -- como recebido o que so' foi entregue; o recebimento da conta corrente e' outra parte, que continua liquidando.
  IF v_parte.origem = 'entrega' THEN RETURN; END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = v_parte.operacao_id AND cliente_id = v_parte.cliente_id FOR UPDATE;$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01b: ancora da liquidacao nao casa 1x'; end if;
  execute replace(v_def, v_a, v_b);
end $l$;

-- ═══ 8. subcentro da venda (espelho de src/lib/financeiro/subcentroVenda.ts — vitest compara os dois) ═══
create or replace function public._oc_subcentro_venda(p_categoria text, p_tem_boitel boolean)
returns text
language sql immutable
set search_path = public
as $fn$
  SELECT CASE WHEN p_tem_boitel THEN 'Venda em Boitel' ELSE CASE p_categoria
    WHEN 'mamotes_m' THEN 'Venda de Desmama Machos'
    WHEN 'desmama_m' THEN 'Venda de Desmama Machos'
    WHEN 'bezerros_m' THEN 'Venda de Desmama Machos'
    WHEN 'mamotes_f' THEN 'Venda de Desmama Fêmeas'
    WHEN 'desmama_f' THEN 'Venda de Desmama Fêmeas'
    WHEN 'bezerras_f' THEN 'Venda de Desmama Fêmeas'
    WHEN 'garrotes' THEN 'Venda de Machos Adultos'
    WHEN 'bois' THEN 'Venda de Machos Adultos'
    WHEN 'touros' THEN 'Venda de Machos Adultos'
    WHEN 'machos_adultos' THEN 'Venda de Machos Adultos'
    WHEN 'novilhas' THEN 'Venda de Fêmeas Adultas'
    WHEN 'vacas' THEN 'Venda de Fêmeas Adultas'
    WHEN 'femeas_adultas' THEN 'Venda de Fêmeas Adultas'
  END END;
$fn$;
revoke all on function public._oc_subcentro_venda(text, boolean) from public, anon;
grant execute on function public._oc_subcentro_venda(text, boolean) to authenticated, service_role;

-- ═══ 8b. oc_sincronizar_entregas ═══
create or replace function public.oc_sincronizar_entregas(p_operacao_id uuid, p_versao_esperada integer, p_simular boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(), '') = 'service_role');
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_boitel boolean;
  r record;
  v_pc public.financeiro_plano_contas;
  v_tit uuid;
  v_parte uuid;
  v_criadas jsonb := '[]'::jsonb;
  v_atualizadas jsonb := '[]'::jsonb;
  v_canceladas jsonb := '[]'::jsonb;
  v_mantidas int := 0;
  v_motivo constant text := 'saida deixou de estar ativa na operacao (OC-VENDA-ENTREGAS-01b)';
  v_nova int;
  v_ret jsonb;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  IF NOT (v_is_service OR (v_actor IS NOT NULL AND (public.is_admin_agroinblue(v_actor)
          OR v_cli IN (SELECT public.get_user_cliente_ids(v_actor))))) THEN
    RAISE EXCEPTION 'Sem permissao nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501'; END IF;
  IF p_simular IS NOT TRUE AND v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.modelo_financeiro <> 'conta_corrente' THEN
    RAISE EXCEPTION 'Entregas no financeiro so existem no modelo conta corrente' USING ERRCODE = 'P0001'; END IF;
  IF v_op.tipo_operacao <> 'venda' THEN
    RAISE EXCEPTION 'Conta corrente, por enquanto, so em venda' USING ERRCODE = 'P0001'; END IF;
  IF v_op.rascunho OR v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao em rascunho ou cancelada nao gera entrega' USING ERRCODE = 'P0001'; END IF;
  v_boitel := EXISTS (SELECT 1 FROM public.zoo_operacao_boitel b WHERE b.operacao_id = p_operacao_id);
  IF v_boitel THEN
    RAISE EXCEPTION 'Venda em boitel nao usa conta corrente (fora do OC-VENDA-ENTREGAS-01b)' USING ERRCODE = 'P0001'; END IF;

  -- (1) entregas vivas cuja saida nao esta mais ativa na OC: cancela titulo e parte
  FOR r IN
    SELECT pt.id AS parte_id, pt.financeiro_lancamento_id AS tit_id, pt.valor, pt.entrega_movimentacao_id
      FROM public.zoo_operacao_partes pt
     WHERE pt.operacao_id = p_operacao_id AND pt.origem = 'entrega' AND pt.cancelada = false
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m
                         JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
                        WHERE m.operacao_id = p_operacao_id AND m.movimentacao_id = pt.entrega_movimentacao_id
                          AND m.operacao_lote_id IS NOT NULL)
  LOOP
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = v_motivo,
           updated_at = now(), updated_by = v_actor
     WHERE id = r.tit_id AND cancelado IS NOT TRUE;
    UPDATE public.zoo_operacao_partes
       SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = v_motivo, updated_at = now()
     WHERE id = r.parte_id;
    v_canceladas := v_canceladas || jsonb_build_object('parte_id', r.parte_id, 'titulo_id', r.tit_id,
                      'movimentacao_id', r.entrega_movimentacao_id, 'valor', r.valor);
  END LOOP;

  -- (2) cada saida ativa: o valor esperado da entrega
  FOR r IN
    WITH s AS (
      SELECT m.movimentacao_id, m.operacao_lote_id AS lote_id, l.data, l.quantidade AS cab, l.peso_medio_kg,
             l.fazenda_id, lo.categoria_negociada AS categoria, lo.ordem, lo.qtd_negociada,
             (public._oc_valor_do_lote(lo.id)->>'total')::numeric AS total_lote,
             sum(l.quantidade) OVER (PARTITION BY lo.id) AS cab_lote,
             sum(l.quantidade) OVER (PARTITION BY lo.id ORDER BY l.data, l.id) AS cab_acum,
             row_number() OVER (PARTITION BY lo.id ORDER BY l.data DESC, l.id DESC) AS inv
        FROM public.zoo_operacao_movimentacoes m
        JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
        JOIN public.zoo_operacao_lotes lo ON lo.id = m.operacao_lote_id
       WHERE m.operacao_id = p_operacao_id
    ), v AS (
      SELECT s.*,
        -- por cabeca da quantidade NEGOCIADA; quando as saidas fecham o lote, a ultima leva o residuo e a soma e' o lote
        CASE WHEN s.cab_lote = s.qtd_negociada AND s.inv = 1
             THEN s.total_lote - coalesce((SELECT sum(round(s2.total_lote * s2.cab / s2.qtd_negociada, 2))
                                             FROM s s2 WHERE s2.lote_id = s.lote_id AND s2.inv > 1), 0)
             ELSE round(s.total_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS valor
        FROM s
    )
    SELECT v.*, pt.id AS parte_id, pt.financeiro_lancamento_id AS tit_id, f.valor AS tit_valor,
           f.data_competencia AS tit_comp, f.plano_conta_id AS tit_plano
      FROM v
      LEFT JOIN public.zoo_operacao_partes pt
        ON pt.entrega_movimentacao_id = v.movimentacao_id AND pt.cancelada = false AND pt.origem = 'entrega'
      LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
     ORDER BY v.data, v.ordem, v.movimentacao_id
  LOOP
    IF r.valor IS NULL OR r.valor <= 0 THEN
      RAISE EXCEPTION 'Lote % (ordem %) sem valor: a entrega de % nao tem o que faturar', r.categoria, r.ordem,
        to_char(r.data, 'DD/MM/YYYY') USING ERRCODE = 'P0001'; END IF;
    SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
     WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.tipo_operacao = '1-Entradas'
       AND pc.subcentro = public._oc_subcentro_venda(r.categoria, false);
    IF v_pc.id IS NULL THEN
      RAISE EXCEPTION 'Categoria % (lote ordem %) sem conta de venda no plano', r.categoria, r.ordem USING ERRCODE = 'P0001'; END IF;

    IF r.parte_id IS NULL THEN
      INSERT INTO public.financeiro_lancamentos_v2 (
        cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
        favorecido_id, conta_bancaria_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
        macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id, descricao, created_by, updated_by, safra_id)
      VALUES (
        v_cli, coalesce(r.fazenda_id, v_op.fazenda_id), r.valor, '1', '1-Entradas', r.data, r.data, r.data, to_char(r.data, 'YYYY-MM'),
        v_op.contraparte_id, NULL, 'operacao_comercial', 'oc:entrega', 'realizado', v_op.cenario, true,
        v_pc.macro_custo, v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, v_pc.id,
        format('Entrega %s cab %s', r.cab, r.categoria), v_actor, v_actor,
        public.fn_safra_sugerida(v_cli, r.data, v_pc.escopo_negocio))
      RETURNING id INTO v_tit;
      INSERT INTO public.zoo_operacao_partes (
        cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento,
        descricao, incluso_no_total, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
        lote_id, financeiro_lancamento_id, sem_movimentacao_caixa, entrega_movimentacao_id)
      VALUES (
        v_cli, p_operacao_id, 'entrega', 'principal', 'entrega', 1, 1, r.valor, r.data,
        format('Entrega %s cab %s', r.cab, r.categoria), false, v_op.contraparte_id, v_pc.id, v_pc.macro_custo,
        v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, r.lote_id, v_tit, true, r.movimentacao_id)
      RETURNING id INTO v_parte;
      v_criadas := v_criadas || jsonb_build_object('parte_id', v_parte, 'titulo_id', v_tit, 'movimentacao_id', r.movimentacao_id,
                     'lote_ordem', r.ordem, 'data', r.data, 'cab', r.cab, 'valor', r.valor, 'subcentro', v_pc.subcentro);
    ELSIF r.tit_valor IS DISTINCT FROM r.valor OR r.tit_comp IS DISTINCT FROM r.data OR r.tit_plano IS DISTINCT FROM v_pc.id THEN
      UPDATE public.financeiro_lancamentos_v2
         SET valor = r.valor, data_competencia = r.data, data_pagamento = r.data, data_vencimento = r.data,
             ano_mes = to_char(r.data, 'YYYY-MM'), plano_conta_id = v_pc.id, updated_at = now(), updated_by = v_actor
       WHERE id = r.tit_id;
      UPDATE public.zoo_operacao_partes
         SET valor = r.valor, data_vencimento = r.data, plano_conta_id = v_pc.id, macro_custo = v_pc.macro_custo,
             grupo_custo = v_pc.grupo_custo, centro_custo = v_pc.centro_custo, subcentro = v_pc.subcentro, updated_at = now()
       WHERE id = r.parte_id;
      v_atualizadas := v_atualizadas || jsonb_build_object('parte_id', r.parte_id, 'titulo_id', r.tit_id,
                         'movimentacao_id', r.movimentacao_id, 'valor_anterior', r.tit_valor, 'valor', r.valor,
                         'data_anterior', r.tit_comp, 'data', r.data);
    ELSE
      v_mantidas := v_mantidas + 1;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_criadas) + jsonb_array_length(v_atualizadas) + jsonb_array_length(v_canceladas) > 0 THEN
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
    VALUES (v_cli, p_operacao_id, 'sincronizar_entregas',
      jsonb_build_object('criadas', v_criadas, 'atualizadas', v_atualizadas, 'canceladas', v_canceladas,
                         'mantidas', v_mantidas, 'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
      v_actor, 'rpc');
    UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor
     WHERE id = p_operacao_id;
  END IF;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false),
    'criadas', v_criadas, 'atualizadas', v_atualizadas, 'canceladas', v_canceladas, 'mantidas', v_mantidas,
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END);
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao de entregas (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$fn$;
revoke all on function public.oc_sincronizar_entregas(uuid, integer, boolean) from public, anon;
grant execute on function public.oc_sincronizar_entregas(uuid, integer, boolean) to authenticated, service_role;

-- ═══ 9a. _oc_vincular_recebimento (interna: so' o oc_vincular_lancamento a chama) ═══
create or replace function public._oc_vincular_recebimento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid,
  p_motivo text, p_simular boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_l public.financeiro_lancamentos_v2;
  v_l_depois public.financeiro_lancamentos_v2;
  v_pc public.financeiro_plano_contas;
  v_parte_id uuid;
  v_avisos jsonb := '[]'::jsonb;
  v_nova int;
  v_ret jsonb;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF v_op.modelo_financeiro <> 'conta_corrente' OR v_op.tipo_operacao <> 'venda' THEN
    RAISE EXCEPTION 'Recebimento de conta corrente so em venda no modelo conta corrente' USING ERRCODE = 'P0001'; END IF;
  IF p_simular IS NOT TRUE AND v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF v_l.tipo_operacao <> '1-Entradas' THEN
    RAISE EXCEPTION 'Recebimento tem de ser uma entrada' USING ERRCODE = 'P0001'; END IF;
  IF coalesce(v_l.sem_movimentacao_caixa, false) THEN
    RAISE EXCEPTION 'Lancamento sem movimentacao de caixa nao e recebimento' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = v_l.id AND p.cancelada = false) THEN
    RAISE EXCEPTION 'Lancamento ja esta ligado a uma operacao' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_pc FROM public.financeiro_plano_contas
   WHERE cliente_id IS NULL AND subcentro = 'Adiantamento de Clientes' AND tipo_operacao = '1-Entradas' AND ativo;
  IF v_pc.id IS NULL THEN RAISE EXCEPTION 'Conta Adiantamento de Clientes ausente do plano' USING ERRCODE = 'P0001'; END IF;

  IF v_op.contraparte_id IS NOT NULL AND v_l.favorecido_id IS DISTINCT FROM v_op.contraparte_id THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'favorecido_diferente',
                  'operacao', v_op.contraparte_id, 'lancamento', v_l.favorecido_id);
  END IF;

  -- a conta vira adiantamento; a COMPETENCIA fica (recebimento e' caixa, o mes dele e' o do dinheiro)
  IF v_l.plano_conta_id IS DISTINCT FROM v_pc.id OR v_l.movimentacao_rebanho_id IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos_v2
       SET plano_conta_id = v_pc.id, movimentacao_rebanho_id = NULL, updated_at = now(), updated_by = v_actor
     WHERE id = v_l.id;
  END IF;
  -- o hash de importacao nao pode mudar (mesmo cuidado do VINCULAR-FIX-01)
  UPDATE public.financeiro_lancamentos_v2 SET hash_importacao = v_l.hash_importacao
   WHERE id = v_l.id AND hash_importacao IS DISTINCT FROM v_l.hash_importacao;
  SELECT * INTO v_l_depois FROM public.financeiro_lancamentos_v2 WHERE id = v_l.id;
  IF v_l_depois.hash_importacao IS DISTINCT FROM v_l.hash_importacao THEN
    RAISE EXCEPTION 'Vincular mudaria o hash de importacao do lancamento %; abortado', v_l.id USING ERRCODE = 'P0001'; END IF;
  IF v_l_depois.data_competencia IS DISTINCT FROM v_l.data_competencia OR v_l_depois.valor IS DISTINCT FROM v_l.valor
     OR v_l_depois.data_pagamento IS DISTINCT FROM v_l.data_pagamento
     OR v_l_depois.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id THEN
    RAISE EXCEPTION 'Vincular recebimento so troca a conta do plano; valor, datas ou conta bancaria mudariam' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.zoo_operacao_partes (
    cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento,
    descricao, incluso_no_total, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
    financeiro_lancamento_id, sem_movimentacao_caixa)
  VALUES (
    v_op.cliente_id, p_operacao_id, 'manual', 'principal', 'recebimento', 1, 1, round(v_l.valor, 2),
    coalesce(v_l.data_pagamento, v_l.data_vencimento, v_l.data_competencia), v_l.descricao, false, v_l.favorecido_id,
    v_pc.id, v_l_depois.macro_custo, v_l_depois.grupo_custo, v_l_depois.centro_custo, v_l_depois.subcentro, v_l.id, false)
  RETURNING id INTO v_parte_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  VALUES (v_op.cliente_id, p_operacao_id, 'vincular_recebimento',
    jsonb_build_object('lancamento', to_jsonb(v_l)),
    jsonb_build_object('lancamento', to_jsonb(v_l_depois),
                       'parte', (SELECT to_jsonb(p) FROM public.zoo_operacao_partes p WHERE p.id = v_parte_id)),
    jsonb_build_object('motivo', p_motivo, 'lancamento_id', v_l.id, 'parte_id', v_parte_id,
      'conta_anterior', v_l.subcentro, 'conta_nova', v_l_depois.subcentro,
      'hash_importacao', v_l.hash_importacao, 'avisos', v_avisos,
      'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
    v_actor, 'rpc');
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  v_ret := jsonb_build_object('ok', true, 'acao', CASE WHEN p_simular THEN 'simulado' ELSE 'vinculado' END,
    'modelo', 'conta_corrente', 'simulado', coalesce(p_simular, false),
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END,
    'parte_id', v_parte_id,
    'lancamento', jsonb_build_object('id', v_l.id, 'conta_anterior', v_l.subcentro, 'conta_nova', v_l_depois.subcentro,
                    'competencia', v_l.data_competencia,
                    'hash_preservado', v_l.hash_importacao IS NOT DISTINCT FROM v_l_depois.hash_importacao),
    'avisos', v_avisos);
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao de recebimento (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$fn$;
revoke all on function public._oc_vincular_recebimento(uuid, integer, uuid, text, boolean) from public, anon, authenticated;

-- ═══ 9b. o ramo no oc_vincular_lancamento ═══
do $vl$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_functiondef('public.oc_vincular_lancamento'::regproc);
  v_a := $a$  v_natureza := v_regra.natureza;
  v_valor := round(v_l.valor, 2);$a$;
  v_b := $b$  -- OC-VENDA-ENTREGAS-01b (ADR-2026-21): no modelo CONTA CORRENTE a entrada de uma venda e' RECEBIMENTO — caixa, fora
  -- do DRE, sem compromisso. A receita ja entrou pela ENTREGA. No modelo titulo, adiantamento de cliente nao se vincula.
  IF v_op.modelo_financeiro = 'conta_corrente' THEN
    IF v_op.tipo_operacao = 'venda' AND v_regra.tipo_operacao = '1-Entradas' THEN
      RETURN public._oc_vincular_recebimento(p_operacao_id, p_versao_esperada, p_lancamento_id, p_motivo, p_simular);
    END IF;
  ELSIF 'recebimento' = ANY (v_regra.componentes) THEN
    RAISE EXCEPTION 'Adiantamento de Clientes so se vincula a uma operacao no modelo conta corrente' USING ERRCODE = 'P0001';
  END IF;
  v_natureza := v_regra.natureza;
  v_valor := round(v_l.valor, 2);$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01b: ancora do vincular nao casa 1x'; end if;
  execute replace(v_def, v_a, v_b);
end $vl$;

-- ═══ 10. oc_conta_corrente e oc_recebimentos_vinculaveis (leitura) ═══
create or replace function public.oc_conta_corrente(p_operacao_id uuid)
returns jsonb
language sql stable security invoker
set search_path = public
as $fn$
  WITH op AS (
    SELECT o.* FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id
  ), lin AS (
    -- entregas: a receita, sem caixa
    SELECT 'entrega'::text AS tipo, f.data_competencia AS data, 0 AS ordem_dia, f.id AS lancamento_id, pt.id AS parte_id,
           pt.lote_id, lo.ordem AS lote_ordem, lo.categoria_negociada AS categoria, z.quantidade AS cab,
           z.peso_medio_kg, f.descricao, f.subcentro AS conta, round(f.valor, 2) AS valor, 'sem_caixa'::text AS status,
           NULL::uuid AS conta_bancaria_id, true AS conta_no_saldo
      FROM public.zoo_operacao_partes pt
      JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
      LEFT JOIN public.zoo_operacao_lotes lo ON lo.id = pt.lote_id
      LEFT JOIN public.lancamentos z ON z.id = pt.entrega_movimentacao_id
     WHERE pt.operacao_id = p_operacao_id AND pt.origem = 'entrega' AND pt.cancelada = false
    UNION ALL
    -- recebimentos: o caixa. Status e' o que o dado diz (D6): sem conta bancaria nunca aparece como conciliado.
    SELECT 'recebimento', coalesce(f.data_pagamento, f.data_vencimento, f.data_competencia), 1, f.id, pt.id,
           NULL::uuid, NULL::int, NULL::text, NULL::int, NULL::numeric, f.descricao, f.subcentro, round(f.valor, 2),
           CASE WHEN EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi
                              WHERE cbi.lancamento_id = f.id AND cbi.desfeito_em IS NULL) THEN 'conciliado'
                WHEN f.status_transacao IN ('programado', 'agendado') THEN 'programado'
                WHEN f.conta_bancaria_id IS NULL THEN 'sem_conta_bancaria'
                ELSE 'realizado' END,
           f.conta_bancaria_id,
           f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL
      FROM public.zoo_operacao_partes pt
      JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
     WHERE pt.operacao_id = p_operacao_id AND pt.componente = 'recebimento' AND pt.cancelada = false
  ), acum AS (
    SELECT lin.*,
           -- saldo = o que o cliente deve: entrega soma, recebimento diminui; programado fica fora do saldo
           sum(CASE WHEN NOT conta_no_saldo THEN 0 WHEN tipo = 'entrega' THEN valor ELSE -valor END)
             OVER (ORDER BY data, ordem_dia, lancamento_id) AS saldo
      FROM lin
  ), tot AS (
    SELECT coalesce(sum(valor) FILTER (WHERE tipo = 'entrega'), 0) AS entregue,
           coalesce(sum(cab) FILTER (WHERE tipo = 'entrega'), 0) AS cab_entregue,
           coalesce(sum(valor) FILTER (WHERE tipo = 'recebimento' AND conta_no_saldo), 0) AS recebido,
           coalesce(sum(valor) FILTER (WHERE tipo = 'recebimento' AND NOT conta_no_saldo), 0) AS programado,
           count(*) FILTER (WHERE tipo = 'recebimento' AND status = 'sem_conta_bancaria') AS sem_conta
      FROM lin
  ), pend AS (
    -- saidas ativas da OC sem entrega viva: o que "Atualizar entregas" geraria
    SELECT count(*) AS saidas_sem_entrega
      FROM public.zoo_operacao_movimentacoes m
      JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
     WHERE m.operacao_id = p_operacao_id AND m.operacao_lote_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
                        WHERE pt.entrega_movimentacao_id = m.movimentacao_id AND pt.cancelada = false)
  )
  SELECT jsonb_build_object(
    'operacao_id', op.id, 'modelo', op.modelo_financeiro, 'versao', op.versao,
    'valor_acordado', op.valor_acordado,
    'entregue', round(tot.entregue, 2), 'cab_entregue', tot.cab_entregue,
    'recebido', round(tot.recebido, 2), 'programado', round(tot.programado, 2),
    'saldo', round(tot.entregue - tot.recebido, 2),
    'situacao', CASE WHEN round(tot.entregue - tot.recebido, 2) > 0 THEN 'ele_deve'
                     WHEN round(tot.entregue - tot.recebido, 2) < 0 THEN 'nos_devemos'
                     ELSE 'quitado' END,
    'a_entregar', round(coalesce(op.valor_acordado, 0) - tot.entregue, 2),
    'recebimentos_sem_conta_bancaria', tot.sem_conta,
    'saidas_sem_entrega', pend.saidas_sem_entrega,
    'linhas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'tipo', a.tipo, 'data', a.data, 'lancamento_id', a.lancamento_id, 'parte_id', a.parte_id,
        'lote_id', a.lote_id, 'lote_ordem', a.lote_ordem, 'categoria', a.categoria, 'cab', a.cab,
        'peso_medio_kg', a.peso_medio_kg, 'descricao', a.descricao, 'conta', a.conta, 'valor', a.valor,
        'status', a.status, 'conta_bancaria_id', a.conta_bancaria_id, 'no_saldo', a.conta_no_saldo,
        'saldo', round(a.saldo, 2))
        ORDER BY a.data, a.ordem_dia, a.lancamento_id) FROM acum a), '[]'::jsonb))
  FROM op, tot, pend;
$fn$;
revoke all on function public.oc_conta_corrente(uuid) from public, anon;
grant execute on function public.oc_conta_corrente(uuid) to authenticated, service_role;

create or replace function public.oc_recebimentos_vinculaveis(p_operacao_id uuid)
returns table (lancamento_id uuid, data date, valor numeric, descricao text, subcentro text, favorecido_id uuid,
               mesmo_favorecido boolean, conta_bancaria_id uuid, status_transacao text, conciliado boolean)
language sql stable security invoker
set search_path = public
as $fn$
  -- entradas do cliente que ainda nao pertencem a OC nenhuma, nas contas que o vincular aceita para venda
  SELECT f.id, coalesce(f.data_pagamento, f.data_vencimento, f.data_competencia), round(f.valor, 2), f.descricao, f.subcentro,
         f.favorecido_id, f.favorecido_id IS NOT DISTINCT FROM o.contraparte_id, f.conta_bancaria_id, f.status_transacao,
         EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi WHERE cbi.lancamento_id = f.id AND cbi.desfeito_em IS NULL)
    FROM public.zoo_operacoes_comerciais o
    JOIN public.financeiro_lancamentos_v2 f ON f.cliente_id = o.cliente_id
   WHERE o.id = p_operacao_id AND o.modelo_financeiro = 'conta_corrente' AND o.tipo_operacao = 'venda'
     AND f.cancelado IS NOT TRUE AND coalesce(f.cenario, 'realizado') <> 'meta'
     AND f.tipo_operacao = '1-Entradas' AND coalesce(f.sem_movimentacao_caixa, false) = false
     AND f.financiamento_id IS NULL AND f.transferencia_grupo_id IS NULL AND f.valor > 0
     AND f.subcentro IN (SELECT m.subcentro FROM public._oc_vinculo_mapa() m
                          WHERE 'venda' = ANY (m.tipos_oc) AND m.tipo_operacao = '1-Entradas' AND m.natureza = 'principal')
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = f.id AND p.cancelada = false)
   ORDER BY (f.favorecido_id IS NOT DISTINCT FROM o.contraparte_id) DESC,
            coalesce(f.data_pagamento, f.data_vencimento, f.data_competencia), f.id;
$fn$;
revoke all on function public.oc_recebimentos_vinculaveis(uuid) from public, anon;
grant execute on function public.oc_recebimentos_vinculaveis(uuid) to authenticated, service_role;

-- ═══ guardas de destino ═══
do $g$
declare r record;
begin
  for r in select * from (values
    ('oc_vincular_lancamento', '9ce51f1f0a2691ed8fd045b9870e9ab5'),
    ('oc_sincronizar_liquidacao_de_financeiro', '8175fee15468199c39dbad03feba271a'),
    ('_oc_vinculo_mapa', '4d830519d72a7a48915f5ca6b9def910'),
    ('fn_lista_v2_totais', 'e5746a9fbfc8f0b8367e1605ce06bd42')) v(fn, h)
  loop
    if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = r.fn and md5(prosrc) = r.h) then
      raise exception 'OC-VENDA-ENTREGAS-01b: % com destino inesperado', r.fn;
    end if;
  end loop;
  if (select array_to_string(proacl, ',') from pg_proc where proname = 'fn_lista_v2_totais')
     <> 'postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'OC-VENDA-ENTREGAS-01b: ACL de fn_lista_v2_totais mudou';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.vw_financeiro_lancamentos_v2_doc'::regclass
                   and 'security_invoker=true' = any (reloptions)) then
    raise exception 'OC-VENDA-ENTREGAS-01b: a view da lista perdeu security_invoker';
  end if;
  if has_function_privilege('authenticated', 'public._oc_vincular_recebimento(uuid, integer, uuid, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.oc_sincronizar_entregas(uuid, integer, boolean)', 'execute') then
    raise exception 'OC-VENDA-ENTREGAS-01b: ACL das funcoes novas aberta';
  end if;
end $g$;
