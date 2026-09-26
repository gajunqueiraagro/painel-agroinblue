-- BOITEL-ABATE-PRODUTOR-01 (B-01) — modalidade "abate em nome do produtor" (26/09/2026, decisoes do Gabriel).
--
-- DUAS MODALIDADES DE VENDA EM BOITEL:
--   A (boitel, a de sempre): o boitel abate no nome dele, recebe do frigorifico, desconta diarias/sanidade/notas e
--     repassa o liquido. Ao financeiro vai so' o liquido.
--   B (produtor): o gado abate EM NOME DO PRODUTOR. O frigorifico paga DIRETO ao produtor (entrada, subcentro 1150) e o
--     boitel emite boleto com as despesas (saida, subcentro NOVO 1155 "Acerto de Boitel (despesas)"). O liquido da OC =
--     recebido do frigorifico - pago ao boitel. A conta e' a MESMA do motor (`fba - descontoDoAcerto`); muda o caixa.
--
-- O QUE ESTA MIGRATION FAZ:
--   1. zoo_operacao_boitel.quem_abate ('boitel' padrao | 'produtor') e frigorifico_id (FK financeiro_fornecedores).
--      As 25 linhas existentes (14 OCs, medido em 26/09) nascem 'boitel' — a A inteira fica como era.
--   2. Plano: 1155 "Acerto de Boitel (despesas)", global, 2-Saidas, bloco venda, centro "Venda Peso Vivo" (vao depois do 1150,
--      PLANO-ORDEM-01; e' o PRIMEIRO centro com entrada e saida, opcao C do Gabriel). Catalogo: obrigacao acerto_boitel.
--   3. DRE (fn_dre_pecuaria, fn_dre_pecuaria_lancamentos): saida em conta de bloco venda ABATE (sinal negativo) — a
--      linha de venda mostra o liquido. Troca minima e equivalente: `(bloco not in (venda,receita) and saida)` virou
--      `(bloco <> receita and saida)`; a unica diferenca entre as duas e' "bloco venda + saida".
--   4. Guarda do principal (oc_criar_compromisso) e o aviso do vincular: na B a base soma os acertos de saida da OC
--      (`_oc_acertos_boitel_produtor`, zero na A). Sem tolerancia: 1 centavo a mais recusa.
--   5. oc_revalorar_lote: na B nao toca o principal ligado ao lote (e' o bruto do frigorifico); slot, valor_acordado e
--      rebanho andam como na A.
--   6. oc_salvar_boitel: quem_abate e frigorifico_id no payload; na B o realizado exige "Frigorífico"; frigorifico de
--      outro cliente e' recusado.
--   7. _oc_vinculo_mapa: lancamento em 1155 vira o item acerto_boitel da OC.
--
-- PATCH GUARDADO POR md5 (alternativa do CLAUDE.md para corpo grande — 23k/27k/19k chars): cada funcao tem o md5 de
-- origem conferido, cada ancora casando o numero exato de vezes, o corpo gravado igual ao patch e o md5 de destino:
--   oc_salvar_boitel             c428ef90 -> 8dae7c1b      fn_dre_pecuaria           7adebae1 -> 18742cc2
--   fn_dre_pecuaria_lancamentos  a3f9174d -> 3f0e203d      oc_criar_compromisso      4c0c7647 -> a2509aa6
--   oc_vincular_lancamento       e40fe082 -> 9634b63b      oc_revalorar_lote         cd372556 -> 4b3a1ca6
--   _oc_vinculo_mapa             6fe438ea -> 928535c7
-- Reexecutar FALHA na guarda de origem, que e' o comportamento certo para migration de corpo.
--
-- PROVAS (rollback, antes da aplicacao):
--   DRE: fn_dre_pecuaria para TODOS os 7 clientes x 27 periodos (civis 2014-2027, safras 2014/15-2026/27) x 2 cenarios
--     = 378 saidas, hash antes = hash depois em todas. Diferenca semantica dos predicados e somas das duas funcoes, linha
--     a linha: 37.873 lancamentos e 1.888 linhas de planejamento, ZERO divergencias; a unica conta venda+saida do plano
--     e' a 1155 nova e a meta calculada nao a cita. Controle: a linha sintetica venda+saida e' achada.
--   A (todas as 14 OCs de boitel, funcao velha x nova na mesma transacao): revalorar identico nas 14 e a guarda do
--     principal identica (1 centavo acima recusa, igual passa) — 16 de 16 iguais.
--   B (cd4c54b0, em rollback): realizado sem frigorifico recusa "Falta Frigorífico"; frigorifico de outro cliente
--     recusa; com o JBS passa. Acerto de 200.000 no 1155; principal 716.459,05 (base + 0,01) RECUSA, 716.459,04 passa.
--     Revalorar: slot e valor_acordado andam, principal fica em 716.459,04 (acao 'modalidade_produtor'). Uma saida de
--     100.000 no 1155 tira exatamente 100.000,00 das vendas do DRE e aparece como -100000 no drill. O mapa do
--     vincular sugere acerto_boitel para o 1155. `_oc_acertos_boitel_produtor` numa OC A = 0.

-- ========================================================================================
-- DDL, PLANO, CATALOGO
-- ========================================================================================
ALTER TABLE public.zoo_operacao_boitel
  ADD COLUMN quem_abate text NOT NULL DEFAULT 'boitel'
    CONSTRAINT zoo_operacao_boitel_quem_abate_check CHECK (quem_abate IN ('boitel','produtor')),
  ADD COLUMN frigorifico_id uuid REFERENCES public.financeiro_fornecedores(id);
COMMENT ON COLUMN public.zoo_operacao_boitel.quem_abate IS
  'BOITEL-ABATE-PRODUTOR-01. boitel = o boitel abate no nome dele e repassa o liquido (A); produtor = o gado abate em nome do produtor, o frigorifico paga o produtor e o boitel cobra as despesas (B).';
COMMENT ON COLUMN public.zoo_operacao_boitel.frigorifico_id IS
  'BOITEL-ABATE-PRODUTOR-01. Na B, quem paga o produtor — o favorecido do principal. Obrigatorio no realizado da B.';

DO $mig$
DECLARE n int;
BEGIN
  PERFORM 1 FROM public.financeiro_plano_contas
   WHERE cliente_id IS NULL AND ordem_exibicao = 1150 AND subcentro = 'Venda em Boitel'
     AND centro_custo = 'Venda Peso Vivo' AND bloco_dre = 'venda' AND tipo_operacao = '1-Entradas';
  IF NOT FOUND THEN RAISE EXCEPTION 'vizinho 1150 nao confere'; END IF;
  SELECT count(*) INTO n FROM public.financeiro_plano_contas WHERE ordem_exibicao = 1155;
  IF n <> 0 THEN RAISE EXCEPTION 'o vao 1155 nao esta livre (% ocupado)', n; END IF;
  SELECT count(*) INTO n FROM public.financeiro_plano_contas WHERE subcentro = 'Acerto de Boitel (despesas)';
  IF n <> 0 THEN RAISE EXCEPTION 'subcentro Acerto de Boitel (despesas) ja existe (%)', n; END IF;

  INSERT INTO public.financeiro_plano_contas
    (cliente_id, tipo_operacao, macro_custo, centro_custo, subcentro,
     escopo_negocio, ativo, ordem_exibicao, grupo_custo, compoe_dre, gera_lcdpr, bloco_dre)
  VALUES
    (NULL, '2-Saídas', 'Receita Operacional', 'Venda Peso Vivo', 'Acerto de Boitel (despesas)',
     'pecuaria', true, 1155, 'Receita Pecuária', true, NULL, 'venda');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'esperado 1 subcentro novo, veio %', n; END IF;

  INSERT INTO public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ativo, ordem_exibicao, sistemico)
  VALUES ('obrigacao', 'acerto_boitel', 'Acerto de boitel (despesas)', 'ajuste', true, 122, false);
END $mig$;

-- A base do principal na B: o slot (liquido) + os acertos de saida da propria OC. Na A, zero.
CREATE FUNCTION public._oc_acertos_boitel_produtor(p_operacao_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.zoo_operacao_boitel bt
                  WHERE bt.operacao_id = p_operacao_id AND bt.quem_abate = 'produtor')
    THEN COALESCE((SELECT sum(k.valor_total) FROM public.zoo_operacao_compromissos k
                    WHERE k.operacao_id = p_operacao_id AND k.natureza = 'obrigacao'
                      AND k.componente = 'acerto_boitel' AND k.status <> 'cancelado'), 0)
    ELSE 0 END;
$f$;
REVOKE ALL ON FUNCTION public._oc_acertos_boitel_produtor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._oc_acertos_boitel_produtor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._oc_acertos_boitel_produtor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._oc_acertos_boitel_produtor(uuid) TO service_role;

-- ========================================================================================
-- PATCHES GUARDADOS POR md5 (regra do CLAUDE.md para corpo grande): origem conferida, cada ancora
-- casando o numero exato de vezes, corpo gravado = patch, md5 de destino conferido.
-- ========================================================================================
CREATE TYPE pg_temp.par_patch AS (ancora text, troca text, n int);
CREATE FUNCTION pg_temp.aplicar_patch(p_nome text, p_de text, p_para text, p_pares pg_temp.par_patch[])
 RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_oid oid; v_src text; v_def text; v_novo text; v_n int; r pg_temp.par_patch;
BEGIN
  SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = p_nome;
  IF md5(v_src) <> p_de THEN RAISE EXCEPTION '%: md5 de origem % nao e o esperado %', p_nome, md5(v_src), p_de; END IF;
  v_novo := v_src;
  v_def := pg_get_functiondef(v_oid);
  FOREACH r IN ARRAY p_pares LOOP
    v_n := (length(v_novo) - length(replace(v_novo, r.ancora, ''))) / length(r.ancora);
    IF v_n <> r.n THEN RAISE EXCEPTION '%: ancora casa % vezes (esperado %): %', p_nome, v_n, r.n, left(r.ancora, 90); END IF;
    v_novo := replace(v_novo, r.ancora, r.troca);
    v_def := replace(v_def, r.ancora, r.troca);
  END LOOP;
  EXECUTE v_def;
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_oid;
  IF v_src IS DISTINCT FROM v_novo THEN RAISE EXCEPTION '%: corpo gravado difere do patch', p_nome; END IF;
  IF p_para IS NOT NULL AND md5(v_src) <> p_para THEN
    RAISE EXCEPTION '%: md5 de destino % nao e o esperado %', p_nome, md5(v_src), p_para; END IF;
  RETURN p_nome || '=' || md5(v_src);
END $f$;

SELECT pg_temp.aplicar_patch('oc_salvar_boitel', 'c428ef909d54de998097d56d30604f74', '8dae7c1b5d220f6095359214586f22a7', ARRAY[ROW($q$peso_vivo_total_abate, arrobas_totais_abate,
    created_by, updated_by$q$, $q$peso_vivo_total_abate, arrobas_totais_abate, quem_abate, frigorifico_id,
    created_by, updated_by$q$, 1)::pg_temp.par_patch,ROW($q$    NULLIF(p_payload->>'arrobas_totais_abate','')::numeric,
    v_actor, v_actor$q$, $q$    NULLIF(p_payload->>'arrobas_totais_abate','')::numeric,
    COALESCE(NULLIF(p_payload->>'quem_abate',''), 'boitel'),
    NULLIF(p_payload->>'frigorifico_id','')::uuid,
    v_actor, v_actor$q$, 1)::pg_temp.par_patch,ROW($q$ELSE b.arrobas_totais_abate END,
    updated_at = now(), updated_by = v_actor$q$, $q$ELSE b.arrobas_totais_abate END,
    quem_abate               = CASE WHEN p_payload ? 'quem_abate'               THEN COALESCE(NULLIF(p_payload->>'quem_abate',''), 'boitel')                    ELSE b.quem_abate END,
    frigorifico_id           = CASE WHEN p_payload ? 'frigorifico_id'           THEN NULLIF(p_payload->>'frigorifico_id','')::uuid                              ELSE b.frigorifico_id END,
    updated_at = now(), updated_by = v_actor$q$, 1)::pg_temp.par_patch,ROW($q$THEN v_faltando := array_append(v_faltando, 'Valor total do abate'); END IF;
$q$, $q$THEN v_faltando := array_append(v_faltando, 'Valor total do abate'); END IF;
    -- BOITEL-ABATE-PRODUTOR-01: abate em nome do produtor exige saber QUEM pagou (o favorecido do principal).
    IF v_row.quem_abate = 'produtor' AND v_row.frigorifico_id IS NULL                 THEN v_faltando := array_append(v_faltando, 'Frigorífico'); END IF;
$q$, 1)::pg_temp.par_patch,ROW($q$  IF array_length(v_faltando, 1) IS NOT NULL THEN$q$, $q$  -- BOITEL-ABATE-PRODUTOR-01: o frigorifico e' favorecido DESTE cliente (ou global), como a contraparte.
  IF v_row.frigorifico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financeiro_fornecedores f
       WHERE f.id = v_row.frigorifico_id AND (f.cliente_id = p_cliente_id OR f.cliente_id IS NULL)) THEN
    RAISE EXCEPTION 'Frigorifico nao pertence a este cliente ou nao existe.' USING ERRCODE = 'P0001'; END IF;

  IF array_length(v_faltando, 1) IS NOT NULL THEN$q$, 1)::pg_temp.par_patch]);
SELECT pg_temp.aplicar_patch('fn_dre_pecuaria', '7adebae1b8792d027dd6c62124c851ee', '18742cc2755e99060fc1702805ed3390', ARRAY[ROW($q$(p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas')$q$, $q$(p.bloco_dre<>'receita' and l.tipo_operacao='2-Saídas')$q$, 2)::pg_temp.par_patch,ROW($q$(bloco_dre not in ('venda','receita') and tipo_operacao='2-Saídas')$q$, $q$(bloco_dre<>'receita' and tipo_operacao='2-Saídas')$q$, 2)::pg_temp.par_patch,ROW($q$    select l.fazenda_id, p.bloco_dre bloco, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar$q$, $q$    select l.fazenda_id, p.bloco_dre bloco, (case when p.bloco_dre='venda' and l.tipo_operacao='2-Saídas' then -l.valor else l.valor end) valor, case when l.status_transacao<>'realizado' then (case when p.bloco_dre='venda' and l.tipo_operacao='2-Saídas' then -l.valor else l.valor end) else 0 end a_pagar$q$, 1)::pg_temp.par_patch,ROW($q$    select l.fazenda_id, p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar$q$, $q$    select l.fazenda_id, p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, (case when p.bloco_dre='venda' and l.tipo_operacao='2-Saídas' then -l.valor else l.valor end) valor, case when l.status_transacao<>'realizado' then (case when p.bloco_dre='venda' and l.tipo_operacao='2-Saídas' then -l.valor else l.valor end) else 0 end a_pagar$q$, 1)::pg_temp.par_patch,ROW($q$    select fazenda_id, bloco_dre, valor, 0 from plm$q$, $q$    select fazenda_id, bloco_dre, case when bloco_dre='venda' and tipo_operacao='2-Saídas' then -valor else valor end, 0 from plm$q$, 1)::pg_temp.par_patch,ROW($q$    select fazenda_id, bloco_dre, coalesce(centro_custo,'(sem)'), valor, 0 from plm$q$, $q$    select fazenda_id, bloco_dre, coalesce(centro_custo,'(sem)'), case when bloco_dre='venda' and tipo_operacao='2-Saídas' then -valor else valor end, 0 from plm$q$, 1)::pg_temp.par_patch]);
SELECT pg_temp.aplicar_patch('fn_dre_pecuaria_lancamentos', 'a3f9174de22fa0fb649151780243601d', '3f0e203dc503ffef5a8317ba4dcfb4c0', ARRAY[ROW($q$(p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas')$q$, $q$(p.bloco_dre<>'receita' and l.tipo_operacao='2-Saídas')$q$, 1)::pg_temp.par_patch,ROW($q$(p.bloco_dre not in ('venda','receita') and p.tipo_operacao='2-Saídas')$q$, $q$(p.bloco_dre<>'receita' and p.tipo_operacao='2-Saídas')$q$, 2)::pg_temp.par_patch,ROW($q$  'valor', l.valor, $q$, $q$  'valor', (case when p.bloco_dre='venda' and l.tipo_operacao='2-Saídas' then -l.valor else l.valor end), $q$, 1)::pg_temp.par_patch,ROW($q$  'valor', pf.valor_planejado, $q$, $q$  'valor', case when p.bloco_dre='venda' and p.tipo_operacao='2-Saídas' then -pf.valor_planejado else pf.valor_planejado end, $q$, 1)::pg_temp.par_patch,ROW($q$  'valor', c.valor, $q$, $q$  'valor', case when p.bloco_dre='venda' and p.tipo_operacao='2-Saídas' then -c.valor else c.valor end, $q$, 1)::pg_temp.par_patch]);
SELECT pg_temp.aplicar_patch('oc_criar_compromisso', '4c0c764766efd4c51e37589f91919f8b', 'a2509aa677198acd542588638e54b535', ARRAY[ROW($q$    SELECT COALESCE(SUM(valor_total), 0) INTO v_ja_principal$q$, $q$    -- BOITEL-ABATE-PRODUTOR-01: na B o principal e' o que o frigorifico paga (bruto); a base
    -- (o slot, liquido) soma os acertos de saida da propria OC. Na A a funcao devolve 0. Sem tolerancia.
    v_base := v_base + public._oc_acertos_boitel_produtor(p_operacao_id);
    SELECT COALESCE(SUM(valor_total), 0) INTO v_ja_principal$q$, 1)::pg_temp.par_patch]);
SELECT pg_temp.aplicar_patch('oc_vincular_lancamento', 'e40fe082bb45fc6cce296f7168539a0f', '9634b63b6ec32b1d268ccf5f6da7972f', ARRAY[ROW($q$    SELECT b.base INTO v_base FROM public._oc_base_saldo_operacao(p_operacao_id) b;
    SELECT coalesce(sum(c.valor_total), 0) INTO v_soma_principal$q$, $q$    SELECT b.base INTO v_base FROM public._oc_base_saldo_operacao(p_operacao_id) b;
    v_base := v_base + public._oc_acertos_boitel_produtor(p_operacao_id);  -- BOITEL-ABATE-PRODUTOR-01
    SELECT coalesce(sum(c.valor_total), 0) INTO v_soma_principal$q$, 1)::pg_temp.par_patch]);
SELECT pg_temp.aplicar_patch('oc_revalorar_lote', 'cd372556b6a97b7e316d6a34448343c5', '4b3a1ca6a79dcfd537b986d7795986d1', ARRAY[ROW($q$  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
   WHERE operacao_id = p_operacao_id AND lote_id = p_lote_id AND natureza = 'principal' AND status <> 'cancelado'$q$, $q$  -- BOITEL-ABATE-PRODUTOR-01: na B o principal ligado ao lote e' o que o FRIGORIFICO paga (bruto), e o slot e'
  -- o liquido — revalorar nao o toca. So' slot, valor_acordado e o lancamento do rebanho andam, como na A.
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_boitel bt WHERE bt.operacao_id = p_operacao_id AND bt.quem_abate = 'produtor') THEN
    v_comp_acao := 'modalidade_produtor';
  ELSE
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
   WHERE operacao_id = p_operacao_id AND lote_id = p_lote_id AND natureza = 'principal' AND status <> 'cancelado'$q$, 1)::pg_temp.par_patch,ROW($q$    ELSE
      v_comp_acao := 'pendente';
    END IF;
  END IF;
$q$, $q$    ELSE
      v_comp_acao := 'pendente';
    END IF;
  END IF;
  END IF;
$q$, 1)::pg_temp.par_patch]);
SELECT pg_temp.aplicar_patch('_oc_vinculo_mapa', '6fe438ead004b1bfa92fccbd653e42ff', '928535c7e5f786282fed637187dd0b23', ARRAY[ROW($q$      ('Adiantamento de Boitel',                       ARRAY['venda'],                  'obrigacao',       ARRAY['adiantamento'],                                           '2-Saídas'),
$q$, $q$      ('Adiantamento de Boitel',                       ARRAY['venda'],                  'obrigacao',       ARRAY['adiantamento'],                                           '2-Saídas'),
      ('Acerto de Boitel (despesas)',                  ARRAY['venda'],                  'obrigacao',       ARRAY['acerto_boitel'],                                          '2-Saídas'),
$q$, 1)::pg_temp.par_patch]);

-- ACL: as SECDEF recriadas continuam so' authenticated + service_role (anon conferido = false depois).
REVOKE ALL ON FUNCTION public.oc_salvar_boitel(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_salvar_boitel(uuid, uuid, integer, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_criar_compromisso(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_criar_compromisso(uuid, integer, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_revalorar_lote(uuid, uuid, integer, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_revalorar_lote(uuid, uuid, integer, uuid, numeric, text) TO authenticated, service_role;
