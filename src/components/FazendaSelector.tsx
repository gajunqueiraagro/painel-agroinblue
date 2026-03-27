import { useFazenda, GLOBAL_FAZENDA } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function FazendaSelector() {
  const { fazendas, fazendaAtual, setFazendaAtual } = useFazenda();

  if (fazendas.length <= 1) {
    return null;
  }

  const hasMultiple = fazendas.length > 1;
  const currentName = fazendaAtual?.nome || '';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <Select
            value={fazendaAtual?.id || ''}
            onValueChange={id => {
              if (id === '__global__') {
                setFazendaAtual(GLOBAL_FAZENDA);
              } else {
                const f = fazendas.find(f => f.id === id);
                if (f) setFazendaAtual(f);
              }
            }}
          >
            <SelectTrigger className="h-8 text-[11px] md:text-xs font-bold bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground w-[140px] md:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hasMultiple && (
                <SelectItem value="__global__" className="text-sm font-bold">🌐 Global</SelectItem>
              )}
              {fazendas.map(f => (
                <SelectItem key={f.id} value={f.id} className="text-sm">{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {currentName}
      </TooltipContent>
    </Tooltip>
  );
}
