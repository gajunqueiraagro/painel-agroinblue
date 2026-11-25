/**
 * NOTA-ENTREGA-FUTURA-01 (3) — mock aprovado pelo Gabriel 25/11 07:24 (`ui-validar/nota-outra-nf-ref/mock-aprovado.html`): o lançamento
 * achado só pelo fornecedor e valor que JÁ TEM OUTRA NF (o caso Sementes Pastoforma: o faturamento NF 30.150 entrando; o lançamento de
 * R$ 18.800 com a NF 30.436, que é a remessa da mesma compra). A etapa 1 mostra esse achado em SEÇÃO PRÓPRIA, com a explicação e duas
 * saídas: trocar para a NF nova (a outra fica anexada) ou criar um lançamento novo. Nunca na mesma linha da nota que entra. PURO.
 */
import type { LancamentoJaLancado, NotaJaLancada } from './jaLancada';

/** o que ancora o achado NESTA nota (número, chave, documento, fração, soma, a parcela aberta, a escolha à mão): com qualquer um, não é "outra nota" */
const ANCORAS: ReadonlySet<string> = new Set(['numero', 'chave', 'documento', 'fracao', 'soma', 'lancamento', 'escolhido']);
const soNumero = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '').replace(/^0+/, '');

export interface AchadoComOutraNota {
  /** os lançamentos achados (todos com outra NF) */
  lancamentos: LancamentoJaLancado[];
  /** os números das outras NF, sem zeros à esquerda, na ordem dos lançamentos, sem repetir */
  outras: string[];
}

/** Todos os achados vivos são do mesmo fornecedor e valor COM OUTRA NF (e nenhum tem esta nota): o caso da seção própria. Senão, `null`. */
export function achadoComOutraNota(ja: Pick<NotaJaLancada, 'alvos'> | null, numeroDaNota: string | null | undefined): AchadoComOutraNota | null {
  const daNota = soNumero(numeroDaNota);
  if (!ja || !daNota || ja.alvos.length === 0) return null;
  const todosComOutra = ja.alvos.every((l) => !l.cancelado && !l.temEstaNota && !l.por.some((p) => ANCORAS.has(p))
    && soNumero(l.numeroDocumento) !== '' && soNumero(l.numeroDocumento) !== daNota);
  if (!todosComOutra) return null;
  return { lancamentos: [...ja.alvos], outras: [...new Set(ja.alvos.map((l) => soNumero(l.numeroDocumento)))] };
}

/** o número para a tela: "30436" → "30.436" */
export const nfFalada = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
