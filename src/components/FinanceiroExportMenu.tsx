import { useState } from 'react';
import { Download, FileText, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Lancamento, CATEGORIAS } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import logoUrl from '@/assets/logo.png';
import { fmtValor, formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { calcIndicadoresLancamento } from '@/lib/calculos/economicos';

// Load logo as base64 for jsPDF
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

function addLogoToDoc(doc: jsPDF, logoData: string, y: number, centerX: number) {
  const logoH = 12;
  const logoW = logoH * 2;
  doc.addImage(logoData, 'PNG', centerX - logoW / 2, y, logoW, logoH);
  return y + logoH + 3;
}

type SubAba = 'abate' | 'compra' | 'venda';

interface Props {
  lancamentos: Lancamento[];
  subAba: SubAba;
  ano: string;
  fazendaNome?: string;
  /** Quando true, PDF mostra coluna "Origem" e usa "Global" no escopo. */
  isGlobal?: boolean;
}

const SUB_ABA_LABELS: Record<SubAba, string> = {
  abate: 'Abates',
  compra: 'Compras',
  venda: 'Vendas em Pé',
};

// ── Generate text summary for WhatsApp ──
function gerarTextoResumo(lancamentos: Lancamento[], subAba: SubAba, ano: string, fazendaNome?: string): string {
  const titulo = SUB_ABA_LABELS[subAba];
  const totalQtd = lancamentos.reduce((s, l) => s + l.quantidade, 0);

  let lines = [`📊 *${titulo} - ${ano}*`];
  if (fazendaNome) lines.push(`🏠 ${fazendaNome}`);
  lines.push(`📋 ${lancamentos.length} registros | ${totalQtd} cabeças\n`);

  if (subAba === 'abate') {
    let totalValor = 0;
    lancamentos.forEach(l => {
      const c = calcIndicadoresLancamento(l);
      const cat = CATEGORIAS.find(ct => ct.value === l.categoria)?.label ?? l.categoria;
      totalValor += c.valorFinal;
      const nf = l.notaFiscal ? ` | NF: ${l.notaFiscal}` : '';
      lines.push(`🔪 ${format(parseISO(l.data), 'dd/MM/yy')} | ${l.quantidade} ${cat} | Rend: ${c.rendimento ? fmtValor(c.rendimento, 1) + '%' : '-'} | ${formatMoeda(c.valorFinal)}${nf}`);
    });
    lines.push(`\n💰 *Total: ${formatMoeda(totalValor)}*`);
  } else {
    let totalValor = 0;
    const emoji = subAba === 'compra' ? '🛒' : '💰';
    lancamentos.forEach(l => {
      const c = calcIndicadoresLancamento(l);
      const cat = CATEGORIAS.find(ct => ct.value === l.categoria)?.label ?? l.categoria;
      totalValor += c.valorFinal;
      const local = subAba === 'compra' ? l.fazendaOrigem : l.fazendaDestino;
      const nf = l.notaFiscal ? ` | NF: ${l.notaFiscal}` : '';
      lines.push(`${emoji} ${format(parseISO(l.data), 'dd/MM/yy')} | ${l.quantidade} ${cat} | ${local || '-'} | ${formatMoeda(c.valorFinal)}${nf}`);
    });
    lines.push(`\n💰 *Total: ${formatMoeda(totalValor)}*`);
  }

  return lines.join('\n');
}

function gerarTextoIndividual(l: Lancamento, fazendaNome?: string): string {
  const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
  const c = calcIndicadoresLancamento(l);
  let lines: string[] = [];

  if (l.tipo === 'abate') {
    lines = [`🔪 *Resumo de Abate*\n`];
    if (fazendaNome) lines.push(`🏠 Fazenda: ${fazendaNome}`);
    lines.push(
      `📅 Data: ${format(parseISO(l.data), 'dd/MM/yyyy')}`,
      `🐂 ${l.quantidade} ${cat}`,
      `📍 Destino: ${l.fazendaDestino || '-'}`,
    );
    if (l.notaFiscal) lines.push(`📄 NF: ${l.notaFiscal}`);
    if (l.tipoPeso) lines.push(`📦 Tipo peso: ${l.tipoPeso === 'morto' ? 'Peso Morto' : 'Peso Vivo'}`);
    lines.push(
      `⚖️ Peso vivo: ${formatKg(l.pesoMedioKg)}`,
      `🥩 Peso carcaça: ${formatKg(l.pesoCarcacaKg)}`,
      `📊 Rendimento: ${c.rendimento ? formatPercent(c.rendimento) : '-'}`,
      `📐 Peso @: ${formatArroba(c.pesoArroba)}`,
      `💲 Preço/@: ${formatMoeda(l.precoArroba)}`,
      ``,
      `💰 *Valor Total: ${formatMoeda(c.valorFinal)}*`,
      `📈 Líq/@: ${formatMoeda(c.liqArroba)}`,
      `📈 Líq/cab: ${formatMoeda(c.liqCabeca)}`,
      `📈 Líq/kg: ${formatMoeda(c.liqKg)}`,
    );
  } else {
    const tipoLabel = l.tipo === 'compra' ? 'Compra' : 'Venda em Pé';
    const emoji = l.tipo === 'compra' ? '🛒' : '💰';
    const local = l.tipo === 'compra' ? l.fazendaOrigem : l.fazendaDestino;
    lines = [`${emoji} *Resumo de ${tipoLabel}*\n`];
    if (fazendaNome) lines.push(`🏠 Fazenda: ${fazendaNome}`);
    lines.push(
      `📅 Data: ${format(parseISO(l.data), 'dd/MM/yyyy')}`,
      `🐂 ${l.quantidade} ${cat}`,
      `📍 ${l.tipo === 'compra' ? 'Origem' : 'Destino'}: ${local || '-'}`,
    );
    if (l.notaFiscal) lines.push(`📄 NF: ${l.notaFiscal}`);
    lines.push(
      `⚖️ Peso vivo: ${formatKg(l.pesoMedioKg)}`,
      `📐 Peso @: ${formatArroba(c.pesoArroba)}`,
      `💲 Preço/@: ${formatMoeda(l.precoArroba)}`,
      ``,
      `💰 *Valor Total: ${formatMoeda(c.valorFinal)}*`,
      `📈 Líq/@: ${formatMoeda(c.liqArroba)}`,
      `📈 Líq/cab: ${formatMoeda(c.liqCabeca)}`,
      `📈 Líq/kg: ${formatMoeda(c.liqKg)}`,
    );
  }

  return lines.join('\n');
}

// ── PDF generation — PDF executivo AGROinBLUE ──
// Paleta:
//   Header tabela #1E3A5F  → [30, 58, 95]
//   Linha TOTAL  #24466B  → [36, 70, 107]
//   Zebra        #F7FAFC  → [247, 250, 252]
//   Bordas       #D9E2EC  → [217, 226, 236]
//   Resumo bg    #EFF6FF  → [239, 246, 255]
//
// R$/@ na tabela = c.liqArroba (valorFinal/pesoTotalArrobas), NÃO l.precoArroba.
// Linha TOTAL: somas (Qtd, Total) + médias ponderadas oficiais.
// Resumo Executivo final: consolidação dos mesmos indicadores.
async function gerarPDFTabela(lancamentos: Lancamento[], subAba: SubAba, ano: string, fazendaNome?: string, isGlobal?: boolean) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const titulo = SUB_ABA_LABELS[subAba];
  const escopoLabel = isGlobal ? 'Global' : (fazendaNome || '—');

  // ─── Cabeçalho executivo: ESQ texto + DIR logo ────────────
  const HEADER_LEFT_X = 10;
  const LOGO_H = 22;
  const LOGO_W = LOGO_H * 2; // logo 2.2x do antigo (12mm → 22mm = ~1.83x; w dobra → 44mm)
  const LOGO_Y = 8;
  const LOGO_X = pageW - 10 - LOGO_W;

  try {
    const logoData = await loadLogoBase64();
    doc.addImage(logoData, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_H);
  } catch { /* skip logo if fails */ }

  // Título
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 95);
  doc.text(`${titulo} — ${ano}`, HEADER_LEFT_X, 14);

  // Escopo
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(escopoLabel, HEADER_LEFT_X, 21);

  // Estatísticas
  const totalQtd = lancamentos.reduce((s, l) => s + l.quantidade, 0);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`${lancamentos.length} registros | ${totalQtd} cabeças`, HEADER_LEFT_X, 27);

  // Reset
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  // ─── Agregados consolidados (fonte oficial: calcIndicadoresLancamento) ─
  const agg = lancamentos.reduce(
    (acc, l) => {
      const c = calcIndicadoresLancamento(l);
      acc.qtd += l.quantidade;
      acc.pesoVivoSum += (l.pesoMedioKg ?? 0) * l.quantidade;
      acc.pesoArrobaSum += c.pesoTotalArrobas;
      acc.pesoTotalKgSum += c.pesoTotalKg;
      acc.valorFinalSum += c.valorFinal;
      acc.rendSum += (c.rendimento ?? 0) * l.quantidade;
      return acc;
    },
    { qtd: 0, pesoVivoSum: 0, pesoArrobaSum: 0, pesoTotalKgSum: 0, valorFinalSum: 0, rendSum: 0 },
  );

  const pesoVivoMedio = agg.qtd > 0 ? agg.pesoVivoSum / agg.qtd : 0;
  const pesoArrobaMedio = agg.qtd > 0 ? agg.pesoArrobaSum / agg.qtd : 0;
  const liqArrobaConsolidado = agg.pesoArrobaSum > 0 ? agg.valorFinalSum / agg.pesoArrobaSum : 0;
  const liqCabConsolidado = agg.qtd > 0 ? agg.valorFinalSum / agg.qtd : 0;
  const liqKgConsolidado = agg.pesoTotalKgSum > 0 ? agg.valorFinalSum / agg.pesoTotalKgSum : 0;
  const rendMedio = agg.qtd > 0 ? agg.rendSum / agg.qtd : 0;

  // ─── Tabela ───────────────────────────────────────────────
  // Colunas: Data | Qtd | Categoria | [Origem] | Destino | P.Vivo | P.@ | R$/@ | Total | Líq/Cab | Líq/kg | NF
  // Origem só em Global.
  const head = [[
    'Data', 'Qtd', 'Categoria',
    ...(isGlobal ? ['Origem'] : []),
    'Destino', 'P.Vivo', 'P.@', 'R$/@', 'Total', 'Líq/Cab', 'Líq/kg', 'NF',
  ]];

  const body = lancamentos.map(l => {
    const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
    const c = calcIndicadoresLancamento(l);
    const destino = subAba === 'compra' ? '—' : (l.fazendaDestino || '—');
    const origem = l.fazendaOrigem || '—';
    return [
      format(parseISO(l.data), 'dd/MM/yy'),
      String(l.quantidade),
      cat,
      ...(isGlobal ? [origem] : []),
      destino,
      fmtValor(l.pesoMedioKg),
      fmtValor(c.pesoArroba),
      fmtValor(c.liqArroba),
      fmtValor(c.valorFinal),
      fmtValor(c.liqCabeca),
      fmtValor(c.liqKg),
      l.notaFiscal || '—',
    ];
  });

  // Linha TOTAL: somas + médias ponderadas
  const totalRow = [
    'TOTAL',
    String(agg.qtd),
    '',
    ...(isGlobal ? [''] : []),
    '',
    fmtValor(pesoVivoMedio),
    fmtValor(pesoArrobaMedio),
    fmtValor(liqArrobaConsolidado),
    fmtValor(agg.valorFinalSum),
    fmtValor(liqCabConsolidado),
    fmtValor(liqKgConsolidado),
    '',
  ];

  autoTable(doc, {
    startY: 34,
    head,
    body,
    foot: [totalRow],
    theme: 'grid',
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
      lineColor: [217, 226, 236],
      lineWidth: 0.1,
      textColor: [50, 50, 50],
    },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: [255, 255, 255],
      fontSize: 10.5,
      fontStyle: 'bold',
      halign: 'center',
      lineColor: [30, 58, 95],
    },
    bodyStyles: {
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [247, 250, 252],
    },
    footStyles: {
      fillColor: [36, 70, 107],
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      lineWidth: 0.3,
      lineColor: [30, 58, 95],
    },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
      // demais colunas numéricas alinhadas à direita; categorias/locais à esquerda
    },
    didParseCell: (data) => {
      // Numéricas (P.Vivo, P.@, R$/@, Total, Líq/Cab, Líq/kg) → align right
      // Posições variam com isGlobal. Calcular pelo header text.
      const colHeader = head[0][data.column.index] || '';
      const isNumeric = ['Qtd', 'P.Vivo', 'P.@', 'R$/@', 'Total', 'Líq/Cab', 'Líq/kg'].includes(colHeader);
      if (isNumeric) {
        data.cell.styles.halign = 'right';
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ─── Resumo Executivo ─────────────────────────────────────
  const lastY = (doc as any).lastAutoTable?.finalY ?? 100;
  const resumoStartY = lastY + 8;

  const resumoItems: { label: string; value: string }[] = [
    { label: 'Qtd Total', value: `${agg.qtd} cab` },
    { label: 'Peso Médio', value: formatKg(pesoVivoMedio) },
    { label: 'Peso Arroba Médio', value: formatArroba(pesoArrobaMedio) },
    ...(subAba === 'abate' ? [{ label: 'Rendimento Médio', value: rendMedio ? formatPercent(rendMedio) : '—' }] : []),
    { label: 'Preço Médio R$/@', value: formatMoeda(liqArrobaConsolidado) },
    { label: 'Líquido Médio/Cab', value: formatMoeda(liqCabConsolidado) },
    { label: 'Valor Total', value: formatMoeda(agg.valorFinalSum) },
  ];

  // Layout 2 colunas
  const half = Math.ceil(resumoItems.length / 2);
  const col1 = resumoItems.slice(0, half);
  const col2 = resumoItems.slice(half);
  const rows = Math.max(col1.length, col2.length);
  const resumoBody: string[][] = [];
  for (let i = 0; i < rows; i++) {
    resumoBody.push([
      col1[i]?.label || '',
      col1[i]?.value || '',
      col2[i]?.label || '',
      col2[i]?.value || '',
    ]);
  }

  autoTable(doc, {
    startY: resumoStartY,
    head: [['RESUMO EXECUTIVO', '', '', '']],
    body: resumoBody,
    theme: 'grid',
    styles: {
      fontSize: 10,
      cellPadding: { top: 2.8, bottom: 2.8, left: 4, right: 4 },
      lineColor: [217, 226, 236],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [30, 58, 95],
      textColor: [255, 255, 255],
      fontSize: 11,
      fontStyle: 'bold',
      halign: 'left',
      lineColor: [30, 58, 95],
    },
    bodyStyles: {
      fillColor: [239, 246, 255],
    },
    columnStyles: {
      0: { textColor: [100, 100, 100], cellWidth: 60 },
      1: { fontStyle: 'bold', textColor: [30, 58, 95], cellWidth: 80, halign: 'right' },
      2: { textColor: [100, 100, 100], cellWidth: 60 },
      3: { fontStyle: 'bold', textColor: [30, 58, 95], cellWidth: 80, halign: 'right' },
    },
    margin: { left: 10, right: 10 },
    willDrawCell: (data) => {
      // Header tem 4 colunas mas só primeira deve mostrar texto — esconder os outros 3
      if (data.section === 'head' && data.column.index > 0) {
        data.cell.text = [];
      }
    },
  });

  doc.save(`movimentacoes_${subAba}_${ano}.pdf`);
}

async function gerarPDFIndividual(l: Lancamento, fazendaNome?: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
  const tipoLabel = l.tipo === 'abate' ? 'Abate' : l.tipo === 'compra' ? 'Compra' : 'Venda em Pé';

  let currentY = 5;
  try {
    const logoData = await loadLogoBase64();
    currentY = addLogoToDoc(doc, logoData, currentY, 105);
  } catch { /* skip logo if fails */ }

  doc.setFontSize(16);
  doc.text(`Resumo de ${tipoLabel}`, 105, currentY + 5, { align: 'center' });
  const infoStartY = currentY + 12;

  const info: string[][] = [];
  if (fazendaNome) info.push(['Fazenda', fazendaNome]);
  info.push(
    ['Data', format(parseISO(l.data), 'dd/MM/yyyy')],
    ['Quantidade', `${l.quantidade} cabeças`],
    ['Categoria', cat],
  );
  if (l.notaFiscal) info.push(['Nota Fiscal', l.notaFiscal]);

  if (l.tipo === 'abate' || l.tipo === 'venda') {
    info.push(['Destino', l.fazendaDestino || '-']);
  } else {
    info.push(['Origem', l.fazendaOrigem || '-']);
  }

  if (l.tipo === 'abate' && l.tipoPeso) {
    info.push(['Tipo de Peso', l.tipoPeso === 'morto' ? 'Peso Morto' : 'Peso Vivo']);
  }

  autoTable(doc, { startY: infoStartY, body: info, theme: 'plain', bodyStyles: { fontSize: 11 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }, margin: { left: 20, right: 20 } });

  const c = calcIndicadoresLancamento(l);
  let detalhes: string[][] = [];

  if (l.tipo === 'abate') {
    detalhes = [
      ['Peso vivo (kg)', fmtValor(l.pesoMedioKg)],
      ['Peso carcaça (kg)', fmtValor(l.pesoCarcacaKg)],
      ['Rendimento', c.rendimento ? fmtValor(c.rendimento, 1) + '%' : '-'],
      ['Peso em @ (por cab)', fmtValor(c.pesoArroba)],
      ['Preço por @', formatMoeda(l.precoArroba)],
      ['Bônus precoce', formatMoeda(l.bonusPrecoce)],
      ['Bônus qualidade', formatMoeda(l.bonusQualidade)],
      ['Bônus lista trace', formatMoeda(l.bonusListaTrace)],
      ['Desc. qualidade', formatMoeda(l.descontoQualidade)],
      ['Desc. funrural', formatMoeda(l.descontoFunrural)],
      ['Outros descontos', formatMoeda(l.outrosDescontos)],
      ['', ''],
      ['VALOR TOTAL', formatMoeda(c.valorFinal)],
      ['Líquido por @', formatMoeda(c.liqArroba)],
      ['Líquido por cabeça', formatMoeda(c.liqCabeca)],
      ['Líquido por kg vivo', formatMoeda(c.liqKg)],
    ];
  } else {
    detalhes = [
      ['Peso vivo (kg)', fmtValor(l.pesoMedioKg)],
      ['Peso em @ (por cab)', fmtValor(c.pesoArroba)],
      ['Preço por @', formatMoeda(l.precoArroba)],
      ['Acréscimos', formatMoeda(l.acrescimos)],
      ['Deduções', formatMoeda(l.deducoes)],
      ['', ''],
      ['VALOR TOTAL', formatMoeda(c.valorFinal)],
      ['Líquido por @', formatMoeda(c.liqArroba)],
      ['Líquido por cabeça', formatMoeda(c.liqCabeca)],
      ['Líquido por kg vivo', formatMoeda(c.liqKg)],
    ];
  }

  const lastY = (doc as any).lastAutoTable?.finalY ?? 60;
  autoTable(doc, {
    startY: lastY + 5,
    head: [['Campo', 'Valor']],
    body: detalhes,
    theme: 'grid',
    headStyles: { fillColor: [34, 120, 74] },
    bodyStyles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    margin: { left: 20, right: 20 },
  });

  doc.save(`${l.tipo}_${format(parseISO(l.data), 'ddMMyyyy')}.pdf`);
}

function shareWhatsApp(text: string) {
  const encoded = encodeURIComponent(text);
  window.open(`https://wa.me/?text=${encoded}`, '_blank');
}

// ── Export for full table ──
export function FinanceiroExportMenu({ lancamentos, subAba, ano, fazendaNome, isGlobal }: Props) {
  const [open, setOpen] = useState(false);

  if (lancamentos.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2">
          <Download className="h-3 w-3 mr-1" /> Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Exportar {SUB_ABA_LABELS[subAba]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Button className="w-full justify-start gap-2" variant="outline" onClick={async () => { await gerarPDFTabela(lancamentos, subAba, ano, fazendaNome, isGlobal); setOpen(false); toast.success('PDF exportado!'); }}>
            <FileText className="h-5 w-5 text-destructive" />
            Exportar PDF
          </Button>
          <Button className="w-full justify-start gap-2" variant="outline" onClick={() => { shareWhatsApp(gerarTextoResumo(lancamentos, subAba, ano, fazendaNome)); setOpen(false); }}>
            <MessageCircle className="h-5 w-5 text-green-600" />
            Compartilhar WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Export for individual lancamento ──
export function LancamentoShareButtons({ lancamento, fazendaNome }: { lancamento: Lancamento; fazendaNome?: string }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => { await gerarPDFIndividual(lancamento, fazendaNome); toast.success('PDF exportado!'); }}>
        <FileText className="h-4 w-4 text-destructive" />
        PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => shareWhatsApp(gerarTextoIndividual(lancamento, fazendaNome))}>
        <MessageCircle className="h-4 w-4 text-green-600" />
        WhatsApp
      </Button>
    </div>
  );
}
