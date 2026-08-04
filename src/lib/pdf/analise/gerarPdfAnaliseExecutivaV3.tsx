/**
 * gerarPdfAnaliseExecutivaV3 — entry do PDF Executivo (react-pdf). PR-FIN-V2-PDF-EXECUTIVO-03.
 *
 * Deriva os dados de apresentação a partir dos helpers (fonte única analiseAgregacoes) e monta
 * o <Document>. Motor react-pdf carregado por import() dinâmico (bundle leve). FASE 1 = Página 1.
 */
import { serieEvolucaoRP, etapasPagamento, etapaDoDia, type EtapaId } from '@/lib/analise/analiseAgregacoes';
import { carregarLogoBase64 } from '@/lib/pdf/pdfChassi';
import { formatMoeda } from '@/lib/calculos/formatters';
import { COR } from '@/lib/pdf/analise/estilos';
import type { DiaCalendario, CardEtapa } from '@/lib/pdf/analise/PdfOrganizacaoPagamentos';

interface ItemOrg { mov: number; tipo: string; data: string; }
const fmtCompacto = (v: number): string => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : formatMoeda(v));
const fm = (v: number | null): string => (v == null ? '—' : formatMoeda(v));
const claro = (hex: string, a: number): string => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * a + 255 * (1 - a)).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
};
const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'pdf';

const COR_ETAPA: Record<EtapaId, string> = { j1: '#3b82f6', j2: '#22784a', j3: '#d77706' };
const ETAPA_LABEL: Record<string, { nome: string; faixa: string }> = {
  j1: { nome: '1ª etapa', faixa: '03–06' }, j2: { nome: '2ª etapa', faixa: '08–11' }, j3: { nome: '3ª etapa', faixa: '20–23' }, fora: { nome: 'Demais', faixa: '—' },
};

export async function gerarPdfAnaliseExecutivaV3(params: {
  clienteNome: string;
  fazenda?: string;
  contaNome: string;
  periodoLabel: string;
  ano: number;
  mes: number;
  saldoIni: number | null;
  saldoFin: number | null;
  totais: { ent: number; sai: number };
  serieLinhas: { data: string; mov: number; realizado: boolean }[];
  dadosOrg: ItemOrg[];
}): Promise<void> {
  // ── Derivações via fonte única ──
  const { pontos: serie, corteIdx, temProjetado } = serieEvolucaoRP(params.serieLinhas, params.saldoIni, params.ano, params.mes);
  const menor = serie.length ? serie.reduce((m, p) => (p.saldo < m.saldo ? p : m), serie[0]) : null;
  const { buckets: etapas, totalGeral: totEtapas } = etapasPagamento(params.dadosOrg);
  const saldoFinal = params.saldoFin ?? (params.saldoIni != null ? params.saldoIni + params.totais.ent - params.totais.sai : null);

  const kpis = [
    { label: 'Saldo inicial', valor: fm(params.saldoIni) },
    { label: 'Entradas', valor: formatMoeda(params.totais.ent) },
    { label: 'Saídas', valor: formatMoeda(params.totais.sai) },
    { label: 'Saldo final', valor: fm(saldoFinal) },
    { label: 'Menor saldo', valor: menor ? formatMoeda(menor.saldo) : '—' },
  ];

  const diasNoMes = new Date(params.ano, params.mes, 0).getDate();
  const calendario: DiaCalendario[] = Array.from({ length: diasNoMes }, (_, i) => i + 1).map((d) => {
    const et = etapaDoDia(d);
    const cor = et ? COR_ETAPA[et] : COR.cinzaMedio;
    return { dia: d, cor, claro: claro(cor, 0.18) };
  });
  const ordem: ('j1' | 'j2' | 'j3' | 'fora')[] = ['j1', 'j2', 'j3', 'fora'];
  const cards: CardEtapa[] = ordem.map((k) => ({
    nome: ETAPA_LABEL[k].nome, faixa: ETAPA_LABEL[k].faixa,
    pct: totEtapas > 0 ? Math.round((etapas[k].total / totEtapas) * 100) : 0,
    valor: formatMoeda(etapas[k].total), count: etapas[k].count,
    cor: k === 'fora' ? COR.cinzaMedio : COR_ETAPA[k],
  }));

  const notaProjetado = temProjetado && serie.length
    ? `Saldo atual realizado: ${fm(serie[Math.max(0, Math.min(corteIdx, serie.length - 1))].saldo)}   ·   Saldo final projetado: ${fm(serie[serie.length - 1].saldo)}   ·   Menor saldo projetado: ${fm(menor ? menor.saldo : null)}`
    : undefined;

  let logoData: string | undefined;
  try { logoData = await carregarLogoBase64(); } catch { logoData = undefined; }

  // Motor react-pdf sob demanda.
  const [{ pdf }, { DocumentoAnaliseExecutiva }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/lib/pdf/analise/DocumentoAnaliseExecutiva'),
  ]);
  const blob = await pdf(
    DocumentoAnaliseExecutiva({
      clienteNome: params.clienteNome, fazenda: params.fazenda, contaNome: params.contaNome, periodoLabel: params.periodoLabel, logoData,
      kpis, serie, fmt: fmtCompacto, calendario, cards, notaProjetado,
    }),
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `analise_financeira_executiva_${slug(params.clienteNome)}_${slug(params.periodoLabel)}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
