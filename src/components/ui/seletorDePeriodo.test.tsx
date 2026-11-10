import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { SafraDoCadastro } from '@/lib/periodo/intervaloDeDatas';

/* UI-PERIODO-01 — o componente único de período (mock aprovado 04/11 09:33): gatilho, atalhos, os dois calendários, Aplicar/Cancelar. */
const SAFRAS: SafraDoCadastro[] = [
  { id: 'p27', codigo: '26/27-Pec', atividade: 'pecuaria', de: '2026-07-01', ate: '2027-06-30' },
  { id: 'p26', codigo: '25/26-Pec', atividade: 'pecuaria', de: '2025-07-01', ate: '2026-06-30' },
];
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/hooks/useSafrasDoCliente', () => ({ useSafrasDoCliente: (_c: unknown, at: readonly string[]) => ({ safras: at.length ? SAFRAS : [], carregando: false }) }));
const { SeletorDePeriodo } = await import('./seletor-de-periodo');

const HOJE = '2026-11-04';
const abrir = () => { fireEvent.click(screen.getByTestId('seletor-de-periodo')); return screen.getByTestId('seletor-de-periodo-popup'); };

describe('SeletorDePeriodo', () => {
  it('o gatilho mostra o período ("out/2026"); o popup tem os atalhos na ordem e os dois calendários', () => {
    render(<SeletorDePeriodo hoje={HOJE} valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={vi.fn()} atividades={['pecuaria']}
      padrao={{ de: '2026-10-01', ate: '2026-10-31' }} />);
    expect(screen.getByTestId('seletor-de-periodo').textContent).toBe('out/2026');
    const pop = abrir();
    expect([...pop.querySelectorAll('[data-atalho]')].map((b) => b.textContent)).toEqual(
      ['Este mês', 'Mês passado', 'Este ano', 'Último ano', 'Esta safra', 'Última safra', 'Últimos 12 meses', 'Selecionar o ano', 'Redefinir']);
    expect(within(screen.getByTestId('seletor-de-periodo-cal-inicio')).getByText('outubro 2026')).toBeTruthy();
    expect(within(screen.getByTestId('seletor-de-periodo-cal-fim')).getByText('novembro 2026')).toBeTruthy();
  });

  it('"Esta safra" → as datas do cadastro, com o nome no gatilho, só depois de Aplicar', () => {
    const mudar = vi.fn();
    render(<SeletorDePeriodo hoje={HOJE} valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={mudar} atividades={['pecuaria']} />);
    const pop = abrir();
    fireEvent.click(within(pop).getByText('Esta safra'));
    expect(mudar).not.toHaveBeenCalled();
    expect(screen.getByTestId('seletor-de-periodo-resumo').textContent).toBe('Safra 26/27 · jul/26–jun/27 · 01/07/2026 a 30/06/2027');
    fireEvent.click(screen.getByTestId('seletor-de-periodo-aplicar'));
    expect(mudar).toHaveBeenCalledWith({ de: '2026-07-01', ate: '2027-06-30', nome: 'Safra 26/27 · jul/26–jun/27' });
  });

  it('dois cliques nos calendários = início e fim; a faixa entre eles pinta; Aplicar grava as datas livres', () => {
    const mudar = vi.fn();
    render(<SeletorDePeriodo hoje={HOJE} valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={mudar} />);
    const pop = abrir();
    fireEvent.click(within(screen.getByTestId('seletor-de-periodo-cal-inicio')).getAllByText('10')[0]);
    expect(screen.getByTestId('seletor-de-periodo-aplicar').hasAttribute('disabled')).toBe(true);
    fireEvent.click(pop.querySelector('[data-dia="2026-11-05"]') ?? pop);
    const meio = pop.querySelector('[data-dia="2026-10-20"]');
    expect(meio?.className).toContain('bg-primary/15');
    expect(pop.querySelector('[data-dia="2026-10-10"]')?.className).toContain('bg-primary');
    fireEvent.click(screen.getByTestId('seletor-de-periodo-aplicar'));
    expect(mudar).toHaveBeenCalledWith({ de: '2026-10-10', ate: '2026-11-05', nome: null });
  });

  it('o período lido da URL (sem nome) volta com o nome do atalho que ele é — no gatilho e no resumo do popup', () => {
    render(<SeletorDePeriodo hoje={HOJE} valor={{ de: '2025-07-01', ate: '2026-06-30' }} onChange={vi.fn()} atividades={['pecuaria']} />);
    expect(screen.getByTestId('seletor-de-periodo').textContent).toBe('Safra 25/26 · jul/25–jun/26');
    abrir();
    expect(screen.getByTestId('seletor-de-periodo-resumo').textContent).toBe('Safra 25/26 · jul/25–jun/26 · 01/07/2025 a 30/06/2026');
  });

  it('porMes (DRE): o clique escolhe o mês inteiro; atalhos ocultos somem; o ajuste da tela vale no atalho', () => {
    const mudar = vi.fn();
    render(<SeletorDePeriodo hoje={HOJE} porMes valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={mudar} atalhosOcultos={['este-mes', 'mes-passado']}
      ajustarAtalho={(id, i) => (id === 'este-ano' ? { de: i.de, ate: '2026-10-31' } : i)} />);
    const pop = abrir();
    expect(within(pop).queryByText('Este mês')).toBeNull();
    fireEvent.click(pop.querySelector('[data-dia="2026-10-15"]') ?? pop);
    fireEvent.click(pop.querySelector('[data-dia="2026-11-20"]') ?? pop);
    fireEvent.click(screen.getByTestId('seletor-de-periodo-aplicar'));
    expect(mudar).toHaveBeenLastCalledWith({ de: '2026-10-01', ate: '2026-11-30', nome: null });
    abrir();
    fireEvent.click(within(screen.getByTestId('seletor-de-periodo-popup')).getByText('Este ano'));
    fireEvent.click(screen.getByTestId('seletor-de-periodo-aplicar'));
    expect(mudar).toHaveBeenLastCalledWith({ de: '2026-01-01', ate: '2026-10-31', nome: null });
  });

  it('Cancelar não muda nada', () => {
    const mudar = vi.fn();
    render(<SeletorDePeriodo hoje={HOJE} valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={mudar} />);
    const pop = abrir();
    fireEvent.click(within(pop).getByText('Este ano'));
    fireEvent.click(within(pop).getByText('Cancelar'));
    expect(mudar).not.toHaveBeenCalled();
    expect(screen.getByTestId('seletor-de-periodo').textContent).toBe('out/2026');
  });

  it('"Selecionar o ano": a grade de anos; clicar num ano = 01/01 a 31/12', () => {
    const mudar = vi.fn();
    render(<SeletorDePeriodo hoje={HOJE} valor={null} onChange={mudar} anoMaisAntigo={2023} />);
    const pop = abrir();
    fireEvent.click(within(pop).getByText('Selecionar o ano'));
    expect([...pop.querySelectorAll('[data-ano]')].map((b) => b.textContent)).toEqual(['2023', '2024', '2025', '2026', '2027']);
    fireEvent.click(within(pop).getByText('2024'));
    fireEvent.click(screen.getByTestId('seletor-de-periodo-aplicar'));
    expect(mudar).toHaveBeenCalledWith({ de: '2024-01-01', ate: '2024-12-31', nome: null });
  });

  it('"Selecionar o ano" no modo datas abre POR CIMA dos calendários (eles seguem montados: a altura não muda, nada pula); "‹ Voltar às datas" volta', () => {
    render(<SeletorDePeriodo hoje={HOJE} valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={vi.fn()} />);
    const pop = abrir();
    fireEvent.click(within(pop).getByText('Selecionar o ano'));
    expect(screen.getByTestId('seletor-de-periodo-cal-inicio')).toBeTruthy();
    const grade = pop.querySelector('[data-ano="2026"]')?.closest('.absolute');
    expect(grade?.className).toContain('inset-0');
    fireEvent.click(within(pop).getByText('‹ Voltar às datas'));
    expect(pop.querySelector('[data-ano]')).toBeNull();
  });

  it('modo mês: a grade de 12 meses e só os atalhos de mês; nada de safra nem de ano', () => {
    const mudar = vi.fn();
    render(<SeletorDePeriodo modo="mes" hoje={HOJE} valor={{ de: '2026-10-01', ate: '2026-10-31' }} onChange={mudar} atividades={['pecuaria']} />);
    const pop = abrir();
    expect([...pop.querySelectorAll('[data-atalho]')].map((b) => b.textContent)).toEqual(['Este mês', 'Mês passado']);
    expect(pop.querySelectorAll('[data-mes]')).toHaveLength(12);
    fireEvent.click(pop.querySelector('[data-mes="2026-3"]') ?? pop);
    fireEvent.click(screen.getByTestId('seletor-de-periodo-aplicar'));
    expect(mudar).toHaveBeenCalledWith({ de: '2026-03-01', ate: '2026-03-31', nome: null });
  });

  it('sem período, o gatilho diz o rótulo da tela ("Escolher datas" na CPR)', () => {
    render(<SeletorDePeriodo hoje={HOJE} valor={null} onChange={vi.fn()} rotuloVazio="Escolher datas" />);
    expect(screen.getByTestId('seletor-de-periodo').textContent).toBe('Escolher datas');
  });
});

/* UI-PERIODO-01 passo 2 — as telas: a DRE pecuária (por mês, sem mês solto, "Este ano" até o mês fechado) e a CPR (os 3 botões + o
   componente no "Escolher datas") ligadas ao componente único. */
describe('as telas do passo 2 ligadas ao componente', () => {
  const ler = (f: string) => readFileSync(resolve(__dirname, '../..', f), 'utf8');
  it('DRE pecuária: SeletorDePeriodo porMes, sem os atalhos de mês, com a regra do ano corrente; o seletor antigo saiu da tela', () => {
    const dre = ler('pages/AgriDreLavouraTab.tsx');
    expect(dre).toMatch(/<SeletorDePeriodo testid="dre-pec-periodo" porMes compacto atividades=\{ATIVIDADE_PEC\} atalhosOcultos=\{SEM_MES_SOLTO\}\s+ajustarAtalho=\{anoAteMesFechado\}/);
    expect(dre).toContain("const SEM_MES_SOLTO: readonly string[] = ['este-mes', 'mes-passado'];");
    expect(dre).toContain("(id === 'este-ano' ? intervaloDoPeriodo(periodoDoAno(");
    expect(dre).not.toMatch(/<SeletorPeriodoPecuaria/);
  });
  it('CPR: os 3 botões de mês (sem o "Escolher datas" no Segmentado) e o componente com rótulo "Escolher datas"', () => {
    const cpr = ler('components/financeiro-v2/ContasPagarReceberTab.tsx');
    expect(cpr).toContain("opcoes={ATALHOS_CPR.filter((a) => a.valor !== 'datas')");
    expect(cpr).toMatch(/<SeletorDePeriodo testid="cpr-periodo" valor=\{atalho === 'datas' \? periodo : null\} onChange=\{escolherDatas\} rotuloVazio="Escolher datas"/);
    expect(cpr).not.toContain('<DatePicker');
  });
});
