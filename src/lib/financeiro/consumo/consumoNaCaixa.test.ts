/**
 * CONTAS-CONSUMO-01 C1 + CAIXA-OCR-01 O4 — na Caixa: o leitor de verdade (`lerDaCaixaCom`, pdfjs falso) dá 'fatura' (a NF3e, ANTES do
 * boleto: a linha digitável da fatura fica dentro dela) e 'posicao' (a posição do banco); as linhas dizem o que foi lido e não gravam nada.
 * ⚠ Dado INVENTADO (a chave foi montada com o CNPJ de exemplo 11.222.333/0001-81; a arrecadação é a sintética do linhaDigitavelDv.test).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { lerDaCaixaCom } from '@/hooks/useCaixaDeBoletos';
import { linhaDaFatura, linhaDaPosicao, linhasDasFontes } from '@/lib/financeiro/boleto/caixaPorEmail';
import { lerFaturaConsumo } from './lerFaturaConsumo';
import { lerPosicaoOperacoes } from './lerPosicaoOperacoes';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

const FATURA: string[][] = [
  ['DANF3E - DOCUMENTO AUXILIAR DA NOTA FISCAL DE ENERGIA ELÉTRICA ELETRÔNICA'], ['CONCESSIONARIA EXEMPLO DE ENERGIA S.A.'],
  ['TITULAR EXEMPLO DA SILVA'], ['24/02/2026', '24/03/2026', '28', '22/04/2026'], ['RUA DO TITULAR, 10'],
  ['5026 1111 2223 3300 0181 6600 1000 0123 4511 2345 6780'], ['Março / 2026', '16/04/2026', 'R$ 61,29'],
  ['X0000000001', 'Energia ativa em kWh', 'Ponta', '403', '422', '1', '19'], ['CADASTRE SUA FATURA EM DÉBITO AUTOMÁTICO UTILIZANDO O CÓDIGO: 0000000001-1'],
];
const COM_BOLETO: string[][] = [...FATURA, ['81660000001-1 23450001111-4 22223333444-0 45555666677-0']];
const POSICAO: string[][] = [
  ['Posição de operações financeiras para simples conferência'], ['Nome: CLIENTE EXEMPLO', 'Data base:', 'Data de emissão:'],
  ['CPF: 000.000.000-00', '26/03/2026', '27/03/2026'],
  ['RURAL CUSTEIO EXEMPLO', '000000000001', 'PRE', 'BRL', '12,50', '0', '02/02/2026', '26/07/2027', 'R$ 100.000,00', 'R$ 1.500,00', 'R$ 0,00', 'R$ 101.500,00'],
  ['Total', 'R$ 100.000,00', 'R$ 1.500,00', 'R$ 0,00', 'R$ 101.500,00'],
];
const pdfjsDe = (linhas: string[][]): PdfjsMinimo => ({
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({
    getViewport: () => ({ width: 595, height: 842 }),
    getTextContent: async () => ({ items: linhas.flatMap((cs, l) => cs.map((str, c) => ({ str, transform: [10, 0, 0, 10, 20 + c * 130, 800 - l * 14], width: 100, height: 10 }))) }),
  }) }) }),
});
const ler = (linhas: string[][]) => lerDaCaixaCom(pdfjsDe(linhas))(new TextEncoder().encode('%PDF falso').buffer, 'pdf');

describe('a fatura de energia e a posição do banco na Caixa', () => {
  it('a NF3e vira o tipo fatura (não "sem linha digitável nem chave")', async () => {
    const r = await ler(FATURA);
    expect(r.k).toBe('fatura');
    if (r.k !== 'fatura') return;
    expect(r.fatura).toMatchObject({ uc: '0000000001', valor: 61.29, vencimento: '2026-04-16' });
  });
  it('a fatura com boleto continua fatura: a linha digitável fica dentro dela', async () => {
    const r = await ler(COM_BOLETO);
    expect(r.k).toBe('fatura');
    if (r.k !== 'fatura') return;
    expect(r.fatura.linhaDigitavel).toBe('816600000011234500011114222233334440455556666770');
  });
  it('a posição de operações vira o tipo posicao', async () => {
    const r = await ler(POSICAO);
    expect(r.k).toBe('posicao');
    if (r.k !== 'posicao') return;
    expect(r.posicao.operacoes[0].contrato).toBe('000000000001');
  });
  it('as linhas: "Fatura de energia · 03/2026" com concessionária, UC e kWh; "Posição do banco · 26/03/2026" com o contrato; só Ignorar', () => {
    const f = lerFaturaConsumo([FATURA.map((c) => c.join(' | '))]);
    const p = lerPosicaoOperacoes([POSICAO.map((c) => c.join(' | '))]);
    if (f.ok === false || p.ok === false) throw new Error('leitura');
    const lf = linhaDaFatura('fatura:a', 'a', 'fatura.pdf', f.fatura);
    expect(lf).toMatchObject({ tipo: 'fatura', emitente: 'Fatura de energia · 03/2026', valor: 61.29, vencimento: '2026-04-16', acoes: ['ignorar'] });
    expect(lf.noSistema.texto).toBe('CONCESSIONARIA EXEMPLO DE ENERGIA S.A. · UC 0000000001 · 19 kWh');
    const lp = linhaDaPosicao('posicao:b', 'b', 'posicao.pdf', p.posicao);
    expect(lp).toMatchObject({ tipo: 'posicao', emitente: 'Posição do banco · 26/03/2026', valor: 101500, acoes: ['ignorar'] });
    expect(lp.noSistema.texto).toBe('contrato 000000000001 · RURAL CUSTEIO EXEMPLO');
    expect(lp.noSistema.selo).toEqual({ texto: 'lida', tom: 'cinza' });
    const naoConfere = linhaDaPosicao('posicao:b', 'b', 'posicao.pdf', { ...p.posicao, confere: false });
    expect(naoConfere.noSistema.selo).toEqual({ texto: 'não confere', tom: 'vermelho' });
    const linhas = linhasDasFontes([
      { chave: 'a', nome: 'fatura.pdf', tipoDoArquivo: 'pdf', lido: { k: 'fatura', fatura: f.fatura } },
      { chave: 'b', nome: 'posicao.pdf', tipoDoArquivo: 'pdf', lido: { k: 'posicao', posicao: p.posicao } },
    ], {}, {}, '2026-03-30', true, new Set());
    expect(linhas.map((l) => [l.chave, l.tipo])).toEqual([['fatura:a', 'fatura'], ['posicao:b', 'posicao']]);
  });
});
