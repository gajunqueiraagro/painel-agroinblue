/**
 * leitorDeFornecedores — FORN-SELETOR-PADRAO-01 passo 1a (Gabriel, 08/10/2026). O LEITOR ÚNICO de fornecedores por cliente.
 *
 * Havia sete leitores de `financeiro_fornecedores` montando lista de seletor, e eles não concordavam: com ou sem documento, com
 * ou sem inativos, com ou sem corte em 1.000 (o PostgREST corta sem avisar). Este é o dono; os sete migram no PASSO 2.
 *
 * ⚠ SÓ ATIVOS NA LISTA, paginado ATÉ O FIM, com `cpf_cnpj`. O valor já gravado que não está entre os ativos se busca POR ID
 *   (`lerPorId`) — é o que deixa o campo mostrar o fornecedor de um registro antigo, marcado "inativo", sem esvaziá-lo.
 * ⚠ CACHE POR CLIENTE, e nada de um cliente responde por outro: toda entrada é chaveada pelo cliente, e a resposta que chega
 *   depois de um aviso de mudança (geração velha) é descartada e relida.
 * ⚠ RELEITURA PELO AVISO, sem F5: quem grava no cadastro (criar, editar, inativar, reativar, fundir) chama
 *   `notificarFornecedoresMudaram(cliente)` DEPOIS de gravar, só no sucesso — o molde do canal de lançamentos.
 * ⚠ ESTE ARQUIVO É PURO (não importa o banco): quem lê é injetado. A ligação com o banco mora em `useFornecedoresDoCliente.ts`.
 */

/** O que o seletor e os modais leem de um fornecedor (as colunas que `FornecedorV2` já tinha). */
export interface FornecedorLido {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string | null;
  ativo: boolean;
  tipo_recebimento: string | null;
  pix_tipo_chave: string | null;
  pix_chave: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  cpf_cnpj_pagamento: string | null;
  nome_favorecido: string | null;
  observacao_pagamento: string | null;
}

export interface PaginaDeFornecedores { linhas: FornecedorLido[]; total: number | null }

export interface FonteDeFornecedores {
  /** Uma página dos ATIVOS do cliente, em ordem estável (nome, id). `contar` pede o total exato. Falha = exceção. */
  lerPagina: (clienteId: string, de: number, ate: number, contar: boolean) => Promise<PaginaDeFornecedores>;
  /** Um fornecedor DESTE cliente pelo id, ativo ou não; nulo se não existe. Falha = exceção. */
  lerPorId: (clienteId: string, id: string) => Promise<FornecedorLido | null>;
}

export const TAMANHO_DA_PAGINA = 1000;

interface Entrada {
  geracao: number;
  lista: FornecedorLido[] | null;
  lendo: Promise<FornecedorLido[]> | null;
  porId: Map<string, Promise<FornecedorLido | null>>;
  ouvintes: Set<() => void>;
}

export interface LeitorDeFornecedores {
  /** Os ativos do cliente, do cache ou do banco. Leituras simultâneas do mesmo cliente são UMA ida. */
  ler: (clienteId: string) => Promise<FornecedorLido[]>;
  /** O que já está em cache para este cliente (nulo = ainda não lido). Nunca devolve lista de outro cliente. */
  doCache: (clienteId: string) => FornecedorLido[] | null;
  /** O fornecedor gravado, ativo ou não, deste cliente. */
  lerPorId: (clienteId: string, id: string) => Promise<FornecedorLido | null>;
  /** O cadastro deste cliente mudou: o cache esquece e quem ouve relê. */
  notificarMudou: (clienteId: string) => void;
  inscrever: (clienteId: string, aoMudar: () => void) => () => void;
}

/** Todas as páginas, até o fim. Com o total: a primeira e as demais em paralelo. Sem o total: serial, até a página curta. */
export async function lerTodosOsAtivos(
  fonte: FonteDeFornecedores, clienteId: string, tamanho: number = TAMANHO_DA_PAGINA,
): Promise<FornecedorLido[]> {
  const primeira = await fonte.lerPagina(clienteId, 0, tamanho - 1, true);
  const linhas = [...primeira.linhas];
  if (primeira.total === null) {
    /* sem o total não se adivinha quantas faltam: serial de propósito (`total ?? linhas.length` truncaria calado) */
    let de = tamanho;
    let ultima = primeira.linhas.length;
    while (ultima === tamanho) {
      const p = await fonte.lerPagina(clienteId, de, de + tamanho - 1, false);
      linhas.push(...p.linhas);
      ultima = p.linhas.length;
      de += tamanho;
    }
    return linhas;
  }
  const faltam = Math.max(0, Math.ceil(primeira.total / tamanho) - 1);
  const resto = await Promise.all(
    Array.from({ length: faltam }, (_v, i) => fonte.lerPagina(clienteId, (i + 1) * tamanho, (i + 2) * tamanho - 1, false)));
  for (const p of resto) linhas.push(...p.linhas);
  return linhas;
}

export function criarLeitorDeFornecedores(fonte: FonteDeFornecedores, tamanho: number = TAMANHO_DA_PAGINA): LeitorDeFornecedores {
  const porCliente = new Map<string, Entrada>();
  const entradaDe = (clienteId: string): Entrada => {
    let e = porCliente.get(clienteId);
    if (!e) {
      e = { geracao: 0, lista: null, lendo: null, porId: new Map(), ouvintes: new Set() };
      porCliente.set(clienteId, e);
    }
    return e;
  };

  const ler = (clienteId: string): Promise<FornecedorLido[]> => {
    const e = entradaDe(clienteId);
    if (e.lista) return Promise.resolve(e.lista);
    if (e.lendo) return e.lendo;
    const geracao = e.geracao;
    const lendo = lerTodosOsAtivos(fonte, clienteId, tamanho).then(
      (lista) => {
        /* o cadastro mudou enquanto se lia: esta resposta já é velha — não entra no cache; relê */
        if (e.geracao !== geracao) return ler(clienteId);
        e.lista = lista;
        e.lendo = null;
        return lista;
      },
      (erro: unknown) => {
        if (e.geracao === geracao) e.lendo = null;   /* a falha não fica em cache: a próxima leitura tenta de novo */
        throw erro;
      },
    );
    e.lendo = lendo;
    return lendo;
  };

  const lerPorId = (clienteId: string, id: string): Promise<FornecedorLido | null> => {
    const e = entradaDe(clienteId);
    const naLista = e.lista?.find((f) => f.id === id);
    if (naLista) return Promise.resolve(naLista);
    const emCurso = e.porId.get(id);
    if (emCurso) return emCurso;
    const p = fonte.lerPorId(clienteId, id).catch((erro: unknown) => {
      if (e.porId.get(id) === p) e.porId.delete(id);
      throw erro;
    });
    e.porId.set(id, p);
    return p;
  };

  return {
    ler,
    lerPorId,
    doCache: (clienteId) => porCliente.get(clienteId)?.lista ?? null,
    notificarMudou: (clienteId) => {
      const e = entradaDe(clienteId);
      e.geracao += 1;
      e.lista = null;
      e.lendo = null;
      e.porId = new Map();
      for (const cb of [...e.ouvintes]) cb();
    },
    inscrever: (clienteId, aoMudar) => {
      const e = entradaDe(clienteId);
      e.ouvintes.add(aoMudar);
      return () => { e.ouvintes.delete(aoMudar); };
    },
  };
}
