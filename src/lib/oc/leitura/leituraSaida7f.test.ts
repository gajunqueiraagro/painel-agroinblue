import { describe, it, expect } from 'vitest';
import { lerPdfDoAbate, gtaNormalizada, type LeituraDoAbate } from './layoutsAbate';
import { aplicarLeitura } from './aplicarLeitura';
import { formAbateVazio, payloadDoFormAbate, lotesPadraoDaEspecie, type FormAbate } from '@/lib/oc/formDocumentoAbate';
import { camposDaEspecie, GRUPOS_DO_SELETOR_ABATE } from '@/lib/oc/camposDaEspecie';
import { conferirDocumentosAbate, faixaDaConferencia, conferenciaDoDocumento, type DocConferencia } from '@/lib/oc/conferirDocumentosAbate';
import type { DocumentoPayload, EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import {
  ACERTO_JBS, CARTA_GARANTIA_SAIDA, CNPJ_JBS, EGTA_SAIDA, MODELO_B_SAIDA, NFPE_SAIDA, NF_JBS, ROMANEIO_JBS,
} from './__fixtures__/linhasAbate';

/* OC-DOC-SAIDA-FAZENDA-01 (7f) — os documentos da saida da fazenda: leitura, formulario e conferencia. Fixtures de TEXTO. */
const ler = (linhas: string[], especie: EspecieDoc): LeituraDoAbate =>
  lerPdfDoAbate({ linhas, temTexto: true }, { especie, cnpjContraparte: CNPJ_JBS });
const lido = (r: LeituraDoAbate) => {
  if (r.tipo !== 'lido') throw new Error(`nao leu: ${r.tipo === 'nao_lido' ? r.frase : ''}`);
  return r;
};
const form = (linhas: string[], especie: EspecieDoc, extra: Partial<FormAbate> = {}): FormAbate => {
  const r = lido(ler(linhas, especie));
  return { ...aplicarLeitura(formAbateVazio(especie), r.campos, r.dados).form, ...extra };
};
const r2 = (n: number) => Math.round(n * 100) / 100;
/** O documento como a view o entregaria depois de gravar o payload. */
function comoAView(p: DocumentoPayload, id: string): DocConferencia {
  const s = (n: string) => p.componentes.filter(c => c.natureza === n).reduce((a, c) => a + c.valor, 0);
  const acr = s('acrescimo'), ret = s('retencao_sem_caixa');
  return { documentoId: id, especie: p.especie, cancelado: false, qtdComponentes: p.componentes.length, totalAcrescimos: r2(acr),
    totalRetencoesSemCaixa: r2(ret), liquidoProprio: r2(acr - ret), valorLiquido: 0, cab: p.cab ?? null, pesoKg: p.pesoKg ?? null,
    numero: p.numero ?? null, serie: p.serie ?? null, dados: p.dados ?? null };
}

describe('leitura · NFP-e de saida (SEFAZ-MS)', () => {
  it('le numero, serie, emissao, saida, destinatario, cab, valor e a GTA citada', () => {
    expect(lido(ler(NFPE_SAIDA, 'nf_produtor')).campos).toMatchObject({
      numero: '009.444.790', serie: '890', dataEmissao: '2026-10-09', dataSaida: '2026-10-12',
      destinatario: 'FRIGORIFICO TESTE · 02.916.265/0077-68', cab: 18, valorNota: 75483.72, gtas: ['Q-745856'],
    });
  });
  it('sem o titulo da NFP-e nao e NFP-e (a chave sozinha nao basta)', () => {
    expect(ler(NFPE_SAIDA.filter(l => !l.includes('NOTA FISCAL DO PRODUTOR')), 'nf_produtor').tipo).toBe('nao_lido');
  });
  it('a NF da JBS continua sendo so NF JBS (uma ancora so de chave a pegaria tambem)', () => {
    expect(lido(ler(NF_JBS, 'nf_principal')).layout).toBe('nf_jbs');
  });
  it('soma dos produtos que nao fecha com o total recusa (tudo ou nada)', () => {
    const x = ler(NFPE_SAIDA.map(l => (l.startsWith('0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 75.483,72') ? '0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 75.483,70' : l)), 'nf_produtor');
    expect(x.tipo === 'nao_lido' && x.frase).toContain('soma dos produtos ≠ total da nota');
  });
});

describe('leitura · e-GTA, Modelo B e Carta de garantia', () => {
  it('e-GTA: serie, numero, emissao, validade, embarque, femeas, machos, total, finalidade e destino', () => {
    expect(lido(ler(EGTA_SAIDA, 'gta')).campos).toMatchObject({
      serie: 'Q', numero: '745856', dataEmissao: '2026-10-09', validade: '2026-10-15', embarque: '2026-10-12',
      femeas: 18, machos: 0, cab: 18, finalidade: 'ABATE', destino: 'FRIGORIFICO TESTE',
    });
  });
  it('e-GTA com femeas + machos ≠ total recusa', () => {
    const x = ler(EGTA_SAIDA.map(l => (l === '18 | 0 | 18 | DEZOITO ANIMAIS' ? '18 | 1 | 18 | DEZOITO ANIMAIS' : l)), 'gta');
    expect(x.tipo === 'nao_lido' && x.frase).toContain('fêmeas + machos ≠ total');
  });
  it('Modelo B: numero, data e as GTAs citadas; Carta: data de embarque, cabecas e GTAs', () => {
    expect(lido(ler(MODELO_B_SAIDA, 'declaracao')).campos).toMatchObject({
      tipoDeclaracao: 'modelo_b', numero: '27666194', dataEmissao: '2026-10-09', gtas: ['Q-745856', 'Q-745874'],
    });
    expect(lido(ler(CARTA_GARANTIA_SAIDA, 'declaracao')).campos).toMatchObject({
      tipoDeclaracao: 'carta_garantia', dataEmissao: '2026-10-09', cab: 36, gtas: ['Q-745856', 'Q-745874'],
    });
  });
  it('a GTA se escreve de um jeito so', () => {
    expect([gtaNormalizada('Q- 745856'), gtaNormalizada('745856/Q'), gtaNormalizada('Q 745856'), gtaNormalizada('xyz')])
      .toEqual(['Q-745856', 'Q-745856', 'Q-745856', null]);
  });
});

describe('formulario · as quatro especies', () => {
  it('a grade das quatro cabe nas 5 colunas e nas 5 linhas; o seletor tem os dois grupos', () => {
    for (const e of ['nf_produtor', 'gta', 'guia', 'declaracao'] as EspecieDoc[]) {
      const g = camposDaEspecie('abate', e) ?? [];
      expect(g.length).toBeGreaterThan(0);
      expect(g.length).toBeLessThanOrEqual(5);
      for (const l of g) expect(l.reduce((s, c) => s + c.colunas, 0)).toBeLessThanOrEqual(5);
    }
    expect(GRUPOS_DO_SELETOR_ABATE.map(g => g.rotulo)).toEqual(['ABATE', 'SAÍDA']);
  });
  it('NF produtor: valor INFORMATIVO, GTA citada, saida e destinatario em dados; cab na coluna', () => {
    const p = payloadDoFormAbate(form(NFPE_SAIDA, 'nf_produtor'));
    expect(p.componentes.map(c => [c.natureza, c.valor])).toEqual([['informativo', 75483.72]]);
    expect(p.dados).toMatchObject({ gta: 'Q-745856', data_saida: '2026-10-12', destinatario: 'FRIGORIFICO TESTE · 02.916.265/0077-68' });
    expect(p.cab).toBe(18);
  });
  it('GTA: o cab gravado e Femeas + Machos; femeas, machos, finalidade, destino, validade e embarque em dados', () => {
    const p = payloadDoFormAbate(form(EGTA_SAIDA, 'gta'));
    expect(p.cab).toBe(18);
    expect(p.dados).toMatchObject({ femeas: 18, machos: 0, finalidade: 'ABATE', validade: '2026-10-15', embarque: '2026-10-12' });
    expect(p.componentes).toEqual([]);
  });
  it('Guia: tipo e pago em em dados, vencimento na coluna, valor informativo', () => {
    const p = payloadDoFormAbate({ ...formAbateVazio('guia'), tipoGuia: 'taxa_iagro', vencimento: '2026-10-20', valorInformativo: 377.85, pagoEm: '2026-10-19' });
    expect(p.componentes.map(c => [c.natureza, c.valor])).toEqual([['informativo', 377.85]]);
    expect(p.dados).toMatchObject({ tipo_guia: 'taxa_iagro', pago_em: '2026-10-19' });
    expect(p.vencimento).toBe('2026-10-20');
  });
  it('lote padrao: NF produtor e GTA nascem com todos os lotes; guia e declaracao, nenhum', () => {
    const lotes = [{ loteId: 'a' }, { loteId: 'b' }];
    expect(lotesPadraoDaEspecie('nf_produtor', lotes)).toEqual(['a', 'b']);
    expect(lotesPadraoDaEspecie('gta', lotes)).toEqual(['a', 'b']);
    expect(lotesPadraoDaEspecie('guia', lotes)).toEqual([]);
    expect(lotesPadraoDaEspecie('declaracao', lotes)).toEqual([]);
  });
});

describe('conferencia · a OC da Vera 26fd02c1 com os papeis da saida', () => {
  const nfp2 = () => form(NFPE_SAIDA.map(l => l.replace('009.444.790', '009.444.845').replace('| 745856 |', '| 745874 |')), 'nf_produtor');
  const gta2 = () => form(EGTA_SAIDA.map(l => l.replace('| Q | 745856', '| Q | 745874')), 'gta');
  const docs = (sem: string[] = []): DocConferencia[] => [
    ['nf', form(NF_JBS, 'nf_principal')], ['ac', form(ACERTO_JBS, 'acerto')], ['ro', form(ROMANEIO_JBS, 'romaneio')],
    ['p1', form(NFPE_SAIDA, 'nf_produtor')], ['p2', nfp2()], ['g1', form(EGTA_SAIDA, 'gta')], ['g2', gta2()],
    ['mb', form(MODELO_B_SAIDA, 'declaracao')], ['cg', form(CARTA_GARANTIA_SAIDA, 'declaracao')],
  ].filter(([id]) => !sem.includes(String(id))).map(([id, f]) => comoAView(payloadDoFormAbate(f as FormAbate), String(id)));
  it('faixa verde curta: "GTA 36 cab · NF prod. 2/2"; a conta inteira no title', () => {
    const c = conferirDocumentosAbate(docs(), { cabDaOC: 36 });
    expect(c.estado).toBe('verde');
    expect(faixaDaConferencia(c).texto)
      .toBe('✓ 36 cab · 9.512,60 kg · Bruto 215.969,33 · Retenções 3.520,30 · Líquido 212.449,03 · GTA 36 cab · NF prod. 2/2');
    expect(faixaDaConferencia(c).titulo).toContain('GTA 18 + 18 = 36 cab · NF produtor 2 de 2');
  });
  it('a linha de cada NF produtor: citada na NF e a GTA que ela cita, registrada', () => {
    const d = docs();
    const c = conferirDocumentosAbate(d, { cabDaOC: 36 });
    expect(conferenciaDoDocumento(c, 'nf_produtor', false, d.find(x => x.documentoId === 'p1')))
      .toEqual({ texto: '✓ GTA Q-745856', tom: 'verde', titulo: 'citada na NF do frigorífico · GTA Q-745856' });
  });
  it('faltando uma NF produtor: cinza "falta NF produtor 9444845" (nunca "confere")', () => {
    const f = faixaDaConferencia(conferirDocumentosAbate(docs(['p2']), { cabDaOC: 36 }));
    expect(f.falta).toContain('falta NF produtor 9444845');
    expect(f.texto).not.toContain('NF prod.');
    expect(f.titulo).not.toContain('NF produtor 1 de 2');
  });
  it('GTAs que nao somam as cabecas da OC: vermelho', () => {
    const c = conferirDocumentosAbate(docs(), { cabDaOC: 40 });
    expect(c.estado).toBe('vermelho');
    expect(faixaDaConferencia(c).texto).toContain('GTA 18 + 18 = 36 ≠ 40 cab da OC');
  });
  it('a GTA gravada com zeros a esquerda ("000.745.856") e a mesma que a NF produtor cita ("Q-745856")', () => {
    const d = docs().map(x => (x.documentoId === 'g1' ? { ...x, numero: '000.745.856' } : x));
    const c = conferirDocumentosAbate(d, { cabDaOC: 36 });
    expect(conferenciaDoDocumento(c, 'nf_produtor', false, d.find(x => x.documentoId === 'p1')).texto).toBe('✓ GTA Q-745856');
  });
  it('sem as cabecas da OC, a GTA nao e conferida (vazio nao vira confere)', () => {
    expect(faixaDaConferencia(conferirDocumentosAbate(docs())).texto).not.toContain('GTA');
  });
});
