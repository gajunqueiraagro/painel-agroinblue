-- PARC-CADEIA-01 (passo 5) — CONTRATOS DE PARCELAMENTO QUE JA' QUEBRARAM: PROPOSTA DE CONSERTO.
--
-- ⚠ NAO EXECUTADO. Este arquivo e' PROPOSTA: o Gabriel aprova CASO A CASO, e cada caso roda sozinho (um bloco DO por caso).
-- ⚠ SEM DADO DE CLIENTE: so' ids e contagens de parcelas. Nomes, credores e valores NAO estao aqui — cada bloco LE^ o estado do
--   banco na hora, mostra o antes x depois por NOTICE (a simulacao da propria funcao) e so' entao grava.
-- ⚠ FORA DESTE SCRIPT, por decisao do Gabriel: o contrato 580db8cd-8f53-4011-a0d1-4cb519232a82 (NJ, 4 parcelas, todas com o
--   lancamento cancelado em 07/10/2026) — ele vai refaze^-lo pela tela.
--
-- A QUEBRA (medida no passo 0, 07/10/2026): parcela VIVA de contrato de parcelamento cujo lancamento foi CANCELADO pelo
-- Financeiro, por fora do contrato. O contrato segue contando a parcela e o valor dela.
-- A PROPOSTA, por caso:
--   · ha' outras parcelas vivas com lancamento  -> RETIRAR a parcela (`fn_parcelamento_cancelar_parcela`, 'so_esta', pelo id da
--     parcela): parcela 'cancelado', contrato com parcelas e total recalculados, i/N das demais renumerado. O lancamento ja'
--     esta' cancelado e NAO e' tocado (o motivo e a data do cancelamento original ficam).
--   · TODAS as parcelas do contrato estao sem lancamento (so' restos de ensaio no cliente Teste) -> CANCELAR A COMPRA
--     (`fn_parcelamento_excluir`): parcelas e contrato 'cancelado'; nada e' apagado.
-- GUARDA de cada bloco: o estado tem de ser o medido (contagem de parcelas vivas; a parcela viva; o lancamento dela cancelado);
-- se alguem ja' mexeu, o bloco ABORTA sem gravar.
-- GESTO CONTRARIO, por caso, escrito ao lado. Rodar como o admin (a funcao confere o cliente por `tenant_ok`).

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', false);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- CASO 1 — NJ · contrato 57a954ed-da3c-41ed-90d3-4041562454b1 · parcela 1 de 3 (id 88a679f5-8816-4a3d-af53-a7d53dd0677f)
--   lancamento 58bfafe9-d8cc-4a1e-a461-0e2ffadb6c8f cancelado em 07/10/2026 (02:37 UTC), motivo registrado: "erro".
--   ANTES: 3 parcelas vivas (a 1ª sem lancamento vivo).   DEPOIS: 2 parcelas vivas, renumeradas 1/2 e 2/2; total = a soma das duas.
--   GESTO CONTRARIO: pela tela do contrato, Editar parcelas › "+ Parcela" com o vencimento e o valor da retirada (nasce uma
--     parcela NOVA com lancamento novo; a retirada fica 'cancelado' como trilha) — ou, em SQL, `fn_parcelamento_editar_parcelas`
--     com a lista das duas vivas + {data_vencimento, valor} da retirada e `p_valor_total` = a soma das tres.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $caso1$
DECLARE
  c_fin  constant uuid := '57a954ed-da3c-41ed-90d3-4041562454b1';
  c_par  constant uuid := '88a679f5-8816-4a3d-af53-a7d53dd0677f';
  c_lan  constant uuid := '58bfafe9-d8cc-4a1e-a461-0e2ffadb6c8f';
  s jsonb; j jsonb;
BEGIN
  IF (select count(*) from financiamento_parcelas where financiamento_id = c_fin and coalesce(status, '') <> 'cancelado') <> 3
     OR NOT exists (select 1 from financiamento_parcelas where id = c_par and financiamento_id = c_fin and numero_parcela = 1
                      and coalesce(status, '') <> 'cancelado' and lancamento_id = c_lan)
     OR NOT exists (select 1 from financeiro_lancamentos_v2 where id = c_lan and cancelado) THEN
    RAISE EXCEPTION 'CASO 1: o estado nao e'' o medido em 07/10/2026 (alguem ja'' mexeu). Nada foi gravado.';
  END IF;
  s := fn_parcelamento_cancelar_parcela(null, 'so_esta', '', true, c_par);
  RAISE NOTICE 'CASO 1 antes: %  |  depois: %  |  recusa: %', s->'antes', s->'depois', s->'recusa';
  IF jsonb_typeof(s->'recusa') <> 'null' OR (s->'depois'->>'parcelas')::int <> 2 THEN
    RAISE EXCEPTION 'CASO 1: a simulacao nao deu o esperado (%). Nada foi gravado.', s;
  END IF;
  j := fn_parcelamento_cancelar_parcela(null, 'so_esta',
         'PARC-CADEIA-01 conserto: o lançamento desta parcela foi cancelado pelo Financeiro em 07/10/2026, por fora do contrato', false, c_par);
  IF (j->'depois') IS DISTINCT FROM (s->'depois') THEN RAISE EXCEPTION 'CASO 1: gravacao % x simulacao %', j->'depois', s->'depois'; END IF;
  RAISE NOTICE 'CASO 1 gravado: %', j->'depois';
END
$caso1$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- CASO 2 — Teste · contrato 27ec1644-be8f-42c3-a403-db619b6f6ba3 (resto de ensaio de 29/09/2026) · 2 parcelas vivas, AS DUAS
--   com o lancamento cancelado.
--   ANTES: 2 parcelas vivas, 0 lancamentos vivos.   DEPOIS: contrato e parcelas 'cancelado' (nada apagado).
--   GESTO CONTRARIO: UPDATE do contrato para o status e a observacao de antes e das 2 parcelas para 'pendente' (os lancamentos
--     ja' estavam cancelados antes e continuam): os valores de antes saem no NOTICE.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $caso2$
DECLARE
  c_fin constant uuid := '27ec1644-be8f-42c3-a403-db619b6f6ba3';
  s jsonb; j jsonb; v_status text; v_obs text;
BEGIN
  select status, observacao into v_status, v_obs from financiamentos where id = c_fin and cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a';
  IF v_status IS DISTINCT FROM 'ativo'
     OR (select count(*) from financiamento_parcelas where financiamento_id = c_fin and coalesce(status, '') <> 'cancelado') <> 2
     OR exists (select 1 from financiamento_parcelas p join financeiro_lancamentos_v2 l on l.id = p.lancamento_id
                 where p.financiamento_id = c_fin and coalesce(p.status, '') <> 'cancelado' and not l.cancelado) THEN
    RAISE EXCEPTION 'CASO 2: o estado nao e'' o medido em 07/10/2026. Nada foi gravado.';
  END IF;
  RAISE NOTICE 'CASO 2 antes: status=% observacao=% parcelas vivas=2 (todas pendentes)', v_status, coalesce(v_obs, '(nula)');
  s := fn_parcelamento_excluir(c_fin, '', true);
  IF jsonb_typeof(s->'recusa') <> 'null' OR (s->>'parcelas')::int <> 2 OR (s->>'lancamentos')::int <> 0 THEN
    RAISE EXCEPTION 'CASO 2: a simulacao nao deu o esperado (%). Nada foi gravado.', s;
  END IF;
  j := fn_parcelamento_excluir(c_fin, 'PARC-CADEIA-01 conserto: resto de ensaio de 29/09/2026, todas as parcelas sem lançamento', false);
  RAISE NOTICE 'CASO 2 gravado: parcelas=% lancamentos=%', j->'parcelas', j->'lancamentos';
END
$caso2$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- CASO 3 — Teste · contrato b0149862-82cb-4bff-8d53-2b63908572dc (resto de ensaio de 29/09/2026) · 4 parcelas vivas, AS QUATRO
--   com o lancamento cancelado.
--   ANTES: 4 parcelas vivas, 0 lancamentos vivos.   DEPOIS: contrato e parcelas 'cancelado' (nada apagado).
--   GESTO CONTRARIO: o do caso 2 (contrato ao status e a' observacao de antes; as 4 parcelas a 'pendente').
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $caso3$
DECLARE
  c_fin constant uuid := 'b0149862-82cb-4bff-8d53-2b63908572dc';
  s jsonb; j jsonb; v_status text; v_obs text;
BEGIN
  select status, observacao into v_status, v_obs from financiamentos where id = c_fin and cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a';
  IF v_status IS DISTINCT FROM 'ativo'
     OR (select count(*) from financiamento_parcelas where financiamento_id = c_fin and coalesce(status, '') <> 'cancelado') <> 4
     OR exists (select 1 from financiamento_parcelas p join financeiro_lancamentos_v2 l on l.id = p.lancamento_id
                 where p.financiamento_id = c_fin and coalesce(p.status, '') <> 'cancelado' and not l.cancelado) THEN
    RAISE EXCEPTION 'CASO 3: o estado nao e'' o medido em 07/10/2026. Nada foi gravado.';
  END IF;
  RAISE NOTICE 'CASO 3 antes: status=% observacao=% parcelas vivas=4 (todas pendentes)', v_status, coalesce(v_obs, '(nula)');
  s := fn_parcelamento_excluir(c_fin, '', true);
  IF jsonb_typeof(s->'recusa') <> 'null' OR (s->>'parcelas')::int <> 4 OR (s->>'lancamentos')::int <> 0 THEN
    RAISE EXCEPTION 'CASO 3: a simulacao nao deu o esperado (%). Nada foi gravado.', s;
  END IF;
  j := fn_parcelamento_excluir(c_fin, 'PARC-CADEIA-01 conserto: resto de ensaio de 29/09/2026, todas as parcelas sem lançamento', false);
  RAISE NOTICE 'CASO 3 gravado: parcelas=% lancamentos=%', j->'parcelas', j->'lancamentos';
END
$caso3$;
