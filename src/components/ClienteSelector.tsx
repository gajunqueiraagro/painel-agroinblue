import { useCliente } from '@/contexts/ClienteContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

/** O valor da entrada virtual no seletor (nunca vai ao banco). */
export const RESUMO_DOS_CLIENTES = '__resumo_clientes__';

export function ClienteSelector() {
  const { clientes, clienteAtual, setClienteAtual, isAdmin, resumoClientes, setResumoClientes } = useCliente();

  /* ACESSO-UM-CLIENTE-01 (Gabriel 24/11 10:29) — o NOME DO CLIENTE aparece SEMPRE, em todo perfil: com um cliente só, o seletor fica TRAVADO
     (o mesmo lugar e o mesmo desenho, sem seta e sem lista) — antes ele sumia e o menu mostrava só "Global", sem dizer em que cliente se está. */
  if (clientes.length <= 1) {
    if (!clienteAtual) return null;
    return (
      <div data-testid="cliente-travado" title={`${clienteAtual.nome} · o seu acesso é a este cliente`}
        className="flex min-h-8 w-[120px] items-center rounded-md border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-[10px] font-bold leading-tight text-primary-foreground md:w-[200px] md:text-xs">
        <Building2 className="mr-1 h-3 w-3 shrink-0" />
        {/* nome comprido QUEBRA (fora de tabela nada de "…"): o quadro cresce na altura */}
        <span className="min-w-0 break-words">{clienteAtual.nome}</span>
      </div>
    );
  }

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
