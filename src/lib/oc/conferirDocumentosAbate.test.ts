import { describe, it, expect } from 'vitest';
import {
  conferirDocumentosAbate, conferenciaDoDocumento, conferenciaAoVivo, faixaDaConferencia, type DocConferencia,
} from './conferirDocumentosAbate';
import type { EspecieDoc } from '@/hooks/useOperacaoDocumentos';

/* OC-DOC-ESPECIE-ABATE-01 passo 3 — a conferencia entre os documentos do abate. */
let n = 0;
const doc = (especie: EspecieDoc, p: Partial<DocConferencia> = {}): DocConferencia => ({
  documentoId: `d${n++}`, especie, cancelado: false, qtdComponentes: 0, totalAcrescimos: 0, totalRetencoesSemCaixa: 0,
  liquidoProprio: 0, valorLiquido: 0, cab: null, pesoKg: null, ...p,
});
const comValor = (bruto: number, liquido: number, extra: Partial<DocConferencia> = {}) =>
  ({ qtdComponentes: 1, totalAcrescimos: bruto, totalRetencoesSemCaixa: Math.round((bruto - liquido) * 100) / 100, liquidoProprio: liquido, ...extra });

/* O LT10 real (OC 8c8a864d, lido em 14/10): NF com valor, NPR e Romaneio sem nenhum componente, sem Acerto, sem cab/kg. */
const LT10: DocConferencia[] = [
  doc('nf_principal', comValor(98135.31, 96535.70)),
  doc('npr'),
  doc('romaneio'),
];
/* Um abate inteiro que bate. */
const BATE = (): DocConferencia[] => [
  doc('nf_principal', comValor(98135.31, 96535.70, { cab: 18, pesoKg: 4095 })),
  doc('acerto', comValor(98135.31, 96535.70, { cab: 18, pesoKg: 4095 })),
  doc('npr', comValor(96535.70, 96535.70)),
  doc('romaneio', { cab: 18, pesoKg: 4095 }),
];

describe('conferirDocumentosAbate', () => {
  it('LT10 real: CINZA, nada a conferir; NPR e Romaneio sem valores; falta o Acerto', () => {
    const r = conferirDocumentosAbate(LT10);
    expect(r.estado).toBe('neutro');
    const f = faixaDaConferencia(r);
    expect(f.texto).toBe('Nada a conferir · NPR e Romaneio sem valores');
    expect(f.falta).toBe('falta: Acerto');
    expect(conferenciaDoDocumento(r, 'npr').texto).toBe('sem valores');
    expect(conferenciaDoDocumento(r, 'romaneio').texto).toBe('sem valores');
    expect(conferenciaDoDocumento(r, 'nf_principal').texto).toBe('soma no valor da OC');
    expect(conferenciaDoDocumento(r, 'outro').texto).toBe('informativo · não soma');
  });

  it('tudo bate: VERDE, com o que foi comparado', () => {
    const r = conferirDocumentosAbate(BATE());
    expect(r.estado).toBe('verde');
    expect(faixaDaConferencia(r).texto)
      .toBe('✓ Confere · 18 cab · 4.095 kg · Bruto NF = Acerto 98.135,31 · Retenções 1.599,61 · Líquido NF = Acerto = NPR 96.535,70');
    expect(faixaDaConferencia(r).falta).toBeNull();
    expect(conferenciaDoDocumento(r, 'acerto')).toEqual({ texto: '✓ bate com a NF', tom: 'verde' });
    expect(conferenciaDoDocumento(r, 'npr')).toEqual({ texto: '✓ = líquido', tom: 'verde' });
    expect(conferenciaDoDocumento(r, 'romaneio')).toEqual({ texto: '✓ média 227,50 kg', tom: 'verde' });
  });

  it('bruto diverge (NF x Acerto)', () => {
    const docs = BATE(); docs[1] = doc('acerto', comValor(98000, 96535.70, { cab: 18, pesoKg: 4095 }));
    const r = conferirDocumentosAbate(docs);
    expect(r.estado).toBe('vermelho');
    expect(r.textosDivergencia[0]).toBe('Bruto NF 98.135,31 ≠ Acerto 98.000,00 · diferença 135,31');
    expect(conferenciaDoDocumento(r, 'acerto')).toEqual({ texto: '≠ NF: bruto 135,31', tom: 'vermelho' });
  });

  it('liquido diverge: a NPR diz a diferenca; a faixa leva o primeiro e o (+N), a lista no title', () => {
    const docs = BATE(); docs[2] = doc('npr', comValor(96000, 96000));
    const r = conferirDocumentosAbate(docs);
    const f = faixaDaConferencia(r);
    expect(f.estado).toBe('vermelho');
    expect(f.texto).toBe('Líquido NF 96.535,70 ≠ NPR 96.000,00 · diferença 535,70');
    expect(conferenciaDoDocumento(r, 'npr')).toEqual({ texto: '≠ líquido: 535,70', tom: 'vermelho' });
    const docs2 = BATE(); docs2[2] = doc('npr', comValor(96000, 96000)); docs2[3] = doc('romaneio', { cab: 17, pesoKg: 4095 });
    const f2 = faixaDaConferencia(conferirDocumentosAbate(docs2));
    expect(f2.texto).toBe('Líquido NF 96.535,70 ≠ NPR 96.000,00 · diferença 535,70 (+1)');
    expect(f2.titulo).toContain('Cab NF 18 ≠ Romaneio 17 · diferença 1 cab');
  });

  it('cab e kg divergem no Romaneio', () => {
    const docs = BATE(); docs[3] = doc('romaneio', { cab: 18, pesoKg: 4080.5 });
    const r = conferirDocumentosAbate(docs);
    expect(r.textosDivergencia).toEqual(['Peso NF 4.095 ≠ Romaneio 4.080,50 · diferença 14,50 kg']);
    expect(conferenciaDoDocumento(r, 'romaneio')).toEqual({ texto: '≠ kg 14,50', tom: 'vermelho' });
    const d2 = BATE(); d2[3] = doc('romaneio', { cab: 17, pesoKg: 4095 });
    expect(conferenciaDoDocumento(conferirDocumentosAbate(d2), 'romaneio')).toEqual({ texto: '≠ cab 1', tom: 'vermelho' });
  });

  it('um centavo e divergencia (sem tolerancia)', () => {
    const docs = BATE(); docs[2] = doc('npr', comValor(96535.69, 96535.69));
    expect(conferirDocumentosAbate(docs).estado).toBe('vermelho');
  });

  it('so um item comparavel: VERDE com "não conferido"', () => {
    const r = conferirDocumentosAbate([doc('nf_principal', comValor(98135.31, 96535.70)), doc('npr', comValor(96535.70, 96535.70))]);
    expect(r.estado).toBe('verde');
    const f = faixaDaConferencia(r);
    expect(f.texto).toBe('✓ Confere · Líquido NF = NPR 96.535,70 · não conferido: Bruto, Cab e Peso');
    expect(f.falta).toBe('falta: Acerto, Romaneio');
  });

  it('vazio x R$ 0: sem componente nao compara; R$ 0 digitado e dado e diverge', () => {
    const nf = doc('nf_principal', comValor(100, 100));
    expect(conferirDocumentosAbate([nf, doc('npr')]).estado).toBe('neutro');
    const r = conferirDocumentosAbate([nf, doc('npr', comValor(0, 0))]);
    expect(r.estado).toBe('vermelho');
    expect(r.textosDivergencia).toEqual(['Líquido NF 100,00 ≠ NPR 0,00 · diferença 100,00']);
  });

  it('NF complementar soma na NF; cancelado fica fora', () => {
    const docs = [
      doc('nf_principal', comValor(90000, 88000)), doc('nf_complementar', comValor(8135.31, 8535.70)),
      doc('acerto', comValor(98135.31, 96535.70)),
      doc('acerto', { ...comValor(1, 1), cancelado: true }),
    ];
    const r = conferirDocumentosAbate(docs);
    expect(r.estado).toBe('verde');
    expect(faixaDaConferencia(r).texto).toContain('Bruto NF = Acerto 98.135,31');
  });

  it('conferencia ao vivo: o Acerto digitado contra a NF e a NPR registradas', () => {
    const registrados = [doc('nf_principal', comValor(98135.31, 96535.70)), doc('npr', comValor(96535.70, 96535.70))];
    const digitando = doc('acerto', comValor(98135.31, 96535.70));
    expect(conferenciaAoVivo(registrados, digitando))
      .toEqual({ texto: 'Bruto 98.135,31 = NF ✓ · Líquido 96.535,70 = NF ✓ · Líquido 96.535,70 = NPR ✓', tom: 'verde' });
    const errado = conferenciaAoVivo(registrados, doc('acerto', comValor(98135.31, 96000)));
    expect(errado?.tom).toBe('vermelho');
    expect(errado?.texto).toContain('Líquido Acerto 96.000,00 ≠ NPR 96.535,70 · diferença 535,70');
    expect(conferenciaAoVivo(registrados, doc('acerto'))).toBeNull();
  });
});
