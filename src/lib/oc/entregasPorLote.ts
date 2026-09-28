import { formatNum } from '@/lib/calculos/formatters';
import type { LoteRecebimento, MovimentacaoOC } from '@/hooks/useOperacaoRecebimento';

/* OC-VENDA-ENTREGAS-01a — a aba Entrega da venda, uma linha por SAIDA de cada lote (mock
   docs/mocks/oc_venda_entregas_mock_v2.html). Regras puras, sem estado, para a tabela e para o teste.

   ⚠ A DATA DO LOTE E' A DATA DA SAIDA DELE (D3). O lote nao tem coluna de data: a linha mostra a data do
     lancamento zootecnico — adotado ou registrado — e o lote sem saida mostra "—".
   ⚠ O VALOR DA ENTREGA E' O DO LANCAMENTO, nunca o do lote (D4d): a saida adotada guarda o valor com
     que nasceu, e a diferenca para o lote fica visivel. Quem a explica e' o 01c. */

export type LinhaEntrega =
  | { tipo: 'saida'; lote: LoteRecebimento; mov: MovimentacaoOC; primeiraDoLote: boolean }
  | { tipo: 'pendente'; lote: LoteRecebimento; falta: number | null; primeiraDoLote: boolean };

/** Uma linha por saida ATIVA, em ordem de data; e uma linha "pendente" quando o lote ainda tem saldo
    (ou quando o negociado e' desconhecido e nada saiu). Estornada nao aparece: morreu no zootecnico. */
export function linhasDaEntrega(lotes: LoteRecebimento[], movs: MovimentacaoOC[]): LinhaEntrega[] {
  const linhas: LinhaEntrega[] = [];
  for (const lote of [...lotes].sort((a, b) => a.ordem - b.ordem)) {
    const doLote = movs
      .filter(m => m.loteId === lote.loteId && !m.cancelado)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    doLote.forEach((mov, i) => linhas.push({ tipo: 'saida', lote, mov, primeiraDoLote: i === 0 }));
    const falta = lote.qtdNegociada != null ? lote.qtdNegociada - lote.qtdRecebida : null;
    if ((falta != null && falta > 0) || (falta == null && doLote.length === 0)) {
      linhas.push({ tipo: 'pendente', lote, falta, primeiraDoLote: doLote.length === 0 });
    }
  }
  return linhas;
}

/** "12,80/kg", "R$ 1.500,00/cab" ou "R$ 20.000,00 no lote". Sem criterio ou sem valor, "—". */
export function precoDoContrato(lote: Pick<LoteRecebimento, 'criterioValor' | 'valorInformado'>): string {
  const v = lote.valorInformado;
  if (v == null || !Number.isFinite(v)) return '—';
  if (lote.criterioValor === 'kg') return `${formatNum(v, 2)}/kg`;
  if (lote.criterioValor === 'cabeca') return `R$ ${formatNum(v, 2)}/cab`;
  if (lote.criterioValor === 'total') return `R$ ${formatNum(v, 2)} no lote`;
  return '—';
}

/** Os lotes que o "Enviar todos" envia: os que ainda tem saldo, cada um com a data proposta. */
export function itensEnviarTodos(lotes: LoteRecebimento[], dataPadrao: string): { loteId: string; falta: number; data: string }[] {
  return [...lotes]
    .sort((a, b) => a.ordem - b.ordem)
    .filter(l => l.diferenca > 0)
    .map(l => ({ loteId: l.loteId, falta: l.diferenca, data: dataPadrao }));
}

/** Datas que faltam no "Enviar todos" — obrigatorio por linha (UX-OBRIGATORIOS-01). */
export function datasFaltando(itens: { loteId: string; data: string }[]): Set<string> {
  return new Set(itens.filter(i => !/^\d{4}-\d{2}-\d{2}$/.test(i.data)).map(i => i.loteId));
}
