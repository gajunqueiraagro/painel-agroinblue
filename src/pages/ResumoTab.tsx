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
import { useFazenda } from '@/contexts/FazendaContext';
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import type { FiltroGlobal } from './Index';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
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

function FinanceiroCard({ financeiro, onTabChange, isGlobal, filtroGlobal }: { financeiro: ReturnType<typeof useResumoStatus>['financeiro']; onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void; isGlobal: boolean; filtroGlobal: FiltroGlobal }) {
  const [auditOpen, setAuditOpen] = useState(false);
  const a = financeiro.audit;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">💰</span>
          <h2 className="text-base font-extrabold text-card-foreground">Financeiro</h2>
        </div>
        <StatusBadge nivel={financeiro.status.nivel} />
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Entradas</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{formatMoeda(financeiro.totalEntradas)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Saídas</span>
          <span className="font-semibold text-red-600 dark:text-red-400">{formatMoeda(financeiro.totalSaidas)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1">
          <span className="text-muted-foreground font-semibold">Resultado</span>
          <span className={`font-bold ${financeiro.resultado >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatMoeda(financeiro.resultado)}
          </span>
        </div>
        {isGlobal ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo Inicial</span>
              <span className="font-semibold text-card-foreground">{formatMoeda(financeiro.saldoInicial)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground font-bold">Caixa Atual</span>
              <span className={`font-extrabold ${financeiro.caixaAtual >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoeda(financeiro.caixaAtual)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border">
            <span>🔒</span>
            <span>Valores de caixa consolidados disponíveis apenas no modo global</span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">{financeiro.status.descricao}</p>

      {/* Auditoria expandível */}
      <button
        onClick={() => setAuditOpen(!auditOpen)}
        className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        🔍 Auditoria
        {auditOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {auditOpen && (
        <div className="bg-muted/50 rounded-md p-2 space-y-1 text-[10px] text-muted-foreground">
          <div><strong>Base:</strong> {a.base}</div>
          <div><strong>Status:</strong> {a.filtroStatus}</div>
          <div><strong>Data base:</strong> {a.filtroData}</div>
          <div><strong>Classificação:</strong> {a.classificacao}</div>
          <div><strong>Período:</strong> {a.periodo}</div>
          <div><strong>Lançamentos filtrados:</strong> {a.totalLancamentosFiltrados}</div>
          <div><strong>Entradas:</strong> {a.qtdEntradas} lanç. → {formatMoeda(financeiro.totalEntradas)}</div>
          <div><strong>Saídas:</strong> {a.qtdSaidas} lanç. → {formatMoeda(financeiro.totalSaidas)}</div>
          <div className="border-t border-border pt-1 mt-1">
            <strong>Saldo Inicial:</strong> {formatMoeda(financeiro.saldoInicial)}
          </div>
          <div><strong>Período saldo:</strong> {a.saldoInicialPeriodo}</div>
          <div><strong>Registros SALDO:</strong> {a.saldoInicialRegistros}</div>
          {a.saldoInicialContas.length > 0 && (
            <div><strong>Contas:</strong> {a.saldoInicialContas.join(', ')}</div>
          )}
          <div><strong>Caixa:</strong> {a.saldoOrigem}</div>
        </div>
      )}

      <button
        onClick={() => onTabChange('fin_caixa', { ano: filtroGlobal.ano, mes: filtroGlobal.mes })}
        className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-lg py-2 transition-colors hover:bg-primary/20"
      >
        Ver Fluxo Financeiro <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ResumoTab({ lancamentos, saldosIniciais, onTabChange, filtroGlobal, onFiltroChange }: Props) {
  const { fazendaAtual } = useFazenda();
  const fazendaNaoPecuaria = fazendaAtual && fazendaAtual.id !== '__global__' && fazendaAtual.tem_pecuaria === false;

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
        {fazendaNaoPecuaria ? (
          <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl opacity-60">🐄</span>
              <div>
                <h2 className="text-base font-extrabold text-muted-foreground">Zootécnico</h2>
                <span className="text-xs text-muted-foreground/70">{fazendaAtual?.nome || 'Administrativo'}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Não se aplica para esta fazenda.
            </p>
          </div>
        ) : (
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
              onClick={() => onTabChange('zootecnico_hub', { ano: filtroGlobal.ano, mes: filtroGlobal.mes })}
              className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-lg py-2 transition-colors hover:bg-primary/20"
            >
              Ver Painel Zootécnico <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* FINANCEIRO */}
        <FinanceiroCard financeiro={financeiro} onTabChange={onTabChange} isGlobal={fazendaAtual?.id === '__global__'} filtroGlobal={filtroGlobal} />


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
            onClick={() => onTabChange('analise_economica', { ano: filtroGlobal.ano, mes: filtroGlobal.mes })}
            className="w-full flex items-center justify-center gap-1 text-sm font-bold text-primary bg-primary/10 rounded-lg py-2 transition-colors hover:bg-primary/20"
          >
            Ver Análise Econômica <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
