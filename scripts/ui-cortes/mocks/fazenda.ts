const FAZENDAS = [{ id: 'f1', nome: 'Faz. Exemplo', cliente_id: 'cli' }];
export const useFazenda = () => ({ fazendas: FAZENDAS, fazendaAtual: null, isGlobal: true, fazendaId: '__global__' });
