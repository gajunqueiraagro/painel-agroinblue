/**
 * Modal de Divergência do P1 (Mapa de Pastos)
 *
 * Exibe as divergências retornadas pelo banco em p1_mapa_pastos.detalhe.divergencias
 * sem recalcular nada no frontend.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ArrowRight } from 'lucide-react';

interface Divergencia {
  categoria: string;
  saldo_sistema: number;
  saldo_pastos: number;
  diferenca: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  divergencias: Divergencia[];
  onIrMovimentacoes?: () => void;
  onIrMapaPastos?: () => void;
}

export function DivergenciaP1Dialog({ open, onOpenChange, divergencias, onIrMovimentacoes, onIrMapaPastos }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Divergência no Mapa de Pastos
          </DialogTitle>
          <DialogDescription>
            O fechamento do P1 está bloqueado porque há diferenças entre o saldo das movimentações e o saldo alocado nos pastos.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border overflow-auto max-h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Categoria</TableHead>
                <TableHead className="text-xs text-right">Sistema</TableHead>
                <TableHead className="text-xs text-right">Pastos</TableHead>
                <TableHead className="text-xs text-right">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {divergencias.map((d, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs font-medium">{d.categoria}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{d.saldo_sistema.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{d.saldo_pastos.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className={`text-xs text-right tabular-nums font-semibold ${d.diferenca !== 0 ? 'text-destructive' : ''}`}>
                    {d.diferenca > 0 ? '+' : ''}{d.diferenca.toLocaleString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {onIrMovimentacoes && (
            <Button variant="outline" size="sm" onClick={onIrMovimentacoes} className="gap-1.5">
              Corrigir Movimentações <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {onIrMapaPastos && (
            <Button variant="outline" size="sm" onClick={onIrMapaPastos} className="gap-1.5">
              Corrigir Pastos <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
