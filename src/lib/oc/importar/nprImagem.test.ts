/**
 * NPR-IMAGEM (Chat 13/11 10:25 item 3) — a NPR em foto ou em PDF escaneado não é lida: sobe anexada como a espécie escolhida
 * ("Anexar como", NPR por padrão; "Não anexar" a deixa de fora).
 */
import { describe, it, expect } from 'vitest';
import { documentosSemLeitura, ehImagemDoImport, especieSemLeitura, lerDocumentosDoImport } from './leituraDoImport';

const docs = lerDocumentosDoImport([{ nome: 'NPR_9232.jpg', linhas: [], temTexto: false }, { nome: 'GTA.pdf', linhas: [], temTexto: false }]).documentos;

describe('documento sem leitura', () => {
  it('foto é JPG/PNG (pelo tipo ou pela extensão); PDF não', () => {
    expect(ehImagemDoImport({ name: 'npr.JPG' })).toBe(true);
    expect(ehImagemDoImport({ name: 'x', type: 'image/png' })).toBe(true);
    expect(ehImagemDoImport({ name: 'nf.pdf', type: 'application/pdf' })).toBe(false);
  });
  it('a foto e o PDF sem texto ficam sem espécie (o leitor não os reconhece)', () => {
    expect(docs.map(d => d.especie)).toEqual([null, null]);
  });
  it('sem escolha, sobem como NPR; a escolha manda; "Não anexar" tira', () => {
    expect(documentosSemLeitura(docs, {})).toEqual([{ nome: 'NPR_9232.jpg', especie: 'npr' }, { nome: 'GTA.pdf', especie: 'npr' }]);
    expect(documentosSemLeitura(docs, { 'GTA.pdf': 'gta' })).toEqual([{ nome: 'NPR_9232.jpg', especie: 'npr' }, { nome: 'GTA.pdf', especie: 'gta' }]);
    expect(documentosSemLeitura(docs, { 'NPR_9232.jpg': null })).toEqual([{ nome: 'GTA.pdf', especie: 'npr' }]);
  });
  it('o valor do seletor: só as espécies da lista; vazio é "não anexar"', () => {
    expect(especieSemLeitura('gta')).toBe('gta');
    expect(especieSemLeitura('')).toBeNull();
    expect(especieSemLeitura('acerto')).toBeNull();
  });
});
