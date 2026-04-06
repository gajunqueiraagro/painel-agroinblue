import { useState, useMemo } from 'react';
import { useZootMensal, indexByMes } from '@/hooks/useZootMensal';
import { filtrarPorCenario } from '@/lib/statusOperacional';
import { Lancamento, SaldoInicial, Categoria } from '@/types/cattle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowLeft, DollarSign } from 'lucide-react';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import type { SubAba } from './FinanceiroTab';
import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { calcFluxoAnual, FLUXO_LINHAS } from '@/lib/calculos/zootecnicos';
import { MESES_COLS } from '@/lib/calculos/labels';
import { parseISO, format } from 'date-fns';

const QB = new Set(['04', '07', '10']);
const qb = (key: string) => QB.has(key) ? 'border-l border-border/60' : '';

const fmtNum = (v: number | string | undefined): string => {
  if (v == null) return '–';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!n && n !== 0) return '–';
  return n.toLocaleString('pt-BR');
};

const fmtDec = (v: number | null | undefined, decimals: number): string => {
  if (v == null) return '–';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onNavigateToMovimentacao?: (subAba: SubAba) => void;
  onNavigateToValorRebanho?: () => void;
  onSetSaldo?: (ano: number, categoria: Categoria, quantidade: number, pesoMedioKg?: number) => void;
  onNavigateToReclass?: (filtro?: { ano: string; mes: number }) => void;
}

export function FluxoAnualTab({ lancamentos, saldosIniciais, onNavigateToMovimentacao, onNavigateToValorRebanho, onSetSaldo, onNavigateToReclass }: Props) {
  const [drilldownMonth, setDrilldownMonth] = useState<string | null>(null);


  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    anos.add(new Date().getFullYear());
    lancamentos.forEach(l => { try { anos.add(Number(format(parseISO(l.data), 'yyyy'))); } catch {} });
    saldosIniciais.forEach(s => anos.add(s.ano));
    const minAno = Math.min(...Array.from(anos));
    const maxAno = Math.max(...Array.from(anos));
    const result: string[] = [];
    for (let y = maxAno; y >= minAno; y--) {
      result.push(String(y));
    }
    return result;
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [statusFiltro, setStatusFiltro] = useState<'realizado' | 'previsto'>('realizado');

  // Fonte única oficial de indicadores mensais (view consolidada)
  const cenarioView = statusFiltro === 'realizado' ? 'realizado' : 'meta';
  const { data: zootMensal = [] } = useZootMensal({ ano: Number(anoFiltro), cenario: cenarioView as 'realizado' | 'meta' });
  const zootByMes = useMemo(() => indexByMes(zootMensal), [zootMensal]);

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
            Evolução de Categorias
          </h2>
        </div>
        <EvolucaoCategoriaTab
          lancamentos={lancamentos}
          saldosIniciais={saldosIniciais}
          initialAno={anoFiltro}
          initialMes={drilldownMonth}
          onNavigateToReclass={onNavigateToReclass}
        />
      </div>
    );
  }

  return (
    <div className="w-full px-4 animate-fade-in pb-20">
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

      {/* Saldo Inicial — only on base year */}
      {onSetSaldo && (
        <SaldoInicialForm
          saldosIniciais={saldosIniciais}
          onSetSaldo={onSetSaldo}
          anoBase={Number(anoFiltro)}
          totalLancamentos={lancamentos.length}
        />
      )}

      <div className="p-3 pt-2 flex justify-center">

      <div className="bg-card rounded-lg shadow-sm border overflow-x-auto w-[70%] max-w-[1200px] min-w-[900px]">
        <table className="w-full text-[10px]" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className="border-b bg-primary/25">
              <th className="text-left px-1.5 py-1.5 font-bold text-primary-foreground sticky left-0 bg-primary/25 w-[110px]">
                Movimentação
              </th>
              {MESES_COLS.map(m => (
                <th
                  key={m.key}
                  className={`px-1 py-1.5 font-bold text-foreground text-center cursor-pointer hover:bg-primary/30 transition-colors ${qb(m.key)}`}
                  onClick={() => setDrilldownMonth(m.key)}
                >
                  {m.label}
                </th>
              ))}
              <th className="px-1.5 py-1.5 font-bold text-primary-foreground text-center w-[60px] bg-primary/25 border-l border-border/60">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-primary/15 border-b">
              <td className="px-1.5 py-1 font-bold text-foreground sticky left-0 bg-primary/15">Saldo Início</td>
              {MESES_COLS.map(m => (
                <td
                  key={m.key}
                  className={`px-1 py-1 text-center font-extrabold text-foreground tabular-nums cursor-pointer hover:bg-accent/50 transition-colors ${qb(m.key)}`}
                  onClick={() => setDrilldownMonth(m.key)}
                >
                  {fmtNum(dados.saldoInicioMes[m.key])}
                </td>
              ))}
              <td className="px-1.5 py-1 text-center font-extrabold text-foreground tabular-nums bg-primary/15 border-l border-border/60">
                {fmtNum(dados.saldoInicialAno)}
              </td>
            </tr>

            {FLUXO_LINHAS.map((li, i) => {
              const corPositiva = statusFiltro === 'previsto' ? 'text-orange-500' : 'text-success';
              const corNegativa = statusFiltro === 'previsto' ? 'text-orange-400' : 'text-destructive';
              const rowBg = li.sinal === '+' ? 'bg-emerald-50/40' : 'bg-red-50/30';
              const colFirstBg = li.sinal === '+' ? 'bg-emerald-50/60' : 'bg-red-50/50';
              return (
              <tr
                key={li.tipo}
                className={`${rowBg} ${onNavigateToMovimentacao ? 'cursor-pointer hover:bg-accent/50' : ''}`}
                onClick={() => onNavigateToMovimentacao?.(li.tipo as SubAba)}
              >
                <td className={`px-1.5 py-0.5 font-medium text-foreground sticky left-0 ${colFirstBg}`}>
                  <span className="text-[8px] opacity-60">{li.sinal === '+' ? '+' : '−'}</span> {li.label}
                </td>
                {MESES_COLS.map(m => {
                  const val = dados.porMesTipo[m.key][li.tipo];
                  return (
                    <td key={m.key} className={`px-1 py-0.5 text-center font-semibold tabular-nums ${qb(m.key)} ${val > 0 ? (li.sinal === '+' ? corPositiva : corNegativa) : 'text-transparent'}`}>
                      {val ? fmtNum(val) : '–'}
                    </td>
                  );
                })}
                <td className={`px-1.5 py-0.5 text-center font-bold tabular-nums bg-muted/80 border-l border-border/60 ${dados.totalAno[li.tipo] > 0 ? (li.sinal === '+' ? corPositiva : corNegativa) : 'text-transparent'}`}>
                  {dados.totalAno[li.tipo] ? fmtNum(dados.totalAno[li.tipo]) : '–'}
                </td>
              </tr>
              );
            })}

            <tr className="border-t-2 bg-primary/20">
              <td className="px-1.5 py-1 font-extrabold text-foreground sticky left-0 bg-primary/20">Saldo Final</td>
              {MESES_COLS.map((m, i) => {
                const saldoFim = i < 11 ? dados.saldoInicioMes[MESES_COLS[i + 1].key] : dados.saldoFinalAno;
                return (
                  <td key={m.key} className={`px-1 py-1 text-center font-extrabold text-foreground tabular-nums ${qb(m.key)}`}>
                    {fmtNum(saldoFim)}
                  </td>
                );
              })}
              <td className="px-1.5 py-1 text-center font-extrabold text-foreground tabular-nums bg-primary/20 border-l border-border/60">
                {fmtNum(dados.saldoFinalAno)}
              </td>
            </tr>

            {/* ── Indicadores zootécnicos — fonte única: vw_zoot_fazenda_mensal ── */}
            {(() => {
              const now = new Date();
              const mesAtualKey = String(now.getMonth() + 1).padStart(2, '0');
              const anoAtual = now.getFullYear();
              const isFuturo = (mKey: string) =>
                statusFiltro === 'realizado' && (Number(anoFiltro) > anoAtual || (Number(anoFiltro) === anoAtual && mKey > mesAtualKey));

              return (
                <>
                  <tr className="border-t bg-muted/40">
                    <td className="px-1.5 py-0.5 font-normal italic text-muted-foreground sticky left-0 bg-muted/50 text-[8px]">Peso Médio Final do mês (kg)</td>
                    {MESES_COLS.map(m => {
                      if (isFuturo(m.key)) return <td key={m.key} className={`px-1.5 py-0.5 text-right tabular-nums italic text-[9px] text-muted-foreground ${qb(m.key)}`}>–</td>;
                      const z = zootByMes[m.key];
                      return (
                        <td key={m.key} className={`px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground ${qb(m.key)}`}>
                          {z?.peso_medio_final_kg != null ? fmtDec(z.peso_medio_final_kg, 2) : '–'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground bg-muted/50 border-l border-border/60">–</td>
                  </tr>

                  <tr className="bg-muted/30">
                    <td className="px-1.5 py-0.5 font-normal italic text-muted-foreground sticky left-0 bg-muted/40 text-[8px]">GMD (kg/cab/dia)</td>
                    {MESES_COLS.map(m => {
                      if (isFuturo(m.key)) return <td key={m.key} className={`px-1.5 py-0.5 text-right tabular-nums italic text-[9px] text-muted-foreground ${qb(m.key)}`}>–</td>;
                      const z = zootByMes[m.key];
                      return (
                        <td key={m.key} className={`px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground ${qb(m.key)}`}>
                          {z?.gmd_kg_cab_dia != null ? fmtDec(z.gmd_kg_cab_dia, 3) : '–'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground bg-muted/40 border-l border-border/60">
                      {(() => {
                        const vals = MESES_COLS.filter(m => !isFuturo(m.key)).map(m => zootByMes[m.key]?.gmd_kg_cab_dia).filter((v): v is number => v != null && v !== 0);
                        return vals.length > 0 ? fmtDec(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : '–';
                      })()}
                    </td>
                  </tr>

                  <tr className="bg-muted/40 border-b">
                    <td className="px-1.5 py-0.5 font-normal italic text-muted-foreground sticky left-0 bg-muted/50 text-[8px]">Lot. média (UA/ha)</td>
                    {MESES_COLS.map(m => {
                      if (isFuturo(m.key)) return <td key={m.key} className={`px-1.5 py-0.5 text-right tabular-nums italic text-[9px] text-muted-foreground ${qb(m.key)}`}>–</td>;
                      const z = zootByMes[m.key];
                      return (
                        <td key={m.key} className={`px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground ${qb(m.key)}`}>
                          {z?.lotacao_ua_ha != null ? fmtDec(z.lotacao_ua_ha, 2) : '–'}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-0.5 text-right font-normal italic tabular-nums text-[9px] text-muted-foreground bg-muted/50 border-l border-border/60">
                      {(() => {
                        const vals = MESES_COLS.filter(m => !isFuturo(m.key)).map(m => zootByMes[m.key]?.lotacao_ua_ha).filter((v): v is number => v != null && v > 0);
                        return vals.length > 0 ? fmtDec(vals.reduce((a, b) => a + b, 0) / vals.length, 2) : '–';
                      })()}
                    </td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
