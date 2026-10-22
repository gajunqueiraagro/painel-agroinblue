/* UI-SIDEBAR-ESTREITA-01 — a bancada pode trocar o contexto por `globalThis.__fazendaBancada` (a tela `lateral`); sem ele, o de sempre */
const g = globalThis as any;
const FAZENDAS = [{ id: 'f1', nome: 'Faz. Exemplo', cliente_id: 'cli' }];
export const GLOBAL_FAZENDA = { id: '__global__', nome: 'Global', owner_id: '' };
export const useFazenda = () => g.__fazendaBancada ?? ({ fazendas: FAZENDAS, fazendaAtual: null, isGlobal: true, fazendaId: '__global__' });
/* OC-HOSPEDEIRO-LEVE-01 — o criterio do dominio pecuario da OC, o MESMO do contexto real (o hospedeiro da OC o importa) */
export const isFazendaPecuaria = (f: { id: string; tem_pecuaria?: boolean | null }) => f.id !== '__global__' && f.tem_pecuaria === true;
