/**
 * NOTA-PAGTO-PARCELADO-01 P1 (Gabriel 11/11) — a nota paga em VÁRIOS lançamentos soltos (o trator: 110.000 + 4 × 25.000 por PIX = 210.000):
 * o operador junta os outros do mesmo fornecedor; eles entram nos achados como 'escolhido' e viram ALVOS (recebem a nota no Aplicar de sempre);
 * o rodapé diz soma × nota × diferença; diferença só avisa. Dados SINTÉTICOS.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import { casarJaLancados, comEscolhidos, ficaDeForaPorPadrao, fraseDoAchado, linhasSistemaNota } from '@/lib/financeiro/nfe/jaLancada';

const L = (id: string, valorCent: number, vencimento: string, o: Partial<LancamentoJaLancado> = {}): LancamentoJaLancado => ({
  id, vencimento, pagamento: null, competencia: vencimento, descricao: 'Compra máquina exemplo', valorCent, status: 'programado', conciliado: false,
  financiamentoId: null, contaBancariaId: null, numeroDocumento: null, fornecedorId: 'f1', fornecedorNome: 'Máquinas Exemplo', fornecedorPor: 'cnpj',
  parcelas: [], por: ['escolhido'], cancelado: false, ...o,
});
const lerMock = vi.fn();
vi.mock('@/lib/financeiro/nfeConsultas', () => ({ LIMITE_DE_OUTROS_LANCAMENTOS: 300, lancamentosDoFornecedorNoPeriodo: (...a: unknown[]) => lerMock(...a) }));
import { OutrosLancamentosDaNota, periodoPadrao } from './OutrosLancamentosDaNota';

/* o 110.000 que a busca da nota achou (pelo documento anexado, como no caso real) */
const ACHADO = L('a-110', 11000000, '2026-07-29', { por: ['documento'], status: 'realizado' });
const PIX = ['2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10'].map((v, i) => L(`p-${i + 1}`, 2500000, v));

describe('os escolhidos à mão entram nos achados e recebem a nota', () => {
  it('comEscolhidos: o já achado ganha a marca, o novo entra no fim, sem repetir', () => {
    const r = comEscolhidos([ACHADO], [L('a-110', 11000000, '2026-07-29'), ...PIX]);
    expect(r.map((l) => [l.id, l.por.join('+')])).toEqual([['a-110', 'documento+escolhido'], ['p-1', 'escolhido'], ['p-2', 'escolhido'], ['p-3', 'escolhido'], ['p-4', 'escolhido']]);
    expect(comEscolhidos([ACHADO], [])).toEqual([ACHADO]);
  });
  it('a nota de 210.000 sem duplicata: o 110.000 + os 4 × 25.000 escolhidos são TODOS alvos; nada "falta" para criar; a frase diz "escolhidos por você"', () => {
    const parcelas = [{ n: 1, vencimento: '2026-08-07', valorCent: 21000000 }];
    const j = casarJaLancados(parcelas, comEscolhidos([ACHADO], PIX), 21000000);
    expect(j?.alvos.map((l) => l.id).sort()).toEqual(['a-110', 'p-1', 'p-2', 'p-3', 'p-4']);
    /* nada "falta": a nota inteira NÃO nasce de novo (seria em dobro) — o operador disse quais pagam */
    expect(j?.faltam).toEqual([]);
    /* sem os escolhidos, a mesma nota "faltava" inteira (a prova de que a regra muda algo) */
    expect(casarJaLancados(parcelas, [ACHADO], 21000000)?.faltam.map((x) => x.valorCent)).toEqual([21000000]);
    expect(j && fraseDoAchado(j, linhasSistemaNota(j, 21000000), 21000000)).toContain('escolhidos por você');
    /* na tabela: o escolhido mostra o status dele (nunca "só no sistema") e vem em "Vincular" (nunca "Fica de fora") */
    const linhas = j ? linhasSistemaNota(j, 21000000) : [];
    expect(linhas.filter((x) => x.sistema?.id.startsWith('p-')).map((x) => x.situacao)).toEqual(['programada', 'programada', 'programada', 'programada']);
    expect(PIX.map((l) => ficaDeForaPorPadrao(j, l.id))).toEqual([false, false, false, false]);
  });
  it('periodoPadrao: emissão − 120 dias até a última duplicata (ou a emissão) + 180', () => {
    expect(periodoPadrao('2026-08-07', null)).toEqual({ de: '2026-04-09', ate: '2027-02-03' });
    expect(periodoPadrao('2026-08-07', '2026-12-10')).toEqual({ de: '2026-04-09', ate: '2027-06-08' });
    expect(periodoPadrao('', null)).toEqual({ de: '', ate: '' });
  });
});

describe('a tela "Outros lançamentos do fornecedor"', () => {
  const abrir = (onJuntar = vi.fn()) => {
    lerMock.mockResolvedValue({ ok: true, valor: [ACHADO, ...PIX] });
    render(<OutrosLancamentosDaNota clienteId="cli" emitenteDocumento="11222333000181" emitenteNome="Máquinas Exemplo" notaCent={21000000}
      periodo={{ de: '2026-04-09', ate: '2027-02-03' }} jaNaLista={[ACHADO]} onJuntar={onJuntar} onFechar={() => undefined} />);
    return onJuntar;
  };
  it('o já achado vem marcado e travado e conta na soma; marcar os 4 × 25.000 fecha a nota ("confere"); Juntar leva SÓ os novos', async () => {
    const onJuntar = abrir();
    await waitFor(() => expect(screen.getAllByTestId('outros-linha')).toHaveLength(5));
    expect(lerMock).toHaveBeenCalledWith('cli', '11222333000181', '2026-04-09', '2027-02-03');
    expect([screen.getByTestId('outros-n').textContent, screen.getByTestId('outros-soma').textContent, screen.getByTestId('outros-diferenca').textContent])
      .toEqual(['1', '110.000,00', 'faltam 100.000,00']);
    const caixas = screen.getAllByTestId('outros-marcar');
    expect(caixas[0].hasAttribute('disabled')).toBe(true);
    for (const c of caixas.slice(1, 4)) fireEvent.click(c);
    expect(screen.getByTestId('outros-diferenca').textContent).toBe('faltam 25.000,00');
    fireEvent.click(caixas[4]);
    expect([screen.getByTestId('outros-n').textContent, screen.getByTestId('outros-soma').textContent, screen.getByTestId('outros-diferenca').textContent])
      .toEqual(['5', '210.000,00', 'confere']);
    fireEvent.click(screen.getByTestId('outros-juntar'));
    expect(onJuntar.mock.calls[0][0].map((l: LancamentoJaLancado) => l.id)).toEqual(['p-1', 'p-2', 'p-3', 'p-4']);
  });
  it('nada marcado de novo: Juntar apagado; falha da leitura = a frase + "Tentar de novo" (nunca lista vazia)', async () => {
    abrir();
    await waitFor(() => expect(screen.getAllByTestId('outros-linha')).toHaveLength(5));
    expect(screen.getByTestId('outros-juntar').hasAttribute('disabled')).toBe(true);
  });
  it('a leitura que falha diz que falhou', async () => {
    lerMock.mockResolvedValue({ ok: false, motivo: 'x' });
    render(<OutrosLancamentosDaNota clienteId="cli" emitenteDocumento="11222333000181" emitenteNome="X" notaCent={100}
      periodo={{ de: '2026-01-01', ate: '2026-12-31' }} jaNaLista={[]} onJuntar={() => undefined} onFechar={() => undefined} />);
    expect((await screen.findByTestId('outros-falha')).textContent).toContain('Não consegui ler os lançamentos do fornecedor.');
  });
});
