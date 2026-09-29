/**
 * OC-VENDA-FINANCEIRO-COMPLETO-01a — AS DESPESAS DA OPERACAO na OC em conta corrente (venda e compra): frete, comissao, ICMS,
 * Fundersul, Iagro. Pagas a terceiros, fora do saldo (ADR-2026-21). Sao os compromissos de OBRIGACAO de sempre — esta lib so'
 * decide as linhas da tabela, o status de cada uma e os totais dos cards. Nada aqui grava.
 *
 * ⚠ UMA LINHA POR REGISTRO (A31): cada parcela viva e' uma linha (e' ela que tem titulo, banco e vencimento); o compromisso
 *   ainda sem programacao e' uma linha; e o SALDO ainda nao programado de um compromisso parcialmente programado tambem e' uma
 *   linha — sem ela o total da tabela nao bateria com o card "Despesas lancadas", que soma o valor dos compromissos.
 * ⚠ CONCILIADO SE LE' EM DOIS LUGARES. O briefing pedia `conciliado_em`, e ele esta' NULO em todos os ~70 mil lancamentos do
 *   proto (medido em 29/09/2026); a conciliacao de verdade mora em `conciliacao_bancaria_itens` com `desfeito_em` nulo — e' o
 *   que `oc_candidatas_vinculo` le'. Das 60 despesas de OC vivas, 30 estao conciliadas por ali e ZERO por `conciliado_em`. Ler
 *   so' a coluna mostraria "Realizado" em metade das conciliadas: dado conciliado aparentando ausencia. Quem monta o mapa dos
 *   titulos marca `conciliado` se QUALQUER um dos dois disser.
 */
import type { CompromissoResumo, ParcelaMaterializacao } from '@/hooks/useOcCompromissos';

export type StatusDespesa = 'previsto' | 'programado' | 'agendado' | 'realizado' | 'conciliado' | 'sem_titulo';

/** O titulo vivo de uma parcela, como a aba o le' (uma consulta por carga). */
export interface TituloDaDespesa {
  descricao: string | null;
  planoContaId: string | null;
  cancelado: boolean;
  favorecidoId: string | null;
  contaBancariaId: string | null;
  statusTransacao: string | null;
  dataPagamento: string | null;
  dataCompetencia: string | null;
  conciliado: boolean;
}

export interface LinhaDespesa {
  chave: string;
  tipo: 'parcela' | 'compromisso' | 'saldo';
  compromisso: CompromissoResumo;
  parcela: ParcelaMaterializacao | null;
  /** So' com titulo VIVO: e' o que "Abrir lançamento" abre. */
  tituloId: string | null;
  vencimento: string | null;
  /** So' quando o dinheiro saiu (realizado/conciliado); antes disso a data do titulo e' previsao, nao pagamento. */
  pagamento: string | null;
  descricao: string | null;
  favorecidoId: string | null;
  planoContaId: string | null;
  contaBancariaId: string | null;
  /** `null` = o titulo existe e ainda nao foi lido: a tela mostra "—", nunca um status inventado. */
  status: StatusDespesa | null;
  valor: number;
}

export const ROTULO_STATUS_DESPESA: Record<StatusDespesa, string> = {
  previsto: 'Previsto', programado: 'Programado', agendado: 'Agendado', realizado: 'Realizado', conciliado: 'Conciliado',
  sem_titulo: 'Sem título',
};

const TOL_CENTAVO = 0.005;
const parcelaComEfeito = (p: ParcelaMaterializacao) => p.status === 'materializada' || p.status === 'paga';

/**
 * O status da linha. Sem titulo = Previsto (a despesa existe na OC e ainda nao gerou lancamento). Com titulo, o do
 * lancamento — e Conciliado por cima de tudo.
 * ⚠ "Sem título" NAO E' UM DOS CINCO do mock, e existe de verdade: parcela materializada cujo titulo foi cancelado (medido na
 *   OC 69115ef9). Chamar de Previsto esconderia que ha' um estorno a fazer — o mesmo alerta de `statusFinanceiroParcela`.
 */
export function statusDaDespesa(parcela: ParcelaMaterializacao | null, titulo: TituloDaDespesa | null | undefined): StatusDespesa | null {
  if (!parcela) return 'previsto';
  if (!parcela.tituloId || !parcela.materializada) return parcelaComEfeito(parcela) ? 'sem_titulo' : 'previsto';
  /* ⚠ AUSENTE = AINDA NAO LIDO, NUNCA MORTO (fix1). Logo depois do Lancar, o titulo novo nao esta' no mapa da leitura anterior
     ate' a releitura voltar; tratar isso como cancelado piscava "Sem título" por ~1s (prova de tela da Vera). "Sem título" so'
     com o titulo LIDO e cancelado. */
  if (titulo === undefined || titulo === null) return null;
  if (titulo.cancelado) return 'sem_titulo';
  if (titulo.conciliado) return 'conciliado';
  switch (titulo.statusTransacao) {
    case 'realizado': return 'realizado';
    case 'agendado': return 'agendado';
    case 'programado': return 'programado';
    case 'previsto': return 'previsto';
    default: return null;
  }
}

/** As despesas vivas (natureza obrigacao, nao canceladas) — as mesmas que os dois cards somam. */
export const compromissosDeDespesa = (compromissos: readonly CompromissoResumo[]) =>
  compromissos.filter(c => c.natureza === 'obrigacao' && c.status !== 'cancelado');

/**
 * As linhas da tabela, em ordem de vencimento (sem vencimento vai para o fim; empate mantem a ordem do banco).
 * `titulos` = `null` enquanto a consulta nao voltou.
 */
export function linhasDeDespesa(
  compromissos: readonly CompromissoResumo[], parcelas: readonly ParcelaMaterializacao[],
  titulos: ReadonlyMap<string, TituloDaDespesa> | null,
): LinhaDespesa[] {
  const linhas: LinhaDespesa[] = [];
  for (const c of compromissosDeDespesa(compromissos)) {
    const vivas = parcelas.filter(p => p.compromissoId === c.compromissoId && p.status !== 'cancelada')
      .slice().sort((a, b) => a.sequencia - b.sequencia);
    for (const p of vivas) {
      const vivo = !!p.tituloId && p.materializada;
      const t = vivo && p.tituloId ? titulos?.get(p.tituloId) : null;
      const status = statusDaDespesa(p, t);
      const tituloVivo = t && !t.cancelado ? t : null;
      linhas.push({
        chave: `p:${p.parcelaId ?? `${c.compromissoId}:${p.sequencia}`}`, tipo: 'parcela', compromisso: c, parcela: p,
        tituloId: vivo ? p.tituloId : null,
        vencimento: p.vencimento,
        pagamento: status === 'realizado' || status === 'conciliado' ? (tituloVivo?.dataPagamento ?? null) : null,
        descricao: tituloVivo?.descricao ?? c.descricao,
        favorecidoId: tituloVivo?.favorecidoId ?? c.favorecidoId,
        planoContaId: tituloVivo?.planoContaId ?? c.planoContaId,
        contaBancariaId: tituloVivo?.contaBancariaId ?? p.contaBancariaId,
        status, valor: p.valor,
      });
    }
    /* O compromisso sem parcela viva e' a despesa inteira ainda prevista; com parcelas, so' o que falta programar. */
    const resto = vivas.length === 0 ? c.valorCompromisso : c.saldoAProgramar;
    if (resto > TOL_CENTAVO) {
      linhas.push({
        chave: `${vivas.length === 0 ? 'c' : 's'}:${c.compromissoId ?? ''}`, tipo: vivas.length === 0 ? 'compromisso' : 'saldo',
        compromisso: c, parcela: null, tituloId: null, vencimento: null, pagamento: null,
        descricao: c.descricao, favorecidoId: c.favorecidoId, planoContaId: c.planoContaId, contaBancariaId: null,
        status: 'previsto', valor: resto,
      });
    }
  }
  return linhas
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const va = a.l.vencimento, vb = b.l.vencimento;
      if (va === vb) return a.i - b.i;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va < vb ? -1 : 1;
    })
    .map(x => x.l);
}

/**
 * Os dois cards da direita, dos compromissos de obrigacao vivos: lancadas = o valor deles; pagas = o que ja' foi liquidado.
 * ⚠ Somar colunas da view nao e' calcular regra: `valorCompromisso` e `totalLiquidado` sao soberanos de `vw_oc_compromissos_resumo`.
 */
export function totaisDeDespesa(compromissos: readonly CompromissoResumo[]): { lancadas: number; pagas: number } {
  const vivas = compromissosDeDespesa(compromissos);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    lancadas: r2(vivas.reduce((s, c) => s + c.valorCompromisso, 0)),
    pagas: r2(vivas.reduce((s, c) => s + c.totalLiquidado, 0)),
  };
}

/**
 * A OC EM CONTA CORRENTE NAO TEM PRINCIPAL NO FINANCEIRO — a receita/custo e' a entrega + recebimento/pagamento (ADR-2026-21).
 * Qualquer caminho que crie compromisso nela (o "Nova despesa" e a rede de baixo do `criar`) passa por aqui.
 * Devolve a frase da recusa, ou `null` quando pode.
 */
export function recusaNaContaCorrente(naturezas: readonly string[], contaCorrente: boolean): string | null {
  if (!contaCorrente) return null;
  return naturezas.some(n => n !== 'obrigacao')
    ? 'Nesta OC (conta corrente) só se lança despesa: a receita é a entrega e o recebimento.'
    : null;
}
