-- CONC-DIVIDENDOS-PLANO-01 — O DIVIDENDO CADASTRADO PASSA A EXISTIR NO PLANO DE CONTAS DO CLIENTE (Gabriel, 09/10/2026).
--
-- DECISAO: o cadastro de dividendos do cliente (`financeiro_dividendos`) E' a aprovacao — o nome do cadastro vira conta do plano
-- DAQUELE cliente, com o MESMO nome ("Dividendos <nome>"). Nada e' juntado com conta global, nada e' renomeado, nenhum lancamento
-- muda de subcentro, e a descricao do lancamento nao e' lida para decidir nada.
--
-- O QUE ESTA MIGRATION FAZ, NUMA TRANSACAO:
--   (1) cria 11 contas POR CLIENTE em `financeiro_plano_contas` (5 clientes), uma para cada dividendo da lista abaixo. A lista e'
--       por ID DO CADASTRO (nenhum nome de pessoa entra no repositorio): o subcentro sai do cadastro na hora ('Dividendos ' ||
--       nome). As demais colunas sao COPIADAS DO MOLDE — a conta por cliente que ja' existia (Santa Rita, df784cef, ordem 17160):
--       2-Saidas / Dividendos / Dividendos / Dividendos / administrativo / compoe_dre false / ativo.
--       `ordem_exibicao`: a partir de 17160, passo 10, POR CLIENTE, em ordem alfabetica do subcentro (nao ha' unicidade em
--       `ordem_exibicao`; a unica unicidade da tabela e' `uq_plano_contas_global`, sobre tipo + macro + grupo + centro + subcentro
--       entre as ATIVAS, SEM o cliente — os 11 nomes nao colidem entre si nem com conta existente, e a guarda confere).
--   (2) backfill: os lancamentos NAO cancelados com aquele subcentro, daquele cliente, com `plano_conta_id` NULO recebem a chave
--       da conta nova. A contagem de cada nome e' comparada com a lista (567 no total) e a migration ABORTA se divergir.
--   (3) guarda o estado anterior em `conc_dividendos_plano_01_backfill` (uma linha por lancamento), para o gesto contrario.
--
-- GATILHOS QUE O UPDATE DISPARA (medidos em 09/10, corpo lido):
--   resolve_classificacao_from_plano  — a chave mudou: reescreve subcentro/macro/grupo/centro/escopo PELA LINHA DO PLANO. Sao os
--       mesmos textos, EXCETO `grupo_custo`, nulo em 6 lancamentos (Vera 3, Raul 2, Teste 1), que passa a 'Dividendos'. O escopo
--       ja' e' administrativo nos 567: safra ja' nula e fazenda ja' a "Administrativo" do cliente em todos (0 mudam).
--   materializar_dre_lcdpr_from_plano — reclassificacao: recalcula `compoe_dre` = false (o plano diz false). Ja' e' false nos 567.
--   update_updated_at_column          — CARIMBA `updated_at = now()` NOS 567.
--   audit_trigger_financeiro_v2       — UMA linha 'editou' em `audit_log` POR LANCAMENTO (567), com `usuario_id` = o `updated_by`
--       gravado no lancamento (o ultimo humano que o editou) — a mesma pratica dos backfills anteriores (fin_safra_modal_01).
--   mark_..._editado_manual           — marcaria `editado_manual` em 1 lancamento importado (Raul). NAO E' EDICAO HUMANA: o UPDATE
--       roda sob `app.propagando_plano = 'on'`, a marca que a casa ja' usa para "a copia que acompanha o plano" (DRE-CLASSIF-
--       COPIA-01). Nenhum gatilho e' desligado.
--   NAO disparam (sao `UPDATE OF` de outras colunas): hash, unique_hash, sync da OC, cancelamento. Nao ha' guarda de mes fechado
--   nem de conciliado em `financeiro_lancamentos_v2` (125 dos 567 sao conciliados; 0 em mes fechado — nao ha' mes fechado).
--   Valor, datas, status, conta bancaria e vinculos de extrato NAO mudam (a prova compara o md5 dessas colunas antes x depois).
--
-- GESTO CONTRARIO — ensaiado em transacao revertida (devolve os 567 a nulo, o `grupo_custo` anterior, e remove as 11 contas):
--   A ORDEM IMPORTA: com a conta ATIVA, por o lancamento a nulo faz o gatilho resolver o texto de volta para a mesma conta.
--
--   BEGIN;
--   SELECT set_config('app.propagando_plano', 'on', true);
--   UPDATE public.financeiro_plano_contas p SET ativo = false
--    WHERE p.id IN (SELECT DISTINCT plano_conta_id FROM public.conc_dividendos_plano_01_backfill);
--   UPDATE public.financeiro_lancamentos_v2 l
--      SET plano_conta_id = NULL, grupo_custo = b.grupo_custo_antes, editado_manual = b.editado_manual_antes
--     FROM public.conc_dividendos_plano_01_backfill b
--    WHERE l.id = b.lancamento_id AND l.plano_conta_id = b.plano_conta_id;
--   SELECT set_config('app.propagando_plano', 'off', true);
--   -- so' apaga a conta que ficou sem lancamento nenhum (quem a recebeu DEPOIS do backfill continua nela, e a conta fica inativa)
--   DELETE FROM public.financeiro_plano_contas p
--    WHERE p.id IN (SELECT DISTINCT plano_conta_id FROM public.conc_dividendos_plano_01_backfill)
--      AND NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l WHERE l.plano_conta_id = p.id);
--   DROP TABLE public.conc_dividendos_plano_01_backfill;
--   COMMIT;
--   (o gesto contrario carimba `updated_at` e grava outra linha de auditoria por lancamento; `updated_at_antes` fica na tabela so'
--    como registro — o gatilho de `updated_at` nao deixa devolve'-lo.)

CREATE TABLE public.conc_dividendos_plano_01_backfill (
  lancamento_id        uuid PRIMARY KEY,
  cliente_id           uuid NOT NULL,
  plano_conta_id       uuid NOT NULL,
  grupo_custo_antes    text,
  editado_manual_antes boolean,
  updated_at_antes     timestamptz,
  aplicado_em          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conc_dividendos_plano_01_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conc_dividendos_plano_01_backfill FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE
  c_molde CONSTANT uuid := 'df784cef-da03-43c6-8e6b-bac7dc933dc7';
  c_total CONSTANT integer := 567;
  r record; v_n integer; v_contas integer; v_antes integer; v_depois integer; v_grupo integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- a lista: (id do cadastro de dividendo, lancamentos esperados)
  CREATE TEMP TABLE _alvo (dividendo_id uuid PRIMARY KEY, esperado integer NOT NULL) ON COMMIT DROP;
  INSERT INTO _alvo VALUES
    ('028d7b88-7e9f-4968-8943-ba2cd3325163',  17),
    ('f80ab863-d0bb-4b9b-858b-b17802aa9caf', 190),
    ('6c25eae2-0744-4239-b000-80631fab5066',  23),
    ('bead5b7a-f1fd-4846-8876-d9c1188b4bbe',   1),
    ('2536c4ad-cc04-4cad-a53e-9e43bed37580',   5),
    ('996b2a70-8dfd-4c1d-afca-c8080b2b2b6f',  30),
    ('a3f49847-d34e-4ad7-917b-6790dd64730f',  32),
    ('9ec22c5e-b779-4b54-b4b5-3ffb23b014c0',   1),
    ('11fe52b4-18fe-41b5-a327-a853c1facd84',  30),
    ('9aa06202-fae8-4196-83fe-8f4afdf841aa', 187),
    ('14b402de-9b0d-4adf-8ab6-d029ac58cd41',  51);

  CREATE TEMP TABLE _conta ON COMMIT DROP AS
  SELECT a.dividendo_id, a.esperado, d.cliente_id, 'Dividendos ' || btrim(d.nome) AS subcentro, gen_random_uuid() AS plano_id,
         17150 + 10 * (row_number() OVER (PARTITION BY d.cliente_id ORDER BY 'Dividendos ' || btrim(d.nome)))::integer AS ordem
    FROM _alvo a JOIN public.financeiro_dividendos d ON d.id = a.dividendo_id AND d.ativo;

  -- GUARDAS DE ORIGEM
  IF (SELECT count(*) FROM _conta) <> 11 THEN
    RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: esperados 11 dividendos ativos no cadastro, achados %.', (SELECT count(*) FROM _conta);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financeiro_plano_contas m WHERE m.id = c_molde AND m.ativo AND m.cliente_id IS NOT NULL
                    AND m.macro_custo = 'Dividendos' AND m.tipo_operacao = '2-Saídas') THEN
    RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: o molde (%) nao e'' mais a conta de dividendo por cliente esperada.', c_molde;
  END IF;
  IF EXISTS (SELECT 1 FROM _conta c JOIN public.financeiro_plano_contas p ON p.subcentro = c.subcentro AND p.ativo) THEN
    RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: ja'' existe conta ativa no plano com o nome de um dos 11 dividendos.';
  END IF;
  SELECT count(*) INTO v_antes FROM public.financeiro_lancamentos_v2 l
   WHERE NOT coalesce(l.cancelado, false) AND l.plano_conta_id IS NULL AND l.subcentro LIKE 'Dividendos %';
  IF v_antes <> c_total THEN
    RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: esperados % lancamentos "Dividendos ..." sem plano, achados %.', c_total, v_antes;
  END IF;
  FOR r IN SELECT * FROM _conta LOOP
    SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = r.cliente_id AND l.subcentro = r.subcentro AND l.plano_conta_id IS NULL AND NOT coalesce(l.cancelado, false);
    IF v_n <> r.esperado THEN
      RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: dividendo % — esperados % lancamentos sem plano, achados %.', r.dividendo_id, r.esperado, v_n;
    END IF;
  END LOOP;

  -- (1) AS 11 CONTAS, pelo molde
  INSERT INTO public.financeiro_plano_contas
         (id, cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, grupo_fluxo, escopo_negocio, ativo,
          ordem_exibicao, compoe_dre, gera_lcdpr, bloco_dre)
  SELECT c.plano_id, c.cliente_id, m.tipo_operacao, m.macro_custo, m.grupo_custo, m.centro_custo, c.subcentro, m.grupo_fluxo,
         m.escopo_negocio, true, c.ordem, m.compoe_dre, m.gera_lcdpr, m.bloco_dre
    FROM _conta c CROSS JOIN public.financeiro_plano_contas m
   WHERE m.id = c_molde;
  GET DIAGNOSTICS v_contas = ROW_COUNT;
  IF v_contas <> 11 THEN RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: criadas % contas, esperadas 11.', v_contas; END IF;

  -- (3) o estado anterior, ANTES de escrever
  INSERT INTO public.conc_dividendos_plano_01_backfill (lancamento_id, cliente_id, plano_conta_id, grupo_custo_antes, editado_manual_antes, updated_at_antes)
  SELECT l.id, l.cliente_id, c.plano_id, l.grupo_custo, l.editado_manual, l.updated_at
    FROM public.financeiro_lancamentos_v2 l JOIN _conta c ON c.cliente_id = l.cliente_id AND c.subcentro = l.subcentro
   WHERE l.plano_conta_id IS NULL AND NOT coalesce(l.cancelado, false);
  SELECT count(*) FILTER (WHERE grupo_custo_antes IS NULL) INTO v_grupo FROM public.conc_dividendos_plano_01_backfill;

  -- (2) BACKFILL — so' no vazio; a copia que acompanha o plano nao e' edicao humana
  PERFORM set_config('app.propagando_plano', 'on', true);
  UPDATE public.financeiro_lancamentos_v2 l
     SET plano_conta_id = b.plano_conta_id
    FROM public.conc_dividendos_plano_01_backfill b
   WHERE l.id = b.lancamento_id AND l.plano_conta_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('app.propagando_plano', 'off', true);
  IF v_n <> c_total THEN
    RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: backfill gravou % lancamentos, esperados %.', v_n, c_total;
  END IF;

  -- GUARDAS DE DESTINO
  SELECT count(*) INTO v_depois FROM public.financeiro_lancamentos_v2 l
   WHERE NOT coalesce(l.cancelado, false) AND l.plano_conta_id IS NULL AND l.subcentro LIKE 'Dividendos %';
  IF v_depois <> 0 THEN
    RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: sobraram % lancamentos "Dividendos ..." sem plano.', v_depois;
  END IF;
  IF EXISTS (SELECT 1 FROM public.conc_dividendos_plano_01_backfill b JOIN public.financeiro_lancamentos_v2 l ON l.id = b.lancamento_id
              JOIN public.financeiro_plano_contas p ON p.id = b.plano_conta_id
              WHERE l.plano_conta_id IS DISTINCT FROM b.plano_conta_id OR l.subcentro IS DISTINCT FROM p.subcentro
                 OR l.cliente_id IS DISTINCT FROM p.cliente_id OR l.macro_custo IS DISTINCT FROM 'Dividendos'
                 OR l.grupo_custo IS DISTINCT FROM 'Dividendos' OR l.centro_custo IS DISTINCT FROM 'Dividendos'
                 OR l.escopo_negocio IS DISTINCT FROM 'administrativo' OR l.compoe_dre IS DISTINCT FROM false
                 OR l.editado_manual IS DISTINCT FROM b.editado_manual_antes) THEN
    RAISE EXCEPTION 'CONC-DIVIDENDOS-PLANO-01: lancamento do backfill com chave, copia, cliente ou marca diferente do esperado.';
  END IF;
  RAISE NOTICE 'CONC-DIVIDENDOS-PLANO-01: 11 contas, % lancamentos com a chave, % passaram de grupo nulo a Dividendos.', v_n, v_grupo;
END
$mig$;
