/**
 * A MENSAGEM DE UM ERRO QUE PODE NÃO SER UM `Error` — e é quase sempre o caso com o Supabase.
 *
 * ⚠ NASCE DE DOIS BOTÕES MORTOS POR TRÊS DIAS. O parcelamento recusava com "Falha ao criar o
 * parcelamento" e nada mais; o erro real era `42809: op ANY/ALL (array) requires array on right
 * side`, que ninguém viu até alguém reproduzir a chamada no banco. Os dois `catch` tentavam
 * mostrar a mensagem crua — `e instanceof Error ? e.message : '…'` — e o teste sempre dava falso.
 *
 * ⚠ A RAZÃO ESTÁ NA BIBLIOTECA, e é contraintuitiva o bastante para ficar escrita aqui.
 * Em `@supabase/postgrest-js`, o `PostgrestError` DE FATO estende `Error` — mas ele só é
 * construído quando se pediu `.throwOnError()`:
 *
 *     if (error && _this2.shouldThrowOnError) throw new PostgrestError(error)
 *
 * No destructuring normal — `const { error } = await supabase.rpc(…)` —, que é o idioma deste
 * repo, o `error` é um OBJETO PLANO vindo de `JSON.parse(body)`. Dar `throw` nele e testar
 * `instanceof Error` devolve `false`, sempre. A intenção estava certa; o teste é que não podia
 * funcionar.
 *
 * ⚠ ELA LÊ OS DOIS FORMATOS de propósito: dentro de um mesmo `try` convivem o erro do PostgREST
 * (objeto plano) e exceções de verdade — um `TypeError` do JS, um `Error` de outra biblioteca.
 * Tratar só um dos dois trocaria um silêncio por outro.
 *
 * ⚠ MENSAGEM VAZIA CAI NO `fallback`: `toast.error('')` não mostra nada, e um toast em branco é
 * pior que um genérico — o operador não sabe se falhou ou se gravou.
 */
export function mensagemDoErro(e: unknown, fallback: string): string {
  if (typeof e === 'string' && e.trim()) return e;
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}
