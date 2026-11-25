/**
 * CAIXA-DANFE-CHAVE-01 (Gabriel 24/11 17:35) — a DANFE que o leitor da nota não lê vira NOTA pela chave: a do texto do PDF (em grupos de 4
 * com espaços ou pontos) e, sem ela, a do NOME do arquivo ("<chave>-danfe.pdf"). Só chave VÁLIDA (DV, UF, mês, modelo 55, CNPJ).
 * ⚠ Chave SINTÉTICA (CNPJ de exemplo 11.222.333/0001-81, DV calculado aqui); nenhuma chave de cliente entra.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { lerDaCaixaCom, notaPelaChave } from './useCaixaDeBoletos';
import { FRASE_NEM_BOLETO_NEM_NOTA } from '@/lib/financeiro/boleto/caixaPorEmail';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

function comDv(c43: string): string {
  let soma = 0; let peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(c43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return c43 + String(r < 2 ? 0 : 11 - r);
}
/* MS (50), 11/2026, CNPJ 11222333000181, modelo 55, série 005, nº 000012345, tpEmis 1, código 12345678 */
const CHAVE = comDv('5026111122233300018155005000012345112345678');
const ERRADA = CHAVE.slice(0, 43) + String((Number(CHAVE[43]) + 1) % 10);
const grupos = (c: string, sep = ' ') => c.match(/.{1,4}/g)?.join(sep) ?? c;

const pdfjsFalso = (linhas: string[][]): PdfjsMinimo => ({
  getDocument: () => ({ promise: Promise.resolve({
    numPages: 1,
    getPage: async () => ({
      getViewport: () => ({ width: 595, height: 842 }),
      getTextContent: async () => ({ items: linhas.flatMap((celulas, l) => celulas.map((str, c) => ({ str, transform: [10, 0, 0, 10, 40 + c * 160, 800 - l * 14], width: 150, height: 10 }))) }),
    }),
  }) }),
});
const BYTES = new TextEncoder().encode('%PDF falso').buffer;
const DANFE_QUE_NAO_SE_LE = (chave: string | null) => pdfjsFalso([['DANFE', 'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA'],
  ['CHAVE DE ACESSO'], ...(chave ? [[chave]] : []), ['VALOR TOTAL DA NOTA', '148,00']]);

describe('a chave da DANFE pelo texto e pelo nome do arquivo', () => {
  it('a chave em grupos com espaço ou ponto no texto; o número sai da chave; o resto fica vazio', () => {
    expect(notaPelaChave(`CHAVE DE ACESSO\n${grupos(CHAVE)}`, undefined)).toEqual({ chave: CHAVE, numero: '12345', emitente: null, valor: null, vencimento: null });
    expect(notaPelaChave(grupos(CHAVE, '.'), undefined)?.chave).toBe(CHAVE);
  });
  it('sem chave no texto, a do nome do arquivo; DV errado não vale (nem no texto, nem no nome)', () => {
    expect(notaPelaChave('sem chave aqui', `${CHAVE}-danfe.pdf`)?.chave).toBe(CHAVE);
    expect(notaPelaChave(grupos(ERRADA), `${ERRADA}-danfe.pdf`)).toBeNull();
    expect(notaPelaChave(null, 'DANFE_030436.pdf')).toBeNull();
  });
  it('o texto manda sobre o nome', () => {
    const outra = comDv('5026111122233300018155005000099999112345678');
    expect(notaPelaChave(grupos(CHAVE), `${outra}-danfe.pdf`)?.chave).toBe(CHAVE);
  });
});

describe('a Caixa: a DANFE que não se lê vira nota', () => {
  it('pela chave impressa em grupos', async () => {
    const r = await lerDaCaixaCom(DANFE_QUE_NAO_SE_LE(grupos(CHAVE)))(BYTES, 'pdf', undefined, 'arquivo.pdf');
    expect(r).toEqual({ k: 'nota', nota: { chave: CHAVE, numero: '12345', emitente: null, valor: null, vencimento: null } });
  });
  it('pela chave do nome do arquivo; sem chave em lugar nenhum segue "sem linha digitável"', async () => {
    expect(await lerDaCaixaCom(DANFE_QUE_NAO_SE_LE(null))(BYTES, 'pdf', undefined, `${CHAVE}-danfe.pdf`)).toMatchObject({ k: 'nota', nota: { chave: CHAVE } });
    expect(await lerDaCaixaCom(DANFE_QUE_NAO_SE_LE(null))(BYTES, 'pdf', undefined, 'DANFE_030436.pdf')).toEqual({ k: 'nada', frase: FRASE_NEM_BOLETO_NEM_NOTA });
  });
});
