/**
 * RESUMO-CLIENTES-01 passo a — o painel "Resumo dos clientes", aba Pendências (mock v9, parte das pendências). Só admin; não é um
 * cliente: lê as pendências de TODOS os clientes. A esteira do mês é o passo b.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCliente } from '@/contexts/ClienteContext';
import { usePendenciasConsultor, type FontePendencias } from '@/hooks/usePendenciasConsultor';
import { PendenciasTabela } from './PendenciasTabela';
import { NovaPendenciaDialog } from './NovaPendenciaDialog';

export function ResumoClientesPainel({ fonte, filtroCliente, onLimparFiltro }: {
  fonte?: FontePendencias;
  /** Vindo do ⚑ da esteira: só as pendências deste cliente, com "✕" para ver todas. */
  filtroCliente?: string | null;
  onLimparFiltro?: () => void;
}) {
  const { clientes, isAdmin } = useCliente();
  const p = usePendenciasConsultor(null, isAdmin, fonte);
  const [nova, setNova] = useState(false);
  const nomes = useMemo(() => new Map(clientes.map(c => [c.id, c.nome])), [clientes]);
  return (
    <div className="flex h-full min-h-0 flex-col px-2 pb-2" data-testid="resumo-clientes-painel">
      <div className="flex h-9 shrink-0 items-center gap-2">
        <h1 className="text-[13px] font-semibold">Pendências registradas</h1>
        <span className="text-[10px] text-muted-foreground">só você vê · o cliente nunca vê</span>
        {filtroCliente && (
          <span className="flex items-center gap-1 rounded border px-1.5 text-[10px]" data-testid="filtro-cliente">
            Cliente: {nomes.get(filtroCliente) ?? '—'}
            <button type="button" aria-label="ver todos" onClick={onLimparFiltro}>✕</button>
          </span>
        )}
        <Button size="sm" className="ml-auto h-7 px-2 text-[11px]" data-testid="nova-pendencia-abrir" onClick={() => setNova(true)}>+ nova</Button>
      </div>
      {p.erro && <p className="h-4 shrink-0 text-[10px] text-destructive">{p.erro}</p>}
      <PendenciasTabela lista={filtroCliente ? p.lista.filter(x => x.clienteId === filtroCliente) : p.lista} nomesDosClientes={nomes} onCobrar={p.cobrar} onResolver={p.resolver} />
      <NovaPendenciaDialog open={nova} onOpenChange={setNova} clientes={clientes} criar={p.criar} />
    </div>
  );
}
