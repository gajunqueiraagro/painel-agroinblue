/* o leitor de fornecedores da bancada: a lista que a tela registrou */
const lista = (): any[] => (globalThis as any).__fornecedoresBancada ?? [];
export const FRASE_FALHA_AO_LER_FORNECEDORES = 'x';
export const notificarFornecedoresMudaram = () => {};
export const leitorDeFornecedores = { ler: async () => lista(), doCache: () => lista(), lerPorId: async (id: string) => lista().find((f) => f.id === id) ?? null, notificarMudou: () => {}, inscrever: () => () => {} };
export const useFornecedoresDoCliente = (c: string | null, gravadoId?: string | null) => ({ fornecedores: c ? lista() : [], gravado: lista().find((f) => f.id === gravadoId) ?? null, carregando: false, erro: null, tentarDeNovo: () => {} });
