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
      `⚖️ Peso vivo: ${fmtValor(l.pesoMedioKg)} kg`,
      `🥩 Peso carcaça: ${fmtValor(l.pesoCarcacaKg)} kg`,
      `📊 Rendimento: ${c.rendimento ? fmtValor(c.rendimento, 1) + '%' : '-'}`,
      `📐 Peso @: ${fmtValor(c.pesoArroba)} @`,
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
      `⚖️ Peso vivo: ${fmtValor(l.pesoMedioKg)} kg`,
      `📐 Peso @: ${fmtValor(c.pesoArroba)} @`,
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

// ── PDF generation ──
async function gerarPDFTabela(lancamentos: Lancamento[], subAba: SubAba, ano: string, fazendaNome?: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const titulo = SUB_ABA_LABELS[subAba];

  let currentY = 5;
  try {
    const logoData = await loadLogoBase64();
    currentY = addLogoToDoc(doc, logoData, currentY, pageW / 2);
  } catch { /* skip logo if fails */ }

  doc.setFontSize(16);
  doc.text(`${titulo} - ${ano}`, pageW / 2, currentY + 5, { align: 'center' });
  currentY += 12;
  if (fazendaNome) {
    doc.setFontSize(11);
    doc.text(fazendaNome, pageW / 2, currentY, { align: 'center' });
    currentY += 7;
  }

  const totalQtd = lancamentos.reduce((s, l) => s + l.quantidade, 0);
  doc.setFontSize(10);
  doc.text(`${lancamentos.length} registros | ${totalQtd} cabeças`, pageW / 2, currentY, { align: 'center' });

  const startY = currentY + 4;

  if (subAba === 'abate') {
    const head = [['Data', 'NF', 'Qtd', 'Categoria', 'Destino', 'Rend.', 'P.@', 'R$/@', 'Total', 'Líq/@', 'Líq/Cab']];
    const body = lancamentos.map(l => {
      const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
      const c = calcIndicadoresLancamento(l);
      return [
        format(parseISO(l.data), 'dd/MM/yy'), l.notaFiscal || '-', String(l.quantidade), cat, l.fazendaDestino || '-',
        c.rendimento ? fmtValor(c.rendimento, 1) + '%' : '-', fmtValor(c.pesoArroba), fmtValor(l.precoArroba),
        fmtValor(c.valorFinal), fmtValor(c.liqArroba), fmtValor(c.liqCabeca),
      ];
    });
    const totalValor = lancamentos.reduce((s, l) => s + calcIndicadoresLancamento(l).valorFinal, 0);
    body.push(['TOTAL', '', String(totalQtd), '', '', '', '', '', fmtValor(totalValor), '', '']);
    autoTable(doc, { startY, head, body, theme: 'grid', headStyles: { fillColor: [34, 120, 74], fontSize: 7 }, bodyStyles: { fontSize: 7 }, margin: { left: 10, right: 10 } });
  } else {
    const campoLocal = subAba === 'compra' ? 'Origem' : 'Destino';
    const head = [['Data', 'NF', 'Qtd', 'Categoria', campoLocal, 'P.Vivo', 'P.@', 'R$/@', 'Total', 'Líq/Cab', 'Líq/kg']];
    const body = lancamentos.map(l => {
      const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
      const c = calcIndicadoresLancamento(l);
      const local = subAba === 'compra' ? l.fazendaOrigem : l.fazendaDestino;
      return [
        format(parseISO(l.data), 'dd/MM/yy'), l.notaFiscal || '-', String(l.quantidade), cat, local || '-',
        fmtValor(l.pesoMedioKg), fmtValor(c.pesoArroba), fmtValor(l.precoArroba),
        fmtValor(c.valorFinal), fmtValor(c.liqCabeca), fmtValor(c.liqKg),
      ];
    });
    const totalValor = lancamentos.reduce((s, l) => s + calcIndicadoresLancamento(l).valorFinal, 0);
    body.push(['TOTAL', '', String(totalQtd), '', '', '', '', '', fmtValor(totalValor), '', '']);
    autoTable(doc, { startY, head, body, theme: 'grid', headStyles: { fillColor: [34, 120, 74], fontSize: 7 }, bodyStyles: { fontSize: 7 }, margin: { left: 10, right: 10 } });
  }

  doc.save(`financeiro_${subAba}_${ano}.pdf`);
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
export function FinanceiroExportMenu({ lancamentos, subAba, ano, fazendaNome }: Props) {
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
          <Button className="w-full justify-start gap-2" variant="outline" onClick={async () => { await gerarPDFTabela(lancamentos, subAba, ano, fazendaNome); setOpen(false); toast.success('PDF exportado!'); }}>
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
