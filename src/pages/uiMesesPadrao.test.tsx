/**
 * UI-MESES-PADRAO-01 (D2, Gabriel 18/11) — as réguas de meses escritas à mão viraram o `SeletorPeriodo` da casa. O estado de cada mês
 * é o MESMO que a tela já calculava, traduzido para o ponto (ok · pend · err); aqui se prende a tradução de cada tela com status.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeletorPeriodo, type TomDoMes } from '@/v2/components/SeletorPeriodo';
import { mesUnico } from '@/v2/lib/periodo';
import { tomDoMesDoValor } from './ValorRebanhoTab';
import { tomDoStatusDoPreco } from './PrecoMercadoTab';
import { tomDoStatusDaMetaPreco } from './MetaPrecoTab';

const doze = (f: (m: number) => TomDoMes | undefined): Record<number, TomDoMes> => {
  const r: Record<number, TomDoMes> = {};
  for (let m = 1; m <= 12; m++) { const t = f(m); if (t) r[m] = t; }
  return r;
};

describe('Valor do Rebanho — fechado = ok, aberto = err, comprometido = pend (o motivo no title), futuro sem estado', () => {
  it('a tradução, na ordem de antes (futuro antes de tudo; comprometido antes do fechado)', () => {
    expect(tomDoMesDoValor(false, true, 'validado')).toEqual({ estado: 'ok', title: 'Fechado' });
    expect(tomDoMesDoValor(false, false, 'sem_snapshot')).toEqual({ estado: 'err', title: 'Aberto' });
    expect(tomDoMesDoValor(false, true, 'invalidado')).toEqual({ estado: 'pend', title: 'Snapshot invalidado' });
    expect(tomDoMesDoValor(false, false, 'cadeia_quebrada')).toEqual({ estado: 'pend', title: 'Cadeia quebrada' });
    expect(tomDoMesDoValor(true, true, 'invalidado')).toBeUndefined();
  });
  it('na fita: o mês fechado tem data-estado ok, o comprometido pend com o motivo no title', () => {
    const tom = doze((m) => tomDoMesDoValor(false, m === 1, m === 2 ? 'invalidado' : 'validado'));
    render(<SeletorPeriodo modoUnico periodo={mesUnico(2025, 3)} onPeriodoChange={() => {}} tomPorMes={tom} />);
    expect(screen.getByText('Jan').getAttribute('data-estado')).toBe('ok');
    expect(screen.getByText('Fev').getAttribute('data-estado')).toBe('pend');
    expect(screen.getByText('Fev').getAttribute('title')).toBe('Snapshot invalidado');
    expect(screen.getByText('Mar').getAttribute('data-estado')).toBe('err');
    expect(screen.getByText('Mar').getAttribute('data-papel')).toBe('extremo');
  });
  it('no Início nenhum mês fica aceso (o período vai com o mês 0)', () => {
    render(<SeletorPeriodo modoUnico periodo={mesUnico(2025, 0)} onPeriodoChange={() => {}} />);
    for (const r of ['Jan', 'Jun', 'Dez']) expect(screen.getByText(r).getAttribute('data-papel')).toBe('fora');
    const f = readFileSync('src/pages/ValorRebanhoTab.tsx', 'utf8');
    expect(f).toContain('periodo={mesUnico(anoNumFiltro, verInicio ? 0 : mesNumFiltro)}');
    expect(f).not.toContain('aria-label="Ano anterior"');
  });
});

describe('Preço de Mercado e Meta de Preço — validado = ok, parcial/rascunho = pend, sem status = sem ponto', () => {
  for (const [nome, fn] of [['Preço de Mercado', tomDoStatusDoPreco], ['Meta de Preço', tomDoStatusDaMetaPreco]] satisfies [string, (s: string | undefined) => TomDoMes | undefined][]) {
    it(nome, () => {
      expect(fn('validado')).toEqual({ estado: 'ok', title: 'Validado' });
      expect(fn('parcial')).toEqual({ estado: 'pend', title: 'Parcial' });
      expect(fn('rascunho')).toEqual({ estado: 'pend', title: 'Rascunho' });
      expect(fn(undefined)).toBeUndefined();
    });
  }
  it('na fita: o validado tem data-estado ok', () => {
    const tom = doze((m) => tomDoStatusDoPreco(m === 4 ? 'validado' : m === 5 ? 'rascunho' : undefined));
    render(<SeletorPeriodo modoUnico periodo={mesUnico(2025, 6)} onPeriodoChange={() => {}} tomPorMes={tom} />);
    expect(screen.getByText('Abr').getAttribute('data-estado')).toBe('ok');
    expect(screen.getByText('Mai').getAttribute('data-estado')).toBe('pend');
    expect(screen.getByText('Jan').getAttribute('data-estado')).toBeNull();
  });
});

describe('as oito réguas à mão saíram (fonte)', () => {
  it('cada tela usa o SeletorPeriodo com modoUnico, e as classes da régua antiga não voltam', () => {
    for (const arq of [
      'src/v2/pages/V2Home.tsx', 'src/v2/pages/VisaoGeralFinanceiro.tsx', 'src/pages/ValorRebanhoTab.tsx',
      'src/pages/EvolucaoCategoriaTab.tsx', 'src/pages/PrecoMercadoTab.tsx', 'src/pages/MetaPrecoTab.tsx',
      'src/pages/ConferenciaGmdTab.tsx', 'src/components/meta-consolidacao/ConsolidacaoMesView.tsx',
    ]) {
      const f = readFileSync(arq, 'utf8');
      expect(f, arq).toMatch(/<SeletorPeriodo\s+modo="ano-mes"\s+modoUnico/);
      expect(f, arq).not.toContain('getMesButtonClass');
    }
  });
});
