import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import type { SubAba } from './FinanceiroTab';
import { calcFluxoAnual, FLUXO_LINHAS } from '@/lib/calculos/zootecnicos';
import { MESES_COLS } from '@/lib/calculos/labels';
import { parseISO, format } from 'date-fns';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onNavigateToMovimentacao?: (subAba: SubAba) => void;
}

export function FluxoAnualTab({ lancamentos, saldosIniciais, onNavigateToMovimentacao }: Props) {
  const [drilldownMonth, setDrilldownMonth] = useState<string | null>(null);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));

  const dados = useMemo(
    () => calcFluxoAnual(saldosIniciais, lancamentos, Number(anoFiltro)),
    [lancamentos, saldosIniciais, anoFiltro],
  );

  if (drilldownMonth) {
    const mesLabel = MESES_COLS.find(m => m.key === drilldownMonth)?.label || drilldownMonth;
    return (
      <div className="animate-fade-in pb-20">
        <div className="p-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setDrilldownMonth(null)} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <h2 className="text-base font-bold text-foreground">
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
    <div className="p-4 max-w-4xl mx-auto space-y-4 animate-fade-in pb-20">
      <div className="max-w-[200px]">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="touch-target text-base font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">Toque em um mês para ver a evolução por categoria</p>

      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="text-left px-2 py-2 font-bold text-foreground sticky left-0 bg-primary/10 min-w-[110px]">
                Movimentação
              </th>
              {MESES_COLS.map(m => (
                <th
                  key={m.key}
                  className="px-2 py-2 font-bold text-foreground text-center min-w-[45px] cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={() => setDrilldownMonth(m.key)}
                >
                  {m.label}
                </th>
              ))}
              <th className="px-2 py-2 font-bold text-foreground text-center min-w-[55px] bg-primary/20">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-primary/10 border-b">
              <td className="px-2 py-2 font-bold text-foreground sticky left-0 bg-primary/10">Saldo Início</td>
              {MESES_COLS.map(m => (
                <td
                  key={m.key}
                  className="px-2 py-2 text-center font-extrabold text-foreground cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={() => setDrilldownMonth(m.key)}
                >
                  {dados.saldoInicioMes[m.key]}
                </td>
              ))}
              <td className="px-2 py-2 text-center font-extrabold text-foreground bg-primary/20">
                {dados.saldoInicialAno}
              </td>
            </tr>

            {FLUXO_LINHAS.map((li, i) => (
              <tr
                key={li.tipo}
                className={`${i % 2 === 0 ? '' : 'bg-muted/30'} ${onNavigateToMovimentacao ? 'cursor-pointer hover:bg-accent/50' : ''}`}
                onClick={() => onNavigateToMovimentacao?.(li.tipo as SubAba)}
              >
                <td className={`px-2 py-1.5 font-bold text-foreground sticky left-0 ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'} ${onNavigateToMovimentacao ? 'underline decoration-dotted' : ''}`}>
                  {li.sinal === '+' ? '➕' : '➖'} {li.label}
                </td>
                {MESES_COLS.map(m => {
                  const val = dados.porMesTipo[m.key][li.tipo];
                  return (
                    <td key={m.key} className={`px-2 py-1.5 text-center font-semibold ${val > 0 ? (li.sinal === '+' ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
                      {val || '-'}
                    </td>
                  );
                })}
                <td className={`px-2 py-1.5 text-center font-bold bg-primary/5 ${dados.totalAno[li.tipo] > 0 ? (li.sinal === '+' ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
                  {dados.totalAno[li.tipo] || '-'}
                </td>
              </tr>
            ))}

            <tr className="border-t-2 bg-primary/10">
              <td className="px-2 py-2 font-extrabold text-foreground sticky left-0 bg-primary/10">Saldo Final</td>
              {MESES_COLS.map((m, i) => {
                const saldoFim = i < 11 ? dados.saldoInicioMes[MESES_COLS[i + 1].key] : dados.saldoFinalAno;
                return (
                  <td key={m.key} className="px-2 py-2 text-center font-extrabold text-foreground">
                    {saldoFim}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center font-extrabold text-foreground bg-primary/20">
                {dados.saldoFinalAno}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
