/**
 * ReabrirP1Dialog — Modal de confirmação de reabertura do P1
 * com aviso de cascata nos pilares dependentes (P2, P4, P5).
 */
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fazendaId: string;
  anoMes: string;
  onReaberto?: () => void;
}

interface ReabrirResult {
  pilares_reabertos: string[];
  pilares_invalidados: string[];
}

const PILAR_LABELS: Record<string, string> = {
  p1_mapa_pastos: 'P1 — Mapa de Pastos',
  p2_valor_rebanho: 'P2 — Valor do Rebanho',
  p4_competencia: 'P4 — Competência',
  p5_economico_consolidado: 'P5 — Econômico Consolidado',
};

export function ReabrirP1Dialog({ open, onOpenChange, fazendaId, anoMes, onReaberto }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReabrirResult | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data, error } = await supabase.rpc('reabrir_pilar_fechamento', {
        _fazenda_id: fazendaId,
        _ano_mes: anoMes,
        _pilar: 'p1_mapa_pastos',
        _motivo: 'Reabertura solicitada pelo usuário',
        _usuario_id: userId || null,
      });

      if (error) {
        toast.error(`Erro ao reabrir: ${error.message}`);
        return;
      }

      const r = data as unknown as ReabrirResult;
      setResult(r);
      toast.success('P1 reaberto com sucesso');
      onReaberto?.();
    } catch (e) {
      toast.error(`Erro inesperado: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
  };

  // After reopening — show results
  if (result) {
    return (
      <AlertDialog open={open} onOpenChange={handleClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              Reabertura concluída
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {result.pilares_reabertos.length > 0 && (
                  <div>
                    <p className="font-semibold text-foreground mb-1">Pilares reabertos:</p>
                    <ul className="space-y-1">
                      {result.pilares_reabertos.map(p => (
                        <li key={p} className="flex items-center gap-1.5 text-emerald-700">
                          <CheckCircle className="h-3.5 w-3.5" />
                          {PILAR_LABELS[p] || p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.pilares_invalidados.length > 0 && (
                  <div>
                    <p className="font-semibold text-foreground mb-1">Pilares invalidados por cascata:</p>
                    <ul className="space-y-1">
                      {result.pilares_invalidados.map(p => (
                        <li key={p} className="flex items-center gap-1.5 text-amber-700">
                          <XCircle className="h-3.5 w-3.5" />
                          {PILAR_LABELS[p] || p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleClose}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // Confirmation step
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reabrir Mapa de Pastos (P1)
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Esta ação irá reabrir o período <strong>{anoMes}</strong> e invalidar pilares dependentes:
              </p>
              <ul className="space-y-1.5 ml-1">
                <li className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span><strong>P2</strong> — Valor do Rebanho</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span><strong>P4</strong> — Competência</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span><strong>P5</strong> — Econômico Consolidado</span>
                </li>
              </ul>
              <p className="text-muted-foreground text-xs">
                Após a reabertura, será necessário fechar novamente o P1 para revalidar os pilares dependentes.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {loading ? 'Reabrindo…' : 'Confirmar reabertura'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
