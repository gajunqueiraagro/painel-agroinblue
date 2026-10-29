import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TH_REGUA } from '@/components/ui/regua-tabela';
import type { ItemDoDia } from '@/lib/conciliacao/linhasDoDia';

/**
 * ListaDoMesPorDia — P159a (CONC-TELAS-01, D2): a lista do mês de UMA conta, dia a dia — o Extrato (banco) e o Extrato do sistema.
 *
 * A forma é uma só e as colunas vêm de quem chama: a data (dd/mm) SÓ na 1ª linha do dia, a linha divisória no fim de cada dia,
 * "Saldo inicial" no topo e o rodapé PRESO fora da lista (só a lista rola). A ordem do dia é a de `porDia` (maior |valor|
 * primeiro); o saldo do fim do dia quem dá é quem chama, lido da fonte de hoje (`CelSaldoDoDia`) — nada se soma aqui.
 * ⚠ RÉGUA FIXA: `table-layout: fixed` e `colgroup` em px; só UMA coluna sem largura (a de texto), que fica com o que sobra. Linha de
 *   19px a 10,5px; cabeçalho navy de 22px (`TH_REGUA`).
 */
export interface ColunaDaLista {
  titulo: string;
  /** em px; sem largura = a coluna de texto, com o resto */
  largura?: number;
  alinhar?: 'right' | 'center';
}

/** A célula da linha: 19px, 10,5px, uma linha (o texto longo termina em "…" com o `title`, quem chama põe `truncate`). */
export const TD_LISTA = 'h-[19px] px-[5px] py-0 text-[10.5px] leading-[18px] whitespace-nowrap overflow-hidden';
export const TD_LISTA_NUM = cn(TD_LISTA, 'text-right tabular-nums');

/** "01/10" — a data da linha (dd/mm, sem o ano: o mês está no cabeçalho da tela). */
export const diaCurto = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

/** O saldo do fim do dia: só na última linha do dia, em negrito; nas outras o lugar fica vazio (a coluna não muda de largura). */
export function CelSaldoDoDia({ fimDoDia, saldo, className, testid }: {
  fimDoDia: boolean; saldo: string | null; className?: string; testid?: string;
}) {
  return (
    <td className={cn(TD_LISTA_NUM, fimDoDia && 'font-bold', className)} data-testid={fimDoDia ? testid : undefined}>
      {fimDoDia ? (saldo ?? '—') : ''}
    </td>
  );
}

export function ListaDoMesPorDia<T>({ linhas, colunas, chave, celulas, saldoInicial, rodape, classeDaLinha, aoClicar, testid, testidLinha }: {
  linhas: readonly ItemDoDia<T>[];
  /** a 1ª é a Data (a lista a desenha); as outras, na ordem, são as que `celulas` devolve */
  colunas: readonly ColunaDaLista[];
  chave: (t: T, i: number) => string;
  /** as células da linha DEPOIS da data (uma por coluna) */
  celulas: (x: ItemDoDia<T>) => ReactNode;
  /** "Saldo inicial (extrato)" e o valor, na coluna do saldo (índice em `colunas`) */
  saldoInicial: { rotulo: string; valor: ReactNode; coluna: number; className?: string; testid?: string };
  /** preso embaixo, fora da lista que rola */
  rodape: ReactNode;
  classeDaLinha?: (x: ItemDoDia<T>) => string | undefined;
  aoClicar?: (t: T) => void;
  testid?: string;
  testidLinha?: string;
}) {
  const n = colunas.length;
  const colgroup = <colgroup>{colunas.map((c, i) => <col key={i} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>;
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t">
      {/* ⚠ UM SCROLLPORT SÓ: a lista. O vão da barra é reservado (`scrollbar-gutter: stable`) para a régua não andar quando a barra
          aparece ou some (filtro, mês com poucas linhas). */}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]" data-testid={testid}>
        {/* `data-dia-mes`: a EXCEÇÃO DECLARADA do gate de cortes (D7 do P159a, Gabriel 28/10) — a coluna Data desta lista é dd/mm */}
        <table className="w-full table-fixed border-separate border-spacing-0" data-dia-mes="">
          {colgroup}
          <thead className="sticky top-0 z-[3] bg-primary">
            <tr>
              {colunas.map((c, i) => (
                <th key={i} className={cn(TH_REGUA, 'px-[5px]', c.alinhar === 'right' ? 'text-right' : c.alinhar === 'center' ? 'px-0 text-center' : 'text-left')}>{c.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-muted/50 font-semibold">
              <td className={cn(TD_LISTA, 'border-b border-border')} />
              <td colSpan={Math.max(1, saldoInicial.coluna - 1)} className={cn(TD_LISTA, 'border-b border-border')}>{saldoInicial.rotulo}</td>
              <td className={cn(TD_LISTA_NUM, 'border-b border-border', saldoInicial.className)} data-testid={saldoInicial.testid}>{saldoInicial.valor}</td>
              {n - saldoInicial.coluna - 1 > 0 && <td colSpan={n - saldoInicial.coluna - 1} className={cn(TD_LISTA, 'border-b border-border')} />}
            </tr>
            {linhas.map((x, i) => (
              <tr key={chave(x.item, i)} data-testid={testidLinha} data-fim-do-dia={x.fimDoDia ? 'sim' : undefined}
                onClick={aoClicar ? () => aoClicar(x.item) : undefined}
                className={cn(aoClicar && 'cursor-pointer hover:bg-muted/50', classeDaLinha?.(x),
                  /* a divisória entre os dias: a última linha do dia leva a linha forte */
                  x.fimDoDia ? '[&>td]:border-b [&>td]:border-foreground/25' : '[&>td]:border-b [&>td]:border-border/50')}>
                <td className={cn(TD_LISTA, 'text-[9.5px] tabular-nums text-muted-foreground')} data-testid="lista-dia">{x.primeiraDoDia ? diaCurto(x.dia) : ''}</td>
                {celulas(x)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex h-[23px] shrink-0 items-center gap-3.5 overflow-hidden whitespace-nowrap border-t bg-muted px-[5px] text-[10.5px]"
        data-testid={testid ? `${testid}-rodape` : undefined}>
        {rodape}
      </div>
    </div>
  );
}
