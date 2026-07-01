// EnriquecimentoToolbar — dumb. Sessão + contadores (fonte única) + filtros + Importar Excel.
import { Button } from '@/components/ui/button';
import { EnriquecimentoResumo } from './EnriquecimentoResumo';
import type { EnriqSessaoVM, EnriqStatus, EnriqContagensVM } from './types';

export interface EnriquecimentoToolbarProps {
  sessoes: EnriqSessaoVM[];
  sessaoAtivaId: string | null;
  onSelecionarSessao: (id: string) => void;
  contagens: EnriqContagensVM;
  filtroStatus: EnriqStatus | 'todos';
  onFiltroStatus: (f: EnriqStatus | 'todos') => void;
  onImportar: () => void;
  isImporting?: boolean;
  sessaoDisabled?: boolean;
  importarDisabled?: boolean;
}

const FILTROS: Array<{ key: EnriqStatus | 'todos'; label: string }> = [
  { key: 'todos', label: 'Todos' },
  { key: 'exato', label: 'Exatos' },
  { key: 'ambiguo', label: 'Ambíguos' },
  { key: 'sem_match', label: 'Sem match' },
];

export function EnriquecimentoToolbar({
  sessoes, sessaoAtivaId, onSelecionarSessao, contagens, filtroStatus, onFiltroStatus,
  onImportar, isImporting, sessaoDisabled, importarDisabled,
}: EnriquecimentoToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2">
      {/* Sessão + contadores (única fonte de Total/Exatos/Ambíguos/Sem match/Aplicados) */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Sessão</span>
        <select
          value={sessaoAtivaId ?? ''}
          onChange={(e) => onSelecionarSessao(e.target.value)}
          disabled={sessaoDisabled}
          className="h-7 rounded border bg-background text-[11px] px-2 min-w-[260px] disabled:opacity-60"
        >
          {sessoes.length === 0 && <option value="">— nenhuma sessão —</option>}
          {sessoes.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={isImporting || importarDisabled} onClick={onImportar}>
          ⬆ Importar Excel
        </Button>
      </div>

      <EnriquecimentoResumo contagens={contagens} />

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onFiltroStatus(f.key)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
              filtroStatus === f.key ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
