// EnriquecimentoResumo — dumb. Cards de contagem que TAMBÉM são o filtro
// (Total/Exatos/Ambíguos/Sem match clicáveis). Substitui a antiga barra de
// botões de filtro (fonte única). "Aplicados" é informativo (não filtra).
import type { EnriqContagensVM, EnriqStatus } from './types';

export interface EnriquecimentoResumoProps {
  contagens: EnriqContagensVM;
  filtroAtivo: EnriqStatus | 'todos';
  onFiltro: (f: EnriqStatus | 'todos') => void;
}

function CardFiltro({
  label, valor, dot, ativo, onClick,
}: { label: string; valor: number; dot: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 transition-colors ${
        ativo ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground hover:bg-muted/60'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-[10px]">{label}</span>
      <span className="text-[11px] font-semibold tabular-nums">{valor}</span>
    </button>
  );
}

export function EnriquecimentoResumo({ contagens, filtroAtivo, onFiltro }: EnriquecimentoResumoProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CardFiltro label="Total"     valor={contagens.total}    dot="bg-slate-400"   ativo={filtroAtivo === 'todos'}     onClick={() => onFiltro('todos')} />
      <CardFiltro label="Exatos"    valor={contagens.exatos}   dot="bg-emerald-500" ativo={filtroAtivo === 'exato'}     onClick={() => onFiltro('exato')} />
      <CardFiltro label="Ambíguos"  valor={contagens.ambiguos} dot="bg-amber-500"   ativo={filtroAtivo === 'ambiguo'}   onClick={() => onFiltro('ambiguo')} />
      <CardFiltro label="Sem match" valor={contagens.semMatch} dot="bg-rose-500"    ativo={filtroAtivo === 'sem_match'} onClick={() => onFiltro('sem_match')} />
      {/* Informativo — não é filtro (não havia botão equivalente). */}
      <div className="flex items-center gap-1.5 rounded-md border border-dashed px-1.5 py-0.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-blue-500" />
        <span className="text-[10px]">Aplicados</span>
        <span className="text-[11px] font-semibold tabular-nums">{contagens.aplicados}</span>
      </div>
    </div>
  );
}
