/**
 * busca — P134 (Gabriel 27/10/2026): TODA BUSCA DO SISTEMA ignora acento, cedilha e maiúscula/minúscula, nos DOIS lados ("maq" acha
 * "Máquinas", "manutencao" acha "Manutenção", "acucar" acha "Açúcar", "JOAO" acha "João"). O texto mostrado e gravado continua com
 * acento: só a COMPARAÇÃO é normalizada.
 *
 * ⚠ É A REGRA QUE JÁ EXISTIA, PROMOVIDA: o corpo de `normalizarParaBusca` é o do `normalizarNome` da busca de fornecedor
 *   (FORN-BUSCA-UNICA-01), movido para cá sem mudança; `buscaDeFornecedor.ts` passa a reexportá-lo. No banco o espelho é
 *   `_fn_normalizar_texto` (e `fn_texto_casa` é o espelho de `casaNaBusca`).
 * ⚠ OS DOIS LADOS SÃO PRESOS PELO MESMO ARQUIVO DE CASOS: `busca.casos.json`. O vitest roda estas funções contra ele, e o teste SQL
 *   `supabase/tests/p134_busca_sem_acento_test.sql` é GERADO dele (`node scripts/gerar-teste-busca-sem-acento.mjs`); um vitest confere
 *   que o SQL gravado está em dia com o arquivo.
 * ⚠ CAMPO DE BUSCA NOVO USA `casaNaBusca` (ou `normalizarParaBusca` uma vez por lista e `includes` por tecla). Comparar com
 *   `toLowerCase().includes` deixa o acento de fora — era o "maq" que não achava "Máquinas" no subcentro.
 */

/** O texto como a busca o compara: sem acento e sem cedilha (NFD sem as marcas), minúsculo, espaços juntados. Vazio = ''. */
export function normalizarParaBusca(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** O termo digitado está DENTRO do texto, os dois normalizados? Termo vazio casa com tudo. */
export function casaNaBusca(texto: string | null | undefined, termo: string | null | undefined): boolean {
  return normalizarParaBusca(texto).includes(normalizarParaBusca(termo));
}
