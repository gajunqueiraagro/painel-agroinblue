/**
 * FIN-FILTRO-DOC-01 — o filtro "Documento" do Financeiro V2 acha o lançamento pelo número de QUALQUER documento vivo ligado a ele
 * (os da OC e a nota das parcelas inclusive) e pelo campo antigo do lançamento; compara só dígitos, sem zeros à esquerda; acha pela
 * chave de acesso (inteira ou parte) e pelo tipo ("NF 910", "recibo"). O texto que a coluna DOC. mostra acha a própria linha.
 * Dados sintéticos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { docDaLinha, documentoCasaComFiltro, normalizarNumeroDoc, PLACEHOLDER_FILTRO_DOCUMENTO, type DocumentoDaLinha } from './documentoHelper';

const SEM_CAMPO = { tipo_documento: null, numero_documento: null };
const CHAVE = '50261034053649000192550010000139101123456789';
const NF: DocumentoDaLinha = { especie: 'nf', numero: '000.013.910', chave_acesso: CHAVE };
const casa = (termo: string, docs: DocumentoDaLinha[], lanc = SEM_CAMPO) => documentoCasaComFiltro(termo, lanc, docs);

describe('o filtro Documento', () => {
  it('".910", "910" e "000.000.910" acham o MESMO lançamento (só dígitos, sem zeros à esquerda, nos dois lados)', () => {
    for (const t of ['.910', '910', '000.000.910', '13910', '000013910', '13.910']) expect(casa(t, [NF]), t).toBe(true);
    expect(casa('911', [NF])).toBe(false);
  });
  it('acha pelo documento LIGADO (a nota da compra numa parcela sem número próprio), não só pelo campo antigo', () => {
    expect(casa('910', [NF])).toBe(true);
    expect(casa('910', [])).toBe(false);
    expect(casa('910', [], { tipo_documento: 'Nota Fiscal', numero_documento: '13910' })).toBe(true);
  });
  it('a nota de uma compra parcelada acha TODAS as parcelas ligadas a ela', () => {
    const parcelas = [1, 2, 3].map(() => [NF]);
    expect(parcelas.filter((docs) => casa('910', docs))).toHaveLength(3);
  });
  it('acha pela chave de acesso, inteira ou parte (4+ dígitos)', () => {
    expect(casa(CHAVE, [NF])).toBe(true);
    expect(casa('3405 3649 0001', [NF])).toBe(true);
    expect(casa('9999999999', [NF])).toBe(false);
  });
  it('documento CANCELADO não entra', () => {
    expect(casa('910', [{ ...NF, cancelado: true }])).toBe(false);
    expect(casa(CHAVE, [{ ...NF, cancelado: true }])).toBe(false);
  });
  it('o tipo na busca: "NF 910" acha a nota e não o boleto; "recibo" sozinho acha os recibos', () => {
    const boleto: DocumentoDaLinha = { especie: 'boleto', numero: '910' };
    expect(casa('NF 910', [NF])).toBe(true);
    expect(casa('NF 910', [boleto])).toBe(false);
    expect(casa('boleto 910', [boleto])).toBe(true);
    expect(casa('recibo', [{ especie: 'recibo', numero: '55' }])).toBe(true);
    expect(casa('recibo', [NF])).toBe(false);
    expect(casa('xpto 910', [NF])).toBe(false);
  });
  it('o texto que a coluna DOC. mostra acha a própria linha', () => {
    const rotulo = docDaLinha(SEM_CAMPO, [NF]).rotulo;
    expect(rotulo).toBeTruthy();
    expect(casa(rotulo ?? '', [NF])).toBe(true);
  });
  it('vazio não filtra', () => {
    expect(casa('', [])).toBe(true);
    expect(casa('   ', [NF])).toBe(true);
  });
  it('a tela usa o dono e o placeholder novo (lido da fonte)', () => {
    const fonte = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
    expect(PLACEHOLDER_FILTRO_DOCUMENTO).toBe('Nº ou chave');
    expect(fonte).toMatch(/documentoCasaComFiltro\(documentoFiltro, l, documentosPorLancamento\?\.get\(l\.id\)\)/);
    expect(fonte.match(/placeholder=\{PLACEHOLDER_FILTRO_DOCUMENTO\}/g) ?? []).toHaveLength(2);
    expect(fonte).not.toMatch(/formatDocCompleto/);
  });
});

describe('FIN-FILTRO-DOC-TEXTO-01 — número com letras', () => {
  const recibo = (numero: string): DocumentoDaLinha => ({ especie: 'recibo', numero });
  const nfLetra: DocumentoDaLinha = { especie: 'nf', numero: 'R_D05' };
  it('normaliza os dois lados: só [a-z0-9], sem acento, sem zeros à esquerda em cada sequência de dígitos', () => {
    expect(normalizarNumeroDoc('R_D015')).toBe('rd15');
    expect(normalizarNumeroDoc('000.000.910')).toBe('910');
    expect(normalizarNumeroDoc('Série-Ã 007/A0')).toBe('seriea7a0');
  });
  it('"R_D15" acha "R_D15" e "R_D015"; "rd15" acha "R_D15"; "D015" acha "R_D15"', () => {
    expect(casa('R_D15', [recibo('R_D15')])).toBe(true);
    expect(casa('R_D15', [recibo('R_D015')])).toBe(true);
    expect(casa('rd15', [recibo('R_D15')])).toBe(true);
    expect(casa('D015', [recibo('R_D15')])).toBe(true);
    expect(casa('R_D16', [recibo('R_D15')])).toBe(false);
  });
  it('com letra, os dígitos soltos não acham qualquer número ("R_D15" não acha a NF 915)', () => {
    expect(casa('R_D15', [{ especie: 'nf', numero: '915' }])).toBe(false);
  });
  it('acha pelo campo próprio do lançamento ("Rec. R_D05", o caso da Conta Fazenda)', () => {
    const lanc = { tipo_documento: 'Recibo', numero_documento: 'R_D05' };
    expect(casa('R_D05', [], lanc)).toBe(true);
    expect(casa('Rec. R_', [], lanc)).toBe(true);
    expect(casa('Rec. R_D05', [], lanc)).toBe(true);
  });
  it('"Rec. R_D05" acha o recibo R_D05 e NÃO a NF R_D05 (o tipo filtra e sai do texto)', () => {
    expect(casa('Rec. R_D05', [recibo('R_D05')])).toBe(true);
    expect(casa('Rec. R_D05', [nfLetra])).toBe(false);
    expect(casa('NF R_D05', [nfLetra])).toBe(true);
  });
  it('palavra que não é tipo vira texto, não zera a busca', () => {
    expect(casa('xpto', [recibo('XPTO-1')])).toBe(true);
    expect(casa('xpto 910', [NF])).toBe(false);
  });
  it('as regras de antes continuam: "NF 910", ".910", "000.000.910", a chave e o cancelado', () => {
    for (const t of ['NF 910', '.910', '000.000.910']) expect(casa(t, [NF]), t).toBe(true);
    expect(casa('3405 3649 0001', [NF])).toBe(true);
    expect(casa('R_D05', [{ ...recibo('R_D05'), cancelado: true }])).toBe(false);
    expect(casa('', [recibo('R_D05')])).toBe(true);
  });
});
