import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { ArrowRightLeft, DollarSign } from 'lucide-react';
import type { StatusOperacional } from '@/lib/statusOperacional';
import { getStatusBadge } from '@/lib/statusOperacional';
import { buildTransferenciaCalculation, type TransferenciaCalculation } from '@/lib/calculos/transferencia';

export interface TransferenciaDetalhes {
  precoReferenciaArroba: string;
  precoReferenciaCabeca: string;
  observacaoEconomica: string;
  /** Official calculation snapshot — single source of truth */
  calculation?: TransferenciaCalculation;
}

export const EMPTY_TRANSFERENCIA_DETALHES: TransferenciaDetalhes = {
  precoReferenciaArroba: '',
  precoReferenciaCabeca: '',
  observacaoEconomica: '',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: TransferenciaDetalhes) => void;
  initialData: TransferenciaDetalhes;
  quantidade: number;
  pesoKg: number;
  categoria: string;
  fazendaOrigem: string;
  fazendaDestino: string;
  data: string;
  statusOp: StatusOperacional;
  observacao?: string;
}

export function TransferenciaDetalhesDialog({
  open, onClose, onSave, initialData,
  quantidade, pesoKg, categoria, fazendaOrigem, fazendaDestino, data, statusOp, observacao,
}: Props) {
  const [precoReferenciaArroba, setPrecoReferenciaArroba] = useState(initialData.precoReferenciaArroba);
  const [precoReferenciaCabeca, setPrecoReferenciaCabeca] = useState(initialData.precoReferenciaCabeca);
  const [observacaoEconomica, setObservacaoEconomica] = useState(initialData.observacaoEconomica);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const isPrevisto = statusOp === 'previsto';
  const isProgramado = statusOp === 'programado';
  const usePrev = isPrevisto || isProgramado;

  useEffect(() => {
    if (open) {
      setPrecoReferenciaArroba(initialData.precoReferenciaArroba);
      setPrecoReferenciaCabeca(initialData.precoReferenciaCabeca);
      setObservacaoEconomica(initialData.observacaoEconomica);
      setDirty(false);
      setConfirmClose(false);
    }
  }, [open, initialData]);

  const markDirty = () => setDirty(true);
  const tryClose = () => { if (dirty) setConfirmClose(true); else onClose(); };

  const qtd = quantidade || 0;
  const peso = pesoKg || 0;

  const calc = useMemo(() => {
    return buildTransferenciaCalculation({
      quantidade: qtd,
      pesoKg: peso,
      categoria,
      fazendaOrigem,
      fazendaDestino,
      data,
      statusOperacional: statusOp,
      observacao,
      precoReferenciaArroba: precoReferenciaArroba || undefined,
      precoReferenciaCabeca: precoReferenciaCabeca || undefined,
    });
  }, [qtd, peso, categoria, fazendaOrigem, fazendaDestino, data, statusOp, observacao, precoReferenciaArroba, precoReferenciaCabeca]);

  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';

  const prevLabel = (base: string) => usePrev ? `${base} Prev.` : base;

  // Bidirectional: when user types R$/@, derive R$/cab
  const handleArrobaChange = (value: string) => {
    setPrecoReferenciaArroba(value);
    markDirty();
    const v = Number(value) || 0;
    if (v > 0 && peso > 0) {
      const arrobasCab = peso / 30;
      setPrecoReferenciaCabeca(String(Math.round(v * arrobasCab * 100) / 100));
    } else {
      setPrecoReferenciaCabeca('');
    }
  };

  // Bidirectional: when user types R$/cab, derive R$/@
  const handleCabecaChange = (value: string) => {
    setPrecoReferenciaCabeca(value);
    markDirty();
    const v = Number(value) || 0;
    if (v > 0 && peso > 0) {
      const arrobasCab = peso / 30;
      setPrecoReferenciaArroba(arrobasCab > 0 ? String(Math.round((v / arrobasCab) * 100) / 100) : '');
    } else {
      setPrecoReferenciaArroba('');
    }
  };

  const handleSave = () => {
    onSave({
      precoReferenciaArroba,
      precoReferenciaCabeca,
      observacaoEconomica,
      calculation: calc,
    });
  };

  const sectionTitle = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-1.5 pt-0.5">
      {icon}
      <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) tryClose(); }}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader className="pb-0">
            <DialogTitle className="text-[13px] font-bold flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              Detalhes da Transferência
              {(() => {
                const badge = getStatusBadge({ statusOperacional: statusOp } as any);
                return (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>
                );
              })()}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 pt-1">
            {/* Resumo operacional */}
            <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">{prevLabel('Quantidade')}</span><p className="font-bold">{qtd} cab.</p></div>
              <div><span className="text-muted-foreground">{prevLabel('Peso médio')}</span><p className="font-bold">{formatKg(peso)}</p></div>
              <div><span className="text-muted-foreground">Categoria</span><p className="font-bold">{catLabel}</p></div>
            </div>

            <div className="bg-muted/30 rounded p-2 grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Origem</span><p className="font-bold truncate">{fazendaOrigem || '-'}</p></div>
              <div><span className="text-muted-foreground">Destino</span><p className="font-bold truncate">{fazendaDestino || '-'}</p></div>
            </div>

            <Separator />

            {/* Indicadores calculados */}
            <div className="bg-muted/20 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">{prevLabel('Peso Total')}</span><p className="font-bold tabular-nums">{formatKg(calc.pesoTotalKg)}</p></div>
              <div><span className="text-muted-foreground">{prevLabel('@/cab')}</span><p className="font-bold tabular-nums">{formatArroba(calc.arrobasCab)}</p></div>
              <div><span className="text-muted-foreground">{prevLabel('Total @')}</span><p className="font-bold tabular-nums">{formatArroba(calc.totalArrobas)}</p></div>
            </div>

            <Separator />

            {/* BLOCO ECONÔMICO */}
            {sectionTitle(<DollarSign className="h-4 w-4 text-muted-foreground" />, 'Referência Econômica (Gerencial)')}

            <div className="text-[10px] text-muted-foreground leading-tight px-1">
              Valor de referência para análise de resultado por fazenda. <strong>Não gera lançamento financeiro.</strong>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">R$/@ (Referência)</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R$</span>
                  <Input
                    type="number"
                    value={precoReferenciaArroba}
                    onChange={e => handleArrobaChange(e.target.value)}
                    placeholder="0,00"
                    className="h-7 text-[10px] text-right tabular-nums pl-7"
                    step="0.01"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px]">R$/Cabeça (Referência)</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R$</span>
                  <Input
                    type="number"
                    value={precoReferenciaCabeca}
                    onChange={e => handleCabecaChange(e.target.value)}
                    placeholder="0,00"
                    className="h-7 text-[10px] text-right tabular-nums pl-7"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            {/* Resultado econômico */}
            {calc.temPrecoReferencia && (
              <div className="bg-muted/20 rounded p-2 space-y-0.5 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">R$/@ ref.</span><strong className="tabular-nums">{formatMoeda(calc.precoReferenciaArroba)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">R$/cab ref.</span><strong className="tabular-nums">{formatMoeda(calc.precoReferenciaCabeca)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">R$/kg ref.</span><strong className="tabular-nums">{formatMoeda(calc.precoReferenciaKg)}</strong></div>
                <Separator className="my-1" />
                <div className="flex justify-between text-[11px] font-bold">
                  <span>Valor Econômico do Lote</span>
                  <span className="text-primary tabular-nums">{formatMoeda(calc.valorEconomicoLote)}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Observação econômica */}
            <div>
              <Label className="text-[10px]">Observação Econômica</Label>
              <Input
                value={observacaoEconomica}
                onChange={e => { setObservacaoEconomica(e.target.value); markDirty(); }}
                placeholder="Ex: preço referência de mercado..."
                className="h-7 text-[10px]"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1 h-8 text-[11px]" onClick={tryClose}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1 h-8 text-[11px] font-bold" onClick={handleSave}>
              Confirmar Detalhes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">Você tem alterações não salvas. Deseja descartá-las?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8">Voltar</AlertDialogCancel>
            <AlertDialogAction className="text-xs h-8" onClick={() => { setConfirmClose(false); onClose(); }}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
