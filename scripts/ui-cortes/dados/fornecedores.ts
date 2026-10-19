/* Fornecedores SINTETICOS da bancada (nenhum nome real): nomes longos de proposito, com e sem documento, ativos e inativos. */
export const LINHAS: Record<string, Record<string, unknown>> = {
  b: { id: 'b', cliente_id: 'cli', nome: 'Luiz Fernando Exemplo da Silva Comércio de Produtos Agropecuários Ltda', nome_fantasia: 'Casa do Agronegócio Central', cpf_cnpj: '54.442.418/0001-88',
    inscricao_estadual: '284964700', ativo: true, email: 'contato.financeiro@exemplo-agro.com.br', municipio: 'Campo Grande', uf: 'MS', logradouro: 'Rua das Flores', numero: '1200', created_at: '2026-01-05T10:00:00Z' },
  c: { id: 'c', cliente_id: 'cli', nome: 'Casa do Agronegócio Exemplo', nome_fantasia: 'Casa do Agronegócio', cpf_cnpj: '54442418000188', ativo: true, email: 'vendas@casadoagro-exemplo.com.br',
    pix_tipo_chave: 'cnpj', pix_chave: '54442418000188', municipio: 'Sidrolândia', uf: 'MS', created_at: '2026-02-05T10:00:00Z' },
  m: { id: 'm', cliente_id: 'cli', nome: 'Luiz Fernando Exemplo da Silva', nome_fantasia: null, cpf_cnpj: null, ativo: true, telefone: '(67) 99999-0000', created_at: '2026-03-05T10:00:00Z' },
};
const NOMES_BASE = ['Agropecuária Exemplo Comércio de Insumos e Defensivos Agrícolas Ltda', 'Pec.3M-Comercial Exemplo de Alimentos e Bebidas do Centro-Oeste',
  'Posto de Combustíveis Exemplo Rodovia BR-163 Quilômetro 445 Ltda', 'Cooperativa Agroindustrial dos Produtores Rurais Exemplo do Mato Grosso do Sul',
  'Transportadora Exemplo Logística Rodoviária de Cargas Vivas Eireli', 'Mecânica Exemplo', 'Ana Exemplo', 'Clínica Veterinária Exemplo Saúde Animal',
  'Pec.3M-Supermercado Exemplo Filial Centro', 'Imobiliária Exemplo', 'Sindicato Rural Exemplo de Campo Grande', 'Laboratório Exemplo de Análises de Solo e Foliar'];
const NOMES = [...NOMES_BASE, ...Array.from({ length: 24 }, (_, i) => `Fornecedor Exemplo Número ${i + 1} Comércio e Representações Agropecuárias`)];
export const LISTA = [...Object.values(LINHAS), ...NOMES.map((nome, i) => ({ id: `x${i}`, cliente_id: 'cli', nome,
  nome_fantasia: i % 3 === 0 ? `Fantasia Exemplo ${i} Comércio` : null, cpf_cnpj: i % 2 === 0 ? `${String(10 + i)}.222.333/0001-${String(10 + i)}` : i % 5 === 1 ? '123.456.789-09' : null,
  ativo: i % 4 !== 3, created_at: `2026-0${(i % 9) + 1}-10T10:00:00Z` }))];
export const LEITOR = LISTA.filter((f) => f.ativo !== false).map((f) => ({ ...f, fazenda_id: null, tipo_recebimento: null }));
export const USO: Record<string, unknown> = { b: { lancamentos: 6, compras_parceladas: 1, recorrencias: 1, documentos: 4, financiamentos: 0, operacoes: 2, ultimo_lancamento: '2026-09-30' },
  c: { lancamentos: 10, compras_parceladas: 0, recorrencias: 0, documentos: 7, financiamentos: 0, operacoes: 1, ultimo_lancamento: '2026-10-15' },
  m: { lancamentos: 3, compras_parceladas: 0, recorrencias: 0, documentos: 1, financiamentos: 0, operacoes: 0, ultimo_lancamento: '2026-08-10' } };
const f = (id: string) => ({ id, nome: String(LINHAS[id]?.nome ?? LISTA.find((x) => x.id === id)?.nome), cpf_cnpj: (LINHAS[id]?.cpf_cnpj ?? null), ativo: true });
export const GRUPOS = [
  { motivo: 'documento', chave: 'g1', qtd: 3, fornecedores: [f('b'), f('c'), f('m')] },
  { motivo: 'nome', chave: 'g2', qtd: 2, fornecedores: [f('x2'), { id: 'x2b', nome: 'Posto de Combustíveis Exemplo Rodovia BR-163', cpf_cnpj: null, ativo: false }] },
  { motivo: 'parecido', chave: 'g3', qtd: 2, fornecedores: [f('x1'), { id: 'x1b', nome: 'Pec.3M-Comercial Exemplo de Alimentos', cpf_cnpj: null, ativo: true }] },
  ...Array.from({ length: 12 }, (_, i) => ({ motivo: 'parecido', chave: `gp${i}`, qtd: 2, fornecedores: [
    { id: `gp${i}a`, nome: `Fornecedor Exemplo Número ${i + 1} Comércio e Representações Agropecuárias`, cpf_cnpj: null, ativo: true },
    { id: `gp${i}b`, nome: `Fornecedor Exemplo ${i + 1}`, cpf_cnpj: null, ativo: i % 2 === 0 }] })),
];
/* mesclagens recentes: duas no mesmo dia (a hora tem coluna), nomes longos, uma desfeita com motivo */
export const RECENTES = [
  { id: 'r1', mantido_id: 'b', absorvidos: ['m', 'c'], criado_em: '2026-10-19T14:26:35Z', resumo: { total: 214 },
    antes: { absorvidos: [{ nome: 'Luiz Fernando Exemplo da Silva' }, { nome: 'Casa do Agronegócio Exemplo' }] }, desfeito_em: null, desfeito_motivo: null },
  { id: 'r2', mantido_id: 'x0', absorvidos: ['x3'], criado_em: '2026-10-19T11:05:00Z', resumo: { total: 9 },
    antes: { absorvidos: [{ nome: 'Cooperativa Agroindustrial dos Produtores Rurais Exemplo do Mato Grosso do Sul' }] }, desfeito_em: '2026-10-19T12:00:00Z', desfeito_motivo: 'mesclado por engano: são cadastros diferentes de propósito' },
  { id: 'r3', mantido_id: 'x4', absorvidos: ['x5'], criado_em: '2026-10-18T09:00:00Z', resumo: { total: 1 },
    antes: { absorvidos: [{ nome: 'Mecânica Exemplo' }] }, desfeito_em: null, desfeito_motivo: null },
  ...Array.from({ length: 16 }, (_, i) => ({ id: `rx${i}`, mantido_id: `x${i % 12}`, absorvidos: [`gp${i % 12}b`], criado_em: `2026-10-${String(17 - (i % 9)).padStart(2, '0')}T${String(8 + i).padStart(2, '0')}:15:00Z`,
    resumo: { total: 3 + i * 7 }, antes: { absorvidos: [{ nome: `Fornecedor Exemplo ${i + 1} Comércio e Representações` }] }, desfeito_em: null, desfeito_motivo: null })),
];
