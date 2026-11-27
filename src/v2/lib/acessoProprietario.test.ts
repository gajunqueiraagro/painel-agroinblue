/**
 * PERFIL-PROPRIETARIO (118780/118790, Gabriel 25/11) — o Proprietário tem TUDO o que o Gestor tem em toda tela do menu: marcar o Junior como
 * Proprietário não pode tirar tela nenhuma dele. A diferença (conectar o Open Finance) mora no dono do gesto, nunca na matriz.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { MATRIZ_ACESSO, NIVEL_POR_TELA, nivelDaTela } from './acessoTelas';
import { NAV_GRUPOS } from './navGrupos';

describe('o Proprietário = o Gestor em toda célula', () => {
  it('a matriz por grupo e as exceções por tela: a mesma célula do gestor', () => {
    for (const linha of Object.values(MATRIZ_ACESSO)) expect(linha.proprietario).toBe(linha.gestor_cliente);
    const excecoes = Object.values(NIVEL_POR_TELA);
    expect(excecoes.length).toBeGreaterThan(0);
    for (const linha of excecoes) expect(linha?.proprietario).toBe(linha?.gestor_cliente);
  });
  it('toda tela do menu: o nível do proprietário é o do gestor (e alguma tela ele edita)', () => {
    let n = 0; let edita = 0;
    for (const g of NAV_GRUPOS) for (const s of g.drawer) for (const item of s.itens) {
      const p = nivelDaTela('proprietario', false, item.id); n += 1; if (p === 'editar') edita += 1;
      expect(p).toBe(nivelDaTela('gestor_cliente', false, item.id));
    }
    expect(n).toBeGreaterThan(10);
    expect(edita).toBeGreaterThan(0);
  });
});
