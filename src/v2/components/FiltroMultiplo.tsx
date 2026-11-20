/**
 * O PADRÃO ÚNICO DE SELEÇÃO MÚLTIPLA DO PRODUTO — PROD-LANC-FILTROS-01 (Gabriel 19/11). A grade de 3 colunas de caixinhas embrulhava com
 * muitas opções (e o "Todos" tinha foco estranho): agora é uma LISTA VERTICAL de largura fixa (220px), uma opção por linha (nome com "…" e o
 * inteiro no title; a contagem à direita, quando há), ALTURA MÁXIMA FIXA com rolagem por dentro, BUSCA no topo quando há mais de 8 opções
 * (sem acento/maiúscula: `casaNaBusca`), "Todas · Nenhuma" no topo, e o botão diz "Categorias · 2 de 4" numa linha só (nunca quebra).
 * As opções vêm do CADASTRO de quem chama — nunca lista fixa.
 *
 * (histórico) UM FILTRO DE VÁRIAS ESCOLHAS — PR-LANC-FILTRO-CATEGORIA-01.
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
import { useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { casaNaBusca } from '@/lib/texto/busca';

export interface OpcaoFiltro {
  value: string;
  label: string;
  /** quantos itens a opção tem no recorte de agora (sem o próprio filtro); sem ela, a coluna não aparece */
  contagem?: number;
}

export interface RotuloFiltroMultiplo {
  /** O NOME do filtro, e o rótulo quando nada está marcado — ou tudo, que dá no mesmo. Ex.: "Categorias". */
  todos: string;
  /** Ex.: "categoria" (no title do botão). */
  um: string;
  /** Ex.: "categorias". */
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

/** acima disto, a busca aparece no topo */
export const OPCOES_SEM_BUSCA = 8;

/**
 * ⚠ "TUDO MARCADO" LÊ-SE COMO "NADA MARCADO" no gatilho, de propósito: os dois recortam o mesmo conjunto. Parcial = "Categorias · 2 de 4".
 */
export function rotuloDoFiltro(
  selecionadas: readonly string[], total: number, rotulo: RotuloFiltroMultiplo,
): string {
  const n = selecionadas.length;
  if (n === 0 || (total > 0 && n >= total)) return rotulo.todos;
  return total > 0 ? `${rotulo.todos} · ${n} de ${total}` : `${rotulo.todos} · ${n}`;
}

export function FiltroMultiplo({ opcoes, selecionadas, onChange, rotulo, className }: FiltroMultiploProps) {
  const [busca, setBusca] = useState('');
  /* "Nenhuma" desmarca tudo NA LISTA (para escolher uma); como vazio é "todas", fechar sem marcar nada volta a todas */
  const [nenhuma, setNenhuma] = useState(false);
  const marcada = (v: string) => !nenhuma && (selecionadas.length === 0 || selecionadas.includes(v));
  const alterna = (v: string) => {
    if (nenhuma) { setNenhuma(false); onChange([v]); return; }
    const base = selecionadas.length === 0 ? opcoes.map((o) => o.value) : [...selecionadas];
    const prox = base.includes(v) ? base.filter((x) => x !== v) : [...base, v];
    if (prox.length === 0) { setNenhuma(true); onChange([]); return; }
    onChange(prox.length >= opcoes.length ? [] : prox);
  };
  const visiveis = useMemo(() => opcoes.filter((o) => casaNaBusca(o.label, busca)), [opcoes, busca]);
  const comContagem = opcoes.some((o) => o.contagem !== undefined);
  const texto = rotuloDoFiltro(selecionadas, opcoes.length, rotulo);

  return (
    <Popover onOpenChange={(a) => { if (!a) { setBusca(''); setNenhuma(false); } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={className} title={texto} data-testid="filtro-multiplo">
          <span className="min-w-0 truncate">{texto}</span>
          <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start" data-testid="filtro-multiplo-lista" onOpenAutoFocus={(e) => e.preventDefault()}>
        {opcoes.length > OPCOES_SEM_BUSCA && (
          <div className="border-b border-border p-1.5">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${rotulo.um}`}
              className="h-6 px-2 text-[11px]" data-testid="filtro-multiplo-busca" />
          </div>
        )}
        <div className="flex h-6 items-center gap-2 border-b border-border px-2 text-[10px]">
          <button type="button" className="text-primary hover:underline" onClick={() => { setNenhuma(false); onChange([]); }}>Todas</button>
          <span className="text-muted-foreground">·</span>
          <button type="button" className="text-primary hover:underline" onClick={() => { setNenhuma(true); onChange([]); }}>Nenhuma</button>
        </div>
        <div className="max-h-[216px] overflow-y-auto py-0.5" role="listbox" aria-multiselectable>
          {visiveis.map((o) => (
            <label key={o.value} title={o.label}
              className="flex h-6 cursor-pointer items-center gap-1.5 px-2 text-[11px] hover:bg-muted" data-opcao={o.value}>
              <Checkbox checked={marcada(o.value)} onCheckedChange={() => alterna(o.value)} className="h-3 w-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {comContagem && <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{o.contagem ?? 0}</span>}
            </label>
          ))}
          {visiveis.length === 0 && <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Nada com "{busca}"</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
