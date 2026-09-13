/**
 * EXPORTAR A COLHEITA — Excel e PDF (PR-AGRI-COLHEITA-EXPORT-15).
 *
 * ⚠ NADA É RECALCULADO AQUI. Os totais chegam prontos, do MESMO `totaisColheita` que a tela
 * mostra: o papel que o produtor leva para a cooperativa tem de dizer o que a tela dizia. Um
 * segundo cálculo no export é a forma mais silenciosa de o relatório divergir do sistema — e
 * ninguém confere um PDF contra a tela antes de imprimir.
 * ⚠ NADA DE LIB NOVA. A casa já exporta: `xlsx` (0.18.5) pelo `triggerXlsxDownload`, e `jspdf`
 * + `jspdf-autotable` pelo chassi de `lib/pdf/pdfChassi` — logo, header, cards, tabela e
 * rodapé com paginação, o mesmo desenho do PDF de Compras e da Análise Executiva.
 * ⚠ O RECORTE É O DA TELA: exporta o que está sendo visto (safra + cultura + talhão, ou todos
 * os talhões). Exportar "tudo" quando a tela mostra um talhão seria entregar outro documento.
 */
import { format } from 'date-fns';
import { triggerXlsxDownload, type XlsxCellValue } from '@/lib/xlsxDownload';
import {
  criarDocRetratoA4, carregarLogoBase64, addHeader, addCardsKPI, addTituloSecao,
  addTabelaExecutiva, addFooterComPaginacao, PALETA,
} from '@/lib/pdf/pdfChassi';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { LIMITE_AFLATOXINA, unidadeDaCultura, type TotaisColheita } from '@/lib/agri/colheita';

/** Uma carga, já resolvida para exibição — nomes em vez de ids. */
export interface LinhaExport {
  fazenda: string;
  talhao: string;
  data: string;
  hora: string;
  ticket: string;
  nf: string;
  pesoFazendaKg: number | null;
  verdeKg: number | null;
  secoKg: number | null;
  umidadePct: number | null;
  aflatoxinaPpb: number | null;
  sacasBoas: number | null;
  graoRocaSacas: number | null;
}

export interface ContextoExport {
  cliente: string;
  safra: string;
  cultura: string;
  /** "Todos os talhões" ou o nome do pasto. */
  talhao: string;
  areaHa: number | null;
  /** Inclui a análise de produção e a classificação. */
  comAnalise: boolean;
}

/**
 * O NOME DO ARQUIVO.
 *
 * ⚠ SEM ACENTO, SEM ESPAÇO E SEM BARRA: a safra se chama "25/26-Lav", e a barra é separador de
 * diretório em todo sistema operacional — um arquivo assim ou falha ao salvar ou vira pasta.
 */
export function nomeDoArquivo(cultura: string, safra: string, extensao: string): string {
  const limpo = (t: string) => t
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `colheita_${limpo(cultura) || 'cultura'}_${limpo(safra) || 'safra'}.${extensao}`;
}

const dataBR = (iso: string) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/* O Excel recebe NÚMERO onde é número: formatar para texto aqui tiraria do operador a
   possibilidade de somar a coluna na própria planilha, que é metade do motivo de exportar. */
const n = (v: number | null): XlsxCellValue => (v == null ? null : v);

export function exportarColheitaXlsx(
  linhas: readonly LinhaExport[], totais: TotaisColheita, ctx: ContextoExport,
): void {
  const unidade = unidadeDaCultura(ctx.cultura);
  const cabecalho: Array<Record<string, XlsxCellValue>> = [
    { Campo: 'Cliente', Valor: ctx.cliente },
    { Campo: 'Safra', Valor: ctx.safra },
    { Campo: 'Cultura', Valor: labelDaCultura(ctx.cultura) },
    { Campo: 'Talhão', Valor: ctx.talhao },
    { Campo: 'Área (ha)', Valor: n(ctx.areaHa) },
    { Campo: 'Emitido em', Valor: format(new Date(), 'dd/MM/yyyy HH:mm') },
  ];

  const cargas: Array<Record<string, XlsxCellValue>> = linhas.map(l => ({
    Faz: l.fazenda, Talhão: l.talhao, Data: dataBR(l.data), Hora: l.hora,
    Ticket: l.ticket, NF: l.nf,
    'Peso fazenda (kg)': n(l.pesoFazendaKg),
    'Verde (kg)': n(l.verdeKg), 'Seco (kg)': n(l.secoKg),
    'Umidade (%)': n(l.umidadePct), 'Aflatoxina (ppb)': n(l.aflatoxinaPpb),
    'Sacas boas': n(l.sacasBoas), 'Roça (sc)': n(l.graoRocaSacas),
  }));
  /* A linha de total fecha a planilha como fecha a tela — e é a MESMA soma. */
  cargas.push({
    Faz: 'TOTAL', Talhão: '', Data: '', Hora: '', Ticket: '', NF: '',
    'Peso fazenda (kg)': null,
    'Verde (kg)': totais.verdeKg, 'Seco (kg)': totais.secoKg,
    'Umidade (%)': null, 'Aflatoxina (ppb)': null,
    'Sacas boas': totais.sacasBoas, 'Roça (sc)': totais.graoRocaSacas,
  });

  const sheets = [
    { name: 'Colheita', mode: 'json' as const, rows: cabecalho, cols: [{ wch: 16 }, { wch: 34 }] },
    {
      name: 'Cargas', mode: 'json' as const, rows: cargas,
      cols: [{ wch: 6 }, { wch: 10 }, { wch: 11 }, { wch: 7 }, { wch: 10 }, { wch: 10 },
        { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 14 }, { wch: 12 }, { wch: 11 }],
    },
  ];

  if (ctx.comAnalise) {
    const analise: Array<Record<string, XlsxCellValue>> = [
      { Indicador: 'Peso verde (kg)', Valor: totais.verdeKg, Observação: 'o que a cooperativa recebeu' },
      { Indicador: 'Peso seco (kg)', Valor: totais.secoKg, Observação: 'depois de secar' },
      { Indicador: 'Quebra de secagem (%)', Valor: n(totais.quebraPct), Observação: 'sobre o que já voltou seco' },
      { Indicador: 'Sacas boas', Valor: totais.sacasBoas, Observação: 'grão que vale preço' },
      { Indicador: 'Grão de roça (sc)', Valor: totais.graoRocaSacas, Observação: 'refugo' },
      { Indicador: 'Final aproveitado (sc)', Valor: totais.sacasFinais, Observação: 'boas + roça' },
      { Indicador: `Produtividade final (${unidade.unidadeProdutividade})`, Valor: n(totais.produtividadeFinal), Observação: 'aproveitado por hectare' },
      { Indicador: `Produtividade líquida (${unidade.unidadeProdutividade})`, Valor: n(totais.produtividade), Observação: 'só sacas boas' },
      { Indicador: 'Secagem paga (R$)', Valor: totais.valorSecagem, Observação: 'custo · à cooperativa' },
    ];
    const pct = (v: number) => (totais.sacasFinais > 0 ? (v / totais.sacasFinais) * 100 : 0);
    const classificacao: Array<Record<string, XlsxCellValue>> = [
      { Faixa: `até ${LIMITE_AFLATOXINA} ppb`, Sacas: totais.sacasAteLimite, '%': pct(totais.sacasAteLimite) },
      { Faixa: `acima de ${LIMITE_AFLATOXINA} ppb`, Sacas: totais.sacasAcimaLimite, '%': pct(totais.sacasAcimaLimite) },
      { Faixa: 'grão de roça', Sacas: totais.graoRocaSacas, '%': pct(totais.graoRocaSacas) },
    ];
    /* ⚠ "SEM LAUDO" SÓ APARECE SE EXISTIR, e fora das faixas: somá-la à primeira venderia um
       número que a cooperativa ainda não classificou. */
    if (totais.sacasSemClasse > 0) {
      classificacao.push({ Faixa: 'sem laudo', Sacas: totais.sacasSemClasse, '%': pct(totais.sacasSemClasse) });
    }
    classificacao.push({ Faixa: 'TOTAL', Sacas: totais.sacasFinais, '%': 100 });

    sheets.push({ name: 'Análise', mode: 'json' as const, rows: analise,
      cols: [{ wch: 32 }, { wch: 14 }, { wch: 30 }] });
    sheets.push({ name: 'Classificação', mode: 'json' as const, rows: classificacao,
      cols: [{ wch: 22 }, { wch: 14 }, { wch: 10 }] });
  }

  triggerXlsxDownload({ filename: nomeDoArquivo(ctx.cultura, ctx.safra, 'xlsx'), sheets });
}

/** Quantas cargas cabem numa página sem empurrar a análise para a segunda. */
const MAX_LINHAS_PDF = 22;

export async function exportarColheitaPdf(
  linhas: readonly LinhaExport[], totais: TotaisColheita, ctx: ContextoExport,
): Promise<void> {
  const doc = criarDocRetratoA4();
  /* O logo é carregado uma vez e passado ao header, que faz `addImage` síncrono — o padrão do
     chassi. Sem ele, o header sai sem logo em vez de falhar. */
  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }

  const unidade = unidadeDaCultura(ctx.cultura);
  let y = addHeader(doc, {
    titulo: 'Relatório de Colheita',
    subtitulo: `${labelDaCultura(ctx.cultura)} · Safra ${ctx.safra}`,
    infoLinha: `${ctx.cliente} · ${ctx.talhao}`
      + (ctx.areaHa != null ? ` · ${formatNum(ctx.areaHa, 2)} ha` : '')
      + ` · emitido em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
    logoData,
  });

  y = addCardsKPI(doc, [
    { label: 'Peso verde', valor: `${formatNum(totais.verdeKg, 2)} kg` },
    { label: 'Peso seco', valor: totais.secoKg > 0 ? `${formatNum(totais.secoKg, 2)} kg` : '—' },
    { label: 'Sacas boas', valor: `${formatNum(totais.sacasBoas, 2)} sc` },
    { label: 'Produtividade líquida', valor: totais.produtividade != null
      ? `${formatNum(totais.produtividade, 2)} ${unidade.unidadeProdutividade}` : '—' },
  ], y, { colunas: 4 });

  /* ⚠ A LISTA PODE SER RESUMIDA, e o relatório DIZ isso: uma safra de sessenta cargas não cabe
     em uma página, e cortar em silêncio faria o produtor somar de cabeça e não fechar. */
  const cortada = linhas.length > MAX_LINHAS_PDF;
  const mostradas = cortada ? linhas.slice(0, MAX_LINHAS_PDF) : linhas;
  y = addTituloSecao(doc, cortada
    ? `Cargas (${MAX_LINHAS_PDF} de ${linhas.length} — a planilha traz todas)`
    : `Cargas (${linhas.length})`, y);

  y = addTabelaExecutiva(doc, {
    startY: y,
    head: [['Faz', 'Talhão', 'Data', 'Ticket', 'Verde (kg)', 'Seco (kg)', 'Umid.', 'Afla.', 'Sacas', 'Roça']],
    body: mostradas.map(l => [
      l.fazenda, l.talhao, dataBR(l.data), l.ticket,
      l.verdeKg != null ? formatNum(l.verdeKg, 2) : '—',
      l.secoKg != null ? formatNum(l.secoKg, 2) : '—',
      l.umidadePct != null ? formatNum(l.umidadePct, 2) : '—',
      l.aflatoxinaPpb != null ? formatNum(l.aflatoxinaPpb, 2) : '—',
      l.sacasBoas != null ? formatNum(l.sacasBoas, 0) : '—',
      l.graoRocaSacas != null ? formatNum(l.graoRocaSacas, 0) : '—',
    ]),
    opts: {
      fontSize: 7,
      cellPadding: 1,
      foot: [['TOTAL', '', '', '',
        formatNum(totais.verdeKg, 2),
        totais.secoKg > 0 ? formatNum(totais.secoKg, 2) : '—',
        '', '',
        formatNum(totais.sacasBoas, 2),
        formatNum(totais.graoRocaSacas, 2)]],
      columnStyles: {
        4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
        7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' },
      },
      /* ⚠ AS MESMAS CORES DA TELA: acima do corte e roça em vermelho. O papel e a tela têm de
         apontar o mesmo grão — o corte vem do `LIMITE_AFLATOXINA`, nunca de um 20 escrito aqui. */
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        if (d.column.index === 7) {
          const ppb = mostradas[d.row.index]?.aflatoxinaPpb;
          if (ppb != null) d.cell.styles.textColor = ppb > LIMITE_AFLATOXINA
            ? [190, 40, 40] : PALETA.VERDE_POSITIVO;
        }
        if (d.column.index === 9 && (mostradas[d.row.index]?.graoRocaSacas ?? 0) > 0) {
          d.cell.styles.textColor = [190, 40, 40];
        }
      },
    },
  });

  if (ctx.comAnalise) {
    const pct = (v: number) => (totais.sacasFinais > 0 ? (v / totais.sacasFinais) * 100 : 0);
    y = addTituloSecao(doc, 'Classificação por qualidade', y + 2);
    const faixas: Array<[string, number]> = [
      [`até ${LIMITE_AFLATOXINA} ppb`, totais.sacasAteLimite],
      [`acima de ${LIMITE_AFLATOXINA} ppb`, totais.sacasAcimaLimite],
      ['grão de roça', totais.graoRocaSacas],
    ];
    if (totais.sacasSemClasse > 0) faixas.push(['sem laudo', totais.sacasSemClasse]);
    y = addTabelaExecutiva(doc, {
      startY: y,
      head: [['Faixa', 'Sacas', '%']],
      body: faixas.map(([rotulo, v]) => [rotulo, formatNum(v, 2), `${formatNum(pct(v), 1)}%`]),
      opts: {
        fontSize: 7, cellPadding: 1,
        foot: [['TOTAL', formatNum(totais.sacasFinais, 2), '100,0%']],
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        didParseCell: (d) => {
          /* Linha 1 é "acima do corte" e linha 2 é a roça — as duas em vermelho, como na tela. */
          if (d.section === 'body' && (d.row.index === 1 || d.row.index === 2)) {
            d.cell.styles.textColor = [190, 40, 40];
          }
        },
      },
    });

    y = addTituloSecao(doc, 'Perdas e custos', y + 2);
    addTabelaExecutiva(doc, {
      startY: y,
      head: [['Indicador', 'Valor']],
      body: [
        ['Quebra de secagem', totais.quebraPct != null
          ? `${formatNum(totais.quebraPct, 1)}% (${formatNum(totais.verdeKg - totais.secoKg, 2)} kg)` : '—'],
        ['Secagem paga', totais.valorSecagem > 0 ? `R$ ${formatNum(totais.valorSecagem, 2)}` : '—'],
        [`Produtividade final (${unidade.unidadeProdutividade})`,
          totais.produtividadeFinal != null ? formatNum(totais.produtividadeFinal, 2) : '—'],
        [`Produtividade líquida (${unidade.unidadeProdutividade})`,
          totais.produtividade != null ? formatNum(totais.produtividade, 2) : '—'],
      ],
      opts: { fontSize: 7, cellPadding: 1, columnStyles: { 1: { halign: 'right' } } },
    });
  }

  addFooterComPaginacao(doc);
  doc.save(nomeDoArquivo(ctx.cultura, ctx.safra, 'pdf'));
}
