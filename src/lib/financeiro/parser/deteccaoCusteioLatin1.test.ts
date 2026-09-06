/**
 * O que este teste trava — que o relatório de custeio seja RECONHECIDO mesmo em cp1252.
 *
 * ⚠ O ARQUIVO DO SISTEMA DE COMPRAS NÃO É UTF-8. `file` responde "ISO-8859 text" e
 * `iconv -f utf-8` responde "Illegal byte sequence": os acentos são bytes únicos de
 * cp1252. A detecção lia o começo com `Blob.text()`, que decodifica sempre como UTF-8,
 * e "Família:" chegava como "Fam�lia:". A âncora `/^fam[íi]lia\s*:/i` não casa com
 * U+FFFD, `pareceCusteio` dizia não, o `.txt` caía no motor do extrato e o operador via
 * "O CSV não está num layout reconhecido" — uma mensagem verdadeira sobre a pergunta
 * errada.
 *
 * ⚠ MEDIDO NO ARQUIVO REAL (04.2026.txt, mesmo formato do 082026): 22 ocorrências de
 * U+FFFD na leitura UTF-8; como UTF-8 as âncoras dão fazenda=true, família=FALSE,
 * sub-fam=true; como cp1252, as três dão true. Uma âncora de três derrubava o caminho
 * inteiro.
 */
import { describe, it, expect } from 'vitest';
import { pareceCusteio } from './detectarTipoArquivo';
import { decodeTxt, decodeTxtParcial } from '@/v2/lib/custeio/parseCusteioTxt';

/** As três linhas-âncora como o relatório as imprime, em bytes cp1252. */
const RELATORIO_CP1252 = (() => {
  const texto = [
    '   R J',
    '   Sistema de Compras',
    '   Emissão     13/05/2026         Hr.    15:12:18',
    '   Custeio Analítico Competência/Caixa',
    '    Descrição                        Valor em Real',
    '    Fazenda:     FAZENDA MONTERREY            125.909,24',
    '    Família:     COMBUSTIVEIS                12.345,67',
    '    Sub-Fam:     DIESEL                       12.345,67',
    '      DIESEL S10                              12.345,67',
  ].join('\r\n');
  /* cp1252: cada caractere acentuado do bloco Latin-1 é UM byte com o próprio code point. */
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i) & 0xff;
  return bytes.buffer;
})();

describe('detecção do custeio em arquivo cp1252', () => {
  it('lido como UTF-8, a âncora de Família se perde — o defeito, reproduzido', () => {
    const comoUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(RELATORIO_CP1252);
    expect(comoUtf8).toContain('�');
    expect(comoUtf8).toContain('Fam�lia:');
    expect(pareceCusteio(comoUtf8)).toBe(false);        // ← daqui saía "layout não reconhecido"
  });

  it('decodificado como o parser sempre fez, é reconhecido', () => {
    const texto = decodeTxt(RELATORIO_CP1252);
    expect(texto).toContain('Família:');
    expect(pareceCusteio(texto)).toBe(true);
  });

  it('a versão parcial (a da detecção) decide igual à inteira', () => {
    expect(pareceCusteio(decodeTxtParcial(RELATORIO_CP1252))).toBe(true);
  });

  it('arquivo UTF-8 legítimo não é rebaixado a cp1252', () => {
    /* A guarda só troca de decoder quando há U+FFFD; texto UTF-8 válido passa intacto,
       e é isso que impede o conserto de virar o defeito simétrico. */
    const utf8 = new TextEncoder().encode('    Família:     ÁGUA E ESGOTO     1.234,56').buffer;
    expect(decodeTxtParcial(utf8)).toContain('Família:');
    expect(decodeTxtParcial(utf8)).not.toContain('�');
  });

  it('⚠ o corte em 64 KB pode partir um caractere, e isso não pode trocar o decoder', () => {
    /* Sem `stream: true`, a sequência UTF-8 incompleta do fim viraria U+FFFD e o arquivo
       UTF-8 inteiro seria lido como cp1252 — um defeito mais raro e mais difícil de ver
       que o original. */
    const completo = new TextEncoder().encode('Família: ÁGUA');
    const cortado = completo.slice(0, completo.length - 1).buffer;   // corta o último byte do "A"
    expect(decodeTxtParcial(cortado)).toContain('Família:');
    expect(decodeTxtParcial(cortado)).not.toContain('�');
  });
});
