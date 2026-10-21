import { useCliente } from '@/contexts/ClienteContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

/** O valor da entrada virtual no seletor (nunca vai ao banco). */
export const RESUMO_DOS_CLIENTES = '__resumo_clientes__';

export function ClienteSelector() {
  const { clientes, clienteAtual, setClienteAtual, isAdmin, resumoClientes, setResumoClientes } = useCliente();

  if (clientes.length <= 1) return null;

  return (
    <Select
      value={resumoClientes ? RESUMO_DOS_CLIENTES : clienteAtual?.id || ''}
      onValueChange={id => {
        /* RESUMO-CLIENTES-01 — a entrada virtual, só admin: não é cliente, só liga o painel */
        if (id === RESUMO_DOS_CLIENTES) { setResumoClientes(true); return; }
        const c = clientes.find(c => c.id === id);
        if (c) setClienteAtual(c);
      }}
    >
      <SelectTrigger title={resumoClientes ? 'Resumo dos clientes' : clienteAtual?.nome} className="h-8 text-[10px] md:text-xs font-bold bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground w-[120px] md:w-[200px]">
        <Building2 className="h-3 w-3 mr-1 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {isAdmin && <SelectItem value={RESUMO_DOS_CLIENTES} data-testid="entrada-resumo-clientes">☰ Resumo dos clientes</SelectItem>}
        {clientes.map(c => (
          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
