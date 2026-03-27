import { useCliente } from '@/contexts/ClienteContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function ClienteSelector() {
  const { clientes, clienteAtual, setClienteAtual } = useCliente();

  if (clientes.length <= 1) return null;

  return (
    <Select
      value={clienteAtual?.id || ''}
      onValueChange={id => {
        const c = clientes.find(c => c.id === id);
        if (c) setClienteAtual(c);
      }}
    >
      <SelectTrigger className="h-8 text-[10px] md:text-xs font-bold bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground w-[120px] md:w-[200px]">
        <Building2 className="h-3 w-3 mr-1 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {clientes.map(c => (
          <SelectItem key={c.id} value={c.id} className="text-sm">{c.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
