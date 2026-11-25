/**
 * CARTAO-FATURA-GRAVAR — a regra pura do "Gravar N prontas" (o pedido da `fn_fatura_cartao_gravar`, lote 118540) e a leitura da resposta.
 * Dado SINTÉTICO.
 */
import { describe, expect, it } from 'vitest';
import type { FaturaLida, LinhaDaFatura } from './lerFaturaOurocard';
import type { LancamentoNoCartao } from './linhasDaFatura';
import type { GruposDaFatura, LinhaDoGrupo } from './gruposDaFatura';
import {
  FRASE_SEM_LEITURA, FRASE_SO_VENCIMENTO, descricaoDoLancamento, escolhaDaLinha, estadoDaLinha, fraseDoDesfazer, fraseDoGravar, pedidoDoGravar,
  respostaDoDesfazer, respostaDoGravar, type Escolha,
} from './gravarDaFatura';

const L = (o: Partial<LinhaDaFatura> & Pick<LinhaDaFatura, 'ordem' | 'descricao' | 'valorCent'>): LinhaDaFatura =>
  ({ secao: '', dataCompra: '2031-09-10', pais: null, parcela: null, exterior: null, tipo: 'compra', titular: null, finalCartao: '1234', ...o });
const E = (o: Partial<LancamentoNoCartao> & Pick<LancamentoNoCartao, 'id' | 'valorCent'>): LancamentoNoCartao =>
  ({ contaId: 'cartao', vencimento: '2031-10-16', competencia: '2031-09-10', descricao: '—', fornecedor: null, parcela: null, status: 'programado',
    atualizadoEm: '2031-10-01T10:00:00.123456+00:00', ...o });
const G = (o: Partial<LinhaDoGrupo> & Pick<LinhaDoGrupo, 'linha' | 'gesto'>): LinhaDoGrupo =>
  ({ grupo: 'nova_classificar', existente: null, sugestao: null, contaSugerida: '—', oQueFaz: '', ...o });
const SEM: ReadonlyMap<number, Escolha> = new Map();
const PRONTA: Escolha = { planoContaId: 'p1', fazendaId: 'faz-a' };
const NADA: Escolha = { planoContaId: null, fazendaId: null };

describe('a linha no "Gravar"', () => {
  it('R1 lançar: falta conta / fazenda / as duas; pronta = saída no cartão com valor positivo, data da compra e a conta e a fazenda', () => {
    const x = G({ linha: L({ ordem: 3, descricao: 'LOJA EXEMPLO', valorCent: 15610 }), gesto: 'lancar' });
    expect(estadoDaLinha(x, { planoContaId: null, fazendaId: null }, 'cartao')).toEqual({ k: 'falta', falta: 'conta e fazenda' });
    expect(estadoDaLinha(x, { planoContaId: 'p1', fazendaId: null }, 'cartao')).toEqual({ k: 'falta', falta: 'fazenda' });
    expect(estadoDaLinha(x, { planoContaId: null, fazendaId: 'faz-a' }, 'cartao')).toEqual({ k: 'falta', falta: 'conta' });
    expect(estadoDaLinha(x, PRONTA, 'cartao')).toEqual({ k: 'pronta', item: { ordem: 3, gesto: 'lancar', data_compra: '2031-09-10',
      descricao: 'LOJA EXEMPLO', valor: 156.1, tipo: 'saida', plano_conta_id: 'p1', fazenda_id: 'faz-a' } });
  });
  it('R2 o estorno (crédito na fatura) é ENTRADA no cartão, com o valor positivo', () => {
    const x = G({ linha: L({ ordem: 4, descricao: 'ESTORNO LOJA', valorCent: -5000, tipo: 'credito' }), gesto: 'lancar' });
    const s = estadoDaLinha(x, PRONTA, 'cartao');
    expect(s.k === 'pronta' && s.item.gesto === 'lancar' ? [s.item.tipo, s.item.valor] : null).toEqual(['entrada', 50]);
  });
  it('R3 a parcela de coluna própria (Sicredi) entra como "k/N" no fim; a que já traz o k/N (Ourocard "PARC 03/04") não repete', () => {
    expect(descricaoDoLancamento(L({ ordem: 1, descricao: 'Loja de Pecas  Exemplo', valorCent: 1, parcela: { k: 2, n: 3 } }))).toBe('Loja de Pecas Exemplo 2/3');
    expect(descricaoDoLancamento(L({ ordem: 1, descricao: 'MAQUINAS PARC 03/04 CAMPO GRANDE', valorCent: 1, parcela: { k: 3, n: 4 } }))).toBe('MAQUINAS PARC 03/04 CAMPO GRANDE');
    expect(descricaoDoLancamento(L({ ordem: 1, descricao: 'POSTO', valorCent: 1 }))).toBe('POSTO');
  });
  it('R4 mover: o lançamento de OUTRA conta vem para o cartão com o lido_em; o valor da fatura só quando difere (D4)', () => {
    const linha = L({ ordem: 5, descricao: 'MAQUINAS', valorCent: 73000 });
    const igual = G({ linha, gesto: 'mover', existente: E({ id: 'm1', valorCent: 73000, contaId: 'cc' }) });
    expect(estadoDaLinha(igual, NADA, 'cartao')).toEqual({ k: 'pronta', item: { ordem: 5, gesto: 'mover', lancamento_id: 'm1', lido_em: '2031-10-01T10:00:00.123456+00:00' } });
    const outro = G({ linha, gesto: 'ajustar', existente: E({ id: 'm2', valorCent: 72000, contaId: 'outro-cartao' }) });
    /* "ajustar" fora do cartão o banco recusa ("outra_conta"): vai como MOVER com o valor */
    expect(estadoDaLinha(outro, NADA, 'cartao')).toMatchObject({ k: 'pronta', item: { gesto: 'mover', lancamento_id: 'm2', valor: 730 } });
  });
  it('R5 ajustar: no próprio cartão com outro valor; mesmo valor (só vencimento ou k/N) = resolver no Editar; sem lido_em = ler de novo', () => {
    const linha = L({ ordem: 6, descricao: 'REVESTIMENTOS PARC 02/03', valorCent: 70826, parcela: { k: 2, n: 3 } });
    expect(estadoDaLinha(G({ linha, gesto: 'ajustar', existente: E({ id: 'a1', valorCent: 44825 }) }), NADA, 'cartao'))
      .toEqual({ k: 'pronta', item: { ordem: 6, gesto: 'ajustar', lancamento_id: 'a1', lido_em: '2031-10-01T10:00:00.123456+00:00', valor: 708.26 } });
    expect(estadoDaLinha(G({ linha, gesto: 'ajustar', existente: E({ id: 'a2', valorCent: 70826, vencimento: '2031-11-16' }) }), NADA, 'cartao'))
      .toEqual({ k: 'editar', frase: FRASE_SO_VENCIMENTO });
    expect(estadoDaLinha(G({ linha, gesto: 'ajustar', existente: E({ id: 'a3', valorCent: 1, atualizadoEm: null }) }), NADA, 'cartao'))
      .toEqual({ k: 'editar', frase: FRASE_SEM_LEITURA });
  });
  it('R6 já lançado, parcela casa e o pagamento (D6) = nada a gravar', () => {
    expect(estadoDaLinha(G({ linha: L({ ordem: 7, descricao: 'X', valorCent: 1 }), gesto: 'nada' }), PRONTA, 'cartao')).toEqual({ k: 'nada' });
    expect(estadoDaLinha(G({ linha: L({ ordem: 8, descricao: 'PGTO', valorCent: -1, tipo: 'pagamento' }), gesto: 'transferencia' }), PRONTA, 'cartao')).toEqual({ k: 'nada' });
  });
  it('R7 a escolha: a do operador > a sugestão (conta E fazenda do histórico, D1); a conta administrativa FORÇA a fazenda', () => {
    const x = G({ linha: L({ ordem: 9, descricao: 'POSTO', valorCent: 1 }), gesto: 'lancar', sugestao: { planoContaId: 'p-comb', rotulo: 'Combustível', fazendaId: 'faz-a' } });
    expect(escolhaDaLinha(x, SEM)).toEqual({ planoContaId: 'p-comb', fazendaId: 'faz-a' });
    expect(escolhaDaLinha(x, new Map([[9, { planoContaId: 'p-outra', fazendaId: null }]]))).toEqual({ planoContaId: 'p-outra', fazendaId: 'faz-a' });
    const forca = (id: string) => (id === 'p-adm' ? 'faz-adm' : null);
    expect(escolhaDaLinha(x, new Map([[9, { planoContaId: 'p-adm', fazendaId: 'faz-b' }]]), forca)).toEqual({ planoContaId: 'p-adm', fazendaId: 'faz-adm' });
    expect(escolhaDaLinha(x, SEM, forca)).toEqual({ planoContaId: 'p-comb', fazendaId: 'faz-a' });
  });
});

describe('o pedido e a resposta', () => {
  const FATURA: FaturaLida = { produto: 'X', finalCartao: '1234', titular: null, vencimento: '2031-10-16', fechamento: null, totalCent: 123456,
    saldoAnteriorCent: 0, somaConfere: true, avisos: [], linhas: [] };
  const linhas: LinhaDoGrupo[] = [
    G({ linha: L({ ordem: 1, descricao: 'A', valorCent: 100 }), gesto: 'lancar', sugestao: { planoContaId: 'p1', rotulo: 'P1', fazendaId: 'faz-a' } }),
    G({ linha: L({ ordem: 2, descricao: 'B', valorCent: 200 }), gesto: 'lancar' }),
    G({ linha: L({ ordem: 3, descricao: 'C', valorCent: 300 }), gesto: 'mover', existente: E({ id: 'm', valorCent: 300, contaId: 'cc' }) }),
    G({ linha: L({ ordem: 4, descricao: 'D', valorCent: 400 }), gesto: 'nada' }),
  ];
  const g: GruposDaFatura = { linhas, contagem: { ja_lancado: 0, parcela_casa: 0, diferenca: 0, mover: 0, nova_sugestao: 0, nova_classificar: 0, encargos: 0, pagamento: 0 }, rodape: '' };
  it('P1 só as PRONTAS vão (D2); a incompleta fica listada; a recusada desta leitura sai; a fatura leva hash, vencimento e total em reais', () => {
    const p = pedidoDoGravar(FATURA, g, { contaDaFatura: 'cartao', escolhas: SEM, hash: 'h'.repeat(32), arquivo: 'fatura.pdf' });
    expect(p.itens.map((i) => [i.ordem, i.gesto])).toEqual([[1, 'lancar'], [3, 'mover']]);
    expect(p.incompletas).toEqual([2]);
    expect(p.fatura).toEqual({ hash: 'h'.repeat(32), arquivo: 'fatura.pdf', final: '1234', fechamento: null, vencimento: '2031-10-16', total: 1234.56 });
    expect(pedidoDoGravar(FATURA, g, { contaDaFatura: 'cartao', escolhas: SEM, hash: 'h', arquivo: 'f', fora: new Set([3]) }).itens.map((i) => i.ordem)).toEqual([1]);
    const completa = pedidoDoGravar(FATURA, g, { contaDaFatura: 'cartao', escolhas: new Map([[2, PRONTA]]), hash: 'h', arquivo: 'f' });
    expect([completa.itens.map((i) => i.ordem), completa.incompletas]).toEqual([[1, 2, 3], []]);
  });
  it('P2 a resposta: a recusa POR LINHA (ordem → frase), a recusa da fatura, os números; o que não entendo = null', () => {
    const r = respostaDoGravar({ ok: false, simulado: true, recusadas: 1, itens: [
      { ordem: 1, gesto: 'lancar', lancamento_id: null, recusa: null },
      { ordem: 3, gesto: 'mover', lancamento_id: 'm', recusa: { motivo: 'realizado', frase: 'Já está realizado: resolva no Editar.' } }] });
    expect(r?.ok).toBe(false);
    expect([...(r?.recusas ?? new Map())]).toEqual([[3, { motivo: 'realizado', frase: 'Já está realizado: resolva no Editar.' }]]);
    const ok = respostaDoGravar({ ok: true, simulado: false, gravacao_id: 'g1', lancar: 12, mover: 3, ajustar: 0, soma: '4526.58', itens: [] });
    expect(ok).toMatchObject({ ok: true, gravacaoId: 'g1', lancar: 12, mover: 3, ajustar: 0, soma: 4526.58 });
    expect(fraseDoGravar(ok ?? { lancar: 0, mover: 0, ajustar: 0, soma: null })).toBe('lança 12 · move 3 · R$ 4.526,58');
    expect(respostaDoGravar({ ok: false, simulado: true, recusa: { motivo: 'nao_e_cartao', frase: 'A conta "X" não é um cartão.' } })?.recusa?.frase).toBe('A conta "X" não é um cartão.');
    expect(respostaDoGravar({ erro: 1 })).toBeNull();
    expect(respostaDoGravar(null)).toBeNull();
  });
  it('P3 o desfazer: quantas voltam e as que ficam (mudaram depois), com a frase', () => {
    const r = respostaDoDesfazer({ ok: true, simulado: true, voltaram: 11, ficaram: [{ ordem: 4, gesto: 'lancar', motivo: 'mudou', frase: 'O lançamento mudou depois da gravação.' }] });
    expect(r && fraseDoDesfazer(r)).toBe('11 linhas voltam · 1 fica (mudaram depois)');
    expect(r?.ficaram).toEqual([{ ordem: 4, frase: 'O lançamento mudou depois da gravação.' }]);
    const um = respostaDoDesfazer({ ok: true, voltaram: 1, ficaram: [] });
    expect(um && fraseDoDesfazer(um)).toBe('1 linha volta');
    expect(respostaDoDesfazer({ ok: false, simulado: true, recusa: { motivo: 'sem_motivo', frase: 'Informe o motivo para desfazer.' } })?.recusa?.frase).toBe('Informe o motivo para desfazer.');
  });
});
