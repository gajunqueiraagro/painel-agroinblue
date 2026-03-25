/**
 * Resumo — HUB de navegação executiva.
 * 3 cards macro: Zootécnico, Financeiro, Econômico.
 */
import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabId } from '@/components/BottomNav';
import { calcSaldoPorCategoriaLegado, calcSaldoMensalAcumulado } from '@/lib/calculos';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { Beef, DollarSign, BarChart3, ChevronRight } from 'lucide-react';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId) => void;
}

export function ResumoTab({ lancamentos, saldosIniciais, onTabChange }: Props) {
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const anoNum = Number(anoFiltro);

  // KPIs rápidos para os cards
  const { saldoFinalAno, saldoInicialAno } = useMemo(
    () => calcSaldoMensalAcumulado(saldosIniciais, lancamentos, anoNum),
    [saldosIniciais, lancamentos, anoNum],
  );

  const filtradosAno = useMemo(() => {
    return lancamentos.filter(l => {
      try { return format(parseISO(l.data), 'yyyy') === anoFiltro; } catch { return false; }
    });
  }, [lancamentos, anoFiltro]);

  const totalEntradas = filtradosAno
    .filter(l => ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo))
    .reduce((sum, l) => sum + l.quantidade, 0);

  const totalSaidas = filtradosAno
    .filter(l => ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(l.tipo))
    .reduce((sum, l) => sum + l.quantidade, 0);

  const saldo = saldoInicialAno + totalEntradas - totalSaidas;

  const cards = [
    {
      id: 'zootecnico' as TabId,
      icon: Beef,
      emoji: '🐄',
      title: 'Zootécnico',
      subtitle: 'Rebanho, GMD, Desfrute',
      kpi1Label: 'Saldo atual',
      kpi1Value: `${formatNum(saldo)} cab`,
      kpi2Label: 'Entradas / Saídas',
      kpi2Value: `+${formatNum(totalEntradas)} / -${formatNum(totalSaidas)}`,
      gradient: 'from-emerald-600 to-emerald-800',
      textColor: 'text-white',
    },
    {
      id: 'fin_caixa' as TabId,
      icon: DollarSign,
      emoji: '💰',
      title: 'Financeiro',
      subtitle: 'Caixa, Fluxo, Contas',
      kpi1Label: 'Módulo',
      kpi1Value: 'Caixa & Fluxo',
      kpi2Label: 'Importações e Dashboard',
      kpi2Value: '',
      gradient: 'from-blue-600 to-blue-800',
      textColor: 'text-white',
    },
    {
      id: 'analise_economica' as TabId,
      icon: BarChart3,
      emoji: '📊',
      title: 'Econômico',
      subtitle: 'DRE, Indicadores, Resultado',
      kpi1Label: 'Análise',
      kpi1Value: 'Resultado Operacional',
      kpi2Label: 'Custo/@, Margem, Desfrute',
      kpi2Value: '',
      gradient: 'from-amber-600 to-amber-800',
      textColor: 'text-white',
    },
  ];

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      {/* Filtro ano */}
      <div className="flex gap-3">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-28 touch-target text-base font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-base">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cards macro */}
      <div className="space-y-3">
        {cards.map(card => (
          <button
            key={card.id}
            onClick={() => onTabChange(card.id)}
            className={`w-full rounded-xl bg-gradient-to-br ${card.gradient} p-5 shadow-lg transition-transform active:scale-[0.98] text-left`}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{card.emoji}</span>
                  <h2 className={`text-xl font-extrabold ${card.textColor}`}>{card.title}</h2>
                </div>
                <p className={`text-sm font-medium ${card.textColor} opacity-80`}>{card.subtitle}</p>

                {card.kpi1Value && (
                  <div className="mt-3 space-y-1">
                    <p className={`text-xs font-semibold ${card.textColor} opacity-70`}>{card.kpi1Label}</p>
                    <p className={`text-lg font-extrabold ${card.textColor}`}>{card.kpi1Value}</p>
                  </div>
                )}
                {card.kpi2Value && (
                  <div>
                    <p className={`text-xs font-semibold ${card.textColor} opacity-70`}>{card.kpi2Label}</p>
                    <p className={`text-sm font-bold ${card.textColor}`}>{card.kpi2Value}</p>
                  </div>
                )}
                {!card.kpi2Value && card.kpi2Label && (
                  <p className={`text-xs font-semibold ${card.textColor} opacity-70`}>{card.kpi2Label}</p>
                )}
              </div>
              <ChevronRight className={`h-6 w-6 ${card.textColor} opacity-60 mt-1`} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
