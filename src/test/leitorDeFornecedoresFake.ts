/**
 * O LEITOR ÚNICO de fornecedores, de mentira, para teste que monta tela com o seletor (FORN-SELETOR-PADRAO-01 passo 1b).
 *
 * O seletor lê do leitor, não mais da lista do hospedeiro: o teste diz ao leitor o que o "banco" tem.
 *
 *   vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
 *   ...
 *   definirFornecedoresDoLeitor(FORNECEDORES);   // ativos e inativos; o hook separa como o de verdade
 */
interface FornecedorDeTeste { id: string; nome: string; ativo?: boolean | null }

const estado: { todos: FornecedorDeTeste[]; ativos: FornecedorDeTeste[]; erro: string | null; carregando: boolean; tentativas: number } =
  { todos: [], ativos: [], erro: null, carregando: false, tentativas: 0 };

/** Para provar o campo em falha ou lendo. `tentativasDoLeitor()` conta os "Tentar de novo". */
export function definirSituacaoDoLeitor(s: { erro?: string | null; carregando?: boolean }): void {
  estado.erro = s.erro ?? null;
  estado.carregando = s.carregando ?? false;
  estado.tentativas = 0;
}
export const tentativasDoLeitor = (): number => estado.tentativas;
/** Com quais clientes o seletor pediu a lista (nulo = não pediu: está no modo da lista do hospedeiro). */
export const pedidosAoLeitor: Array<string | null> = [];

export function definirFornecedoresDoLeitor(lista: readonly FornecedorDeTeste[]): void {
  estado.todos = [...lista];
  estado.ativos = lista.filter((f) => f.ativo !== false);
}

export function moduloDoLeitorFake() {
  return {
    FRASE_FALHA_AO_LER_FORNECEDORES: 'Não foi possível carregar os fornecedores.',
    notificarFornecedoresMudaram: () => {},
    useFornecedoresDoCliente: (clienteId: string | null | undefined, gravadoId?: string | null) => (pedidosAoLeitor.push(clienteId ?? null), {
      fornecedores: clienteId && !estado.erro && !estado.carregando ? estado.ativos : [],
      /* como o de verdade: o gravado só vem à parte quando NÃO está entre os ativos */
      gravado: (clienteId && gravadoId && !estado.ativos.some((f) => f.id === gravadoId)
        ? estado.todos.find((f) => f.id === gravadoId) : null) ?? null,
      carregando: !!clienteId && estado.carregando,
      erro: clienteId ? estado.erro : null,
      tentarDeNovo: () => { estado.tentativas += 1; },
    }),
  };
}
