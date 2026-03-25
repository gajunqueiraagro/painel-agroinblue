/**
 * Resumo — HUB de status operacional.
 * 3 cards enxutos: Zootécnico, Financeiro, Econômico.
 * Status forte (🔴🟡🟢) + botão de entrada em cada camada.
 */
import { useState, useMemo, useEffect } from 'react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabId } from '@/components/BottomNav';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { useResumoStatus, StatusNivel } from '@/hooks/useResumoStatus';
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import type { FiltroGlobal } from './Index';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId) => void;
  filtroGlobal: FiltroGlobal;
  onFiltroChange: (f: Partial<FiltroGlobal>) => void;
}

const MESES = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

function StatusBadge({ nivel }: { nivel: StatusNivel }) {
  const config = {
    aberto: { emoji: '🔴', label: 'Em aberto', className: 'bg-destructive/15 text-destructive' },
    parcial: { emoji: '🟡', label: 'Parcial', className: 'bg-accent/20 text-accent-foreground' },
    fechado: { emoji: '🟢', label: 'Fechado', className: 'bg-success/15 text-success' },
  };
  const c = config[nivel];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${c.className}`}>
      {c.emoji} {c.label}
    </span>
  );
}

export function ResumoTab({ lancamentos, saldosIniciais, onTabChange, filtroGlobal, onFiltroChange }: Props) {
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const anoFiltro = filtroGlobal.ano;
  const mesFiltro = String(filtroGlobal.mes);

  const anoNum = Number(anoFiltro);
  const mesNum = Number(mesFiltro);

  const { zootecnico, financeiro, economico, loading } = useResumoStatus(
    lancamentos, saldosIniciais, anoNum, mesNum
  );

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4 animate-fade-in pb-20">
      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Select value={anoFiltro} onValueChange={v => onFiltroChange({ ano: v })}>
          <SelectTrigger className="w-24 touch-target text-sm font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mesFiltro} onValueChange={v => onFiltroChange({ mes: Number(v) })}>
          <SelectTrigger className="w-36 touch-target text-sm font-bold">
            <SelectValue placeholder="Até o mês" />
          </SelectTrigger>
          <SelectContent>
            {MESES.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-sm">
                Até {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* ZOOTÉCNICO */}
        <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐄</span>
              <h2 className="text-base font-extrabold text-card-foreground">Zootécnico</h2>
            </div>
            <StatusBadge nivel={zootecnico.status.nivel} />
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rebanho atual</span>
              <span className="font-bold text-card-foreground">{formatNum(zootecnico.rebanhoAtual)} cab</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entradas</span>
              <span className="font-semibold text-primary">+{formatNum(zootecnico.totalEntradas)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saídas</span>
              <span className="font-semibold text-destructive">-{formatNum(zootecnico.totalSaidas)}</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">{zootecnico.status.descricao}</p>

          <button
            onClick={() => onTabChange('zootecnico')}
            className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-lg py-2 transition-colors hover:bg-primary/20"
          >
            Ver Painel Zootécnico <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* FINANCEIRO */}
        <FinanceiroCard financeiro={financeiro} onTabChange={onTabChange} />

        {/* ECONÔMICO */}
        <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h2 className="text-base font-extrabold text-card-foreground">Econômico</h2>
            </div>
            <StatusBadge nivel={economico.status.nivel} />
          </div>

          <div className="space-y-1.5 text-sm text-muted-foreground">
            <p>Resultado operacional consolidado a partir das bases zootécnica e financeira.</p>
          </div>

          <p className="text-[11px] text-muted-foreground">{economico.status.descricao}</p>

          <button
            onClick={() => onTabChange('analise_economica')}
            className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-lg py-2 transition-colors hover:bg-primary/20"
          >
            Ver Análise Econômica <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
