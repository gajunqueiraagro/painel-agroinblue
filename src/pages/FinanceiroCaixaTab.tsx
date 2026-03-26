/**
 * Módulo Financeiro — container principal com sub-abas horizontais no topo.
 * Topo fixo: nome fazenda + seletor fazenda/global + filtro ano + filtro mês.
 * Sub-abas: Dashboard | Fluxo de Caixa | Rateio ADM | Importação
 */
import { useState, useMemo } from 'react';
import { ImportacaoFinanceira } from '@/components/financeiro/ImportacaoFinanceira';
import { DashboardFinanceiro } from '@/components/financeiro/DashboardFinanceiro';
import { RateioADMConferenciaView } from '@/components/financeiro/RateioADMConferencia';
import { FluxoFinanceiro } from '@/components/financeiro/FluxoFinanceiro';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FazendaSelector } from '@/components/FazendaSelector';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

type SubTab = 'dashboard' | 'fluxo' | 'rateio' | 'importacao';

interface Props {
  lancamentosPecuarios?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

const MESES_FILTRO = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

export function FinanceiroCaixaTab({ lancamentosPecuarios = [], saldosIniciais = [], onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');
  const { fazendaAtual, fazendas } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = fazendaId === '__global__';
  const {
    importacoes, lancamentos, centrosCusto, indicadores,
    rateioADM, rateioConferencia, fazendasSemRebanho, fazendaMapForImport,
    loading, confirmarImportacao, excluirImportacao, fazendaADM,
    totalLancamentosADM,
  } = useFinanceiro();

  // Filtro único — herdado do Resumo, ajustável localmente
  const [localAno, setLocalAno] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const [localMes, setLocalMes] = useState(filtroMesInicial || new Date().getMonth() + 1);

  useEffect(() => {
    if (filtroAnoInicial) setLocalAno(filtroAnoInicial);
    if (filtroMesInicial) setLocalMes(filtroMesInicial);
  }, [filtroAnoInicial, filtroMesInicial]);

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const zooOficial = useIndicadoresZootecnicos(
    fazendaId, anoAtual, mesAtual,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  // Available years from lancamentos
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(anoAtual));
    if (filtroAnoInicial) anos.add(filtroAnoInicial);
    lancamentos.forEach(l => {
      if (l.data_pagamento && l.data_pagamento.length >= 4) {
        anos.add(l.data_pagamento.substring(0, 4));
      }
      if (l.ano_mes && l.ano_mes.length >= 4) {
        anos.add(l.ano_mes.substring(0, 4));
      }
    });
    return Array.from(anos).sort().reverse();
  }, [lancamentos, anoAtual, filtroAnoInicial]);

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'fluxo', label: 'Fluxo de Caixa' },
    ...(fazendaADM ? [{ id: 'rateio' as SubTab, label: 'Rateio ADM' }] : []),
    { id: 'importacao', label: 'Importação' },
  ];

  const fazendaNome = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || 'Fazenda');

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-20">
      {/* ── Topo fixo: filtros ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">

        {/* Linha 2: filtros de ano e mês — FILTRO ÚNICO */}
        <div className="flex gap-2 px-4 pb-2">
          <Select value={localAno} onValueChange={setLocalAno}>
            <SelectTrigger className="w-24 h-8 text-xs font-bold">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(localMes)} onValueChange={v => setLocalMes(Number(v))}>
            <SelectTrigger className="w-36 h-8 text-xs font-bold">
              <SelectValue placeholder="Até o mês" />
            </SelectTrigger>
            <SelectContent>
              {MESES_FILTRO.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  Até {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Linha 3: sub-abas horizontais */}
        <div className="flex gap-0 px-4 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                subTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {subTab === 'dashboard' && (
            <div className="p-4">
              <DashboardFinanceiro
                lancamentos={lancamentos}
                indicadores={indicadores}
                lancamentosPecuarios={lancamentosPecuarios}
                saldosIniciais={saldosIniciais}
                rateioADM={rateioADM}
                isGlobal={isGlobal}
                fazendasSemArea={fazendasSemRebanho}
                pastos={pastos}
                categorias={categorias}
                fazendaId={fazendaId}
                ano={Number(localAno)}
                mesAte={localMes}
              />
            </div>
          )}
          {subTab === 'fluxo' && (
            <FluxoFinanceiro
              lancamentos={lancamentos}
              rateioADM={rateioADM}
              ano={Number(localAno)}
              mesAte={localMes}
              fazendaAtualNome={isGlobal ? undefined : fazendaAtual?.nome}
            />
          )}
          {subTab === 'rateio' && (
            <div className="p-4">
              <RateioADMConferenciaView
                conferencia={rateioConferencia}
                fazendasSemRebanho={fazendasSemRebanho}
                totalLancamentosADM={totalLancamentosADM}
              />
            </div>
          )}
          {subTab === 'importacao' && (
            <div className="p-4">
              <ImportacaoFinanceira
                importacoes={importacoes}
                centrosCusto={centrosCusto}
                fazendas={fazendaMapForImport}
                onConfirmar={confirmarImportacao}
                onExcluir={excluirImportacao}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
