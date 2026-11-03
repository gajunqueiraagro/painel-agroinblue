/**
 * MAPA-TIPO-ROTULO-GRANT-01 (Gabriel 02/11 22h): o 42501 do banco NÃO é só "sem acesso". O mesmo código vem de "permission denied for function X"
 * (um defeito do banco — a 117120 fechou uma função que um CHECK chama) e de "row-level security"; traduzir tudo para "Sem acesso a esta
 * fazenda." escondeu a causa do admin. Regra: só a recusa de acesso escrita pelos gravadores ("sem acesso a esta fazenda / a este registro")
 * vira a frase da casa; o resto mostra a mensagem real, com o objeto negado.
 */
const TIPO_DO_OBJETO: Record<string, string> = { function: 'função', table: 'tabela', relation: 'tabela', sequence: 'sequência', schema: 'esquema', view: 'visão' };

export function fraseDo42501(mensagem: string | null | undefined): string {
  const m = (mensagem ?? '').trim();
  if (/^sem acesso a est/i.test(m)) return 'Sem acesso a esta fazenda.';
  const negado = /permission denied for (\w+) ([\w."]+)/i.exec(m);
  if (negado) return `Permissão negada em ${TIPO_DO_OBJETO[negado[1].toLowerCase()] ?? negado[1]} ${negado[2]} — avise o suporte.`;
  if (/row-level security/i.test(m)) return `Permissão negada pela regra de acesso da tabela (${m}) — avise o suporte.`;
  return m ? `Permissão negada: ${m}` : 'Permissão negada (sem detalhe do banco) — avise o suporte.';
}
