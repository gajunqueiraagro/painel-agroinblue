import { useState, useMemo } from 'react';
import { filtrarPorCenario } from '@/lib/statusOperacional';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowLeft, DollarSign } from 'lucide-react';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import type { SubAba } from './FinanceiroTab';
import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { calcFluxoAnual, FLUXO_LINHAS } from '@/lib/calculos/zootecnicos';
import { MESES_COLS } from '@/lib/calculos/labels';
import { parseISO, format } from 'date-fns';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onNavigateToMovimentacao?: (subAba: SubAba) => void;
  onNavigateToValorRebanho?: () => void;
  onSetSaldo?: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number) => void;
}

export function FluxoAnualTab({ lancamentos, saldosIniciais, onNavigateToMovimentacao, onNavigateToValorRebanho, onSetSaldo }: Props) {
  const [drilldownMonth, setDrilldownMonth] = useState<string | null>(null);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [statusFiltro, setStatusFiltro] = useState<'realizado' | 'previsto'>('realizado');

  const lancFiltrados = useMemo(() => {
    const cenario = statusFiltro === 'realizado' ? 'realizado' : 'meta';
    return filtrarPorCenario(lancamentos, cenario);
  }, [lancamentos, statusFiltro]);

  const dados = useMemo(
    () => calcFluxoAnual(saldosIniciais, lancFiltrados, Number(anoFiltro), true),
    [lancFiltrados, saldosIniciais, anoFiltro],
  );

  if (drilldownMonth) {
    const mesLabel = MESES_COLS.find(m => m.key === drilldownMonth)?.label || drilldownMonth;
    return (
      <div className="animate-fade-in pb-20">
        <div className="px-3 py-1.5 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDrilldownMonth(null)} className="gap-1 h-7 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
          <h2 className="text-sm font-bold text-foreground">
            Evolução — {mesLabel}/{anoFiltro}
          </h2>
        </div>
        <EvolucaoCategoriaTab
          lancamentos={lancamentos}
          saldosIniciais={saldosIniciais}
          initialAno={anoFiltro}
          initialMes={drilldownMonth}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-20">
      {/* Filtros - sticky */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-4 py-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={anoFiltro} onValueChange={setAnoFiltro}>
            <SelectTrigger className="h-7 text-xs font-bold w-20">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
            {([
              { value: 'realizado' as const, label: 'Realizado' },
              { value: 'previsto' as const, label: 'Previsto' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFiltro(opt.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  statusFiltro === opt.value
                    ? opt.value === 'realizado'
                      ? 'bg-green-700 text-white shadow-sm'
                      : 'bg-orange-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">Toque em um mês para ver por categoria</span>

          {onNavigateToValorRebanho && (
            <button
              onClick={onNavigateToValorRebanho}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-card hover:bg-muted/50 text-[10px] font-bold text-foreground transition-colors shrink-0"
            >
              <DollarSign className="h-3 w-3 text-primary" />
              Valor Rebanho
            </button>
          )}
        </div>
      </div>

      <div className="p-3 pt-2 space-y-2">

      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b bg-muted">
              <th className="text-left px-2 py-1 font-bold text-foreground sticky left-0 bg-muted min-w-[110px]">
                Movimentação
              </th>
              {MESES_COLS.map(m => (
                <th
                  key={m.key}
                  className="px-2 py-1 font-bold text-foreground text-center min-w-[45px] cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setDrilldownMonth(m.key)}
                >
                  {m.label}
                </th>
              ))}
              <th className="px-2 py-1 font-bold text-foreground text-center min-w-[55px] bg-muted">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-muted border-b">
              <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-muted">Saldo Início</td>
              {MESES_COLS.map(m => (
                <td
                  key={m.key}
                  className="px-2 py-1 text-center font-extrabold text-foreground cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setDrilldownMonth(m.key)}
                >
                  {dados.saldoInicioMes[m.key]}
                </td>
              ))}
              <td className="px-2 py-1 text-center font-extrabold text-foreground bg-muted">
                {dados.saldoInicialAno}
              </td>
            </tr>

            {FLUXO_LINHAS.map((li, i) => (
              <tr
                key={li.tipo}
                className={`${i % 2 === 0 ? '' : 'bg-muted/30'} ${onNavigateToMovimentacao ? 'cursor-pointer hover:bg-accent/50' : ''}`}
                onClick={() => onNavigateToMovimentacao?.(li.tipo as SubAba)}
              >
                <td className={`px-2 py-0.5 font-bold text-foreground sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'} ${onNavigateToMovimentacao ? 'underline decoration-dotted' : ''}`}>
                  {li.sinal === '+' ? '➕' : '➖'} {li.label}
                </td>
                {MESES_COLS.map(m => {
                  const val = dados.porMesTipo[m.key][li.tipo];
                  return (
                    <td key={m.key} className={`px-2 py-0.5 text-center font-semibold ${val > 0 ? (li.sinal === '+' ? 'text-success' : 'text-destructive') : 'text-transparent'}`}>
                      {val || '–'}
                    </td>
                  );
                })}
                <td className={`px-2 py-0.5 text-center font-bold ${dados.totalAno[li.tipo] > 0 ? (li.sinal === '+' ? 'text-success' : 'text-destructive') : 'text-transparent'}`}>
                  {dados.totalAno[li.tipo] || '–'}
                </td>
              </tr>
            ))}

            <tr className="border-t-2 bg-muted">
              <td className="px-2 py-1 font-extrabold text-foreground sticky left-0 bg-muted">Saldo Final</td>
              {MESES_COLS.map((m, i) => {
                const saldoFim = i < 11 ? dados.saldoInicioMes[MESES_COLS[i + 1].key] : dados.saldoFinalAno;
                return (
                  <td key={m.key} className="px-2 py-1 text-center font-extrabold text-foreground">
                    {saldoFim}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-extrabold text-foreground bg-muted">
                {dados.saldoFinalAno}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
