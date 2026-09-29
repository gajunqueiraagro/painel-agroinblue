-- OC-CRIAR-DO-LEGADO-01b — venda do MODAL ANTIGO ja recebida vira OC pelo "Criar OC"; a comissao presa a' saida entra
-- na OC como despesa da operacao; a OC de venda passa a mostrar as despesas (decisoes do Gabriel, 29/09/2026 12:24-12:29).
--
-- 1. `_oc_legado_motivo_recebimento` (78fb0661): o recebimento nascido do modal antigo (origem_lancamento =
--    'movimentacao_rebanho') so' e' recusado enquanto NAO realizado — "Receba primeiro: lancamento do modal antigo ainda
--    programado." Realizado entra: a cadeia ja' sabia trata-lo (as sugestoes aceitam a saida com financeiro realizado do
--    modal antigo, `oc_criar_do_legado` so' ADOTA a saida — nenhum gado criado — e `_oc_vincular_recebimento` solta o
--    `movimentacao_rebanho_id`). Medido na FASE 0: 19 recebimentos realizados liberados (Vera 5, Raul 8, Santa Rita 4, NJ 2).
-- 2. `oc_criar_do_legado` (b690dd7f):
--    a) ANTI-DOBRA: outra ENTRADA 1110-1140 viva do modal antigo presa a uma saida marcada, fora dos recebimentos
--       escolhidos, contaria a receita duas vezes (a entrega da OC + ela) — vira pendencia e nada grava. Hoje: 0 casos.
--    b) COMISSAO: a `venda:comissao` do modal antigo presa a uma saida adotada entra na OC pelo Vincular NORMAL
--       (`oc_vincular_lancamento`, componente 'comissao' -> obrigacao, origem 'programacao'; o mesmo formato das despesas
--       da compra 1337bb2d). Fica FORA do saldo (`_oc_conta_corrente_base` nao muda). Valor, conta, status e conciliacao
--       dela nao mudam; efeitos aceitos: competencia = data da OC (0 dos 4 casos muda de mes) e o aviso movimento_duplicado.
-- 3. `oc_conta_corrente` (19993440): "despesas" tambem na VENDA, com o MESMO montador da compra (saiu o
--    CASE WHEN tipo = 'venda' THEN '{}'). Venda sem despesa ganha `despesas: []` e nada mais muda.
--
-- ⚠ PATCH GUARDADO POR md5 (CLAUDE.md, "MIGRATION DE CORPO GRANDE"): le' o prosrc, aborta se a origem nao for a esperada,
--   exige cada ancora exatamente 1x, aplica e confere o md5 do resultado. Reexecutar sobre um corpo ja' corrigido FALHA na
--   guarda de origem. Os cabecalhos (assinatura, linguagem, volatilidade, SECURITY, search_path) sao os de
--   pg_get_functiondef, sem mudanca.
DO $mig$
DECLARE
  v_src text;
  v_novo text;
  v_md5 text;
  -- ── 1. _oc_legado_motivo_recebimento ──
  a1 constant text := $a$    when l.origem_lancamento = 'movimentacao_rebanho' then 'Lancamento do modal antigo (gerado pelo zootecnico)'
$a$;
  b1 constant text := $b$    -- OC-CRIAR-DO-LEGADO-01b: o modal antigo JA REALIZADO entra (a saida dele e' adotada, nunca recriada).
    when l.origem_lancamento = 'movimentacao_rebanho'
         and not (l.status_transacao in ('realizado', 'conciliado') or l.conciliado_em is not null)
      then 'Receba primeiro: lancamento do modal antigo ainda programado.'
$b$;
  -- ── 2. oc_criar_do_legado ──
  a2 constant text := $a$  -- ── valor de cada lote (1.3): centavos, resto no ultimo ──
$a$;
  b2 constant text := $b$  -- ── OC-CRIAR-DO-LEGADO-01b: ANTI-DOBRA. Outra ENTRADA de venda (1110-1140) viva do modal antigo presa a uma saida
  --    marcada, fora dos recebimentos escolhidos, contaria a receita duas vezes (a entrega da OC + ela). Nada grava. ──
  for r in select s.id saida, f.id fin, f.valor
             from jsonb_array_elements(coalesce(p_saidas, '[]'::jsonb)) x
             join public.lancamentos s on s.id = nullif(x.value->>'lancamento_id', '')::uuid
             join public.financeiro_lancamentos_v2 f on f.movimentacao_rebanho_id = s.id
             join public.financeiro_plano_contas pc on pc.id = f.plano_conta_id
            where f.origem_lancamento = 'movimentacao_rebanho' and f.cancelado is not true
              and f.tipo_operacao = '1-Entradas' and pc.ordem_exibicao between 1110 and 1140
              and not (f.id = any (coalesce(p_recebimentos, '{}')))
            order by s.id, f.id loop
    v_pend := v_pend || format('Saida %s tem outro recebimento do modal antigo fora desta OC (%s, R$ %s): some-o aos recebimentos',
                               left(r.saida::text, 8), left(r.fin::text, 8), replace(round(r.valor, 2)::text, '.', ','));
  end loop;

  -- ── valor de cada lote (1.3): centavos, resto no ultimo ──
$b$;
  a3 constant text := $a$    -- ── 7. negociacao concluida e entrega encerrada (D5) ──
$a$;
  b3 constant text := $b$    -- ── 6b. OC-CRIAR-DO-LEGADO-01b: a COMISSAO do modal antigo presa a uma saida adotada vira DESPESA DA OPERACAO pelo
    --        Vincular normal (obrigacao 'comissao', origem 'programacao'), fora do saldo. Valor, conta, status e conciliacao
    --        dela nao mudam; a competencia vai para a data da OC e o elo com o rebanho se solta (D4 do Vincular). ──
    for r in select f.id
               from jsonb_array_elements(v_lotes) l
               join public.financeiro_lancamentos_v2 f on f.movimentacao_rebanho_id = (l->>'lancamento_id')::uuid
              where f.origem_lancamento = 'movimentacao_rebanho' and f.origem_tipo = 'venda:comissao'
                and f.cancelado is not true
                and not exists (select 1 from public.zoo_operacao_partes p
                                 where p.financeiro_lancamento_id = f.id and p.cancelada = false)
              order by f.data_competencia, f.id loop
      select versao into v_ver from public.zoo_operacoes_comerciais where id = v_op;
      v_x := public.oc_vincular_lancamento(v_op, v_ver, r.id, 'comissao', v_motivo);
      if (v_x->>'ok')::boolean is not true then
        raise exception 'Comissao %: %', left(r.id::text, 8), coalesce(v_x->>'erro', v_x->>'mensagem', v_x::text) using errcode = 'P0001'; end if;
    end loop;
    -- ── 7. negociacao concluida e entrega encerrada (D5) ──
$b$;
  -- ── 3. oc_conta_corrente ──
  a4 constant text := $a$    -- DESPESAS DA OPERACAO (frete, comissao, ICMS): titulos comuns, fora do saldo. So' fora da venda: a venda nao ganha chave.
    || CASE WHEN op.tipo_operacao = 'venda' THEN '{}'::jsonb ELSE jsonb_build_object('despesas', coalesce((SELECT jsonb_agg(
$a$;
  b4 constant text := $b$    -- DESPESAS DA OPERACAO (frete, comissao, ICMS): titulos comuns, fora do saldo. Venda e compra — OC-CRIAR-DO-LEGADO-01b:
    -- a comissao do modal antigo ligada a' OC de venda criada do legado aparece aqui. Venda sem despesa: `despesas: []`.
    || jsonb_build_object('despesas', coalesce((SELECT jsonb_agg(
$b$;
  a5 constant text := $a$         AND dp.componente <> 'recebimento'), '[]'::jsonb)) END
  FROM op, tot, pend;
$a$;
  b5 constant text := $b$         AND dp.componente <> 'recebimento'), '[]'::jsonb))
  FROM op, tot, pend;
$b$;
BEGIN
  -- ═══ 1. _oc_legado_motivo_recebimento ═══
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public._oc_legado_motivo_recebimento(uuid)'::regprocedure;
  IF md5(v_src) <> '78fb06619b517c4cce395147f0266973' THEN
    RAISE EXCEPTION '01b: origem de _oc_legado_motivo_recebimento e % (esperado 78fb0661)', md5(v_src); END IF;
  IF (length(v_src) - length(replace(v_src, a1, ''))) / length(a1) <> 1 THEN RAISE EXCEPTION '01b: ancora a1 nao casa 1x'; END IF;
  v_novo := replace(v_src, a1, b1);
  v_md5 := md5(v_novo);
  IF v_md5 <> 'cdc6dbbda19061d1bd887a927c4ee171' THEN RAISE EXCEPTION '01b: destino de _oc_legado_motivo_recebimento e %', v_md5; END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public._oc_legado_motivo_recebimento(p_lancamento_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS %L$f$, v_novo);

  -- ═══ 2. oc_criar_do_legado ═══
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.oc_criar_do_legado(uuid, jsonb, text, numeric, uuid[], jsonb, boolean)'::regprocedure;
  IF md5(v_src) <> 'b690dd7f744a895e0717f4debb4a0a6e' THEN
    RAISE EXCEPTION '01b: origem de oc_criar_do_legado e % (esperado b690dd7f)', md5(v_src); END IF;
  IF (length(v_src) - length(replace(v_src, a2, ''))) / length(a2) <> 1 THEN RAISE EXCEPTION '01b: ancora a2 nao casa 1x'; END IF;
  IF (length(v_src) - length(replace(v_src, a3, ''))) / length(a3) <> 1 THEN RAISE EXCEPTION '01b: ancora a3 nao casa 1x'; END IF;
  v_novo := replace(replace(v_src, a2, b2), a3, b3);
  v_md5 := md5(v_novo);
  IF v_md5 <> '106d61a38af1aac6c4425235b7d9623e' THEN RAISE EXCEPTION '01b: destino de oc_criar_do_legado e %', v_md5; END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.oc_criar_do_legado(p_cliente_id uuid, p_dados jsonb, p_criterio_valor text, p_valor_outro numeric, p_recebimentos uuid[], p_saidas jsonb, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS %L$f$, v_novo);

  -- ═══ 3. oc_conta_corrente ═══
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.oc_conta_corrente(uuid)'::regprocedure;
  IF md5(v_src) <> '1999344073daac7f57f0a3c99e24c7ea' THEN
    RAISE EXCEPTION '01b: origem de oc_conta_corrente e % (esperado 19993440)', md5(v_src); END IF;
  IF (length(v_src) - length(replace(v_src, a4, ''))) / length(a4) <> 1 THEN RAISE EXCEPTION '01b: ancora a4 nao casa 1x'; END IF;
  IF (length(v_src) - length(replace(v_src, a5, ''))) / length(a5) <> 1 THEN RAISE EXCEPTION '01b: ancora a5 nao casa 1x'; END IF;
  v_novo := replace(replace(v_src, a4, b4), a5, b5);
  v_md5 := md5(v_novo);
  IF v_md5 <> '21e1020399f1b9308f1a770282af9703' THEN RAISE EXCEPTION '01b: destino de oc_conta_corrente e %', v_md5; END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.oc_conta_corrente(p_operacao_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS %L$f$, v_novo);
END
$mig$;

-- ACL: fechada depois de cada create (CREATE OR REPLACE preserva, mas o registro nao depende disso).
REVOKE ALL ON FUNCTION public._oc_legado_motivo_recebimento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._oc_legado_motivo_recebimento(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_criar_do_legado(uuid, jsonb, text, numeric, uuid[], jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_criar_do_legado(uuid, jsonb, text, numeric, uuid[], jsonb, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_conta_corrente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_conta_corrente(uuid) TO authenticated, service_role;
