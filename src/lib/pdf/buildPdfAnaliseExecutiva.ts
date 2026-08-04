/**
 * buildPdfAnaliseExecutiva — PDF Executivo da Análise Financeira V2 (D-2: híbrido).
 * PR-FIN-V2-PDF-EXECUTIVO-02.
 *
 * Os 4 blocos gráficos (Evolução · Organização · Distribuição · Compromissos) são IMAGENS dos
 * componentes REAIS da tela (capturados via capturarAnalise/html2canvas — mesmos props/helpers).
 * KPIs · Créditos · Transferências · Extrato seguem NATIVOS (texto pesquisável, paginação, moeda).
 * Fonte única: analiseAgregacoes. Sem lógica paralela.
 */
import type jsPDF from 'jspdf';
import {
  carregarLogoBase64, criarDocRetratoA4, addHeader, addHeaderGlobalTodasPaginas, addTituloSecao, addCardsKPI, addTabelaExecutiva, addFooterComPaginacao, PALETA,
} from '@/lib/pdf/pdfChassi';
import { desenharDonut, type RGB } from '@/lib/pdf/pdfMiniGraficos';
import { serieEvolucaoRP, creditosPorOrigem } from '@/lib/analise/analiseAgregacoes';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { ImagensAnalise, ImagemCapturada } from '@/lib/pdf/capturarAnalise';

const MARGEM = 10;
const PAGE_W = 210;
const PAGE_H = 297;
const INNER = PAGE_W - 2 * MARGEM;

export interface ItemPdf {
  id: string; data: string; mov: number; tipo: string;
  produto: string | null; fornecedor: string; doc: string;
  centro: string | null; macro: string | null; grupo: string | null; centroPlano: string | null; escopo: string | null;
}
export interface ExtratoLinhaPdf {
  id: string; data: string;
  produto: string | null; fornecedor: string; centro: string | null;
  valor: number; saldo: number | null;
  statusKey: string; statusLabel: string; concil: string; doc: string;
}
export interface TransferenciaPdf { data: string; sentido: 'entrada' | 'saida'; descricao: string; contaOrigem: string; contaDestino: string; valor: number; status: string; }
export interface ContaPdf {
  nome: string;
  fazenda?: string;
  saldoIni: number | null;
  saldoFin: number | null;
  totais: { ent: number; sai: number };
  serieLinhas: { data: string; mov: number; saldo: number | null; realizado: boolean }[];
  extrato: ExtratoLinhaPdf[];
  dadosOrg: ItemPdf[];
  transferencias: TransferenciaPdf[];
}

const AZUL: RGB = [30, 58, 95];
const AMBAR: RGB = [215, 121, 6];
const VERDE: RGB = [34, 120, 74];
const VERMELHO: RGB = [185, 28, 28];
const STATUS_COR: Record<string, RGB> = { realizado: [34, 120, 74], programado: [37, 99, 235], agendado: [124, 58, 173], previsto: [14, 116, 144] };
const corStatus = (k: string): RGB => STATUS_COR[k] ?? [120, 120, 120];
const corCredito = (c: string): RGB => (c === 'Receitas Operacionais' ? VERDE : c === 'Rendimentos Financeiros' ? [13, 148, 136] : c === 'Transferências Recebidas' ? [37, 99, 235] : AMBAR);

const fm = (v: number | null): string => (v == null ? '—' : formatMoeda(v));
const assinado = (v: number): string => `${v >= 0 ? '+' : '-'}${formatMoeda(Math.abs(v))}`;
const diaBR = (iso: string): string => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const pctDe = (v: number, total: number): number => (total > 0 ? Math.round((v / total) * 100) : 0);
const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'pdf';
const trunc = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function subtitulo(doc: jsPDF, texto: string, x: number, y: number): number {
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
  doc.text(texto, x, y);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  return y + 3;
}

function rankingLista(doc: jsPDF, x: number, y: number, w: number, itens: { label: string; valor: number; pct: number; cor: RGB }[], maxLabel: number): number {
  for (const it of itens) {
    doc.setFillColor(...it.cor); doc.rect(x, y - 2.3, 2.2, 2.2, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
    doc.text(trunc(it.label, maxLabel), x + 3.4, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text(`${formatMoeda(it.valor)}   ${it.pct}%`, x + w, y, { align: 'right' });
    y += 4.6;
  }
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  return y;
}

function blocoDonut(doc: jsPDF, x: number, w: number, y: number, titulo: string, ranking: { chave: string; total: number; count: number }[], totalGeral: number, corDe: (c: string) => RGB): number {
  const yy = titulo ? subtitulo(doc, titulo, x, y) : y;
  const cx = x + 18, cy = yy + 16;
  desenharDonut(doc, ranking.map((r) => ({ valor: r.total, cor: corDe(r.chave) })), cx, cy, 15, 8);
  const yLista = rankingLista(doc, x + 40, yy + 4, w - 40, ranking.slice(0, 6).map((r) => ({ label: r.chave, valor: r.total, pct: pctDe(r.total, totalGeral), cor: corDe(r.chave) })), 42);
  return Math.max(cy + 18, yLista) + 2;
}

/** Insere imagem capturada ajustada à largura, preservando proporção. RETORNA novo Y. */
function addImagem(doc: jsPDF, img: ImagemCapturada | undefined, x: number, y: number, maxW: number, maxH: number, tituloFallback: string): number {
  if (!img || img.w <= 0) {
    doc.setFontSize(9); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text(`${tituloFallback} — imagem indisponível.`, x, y + 5); doc.setTextColor(0, 0, 0);
    return y + 10;
  }
  let w = maxW;
  let h = w * (img.h / img.w);
  if (h > maxH) { h = maxH; w = h * (img.w / img.h); }
  doc.addImage(img.dataUrl, 'PNG', x + (maxW - w) / 2, y, w, h);
  return y + h;
}

export async function gerarPdfAnaliseExecutiva(params: {
  clienteNome: string;
  periodoLabel: string;
  ano: number;
  mes: number;
  contas: ContaPdf[];
  imagens?: ImagensAnalise;
}): Promise<void> {
  const { clienteNome, periodoLabel, ano, mes, contas, imagens } = params;
  if (contas.length === 0) return;
  const conta = contas[0];
  const img = imagens ?? {};

  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }
  const doc = criarDocRetratoA4();

  // Nativos: só as agregações que NÃO são bloco capturado (série p/ nota + créditos).
  const { pontos: serie, corteIdx, temProjetado } = serieEvolucaoRP(conta.serieLinhas, conta.saldoIni, ano, mes);
  const menor = serie.length ? serie.reduce((m, p) => (p.saldo < m.saldo ? p : m), serie[0]) : null;
  const saldoRealizado = serie.length ? serie[Math.max(0, Math.min(corteIdx, serie.length - 1))].saldo : null;
  const menorProjetado = temProjetado && serie.length ? serie.slice(corteIdx).reduce((m, p) => (p.saldo < m ? p.saldo : m), serie[corteIdx].saldo) : null;
  const creditos = creditosPorOrigem(conta.dadosOrg);
  const saldoFinal = conta.saldoFin ?? (conta.saldoIni != null ? conta.saldoIni + conta.totais.ent - conta.totais.sai : null);

  /* ───────── PÁGINA 1 — Visão do Caixa ───────── */
  const infoFaz = conta.fazenda ? ` · ${conta.fazenda}` : '';
  let y = addHeader(doc, {
    titulo: 'Análise Financeira Executiva',
    subtitulo: `${clienteNome}${infoFaz}`,
    infoLinha: `Conta: ${conta.nome}   ·   Período: ${periodoLabel}`,
    logoData,
  });
  y = addCardsKPI(doc, [
    { label: 'Saldo inicial', valor: fm(conta.saldoIni) },
    { label: 'Entradas', valor: formatMoeda(conta.totais.ent) },
    { label: 'Saídas', valor: formatMoeda(conta.totais.sai) },
    { label: 'Saldo final', valor: fm(saldoFinal) },
    { label: 'Menor saldo', valor: menor ? formatMoeda(menor.saldo) : '—' },
  ], y, { colunas: 5 });

  y = addImagem(doc, img.evolucao, MARGEM, y + 2, INNER, 84, 'Evolução do Caixa') + 1;
  if (temProjetado) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 90, 90);
    doc.text(`Saldo atual realizado: ${fm(saldoRealizado)}   ·   Saldo final projetado: ${fm(serie[serie.length - 1].saldo)}   ·   Menor saldo projetado: ${fm(menorProjetado)}`, MARGEM, y + 3);
    doc.setTextColor(0, 0, 0); y += 5;
  }
  y = addImagem(doc, img.organizacao, MARGEM, y + 2, INNER, PAGE_H - y - 16, 'Organização dos Pagamentos');

  /* ───────── PÁGINA 2 — Análise Econômica ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'De onde veio o dinheiro (Créditos)', 22); // 22 = reserva do cabeçalho global
  if (creditos.ranking.length > 0) y = blocoDonut(doc, MARGEM, INNER, y + 1, '', creditos.ranking, creditos.totalGeral, corCredito) + 1;
  else { doc.setFontSize(9); doc.setTextColor(...PALETA.CINZA_TEXTO); doc.text('Sem créditos no período.', MARGEM, y + 5); doc.setTextColor(0, 0, 0); y += 8; }

  y = addTituloSecao(doc, 'Para onde foi o dinheiro', y + 2);
  y = addImagem(doc, img.distribuicao, MARGEM, y + 2, INNER, 90, 'Distribuição Econômica') + 3;
  y = addImagem(doc, img.compromissos, MARGEM, y + 2, INNER, PAGE_H - y - 16, 'Principais Custos e Compromissos');

  /* ───────── PÁGINA 3 — Transferências entre Contas ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Transferências entre Contas', 22);
  const tRec = conta.transferencias.filter((t) => t.sentido === 'entrada');
  const tEnv = conta.transferencias.filter((t) => t.sentido === 'saida');
  const linhaT = (t: TransferenciaPdf): string[] => [diaBR(t.data), trunc(t.descricao || '—', 30), trunc(t.contaOrigem, 20), trunc(t.contaDestino, 20), formatMoeda(t.valor), t.status];
  const headT: string[][] = [['Data', 'Descrição', 'Conta origem', 'Conta destino', 'Valor', 'Status']];
  if (conta.transferencias.length === 0) {
    doc.setFontSize(9); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text('Nenhuma transferência entre contas próprias no período.', MARGEM, y + 6); doc.setTextColor(0, 0, 0);
  } else {
    // Recebidas (valor verde)
    y = subtitulo(doc, `Transferências Recebidas — ${formatMoeda(tRec.reduce((s, t) => s + t.valor, 0))}`, MARGEM, y + 3) + 1;
    if (tRec.length === 0) { doc.setFontSize(8); doc.setTextColor(...PALETA.CINZA_TEXTO); doc.text('Nenhuma.', MARGEM, y + 3); doc.setTextColor(0, 0, 0); y += 6; }
    else y = addTabelaExecutiva(doc, {
      head: headT, body: tRec.map(linhaT), startY: y,
      opts: { fontSize: 8, overflow: 'ellipsize', rowPageBreak: 'avoid', marginTop: 22, columnStyles: { 0: { cellWidth: 14 }, 4: { halign: 'right', cellWidth: 30 }, 5: { cellWidth: 26 } }, didParseCell: (d) => { if (d.section === 'body' && d.column.index === 4) d.cell.styles.textColor = VERDE; } },
    }) + 4;
    // Enviadas (valor vermelho)
    y = subtitulo(doc, `Transferências Enviadas — ${formatMoeda(tEnv.reduce((s, t) => s + t.valor, 0))}`, MARGEM, y + 2) + 1;
    if (tEnv.length === 0) { doc.setFontSize(8); doc.setTextColor(...PALETA.CINZA_TEXTO); doc.text('Nenhuma.', MARGEM, y + 3); doc.setTextColor(0, 0, 0); y += 6; }
    else y = addTabelaExecutiva(doc, {
      head: headT, body: tEnv.map(linhaT), startY: y,
      opts: { fontSize: 8, overflow: 'ellipsize', rowPageBreak: 'avoid', marginTop: 22, columnStyles: { 0: { cellWidth: 14 }, 4: { halign: 'right', cellWidth: 30 }, 5: { cellWidth: 26 } }, didParseCell: (d) => { if (d.section === 'body' && d.column.index === 4) d.cell.styles.textColor = VERMELHO; } },
    }) + 4;
    doc.setFontSize(8); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text('Transferências entre contas próprias não entram na análise econômica; impactam saldo, fluxo de caixa e planejamento financeiro.', MARGEM, PAGE_H - 22, { maxWidth: INNER });
    doc.setTextColor(0, 0, 0);
  }

  /* ───────── PÁGINA 4+ — Extrato Financeiro Completo ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Extrato Financeiro do Período', 22);
  const ext = conta.extrato;
  if (ext.length === 0) {
    doc.setFontSize(10); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text('Nenhuma movimentação para esta conta no período.', MARGEM, y + 6); doc.setTextColor(0, 0, 0);
  } else {
    const resultado = conta.totais.ent - conta.totais.sai;
    y = addCardsKPI(doc, [
      { label: 'Entradas', valor: formatMoeda(conta.totais.ent) },
      { label: 'Saídas', valor: formatMoeda(conta.totais.sai) },
      { label: 'Resultado do período', valor: `${resultado >= 0 ? '+' : '-'}${formatMoeda(Math.abs(resultado))}` },
      { label: 'Lançamentos', valor: String(ext.length) },
    ], y, { colunas: 4 });
    const cont = (k: string) => ext.filter((r) => r.statusKey === k).length;
    y = addCardsKPI(doc, [
      { label: 'Realizado', valor: String(cont('realizado')) },
      { label: 'Programado', valor: String(cont('programado')) },
      { label: 'Previsto', valor: String(cont('previsto')) },
      { label: 'Agendado', valor: String(cont('agendado')) },
    ], y, { colunas: 4 }) + 2;

    const ehFech = ext.map((r, i) => i === ext.length - 1 || ext[i + 1].data !== r.data);
    const body = ext.map((r) => [
      diaBR(r.data), trunc(r.produto || '—', 26), trunc(r.fornecedor || '—', 22), trunc(r.centro || '—', 16),
      assinado(r.valor), r.saldo == null ? '—' : formatMoeda(r.saldo),
      r.statusLabel, trunc(r.doc || '', 14),
    ]);
    addTabelaExecutiva(doc, {
      head: [['Data', 'Produto', 'Fornecedor', 'Centro', 'Valor', 'Saldo', 'Status', 'Doc']],
      body,
      startY: y,
      opts: {
        fontSize: 7,
        cellPadding: 1.1,
        overflow: 'ellipsize',
        rowPageBreak: 'avoid',
        marginTop: 22, // páginas de continuação começam abaixo do cabeçalho global (head repete)
        columnStyles: {
          0: { halign: 'left', cellWidth: 13 }, 1: { halign: 'left', cellWidth: 32 }, 2: { halign: 'left', cellWidth: 27 }, 3: { halign: 'left', cellWidth: 19 },
          4: { halign: 'right', cellWidth: 27 }, 5: { halign: 'right', cellWidth: 27 }, 6: { halign: 'left', cellWidth: 24 }, 7: { halign: 'left' },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return;
          const i = d.row.index;
          if ((d.column.index === 0 || d.column.index === 5) && ehFech[i]) d.cell.styles.fontStyle = 'bold';
          if (d.column.index === 4) d.cell.styles.textColor = ext[i].valor >= 0 ? VERDE : VERMELHO;
          if (d.column.index === 5) d.cell.styles.textColor = ext[i].saldo == null ? [50, 50, 50] : ext[i].saldo < 0 ? VERMELHO : VERDE;
          if (d.column.index === 6) d.cell.styles.textColor = corStatus(ext[i].statusKey);
        },
      },
    });
  }

  addHeaderGlobalTodasPaginas(doc, { clienteNome, fazenda: conta.fazenda, contaNome: conta.nome, periodoLabel, logoData, from: 2 });
  addFooterComPaginacao(doc);
  doc.save(`analise_financeira_executiva_${slug(clienteNome)}_${slug(periodoLabel)}.pdf`);
}
