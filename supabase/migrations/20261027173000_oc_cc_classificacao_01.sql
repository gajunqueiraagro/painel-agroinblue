-- 20261027173000_oc_cc_classificacao_01.sql
-- OC-CC-CLASSIFICACAO-01 — O RECEBIMENTO E O PAGAMENTO DA OC CONTA CORRENTE FICAM NO SUBCENTRO DA OPERACAO, FORA DO DRE PELA PARTE
-- (decisoes do Gabriel sobre a FASE 0, 29/09/2026; ADR-2026-21, adendo). Estrutura so' — o dado dos 7 e' a migration seguinte.
--
-- PRINCIPIO (Gabriel): a OC e' UMA venda/compra. No Financeiro, todo recebimento ou pagamento dela (adiantamento ou nao) fica no
-- subcentro da operacao (venda/compra de gado) e referenciado a OC; o detalhe por lote, entrega e diferenca fica na OC. Ate' aqui
-- o recebimento ia para 3015 "Adiantamento de Clientes" (e o pagamento para 5005), e filtrar o Financeiro por "Venda de Desmama
-- Machos" escondia o dinheiro das OCs.
--
-- (1) UMA REGRA SO', NUM LUGAR SO': `materializar_dre_lcdpr_from_plano` (o gatilho que ja' grava `compoe_dre`) passa a por
--     `compoe_dre = false` em todo lancamento com parte VIVA de OC `conta_corrente` que seja recebimento/pagamento (componente
--     'recebimento', fora de explicacao e entrega) ou devolucao (componente 'devolucao_comprador', explicacao — decisao 4: "pela
--     mesma regra"). A regra vence o valor enviado. Sem a parte, volta a regra normal (matriz -> plano).
--     `_oc_cc_fora_do_dre(lancamento)` e' o predicado; `trg_oc_parte_recalcula_dre` em `zoo_operacao_partes` (insert e mudanca de
--     `cancelada`, `financeiro_lancamento_id`, `componente` ou `origem`) toca o lancamento com `app.oc_recalcular_dre = on`, e o
--     gatilho do lancamento recalcula como numa reclassificacao. So' toca parte de recebimento ou devolucao: medido, 7 partes
--     no proto, as 7 da conta corrente, nenhuma com override manual de `compoe_dre`.
-- (2) OS QUATRO LEITORES DO DRE QUE LIAM PELA CONTA passam a respeitar `l.compoe_dre`: `fn_dre_pecuaria` (as 5 leituras do
--     financeiro — 4 do periodo e a de existencia da fazenda; a 6a ocorrencia do predicado e' de `lancamentos`, fica),
--     `fn_dre_pecuaria_lancamentos`, `fn_dre_lavoura` e `fn_dre_agricola_por_safra`. NENHUM NUMERO MUDA HOJE: medido, 49.343 de
--     49.343 lancamentos vivos com `bloco_dre` ja' tem `compoe_dre = true`.
-- (3) O VINCULAR NAO TROCA MAIS A CONTA: `_oc_vincular_recebimento` so' cria a parte (o gatilho tira do DRE) e solta o elo antigo
--     com o rebanho; `oc_vincular_lancamento` perde o ramo "Adiantamento de Clientes so se vincula..." (morto sem as linhas do
--     mapa); `_oc_vinculo_mapa` perde as linhas 3015 e 5005.
-- (4) PROGRAMADO E DEVOLUCAO NA CONTA DA OPERACAO: `_oc_cc_conta_principal(operacao)` = a conta da categoria do lote de MAIOR
--     VALOR (decisao 2; editavel depois). `oc_programar_recebimento` nasce nela, com a descricao "Venda NNN cab · Pagamento X de
--     Y" (compra: "Compra ..."); X = a posicao entre os recebimentos/pagamentos vivos da OC contando este, Y = o total nesse
--     momento. `oc_explicar_saldo`: a devolucao vai para essa conta, no sentido CONTRARIO ao do dinheiro da operacao (venda: saida;
--     compra: entrada) — fora do DRE pela parte.
-- (5) CONTA BANCARIA PELA DIRECAO (decisao 5): entrada le' `conta_destino_id`, saida `conta_bancaria_id` — o que o gatilho
--     `fn_normalizar_conta_por_direcao` ja' grava. Leem: `oc_conta_corrente` (o "sem conta" do extrato e o status conciliado) e
--     `oc_recebimentos_vinculaveis`; as conferencias de invariancia de `_oc_vincular_recebimento` e `_oc_cancelar_conta_corrente`
--     passam a comparar as duas colunas. `oc_sincronizar_entregas`, `oc_explicar_saldo` e `oc_programar_recebimento` so'
--     ESCREVEM a coluna e a normalizacao ja' a poe no lugar; `oc_criar_do_legado_sugestoes` e `_oc_legado_motivo_recebimento`
--     NAO leem conta bancaria (correcao da FASE 0).
-- (6) CANCELAR (decisao 3): a acao 'fica_em_adiantamento_manual' virou 'fica_manual' (nao ha' mais adiantamento); o recebimento
--     vinculado so' perde a parte e volta a compor o DRE pelo gatilho.
-- (7) PLANO: a 3016 SAI (zero lancamentos, zero referencias). 3015, 5005 e 5006 ficam ate' os 7 voltarem (migration seguinte).
--     `_oc_cc_conta_dinheiro` sai (sem chamador depois dos patches).
-- PATCHES GUARDADOS POR md5 (origem -> destino):
--   materializar_dre_lcdpr_from_plano 1689de61 -> 85a3e101   fn_dre_pecuaria            41f7f098 -> 6ec910d8
--   fn_dre_pecuaria_lancamentos       aa6d090f -> 1bf56818   fn_dre_lavoura             eece80eb -> c177e6eb
--   fn_dre_agricola_por_safra         604e6948 -> 02f7c4c4   _oc_vincular_recebimento   bd6ae293 -> bddec0fd
--   oc_vincular_lancamento            773e6379 -> 970a219a   _oc_vinculo_mapa           fd9e1305 -> 928535c7 (o md5 de ANTES do 01b)
--   oc_programar_recebimento          84ba61e6 -> b7ed17a5   oc_explicar_saldo          baae7c24 -> bd440c85
--   oc_conta_corrente                 6828bbf9 -> 19993440   oc_recebimentos_vinculaveis d12a6c0f -> 69cddd2c
--   _oc_cancelar_conta_corrente       330f7e27 -> a15e583a

-- ── 0. pecas novas ──
create or replace function public._oc_cc_fora_do_dre(p_lancamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  -- OC-CC-CLASSIFICACAO-01: o recebimento/pagamento e a devolucao da OC conta corrente ficam no subcentro da operacao e FORA do
  -- DRE — a receita/custo ja' entrou pela entrega. O unico lugar desta regra; quem a aplica e' materializar_dre_lcdpr_from_plano.
  select exists (
    select 1 from public.zoo_operacao_partes pt
    join public.zoo_operacoes_comerciais o on o.id = pt.operacao_id
    where pt.financeiro_lancamento_id = p_lancamento_id and pt.cancelada = false and o.modelo_financeiro = 'conta_corrente'
      and ((pt.componente = 'recebimento' and pt.origem not in ('explicacao', 'entrega'))
        or (pt.componente = 'devolucao_comprador' and pt.origem = 'explicacao')))
$fn$;
revoke all on function public._oc_cc_fora_do_dre(uuid) from public, anon;
grant execute on function public._oc_cc_fora_do_dre(uuid) to authenticated, service_role;

create or replace function public._oc_cc_conta_principal(p_operacao_id uuid)
returns text
language sql
stable
set search_path = public
as $fn$
  -- a conta da OC para o dinheiro sem lote (programado, devolucao): a da categoria do lote de MAIOR valor (decisao 2)
  select public._oc_cc_conta_entrega(o.tipo_operacao, lo.categoria_negociada)
    from public.zoo_operacoes_comerciais o
    join public.zoo_operacao_lotes lo on lo.operacao_id = o.id
   where o.id = p_operacao_id
   order by (public._oc_valor_do_lote(lo.id)->>'total')::numeric desc nulls last, lo.ordem
   limit 1
$fn$;
revoke all on function public._oc_cc_conta_principal(uuid) from public, anon;
grant execute on function public._oc_cc_conta_principal(uuid) to authenticated, service_role;

create or replace function public._oc_trg_parte_recalcula_dre()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid;
begin
  -- so' parte de recebimento/pagamento ou devolucao muda a regra; o resto nao toca o lancamento
  if not (coalesce(new.componente, '') in ('recebimento', 'devolucao_comprador')
          or (tg_op = 'UPDATE' and coalesce(old.componente, '') in ('recebimento', 'devolucao_comprador'))) then
    return new;
  end if;
  for v_id in select distinct x from unnest(array[new.financeiro_lancamento_id,
                case when tg_op = 'UPDATE' then old.financeiro_lancamento_id end]) x where x is not null loop
    perform set_config('app.oc_recalcular_dre', 'on', true);
    update public.financeiro_lancamentos_v2 set compoe_dre = compoe_dre where id = v_id;
    perform set_config('app.oc_recalcular_dre', 'off', true);
  end loop;
  return new;
end
$fn$;
revoke all on function public._oc_trg_parte_recalcula_dre() from public, anon, authenticated;

drop trigger if exists trg_oc_parte_recalcula_dre on public.zoo_operacao_partes;
create trigger trg_oc_parte_recalcula_dre
  after insert or update of cancelada, financeiro_lancamento_id, componente, origem on public.zoo_operacao_partes
  for each row execute function public._oc_trg_parte_recalcula_dre();

-- o aplicador dos patches: origem por md5, cada ancora com a contagem esperada, destino por md5. Some com a transacao.
create function pg_temp.oc_cc_patch(p_nome text, p_de text, p_para text, p_trincas text[])
returns void
language plpgsql
as $p$
declare v_def text; v_i int; v_n int; v_a text; v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = p_nome and md5(p.prosrc) = p_de;
  if v_def is null then raise exception 'OC-CC-CLASSIFICACAO-01: % fora da origem esperada (%)', p_nome, p_de; end if;
  for v_i in 1 .. array_length(p_trincas, 1) by 3 loop
    v_a := p_trincas[v_i];
    v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
    if v_n <> p_trincas[v_i + 2]::int then
      raise exception 'OC-CC-CLASSIFICACAO-01: %, ancora % casa % vez(es), esperado %', p_nome, (v_i + 2) / 3, v_n, p_trincas[v_i + 2];
    end if;
    v_def := replace(v_def, v_a, p_trincas[v_i + 1]);
  end loop;
  execute v_def;
  select md5(p.prosrc) into v_novo from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_nome;
  if v_novo is distinct from p_para then
    raise exception 'OC-CC-CLASSIFICACAO-01: % com destino inesperado (%)', p_nome, v_novo; end if;
end $p$;

-- ── 1. a regra no gatilho que ja' grava compoe_dre ──
select pg_temp.oc_cc_patch('materializar_dre_lcdpr_from_plano', '1689de616ccfa05a14f1a3b063026ea0', '85a3e1018bec04eba09f8efce18e11a1', array[
  $a$        OR NEW.tipo_operacao  IS DISTINCT FROM OLD.tipo_operacao
      );$a$,
  $b$        OR NEW.tipo_operacao  IS DISTINCT FROM OLD.tipo_operacao
        -- OC-CC-CLASSIFICACAO-01: a parte da OC nasceu ou morreu — recalcula como numa reclassificacao
        OR coalesce(current_setting('app.oc_recalcular_dre', true), 'off') = 'on'
      );$b$, '1',
  $a$  -- ══════════════════ gera_lcdpr (PRESERVADO — só INSERT; não alterar) ══════════════════$a$,
  $b$  -- OC-CC-CLASSIFICACAO-01: recebimento/pagamento e devolucao da OC conta corrente ficam no subcentro da operacao e FORA do
  -- DRE (a receita/custo entrou pela entrega). Vence qualquer valor enviado; sem a parte viva, vale o que esta' acima.
  IF TG_OP = 'UPDATE' AND public._oc_cc_fora_do_dre(NEW.id) THEN
    NEW.compoe_dre := false;
  END IF;

  -- ══════════════════ gera_lcdpr (PRESERVADO — só INSERT; não alterar) ══════════════════$b$, '1'
]);

-- ── 2. os quatro leitores do DRE respeitam a bandeira do lancamento ──
select pg_temp.oc_cc_patch('fn_dre_pecuaria', '41f7f0986a647099ee3bd8dd6b08b74c', '6ec910d872a62b767fc66b9929e0bc82', array[
  $a$where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario$a$,
  $b$where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.compoe_dre and l.cenario=p_cenario$b$, '4',
  $a$where l.fazenda_id=f.id and coalesce(l.cancelado,false)=false$a$,
  $b$where l.fazenda_id=f.id and coalesce(l.cancelado,false)=false and l.compoe_dre$b$, '1'
]);
select pg_temp.oc_cc_patch('fn_dre_pecuaria_lancamentos', 'aa6d090fe8fe09835bdc25fc8dea3553', '1bf56818d90eadc3b2e797234572be31', array[
  $a$where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario$a$,
  $b$where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.compoe_dre and l.cenario=p_cenario$b$, '1'
]);
select pg_temp.oc_cc_patch('fn_dre_lavoura', 'eece80eb967a179a41752401d5ab7ced', 'c177e6ebb3daeea7fb74bf8597aabbe0', array[
  $a$AND coalesce(l.cancelado,false) = false and l.cenario='realizado'$a$,
  $b$AND coalesce(l.cancelado,false) = false and l.compoe_dre and l.cenario='realizado'$b$, '1'
]);
select pg_temp.oc_cc_patch('fn_dre_agricola_por_safra', '604e6948f84ba9f7cd5638fea1621a56', '02f7c4c41bbc9081b42be9de520694ca', array[
  $a$and coalesce(l.cancelado,false)=false and l.cenario='realizado'$a$,
  $b$and coalesce(l.cancelado,false)=false and l.compoe_dre and l.cenario='realizado'$b$, '1'
]);

-- ── 3. o vincular nao troca mais a conta ──
select pg_temp.oc_cc_patch('_oc_vincular_recebimento', 'bd6ae29397c5201e898152b83ab48f56', 'bddec0fd4a19949513d4060621cdcfd6', array[
  $a$  SELECT * INTO v_pc FROM public.financeiro_plano_contas
   WHERE cliente_id IS NULL AND subcentro = public._oc_cc_conta_dinheiro(v_op.tipo_operacao) AND tipo_operacao = public._oc_cc_direcao(v_op.tipo_operacao) AND ativo;
  IF v_pc.id IS NULL THEN RAISE EXCEPTION 'Conta % ausente do plano', public._oc_cc_conta_dinheiro(v_op.tipo_operacao) USING ERRCODE = 'P0001'; END IF;$a$,
  $b$  -- OC-CC-CLASSIFICACAO-01: a conta do plano e' a do proprio lancamento (o subcentro da venda/compra)
  SELECT * INTO v_pc FROM public.financeiro_plano_contas WHERE id = v_l.plano_conta_id;$b$, '1',
  $a$  -- a conta vira adiantamento; a COMPETENCIA fica (recebimento e' caixa, o mes dele e' o do dinheiro)
  IF v_l.plano_conta_id IS DISTINCT FROM v_pc.id OR v_l.movimentacao_rebanho_id IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos_v2
       SET plano_conta_id = v_pc.id, movimentacao_rebanho_id = NULL, updated_at = now(), updated_by = v_actor
     WHERE id = v_l.id;
  END IF;$a$,
  $b$  -- OC-CC-CLASSIFICACAO-01: a conta FICA (subcentro da operacao) e a competencia tambem; o DRE sai pela parte (gatilho).
  -- So' o elo antigo com o rebanho se solta.
  IF v_l.movimentacao_rebanho_id IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos_v2
       SET movimentacao_rebanho_id = NULL, updated_at = now(), updated_by = v_actor
     WHERE id = v_l.id;
  END IF;$b$, '1',
  $a$     OR v_l_depois.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id THEN
    RAISE EXCEPTION 'Vincular recebimento so troca a conta do plano; valor, datas ou conta bancaria mudariam' USING ERRCODE = 'P0001'; END IF;$a$,
  $b$     OR v_l_depois.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id
     OR v_l_depois.conta_destino_id IS DISTINCT FROM v_l.conta_destino_id
     OR v_l_depois.plano_conta_id IS DISTINCT FROM v_l.plano_conta_id THEN
    RAISE EXCEPTION 'Vincular recebimento nao muda o lancamento; valor, datas, conta do plano ou conta bancaria mudariam' USING ERRCODE = 'P0001'; END IF;$b$, '1'
]);
select pg_temp.oc_cc_patch('oc_vincular_lancamento', '773e6379f8414d5762a6ed86f0736846', '970a219af3bfdbded1c9063e4e1da7c6', array[
  $a$  -- OC-VENDA-ENTREGAS-01b (ADR-2026-21): no modelo CONTA CORRENTE a entrada de uma venda e' RECEBIMENTO — caixa, fora
  -- do DRE, sem compromisso. A receita ja entrou pela ENTREGA. No modelo titulo, adiantamento de cliente nao se vincula.$a$,
  $b$  -- OC-VENDA-ENTREGAS-01b (ADR-2026-21): no modelo CONTA CORRENTE a entrada de uma venda e' RECEBIMENTO — caixa, sem
  -- compromisso. A receita ja entrou pela ENTREGA. OC-CC-CLASSIFICACAO-01: ele fica no subcentro da venda e sai do DRE pela parte.$b$, '1',
  $a$  ELSIF 'recebimento' = ANY (v_regra.componentes) THEN
    RAISE EXCEPTION 'Adiantamento de Clientes so se vincula a uma operacao no modelo conta corrente' USING ERRCODE = 'P0001';
  END IF;$a$,
  $b$  END IF;$b$, '1'
]);
select pg_temp.oc_cc_patch('_oc_vinculo_mapa', 'fd9e1305efe5c36983e0add791d5d2b9', '928535c7e5f786282fed637187dd0b23', array[
  $a$      ('Adiantamento de Clientes',                     ARRAY['venda'],                  'principal',       ARRAY['recebimento'],                                            '1-Entradas'),
      ('Adiantamento a Fornecedores',                  ARRAY['compra'],                 'principal',       ARRAY['recebimento'],                                            '2-Saídas'),
$a$,
  $b$$b$, '1'
]);

-- ── 4. programado e devolucao na conta da operacao ──
select pg_temp.oc_cc_patch('oc_programar_recebimento', '84ba61e69680ffb68dd622669a4e354a', 'b7ed17a56a9a80aab2af029f2602bcac', array[
  $a$  -- o fluxo que existe, sem lote: compromisso em Adiantamento de Clientes -> programacao de 1 parcela -> titulo programado$a$,
  $b$  -- o fluxo que existe, sem lote: compromisso na conta da OC (OC-CC-CLASSIFICACAO-01: a categoria do lote de maior valor)
  -- -> programacao de 1 parcela -> titulo programado, fora do DRE pela parte$b$, '1',
  $a$'subcentro', public._oc_cc_conta_dinheiro(v_op.tipo_operacao),
             'descricao', CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Pagamento programado' ELSE 'Recebimento programado' END));$a$,
  $b$'subcentro', public._oc_cc_conta_principal(p_operacao_id),
             'descricao', format('%s %s cab · Pagamento %s de %s', public._oc_cc_verbo(v_op.tipo_operacao),
               lpad(coalesce((SELECT sum(lo.qtd_negociada) FROM public.zoo_operacao_lotes lo WHERE lo.operacao_id = p_operacao_id), 0)::text, 3, '0'),
               (SELECT count(*) + 1 FROM public.zoo_operacao_partes pt WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false
                   AND pt.componente = 'recebimento' AND pt.origem NOT IN ('explicacao', 'entrega')),
               (SELECT count(*) + 1 FROM public.zoo_operacao_partes pt WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false
                   AND pt.componente = 'recebimento' AND pt.origem NOT IN ('explicacao', 'entrega')))));$b$, '1'
]);
select pg_temp.oc_cc_patch('oc_explicar_saldo', 'baae7c2454e9126d630f4c8d6ec76959', 'bd440c859c3220f4db27bc18cb2507e2', array[
  $a$pc.subcentro = CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Devolução de Adiantamento a Fornecedores' ELSE 'Devolução de Adiantamento de Clientes' END;$a$,
  $b$pc.subcentro = public._oc_cc_conta_principal(p_operacao_id)
         AND pc.tipo_operacao = public._oc_cc_direcao(v_op.tipo_operacao);$b$, '1',
  $a$    v_tipo_op := v_pc.tipo_operacao;$a$,
  $b$    -- OC-CC-CLASSIFICACAO-01: a devolucao e' o dinheiro no sentido CONTRARIO ao da operacao, na conta dela (fora do DRE pela parte)
    v_tipo_op := CASE WHEN p_tipo = 'devolucao_comprador'
                      THEN CASE WHEN v_pc.tipo_operacao = '1-Entradas' THEN '2-Saídas' ELSE '1-Entradas' END
                      ELSE v_pc.tipo_operacao END;$b$, '1'
]);

-- ── 5. conta bancaria pela direcao ──
select pg_temp.oc_cc_patch('oc_conta_corrente', '6828bbf97c35010abef39b7978dfdaa2', '1999344073daac7f57f0a3c99e24c7ea', array[
  $a$f.conta_bancaria_id AS f_conta,$a$,
  $b$CASE WHEN f.tipo_operacao LIKE '1-%' THEN f.conta_destino_id ELSE f.conta_bancaria_id END AS f_conta,$b$, '1'
]);
select pg_temp.oc_cc_patch('oc_recebimentos_vinculaveis', 'd12a6c0fc99cbe057e6920e85a0a4513', '69cddd2cffbefc2f6819f2188f175c9c', array[
  $a$f.favorecido_id IS NOT DISTINCT FROM o.contraparte_id, f.conta_bancaria_id, f.status_transacao,$a$,
  $b$f.favorecido_id IS NOT DISTINCT FROM o.contraparte_id,
         CASE WHEN f.tipo_operacao LIKE '1-%' THEN f.conta_destino_id ELSE f.conta_bancaria_id END, f.status_transacao,$b$, '1'
]);

-- ── 6. cancelar: nao ha' mais adiantamento; invariancia nas duas colunas da conta ──
select pg_temp.oc_cc_patch('_oc_cancelar_conta_corrente', '330f7e279552a6aef00fcbbf78cc794d', 'a15e583a93087e07f8014412fc85c234', array[
  $a$  -- recebimentos: o vinculado volta a' conta registrada no `vincular_recebimento`; o nascido na OC (programado pelo
  -- "Programar recebimento futuro") some se ainda programado, e fica em Adiantamento de Clientes, manual, se ja' pago.$a$,
  $b$  -- recebimentos: o vinculado perde a parte e volta a compor o DRE (OC-CC-CLASSIFICACAO-01: a conta ja' e' a da venda/compra;
  -- a do `vincular_recebimento` so' e' reposta se diferente); o nascido na OC some se ainda programado e fica manual se ja' pago.$b$, '1',
  $a$WHEN x.realizado THEN 'fica_em_adiantamento_manual'$a$,
  $b$WHEN x.realizado THEN 'fica_manual'$b$, '1',
  $a$ELSIF r.acao = 'fica_em_adiantamento_manual' THEN$a$,
  $b$ELSIF r.acao = 'fica_manual' THEN$b$, '1',
  $a$OR v_l2.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id THEN$a$,
  $b$OR v_l2.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id
         OR v_l2.conta_destino_id IS DISTINCT FROM v_l.conta_destino_id THEN$b$, '1'
]);

-- ── 7. sem chamador; 3016 sai ──
drop function public._oc_cc_conta_dinheiro(text);

do $pl$
declare v_id uuid; v_ref int;
begin
  select id into v_id from public.financeiro_plano_contas where cliente_id is null and ordem_exibicao = 3016
     and subcentro = 'Devolução de Adiantamento a Fornecedores';
  if v_id is null then raise exception 'OC-CC-CLASSIFICACAO-01: 3016 nao encontrada'; end if;
  select (select count(*) from public.financeiro_lancamentos_v2 where plano_conta_id = v_id)
       + (select count(*) from public.zoo_operacao_partes where plano_conta_id = v_id)
       + (select count(*) from public.zoo_operacao_compromissos where plano_conta_id = v_id)
       + (select count(*) from public.financiamentos where plano_conta_parcela_id = v_id or plano_conta_captacao_id = v_id)
       + (select count(*) from public.financeiro_subcentro_aliases where plano_conta_id = v_id)
       + (select count(*) from public.financeiro_classificacao_regras where plano_conta_id = v_id)
    into v_ref;
  if v_ref <> 0 then raise exception 'OC-CC-CLASSIFICACAO-01: a 3016 tem % referencia(s); nao remove', v_ref; end if;
  delete from public.financeiro_plano_contas where id = v_id;
end $pl$;

-- ── ACL: patcheadas mantem a ACL (CREATE OR REPLACE a preserva); novas conferidas ──
do $acl$
begin
  if has_function_privilege('anon', 'public._oc_cc_fora_do_dre(uuid)', 'execute')
     or has_function_privilege('anon', 'public._oc_cc_conta_principal(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._oc_trg_parte_recalcula_dre()', 'execute')
     or has_function_privilege('authenticated', 'public._oc_cancelar_conta_corrente(uuid, text, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._oc_vincular_recebimento(uuid, integer, uuid, text, boolean)', 'execute') then
    raise exception 'OC-CC-CLASSIFICACAO-01: ACL fora do esperado'; end if;
end $acl$;
