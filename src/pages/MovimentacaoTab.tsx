import { useState, useMemo } from 'react';
import { Lancamento, SaldoInicial, CATEGORIAS, TODOS_TIPOS } from '@/types/cattle';
import { FinanceiroTab, type SubAba } from './FinanceiroTab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseISO, format } from 'date-fns';
import { useFazenda } from '@/contexts/FazendaContext';
import { MESES_OPTIONS } from '@/lib/calculos/labels';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onEditar?: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover?: (id: string) => void;
}

type MainView = 'tipo' | 'categoria';

const TIPO_LABELS: Record<string, { label: string; icon: string }> = {
  nascimento: { label: 'Nascimentos', icon: '🐄' },
  compra: { label: 'Compras', icon: '🛒' },
  transferencia_entrada: { label: 'Transf. Entrada', icon: '📥' },
  transferencia_saida: { label: 'Transf. Saída', icon: '📤' },
  abate: { label: 'Abates', icon: '🔪' },
  venda: { label: 'Vendas', icon: '💰' },
  consumo: { label: 'Consumo', icon: '🍖' },
  morte: { label: 'Mortes', icon: '💀' },
  reclassificacao: { label: 'Reclassificações', icon: '🔄' },
};

export function MovimentacaoTab({ lancamentos, saldosIniciais, onEditar, onRemover }: Props) {
  const [mainView, setMainView] = useState<MainView>('tipo');

  if (mainView === 'tipo') {
    return (
      <div className="pb-20">
        {/* Main view toggle */}
        <div className="p-3 pb-0">
          <ViewToggle value={mainView} onChange={setMainView} />
        </div>
        <FinanceiroTab
          lancamentos={lancamentos}
          onEditar={onEditar || (() => {})}
          onRemover={onRemover || (() => {})}
          modoMovimentacao
        />
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="p-3 pb-0">
        <ViewToggle value={mainView} onChange={setMainView} />
      </div>
      <CategoriaView lancamentos={lancamentos} />
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: MainView; onChange: (v: MainView) => void }) {
  return (
    <div className="grid grid-cols-2 gap-0.5 bg-muted rounded-md p-0.5 mb-2">
      <button
        onClick={() => onChange('tipo')}
        className={`py-1.5 px-2 rounded text-xs font-bold transition-colors ${
          value === 'tipo' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
        }`}
      >
        📋 Por Tipo
      </button>
      <button
        onClick={() => onChange('categoria')}
        className={`py-1.5 px-2 rounded text-xs font-bold transition-colors ${
          value === 'categoria' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
        }`}
      >
        🏷️ Por Categoria
      </button>
    </div>
  );
}

function CategoriaView({ lancamentos }: { lancamentos: Lancamento[] }) {
  const { isGlobal, fazendas } = useFazenda();

  const fazendaMap = useMemo(() => {
    const m = new Map<string, string>();
    fazendas.forEach(f => m.set(f.id, f.nome));
    return m;
  }, [fazendas]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    return Array.from(anos).sort().reverse();
  }, [lancamentos]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('todos');

  const filtrados = useMemo(() => {
    return lancamentos.filter(l => {
      try {
        const d = parseISO(l.data);
        if (format(d, 'yyyy') !== anoFiltro) return false;
        if (mesFiltro !== 'todos' && format(d, 'MM') !== mesFiltro) return false;
        return true;
      } catch { return false; }
    });
  }, [lancamentos, anoFiltro, mesFiltro]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, { entradas: number; saidas: number; lancamentos: Lancamento[] }>();
    CATEGORIAS.forEach(c => map.set(c.value, { entradas: 0, saidas: 0, lancamentos: [] }));

    filtrados.forEach(l => {
      const cat = l.categoria;
      if (!map.has(cat)) map.set(cat, { entradas: 0, saidas: 0, lancamentos: [] });
      const entry = map.get(cat)!;
      entry.lancamentos.push(l);

      const isEntrada = ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo);
      if (isEntrada) {
        entry.entradas += l.quantidade;
      } else {
        entry.saidas += l.quantidade;
      }
    });

    return CATEGORIAS
      .map(c => ({
        categoria: c.value,
        label: c.label,
        ...map.get(c.value)!,
      }))
      .filter(c => c.lancamentos.length > 0);
  }, [filtrados]);

  const totalEntradas = grouped.reduce((s, g) => s + g.entradas, 0);
  const totalSaidas = grouped.reduce((s, g) => s + g.saidas, 0);

  return (
    <div className="p-3 space-y-3">
      {/* Filters */}
      <div className="flex gap-2 items-center">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="h-7 text-xs font-bold w-[80px]">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent side="bottom">
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="h-7 text-xs font-bold w-[120px]">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent side="bottom">
            {MESES_OPTIONS.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground font-semibold">Categorias</p>
          <p className="text-lg font-bold">{grouped.length}</p>
        </div>
        <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">Entradas</p>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">+{totalEntradas}</p>
        </div>
        <div className="bg-red-500/10 rounded-lg p-2 text-center">
          <p className="text-[10px] text-red-700 dark:text-red-400 font-semibold">Saídas</p>
          <p className="text-lg font-bold text-red-700 dark:text-red-400">-{totalSaidas}</p>
        </div>
      </div>

      {/* Category cards */}
      {grouped.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhuma movimentação no período</p>
      ) : (
        <div className="space-y-2">
          {grouped.map(g => (
            <CategoryCard
              key={g.categoria}
              label={g.label}
              entradas={g.entradas}
              saidas={g.saidas}
              lancamentos={g.lancamentos}
              isGlobal={isGlobal}
              fazendaMap={fazendaMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryCard({ label, entradas, saidas, lancamentos, isGlobal, fazendaMap }: {
  label: string;
  entradas: number;
  saidas: number;
  lancamentos: Lancamento[];
  isGlobal: boolean;
  fazendaMap: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const saldo = entradas - saidas;

  // Group lancamentos by tipo
  const byTipo = useMemo(() => {
    const map = new Map<string, { qtd: number; items: Lancamento[] }>();
    lancamentos.forEach(l => {
      if (!map.has(l.tipo)) map.set(l.tipo, { qtd: 0, items: [] });
      const e = map.get(l.tipo)!;
      e.qtd += l.quantidade;
      e.items.push(l);
    });
    return Array.from(map.entries()).map(([tipo, data]) => ({
      tipo,
      label: TIPO_LABELS[tipo]?.label || tipo,
      icon: TIPO_LABELS[tipo]?.icon || '📋',
      ...data,
    }));
  }, [lancamentos]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{label}</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {lancamentos.length} mov.
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          {entradas > 0 && (
            <span className="text-emerald-700 dark:text-emerald-400 font-bold">+{entradas}</span>
          )}
          {saidas > 0 && (
            <span className="text-red-700 dark:text-red-400 font-bold">-{saidas}</span>
          )}
          <span className={`font-bold ${saldo >= 0 ? 'text-foreground' : 'text-red-600'}`}>
            = {saldo >= 0 ? '+' : ''}{saldo}
          </span>
          <span className="text-muted-foreground text-[10px]">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-2 space-y-1.5">
          {byTipo.map(t => (
            <div key={t.tipo} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-background">
              <span className="text-muted-foreground">
                {t.icon} {t.label}
              </span>
              <span className="font-bold font-mono">{t.qtd} cab.</span>
            </div>
          ))}
          {isGlobal && (
            <div className="mt-1 pt-1 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground font-semibold mb-1 px-2">Por Fazenda:</p>
              {(() => {
                const byFazenda = new Map<string, number>();
                lancamentos.forEach(l => {
                  const nome = fazendaMap.get(l.fazendaId || '') || 'Sem fazenda';
                  byFazenda.set(nome, (byFazenda.get(nome) || 0) + l.quantidade);
                });
                return Array.from(byFazenda.entries()).map(([nome, qtd]) => (
                  <div key={nome} className="flex items-center justify-between text-xs px-2 py-0.5">
                    <span className="text-muted-foreground truncate">{nome}</span>
                    <span className="font-mono font-bold">{qtd}</span>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
