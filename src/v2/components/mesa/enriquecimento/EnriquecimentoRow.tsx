/**
 * EnriquecimentoRow — a linha da lista do passo 2. DUMB.
 *
 * ⚠ A IDENTIDADE É A DESCRIÇÃO DA PLANILHA (11px/500) — 133b. A linha mostrava
 * "data · banco · valor" em cima e "estado · fornecedor" embaixo: quatro contextos e
 * nenhum nome. O texto pelo qual o operador reconhece a linha é o que ele escreveu no
 * Excel, e é ele que ocupa a largura agora.
 *
 * ⚠ O CONTEXTO É O `porQue` DO BANCO — 133a. "casou pelo pagamento de 12/08" diz mais que
 * "Pronto", e não é dedução do front: veio do `casamento_meta` que o casador gravou.
 *
 * ⚠ 36px EXATOS — 133b-a: `padding 5px 12px` + 11px/1.3 + 10px/1.3 dá 5 + 14 + 13 + 5 ≈ 36.
 * A data volta como coluna FIXA de 64px, à esquerda, para o valor da direita alinhar em
 * todas as linhas — sem largura fixa ele dança conforme o tamanho da descrição.
 *
 * ⚠ SEM QUEBRA DE LINHA, NAS DUAS: `min-w-0` no filho flexível e `truncate` no texto. Sem
 * os dois, uma descrição longa empurra o valor para fora e a lista deixa de alinhar.
 */
import { STATUS_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
  hideBanco?: boolean;   // U2 — sob filtro por conta, Banco é redundante
  /**
   * 133b-a correção 2 — a linha foi editada e ainda NÃO foi gravada no lançamento.
   *
   * ⚠ PONTO ÂMBAR, e não sumiço: o operador acabou de mexer nela e precisa vê-la onde
   * estava. O que mudou não está no banco, e o rodapé diz isso com todas as letras.
   */
  editadaNaoGravada?: boolean;
}

export function EnriquecimentoRow({ row, selecionado, onSelecionar, editadaNaoGravada }: EnriquecimentoRowProps) {
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
      className={`grid h-9 w-full items-center gap-1.5 rounded px-3 py-[5px] text-left transition-colors ${
        selecionado
          ? 'bg-primary/10 outline outline-1 outline-primary'
          : 'bg-card hover:bg-muted/50'
      }`}
      style={{ gridTemplateColumns: '64px minmax(0,1fr) auto' }}
    >
      <span className="truncate text-[10px] leading-[1.3] text-muted-foreground tabular-nums" title={row.data}>
        {row.data}
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-1">
          <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${editadaNaoGravada ? 'bg-amber-500' : meta.dot}`}
            title={editadaNaoGravada ? 'Editada e ainda não gravada no lançamento.' : meta.label} />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-[1.3]" title={row.descricaoExcel}>
            {row.descricaoExcel}
          </span>
        </span>
        <span className="block truncate pl-[15px] text-[10px] leading-[1.3] text-muted-foreground" title={row.porQue}>
          {row.porQue || '—'}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className={`block text-[11px] font-medium leading-[1.3] tabular-nums ${corValor}`} title={row.valor}>
          {sinal}{row.valor}
        </span>
        <span className={`block rounded text-[10px] leading-[1.3] ${meta.cls}`}>
          {meta.label}
        </span>
      </span>
    </button>
  );
}
