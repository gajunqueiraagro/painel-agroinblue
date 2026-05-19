import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { useFazenda } from '@/contexts/FazendaContext';
import { cn } from '@/lib/utils';

const MESES = [
  { v: '1', l: 'Jan' }, { v: '2', l: 'Fev' },
  { v: '3', l: 'Mar' }, { v: '4', l: 'Abr' }, { v: '5', l: 'Mai' },
  { v: '6', l: 'Jun' }, { v: '7', l: 'Jul' }, { v: '8', l: 'Ago' },
  { v: '9', l: 'Set' }, { v: '10', l: 'Out' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dez' },
];

interface V2FilterBarProps { ano: string; mes: string; onAnoChange: (v: string) => void; onMesChange: (v: string) => void; tipo?: 'nenhum' | 'ano' | 'ano-mes';
  showFazenda?: boolean; className?: string; modo?: 'mes' | 'acum'; onModoChange?: (v: 'mes' | 'acum') => void;
  // Slot opcional Período (Fechamento). Quando as 3 props estão presentes,
  // renderiza inputs month inicio/fim. Estado vive no consumidor (V2Index).
  periodoInicio?: string;
  periodoFim?: string;
  onPeriodoChange?: (ini: string, fim: string) => void;
  // Slot opcional Gerar PDF. Quando presente, renderiza botão (desktop only).
  onImprimir?: () => void;
}

export function V2FilterBar({ ano, mes, onAnoChange, onMesChange, tipo = 'ano', showFazenda = false, className, modo, onModoChange, periodoInicio, periodoFim, onPeriodoChange, onImprimir }: V2FilterBarProps) {
  const { fazendas, fazendaAtual, setFazendaAtual, isGlobal } = useFazenda();
  const { data: anosRaw = [] } = useAnosDisponiveis();
  const anos = anosRaw.length > 0 ? anosRaw.map(String) : [String(new Date().getFullYear())];

  const temPeriodo = periodoInicio !== undefined && periodoFim !== undefined && !!onPeriodoChange;
  const temImprimir = !!onImprimir;
  // Quando tipo='nenhum' e não há slot Período nem PDF, esconder bar inteiro.
  if (tipo === 'nenhum' && !temPeriodo && !temImprimir) return null;

  return (
    <div className={cn('no-print flex items-center gap-2 px-4 py-2 bg-card border-b shrink-0 flex-wrap', className)}>
      {showFazenda && fazendas.length > 1 && (
        <Select value={fazendaAtual?.id ?? '__global__'} onValueChange={(id) => { const f = fazendas.find(x => x.id === id); if (f) setFazendaAtual(f); }}>
          <SelectTrigger className="h-7 text-xs w-36 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>{fazendas.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.nome}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {tipo !== 'nenhum' && (
        <Select value={ano} onValueChange={onAnoChange}>
          <SelectTrigger className="h-7 text-xs w-20 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>{anos.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {tipo === 'ano-mes' && (
        <Select value={mes} onValueChange={onMesChange}>
          <SelectTrigger className="h-7 text-xs w-28 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>{MESES.map(m => <SelectItem key={m.v} value={m.v} className="text-xs">{m.l}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {temPeriodo && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">Período:</span>
          <input
            type="month"
            value={periodoInicio}
            onChange={(e) => {
              const ini = e.target.value;
              const fim = ini > periodoFim! ? ini : periodoFim!;
              onPeriodoChange!(ini, fim);
            }}
            className="text-xs h-7 px-2 rounded border border-input bg-background"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="month"
            value={periodoFim}
            onChange={(e) => {
              const fim = e.target.value;
              const ini = fim < periodoInicio! ? fim : periodoInicio!;
              onPeriodoChange!(ini, fim);
            }}
            className="text-xs h-7 px-2 rounded border border-input bg-background"
          />
        </div>
      )}
      {temImprimir && (
        <button
          type="button"
          onClick={onImprimir}
          className="hidden md:inline-flex items-center gap-1 h-7 px-3 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Gerar PDF
        </button>
      )}
      {onModoChange && (
        <div className="flex items-center rounded-md border border-border overflow-hidden h-7">
          <button
            type="button"
            onClick={() => onModoChange('mes')}
            className={`px-2.5 text-xs h-full transition-colors ${
              (modo ?? 'mes') === 'mes'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            Mês
          </button>
          <button
            type="button"
            onClick={() => onModoChange('acum')}
            className={`px-2.5 text-xs h-full transition-colors ${
              modo === 'acum'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            Acum
          </button>
        </div>
      )}
      {fazendaAtual && <span className="text-xs text-muted-foreground ml-auto truncate hidden md:block">{isGlobal ? 'Todas as fazendas' : fazendaAtual.nome}</span>}
      
      <span className="text-[10px] text-muted-foreground/40 shrink-0 hidden md:block">/v2 fase 1</span>
    </div>
  );
}
