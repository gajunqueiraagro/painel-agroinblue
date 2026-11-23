/**
 * SEG-SENHA-01 (SEG-AUDIT-02 R2, Gabriel 23/11/2026) — a regra única da senha (`supabase/functions/_shared/regraDaSenha.ts`), a mesma do
 * painel do Auth do proto: mínimo 8, com letras E dígitos. Prende a regra e que as 4 portas que gravam senha a usam (a tela do convite/
 * recuperação/trocar senha, a senha provisória do Acessos, a criar-usuario e a redefinir-senha) — nenhuma com regra própria.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FRASE_SENHA_FRACA, SENHA_MINIMA, problemaDaSenha } from '../../../supabase/functions/_shared/regraDaSenha';

describe('a regra única da senha', () => {
  it('8+, com uma letra de a–z/A–Z e um dígito; o resto recusa com a mesma frase', () => {
    expect(SENHA_MINIMA).toBe(8);
    /* espaço e acento contam como caractere (o tamanho), mas acento não conta como LETRA — como no Supabase */
    for (const ok of ['abcd1234', 'ABCD1234', 'a1234567', '1234567a', 'Segredo#9431', 'çaixa12a', '      1a']) expect(problemaDaSenha(ok)).toBeNull();
    for (const ruim of ['abc1234', '12345678', 'abcdefgh', '########', 'ãéíõúçã1', '']) expect(problemaDaSenha(ruim)).toBe(FRASE_SENHA_FRACA);
    expect(problemaDaSenha(undefined)).toBe(FRASE_SENHA_FRACA);
    expect(problemaDaSenha(12345678)).toBe(FRASE_SENHA_FRACA);
  });

  it('as 4 portas usam a regra única e nenhuma tem número próprio', () => {
    for (const f of ['supabase/functions/criar-usuario/index.ts', 'supabase/functions/redefinir-senha/index.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s).toContain('import { problemaDaSenha } from "../_shared/regraDaSenha.ts";');
      expect(s).toMatch(/const recusa = problemaDaSenha\((senha|nova_senha)\);\s+if \(recusa\) \{\s+return new Response\(JSON\.stringify\(\{ error: recusa/);
      expect(s).not.toMatch(/\.length\s*<\s*\d/);
    }
    const convite = readFileSync('src/lib/auth/senhaEConvite.ts', 'utf8');
    expect(convite).toContain("from '../../../supabase/functions/_shared/regraDaSenha'");
    expect(convite).toMatch(/const fraca = problemaDaSenha\(v\.nova\);/);
    const acessos = readFileSync('src/lib/acessos/acessosDaTela.ts', 'utf8');
    expect(acessos).toMatch(/const fraca = problemaDaSenha\(f\.senha\);/);
    expect(acessos).toContain('export const SENHA_MINIMA = SENHA_MINIMA_DA_REGRA;');
    const tela = readFileSync('src/pages/AcessosTab.tsx', 'utf8');
    expect(tela).toMatch(/const fraca = problemaDaSenha\(novaSenha\);/);
    for (const s of [convite, acessos, tela]) expect(s).not.toMatch(/\.length\s*<\s*SENHA_MINIMA/);
  });
});
