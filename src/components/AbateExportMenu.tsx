import { Lancamento, CATEGORIAS } from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, MessageCircle, Share2 } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { formatMoeda, fmtValor, formatKg, formatArroba, formatPercent, formatCabecas } from '@/lib/calculos/formatters';

import { getStatus } from '@/lib/statusOperacional';
import { useState } from 'react';
import logoUrl from '@/assets/logo.png';

const COMERCIALIZACAO_LABELS: Record<string, string> = {
  escala: 'Escala',
  a_termo: 'A termo',
  spot: 'Spot',
  outro: 'Outro',
};

function fmtDate(d?: string) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; }
}

function loadLogoBase64(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = logoUrl;
  });
}

function shareWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

const TIPO_ABATE_LABELS: Record<string, string> = {
  vivo: 'Peso Vivo',
  morto: 'Peso Morto',
};

/** Cálculos compartilhados para Abate Confirmado (tela, PDF, WhatsApp) */
function calcConfirmado(l: Lancamento) {
  const pesoVivo = l.pesoMedioKg ?? 0;
  const rendFrac = pesoVivo > 0 && l.pesoCarcacaKg ? l.pesoCarcacaKg / pesoVivo : 0;
  const pesoCarcaca = pesoVivo * rendFrac;
  const arrobasCab = pesoCarcaca / 15;
  const arrobasTotais = arrobasCab * l.quantidade;
  const precoBase = l.precoArroba ?? 0;
  const valorBruto = arrobasTotais * precoBase;
  const bonusTotal = (l.bonusPrecoce ?? 0) + (l.bonusQualidade ?? 0) + (l.bonusListaTrace ?? 0);
  const descTotal = (l.descontoQualidade ?? 0) + (l.descontoFunrural ?? 0) + (l.outrosDescontos ?? 0);
  const valorLiq = valorBruto + bonusTotal - descTotal;
  const bonusArroba = arrobasTotais > 0 ? bonusTotal / arrobasTotais : 0;
  const descArroba = arrobasTotais > 0 ? descTotal / arrobasTotais : 0;
  const liqArroba = arrobasTotais > 0 ? valorLiq / arrobasTotais : 0;
  const liqCabeca = l.quantidade > 0 ? valorLiq / l.quantidade : 0;
  const liqKg = pesoVivo > 0 && l.quantidade > 0 ? valorLiq / (pesoVivo * l.quantidade) : 0;
  return { pesoVivo, rendPct: rendFrac * 100, pesoCarcaca, arrobasCab, arrobasTotais, precoBase, valorBruto, bonusTotal, descTotal, bonusArroba, descArroba, valorLiq, liqArroba, liqCabeca, liqKg };
}

// ── Texto WhatsApp Confirmado ──
function textoConfirmado(l: Lancamento, fazendaNome?: string): string {
  const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
  const c = calcConfirmado(l);

  const lines: string[] = [
    'ESCALA DE ABATE - CONFIRMADO',
    '',
    `Fazenda: ${fazendaNome || '-'}`,
    `Frigorifico: ${l.fazendaDestino || '-'}`,
    '',
    `Comercialização: ${COMERCIALIZACAO_LABELS[l.tipoVenda ?? ''] || '-'}`,
    `Tipo de Abate: ${TIPO_ABATE_LABELS[l.tipoPeso ?? ''] || '-'}`,
    '',
    `Data da Venda: ${fmtDate(l.dataVenda)}`,
    `Data Embarque: ${fmtDate(l.dataEmbarque)}`,
    `Data do Abate: ${fmtDate(l.dataAbate || l.data)}`,
    '',
    `Categoria: ${cat}`,
    `Quantidade: ${formatCabecas(l.quantidade)}`,
    '',
    `Peso Vivo Previsto: ${formatKg(c.pesoVivo)}`,
    '',
    `R$/@ Negociado: ${formatMoeda(c.precoBase)}`,
    '',
    `Arrobas Estimadas: ${formatArroba(c.arrobasTotais)}`,
    '',
  ];
  if (c.bonusArroba > 0) lines.push(`Bonus Estimado: ${formatMoeda(c.bonusArroba)}/@`);
  if (c.descArroba > 0) lines.push(`Descontos Estimados: ${formatMoeda(c.descArroba)}/@`);
  if (c.bonusArroba > 0 || c.descArroba > 0) lines.push('');
  lines.push(
    `Preco Liquido Estimado: ${formatMoeda(c.liqArroba)}/@`,
    '',
    `Valor Liquido Estimado: ${formatMoeda(c.valorLiq)}`,
    '',
    'Observacao:',
    'Os valores acima representam uma estimativa baseada nos parametros informados. O resultado final pode variar conforme rendimento, peso real, bonus e descontos efetivos no abate.',
  );
  return lines.join('\n');
}

// ── Texto WhatsApp Realizado ──
function textoRealizado(l: Lancamento, fazendaNome?: string): string {
  const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
  const c = calcConfirmado(l);

  const lines: string[] = [
    'ACERTO FINAL DE ABATE - REALIZADO',
    '',
    `Fazenda: ${fazendaNome || '-'}`,
    `Frigorifico: ${l.fazendaDestino || '-'}`,
    '',
    `Comercialização: ${COMERCIALIZACAO_LABELS[l.tipoVenda ?? ''] || '-'}`,
    `Tipo de Abate: ${TIPO_ABATE_LABELS[l.tipoPeso ?? ''] || '-'}`,
    '',
    `Data da Venda: ${fmtDate(l.dataVenda)}`,
    `Data Embarque: ${fmtDate(l.dataEmbarque)}`,
    `Data do Abate: ${fmtDate(l.dataAbate || l.data)}`,
    '',
    `Categoria: ${cat}`,
    `Quantidade: ${formatCabecas(l.quantidade)}`,
    '',
    `Peso Vivo: ${formatKg(c.pesoVivo)}`,
    `Rendimento Carcaca: ${formatPercent(c.rendPct)}`,
    `Peso Carcaca: ${formatKg(c.pesoCarcaca)}`,
    '',
    `Arrobas por Cabeca: ${formatArroba(c.arrobasCab)}`,
    `Arrobas Totais: ${formatArroba(c.arrobasTotais)}`,
    '',
    `R$/@ Base: ${formatMoeda(c.precoBase)}`,
    '',
  ];
  if (c.bonusArroba > 0) lines.push(`Bonus: ${formatMoeda(c.bonusArroba)}/@`);
  if (c.descArroba > 0) lines.push(`Descontos: ${formatMoeda(c.descArroba)}/@`);
  if (c.bonusArroba > 0 || c.descArroba > 0) lines.push('');
  lines.push(
    `Preco Liquido: ${formatMoeda(c.liqArroba)}/@`,
    `Valor Liquido Total: ${formatMoeda(c.valorLiq)}`,
    '',
    `R$/@ liq: ${formatMoeda(c.liqArroba)}`,
    `R$/cab liq: ${formatMoeda(c.liqCabeca)}`,
    `R$/kg vivo liq: ${formatMoeda(c.liqKg)}`,
  );
  if (l.notaFiscal) lines.push('', `NF: ${l.notaFiscal}`);
  return lines.join('\n');
}

// ── PDF Confirmado ──
async function pdfConfirmado(l: Lancamento, fazendaNome?: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cat = CATEGORIAS.find(cc => cc.value === l.categoria)?.label ?? l.categoria;
  const c = calcConfirmado(l);

  let y = 5;
  try {
    const logo = await loadLogoBase64();
    const lH = 12, lW = lH * 2;
    doc.addImage(logo, 'PNG', 105 - lW / 2, y, lW, lH);
    y += lH + 3;
  } catch {}

  doc.setFontSize(16);
  doc.text('Escala de Abate — Confirmado', 105, y + 5, { align: 'center' });
  y += 14;
  if (fazendaNome) { doc.setFontSize(11); doc.text(fazendaNome, 105, y, { align: 'center' }); y += 7; }

  const tStyle = { theme: 'grid' as const, headStyles: { fillColor: [34, 120, 74] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, fontSize: 10 }, bodyStyles: { fontSize: 10 }, columnStyles: { 0: { fontStyle: 'bold' as const, cellWidth: 65 } }, margin: { left: 20, right: 20 } };

  // BLOCO 1
  const bloco1: string[][] = [
    ['Fazenda', fazendaNome || '-'],
    ['Frigorífico', l.fazendaDestino || '-'],
    ['Comercialização', COMERCIALIZACAO_LABELS[l.tipoVenda ?? ''] || '-'],
    ['Tipo de Abate', TIPO_ABATE_LABELS[l.tipoPeso ?? ''] || '-'],
    ['Data da Venda', fmtDate(l.dataVenda)],
    ['Data Embarque', fmtDate(l.dataEmbarque)],
    ['Data do Abate', fmtDate(l.dataAbate || l.data)],
    ['Categoria', cat],
    ['Quantidade', formatCabecas(l.quantidade)],
    ['Preço Negociado', `${formatMoeda(c.precoBase)} /@`],
  ];
  autoTable(doc, { ...tStyle, startY: y, head: [['DADOS CONFIRMADOS', '']], body: bloco1 });

  // BLOCO 2
  const y2 = ((doc as any).lastAutoTable?.finalY ?? y + 56) + 4;
  const bloco2: string[][] = [
    ['Peso Vivo Estimado', formatKg(c.pesoVivo)],
    ['Rend. Carcaça', formatPercent(c.rendPct)],
    ['Peso Carcaça', formatKg(c.pesoCarcaca)],
    ['Arrobas por Cabeça', formatArroba(c.arrobasCab)],
    ['Arrobas Totais Estimadas', formatArroba(c.arrobasTotais)],
  ];
  autoTable(doc, { ...tStyle, startY: y2, head: [['PROJEÇÃO OPERACIONAL (EXPECTATIVA)', '']], body: bloco2 });

  // BLOCO 3
  const y3 = ((doc as any).lastAutoTable?.finalY ?? y2 + 36) + 4;
  const bloco3: string[][] = [
    ['Bônus Estimado', `${formatMoeda(c.bonusArroba)} /@`],
    ['Descontos Estimados', `${formatMoeda(c.descArroba)} /@`],
    ['Preço Líq. Estimado', `${formatMoeda(c.liqArroba)} /@`],
    ['Valor Líq. Estimado Total', formatMoeda(c.valorLiq)],
  ];
  autoTable(doc, { ...tStyle, startY: y3, head: [['PROJEÇÃO FINANCEIRA (EXPECTATIVA)', '']], body: bloco3 });

  // BLOCO 4
  const y4 = ((doc as any).lastAutoTable?.finalY ?? y3 + 36) + 4;
  const bloco4: string[][] = [
    ['Líquido Estimado R$/@', formatMoeda(c.liqArroba)],
    ['Líquido Estimado / Cabeça', formatMoeda(c.liqCabeca)],
    ['Líquido Estimado / kg Vivo', formatMoeda(c.liqKg)],
  ];
  autoTable(doc, { ...tStyle, startY: y4, head: [['RESULTADO ESPERADO', '']], body: bloco4 });

  // Observação final
  const yObs = ((doc as any).lastAutoTable?.finalY ?? y4 + 26) + 8;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const obs = 'Os valores acima representam uma estimativa baseada nos parâmetros informados. O resultado final pode variar conforme rendimento de carcaça, peso real dos animais, bônus aplicados pelo frigorífico e descontos efetivos no abate.';
  const splitObs = doc.splitTextToSize(obs, 170);
  doc.text(splitObs, 20, yObs);
  doc.setTextColor(0, 0, 0);

  doc.save(`escala_programado_${format(parseISO(l.data), 'ddMMyyyy')}.pdf`);
}

// ── PDF Realizado ──
async function pdfRealizado(l: Lancamento, fazendaNome?: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cat = CATEGORIAS.find(cc => cc.value === l.categoria)?.label ?? l.categoria;
  const c = calcConfirmado(l);

  let y = 5;
  try {
    const logo = await loadLogoBase64();
    const lH = 12, lW = lH * 2;
    doc.addImage(logo, 'PNG', 105 - lW / 2, y, lW, lH);
    y += lH + 3;
  } catch {}

  doc.setFontSize(16);
  doc.text('Acerto Final de Abate - Realizado', 105, y + 5, { align: 'center' });
  y += 14;
  if (fazendaNome) { doc.setFontSize(11); doc.text(fazendaNome, 105, y, { align: 'center' }); y += 7; }

  const tStyle = { theme: 'grid' as const, headStyles: { fillColor: [34, 120, 74] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, fontSize: 10 }, bodyStyles: { fontSize: 10 }, columnStyles: { 0: { fontStyle: 'bold' as const, cellWidth: 65 } }, margin: { left: 20, right: 20 } };

  // BLOCO 1 - Dados do Abate
  const bloco1: string[][] = [
    ['Fazenda', fazendaNome || '-'],
    ['Frigorifico', l.fazendaDestino || '-'],
    ['Comercialização', COMERCIALIZACAO_LABELS[l.tipoVenda ?? ''] || '-'],
    ['Tipo de Abate', TIPO_ABATE_LABELS[l.tipoPeso ?? ''] || '-'],
    ['Data da Venda', fmtDate(l.dataVenda)],
    ['Data Embarque', fmtDate(l.dataEmbarque)],
    ['Data do Abate', fmtDate(l.dataAbate || l.data)],
    ['Categoria', cat],
    ['Quantidade', `${l.quantidade} cab.`],
  ];
  if (l.notaFiscal) bloco1.push(['Nota Fiscal', l.notaFiscal]);
  bloco1.push(['R$/@ Base', `${formatMoeda(c.precoBase)} /@`]);
  autoTable(doc, { ...tStyle, startY: y, head: [['DADOS DO ABATE', '']], body: bloco1 });

  // BLOCO 2 - Indicadores Zootecnicos
  const y2 = ((doc as any).lastAutoTable?.finalY ?? y + 56) + 4;
  const bloco2: string[][] = [
    ['Peso Vivo', formatKg(c.pesoVivo)],
    ['Rend. Carcaca', formatPercent(c.rendPct)],
    ['Peso Carcaca', formatKg(c.pesoCarcaca)],
    ['Arrobas por Cabeca', formatArroba(c.arrobasCab)],
    ['Arrobas Totais', formatArroba(c.arrobasTotais)],
  ];
  autoTable(doc, { ...tStyle, startY: y2, head: [['INDICADORES ZOOTECNICOS', '']], body: bloco2 });

  // BLOCO 3 - Resultado Financeiro
  const y3 = ((doc as any).lastAutoTable?.finalY ?? y2 + 36) + 4;
  const bloco3: string[][] = [];
  if (c.bonusArroba > 0) bloco3.push(['Bonus', `${formatMoeda(c.bonusArroba)} /@`]);
  if (c.descArroba > 0) bloco3.push(['Descontos', `${formatMoeda(c.descArroba)} /@`]);
  bloco3.push(
    ['Preco Liquido', `${formatMoeda(c.liqArroba)} /@`],
    ['Valor Liquido Total', formatMoeda(c.valorLiq)],
  );
  autoTable(doc, { ...tStyle, startY: y3, head: [['RESULTADO FINANCEIRO', '']], body: bloco3 });

  // BLOCO 4 - Resultado por Unidade
  const y4 = ((doc as any).lastAutoTable?.finalY ?? y3 + 36) + 4;
  const bloco4: string[][] = [
    ['Liquido R$/@', formatMoeda(c.liqArroba)],
    ['Liquido / Cabeca', formatMoeda(c.liqCabeca)],
    ['Liquido / kg Vivo', formatMoeda(c.liqKg)],
  ];
  autoTable(doc, { ...tStyle, startY: y4, head: [['RESULTADO POR UNIDADE', '']], body: bloco4 });

  doc.save(`abate_realizado_${format(parseISO(l.data), 'ddMMyyyy')}.pdf`);
}

// ── Component: botões inline para o detalhe ──
export function AbateShareButtons({ lancamento, fazendaNome }: { lancamento: Lancamento; fazendaNome?: string }) {
  const status = getStatus(lancamento);
  if (status !== 'programado' && status !== 'realizado') return null;
  const isConfirmado = status === 'programado';
  const label = isConfirmado ? 'Escala' : 'Abate Final';

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="gap-1.5 text-[10px] h-7" onClick={async () => {
        if (isConfirmado) await pdfConfirmado(lancamento, fazendaNome);
        else await pdfRealizado(lancamento, fazendaNome);
        toast.success('PDF exportado!');
      }}>
        <FileText className="h-3.5 w-3.5 text-destructive" /> PDF {label}
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5 text-[10px] h-7" onClick={() => {
        if (isConfirmado) shareWhatsApp(textoConfirmado(lancamento, fazendaNome));
        else shareWhatsApp(textoRealizado(lancamento, fazendaNome));
      }}>
        <MessageCircle className="h-3.5 w-3.5 text-green-600" /> WhatsApp
      </Button>
    </div>
  );
}

// ── Component: menu na listagem ──
export function AbateExportDialog({ lancamento, fazendaNome }: { lancamento: Lancamento; fazendaNome?: string }) {
  const [open, setOpen] = useState(false);
  const status = getStatus(lancamento);
  if (status !== 'programado' && status !== 'realizado') return null;
  const isConfirmado = status === 'programado';
  const titulo = isConfirmado ? 'Compartilhar Escala' : 'Compartilhar Abate Final';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => e.stopPropagation()}>
          <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs" onClick={e => e.stopPropagation()}>
        <DialogHeader><DialogTitle className="text-sm">{titulo}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Button className="w-full justify-start gap-2" variant="outline" onClick={async () => {
            if (isConfirmado) await pdfConfirmado(lancamento, fazendaNome);
            else await pdfRealizado(lancamento, fazendaNome);
            setOpen(false); toast.success('PDF exportado!');
          }}>
            <FileText className="h-5 w-5 text-destructive" /> Exportar PDF
          </Button>
          <Button className="w-full justify-start gap-2" variant="outline" onClick={() => {
            if (isConfirmado) shareWhatsApp(textoConfirmado(lancamento, fazendaNome));
            else shareWhatsApp(textoRealizado(lancamento, fazendaNome));
            setOpen(false);
          }}>
            <MessageCircle className="h-5 w-5 text-green-600" /> Compartilhar WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
