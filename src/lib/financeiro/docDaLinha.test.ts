/** O documento da linha — PARC-LIVRES-01 passo 3: um texto só para a lista, o resumo do modal e a aba Documentos. */
import { describe, expect, it } from 'vitest';
import { ehParcelaDeParcelamento, topoDoDocumentoTravado, docDaLinha, resumoDosDocumentos, rotuloDoDocumento } from './documentoHelper';

const NF = { especie: 'nf', numero: '518', cancelado: false };
const BOLETO = { especie: 'boleto', numero: null, cancelado: false };

describe('rotuloDoDocumento — as cinco formas', () => {
  it('"NF 000.000.000", "Rec. X", "Bol. X", "Comp. X"; sem prefixo (o genérico), só o número; sem número, vazio', () => {
    expect(rotuloDoDocumento('NF', '518')).toBe('NF 000.000.518');
    expect(rotuloDoDocumento('NF', '000.000.518')).toBe('NF 000.000.518');
    expect(rotuloDoDocumento('Rec.', '0096')).toBe('Rec. 0096');
    expect(rotuloDoDocumento('Bol.', '34191.79001')).toBe('Bol. 34191.79001');
    expect(rotuloDoDocumento('Comp.', 'E123')).toBe('Comp. E123');
    expect(rotuloDoDocumento('', ' 249220 ')).toBe('249220');
    expect(rotuloDoDocumento('NF', '  ')).toBe('');
    expect(rotuloDoDocumento('', null)).toBe('');
  });
  it('número de NF com mais de 9 dígitos NÃO é cortado nem mascarado (vai como está)', () => {
    expect(rotuloDoDocumento('NF', '20260930010176200')).toBe('NF 20260930010176200');
  });
});

describe('docDaLinha', () => {
  it('parcela SEM número próprio e com a NF da compra ligada: "NF 000.000.518", origem "nota", com clipe', () => {
    expect(docDaLinha({ tipo_documento: null, numero_documento: null }, [NF, BOLETO])).toEqual({
      rotulo: 'NF 000.000.518', titulo: 'NF 000.000.518 · nota da compra', origem: 'nota', clipe: true, resumo: 'NF 000.000.518 · 1 boleto' });
  });
  it('o Nº Documento do próprio lançamento vem primeiro, com o prefixo do tipo', () => {
    expect(docDaLinha({ tipo_documento: 'Nota Fiscal', numero_documento: '1234' }, []).rotulo).toBe('NF 000.001.234');
    expect(docDaLinha({ tipo_documento: 'Recibo', numero_documento: '77' }, [NF])).toMatchObject({ rotulo: 'Rec. 77', origem: 'lancamento', clipe: true });
    expect(docDaLinha({ tipo_documento: 'Fatura', numero_documento: 'F-9' }, []).rotulo).toBe('Bol. F-9');
    expect(docDaLinha({ tipo_documento: 'Comprovante', numero_documento: 'X' }, []).rotulo).toBe('Comp. X');
  });
  it('PARC-CONTRATO-01 item 4 — tipo GENÉRICO: a coluna mostra SÓ o número; o title diz "Documento N"', () => {
    expect(docDaLinha({ tipo_documento: null, numero_documento: '109122795412' }, [])).toMatchObject({ rotulo: '109122795412', titulo: 'Documento 109122795412', origem: 'lancamento' });
    expect(docDaLinha({ tipo_documento: 'Outros', numero_documento: '249220' }, [])).toMatchObject({ rotulo: '249220', titulo: 'Documento 249220' });
    expect(docDaLinha({}, [{ especie: 'outro', numero: 'Z' }])).toMatchObject({ rotulo: 'Z', titulo: 'Documento Z', origem: 'documento' });
  });
  it('item 4 — os quatro tipos com nome seguem COM prefixo, e o title deles é o próprio rótulo', () => {
    expect(docDaLinha({ tipo_documento: 'Nota Fiscal', numero_documento: '1234' }, [])).toMatchObject({ rotulo: 'NF 000.001.234', titulo: 'NF 000.001.234' });
    expect(docDaLinha({ tipo_documento: 'Recibo', numero_documento: '77' }, [])).toMatchObject({ rotulo: 'Rec. 77', titulo: 'Rec. 77' });
    expect(docDaLinha({ tipo_documento: 'Boleto', numero_documento: 'B1' }, [])).toMatchObject({ rotulo: 'Bol. B1', titulo: 'Bol. B1' });
    expect(docDaLinha({ tipo_documento: 'Comprovante', numero_documento: 'X' }, [])).toMatchObject({ rotulo: 'Comp. X', titulo: 'Comp. X' });
  });
  it('sem documento nenhum: sem texto e SEM clipe', () => {
    expect(docDaLinha({ tipo_documento: null, numero_documento: null }, [])).toEqual({ rotulo: '', titulo: '', origem: null, clipe: false, resumo: '' });
    expect(docDaLinha({ tipo_documento: null, numero_documento: null }, undefined).clipe).toBe(false);
  });
  it('documento CANCELADO não conta: nem texto, nem clipe', () => {
    expect(docDaLinha({}, [{ ...NF, cancelado: true }])).toEqual({ rotulo: '', titulo: '', origem: null, clipe: false, resumo: '' });
  });
  it('só arquivo sem número (boleto anexado): clipe aceso, coluna vazia', () => {
    expect(docDaLinha({}, [BOLETO])).toEqual({ rotulo: '', titulo: '', origem: null, clipe: true, resumo: '1 boleto' });
  });
  it('sem NF, outro documento com número dá o prefixo da espécie', () => {
    expect(docDaLinha({}, [{ especie: 'recibo', numero: '0096' }]).rotulo).toBe('Rec. 0096');
    expect(docDaLinha({}, [{ especie: 'comprovante', numero: 'C1' }]).rotulo).toBe('Comp. C1');
    expect(docDaLinha({}, [{ especie: 'outro', numero: 'Z' }])).toMatchObject({ rotulo: 'Z', origem: 'documento' });
    expect(docDaLinha({}, [{ especie: 'nf_principal', numero: '3' }]).rotulo).toBe('NF 000.000.003');
  });
});

describe('resumoDosDocumentos — o title do clipe', () => {
  it('as notas pelo número, o resto pela contagem, no singular e no plural', () => {
    expect(resumoDosDocumentos([NF, BOLETO, BOLETO, { especie: 'comprovante', numero: null }, { especie: 'outro', numero: null }, { especie: 'qualquer', numero: null }]))
      .toBe('NF 000.000.518 · 2 boletos · 1 comprovante · 2 outros documentos');
    expect(resumoDosDocumentos([{ especie: 'nf', numero: null }])).toBe('NF sem número');
    expect(resumoDosDocumentos([])).toBe('');
  });
  it('"-" não é número de documento: sem rótulo (medido no NJ: 62 linhas saíam como "Doc. -")', () => {
    expect(docDaLinha({ tipo_documento: null, numero_documento: '-' }, []).rotulo).toBe('');
    expect(docDaLinha({ tipo_documento: null, numero_documento: ' — ' }, [{ especie: 'nf', numero: '518' }]).rotulo).toBe('NF 000.000.518');
    expect(docDaLinha({ tipo_documento: null, numero_documento: '12-3' }, []).rotulo).toBe('12-3');
  });
});

describe('PARC-FECHA-02 item 1 — no parcelado o topo "Tipo / Nº Documento" fica em leitura', () => {
  const PARCELA = { origem_tipo: 'parcela_principal', origem_lancamento: null };
  it('parcela de PARCELAMENTO: origem_tipo parcela_principal e sem origem_lancamento; a do motor (financiamento com juros) não é', () => {
    expect(ehParcelaDeParcelamento(PARCELA)).toBe(true);
    expect(ehParcelaDeParcelamento({ origem_tipo: 'parcela_principal', origem_lancamento: 'parcela_financiamento' })).toBe(false);
    expect(ehParcelaDeParcelamento({ origem_tipo: null, origem_lancamento: 'manual' })).toBe(false);
    expect(ehParcelaDeParcelamento(null)).toBe(false);
  });
  it('novo: trava só na modalidade parcelada; gravado: trava só na parcela de parcelamento — lançamento comum nunca', () => {
    expect(topoDoDocumentoTravado({ novo: true, modalidadeParcelada: true })).toBe(true);
    expect(topoDoDocumentoTravado({ novo: true, modalidadeParcelada: false })).toBe(false);
    expect(topoDoDocumentoTravado({ novo: false, modalidadeParcelada: true, lancamento: { origem_tipo: null, origem_lancamento: 'manual' } })).toBe(false);
    expect(topoDoDocumentoTravado({ novo: false, modalidadeParcelada: false, lancamento: PARCELA })).toBe(true);
  });
});
