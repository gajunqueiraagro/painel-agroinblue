import * as XLSX from 'xlsx';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';

interface PastoMapaRow {
  pasto: Pasto;
  lote: string | null;
  tipoUso: string | null;
  qualidade: number | null;
  categorias: Map<string, { quantidade: number; peso_medio_kg: number | null }>;
  totalCabecas: number;
  pesoMedio: number | null;
  cabHa: number | null;
  uaHa: number | null;
}

interface Totais {
  catTotals: Map<string, { quantidade: number; pesoTotal: number; qtdComPeso: number }>;
  totalCab: number;
  areaTotal: number;
  pesoMedioGeral: number | null;
}

export function exportMapaPastosXlsx(
  rows: PastoMapaRow[],
  categorias: CategoriaRebanho[],
  totais: Totais,
  anoMes: string,
  fazendaNome: string
) {
  const wb = XLSX.utils.book_new();

  // Header row
  const headers = ['Pasto', 'Lote', ...categorias.map(c => c.nome), 'Total Cab.', 'Área (ha)', 'Cab/ha', 'UA/ha', 'Qualidade'];

  // Data rows - Qtde
  const dataQtde = rows.map(row => {
    const vals: (string | number)[] = [row.pasto.nome, row.lote || ''];
    categorias.forEach(cat => {
      const v = row.categorias.get(cat.id);
      vals.push(v?.quantidade || 0);
    });
    vals.push(row.totalCabecas);
    vals.push(row.pasto.area_produtiva_ha || 0);
    vals.push(row.cabHa ? Number(row.cabHa.toFixed(2)) : 0);
    vals.push(row.uaHa ? Number(row.uaHa.toFixed(2)) : 0);
    vals.push(row.pasto.qualidade || 0);
    return vals;
  });

  // Peso rows
  const dataPeso = rows.map(row => {
    const vals: (string | number)[] = [row.pasto.nome, 'Peso'];
    categorias.forEach(cat => {
      const v = row.categorias.get(cat.id);
      vals.push(v?.peso_medio_kg ? Number(v.peso_medio_kg.toFixed(0)) : 0);
    });
    vals.push(row.pesoMedio ? Number(row.pesoMedio.toFixed(0)) : 0);
    vals.push(''); // area
    vals.push(''); // cab/ha
    vals.push(''); // ua/ha
    vals.push(''); // qualidade
    return vals;
  });

  // Interleave qtde and peso
  const allRows: (string | number)[][] = [];
  for (let i = 0; i < dataQtde.length; i++) {
    allRows.push(dataQtde[i]);
    allRows.push(dataPeso[i]);
  }

  // Total row
  const totalRow: (string | number)[] = ['TOTAL', ''];
  categorias.forEach(cat => {
    const t = totais.catTotals.get(cat.id);
    totalRow.push(t?.quantidade || 0);
  });
  totalRow.push(totais.totalCab);
  totalRow.push(Number(totais.areaTotal.toFixed(1)));
  totalRow.push(totais.areaTotal > 0 ? Number((totais.totalCab / totais.areaTotal).toFixed(2)) : 0);
  totalRow.push('');
  totalRow.push('');
  allRows.push(totalRow);

  // Peso médio total row
  const pesoRow: (string | number)[] = ['', 'Peso'];
  categorias.forEach(cat => {
    const t = totais.catTotals.get(cat.id);
    const pm = t && t.qtdComPeso > 0 ? t.pesoTotal / t.qtdComPeso : 0;
    pesoRow.push(pm ? Number(pm.toFixed(0)) : 0);
  });
  pesoRow.push(totais.pesoMedioGeral ? Number(totais.pesoMedioGeral.toFixed(0)) : 0);
  pesoRow.push(''); pesoRow.push(''); pesoRow.push(''); pesoRow.push('');
  allRows.push(pesoRow);

  const wsData = [
    [`Mapa de Pastos — ${fazendaNome} — ${anoMes.split('-').reverse().join('/')}`],
    [],
    headers,
    ...allRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 18 }, { wch: 8 },
    ...categorias.map(() => ({ wch: 10 })),
    { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Mapa de Pastos');
  XLSX.writeFile(wb, `Mapa_Pastos_${fazendaNome.replace(/\s+/g, '_')}_${anoMes}.xlsx`);
}
