import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import type { LancamentoV2, DimensaoDataFinanceiro } from '@/hooks/useFinanceiroV2';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';
import { formatMoeda } from '@/lib/calculos/formatters';
import { formatDocumento } from '@/lib/financeiro/documentoHelper';

interface FornecedorMap {
  id: string;
  nome: string;
}

// PR-FIN-GRADE-DATAS-03 — rótulo humano da dimensão temporal soberana usada no recorte da grade.
const DIMENSAO_LABEL: Record<DimensaoDataFinanceiro, string> = {
  financeira: 'Financeira',
  competencia: 'Competência',
  vencimento: 'Vencimento',
  pagamento: 'Pagamento',
};

interface Props {
  lancamentos: LancamentoV2[];
  fornecedores: FornecedorMap[];
  ano: string;
  fazendaNome?: string;
  totalCount: number;
  dimensao: DimensaoDataFinanceiro;   // PR-FIN-GRADE-DATAS-03 — dimensão usada; identificada no arquivo
}

function fmtDate(d: string | null) {
  if (!d) return '';
  try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; }
}




function buildRows(lancamentos: LancamentoV2[], fornecedores: FornecedorMap[]) {
  return lancamentos.map(l => {
    const forn = fornecedores.find(f => f.id === l.favorecido_id)?.nome || '';
    const valor = l.sinal >= 0 ? l.valor : -l.valor;
    const doc = formatDocumento((l as any).tipo_documento, l.numero_documento);
    return {
      comp: fmtDate(l.data_competencia),
      // PR-FIN-GRADE-DATAS-03 — VENC. e PGTO. exportadas como colunas independentes (cada uma a sua coluna
      //   real; nunca fundidas; nunca a data financeira derivada). fmtDate(null) → '' (padrão do formato).
      venc: fmtDate(l.data_vencimento),
      pgto: fmtDate(l.data_pagamento),
      produto: l.descricao || '',
      fornecedor: forn,
      valor,
      valorFmt: formatMoeda(Math.abs(l.valor)),
      documento: doc,
      status: l.status_transacao || '',
      macro: l.macro_custo || '',
      centro: l.centro_custo || '',
      subcentro: l.subcentro || '',
      sinal: l.sinal,
    };
  });
}

function exportExcel(lancamentos: LancamentoV2[], fornecedores: FornecedorMap[], ano: string, dimensao: DimensaoDataFinanceiro, fazendaNome?: string) {
  const rows = buildRows(lancamentos, fornecedores);
  const data = rows.map(r => ({
    // PR-FIN-GRADE-DATAS-03 — Comp. | Venc. | Pgto. em colunas separadas.
    'Comp.': r.comp,
    'Venc.': r.venc,
    'Pgto.': r.pgto,
    'Produto': r.produto,
    'Fornecedor': r.fornecedor,
    'Valor': r.valor,
    'Documento': r.documento,
    'Status': r.status,
    'Macro': r.macro,
    'Centro': r.centro,
    'Subcentro': r.subcentro,
  }));

  const faz = fazendaNome ? `_${fazendaNome.replace(/\s+/g, '_')}` : '';
  triggerXlsxDownload({
    filename: `financeiro_v2_${ano}${faz}.xlsx`,
    sheets: [
      {
        name: 'Lançamentos',
        rows: data,
        cols: [
          { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 },
          { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 },
          { wch: 18 }, { wch: 18 },
        ],
      },
      // PR-FIN-GRADE-DATAS-03 — aba de metadado simples identificando a dimensão temporal do recorte.
      {
        name: 'Filtro',
        mode: 'aoa',
        rows: [
          ['Data por', DIMENSAO_LABEL[dimensao]],
          ['Ano', ano],
        ],
        cols: [{ wch: 12 }, { wch: 18 }],
      },
    ],
  });
}

function exportPDF(lancamentos: LancamentoV2[], fornecedores: FornecedorMap[], ano: string, dimensao: DimensaoDataFinanceiro, fazendaNome?: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  let y = 10;
  doc.setFontSize(14);
  doc.text(`Financeiro - ${ano}`, pageW / 2, y, { align: 'center' });
  y += 6;
  if (fazendaNome) {
    doc.setFontSize(10);
    doc.text(fazendaNome, pageW / 2, y, { align: 'center' });
    y += 5;
  }
  // PR-FIN-GRADE-DATAS-03 — identifica a dimensão temporal do recorte (subtítulo simples).
  doc.setFontSize(9);
  doc.text(`Data por: ${DIMENSAO_LABEL[dimensao]}`, pageW / 2, y, { align: 'center' });
  y += 4;
  doc.setFontSize(8);
  doc.text(`${lancamentos.length} lançamentos`, pageW / 2, y, { align: 'center' });
  y += 4;

  const rows = buildRows(lancamentos, fornecedores);
  // PR-FIN-GRADE-DATAS-03 — Comp. | Venc. | Pgto. como colunas independentes.
  const head = [['Comp.', 'Venc.', 'Pgto.', 'Produto', 'Fornecedor', 'Valor', 'Documento', 'Status']];
  const body = rows.map(r => [
    r.comp, r.venc, r.pgto, r.produto, r.fornecedor,
    formatMoeda(r.sinal >= 0 ? Math.abs(r.valor) : -Math.abs(r.valor)),
    r.documento, r.status,
  ]);

  const totalEnt = rows.filter(r => r.sinal > 0).reduce((s, r) => s + Math.abs(r.valor), 0);
  const totalSai = rows.filter(r => r.sinal < 0).reduce((s, r) => s + Math.abs(r.valor), 0);
  body.push(['', '', '', '', 'ENTRADAS', formatMoeda(totalEnt), '', '']);
  body.push(['', '', '', '', 'SAÍDAS', formatMoeda(-totalSai), '', '']);

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [34, 120, 74], fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    margin: { left: 8, right: 8 },
  });

  const faz = fazendaNome ? `_${fazendaNome.replace(/\s+/g, '_')}` : '';
  doc.save(`financeiro_v2_${ano}${faz}.pdf`);
}

export function FinanceiroV2ExportMenu({ lancamentos, fornecedores, ano, fazendaNome, totalCount, dimensao }: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (totalCount === 0) return null;

  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(true);
    try {
      if (type === 'excel') {
        exportExcel(lancamentos, fornecedores, ano, dimensao, fazendaNome);
      } else {
        exportPDF(lancamentos, fornecedores, ano, dimensao, fazendaNome);
        toast.success(`PDF exportado! (${lancamentos.length} lançamentos)`);
      }
    } catch {
      toast.error('Erro ao exportar');
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-0.5 px-2" disabled={exporting}>
          {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Exportar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="end">
        <p className="text-[9px] text-muted-foreground px-2 py-0.5">{totalCount} lançamentos</p>
        <Button variant="ghost" className="w-full justify-start gap-2 h-7 text-[10px]" onClick={() => handleExport('excel')} disabled={exporting}>
          <FileSpreadsheet className="h-3.5 w-3.5 text-primary" /> Excel
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 h-7 text-[10px]" onClick={() => handleExport('pdf')} disabled={exporting}>
          <FileText className="h-3.5 w-3.5 text-destructive" /> PDF
        </Button>
      </PopoverContent>
    </Popover>
  );
}
