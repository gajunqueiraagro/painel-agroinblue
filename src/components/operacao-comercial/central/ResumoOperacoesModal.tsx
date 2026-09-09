/**
 * RESUMO DAS OPERAÇÕES — prévia, PDF e Excel. PR-OC-RESUMO-01.
 *
 * ⚠ A PRÉVIA É O DOCUMENTO. O PDF não é "outra tela": é esta impressa, com as mesmas três
 * listas, os mesmos totais e a mesma ordem. Quem confere na tela e depois manda o PDF ao
 * contador não pode receber duas respostas para a mesma pergunta.
 *
 * ⚠ HERDA O RECORTE DA LISTA, sem filtro próprio. O operador já escolheu produtor, fazenda,
 * período e tipo lá fora; repetir os seletores aqui abriria a porta para o resumo dizer
 * respeito a um recorte diferente do que está na tela atrás dele.
 */
import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { carregarLogoBase64, addLogoToDoc, PALETA } from '@/lib/pdf/pdfChassi';
import {
  carregarResumoOC, totalLinhas,
  type OcResumo, type OcResumoLinha, type OcResumoParcela, type TomSituacao,
} from '@/v2/lib/ocResumo';

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inteiro = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

/** "Compras" · "Vendas" · "Abates" · "Boitel" — e o título do documento. */
const PLURAL: Record<string, string> = { compra: 'Compras', venda: 'Vendas', abate: 'Abates', boitel: 'Boitel' };
const TITULO: Record<string, string> = {
  compra: 'Resumo das compras', venda: 'Resumo das vendas',
  abate: 'Resumo dos abates', boitel: 'Resumo do boitel',
};
/** "Já entrou" só faz sentido na compra; nos demais o gado SAI. */
const rotuloEntrou = (tipo: string) => (tipo === 'compra' ? 'Já entrou na fazenda' : 'Já saiu');
const rotuloNaoEntrou = (tipo: string) => (tipo === 'compra' ? 'Ainda não entrou' : 'Ainda não saiu');
const rotuloFalta = (tipo: string) => (tipo === 'compra' ? 'Falta pagar' : 'Falta receber');

/** Uma célula do autotable: texto simples ou texto com estilo próprio. */
type CelulaPdf = string | number | { content: string; styles: Record<string, unknown> };

const PILULA = 'inline-block rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap';

/**
 * O token da situação virando cor — PR-OC-RESUMO-02 itens D e 2.
 *
 * ⚠ UMA TABELA POR SAÍDA, A PARTIR DO MESMO TOKEN. A prévia pinta pílula, o PDF pinta TEXTO
 * (fundo colorido em folha impressa some no preto e branco e gasta tinta), e as duas leem o
 * mesmo `tomSituacao` que `ocResumo` decidiu. Sem o token, o PDF teria de adivinhar a cor a
 * partir da palavra — e erraria na primeira palavra nova.
 * ⚠ VENCIDA É VERMELHO E A VENCER É LARANJA, e a diferença é a do operador: uma já é
 * problema, a outra ainda é agenda. Cinza para as duas apagava exatamente essa distinção.
 */
const PILULA_TOM: Readonly<Record<TomSituacao, string>> = {
  ok: 'bg-success text-success-foreground',
  parcial: 'bg-warning text-warning-foreground',
  aberto: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200',
  vencido: 'bg-destructive text-destructive-foreground',
  ausente: 'bg-muted text-muted-foreground',
};
/** A mesma decisão em RGB, para o PDF. */
const PDF_TOM: Readonly<Record<TomSituacao, [number, number, number]>> = {
  ok: [21, 128, 61],
  parcial: [161, 98, 7],
  aberto: [194, 65, 12],
  vencido: [185, 28, 28],
  ausente: [130, 130, 130],
};
/** O texto de uma linha vencida sai inteiro em vermelho — data, valor e situação. */
const TEXTO_VENCIDO = 'text-destructive';
/** O que ainda vai vencer é agenda: laranja escuro, nunca o vermelho da pendência. */
const TEXTO_A_VENCER = 'text-orange-700 dark:text-orange-400';

export interface FiltrosResumo {
  produtor: string;
  fazenda: string;
  periodoIni: string;
  periodoFim: string;
  tipo: string;
  chips: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  operacoes: readonly {
    id: string; tipo_operacao: string; data_operacao: string;
    contraparte_id: string | null; qtd_negociada: number | null;
    valor_acordado: number | null; valor_total: number | null; status_comercial: string;
  }[];
  filtros: FiltrosResumo;
  nomeContraparte: (id: string | null) => string;
}

export function ResumoOperacoesModal({
  open, onClose, clienteId, operacoes, filtros, nomeContraparte,
}: Props) {
  const [resumo, setResumo] = useState<OcResumo | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open) { setResumo(null); return; }
    let cancelado = false;
    setCarregando(true);
    carregarResumoOC(clienteId, operacoes, nomeContraparte)
      .then((r) => { if (!cancelado) { setResumo(r); setCarregando(false); } })
      .catch((e) => { if (!cancelado) { setCarregando(false); toast.error(`Não foi possível montar o resumo: ${e.message}`); } });
    return () => { cancelado = true; };
  }, [open, clienteId, operacoes, nomeContraparte]);

  /* Com um tipo só, o título é dele; com vários, é genérico — e cada tipo vira um bloco. */
  const tituloDoc = useMemo(() => {
    const tipos = resumo?.blocos.map((b) => b.tipo) ?? [];
    return tipos.length === 1 ? (TITULO[tipos[0]] ?? 'Resumo das operações') : 'Resumo das operações';
  }, [resumo]);

  const geradoEm = resumo?.geradoEm ?? new Date();
  const geradoTexto = `${String(geradoEm.getDate()).padStart(2, '0')}/${String(geradoEm.getMonth() + 1).padStart(2, '0')}/${geradoEm.getFullYear()} ${String(geradoEm.getHours()).padStart(2, '0')}:${String(geradoEm.getMinutes()).padStart(2, '0')}`;
  const periodo = `${filtros.periodoIni || '—'} a ${filtros.periodoFim || dataBR(new Date().toISOString().slice(0, 10))}`;

  const nomeArquivo = (ext: string) => {
    const tipos = resumo?.blocos.map((b) => b.tipo) ?? [];
    const alvo = tipos.length === 1 ? (PLURAL[tipos[0]] ?? 'operacoes') : 'operacoes';
    const d = geradoEm;
    const carimbo = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const produtor = filtros.produtor.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `resumo-${alvo.toLowerCase()}-${produtor}-${carimbo}.${ext}`;
  };

  // ── PDF ────────────────────────────────────────────────────────────────────
  const exportarPdf = async () => {
    if (!resumo) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297;
    const M = 10;
    let logo: string | null = null;
    try { logo = await carregarLogoBase64(); } catch { /* segue sem logo */ }

    /* ⚠ O CABEÇALHO AZUL É DESENHADO EM TODA PÁGINA (`didDrawPage`), não só na primeira: uma
       folha solta do meio do relatório tem de dizer de quem é e de que período. */
    const cabecalho = () => {
      doc.setFillColor(...PALETA.AZUL_PRIMARIO);
      doc.rect(0, 0, pageW, 16, 'F');
      if (logo) addLogoToDoc(doc, logo, 2, 24);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text(tituloDoc, 48, 10);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('Operações Comerciais', pageW - M, 10, { align: 'right' });
      /* ⚠ TRÊS CÉLULAS DE IDENTIFICAÇÃO — item 4, como na prévia e no mock v6. Era uma
         frase corrida de 7pt com quatro assuntos separados por ponto; num documento que sai
         da mão do operador e vai para a do contador, "de quem · onde · quando" são três
         perguntas e se leem melhor como três colunas com rótulo.
         ⚠ "GERADO EM" SAIU DAQUI e foi para o rodapé: é carimbo do documento, não
         identificação do recorte — e ocupava o lugar de um dos três. */
      const celW = (pageW - 2 * M) / 3;
      const celulas: [string, string][] = [
        ['produtor', filtros.produtor], ['fazenda', filtros.fazenda], ['período', periodo],
      ];
      celulas.forEach(([rotulo, valor], i) => {
        const x = M + i * celW;
        doc.setTextColor(130, 130, 130); doc.setFontSize(6); doc.setFont('helvetica', 'normal');
        doc.text(rotulo, x, 20.5);
        doc.setTextColor(40, 40, 40); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text(valor, x, 24.5, { maxWidth: celW - 4 });
      });
      doc.setFont('helvetica', 'normal');
    };

    let y = 29;
    const linhaAlta = 6;

    /* ⚠ CÉLULA COM COR É OBJETO, não string — a API do autotable. A situação e, nas linhas
       vencidas, a data e o valor saem do mesmo `tomSituacao` que a prévia usa. */
    const pintado = (texto: string, tom: TomSituacao): CelulaPdf =>
      ({ content: texto, styles: { textColor: PDF_TOM[tom] } });

    for (const bloco of resumo.blocos) {
      const secoes: { titulo: string; head: string[]; body: CelulaPdf[][]; foot?: CelulaPdf[] }[] = [];

      const cabLinhas = ['Data', 'Operação', 'Fornecedor', 'Cab', 'Cab receb.', 'Data receb.', 'Valor', 'Pago', 'Falta pagar', 'Situação'];
      const corpoEntrou = bloco.entrou.map((l) => [
        dataBR(l.data), l.descricao, l.fornecedor,
        l.qtdNegociada == null ? '—' : inteiro(l.qtdNegociada),
        inteiro(l.qtdRecebida),
        l.dataRecebimento.primeira ? ddmm(l.dataRecebimento.primeira) + (l.dataRecebimento.n > 1 ? ` (+${l.dataRecebimento.n - 1})` : '') : '—',
        num(l.valor), num(l.pago), num(l.faltaPagar), pintado(l.situacao, l.tomSituacao),
      ]);
      const tEntrou = totalLinhas(bloco.entrou);
      secoes.push({
        titulo: `${rotuloEntrou(bloco.tipo)} — ${tEntrou.n} ${PLURAL[bloco.tipo]?.toLowerCase() ?? ''} · ${inteiro(tEntrou.cabReceb)} de ${inteiro(tEntrou.cab)} cabeças · R$ ${num(tEntrou.valor)} · pago R$ ${num(tEntrou.pago)} · falta pagar R$ ${num(tEntrou.falta)}`,
        head: cabLinhas, body: corpoEntrou,
        foot: ['', 'TOTAL', '', inteiro(tEntrou.cab), inteiro(tEntrou.cabReceb), '', num(tEntrou.valor), num(tEntrou.pago), num(tEntrou.falta), ''],
      });

      const tNao = totalLinhas(bloco.naoEntrou);
      secoes.push({
        titulo: `${rotuloNaoEntrou(bloco.tipo)} — ${tNao.n} · ${inteiro(tNao.cab)} cabeças · R$ ${num(tNao.valor)} · falta pagar R$ ${num(tNao.falta)}`,
        head: ['Data', 'Operação', 'Fornecedor', 'Cab', 'Valor', 'Pago', 'Falta pagar', 'Situação'],
        body: bloco.naoEntrou.map((l) => [
          dataBR(l.data), l.descricao, l.fornecedor,
          l.qtdNegociada == null ? '—' : inteiro(l.qtdNegociada),
          num(l.valor), num(l.pago), num(l.faltaPagar), pintado(l.situacao, l.tomSituacao),
        ]),
        foot: ['', 'TOTAL', '', inteiro(tNao.cab), num(tNao.valor), num(tNao.pago), num(tNao.falta), ''],
      });

      const totalFalta = bloco.faltaPagar.reduce((a, p) => a + p.valor, 0);
      secoes.push({
        titulo: `${rotuloFalta(bloco.tipo)} — ${bloco.faltaPagar.length} parcelas · R$ ${num(totalFalta)}`,
        head: ['Vence', 'Operação', 'Fornecedor', 'Gado', 'Valor', 'Situação'],
        /* ⚠ A LINHA VENCIDA SAI VERMELHA NOS TRÊS CAMPOS QUE IMPORTAM — item 2: quando
           venceu, quanto é e há quanto tempo. Colorir só a última coluna deixava a data e o
           valor com a mesma cara de uma parcela em dia. */
        body: bloco.faltaPagar.map((p) => [
          pintado(dataBR(p.vencimento), p.tomSituacao),
          p.descricao + (p.totalParcelas > 1 && p.sequencia != null ? ` · ${p.sequencia}/${p.totalParcelas}` : ''),
          p.fornecedor, p.gado,
          pintado(num(p.valor), p.tomSituacao),
          pintado(p.situacao, p.tomSituacao),
        ]),
        foot: ['', 'TOTAL', '', '', num(totalFalta), ''],
      });

      for (const sec of secoes) {
        /* ⚠ TÍTULO NUNCA ÓRFÃO: se não cabem o título e ao menos duas linhas, a seção começa
           na página seguinte. Um título sozinho no rodapé é uma promessa que a folha não
           cumpre. */
        if (y + linhaAlta * 3 > 196) { doc.addPage(); y = 29; }
        doc.setTextColor(...PALETA.AZUL_PRIMARIO);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text(sec.titulo, M, y);
        y += 3;

        autoTable(doc, {
          startY: y,
          head: [sec.head],
          body: sec.body.length ? sec.body : [[{ content: 'nenhuma', colSpan: sec.head.length, styles: { halign: 'center', textColor: [130, 130, 130] } } as never]],
          foot: sec.body.length && sec.foot ? [sec.foot] : undefined,
          margin: { left: M, right: M, top: 29 },
          styles: { fontSize: 7, cellPadding: 1.2, overflow: 'ellipsize' },
          headStyles: { fillColor: PALETA.AZUL_PRIMARIO, textColor: [255, 255, 255], fontSize: 6.5 },
          /* ⚠ CINZA 220, NÃO 240 — item 1. O fecho de uma lista é a linha que o operador
             procura primeiro; em 240 ele se confundia com a zebra e sumia no meio da tabela. */
          footStyles: { fillColor: [220, 220, 220], textColor: [40, 40, 40], fontStyle: 'bold', fontSize: 7 },
          rowPageBreak: 'avoid',
          didDrawPage: cabecalho,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API do autotable
        y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;
      }
    }

    /* ⚠ RODAPÉ EM TODA PÁGINA, NAS TRÊS POSIÇÕES — item 3. Só depois de saber quantas são:
       "página 2 de 5" não pode ser escrito antes de a quinta existir.
       ⚠ 7pt PORQUE 7pt SÃO OS 9px DO ENVELOPE: a folha se mede em pontos e a tela em pixels,
       e 9px a 96dpi dão 6,75pt. Escrever "9" aqui seria 12px na folha — um rodapé maior que
       o corpo da tabela, que está em 7.
       ⚠ NÃO É O `addFooterComPaginacao` DO CHASSI, e a razão é geométrica: aquele calcula a
       partir de `PAGE_W`/`PAGE_H` de A4 RETRATO e este documento é paisagem, então as três
       âncoras cairiam fora da folha. O texto do centro também é outro, por decisão deste
       envelope. Não é régua nova: é a mesma forma em outra geometria. */
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(130, 130, 130); doc.setFont('helvetica', 'normal');
      doc.text(`AGROinBLUE · gerado em ${geradoTexto}`, M, 203);
      doc.text('Gestão Inteligente do Agro', pageW / 2, 203, { align: 'center' });
      doc.text(`página ${i} de ${total}`, pageW - M, 203, { align: 'right' });
    }
    doc.save(nomeArquivo('pdf'));
  };

  // ── Excel ──────────────────────────────────────────────────────────────────
  const exportarExcel = () => {
    if (!resumo) return;
    const wb = XLSX.utils.book_new();
    const abaEntrou: (string | number)[][] = [['Tipo', 'Data', 'Operação', 'Fornecedor', 'Cab', 'Cab receb.', 'Data receb.', 'Valor', 'Pago', 'Falta pagar', 'Situação']];
    const abaNao: (string | number)[][] = [['Tipo', 'Data', 'Operação', 'Fornecedor', 'Cab', 'Valor', 'Pago', 'Falta pagar', 'Situação']];
    const abaFalta: (string | number)[][] = [['Tipo', 'Vence', 'Operação', 'Fornecedor', 'Gado', 'Valor', 'Situação']];

    for (const b of resumo.blocos) {
      const rot = PLURAL[b.tipo] ?? b.tipo;
      for (const l of b.entrou) abaEntrou.push([rot, dataBR(l.data), l.descricao, l.fornecedor, l.qtdNegociada ?? 0, l.qtdRecebida, l.dataRecebimento.primeira ? ddmm(l.dataRecebimento.primeira) : '—', l.valor, l.pago, l.faltaPagar, l.situacao]);
      const tE = totalLinhas(b.entrou);
      if (b.entrou.length) abaEntrou.push([rot, '', 'TOTAL', '', tE.cab, tE.cabReceb, '', tE.valor, tE.pago, tE.falta, '']);

      for (const l of b.naoEntrou) abaNao.push([rot, dataBR(l.data), l.descricao, l.fornecedor, l.qtdNegociada ?? 0, l.valor, l.pago, l.faltaPagar, l.situacao]);
      const tN = totalLinhas(b.naoEntrou);
      if (b.naoEntrou.length) abaNao.push([rot, '', 'TOTAL', '', tN.cab, tN.valor, tN.pago, tN.falta, '']);

      for (const p of b.faltaPagar) abaFalta.push([rot, dataBR(p.vencimento), p.descricao + (p.totalParcelas > 1 && p.sequencia != null ? ` · ${p.sequencia}/${p.totalParcelas}` : ''), p.fornecedor, p.gado, p.valor, p.situacao]);
      if (b.faltaPagar.length) abaFalta.push([rot, '', 'TOTAL', '', '', b.faltaPagar.reduce((a, p) => a + p.valor, 0), '']);
    }

    /* ⚠ A ABA "FILTROS" NÃO É ENFEITE: uma planilha sem o recorte que a gerou vira número sem
       pergunta na primeira vez que alguém a reencontra numa pasta. */
    const abaFiltros = [
      ['Produtor', filtros.produtor],
      ['Fazenda', filtros.fazenda],
      ['Período', periodo],
      ['Tipo', filtros.tipo],
      ['Filtros ativos', filtros.chips.join(' · ') || '—'],
      ['Gerado em', geradoTexto],
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaEntrou), 'Entrou');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaNao), 'Nao entrou');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaFalta), 'Falta pagar');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaFiltros), 'Filtros');
    XLSX.writeFile(wb, nomeArquivo('xlsx'));
  };

  // ── Prévia ─────────────────────────────────────────────────────────────────
  /* ⚠ TÍTULO NÃO QUEBRA E NÃO CORTA NO MEIO DA PALAVRA — item 5. Sem largura declarada, a
     tabela distribuía a coluna pelo CONTEÚDO e "Falta pagar"/"Cab receb." quebravam em duas
     linhas ou saíam pela metade. Com o `colgroup` somando 100% e o `truncate` aqui, o que
     não couber vira reticências e o texto inteiro fica no `title`. */
  const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th title={typeof children === 'string' ? children : undefined}
      className={cn('overflow-hidden truncate whitespace-nowrap bg-muted px-1.5 py-1 text-[10px] font-normal text-muted-foreground',
        right ? 'text-right' : 'text-left')}>{children}</th>
  );
  const Td = ({ children, right, cls }: { children?: React.ReactNode; right?: boolean; cls?: string }) => (
    <td className={cn('px-1.5 py-1 align-middle truncate', right && 'text-right tabular-nums', cls)}>{children}</td>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[1100px] max-w-[97vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col [&>button.absolute]:hidden">
        <div className="flex h-11 shrink-0 items-center gap-3 bg-primary px-3.5 text-primary-foreground">
          <img src="/favicon.ico" alt="" className="h-5 w-5 opacity-0 absolute" aria-hidden />
          <span className="text-[13px] font-medium">{tituloDoc}</span>
          <span className="ml-auto text-[11px] opacity-90">Operações Comerciais</span>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ⚠ TRÊS CÉLULAS, NÃO QUATRO — item 4. "gerado em" é carimbo do documento, não
            identificação do recorte: ele desceu para o rodapé, onde vive o carimbo, e as
            três perguntas que sobram (de quem · onde · quando) ganharam a largura dele. */}
        <div className="shrink-0 grid grid-cols-3 gap-3 bg-muted/40 px-3.5 py-1.5">
          {[['produtor', filtros.produtor], ['fazenda', filtros.fazenda], ['período', periodo]].map(([r, v]) => (
            <div key={r}>
              <div className="text-[10px] text-muted-foreground">{r}</div>
              <div className="text-[12px] font-medium truncate" title={v}>{v}</div>
            </div>
          ))}
        </div>

        <div className="shrink-0 flex items-center gap-2 px-3.5 py-1 border-b">
          <span className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            {filtros.chips.length ? filtros.chips.map((c) => <span key={c} className="rounded bg-muted px-1.5 py-0.5">{c}</span>) : <span>sem outros filtros</span>}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={exportarExcel} disabled={!resumo}
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-40">
              <Download className="h-3 w-3" /> Excel
            </button>
            <button type="button" onClick={() => { void exportarPdf(); }} disabled={!resumo}
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-40">
              <FileText className="h-3 w-3" /> PDF
            </button>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2 space-y-4">
          {carregando && <div className="py-8 text-center text-[11px] text-muted-foreground">Montando o resumo…</div>}
          {!carregando && resumo?.blocos.length === 0 && (
            <div className="py-8 text-center text-[11px] text-muted-foreground">Nenhuma operação no recorte atual.</div>
          )}
          {resumo?.blocos.map((b) => {
            const tE = totalLinhas(b.entrou);
            const tN = totalLinhas(b.naoEntrou);
            const totalFalta = b.faltaPagar.reduce((a, p) => a + p.valor, 0);
            const plural = PLURAL[b.tipo]?.toLowerCase() ?? b.tipo;
            return (
              <div key={b.tipo} className="space-y-3">
                {resumo.blocos.length > 1 && <div className="text-[12px] font-semibold">{PLURAL[b.tipo] ?? b.tipo}</div>}

                <Lista titulo={`${rotuloEntrou(b.tipo)}`} tom="success"
                  total={`${tE.n} ${plural} · ${inteiro(tE.cabReceb)} de ${inteiro(tE.cab)} cabeças · R$ ${num(tE.valor)} · pago R$ ${num(tE.pago)} · falta pagar R$ ${num(tE.falta)}`}>
                  <table className="w-full table-fixed border-collapse text-[11px]">
                    {/* ⚠ AS LARGURAS SOMAM 100% — item 5, e é isso que impede o título de
                        cortar: sem `colgroup` a tabela repartia pelo conteúdo e um nome de
                        fornecedor longo espremia "Falta pagar" até virar "Falta p…". */}
                    <colgroup>
                      <col className="w-[7%]" /><col className="w-[13%]" /><col className="w-[18%]" />
                      <col className="w-[5%]" /><col className="w-[7%]" /><col className="w-[7%]" />
                      <col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[10%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead><tr>
                      <Th>Data</Th><Th>Operação</Th><Th>Fornecedor</Th><Th right>Cab</Th><Th right>Cab receb.</Th>
                      <Th>Data receb.</Th><Th right>Valor</Th><Th right>Pago</Th><Th right>Falta pagar</Th><Th>Situação</Th>
                    </tr></thead>
                    <tbody>
                      {b.entrou.map((l) => {
                        const parcial = l.qtdNegociada != null && l.qtdRecebida < l.qtdNegociada;
                        return (
                          <tr key={l.operacao_id} className="border-b h-[21px]">
                            <Td>{dataBR(l.data)}</Td>
                            <Td>{l.descricao}</Td>
                            <Td>{l.fornecedor}</Td>
                            <Td right>{l.qtdNegociada == null ? '—' : inteiro(l.qtdNegociada)}</Td>
                            <Td right cls={parcial ? 'text-amber-600 font-semibold' : undefined}>{inteiro(l.qtdRecebida)}</Td>
                            <Td>{l.dataRecebimento.primeira ? ddmm(l.dataRecebimento.primeira) + (l.dataRecebimento.n > 1 ? ` (+${l.dataRecebimento.n - 1})` : '') : '—'}</Td>
                            <Td right>{num(l.valor)}</Td>
                            <Td right>{num(l.pago)}</Td>
                            <Td right>{num(l.faltaPagar)}</Td>
                            <Td><span className={cn(PILULA, PILULA_TOM[l.tomSituacao])}>{l.situacao}</span></Td>
                          </tr>
                        );
                      })}
                      {b.entrou.length > 0 && (
                        <tr className="bg-primary/15 font-semibold h-[21px]">
                          <Td /><Td>TOTAL</Td><Td /><Td right>{inteiro(tE.cab)}</Td>
                          <Td right cls={tE.cabReceb < tE.cab ? 'text-amber-600' : undefined}>{inteiro(tE.cabReceb)}</Td>
                          <Td /><Td right>{num(tE.valor)}</Td><Td right>{num(tE.pago)}</Td><Td right>{num(tE.falta)}</Td><Td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Lista>

                <Lista titulo={rotuloNaoEntrou(b.tipo)} tom="warning"
                  total={`${tN.n} ${plural} · ${inteiro(tN.cab)} cabeças · R$ ${num(tN.valor)} · falta pagar R$ ${num(tN.falta)}`}>
                  <table className="w-full table-fixed border-collapse text-[11px]">
                    <colgroup>
                      <col className="w-[8%]" /><col className="w-[15%]" /><col className="w-[22%]" />
                      <col className="w-[6%]" /><col className="w-[12%]" /><col className="w-[11%]" />
                      <col className="w-[12%]" /><col className="w-[14%]" />
                    </colgroup>
                    <thead><tr>
                      <Th>Data</Th><Th>Operação</Th><Th>Fornecedor</Th><Th right>Cab</Th>
                      <Th right>Valor</Th><Th right>Pago</Th><Th right>Falta pagar</Th><Th>Situação</Th>
                    </tr></thead>
                    <tbody>
                      {b.naoEntrou.map((l) => (
                        <tr key={l.operacao_id} className="border-b h-[21px]">
                          <Td>{dataBR(l.data)}</Td><Td>{l.descricao}</Td><Td>{l.fornecedor}</Td>
                          <Td right>{l.qtdNegociada == null ? '—' : inteiro(l.qtdNegociada)}</Td>
                          <Td right>{num(l.valor)}</Td><Td right>{num(l.pago)}</Td><Td right>{num(l.faltaPagar)}</Td>
                          <Td><span className={cn(PILULA, PILULA_TOM[l.tomSituacao])}>{l.situacao}</span></Td>
                        </tr>
                      ))}
                      {b.naoEntrou.length > 0 && (
                        <tr className="bg-primary/15 font-semibold h-[21px]">
                          <Td /><Td>TOTAL</Td><Td /><Td right>{inteiro(tN.cab)}</Td>
                          <Td right>{num(tN.valor)}</Td><Td right>{num(tN.pago)}</Td><Td right>{num(tN.falta)}</Td><Td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Lista>

                <Lista titulo={rotuloFalta(b.tipo)} tom="warning"
                  total={`${b.faltaPagar.length} parcelas · R$ ${num(totalFalta)}`}>
                  <table className="w-full table-fixed border-collapse text-[11px]">
                    <colgroup>
                      <col className="w-[9%]" /><col className="w-[20%]" /><col className="w-[24%]" />
                      <col className="w-[16%]" /><col className="w-[12%]" /><col className="w-[19%]" />
                    </colgroup>
                    <thead><tr>
                      <Th>Vence</Th><Th>Operação</Th><Th>Fornecedor</Th><Th>Gado</Th><Th right>Valor</Th><Th>Situação</Th>
                    </tr></thead>
                    <tbody>
                      {b.faltaPagar.map((p, i) => (
                        <tr key={`${p.operacao_id}-${p.sequencia ?? i}`} className="border-b h-[21px]">
                          {/* ⚠ VENCIDA EM VERMELHO, A VENCER EM LARANJA — item 2. A data, o
                              valor e a situação vão juntos: são a mesma resposta. */}
                          <Td cls={p.tomSituacao === 'vencido' ? TEXTO_VENCIDO : p.tomSituacao === 'aberto' ? TEXTO_A_VENCER : undefined}>{dataBR(p.vencimento)}</Td>
                          <Td>{p.descricao}{p.totalParcelas > 1 && p.sequencia != null && <span className="text-muted-foreground">{` · ${p.sequencia}/${p.totalParcelas}`}</span>}</Td>
                          <Td>{p.fornecedor}</Td>
                          <Td><span className={cn(PILULA, p.gado === 'não entrou' ? 'bg-muted text-muted-foreground' : p.gado.startsWith('entrou ') && p.gado.includes(' de ') ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground')}>{p.gado}</span></Td>
                          <Td right cls={cn('tabular-nums',
                            p.tomSituacao === 'vencido' ? `${TEXTO_VENCIDO} font-semibold`
                            : p.tomSituacao === 'aberto' ? TEXTO_A_VENCER : undefined)}>{num(p.valor)}</Td>
                          <Td><span className={cn(PILULA, PILULA_TOM[p.tomSituacao])}>{p.situacao}</span></Td>
                        </tr>
                      ))}
                      {b.faltaPagar.length > 0 && (
                        <tr className="bg-primary/15 font-semibold h-[21px]">
                          <Td /><Td>TOTAL</Td><Td /><Td /><Td right>{num(totalFalta)}</Td><Td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Lista>
              </div>
            );
          })}
          {/* ⚠ O MESMO RODAPÉ DO PDF, MENOS A PAGINAÇÃO — item 3. A prévia é o documento: se
              ela não carimbar quem gerou e quando, o operador confere na tela um papel que
              o contador vai receber assinado de outro jeito. "Página" fica de fora porque a
              prévia não tem páginas — prometê-las seria a única parte falsa da cópia. */}
          {!carregando && resumo && resumo.blocos.length > 0 && (
            <div className="flex items-baseline justify-between gap-3 pt-1 text-[9px] text-muted-foreground">
              <span>AGROinBLUE · gerado em {geradoTexto}</span>
              <span>Gestão Inteligente do Agro</span>
              <span />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Lista({ titulo, total, tom, children }: {
  titulo: string; total: string; tom: 'success' | 'warning'; children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border overflow-hidden">
      {/* ⚠ O TÍTULO NÃO QUEBRA — item 5. Com `flex-wrap`, a faixa de totais empurrava
          "Falta pagar" para uma segunda linha assim que o texto crescia, e o título da
          lista aparecia sozinho acima de um número solto. O título não cede (`shrink-0`);
          quem trunca é o total, que é contexto. */}
      <div className={cn('flex items-baseline gap-2 px-2 py-1',
        tom === 'success' ? 'bg-success/10' : 'bg-warning/10')}>
        <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold">{titulo}</span>
        <span className="truncate text-[10px] text-muted-foreground" title={total}>{total}</span>
      </div>
      {children}
    </div>
  );
}
