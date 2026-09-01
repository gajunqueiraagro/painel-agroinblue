import { describe, it, expect } from 'vitest';
import { detectarTipoArquivo, pareceCusteio, pareceOFX } from './detectarTipoArquivo';

/**
 * O que este teste protege — FIN-IMPORTAR-HUB-UNICO-01 (B-36).
 *
 * ⚠ O CASO QUE MOTIVOU O MÓDULO é o `.txt` compartilhado: extrato em texto e
 * relatório de custeio usam a MESMA extensão e viram coisas diferentes
 * (movimento x lançamento). Se o desempate por conteúdo quebrar, o custeio cai
 * no leitor de extrato e responde "nenhum movimento encontrado" — a mensagem
 * errada para o arquivo certo. Nenhum outro gate pega isso: TSC e build passam,
 * porque o tipo `TipoArquivoImport` é o mesmo dos dois lados.
 */

/** Um recorte fiel do cabeçalho do relatório de custeio, com as três âncoras. */
const CUSTEIO = [
  'RELATORIO DE CUSTEIO',
  'Fazenda: 001 - SANTA LUZIA',
  'Periodo: 01/08/2026 a 31/08/2026',
  'Familia: 10 - INSUMOS',
  'Subfamilia: 1001 - FERTILIZANTES',
  '  01/08/2026  NF 1234  UREIA           1.500,00',
].join('\n');

const OFX = [
  'OFXHEADER:100',
  '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>',
  '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260801<TRNAMT>-1500.00</STMTTRN>',
].join('\n');

const CSV = [
  'Data;Historico;Valor',
  '01/08/2026;PAGAMENTO FORNECEDOR;-1.500,00',
].join('\n');

describe('detectarTipoArquivo — o desempate do .txt', () => {
  it('relatório de custeio em .txt vai para o fluxo do custeio', () => {
    expect(detectarTipoArquivo('custeio_agosto.txt', CUSTEIO).tipo).toBe('custeio-txt');
  });

  it('extrato delimitado em .txt vai para o fluxo do extrato', () => {
    expect(detectarTipoArquivo('extrato.txt', CSV).tipo).toBe('csv-extrato');
  });

  it('OFX salvo com extensão .txt ainda é reconhecido pelo conteúdo', () => {
    expect(detectarTipoArquivo('extrato.txt', OFX).tipo).toBe('ofx');
  });
});

describe('detectarTipoArquivo — extensão primeiro', () => {
  it('.xlsx é Excel sem olhar conteúdo (binário, não há texto para conferir)', () => {
    expect(detectarTipoArquivo('lancamentos.xlsx', '').tipo).toBe('excel');
    expect(detectarTipoArquivo('LANCAMENTOS.XLS', '').tipo).toBe('excel');
  });

  it('.ofx com a tag é OFX', () => {
    const r = detectarTipoArquivo('extrato.ofx', OFX);
    expect(r.tipo).toBe('ofx');
    expect(r.aviso).toBeNull();
  });

  it('.csv comum é extrato em texto', () => {
    expect(detectarTipoArquivo('extrato.csv', CSV).tipo).toBe('csv-extrato');
  });
});

describe('detectarTipoArquivo — a extensão mentirosa NOMEIA o que parece ser', () => {
  /* ⚠ Recusar sem dizer o quê manda o operador adivinhar. Estes três casos
     existem para que o aviso continue apontando o próximo passo. */
  it('.ofx que na verdade é custeio: recusa e diz o que é', () => {
    const r = detectarTipoArquivo('extrato.ofx', CUSTEIO);
    expect(r.tipo).toBeNull();
    expect(r.aviso).toMatch(/custeio/i);
  });

  it('.ofx sem as marcações de OFX: recusa e manda conferir o arquivo do banco', () => {
    const r = detectarTipoArquivo('extrato.ofx', CSV);
    expect(r.tipo).toBeNull();
    expect(r.aviso).toMatch(/marcações/i);
  });

  it('.csv que na verdade é custeio: recusa e diz o que é', () => {
    const r = detectarTipoArquivo('custeio.csv', CUSTEIO);
    expect(r.tipo).toBeNull();
    expect(r.aviso).toMatch(/custeio/i);
  });

  it('extensão desconhecida ainda tenta pelo conteúdo', () => {
    expect(detectarTipoArquivo('arquivo.dat', OFX).tipo).toBe('ofx');
    expect(detectarTipoArquivo('arquivo.dat', CUSTEIO).tipo).toBe('custeio-txt');
  });

  it('nada reconhecível: recusa dizendo o que a tela aceita', () => {
    const r = detectarTipoArquivo('foto.png', 'lixo binário qualquer');
    expect(r.tipo).toBeNull();
    expect(r.aviso).toMatch(/\.ofx/);
  });
});

describe('as âncoras do custeio são AS TRÊS, não uma', () => {
  /* "Fazenda:" sozinho aparece em relatório de qualquer coisa desta casa — é a
     combinação que identifica o formato, e é isso que este caso trava. */
  it('só "Fazenda:" não faz um custeio', () => {
    expect(pareceCusteio('Fazenda: 001 - SANTA LUZIA\nOutro relatório qualquer')).toBe(false);
  });

  it('as três juntas fazem', () => {
    expect(pareceCusteio(CUSTEIO)).toBe(true);
  });
});

describe('pareceOFX', () => {
  it('reconhece por <OFX> ou por <STMTTRN>, em qualquer caixa', () => {
    expect(pareceOFX('<ofx>')).toBe(true);
    expect(pareceOFX('<STMTTRN>')).toBe(true);
    expect(pareceOFX(CSV)).toBe(false);
  });
});
