/**
 * SEG-SENHA-01 (SEG-AUDIT-02 R2, Gabriel 23/11/2026) — A REGRA ÚNICA DA SENHA, a MESMA do painel do Auth do proto: mínimo 8 caracteres,
 * com letras E dígitos ("Letters and digits": ao menos uma de a–z/A–Z e uma de 0–9; letra acentuada não conta como letra, como no
 * Supabase). Função PURA, sem Deno e sem rede: a tela (`src/lib/auth/senhaEConvite.ts`, `src/lib/acessos/acessosDaTela.ts`) e as edge
 * functions `criar-usuario` e `redefinir-senha` leem daqui; o vitest a testa do lado do front (`src/lib/auth/regraDaSenha.test.ts`).
 * Antes: a tela pedia 8 (sem exigir letra e número) e as duas funções do admin aceitavam 6.
 */

export const SENHA_MINIMA = 8;

export const FRASE_SENHA_FRACA = `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres, com letras e números.`;

/** O problema da senha, ou null se ela passa. Não-texto conta como senha fraca. */
export function problemaDaSenha(senha: unknown): string | null {
  if (typeof senha !== "string") return FRASE_SENHA_FRACA;
  if (senha.length < SENHA_MINIMA || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) return FRASE_SENHA_FRACA;
  return null;
}
