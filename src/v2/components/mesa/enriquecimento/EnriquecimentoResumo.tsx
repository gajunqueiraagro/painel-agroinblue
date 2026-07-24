// EnriquecimentoResumo — dumb. Cards de contagem que TAMBÉM são o filtro.
// PR-P0-2: 2 linhas para legibilidade —
//   superior: Total | Aplicados (Aplicados é flag informativa, fora da soma);
//   inferior: os 6 status (somam ao Total), todos clicáveis. Zerados esmaecidos.
import { STATUS_META } from './fmt';
import type { EnriqContagensVM, EnriqStatus } from './types';

export interface EnriquecimentoResumoProps {
  contagens: EnriqContagensVM;
  filtroAtivo: EnriqStatus | 'todos';
  onFiltro: (f: EnriqStatus | 'todos') => void;
}

// Ordem/rótulos da linha de status (a soma == Total). Cor vem do STATUS_META.
const STATUS_CARDS: { key: EnriqStatus; label: string }[] = [
  { key: 'exato',             label: 'Exatos' },
  { key: 'divergente',        label: 'Divergentes' },
  { key: 'ambiguo',           label: 'Ambíguos' },
  { key: 'ambiguo_resolvido', label: 'Amb. resolvidos' },
  { key: 'sem_match',         label: 'Sem match' },
  { key: 'ja_classificado',   label: 'Já classificados' },
  // PR-MESA-RESOLUCAO-01 — chip do fluxo de decisão humana por data (±10d) e seu resolvido.
  { key: 'candidatos_proximos', label: 'Candidatos próximos' },
  { key: 'resolvido_manual',    label: 'Resolvido manual' },
  { key: 'resolvido_grupo',     label: 'Resolvido grupo' },   // PR-MESA-GRUPO-01
];

function CardFiltro({
  label, valor, dot, ativo, zerado, onClick,
}: { label: string; valor: number; dot: string; ativo: boolean; zerado?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 transition-colors ${
        ativo ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground hover:bg-muted/60'
      } ${zerado && !ativo ? 'opacity-45' : ''}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-[10px]">{label}</span>
      <span className="text-[11px] font-semibold tabular-nums">{valor}</span>
    </button>
  );
}

export function EnriquecimentoResumo({ contagens, filtroAtivo, onFiltro }: EnriquecimentoResumoProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Linha superior: Total (limpa o filtro) | Aplicados (informativo, não filtra) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <CardFiltro label="Total" valor={contagens.total} dot="bg-slate-400" ativo={filtroAtivo === 'todos'} onClick={() => onFiltro('todos')} />
        <div className="flex items-center gap-1.5 rounded-md border border-dashed px-1.5 py-0.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-[10px]">Aplicados</span>
          <span className="text-[11px] font-semibold tabular-nums">{contagens.aplicados}</span>
        </div>
      </div>

      {/* Linha inferior: os 6 status (somam ao Total), todos clicáveis. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_CARDS.map(({ key, label }) => {
          const valor = contagens.status[key];
          return (
            <CardFiltro
              key={key}
              label={label}
              valor={valor}
              dot={STATUS_META[key].dot}
              ativo={filtroAtivo === key}
              zerado={valor === 0}
              onClick={() => onFiltro(key)}
            />
          );
        })}
      </div>
    </div>
  );
}
