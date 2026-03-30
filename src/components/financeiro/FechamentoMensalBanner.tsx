import { Lock, Unlock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  anoMes: string;
  status: 'aberto' | 'fechado';
  podFechar: boolean;
  podReabrir: boolean;
  onFechar: () => Promise<boolean>;
  onReabrir: () => Promise<boolean>;
}

export function FechamentoMensalBanner({ anoMes, status, podFechar, podReabrir, onFechar, onReabrir }: Props) {
  const fechado = status === 'fechado';

  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs border ${
      fechado
        ? 'bg-destructive/5 border-destructive/20'
        : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
    }`}>
      <div className="flex items-center gap-2">
        {fechado ? (
          <Lock className="h-4 w-4 text-destructive" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
        )}
        <span className="font-semibold">
          {anoMes}
        </span>
        <Badge variant={fechado ? 'destructive' : 'outline'} className="text-[10px] h-5">
          {fechado ? '🔒 Fechado' : '🟢 Aberto'}
        </Badge>
        {fechado && (
          <span className="text-muted-foreground">
            Este mês está fechado e não pode ser alterado.
          </span>
        )}
      </div>
      <div className="flex gap-1.5">
        {!fechado && podFechar && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1">
                <Lock className="h-3 w-3" /> Fechar Mês
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fechar mês {anoMes}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ao fechar este mês, todas as operações financeiras ficarão bloqueadas:
                  edição, exclusão, importação e cancelamento de importações.
                  <br /><br />
                  Apenas um administrador poderá reabrir o período.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onFechar}>Confirmar Fechamento</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {fechado && podReabrir && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50">
                <Unlock className="h-3 w-3" /> Reabrir Mês
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reabrir mês {anoMes}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso permitirá novamente edições, importações e exclusões neste período.
                  Essa ação é registrada para auditoria.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onReabrir} className="bg-amber-600 hover:bg-amber-700">
                  Confirmar Reabertura
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
