/**
 * EXPORTAR A COLHEITA — Excel e PDF (PR-AGRI-COLHEITA-EXPORT-15).
 *
 * ⚠ NADA É RECALCULADO AQUI. Os totais chegam prontos, do MESMO `totaisColheita` que a tela
 * mostra: o papel que o produtor leva para a indústria tem de dizer o que a tela dizia. Um
 * segundo cálculo no export é a forma mais silenciosa de o relatório divergir do sistema — e
 * ninguém confere um PDF contra a tela antes de imprimir.
 * ⚠ NADA DE LIB NOVA. A casa já exporta: `xlsx` (0.18.5) pelo `triggerXlsxDownload`, e `jspdf`
 * + `jspdf-autotable` pelo chassi de `lib/pdf/pdfChassi` — logo, header, cards, tabela e
 * rodapé com paginação, o mesmo desenho do PDF de Compras e da Análise Executiva.
 * ⚠ O RECORTE É O DA TELA: exporta o que está sendo visto (safra + cultura + talhão, ou todos
 * os talhões). Exportar "tudo" quando a tela mostra um talhão seria entregar outro documento.
 */
import { format } from 'date-fns';
import type { jsPDF } from 'jspdf';

/** O tripé RGB que o jsPDF aceita — o mesmo formato da `PALETA`. */
type RGBPdf = [number, number, number];
import { triggerXlsxDownload, type XlsxCellValue } from '@/lib/xlsxDownload';
import {
  criarDocRetratoA4, carregarLogoBase64, addHeader, addCardsKPI, addTituloSecao,
  addTabelaExecutiva, addFooterComPaginacao, garantirEspaco, yRealAposDesenho, PALETA,
} from '@/lib/pdf/pdfChassi';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { LIMITE_AFLATOXINA, unidadeDaCultura, type TotaisColheita } from '@/lib/agri/colheita';

/** Uma carga, já resolvida para exibição — nomes em vez de ids. */
export interface LinhaExport {
  fazenda: string;
  talhao: string;
  /**
   * O cultivar da ÁREA da carga — "OL3", "BRS 421". Vazio quando não cadastrado.
   *
   * ⚠ RESOLVIDO PELO CHAMADOR, como `fazenda` e `talhao`, e pelo MESMO elo: `safra_area_id`,
   * a área exata. Na 25/26 o amendoim tem três cultivares e dois deles dividem o Ind 01 —
   * resolver por (safra, cultura) carimbaria o primeiro em todas as cargas, e o papel sairia
   * preenchido, plausível e errado.
   */
  variedade: string;
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
    Faz: l.fazenda, Talhão: l.talhao, Variedade: l.variedade || '—',
    Data: dataBR(l.data), Hora: l.hora,
    Ticket: l.ticket, NF: l.nf,
    'Peso fazenda (kg)': n(l.pesoFazendaKg),
    'Verde (kg)': n(l.verdeKg), 'Seco (kg)': n(l.secoKg),
    'Umidade (%)': n(l.umidadePct), 'Aflatoxina (ppb)': n(l.aflatoxinaPpb),
    'Sacas boas': n(l.sacasBoas), 'Roça (sc)': n(l.graoRocaSacas),
  }));
  /* A linha de total fecha a planilha como fecha a tela — e é a MESMA soma. */
  cargas.push({
    Faz: 'TOTAL', Talhão: '', Variedade: '', Data: '', Hora: '', Ticket: '', NF: '',
    'Peso fazenda (kg)': null,
    'Verde (kg)': totais.verdeKg, 'Seco (kg)': totais.secoKg,
    'Umidade (%)': null, 'Aflatoxina (ppb)': null,
    'Sacas boas': totais.sacasBoas, 'Roça (sc)': totais.graoRocaSacas,
  });

  const sheets = [
    { name: 'Colheita', mode: 'json' as const, rows: cabecalho, cols: [{ wch: 16 }, { wch: 34 }] },
    {
      name: 'Cargas', mode: 'json' as const, rows: cargas,
      /* ⚠ UMA LARGURA POR COLUNA, NA ORDEM — `cols` é POSICIONAL, não nomeado: a coluna nova
         entra no índice 2 aqui também, senão todas as larguras seguintes escorregam uma casa e
         "Peso fazenda (kg)" passa a medir o que era da "Umidade (%)". Eram treze; são catorze. */
      cols: [{ wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 11 }, { wch: 7 }, { wch: 10 },
        { wch: 10 }, { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 14 },
        { wch: 12 }, { wch: 11 }],
    },
  ];

  if (ctx.comAnalise) {
    const analise: Array<Record<string, XlsxCellValue>> = [
      { Indicador: 'Peso verde (kg)', Valor: totais.verdeKg, Observação: 'o que a indústria recebeu' },
      { Indicador: 'Peso seco (kg)', Valor: totais.secoKg, Observação: 'depois de secar' },
      { Indicador: 'Quebra de secagem (%)', Valor: n(totais.quebraPct), Observação: 'sobre o que já voltou seco' },
      { Indicador: 'Sacas boas', Valor: totais.sacasBoas, Observação: 'grão que vale preço' },
      { Indicador: 'Grão de roça (sc)', Valor: totais.graoRocaSacas, Observação: 'refugo' },
      { Indicador: 'Final aproveitado (sc)', Valor: totais.sacasFinais, Observação: 'boas + roça' },
      { Indicador: `Produtividade final (${unidade.unidadeProdutividade})`, Valor: n(totais.produtividadeFinal), Observação: 'aproveitado por hectare' },
      { Indicador: `Produtividade líquida (${unidade.unidadeProdutividade})`, Valor: n(totais.produtividade), Observação: 'só sacas boas' },
      { Indicador: 'Secagem paga (R$)', Valor: totais.valorSecagem, Observação: 'custo · à indústria' },
    ];
    const pct = (v: number) => (totais.sacasFinais > 0 ? (v / totais.sacasFinais) * 100 : 0);
    const classificacao: Array<Record<string, XlsxCellValue>> = [
      { Faixa: `até ${LIMITE_AFLATOXINA} ppb`, Sacas: totais.sacasAteLimite, '%': pct(totais.sacasAteLimite) },
      { Faixa: `acima de ${LIMITE_AFLATOXINA} ppb`, Sacas: totais.sacasAcimaLimite, '%': pct(totais.sacasAcimaLimite) },
      { Faixa: 'grão de roça', Sacas: totais.graoRocaSacas, '%': pct(totais.graoRocaSacas) },
    ];
    /* ⚠ "SEM LAUDO" SÓ APARECE SE EXISTIR, e fora das faixas: somá-la à primeira venderia um
       número que a indústria ainda não classificou. */
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

/**
 * ALINHA À DIREITA AS COLUNAS DE NÚMERO, INCLUSIVE NO TOTAL.
 *
 * ⚠ `columnStyles` NÃO CHEGA AO `foot`, e isso não é precedência: está escrito no
 * `jspdf-autotable` instalado — `var colStyles = sectionName === 'body' ? columnStyles : {}`.
 * Ele é DESCARTADO fora do corpo. O cabeçalho escapa porque o chassi define `halign: 'center'`
 * no `headStyles`; a linha de total caía no `left` padrão e desalinhava das colunas que soma.
 * ⚠ O `didParseCell` É A VIA CERTA, e não mexer no chassi: `footStyles` lá dentro serve todos
 * os PDFs da casa, e alinhar tudo à direita quebraria a primeira coluna de rótulo de cada um.
 */
const alinharNumerosADireita = (colunas: readonly number[]) => (d: {
  section: string; column: { index: number }; cell: { styles: { halign?: string } };
}) => {
  if (d.section !== 'body' && d.section !== 'foot') return;
  if (colunas.includes(d.column.index)) d.cell.styles.halign = 'right';
};

/**
 * UM GRÁFICO DE BARRAS DESENHADO À MÃO — PR-COLHEITA-PDF-REORG.
 *
 * ⚠ O PDF NÃO TEM HTML: aqui não há flex nem `height: %`. Cada barra é um `doc.rect`, e a altura
 * sai de `valor ÷ max × altura_útil` — a MESMA conta que a tela faz em percentual. É isso que
 * mantém o gate do gráfico de pé nos dois lugares: a razão entre as alturas é a razão entre os
 * números.
 * ⚠ ESCALA POR CARD, nunca compartilhada: total (milhares) e por-hectare (dezenas) numa escala
 * só fariam as três barras de hectare virarem risco — o defeito que a tela já pagou.
 * ⚠ O VALOR VAI ACIMA DA BARRA, acompanhando a altura dela, como na tela.
 */
function desenharGrafico(
  doc: jsPDF,
  params: {
    x: number; y: number; largura: number; alturaUtil: number;
    titulo: string;
    barras: Array<{ rotulo: string; valor: number | null; texto: string; cor: RGBPdf }>;
  },
): void {
  const { x, y, largura, alturaUtil, titulo, barras } = params;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PALETA.CINZA_TEXTO);
  doc.text(titulo.toUpperCase(), x, y);

  const validos = barras.map(b => b.valor).filter((v): v is number => v != null);
  const max = validos.length > 0 ? Math.max(...validos) : 0;
  const larguraBarra = 9;
  const passo = largura / barras.length;
  const base = y + 6 + alturaUtil;

  barras.forEach((b, i) => {
    const cx = x + passo * i + passo / 2;
    /* ⚠ MEIO MILÍMETRO DE PISO: uma barra de 0,07% do máximo sairia com altura zero e o
       retângulo não apareceria — o leitor concluiria que o dado não existe, quando ele é só
       pequeno. É o mesmo piso de 2% que a tela usa. */
    const h = b.valor != null && max > 0 ? Math.max(0.5, (b.valor / max) * alturaUtil) : 0;
    if (b.valor != null) {
      doc.setFillColor(...b.cor);
      doc.rect(cx - larguraBarra / 2, base - h, larguraBarra, h, 'F');
    }
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text(b.texto, cx, base - h - 1.2, { align: 'center' });
    doc.setFontSize(6);
    doc.setTextColor(...PALETA.CINZA_MEDIO);
    doc.text(b.rotulo, cx, base + 3.2, { align: 'center' });
  });
  doc.setTextColor(...PALETA.PRETO);
}

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

  /**
   * ⚠ A MATRIZ DO PAPEL É A DA TELA — mesmas quatro colunas, mesma ordem, mesmos números.
   * Relatório que reorganiza o que a tela mostra obriga o operador a reconciliar dois desenhos
   * da mesma safra; o "Peso seco" saiu daqui pelo mesmo motivo que saiu de lá (repetia as sacas
   * boas e fazia o fluxo descer e subir).
   * ⚠ CADA CARD TRAZ AS TRÊS LEITURAS: sacas em cima, quilo miúdo e o por-hectare — é o que o
   * `addCardsKPI` aceita como `valor` e `sub`.
   */
  const kgDe = (sacas: number) => {
    const kg = unidade.kgPorSaca != null ? sacas * unidade.kgPorSaca : null;
    return kg == null ? '' : `${formatNum(kg, 2)} kg`;
  };
  const porHa = (v: number | null) => (v != null && ctx.areaHa && ctx.areaHa > 0
    ? `${formatNum(v / ctx.areaHa, 2)} ${unidade.unidadeProdutividade}` : '—');

  y = addCardsKPI(doc, [
    {
      label: 'Peso verde',
      valor: totais.verdeEmSacas != null ? `${formatNum(totais.verdeEmSacas, 2)} sc` : '—',
      sub: `${formatNum(totais.verdeKg, 2)} kg · ${porHa(totais.verdeEmSacas)}`,
    },
    {
      label: 'Final aproveitado',
      valor: `${formatNum(totais.sacasFinais, 2)} sc`,
      sub: `${kgDe(totais.sacasFinais)} · ${totais.produtividadeFinal != null
        ? `${formatNum(totais.produtividadeFinal, 2)} ${unidade.unidadeProdutividade}` : '—'}`,
    },
    {
      label: 'Sacas boas',
      valor: `${formatNum(totais.sacasBoas, 2)} sc`,
      sub: `${kgDe(totais.sacasBoas)} · ${totais.produtividade != null
        ? `${formatNum(totais.produtividade, 2)} ${unidade.unidadeProdutividade}` : '—'}`,
    },
    {
      label: 'Grão de roça',
      valor: `${formatNum(totais.graoRocaSacas, 2)} sc`,
      sub: `${kgDe(totais.graoRocaSacas)} · ${porHa(totais.graoRocaSacas)}`,
    },
  ], y, { colunas: 4 });

  /* ⚠ TODAS AS CARGAS, SEMPRE — o corte saiu (PR-COLHEITA-PDF-REORG). O relatório resumia em
     `MAX_LINHAS_PDF` e anunciava o resumo no título, mas quem leva o PDF à indústria confere
     romaneio por romaneio: uma lista que para na vigésima segunda carga não serve para conferir
     nenhuma das outras. O documento cresce em páginas, que é o que um relatório faz. */
  const mostradas = linhas;
  y = addTituloSecao(doc, `Cargas (${linhas.length})`, y);

  y = addTabelaExecutiva(doc, {
    startY: y,
    head: [['Faz', 'Talhão', 'Variedade', 'Data', 'Ticket', 'Verde (kg)', 'Seco (kg)',
      'Umid.', 'Afla.', 'Sacas', 'Roça']],
    body: mostradas.map(l => [
      l.fazenda, l.talhao, l.variedade || '—', dataBR(l.data), l.ticket,
      l.verdeKg != null ? formatNum(l.verdeKg, 2) : '—',
      l.secoKg != null ? formatNum(l.secoKg, 2) : '—',
      l.umidadePct != null ? formatNum(l.umidadePct, 2) : '—',
      l.aflatoxinaPpb != null ? formatNum(l.aflatoxinaPpb, 2) : '—',
      l.sacasBoas != null ? formatNum(l.sacasBoas, 0) : '—',
      l.graoRocaSacas != null ? formatNum(l.graoRocaSacas, 0) : '—',
    ]),
    opts: {
      /* ⚠ CINZA NO CABEÇALHO DE COLUNA E NA LINHA TOTAL — as duas bordas da tabela. O título da
         seção segue AZUL, que é a hierarquia: a faixa larga nomeia a seção, a tabela é o
         conteúdo dela, e duas faixas azuis coladas faziam parecer duas seções. */
      fontSize: 7,
      cellPadding: 1,
      headFill: PALETA.CINZA_CABECALHO,
      footFill: PALETA.CINZA_CABECALHO,
      /* ⚠ O `foot` É POSICIONAL E TEM DE CRESCER JUNTO: eram dez células, são onze. Uma a
         menos não dá erro — desloca TODOS os totais uma coluna à esquerda, e o papel sai com o
         peso verde debaixo de "Ticket". É o mesmo defeito que o `colSpan` do `tfoot` na tela
         teria causado. */
      foot: [['TOTAL', '', '', '', '',
        formatNum(totais.verdeKg, 2),
        totais.secoKg > 0 ? formatNum(totais.secoKg, 2) : '—',
        '', '',
        formatNum(totais.sacasBoas, 2),
        formatNum(totais.graoRocaSacas, 2)]],
      /* ⚠ TODO ÍNDICE AQUI ANDOU UM, e é a parte perigosa deste PR: `columnStyles`,
         `alinharNumerosADireita` e os dois testes de cor em `didParseCell` endereçam a coluna
         por POSIÇÃO. Eram 4..9; são 5..10. Um índice esquecido não quebra nada visivelmente —
         pinta de vermelho a coluna errada, ou alinha à esquerda um número. Era 7 a aflatoxina
         e 9 a roça; agora 8 e 10.
         ⚠ `ellipsize` SÓ NA VARIEDADE: a tabela inteira é `linebreak` (o default, que quebra a
         linha em duas), e um cultivar longo faria a linha da carga crescer em altura. Aqui o
         nome corta com reticência, porque a identidade da carga são o talhão e o ticket — não
         o final do nome do cultivar.
         ⚠⚠ E `ellipsize` SOZINHO NÃO CORTA NADA — medido. O `autoTable` dimensiona a coluna
         PELO CONTEÚDO e só depois aplica o overflow: sem teto, "BRS 421 Precoce Vermelho
         Rasteiro" faz a coluna inchar de 20 para 50,8mm e o resto da tabela encolher junto
         (Talhão cai de 19,9 para 16,1mm, Verde de 21,1 para 17,1). A tabela nunca estoura —
         a soma é sempre ~181,8mm —, ela se DEFORMA, e uma carga com nome comprido reformataria
         o relatório inteiro. O teto é o que faz a reticência existir.
         ⚠ 20mm NÃO É NÚMERO ESCOLHIDO A ESMO: é o que a coluna já toma sozinha com um cultivar
         normal (20,33mm medidos com "BRS 421"). Com o teto, a tabela de cultivar curto fica
         onde estava e a de cultivar longo passa a ficar também. */
      columnStyles: {
        2: { cellWidth: 20, overflow: 'ellipsize' },
        5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
        8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' },
      },
      /* ⚠ AS MESMAS CORES DA TELA: acima do corte e roça em vermelho. O papel e a tela têm de
         apontar o mesmo grão — o corte vem do `LIMITE_AFLATOXINA`, nunca de um 20 escrito aqui. */
      didParseCell: (d) => {
        alinharNumerosADireita([5, 6, 7, 8, 9, 10])(d);
        if (d.section !== 'body') return;
        if (d.column.index === 8) {
          const ppb = mostradas[d.row.index]?.aflatoxinaPpb;
          if (ppb != null) d.cell.styles.textColor = ppb > LIMITE_AFLATOXINA
            ? [190, 40, 40] : PALETA.VERDE_POSITIVO;
        }
        if (d.column.index === 10 && (mostradas[d.row.index]?.graoRocaSacas ?? 0) > 0) {
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
        headFill: PALETA.CINZA_CABECALHO,
        footFill: PALETA.CINZA_CABECALHO,
        foot: [['TOTAL', formatNum(totais.sacasFinais, 2), '100,0%']],
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        didParseCell: (d) => {
          alinharNumerosADireita([1, 2])(d);
          /* Linha 1 é "acima do corte" e linha 2 é a roça — as duas em vermelho, como na tela. */
          if (d.section === 'body' && (d.row.index === 1 || d.row.index === 2)) {
            d.cell.styles.textColor = [190, 40, 40];
          }
        },
      },
    });

    y = addTituloSecao(doc, 'Perdas e custos', y + 2);
    /* ⚠ `y =` — E É A CAUSA DA SOBREPOSIÇÃO QUE ESTE PR CONSERTA. A chamada descartava o retorno
       desde que nasceu, o que era inofensivo enquanto esta era a ÚLTIMA coisa do PDF. Quando os
       gráficos entraram depois dela, eles passaram a partir do `y` de ANTES da tabela — e
       desenharam dentro dela. O `garantirEspaco` não salvava: ele media um `y` que já estava
       errado e concluía, corretamente, que cabia. */
    y = addTabelaExecutiva(doc, {
      startY: y,
      head: [['Indicador', 'Valor']],
      body: [
        /* ⚠ A ÁGUA EM SACAS, COM O QUILO ENTRE PARÊNTESES — igual à tela. */
        ['Quebra de secagem', totais.quebraPct != null
          ? `${formatNum(totais.quebraPct, 1)}% · ${totais.verdeEmSacas != null
            ? `${formatNum(totais.verdeEmSacas - totais.sacasBoas, 2)} sc de água ` : ''}`
            + `(${formatNum(totais.verdeKg - totais.secoKg, 2)} kg)` : '—'],
        ['Secagem paga', totais.valorSecagem > 0 ? `R$ ${formatNum(totais.valorSecagem, 2)}` : '—'],
        [`Produtividade final (${unidade.unidadeProdutividade})`,
          totais.produtividadeFinal != null ? formatNum(totais.produtividadeFinal, 2) : '—'],
        [`Produtividade líquida (${unidade.unidadeProdutividade})`,
          totais.produtividade != null ? formatNum(totais.produtividade, 2) : '—'],
      ],
      opts: {
        fontSize: 7, cellPadding: 1,
        headFill: PALETA.CINZA_CABECALHO,
        columnStyles: { 1: { halign: 'right' } },
        didParseCell: alinharNumerosADireita([1]),
      },
    });
  }

  /* ── OS DOIS GRÁFICOS, NO FIM ──
     ⚠ DEPOIS DE CARGAS E CLASSIFICAÇÃO, como o briefing pede: eles são a leitura de fechamento,
     e quem confere romaneio quer a lista primeiro.
     ⚠ QUEBRA DE PÁGINA SE NÃO COUBER: com a lista completa o `y` pode chegar ao pé da folha, e
     desenhar por cima do rodapé é pior do que uma página a mais. */
  if (ctx.comAnalise) {
    const ALTURA_GRAFICO = 46;
    /* ⚠ O BLOCO INTEIRO SE MEDE ANTES: a faixa do título (8) + o rótulo do card (6) + as barras
       (46) + os rótulos de baixo (6). Checar só o título deixaria a faixa na página e as barras
       na seguinte — e foi assim que elas desenharam por cima de "Perdas e custos".
       ⚠ `garantirEspaco` DUAS VEZES NÃO DUPLICA PÁGINA: se já coube aqui, o `addTituloSecao`
       abaixo também cabe e não quebra de novo. */
    /* ⚠ O CINTO DE SEGURANÇA, além do `y =` acima: se algum bloco futuro voltar a descartar o
       retorno, o `lastAutoTable.finalY` ainda aponta o fim real do que foi desenhado. */
    /**
     * ⚠ A FOLGA EXISTE POR CAUSA DO BASELINE, e é isso que fazia o rótulo parecer colado.
     * `addTituloSecao` devolve o `y` 2mm abaixo da faixa — o mesmo respiro que as tabelas têm —,
     * mas `doc.text` desenha pelo BASELINE: o topo visual de um texto de 7,5pt fica 2,65mm ACIMA
     * do `y` que se passa. Resultado: o topo de "TOTAL EM SACAS" caía 0,65mm DENTRO da faixa.
     * A tabela não sofre disso porque o autoTable desenha a partir do topo da célula.
     * ⚠ A CONTA, com os números medidos: o `y` chega 2mm abaixo da faixa; somando 7, o baseline
     * vai para 9mm; o topo do texto sobe 2,65mm e para em 6,35mm abaixo da faixa — dentro dos
     * 6–8mm pedidos. Uma tabela na mesma posição mostraria 2mm, e é menos: ela não perde nada
     * para o baseline.
     */
    const FOLGA_TITULO = 7;
    /* ⚠ A FOLGA ENTRA NA ALTURA MEDIDA: sem somá-la aqui, o bloco caberia por 5mm a menos do que
       de fato ocupa — e voltaria a invadir o rodapé na página cheia. */
    y = garantirEspaco(doc, yRealAposDesenho(doc, y) + 2,
      8 + FOLGA_TITULO + 6 + ALTURA_GRAFICO + 6);
    y = addTituloSecao(doc, 'Produção em barras', y) + FOLGA_TITULO;

    const AZUL: RGBPdf = [30, 58, 95];
    const VERDE: RGBPdf = [40, 175, 96];
    const VERMELHO: RGBPdf = [190, 40, 40];
    const porHaNum = (v: number | null) => (v != null && ctx.areaHa && ctx.areaHa > 0
      ? v / ctx.areaHa : null);

    const larguraCard = (210 - 2 * 10 - 8) / 2;
    /* ⚠ `formatNum(v, 0)` NO TOTAL e `, 2` NO POR-HECTARE — o briefing fixou as duas casas do
       sc/ha (150,17 / 127,83 / 10,24), e no total a casa decimal não cabe na barra. */
    desenharGrafico(doc, {
      x: 10, y, largura: larguraCard, alturaUtil: ALTURA_GRAFICO, titulo: 'Total em sacas',
      barras: [
        { rotulo: 'verde', valor: totais.verdeEmSacas, cor: AZUL,
          texto: totais.verdeEmSacas != null ? formatNum(totais.verdeEmSacas, 0) : '—' },
        { rotulo: 'boas', valor: totais.sacasBoas, cor: VERDE,
          texto: formatNum(totais.sacasBoas, 0) },
        { rotulo: 'roça', valor: totais.graoRocaSacas, cor: VERMELHO,
          texto: formatNum(totais.graoRocaSacas, 0) },
      ],
    });
    desenharGrafico(doc, {
      x: 10 + larguraCard + 8, y, largura: larguraCard, alturaUtil: ALTURA_GRAFICO,
      titulo: 'Sacas por hectare',
      barras: [
        { rotulo: 'verde', valor: porHaNum(totais.verdeEmSacas), cor: AZUL,
          texto: porHaNum(totais.verdeEmSacas) != null
            ? formatNum(porHaNum(totais.verdeEmSacas) as number, 2) : '—' },
        { rotulo: 'boas', valor: totais.produtividade, cor: VERDE,
          texto: totais.produtividade != null ? formatNum(totais.produtividade, 2) : '—' },
        { rotulo: 'roça', valor: porHaNum(totais.graoRocaSacas), cor: VERMELHO,
          texto: porHaNum(totais.graoRocaSacas) != null
            ? formatNum(porHaNum(totais.graoRocaSacas) as number, 2) : '—' },
      ],
    });
  }

  addFooterComPaginacao(doc);
  doc.save(nomeDoArquivo(ctx.cultura, ctx.safra, 'pdf'));
}
