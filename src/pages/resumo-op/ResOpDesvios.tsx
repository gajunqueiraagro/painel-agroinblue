import { useMemo } from 'react';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useLancamentos } from '@/hooks/useLancamentos';
import { parseISO, getYear, getMonth } from 'date-fns';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { Lancamento } from '@/types/cattle';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function passaFiltros(l: Lancamento): boolean {
  if (l.cenario === 'meta') return false;
  if (l.statusOperacional === 'previsto') return false;
  if ((l as any).cancelado === true) return false;
  return true;
}

function arrobasEdesfrute(lancamentos: Lancamento[], anoNum: number, mesNum: number, acumulado: boolean) {
  let cab = 0, arrobas = 0;
  for (const l of lancamentos) {
    if (!passaFiltros(l)) continue;
    if (!['abate','venda'].includes(l.tipo)) continue;
    try {
      const dt = parseISO(l.data);
      const a = getYear(dt);
      const m = getMonth(dt) + 1;
      if (a !== anoNum) continue;
      if (acumulado ? m > mesNum : m !== mesNum) continue;
      const qtd = l.quantidade ?? 0;
      cab += qtd;
      if (l.pesoMedioArrobas && qtd > 0) arrobas += l.pesoMedioArrobas * qtd;
      else if (l.pesoMedioKg && qtd > 0) arrobas += (l.pesoMedioKg * qtd) / 30;
    } catch { /* skip */ }
  }
  return { cab, arrobas };
}

function sumFluxo(meses: any[] | undefined, mesNum: number, acumulado: boolean) {
  if (!meses?.length) return { entradas: 0, saidas: 0, resultado: 0, saldo: 0 };
  const slice = acumulado ? meses.slice(0, mesNum) : [meses[mesNum - 1]].filter(Boolean);
  const entradas = slice.reduce((s, m) => s + (m?.totalEntradas ?? 0), 0);
  const saidas = slice.reduce((s, m) => s + (m?.totalSaidas ?? 0), 0);
  const saldo = (meses[mesNum - 1] as any)?.saldoFinal ?? 0;
  return { entradas, saidas, resultado: entradas - saidas, saldo };
}

function calcDelta(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null) return null;
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export const ResOpDesvios = ({ filtros }: Props) => {
  const { lancamentos } = useLancamentos();
  const anoNum = Number(filtros.ano);
  const mesNum = filtros.mes;
  const acumulado = filtros.visao === 'acumulado';

  const { rawFazenda: zooAtual, loading: loadZooAt } = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });
  const { rawFazenda: zooAnterior, loading: loadZooAnt } = useRebanhoOficial({ ano: anoNum - 1, cenario: 'realizado' });
  const { meses: fluxoAtual, loading: loadFluxoAt } = useFluxoCaixa([], [], anoNum, mesNum);
  const { meses: fluxoAnterior, loading: loadFluxoAnt } = useFluxoCaixa([], [], anoNum - 1, mesNum);

  const mesAt: any = useMemo(() => (zooAtual || []).find((r: any) => r.mes === mesNum), [zooAtual, mesNum]);
  const mesAn: any = useMemo(() => (zooAnterior || []).find((r: any) => r.mes === mesNum), [zooAnterior, mesNum]);

  const cabMediaAt = useMemo(() => {
    const ini = mesAt?.cabecas_inicio ?? null;
    const fim = mesAt?.cabecas_final ?? null;
    if (ini == null || fim == null) return null;
    return (ini + fim) / 2;
  }, [mesAt]);
  const cabMediaAn = useMemo(() => {
    const ini = mesAn?.cabecas_inicio ?? null;
    const fim = mesAn?.cabecas_final ?? null;
    if (ini == null || fim == null) return null;
    return (ini + fim) / 2;
  }, [mesAn]);

  const desfrAt = useMemo(() => arrobasEdesfrute(lancamentos, anoNum, mesNum, acumulado), [lancamentos, anoNum, mesNum, acumulado]);
  const desfrAn = useMemo(() => arrobasEdesfrute(lancamentos, anoNum - 1, mesNum, acumulado), [lancamentos, anoNum, mesNum, acumulado]);

  const fluxoAtKpi = useMemo(() => sumFluxo(fluxoAtual, mesNum, acumulado), [fluxoAtual, mesNum, acumulado]);
  const fluxoAnKpi = useMemo(() => sumFluxo(fluxoAnterior, mesNum, acumulado), [fluxoAnterior, mesNum, acumulado]);

  const loading = loadZooAt || loadZooAnt || loadFluxoAt || loadFluxoAnt;

  const taxaDesfrAt = (cabMediaAt != null && cabMediaAt > 0) ? (desfrAt.cab / cabMediaAt) * 100 : null;
  const taxaDesfrAn = (cabMediaAn != null && cabMediaAn > 0) ? (desfrAn.cab / cabMediaAn) * 100 : null;

  const custoPorCabAt = (cabMediaAt != null && cabMediaAt > 0 && fluxoAtKpi.saidas > 0) ? fluxoAtKpi.saidas / cabMediaAt : null;
  const custoPorCabAn = (cabMediaAn != null && cabMediaAn > 0 && fluxoAnKpi.saidas > 0) ? fluxoAnKpi.saidas / cabMediaAn : null;

  type Linha = {
    label: string;
    atual: number | null;
    anterior: number | null;
    format: (v: number) => string;
    melhorMaior: boolean;
  };

  const linhas: Linha[] = [
    { label: 'Rebanho final (cab)',  atual: mesAt?.cabecas_final ?? null,        anterior: mesAn?.cabecas_final ?? null,        format: (v) => formatNum(v),         melhorMaior: true  },
    { label: 'GMD (kg/cab/dia)',     atual: mesAt?.gmd_kg_cab_dia ?? null,       anterior: mesAn?.gmd_kg_cab_dia ?? null,       format: (v) => formatNum(v, 3),       melhorMaior: true  },
    { label: '@ produzidas',         atual: desfrAt.arrobas > 0 ? desfrAt.arrobas : null, anterior: desfrAn.arrobas > 0 ? desfrAn.arrobas : null, format: (v) => `${formatNum(v, 1)} @`, melhorMaior: true  },
    { label: 'UA/ha',                atual: mesAt?.lotacao_ua_ha ?? null,        anterior: mesAn?.lotacao_ua_ha ?? null,        format: (v) => formatNum(v, 2),       melhorMaior: true  },
    { label: 'Desfrute (%)',         atual: taxaDesfrAt,                          anterior: taxaDesfrAn,                          format: (v) => `${formatNum(v, 1)}%`, melhorMaior: true  },
    { label: 'Custo total (R$)',     atual: fluxoAtKpi.saidas > 0 ? fluxoAtKpi.saidas : null, anterior: fluxoAnKpi.saidas > 0 ? fluxoAnKpi.saidas : null, format: (v) => formatMoeda(v), melhorMaior: false },
    { label: 'Custo / cab (R$)',     atual: custoPorCabAt,                        anterior: custoPorCabAn,                        format: (v) => formatMoeda(v),       melhorMaior: false },
    { label: 'Resultado op. (R$)',   atual: fluxoAtKpi.resultado !== 0 ? fluxoAtKpi.resultado : null, anterior: fluxoAnKpi.resultado !== 0 ? fluxoAnKpi.resultado : null, format: (v) => formatMoeda(v), melhorMaior: true  },
    { label: 'Saldo de caixa (R$)',  atual: fluxoAtKpi.saldo !== 0 ? fluxoAtKpi.saldo : null, anterior: fluxoAnKpi.saldo !== 0 ? fluxoAnKpi.saldo : null, format: (v) => formatMoeda(v), melhorMaior: true  },
  ];

  const periodoLabel = acumulado ? `Acumulado jan-${MESES_SHORT[mesNum - 1]}` : `${MESES_SHORT[mesNum - 1]}/${filtros.ano}`;

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
          Desvios — {periodoLabel}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <p className="text-[10px] text-muted-foreground">
        Comparativo {anoNum} vs {anoNum - 1} — variação % colorida (verde = melhor performance, vermelho = pior).
      </p>

      <div className="space-y-2">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
          9 indicadores — {anoNum} vs {anoNum - 1}
        </p>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground">Indicador</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">{anoNum}</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground">{anoNum - 1}</th>
                <th className="text-right py-1.5 px-2 font-semibold text-muted-foreground w-20">Δ %</th>
                <th className="text-center py-1.5 px-2 font-semibold text-muted-foreground w-12">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground text-[11px]">Carregando...</td></tr>
              ) : linhas.map(row => {
                const delta = calcDelta(row.atual, row.anterior);
                const positivo = delta != null && (row.melhorMaior ? delta > 0 : delta < 0);
                const negativo = delta != null && (row.melhorMaior ? delta < 0 : delta > 0);
                return (
                  <tr key={row.label} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-1 px-2">{row.label}</td>
                    <td className="py-1 px-2 text-right tabular-nums font-semibold">{row.atual != null ? row.format(row.atual) : '—'}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{row.anterior != null ? row.format(row.anterior) : '—'}</td>
                    <td className={cn('py-1 px-2 text-right tabular-nums font-semibold',
                      positivo ? 'text-emerald-600' : negativo ? 'text-rose-600' : 'text-muted-foreground')}>
                      {delta != null ? `${delta > 0 ? '+' : ''}${formatNum(delta, 1)}%` : '—'}
                    </td>
                    <td className="py-1 px-2 text-center">
                      {delta == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : positivo ? (
                        <span className="text-emerald-600">▲</span>
                      ) : negativo ? (
                        <span className="text-rose-600">▼</span>
                      ) : (
                        <span className="text-muted-foreground">●</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
