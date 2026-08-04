/**
 * pdfChassi.ts — Chassi de PDF reutilizável AGROinBLUE (A4 RETRATO).
 *
 * Replica a identidade visual do FinanceiroExportMenu (landscape) como helpers
 * puros e reutilizáveis, adaptados para A4 PORTRAIT (pageW 210mm):
 *   - logo no canto SUPERIOR ESQUERDO (no FM é à direita, landscape);
 *   - todas as âncoras horizontais recalculadas p/ 210mm;
 *   - cores, fontes e textos de rodapé IDÊNTICOS ao FM.
 *
 * Helper puro: NÃO conectado a nenhuma tela. Consumido pelo PR-PDF-2.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RowInput, UserOptions, CellHookData } from 'jspdf-autotable';
import logoUrl from '@/assets/logo.png';

// ── Geometria A4 retrato ──
const PAGE_W = 210;
const PAGE_H = 297;
const MARGEM = 10;          // margem lateral (útil = 190mm)
const LOGO_W = 32;          // ~32mm, proporção 2:1 (mesma do FM)
const LOGO_H = 16;

type RGB = [number, number, number];

// ── Paleta AGROinBLUE (valores REAIS do FinanceiroExportMenu) ──
export const PALETA = {
  AZUL_PRIMARIO: [30, 58, 95] as RGB,     // título, header de tabela, valores KPI
  AZUL_VARIANTE: [36, 70, 107] as RGB,    // header de tabela secundária / foot
  CARD_KPI_BG: [239, 246, 255] as RGB,    // fundo dos cards do Resumo Executivo
  ZEBRA_CLARA: [247, 250, 252] as RGB,    // linha alternada das tabelas
  VERDE_POSITIVO: [34, 120, 74] as RGB,   // destaque positivo / linha TOTAL
  CINZA_TEXTO: [80, 80, 80] as RGB,
  CINZA_MEDIO: [120, 120, 120] as RGB,
  CINZA_RODAPE: [130, 130, 130] as RGB,
  LINHA_SEPARADORA: [217, 226, 236] as RGB,
  BRANCO: [255, 255, 255] as RGB,
  PRETO: [0, 0, 0] as RGB,
};

// ── Logo: carrega como base64 (Image → canvas → dataURL), idêntico ao
//    loadLogoBase64 do FM. Carregar UMA vez e passar o logoData aos helpers
//    (addHeader) que fazem addImage síncrono — mesmo padrão do FM. ──
export async function carregarLogoBase64(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = logoUrl;
  });
}

/**
 * 1) Documento A4 retrato (mm). pageW=210, pageH=297, margem lateral=10mm.
 */
export function criarDocRetratoA4(): jsPDF {
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
}

/**
 * 2) Cabeçalho: logo no canto superior ESQUERDO + bloco de título à direita.
 *    SÍNCRONO — recebe logoData (base64) por opts e faz addImage síncrono,
 *    espelhando o FM (loader assíncrono separado, addImage síncrono). Sem
 *    logoData, desenha o header sem logo (graceful). RETORNA o Y (mm) inicial.
 */
export function addHeader(
  doc: jsPDF,
  opts: { titulo: string; subtitulo?: string; infoLinha?: string; logoData?: string },
): number {
  const { titulo, subtitulo, infoLinha, logoData } = opts;

  if (logoData) {
    doc.addImage(logoData, 'PNG', MARGEM, 9, LOGO_W, LOGO_H);
  }

  const xTexto = MARGEM + LOGO_W + 6;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PALETA.AZUL_PRIMARIO);
  doc.text(titulo, xTexto, 16);

  if (subtitulo) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text(subtitulo, xTexto, 22);
  }
  if (infoLinha) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PALETA.CINZA_MEDIO);
    doc.text(infoLinha, xTexto, 27);
  }

  // Linha separadora abaixo do header (largura útil).
  doc.setDrawColor(...PALETA.LINHA_SEPARADORA);
  doc.setLineWidth(0.2);
  doc.line(MARGEM, 31, PAGE_W - MARGEM, 31);

  doc.setTextColor(...PALETA.PRETO);
  doc.setFont('helvetica', 'normal');
  return 36;
}

/**
 * 3) Rodapé com paginação. Chamar UMA vez, ao final (após todo o conteúdo).
 *    Texto/cores/disposição idênticos ao PDF de Compras; âncoras p/ 210mm.
 */
export function addFooterComPaginacao(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const footerY = PAGE_H - 8;
    doc.setDrawColor(...PALETA.LINHA_SEPARADORA);
    doc.setLineWidth(0.1);
    doc.line(MARGEM, footerY - 4, PAGE_W - MARGEM, footerY - 4);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PALETA.CINZA_RODAPE);
    doc.text('AGROinBLUE • Gestão Rural Inteligente', MARGEM, footerY);
    doc.text('Versão PDF v2', PAGE_W / 2, footerY, { align: 'center' });
    doc.text(`Página ${p} de ${total}`, PAGE_W - MARGEM, footerY, { align: 'right' });
    doc.setTextColor(...PALETA.PRETO);
  }
}

/**
 * 3b) Cabeçalho GLOBAL compacto repetido nas páginas (logo + identidade + contexto).
 *     Passo em loop (como o rodapé). Por padrão a partir da página `from` (2), deixando a
 *     página 1 com o cabeçalho completo (addHeader). Reserve ~22mm no topo das páginas ≥ from.
 */
export function addHeaderGlobalTodasPaginas(
  doc: jsPDF,
  ctx: { clienteNome: string; fazenda?: string; contaNome: string; periodoLabel: string; logoData?: string; from?: number },
): void {
  const total = doc.getNumberOfPages();
  const from = ctx.from ?? 2;
  for (let p = from; p <= total; p++) {
    doc.setPage(p);
    if (ctx.logoData) doc.addImage(ctx.logoData, 'PNG', MARGEM, 6, 20, 10);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PALETA.AZUL_PRIMARIO);
    doc.text('Análise Financeira Executiva', MARGEM + 24, 10.5);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PALETA.CINZA_TEXTO);
    const linha = [ctx.clienteNome, ctx.fazenda, `Conta: ${ctx.contaNome}`, ctx.periodoLabel].filter(Boolean).join('   ·   ');
    doc.text(linha, MARGEM + 24, 15);
    doc.setDrawColor(...PALETA.LINHA_SEPARADORA);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, 18.5, PAGE_W - MARGEM, 18.5);
    doc.setTextColor(...PALETA.PRETO);
    doc.setFont('helvetica', 'normal');
  }
}

/**
 * 4) Faixa de título de seção (barra azul, texto branco bold). RETORNA novo Y.
 */
export function addTituloSecao(doc: jsPDF, texto: string, y: number): number {
  const barH = 8;
  doc.setFillColor(...PALETA.AZUL_PRIMARIO);
  doc.rect(MARGEM, y, PAGE_W - 2 * MARGEM, barH, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PALETA.BRANCO);
  doc.text(texto, MARGEM + 3, y + 5.8);
  doc.setTextColor(...PALETA.PRETO);
  doc.setFont('helvetica', 'normal');
  return y + barH + 2;
}

/**
 * 5) Grid de cards KPI (fundo CARD_KPI_BG): label miúdo + valor azul bold.
 *    Default 3 colunas, quebra de linha automática. RETORNA novo Y.
 */
export function addCardsKPI(
  doc: jsPDF,
  kpis: { label: string; valor: string }[],
  y: number,
  opts?: { colunas?: number },
): number {
  const colunas = opts?.colunas ?? 3;
  const innerW = PAGE_W - 2 * MARGEM;
  const colW = innerW / colunas;
  const rowH = 13;
  const linhas = Math.max(1, Math.ceil(kpis.length / colunas));
  const boxH = linhas * rowH + 3;

  doc.setFillColor(...PALETA.CARD_KPI_BG);
  doc.setDrawColor(...PALETA.LINHA_SEPARADORA);
  doc.setLineWidth(0.1);
  doc.rect(MARGEM, y, innerW, boxH, 'FD');

  kpis.forEach((kpi, i) => {
    const col = i % colunas;
    const row = Math.floor(i / colunas);
    const x = MARGEM + col * colW + 5;
    const cy = y + 5 + row * rowH;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PALETA.CINZA_MEDIO);
    doc.text(kpi.label, x, cy);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PALETA.AZUL_PRIMARIO);
    doc.text(kpi.valor, x, cy + 5.5);
  });

  doc.setTextColor(...PALETA.PRETO);
  doc.setFont('helvetica', 'normal');
  return y + boxH + 3;
}

/**
 * 6) Tabela executiva (wrapper sobre autoTable): header azul, zebra clara,
 *    grid discreto, margens 10mm. Suporta linha TOTAL via `foot` (negrito;
 *    VERDE_POSITIVO opcional). RETORNA o Y final (lastAutoTable.finalY).
 */
export function addTabelaExecutiva(
  doc: jsPDF,
  params: {
    head: RowInput[];
    body: RowInput[];
    startY: number;
    opts?: {
      foot?: RowInput[];
      totalVerde?: boolean;
      headFill?: RGB;
      columnStyles?: UserOptions['columnStyles'];
      // Capacidades OPCIONAIS genéricas (infra; sem regra de domínio aqui):
      fontSize?: number;                              // tabelas densas (ex.: extrato)
      cellPadding?: number;                           // compactação vertical
      overflow?: 'linebreak' | 'ellipsize' | 'visible' | 'hidden';  // truncamento controlado
      rowPageBreak?: 'auto' | 'avoid';                // nunca quebrar uma linha entre páginas
      didParseCell?: (data: CellHookData) => void;    // formatação condicional de célula
    };
  },
): number {
  const { head, body, startY, opts } = params;
  const pad = opts?.cellPadding;

  autoTable(doc, {
    startY,
    head,
    body,
    foot: opts?.foot,
    theme: 'grid',
    rowPageBreak: opts?.rowPageBreak ?? 'auto',
    styles: {
      fontSize: opts?.fontSize ?? 9,
      cellPadding: pad != null ? pad : { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
      overflow: opts?.overflow ?? 'linebreak',
      lineColor: PALETA.LINHA_SEPARADORA,
      lineWidth: 0.1,
      textColor: [50, 50, 50],
    },
    didParseCell: opts?.didParseCell,
    headStyles: {
      fillColor: opts?.headFill ?? PALETA.AZUL_PRIMARIO,
      textColor: PALETA.BRANCO,
      fontStyle: 'bold',
      halign: 'center',
      lineColor: opts?.headFill ?? PALETA.AZUL_PRIMARIO,
    },
    bodyStyles: { valign: 'middle' },
    alternateRowStyles: { fillColor: PALETA.ZEBRA_CLARA },
    footStyles: {
      fillColor: opts?.totalVerde ? PALETA.VERDE_POSITIVO : PALETA.AZUL_VARIANTE,
      textColor: PALETA.BRANCO,
      fontStyle: 'bold',
    },
    columnStyles: opts?.columnStyles,
    margin: { left: MARGEM, right: MARGEM },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY;
  return finalY ?? startY;
}
