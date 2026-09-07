/**
 * EnriquecimentoRow — a linha da lista do passo 2. DUMB.
 *
 * ⚠ A IDENTIDADE MUDOU EM 133b, e a mudança é a tela inteira: a linha mostrava
 * "data · banco · valor" em cima e "estado · fornecedor" embaixo — quatro contextos e
 * nenhum nome. Agora a identidade é a DESCRIÇÃO DA PLANILHA (11px/500), que é o texto
 * pelo qual o operador reconhece a linha que está procurando; a data e a conta saíram
 * para a faixa do grupo, onde são ditas UMA vez para as linhas todas daquele dia.
 *
 * ⚠ O CONTEXTO É O `porQue` DO BANCO — 133a. "casou pelo pagamento de 12/08" diz mais
 * que "Pronto", e não é dedução do front: veio do `casamento_meta` que o casador gravou.
 *
 * ⚠ SEM QUEBRA DE LINHA. `min-w-0` no filho flexível e `truncate` no texto: sem os dois,
 * uma descrição longa empurra o valor para fora e a lista deixa de alinhar à direita.
 */
import { STATUS_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
  hideBanco?: boolean;   // U2 — sob filtro por conta, Banco é redundante
}

export function EnriquecimentoRow({ row, selecionado, onSelecionar }: EnriquecimentoRowProps) {
  const meta = STATUS_META[row.status] ?? { label: row.statusLabel, cls: 'text-muted-foreground', dot: 'bg-muted-foreground' };
  /* ⚠ O SINAL É PARTE DO NÚMERO — 129d item 4. Uma lista onde saída e entrada têm a mesma
     cara faz o operador conferir R$ 164,38 sem saber se saiu ou entrou. `null` (linha sem
     lançamento) não afirma nenhum dos dois: fica na cor do texto. */
  const corValor =
    row.entradaOuSaida === 'saida' ? 'text-red-600 dark:text-red-400'
    : row.entradaOuSaida === 'entrada' ? 'text-emerald-700 dark:text-emerald-400'
    : '';
  const sinal = row.entradaOuSaida === 'saida' ? '−' : '';

  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`w-full rounded px-1.5 py-1 text-left leading-tight transition-colors ${
        selecionado
          ? 'bg-primary/10 outline outline-1 outline-primary'
          : 'bg-card hover:bg-muted/50'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${meta.dot}`} title={meta.label} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={row.descricaoExcel}>
          {row.descricaoExcel}
        </span>
        <span className={`shrink-0 text-[11px] font-medium tabular-nums ${corValor}`} title={row.valor}>
          {sinal}{row.valor}
        </span>
      </div>
      <div className="flex items-center gap-1.5 pl-[13px]">
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={row.porQue}>
          {row.porQue || '—'}
        </span>
        <span className={`shrink-0 rounded bg-muted px-1 text-[10px] leading-[14px] ${meta.cls}`}>
          {meta.label}
        </span>
      </div>
    </button>
  );
}
