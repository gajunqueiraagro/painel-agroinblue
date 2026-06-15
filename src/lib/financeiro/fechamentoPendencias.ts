/**
 * Detector read-time de pendências do fechamento — A1: saldo + duplicados.
 * Puro, sem I/O. Eixo conciliação/saldo. NÃO toca classificação.
 * OFX órfão / apontamento órfão ficam para o A2 (exigem extrato/vínculos).
 */
export type Origem = string | null;

export interface LancMin {
  id: string;
  valor: number;
  sinal: number;
  tipo_operacao: string | null;
  data_pagamento: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
  origem_lancamento: Origem;
}

const cents = (v: number) => Math.round(Math.abs(Number(v) || 0) * 100);
const ORIGENS_SECUNDARIAS = new Set(['mesa_excel', 'referencia_operacional', 'excel']);

/** Contribuição líquida assinada (igual a calcConciliacaoMensal: 1-→+, 2-→−, resto pelo sinal). */
function contribAssinada(l: LancMin): number {
  const v = Math.abs(Number(l.valor) || 0);
  const t = (l.tipo_operacao || '').trim();
  if (t.startsWith('1-')) return v;
  if (t.startsWith('2-')) return -v;
  return Number(l.sinal) >= 0 ? v : -v;
}

/**
 * Duplicata cross-origin: mesma movimentação (conta, data, |valor|, direção) com
 * ≥1 cópia origem='ofx' E ≥1 cópia de origem secundária (Mesa/Excel/Referência).
 * As secundárias são os fantasmas (o banco tem o movimento 1×).
 * Advisory — só sinaliza; não decide exclusão.
 */
export function detectarDuplicatasCrossOrigin(lancs: readonly LancMin[]) {
  const grupos = new Map<string, LancMin[]>();
  for (const l of lancs) {
    const contaId = l.conta_bancaria_id || l.conta_destino_id || '';
    const dir = contribAssinada(l) >= 0 ? '+' : '-';
    const k = `${contaId}|${l.data_pagamento || ''}|${cents(l.valor)}|${dir}`;
    const arr = grupos.get(k);
    if (arr) arr.push(l); else grupos.set(k, [l]);
  }
  const fantasmas: LancMin[] = [];
  for (const arr of grupos.values()) {
    if (arr.length < 2) continue;
    const temOfx = arr.some((l) => l.origem_lancamento === 'ofx');
    const secundarias = arr.filter((l) => ORIGENS_SECUNDARIAS.has(l.origem_lancamento || ''));
    if (temOfx && secundarias.length > 0) fantasmas.push(...secundarias);
  }
  const impacto = Math.round(fantasmas.reduce((s, l) => s + contribAssinada(l), 0) * 100) / 100;
  return { qtd: fantasmas.length, impacto, ids: fantasmas.map((l) => l.id) };
}

export interface ItemPendencia { tipo: string; label: string; qtd: number; impacto: number | null; }
export interface SituacaoFechamento {
  bloqueios: ItemPendencia[];
  avisos: ItemPendencia[];
  apto: boolean;
}

/** Verdict 2-tier — A1: só saldo + duplicados são bloqueios. Avisos vazio (A2 preenche). */
export function montarSituacaoFechamento(input: {
  diferencaSaldo: number;
  duplicatas: { qtd: number; impacto: number };
  tolSaldo?: number;
}): SituacaoFechamento {
  const tol = input.tolSaldo ?? 0.005;
  const bloqueios: ItemPendencia[] = [];
  if (Math.abs(input.diferencaSaldo) > tol)
    bloqueios.push({ tipo: 'saldo', label: 'Saldo não fecha', qtd: 1, impacto: input.diferencaSaldo });
  if (input.duplicatas.qtd > 0)
    bloqueios.push({ tipo: 'duplicado', label: 'Lançamentos duplicados', qtd: input.duplicatas.qtd, impacto: input.duplicatas.impacto });
  return { bloqueios, avisos: [], apto: bloqueios.length === 0 };
}
