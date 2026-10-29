import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { dataBR } from '@/lib/datas/dataBR';
import { TH_REGUA } from '@/components/ui/regua-tabela';
import type { ItemDoDia } from '@/lib/conciliacao/linhasDoDia';

/**
 * ListaDoMesPorDia — P159a (CONC-TELAS-01, D2): a lista do mês de UMA conta, dia a dia — o Extrato (banco) e o Extrato do sistema.
 *
 * A forma é uma só e as colunas vêm de quem chama: a data (dd/mm) SÓ na 1ª linha do dia, a linha divisória no fim de cada dia,
 * "Saldo inicial" no topo e o rodapé PRESO fora da lista (só a lista rola). A ordem do dia é a de `porDia` (maior |valor|
 * primeiro); o saldo do fim do dia quem dá é quem chama, lido da fonte de hoje (`CelSaldoDoDia`) — nada se soma aqui.
 * ⚠ RÉGUA FIXA: `table-layout: fixed` e `colgroup` em px; só UMA coluna sem largura (a de texto), que fica com o que sobra.
 *   P159e (Gabriel 29/10, mock `mock-casar-abas-v1.html`): a régua da casa — a LINHA de movimento 18px a 10px (era 19 a 10,5 desde o
 *   P159a), a data dd/mm/aaaa a 9,5 em TODA linha; o SALDO INICIAL e o SALDO FINAL 22px a 10 em negrito, no cinza do fechamento (mais
 *   altos que as linhas, de propósito); cabeçalho navy de 22px a 9,5 (`TH_REGUA`).
 * ⚠ ALINHAMENTO SOBERANO (P159e): o "Saldo inicial", o saldo do fim do dia e o saldo final do RODAPÉ ficam na MESMA coluna (a de
 *   `id: 'saldo'`). O rodapé é uma tabela com o MESMO `colgroup` e o MESMO vão da barra (`scrollbar-gutter: stable`) — as bordas
 *   coincidem; quem chama monta as células dele (`<tr>`). O gate confere: `data-alinha-coluna` × `th[data-coluna]` (regra `alinhamento`).
 */
export interface ColunaDaLista {
  titulo: string;
  /** em px; sem largura = a coluna de texto, com o resto */
  largura?: number;
  alinhar?: 'right' | 'center';
  /** P159e — a coluna que os números de fora da linha (saldo inicial, rodapé) usam: o `th` ganha `data-coluna` */
  id?: string;
}

/** A célula da linha: 18px, 10px, uma linha (o texto longo termina em "…" com o `title`, quem chama põe `truncate`). */
export const TD_LISTA = 'h-[18px] px-[5px] py-0 text-[10px] leading-[17px] whitespace-nowrap overflow-hidden';
export const TD_LISTA_NUM = cn(TD_LISTA, 'text-right tabular-nums');
/** A célula do SALDO INICIAL e do SALDO FINAL (o rodapé preso): 22px, 10px em negrito, o cinza do fechamento (P159e, mock). */
export const TD_RODAPE = 'h-[22px] bg-[#f3f5f8] dark:bg-muted px-[5px] py-0 text-[10px] font-bold leading-[18px] whitespace-nowrap overflow-hidden';
/** A coluna do saldo (o `id` de `ColunaDaLista`) — o gate de cortes confere a borda direita dos números marcados com ela. */
export const COLUNA_SALDO = 'saldo';

/** A largura da coluna Data: "00/00/0000" a 9,5px tabular (~50) + o padding + folga — a data inteira nunca quebra (P159e). */
export const LARGURA_DATA = 70;

/** O saldo do fim do dia: só na última linha do dia, em negrito; nas outras o lugar fica vazio (a coluna não muda de largura). */
export function CelSaldoDoDia({ fimDoDia, saldo, className, testid }: {
  fimDoDia: boolean; saldo: string | null; className?: string; testid?: string;
}) {
  return (
    <td className={cn(TD_LISTA_NUM, fimDoDia && 'font-bold', className)} data-testid={fimDoDia ? testid : undefined}
      data-alinha-coluna={fimDoDia ? COLUNA_SALDO : undefined}>
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
  /** preso embaixo, fora da lista que rola: as LINHAS (`<tr>`) de uma tabela com as mesmas colunas (`TD_RODAPE`) */
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
                <th key={i} data-coluna={c.id} className={cn(TH_REGUA, 'px-[5px]', c.alinhar === 'right' ? 'text-right' : c.alinhar === 'center' ? 'px-0 text-center' : 'text-left')}>{c.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr data-testid="lista-saldo-inicial">
              <td className={cn(TD_RODAPE, 'border-b border-border')} />
              <td colSpan={Math.max(1, saldoInicial.coluna - 1)} className={cn(TD_RODAPE, 'border-b border-border')}>{saldoInicial.rotulo}</td>
              <td className={cn(TD_RODAPE, 'border-b border-border text-right tabular-nums', saldoInicial.className)} data-testid={saldoInicial.testid}
                data-alinha-coluna={colunas[saldoInicial.coluna]?.id}>{saldoInicial.valor}</td>
              {n - saldoInicial.coluna - 1 > 0 && <td colSpan={n - saldoInicial.coluna - 1} className={cn(TD_RODAPE, 'border-b border-border')} />}
            </tr>
            {linhas.map((x, i) => (
              <tr key={chave(x.item, i)} data-testid={testidLinha} data-fim-do-dia={x.fimDoDia ? 'sim' : undefined}
                onClick={aoClicar ? () => aoClicar(x.item) : undefined}
                className={cn(aoClicar && 'cursor-pointer hover:bg-muted/50', classeDaLinha?.(x),
                  /* a divisória entre os dias: a última linha do dia leva a linha forte */
                  x.fimDoDia ? '[&>td]:border-b [&>td]:border-foreground/25' : '[&>td]:border-b [&>td]:border-border/50')}>
                {/* P159e (mock): a data dd/mm/aaaa em TODA linha (era dd/mm só na 1ª do dia — a exceção D7 deixou de ser usada aqui) */}
                <td className={cn(TD_LISTA, 'text-[9.5px] tabular-nums text-muted-foreground')} data-testid="lista-dia">{dataBR(x.dia)}</td>
                {celulas(x)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* ⚠ O RODAPÉ NAS MESMAS COLUNAS (P159e): o mesmo `colgroup` e o mesmo vão da barra da lista de cima — o saldo final fica na
          borda direita da coluna Saldo, nunca solto numa faixa */}
      <div className="shrink-0 overflow-y-hidden border-t border-t-[#cfd6df] bg-[#f3f5f8] dark:bg-muted [scrollbar-gutter:stable]" data-testid={testid ? `${testid}-rodape` : undefined}>
        <table className="w-full table-fixed border-separate border-spacing-0">
          {colgroup}
          <tbody>{rodape}</tbody>
        </table>
      </div>
    </div>
  );
}
