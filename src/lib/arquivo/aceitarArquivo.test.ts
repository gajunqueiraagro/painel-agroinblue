/**
 * UI-ARRASTAR-ARQUIVO-01a — o dono do aceite de arquivo, e os quatro donos antigos que passaram a delegar a ele.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() }, auth: { getUser: vi.fn() } } }));

import {
  aceitarArquivo, acceptDaRegra, ajudaDaRegra, fraseDeFormatoNaoAceito, resumoDaRegra, tipoDoArquivo, tiposPorExtenso, tiposPorSigla,
  type RegraDeAceite,
} from './aceitarArquivo';
import { REGRA_ARQUIVO_DO_BOLETO, REGRA_ARQUIVO_DO_DOCUMENTO } from '@/hooks/useLancamentoDocumentos';
import { motivoArquivoRecusado } from '@/lib/financeiro/documentosPendentes';
import { motivoArquivoInvalido, REGRA_ARQUIVO_DA_OC } from '@/lib/oc/caminhoDocumento';
import { anexarSaldoDocumento } from '@/hooks/useExtratoDaConta';

const arq = (nome: string, type: string, bytes = 4) => new File([new Uint8Array(bytes)], nome, { type });
const MB = 1024 * 1024;
const DOC: RegraDeAceite = { tipos: ['pdf', 'jpg', 'png', 'xml'], tamanhoMaxBytes: 10 * MB };

describe('tipoDoArquivo — MIME quando há; sem MIME, a extensão', () => {
  it.each([
    ['nota.pdf', 'application/pdf', 'pdf'], ['foto.jpg', 'image/jpeg', 'jpg'], ['foto.png', 'image/png', 'png'],
    ['nota.xml', 'text/xml', 'xml'], ['nota.xml', 'application/xml', 'xml'],
    ['nota.xml', '', 'xml'], ['NOTA.XML', '', 'xml'], ['Boleto.PDF', '', 'pdf'], ['foto.JPEG', 'application/octet-stream', 'jpg'],
    ['sem-extensao', 'application/pdf', 'pdf'],
    ['planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['nota.txt', 'text/plain', 'txt'], ['sem-nada', '', null], ['video.mp4', 'video/mp4', null],
    /* MIME informado e fora da lista recusa, mesmo com a extensão boa — a regra de sempre */
    ['disfarce.pdf', 'text/html', null],
  ])('%s (%s) -> %s', (nome, mime, esperado) => {
    expect(tipoDoArquivo(arq(nome, mime))).toBe(esperado);
  });
});

describe('o catálogo dos importadores (01b) — a extensão manda quando o MIME vem vazio ou genérico', () => {
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  it.each([
    /* OFX: quase nunca chega com tipo próprio */
    ['set26.ofx', 'application/x-ofx', 'ofx'], ['set26.ofx', 'application/ofx', 'ofx'], ['set26.ofx', 'application/vnd.intu.qfx', 'ofx'],
    ['set26.ofx', '', 'ofx'], ['set26.ofx', 'application/octet-stream', 'ofx'], ['set26.ofx', 'text/plain', 'ofx'], ['SET26.OFX', '', 'ofx'],
    /* Excel */
    ['mes.xlsx', XLSX, 'xlsx'], ['mes.xlsx', '', 'xlsx'], ['mes.xlsx', 'application/octet-stream', 'xlsx'],
    ['mes.xls', 'application/vnd.ms-excel', 'xls'], ['mes.xls', '', 'xls'],
    /* CSV: no Windows com Excel instalado vem como `application/vnd.ms-excel` */
    ['extrato.csv', 'text/csv', 'csv'], ['extrato.csv', 'application/csv', 'csv'], ['extrato.csv', 'text/comma-separated-values', 'csv'],
    ['extrato.csv', 'text/plain', 'csv'], ['extrato.csv', 'application/vnd.ms-excel', 'csv'], ['extrato.csv', '', 'csv'],
    /* TXT */
    ['custeio.txt', 'text/plain', 'txt'], ['custeio.txt', '', 'txt'], ['custeio.TXT', 'application/octet-stream', 'txt'],
    /* o genérico SÓ vale com a extensão do tipo: um .pdf em text/plain é texto, não PDF */
    ['disfarce.pdf', 'text/plain', 'txt'], ['disfarce.pdf', 'application/vnd.ms-excel', 'xls'],
  ])('%s (%s) -> %s', (nome, mime, esperado) => {
    expect(tipoDoArquivo(arq(nome, mime))).toBe(esperado);
  });
  it('regra do Importar Banco: aceita os cinco pela extensão, recusa o resto; e o `.pdf` disfarçado de texto NÃO vira documento', () => {
    const BANCO: RegraDeAceite = { tipos: ['ofx', 'xlsx', 'xls', 'csv', 'txt'] };
    for (const [nome, mime] of [['a.ofx', ''], ['a.ofx', 'text/plain'], ['a.xlsx', ''], ['a.xls', 'application/vnd.ms-excel'], ['a.csv', 'application/vnd.ms-excel'], ['a.txt', 'text/plain']]) {
      expect(aceitarArquivo([arq(nome, mime)], BANCO).ok).toBe(true);
    }
    expect(aceitarArquivo([arq('nota.pdf', 'application/pdf')], BANCO)).toMatchObject({ ok: false, codigo: 'tipo', motivo: 'Só OFX, Excel, CSV ou TXT.' });
    expect(aceitarArquivo([arq('disfarce.pdf', 'text/plain')], DOC).ok).toBe(false);
  });
  it('REGRA SEM `tamanhoMaxBytes` não recusa por tamanho, por maior que seja o arquivo (os importadores nunca tiveram limite)', () => {
    const grande = arq('ano-inteiro.ofx', '', 64 * MB);
    const r = aceitarArquivo([grande], { tipos: ['ofx'] });
    expect(r.ok).toBe(true);
    expect(r.porArquivo[0].codigo).toBeNull();
    /* a busca sabe achar: com limite, o mesmo arquivo é recusado */
    expect(aceitarArquivo([grande], { tipos: ['ofx'], tamanhoMaxBytes: 10 * MB }).codigo).toBe('tamanho');
    expect(resumoDaRegra({ tipos: ['xlsx', 'xls'] })).toBe('Excel');
    expect(fraseDeFormatoNaoAceito(['xlsx', 'xls'])).toBe('Formato não aceito. Envie XLSX ou XLS.');
    expect(acceptDaRegra({ tipos: ['xlsx'] })).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx');
  });
  it('o arquivo sem tipo sai com o MIME próprio do tipo (o primeiro do catálogo)', () => {
    expect(aceitarArquivo([arq('a.ofx', '')], { tipos: ['ofx'] }).arquivos[0].type).toBe('application/x-ofx');
    expect(aceitarArquivo([arq('a.csv', '')], { tipos: ['csv'] }).arquivos[0].type).toBe('text/csv');
    /* com tipo informado (mesmo genérico), o arquivo é o MESMO objeto */
    const f = arq('a.ofx', 'text/plain');
    expect(aceitarArquivo([f], { tipos: ['ofx'] }).arquivos[0]).toBe(f);
  });
});

describe('aceitarArquivo — a tabela de casos', () => {
  it('tipo certo por MIME: aceito, e o arquivo é o MESMO objeto', () => {
    const f = arq('nota.pdf', 'application/pdf');
    const r = aceitarArquivo([f], DOC);
    expect(r).toMatchObject({ ok: true, motivo: null, codigo: null });
    expect(r.arquivos[0]).toBe(f);
    expect(r.porArquivo).toEqual([{ arquivo: f, original: f, motivo: null, codigo: null }]);
  });
  it('tipo certo só pela extensão (sem MIME): aceito, e o arquivo sai com o tipo preenchido', () => {
    const f = arq('nota.xml', '');
    const r = aceitarArquivo([f], DOC);
    expect(r.ok).toBe(true);
    expect(r.arquivos[0]).not.toBe(f);
    expect(r.arquivos[0].type).toBe('application/xml');
    expect(r.arquivos[0].name).toBe('nota.xml');
    expect(r.arquivos[0].size).toBe(f.size);
    expect(r.porArquivo[0].original).toBe(f);
  });
  it('extensão em maiúscula, sem MIME', () => {
    expect(aceitarArquivo([arq('NFE.XML', '')], DOC).ok).toBe(true);
    expect(aceitarArquivo([arq('BOLETO.PDF', '')], DOC).arquivos[0].type).toBe('application/pdf');
  });
  it('XML com MIME vazio só é aceito ONDE XML é tipo permitido', () => {
    const semXml: RegraDeAceite = { tipos: ['pdf', 'jpg', 'png'] };
    expect(aceitarArquivo([arq('nota.xml', '')], semXml)).toMatchObject({ ok: false, codigo: 'tipo', motivo: 'Só PDF ou imagem.' });
    expect(aceitarArquivo([arq('nota.xml', 'text/xml')], semXml).ok).toBe(false);
  });
  it('tipo errado: recusa com a frase do dono, e nada segue adiante', () => {
    const r = aceitarArquivo([arq('nota.txt', 'text/plain')], DOC);
    expect(r).toMatchObject({ ok: false, codigo: 'tipo', motivo: 'Só PDF, imagem ou XML.' });
    expect(r.arquivos).toEqual([]);
  });
  it('acima do limite: recusa; no limite exato: aceita', () => {
    expect(aceitarArquivo([arq('g.pdf', 'application/pdf', 10 * MB + 1)], DOC)).toMatchObject({ ok: false, codigo: 'tamanho', motivo: 'Arquivo acima de 10 MB.' });
    expect(aceitarArquivo([arq('g.pdf', 'application/pdf', 10 * MB)], DOC).ok).toBe(true);
  });
  it('sem limite na regra, o tamanho não recusa', () => {
    expect(aceitarArquivo([arq('g.xml', 'text/xml', 3 * MB)], { tipos: ['xml'] }).ok).toBe(true);
  });
  it('vários onde só cabe um: recusa o lote, e o veredito de cada arquivo continua lá', () => {
    const a = arq('a.pdf', 'application/pdf'); const b = arq('b.pdf', 'application/pdf');
    const r = aceitarArquivo([a, b], DOC);
    expect(r).toMatchObject({ ok: false, codigo: 'varios', motivo: 'Solte um arquivo só.' });
    expect(r.porArquivo.map(v => v.motivo)).toEqual([null, null]);
  });
  it('vários aceitos quando a regra permite; um errado no meio recusa o lote e aponta o arquivo', () => {
    const a = arq('a.pdf', 'application/pdf'); const t = arq('t.txt', 'text/plain'); const b = arq('b.png', 'image/png');
    const regra = { ...DOC, varios: true };
    expect(aceitarArquivo([a, b], regra)).toMatchObject({ ok: true, arquivos: [a, b] });
    const r = aceitarArquivo([a, t, b], regra);
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('tipo');
    expect(r.porArquivo.map(v => v.motivo)).toEqual([null, 'Só PDF, imagem ou XML.', null]);
    /* os bons continuam identificados: a tela de LOTE segue com eles */
    expect(r.arquivos).toEqual([a, b]);
  });
  it('lista vazia, nula ou indefinida: recusa "vazio"', () => {
    for (const l of [[], null, undefined]) expect(aceitarArquivo(l, DOC)).toMatchObject({ ok: false, codigo: 'vazio', motivo: 'Nenhum arquivo.' });
  });
  it('a frase de quem usa vence a do dono — texto ou função; frase em branco NÃO vale (o motivo nunca sai vazio)', () => {
    const f = arq('g.pdf', 'application/pdf', 2 * MB);
    expect(aceitarArquivo([arq('a.txt', 'text/plain')], { ...DOC, frases: { tipo: 'Formato não aceito.' } }).motivo).toBe('Formato não aceito.');
    expect(aceitarArquivo([f], { tipos: ['pdf'], tamanhoMaxBytes: MB, frases: { tamanho: (a) => `Arquivo de ${a?.name}` } }).motivo).toBe('Arquivo de g.pdf');
    expect(aceitarArquivo([arq('a.txt', 'text/plain')], { ...DOC, frases: { tipo: '   ' } }).motivo).toBe('Só PDF, imagem ou XML.');
    for (const l of [[arq('a.txt', 'text/plain')], [f, f], []]) expect((aceitarArquivo(l, { tipos: ['pdf'], tamanhoMaxBytes: 1 }).motivo ?? '').length).toBeGreaterThan(5);
  });
});

describe('o que a tela escreve a partir da regra', () => {
  it('os tipos por extenso, sem repetir "imagem"', () => {
    expect(tiposPorExtenso(['pdf', 'jpg', 'png', 'xml'])).toBe('PDF, imagem ou XML');
    expect(tiposPorExtenso(['pdf', 'jpg', 'png'])).toBe('PDF ou imagem');
    expect(tiposPorExtenso(['xml'])).toBe('XML');
  });
  it('a frase de recusa e a ajuda saem DOS TIPOS da regra — XML é citado onde XML entra, e só ali', () => {
    expect(tiposPorSigla(['pdf', 'jpg', 'png', 'xml'])).toBe('PDF, JPG, PNG ou XML');
    expect(fraseDeFormatoNaoAceito(['pdf', 'jpg', 'png', 'xml'])).toBe('Formato não aceito. Envie PDF, JPG, PNG ou XML.');
    expect(fraseDeFormatoNaoAceito(['pdf', 'jpg', 'png'])).toBe('Formato não aceito. Envie PDF, JPG ou PNG.');
    expect(ajudaDaRegra(DOC)).toBe('PDF, JPG, PNG ou XML, até 10 MB');
    expect(ajudaDaRegra({ tipos: ['xml'] })).toBe('XML');
  });
  it('o resumo e o accept', () => {
    expect(resumoDaRegra(DOC)).toBe('PDF, imagem ou XML · até 10 MB');
    expect(resumoDaRegra({ ...DOC, varios: true })).toBe('PDF, imagem ou XML · até 10 MB cada · vários de uma vez');
    expect(resumoDaRegra({ tipos: ['xml'], varios: true })).toBe('XML · vários de uma vez');
    expect(acceptDaRegra({ tipos: ['xml'] })).toBe('application/xml,text/xml,.xml');
  });
});

describe('os donos antigos DELEGAM, com as frases de sempre', () => {
  it('documento do Financeiro (`motivoArquivoRecusado`): as frases presas; `.xml` sem MIME passou a valer', () => {
    expect(motivoArquivoRecusado(arq('a.txt', 'text/plain'))).toBe('Formato não aceito. Envie PDF, JPG, PNG ou XML.');
    expect(motivoArquivoRecusado(arq('g.pdf', 'application/pdf', 10 * MB + 1))).toBe('Arquivo acima de 10 MB.');
    for (const f of [arq('n.pdf', 'application/pdf'), arq('n.jpg', 'image/jpeg'), arq('n.png', 'image/png'), arq('n.xml', 'text/xml'), arq('n.xml', 'application/xml'), arq('n.xml', '')]) {
      expect(motivoArquivoRecusado(f)).toBeNull();
    }
    expect(REGRA_ARQUIVO_DO_DOCUMENTO.tipos).toEqual(['pdf', 'jpg', 'png', 'xml']);
  });
  it('documento da OC (`motivoArquivoInvalido`): PDF, JPG, PNG e XML (o XML entra desde o 01b1, com ou sem tipo); a frase do tamanho diz os MB', () => {
    for (const f of [arq('n.pdf', 'application/pdf'), arq('n.png', 'image/png'), arq('n.xml', 'text/xml'), arq('n.xml', 'application/xml'), arq('n.xml', '')]) {
      expect(motivoArquivoInvalido(f)).toBeNull();
    }
    expect(motivoArquivoInvalido(arq('n.txt', 'text/plain'))).toBe('Formato não aceito. Envie PDF, JPG, PNG ou XML.');
    expect(motivoArquivoInvalido(arq('g.pdf', 'application/pdf', 12 * MB))).toBe('Arquivo de 12.0 MB excede o limite de 10 MB.');
    expect(REGRA_ARQUIVO_DA_OC.tipos).toEqual(['pdf', 'jpg', 'png', 'xml']);
  });
  it('boleto: PDF, JPG ou PNG — XML NÃO entra, e a frase diz exatamente o que entra', () => {
    expect(REGRA_ARQUIVO_DO_BOLETO.tipos).toEqual(['pdf', 'jpg', 'png']);
    expect(aceitarArquivo([arq('b.pdf', 'application/pdf')], REGRA_ARQUIVO_DO_BOLETO).ok).toBe(true);
    for (const f of [arq('n.xml', 'text/xml'), arq('n.xml', '')]) {
      expect(aceitarArquivo([f], REGRA_ARQUIVO_DO_BOLETO).motivo).toBe('Formato não aceito. Envie PDF, JPG ou PNG.');
    }
    expect(aceitarArquivo([arq('g.pdf', 'application/pdf', 10 * MB + 1)], REGRA_ARQUIVO_DO_BOLETO).motivo).toBe('Arquivo acima de 10 MB.');
  });
  it('extrato do saldo (`anexarSaldoDocumento`): recusa ANTES de ir ao banco, com a frase de sempre', async () => {
    const p = { clienteId: 'c', contaId: 'k', anoMes: '2026-09' };
    expect(await anexarSaldoDocumento({ ...p, file: arq('a.txt', 'text/plain') })).toEqual({ ok: false, erro: 'Formato não aceito. Envie PDF, JPG, PNG ou XML.' });
    expect(await anexarSaldoDocumento({ ...p, file: arq('g.pdf', 'application/pdf', 10 * MB + 1) })).toEqual({ ok: false, erro: 'Arquivo acima de 10 MB.' });
  });
});
