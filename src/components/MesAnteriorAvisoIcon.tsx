/**
 * MesAnteriorAvisoIcon
 *
 * Mostra ícone ⚠️ quando o MÊS ANTERIOR ainda não tem P1 (Mapa de Pastos)
 * com status 'oficial' (status != 'fechado'/'oficial' equivale a não fechado).
 *
 * Apresentação apenas — não altera dados nem cálculos. Ao clicar, abre modal
 * explicando o impacto sobre o Saldo Inicial do mês visualizado.
 *
 * Uso:
 *   <MesAnteriorAvisoIcon fazendaId={fazendaAtual?.id} anoMes="2025-01" />
 */
import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  fazendaId: string | undefined;
  /** Mês visualizado no formato 'YYYY-MM'. O componente checa o mês ANTERIOR. */
  anoMes: string | undefined;
  /** Tamanho do ícone em px (default 14) */
  size?: number;
  className?: string;
  /** Cenário ativo. No cenário 'meta' não há obrigação de fechamento → ícone não aparece. */
  cenario?: 'realizado' | 'meta' | string;
}

const MES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function calcMesAnterior(anoMes: string): string | null {
  const m = anoMes?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  let ano = Number(m[1]);
  let mes = Number(m[2]);
  mes -= 1;
  if (mes < 1) { mes = 12; ano -= 1; }
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function formatMesLabel(anoMes: string): string {
  const m = anoMes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return anoMes;
  const mesIdx = Number(m[2]) - 1;
  return `${MES_LABEL[mesIdx] ?? m[2]}/${m[1]}`;
}

export function MesAnteriorAvisoIcon({ fazendaId, anoMes, size = 14, className = '' }: Props) {
  const [p1Oficial, setP1Oficial] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  const anoMesAnterior = useMemo(
    () => (anoMes ? calcMesAnterior(anoMes) : null),
    [anoMes],
  );

  useEffect(() => {
    let cancelled = false;
    if (!fazendaId || fazendaId === '__global__' || !anoMesAnterior) {
      setP1Oficial(null);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase.rpc(
          'get_status_pilares_fechamento',
          { _fazenda_id: fazendaId, _ano_mes: anoMesAnterior },
        );
        if (cancelled) return;
        const p1 = (data as any)?.p1_mapa_pastos?.status;
        setP1Oficial(p1 === 'oficial');
      } catch {
        if (!cancelled) setP1Oficial(null);
      }
    })();
    return () => { cancelled = true; };
  }, [fazendaId, anoMesAnterior]);

  // Exibir apenas a partir de Jan/2026
  if (!anoMes || anoMes < '2026-01') return null;
  // Não renderiza nada se: ainda carregando, sem fazenda, ou mês anterior já oficial
  if (!fazendaId || fazendaId === '__global__' || !anoMesAnterior) return null;
  if (p1Oficial !== false) return null;

  const labelAnterior = formatMesLabel(anoMesAnterior);
  const labelAtual = anoMes ? formatMesLabel(anoMes) : '';

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`inline-flex items-center justify-center rounded-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-500/10 transition-colors ${className}`}
        title={`Mês anterior (${labelAnterior}) não fechado oficialmente`}
        aria-label={`Aviso: mês anterior ${labelAnterior} não fechado`}
      >
        <AlertTriangle style={{ width: size, height: size }} />
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Mês anterior não fechado
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm leading-relaxed">
              <p>
                O mês anterior (<strong>{labelAnterior}</strong>) ainda não foi fechado
                oficialmente no Mapa de Pastos.
              </p>
              <p>
                Os dados de <strong>Saldo Inicial</strong> de <strong>{labelAtual}</strong> podem
                estar incorretos enquanto o fechamento de {labelAnterior} não for confirmado.
              </p>
              <p className="text-muted-foreground">
                Recomendação: feche o mês anterior em <em>Lançar Rebanho em Pastos</em> antes
                de continuar a análise.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
