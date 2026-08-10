/**
 * PR-FIN-LISTA-VENCIMENTO-03 · 2C-4 — rascunho × aplicado.
 *
 * Até aqui a tela consultava a cada tecla digitada. Com a lista paginada no
 * servidor isso vira uma consulta por caractere, e — pior — cada resposta pode
 * chegar fora de ordem e reescrever a tela com um filtro que o operador já
 * abandonou.
 *
 * A separação é simples e vale a pena ser explícita:
 *
 *   RASCUNHO  o que os campos mostram. Muda a cada interação. NÃO consulta.
 *   APLICADO  o que a lista, o count, os totais, a exportação e o cancelamento
 *             enxergam. Só muda em "Aplicar filtros" ou "Limpar".
 *
 * A lista sempre representa o APLICADO. Enquanto os dois divergirem, a tela
 * avisa que há alterações pendentes — nunca consulta sozinha.
 *
 * Este módulo é puro de propósito: a máquina de estados pode ser testada sem
 * React, sem DOM e sem rede.
 */
import type { EstadoFiltrosLista } from './listaPaginadaV2';
import { TODOS } from './listaPaginadaV2';

/**
 * Tudo o que o operador pode mexer e que exige "Aplicar" para valer.
 *
 * Inclui `incluirSemVencimento`: ligar essa opção é uma mudança de filtro como
 * qualquer outra, e não pode alterar a lista antes de aplicar.
 */
export interface FiltrosEditaveis extends EstadoFiltrosLista {
  incluirSemVencimento?: boolean;
}

/** Estado inicial: nenhum filtro de lista, sem-vencimento não incluído. */
export const FILTROS_LIMPOS: FiltrosEditaveis = {
  contaOrigem: TODOS,
  contaDestino: TODOS,
  produto: '',
  documento: '',
  fornecedor: TODOS,
  atividade: TODOS,
  grupo: TODOS,
  incluirSemVencimento: false,
};

export interface EstadoLista {
  rascunho: FiltrosEditaveis;
  aplicado: FiltrosEditaveis;
  pagina: number;
}

export const ESTADO_INICIAL: EstadoLista = {
  rascunho: FILTROS_LIMPOS,
  aplicado: FILTROS_LIMPOS,
  pagina: 0,
};

export type AcaoLista =
  | { tipo: 'editar'; campo: keyof FiltrosEditaveis; valor: string | boolean | undefined }
  | { tipo: 'aplicar' }
  | { tipo: 'limpar' }
  | { tipo: 'pagina'; pagina: number };

/** Normaliza para comparação: undefined, '' e a sentinela são o mesmo "sem filtro". */
function normalizar(v: string | boolean | undefined): string | boolean {
  if (typeof v === 'boolean') return v;
  const t = (v ?? '').trim();
  return t === TODOS ? '' : t;
}

const CAMPOS: (keyof FiltrosEditaveis)[] = [
  'contaOrigem', 'contaDestino', 'produto', 'documento',
  'fornecedor', 'atividade', 'grupo', 'incluirSemVencimento',
];

/** Verdadeiro quando rascunho e aplicado descrevem o MESMO recorte. */
export function saoEquivalentes(a: FiltrosEditaveis, b: FiltrosEditaveis): boolean {
  return CAMPOS.every((c) => normalizar(a[c] as string | boolean | undefined)
                          === normalizar(b[c] as string | boolean | undefined));
}

/** Há alterações pendentes de aplicação? É o que acende o aviso na tela. */
export function temPendencias(estado: EstadoLista): boolean {
  return !saoEquivalentes(estado.rascunho, estado.aplicado);
}

/**
 * A máquina. Devolve SEMPRE um estado novo; nunca muta.
 *
 * `editar` mexe só no rascunho — é o que garante que digitar não consulta.
 * `aplicar` e `limpar` são os únicos que mexem no aplicado, e ambos voltam à
 * página 1: manter a página 7 depois de trocar o filtro mostraria uma página
 * que talvez nem exista mais.
 */
export function reduzirLista(estado: EstadoLista, acao: AcaoLista): EstadoLista {
  switch (acao.tipo) {
    case 'editar':
      return {
        ...estado,
        rascunho: { ...estado.rascunho, [acao.campo]: acao.valor },
      };
    case 'aplicar':
      return { rascunho: estado.rascunho, aplicado: estado.rascunho, pagina: 0 };
    case 'limpar':
      return { rascunho: FILTROS_LIMPOS, aplicado: FILTROS_LIMPOS, pagina: 0 };
    case 'pagina':
      return { ...estado, pagina: Math.max(0, Math.trunc(acao.pagina)) };
    default:
      return estado;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginação — o que os controles precisam saber
// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoPaginacao {
  pagina: number;
  totalPaginas: number;
  primeira: boolean;
  ultima: boolean;
  vazio: boolean;
  de: number;
  ate: number;
}

/**
 * Deriva os controles a partir do count do servidor.
 *
 * `total` é o do conjunto filtrado inteiro, não o das linhas visíveis — é o que
 * permite dizer "31 a 60 de 87" sem ter as 87 em memória.
 *
 * Se o count encolher entre duas consultas e a página atual passar do fim, a
 * função devolve a última página existente em vez de uma página vazia: quem
 * chama usa isso para se reposicionar.
 */
export function calcularPaginacao(total: number, pagina: number, tamanho: number): EstadoPaginacao {
  const t = Math.max(0, total);
  const totalPaginas = Math.max(1, Math.ceil(t / tamanho));
  const p = Math.min(Math.max(0, Math.trunc(pagina)), totalPaginas - 1);
  const de = t === 0 ? 0 : p * tamanho + 1;
  const ate = t === 0 ? 0 : Math.min((p + 1) * tamanho, t);
  return {
    pagina: p,
    totalPaginas,
    primeira: p === 0,
    ultima: p >= totalPaginas - 1,
    vazio: t === 0,
    de,
    ate,
  };
}

/** Rótulo do rodapé. Vazio tem texto próprio, para não exibir "0 a 0 de 0". */
export function rotuloPaginacao(p: EstadoPaginacao, total: number): string {
  if (p.vazio) return 'Nenhum lançamento';
  return `${p.de}–${p.ate} de ${total}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sem vencimento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Texto do contador de excluídos. `null` quando não há nada a dizer — mostrar
 * "0 sem vencimento excluídos" seria informação enganosa, não transparência.
 */
export function avisoSemVencimento(excluidos: number, incluindo: boolean): string | null {
  if (incluindo) return null;
  if (!Number.isFinite(excluidos) || excluidos <= 0) return null;
  return excluidos === 1
    ? '1 lançamento sem vencimento fora do período'
    : `${excluidos} lançamentos sem vencimento fora do período`;
}
