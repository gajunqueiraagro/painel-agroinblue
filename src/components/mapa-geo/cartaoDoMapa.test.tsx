/**
 * MAPA-CARTOES-LARGURA-01 — o cartão de cima do mapa: largura reservada (a do pior caso), sempre 3 linhas (rótulo, valor e a secundária
 * reservada mesmo vazia), cada linha medível pelo gate (`data-linha-cartao`). O "não corta" de verdade se prova no gate (layout real).
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CartaoDoMapa, LARGURA_DO_CARTAO } from './CartaoDoMapa';

describe('CartaoDoMapa', () => {
  it('a lotação: UA/ha na linha principal e o kg/ha na 2ª; largura reservada', () => {
    const { container } = render(<CartaoDoMapa rotulo="Lotação" valor="2,33" unidade="UA/ha" secundario="1.047 kg/ha" largura={LARGURA_DO_CARTAO.lotacao} testid="c" />);
    const linhas = container.querySelectorAll('[data-linha-cartao]');
    expect([...linhas].map(l => l.textContent)).toEqual(['Lotação', '2,33UA/ha', '1.047 kg/ha']);
    expect(container.querySelector('[data-cartao-mapa]')?.getAttribute('style')).toContain(`width: ${LARGURA_DO_CARTAO.lotacao}px`);
  });
  it('sem secundária, a 2ª linha fica reservada (vazia) — todos os cartões com a mesma altura', () => {
    const { container } = render(<CartaoDoMapa rotulo="Área pastos" valor="383,8 ha" largura={LARGURA_DO_CARTAO.area} />);
    const linhas = container.querySelectorAll('[data-linha-cartao]');
    expect(linhas).toHaveLength(3);
    expect(linhas[2].textContent).toBe('');
    expect(linhas[2].className).toContain('h-[10px]');
  });
});
