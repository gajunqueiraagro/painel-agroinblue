-- P176 PLANO-INVESTIMENTOS-PADRAO-01 (Gabriel 29/10/2026; proposta APROVADA 15:01, ~/Downloads/investimentos-padrao-v1.html; D1–D4 = sim) —
-- os subcentros de "Investimento na Fazenda" no MESMO padrao nas 4 atividades: "Investimento em <item> <Atividade>", os mesmos 4 centros
-- (Infraestrutura · Maquinas · Formacao · RH; "Pastagem", "Solo" e "Floresta" viram "Formacao") e a Silvicultura compondo o DRE.
-- FASE 0: ~/Downloads/relatorios/visao-20261029-1515-P176-fase0.md; previa: visao-20261030-*-P176-previa.md.
-- O QUE MUDA:
--   0. D5: a coluna `updated_at` volta a `meta_projetos_investimento` (o gatilho dela a exige; sem ela nenhum UPDATE passa).
--   1. 18 contas GLOBAIS renomeadas (4 trocam tambem o centro para "Formação"), UMA POR UPDATE, guardado pelo id E pelo texto/centro de
--      hoje (texto diferente = a migration aborta inteira). A chave (`plano_conta_id`) NAO muda: valor, DRE e caixa iguais. O gatilho
--      `trg_propagar_plano_para_lancamentos` leva o texto novo aos lancamentos da conta (o caminho que ja' existe).
--   2. D1: a ordem de exibicao do padrao em cada atividade, dentro da faixa dela (Pec 9010–9100, Agri 14010–14100, Silv 20610–20710,
--      Adm 22010–22030). As 5 que ficam com o nome mudam so' a ordem.
--   3. 11 contas GLOBAIS novas (Silv 7, Pec 3, Agri 1), ativas, `compoe_dre` / `bloco_dre = 'investimento'`. Nome que ja' exista = aborta.
--   4. Silvicultura: as 4 de hoje passam a `compoe_dre = true`, `bloco_dre = 'investimento'` (D4: "Treinamentos e EPI" vira "Treinamentos"
--      e nasce "Uniformes e EPI"). Elas tem 0 lancamentos: o DRE muda R$ 0,00 hoje.
--   5. O texto que so' guarda o NOME acompanha: `financeiro_recorrencias.subcentro`, `meta_projetos_investimento` (subcentro e centro)
--      e `mesa_lancamento_staging` PENDENTE (subcentro e centro). D3: os promovidos da Mesa e os lancamentos cancelados sem chave ficam.
--   6. D2: os 13 nomes velhos com lancamento viram APELIDO global (origem 'migracao') do mesmo id — Excel/TXT/Mesa com o nome antigo
--      continuam achando a conta.
-- ⚠ CLAUDE.md: "nunca renomear/alterar em massa `financeiro_plano_contas`" — este e' o pedido explicito do Gabriel; por isso uma conta
--   por UPDATE, guardada, com `lock_timeout` de 2 s, e nada apagado nem fundido.
-- GESTO CONTRARIO: os mesmos UPDATEs com velho/novo trocados (ordem e centro de hoje na FASE 0); as 11 novas e os 13 apelidos so' se
--   INATIVAM (`ativo = false`), nunca se apagam.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '50s';

-- ── 0. D5 (achado no ensaio de 30/10; OK do Gabriel 31/10/2026 05:34, na mesma migration): `meta_projetos_investimento` tem o gatilho
--    `update_meta_projetos_investimento_updated_at` (BEFORE UPDATE, `NEW.updated_at = now()`) mas NAO tem mais a coluna `updated_at`
--    (criada em 20260415235842; some no proto e no `types.ts`): TODO UPDATE na tabela falha — o do P176 e o Editar projeto da tela
--    (`ProjetosInvestimento.tsx`). A coluna volta, como nasceu (nada apagado; as linhas de hoje ficam com o now() da migration).
ALTER TABLE public.meta_projetos_investimento ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
DECLARE
  r record; n int; v_rec int := 0; v_meta int := 0; v_mesa int := 0; v_alias int := 0; v_novas int := 0;
BEGIN
  -- ── 1 e 2. renomes e ordem: (id, subcentro hoje, centro hoje, subcentro novo, centro novo, ordem nova) ──
  FOR r IN SELECT * FROM (VALUES
    -- Pecuária
    ('f4fec107-569a-42a1-b413-bf133474c7fa'::uuid, 'Investimento em Instalações Pecuária', 'Infraestrutura', 'Investimento em Instalações Pecuária', 'Infraestrutura', 9010),
    ('9b10cc50-858a-4fa4-94c9-337e8258f81f'::uuid, 'Investimento em Cercas Pecuária', 'Infraestrutura', 'Investimento em Cercas Pecuária', 'Infraestrutura', 9020),
    ('cb586f4f-8373-403d-95dc-dbc43d83f176'::uuid, 'Investimento Máquinas e Equip. Pecuária', 'Máquinas', 'Investimento em Máquinas e Equipamentos Pecuária', 'Máquinas', 9030),
    ('08c28ca4-c776-4493-8ef8-0e056d7c9196'::uuid, 'Investimento Formação Pasto Pecuária', 'Pastagem', 'Investimento em Formação de Pasto Pecuária', 'Formação', 9060),
    ('d1d5f787-ce1d-4abc-9870-d61928353e95'::uuid, 'Investimento Treinamentos Pecuária', 'RH', 'Investimento em Treinamentos Pecuária', 'RH', 9080),
    ('ebeda8c1-c2e4-4db3-bc02-05329c5b9b2f'::uuid, 'Investimento Eventos e Capacitação Pecuária', 'RH', 'Investimento em Eventos e Capacitação Pecuária', 'RH', 9090),
    ('c5abccf1-70e7-4134-97d8-2882b51b06d4'::uuid, 'Investimento Uniformes e EPI Pecuária', 'RH', 'Investimento em Uniformes e EPI Pecuária', 'RH', 9100),
    -- Agricultura
    ('eca4260f-f596-413c-93db-6c558a58ff40'::uuid, 'Investimento Instalações Agricultura', 'Infraestrutura', 'Investimento em Instalações Agricultura', 'Infraestrutura', 14010),
    ('3ca87aff-aad4-49bd-965c-73dced44c430'::uuid, 'Investimento em Cercas Agricultura', 'Infraestrutura', 'Investimento em Cercas Agricultura', 'Infraestrutura', 14020),
    ('2ab34811-6823-4e6a-8df0-db60355ba29f'::uuid, 'Investimento em Máquinas Agrícolas', 'Máquinas', 'Investimento em Máquinas e Equipamentos Agricultura', 'Máquinas', 14030),
    ('fb52ef42-b147-41df-a601-e7167ed9270c'::uuid, 'Investimento em Implementos Agrícolas', 'Máquinas', 'Investimento em Implementos Agricultura', 'Máquinas', 14040),
    ('d9e176f6-d4dc-452b-8061-b33eb4ee0e1f'::uuid, 'Investimento Formação de Área Agrícola', 'Solo', 'Investimento em Formação de Área Agricultura', 'Formação', 14060),
    ('46e7ae03-1b4a-42b9-9127-cd8498a0e726'::uuid, 'Investimento em Correção de Solo', 'Solo', 'Investimento em Correção de Solo Agricultura', 'Formação', 14070),
    ('81e5e5ca-d9f1-4b3e-a5e9-c802b60b0803'::uuid, 'Investimento em Treinamentos Agricultura', 'RH', 'Investimento em Treinamentos Agricultura', 'RH', 14080),
    ('bf73f1d2-83c9-44e8-83d3-763d4f25d8ee'::uuid, 'Investimento Eventos, Capacitação Agricultura', 'RH', 'Investimento em Eventos e Capacitação Agricultura', 'RH', 14090),
    ('f5f81f44-ed45-4e5f-a973-b191d44551a5'::uuid, 'Investimento Uniformes e EPI Agricultura', 'RH', 'Investimento em Uniformes e EPI Agricultura', 'RH', 14100),
    -- Silvicultura
    ('59fb0a7b-2827-468e-9aeb-e08954cfc537'::uuid, 'Investimento em Estradas e Aceiros Silvicultura', 'Infraestrutura', 'Investimento em Estradas e Aceiros Silvicultura', 'Infraestrutura', 20630),
    ('f74dd0f7-1e0f-4186-a5f4-ae92dd1d6c8e'::uuid, 'Investimento Máquinas e Equip. Silvicultura', 'Máquinas', 'Investimento em Máquinas e Equipamentos Silvicultura', 'Máquinas', 20640),
    ('f1fef085-5d32-4d2f-94c5-ccbef0a0b441'::uuid, 'Investimento Formação de Floresta', 'Floresta', 'Investimento em Formação de Floresta Silvicultura', 'Formação', 20670),
    ('ac3bb238-53b7-49c7-9a1d-3e257f24cf9e'::uuid, 'Investimento Treinamentos e EPI Silvicultura', 'RH', 'Investimento em Treinamentos Silvicultura', 'RH', 20690),
    -- Administrativo
    ('8f253633-da4d-4c2f-aa35-a8f71e64442a'::uuid, 'Investimento Instalações Administrativo', 'Infraestrutura', 'Investimento em Instalações Administrativo', 'Infraestrutura', 22010),
    ('44391d6a-786a-4b57-b54b-e085c2c61750'::uuid, 'Investimento Equipamentos e Informática Administrativo', 'Máquinas', 'Investimento em Máquinas e Equipamentos Administrativo', 'Máquinas', 22020),
    ('d864f966-6a75-4766-93b6-54a671e0c1d7'::uuid, 'Investimento Veículos Administrativo', 'Máquinas', 'Investimento em Veículos Administrativo', 'Máquinas', 22030)
  ) AS t(id, velho, centro_velho, novo, centro_novo, ordem)
  LOOP
    UPDATE public.financeiro_plano_contas p
       SET subcentro = r.novo, centro_custo = r.centro_novo, ordem_exibicao = r.ordem,
           compoe_dre = CASE WHEN p.escopo_negocio = 'silvicultura' THEN true ELSE p.compoe_dre END,
           bloco_dre = CASE WHEN p.escopo_negocio = 'silvicultura' THEN 'investimento' ELSE p.bloco_dre END
     WHERE p.id = r.id AND p.cliente_id IS NULL AND p.ativo AND p.macro_custo = 'Investimento na Fazenda'
       AND p.subcentro = r.velho AND p.centro_custo = r.centro_velho;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'P176: a conta % não está como na FASE 0 («%» · %). Nada foi gravado.', r.id, r.velho, r.centro_velho;
    END IF;

    IF r.novo <> r.velho THEN
      -- ── 5. o texto que só guarda o nome ──
      UPDATE public.financeiro_recorrencias SET subcentro = r.novo WHERE subcentro = r.velho;
      GET DIAGNOSTICS n = ROW_COUNT; v_rec := v_rec + n;
      UPDATE public.meta_projetos_investimento
         SET subcentro = r.novo, centro_custo = CASE WHEN centro_custo = r.centro_velho THEN r.centro_novo ELSE centro_custo END
       WHERE subcentro = r.velho;
      GET DIAGNOSTICS n = ROW_COUNT; v_meta := v_meta + n;
      UPDATE public.mesa_lancamento_staging
         SET subcentro = r.novo, centro_custo = CASE WHEN centro_custo = r.centro_velho THEN r.centro_novo ELSE centro_custo END
       WHERE subcentro = r.velho AND status_promocao = 'pendente';
      GET DIAGNOSTICS n = ROW_COUNT; v_mesa := v_mesa + n;

      -- ── 6. D2: o nome velho vira apelido global (só os que têm lançamento) ──
      IF EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l WHERE l.plano_conta_id = r.id)
         AND NOT EXISTS (SELECT 1 FROM public.financeiro_subcentro_aliases a
                          WHERE a.cliente_id IS NULL AND a.origem = 'migracao' AND lower(trim(a.alias_text)) = lower(trim(r.velho))) THEN
        INSERT INTO public.financeiro_subcentro_aliases (cliente_id, alias_text, plano_conta_id, origem, observacao, ativo)
        VALUES (NULL, r.velho, r.id, 'migracao', 'P176 — nome antigo do plano (Gabriel 29/10/2026)', true);
        v_alias := v_alias + 1;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. as 11 contas novas (globais) ──
  FOR r IN SELECT * FROM (VALUES
    ('pecuaria', 'Investimento Pecuária', 'Máquinas', 'Investimento em Implementos Pecuária', 9040),
    ('pecuaria', 'Investimento Pecuária', 'Máquinas', 'Investimento em Veículos Pecuária', 9050),
    ('pecuaria', 'Investimento Pecuária', 'Formação', 'Investimento em Correção de Solo Pecuária', 9070),
    ('agricultura', 'Investimento Agricultura', 'Máquinas', 'Investimento em Veículos Agricultura', 14050),
    ('silvicultura', 'Investimento Silvicultura', 'Infraestrutura', 'Investimento em Instalações Silvicultura', 20610),
    ('silvicultura', 'Investimento Silvicultura', 'Infraestrutura', 'Investimento em Cercas Silvicultura', 20620),
    ('silvicultura', 'Investimento Silvicultura', 'Máquinas', 'Investimento em Implementos Silvicultura', 20650),
    ('silvicultura', 'Investimento Silvicultura', 'Máquinas', 'Investimento em Veículos Silvicultura', 20660),
    ('silvicultura', 'Investimento Silvicultura', 'Formação', 'Investimento em Correção de Solo Silvicultura', 20680),
    ('silvicultura', 'Investimento Silvicultura', 'RH', 'Investimento em Eventos e Capacitação Silvicultura', 20700),
    ('silvicultura', 'Investimento Silvicultura', 'RH', 'Investimento em Uniformes e EPI Silvicultura', 20710)
  ) AS t(escopo, grupo, centro, sub, ordem)
  LOOP
    IF EXISTS (SELECT 1 FROM public.financeiro_plano_contas p WHERE lower(trim(p.subcentro)) = lower(trim(r.sub))) THEN
      RAISE EXCEPTION 'P176: a conta «%» já existe no plano. Nada foi gravado.', r.sub;
    END IF;
    INSERT INTO public.financeiro_plano_contas
      (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, grupo_fluxo, escopo_negocio, ativo, ordem_exibicao, compoe_dre, bloco_dre)
    VALUES (NULL, '2-Saídas', 'Investimento na Fazenda', r.grupo, r.centro, r.sub, 'Investimentos', r.escopo, true, r.ordem, true, 'investimento');
    v_novas := v_novas + 1;
  END LOOP;

  RAISE NOTICE 'P176: 23 contas conferidas (18 renomes), % novas, % recorrências, % projetos da meta, % pendentes da Mesa, % apelidos',
    v_novas, v_rec, v_meta, v_mesa, v_alias;
END $$;
