/**
 * V2AtalhosFinanceiro — Atalhos rápidos para perfil Financeiro (mobile)
 *
 * Lista vertical de cards touch-friendly.
 * Ordem: Lançamento financeiro → Conciliação → Importar extrato
 *
 * "Importar extrato" aponta para 'financeiro-lanc' por enquanto —
 * será remapeado quando a tela própria for mapeada.
 *
 * NÃO importado por ninguém ainda — Etapa 3 do plano incremental.
 */
import { ReceiptText, CheckSquare, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V2Section } from '@/v2/lib/navGrupos';

interface Props {
  onNavigate: (s: V2Section) => void;
}

interface Atalho {
  label: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  section: V2Section;
  placeholder?: boolean;
}

const ATALHOS: Atalho[] = [
  {
    label: 'Lançamento financeiro',
    icon: ReceiptText,
    section: 'financeiro-lanc',
  },
  {
    label: 'Conciliação',
    sublabel: 'Conferência bancária',
    icon: CheckSquare,
    section: 'conciliacao',
  },
  {
    label: 'Importar extrato',
    icon: Upload,
    section: 'financeiro-lanc',
    placeholder: true,
  },
];

export function V2AtalhosFinanceiro({ onNavigate }: Props) {
  return (
    <div className="flex flex-col h-full px-4 py-6 gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Atalhos Rápidos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Financeiro</p>
      </div>

      <div className="flex flex-col gap-3">
        {ATALHOS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              onClick={() => onNavigate(a.section)}
              className={cn(
                'flex items-center gap-4 px-4 py-4',
                'rounded-xl border border-border',
                'bg-card hover:bg-muted active:scale-[0.98] transition-all',
                'text-left w-full',
              )}
            >
              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">
                  {a.label}
                </p>
                {a.sublabel && (
                  <p className="text-xs text-muted-foreground mt-0.5">{a.sublabel}</p>
                )}
                {a.placeholder && (
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">em integração</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
