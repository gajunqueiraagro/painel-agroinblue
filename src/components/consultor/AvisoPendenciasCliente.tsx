/**
 * RESUMO-CLIENTES-01 passo a — o ⚑ do cabeçalho, dentro do cliente (mock v3, parte 2). Só admin; lugar RESERVADO de largura fixa
 * (nunca desloca o nome do usuário). Âmbar com o número de pendências em aberto daquele cliente; cinza "⚑ 0" sem nenhuma. Clicar abre
 * o modal de altura fixa: a lista (rola a partir da 6ª linha), "+ nova deste cliente", "Ver no Resumo dos clientes", Fechar.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePendenciasConsultor, type FontePendencias } from '@/hooks/usePendenciasConsultor';
import { emAberto, vencida } from '@/lib/consultor/pendencias';
import { cn } from '@/lib/utils';
import { PendenciasTabela } from './PendenciasTabela';
import { NovaPendenciaDialog } from './NovaPendenciaDialog';

export const LARGURA_DO_AVISO = 40;

export function AvisoPendenciasCliente({ cliente, onVerNoResumo, fonte }: {
  cliente: { id: string; nome: string } | null;
  onVerNoResumo: () => void;
  fonte?: FontePendencias;
}) {
  const p = usePendenciasConsultor(cliente?.id ?? null, !!cliente, fonte);
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState(false);
  const abertas = p.lista.filter(emAberto);
  const n = abertas.length;
  const vencidas = abertas.filter(x => vencida(x)).length;
  return (
    <span className="flex shrink-0 items-center justify-end" style={{ width: LARGURA_DO_AVISO }} data-testid="aviso-pendencias">
      {cliente && (
        <button type="button" onClick={() => setAberto(true)} data-testid="aviso-pendencias-botao"
          title={n > 0 ? `${n} pendência(s) em aberto deste cliente` : 'Nenhuma pendência em aberto'}
          className={cn('rounded px-1 text-[10px] leading-[16px] tabular-nums', n > 0 ? 'bg-[#fef3c7] font-semibold text-[#92400e]' : 'text-white/55')}>
          ⚑ {n}
        </button>
      )}
      {cliente && (
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogContent className="flex h-[280px] max-w-[860px] flex-col gap-2" data-testid="pendencias-do-cliente">
            <DialogHeader>
              <DialogTitle className="text-[13px]">Pendências — {cliente.nome}</DialogTitle>
              <DialogDescription className="text-[10px]">{n} {n === 1 ? 'aberta' : 'abertas'} · {vencidas} {vencidas === 1 ? 'vencida' : 'vencidas'}. Só você vê isto.</DialogDescription>
            </DialogHeader>
            <PendenciasTabela lista={p.lista} onCobrar={p.cobrar} onResolver={p.resolver} alturaDoCorpo="132px" />
            <div className="flex h-7 shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" data-testid="nova-deste-cliente" onClick={() => setNova(true)}>+ nova deste cliente</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" data-testid="ver-no-resumo" onClick={() => { setAberto(false); onVerNoResumo(); }}>Ver no Resumo dos clientes</Button>
              <Button size="sm" className="ml-auto h-7 text-[11px]" onClick={() => setAberto(false)}>Fechar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {cliente && <NovaPendenciaDialog open={nova} onOpenChange={setNova} clientes={[cliente]} clienteFixo={cliente.id} criar={p.criar} />}
    </span>
  );
}
