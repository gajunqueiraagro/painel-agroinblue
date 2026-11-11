import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { atalhosDoPeriodo, type SafraDoCadastro } from '@/lib/periodo/intervaloDeDatas';

/* UI-PERIODO-01b (Gabriel 04/11 18:03) — o calendário compacto (modelo AgriWebb) e o "Esta safra · Última safra" onde a tela tem safra. */
const S = (id: string, atividade: SafraDoCadastro['atividade'], a: number, mesIni = '07'): SafraDoCadastro => ({
  id, codigo: `${String(a).slice(2)}/${String(a + 1).slice(2)}-${atividade === 'pecuaria' ? 'Pec' : 'Lav'}`, atividade,
  de: `${a}-${mesIni}-01`, ate: mesIni === '07' ? `${a + 1}-06-30` : `${a + 1}-${String(Number(mesIni) - 1).padStart(2, '0')}-28`,
});
const IGUAIS = [S('p27', 'pecuaria', 2026), S('p26', 'pecuaria', 2025), S('l27', 'agricultura', 2026), S('l26', 'agricultura', 2025)];
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/hooks/useSafrasDoCliente', () => ({ useSafrasDoCliente: () => ({ safras: IGUAIS, carregando: false }) }));
const { SeletorDePeriodo } = await import('./seletor-de-periodo');
const HOJE = '2026-11-04';
const safra = (l: ReturnType<typeof atalhosDoPeriodo>) => l.filter((a) => a.id.includes('safra')).map((a) => `${a.rotulo} = ${a.intervalo.nome}`);

describe('os atalhos de safra com as duas atividades', () => {
  it('as mesmas datas nas duas (jul–jun): UM "Esta safra" e UM "Última safra", sem "· Pecuária"/"· Lavoura"', () => {
    expect(safra(atalhosDoPeriodo({ hoje: HOJE, modo: 'datas', safras: IGUAIS, atividades: ['pecuaria', 'agricultura'] }))).toEqual([
      'Esta safra = Safra 26/27 · jul/26–jun/27', 'Última safra = Safra 25/26 · jul/25–jun/26']);
  });
  it('datas diferentes: um por atividade, com o nome da atividade', () => {
    const lav = [S('l27', 'agricultura', 2026, '09'), S('l26', 'agricultura', 2025, '09')];
    expect(safra(atalhosDoPeriodo({ hoje: HOJE, modo: 'datas', safras: [...IGUAIS.slice(0, 2), ...lav], atividades: ['pecuaria', 'agricultura'] }))).toEqual([
      'Esta safra · Pecuária = Safra 26/27 · jul/26–jun/27 · Pecuária', 'Última safra · Pecuária = Safra 25/26 · jul/25–jun/26 · Pecuária',
      'Esta safra · Lavoura = Safra 26/27 · set/26–ago/27 · Lavoura', 'Última safra · Lavoura = Safra 25/26 · set/25–ago/26 · Lavoura']);
  });
  it('a safra anterior diferente também separa (a de hoje igual não basta)', () => {
    const lav = [S('l27', 'agricultura', 2026), S('l26', 'agricultura', 2025, '09')];
    expect(safra(atalhosDoPeriodo({ hoje: HOJE, modo: 'datas', safras: [...IGUAIS.slice(0, 2), ...lav], atividades: ['pecuaria', 'agricultura'] }))).toHaveLength(4);
  });
  it('duas atividades e só uma com safra: o atalho diz de qual é', () => {
    expect(safra(atalhosDoPeriodo({ hoje: HOJE, modo: 'datas', safras: IGUAIS.slice(0, 2), atividades: ['pecuaria', 'agricultura'] }))[0])
      .toBe('Esta safra · Pecuária = Safra 26/27 · jul/26–jun/27 · Pecuária');
  });
});

describe('o popup compacto', () => {
  it('2 calendários de casas FIXAS 32 × 28 px, dia 13 px, mês 14 px, chips 12 px, rodapé de 30 px; ~481 px de largura', () => {
    render(<SeletorDePeriodo hoje={HOJE} valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={vi.fn()} atividades={['pecuaria', 'agricultura']} />);
    fireEvent.click(screen.getByTestId('seletor-de-periodo'));
    const pop = screen.getByTestId('seletor-de-periodo-popup');
    expect(pop.className).toContain('w-[481px]');
    const dia = pop.querySelector('[data-dia="2026-10-15"]');
    expect(dia?.className).toContain('h-[28px] w-[32px]');
    expect(dia?.className).toContain('text-[13px]');
    expect(dia?.parentElement?.className).toContain('grid-cols-[repeat(7,32px)]');
    expect(screen.getByTestId('seletor-de-periodo-cal-inicio').querySelector('b')?.className).toContain('text-[14px]');
    expect(pop.querySelector('[data-atalho]')?.className).toContain('text-[12px]');
    expect(screen.getByTestId('seletor-de-periodo-aplicar').parentElement?.className).toContain('h-[30px]');
    expect([...pop.querySelectorAll('[data-atalho]')].map((b) => b.textContent)).toContain('Esta safra');
  });
  it('DRE-LAYOUT-04 — `compacto` (o DRE): 360 px, dias 24 × 20 a 10 px, atalhos numa linha a 9,5 px com os rótulos curtos e o nome no title', () => {
    render(<SeletorDePeriodo hoje={HOJE} valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={vi.fn()} atividades={['pecuaria']} porMes compacto
      atalhosOcultos={['este-mes', 'mes-passado']} />);
    fireEvent.click(screen.getByTestId('seletor-de-periodo'));
    const pop = screen.getByTestId('seletor-de-periodo-popup');
    expect(pop.className).toContain('w-[360px]');
    const dia = pop.querySelector('[data-dia="2026-10-15"]');
    expect(dia?.className).toContain('h-[20px] w-[24px]');
    expect(dia?.className).toContain('text-[10px]');
    expect(dia?.parentElement?.className).toContain('grid-cols-[repeat(7,24px)]');
    const chips = [...pop.querySelectorAll('[data-atalho]')];
    expect(chips[0].parentElement?.className).toContain('flex-nowrap');
    expect(chips.map((b) => b.textContent)).toEqual(['Este ano', 'Último ano', 'Esta safra', 'Última safra', '12 meses', 'Ano…']);
    expect(pop.querySelector('[data-atalho="ultimos-12"]')?.getAttribute('title')).toBe('Últimos 12 meses');
    expect(chips[0].className).toContain('text-[9.5px]');
    expect(screen.getByTestId('seletor-de-periodo-aplicar').parentElement?.className).toContain('h-[26px]');
  });
  it('a DRE pecuária usa o compacto; o Financeiro não', () => {
    const ler = (f: string) => readFileSync(resolve(__dirname, '../..', f), 'utf8');
    expect(ler('pages/AgriDreLavouraTab.tsx')).toContain('<SeletorDePeriodo testid="dre-pec-periodo" porMes compacto');
    for (const f of ['components/financeiro-v2/PainelPeriodoTab.tsx', 'components/financeiro-v2/ContasPagarReceberTab.tsx']) {
      const t = ler(f);
      const usa = t.slice(t.indexOf('<SeletorDePeriodo testid="'), t.indexOf('/>', t.indexOf('<SeletorDePeriodo testid="')));
      expect(usa).not.toContain('compacto');
    }
  });
  it('ancorado ABAIXO do botão (side bottom, 4 px)', () => {
    const src = readFileSync(resolve(__dirname, 'seletor-de-periodo.tsx'), 'utf8');
    expect(src).toContain('<PopoverContent align="start" side="bottom" sideOffset={4}');
  });
});

describe('as telas com safra', () => {
  const ler = (f: string) => readFileSync(resolve(__dirname, '../..', f), 'utf8');
  it('Painel por período e CPR passam as duas atividades; a DRE pecuária segue com a dela', () => {
    for (const f of ['components/financeiro-v2/PainelPeriodoTab.tsx', 'components/financeiro-v2/ContasPagarReceberTab.tsx']) {
      const t = ler(f);
      expect(t).toContain("const AS_DUAS_ATIVIDADES: readonly AtividadeDaSafra[] = ['pecuaria', 'agricultura'];");
      const usa = t.slice(t.indexOf('<SeletorDePeriodo testid="'), t.indexOf('/>', t.indexOf('<SeletorDePeriodo testid="')));
      expect(usa).toContain('atividades={AS_DUAS_ATIVIDADES}');
    }
    expect(ler('pages/AgriDreLavouraTab.tsx')).toContain('atividades={ATIVIDADE_PEC}');
  });
});
