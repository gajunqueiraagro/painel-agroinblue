/**
 * buildPdfAnaliseExecutiva — PDF Executivo da Análise Financeira V2 (redesign, 100% nativo).
 * PR-FIN-V2-PDF-EXECUTIVO-02 (Parte B).
 *
 * Extensão premium da tela Financeiro V2: dashboard denso + estrutura das saídas (donuts nativos)
 * + EXTRATO COMPLETO paginado. Consome EXCLUSIVAMENTE os helpers de analiseAgregacoes (fonte
 * única) + pdfChassi. jsPDF/autotable; gráficos nativos (pdfMiniGraficos); sem html2canvas.
 * Assinatura multi-contas (v1 renderiza a 1ª conta).
 */
import type jsPDF from 'jspdf';
import {
  carregarLogoBase64, criarDocRetratoA4, addHeader, addTituloSecao, addCardsKPI, addTabelaExecutiva, addFooterComPaginacao, PALETA,
} from '@/lib/pdf/pdfChassi';
import { desenharMiniLinhaSaldo, desenharBarraProporcional, desenharDonut, type RGB } from '@/lib/pdf/pdfMiniGraficos';
import {
  serieEvolucao, etapasPagamento, distribuicaoEconomica, maioresCompromissos, type LinhaFluxoIn,
} from '@/lib/analise/analiseAgregacoes';
import { formatMoeda } from '@/lib/calculos/formatters';

const MARGEM = 10;
const PAGE_W = 210;
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
export interface ContaPdf {
  nome: string;
  fazenda?: string;
  saldoIni: number | null;
  saldoFin: number | null;
  totais: { ent: number; sai: number };
  serieLinhas: LinhaFluxoIn[];   // {data,mov,saldo} → gráfico de evolução
  extrato: ExtratoLinhaPdf[];    // linhas completas do extrato
  dadosOrg: ItemPdf[];           // análises (etapas/distribuição/compromissos)
}

// ── Cores (espelham as telas) ──
const AZUL: RGB = [30, 58, 95];
const AMBAR: RGB = [215, 121, 6];
const CINZA: RGB = [148, 163, 184];
const VERDE: RGB = [34, 120, 74];
const VERMELHO: RGB = [185, 28, 28];
const COR_ETAPA: Record<string, RGB> = { j1: [59, 130, 246], j2: [34, 120, 74], j3: [215, 121, 6], fora: [148, 163, 184] };
const NEG_COR: Record<string, RGB> = { 'Pecuária': [30, 58, 95], 'Agricultura': [47, 111, 79], 'Administrativo': [183, 121, 31], 'Financeiro/Outros': [124, 58, 173] };
const PALETA_COMP: RGB[] = [[30, 58, 95], [47, 111, 79], [183, 121, 31], [124, 58, 173], [14, 116, 144], [157, 23, 77], [63, 98, 18], [161, 98, 7], [21, 94, 117], [91, 33, 182]];
const STATUS_COR: Record<string, RGB> = { realizado: [34, 120, 74], programado: [37, 99, 235], agendado: [124, 58, 173], previsto: [14, 116, 144], conciliado: [13, 148, 136] };
const NAO_OPER = new Set(['Investimento na Fazenda', 'Investimento em Bovinos', 'Dividendos']);

const corMacro = (chave: string): RGB => (chave.startsWith('Sem classificação') ? CINZA : NAO_OPER.has(chave) ? AMBAR : AZUL);
const corNegocio = (chave: string): RGB => (chave.startsWith('Sem classificação') ? CINZA : NEG_COR[chave] ?? [91, 33, 182]);
const corStatus = (k: string): RGB => STATUS_COR[k] ?? [120, 120, 120];

const ETAPA_LABEL: Record<string, { nome: string; faixa: string }> = {
  j1: { nome: '1ª etapa', faixa: '03–06' }, j2: { nome: '2ª etapa', faixa: '08–11' }, j3: { nome: '3ª etapa', faixa: '20–23' }, fora: { nome: 'Demais períodos', faixa: '—' },
};

const fm = (v: number | null): string => (v == null ? '—' : formatMoeda(v));
const fmtCompacto = (v: number): string => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : formatMoeda(v));
const dataBR = (iso: string): string => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const diaBR = (iso: string): string => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const assinado = (v: number): string => `${v >= 0 ? '+' : '−'} ${formatMoeda(Math.abs(v))}`;
const pctDe = (v: number, total: number): number => (total > 0 ? Math.round((v / total) * 100) : 0);
const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'pdf';
const trunc = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Caixa com bullets factuais (fundo azul institucional leve). */
function caixaBullets(doc: jsPDF, titulo: string, bullets: string[], y: number): number {
  const boxH = 6 + bullets.length * 5.2;
  doc.setFillColor(...PALETA.CARD_KPI_BG); doc.setDrawColor(...PALETA.LINHA_SEPARADORA); doc.setLineWidth(0.1);
  doc.rect(MARGEM, y, INNER, boxH, 'FD');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PALETA.CINZA_MEDIO);
  doc.text(titulo.toUpperCase(), MARGEM + 3, y + 4.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
  bullets.forEach((b, i) => doc.text(`•  ${b}`, MARGEM + 4, y + 9.5 + i * 5.2));
  doc.setTextColor(0, 0, 0);
  return y + boxH + 3;
}

/** Título miúdo de sub-bloco (sem barra cheia). */
function subtitulo(doc: jsPDF, texto: string, x: number, y: number): number {
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
  doc.text(texto, x, y);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  return y + 3;
}

/** Lista de ranking manual (quadradinho de cor + rótulo à esquerda; valor · % à direita). */
function rankingLista(doc: jsPDF, x: number, y: number, w: number, itens: { label: string; valor: number; pct: number; cor: RGB }[], maxLabel: number): number {
  const rowH = 4.6;
  for (const it of itens) {
    doc.setFillColor(...it.cor); doc.rect(x, y - 2.3, 2.2, 2.2, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
    doc.text(trunc(it.label, maxLabel), x + 3.4, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text(`${formatMoeda(it.valor)}   ${it.pct}%`, x + w, y, { align: 'right' });
    y += rowH;
  }
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  return y;
}

/** Bloco "donut + ranking" numa coluna (usado em Distribuição natureza/negócio). */
function blocoDonut(doc: jsPDF, x: number, w: number, y: number, titulo: string,
  ranking: { chave: string; total: number; count: number }[], totalGeral: number, corDe: (c: string) => RGB): number {
  let yy = subtitulo(doc, titulo, x, y);
  const cx = x + 18, cy = yy + 16;
  desenharDonut(doc, ranking.map((r) => ({ valor: r.total, cor: corDe(r.chave) })), cx, cy, 15, 8);
  const yLista = rankingLista(doc, x + 38, yy + 4, w - 38,
    ranking.slice(0, 6).map((r) => ({ label: r.chave, valor: r.total, pct: pctDe(r.total, totalGeral), cor: corDe(r.chave) })), 18);
  return Math.max(cy + 18, yLista) + 2;
}

export async function gerarPdfAnaliseExecutiva(params: {
  clienteNome: string;
  periodoLabel: string;
  ano: number;
  mes: number;
  contas: ContaPdf[];
}): Promise<void> {
  const { clienteNome, periodoLabel, ano, mes, contas } = params;
  if (contas.length === 0) return;
  const conta = contas[0]; // v1: 1ª conta (assinatura já é lista p/ multi-contas)

  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }
  const doc = criarDocRetratoA4();

  // ── Agregações (fonte única) ──
  const serie = serieEvolucao(conta.serieLinhas, conta.saldoIni, ano, mes);
  const menor = serie.length ? serie.reduce((m, p) => (p.saldo < m.saldo ? p : m), serie[0]) : null;
  const { buckets: etapas, totalGeral: totEtapas } = etapasPagamento(conta.dadosOrg);
  const distMacro = distribuicaoEconomica(conta.dadosOrg, 'macro');
  const distNeg = distribuicaoEconomica(conta.dadosOrg, 'negocio');
  const comp = maioresCompromissos(conta.dadosOrg);

  const saldoFinal = conta.saldoFin ?? (conta.saldoIni != null ? conta.saldoIni + conta.totais.ent - conta.totais.sai : null);
  const topTotal = comp.top.reduce((s, r) => s + r.total, 0);
  const topPct = pctDe(topTotal, comp.totalGeral);
  const maiorNeg = distNeg.ranking.find((r) => !r.chave.startsWith('Sem classificação')) ?? distNeg.ranking[0] ?? null;
  const maiorComp = comp.top[0] ?? null;

  /* ───────── PÁGINA 1 — Dashboard Executivo ───────── */
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

  // Bloco 1 — Evolução do caixa
  y = addTituloSecao(doc, 'Evolução do Caixa', y + 1);
  if (serie.length >= 2) {
    desenharMiniLinhaSaldo(doc, serie, { x: MARGEM, y: y + 1, w: INNER, h: 48 }, fmtCompacto);
    y += 52;
  } else {
    doc.setFontSize(9); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text('Saldo inicial não informado — evolução indisponível.', MARGEM, y + 6); doc.setTextColor(0, 0, 0);
    y += 12;
  }

  // Bloco — Organização dos pagamentos (barra + 4 linhas)
  y = addTituloSecao(doc, 'Organização dos Pagamentos', y + 1);
  const ordemEtapas: ('j1' | 'j2' | 'j3' | 'fora')[] = ['j1', 'j2', 'j3', 'fora'];
  desenharBarraProporcional(doc, ordemEtapas.map((k) => ({ valor: etapas[k].total, cor: COR_ETAPA[k] })), { x: MARGEM, y: y + 1, w: INNER, h: 5 });
  y += 9;
  y = rankingLista(doc, MARGEM, y, INNER,
    ordemEtapas.map((k) => ({ label: `${ETAPA_LABEL[k].nome} (${ETAPA_LABEL[k].faixa}) · ${etapas[k].count} pag.`, valor: etapas[k].total, pct: pctDe(etapas[k].total, totEtapas), cor: COR_ETAPA[k] })), 60) + 1;

  // Resumo factual
  const resumo: string[] = [];
  resumo.push(`Entradas ${formatMoeda(conta.totais.ent)}  ·  Saídas ${formatMoeda(conta.totais.sai)}.`);
  if (menor) resumo.push(`Menor saldo do período: ${formatMoeda(menor.saldo)}${menor.dia !== 'Início' ? ` (dia ${menor.dia})` : ''}.`);
  resumo.push(`Top 10 compromissos: ${topPct}% das saídas.`);
  caixaBullets(doc, 'Resumo do período', resumo, y + 1);

  /* ───────── PÁGINA 2 — Estrutura das Saídas ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Distribuição Econômica', 14);
  const colW = (INNER - 8) / 2;
  const yEsq = blocoDonut(doc, MARGEM, colW, y + 1, 'Por natureza', distMacro.ranking, distMacro.totalGeral, corMacro);
  const yDir = blocoDonut(doc, MARGEM + colW + 8, colW, y + 1, 'Por negócio', distNeg.ranking, distNeg.totalGeral, corNegocio);
  y = Math.max(yEsq, yDir) + 1;

  y = addTituloSecao(doc, 'Principais Custos e Compromissos', y + 1);
  const cxc = MARGEM + 18, cyc = y + 18;
  desenharDonut(doc, comp.linhas.map((r, i) => ({ valor: r.total, cor: r.ehDemais ? CINZA : PALETA_COMP[i % PALETA_COMP.length] })), cxc, cyc, 16, 9);
  rankingLista(doc, MARGEM + 42, y + 3, INNER - 42,
    comp.linhas.map((r, i) => ({ label: r.chave, valor: r.total, pct: pctDe(r.total, comp.totalGeral), cor: r.ehDemais ? CINZA : PALETA_COMP[i % PALETA_COMP.length] })), 34);
  doc.setFontSize(8); doc.setTextColor(...PALETA.CINZA_TEXTO);
  doc.text(`Top 10 compromissos representam ${topPct}% das saídas · Total ${formatMoeda(comp.totalGeral)}.`, MARGEM, cyc + 22); doc.setTextColor(0, 0, 0);

  /* ───────── PÁGINA 3+ — Extrato Financeiro Completo ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Extrato Financeiro do Período', 14);
  const ext = conta.extrato;
  if (ext.length === 0) {
    doc.setFontSize(10); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text('Nenhuma movimentação para esta conta no período.', MARGEM, y + 6); doc.setTextColor(0, 0, 0);
  } else {
    const ehFech = ext.map((r, i) => i === ext.length - 1 || ext[i + 1].data !== r.data);
    const body = ext.map((r) => [
      diaBR(r.data), trunc(r.produto || '—', 26), trunc(r.fornecedor || '—', 22), trunc(r.centro || '—', 16),
      assinado(r.valor), r.saldo == null ? '—' : formatMoeda(r.saldo),
      r.concil && r.concil !== 'Sem vínculo' ? `${r.statusLabel} · ${trunc(r.concil, 10)}` : r.statusLabel,
      trunc(r.doc || '—', 12),
    ]);
    addTabelaExecutiva(doc, {
      head: [['Data', 'Produto', 'Fornecedor', 'Centro', 'Valor', 'Saldo', 'Status', 'Doc']],
      body,
      startY: y,
      opts: {
        fontSize: 7,
        cellPadding: 1.1,
        columnStyles: { 0: { halign: 'left' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'left' } },
        didParseCell: (d) => {
          if (d.section !== 'body') return;
          const i = d.row.index;
          if ((d.column.index === 0 || d.column.index === 5) && ehFech[i]) d.cell.styles.fontStyle = 'bold';
          if (d.column.index === 4) d.cell.styles.textColor = ext[i].valor >= 0 ? VERDE : VERMELHO;
          if (d.column.index === 6) d.cell.styles.textColor = corStatus(ext[i].statusKey);
        },
      },
    });
  }

  addFooterComPaginacao(doc);
  doc.save(`analise_financeira_executiva_${slug(clienteNome)}_${slug(periodoLabel)}.pdf`);
}
