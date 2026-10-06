/**
 * falhaDoPdf — a FRASE da falha do PDF, FORA do pedaço carregado sob demanda (PARC-LIVRES-01, passo 0, 06/10/2026).
 *
 * ⚠ ESTA FUNÇÃO NÃO PODE MORAR NO MÓDULO QUE SE CARREGA COM `import()`: a falha mais comum é justamente esse `import()` não
 *   chegar — a página ficou aberta, o aplicativo foi publicado de novo e o arquivo antigo do PDF não existe mais no servidor.
 *   A tela pegava essa exceção FORA do `gerarPdfCpr` e escrevia a mensagem crua do navegador, em inglês, com o endereço do
 *   arquivo ("Failed to fetch dynamically imported module: https://…"). Movida de `gerarPdfCpr.tsx` sem mudar uma linha.
 */
/** Traduz a exceção para uma frase que diz o que houve E o que fazer — as mesmas três causas do PDF executivo. */
export function motivoDaFalhaDoPdf(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) {
    return 'O aplicativo foi atualizado depois que esta página abriu. Recarregue a página (Ctrl+R) e gere o PDF de novo.';
  }
  if (/unsupported number/i.test(msg)) {
    return `Um valor inválido entre as contas deste período impediu o desenho do PDF. Confira os lançamentos. (${msg})`;
  }
  return `Falha ao gerar PDF: ${msg}`;
}
