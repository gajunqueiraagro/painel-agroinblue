import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function FazendaSelector() {
  const { fazendas, fazendaAtual, setFazendaAtual } = useFazenda();
  const { signOut } = useAuth();

  if (fazendas.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        {fazendaAtual && (
          <span className="text-sm font-bold text-primary-foreground opacity-80 truncate max-w-[120px]">
            {fazendaAtual.nome}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} className="text-primary-foreground hover:bg-primary/80 p-1">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={fazendaAtual?.id || ''}
        onValueChange={id => {
          const f = fazendas.find(f => f.id === id);
          if (f) setFazendaAtual(f);
        }}
      >
        <SelectTrigger className="h-8 text-xs font-bold bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground max-w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fazendas.map(f => (
            <SelectItem key={f.id} value={f.id} className="text-sm">{f.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" onClick={signOut} className="text-primary-foreground hover:bg-primary/80 p-1">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
