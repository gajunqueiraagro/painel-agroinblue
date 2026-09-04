/**
 * O que este teste trava — um valor inválido não pode apagar o relatório.
 *
 * ⚠ O DEFEITO QUE ELE GUARDA JÁ ACONTECEU E ERA MUDO: o pdfkit recusa NaN/Infinity
 * em QUALQUER coordenada ("unsupported number: NaN") e derruba as quatro páginas
 * junto com o gráfico. O toast dizia "Falha ao gerar PDF" e nada mais, então o
 * operador não sabia que o problema era UM lançamento, e quem conserta não tinha
 * nem a exceção. Sem este teste, isso volta calado.
 *
 * ⚠ SÃO DUAS PORTAS PARA O MESMO ESTOURO, e a segunda quase passou: o donut
 * filtrava por `valor > 0`, o que barra NaN mas NÃO barra Infinity — infinito
 * entrava no rateio e virava um arco impossível. Por isso o caso do infinito é
 * separado do caso do NaN aqui.
 *
 * ⚠ E O CASO LIMPO É TÃO IMPORTANTE QUANTO OS TRÊS SUJOS: um aviso que aparece
 * quando está tudo certo ensina o operador a ignorar avisos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ erro: vi.fn(), aviso: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: h.erro, warning: h.aviso, success: vi.fn(), info: vi.fn() },
}));
/* O logo passa por `new Image()`, que em jsdom nunca resolve nem rejeita — a
   Promise ficaria pendurada e o teste estouraria por timeout, não por defeito. */
vi.mock('@/lib/pdf/pdfChassi', () => ({ carregarLogoBase64: vi.fn(async () => undefined) }));

import { gerarPdfAnaliseExecutivaV3, type ParamsPdfExecutiva } from '@/lib/pdf/analise/gerarPdfAnaliseExecutivaV3';

let baixados = 0;
beforeEach(() => {
  baixados = 0;
  h.erro.mockClear();
  h.aviso.mockClear();
  /* jsdom não implementa nem createObjectURL nem a navegação do <a download>.
     Sem estes dois stubs o próprio teste cairia no catch e daria falso positivo. */
  URL.createObjectURL = () => { baixados += 1; return 'blob:teste'; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = () => {};
});

const serieItem = (data: string, mov: number) => ({ data, mov, realizado: true });
const extratoItem = (data: string, valor: number, produto: string) => ({
  data, produto, fornecedor: 'Fornecedor', centro: 'Centro', valor, saldo: 1,
  statusKey: 'realizado', statusLabel: 'Realizado', doc: '',
});

const base: ParamsPdfExecutiva = {
  clienteNome: 'Cliente', contaNome: 'Conta', periodoLabel: 'Set/2026', ano: 2026, mes: 9,
  saldoIni: 1000, saldoFin: null, totais: { ent: 10, sai: 5 },
  serieLinhas: [serieItem('2026-09-02', -5), serieItem('2026-09-03', 10)],
  dadosOrg: [{ mov: -5, tipo: '2-Saídas', data: '2026-09-02', macro: 'Custos', escopo: 'Pecuária', centroPlano: 'Nutrição' }],
  transferencias: [],
  extrato: [extratoItem('2026-09-02', -5, 'Ração'), extratoItem('2026-09-03', 10, 'Venda')],
};

/** Substitui o mesmo lançamento nas DUAS pontas: a série desenha, o extrato nomeia. */
const comLancamento = (valor: number, nome: string): ParamsPdfExecutiva => ({
  ...base,
  serieLinhas: [serieItem('2026-09-02', valor), serieItem('2026-09-03', 10)],
  extrato: [extratoItem('2026-09-02', valor, nome), extratoItem('2026-09-03', 10, 'Venda')],
});

describe('PDF Executivo — valor inválido não apaga o relatório', () => {
  it('saldo inicial NaN: o PDF sai e o aviso aponta o saldo', async () => {
    await gerarPdfAnaliseExecutivaV3({ ...base, saldoIni: NaN });
    expect(baixados).toBe(1);
    expect(h.erro).not.toHaveBeenCalled();
    expect(h.aviso.mock.calls[0][0]).toContain('saldo inicial');
  });

  it('lançamento NaN: o PDF sai e o aviso nomeia data e descrição', async () => {
    await gerarPdfAnaliseExecutivaV3(comLancamento(NaN, 'Prolabore'));
    expect(baixados).toBe(1);
    expect(h.erro).not.toHaveBeenCalled();
    const aviso = h.aviso.mock.calls[0][0];
    expect(aviso).toContain('02/09');
    expect(aviso).toContain('Prolabore');
  });

  it('lançamento Infinity: o PDF sai (o donut testava só `> 0`, e infinito passava)', async () => {
    await gerarPdfAnaliseExecutivaV3(comLancamento(Infinity, 'Boi gordo'));
    expect(baixados).toBe(1);
    expect(h.erro).not.toHaveBeenCalled();
    expect(h.aviso.mock.calls[0][0]).toContain('Boi gordo');
  });

  it('tudo limpo: gera sem avisar nada', async () => {
    await gerarPdfAnaliseExecutivaV3(base);
    expect(baixados).toBe(1);
    expect(h.erro).not.toHaveBeenCalled();
    expect(h.aviso).not.toHaveBeenCalled();
  });
});
