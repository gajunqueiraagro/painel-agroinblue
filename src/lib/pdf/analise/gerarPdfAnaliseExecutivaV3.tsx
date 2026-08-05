/**
 * gerarPdfAnaliseExecutivaV3 — entry do PDF Executivo (react-pdf). PR-FIN-V2-PDF-EXECUTIVO-03.
 *
 * Deriva os dados de apresentação a partir dos helpers (fonte única analiseAgregacoes) e monta
 * o <Document>. Motor react-pdf carregado por import() dinâmico (bundle leve). FASE 1 = Página 1.
 */
import { toast } from 'sonner';
import { serieEvolucaoRP, etapasPagamento, etapaDoDia, distribuicaoEconomica, maioresCompromissos, creditosPorOrigem, type EtapaId } from '@/lib/analise/analiseAgregacoes';
import { carregarLogoBase64 } from '@/lib/pdf/pdfChassi';
import { formatMoeda } from '@/lib/calculos/formatters';
import { COR } from '@/lib/pdf/analise/estilos';
import type { DiaCalendario, CardEtapa } from '@/lib/pdf/analise/PdfOrganizacaoPagamentos';
import type { LinhaRanking } from '@/lib/pdf/analise/PdfBlocoDonut';

interface ItemOrg { mov: number; tipo: string; data: string; macro: string | null; escopo: string | null; centroPlano: string | null; }
const pct = (v: number, t: number): number => (t > 0 ? Math.round((v / t) * 100) : 0);
// Paletas (apresentação — espelham as telas).
const NAO_OPER = new Set(['Investimento na Fazenda', 'Investimento em Bovinos', 'Dividendos']);
const NEG_COR: Record<string, string> = { 'Pecuária': '#1e3a5f', 'Agricultura': '#2f6f4f', 'Administrativo': '#b7791f', 'Financeiro/Outros': '#7c3aad' };
const PALETA_COMP = ['#1e3a5f', '#2f6f4f', '#b7791f', '#7c3aad', '#0e7490', '#9d174d', '#3f6212', '#a16207', '#155e75', '#5b21b6'];
const corMacro = (c: string): string => (c.startsWith('Sem classificação') ? '#94a3b8' : NAO_OPER.has(c) ? '#d77706' : '#1e3a5f');
const corNegocio = (c: string): string => (c.startsWith('Sem classificação') ? '#94a3b8' : NEG_COR[c] ?? '#5b21b6');
const corCredito = (c: string): string => (c === 'Receitas Operacionais' ? '#22784a' : c === 'Rendimentos Financeiros' ? '#0d9488' : c === 'Transferências Recebidas' ? '#2563eb' : '#d77706');
const mapRanking = (rk: { chave: string; total: number }[], total: number, corDe: (c: string) => string): LinhaRanking[] =>
  rk.slice(0, 6).map((r) => ({ label: r.chave, valorFmt: formatMoeda(r.total), pct: pct(r.total, total), cor: corDe(r.chave) }));
const mapSegmentos = (rk: { chave: string; total: number }[], corDe: (c: string) => string) => rk.map((r) => ({ valor: r.total, cor: corDe(r.chave) }));
const fmtCompacto = (v: number): string => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : formatMoeda(v));
const fm = (v: number | null): string => (v == null ? '—' : formatMoeda(v));
const claro = (hex: string, a: number): string => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * a + 255 * (1 - a)).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
};
const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'pdf';
const diaBR = (iso: string): string => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

const assinado = (v: number): string => `${v >= 0 ? '+' : '-'}${formatMoeda(Math.abs(v))}`;
export interface TransfPdf { data: string; sentido: 'entrada' | 'saida'; descricao: string; contaOrigem: string; contaDestino: string; valor: number; status: string; }
export interface ExtratoPdf { data: string; produto: string | null; fornecedor: string; centro: string | null; valor: number; saldo: number | null; statusKey: string; statusLabel: string; doc: string; }

const COR_ETAPA: Record<EtapaId, string> = { j1: '#3b82f6', j2: '#22784a', j3: '#d77706' };
// Janelas de datas (não "etapas" — concentração de saídas por período do mês).
const ETAPA_LABEL: Record<string, { nome: string; faixa: string }> = {
  j1: { nome: 'Janela 1', faixa: '03–06' }, j2: { nome: 'Janela 2', faixa: '08–11' }, j3: { nome: 'Janela 3', faixa: '20–23' }, fora: { nome: 'Fora das janelas', faixa: 'Demais' },
};
// Cor de status (padrão do sistema): Realizado verde · Programado azul · Previsto laranja · Agendado roxo.
const COR_STATUS: Record<string, string> = { realizado: '#22784a', programado: '#2563eb', previsto: '#d77706', agendado: '#7c3aad' };
const corStatus = (s: string): string => COR_STATUS[s.toLowerCase()] ?? '#787878';

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
  transferencias: TransfPdf[];
  extrato: ExtratoPdf[];
}): Promise<void> {
  // ── Derivações via fonte única ──
  const { pontos: serie, corteIdx, temProjetado } = serieEvolucaoRP(params.serieLinhas, params.saldoIni, params.ano, params.mes);
  const menor = serie.length ? serie.reduce((m, p) => (p.saldo < m.saldo ? p : m), serie[0]) : null;
  const { buckets: etapas, totalGeral: totEtapas } = etapasPagamento(params.dadosOrg);
  const saldoFinal = params.saldoFin ?? (params.saldoIni != null ? params.saldoIni + params.totais.ent - params.totais.sai : null);

  // Página 2 (fonte única) — créditos + distribuição (macro/negócio) + compromissos.
  const creditos = creditosPorOrigem(params.dadosOrg);
  const distMacro = distribuicaoEconomica(params.dadosOrg, 'macro');
  const distNeg = distribuicaoEconomica(params.dadosOrg, 'negocio');
  const comp = maioresCompromissos(params.dadosOrg);
  const credito = { segmentos: mapSegmentos(creditos.ranking, corCredito), ranking: mapRanking(creditos.ranking, creditos.totalGeral, corCredito) };
  const natureza = { segmentos: mapSegmentos(distMacro.ranking, corMacro), ranking: mapRanking(distMacro.ranking, distMacro.totalGeral, corMacro) };
  const negocio = { segmentos: mapSegmentos(distNeg.ranking, corNegocio), ranking: mapRanking(distNeg.ranking, distNeg.totalGeral, corNegocio) };
  const compromissos = {
    linhas: comp.linhas.map((r, i) => ({ rank: String(i + 1), label: r.chave, valorFmt: formatMoeda(r.total), pct: pct(r.total, comp.totalGeral), count: r.count, cor: r.ehDemais ? '#94a3b8' : PALETA_COMP[i % PALETA_COMP.length], ehDemais: r.ehDemais })),
    totalFmt: formatMoeda(comp.totalGeral),
    totalCount: comp.linhas.reduce((s, r) => s + r.count, 0),
  };

  // Página 3 — Tesouraria (transferências prontas do payload; só formata p/ o componente).
  const mapTransf = (t: TransfPdf) => ({ data: diaBR(t.data), descricao: t.descricao || '—', contaOrigem: t.contaOrigem, contaDestino: t.contaDestino, valorFmt: formatMoeda(t.valor), status: t.status, statusCor: corStatus(t.status) });
  const rec = params.transferencias.filter((t) => t.sentido === 'entrada');
  const env = params.transferencias.filter((t) => t.sentido === 'saida');
  const tesouraria = {
    recebidas: rec.map(mapTransf), enviadas: env.map(mapTransf),
    totalRecFmt: formatMoeda(rec.reduce((s, t) => s + t.valor, 0)),
    totalEnvFmt: formatMoeda(env.reduce((s, t) => s + t.valor, 0)),
  };

  // Página 4+ — Extrato (linhas prontas do payload; resumo + contadores + formatação/flags).
  const ext = params.extrato;
  const resultado = params.totais.ent - params.totais.sai;
  const cont = (k: string) => String(ext.filter((r) => r.statusKey === k).length);
  const extrato = {
    resumo: [
      { label: 'Entradas', valor: formatMoeda(params.totais.ent), cor: '#22784a' },
      { label: 'Saídas', valor: formatMoeda(params.totais.sai), cor: '#b91c1c' },
      { label: 'Resultado do período', valor: assinado(resultado), cor: resultado >= 0 ? '#22784a' : '#b91c1c' },
      { label: 'Lançamentos', valor: String(ext.length) },
    ],
    contadores: [
      { label: 'Realizado', valor: cont('realizado') },
      { label: 'Programado', valor: cont('programado') },
      { label: 'Previsto', valor: cont('previsto') },
      { label: 'Agendado', valor: cont('agendado') },
    ],
    linhas: ext.map((r, i) => ({
      data: diaBR(r.data), descricao: r.produto || '—', fornecedor: r.fornecedor || '—', centro: r.centro || '—',
      valorFmt: assinado(r.valor), valorPos: r.valor >= 0,
      saldoFmt: r.saldo == null ? '—' : formatMoeda(r.saldo), saldoNeg: r.saldo == null ? null : r.saldo < 0,
      status: r.statusLabel, statusCor: corStatus(r.statusKey), doc: r.doc || '',
      ehFechamento: i === ext.length - 1 || ext[i + 1].data !== r.data,
    })),
  };

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
  try {
    const [{ pdf }, { DocumentoAnaliseExecutiva }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/lib/pdf/analise/DocumentoAnaliseExecutiva'),
    ]);
    // Elemento React (padrão do react-pdf) — NÃO invocar como função.
    const blob = await pdf(
      <DocumentoAnaliseExecutiva
        clienteNome={params.clienteNome} fazenda={params.fazenda} contaNome={params.contaNome} periodoLabel={params.periodoLabel} logoData={logoData}
        kpis={kpis} serie={serie} fmt={fmtCompacto} calendario={calendario} cards={cards} notaProjetado={notaProjetado}
        credito={credito} natureza={natureza} negocio={negocio} compromissos={compromissos} tesouraria={tesouraria} extrato={extrato}
      />,
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `analise_financeira_executiva_${slug(params.clienteNome)}_${slug(params.periodoLabel)}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    console.error('[PDF Executivo] falha ao gerar:', e);
    toast.error('Falha ao gerar PDF');
  }
}
