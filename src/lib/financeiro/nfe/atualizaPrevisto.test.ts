/**
 * NOTA-ATUALIZA-PREVISTO-01 — o caso REAL (Gabriel 06/11 17:30): NF 69.134 série 2, emissão 07/10/2026, R$ 2.230,60, 1 parcela (sem duplicata:
 * venc. = emissão); no sistema o PREVISTO "Supermercado-BG (70%)" de R$ 1.000,00, venc. 05/11/2026 (Vera, Faz. Baia Grande). A Vera paga 70%.
 */
import { describe, expect, it } from 'vitest';
import type { LancamentoJaLancado, LinhaSistemaNota } from './jaLancada';
import { ePrevistoEmAberto, participacaoDoHistorico, previstosQueAtualizam, valorPelaParticipacao } from './atualizaPrevisto';

const PREVISTO_VERA: LancamentoJaLancado = {
  id: 'c9783890', vencimento: '2026-11-05', pagamento: null, competencia: '2026-10-05', descricao: 'Supermercado-BG (70%)', valorCent: 100000,
  status: 'previsto', conciliado: false, financiamentoId: null, numeroDocumento: null, fornecedorId: 'cleodir', fornecedorNome: 'Cleodir Supermercados Eireli-EPP',
  fornecedorPor: 'cnpj', parcelas: [], por: ['lancamento'], cancelado: false,
};
const linha = (l: LancamentoJaLancado): LinhaSistemaNota => ({ chave: l.id, rotulo: '—', sistema: l, notaVencimento: null, notaValorCent: null,
  situacao: 'so_no_sistema', difValor: false, difData: false });
const PARCELA_DA_NOTA = { n: 1, vencimento: '2026-10-07', valorCent: 223060 };
const base = { linhas: [linha(PREVISTO_VERA)], recebeANota: () => true, faltam: [PARCELA_DA_NOTA], duplicatasComData: false, emissao: '2026-10-07' };

describe('NOTA-ATUALIZA-PREVISTO-01 — a nota atualiza o previsto', () => {
  it('R1+R3: o previsto da Vera vai de 1.000,00 para 1.561,42 (70% de 2.230,60); os 30% (669,18) são de outro; a parcela não nasce', () => {
    const [par, ...resto] = previstosQueAtualizam({ ...base, participacaoPct: 70 });
    expect(resto).toEqual([]);
    expect(par).toEqual({ lancamentoId: 'c9783890', parcelaN: 1, valorAntigoCent: 100000, valorNovoCent: 156142, parcelaCent: 223060,
      parteDeOutroCent: 66918, vencimentoQueFica: '2026-11-05', vencimentoMuda: false });
  });
  it('R3 padrão 100%: o previsto leva a parcela inteira (2.230,60) e ninguém mais paga', () => {
    const [par] = previstosQueAtualizam({ ...base, participacaoPct: 100 });
    expect(par.valorNovoCent).toBe(223060);
    expect(par.parteDeOutroCent).toBe(0);
  });
  it('R2: sem duplicata (venc. = emissão) fica o vencimento do previsto; duplicata com data própria vale a da nota', () => {
    expect(previstosQueAtualizam({ ...base, participacaoPct: 70 })[0].vencimentoQueFica).toBe('2026-11-05');
    /* a duplicata com a data da emissão continua "à vista no papel" */
    expect(previstosQueAtualizam({ ...base, duplicatasComData: true, participacaoPct: 70 })[0].vencimentoMuda).toBe(false);
    const comData = previstosQueAtualizam({ ...base, duplicatasComData: true, faltam: [{ ...PARCELA_DA_NOTA, vencimento: '2026-11-20' }], participacaoPct: 70 })[0];
    expect(comData.vencimentoQueFica).toBe('2026-11-20');
    expect(comData.vencimentoMuda).toBe(true);
  });
  it('R4: o pago, o conciliado, o programado e o que não recebe a nota nunca são atualizados', () => {
    const casos: Partial<LancamentoJaLancado>[] = [{ status: 'realizado', pagamento: '2026-11-05' }, { conciliado: true }, { status: 'programado' },
      { pagamento: '2026-11-05' }, { cancelado: true }];
    for (const c of casos) expect(previstosQueAtualizam({ ...base, linhas: [linha({ ...PREVISTO_VERA, ...c })], participacaoPct: 70 })).toEqual([]);
    expect(previstosQueAtualizam({ ...base, recebeANota: () => false, participacaoPct: 70 })).toEqual([]);
    expect(ePrevistoEmAberto(PREVISTO_VERA)).toBe(true);
  });
  it('dois previstos e duas parcelas: casam na ordem do vencimento; previsto a mais fica como está', () => {
    const p2 = { ...PREVISTO_VERA, id: 'p2', vencimento: '2026-12-05' };
    const p1 = { ...PREVISTO_VERA, id: 'p1', vencimento: '2026-11-05' };
    const pares = previstosQueAtualizam({ ...base, linhas: [linha(p2), linha(p1)], faltam: [{ ...PARCELA_DA_NOTA, n: 2 }, PARCELA_DA_NOTA], participacaoPct: 100 });
    expect(pares.map((x) => [x.lancamentoId, x.parcelaN])).toEqual([['p1', 1], ['p2', 2]]);
    expect(previstosQueAtualizam({ ...base, linhas: [linha(p2), linha(p1)], participacaoPct: 100 }).map((x) => x.lancamentoId)).toEqual(['p1']);
  });
  it('valorPelaParticipacao: centavo arredondado; fora de (0, 100) = a parcela inteira', () => {
    expect(valorPelaParticipacao(223060, 70)).toBe(156142);
    expect(valorPelaParticipacao(223060, 100)).toBe(223060);
    expect(valorPelaParticipacao(223060, 0)).toBe(223060);
    expect(valorPelaParticipacao(1, 50)).toBe(1);
  });
  it('a sugestão do % sai do HISTÓRICO (os 4 últimos pagos da Vera a este fornecedor: 70,00%), nunca da descrição', () => {
    /* os reais do proto: 1.586,73/2.266,76 · 1.391,63/1.988,05 · 1.650,13/2.357,33 · 1.692,17/2.417,39 */
    expect(participacaoDoHistorico([{ lancamentoCent: 158673, documentoCent: 226676 }, { lancamentoCent: 139163, documentoCent: 198805 },
      { lancamentoCent: 165013, documentoCent: 235733 }, { lancamentoCent: 169217, documentoCent: 241739 }])).toBe(70);
    /* discordam, poucos ou 100%: não sugere */
    expect(participacaoDoHistorico([{ lancamentoCent: 158673, documentoCent: 226676 }, { lancamentoCent: 152668, documentoCent: 152668 },
      { lancamentoCent: 165013, documentoCent: 235733 }])).toBeNull();
    expect(participacaoDoHistorico([{ lancamentoCent: 158673, documentoCent: 226676 }])).toBeNull();
    expect(participacaoDoHistorico([1, 2, 3].map(() => ({ lancamentoCent: 1000, documentoCent: 1000 })))).toBeNull();
  });
});
