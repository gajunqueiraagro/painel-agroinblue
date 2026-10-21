/* UI-SIDEBAR-ESTREITA-01 — a bancada pode trocar o contexto por `globalThis.__fazendaBancada` (a tela `lateral`); sem ele, o de sempre */
const g = globalThis as any;
const FAZENDAS = [{ id: 'f1', nome: 'Faz. Exemplo', cliente_id: 'cli' }];
export const GLOBAL_FAZENDA = { id: '__global__', nome: 'Global', owner_id: '' };
export const useFazenda = () => g.__fazendaBancada ?? ({ fazendas: FAZENDAS, fazendaAtual: null, isGlobal: true, fazendaId: '__global__' });
