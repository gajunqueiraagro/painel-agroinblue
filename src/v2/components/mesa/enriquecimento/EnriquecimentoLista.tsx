// EnriquecimentoLista — dumb. Coluna esquerda = SELECIONAR o lançamento.
// Cabeçalho explícito + linhas densas (2 níveis) via EnriquecimentoRow.
import { EnriquecimentoRow } from './EnriquecimentoRow';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoListaProps {
  rows: EnriqRowVM[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
  hideBanco?: boolean;   // U2 — some com Banco quando há filtro por conta
}

export function EnriquecimentoLista({ rows, selecionadoId, onSelecionar, hideBanco }: EnriquecimentoListaProps) {
  return (
    /* ⚠ B-40 item 4 — O CARD TEM TETO PRÓPRIO, e o cabeçalho não rola com a
       lista. `md:h-full` sozinho dependia de toda a cadeia flex acima ter altura
       definida; quando ela não tinha, o card simplesmente crescia e as 311
       linhas da sessão empurravam a página inteira — cabeçalho junto. O
       `max-h` é o piso de segurança: com a cadeia boa, `flex-1` manda e o teto
       nunca é alcançado; com a cadeia quebrada, ele segura. */
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col max-h-[70vh] md:max-h-[calc(100vh-13rem)] md:self-stretch md:h-full md:min-h-0">
      <div className="px-2 py-0.5 border-b bg-muted/40 flex items-baseline justify-between shrink-0">
        <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">
          Linhas do Excel (sessão)
        </span>
        <span className="text-[9px] text-muted-foreground/70 tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-6">Nenhuma linha nesta sessão/filtro.</div>
      ) : (
        /* Só as LINHAS rolam — a barra vive aqui, nunca na página. */
        <div className="space-y-px p-1 overflow-y-auto flex-1 min-h-0">
          {rows.map((r) => (
            <EnriquecimentoRow
              key={r.id}
              row={r}
              selecionado={r.id === selecionadoId}
              onSelecionar={() => onSelecionar(r.id)}
              hideBanco={hideBanco}
            />
          ))}
        </div>
      )}
    </div>
  );
}
