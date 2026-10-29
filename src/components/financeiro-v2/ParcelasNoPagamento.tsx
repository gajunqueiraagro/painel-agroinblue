/**
 * AS PARCELAS DA COMPRA NA ABA PAGAMENTO — P143 PAGAMENTO-PARCELAS-01 (mock aprovado ~/Downloads/mock-pagamento-parcelas-v1.html; Gabriel 29/10 11:35).
 * A tabela do bloco Parcelamento da aba Pagamento: Parc. · Venc. · Pgto. · Valor · Status (o selo da tela do contrato) · Conta. A parcela
 * ABERTA fica destacada; clicar noutra a abre no MESMO modal (`onAbrir`; sem ele, as linhas so' se leem). As linhas vem prontas
 * (`parcelasNoPagamento.ts`): nada se soma aqui; a linha de totais e' a do banco.
 * ⚠ NAO E' o `ParcelasDaCompra` (a tabela das parcelas da aba Documentos, PARC-DOCS-TABELA-01): este so' le^ e abre a parcela.
 * ⚠ ALTURA FIXA: o corpo tem a altura de `linhasVisiveis` linhas (10, as do mock); acima disso so' o corpo rola. Nada se desloca ao trocar
 *   de parcela (`table-layout: fixed`, colunas em px; a Conta e' a coluna flexivel, com "…" e o nome inteiro no `title`).
 */
import type { ReactNode } from 'react';
import { REGUA_TABELA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { CLASSE_SITUACAO, ROTULO_SITUACAO } from '@/lib/financiamentos/situacaoDoContrato';
import { reais } from '@/lib/financeiro/nfe/formatos';
import type { LinhaDaParcela, TotaisDaCompra } from '@/lib/financeiro/parcelasNoPagamento';
import { cn } from '@/lib/utils';

const dataBR = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const COLUNAS = [44, 72, 72, 80, 64] as const;

export function ParcelasNoPagamento({ linhas, abertaId, totais = null, rodape = null, onAbrir, linhasVisiveis = 10 }: {
  linhas: readonly LinhaDaParcela[];
  /** o lancamento aberto no modal */
  abertaId: string | null;
  /** a linha de totais do banco (parcelamento); nula nas soltas */
  totais?: TotaisDaCompra | null;
  /** no lugar dos totais (as soltas: "soltas, sem parcelamento · achadas X de N") */
  rodape?: ReactNode;
  onAbrir?: (lancamentoId: string) => void;
  linhasVisiveis?: number;
}) {
  const alturaCorpo = REGUA_TABELA.linha * linhasVisiveis;
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded border border-border" data-testid="parcelas-no-pagamento">
      <table className="w-full table-fixed border-collapse">
        <colgroup>{COLUNAS.map((w, i) => <col key={i} style={{ width: w }} />)}<col /></colgroup>
        <thead className="bg-primary">
          <tr>
            <th className={cn(TH_REGUA, 'text-left')}>Parc.</th>
            <th className={cn(TH_REGUA, 'text-left')}>Venc.</th>
            <th className={cn(TH_REGUA, 'text-left')}>Pgto.</th>
            <th className={cn(TH_REGUA, 'text-right')}>Valor</th>
            <th className={cn(TH_REGUA, 'text-left')}>Status</th>
            <th className={cn(TH_REGUA, 'text-left')}>Conta</th>
          </tr>
        </thead>
      </table>
      <div className="min-h-0 overflow-y-auto" style={{ height: alturaCorpo }} data-testid="parcelas-no-pagamento-corpo">
        <table className="w-full table-fixed border-collapse">
          <colgroup>{COLUNAS.map((w, i) => <col key={i} style={{ width: w }} />)}<col /></colgroup>
          <tbody>
            {linhas.map((l) => {
              const aberta = !!abertaId && l.lancamentoId === abertaId;
              const clicavel = !!onAbrir && !!l.lancamentoId && !aberta;
              return (
                <tr key={`${l.numero}-${l.lancamentoId ?? ''}`} data-testid="parcela-no-pagamento" data-aberta={aberta ? 'sim' : undefined}
                  className={cn('border-b border-border/60', aberta && 'bg-primary/10 font-semibold', clicavel && 'cursor-pointer hover:bg-muted/60')}
                  title={clicavel ? `Abrir a parcela ${l.numero}/${l.total}` : aberta ? 'Esta é a parcela aberta' : undefined}
                  onClick={clicavel ? () => onAbrir?.(l.lancamentoId ?? '') : undefined}>
                  <td className={cn(TD_REGUA, 'tabular-nums')}>{l.numero}/{l.total}</td>
                  <td className={cn(TD_REGUA, 'tabular-nums')}>{dataBR(l.vencimento)}</td>
                  <td className={cn(TD_REGUA, 'tabular-nums')}>{dataBR(l.pagamento)}</td>
                  <td className={TD_REGUA_NUM}>{reais(l.valorCent)}</td>
                  <td className={TD_REGUA}>
                    <span className={cn('inline-block rounded-full px-1.5 text-[9.5px] font-medium leading-[14px]', CLASSE_SITUACAO[l.situacao])}
                      data-testid="parcela-no-pagamento-status">{ROTULO_SITUACAO[l.situacao]}</span>
                  </td>
                  <td className={TD_REGUA_TEXTO} title={l.conta ?? undefined}>{l.conta ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex h-[23px] shrink-0 items-center gap-3 bg-primary px-1 text-[10px] text-primary-foreground tabular-nums" data-testid="parcelas-no-pagamento-rodape">
        {totais ? (
          <>
            <span>{totais.qtd} parcelas · R$ {reais(totais.totalCent)}</span>
            <span>pagas {totais.pagasQtd} · R$ {reais(totais.pagasCent)}</span>
            <span>a pagar {totais.aPagarQtd} · R$ {reais(totais.aPagarCent)}</span>
          </>
        ) : rodape}
      </div>
    </div>
  );
}
