/**
 * V2AtalhosCampeiro — Atalhos rápidos para perfil Campeiro (mobile)
 *
 * Grade 2×2 de cards touch-friendly.
 * Ordem: Pastos → Foto Mapa → Movimentações → Chuvas
 *
 * Foto Mapa aponta para 'pastos' por enquanto — importação por foto
 * ficará dentro da tela de Pastos quando for mapeada.
 *
 * NÃO importado por ninguém ainda — Etapa 3 do plano incremental.
 */
import { Fence, Camera, ArrowLeftRight, CloudRain } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V2Section } from '@/v2/lib/navGrupos';

interface Props {
  onNavigate: (s: V2Section) => void;
}

interface Atalho {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: V2Section;
  placeholder?: boolean;
}

const ATALHOS: Atalho[] = [
  { label: 'Pastos',        icon: Fence,           section: 'pastos' },
  { label: 'Foto Mapa',     icon: Camera,          section: 'pastos', placeholder: true },
  { label: 'Movimentações', icon: ArrowLeftRight,  section: 'lancamentos-zoot' },
  { label: 'Chuvas',        icon: CloudRain,        section: 'chuvas' },
];

export function V2AtalhosCampeiro({ onNavigate }: Props) {
  return (
    <div className="flex flex-col h-full px-4 py-6 gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Atalhos Rápidos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Campeiro</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ATALHOS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              onClick={() => onNavigate(a.section)}
              className={cn(
                'flex flex-col items-center justify-center gap-2.5',
                'aspect-square rounded-xl border border-border',
                'bg-card hover:bg-muted active:scale-95 transition-all',
                'text-foreground',
              )}
            >
              <Icon className="h-7 w-7 text-primary" />
              <span className="text-xs font-medium leading-tight text-center px-2">
                {a.label}
              </span>
              {a.placeholder && (
                <span className="text-[9px] text-muted-foreground/60 leading-none">
                  em integração
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
