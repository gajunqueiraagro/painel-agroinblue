/**
 * CAIXA-FOLHA-AVISO-01 (Gabriel 24/11 10:46) — o PDF sem boleto nem nota que PARECE recibo de pagamento diz "Folha ainda não é lida
 * aqui — fale com o consultor" (não "sem linha digitável"). Aqui: a leitura das páginas do PDF (pdfjs falso, linhas INVENTADAS) até o
 * `pareceFolha`. ⚠ Holerite real nunca entra aqui.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { lerDaCaixaCom, pdfPareceFolha } from './useCaixaDeBoletos';
import { FRASE_FOLHA_AINDA_NAO, FRASE_NEM_BOLETO_NEM_NOTA } from '@/lib/financeiro/boleto/caixaPorEmail';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

/** cada página = linhas; cada linha = células na mesma altura, da esquerda para a direita */
const pdfjsFalso = (paginas: string[][][]): PdfjsMinimo => ({
  getDocument: () => ({ promise: Promise.resolve({
    numPages: paginas.length,
    getPage: async (n: number) => ({
      getViewport: () => ({ width: 595, height: 842 }),
      getTextContent: async () => ({ items: paginas[n - 1].flatMap((celulas, l) => celulas.map((str, c) => ({ str, transform: [10, 0, 0, 10, 40 + c * 120, 800 - l * 14], width: 100, height: 10 }))) }),
    }),
  }) }),
});
const BYTES = new TextEncoder().encode('%PDF falso').buffer;

describe('CAIXA-FOLHA-AVISO-01 — o PDF que parece folha', () => {
  it('o recibo do 13º (layout SCI, 2 vias) parece folha', async () => {
    const via = [['0001 - EMPREGADORA FICTICIA', 'RECIBO DE PAGAMENTO DE SALÁRIO'], ['CEI: 111.222.333-44', 'Adiantamento 13o.Salário Novembro/2026'],
      ['Código', 'Nome do funcionário', 'C.C:'], ['12', 'FULANA FICTICIA', 'CBO : 6210-05', '1 GERAL'], ['SALÁRIO LÍQUIDO', 'R$', '730,00']];
    expect(await pdfPareceFolha(BYTES, undefined, pdfjsFalso([[...via, ...via]]))).toBe(true);
  });
  it('o PDF qualquer não parece; a leitura que falha também não (fica o "sem linha digitável")', async () => {
    expect(await pdfPareceFolha(BYTES, undefined, pdfjsFalso([[['ORÇAMENTO FICTICIO'], ['Item', 'Valor'], ['Cerca', '1.000,00']]]))).toBe(false);
    const quebrado: PdfjsMinimo = { getDocument: () => ({ promise: Promise.reject(new Error('PDF quebrado')) }) };
    expect(await pdfPareceFolha(BYTES, undefined, quebrado)).toBe(false);
  });
  it('a Caixa: o PDF sem boleto nem nota que parece folha diz a frase da folha; o que não parece segue "sem linha digitável"', async () => {
    const folha = pdfjsFalso([[['RECIBO DE PAGAMENTO DE SALÁRIO'], ['SALÁRIO LÍQUIDO', 'R$', '730,00']]]);
    expect(await lerDaCaixaCom(folha)(BYTES, 'pdf')).toEqual({ k: 'nada', frase: FRASE_FOLHA_AINDA_NAO });
    const outro = pdfjsFalso([[['ORÇAMENTO FICTICIO'], ['Cerca', '1.000,00']]]);
    expect(await lerDaCaixaCom(outro)(BYTES, 'pdf')).toEqual({ k: 'nada', frase: FRASE_NEM_BOLETO_NEM_NOTA });
  });
  it('a frase é a do Gabriel', () => {
    expect(FRASE_FOLHA_AINDA_NAO).toBe('Folha ainda não é lida aqui — fale com o consultor.');
  });
});
