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
  const logoW = logoH * 2; // approximate aspect ratio
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

function fmt(v?: number, decimals = 2) {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function calcAbate(l: Lancamento) {
  const pesoCarcaca = l.pesoCarcacaKg ?? 0;
  const pesoVivo = l.pesoMedioKg ?? 0;
  const pesoArroba = pesoCarcaca > 0 ? pesoCarcaca / 15 : 0;
  const qtd = l.quantidade;
  const precoArroba = l.precoArroba ?? 0;
  const pesoTotalKg = pesoVivo * qtd;
  const pesoTotalArrobas = pesoArroba * qtd;
  const bonusTotal = (l.bonusPrecoce ?? 0) + (l.bonusQualidade ?? 0) + (l.bonusListaTrace ?? 0);
  const descontoTotal = (l.descontoQualidade ?? 0) + (l.descontoFunrural ?? 0) + (l.outrosDescontos ?? 0);
  const valorBruto = pesoTotalArrobas * precoArroba;
  const valorFinal = valorBruto + bonusTotal - descontoTotal;
  const rendimento = pesoVivo > 0 && pesoCarcaca > 0 ? (pesoCarcaca / pesoVivo) * 100 : 0;
  const liqCabeca = qtd > 0 ? valorFinal / qtd : 0;
  const liqArroba = pesoTotalArrobas > 0 ? valorFinal / pesoTotalArrobas : 0;
  const liqKgVivo = pesoTotalKg > 0 ? valorFinal / pesoTotalKg : 0;
  return { pesoArroba, rendimento, valorFinal, liqCabeca, liqArroba, liqKgVivo, pesoTotalKg, pesoTotalArrobas };
}

function calcCompraVenda(l: Lancamento) {
  const pesoVivo = l.pesoMedioKg ?? 0;
  const pesoArroba = pesoVivo > 0 ? pesoVivo / 30 : 0;
  const qtd = l.quantidade;
  const precoArroba = l.precoArroba ?? 0;
  const pesoTotalKg = pesoVivo * qtd;
  const pesoTotalArrobas = pesoArroba * qtd;
  const valorBruto = pesoTotalArrobas * precoArroba;
  const valorFinal = valorBruto + (l.acrescimos ?? 0) - (l.deducoes ?? 0);
  const liqCabeca = qtd > 0 ? valorFinal / qtd : 0;
  const liqArroba = pesoTotalArrobas > 0 ? valorFinal / pesoTotalArrobas : 0;
  const liqKg = pesoTotalKg > 0 ? valorFinal / pesoTotalKg : 0;
  return { pesoArroba, valorFinal, liqCabeca, liqArroba, liqKg, pesoTotalKg, pesoTotalArrobas };
}

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
      const c = calcAbate(l);
      const cat = CATEGORIAS.find(ct => ct.value === l.categoria)?.label ?? l.categoria;
      totalValor += c.valorFinal;
      const nf = l.notaFiscal ? ` | NF: ${l.notaFiscal}` : '';
      lines.push(`🔪 ${format(parseISO(l.data), 'dd/MM/yy')} | ${l.quantidade} ${cat} | Rend: ${c.rendimento ? fmt(c.rendimento, 1) + '%' : '-'} | R$ ${fmt(c.valorFinal)}${nf}`);
    });
    lines.push(`\n💰 *Total: R$ ${fmt(totalValor)}*`);
  } else {
    let totalValor = 0;
    const emoji = subAba === 'compra' ? '🛒' : '💰';
    lancamentos.forEach(l => {
      const c = calcCompraVenda(l);
      const cat = CATEGORIAS.find(ct => ct.value === l.categoria)?.label ?? l.categoria;
      totalValor += c.valorFinal;
      const local = subAba === 'compra' ? l.fazendaOrigem : l.fazendaDestino;
      const nf = l.notaFiscal ? ` | NF: ${l.notaFiscal}` : '';
      lines.push(`${emoji} ${format(parseISO(l.data), 'dd/MM/yy')} | ${l.quantidade} ${cat} | ${local || '-'} | R$ ${fmt(c.valorFinal)}${nf}`);
    });
    lines.push(`\n💰 *Total: R$ ${fmt(totalValor)}*`);
  }

  return lines.join('\n');
}

function gerarTextoIndividual(l: Lancamento, fazendaNome?: string): string {
  const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
  let lines: string[] = [];

  if (l.tipo === 'abate') {
    const c = calcAbate(l);
    lines = [
      `🔪 *Resumo de Abate*\n`,
    ];
    if (fazendaNome) lines.push(`🏠 Fazenda: ${fazendaNome}`);
    lines.push(
      `📅 Data: ${format(parseISO(l.data), 'dd/MM/yyyy')}`,
      `🐂 ${l.quantidade} ${cat}`,
      `📍 Destino: ${l.fazendaDestino || '-'}`,
    );
    if (l.notaFiscal) lines.push(`📄 NF: ${l.notaFiscal}`);
    if (l.tipoPeso) lines.push(`📦 Tipo peso: ${l.tipoPeso === 'morto' ? 'Peso Morto' : 'Peso Vivo'}`);
    lines.push(
      `⚖️ Peso vivo: ${fmt(l.pesoMedioKg)} kg`,
      `🥩 Peso carcaça: ${fmt(l.pesoCarcacaKg)} kg`,
      `📊 Rendimento: ${c.rendimento ? fmt(c.rendimento, 1) + '%' : '-'}`,
      `📐 Peso @: ${fmt(c.pesoArroba)} @`,
      `💲 Preço/@: R$ ${fmt(l.precoArroba)}`,
      ``,
      `💰 *Valor Total: R$ ${fmt(c.valorFinal)}*`,
      `📈 Líq/@: R$ ${fmt(c.liqArroba)}`,
      `📈 Líq/cab: R$ ${fmt(c.liqCabeca)}`,
      `📈 Líq/kg: R$ ${fmt(c.liqKgVivo)}`,
    );
  } else {
    const c = calcCompraVenda(l);
    const tipoLabel = l.tipo === 'compra' ? 'Compra' : 'Venda em Pé';
    const emoji = l.tipo === 'compra' ? '🛒' : '💰';
    const local = l.tipo === 'compra' ? l.fazendaOrigem : l.fazendaDestino;
    lines = [
      `${emoji} *Resumo de ${tipoLabel}*\n`,
    ];
    if (fazendaNome) lines.push(`🏠 Fazenda: ${fazendaNome}`);
    lines.push(
      `📅 Data: ${format(parseISO(l.data), 'dd/MM/yyyy')}`,
      `🐂 ${l.quantidade} ${cat}`,
      `📍 ${l.tipo === 'compra' ? 'Origem' : 'Destino'}: ${local || '-'}`,
    );
    if (l.notaFiscal) lines.push(`📄 NF: ${l.notaFiscal}`);
    lines.push(
      `⚖️ Peso vivo: ${fmt(l.pesoMedioKg)} kg`,
      `📐 Peso @: ${fmt(c.pesoArroba)} @`,
      `💲 Preço/@: R$ ${fmt(l.precoArroba)}`,
      ``,
      `💰 *Valor Total: R$ ${fmt(c.valorFinal)}*`,
      `📈 Líq/@: R$ ${fmt(c.liqArroba)}`,
      `📈 Líq/cab: R$ ${fmt(c.liqCabeca)}`,
      `📈 Líq/kg: R$ ${fmt(c.liqKg)}`,
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
      const c = calcAbate(l);
      return [
        format(parseISO(l.data), 'dd/MM/yy'), l.notaFiscal || '-', String(l.quantidade), cat, l.fazendaDestino || '-',
        c.rendimento ? fmt(c.rendimento, 1) + '%' : '-', fmt(c.pesoArroba), fmt(l.precoArroba),
        fmt(c.valorFinal), fmt(c.liqArroba), fmt(c.liqCabeca),
      ];
    });
    const totalValor = lancamentos.reduce((s, l) => s + calcAbate(l).valorFinal, 0);
    body.push(['TOTAL', '', String(totalQtd), '', '', '', '', '', fmt(totalValor), '', '']);
    autoTable(doc, { startY, head, body, theme: 'grid', headStyles: { fillColor: [34, 120, 74], fontSize: 7 }, bodyStyles: { fontSize: 7 }, margin: { left: 10, right: 10 } });
  } else {
    const campoLocal = subAba === 'compra' ? 'Origem' : 'Destino';
    const head = [['Data', 'NF', 'Qtd', 'Categoria', campoLocal, 'P.Vivo', 'P.@', 'R$/@', 'Total', 'Líq/Cab', 'Líq/kg']];
    const body = lancamentos.map(l => {
      const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
      const c = calcCompraVenda(l);
      const local = subAba === 'compra' ? l.fazendaOrigem : l.fazendaDestino;
      return [
        format(parseISO(l.data), 'dd/MM/yy'), l.notaFiscal || '-', String(l.quantidade), cat, local || '-',
        fmt(l.pesoMedioKg), fmt(c.pesoArroba), fmt(l.precoArroba),
        fmt(c.valorFinal), fmt(c.liqCabeca), fmt(c.liqKg),
      ];
    });
    const totalValor = lancamentos.reduce((s, l) => s + calcCompraVenda(l).valorFinal, 0);
    body.push(['TOTAL', '', String(totalQtd), '', '', '', '', '', fmt(totalValor), '', '']);
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

  autoTable(doc, { startY: 28, body: info, theme: 'plain', bodyStyles: { fontSize: 11 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }, margin: { left: 20, right: 20 } });

  let detalhes: string[][] = [];
  if (l.tipo === 'abate') {
    const c = calcAbate(l);
    detalhes = [
      ['Peso vivo (kg)', fmt(l.pesoMedioKg)],
      ['Peso carcaça (kg)', fmt(l.pesoCarcacaKg)],
      ['Rendimento', c.rendimento ? fmt(c.rendimento, 1) + '%' : '-'],
      ['Peso em @ (por cab)', fmt(c.pesoArroba)],
      ['Preço por @ (R$)', fmt(l.precoArroba)],
      ['Bônus precoce', fmt(l.bonusPrecoce)],
      ['Bônus qualidade', fmt(l.bonusQualidade)],
      ['Bônus lista trace', fmt(l.bonusListaTrace)],
      ['Desc. qualidade', fmt(l.descontoQualidade)],
      ['Desc. funrural', fmt(l.descontoFunrural)],
      ['Outros descontos', fmt(l.outrosDescontos)],
      ['', ''],
      ['VALOR TOTAL', `R$ ${fmt(c.valorFinal)}`],
      ['Líquido por @', `R$ ${fmt(c.liqArroba)}`],
      ['Líquido por cabeça', `R$ ${fmt(c.liqCabeca)}`],
      ['Líquido por kg vivo', `R$ ${fmt(c.liqKgVivo)}`],
    ];
  } else {
    const c = calcCompraVenda(l);
    detalhes = [
      ['Peso vivo (kg)', fmt(l.pesoMedioKg)],
      ['Peso em @ (por cab)', fmt(c.pesoArroba)],
      ['Preço por @ (R$)', fmt(l.precoArroba)],
      ['Acréscimos', fmt(l.acrescimos)],
      ['Deduções', fmt(l.deducoes)],
      ['', ''],
      ['VALOR TOTAL', `R$ ${fmt(c.valorFinal)}`],
      ['Líquido por @', `R$ ${fmt(c.liqArroba)}`],
      ['Líquido por cabeça', `R$ ${fmt(c.liqCabeca)}`],
      ['Líquido por kg vivo', `R$ ${fmt(c.liqKg)}`],
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
        <Button variant="outline" size="sm" className="touch-target">
          <Download className="h-4 w-4 mr-1" /> Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Exportar {SUB_ABA_LABELS[subAba]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Button className="w-full justify-start gap-2" variant="outline" onClick={() => { gerarPDFTabela(lancamentos, subAba, ano, fazendaNome); setOpen(false); toast.success('PDF exportado!'); }}>
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
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { gerarPDFIndividual(lancamento, fazendaNome); toast.success('PDF exportado!'); }}>
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