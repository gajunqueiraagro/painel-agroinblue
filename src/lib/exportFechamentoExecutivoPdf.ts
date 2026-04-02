import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { FechamentoExecutivo } from '@/hooks/useFechamentoExecutivo';
import { formatMoeda, formatNum, formatCabecas, formatArroba } from '@/lib/calculos/formatters';

const fmt = formatMoeda;
function fmtN(v: number | undefined | null, dec = 0): string {
  return formatNum(v ?? null, dec) ?? '-';
}

export function exportFechamentoExecutivoPdf(fechamento: FechamentoExecutivo) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const snap = fechamento.json_snapshot_indicadores || {};
  const textos = fechamento.json_snapshot_textos || {};
  const fin = snap.financeiro || {};
  const zoo = snap.zootecnico || {};
  const caixa = snap.caixa || {};
  const w = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 20;

  const addHeader = (title: string) => {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    y += 8;
    doc.setDrawColor(0, 100, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, y, w - margin, y);
    y += 6;
  };

  const addText = (text: string, fontSize = 9) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, w - margin * 2);
    if (y + lines.length * 4 > 275) { doc.addPage(); y = 20; }
    doc.text(lines, margin, y);
    y += lines.length * 4 + 4;
  };

  const addRow = (label: string, value: string) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.text(value, w - margin, y, { align: 'right' });
    y += 5;
  };

  const addSectionText = (key: string) => {
    const t = textos[key];
    if (t) { addText(t); }
  };

  const newPage = () => { doc.addPage(); y = 20; };

  // ═══ PAGE 1: Resumo Executivo ═══
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Fechamento Executivo', margin, y);
  y += 7;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(fechamento.periodo_texto, margin, y);
  y += 4;
  doc.setFontSize(9);
  doc.text(`v${fechamento.versao} • Status: ${fechamento.status_fechamento}`, margin, y);
  y += 10;

  addHeader('Resumo Executivo');
  addRow('Receitas', fmt(fin.receitas));
  addRow('(-) Dedução de Receitas', fmt(fin.deducao_receitas));
  addRow('(-) Custeio Produtivo', fmt(fin.custeio_produtivo));
  addRow('= Lucro Bruto', fmt(fin.lucro_bruto));
  addRow('(-) Investimentos', fmt(fin.investimentos_fazenda));
  addRow('(-) Reposição Bovinos', fmt(fin.reposicao_bovinos));
  addRow('(-) Amortizações', fmt(fin.amortizacoes));
  addRow('(-) Dividendos', fmt(fin.dividendos));
  y += 3;
  addRow('Total Entradas', fmt(caixa.entradas_totais));
  addRow('Total Saídas', fmt(caixa.saidas_totais));
  addRow('Saldo Caixa Final', fmt(caixa.caixa_final));
  y += 4;
  addSectionText('resumo_executivo_ia');

  // ═══ PAGE 2: Evolução da Operação ═══
  newPage();
  addHeader('Evolução da Operação');
  addRow('Faturamento', fmt(fin.receitas));
  addRow('Desembolso Produção', fmt(fin.custeio_produtivo));
  addRow('Lucro Bruto', fmt(fin.lucro_bruto));
  const margemEbitda = (fin.receitas ?? 0) > 0 ? ((fin.lucro_bruto ?? 0) / fin.receitas * 100) : 0;
  addRow('Margem EBITDA', `${margemEbitda.toFixed(1)}%`);
  y += 4;
  addSectionText('texto_operacional_ia');

  // ═══ PAGE 3: Análise Zootécnica ═══
  newPage();
  addHeader('Análise Zootécnica');
  addRow('Compras', formatCabecas(zoo.compras_cab));
  addRow('Vendas', formatCabecas(zoo.vendas_cab));
  addRow('Nascimentos', formatCabecas(zoo.nascimentos));
  addRow('Mortes', formatCabecas(zoo.mortes));
  addRow('Peso Médio Vendas', formatArroba(zoo.peso_medio_vendas_arroba));
  addRow('Valor Total Vendas', fmt(zoo.valor_total_vendas));
  addRow('Preço Médio Compra/cab', fmt(zoo.preco_medio_compra_cab));
  y += 4;
  addSectionText('texto_zootecnico_ia');

  // ═══ PAGE 4: Fluxo de Caixa ═══
  newPage();
  addHeader('Fluxo de Caixa');
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Entradas', margin, y);
  y += 5;
  addRow('Receitas', fmt(caixa.receitas_caixa));
  addRow('Total Entradas', fmt(caixa.entradas_totais));
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Saídas', margin, y);
  y += 5;
  addRow('Custos Produtivos', fmt(caixa.custos_produtivos));
  addRow('Investimentos Fazenda', fmt(caixa.investimentos_fazenda));
  addRow('Reposição Animais', fmt(caixa.reposicao_animais));
  addRow('Amortizações', fmt(caixa.amortizacoes));
  addRow('Dividendos', fmt(caixa.dividendos));
  addRow('Total Saídas', fmt(caixa.saidas_totais));
  y += 4;
  addRow('CAIXA FINAL', fmt(caixa.caixa_final));
  y += 4;
  addSectionText('texto_fluxo_caixa_ia');

  // ═══ PAGE 5: Endividamento + Resumo ═══
  newPage();
  addHeader('Endividamento');
  addRow('Amortizações no Período', fmt(fin.amortizacoes));
  addRow('Dividendos', fmt(fin.dividendos));
  addRow('Dividendos Líquidos', fmt((fin.dividendos ?? 0) - (fin.amortizacoes ?? 0)));
  y += 4;
  addSectionText('texto_endividamento_ia');

  y += 8;
  addHeader('Resumo Global');
  addSectionText('resumo_global_ia');

  // ── Footer on all pages ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Página ${i}/${totalPages}`, w - margin, 290, { align: 'right' });
    doc.text('AgroInBlue • Fechamento Executivo', margin, 290);
    doc.setTextColor(0);
  }

  // Save
  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fechamento_${fechamento.periodo_texto.replace(/\s/g, '_')}_v${fechamento.versao}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    const uri = doc.output('datauristring');
    window.open(uri, '_blank');
  }
}
