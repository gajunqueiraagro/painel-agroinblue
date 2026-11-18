/**
 * NOTA-DANFE-01 — o DANFE do XML (dados SINTÉTICOS das fixtures; nenhuma nota real).
 *   D1 leitura dos extras (impostos, transporte, protocolo, itens fiscais, IBS/CBS) · D2 o HTML tem os blocos e os números do XML
 *   D3 Code-128C da chave (início, verificador, fim) · D4 folhas: 22 na 1ª, 46 nas outras · D5 escapa o texto do XML · D6 homologação
 */
import { describe, expect, it } from 'vitest';
import { lerExtrasDoDanfe, lerNFe } from './lerNFe';
import { barras128C, chaveEmGrupos, codigos128C, danfeHtml, folhasDosItens, ITENS_FOLHA_1, ITENS_POR_FOLHA } from './danfeHtml';
import { chaveDe, EMITENTE_CNPJ, montarNFe } from './__fixtures__/notas';

const bytes = (xml: string) => new TextEncoder().encode(xml).buffer as ArrayBuffer;
const ler = (xml: string) => {
  const b = bytes(xml);
  const n = lerNFe(b);
  if (n.ok === false) throw new Error(n.frase);
  const x = lerExtrasDoDanfe(b);
  if (!x) throw new Error('sem extras');
  return { nota: n.nota, extras: x };
};

describe('NOTA-DANFE-01 — o DANFE do XML', () => {
  it('D1 lê os extras: impostos, transporte, protocolo com hora, itens fiscais, IBS/CBS, ambiente', () => {
    const { extras } = ler(montarNFe());
    expect(extras.ambiente).toBe('producao');
    expect(extras.protocoloEm).toBe('2026-09-30T10:16:02-04:00');
    expect(extras.horaSaida).toBe('08:00:00');
    expect(extras.impostos).toMatchObject({ bcIcmsCent: 1623800, notaCent: 1623800, freteCent: 0, tributosCent: null });
    expect(extras.ibsCbs).toEqual({ ibsCent: 0, cbsCent: 0 });
    expect(extras.transporte.modFrete).toBe('9');
    expect(extras.itens).toHaveLength(6);
    expect(extras.itens[0]).toMatchObject({ codigo: '1000', descricao: 'SAL MINERAL 80 P SC 30KG', ncm: '23099090', cfop: '5102', cst: '000', totalCent: 960000, bcIcmsCent: 960000 });
    expect(extras.destinatario).toMatchObject({ bairro: 'ZONA RURAL', municipio: 'CAMPO GRANDE', uf: 'MS' });
  });
  it('D2 o HTML tem os blocos e os números do XML', () => {
    const { nota, extras } = ler(montarNFe());
    const h = danfeHtml(nota, extras);
    for (const t of ['DANFE', 'Nº 000.012.345', 'SÉRIE 1', 'FOLHA 1/1', 'VENDA DE MERCADORIA', '150260000123456 · 30/09/2026 10:16:02',
      'AGROPECUARIA EXEMPLO LTDA', '11.222.333/0001-81', 'PRODUTOR RURAL DE TESTE', '16.238,00', 'SAL MINERAL 80 P SC 30KG', '9.600,00',
      '9 - Sem frete', 'Dados adicionais', '001 05/11/2026 R$ 8.119,00', '15 — Boleto', chaveEmGrupos(nota.chave)]) {
      expect(h).toContain(t);
    }
    expect(h).toContain('<svg class="bar"');
    expect(h).not.toContain('SEM VALOR FISCAL');
  });
  it('D3 Code-128C: início 105, pares, verificador mod 103, fim 106; barras de largura fixa por código', () => {
    expect(codigos128C('1234')).toEqual([105, 12, 34, (105 + 12 * 1 + 34 * 2) % 103, 106]);
    const chave = chaveDe(EMITENTE_CNPJ, '55', '12345');
    const c = codigos128C(chave);
    expect(c).toHaveLength(1 + 22 + 2);
    expect(barras128C(chave)).toMatch(/^<svg class="bar" viewBox="0 0 \d+ 40"/);
    expect(() => codigos128C('123')).toThrow();
  });
  it('D4 folhas: 22 itens na 1ª e 46 nas outras; 60 itens = 3 folhas, o cabeçalho se repete com FOLHA n/3', () => {
    expect([ITENS_FOLHA_1, ITENS_POR_FOLHA]).toEqual([22, 46]);
    expect(folhasDosItens(Array.from({ length: 60 }, (_, i) => i)).map((f) => f.length)).toEqual([22, 38]);
    expect(folhasDosItens(Array.from({ length: 70 }, (_, i) => i)).map((f) => f.length)).toEqual([22, 46, 2]);
    expect(folhasDosItens([]).map((f) => f.length)).toEqual([0]);
    const itens = Array.from({ length: 70 }, (_, i) => [`ITEM ${i + 1}`, '1.0000', 'UN', '1.00'] as [string, string, string, string]);
    const { nota, extras } = ler(montarNFe({ itens, vNF: '70.00', duplicatas: null }));
    const h = danfeHtml(nota, extras);
    expect(h).toContain('FOLHA 1/3'); expect(h).toContain('FOLHA 2/3'); expect(h).toContain('FOLHA 3/3');
    expect(h.match(/class="folha"/g)).toHaveLength(3);
    expect(h).toContain('ITEM 70');
    expect(h).toContain('… continua na folha 2');
  });
  it('D5 o texto do XML é escapado (nome com < e &)', () => {
    const { nota, extras } = ler(montarNFe({ nomeEmitente: 'A &amp; B &lt;LTDA&gt;' }));
    const h = danfeHtml(nota, extras);
    expect(h).toContain('A &amp; B &lt;LTDA&gt;');
    expect(h).not.toContain('<LTDA>');
  });
  it('D6 homologação: "SEM VALOR FISCAL"', () => {
    const { nota, extras } = ler(montarNFe().replace('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>'));
    expect(danfeHtml(nota, { ...extras, ambiente: 'homologacao' })).toContain('SEM VALOR FISCAL');
    expect(extras.ambiente).toBe('homologacao');
  });
});
