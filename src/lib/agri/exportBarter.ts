/**
 * O EXPORT DO BARTER — insumos e vendas em Excel e PDF (PR-AGRI-BARTER-POLISH).
 *
 * ⚠ NADA DE LIB NOVA, como no export da colheita: `xlsx` pelo `triggerXlsxDownload` e `jspdf`
 * pelo chassi de `lib/pdf`. Acrescentar uma terceira biblioteca de planilha para duas tabelas
 * seria pagar peso de bundle por conveniência.
 * ⚠ QUEM MONTA OS DADOS É A TELA. Estas funções recebem as linhas prontas — as MESMAS que o
 * modal mostra. Buscar de novo aqui abriria a porta para o papel divergir do que está à vista,
 * que é o defeito clássico de relatório.
 */
import { triggerXlsxDownload, type XlsxCellValue } from '@/lib/xlsxDownload';
import {
  criarDocRetratoA4, carregarLogoBase64, addHeader, addTituloSecao, addFooterComPaginacao,
} from '@/lib/pdf/pdfChassi';
import autoTable from 'jspdf-autotable';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaUnidade } from '@/lib/agri/unidades';
import { labelDaClasse } from '@/lib/agri/barterVenda';
import type { BarterInsumo } from '@/hooks/useBarterInsumos';
import type { BarterVenda } from '@/hooks/useBarterVenda';
import type { LinhaExtrato } from '@/hooks/useBarterMaterializacao';

export interface ContextoBarter {
  cliente: string;
  contrato: string;
  parceiro: string;
  cultura: string;
  /** Mapa id→código da safra: o papel não leva UUID. */
  nomeDaSafra: (id: string | null) => string;
}

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

const limpo = (t: string) => t
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function nomeDoArquivoBarter(contrato: string, perna: string, ext: string): string {
  return `barter_${limpo(contrato) || 'contrato'}_${perna}.${ext}`;
}

/**
 * ⚠ O NÚMERO VAI COMO NÚMERO NA PLANILHA, não como texto formatado. O cliente que abre o Excel
 * vai somar a coluna; "R$ 1.234,56" em célula de texto soma zero e ninguém entende por quê. A
 * formatação é problema de quem lê — o dado tem de chegar somável.
 */
export function exportarInsumosXlsx(
  insumos: readonly BarterInsumo[], ctx: ContextoBarter, total: number,
): void {
  const cabecalho: Array<Record<string, XlsxCellValue>> = [
    { Campo: 'Cliente', Valor: ctx.cliente },
    { Campo: 'Contrato', Valor: ctx.contrato },
    { Campo: 'Parceiro', Valor: ctx.parceiro },
    { Campo: 'Cultura', Valor: ctx.cultura },
    { Campo: 'Total recebido', Valor: total },
  ];
  const linhas = insumos.map(i => ({
    Produto: i.produto,
    NF: i.nf_numero ?? '',
    'Data da NF': dataBR(i.data_recebimento),
    Quantidade: i.quantidade ?? '',
    Unidade: labelDaUnidade(i.unidade),
    Safra: ctx.nomeDaSafra(i.safra_id),
    Valor: Number(i.valor) || 0,
    /* ⚠ A COLUNA DIZ SE JÁ FOI AO DRE. Sem ela, duas exportações do mesmo contrato em momentos
       diferentes pareceriam iguais, e o operador não saberia qual já virou lançamento. */
    'No DRE': i.financeiro_lancamento_id ? 'sim' : 'não',
  }));
  triggerXlsxDownload({
    filename: nomeDoArquivoBarter(ctx.contrato, 'insumos', 'xlsx'),
    sheets: [{ name: 'Resumo', rows: cabecalho }, { name: 'Insumos', rows: linhas }],
  });
}

export function exportarVendasXlsx(
  vendas: readonly BarterVenda[], ctx: ContextoBarter, total: number,
): void {
  const cabecalho: Array<Record<string, XlsxCellValue>> = [
    { Campo: 'Cliente', Valor: ctx.cliente },
    { Campo: 'Contrato', Valor: ctx.contrato },
    { Campo: 'Parceiro', Valor: ctx.parceiro },
    { Campo: 'Cultura', Valor: ctx.cultura },
    { Campo: 'Total entregue (líquido)', Valor: total },
  ];
  /* ⚠ UMA LINHA POR ENTREGA, não por venda: é a classe que carrega sacas e preço, e uma venda
     com três classes numa linha só perderia justamente o detalhe que se quer conferir. */
  type LinhaVenda = Record<string, XlsxCellValue>;
  const linhas: LinhaVenda[] = vendas.flatMap((v): LinhaVenda[] => (v.entregas.length === 0
    ? [{
      Data: dataBR(v.data_operacao), Cultura: v.cultura, Classe: '—',
      Sacas: '', 'R$/saca': '', Valor: 0,
      Bruto: Number(v.valor_bruto) || 0, Deduções: Number(v.descontos) || 0,
      Líquido: Number(v.valor_liquido) || 0,
    }]
    : v.entregas.map(e => ({
      Data: dataBR(v.data_operacao),
      Cultura: v.cultura,
      Classe: labelDaClasse(e.classe_aflatoxina),
      Sacas: Number(e.sacas) || 0,
      'R$/saca': Number(e.preco_saca) || 0,
      Valor: Number(e.valor) || 0,
      Bruto: Number(v.valor_bruto) || 0,
      Deduções: Number(v.descontos) || 0,
      Líquido: Number(v.valor_liquido) || 0,
    }))));
  triggerXlsxDownload({
    filename: nomeDoArquivoBarter(ctx.contrato, 'vendas', 'xlsx'),
    sheets: [{ name: 'Resumo', rows: cabecalho }, { name: 'Vendas', rows: linhas }],
  });
}

/**
 * ⚠ `columnStyles` SÓ VALE PARA O `body` no jspdf-autotable — o `foot` o ignora, e foi assim que
 * o total do PDF da colheita saiu alinhado à esquerda (PR-AGRI-COLHEITA-PDF-TOTAL-ALINHA). Por
 * isso o alinhamento entra por `didParseCell`, que enxerga as três seções.
 */
const alinharADireita = (colunas: readonly number[]) => (d: {
  column: { index: number }; cell: { styles: { halign: string } };
}) => {
  if (colunas.includes(d.column.index)) d.cell.styles.halign = 'right';
};

const brl = (v: number) => `R$ ${formatNum(v, 2)}`;

async function docComHeader(ctx: ContextoBarter, titulo: string) {
  const doc = criarDocRetratoA4();
  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }
  /* ⚠ `infoLinha`, NÃO `cliente`: o chassi não tem esse campo. O nome do cliente entra na linha
     de informação, que é onde as outras telas o põem. */
  const y = addHeader(doc, {
    titulo,
    subtitulo: `${ctx.contrato} · ${ctx.parceiro} · ${ctx.cultura}`,
    infoLinha: ctx.cliente,
    logoData,
  });
  return { doc, y };
}

export async function exportarInsumosPdf(
  insumos: readonly BarterInsumo[], ctx: ContextoBarter, total: number,
): Promise<void> {
  const { doc, y } = await docComHeader(ctx, 'Barter — insumos recebidos');
  const y2 = addTituloSecao(doc, 'Insumos', y);
  autoTable(doc, {
    startY: y2,
    head: [['Produto', 'NF', 'Data', 'Quantidade', 'Safra', 'Valor']],
    body: insumos.map(i => [
      i.produto,
      i.nf_numero ?? '—',
      dataBR(i.data_recebimento),
      i.quantidade == null ? '—' : `${formatNum(i.quantidade, 2)} ${i.unidade ?? ''}`.trim(),
      ctx.nomeDaSafra(i.safra_id),
      brl(Number(i.valor) || 0),
    ]),
    foot: [['Total recebido', '', '', '', '', brl(total)]],
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 58, 95] },
    footStyles: { fillColor: [30, 58, 95] },
    didParseCell: alinharADireita([3, 5]),
  });
  addFooterComPaginacao(doc);
  doc.save(nomeDoArquivoBarter(ctx.contrato, 'insumos', 'pdf'));
}

export async function exportarVendasPdf(
  vendas: readonly BarterVenda[], ctx: ContextoBarter, total: number,
): Promise<void> {
  const { doc, y } = await docComHeader(ctx, 'Barter — vendas de grão');
  const y2 = addTituloSecao(doc, 'Entregas por classe', y);
  const body: string[][] = vendas.flatMap((v): string[][] => (v.entregas.length === 0
    ? [[dataBR(v.data_operacao), '—', '—', '—', brl(Number(v.valor_liquido) || 0)]]
    : v.entregas.map(e => [
      dataBR(v.data_operacao),
      labelDaClasse(e.classe_aflatoxina),
      formatNum(Number(e.sacas) || 0, 2),
      brl(Number(e.preco_saca) || 0),
      brl(Number(e.valor) || 0),
    ])));
  autoTable(doc, {
    startY: y2,
    head: [['Data', 'Classe', 'Sacas', 'R$/saca', 'Valor']],
    body,
    foot: [['Total entregue (líquido)', '', '', '', brl(total)]],
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 58, 95] },
    footStyles: { fillColor: [30, 58, 95] },
    didParseCell: alinharADireita([2, 3, 4]),
  });
  addFooterComPaginacao(doc);
  doc.save(nomeDoArquivoBarter(ctx.contrato, 'vendas', 'pdf'));
}

/**
 * O EXTRATO DA PERMUTA — item 8 do polish.
 *
 * ⚠ O SALDO ACUMULADO VAI JUNTO, e é o motivo de exportar: quem confere com a cooperativa segue
 * linha a linha até o saldo final. Uma planilha só com movimento obrigaria a refazer a soma —
 * e refazer a soma é exatamente onde as duas partes divergem.
 */
export function exportarExtratoXlsx(
  linhas: readonly LinhaExtrato[], ctx: ContextoBarter, saldo: number, conta: string,
): void {
  const cabecalho: Array<Record<string, XlsxCellValue>> = [
    { Campo: 'Cliente', Valor: ctx.cliente },
    { Campo: 'Contrato', Valor: ctx.contrato },
    { Campo: 'Conta de permuta', Valor: conta },
    { Campo: 'Saldo', Valor: saldo },
  ];
  triggerXlsxDownload({
    filename: nomeDoArquivoBarter(ctx.contrato, 'extrato', 'xlsx'),
    sheets: [
      { name: 'Resumo', rows: cabecalho },
      {
        name: 'Extrato',
        rows: linhas.map(l => ({
          Data: dataBR(l.data),
          Descrição: l.descricao,
          Movimento: l.movimento,
          Saldo: l.saldo,
        })),
      },
    ],
  });
}

export async function exportarExtratoPdf(
  linhas: readonly LinhaExtrato[], ctx: ContextoBarter, saldo: number, conta: string,
): Promise<void> {
  const { doc, y } = await docComHeader(ctx, 'Barter — extrato da permuta');
  const y2 = addTituloSecao(doc, conta, y);
  autoTable(doc, {
    startY: y2,
    head: [['Data', 'Descrição', 'Movimento', 'Saldo']],
    body: linhas.map(l => [dataBR(l.data), l.descricao, brl(l.movimento), brl(l.saldo)]),
    foot: [['Saldo final', '', '', brl(saldo)]],
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 58, 95] },
    footStyles: { fillColor: [30, 58, 95] },
    didParseCell: alinharADireita([2, 3]),
  });
  addFooterComPaginacao(doc);
  doc.save(nomeDoArquivoBarter(ctx.contrato, 'extrato', 'pdf'));
}
