/**
 * VR-PRECO-EDITAR-01 ampliado (Gabriel 09/11 07:06) — a trava master é do MÊS inteiro: um Desbloquear libera todos os pastos + o Valor do
 * Rebanho, e o botão está nas 3 telas do mês (na linha da faixa do fechamento), inclusive no mês aberto. Nunca pasto por pasto.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const trava = vi.hoisted(() => ({ travado: true, desbloqueado: false, master: false, lockMes: vi.fn(), unlockMes: vi.fn() }));
vi.mock('@/hooks/useMasterLock', () => ({
  useMasterLock: () => ({ isMaster: trava.master, isMesLocked: () => trava.travado, isUnlocked: () => trava.desbloqueado, unlockMes: trava.unlockMes, lockMes: trava.lockMes }),
}));
vi.mock('@/components/MasterUnlockDialog', () => ({ MasterUnlockDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="pedir-senha" /> : null) }));

import { MasterLockBanner } from './MasterLockBanner';

beforeEach(() => { trava.travado = true; trava.desbloqueado = false; trava.master = false; vi.clearAllMocks(); });

describe('a trava do mês na faixa', () => {
  it('travado: o cadeado + Desbloquear (o texto no title) (abre a senha); 22px', () => {
    render(<MasterLockBanner anoMes="2026-10" naFaixa />);
    const t = screen.getByTestId('trava-do-mes');
    expect(t.className).toContain('h-[22px]');
    expect(t.textContent).toBe('Desbloquear');
    expect(t.getAttribute('title')).toContain('somente leitura');
    fireEvent.click(screen.getByTestId('trava-do-mes-botao'));
    expect(screen.getByTestId('pedir-senha')).toBeTruthy();
  });
  it('desbloqueado: o cadeado aberto + Re-bloquear, os MESMOS 22px (nada desloca)', () => {
    trava.desbloqueado = true;
    render(<MasterLockBanner anoMes="2026-10" naFaixa />);
    const t = screen.getByTestId('trava-do-mes');
    expect(t.className).toContain('h-[22px]');
    expect(t.textContent).toBe('Re-bloquear');
    fireEvent.click(screen.getByTestId('trava-do-mes-botao'));
    expect(trava.lockMes).toHaveBeenCalledWith('2026-10');
  });
  it('mês livre ou o master: nada', () => {
    trava.travado = false;
    const { container, unmount } = render(<MasterLockBanner anoMes="2026-10" naFaixa />);
    expect(container.innerHTML).toBe('');
    unmount();
    trava.travado = true; trava.master = true;
    expect(render(<MasterLockBanner anoMes="2026-10" naFaixa />).container.innerHTML).toBe('');
  });
  it('as 3 telas do mês têm a trava na linha da faixa (inclusive no mês aberto: fora do ramo live/snapshot do VR)', () => {
    for (const arq of ['src/pages/FechamentoTab.tsx', 'src/pages/ValorRebanhoTab.tsx', 'src/pages/MapaPastosTab.tsx']) {
      const f = readFileSync(arq, 'utf8');
      const i = f.indexOf('<FaixaDoFechamento ');
      expect(f.slice(i, i + 260)).toContain('<MasterLockBanner anoMes={anoMes} naFaixa />');
    }
    /* o VR não mostra a trava duas vezes: o lugar antigo (o ramo fora do live) ficou vazio */
    expect(readFileSync('src/pages/ValorRebanhoTab.tsx', 'utf8')).not.toContain('<MasterLockBanner anoMes={anoMes} compacto />');
  });
  it('o desbloqueio é do MÊS da fazenda (uma chave fazenda|mês para todos os pastos e o VR), nunca do pasto', () => {
    const h = readFileSync('src/hooks/useMasterLock.ts', 'utf8');
    expect(h).toContain('setTimeout(() => unlockKey(`${fazendaId}|${mes}`), 0);');
  });
});
