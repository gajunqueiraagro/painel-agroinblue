/**
 * V2PlanejamentoVisaoGeral.tsx
 *
 * Cockpit anual da Visão Geral Planejamento.
 *
 * Orquestra hooks (PC-100 anual META + planejamento_financeiro + saldo)
 * e chama buildPlanejamentoVisaoGeralData para produzir o DTO.
 *
 * Renderiza 5 sub-blocos. Zero cálculo aqui — toda lógica está em
 * buildPlanejamentoVisaoGeralData.
 */

import { useEffect, useMemo, useState } from 'react';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import { usePlanejamentoFinanceiro } from '@/hooks/usePlanejamentoFinanceiro';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { V2PageContent } from '@/v2/components/V2PageShell';
import { buildPlanejamentoVisaoGeralData, type ZootCompPreload } from '@/v2/lib/buildPlanejamentoVisaoGeralData';
import {
  agregaReceitaPecZootComp,
  agregaDeducoesZootComp,
  agregaReposicaoBovinosZootComp,
} from '@/lib/painelConsultor/agregadosZootCompetencia';
import { carregarLancFinAnoAntReal } from '@/lib/painelConsultor/lancFinHistoricoLoader';
import { buildBlocoResumoExecutivo } from '@/v2/lib/buildBlocoResumoExecutivo';
import { composeGridMetaConsolidado } from '@/lib/painelConsultor/composeGridMetaConsolidado';
import {
  type ComposicaoSubcentro,
  agregaReceitaPecPorSubcentro,
  agregaReceitaPecPorSubcentroMeta,
  agregaReceitaAgriPorSubcentro,
  agregaReceitaAgriPorSubcentroMeta,
  agregaOutrasReceitasPorSubcentro,
  agregaOutrasReceitasPorSubcentroMeta,
  agregaEntradasFinanceirasPorSubcentro,
  agregaEntradasFinanceirasPorSubcentroMeta,
  agregaCusteioPecPorSubcentro,
  agregaCusteioPecPorSubcentroMeta,
  agregaCusteioAgriPorSubcentro,
  agregaCusteioAgriPorSubcentroMeta,
  agregaJurosPecPorSubcentro,
  agregaJurosPecPorSubcentroMeta,
  agregaJurosAgriPorSubcentro,
  agregaJurosAgriPorSubcentroMeta,
  agregaInvFazendaPecPorSubcentro,
  agregaInvFazendaPecPorSubcentroMeta,
  agregaInvFazendaAgriPorSubcentro,
  agregaInvFazendaAgriPorSubcentroMeta,
  agregaInvBovinosPorSubcentro,
  agregaInvBovinosPorSubcentroMeta,
  agregaAmortizacaoPecPorSubcentro,
  agregaAmortizacaoPecPorSubcentroMeta,
  agregaAmortizacaoAgriPorSubcentro,
  agregaAmortizacaoAgriPorSubcentroMeta,
  agregaDividendosPorSubcentro,
  agregaDividendosPorSubcentroMeta,
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
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { buildLinhaExecutivaModalData } from '@/v2/lib/buildLinhaExecutivaModalData';
import { BlocoResumoExecutivo } from './V2PlanejamentoVisaoGeral.parts/BlocoResumoExecutivo';
import { LinhaExecutivaExecutivoModal } from './V2PlanejamentoVisaoGeral.parts/LinhaExecutivaExecutivoModal';

export type LinhaModalKey =
  | 'receitaPecuaria' | 'receitaAgricultura' | 'outrasReceitas' | 'entradasFinanceiras'
  | 'custeioPecuaria' | 'custeioAgricultura'
  | 'jurosPecuaria' | 'jurosAgricultura'
  | 'investimentoPecuaria' | 'investimentoAgricultura'
  | 'reposicaoBovinos'
  | 'amortizacaoPecuaria' | 'amortizacaoAgricultura'
  | 'dividendos' | 'deducoesReceita';

interface ConfigModalLinha {
  titulo: string;
  composicaoOficialLabel: string;
  ordemCentrosOficial: readonly string[];
  agregaReal: (lancFin: FinanceiroLancamento[], ano: number) => Record<string, ComposicaoSubcentro>;
  agregaMeta: (grid: SubcentroGrid[]) => Record<string, ComposicaoSubcentro>;
}

const CONFIG_MODAIS_LINHA: Record<LinhaModalKey, ConfigModalLinha> = {
  receitaPecuaria: {
    titulo: 'Receita Pecuária',
    composicaoOficialLabel: 'grupo_custo = "Receita Pecuária"',
    ordemCentrosOficial: ORDEM_CENTROS_RECEITA_PECUARIA,
    agregaReal: agregaReceitaPecPorSubcentro,
    agregaMeta: agregaReceitaPecPorSubcentroMeta,
  },
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
  entradasFinanceiras: {
    titulo: 'Entradas Financeiras',
    composicaoOficialLabel: 'grupo_custo = "Entradas de Capital"',
    ordemCentrosOficial: ORDEM_CENTROS_ENTRADAS_FINANCEIRAS,
    agregaReal: agregaEntradasFinanceirasPorSubcentro,
    agregaMeta: agregaEntradasFinanceirasPorSubcentroMeta,
  },
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
  deducoesReceita: {
    titulo: 'Deduções de Receita',
    composicaoOficialLabel: 'grupo_custo = "Deduções de Receitas"',
    ordemCentrosOficial: ORDEM_CENTROS_DEDUCOES_RECEITA,
    agregaReal: agregaDeducoesPorSubcentro,
    agregaMeta: agregaDeducoesPorSubcentroMeta,
  },
};
import { BlocoProducaoPecuaria } from './V2PlanejamentoVisaoGeral.parts/BlocoProducaoPecuaria';
import { BlocoEstruturaCustos } from './V2PlanejamentoVisaoGeral.parts/BlocoEstruturaCustos';
import { BlocoAnaliseEconomica } from './V2PlanejamentoVisaoGeral.parts/BlocoAnaliseEconomica';
import { BlocoFinanceiroCapital } from './V2PlanejamentoVisaoGeral.parts/BlocoFinanceiroCapital';
import { BlocoMovimentacaoRebanho } from './V2PlanejamentoVisaoGeral.parts/BlocoMovimentacaoRebanho';
import { BlocoRateioAdministrativo } from './V2PlanejamentoVisaoGeral.parts/BlocoRateioAdministrativo';

interface Props {
  ano: number;
  mes: number;
}

export function V2PlanejamentoVisaoGeral({ ano, mes }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  // Filtro atual da tela determina o layout. 3 modos:
  //   - Global:          layout completo (como hoje)
  //   - Administrativo:  fazenda sem pecuária (tem_pecuaria === false). Sem
  //                      Produção/Movimentação; Financeiro/Capital sobe.
  //   - Fazenda operacional: pecuária ativa. Sem Financeiro/Capital
  //                      (rateio cobre depois); mantém Produção/Movimentação.
  const isAdministrativo = !isGlobal && fazendaAtual?.tem_pecuaria === false;
  const isFazendaOperacional = !isGlobal && !isAdministrativo;
  // Gráfico de Fluxo + cards Saldo Caixa Final / Dif. Caixa: desfocados
  // em Administrativo e Fazenda operacional (escopo não-consolidado).
  const desfocarDashboard = !isGlobal;

  // PC-100 anual META + comparativos ano-1 internos.
  // preservarMetaQuandoGlobalIncompleto=true: o Bloco "Produção Pecuária" precisa
  // de séries META mesmo quando P1 do realizado não está fechado em todas as
  // fazendas pec do cliente. O flag NÃO altera proteção do PC-100 Realizado Global.
  const painel = usePainelConsultorData({
    ano,
    mes: 12,
    viewMode: 'periodo',
    carregarMeta: true,
    incluirComparativos: true,
    preservarMetaQuandoGlobalIncompleto: true,
  });

  // Planejamento financeiro do ano (grid META + saldo inicial)
  const planFin = usePlanejamentoFinanceiro(ano, isGlobal ? undefined : fazendaAtual?.id);
  const grid = useMemo(() => planFin.buildGrid(), [planFin.buildGrid, planFin.loading]);

  // Fase 2 DRE Planejamento — agregadores por COMPETÊNCIA ZOOT (data do
  // lançamento) para 3 linhas do Bloco 3 (Receita Pec, Deduções, Reposição
  // Bovinos). Carregados aqui em paralelo; passados ao builder via campo
  // opcional `zootComp` para manter buildPlanejamentoVisaoGeralData SYNC.
  // Loading inicial: zootComp=null → builder retorna valor=null nessas linhas.
  // Marco 1.1.E: 6 agregações em paralelo (3 ano META + 3 ano-1 REALIZADO).
  const [zootComp, setZootComp] = useState<ZootCompPreload | null>(null);

  // Marco 1.1.E — financeiro_lancamentos_v2 do ano FECHADO (ano - 1).
  // Carregado uma vez no caller; passado ao builder que aplica os agregadores
  // oficiais (agregaOutrasReceitas, agregaInvFazendaPec) sobre o array.
  // Camada de compatibilidade histórica REAL ano-1 — não toca META.
  const [lancFinAnoAnt, setLancFinAnoAnt] = useState<FinanceiroLancamento[] | null>(null);
  useEffect(() => {
    if (!clienteId || !ano) {
      setLancFinAnoAnt(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const rows = await carregarLancFinAnoAntReal(
          { clienteId, fazendaId: isGlobal ? undefined : fazendaAtual?.id, ano },
          supabase,
        );
        if (!cancelado) setLancFinAnoAnt(rows);
      } catch (e) {
        if (!cancelado) {
          console.error('[V2PVG] erro ao carregar financeiro_lancamentos_v2 ano-1:', e);
          setLancFinAnoAnt(null);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [clienteId, ano, isGlobal, fazendaAtual?.id]);
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
          console.error('[V2PVG] erro ao carregar agregadosZootCompetencia:', e);
          setZootComp(null);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [clienteId, ano]);

  // Monta DTO via camada oficial.
  // Marco 1.1.D: extrasGrid traz as 4 fontes que não entram em buildGrid()
  // mas integram o Fluxo de Caixa META (rebanho, financiamento, nutrição, projetos).
  const dto = useMemo(() => buildPlanejamentoVisaoGeralData({
    ano,
    mesAtual: mes,
    escopo: isGlobal ? 'global' : 'fazenda',
    fazendaId: isGlobal ? undefined : fazendaAtual?.id,
    fazendaNome: isGlobal ? undefined : fazendaAtual?.nome,
    painel,
    grid,
    saldoInicial: planFin.saldoInicial,
    extrasGrid: {
      lancamentosRebanho: planFin.lancamentosRebanho,
      lancamentosFinanciamento: planFin.lancamentosFinanciamento,
      lancamentosNutricao: planFin.lancamentosNutricao,
      lancamentosProjetos: planFin.lancamentosProjetos,
    },
    zootComp: zootComp ?? undefined,
    lancFinAnoAnt: lancFinAnoAnt ?? undefined,
  }), [
    ano, mes, isGlobal, fazendaAtual?.id, fazendaAtual?.nome,
    painel, grid, planFin.saldoInicial,
    planFin.lancamentosRebanho, planFin.lancamentosFinanciamento,
    planFin.lancamentosNutricao, planFin.lancamentosProjetos,
    zootComp,
    lancFinAnoAnt,
  ]);

  // Grid META consolidado: mesmo shape de gridMeta2026, mas com as 4 fontes
  // auto (rebanho/nutrição/financiamento/projetos) somadas ao ajuste manual.
  // Espelha exatamente o que a tela Fluxo de Caixa META já renderiza.
  // Fonte única — Bloco 1 vira espelho da tela oficial, sem reconstrução paralela.
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

  // Bloco 1: META 2026 (consolidado) vs Real 2025 (lancFin2025 via useFinanceiro).
  // Zero classificação aqui — builder delega tudo aos agregadores oficiais.
  // saldoInicialMeta vem do hook usePlanejamentoFinanceiro (Dez/N-1 oficial).
  // serieReal do gráfico = saldo bancário oficial do PC-100 (caixaIndicador.serieAnoAnt).
  const dadosBloco1 = useMemo(() => {
    if (planFin.lancFin2025Loading) return null;
    return buildBlocoResumoExecutivo({
      lancFin2025: planFin.lancFin2025,
      gridMeta2026: gridMetaConsolidado,
      saldoInicialMeta: planFin.saldoInicial,
      caixaSaldoAnoAntMensal: painel.caixaIndicador?.serieAnoAnt?.slice(1),
    });
  }, [planFin.lancFin2025, gridMetaConsolidado, planFin.lancFin2025Loading, planFin.saldoInicial, painel.caixaIndicador]);

  // Modal executivo genérico — qualquer linha do BlocoResumoExecutivo.
  // Config map por linha (titulo, composicao, ordem, agregadores) declarado
  // no topo do arquivo. Estado único: qual linha está aberta (ou null).
  const [modalLinha, setModalLinha] = useState<LinhaModalKey | null>(null);
  const cfgModalAtivo = modalLinha ? CONFIG_MODAIS_LINHA[modalLinha] : null;
  const linhaAtiva = (modalLinha && dadosBloco1) ? dadosBloco1[modalLinha] : null;
  const dadosModalLinha = useMemo(() => {
    if (!cfgModalAtivo || !linhaAtiva || planFin.lancFin2025Loading) return null;
    return buildLinhaExecutivaModalData({
      linha: linhaAtiva,
      porSubcentroReal: cfgModalAtivo.agregaReal(planFin.lancFin2025, 2025),
      porSubcentroMeta: cfgModalAtivo.agregaMeta(gridMetaConsolidado),
      ordemCentrosOficial: cfgModalAtivo.ordemCentrosOficial,
    });
  }, [cfgModalAtivo, linhaAtiva, planFin.lancFin2025, planFin.lancFin2025Loading, gridMetaConsolidado]);

  const loading = painel.loading || planFin.loading;

  // Gate estrito: enquanto qualquer fonte oficial está carregando, mostra
  // loading. Não renderizar DTO parcial — sem keep-previous, sem fallback.
  // Se loading=false e algum valor ainda vier null, é estado final legítimo
  // (dado realmente ausente) ou bug do PC-100/build a ser diagnosticado
  // separadamente, NÃO uma transição de loading que devamos mascarar.
  if (loading) {
    return (
      <V2PageContent>
        <header className="mb-4">
          <h1 className="text-xl font-bold text-foreground">Visão Geral Planejamento {ano}</h1>
          <p className="text-xs text-muted-foreground">
            {isGlobal ? 'Todas as fazendas' : `Fazenda: ${fazendaAtual?.nome ?? '—'}`}
          </p>
        </header>
        <div className="text-sm text-muted-foreground py-12 text-center">
          Carregando cockpit anual…
        </div>
      </V2PageContent>
    );
  }

  return (
    <V2PageContent>
      <header className="mb-4">
        <h1 className="text-xl font-bold text-foreground">Visão Geral Planejamento {ano}</h1>
        <p className="text-xs text-muted-foreground">
          {dto.escopo === 'global' ? 'Todas as fazendas' : `Fazenda: ${dto.fazendaNome ?? '—'}`}
          {' · '}
          META {ano} — anual planejado
        </p>
      </header>

      <BlocoResumoExecutivo
        data={dadosBloco1}
        saldoInicialMeta={planFin.saldoInicial}
        saldoInicialReal={painel.caixaIndicador?.serieAnoAnt?.[0] ?? NaN}
        desfocarDashboard={desfocarDashboard}
        onLinhaClick={(key) => setModalLinha(key)}
      />

      {modalLinha && cfgModalAtivo && dadosModalLinha && (
        <LinhaExecutivaExecutivoModal
          open={true}
          onOpenChange={(o) => { if (!o) setModalLinha(null); }}
          data={dadosModalLinha}
          titulo={cfgModalAtivo.titulo}
          composicaoOficialLabel={cfgModalAtivo.composicaoOficialLabel}
          // TODO: cabear onVerDetalhes em fase posterior — rota do
          // Financeiro V2 ainda não confirmada. Não inventar URL aqui.
          onVerDetalhes={undefined}
        />
      )}

      {/* Layout por filtro ────────────────────────────────────────────
          - Global:          Produção → Estrutura → Financeiro/Capital → Movimentação
          - Administrativo:  Estrutura → Financeiro/Capital (sobe) → Rateio Adm
          - Fazenda op.:     Produção → Estrutura → Movimentação → Rateio Adm */}
      {isAdministrativo ? (
        <>
          <BlocoAnaliseEconomica data={dto.bloco3_analiseEconomica} desfocar={!isGlobal} />
          <BlocoFinanceiroCapital data={dto.bloco4_financeiroCapital} />
          <BlocoRateioAdministrativo />
        </>
      ) : isFazendaOperacional ? (
        <>
          <BlocoProducaoPecuaria data={dto.bloco2_producaoPecuaria} />
          <BlocoAnaliseEconomica data={dto.bloco3_analiseEconomica} desfocar={!isGlobal} />
          <BlocoMovimentacaoRebanho data={dto.bloco5_movimentacaoRebanho} />
          <BlocoRateioAdministrativo />
        </>
      ) : (
        <>
          <BlocoProducaoPecuaria data={dto.bloco2_producaoPecuaria} />
          <BlocoAnaliseEconomica data={dto.bloco3_analiseEconomica} desfocar={!isGlobal} />
          <BlocoFinanceiroCapital data={dto.bloco4_financeiroCapital} />
          <BlocoMovimentacaoRebanho data={dto.bloco5_movimentacaoRebanho} />
        </>
      )}

      {dto.warnings.length > 0 && (
        <details className="mt-4 text-[10px] text-muted-foreground/70 px-2">
          <summary className="cursor-pointer select-none">
            {dto.warnings.length} aviso(s) de implementação parcial
          </summary>
          <ul className="mt-2 space-y-1 pl-3 list-disc">
            {dto.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </details>
      )}
    </V2PageContent>
  );
}
