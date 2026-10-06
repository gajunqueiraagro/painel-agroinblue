/**
 * ACESSOS-TELA-01 — as regras das edge functions de acesso (`criar-usuario`, `redefinir-senha`, `remover-membro`).
 *
 * ⚠ O REPOSITORIO NAO TEM ESTRUTURA DE TESTE DE EDGE FUNCTION (Deno): o que se testa aqui e' (1) a LOGICA PURA, extraida
 *   para `supabase/functions/_shared/regrasDeAcesso.ts` — quem pode chamar × quem pode ser alvo × como se acha o e-mail —,
 *   e (2) a FONTE das tres funcoes: que elas consultam essas regras, na ordem certa, e que a senha nao vai para log nem
 *   para resposta. O que NAO tem teste: a funcao rodando (JWT, service role, Auth) — provado depois do deploy, sem criar ninguem.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  acharLoginPorEmail, alvoPermitido, normalizarEmail, podeGerenciarAcessos, PERFIS_CRIAVEIS,
  FRASE_ALVO_ADMIN, FRASE_ALVO_E_O_PROPRIO, FRASE_SO_ADMIN,
} from '../../../supabase/functions/_shared/regrasDeAcesso';

const FUNCOES = ['criar-usuario', 'redefinir-senha', 'remover-membro'];
const fonte = (f: string) => readFileSync(resolve(process.cwd(), 'supabase/functions', f, 'index.ts'), 'utf8');
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('quem pode chamar', () => {
  const base = { fraseSemPermissao: 'sem permissão aqui' };
  it('a matriz inteira: admin sempre; gestor só com a constante ligada E sendo gestor do cliente', () => {
    const casos: Array<[boolean, boolean, boolean, boolean, string | null]> = [
      /* admin, gestorDoCliente, constante, ok, frase */
      [true, false, false, true, null],
      [true, true, true, true, null],
      [false, true, false, false, FRASE_SO_ADMIN],
      [false, false, false, false, FRASE_SO_ADMIN],
      [false, true, true, true, null],
      [false, false, true, false, 'sem permissão aqui'],
    ];
    for (const [chamadorAdmin, chamadorGestorDoCliente, gestorGerencia, ok, frase] of casos) {
      const v = podeGerenciarAcessos({ ...base, chamadorAdmin, chamadorGestorDoCliente, gestorGerencia });
      expect(v.ok).toBe(ok);
      if (v.ok === false) { expect(v.status).toBe(403); expect(v.erro).toBe(frase); }
    }
  });
  it('a frase do piloto é a combinada', () => {
    expect(FRASE_SO_ADMIN).toBe('Só o administrador do AGROinBLUE gerencia acessos por enquanto.');
  });
});

describe('quem pode ser alvo', () => {
  it('admin do AGROinBLUE nunca é alvo — nem de outro admin; ninguém é alvo de si mesmo; o resto passa', () => {
    expect(alvoPermitido({ alvoAdmin: true, alvoId: 'a', chamadorId: 'b' })).toEqual({ ok: false, status: 403, erro: FRASE_ALVO_ADMIN });
    expect(alvoPermitido({ alvoAdmin: false, alvoId: 'a', chamadorId: 'a' })).toEqual({ ok: false, status: 403, erro: FRASE_ALVO_E_O_PROPRIO });
    expect(alvoPermitido({ alvoAdmin: true, alvoId: 'a', chamadorId: 'a' }).ok).toBe(false);
    expect(alvoPermitido({ alvoAdmin: false, alvoId: 'a', chamadorId: 'b' })).toEqual({ ok: true });
  });
  it('admin do AGROinBLUE não é perfil criável', () => {
    expect([...PERFIS_CRIAVEIS]).toEqual(['gestor_cliente', 'financeiro', 'campo', 'leitura']);
    expect(PERFIS_CRIAVEIS).not.toContain('admin_agroinblue');
  });
});

describe('o e-mail', () => {
  it('compara sem espaços e em minúsculas; o que não é texto vira vazio', () => {
    expect(normalizarEmail('  Fulano@Exemplo.COM ')).toBe('fulano@exemplo.com');
    expect(normalizarEmail(null)).toBe('');
    expect(normalizarEmail(12)).toBe('');
  });
  const paginas = (total: number, porPagina: number, alvo?: { indice: number; email: string }) => {
    const chamadas: number[] = [];
    const listar = async (pagina: number, pp: number) => {
      chamadas.push(pagina);
      const inicio = (pagina - 1) * pp;
      return Array.from({ length: Math.max(0, Math.min(pp, total - inicio)) }, (_, i) => {
        const n = inicio + i;
        return { id: `u${n}`, email: alvo && alvo.indice === n ? alvo.email : `pessoa${n}@x.com` };
      });
    };
    return { listar, chamadas, porPagina };
  };
  it('acha o login que está FORA da primeira página (o defeito: só a primeira era lida)', async () => {
    const p = paginas(25, 10, { indice: 23, email: 'Alvo@X.com' });
    const u = await acharLoginPorEmail(' alvo@x.COM ', p.listar, 10);
    expect(u?.id).toBe('u23');
    expect(p.chamadas).toEqual([1, 2, 3]);
  });
  it('para na página em que acha, e não lê as seguintes', async () => {
    const p = paginas(100, 10, { indice: 3, email: 'alvo@x.com' });
    expect((await acharLoginPorEmail('alvo@x.com', p.listar, 10))?.id).toBe('u3');
    expect(p.chamadas).toEqual([1]);
  });
  it('não existe: percorre até a página curta e devolve null; total múltiplo da página lê uma a mais, vazia', async () => {
    const p = paginas(25, 10);
    expect(await acharLoginPorEmail('ninguem@x.com', p.listar, 10)).toBeNull();
    expect(p.chamadas).toEqual([1, 2, 3]);
    const q = paginas(20, 10);
    expect(await acharLoginPorEmail('ninguem@x.com', q.listar, 10)).toBeNull();
    expect(q.chamadas).toEqual([1, 2, 3]);
  });
  it('e-mail vazio não consulta nada; o teto de páginas impede laço', async () => {
    const p = paginas(1000, 10);
    expect(await acharLoginPorEmail('  ', p.listar, 10)).toBeNull();
    expect(p.chamadas).toEqual([]);
    expect(await acharLoginPorEmail('ninguem@x.com', p.listar, 10, 4)).toBeNull();
    expect(p.chamadas).toEqual([1, 2, 3, 4]);
  });
});

describe('a fonte das três edge functions', () => {
  it('a busca sabe achar: os três arquivos existem e têm corpo', () => {
    for (const f of FUNCOES) expect(fonte(f).length).toBeGreaterThan(1500);
  });
  it('as três têm a constante do piloto DESLIGADA e a entregam ao dono da regra', () => {
    for (const f of FUNCOES) {
      const s = fonte(f);
      expect(s.match(/const GESTOR_GERENCIA_ACESSOS = (true|false);/g)).toEqual(['const GESTOR_GERENCIA_ACESSOS = false;']);
      expect(s).toContain('podeGerenciarAcessos({');
      expect(s).toContain('gestorGerencia: GESTOR_GERENCIA_ACESSOS');
      expect(s).toContain('from "../_shared/regrasDeAcesso.ts"');
    }
  });
  it('redefinir e remover conferem o ALVO antes de escrever; criar não', () => {
    const r = fonte('redefinir-senha'); const m = fonte('remover-membro');
    expect(r.indexOf('alvoPermitido(')).toBeGreaterThan(0);
    expect(r.indexOf('alvoPermitido(')).toBeLessThan(r.indexOf('updateUserById'));
    expect(m.indexOf('alvoPermitido(')).toBeGreaterThan(0);
    expect(m.indexOf('alvoPermitido(')).toBeLessThan(m.indexOf('.delete()'));
    expect(fonte('criar-usuario')).not.toContain('alvoPermitido(');
  });
  it('a permissão vem antes de qualquer escrita, nas três', () => {
    const c = fonte('criar-usuario');
    expect(c.indexOf('podeGerenciarAcessos({')).toBeLessThan(c.indexOf('createUser('));
    expect(c.indexOf('podeGerenciarAcessos({')).toBeLessThan(c.indexOf('.upsert('));
    const r = fonte('redefinir-senha');
    expect(r.indexOf('podeGerenciarAcessos({')).toBeLessThan(r.indexOf('updateUserById'));
    const m = fonte('remover-membro');
    expect(m.indexOf('podeGerenciarAcessos({')).toBeLessThan(m.indexOf('.delete()'));
  });
  it('criar-usuario procura o e-mail em todas as páginas e avisa quando o login já existia', () => {
    const c = semComentario(fonte('criar-usuario'));
    expect(c).toContain('acharLoginPorEmail(email');
    expect(c).toContain('listUsers({ page: pagina, perPage: porPagina })');
    expect(c).not.toContain('listUsers()');
    expect(c).toContain('login_existente: loginExistente');
    expect(c).toContain('etapa: "vinculo_cliente"');
  });
  it('a senha não vai para log nem para resposta: nenhum console e nenhum JSON de resposta a cita como valor', () => {
    for (const f of FUNCOES) {
      const s = semComentario(fonte(f));
      const consoles = s.match(/console\.\w+\([^)]*\)/g) ?? [];
      expect(consoles.length).toBeGreaterThan(0);
      for (const c of consoles) {
        /* o rótulo entre aspas ("redefinir-senha error:") não conta: o que não pode é uma VARIÁVEL com a senha */
        expect(c.replace(/"(?:\\.|[^"\\])*"/g, '""')).not.toMatch(/senha|password|corpo|req\b/i);
        expect(c).toContain('err?.message');
      }
      /* nas respostas, "senha" só aparece dentro de frases (entre aspas), nunca como variável interpolada */
      for (const r of s.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) ?? []) {
        expect(r.replace(/"(?:\\.|[^"\\])*"/g, '""')).not.toMatch(/senha|password/i);
      }
    }
  });
});
