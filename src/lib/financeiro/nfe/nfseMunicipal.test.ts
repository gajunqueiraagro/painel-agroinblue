/**
 * NFSE-MUNICIPAL-01 (Gabriel 03/11) — a NFS-e da PREFEITURA no mesmo leitor do P174:
 * U1 Presidente Prudente (sem chave nacional): lida, `sem_chave`, as parcelas pela condicao, o liquido, o ISS e o codigo de verificacao
 * U2 Sao Paulo (o Identificador Nacional): a chave confere (`conferirChaveNfse`); outro numero diverge
 * U3 as recusas: sem o titulo nao e' NFS-e municipal; sem o CNPJ do prestador; com retencao e sem o liquido impresso (nunca calculado)
 * U4 a condicao que nao se le com seguranca nao vira parcela
 * U5 a proposta e a lista dizem "sem chave" e "pela condicao"
 * U6 os PDFs reais (fora do repo: dado de cliente) — so' onde existem.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { notaDoDanfe, type ResultadoDoDanfe } from './danfe';
import { diasDaCondicao, ehDanfse, ehNfseMunicipal, notaDaNfseMunicipal, FRASE_NFSE_RETENCAO_SEM_LIQUIDO, FRASE_NFSE_SEM_PRESTADOR } from './danfse';
import { lerNota } from './lerNota';
import type { PdfjsMinimo } from './lerNotaPdf';
import { FRASE_SEM_CHAVE, fraseDasCondicoes, proporLancamento } from './proporLancamento';
import { situacaoDaNota, type LinhaDeNota } from '@/components/financeiro-v2/NovoDeXmlDialog';
import { nfsePresidentePrudente, nfseSaoPaulo } from './__fixtures__/nfseMunicipalSintetica';

function lida(r: ResultadoDoDanfe) {
  if (r.ok === false) throw new Error(`esperava nota, veio recusa: ${r.frase}`);
  return r;
}

describe('U1 — Presidente Prudente (sem chave nacional)', () => {
  const r = lida(notaDaNfseMunicipal(nfsePresidentePrudente()));
  const n = r.nota;
  it('reconhecida pelo titulo e pelos quadros (e nao como DANFSe nacional)', () => {
    expect(ehNfseMunicipal(nfsePresidentePrudente())).toBe(true);
    expect(ehDanfse(nfsePresidentePrudente())).toBe(false);
  });
  it('numero, emissao, prestador (CNPJ -> fornecedor), tomador, o liquido, o ISS e o codigo de verificacao guardado', () => {
    expect([n.modelo, n.numero, n.emissao, n.chave]).toEqual(['nfse', '6001', '2026-07-13', '']);
    expect([n.emitente.documento, n.emitente.nome]).toEqual(['11222333000424', 'PRESTADORA SINTETICA LTDA']);
    expect(n.destinatario.documento).toBe('11144477735');
    expect(n.totais.notaCent).toBe(1136000);
    expect([n.servico?.liquidoCent, n.servico?.brutoCent, n.servico?.issCent, n.servico?.totalRetidoCent]).toEqual([1136000, 1136000, 56800, 0]);
    expect(n.servico?.codigoVerificacao).toBe('5A1B2C3D4E');
    expect(n.itens.map((i) => [i.descricao, i.valorCent])).toEqual([['SERVICO MECANICA', 1136000]]);
    expect(n.itens[0].detalhe).toContain('MANUTENCAO CAMPO');
  });
  it('as parcelas pela condicao (28/56/84/112 da emissao), somando o liquido; o aviso "sem chave" e o "pela condicao"; nada a conferir', () => {
    expect(n.duplicatas.map((d) => [d.vencimento, d.valorCent])).toEqual([
      ['2026-08-10', 284000], ['2026-09-07', 284000], ['2026-10-05', 284000], ['2026-11-02', 284000]]);
    expect(n.somaDuplicatasCent).toBe(n.totais.notaCent);
    expect(r.avisos).toEqual(['vencimentos_pelas_condicoes', 'sem_chave']);
    expect(r.divergencias).toEqual([]);
  });
  it('o centavo que sobra fica na 1a parcela (como no boleto)', () => {
    const r2 = lida(notaDaNfseMunicipal(nfsePresidentePrudente({ total: '100,01' })));
    expect(r2.nota.duplicatas.map((d) => d.valorCent)).toEqual([2501, 2500, 2500, 2500]);
  });
  it('o ISS retido entra nas retencoes; o lancamento segue o liquido IMPRESSO', () => {
    const r3 = lida(notaDaNfseMunicipal(nfsePresidentePrudente({ issRetido: true, liquido: '10.792,00' })));
    expect([r3.nota.servico?.retencoes.issRetidoCent, r3.nota.totais.notaCent]).toEqual([56800, 1079200]);
  });
});

describe('U2 — Sao Paulo (o Identificador Nacional confere)', () => {
  it('a chave de 50 lida e conferida; sem liquido impresso e sem retencao, o liquido e\' o total', () => {
    const r = lida(notaDaNfseMunicipal(nfseSaoPaulo()));
    expect(r.nota.chave).toHaveLength(50);
    expect(r.divergencias).toEqual([]);
    expect(r.avisos).toEqual(['sem_duplicatas']);
    expect([r.nota.numero, r.nota.emissao, r.nota.totais.notaCent, r.nota.servico?.codigoVerificacao]).toEqual(['000004321', '2026-10-20', 2639, 'ABCD-EFGH']);
    expect(r.nota.itens[0].descricao).toBe('Disponibilização de conteúdos de teste');
  });
  it('a chave de outra nota (outro numero) diverge: nada se cria', () => {
    const outra = lida(notaDaNfseMunicipal(nfseSaoPaulo())).nota.chave.replace(/^(.{23})(.{13})/, (_, a: string) => `${a}${'9'.repeat(13)}`);
    const r = lida(notaDaNfseMunicipal(nfseSaoPaulo({ chave: outra })));
    expect(r.divergencias).toContain('numero');
  });
});

describe('U3 — as recusas (nunca inventar)', () => {
  it('sem o titulo nao e\' NFS-e municipal: segue para o DANFE, que recusa como hoje', () => {
    const p = nfsePresidentePrudente({ semTitulo: true });
    expect(ehNfseMunicipal(p)).toBe(false);
    const r = notaDoDanfe(p);
    expect(r.ok).toBe(false);
  });
  it('sem o CPF/CNPJ do prestador: recusa', () => {
    expect(notaDaNfseMunicipal(nfsePresidentePrudente({ semCnpjPrestador: true }))).toEqual({ ok: false, motivo: 'incompleta', frase: FRASE_NFSE_SEM_PRESTADOR });
  });
  it('com retencao impressa e sem o liquido impresso: recusa (o liquido nao e\' calculado por adivinhacao)', () => {
    expect(notaDaNfseMunicipal(nfseSaoPaulo({ irrf: '1,00' }))).toEqual({ ok: false, motivo: 'incompleta', frase: FRASE_NFSE_RETENCAO_SEM_LIQUIDO });
  });
});

describe('U4 — a condicao de pagamento', () => {
  it('lida: crescente, ate\' 12, ate\' 400 dias', () => {
    expect(diasDaCondicao('*INFO COND.PAGTO.:28/56/84/112 DIAS X')).toEqual([28, 56, 84, 112]);
    expect(diasDaCondicao('Cond. pagamento: 30 dias')).toEqual([30]);
  });
  it('fora de ordem, sem "dias" ou ausente: nada (1 parcela, o operador ajusta)', () => {
    expect(diasDaCondicao('COND.PAGTO.:56/28 DIAS')).toBeNull();
    expect(diasDaCondicao('COND.PAGTO.:28/56')).toBeNull();
    const r = lida(notaDaNfseMunicipal(nfsePresidentePrudente({ condicao: 'COND.PAGTO.:56/28 DIAS' })));
    expect(r.nota.duplicatas).toEqual([]);
    expect(r.avisos).toEqual(['sem_duplicatas', 'sem_chave']);
    expect(lida(notaDaNfseMunicipal(nfsePresidentePrudente({ condicao: null }))).nota.duplicatas).toEqual([]);
  });
});

describe('U5 — a proposta e a lista dizem o que nao se confere', () => {
  const r = lida(notaDaNfseMunicipal(nfsePresidentePrudente()));
  it('a proposta: "sem chave" e "pela condicao"; o valor e\' o liquido em 4 parcelas', () => {
    const p = proporLancamento({ nota: r.nota, avisosDoLeitor: r.avisos, fazendas: [], favorecidoId: null, ultima: null,
      emitente: { achadoPor: null, candidatos: [], propostoId: null, inativo: false, cadastroSemDocumento: false, filialDiferente: false } });
    if (p.ok === false) throw new Error(p.frase);
    expect(p.proposta.avisos).toContain(FRASE_SEM_CHAVE);
    expect(p.proposta.avisos).toContain(fraseDasCondicoes([28, 56, 84, 112]));
    expect(p.proposta.valorCent).toBe(1136000);
  });
  it('a lista do "+ Da nota": a situacao "sem chave" (abre o lancamento como a nova)', () => {
    const linha: LinhaDeNota = { id: 'x', arquivoNome: 'n.pdf', avisos: r.avisos, nota: r.nota, doXml: null, fazenda: null, recusa: null, lancada: false };
    expect(situacaoDaNota(linha)).toBe('sem_chave');
  });
});

const PP = `${process.env.HOME ?? ''}/Downloads/relatorios/casos/NFSe-6836-ricci-servico.pdf`;
const SP = `${process.env.HOME ?? ''}/Downloads/NFs-SantaRita-out/Nota_Uol_-_outubro.pdf`;
async function lerArquivo(f: string) {
  const pdfjs: PdfjsMinimo = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const b = readFileSync(f);
  return lerNota(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { pdfjs });
}
describe.skipIf(!existsSync(PP))('U6a — o PDF real de Presidente Prudente (NFS-e 6836)', () => {
  it('lido: 4 parcelas pela condicao que somam o liquido; sem chave', async () => {
    const r = await lerArquivo(PP);
    if (r.ok === false) throw new Error(r.frase);
    expect([r.nota.modelo, r.nota.numero, r.nota.emissao, r.nota.totais.notaCent]).toEqual(['nfse', '6836', '2026-07-13', 1136000]);
    expect(r.nota.duplicatas.map((d) => d.vencimento)).toEqual(['2026-08-10', '2026-09-07', '2026-10-05', '2026-11-02']);
    expect(r.nota.somaDuplicatasCent).toBe(1136000);
    expect(r.avisos).toContain('sem_chave');
  });
});
describe.skipIf(!existsSync(SP))('U6b — o PDF real de Sao Paulo', () => {
  it('lido; a chave nacional confere', async () => {
    const r = await lerArquivo(SP);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.nota.chave).toHaveLength(50);
    expect(r.divergencias).toEqual([]);
  });
});
