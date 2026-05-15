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

import { useMemo } from 'react';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import { usePlanejamentoFinanceiro } from '@/hooks/usePlanejamentoFinanceiro';
import { useFazenda } from '@/contexts/FazendaContext';
import { V2PageContent } from '@/v2/components/V2PageShell';
import { buildPlanejamentoVisaoGeralData } from '@/v2/lib/buildPlanejamentoVisaoGeralData';
import { buildBlocoResumoExecutivo } from '@/v2/lib/buildBlocoResumoExecutivo';
import { BlocoResumoExecutivo } from './V2PlanejamentoVisaoGeral.parts/BlocoResumoExecutivo';
import { BlocoProducaoPecuaria } from './V2PlanejamentoVisaoGeral.parts/BlocoProducaoPecuaria';
import { BlocoEstruturaCustos } from './V2PlanejamentoVisaoGeral.parts/BlocoEstruturaCustos';
import { BlocoFinanceiroCapital } from './V2PlanejamentoVisaoGeral.parts/BlocoFinanceiroCapital';
import { BlocoMovimentacaoRebanho } from './V2PlanejamentoVisaoGeral.parts/BlocoMovimentacaoRebanho';

interface Props {
  ano: number;
  mes: number;
}

export function V2PlanejamentoVisaoGeral({ ano, mes }: Props) {
  const { fazendaAtual, isGlobal } = useFazenda();

  // PC-100 anual META + comparativos ano-1 internos
  const painel = usePainelConsultorData({
    ano,
    mes: 12,
    viewMode: 'periodo',
    carregarMeta: true,
    incluirComparativos: true,
  });

  // Planejamento financeiro do ano (grid META + saldo inicial)
  const planFin = usePlanejamentoFinanceiro(ano, isGlobal ? undefined : fazendaAtual?.id);
  const grid = useMemo(() => planFin.buildGrid(), [planFin.buildGrid, planFin.loading]);

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
  }), [
    ano, mes, isGlobal, fazendaAtual?.id, fazendaAtual?.nome,
    painel, grid, planFin.saldoInicial,
    planFin.lancamentosRebanho, planFin.lancamentosFinanciamento,
    planFin.lancamentosNutricao, planFin.lancamentosProjetos,
  ]);

  // Bloco 1 MVP: META 2026 (planejamento_financeiro) vs Real 2025
  // (financeiro_lancamentos_v2). Fontes independentes do PC-100/buildPlanejamento.
  const dadosBloco1 = useMemo(() => {
    if (planFin.real2025Loading) return null;
    return buildBlocoResumoExecutivo(planFin.metaRowsRaw, planFin.real2025Rows);
  }, [planFin.metaRowsRaw, planFin.real2025Rows, planFin.real2025Loading]);

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

      <BlocoResumoExecutivo data={dadosBloco1} />
      <BlocoProducaoPecuaria data={dto.bloco2_producaoPecuaria} />
      <BlocoEstruturaCustos data={dto.bloco3_estruturaCustos} />
      <BlocoFinanceiroCapital data={dto.bloco4_financeiroCapital} />
      <BlocoMovimentacaoRebanho data={dto.bloco5_movimentacaoRebanho} />

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
