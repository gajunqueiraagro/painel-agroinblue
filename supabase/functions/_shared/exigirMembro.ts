/**
 * SEG-EDGE-IA-01 (SEG-AUDIT-02 R4, Gabriel 23/11/2026) — QUEM PODE CHAMAR AS FUNÇÕES DE IA (`gerar-texto-fechamento`, `extract-caderno`).
 * O gateway do Supabase (verify_jwt) aceita QUALQUER JWT do projeto — inclusive a chave pública do site, que está no bundle do front:
 * qualquer um gastava o crédito da IA paga. Agora a função exige um USUÁRIO de verdade (o token resolve para um login) que seja
 * membro ATIVO de algum cliente ou admin do AGROinBLUE. Sem token / chave pública / token vencido = 401; login sem acesso = 403.
 * Decisão PURA com as leituras injetadas (o vitest a testa sem rede: `src/lib/acessos/exigirMembro.test.ts`); quem chama passa
 * `autorDoToken` (auth.getUser com a service role) e `ehMembroAtivo` (cliente_membros ativo ou admin_agroinblue).
 * ⚠ O token nunca vai para log nem para resposta.
 */

export const FRASE_SEM_LOGIN = "Entre no sistema para usar esta função.";
export const FRASE_SEM_ACESSO = "O seu acesso não permite usar esta função.";

export type QuemChama = { ok: true; usuario: string } | { ok: false; status: 401 | 403; erro: string };

/** O token do cabeçalho `Authorization: Bearer …` (sem o prefixo), ou null. */
export function tokenDoPedido(cabecalho: string | null | undefined): string | null {
  const t = (cabecalho ?? "").replace(/^Bearer\s+/i, "").trim();
  return t || null;
}

export async function exigirMembroAtivo(o: {
  token: string | null;
  autorDoToken: (token: string) => Promise<string | null>;
  ehMembroAtivo: (usuario: string) => Promise<boolean>;
}): Promise<QuemChama> {
  if (!o.token) return { ok: false, status: 401, erro: FRASE_SEM_LOGIN };
  let usuario: string | null = null;
  try { usuario = await o.autorDoToken(o.token); } catch { usuario = null; }
  if (!usuario) return { ok: false, status: 401, erro: FRASE_SEM_LOGIN };
  let membro = false;
  try { membro = await o.ehMembroAtivo(usuario); } catch { membro = false; }
  if (!membro) return { ok: false, status: 403, erro: FRASE_SEM_ACESSO };
  return { ok: true, usuario };
}
