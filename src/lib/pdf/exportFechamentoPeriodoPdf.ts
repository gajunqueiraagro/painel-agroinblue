/**
 * exportFechamentoPeriodoPdf.ts — Gerador do PDF do Fechamento do Período.
 *
 * Consome o chassi reutilizável (pdfChassi.ts, PR-PDF-1). Só APRESENTAÇÃO:
 * recebe os KPIs já formatados e zero recálculo. Coexiste com o window.print
 * (PR-Print) — é um caminho de export programático independente.
 */

import {
  criarDocRetratoA4,
  carregarLogoBase64,
  addHeader,
  addTituloSecao,
  addCardsKPI,
  addFooterComPaginacao,
} from '@/lib/pdf/pdfChassi';

export interface FechamentoPeriodoPdfInput {
  clienteNome: string;
  fazendaNome: string;       // "Global" quando isGlobal
  periodoLabel: string;      // ex.: "2026"
  cenarioLabel: string;      // ex.: "Global • Realizado"
  kpis: { label: string; valor: string }[];
}

export async function exportFechamentoPeriodoPdf(input: FechamentoPeriodoPdfInput): Promise<void> {
  const doc = criarDocRetratoA4();
  const logoData = await carregarLogoBase64();

  let y = addHeader(doc, {
    titulo: `Fechamento do Período — ${input.periodoLabel}`,
    subtitulo: input.cenarioLabel,
    infoLinha: input.fazendaNome ? `${input.clienteNome} · ${input.fazendaNome}` : input.clienteNome,
    logoData,
  });

  y = addTituloSecao(doc, 'FLUXO DE CAIXA — RESUMO', y);
  y = addCardsKPI(doc, input.kpis, y);

  addFooterComPaginacao(doc);
  doc.save(`Fechamento_${input.clienteNome}_${input.periodoLabel}.pdf`.replace(/\s+/g, '_'));
}
