/**
 * CPR-LAYOUT-03 (pontos 2–3, mock aprovado 15/11 11:25) — A LISTA DOS VENCIDOS, aberta pelo "Ver e confirmar" da faixa do topo da
 * Contas a Pagar e Receber. Os vencidos saíram da tabela; aqui estão todos, com as MESMAS colunas da lista (Comp. · Venc. · Descrição ·
 * Fornecedor · Subcentro · NF · Status · Valor), toda coluna ordena e o padrão é o vencimento crescente (o mais antigo primeiro).
 * Clicar numa linha abre o lançamento (o mesmo modal da lista). O ● âmbar marca o vencido que não apareceu no extrato já conciliado.
 * ⚠ O "confirmar" (ainda vai acontecer → entra no saldo de hoje; não vai → cancelar com desfazer) espera a decisão D1 do Gabriel:
 * enquanto isso todos seguem contando no saldo de hoje, como a faixa diz, e o rodapé ensina o caminho de hoje (abrir e ajustar).
 */
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { QUADRO_REGUA } from '@/components/ui/regua-tabela';
import { COR_SINAL } from '@/lib/oc/contaCorrente';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import {
  ORDEM_PADRAO_CPR, ROTULO_DA_COLUNA_CPR, ordenarLinhasCpr, proximaOrdemCpr, type ChavesDaLinhaCpr, type ColunaCpr, type OrdemCpr,
} from '@/lib/financeiro/cprOrdem';

/** As colunas da lista, em px (a Descrição fica com a sobra) — as da tabela principal (`cprLargura.ts`). */
const COLUNAS: readonly { coluna: ColunaCpr; largura?: number; alinhar?: 'right' | 'center' }[] = [
  { coluna: 'comp', largura: 64 }, { coluna: 'venc', largura: 72 }, { coluna: 'descricao' }, { coluna: 'fornecedor', largura: 200 },
  { coluna: 'subcentro', largura: 170 }, { coluna: 'nf', largura: 80 }, { coluna: 'status', largura: 80, alinhar: 'center' },
  { coluna: 'valor', largura: 118, alinhar: 'right' },
];
const semMoeda = (v: number) => formatMoeda(Math.abs(v)).replace(/^R\$\s?/, '');
const dataCurta = (iso: string | null) => (iso ? format(parseISO(iso), 'dd/MM/yy') : '—');

export function CprVencidosDialog<T extends { id: string }>({ aberto, aoFechar, linhas, chaves, chaveDaLinha, foraDoExtrato, receber, abrir }: {
  aberto: boolean;
  aoFechar: () => void;
  /** os vencidos em aberto (os que contam no saldo de hoje), do dono do recorte */
  linhas: readonly T[];
  /** o que cada coluna mostra e compara — a MESMA função da tabela principal */
  chaves: (l: T) => ChavesDaLinhaCpr;
  chaveDaLinha: (l: T) => string;
  /** os que não apareceram no extrato já conciliado (o ● âmbar) */
  foraDoExtrato: ReadonlySet<string>;
  receber: (l: T) => boolean;
  abrir: (id: string) => void;
}) {
  const [ordem, setOrdem] = useState<OrdemCpr>(ORDEM_PADRAO_CPR);
  const ordenadas = useMemo(() => ordenarLinhasCpr(linhas, ordem, chaves), [linhas, ordem, chaves]);
  const totais = useMemo(() => {
    let pagar = 0, aReceber = 0;
    for (const l of linhas) { const v = Math.abs(chaves(l).valor); if (receber(l)) aReceber += v; else pagar += v; }
    return { pagar, receber: aReceber };
  }, [linhas, chaves, receber]);

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[80vh] max-w-[1180px] flex-col gap-2 p-4" data-testid="cpr-vencidos-dialog">
        <DialogTitle className="text-[14px] font-semibold text-primary">
          {linhas.length} {linhas.length === 1 ? 'vencido' : 'vencidos'} em aberto
        </DialogTitle>
        <DialogDescription className="text-[12px]">
          Contam no saldo de hoje. Do mais antigo para o mais novo; clique no cabeçalho para ordenar por outra coluna e na linha para abrir.
        </DialogDescription>
        <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
          <div className="min-h-0 flex-1 overflow-auto rolagem-fina">
            <table className="w-full table-fixed border-collapse text-[12px]">
              <colgroup>
                {COLUNAS.map((c) => <col key={c.coluna} style={c.largura ? { width: c.largura } : undefined} />)}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
                <tr>
                  {COLUNAS.map((c) => {
                    const ativa = ordem.coluna === c.coluna;
                    return (
                      <th key={c.coluna} className={cn('h-[24px] px-2 text-[11px] font-semibold', c.alinhar === 'right' ? 'text-right' : c.alinhar === 'center' ? 'text-center' : 'text-left')}
                        aria-sort={ativa ? (ordem.sentido === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" data-ordenar={c.coluna} onClick={() => setOrdem((o) => proximaOrdemCpr(o, c.coluna))}
                          title={`Ordenar por ${ROTULO_DA_COLUNA_CPR[c.coluna]}`} className="inline-flex items-center gap-0.5 whitespace-nowrap hover:underline">
                          {ROTULO_DA_COLUNA_CPR[c.coluna]}
                          <span className="inline-block w-[8px] text-[8px]" aria-hidden>{ativa ? (ordem.sentido === 'asc' ? '▲' : '▼') : ''}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((l) => {
                  const k = chaves(l);
                  const fora = foraDoExtrato.has(chaveDaLinha(l));
                  const td = 'h-[22px] border-b px-2 whitespace-nowrap';
                  return (
                    <tr key={chaveDaLinha(l)} data-testid="cpr-vencido-linha" className="cursor-pointer hover:bg-muted/50" onClick={() => abrir(l.id)}
                      title="Abrir o lançamento">
                      <td className={cn(td, 'text-[10.5px] tabular-nums text-muted-foreground')}>{dataCurta(k.comp)}</td>
                      <td className={cn(td, 'text-[10.5px] tabular-nums', COR_SINAL.neg)}>
                        {dataCurta(k.venc)}
                        {fora && <span className="ml-1 text-amber-600" title="não apareceu no extrato já conciliado">●</span>}
                      </td>
                      <td className={cn(td, 'truncate')} title={k.descricao || '—'}>{k.descricao || '—'}</td>
                      <td className={cn(td, 'truncate')} title={k.fornecedor || '—'}>{k.fornecedor || '—'}</td>
                      <td className={cn(td, 'truncate')} title={k.subcentro || '—'}>{k.subcentro || '—'}</td>
                      <td className={cn(td, 'truncate text-[10px] tabular-nums text-muted-foreground')} title={k.nf || undefined}>{k.nf}</td>
                      <td className={cn(td, 'text-center text-[10.5px]')}>{k.status || '—'}</td>
                      <td className={cn(td, 'text-right tabular-nums', k.valor < 0 ? COR_SINAL.neg : COR_SINAL.pos)}>
                        {k.valor < 0 ? '−' : '+'}{semMoeda(k.valor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex h-[26px] shrink-0 items-center gap-3 border-t-2 border-t-primary px-2 text-[12px] font-bold text-primary" data-testid="cpr-vencidos-total">
            <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground"
              title="Ainda vai acontecer? Abra a conta e ajuste o vencimento. Não vai acontecer? Abra e cancele.">
              Ainda vai acontecer? Abra a conta e ajuste o vencimento. Não vai acontecer? Abra e cancele.
            </span>
            <span className={cn('whitespace-nowrap tabular-nums', COR_SINAL.neg)}>a pagar −{semMoeda(totais.pagar)}</span>
            {totais.receber > 0 && <span className={cn('whitespace-nowrap tabular-nums', COR_SINAL.pos)}>a receber +{semMoeda(totais.receber)}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
