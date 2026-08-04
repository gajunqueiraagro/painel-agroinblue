/**
 * buildPdfAnaliseExecutiva — PDF Executivo da Análise Financeira V2 (6 páginas, 100% nativo).
 * PR-FIN-V2-PDF-EXECUTIVO-01 (FASE 2B).
 *
 * Consome EXCLUSIVAMENTE os helpers de analiseAgregacoes (fonte única) + pdfChassi. Nenhuma
 * regra/cálculo/classificação paralela. jsPDF + autotable; gráficos nativos (pdfMiniGraficos);
 * sem html2canvas. Assinatura já é multi-contas (v1 renderiza a 1ª conta).
 */
import {
  carregarLogoBase64, criarDocRetratoA4, addHeader, addTituloSecao, addCardsKPI, addTabelaExecutiva, addFooterComPaginacao, PALETA,
} from '@/lib/pdf/pdfChassi';
import { desenharMiniLinhaSaldo, desenharBarraProporcional, type RGB } from '@/lib/pdf/pdfMiniGraficos';
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
export interface ContaPdf {
  nome: string;
  saldoIni: number | null;
  saldoFin: number | null;
  totais: { ent: number; sai: number };
  linhas: LinhaFluxoIn[];
  dadosOrg: ItemPdf[];
}

// Cores (espelham as telas). Etapas / negócio / paleta de compromissos.
const AZUL: RGB = [30, 58, 95];
const CINZA: RGB = [148, 163, 184];
const COR_ETAPA: Record<string, RGB> = { j1: [59, 130, 246], j2: [34, 120, 74], j3: [215, 121, 6], fora: [148, 163, 184] };
const NEG_COR: Record<string, RGB> = {
  'Pecuária': [30, 58, 95], 'Agricultura': [47, 111, 79], 'Administrativo': [183, 121, 31], 'Financeiro/Outros': [124, 58, 173],
};
const PALETA_COMP: RGB[] = [
  [30, 58, 95], [47, 111, 79], [183, 121, 31], [124, 58, 173], [14, 116, 144],
  [157, 23, 77], [63, 98, 18], [161, 98, 7], [21, 94, 117], [91, 33, 182],
];
const corNegocio = (chave: string): RGB => NEG_COR[chave] ?? CINZA;

const ETAPA_LABEL: Record<string, { nome: string; faixa: string }> = {
  j1: { nome: '1ª etapa', faixa: '03–06' },
  j2: { nome: '2ª etapa', faixa: '08–11' },
  j3: { nome: '3ª etapa', faixa: '20–23' },
  fora: { nome: 'Demais períodos', faixa: '—' },
};

const fm = (v: number | null): string => (v == null ? '—' : formatMoeda(v));
const fmtCompacto = (v: number): string =>
  (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : formatMoeda(v));
const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'pdf';

function caixaBullets(doc: ReturnType<typeof criarDocRetratoA4>, titulo: string, bullets: string[], y: number): number {
  const linhas = bullets.length;
  const boxH = 6 + linhas * 5.2;
  doc.setFillColor(...PALETA.CARD_KPI_BG); doc.setDrawColor(...PALETA.LINHA_SEPARADORA); doc.setLineWidth(0.1);
  doc.rect(MARGEM, y, INNER, boxH, 'FD');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PALETA.CINZA_MEDIO);
  doc.text(titulo.toUpperCase(), MARGEM + 3, y + 4.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
  bullets.forEach((b, i) => doc.text(`•  ${b}`, MARGEM + 4, y + 9.5 + i * 5.2));
  doc.setTextColor(0, 0, 0);
  return y + boxH + 3;
}

function pctDe(v: number, total: number): number { return total > 0 ? Math.round((v / total) * 100) : 0; }

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
  const serie = serieEvolucao(conta.linhas, conta.saldoIni, ano, mes);
  const menor = serie.length ? serie.reduce((m, p) => (p.saldo < m.saldo ? p : m), serie[0]) : null;
  const finalP = serie.length ? serie[serie.length - 1] : null;
  const { buckets: etapas, totalGeral: totEtapas } = etapasPagamento(conta.dadosOrg);
  const distNeg = distribuicaoEconomica(conta.dadosOrg, 'negocio');
  const comp = maioresCompromissos(conta.dadosOrg);

  const saldoFinal = conta.saldoFin ?? (conta.saldoIni != null ? conta.saldoIni + conta.totais.ent - conta.totais.sai : null);
  const topTotal = comp.top.reduce((s, r) => s + r.total, 0);
  const topPct = pctDe(topTotal, comp.totalGeral);
  const maiorNeg = distNeg.ranking.find((r) => r.chave !== 'Sem classificação') ?? distNeg.ranking[0] ?? null;
  const maiorNegPct = maiorNeg ? pctDe(maiorNeg.total, distNeg.totalGeral) : 0;

  /* ───────── PÁGINA 1 — Capa + Resumo Executivo ───────── */
  let y = addHeader(doc, {
    titulo: 'Análise Financeira Executiva',
    subtitulo: clienteNome,
    infoLinha: `Conta: ${conta.nome}   ·   Período: ${periodoLabel}`,
    logoData,
  });
  y = addTituloSecao(doc, 'Resumo Executivo', y);
  y = addCardsKPI(doc, [
    { label: 'Saldo inicial', valor: fm(conta.saldoIni) },
    { label: 'Entradas', valor: formatMoeda(conta.totais.ent) },
    { label: 'Saídas', valor: formatMoeda(conta.totais.sai) },
    { label: 'Saldo final', valor: fm(saldoFinal) },
    { label: 'Menor saldo', valor: menor ? formatMoeda(menor.saldo) : '—' },
  ], y, { colunas: 3 });

  const resumoBullets: string[] = [];
  resumoBullets.push(`Saldo inicial ${fm(conta.saldoIni)} e saldo final ${fm(saldoFinal)}.`);
  if (menor) resumoBullets.push(`Menor saldo do período: ${formatMoeda(menor.saldo)}${menor.dia !== 'Início' ? ` (dia ${menor.dia})` : ''}.`);
  resumoBullets.push(`Top 10 compromissos: ${topPct}% das saídas (${formatMoeda(comp.totalGeral)} no total).`);
  y = caixaBullets(doc, 'Resumo do período', resumoBullets.slice(0, 3), y + 2);

  /* ───────── PÁGINA 2 — Evolução do Caixa ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Evolução do Caixa', 14);
  if (serie.length >= 2) {
    desenharMiniLinhaSaldo(doc, serie, { x: MARGEM, y: y + 2, w: INNER, h: 62 }, fmtCompacto);
    y += 68;
    y = addCardsKPI(doc, [
      { label: 'Saldo inicial', valor: fm(conta.saldoIni) },
      { label: 'Menor saldo', valor: menor ? formatMoeda(menor.saldo) : '—' },
      { label: 'Saldo final', valor: finalP ? formatMoeda(finalP.saldo) : '—' },
    ], y, { colunas: 3 });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text('Como o caixa se comportou ao longo do período.', MARGEM, y + 4);
    doc.setTextColor(0, 0, 0);
  } else {
    doc.setFontSize(10); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text('Saldo inicial não informado — evolução indisponível no período.', MARGEM, y + 6);
    doc.setTextColor(0, 0, 0);
  }

  /* ───────── PÁGINA 3 — Organização dos Pagamentos ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Organização dos Pagamentos', 14);
  const ordemEtapas: ('j1' | 'j2' | 'j3' | 'fora')[] = ['j1', 'j2', 'j3', 'fora'];
  desenharBarraProporcional(doc, ordemEtapas.map((k) => ({ valor: etapas[k].total, cor: COR_ETAPA[k] })), { x: MARGEM, y: y + 1, w: INNER, h: 6 });
  y += 11;
  y = addTabelaExecutiva(doc, {
    head: [['Etapa', 'Faixa', 'Saídas de caixa', '% das saídas', 'Nº pagamentos']],
    body: ordemEtapas.map((k) => [ETAPA_LABEL[k].nome, ETAPA_LABEL[k].faixa, formatMoeda(etapas[k].total), `${pctDe(etapas[k].total, totEtapas)}%`, String(etapas[k].count)]),
    startY: y,
    opts: {
      foot: [['Total', '', formatMoeda(totEtapas), '100%', String(ordemEtapas.reduce((s, k) => s + etapas[k].count, 0))]],
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    },
  });
  doc.setFontSize(9); doc.setTextColor(...PALETA.CINZA_TEXTO);
  doc.text('Concentração temporal dos pagamentos (janelas móveis de 4 dias).', MARGEM, y + 5);
  doc.setTextColor(0, 0, 0);

  /* ───────── PÁGINA 4 — Distribuição Econômica (Por Negócio) ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Distribuição Econômica — Por Negócio', 14);
  desenharBarraProporcional(doc, distNeg.ranking.map((r) => ({ valor: r.total, cor: corNegocio(r.chave) })), { x: MARGEM, y: y + 1, w: INNER, h: 6 });
  y += 11;
  y = addTabelaExecutiva(doc, {
    head: [['Categoria', 'Valor', '% das saídas', 'Nº lançamentos']],
    body: distNeg.ranking.map((r) => [r.chave, formatMoeda(r.total), `${pctDe(r.total, distNeg.totalGeral)}%`, String(r.count)]),
    startY: y,
    opts: {
      foot: [['Total', formatMoeda(distNeg.totalGeral), '100%', String(distNeg.ranking.reduce((s, r) => s + r.count, 0))]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    },
  });
  // Complemento: Por natureza (macro) — só as principais linhas, sem prejudicar leitura.
  const distMacro = distribuicaoEconomica(conta.dadosOrg, 'macro');
  if (distMacro.ranking.length > 0) {
    y = addTabelaExecutiva(doc, {
      head: [['Por natureza (complemento)', 'Valor', '%']],
      body: distMacro.ranking.slice(0, 6).map((r) => [r.chave, formatMoeda(r.total), `${pctDe(r.total, distMacro.totalGeral)}%`]),
      startY: y + 4,
      opts: { headFill: PALETA.AZUL_VARIANTE, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } },
    });
  }

  /* ───────── PÁGINA 5 — Principais Custos e Compromissos ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Principais Custos e Compromissos', 14);
  desenharBarraProporcional(doc, comp.linhas.map((r, i) => ({ valor: r.total, cor: r.ehDemais ? CINZA : PALETA_COMP[i % PALETA_COMP.length] })), { x: MARGEM, y: y + 1, w: INNER, h: 6 });
  y += 11;
  y = addTabelaExecutiva(doc, {
    head: [['#', 'Compromisso', 'Valor', '% das saídas', 'Nº pag.']],
    body: comp.linhas.map((r, i) => [r.ehDemais ? '—' : String(i + 1), r.chave, formatMoeda(r.total), `${pctDe(r.total, comp.totalGeral)}%`, String(r.count)]),
    startY: y,
    opts: {
      foot: [['', 'Total', formatMoeda(comp.totalGeral), '100%', String(comp.linhas.reduce((s, r) => s + r.count, 0))]],
      columnStyles: { 0: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    },
  });
  doc.setFontSize(9); doc.setTextColor(...PALETA.CINZA_TEXTO);
  doc.text(`Top 10 compromissos representam ${topPct}% das saídas.`, MARGEM, y + 5);
  doc.setTextColor(0, 0, 0);

  /* ───────── PÁGINA 6 — Resumo Executivo (fatos objetivos) ───────── */
  doc.addPage();
  y = addTituloSecao(doc, 'Resumo Executivo', 14);
  const fatos: string[] = [];
  fatos.push(`Entradas ${formatMoeda(conta.totais.ent)}  ·  Saídas ${formatMoeda(conta.totais.sai)}.`);
  fatos.push(`Saldo inicial ${fm(conta.saldoIni)}  ·  Saldo final ${fm(saldoFinal)}.`);
  if (menor) fatos.push(`Menor saldo do período: ${formatMoeda(menor.saldo)}${menor.dia !== 'Início' ? ` (dia ${menor.dia})` : ''}.`);
  if (topPct >= 70) fatos.push(`Concentração: Top 10 compromissos = ${topPct}% das saídas.`);
  else fatos.push(`Distribuição: Top 10 = ${topPct}% das saídas; demais = ${100 - topPct}%.`);
  if (maiorNeg && maiorNegPct > 40) fatos.push(`${maiorNeg.chave} concentra ${maiorNegPct}% das saídas.`);
  y = caixaBullets(doc, 'Fatos do período', fatos, y + 2);

  addFooterComPaginacao(doc);
  doc.save(`analise_financeira_executiva_${slug(clienteNome)}_${slug(periodoLabel)}.pdf`);
}
