// EnriquecimentoResumo — dumb. Só apresenta as contagens da sessão.
import type { EnriqContagensVM } from './types';

export interface EnriquecimentoResumoProps {
  contagens: EnriqContagensVM;
}

function Chip({ label, valor, cls }: { label: string; valor: number; cls: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-semibold tabular-nums">{valor}</span>
    </div>
  );
}

export function EnriquecimentoResumo({ contagens }: EnriquecimentoResumoProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip label="Total" valor={contagens.total} cls="bg-slate-400" />
      <Chip label="Exatos" valor={contagens.exatos} cls="bg-emerald-500" />
      <Chip label="Ambíguos" valor={contagens.ambiguos} cls="bg-amber-500" />
      <Chip label="Sem match" valor={contagens.semMatch} cls="bg-rose-500" />
      <Chip label="Aplicados" valor={contagens.aplicados} cls="bg-blue-500" />
    </div>
  );
}
