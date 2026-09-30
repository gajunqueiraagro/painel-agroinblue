/**
 * O TEXTO DE UM ARQUIVO DE EXTRATO, NO CHARSET QUE ELE DECLARA — PR-CONC-CRIAR-LOTE-LAYOUT-01.
 *
 * ⚠ O DEFEITO: a importação lia o arquivo com `File.text()`, que decodifica SEMPRE como UTF-8. O OFX do Banco do
 *   Brasil (e o do Bradesco) vem em cp1252/Latin-1 — o cabeçalho SGML do OFX 1.x declara `CHARSET:1252` —, então
 *   "Cartão" chegava como "Cart�o". Medido no proto (30/09): 326 linhas de extrato com U+FFFD, todas BB ou
 *   Bradesco (NJ BB 200, Santa Rita BB 120, Santa Rita Bradesco 6). O substituto é PERDA: o byte original não volta
 *   do texto gravado.
 * ⚠ A ORDEM DA DECISÃO:
 *   1. o que o ARQUIVO DECLARA — `CHARSET:1252` / `ISO-8859-1` / `ENCODING:UTF-8` do cabeçalho OFX 1.x, ou o
 *      `encoding="..."` do `<?xml ?>` do OFX 2.x;
 *   2. declarado UTF-8, mas os bytes não são UTF-8 válido: cp1252 (o arquivo mente, e o substituto seria perda);
 *   3. nada declarado (CSV, OFX sem cabeçalho): UTF-8 se for válido, senão cp1252 — a mesma regra que o custeio já
 *      usava (`decodeTxt`).
 * ⚠ ISO-8859-1 SE LÊ COMO windows-1252: é o que o próprio padrão WHATWG faz com o rótulo, e o 1252 só acrescenta
 *   caracteres (aspas curvas, travessão) nas posições que o Latin-1 deixa para controle.
 * ⚠ `USASCII` SOZINHO NÃO É UTF-8 NEM 1252: é "só ASCII" — e aí qualquer leitura serve; quem manda é o CHARSET.
 */

const CP1252 = 'windows-1252';

/** O charset que o arquivo declara, ou `null` quando ele não declara nada que sirva. */
export function charsetDeclarado(cabecalho: string): 'utf-8' | 'windows-1252' | null {
  const xml = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(cabecalho);
  const ofxCharset = /^\s*CHARSET\s*:\s*([^\s<]+)/im.exec(cabecalho);
  const ofxEncoding = /^\s*ENCODING\s*:\s*([^\s<]+)/im.exec(cabecalho);
  const rotulos = [xml?.[1], ofxEncoding?.[1], ofxCharset?.[1]].filter((x): x is string => !!x).map((x) => x.toUpperCase());
  if (rotulos.some((r) => r === 'UTF-8' || r === 'UTF8')) return 'utf-8';
  if (rotulos.some((r) => r === '1252' || r === 'WINDOWS-1252' || r === 'CP1252'
    || r === 'ISO-8859-1' || r === 'ISO8859-1' || r === 'LATIN1' || r === '8859-1')) return CP1252;
  return null;
}

/** UTF-8 estrito: `null` se os bytes não forem UTF-8 válido. */
function utf8Valido(bytes: ArrayBuffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** O texto do arquivo, decodificado pelo charset declarado (ver a ordem da decisão no topo). */
export function decodificarExtrato(bytes: ArrayBuffer): string {
  /* O cabeçalho é ASCII em qualquer dos charsets possíveis: lê-lo como 1252 nunca erra a DECLARAÇÃO. */
  const cabecalho = new TextDecoder(CP1252).decode(bytes.slice(0, 2048));
  const declarado = charsetDeclarado(cabecalho);
  if (declarado === CP1252) return new TextDecoder(CP1252).decode(bytes);
  return utf8Valido(bytes) ?? new TextDecoder(CP1252).decode(bytes);
}
