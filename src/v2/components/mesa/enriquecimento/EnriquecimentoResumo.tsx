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

/* ⚠ OS CHIPS FALAM A LÍNGUA DO OPERADOR — 133a. Eram nove, com os nomes do banco
   ("Exatos", "Divergentes", "Sem match"); agora são os cinco gestos que existem, e cada um
   soma os status que fazem a mesma coisa. A ordem é a do trabalho: o que anda sozinho
   primeiro, o que exige decisão depois, o que não tem par por último. */
const STATUS_CARDS: { key: EnriqStatus; label: string }[] = [
  { key: 'exato',             label: 'Atualizam' },
  { key: 'divergente',        label: 'Atualizam' },
  { key: 'ambiguo',           label: 'Você decide' },
  { key: 'sugestao_grupo',    label: 'Agrupam' },
  { key: 'sugestao_split',    label: 'Agrupam' },
  { key: 'sem_match',         label: 'Sem par no banco' },
  { key: 'ja_classificado',   label: 'Já classificado' },
  { key: 'ambiguo_resolvido', label: 'Já gravadas' },
  { key: 'resolvido_manual',  label: 'Já gravadas' },
  { key: 'resolvido_grupo',   label: 'Já gravadas' },
  { key: 'candidatos_proximos', label: 'Você decide' },
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
