/**
 * DOC-NOTA-XML-PDF-01 — a regra que junta o PDF e o XML da MESMA nota numa linha (a mesma do banco, `fin_documento_confronto`).
 * O par e' o do caso real (sintetico aqui): o PDF com o numero "15786", sem serie, a chave com espacos; o XML com "000.015.786", serie 2.
 */
import { describe, it, expect } from 'vitest';
import { formatoDoArquivo, linhasDosDocumentos, oQueAbrir } from './notaDosDocumentos';
import type { LancDocumento } from '@/hooks/useLancamentoDocumentos';

const CH = '50311011222333000181550020000157861123456789';
const doc = (x: Partial<LancDocumento>): LancDocumento => ({
  id: 'd', origem: 'lancamento', operacaoId: null, especie: 'nf', especieOC: null, nome: 'nf', numero: null, serie: null,
  chaveAcesso: null, dataEmissao: null, valorDocumento: null, url: null, tipo: null, tamanhoBytes: 1,
  observacao: null, emitenteId: null, emitenteNome: null, emitenteDocumento: null, cancelado: false, canceladoMotivo: null,
  versao: 1, ligadoAQtd: 1, ...x,
});
const PDF = doc({ id: 'pdf', nome: 'NF 15786.pdf', tipo: 'application/pdf', url: 'c/l/a.pdf', numero: '15786', valorDocumento: 17600,
  chaveAcesso: CH.replace(/(\d{4})/g, '$1 ').trim() });
const XML = doc({ id: 'xml', nome: 'NFe15786.xml', tipo: 'text/xml', url: 'c/l/b.xml', numero: '000.015.786', serie: '2', valorDocumento: 17600,
  chaveAcesso: CH, emitenteDocumento: '11222333000181', emitenteNome: 'Emitente Exemplo' });
const BOLETO = doc({ id: 'bol', especie: 'boleto', nome: 'boleto.pdf', tipo: 'application/pdf', url: 'c/l/c.pdf', numero: '15786' });
const ids = (ls: ReturnType<typeof linhasDosDocumentos>) => ls.map((l) => l.membros.map((m) => m.id).join('+'));

describe('formatoDoArquivo — o mesmo CASE do banco', () => {
  it('pelo fim do nome ou pelo tipo', () => {
    expect(formatoDoArquivo({ nome: 'a.XML', tipo: null })).toBe('xml');
    expect(formatoDoArquivo({ nome: 'nota', tipo: 'application/xml' })).toBe('xml');
    expect(formatoDoArquivo({ nome: 'a.pdf', tipo: null })).toBe('pdf');
    expect(formatoDoArquivo({ nome: 'foto.jpg', tipo: 'image/jpeg' })).toBe('outro');
    expect(formatoDoArquivo({ nome: 'nota.xml.jpg', tipo: null })).toBe('outro');
  });
});

describe('linhasDosDocumentos', () => {
  it('PDF + XML da mesma nota: UMA linha, o XML e principal, os dois membros, no lugar do primeiro', () => {
    const ls = linhasDosDocumentos([BOLETO, PDF, XML]);
    expect(ids(ls)).toEqual(['bol', 'pdf+xml']);
    expect(ls[1].principal.id).toBe('xml');
    expect([ls[1].pdf?.id, ls[1].xml?.id]).toEqual(['pdf', 'xml']);
  });
  it('so o PDF tem valor: o PDF e o principal', () => {
    expect(linhasDosDocumentos([PDF, { ...XML, valorDocumento: null }])[0].principal.id).toBe('pdf');
  });
  it('dois PDFs da mesma nota NAO se juntam (o confronto avisa a repeticao)', () => {
    expect(ids(linhasDosDocumentos([PDF, { ...PDF, id: 'pdf2' }]))).toEqual(['pdf', 'pdf2']);
  });
  it('PDF + XML + outro PDF: nada se junta', () => {
    expect(ids(linhasDosDocumentos([PDF, XML, { ...PDF, id: 'pdf2' }]))).toEqual(['pdf', 'xml', 'pdf2']);
  });
  it('chave, serie ou CNPJ que se contradizem: duas linhas', () => {
    expect(ids(linhasDosDocumentos([PDF, { ...XML, chaveAcesso: CH.slice(0, 43) + '0' }]))).toEqual(['pdf', 'xml']);
    expect(ids(linhasDosDocumentos([{ ...PDF, serie: '1' }, XML]))).toEqual(['pdf', 'xml']);
    expect(ids(linhasDosDocumentos([{ ...PDF, chaveAcesso: null, emitenteDocumento: '99888777000166' }, XML]))).toEqual(['pdf', 'xml']);
  });
  it('sem numero, pela chave', () => {
    expect(ids(linhasDosDocumentos([{ ...PDF, numero: null }, { ...XML, numero: null }]))).toEqual(['pdf+xml']);
  });
  it('outro caminho (um na OC), cancelado ou outra especie: nao se junta', () => {
    expect(ids(linhasDosDocumentos([{ ...PDF, origem: 'operacao', operacaoId: 'oc1' }, XML]))).toEqual(['pdf', 'xml']);
    expect(ids(linhasDosDocumentos([{ ...PDF, cancelado: true }, XML]))).toEqual(['pdf', 'xml']);
    expect(ids(linhasDosDocumentos([{ ...PDF, especie: 'recibo' }, XML]))).toEqual(['pdf', 'xml']);
  });
});

describe('oQueAbrir — o PDF; sem PDF, os itens (nunca o XML cru)', () => {
  it('par: o PDF; so o XML: os itens; outro arquivo: ele; sem arquivo: nada', () => {
    const [par] = linhasDosDocumentos([PDF, XML]);
    expect(oQueAbrir(par)).toEqual({ tipo: 'arquivo', doc: PDF });
    expect(oQueAbrir(linhasDosDocumentos([XML])[0])).toEqual({ tipo: 'itens', doc: XML });
    const foto = doc({ id: 'f', nome: 'foto.jpg', url: 'c/l/f.jpg' });
    expect(oQueAbrir(linhasDosDocumentos([foto])[0])).toEqual({ tipo: 'arquivo', doc: foto });
    expect(oQueAbrir(linhasDosDocumentos([doc({})])[0])).toBeNull();
  });
});
