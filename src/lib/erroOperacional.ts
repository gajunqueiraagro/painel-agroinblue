/**
 * erroOperacional — normalização segura de erros para a camada financeira.
 *
 * PR-FIN-IMPORT-ERRO-VISIVEL-01.
 *
 * PROBLEMA QUE RESOLVE. Os writers do financeiro faziam uma de duas coisas
 * erradas: mostravam `toast.error('Erro ao criar lançamento')` para nove causas
 * distintas (o operador não sabia se era permissão, vínculo ou formato), ou
 * concatenavam `error.message` cru do PostgREST no toast — que é como
 * `invalid input syntax for type integer: "D1"` chegaria à tela.
 *
 * DETECÇÃO ESTRUTURAL, NÃO `instanceof`. `PostgrestError extends Error`
 * (@supabase/postgrest-js), então `e instanceof Error` é verdadeiro tanto para
 * um Error comum quanto para um erro do banco — e não serve para decidir se a
 * mensagem pode ser exibida. A checagem aqui é pela FORMA do objeto:
 * presença simultânea de `code`, `details` e `hint`.
 *
 * DUAS CAMADAS, AMBAS SANITIZADAS.
 *   - `mensagem`     → ao operador. Curta, acionável, sem nada interno.
 *   - `diagnostico`  → console. SOMENTE contexto + categoria + código seguro.
 *                      Nunca o objeto bruto, nunca `details`/`hint`/stack.
 *
 * O QUE NUNCA SAI DAQUI: `details`, `hint`, stack, SQL, nome de tabela ou
 * coluna, UUID, path, e qualquer `message` desconhecida vinda do banco.
 *
 * SEM TELEMETRIA. Esta frente não adiciona envio externo de nada.
 *
 * NÃO DECIDE DUPLICIDADE. `23505` é conflito de chave no banco — não é
 * julgamento sobre semelhança de negócio. Lançamentos legitimamente iguais
 * (tributos com mesma data, valor e descrição) existem e continuam válidos.
 * O contrato de similaridade pertence ao PR-CONTRATO-DEDUP-01; por isso a
 * mensagem de 23505 fala em "conflito com um registro já cadastrado" e nunca
 * em "duplicado" ou "já existe um registro com estes dados".
 */

export type CategoriaErro =
  | 'permissao'
  | 'conflito'
  | 'vinculo'
  | 'formato'
  | 'rede'
  | 'validacao'
  | 'desconhecido';

export interface ErroNormalizado {
  /** Exibível ao operador. Segura por construção. */
  readonly mensagem: string;
  readonly categoria: CategoriaErro;
  /** SQLSTATE, apenas quando pertence à lista conservadora conhecida. */
  readonly codigo?: string;
  /** Para console/suporte. Já sanitizado — nunca contém dado do erro bruto. */
  readonly diagnostico: string;
}

/** Formato real de um erro PostgREST, verificado estruturalmente. */
interface ErroPostgrestLike {
  readonly code: string;
  readonly message: string;
  readonly details: string | null;
  readonly hint: string | null;
}

const MSG: Readonly<Record<CategoriaErro, string>> = {
  permissao:    'Você não tem permissão para esta operação.',
  conflito:     'Não foi possível salvar porque existe um conflito com um registro já cadastrado.',
  vinculo:      'Vínculo inválido: verifique fazenda, conta ou fornecedor.',
  formato:      'Um dos campos está em formato inválido.',
  rede:         'Falha de comunicação. Verifique a conexão e tente novamente.',
  validacao:    'Não foi possível concluir. Tente novamente; se persistir, procure o suporte.',
  desconhecido: 'Não foi possível concluir. Tente novamente; se persistir, procure o suporte.',
};

/** Mapa conservador de SQLSTATE. O que não está aqui vira 'desconhecido'. */
const POR_SQLSTATE: Readonly<Record<string, CategoriaErro>> = {
  '42501': 'permissao',
  '23505': 'conflito',
  '23503': 'vinculo',
  '22P02': 'formato',
};

/**
 * Type guard ESTRUTURAL. Não usa `instanceof` — ver nota no topo do arquivo.
 * Exige as três chaves juntas para não confundir com um Error qualquer que
 * por acaso tenha `code`.
 */
function ehErroPostgrest(e: unknown): e is ErroPostgrestLike {
  if (typeof e !== 'object' || e === null) return false;
  return 'code' in e && 'details' in e && 'hint' in e
    && typeof (e as { code: unknown }).code === 'string';
}

/** Erro de rede/indisponibilidade — distinto de validação. */
function ehErroDeRede(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const nome = typeof (e as { name?: unknown }).name === 'string'
    ? (e as { name: string }).name : '';
  const msg = typeof (e as { message?: unknown }).message === 'string'
    ? (e as { message: string }).message.toLowerCase() : '';
  if (nome === 'TypeError' && msg.includes('fetch')) return true;
  if (nome === 'AbortError') return true;
  return msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('load failed');
}

/**
 * Marca uma mensagem como segura para exibição literal ao operador.
 *
 * Uso EXCLUSIVO para validações cujo texto foi AUTORADO por nós — checagem de
 * formulário, formato de arquivo não reconhecido, pré-condição de fluxo.
 * Nunca para texto vindo do banco, da rede ou de conteúdo de arquivo do
 * usuário: quem lança assume que a frase inteira pode ir à tela.
 *
 * Regra de uso: a string passada aqui não pode interpolar nada que venha de
 * fora — nem `error.message`, nem linha de extrato, nem cabeçalho lido do
 * arquivo, nem identificador interno.
 */
export class ErroUsuarioSeguro extends Error {
  // Sem `as const`: o gate zero-cast do CLAUDE.md proíbe `as` em código novo.
  readonly categoria: CategoriaErro = 'validacao';

  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroUsuarioSeguro';
  }
}

/**
 * Normaliza qualquer erro em algo seguro de exibir e de registrar.
 *
 * @param e        o erro capturado, de tipo desconhecido
 * @param contexto rótulo curto e estável do fluxo, ex.: 'criarLancamento'.
 *                 Aparece só no diagnóstico, nunca na mensagem ao usuário.
 */
export function normalizarErro(e: unknown, contexto: string): ErroNormalizado {
  // 1. Validação local explicitamente marcada como segura: texto preservado.
  if (e instanceof ErroUsuarioSeguro) {
    return {
      mensagem: e.message,
      categoria: 'validacao',
      diagnostico: `[${contexto}] validacao`,
    };
  }

  // 2. Rede antes de tudo: um fetch que falhou não é erro de dado.
  if (ehErroDeRede(e)) {
    return {
      mensagem: MSG.rede,
      categoria: 'rede',
      diagnostico: `[${contexto}] rede`,
    };
  }

  // 3. Erro do PostgREST, detectado pela forma. O `message`, o `details` e o
  //    `hint` são DESCARTADOS: só o SQLSTATE conhecido atravessa.
  if (ehErroPostgrest(e)) {
    const categoria = POR_SQLSTATE[e.code] ?? 'desconhecido';
    const codigoSeguro = categoria === 'desconhecido' ? undefined : e.code;
    return {
      mensagem: MSG[categoria],
      categoria,
      codigo: codigoSeguro,
      diagnostico: codigoSeguro
        ? `[${contexto}] ${categoria} sqlstate=${codigoSeguro}`
        : `[${contexto}] desconhecido`,
    };
  }

  // 4. Qualquer outra coisa — Error comum, string, objeto, null, undefined.
  //    Nada do conteúdo é aproveitado: não há como saber se é seguro.
  return {
    mensagem: MSG.desconhecido,
    categoria: 'desconhecido',
    diagnostico: `[${contexto}] desconhecido`,
  };
}

/**
 * Atalho para o par toast + console dos writers.
 * Devolve o normalizado para quem precisar da categoria.
 */
export function reportarErro(
  e: unknown,
  contexto: string,
  toastError: (msg: string) => void,
): ErroNormalizado {
  const n = normalizarErro(e, contexto);
  toastError(n.mensagem);
  // console recebe SOMENTE o diagnóstico sanitizado — nunca o erro bruto.
  console.error(n.diagnostico);
  return n;
}
