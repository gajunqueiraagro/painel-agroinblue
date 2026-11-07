/* UI-SIDEBAR-ESTREITA-01 — a bancada pode trocar o contexto por `globalThis.__clienteBancada` (a tela `lateral`); sem ele, o de sempre */
const g = globalThis as any;
const PADRAO = { clienteAtual: { id: 'cli', nome: 'Cliente Bancada' }, clientes: [{ id: 'cli', nome: 'Cliente Bancada' }, { id: 'cli2', nome: 'Cliente Exemplo Dois' }], isAdmin: true, perfil: 'admin_agroinblue', loading: false };
export const useCliente = () => g.__clienteBancada ?? PADRAO;
/* OC-BUSCAR-RECEBIMENTO-01 — o id do cliente quando há provedor (na bancada, sempre o do contexto) */
export const useClienteIdSeHouver = (): string | null => (g.__clienteBancada ?? PADRAO).clienteAtual?.id ?? null;
