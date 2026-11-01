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
 * cabeçalho — sticky, fundo, tamanho — e este componente não impõe nenhum: ele recebe
 * `className` e acrescenta só o que é da ORDENAÇÃO (cursor e seleção de texto). Impor um fundo
 * aqui quebraria o cabeçalho fixo da colheita no primeiro uso.
 * ⚠ O HOVER É DESTE COMPONENTE (MAPA-GLOBAL-01 fix1, Gabriel 31/10): `hover:brightness-110`, um FILTRO
 * que clareia o fundo que a tabela escolheu, qualquer que seja. Antes o hover vinha de fora e o
 * `hover:bg-primary-foreground/10` passado pelas tabelas SUBSTITUÍA o `bg-primary` opaco por branco
 * a 10%: o cabeçalho ficava branco e o rótulo branco sumia ("Pedem atenção" do Geo Pastos Global; o
 * Patrimônio e a colheita já tinham trocado, cada um no seu arquivo). Por isso toda classe
 * `hover:bg-…` que chegue em `className` é DESCARTADA aqui (`semHoverDeFundo`): o defeito não volta
 * por nenhuma tabela.
 */
import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DirecaoOrdem } from '@/hooks/useOrdenacaoTabela';

/** Tira de `className` toda classe que troca o FUNDO no hover (`hover:bg-…`, com ou sem `!`): o hover é o filtro deste componente. */
export function semHoverDeFundo(className: string | undefined): string {
  return (className ?? '').split(/\s+/).filter(c => c && !/^hover:!?bg-/.test(c)).join(' ');
}

export function ThOrdenavel<C extends string>({
  coluna, rotulo, ordem, onOrdenar, className, alinhaDireita, extra,
}: {
  coluna: C;
  rotulo: string;
  ordem: { coluna: C; direcao: DirecaoOrdem };
  onOrdenar: (coluna: C) => void;
  /** O estilo da tabela: sticky, fundo, tamanho. Este componente não decide nada disso. */
  className?: string;
  alinhaDireita?: boolean;
  /**
   * Algo ao lado do rótulo — ex.: o selo do filtro ativo (DRE-MODAL-SUBCENTRO-01). O clique DENTRO dele não
   * ordena: quem o passa trata o próprio clique. Sem a prop, nada muda.
   */
  extra?: ReactNode;
}) {
  const ativa = ordem.coluna === coluna;
  return (
    <th
      className={cn(semHoverDeFundo(className), 'cursor-pointer select-none transition-[filter] hover:brightness-110',
        alinhaDireita ? 'text-right' : 'text-left')}
      onClick={() => onOrdenar(coluna)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOrdenar(coluna); } }}
      tabIndex={0}
      title={`Ordenar por ${rotulo}`}
      aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {/* ⚠ O ESPAÇO DA SETA EXISTE SEMPRE, ativa ou não — `invisible`, NUNCA condicional de
          render. Com a seta entrando e saindo do fluxo, cada ordenação empurrava o rótulo e a
          tabela inteira se remexia: o operador clicava numa coluna e a de baixo mudava de
          lugar. Reservar 10px em cada cabeçalho é o preço de a tela ficar parada.
          ⚠ SÓ SE VÊ NA COLUNA ATIVA, e isso não muda: dez setas competiriam com os dez
          rótulos. O que muda é que as nove invisíveis continuam ocupando o lugar delas.
          `flex-row-reverse` à direita para a seta não separar o número da borda. */}
      <span className={cn('inline-flex items-center gap-0.5', alinhaDireita && 'flex-row-reverse')}>
        <span className="truncate">{rotulo}</span>
        {ordem.direcao === 'asc' || !ativa
          ? <ArrowUp className={cn('h-2.5 w-2.5 shrink-0', !ativa && 'invisible')} />
          : <ArrowDown className="h-2.5 w-2.5 shrink-0" />}
      </span>
      {extra != null && (
        <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>{extra}</span>
      )}
    </th>
  );
}
