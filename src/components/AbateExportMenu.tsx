import { Lancamento, CATEGORIAS } from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, MessageCircle, Share2 } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { formatMoeda, fmtValor } from '@/lib/calculos/formatters';
import { calcIndicadoresLancamento } from '@/lib/calculos/economicos';
import { getStatus } from '@/lib/statusOperacional';
import { useState } from 'react';
import logoUrl from '@/assets/logo.png';

const TIPO_VENDA_LABELS: Record<string, string> = {
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
    `Tipo de Venda: ${TIPO_VENDA_LABELS[l.tipoVenda ?? ''] || '-'}`,
    `Tipo de Abate: ${TIPO_ABATE_LABELS[l.tipoPeso ?? ''] || '-'}`,
    '',
    `Data da Venda: ${fmtDate(l.dataVenda)}`,
    `Data Embarque: ${fmtDate(l.dataEmbarque)}`,
    `Data Prev. Abate: ${fmtDate(l.dataAbate || l.data)}`,
    '',
    `Categoria: ${cat}`,
    `Quantidade: ${l.quantidade} cabecas`,
    '',
    `Peso Vivo Previsto: ${fmtValor(c.pesoVivo)} kg`,
    '',
    `R$/@ Negociado: ${formatMoeda(c.precoBase)}`,
    '',
    `Arrobas Estimadas: ${fmtValor(c.arrobasTotais)} @`,
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
  const c = calcIndicadoresLancamento(l);
  const lines = [`🔪 *Resumo Final de Abate — Realizado*\n`];
  if (fazendaNome) lines.push(`🏠 Fazenda: ${fazendaNome}`);
  lines.push(
    `📅 Data da Venda: ${fmtDate(l.dataVenda)}`,
    `🚛 Data Embarque: ${fmtDate(l.dataEmbarque)}`,
    `📅 Data do Abate: ${fmtDate(l.dataAbate || l.data)}`,
    `🏭 Frigorífico: ${l.fazendaDestino || '-'}`,
    `🐂 ${l.quantidade} ${cat}`,
    '',
    `⚖️ Peso vivo: ${fmtValor(l.pesoMedioKg)} kg`,
    `📊 Rendimento: ${c.rendimento ? fmtValor(c.rendimento, 1) + '%' : '-'}`,
    `🥩 Peso carcaça: ${fmtValor(l.pesoCarcacaKg)} kg`,
    `📐 Arrobas finais: ${fmtValor(c.pesoTotalArrobas)}`,
    '',
  );
  const bonus = (l.bonusPrecoce ?? 0) + (l.bonusQualidade ?? 0) + (l.bonusListaTrace ?? 0);
  const desc = (l.descontoQualidade ?? 0) + (l.descontoFunrural ?? 0) + (l.outrosDescontos ?? 0);
  if (bonus > 0) lines.push(`✅ Bônus reais: ${formatMoeda(bonus)}`);
  if (desc > 0) lines.push(`❌ Descontos reais: ${formatMoeda(desc)}`);
  lines.push(
    '',
    `💰 *Valor Líquido Final: ${formatMoeda(c.valorFinal)}*`,
    `📈 Líq/@: ${formatMoeda(c.liqArroba)}`,
    `📈 Líq/Cab: ${formatMoeda(c.liqCabeca)}`,
    `📈 Líq/Kg: ${formatMoeda(c.liqKg)}`,
  );
  if (l.notaFiscal) lines.push(`📄 NF: ${l.notaFiscal}`);
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
    ['Tipo de Venda', TIPO_VENDA_LABELS[l.tipoVenda ?? ''] || '-'],
    ['Tipo de Abate', TIPO_ABATE_LABELS[l.tipoPeso ?? ''] || '-'],
    ['Data da Venda', fmtDate(l.dataVenda)],
    ['Data Embarque', fmtDate(l.dataEmbarque)],
    ['Data Prev. Abate', fmtDate(l.dataAbate || l.data)],
    ['Categoria', cat],
    ['Quantidade', `${l.quantidade} cab.`],
    ['Preço Negociado', `${formatMoeda(precoBase)} /@`],
  ];
  autoTable(doc, { ...tStyle, startY: y, head: [['DADOS CONFIRMADOS', '']], body: bloco1 });

  // BLOCO 2
  const y2 = ((doc as any).lastAutoTable?.finalY ?? y + 56) + 4;
  const bloco2: string[][] = [
    ['Peso Vivo Estimado', `${fmtValor(pesoVivo)} kg`],
    ['Rend. Carcaça', `${fmtValor(rendPct)} %`],
    ['Peso Carcaça', `${fmtValor(pesoCarcaca)} kg`],
    ['Arrobas por Cabeça', `${fmtValor(arrobasCab)} @`],
    ['Arrobas Totais Estimadas', `${fmtValor(totalArrobas)} @`],
  ];
  autoTable(doc, { ...tStyle, startY: y2, head: [['PROJEÇÃO OPERACIONAL (EXPECTATIVA)', '']], body: bloco2 });

  // BLOCO 3
  const y3 = ((doc as any).lastAutoTable?.finalY ?? y2 + 36) + 4;
  const bloco3: string[][] = [
    ['Bônus Estimado', `${formatMoeda(bonus)} /@`],
    ['Descontos Estimados', `${formatMoeda(desc)} /@`],
    ['Preço Líq. Estimado', `${formatMoeda(precoLiqArroba)} /@`],
    ['Valor Líq. Estimado Total', formatMoeda(valorLiq)],
  ];
  autoTable(doc, { ...tStyle, startY: y3, head: [['PROJEÇÃO FINANCEIRA (EXPECTATIVA)', '']], body: bloco3 });

  // BLOCO 4
  const y4 = ((doc as any).lastAutoTable?.finalY ?? y3 + 36) + 4;
  const bloco4: string[][] = [
    ['Líquido Estimado R$/@', formatMoeda(precoLiqArroba)],
    ['Líquido Estimado / Cabeça', formatMoeda(liqCabeca)],
    ['Líquido Estimado / kg Vivo', formatMoeda(liqKg)],
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

  doc.save(`escala_confirmado_${format(parseISO(l.data), 'ddMMyyyy')}.pdf`);
}

// ── PDF Realizado ──
async function pdfRealizado(l: Lancamento, fazendaNome?: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cat = CATEGORIAS.find(c => c.value === l.categoria)?.label ?? l.categoria;
  const c = calcIndicadoresLancamento(l);
  let y = 5;
  try {
    const logo = await loadLogoBase64();
    const lH = 12, lW = lH * 2;
    doc.addImage(logo, 'PNG', 105 - lW / 2, y, lW, lH);
    y += lH + 3;
  } catch {}

  doc.setFontSize(16);
  doc.text('Resumo Final de Abate — Realizado', 105, y + 5, { align: 'center' });
  y += 14;
  if (fazendaNome) { doc.setFontSize(11); doc.text(fazendaNome, 105, y, { align: 'center' }); y += 7; }

  const info: string[][] = [
    ['Data da Venda', fmtDate(l.dataVenda)],
    ['Data Embarque', fmtDate(l.dataEmbarque)],
    ['Data do Abate', fmtDate(l.dataAbate || l.data)],
    ['Frigorífico', l.fazendaDestino || '-'],
    ['Categoria', cat],
    ['Quantidade', `${l.quantidade} cabeças`],
  ];
  if (l.notaFiscal) info.push(['Nota Fiscal', l.notaFiscal]);
  autoTable(doc, { startY: y, body: info, theme: 'plain', bodyStyles: { fontSize: 11 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } }, margin: { left: 20, right: 20 } });

  const lastY1 = (doc as any).lastAutoTable?.finalY ?? 80;
  const detalhes: string[][] = [
    ['Peso vivo (kg)', fmtValor(l.pesoMedioKg)],
    ['Peso carcaça (kg)', fmtValor(l.pesoCarcacaKg)],
    ['Rendimento', c.rendimento ? fmtValor(c.rendimento, 1) + '%' : '-'],
    ['Arrobas finais', fmtValor(c.pesoTotalArrobas)],
    ['R$/@ base', fmtValor(l.precoArroba)],
    ['Bônus precoce', fmtValor(l.bonusPrecoce)],
    ['Bônus qualidade', fmtValor(l.bonusQualidade)],
    ['Bônus lista trace', fmtValor(l.bonusListaTrace)],
    ['Desc. qualidade', fmtValor(l.descontoQualidade)],
    ['Desc. funrural', fmtValor(l.descontoFunrural)],
    ['Outros descontos', fmtValor(l.outrosDescontos)],
    ['', ''],
    ['VALOR LÍQUIDO FINAL', formatMoeda(c.valorFinal)],
    ['Líquido por @', formatMoeda(c.liqArroba)],
    ['Líquido por cabeça', formatMoeda(c.liqCabeca)],
    ['Líquido por kg vivo', formatMoeda(c.liqKg)],
  ];
  autoTable(doc, {
    startY: lastY1 + 5, head: [['Campo', 'Valor']], body: detalhes, theme: 'grid',
    headStyles: { fillColor: [34, 120, 74] }, bodyStyles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } }, margin: { left: 20, right: 20 },
  });
  doc.save(`abate_realizado_${format(parseISO(l.data), 'ddMMyyyy')}.pdf`);
}

// ── Component: botões inline para o detalhe ──
export function AbateShareButtons({ lancamento, fazendaNome }: { lancamento: Lancamento; fazendaNome?: string }) {
  const status = getStatus(lancamento);
  if (status !== 'confirmado' && status !== 'conciliado') return null;
  const isConfirmado = status === 'confirmado';
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
  if (status !== 'confirmado' && status !== 'conciliado') return null;
  const isConfirmado = status === 'confirmado';
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
