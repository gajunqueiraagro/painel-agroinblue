import * as XLSX from 'xlsx';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import type { PastoMapaRow, MapaTotais, AtividadeResumo } from '@/pages/MapaPastosTab';
import { tipoUsoLabel } from '@/lib/calculos/labels';

export function exportMapaPastosXlsx(
  rows: PastoMapaRow[],
  categorias: CategoriaRebanho[],
  totais: MapaTotais,
  resumoAtividades: AtividadeResumo[],
  anoMes: string,
  fazendaNome: string
) {
  const wb = XLSX.utils.book_new();

  const headers = ['Pasto', 'Atividade', 'Lote', ...categorias.map(c => c.nome), 'Total Cab.', 'Peso Méd. (kg)', 'Área (ha)', 'UA/ha', 'Qualidade'];

  // Data rows - Qtde
  const dataQtde = rows.map(row => {
    const vals: (string | number)[] = [row.pasto.nome, tipoUsoLabel(row.tipoUso), row.lote || ''];
    categorias.forEach(cat => {
      const v = row.categorias.get(cat.id);
      vals.push(v?.quantidade || 0);
    });
    vals.push(row.totalCabecas);
    vals.push(row.pesoMedio ? Number(row.pesoMedio.toFixed(2)) : 0);
    vals.push(row.pasto.area_produtiva_ha || 0);
    vals.push(row.uaHa ? Number(row.uaHa.toFixed(2)) : 0);
    vals.push(row.qualidade || 0);
    return vals;
  });

  // Peso rows
  const dataPeso = rows.map(row => {
    const vals: (string | number)[] = [row.pasto.nome, '', 'Peso'];
    categorias.forEach(cat => {
      const v = row.categorias.get(cat.id);
      vals.push(v?.peso_medio_kg ? Number(v.peso_medio_kg.toFixed(0)) : 0);
    });
    vals.push(row.pesoMedio ? Number(row.pesoMedio.toFixed(0)) : 0);
    vals.push(''); vals.push(''); vals.push(''); vals.push('');
    return vals;
  });

  // Interleave
  const allRows: (string | number)[][] = [];
  for (let i = 0; i < dataQtde.length; i++) {
    allRows.push(dataQtde[i]);
    allRows.push(dataPeso[i]);
  }

  // Total row
  const totalRow: (string | number)[] = ['TOTAL', '', ''];
  categorias.forEach(cat => {
    const t = totais.catTotals.get(cat.id);
    totalRow.push(t?.quantidade || 0);
  });
  totalRow.push(totais.totalCab);
  totalRow.push(totais.pesoMedioGeral ? Number(totais.pesoMedioGeral.toFixed(2)) : 0);
  totalRow.push(Number(totais.areaTotal.toFixed(1)));
  totalRow.push(totais.uaHaGeral ? Number(totais.uaHaGeral.toFixed(2)) : 0);
  totalRow.push(totais.qualidadeMedia ? Number(totais.qualidadeMedia.toFixed(1)) : 0);
  allRows.push(totalRow);

  // Peso médio total row
  const pesoRow: (string | number)[] = ['', '', 'Peso'];
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

  // Activity summary section
  if (resumoAtividades.length > 0) {
    wsData.push([]);
    wsData.push(['Resumo por Atividade']);
    wsData.push(['Atividade', 'Pastos', 'Área (ha)', 'Cabeças', 'Peso Méd. (kg)', 'UA/ha']);
    resumoAtividades.forEach(a => {
      wsData.push([
        tipoUsoLabel(a.tipo),
        a.qtdPastos,
        Number(a.area.toFixed(1)),
        a.cabecas,
        a.pesoMedio ? Number(a.pesoMedio.toFixed(2)) : 0,
        a.uaHa ? Number(a.uaHa.toFixed(2)) : 0,
      ] as (string | number)[]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 18 }, { wch: 12 }, { wch: 8 },
    ...categorias.map(() => ({ wch: 10 })),
    { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Mapa de Pastos');
  XLSX.writeFile(wb, `Mapa_Pastos_${fazendaNome.replace(/\s+/g, '_')}_${anoMes}.xlsx`);
}
