/**
 * NF-LEITOR-LAYOUTS-01 (Gabriel 30/10/2026: o "+ Da nota" recusava notas que TEM chave) — 5 geradores de DANFE que o leitor nao lia,
 * sobre DANFEs SINTETICOS com as posicoes de um real de cada (`__fixtures__/danfeLayoutsSinteticos.ts`). Os PDFs reais ficam fora do repo.
 *   L1 FortesReport (a chave no item do rotulo; o nome em 2 linhas; o protocolo ao lado; a fatura em itens separados)
 *   L2 pdfmake (a chave com mascara; CNPJ/CPF/nome a' esquerda do rotulo centrado; "Nº … Série" num item; protocolo com pontos)
 *   L3 ACBr em 2 folhas (a data 15pt abaixo; o cabecalho em 2 linhas; o nome centrado em 2 linhas; a folha de continuacao)
 *   L4 ReportBuilder (o "Nº." longe do numero) · L5 savnf ("VLR TOTAL NOTA"; a 2a folha sem cabecalho)
 *   L8 Skia (o portal impresso pelo navegador: "Destinatário/Remetente" junto, "Itens da nota fiscal", "Preço" / "total" em 2 linhas)
 *   L6 a chave com DV errado continua recusada (com rotulo e com mascara) · L7 o DANFE de sempre nao muda
 */
import { describe, it, expect } from 'vitest';
import { FRASE_NOTA_SEM_CHAVE, chaveDoItem, numeroDoProtocolo, notaDoDanfe, type ItemDoDanfe, type ResultadoDoDanfe } from './danfe';
import {
  DANFE_ACBR_DUAS_FOLHAS, DANFE_FORTES, DANFE_PDFMAKE, DANFE_REPORTBUILDER, DANFE_SAVNF, DANFE_SKIA,
} from './__fixtures__/danfeLayoutsSinteticos';
import { PAGINAS_DANFE_SINTETICO } from './__fixtures__/danfeSintetico';

const CHAVE_35 = '35261011222333000424550010000043211123456786';
const CHAVE_50_S1 = '50261011222333000424550010000043211123456782';
const CHAVE_50_S2 = '50261011222333000424550020000043211123456789';
const EMITENTE = 'AGRO EXEMPLO COMERCIO E REPRESENTACOES LTDA';

function lida(r: ResultadoDoDanfe) {
  if (r.ok === false) throw new Error(`esperava nota, veio recusa: ${r.frase}`);
  return r;
}
const valores = (r: ReturnType<typeof lida>) => r.nota.itens.map((i) => i.valorCent);
/** O item da chave trocado por `str` (o resto do DANFE igual). */
const comChave = (paginas: ItemDoDanfe[][], troca: (s: string) => string | null) =>
  paginas.map((p) => p.map((it) => { const t = troca(it.str); return t == null ? it : { ...it, str: t }; }));
const comDvTrocado = (s: string) => s.replace(/(\d)(\D*)$/, (_, d: string, resto: string) => `${(Number(d) + 1) % 10}${resto}`);

describe('NF-LEITOR-LAYOUTS-01 — L1 FortesReport', () => {
  const r = lida(notaDoDanfe(DANFE_FORTES));
  it('a chave no MESMO item do rotulo ("Chave de Acesso: 3526 …"), com o DV certo; confere com o resto', () => {
    expect(r.nota.chave).toBe(CHAVE_35);
    expect(r.divergencias).toEqual([]);
    expect(r.nota.numero).toBe('4321');
    expect(r.nota.serie).toBe('1');
    expect(r.nota.emissao).toBe('2026-10-15');
  });
  it(`o canhoto com aspas e "PRODUTO(S)"; o nome do quadro em 2 linhas (mesmo x) da' o endereco`, () => {
    expect(r.nota.emitente.nome).toBe(EMITENTE);
    expect(r.nota.emitente.documento).toBe('11222333000424');
    expect(r.nota.emitente.endereco.logradouro).toBe('XXXXXXX DA XXXXXXX');
  });
  it('"NOME RAZÃO SOCIAL", "DATA EMISSÃO", "VALOR TOTAL PRODUTOS"; o protocolo AO LADO do rotulo', () => {
    expect(r.nota.destinatario).toMatchObject({ nome: 'PRODUTOR SINTETICO DE TESTE', documento: '11144477735' });
    expect(r.nota.totais).toEqual({ produtosCent: 12550, freteCent: 0, descontoCent: 0, notaCent: 12550 });
    expect(r.nota.protocolo).toEqual({ cStat: '100', numero: '135260000004321' });
  });
  it('a fatura com numero, vencimento e valor em itens separados', () => {
    expect(r.nota.duplicatas).toEqual([{ numero: '001', vencimento: '2026-11-15', valorCent: 12550 }]);
    expect(r.avisos).toEqual([]);
  });
  it('o cabecalho em 2 linhas ("VALOR" / "UNITÁRIO"), "UND"; a tabela para nas "INFORMAÇÕES COMPLEMENTARES" (o canhoto de baixo nao vira detalhe)', () => {
    expect(r.nota.itens).toHaveLength(1);
    expect(r.nota.itens[0]).toMatchObject({ descricao: 'PRODUTO SINTETICO 1', quantidade: '1.00', unidade: 'XX', unitarioCent: 12550, valorCent: 12550, detalhe: null });
  });
});

describe('NF-LEITOR-LAYOUTS-01 — L2 pdfmake', () => {
  const r = lida(notaDoDanfe(DANFE_PDFMAKE));
  it('a chave com mascara ("35-26/10-…-6"), com o DV certo; confere com o resto', () => {
    expect(r.nota.chave).toBe(CHAVE_35);
    expect(r.divergencias).toEqual([]);
  });
  it(`"Nº 004.321 Série 01" num item so': numero e serie`, () => {
    expect(r.nota.numero).toBe('4321');
    expect(r.nota.serie).toBe('01');
  });
  it(`CNPJ do emitente, CPF e nome do destinatario a' ESQUERDA do rotulo centrado (nao a chave nem o CPF da coluna ao lado)`, () => {
    expect(r.nota.emitente.documento).toBe('11222333000424');
    expect(r.marcas.find((m) => m.campo === 'emitente_cnpj')?.x).toBeLessThan(190);
    expect(r.nota.destinatario).toMatchObject({ nome: 'PRODUTOR SINTETICO DE TESTE', documento: '11144477735' });
  });
  it('o protocolo do rotulo longo, com pontos ("135.260.000.004.321")', () => {
    expect(r.nota.protocolo).toEqual({ cStat: '100', numero: '135260000004321' });
  });
  it('"CÁLCULO DE IMPOSTO", "Valor Produtos", "Valor Total"; a fatura; "Preço"/"Un" e o cabecalho centrado nos itens', () => {
    expect(r.nota.totais).toEqual({ produtosCent: 67650, freteCent: 0, descontoCent: 0, notaCent: 67650 });
    expect(r.nota.duplicatas).toEqual([{ numero: '01', vencimento: '2026-11-15', valorCent: 67650 }]);
    expect(r.nota.itens.map((i) => [i.descricao, i.quantidade, i.unidade, i.unitarioCent, i.valorCent])).toEqual([
      ['PRODUTO SINTETICO 1', '1', 'XX', 12550, 12550],
      ['PRODUTO SINTETICO 2', '1', 'XX', 22550, 22550],
      ['PRODUTO SINTETICO 3', '1', 'XX', 32550, 32550],
    ]);
  });
});

describe('NF-LEITOR-LAYOUTS-01 — L3 ACBr em 2 folhas', () => {
  const r = lida(notaDoDanfe(DANFE_ACBR_DUAS_FOLHAS));
  it('a data de emissao 15pt abaixo do rotulo; a chave confere', () => {
    expect(r.nota.emissao).toBe('2026-10-15');
    expect(r.nota.chave).toBe(CHAVE_50_S1);
    expect(r.divergencias).toEqual([]);
  });
  it('o nome do emitente centrado em 2 linhas: o quadro e o endereco sao lidos', () => {
    expect(r.nota.emitente.nome).toBe(EMITENTE);
    expect(r.nota.emitente.endereco.logradouro).toBe('XXX XXX XXXX');
  });
  it('"NATUREZA DE OPERAÇÃO" (DE, nao DA)', () => {
    expect(r.nota.naturezaOperacao).toBe('XXXXXX ESTADUAL');
  });
  it('os itens das 2 folhas (a 2a com o cabecalho da 1a), com o cabecalho em 2 linhas; a soma bate com os produtos', () => {
    expect(r.nota.itens.map((i) => [i.quantidade, i.unidade, i.unitarioCent, i.valorCent])).toEqual([
      ['1', 'XX', 12550, 12550], ['1', 'XX', 22550, 22550], ['1', 'XX', 32550, 32550], ['1', 'XX', 42550, 42550],
    ]);
    expect(r.marcas.filter((m) => m.campo === 'itens').map((m) => m.pagina)).toEqual([1, 1, 2, 2]);
    expect(r.nota.totais).toEqual({ produtosCent: 110200, freteCent: 0, descontoCent: 1000, notaCent: 109200 });
  });
});

describe('NF-LEITOR-LAYOUTS-01 — L4 ReportBuilder e L5 savnf', () => {
  it('L4 o "Nº." longe do numero (> 40pt): numero e serie lidos; a chave confere', () => {
    const r = lida(notaDoDanfe(DANFE_REPORTBUILDER));
    expect(r.nota.numero).toBe('4321');
    expect(r.nota.serie).toBe('2');
    expect(r.nota.chave).toBe(CHAVE_50_S2);
    expect(r.divergencias).toEqual([]);
    expect(valores(r)).toEqual([12550]);
  });
  it('L5 "VLR TOTAL NOTA"; a 2a folha SEM cabecalho usa o da 1a; nada do topo da 2a vira detalhe do item da 1a', () => {
    const r = lida(notaDoDanfe(DANFE_SAVNF));
    expect(r.nota.totais).toEqual({ produtosCent: 110200, freteCent: 0, descontoCent: 1000, notaCent: 109200 });
    expect(r.divergencias).toEqual([]);
    expect(valores(r)).toEqual([12550, 22550, 32550, 42550]);
    expect(r.marcas.filter((m) => m.campo === 'itens').map((m) => m.pagina)).toEqual([1, 1, 2, 2]);
    expect(r.nota.itens.map((i) => i.detalhe)).toEqual([null, null, null, null]);
  });
});

describe('NF-LEITOR-LAYOUTS-01 — L8 Skia', () => {
  const r = lida(notaDoDanfe(DANFE_SKIA));
  it(`"Destinatário/Remetente" junto (nao o "Destinatário (FOB)" do frete): a data, o nome e o CPF do quadro certo; o nome do emitente em 2 linhas (mesmo x)`, () => {
    expect(r.nota.emissao).toBe('2026-10-15');
    expect(r.nota.destinatario).toMatchObject({ nome: 'PRODUTOR SINTETICO DE TESTE', documento: '11144477735' });
    expect(r.nota.chave).toBe('35261011222333000424550020000043211123456782');
    expect(r.nota.emitente.endereco.logradouro).toBe('XX. XXXXXXX XXXXX, 0000X');
    expect(r.divergencias).toEqual([]);
  });
  it('"Faturas" com 3 duplicatas; "Itens da nota fiscal" com "Preço" / "total" em 2 linhas', () => {
    expect(r.nota.duplicatas.map((x) => x.numero)).toEqual(['001', '002', '003']);
    expect(r.nota.totais).toEqual({ produtosCent: 12550, freteCent: 0, descontoCent: 1000, notaCent: 11550 });
    expect(r.nota.itens.map((i) => [i.descricao, i.unidade, i.valorCent])).toEqual([['PRODUTO SINTETICO 1', 'UN', 12550]]);
  });
});

describe(`NF-LEITOR-LAYOUTS-01 — L6 so' 44 digitos que passam no DV`, () => {
  it('a chave com rotulo e DV errado: sem chave (nunca adivinha)', () => {
    const r = notaDoDanfe(comChave(DANFE_FORTES, (s) => (s.startsWith('Chave de Acesso:') ? comDvTrocado(s) : null)));
    expect(r).toEqual({ ok: false, motivo: 'incompleta', frase: FRASE_NOTA_SEM_CHAVE });
  });
  it('a chave com mascara e DV errado: sem chave', () => {
    const r = notaDoDanfe(comChave(DANFE_PDFMAKE, (s) => (/^35-26\//.test(s) ? comDvTrocado(s) : null)));
    expect(r).toEqual({ ok: false, motivo: 'incompleta', frase: FRASE_NOTA_SEM_CHAVE });
  });
  it('a juncao direta: rotulo, mascara, DV, texto no meio e digitos a mais', () => {
    expect(chaveDoItem(`Chave de Acesso: ${CHAVE_35.replace(/(\d{4})(?=\d)/g, '$1 ')}`)).toBe(CHAVE_35);
    expect(chaveDoItem('CHAVE DE ACESSO DA NF-E 35-26/10-11.222.333/0004-24-55-001-000.004.321-112.345.678-6')).toBe(CHAVE_35);
    expect(chaveDoItem(comDvTrocado(CHAVE_35))).toBeNull();
    expect(chaveDoItem(`Chave ${CHAVE_35}`)).toBeNull();
    expect(chaveDoItem(`${CHAVE_35}0`)).toBeNull();
  });
  it('o protocolo: 15 digitos corridos ou com pontos; outra contagem, nao', () => {
    expect(numeroDoProtocolo('135260000004321 - 15/10/2026')).toBe('135260000004321');
    expect(numeroDoProtocolo('135.260.000.004.321')).toBe('135260000004321');
    expect(numeroDoProtocolo('135.260.000.004.321.9')).toBeNull();
    expect(numeroDoProtocolo('35.260.000.004.321')).toBeNull();
  });
});

describe('NF-LEITOR-LAYOUTS-01 — L7 o DANFE de sempre', () => {
  it(`o item da margem (o canhoto girado) nao entra na tabela: o detalhe do 3o item fica so' o lote`, () => {
    const r = lida(notaDoDanfe(PAGINAS_DANFE_SINTETICO));
    expect(r.nota.itens.map((i) => i.detalhe)).toEqual([
      'Lote: 069/24 D.Fab: 01/05/26 D.Val: 31/07/28 | S | S',
      'Lote: 146/25 D.Fab: 13/11/25 D.Val: 13/11/28 | S | S',
      'Lote: 135/25 D.Fab: 10/11/25 D.Val: 10/11/28 | S | S',
    ]);
  });
});
