/**
 * NOTA-LEITURA-PRINT-01 (Gabriel 10/11, Vera · revisão da Hilux) — o "Novo a partir da nota" recusava os 2 PDFs impressos pelo
 * "Microsoft: Print To PDF": a NF-e com "Nota sem emitente" (o canhoto "RECEBEMOS DE:" com dois-pontos) e a NFS-e de Campo Grande com
 * "Nota sem número" ("Número da NFS-e"). O texto e' extraivel: o conserto e' no leitor.
 *   P1 NF-e: emitente, numero/serie, chave, itens (código, NCM, unitário), total dos produtos e da nota, endereço do emitente
 *   P2 NF-e sem o "Nº" legível: o número e a série da chave (nunca adivinhados)
 *   P3 NFS-e: número, emitente (o MESMO da NF-e), valor líquido, ISS não retido, código de verificação, o serviço e a discriminação
 *   P4 os 2 PDFs reais, pelo pdfjs (fora do repo: só roda na máquina que os tem)
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { notaDoDanfe, type ResultadoDoDanfe } from './danfe';
import { ehDanfse, ehNfseMunicipal, notaDaNfseMunicipal } from './danfse';
import { lerNota } from './lerNota';
import type { PdfjsMinimo } from './lerNotaPdf';
import { CHAVE_PRINT_TO_PDF, DANFE_PRINT_TO_PDF, NFSE_CAMPO_GRANDE } from './__fixtures__/notaPrintToPdfSintetica';

function lida(r: ResultadoDoDanfe) {
  if (r.ok === false) throw new Error(`esperava nota, veio recusa: ${r.frase}`);
  return r;
}
const EMITENTE = 'AGRO EXEMPLO PECAS E SERVICOS LTDA';

describe('NOTA-LEITURA-PRINT-01 — P1 a NF-e impressa pelo Print To PDF', () => {
  const r = lida(notaDoDanfe(DANFE_PRINT_TO_PDF));
  it('o emitente pelo canhoto "RECEBEMOS DE:"; número, série e chave; a chave confere com o lido', () => {
    expect([r.nota.emitente.nome, r.nota.emitente.documento, r.nota.emitente.ie]).toEqual([EMITENTE, '11222333000424', '987654321']);
    expect([r.nota.numero, r.nota.serie, r.nota.chave, r.nota.emissao]).toEqual(['4321', '000', CHAVE_PRINT_TO_PDF, '2026-11-03']);
    expect(r.divergencias).toEqual([]);
  });
  it('o total dos produtos ("VALOR TOTAL DOS PRODUTOS/SERVIÇOS") e o da nota', () => {
    expect([r.nota.totais.produtosCent, r.nota.totais.notaCent]).toEqual([286729, 286729]);
  });
  it('os 11 itens somam a nota; o código ("COD PRODUTO"), o unitário ("Vlr Unit."), o NCM sem o "TPC" do lado', () => {
    expect(r.nota.itens).toHaveLength(11);
    expect(r.nota.itens.reduce((s, i) => s + i.valorCent, 0)).toBe(286729);
    const [a, b] = r.nota.itens;
    expect([a.fiscal?.codigo, a.descricao, a.quantidade, a.unidade, a.unitarioCent, a.valorCent, a.fiscal?.ncm, a.fiscal?.cfop])
      .toEqual(['0882380021BR', 'FLUIDO, FREIO TPC', '2.0000', 'LT', 8100, 16200, '38190000', '5102']);
    expect([b.quantidade, b.unidade, b.valorCent, b.fiscal?.ncm]).toEqual(['7900.0000', 'ML', 92035, '27101932']);
    expect(r.nota.itens.every((i) => /^\d{8}$/.test(i.fiscal?.ncm ?? ''))).toBe(true);
  });
  it('o endereço do emitente: a cidade com o CEP na mesma linha, o bairro depois do número, o telefone sozinho', () => {
    expect(r.nota.emitente.endereco).toEqual({
      logradouro: 'Rua Exemplo', numero: '100', complemento: null, bairro: 'Jardim Teste', municipio: 'CAMPO GRANDE', uf: 'MS', cep: '79000100', telefone: '6730000000',
    });
  });
});

describe('NOTA-LEITURA-PRINT-01 — P2 sem o "Nº" legível', () => {
  it('o número e a série vêm da chave (44 dígitos com o DV certo); a chave segue conferindo', () => {
    const semNumero = DANFE_PRINT_TO_PDF.map((p) => p.filter((o) => !/000004321|^S[ée]rie:/.test(o.str)));
    const r = lida(notaDoDanfe(semNumero));
    expect([r.nota.numero, r.nota.serie]).toEqual(['4321', '000']);
    expect(r.divergencias).toEqual([]);
  });
});

describe('NOTA-LEITURA-PRINT-01 — P3 a NFS-e de Campo Grande', () => {
  it('é a municipal (não a nacional)', () => {
    expect([ehDanfse(NFSE_CAMPO_GRANDE), ehNfseMunicipal(NFSE_CAMPO_GRANDE)]).toEqual([false, true]);
  });
  const r = lida(notaDaNfseMunicipal(NFSE_CAMPO_GRANDE));
  it('o número ("Número da NFS-e"), a emissão e o prestador pela "Razão Social:" — o MESMO emitente da NF-e', () => {
    expect([r.nota.numero, r.nota.emissao, r.nota.modelo]).toEqual(['4321', '2026-11-03', 'nfse']);
    expect([r.nota.emitente.nome, r.nota.emitente.documento, r.nota.emitente.inscricaoMunicipal]).toEqual([EMITENTE, '11222333000424', '00012345000']);
    const nfe = lida(notaDoDanfe(DANFE_PRINT_TO_PDF));
    expect(r.nota.emitente.documento).toBe(nfe.nota.emitente.documento);
    expect(r.nota.emitente.endereco).toMatchObject({ logradouro: 'Rua Exemplo', municipio: 'CAMPO GRANDE', uf: 'MS', cep: '79000100' });
  });
  it('o valor líquido ("VALOR LIQUIDO NFSE = R$"), o ISS de 5% NÃO retido (a linha de valores) e o código de verificação', () => {
    expect([r.nota.totais.produtosCent, r.nota.totais.notaCent]).toEqual([94000, 94000]);
    expect([r.nota.servico?.issCent, r.nota.servico?.totalRetidoCent, r.nota.servico?.liquidoCent]).toEqual([4700, 0, 94000]);
    expect(r.nota.servico?.codigoVerificacao).toBe('50000000011222333000424000');
  });
  it('o serviço pelo código em 3 linhas (inteiro, até o fim); a discriminação com a revisão no detalhe; sem chave = o aviso', () => {
    const [item] = r.nota.itens;
    expect(item.descricao.startsWith('Lubrificação, limpeza')).toBe(true);
    expect(item.descricao.endsWith('sujeitas ao ICMS).')).toBe(true);
    expect(item.detalhe).toContain('REVISÃO');
    expect(r.avisos).toContain('sem_chave');
  });
});

const PASTA = `${process.env.HOME ?? ''}/Downloads/relatorios/ui-validar/nf-vera-kampai`;
const NFE = `${PASTA}/vera-kampai-nfe-660997.pdf`;
const NFSE = `${PASTA}/vera-kampai-nfse-368760.pdf`;
describe.skipIf(!existsSync(NFE) || !existsSync(NFSE))('NOTA-LEITURA-PRINT-01 — P4 os 2 PDFs reais, pelo pdfjs', () => {
  const ler = async (f: string) => {
    const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const b = readFileSync(f);
    const r = await lerNota(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { pdfjs });
    if (r.ok === false) throw new Error(r.frase);
    if (r.origem !== 'pdf') throw new Error('esperava PDF');
    return r;
  };
  it('NF-e 660997 e NFS-e 368760: lidas, o mesmo emitente; valor, itens e a chave conferida', async () => {
    const nfe = await ler(NFE);
    const nfse = await ler(NFSE);
    expect([nfe.nota.numero, nfe.nota.serie, nfe.nota.totais.notaCent, nfe.nota.itens.length]).toEqual(['660997', '000', 286729, 11]);
    expect(nfe.nota.chave).toBe('50261103583836000154550000006609971655584236');
    expect(nfe.divergencias).toEqual([]);
    expect([nfse.nota.numero, nfse.nota.totais.notaCent, nfse.nota.servico?.issCent]).toEqual(['368760', 94000, 4700]);
    expect(nfe.nota.emitente.documento).toBe('03583836000154');
    expect(nfse.nota.emitente.documento).toBe(nfe.nota.emitente.documento);
    expect(nfse.nota.emitente.nome).toBe(nfe.nota.emitente.nome);
  }, 60000);
});
