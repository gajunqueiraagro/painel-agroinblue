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

  if (logoData) {
    const logoH = 9;
    const logoW = logoH * 2;
    doc.addImage(logoData, 'PNG', pageWidth / 2 - logoW / 2, y, logoW, logoH);
    y += logoH + 1;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Mapa de Pastos — ${fazendaNome}`, pageWidth / 2, y + 4, { align: 'center' });

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

  let logoData: string | null = null;
  try {
    logoData = await loadLogoBase64();
  } catch { /* skip */ }

  const tableStartY = drawHeader(doc, logoData, fazendaNome, anoMes, totais, pageWidth);

  const numCats = categorias.length;
  const fixedColsWidth = 24 + 14 + 16 + 12 + 14 + 12 + 12 + 10;
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

  // TOTAL row
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

  // PESO MÉDIO row — weighted average per category
  const pesoMedioCatVals = categorias.map(cat => {
    const t = totais.catTotals.get(cat.id);
    if (t && t.qtdComPeso > 0) {
      return fmt(t.pesoTotal / t.qtdComPeso, 2);
    }
    return '';
  });
  body.push([
    'PESO MÉDIO',
    '',
    '',
    ...pesoMedioCatVals,
    '',
    '',
    '',
    '',
    '',
  ]);

  const totalRowIdx = body.length - 2;
  const pesoRowIdx = body.length - 1;

  // Column styles
  const colStyles: Record<number, any> = {
    0: { cellWidth: 24, fontStyle: 'bold', halign: 'left' },
    1: { cellWidth: 14, halign: 'left' },
    2: { cellWidth: 16, halign: 'left' },
  };
  for (let i = 0; i < numCats; i++) {
    colStyles[3 + i] = { cellWidth: catColWidth, halign: 'right' };
  }
  const afterCats = 3 + numCats;
  colStyles[afterCats] = { cellWidth: 12, halign: 'right', fontStyle: 'bold' };
  colStyles[afterCats + 1] = { cellWidth: 14, halign: 'right' };
  colStyles[afterCats + 2] = { cellWidth: 12, halign: 'right' };
  colStyles[afterCats + 3] = { cellWidth: 12, halign: 'right' };
  colStyles[afterCats + 4] = { cellWidth: 10, halign: 'center' };

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
      if (data.section === 'body') {
        if (data.row.index === totalRowIdx) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [220, 235, 250];
        }
        if (data.row.index === pesoRowIdx) {
          data.cell.styles.fontStyle = 'italic' as any;
          data.cell.styles.fillColor = [235, 245, 235];
          data.cell.styles.fontSize = 6;
        }
      }
    },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    margin: { left: margins.left, right: margins.right, top: tableStartY, bottom: margins.bottom },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader(doc, logoData, fazendaNome, anoMes, totais, pageWidth);
      }
    },
    theme: 'grid',
  });

  // Activity summary
  let currentY = (doc as any).lastAutoTable?.finalY || 120;

  if (resumoAtividades.length > 0) {
    let actY = currentY + 6;
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

    currentY = (doc as any).lastAutoTable?.finalY || currentY + 30;
  }

  // Bar chart — total cabeças por categoria
  const catData = categorias
    .map(c => {
      const t = totais.catTotals.get(c.id);
      return { nome: c.nome, quantidade: t?.quantidade || 0 };
    })
    .filter(d => d.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade);

  if (catData.length > 0) {
    let chartY = currentY + 8;
    const chartHeight = 6 * catData.length + 14;

    if (chartY + chartHeight > pageHeight - margins.bottom) {
      doc.addPage();
      chartY = drawHeader(doc, logoData, fazendaNome, anoMes, totais, pageWidth) + 2;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Distribuição por Categoria', margins.left, chartY);
    chartY += 5;

    const maxVal = catData[0].quantidade;
    const barMaxWidth = 100;
    const labelWidth = 28;
    const barX = margins.left + labelWidth;
    const barHeight = 4.5;
    const barGap = 1.5;

    // Soft professional colors
    const colors: [number, number, number][] = [
      [41, 128, 185], [39, 174, 96], [230, 126, 34], [142, 68, 173],
      [44, 62, 80], [192, 57, 43], [22, 160, 133], [243, 156, 18], [52, 73, 94],
    ];

    catData.forEach((d, i) => {
      const y = chartY + i * (barHeight + barGap);
      const color = colors[i % colors.length];

      // Label
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(d.nome, barX - 2, y + barHeight / 2 + 1, { align: 'right' });

      // Bar
      const barW = (d.quantidade / maxVal) * barMaxWidth;
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(barX, y, barW, barHeight, 1, 1, 'F');

      // Value
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(String(d.quantidade), barX + barW + 2, y + barHeight / 2 + 1);
    });

    doc.setTextColor(0, 0, 0);
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
