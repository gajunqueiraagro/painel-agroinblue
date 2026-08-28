/**
 * fetchComTimeout — relogio para toda requisicao que sai pelo cliente Supabase.
 *
 * POR QUE EXISTE
 * ──────────────
 * O cliente nascia sem `global.fetch`, e portanto SEM TIMEOUT. Requisicao que
 * estola nao rejeita: a promise fica pendurada para sempre. Quem chamou espera
 * um `catch` que nunca vem e um `finally` que nunca roda — entao o botao nunca
 * volta de "Confirmando...". Foi exatamente o clique travado da OC 156b793b,
 * diagnostico fechado em 27/08: nao havia erro para exibir porque nao havia
 * erro, havia ausencia. Falhar alto depois de 30s e' melhor que esperar sem fim.
 *
 * POR QUE A LOGICA MORA AQUI, E NAO EM client.ts
 * ──────────────────────────────────────────────
 * `src/integrations/supabase/client.ts` abre com "This file is automatically
 * generated. Do not edit it directly." — a ferramenta que o gera pode reescreve-
 * lo e levar junto o que estiver la dentro. Deixando so DUAS linhas la (o import
 * e o `global: { fetch }`), uma regeneracao custa uma linha obvia de religar,
 * nao a logica. Este arquivo e' nosso e sobrevive.
 *
 * ⚠ Se um dia o Financeiro voltar a travar em "Salvando..." sem erro, confira
 * PRIMEIRO se `client.ts` ainda importa este helper.
 *
 * OS 30 SEGUNDOS
 * ──────────────
 * Medido em pg_stat_statements (27/08): a consulta mais lenta do aplicativo tem
 * media de 565 ms. Os statements acima de 15s no banco vem todos do SQL Editor /
 * MCP (`-- source: POST /v1/projects/:ref/database/query`), nao do app. 30s e'
 * ~53x a pior media real — teto para o que travou, nao para o que e' lento.
 *
 * STORAGE FICA DE FORA
 * ────────────────────
 * O fetch passado ao `createClient` vale para TODOS os sub-clientes: postgrest,
 * storage, auth e functions. O upload de foto de AbateDetalhesDialog.tsx:470 e'
 * o unico caminho de Storage do sistema e roda em conexao rural — 30s mata foto
 * legitima. Por isso a isencao explicita por URL.
 *
 * RISCOS RESIDUAIS CONHECIDOS (registrados, nao resolvidos aqui)
 * ──────────────────────────────────────────────────────────────
 * 1. RETRY. O `TimeoutError` chega ao React Query como erro comum e entra no
 *    retry padrao. CONFERIDO: `App.tsx:12` e' `new QueryClient()` sem opcoes,
 *    entao vale o default `retry: 3` — QUATRO tentativas, nao tres. No pior
 *    caso a espera percebida vai a 4x30s = 2 MINUTOS, e o `toast.error` de
 *    useFinanceiro dispara a cada tentativa (ate 4 toasts iguais). Avaliar
 *    `retry: 0` para TimeoutError em frente propria — nao aqui, porque mexe na
 *    politica de rede do app inteiro.
 * 2. PAGINACAO. Em `fetchAllPaginated`, pagina que estoura derruba a colecao
 *    inteira. Isso e' CORRETO — melhor errar alto do que exibir metade do
 *    Financeiro como se fosse o todo. CONFERIDO que o erro nao e' engolido:
 *    useFinanceiro.ts:527-529 faz `toast.error` e RE-LANCA (`throw err`), entao
 *    o usuario ve a falha e o React Query tambem.
 * 3. REFRESH TOKEN. O `autoRefreshToken` tambem passa a ter teto de 30s.
 *    Desejavel: renovacao pendurada e' pior que renovacao que falha e refaz.
 */

/** Teto de espera. Ver "OS 30 SEGUNDOS" no cabecalho antes de mexer. */
const TIMEOUT_MS = 30_000;

/** Upload/download de arquivo nao entra no relogio. Ver cabecalho. */
const ISENTO_DE_RELOGIO = '/storage/v1/';

function urlDaRequisicao(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export const fetchComTimeout: typeof fetch = (input, init) => {
  if (urlDaRequisicao(input).includes(ISENTO_DE_RELOGIO)) {
    return fetch(input, init);
  }

  const controle = new AbortController();

  // Quem chamou pode ter o proprio motivo para desistir (cleanup de useEffect,
  // troca de tela). Se ele abortar, abortamos com a razao DELE — sobrescrever
  // por "timeout" mentiria sobre a causa.
  const sinalDoChamador = init?.signal;
  if (sinalDoChamador) {
    if (sinalDoChamador.aborted) controle.abort(sinalDoChamador.reason);
    else sinalDoChamador.addEventListener('abort', () => controle.abort(sinalDoChamador.reason));
  }

  const relogio = setTimeout(
    () => controle.abort(
      new DOMException(`Sem resposta do servidor em ${TIMEOUT_MS / 1000}s.`, 'TimeoutError'),
    ),
    TIMEOUT_MS,
  );

  return fetch(input, { ...init, signal: controle.signal })
    .finally(() => clearTimeout(relogio));
};
