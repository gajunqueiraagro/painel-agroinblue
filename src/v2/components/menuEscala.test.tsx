import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { V2Sidebar, LARGURA_DA_LATERAL } from '@/v2/components/V2Sidebar';
import { V2ContextDrawer } from '@/v2/components/V2ContextDrawer';

/* UI-VARREDURA-01 L5 v2 (Gabriel 03/11/2026 12:32: a lateral DIMINUI, nunca mais que 152): lateral 144px, item 12px · 28px · ícone 16;
   seletores 12px · 30px; submenu 200px, sólido, item 12px · 28px, títulos de seção 10px em sentence case; ativo claro, hover discreto. */
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ isAdmin: true, clienteAtual: { id: 'c1', nome: 'Cliente', perfil: 'admin_agroinblue' } }),
}));
vi.mock('@/components/AlterarSenhaDialog', () => ({ AlterarSenhaDialog: () => null }));
vi.mock('@/assets/logo.png', () => ({ default: 'logo.png' }));

const classes = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/);

describe('a lateral menor (L5 v2)', () => {
  it('144px (≤ 152); cada item com 12px, 28px de altura e ícone de 16px', () => {
    expect(LARGURA_DA_LATERAL).toBe(144);
    expect(LARGURA_DA_LATERAL).toBeLessThanOrEqual(152);
    render(<V2Sidebar activeSection="home" onNavigate={vi.fn()} onDrawerToggle={vi.fn()} />);
    const botoes = within(screen.getByRole('navigation')).getAllByRole('button');
    expect(botoes.length).toBeGreaterThan(3);
    for (const b of botoes) {
      expect(classes(b)).toEqual(expect.arrayContaining(['h-7', 'text-xs', 'gap-2']));
      expect(classes(b.querySelector('svg'))).toEqual(expect.arrayContaining(['h-4', 'w-4']));
    }
  });
  it('o ativo tem fundo, barra e negrito; o inativo só o hover discreto', () => {
    render(<V2Sidebar activeSection="home" onNavigate={vi.fn()} onDrawerToggle={vi.fn()} />);
    const ativo = screen.getByRole('button', { name: 'Visão geral' });
    expect(classes(ativo)).toEqual(expect.arrayContaining(['bg-primary-foreground/[0.16]', 'font-semibold', 'before:w-[3px]']));
    const inativo = screen.getByRole('button', { name: 'Configurações' });
    expect(classes(inativo)).toEqual(expect.arrayContaining(['hover:bg-primary-foreground/[0.07]']));
    expect(classes(inativo)).not.toContain('font-semibold');
  });
  it('os seletores de cliente e fazenda a 11px e 30px (a 144px, 12px cortava um nome médio — gate de 03/11)', () => {
    const { container } = render(<V2Sidebar activeSection="home" onNavigate={vi.fn()} onDrawerToggle={vi.fn()}
      clienteSelector={<button>Cliente</button>} fazendaSelector={<button>Fazenda</button>} />);
    const caixas = container.querySelectorAll('[class*="[&_button]:h-[30px]"]');
    expect(caixas).toHaveLength(2);
    for (const c of caixas) expect(classes(c)).toContain('[&_button]:text-[11px]');
  });
});

describe('o submenu menor (L5 v2)', () => {
  it('200px e fundo sólido; título do grupo e das seções sem caixa alta nem espaçamento; item de 12px e 28px', () => {
    const { container } = render(<V2ContextDrawer grupoAtivo="financeiro" activeSection="conciliacao" onSelect={vi.fn()} onClose={vi.fn()} />);
    const painel = container.querySelector('[class*="w-[200px]"]');
    expect(painel).not.toBeNull();
    expect(classes(painel)).toContain('bg-primary');
    expect(classes(painel).some((c) => c.startsWith('backdrop-blur') || c === 'bg-primary/90')).toBe(false);
    const titulos = [...container.querySelectorAll('p')];
    expect(titulos.map((t) => t.textContent)).toEqual(['Financeiro', 'Operação', 'Gestão']);
    for (const t of titulos) {
      expect(classes(t)).not.toContain('uppercase');
      expect(classes(t).some((c) => c.startsWith('tracking-'))).toBe(false);
    }
    expect(classes(titulos[1])).toEqual(expect.arrayContaining(['text-[10px]', 'text-white/55']));
    for (const b of container.querySelectorAll('nav button')) expect(classes(b)).toEqual(expect.arrayContaining(['h-7', 'text-xs']));
    const ativo = screen.getByRole('button', { name: 'Conciliação bancária' });
    expect(classes(ativo)).toEqual(expect.arrayContaining(['bg-white/[0.16]', 'font-semibold', 'before:w-[3px]']));
  });
});

describe('o menu em sentence case (L5, M2)', () => {
  it('todo rótulo (grupo, seção, item): só a 1ª palavra com maiúscula — siglas inteiras (META, ADM, DRE, GMD, PC-100) valem', async () => {
    const { NAV_GRUPOS } = await import('@/v2/lib/navGrupos');
    const rotulos = NAV_GRUPOS.flatMap((g) => [g.label, ...g.drawer.flatMap((s) => [s.titulo, ...s.itens.map((i) => i.label)])]).filter(Boolean);
    const foraDaRegra = rotulos.filter((r) => r.split(/\s+/).slice(1).some((p) => /^\p{Lu}/u.test(p) && p !== p.toUpperCase()));
    expect(rotulos.length).toBeGreaterThan(40);
    expect(foraDaRegra).toEqual([]);
  });
});
