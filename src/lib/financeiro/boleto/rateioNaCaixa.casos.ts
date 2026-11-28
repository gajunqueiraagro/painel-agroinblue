/**
 * CAIXA-FOLHA-RATEIO-01 — o pacote do contador da OUTRA parte de um rateio, INVENTADO (o caso real nunca no repo, teste ou log):
 * o "Terceiro Exemplo da Silva" (CPF 111.222.333-96) divide a folha com o cliente (50%); o contador manda, de 11/2026, as folhas mensal e do
 * 13º das fazendas A e B, o DARF do INSS, a GFD e a relação do FGTS (todos em nome do terceiro) e o resumo escrito à mão (sem leitura).
 * Os lançamentos da parte do cliente seguem a regra da casa ("Pec.3M-<nome>"); há também um do próprio cliente (sem o prefixo), o
 * "INSS - 13" (que o 13º 1ª parcela não tem) e o reembolso ao terceiro no mês seguinte.
 */
import type { LeituraDaCaixa } from './lerDaCaixa';
import type { FolhaAnaliticaLida, PessoaDaAnalitica } from '@/lib/folha/lerFolhaAnalitica';
import type { GfdLida, RelacaoFgtsLida } from '@/lib/folha/lerGuiasDaFolha';
import type { LancamentoDoRateio, TerceiroDoRateio } from './rateioNaCaixa';

export const CPF_DO_TERCEIRO = '11122233396';
export const CPF_DO_CLIENTE = '99988877766';
export const TERCEIRO: TerceiroDoRateio = { acordoId: 'acordo-1', acordo: 'Rateio Folha', terceiro: 'Terceiro Exemplo da Silva', documento: CPF_DO_TERCEIRO, parteDoCliente: 50 };

const pessoa = (codigo: string, nome: string, liquido: number): PessoaDaAnalitica => ({
  codigo, nome, admissao: '2020-01-01', salarioBase: liquido, funcao: 'Trabalhador rural', centro: null, rubricas: [], proventos: liquido,
  descontos: 0, fgts: 0, liquido, inss: 0, irrf: 0, confere: true, pagina: 1,
});
const folha = (empresa: string, tipo: FolhaAnaliticaLida['tipo'], pessoas: PessoaDaAnalitica[]): FolhaAnaliticaLida => {
  const liquido = pessoas.reduce((s, p) => s + (p.liquido ?? 0), 0);
  return { empresa, competencia: '2026-11', tipo, emissao: '2026-11-27', pessoas,
    soma: { funcionarios: pessoas.length, proventos: liquido, descontos: 0, liquido, fgts: 0, inss: 0, irrf: 0 }, resumo: null, confere: true, naoConfere: [] };
};
const A = [pessoa('00001', 'ANA EXEMPLO', 2000), pessoa('00002', 'BRUNO EXEMPLO', 1800)];
const B = [pessoa('00003', 'CARLA EXEMPLO', 3000)];
const GFD: GfdLida = {
  competencia: '2026-11', vencimento: '2026-12-18', valor: 900, identificador: null, trabalhadores: 3, mensal: 900, rescisorio: 0, indenizacao: 0,
  encargos: 0, total: 900, pix: null, empregador: { documento: CPF_DO_TERCEIRO, nome: 'TERCEIRO EXEMPLO DA SILVA' }, confere: true, naoConfere: [],
};
const RELACAO: RelacaoFgtsLida = {
  competencia: '2026-11', vencimento: '2026-12-18', totalGuia: 900, estabelecimentos: [], empregador: { documento: CPF_DO_TERCEIRO, nome: 'TERCEIRO EXEMPLO DA SILVA' },
  confere: true, naoConfere: [],
};
const COD_DARF = '8'.repeat(44);

/** nome do arquivo → a leitura (o leitor falso do teste) */
export const PACOTE: Record<string, LeituraDaCaixa> = {
  'folha A nov.pdf': { k: 'analitica', analitica: folha('TERCEIRO EXEMPLO DA SILVA FAZENDA A', 'mensal', A) },
  'folha B nov.pdf': { k: 'analitica', analitica: folha('TERCEIRO EXEMPLO DA SILVA FAZENDA B', 'mensal', B) },
  '13 A nov.pdf': { k: 'analitica', analitica: folha('TERCEIRO EXEMPLO DA SILVA FAZENDA A', '13_1', A) },
  '13 B nov.pdf': { k: 'analitica', analitica: folha('TERCEIRO EXEMPLO DA SILVA FAZENDA B', '13_1', B) },
  'darf inss nov.pdf': {
    k: 'boletos', boletos: [{ ok: true, codigo_barras: COD_DARF, linha: '8'.repeat(48), tipo: 'arrecadacao', banco: null, valor: 1500, vencimento: '2026-12-18' }],
    beneficiario: { documento: null, nome: 'Receita Federal', confira: true }, pagador: { documento: CPF_DO_TERCEIRO, nome: 'TERCEIRO EXEMPLO DA SILVA', confira: false },
  },
  'gfd nov.pdf': { k: 'gfd', gfd: GFD },
  'relacao fgts nov.pdf': { k: 'relacao', relacao: RELACAO },
  'resumo a mao.pdf': { k: 'nada', frase: 'O PDF é uma imagem (escaneado): sem linha digitável nem chave legível.' },
};

const l = (id: string, descricao: string, favorecido: string, valor: number, competencia = '2026-11', vencimento = '2026-12-05', status = 'programado'): LancamentoDoRateio =>
  ({ id, descricao, favorecido, valor, competencia, vencimento, status });
export const LANCAMENTOS: LancamentoDoRateio[] = [
  l('sal-ana', 'Folha Pagamento', 'Pec.3M-Ana Exemplo', 1000), l('sal-bruno', 'Folha Pagamento', 'Pec.3M-Bruno Exemplo', 900),
  l('sal-carla', 'Folha Pagamento', 'Pec.3M-Carla Exemplo', 1500), l('fora-carla', 'Folha Pagamento - pago fora da folha', 'Pec.3M-Carla Exemplo', 300),
  l('13-ana', 'Folha Pagamento - 13', 'Pec.3M-Ana Exemplo', 500), l('13-bruno', 'Folha Pagamento - 13', 'Pec.3M-Bruno Exemplo', 450),
  l('13-carla', 'Folha Pagamento - 13', 'Pec.3M-Carla Exemplo', 750),
  l('inss-1', 'INSS', 'Pec.3M-Receita Federal', 600, '2026-11', '2026-12-18'), l('inss-2', 'INSS', 'Pec.3M-Receita Federal', 150, '2026-11', '2026-12-18'),
  l('inss-13', 'INSS - 13', 'Pec.3M-Receita Federal', 100),
  l('fgts-1', 'FGTS', 'Pec.3M-Receita Federal', 300, '2026-11', '2026-12-18'), l('fgts-2', 'FGTS', 'Pec.3M-Receita Federal', 40, '2026-11', '2026-12-18'),
  l('fgts13-1', 'FGTS - 13', 'Pec.3M-Receita Federal', 100, '2026-11', '2026-12-18'), l('fgts13-2', 'FGTS - 13', 'Pec.3M-Receita Federal', 10, '2026-11', '2026-12-18'),
  /* a folha PRÓPRIA do cliente (sem o prefixo do rateio): nunca recebe o documento do terceiro */
  l('proprio', 'Folha Pagamento', 'Ana Exemplo', 2000),
  l('fgts-proprio', 'FGTS', 'Receita Federal', 160, '2026-11', '2026-12-18'),
  /* o reembolso ao terceiro: o mês seguinte, ainda não pago; o do mês anterior já pago não conta */
  l('reembolso', 'Rateio Folha Pagamento', 'Terceiro Exemplo da Silva', 5550, '2026-12', '2026-12-04'),
  /* outro repasse ao MESMO terceiro aberto no mesmo mês (não é o da folha: a descrição não traz o nome do acordo) */
  l('outro-repasse', 'Rateio Outra Despesa', 'Terceiro Exemplo da Silva', 700, '2026-12', '2026-12-04', 'previsto'),
  l('reembolso-out', 'Rateio Folha Pagamento', 'Terceiro Exemplo da Silva', 5000, '2026-11', '2026-11-03', 'realizado'),
  /* um adiantamento do reembolso já pago no próprio mês seguinte: não é o que fica em aberto */
  l('reembolso-adiantado', 'Rateio Folha Pagamento', 'Terceiro Exemplo da Silva', 500, '2026-12', '2026-12-01', 'realizado'),
];
