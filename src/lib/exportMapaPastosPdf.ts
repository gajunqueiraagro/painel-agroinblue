import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import type { PastoMapaRow, MapaTotais, AtividadeResumo } from '@/pages/MapaPastosTab';
import logoUrl from '@/assets/logo.png';

function loadLogoBase64(): Promise<string> {
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

const tipoUsoLabel = (t: string | null) => {
  if (!t) return '—';
  const labels: Record<string, string> = {
    cria: 'Cria', recria: 'Recria', engorda: 'Engorda',
    reforma_pecuaria: 'Ref. Pec.', agricultura: 'Agric.',
    app: 'APP', reserva_legal: 'Res. Legal', benfeitorias: 'Benf.',
  };
  return labels[t] || t;
};

function fmt(val: number | null | undefined, dec = 0): string {
  if (val === null || val === undefined) return '—';
  return val.toFixed(dec).replace('.', ',');
}

function drawHeader(
  doc: jsPDF,
  logoData: string | null,
  fazendaNome: string,
  anoMes: string,
  totais: MapaTotais,
  pageWidth: number
): number {
  let y = 4;

  // Logo — smaller
  if (logoData) {
    const logoH = 9;
    const logoW = logoH * 2;
    doc.addImage(logoData, 'PNG', pageWidth / 2 - logoW / 2, y, logoW, logoH);
    y += logoH + 1;
  }

  // Title line
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Mapa de Pastos — ${fazendaNome}`, pageWidth / 2, y + 4, { align: 'center' });

  // Reference + summary on same line
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const ref = anoMes.split('-').reverse().join('/');
  const summary = `Ref: ${ref}  |  ${totais.totalCab} cab  |  Área: ${fmt(totais.areaTotal, 1)} ha  |  Peso Méd: ${totais.pesoMedioGeral ? fmt(totais.pesoMedioGeral, 2) : '—'} kg  |  UA/ha: ${totais.uaHaGeral ? fmt(totais.uaHaGeral, 2) : '—'}`;
  doc.text(summary, pageWidth / 2, y + 9, { align: 'center' });

  return y + 12;
}

export async function exportMapaPastosPdf(
  rows: PastoMapaRow[],
  categorias: CategoriaRebanho[],
  totais: MapaTotais,
  resumoAtividades: AtividadeResumo[],
  anoMes: string,
  fazendaNome: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margins = { left: 6, right: 6, bottom: 10 };

  // Pre-load logo
  let logoData: string | null = null;
  try {
    logoData = await loadLogoBase64();
  } catch { /* skip */ }

  const tableStartY = drawHeader(doc, logoData, fazendaNome, anoMes, totais, pageWidth);

  // Build column config
  const numCats = categorias.length;
  const fixedColsWidth = 24 + 14 + 16 + 12 + 14 + 12 + 12 + 10; // pasto+ativ+lote+total+peso+area+ua+qual
  const availableForCats = pageWidth - margins.left - margins.right - fixedColsWidth;
  const catColWidth = Math.max(10, Math.floor(availableForCats / Math.max(numCats, 1)));

  const catCols = categorias.map(c => c.nome);
  const head = [['Pasto', 'Ativ.', 'Lote', ...catCols, 'Total', 'Peso Md', 'Área', 'UA/ha', 'Qual']];

  const body = rows.map(row => {
    const catVals = categorias.map(cat => {
      const v = row.categorias.get(cat.id);
      return v?.quantidade ? String(v.quantidade) : '';
    });
    return [
      row.pasto.nome,
      tipoUsoLabel(row.tipoUso),
      row.lote || '',
      ...catVals,
      row.totalCabecas ? String(row.totalCabecas) : '',
      row.pesoMedio ? fmt(row.pesoMedio, 2) : '',
      row.pasto.area_produtiva_ha ? fmt(row.pasto.area_produtiva_ha, 1) : '',
      row.uaHa ? fmt(row.uaHa, 2) : '',
      row.qualidade ? String(row.qualidade) : '',
    ];
  });

  // Totals row
  const totalCatVals = categorias.map(cat => {
    const t = totais.catTotals.get(cat.id);
    return t && t.quantidade > 0 ? String(t.quantidade) : '';
  });
  body.push([
    'TOTAL',
    '',
    '',
    ...totalCatVals,
    String(totais.totalCab),
    totais.pesoMedioGeral ? fmt(totais.pesoMedioGeral, 2) : '',
    fmt(totais.areaTotal, 1),
    totais.uaHaGeral ? fmt(totais.uaHaGeral, 2) : '',
    totais.qualidadeMedia ? fmt(totais.qualidadeMedia, 1) : '',
  ]);

  // Column styles — fixed widths + right-align numbers
  const colStyles: Record<number, any> = {
    0: { cellWidth: 24, fontStyle: 'bold', halign: 'left' },
    1: { cellWidth: 14, halign: 'left' },
    2: { cellWidth: 16, halign: 'left' },
  };
  // Category columns
  for (let i = 0; i < numCats; i++) {
    colStyles[3 + i] = { cellWidth: catColWidth, halign: 'right' };
  }
  // Fixed trailing columns
  const afterCats = 3 + numCats;
  colStyles[afterCats] = { cellWidth: 12, halign: 'right', fontStyle: 'bold' };     // Total
  colStyles[afterCats + 1] = { cellWidth: 14, halign: 'right' };  // Peso Md
  colStyles[afterCats + 2] = { cellWidth: 12, halign: 'right' };  // Área
  colStyles[afterCats + 3] = { cellWidth: 12, halign: 'right' };  // UA/ha
  colStyles[afterCats + 4] = { cellWidth: 10, halign: 'center' }; // Qual

  autoTable(doc, {
    startY: tableStartY,
    head,
    body,
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 1, right: 1.2, bottom: 1, left: 1.2 },
      lineColor: [200, 200, 200],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 6.5,
      halign: 'center',
      cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
    },
    columnStyles: colStyles,
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 235, 250];
      }
    },
    // Repeat header on every page
    showHead: 'everyPage',
    // Keep rows together (don't split a pasto across pages)
    rowPageBreak: 'avoid',
    margin: { left: margins.left, right: margins.right, top: tableStartY, bottom: margins.bottom },
    didDrawPage: (data) => {
      // Re-draw header on subsequent pages
      if (data.pageNumber > 1) {
        drawHeader(doc, logoData, fazendaNome, anoMes, totais, pageWidth);
      }
    },
    theme: 'grid',
  });

  // Activity summary
  if (resumoAtividades.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY || 120;
    let actY = finalY + 6;

    if (actY > pageHeight - 35) {
      doc.addPage();
      actY = drawHeader(doc, logoData, fazendaNome, anoMes, totais, pageWidth) + 2;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo por Atividade', margins.left, actY);

    const actHead = [['Atividade', 'Pastos', 'Área (ha)', 'Cabeças', 'Peso Méd (kg)', 'UA/ha']];
    const actBody = resumoAtividades.map(a => [
      tipoUsoLabel(a.tipo),
      String(a.qtdPastos),
      fmt(a.area, 1),
      String(a.cabecas),
      a.pesoMedio ? fmt(a.pesoMedio, 2) : '—',
      a.uaHa ? fmt(a.uaHa, 2) : '—',
    ]);

    autoTable(doc, {
      startY: actY + 3,
      head: actHead,
      body: actBody,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: [200, 200, 200],
        lineWidth: 0.2,
      },
      headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 28, halign: 'left' },
        1: { cellWidth: 16, halign: 'right' },
        2: { cellWidth: 22, halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
      },
      margin: { left: margins.left, right: margins.right },
      theme: 'grid',
      tableWidth: 132,
    });
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  const footerRef = anoMes.split('-').reverse().join('/');
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`${fazendaNome} — Mapa de Pastos ${footerRef}`, margins.left, pageHeight - 4);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margins.left, pageHeight - 4, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`Mapa_Pastos_${fazendaNome.replace(/\s+/g, '_')}_${anoMes}.pdf`);
}
