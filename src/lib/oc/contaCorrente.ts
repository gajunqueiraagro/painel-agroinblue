/**
 * CONTA CORRENTE DA VENDA — OC-VENDA-ENTREGAS-01b (ADR-2026-21).
 *
 * A entrega e' a receita (competencia = data da saida, sem caixa); o recebimento e' o caixa (adiantamento de cliente,
 * fora do DRE). O saldo do comprador e' CALCULADO — `oc_conta_corrente` o devolve linha a linha e no fim —, nunca
 * gravado. Aqui mora so' a leitura desse envelope: nenhuma soma de regra. A tela nao recalcula o saldo; separa o sinal
 * nas duas colunas ("Ele deve" / "Adiantado por ele") e diz o status que o dado tem.
 */

export type TipoLinhaContaCorrente = 'entrega' | 'recebimento';
/** D6: sem conta bancaria nunca aparece como conciliado. */
export type StatusLinhaContaCorrente = 'sem_caixa' | 'sem_conta_bancaria' | 'conciliado' | 'programado' | 'realizado';
export type SituacaoContaCorrente = 'ele_deve' | 'nos_devemos' | 'quitado';

export interface LinhaContaCorrente {
  tipo: TipoLinhaContaCorrente;
  data: string;
  lancamentoId: string;
  loteOrdem: number | null;
  categoria: string | null;
  cab: number | null;
  descricao: string | null;
  conta: string | null;
  valor: number;
  status: StatusLinhaContaCorrente;
  /** Programado nao entra no saldo (ainda nao e' dinheiro). */
  noSaldo: boolean;
  /** Saldo acumulado do comprador depois desta linha: positivo = ele deve; negativo = adiantou. */
  saldo: number;
}

export interface ContaCorrente {
  modelo: 'titulo' | 'conta_corrente';
  versao: number;
  valorAcordado: number | null;
  entregue: number;
  cabEntregue: number;
  recebido: number;
  programado: number;
  saldo: number;
  situacao: SituacaoContaCorrente;
  aEntregar: number;
  recebimentosSemContaBancaria: number;
  saidasSemEntrega: number;
  linhas: LinhaContaCorrente[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOuNulo = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function statusDe(v: unknown): StatusLinhaContaCorrente {
  return v === 'sem_caixa' || v === 'sem_conta_bancaria' || v === 'conciliado' || v === 'programado' ? v : 'realizado';
}
function situacaoDe(v: unknown): SituacaoContaCorrente {
  return v === 'ele_deve' || v === 'nos_devemos' ? v : 'quitado';
}

/** Le o jsonb de `oc_conta_corrente`. Campo fora do contrato cai no neutro, nunca inventa numero. */
export function lerContaCorrente(raw: unknown): ContaCorrente | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const linhas = Array.isArray(r.linhas) ? r.linhas : [];
  return {
    modelo: r.modelo === 'conta_corrente' ? 'conta_corrente' : 'titulo',
    versao: num(r.versao),
    valorAcordado: numOuNulo(r.valor_acordado),
    entregue: num(r.entregue),
    cabEntregue: num(r.cab_entregue),
    recebido: num(r.recebido),
    programado: num(r.programado),
    saldo: num(r.saldo),
    situacao: situacaoDe(r.situacao),
    aEntregar: num(r.a_entregar),
    recebimentosSemContaBancaria: num(r.recebimentos_sem_conta_bancaria),
    saidasSemEntrega: num(r.saidas_sem_entrega),
    linhas: linhas.map((x) => {
      const l = (x ?? {}) as Record<string, unknown>;
      return {
        tipo: l.tipo === 'entrega' ? 'entrega' : 'recebimento',
        data: String(l.data ?? ''),
        lancamentoId: String(l.lancamento_id ?? ''),
        loteOrdem: numOuNulo(l.lote_ordem),
        categoria: texto(l.categoria),
        cab: numOuNulo(l.cab),
        descricao: texto(l.descricao),
        conta: texto(l.conta),
        valor: num(l.valor),
        status: statusDe(l.status),
        noSaldo: l.no_saldo !== false,
        saldo: num(l.saldo),
      };
    }),
  };
}

/**
 * O saldo do comprador em DUAS colunas, uma so' preenchida: positivo e' o que ele deve (o gado saiu antes do dinheiro);
 * negativo e' o que ele adiantou (o dinheiro veio antes do gado). Zero nas duas e' "quitado", e aparece como 0,00 na de
 * "Ele deve" — zero e' valor, nao ausencia.
 */
export function colunasDoSaldo(saldo: number): { eleDeve: number | null; adiantado: number | null } {
  const centavos = Math.round(saldo * 100);
  if (centavos < 0) return { eleDeve: null, adiantado: -centavos / 100 };
  return { eleDeve: centavos / 100, adiantado: null };
}

/** Os quatro cartoes do topo. "Ele deve" e "Adiantado por ele" sao o mesmo saldo lido pelos dois lados. */
export function cartoesDaContaCorrente(cc: ContaCorrente): { entregue: number; recebido: number; eleDeve: number; adiantado: number } {
  const c = colunasDoSaldo(cc.saldo);
  return { entregue: cc.entregue, recebido: cc.recebido, eleDeve: c.eleDeve ?? 0, adiantado: c.adiantado ?? 0 };
}

/**
 * "Saldo final a explicar" so' existe com as entregas CONCLUIDAS (nada mais a entregar) e saldo diferente de zero. Antes
 * disso o saldo e' so' o andamento do contrato. A OC fecha mesmo sem explicar (a explicacao e' o 01c).
 */
export function saldoFinalAExplicar(cc: ContaCorrente): { frase: string; valor: number } | null {
  if (cc.linhas.every((l) => l.tipo !== 'entrega')) return null;
  if (Math.round(cc.aEntregar * 100) > 0) return null;
  const centavos = Math.round(cc.saldo * 100);
  if (centavos === 0) return null;
  return centavos > 0
    ? { frase: 'Entregas concluídas e o comprador pagou menos que o entregue · a OC fecha mesmo assim', valor: -centavos / 100 }
    : { frase: 'Entregas concluídas e o comprador pagou mais que o entregue · a OC fecha mesmo assim', valor: -centavos / 100 };
}

export const ROTULO_STATUS: Record<StatusLinhaContaCorrente, string> = {
  sem_caixa: 'sem caixa',
  sem_conta_bancaria: 'sem conta bancária',
  conciliado: 'conciliado',
  programado: 'programado',
  realizado: 'realizado',
};

/** "Recebimento 2 de 4" — a posicao do recebimento entre os da OC, na ordem da conta corrente. */
export function rotuloRecebimento(linhas: readonly LinhaContaCorrente[], lancamentoId: string): string {
  const recs = linhas.filter((l) => l.tipo === 'recebimento');
  const i = recs.findIndex((l) => l.lancamentoId === lancamentoId);
  return i < 0 ? 'Recebimento' : `Recebimento ${i + 1} de ${recs.length}`;
}
