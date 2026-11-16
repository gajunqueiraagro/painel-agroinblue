/**
 * OC-SALVAR-RODAPE-01 (D1–D4) — fechar a OC com pendência pergunta; o "Salvar e fechar" grava dados → negociação pelos gravadores de
 * hoje, passa a versão de um para o outro e para na 1ª recusa. E a base dos dados do abate (o que conta como "dados alterados").
 */
import { describe, it, expect, vi } from 'vitest';
import {
  dadosDoAbateDaOperacao, dadosDoAbateNovo, assinaturaDosDadosDoAbate, estadoDoRodape, passosPendentes, salvarEmOrdem, temPendencia,
} from './fecharOC';

describe('o que o "Salvar e fechar" grava', () => {
  it('aberta: dados antes da negociação; só o que está sujo', () => {
    expect(passosPendentes({ status: 'programada', dadosSujos: true, negociacaoSuja: true })).toEqual(['dados', 'negociacao']);
    expect(passosPendentes({ status: 'programada', dadosSujos: false, negociacaoSuja: true })).toEqual(['negociacao']);
    expect(passosPendentes({ status: null, dadosSujos: true, negociacaoSuja: false })).toEqual(['dados']);
  });
  it('fechada: só os cadastrais (a negociação está congelada); cancelada: nada', () => {
    expect(passosPendentes({ status: 'fechada', dadosSujos: true, negociacaoSuja: true })).toEqual(['dados']);
    expect(passosPendentes({ status: 'fechada', dadosSujos: false, negociacaoSuja: true })).toEqual([]);
    expect(passosPendentes({ status: 'cancelada', dadosSujos: true, negociacaoSuja: true })).toEqual([]);
  });
  it('sem nada pendente não há pergunta', () => {
    expect(temPendencia({ status: 'programada', dadosSujos: false, negociacaoSuja: false })).toBe(false);
    expect(temPendencia({ status: 'programada', dadosSujos: false, negociacaoSuja: true })).toBe(true);
  });
});

describe('salvarEmOrdem', () => {
  it('a versão que os dados devolvem entra na negociação', async () => {
    const executar = vi.fn(async (passo: string) => (passo === 'dados' ? 12 : 13));
    expect(await salvarEmOrdem(['dados', 'negociacao'], executar)).toEqual({ ok: true });
    expect(executar.mock.calls).toEqual([['dados', undefined], ['negociacao', 12]]);
  });
  it('para na 1ª recusa: a negociação não é chamada e a OC não fecha', async () => {
    const executar = vi.fn(async () => false);
    expect(await salvarEmOrdem(['dados', 'negociacao'], executar)).toEqual({ ok: false, parouEm: 'dados' });
    expect(executar).toHaveBeenCalledTimes(1);
  });
  it('"true" é gravou (fechada: a versão fica no estado); null é recusa', async () => {
    expect(await salvarEmOrdem(['dados'], async () => true)).toEqual({ ok: true });
    expect(await salvarEmOrdem(['negociacao'], async () => null)).toEqual({ ok: false, parouEm: 'negociacao' });
  });
});

describe('o estado do rodapé', () => {
  it('pendente manda; depois a hora do último salvar; sem nada, "Sem alterações"', () => {
    expect(estadoDoRodape(true, '19:52')).toEqual({ texto: 'Alterações não salvas', tom: 'pendente' });
    expect(estadoDoRodape(false, '19:52')).toEqual({ texto: 'Salvo às 19:52', tom: 'salvo' });
    expect(estadoDoRodape(false, null)).toEqual({ texto: 'Sem alterações', tom: 'neutro' });
  });
});

describe('a base dos dados do abate', () => {
  const agora = new Date(2026, 10, 14, 20, 5);
  it('OC nova: a data de hoje e o resto vazio — igual à tela recém-aberta', () => {
    expect(dadosDoAbateNovo(agora)).toBe(assinaturaDosDadosDoAbate({ frigorifico: '', data: '2026-11-14', fazenda: '', observacao: '', notaFiscal: '' }));
  });
  it('OC do banco: o que a hidratação põe na tela (nulo = vazio)', () => {
    const op = { contraparte_id: 'fort', data_operacao: '2026-11-12', fazenda_id: 'pureza', observacoes: null, numero_documento: '9219' };
    expect(dadosDoAbateDaOperacao(op, agora)).toBe(assinaturaDosDadosDoAbate({ frigorifico: 'fort', data: '2026-11-12', fazenda: 'pureza', observacao: '', notaFiscal: '9219' }));
  });
  it('mudar a fazenda é mudar os dados', () => {
    const base = { frigorifico: 'fort', data: '2026-11-12', fazenda: 'pureza', observacao: '', notaFiscal: '' };
    expect(assinaturaDosDadosDoAbate({ ...base, fazenda: 'luzia' })).not.toBe(assinaturaDosDadosDoAbate(base));
  });
});
