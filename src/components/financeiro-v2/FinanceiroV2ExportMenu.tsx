import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import {
  carregarLogoBase64, criarDocRetratoA4, addHeader, addTituloSecao, addCardsKPI, addTabelaExecutiva, addFooterComPaginacao,
} from '@/lib/pdf/pdfChassi';
import { STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
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

// Resumo de status (client-side, só sobre os lancamentos recebidos). Ordena os oficiais e agrega os demais.
function contarStatus(lancamentos: LancamentoV2[]): { label: string; valor: string }[] {
  const cont = new Map<string, number>();
  for (const l of lancamentos) {
    const s = (l.status_transacao || '—').toLowerCase();
    cont.set(s, (cont.get(s) ?? 0) + 1);
  }
  const ordem = ['realizado', 'programado', 'agendado', 'previsto'];
  const cards: { label: string; valor: string }[] = [];
  for (const s of ordem) {
    if (cont.has(s)) { cards.push({ label: STATUS_FILTRO_LABEL[s] ?? s, valor: String(cont.get(s)) }); cont.delete(s); }
  }
  for (const [s, n] of cont) cards.push({ label: STATUS_FILTRO_LABEL[s] ?? s, valor: String(n) });
  return cards;
}

// PR-FIN-V2-EXPORT-LAYOUT-01 — PDF migrado para o chassi AGROinBLUE "Versão PDF v2" (pdfChassi).
//   Async por causa do logo (carregarLogoBase64). Sem novo dado de banco; só o que o export já recebe.
async function exportPDF(lancamentos: LancamentoV2[], fornecedores: FornecedorMap[], ano: string, dimensao: DimensaoDataFinanceiro, fazendaNome?: string) {
  const rows = buildRows(lancamentos, fornecedores);
  const totalEnt = rows.filter(r => r.sinal > 0).reduce((s, r) => s + Math.abs(r.valor), 0);
  const totalSai = rows.filter(r => r.sinal < 0).reduce((s, r) => s + Math.abs(r.valor), 0);
  const resultado = totalEnt - totalSai;

  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }

  const doc = criarDocRetratoA4();
  let y = addHeader(doc, {
    titulo: 'Financeiro',
    subtitulo: `${fazendaNome ? fazendaNome + ' · ' : ''}Ano ${ano} · Data por: ${DIMENSAO_LABEL[dimensao]}`,
    infoLinha: `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')} · ${lancamentos.length} lançamento${lancamentos.length !== 1 ? 's' : ''}`,
    logoData,
  });

  // Resumo Executivo — cards financeiros + resumo por status (tudo client-side).
  y = addTituloSecao(doc, 'Resumo Executivo', y);
  y = addCardsKPI(doc, [
    { label: 'Entradas', valor: formatMoeda(totalEnt) },
    { label: 'Saídas', valor: formatMoeda(totalSai) },
    { label: 'Resultado do período', valor: formatMoeda(resultado) },
    { label: 'Lançamentos', valor: String(lancamentos.length) },
  ], y, { colunas: 4 });
  const statusCards = contarStatus(lancamentos);
  if (statusCards.length > 0) y = addCardsKPI(doc, statusCards, y, { colunas: 4 });

  // Tabela padrão v2 (header azul, zebra, linha TOTAL).
  const head = [['Comp.', 'Venc.', 'Pgto.', 'Produto', 'Fornecedor', 'Valor', 'Documento', 'Status']];
  const body = rows.map(r => [
    r.comp, r.venc, r.pgto, r.produto, r.fornecedor,
    formatMoeda(r.sinal >= 0 ? Math.abs(r.valor) : -Math.abs(r.valor)),
    r.documento, r.status,
  ]);
  const foot = [['', '', '', '', 'TOTAL', formatMoeda(resultado), '', '']];
  addTabelaExecutiva(doc, {
    head, body, startY: y,
    opts: { foot, totalVerde: resultado >= 0, columnStyles: { 5: { halign: 'right' } } },
  });

  addFooterComPaginacao(doc);
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
        await exportPDF(lancamentos, fornecedores, ano, dimensao, fazendaNome);
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
