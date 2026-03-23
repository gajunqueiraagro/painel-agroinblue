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
    reforma_pecuaria: 'Reforma Pec.', agricultura: 'Agricultura',
    app: 'APP', reserva_legal: 'Reserva Legal', benfeitorias: 'Benfeitorias',
  };
  return labels[t] || t;
};

function fmt(val: number | null | undefined, dec = 0): string {
  if (val === null || val === undefined) return '—';
  return val.toFixed(dec).replace('.', ',');
}

export function exportMapaPastosPdf(
  rows: PastoMapaRow[],
  categorias: CategoriaRebanho[],
  totais: MapaTotais,
  resumoAtividades: AtividadeResumo[],
  anoMes: string,
  fazendaNome: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = 5;

  // Logo
  try {
    const logoData = await loadLogoBase64();
    const logoH = 12;
    const logoW = logoH * 2;
    doc.addImage(logoData, 'PNG', pageWidth / 2 - logoW / 2, startY, logoW, logoH);
    startY += logoH + 3;
  } catch { /* skip logo if fails */ }

  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`Mapa de Pastos — ${fazendaNome}`, pageWidth / 2, startY + 5, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Referência: ${anoMes.split('-').reverse().join('/')}`, pageWidth / 2, startY + 11, { align: 'center' });

  // Summary badges
  doc.setFontSize(9);
  doc.text(`Total: ${totais.totalCab} cab  |  Área: ${fmt(totais.areaTotal, 1)} ha  |  Peso Méd.: ${totais.pesoMedioGeral ? fmt(totais.pesoMedioGeral, 2) : '—'} kg  |  UA/ha: ${totais.uaHaGeral ? fmt(totais.uaHaGeral, 2) : '—'}`, pageWidth / 2, startY + 17, { align: 'center' });

  const tableStartY = startY + 21;

  // Main table
  const catCols = categorias.map(c => c.nome);
  const head = [['Pasto', 'Atividade', ...catCols, 'Total', 'Peso Méd.', 'Área', 'UA/ha', 'Qual.']];

  const body = rows.map(row => {
    const catVals = categorias.map(cat => {
      const v = row.categorias.get(cat.id);
      return v?.quantidade ? String(v.quantidade) : '—';
    });
    return [
      row.pasto.nome,
      tipoUsoLabel(row.tipoUso),
      ...catVals,
      String(row.totalCabecas || '—'),
      row.pesoMedio ? fmt(row.pesoMedio, 2) : '—',
      row.pasto.area_produtiva_ha ? fmt(row.pasto.area_produtiva_ha, 1) : '—',
      row.uaHa ? fmt(row.uaHa, 2) : '—',
      row.qualidade ? String(row.qualidade) : '—',
    ];
  });

  // Totals row
  const totalCatVals = categorias.map(cat => {
    const t = totais.catTotals.get(cat.id);
    return t && t.quantidade > 0 ? String(t.quantidade) : '—';
  });
  body.push([
    'TOTAL',
    '',
    ...totalCatVals,
    String(totais.totalCab),
    totais.pesoMedioGeral ? fmt(totais.pesoMedioGeral, 2) : '—',
    fmt(totais.areaTotal, 1),
    totais.uaHaGeral ? fmt(totais.uaHaGeral, 2) : '—',
    totais.qualidadeMedia ? fmt(totais.qualidadeMedia, 1) : '—',
  ]);

  autoTable(doc, {
    startY: 31,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 18 },
    },
    didParseCell: (data) => {
      // Bold totals row
      if (data.row.index === body.length - 1 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 240, 250];
      }
    },
    margin: { left: 14, right: 14 },
    theme: 'grid',
  });

  // Activity summary on new section
  if (resumoAtividades.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY || 120;
    const startY = finalY + 10;

    if (startY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
    }

    const actY = startY > doc.internal.pageSize.getHeight() - 40 ? 15 : startY;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo por Atividade', 14, actY);

    const actHead = [['Atividade', 'Pastos', 'Área (ha)', 'Cabeças', 'Peso Méd. (kg)', 'UA/ha']];
    const actBody = resumoAtividades.map(a => [
      tipoUsoLabel(a.tipo),
      String(a.qtdPastos),
      fmt(a.area, 1),
      String(a.cabecas),
      a.pesoMedio ? fmt(a.pesoMedio, 2) : '—',
      a.uaHa ? fmt(a.uaHa, 2) : '—',
    ]);

    autoTable(doc, {
      startY: actY + 4,
      head: actHead,
      body: actBody,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [39, 174, 96], textColor: 255, fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
      theme: 'grid',
      tableWidth: 180,
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${fazendaNome} — Mapa de Pastos ${anoMes.split('-').reverse().join('/')}`, 14, doc.internal.pageSize.getHeight() - 5);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
  }

  doc.save(`Mapa_Pastos_${fazendaNome.replace(/\s+/g, '_')}_${anoMes}.pdf`);
}
