/**
 * FISCAL onda 1 (a) — Cadastros › Produtores na bancada do `check:ui-cortes` / `check:ui-desloca`: a API em memória (a mesma porta
 * injetável da tela, `ProdutoresApiProvider`), com dado SINTÉTICO no espelho do caso do mock (produtora PF com 3 fazendas e acordos com um
 * terceiro, uma PJ do grupo com CNPJ alfanumérico, um inativo) e um pior caso (nome e fazenda longos). Nada fala com o banco: a prévia
 * se monta a partir do pedido, e "Gravar" não muda nada.
 */
import { titularDaLinha, type Acordo, type Titular } from '@/lib/fiscal/produtores';
import type { ContaDoCliente, CondicaoDoHistorico, ImovelDaFazenda, ProdutoresApi, Resultado } from '@/lib/fiscal/produtoresApi';

export const FAZENDAS_PRODUTORES = [
  { id: 'fPUR', nome: 'Faz. Pureza', codigo: 'PUR', cliente_id: 'cli' },
  { id: 'fRET', nome: 'Faz. Retiro', codigo: 'RET', cliente_id: 'cli' },
  { id: 'fLON', nome: 'Fazenda Santa Maria do Exemplo Comprido', codigo: 'SMX', cliente_id: 'cli' },
];

const PROD = titularDaLinha({
  id: 't1', nome: 'Produtora Sintética Exemplo de Oliveira Campos', documento: '52998224725', documento_formatado: '529.982.247-25', tipo: 'PF', papel: 'produtor',
  cnpj_produtor: null, nascimento: '1960-05-20', email_fiscal: 'contador@exemplo.com.br', endereco: 'Rodovia Exemplo, km 100, zona rural', municipio: 'Campo Grande',
  uf: 'MS', cep: '79000000', regime_ir: 'pf_atividade_rural', ativo: true,
  ies: [{ uf: 'MS', ie: '281234567', fazenda_id: 'fPUR' }, { uf: 'MT', ie: '131234567', fazenda_id: null }],
  fazendas: [
    { fazenda_id: 'fPUR', fazenda: 'Faz. Pureza', participacao: 50, condicao: 'condomino', registra: 'so_a_parte', desde: '2020-01-01', ate: null },
    { fazenda_id: 'fRET', fazenda: 'Faz. Retiro', participacao: 100, condicao: 'proprietario', registra: 'total', desde: '2018-01-01', ate: null },
    { fazenda_id: 'fLON', fazenda: 'Fazenda Santa Maria do Exemplo Comprido', participacao: 33.3333, condicao: 'arrendatario', registra: 'total', desde: '2024-07-01', ate: null },
  ],
  condicao_ibs: { condicao: 'nao_contribuinte', desde: '2026-01-01', motivo: 'receita de 2024 abaixo do limite' },
  grupo: [{ empresa_id: 't3', empresa: 'Agropecuária Exemplo Ltda', participacao: 30, atividade: 'agropecuária', entra_no_limite: true }],
  contas: [{ conta_id: 'c1', conta: 'CC Pureza' }, { conta_id: 'c2', conta: 'CC Retiro' }], acordos: 4, pendencias: [],
});
const TERC = titularDaLinha({
  id: 't2', nome: 'Terceiro Exemplo', documento: '12345678909', documento_formatado: '123.456.789-09', tipo: 'PF', papel: 'terceiro', ativo: true,
  fazendas: [
    { fazenda_id: 'fPUR', fazenda: 'Faz. Pureza', participacao: 50, condicao: 'condomino', registra: 'total', desde: '2020-01-01', ate: null },
    { fazenda_id: 'fLON', fazenda: 'Fazenda Santa Maria do Exemplo Comprido', participacao: 66.6667, condicao: 'proprietario', registra: 'total', desde: '2024-07-01', ate: null },
  ], ies: [], grupo: [], contas: [], acordos: 4, pendencias: [],
});
const PJ = titularDaLinha({
  id: 't3', nome: 'Agropecuária Exemplo Ltda', documento: '12ABC34501DE35', documento_formatado: '12.ABC.345/01DE-35', tipo: 'PJ', papel: 'produtor', ativo: true,
  regime_ir: 'pj_presumido', email_fiscal: 'fiscal@exemplo.com.br', ies: [], fazendas: [], grupo: [], contas: [], acordos: 0,
  condicao_ibs: { condicao: 'optante', desde: '2026-07-01', motivo: 'opção pelo regime regular' },
  pendencias: ['Sem inscrição estadual', 'Endereço fiscal incompleto', 'Sem fazenda'],
});
const INATIVO = titularDaLinha({
  id: 't4', nome: 'Produtor Antigo Exemplo', documento: '11144477735', documento_formatado: '111.444.777-35', tipo: 'PF', papel: 'produtor', ativo: false,
  ies: [], fazendas: [], grupo: [], contas: [], acordos: 0, pendencias: ['Sem inscrição estadual', 'Sem fazenda'],
});
export const TITULARES_BANCADA: Titular[] = [PROD, TERC, PJ, INATIVO];

const acordo = (id: string, nome: string, parte: number | null, doc: Acordo['documento_em'], como: Acordo['como_paga'], ligados: number, soma: number): Acordo => ({
  acordo_id: id, nome, produtor_id: 't1', produtor: PROD.nome, terceiro_id: 't2', terceiro: TERC.nome, fazenda_id: 'fPUR', fazenda: 'Faz. Pureza', parte_produtor: parte,
  documento_em: doc, como_paga: como, palavras: [], vigencia_inicio: '2026-01-01', vigencia_fim: null, ativo: true, observacao: null, ligados, soma_ligados: soma, a_confirmar: parte == null ? ligados : 0,
});
const ACORDOS: Acordo[] = [
  acordo('a1', 'Rateio folha', 50, 'terceiro', 'transfere_ao_terceiro', 24, 72000),
  acordo('a2', 'Rateio 5 (despesas comuns)', 50, 'alterna', 'transfere_ao_terceiro', 3, 1840.5),
  acordo('a3', 'Rateio 15', null, 'alterna', 'transfere_ao_terceiro', 0, 0),
  acordo('a4', 'Supermercado da Fazenda Pureza com nome comprido', 70, 'alterna', 'direto', 118, 9999999.99),
];
const HISTORICO: CondicaoDoHistorico[] = [
  { id: 'h2', condicao: 'nao_contribuinte', vigencia_inicio: '2026-01-01', vigencia_fim: null, motivo: 'receita de 2024 abaixo do limite' },
  { id: 'h1', condicao: 'contribuinte_pelo_limite', vigencia_inicio: '2025-01-01', vigencia_fim: '2025-12-31', motivo: 'receita de 2023 acima do limite (com a PJ do grupo)' },
];
const IMOVEIS: ImovelDaFazenda[] = [
  { fazenda_id: 'fPUR', nirf: '12345678', ccir: '9500001234567', car: 'MS-5000000-ABCDEF' }, { fazenda_id: 'fRET', nirf: '87654321', ccir: null, car: 'MS-5000000-XYZ' },
];
const CONTAS: ContaDoCliente[] = [
  { id: 'c1', nome: 'CC Pureza', banco: 'Banco Exemplo', tipo_conta: 'cc', titular_nome: PROD.nome, titular_documento: '52998224725' },
  { id: 'c2', nome: 'CC Retiro', banco: 'Banco Dois', tipo_conta: 'cc', titular_nome: PROD.nome, titular_documento: '52998224725' },
  { id: 'c3', nome: 'Conta do grupo com nome comprido de exemplo', banco: 'Banco Três', tipo_conta: 'cc', titular_nome: null, titular_documento: null },
];

const ok = <T,>(dados: T): Promise<Resultado<T>> => Promise.resolve({ ok: true, dados });
export const API_PRODUTORES: ProdutoresApi = {
  lista: () => ok(TITULARES_BANCADA), acordos: () => ok(ACORDOS), historicoDaCondicao: () => ok(HISTORICO), imoveis: () => ok(IMOVEIS), contas: () => ok(CONTAS),
  gravarTitular: (_c, id, d) => ok({ frase: id ? 'Atualiza a ficha (CPF 529.982.247-25).' : 'Cria o produtor.',
    diferencas: Object.keys(d).map(k => ({ campo: k, antes: null, depois: d[k] })), pendencias: id ? [] : ['Sem fazenda', 'Sem condição no IBS/CBS'] }),
  gravarComposicao: (_f, inicio, partes) => ok({ frase: `Nova composição a partir de ${inicio.split('-').reverse().join('/')}.`,
    antes: [], depois: partes.map(p => ({ nome: TITULARES_BANCADA.find(t => t.id === p.titular_id)?.nome ?? '', participacao: p.participacao, registra: p.registra })),
    avisos: partes.reduce((s, p) => s + p.participacao, 0) === 100 ? [] : ['A soma não é 100%: confira se falta alguém ou se é assim mesmo.'], anterior_termina: null }),
  gravarCondicao: (_t, inicio, condicao) => ok({ frase: `Nova condição no IBS/CBS a partir de ${inicio.split('-').reverse().join('/')}.`,
    antes: { condicao: 'nao_contribuinte', inicio: '2026-01-01' }, depois: { condicao, inicio } }),
  gravarGrupo: (_t, inicio) => ok({ frase: `Novo grupo a partir de ${inicio.split('-').reverse().join('/')}.`, antes: [], depois: [] }),
  gravarContaTitular: () => ok({ frase: 'A conta passa a ser deste produtor.', antes: { titular_nome: null }, depois: { titular_nome: PROD.nome } }),
  gravarAcordo: (_c, id, d) => ok({ frase: id ? 'Atualiza o acordo.' : 'Cria o acordo.', diferencas: [{ campo: 'nome', antes: null, depois: d.nome }], avisos: ['O pagamento é uma transferência ao terceiro: confirmar com o contador.'] }),
};
