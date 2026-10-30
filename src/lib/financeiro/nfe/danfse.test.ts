/**
 * P174 NFSE-LEITURA-01 — o DANFSe (NFS-e nacional, PDF) lido pelo rotulo entrega a MESMA `NotaLida`, com `modelo = 'nfse'`.
 * S1 o DANFSe sintetico lido inteiro · S2 a chave de 50 confere; cada campo trocado diverge · S3 retencoes: lancamento = liquido, a nota
 * guardada fecha com o bruto, o servico vai ao `totais` e volta igual · S4 cancelada recusa; sem chave recusa · S5 a porta decide pelo
 * titulo (o DANFE de sempre nao e' DANFSe) · S6 a NFS-e segue o caminho da NF-e (`proporLancamento`: liquido, competencia, fazenda pela
 * IE das informacoes complementares) · S7 a chave digitada de 50 · S8 a regra unica da chave de nota (44 ou 50).
 */
import { describe, it, expect } from 'vitest';
import { digitoDaChave, notaDoDanfe, type ItemDoDanfe, type ResultadoDoDanfe } from './danfe';
import { lerNota } from './lerNota';
import type { PdfjsMinimo } from './lerNotaPdf';
import { conferirChaveNfse, documentoDaChaveNfse, ehDanfse, notaDoDanfse, FRASE_NFSE_CANCELADA } from './danfse';
import { ehChaveDeNota } from './formatos';
import { itensDoPdf, lidosDoBanco, payloadDaNotaFiscal } from './itensDaNota';
import { notaDaChaveDigitada, FRASE_CHAVE_INVALIDA } from './chaveDigitada';
import { proporLancamento } from './proporLancamento';
import { resolverEmitente } from './resolverEmitente';
import { CNPJ_PRESTADOR_SINTETICO, chaveNfseSintetica, danfseSintetico } from './__fixtures__/danfseSintetico';
import { PAGINAS_DANFE_SINTETICO } from './__fixtures__/danfeSintetico';

function lida(r: ResultadoDoDanfe) {
  if (r.ok === false) throw new Error(`esperava nota, veio recusa: ${r.frase}`);
  return r;
}

describe('S1 — o DANFSe sintetico lido inteiro', () => {
  const r = lida(notaDoDanfse(danfseSintetico()));
  const n = r.nota;
  it('cabecalho, prestador = emitente, tomador = destinatario', () => {
    expect(n.modelo).toBe('nfse');
    expect(n.chave).toBe(chaveNfseSintetica('57', '2610'));
    expect([n.numero, n.serie, n.emissao, n.tipoNota, n.finalidade]).toEqual(['57', '', '2026-10-06', 'saida', 'normal']);
    expect(n.emitente).toEqual({
      documento: CNPJ_PRESTADOR_SINTETICO, nome: 'OFICINA SINTETICA DE TESTE LTDA', fantasia: null, ie: null,
      endereco: { logradouro: 'RUA DAS FLORES', numero: '100', complemento: null, bairro: 'CENTRO', municipio: 'CAMPO GRANDE', uf: 'MS', cep: '79000000', telefone: null },
    });
    expect(n.destinatario).toEqual({ documento: '11144477735', nome: 'PRODUTOR SINTETICO DE TESTE', ie: '280000001', endereco: 'FAZENDA SINTETICA, S/N, ZONA RURAL' });
  });
  it("o servico e' o item (a descricao livre inteira, sem os rotulos do ISSQN), sem duplicata e sem protocolo", () => {
    expect(n.itens).toEqual([{ descricao: 'CONSERTO DA BOMBA DO POCO SINTETICO 02 DESLOCAMENTO', quantidade: '1', unidade: '', valorCent: 98000,
      unitarioCent: 98000, detalhe: null, fiscal: { codigo: '14.01.01' } }]);
    expect(n.duplicatas).toEqual([]);
    expect(n.protocolo).toBeNull();
    expect(r.avisos).toEqual(['sem_duplicatas']);
    expect(r.divergencias).toEqual([]);
  });
  it('os valores: sem retencao, liquido = bruto; o ISS "Nao Retido" nao conta', () => {
    expect(n.totais).toEqual({ produtosCent: 98000, freteCent: 0, descontoCent: 0, notaCent: 98000 });
    expect(n.servico).toEqual({ competencia: '2026-10-06', codigoTributacao: '14.01.01', nbs: '120013110', brutoCent: 98000,
      retencoes: { issRetidoCent: 0, irrfCent: 0, previdenciaCent: 0, contribuicoesSociaisCent: 0 }, totalRetidoCent: 0, liquidoCent: 98000 });
  });
  it('marca no PDF o que leu', () => {
    expect(new Set(r.marcas.map((m) => m.campo))).toEqual(new Set(['chave', 'numero', 'emissao', 'emitente_cnpj', 'emitente', 'emitente_cidade',
      'emitente_endereco', 'destinatario', 'itens', 'produtos', 'desconto', 'valor_nota']));
  });
});

describe('S2 — a chave de 50 confere o lido', () => {
  it('as partes da chave: o prestador (CNPJ; CPF sem os 3 zeros) e o digito', () => {
    const c = chaveNfseSintetica('57', '2610');
    expect(c).toHaveLength(50);
    expect(digitoDaChave(c.slice(0, 49))).toBe(Number(c[49]));
    expect(documentoDaChaveNfse(c)).toBe(CNPJ_PRESTADOR_SINTETICO);
    expect(documentoDaChaveNfse(chaveNfseSintetica('57', '2610', '11144477735', '1'))).toBe('11144477735');
  });
  it('numero, mes e digito trocados divergem; o mes vale pela emissao OU pela competencia', () => {
    expect(lida(notaDoDanfse(danfseSintetico({ chave: chaveNfseSintetica('58', '2610') }))).divergencias).toEqual(['numero']);
    expect(lida(notaDoDanfse(danfseSintetico({ chave: chaveNfseSintetica('57', '2611') }))).divergencias).toEqual(['mes']);
    expect(lida(notaDoDanfse(danfseSintetico({ chave: chaveNfseSintetica('57', '2610', '99888777000166') }))).divergencias).toEqual(['cnpj']);
    const errada = `${chaveNfseSintetica('57', '2610').slice(0, 49)}${(Number(chaveNfseSintetica('57', '2610')[49]) + 1) % 10}`;
    expect(lida(notaDoDanfse(danfseSintetico({ chave: errada }))).divergencias).toEqual(['digito']);
    /* emissao em 06/10, competencia em 09/2026 e a chave com 2609: confere pela competencia */
    expect(lida(notaDoDanfse(danfseSintetico({ competencia: '30/09/2026', chave: chaveNfseSintetica('57', '2609') }))).divergencias).toEqual([]);
  });
  it('chave que nao tem 50 digitos nao confere', () => {
    const n = lida(notaDoDanfse(danfseSintetico())).nota;
    expect(conferirChaveNfse({ ...n, chave: n.chave.slice(0, 44) })).toEqual(['digito']);
  });
});

describe("S3 — retencoes: o lancamento e' o liquido; a nota guardada fecha com o bruto", () => {
  const opc = { bruto: '10.000,00', issRetido: true, issApurado: '200,00', irrf: '150,00', previdencia: '1.100,00', contribuicoes: '465,00',
    totalRetido: '1.915,00', liquido: '8.085,00' };
  const r = lida(notaDoDanfse(danfseSintetico(opc)));
  it('cada retencao lida; total e liquido impressos', () => {
    expect(r.nota.servico?.retencoes).toEqual({ issRetidoCent: 20000, irrfCent: 15000, previdenciaCent: 110000, contribuicoesSociaisCent: 46500 });
    expect([r.nota.servico?.brutoCent, r.nota.servico?.totalRetidoCent, r.nota.servico?.liquidoCent, r.nota.totais.notaCent]).toEqual([1000000, 191500, 808500, 808500]);
  });
  it('os itens da nota fecham com o bruto (nao com o liquido) e o servico vai ao `totais`; volta do banco igual', () => {
    const l = itensDoPdf(r.nota, r.extras);
    expect(l.itens.map((i) => i.liquidoCent)).toEqual([1000000]);
    expect(l.totais.notaCent).toBe(1000000);
    const p = payloadDaNotaFiscal(r.nota, l, null);
    expect(p.nota.chave_acesso).toHaveLength(50);
    expect(p.nota.totais.nota_cent).toBe(1000000);
    expect(p.nota.totais.servico).toEqual({ competencia: '2026-10-06', codigo_tributacao: '14.01.01', nbs: '120013110', bruto_cent: 1000000,
      retencoes: { iss_retido_cent: 20000, irrf_cent: 15000, previdencia_cent: 110000, contribuicoes_sociais_cent: 46500 }, total_retido_cent: 191500, liquido_cent: 808500 });
    const volta = lidosDoBanco({ ...p.nota }, p.itens.map((i) => ({ ...i })));
    expect(volta.lidos.totais.servico).toEqual(r.nota.servico);
  });
  it('desconto incondicionado: o do quadro do valor total (nao o do ISSQN); o item fecha com bruto - desconto', () => {
    const d = lida(notaDoDanfse(danfseSintetico({ bruto: '1.000,00', desconto: '100,00', liquido: '900,00' })));
    expect(d.nota.totais.descontoCent).toBe(10000);
    const l = itensDoPdf(d.nota, d.extras);
    expect([l.itens[0].liquidoCent, l.totais.notaCent]).toEqual([90000, 90000]);
  });
  it("a NF-e nao ganha `servico` nos totais (o caminho dela e' o de sempre)", () => {
    const nfe = notaDoDanfe(PAGINAS_DANFE_SINTETICO);
    if (nfe.ok === false) throw new Error(nfe.frase);
    expect(nfe.nota.servico).toBeUndefined();
    const l = itensDoPdf(nfe.nota, nfe.extras);
    expect(l.totais.notaCent).toBe(nfe.nota.totais.notaCent);
    expect('servico' in payloadDaNotaFiscal(nfe.nota, l, null).nota.totais).toBe(false);
  });
});

describe('S4 — recusas', () => {
  it('NFS-e cancelada ou substituida', () => {
    expect(notaDoDanfse(danfseSintetico({ situacao: 'NFS-e Cancelada' }))).toEqual({ ok: false, motivo: 'incompleta', frase: FRASE_NFSE_CANCELADA });
    expect(notaDoDanfse(danfseSintetico({ situacao: 'NFS-e Substituída' }))).toEqual({ ok: false, motivo: 'incompleta', frase: FRASE_NFSE_CANCELADA });
  });
  it('sem a chave de 50: "Nota sem chave de acesso."; sem texto: o PDF sem texto', () => {
    const semChave = danfseSintetico().map((p) => p.filter((it) => !/^\d{50}$/.test(it.str)));
    expect(notaDoDanfse(semChave)).toMatchObject({ ok: false, frase: 'Nota sem chave de acesso.' });
    expect(notaDoDanfse([[]])).toMatchObject({ ok: false, motivo: 'pdf_sem_texto' });
  });
});

describe('S5 — a porta decide pelo titulo', () => {
  it("o DANFSe e' DANFSe; o DANFE de sempre nao", () => {
    expect(ehDanfse(danfseSintetico())).toBe(true);
    expect(ehDanfse(PAGINAS_DANFE_SINTETICO)).toBe(false);
  });
  it("lerNota: o PDF que e' DANFSe sai como NFS-e; o DANFE de sempre segue NF-e (pdfjs falso servindo os itens)", async () => {
    const pdfjsCom = (paginas: ItemDoDanfe[][]): PdfjsMinimo => ({
      getDocument: () => ({ promise: Promise.resolve({ numPages: paginas.length, getPage: (n: number) => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: paginas[n - 1].map((i) => ({ str: i.str, transform: [1, 0, 0, i.h, i.x, i.y], width: i.w, height: i.h })) }),
        getViewport: () => ({ width: 595, height: 842 }) }) }) }),
    });
    const pdf = new TextEncoder().encode('%PDF-1.7 sintetico').buffer;
    const s = await lerNota(pdf, { pdfjs: pdfjsCom(danfseSintetico()) });
    if (s.ok === false) throw new Error(s.frase);
    expect([s.origem, s.nota.modelo, s.nota.chave.length, s.divergencias]).toEqual(['pdf', 'nfse', 50, []]);
    const e = await lerNota(pdf, { pdfjs: pdfjsCom(PAGINAS_DANFE_SINTETICO) });
    if (e.ok === false) throw new Error(e.frase);
    expect([e.nota.modelo, e.nota.chave.length]).toEqual(['55', 44]);
  });
  it("o DANFSe no leitor do DANFE e' a recusa de hoje (por isso a porta desvia antes)", () => {
    expect(notaDoDanfe(danfseSintetico())).toMatchObject({ ok: false, motivo: 'pdf_nao_e_danfe' });
  });
});

describe('S6 — a NFS-e segue o caminho da NF-e', () => {
  const opc = { bruto: '10.000,00', irrf: '150,00', totalRetido: '150,00', liquido: '9.850,00', competencia: '30/09/2026', chave: chaveNfseSintetica('57', '2610') };
  const r = lida(notaDoDanfse(danfseSintetico(opc)));
  it('proporLancamento: valor = liquido; competencia = a da NFS-e; fazenda pela IE das informacoes complementares; sem vencimento', () => {
    const p = proporLancamento({ nota: r.nota, avisosDoLeitor: r.avisos, fazendas: [{ id: 'faz-1', nome: 'Faz. Sintetica', ie: '280000001' }],
      emitente: resolverEmitente(r.nota.emitente, [], null), favorecidoId: null, ultima: null });
    if (p.ok === false) throw new Error(p.frase);
    expect(p.proposta.valorCent).toBe(985000);
    expect(p.proposta.competencia).toBe('2026-09-30');
    expect(p.proposta.fazendaId).toBe('faz-1');
    expect(p.proposta.duplicatas).toEqual([]);
    expect(p.proposta.documento).toMatchObject({ chaveAcesso: r.nota.chave, valorCent: 985000, dataEmissao: '2026-10-06' });
  });
});

describe('S7 — a chave digitada de 50 (P95)', () => {
  it('a NFS-e da chave: o prestador, o numero e o mes; o resto em branco', () => {
    const r = notaDaChaveDigitada(chaveNfseSintetica('405', '2610').replace(/(\d{5})/g, '$1 '));
    if (r.ok === false) throw new Error(r.frase);
    expect([r.nota.modelo, r.nota.numero, r.nota.emitente.documento, r.mes, r.avulsa]).toEqual(['nfse', '405', CNPJ_PRESTADOR_SINTETICO, '2026-10', false]);
    expect([r.nota.emissao, r.nota.totais.notaCent, r.nota.itens.length]).toEqual(['', 0, 0]);
  });
  it('digito errado recusa', () => {
    const c = chaveNfseSintetica('405', '2610');
    expect(notaDaChaveDigitada(`${c.slice(0, 49)}${(Number(c[49]) + 1) % 10}`)).toEqual({ ok: false, frase: FRASE_CHAVE_INVALIDA });
  });
});

describe('S8 — a chave de uma nota: 44 ou 50 digitos', () => {
  it('so\' esses dois tamanhos, so\' digitos', () => {
    expect(ehChaveDeNota('1'.repeat(44))).toBe(true);
    expect(ehChaveDeNota('1'.repeat(50))).toBe(true);
    for (const c of ['1'.repeat(43), '1'.repeat(45), '1'.repeat(49), '1'.repeat(51), `${'1'.repeat(43)}a`, '', null, undefined]) expect(ehChaveDeNota(c)).toBe(false);
  });
});
