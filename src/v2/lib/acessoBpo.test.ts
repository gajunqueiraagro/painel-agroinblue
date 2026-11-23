/** BPO-APROVACAO-01 P1 — "Aprovar pagamentos": o gestor/financeiro só onde o BPO está LIGADO (menu, drawer E rota); o admin sempre;
 * campo e leitura nunca. Decidir é do aprovador marcado — quem recusa os outros é o banco. */
import { describe, expect, it } from 'vitest';
import { gruposVisiveis, nivelDaTela, secoesVisiveis } from '@/v2/lib/acessoTelas';

const noMenu = (perfil: string, isAdmin: boolean, bpoAtivo: boolean) =>
  gruposVisiveis(perfil, isAdmin, { bpoAtivo }).some((g) => secoesVisiveis(perfil, isAdmin, g, { bpoAtivo }).some((s) => s.itens.some((i) => i.id === 'aprovar-pagamentos')));
const naRota = (perfil: string, isAdmin: boolean, bpoAtivo: boolean) => nivelDaTela(perfil, isAdmin, 'aprovar-pagamentos', { bpoAtivo });

describe('Aprovar pagamentos — menu e rota', () => {
  it('gestor e financeiro: só com o BPO ligado, e então "ler"; sem o BPO, nem menu nem rota', () => {
    for (const p of ['gestor_cliente', 'financeiro']) {
      expect(noMenu(p, false, false)).toBe(false);
      expect(naRota(p, false, false)).toBe('nao');
      expect(noMenu(p, false, true)).toBe(true);
      expect(naRota(p, false, true)).toBe('ver');
    }
  });
  it('campo e leitura nunca; o admin sempre (é ele quem liga)', () => {
    for (const p of ['campo', 'leitura']) expect(noMenu(p, false, true)).toBe(false);
    expect(noMenu('', true, false)).toBe(true);
    expect(naRota('', true, false)).toBe('editar');
  });
});
