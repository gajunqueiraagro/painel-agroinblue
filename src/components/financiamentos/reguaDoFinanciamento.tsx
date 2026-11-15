/**
 * FIN-FINANC-LAYOUT-03 (Gabriel 12/11 15:40, prints do NJ PR-78.179) — UMA RÉGUA para a lista de Financiamentos e para todas as tabelas do
 * contrato (Cronograma, Liberações, Pagamentos, Documentos, Histórico, A resolver): a mesma fonte de célula e de cabeçalho nas duas telas.
 *  · o tamanho são variáveis CSS (`reguaDoFinanciamento.css`): célula `--fin-td`, cabeçalho `--fin-th` (1px menor), data `--fin-data`
 *    (meio passo abaixo, a regra do FIN-FINANC-LAYOUT-01) e a linha `--fin-linha`;
 *  · as larguras das colunas são em `em` da célula (`emDaRegua`, medidas a 11px): a régua troca de tamanho sem cortar nem sobrar;
 *  · o cabeçalho que ordena é UM (`ThOrdenavel`: botão no `th` + `aria-sort`), o mesmo da lista.
 * A ESCOLHA ENTRE 10 E 11 É DO GABRIEL (prints lado a lado): `REGUA_ESCOLHIDA` e o `:root` do CSS mudam juntos (um teste confere).
 */
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { Ordem } from '@/lib/financiamentos/ordemDaTabela';
import { larguraPeloMaior } from '@/v2/lib/custeio/larguraDasColunas';
import './reguaDoFinanciamento.css';

export const TAMANHOS_DA_REGUA = [10, 11] as const;
export type TamanhoDaRegua = (typeof TAMANHOS_DA_REGUA)[number];
/** a célula escolhida; o cabeçalho é 1px menor. Provisória (11) até a escolha do Gabriel. */
export const REGUA_ESCOLHIDA: TamanhoDaRegua = 11;
/** a classe que fixa um dos dois tamanhos num pedaço da tela (só a bancada a usa; o app lê o `:root`) */
export const classeDaRegua = (n: TamanhoDaRegua): string => `regua-fin-${n}`;

/** a largura do texto a 11px (a régua das larguras): canvas com a fonte da página; sem canvas (teste), 0,6 da fonte por letra. Vai para
 *  o `larguraPeloMaior` (o mesmo do custeio, UI-LARGURA-COLUNAS) e de lá para o `emDaRegua`. */
let contexto: CanvasRenderingContext2D | null | undefined;
export function medirNaRegua(texto: string, peso: 400 | 500 | 600 | 700 = 400): number {
  /* no jsdom (testes) não há canvas: a conta de reserva, sem o aviso "Not implemented" do jsdom */
  if (contexto === undefined) contexto = typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent) ? null : document.createElement('canvas').getContext?.('2d') ?? null;
  if (!contexto) return texto.length * 6.6;
  contexto.font = `${peso} 11px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
  return contexto.measureText(texto).width;
}

/** a largura (px a 11px) da coluna que mostra estes textos INTEIROS numa linha: o maior + o padding (`folga`), nunca menos que o `piso`
 *  (o cabeçalho com a seta). Sem teto: a decisão de 16:58 é não cortar nem quebrar — sobrando menos que isso, a tabela rola dentro do quadro. */
export const larguraDoMaior = (textos: readonly string[], e: { piso: number; folga?: number; peso?: 400 | 500 | 600 | 700 }): number =>
  larguraPeloMaior(textos, (t) => medirNaRegua(t, e.peso ?? 400), { piso: e.piso, teto: Number.MAX_SAFE_INTEGER, folga: e.folga ?? 18 });

/** largura de coluna medida a 11px → em da célula (a coluna acompanha a fonte da régua) */
export const emDaRegua = (px11: number): string => `${Math.round((px11 / 11) * 1000) / 1000}em`;

export const REGUA_FIN = {
  /** na `<table>`: a fonte da célula (é dela que o `em` das colunas sai) */
  tabela: 'text-[length:var(--fin-td)]',
  td: 'text-[length:var(--fin-td)]',
  th: 'text-[length:var(--fin-th)]',
  total: 'text-[length:var(--fin-td)] font-bold',
  data: 'text-[length:var(--fin-data)]',
  /** a altura da linha (célula, cabeçalho e total) */
  linha: 'h-[var(--fin-linha)]',
  /** FIN-FINANC-LAYOUT-03 — decisão do Gabriel (Chat 16:58): "SEM QUEBRAR" — texto de célula inteiro numa linha, nunca "…" nem 2 linhas;
   *  quem garante é a LARGURA da coluna (`larguraDoMaior`). Só a Obs. das liberações (texto livre e longo) quebra. */
  inteiro: 'block whitespace-nowrap',
  /** a entrelinha que cabe na linha (1px da borda de baixo) */
  entrelinha: 'leading-[calc(var(--fin-linha)-1px)]',
} as const;

/** O cabeçalho que ordena: botão no `th`, seta da direção, `aria-sort`. Quem desenha a cor/padding passa em `className`. */
export function ThOrdenavel<K extends string>({ col, ordem, aoOrdenar, direita = false, className = '', title, testId, children }: {
  col: K; ordem: Ordem<K>; aoOrdenar: (col: K) => void; direita?: boolean; className?: string; title?: string; testId?: string; children: ReactNode;
}) {
  const ativo = ordem.col === col;
  const Seta = !ativo ? ChevronsUpDown : ordem.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th className={`${className} ${direita ? 'text-right' : 'text-left'}`} title={title} data-testid={testId} data-coluna={col}
      aria-sort={ativo ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => aoOrdenar(col)} data-ordenar={col}
        className={`inline-flex max-w-full items-center gap-[2px] whitespace-nowrap font-[inherit] hover:underline ${direita ? 'flex-row-reverse' : ''}`}>
        <span>{children}</span>
        <Seta className={`size-[0.9em] shrink-0 ${ativo ? '' : 'opacity-60'}`} aria-hidden />
      </button>
    </th>
  );
}
