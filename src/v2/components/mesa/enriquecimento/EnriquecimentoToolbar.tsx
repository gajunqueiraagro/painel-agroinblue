// EnriquecimentoToolbar — dumb. Sessão + Importar Excel + cards (que são o filtro).
// A antiga barra de botões Todos/Exatos/… foi removida (os cards fazem o filtro).
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

export function EnriquecimentoToolbar({
  sessoes, sessaoAtivaId, onSelecionarSessao, contagens, filtroStatus, onFiltroStatus,
  onImportar, isImporting, sessaoDisabled, importarDisabled,
}: EnriquecimentoToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2">
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

      {/* Cards de contagem = filtro (fonte única). */}
      <EnriquecimentoResumo contagens={contagens} filtroAtivo={filtroStatus} onFiltro={onFiltroStatus} />
    </div>
  );
}
