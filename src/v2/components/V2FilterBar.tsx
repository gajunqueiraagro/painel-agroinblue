import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { useFazenda } from '@/contexts/FazendaContext';
import { cn } from '@/lib/utils';

const MESES = [
  { v: '0', l: 'Acumulado' }, { v: '1', l: 'Jan' }, { v: '2', l: 'Fev' },
  { v: '3', l: 'Mar' }, { v: '4', l: 'Abr' }, { v: '5', l: 'Mai' },
  { v: '6', l: 'Jun' }, { v: '7', l: 'Jul' }, { v: '8', l: 'Ago' },
  { v: '9', l: 'Set' }, { v: '10', l: 'Out' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dez' },
];

interface V2FilterBarProps { ano: string; mes: string; onAnoChange: (v: string) => void; onMesChange: (v: string) => void; showFazenda?: boolean; className?: string; }

export function V2FilterBar({ ano, mes, onAnoChange, onMesChange, showFazenda = false, className }: V2FilterBarProps) {
  const { fazendas, fazendaAtual, setFazendaAtual, isGlobal } = useFazenda();
  const { data: anosRaw = [] } = useAnosDisponiveis();
  const anos = anosRaw.length > 0 ? anosRaw.map(String) : [String(new Date().getFullYear())];
  return (
    <div className={cn('flex items-center gap-2 px-4 py-2 bg-card border-b shrink-0', className)}>
      {showFazenda && fazendas.length > 1 && (
        <Select value={fazendaAtual?.id ?? '__global__'} onValueChange={(id) => { const f = fazendas.find(x => x.id === id); if (f) setFazendaAtual(f); }}>
          <SelectTrigger className="h-7 text-xs w-36 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>{fazendas.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.nome}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Select value={ano} onValueChange={onAnoChange}>
        <SelectTrigger className="h-7 text-xs w-20 border-border"><SelectValue /></SelectTrigger>
        <SelectContent>{anos.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={mes} onValueChange={onMesChange}>
        <SelectTrigger className="h-7 text-xs w-28 border-border"><SelectValue /></SelectTrigger>
        <SelectContent>{MESES.map(m => <SelectItem key={m.v} value={m.v} className="text-xs">{m.l}</SelectItem>)}</SelectContent>
      </Select>
      {fazendaAtual && <span className="text-xs text-muted-foreground ml-auto truncate hidden md:block">{isGlobal ? 'Todas as fazendas' : fazendaAtual.nome}</span>}
      <span className="text-[10px] text-muted-foreground/40 shrink-0 hidden md:block">/v2 fase 1</span>
    </div>
  );
}
