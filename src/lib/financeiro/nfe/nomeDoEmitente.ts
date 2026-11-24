/**
 * FORN-CRIAR-DA-NOTA-ERRO (Gabriel 24/11, NF 39.814) — há sistema emissor que grava no nome do emitente (`xNome` do XML e o canhoto do
 * DANFE) um CÓDIGO dele antes da razão social: "1 - EMPRESA LTDA". O código não é do fornecedor: sai na LEITURA (as duas portas, XML e
 * PDF), e o cadastro, a busca e a comparação recebem só a razão social. A regra: 1 a 4 algarismos, hífen com espaço depois, e texto.
 * "3M DO BRASIL", "1-2-3 COMERCIO" e "2001 VIDROS" ficam como estão. Nome que seria só o código fica inteiro. PURO.
 */
const RE_CODIGO_DO_EMISSOR = /^\s*\d{1,4}\s*-\s+(?=\S)/;

export function semCodigoDoEmissor(nome: string): string {
  const limpo = nome.replace(RE_CODIGO_DO_EMISSOR, '').trim();
  return limpo || nome.trim();
}
