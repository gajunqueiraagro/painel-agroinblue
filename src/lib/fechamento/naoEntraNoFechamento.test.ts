/**
 * REBANHO-SEM-GADO-01 — a fazenda sem rebanho no mês (o banco devolve os 2 pilares 'nao_aplicavel') sai do fechamento; a que só não tem
 * valor a pedir (sem gado, MAS com o mapa de pastos) continua; o mês não iniciado de quem tem gado continua (é pendência de verdade).
 */
import { describe, it, expect } from 'vitest';
import { doFechamento, semRebanhoNoMes } from './naoEntraNoFechamento';

describe('quem entra no fechamento do rebanho', () => {
  it('sem rebanho no mês (os 2 pilares "nao_aplicavel") sai; o resto fica, na ordem', () => {
    const status = [
      { nome: 'Sta. Rita', p1: 'oficial' as const, p2: 'pendente' as const },
      { nome: 'São João (sem pasto, sem gado)', p1: 'nao_aplicavel' as const, p2: 'nao_aplicavel' as const },
      { nome: 'Sta. Luzia (pasto sem gado)', p1: 'oficial' as const, p2: 'nao_aplicavel' as const },
      { nome: 'Sta. Maria (mês não aberto)', p1: 'nao_iniciado' as const, p2: 'nao_iniciado' as const },
    ];
    expect(doFechamento(status).map((f) => f.nome)).toEqual(['Sta. Rita', 'Sta. Luzia (pasto sem gado)', 'Sta. Maria (mês não aberto)']);
    expect(semRebanhoNoMes(status[1])).toBe(true);
    expect(semRebanhoNoMes(status[2])).toBe(false);
    expect(semRebanhoNoMes({ p1: 'nao_aplicavel', p2: 'pendente' })).toBe(false);
  });
});
