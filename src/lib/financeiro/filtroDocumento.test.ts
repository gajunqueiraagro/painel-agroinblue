/**
 * FIN-FILTRO-DOC-01 — o filtro "Documento" do Financeiro V2 acha o lançamento pelo número de QUALQUER documento vivo ligado a ele
 * (os da OC e a nota das parcelas inclusive) e pelo campo antigo do lançamento; compara só dígitos, sem zeros à esquerda; acha pela
 * chave de acesso (inteira ou parte) e pelo tipo ("NF 910", "recibo"). O texto que a coluna DOC. mostra acha a própria linha.
 * Dados sintéticos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { docDaLinha, documentoCasaComFiltro, PLACEHOLDER_FILTRO_DOCUMENTO, type DocumentoDaLinha } from './documentoHelper';

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
    expect(PLACEHOLDER_FILTRO_DOCUMENTO).toBe('Número da NF, recibo ou chave');
    expect(fonte).toMatch(/documentoCasaComFiltro\(documentoFiltro, l, documentosPorLancamento\?\.get\(l\.id\)\)/);
    expect(fonte.match(/placeholder=\{PLACEHOLDER_FILTRO_DOCUMENTO\}/g) ?? []).toHaveLength(2);
    expect(fonte).not.toMatch(/formatDocCompleto/);
  });
});
