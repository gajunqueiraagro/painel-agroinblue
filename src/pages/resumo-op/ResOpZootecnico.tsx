import { Wrench } from 'lucide-react';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const ResOpZootecnico = ({ filtros: _filtros }: Props) => (
  <div className="flex flex-col items-center justify-center min-h-[320px] gap-3 text-muted-foreground p-8">
    <Wrench className="h-8 w-8 text-muted-foreground/30" />
    <p className="text-sm font-medium">Zootécnico</p>
    <p className="text-xs text-center text-muted-foreground/70 max-w-xs">
      Em desenvolvimento — Fase 3 do plano de implementação aprovado.
    </p>
  </div>
);
