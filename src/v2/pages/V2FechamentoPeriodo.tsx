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
import HeaderFiltro from './V2FechamentoPeriodo.parts/HeaderFiltro';
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
import { buildBlocoResumoExecutivo } from '@/v2/lib/buildBlocoResumoExecutivo';
import { composeGridMetaConsolidado } from '@/lib/painelConsultor/composeGridMetaConsolidado';
import { carregarLancFinAnoAntReal } from '@/lib/painelConsultor/lancFinHistoricoLoader';
import { carregarLancFinAnoCorrenteReal } from '@/lib/painelConsultor/lancFinAnoCorrenteLoader';
import {
  agregaReceitaPecZootComp,
  agregaDeducoesZootComp,
  agregaReposicaoBovinosZootComp,
} from '@/lib/painelConsultor/agregadosZootCompetencia';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';

export default function V2FechamentoPeriodo() {
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

  const [periodo, setPeriodo] = useState({ periodoInicio: '', periodoFim: '' });

  useEffect(() => {
    if (periodo.periodoInicio) return;
    if (!statusPilDefault.data) return;
    const fids = (fazendasComPecuaria ?? []).map(f => f.id);
    const d = calcularDefaultPeriodo(statusPilDefault.data, fids);
    setPeriodo(d);
  }, [statusPilDefault.data, fazendasComPecuaria, periodo.periodoInicio]);

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

  // PC-100 anual + comparativos ano-1. Mesmo shape usado por V2PlanejamentoVisaoGeral.
  const painel = usePainelConsultorData({
    ano,
    mes: 12,
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
      lancFin2026: lancFinAnoCorrente ?? undefined,
      mesAlvo,
    });
  }, [lancFinAnoAnt, lancFinAnoCorrente, gridMetaConsolidado, planFin.saldoInicial, painel.caixaIndicador?.serieAnoAnt, mesAlvo]);

  const saldoInicialReal = painel.caixaIndicador?.serieAnoAnt?.[0] ?? NaN;

  if (!periodo.periodoInicio) {
    return <div className="p-4 text-sm text-muted-foreground">Carregando filtros…</div>;
  }

  const nomeFazenda = isGlobal ? 'Global' : (fazendaAtual?.nome ?? '—');

  return (
    <div className="fechamento-container px-4 py-4">
      <HeaderFiltro
        periodoInicio={periodo.periodoInicio}
        periodoFim={periodo.periodoFim}
        onChange={(ini, fim) => setPeriodo({ periodoInicio: ini, periodoFim: fim })}
        onImprimir={() => window.print()}
        loading={loading}
      />

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
          <Capa dto={dto} nomeCliente={clienteAtual?.nome} nomeFazenda={nomeFazenda} />
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
