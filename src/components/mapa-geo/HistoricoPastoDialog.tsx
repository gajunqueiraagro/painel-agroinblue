import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { usePastoMovimentacoes, TIPOS_MOV_PASTO } from '@/hooks/usePastoMovimentacoes';
import type { Pasto } from '@/hooks/usePastos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pasto: Pasto;
}

export function HistoricoPastoDialog({ open, onOpenChange, pasto }: Props) {
  const { movimentacoes, loading, loadMovimentacoes } = usePastoMovimentacoes();

  useEffect(() => {
    if (open) loadMovimentacoes(pasto.id);
  }, [open, pasto.id, loadMovimentacoes]);

  const getTipoInfo = (tipo: string) => TIPOS_MOV_PASTO.find(t => t.value === tipo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Histórico — {pasto.nome}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : movimentacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma movimentação registrada.</p>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-2 px-2">
            <div className="space-y-2">
              {movimentacoes.map(m => {
                const info = getTipoInfo(m.tipo);
                return (
                  <div key={m.id} className="rounded-md border p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{info?.icon || '📋'}</span>
                        <span className="text-sm font-semibold">{info?.label || m.tipo}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{m.data}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="secondary">{m.quantidade} cab</Badge>
                      {m.categoria && <Badge variant="outline">{m.categoria}</Badge>}
                      {m.peso_medio_kg && <Badge variant="outline">{m.peso_medio_kg} kg</Badge>}
                      {m.referencia_rebanho && <Badge variant="outline">Ref: {m.referencia_rebanho}</Badge>}
                    </div>
                    {m.tipo === 'transferencia' && (
                      <p className="text-xs text-muted-foreground">
                        {m.pasto_origem_nome || '?'} → {m.pasto_destino_nome || '?'}
                      </p>
                    )}
                    {m.observacoes && (
                      <p className="text-xs text-muted-foreground italic">{m.observacoes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
