/**
 * O CABEÇALHO DE COLUNA QUE ORDENA — PR-TABELA-SORT-01.
 *
 * ⚠ O DESENHO VEM DO `ThOrd` DA CENTRAL DE OPERAÇÕES, que é o mais maduro do repo: o `<th>`
 * INTEIRO é o alvo do clique (um `<button>` interno não pegaria o padding), a seta aparece só
 * na coluna ativa, `aria-sort` diz a direção, e Enter/Espaço fazem o mesmo que o mouse. O que
 * muda aqui é o acoplamento: aquele estava preso ao `TableHead` do shadcn e ao tipo de coluna
 * daquela tela.
 *
 * ⚠ O ESTILO VEM DE FORA, e é isso que o torna reusável. Cada tabela da casa tem o seu
 * cabeçalho — sticky, fundo opaco, tamanho próprio — e este componente não impõe nenhum: ele
 * recebe `className` e acrescenta só o que é da ORDENAÇÃO (cursor, seleção, hover). Impor um
 * fundo aqui quebraria o cabeçalho fixo da colheita no primeiro uso.
 */
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DirecaoOrdem } from '@/hooks/useOrdenacaoTabela';

export function ThOrdenavel<C extends string>({
  coluna, rotulo, ordem, onOrdenar, className, alinhaDireita,
}: {
  coluna: C;
  rotulo: string;
  ordem: { coluna: C; direcao: DirecaoOrdem };
  onOrdenar: (coluna: C) => void;
  /** O estilo da tabela: sticky, fundo, tamanho. Este componente não decide nada disso. */
  className?: string;
  alinhaDireita?: boolean;
}) {
  const ativa = ordem.coluna === coluna;
  return (
    <th
      className={cn(className, 'cursor-pointer select-none hover:bg-black/[0.04]',
        alinhaDireita ? 'text-right' : 'text-left')}
      onClick={() => onOrdenar(coluna)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOrdenar(coluna); } }}
      tabIndex={0}
      title={`Ordenar por ${rotulo}`}
      aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {/* ⚠ A SETA SÓ NA COLUNA ATIVA: dez setas cinzas competem com os dez rótulos, e o que se
          precisa saber é por qual coluna a lista está ordenada — não que todas ordenam.
          `flex-row-reverse` à direita para a seta não separar o número da borda. */}
      <span className={cn('inline-flex items-center gap-0.5', alinhaDireita && 'flex-row-reverse')}>
        {rotulo}
        {ativa && (ordem.direcao === 'asc'
          ? <ArrowUp className="h-2.5 w-2.5" />
          : <ArrowDown className="h-2.5 w-2.5" />)}
      </span>
    </th>
  );
}
