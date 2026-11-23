/**
 * SEG-EDGE-IA-01 (SEG-AUDIT-02 R4) — quem pode chamar as funções de IA: usuário de verdade, membro ativo ou admin. A decisão é pura
 * (`supabase/functions/_shared/exigirMembro.ts`); aqui também se prende que as DUAS funções de IA a chamam ANTES de ler o corpo e de
 * tocar na chave da IA.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FRASE_SEM_ACESSO, FRASE_SEM_LOGIN, exigirMembroAtivo, tokenDoPedido } from '../../../supabase/functions/_shared/exigirMembro';

const membro = (ok: boolean) => async () => ok;
const autor = (u: string | null) => async () => u;

describe('exigirMembroAtivo', () => {
  it('sem token, token sem usuário (a chave pública do site) ou leitura que falha = 401', async () => {
    expect(await exigirMembroAtivo({ token: null, autorDoToken: autor('u'), ehMembroAtivo: membro(true) })).toEqual({ ok: false, status: 401, erro: FRASE_SEM_LOGIN });
    expect(await exigirMembroAtivo({ token: 'chave-publica', autorDoToken: autor(null), ehMembroAtivo: membro(true) })).toEqual({ ok: false, status: 401, erro: FRASE_SEM_LOGIN });
    const falha = async () => { throw new Error('rede'); };
    expect(await exigirMembroAtivo({ token: 't', autorDoToken: falha, ehMembroAtivo: membro(true) })).toEqual({ ok: false, status: 401, erro: FRASE_SEM_LOGIN });
  });
  it('login sem acesso ativo (ou leitura do acesso que falha) = 403; membro ativo passa com o usuário', async () => {
    expect(await exigirMembroAtivo({ token: 't', autorDoToken: autor('u1'), ehMembroAtivo: membro(false) })).toEqual({ ok: false, status: 403, erro: FRASE_SEM_ACESSO });
    const falha = async () => { throw new Error('rede'); };
    expect(await exigirMembroAtivo({ token: 't', autorDoToken: autor('u1'), ehMembroAtivo: falha })).toEqual({ ok: false, status: 403, erro: FRASE_SEM_ACESSO });
    expect(await exigirMembroAtivo({ token: 't', autorDoToken: autor('u1'), ehMembroAtivo: membro(true) })).toEqual({ ok: true, usuario: 'u1' });
  });
  it('tokenDoPedido tira o "Bearer" e devolve null para vazio', () => {
    expect(tokenDoPedido('Bearer abc')).toBe('abc');
    expect(tokenDoPedido('bearer   abc ')).toBe('abc');
    expect(tokenDoPedido('Bearer ')).toBeNull();
    expect(tokenDoPedido(null)).toBeNull();
  });

  it('as duas funções de IA chamam a guarda logo depois do OPTIONS, antes de ler o corpo e a chave da IA', () => {
    for (const [f, chave] of [['supabase/functions/gerar-texto-fechamento/index.ts', 'LOVABLE_API_KEY'], ['supabase/functions/extract-caderno/index.ts', 'ANTHROPIC_API_KEY']]) {
      const s = readFileSync(f, 'utf8');
      expect(s).toContain('import { exigirMembroAtivo, tokenDoPedido } from "../_shared/exigirMembro.ts";');
      const guarda = s.indexOf('const quem = await exigirMembroAtivo(');
      const recusa = s.indexOf('if (!quem.ok) {');
      expect(guarda).toBeGreaterThan(0);
      expect(recusa).toBeGreaterThan(guarda);
      expect(guarda).toBeLessThan(s.indexOf('await req.json()'));
      expect(guarda).toBeLessThan(s.indexOf(`Deno.env.get("${chave}")`) === -1 ? s.indexOf(`Deno.env.get('${chave}')`) : s.indexOf(`Deno.env.get("${chave}")`));
      expect(s).toMatch(/admin\.from\("cliente_membros"\)\.select\("user_id"\)\.eq\("user_id", u\)\.eq\("ativo", true\)/);
      expect(s).toMatch(/status: quem\.status/);
    }
  });
});
