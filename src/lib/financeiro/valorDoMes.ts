/**
 * O VALOR DO MÊS DE UMA OCORRÊNCIA DE RECORRÊNCIA — REC-VALOR-DO-MES-MODAL-01 (Gabriel, 05/10/2026).
 *
 * A regra da recorrência tem UM valor base; o mês às vezes vem diferente (a folha com hora extra, a conta de luz). Quem ajusta
 * a ocorrência marca o "valor do mês" (`valor_do_mes_em` + `valor_do_mes_origem`), e o Propagar PULA a conta marcada
 * (`fn_recorrencia_propagar`, REC-PROPAGAR-VALOR-DO-MES-01). Este arquivo é o DONO, puro, de três perguntas da tela:
 *   · "o salvar marca?" (`marcaAoSalvar`);
 *   · "qual é o previsto da regra para esta competência?" (`previstoDaOcorrencia`);
 *   · "o que a tela escreve?" (as frases).
 *
 * ⚠ NENHUM GATILHO NO BANCO, de propósito: a marca vai no MESMO UPDATE da edição (`colunasDoValorDoMes`, lida pelo
 *   `editarLancamento`). Quem grava por outro caminho (importador, RPC) não marca — e não deve.
 * ⚠ "ABERTA" É O PREDICADO DO PROPAGAR, copiado do corpo dele: status previsto/programado/agendado/meta, sem data de
 *   pagamento e sem conciliação. Só a aberta é marcada: na conta paga o Propagar nunca reescreve o valor, e a marca só faria
 *   o modo "todos" pular a classificação dela.
 */

export type OrigemDoValorDoMes = 'planilha' | 'manual';
export type DecisaoDaMarca = 'marcar_manual' | 'manter' | 'nada';
/** O que o form pede ao gravador. Ausente = as duas colunas NÃO entram no UPDATE. */
export type PedidoDoValorDoMes = 'marcar_manual' | 'limpar';

const STATUS_ABERTOS: readonly string[] = ['previsto', 'programado', 'agendado', 'meta'];

/** O predicado "futuro" de `fn_recorrencia_propagar`. */
export function ocorrenciaAberta(l: { status: string | null | undefined; dataPagamento: string | null | undefined; conciliadoEm: string | null | undefined }): boolean {
  return STATUS_ABERTOS.includes(l.status ?? '') && !l.dataPagamento && !l.conciliadoEm;
}

const centavos = (v: number | null | undefined) => Math.round(Math.abs(Number(v ?? 0)) * 100);
const data = (d: string | null | undefined) => (d ? d.slice(0, 10) : '');

/** O valor ou o vencimento em edição difere do gravado? */
export function difereDoGravado(
  antes: { valor: number | null | undefined; vencimento: string | null | undefined },
  depois: { valor: number | null | undefined; vencimento: string | null | undefined },
): boolean {
  return centavos(antes.valor) !== centavos(depois.valor) || data(antes.vencimento) !== data(depois.vencimento);
}

/**
 * O salvar marca o valor do mês?
 *   · não é ocorrência de recorrência → 'nada' (as colunas não entram no payload: idêntico ao de sempre);
 *   · ocorrência ABERTA (pelo que vai ser gravado) com valor OU vencimento diferente do gravado → 'marcar_manual', inclusive
 *     quando já estava marcada pela planilha (o operador assumiu o valor);
 *   · o resto → 'manter' (não toca as colunas).
 */
export function marcaAoSalvar(p: {
  ehRecorrencia: boolean;
  /** A ocorrência, como VAI SER GRAVADA, está aberta? */
  aberta: boolean;
  antes: { valor: number | null | undefined; vencimento: string | null | undefined; marca: OrigemDoValorDoMes | null };
  depois: { valor: number | null | undefined; vencimento: string | null | undefined };
}): DecisaoDaMarca {
  if (!p.ehRecorrencia) return 'nada';
  if (p.aberta && difereDoGravado(p.antes, p.depois)) return 'marcar_manual';
  return 'manter';
}

/** As colunas que o UPDATE leva. Sem pedido, objeto VAZIO: o payload é o de sempre. */
export function colunasDoValorDoMes(
  pedido: PedidoDoValorDoMes | undefined, agora: Date,
): { valor_do_mes_em?: string | null; valor_do_mes_origem?: OrigemDoValorDoMes | null } {
  if (pedido === 'marcar_manual') return { valor_do_mes_em: agora.toISOString(), valor_do_mes_origem: 'manual' };
  if (pedido === 'limpar') return { valor_do_mes_em: null, valor_do_mes_origem: null };
  return {};
}

/** O que a tela precisa da regra (`financeiro_recorrencias`). */
export interface RegraDaRecorrencia {
  valor_base: number;
  dia_vencimento: number;
  data_inicio: string;
  primeiro_vencimento: string;
}

/**
 * O vencimento que a regra dá para uma competência — ESPELHO DECLARADO de `_fn_recorrencia_vencimento` (o dono, no banco):
 * mês da competência + o deslocamento das âncoras (meses entre `data_inicio` e `primeiro_vencimento`), no dia pretendido,
 * aparado pelo último dia do mês. Quem mexer num confere o outro.
 */
export function vencimentoPrevisto(regra: Pick<RegraDaRecorrencia, 'dia_vencimento' | 'data_inicio' | 'primeiro_vencimento'>, competencia: string): string {
  const [ai, mi] = regra.data_inicio.slice(0, 7).split('-').map(Number);
  const [av, mv] = regra.primeiro_vencimento.slice(0, 7).split('-').map(Number);
  const desloc = (av - ai) * 12 + (mv - mi);
  const [ac, mc] = competencia.slice(0, 7).split('-').map(Number);
  const alvo = ac * 12 + (mc - 1) + desloc;
  const ano = Math.floor(alvo / 12);
  const mes = (alvo % 12) + 1;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(Math.max(regra.dia_vencimento, 1), ultimoDia);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** O previsto da regra para a ocorrência: valor em módulo (o lançamento guarda o valor sem sinal) e o vencimento. */
export function previstoDaOcorrencia(regra: RegraDaRecorrencia, competencia: string): { valor: number; vencimento: string } {
  return { valor: Math.abs(Number(regra.valor_base)), vencimento: vencimentoPrevisto(regra, competencia) };
}

/* ── o que a tela escreve ─────────────────────────────────────────────────────────────────────────────────────────────── */

export const MOTIVO_CONTA_PAGA = 'Conta já paga.';
export const MOTIVO_SALVAR_PENDENTE = 'Há pendência no lançamento.';

/** A linha da ocorrência MARCADA, em três partes: só a do meio (o número) nunca corta. */
export function partesDaMarcada(previsto: string, origem: OrigemDoValorDoMes | null): { antes: string; numero: string; depois: string } {
  return { antes: 'Valor do mês ajustado ·', numero: `previsto ${previsto}`, depois: origem === 'planilha' ? '· pela planilha' : '' };
}

/**
 * A intenção, ANTES de salvar, na ocorrência não marcada cujo valor (ou vencimento) em edição difere do gravado.
 * ⚠ CURTA NA TELA, INTEIRA NO `title` (Gabriel, 05/10): a frase com "o Propagar não altera esta conta" pedia ~440px e cortava no
 *   rodapé quando há "Vincular à operação".
 */
export function partesDaIntencao(previsto: string): { antes: string; numero: string; depois: string; titulo: string } {
  return {
    antes: 'Ao salvar, fica como valor do mês ·', numero: `previsto ${previsto}`, depois: '',
    titulo: `Ao salvar, fica como valor do mês (previsto ${previsto}); o Propagar não altera esta conta.`,
  };
}

export const juntar = (p: { antes: string; numero: string; depois: string }) => [p.antes, p.numero, p.depois].filter(Boolean).join(' ');
/** O `title` da linha: a frase inteira quando a tela mostra a curta; senão, o que está escrito. */
export const tituloDasPartes = (p: { antes: string; numero: string; depois: string; titulo?: string }) => p.titulo ?? juntar(p);
