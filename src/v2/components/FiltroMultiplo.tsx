/**
 * UM FILTRO DE VÁRIAS ESCOLHAS — PR-LANC-FILTRO-CATEGORIA-01.
 *
 * ⚠ O DESENHO NÃO É NOVO: é o do dropdown de Mês do Financeiro (`FinanceiroV2Tab`), copiado
 * da estrutura medida ali — o `Button outline` de 24px com o `ChevronsUpDown`, o popover de
 * 176px, a linha "Todos · Marcar todos" e a grade de três colunas com caixinhas de 10px. O
 * operador já usa esse controle todo dia; inventar outro para a mesma pergunta faria ele
 * aprender duas vezes o mesmo gesto.
 *
 * ⚠ E LÁ ELE É JSX INLINE, EM QUATRO CÓPIAS (Mês e Status, mobile e desktop). Este arquivo
 * NÃO as substitui — a decisão foi deliberada: aquelas moram numa tela que não está em
 * homologação, e consertá-la pela porta dos fundos de outra frente é como as coisas quebram
 * sem ninguém ver. Elas ficam para uma frente própria. Enquanto isso o padrão existe em dois
 * lugares, e este é o que se deve copiar.
 *
 * ⚠ VAZIO SIGNIFICA TODOS, e não "nenhum". Uma lista vazia que filtrasse tudo fora deixaria
 * a tela em branco no estado inicial; e um filtro que precisa de uma marca para não esconder
 * o dado é um filtro que o operador aprende a temer. É a mesma convenção do Mês do
 * Financeiro — `[]` é o estado de abertura.
 */
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface OpcaoFiltro {
  value: string;
  label: string;
}

export interface RotuloFiltroMultiplo {
  /** Quando nada está marcado — ou tudo está, que dá no mesmo. Ex.: "Categorias". */
  todos: string;
  /** Ex.: "categoria" — vira "1 categoria". */
  um: string;
  /** Ex.: "categorias" — vira "3 categorias". */
  varios: string;
}

export interface FiltroMultiploProps {
  opcoes: readonly OpcaoFiltro[];
  /** As marcadas. Vazio = todas. */
  selecionadas: readonly string[];
  onChange: (v: string[]) => void;
  rotulo: RotuloFiltroMultiplo;
  /** As classes do gatilho. O chamador manda, porque a largura é da linha dele. */
  className?: string;
}

/**
 * ⚠ "TUDO MARCADO" LÊ-SE COMO "NADA MARCADO" no gatilho, de propósito: os dois recortam o
 * mesmo conjunto, e mostrar "6 categorias" quando são todas as seis faria o operador
 * procurar o que ficou de fora.
 */
export function rotuloDoFiltro(
  selecionadas: readonly string[], total: number, rotulo: RotuloFiltroMultiplo,
): string {
  const n = selecionadas.length;
  if (n === 0 || (total > 0 && n >= total)) return rotulo.todos;
  return `${n} ${n === 1 ? rotulo.um : rotulo.varios}`;
}

export function FiltroMultiplo({ opcoes, selecionadas, onChange, rotulo, className }: FiltroMultiploProps) {
  const alterna = (v: string) => {
    onChange(selecionadas.includes(v) ? selecionadas.filter((x) => x !== v) : [...selecionadas, v]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={className}>
          {rotuloDoFiltro(selecionadas, opcoes.length, rotulo)}
          <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1.5" align="start">
        <div className="mb-0.5 flex justify-between">
          <button type="button" className="text-[9px] text-primary hover:underline"
            onClick={() => onChange([])}>Todos</button>
          <button type="button" className="text-[9px] text-primary hover:underline"
            onClick={() => onChange(opcoes.map((o) => o.value))}>Marcar todos</button>
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {opcoes.map((o) => (
            <label key={o.value}
              className="flex cursor-pointer items-center gap-0.5 rounded px-0.5 py-0.5 text-[10px] hover:bg-muted">
              <Checkbox checked={selecionadas.includes(o.value)} onCheckedChange={() => alterna(o.value)}
                className="h-2.5 w-2.5" />
              {o.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
