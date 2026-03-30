import type { CategoriaRebanho } from '@/hooks/usePastos';
import type { PastoMapaRow, MapaTotais, AtividadeResumo } from '@/pages/MapaPastosTab';
import { tipoUsoLabel } from '@/lib/calculos/labels';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';

export function exportMapaPastosXlsx(
  rows: PastoMapaRow[],
  categorias: CategoriaRebanho[],
  totais: MapaTotais,
  resumoAtividades: AtividadeResumo[],
  anoMes: string,
  fazendaNome: string
) {
  const headers = ['Pasto', 'Atividade', 'Lote', ...categorias.map(c => c.nome), 'Total Cab.', 'Peso Méd. (kg)', 'Área (ha)', 'UA/ha', 'Qualidade'];

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

  const dataPeso = rows.map(row => {
    const vals: (string | number)[] = [row.pasto.nome, '', 'Peso'];
    categorias.forEach(cat => {
      const v = row.categorias.get(cat.id);
      vals.push(v?.peso_medio_kg ? Number(v.peso_medio_kg.toFixed(0)) : 0);
    });
    vals.push(row.pesoMedio ? Number(row.pesoMedio.toFixed(0)) : 0);
    vals.push('', '', '', '');
    return vals;
  });

  const allRows: (string | number)[][] = [];
  for (let i = 0; i < dataQtde.length; i++) {
    allRows.push(dataQtde[i]);
    allRows.push(dataPeso[i]);
  }

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

  const pesoRow: (string | number)[] = ['', '', 'Peso'];
  categorias.forEach(cat => {
    const t = totais.catTotals.get(cat.id);
    const pm = t && t.qtdComPeso > 0 ? t.pesoTotal / t.qtdComPeso : 0;
    pesoRow.push(pm ? Number(pm.toFixed(0)) : 0);
  });
  pesoRow.push(totais.pesoMedioGeral ? Number(totais.pesoMedioGeral.toFixed(0)) : 0);
  pesoRow.push('', '', '', '');
  allRows.push(pesoRow);

  const wsData: (string | number)[][] = [
    [`Mapa de Pastos — ${fazendaNome} — ${anoMes.split('-').reverse().join('/')}`],
    [],
    headers,
    ...allRows,
  ];

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
      ]);
    });
  }

  triggerXlsxDownload({
    filename: `Mapa_Pastos_${fazendaNome.replace(/\s+/g, '_')}_${anoMes}.xlsx`,
    sheets: [
      {
        name: 'Mapa de Pastos',
        mode: 'aoa',
        rows: wsData,
        cols: [
          { wch: 18 }, { wch: 12 }, { wch: 8 },
          ...categorias.map(() => ({ wch: 10 })),
          { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
        ],
      },
    ],
  });
}
