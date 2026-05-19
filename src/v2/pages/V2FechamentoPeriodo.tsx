/**
 * V2FechamentoPeriodo.tsx — Tela cockpit Fechamento do Período (Marco 2.4 MVP).
 *
 * Orquestra:
 *  - Carrega lista de meses P1 fechados (cliente) para calcular default de período
 *  - Aplica filtro de período (input month start/end)
 *  - Chama useFechamentoPeriodoData para fetch + DTO
 *  - Renderiza 5 sub-páginas imprimíveis (Capa, EvolucaoOperacao,
 *    AnaliseZootecnica, FluxoCaixa, DesembolsoProducao, ResumoGlobal)
 *  - Botão "Gerar PDF" chama window.print()
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFechamentoPeriodoData } from '@/v2/hooks/useFechamentoPeriodoData';
import { calcularDefaultPeriodo } from '@/v2/lib/calcularDefaultPeriodo';
import type { StatusPilarMensal } from '@/v2/types/fechamentoPeriodo';
import Capa from './V2FechamentoPeriodo.parts/Capa';
import EvolucaoOperacao from './V2FechamentoPeriodo.parts/EvolucaoOperacao';
import AnaliseZootecnica from './V2FechamentoPeriodo.parts/AnaliseZootecnica';
import FluxoCaixa from './V2FechamentoPeriodo.parts/FluxoCaixa';
import DesembolsoProducao from './V2FechamentoPeriodo.parts/DesembolsoProducao';
import ResumoGlobal from './V2FechamentoPeriodo.parts/ResumoGlobal';
import './V2FechamentoPeriodo.parts/printStyles.css';

// Marco 2.5 Fase 1: BlocoAnaliseEconomica do Planejamento renderizado em
// paralelo aos renderers antigos. Reutiliza o pipeline oficial:
// usePainelConsultorData + usePlanejamentoFinanceiro + agregadores zoot +
// loaders financeiros ano-1/ano-corrente → buildPlanejamentoVisaoGeralData.
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import { usePlanejamentoFinanceiro } from '@/hooks/usePlanejamentoFinanceiro';
import { buildPlanejamentoVisaoGeralData, type ZootCompPreload } from '@/v2/lib/buildPlanejamentoVisaoGeralData';
import { BlocoAnaliseEconomica } from './V2PlanejamentoVisaoGeral.parts/BlocoAnaliseEconomica';
import { BlocoResumoExecutivo } from './V2PlanejamentoVisaoGeral.parts/BlocoResumoExecutivo';
import { BlocoProducaoPecuariaRealizada } from './V2FechamentoPeriodo.parts/BlocoProducaoPecuariaRealizada';
import { BlocoMovimentacoesRebanhoFechamento } from './V2FechamentoPeriodo.parts/BlocoMovimentacoesRebanhoFechamento';
import { FluxoCaixaModal } from '@/v2/components/modais/FluxoCaixaModal';
import { LinhaExecutivaExecutivoModal } from './V2PlanejamentoVisaoGeral.parts/LinhaExecutivaExecutivoModal';
import type { LinhaModalKey } from './V2PlanejamentoVisaoGeral.parts/BlocoResumoExecutivo';
import { buildBlocoResumoExecutivo } from '@/v2/lib/buildBlocoResumoExecutivo';
import { buildLinhaExecutivaModalData } from '@/v2/lib/buildLinhaExecutivaModalData';
import { buildProducaoRealizadaData } from '@/v2/lib/buildProducaoRealizadaData';
import type { LinhaExecutiva } from '@/v2/lib/blocoResumoExecutivoTypes';
import {
  type ComposicaoSubcentro,
  // PR1 — Receita Pecuária
  agregaReceitaPecPorSubcentro,
  agregaReceitaPecPorSubcentroMeta,
  // PR2 — Receita Agricultura
  agregaReceitaAgriPorSubcentro,
  agregaReceitaAgriPorSubcentroMeta,
  // PR2 — Outras Receitas
  agregaOutrasReceitasPorSubcentro,
  agregaOutrasReceitasPorSubcentroMeta,
  // PR2 — Entradas Financeiras
  agregaEntradasFinanceirasPorSubcentro,
  agregaEntradasFinanceirasPorSubcentroMeta,
  // PR3 — Custeio Pecuária + Agricultura (primeiras linhas natureza='despesa')
  agregaCusteioPecPorSubcentro,
  agregaCusteioPecPorSubcentroMeta,
  agregaCusteioAgriPorSubcentro,
  agregaCusteioAgriPorSubcentroMeta,
  // PR4 — Juros (Pec + Agri)
  agregaJurosPecPorSubcentro,
  agregaJurosPecPorSubcentroMeta,
  agregaJurosAgriPorSubcentro,
  agregaJurosAgriPorSubcentroMeta,
  // PR4 — Investimentos (Pec + Agri). Nome real do export: agregaInvFazenda*
  // (não agregaInvestimento*). Adotado conforme regra do briefing.
  agregaInvFazendaPecPorSubcentro,
  agregaInvFazendaPecPorSubcentroMeta,
  agregaInvFazendaAgriPorSubcentro,
  agregaInvFazendaAgriPorSubcentroMeta,
  // PR4 — Reposição Bovinos. Nome real do export: agregaInvBovinos*.
  agregaInvBovinosPorSubcentro,
  agregaInvBovinosPorSubcentroMeta,
  // PR4 — Amortizações (Pec + Agri)
  agregaAmortizacaoPecPorSubcentro,
  agregaAmortizacaoPecPorSubcentroMeta,
  agregaAmortizacaoAgriPorSubcentro,
  agregaAmortizacaoAgriPorSubcentroMeta,
  // PR4 — Dividendos
  agregaDividendosPorSubcentro,
  agregaDividendosPorSubcentroMeta,
  // PR4 — Deduções de Receita (natureza='despesa' via fix do helper
  // inferirNaturezaLinha). Nome real do export: agregaDeducoes* (sem o
  // sufixo 'Receita' no nome da função, apesar da chave deducoesReceita).
  agregaDeducoesPorSubcentro,
  agregaDeducoesPorSubcentroMeta,
} from '@/lib/painelConsultor/agregadosFinanceiros';
import {
  ORDEM_CENTROS_RECEITA_PECUARIA,
  ORDEM_CENTROS_RECEITA_AGRICULTURA,
  ORDEM_CENTROS_OUTRAS_RECEITAS,
  ORDEM_CENTROS_ENTRADAS_FINANCEIRAS,
  ORDEM_CENTROS_CUSTEIO_PECUARIA,
  ORDEM_CENTROS_CUSTEIO_AGRICULTURA,
  ORDEM_CENTROS_JUROS_PECUARIA,
  ORDEM_CENTROS_JUROS_AGRICULTURA,
  ORDEM_CENTROS_INVESTIMENTO_PECUARIA,
  ORDEM_CENTROS_INVESTIMENTO_AGRICULTURA,
  ORDEM_CENTROS_REPOSICAO_BOVINOS,
  ORDEM_CENTROS_AMORTIZACAO_PECUARIA,
  ORDEM_CENTROS_AMORTIZACAO_AGRICULTURA,
  ORDEM_CENTROS_DIVIDENDOS,
  ORDEM_CENTROS_DEDUCOES_RECEITA,
} from '@/lib/financeiro/classificacao';
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { composeGridMetaConsolidado } from '@/lib/painelConsultor/composeGridMetaConsolidado';
import { carregarLancFinAnoAntReal } from '@/lib/painelConsultor/lancFinHistoricoLoader';
import { carregarLancFinAnoCorrenteReal } from '@/lib/painelConsultor/lancFinAnoCorrenteLoader';
import {
  agregaReceitaPecZootComp,
  agregaDeducoesZootComp,
  agregaReposicaoBovinosZootComp,
} from '@/lib/painelConsultor/agregadosZootCompetencia';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';

interface Props {
  /** Período (Jan→mesAlvo) controlado pelo V2Index — state global, sobrevive
   *  à navegação entre seções. Slot Período + botão Gerar PDF moram no
   *  V2FilterBar (header global). */
  periodo: { periodoInicio: string; periodoFim: string };
  onPeriodoChange: (p: { periodoInicio: string; periodoFim: string }) => void;
}

// Config dos modais executivos de linha do Fechamento (FASE 2).
// PR1: apenas Receita Pecuária. Demais linhas (Custeio, Juros, Inv, etc) entram
// uma por PR — basta adicionar a entrada correspondente aqui.
interface ConfigModalLinhaFechamento {
  titulo: string;
  composicaoOficialLabel: string;
  ordemCentrosOficial: readonly string[];
  agregaReal: (lancFin: FinanceiroLancamento[], ano: number) => Record<string, ComposicaoSubcentro>;
  agregaMeta: (grid: SubcentroGrid[]) => Record<string, ComposicaoSubcentro>;
}

const CONFIG_MODAIS_LINHA_FECHAMENTO: Partial<Record<LinhaModalKey, ConfigModalLinhaFechamento>> = {
  receitaPecuaria: {
    titulo: 'Receita Pecuária',
    composicaoOficialLabel: 'grupo_custo = "Receita Pecuária"',
    ordemCentrosOficial: ORDEM_CENTROS_RECEITA_PECUARIA,
    agregaReal: agregaReceitaPecPorSubcentro,
    agregaMeta: agregaReceitaPecPorSubcentroMeta,
  },
  // PR2 — paridade EXATA com V2PlanejamentoVisaoGeral.tsx (CONFIG_MODAIS_LINHA).
  // titulo + composicaoOficialLabel + ordemCentrosOficial + agregaReal/Meta
  // copiados conforme regra soberana de paridade (Gabriel).
  receitaAgricultura: {
    titulo: 'Receita Agricultura',
    composicaoOficialLabel: 'grupo_custo = "Receita Agrícola"',
    ordemCentrosOficial: ORDEM_CENTROS_RECEITA_AGRICULTURA,
    agregaReal: agregaReceitaAgriPorSubcentro,
    agregaMeta: agregaReceitaAgriPorSubcentroMeta,
  },
  outrasReceitas: {
    titulo: 'Outras Receitas',
    composicaoOficialLabel: 'grupo_custo = "Outras Receitas"',
    ordemCentrosOficial: ORDEM_CENTROS_OUTRAS_RECEITAS,
    agregaReal: agregaOutrasReceitasPorSubcentro,
    agregaMeta: agregaOutrasReceitasPorSubcentroMeta,
  },
  // Natureza='receita' por substring match em 'entrada' (PR1.2A).
  // Decisão Gabriel: aceitar para fins de cor semântica — "mais entrada
  // que o planejado = azul" é leitura executiva válida no modal de caixa.
  entradasFinanceiras: {
    titulo: 'Entradas Financeiras',
    composicaoOficialLabel: 'grupo_custo = "Entradas de Capital"',
    ordemCentrosOficial: ORDEM_CENTROS_ENTRADAS_FINANCEIRAS,
    agregaReal: agregaEntradasFinanceirasPorSubcentro,
    agregaMeta: agregaEntradasFinanceirasPorSubcentroMeta,
  },
  // PR3 — Custeio Pec + Agri: primeiras linhas natureza='despesa' com drill.
  // Cenário-prova da cor semântica invertida (PR1.2A + PR1.3): Δ% negativo
  // em despesa = economia → AZUL. Paridade EXATA com Planejamento L131-144
  // (regra soberana de paridade — Gabriel).
  custeioPecuaria: {
    titulo: 'Custeio Pecuária',
    composicaoOficialLabel: 'macro_custo = "Custeio Produção", escopo = "pecuária" (fixo + variável, sem juros)',
    ordemCentrosOficial: ORDEM_CENTROS_CUSTEIO_PECUARIA,
    agregaReal: agregaCusteioPecPorSubcentro,
    agregaMeta: agregaCusteioPecPorSubcentroMeta,
  },
  custeioAgricultura: {
    titulo: 'Custeio Agricultura',
    composicaoOficialLabel: 'macro_custo = "Custeio Produção", escopo = "agricultura" (fixo + variável, sem juros)',
    ordemCentrosOficial: ORDEM_CENTROS_CUSTEIO_AGRICULTURA,
    agregaReal: agregaCusteioAgriPorSubcentro,
    agregaMeta: agregaCusteioAgriPorSubcentroMeta,
  },
  // PR4 — 9 linhas restantes (Juros + Inv + Reposição + Amort + Div + Ded).
  // Paridade EXATA com CONFIG_MODAIS_LINHA do V2PlanejamentoVisaoGeral.tsx
  // (L145-207). Strings copiadas literalmente (regra soberana — Gabriel).
  jurosPecuaria: {
    titulo: 'Juros Pecuária',
    composicaoOficialLabel: 'grupo_custo = "Juros de Financiamento Pecuária"',
    ordemCentrosOficial: ORDEM_CENTROS_JUROS_PECUARIA,
    agregaReal: agregaJurosPecPorSubcentro,
    agregaMeta: agregaJurosPecPorSubcentroMeta,
  },
  jurosAgricultura: {
    titulo: 'Juros Agricultura',
    composicaoOficialLabel: 'grupo_custo = "Juros de Financiamento Agricultura"',
    ordemCentrosOficial: ORDEM_CENTROS_JUROS_AGRICULTURA,
    agregaReal: agregaJurosAgriPorSubcentro,
    agregaMeta: agregaJurosAgriPorSubcentroMeta,
  },
  investimentoPecuaria: {
    titulo: 'Investimento Pecuária',
    composicaoOficialLabel: 'grupo_custo = "Investimento Pecuária"',
    ordemCentrosOficial: ORDEM_CENTROS_INVESTIMENTO_PECUARIA,
    agregaReal: agregaInvFazendaPecPorSubcentro,
    agregaMeta: agregaInvFazendaPecPorSubcentroMeta,
  },
  investimentoAgricultura: {
    titulo: 'Investimento Agricultura',
    composicaoOficialLabel: 'grupo_custo = "Investimento Agricultura"',
    ordemCentrosOficial: ORDEM_CENTROS_INVESTIMENTO_AGRICULTURA,
    agregaReal: agregaInvFazendaAgriPorSubcentro,
    agregaMeta: agregaInvFazendaAgriPorSubcentroMeta,
  },
  reposicaoBovinos: {
    titulo: 'Reposição Bovinos',
    composicaoOficialLabel: 'grupo_custo = "Compra de Bovinos"',
    ordemCentrosOficial: ORDEM_CENTROS_REPOSICAO_BOVINOS,
    agregaReal: agregaInvBovinosPorSubcentro,
    agregaMeta: agregaInvBovinosPorSubcentroMeta,
  },
  amortizacaoPecuaria: {
    titulo: 'Amortização Pecuária',
    composicaoOficialLabel: 'grupo_custo = "Amortizações", escopo = "pecuária"',
    ordemCentrosOficial: ORDEM_CENTROS_AMORTIZACAO_PECUARIA,
    agregaReal: agregaAmortizacaoPecPorSubcentro,
    agregaMeta: agregaAmortizacaoPecPorSubcentroMeta,
  },
  amortizacaoAgricultura: {
    titulo: 'Amortização Agricultura',
    composicaoOficialLabel: 'grupo_custo = "Amortizações", escopo = "agricultura"',
    ordemCentrosOficial: ORDEM_CENTROS_AMORTIZACAO_AGRICULTURA,
    agregaReal: agregaAmortizacaoAgriPorSubcentro,
    agregaMeta: agregaAmortizacaoAgriPorSubcentroMeta,
  },
  dividendos: {
    titulo: 'Dividendos',
    composicaoOficialLabel: 'grupo_custo = "Dividendos"',
    ordemCentrosOficial: ORDEM_CENTROS_DIVIDENDOS,
    agregaReal: agregaDividendosPorSubcentro,
    agregaMeta: agregaDividendosPorSubcentroMeta,
  },
  // Deduções: natureza='despesa' forçada via fix do helper inferirNaturezaLinha
  // no LinhaExecutivaExecutivoModal.tsx (PR4). Real MAIOR que Meta = ruim
  // (vermelho); Real MENOR = bom (verde). Comportamento de despesa pura.
  deducoesReceita: {
    titulo: 'Deduções de Receita',
    composicaoOficialLabel: 'grupo_custo = "Deduções de Receitas"',
    ordemCentrosOficial: ORDEM_CENTROS_DEDUCOES_RECEITA,
    agregaReal: agregaDeducoesPorSubcentro,
    agregaMeta: agregaDeducoesPorSubcentroMeta,
  },
};

export default function V2FechamentoPeriodo({ periodo, onPeriodoChange }: Props) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal, fazendasComPecuaria } = useFazenda();

  const clienteId = clienteAtual?.id;

  // Carrega lista de meses P1 fechados (cliente inteiro) para calcular default.
  // Paginação obrigatória: Supabase REST limita 1000 linhas por chamada e
  // fechamento_pastos pode ter milhares de linhas (1 por pasto × mês).
  const statusPilDefault = useQuery<StatusPilarMensal[]>({
    queryKey: ['default-period-pilares', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const todos: Array<{ fazenda_id: string; ano_mes: string }> = [];
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await (supabase
          .from('fechamento_pastos')
          .select('fazenda_id, ano_mes') as any)
          .eq('cliente_id', clienteId!)
          .eq('status', 'fechado')
          .order('ano_mes', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        todos.push(...(data as Array<{ fazenda_id: string; ano_mes: string }>));
        if (data.length < PAGE) break;
        offset += PAGE;
        if (offset > 50000) break; // safeguard contra loop infinito
      }
      return todos.map(r => ({
        fazenda_id: r.fazenda_id,
        ano_mes: r.ano_mes,
        p1_oficial: true,
        p2_oficial: false,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (periodo.periodoInicio) return;
    if (!statusPilDefault.data) return;
    const fids = (fazendasComPecuaria ?? []).map(f => f.id);
    const d = calcularDefaultPeriodo(statusPilDefault.data, fids);
    onPeriodoChange(d);
  }, [statusPilDefault.data, fazendasComPecuaria, periodo.periodoInicio, onPeriodoChange]);

  const { dto, loading, error } = useFechamentoPeriodoData({
    periodoInicio: periodo.periodoInicio,
    periodoFim: periodo.periodoFim,
  });

  // Marco 2.5 Fase 1: deriva ano/mesAlvo/modo do range do HeaderFiltro.
  // Fase 1: modo='acumulado' = Jan→mesAlvo. Range arbitrário (Mar→Jun)
  // não suportado pelo builder — usuário usa periodoInicio=periodoFim para "no mês".
  const ano = periodo.periodoFim
    ? Number(periodo.periodoFim.substring(0, 4)) || new Date().getFullYear()
    : new Date().getFullYear();
  const mesAlvo = periodo.periodoFim ? Number(periodo.periodoFim.substring(5, 7)) : 12;
  const modo: 'no-mes' | 'acumulado' =
    periodo.periodoInicio && periodo.periodoInicio === periodo.periodoFim ? 'no-mes' : 'acumulado';

  // PC-100 Jan→mesAlvo + comparativos ano-1. mes=mesAlvo é crítico:
  // controla indicador.valor e deltas (séries serieAno/serieAnoAnt/serieMeta
  // são as mesmas independente de mes). Mes=12 hardcoded envenenava
  // GMD (÷365 em vez de ÷dias-do-período), UA/ha (rollingAvg NaN-propaga
  // a partir de meses futuros), Valor Rebanho (foto Dez sem snapshot) e
  // Rebanho Médio (filter de NaN contaminado por mês parcial em curso).
  const painel = usePainelConsultorData({
    ano,
    mes: mesAlvo,
    viewMode: 'periodo',
    carregarMeta: true,
    incluirComparativos: true,
    preservarMetaQuandoGlobalIncompleto: true,
  });

  // Planejamento financeiro do ano (grid META + saldo inicial + extras).
  const planFin = usePlanejamentoFinanceiro(ano, isGlobal ? undefined : fazendaAtual?.id);
  const grid = useMemo(() => planFin.buildGrid(), [planFin.buildGrid, planFin.loading]);

  // Grid META consolidado (base + 4 maps de extras: rebanho/financiamento/
  // nutrição/projetos). Necessário para o BlocoResumoExecutivo computar Meta
  // com todas as fontes auto — sem isso, Custeio Pec/Receita Pec/Investimentos
  // /Amortizações META ficam subestimados (caso do bug detectado em NJ Pureza
  // 2026). Espelho exato do padrão de V2PlanejamentoVisaoGeral.
  const gridMetaConsolidado = useMemo(
    () => composeGridMetaConsolidado(planFin.gridMeta2026, {
      lancamentosRebanho: planFin.lancamentosRebanho,
      lancamentosFinanciamento: planFin.lancamentosFinanciamento,
      lancamentosNutricao: planFin.lancamentosNutricao,
      lancamentosProjetos: planFin.lancamentosProjetos,
    }),
    [
      planFin.gridMeta2026,
      planFin.lancamentosRebanho,
      planFin.lancamentosFinanciamento,
      planFin.lancamentosNutricao,
      planFin.lancamentosProjetos,
    ],
  );

  // financeiro_lancamentos_v2 ano-1 e ano-corrente (REAL).
  const [lancFinAnoAnt, setLancFinAnoAnt] = useState<FinanceiroLancamento[] | null>(null);
  const [lancFinAnoCorrente, setLancFinAnoCorrente] = useState<FinanceiroLancamento[] | null>(null);
  useEffect(() => {
    if (!clienteId || !ano) {
      setLancFinAnoAnt(null);
      setLancFinAnoCorrente(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const [rowsAnt, rowsCorr] = await Promise.all([
          carregarLancFinAnoAntReal(
            { clienteId, fazendaId: isGlobal ? undefined : fazendaAtual?.id, ano },
            supabase,
          ),
          carregarLancFinAnoCorrenteReal(
            { clienteId, fazendaId: isGlobal ? undefined : fazendaAtual?.id, ano },
            supabase,
          ),
        ]);
        if (!cancelado) {
          setLancFinAnoAnt(rowsAnt);
          setLancFinAnoCorrente(rowsCorr);
        }
      } catch (e) {
        if (!cancelado) {
          console.error('[V2FechamentoPeriodo] erro ao carregar financeiro_lancamentos_v2:', e);
          setLancFinAnoAnt(null);
          setLancFinAnoCorrente(null);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [clienteId, ano, isGlobal, fazendaAtual?.id]);

  // ZootComp: 6 agregações (3 ano META + 3 ano-1 REALIZADO).
  const [zootComp, setZootComp] = useState<ZootCompPreload | null>(null);
  useEffect(() => {
    if (!clienteId || !ano) {
      setZootComp(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const [
          receitaPec, deducoes, reposicaoBovinos,
          receitaPecAnoAnt, deducoesAnoAnt, reposicaoBovinosAnoAnt,
        ] = await Promise.all([
          agregaReceitaPecZootComp({ clienteId, ano, cenario: 'meta' }, supabase),
          agregaDeducoesZootComp({ clienteId, ano, cenario: 'meta' }, supabase),
          agregaReposicaoBovinosZootComp({ clienteId, ano, cenario: 'meta' }, supabase),
          agregaReceitaPecZootComp({ clienteId, ano: ano - 1, cenario: 'realizado' }, supabase),
          agregaDeducoesZootComp({ clienteId, ano: ano - 1, cenario: 'realizado' }, supabase),
          agregaReposicaoBovinosZootComp({ clienteId, ano: ano - 1, cenario: 'realizado' }, supabase),
        ]);
        if (!cancelado) {
          setZootComp({
            receitaPec, deducoes, reposicaoBovinos,
            receitaPecAnoAnt, deducoesAnoAnt, reposicaoBovinosAnoAnt,
          });
        }
      } catch (e) {
        if (!cancelado) {
          console.error('[V2FechamentoPeriodo] erro agregadosZootCompetencia:', e);
          setZootComp(null);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [clienteId, ano]);

  // Monta DTO do Planejamento com mesAlvo/modo/lancFinAnoCorrente — habilita
  // 3 colunas (Real ano-1 / Real ano / Meta) no BlocoAnaliseEconomica.
  const dtoPlanejamento = useMemo(() => buildPlanejamentoVisaoGeralData({
    ano,
    mesAtual: mesAlvo,
    escopo: isGlobal ? 'global' : 'fazenda',
    fazendaId: isGlobal ? undefined : fazendaAtual?.id,
    fazendaNome: isGlobal ? undefined : fazendaAtual?.nome,
    painel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    grid: grid as any,
    saldoInicial: planFin.saldoInicial,
    extrasGrid: {
      lancamentosRebanho: planFin.lancamentosRebanho,
      lancamentosFinanciamento: planFin.lancamentosFinanciamento,
      lancamentosNutricao: planFin.lancamentosNutricao,
      lancamentosProjetos: planFin.lancamentosProjetos,
    },
    zootComp: zootComp ?? undefined,
    lancFinAnoAnt: lancFinAnoAnt ?? undefined,
    lancFinAnoCorrente: lancFinAnoCorrente ?? undefined,
    mesAlvo,
    modo,
  }), [
    ano, mesAlvo, modo, isGlobal, fazendaAtual?.id, fazendaAtual?.nome,
    painel, grid, planFin.saldoInicial,
    planFin.lancamentosRebanho, planFin.lancamentosFinanciamento,
    planFin.lancamentosNutricao, planFin.lancamentosProjetos,
    zootComp, lancFinAnoAnt, lancFinAnoCorrente,
  ]);

  // Marco 2.5 Fase 1 — BlocoResumoExecutivo renderizado em paralelo a
  // FluxoCaixa (legado). Reutiliza dados já carregados (lancFinAnoAnt + grid
  // + planFin.saldoInicial). Substituição oficial do FluxoCaixa fica para
  // após validação cruzada (entradas/saídas/caixa devem bater com renderer
  // antigo dentro da tolerância R$ 1).
  const blocoResumoData = useMemo(() => {
    if (!lancFinAnoAnt || !gridMetaConsolidado) return null;
    return buildBlocoResumoExecutivo({
      lancFin2025: lancFinAnoAnt,
      gridMeta2026: gridMetaConsolidado,
      saldoInicialMeta: planFin.saldoInicial,
      caixaSaldoAnoAntMensal: painel.caixaIndicador?.serieAnoAnt?.slice(1),
      caixaSaldoAnoCorrenteMensal: painel.caixaIndicador?.serieAno?.slice(1),
      lancFin2026: lancFinAnoCorrente ?? undefined,
      mesAlvo,
    });
  }, [lancFinAnoAnt, lancFinAnoCorrente, gridMetaConsolidado, planFin.saldoInicial, painel.caixaIndicador?.serieAnoAnt, painel.caixaIndicador?.serieAno, mesAlvo]);

  const saldoInicialReal = painel.caixaIndicador?.serieAnoAnt?.[0] ?? NaN;

  // Marco 2.5 Fase 1 — Bloco Produção Pecuária Realizada: consome PC-100
  // (viewMode='periodo') direto, sem queries novas. Index 1-based: builder
  // usa indicador.valor (já indexado) e serieMeta/serieAnoAnt[mesAlvo].
  const blocoProducaoRealizada = useMemo(
    () => buildProducaoRealizadaData(painel, mesAlvo),
    [painel, mesAlvo],
  );

  // Modal Fluxo de Caixa Realizado (Camada 3 / FASE 1).
  const [fluxoModalOpen, setFluxoModalOpen] = useState(false);

  // Modal executivo de linha (FASE 2 / PR1 — drill Receita Pec por CAIXA).
  // Demais linhas (Custeio, Juros, Inv, etc) virão em PRs subsequentes —
  // basta adicionar a entrada correspondente em CONFIG_MODAIS_LINHA_FECHAMENTO.
  const [modalLinha, setModalLinha] = useState<LinhaModalKey | null>(null);
  const cfgModalAtivo = modalLinha ? CONFIG_MODAIS_LINHA_FECHAMENTO[modalLinha] : null;
  // Helper local: BlocoResumoExecutivoData não é indexável por LinhaModalKey
  // diretamente (TSC reclama de signature). Cast (as any) ISOLADO aqui — NÃO
  // mexer em types globais (linhaExecutivaModalTypes / blocoResumoExecutivoTypes
  // estão proibidos de modificar nesta PR).
  const linhaAtiva: LinhaExecutiva | null = (modalLinha && blocoResumoData)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((blocoResumoData as any)[modalLinha] ?? null)
    : null;

  const dadosModalLinha = useMemo(() => {
    if (!cfgModalAtivo || !linhaAtiva || !lancFinAnoCorrente) return null;
    return buildLinhaExecutivaModalData({
      linha: linhaAtiva,
      porSubcentroReal: cfgModalAtivo.agregaReal(lancFinAnoCorrente, ano),
      porSubcentroMeta: cfgModalAtivo.agregaMeta(gridMetaConsolidado),
      ordemCentrosOficial: cfgModalAtivo.ordemCentrosOficial,
      mesAlvo,
      modo: 'fechamento',
    });
  }, [cfgModalAtivo, linhaAtiva, lancFinAnoCorrente, ano, gridMetaConsolidado, mesAlvo]);

  if (!periodo.periodoInicio) {
    return <div className="p-4 text-sm text-muted-foreground">Carregando filtros…</div>;
  }

  const nomeFazenda = isGlobal ? 'Global' : (fazendaAtual?.nome ?? '—');

  return (
    <div className="fechamento-container px-4 py-4">
      {/* Marco 2.5: Capa Executiva no topo — Resumo Executivo via PC-100
          soberano. Precede os 3 blocos operacionais (Produção → DRE → Caixa). */}
      {dto && (
        <Capa
          dto={dto}
          nomeCliente={clienteAtual?.nome}
          nomeFazenda={nomeFazenda}
          painel={painel}
        />
      )}

      {/* Marco 2.5 Fase 1: BlocoAnaliseEconomica do Planejamento renderizado
          em paralelo a EvolucaoOperacao para comparação visual. mostrarAnoCorrente=true
          ativa as 7 colunas (Real ano-1 / Real ano / Meta + 2 deltas). */}
      <BlocoAnaliseEconomica
        data={dtoPlanejamento.bloco3_analiseEconomica}
        desfocar={false}
        ano={ano}
        mostrarAnoCorrente={true}
      />

      {/* Marco 2.5 Fase 1: BlocoResumoExecutivo renderizado em paralelo a
          FluxoCaixa (legado). Validação cruzada de entradas/saídas/caixa
          pendente — FluxoCaixa continua sendo a fonte soberana até confirmar
          paridade. */}
      {blocoResumoData && (
        <BlocoResumoExecutivo
          data={blocoResumoData}
          saldoInicialMeta={planFin.saldoInicial}
          saldoInicialReal={saldoInicialReal}
          desfocarDashboard={false}
          modo="fechamento"
          mesAlvo={mesAlvo}
          onAnalisarFluxo={isGlobal ? () => setFluxoModalOpen(true) : undefined}
          motivoFluxoBloqueado={
            !isGlobal
              ? 'Análise indisponível nesta visão. O caixa é consolidado por cliente. Selecione "Global" para analisar.'
              : undefined
          }
          // FASE 2 / PR1: drill em linhas configuradas. Hoje só Receita Pec
          // ativa. Outras linhas (custeio, juros, etc) NÃO disparam modal
          // nesta PR — clique sem config é no-op. Apenas em modo Global
          // (mesmo motivo da trava do FluxoCaixaModal: caixa cliente-wide).
          onLinhaClick={
            isGlobal
              ? (key) => {
                  if (CONFIG_MODAIS_LINHA_FECHAMENTO[key]) {
                    setModalLinha(key);
                  }
                }
              : undefined
          }
        />
      )}

      {/* FASE 3 / PR3.1 — Movimentações do Rebanho */}
      <BlocoMovimentacoesRebanhoFechamento ano={ano} mes={mesAlvo} isGlobal={isGlobal} />

      {/* Marco 2.5 Fase 1: Bloco Produção Pecuária Realizada — movido para
          após Movimentações conforme decisão FASE 3 (Capa → DRE → Fluxo →
          Movimentações → Produção). */}
      <BlocoProducaoPecuariaRealizada data={blocoProducaoRealizada} />

      {isGlobal && clienteId && (
        <FluxoCaixaModal
          open={fluxoModalOpen}
          onClose={() => setFluxoModalOpen(false)}
          clienteId={clienteId}
          ano={ano}
          mesAlvo={mesAlvo}
          painel={painel}
          saldoInicialMeta={planFin.saldoInicial}
          gridMetaConsolidado={gridMetaConsolidado}
          isContextoIndividual={false}
        />
      )}

      {/* FASE 2 / PR1 — Modal executivo de drill da Receita Pec (CAIXA). */}
      {modalLinha && cfgModalAtivo && dadosModalLinha && (
        <LinhaExecutivaExecutivoModal
          open={true}
          onOpenChange={(o) => { if (!o) setModalLinha(null); }}
          data={dadosModalLinha}
          titulo={cfgModalAtivo.titulo}
          composicaoOficialLabel={cfgModalAtivo.composicaoOficialLabel}
          onVerDetalhes={undefined}
          modo="fechamento"
          mesAlvo={mesAlvo}
        />
      )}

      {loading && (
        <div className="p-4 text-sm text-muted-foreground">Carregando dados do fechamento…</div>
      )}
      {error && (
        <div className="p-4 text-sm text-red-600">Erro: {String((error as Error)?.message ?? error)}</div>
      )}

      {dto && (
        <div className="fechamento-print-area">
          <EvolucaoOperacao dto={dto} />
          <AnaliseZootecnica dto={dto} />
          <FluxoCaixa dto={dto} />
          <DesembolsoProducao dto={dto} />
          <ResumoGlobal dto={dto} />
        </div>
      )}
    </div>
  );
}
