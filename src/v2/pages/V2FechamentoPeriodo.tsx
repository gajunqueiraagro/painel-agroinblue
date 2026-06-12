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

import { useState, useEffect, useMemo, useRef, useLayoutEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Download } from 'lucide-react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { exportFechamentoPeriodoPdf } from '@/lib/pdf/exportFechamentoPeriodoPdf';
import { montarSubtituloBoletim } from './V2FechamentoPeriodo.parts/fmt';
import { useFechamentoPeriodoData } from '@/v2/hooks/useFechamentoPeriodoData';
import { calcularDefaultPeriodo } from '@/v2/lib/calcularDefaultPeriodo';
import type { StatusPilarMensal } from '@/v2/types/fechamentoPeriodo';
import Capa from './V2FechamentoPeriodo.parts/Capa';
import AnaliseZootecnica from './V2FechamentoPeriodo.parts/AnaliseZootecnica';
import DesembolsoProducao from './V2FechamentoPeriodo.parts/DesembolsoProducao';
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
import { BlocoConferenciaMensalRebanhoFechamento } from './V2FechamentoPeriodo.parts/BlocoConferenciaMensalRebanhoFechamento';
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

// PR-BOLETIM-1 FASE 1A — wrapper de altura padrão (499px) para os blocos do
// Fechamento. A medição de overflow (ResizeObserver + badge) é DIAGNÓSTICO
// TEMPORÁRIO da 1A. A 1B fará cada bloco caber em 499px; depois disso este
// scaffolding é removido. CSS em @media screen → impressão/PDF intocados.
function BlocoPadrao({ nome, children }: { nome: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [excesso, setExcesso] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setExcesso(Math.max(0, el.scrollHeight - 499));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // deps vazias — medição via ResizeObserver
  return (
    <div ref={ref} className="bloco-padrao-fechamento" data-overflow={excesso > 0}>
      {children}
      {excesso > 0 && (
        <div className="bloco-padrao-overflow-badge">▼ {nome}: +{excesso}px</div>
      )}
    </div>
  );
}

// PR-BOLETIM-1B — página editorial: agrupa 2 BlocoPadrao (grade 10×2).
function PaginaBoletim({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="pagina-boletim flex flex-col gap-4" data-pagina={n}>
      {children}
    </div>
  );
}

// PR-BOLETIM-1B — placeholder "Em construção" que preenche os 499px do BlocoPadrao.
function BlocoEmConstrucao({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center
                    rounded-lg border border-dashed border-border bg-muted/30
                    text-muted-foreground p-6">
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">🚧 Em construção</span>
      <h3 className="text-sm font-semibold text-foreground/70">{titulo}</h3>
      {descricao && <p className="text-xs max-w-[80%] leading-snug">{descricao}</p>}
    </div>
  );
}

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
          receitaPecAnoCorrente,
          reposicaoBovinosAnoCorrente,
        ] = await Promise.all([
          agregaReceitaPecZootComp({ clienteId, ano, cenario: 'meta' }, supabase),
          agregaDeducoesZootComp({ clienteId, ano, cenario: 'meta' }, supabase),
          agregaReposicaoBovinosZootComp({ clienteId, ano, cenario: 'meta' }, supabase),
          agregaReceitaPecZootComp({ clienteId, ano: ano - 1, cenario: 'realizado' }, supabase),
          agregaDeducoesZootComp({ clienteId, ano: ano - 1, cenario: 'realizado' }, supabase),
          agregaReposicaoBovinosZootComp({ clienteId, ano: ano - 1, cenario: 'realizado' }, supabase),
          // Receita Pec realizada do ano corrente por competência zoot — fonte
          // soberana da DRE Receita Pecuária. Regra Gabriel: DRE pecuária NÃO
          // vem do financeiro.
          agregaReceitaPecZootComp({ clienteId, ano, cenario: 'realizado' }, supabase),
          // Reposição Bovinos realizada do ano corrente por competência zoot —
          // fonte soberana da DRE Reposição (lancamentos tipo='compra'). Sem
          // fallback financeiro.
          agregaReposicaoBovinosZootComp({ clienteId, ano, cenario: 'realizado' }, supabase),
        ]);
        if (!cancelado) {
          setZootComp({
            receitaPec, deducoes, reposicaoBovinos,
            receitaPecAnoAnt, deducoesAnoAnt, reposicaoBovinosAnoAnt,
            receitaPecAnoCorrente,
            reposicaoBovinosAnoCorrente,
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

  // Subtítulo de identificação ÚNICO do boletim — calculado 1x e distribuído
  // aos blocos (Capa, Produção, …). Fonte única; nenhum bloco monta texto próprio.
  const subtituloPadrao = dto
    ? montarSubtituloBoletim({ dto, nomeCliente: clienteAtual?.nome, nomeFazenda, painel })
    : '';

  // fmtBRL — cópia fiel do formatador da tela (BlocoResumoExecutivo) p/ paridade.
  const fmtBRL = (v: number): string =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(v);

  // Export programático (PR-PDF-2) — coexiste com window.print. Cards = REAL
  // do período (realAnoCorrente), iguais à coluna REAL <ano> da tela.
  const handleExportarPdf = async () => {
    if (!blocoResumoData) return;
    const kpis = [
      { label: 'Total Entradas',    valor: fmtBRL(blocoResumoData.totalEntradas.realAnoCorrente ?? 0) },
      { label: 'Total Saídas',      valor: fmtBRL(blocoResumoData.totalSaidas.realAnoCorrente ?? 0) },
      { label: 'Saldo Caixa Final', valor: fmtBRL(blocoResumoData.saldoCaixaFinalReal ?? 0) },
    ];
    await exportFechamentoPeriodoPdf({
      clienteNome: clienteAtual?.nome ?? '',
      fazendaNome: isGlobal ? 'Global' : nomeFazenda,
      periodoLabel: String(ano),
      cenarioLabel: isGlobal ? 'Global • Realizado' : `${nomeFazenda} • Realizado`,
      kpis,
    });
  };

  return (
    <div className="fechamento-container px-4 py-4">
      {/* PR-PDF-2: export programático — fora do print (.no-print). */}
      <div className="no-print mb-3 flex justify-end">
        <button
          type="button"
          onClick={handleExportarPdf}
          disabled={!blocoResumoData}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          Exportar PDF
        </button>
      </div>
      {/* ── PR-BOLETIM-1B: grade editorial oficial — 10 páginas × 2 blocos.
          Reais reordenados (guards e className print-* preservados) + 12
          placeholders "Em construção". .fechamento-print-area descartado. ── */}
      <PaginaBoletim n={1}>
        <div className="print-section"><BlocoPadrao nome="Capa">
          <BlocoEmConstrucao titulo="Capa" descricao="Capa institucional do boletim — a construir." />
        </BlocoPadrao></div>
        {dto && (
          <div className="print-section">
            <Capa
              dto={dto}
              painel={painel}
              subtitulo={subtituloPadrao}
            />
          </div>
        )}
      </PaginaBoletim>

      <PaginaBoletim n={2}>
        <div className="print-section print-page-break">
          <BlocoProducaoPecuariaRealizada data={blocoProducaoRealizada} subtitulo={subtituloPadrao} />
        </div>
        <div className="print-section">
          <BlocoConferenciaMensalRebanhoFechamento
            ano={ano}
            mes={mesAlvo}
            viewMode={modo === 'no-mes' ? 'mes' : 'periodo'}
            isGlobal={isGlobal}
            subtitulo={subtituloPadrao}
          />
        </div>
      </PaginaBoletim>

      <PaginaBoletim n={3}>
        <div className="print-section print-page-break"><BlocoPadrao nome="Movimentações do Rebanho">
          <BlocoMovimentacoesRebanhoFechamento
            ano={ano}
            mes={mesAlvo}
            viewMode={modo === 'no-mes' ? 'mes' : 'periodo'}
            isGlobal={isGlobal}
          />
        </BlocoPadrao></div>
        <div className="print-section"><BlocoPadrao nome="Gráficos de Movimentações">
          <BlocoEmConstrucao titulo="Gráficos de Movimentações" descricao="Futuro: preço de venda, custo de produção e GMD explicado." />
        </BlocoPadrao></div>
      </PaginaBoletim>

      <PaginaBoletim n={4}>
        {dto && (
          <div className="print-section"><BlocoPadrao nome="Análise Zootécnica">
            <AnaliseZootecnica dto={dto} gmdSoberano={painel.gmdIndicador?.valor ?? null} />
          </BlocoPadrao></div>
        )}
        <div className="print-section"><BlocoPadrao nome="Bloco complementar zootécnico">
          <BlocoEmConstrucao titulo="Complementar zootécnico" descricao="A definir." />
        </BlocoPadrao></div>
      </PaginaBoletim>

      <PaginaBoletim n={5}>
        <div className="print-section print-page-break"><BlocoPadrao nome="DRE">
          <BlocoAnaliseEconomica
            data={dtoPlanejamento.bloco3_analiseEconomica}
            desfocar={false}
            ano={ano}
            mostrarAnoCorrente={true}
          />
        </BlocoPadrao></div>
        <div className="print-section"><BlocoPadrao nome="Gráficos operação / comparação histórica">
          <BlocoEmConstrucao titulo="Gráficos de operação / histórico" descricao="A construir." />
        </BlocoPadrao></div>
      </PaginaBoletim>

      <PaginaBoletim n={6}>
        {blocoResumoData && (
          <div className="print-section print-page-break"><BlocoPadrao nome="Fluxo de Caixa">
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
          </BlocoPadrao></div>
        )}
        <div className="print-section"><BlocoPadrao nome="Entradas e Saídas (gráfico de pizza)">
          <BlocoEmConstrucao titulo="Entradas e Saídas (pizza)" descricao="Conteúdo já existe embutido no bloco Fluxo de Caixa; extração para bloco próprio fica para a fase de conteúdo." />
        </BlocoPadrao></div>
      </PaginaBoletim>

      <PaginaBoletim n={7}>
        {dto && (
          <div className="print-section print-page-break print-allow-break"><BlocoPadrao nome="Custos Pecuários Realizados">
            <DesembolsoProducao
              dto={dto}
              custoCab={painel.custoCabIndicador?.valor ?? null}
              custoArr={painel.custoArrIndicador?.valor ?? null}
              custeioAcum={painel.custeioPecIndicador?.valor ?? null}
              custoCabSerieMes={painel.custoCabIndicador?.serieMensal ?? []}
              custoCabSerieAcum={painel.custoCabIndicador?.serieAno ?? []}
              custoCabSerieMeta={painel.custoCabIndicador?.serieMeta}
              custoCabSerieAnoAnt={painel.custoCabIndicador?.serieAnoAnt}
              custoCabDeltaMeta={painel.custoCabIndicador?.deltaMeta ?? null}
              custoCabDeltaAno={painel.custoCabIndicador?.deltaAno ?? null}
              custoArrSerieMes={painel.custoArrIndicador?.serieMensal ?? []}
              custoArrSerieAcum={painel.custoArrIndicador?.serieAno ?? []}
              custoArrSerieMeta={painel.custoArrIndicador?.serieMeta}
              custoArrSerieAnoAnt={painel.custoArrIndicador?.serieAnoAnt}
              custoArrDeltaMeta={painel.custoArrIndicador?.deltaMeta ?? null}
              custoArrDeltaAno={painel.custoArrIndicador?.deltaAno ?? null}
              custeioSerieAcum={painel.custeioPecIndicador?.serieAno ?? []}
              custeioSerieMeta={painel.custeioPecIndicador?.serieMeta}
              custeioSerieAnoAnt={painel.custeioPecIndicador?.serieAnoAnt}
              custeioDeltaMeta={painel.custeioPecIndicador?.deltaMeta ?? null}
              custeioDeltaAno={painel.custeioPecIndicador?.deltaAno ?? null}
              mesAlvoIdx={mesAlvo}
              labelsMeses={dto.meses}
              numMeses={dto.meses.length}
              rebanhoMedioReal={painel.cabecasIndicador?.valor ?? null}
              rebanhoMedioMeta={painel.cabecasIndicador?.serieMetaIndicador?.[mesAlvo] ?? null}
            />
          </BlocoPadrao></div>
        )}
        <div className="print-section"><BlocoPadrao nome="Gráficos e históricos de custos">
          <BlocoEmConstrucao titulo="Gráficos e históricos de custos" descricao="A construir." />
        </BlocoPadrao></div>
      </PaginaBoletim>

      <PaginaBoletim n={8}>
        <div className="print-section"><BlocoPadrao nome="Custos Fixos R$/cab/mês (benchmark)">
          <BlocoEmConstrucao titulo="Custos Fixos R$/cab/mês" descricao="Com benchmark — a construir." />
        </BlocoPadrao></div>
        <div className="print-section"><BlocoPadrao nome="Custos Variáveis R$/cab/mês (benchmark)">
          <BlocoEmConstrucao titulo="Custos Variáveis R$/cab/mês" descricao="Com benchmark — a construir." />
        </BlocoPadrao></div>
      </PaginaBoletim>

      <PaginaBoletim n={9}>
        <div className="print-section"><BlocoPadrao nome="Financiamentos e Aportes Pessoais">
          <BlocoEmConstrucao titulo="Financiamentos e Aportes Pessoais" descricao="A construir." />
        </BlocoPadrao></div>
        <div className="print-section"><BlocoPadrao nome="Gráficos financeiros">
          <BlocoEmConstrucao titulo="Gráficos financeiros" descricao="A construir." />
        </BlocoPadrao></div>
      </PaginaBoletim>

      <PaginaBoletim n={10}>
        <div className="print-section"><BlocoPadrao nome="Evolução Patrimonial">
          <BlocoEmConstrucao titulo="Evolução Patrimonial" descricao="Caixa, rebanho e endividamento — a construir." />
        </BlocoPadrao></div>
        <div className="print-section"><BlocoPadrao nome="Gráficos patrimoniais">
          <BlocoEmConstrucao titulo="Gráficos patrimoniais" descricao="A construir." />
        </BlocoPadrao></div>
      </PaginaBoletim>

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
    </div>
  );
}
