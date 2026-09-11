/**
 * O RECORTE DO PAINEL POR PERÍODO — FIN-PAINEL-SAFRA-01.
 *
 * ⚠ ESTE MÓDULO NÃO AGREGA NADA. A agregação é a de `@/lib/analise/analiseAgregacoes`, a
 * mesma que o Extrato Gerencial usa — o painel só monta o conjunto de itens e entrega. Uma
 * segunda definição de "distribuição econômica" divergiria da primeira no dia em que alguém
 * mexesse numa só, e a tela de conferência passaria a discordar da tela conferida.
 *
 * ⚠ SAFRA É `safra_id`, NÃO JANELA DE DATAS. `financeiro_safras` não tem `data_inicio` nem
 * `data_fim` (dívida AGRI-01), e derivar a janela do código seria inventar uma verdade que a
 * tabela não guarda. O lançamento já carrega o vínculo soberano; é ele que recorta.
 * Consequência: no modo Safra o eixo de data não se aplica — a safra É o recorte.
 */
import { ATIVIDADES, type Atividade } from './ultimaAtividade';

/** Como o período é declarado. */
export type ModoPeriodo = 'safra' | 'ano' | 'datas';

/** Qual data recorta — só nos modos `ano` e `datas`. */
export type EixoData = 'financeira' | 'competencia';

/**
 * Quais lançamentos contam.
 *
 * ⚠ O PADRÃO É `realizado`, E O NÚMERO EXPLICA POR QUÊ. Na safra 25/26 Amendoim do NJ, os 35
 * lançamentos `programado` somam R$ 9,74 mi de Custeio; os 392 `realizado` somam R$ 1,88 mi —
 * que é o número do fechamento. Um painel que somasse os dois diria seis vezes mais e
 * pareceria certo.
 * ⚠ NÃO HÁ OPÇÃO "REALIZADO + CONCILIADO", e a medição é a razão: `status_transacao =
 * 'conciliado'` não existe mais em lançamento vivo (574 linhas, TODAS canceladas) e
 * `conciliado_em` é nulo nas 70 mil. A conciliação mora em `conciliacao_bancaria_itens`, e os
 * 3.580 lançamentos com vínculo ativo JÁ são `realizado` — conciliado é subconjunto de
 * realizado, não irmão. A opção existiria para devolver exatamente o mesmo conjunto.
 */
export type FiltroStatus = 'realizado' | 'todos';

export const STATUS_TODOS = ['realizado', 'previsto', 'programado', 'agendado', 'meta'] as const;

export interface RecortePainel {
  /** `null` = todas as contas do cliente (o padrão). */
  contaId: string | null;
  modo: ModoPeriodo;
  /** Modo `safra`. */
  safraId: string | null;
  /** Modo `ano`. */
  ano: number | null;
  /** Modo `datas` — ambos inclusivos no dia. */
  de: string | null;
  ate: string | null;
  eixo: EixoData;
  /** `null` = todas as atividades. */
  escopo: Atividade | null;
  status: FiltroStatus;
}

export const RECORTE_PADRAO: RecortePainel = {
  contaId: null, modo: 'ano', safraId: null, ano: null,
  de: null, ate: null, eixo: 'financeira', escopo: null, status: 'realizado',
};

/** A janela `[de, ate)` do modo `ano`. `null` nos outros modos. */
export function janelaDoAno(ano: number | null): { de: string; ate: string } | null {
  if (!ano) return null;
  return { de: `${ano}-01-01`, ate: `${ano + 1}-01-01` };
}

/**
 * A janela `[de, ate)` do modo `datas`.
 *
 * ⚠ O FIM É EXCLUSIVO NA CONSULTA E INCLUSIVO NA TELA: o operador que digita 31/12 espera o
 * dia 31 dentro. Somar um dia aqui é o que faz as duas coisas serem verdade ao mesmo tempo.
 */
export function janelaDasDatas(de: string | null, ate: string | null): { de: string; ate: string } | null {
  if (!de || !ate) return null;
  const d = new Date(`${ate}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return { de, ate: d.toISOString().slice(0, 10) };
}

/** A janela efetiva do recorte, ou `null` quando o modo é `safra` (que não usa datas). */
export function janelaDoRecorte(r: RecortePainel): { de: string; ate: string } | null {
  if (r.modo === 'safra') return null;
  return r.modo === 'ano' ? janelaDoAno(r.ano) : janelaDasDatas(r.de, r.ate);
}

/** O recorte está completo o bastante para consultar? */
export function recorteCompleto(r: RecortePainel): boolean {
  if (r.modo === 'safra') return !!r.safraId;
  return janelaDoRecorte(r) !== null;
}

/**
 * O motivo de não dar para consultar — `null` quando dá.
 *
 * ⚠ UMA FRASE, TRÊS USOS (`disabled`, `title` e a dica ao lado), como no modal da OC: um
 * botão cinza que não diz por quê manda o operador procurar defeito onde não há.
 */
export function impedimentoDoRecorte(r: RecortePainel): string | null {
  if (r.modo === 'safra' && !r.safraId) return 'Escolha a safra — ela é o recorte.';
  if (r.modo === 'ano' && !r.ano) return 'Escolha o ano.';
  if (r.modo === 'datas' && (!r.de || !r.ate)) return 'Preencha as duas datas.';
  if (r.modo === 'datas' && r.de && r.ate && r.ate < r.de) return 'A data final não pode ser antes da inicial.';
  return null;
}

/** O rótulo da atividade, do MESMO lugar que o card e o filtro da lista. */
export function rotuloEscopo(escopo: Atividade | null): string {
  if (!escopo) return 'Todas';
  return ATIVIDADES.find((a) => a.valor === escopo)?.rotulo ?? escopo;
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const diaBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * A frase do período, para o `periodoLabel` dos componentes de análise.
 *
 * ⚠ ELA VIAJA ATÉ O DRAWER do drill-down, e é o que diz ao operador de que recorte é a lista
 * que ele está lendo. Uma frase genérica ("período selecionado") transformaria a conferência
 * num exercício de memória.
 */
export function descreverPeriodo(r: RecortePainel, nomeDaSafra?: string | null): string {
  if (r.modo === 'safra') return nomeDaSafra || 'Safra';
  if (r.modo === 'ano') return r.ano ? String(r.ano) : '—';
  if (!r.de || !r.ate) return '—';
  if (r.de.slice(0, 7) === r.ate.slice(0, 7)) {
    const [a, m] = r.de.slice(0, 7).split('-').map(Number);
    return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
  }
  return `${diaBr(r.de)} a ${diaBr(r.ate)}`;
}

/** A frase do eixo de data — vazia no modo safra, onde ele não se aplica. */
export function descreverEixo(r: RecortePainel): string {
  if (r.modo === 'safra') return '';
  return r.eixo === 'competencia' ? 'por competência' : 'por data financeira';
}
