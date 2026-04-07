/**
 * Análise Econômica — container com sub-blocos:
 * 1. Indicadores Mensais
 * 2. Receita, Custo e Margem
 * 3. DRE da Atividade
 * 4. Fluxo de Caixa
 */
import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { IndicadoresMensais } from './AnaliseIndicadoresMensais';
import { ReceitaCustoMargem } from './AnaliseReceitaMargem';
import { DREAtividade } from './AnaliseDRE';
import { FluxoCaixa } from './AnaliseFluxoCaixa';
import {
  type FinanceiroLancamento,
  type RateioADM,
} from '@/hooks/useFinanceiro';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useArrobasGlobal } from '@/hooks/useArrobasGlobal';
import { useFazenda } from '@/contexts/FazendaContext';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';

type Bloco = 'indicadores' | 'receita' | 'dre' | 'fluxo';
type Cenario = 'realizado' | 'previsto';

interface Props {
  lancamentos: FinanceiroLancamento[];
  lancamentosPecuarios: Lancamento[];
  saldosIniciais: SaldoInicial[];
  rateioADM: RateioADM[];
  isGlobal: boolean;
  pastos: Pasto[];
  categorias: CategoriaRebanho[];
  fazendaId?: string;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isConciliado = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase() === 'realizado';

const datePagtoAnoMes = (l: FinanceiroLancamento): string | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return l.data_pagamento.substring(0, 7);
};

/** Cabeças médias por mês */
export function calcCabMediasMensais(
  saldosIniciais: SaldoInicial[],
  lancamentosPecuarios: Lancamento[],
  ano: number,
  ateMes: number,
): { mes: number; media: number }[] {
  const saldoInicialAno = saldosIniciais
    .filter(s => s.ano === ano)
    .reduce((sum, s) => sum + s.quantidade, 0);

  const result: { mes: number; media: number }[] = [];
  for (let m = 1; m <= ateMes; m++) {
    const saldoInicio = m === 1
      ? saldoInicialAno
      : Array.from(calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, ano, m - 1).values()).reduce((s, v) => s + v, 0);
    const saldoFim = Array.from(calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, ano, m).values()).reduce((s, v) => s + v, 0);
    result.push({ mes: m, media: (saldoInicio + saldoFim) / 2 });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnaliseEconomica({
  lancamentos,
  lancamentosPecuarios,
  saldosIniciais,
  rateioADM,
  isGlobal,
  pastos,
  categorias,
  fazendaId,
  filtroAnoInicial,
  filtroMesInicial,
}: Props) {
  const [bloco, setBloco] = useState<Bloco>('indicadores');
  const [cenario, setCenario] = useState<Cenario>('realizado');
  const { fazendas } = useFazenda();

  // Anos disponíveis
  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      if (l.data_pagamento) set.add(l.data_pagamento.substring(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [lancamentos]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const anoNum = Number(anoFiltro);

  // Mês limite — controlado pelo usuário
  const mesDefault = filtroMesInicial || (anoNum === new Date().getFullYear()
    ? new Date().getMonth() + 1
    : 12);
  const [mesLimite, setMesLimite] = useState(mesDefault);

  // Sync default when ano changes
  const handleAnoChange = (val: string) => {
    setAnoFiltro(val);
    const novoAno = Number(val);
    setMesLimite(novoAno === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  };

  // IDs das fazendas reais
  const fazendaIdsReais = useMemo(
    () => fazendas.filter(f => f.id !== '__global__').map(f => f.id),
    [fazendas],
  );

  // Dados zootécnicos oficiais
  const zoo = useIndicadoresZootecnicos(
    fazendaId, anoNum, mesLimite,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  // Arrobas global
  const arrobasGlobal = useArrobasGlobal(
    isGlobal, lancamentosPecuarios, saldosIniciais, categorias,
    anoNum, mesLimite, fazendaIdsReais,
  );

  const arrobasProduzidasAcum = isGlobal
    ? arrobasGlobal.somaArrobas
    : zoo.arrobasProduzidasAcumulado;

  // Cabeças médias mensais
  const cabMediasMensais = useMemo(
    () => calcCabMediasMensais(saldosIniciais, lancamentosPecuarios, anoNum, mesLimite),
    [saldosIniciais, lancamentosPecuarios, anoNum, mesLimite],
  );

  // Lançamentos conciliados por mês no ano
  const lancConciliadosPorMes = useMemo(() => {
    const map = new Map<string, FinanceiroLancamento[]>();
    for (const l of lancamentos) {
      if (!isConciliado(l)) continue;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) continue;
      const mesKey = am.substring(5, 7);
      const arr = map.get(mesKey) || [];
      arr.push(l);
      map.set(mesKey, arr);
    }
    return map;
  }, [lancamentos, anoFiltro]);

  // Meses disponíveis para o seletor
  const mesesOpt = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: MESES_NOMES[i],
  }));

  const blocos: { id: Bloco; label: string }[] = [
    { id: 'indicadores', label: '📊 Indicadores' },
    { id: 'receita', label: '💰 Receita/Margem' },
    { id: 'dre', label: '📋 DRE' },
    { id: 'fluxo', label: '🏦 Fluxo Caixa' },
  ];

  return (
    <div className="space-y-3">
      {/* Sticky filters */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/40 -mx-4 px-4 pt-2 pb-2 space-y-1.5">
        {/* Ano + Mês */}
        <div className="flex gap-1.5 items-center flex-wrap">
          <Select value={anoFiltro} onValueChange={handleAnoChange}>
            <SelectTrigger className="w-20 h-7 text-xs font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="bottom">
              {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={String(mesLimite)} onValueChange={v => setMesLimite(Number(v))}>
            <SelectTrigger className="w-28 h-7 text-xs font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="bottom">
              {mesesOpt.map(m => (
                <SelectItem key={m.value} value={String(m.value)}>
                  Até {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-[10px] text-muted-foreground">
            Jan → {MESES_NOMES[mesLimite - 1]}
          </span>
        </div>

        {/* Toggle Realizado | Previsto */}
        <div className="flex bg-muted rounded-md p-0.5 max-w-xs">
          <button
            onClick={() => setCenario('realizado')}
            className={`flex-1 text-[11px] font-bold py-1 rounded transition-colors ${cenario === 'realizado' ? 'bg-green-700 text-white shadow-sm' : 'text-muted-foreground'}`}
          >
            Realizado
          </button>
          <button
            onClick={() => setCenario('previsto')}
            className={`flex-1 text-[11px] font-bold py-1 rounded transition-colors ${cenario === 'previsto' ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground'}`}
          >
            Previsto
          </button>
        </div>

        {/* Sub-blocos */}
        <div className="grid grid-cols-4 gap-1 bg-muted rounded-md p-0.5">
          {blocos.map(b => (
            <button
              key={b.id}
              onClick={() => setBloco(b.id)}
              className={`py-1.5 px-1 rounded text-[10px] sm:text-xs font-bold transition-colors ${
                bloco === b.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {bloco === 'indicadores' && (
        <IndicadoresMensais
          lancConciliadosPorMes={lancConciliadosPorMes}
          rateioADM={rateioADM}
          cabMediasMensais={cabMediasMensais}
          arrobasProduzidasAcum={arrobasProduzidasAcum}
          zoo={zoo}
          anoFiltro={anoFiltro}
          mesLimite={mesLimite}
          isGlobal={isGlobal}
        />
      )}

      {bloco === 'receita' && (
        <ReceitaCustoMargem
          lancConciliadosPorMes={lancConciliadosPorMes}
          lancamentosPecuarios={lancamentosPecuarios}
          rateioADM={rateioADM}
          arrobasProduzidasAcum={arrobasProduzidasAcum}
          anoFiltro={anoFiltro}
          mesLimite={mesLimite}
          isGlobal={isGlobal}
        />
      )}

      {bloco === 'dre' && (
        <DREAtividade
          lancConciliadosPorMes={lancConciliadosPorMes}
          lancamentosPecuarios={lancamentosPecuarios}
          saldosIniciais={saldosIniciais}
          rateioADM={rateioADM}
          anoFiltro={anoFiltro}
          mesLimite={mesLimite}
          isGlobal={isGlobal}
          fazendaId={fazendaId}
          categorias={categorias}
          pastos={pastos}
        />
      )}

      {bloco === 'fluxo' && (
        <FluxoCaixa
          lancConciliadosPorMes={lancConciliadosPorMes}
          anoFiltro={anoFiltro}
          mesLimite={mesLimite}
          isGlobal={isGlobal}
        />
      )}
    </div>
  );
}
