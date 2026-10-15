import { describe, it, expect } from 'vitest';
import { montarLinhas } from './montarLinhas';
import { numeroDoPdf } from './numeroDoPdf';
import { acharChaveNFe, dvDaChaveOk } from './chaveNFe';
import { lerPdfDoAbate, FRASE_NAO_RECONHECIDO, FRASE_SEM_TEXTO, type LeituraDoAbate } from './layoutsAbate';
import { aplicarLeitura, fraseDaLeitura } from './aplicarLeitura';
import { extrairDanfe } from '@/lib/oc/extrairDanfe';
import { formAbateVazio } from '@/lib/oc/formDocumentoAbate';
import type { EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import {
  ACERTO_JBS, ACERTO_MINERVA, CHAVE_JBS, CHAVE_MINERVA, CNPJ_JBS, CNPJ_MINERVA, NF_JBS, NF_MINERVA, ROMANEIO_JBS, ROMANEIO_MINERVA,
} from './__fixtures__/linhasAbate';

/* OC-DOC-ESPECIE-ABATE-01 passo 4 — a leitura do PDF do abate, sobre fixtures de TEXTO (nenhum PDF no repositorio). */
const ler = (linhas: string[], especie: EspecieDoc, cnpj: string | null = null): LeituraDoAbate =>
  lerPdfDoAbate({ linhas, temTexto: linhas.length > 0 }, { especie, cnpjContraparte: cnpj });
const campos = (r: LeituraDoAbate) => {
  if (r.tipo !== 'lido') throw new Error(`nao leu: ${r.tipo === 'nao_lido' ? r.frase : ''}`);
  return r;
};

describe('montarLinhas (itens falsos)', () => {
  it('agrupa pela altura com 2pt de tolerancia, ordena pela esquerda, junta celulas por " | " e segue pagina a pagina', () => {
    const linhas = montarLinhas([
      [{ str: '10', x: 60, y: 700.5 }, { str: 'Lote:', x: 10, y: 700 }, { str: ' ', x: 90, y: 700 }, { str: 'Total', x: 10, y: 650 },
        { str: '18', x: 40, y: 652 }, { str: 'longe', x: 5, y: 640 }],
      [{ str: 'pag 2', x: 0, y: 800 }],
    ]);
    expect(linhas).toEqual(['Lote: | 10', 'Total | 18', 'longe', 'pag 2']);
  });
});

describe('numero do PDF', () => {
  it('os formatos medidos nos PDFs reais', () => {
    expect(['1 295,39', '69 677,28', '2850,79', '9.512,600', '36,0', '203.705,330', '98.135,31', 'R$ 1.599,61', '273,0000']
      .map(numeroDoPdf)).toEqual([1295.39, 69677.28, 2850.79, 9512.6, 36, 203705.33, 98135.31, 1599.61, 273]);
    expect([numeroDoPdf('Normal'), numeroDoPdf(''), numeroDoPdf('17,62 @')]).toEqual([null, null, null]);
  });
});

describe('chave de acesso so com DV modulo 11', () => {
  it('regressao da NF da JBS: os digitos do DOCUMENTO colados antes nao contaminam a chave, e o CNPJ e o da JBS', () => {
    const corrido = `DADOS DO PRODUTO DOCUMENTO:   3010403 ${CHAVE_JBS} 150260046878486   13/10/2026 VALOR TOTAL DA NOTA 215.969,33`;
    expect(acharChaveNFe(corrido)).toBe(CHAVE_JBS);
    const d = extrairDanfe(corrido);
    expect([d.emitenteCnpj, d.numero, d.serie, d.dataEmissao]).toEqual([CNPJ_JBS, '123153', '4', '2026-10-13']);
  });
  it('um digito trocado derruba o DV e a chave nao e lida', () => {
    expect(dvDaChaveOk(CHAVE_MINERVA)).toBe(true);
    const errada = CHAVE_MINERVA.slice(0, 30) + ((Number(CHAVE_MINERVA[30]) + 1) % 10) + CHAVE_MINERVA.slice(31);
    expect(acharChaveNFe(errada)).toBeNull();
  });
  it('emitente para no fim da linha (antes vinha com o endereco)', () => {
    expect(extrairDanfe(NF_MINERVA.join('\n')).emitenteNome).toBe('FORTUNCERES S A');
    expect(extrairDanfe(NF_JBS.join('\n')).emitenteNome).toBe('JBS SA');
  });
});

describe('os 6 layouts', () => {
  it('NF Minerva', () => {
    const r = campos(ler(NF_MINERVA, 'nf_principal'));
    expect(r.layout).toBe('nf_minerva');
    expect(r.campos).toMatchObject({ numero: '8812', serie: '2', dataEmissao: '2026-10-01', emitenteCnpj: CNPJ_MINERVA, cab: 18, pesoKg: 4095,
      precoArroba: 359.47, bruto: 98135.31, funrural: 1295.39, senar: 196.27, seguro: 107.95, dataAbate: '2026-10-01' });
    expect(r.campos.nfsProdutor).toEqual([{ numero: '9413559', data: '2026-09-29', valor: 69677.28 }]);
  });
  it('Acerto Minerva', () => {
    const r = campos(ler(ACERTO_MINERVA, 'acerto'));
    expect(r.campos).toEqual({ ordemCompra: '10352', loteFrigorifico: '10', dataAbate: '2026-10-01', vencimento: '2026-10-05',
      cab: 18, pesoKg: 4095, bruto: 98135.31, precoArroba: 359.47, liquido: 96535.7 });
  });
  it('Romaneio Minerva (CNPJ pela contraparte)', () => {
    const r = campos(ler(ROMANEIO_MINERVA, 'romaneio', CNPJ_MINERVA));
    expect(r.campos).toEqual({ loteFrigorifico: '10', op: '46323', dataAbate: '2026-10-01', cab: 18, pesoKg: 4095 });
    expect(r.dados).toEqual({ ordem_compra: '10352' });
  });
  it('NF JBS: RAT no lugar do Seguro, duas NFs do produtor sem valor, R$/@ vazio', () => {
    const r = campos(ler(NF_JBS, 'nf_principal'));
    expect(r.campos).toMatchObject({ numero: '123153', serie: '4', emitenteCnpj: CNPJ_JBS, cab: 36, pesoKg: 9512.6, bruto: 215969.33,
      funrural: 2850.79, senar: 431.94, rat: 237.57 });
    expect(r.campos.precoArroba).toBeUndefined();
    expect(r.campos.seguro).toBeUndefined();
    expect(r.campos.nfsProdutor?.map(n => [n.numero, n.valor])).toEqual([['9444845', null], ['9444790', null]]);
    expect(r.dados).toEqual({ ordem_compra: '895279', carga: '1', instrucao: '970373', documento_frig: '3010403' });
  });
  it('Acerto JBS: Pedido na Ordem compra, R$/@ medio impresso, e o "Data:" e a data do abate (JBS fatura no dia)', () => {
    const r = campos(ler(ACERTO_JBS, 'acerto', CNPJ_JBS));
    expect(r.campos).toEqual({ ordemCompra: '895279', dataAbate: '2026-10-13', cab: 36, pesoKg: 9512.6, precoArroba: 340.55, bruto: 215969.33,
      liquido: 212449.03, vencimento: '2026-11-12' });
    expect(r.dados).toEqual({ documento_frig: '3010402', instrucao: '970373' });
  });
  it('Romaneio JBS: sem OP e sem lote; Pedido e Carga informativos', () => {
    const r = campos(ler(ROMANEIO_JBS, 'romaneio', CNPJ_JBS));
    expect(r.campos).toEqual({ dataAbate: '2026-10-13', cab: 36, pesoKg: 9512.6 });
    expect(r.dados).toEqual({ ordem_compra: '895279', carga: '1' });
  });
});

describe('nunca preenche pela metade', () => {
  it('ancora faltando: formato nao reconhecido', () => {
    const r = ler(ACERTO_MINERVA.filter(l => !l.startsWith('Acertos no Pagamento')), 'acerto');
    expect(r).toEqual({ tipo: 'nao_lido', motivo: 'desconhecido', frase: FRASE_NAO_RECONHECIDO });
  });
  it('texto que bate em dois layouts: nada', () => {
    expect(ler([...ACERTO_MINERVA, ...ACERTO_JBS], 'acerto', CNPJ_JBS)).toMatchObject({ tipo: 'nao_lido', motivo: 'dois_layouts' });
  });
  it('um centavo no Total Geral: a conta do PDF nao fecha e nada e preenchido', () => {
    const r = ler(ACERTO_MINERVA.map(l => (l === 'Total Geral | 96.535,70' ? 'Total Geral | 96.535,71' : l)), 'acerto');
    expect(r).toMatchObject({ tipo: 'nao_lido', motivo: 'nao_fecha' });
  });
  it('Acerto JBS sem o "Data:": a data do abate e obrigatoria, nada e preenchido', () => {
    const sem = ACERTO_JBS.map(l => (l.startsWith('Documento:') ? 'Documento: 3010402 | NF: | Instrução: 970373' : l));
    expect(ler(sem, 'acerto', CNPJ_JBS)).toMatchObject({ tipo: 'nao_lido', motivo: 'incompleto' });
  });
  it('cab sem kg: falta o peso, nada e preenchido', () => {
    const r = ler(ROMANEIO_MINERVA.map(l => (l.startsWith('Total |') ? 'Total | 18 | Média Total (KG): | 227,50' : l)), 'romaneio', CNPJ_MINERVA);
    expect(r).toMatchObject({ tipo: 'nao_lido', motivo: 'incompleto' });
  });
  it('NPR sem camada de texto: so anexado', () => {
    expect(lerPdfDoAbate({ linhas: [], temTexto: false }, { especie: 'npr', cnpjContraparte: null }))
      .toEqual({ tipo: 'nao_lido', motivo: 'sem_texto', frase: FRASE_SEM_TEXTO });
  });
  it('especie trocada: um Acerto lido com a especie Romaneio so avisa', () => {
    expect(ler(ACERTO_MINERVA, 'romaneio')).toEqual({ tipo: 'nao_lido', motivo: 'especie_trocada',
      frase: 'Este PDF é Acerto Minerva; a espécie escolhida é Romaneio · nada preenchido' });
  });
  it('sem CNPJ no texto: a contraparte da OC tem de ser do frigorifico', () => {
    expect(ler(ACERTO_JBS, 'acerto', CNPJ_MINERVA)).toMatchObject({ tipo: 'nao_lido', motivo: 'contraparte' });
    expect(ler(ROMANEIO_MINERVA, 'romaneio', null)).toMatchObject({ tipo: 'nao_lido', motivo: 'contraparte' });
  });
});

describe('aplicarLeitura: so campo vazio, so o que a especie desenha', () => {
  it('o digitado fica; conta o que preencheu; dados informativos entram sem contar', () => {
    const r = campos(ler(ACERTO_JBS, 'acerto', CNPJ_JBS));
    const antes = { ...formAbateVazio('acerto'), bruto: 1, dadosLidos: { instrucao: 'ja' } };
    const { form, preenchidos } = aplicarLeitura(antes, r.campos, r.dados);
    expect(form.bruto).toBe(1);
    expect(form.liquido).toBe(212449.03);
    expect(preenchidos).toEqual(['dataAbate', 'vencimento', 'ordemCompra', 'cab', 'pesoKg', 'precoArroba', 'liquido']);
    expect(form.dadosLidos).toEqual({ instrucao: 'ja', documento_frig: '3010402' });
    expect(fraseDaLeitura(r.rotulo, preenchidos.length)).toBe('lido do PDF (Acerto JBS): 7 campos · confira antes de salvar');
  });
  it('NF JBS na grade da NF: RAT e as NFs do produtor', () => {
    const r = campos(ler(NF_JBS, 'nf_principal'));
    const { form } = aplicarLeitura(formAbateVazio('nf_principal'), r.campos, r.dados);
    expect([form.rat, form.seguro, form.precoArroba, form.nfsProdutor.length]).toEqual([237.57, null, null, 2]);
  });
});
