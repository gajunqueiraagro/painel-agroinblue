/** FIN-FINANC-28-P3-FIX — o nome curto do credor (os nomes reais de credor de financiamento do proto, 17/10). */
import { describe, expect, it } from 'vitest';
import { nomeCurtoDoCredor, TETO_NOME_CURTO } from './nomeCurtoDoCredor';

describe('nomeCurtoDoCredor', () => {
  it('bancos conhecidos pelo nome, sem acento e sem caixa', () => {
    const casos: [string, string][] = [
      ['Banco do Brasil', 'BB'], ['BANCO DO BRASIL S.A. (001)', 'BB'], ['Banco do Brasil-Pec.3M', 'BB'], ['Banco Bradesco', 'Bradesco'],
      ['Banco Sicredi', 'Sicredi'], ['Banco Itau BBA', 'Itaú BBA'], ['Banco Itaú BBA', 'Itaú BBA'], ['Banco Itaú', 'Itaú'],
      ['Sicoob', 'Sicoob'], ['Banco BRDE', 'BRDE'], ['De Lage Landen', 'DLL'], ['John Deere', 'John Deere'],
      ['Banco Santander', 'Santander'], ['Rabobank', 'Rabobank'],
    ];
    for (const [nome, curto] of casos) expect(nomeCurtoDoCredor(nome)).toBe(curto);
  });
  it('o que cabe fica inteiro; o resto vira primeira palavra + inicial da última; nunca passa do teto', () => {
    expect(nomeCurtoDoCredor('Sem dados')).toBe('Sem dados');
    expect(nomeCurtoDoCredor('Fabio Marcelo Delazari')).toBe('Fabio D.');
    expect(nomeCurtoDoCredor('Florindo Cavalli Neto')).toBe('Florindo N.');
    expect(nomeCurtoDoCredor('Agropecuariasupercomprida')).toBe('Agropecuari.');
    expect(nomeCurtoDoCredor('Agropecuariasupercomprida').length).toBeLessThanOrEqual(TETO_NOME_CURTO);
    expect(nomeCurtoDoCredor(null)).toBe('—');
  });
});
