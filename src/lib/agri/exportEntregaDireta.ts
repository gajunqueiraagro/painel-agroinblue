/**
 * EXPORTAR A COLHEITA EM ENTREGA DIRETA — PDF e planilha da mandioca (AGRI-MANDIOCA-01d).
 *
 * ⚠ MÓDULO IRMÃO DE `exportColheita`, pela mesma razão da lista, do modal e da faixa: aquele
 * relatório é feito de peso verde, peso seco, umidade, aflatoxina, sacas e grão de roça — SEIS
 * conceitos que não existem aqui. O print de 16/09 mostra a mandioca saindo com todos eles e com
 * 42 linhas para 21 cargas; o conserto não é esconder colunas naquele arquivo, é ter o documento
 * certo. E assim o ramo da saca fica com diff VAZIO, que é o que o §4 pede.
 *
 * ⚠ NADA É RECALCULADO. Os totais vêm de `painel.entrega` (a RPC) e as linhas da MESMA função de
 * agrupamento que a tela usa (`agruparCargas`). O papel que o produtor leva à indústria tem de
 * dizer o que a tela dizia — um segundo cálculo no export é a forma mais silenciosa de os dois
 * divergirem, e ninguém confere um PDF contra a tela antes de imprimir.
 * ⚠ O `g` MÉDIO DO RODAPÉ É O DA RPC, ponderado pela tonelada. A média simples das 21 linhas daria
 * outro número — e seriam dois totais para a mesma pergunta, num documento impresso.
 */
import { format } from 'date-fns';
import { triggerXlsxDownload, type XlsxCellValue } from '@/lib/xlsxDownload';
import {
  criarDocRetratoA4, carregarLogoBase64, addHeader, addCardsKPI, addTituloSecao,
  addTabelaExecutiva, addFooterComPaginacao, PALETA,
} from '@/lib/pdf/pdfChassi';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { nomeDoArquivo, type ContextoExport } from '@/lib/agri/exportColheita';
import type { EntregaDireta } from '@/hooks/usePainelSafra';
import type { CargaAgrupada } from '@/components/agri/CargasEntregaDireta';

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

const traco = (v: number | null | undefined, casas = 2) =>
  (v == null ? '—' : formatNum(v, casas));

/* O Excel recebe NÚMERO onde é número: formatar para texto tiraria do operador a possibilidade de
   somar a coluna na própria planilha, que é metade do motivo de exportar. */
const n = (v: number | null | undefined): XlsxCellValue => (v == null ? null : v);

/** O rótulo do estado financeiro — o mesmo vocabulário da pílula da tela. */
const estadoDoFinanceiro = (s: string | null): string =>
  (!s ? '—' : s === 'realizado' ? 'Realizado' : 'Programado');

/**
 * ⚠ A PRODUTIVIDADE NÃO SE CALCULA AQUI — ela CHEGA. `fn_painel_safra` já devolve `sacas_ha`
 * (que na mandioca carrega tonelada por hectare), e é ele que a FAIXA DA TELA mostra. Dividir
 * `toneladas / area` no papel produziria um SEGUNDO número para a mesma pergunta: a RPC divide
 * pela área que ELA conhece, e o `ctx.areaHa` é a área do RECORTE da tela. Num talhão filtrado os
 * dois divergiriam — e o papel impresso é justamente onde ninguém confere contra a tela.
 */

/* ══════════════ PLANILHA ══════════════ */

export function exportarEntregaDiretaXlsx(
  cargas: readonly CargaAgrupada[], entrega: EntregaDireta, ctx: ContextoExport,
  produtividade: number | null,
): void {
  const cabecalho: Array<Record<string, XlsxCellValue>> = [
    { Campo: 'Cliente', Valor: ctx.cliente },
    { Campo: 'Safra', Valor: ctx.safra },
    { Campo: 'Cultura', Valor: labelDaCultura(ctx.cultura) },
    { Campo: 'Talhão', Valor: ctx.talhao },
    { Campo: 'Área (ha)', Valor: n(ctx.areaHa) },
    { Campo: 'Emitido em', Valor: format(new Date(), 'dd/MM/yyyy HH:mm') },
    { Campo: 'Entregue (t)', Valor: entrega.toneladas },
    { Campo: 'Rendimento médio (g de amido/5 kg)', Valor: n(entrega.rendimento_medio_g) },
    { Campo: 'Produtividade (t/ha)', Valor: n(produtividade) },
    { Campo: 'Preço médio (R$/t)', Valor: n(entrega.preco_t) },
    { Campo: 'Colheita + frete + carregamento (R$/t)', Valor: n(entrega.servicos_t) },
    { Campo: 'Receita bruta (R$)', Valor: entrega.receita_bruta },
    { Campo: 'Deduções na nota (R$)', Valor: entrega.deducoes },
    { Campo: 'A receber (R$)', Valor: entrega.a_receber },
  ];

  /* ⚠ UMA LINHA POR CARGA, e é o ponto do documento: a lista de `agri_colheita` tem 42 linhas
     para as 21 cargas do backfill, porque cada caminhão foi gravado em duas metades de talhão. */
  const linhas: Array<Record<string, XlsxCellValue>> = cargas.map(c => ({
    Faz: c.faz || '—',
    Talhão: c.talhao || '—',
    /* ⚠ DATA COMO TEXTO dd/MM/yyyy — o idioma da casa, e não uma escolha deste arquivo.
       `XlsxCellValue` é `string | number | boolean | null`: o exportador compartilhado NÃO aceita
       `Date`, e os dois exports irmãos (`exportColheita` e `exportBarter`) usam `dataBR`. Passar
       data de verdade exigiria alargar o tipo em `lib/xlsxDownload`, que serve todo export da
       casa — frente própria, não item deste PR. Reportado.
       ⚠ O QUE A REGRA EXPORT PEDE E ESTE ARQUIVO CUMPRE é a outra metade: todo NÚMERO vai como
       número, para o operador poder somar a coluna na própria planilha. */
    Data: dataBR(c.principal.data_colheita),
    NF: c.principal.nf_produtor || '—',
    Comprador: c.comprador || '—',
    'Peso líq. (t)': c.toneladas,
    'Rendimento (g)': n(c.rendimento_g),
    'Preço (R$/g)': n(c.preco_g),
    'Valor (R$)': n(c.valor),
    Financeiro: estadoDoFinanceiro(c.status),
  }));
  /* ⚠ O TOTAL FECHA A PLANILHA COMO FECHA A TELA — e o `g` é o da RPC, não a média das linhas. */
  linhas.push({
    Faz: 'TOTAL', Talhão: '', Data: '', NF: '', Comprador: '',
    'Peso líq. (t)': entrega.toneladas,
    'Rendimento (g)': n(entrega.rendimento_medio_g),
    'Preço (R$/g)': null,
    'Valor (R$)': entrega.receita_bruta,
    Financeiro: '',
  });

  const porNota: Array<Record<string, XlsxCellValue>> = entrega.por_nf.map(nf => ({
    NF: nf.nf,
    Data: dataBR(nf.data),
    Comprador: nf.comprador || '—',
    Cargas: nf.cargas,
    't': nf.toneladas,
    'Rendimento médio (g)': n(nf.rendimento_g),
    'Valor (R$)': nf.valor,
  }));
  porNota.push({
    NF: 'TOTAL', Data: '', Comprador: '',
    Cargas: entrega.cargas,
    't': entrega.toneladas,
    'Rendimento médio (g)': n(entrega.rendimento_medio_g),
    'Valor (R$)': entrega.receita_bruta,
  });

  triggerXlsxDownload({
    filename: nomeDoArquivo(ctx.cultura, ctx.safra, 'xlsx'),
    sheets: [
      { name: 'Colheita', mode: 'json', rows: cabecalho, cols: [{ wch: 38 }, { wch: 26 }] },
      {
        name: 'Cargas', mode: 'json', rows: linhas,
        /* ⚠ `cols` É POSICIONAL, não nomeado — a mesma armadilha do export da saca: uma largura
           fora de ordem move todas as seguintes uma casa. São dez. */
        cols: [{ wch: 7 }, { wch: 18 }, { wch: 11 }, { wch: 11 }, { wch: 28 },
          { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }],
      },
      {
        name: 'Por nota', mode: 'json', rows: porNota,
        cols: [{ wch: 11 }, { wch: 11 }, { wch: 28 }, { wch: 8 }, { wch: 10 },
          { wch: 20 }, { wch: 14 }],
      },
    ],
  });
}

/* ══════════════ PDF ══════════════ */

export async function exportarEntregaDiretaPdf(
  cargas: readonly CargaAgrupada[], entrega: EntregaDireta, ctx: ContextoExport,
  produtividade: number | null,
): Promise<void> {
  const doc = criarDocRetratoA4();
  /* O logo é carregado uma vez e passado ao header, que faz `addImage` síncrono — o padrão do
     chassi. Sem ele, o header sai sem logo em vez de falhar. */
  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }

  /* ⚠ O CABEÇALHO É O MESMO DO OUTRO RELATÓRIO, e de propósito: quem recebe os dois papéis tem de
     reconhecer a casa antes de ler o conteúdo. O que muda é a gramática do que está embaixo. */
  let y = addHeader(doc, {
    titulo: 'Relatório de Colheita',
    subtitulo: `${labelDaCultura(ctx.cultura)} · Safra ${ctx.safra}`,
    infoLinha: `${ctx.cliente} · ${ctx.talhao}`
      + (ctx.areaHa != null ? ` · ${formatNum(ctx.areaHa, 2)} ha` : '')
      + ` · emitido em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
    logoData,
  });

  /* ⚠ SEIS CARDS, A MESMA FAIXA DA TELA e na mesma ordem: físico, rendimento, produtividade,
     preço, custo de tirar a raiz do chão, receita. O papel e a tela contam a mesma história. */
  y = addCardsKPI(doc, [
    { label: 'Entregue', valor: `${traco(entrega.toneladas)} t`, sub: '' },
    {
      label: 'Rendimento médio',
      valor: `${traco(entrega.rendimento_medio_g, 0)} g`,
      sub: 'de amido / 5 kg',
    },
    { label: 'Produtividade', valor: `${traco(produtividade)} t/ha`, sub: '' },
    { label: 'Preço médio', valor: `${traco(entrega.preco_t)}`, sub: 'R$/t' },
    {
      label: 'Colheita + frete + carreg.',
      valor: `${traco(entrega.servicos_t)}`,
      sub: `R$/t · ${formatNum(entrega.servicos_total, 2)} no total`,
    },
    { label: 'Receita bruta', valor: formatNum(entrega.receita_bruta, 2), sub: 'R$' },
  ], y, { colunas: 6 });

  /* A linha cinza da tela, virada em texto de uma linha — o que sobra da nota. */
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Deduções na nota ${formatNum(entrega.deducoes, 2)}`
    + ` · A receber ${formatNum(entrega.a_receber, 2)}`
    + ` · ${formatNum(entrega.cargas, 0)} cargas`
    + ` · ${formatNum(entrega.por_nf.length, 0)} NFs`,
    10, y + 3.5,
  );
  doc.setTextColor(0, 0, 0);
  y += 6;

  y = addTituloSecao(doc, `Cargas (${cargas.length})`, y);
  y = addTabelaExecutiva(doc, {
    startY: y,
    head: [['Faz', 'Talhão', 'Data', 'NF', 'Comprador', 'Peso líq. (t)',
      'Rend. (g)', 'Preço (R$/g)', 'Valor (R$)', 'Financeiro']],
    body: cargas.map(c => [
      c.faz || '—', c.talhao || '—', dataBR(c.principal.data_colheita),
      c.principal.nf_produtor || '—', c.comprador || '—',
      formatNum(c.toneladas, 2),
      traco(c.rendimento_g, 0),
      traco(c.preco_g),
      traco(c.valor),
      estadoDoFinanceiro(c.status),
    ]),
    opts: {
      fontSize: 7,
      cellPadding: 1,
      headFill: PALETA.CINZA_CABECALHO,
      footFill: PALETA.CINZA_CABECALHO,
      /* ⚠ O `foot` É POSICIONAL e tem de ter as DEZ células: uma a menos não dá erro — desloca
         todos os totais uma coluna à esquerda, e o papel sai com a tonelada debaixo de "NF".
         ⚠ E O `g` DO RODAPÉ É O DA RPC, ponderado pela tonelada — nunca a média das linhas. */
      foot: [['TOTAL', '', '', '', '',
        formatNum(entrega.toneladas, 2),
        traco(entrega.rendimento_medio_g, 0),
        '',
        formatNum(entrega.receita_bruta, 2),
        '']],
      /* ⚠ TETO NA COLUNA DO COMPRADOR, com reticência — a lição medida no relatório da saca: sem
         teto, o `autoTable` dimensiona a coluna PELO CONTEÚDO e "Ind. e Com. de Fecula Olinda
         Ltda" faria a tabela inteira se deformar para caber, encolhendo Talhão e os números. */
      columnStyles: {
        4: { cellWidth: 34, overflow: 'ellipsize' },
        5: { halign: 'right' }, 6: { halign: 'right' },
        7: { halign: 'right' }, 8: { halign: 'right' },
      },
      didParseCell: (d) => {
        if (d.section !== 'body' && d.section !== 'foot') return;
        if ([5, 6, 7, 8].includes(d.column.index)) d.cell.styles.halign = 'right';
        /* ⚠ O VALOR EM VERDE, como na tela: é receita. E o "Programado" em âmbar — não vermelho,
           porque um compromisso ainda não pago não é erro. */
        if (d.section === 'body' && d.column.index === 8) {
          d.cell.styles.textColor = PALETA.VERDE_POSITIVO;
        }
        if (d.section === 'body' && d.column.index === 9) {
          const st = cargas[d.row.index]?.status;
          if (st && st !== 'realizado') d.cell.styles.textColor = [180, 83, 9];
          else if (st === 'realizado') d.cell.styles.textColor = PALETA.VERDE_POSITIVO;
        }
      },
    },
  });

  /* ⚠ A SEGUNDA PÁGINA É A DA NOTA, e ela existe porque é o documento que a indústria confere:
     a nota é a unidade do acerto, e a carga é a unidade do romaneio. */
  doc.addPage();
  y = 14;
  y = addTituloSecao(doc, `Por nota (${entrega.por_nf.length})`, y);
  y = addTabelaExecutiva(doc, {
    startY: y,
    head: [['NF', 'Data', 'Comprador', 'Cargas', 't', 'Rend. médio (g)', 'Valor (R$)']],
    body: entrega.por_nf.map(nf => [
      nf.nf, dataBR(nf.data), nf.comprador || '—',
      formatNum(nf.cargas, 0),
      formatNum(nf.toneladas, 2),
      traco(nf.rendimento_g, 0),
      formatNum(nf.valor, 2),
    ]),
    opts: {
      fontSize: 7,
      cellPadding: 1,
      headFill: PALETA.CINZA_CABECALHO,
      footFill: PALETA.CINZA_CABECALHO,
      foot: [['TOTAL', '', '',
        formatNum(entrega.cargas, 0),
        formatNum(entrega.toneladas, 2),
        traco(entrega.rendimento_medio_g, 0),
        formatNum(entrega.receita_bruta, 2)]],
      columnStyles: {
        2: { cellWidth: 40, overflow: 'ellipsize' },
        3: { halign: 'right' }, 4: { halign: 'right' },
        5: { halign: 'right' }, 6: { halign: 'right' },
      },
      didParseCell: (d) => {
        if (d.section !== 'body' && d.section !== 'foot') return;
        if ([3, 4, 5, 6].includes(d.column.index)) d.cell.styles.halign = 'right';
        if (d.section === 'body' && d.column.index === 6) {
          d.cell.styles.textColor = PALETA.VERDE_POSITIVO;
        }
      },
    },
  });

  /**
   * AS TRÊS LINHAS DE RENDIMENTO — a faixa da safra.
   *
   * ⚠ O NÚMERO SOZINHO NÃO SERVE. "469 g" não manda o produtor a lugar nenhum; "469 g em 28/08,
   * NF 9310349" manda ele olhar aquele arranquio. É por isso que as pontas trazem data e nota e
   * a média não — ela não é de uma carga.
   * ⚠ SÓ APARECEM SE A RPC AS DEVOLVER: sem carga com tonelada não há pontas, e imprimir "—" em
   * três linhas seria ocupar meia página para dizer nada.
   */
  if (entrega.rendimento_min || entrega.rendimento_max) {
    y = addTituloSecao(doc, 'Rendimento por carga', y + 2);
    const ponta = (p: { g: number | null; data: string | null; nf: string | null } | null) =>
      (p == null ? ['—', ''] : [
        `${traco(p.g, 0)} g`,
        [dataBR(p.data), p.nf ? `NF ${p.nf}` : ''].filter(Boolean).join(' · '),
      ]);
    const [gMin, ondeMin] = ponta(entrega.rendimento_min);
    const [gMax, ondeMax] = ponta(entrega.rendimento_max);
    y = addTabelaExecutiva(doc, {
      startY: y,
      head: [['', 'Rendimento', 'Onde']],
      body: [
        ['Menor', gMin, ondeMin],
        ['Médio', `${traco(entrega.rendimento_medio_g, 0)} g`, 'ponderado pela tonelada'],
        ['Maior', gMax, ondeMax],
      ],
      opts: {
        fontSize: 7,
        cellPadding: 1,
        headFill: PALETA.CINZA_CABECALHO,
        columnStyles: { 0: { cellWidth: 22 }, 1: { halign: 'right', cellWidth: 28 } },
        didParseCell: (d) => {
          if (d.section !== 'body') return;
          if (d.column.index === 1) d.cell.styles.halign = 'right';
          /* ⚠ AS MESMAS CORES DA TELA: a ponta baixa em vermelho, a alta em verde, a média neutra.
             Elas não julgam a safra — dizem onde olhar primeiro. */
          if (d.column.index <= 1 && d.row.index === 0) d.cell.styles.textColor = [190, 40, 40];
          if (d.column.index <= 1 && d.row.index === 2) d.cell.styles.textColor = PALETA.VERDE_POSITIVO;
        },
      },
    });
  }

  addFooterComPaginacao(doc);
  doc.save(nomeDoArquivo(ctx.cultura, ctx.safra, 'pdf'));
}
