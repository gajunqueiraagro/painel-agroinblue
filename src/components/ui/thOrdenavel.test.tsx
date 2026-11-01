/**
 * MAPA-GLOBAL-01 fix1 (1, Gabriel 31/10) — o cabeçalho que ordena nunca troca o FUNDO no hover.
 * O `hover:bg-primary-foreground/10` que as tabelas passavam substituía o navy opaco por branco a 10% e o rótulo sumia
 * ("Pedem atenção" do Geo Pastos Global; antes, o Patrimônio e a colheita). O hover agora é do componente (um filtro).
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ThOrdenavel, semHoverDeFundo } from './th-ordenavel';
import type { DirecaoOrdem } from '@/hooks/useOrdenacaoTabela';

const ordem: { coluna: string; direcao: DirecaoOrdem } = { coluna: 'a', direcao: 'asc' };

function th(className: string) {
  const { container } = render(
    <table><thead><tr>
      <ThOrdenavel coluna="a" rotulo="Área ha" ordem={ordem} onOrdenar={() => undefined} className={className} />
    </tr></thead></table>,
  );
  const el = container.querySelector('th');
  if (!el) throw new Error('sem th');
  return el;
}

describe('ThOrdenavel — o hover do cabeçalho (fix1)', () => {
  it('descarta todo hover de fundo que a tabela passar, com ou sem !', () => {
    expect(semHoverDeFundo('sticky bg-primary hover:bg-primary-foreground/10 px-1')).toBe('sticky bg-primary px-1');
    expect(semHoverDeFundo('bg-card hover:!bg-white/20')).toBe('bg-card');
    expect(semHoverDeFundo(undefined)).toBe('');
  });

  it('o fundo da tabela fica; o hover é o filtro do componente', () => {
    const el = th('sticky top-0 bg-primary hover:bg-primary-foreground/10');
    expect(el.className).toContain('bg-primary');
    expect(el.className).not.toMatch(/hover:!?bg-/);
    expect(el.className).toContain('hover:brightness-110');
  });

  it('quem já passava o filtro (Patrimônio, colheita) continua com uma classe só', () => {
    const el = th('bg-primary transition-[filter] hover:brightness-110');
    expect(el.className.match(/hover:brightness-110/g)).toHaveLength(1);
  });
});
