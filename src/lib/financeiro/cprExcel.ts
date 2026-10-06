/**
 * cprExcel — CPR-EXPORT-01. A planilha de Contas a Pagar e Receber, pelo caminho de sempre (`triggerXlsxDownload` → função
 * `export-xlsx`, o mesmo do Financeiro). Recebe o que a tela mostra; NÃO soma, NÃO filtra.
 *
 * ⚠ VALORES VÃO COMO NÚMERO. ⚠ DATAS VÃO COMO TEXTO DD/MM/AAAA: a função `export-xlsx` só aceita texto, número, booleano e nulo
 * (não há célula de data no contrato dela) — é a convenção do exportador do Financeiro. Data como DATA pede mudar a função.
 */
import type { XlsxDownloadPayload, XlsxCellValue } from '@/lib/xlsxDownload';
import type { SerieDoSaldoCpr } from '@/lib/financeiro/cprRecorte';
import { contaDaFolha, datasDoModelo, type EntradaDoModelo, type GrupoDaTela, type LinhaDaTela } from '@/lib/pdf/cpr/modeloCpr';

const ROTULO_DO_GRUPO: Record<GrupoDaTela<unknown>['tipo'], string> = {
  vencidos_contam: 'vencido que conta', vencidos_anteriores: 'vencido anterior', entre: 'antes do período', dia: 'período', sem_vencimento: 'sem vencimento',
};
const dataCheia = (iso: string | null | undefined): string => (iso && iso.length >= 10 ? datasDoModelo.dma(iso) : '');
const numero = (v: unknown): number | null => { const n = Math.abs(Number(v ?? 0)); return Number.isFinite(n) ? n : null; };

export function montarPayloadExcelCpr<L extends LinhaDaTela>(e: {
  arquivo: string; grupos: GrupoDaTela<L>[]; serie: SerieDoSaldoCpr; de: EntradaDoModelo<L>['de']; incluirVencidos: boolean; hoje: string;
}): XlsxDownloadPayload {
  const contas: Record<string, XlsxCellValue>[] = [];
  for (const g of e.grupos) {
    for (const l of g.linhas) {
      const c = contaDaFolha(l, e.de);
      const receber = e.de.receber(l);
      contas.push({
        'Comp.': dataCheia(l.data_competencia), 'Venc.': dataCheia(l.data_vencimento), 'Pgto.': c.paga ? dataCheia(l.data_pagamento) : '',
        'Descrição': c.descricao, 'Fornecedor': c.fornecedor, 'Conta': c.conta, 'Subcentro': c.subcentro, 'Centro': c.centro, 'Macro': c.macro,
        'Safra': c.safra, 'Faz.': c.faz, 'Status': c.status, 'Origem': c.origem, 'Doc': c.doc,
        'A pagar': receber ? null : numero(l.valor), 'A receber': receber ? numero(l.valor) : null,
        'Grupo': c.paga ? 'paga (não soma)' : ROTULO_DO_GRUPO[g.tipo],
      });
    }
  }
  const s = e.serie;
  const saldoPorDia: XlsxCellValue[][] = [
    ['Data', 'A pagar', 'A receber', 'Saldo depois do dia'],
    ['Saldo hoje', null, null, s.hoje],
    ['Vencidos que contam no saldo', s.partida.pagar.valor, s.partida.receber.valor, s.partida.saldo],
    ...(s.entreHojeEDe ? [['Entre hoje e o início do período', s.entreHojeEDe.pagar.valor, s.entreHojeEDe.receber.valor, s.entreHojeEDe.saldo]] : []),
    ...s.dias.map((d): XlsxCellValue[] => [dataCheia(d.data), d.pagar.valor, d.receber.valor, d.saldo]),
  ];
  return {
    filename: `${e.arquivo}.xlsx`,
    sheets: [
      { name: 'Contas', mode: 'json', rows: contas,
        cols: [{ wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 34 }, { wch: 28 }, { wch: 20 }, { wch: 26 }, { wch: 20 }, { wch: 20 }, { wch: 11 }, { wch: 6 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }] },
      { name: 'Saldo por dia', mode: 'aoa', rows: saldoPorDia, cols: [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 18 }] },
    ],
  };
}
