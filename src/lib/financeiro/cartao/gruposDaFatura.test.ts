/**
 * CARTAO-FATURA-IMPORT-01 (mock aprovado 23/11) — os grupos da prévia da fatura e "o que o sistema vai fazer". Dado SINTÉTICO.
 */
import { describe, expect, it } from 'vitest';
import type { FaturaLida, LinhaDaFatura } from './lerFaturaOurocard';
import { linhasDaFatura, type LancamentoNoCartao } from './linhasDaFatura';
import { gruposDaFatura, ROTULO_DO_GRUPO } from './gruposDaFatura';

const L = (o: Partial<LinhaDaFatura> & Pick<LinhaDaFatura, 'ordem' | 'descricao' | 'valorCent' | 'dataCompra'>): LinhaDaFatura =>
  ({ secao: 'Compras', pais: 'BR', parcela: null, exterior: null, tipo: 'compra', titular: 'Titular Exemplo', finalCartao: '0001', ...o });
const E = (o: Partial<LancamentoNoCartao> & Pick<LancamentoNoCartao, 'id' | 'valorCent'>): LancamentoNoCartao =>
  ({ contaId: 'cartao', vencimento: '2031-10-16', competencia: null, descricao: '—', fornecedor: null, parcela: null, status: 'programado', ...o });

const FATURA: FaturaLida = {
  produto: 'CARTAO EXEMPLO', finalCartao: '0001', titular: 'Titular Exemplo', vencimento: '2031-10-16', fechamento: '2031-10-05',
  totalCent: 0, saldoAnteriorCent: 0, somaConfere: true, avisos: [],
  linhas: [
    L({ ordem: 1, descricao: 'POSTO EXEMPLO', valorCent: 12000, dataCompra: '2031-09-16' }),
    L({ ordem: 2, descricao: 'LOJA TRATORES PARC 03/04', valorCent: 86000, dataCompra: '2031-07-02', parcela: { k: 3, n: 4 } }),
    L({ ordem: 3, descricao: 'BELEZA EXEMPLO PARC 02/03', valorCent: 70826, dataCompra: '2031-08-20', parcela: { k: 2, n: 3 } }),
    L({ ordem: 4, descricao: 'MAQUINAS EXEMPLO', valorCent: 73000, dataCompra: '2031-09-22' }),
    L({ ordem: 5, descricao: 'SUPERMERCADO EXEMPLO', valorCent: 41290, dataCompra: '2031-09-28' }),
    L({ ordem: 6, descricao: 'LOJA SEM HISTORICO', valorCent: 18410, dataCompra: '2031-10-01' }),
    L({ ordem: 7, descricao: 'IOF COMPRA EXTERIOR', valorCent: 350, dataCompra: '2031-10-01', tipo: 'iof' }),
    L({ ordem: 8, descricao: 'ANUIDADE DIFERENCIADA', valorCent: 1800, dataCompra: '2031-10-02', tipo: 'anuidade' }),
    L({ ordem: 9, descricao: 'PGTO DEBITO CONTA', valorCent: -1678285, dataCompra: '2031-09-16', tipo: 'pagamento', secao: 'Pagamentos/Créditos' }),
  ],
};
const EXISTENTES = [
  E({ id: 'posto', valorCent: 12000, competencia: '2031-09-16', descricao: 'Combustível' }),
  E({ id: 'trator', valorCent: 86000, competencia: '2031-07-02', descricao: 'Manutenção 3/4', parcela: { k: 3, n: 4 } }),
  E({ id: 'beleza', valorCent: 44825, competencia: '2031-08-20', descricao: 'Beleza exemplo 2/3', parcela: { k: 2, n: 3 } }),
  E({ id: 'maq', valorCent: 73000, competencia: '2031-09-22', descricao: 'Peças', contaId: 'outro-cartao', vencimento: '2031-10-10' }),
];
const NOMES: Record<string, string> = { cartao: 'Cartão Exemplo', 'outro-cartao': 'Cartão Outro' };
const g = () => gruposDaFatura(linhasDaFatura(FATURA, 'cartao', EXISTENTES), {
  contaDaFatura: 'cartao', nomeDaConta: (id) => NOMES[id] ?? id,
  sugestaoDe: (l) => (l.descricao.includes('SUPERMERCADO') ? { planoContaId: 'p-alim', rotulo: 'Alimentação e Cantina' } : null),
});

describe('CARTAO-FATURA-IMPORT-01 — os grupos da prévia', () => {
  it('G1 cada linha no seu grupo, com "o que o sistema vai fazer"', () => {
    const r = g();
    expect(r.linhas.map((x) => [x.linha.ordem, x.grupo, x.gesto, x.oQueFaz])).toEqual([
      [1, 'ja_lancado', 'nada', 'casado com o lançamento de 16/09'],
      [2, 'parcela_casa', 'nada', 'casa com a parcela 3/4 da compra'],
      [3, 'diferenca', 'ajustar', 'parcela 2/3 lançada com 448,25 · ajustar?'],
      [4, 'mover', 'mover', 'está em Cartão Outro venc. 10/10 → mover para este cartão'],
      [5, 'nova_sugestao', 'lancar', 'lançar · sugestão do mesmo estabelecimento (12 m)'],
      [6, 'nova_classificar', 'lancar', 'escolher a conta'],
      [7, 'encargos', 'lancar', 'lançar'],
      [8, 'encargos', 'lancar', 'lançar'],
      [9, 'pagamento', 'transferencia', 'transferência · casa com o débito no banco'],
    ]);
    expect(r.linhas[4].contaSugerida).toBe('Alimentação e Cantina');
    /* D5 (CARTAO-FATURA-GRAVAR): sem histórico e sem a conta dos encargos no plano = nada sugerido ("—"), nunca um nome inventado */
    expect(r.linhas[6].contaSugerida).toBe('—');
  });
  it('G2 a contagem por grupo (os selos) e o rodapé', () => {
    const r = g();
    expect(r.contagem).toEqual({ ja_lancado: 1, parcela_casa: 1, diferenca: 1, mover: 1, nova_sugestao: 1, nova_classificar: 1, encargos: 2, pagamento: 1 });
    expect(r.rodape).toBe('9 linhas: 3 casadas · 1 mover · 1 ajustar · 4 lançar');
    expect(ROTULO_DO_GRUPO.mover).toBe('Lançado em outro cartão/conta');
  });
  it('G3 o pagamento da fatura NUNCA vira saída; o estorno não é pagamento', () => {
    const credito = L({ ordem: 10, descricao: 'ESTORNO LOJA', valorCent: -5000, dataCompra: '2031-09-30', tipo: 'credito' });
    const r = gruposDaFatura(linhasDaFatura({ ...FATURA, linhas: [FATURA.linhas[8], credito] }, 'cartao', []), { contaDaFatura: 'cartao', nomeDaConta: (id) => id, sugestaoDe: () => null });
    expect(r.linhas.map((x) => [x.grupo, x.gesto])).toEqual([['pagamento', 'transferencia'], ['nova_classificar', 'lancar']]);
  });
  it('G4 anuidade: com o desconto na fatura, o par se anula (nada); sozinha, é cobrança (lança)', () => {
    const anuidade = L({ ordem: 11, descricao: 'ANUIDADE', valorCent: 3750, dataCompra: '2031-10-02', tipo: 'anuidade' });
    const desconto = L({ ordem: 12, descricao: 'DESC AUTOMATICO ANUD', valorCent: -3750, dataCompra: '2031-10-02', tipo: 'desconto_anuidade' });
    const op = { contaDaFatura: 'cartao', nomeDaConta: (id: string) => id, sugestaoDe: () => null };
    const par = gruposDaFatura(linhasDaFatura({ ...FATURA, linhas: [anuidade, desconto] }, 'cartao', []), op);
    expect(par.linhas.map((x) => x.gesto)).toEqual(['nada', 'nada']);
    /* D5: a anuidade cobrada vai à conta dos encargos do plano ("Despesas Financeiras Administrativo") quando não há histórico */
    const dfa = { planoContaId: 'p-dfa', rotulo: 'Despesas Financeiras Administrativo' };
    const so = gruposDaFatura(linhasDaFatura({ ...FATURA, linhas: [anuidade] }, 'cartao', []), { ...op, contaDosEncargos: dfa });
    expect(so.linhas.map((x) => [x.grupo, x.gesto, x.contaSugerida, x.sugestao?.planoContaId])).toEqual([['encargos', 'lancar', 'Despesas Financeiras Administrativo', 'p-dfa']]);
  });
});
