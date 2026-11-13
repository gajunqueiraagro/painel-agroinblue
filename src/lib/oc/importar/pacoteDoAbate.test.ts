/**
 * IMPORTAR-ABATE-01 — o pacote da `oc_importar_abate` montado do caso real SM-LT06 (Minerva José Bonifácio, OC 77562): 3 lotes pelas
 * faixas (o de mais cabeças primeiro), SENAR 239,54 rateado pelo total de cada faixa, Funrural pela folha = 0, recebimento = o líquido do
 * acerto; as diferenças entre os documentos LISTADAS (nunca ajustadas).
 */
import { describe, it, expect } from 'vitest';
import { lerPdfDoAbate, type CamposLidos } from '@/lib/oc/leitura/layoutsAbate';
import { detalhesDoAcertoMinerva, detalhesDoRomaneioMinerva } from './detalhesMinerva';
import { diferencaCabeNaOc, docsXOc, lotesComPrecoDiferente, montarPacoteDoAbate, ratearCentavos, type EntradaDoPacote, type OcExistente } from './pacoteDoAbate';
import {
  ACERTO_SM_LT06_REAL, CNPJ_MINERVA_JOSE_BONIFACIO, NF_SM_LT06_REAL, ROMANEIO_SM_LT06_REAL,
} from '@/lib/oc/leitura/__fixtures__/linhasSmLt06Real';

const campos = (linhas: readonly string[], especie: 'nf_principal' | 'acerto'): CamposLidos => {
  const r = lerPdfDoAbate({ linhas: [...linhas], temTexto: true }, { especie, cnpjContraparte: CNPJ_MINERVA_JOSE_BONIFACIO });
  if (r.tipo !== 'lido') throw new Error('não leu');
  return r.campos;
};
const detalhes = detalhesDoAcertoMinerva(ACERTO_SM_LT06_REAL);
if (!detalhes) throw new Error('acerto sem detalhes');
const ENTRADA: EntradaDoPacote = {
  nf: campos(NF_SM_LT06_REAL, 'nf_principal'), acerto: campos(ACERTO_SM_LT06_REAL, 'acerto'), detalhes,
  romaneio: detalhesDoRomaneioMinerva(ROMANEIO_SM_LT06_REAL), documentos: [{ especie: 'nf_principal', numero: '45854' }],
  fazendaId: 'faz-1', contraparteId: 'minerva-jb', categoria: 'boi', pesoVivoMedioKg: 520,
};
const soma = (ns: number[]) => Math.round(ns.reduce((a, n) => a + n * 100, 0)) / 100;

describe('rateio de centavos', () => {
  it('maior resto: cada lote a menos de 1 centavo da proporção (8.818,99 → 88,19 · 13.923,08 → 139,23 · 1.211,94 → 12,12); soma = o total', () => {
    const p = ratearCentavos(23954, [4409533, 6961600, 605973]);
    expect(p.reduce((a, n) => a + n, 0)).toBe(23954);
    expect(p).toEqual([8819, 13923, 1212]);
  });
});

describe('SM-LT06 → pacote', () => {
  it('3 lotes, o de 10 cab primeiro; SENAR rateado soma 239,54; Funrural pela folha = 0; recebimento = líquido do acerto', () => {
    const m = montarPacoteDoAbate(ENTRADA);
    expect(m.recusa).toBeNull();
    expect(m.duvidas).toEqual([]);
    const lotes = m.pacote?.lotes ?? [];
    expect(lotes.map(l => [l.ordem, l.cab, l.peso_carcaca_kg, l.preco_arroba])).toEqual([[1, 10, 2748, 380], [2, 6, 1718, 385], [3, 1, 368, 247]]);
    expect(soma(lotes.map(l => l.senar))).toBe(239.54);
    expect(lotes.every(l => l.funrural === 0)).toBe(true);
    expect(m.pacote?.recebimento).toMatchObject({ valor: 119531.53, vencimento: '2026-11-12', documento: 'NF 45854' });
    expect(m.pacote?.data_abate).toBe('2026-11-10');
  });

  it('as diferenças entre os documentos são LISTADAS como estão: o centavo do acerto e a NF de produtor de pauta', () => {
    const m = montarPacoteDoAbate(ENTRADA);
    expect(m.diferencas.map(d => d.qual)).toEqual(['faixas_x_acerto', 'nf_x_acerto', 'nf_produtor']);
    expect(m.diferencas[1].frase).toBe('NF do frigorífico R$ 119.771,06 × acerto R$ 119.771,07 (+0,01).');
    expect(m.diferencas[2].frase).toBe('NF de produtor 131 de 06/11/2026: R$ 65.841,00 (valor de pauta) × NF do frigorífico R$ 119.771,06.');
    /* o pacote leva os lotes como as faixas são (soma 119.531,52) e o recebimento do acerto (119.531,53): o centavo NÃO é absorvido */
    expect(soma(m.pacote?.lotes.map(l => l.valor_liquido) ?? [])).toBe(119531.52);
  });

  it('D-ABATE-1 (117530): o centavo do acerto vai EXPLÍCITO — no pacote e como componente do documento acerto; lotes + diferença = recebimento', () => {
    const m = montarPacoteDoAbate({ ...ENTRADA, documentos: [{ especie: 'nf_principal', numero: '45854' },
      { especie: 'acerto', componentes: [{ tipo: 'valor_bruto', natureza: 'acrescimo', valor: 119771.07, ordem: 1 }] }] });
    expect(m.pacote?.diferenca_acerto?.valor).toBe(0.01);
    expect(m.pacote?.diferenca_acerto?.texto).toContain('119.771,07');
    const acerto = m.pacote?.documentos.find(d => d.especie === 'acerto');
    expect(acerto?.componentes).toEqual([
      { tipo: 'valor_bruto', natureza: 'acrescimo', valor: 119771.07, ordem: 1 },
      expect.objectContaining({ tipo: 'diferenca_acerto', natureza: 'acrescimo', valor: 0.01, ordem: 2 }),
    ]);
    expect(soma([...(m.pacote?.lotes.map(l => l.valor_liquido) ?? []), m.pacote?.diferenca_acerto?.valor ?? 0])).toBe(m.pacote?.recebimento.valor);
    /* a NF não ganha componente: só o acerto */
    expect(m.pacote?.documentos.find(d => d.especie === 'nf_principal')).toEqual({ especie: 'nf_principal', numero: '45854' });
  });

  it('sem as respostas das Dúvidas não há pacote (e diz quais faltam)', () => {
    const m = montarPacoteDoAbate({ ...ENTRADA, categoria: null, pesoVivoMedioKg: null });
    expect(m.pacote).toBeNull();
    expect(m.duvidas).toEqual(['categoria', 'peso_vivo']);
  });
});

describe('o lote de preço diferente (aviso, nunca muda o lote)', () => {
  it('SM-LT06: o lote 3 a R$ 247/@ (Trat. Frio) foge do lote de 10 cab a R$ 380/@; o de R$ 385/@ não', () => {
    expect(lotesComPrecoDiferente([{ ordem: 1, cab: 10, preco_arroba: 380 }, { ordem: 2, cab: 6, preco_arroba: 385 }, { ordem: 3, cab: 1, preco_arroba: 247 }])).toEqual([3]);
    expect(lotesComPrecoDiferente([{ ordem: 1, cab: 10, preco_arroba: 380 }])).toEqual([]);
  });
});

describe('117535 — a categoria por lote', () => {
  it('sem escolha por lote: nenhum lote leva categoria (vale a do pacote, como antes)', () => {
    expect(montarPacoteDoAbate(ENTRADA).pacote?.lotes.every(l => !('categoria' in l))).toBe(true);
  });
  it('o lote 3 (R$ 247/@) como vacas: só ele leva a categoria; a igual à do pacote não vai', () => {
    const m = montarPacoteDoAbate({ ...ENTRADA, categoriasPorLote: { 2: 'boi', 3: 'vacas' } });
    expect(m.pacote?.lotes.map(l => l.categoria ?? null)).toEqual([null, null, 'vacas']);
    expect(m.lotes.length).toBe(3);
  });
});

describe('anexar à OC existente — documentos × OC (nada ajustado)', () => {
  /* a OC 4192f9c0 como foi lançada à mão: 1 lote de 17 cab a 380, o centavo dentro do líquido, a retenção como Funrural */
  const MANUAL: OcExistente = { lotes: [{ cab: 17, peso_carcaca_kg: 4834, preco_arroba: 380, valor_liquido: 119531.53, senar: null, funrural: 239.54 }],
    recebimento: { valor: 119531.53, vencimento: '2026-11-12' } };
  const pacote = montarPacoteDoAbate(ENTRADA).pacote;
  if (!pacote) throw new Error('sem pacote');
  it('lado a lado: cab, carcaça e a receber iguais; lotes, SENAR e Funrural diferentes', () => {
    const l = docsXOc(pacote, MANUAL);
    expect(l.filter(x => x.difere).map(x => x.campo)).toEqual(['Lotes (cab)', 'R$/@', 'SENAR', 'Funrural']);
    expect(l.find(x => x.campo === 'Lotes (cab)')).toMatchObject({ documentos: '10 · 6 · 1', oc: '17' });
    expect(l.find(x => x.campo === 'A receber (líquido)')).toMatchObject({ documentos: '119.531,53', oc: '119.531,53' });
  });
  it('o centavo já está no líquido da OC manual: a diferença do acerto NÃO entra (contaria 2×); com os lotes como as faixas, entra', () => {
    expect(diferencaCabeNaOc(pacote, MANUAL)).toBe(false);
    const comoFaixas: OcExistente = { lotes: pacote.lotes.map(l => ({ ...l })), recebimento: { valor: 119531.53, vencimento: '2026-11-12' } };
    expect(diferencaCabeNaOc(pacote, comoFaixas)).toBe(true);
  });
});
