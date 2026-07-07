// EnriquecimentoToolbar — dumb. Sessão + Importar Excel + cards (que são o filtro).
// A antiga barra de botões Todos/Exatos/… foi removida (os cards fazem o filtro).
import { Button } from '@/components/ui/button';
import { EnriquecimentoResumo } from './EnriquecimentoResumo';
import type { EnriqSessaoVM, EnriqStatus, EnriqContagensVM, EnriqContaVM } from './types';

export interface EnriquecimentoToolbarProps {
  sessoes: EnriqSessaoVM[];
  sessaoAtivaId: string | null;
  onSelecionarSessao: (id: string) => void;
  contas: EnriqContaVM[];
  contaAtivaId: string;
  onSelecionarConta: (id: string) => void;
  contagens: EnriqContagensVM;
  filtroStatus: EnriqStatus | 'todos';
  onFiltroStatus: (f: EnriqStatus | 'todos') => void;
  filtroModo: 'pendentes' | 'todas';                 // PR-U2d-1 — burn-down
  onFiltroModo: (m: 'pendentes' | 'todas') => void;
  onImportar: () => void;
  isImporting?: boolean;
  sessaoDisabled?: boolean;
  importarDisabled?: boolean;
  // PR-MESA-INVERSO-01 — visão read-only "sistema não explicado".
  naoExplicadoCount?: number;
  onAbrirNaoExplicado?: () => void;
}

export function EnriquecimentoToolbar({
  sessoes, sessaoAtivaId, onSelecionarSessao, contas, contaAtivaId, onSelecionarConta,
  contagens, filtroStatus, onFiltroStatus, filtroModo, onFiltroModo,
  onImportar, isImporting, sessaoDisabled, importarDisabled,
  naoExplicadoCount, onAbrirNaoExplicado,
}: EnriquecimentoToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-2 py-1 md:shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Sessão</span>
        <select
          value={sessaoAtivaId ?? ''}
          onChange={(e) => onSelecionarSessao(e.target.value)}
          disabled={sessaoDisabled}
          className="h-6 rounded border bg-background text-[11px] px-2 min-w-[260px] disabled:opacity-60"
        >
          {sessoes.length === 0 && <option value="">— nenhuma sessão —</option>}
          {sessoes.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1 px-2" disabled={isImporting || importarDisabled} onClick={onImportar}>
          ⬆ Importar Excel
        </Button>
      </div>

      {/* Conta bancária — partição de trabalho: muda lista, contadores e fluxo. */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Conta</span>
        <select
          value={contaAtivaId}
          onChange={(e) => onSelecionarConta(e.target.value)}
          className="h-6 rounded border bg-background text-[11px] px-2 min-w-[180px]"
        >
          <option value="todas">Todas</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome} ({c.total})</option>
          ))}
        </select>
      </div>

      {/* PR-U2d-1 — burn-down: Pendentes (default) esconde aplicadas/nada; Todas mostra tudo. */}
      <div className="flex items-center rounded border overflow-hidden">
        {(['pendentes', 'todas'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onFiltroModo(m)}
            className={`h-6 px-2 text-[11px] capitalize ${filtroModo === m ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted/50'}`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Cards de contagem = filtro secundário por status (leitura). */}
      <EnriquecimentoResumo contagens={contagens} filtroAtivo={filtroStatus} onFiltro={onFiltroStatus} />

      {/* PR-MESA-INVERSO-01 — chip read-only: abre a visão "sistema não explicado". */}
      {onAbrirNaoExplicado && (
        <button
          type="button"
          onClick={onAbrirNaoExplicado}
          title="Lançamentos do sistema que nenhuma linha do Excel referencia"
          className="flex items-center gap-1.5 rounded-md border border-dashed border-rose-300 bg-rose-50/60 px-1.5 py-0.5 text-rose-700 hover:bg-rose-50"
        >
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          <span className="text-[10px]">Sistema não explicado</span>
          <span className="text-[11px] font-semibold tabular-nums">{naoExplicadoCount ?? 0}</span>
        </button>
      )}
    </div>
  );
}
