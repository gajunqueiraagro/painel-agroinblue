-- P149 (Gabriel 27/10/2026 19:26; ordem e bloco 19:3x; aplicar 27/10 19:4x) — subcentro novo "Alimentação e Cantina <atividade>" no centro
-- "Mão de Obra" do Custo Fixo de cada atividade, GLOBAL (cliente_id nulo: vale para todos os clientes, os de hoje e os novos; o plano
-- padrão não se copia). Mesmos atributos dos irmãos "Benefícios e Premiações <atividade>" (macro, grupo, centro, escopo, DRE sim, grupo
-- de fluxo, tipo, LCDPR), com bloco_dre 'fixo' nas quatro (inclusive Silvicultura, cujo irmão está vazio — decisão do Gabriel).
-- ORDEM: antes de "Benefícios" (alfabético), NO VÃO, sem renumerar: 6175 / 11165 / 20235 / 21105. O número da ordem é CHAVE em
-- fn_meta_calculada_pecuaria, fn_meta_linhas, fn_financiamento_candidatas, oc_explicar_saldo, oc_sincronizar_entregas,
-- _fn_lancamento_de_extrato_criar e fn_transferencia_de_extratos (e 18010 no front): renumerar quebraria todos.
-- REGRA DE USO:
--   · comida de quem trabalha na fazenda (funcionário, diarista, prestador) + gás da cozinha;
--   · fazenda mista sem separação → Alimentação e Cantina Administrativo (o rateio fica no DRE);
--   · comida da família do produtor = Dividendos;
--   · casa sede segue em "Despesas Casa Sede".
--   O Administrativo não recebe safra.
SET LOCAL lock_timeout = '2s';

INSERT INTO public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, grupo_fluxo, escopo_negocio, ativo, ordem_exibicao,
   compoe_dre, gera_lcdpr, bloco_dre)
SELECT NULL, b.tipo_operacao, b.macro_custo, b.grupo_custo, b.centro_custo, n.subcentro, b.grupo_fluxo, b.escopo_negocio, true, n.ordem,
       b.compoe_dre, b.gera_lcdpr, 'fixo'
  FROM (VALUES ('Benefícios e Premiações Pecuária',       'Alimentação e Cantina Pecuária',       6175),
               ('Benefícios e Premiações Agricultura',    'Alimentação e Cantina Agricultura',    11165),
               ('Benefícios e Premiações Silvicultura',   'Alimentação e Cantina Silvicultura',   20235),
               ('Benefícios e Premiações Administrativo', 'Alimentação e Cantina Administrativo', 21105)) AS n(irmao, subcentro, ordem)
  JOIN public.financeiro_plano_contas b ON b.cliente_id IS NULL AND b.subcentro = n.irmao AND b.ativo
 WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_plano_contas x WHERE x.cliente_id IS NULL AND x.subcentro = n.subcentro)
   AND NOT EXISTS (SELECT 1 FROM public.financeiro_plano_contas x WHERE x.cliente_id IS NULL AND x.ordem_exibicao = n.ordem);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.financeiro_plano_contas WHERE cliente_id IS NULL AND subcentro LIKE 'Alimentação e Cantina %'
        AND bloco_dre = 'fixo' AND compoe_dre AND ordem_exibicao IN (6175, 11165, 20235, 21105)) <> 4 THEN
    RAISE EXCEPTION 'P149: esperava 4 linhas "Alimentação e Cantina" globais';
  END IF;
END $$;
