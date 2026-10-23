import { describe, it, expect } from 'vitest';
import { lerPdfDoAbate, FRASE_NF_SEM_FUNRURAL, type LeituraDoAbate } from './layoutsAbate';
import { aplicarLeitura } from './aplicarLeitura';
import {
  formAbateVazio, formAbateDoDetalhe, payloadDoFormAbate, lotesPadraoDaEspecie, loteSugeridoPelaQuantidade, loteDoDocumentoLido, totalDosIncentivos,
  type FormAbate,
} from '@/lib/oc/formDocumentoAbate';
import { retencoesDoAcerto } from '@/lib/oc/camposDaEspecie';
import { conferirDocumentosAbate, faixaDaConferencia, type DocConferencia } from '@/lib/oc/conferirDocumentosAbate';
import type { DocumentoDetalhe, DocumentoPayload, EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import {
  ACERTO_MINERVA, ACERTO_MINERVA_2LOTES, CNPJ_MINERVA, NF_MINERVA, NF_MINERVA_INCENTIVO, ROMANEIO_MINERVA_LT11, ROMANEIO_MINERVA_LT12,
} from './__fixtures__/linhasAbate';

/* OC-DOC-ESPECIE-ABATE-01 passo 7e — varios lotes, credito (incentivo) e NF sem Funrural; o lote padrao por especie. */
const ler = (linhas: string[], especie: EspecieDoc): LeituraDoAbate =>
  lerPdfDoAbate({ linhas, temTexto: true }, { especie, cnpjContraparte: CNPJ_MINERVA });
const lido = (r: LeituraDoAbate) => {
  if (r.tipo !== 'lido') throw new Error(`nao leu: ${r.tipo === 'nao_lido' ? r.frase : ''}`);
  return r;
};
const form = (linhas: string[], especie: EspecieDoc): FormAbate => {
  const r = lido(ler(linhas, especie));
  return aplicarLeitura(formAbateVazio(especie), r.campos, r.dados).form;
};
/** O documento como a view o entrega depois de gravar o payload (natureza a natureza, como `vw_oc_documentos`). */
const r2 = (n: number) => Math.round(n * 100) / 100;
function comoAView(p: DocumentoPayload, id: string): DocConferencia {
  const s = (n: string) => p.componentes.filter(c => c.natureza === n).reduce((a, c) => a + c.valor, 0);
  const acr = s('acrescimo'), ret = s('retencao_sem_caixa');
  return { documentoId: id, especie: p.especie, cancelado: false, qtdComponentes: p.componentes.length, totalAcrescimos: r2(acr),
    totalRetencoesSemCaixa: r2(ret), liquidoProprio: r2(acr - ret), valorLiquido: 0, cab: p.cab ?? null, pesoKg: p.pesoKg ?? null };
}

describe('Acerto Minerva com 2 lotes e creditos', () => {
  const acerto = () => lido(ler(ACERTO_MINERVA_2LOTES, 'acerto'));
  it('soma os dois blocos e le os creditos; a conta bruto − despesas + creditos = total geral fecha', () => {
    expect(acerto().campos).toMatchObject({
      ordemCompra: '10315 · 10314', loteFrigorifico: '11 · 12', dataAbate: '2026-10-01', vencimento: '2026-10-05',
      cab: 54, pesoKg: 12906.5, bruto: 308716.36, liquido: 316489.36,
    });
    expect(acerto().campos.incentivos).toEqual([
      { descricao: 'INCENTIVO PROAPE-PRECOCE/MS', valor: 5540.5 }, { descricao: 'INCENTIVO PROAPE-PRECOCE/MS', valor: 2849.93 },
    ]);
    expect(acerto().avisos).toEqual(['Incentivo 8.390,43 incluído']);
  });
  it('R$/@ com varios lotes = bruto ÷ (kg ÷ 15), 2 casas; os lotes do frigorifico vao em dados, informativos', () => {
    expect(acerto().campos.precoArroba).toBe(358.79);
    expect(acerto().dados.lotes_frigorifico).toEqual([
      { lote: '11', ordem_compra: '10315', cab: 18, kg: 4211, bruto: 100635.67 },
      { lote: '12', ordem_compra: '10314', cab: 36, kg: 8695.5, bruto: 208080.69 },
    ]);
  });
  /* P85 (b) — a conta que nao fecha preenche e AVISA a diferenca em R$ (antes: "nada e preenchido") */
  it('sem os creditos a conta nao fecha: preenche e o aviso diz a diferenca', () => {
    const sem = ACERTO_MINERVA_2LOTES.filter(l => !l.includes('INCENTIVO') && !l.startsWith('Total Créditos'));
    const x = lido(ler(sem, 'acerto'));
    expect(x.avisos.some((a) => a.startsWith('a conta do PDF não fecha (bruto − despesas + créditos ≠ total geral): diferença de R$'))).toBe(true);
  });
  it('um credito que nao soma o "Total Créditos": 3 centavos = nota de arredondamento; R$ 1.000,00 = aviso; os dois preenchem', () => {
    const com = (v: string) => lido(ler(ACERTO_MINERVA_2LOTES.map(l => (l.startsWith('OC: 10315 - INCENTIVO') ? `OC: 10315 - INCENTIVO PROAPE-PRECOCE/MS | ${v}` : l)), 'acerto'));
    expect(com('2.849,90').notas).toContain('diferença de R$ 0,03 de arredondamento no PDF (créditos ≠ Total Créditos)');
    expect(com('1.849,93').avisos).toContain('a conta do PDF não fecha (créditos ≠ Total Créditos): diferença de R$ 1.000,00 · confira');
  });
  it('datas de abate diferentes entre os lotes: a data fica vazia e a faixa avisa, o resto e lido', () => {
    const x = lido(ler(ACERTO_MINERVA_2LOTES.map(l => (l === 'Lote - 12 | Data Abate - 01/10/2026' ? 'Lote - 12 | Data Abate - 02/10/2026' : l)), 'acerto'));
    expect(x.campos.dataAbate).toBeUndefined();
    expect(x.avisos).toContain('data do abate diferente entre os lotes: preencha');
    expect(x.campos.bruto).toBe(308716.36);
  });
  it('o acerto do LT10 (1 lote, sem creditos) segue igual', () => {
    expect(lido(ler(ACERTO_MINERVA, 'acerto')).campos).toEqual({
      ordemCompra: '10352', loteFrigorifico: '10', dataAbate: '2026-10-01', vencimento: '2026-10-05',
      cab: 18, pesoKg: 4095, bruto: 98135.31, precoArroba: 359.47, liquido: 96535.7, incentivos: undefined,
    });
  });
});

describe('NF Minerva com incentivo e sem Funrural', () => {
  const nf = () => lido(ler(NF_MINERVA_INCENTIVO, 'nf_principal'));
  it('Bruto = so o gado; incentivos um por linha; a conta gado + incentivos = total da nota', () => {
    expect(nf().campos).toMatchObject({ numero: '8815', cab: 54, pesoKg: 12906.5, bruto: 308716.36, senar: 617.44 });
    expect(totalDosIncentivos(nf().campos.incentivos ?? [])).toBe(8390.43);
    expect(nf().campos.incentivos).toHaveLength(2);
  });
  it('Funrural e Seguro vazios ficam VAZIOS (nunca 0) e a faixa avisa', () => {
    expect(nf().campos.funrural).toBeUndefined();
    expect(nf().campos.seguro).toBeUndefined();
    expect(nf().avisos).toEqual([FRASE_NF_SEM_FUNRURAL, 'Incentivo 8.390,43 incluído']);
  });
  it('as NFs do produtor: a lista inteira, e o VR (de todas) fica com a soma, sem repartir', () => {
    expect(nf().campos.nfsProdutor?.map(n => [n.numero, n.valor])).toEqual([['9412557', null], ['9412508', null]]);
    expect(nf().dados.nfs_produtor_valor).toBe(217567.08);
  });
  it('sem as linhas de incentivo a conta da nota nao fecha', () => {
    const x = ler(NF_MINERVA_INCENTIVO.filter(l => !l.includes('00000000')), 'nf_principal');
    expect(x.tipo === 'nao_lido' && x.frase).toContain('soma dos produtos ≠ total da nota');
  });
  it('a NF do LT10 segue igual (com Funrural, sem incentivo, sem aviso)', () => {
    const lt10 = lido(ler(NF_MINERVA, 'nf_principal'));
    expect(lt10.campos).toMatchObject({ bruto: 98135.31, funrural: 1295.39, senar: 196.27, seguro: 107.95, precoArroba: 359.47 });
    expect(lt10.campos.incentivos).toBeUndefined();
    expect(lt10.avisos).toEqual([]);
  });
});

describe('o formulario: incentivo, retencoes e lote', () => {
  it('payload: incentivos como componentes tipo incentivo (acrescimo), um por linha; o gado em valor_bruto', () => {
    const p = payloadDoFormAbate(form(NF_MINERVA_INCENTIVO, 'nf_principal'));
    expect(p.componentes.filter(c => c.tipo === 'incentivo').map(c => [c.natureza, c.valor])).toEqual([['acrescimo', 5540.5], ['acrescimo', 2849.93]]);
    expect(p.componentes.find(c => c.tipo === 'valor_bruto')?.valor).toBe(308716.36);
    expect(p.componentes.some(c => c.tipo === 'funrural')).toBe(false);
  });
  it('acerto: retencoes = bruto + incentivo − liquido (617,43); sem incentivo, bruto − liquido', () => {
    expect(retencoesDoAcerto(308716.36, 316489.36, 8390.43)).toBe(617.43);
    expect(retencoesDoAcerto(98135.31, 96535.7)).toBe(1599.61);
    const p = payloadDoFormAbate(form(ACERTO_MINERVA_2LOTES, 'acerto'));
    expect(p.componentes.find(c => c.tipo === 'retencao_acerto')?.valor).toBe(617.43);
  });
  it('reabrir o acerto gravado devolve os incentivos e o mesmo liquido', () => {
    const p = payloadDoFormAbate(form(ACERTO_MINERVA_2LOTES, 'acerto'));
    const det: DocumentoDetalhe = {
      documentoId: 'd1', versao: 1, especie: 'acerto', url: '', documentoOrigemId: null, numero: '', serie: '', chaveAcesso: '',
      dataEmissao: '', observacao: '', emitenteId: null, emitenteNome: '', emitenteDocumento: '', loteIds: [],
      componentes: p.componentes.map(c => ({ ...c, descricao: c.descricao ?? null })), cab: 54, pesoKg: 12906.5,
      dataAbate: '2026-10-01', vencimento: '2026-10-05', dados: p.dados,
    };
    const f = formAbateDoDetalhe(det);
    expect(totalDosIncentivos(f.incentivos)).toBe(8390.43);
    expect(f.liquido).toBe(316489.36);
    expect(f.preservados).toEqual([]);
  });
  it('lote padrao: NF, Acerto e NPR = todos; Romaneio = nenhum; Outro = nenhum', () => {
    const lotes = [{ loteId: 'a' }, { loteId: 'b' }];
    expect(lotesPadraoDaEspecie('nf_principal', lotes)).toEqual(['a', 'b']);
    expect(lotesPadraoDaEspecie('acerto', lotes)).toEqual(['a', 'b']);
    expect(lotesPadraoDaEspecie('npr', lotes)).toEqual(['a', 'b']);
    expect(lotesPadraoDaEspecie('romaneio', lotes)).toEqual([]);
    expect(lotesPadraoDaEspecie('outro', lotes)).toEqual([]);
  });
  it('romaneio: o lote sugerido e o UNICO com a mesma quantidade; dois ou nenhum, em branco', () => {
    const lotes = [{ loteId: 'l1', qtd: 36 }, { loteId: 'l2', qtd: 18 }];
    expect(loteSugeridoPelaQuantidade(lotes, lido(ler(ROMANEIO_MINERVA_LT11, 'romaneio')).campos.cab)).toBe('l2');
    expect(loteSugeridoPelaQuantidade(lotes, lido(ler(ROMANEIO_MINERVA_LT12, 'romaneio')).campos.cab)).toBe('l1');
    expect(loteSugeridoPelaQuantidade([{ loteId: 'a', qtd: 18 }, { loteId: 'b', qtd: 18 }], 18)).toBeNull();
    expect(loteSugeridoPelaQuantidade(lotes, 20)).toBeNull();
  });
});

describe('a conferencia da OC de 2 lotes (passo 3, com incentivo)', () => {
  const docs = () => [
    comoAView(payloadDoFormAbate(form(NF_MINERVA_INCENTIVO, 'nf_principal')), 'nf'),
    comoAView(payloadDoFormAbate(form(ACERTO_MINERVA_2LOTES, 'acerto')), 'ac'),
    comoAView(payloadDoFormAbate(form(ROMANEIO_MINERVA_LT11, 'romaneio')), 'r11'),
    comoAView(payloadDoFormAbate(form(ROMANEIO_MINERVA_LT12, 'romaneio')), 'r12'),
  ];
  it('bruto NF (gado + incentivo) = bruto Acerto = 317.106,79; cab e kg batem com a soma dos 2 romaneios', () => {
    expect(docs()[0].totalAcrescimos).toBe(317106.79);
    expect(docs()[1].totalAcrescimos).toBe(317106.79);
  });
  it('o liquido diverge por 0,01 (316.489,35 × 316.489,36) e a faixa fica VERMELHA: nao se maquia', () => {
    expect(docs()[0].liquidoProprio).toBe(316489.35);
    expect(docs()[1].liquidoProprio).toBe(316489.36);
    const c = conferirDocumentosAbate(docs());
    expect(c.estado).toBe('vermelho');
    const fx = faixaDaConferencia(c);
    expect(fx.texto).toContain('Líquido');
    expect(fx.texto).toContain('0,01');
    expect(fx.texto).not.toMatch(/Bruto|Cab|Peso/);
  });
});

/* P85 (d) — o lote da OC de um documento lido: pela ORDEM DE COMPRA guardada na observacao do lote, depois pela quantidade; um so' */
describe('loteDoDocumentoLido', () => {
  const LOTES = [{ loteId: 'a', qtd: 21, observacao: '20001' }, { loteId: 'b', qtd: 21, observacao: 'OC 20002 / frig.' }, { loteId: 'c', qtd: 9, observacao: null }];
  it('a ordem de compra decide (mesmo com a quantidade empatada); sem ela, a quantidade unica; senao, nenhum', () => {
    expect(loteDoDocumentoLido(LOTES, { ordemCompra: '20002', cab: 21 })).toEqual({ loteId: 'b', frase: 'lote pela ordem de compra 20002 · confira' });
    expect(loteDoDocumentoLido(LOTES, { ordemCompra: '99999', cab: 9 })).toEqual({ loteId: 'c', frase: 'lote sugerido pela quantidade · confira' });
    expect(loteDoDocumentoLido(LOTES, { ordemCompra: null, cab: 21 })).toBeNull();
    expect(loteDoDocumentoLido(LOTES, { ordemCompra: '2000', cab: null })).toBeNull();
  });
});

