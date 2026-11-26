/**
 * CONTAS-BANCARIAS-LISTA-01 (mock aprovado 26/11) — o "Exportar ▾" da lista de Contas bancárias: Excel e PDF do que a lista MOSTRA (os
 * filtros valem), no padrão do de Lançamentos (`FinanceiroV2ExportMenu`: o mesmo Popover, `triggerXlsxDownload` e o chassi do PDF).
 * Sem dado = "—" (o que o cadastro tem; nada inventado). Só lê.
 */
import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';
import { addFooterComPaginacao, addHeader, addTabelaExecutiva, carregarLogoBase64, criarDocRetratoA4 } from '@/lib/pdf/pdfChassi';
import { normalizarErro } from '@/lib/erroOperacional';
import {
  agenciaNaLista, bancoNaLista, contaNaLista, faixaDaConta, nomeDaConta, ROTULO_FAIXA, situacaoNaLista,
  type BancoReferencia, type ContaBancariaCadastro,
} from '@/lib/financeiro/contasBancarias';

const CABECALHO = ['Cód.', 'Nome da conta', 'Tipo', 'Banco', 'Agência', 'Conta', 'Fazenda', 'Situação'] as const;

/** As linhas exportadas (uma regra para o Excel e o PDF): o mesmo texto da lista. */
export function linhasDaExportacao(contas: readonly ContaBancariaCadastro[], bancos: readonly BancoReferencia[],
  fazendaNome: (id: string | null) => string): string[][] {
  return contas.map((c) => {
    const b = bancoNaLista(c, bancos);
    return [c.codigo_conta ?? '—', nomeDaConta(c), ROTULO_FAIXA[faixaDaConta(c)], b.codigo ? `${b.codigo} ${b.nome}` : b.nome,
      agenciaNaLista(c), contaNaLista(c), fazendaNome(c.fazenda_id) || '—', situacaoNaLista(c).texto];
  });
}

export function ContasExportMenu({ contas, bancos, fazendaNome, clienteNome }: {
  contas: readonly ContaBancariaCadastro[]; bancos: readonly BancoReferencia[]; fazendaNome: (id: string | null) => string; clienteNome: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const vazio = contas.length === 0;

  const exportar = async (tipo: 'excel' | 'pdf') => {
    setExportando(true);
    try {
      const linhas = linhasDaExportacao(contas, bancos, fazendaNome);
      if (tipo === 'excel') {
        triggerXlsxDownload({ filename: 'Contas bancárias.xlsx', sheets: [{ name: 'Contas', mode: 'aoa', rows: [[...CABECALHO], ...linhas],
          cols: [6, 34, 16, 22, 10, 14, 22, 24].map((wch) => ({ wch })) }] });
      } else {
        const doc = criarDocRetratoA4();
        const logo = await carregarLogoBase64().catch(() => undefined);
        const y = addHeader(doc, { titulo: 'Contas bancárias', subtitulo: clienteNome, infoLinha: `${contas.length} ${contas.length === 1 ? 'conta' : 'contas'}`, logoData: logo });
        addTabelaExecutiva(doc, { head: [[...CABECALHO]], body: linhas, startY: y + 2, opts: { fontSize: 7.5, cellPadding: 1.2, overflow: 'ellipsize' } });
        addFooterComPaginacao(doc);
        doc.save('Contas bancárias.pdf');
      }
      setAberto(false);
    } catch (e) {
      toast.error(normalizarErro(e, 'exportarContas').mensagem);
    } finally { setExportando(false); }
  };

  return (
    <Popover open={aberto && !vazio} onOpenChange={(o) => { if (!vazio) setAberto(o); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-6 shrink-0 gap-0.5 px-2 text-[10.5px]" disabled={exportando || vazio}
          title={vazio ? 'Nada para exportar com estes filtros' : undefined} data-testid="exportar-contas">
          {exportando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Exportar ▾
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="end">
        <p className="px-2 py-0.5 text-[9.5px] text-muted-foreground">{contas.length} {contas.length === 1 ? 'conta' : 'contas'}</p>
        <Button variant="ghost" className="h-7 w-full justify-start gap-2 text-[10.5px]" onClick={() => { void exportar('excel'); }} disabled={exportando}
          data-testid="exportar-contas-excel">
          <FileSpreadsheet className="h-3.5 w-3.5 text-primary" /> Excel
        </Button>
        <Button variant="ghost" className="h-7 w-full justify-start gap-2 text-[10.5px]" onClick={() => { void exportar('pdf'); }} disabled={exportando}
          data-testid="exportar-contas-pdf">
          <FileText className="h-3.5 w-3.5 text-destructive" /> PDF
        </Button>
      </PopoverContent>
    </Popover>
  );
}
