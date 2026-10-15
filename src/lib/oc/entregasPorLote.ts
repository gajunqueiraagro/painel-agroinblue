import { formatNum } from '@/lib/calculos/formatters';
import type { LoteRecebimento, MovimentacaoOC } from '@/hooks/useOperacaoRecebimento';
import type { LadoContaCorrente } from '@/lib/oc/contaCorrente';

/* OC-VENDA-ENTREGAS-01a — a aba Entrega da venda, uma linha por SAIDA de cada lote (mock
   docs/mocks/oc_venda_entregas_mock_v2.html). Regras puras, sem estado, para a tabela e para o teste.

   ⚠ A DATA DO LOTE E' A DATA DA SAIDA DELE (D3). O lote nao tem coluna de data: a linha mostra a data do
     lancamento zootecnico — adotado ou registrado — e o lote sem saida mostra "—".
   ⚠ O VALOR DA ENTREGA E' O DO LANCAMENTO, nunca o do lote (D4d): a saida adotada guarda o valor com
     que nasceu, e a diferenca para o lote fica visivel. Quem a explica e' o 01c. */

/* OC-ENTREGA-COMPACTA-01 (Gabriel, 15/10/2026) — A TABELA UNICA DA ABA ENTREGA/RECEBIMENTO, nos tres tipos e nos dois estados.
   Este arquivo e' o DONO dos numeros: as linhas, o total e a faixa do topo saem daqui; a tela so' desenha (nenhum `reduce` la').
   ⚠ NEG. CAB E NEG. KG SO' NA PRIMEIRA LINHA DO LOTE (nas outras ficam vazios: somar duas vezes o negociado seria mentir).
   ⚠ DIF. = entregue do lote − negociado (os dois da VIEW), so' na ULTIMA linha de saida do lote.
   ⚠ KG MEDIO PONDERADO PELAS CABECAS (Σ cab × kg / Σ cab, so' das saidas com peso), nunca media simples das linhas. */

export type SituacaoDaLinha = 'feita' | 'parcial' | 'falta';

export type LinhaEntrega =
  | { tipo: 'saida'; lote: LoteRecebimento; mov: MovimentacaoOC; primeiraDoLote: boolean; ultimaSaidaDoLote: boolean;
      negCab: number | null; negKg: number | null; dif: number | null; situacao: SituacaoDaLinha }
  | { tipo: 'pendente'; lote: LoteRecebimento; falta: number | null; primeiraDoLote: boolean;
      negCab: number | null; negKg: number | null; situacao: 'falta' };

/** Uma linha por saida ATIVA, em ordem de data; e uma linha "pendente" quando o lote ainda tem saldo
    (ou quando o negociado e' desconhecido e nada saiu). Estornada nao aparece: morreu no zootecnico. */
export function linhasDaEntrega(lotes: LoteRecebimento[], movs: MovimentacaoOC[]): LinhaEntrega[] {
  const linhas: LinhaEntrega[] = [];
  for (const lote of [...lotes].sort((a, b) => a.ordem - b.ordem)) {
    const doLote = movs
      .filter(m => m.loteId === lote.loteId && !m.cancelado)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    const falta = lote.qtdNegociada != null ? lote.qtdNegociada - lote.qtdRecebida : null;
    const completo = lote.estado === 'completo' || lote.estado === 'excedente' || (falta != null && falta <= 0);
    const neg = (primeira: boolean) => ({ negCab: primeira ? lote.qtdNegociada : null, negKg: primeira ? lote.pesoMedioNegociadoKg : null });
    doLote.forEach((mov, i) => {
      const ultima = i === doLote.length - 1;
      linhas.push({ tipo: 'saida', lote, mov, primeiraDoLote: i === 0, ultimaSaidaDoLote: ultima, ...neg(i === 0),
        dif: ultima && lote.qtdNegociada != null ? lote.qtdRecebida - lote.qtdNegociada : null,
        situacao: completo ? 'feita' : 'parcial' });
    });
    if ((falta != null && falta > 0) || (falta == null && doLote.length === 0)) {
      linhas.push({ tipo: 'pendente', lote, falta, primeiraDoLote: doLote.length === 0, ...neg(doLote.length === 0), situacao: 'falta' });
    }
  }
  return linhas;
}

export interface TotaisDaEntrega {
  /** Faixa do topo. */
  entregue: number; negociado: number; saldo: number; kgMedio: number | null; ultimaData: string | null;
  /** Linha de Total. */
  cab: number; dif: number; valor: number | null;
  semLote: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** O total da tabela e a faixa do topo — a mesma conta para os dois (a tela nao soma). */
export function totaisDaEntrega(lotes: LoteRecebimento[], movs: MovimentacaoOC[]): TotaisDaEntrega {
  const vivas = movs.filter(m => !m.cancelado && lotes.some(l => l.loteId === m.loteId));
  let entregue = 0; let negociado = 0; let saldo = 0;
  for (const l of lotes) {
    entregue += l.qtdRecebida;
    negociado += l.qtdNegociada ?? 0;
    if (l.qtdNegociada != null) saldo += Math.max(0, l.qtdNegociada - l.qtdRecebida);
  }
  let cab = 0; let cabComPeso = 0; let kgTotal = 0; let valorCent = 0; let temValor = false; let ultimaData: string | null = null;
  for (const m of vivas) {
    cab += m.quantidade;
    if (m.pesoMedio != null) { cabComPeso += m.quantidade; kgTotal += m.quantidade * m.pesoMedio; }
    if (m.valorTotal != null) { valorCent += Math.round(m.valorTotal * 100); temValor = true; }
    if (m.data && (!ultimaData || m.data > ultimaData)) ultimaData = m.data;
  }
  return {
    entregue, negociado, saldo, kgMedio: cabComPeso > 0 ? r2(kgTotal / cabComPeso) : null, ultimaData,
    cab, dif: entregue - negociado, valor: temValor ? valorCent / 100 : null, semLote: lotes.length === 0,
  };
}

/* ── O VOCABULARIO, UM SO' (OC-ENTREGA-COMPACTA-01) ────────────────────────────────────────────────────────────────
   Venda e abate: o gado SAI (Entrega · Saida · Entregue · entregar · Enviar). Compra: ENTRA (Recebimento · Entrada ·
   Recebido · receber · Receber). Era o `TEXTOS` da tabela da venda mais o `rotulos` que cada shell passava: virou um so'.
   ⚠ Os motivos padrao vao gravados no banco e dizem o NOME DA ABA ("pela aba Entrega" / "pela aba Recebimento"). */
export interface VocabularioEntrega {
  Aba: string; mov: string; movs: string; Mov: string; Feito: string; feito: string; fazer: string; Verbo: string; verbo: string;
  /** "a entrega" / "o recebimento"; "entregue" / "recebida" (a quantidade); "física" / "físico". */
  artigoAba: string; quantidadeFeita: string; fisico: string;
  /** "Entrega aberta" / "Recebimento aberto". */
  abertaTexto: string; encerradaTexto: string;
  contraparte: (nome: string) => string;
  motivoEncerrarPadrao: string; motivoEstornoPadrao: string;
}
const SAI = { Aba: 'Entrega', mov: 'saída', movs: 'saídas', Mov: 'Saída', Feito: 'Entregue', feito: 'entregue', fazer: 'entregar',
  Verbo: 'Enviar', verbo: 'enviar', artigoAba: 'a entrega', quantidadeFeita: 'entregue', fisico: 'física', abertaTexto: 'Entrega aberta', encerradaTexto: 'Entrega encerrada',
  motivoEncerrarPadrao: 'encerramento pela aba Entrega', motivoEstornoPadrao: 'estorno pela aba Entrega' };
export const VOCABULARIO_ENTREGA: Record<LadoContaCorrente, VocabularioEntrega> = {
  venda: { ...SAI, contraparte: nome => ` para ${nome} ou sem comprador gravado` },
  abate: { ...SAI, contraparte: nome => ` para ${nome} ou sem frigorífico gravado` },
  compra: { Aba: 'Recebimento', mov: 'entrada', movs: 'entradas', Mov: 'Entrada', Feito: 'Recebido', feito: 'recebido', fazer: 'receber',
    Verbo: 'Receber', verbo: 'receber', artigoAba: 'o recebimento', quantidadeFeita: 'recebida', fisico: 'físico', abertaTexto: 'Recebimento aberto', encerradaTexto: 'Recebimento encerrado',
    contraparte: nome => ` de ${nome} ou sem fornecedor gravado`,
    motivoEncerrarPadrao: 'encerramento pela aba Recebimento', motivoEstornoPadrao: 'estorno pela aba Recebimento' },
};

/** O rotulo da Situacao na lingua do lado. */
export const rotuloDaSituacao = (s: SituacaoDaLinha, v: VocabularioEntrega) =>
  (s === 'feita' ? v.feito : s === 'parcial' ? 'parcial' : `a ${v.fazer}`);

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
