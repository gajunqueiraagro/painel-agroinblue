import { Clock } from 'lucide-react';

interface Props {
  lancamentoId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso ?? '—'; }
}

export function BlocoAuditoria({ lancamentoId, createdAt, updatedAt }: Props) {
  return (
    <div className="space-y-3 max-w-xl">
      <div className="rounded-lg border bg-card overflow-hidden">
        <header className="bg-muted/40 px-4 py-2 border-b">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Histórico do Registro
          </h4>
        </header>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <div>
              <div className="text-[11px] font-medium uppercase text-muted-foreground tracking-wide">Criado em</div>
              <div className="text-sm font-medium tabular-nums">{fmt(createdAt)}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <div>
              <div className="text-[11px] font-medium uppercase text-muted-foreground tracking-wide">Atualizado em</div>
              <div className="text-sm font-medium tabular-nums">{fmt(updatedAt)}</div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground italic pt-2 border-t">
            ID do lançamento: <span className="font-mono tabular-nums">{lancamentoId}</span>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground italic">
        Auditoria detalhada (criado por / atualizado por / histórico de
        alterações) chega em fase futura.
      </p>
    </div>
  );
}
